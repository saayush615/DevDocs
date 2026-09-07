"""POST /query (JSON) + POST /query/stream (SSE).

Auth: every request needs `Authorization: Bearer <SERVICE_TOKEN>` (verify_token).
Flow: Pydantic validates -> graph.ainvoke() runs 4 nodes -> return answer+citations+route.
Streaming: we run the graph once, then stream the final answer word-by-word so
Node can proxy SSE token-by-token per PRD §7. True token streaming via
graph.astream() is the stretch upgrade.
"""
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.auth import verify_token
from app.graph.graph import build_graph
from app.models import Citation, QueryRequest, QueryResponse

router = APIRouter(prefix="/query", tags=["query"])

# Compile once at import — NOT per request (saves ~ms + avoids re-registering nodes).
_graph = build_graph()


def _to_response(result: dict) -> QueryResponse:
    """Convert raw graph state dict into validated API response."""
    return QueryResponse(
        answer=result.get("answer", ""),
        citations=[Citation(**c) for c in result.get("citations", [])],
        route_taken=result.get("route", "simple"),  # "simple" | "multi_hop"
    )


@router.post("", response_model=QueryResponse)
async def query_json(request: QueryRequest, _: str = Depends(verify_token)) -> QueryResponse:
    """Non-streaming query — easiest to test with curl + used by Node fallback.

    Args:
        request: validated {conversation_id, user_id, question, history, top_k}
    Returns:
        {answer, citations, route_taken}
    """
    result = await _graph.ainvoke({
        "question": request.question,
        "user_id": request.user_id,  # <-- isolation key, flows into Qdrant filter
        "history": [m.model_dump() for m in request.history],
        "top_k": request.top_k,
    })
    return _to_response(result)


@router.post("/stream")
async def query_stream(request: QueryRequest, _: str = Depends(verify_token)):
    """SSE stream: `data: {"token": "word "}` events, then `data: {"done": true, ...}`.

    Node proxies this to the browser EventSource. Frontend appends tokens.
    """
    result = await _graph.ainvoke({
        "question": request.question,
        "user_id": request.user_id,
        "history": [m.model_dump() for m in request.history],
        "top_k": request.top_k,
    })
    response = _to_response(result)

    async def event_generator():
        # 1. Stream answer in word chunks (simple + reliable for learning)
        for word in response.answer.split(" "):
            yield f"data: {json.dumps({'token': word + ' '})}\n\n"
        # 2. Final event carries citations + route (frontend needs these once)
        yield f"data: {json.dumps({'done': True, 'citations': [c.model_dump() for c in response.citations], 'route_taken': response.route_taken})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")