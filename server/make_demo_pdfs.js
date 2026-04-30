/**
 * make_demo_pdfs.js — MediLance Demo PDF Generator + DB Re-seeder
 *
 * Generates real PDF files for the two "mint" records,
 * computes their actual SHA-256 hashes, then re-writes local_db.json
 * with the corrected file hashes so you can actually upload them to verify.
 *
 * Run with: node make_demo_pdfs.js
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const PDFDocument = require('pdfkit');

const PDFS_DIR = path.join(__dirname, 'demo_pdfs');
const DB_FILE  = path.join(__dirname, 'local_db.json');

if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR);

// ─── PDF builder helper ───────────────────────────────────────────────────────
function buildPDF(filename, title, fields) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(PDFS_DIR, filename);
        const doc      = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks   = [];

        doc.on('data', c => chunks.push(c));
        doc.on('end', () => {
            const buf  = Buffer.concat(chunks);
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            fs.writeFileSync(filePath, buf);
            resolve({ filePath, hash });
        });
        doc.on('error', reject);

        // Header
        doc.fillColor('#2563eb')
           .fontSize(20)
           .font('Helvetica-Bold')
           .text('MediLance', { align: 'center' });

        doc.fillColor('#64748b')
           .fontSize(9)
           .font('Helvetica')
           .text('Immutable Healthcare Integrity', { align: 'center' });

        doc.moveDown(0.5);
        doc.fillColor('#000')
           .fontSize(13)
           .font('Helvetica-Bold')
           .text(title, { align: 'center' });

        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.5);

        // Fields
        doc.font('Helvetica').fontSize(10).fillColor('#111');
        for (const [label, value] of fields) {
            doc.font('Helvetica-Bold').text(`${label}:`, { continued: true })
               .font('Helvetica').text(`  ${value}`);
        }

        doc.moveDown(1.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.5);

        doc.fontSize(7).fillColor('#94a3b8')
           .text('This document was issued and cryptographically registered by the MediLance Fraud Intelligence Engine.', { align: 'center' });
        doc.text('Any modification to this file will invalidate the document fingerprint.', { align: 'center' });

        doc.end();
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\nGenerating PDFs...\n');

    // 1. Legit Mint — Priya Sharma
    const legitMint = await buildPDF('legit_mint_priya_sharma.pdf', 'Lab Report — Complete Blood Count', [
        ['Patient Name',    'Priya Sharma'],
        ['Register No.',    'PID-2024-001'],
        ['Date of Birth',   '15 March 1990'],
        ['Gender',          'Female'],
        ['Age',             '34'],
        ['Blood Group',     'O+'],
        ['Conditions',      'None'],
        ['Contact',         '9876543210'],
        ['Address',         'No.12, Anna Nagar, Chennai'],
        ['Record Type',     'Lab Report'],
        ['Diagnosis',       'Complete Blood Count - All values within normal range'],
        ['Doctor',          'Dr. Kavinesh R.'],
        ['Issue Date',      '01 April 2026'],
        ['Issuer',          'Apollo Hospitals, Chennai'],
        ['Medical Costs',   'INR 2,200'],
    ]);

    // 2. Fake Mint — Arjun Mehta (forged reused document)
    const fakeMint = await buildPDF('fake_mint_arjun_mehta.pdf', 'Discharge Summary — Post Operative Recovery', [
        ['Patient Name',    'Arjun Mehta'],
        ['Register No.',    'PID-2024-GHOST'],
        ['Date of Birth',   '03 November 1985'],
        ['Gender',          'Male'],
        ['Age',             '40'],
        ['Blood Group',     'AB+'],
        ['Conditions',      'None'],
        ['Contact',         '9000011111'],
        ['Address',         'No.3, MG Road, Bangalore'],
        ['Record Type',     'Discharge'],
        ['Diagnosis',       'Forged discharge summary - reused template'],
        ['Doctor',          'Dr. Unknown'],
        ['Issue Date',      '18 April 2026'],
        ['Issuer',          'Rogue Diagnostics Ltd.'],
        ['Medical Costs',   'INR 3,50,000'],
    ]);

    console.log('PDFs generated:');
    console.log(`  Legit Mint -> ${path.basename(legitMint.filePath)}`);
    console.log(`     hash: ${legitMint.hash}`);
    console.log(`  Fake Mint  -> ${path.basename(fakeMint.filePath)}`);
    console.log(`     hash: ${fakeMint.hash}`);

    // ─── Re-seed DB with corrected hashes ────────────────────────────────────
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    // Fix Legit Mint record (Priya Sharma, mode: mint)
    const legitIdx = db.medical_records.findIndex(r =>
        r.patientName === 'Priya Sharma' && r.mode === 'mint'
    );
    if (legitIdx !== -1) {
        db.medical_records[legitIdx].fileHash = legitMint.hash;
        console.log('\nDB updated: Priya Sharma (Legit Mint) hash corrected.');
    } else {
        console.warn('WARNING: Priya Sharma mint record not found in DB!');
    }

    // Fix Fake Mint record (Arjun Mehta, mode: mint)
    const fakeIdx = db.medical_records.findIndex(r =>
        r.patientName === 'Arjun Mehta' && r.mode === 'mint'
    );
    if (fakeIdx !== -1) {
        db.medical_records[fakeIdx].fileHash = fakeMint.hash;
        console.log('DB updated: Arjun Mehta (Fake Mint) hash corrected.');
    } else {
        console.warn('WARNING: Arjun Mehta mint record not found in DB!');
    }

    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    console.log('\nDone! Your PDFs are in: server/demo_pdfs/');
    console.log('\nTo VERIFY these mint records:');
    console.log('  1. Go to the Verification page.');
    console.log('  2. Select "Verify Document (Mint)" mode.');
    console.log('  3. Upload the PDF from server/demo_pdfs/');
    console.log('\n  Legit Mint  -> Score 100, Grade A (clean)');
    console.log('  Fake Mint   -> Score 15,  Grade D (ghost + billing fraud)\n');
}

main().catch(console.error);
