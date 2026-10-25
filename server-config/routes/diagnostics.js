const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

/** The kinds of report a client may send, see src/app/diagnostics/HangReporter.ts */
const KINDS = new Set(['long-task', 'frame-gap', 'xr-visibility', 'page-visibility', 'audio-state']);

/** Caps keeping one client from filling the table */
const MAX_EVENTS_PER_REQUEST = 50;
const MAX_TEXT = 200;
const MAX_DETAIL = 2000;

/** How long reports are kept, and how many at most, the oldest going first */
const RETENTION_DAYS = 30;
const MAX_ROWS = 100_000;
let lastPrune = 0;

const text = (value, max = MAX_TEXT) => (typeof value === 'string' ? value.slice(0, max) : null);
const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The detail as JSON, or a marker when it is too long, so the column always holds valid JSON */
const detailJson = detail => {
    if (detail === undefined) return null;
    const json = JSON.stringify(detail);
    return json.length <= MAX_DETAIL ? json : JSON.stringify({ truncated: true });
};

/**
 * POST /api/diagnostics/hangs
 * Store a batch of hangs and pauses seen by a client. No auth: a hang has to be reported even
 * from a guest, and a report carries nothing more than timings, the session, the participant id
 * and the user agent. Since anyone can write, the table is capped in size as well as in age.
 * Body: { sessionId, participantId, events: [{ kind, at, durationMs, inXR, detail }] }
 */
router.post('/hangs', (req, res) => {
    try {
        const body = req.body ?? {};
        const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];

        const db = getDb();
        const insert = db.prepare(`
            INSERT INTO hang_reports
                (session_id, participant_id, user_agent, kind, occurred_at, duration_ms, in_xr, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let stored = 0;
        for (const event of events) {
            if (!event || !KINDS.has(event.kind)) continue;
            const at = number(event.at);
            insert.run(
                text(body.sessionId),
                text(body.participantId),
                text(req.get('user-agent'), MAX_DETAIL),
                event.kind,
                at === null ? null : new Date(at).toISOString(),
                number(event.durationMs),
                event.inXR ? 1 : 0,
                detailJson(event.detail),
            );
            stored++;
        }

        // Keep the newest rows only, whatever the rate they come in at
        if (stored > 0) {
            db.prepare('DELETE FROM hang_reports WHERE id <= (SELECT MAX(id) FROM hang_reports) - ?').run(MAX_ROWS);
        }

        // Drop old reports at most once an hour
        if (Date.now() - lastPrune > 3600_000) {
            lastPrune = Date.now();
            db.prepare(`DELETE FROM hang_reports WHERE received_at < datetime('now', ?)`).run(`-${RETENTION_DAYS} days`);
        }

        res.json({ stored });
    } catch (error) {
        console.error('[Diagnostics] Store error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
