import React, { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import * as pdfjsLib from 'pdfjs-dist';
import jsQR from 'jsqr';
import { CheckCircle, AlertCircle, Camera, Upload, ArrowLeft, Info, AlertTriangle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FraudPanel from './FraudPanel';
import API_BASE from '../config';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const STAGE_LABELS = {
  running: 'Running',
  pass: 'Pass',
  fail: 'Failed',
  idle: 'Waiting',
  'no-qr': 'No QR',
};

const STAGE_ICONS = { pass: '✓', fail: '✕', running: null, idle: '-', 'no-qr': '?' };

function StageRow({ num, title, desc, status }) {
  return (
    <div className="mint-stage-row">
      <div className={`stage-icon ${status}`}>
        {status === 'running'
          ? <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          : STAGE_ICONS[status]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="stage-title">Stage {num}: {title}</p>
        <p className="stage-desc">{desc}</p>
      </div>
      <span className={`stage-badge ${status}`}>{STAGE_LABELS[status] || status}</span>
    </div>
  );
}

const labelSt = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.55, marginBottom: '0.2rem' };
const valSt = { fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' };

function VerificationHistoryBanner({ history }) {
  if (!history) return null;
  const { count, verifiers } = history;
  const SHOW = 3;
  const names = verifiers.map(v => v.fullName);
  let sentence;
  if (count === 0) {
    sentence = 'This is the first time this document is being verified.';
  } else if (names.length <= SHOW) {
    sentence = `Verified ${count} time${count !== 1 ? 's' : ''} since issuance, by ${names.join(', ')}.`;
  } else {
    const shown = names.slice(0, SHOW).join(', ');
    const rest = names.length - SHOW;
    sentence = `Verified ${count} time${count !== 1 ? 's' : ''} since issuance, by ${shown}, and ${rest} more.`;
  }
  return (
    <div style={{
      padding: '0.65rem 0.875rem', borderRadius: 7, marginBottom: '1rem',
      background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)',
      borderLeft: '3px solid var(--text-muted)',
    }}>
      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Verification History</p>
      <p style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)', lineHeight: 1.5 }}>{sentence}</p>
    </div>
  );
}

function RecordGrid({ rec, history }) {
  const ip = rec.issuerProfile;
  const entityLabel = ip
    ? [ip.fullName, ip.role, ip.institution || ip.type].filter(Boolean).join(' · ')
    : rec.issuerUsername || null;

  const uploadedOn = rec.createdAt
    ? new Date(rec.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div>
      {entityLabel && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
          padding: '0.65rem 0.875rem', borderRadius: 7, marginBottom: '1rem',
          background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)',
          borderLeft: '3px solid var(--primary)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary)', marginBottom: '0.2rem' }}>Issued By</p>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
              {entityLabel}{uploadedOn ? ` - ${uploadedOn}` : ''}
            </p>
          </div>
        </div>
      )}
      <VerificationHistoryBanner history={history} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 1.5rem' }}>
        {[
          ['Patient Name', rec.patientName],
          ['Reg Number', rec.registerNumber],
          ['Date of Birth', rec.dob],
          ['Gender', rec.gender],
          ['Blood Group', rec.bloodGroup],
          ['Record Type', rec.recordType],
          ['Consulting Doctor', rec.doctorName],
          ['Date of Issuance', rec.issueDate],
          ['Diagnosis / Observation', rec.diagnosis],
        ].filter(([, v]) => v).map(([label, val]) => (
          <div key={label} style={label === 'Diagnosis / Observation' ? { gridColumn: '1 / -1' } : {}}>
            <p style={labelSt}>{label}</p>
            <p style={valSt}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState('basic');
  const [hashInput, setHashInput] = useState('');
  const [basicFile, setBasicFile] = useState(null);
  const [file, setFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [record, setRecord] = useState(null);
  const [fraudData, setFraudData] = useState(null);
  const [verificationHistory, setVerificationHistory] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Verifying');
  const [mintStages, setMintStages] = useState(null);
  const scannerRef = useRef(null);

  const canVerify = user && (user.isMasterAdmin || ['verifier', 'dual'].includes(user.role));

  if (!canVerify) {
    return (
      <div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <Shield size={48} color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
        <h2>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)' }}>Your role does not permit verifying records. Only Verifiers and Dual accounts can access this page.</p>
        <Link to="/" className="btn mt-4">Go Home</Link>
      </div>
    );
  }

  useEffect(() => {
    return () => { try { scannerRef.current?.stop().catch(() => { }); } catch { } };
  }, []);

  const resetState = () => {
    setRecord(null); setFraudData(null); setVerificationHistory(null); setBulkResults(null); setError(null);
    setHashInput(''); setFile(null); setBasicFile(null);
    setBulkFiles([]); setMintStages(null);
  };
  const switchMode = (m) => { resetState(); setMode(m); };

  const extractHash = (text) => {
    try { const u = new URL(text); const p = u.pathname.split('/'); return p[p.length - 1] || text; }
    catch { return text.trim(); }
  };

  const renderFileToCanvas = async (f) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (f.type === 'application/pdf') {
      const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 2 });
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } else {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej;
        i.src = URL.createObjectURL(f);
      });
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    }
    return canvas;
  };

  const extractQRFromFile = async (f) => {
    try {
      const canvas = await renderFileToCanvas(f);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      return code ? extractHash(code.data) : null;
    } catch { return null; }
  };

  const handleBasicFileUpload = async (f) => {
    setBasicFile(f); setError(null);
    try {
      const canvas = await renderFileToCanvas(f);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) setHashInput(extractHash(code.data));
      else setError('No QR code found in the uploaded file. Try a clearer image.');
    } catch { setError('Could not read file. Try a different image or PDF.'); }
  };

  const startScanner = async () => {
    setScanning(true);
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 },
        (text) => { setHashInput(extractHash(text)); scanner.stop().then(() => setScanning(false)); },
        () => { }
      );
    } catch { setError('Camera access denied or not found.'); setScanning(false); }
  };

  const handleBasicVerify = async (e) => {
    if (e) e.preventDefault();
    setError(null); setRecord(null);
    setLoadingLabel('Verifying'); setLoading(true);
    await sleep(50);
    try {
      const res = await fetch(`${API_BASE}/api/verify-record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-username': user?.username || 'guest' },
        body: JSON.stringify({ dataHash: hashInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Record not found.');
      setRecord(data.record);
      setFraudData(data.fraud || null);
      setVerificationHistory(data.verificationHistory || null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleMintVerify = async () => {
    if (!file) return;
    setError(null); setRecord(null);
    const username = user?.username || 'guest';

    // Show overlay with Stage 1 running
    setMintStages({ s1: 'running', s1rec: null, s2: 'idle', s2rec: null, s2hash: null });
    await sleep(80);

    // Stage 1: file hash check
    let s1pass = false, s1rec = null, s1fraud = null, s1history = null;
    try {
      const body = new FormData(); body.append('file', file);
      const res = await fetch(`${API_BASE}/api/verify-file`, {
        method: 'POST', headers: { 'x-username': username }, body,
      });
      const data = await res.json();
      s1pass = res.ok && (data.verified !== false);
      s1rec = data.record || null;
      s1fraud = data.fraud || null;
      s1history = data.verificationHistory || null;
    } catch { }

    setMintStages({ s1: s1pass ? 'pass' : 'fail', s1rec, s1fraud, s1history, s2: 'running', s2rec: null, s2hash: null });
    await sleep(700);

    // Stage 2: QR extraction (always run)
    let s2hash = null, s2rec = null, s2status = 'no-qr';
    try { s2hash = await extractQRFromFile(file); } catch { }

    if (s2hash) {
      try {
        const res = await fetch(`${API_BASE}/api/verify-record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-username': username },
          body: JSON.stringify({ dataHash: s2hash }),
        });
        const data = await res.json();
        s2rec = data.record || null;
        s2status = res.ok ? 'pass' : 'fail';
      } catch { s2status = 'fail'; }
    }

    setMintStages({ s1: s1pass ? 'pass' : 'fail', s1rec, s1fraud, s1history, s2: s2status, s2rec, s2hash });
  };

  const handleBulkVerify = async () => {
    if (!bulkFiles.length) { setError('Select at least one file.'); return; }
    setError(null); setBulkResults(null);
    setLoadingLabel('Analyzing Files'); setLoading(true);
    await sleep(50);
    try {
      const body = new FormData();
      bulkFiles.forEach(f => body.append('files', f));
      const res = await fetch(`${API_BASE}/api/bulk-verify-mint`, {
        method: 'POST', headers: { 'x-username': user?.username || 'guest' }, body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk verification failed.');
      setBulkResults(data.results);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const clearFile = (inputId, setter) => (e) => {
    e.preventDefault(); e.stopPropagation();
    setter(null);
    const input = document.getElementById(inputId);
    if (input) input.value = '';
  };

  const FileLabel = ({ id, file, onClear, placeholder, accept, onChange, multiple }) => (
    <div style={{ position: 'relative' }}>
      <input type="file" id={id} style={{ display: 'none' }} accept={accept}
        multiple={multiple} onChange={onChange} />
      <label htmlFor={id} className={`file-upload-label${file ? ' has-file' : ''}`}
        style={{ paddingRight: file ? '2.75rem' : undefined }}>
        <Upload size={18} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {file ? (Array.isArray(file) ? `${file.length} file${file.length > 1 ? 's' : ''} selected` : file.name) : placeholder}
        </span>
      </label>
      {file && (
        <button
          type="button"
          onClick={onClear}
          style={{
            position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            color: '#22c55e', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center',
          }}
          title="Remove file"
        >
          ×
        </button>
      )}
    </div>
  );

  const mintDone = mintStages && mintStages.s1 !== 'running' && mintStages.s2 !== 'running' && mintStages.s2 !== 'idle';
  const mintRunning = mintStages && !mintDone;
  const s1desc = {
    running: 'Computing normalized file hash and matching against Mint registry…',
    pass: 'File hash matches a registered Mint record. This is a certified original.',
    fail: 'No matching Mint hash found. The file may have been modified, or was not minted through MediLance.',
  };
  const s2descFor = (s, s1passed) => ({
    idle: 'Waiting for Stage 1 to complete…',
    running: 'Scanning document for an embedded MediLance QR code…',
    pass: s1passed
      ? 'QR code also detected - consistent with the Stage 1 result. No further action needed.'
      : 'QR code detected and links to a valid record. Since the hash check failed, treat this as a reference only.',
    fail: 'A QR code was detected but the hash it encodes is not registered in the system.',
    'no-qr': 'No QR code found in this document.',
  })[s] || '';

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Loading overlay - Basic & Bulk */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div className="loading-spinner" />
            <p className="loading-label">{loadingLabel}…</p>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '-0.5rem' }}>
              Please wait
            </p>
          </div>
        </div>
      )}

      {/* Mint two-stage overlay - shown while running */}
      {mintStages && mintRunning && (
        <div className="loading-overlay">
          <div className="loading-card">
            <p className="loading-label" style={{ marginBottom: '-0.5rem' }}>Mint Verification</p>
            <StageRow num={1} title="Hash Integrity Check" desc={s1desc[mintStages.s1] || s1desc.running} status={mintStages.s1} />
            <StageRow num={2} title="QR Code Detection" desc={s2descFor(mintStages.s2)} status={mintStages.s2} />
          </div>
        </div>
      )}

      <Link to="/" className="nav-link flex items-center gap-2" style={{ width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>
        <ArrowLeft size={14} /> Back to Dashboard
      </Link>

      <header>
        <h1>Verify Authenticity</h1>
        <p style={{ color: 'var(--text-muted)' }}>Confirm the integrity of medical records using MediLance Dual-Layer technology.</p>
      </header>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          {[['basic', 'Basic (QR / Hash)'], ['mint', 'Mint (Single File)'], ['bulk', 'Bulk Mint']].map(([m, label]) => (
            <button key={m} className={`btn${mode === m ? '' : ' btn-outline'}`} style={{ flex: 1 }} onClick={() => switchMode(m)}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'basic' && (
          <form onSubmit={handleBasicVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="info-toast">
              <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Only QR codes generated by MediLance are valid. Third-party QR codes will not match any record.</span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input type="text" style={{ flex: 1 }} placeholder="Paste Record Hash or scan QR code"
                value={hashInput} onChange={e => setHashInput(e.target.value)} />
              <button type="button" className="btn btn-outline"
                onClick={scanning ? () => scannerRef.current?.stop().then(() => setScanning(false)) : startScanner}>
                <Camera size={18} />
              </button>
            </div>
            <div id="qr-reader" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>or upload file with QR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <FileLabel
              id="basic-qr-file" file={basicFile} accept="image/*,.pdf"
              placeholder="Upload image or PDF containing a MediLance QR code"
              onClear={clearFile('basic-qr-file', setBasicFile)}
              onChange={e => e.target.files[0] && handleBasicFileUpload(e.target.files[0])}
            />
            <button type="submit" className="btn w-full" disabled={loading || !hashInput}>
              {loading ? 'Verifying…' : 'Verify Record'}
            </button>
          </form>
        )}

        {mode === 'mint' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Upload the document to verify. Stage 1 checks if the file hash matches a Mint record. Stage 2 scans for an embedded QR code as a fallback.
            </p>
            <FileLabel
              id="mint-verify-file" file={file} accept="image/*,.pdf"
              placeholder="Click to upload document (PDF or Image)"
              onClear={clearFile('mint-verify-file', (v) => { setFile(v); setMintStages(null); setError(null); })}
              onChange={e => { setFile(e.target.files[0]); setMintStages(null); setError(null); }}
            />
            <button className="btn w-full" onClick={handleMintVerify} disabled={mintRunning || !file}>
              {mintRunning ? 'Analyzing…' : 'Run Mint Verification'}
            </button>
          </div>
        )}

        {mode === 'bulk' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Select multiple Mint-issued documents. Each file is verified independently. Only Mint records support this.
            </p>
            <FileLabel
              id="bulk-verify-files" file={bulkFiles.length ? bulkFiles : null} accept="image/*,.pdf"
              placeholder="Click to select files (up to 20)"
              onClear={clearFile('bulk-verify-files', setBulkFiles.bind(null, []))}
              onChange={e => setBulkFiles(Array.from(e.target.files))}
              multiple
            />
            {bulkFiles.length > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '0.25rem' }}>
                {bulkFiles.map((f, i) => <div key={i}>{f.name}</div>)}
              </div>
            )}
            <button className="btn w-full" onClick={handleBulkVerify} disabled={loading || !bulkFiles.length}>
              {loading ? 'Verifying…' : `Verify ${bulkFiles.length || ''} Files`}
            </button>
          </div>
        )}
      </div>

      {/* Trust Score Explanation Box */}
      <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Shield size={20} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Understanding the MediLance Trust Score</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem' }}>
          Every verified record is assigned an Integrity Score from 0 to 100. This score indicates the overall reliability and trustworthiness of the document based on automated network checks.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Starting Score: 100</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.2rem' }}>All records begin with a perfect score if the cryptographic hash matches the original document.</p>
          </div>
          
          <div style={{ padding: '0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={14} color="#f59e0b" /> Score Deductions
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.3rem', lineHeight: 1.5 }}>
              Points are deducted when potential anomalies are detected:
            </p>
            <ul style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.4rem', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              <li><strong>Duplicate Records:</strong> Same patient with multiple similar records on the same day (-40 points).</li>
              <li><strong>Provider Risk:</strong> Record issued by a provider with a history of anomalies (-10 to -30 points).</li>
              <li><strong>Billing Anomalies:</strong> Costs significantly higher than the standard baseline for the procedure (-15 points).</li>
              <li><strong>Incompatible Combinations:</strong> Procedures that logically conflict with each other (-25 points).</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Generic error (Basic / Bulk) */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={22} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><p className="alert-title">Verification Failed</p><p>{error}</p></div>
        </div>
      )}

      {/* Basic/Bulk success record */}
      {record && (
        <div className="alert alert-success" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <CheckCircle size={28} style={{ flexShrink: 0 }} />
            <div>
              <p className="alert-title" style={{ fontSize: '1.05rem' }}>Authentic Record Found</p>
              <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Verified by MediLance Cryptographic Engine</p>
            </div>
          </div>
          <RecordGrid rec={record} history={verificationHistory} />
          <FraudPanel fraud={fraudData} />
        </div>
      )}

      {/* Mint stage results - shown after both stages complete */}
      {mintDone && (
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ margin: 0 }}>Mint Verification Results</h3>

          {/* Stage 1 result */}
          <div style={{
            padding: '1rem', borderRadius: 8,
            background: mintStages.s1 === 'pass' ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
            border: `1px solid ${mintStages.s1 === 'pass' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              {mintStages.s1 === 'pass'
                ? <CheckCircle size={18} color="#22c55e" />
                : <AlertCircle size={18} color="#ef4444" />}
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Stage 1 - Hash Integrity Check: {mintStages.s1 === 'pass' ? 'PASS' : 'FAILED'}</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {mintStages.s1 === 'pass'
                ? 'The file\'s cryptographic fingerprint matches a record in the Mint registry. No tampering detected.'
                : 'The file\'s hash does not match any registered Mint record. This means either the file content has been altered (even slightly), or this file was never minted through MediLance.'}
            </p>
            {mintStages.s1 === 'pass' && mintStages.s1rec && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(34,197,94,0.15)' }}>
                <RecordGrid rec={mintStages.s1rec} history={mintStages.s1history || null} />
                <FraudPanel fraud={mintStages.s1fraud || null} />
              </div>
            )}
          </div>

          {/* Stage 2 - context-aware: neutral if S1 passed, warning if S1 failed */}
          <div style={{
            padding: '1rem', borderRadius: 8,
            background: mintStages.s1 === 'pass' && mintStages.s2 === 'pass'
              ? 'rgba(37,99,235,0.06)'
              : mintStages.s2 === 'pass' ? 'rgba(250,204,21,0.07)'
                : mintStages.s2 === 'no-qr' ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.07)',
            border: `1px solid ${mintStages.s1 === 'pass' && mintStages.s2 === 'pass' ? 'rgba(37,99,235,0.25)'
                : mintStages.s2 === 'pass' ? 'rgba(250,204,21,0.3)'
                  : mintStages.s2 === 'no-qr' ? 'var(--border)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              {mintStages.s1 === 'pass' && mintStages.s2 === 'pass' && <Info size={18} color="var(--primary)" />}
              {mintStages.s1 !== 'pass' && mintStages.s2 === 'pass' && <AlertTriangle size={18} color="#facc15" />}
              {mintStages.s2 === 'fail' && <AlertCircle size={18} color="#ef4444" />}
              {mintStages.s2 === 'no-qr' && <Info size={18} color="var(--text-muted)" />}
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Stage 2 - QR Code Detection:&nbsp;
                {{ pass: 'QR FOUND', fail: 'QR INVALID', 'no-qr': 'NO QR DETECTED' }[mintStages.s2]}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {s2descFor(mintStages.s2, mintStages.s1 === 'pass')}
            </p>
            {mintStages.s2 === 'pass' && mintStages.s2rec && (
              <div style={{ marginTop: '1rem' }}>
                {mintStages.s1 !== 'pass' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(250,204,21,0.1)', borderRadius: 6, border: '1px solid rgba(250,204,21,0.25)' }}>
                    <AlertTriangle size={15} color="#facc15" />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#facc15' }}>
                      Not a Mint-verified file - double-check these details against the physical record
                    </span>
                  </div>
                )}
                {mintStages.s1 === 'pass'
                  ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>QR record is consistent with Stage 1 - no discrepancy detected.</p>
                  : <RecordGrid rec={mintStages.s2rec} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk results */}
      {bulkResults && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Bulk Verification Results</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {bulkResults.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', borderRadius: 6, flexWrap: 'wrap',
                background: r.verified ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
                border: `1px solid ${r.verified ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}>
                {r.verified ? <CheckCircle size={18} color="#22c55e" style={{ flexShrink: 0 }} /> : <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />}
                <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>{r.filename}</span>
                {r.verified && r.record && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.record.patientName} · {r.record.registerNumber}</span>
                )}
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: r.verified ? '#22c55e' : '#ef4444' }}>
                  {r.verified ? 'AUTHENTIC' : 'NOT FOUND'}
                </span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {bulkResults.filter(r => r.verified).length} of {bulkResults.length} files verified authentic.
          </p>
        </div>
      )}
    </div>
  );
}
