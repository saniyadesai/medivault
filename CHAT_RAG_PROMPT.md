Read CHAT_RAG_INTEGRATION.md in this repo's root fully before doing anything
else. It's a spec for adding a persistent, multi-turn AI chat with RAG
(retrieval-augmented generation) over the documents already stored in this
vault, written specifically for this project's actual stack (Vite + React,
Express, Drizzle + Postgres) and existing conventions — it is not something
to copy from another project, it's something to build fresh here.

Implement it end-to-end: the Drizzle schema + migration, the embedding/
chunking/retrieval pipeline, the Express chat routes, and the React chat
UI — following this project's existing conventions (the Drizzle schema
style in db/schema/, the requireAuth middleware, the AI_BASE_URL/AI_MODEL/
AI_API_KEY/AI_TIMEOUT_MS pattern already used by server/src/app.js's
/api/ai/summarize/:id endpoint, and the fetch-wrapper style in
src/services/vaultApi.js).

Before writing code, ask me directly about the open questions listed near
the end of CHAT_RAG_INTEGRATION.md ("Things to ask the user instead of
guessing") — in particular which embedding-capable API/model I have access
to, and whether pgvector is available on my Postgres instance. Don't guess
or silently default these.

Hard requirement, not optional: retrieval must reuse the exact same
document-authorization check already used by the download and summarize
endpoints (server/src/app.js, the three-tier check around lines
1046-1062) — extract it into a shared helper and apply it before any
similarity search runs, so a user's chat can never surface content from a
document they aren't authorized to view. Treat this as a security
requirement for a medical-records app, not a nice-to-have.

Work through the "Suggested build order" at the bottom of
CHAT_RAG_INTEGRATION.md in order, confirming as you go that the file/line
references in the doc still match the current code (it's a snapshot, the
code is the source of truth). Update .env.example as you add new
environment variables.
