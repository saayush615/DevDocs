# AGENTS.md

`docs/PRD.md` is the source of truth for architecture, scope, and phase boundaries — read it fully before implementing anything.

Three separate packages, **not** a pnpm workspace: `frontend/` (Next.js), `backend/` (Express 5), `ai-service/` (FastAPI). Each has its own `package.json` + `pnpm-lock.yaml`. Install and run per package with `pnpm`.

## Never read or expose `.env` files

- **Never read, print, or commit any `.env` file** (e.g. `backend/.env`, `frontend/.env`, `ai-service/app/.env`) — they contain real secrets (DB credentials, better-auth secret, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `SERVICE_TOKEN`).
- To see what env vars a package needs, read only the `.env.example` template: `backend/.env.example`, `frontend/.env.example`, `ai-service/app/.env.example` (all placeholder/empty values).
- Never log, echo, or paste values that look like secrets, and never add a real `.env` to a commit.

## Current state (verified against code)

- **MVP + most of V0 delivered.** Quotas/caps/guardrails are in: `backend/src/lib/quota.ts` (daily query/upload quotas, lifetime doc/conversation caps, `MAX_FILE_MB` — all read from `QUOTA_*` env vars with fallbacks), `controllers/quota.controller.ts` → `GET /api/quota`, `UsageDaily` table (migration `20260926090544_add_usage_daily`), `429` via `Errors.tooManyRequests` in `lib/ErrorFactory.ts`, surfaced in the UI (`components/QuotaMeter.tsx`, `lib/api.ts`). LangGraph has `input_guard` + `output_guard` nodes (`app/graph/graph.py`, `app/services/guards.py`).
- **Still open in V0:** burst rate limiting. `express-rate-limit` is installed in `backend/package.json` but **not imported anywhere in `backend/src`** — wiring it up is the remaining V0 item.
- **Auth:** better-auth mounted at `/api/auth/*splat` (`backend/src/index.ts`); frontend uses the better-auth React client (`frontend/lib/auth-client.ts`) hitting backend directly.
- **Upload:** `.md`/`.txt` via multer → `services/upload.service.ts` → FastAPI `/ingest`; status runs `pending → chunking → embedded | failed`.
- **Chat:** `controllers/chat.controller.ts` persists the user message, proxies the FastAPI SSE stream, persists the assistant message with citations + `routeTaken`. Auth'd routes: `/api/document`, `/api/conversation`, `/api/chat`, `/api/quota` (all guarded by `middleware/requireAuth.ts` → `req.userId`).
- **AI service:** real LangGraph, compiled **once at import** (`_graph` in `routers/query.py`). Graph: `START → input_guard →(allowed) classify_q → simple_rag → grounding_check → final_answer → output_guard → END`, with `input_guard →(blocked) END` (canned refusal, zero tokens). `app/routers/ingest.py` + `query.py` (JSON + `/query/stream` SSE). Qdrant + Postgres 17 both run from root `docker-compose.yml` (ports 6333 / 5432).
- **No test setup or CI anywhere** (no pytest/ruff/mypy config either). Definition of done = `lint` + `format` + typecheck per package.

## Commands

Backend (`backend/`):
- `pnpm dev` — `tsx watch src/index.ts`, port **3001**
- `pnpm build` — `tsc` (typecheck + emit to `dist/`); there is no separate typecheck script
- `pnpm lint` / `pnpm format` / `pnpm format:check`
- `pnpm prisma ...` — Prisma 7 CLI (`generate`, `migrate dev`, etc.)

Frontend (`frontend/`):
- `pnpm dev` — `next dev`, port **3000**
- `pnpm lint` / `pnpm format` / `pnpm build` (build is the typecheck)

AI service (`ai-service/`): Python **3.14** venv at `ai-service/.venv`; run `uvicorn app.main:app` (port **8000**) from `ai-service/`. `requirements.txt` is a pip-freeze-style lock (no ruff/mypy/pytest configured).

## Prisma 7 quirks

- Generator `prisma-client` outputs to `backend/src/generated/prisma`, which is **gitignored** — run `pnpm prisma generate` after cloning before `tsc`/dev works.
- Backend imports the client from `../generated/prisma/client.js` and uses the `@prisma/adapter-pg` driver adapter (`backend/src/lib/prisma.ts`).
- `prisma.config.ts` loads dotenv and reads `DATABASE_URL`; migrations live in `prisma/migrations/` (4 exist, latest is `add_usage_daily`). New schema changes need `pnpm prisma migrate dev` — check `git status` before assuming a migration is missing.

## Backend gotchas

