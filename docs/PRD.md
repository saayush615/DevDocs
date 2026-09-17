# DevDocs Copilot — Product Requirements & Roadmap

## Document Control

| Version | Date | Status | Summary |
|---|---|---|---|
| 1.0.0 | 2026-09-17 | **Current** | Roadmap rework. MVP marked **DELIVERED**. Phase plan added: **V0 Guardrails → V1 Knowledge → V2 Everywhere → V3 Teams → V4 Connect**. Adds per-user quotas + usage metering, org tenancy insurance, provenance-rich citations (page/heading/URL), multi-hop RAG, chat integrations, RBAC, and an MCP server. |

**Source of truth:** This document is the source of truth for architecture, scope, and phase boundaries. Read it fully before implementing anything. File references (e.g. `backend/src/...`) point at repo paths; re-verify against the live tree if a path drifts.

**Reading guide (for agents and humans):** §3 Architecture is non-negotiable and intentionally stable across every phase. §8 Implementation Status lists what already exists — do not rebuild it. §9 Roadmap defines what to build next, with acceptance criteria. §10 lists what is explicitly deferred.

---

## 0. Status Summary (at a glance)

- **MVP: DELIVERED** — auth, md/txt upload, streamed cited chat, grounding check, persisted conversations. See §8 for the checklist.
- **Active phase: V0 Guardrails** — per-user token/query/upload quotas + burst rate limiting (free-host abuse protection).
- **Planned:** V1 Knowledge, V2 Everywhere, V3 Teams, V4 Connect (details in §9).
- **Explicitly deferred (shelf):** global daily token envelope, signup abuse guard (email verification / IP throttling), WhatsApp integration, mem0-style memory layer.

---

## 1. Product Overview

**Name:** DevDocs Copilot

**Summary:** An internal knowledge-assistant web application. Users upload internal documentation (Markdown, text, PDF, GitHub README files) and links to external documentation (GitHub repos, documentation URLs). The system snapshots, chunks, and embeds the content into a vector store. Users then chat with an AI agent (through the web UI, and in V2 via Slack/Discord) that retrieves relevant document chunks and answers questions with citations. The agent routes between simple single-lookup questions and multi-hop questions that require retrieving and synthesizing across multiple documents, and verifies its own answers are grounded in retrieved content before returning them.

**Problem statement:** Engineering knowledge is scattered across READMEs, wikis, and old docs. New hires and engineers waste time searching manually or asking colleagues. A shared, access-scoped, auditable Q&A system over the org's own docs solves this in a way a personal ChatGPT session cannot: it supports multi-user shared indexing, role-based access to documents, an audit trail of queries and retrieved sources, and an API (MCP, V4) that other internal tools can call.

**Target user:** Engineers and new hires at a company needing fast, cited answers from internal documentation.

---

## 2. Goals and Non-Goals

### 2.1 Goals (MVP) — DELIVERED
- User auth (signup/login) via better-auth.
- Upload `.md` / `.txt` documents with status transitions `pending → chunking → embedded | failed`.
- Chunk + embed documents into a vector database, scoped by user.
- Chat interface: ask a question, get a streamed, cited answer (SSE).
- Conversation history persisted per user.
- Query routing classification (`simple` vs `multi_hop`) and a mandatory grounding check; if not grounded, respond with "I don't have enough information" instead of guessing.

### 2.2 Goals (V0 — Guardrails, build next)
- Per-user daily quotas: queries, prompt tokens, completion tokens, embedding tokens.
- Per-user lifetime caps: document uploads, conversations; plus a per-file size cap.
- Burst rate limiting per user/IP on chat, upload, and auth.
- **Usage metering:** FastAPI reports real token usage; Node records it and enforces budgets. A request that would exceed budget is rejected with a clear `429` *before* any work begins — never a stream cut mid-answer.

