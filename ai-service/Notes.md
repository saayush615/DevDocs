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

---

# 4. Dependency Injection & Exceptions

## `Depends()`

Runs a function before the endpoint and injects its return value as a parameter. If the function raises `HTTPException`, the endpoint never runs.

```python
_: str = Depends(verify_token)
```

`_` means the returned value isn't needed.

## `Security()`

Same as `Depends()`, but for auth schemes. Dependencies can chain — one dependency can depend on another.

```python
security = HTTPBearer()  # parses "Authorization: Bearer <token>"

def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    token = credentials.credentials
    if token != settings.SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token
```

`HTTPBearer()` runs first, parses the header, auto-raises `401/403` if malformed, and returns credentials with `.scheme` and `.credentials`.

## Bare `raise`

Re-raises the caught exception unchanged.

```python
except HTTPException:
    raise
except Exception as e:
    return IngestResponse(status="failed", chunks_created=0)
```

`HTTPException` is a subclass of `Exception`, so a plain `except Exception` would also swallow it, turning a `400` into a misleading `200`. Catching `HTTPException` first and re-raising it preserves the correct status code.

---

# 5. Python `functools`

**What it is:** a built-in module with small ready-made tools for working with functions.

**In simple words:** normal functions do one task. `functools` gives you helpers that *change or improve* functions — like remembering old answers, fixing some inputs, merging a list into one value, or keeping a function name safe inside a decorator. You add one line (`@...` or `partial(...)`) instead of writing that logic yourself.

Think of it like this: if functions are machines, `functools` gives you attachments for those machines.

### `partial` — fix some inputs, keep the rest open
Use when one function is too general and you want a simpler version of it.

```python
from functools import partial

def power(base, exp):
    return base ** exp

square = partial(power, exp=2)  # exp is now always 2
print(square(5))  # 25, because 5**2 = 25
```
Remember: `partial` does not run the function, it makes a new function with fewer inputs to fill.

### `reduce` — combine a full list into one value
Use when you want to merge many items step by step (sum, multiply, join).

```python
from functools import reduce

print(reduce(lambda x, y: x + y, [1, 2, 3, 4]))  # 10
# step 1: 1+2 = 3
# step 2: 3+3 = 6
# step 3: 6+4 = 10
```
Remember: `reduce` always needs a function with 2 inputs and a list. Output is always a single value.

### `lru_cache` — remember answers, skip repeat work
Use when the same function is called again and again with the same inputs. First call computes, next calls return the saved answer instantly.

Two ideas to remember:
1. **Cache = notebook.** Function writes `input -> answer` in a notebook. If input comes again, it reads the notebook instead of computing.
2. **LRU = which page to tear out.** Notebook has limited pages (`maxsize`). When full, it throws away the page you used **least recently**. Default pages = 128.

Rule: inputs must be hashable (`int`, `str`, `tuple`). No `list` or `dict`.

```python
from functools import lru_cache

@lru_cache(maxsize=128)  # default size is 128; use maxsize=None for unlimited
def slow_square(n):
    print(f"computing {n}...")
    return n * n

print(slow_square(4))
print(slow_square(4))  # same input, no computing this time
print(slow_square(5))
print(slow_square.cache_info())
```

**Output:**

```
computing 4...
16          # miss → really computed
16          # hit → read from notebook, no "computing" printed
computing 5...
25          # miss → new input, computed
CacheInfo(hits=1, misses=2, maxsize=128, currsize=2)
```

Meaning: `hits=1` (1 time saved), `misses=2` (2 times computed), `currsize=2` (2 answers stored). `slow_square.cache_clear()` erases the notebook.

How eviction works with `maxsize=2` (only 2 pages):

```python
@lru_cache(maxsize=2)
def f(n):
    print(f"computing {n}")
    return n * n

f(1)  # computing 1 → notebook: [1]
f(2)  # computing 2 → notebook: [1, 2] (full)
f(1)  # hit, no print → 1 becomes "recently used", order: [2, 1]
f(3)  # computing 3 → full, so throw out 2 (least recently used) → notebook: [1, 3]
f(2)  # computing 2 again → 2 was thrown out, so compute again
```
Remember: calling an item makes it "recently used" and saves it from eviction.

### `cache` — same as above, but notebook has unlimited pages
Use when inputs are few and fixed (like `fib(0..5)`). It is just shorthand for `@lru_cache(maxsize=None)`. Python 3.9+.

```python
from functools import cache

@cache
def fib(n):
    print(f"computing fib({n})")
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(5))
print(fib.cache_info())
```

