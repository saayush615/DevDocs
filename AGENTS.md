# AGENTS.md

`docs/PRD.md` is the source of truth for architecture, scope, and phase boundaries — read it fully before implementing anything.

Three separate packages, **not** a pnpm workspace: `frontend/` (Next.js), `backend/` (Express 5), `ai-service/` (FastAPI). Each has its own `package.json` + `pnpm-lock.yaml`. Install and run per package with `pnpm`.

## Never read or expose `.env` files

- **Never read, print, or commit any `.env` file** (e.g. `backend/.env`, `frontend/.env`, `ai-service/app/.env`) — they contain real secrets (DB credentials, better-auth secret, `GOOGLE_API_KEY`, `SERVICE_TOKEN`).
- To see what env variables a package needs, read only the `.env.example` template: `backend/.env.example`, `frontend/.env.example`, `ai-service/app/.env.example` (all placeholder/empty values).
- Never log, echo, or paste values that look like secrets, and never add a real `.env` to a commit.

## Current state (verified — MVP delivered, per PRD §8)

- **Auth:** better-auth mounted at `/api/auth/*` (`backend/src/index.ts`); frontend uses the better-auth React client (`frontend/lib/auth-client.ts`) hitting backend directly.
- **Upload:** `.md`/`.txt` via multer (2 MB cap) → `services/upload.service.ts` → FastAPI `/ingest`; status runs `pending → chunking → embedded | failed`.
- **Chat:** `controllers/chat.controller.ts` persists the user message, proxies the FastAPI SSE stream, persists the assistant message with citations + `routeTaken`. Auth'd routes are `/api/document`, `/api/conversation`, `/api/chat` (all guarded by `middleware/requireAuth.ts` → `req.userId`).
- **AI service:** real LangGraph implementation, not a stub. Linear graph `classify_q → simple_rag → grounding_check → final_answer` in `ai-service/app/graph/` (`graph.py`, `node.py`, `state.py`). `app/routers/ingest.py` + `query.py` (JSON + `/query/stream` SSE). Qdrant needs to be running — `docker-compose.yml` now runs **both** Postgres 17 (port 5432) and Qdrant (port 6333).
- **Schema:** `backend/prisma/schema.prisma` already has the domain tables — `Document` (with `DocumentStatus` enum), `Conversation`, `Message` (`citations Json?`, `routeTaken`) — alongside the better-auth tables. There is **no** `UsageDaily` table or quota code yet.
- **No test setup or CI anywhere.** Definition of done = `lint` + `format` + typecheck (`pnpm build` for backend) per package.

## Commands

Backend (`backend/`):
- `pnpm dev` — `tsx watch src/index.ts`, port **3001**
- `pnpm build` — `tsc` (typecheck + emit to `dist/`); there is no separate typecheck script
- `pnpm lint` / `pnpm format` / `pnpm format:check`
- `pnpm prisma ...` — Prisma 7 CLI (`generate`, `migrate dev`, etc.)

Frontend (`frontend/`):
- `pnpm dev` — `next dev`, port **3000**
- `pnpm lint` / `pnpm format` / `pnpm build` (build is the typecheck)

AI service (`ai-service/`): Python 3.14 venv at `ai-service/.venv`; run `uvicorn app.main:app` (default port **8000**) from `ai-service/`. `requirements.txt` is a pip-freeze-style lock, kept current via `uv`.

## Prisma 7 quirks

- Generator `prisma-client` outputs to `backend/src/generated/prisma`, which is **gitignored** — run `pnpm prisma generate` after cloning before `tsc`/dev works.
- Backend imports the client from `../generated/prisma/client.js` and uses the `@prisma/adapter-pg` driver adapter (`backend/src/lib/prisma.ts`).
- `prisma.config.ts` loads dotenv and reads `DATABASE_URL`; migrations live in `prisma/migrations/`. New domain-schema changes need `pnpm prisma migrate dev` (no migration exists for the current schema — verify with `git status` before assuming).

