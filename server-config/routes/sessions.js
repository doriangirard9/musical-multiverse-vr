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
const { getInstance: getSessionPersistenceService } = require('../services/SessionPersistenceService');

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
                WHERE session_id = ?
            `).get(sessionId).count;

            if (activeCount >= session.max_participants) {
                return res.status(403).json({
                    error: 'Session full',
                    message: 'This session has reached its maximum number of participants'
                });
            }
        }

        // Enregistre la participation (INSERT OR REPLACE pour éviter les doublons)
        db.prepare(`
            INSERT OR REPLACE INTO session_participants (session_id, user_id, joined_at)
            VALUES (?, ?, ?)
        `).run(sessionId, req.user.id, Date.now());

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
            DELETE FROM session_participants
            WHERE session_id = ? AND user_id = ?
        `).run(sessionId, req.user.id);

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
                    WHERE sp.session_id = s.id) as active_participants
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
                maxParticipants: s.max_participants || 32,
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

/**
 * POST /api/sessions/quick-create
 * Crée rapidement une session publique (crée aussi un projet public si nécessaire)
 *
 * Body: { name?, maxParticipants? }
 * Response: { session, project }
 */
router.post('/quick-create', authenticateToken, (req, res) => {
    try {
        const { name, maxParticipants = 32 } = req.body;
        const db = getDatabase();
        const now = Date.now();

        // Cherche ou crée un projet public pour cet utilisateur
        let project = db.prepare(`
            SELECT * FROM projects
            WHERE owner_id = ? AND visibility = 'public'
            ORDER BY created_at ASC
            LIMIT 1
        `).get(req.user.id);

        if (!project) {
            // Crée un projet public par défaut
            const projectId = uuidv4();
            db.prepare(`
                INSERT INTO projects (id, name, description, owner_id, visibility, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'public', ?, ?)
            `).run(
                projectId,
                `${req.user.username}'s Sessions`,
                'Auto-created public project',
                req.user.id,
                now,
                now
            );
            project = { id: projectId, name: `${req.user.username}'s Sessions` };
        }

        // Génère un nom de session si non fourni
        const sessionName = name || `Session ${new Date().toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })}`;

        // Crée la session
        const sessionId = uuidv4();
        db.prepare(`
            INSERT INTO sessions (id, name, project_id, created_by, visibility, max_participants, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'public', ?, 'active', ?, ?)
        `).run(sessionId, sessionName, project.id, req.user.id, maxParticipants, now, now);

        // Enregistre l'utilisateur comme participant
        db.prepare(`
            INSERT OR REPLACE INTO session_participants (session_id, user_id, joined_at)
            VALUES (?, ?, ?)
        `).run(sessionId, req.user.id, now);

        res.status(201).json({
            message: 'Session created successfully',
            session: {
                id: sessionId,
                name: sessionName,
                projectId: project.id,
                maxParticipants,
                activeParticipants: 1
            },
            project: {
                id: project.id,
                name: project.name
            }
        });

    } catch (error) {
        console.error('Quick create session error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while creating the session'
        });
    }
});

/**
 * POST /api/sessions/:sessionId/join
 * Rejoint une session publique directement (sans spécifier le projet)
 */
router.post('/:sessionId/join', authenticateToken, (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();

        // Récupère la session
        const session = db.prepare(`
            SELECT s.*, p.visibility as project_visibility
            FROM sessions s
            JOIN projects p ON s.project_id = p.id
            WHERE s.id = ?
        `).get(sessionId);

        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Vérifie que la session est publique et active
        if (session.visibility !== 'public' || session.project_visibility !== 'public') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'This session is not public'
            });
        }

        if (session.status !== 'active') {
            return res.status(400).json({
                error: 'Bad request',
                message: 'This session is not active'
            });
        }

        // Vérifie le nombre max de participants
        const maxParticipants = session.max_participants || 32;
        if (maxParticipants > 0) {
            const activeCount = db.prepare(`
                SELECT COUNT(*) as count FROM session_participants
                WHERE session_id = ?
            `).get(sessionId).count;

            if (activeCount >= maxParticipants) {
                return res.status(403).json({
                    error: 'Session full',
                    message: 'This session has reached its maximum number of participants'
                });
            }
        }

        // Enregistre la participation (INSERT OR REPLACE pour éviter les doublons)
        db.prepare(`
            INSERT OR REPLACE INTO session_participants (session_id, user_id, joined_at)
            VALUES (?, ?, ?)
        `).run(sessionId, req.user.id, Date.now());

        res.json({
            message: 'Joined session successfully',
            session: {
                id: session.id,
                name: session.name,
                projectId: session.project_id
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
 * POST /api/sessions/:sessionId/leave
 * Quitte une session publique directement (sans spécifier le projet)
 */
router.post('/:sessionId/leave', authenticateToken, (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();

        db.prepare(`
            DELETE FROM session_participants
            WHERE session_id = ? AND user_id = ?
        `).run(sessionId, req.user.id);

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
 * =============================================================================
 * ROUTES DE PERSISTANCE DE SESSIONS (Snapshots)
 * =============================================================================
 */

/**
 * POST /api/sessions/:sessionId/snapshot
 * Sauvegarde un snapshot de l'état de la session.
 * Cette route est appelée par le client de manière débounced (1-2s).
 */
router.post('/:sessionId/snapshot', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { snapshotData } = req.body;
        const db = getDatabase();

        // Vérifie que la session existe
        const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Vérifie que l'utilisateur est participant de la session
        const participant = db.prepare(`
            SELECT 1 FROM session_participants
            WHERE session_id = ? AND user_id = ?
        `).get(sessionId, req.user.id);

        if (!participant) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You are not a participant in this session'
            });
        }

        // Valide que snapshotData est fourni
        if (!snapshotData) {
            return res.status(400).json({
                error: 'Bad request',
                message: 'snapshotData is required'
            });
        }

        // Appelle le service de persistance (async, non-bloquant)
        const persistenceService = getSessionPersistenceService();
        const result = await persistenceService.saveSnapshot(sessionId, snapshotData, req.user.id);

        res.json({
            message: 'Snapshot saved successfully',
            snapshot: {
                id: result.id,
                version: result.version,
                compressed: result.compressed
            }
        });

    } catch (error) {
        console.error('Save snapshot error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while saving the snapshot'
        });
    }
});

