const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { signToken, hashPassword, comparePassword, verifyToken, requireAdmin } = require('../utils/authMiddleware');

// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const db = getDB();
        const user = await db.collection('users').findOne({ username, isMasterAdmin: true });
        if (!user) return res.status(401).json({ error: 'Invalid administrator credentials.' });

        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid administrator credentials.' });

        // Auto-upgrade legacy plain SHA-256 hash to bcrypt
        if (user.passwordHash && !user.passwordHash.startsWith('$2')) {
            const upgradedHash = await hashPassword(password);
            await db.collection('users').updateOne(
                { username },
                { $set: { passwordHash: upgradedHash } }
            );
        }

        const token = signToken(user);
        res.json({
            success: true,
            token,
            user: {
                username: user.username,
                fullName: user.fullName,
                institution: user.institution,
                isMasterAdmin: true,
                role: 'admin',
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// All subsequent routes require valid master admin token
router.use(verifyToken);
router.use(requireAdmin);

// List all managed users
router.get('/users', async (req, res) => {
    try {
        const db = getDB();
        const users = await db.collection('users')
            .find({ isMasterAdmin: { $ne: true } })
            .sort({ doj: -1 })
            .limit(200)
            .toArray();

        const safeUsers = users.map(({ passwordHash, otp, otpExpiry, ...u }) => u);
        res.json({ users: safeUsers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a managed user
router.post('/create-user', async (req, res) => {
    try {
        const adminUser = req.user.username;
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required.' });

        const { username, fullName, email, role, type, institution, password } = req.body;
        if (!username || !fullName || !role || !type) {
            return res.status(400).json({ error: 'Username, fullName, role, and type are required.' });
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Initial password must be at least 6 characters.' });
        }

        const existing = await db.collection('users').findOne({ username });
        if (existing) return res.status(409).json({ error: 'Username is already taken.' });

        const passwordHash = await hashPassword(password);
        const newUser = {
            username,
            fullName,
            email: email || '',
            role,
            type,
            institution: institution || admin.institution || '',
            passwordHash,
            emailVerified: false,
            adminVerified: false,
            createdBy: adminUser,
            doj: new Date().toISOString(),
        };

        await db.collection('users').insertOne(newUser);
        const { passwordHash: _, ...createdSafe } = newUser;
        res.status(201).json({ message: 'User created successfully.', user: createdSafe });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle adminVerified flag for a managed user
router.post('/verify-user', async (req, res) => {
    try {
        const { username, verified } = req.body;
        const db = getDB();
        const target = await db.collection('users').findOne({ username });
        if (!target || target.isMasterAdmin) return res.status(404).json({ error: 'User not found.' });

        await db.collection('users').updateOne({ username }, { $set: { adminVerified: !!verified } });
        res.json({ message: `User ${verified ? 'verified' : 'unverified'} successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a managed user
router.delete('/user/:username', async (req, res) => {
    try {
        const db = getDB();
        const target = await db.collection('users').findOne({ username: req.params.username });
        if (!target || target.isMasterAdmin) return res.status(404).json({ error: 'User not found.' });

        await db.collection('users').deleteOne({ username: req.params.username });
        res.json({ message: 'User removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a managed user credentials
router.put('/update-user', async (req, res) => {
    try {
        const db = getDB();
        const { originalUsername, username, fullName, role, type, institution, newPassword } = req.body;
        if (!originalUsername) return res.status(400).json({ error: 'originalUsername is required.' });

        const target = await db.collection('users').findOne({ username: originalUsername });
        if (!target || target.isMasterAdmin) return res.status(404).json({ error: 'User not found.' });

        if (username && username !== originalUsername) {
            const conflict = await db.collection('users').findOne({ username });
            if (conflict) return res.status(409).json({ error: 'New username is already taken.' });
        }

        const updates = {};
        if (username) updates.username = username;
        if (fullName) updates.fullName = fullName;
        if (role) updates.role = role;
        if (type) updates.type = type;
        if (institution !== undefined) updates.institution = institution;
        if (newPassword && newPassword.length >= 6) {
            updates.passwordHash = await hashPassword(newPassword);
        }

        await db.collection('users').updateOne({ username: originalUsername }, { $set: updates });
        res.json({ message: 'User updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch all records
router.get('/records', async (req, res) => {
    try {
        const db = getDB();
        const records = await db.collection('medical_records').find({}).sort({ createdAt: -1 }).toArray();
        res.json({ records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete multiple records
router.post('/records/delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Array of ids required.' });

        const db = getDB();
        await db.collection('medical_records').deleteMany({ _id: { $in: ids } });
        res.json({ message: `${ids.length} record(s) deleted successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update master admin profile details
router.put('/update-master', async (req, res) => {
    try {
        const adminUser = req.user.username;
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required.' });

        const { fullName, institution } = req.body;
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (institution !== undefined) updates.institution = institution;

        await db.collection('users').updateOne({ username: adminUser }, { $set: updates });
        res.json({
            message: 'Admin details updated successfully.',
            user: { ...admin, ...updates, passwordHash: undefined },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
