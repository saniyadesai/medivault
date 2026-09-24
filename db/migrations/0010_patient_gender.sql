-- Migration 0010: add gender to patients.
-- Flagged by a doctor reviewing the app: age (already covered by
-- date_of_birth) and gender are both clinically relevant context that was
-- missing from the patient record — notably the Emergency Access summary
-- (server/src/app.js) was already rendering a gender field that only ever
-- received a hardcoded null.
-- Nullable, no CHECK constraint: existing patient rows have no value yet,
-- and this mirrors blood_group's own loose VARCHAR (validated by the
-- frontend's fixed option list, not the database).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender VARCHAR(30);
