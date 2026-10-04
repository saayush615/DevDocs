# DevDocs Copilot — PRD

**Source of truth:** Architecture, scope, and phase boundaries. Demo focus: Working LangGraph + rate limiting + PDF ingestion + voice (STT/TTS).

**Rule:** Frontend never calls AI service directly. Node is the single auth/policy boundary. All retrieval filtered by `organization_id` AND `user_id` at Qdrant level.

---

## 1. Overview

- **Name:** DevDocs Copilot
- **Stack:** Next.js (TS, App Router, react-hook-form+zod) • Express 5 (Node, better-auth) • FastAPI (LangGraph, Python) • Qdrant • PostgreSQL (Prisma) • Gemini embeddings • Groq LLM • LangSmith • Guardrails AI
- **Target:** Engineers/new hires needing fast, cited answers from internal docs
- **MVP:** Auth, `.md`/`.txt` upload, streamed cited chat, grounding check, persisted conversations

---

## 2. Architecture

```
Next.js (frontend) → Node.js (BFF: auth, quotas, system of record, SSE bridge)
                        ↓  (service-to-service Bearer token)
                     FastAPI (stateless: /ingest, /query + LangGraph)
                        ↓
                     Qdrant (doc_chunks, filtered by org_id+user_id)
```

- **Node:** Auth (better-auth), quotas + burst rate limits (V0), usage metering, upload/chat, channel gateway (V3), MCP (V4). Never exposes FastAPI URL to frontend.
- **FastAPI:** Stateless, trusts only service token. `/ingest` chunks+embeds (Gemini) → Qdrant; `/query` runs LangGraph → SSE back to Node.
- **Qdrant:** All queries filtered by `organization_id` AND `user_id`. Keyword indexes on both.
- **Frontend:** Next.js App Router, react-hook-form + zod, streams via SSE; citations in trailing `done` event.

---

## 3. LangGraph

**V1 Target:**
```
START → input_guard
input_guard → fallback_response [invalid]
input_guard → classify_q [valid]
classify_q  → fallback_response [off_topic]
classify_q  → simple_rag [simple OR multi_hop]
simple_rag  → grounding_check
grounding_check → final_answer [grounded]
grounding_check → simple_rag [!grounded AND retry_count<1]
grounding_check → fallback_response [!grounded AND retry_count>=1]
fallback_response → final_answer
final_answer → END
```

**Final (V4, Multi-hop):**
```
START → input_guard
input_guard → fallback_response [invalid]
input_guard → classify_q [valid]
classify_q  → fallback_response [off_topic]
classify_q  → simple_rag [simple]
classify_q  → multi_hop_planner [multi_hop]
simple_rag → grounding_check
multi_hop_planner → retrieve_each (fan-out ≤4) → synthesize → grounding_check
grounding_check → final_answer [grounded]
grounding_check → simple_rag [!grounded AND retry_count<1 AND simple]
grounding_check → multi_hop_planner [!grounded AND retry_count<1 AND multi_hop]
grounding_check → fallback_response [!grounded AND retry_count>=1]
fallback_response → final_answer
final_answer → END
```

- `route_taken`: `simple|multi_hop|blocked|off_topic`. `blocked` only on `input_guard` rejection (zero tokens).
- `retry_count` in state; single retry on grounding fail before fallback.
- Grounding fail-closed. `output_guard` (ProfanityFree+BanList) can replace whole answer with fallback.

### 2.3 Goals (V1 — LangGraph Hardening + Streaming + Minimal Tenancy)
- **LangGraph hardening:** Add `retry_count`, handle `off_topic`/`invalid_input`, implement `input_guard` + `fallback_response`, retry-on-grounding (once), wire correct edges.
- **Streaming:** Harden SSE (FastAPI→Node→client), ensure citations arrive in trailing `done` event with no buffering.
- **Minimal org tenancy:** Add `organization_id` to `User`, `Document`, `Conversation`, `UsageDaily`; default org on signup; enforce Qdrant filter by `organization_id` AND `user_id` on all retrieval.
- **Polish:** Align contracts with `route_taken` (`simple|multi_hop|blocked|off_topic`), surface clearer errors.
- **Scope:** Remove per-answer feedback loop; multi-hop branch deferred.

