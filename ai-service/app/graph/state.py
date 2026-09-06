"""LangGraph state = the 'backpack' every node reads and writes.

Think of the graph as an assembly line:
  classify_q puts `route` in the backpack,
  simple_rag puts `chunks` + `draft_answer` in,
  grounding_check puts `grounded` in,
  final_answer reads `grounded` and decides the final `answer`.

TypedDict (not BaseModel) is LangGraph convention — keys merge patch-style.
"""
from typing import TypedDict


class AgentState(TypedDict, total=False):
    """Mutable state threaded through all graph nodes."""

    question: str          # user's current question
    user_id: str           # for Qdrant user_id filter (isolation!)
    history: list[dict]    # [{"role":..., "content":...}] prior turns
    top_k: int             # retrieval depth

    route: str             # "simple" | "multi_hop" — set by classify_q
    chunks: list[dict]     # raw hits from search_chunks()
    draft_answer: str      # LLM answer BEFORE grounding check
    grounded: bool         # grounding_check verdict
    answer: str            # final user-facing text
    citations: list[dict]  # [{document_id, chunk_index, snippet}]