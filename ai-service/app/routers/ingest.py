from fastapi import APIRouter, Depends, HTTPException

from app.auth import verify_token
from app.models import IngestRequest, IngestResponse
from app.services.chunker import chunk_text
from app.services.vector_store import upsert_chunks

router = APIRouter(
    prefix="/ingest",
    tags=["ingestion"],
)


@router.post("", response_model=IngestResponse)
async def ingest_document(
    request: IngestRequest,
    _: str = Depends(verify_token),
) -> IngestResponse:
    """Ingest a document: chunk → embed + store in Qdrant (one store call)."""
    try:
        # Step 1: Split the document into chunks
        chunks = chunk_text(request.content)

        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Document content is empty or too short to chunk",
            )

        # Step 2: Store chunks — embedding happens INSIDE add_documents()
        chunks_stored = upsert_chunks(
            document_id=request.document_id,
            user_id=request.user_id,
            chunks=chunks,
        )

        # Step 3: Return success response
        return IngestResponse(
            status="embedded",
            chunks_created=chunks_stored,
        )

    except HTTPException:
        # Let FastAPI handle HTTP errors normally (keeps the 400 status).
        # Without this, the generic handler below would convert it into
        # a misleading `{"status": "failed"}` with HTTP 200.
        raise

    except Exception as e:
        print(f"Ingestion failed: {e}")

        return IngestResponse(
            status="failed",
            chunks_created=0,
        )