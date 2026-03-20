/**
 * =============================================================================
 * WAM Jam Party - Routes des Sessions
 * =============================================================================
 * Ces routes gèrent la création, modification et suppression des sessions
 * dans les projets.
 * =============================================================================
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { getDatabase } = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
    requireProjectPermission,
    requireProjectOwner,
    getUserRole,
    hasPermission
} = require('../middleware/rbac');

const router = express.Router();

/**
 * GET /api/projects/:projectId/sessions
 * Liste les sessions d'un projet
 */
router.get('/:projectId/sessions', optionalAuth, (req, res) => {
    try {
        const db = getDatabase();
        const { projectId } = req.params;

        // Vérifie l'accès au projet
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Project not found'
            });
        }

        const userRole = req.user ? getUserRole(req.user.id, projectId) : null;

        // Si projet privé et pas de rôle, pas d'accès
        if (project.visibility === 'private' && !userRole) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Project not found'
            });
        }

        // Requête pour les sessions
        let sessions;
        if (userRole) {
            // Utilisateur avec accès : voit toutes les sessions
            sessions = db.prepare(`
                SELECT s.*, u.username as created_by_username
                FROM sessions s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.project_id = ?
                ORDER BY s.created_at DESC
            `).all(projectId);
        } else {
            // Anonyme sur projet public : ne voit que les sessions publiques
            sessions = db.prepare(`
                SELECT s.*, u.username as created_by_username
                FROM sessions s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.project_id = ? AND s.visibility = 'public'
                ORDER BY s.created_at DESC
            `).all(projectId);
        }

        res.json({
            sessions: sessions.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                visibility: s.visibility,
                maxParticipants: s.max_participants,
                status: s.status,
                createdByUsername: s.created_by_username,
                createdAt: s.created_at,
                updatedAt: s.updated_at
            }))
        });

    } catch (error) {
        console.error('List sessions error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching sessions'
        });
    }
});

/**
 * POST /api/projects/:projectId/sessions
 * Crée une nouvelle session dans un projet
 *
 * Body: { name, description?, visibility?, maxParticipants?, config? }
 */
