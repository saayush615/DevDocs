from langchain_google_genai import GoogleGenerativeAIEmbeddings
from app.config import settings

doc_embeddings = GoogleGenerativeAIEmbeddings(
    model=settings.EMBEDDING_MODEL,
    google_api_key=settings.GOOGLE_API_KEY,
    output_dimensionality=settings.EMBEDDING_DIM,  # truncate to 768 to match Qdrant
)

query_embeddings = GoogleGenerativeAIEmbeddings(
    model=settings.EMBEDDING_MODEL,
    google_api_key=settings.GOOGLE_API_KEY,
    output_dimensionality=settings.EMBEDDING_DIM,
    task_type="RETRIEVAL_QUERY",
)

def embed_texts(texts: list[str]) -> list[list[float]]:
    """Convert a list of chunk string into embedding vectors."""
    return doc_embeddings.embed_documents(texts)

def embed_query(query: str) -> list[float]:
    """convert a single search query into an embedding vector."""
    return query_embeddings.embed_query(query) 