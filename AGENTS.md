# AGENTS.md

Greenfield project: no code exists yet. `docs/PRD.md` is the source of truth for architecture and scope — read it before implementing anything.

## Architecture (non-negotiable)

- **The frontend never calls the AI service directly.** Next.js → Node backend → FastAPI. Node is the single auth boundary and system of record.
- Node calls FastAPI with a service-to-service token; FastAPI trusts only requests carrying it.
- **Retrieval isolation:** every Qdrant query must be filtered by `user_id` — no cross-user data leakage, ever.
- Chat must stream token-by-token (SSE) from FastAPI through Node to the client — not buffered.
- Stack: Next.js (frontend), Node/Express-or-Fastify (Fastify preferred for streaming), FastAPI + LangGraph (AI service, stateless), Postgres (system of record), Qdrant (vector DB, `doc_chunks` collection).

## Code quality (PRD §3.5)

- TypeScript (strict `tsconfig.json`) for both Next.js frontend and Node backend; FastAPI stays Python with type hints — Pydantic models for all request/response schemas.
- ESLint (TypeScript recommended rules) + Prettier on both JS projects; lint + format must pass as part of MVP Definition of Done.

## Agent behavior (don't skip)

- `/query` is a LangGraph graph, not a single retrieve-then-generate call: `classify_q → simple_rag → grounding_check → final_answer`.
- Every answer must include: answer text, citations (`document_id`, `chunk_index`, snippet), and `route_taken` (`simple` | `multi_hop`) — the route is stored for audit/eval.
- Grounding check is mandatory: if the answer isn't supported by retrieved chunks, return "I don't have enough information" — never guess.

## Data model

- Postgres tables: `users`, `documents`, `document_chunks`, `conversations`, `messages` (see PRD §5 for columns).
- `documents.status` transitions: `pending` → `chunking` → `embedded` | `failed`. On any ingestion failure, set `failed` and make it visible in the UI — never silently drop.

## Config & dev

- All config via environment variables (`.env`, with `.env.example`): embedding model (Gemini `gemini-embedding-001/002`), LLM provider (Groq or other), API keys. Nothing hardcoded.
- Qdrant runs via Docker locally; the full stack must be runnable locally with `.env.example` provided.
- Passwords hashed (bcrypt/argon2); JWT-based auth.

## Scope discipline

Do NOT build these yet (explicitly out of MVP, PRD §9): role/workspace access control, admin audit log UI, agent tool-calling actions, PDF/GitHub ingestion, re-indexing on document update.