router.post('/:projectId/sessions', authenticateToken, requireProjectPermission('create_session'), (req, res) => {
    try {
        const { name, description, visibility = 'private', maxParticipants = 0, config } = req.body;
        const { projectId } = req.params;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Session name is required'
            });
        }

        if (!['public', 'private'].includes(visibility)) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Visibility must be "public" or "private"'
            });
        }

        const db = getDatabase();
        const sessionId = uuidv4();
        const now = Date.now();

        db.prepare(`
            INSERT INTO sessions (id, name, description, project_id, created_by, visibility, max_participants, config_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            sessionId,
            name.trim(),
            description || null,
            projectId,
            req.user.id,
            visibility,
            maxParticipants,
            config ? JSON.stringify(config) : null,
            now,
            now
        );

        res.status(201).json({
            message: 'Session created successfully',
            session: {
                id: sessionId,
                name: name.trim(),
                description: description || null,
                visibility,
                maxParticipants,
                status: 'active',
                createdAt: now,
                updatedAt: now
            }
        });

    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while creating the session'
        });
    }
});

/**
 * GET /api/projects/:projectId/sessions/:sessionId
 * Récupère les détails d'une session
 */
router.get('/:projectId/sessions/:sessionId', optionalAuth, (req, res) => {
    try {
        const db = getDatabase();
        const { projectId, sessionId } = req.params;

        const session = db.prepare(`
            SELECT s.*, u.username as created_by_username,
                   p.visibility as project_visibility, p.owner_id as project_owner_id
            FROM sessions s
            LEFT JOIN users u ON s.created_by = u.id
            JOIN projects p ON s.project_id = p.id
            WHERE s.id = ? AND s.project_id = ?
        `).get(sessionId, projectId);

        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Vérifie l'accès
        const userRole = req.user ? getUserRole(req.user.id, projectId) : null;

        // Session privée dans projet privé sans accès
        if (session.project_visibility === 'private' && !userRole) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Session privée dans projet public sans accès
        if (session.visibility === 'private' && !userRole) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        res.json({
            session: {
                id: session.id,
                name: session.name,
                description: session.description,
                visibility: session.visibility,
                maxParticipants: session.max_participants,
                status: session.status,
                config: session.config_json ? JSON.parse(session.config_json) : null,
                createdByUsername: session.created_by_username,
                createdAt: session.created_at,
                updatedAt: session.updated_at,
                userRole
            }
        });

    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching the session'
        });
    }
});

/**
 * PATCH /api/projects/:projectId/sessions/:sessionId
 * Met à jour une session
 * Seul le propriétaire du projet peut renommer/modifier
 */
router.patch('/:projectId/sessions/:sessionId', authenticateToken, requireProjectOwner, (req, res) => {
    try {
        const { name, description, visibility, maxParticipants, status, config } = req.body;
        const { projectId, sessionId } = req.params;
        const db = getDatabase();

        // Vérifie que la session existe
        const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND project_id = ?')
            .get(sessionId, projectId);

        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        const updates = [];
        const values = [];

        if (name !== undefined) {
            if (name.trim().length === 0) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Session name cannot be empty'
                });
            }
            updates.push('name = ?');
            values.push(name.trim());
        }

        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description || null);
        }

        if (visibility !== undefined) {
            if (!['public', 'private'].includes(visibility)) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Visibility must be "public" or "private"'
                });
            }
            updates.push('visibility = ?');
            values.push(visibility);
        }

        if (maxParticipants !== undefined) {
            updates.push('max_participants = ?');
            values.push(maxParticipants);
        }

        if (status !== undefined) {
            if (!['active', 'archived'].includes(status)) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Status must be "active" or "archived"'
                });
            }
            updates.push('status = ?');
            values.push(status);
        }

        if (config !== undefined) {
            updates.push('config_json = ?');
            values.push(config ? JSON.stringify(config) : null);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(sessionId);

        db.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Récupère la session mise à jour
        const updatedSession = db.prepare(`
            SELECT s.*, u.username as created_by_username
            FROM sessions s
            LEFT JOIN users u ON s.created_by = u.id
            WHERE s.id = ?
        `).get(sessionId);

        res.json({
            message: 'Session updated successfully',
            session: {
                id: updatedSession.id,
                name: updatedSession.name,
                description: updatedSession.description,
                visibility: updatedSession.visibility,
                maxParticipants: updatedSession.max_participants,
                status: updatedSession.status,
                config: updatedSession.config_json ? JSON.parse(updatedSession.config_json) : null,
                createdByUsername: updatedSession.created_by_username
            }
        });

    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while updating the session'
        });
    }
});

/**
 * DELETE /api/projects/:projectId/sessions/:sessionId
 * Supprime une session
 * Seul le propriétaire du projet peut supprimer
 */
router.delete('/:projectId/sessions/:sessionId', authenticateToken, requireProjectOwner, (req, res) => {
    try {
        const { projectId, sessionId } = req.params;
        const db = getDatabase();

        const result = db.prepare('DELETE FROM sessions WHERE id = ? AND project_id = ?')
            .run(sessionId, projectId);

        if (result.changes === 0) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        res.json({
            message: 'Session deleted successfully'
        });

    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while deleting the session'
        });
    }
});

/**
 * POST /api/projects/:projectId/sessions/:sessionId/join
 * Enregistre qu'un utilisateur rejoint une session
 */
router.post('/:projectId/sessions/:sessionId/join', authenticateToken, (req, res) => {
    try {
        const { projectId, sessionId } = req.params;
        const db = getDatabase();

        // Vérifie l'accès au projet/session
        const session = db.prepare(`
            SELECT s.*, p.visibility as project_visibility
            FROM sessions s
            JOIN projects p ON s.project_id = p.id
            WHERE s.id = ? AND s.project_id = ?
        `).get(sessionId, projectId);

        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        const userRole = getUserRole(req.user.id, projectId);

        // Vérifie les permissions
        if (session.project_visibility === 'private' && !userRole) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this project'
            });
        }

        if (session.visibility === 'private' && !userRole) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'This session is private'
            });
        }

        if (session.status !== 'active') {
            return res.status(400).json({
                error: 'Bad request',
                message: 'This session is not active'
            });
        }

        // Vérifie le nombre max de participants
        if (session.max_participants > 0) {
            const activeCount = db.prepare(`
                SELECT COUNT(*) as count FROM session_participants
                WHERE session_id = ? AND left_at IS NULL
            `).get(sessionId).count;

            if (activeCount >= session.max_participants) {
                return res.status(403).json({
                    error: 'Session full',
                    message: 'This session has reached its maximum number of participants'
                });
            }
        }

        // Ferme une éventuelle participation existante
        db.prepare(`
            UPDATE session_participants
            SET left_at = ?
            WHERE session_id = ? AND user_id = ? AND left_at IS NULL
        `).run(Date.now(), sessionId, req.user.id);

        // Enregistre la nouvelle participation
        db.prepare(`
            INSERT INTO session_participants (id, session_id, user_id, joined_at)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), sessionId, req.user.id, Date.now());

        res.json({
            message: 'Joined session successfully',
            session: {
                id: session.id,
                name: session.name
            }
        });

    } catch (error) {
        console.error('Join session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while joining the session'
        });
    }
});

/**
 * POST /api/projects/:projectId/sessions/:sessionId/leave
 * Enregistre qu'un utilisateur quitte une session
 */
router.post('/:projectId/sessions/:sessionId/leave', authenticateToken, (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();

        db.prepare(`
            UPDATE session_participants
            SET left_at = ?
            WHERE session_id = ? AND user_id = ? AND left_at IS NULL
        `).run(Date.now(), sessionId, req.user.id);

        res.json({
            message: 'Left session successfully'
        });

    } catch (error) {
        console.error('Leave session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while leaving the session'
        });
    }
});

/**
 * GET /api/sessions/public
 * Liste toutes les sessions publiques (pour découverte)
 */
router.get('/public', (req, res) => {
    try {
        const db = getDatabase();

        const sessions = db.prepare(`
            SELECT s.*, p.name as project_name, u.username as created_by_username,
                   (SELECT COUNT(*) FROM session_participants sp
                    WHERE sp.session_id = s.id AND sp.left_at IS NULL) as active_participants
            FROM sessions s
            JOIN projects p ON s.project_id = p.id
            LEFT JOIN users u ON s.created_by = u.id
            WHERE s.visibility = 'public' AND s.status = 'active' AND p.visibility = 'public'
            ORDER BY active_participants DESC, s.created_at DESC
            LIMIT 50
        `).all();

        res.json({
            sessions: sessions.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                projectId: s.project_id,
                projectName: s.project_name,
                maxParticipants: s.max_participants,
                activeParticipants: s.active_participants,
                createdByUsername: s.created_by_username,
                createdAt: s.created_at
            }))
        });

    } catch (error) {
        console.error('List public sessions error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching public sessions'
        });
    }
});

module.exports = router;
