## 1. Product Overview

**Name:** DevDocs Copilot

**Summary:** An internal knowledge-assistant web application. Users upload internal documentation (Markdown, text, PDF, GitHub README files). The system chunks and embeds the content into a vector store. Users then chat with an AI agent that retrieves relevant document chunks and answers questions with citations. The agent routes between simple single-lookup questions and multi-hop questions that require retrieving and synthesizing across multiple documents, and verifies its own answers are grounded in retrieved content before returning them.

**Problem statement:** Engineering knowledge is scattered across READMEs, wikis, and old docs. New hires and engineers waste time searching manually or asking colleagues. A shared, access-scoped, auditable Q&A system over the org's own docs solves this in a way a personal ChatGPT session cannot: it supports multi-user shared indexing, role-based access to documents, an audit trail of queries and retrieved sources, and an API other internal tools can call.

**Target user:** Engineers and new hires at a company needing fast, cited answers from internal documentation.

---

## 2. Goals and Non-Goals

**Goals (MVP):**
- User auth (signup/login).
- Upload documents (`.md`, `.txt` first; PDF and GitHub README as stretch).
- Chunk + embed documents into a vector database, scoped by user/workspace.
- Chat interface: ask a question, get a streamed, cited answer.
- Conversation history persisted per user.
- Agent routes between simple retrieval and multi-hop retrieval+synthesis.
- Agent verifies its own answer is grounded in retrieved chunks before returning it (grounding check); if not grounded, responds with "I don't have enough information" instead of guessing.

**Goals (Stretch, post-MVP):**
- Role/workspace-scoped document access control (e.g., `role: engineering | hr | all`).
- Audit log view (admin page: who asked what, what was retrieved, when).
- Agent tool-call: create a "flag/ticket" action (calls back into Node API) when it cannot answer.
- PDF and GitHub repo ingestion.
- Re-ingestion / freshness handling when a source doc changes.

**Non-goals:**
- Not building a general-purpose chatbot (no small talk, no unrelated Q&A).
- Not building real-time collaborative editing of docs.
- Not handling non-text file types (images, video) in MVP.

---

## 3. Architecture

Three-tier system. Strict rule: **the frontend never calls the AI service directly — all requests go through the Node backend**, which is the single auth boundary and system of record.

```
Next.js (frontend)
   │  HTTPS (JWT cookie/header)
   ▼
Node.js (BFF / backend)
   │  - Auth, user/session management
   │  - Postgres: users, documents, conversations, messages
   │  - Rate limiting
   │  - Calls FastAPI with a service-to-service token
   ▼
FastAPI (AI service, stateless)
   │  - /ingest: chunk + embed + upsert to Qdrant
   │  - /query: LangGraph agent execution (routing, retrieval, grounding check)
   ▼
Qdrant (vector DB)
```

### 3.1 Frontend (Next.js)
- Auth pages (signup/login).
- Document upload page + document list/status view.
- Chat interface with streaming responses and inline citations.
- Conversation history sidebar.
- (Stretch) Admin page: audit log of queries + retrieved sources.

### 3.2 Backend (Node.js)
- Framework: Express or Fastify (either acceptable; Fastify preferred for native streaming support).
- Responsibilities:
  - JWT-based auth (signup, login, session validation).
  - Document upload endpoint: accepts file, extracts raw text, stores metadata in Postgres, forwards content to FastAPI `/ingest`.
  - Chat endpoint: accepts question + conversation_id, forwards to FastAPI `/query` with service-to-service auth, streams the response back to the client via SSE, persists the resulting message + retrieved citations.
  - Conversation CRUD endpoints.
  - Rate limiting per user.
  - Never exposes FastAPI's URL or embedding/LLM logic to the frontend.

### 3.3 AI Service (FastAPI)
- Stateless. Trusts only requests carrying a valid service-to-service token from Node.
- Responsibilities:
  - `/ingest`: chunk incoming document text (recursive character splitter), generate embeddings, upsert to Qdrant with payload `{ document_id, user_id, chunk_index, content_preview }`.
  - `/query`: run the LangGraph agent (see Section 4) and stream the final answer + citations back to Node.
- Embedding model: Gemini `gemini-embedding-001 or 002` (free tier).
- LLM: Groq (fast, free tier) or `other llm`, configurable via environment variable.

### 3.4 Vector Database (Qdrant)
- Collection: `doc_chunks`.
- Vector size: match embedding model output (e.g., 768 if truncated Gemini embeddings, or default dimensionality — confirm before implementation).
- Payload fields: `document_id`, `user_id`, `chunk_index`, `content_preview`, `title`.
- All queries filtered by `user_id` (and `role`/`workspace_id` in stretch scope) to ensure retrieval isolation between users.