### 2.3 Goals (V1 — Knowledge)
- Ingestion breadth: PDF, GitHub repo (README + markdown), and documentation URL — content is snapshotted at ingestion, never fetched at query time.
- Provenance-rich citations: `page`, `heading`, or `url` attached per citation.
- Multi-hop RAG: sub-question decomposition, parallel retrieval workers, synthesis.
- Org tenancy insurance: `organization_id` on Postgres + Qdrant payload/filter, even while effectively single-tenant.
- Eval harness (golden Q&A set) + per-answer feedback loop.

### 2.4 Goals (V2 — Everywhere)
- Chat integrations: Slack (first), Discord (second), both routing through the shared Node chat core.
- Identity linking (OAuth) between channel accounts and app accounts. Unlinked identities get "link your account", never an answer.
- Non-streamed reply design for chat apps: typing indicator + single reply (progressive message edit where supported).

### 2.5 Goals (V3 — Teams)
- Multi-tenant organizations with onboarding/invites.
- Departments (data scoping) and roles (action granting) kept as separate concepts, backed by a permission matrix.
- Access-scoped document retrieval composed at the Qdrant query level (`organization_id` + department/role markers), with a leak-closed default on ACL change.

### 2.6 Goals (V4 — Connect)
- MCP server on the Node backend exposing `search_docs`, `get_document`, `query`, `create_flag` tools for external agents (e.g. Claude Desktop, Cursor).
- `create_flag` fulfills the previously deferred "agent tool-calling / ticket" item. Built only after V3 (identity/RBAC) lands.

### 2.7 Non-Goals
- No general-purpose chatbot (no small talk, no unrelated Q&A).
- No real-time collaborative editing of docs.
- No non-text file types (images, video).
- No WhatsApp until a paid phase (Meta Business API; free unofficial libraries violate ToS).
- No semantic memory layer (mem0-style). The product is built on grounded, cited answers; unattributed "memory" undermines that guarantee. If a concrete problem appears later, the entry point is conversation summarization, not a memory graph.

---

## 3. Architecture

Three-tier system. **Strict, non-negotiable rule: the frontend and any external channel never call the AI service directly — all requests go through the Node backend**, which is the single auth boundary, the policy/quota boundary, and the system of record.

```
Next.js (frontend)                          External channels (V2): Slack / Discord
   │ HTTPS (better-auth session cookie)          │ (OAuth-linked identities)
   ▼                                            ▼
Node.js (BFF / backend) ◄───────────────────────┘
   │ - Auth & sessions (better-auth)
   │ - Postgres: users, orgs, documents, conversations, messages, usage/quota
   │ - Quotas + rate limiting (V0)
   │ - Document extraction (V1): md/txt, PDF, GitHub, web URL
   │ - Channel gateway (V2) / MCP server: search_docs, get_document, query, create_flag (V4)
   │ - Calls FastAPI with a service-to-service token
   ▼
FastAPI (AI service, stateless)
   │ - /ingest: provenance-aware chunk + embed + upsert to Qdrant
   │ - /query: LangGraph agent execution (routing, retrieval, grounding check)
   │ - Reports real token usage back to Node (V0)
   ▼
Qdrant (vector DB)
```

### 3.1 Frontend (Next.js)
- Auth pages (signup/login) using the better-auth client (`frontend/lib/auth-client.ts`).
- All client-side forms (signup/login and any future forms) use **react-hook-form** for state/submission handling and **zod** schemas for validation (`zodResolver`), zod schemas co-located in `frontend/lib/`.
- Document upload page + document list/status view.
- Chat interface with streaming responses and inline citations. Citations render on the stream-complete SSE event (they arrive in the trailing event, not with tokens).
- Conversation history sidebar.
- V0: friendly "daily limit reached" (`429`) states on chat and documents pages.
- Stretch (post-V3): admin/audit page.

