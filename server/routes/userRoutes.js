const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { sendOTP } = require('../utils/emailService');
const { signToken, hashPassword, comparePassword, verifyToken, requireAuth } = require('../utils/authMiddleware');

// User Login (Standard JWT issuance)
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        if (user.passwordHash) {
            const isMatch = await comparePassword(password, user.passwordHash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }

            // Upgrade legacy plain SHA-256 hash to bcrypt if needed
            if (!user.passwordHash.startsWith('$2')) {
                const newHash = await hashPassword(password);
                await db.collection('users').updateOne(
                    { username },
                    { $set: { passwordHash: newHash } }
                );
            }
        }

        // Stamp activation date on first login for managed users
        if (user.createdBy && !user.activationDate) {
            const now = new Date().toISOString();
            await db.collection('users').updateOne(
                { username },
                { $set: { activationDate: now } }
            );
            user.activationDate = now;
        }

        const token = signToken(user);
        const { passwordHash, otp, otpExpiry, ...safeUser } = user;

        res.json({
            success: true,
            token,
            user: safeUser,
        });
    } catch (error) {
        console.error('[User Login Error]:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Profile & Action History
router.get('/:username', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Optional password check for unauthenticated legacy requests
        if (user.passwordHash && (!req.user || req.user.username !== req.params.username)) {
            const supplied = req.headers['x-password'] || '';
            const isMatch = await comparePassword(supplied, user.passwordHash);
            if (!isMatch && !req.user?.isMasterAdmin) {
                return res.status(401).json({ error: 'Incorrect credentials.' });
            }
        }

        if (user.createdBy && !user.activationDate) {
            const now = new Date().toISOString();
            await db.collection('users').updateOne(
                { username: req.params.username },
                { $set: { activationDate: now } }
            );
            user.activationDate = now;
        }

        const history = await db.collection('actions')
            .find({ username: req.params.username })
            .sort({ timestamp: -1 })
            .limit(15)
            .toArray();

        const { passwordHash, otp, otpExpiry, ...safeUser } = user;
        res.json({ user: safeUser, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create / Update Profile
router.post('/setup', async (req, res) => {
    try {
        const { username, fullName, role, type, email, institution, password } = req.body;
        if (!username || !fullName || !role) {
            return res.status(400).json({ error: 'Username, full name, and role are required.' });
        }

        const db = getDB();
        const existing = await db.collection('users').findOne({ username });

        const updateData = {
            username,
            fullName,
            role,
            type: type || 'individual',
            email: email || '',
            institution: institution || '',
            emailVerified: existing ? existing.emailVerified : false,
            doj: existing ? existing.doj : new Date().toISOString(),
        };

        if (password && password.length >= 6) {
            updateData.passwordHash = await hashPassword(password);
        }

        await db.collection('users').updateOne(
            { username },
            { $set: updateData },
            { upsert: true }
        );

        const token = signToken(updateData);
        res.json({
            message: 'Profile updated successfully.',
            token,
            user: updateData,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
    try {
        const { username } = req.body;
        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 10 * 60000); // 10 minutes

        await db.collection('users').updateOne(
            { username },
            { $set: { otp, otpExpiry: expiry } }
        );

        await sendOTP(user.email, otp);
        res.json({ message: 'OTP sent to registered email address.' });
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ error: 'Failed to send OTP verification email.' });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { username, otp } = req.body;
        const db = getDB();
        const user = await db.collection('users').findOne({ username });

        if (!user || user.otp !== otp || new Date() > new Date(user.otpExpiry)) {
            return res.status(400).json({ error: 'Invalid or expired OTP code.' });
        }

        await db.collection('users').updateOne(
            { username },
            { $set: { emailVerified: true }, $unset: { otp: '', otpExpiry: '' } }
        );

        res.json({ message: 'Email verified successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
