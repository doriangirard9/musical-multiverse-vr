/**
 * =============================================================================
 * WAM Jam Party - Routes d'Authentification
 * =============================================================================
 * Ces routes gèrent l'inscription, la connexion et la gestion des tokens.
 * =============================================================================
 */

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { getDatabase } = require('../database/db');
const {
    authenticateToken,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} = require('../middleware/auth');

const router = express.Router();

// Nombre de "rounds" pour le hash bcrypt (plus = plus sécurisé mais plus lent)
const BCRYPT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 *
 * Body: { username, password, email?, displayName? }
 * Response: { user, accessToken, refreshToken }
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password, email, displayName } = req.body;

        // Validation des champs requis
        if (!username || !password) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Username and password are required'
            });
        }

        // Validation du format username (alphanumérique + underscore, 3-30 chars)
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores'
            });
        }

        // Validation du mot de passe (minimum 6 caractères)
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Password must be at least 6 characters long'
            });
        }

        const db = getDatabase();

        // Vérifie si le username existe déjà
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existingUser) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'Username already exists'
            });
        }

        // Vérifie si l'email existe déjà (si fourni)
        if (email) {
            const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
            if (existingEmail) {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'Email already registered'
                });
            }
        }

        // Hash du mot de passe avec bcrypt
        // bcrypt ajoute automatiquement un "salt" (valeur aléatoire) pour
        // que deux mots de passe identiques aient des hash différents
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Création de l'utilisateur
        const userId = uuidv4();
        const now = Date.now();

        const insertStmt = db.prepare(`
            INSERT INTO users (id, username, password_hash, email, display_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
            userId,
            username,
            passwordHash,
            email || null,
            displayName || username,
            now,
            now
        );

        // Génération des tokens
        const user = { id: userId, username };
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Stockage du refresh token (hash pour sécurité)
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 jours

        db.prepare(`
            INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(tokenHash, userId, expiresAt);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: userId,
                username,
                displayName: displayName || username,
                email: email || null
            },
            accessToken,
            refreshToken
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred during registration'
        });
    }
});

/**
 * POST /api/auth/login
 * Connexion d'un utilisateur existant
 *
 * Body: { username, password }
 * Response: { user, accessToken, refreshToken }
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Username and password are required'
            });
        }

        const db = getDatabase();

        // Recherche de l'utilisateur
        const user = db.prepare(`
            SELECT id, username, password_hash, display_name, email
            FROM users WHERE username = ?
        `).get(username);

        if (!user) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid username or password'
            });
        }

        // Vérification du mot de passe avec bcrypt
        // bcrypt.compare extrait le salt du hash stocké et compare
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid username or password'
            });
        }

        // Mise à jour de la date de dernière connexion
        db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
            .run(Date.now(), user.id);

        // Génération des tokens
        const tokenUser = { id: user.id, username: user.username };
        const accessToken = generateAccessToken(tokenUser);
        const refreshToken = generateRefreshToken(tokenUser);

        // Stockage du refresh token
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);

        db.prepare(`
            INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(tokenHash, user.id, expiresAt);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                email: user.email
            },
            accessToken,
            refreshToken
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred during login'
        });
    }
});

/**
 * POST /api/auth/refresh
 * Obtient un nouveau access token avec le refresh token
 *
 * Body: { refreshToken }
 * Response: { accessToken, refreshToken }
 */
