const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const fetch = require('node-fetch'); // we can use node-fetch or native fetch in node 18+

const API = 'http://localhost:3005/api';

async function createPDF(data, qrText, filename) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add Logo Text
    page.drawText('MEDILANCE HOSPITAL', { x: 50, y: 350, size: 20, font: fontBold, color: rgb(0.1, 0.4, 0.8) });
    
    // Add Record Details
    page.drawText(`Record Type: ${data.recordType}`, { x: 50, y: 300, size: 14, font: fontBold });
    page.drawText(`Patient: ${data.patientName}`, { x: 50, y: 270, size: 12, font });
    page.drawText(`Register ID: ${data.registerNumber}`, { x: 50, y: 250, size: 12, font });
    page.drawText(`DOB: ${data.dob}   Gender: ${data.gender}   Blood: ${data.bloodGroup}`, { x: 50, y: 230, size: 12, font });
    page.drawText(`Doctor: ${data.doctorName}`, { x: 50, y: 200, size: 12, font });
    page.drawText(`Date: ${data.issueDate}`, { x: 50, y: 180, size: 12, font });
    page.drawText(`Diagnosis: ${data.diagnosis}`, { x: 50, y: 150, size: 12, font });
    if(data.medCosts) page.drawText(`Costs: ${data.medCosts} INR`, { x: 50, y: 130, size: 12, font });

    // Add QR Code
    if (qrText) {
        const qrBuffer = await QRCode.toBuffer(qrText, { width: 150 });
        const qrImage = await pdfDoc.embedPng(qrBuffer);
        page.drawImage(qrImage, { x: 400, y: 50, width: 150, height: 150 });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(path.join(__dirname, filename), pdfBytes);
    return pdfBytes;
}

async function run() {
    console.log('Generating dummy records...');

    // 1. LEGIT BASIC RECORD
    const legitBasicData = {
        patientName: 'Jane Doe', registerNumber: 'ID-8888', dob: '1990-01-01', gender: 'Female', bloodGroup: 'O+',
        recordType: 'Lab Report', doctorName: 'Dr. Smith', issueDate: '2026-04-30', diagnosis: 'Complete Blood Count: Normal', medCosts: '1500'
    };
    
    const res1 = await fetch(`${API}/create-record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': 'master_admin' },
        body: JSON.stringify({ recordData: legitBasicData })
    });
    const text1 = await res1.text();
    try {
        const d1 = JSON.parse(text1);
        if(d1.dataHash) {
            await createPDF(legitBasicData, `http://localhost:3000/verify/${d1.dataHash}`, 'legit_basic_record.pdf');
            console.log('✓ Created legit_basic_record.pdf');
        } else {
            console.error('Failed to create legit basic record:', d1);
        }
    } catch(e) {
        console.error('Failed parsing response for basic record:', text1);
    }

    // 2. FAKE BASIC RECORD (Valid QR format, but hash doesn't exist in DB)
    const fakeBasicData = {
        patientName: 'John Fake', registerNumber: 'ID-0000', dob: '1980-01-01', gender: 'Male', bloodGroup: 'B-',
        recordType: 'Prescription', doctorName: 'Dr. Quack', issueDate: '2026-04-30', diagnosis: 'Prescribed fake medicine', medCosts: '500'
    };
    await createPDF(fakeBasicData, `http://localhost:3000/verify/abcd1234fakehash5678`, 'fake_basic_record.pdf');
    console.log('✓ Created fake_basic_record.pdf');

    // 3. LEGIT MINT RECORD
    const legitMintData = {
        patientName: 'Alice Mint', registerNumber: 'ID-9999', dob: '1995-05-05', gender: 'Female', bloodGroup: 'AB+',
        recordType: 'Discharge', doctorName: 'Dr. Who', issueDate: '2026-04-30', diagnosis: 'Patient discharged in good health', medCosts: '12000'
    };
    const mintPdfBytes = await createPDF(legitMintData, null, 'legit_mint_record.pdf');
    
    // Now submit this file to backend
    const form = new FormData();
    form.append('file', Buffer.from(mintPdfBytes), { filename: 'legit_mint_record.pdf', contentType: 'application/pdf' });
    form.append('recordData', JSON.stringify(legitMintData));
    
    const res3 = await fetch(`${API}/create-record-file`, {
        method: 'POST', headers: { 'x-username': 'master_admin' }, body: form
    });
    const d3 = await res3.json();
    if(d3.dataHash) console.log('✓ Created and registered legit_mint_record.pdf (File Hash:', d3.dataHash, ')');

    // 4. FAKE MINT RECORD (Just a locally modified version of the legit one, changes the file hash so it fails)
    const fakeMintData = { ...legitMintData, diagnosis: 'Patient discharged in bad health - needs refund' };
    await createPDF(fakeMintData, null, 'fake_mint_record.pdf'); // We never register this one to the DB!
    console.log('✓ Created fake_mint_record.pdf (Tampered, unregistered)');

    // 5. HIGH COST BASIC RECORD (Triggers BILLING_ANOMALY -25)
    const highCostData = {
        patientName: 'Bob Builder', registerNumber: 'ID-1234', dob: '1985-05-05', gender: 'Male', bloodGroup: 'A+',
        recordType: 'Lab Report', doctorName: 'Dr. Expensive', issueDate: '2026-04-29', diagnosis: 'Standard test but extremely high cost', medCosts: '150000'
    };
    
    const res5 = await fetch(`${API}/create-record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': 'master_admin' },
        body: JSON.stringify({ recordData: highCostData })
    });
    const d5 = await res5.json();
    if(d5.dataHash) {
        await createPDF(highCostData, `http://localhost:3000/verify/${d5.dataHash}`, 'high_cost_record.pdf');
        console.log('✓ Created high_cost_record.pdf (Triggers billing anomaly)');
    }

    // 6. GHOST RECORD (Triggers SIMULTANEOUS_BILLING and PATIENT_COLLISION vs Jane Doe's record)
    // First, register a shady user
    await fetch(`${API}/admin/create-user`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-user': 'master_admin' },
        body: JSON.stringify({ username: 'shady_clinic', password: 'password', fullName: 'Shady Clinic', role: 'issuer', type: 'clinic', institution: 'Shady Clinic' })
    });

    const ghostData = {
        patientName: 'Jane Doe', registerNumber: 'ID-8888', dob: '1990-01-01', gender: 'Female', bloodGroup: 'O+',
        recordType: 'Prescription', doctorName: 'Dr. Ghost', issueDate: '2026-04-30', diagnosis: 'Ghost pills', medCosts: '500'
    };
    
    const res6 = await fetch(`${API}/create-record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': 'shady_clinic' },
        body: JSON.stringify({ recordData: ghostData })
    });
    const d6 = await res6.json();
    if(d6.dataHash) {
        await createPDF(ghostData, `http://localhost:3000/verify/${d6.dataHash}`, 'ghost_record.pdf');
        console.log('✓ Created ghost_record.pdf (Triggers simultaneous billing collision)');
    }

    console.log('\nAll done! 6 dummy records created in the server folder.');
}

run().catch(console.error);
