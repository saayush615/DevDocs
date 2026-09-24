"""
  V0 graph:

  START -> input_guard -allowed-> classify_q -> simple_rag ->
               grounding_check -> final_answer -> output_guard -> END
          ^
          '--blocked-> END   (canned refusal, ZERO tokens spent)
"""
from langgraph.graph import END, START, StateGraph

from app.graph.node import (
    classify_q,
    final_answer,
    grounding_check,
    input_guard,
    output_guard,
    simple_rag,
)

from app.graph.state import AgentState


def route_blocked(state: AgentState) -> str:
    """Conditional-edge mapper for input_guard.

    LangGraph calls this with the current state dict and uses the returned
    string to pick a target edge from the mapping dict in build_graph().
    """
    return "blocked" if state.get("blocked") else "allowed"


def build_graph():
    """Build and compile the agent graph.

    Returns:
        Compiled graph with .invoke() / .ainvoke() / .astream().
    """
    g = StateGraph(AgentState)

    # Register ALL nodes (4 original + 2 new V0 guard nodes)
    g.add_node("input_guard", input_guard)
    g.add_node("classify_q", classify_q)
    g.add_node("simple_rag", simple_rag)
    g.add_node("grounding_check", grounding_check)
    g.add_node("final_answer", final_answer)
    g.add_node("output_guard", output_guard)

    # START always goes to the input guard first.
    g.add_edge(START, "input_guard")

    # input_guard branches on state["blocked"]:
    #   allowed -> classify_q (normal pipeline continues)
    #   blocked -> END        (answer already pre-filled, zero tokens spent)
    g.add_conditional_edges(
        "input_guard",
        route_blocked,  # the mapper above -> returns "allowed" or "blocked"
        {
            "allowed": "classify_q",
            "blocked": END,
        },
    )

    # Linear pipeline after the input guard (unchanged MVP chain + output guard)
    g.add_edge("classify_q", "simple_rag")
    g.add_edge("simple_rag", "grounding_check")
    g.add_edge("grounding_check", "final_answer")
    g.add_edge("final_answer", "output_guard")
    g.add_edge("output_guard", END)

    return g.compile()