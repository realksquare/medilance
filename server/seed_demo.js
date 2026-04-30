/**
 * seed_demo.js — MediLance Demo Seeder
 * Run: node seed_demo.js
 *
 * 1. Legit Basic   (Score 100, Grade A)  - basic hash verification
 * 2. Legit Mint    (Score 100, Grade A)  - mint (file hash) verification
 * 3. Fake Basic    Moderate (Score ~65)  - billing anomaly + missing dob
 * 4. Fake Mint     Moderate (Score ~65)  - billing anomaly + missing fields
 * 5. Fake Basic    Critical (Score 0)    - ghost procedure, duplicate reg#
 * 6. Fake Mint     Critical (Score 0)    - extreme billing, no doctor on record
 */

const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const QRCode  = require('qrcode');
const PDFDoc  = require('pdfkit');

const DB_FILE  = path.join(__dirname, 'local_db.json');
const PDFS_DIR = path.join(__dirname, 'demo_pdfs');
if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR);

function createStableHash(data) {
    const sort = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        return Object.keys(obj).sort().reduce((a, k) => { a[k] = sort(obj[k]); return a; }, {});
    };
    return crypto.createHash('sha256').update(JSON.stringify(sort(data))).digest('hex');
}

async function qrPng(text) {
    return QRCode.toBuffer(text, { type: 'png', width: 180, margin: 1, errorCorrectionLevel: 'M' });
}

function buildPDFBuffer(title, fields, qrBuf, badge) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDoc({ margin: 50, size: 'A4' });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const badgeColors = { 'LEGIT': '#22c55e', 'MODERATE RISK': '#f59e0b', 'CRITICAL': '#ef4444' };
        const badgeColor = badgeColors[badge] || '#64748b';

        doc.fillColor('#2563eb').fontSize(22).font('Helvetica-Bold').text('MEDILANCE', { align: 'center' });
        doc.fillColor('#64748b').fontSize(8).font('Helvetica')
           .text('Fraud Intelligence Engine  |  Immutable Healthcare Record', { align: 'center' });

        doc.moveDown(0.3);
        const badgeY = doc.y;
        doc.roundedRect(200, badgeY, 195, 18, 4).fill(badgeColor);
        doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
           .text(badge, 200, badgeY + 4, { width: 195, align: 'center' });

        doc.moveDown(1.5);
        doc.fillColor('#000').fontSize(13).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
        doc.moveDown(0.6);

        const qrX = 400, qrY = doc.y, qrSize = 128;
        doc.image(qrBuf, qrX, qrY, { width: qrSize });

        const textMaxY = qrY + qrSize + 10;
        for (const [label, value] of fields) {
            if (doc.y > textMaxY) break;
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#374151')
               .text(`${label}:`, 50, doc.y, { continued: true, width: 330 });
            doc.font('Helvetica').fillColor('#111').text(`  ${value}`, { width: 330 });
        }

        if (doc.y < qrY + qrSize + 10) doc.y = qrY + qrSize + 12;

        doc.moveDown(0.5);
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#94a3b8')
           .text('Scan QR to verify on MediLance. Any modification to this file will invalidate the fingerprint.', { align: 'center' });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.moveDown(0.2);
        doc.fontSize(6.5).fillColor('#cbd5e1').text('MediLance Protocol  |  Do not reproduce without authorization', { align: 'center' });

        doc.end();
    });
}

async function buildAndSavePDF(filename, title, fields, qrBuf, badge) {
    const buf = await buildPDFBuffer(title, fields, qrBuf, badge);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    fs.writeFileSync(path.join(PDFS_DIR, filename), buf);
    return { hash, buf };
}

async function buildMintPDF(filename, title, fields, badge) {
    // Pass 1: build with placeholder QR to get an approximate hash
    const placeholder = await qrPng('PLACEHOLDER');
    const pass1 = await buildPDFBuffer(title, fields, placeholder, badge);
    const approxHash = crypto.createHash('sha256').update(pass1).digest('hex');

    // Pass 2: embed the approxHash as QR and regenerate
    const qr = await qrPng(approxHash);
    const finalFields = [...fields.filter(([l]) => l !== 'File Hash'), ['File Hash', approxHash.substring(0, 32) + '...']];
    const pass2buf = await buildPDFBuffer(title, finalFields, qr, badge);
    const finalHash = crypto.createHash('sha256').update(pass2buf).digest('hex');
    fs.writeFileSync(path.join(PDFS_DIR, filename), pass2buf);

    return { hash: finalHash };
}