### 2.4 Goals (V2 — PDF + Provenance + Voice)
- **PDF ingestion:** Page-aware extraction with page numbers; `source_type: "pdf"`, provenance fields (`page`, `title`, `source_type`, `source_url`); citations include `page`.
- **Voice agent:** Mic input, STT (browser-first), TTS for assistant answer; auth-protected voice endpoints if using backend APIs.
- **Integration:** Speak → transcribe → query → stream → speak.

### 2.5 Goals (V3 — Teams & Integrations)
- **Integrations:** Slack (Bolt) + Discord (`discord.js`); OAuth login + identity linking (unlinked refused).
- **Chat behavior:** Non-streamed replies for channels (typing indicator + final/edit).
- **Teams:** Multi-tenant orgs + invites; departments/roles/permissions matrix; access-scoped retrieval (org + dept/role markers); leak-closed on ACL change.

### 2.6 Goals (V4 — Multi-Hop + Connect)
- **Multi-hop:** `multi_hop_planner → retrieve_each (≤4) → synthesize` with dedup; reuse grounding/fallback.
- **Connect:** MCP server on Node (`search_docs`, `get_document`, `query`, `create_flag`) with user/org context; external agents query with correct isolation.

### 2.7 Non-Goals
- No general-purpose chatbot (no small talk, no unrelated Q&A).
- No real-time collaborative editing of docs.
- No non-text file types (images, video).
- No WhatsApp until paid phase (Meta Business API).
- No semantic memory layer (mem0-style). If needed, prefer conversation summarization over unattributed memory.

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
  - **Quotas + rate limiting (V0):** enforces per-user daily quotas and per-IP burst limits *before* starting upload or chat work; returns `429` pre-SSE.
  - **Usage metering (V0):** persists per-user daily counts (`UsageDaily`) from Node's own request tracking — FastAPI reports no token usage in V0.
  - **Document upload endpoint:** accepts file/URL/repo link, extracts raw text (V1: md/txt/PDF/GitHub/web via `extract.service.ts`), stores metadata, forwards content + provenance to FastAPI `/ingest`.
  - **Chat endpoint:** accepts question + conversation_id, checks quota, forwards to FastAPI `/query/stream` with service-to-service auth, streams the response back via SSE (token-by-token), persists message + citations + route.
  - **Channel gateway (V2):** thin adapters (`slack.adapter.ts`, `discord.adapter.ts`) normalizing inbound to `{identity, org, text}` and calling the same core chat path as the web UI, so quotas and metering apply identically.
  - **MCP server (V4):** `search_docs`, `get_document`, `query`, `create_flag` tools; all AI work still routed through FastAPI.
  - Conversation CRUD endpoints.
  - **Never exposes FastAPI's URL or embedding/LLM logic to the frontend.**

### 3.3 AI Service (FastAPI)
- Stateless. Trusts only requests carrying a valid service-to-service token (`auth.py`) issued by Node.
- Responsibilities:
  - `/ingest`: chunk incoming text (heading-aware; page-boundary-safe for PDFs), embed, upsert to Qdrant with payload `{document_id, user_id, organization_id, chunk_index, content_preview, title, source_type, source_url, page?, heading?}`.
