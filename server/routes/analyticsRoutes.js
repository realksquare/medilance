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
function requireMasterAdmin(req, res, next) {
    const user = req.headers['x-admin-user'];
    const pass = req.headers['x-admin-pass'];
    const MASTER_USER = process.env.MASTER_ADMIN_USER;
    const MASTER_PASS = process.env.MASTER_ADMIN_PASS;
    if (!user || !pass || user !== MASTER_USER || pass !== MASTER_PASS) {
        return res.status(403).json({ error: 'Master admin credentials required.' });
    }
    next();
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

module.exports = router;
