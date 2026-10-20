const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();

/**
 * GET /api/notifications
 * List pending notifications for the authenticated user
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const notifications = db.prepare(`
            SELECT n.id, n.type, n.status, n.created_at,
                   n.session_id, s.name as session_name,
                   u.username as from_username
            FROM notifications n
            JOIN sessions s ON n.session_id = s.id
            JOIN users u ON n.from_user_id = u.id
            WHERE n.user_id = ? AND n.status = 'pending'
            ORDER BY n.created_at DESC
        `).all(req.user.userId);
        res.json({ notifications });
    } catch (error) {
        console.error('[Notifications] List error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/notifications/count
 * Get count of pending notifications (for the badge)
 */
router.get('/count', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const result = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND status = 'pending'").get(req.user.userId);
        res.json({ count: result.count });
    } catch (error) {
        console.error('[Notifications] Count error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/notifications/:id/accept
 * Accept an invitation notification — adds the user to authorized_users
 */
router.post('/:id/accept', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const notification = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        if (notification.status !== 'pending') return res.status(400).json({ error: 'Notification already processed' });

        db.exec('BEGIN');
        try {
            db.prepare("UPDATE notifications SET status = 'accepted' WHERE id = ? AND status = 'pending'").run(req.params.id);
            db.prepare('INSERT OR IGNORE INTO authorized_users (session_id, user_id) VALUES (?, ?)').run(notification.session_id, req.user.userId);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }

        res.json({ message: 'Invitation accepted' });
    } catch (error) {
        console.error('[Notifications] Accept error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/notifications/:id/decline
 * Decline an invitation notification
 */
router.post('/:id/decline', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const notification = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        if (notification.status !== 'pending') return res.status(400).json({ error: 'Notification already processed' });

        db.prepare("UPDATE notifications SET status = 'declined' WHERE id = ?").run(req.params.id);

        res.json({ message: 'Invitation declined' });
    } catch (error) {
        console.error('[Notifications] Decline error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
