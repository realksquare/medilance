process.on('unhandledRejection', (reason) => {
    const msg = String(reason?.message || reason);
    if (msg.includes('querySrv') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('mongodb')) {
        console.warn('[GUARD] Suppressed background error:', msg.split('\n')[0]);
        return;
    }
    console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
    const msg = String(err?.message || err);
    if (msg.includes('querySrv') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('mongodb')) {
        console.warn('[GUARD] Suppressed background crash:', msg.split('\n')[0]);
        return;
    }
    console.error('[UNCAUGHT EXCEPTION] (Process Kept Alive):', err);
});

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');

const { connectToDB, getDB } = require('./db');
const { computeRiskScore } = require('./fraud');
const { verifyToken, requireRole } = require('./utils/authMiddleware');

const userRoutes      = require('./routes/userRoutes');
const adminRoutes     = require('./routes/adminRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const verifierRoutes  = require('./routes/verifierRoutes');

const app = express();
const PORT = process.env.PORT || 3005;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'MediLance 2.0' }));

// Action Logger Helper
async function logAction(username, actionType, status, details) {
    try {
        const db = getDB();
        await db.collection('actions').insertOne({
            username: username || 'guest',
            actionType,
            status,
            details,
            timestamp: new Date()
        });
    } catch (e) {
        console.error('Action logging failed:', e.message);
    }
}

// Database Connection Middleware
app.use(async (req, res, next) => {
    try {
        await connectToDB();
        next();
    } catch (error) {
        console.error('DB Connection Error:', error);
        res.status(500).json({ error: 'Database service unavailable' });
    }
});

// Attach Token Verification across all routes
app.use(verifyToken);

