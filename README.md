┌─────────────┐        ┌──────────────────┐        ┌───────────────────┐
│  Next.js     │ HTTPS  │   Node.js (BFF)   │ HTTPS  │   FastAPI (AI svc) │
│  - Chat UI   │──────► │  - Auth (JWT)     │──────► │  - /ingest         │
│  - Upload UI │ SSE    │  - Postgres       │ stream │  - /query (agent)  │
│  - Admin UI  │◄────── │  - Rate limiting  │◄────── │  - LangGraph graph │
└─────────────┘        │  - Conversation    │        │  - Qdrant client   │
                        │    persistence     │        └─────────┬──────────┘
                        │  - Service-to-     │                  │
                        │    service auth    │                  ▼
                        └────────┬──────────┘        ┌───────────────────┐
                                 │                    │   Qdrant (vector) │
                                 ▼                    └───────────────────┘
                        ┌──────────────────┐
                        │ Postgres         │
                        │ users, convos,   │
                        │ docs metadata    │
                        └──────────────────┘