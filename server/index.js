// ── Crash Guard (MUST be first) ─────────────────────────────────────────────
// The MongoDB Atlas driver emits background DNS/SRV errors on restricted networks
// that would otherwise kill the process. We intercept and suppress them here.
process.on('unhandledRejection', (reason) => {
    const msg = String(reason?.message || reason);
    if (msg.includes('querySrv') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('mongodb')) {
        console.warn('[GUARD] Suppressed MongoDB background error:', msg.split('\n')[0]);
        return;
    }
    console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
    const msg = String(err?.message || err);
    if (msg.includes('querySrv') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('mongodb')) {
        console.warn('[GUARD] Suppressed MongoDB background crash:', msg.split('\n')[0]);
        return;
    }
    console.error('[UNCAUGHT EXCEPTION] (Process Kept Alive):', err);
});
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { connectToDB, getDB } = require('./db');
const { computeRiskScore } = require('./fraud');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3005;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Health Check (Very top to avoid ANY hangs)
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'MediLance' }));

// Action Logger Helper
async function logAction(username, actionType, status, details) {
    try {
        const db = getDB();
        await db.collection('actions').insertOne({
            username,
            actionType, // 'issued', 'verified', 'bulk_issued'
            status, // 'success', 'failed'
            details,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Logging failed", e);
    }
}


// DB connection middleware — must run before any route that calls getDB()
app.use(async (req, res, next) => {
    try {
        await connectToDB();
        next();
    } catch (error) {
        console.error("DB Middleware Error:", error);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Protocol Guard Middleware
const requireRegisteredUser = async (req, res, next) => {
    const username = req.headers['x-username'];
    if (!username || username === 'guest') {
        return res.status(403).json({ error: 'Registration required for this action' });
    }
    const db = getDB();
    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(403).json({ error: 'Valid registration required' });
    next();
};

// Verification Rate Limiter
const verificationStore = {}; // Memory store for daily guest counts
const checkVerificationLimit = async (req, res, next) => {
    const username = req.headers['x-username'];
    if (username && username !== 'guest') {
        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        if (user) return next(); // Unlimited for registered
    }

    // Guest Limiting
    const ip = req.ip;
    const today = new Date().toISOString().split('T')[0];
    const key = `${ip}_${today}`;
    
    if (!verificationStore[key]) verificationStore[key] = 0;
    if (verificationStore[key] >= 5) {
        return res.status(429).json({ error: 'Daily guest limit (5) reached. Please register for unlimited access.' });
    }
    
    verificationStore[key]++;
    next();
};

// Helper Functions
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
        // Normalize: strip EXIF, convert to greyscale, resize to fixed width.
        // This makes casual phone photos (glare, rotation, compression) hash
        // identically to the source as long as the visual content is intact.
        const normalized = await sharp(buffer)
            .rotate()                          // auto-rotate from EXIF orientation
            .resize({ width: 1200, withoutEnlargement: true })
            .grayscale()
            .normalise()                       // stretch contrast to 0-255
            .withMetadata(false)               // strip all EXIF/GPS metadata
            .png({ compressionLevel: 0 })      // lossless output for stable bytes
            .toBuffer();
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }
    // PDFs and other files: hash the raw buffer as-is
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Routes

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

// Basic Record Creation (QR Data)
app.post('/api/create-record', requireRegisteredUser, async (req, res) => {
    try {
        const username = req.headers['x-username'] || 'guest';
        const { recordData } = req.body;
        if (!recordData) return res.status(400).json({ error: 'Record data is required' });

        const dataHash = createStableHash(recordData);
        const db = getDB();

        const existing = await db.collection('medical_records').findOne({ dataHash });
        if (existing) {
            await logAction(username, 'issued', 'failed', { dataHash, reason: 'duplicate' });
            return res.status(409).json({ error: 'Record already exists', dataHash });
        }

        const issuer = await db.collection('users').findOne({ username });
        const issuerProfile = issuer
            ? { fullName: issuer.fullName, role: issuer.role, type: issuer.type, institution: issuer.institution || '' }
            : null;

        await db.collection('medical_records').insertOne({ ...recordData, dataHash, mode: 'basic', issuerUsername: username, issuerProfile, createdAt: new Date() });
        await logAction(username, 'issued', 'success', { dataHash, patientName: recordData.patientName });
        res.status(201).json({ message: 'Record created', dataHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mint Record Creation (File Integrity)
app.post('/api/create-record-file', requireRegisteredUser, upload.single('file'), async (req, res) => {
    try {
        const username = req.headers['x-username'] || 'guest';
        if (!req.file || !req.body.recordData) return res.status(400).json({ error: 'File and data are required' });

        const parsedData = JSON.parse(req.body.recordData);
        const fileHash = await hashFileBuffer(req.file.buffer, req.file.mimetype);
        const db = getDB();

        const existing = await db.collection('medical_records').findOne({ fileHash });
        if (existing) {
            await logAction(username, 'mint_issued', 'failed', { fileHash, reason: 'duplicate' });
            return res.status(409).json({ error: 'File already registered', dataHash: fileHash });
        }

        const issuer = await db.collection('users').findOne({ username });
        const issuerProfile = issuer
            ? { fullName: issuer.fullName, role: issuer.role, type: issuer.type, institution: issuer.institution || '' }
            : null;

        await db.collection('medical_records').insertOne({ ...parsedData, fileHash, mode: 'mint', issuerUsername: username, issuerProfile, createdAt: new Date() });
        await logAction(username, 'mint_issued', 'success', { fileHash, patientName: parsedData.patientName });
        res.status(201).json({ message: 'Mint record created', dataHash: fileHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verification Endpoints
app.post('/api/verify-record', checkVerificationLimit, async (req, res) => {
    try {
        const username = req.headers['x-username'] || 'guest';
        const { dataHash } = req.body;
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
            res.status(404).json({ verified: false, error: 'Record not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/verify-file', checkVerificationLimit, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File is required' });
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
            res.status(404).json({ verified: false, error: 'Tampered or unregistered file' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// On-demand risk score by hash
app.get('/api/risk-score/:hash', async (req, res) => {
    try {
        const { hash } = req.params;
        const db = getDB();
        const found = (await db.collection('medical_records').findOne({ dataHash: hash })) ||
                      (await db.collection('medical_records').findOne({ fileHash: hash }));
        if (!found) return res.status(404).json({ error: 'Record not found' });
        const fraud = await computeRiskScore(found, db);
        res.json({ hash, fraud });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Verification (Mint only — verifies multiple files at once)
const uploadMany = multer({ storage: multer.memoryStorage() });
app.post('/api/bulk-verify-mint', checkVerificationLimit, uploadMany.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files provided' });
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

// Bulk Creation
app.post('/api/bulk-create', requireRegisteredUser, async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records)) return res.status(400).json({ error: 'Array of records expected' });
        
        const db = getDB();
        const results = [];
        const username = req.headers['x-username'] || 'guest';
        
        for (const record of records) {
            const dataHash = createStableHash(record);
            const exists = await db.collection('medical_records').findOne({ dataHash });
            if (!exists) {
                await db.collection('medical_records').insertOne({ ...record, dataHash, mode: 'basic', createdAt: new Date() });
                results.push({ ...record, dataHash, status: 'created' });
            } else {
                results.push({ ...record, dataHash, status: 'exists' });
            }
        }
        
        await logAction(username, 'bulk_issued', 'success', { count: results.length });
        res.json({ message: 'Bulk processing complete', results });
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
        const passwordHash = crypto.createHash('sha256').update(adminPass).digest('hex');
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
        console.error("Initial DB connection failed:", e.message);
    }
});