- `/query`: run the LangGraph agent (§4) and stream the final answer + citations back to Node. (V0: no token-usage reporting — per-node `usage_metadata` is a V1+ addition.)
  - **Observability (V0):** every graph run emits a **LangSmith** trace (per-node spans, route, grounding verdict, token usage). Enabled by env (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`).
  - **Safety guardrails (V0):** `input_guard` screens the question (regex prompt-injection filter + **Guardrails AI** `ProfanityFree`) before classification; `grounding_check` keeps the existing simple custom validator; `output_guard` screens the final answer (**Guardrails AI** `ProfanityFree` + `BanList`, terms from `GUARD_BANNED_WORDS`). Input/output guard nodes are env-toggleable and fail closed.
- Embedding model: Gemini `gemini-embedding-001/002` (free tier); dimension in `settings.EMBEDDING_DIM` (`app/config.py`). **Embeddings stay on Gemini.**
- LLM: **Groq** (`langchain-groq`, `GROQ_API_KEY`); env-configurable model (`LLM_MODEL`, `LLM_TEMPERATURE`); used for classification, answer drafting, and grounding.
- Node is the only client. FastAPI enforces no policy — V0 quotas are enforced entirely by Node.

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

## 4. Data Model (Key)

**Implemented (MVP):**
- `User` (better-auth), `Document` (userId,title,sourceType,status,chunkCount,createdAt; status: pending|chunking|embedded|failed)
- `Conversation` (userId,title,createdAt)
- `Message` (conversationId,role,content,citations Json?,routeTaken,createdAt)

**Planned:**
- **V0:** `UsageDaily` (userId,date,queryCount,uploadCount; unique[userId,date]) — Node-enforced
- **V1:** `Organization` + `organization_id` on User/Document/Conversation; `Document` += `sourceUrl,contentHash,fetchedAt,chunkConfig,embeddingModel`
- **V2:** `LinkedIdentity` (userId,orgId,provider,externalId)
- **V3+:** `Membership`, `Department`, `Role`, `Permission`, `DocumentAcl`

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
V0 — usage metering (simplified: request counts only; token columns deferred to V1+):
```prisma
model UsageDaily {
  id          String   @id @default(cuid())
  userId      String
  date        DateTime @db.Date
  queryCount  Int      @default(0)
  uploadCount Int      @default(0)
  @@unique([userId, date])
}
```
Lifetime caps need no extra columns — Node enforces them with a `COUNT(*)` at create time.

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
Response: { status: "embedded", chunks_created: <int> }     // usage.embedding_tokens added in V1+

POST /query/stream   (SSE; used by web chat, and by Node internally for channels in V2)
Request:  { conversation_id, user_id, organization_id, question, history: [{role, content}], top_k }
Stream events:
  data: {"token": "word "}          (repeated until the answer completes)
  data: {"done": true, citations: [...], route_taken: "..."}   // usage added in V1+

POST /query   (JSON; used for chat-app replies in V2 and ad-hoc testing)
Request:  same body as /query/stream
Response: { answer, citations, route_taken }                  // usage added in V1+
```

`route_taken` is `simple` | `multi_hop` | `blocked`. A `blocked` run (input_guard rejection) returns a canned refusal with empty citations and no usage.

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

## 6. Non-Functional

- **Isolation:** `organization_id` + `user_id` at Qdrant (mandatory). Leak-closed on ACL changes (V3).
- **Quotas + rate limits (V0):** Daily quotas, lifetime caps, per-file size cap, per-user/IP burst (chat/upload/auth). Enforced by Node before work → `429` (never cut stream).
- **Guardrails (V0):** `input_guard` (regex + Guardrails AI ProfanityFree) before classify; `grounding_check` fail-closed; `output_guard` (ProfanityFree+BanList) after final. Env-toggleable.
- **Observability:** LangSmith on every run (spans, route, grounding, token usage).
- **Streaming:** SSE FastAPI→Node→client; citations in trailing `done` event. Channels non-streamed (V3).
- **Security:** SSRF protection for URL ingestion (V2+), content-hash dedup, size caps, never expose secrets, never call FastAPI from frontend.
- **Config:** Env-driven (`.env` only; never hardcoded). Never read/commit `.env` (use `.env.example`).
- **Code:** TS strict (Node/Next), Python type hints (FastAPI). ESLint+Prettier per package. `pnpm` (frontend/backend), `uv` (ai-service). No comments unless asked.

---
**Rules:** Never read/commit `.env` (use `.env.example` only). ESM requires `.js` extensions. Prisma client in `backend/src/generated/prisma` (gitignored) — run `prisma generate`. AI `/ingest` can return 200 on failure — check `status !== 'embedded'`. Avoid adding comments.

---
*Last updated: 2026-10-04.*