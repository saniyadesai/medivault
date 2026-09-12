-- Migration 0008: one grant row per (document, grantee).
-- PATCH /api/access-requests/:id approve does
--   INSERT ... ON CONFLICT (document_id, grantee_user_id) DO UPDATE
-- which needs a matching unique index; without it every approval fails with
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
CREATE UNIQUE INDEX IF NOT EXISTS grants_document_grantee_uidx
  ON document_access_grants (document_id, grantee_user_id);
