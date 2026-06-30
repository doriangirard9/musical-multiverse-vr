const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'wamjam.db');

let db = null;

/**
 * Initialize the SQLite database and create tables if they don't exist.
 * @returns {DatabaseSync} The database instance
 */
function initDatabase() {
    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new DatabaseSync(DB_PATH);

    // Enable WAL mode for better concurrent read performance
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            is_public INTEGER DEFAULT 1,
            is_locked INTEGER DEFAULT 0,
            max_users INTEGER DEFAULT 32,
            share_token TEXT UNIQUE,
            crdt_data TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS authorized_users (
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            granted_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (session_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS session_participants (
            participant_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            user_id TEXT,
            last_heartbeat TEXT DEFAULT (datetime('now')),
            connected_at TEXT DEFAULT (datetime('now'))
        );
    `);

    // Run migrations (add columns that might not exist in older databases)
    try {
        const sessionsInfo = db.prepare('PRAGMA table_info(sessions)').all();
        const hasIsLocked = sessionsInfo.some(col => col.name === 'is_locked');
        if (!hasIsLocked) {
            db.prepare('ALTER TABLE sessions ADD COLUMN is_locked INTEGER DEFAULT 0').run();
            console.log('[Database] Added is_locked column to sessions table');
        }
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.warn('[Database] Migration error (non-critical):', e.message);
        }
    }

    // Create indexes for performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_share_token ON sessions(share_token);
        CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id);
        CREATE INDEX IF NOT EXISTS idx_session_participants_heartbeat ON session_participants(last_heartbeat);
        CREATE INDEX IF NOT EXISTS idx_authorized_users_user_id ON authorized_users(user_id);
    `);

    // Initialize system user and public sandbox session
    try {
        const crypto = require('crypto');
        const bcrypt = require('bcrypt');
        
        const systemUserId = 'system-user';
        const systemProjectId = 'system-project';
        const publicSandboxSessionId = 'public-sandbox';
        
        // Check if system user exists
        const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(systemUserId);
        if (!existingUser) {
            // Create system user with a random password (not used)
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const passwordHash = bcrypt.hashSync(randomPassword, 10);
            db.prepare(`
                INSERT INTO users (id, username, email, password_hash)
                VALUES (?, ?, ?, ?)
            `).run(systemUserId, 'system', 'system@wamjam.local', passwordHash);
            console.log('[Database] Created system user');
        }
        
        // Check if system project exists
        const existingProject = db.prepare('SELECT id FROM projects WHERE id = ?').get(systemProjectId);
        if (!existingProject) {
            db.prepare(`
                INSERT INTO projects (id, name, description, owner_id)
                VALUES (?, ?, ?, ?)
            `).run(systemProjectId, 'System', 'System-managed projects', systemUserId);
            console.log('[Database] Created system project');
        }
        
        // Check if public sandbox session exists
        const existingSession = db.prepare('SELECT id FROM sessions WHERE id = ?').get(publicSandboxSessionId);
        if (!existingSession) {
            db.prepare(`
                INSERT INTO sessions (id, project_id, name, is_public, max_users, share_token)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(publicSandboxSessionId, systemProjectId, 'Public Sandbox', 1, 1000, null);
            console.log('[Database] Created public sandbox session');
        }
    } catch (e) {
        console.error('[Database] Error initializing system data:', e);
    }

    console.log('[Database] SQLite initialized at', DB_PATH);
    return db;
}

/**
 * Get the database instance. Must call initDatabase() first.
 * @returns {DatabaseSync}
 */
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

module.exports = { initDatabase, getDb };
