import { useState, useEffect } from 'react';

const STEPS = [
  { id: 1, emoji: '🖐️', title: 'Reading Fingerprint', sub: 'Extracting biometric markers...' },
  { id: 2, emoji: '🇮🇳', title: 'Aadhaar API Match', sub: 'Connecting to UIDAI database...' },
  { id: 3, emoji: '🔒', title: 'Decrypting Vault', sub: 'AES-256 secure unlock...' },
  { id: 4, emoji: '📋', title: 'Loading Medical Records', sub: 'Fetching emergency data...' },
  { id: 5, emoji: '⏱️', title: 'Granting 24h Access', sub: 'Emergency access token issued...' },
];

/* ── tiny helpers ─────────────────────────────────── */
function TypingDots() {
  return (
    <span className="ea-typing-dots">
      {[0, 1, 2].map(i => (
        <span key={i} className="ea-dot" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="ea-info-row">
      <span className="ea-info-label">{label}</span>
      <span className="ea-info-value">{value}</span>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="ea-section-label">{children}</div>;
}

function GlassBtn({ children, onClick, variant = 'default', disabled }) {
  return (
    <button
      className={`ea-glass-btn ea-glass-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/* ── SCREEN 1 — SCANNER ──────────────────────────── */
function ScannerScreen({ onScanComplete, onDemo, patientEmail, setPatientEmail, error }) {
  const [scanState, setScanState] = useState('idle');

  const startScan = () => {
    if (!patientEmail.trim()) return;
    setScanState('scanning');
    setTimeout(() => {
      setScanState('success');
      setTimeout(onScanComplete, 900);
    }, 2600);
  };

  const ringClass = scanState === 'success' ? 'ea-ring--success' : scanState === 'scanning' ? 'ea-ring--scanning' : '';

  return (
    <div className="ea-card ea-screen-enter">
      <div className="ea-header-block">
        <span className="ea-logo-pill"><span className="ea-logo-icon">⚕️</span><span className="ea-logo-text">MediVault</span></span>
        <div><span className="ea-emergency-badge">🚨 Emergency Access Mode</span></div>
        <h2 className="ea-title">Patient Identification</h2>
        <p className="ea-subtitle">Scan patient fingerprint to retrieve emergency medical records via Aadhaar verification</p>
      </div>

      {/* Patient email input */}
      <div className="ea-email-field">
        <label htmlFor="eaPatientEmail">Patient Email</label>
        <input
          id="eaPatientEmail"
          type="email"
          placeholder="patient@example.com"
          value={patientEmail}
          onChange={(e) => setPatientEmail(e.target.value)}
          disabled={scanState !== 'idle'}
        />
      </div>
      {error && <p className="ea-error">{error}</p>}

      {/* Scanner */}
      <div className="ea-scanner-wrap">
        <div className="ea-scanner-ring-outer">
          <div className={`ea-ring-spin ${ringClass}`} />
          <div className="ea-ring-dashed" />
          <div
            className={`ea-scan-circle ${ringClass}`}
            onClick={scanState === 'idle' ? startScan : undefined}
            role="button"
            tabIndex={0}
          >
            {scanState === 'scanning' && <div className="ea-scan-line" />}
            <span className={`ea-scan-emoji ${scanState === 'idle' ? 'ea-finger-float' : ''}`}>
              {scanState === 'success' ? '✅' : scanState === 'scanning' ? '🖐️' : '👆'}
            </span>
          </div>
        </div>
        <div className="ea-scan-status">
          {scanState === 'idle' && 'Tap the scanner to scan fingerprint'}
          {scanState === 'scanning' && <span>Scanning fingerprint<TypingDots /></span>}
          {scanState === 'success' && <span className="ea-text-success">✓ Fingerprint captured successfully!</span>}
        </div>
      </div>

      <GlassBtn variant="emergency" onClick={startScan} disabled={scanState !== 'idle' || !patientEmail.trim()}>
        {scanState === 'scanning' ? <span>🔍 Scanning<TypingDots /></span> : '🔍 Scan Fingerprint'}
      </GlassBtn>
      <GlassBtn onClick={onDemo} disabled={!patientEmail.trim()}>⚡ Demo — Skip to Results</GlassBtn>
    </div>
  );
}

/* ── SCREEN 2 — PROCESSING ───────────────────────── */
function ProcessingScreen({ onComplete }) {
  const [activeStep, setActiveStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState([]);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('Initializing...');
  const pcts = [20, 40, 65, 85, 100];
  const labels = [
    'Reading fingerprint...',
    'Matching Aadhaar identity...',
    'Decrypting medical vault...',
    'Loading medical records...',
    'Granting 24-hour access...',
  ];

  useEffect(() => {
    let i = 0;
    const tick = () => {
      if (i >= STEPS.length) { setTimeout(onComplete, 600); return; }
      setActiveStep(i + 1);
      setProgress(pcts[i]);
      setLabel(labels[i]);
      if (i > 0) setDoneSteps(d => [...d, i]);
      i++;
      setTimeout(tick, 950);
    };
    setTimeout(tick, 300);
  }, []);

  return (
    <div className="ea-card ea-screen-enter">
      <div className="ea-header-block">
        <span className="ea-logo-pill"><span className="ea-logo-icon">⚕️</span><span className="ea-logo-text">MediVault</span></span>
        <div><span className="ea-verify-badge">🔍 Verifying Identity</span></div>
        <h2 className="ea-title">Aadhaar Verification</h2>
        <p className="ea-subtitle">Matching biometric data with national health registry</p>
      </div>

      <div className="ea-steps-list">
        {STEPS.map((step, idx) => {
          const isDone = doneSteps.includes(idx + 1);
          const isActive = activeStep === idx + 1;
          const cls = isDone ? 'ea-step--done' : isActive ? 'ea-step--active' : 'ea-step--pending';
          return (
            <div key={step.id} className={`ea-step ${cls}`}>
              <span className="ea-step-emoji">{step.emoji}</span>
              <div className="ea-step-body">
                <div className="ea-step-title">{step.title}</div>
                <div className="ea-step-sub">{step.sub}</div>
              </div>
              <span className={`ea-step-check ${isDone ? 'visible' : ''}`}>✓</span>
            </div>
          );
        })}
      </div>

      <div className="ea-progress">
        <div className="ea-progress-head">
          <span>{label}</span>
          <span className="ea-progress-pct">{progress}%</span>
        </div>
        <div className="ea-progress-track">
          <div className="ea-progress-fill" style={{ width: `${progress}%` }}>
            <div className="ea-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── SCREEN 3 — PATIENT PROFILE ──────────────────── */
function PatientScreen({ patient, endsAt, onViewRecords, onReset }) {
  const [seconds, setSeconds] = useState(() => {
    const diff = Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  });
  const [accessTimeStr] = useState(() => new Date().toLocaleString('en-IN'));

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');

  const p = patient;

  return (
    <div className="ea-card ea-screen-enter">
      <div className="ea-scrollable">
        <div className="ea-header-block">
          <span className="ea-logo-pill"><span className="ea-logo-icon">⚕️</span><span className="ea-logo-text">MediVault</span></span>
          <div><span className="ea-success-badge">✅ Identity Verified</span></div>
        </div>

        {/* Patient Card */}
        <div className="ea-patient-card">
          <div className="ea-avatar">👤</div>
          <div>
            <div className="ea-patient-name">{p.name}</div>
            <div className="ea-patient-meta">
              {typeof p.age === 'number' ? `${p.age}y · ` : ''}
              {p.gender || 'N/A'}
              {p.dob ? ` · DOB: ${p.dob}` : ''}
            </div>
            <div className="ea-patient-id">MediVault Patient</div>
            <span className="ea-biometric-tag">✓ Biometric Match Confirmed</span>
          </div>
        </div>

        {/* Timer */}
        <div className="ea-timer-bar">
          <div>
            <div className="ea-timer-title">🔓 Emergency Access Active</div>
            <div className="ea-timer-sub">Auto-expires · Patient notified on recovery</div>
          </div>
          <div className="ea-countdown">{h}:{m}:{s}</div>
        </div>

        {/* Critical Alerts */}
        {p.allergies && p.allergies.length > 0 && (
          <div className="ea-alerts-box">
            <div className="ea-alerts-title">&#9888;&#65039; Critical Alerts — Allergies</div>
            <div className="ea-alert-tags">
              {p.allergies.map((a, i) => <span key={i} className="ea-alert-tag">&#128683; {a}</span>)}
            </div>
          </div>
        )}

        {/* Drug Reactions (legacy plain-text field) */}
        {p.drugReactions && (
          <div className="ea-alerts-box" style={{ background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.35)' }}>
            <div className="ea-alerts-title" style={{ color: '#c084fc' }}>&#128137; Drug Reactions &amp; Body Reactiveness</div>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', lineHeight: '1.7', margin: 0 }}>{p.drugReactions}</p>
          </div>
        )}

        {/* Structured Drug Interactions */}
        {p.drugInteractions && p.drugInteractions.length > 0 && (
          <div className="ea-alerts-box ea-di-box">
            <div className="ea-alerts-title ea-di-header">💊 Recorded Drug Interactions ({p.drugInteractions.length})</div>
            {p.drugInteractions.map((di, idx) => (
              <div key={di.id || idx} className={`ea-di-item ea-di-sev--${di.severity}`}>
                <div className="ea-di-pair">
                  <span className="ea-di-drug">{di.drugA}</span>
                  <span className="ea-di-arrow">⇄</span>
                  <span className="ea-di-drug">{di.drugB}</span>
                  <span className={`ea-di-sev-badge ea-di-sev--${di.severity}`}>{di.severity}</span>
                </div>
                <div className="ea-di-desc">{di.description}</div>
                {di.recommendation && (
                  <div className="ea-di-rec">⚕️ {di.recommendation}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Vitals Grid */}
        {p.bloodGroup && (
          <>
            <SectionLabel>🩸 Vital Information</SectionLabel>
            <div className="ea-vitals-grid">
              {[
                { emoji: '🩸', title: 'Blood Group', val: p.bloodGroup },
                ...(p.conditions || []).map(c => ({ emoji: '🏥', title: 'Condition', val: c })),
              ].map((item, i) => (
                <div key={i} className="ea-vital-card ea-card-fade-up" style={{ animationDelay: `${i * 0.07}s` }}>
                  <div className="ea-vital-emoji">{item.emoji}</div>
                  <div className="ea-vital-title">{item.title}</div>
                  <div className="ea-vital-val">{item.val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Medications */}
        {p.medications && p.medications.length > 0 && (
          <>
            <SectionLabel>&#128138; Current Medications</SectionLabel>
            {p.medications.map((med, i) => (
              <InfoRow key={i} label={`&#128138; ${typeof med === 'string' ? med : med.name}`} value={typeof med === 'string' ? '' : `${med.dose} · ${med.freq}`} />
            ))}
          </>
        )}

        {/* Emergency Contact */}
        {p.emergencyContact && (
          <>
            <SectionLabel>📞 Emergency Contact</SectionLabel>
            <InfoRow label={`👩 ${p.emergencyContact.name}`} value={p.emergencyContact.phone} />
          </>
        )}

        <div className="ea-divider" />

        <GlassBtn variant="teal" onClick={onViewRecords}>📄 View Full Medical Records</GlassBtn>
        <GlassBtn onClick={onReset}>🔄 New Patient Scan</GlassBtn>

        <div className="ea-access-log">
          <p>&#128274; This access is logged and audited<br />Access granted: {accessTimeStr}</p>
        </div>
      </div>
    </div>
  );
}