app.use('/api/users',     userRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/verifier',  verifierRoutes);

// Rate Limiter for Guest Verifications (5 per day per IP)
const verificationStore = {};
const checkVerificationLimit = async (req, res, next) => {
    if (req.user && req.user.username && req.user.username !== 'guest') {
        return next();
    }

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const today = new Date().toISOString().split('T')[0];
    const key = `${ip}_${today}`;

    if (!verificationStore[key]) verificationStore[key] = 0;
    if (verificationStore[key] >= 10) {
        return res.status(429).json({ error: 'Daily guest verification limit reached. Please log in for unlimited checks.' });
    }

    verificationStore[key]++;
    next();
};

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

async function hashFileBuffer(buffer, mimetype) {
    if (mimetype === 'image/jpeg' || mimetype === 'image/png' || mimetype === 'image/webp') {
        const normalized = await sharp(buffer)
            .rotate()
            .resize({ width: 1200, withoutEnlargement: true })
            .grayscale()
            .normalise()
            .withMetadata(false)
            .png({ compressionLevel: 0 })
            .toBuffer();
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function getVerificationHistory(hash, db) {
    const allActions = await db.collection('actions').find({ actionType: 'verified', status: 'success' }).sort({ timestamp: 1 }).limit(5000).toArray();
    const relevant = allActions.filter(a => a.details?.dataHash === hash || a.details?.fileHash === hash);
    if (relevant.length === 0) return { count: 0, verifiers: [], firstVerified: null, lastVerified: null };

    const usernamesSeen = [];
    const seen = new Set();
    for (const a of relevant) {
        if (a.username && !seen.has(a.username)) {
            seen.add(a.username);
            usernamesSeen.push(a.username);
        }
    }
    const verifiers = await Promise.all(
        usernamesSeen.map(async (u) => {
            const user = await db.collection('users').findOne({ username: u });
            return { username: u, fullName: user?.fullName || u };
        })
    );
    return {
        count: relevant.length,
        verifiers,
        firstVerified: relevant[0]?.timestamp || null,
        lastVerified: relevant[relevant.length - 1]?.timestamp || null,
    };
}

// Basic Record Creation (Protected: Issuer or Dual)
app.post('/api/create-record', requireRole(['issuer', 'dual']), async (req, res) => {
    try {
        const username = req.user.username;
        const { recordData } = req.body;
        if (!recordData) return res.status(400).json({ error: 'Record data is required.' });

        const dataHash = createStableHash(recordData);
        const db = getDB();

        const existing = await db.collection('medical_records').findOne({ dataHash });
        if (existing) {
            await logAction(username, 'issued', 'failed', { dataHash, reason: 'duplicate' });
            return res.status(409).json({ error: 'Identical record is already registered on the network.', dataHash });
        }

        const issuer = await db.collection('users').findOne({ username });
        const issuerProfile = issuer
            ? { fullName: issuer.fullName, role: issuer.role, type: issuer.type, institution: issuer.institution || '' }
            : null;

        await db.collection('medical_records').insertOne({
            ...recordData,
            dataHash,
            mode: 'basic',
            issuerUsername: username,
            issuerProfile,
            createdAt: new Date()
        });

        await logAction(username, 'issued', 'success', { dataHash, patientName: recordData.patientName });
        res.status(201).json({ message: 'Record created successfully.', dataHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mint Record Creation (Protected: Issuer or Dual)
app.post('/api/create-record-file', requireRole(['issuer', 'dual']), upload.single('file'), async (req, res) => {
    try {
        const username = req.user.username;
        if (!req.file || !req.body.recordData) return res.status(400).json({ error: 'File and record metadata are required.' });

        const parsedData = JSON.parse(req.body.recordData);
        const fileHash = await hashFileBuffer(req.file.buffer, req.file.mimetype);
        const db = getDB();

        const existing = await db.collection('medical_records').findOne({ fileHash });
        if (existing) {
            await logAction(username, 'mint_issued', 'failed', { fileHash, reason: 'duplicate' });
            return res.status(409).json({ error: 'Document file is already registered on the network.', dataHash: fileHash });
        }

        const issuer = await db.collection('users').findOne({ username });
        const issuerProfile = issuer
            ? { fullName: issuer.fullName, role: issuer.role, type: issuer.type, institution: issuer.institution || '' }
            : null;

        await db.collection('medical_records').insertOne({
            ...parsedData,
            fileHash,
            mode: 'mint',
            issuerUsername: username,
            issuerProfile,
            createdAt: new Date()
        });

        await logAction(username, 'mint_issued', 'success', { fileHash, patientName: parsedData.patientName });
        res.status(201).json({ message: 'Mint record registered successfully.', dataHash: fileHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verification Endpoints (Accessible to public guests & verifiers)
app.post('/api/verify-record', checkVerificationLimit, async (req, res) => {
    try {
        const username = req.user?.username || 'guest';
        const { dataHash } = req.body;
        if (!dataHash) return res.status(400).json({ error: 'Verification hash is required.' });

        const db = getDB();
        const found = await db.collection('medical_records').findOne({ dataHash });

        if (found) {
            const { _id, dataHash: _, fileHash: __, mode, ...details } = found;
            await logAction(username, 'verified', 'success', { dataHash, mode });
            const fraud = await computeRiskScore({ ...details, dataHash, issuerUsername: found.issuerUsername }, db);
            const verificationHistory = await getVerificationHistory(dataHash, db);
            res.json({ verified: true, record: details, mode, fraud, verificationHistory });
        } else {
            await logAction(username, 'verified', 'failed', { dataHash });
            res.status(404).json({ verified: false, error: 'Record not found or unverified hash.' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify-file', checkVerificationLimit, upload.single('file'), async (req, res) => {
    try {
        const username = req.user?.username || 'guest';
        if (!req.file) return res.status(400).json({ error: 'File upload is required.' });

        const fileHash = await hashFileBuffer(req.file.buffer, req.file.mimetype);
        const db = getDB();
        const found = await db.collection('medical_records').findOne({ fileHash, mode: 'mint' });

        if (found) {
            const { _id, fileHash: _, mode, ...details } = found;
            const fraud = await computeRiskScore({ ...details, fileHash, issuerUsername: found.issuerUsername }, db);
            await logAction(username, 'verified', 'success', { fileHash, mode: 'mint' });
            const verificationHistory = await getVerificationHistory(fileHash, db);
            res.json({ verified: true, record: details, fraud, verificationHistory });
        } else {
            res.status(404).json({ verified: false, error: 'Document was altered or not registered on network.' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/risk-score/:hash', async (req, res) => {
    try {
        const { hash } = req.params;
        const db = getDB();
        const found = (await db.collection('medical_records').findOne({ dataHash: hash })) ||
                      (await db.collection('medical_records').findOne({ fileHash: hash }));
        if (!found) return res.status(404).json({ error: 'Record not found.' });
        const fraud = await computeRiskScore(found, db);
        res.json({ hash, fraud });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const uploadMany = multer({ storage: multer.memoryStorage() });
app.post('/api/bulk-verify-mint', checkVerificationLimit, uploadMany.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files provided for bulk verification.' });
        const db = getDB();
        const results = [];
        for (const f of req.files) {
            const fileHash = await hashFileBuffer(f.buffer, f.mimetype);
            const found = await db.collection('medical_records').findOne({ fileHash, mode: 'mint' });
            if (found) {
                const { _id, fileHash: _, mode, ...details } = found;
                results.push({ filename: f.originalname, verified: true, record: details });
            } else {
                results.push({ filename: f.originalname, verified: false });
            }
        }
        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Record Creation (Protected)
app.post('/api/bulk-create', requireRole(['issuer', 'dual']), async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records)) return res.status(400).json({ error: 'Array of records expected.' });

        const db = getDB();
        const results = [];
        const username = req.user.username;

        for (const record of records) {
            const dataHash = createStableHash(record);
            const exists = await db.collection('medical_records').findOne({ dataHash });
            if (!exists) {
                await db.collection('medical_records').insertOne({
                    ...record,
                    dataHash,
                    mode: 'basic',
                    issuerUsername: username,
                    createdAt: new Date()
                });
                results.push({ ...record, dataHash, status: 'created' });
            } else {
                results.push({ ...record, dataHash, status: 'exists' });
            }
        }

        await logAction(username, 'bulk_issued', 'success', { count: results.length });
        res.json({ message: 'Bulk processing completed.', results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function seedMasterAdmin() {
    const adminUser = process.env.MASTER_ADMIN_USER || 'master_admin';
    const adminPass = process.env.MASTER_ADMIN_PASS || 'MediLance@2025';
    const db = getDB();
    const existing = await db.collection('users').findOne({ isMasterAdmin: true });
    if (!existing) {
        const passwordHash = await bcrypt.hash(adminPass, 10);
        await db.collection('users').insertOne({
            username: adminUser,
            fullName: 'MediLance Master Admin',
            role: 'Master Administrator',
            type: 'system',
            institution: 'MediLance Protocol',
            email: '',
            emailVerified: true,
            adminVerified: true,
            isMasterAdmin: true,
            passwordHash,
            doj: new Date().toISOString(),
        });
        console.log(`[SEED] Master admin created: ${adminUser}`);
    }
}

app.listen(PORT, async () => {
    console.log(`MediLance server active on port ${PORT}`);
    try {
        await connectToDB();
        await seedMasterAdmin();
    } catch (e) {
        console.error('Initial DB connection failed:', e.message);
    }
});
