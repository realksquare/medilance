const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../db');
const { computeRiskScore } = require('../fraud');

// Guard: verifier or dual role only
async function requireVerifier(req, res, next) {
    try {
        const username = req.headers['x-username'];
        if (!username || username === 'guest') return res.status(403).json({ error: 'Verifier login required.' });
        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        if (!user) return res.status(403).json({ error: 'User not found.' });
        if (!['verifier', 'dual'].includes(user.role)) return res.status(403).json({ error: 'Verifier role required.' });
        req.verifierUser = user;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// GET /api/verifier/queue
// Returns records with integrity score < 90 and status pending, sorted by score ascending (riskiest first)
router.get('/queue', requireVerifier, async (req, res) => {
    try {
        const db = getDB();
        const allRecords = await db.collection('medical_records')
            .find({ $or: [{ approvalStatus: { $exists: false } }, { approvalStatus: 'pending' }] })
            .sort({ createdAt: -1 })
            .limit(500)
            .toArray();

        const queue = [];
        for (const record of allRecords) {
            const { score, grade, flags } = await computeRiskScore(record, db);
            if (score >= 90) continue;
            queue.push({
                _id: record._id,
                patientName: record.patientName,
                registerNumber: record.registerNumber,
                recordType: record.recordType,
                issueDate: record.issueDate,
                issuerUsername: record.issuerUsername,
                issuerInstitution: record.issuerProfile?.institution || record.issuerProfile?.fullName || record.issuerUsername,
                diagnosis: record.diagnosis,
                medCosts: record.medCosts,
                dob: record.dob,
                gender: record.gender,
                bloodGroup: record.bloodGroup,
                doctorName: record.doctorName,
                dataHash: record.dataHash || record.fileHash,
                mode: record.mode,
                createdAt: record.createdAt,
                integrityScore: score,
                grade,
                flags,
            });
        }

        queue.sort((a, b) => a.integrityScore - b.integrityScore);
        res.json({ queue, total: queue.length, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[Verifier] queue error:', err);
        res.status(500).json({ error: 'Failed to load verifier queue.' });
    }
});

// PATCH /api/verifier/decision
// Body: { recordId, action: 'accepted'|'flagged'|'rejected', reason }
router.patch('/decision', requireVerifier, async (req, res) => {
    try {
        const { recordId, action, reason } = req.body;
        if (!recordId || !action) return res.status(400).json({ error: 'recordId and action are required.' });
        if (!['accepted', 'flagged', 'rejected'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });

        const db = getDB();
        let filter;
        try { filter = { _id: new ObjectId(recordId) }; } catch { filter = { _id: recordId }; }

        const result = await db.collection('medical_records').updateOne(filter, {
            $set: {
                approvalStatus: action,
                verifierNote: reason || '',
                verifiedBy: req.verifierUser.username,
                verifiedAt: new Date().toISOString(),
            }
        });

        if (result.matchedCount === 0) return res.status(404).json({ error: 'Record not found.' });

        await db.collection('actions').insertOne({
            username: req.verifierUser.username,
            actionType: 'verifier_decision',
            status: 'success',
            details: { recordId, action, reason: reason || '' },
            timestamp: new Date(),
        });

        res.json({ message: `Record ${action}.` });
    } catch (err) {
        console.error('[Verifier] decision error:', err);
        res.status(500).json({ error: 'Failed to record decision.' });
    }
});

module.exports = router;
