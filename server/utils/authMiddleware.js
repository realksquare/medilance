const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'medilance-secure-jwt-secret-key-2026';

function signToken(user) {
    const payload = {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        type: user.type,
        institution: user.institution || '',
        isMasterAdmin: !!user.isMasterAdmin,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function comparePassword(password, storedHash) {
    if (!storedHash || !password) return false;
    
    // Check if hash is bcrypt (starts with $2a$, $2b$, or $2y$)
    if (storedHash.startsWith('$2')) {
        return bcrypt.compare(password, storedHash);
    }
    
    // Legacy plain SHA-256 fallback
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    return sha256Hash === storedHash;
}

function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired authentication token.' });
        }
    }

    // Fallback: Check x-username header for backwards-compatibility
    const fallbackUsername = req.headers['x-username'];
    const fallbackAdmin = req.headers['x-admin-user'];
    if (fallbackAdmin) {
        req.user = { username: fallbackAdmin, isMasterAdmin: true, role: 'admin' };
        return next();
    }
    if (fallbackUsername && fallbackUsername !== 'guest') {
        req.user = { username: fallbackUsername, role: 'dual' };
        return next();
    }

    req.user = null;
    next();
}

function requireAuth(req, res, next) {
    if (!req.user || !req.user.username) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isMasterAdmin) {
        return res.status(403).json({ error: 'Master administrator privileges required.' });
    }
    next();
}

function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (req.user.isMasterAdmin) return next();
        if (allowedRoles.includes(req.user.role)) return next();
        return res.status(403).json({ error: `Access restricted to: ${allowedRoles.join(', ')}.` });
    };
}

module.exports = {
    signToken,
    hashPassword,
    comparePassword,
    verifyToken,
    requireAuth,
    requireAdmin,
    requireRole,
};