## Backend gotchas

- ESM (`module: nodenext` + `verbatimModuleSyntax` + `exactOptionalPropertyTypes`): relative imports must use explicit `.js` extensions (`import { auth } from './lib/auth.js'`).
- `package.json` has **no plain `typescript` dep** — it uses the aliased `npm:@typescript/typescript6` package. Don't "fix" this by adding vanilla typescript or bumping the version.
- Required env (`backend/.env`, template in `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN` (must match ai-service `SERVICE_TOKEN`).
- better-auth cookie prefix is `devdocs`, secure cookies off (local dev); CORS allows `http://localhost:3000` with credentials.
- Frontend has no Next proxy/rewrite — the auth client hits `http://localhost:3001` directly via `NEXT_PUBLIC_BACKEND_URL`.
- Upload: **AI `/ingest` returns HTTP 200 even on failure** — `upload.service.ts` must check `status !== 'embedded'`; any exception flips the doc to `failed` (never leave it stuck at `chunking`).
- Known latent bug: `services/aiClient.service.ts` sends `tok_k: 5` (misspelled) instead of `top_k` — FastAPI silently uses its default of 5.

## AI-service gotchas

- Required env (`ai-service/app/.env`, template at `app/.env.example` — note it is **inside `app/`**, not the package root): `GOOGLE_API_KEY`, `SERVICE_TOKEN`. Defaults in `config.py`: `EMBEDDING_MODEL=gemini-embedding-001`, `EMBEDDING_DIM=768`, `LLM_MODEL=gemini-3.6-flash`. Qdrant collection `doc_chunks` (created at startup with a `user_id` keyword payload index).
- `/query/stream` is **not true token streaming**: it runs the graph once via `ainvoke()`, then re-emits the final answer word-by-word. `graph.astream()` per-token streaming is a known stretch goal (see comment in `routers/query.py`).
- The graph is compiled once at import (`_graph`) in `query.py`, not per request.
- `multi_hop` is only a soft fallback today: `simple_rag` just doubles `top_k`; the real multi-hop branch is V1 (PRD §4/§9).
- Retrieval isolation lives in `services/vector_store.py` `search_chunks()` via a hard `user_id` filter — keep the filter mandatory, never weaken it.

## Prettier differs per package

- Backend: single quotes. Frontend: double quotes + `prettier-plugin-tailwindcss`. Run `format` inside each package; do not apply one style repo-wide.

## Architecture (non-negotiable, PRD §3)

- **The frontend never calls the AI service directly.** Next.js → Node (auth + policy + system of record) → FastAPI with a service-to-service bearer token; FastAPI trusts only requests carrying it (`app/auth.py`).
- **Retrieval isolation:** every Qdrant query is filtered by `user_id` — no cross-user data leakage, ever. (V1 adds `organization_id` to the filter.)
- Chat streams via SSE FastAPI → Node → client — not buffered.
- Every answer includes text, citations (`document_id`, `chunk_index`, snippet), and `route_taken` (`simple` | `multi_hop`). The mandatory grounding check fails closed: unsupported claims → "I don't have enough information in the available documents."
- Forms on the frontend use **react-hook-form + zod** (`@/*` path alias maps to the frontend root, not `src/`).

## Scope discipline (PRD §9)

- **Build V0 next (Guardrails):** per-user daily quota + burst rate limiting (chat/upload/auth), `UsageDaily` metering (FastAPI reports usage, Node enforces), `429` surfaced in the UI. Acceptance (PRD §9): 31st query of a day rejected **before** any token is spent.
- **Do not build yet:** PDF/GitHub/URL ingestion, multi-hop branch, org tenancy (`organization_id`), eval harness (V1); Slack/Discord (V2); RBAC/departments/admin UI (V3); MCP server (V4); memory layer / email verification / WhatsApp (deferred, PRD §10).