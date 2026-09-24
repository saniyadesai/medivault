import { useMemo, useState } from 'react';
import { FileIcon } from './icons';
import type { DocumentRow } from './types';

const DOC_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'diagnosis', label: 'Diagnosis' },
  { value: 'discharge_summary', label: 'Discharge Summary' },
];

interface StorageVaultProps {
  documents: DocumentRow[];
  onView: (docId: string) => void;
  onSummary: (docId: string) => void;
}

export function StorageVault({ documents, onView, onSummary }: StorageVaultProps) {
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const filtered = useMemo(
    () =>
      documents.filter((doc) => {
        if (typeFilter && doc.type !== typeFilter) return false;
        if (dateFilter && doc.date !== dateFilter) return false;
        return true;
      }),
    [documents, typeFilter, dateFilter],
  );

  return (
    <>
      <div className="mv-toolbar">
        <div className="mv-field-inline">
          <label className="mv-field-label" htmlFor="docTypeFilter">Filter by Type</label>
          <select id="docTypeFilter" className="mv-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {DOC_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="mv-field-inline">
          <label className="mv-field-label" htmlFor="dateFilter">Filter by Date</label>
          <input id="dateFilter" type="date" className="mv-date-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </div>
        <span className="mv-toolbar-count">
          {filtered.length} document{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mv-card">
        <div className="mv-card-body">
          {filtered.length === 0 ? (
            <div className="mv-empty">
              {documents.length === 0 ? 'No documents uploaded yet.' : 'No documents match these filters.'}
            </div>
          ) : (
            filtered.map((doc) => (
              <div key={doc.id} className="mv-row">
                <FileIcon size={16} style={{ color: 'var(--mv-accent-text)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div className="mv-row-title">{doc.name}</div>
                  <div className="mv-row-meta mv-tabular">
                    {doc.type.replace(/_/g, ' ')} · {doc.uploadedBy} · {doc.date}
                  </div>
                </div>
                <span className={`mv-status-text ${doc.status === 'encrypted' ? 'mv-status-green' : ''}`}>
                  {doc.status === 'encrypted' ? 'Encrypted' : 'Stored'}
                </span>
                <div className="mv-reveal" style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                  <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => onView(doc.id)}>View</button>
                  <button type="button" className="mv-btn mv-btn-ghost mv-btn-sm" onClick={() => onSummary(doc.id)}>AI Summary</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