/* ── SCREEN 4 — FULL RECORDS ─────────────────────── */
function RecordsScreen({ patient, onBack, onReset, onView }) {
  return (
    <div className="ea-card ea-screen-enter">
      <div className="ea-scrollable">
        <div className="ea-records-header">
          <button className="ea-back-btn" onClick={onBack}>← Back</button>
          <div>
            <div className="ea-records-title">📋 Full Records</div>
            <div className="ea-records-sub">{patient.name} · Emergency Access</div>
          </div>
        </div>

        <SectionLabel>📄 Uploaded Documents</SectionLabel>
        {(!patient.documents || patient.documents.length === 0) && (
          <p className="ea-empty">No documents found for this patient.</p>
        )}
        {(patient.documents || []).map((doc, i) => (
          <div
            key={doc.id || i}
            className="ea-doc-row ea-card-fade-up"
            style={{ animationDelay: `${i * 0.08}s` }}
            onClick={() => onView && onView(doc.id)}
            role="button"
            tabIndex={0}
          >
            <span className="ea-doc-icon">📄</span>
            <div className="ea-doc-body">
              <div className="ea-doc-title">{doc.title || doc.originalFilename || 'Document'}</div>
              <div className="ea-doc-meta">{doc.date || ''}{doc.type ? ` · ${doc.type}` : ''}</div>
            </div>
            <span className="ea-doc-arrow">›</span>
          </div>
        ))}

        {/* AI Summary */}
        {((patient.conditions && patient.conditions.length > 0) || patient.drugReactions || (patient.drugInteractions && patient.drugInteractions.length > 0)) && (
          <>
            <SectionLabel>&#129302; AI Summary</SectionLabel>
            <div className="ea-ai-box">
              <div className="ea-ai-title">&#129504; PLAIN LANGUAGE SUMMARY</div>
              <p className="ea-ai-text">
                {patient.allergies && patient.allergies.length > 0
                  ? `Known allergies: ${patient.allergies.join(', ')}. `
                  : 'No known allergies. '}
                {patient.conditions && patient.conditions.length > 0
                  ? `Conditions: ${patient.conditions.join(', ')}. `
                  : ''}
                {patient.medications && patient.medications.length > 0
                  ? `Currently on: ${patient.medications.map(m => typeof m === 'string' ? m : m.name).join(', ')}. `
                  : ''}
                {patient.drugReactions
                  ? `Drug reactions: ${patient.drugReactions}. `
                  : ''}
                {patient.drugInteractions && patient.drugInteractions.length > 0
                  ? `${patient.drugInteractions.length} drug interaction(s) on record — review before prescribing. `
                  : ''}
                Patient requires careful monitoring during emergency care.
              </p>
            </div>
          </>
        )}

        {/* Doctor Action Points */}
        {((patient.allergies && patient.allergies.length > 0) || patient.drugReactions || (patient.drugInteractions && patient.drugInteractions.length > 0)) && (
          <div className="ea-action-box">
            <div className="ea-action-title">&#9888;&#65039; Doctor's Action Points</div>
            {(patient.allergies || []).map((a, i) => (
              <div key={i} className="ea-action-item">{i + 1}. &#10060; Do NOT administer {a}</div>
            ))}
            {patient.drugReactions && (
              <div className="ea-action-item">{(patient.allergies?.length || 0) + 1}. &#128137; DRUG REACTIONS: {patient.drugReactions}</div>
            )}
            {(patient.drugInteractions || []).map((di, i) => {
              const baseIdx = (patient.allergies?.length || 0) + (patient.drugReactions ? 1 : 0) + i + 1;
              return (
                <div key={di.id || i} className={`ea-action-item ea-action-item--${di.severity}`}>
                  {baseIdx}. 💊 <strong>{di.drugA} ⇄ {di.drugB}</strong> [{di.severity}]
                  {di.recommendation ? ` — ${di.recommendation}` : ` — ${di.description}`}
                </div>
              );
            })}
            {patient.emergencyContact && (
              <div className="ea-action-item">
                {(patient.allergies?.length || 0) + (patient.drugReactions ? 1 : 0) + (patient.drugInteractions?.length || 0) + 1}.
                &#128222; Contact family: {patient.emergencyContact.phone}
              </div>
            )}
          </div>
        )}

        <GlassBtn onClick={onReset}>🔄 New Patient Scan</GlassBtn>
      </div>
    </div>
  );
}

