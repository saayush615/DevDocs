from fastapi import APIRouter

router = APIRouter()

@router.post("/ingest")
def ingest():
    return {"message": "ingested"}