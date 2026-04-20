/**
 * =============================================================================
 * WAM Jam Party - Session Persistence Service
 * =============================================================================
 * Service responsable de la persistence asynchrone des snapshots de sessions.
 * 
 * Gère:
 * - La sauvegarde asynchrone des snapshots (non-bloquante)
 * - Le versioning et la gestion de l'historique
 * - La compression/décompression des données
 * - Le nettoyage automatique de l'historique ancien
 * =============================================================================
 */

const { v4: uuidv4 } = require('uuid');
const zlib = require('zlib');
const { getDatabase, transaction: dbTransaction } = require('../database/db');

class SessionPersistenceService {
    constructor() {
        // Configuration de la persistence
        this.config = {
            // Nombre maximum de snapshots conservés dans l'historique par session
            MAX_HISTORY_SNAPSHOTS: process.env.MAX_HISTORY_SNAPSHOTS || 10,
            
            // Intervalle de nettoyage de l'historique (ms)
            CLEANUP_INTERVAL: process.env.CLEANUP_INTERVAL || 60 * 60 * 1000, // 1 heure
            
            // Taille maximale d'un snapshot avant compression (bytes)
            COMPRESSION_THRESHOLD: process.env.COMPRESSION_THRESHOLD || 10 * 1024, // 10KB
        };

        // Démarrer le nettoyage périodique
        this.startCleanupTask();
    }

