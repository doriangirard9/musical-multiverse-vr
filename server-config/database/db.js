/**
 * =============================================================================
 * WAM Jam Party - Module de Base de Données SQLite
 * =============================================================================
 * Ce module gère la connexion à SQLite et fournit des fonctions utilitaires.
 * Il utilise le module natif node:sqlite (disponible depuis Node.js 22.5.0).
 * =============================================================================
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Chemin vers le fichier de base de données
// Le fichier sera créé automatiquement s'il n'existe pas
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'wamjam.db');

// Variable qui contiendra l'instance de la base de données
let db = null;

/**
 * Initialise la connexion à la base de données
 * Cette fonction doit être appelée au démarrage du serveur
 */
function initializeDatabase() {
    // Création du répertoire si nécessaire
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Connexion à la base de données
    // DatabaseSync est l'API synchrone de node:sqlite
    db = new DatabaseSync(DB_PATH);

    // Configuration de SQLite pour de bonnes performances
    // WAL = Write-Ahead Logging : meilleure gestion des accès concurrents
    db.exec('PRAGMA journal_mode = WAL');

    // Active les contraintes de clés étrangères
    // Par défaut SQLite ne les applique pas !
    db.exec('PRAGMA foreign_keys = ON');

    // Exécution du schéma SQL pour créer les tables
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);
        console.log('✓ Database schema initialized');
    }

    console.log(`✓ Database connected: ${DB_PATH}`);
    return db;
}

/**
 * Retourne l'instance de la base de données
 * Lance une erreur si la DB n'est pas initialisée
 */
function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Ferme proprement la connexion à la base de données
 * Doit être appelé quand le serveur s'arrête
 */
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('✓ Database connection closed');
    }
}

/**
 * Exécute une fonction dans une transaction
 * Si la fonction réussit, la transaction est validée (COMMIT)
 * Si elle échoue, la transaction est annulée (ROLLBACK)
 *
 * @param {Function} fn - La fonction à exécuter dans la transaction
 * @returns {*} Le résultat de la fonction
 *
 * @example
 * const result = transaction(() => {
 *     db.prepare('INSERT INTO users ...').run(...);
 *     db.prepare('INSERT INTO projects ...').run(...);
 *     return { success: true };
 * });
 */
function transaction(fn) {
    const db = getDatabase();
    db.exec('BEGIN TRANSACTION');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

/**
 * Nettoie les tokens de rafraîchissement expirés
 * Cette fonction devrait être appelée périodiquement (ex: toutes les heures)
 */
function cleanupExpiredTokens() {
    const db = getDatabase();
    const now = Date.now();
    const stmt = db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?');
    const result = stmt.run(now);
    if (result.changes > 0) {
        console.log(`✓ Cleaned up ${result.changes} expired refresh tokens`);
    }
    return result.changes;
}

/**
 * Crée une sauvegarde de la base de données
 * Effectue un checkpoint WAL puis copie le fichier
 *
 * @param {string} backupPath - Chemin du fichier de sauvegarde
 */
function backupDatabase(backupPath) {
    const db = getDatabase();

    // Force un checkpoint WAL pour s'assurer que toutes les données
    // sont écrites dans le fichier principal avant la copie
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

    // Copie le fichier de base de données
    fs.copyFileSync(DB_PATH, backupPath);

    console.log(`✓ Database backup created: ${backupPath}`);
}

// Export des fonctions
module.exports = {
    initializeDatabase,
    getDatabase,
    closeDatabase,
    transaction,
    cleanupExpiredTokens,
    backupDatabase,
    DB_PATH
};
