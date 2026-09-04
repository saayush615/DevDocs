# AI Service — Quick Reference Notes

---

## 1. Uvicorn

An ASGI web server that runs FastAPI (and other async Python frameworks).

### How we run it
```bash
uvicorn app.main:app
# or
fastapi dev # its a shorthand of uvicorn app.main:app
```
- app.main → the Python module path (app/main.py)
- app → the FastAPI instance variable name inside that module
- This is why inside main.py you import as from routers... (no app. prefix) — Python already considers app as the top-level package.
- fastapi dev uses the same module path resolution as uvicorn app.main:app — it sets the working directory as the Python path root, so app/ becomes the top-level package. 

### Import pattern (FastAPI + routers)
```bash
# main.py — run as: uvicorn app.main:app
from fastapi import FastAPI
from routers.ingest import router as ingest_router  # NOT from app.routers

app = FastAPI()
app.include_router(ingest_router)
```

---

## 2. Pydantic
Data validation + settings management using Python type hints. Two main use cases:

### A. BaseModel — Request/Response schemas

Validates and serializes API data.
```python
from pydantic import BaseModel

class IngestRequest(BaseModel):
    document_id: str
    user_id: str
    content: str
    source_type: str

class IngestResponse(BaseModel):
    status: str
    chunks_created: int
```
- Fields with no default = `required`
- Fields with a default = `optional`
- Pydantic auto-validates types and rejects bad input with clear errors

### B. BaseSettings — Environment/config loading
Loads values from env vars or `.env` files with type validation.

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    QDRANT_URL: str = "http://localhost:6333"  # has default → optional
    GEMINI_API_KEY: str                          # no default → required
    SERVICE_TOKEN: str                           # no default → required

settings = Settings()  # instantiate once, import everywhere
```

---

# 3. Lifespan Function in fastapi

**Definition**: The lifespan function is an async context manager in FastAPI that lets you run code once at **startup** (before the app accepts requests) and once at **shutdown** (after the app stops handling requests), all in a single function using yield.

**When to use it**: Use it when you need to set up shared resources **before your app starts** and **clean them up when it stops** — for example, loading an ML model, connecting to a database, or initializing a cache.
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    print("App is starting up...")

    yield  # The app runs and handles requests here

    # --- SHUTDOWN ---
    print("App is shutting down...")


app = FastAPI(lifespan=lifespan)


@app.get("/")
async def root():
    return {"message": "Hello World"}
```

- Code before _yield_ -> Once, before the app starts accepting requests
- _yield_ -> The app is live and handling requests
- Code after _yield_ -> Once, when the app is stopping