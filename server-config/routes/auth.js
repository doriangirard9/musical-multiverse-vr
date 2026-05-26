const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    requireAuth,
    BCRYPT_SALT_ROUNDS,
} = require('../auth');
const bcrypt = require('bcrypt');
const options = require('../options');

const router = express.Router();

/**
 * POST /api/auth/register
 * Create a new user account
 * Body: { username: string, password: string, email?: string }
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({ error: 'Username must be 3-32 characters' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const db = getDb();

        // Check if username already exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
            if (existingEmail) {
                return res.status(409).json({ error: 'Email already registered' });
            }
        }

        const id = uuidv4();
        const passwordHash = await hashPassword(password);

        db.prepare(
            'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
        ).run(id, username, email || null, passwordHash);

        // Auto-login after registration
        const user = { id, username };
        const accessToken = generateAccessToken(user);
        const { token: refreshToken, expiresAt } = generateRefreshToken(user);

        // Store refresh token hash
        const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);
        db.prepare(
            'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
        ).run(uuidv4(), id, refreshTokenHash, expiresAt.toISOString());

        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: options.ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/api/auth',
        });

        res.status(201).json({
            user: { id, username, email: email || null },
            accessToken,
        });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/login
 * Login with username and password
 * Body: { username: string, password: string }
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const accessToken = generateAccessToken({ id: user.id, username: user.username });
        const { token: refreshToken, expiresAt } = generateRefreshToken({ id: user.id });

        // Store refresh token hash
        const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);
        db.prepare(
            'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
        ).run(uuidv4(), user.id, refreshTokenHash, expiresAt.toISOString());

        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: options.ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/api/auth',
        });

        res.json({
            user: { id: user.id, username: user.username, email: user.email },
            accessToken,
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh the access token using the refresh token cookie
 */
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        const decoded = verifyToken(refreshToken);
        if (!decoded || decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Verify refresh token exists in DB (not revoked)
        const storedTokens = db.prepare(
            'SELECT * FROM refresh_tokens WHERE user_id = ? AND expires_at > datetime(\'now\')'
        ).all(user.id);

        let tokenValid = false;
        for (const stored of storedTokens) {
            if (await bcrypt.compare(refreshToken, stored.token_hash)) {
                tokenValid = true;
                break;
            }
        }

        if (!tokenValid) {
            return res.status(401).json({ error: 'Refresh token revoked or expired' });
        }

        const accessToken = generateAccessToken({ id: user.id, username: user.username });

        res.json({
            user: { id: user.id, username: user.username, email: user.email },
            accessToken,
        });
    } catch (error) {
        console.error('[Auth] Refresh error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/auth/logout
 * Invalidate the refresh token
 */
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            const decoded = verifyToken(refreshToken);
            if (decoded) {
                const db = getDb();
                // Remove all refresh tokens for this user
                db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(decoded.userId);
            }
        }

        res.clearCookie('refreshToken', { path: '/api/auth' });
        res.json({ message: 'Logged out' });
    } catch (error) {
        console.error('[Auth] Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/auth/me
 * Get the current user's info
 */
router.get('/me', requireAuth, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
});

module.exports = router;
