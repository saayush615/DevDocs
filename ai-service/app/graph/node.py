import json
import re

from langgraph.types import Overwrite

from app.graph.state import AgentState
from app.services.llm import get_llm
from app.services.vector_store import search_chunks
from app.services.guards import run_input_guard, run_output_guard

MAX_SUBQUERIES = 4
MAX_SYNTH_CHUNKS = 12

# Static refusal returned when the INPUT GUARD blocks a question (prompt
# injection / profanity). Deliberately short and generic — we never echo
# the blocked text back to the user.
BLOCKED_ANSWER = "I can't process this request."

OUTPUT_BLOCKED_ANSWER = "I can't share that response — it may contain restricted or sensitive information."

# Exact fallback — never guess, say this instead.
FALLBACK_ANSWER = "I don't have enough information in the available documents."

OFF_TOPIC_ANSWER = "I can only answer questions about your uploaded documents."

# Context labels look like [docId:5 p.2]. The model copies the ones it used;
# they are removed from the text the user sees.
_CITE_RE = re.compile(r"\[([\w-]+):(\d+)(?:\s+p\.\d+)?\]")


def _chunk_text(chunk: dict) -> str:
    """Full chunk text. Fall back to the citation preview for older hits."""
    return chunk.get("content") or chunk.get("content_preview") or ""


def _context_line(chunk: dict) -> str:
    page = chunk.get("page")
    loc = f" p.{page}" if page is not None else ""
    return f"[{chunk['document_id']}:{chunk['chunk_index']}{loc}] {_chunk_text(chunk)}"


def _citation(chunk: dict) -> dict:
    citation = {
        "document_id": chunk["document_id"],
        "chunk_index": chunk["chunk_index"],
        "snippet": chunk["content_preview"],
    }
    if chunk.get("page") is not None:
        citation["page"] = int(chunk["page"])
    return citation


def _extract_text(content) -> str:
    """Flash returns str OR [ {'type':'text','text':...} | obj with .text ]."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for b in content:
            if isinstance(b, str):
                parts.append(b)
            elif isinstance(b, dict):
                parts.append(str(b.get("text", "")))
            else:
                parts.append(str(getattr(b, "text", "") or ""))
        return "".join(parts)
    return str(content)


def _retry_count(state: AgentState) -> int:
    """Bump only when this branch is re-entered after a failed grounding check.

    The conditional edge reads state before the next node runs, so the bump
    has to happen here — not inside grounding_check.
    """
    retry_count = state.get("retry_count", 0)
    if state.get("grounded") is False:
        retry_count += 1
    return retry_count


def _parse_sub_queries(raw: str, question: str) -> list[str]:
    """JSON array of 1–4 search strings. Any failure falls back to the question."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except Exception:
        return [question]
    if not isinstance(data, list):
        return [question]
    seen: set[str] = set()
    queries: list[str] = []
    for item in data:
        if not isinstance(item, str):
            continue
        query = item.strip()
        if not query or query in seen:
            continue
        seen.add(query)
        queries.append(query)
        if len(queries) == MAX_SUBQUERIES:
            break
    return queries or [question]


