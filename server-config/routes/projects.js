/**
 * =============================================================================
 * WAM Jam Party - Routes des Projets
 * =============================================================================
 * Ces routes gèrent la création, modification et suppression des projets,
 * ainsi que la gestion des membres (invitations, rôles).
 * =============================================================================
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { getDatabase, transaction } = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
    requireProjectPermission,
    requireProjectOwner,
    getUserRole,
    getProjectWithRole
} = require('../middleware/rbac');

const router = express.Router();

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
 * GET /api/projects
 * Liste les projets accessibles par l'utilisateur
 * - Ses propres projets
 * - Les projets où il est membre
 * - Les projets publics (si demandé)
 *
 * Query: ?includePublic=true
 */
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = getDatabase();
        const userId = req.user?.id;
        const includePublic = req.query.includePublic === 'true';

        let projects = [];

        if (userId) {
            const allProjects = db.prepare(`
                SELECT p.*, u.username as owner_username
                FROM projects p
                JOIN users u ON p.owner_id = u.id
                ORDER BY p.updated_at DESC
            `).all();

            projects = allProjects
                .map((p) => {
                    if (p.owner_id === userId) {
                        return { ...p, user_role: 'owner' };
                    }
                    const membership = parseMembers(p.members_json)
                        .find(m => String(m.userId) === String(userId) && m.status === 'accepted');
                    return membership ? { ...p, user_role: membership.role } : null;
                })
                .filter(Boolean);
        }

        // Projets publics
        if (includePublic) {
            const existingIds = new Set(projects.map(p => p.id));

            const publicProjects = db.prepare(`
                SELECT p.*, u.username as owner_username, 'viewer' as user_role
                FROM projects p
                JOIN users u ON p.owner_id = u.id
                WHERE p.visibility = 'public'
                ORDER BY p.updated_at DESC
            `).all();

            // Ajoute seulement ceux qu'on n'a pas déjà
            for (const p of publicProjects) {
                if (!existingIds.has(p.id)) {
                    projects.push(p);
                }
            }
        }

        res.json({
            projects: projects.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                visibility: p.visibility,
                ownerUsername: p.owner_username,
                userRole: p.user_role,
                createdAt: p.created_at,
                updatedAt: p.updated_at
            }))
        });

    } catch (error) {
        console.error('List projects error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching projects'
        });
    }
});

/**
 * POST /api/projects
 * Crée un nouveau projet
 *
 * Body: { name, description?, visibility? }
 */
