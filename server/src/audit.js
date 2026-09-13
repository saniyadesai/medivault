import { pool } from './db.js';

export async function logAudit({ patientId, documentId, actorUserId, action, status = 'success', reason, req, metadata }, client) {
  try {
    const q = client || pool;
    await q.query(
      `INSERT INTO audit_logs (patient_id, document_id, actor_user_id, action, status, reason, ip_address, user_agent, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [patientId, documentId || null, actorUserId, action, status, reason || null,
        req?.ip || req?.headers?.['x-forwarded-for'] || null,
        req?.headers?.['user-agent'] || null,
        metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('Audit log insert failed:', err.message);
  }
}
