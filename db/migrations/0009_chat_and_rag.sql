-- Migration 0009: persistent AI chat + RAG retrieval over vault documents.
-- See CHAT_RAG_INTEGRATION.md for the design this implements.
--
-- Embedding dimension is 768 (gemini-embedding-001, via the OpenAI-compatible
-- /embeddings endpoint with `dimensions: 768`) — must match EMBEDDING_DIMENSIONS
-- in .env. pgvector 0.8.6 confirmed available and enabled on both the local
-- and production (Neon) databases before writing this migration.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');

-- chat_query joins the existing audit trail (upload/view_document/download_document/...)
-- so chat-driven access to document content is audited the same way as everything else.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'chat_query';

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role chat_role NOT NULL,
  content TEXT NOT NULL,
  token_usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A join table (not a jsonb array on chat_messages) so a citation is a real FK:
-- it's removed by cascade if the cited document is deleted, and can never point
-- at a document that doesn't exist.
CREATE TABLE chat_message_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RAG text chunks. Unrelated to documents.chunk_size_bytes/total_chunks, which
-- are storage chunking of the *encrypted blob* — this table holds decrypted,
-- extracted plaintext, only ever produced server-side and never returned raw
-- to a client that isn't authorized for the source document (server/src/authz.js).
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_sessions_user_updated_idx ON chat_sessions(user_id, updated_at);
CREATE INDEX chat_messages_session_created_idx ON chat_messages(session_id, created_at);
CREATE INDEX chat_message_citations_message_idx ON chat_message_citations(message_id);
CREATE INDEX chat_message_citations_document_idx ON chat_message_citations(document_id);
CREATE UNIQUE INDEX document_chunks_document_chunk_idx ON document_chunks(document_id, chunk_index);

-- HNSW cosine-distance index for the similarity search in server/src/embeddings.js.
-- Built after the table exists; harmless to run again if chunks already exist.
CREATE INDEX document_chunks_embedding_hnsw_idx ON document_chunks
  USING hnsw (embedding vector_cosine_ops);
