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
| LLM | Groq (`langchain-groq`, `LLM_MODEL` env var) |
| Observability | LangSmith |
| Guardrails | Guardrails AI (`ProfanityFree`, `BanList`) + regex prompt-injection filter |

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

### V0 — Guardrails 
- [x] Groq chat LLM (`langchain-groq`); Gemini retained for embeddings
- [x] LangSmith tracing (per-node spans, route, grounding verdict, token usage)
- [x] Safety guardrails — regex prompt-injection filter + Guardrails AI `input_guard`/`output_guard` (`ProfanityFree`, `BanList`)
- [x] Per-user daily quotas (queries, uploads — simple request counts) + lifetime caps (documents, conversations) + per-file size cap
- [ ] **Burst rate limiting per user/IP** on chat, upload, and auth (return `429` before any work)
- [x] `UsageDaily` metering — Node records per-user daily counts and enforces budgets
- [x] `429` surfaced in the UI before any work begins

**V0 Acceptance:**
- [ ] 31st query in a day → `429` before any work/token spend
- [ ] Burst limit exceeded (chat/upload/auth) → `429` with clear message
- [ ] Prompt-injection attempt blocked by `input_guard` with `route_taken: "blocked"` and zero tokens
- [ ] Profane/banned output replaced by fallback via `output_guard`
- [ ] File > `QUOTA_MAX_FILE_MB` rejected upfront (`413`/`429`)


### V1 — LangGraph Hardening + Streaming + Minimal Tenancy
**Goal:** Evolve agent to robust graph with fallback, retry, off-topic handling, improve streaming, and add minimal org isolation.

**LangGraph Design:**
```
START → input_guard
input_guard → fallback_response   [invalid input]
input_guard → classify_q          [valid input]
classify_q  → fallback_response   [route == off_topic]
classify_q  → simple_rag          [route == simple OR route == multi_hop]
simple_rag  → grounding_check
grounding_check → final_answer        [grounded == true]
grounding_check → simple_rag          [grounded == false AND retry_count < 1]
grounding_check → fallback_response   [grounded == false AND retry_count >= 1]
fallback_response → final_answer
final_answer → END
```

- [ ] **State:** Add `retry_count` (int, default 0). Track `route` values (`simple`, `multi_hop`, `off_topic`, `invalid_input`). Define `route_taken` as `simple | multi_hop | blocked | off_topic`.
- [ ] **Nodes/Edges:** Implement `input_guard` (separates invalid vs allowed), `fallback_response`, wire conditional edges with retry logic.
- [ ] **Streaming:** Harden SSE (FastAPI → Node → client), verify citations arrive in trailing `done` event; ensure no buffering/mid-stream cutoff.
- [ ] **Minimal Org Tenancy:** Add `organization_id` to `User`, `Document`, `Conversation`, `UsageDaily`; default org on signup; **enforce Qdrant filter by `organization_id` AND `user_id`** on all retrieval (no UI/invites/RBAC).
- [ ] **Backend/Frontend Polish:** Align contracts with new `route_taken` values; surface clearer errors.
- [ ] **Scope:** Remove per-answer feedback loop (tighten scope). Multi-hop branch deferred.

**V1 Acceptance:**
- [ ] Off-topic question → fallback_response (`route_taken: "off_topic"`)
- [ ] Invalid/malicious input → blocked/fallback per edges; `blocked` only on input_guard rejection
- [ ] Grounding fails once → retry (retry_count increments), fails twice → fallback
- [ ] SSE streaming works end-to-end; citations + `route_taken` in trailing event
- [ ] All retrieval filtered by `organization_id` AND `user_id` (isolation verified)

### V2 — PDF Ingestion + Provenance + Voice Agent (Demo Ready)
**Goal:** Ship PDF ingestion with provenance-rich citations and voice (STT + TTS)

**PDF Ingestion:**
- [ ] **Node Extractor:** PDF parsing (page-aware) with page numbers and text extraction
- [ ] **Pipeline:** `source_type: "pdf"`, provenance fields (`page`, `title`, `source_type`, `source_url`), chunker page-aware
- [ ] **Citations:** Return `page` in citations; UI supports PDF display context
- [ ] **Upload:** Extend document upload to accept PDFs with same status transitions

**Voice Agent (STT + TTS):**
- [ ] **Frontend:** Mic input in chat (Web Speech API + fallback to MediaRecorder)
- [ ] **STT:** Speech-to-text (browser-first for demo; optional backend `/api/voice/transcribe`)
- [ ] **TTS:** Text-to-speech for assistant answer (browser `speechSynthesis` or backend `/api/voice/synthesize`)
- [ ] **Backend:** Minimal auth-protected voice endpoints if not using browser APIs
- [ ] **Integration:** Speak → transcribe → query → stream → TTS playback

**Deferred if tight:** GitHub repo/URL ingestion (can move to V2b).

**V2 Acceptance:**
- [ ] Upload PDF → `embedded` with page-aware chunks
- [ ] PDF query returns citations that include `page` numbers
- [ ] Voice roundtrip works in chat UI (speak question → hear answer)
- [ ] End-to-end works through Node (no direct AI service calls)

### V3 — Teams & Integrations
- [ ] Slack adapter (Bolt) + Discord adapter (`discord.js`)
- [ ] OAuth login & identity linking; unlinked identities refused
- [ ] Non-streamed replies (typing indicator + final message)
- [ ] Multi-tenant orgs with onboarding/invites
- [ ] Departments (scoping) + roles (permissions) with permission matrix
- [ ] Access-scoped retrieval at Qdrant level (org + dept/role markers)

### V4 — Multi-Hop + Connect
- [ ] **Multi-hop RAG:** `multi_hop_planner → retrieve_each (fan-out ≤4) → synthesize` with dedup; reuse grounding/fallback
- [ ] MCP server on Node (`search_docs`, `get_document`, `query`, `create_flag`)
- [ ] External agents can query org knowledge with correct isolation

### V5 — Multitenancy (Advanced)
- [ ] Advanced multitenancy with granular permissions (as needed; planned later)

**Explicitly deferred:** WhatsApp, semantic memory layer (mem0-style), signup abuse guard (email verification/IP throttling), per-token usage metering (FastAPI-reported token budgets), BM25/cross-encoder retrieval upgrades, GitHub repo/URL ingestion (beyond MVP PDF).

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
