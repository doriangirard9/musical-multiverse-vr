const { getDb } = require('./database');

const HEARTBEAT_TTL_SECONDS = 30;
const CLEANUP_INTERVAL_MS = 10000; // Run cleanup every 10 seconds

let cleanupInterval = null;

/**
 * Remove participants whose last heartbeat is older than TTL.
 * @returns {number} Number of stale participants removed
 */
function cleanupStaleParticipants() {
    const db = getDb();

    const stmt = db.prepare(`
        DELETE FROM session_participants
        WHERE last_heartbeat < datetime('now', '-${HEARTBEAT_TTL_SECONDS} seconds')
    `);
    const result = stmt.run();

    if (result.changes > 0) {
        console.log(`[Heartbeat] Cleaned up ${result.changes} stale participant(s)`);
    }

    return result.changes;
}

/**
 * Supprime les sessions TEMPORAIRES qui n'ont plus aucun participant — elles
 * s'évaporent quand le dernier joueur part (vraie session éphémère). On laisse
 * une grâce de 30 s après création pour qu'une session fraîche ait le temps
 * d'être rejointe par son créateur avant ce nettoyage.
 * @returns {number} Nombre de sessions temporaires supprimées
 */
function cleanupEmptyTemporarySessions() {
    const db = getDb();
    const stmt = db.prepare(`
        DELETE FROM sessions
        WHERE is_temporary = 1
          AND created_at < datetime('now', '-30 seconds')
          AND NOT EXISTS (
              SELECT 1 FROM session_participants p WHERE p.session_id = sessions.id
          )
    `);
    const result = stmt.run();
    if (result.changes > 0) {
        console.log(`[Heartbeat] Removed ${result.changes} empty temporary session(s)`);
    }
    return result.changes;
}

/** Une passe de nettoyage : participants périmés puis sessions temporaires vides. */
function runCleanup() {
    cleanupStaleParticipants();
    cleanupEmptyTemporarySessions();
}

/**
 * Start the periodic heartbeat cleanup service
 */
function startHeartbeatService() {
    if (cleanupInterval) {
        console.warn('[Heartbeat] Service already running');
        return;
    }

    console.log(`[Heartbeat] Starting cleanup service (TTL=${HEARTBEAT_TTL_SECONDS}s, interval=${CLEANUP_INTERVAL_MS}ms)`);
    cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the periodic heartbeat cleanup service
 */
function stopHeartbeatService() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('[Heartbeat] Service stopped');
    }
}

module.exports = {
    startHeartbeatService,
    stopHeartbeatService,
    cleanupStaleParticipants,
    cleanupEmptyTemporarySessions,
    HEARTBEAT_TTL_SECONDS,
};
