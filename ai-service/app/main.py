from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import ingest
from services.vector_store import init_collection

# Lifespan Function
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services when the app starts."""
    # Create Qdrant collection if it doesn't exist
    init_collection()
    print(f"AI Service started. Qdrant URL: {settings.QDRANT_URL}")
    yield
    # Shutdown: runs when the app is shutting down (add cleanup here if needed)


app = FastAPI(
    title="DevDocs AI Service",
    description="AI-powered document ingestion and query service",
    version="0.1.0",
    lifespan=lifespan
)

# Allow CORS from the Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # Node.js backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mount the ingest router
app.include_router(ingest.router)


# Health check endpoint
@app.get("/")
def root():
    return {"message": "DevDocs AI Service"}