/**
 * analyticsRoutes.js - MediLance Network Analytics & Fraud Intelligence
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { computeRiskScore } = require('../fraud');
const { BILLING_BASELINES } = require('../config/baselines');
const { verifyToken, requireAdmin, requireRole } = require('../utils/authMiddleware');

router.use(verifyToken);

// GET /api/analytics/provider-risk (Master Admin Only)
router.get('/provider-risk', requireAdmin, async (req, res) => {
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

            const allFlags = scoreResults.flatMap(r => r.flags);
            const criticalCount = allFlags.filter(f => f.severity === 'critical').length;
            const highCount     = allFlags.filter(f => f.severity === 'high').length;
            const mediumCount   = allFlags.filter(f => f.severity === 'medium').length;

            const anomalousRecords = scoreResults.filter(r =>
                r.flags.some(f => f.severity === 'critical' || f.severity === 'high')
            ).length;
            const anomalyRate = data.records.length
                ? Math.round((anomalousRecords / data.records.length) * 100)
                : 0;

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

        profiles.sort((a, b) => a.avgScore - b.avgScore);
        res.json({ providers: profiles, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[Analytics] provider-risk error:', err);
        res.status(500).json({ error: 'Analytics computation failed.' });
    }
});

// GET /api/analytics/ghost-procedures (Verifiers, Dual, and Admin)
router.get('/ghost-procedures', requireRole(['verifier', 'dual']), async (req, res) => {
    try {
        const db = getDB();
        const allRecords = await db.collection('medical_records').find({}).sort({}).limit(5000).toArray();

        // Group by registerNumber
        const byPatient = {};
        for (const r of allRecords) {
            const key = r.registerNumber || '__unknown__';
            if (!byPatient[key]) byPatient[key] = [];
            byPatient[key].push(r);
        }

        const flaggedClusters = [];

        for (const [regNum, records] of Object.entries(byPatient)) {
            if (records.length < 2) continue;

            const flags = [];
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
                            message: `${count}x "${type}" records on ${date} for the same patient. Statistically improbable.`,
                        });
                    }
                }

                // Signal 2: Multiple high-cost procedures in one day
                const dayTotal = dayRecords.reduce((sum, r) => sum + (parseFloat(r.medCosts) || BILLING_BASELINES[r.recordType]?.avg || 0), 0);
                if (dayTotal >= 50000 && dayRecords.length >= 2) {
                    flags.push({
                        severity: 'high',
                        type: 'HIGH_COST_CLUSTER',
                        date,
                        message: `Total billed cost on ${date}: Rs. ${dayTotal.toLocaleString('en-IN')} across ${dayRecords.length} procedures. Unusually high for a single day.`,
                    });
                }

                // Signal 3: Incompatible same-day combinations
                const types = dayRecords.map(r => r.recordType);
                if (types.includes('Discharge') && types.includes('Lab Report')) {
                    flags.push({
                        severity: 'high',
                        type: 'INCOMPATIBLE_COMBO',
                        date,
                        message: `Simultaneous "Discharge" and "Lab Report" on ${date}. Discharge concludes treatment; a same-day lab order is suspicious.`,
                    });
                }
                if (types.includes('Discharge') && types.includes('Prescription')) {
                    flags.push({
                        severity: 'medium',
                        type: 'INCOMPATIBLE_COMBO',
                        date,
                        message: `Simultaneous "Discharge" and new "Prescription" issued on ${date}. Post-discharge prescriptions should be dated after discharge.`,
                    });
                }
            }

            // Signal 4: Ghost billing network (3+ distinct issuers)
            const issuers = [...new Set(records.map(r => r.issuerUsername).filter(Boolean))];
            if (issuers.length >= 3) {
                flags.push({
                    severity: 'critical',
                    type: 'MULTI_ISSUER_PATIENT',
                    date: null,
                    message: `Patient ${regNum} has records from ${issuers.length} distinct issuers (${issuers.join(', ')}). Coordinated ghost billing network pattern.`,
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

        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        flaggedClusters.sort((a, b) => severityOrder[a.riskLevel] - severityOrder[b.riskLevel]);

        res.json({ clusters: flaggedClusters, scanned: Object.keys(byPatient).length, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[Analytics] ghost-procedures error:', err);
        res.status(500).json({ error: 'Ghost procedure analysis failed.' });
    }
});

// GET /api/analytics/express-approval (Verifiers, Dual, and Admin)
router.get('/express-approval', requireRole(['verifier', 'dual']), async (req, res) => {
    try {
        const db = getDB();
        const allRecords = await db.collection('medical_records').find({}).sort({ createdAt: -1 }).limit(5000).toArray();

        const approved = [];

        for (const record of allRecords) {
            if (record.approvalStatus && record.approvalStatus !== 'pending') continue;

            const { score, flags } = await computeRiskScore(record, db);
            if (score < 95) continue;

            const medCosts = parseFloat(record.medCosts);
            const baseline = BILLING_BASELINES[record.recordType]?.avg;
            let billingRatio = null;
            if (baseline && !isNaN(medCosts) && medCosts > 0) {
                billingRatio = parseFloat((medCosts / baseline).toFixed(2));
                if (billingRatio > 1.5) continue;
            }

            const approvalTier = score === 100 ? 'PLATINUM' : score >= 97 ? 'GOLD' : 'FAST';
            const reasons = [];
            if (flags.length === 0) {
                reasons.push('No fraud signals detected. Perfect cryptographic provenance.');
            } else {
                reasons.push(`Only low-severity signal${flags.length > 1 ? 's' : ''} detected. No critical flags.`);
            }
            if (billingRatio !== null) {
                reasons.push(`Billing of Rs. ${medCosts.toLocaleString('en-IN')} is ${billingRatio}x the typical baseline. Within expected range.`);
            } else {
                reasons.push('No anomalous billing found. Record qualifies by integrity score.');
            }
            if (record.issuerProfile?.institution) {
                reasons.push(`Issued by registered institution: ${record.issuerProfile.institution}.`);
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
