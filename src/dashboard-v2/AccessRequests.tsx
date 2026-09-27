import { useState } from 'react';
import { getDocumentsByIds } from '../services/accessApi';
import { ShieldCheckIcon } from './icons';
import type { AccessRequestRow } from './types';

interface AccessRequestsProps {
  requests: AccessRequestRow[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function AccessRequests({ requests, busy, onApprove, onReject }: AccessRequestsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [docsByRequest, setDocsByRequest] = useState<Record<string, any[]>>({});

  const toggleDocs = async (request: AccessRequestRow) => {
    if (expanded === request.id) {
      setExpanded(null);
      return;
    }
    setExpanded(request.id);
    if (request.documentIds && request.documentIds.length > 0 && !docsByRequest[request.id]) {
      try {
        const result = await getDocumentsByIds(request.documentIds);
        setDocsByRequest((prev) => ({ ...prev, [request.id]: result.documents || [] }));
      } catch (err) {
        console.error('Failed to fetch request documents:', err);
      }
    }
  };

  return (
    <div className="mv-card">
      <div className="mv-card-body">
        {requests.length === 0 ? (
          <div className="mv-empty">No access requests available.</div>
        ) : (
          requests.map((req) => (
            <div key={req.id}>
              <div className="mv-row">
                <ShieldCheckIcon size={16} style={{ color: 'var(--mv-accent-text)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="mv-row-title">{req.requester}</div>
                  <div className="mv-row-meta">
                    {req.role} ·{' '}
                    {req.scope === 'specific_documents' ? (
                      <button
                        type="button"
                        onClick={() => toggleDocs(req)}
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 'inherit', color: 'var(--mv-accent-text)', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {expanded === req.id ? 'Hide' : 'View'} {req.documentIds?.length || 0} document{(req.documentIds?.length || 0) === 1 ? '' : 's'}
                      </button>
                    ) : (
                      req.reason
                    )}
                  </div>
                </div>

                <span className={`mv-status-pill is-${req.status}`}>{req.status}</span>

                {req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                    <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" disabled={busy} onClick={() => onReject(req.id)}>
                      Reject
                    </button>
                    <button type="button" className="mv-btn mv-btn-accent mv-btn-sm" disabled={busy} onClick={() => onApprove(req.id)}>
                      Approve
                    </button>
                  </div>
                )}
              </div>

              {expanded === req.id && docsByRequest[req.id] && (
                <div className="mv-sublist">
                  <div className="mv-sublist-title">Requested Documents</div>
                  <ul>
                    {docsByRequest[req.id].map((doc: any) => (
                      <li key={doc.id}>
                        {doc.documentName || doc.originalFilename} — {doc.documentType} ({doc.visitDate || doc.uploadedAt?.split('T')[0]})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