### 3.2 Backend (Node.js)
- Framework: Express 5. ESM (`module: nodenext`); relative imports use explicit `.js` extensions.
- Responsibilities:
  - **Auth** via **better-auth** (email + password): signup, login, session validation, session cookies. Mounted as a single handler at `/api/auth/*` (§6).
  - **Quotas + rate limiting (V0):** enforces per-user daily usage limits and per-IP burst limits *before* starting upload or chat work; returns `429` pre-SSE.
  - **Usage metering (V0):** persists `UsageDaily` aggregates from FastAPI-reported `usage`.
  - **Document upload endpoint:** accepts file/URL/repo link, extracts raw text (V1: md/txt/PDF/GitHub/web via `extract.service.ts`), stores metadata, forwards content + provenance to FastAPI `/ingest`.
  - **Chat endpoint:** accepts question + conversation_id, checks quota, forwards to FastAPI `/query/stream` with service-to-service auth, streams the response back via SSE (token-by-token), persists message + citations + route.
  - **Channel gateway (V2):** thin adapters (`slack.adapter.ts`, `discord.adapter.ts`) normalizing inbound to `{identity, org, text}` and calling the same core chat path as the web UI, so quotas and metering apply identically.
  - **MCP server (V4):** `search_docs`, `get_document`, `query`, `create_flag` tools; all AI work still routed through FastAPI.
  - Conversation CRUD endpoints.
  - **Never exposes FastAPI's URL or embedding/LLM logic to the frontend.**

### 3.3 AI Service (FastAPI)
- Stateless. Trusts only requests carrying a valid service-to-service token (`auth.py`) issued by Node.
- Responsibilities:
  - `/ingest`: chunk incoming text (heading-aware; page-boundary-safe for PDFs), embed, upsert to Qdrant with payload `{document_id, user_id, organization_id, chunk_index, content_preview, title, source_type, source_url, page?, heading?}`. Responds with `usage.embedding_tokens`.
  - `/query`: run the LangGraph agent (§4) and stream the final answer + citations back to Node; the final stream event includes `usage.{prompt_tokens, completion_tokens}`.
- Embedding model: Gemini `gemini-embedding-001/002` (free tier); dimension in `settings.EMBEDDING_DIM` (`app/config.py`).
- LLM: env-configurable (`LLM_MODEL`, `LLM_TEMPERATURE`); used for classification, answer drafting, and grounding.
- Node is the only client. FastAPI reports usage; it enforces no policy.

### 3.4 Vector Database (Qdrant)
- Collection: `doc_chunks`.
- Vector size matches the embedding model output (768 for the configured Gemini truncation).
- Payload fields: `document_id`, `user_id`, `organization_id`, `chunk_index`, `content_preview`, `title`, `source_type`, `source_url`, `page`, `heading`. Keyword indexes exist on `user_id` and `organization_id` so filtered searches do not full-scan.
- **All queries are filtered at the Qdrant query level** by `organization_id` AND `user_id` (V1; `organization_id` added defensively in V1). V3 composes department/role access markers on top. No cross-tenant or cross-user leakage, ever.

### 3.5 Code Quality & Language Standards
- **Language:** TypeScript for the Next.js frontend and Node.js backend (strict mode in `tsconfig.json`). FastAPI is Python with type hints; Pydantic models for all request/response schemas.
- **Linting:** ESLint configured for both TS packages, extending recommended TypeScript rules.
- **Frontend forms:** react-hook-form + zod (`@hookform/resolvers`) for all client-side forms; no hand-rolled `useState`-per-field form handling.
- **Formatting:** Prettier per package. Backend: single quotes. Frontend: double quotes + `prettier-plugin-tailwindcss`. Run `format` inside each package; never apply one style repo-wide.
- **Package manager:** pnpm for frontend and backend; `uv` for ai-service Python deps.
- **Enforcement:** lint + format + typecheck must pass for a phase's definition of done. Backend typecheck = `pnpm build` (runs `tsc`).

---

## 4. Agent Design (LangGraph)

The AI layer is not a single retrieve-then-generate call. It is a graph with a routing decision and a self-verification step. Graph lives in `ai-service/app/graph/` (`graph.py`, `node.py`, `state.py`).

