/**
 * =============================================================================
 * WAM Jam Party - Middleware d'Authentification JWT
 * =============================================================================
 * Ce middleware vérifie le token JWT dans les requêtes et ajoute les
 * informations de l'utilisateur à l'objet req.
 * =============================================================================
 */

const jwt = require('jsonwebtoken');

// Clé secrète pour signer les tokens JWT
// En production, utiliser une variable d'environnement !
const JWT_SECRET = process.env.JWT_SECRET || 'wamjam-secret-key-change-in-production';

// Durée de validité des tokens
const ACCESS_TOKEN_EXPIRES = '15m';  // Token d'accès : 15 minutes
const REFRESH_TOKEN_EXPIRES = '7d';  // Token de rafraîchissement : 7 jours

/**
 * Middleware qui vérifie le token JWT
 * Si le token est valide, ajoute req.user avec les infos de l'utilisateur
 * Si le token est invalide ou absent, renvoie une erreur 401
 *
 * @usage
 * app.get('/protected', authenticateToken, (req, res) => {
 *     console.log(req.user); // { id: '...', username: '...' }
 * });
 */
function authenticateToken(req, res, next) {
    // Le token est envoyé dans le header Authorization
    // Format: "Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extrait le token après "Bearer "

    if (!token) {
        return res.status(401).json({
            error: 'Access denied',
            message: 'No authentication token provided'
        });
    }

    try {
        // Vérifie et décode le token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Ajoute les infos utilisateur à la requête
        req.user = {
            id: decoded.id,
            username: decoded.username,
            isGuest: decoded.isGuest || false
        };

        next(); // Continue vers le prochain middleware/route
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Your session has expired. Please refresh your token.'
            });
        }

        return res.status(403).json({
            error: 'Invalid token',
            message: 'The authentication token is invalid'
        });
    }
}

/**
 * Middleware optionnel qui vérifie le token s'il est présent
 * Mais ne bloque pas la requête s'il est absent
 * Utile pour les routes accessibles aux anonymes mais avec des
 * fonctionnalités supplémentaires pour les utilisateurs connectés
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = {
                id: decoded.id,
                username: decoded.username,
                isGuest: decoded.isGuest || false
            };
        } catch (error) {
            // Token invalide mais on continue quand même
            req.user = null;
        }
    } else {
        req.user = null;
    }

    next();
}

/**
 * Génère un token d'accès (courte durée)
 *
 * @param {Object} user - L'utilisateur { id, username, isGuest? }
 * @returns {string} Le token JWT
 */
function generateAccessToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, isGuest: user.isGuest || false },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
}

/**
 * Génère un token de rafraîchissement (longue durée)
 *
 * @param {Object} user - L'utilisateur { id, username, isGuest? }
 * @returns {string} Le token JWT
 */
function generateRefreshToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, isGuest: user.isGuest || false, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES }
    );
}

/**
 * Vérifie un token de rafraîchissement
 *
 * @param {string} token - Le token à vérifier
 * @returns {Object|null} Les données décodées ou null si invalide
 */
function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return null;
        }
        return decoded;
    } catch (error) {
        return null;
    }
}

module.exports = {
    authenticateToken,
    optionalAuth,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    JWT_SECRET,
    ACCESS_TOKEN_EXPIRES,
    REFRESH_TOKEN_EXPIRES
};
