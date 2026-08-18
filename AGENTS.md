# AGENTS.md

`docs/PRD.md` is the source of truth for architecture and scope — read it before implementing anything.

Three separate packages, **not** a pnpm workspace: `frontend/` (Next.js), `backend/` (Express 5), `ai-service/` (FastAPI). Each has its own `package.json` + `pnpm-lock.yaml`. Install and run per package with `pnpm`.

## Current state (verified — don't assume more)

- **Auth works end-to-end.** Backend mounts better-auth at `/api/auth/*` (`backend/src/index.ts`); frontend uses the better-auth React client (`frontend/lib/auth-client.ts`) calling the backend directly.
- **Everything else is unimplemented.** `ai-service/` is a FastAPI hello-world stub (`app/main.py`); no LangGraph, no Qdrant. `docker-compose.yml` runs **only Postgres 17** (user/pass/db all `devdocs`, port 5432) — there is no Qdrant container.
- `backend/prisma/schema.prisma` contains **only better-auth tables** (User, Session, Account, Verification). The PRD §5 domain tables (`documents`, `document_chunks`, `conversations`, `messages`) do not exist yet — create them and run a migration when you build those features.
- No test setup anywhere in the repo.

## Commands

Backend (`backend/`):
- `pnpm dev` — `tsx watch src/index.ts`, port **3001**
- `pnpm build` — `tsc` (typecheck + emit to `dist/`); there is no separate typecheck script
- `pnpm lint` / `pnpm format` / `pnpm format:check`
- `pnpm prisma ...` — Prisma 7 CLI (`generate`, `migrate dev`, etc.)

Frontend (`frontend/`):
- `pnpm dev` — `next dev`, port **3000**
- `pnpm lint` / `pnpm format` / `pnpm build`

AI service (`ai-service/`): Python 3.14 venv already at `ai-service/.venv`; run `uvicorn app.main:app` from `ai-service/`. `requirements.txt` is a pip-freeze-style lock (kept current via `uv`).

## Prisma 7 quirks

- Generator `prisma-client` outputs to `backend/src/generated/prisma`, which is **gitignored** — run `pnpm prisma generate` after cloning before `tsc`/dev works.
- Backend imports the client from `../generated/prisma/client.js` and uses the `@prisma/adapter-pg` driver adapter (`backend/src/lib/prisma.ts`).
- `prisma.config.ts` loads dotenv and reads `DATABASE_URL`; migrations live in `prisma/migrations/`.

## Backend gotchas

- ESM (`module: nodenext` + `verbatimModuleSyntax`): relative imports must use explicit `.js` extensions (`import { auth } from './lib/auth.js'`).
- Required env (`backend/.env`, template in `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`.
- better-auth cookie prefix is `devdocs`, secure cookies off (local dev); CORS allows `http://localhost:3000` with credentials.
- Frontend has no Next proxy/rewrite — the auth client hits `http://localhost:3001` directly via `NEXT_PUBLIC_BACKEND_URL` (`frontend/.env`).

## Prettier differs per package

- Backend: single quotes. Frontend: double quotes + `prettier-plugin-tailwindcss`. Run `format` inside each package; do not apply one style repo-wide.

## Architecture (non-negotiable, PRD §3)

- **The frontend never calls the AI service directly.** Next.js → Node (auth boundary, system of record) → FastAPI with a service-to-service token; FastAPI trusts only requests carrying it.
- **Retrieval isolation:** every Qdrant query must be filtered by `user_id` — no cross-user data leakage, ever.
- Chat must stream token-by-token (SSE) from FastAPI through Node to the client — not buffered.
- `/query` is a LangGraph graph (`classify_q → simple_rag → grounding_check → final_answer`), not a single call. Every answer includes text, citations (`document_id`, `chunk_index`, snippet), and `route_taken` (`simple` | `multi_hop`). Grounding check is mandatory: if unsupported by retrieved chunks, say "I don't have enough information" — never guess.
- When you add `documents`, its `status` transitions are `pending → chunking → embedded | failed`; on any ingestion failure set `failed` and make it visible in the UI — never silently drop.

## Scope discipline (PRD §9 — do not build yet)

Role/workspace access control, admin audit log UI, agent tool-calling actions, PDF/GitHub ingestion, re-indexing on document update.
