const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();

/**
 * GET /api/projects
 * List all projects owned by the current user
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const projects = db.prepare(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM sessions WHERE project_id = p.id) as session_count
            FROM projects p
            WHERE p.owner_id = ?
            ORDER BY p.updated_at DESC
        `).all(req.user.userId);

        res.json({ projects });
    } catch (error) {
        console.error('[Projects] List error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/projects
 * Create a new project
 * Body: { name: string, description?: string }
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const db = getDb();
        const id = uuidv4();

        db.prepare(
            'INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)'
        ).run(id, name.trim(), description || '', req.user.userId);

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        res.status(201).json({ project });
    } catch (error) {
        console.error('[Projects] Create error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/projects/:id
 * Update a project (name, description)
 */
router.put('/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const db = getDb();

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (project.owner_id !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        db.prepare(`
            UPDATE projects SET 
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                updated_at = datetime('now')
            WHERE id = ?
        `).run(name || null, description !== undefined ? description : null, id);

        const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        res.json({ project: updated });
    } catch (error) {
        console.error('[Projects] Update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/projects/:id
 * Delete a project and all its sessions
 */
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const db = getDb();

        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (project.owner_id !== req.user.userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        res.json({ message: 'Project deleted' });
    } catch (error) {
        console.error('[Projects] Delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