router.post('/refresh', (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Refresh token is required'
            });
        }

        // Vérifie le token JWT
        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Refresh token is invalid or expired'
            });
        }

        const db = getDatabase();

        // Vérifie que le token existe en base et n'est pas expiré
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const storedToken = db.prepare(`
            SELECT * FROM refresh_tokens
            WHERE token_hash = ? AND user_id = ? AND expires_at > ?
        `).get(tokenHash, decoded.id, Date.now());

        if (!storedToken) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Refresh token not found or expired'
            });
        }

        // Supprime l'ancien token (rotation des tokens pour plus de sécurité)
        db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);

        // Génère de nouveaux tokens
        const user = { id: decoded.id, username: decoded.username };
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Stocke le nouveau refresh token
        const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);

        db.prepare(`
            INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(newTokenHash, decoded.id, expiresAt);

        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while refreshing token'
        });
    }
});

/**
 * POST /api/auth/logout
 * Déconnexion (révoque le refresh token)
 *
 * Body: { refreshToken }
 */
router.post('/logout', (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            const db = getDatabase();
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
        }

        res.json({ message: 'Logged out successfully' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred during logout'
        });
    }
});

/**
 * POST /api/auth/guest
 * Crée un compte invité temporaire (pas de mot de passe requis)
 *
 * Response: { user, accessToken, refreshToken }
 */
router.post('/guest', async (req, res) => {
    try {
        const db = getDatabase();

        // Génère un nom d'utilisateur invité unique
        const guestNumber = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        const username = `Guest_${guestNumber}`;
        const userId = uuidv4();
        const now = Date.now();

        // Création de l'utilisateur invité (sans mot de passe)
        const insertStmt = db.prepare(`
            INSERT INTO users (id, username, password_hash, display_name, created_at, updated_at, is_guest)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
            userId,
            username,
            null, // Pas de mot de passe pour les invités
            username,
            now,
            now,
            1 // is_guest = true
        );

        // Génération des tokens
        const user = { id: userId, username, isGuest: true };
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Stockage du refresh token
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 jours

        db.prepare(`
            INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(tokenHash, userId, expiresAt);

        res.status(201).json({
            message: 'Guest account created successfully',
            user: {
                id: userId,
                username,
                displayName: username,
                email: null,
                isGuest: true
            },
            accessToken,
            refreshToken
        });

    } catch (error) {
        console.error('Guest registration error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred during guest registration'
        });
    }
});

/**
 * POST /api/auth/convert-guest
 * Convertit un compte invité en compte permanent
 * Permet de sauvegarder le travail en cours
 *
 * Headers: Authorization: Bearer <token>
 * Body: { username, password, email? }
 * Response: { user, accessToken, refreshToken }
 */
router.post('/convert-guest', authenticateToken, async (req, res) => {
    try {
        const { username, password, email } = req.body;

        // Vérifier que l'utilisateur est un invité
        if (!req.user.isGuest) {
            return res.status(400).json({
                error: 'Bad request',
                message: 'This account is not a guest account'
            });
        }

        // Validation des champs requis
        if (!username || !password) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Username and password are required'
            });
        }

        // Validation du format username
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores'
            });
        }

        // Validation du mot de passe
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Password must be at least 6 characters long'
            });
        }

        const db = getDatabase();

        // Vérifie si le username existe déjà (autre que l'utilisateur actuel)
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
        if (existingUser) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'Username already exists'
            });
        }

        // Vérifie si l'email existe déjà (si fourni)
        if (email) {
            const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
            if (existingEmail) {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'Email already registered'
                });
            }
        }

        // Hash du mot de passe
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const now = Date.now();

        // Mise à jour de l'utilisateur invité vers un compte permanent
        db.prepare(`
            UPDATE users
            SET username = ?, password_hash = ?, email = ?, display_name = ?, is_guest = 0, updated_at = ?
            WHERE id = ?
        `).run(username, passwordHash, email || null, username, now, req.user.id);

        // Révoque les anciens tokens
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);

        // Génère de nouveaux tokens (sans isGuest)
        const user = { id: req.user.id, username, isGuest: false };
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Stocke le nouveau refresh token
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);

        db.prepare(`
            INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(tokenHash, req.user.id, expiresAt);

        res.json({
            message: 'Account converted successfully',
            user: {
                id: req.user.id,
                username,
                displayName: username,
                email: email || null,
                isGuest: false
            },
            accessToken,
            refreshToken
        });

    } catch (error) {
        console.error('Convert guest error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while converting the account'
        });
    }
});

/**
 * GET /api/auth/me
 * Récupère les informations de l'utilisateur connecté
 *
 * Headers: Authorization: Bearer <token>
 * Response: { user }
 */
router.get('/me', authenticateToken, (req, res) => {
    try {
        const db = getDatabase();

        const user = db.prepare(`
            SELECT id, username, display_name, email, created_at, last_login_at
            FROM users WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({
                error: 'Not found',
                message: 'User not found'
            });
        }

        res.json({
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                email: user.email,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching user data'
        });
    }
});

/**
 * PATCH /api/auth/me
 * Met à jour le profil de l'utilisateur connecté
 *
 * Body: { displayName?, email?, currentPassword?, newPassword? }
 */
router.patch('/me', authenticateToken, async (req, res) => {
    try {
        const { displayName, email, currentPassword, newPassword } = req.body;
        const db = getDatabase();

        // Si changement de mot de passe, vérifie l'ancien
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Current password is required to change password'
                });
            }

            const user = db.prepare('SELECT password_hash FROM users WHERE id = ?')
                .get(req.user.id);

            const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({
                    error: 'Authentication failed',
                    message: 'Current password is incorrect'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'New password must be at least 6 characters long'
                });
            }
        }

        // Construction de la requête de mise à jour dynamique
        const updates = [];
        const values = [];

        if (displayName !== undefined) {
            updates.push('display_name = ?');
            values.push(displayName);
        }

        if (email !== undefined) {
            // Vérifie que l'email n'est pas déjà utilisé
            if (email) {
                const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
                    .get(email, req.user.id);
                if (existing) {
                    return res.status(409).json({
                        error: 'Conflict',
                        message: 'Email already in use'
                    });
                }
            }
            updates.push('email = ?');
            values.push(email || null);
        }

        if (newPassword) {
            const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
            updates.push('password_hash = ?');
            values.push(passwordHash);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(req.user.id);

        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Récupère les données mises à jour
        const updatedUser = db.prepare(`
            SELECT id, username, display_name, email, created_at
            FROM users WHERE id = ?
        `).get(req.user.id);

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                displayName: updatedUser.display_name,
                email: updatedUser.email
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while updating profile'
        });
    }
});

module.exports = router;
