# DevDocs Copilot

## 1. What is this project?

DevDocs Copilot is an internal knowledge assistant. Instead of engineers digging through scattered READMEs, wikis, and old docs to find answers, they upload their documentation once and then just ask questions in plain English. The system finds the relevant parts of the docs and answers with citations, so people trust where the answer came from. It also knows when a question needs digging through multiple documents instead of just one, and it double-checks its own answer against the source docs before replying, instead of guessing.

## 2. Tech Stack

- **Frontend:** Next.js (TypeScript)
- **Backend:** Node.js + Express (TypeScript)
- **AI Service:** FastAPI (Python) + LangGraph
- **Vector DB:** Qdrant
- **Database:** PostgreSQL
- **Embeddings:** Gemini Embedding API
- **LLM:** Groq / OpenAI (configurable)

## 3. Architecture

```
┌─────────────┐        ┌──────────────────┐        ┌───────────────────┐
│  Next.js     │ HTTPS  │   Node.js (BFF)   │ HTTPS  │   FastAPI (AI svc) │
│  - Chat UI   │──────► │  - Auth (JWT)     │──────► │  - /ingest         │
│  - Upload UI │ SSE    │  - Postgres       │ stream │  - /query (agent)  │
│  - Admin UI  │◄────── │  - Rate limiting  │◄────── │  - LangGraph graph │
└─────────────┘        └────────┬──────────┘        └─────────┬──────────┘
                                 │                              │
                                 ▼                              ▼
                        ┌──────────────────┐         ┌───────────────────┐
                        │ Postgres         │         │   Qdrant (vector) │
                        │ users, convos,   │         │                   │
                        │ docs metadata    │         └───────────────────┘
                        └──────────────────┘
```

Next.js never talks to FastAPI directly — every request goes through Node, which handles auth and owns the data.

## 4. MVP TODO

- [ ] User signup/login (JWT auth)
- [ ] Upload document (`.md` / `.txt`)
- [ ] Chunk + embed document, store in Qdrant
- [ ] Chat endpoint: ask question, get streamed answer
- [ ] Citations shown with each answer
- [ ] Agent routes simple vs. multi-hop questions
- [ ] Grounding check before returning an answer
- [ ] Conversation history saved and reloadable