- ESM (`module: nodenext` + `verbatimModuleSyntax` + `exactOptionalPropertyTypes`): relative imports must use explicit `.js` extensions (`import { auth } from './lib/auth.js'`).
- `package.json` has **no plain `typescript` dep** — it has two aliased ones: `typescript` → `npm:@typescript/typescript6` and `typescript-7` → `npm:typescript@^7`. Don't "fix" either by adding vanilla typescript or bumping versions.
- Required env (`backend/.env`, template in `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN` (must match ai-service `SERVICE_TOKEN`), plus the `QUOTA_*` limits (optional — code falls back to defaults 30/20/20/50/5 MB).
- better-auth cookie prefix is `devdocs`, secure cookies off (local dev); CORS allows `http://localhost:3000` with credentials.
- Frontend has no Next proxy/rewrite — API/auth clients hit `http://localhost:3001` directly via `NEXT_PUBLIC_BACKEND_URL`; file-size cap comes from `NEXT_PUBLIC_MAX_FILE_MB`.
- Upload: **AI `/ingest` returns HTTP 200 even on failure** — `upload.service.ts` must check `status !== 'embedded'`; any exception flips the doc to `failed` (never leave it stuck at `chunking`).
- Known latent bug: `services/aiClient.service.ts:54` sends `tok_k: 5` (misspelled) instead of `top_k` — FastAPI silently uses its default of 5.

## AI-service gotchas

- Required env (`ai-service/app/.env` — note the template is **inside `app/`**, not the package root): `GOOGLE_API_KEY`, `GROQ_API_KEY`, `SERVICE_TOKEN`, `LLM_MODEL` (no default — **required**). Chat LLM is Groq via `langchain-groq` (`services/llm.py`, `@lru_cache` singleton, temperature 0); Gemini is **embeddings only** (`EMBEDDING_MODEL=gemini-embedding-001`, dim 768). Qdrant collection `doc_chunks` (created at startup with a `user_id` keyword payload index).
- Settings come from pydantic-settings (`config.py`, `env_file='app/.env'`) and are a singleton — it copies LangSmith values into `os.environ` itself; don't re-do that.
- `/query/stream` is **not true token streaming**: it runs the graph once via `ainvoke()`, then re-emits the final answer word-by-word. `graph.astream()` per-token streaming is a known stretch goal (comment in `routers/query.py`).
- `multi_hop` is only a soft fallback today: `simple_rag` just doubles `top_k`; the real multi-hop branch is V4 (PRD §2.6).
- Guardrails (`services/guards.py`) are built once at import; Guardrails AI telemetry tracing is deliberately disabled (`gr_settings.disable_tracing = True`) — don't re-enable it. Toggles: `GUARD_INPUT_ENABLED` / `GUARD_OUTPUT_ENABLED` / `GUARD_BANNED_WORDS`.
- Retrieval isolation lives in `services/vector_store.py` `search_chunks()` via a hard `user_id` filter — keep the filter mandatory, never weaken it.

## Prettier differs per package

- Backend: single quotes. Frontend: double quotes + `prettier-plugin-tailwindcss`. Run `format` inside each package; do not apply one style repo-wide.

## Architecture (non-negotiable — PRD "3. Architecture")

- **The frontend never calls the AI service directly.** Next.js → Node (auth + policy + system of record) → FastAPI with a service-to-service bearer token; FastAPI trusts only requests carrying it (`app/auth.py`).
- **Retrieval isolation:** every Qdrant query is filtered by `user_id` — no cross-user data leakage, ever. (V1 adds `organization_id` to the filter.)
- Chat streams via SSE FastAPI → Node → client — not buffered.
- Every answer includes text, citations (`document_id`, `chunk_index`, snippet), and `route_taken` (`simple` | `multi_hop` | `blocked`, per `app/models.py`). The mandatory grounding check fails closed: unsupported claims → "I don't have enough information in the available documents."
- Forms on the frontend use **react-hook-form + zod**; `@/*` path alias maps to the frontend root (there is no `src/`).

## Scope discipline (PRD §2 phase goals + §2.7 Non-Goals)

- **Next up:** finish V0 burst rate limiting (see "Current state"), then V1 — LangGraph hardening (`retry_count`, `off_topic`/`blocked` route values, `fallback_response` node), true streaming, and minimal org tenancy (`organization_id` on `User`/`Document`/`Conversation`/`UsageDaily` + Qdrant filter).
- **Do not build yet:** PDF/GitHub/URL ingestion, real multi-hop branch, eval harness (V1, PRD §2.3); Slack/Discord, voice, RBAC/departments/admin UI (V2–V3); MCP server (V4, §2.6); memory layer / email verification / WhatsApp (deferred, §2.7).
- Note: the PRD has duplicate section numbers (`## 3` and `## 6` each appear twice) — cite headings, not numbers.