def _finish_draft(draft: str, chunks: list[dict]) -> tuple[str, list[dict]]:
    """Drop context labels from the prose and keep citations for those labels only."""
    keys: list[tuple[str, int]] = []
    seen: set[tuple[str, int]] = set()
    for match in _CITE_RE.finditer(draft):
        key = (match.group(1), int(match.group(2)))
        if key not in seen:
            seen.add(key)
            keys.append(key)
    cleaned = _CITE_RE.sub("", draft)
    cleaned = re.sub(r"[ \t]+([.,;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r" +(\n)", r"\1", cleaned).strip()
    if not cleaned or FALLBACK_ANSWER in cleaned:
        return cleaned, []
    by_key = {(str(c["document_id"]), int(c["chunk_index"])): c for c in chunks}
    citations = [_citation(by_key[key]) for key in keys if key in by_key]
    return cleaned, citations


def _draft_from_chunks(question: str, history: list[dict], chunks: list[dict]) -> tuple[str, list[dict]]:
    """One draft. Same fail-closed contract for simple and multi-hop.

    The model appends the context labels it used. Those labels are stripped
    from the answer and become the citation list.
    """
    context = "\n\n".join(_context_line(c) for c in chunks)
    history_txt = "\n".join(f"{m['role']}: {m['content']}" for m in history)
    llm = get_llm()
    prompt = (
        "You answer ONLY from the CONTEXT below. If the answer is not in the context, "
        f"reply exactly: {FALLBACK_ANSWER}\n"
        "Write the answer in plain sentences. After the answer, copy only the context "
        "labels you actually used, exactly as they appear at the start of those blocks, "
        "for example [doc_id:5 p.2]. Do not include a label you did not use.\n\n"
        f"Conversation so far:\n{history_txt}\n\n"
        f"CONTEXT:\n{context}\n\n"
        f"Question: {question}\n"
        "Answer:"
    )
    raw = _extract_text(llm.invoke(prompt).content).strip()
    return _finish_draft(raw, chunks)


def _dedupe_chunks(hits: list[dict]) -> list[dict]:
    """Keep the higher-scoring copy of each (document_id, chunk_index)."""
    best: dict[tuple[str, int], dict] = {}
    for hit in hits:
        key = (str(hit.get("document_id", "")), int(hit.get("chunk_index", -1)))
        prev = best.get(key)
        if prev is None or float(hit.get("score", 0)) > float(prev.get("score", 0)):
            best[key] = hit
    ranked = sorted(best.values(), key=lambda c: float(c.get("score", 0)), reverse=True)
    return ranked[:MAX_SYNTH_CHUNKS]


def classify_q(state: AgentState) -> dict:
    """Route: simple vs multi_hop vs off_topic (chitchat / not about docs).

    How it works:
      - Tiny LLM call with strict output contract: reply ONLY one word.
      - Keyword fallback if LLM fails (graph must never crash) — default simple.
    """
    question = state["question"]
    llm = get_llm()

    prompt = (
        "You are a query router. Reply with ONLY one word: SIMPLE, MULTI_HOP, or OFF_TOPIC.\n"
        "OFF_TOPIC = chitchat, weather, jokes, or anything clearly not about the user's documents.\n"
        "MULTI_HOP = comparison, multi-part, 'compare X and Y', 'summarize across docs', "
        "needs 2+ distinct facts combined.\n"
        "SIMPLE = a single-fact lookup in the user's documents.\n"
        f"Question: {question}\nAnswer:"
    )
    try:
        raw = _extract_text(llm.invoke(prompt).content).strip().upper()
        if "OFF" in raw or "TOPIC" in raw:
            route = "off_topic"
        elif "MULTI" in raw:
            route = "multi_hop"
        else:
            route = "simple"
    except Exception:
        # Safe default: treat as simple so retrieval still runs.
        route = "simple"

    return {"route": route}


def simple_rag(state: AgentState) -> dict:
    """Retrieve top-k chunks (USER-FILTERED) then draft a cited answer.

    Steps:
      1. Qdrant search — isolation via user_id filter inside search_chunks().
      2. Build context block like [doc_id:chunk_2] snippet...
      3. Ask LLM: 'answer ONLY from context, else say you don't know'.

    Multi-hop does not enter this node. On re-entry after a failed
    grounding_check (`grounded` is False), bump retry_count here.
    """
    question = state["question"]
    user_id = state["user_id"]
    top_k = state.get("top_k", 5)
    history = state.get("history", [])[-4:]  # last 4 turns = enough context, small prompt
    retry_count = _retry_count(state)

    # --- 1. Retrieve — CRITICAL: user_id filter prevents cross-user leaks ---
    chunks = search_chunks(question=question, user_id=user_id, top_k=top_k)

    # --- 2. No evidence? Don't call LLM, return empty draft (grounding will fail) ---
    if not chunks:
        return {
            "chunks": [],
            "draft_answer": "",
            "citations": [],
            "retry_count": retry_count,
        }

    draft, citations = _draft_from_chunks(question, history, chunks)
    return {
        "chunks": chunks,
        "draft_answer": draft,
        "citations": citations,
        "retry_count": retry_count,
    }


def multi_hop_planner(state: AgentState) -> dict:
    """Split a comparison or multi-part question into at most four searches.

    Clears hop_hits so a grounding retry does not keep the previous pass.
    Bumps retry_count on re-entry, same as simple_rag. Parallel retrieve
    nodes must not bump it.
    """
    question = state["question"]
    retry_count = _retry_count(state)
    llm = get_llm()
    prompt = (
        "Split the question into 1 to 4 short search queries for a document index. "
        "Reply with ONLY a JSON array of strings. No markdown.\n"
        "Each string should retrieve one distinct fact: one side of a comparison, "
        "one part of a multi-part question, or one document.\n"
        f"Question: {question}\nJSON:"
    )
    try:
        raw = _extract_text(llm.invoke(prompt).content)
        sub_queries = _parse_sub_queries(raw, question)
    except Exception:
        sub_queries = [question]
    return {
        "sub_queries": sub_queries,
        "hop_hits": Overwrite(value=[]),
        "retry_count": retry_count,
    }


def retrieve_each(state: AgentState) -> dict:
    """One fan-out hop. Send supplies sub_query, user_id, and top_k.

    search_chunks always filters by user_id. Return only hop_hits so parallel
    writes append instead of clobbering each other.
    """
    hits = search_chunks(
        question=state["sub_query"],
        user_id=state["user_id"],
        top_k=state.get("top_k", 5),
    )
    return {"hop_hits": hits}


def synthesize(state: AgentState) -> dict:
    """Dedupe fan-in hits and draft one cited answer for grounding_check."""
    question = state["question"]
    history = state.get("history", [])[-4:]
    chunks = _dedupe_chunks(state.get("hop_hits", []))
    if not chunks:
        return {
            "chunks": [],
            "draft_answer": "",
            "citations": [],
        }
    draft, citations = _draft_from_chunks(question, history, chunks)
    return {
        "chunks": chunks,
        "draft_answer": draft,
        "citations": citations,
    }


def grounding_check(state: AgentState) -> dict:
    """Verify draft is SUPPORTED by retrieved chunks. Mandatory per AGENTS.md.

    Second LLM call acts as judge. If verdict is NOT grounded (or no chunks),
    the graph retries the same branch once, then fallback_response.
    """
    draft = state.get("draft_answer", "")
    chunks = state.get("chunks", [])
    question = state["question"]

    # Fast path: nothing retrieved or empty draft = ungrounded, skip LLM call.
    if not chunks or not draft or FALLBACK_ANSWER in draft:
        return {"grounded": False if not chunks else True}

    context = "\n\n".join(_chunk_text(c) for c in chunks)
    llm = get_llm()
    prompt = (
        "You are a fact checker. Reply ONLY: GROUNDED or NOT_GROUNDED.\n"
        "GROUNDED = every claim in ANSWER is supported by CONTEXT.\n"
        "NOT_GROUNDED = any claim needs outside knowledge.\n\n"
        f"Question: {question}\nCONTEXT:\n{context}\n\nANSWER:\n{draft}\nVerdict:"
    )
    try:
        verdict = _extract_text(llm.invoke(prompt).content).strip().upper()
        grounded = "NOT_GROUNDED" not in verdict and "GROUNDED" in verdict
    except Exception:
        grounded = False  # fail closed: when in doubt, admit ignorance

    return {"grounded": grounded}


def input_guard(state: AgentState) -> dict:
    """Screen the user's question BEFORE any LLM call / token spend.

    Separates invalid vs allowed only. Does not pre-fill the user-facing
    answer — fallback_response owns canned text. classify_q / simple_rag
    never run on invalid input => ZERO tokens spent.
    """
    question = state["question"]

    if not run_input_guard(question):
        return {
            "blocked": True,
            "route": "invalid_input",
        }

    return {"blocked": False}


def fallback_response(state: AgentState) -> dict:
    """Canned answer for invalid input, off-topic, or exhausted grounding. No LLM."""
    route = state.get("route")
    if route == "invalid_input":
        return {"answer": BLOCKED_ANSWER, "citations": []}
    if route == "off_topic":
        return {"answer": OFF_TOPIC_ANSWER, "citations": []}
    return {"answer": FALLBACK_ANSWER}


def output_guard(state: AgentState) -> dict:
    """Screen the final answer after grounding, before it is streamed.

    Reads whatever `final_answer` produced and runs ProfanityFree + BanList on
    it. On failure we swap the answer — all-or-nothing, never a partial redact.
    Does not change `route` / `blocked`: route_taken "blocked" is input-guard only.
    """
    answer = state.get("answer", "")  # filled by final_answer

    if not run_output_guard(answer):
        return {
            "answer": OUTPUT_BLOCKED_ANSWER,
            "citations": [],
        }

    return {}


def final_answer(state: AgentState) -> dict:
    """Pick the user-facing answer: pass through canned text, else draft vs fallback."""
    if state.get("answer"):
        return {}
    if state.get("grounded") and state.get("draft_answer"):
        return {"answer": state["draft_answer"]}
    return {"answer": FALLBACK_ANSWER, "grounded": False}