**Output:**

```
computing fib(5)
computing fib(4)
computing fib(3)
computing fib(2)
computing fib(1)
computing fib(0)
5
CacheInfo(hits=3, misses=6, maxsize=None, currsize=6)
```

Why so few lines? `fib(3)` is needed by both `fib(5)` and `fib(4)`, but it is computed only once — second time is a `hit`, so nothing prints. Without `@cache` this would compute many times over.
Remember: `maxsize=None` means never throw out pages. Safe for small input sets, dangerous for user input (memory keeps growing). For unknown/unlimited inputs, use `lru_cache(maxsize=...)`.

> **`cache` vs `lru_cache` (one-line revision):** both remember answers. `cache` = remember everything forever. `lru_cache(maxsize=N)` = remember only last N, forget the least recently used.

---

## 6. Python `typing`

**What it is:** a module for telling Python (and readers) what type a variable should be.

**In simple words:** Python does not check types at runtime, but type hints act like labels on boxes — `x: int` means "this box holds an int". Editors catch mistakes early, and FastAPI/Pydantic use these labels to validate requests.

Think of it like this: hints don't change what the code does, they describe what the code expects.

### Basic containers — use lowercase generics (Python 3.9+)
Old style `List[int]` still works, but prefer `list[int]`.

```python
x: int = 5
names: list[str] = ["a", "b"]
scores: dict[str, int] = {"a": 10}
point: tuple[int, int] = (1, 2)
unique: set[str] = {"a"}
```
Remember: bare `list` / `dict` means "any content". `list[str]` means "list of strings".

### `Optional` / `|` — value can be missing (`None`)
Use for nullable fields, e.g. a chunk with no score yet.

```python
from typing import Optional

def find(name: str) -> Optional[str]:
    return None  # allowed: str or None

# modern shorthand (Python 3.10+), same meaning:
def find2(name: str) -> str | None:
    return None
```
Remember: `Optional[str]` = `str | None`. Always handle the `None` case.

### `Union` / `|` — value can be one of several types

```python
from typing import Union

def parse(v: Union[int, str]) -> str:
    return str(v)

# modern shorthand, same meaning:
def parse2(v: int | str) -> str:
    return str(v)
```
Remember: prefer `int | str` over `Union` in new code. Use `Optional` only when one option is `None`.

### `Literal` — value must be one of exact strings/numbers
Use for fixed choices, e.g. `route_taken` in our `/query` graph.

```python
from typing import Literal

def answer(route_taken: Literal["simple", "multi_hop"]) -> str:
    return route_taken

answer("simple")  # ok
# answer("weird")  # type error: must be "simple" or "multi_hop"
```
Remember: `Literal` is for values, `Union` is for types. `"simple"` is a value, `str` is a type.

### `TypedDict` — dict with fixed keys and known value types
Use for LangGraph state and JSON-like objects where keys are known.

```python
from typing import TypedDict

class QueryState(TypedDict):
    question: str
    route_taken: str
    answer: str

s: QueryState = {"question": "hi", "route_taken": "simple", "answer": ""}
# s = {"question": "hi"}  # type error: missing keys
```
Remember: `TypedDict` = dict shape check. Keys are fixed, values are typed. Use `NotRequired` (or `total=False`) for keys that may be missing:

```python
from typing import NotRequired

class Chunk(TypedDict):
    text: str
    score: NotRequired[float]  # may or may not be present
```

### `Any` — turn off checking (escape hatch)

```python
from typing import Any

def log(v: Any) -> None:
    print(v)  # accepts anything, no checking
```
Remember: `Any` silences the checker. Useful for truly unknown data (raw JSON), harmful everywhere else — it hides bugs.

### `Final` — constant, must not be reassigned

```python
from typing import Final

SERVICE_TOKEN: Final[str] = "abc123"
# SERVICE_TOKEN = "x"  # type error
```
Remember: `Final` is a promise to readers, not runtime protection — Python can still reassign it, checkers will complain.

### `Callable` — a function passed as input

```python
from typing import Callable

def run(fn: Callable[[int], int]) -> int:
    return fn(5)  # fn takes one int, returns one int
```
Remember: `Callable[[inputs...], output]`. `Callable[[int, str], bool]` = takes `(int, str)`, returns `bool`.

> **One-line revision:** `Optional` = may be None. `Union`/`|` = one of many types. `Literal` = one of exact values. `TypedDict` = dict with fixed keys (LangGraph state). `Any` = skip checks. `Final` = don't reassign. `Callable` = a function argument.

---
