from typing import Literal
from pydantic import BaseModel, Field

class IngestRequest(BaseModel):
    """What nodejs backend sends us when uploading a docs."""
    document_id: str
    user_id: str        # ID of the user who owns this document
    content: str        # The full text content of the document
    source_type: str    # Type: "markdown", "text", etc.

class IngestResponse(BaseModel):
    """What we send after successful ingestion."""
    status: str          #success or fail
    chunks_created: int  #Number of chunks created

# for Query request history
class ChatMessage(BaseModel):
    """One turn of prior conversation, sent by Node so the agent has context."""
    role: Literal["user", "assistant"]
    content: str


class QueryRequest(BaseModel):
    """What Node sends us for every chat message."""
    conversation_id: str = Field(description="Postgres conversation id (for logging/audit)")
    user_id: str = Field(description="Owner id — used as Qdrant filter, never skip this!")
    question: str = Field(min_length=1, description="The user's latest question")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Optional prior turns, oldest first. Used only as LLM context.",
    )
    top_k: int = Field(default=5, ge=1, le=20, description="How many chunks to retrieve")

# for query response citations
class Citation(BaseModel):
    """One grounding source for the answer."""
    document_id: str
    chunk_index: int
    snippet: str  # first ~500 chars of the chunk (content_preview)


class QueryResponse(BaseModel):
    """What we always return — JSON endpoint + final SSE event share this shape."""
    answer: str
    citations: list[Citation]
    route_taken: Literal["simple", "multi_hop"]