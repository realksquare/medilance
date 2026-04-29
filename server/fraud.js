/**
 * fraud.js — MediLance Phase 2: Fraud Intelligence Engine
 *
 * computeRiskScore(record, db) → { score: 0-100, grade, flags }
 *
 * Score starts at 100 (clean). Each flag deducts points.
 * Grade:  A (90-100) | B (75-89) | C (55-74) | D (<55)
 *
 * Signals implemented:
 *  1. Cross-issuer duplicate hash              (-50)
 *  2. Same register number, diff issuers       (-35)
 *  3. Same patient name+DOB, diff issuers      (-25)
 *  4. High verification frequency              (-10)
 *  5. Missing critical identity fields         (-5 each, max -15)
 *  6. Billing anomaly vs procedure avg         (-25 critical / -10 moderate)
 *  7. Simultaneous billing collision (same day)(-40)
 */

// ── Billing Baselines (INR) ───────────────────────────────────────────────────
// Median claim amounts per record type, derived from IRDAI public data and
// industry benchmarks for the Indian health insurance market.
// Sources:
//   IRDAI Annual Report 2022-23 (https://irdai.gov.in)
//   NHA Health Accounts Report 2021-22 (https://nhsrcindia.org)
const BILLING_BASELINES = {
    'Lab Report':    { avg: 2500,  label: 'Lab / Diagnostic' },
    'Prescription':  { avg: 1200,  label: 'Prescription / Medication' },
    'Discharge':     { avg: 55000, label: 'Inpatient Discharge' },
};

async function computeRiskScore(record, db) {
    const flags = [];
    let deduction = 0;

    const allRecords = await db.collection('medical_records').find({}).sort({}).limit(5000).toArray();

    // ── Signal 1: Same hash issued by multiple distinct issuers ──────────────
    // A hash that appears under two different usernames means the same
    // cryptographic fingerprint was registered by two separate parties —
    // a strong indicator that one of them is forging provenance.
    const matchingHash = allRecords.filter(r =>
        (r.dataHash && r.dataHash === record.dataHash) ||
        (r.fileHash && r.fileHash === record.fileHash)
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

    // ── Signal 2: Same register number, different issuer ────────────────────
    // A patient register number appearing under two institutions strongly
    // suggests a duplicate or ghost claim.
    if (record.registerNumber) {
        const sameReg = allRecords.filter(r =>
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

    // ── Signal 3: Same patient name + DOB, different issuers ────────────────
    // Soft identity collision — same person being claimed by multiple
    // providers at the same time is a collision alert precursor.
    if (record.patientName && record.dob) {
        const nameNorm = record.patientName.trim().toLowerCase();
        const collision = allRecords.filter(r =>
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

    // ── Signal 4: Unusually high verification frequency ─────────────────────
    // A record being verified many times in a short window can indicate
    // automated submission attempts by fraudulent actors.
    if (record.dataHash || record.fileHash) {
        const hash = record.dataHash || record.fileHash;
        const allActions = await db.collection('actions').find({}).sort({}).limit(5000).toArray();
        const recentVerifications = allActions.filter(a =>
            a.actionType === 'verified' &&
            a.details?.dataHash === hash &&
            a.timestamp &&
            (Date.now() - new Date(a.timestamp).getTime()) < 60 * 60 * 1000 // last hour
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

    // ── Signal 5: Missing critical identity fields ───────────────────────────
    // Records with blank mandatory fields may have been created to obscure
    // patient identity — a common technique in ghost billing.
    const criticalFields = ['registerNumber', 'dob', 'doctorName'];
    let missingPenalty = 0;
    for (const field of criticalFields) {
        if (!record[field] || record[field].toString().trim() === '') {
            flags.push({
                type: 'MISSING_FIELD',
                severity: 'low',
                message: `Field "${field}" is empty. Incomplete records are a weak-identity risk.`,
            });
            missingPenalty = Math.min(missingPenalty + 5, 15);
        }
    }
    deduction += missingPenalty;

    // ── Signal 6: Billing Anomaly ────────────────────────────────────────────
    // Compare the claimed amount against known procedure averages.
    // A claim 2.5x above the baseline is a strong inflation indicator.
    // A claim 1.5x–2.5x above baseline is flagged as a moderate anomaly.
    const claimAmount = parseFloat(record.claimAmount);
    const baseline = BILLING_BASELINES[record.recordType];
    if (baseline && !isNaN(claimAmount) && claimAmount > 0) {
        const ratio = claimAmount / baseline.avg;
        if (ratio >= 2.5) {
            flags.push({
                type: 'BILLING_ANOMALY_CRITICAL',
                severity: 'critical',
                message: `Claim amount of INR ${claimAmount.toLocaleString('en-IN')} is ${ratio.toFixed(1)}x the typical ${baseline.label} average (INR ${baseline.avg.toLocaleString('en-IN')}). Likely inflated billing.`,
            });
            deduction += 25;
        } else if (ratio >= 1.5) {
            flags.push({
                type: 'BILLING_ANOMALY_MODERATE',
                severity: 'medium',
                message: `Claim amount of INR ${claimAmount.toLocaleString('en-IN')} is ${ratio.toFixed(1)}x the typical ${baseline.label} average (INR ${baseline.avg.toLocaleString('en-IN')}). Above expected range.`,
            });
            deduction += 10;
        }
    }

    // ── Signal 7: Simultaneous Billing Collision ─────────────────────────────
    // The most explicit ghost-procedure pattern: the same patient appearing
    // in records from two DIFFERENT issuers on the EXACT SAME calendar date.
    // Signals 2 and 3 catch cross-issuer duplicates at any point in time;
    // this signal specifically catches same-day simultaneous billing —
    // a strong indicator of a fabricated or cloned claim.
    if (record.issueDate && record.issuerUsername) {
        const nameNorm = record.patientName ? record.patientName.trim().toLowerCase() : null;
        const sameDayOther = allRecords.filter(r =>
            r.issuerUsername &&
            r.issuerUsername !== record.issuerUsername &&
            r.issueDate === record.issueDate &&
            (
                // Match by register number (strongest identity anchor)
                (record.registerNumber && r.registerNumber && r.registerNumber === record.registerNumber) ||
                // OR match by name + DOB (soft identity anchor)
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
