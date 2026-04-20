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
                const session = db.prepare(`
                    SELECT snapshot_version, snapshot_history_json
                    FROM sessions
                    WHERE id = ?
                `).get(sessionId);

                if (!session) {
                    throw new Error('Session not found');
                }

                const newVersion = (session.snapshot_version || 0) + 1;
                const history = this.parseJsonArray(session.snapshot_history_json);
                history.push({
                    id: uuidv4(),
                    data: compressed,
                    version: newVersion,
                    createdAt: now,
                    savedBy: userId
                });

                const maxHistory = Number(this.config.MAX_HISTORY_SNAPSHOTS) || 10;
                const trimmedHistory = history.slice(-maxHistory);

                db.prepare(`
                    UPDATE sessions
                    SET snapshot_current_data = ?,
                        snapshot_version = ?,
                        snapshot_updated_at = ?,
                        snapshot_updated_by = ?,
                        snapshot_history_json = ?,
                        updated_at = ?
                    WHERE id = ?
                `).run(
                    compressed,
                    newVersion,
                    now,
                    userId,
                    JSON.stringify(trimmedHistory),
                    now,
                    sessionId
                );

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
                SELECT snapshot_current_data as snapshot_data,
                       snapshot_version as version,
                       snapshot_updated_at as updated_at,
                       snapshot_updated_by as updated_by
                FROM sessions
                WHERE id = ?
            `).get(sessionId);
            
            if (!snapshot || !snapshot.snapshot_data) {
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
            const session = db.prepare(`
                SELECT snapshot_history_json
                FROM sessions
                WHERE id = ?
            `).get(sessionId);

            if (!session) {
                return null;
            }

            const history = this.parseJsonArray(session.snapshot_history_json);
            const snapshot = history.find(it => Number(it.version) === Number(version));
            if (!snapshot) {
                return null;
            }

            const data = this.isCompressed(snapshot.data)
                ? this.decompressData(snapshot.data)
                : snapshot.data;
            
            return {
                data: JSON.parse(data),
                version: snapshot.version,
                createdAt: snapshot.createdAt,
                savedBy: snapshot.savedBy
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
            const session = db.prepare(`
                SELECT snapshot_history_json
                FROM sessions
                WHERE id = ?
            `).get(sessionId);

            if (!session) {
                return [];
            }

            const history = this.parseJsonArray(session.snapshot_history_json)
                .sort((a, b) => Number(b.version) - Number(a.version));

            return history.slice(offset, offset + limit).map(it => ({
                version: it.version,
                createdAt: it.createdAt,
                savedBy: it.savedBy,
                sizeBytes: typeof it.data === 'string' ? it.data.length : 0
            }));
            
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
            const sessions = db.prepare(`
                SELECT id, snapshot_history_json
                FROM sessions
                WHERE snapshot_history_json IS NOT NULL
            `).all();

            let totalDeleted = 0;

            const maxHistory = Number(this.config.MAX_HISTORY_SNAPSHOTS) || 10;
            for (const session of sessions) {
                const history = this.parseJsonArray(session.snapshot_history_json);
                if (history.length <= maxHistory) {
                    continue;
                }

                const trimmed = history.slice(-maxHistory);
                totalDeleted += history.length - trimmed.length;

                db.prepare(`
                    UPDATE sessions
                    SET snapshot_history_json = ?
                    WHERE id = ?
                `).run(JSON.stringify(trimmed), session.id);
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

    parseJsonArray(value) {
        if (!value) {
            return [];
        }
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
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