router.post('/', authenticateToken, (req, res) => {
    try {
        const { name, description, visibility = 'private' } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Project name is required'
            });
        }

        if (!['public', 'private'].includes(visibility)) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Visibility must be "public" or "private"'
            });
        }

        const db = getDatabase();
        const projectId = uuidv4();
        const now = Date.now();

        db.prepare(`
            INSERT INTO projects (id, name, description, owner_id, visibility, members_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(projectId, name.trim(), description || null, req.user.id, visibility, '[]', now, now);

        res.status(201).json({
            message: 'Project created successfully',
            project: {
                id: projectId,
                name: name.trim(),
                description: description || null,
                visibility,
                userRole: 'owner',
                createdAt: now,
                updatedAt: now
            }
        });

    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while creating the project'
        });
    }
});

/**
 * GET /api/projects/:projectId
 * Récupère les détails d'un projet
 */
router.get('/:projectId', optionalAuth, (req, res) => {
    try {
        const project = getProjectWithRole(req.params.projectId, req.user?.id);

        if (!project) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Project not found'
            });
        }

        // Si le projet est privé et l'utilisateur n'a pas de rôle
        if (project.visibility === 'private' && !project.userRole) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Project not found'
            });
        }

        res.json({
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                visibility: project.visibility,
                ownerUsername: project.owner_username,
                userRole: project.userRole,
                createdAt: project.created_at,
                updatedAt: project.updated_at
            }
        });

    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching the project'
        });
    }
});

/**
 * PATCH /api/projects/:projectId
 * Met à jour un projet (nom, description, visibilité)
 * Seul le propriétaire peut renommer le projet
 */
router.patch('/:projectId', authenticateToken, requireProjectOwner, (req, res) => {
    try {
        const { name, description, visibility } = req.body;
        const db = getDatabase();

        const updates = [];
        const values = [];

        if (name !== undefined) {
            if (name.trim().length === 0) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Project name cannot be empty'
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

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'No fields to update'
            });
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(req.params.projectId);

        db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Récupère le projet mis à jour
        const project = getProjectWithRole(req.params.projectId, req.user.id);

        res.json({
            message: 'Project updated successfully',
            project: {
                id: project.id,
                name: project.name,
                description: project.description,
                visibility: project.visibility,
                userRole: project.userRole
            }
        });

    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while updating the project'
        });
    }
});

/**
 * DELETE /api/projects/:projectId
 * Supprime un projet et toutes ses sessions
 * Seul le propriétaire peut supprimer le projet
 */
router.delete('/:projectId', authenticateToken, requireProjectOwner, (req, res) => {
    try {
        const db = getDatabase();

        // Les CASCADE dans le schéma SQL suppriment automatiquement
        // les sessions et les membres associés
        db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);

        res.json({
            message: 'Project deleted successfully'
        });

    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while deleting the project'
        });
    }
});

// =============================================================================
// GESTION DES MEMBRES
// =============================================================================

/**
 * GET /api/projects/:projectId/members
 * Liste les membres d'un projet
 */
router.get('/:projectId/members', authenticateToken, requireProjectPermission('view_project'), (req, res) => {
    try {
        const db = getDatabase();

        // Le propriétaire
        const project = db.prepare(`
            SELECT p.owner_id, u.username, u.display_name
            FROM projects p
            JOIN users u ON p.owner_id = u.id
            WHERE p.id = ?
        `).get(req.params.projectId);

        const projectRow = db.prepare('SELECT members_json FROM projects WHERE id = ?').get(req.params.projectId);
        const members = parseMembers(projectRow?.members_json)
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
            .map((m) => {
                const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(m.userId);
                const invitedByUser = m.invitedBy
                    ? db.prepare('SELECT username FROM users WHERE id = ?').get(m.invitedBy)
                    : null;
                return {
                    user_id: m.userId,
                    username: user?.username || null,
                    display_name: user?.display_name || null,
                    role: m.role,
                    status: m.status,
                    invited_by_username: invitedByUser?.username || null,
                    created_at: m.createdAt
                };
            });

        res.json({
            owner: {
                id: project.owner_id,
                username: project.username,
                displayName: project.display_name,
                role: 'owner'
            },
            members: members.map(m => ({
                id: m.user_id,
                username: m.username,
                displayName: m.display_name,
                role: m.role,
                status: m.status,
                invitedBy: m.invited_by_username,
                createdAt: m.created_at
            }))
        });

    } catch (error) {
        console.error('List members error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching members'
        });
    }
});

/**
 * POST /api/projects/:projectId/members
 * Invite un utilisateur dans le projet
 * Seul le propriétaire ou admin peut inviter
 *
 * Body: { username, role }
 */
router.post('/:projectId/members', authenticateToken, requireProjectPermission('manage_members'), (req, res) => {
    try {
        const { username, role = 'viewer' } = req.body;

        if (!username) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Username is required'
            });
        }

        if (!['admin', 'editor', 'viewer'].includes(role)) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Role must be "admin", "editor", or "viewer"'
            });
        }

        const db = getDatabase();

        // Trouve l'utilisateur à inviter
        const userToInvite = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (!userToInvite) {
            return res.status(404).json({
                error: 'Not found',
                message: 'User not found'
            });
        }

        // Vérifie qu'il n'est pas déjà membre ou propriétaire
        const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.projectId);
        if (project.owner_id === userToInvite.id) {
            return res.status(400).json({
                error: 'Bad request',
                message: 'Cannot invite the project owner'
            });
        }

        const projectWithMembers = db.prepare('SELECT members_json FROM projects WHERE id = ?')
            .get(req.params.projectId);
        const members = parseMembers(projectWithMembers?.members_json);
        const existingMembership = members.find(m => String(m.userId) === String(userToInvite.id));

        if (existingMembership) {
            if (existingMembership.status === 'accepted') {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'User is already a member'
                });
            }
            existingMembership.role = role;
            existingMembership.status = 'pending';
            existingMembership.invitedBy = req.user.id;
            existingMembership.updatedAt = Date.now();
        } else {
            const now = Date.now();
            members.push({
                userId: userToInvite.id,
                role,
                status: 'pending',
                invitedBy: req.user.id,
                createdAt: now,
                updatedAt: now
            });
        }

        db.prepare(`
            UPDATE projects
            SET members_json = ?, updated_at = ?
            WHERE id = ?
        `).run(JSON.stringify(members), Date.now(), req.params.projectId);

        res.status(201).json({
            message: 'Invitation sent successfully'
        });

    } catch (error) {
        console.error('Invite member error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while sending invitation'
        });
    }
});

/**
 * PATCH /api/projects/:projectId/members/:userId
 * Met à jour le rôle d'un membre ou accepte/refuse une invitation
 *
 * Body: { role?, status? }
 */
router.patch('/:projectId/members/:userId', authenticateToken, (req, res) => {
    try {
        const { role, status } = req.body;
        const { projectId, userId } = req.params;
        const db = getDatabase();
        const projectRow = db.prepare('SELECT members_json FROM projects WHERE id = ?').get(projectId);
        const members = parseMembers(projectRow?.members_json);

        // Cas 1: L'utilisateur accepte/refuse sa propre invitation
        if (userId === req.user.id && status) {
            if (!['accepted', 'declined'].includes(status)) {
                return res.status(400).json({
                    error: 'Validation error',
                    message: 'Status must be "accepted" or "declined"'
                });
            }

            const membership = members.find(m => String(m.userId) === String(userId) && m.status === 'pending');
            if (!membership) {
                return res.status(404).json({
                    error: 'Not found',
                    message: 'No pending invitation found'
                });
            }
            membership.status = status;
            membership.updatedAt = Date.now();
            db.prepare(`
                UPDATE projects
                SET members_json = ?, updated_at = ?
                WHERE id = ?
            `).run(JSON.stringify(members), Date.now(), projectId);

            return res.json({
                message: `Invitation ${status}`
            });
        }

        // Cas 2: Modification du rôle par un admin/owner
        const currentUserRole = getUserRole(req.user.id, projectId);
        if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to modify members'
            });
        }

        if (role && !['admin', 'editor', 'viewer'].includes(role)) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'Role must be "admin", "editor", or "viewer"'
            });
        }

        if (!role && !(status && ['accepted', 'declined'].includes(status))) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'No valid fields to update'
            });
        }

        const membership = members.find(m => String(m.userId) === String(userId));
        if (!membership) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Member not found'
            });
        }
        if (role) {
            membership.role = role;
        }
        if (status && ['accepted', 'declined'].includes(status)) {
            membership.status = status;
        }
        membership.updatedAt = Date.now();
        db.prepare(`
            UPDATE projects
            SET members_json = ?, updated_at = ?
            WHERE id = ?
        `).run(JSON.stringify(members), Date.now(), projectId);

        res.json({
            message: 'Member updated successfully'
        });

    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while updating member'
        });
    }
});

/**
 * DELETE /api/projects/:projectId/members/:userId
 * Retire un membre du projet
 */
router.delete('/:projectId/members/:userId', authenticateToken, (req, res) => {
    try {
        const { projectId, userId } = req.params;
        const db = getDatabase();
        const projectRow = db.prepare('SELECT members_json FROM projects WHERE id = ?').get(projectId);
        const members = parseMembers(projectRow?.members_json);
        const filteredMembers = members.filter(m => String(m.userId) !== String(userId));

        // L'utilisateur peut se retirer lui-même
        if (userId === req.user.id) {
            db.prepare(`
                UPDATE projects
                SET members_json = ?, updated_at = ?
                WHERE id = ?
            `).run(JSON.stringify(filteredMembers), Date.now(), projectId);
            return res.json({ message: 'You have left the project' });
        }

        // Sinon, vérifie les permissions
        const currentUserRole = getUserRole(req.user.id, projectId);
        if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to remove members'
            });
        }

        db.prepare(`
            UPDATE projects
            SET members_json = ?, updated_at = ?
            WHERE id = ?
        `).run(JSON.stringify(filteredMembers), Date.now(), projectId);

        res.json({
            message: 'Member removed successfully'
        });

    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while removing member'
        });
    }
});

/**
 * GET /api/projects/invitations
 * Liste les invitations en attente pour l'utilisateur connecté
 */
router.get('/invitations/pending', authenticateToken, (req, res) => {
    try {
        const db = getDatabase();
        const projects = db.prepare(`
            SELECT p.id, p.name, p.description, p.owner_id, p.members_json, ou.username as owner_username
            FROM projects p
            JOIN users ou ON p.owner_id = ou.id
            ORDER BY p.updated_at DESC
        `).all();

        const invitations = [];
        for (const project of projects) {
            const members = parseMembers(project.members_json);
            for (const member of members) {
                if (String(member.userId) !== String(req.user.id) || member.status !== 'pending') {
                    continue;
                }
                const invitedByUser = member.invitedBy
                    ? db.prepare('SELECT username FROM users WHERE id = ?').get(member.invitedBy)
                    : null;
                invitations.push({
                    project_id: project.id,
                    project_name: project.name,
                    project_description: project.description,
                    owner_username: project.owner_username,
                    role: member.role,
                    invited_by_username: invitedByUser?.username || null,
                    created_at: member.createdAt
                });
            }
        }

        res.json({
            invitations: invitations.map(inv => ({
                projectId: inv.project_id,
                projectName: inv.project_name,
                projectDescription: inv.project_description,
                ownerUsername: inv.owner_username,
                role: inv.role,
                invitedBy: inv.invited_by_username,
                createdAt: inv.created_at
            }))
        });

    } catch (error) {
        console.error('List invitations error:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while fetching invitations'
        });
    }
});

module.exports = router;
