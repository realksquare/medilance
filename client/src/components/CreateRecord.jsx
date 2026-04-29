import React, { useState } from 'react';
import QRCode from 'qrcode';
import { Download, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CreateRecord() {
  const { user } = useAuth();
  const [mode, setMode] = useState('basic');
  const [formData, setFormData] = useState({
    patientName: '', gender: '', age: '', dob: '',
    registerNumber: '', bloodGroup: '', existingConditions: 'None',
    contactNumber: '', address: '', recordType: '',
    diagnosis: '', doctorName: '', issueDate: new Date().toISOString().split('T')[0], issuerName: '',
    claimAmount: ''
  });
  const [file, setFile] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const username = user?.username || 'guest';
      const apiBase = 'http://localhost:3005';
      const path = mode === 'basic' ? '/api/create-record' : '/api/create-record-file';
      let body;
      let headers = { 'x-username': username };

      if (mode === 'basic') {
        body = JSON.stringify({ recordData: formData });
        headers['Content-Type'] = 'application/json';
      } else {
        if (!file) throw new Error("File is required for Mint mode.");
        body = new FormData();
        body.append('file', file);
        body.append('recordData', JSON.stringify(formData));
      }

      const res = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: headers,
        body: body,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create record');

      if (mode === 'basic') {
        const verificationUrl = `${window.location.origin}/verify/${data.dataHash}`;
        const qr = await QRCode.toDataURL(verificationUrl);
        setQrCode(qr);
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadQR = () => {
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = `${formData.patientName.replace(/\s+/g, '_')}_QR.png`;
    link.click();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <Link to="/" className="nav-link flex items-center gap-2" style={{ width: 'fit-content', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>
        <ArrowLeft size={14} /> Back to Dashboard
      </Link>

      <header>
        <h1>Issue Secure Record</h1>
        <p style={{ color: 'var(--text-muted)' }}>Register a new immutable medical record with MediLance Protocol.</p>
      </header>

      <div className="flex gap-4">
        <button
          className={`btn ${mode === 'basic' ? '' : 'btn-outline'}`}
          style={{ flex: 1 }}
          onClick={() => {
            setMode('basic');
            setSuccess(false);
            setQrCode(null);
            setError(null);
          }}
        >
          Basic Mode (QR)
        </button>
        <button
          className={`btn ${mode === 'mint' ? '' : 'btn-outline'}`}
          style={{ flex: 1 }}
          onClick={() => {
            setMode('mint');
            setSuccess(false);
            setQrCode(null);
            setError(null);
          }}
        >
          Mint Mode (File)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="md:col-span-2 card">
          <form onSubmit={handleSubmit} className="space-y-8">
            {mode === 'mint' && (
              <section style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                <h3>Document Attachment</h3>
              <div style={{ position: 'relative' }}>
                <input
                  type="file"
                  id="mint-file-input"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files[0])}
                  required
                />
                <label htmlFor="mint-file-input" className={`file-upload-label${file ? ' has-file' : ''}`}
                  style={{ paddingRight: file ? '2.75rem' : undefined }}>
                  <span style={{ fontSize: '1.1rem' }}>📎</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {file ? file.name : 'Click to attach document (PDF or Image)'}
                  </span>
                </label>
                {file && (
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFile(null); const i = document.getElementById('mint-file-input'); if(i) i.value=''; }}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#22c55e', fontSize: '1rem', lineHeight: 1 }}
                    title="Remove file">
                    ×
                  </button>
                )}
              </div>
              </section>
            )}

            <section>
              <h3>Patient Identity</h3>
              <div className="form-group">
                <div className="form-full">
                  <label>Full Name</label>
                  <input name="patientName" placeholder="Mr. Krishna" onChange={handleChange} required />
                </div>
                <div>
                  <label>Register Number</label>
                  <input name="registerNumber" placeholder="ID-123456" onChange={handleChange} required />
                </div>
                <div>
                  <label>Date of Birth</label>
                  <div style={{ position: 'relative' }}>
                    <input name="dob" type="date" onChange={handleChange} required style={{ cursor: 'pointer' }} />
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', filter: 'brightness(2)' }}>📅</div>
                  </div>
                </div>
                <div>
                  <label>Gender</label>
                  <select name="gender" onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label>Blood Group</label>
                  <select name="bloodGroup" onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h3>Clinical Context</h3>
              <div className="form-group">
                <div>
                  <label>Record Type</label>
                  <select name="recordType" onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="Lab Report">Lab Report</option>
                    <option value="Prescription">Prescription</option>
                    <option value="Discharge">Discharge</option>
                  </select>
                </div>
                <div>
                  <label>Claim Amount (INR) <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8em' }}>optional, for fraud scoring</span></label>
                  <input
                    name="claimAmount"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 4500"
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label>Consulting Doctor</label>
                  <input name="doctorName" placeholder="Dr. Kavinesh" onChange={handleChange} required />
                </div>
                <div>
                  <label>Date of Issuance</label>
                  <div style={{ position: 'relative' }}>
                    <input name="issueDate" type="date" value={formData.issueDate} onChange={handleChange} required style={{ cursor: 'pointer' }} />
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', filter: 'brightness(2)' }}>📅</div>
                  </div>
                </div>
                <div className="form-full">
                  <label>Clinical Observation</label>
                  <textarea name="diagnosis" placeholder="Primary diagnosis and notes..." rows="3" onChange={handleChange} required />
                </div>
              </div>
            </section>

            <button type="submit" className="btn w-full" disabled={loading}>
              {loading ? 'Processing...' : `Issue ${mode === 'mint' ? 'Minted' : 'Basic'} Record`}
            </button>
          </form>
        </div>

        <div className="space-y-8">
          {mode === 'basic' ? (
            <div className="card text-center flex flex-col items-center">
              <h3>QR Code</h3>
              {qrCode ? (
                <div className="space-y-6">
                  <div className="p-4 bg-white border rounded-lg inline-block">
                    <img src={qrCode} alt="QR" className="w-48 h-48" />
                  </div>
                  <button onClick={downloadQR} className="btn btn-outline w-full">
                    Download QR Code
                  </button>
                </div>
              ) : (
                <div style={{ padding: '3rem', border: '2px dashed var(--border)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: '0.75rem' }}>Complete form to generate QR Code.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center flex flex-col items-center gap-4">
              <h3>File Seal</h3>
              {success ? (
                <div className="alert alert-success" style={{ flexDirection: 'column', alignItems: 'center', padding: '1.5rem', textAlign: 'center', width: '100%' }}>
                  <CheckCircle size={36} />
                  <div>
                    <p className="alert-title">File Sealed</p>
                    <p style={{ fontSize: '0.8rem' }}>The document hash is anchored. Upload this same file to Mint verification to prove authenticity.</p>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '3rem', border: '2px dashed var(--border)', borderRadius: '12px', color: 'var(--text-muted)', width: '100%' }}>
                  <p style={{ fontSize: '0.75rem' }}>Attach document and submit to seal.</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p className="alert-title">Failed</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              <CheckCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p className="alert-title">Record Anchored</p>
                <p>This record has been cryptographically sealed and stored.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