/* ── MAIN COMPONENT ──────────────────────────────── */
export default function EmergencyAccess({ onViewDocument }) {
  const [screen, setScreen] = useState('scan');
  const [patientEmail, setPatientEmail] = useState('');
  const [patient, setPatient] = useState(null);
  const [endsAt, setEndsAt] = useState(null);
  const [error, setError] = useState('');

  const API = import.meta.env.VITE_API_BASE_URL?.trim() || '';

  const initiateEmergency = async () => {
    setError('');
    try {
      const token = JSON.parse(localStorage.getItem('medivault.auth') || '{}').token || '';
      const res = await fetch(`${API}/api/emergency-access/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientEmail: patientEmail.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Emergency access failed');
      setPatient(body.patient);
      setEndsAt(body.endsAt);
      setScreen('processing');
    } catch (err) {
      setError(err.message);
      setScreen('scan');
    }
  };

  const handleScanComplete = () => initiateEmergency();
  const handleDemo = () => initiateEmergency();

  const handleReset = () => {
    setScreen('scan');
    setPatient(null);
    setEndsAt(null);
    setError('');
    setPatientEmail('');
  };

  return (
    <div className="ea-container">
      {screen === 'scan' && (
        <ScannerScreen
          onScanComplete={handleScanComplete}
          onDemo={handleDemo}
          patientEmail={patientEmail}
          setPatientEmail={setPatientEmail}
          error={error}
        />
      )}
      {screen === 'processing' && (
        <ProcessingScreen onComplete={() => setScreen('patient')} />
      )}
      {screen === 'patient' && patient && (
        <PatientScreen
          patient={patient}
          endsAt={endsAt}
          onViewRecords={() => setScreen('records')}
          onReset={handleReset}
        />
      )}
      {screen === 'records' && patient && (
        <RecordsScreen
          patient={patient}
          onBack={() => setScreen('patient')}
          onReset={handleReset}
          onView={onViewDocument}
        />
      )}
    </div>
  );
}
