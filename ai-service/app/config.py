import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application settings loaded from enviroment variables."""

    QDRANT_URL: str = "http://localhost:6333"
    GOOGLE_API_KEY: str
    GROQ_API_KEY: str
    SERVICE_TOKEN: str
    EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIM: int = 768
    QDRANT_COLLECTION: str = "doc_chunks"

    LLM_MODEL: str
    LLM_TEMPERATURE: float = 0.0

    LANGSMITH_TRACING: bool = False
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGSMITH_API_KEY: str | None = None
    LANGSMITH_PROJECT: str = "devdocs-copilot"
    
    # Guardrails
    GUARD_INPUT_ENABLED: bool = True
    GUARD_OUTPUT_ENABLED: bool = True
    GUARD_BANNED_WORDS: str = ""

    model_config = SettingsConfigDict(env_file='app/.env')


# Singleton instance - import this to access settings
settings = Settings()

# os.environ is Python's dict of the process's environment variables; libraries like LangSmith read config from it.
# pydantic-settings reads values from the environment and .env into the `settings` object, with type validation.
# It does NOT populate os.environ, so we copy the LangSmith values there manually below.
os.environ["LANGSMITH_TRACING"] = str(settings.LANGSMITH_TRACING).lower()
os.environ["LANGSMITH_ENDPOINT"] = settings.LANGSMITH_ENDPOINT
os.environ["LANGSMITH_PROJECT"] = settings.LANGSMITH_PROJECT
if settings.LANGSMITH_API_KEY:
    os.environ["LANGSMITH_API_KEY"] = settings.LANGSMITH_API_KEY