/**
 * GET /api/sessions/:sessionId/snapshot
 * Charge le dernier snapshot d'une session.
 * Utilisé au démarrage pour restaurer l'état de la session.
 */
router.get('/:sessionId/snapshot', optionalAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();

        // Vérifie que la session existe
        const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Vérifie l'accès à la session
        const userRole = req.user ? getUserRole(req.user.id, session.project_id) : null;
        if (session.visibility === 'private' && !userRole && session.created_by !== (req.user?.id)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this session'
            });
        }

        // Charge le snapshot
        const persistenceService = getSessionPersistenceService();
        const snapshot = await persistenceService.loadSnapshot(sessionId);

        if (!snapshot) {
            return res.status(404).json({
                error: 'Not found',
                message: 'No snapshot available for this session'
            });
        }

        res.json({
            message: 'Snapshot loaded successfully',
            snapshot: {
                data: snapshot.data,
                version: snapshot.version,
                updatedAt: snapshot.updatedAt,
                updatedBy: snapshot.updatedBy
            }
        });

    } catch (error) {
        console.error('Load snapshot error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while loading the snapshot'
        });
    }
});

/**
 * GET /api/sessions/:sessionId/snapshots/history
 * Liste l'historique des snapshots d'une session.
 * Permet de voir les versions précédentes pour audit ou récupération.
 */
router.get('/:sessionId/snapshots/history', optionalAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        const db = getDatabase();

        // Vérifie que la session existe
        const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Vérifie l'accès à la session (seulement créateur et admins)
        if (session.created_by !== (req.user?.id)) {
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.project_id);
            if (project.owner_id !== (req.user?.id)) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'You do not have access to session history'
                });
            }
        }

        // Liste l'historique
        const persistenceService = getSessionPersistenceService();
        const history = await persistenceService.listSnapshotHistory(
            sessionId,
            Math.min(parseInt(limit), 100), // Max 100 par requête
            Math.max(0, parseInt(offset))
        );

        res.json({
            message: 'Snapshot history retrieved successfully',
            history,
            pagination: {
                limit: Math.min(parseInt(limit), 100),
                offset: Math.max(0, parseInt(offset))
            }
        });

    } catch (error) {
        console.error('List snapshot history error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while listing snapshot history'
        });
    }
});

/**
 * GET /api/sessions/:sessionId/snapshots/history/:version
 * Charge un snapshot spécifique de l'historique.
 */
router.get('/:sessionId/snapshots/history/:version', optionalAuth, async (req, res) => {
    try {
        const { sessionId, version } = req.params;
        const db = getDatabase();

        // Vérifie que la session existe
        const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Session not found'
            });
        }

        // Vérifie l'accès
        if (session.created_by !== (req.user?.id)) {
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.project_id);
            if (project.owner_id !== (req.user?.id)) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'You do not have access to session history'
                });
            }
        }

        // Charge le snapshot de l'historique
        const persistenceService = getSessionPersistenceService();
        const snapshot = await persistenceService.loadSnapshotHistory(sessionId, parseInt(version));

        if (!snapshot) {
            return res.status(404).json({
                error: 'Not found',
                message: `No snapshot found for version ${version}`
            });
        }

        res.json({
            message: 'Snapshot version loaded successfully',
            snapshot: {
                data: snapshot.data,
                version: snapshot.version,
                createdAt: snapshot.createdAt,
                savedBy: snapshot.savedBy
            }
        });

    } catch (error) {
        console.error('Load snapshot version error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while loading the snapshot version'
        });
    }
});

module.exports = router;