// ── Issuers ──
const iA = { username: 'kavinesh', profile: { fullName: 'Dr. Kavinesh R.', role: 'dual', type: 'hospital', institution: 'Apollo Hospitals, Chennai' } };
const iB = { username: 'krish',    profile: { fullName: 'Dr. Krish S.',    role: 'dual', type: 'clinic',   institution: 'City Clinic, Coimbatore' } };
const iJ = { username: 'jury',     profile: { fullName: 'JuryHH',          role: 'dual', type: 'hospital',  institution: 'MediLance Protocol' } };
const iX = { username: 'unknown_issuer', profile: { fullName: 'Unknown', role: 'issuer', type: 'individual', institution: 'Unknown Pharmacy' } };

// ── Record data ──

const d1 = {
    patientName: 'Ananya Krishnan', registerNumber: 'PID-2026-DEMO',
    dob: '2000-06-20', gender: 'Female', age: '25', bloodGroup: 'A+',
    existingConditions: 'None', contactNumber: '9090909090',
    address: 'No.1, Demo Street, Chennai', recordType: 'Lab Report',
    diagnosis: 'Routine annual health checkup - all results normal',
    doctorName: 'Dr. Ananya Demo', issueDate: '2026-04-30',
    issuerName: 'MediLance Demo Lab', medCosts: '2300',
};

const d2 = {
    patientName: 'Priya Sharma', registerNumber: 'PID-2024-001',
    dob: '1990-03-15', gender: 'Female', age: '34', bloodGroup: 'O+',
    existingConditions: 'None', contactNumber: '9876543210',
    address: 'No.12, Anna Nagar, Chennai', recordType: 'Lab Report',
    diagnosis: 'Complete Blood Count - All values within normal range',
    doctorName: 'Dr. Kavinesh R.', issueDate: '2026-04-01',
    issuerName: 'Apollo Hospitals', medCosts: '2200',
};

const d3 = {
    patientName: 'Meena Iyer', registerNumber: 'PID-2024-003',
    dob: '', gender: 'Female', age: '42', bloodGroup: 'A-',
    existingConditions: 'Diabetes', contactNumber: '9123456780',
    address: 'No.5, Velachery Main Road, Chennai', recordType: 'Lab Report',
    diagnosis: 'Full body health checkup panel - elevated glucose noted',
    doctorName: 'Dr. Sunitha Pillai', issueDate: '2026-04-10',
    issuerName: 'City Clinic', medCosts: '8500',
};

const d4 = {
    patientName: 'Rajan Pillai', registerNumber: 'PID-2024-002',
    dob: '', gender: 'Male', age: '50', bloodGroup: 'B+',
    existingConditions: 'Hypertension', contactNumber: '9988776655',
    address: 'No. 7, Gandhi Road, Madurai', recordType: 'Lab Report',
    diagnosis: 'Thyroid function test - TSH mildly elevated, follow-up in 3 months',
    doctorName: '', issueDate: '2026-04-05',
    issuerName: 'MediLance Demo Lab', medCosts: '4800',
};

const d5 = {
    patientName: 'Arjun Mehta', registerNumber: 'PID-2024-GHOST',
    dob: '1985-11-03', gender: 'Male', age: '40', bloodGroup: 'AB+',
    existingConditions: 'None', contactNumber: '9000011111',
    address: 'No.3, MG Road, Bangalore', recordType: 'Discharge',
    diagnosis: 'Post-operative recovery - appendectomy',
    doctorName: 'Dr. Kavinesh R.', issueDate: '2026-04-15',
    issuerName: 'Apollo Hospitals', medCosts: '55000',
};

const d6 = {
    patientName: 'Vikram Nair', registerNumber: 'PID-2024-FAKE',
    dob: '', gender: 'Male', age: '35', bloodGroup: 'O-',
    existingConditions: 'None', contactNumber: '8800000001',
    address: 'No.88, Fake Colony, Mumbai', recordType: 'Prescription',
    diagnosis: 'Vitamin supplements, pain medication course - fabricated claim',
    doctorName: '', issueDate: '2026-04-20',
    issuerName: 'Unknown Pharmacy', medCosts: '75000',
};

// 5b. GHOST COLLISION PARTNER — same patient, same date, different issuer (City Clinic)
// This paired record triggers Signals 2, 3, 7 when EITHER ghost record is verified
const d5b = {
    patientName: 'Arjun Mehta', registerNumber: 'PID-2024-GHOST',
    dob: '1985-11-03', gender: 'Male', age: '40', bloodGroup: 'AB+',
    existingConditions: 'None', contactNumber: '9000011111',
    address: 'No.3, MG Road, Bangalore', recordType: 'Discharge',
    diagnosis: 'Post-operative recovery - appendectomy (duplicate claim)',
    doctorName: 'Dr. Krish S.', issueDate: '2026-04-15',
    issuerName: 'City Clinic', medCosts: '58000',
};

