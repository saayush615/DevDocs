from fastapi import FastAPI
from routers.ingest import router as ingest_router # Python sees app as the top-level package( running uvicorn app.main:app)

app = FastAPI()


@app.get("/")
def root():
    return {"message": "Welcome to devdocs ai service"}

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(ingest_router)