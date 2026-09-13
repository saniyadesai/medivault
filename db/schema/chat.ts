import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { documents } from './documents';
import { users } from './users';

export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant', 'system']);

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userUpdatedIdx: index('chat_sessions_user_updated_idx').on(table.userId, table.updatedAt),
}));

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: chatRoleEnum('role').notNull(),
  content: text('content').notNull(),
  // Token usage from the chat-completions call, e.g. { promptTokens, completionTokens }. Optional.
  tokenUsage: jsonb('token_usage'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionCreatedIdx: index('chat_messages_session_created_idx').on(table.sessionId, table.createdAt),
}));

// Join table (not a jsonb column) so a citation is a real FK to documents — it
// disappears via cascade if the cited document is deleted, and can't reference
// a document that doesn't exist.
export const chatMessageCitations = pgTable('chat_message_citations', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  messageIdx: index('chat_message_citations_message_idx').on(table.messageId),
  documentIdx: index('chat_message_citations_document_idx').on(table.documentId),
}));
