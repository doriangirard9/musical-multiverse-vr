const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../database');
const { requireAuth, optionalAuth } = require('../auth');

const router = express.Router();

/**
 * GET /api/sessions/public
 * List all public sessions with participant counts
 */
router.get('/public', (req, res) => {
    try {
        const db = getDb();
        const sessions = db.prepare(`
            SELECT s.id, s.name, s.is_public, s.is_locked, s.max_users, s.project_id, s.created_at,
                   p.name as project_name, u.username as owner_username,
                   (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id) as participant_count
            FROM sessions s
            JOIN projects p ON s.project_id = p.id
            JOIN users u ON p.owner_id = u.id
            WHERE s.is_public = 1
            ORDER BY participant_count DESC, s.created_at DESC
        `).all();
        res.json({ sessions });
    } catch (error) {
        console.error('[Sessions] List public error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/sessions/mine
 * List sessions the user owns or is authorized for
 */
router.get('/mine', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const sessions = db.prepare(`
            SELECT s.id, s.name, s.is_public, s.is_locked, s.max_users, s.project_id, s.created_at,
                   p.name as project_name, u.username as owner_username,
                   (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id) as participant_count
            FROM sessions s
            JOIN projects p ON s.project_id = p.id
            JOIN users u ON p.owner_id = u.id
            WHERE p.owner_id = ?
               OR s.id IN (SELECT session_id FROM authorized_users WHERE user_id = ?)
            ORDER BY s.updated_at DESC
        `).all(req.user.userId, req.user.userId);
        res.json({ sessions });
    } catch (error) {
        console.error('[Sessions] List mine error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/sessions/project/:projectId
 * List sessions in a project
 */
router.get('/project/:projectId', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (project.owner_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

        const sessions = db.prepare(`
            SELECT s.*,
                   (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id) as participant_count
            FROM sessions s WHERE s.project_id = ?
            ORDER BY s.created_at DESC
        `).all(req.params.projectId);
        res.json({ sessions });
    } catch (error) {
        console.error('[Sessions] List by project error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/sessions
 * Create a new session
 * Body: { projectId, name, isPublic?, maxUsers? }
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const { projectId, name, isPublic = true, maxUsers = 32 } = req.body;
        if (!projectId || !name) return res.status(400).json({ error: 'projectId and name required' });

        const db = getDb();
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (project.owner_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

        const id = uuidv4();
        const shareToken = crypto.randomBytes(16).toString('hex');

        db.prepare(`
            INSERT INTO sessions (id, project_id, name, is_public, max_users, share_token)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, projectId, name.trim(), isPublic ? 1 : 0, maxUsers, shareToken);

        const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
        res.status(201).json({ session });
    } catch (error) {
        console.error('[Sessions] Create error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/sessions/:id
 */
router.put('/:id', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare('SELECT s.*, p.owner_id FROM sessions s JOIN projects p ON s.project_id = p.id WHERE s.id = ?').get(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.owner_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

        const { name, isPublic, maxUsers, isLocked } = req.body;
        db.prepare(`
            UPDATE sessions SET
                name = COALESCE(?, name),
                is_public = COALESCE(?, is_public),
                is_locked = COALESCE(?, is_locked),
                max_users = COALESCE(?, max_users),
                updated_at = datetime('now')
            WHERE id = ?
        `).run(name || null, isPublic !== undefined ? (isPublic ? 1 : 0) : null, isLocked !== undefined ? (isLocked ? 1 : 0) : null, maxUsers || null, req.params.id);

        const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
        res.json({ session: updated });
    } catch (error) {
        console.error('[Sessions] Update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/sessions/:id
 */
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare('SELECT s.*, p.owner_id FROM sessions s JOIN projects p ON s.project_id = p.id WHERE s.id = ?').get(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.owner_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

        db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
        res.json({ message: 'Session deleted' });
    } catch (error) {
        console.error('[Sessions] Delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/sessions/:id/join
 * Join a session. Returns participantId, participantNumber, and crdtData if first.
 */
router.post('/:id/join', optionalAuth, (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare('SELECT s.*, p.owner_id FROM sessions s JOIN projects p ON s.project_id = p.id WHERE s.id = ?').get(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Access check for private sessions
        if (!session.is_public) {
            if (!req.user) return res.status(401).json({ error: 'Authentication required for private session' });
            const isOwner = session.owner_id === req.user.userId;
            const isAuthorized = db.prepare('SELECT 1 FROM authorized_users WHERE session_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
            // Also allow if share token is provided
            const shareToken = req.body.shareToken;
            const validShare = shareToken && session.share_token === shareToken;
            if (!isOwner && !isAuthorized && !validShare) {
                return res.status(403).json({ error: 'Not authorized for this private session' });
            }
            // If joined via share token, add to authorized_users
            if (validShare && !isOwner && !isAuthorized) {
                db.prepare('INSERT OR IGNORE INTO authorized_users (session_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.userId);
            }
        }

        // Check max users
        const currentCount = db.prepare('SELECT COUNT(*) as count FROM session_participants WHERE session_id = ?').get(req.params.id).count;
        if (currentCount >= session.max_users) {
            return res.status(409).json({ error: 'Session is full' });
        }

        // Create participant
        const participantId = uuidv4();
        const userId = req.user?.userId || null;

        db.prepare(`
            INSERT INTO session_participants (participant_id, session_id, user_id)
            VALUES (?, ?, ?)
        `).run(participantId, req.params.id, userId);

        // Count participants (after adding this one)
        const participantNumber = db.prepare('SELECT COUNT(*) as count FROM session_participants WHERE session_id = ?').get(req.params.id).count;

        const response = {
            participantId,
            participantNumber,
            sessionName: session.name,
            maxUsers: session.max_users,
            sessionLocked: session.is_locked ? true : false,
        };

        // If this is the first participant, send CRDT data
        if (participantNumber === 1 && session.crdt_data) {
            response.crdtData = session.crdt_data;
        }

        res.json(response);
    } catch (error) {
        console.error('[Sessions] Join error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/sessions/:id/heartbeat
 * Update heartbeat for a participant
 * Body: { participantId: string }
 */
router.post('/:id/heartbeat', (req, res) => {
    try {
        const { participantId } = req.body;
        if (!participantId) return res.status(400).json({ error: 'participantId required' });

        const db = getDb();
        const result = db.prepare(`
            UPDATE session_participants SET last_heartbeat = datetime('now')
            WHERE participant_id = ? AND session_id = ?
        `).run(participantId, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Participant not found' });
        }

        const count = db.prepare('SELECT COUNT(*) as count FROM session_participants WHERE session_id = ?').get(req.params.id).count;
        res.json({ participantCount: count });
    } catch (error) {
        console.error('[Sessions] Heartbeat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/sessions/:id/leave
 * Remove a participant from a session
 * Body: { participantId: string }
 */
router.post('/:id/leave', (req, res) => {
    try {
        const { participantId } = req.body;
        if (!participantId) return res.status(400).json({ error: 'participantId required' });

        const db = getDb();
        db.prepare('DELETE FROM session_participants WHERE participant_id = ? AND session_id = ?').run(participantId, req.params.id);
        res.json({ message: 'Left session' });
    } catch (error) {
        console.error('[Sessions] Leave error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/sessions/:id/save
 * Save CRDT data for a session (with data loss protection)
 * Body: { participantId: string, crdtData: string (JSON) }
 * Note: public-sandbox session does not persist to DB (Yjs-only state)
 */
router.post('/:id/save', (req, res) => {
    try {
        const { participantId, crdtData } = req.body;
        if (!participantId || !crdtData) return res.status(400).json({ error: 'participantId and crdtData required' });

        const db = getDb();

        // Verify participant exists
        const participant = db.prepare('SELECT * FROM session_participants WHERE participant_id = ? AND session_id = ?').get(participantId, req.params.id);
        if (!participant) return res.status(403).json({ error: 'Not a participant of this session' });

        // Special handling for public-sandbox: don't persist to DB
        if (req.params.id === 'public-sandbox') {
            return res.json({ message: 'Saved (public sandbox - not persisted to DB)' });
        }

        // Check if session is locked: don't persist to DB
        const sessionLock = db.prepare('SELECT is_locked FROM sessions WHERE id = ?').get(req.params.id);
        if (sessionLock?.is_locked) {
            return res.json({ message: 'Saved (session locked - not persisted to DB)' });
        }

        // Data loss protection
        const session = db.prepare('SELECT crdt_data FROM sessions WHERE id = ?').get(req.params.id);
        if (session?.crdt_data) {
            try {
                const oldData = JSON.parse(session.crdt_data);
                const newData = JSON.parse(crdtData);
                const oldNodeCount = oldData.nodes?.length || 0;
                const newNodeCount = newData.nodes?.length || 0;

                if (oldNodeCount > 5 && newNodeCount < oldNodeCount * 0.5) {
                    console.warn(`[Sessions] BLOCKED save for session ${req.params.id}: node count dropped from ${oldNodeCount} to ${newNodeCount}`);
                    return res.status(409).json({
                        error: 'Save blocked: significant data loss detected',
                        oldNodeCount,
                        newNodeCount,
                    });
                }
            } catch {
                // If parsing fails, allow save
            }
        }

        db.prepare(`UPDATE sessions SET crdt_data = ?, updated_at = datetime('now') WHERE id = ?`).run(crdtData, req.params.id);
        res.json({ message: 'Saved' });
    } catch (error) {
        console.error('[Sessions] Save error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/sessions/:id/share/username
 * Share a private session with a user by username
 * Body: { username: string }
 */
router.post('/:id/share/username', requireAuth, (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'username required' });

        const db = getDb();
        const session = db.prepare('SELECT s.*, p.owner_id FROM sessions s JOIN projects p ON s.project_id = p.id WHERE s.id = ?').get(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.owner_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

        const targetUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        db.prepare('INSERT OR IGNORE INTO authorized_users (session_id, user_id) VALUES (?, ?)').run(req.params.id, targetUser.id);
        res.json({ message: `Session shared with ${username}` });
    } catch (error) {
        console.error('[Sessions] Share error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/sessions/:id/share/link
 * Get the share link for a session
 */
router.get('/:id/share/link', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare('SELECT s.*, p.owner_id FROM sessions s JOIN projects p ON s.project_id = p.id WHERE s.id = ?').get(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.owner_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

        res.json({ shareToken: session.share_token });
    } catch (error) {
        console.error('[Sessions] Share link error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/sessions/join/:shareToken
 * Get session info from a share token
 */
router.get('/join/:shareToken', (req, res) => {
    try {
        const db = getDb();
        const session = db.prepare('SELECT id, name, is_public, max_users FROM sessions WHERE share_token = ?').get(req.params.shareToken);
        if (!session) return res.status(404).json({ error: 'Invalid share link' });
        res.json({ session });
    } catch (error) {
        console.error('[Sessions] Join by share error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/sessions/:id/participants
 * Get current participant count
 */
router.get('/:id/participants', (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare('SELECT COUNT(*) as count FROM session_participants WHERE session_id = ?').get(req.params.id);
        res.json({ participantCount: result.count });
    } catch (error) {
        console.error('[Sessions] Participants error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
