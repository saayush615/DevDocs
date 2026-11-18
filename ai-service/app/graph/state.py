"""LangGraph state = the 'backpack' every node reads and writes.

Think of the graph as an assembly line:
  classify_q puts `route` in the backpack,
  simple_rag (or multi-hop synthesize) puts `chunks` + `draft_answer` in,
  grounding_check puts `grounded` in,
  final_answer reads `grounded` and decides the final `answer`.

TypedDict (not BaseModel) is LangGraph convention — keys merge patch-style.
total=False: every key is optional, since nodes fill the state in gradually.

`hop_hits` uses operator.add so parallel retrieve_each nodes append.
`chunks` stays a plain list so simple_rag / synthesize overwrite it.
The planner clears hop_hits with Overwrite before each pass.
"""
import operator
from typing import Annotated, TypedDict


class AgentState(TypedDict, total=False):
    """Mutable state threaded through all graph nodes."""

    question: str          # user's current question
    user_id: str           # for Qdrant user_id filter (isolation!)
    history: list[dict]    # [{"role":..., "content":...}] prior turns
    top_k: int             # retrieval depth per query
    retry_count: int       # grounding retries; seed 0, bump on re-entry of the rag branch

    blocked: bool          # True if input_guard rejected the question
    route: str             # "simple" | "multi_hop" | "off_topic" | "invalid_input"
    sub_queries: list[str] # planner output, 1–4 search strings
    sub_query: str         # one Send payload for retrieve_each; not written back
    hop_hits: Annotated[list[dict], operator.add]  # fan-in from retrieve_each
    chunks: list[dict]     # deduped hits used for the draft and grounding
    draft_answer: str      # LLM answer BEFORE grounding check
    grounded: bool         # grounding_check verdict
    answer: str            # final user-facing text
    citations: list[dict]  # [{document_id, chunk_index, snippet, page?}]