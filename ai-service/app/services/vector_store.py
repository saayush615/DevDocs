from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    VectorParams,
)

from app.config import settings
from app.services.embeddings import doc_embeddings

client = QdrantClient(url=settings.QDRANT_URL)

store = QdrantVectorStore(
    client=client,
    collection_name=settings.QDRANT_COLLECTION,
    embedding=doc_embeddings,
)


def init_collection() -> None:
    """ 
    Create the Qdrant collection (and user_id index) if missing.

    Called once at app startup. Besides the vector config, we also create
    a keyword payload index on `user_id` — without it, every filtered
    search does a full scan, which gets slow as data grows.
    """
    if not client.collection_exists(settings.QDRANT_COLLECTION):
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config=VectorParams(
                size=settings.EMBEDDING_DIM,  # 768, must match embedding output
                distance=Distance.COSINE,  # cosine similarity for search
            ),
        )
        # Keyword index on user_id makes `must: user_id == X` filters fast
        client.create_payload_index(
            collection_name=settings.QDRANT_COLLECTION,
            field_name="user_id",
            field_schema="keyword",
        )
        print(f"Created collection: {settings.QDRANT_COLLECTION}")


def upsert_chunks(
    document_id: str,
    user_id: str,
    chunks: list[str],
) -> int:
    """
    Store document chunks in Qdrant (embedding done internally by the store).

    NOTE: signature changed — no more `embeddings` param. The store embeds
    each Document via doc_embeddings.embed_documents() inside add_documents().

    Args:
        document_id: ID of the document (from backend database)
        user_id: ID of the user who owns this document
        chunks: List of text chunks from chunk_text()

    Returns:
        Number of chunks stored
    """
    # Wrap each chunk in a LangChain Document. page_content is the searchable
    # text; metadata dict becomes the Qdrant point payload automatically.
    documents = [
        Document(
            page_content=chunk,
            metadata={
                "document_id": document_id,
                "user_id": user_id,
                "chunk_index": i,
                "content_preview": chunk[:500],  # first 500 chars for citations
            },
        )
        for i, chunk in enumerate(chunks)
    ]

    store.add_documents(documents=documents)

    return len(documents)


def search_chunks(
    question: str,
    user_id: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Search for similar chunks, filtered by user_id.

    NOTE: signature changed — takes the raw `question` string, not a
    precomputed vector. The store embeds it internally, then runs a
    filtered cosine-similarity search.

    Args:
        question: The user's question in plain text
        user_id: Only return chunks belonging to this user (isolation!)
        top_k: Number of results to return (default 5)

    Returns:
        List of matching chunks with scores and metadata
    """
    # CRITICAL: Filter by user_id for data isolation (PRD §3.4).
    # Same Filter/FieldCondition/MatchValue classes as raw qdrant-client —
    # langchain-qdrant passes `filter` straight through to Qdrant.
    user_filter = Filter(
        must=[
            FieldCondition(
                key="user_id",
                match=MatchValue(value=user_id),
            )
        ]
    )

    # Returns list[(Document, score)] — Document.metadata holds our payload,
    # Document.id holds the Qdrant point UUID (set automatically on read).
    hits = store.similarity_search_with_score(
        query=question,
        k=top_k,
        filter=user_filter,
    )

    return [
        {
            "id": str(doc.id) if doc.id else "",
            "score": float(score),
            "document_id": doc.metadata["document_id"],
            "chunk_index": doc.metadata["chunk_index"],
            "content_preview": doc.metadata["content_preview"],
        }
        for doc, score in hits
    ]