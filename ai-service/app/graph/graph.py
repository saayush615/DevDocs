"""
  V1 graph:

  START -> input_guard -allowed-> classify_q -simple|multi_hop-> simple_rag ->
               grounding_check -grounded-> final_answer -> output_guard -> END
          |                  |                          |
          |                  '-off_topic----------------+
          '-invalid------------------------------------ fallback_response -+
                                                       ^                   |
               grounding_check -ungrounded, retry<1 -> simple_rag          |
               grounding_check -ungrounded, retry>=1 ----------------------+
"""
from langgraph.graph import END, START, StateGraph

from app.graph.node import (
    classify_q,
    fallback_response,
    final_answer,
    grounding_check,
    input_guard,
    output_guard,
    simple_rag,
)

from app.graph.state import AgentState


def route_after_input(state: AgentState) -> str:
    """input_guard: invalid -> fallback_response, else classify_q."""
    return "invalid" if state.get("blocked") else "allowed"


def route_after_classify(state: AgentState) -> str:
    """classify_q: off_topic -> fallback_response, else simple_rag."""
    return "off_topic" if state.get("route") == "off_topic" else "rag"


def route_after_grounding(state: AgentState) -> str:
    """grounding_check: grounded -> final; else retry once, then fallback."""
    if state.get("grounded"):
        return "final"
    if state.get("retry_count", 0) < 1:
        return "retry"
    return "fallback"


def build_graph():
    """Build and compile the agent graph.

    Returns:
        Compiled graph with .invoke() / .ainvoke() / .astream().
    """
    g = StateGraph(AgentState)

    g.add_node("input_guard", input_guard)
    g.add_node("classify_q", classify_q)
    g.add_node("simple_rag", simple_rag)
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
            "rag": "simple_rag",
            "off_topic": "fallback_response",
        },
    )

    g.add_edge("simple_rag", "grounding_check")

    g.add_conditional_edges(
        "grounding_check",
        route_after_grounding,
        {
            "final": "final_answer",
            "retry": "simple_rag",
            "fallback": "fallback_response",
        },
    )

    g.add_edge("fallback_response", "final_answer")
    g.add_edge("final_answer", "output_guard")
    g.add_edge("output_guard", END)

    return g.compile()