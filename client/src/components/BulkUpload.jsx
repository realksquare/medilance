import React, { useState } from 'react';
import Papa from 'papaparse';
import { QRCodeCanvas } from 'qrcode.react';
import { Upload, Download, Table, CheckCircle2, ArrowLeft, Info, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API_BASE from '../config';

const CSV_FIELDS = [
  'patientName',
  'registerNumber',
  'dob',
  'gender',
  'bloodGroup',
  'recordType',
  'doctorName',
  'issueDate',
  'diagnosis',
  'medCosts',
];

const CSV_PLACEHOLDER_ROW = [
  'Aryan Mehta',
  'UID-100001',
  '1992-05-14',
  'Male',
  'B+',
  'Lab Report',
  'Dr. Kavitha',
  '2026-04-29',
  'Haemoglobin deficiency observed',
  '2500',
];

function downloadTemplate() {
  const header = CSV_FIELDS.join(',');
  const row = CSV_PLACEHOLDER_ROW.join(',');
  const csv = `${header}\n${row}\n`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medilance_bulk_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkUpload() {
  const { user } = useAuth();
  const [csvFile, setCsvFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);

  const canIssue = user && (user.isMasterAdmin || ['issuer', 'dual'].includes(user.role));

  if (!canIssue) {
    return (
      <div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <Shield size={48} color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
        <h2>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)' }}>Your role does not permit bulk issuing. Only Issuers and Dual accounts can access this page.</p>
        <Link to="/" className="btn mt-4">Go Home</Link>
      </div>
    );
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const validData = res.data.filter(row => row.patientName || row.name);
        setParsedData(validData);
      }
    });
  };

  const submitBulk = async () => {
    setIsProcessing(true);
    const username = user?.username || 'guest';
    try {
      const res = await fetch(`${API_BASE}/api/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-username': username },
        body: JSON.stringify({ records: parsedData }),
      });
      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      alert('Bulk upload failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAll = () => {
    results.forEach((record, index) => {
      setTimeout(() => {
        const canvas = document.getElementById(`qr-${index}`);
        if (canvas) {
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `${record.dataHash.substring(0, 8)}_QR.png`;
          link.click();
        }
      }, index * 200);
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Link to="/" className="nav-link flex items-center gap-2" style={{ width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>
        <ArrowLeft size={14} /> Back to Dashboard
      </Link>
      <header style={{ marginBottom: '2rem' }}>
        <h1>Bulk Record Issuance</h1>
        <p style={{ color: 'var(--text-muted)' }}>Process large datasets and generate batch QR codes for institutional records.</p>
      </header>

      {!results ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Info toast */}
          <div className="info-toast">
            <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              CSV must contain these columns in order:&nbsp;
              <strong>{CSV_FIELDS.join(', ')}</strong>.&nbsp;
              Use ISO dates (YYYY-MM-DD) for dob and issueDate. Blood group must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-. medCosts is optional (INR value for fraud scoring).
            </span>
          </div>

          {/* Template download */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Not sure about the format? Download the template and fill it in.
            </p>
            <button className="template-link" onClick={downloadTemplate}>
              <Download size={13} />
              Download CSV Template
            </button>
          </div>

          {/* Upload area */}
          <div style={{ position: 'relative' }}>
            <input
              type="file"
              id="bulk-csv"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <label htmlFor="bulk-csv" className={`file-upload-label${csvFile ? ' has-file' : ''}`}
              style={{ justifyContent: 'center', padding: '2rem', flexDirection: 'column', gap: '0.75rem', textAlign: 'center', paddingRight: csvFile ? '2.75rem' : '2rem' }}>
              <Upload size={28} style={{ opacity: csvFile ? 1 : 0.45 }} />
              <span style={{ fontSize: '0.9rem' }}>
                {csvFile ? csvFile.name : 'Click to upload CSV file'}
              </span>
              {!csvFile && (
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                  Columns: patientName, registerNumber, dob, gender, bloodGroup, recordType, doctorName, issueDate, diagnosis, medCosts (optional)
                </span>
              )}
            </label>
            {csvFile && (
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCsvFile(null); setParsedData([]); const i = document.getElementById('bulk-csv'); if(i) i.value=''; }}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#22c55e', fontSize: '1rem', lineHeight: 1 }}
                title="Remove file">
                ×
              </button>
            )}
          </div>

          {parsedData.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Table size={18} /> Preview ({parsedData.length} rows)
                </h3>
                <button onClick={submitBulk} disabled={isProcessing} className="btn">
                  {isProcessing ? 'Anchoring...' : 'Confirm & Issue All'}
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                      {['Patient Name', 'Reg Number', 'Gender', 'Blood Group', 'Record Type', 'Doctor', 'Issue Date'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 5).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{row.patientName || row.name}</td>
                        <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.registerNumber}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{row.gender}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{row.bloodGroup}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{row.recordType}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{row.doctorName}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{row.issueDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 5 && (
                  <p style={{ padding: '0.6rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    ...and {parsedData.length - 5} more rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="alert alert-success" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <CheckCircle2 size={22} style={{ flexShrink: 0 }} />
              <div>
                <p className="alert-title">Processed {results.length} Records</p>
                <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>All records are now verifiable via their unique QR codes.</p>
              </div>
            </div>
            <button onClick={downloadAll} className="btn btn-outline" style={{ gap: '0.5rem' }}>
              <Download size={16} /> Download All QR Codes
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
            {results.map((res, i) => (
              <div key={i} className="card" style={{ padding: '1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <QRCodeCanvas
                  id={`qr-${i}`}
                  value={`${window.location.origin}/verify/${res.dataHash}`}
                  size={100}
                  level="M"
                />
                <p style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {res.dataHash.substring(0, 12)}...
                </p>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {res.patientName}
                </p>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: res.status === 'created' ? '#22c55e' : 'var(--text-muted)' }}>
                  {res.status === 'created' ? 'New' : 'Exists'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
