from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.auth import verify_token
from app.models import TranscribeResponse
from app.services.transcribe import transcribe_audio

router = APIRouter(
    prefix="/transcribe",
    tags=["transcribe"],
)


@router.post("", response_model=TranscribeResponse)
async def transcribe_speech(
    audio: UploadFile = File(...),
    _: str = Depends(verify_token),
) -> TranscribeResponse:
    """Transcribe an uploaded clip. The caller sends the text on as a normal chat question."""
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="No audio uploaded")

    text = (
        await transcribe_audio(
            data,
            audio.content_type or "audio/webm",
            audio.filename or "speech.webm",
        )
    ).strip()
    if not text:
        raise HTTPException(status_code=400, detail="No speech detected")
    return TranscribeResponse(text=text)
