const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('node:fs');
const https = require('https');
const cookieParser = require('cookie-parser');
const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');
const options = require('./options');
const { initDatabase } = require('./database');
const { startHeartbeatService } = require('./heartbeat');
const app = express();

// Initialize database
initDatabase();

// Start heartbeat cleanup service
startHeartbeatService();

// Middleware
app.use(cors({
    origin: options.AUTHORIZED_ORIGINS,
    credentials: true, // Allow cookies
    optionsSuccessStatus: 200,
}))

app.use(express.json({ limit: '10mb' })) // Large limit for CRDT data

app.use(cookieParser())

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/configs', require('./routes/configs'));
app.use('/api/presets', require('./routes/presets'));

const server = http.createServer(app);
const voiceRooms = new Map();

function sendJson(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(data));
}

function getRoom(sessionId) {
    let room = voiceRooms.get(sessionId);
    if (!room) {
        room = new Map();
        voiceRooms.set(sessionId, room);
    }
    return room;
}

function leaveVoiceRoom(ws) {
    if (!ws.voiceSessionId || !ws.voicePlayerId) return;
    const room = voiceRooms.get(ws.voiceSessionId);
    if (!room) return;
    room.delete(ws.voicePlayerId);
    for (const peer of room.values()) {
        sendJson(peer, { type: 'peer-left', playerId: ws.voicePlayerId });
    }
    if (room.size === 0) voiceRooms.delete(ws.voiceSessionId);
    ws.voiceSessionId = undefined;
    ws.voicePlayerId = undefined;
}

const voiceSignaling = new WebSocketServer({ noServer: true });

voiceSignaling.on('connection', (ws) => {
    ws.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            sendJson(ws, { type: 'error', message: 'Invalid JSON message.' });
            return;
        }

        if (message.type === 'join') {
            const sessionId = String(message.sessionId || '');
            const playerId = String(message.playerId || '');
            if (!sessionId || !playerId) {
                sendJson(ws, { type: 'error', message: 'Missing sessionId or playerId.' });
                return;
            }

            leaveVoiceRoom(ws);
            ws.voiceSessionId = sessionId;
            ws.voicePlayerId = playerId;
            const room = getRoom(sessionId);
            const peers = [...room.keys()];
            room.set(playerId, ws);
            sendJson(ws, { type: 'peer-list', peers });
            for (const peer of room.values()) {
                if (peer !== ws) sendJson(peer, { type: 'peer-joined', playerId });
            }
            return;
        }

        if (message.type === 'leave') {
            leaveVoiceRoom(ws);
            return;
        }

        const room = ws.voiceSessionId ? voiceRooms.get(ws.voiceSessionId) : null;
        const targetId = String(message.targetId || '');
        const target = room?.get(targetId);
        if (!target || !ws.voicePlayerId) return;

        if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice-candidate') {
            sendJson(target, {
                type: message.type,
                sourceId: ws.voicePlayerId,
                description: message.description,
                candidate: message.candidate,
            });
        }
    });

    ws.on('close', () => leaveVoiceRoom(ws));
    ws.on('error', () => leaveVoiceRoom(ws));
});

const socialRooms = new Map();
const socialEvents = new WebSocketServer({ noServer: true });
const SOCIAL_EVENT_TTL_MS = 6000;
const SOCIAL_EVENT_RATE_LIMIT_MS = 350;

function leaveSocialRoom(ws) {
    if (!ws.socialSessionId || !ws.socialPlayerId) return;
    const room = socialRooms.get(ws.socialSessionId);
    room?.delete(ws.socialPlayerId);
    if (room?.size === 0) socialRooms.delete(ws.socialSessionId);
    ws.socialSessionId = undefined;
    ws.socialPlayerId = undefined;
}

function isFinitePosition(position) {
    return position
        && Number.isFinite(position.x)
        && Number.isFinite(position.y)
        && Number.isFinite(position.z)
        && Math.abs(position.x) < 10000
        && Math.abs(position.y) < 10000
        && Math.abs(position.z) < 10000;
}

socialEvents.on('connection', (ws) => {
    ws.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            sendJson(ws, { type: 'error', message: 'Invalid JSON message.' });
            return;
        }

        if (message.type === 'join') {
            const sessionId = String(message.sessionId || '');
            const playerId = String(message.playerId || '');
            if (!sessionId || !playerId || sessionId.length > 128 || playerId.length > 128) {
                sendJson(ws, { type: 'error', message: 'Missing or invalid session/player id.' });
                return;
            }
            leaveSocialRoom(ws);
            ws.socialSessionId = sessionId;
            ws.socialPlayerId = playerId;
            let room = socialRooms.get(sessionId);
            if (!room) {
                room = new Map();
                socialRooms.set(sessionId, room);
            }
            room.set(playerId, ws);
            sendJson(ws, { type: 'joined' });
            return;
        }

        if (message.type === 'leave') {
            leaveSocialRoom(ws);
            return;
        }

        if (message.type !== 'event' || !ws.socialSessionId || !ws.socialPlayerId) return;
        if (!['ping-player', 'ping-point', 'ready'].includes(message.event?.kind)) return;
        if (!isFinitePosition(message.event?.position)) return;
        const now = Date.now();
        if (now - (ws.lastSocialEventAt || 0) < SOCIAL_EVENT_RATE_LIMIT_MS) return;
        ws.lastSocialEventAt = now;

        const room = socialRooms.get(ws.socialSessionId);
        const event = {
            type: 'event',
            sourceId: ws.socialPlayerId,
            event: {
                kind: message.event.kind,
                position: message.event.position,
                ttlMs: SOCIAL_EVENT_TTL_MS,
            },
        };
        for (const peer of room?.values() || []) sendJson(peer, event);
    });

    ws.on('close', () => leaveSocialRoom(ws));
    ws.on('error', () => leaveSocialRoom(ws));
});

server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname === '/voice-signaling') {
        voiceSignaling.handleUpgrade(request, socket, head, (ws) => {
            voiceSignaling.emit('connection', ws, request);
        });
        return;
    }
    if (pathname === '/social-events') {
        socialEvents.handleUpgrade(request, socket, head, (ws) => {
            socialEvents.emit('connection', ws, request);
        });
        return;
    }
    socket.destroy();
});

// Start server
server.listen(options.PORT, () => {
    console.log(`[Server] HTTP server running on port ${options.PORT}`);
});
