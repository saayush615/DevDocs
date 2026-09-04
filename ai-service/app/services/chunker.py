from langchain_text_splitters import RecursiveCharacterTextSplitter

def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200
) -> list[str]:

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, 
        chunk_overlap=chunk_overlap
    )

    return text_splitter.split_text(text)
