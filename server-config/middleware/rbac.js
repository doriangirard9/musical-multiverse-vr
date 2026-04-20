/**
 * =============================================================================
 * WAM Jam Party - Middleware RBAC (Role-Based Access Control)
 * =============================================================================
 * Ce middleware gère les permissions basées sur les rôles pour les projets.
 * Il vérifie si l'utilisateur a le droit d'effectuer une action sur un projet.
 * =============================================================================
 */

const { getDatabase } = require('../database/db');

function parseMembers(value) {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Définition des rôles et leurs permissions
 * Chaque rôle a un niveau numérique : plus le nombre est élevé, plus de permissions
 */
const ROLES = {
    viewer: {
        level: 1,
        permissions: ['view_project', 'join_session']
    },
    editor: {
        level: 2,
        permissions: ['view_project', 'join_session', 'create_session', 'edit_session']
    },
    admin: {
        level: 3,
        permissions: ['view_project', 'join_session', 'create_session', 'edit_session', 'manage_members']
    },
    owner: {
        level: 4,
        permissions: ['view_project', 'join_session', 'create_session', 'edit_session', 'manage_members', 'delete_project', 'rename_project', 'delete_session']
    }
};

/**
 * Récupère le rôle d'un utilisateur dans un projet
 *
 * @param {string} userId - ID de l'utilisateur
 * @param {string} projectId - ID du projet
 * @returns {string|null} Le rôle ('owner', 'admin', 'editor', 'viewer') ou null
 */
function getUserRole(userId, projectId) {
    const db = getDatabase();

    // Vérifie d'abord si l'utilisateur est le propriétaire
    const projectStmt = db.prepare('SELECT owner_id, visibility, members_json FROM projects WHERE id = ?');
    const project = projectStmt.get(projectId);

    if (!project) {
        return null; // Projet non trouvé
    }

    if (project.owner_id === userId) {
        return 'owner';
    }

    // Sinon, cherche dans la table des membres
    const membership = parseMembers(project.members_json)
        .find(m => String(m.userId) === String(userId) && m.status === 'accepted');

    if (membership) {
        return membership.role;
    }

    // Vérifie si le projet est public (lecture seule pour tous)
    if (project.visibility === 'public') {
        return 'viewer'; // Accès en lecture seule aux projets publics
    }

    return null; // Pas d'accès
}

/**
 * Vérifie si un rôle a une permission donnée
 *
 * @param {string} role - Le rôle à vérifier
 * @param {string} permission - La permission requise
 * @returns {boolean}
 */
function hasPermission(role, permission) {
    if (!role || !ROLES[role]) {
        return false;
    }
    return ROLES[role].permissions.includes(permission);
}

/**
 * Middleware factory pour vérifier les permissions sur un projet
 * Le projet_id doit être dans req.params.projectId
 *
 * @param {string} requiredPermission - La permission requise
 * @returns {Function} Middleware Express
 *
 * @usage
 * app.delete('/projects/:projectId',
 *     authenticateToken,
 *     requireProjectPermission('delete_project'),
 *     deleteProjectHandler
 * );
 */
function requireProjectPermission(requiredPermission) {
    return (req, res, next) => {
        const userId = req.user?.id;
        const projectId = req.params.projectId;

        if (!userId) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'You must be logged in to perform this action'
            });
        }

        if (!projectId) {
            return res.status(400).json({
                error: 'Bad request',
                message: 'Project ID is required'
            });
        }

        const role = getUserRole(userId, projectId);

        if (!role) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Project not found or you do not have access'
            });
        }

        if (!hasPermission(role, requiredPermission)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `You do not have permission to ${requiredPermission.replace('_', ' ')}`
            });
        }

        // Ajoute le rôle à la requête pour utilisation ultérieure
        req.projectRole = role;
        next();
    };
}

/**
 * Middleware pour vérifier qu'on est propriétaire du projet
 * Raccourci pour les opérations sensibles
 */
function requireProjectOwner(req, res, next) {
    const userId = req.user?.id;
    const projectId = req.params.projectId;

    if (!userId) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'You must be logged in to perform this action'
        });
    }

    const db = getDatabase();
    const stmt = db.prepare('SELECT owner_id FROM projects WHERE id = ?');
    const project = stmt.get(projectId);

    if (!project) {
        return res.status(404).json({
            error: 'Not found',
            message: 'Project not found'
        });
    }

    if (project.owner_id !== userId) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only the project owner can perform this action'
        });
    }

    req.projectRole = 'owner';
    next();
}

/**
 * Récupère les détails du projet avec le rôle de l'utilisateur
 *
 * @param {string} projectId - ID du projet
 * @param {string|null} userId - ID de l'utilisateur (ou null pour anonyme)
 * @returns {Object|null} Les détails du projet avec le rôle
 */
function getProjectWithRole(projectId, userId) {
    const db = getDatabase();

    const stmt = db.prepare(`
        SELECT p.*, u.username as owner_username
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        WHERE p.id = ?
    `);
    const project = stmt.get(projectId);

    if (!project) {
        return null;
    }

    // Détermine le rôle de l'utilisateur
    let userRole = null;
    if (userId) {
        userRole = getUserRole(userId, projectId);
    } else if (project.visibility === 'public') {
        userRole = 'viewer';
    }

    return {
        ...project,
        userRole
    };
}

module.exports = {
    ROLES,
    getUserRole,
    hasPermission,
    requireProjectPermission,
    requireProjectOwner,
    getProjectWithRole
};
