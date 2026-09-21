"""LLM factory — one place to construct the chat model.

Why a factory?
  - Nodes never hardcode model names/keys.
  - To switch btn models later, you edit ONLY this file.
  - `temperature=0` makes classify + grounding deterministic.

  Notes to remember:
  1. @lru_cache(maxsize=1) -> builds the ChatGroq client once and reuses it.
     Without it, every call creates a new client. maxsize>1 is pointless here
     since get_llm() takes no arguments (only one cache key exists).
  2. temperature (0 to 2) -> randomness of output; 0 = deterministic/focused,
     higher = more creative. We use 0 for classify + grounding.
  3. Return type ChatGroq is the client, not the reply; call
     .invoke() on it to get the actual response (AIMessage).
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