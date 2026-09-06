"""LLM factory — one place to construct the chat model.

Why a factory?
  - Nodes never hardcode model names/keys.
  - To switch btn models later, you edit ONLY this file.
  - `temperature=0` makes classify + grounding deterministic.
"""
from functools import lru_cache

from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings


@lru_cache(maxsize=1)
def get_llm() -> ChatGoogleGenerativeAI:
    """Build (once) and return the shared chat LLM.

    Returns:
        Configured Gemini chat model ready for .invoke() / .ainvoke().
    """
    return ChatGoogleGenerativeAI(
        model=settings.LLM_MODEL,
        google_api_key=settings.GOOGLE_API_KEY,
        temperature=settings.LLM_TEMPERATURE,
    )