**MVP graph (IMPLEMENTED, linear):**
```
classify_q → simple_rag → grounding_check → final_answer
```
- `classify_q`: classifies the question as `simple` (single lookup) vs `multi_hop` (comparison / multi-part). Output stored as `route` in state. (The multi_hop *branch* is NOT built yet — an unhandled route currently falls through to `simple_rag` with deeper `top_k`; V1 implements the real branch.)
- `simple_rag`: retrieve top-k chunks from Qdrant (filtered by `organization_id` + `user_id`), generate a cited answer.
- `grounding_check`: judge whether every claim in the draft is supported by the retrieved chunks. Fast paths: no chunks / empty draft / fallback string present → not grounded. Fail closed on LLM error.
- `final_answer`: return the draft if grounded, else the exact fallback "I don't have enough information in the available documents."

**Multi-hop graph (V1 — planned):**
```
classify_q → [simple_rag |
              multi_hop_planner → retrieve_each (fan-out, ≤4 workers) → synthesize]
           → grounding_check → final_answer
```
- `multi_hop_planner`: decomposes a comparison/multi-part question into 2–4 sub-queries.
- `retrieve_each`: one retrieval worker per sub-query, run concurrently (LangGraph `Send` / fan-out). Each returns its own chunk set; results are deduplicated.
- `synthesize`: merges sub-answers into one coherent, cited response.
- `grounding_check` + `final_answer` are reused unchanged.

**Response contract (all routes):** the answer text, citations, and `route_taken` (`simple` | `multi_hop`). Stored with the assistant message (§5), used later for audit/eval.

**Citation object (V1 target):**
```json
{ "document_id": "...", "chunk_index": 3, "snippet": "...",
  "title": "...", "source_type": "pdf", "page": 12, "url": null }
```
For web sources `url` is set and `page` is null; for markdown, `heading` replaces `page`.

**Token usage:** every query records `usage.{prompt_tokens, completion_tokens}` (V0). Multi-hop fan-out multiplies prompt tokens — the per-user daily token budget covers the whole graph run for a query, not per-node.

---

## 5. Data Model (Postgres)

Auth tables (`User`, `Session`, `Account`, `Verification`) are created and managed by better-auth via the Prisma adapter — do not define them manually. Domain tables reference user ids, and from V1, organization ids.

### 5.1 Implemented (MVP)
```prisma
model User { id, name, email, emailVerified, image, createdAt, updatedAt } // better-auth-managed
model Document { id, userId, title, sourceType, status, chunkCount, createdAt }
// status: pending | chunking | embedded | failed
model Conversation { id, userId, title, createdAt }
model Message { id, conversationId, role, content, citations(Json), routeTaken, createdAt }
```

### 5.2 Planned (per phase)
V0 — usage metering:
```prisma
model UsageDaily {
  id               String   @id @default(cuid())
  userId           String
  date             DateTime @db.Date
  queryCount       Int      @default(0)
  promptTokens     BigInt   @default(0)
  completionTokens BigInt   @default(0)
  embeddingTokens  BigInt   @default(0)
  uploadCount      Int      @default(0)
  @@unique([userId, date])
}
```

V1 — tenancy insurance + provenance + feedback:
- `Organization { id, name, slug }`; `User.organizationId` (set at signup via a better-auth `user.create.after` hook, seeded default org), `Document.organizationId`, `Conversation.organizationId`.
- `Document` += `sourceUrl`, `contentHash` (dedup), `fetchedAt`, `chunkConfig`, `embeddingModel`.
- `Message.feedback` enum (`none | up | down`) + `POST /api/chat/:messageId/feedback`.

V2 — identity linking:
- `LinkedIdentity { id, userId, organizationId, provider, externalId, @@unique([provider, externalId]) }`.

V3 — organizations/RBAC (concepts locked here; schema finalized when V3 is planned):
- `Membership { userId, organizationId, departmentId?, roleId }`
- `Department { id, organizationId, name }`
- `Role`, `Permission` (resource × action matrix), `DocumentAcl` (scope: org-wide | department | role | specific users).

---

## 6. API Contracts

**Node → FastAPI** (service-to-service; every request needs `Authorization: Bearer <SERVICE_TOKEN>`)

