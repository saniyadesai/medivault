-- Migration 0006: specific-document access requests
-- server/src/app.js reads/writes access_requests.document_ids (JSON array of document UUIDs,
-- inserted via JSON.stringify). This column existed on the team's hosted database but was
-- never captured in a migration, so fresh databases failed with
-- "column ar.document_ids does not exist" on GET /api/dashboard/patient.
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS document_ids JSONB;
