"""
  START -> classify_q -> simple_rag -> grounding_check -> final_answer -> END
"""
from langgraph.graph import END, START, StateGraph

from app.graph.node import classify_q, final_answer, grounding_check, simple_rag
from app.graph.state import AgentState


def build_graph():
    """Build and compile the agent graph.

    Returns:
        Compiled graph with .invoke() / .ainvoke() / .astream().
    """
    g = StateGraph(AgentState)

    # Register nodes
    g.add_node("classify_q", classify_q)
    g.add_node("simple_rag", simple_rag)
    g.add_node("grounding_check", grounding_check)
    g.add_node("final_answer", final_answer)

    # Wire edges (linear MVP; stretch adds multi_hop_planner branch here)
    g.add_edge(START, "classify_q")
    g.add_edge("classify_q", "simple_rag")
    g.add_edge("simple_rag", "grounding_check")
    g.add_edge("grounding_check", "final_answer")
    g.add_edge("final_answer", END)

    return g.compile()