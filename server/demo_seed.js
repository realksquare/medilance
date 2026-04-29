/**
 * demo_seed.js — MediLance Demo Data Seeder
 * 
 * Creates 6 pre-seeded records in local_db.json:
 *   1. Legit Mint        — Grade A, Score 100 (file-mode record, clean)
 *   2. Low Risk          — Grade B, Score ~80 (moderate billing anomaly only)
 *   3. High Risk         — Grade C, Score ~65 (billing anomaly + missing fields)
 *   4. Critical Ghost    — Grade D, Score 0   (simultaneous billing collision, dup reg#)
 *   5. Fake Basic        — Grade D, Score 0   (cross-issuer hash + collision)
 *   6. Fake Mint         — Grade D, Score 0   (same register#, ghost billing pattern)
 * 
 * The "Legit Basic" record is NOT seeded — use the form content printed at the end.
 * 
 * Run with: node demo_seed.js
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const DB_FILE = path.join(__dirname, 'local_db.json');

// ─── Same hash function as server/index.js ────────────────────────────────────
function createStableHash(data) {
    const sortObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        return Object.keys(obj).sort().reduce((acc, key) => {
            acc[key] = sortObject(obj[key]);
            return acc;
        }, {});
    };
    return crypto.createHash('sha256').update(JSON.stringify(sortObject(data))).digest('hex');
}

// ─── Issuer profiles ─────────────────────────────────────────────────────────
const issuerA = {
    username: 'kavinesh',
    profile: { fullName: 'Dr. Kavinesh R.', role: 'dual', type: 'hospital', institution: 'Apollo Hospitals, Chennai' }
};
const issuerB = {
    username: 'krish',
    profile: { fullName: 'Dr. Krish S.', role: 'dual', type: 'clinic', institution: 'City Clinic, Coimbatore' }
};
const issuerC = {
    username: 'jury',
    profile: { fullName: 'Jury Member', role: 'issuer', type: 'laboratory', institution: 'MediLance Demo Lab' }
};

// ─── Record definitions ───────────────────────────────────────────────────────

// 1. LEGIT MINT — clean, normal costs, single issuer, no flags → Score 100, Grade A
const legitMintData = {
    patientName:   'Priya Sharma',
    registerNumber:'PID-2024-001',
    dob:           '1990-03-15',
    gender:        'Female',
    age:           '34',
    bloodGroup:    'O+',
    existingConditions: 'None',
    contactNumber: '9876543210',
    address:       'No.12, Anna Nagar, Chennai',
    recordType:    'Lab Report',
    diagnosis:     'Complete Blood Count – All values within normal range',
    doctorName:    'Dr. Kavinesh R.',
    issueDate:     '2026-04-01',
    issuerName:    'Apollo Hospitals',
    medCosts:      '2200'
};
const legitMintFileHash = crypto.createHash('sha256').update('MEDILANCE_DEMO_LEGIT_MINT_FILE_PRIYA_SHARMA_v1').digest('hex');

// 2. LOW RISK — moderate billing anomaly (1.8x baseline for Lab Report = 4500 vs 2500) → -10, Score 90, Grade A
//    Actually let's make it Grade B: use Prescription at 2200 vs 1200 = 1.83x → -10, Score 90 still A
//    Let's use Prescription at 2500 vs 1200 = 2.08x → -10, Score 90, Grade A
//    To get Grade B we need score 75-89, deduction 11-25.
//    Use Lab Report at 5000 vs 2500 = 2.0x → only moderate (-10), Score 90 (A).
//    Add one missing non-critical field... fields are registerNumber, dob, doctorName.
//    Let's omit doctorName → -5 + billing moderate -10 = -15 → Score 85, Grade B ✓
const lowRiskData = {
    patientName:   'Rajan Pillai',
    registerNumber:'PID-2024-002',
    dob:           '1975-08-22',
    gender:        'Male',
    age:           '50',
    bloodGroup:    'B+',
    existingConditions: 'Hypertension',
    contactNumber: '9988776655',
    address:       'No. 7, Gandhi Road, Madurai',
    recordType:    'Lab Report',
    diagnosis:     'Thyroid function test — TSH mildly elevated, follow-up in 3 months',
    doctorName:    '',      // MISSING — triggers -5
    issueDate:     '2026-04-05',
    issuerName:    'MediLance Demo Lab',
    medCosts:      '4800'  // 4800 / 2500 = 1.92x → BILLING_ANOMALY_MODERATE (-10)
};
const lowRiskHash = createStableHash(lowRiskData);

// 3. HIGH RISK — billing anomaly critical (3x Lab baseline = 7500) -25 + missing dob -5 = -30 → Score 70, Grade C
const highRiskData = {
    patientName:   'Meena Iyer',
    registerNumber:'PID-2024-003',
    dob:           '',          // MISSING — triggers -5
    gender:        'Female',
    age:           '42',
    bloodGroup:    'A-',
    existingConditions: 'Diabetes',
    contactNumber: '9123456780',
    address:       'No.5, Velachery Main Road, Chennai',
    recordType:    'Lab Report',
    diagnosis:     'Full body health checkup panel',
    doctorName:    'Dr. Sunitha Pillai',
    issueDate:     '2026-04-10',
    issuerName:    'City Clinic',
    medCosts:      '8500'  // 8500 / 2500 = 3.4x → BILLING_ANOMALY_CRITICAL (-25)
};
const highRiskHash = createStableHash(highRiskData);

// 4. CRITICAL GHOST — Simultaneous billing collision:
//    "Arjun Mehta" PID-2024-GHOST issued by issuerA AND issuerB on SAME DATE.
//    Signal 2 (dup reg#) -35 + Signal 3 (patient collision) -25 + Signal 7 (same-day) -40 = -100 → Score 0, Grade D
const ghostRecordA_data = {
    patientName:   'Arjun Mehta',
    registerNumber:'PID-2024-GHOST',
    dob:           '1985-11-03',
    gender:        'Male',
    age:           '40',
    bloodGroup:    'AB+',
    existingConditions: 'None',
    contactNumber: '9000011111',
    address:       'No.3, MG Road, Bangalore',
    recordType:    'Discharge',
    diagnosis:     'Post-operative recovery — appendectomy',
    doctorName:    'Dr. Kavinesh R.',
    issueDate:     '2026-04-15',   // SAME DATE as ghostRecordB
    issuerName:    'Apollo Hospitals',
    medCosts:      '55000'
};

const ghostRecordB_data = {
    patientName:   'Arjun Mehta',
    registerNumber:'PID-2024-GHOST',  // SAME register # — different issuer
    dob:           '1985-11-03',
    gender:        'Male',
    age:           '40',
    bloodGroup:    'AB+',
    existingConditions: 'None',
    contactNumber: '9000011111',
    address:       'No.3, MG Road, Bangalore',
    recordType:    'Discharge',
    diagnosis:     'Post-operative recovery — appendectomy',  // identical
    doctorName:    'Dr. Krish S.',
    issueDate:     '2026-04-15',   // SAME DATE — simultaneous billing collision
    issuerName:    'City Clinic',
    medCosts:      '58000'
};
const ghostHashA = createStableHash(ghostRecordA_data);
const ghostHashB = createStableHash(ghostRecordB_data);

// 5. FAKE BASIC — massive bill inflation (100x prescription baseline), missing fields
//    Prescription avg = 1200. 120000 / 1200 = 100x → BILLING_ANOMALY_CRITICAL (-25)
//    Missing dob + doctorName = -10
//    = Score 65, Grade C — let's add also cross-issuer via fake duplicate reg
//    Actually let's keep it simple: just extreme billing anomaly + missing fields → Score 65, Grade C
const fakeBasicData = {
    patientName:   'Vikram Nair',
    registerNumber:'PID-2024-FAKE',
    dob:           '',          // MISSING -5
    gender:        'Male',
    age:           '35',
    bloodGroup:    'O-',
    existingConditions: 'None',
    contactNumber: '8800000001',
    address:       'No.88, Fake Colony, Mumbai',
    recordType:    'Prescription',
    diagnosis:     'Vitamin supplements, pain medication course',
    doctorName:    '',          // MISSING -5
    issueDate:     '2026-04-20',
    issuerName:    'Unknown Pharmacy',
    medCosts:      '75000'  // 75000 / 1200 = 62.5x → BILLING_ANOMALY_CRITICAL (-25)
};
const fakeBasicHash = createStableHash(fakeBasicData);

// 6. FAKE MINT — same register number as the ghost record but different issuer
//    Uses a fake file hash (simulates a forged/reused document)
//    Signal 2 (dup reg# PID-2024-GHOST from different issuer) -35
//    + Billing anomaly critical on Discharge at 350000 vs 55000 = 6.36x -25
//    = Score 40, Grade D
const fakeMintFileHash = crypto.createHash('sha256').update('MEDILANCE_DEMO_FAKE_MINT_FILE_REUSED_DOCUMENT_v1').digest('hex');
const fakeMintData = {
    patientName:   'Arjun Mehta',        // Same patient as ghost record
    registerNumber:'PID-2024-GHOST',     // SAME reg# — ghost collision
    dob:           '1985-11-03',
    gender:        'Male',
    age:           '40',
    bloodGroup:    'AB+',
    existingConditions: 'None',
    contactNumber: '9000011111',
    address:       'No.3, MG Road, Bangalore',
    recordType:    'Discharge',
    diagnosis:     'Forged discharge summary — reused template',
    doctorName:    'Dr. Unknown',
    issueDate:     '2026-04-18',
    issuerName:    'Rogue Diagnostics Ltd.',
    medCosts:      '350000'   // 350000 / 55000 = 6.36x → BILLING_ANOMALY_CRITICAL (-25)
};

// ─── Build local_db.json ──────────────────────────────────────────────────────

const now = new Date().toISOString();

const users = [
    {
        username:      'kavinesh',
        fullName:      'Dr. Kavinesh R.',
        email:         'kavinesh@medilance.demo',
        role:          'dual',
        type:          'hospital',
        institution:   'Apollo Hospitals, Chennai',
        emailVerified: true,
        doj:           '2025-01-10T00:00:00.000Z',
    },
    {
        username:      'krish',
        fullName:      'Dr. Krish S.',
        email:         'krish@medilance.demo',
        role:          'dual',
        type:          'clinic',
        institution:   'City Clinic, Coimbatore',
        emailVerified: true,
        doj:           '2025-01-12T00:00:00.000Z',
    },
    {
        username:      'jury',
        fullName:      'Jury Member',
        email:         'jury@medilance.demo',
        role:          'issuer',
        type:          'laboratory',
        institution:   'MediLance Demo Lab',
        emailVerified: false,
        doj:           '2026-04-01T00:00:00.000Z',
    },
];

const medical_records = [
    // ── 1. Legit Mint (Score 100, Grade A) ────────────────────────────────────
    {
        ...legitMintData,
        fileHash:        legitMintFileHash,
        mode:            'mint',
        issuerUsername:  issuerA.username,
        issuerProfile:   issuerA.profile,
        createdAt:       '2026-04-01T09:00:00.000Z',
    },

    // ── 2. Low Risk (Score 85, Grade B) ───────────────────────────────────────
    {
        ...lowRiskData,
        dataHash:        lowRiskHash,
        mode:            'basic',
        issuerUsername:  issuerC.username,
        issuerProfile:   issuerC.profile,
        createdAt:       '2026-04-05T10:30:00.000Z',
    },

    // ── 3. High Risk (Score 70, Grade C) ──────────────────────────────────────
    {
        ...highRiskData,
        dataHash:        highRiskHash,
        mode:            'basic',
        issuerUsername:  issuerB.username,
        issuerProfile:   issuerB.profile,
        createdAt:       '2026-04-10T14:00:00.000Z',
    },

    // ── 4a. Critical Ghost — Apollo side (Score 0, Grade D) ───────────────────
    {
        ...ghostRecordA_data,
        dataHash:        ghostHashA,
        mode:            'basic',
        issuerUsername:  issuerA.username,
        issuerProfile:   issuerA.profile,
        createdAt:       '2026-04-15T08:00:00.000Z',
    },

    // ── 4b. Critical Ghost — City Clinic side (Score 0, Grade D) ──────────────
    {
        ...ghostRecordB_data,
        dataHash:        ghostHashB,
        mode:            'basic',
        issuerUsername:  issuerB.username,
        issuerProfile:   issuerB.profile,
        createdAt:       '2026-04-15T09:15:00.000Z',
    },

    // ── 5. Fake Basic (Score 65, Grade C) ─────────────────────────────────────
    {
        ...fakeBasicData,
        dataHash:        fakeBasicHash,
        mode:            'basic',
        issuerUsername:  'unknown_issuer',
        issuerProfile:   { fullName: 'Unknown', role: 'issuer', type: 'individual', institution: 'Unknown Pharmacy' },
        createdAt:       '2026-04-20T16:00:00.000Z',
    },

    // ── 6. Fake Mint (Score 40, Grade D) ─────────────────────────────────────
    {
        ...fakeMintData,
        fileHash:        fakeMintFileHash,
        mode:            'mint',
        issuerUsername:  'rogue_lab',
        issuerProfile:   { fullName: 'Dr. Unknown', role: 'issuer', type: 'laboratory', institution: 'Rogue Diagnostics Ltd.' },
        createdAt:       '2026-04-18T11:00:00.000Z',
    },
];

const db = { users, actions: [], medical_records };
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

console.log('\n✅ local_db.json written successfully!\n');
console.log('─── Pre-seeded Records ────────────────────────────────────────────────────');
console.log(`  1. Legit Mint     | Priya Sharma     | fileHash: ${legitMintFileHash.substring(0,16)}...`);
console.log(`  2. Low Risk       | Rajan Pillai     | dataHash: ${lowRiskHash.substring(0,16)}...`);
console.log(`  3. High Risk      | Meena Iyer       | dataHash: ${highRiskHash.substring(0,16)}...`);
console.log(`  4. Ghost (Apollo) | Arjun Mehta      | dataHash: ${ghostHashA.substring(0,16)}...`);
console.log(`  5. Ghost (Clinic) | Arjun Mehta      | dataHash: ${ghostHashB.substring(0,16)}...`);
console.log(`  6. Fake Basic     | Vikram Nair      | dataHash: ${fakeBasicHash.substring(0,16)}...`);
console.log(`  7. Fake Mint      | Arjun Mehta      | fileHash: ${fakeMintFileHash.substring(0,16)}...`);
console.log('\n─── ⚡ LIVE DEMO RECORD (Legit Basic — show form-fill to judges) ──────────');
console.log('  Enter this in the "Issue Record" form (Basic mode), logged in as "jury":');
console.log('');
console.log('  Patient Name    : Ananya Krishnan');
console.log('  Register Number : PID-2024-DEMO');
console.log('  Date of Birth   : 2000-06-20');
console.log('  Gender          : Female');
console.log('  Age             : 25');
console.log('  Blood Group     : A+');
console.log('  Existing Cond.  : None');
console.log('  Contact         : 9090909090');
console.log('  Address         : No.1, Demo Street, Chennai');
console.log('  Record Type     : Lab Report');
console.log('  Diagnosis       : Routine annual health checkup — all results normal');
console.log('  Doctor Name     : Dr. Ananya Demo');
console.log('  Issue Date      : 2026-04-30');
console.log('  Issuer Name     : MediLance Demo Lab');
console.log('  Medical Costs   : 2300');
console.log('\n  ✅ This will produce a QR code. Scan it → Score 100, Grade A (Legit)');
console.log('─────────────────────────────────────────────────────────────────────────\n');
