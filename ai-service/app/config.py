from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application settings loaded from enviroment variables."""

    QDRANT_URL: str = "http://localhost:6333"
    GOOGLE_API_KEY: str
    SERVICE_TOKEN: str
    EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIM: int = 768
    QDRANT_COLLECTION: str = "doc_chunks"

    model_config = SettingsConfigDict(env_file='app/.env')


# Singleton instance - import this to access settings
settings = Settings()