async function main() {
    console.log('\n=== MediLance Demo Seeder ===\n');

    const hash1  = createStableHash(d1);
    const hash3  = createStableHash(d3);
    const hash5  = createStableHash(d5);
    const hash5b = createStableHash(d5b);

    console.log('Building PDFs with embedded QR codes...\n');

    // 1. Legit Basic — QR contains the dataHash
    const r1 = await buildAndSavePDF(
        '1_legit_basic_ananya.pdf', 'Lab Report - Annual Health Checkup',
        [
            ['Patient Name', d1.patientName], ['Register No.', d1.registerNumber],
            ['Date of Birth', '20 June 2000'], ['Gender / Age', `${d1.gender}, ${d1.age}`],
            ['Blood Group', d1.bloodGroup], ['Conditions', d1.existingConditions],
            ['Contact', d1.contactNumber], ['Address', d1.address],
            ['Record Type', d1.recordType], ['Diagnosis', d1.diagnosis],
            ['Doctor', d1.doctorName], ['Issue Date', '30 April 2026'],
            ['Issuer', d1.issuerName], ['Medical Costs', `INR 2,300`],
            ['Data Hash', hash1.substring(0, 32) + '...'],
        ],
        await qrPng(hash1), 'LEGIT'
    );

    // 2. Legit Mint — QR contains the fileHash (2-pass)
    const r2 = await buildMintPDF(
        '2_legit_mint_priya.pdf', 'Lab Report - Complete Blood Count',
        [
            ['Patient Name', d2.patientName], ['Register No.', d2.registerNumber],
            ['Date of Birth', '15 March 1990'], ['Gender / Age', `${d2.gender}, ${d2.age}`],
            ['Blood Group', d2.bloodGroup], ['Conditions', d2.existingConditions],
            ['Contact', d2.contactNumber], ['Address', d2.address],
            ['Record Type', d2.recordType], ['Diagnosis', d2.diagnosis],
            ['Doctor', d2.doctorName], ['Issue Date', '01 April 2026'],
            ['Issuer', 'Apollo Hospitals, Chennai'], ['Medical Costs', 'INR 2,200'],
            ['File Hash', '...'],
        ], 'LEGIT'
    );

    // 3. Fake Basic Moderate — QR contains the dataHash
    const r3 = await buildAndSavePDF(
        '3_fake_basic_moderate_meena.pdf', 'Lab Report - Health Checkup (FLAGGED)',
        [
            ['Patient Name', d3.patientName], ['Register No.', d3.registerNumber],
            ['Date of Birth', 'N/A (missing)'], ['Gender / Age', `${d3.gender}, ${d3.age}`],
            ['Blood Group', d3.bloodGroup], ['Conditions', d3.existingConditions],
            ['Contact', d3.contactNumber], ['Address', d3.address],
            ['Record Type', d3.recordType], ['Diagnosis', d3.diagnosis],
            ['Doctor', d3.doctorName], ['Issue Date', '10 April 2026'],
            ['Issuer', d3.issuerName], ['Medical Costs', 'INR 8,500'],
            ['Data Hash', hash3.substring(0, 32) + '...'],
            ['Alert', 'Billing 3.4x baseline - MODERATE flag'],
        ],
        await qrPng(hash3), 'MODERATE RISK'
    );

    // 4. Fake Mint Moderate — QR contains fileHash (2-pass)
    const r4 = await buildMintPDF(
        '4_fake_mint_moderate_rajan.pdf', 'Lab Report - Thyroid Panel (FLAGGED)',
        [
            ['Patient Name', d4.patientName], ['Register No.', d4.registerNumber],
            ['Date of Birth', 'N/A (missing)'], ['Gender / Age', `${d4.gender}, ${d4.age}`],
            ['Blood Group', d4.bloodGroup], ['Conditions', d4.existingConditions],
            ['Contact', d4.contactNumber], ['Address', d4.address],
            ['Record Type', d4.recordType], ['Diagnosis', d4.diagnosis],
            ['Doctor', 'N/A (missing)'], ['Issue Date', '05 April 2026'],
            ['Issuer', d4.issuerName], ['Medical Costs', 'INR 4,800'],
            ['File Hash', '...'],
            ['Alert', 'Missing DOB + Doctor - billing anomaly flagged'],
        ], 'MODERATE RISK'
    );

    // 5. Fake Basic Critical — QR contains the dataHash
    const r5 = await buildAndSavePDF(
        '5_fake_basic_critical_arjun.pdf', 'Discharge Summary - GHOST PROCEDURE DETECTED',
        [
            ['Patient Name', d5.patientName], ['Register No.', d5.registerNumber],
            ['Date of Birth', '03 November 1985'], ['Gender / Age', `${d5.gender}, ${d5.age}`],
            ['Blood Group', d5.bloodGroup], ['Conditions', d5.existingConditions],
            ['Contact', d5.contactNumber], ['Address', d5.address],
            ['Record Type', d5.recordType], ['Diagnosis', d5.diagnosis],
            ['Doctor', d5.doctorName], ['Issue Date', '15 April 2026'],
            ['Issuer', d5.issuerName], ['Medical Costs', 'INR 55,000'],
            ['Data Hash', hash5.substring(0, 32) + '...'],
            ['FRAUD FLAG', 'Duplicate reg# - simultaneous billing collision'],
        ],
        await qrPng(hash5), 'CRITICAL'
    );

    // 6. Fake Mint Critical — QR contains fileHash (2-pass)
    const r6 = await buildMintPDF(
        '6_fake_mint_critical_vikram.pdf', 'Prescription - FABRICATED CLAIM DETECTED',
        [
            ['Patient Name', d6.patientName], ['Register No.', d6.registerNumber],
            ['Date of Birth', 'N/A (missing)'], ['Gender / Age', `${d6.gender}, ${d6.age}`],
            ['Blood Group', d6.bloodGroup], ['Conditions', d6.existingConditions],
            ['Contact', d6.contactNumber], ['Address', d6.address],
            ['Record Type', d6.recordType], ['Diagnosis', d6.diagnosis],
            ['Doctor', 'N/A (missing)'], ['Issue Date', '20 April 2026'],
            ['Issuer', d6.issuerName], ['Medical Costs', 'INR 75,000'],
            ['File Hash', '...'],
            ['FRAUD FLAG', 'Billing 62x baseline - no doctor - fabricated claim'],
        ], 'CRITICAL'
    );

    // ── Seed DB ──
    const existing = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    const medical_records = [
        { ...d1,  dataHash: hash1,   mode: 'basic', issuerUsername: iJ.username, issuerProfile: iJ.profile, createdAt: '2026-04-30T09:00:00.000Z', _id: 'demo_1' },
        { ...d2,  fileHash: r2.hash, mode: 'mint',  issuerUsername: iA.username, issuerProfile: iA.profile, createdAt: '2026-04-01T09:00:00.000Z', _id: 'demo_2' },
        { ...d3,  dataHash: hash3,   mode: 'basic', issuerUsername: iB.username, issuerProfile: iB.profile, createdAt: '2026-04-10T14:00:00.000Z', _id: 'demo_3' },
        { ...d4,  fileHash: r4.hash, mode: 'mint',  issuerUsername: iJ.username, issuerProfile: iJ.profile, createdAt: '2026-04-05T10:30:00.000Z', _id: 'demo_4' },
        { ...d5,  dataHash: hash5,   mode: 'basic', issuerUsername: iA.username, issuerProfile: iA.profile, createdAt: '2026-04-15T08:00:00.000Z', _id: 'demo_5' },
        { ...d5b, dataHash: hash5b,  mode: 'basic', issuerUsername: iB.username, issuerProfile: iB.profile, createdAt: '2026-04-15T09:15:00.000Z', _id: 'demo_5b' },
        { ...d6,  fileHash: r6.hash, mode: 'mint',  issuerUsername: iX.username, issuerProfile: iX.profile, createdAt: '2026-04-20T16:00:00.000Z', _id: 'demo_6' },
    ];

    fs.writeFileSync(DB_FILE, JSON.stringify({ users: existing.users, actions: [], medical_records }, null, 2));

    console.log('Done!\n');
    console.log('PDFs -> server/demo_pdfs/');
    console.log('DB   -> local_db.json (records replaced, users preserved)\n');
    console.log('=== Records ===');
    console.log(`1.  Legit Basic      | Ananya Krishnan | dataHash: ${hash1.substring(0,24)}...`);
    console.log(`2.  Legit Mint       | Priya Sharma    | fileHash: ${r2.hash.substring(0,24)}...`);
    console.log(`3.  Fake Basic M     | Meena Iyer      | dataHash: ${hash3.substring(0,24)}...`);
    console.log(`4.  Fake Mint M      | Rajan Pillai    | fileHash: ${r4.hash.substring(0,24)}...`);
    console.log(`5.  Fake Basic C     | Arjun Mehta     | dataHash: ${hash5.substring(0,24)}...`);
    console.log(`5b. Ghost Partner    | Arjun Mehta     | dataHash: ${hash5b.substring(0,24)}... (collision trigger)`);
    console.log(`6.  Fake Mint C      | Vikram Nair     | fileHash: ${r6.hash.substring(0,24)}...`);
    console.log('\n=== Restart the server to reload local_db.json ===');
}

main().catch(console.error);
