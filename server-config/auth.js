const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'wamjam-dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate an access token (short-lived)
 * @param {{ id: string, username: string }} user
 * @returns {string}
 */
function generateAccessToken(user) {
    return jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
}

/**
 * Generate a refresh token (long-lived)
 * @param {{ id: string }} user
 * @returns {{ token: string, expiresAt: Date }}
 */
function generateRefreshToken(user) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    const token = jwt.sign(
        { userId: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
    );

    return { token, expiresAt };
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {object|null}
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

/**
 * Express middleware: requires a valid access token.
 * Sets req.user = { userId, username }
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired access token' });
    }

    req.user = { userId: decoded.userId, username: decoded.username };
    next();
}

/**
 * Express middleware: optionally parses auth token.
 * Sets req.user if token is present and valid, otherwise req.user = null.
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        req.user = decoded ? { userId: decoded.userId, username: decoded.username } : null;
    } else {
        req.user = null;
    }
    next();
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    requireAuth,
    optionalAuth,
    JWT_SECRET,
    BCRYPT_SALT_ROUNDS,
};