### 3.5 Code Quality & Language Standards

- **Language:** TypeScript for both the Next.js frontend and the Node.js backend (strict mode enabled in `tsconfig.json`). FastAPI service remains Python with type hints (Pydantic models for all request/response schemas).
- **Linting:** ESLint configured for both Next.js and Node.js projects, extending recommended TypeScript rules.
- **Formatting:** Prettier configured for both Next.js and Node.js projects, run via pre-commit hook or `pnpm run format`.
- **Package manager:** pnpm for both the Next.js frontend and the Node.js backend (no npm/yarn lockfiles). Use `pnpm` for all installs and script execution.
- **Enforcement:** lint + format checks should pass before any code is considered part of the MVP Definition of Done (Section 8).

---

## 4. Agent Design (LangGraph)

The AI layer is not a single retrieve-then-generate call. It is a graph with a routing decision and a self-verification step.

**MVP graph:**
```
classify_q → simple_rag → grounding_check → final_answer
```
- `classify_q`: LLM call classifying the question as simple lookup vs. multi-hop/comparison.
- `simple_rag`: embed question, retrieve top-k chunks from Qdrant (filtered by user_id), generate answer with citations.
- `grounding_check`: verify the generated answer's claims are supported by the retrieved chunks. If not supported, either retry retrieval with a reformulated query or return "I don't have enough information in the available documents."

**Stretch graph (add after MVP graph is stable):**
```
classify_q → multi_hop_planner → retrieve_each (loop over sub-queries) → synthesize → grounding_check → final_answer
```
- `multi_hop_planner`: breaks a comparison/multi-part question into sub-queries.
- `retrieve_each`: retrieves chunks per sub-query.
- `synthesize`: combines sub-answers into one coherent, cited response.

Every response returned to the user must include: the answer text, a list of citations (`document_id`, `chunk_index`, snippet), and which route was taken (`simple` or `multi_hop`) — the route is stored for later audit/eval purposes.

---

## 5. Data Model (Postgres)

```sql
users (
  id, email, password_hash, role, created_at
)

documents (
  id, user_id, title, source_type, source_url, status, created_at
)
-- source_type: 'markdown' | 'text' | 'pdf' | 'github_readme'
-- status: 'pending' | 'chunking' | 'embedded' | 'failed'

document_chunks (
  id, document_id, chunk_index, content, qdrant_point_id, token_count
)

conversations (
  id, user_id, title, created_at
)

messages (
  id, conversation_id, role, content, retrieved_chunk_ids[], route_taken, created_at
)
-- role: 'user' | 'assistant'
```

---

## 6. API Contracts

**Node → FastAPI**
```
POST /ingest
Request:  { document_id, user_id, content, source_type }
Response: { status: "embedded", chunks_created: <int> }

POST /query
Request:  { conversation_id, user_id, question, history: [{role, content}] }
Response (streamed, then final JSON):
  { answer, citations: [{document_id, chunk_index, snippet}], route_taken }
```

**Next.js → Node**
```
POST /api/auth/signup
POST /api/auth/login
POST /api/documents/upload      (multipart file)
GET  /api/documents              (list with status)
POST /api/chat                   (question, conversation_id) → streamed response
GET  /api/conversations/:id
```

FastAPI must never be called from the frontend directly. All FastAPI endpoints require a service-to-service token issued by Node.

---

## 7. Non-Functional Requirements

- **Auth:** JWT-based; passwords hashed (bcrypt/argon2).
- **Isolation:** all retrieval must be filtered by `user_id` at the Qdrant query level — no cross-user data leakage.
- **Streaming:** chat responses must stream token-by-token from FastAPI through Node to the client (SSE).
- **Resilience:** ingestion failures must set `documents.status = 'failed'` and be visible in the UI, not silently dropped.
- **Environment-driven config:** embedding model, LLM provider, and API keys must be configurable via `.env`, not hardcoded.
- **Local dev:** entire stack must be runnable locally with Docker (Qdrant) + `.env.example` provided.

---

## 8. Milestone Definition of Done (MVP)

The MVP is complete when a new user can, without any code changes:
1. Sign up and log in.
2. Upload a `.md` or `.txt` document and see its status move to "embedded."
3. Ask a question in the chat UI and receive a streamed, cited answer.
4. See the question routed correctly (simple vs. multi-hop) and see a "not found" response when the answer isn't in the docs (i.e., the grounding check works).
5. Reload the page and see their conversation history persisted.

---

## 9. Explicitly Out of Scope for MVP (do not build yet)

- Role/workspace access control beyond user-level isolation.
- Admin audit log UI.
- Agent tool-calling actions (ticket creation, escalation).
- PDF/GitHub ingestion.
- Re-indexing on document update.