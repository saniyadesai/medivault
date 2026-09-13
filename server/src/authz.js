import { pool } from './db.js';

export async function getPatientId(userId) {
  const { rows } = await pool.query('SELECT id FROM patients WHERE user_id = $1', [userId]);
  return rows[0]?.id || null;
}

export async function getDoctorId(userId) {
  const { rows } = await pool.query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
  return rows[0]?.id || null;
}

export async function getHospitalId(userId) {
  const { rows } = await pool.query('SELECT id FROM hospitals WHERE user_id = $1', [userId]);
  return rows[0]?.id || null;
}

/**
 * The single source of truth for "can this user see this document's content?"
 * Used by download, summarize, and chat retrieval — extracted so all three stay
 * in lockstep instead of re-implementing the same three-tier check.
 *
 * Authorized if any of:
 *   1. The requester is the patient who owns the document.
 *   2. The requester uploaded the document (doctor/hospital).
 *   3. The requester holds an approved, unrevoked, unexpired access grant.
 *
 * @param {{ patient_id: string, uploaded_by_user_id: string }} doc - a row from `documents`
 * @param {string} userId
 * @param {string} userRole
 * @returns {Promise<boolean>}
 */
export async function isAuthorizedForDocument(doc, userId, userRole) {
  if (userRole === 'patient') {
    const pid = await getPatientId(userId);
    if (doc.patient_id === pid) return true;
  }
  if (doc.uploaded_by_user_id === userId) return true;

  const grantR = await pool.query(
    `SELECT id FROM document_access_grants
     WHERE document_id = $1 AND grantee_user_id = $2 AND status = 'approved'
       AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
    [doc.id, userId]
  );
  return grantR.rowCount > 0;
}

/**
 * Filters a list of document ids down to only those the user is authorized for.
 * This is the query-level filter RAG retrieval must apply BEFORE any similarity
 * search runs — never "search everything, then filter the response text".
 *
 * @param {string[]} documentIds
 * @param {string} userId
 * @param {string} userRole
 * @returns {Promise<string[]>} the subset of documentIds the user may access
 */
export async function filterAuthorizedDocumentIds(documentIds, userId, userRole) {
  if (documentIds.length === 0) return [];

  const { rows: docs } = await pool.query(
    'SELECT id, patient_id, uploaded_by_user_id FROM documents WHERE id = ANY($1)',
    [documentIds]
  );

  const authorized = [];
  for (const doc of docs) {
    if (await isAuthorizedForDocument(doc, userId, userRole)) authorized.push(doc.id);
  }
  return authorized;
}

/**
 * All document ids a user is currently authorized to see: owned (patient),
 * uploaded (doctor/hospital), or granted. This is the candidate set RAG
 * retrieval restricts its similarity search to.
 *
 * @param {string} userId
 * @param {string} userRole
 * @returns {Promise<string[]>}
 */
export async function getAuthorizedDocumentIds(userId, userRole) {
  if (userRole === 'patient') {
    const patientId = await getPatientId(userId);
    if (!patientId) return [];
    const { rows } = await pool.query(
      `SELECT d.id FROM documents d
       WHERE d.patient_id = $1
       UNION
       SELECT d.id FROM documents d
       JOIN document_access_grants g ON g.document_id = d.id
       WHERE g.grantee_user_id = $2 AND g.status = 'approved'
         AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
      [patientId, userId]
    );
    return rows.map((r) => r.id);
  }

  const { rows } = await pool.query(
    `SELECT d.id FROM documents d WHERE d.uploaded_by_user_id = $1
     UNION
     SELECT d.id FROM documents d
     JOIN document_access_grants g ON g.document_id = d.id
     WHERE g.grantee_user_id = $1 AND g.status = 'approved'
       AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
    [userId]
  );
  return rows.map((r) => r.id);
}
