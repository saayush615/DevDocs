# DevDocs Copilot

## 1. What is this project?

DevDocs Copilot is an internal knowledge assistant. Instead of engineers digging through scattered READMEs, wikis, and old docs to find answers, they upload their documentation once and then just ask questions in plain English. The system finds the relevant parts of the docs and answers with citations, so people trust where the answer came from. It also knows when a question needs digging through multiple documents instead of just one, and it double-checks its own answer against the source docs before replying, instead of guessing.

## 2. Tech Stack

- **Frontend:** Next.js (TypeScript, App Router)
- **Backend:** Node.js + Express 5 (TypeScript, better-auth)
- **AI Service:** FastAPI (Python) + LangGraph
- **Vector DB:** Qdrant
- **Database:** PostgreSQL
- **Embeddings:** Gemini Embedding API
- **LLM:** Groq / OpenAI (configurable)

## 3. Architecture

```
┌─────────────┐        ┌──────────────────┐        ┌───────────────────┐
│  Next.js     │ HTTPS  │   Node.js (BFF)   │ HTTPS  │   FastAPI (AI svc) │
│  - Chat UI   │──────► │  - Auth (better- │──────► │  - /ingest         │
│  - Upload UI │ SSE    │    auth cookies) │ stream │  - /query (agent)  │
│  - Admin UI  │◄────── │  - Postgres       │◄────── │  - LangGraph graph │
└─────────────┘        └────────┬──────────┘        └─────────┬──────────┘
                                 │                              │
                                 ▼                              ▼
                        ┌──────────────────┐         ┌───────────────────┐
                        │ Postgres         │         │   Qdrant (vector) │
                        │ users, documents,│         │                   │
                        │ conversations,   │         └───────────────────┘
                        │ messages         │
                        └──────────────────┘
```

Next.js never talks to FastAPI directly — every request goes through Node, which handles auth and owns the data. Node calls FastAPI with a service-to-service token; FastAPI trusts only requests carrying it.

Key rules (see `docs/PRD.md` §3-4 for details):

- **Auth:** email + password via better-auth. Sessions are better-auth cookies — not hand-rolled JWTs.
- **Streaming:** chat responses stream token-by-token (SSE) from FastAPI through Node to the client — never buffered.
- **Isolation:** every Qdrant query is filtered by `user_id` — no cross-user data leakage.
- **Grounded answers:** `/query` runs a LangGraph graph (`classify_q → simple_rag → grounding_check → final_answer`). Every answer includes citations (`document_id`, `chunk_index`, snippet) and `route_taken` (`simple` | `multi_hop`). If the answer isn't supported by retrieved chunks, the agent says "I don't have enough information" — never guesses.

## 4. Current Status

- **Done:** User signup/login via better-auth (session cookies, persisted in Postgres).
- **Not yet built:** document upload/ingestion, Qdrant vector store, LangGraph agent, chat + SSE streaming, conversation history. The AI service (`ai-service/`) is currently a FastAPI stub, and `docker-compose.yml` runs only Postgres (no Qdrant container yet).

## 5. MVP TODO

- [x] User signup/login (better-auth, session cookies)
- [ ] Upload document (`.md` / `.txt`), chunk + embed, store in Qdrant
- [ ] Chat endpoint: ask question, get streamed answer with citations
- [ ] Agent routes simple vs. multi-hop questions
- [ ] Grounding check before returning an answer
- [ ] Conversation history saved and reloadable

## 6. Local development

Each package installs and runs independently with `pnpm` (not a pnpm workspace).

1. Start Postgres: `docker compose up -d` (Postgres 17, `devdocs`/`devdocs`/`devdocs` on port 5432).
2. Backend (`backend/`): copy `.env.example` → `.env`, run `pnpm install`, then `pnpm prisma generate` (generated client is gitignored) and `pnpm dev` — port **3001**.
3. Frontend (`frontend/`): copy `.env.example` → `.env`, run `pnpm install`, then `pnpm dev` — port **3000**. The auth client calls the backend directly via `NEXT_PUBLIC_BACKEND_URL` (no Next proxy).
4. AI service (`ai-service/`): use the existing Python 3.14 venv at `ai-service/.venv` and run `uvicorn app.main:app` from `ai-service/`.
