const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDB } = require('../db');

function hashPass(pass) {
    return crypto.createHash('sha256').update(pass).digest('hex');
}

// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = getDB();
        const user = await db.collection('users').findOne({ username, isMasterAdmin: true });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.passwordHash !== hashPass(password)) return res.status(401).json({ error: 'Invalid credentials' });
        res.json({ success: true, user: { username: user.username, fullName: user.fullName, institution: user.institution, isMasterAdmin: true } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List all managed users (created by this admin)
router.get('/users', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });
        const users = await db.collection('users').find({ createdBy: adminUser }).sort({ doj: -1 }).limit(200).toArray();
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a managed user
router.post('/create-user', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const { username, fullName, email, role, type, institution, password } = req.body;
        if (!username || !fullName || !role || !type) return res.status(400).json({ error: 'username, fullName, role, type are required' });
        if (!password || password.length < 6) return res.status(400).json({ error: 'Initial password must be at least 6 characters' });

        const existing = await db.collection('users').findOne({ username });
        if (existing) return res.status(409).json({ error: 'Username already taken' });

        const newUser = {
            username,
            fullName,
            email: email || '',
            role,
            type,
            institution: institution || admin.institution || '',
            passwordHash: hashPass(password),
            emailVerified: false,
            adminVerified: false,
            createdBy: adminUser,
            doj: new Date().toISOString(),
        };
        await db.collection('users').insertOne(newUser);
        res.status(201).json({ message: 'User created', user: { ...newUser, passwordHash: undefined } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle adminVerified flag for a managed user
router.post('/verify-user', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const { username, verified } = req.body;
        const target = await db.collection('users').findOne({ username, createdBy: adminUser });
        if (!target) return res.status(404).json({ error: 'User not found or not under your account' });

        await db.collection('users').updateOne({ username }, { $set: { adminVerified: !!verified } });
        res.json({ message: `User ${verified ? 'verified' : 'unverified'}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a managed user
router.delete('/user/:username', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const target = await db.collection('users').findOne({ username: req.params.username, createdBy: adminUser });
        if (!target) return res.status(404).json({ error: 'User not found or not under your account' });

        await db.collection('users').deleteOne({ username: req.params.username });
        res.json({ message: 'User removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a managed user's credentials (master admin only)
router.put('/update-user', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const { originalUsername, username, fullName, role, type, institution, newPassword } = req.body;
        if (!originalUsername) return res.status(400).json({ error: 'originalUsername is required' });

        const target = await db.collection('users').findOne({ username: originalUsername, createdBy: adminUser });
        if (!target) return res.status(404).json({ error: 'User not found or not under your account' });

        if (username && username !== originalUsername) {
            const conflict = await db.collection('users').findOne({ username });
            if (conflict) return res.status(409).json({ error: 'New username is already taken' });
        }

        const updates = {};
        if (username)     updates.username    = username;
        if (fullName)     updates.fullName    = fullName;
        if (role)         updates.role        = role;
        if (type)         updates.type        = type;
        if (institution !== undefined) updates.institution = institution;
        if (newPassword && newPassword.length >= 6) updates.passwordHash = hashPass(newPassword);

        await db.collection('users').updateOne({ username: originalUsername }, { $set: updates });
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch all records
router.get('/records', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const records = await db.collection('medical_records').find({}).sort({ createdAt: -1 }).toArray();
        res.json({ records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete multiple records
router.post('/records/delete', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Array of ids required' });
        
        await db.collection('medical_records').deleteMany({ _id: { $in: ids } });
        res.json({ message: `${ids.length} records deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update master admin details
router.put('/update-master', async (req, res) => {
    try {
        const adminUser = req.headers['x-admin-user'];
        if (!adminUser) return res.status(403).json({ error: 'Admin access required' });
        const db = getDB();
        const admin = await db.collection('users').findOne({ username: adminUser, isMasterAdmin: true });
        if (!admin) return res.status(403).json({ error: 'Admin access required' });

        const { fullName, institution } = req.body;
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (institution !== undefined) updates.institution = institution;

        await db.collection('users').updateOne({ username: adminUser }, { $set: updates });
        res.json({ message: 'Admin details updated successfully', user: { ...admin, ...updates, passwordHash: undefined } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