    /**
     * Sauvegarde un snapshot de session de manière asynchrone.
     * Cette opération est non-bloquante et utilise une queue interne.
     * 
     * @param {string} sessionId - ID de la session
     * @param {object} snapshotData - Données du snapshot (objet sérialisable en JSON)
     * @param {string} userId - ID de l'utilisateur qui déclenche la sauvegarde
     * @returns {Promise<object>} Métadonnées du snapshot sauvegardé
     */
    async saveSnapshot(sessionId, snapshotData, userId) {
        try {
            // Sérialiser les données
            const serializedData = JSON.stringify(snapshotData);
            
            // Vérifier si compression est nécessaire
            const compressed = serializedData.length > this.config.COMPRESSION_THRESHOLD
                ? this.compressData(serializedData)
                : serializedData;
            
            const snapshotId = uuidv4();
            const now = Date.now();
            
            // Utiliser une transaction pour garantir la cohérence
            const result = dbTransaction(() => {
                const db = getDatabase();
                
                // Obtenir la version actuelle
                const currentSnapshot = db.prepare(
                    'SELECT version FROM session_snapshots WHERE session_id = ?'
                ).get(sessionId);
                
                const newVersion = (currentSnapshot?.version || 0) + 1;
                
                // Upsert le snapshot courant
                db.prepare(`
                    INSERT INTO session_snapshots 
                    (id, session_id, snapshot_data, version, created_at, updated_at, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        id = excluded.id,
                        snapshot_data = excluded.snapshot_data,
                        version = excluded.version,
                        updated_at = excluded.updated_at,
                        updated_by = excluded.updated_by
                `).run(snapshotId, sessionId, compressed, newVersion, now, now, userId);
                
                // Ajouter à l'historique
                db.prepare(`
                    INSERT INTO session_snapshot_history 
                    (id, session_id, snapshot_data, version, created_at, saved_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(uuidv4(), sessionId, compressed, newVersion, now, userId);
                
                return { id: snapshotId, version: newVersion, compressed: compressed !== serializedData };
            });
            
            console.log(`✓ Session snapshot saved: ${sessionId} (v${result.version})`);
            return result;
            
        } catch (error) {
            console.error('Error saving session snapshot:', error);
            throw new Error(`Failed to save session snapshot: ${error.message}`);
        }
    }

    /**
     * Charge le snapshot courant d'une session.
     * 
     * @param {string} sessionId - ID de la session
     * @returns {Promise<object|null>} Données du snapshot décompressées, ou null si inexistant
     */
    async loadSnapshot(sessionId) {
        try {
            const db = getDatabase();
            
            const snapshot = db.prepare(`
                SELECT snapshot_data, version, updated_at, updated_by
                FROM session_snapshots
                WHERE session_id = ?
            `).get(sessionId);
            
            if (!snapshot) {
                return null;
            }
            
            // Décompresser si nécessaire
            const data = this.isCompressed(snapshot.snapshot_data)
                ? this.decompressData(snapshot.snapshot_data)
                : snapshot.snapshot_data;
            
            return {
                data: JSON.parse(data),
                version: snapshot.version,
                updatedAt: snapshot.updated_at,
                updatedBy: snapshot.updated_by
            };
            
        } catch (error) {
            console.error('Error loading session snapshot:', error);
            throw new Error(`Failed to load session snapshot: ${error.message}`);
        }
    }

    /**
     * Charge un snapshot spécifique de l'historique par version.
     * 
     * @param {string} sessionId - ID de la session
     * @param {number} version - Numéro de version à charger
     * @returns {Promise<object|null>} Données du snapshot, ou null si inexistant
     */
    async loadSnapshotHistory(sessionId, version) {
        try {
            const db = getDatabase();
            
            const snapshot = db.prepare(`
                SELECT snapshot_data, version, created_at, saved_by
                FROM session_snapshot_history
                WHERE session_id = ? AND version = ?
            `).get(sessionId, version);
            
            if (!snapshot) {
                return null;
            }
            
            const data = this.isCompressed(snapshot.snapshot_data)
                ? this.decompressData(snapshot.snapshot_data)
                : snapshot.snapshot_data;
            
            return {
                data: JSON.parse(data),
                version: snapshot.version,
                createdAt: snapshot.created_at,
                savedBy: snapshot.saved_by
            };
            
        } catch (error) {
            console.error('Error loading snapshot history:', error);
            throw new Error(`Failed to load snapshot history: ${error.message}`);
        }
    }

    /**
     * Liste les snapshots historiques d'une session (avec pagination).
     * 
     * @param {string} sessionId - ID de la session
     * @param {number} limit - Nombre de snapshots à retourner
     * @param {number} offset - Offset pour la pagination
     * @returns {Promise<array>} Liste des snapshots
     */
    async listSnapshotHistory(sessionId, limit = 20, offset = 0) {
        try {
            const db = getDatabase();
            
            const snapshots = db.prepare(`
                SELECT 
                    version,
                    created_at as createdAt,
                    saved_by as savedBy,
                    LENGTH(snapshot_data) as sizeBytes
                FROM session_snapshot_history
                WHERE session_id = ?
                ORDER BY version DESC
                LIMIT ? OFFSET ?
            `).all(sessionId, limit, offset);
            
            return snapshots;
            
        } catch (error) {
            console.error('Error listing snapshot history:', error);
            throw new Error(`Failed to list snapshot history: ${error.message}`);
        }
    }

    /**
     * Supprime les anciens snapshots de l'historique (nettoyage).
     * Garde les N derniers snapshots par session.
     * 
     * @private
     */
    cleanupOldSnapshots() {
        try {
            const db = getDatabase();
            
            // Récupérer les sessions avec plus de MAX_HISTORY_SNAPSHOTS
            const sessionsToClean = db.prepare(`
                SELECT session_id, COUNT(*) as count
                FROM session_snapshot_history
                GROUP BY session_id
                HAVING count > ?
            `).all(this.config.MAX_HISTORY_SNAPSHOTS);
            
            let totalDeleted = 0;
            
            for (const session of sessionsToClean) {
                // Calculer combien il faut supprimer
                const toDelete = session.count - this.config.MAX_HISTORY_SNAPSHOTS;
                
                // Supprimer les plus anciens
                const result = db.prepare(`
                    DELETE FROM session_snapshot_history
                    WHERE session_id = ?
                    AND version NOT IN (
                        SELECT version FROM session_snapshot_history
                        WHERE session_id = ?
                        ORDER BY version DESC
                        LIMIT ?
                    )
                `).run(session.session_id, session.session_id, this.config.MAX_HISTORY_SNAPSHOTS);
                
                totalDeleted += result.changes;
            }
            
            if (totalDeleted > 0) {
                console.log(`✓ Cleaned up ${totalDeleted} old snapshot history entries`);
            }
            
        } catch (error) {
            console.error('Error during snapshot cleanup:', error);
        }
    }

    /**
     * Démarre la tâche périodique de nettoyage.
     * 
     * @private
     */
    startCleanupTask() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldSnapshots();
        }, this.config.CLEANUP_INTERVAL);
        
        console.log(`✓ Snapshot cleanup task started (interval: ${this.config.CLEANUP_INTERVAL}ms)`);
    }

    /**
     * Arrête la tâche de nettoyage.
     */
    stopCleanupTask() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            console.log('✓ Snapshot cleanup task stopped');
        }
    }

    /**
     * Compresse les données JSON.
     * 
     * @private
     */
    compressData(data) {
        try {
            const compressed = zlib.gzipSync(data);
            // Préfixer avec un marqueur pour identifier les données compressées
            return Buffer.concat([Buffer.from('GZIP:'), compressed]).toString('base64');
        } catch (error) {
            console.warn('Compression failed, storing uncompressed:', error.message);
            return data;
        }
    }

    /**
     * Décompresse les données JSON.
     * 
     * @private
     */
    decompressData(data) {
        try {
            const buffer = Buffer.from(data, 'base64');
            if (!buffer.toString('utf8', 0, 5).startsWith('GZIP:')) {
                return data;
            }
            const decompressed = zlib.gunzipSync(buffer.slice(5));
            return decompressed.toString('utf8');
        } catch (error) {
            console.warn('Decompression failed, returning as-is:', error.message);
            return data;
        }
    }

    /**
     * Vérifie si une chaîne est compressée.
     * 
     * @private
     */
    isCompressed(data) {
        try {
            const buffer = Buffer.from(data, 'base64');
            return buffer.toString('utf8', 0, 5).startsWith('GZIP:');
        } catch (e) {
            return false;
        }
    }
}

// Instance singleton
let instance = null;

function getInstance() {
    if (!instance) {
        instance = new SessionPersistenceService();
    }
    return instance;
}

module.exports = {
    getInstance,
    SessionPersistenceService
};
