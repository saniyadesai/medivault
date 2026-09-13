import { index, integer, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';
import { documents } from './documents';

// NOTE on how this project actually runs: `drizzle-orm`/`drizzle-kit` are not
// installed as dependencies (see package.json) — every other table in db/schema/
// is documentation of the schema that `db/migrations/*.sql` implements by hand,
// and server/src/app.js queries via plain `pg`, not the Drizzle query builder.
// This file follows that same pattern: it documents the shape, but the real
// `vector(768)` column and its cosine-similarity queries live in
// db/migrations/0009_chat_and_rag.sql and server/src/embeddings.js, issued as
// raw SQL via `pool.query` + the `<=>` operator, matching how everything else
// in this codebase already talks to Postgres.
//
// `chunkSizeBytes` / `totalChunks` on `documents` (db/schema/documents.ts) are
// unrelated storage chunking of the encrypted blob — don't confuse them with
// the RAG text chunking here.

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  // Dimension must match EMBEDDING_DIMENSIONS (.env) — 768 by default (gemini-embedding-001, truncated via MRL).
  embedding: vector('embedding', { dimensions: 768 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentChunkIdx: index('document_chunks_document_chunk_idx').on(table.documentId, table.chunkIndex),
}));
