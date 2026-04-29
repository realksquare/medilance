import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import VerificationPage from './components/VerificationPage';
import CreateRecord from './components/CreateRecord';
import BulkUpload from './components/BulkUpload';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthGate from './pages/AuthGate';
import AdminDashboard from './pages/AdminDashboard';
import VerifierDashboard from './pages/VerifierDashboard';

// Guard: redirect logged-in users away from login/register
function GuestOnly({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/profile" replace /> : children;
}

// Guard: show AuthGate to guests on /profile
function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <AuthGate />;
}

const FAQ_ITEMS = [
  {
    q: 'What is MediLance?',
    a: 'MediLance is a platform that lets healthcare providers issue tamper-proof medical records and allows anyone with the record to verify its authenticity instantly. Think of it as a digital seal on your medical documents that cannot be faked without detection.',
  },
  {
    q: 'How does the verification actually work?',
    a: 'When a record is issued, MediLance generates a unique cryptographic fingerprint of the data or file and stores it. A QR code is produced that links to this fingerprint. Anyone can scan or paste the hash to confirm the record has not been altered since it was issued.',
  },
  {
    q: 'What is the difference between Basic mode and Mint mode?',
    a: 'Basic mode issues a record from the form data you fill in and seals it with a hash. Mint mode goes further by also hashing the actual uploaded file, so even a single change in the original document is caught during verification. Bulk verification only works with Mint records for this reason.',
  },
  {
    q: 'Can Mint verification handle casual phone photos of documents?',
    a: 'Yes. Before hashing, MediLance normalizes images by stripping camera metadata, converting to greyscale, and resizing to a standard width. This means a phone photo of a document taken in different lighting or at a slight angle will still produce the same hash as the source, unless the content itself has been altered.',
  },
  {
    q: 'What is Bulk Mint Verification?',
    a: 'Bulk Mint Verification lets you upload multiple documents at once and verify all of them in a single step. Each file is checked independently and you get a per-file result showing whether it is authentic or not. This is only available for Mint records because Basic records do not carry a file fingerprint.',
  },
  {
    q: 'What makes this better than existing systems?',
    a: 'Most hospital record systems are siloed and rely on paper or proprietary portals. MediLance creates a verifiable, portable proof that does not depend on the issuing institution being online. A patient, insurer, or doctor can verify a record independently without calling anyone.',
  },
  {
    q: 'How does MediLance detect fraudulent claims?',
    a: 'MediLance runs every record through a multi-signal fraud engine the moment it is verified. It checks for duplicate records issued to the same patient on the same day, cross-provider hash collisions, billing amounts that deviate significantly from expected baselines, and treatment combinations that are medically implausible. Each signal reduces the record Integrity Score, giving insurers and verifiers a clear risk grade.',
  },
  {
    q: 'What is the Express Approval system?',
    a: 'Records that score 95 or above on the Integrity Index and whose billing falls within the expected range for the procedure are automatically flagged as pre-approved. This means verified, clean claims bypass manual review entirely, reducing payout delays for legitimate healthcare. Records that fall below that threshold are routed to the Anomalies Manager for human review.',
  },
  {
    q: 'How can I get this engine for my institution?',
    a: 'MediLance is designed to run as a private, decentralized engine owned by you. Each hospital, clinic, insurance company, or individual practitioner gets their own standalone instance that they control entirely. To get set up with a master account for your organization, reach out to the MediLance team. We will provision a master account unique to your institution, from which you can create and manage all your issuers and verifiers without depending on any third-party cloud.',
  },
  {
    q: 'What technology is behind MediLance?',
    a: 'The frontend is built with React. The backend runs on Node.js with Express. Records are stored in a local JSON database. Image normalization uses the Sharp library. Cryptographic hashing uses SHA-256, the same standard used in most security protocols today.',
  },
  {
    q: 'Does it work without internet?',
    a: 'Yes. MediLance is designed to run entirely offline on a local machine. The server and client both run locally, so there is no dependency on cloud connectivity for issuing or verifying records.',
  },
  {
    q: 'Who can use MediLance?',
    a: 'Doctors and hospital staff can issue records. Patients can receive a QR code linked to their record. Insurers, pharmacists, or other healthcare providers can scan or paste the hash to verify authenticity without needing an account.',
  },
];


function FaqAccordion() {
  const [open, setOpen] = React.useState(null);
  return (
    <div className="faq-section">
      <h2>Questions about MediLance</h2>
      <p>Here are answers to some common things people ask about the platform.</p>
      {FAQ_ITEMS.map((item, i) => (
        <div className="faq-item" key={i}>
          <button className="faq-question" onClick={() => setOpen(open === i ? null : i)}>
            <span>{item.q}</span>
            <svg
              className={`faq-chevron${open === i ? ' open' : ''}`}
              width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className={`faq-answer${open === i ? ' open' : ''}`}>
            {item.a}
          </div>
        </div>
      ))}
    </div>
  );
}

function AppRoutes() {
  return (
    <div className="app-container">
      <Navbar />

      <main className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        <Routes>
          {/* Home */}
          <Route path="/" element={
            <div className="max-w-4xl mx-auto">
              <header style={{ marginBottom: '4rem' }}>
                <h1 className="hero-h1" style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 900, letterSpacing: '-0.05em' }}>
                  Medical record integrity, <span style={{ color: 'var(--primary)' }}>anchored.</span>
                </h1>
                <p style={{ marginTop: '1.5rem', fontSize: '1.2rem', color: 'var(--text-muted)', maxWidth: '600px', lineHeight: '1.75' }}>
                  MediLance provides a tamper-proof layer for healthcare data,
                  ensuring trust between patients, providers, and insurers.
                </p>
              </header>

              <div className="dashboard-grid">
                <div className="card">
                  <h2 style={{ color: 'var(--primary)' }}>Issue Records</h2>
                  <p className="card-text" style={{ marginTop: '0.75rem' }}>
                    Generate cryptographically secure QR tokens for medical documents.
                  </p>
                  <Link to="/create" className="btn" style={{ textDecoration: 'none', marginTop: '1.5rem', display: 'inline-flex' }}>Issue Now</Link>
                </div>

                <div className="card">
                  <h2 style={{ color: 'var(--primary)' }}>Verify Authenticity</h2>
                  <p className="card-text" style={{ marginTop: '0.75rem' }}>
                    Instantly detect digital or physical tampering using Dual-Layer scans.
                  </p>
                  <Link to="/verify" className="btn" style={{ textDecoration: 'none', marginTop: '1.5rem', display: 'inline-flex' }}>Verify Now</Link>
                </div>

                <div className="card">
                  <h2 style={{ color: 'var(--primary)' }}>Batch Processing</h2>
                  <p className="card-text" style={{ marginTop: '0.75rem' }}>
                    Scale up with CSV-based bulk issuance and institutional anchoring.
                  </p>
                  <Link to="/bulk" className="btn" style={{ textDecoration: 'none', marginTop: '1.5rem', display: 'inline-flex' }}>Open Bulk Tool</Link>
                </div>
              </div>

              <FaqAccordion />
            </div>
          } />

          {/* Auth Routes */}
          <Route path="/login"    element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />

          {/* Protected */}
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />

          {/* Public */}
          <Route path="/create" element={<CreateRecord />} />
          <Route path="/verify" element={<VerificationPage />} />
          <Route path="/bulk"   element={<BulkUpload />} />
          <Route path="/admin"    element={<AdminDashboard />} />
          <Route path="/anomalies" element={<VerifierDashboard />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="container">
          © {new Date().getFullYear()} MediLance Protocol • Secure • Private • Decentralized - Built by Team K^3.
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;

