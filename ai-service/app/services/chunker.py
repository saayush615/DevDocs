from typing import TypedDict

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.models import PageSection


class TextChunk(TypedDict):
    text: str
    page: int | None


def _splitter(chunk_size: int, chunk_overlap: int) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[TextChunk]:
    parts = _splitter(chunk_size, chunk_overlap).split_text(text)
    return [{"text": part, "page": None} for part in parts if part.strip()]


def chunk_sections(
    sections: list[PageSection],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[TextChunk]:
    """Split each page on its own so a chunk never crosses a page boundary."""
    docs = [
        Document(page_content=section.text, metadata={"page": section.page})
        for section in sections
        if section.text.strip()
    ]
    parts = _splitter(chunk_size, chunk_overlap).split_documents(docs)
    chunks: list[TextChunk] = []
    for part in parts:
        text = part.page_content.strip()
        if not text:
            continue
        page = part.metadata.get("page")
        chunks.append({"text": text, "page": int(page) if page is not None else None})
    return chunks
