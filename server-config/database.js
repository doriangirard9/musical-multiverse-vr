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
            max_users INTEGER DEFAULT 32,
            share_token TEXT UNIQUE,
            crdt_data TEXT,
            is_temporary INTEGER DEFAULT 0,
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

    // ── Migration : ajoute sessions.is_temporary sur les bases existantes ────
    const sessionCols = db.prepare("PRAGMA table_info(sessions)").all();
    if (!sessionCols.some(c => c.name === 'is_temporary')) {
        db.exec("ALTER TABLE sessions ADD COLUMN is_temporary INTEGER DEFAULT 0");
        console.log('[Database] Migration : colonne sessions.is_temporary ajoutée');
    }

    // ── Utilisateur système + projet éphémère pour les sessions temporaires ──
    // Les sessions temporaires référencent ce projet réservé : aucune session
    // jetable ne pollue les projets des utilisateurs, et la contrainte FK
    // project_id NOT NULL reste satisfaite. Le mot de passe '!' est inutilisable.
    db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .run('__system__', '__system__', '!');
    db.prepare("INSERT OR IGNORE INTO projects (id, name, owner_id) VALUES (?, ?, ?)")
        .run('__ephemeral__', 'Sessions temporaires', '__system__');

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
