import httpx
from fastapi import HTTPException

from app.config import settings

GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


async def transcribe_audio(data: bytes, content_type: str, filename: str) -> str:
    """Send a short audio clip to Groq Whisper and return the transcript."""
    mime = content_type.split(";", 1)[0].strip() or "application/octet-stream"
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_TRANSCRIPTIONS_URL,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            files={"file": (filename, data, mime)},
            data={"model": settings.WHISPER_MODEL, "response_format": "json"},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Transcription failed")
    payload = response.json()
    text = payload.get("text") if isinstance(payload, dict) else ""
    if not isinstance(text, str):
        return ""
    return text
