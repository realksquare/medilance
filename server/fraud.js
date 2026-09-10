/**
 * fraud.js - MediLance Fraud Intelligence Engine
 *
 * computeRiskScore(record, db) -> { score: 0-100, grade, flags }
 *
 * Score starts at 100 (clean). Each flag deducts points.
 * Grade: A (90-100) | B (75-89) | C (55-74) | D (<55)
 *
 * 7 Signals:
 *  1. Cross-issuer duplicate hash              (-50)
 *  2. Same register number, diff issuers       (-35)
 *  3. Same patient name+DOB, diff issuers      (-25)
 *  4. High verification frequency              (-10)
 *  5. Missing critical identity fields         (-5 each, max -15)
 *  6. Billing anomaly vs procedure avg         (-25 critical / -10 moderate)
 *  7. Simultaneous billing collision (same day)(-40)
 */

const { BILLING_BASELINES } = require('./config/baselines');

async function computeRiskScore(record, db) {
    const flags = [];
    let deduction = 0;

    // Build targeted query conditions to avoid scanning 5,000 irrelevant records
    const orConditions = [];
    if (record.dataHash) orConditions.push({ dataHash: record.dataHash });
    if (record.fileHash) orConditions.push({ fileHash: record.fileHash });
    if (record.registerNumber) orConditions.push({ registerNumber: record.registerNumber });
    if (record.patientName) orConditions.push({ patientName: record.patientName });
    if (record.issueDate) orConditions.push({ issueDate: record.issueDate });

    let candidateRecords = [];
    if (orConditions.length > 0) {
        candidateRecords = await db.collection('medical_records').find({ $or: orConditions }).limit(1000).toArray();
    } else {
        candidateRecords = await db.collection('medical_records').find({}).limit(500).toArray();
    }

    // Signal 1: Cross-issuer duplicate hash
    const matchingHash = candidateRecords.filter(r =>
        (record.dataHash && (r.dataHash === record.dataHash || r.fileHash === record.dataHash)) ||
        (record.fileHash && (r.fileHash === record.fileHash || r.dataHash === record.fileHash))
    );
    const hashIssuers = [...new Set(matchingHash.map(r => r.issuerUsername).filter(Boolean))];
    if (hashIssuers.length > 1) {
        const issuerLabels = matchingHash
            .filter(r => r.issuerUsername)
            .map(r => r.issuerProfile?.fullName ? `${r.issuerProfile.fullName} (${r.issuerUsername})` : r.issuerUsername);
        const uniqueLabels = [...new Set(issuerLabels)];
        flags.push({
            type: 'CROSS_ISSUER_HASH',
            severity: 'critical',
            message: `This record's cryptographic fingerprint was registered by ${uniqueLabels.length} different issuers: ${uniqueLabels.join(', ')}.`,
        });
        deduction += 50;
    }

    // Signal 2: Same register number, different issuer
    if (record.registerNumber) {
        const sameReg = candidateRecords.filter(r =>
            r.registerNumber === record.registerNumber &&
            r.issuerUsername && record.issuerUsername &&
            r.issuerUsername !== record.issuerUsername
        );
        const regIssuers = [...new Set(sameReg.map(r => r.issuerUsername))];
        if (regIssuers.length > 0) {
            const regLabels = sameReg.map(r =>
                r.issuerProfile?.fullName ? `${r.issuerProfile.fullName} (${r.issuerUsername})` : r.issuerUsername
            );
            const uniqueRegLabels = [...new Set(regLabels)];
            flags.push({
                type: 'DUPLICATE_REGISTER_NUMBER',
                severity: 'high',
                message: `Register number "${record.registerNumber}" also appears in records issued by: ${uniqueRegLabels.join(', ')}.`,
            });
            deduction += 35;
        }
    }

    // Signal 3: Same patient name + DOB, different issuers
    if (record.patientName && record.dob) {
        const nameNorm = record.patientName.trim().toLowerCase();
        const collision = candidateRecords.filter(r =>
            r.patientName &&
            r.dob === record.dob &&
            r.patientName.trim().toLowerCase() === nameNorm &&
            r.issuerUsername && record.issuerUsername &&
            r.issuerUsername !== record.issuerUsername
        );
        const collisionIssuers = [...new Set(collision.map(r => r.issuerUsername))];
        if (collisionIssuers.length > 0) {
            const collLabels = collision.map(r =>
                r.issuerProfile?.fullName ? `${r.issuerProfile.fullName} (${r.issuerUsername})` : r.issuerUsername
            );
            const uniqueCollLabels = [...new Set(collLabels)];
            flags.push({
                type: 'PATIENT_COLLISION',
                severity: 'high',
                message: `Patient "${record.patientName}" (DOB ${record.dob}) has records from multiple providers: ${uniqueCollLabels.join(', ')}.`,
            });
            deduction += 25;
        }
    }

    // Signal 4: High verification frequency (velocity)
    if (record.dataHash || record.fileHash) {
        const hash = record.dataHash || record.fileHash;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const allActions = await db.collection('actions').find({ actionType: 'verified' }).limit(500).toArray();
        const recentVerifications = allActions.filter(a =>
            (a.details?.dataHash === hash || a.details?.fileHash === hash) &&
            a.timestamp && new Date(a.timestamp) >= oneHourAgo
        );
        if (recentVerifications.length >= 5) {
            flags.push({
                type: 'HIGH_VERIFICATION_FREQUENCY',
                severity: 'medium',
                message: `This record has been verified ${recentVerifications.length} times in the last hour.`,
            });
            deduction += 10;
        }
    }

    // Signal 5: Missing critical identity fields
    const criticalFields = ['registerNumber', 'dob', 'doctorName'];
    let missingPenalty = 0;
    for (const field of criticalFields) {
        if (!record[field] || record[field].toString().trim() === '') {
            flags.push({
                type: 'MISSING_FIELD',
                severity: 'low',
                message: `Field "${field}" is empty. Incomplete records present identity verification risk.`,
            });
            missingPenalty = Math.min(missingPenalty + 5, 15);
        }
    }
    deduction += missingPenalty;

    // Signal 6: Billing Anomaly vs benchmark
    const medCosts = parseFloat(record.medCosts);
    const baseline = BILLING_BASELINES[record.recordType];
    if (baseline && !isNaN(medCosts) && medCosts > 0) {
        const ratio = medCosts / baseline.avg;
        if (ratio >= 2.5) {
            flags.push({
                type: 'BILLING_ANOMALY_CRITICAL',
                severity: 'critical',
                message: `Procedure cost of INR ${medCosts.toLocaleString('en-IN')} is ${ratio.toFixed(1)}x the typical ${baseline.label} average (INR ${baseline.avg.toLocaleString('en-IN')}). Likely inflated billing.`,
            });
            deduction += 25;
        } else if (ratio >= 1.5) {
            flags.push({
                type: 'BILLING_ANOMALY_MODERATE',
                severity: 'medium',
                message: `Procedure cost of INR ${medCosts.toLocaleString('en-IN')} is ${ratio.toFixed(1)}x the typical ${baseline.label} average (INR ${baseline.avg.toLocaleString('en-IN')}). Above expected range.`,
            });
            deduction += 10;
        }
    }

    // Signal 7: Simultaneous Billing Collision (same calendar date)
    if (record.issueDate && record.issuerUsername) {
        const nameNorm = record.patientName ? record.patientName.trim().toLowerCase() : null;
        const sameDayOther = candidateRecords.filter(r =>
            r.issuerUsername &&
            r.issuerUsername !== record.issuerUsername &&
            r.issueDate === record.issueDate &&
            (
                (record.registerNumber && r.registerNumber && r.registerNumber === record.registerNumber) ||
                (nameNorm && r.patientName && record.dob &&
                    r.dob === record.dob &&
                    r.patientName.trim().toLowerCase() === nameNorm)
            )
        );
        if (sameDayOther.length > 0) {
            const sameDayLabels = sameDayOther.map(r =>
                r.issuerProfile?.institution
                    ? `${r.issuerProfile.institution} (${r.issuerUsername})`
                    : r.issuerUsername
            );
            const uniqueSameDayLabels = [...new Set(sameDayLabels)];
            flags.push({
                type: 'SIMULTANEOUS_BILLING_COLLISION',
                severity: 'critical',
                message: `Patient "${record.patientName}" was billed by ${uniqueSameDayLabels.length + 1} different providers on ${record.issueDate}: also billed by ${uniqueSameDayLabels.join(', ')}. Strong ghost procedure indicator.`,
            });
            deduction += 40;
        }
    }

    const score = Math.max(0, 100 - deduction);
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : 'D';

    return { score, grade, flags };
}

module.exports = { computeRiskScore };
