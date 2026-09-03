from pydantic import BaseModel

class IngestRequest(BaseModel):
    """What nodejs backend sends us when uploading a docs."""
    document_id: str
    user_id: str        # ID of the user who owns this document
    content: str        # The full text content of the document
    source_type: str    # Type: "markdown", "text", etc.

class IngestRequest(BaseModel):
    """What we send after successful ingestion."""
    status: str          #success or fail
    chunks_created: int  #Number of chunks created