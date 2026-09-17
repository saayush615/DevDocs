# DevDocs Copilot

An internal knowledge-assistant web app. Engineers upload docs (`.md`, `.txt`, and more in V1) and ask questions in plain English. The system retrieves relevant chunks, answers with citations, and grounds every response in source material — no guessing.

**Target user:** Engineers and new hires who need fast, cited answers from internal documentation.

**Detailed spec:** [`docs/PRD.md`](docs/PRD.md) is the source of truth for architecture, scope, and phase boundaries.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (TypeScript, App Router, react-hook-form + zod) |
| Backend | Node.js + Express 5 (TypeScript, better-auth) |
| AI Service | FastAPI (Python) + LangGraph |
| Vector DB | Qdrant |
| Database | PostgreSQL (Prisma ORM) |
| Embeddings | Gemini Embedding API |
| LLM | Configurable (`LLM_MODEL` env var) |

---

## Architecture

```
Next.js (frontend)            External channels (V2): Slack / Discord
   │ HTTPS (session cookie)          │ (OAuth-linked identities)
   ▼                                 ▼
Node.js (BFF / backend) ◄───────────┘
   │  Auth, quotas, system of record
   │  Calls FastAPI with a service-to-service token
   ▼
FastAPI (AI service, stateless)
   │  /ingest — chunk + embed + upsert to Qdrant
   │  /query  — LangGraph agent (route, retrieve, ground, answer)
   ▼
Qdrant (vector DB)
```

**Non-negotiable rule:** the frontend and any external channel never call the AI service directly. All requests go through Node.

---

## MVP (Delivered)

- [x] User auth (signup/login) via better-auth
- [x] Upload `.md` / `.txt` with status transitions (`pending → chunking → embedded | failed`)
- [x] Chunk + embed into Qdrant, scoped by `user_id`
- [x] Chat with streamed, cited answers (SSE)
- [x] Conversation history persisted per user
- [x] Query routing (`simple` vs `multi_hop`) + grounding check — falls back to "I don't have enough information" when unsupported

---

## Roadmap

### V0 — Guardrails (next)
- [ ] Per-user daily quotas (queries, prompt tokens, completion tokens, embedding tokens)
- [ ] Lifetime caps (documents, conversations) + per-file size cap
- [ ] Burst rate limiting per user/IP on chat, upload, and auth
- [ ] `UsageDaily` metering — FastAPI reports usage, Node enforces budgets
- [ ] `429` surfaced in the UI before any token is spent

### V1 — Knowledge
- [ ] Org tenancy insurance (`organization_id` on all tables + Qdrant filter)
- [ ] PDF, GitHub repo, and URL ingestion with provenance-rich citations (page/heading/URL)
- [ ] Multi-hop RAG (sub-question decomposition, parallel retrieval, synthesis)
- [ ] Eval harness + per-answer feedback loop

### V2 — Everywhere
- [ ] Slack adapter (Bolt) + Discord adapter (`discord.js`)
- [ ] OAuth identity linking; unlinked identities refused
- [ ] Non-streamed replies (typing indicator + final message)

### V3 — Teams
- [ ] Multi-tenant orgs with onboarding/invites
- [ ] Departments (scoping) + roles (permissions) with a permission matrix
- [ ] Access-scoped retrieval at the Qdrant query level

### V4 — Connect
- [ ] MCP server on Node (`search_docs`, `get_document`, `query`, `create_flag`)
- [ ] External agents can query org knowledge with correct isolation

**Explicitly deferred:** WhatsApp, semantic memory layer (mem0-style), signup abuse guard (email verification/IP throttling), BM25/cross-encoder retrieval upgrades.

---

## Local Development

Each package runs independently with `pnpm` (not a workspace).

```bash
# 1. Start Postgres + Qdrant
docker compose up -d

# 2. Backend (port 3001)
cd backend && cp .env.example .env && pnpm install
pnpm prisma generate && pnpm dev

# 3. Frontend (port 3000)
cd frontend && cp .env.example .env && pnpm install && pnpm dev

# 4. AI service (port 8000)
cd ai-service && source .venv/bin/activate
uvicorn app.main:app
```
