from app.graph.state import AgentState
from app.services.llm import get_llm
from app.services.vector_store import search_chunks

# Exact fallback — never guess, say this instead.
FALLBACK_ANSWER = "I don't have enough information in the available documents."


def classify_q(state: AgentState) -> dict:
    """Decide routing: 'simple' (one lookup) vs 'multi_hop' (compare/synthesize).

    How it works:
      - Tiny LLM call with strict output contract: reply ONLY one word.
      - Keyword fallback if LLM fails (graph must never crash).
    """
    question = state["question"]
    llm = get_llm()

    prompt = (
        "You are a query router. Reply with ONLY one word: SIMPLE or MULTI_HOP.\n"
        "MULTI_HOP = comparison, multi-part, 'compare X and Y', 'summarize across docs', "
        "needs 2+ distinct facts combined.\n"
        "SIMPLE = everything else (single fact lookup).\n"
        f"Question: {question}\nAnswer:"
    )
    try:
        raw = llm.invoke(prompt).content.strip().upper()
        route = "multi_hop" if "MULTI" in raw else "simple"
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
    """
    question = state["question"]
    user_id = state["user_id"]
    top_k = state.get("top_k", 5)
    history = state.get("history", [])[-4:]  # last 4 turns = enough context, small prompt
    route = state.get("route", "simple")

    # --- 1. Retrieve — CRITICAL: user_id filter prevents cross-user leaks ---
    # For MVP, multi_hop reuses the same retrieval but asks for deeper synthesis.
    # (Stretch: split into sub-queries per PRD §4 stretch graph.)
    k = top_k * 2 if route == "multi_hop" else top_k
    chunks = search_chunks(question=question, user_id=user_id, top_k=k)

    # --- 2. No evidence? Don't call LLM, return empty draft (grounding will fail) ---
    if not chunks:
        return {"chunks": [], "draft_answer": "", "citations": []}

    context = "\n\n".join(
        f"[{c['document_id']}:{c['chunk_index']}] {c['content_preview']}"
        for c in chunks
    )
    history_txt = "\n".join(f"{m['role']}: {m['content']}" for m in history)

    # --- 3. Draft answer ---
    llm = get_llm()
    prompt = (
        "You answer ONLY from the CONTEXT below. If the answer is not in the context, "
        f"reply exactly: {FALLBACK_ANSWER}\n\n"
        f"Conversation so far:\n{history_txt}\n\n"
        f"CONTEXT:\n{context}\n\n"
        f"Question: {question}\n"
        "Answer (cite sources inline like [doc_id:chunk_index]):"
    )
    draft = llm.invoke(prompt).content.strip()

    citations = [
        {
            "document_id": c["document_id"],
            "chunk_index": c["chunk_index"],
            "snippet": c["content_preview"],
        }
        for c in chunks
    ]
    return {"chunks": chunks, "draft_answer": draft, "citations": citations}


def grounding_check(state: AgentState) -> dict:
    """Verify draft is SUPPORTED by retrieved chunks. Mandatory per AGENTS.md.

    Second LLM call acts as judge. If verdict is NOT grounded (or no chunks),
    downstream final_answer will swap in the fallback sentence.
    """
    draft = state.get("draft_answer", "")
    chunks = state.get("chunks", [])
    question = state["question"]

    # Fast path: nothing retrieved or empty draft = ungrounded, skip LLM call.
    if not chunks or not draft or FALLBACK_ANSWER in draft:
        return {"grounded": False if not chunks else True}

    context = "\n\n".join(c["content_preview"] for c in chunks)
    llm = get_llm()
    prompt = (
        "You are a fact checker. Reply ONLY: GROUNDED or NOT_GROUNDED.\n"
        "GROUNDED = every claim in ANSWER is supported by CONTEXT.\n"
        "NOT_GROUNDED = any claim needs outside knowledge.\n\n"
        f"Question: {question}\nCONTEXT:\n{context}\n\nANSWER:\n{draft}\nVerdict:"
    )
    try:
        verdict = llm.invoke(prompt).content.strip().upper()
        grounded = "NOT_GROUNDED" not in verdict and "GROUNDED" in verdict
    except Exception:
        grounded = False  # fail closed: when in doubt, admit ignorance

    return {"grounded": grounded}


def final_answer(state: AgentState) -> dict:
    """Pick the user-facing answer: draft if grounded, else fallback."""
    if state.get("grounded") and state.get("draft_answer"):
        return {"answer": state["draft_answer"]}
    return {"answer": FALLBACK_ANSWER, "grounded": False}