```
POST /ingest
Request:  { document_id, user_id, organization_id, content, source_type, source_url?, title?, sections? }
Response: { status: "embedded", chunks_created: <int>, usage: { embedding_tokens: <int> } }

POST /query/stream   (SSE; used by web chat, and by Node internally for channels in V2)
Request:  { conversation_id, user_id, organization_id, question, history: [{role, content}], top_k }
Stream events:
  data: {"token": "word "}          (repeated until the answer completes)
  data: {"done": true, citations: [...], route_taken: "...", usage: { prompt_tokens, completion_tokens }}

POST /query   (JSON; used for chat-app replies in V2 and the eval harness in V1)
Request:  same body as /query/stream
Response: { answer, citations, route_taken, usage }
```

`organization_id` is always stamped by Node from the authenticated session — never accepted from the client.

**Next.js → Node** (better-auth under the hood; session cookie)

```
POST /api/auth/sign-up/email      POST /api/auth/sign-in/email      POST /api/auth/sign-out
GET  /api/auth/get-session
POST /api/documents/upload        (multipart file; or URL/repo link in V1)
GET  /api/documents               (list with status)
POST /api/chat                    (question, conversation_id) → SSE streamed response
GET  /api/conversations/:id
POST /api/chat/:messageId/feedback    (V1)
```

FastAPI must never be called from the frontend directly. All FastAPI endpoints require the service-to-service token.

---

## 7. Non-Functional Requirements

- **Auth:** email + password via better-auth; passwords hashed by better-auth; sessions are better-auth cookies (not hand-rolled JWTs). Node is the single auth boundary — better-auth never runs in the frontend.
- **Isolation:** all retrieval filtered by `organization_id` and `user_id` at the Qdrant query level — no cross-tenant/cross-user data leakage, ever. V3 adds department/role markers to this filter.
- **Quota/cost control (V0):** per-user daily budgets and lifetime caps, enforced by Node before work starts; FastAPI reports real usage; reject with `429` rather than cutting a stream.
- **Streaming:** web chat streams token-by-token via SSE FastAPI → Node → client. Chat-app (V2) replies are non-streamed (typing + final message).
- **Resilience:** ingestion failures set `documents.status = 'failed'`, visible in the UI — never silently dropped. ACL refresh failure (V3) locks a document out (leak-closed default).
- **Security:** URL ingestion (V1) must include SSRF protection (block private/internal ranges), size caps, and content-hash dedup.
- **Environment-driven config:** embedding model, LLM provider, API keys, and all quota limits configurable via `.env` — never hardcoded.
- **Local dev:** whole stack runnable locally with Docker (Postgres + Qdrant) + `.env.example` provided; ai-service runs via `uvicorn`.

---

## 8. Implementation Status (MVP — delivered)

Implemented and verified; do not rebuild:
1. Auth end-to-end: better-auth mounted at `/api/auth/*` (`backend/src/index.ts`); frontend uses the better-auth React client (`frontend/lib/auth-client.ts`).
2. `.md` / `.txt` upload: multer (2 MB cap) → `upload.service.ts` → FastAPI `/ingest` → status transitions `pending → chunking → embedded | failed` (`documents.route.ts`, `upload.service.ts`).
3. Chat: `chat.controller.ts` persists the user message, streams AI tokens via SSE, persists the assistant message with citations + route.
4. Graph: linear `classify_q → simple_rag → grounding_check → final_answer` (`ai-service/app/graph/`). Multi-hop branch NOT yet built.
5. Qdrant collection `doc_chunks` with a `user_id` payload index; search filtered by `user_id`.
6. Frontend: signup/login, dashboard, documents list/upload, chat + conversation sidebar (`frontend/app/`).
7. Isolation: user-scoped retrieval only (V1 adds org scoping).

## 9. Roadmap (phases)

Phase order is intentional and dependency-driven. Each phase is complete when its acceptance criteria pass (lint + format + typecheck included). **Build V0 first.**

