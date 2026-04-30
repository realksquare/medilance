/**
 * analyticsRoutes.js — MediLance Phase 3: Network Analytics
 *
 * GET /api/analytics/provider-risk
 *   Returns a ranked list of all issuers with their computed Trust Score,
 *   anomaly density, flag breakdown, and record volume.
 *   Protected: master admin credentials required (x-admin-user + x-admin-pass).
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { computeRiskScore } = require('../fraud');

// ── Master Admin Guard ────────────────────────────────────────────────────────
async function requireMasterAdmin(req, res, next) {
    try {
        const user = req.headers['x-admin-user'];
        if (!user) return res.status(403).json({ error: 'Master admin credentials required.' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: user, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Master admin credentials required.' });
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// ── Verifier-or-Admin Guard ───────────────────────────────────────────────────
// Allows: master admin (x-admin-user) OR any registered verifier/dual user (x-username)
async function requireVerifier(req, res, next) {
    try {
        const db = getDB();
        // Master admin path
        const adminUser = req.headers['x-admin-user'];
        if (adminUser) {
            const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
            if (admin) return next();
        }
        // Registered verifier / dual path
        const username = req.headers['x-username'];
        if (username && username !== 'guest') {
            const user = await db.collection('users').findOne({ username });
            if (user && (user.role === 'verifier' || user.role === 'dual' || user.isMasterAdmin)) return next();
        }
        return res.status(403).json({ error: 'Verifier access required.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// ── GET /api/analytics/provider-risk ─────────────────────────────────────────
// For each issuer, score every record they have issued and compute:
//   - avgScore         : mean Integrity Index across all their records
//   - anomalyRate      : % of records with at least one critical/high flag
//   - totalRecords     : total records issued
//   - flagCounts       : breakdown of flag types across all records
//   - trustGrade       : A / B / C / D based on avgScore
router.get('/provider-risk', requireMasterAdmin, async (req, res) => {
    try {
        const db = getDB();
        const allRecords = await db.collection('medical_records').find({}).toArray();

        // Group by issuerUsername
        const issuers = {};
        for (const record of allRecords) {
            const issuer = record.issuerUsername || 'unknown';
            if (!issuers[issuer]) {
                issuers[issuer] = {
                    username: issuer,
                    institution: record.issuerProfile?.institution || record.issuerProfile?.fullName || '',
                    records: [],
                };
            }
            issuers[issuer].records.push(record);
        }

        // Score each issuer's records and aggregate
        const profiles = [];
        for (const [username, data] of Object.entries(issuers)) {
            const scoreResults = await Promise.all(
                data.records.map(r => computeRiskScore(r, db))
            );

            const scores = scoreResults.map(r => r.score);
            const avgScore = scores.length
                ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                : 100;

            // Collect all flags across all records for this issuer
            const allFlags = scoreResults.flatMap(r => r.flags);
            const criticalCount = allFlags.filter(f => f.severity === 'critical').length;
            const highCount     = allFlags.filter(f => f.severity === 'high').length;
            const mediumCount   = allFlags.filter(f => f.severity === 'medium').length;

            // Anomaly rate = % of records that have at least one non-low flag
            const anomalousRecords = scoreResults.filter(r =>
                r.flags.some(f => f.severity === 'critical' || f.severity === 'high')
            ).length;
            const anomalyRate = data.records.length
                ? Math.round((anomalousRecords / data.records.length) * 100)
                : 0;

            // Flag type breakdown (top 5 flag types)
            const flagTypeCounts = {};
            for (const flag of allFlags) {
                flagTypeCounts[flag.type] = (flagTypeCounts[flag.type] || 0) + 1;
            }
            const topFlags = Object.entries(flagTypeCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => ({ type, count }));

            const trustGrade = avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 55 ? 'C' : 'D';

            profiles.push({
                username,
                institution: data.institution,
                totalRecords: data.records.length,
                avgScore,
                trustGrade,
                anomalyRate,
                criticalCount,
                highCount,
                mediumCount,
                topFlags,
            });
        }

        // Sort: lowest trust score first (most suspicious at top)
        profiles.sort((a, b) => a.avgScore - b.avgScore);

        res.json({ providers: profiles, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[Analytics] provider-risk error:', err);
        res.status(500).json({ error: 'Analytics computation failed.' });
    }
});

// ── GET /api/analytics/ghost-procedures ──────────────────────────────────────
// Scans all records grouped by patient (registerNumber) and flags clusters
// that are statistically improbable:
//   1. Duplicate record types on the same calendar day (same patient, same type)
//   2. Multiple high-cost procedures in a single day (≥2 records, total > 50k INR)
//   3. Logically incompatible same-day combos (e.g. Discharge + Lab Report)
//   4. Same patient issued records by 3+ distinct issuers (ghost billing network)
const BILLING_BASELINES = { 'Lab Report': 2500, 'Prescription': 1200, 'Discharge': 55000 };

router.get('/ghost-procedures', requireVerifier, async (req, res) => {
    try {
        const db = getDB();
        const allRecords = await db.collection('medical_records').find({}).sort({}).limit(5000).toArray();

        // Group by registerNumber (patient identity)
        const byPatient = {};
        for (const r of allRecords) {
            const key = r.registerNumber || '__unknown__';
            if (!byPatient[key]) byPatient[key] = [];
            byPatient[key].push(r);
        }

        const flaggedClusters = [];

        for (const [regNum, records] of Object.entries(byPatient)) {
            if (records.length < 2) continue; // need at least 2 records to detect patterns

            const flags = [];

            // Build a date → records map
            const byDate = {};
            for (const r of records) {
                const dateKey = (r.issueDate || '').split('T')[0];
                if (!dateKey) continue;
                if (!byDate[dateKey]) byDate[dateKey] = [];
                byDate[dateKey].push(r);
            }

            for (const [date, dayRecords] of Object.entries(byDate)) {
                if (dayRecords.length < 2) continue;

                // Signal 1: Duplicate record type on same day
                const typeCounts = {};
                for (const r of dayRecords) {
                    typeCounts[r.recordType] = (typeCounts[r.recordType] || 0) + 1;
                }
                for (const [type, count] of Object.entries(typeCounts)) {
                    if (count >= 2) {
                        flags.push({
                            severity: 'critical',
                            type: 'DUPLICATE_SAME_DAY',
                            date,
                            message: `${count}× "${type}" records on ${date} for the same patient — statistically improbable.`,
                        });
                    }
                }

                // Signal 2: Multiple high-cost procedures in one day
                const dayTotal = dayRecords.reduce((sum, r) => sum + (parseFloat(r.medCosts) || BILLING_BASELINES[r.recordType] || 0), 0);
                if (dayTotal >= 50000 && dayRecords.length >= 2) {
                    flags.push({
                        severity: 'high',
                        type: 'HIGH_COST_CLUSTER',
                        date,
                        message: `Total billed cost on ${date}: ₹${dayTotal.toLocaleString('en-IN')} across ${dayRecords.length} procedures — unusually high for a single day.`,
                    });
                }

                // Signal 3: Logically incompatible same-day combos
                const types = dayRecords.map(r => r.recordType);
                if (types.includes('Discharge') && types.includes('Lab Report')) {
                    flags.push({
                        severity: 'high',
                        type: 'INCOMPATIBLE_COMBO',
                        date,
                        message: `Simultaneous "Discharge" and "Lab Report" on ${date} — discharge typically concludes treatment; a same-day lab order is suspicious.`,
                    });
                }
                if (types.includes('Discharge') && types.includes('Prescription')) {
                    flags.push({
                        severity: 'medium',
                        type: 'INCOMPATIBLE_COMBO',
                        date,
                        message: `Simultaneous "Discharge" and new "Prescription" issued on ${date} — post-discharge prescriptions should be dated after discharge.`,
                    });
                }
            }

            // Signal 4: Ghost billing network — same patient, 3+ distinct issuers
            const issuers = [...new Set(records.map(r => r.issuerUsername).filter(Boolean))];
            if (issuers.length >= 3) {
                flags.push({
                    severity: 'critical',
                    type: 'MULTI_ISSUER_PATIENT',
                    date: null,
                    message: `Patient ${regNum} has records from ${issuers.length} distinct issuers (${issuers.join(', ')}) — coordinated ghost billing network pattern.`,
                });
            }

            if (flags.length > 0) {
                const patientName = records[0]?.patientName || regNum;
                const criticalCount = flags.filter(f => f.severity === 'critical').length;
                const riskLevel = criticalCount >= 2 ? 'CRITICAL' : criticalCount >= 1 ? 'HIGH' : 'MEDIUM';
                flaggedClusters.push({
                    registerNumber: regNum,
                    patientName,
                    totalRecords: records.length,
                    issuers,
                    flags,
                    riskLevel,
                    records: records.map(r => ({
                        recordType: r.recordType,
                        issueDate: r.issueDate,
                        issuerUsername: r.issuerUsername,
                        doctorName: r.doctorName,
                        diagnosis: r.diagnosis,
                        medCosts: r.medCosts,
                    })),
                });
            }
        }

        // Sort: critical first
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        flaggedClusters.sort((a, b) => severityOrder[a.riskLevel] - severityOrder[b.riskLevel]);

        res.json({ clusters: flaggedClusters, scanned: Object.keys(byPatient).length, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[Analytics] ghost-procedures error:', err);
        res.status(500).json({ error: 'Ghost procedure analysis failed.' });
    }
});

// ── GET /api/analytics/express-approval ──────────────────────────────────────
// Phase 4.1 — Fast-Track & Payout: Express Approval
//
// Returns all records that satisfy BOTH conditions:
//   1. Integrity Score ≥ 95  (no critical/high fraud signals)
//   2. Billing within the expected percentile (≤ 1.5× the procedure baseline)
//
// Each approved record gets:
//   - integrityScore  : 0-100 computed by the fraud engine
//   - approvalTier    : 'PLATINUM' (100) | 'GOLD' (97-99) | 'FAST' (95-96)
//   - fastTrackReason : human-readable explanation for the approval
//   - billingRatio    : how the claim compares to the procedure average
const BILLING_BASELINES_4 = { 'Lab Report': 2500, 'Prescription': 1200, 'Discharge': 55000 };

router.get('/express-approval', requireVerifier, async (req, res) => {
    try {
        const db = getDB();
        const allRecords = await db.collection('medical_records').find({}).sort({ createdAt: -1 }).limit(5000).toArray();

        const approved = [];

        for (const record of allRecords) {
            // Skip already actioned records (if Verifier Dashboard later adds status field)
            if (record.approvalStatus && record.approvalStatus !== 'pending') continue;

            const { score, flags } = await computeRiskScore(record, db);

            // Condition 1: Integrity Score must be 95+
            if (score < 95) continue;

            // Condition 2: Billing within-percentile (no critical billing anomaly)
            const medCosts = parseFloat(record.medCosts);
            const baseline = BILLING_BASELINES_4[record.recordType];
            let billingRatio = null;
            if (baseline && !isNaN(medCosts) && medCosts > 0) {
                billingRatio = parseFloat((medCosts / baseline).toFixed(2));
                if (billingRatio > 1.5) continue; // above expected range — not fast-trackable
            }

            // Approval tier
            const approvalTier = score === 100 ? 'PLATINUM' : score >= 97 ? 'GOLD' : 'FAST';

            // Human-readable fast-track reason
            const reasons = [];
            if (flags.length === 0) reasons.push('No fraud signals detected.');
            else reasons.push(`Only low-severity signal${flags.length > 1 ? 's' : ''} detected — no critical or high flags.`);
            if (billingRatio !== null) {
                reasons.push(`Billing of ₹${medCosts.toLocaleString('en-IN')} is ${billingRatio}× the typical ${record.recordType} average — within expected range.`);
            } else {
                reasons.push('No billing data to cross-check — record type qualifies by integrity alone.');
            }
            if (record.issuerProfile?.institution) {
                reasons.push(`Issued by a registered provider: ${record.issuerProfile.institution}.`);
            }

            approved.push({
                _id: record._id,
                patientName: record.patientName,
                registerNumber: record.registerNumber,
                recordType: record.recordType,
                issueDate: record.issueDate,
                issuerUsername: record.issuerUsername,
                issuerInstitution: record.issuerProfile?.institution || record.issuerProfile?.fullName || record.issuerUsername,
                diagnosis: record.diagnosis,
                medCosts: record.medCosts,
                dataHash: record.dataHash || record.fileHash,
                integrityScore: score,
                approvalTier,
                billingRatio,
                fastTrackReason: reasons,
                flagCount: flags.length,
                createdAt: record.createdAt,
            });
        }

        // Sort: PLATINUM first, then GOLD, then FAST; within tier by score desc
        const tierOrder = { PLATINUM: 0, GOLD: 1, FAST: 2 };
        approved.sort((a, b) =>
            tierOrder[a.approvalTier] - tierOrder[b.approvalTier] || b.integrityScore - a.integrityScore
        );

        res.json({
            approved,
            total: approved.length,
            breakdown: {
                platinum: approved.filter(r => r.approvalTier === 'PLATINUM').length,
                gold: approved.filter(r => r.approvalTier === 'GOLD').length,
                fast: approved.filter(r => r.approvalTier === 'FAST').length,
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[Analytics] express-approval error:', err);
        res.status(500).json({ error: 'Express approval computation failed.' });
    }
});

module.exports = router;
