/**
 * =============================================================================
 * WAM Jam Party - Script de Sauvegarde de la Base de Données
 * =============================================================================
 * Ce script crée une copie de sauvegarde de la base de données SQLite.
 * Il peut être exécuté manuellement ou via une tâche cron.
 *
 * Usage:
 *   node scripts/backup-db.js
 *   npm run db:backup
 *
 * Configuration via variables d'environnement:
 *   - DB_PATH: chemin de la base de données source
 *   - BACKUP_DIR: répertoire de destination des backups
 *   - BACKUP_RETENTION_DAYS: nombre de jours de rétention (défaut: 7)
 * =============================================================================
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/wamjam.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);

/**
 * Formate une date pour le nom de fichier
 */
function formatDate(date) {
    return date.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
}

/**
 * Crée le répertoire de backup s'il n'existe pas
 */
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`✓ Created backup directory: ${BACKUP_DIR}`);
    }
}

/**
 * Supprime les anciens backups (plus vieux que RETENTION_DAYS)
 */
function cleanupOldBackups() {
    const cutoffDate = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(BACKUP_DIR);

    let deletedCount = 0;
    for (const file of files) {
        if (file.startsWith('wamjam_backup_') && file.endsWith('.db')) {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);

            if (stats.mtimeMs < cutoffDate) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
    }

    if (deletedCount > 0) {
        console.log(`✓ Cleaned up ${deletedCount} old backup(s)`);
    }
}

/**
 * Effectue la sauvegarde
 */
function backup() {
    console.log('Starting database backup...');
    console.log(`  Source: ${DB_PATH}`);

    // Vérifie que la base existe
    if (!fs.existsSync(DB_PATH)) {
        console.error(`✗ Database not found: ${DB_PATH}`);
        process.exit(1);
    }

    // Crée le répertoire de backup
    ensureBackupDir();

    // Nom du fichier de backup avec timestamp
    const backupName = `wamjam_backup_${formatDate(new Date())}.db`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    console.log(`  Destination: ${backupPath}`);

    try {
        // Ouvre la base source
        const db = new DatabaseSync(DB_PATH, { readOnly: true });

        // Force un checkpoint WAL pour s'assurer que toutes les données
        // sont écrites dans le fichier principal avant la copie
        // Note: en mode readOnly, on ne peut pas faire de checkpoint,
        // donc on ferme et rouvre en lecture/écriture brièvement
        db.close();

        const dbRW = new DatabaseSync(DB_PATH);
        dbRW.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        dbRW.close();

        // Copie le fichier de base de données
        fs.copyFileSync(DB_PATH, backupPath);

        // Vérifie la taille du backup
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`✓ Backup created successfully (${sizeMB} MB)`);

        // Nettoie les anciens backups
        cleanupOldBackups();

        console.log('Backup completed!');

    } catch (error) {
        console.error('✗ Backup failed:', error.message);
        process.exit(1);
    }
}

// Exécute le backup
backup();