### V0 — Guardrails (next)
- **Scope:** per-user daily quota guard (queries, prompt tokens, completion tokens, embedding tokens) + lifetime caps (documents, conversations) + per-file size cap; per-user/per-IP burst rate limits on chat, upload, and auth; `UsageDaily` metering; `usage` in FastAPI responses; `429` surfaced in the UI.
- **Config (.env):** `QUOTA_MAX_QUERIES_PER_DAY=30`, `QUOTA_MAX_PROMPT_TOKENS_PER_DAY=120000`, `QUOTA_MAX_COMPLETION_TOKENS_PER_DAY=120000`, `QUOTA_MAX_EMBED_TOKENS_PER_DAY=200000`, `QUOTA_MAX_DOCUMENTS=20`, `QUOTA_MAX_CONVERSATIONS=50`, `QUOTA_MAX_FILE_MB=5`, `RATE_LIMIT_QUERIES_PER_MIN=5`, `RATE_LIMIT_UPLOADS_PER_HOUR=5`.
- **Acceptance:** the 31st query in a day → `429` before any token is spent; FastAPI usage lands in Postgres and gates the next request; 21st upload / 51st conversation blocked with a clear message.

### V1 — Knowledge
- **Scope:**
  - (a) Org tenancy insurance: `Organization` + `organization_id` on user/document/conversation + Qdrant payload/filter/index, stamped by Node.
  - (b) Provenance chunking: Node `extract.service.ts` (md/txt → PDF → GitHub repo → web URL), section/page-aware `chunker.py`, richer payload + citations (`title`, `source_type`, `source_url`, `page`, `heading`); content snapshotted at ingestion, hash dedup, SSRF guard, size caps.
  - (c) Multi-hop RAG: `multi_hop_planner → retrieve_each (fan-out ≤4) → synthesize`.
  - (d) Eval harness (`ai-service/evals/golden.json` + `run_evals.py`: retrieval hit-rate + grounding pass-rate) and per-answer feedback.
- **Acceptance:** a PDF answer cites a page; a URL answer links the source; a "compare X vs Y" question returns a synthesized, cited `multi_hop` answer; baseline eval metrics recorded before and after each change.

### V2 — Everywhere
- **Scope:** Slack adapter (Bolt, socket mode), then Discord (`discord.js`); OAuth identity linking (`LinkedIdentity`); unlinked identity → "link your account", no answer; non-streamed replies (typing + message/edit); same core chat path + quotas as the web UI.
- **Acceptance:** link a Slack account, ask in Slack, receive a cited answer with the same grounding behavior; a different, unlinked identity is refused.

### V3 — Teams
- **Scope:** multi-tenant orgs + onboarding/invites; departments (scoping) vs roles (permissions) with a permission matrix; access-scoped retrieval (Qdrant compound filter: `organization_id` + dept/role markers; Postgres ACL is the source of truth; payload refreshed on ACL change; lock-out on refresh failure); admin UI.
- **Acceptance:** two orgs cannot see each other's content; a revoked document is invisible to the revoked user within the enforcement boundary.

### V4 — Connect
- **Scope:** MCP server on Node exposing `search_docs`, `get_document`, `query`, `create_flag`; tools carry user/org context and filter by it; external agents can query org knowledge.
- **Acceptance:** an external MCP client (e.g. Claude Desktop) can search and query docs with correct isolation; `create_flag` writes through to Node and is recorded.

## 10. Explicitly Out of Scope / Deferred

- Global daily token envelope + signup abuse guard (email verification, IP-throttled signup) — on the shelf; revisit when per-user quotas show signs of account farming.
- WhatsApp integration — until a paid phase (Meta Business API).
- Semantic memory layer (mem0-style) — deferred indefinitely; revisit only with a concrete problem statement.
- Generative/hybrid retrieval upgrades (BM25 hybrid search, cross-encoder reranking) — hold until the eval harness shows the current retrieval failing; then prove improvement with evals.

---

*Last updated: 2026-09-17. This document is the source of truth for architecture and scope.*