const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDB } = require('../db');
const { sendOTP } = require('../utils/emailService');

// Get Profile (also stamps activationDate on first login for managed users)
router.get('/:username', async (req, res) => {
    console.log(`GET /api/users/${req.params.username} called`);
    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Password check for admin-created accounts
        if (user.passwordHash) {
            const supplied = req.headers['x-password'] || '';
            const suppliedHash = crypto.createHash('sha256').update(supplied).digest('hex');
            if (suppliedHash !== user.passwordHash) {
                return res.status(401).json({ error: 'Incorrect password' });
            }
        }

        // Stamp activation date the first time a managed user logs in
        if (user.createdBy && !user.activationDate) {
            await db.collection('users').updateOne(
                { username: req.params.username },
                { $set: { activationDate: new Date().toISOString() } }
            );
            user.activationDate = new Date().toISOString();
        }
        
        const history = await db.collection('actions')
            .find({ username: req.params.username })
            .sort({ timestamp: -1 })
            .limit(10)
            .toArray();
            
        res.json({ user, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Profile
router.post('/setup', async (req, res) => {
    try {
        const { username, fullName, role, type, email, institution } = req.body;
        const db = getDB();

        const existing = await db.collection('users').findOne({ username });

        const updateData = {
            username,
            fullName,
            role,
            type,
            email,
            institution: institution || '',
            emailVerified: existing ? existing.emailVerified : false,
            doj: existing ? existing.doj : new Date().toISOString(),
        };
        
        await db.collection('users').updateOne(
            { username },
            { $set: updateData },
            { upsert: true }
        );
        
        res.json({ message: 'Profile updated', user: updateData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
    console.log("POST /api/users/send-otp called", req.body);
    try {
        const { username } = req.body;
        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 10 * 60000); // 10 mins

        await db.collection('users').updateOne(
            { username },
            { $set: { otp, otpExpiry: expiry } }
        );

        await sendOTP(user.email, otp);
        res.json({ message: 'OTP sent to registered email' });
    } catch (error) {
        console.error("Send OTP Error:", error);
        res.status(500).json({ error: "Failed to send email. Check EMAIL_USER/PASS in .env" });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { username, otp } = req.body;
        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        
        if (!user || user.otp !== otp || new Date() > new Date(user.otpExpiry)) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        await db.collection('users').updateOne(
            { username },
            { $set: { emailVerified: true }, $unset: { otp: "", otpExpiry: "" } }
        );

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
