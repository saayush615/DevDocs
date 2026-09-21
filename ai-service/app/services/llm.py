"""LLM factory — one place to construct the chat model.

Why a factory?
  - Nodes never hardcode model names/keys.
  - To switch btn models later, you edit ONLY this file.
  - `temperature=0` makes classify + grounding deterministic.
"""
from functools import lru_cache

from langchain_groq import ChatGroq

from app.config import settings


@lru_cache(maxsize=1)
def get_llm() -> ChatGroq:
    """
    Returns:
        Configured Groq chat model ready for .invoke() / .ainvoke().
    """
    return ChatGroq(
        model=settings.LLM_MODEL,
        api_key=settings.GROQ_API_KEY,
        temperature=settings.LLM_TEMPERATURE
    )