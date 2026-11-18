"""
  V3 graph:

  START -> input_guard -allowed-> classify_q
          |                         |-off_topic-> fallback_response
          |                         |-simple----> simple_rag ----+
          |                         '-multi_hop-> planner        |
          '-invalid-> fallback_response            | Send <=4    |
                                                   v             v
                                            retrieve_each -> synthesize
                                                               |
               grounding_check <-------------------------------+
                 grounded -----------------> final_answer -> output_guard -> END
                 ungrounded, retry<1, simple    -> simple_rag
                 ungrounded, retry<1, multi_hop -> planner
                 ungrounded, retry>=1           -> fallback_response -> final_answer
"""
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from app.graph.node import (
    MAX_SUBQUERIES,
    classify_q,
    fallback_response,
    final_answer,
    grounding_check,
    input_guard,
    multi_hop_planner,
    output_guard,
    retrieve_each,
    simple_rag,
    synthesize,
)

from app.graph.state import AgentState


def route_after_input(state: AgentState) -> str:
    """input_guard: invalid -> fallback_response, else classify_q."""
    return "invalid" if state.get("blocked") else "allowed"


def route_after_classify(state: AgentState) -> str:
    """classify_q: off_topic, multi_hop, or simple."""
    route = state.get("route")
    if route == "off_topic":
        return "off_topic"
    if route == "multi_hop":
        return "multi_hop"
    return "simple"


def fan_out_retrieval(state: AgentState) -> list[Send]:
    """One Send per sub-query, capped at four. Each hop keeps the user filter."""
    raw = state.get("sub_queries") or [state["question"]]
    queries = [q.strip() for q in raw if isinstance(q, str) and q.strip()][:MAX_SUBQUERIES]
    if not queries:
        queries = [state["question"]]
    top_k = state.get("top_k", 5)
    user_id = state["user_id"]
    return [
        Send(
            "retrieve_each",
            {"sub_query": query, "user_id": user_id, "top_k": top_k},
        )
        for query in queries
    ]


def route_after_grounding(state: AgentState) -> str:
    """Grounded -> final. One retry on the same branch, then fallback."""
    if state.get("grounded"):
        return "final"
    if state.get("retry_count", 0) >= 1:
        return "fallback"
    if state.get("route") == "multi_hop":
        return "retry_multi"
    return "retry_simple"


def build_graph():
    """Build and compile the agent graph.

    Returns:
        Compiled graph with .invoke() / .ainvoke() / .astream().
    """
    g = StateGraph(AgentState)

    g.add_node("input_guard", input_guard)
    g.add_node("classify_q", classify_q)
    g.add_node("simple_rag", simple_rag)
    g.add_node("multi_hop_planner", multi_hop_planner)
    g.add_node("retrieve_each", retrieve_each)
    g.add_node("synthesize", synthesize)
    g.add_node("grounding_check", grounding_check)
    g.add_node("fallback_response", fallback_response)
    g.add_node("final_answer", final_answer)
    g.add_node("output_guard", output_guard)

    g.add_edge(START, "input_guard")

    g.add_conditional_edges(
        "input_guard",
        route_after_input,
        {
            "allowed": "classify_q",
            "invalid": "fallback_response",
        },
    )

    g.add_conditional_edges(
        "classify_q",
        route_after_classify,
        {
            "simple": "simple_rag",
            "multi_hop": "multi_hop_planner",
            "off_topic": "fallback_response",
        },
    )

    g.add_edge("simple_rag", "grounding_check")

    g.add_conditional_edges(
        "multi_hop_planner",
        fan_out_retrieval,
        ["retrieve_each"],
    )
    g.add_edge("retrieve_each", "synthesize")
    g.add_edge("synthesize", "grounding_check")

    g.add_conditional_edges(
        "grounding_check",
        route_after_grounding,
        {
            "final": "final_answer",
            "retry_simple": "simple_rag",
            "retry_multi": "multi_hop_planner",
            "fallback": "fallback_response",
        },
    )

    g.add_edge("fallback_response", "final_answer")
    g.add_edge("final_answer", "output_guard")
    g.add_edge("output_guard", END)

    return g.compile()