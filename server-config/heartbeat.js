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
 * Start the periodic heartbeat cleanup service
 */
function startHeartbeatService() {
    if (cleanupInterval) {
        console.warn('[Heartbeat] Service already running');
        return;
    }

    console.log(`[Heartbeat] Starting cleanup service (TTL=${HEARTBEAT_TTL_SECONDS}s, interval=${CLEANUP_INTERVAL_MS}ms)`);
    cleanupInterval = setInterval(cleanupStaleParticipants, CLEANUP_INTERVAL_MS);
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
    HEARTBEAT_TTL_SECONDS,
};
