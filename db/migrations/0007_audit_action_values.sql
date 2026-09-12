-- Migration 0007: audit_action enum values the server already writes.
-- Without these, logAudit() fails with 'invalid input value for enum audit_action'
-- (caught and logged, so AI summaries and specific-document access requests were
-- silently left out of the audit trail).
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ai_summarize';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'request_document_access';
