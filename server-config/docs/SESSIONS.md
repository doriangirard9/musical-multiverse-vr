# WamJam Session System — Architecture Reference

## Overview

WamJam is a collaborative VR music creation app. Users authenticate, create projects containing sessions, and join sessions to collaborate in real-time via WebRTC (Y.js). The server persists session state to a SQLite database so work survives across reconnections.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | TypeScript, BabylonJS (3D/VR), Vite |
| Realtime Sync | Y.js + y-webrtc (peer-to-peer) |
| Backend | Express.js (Node ≥ 22.5, `--experimental-sqlite`) |
| Database | SQLite via `node:sqlite` (WAL mode) |
| Auth | JWT (access + refresh tokens), bcrypt |

---

## SQLite Schema

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   users       │────<│  refresh_tokens   │     │  authorized_users     │
│──────────────│     │──────────────────│     │──────────────────────│
│ id (PK)       │     │ id (PK)           │     │ session_id (FK→sessions)│
│ username (UQ) │     │ user_id (FK→users)│     │ user_id (FK→users)    │
│ email (UQ)    │     │ token_hash        │     │ granted_at            │
│ password_hash │     │ expires_at        │     └───────────┬──────────┘
│ created_at    │     │ created_at        │                 │
│ updated_at    │     └──────────────────┘                 │
└──────┬───────┘                                           │
       │                                                   │
       │ owner_id                                          │
       ▼                                                   │
┌──────────────┐     ┌──────────────────┐     ┌────────────┴─────────┐
│  projects     │────<│    sessions       │────<│ session_participants  │
│──────────────│     │──────────────────│     │──────────────────────│
│ id (PK)       │     │ id (PK)           │     │ participant_id (PK)   │
│ name          │     │ project_id (FK)   │     │ session_id (FK)       │
│ description   │     │ name              │     │ user_id (nullable)    │
│ owner_id (FK) │     │ is_public (0/1)   │     │ last_heartbeat        │
│ created_at    │     │ max_users (def 32)│     │ connected_at          │
│ updated_at    │     │ share_token (UQ)  │     └──────────────────────┘
└──────────────┘     │ crdt_data (TEXT)   │
                     │ created_at        │
                     │ updated_at        │
                     └──────────────────┘
```

### Key columns

- **`sessions.crdt_data`** — JSON string of the serialized Y.js graph (`{nodes:[], connections:[]}`). Written by auto-save, read on session join.
- **`sessions.share_token`** — Random token for sharing private sessions via URL.
- **`session_participants.last_heartbeat`** — Updated every 15s by the client. Used for TTL cleanup.
- **`session_participants.user_id`** — Nullable (supports anonymous guests on public sessions).

---

## Authentication Flow

```
Client                          Server
  │                               │
  ├──POST /api/auth/register──────>│  bcrypt hash → INSERT users → generate tokens
  │<──{ accessToken, user }────────│  set refreshToken as httpOnly cookie
  │                               │
  ├──POST /api/auth/login─────────>│  verify password → generate tokens
  │<──{ accessToken, user }────────│  set refreshToken as httpOnly cookie
  │                               │
  ├──GET /api/... (Bearer token)──>│  requireAuth middleware validates JWT
  │                               │
  ├──POST /api/auth/refresh───────>│  reads httpOnly cookie, verifies against DB
  │<──{ accessToken }──────────────│  returns new short-lived access token
```

- **Access token**: 15 min, stored in memory (not localStorage).
- **Refresh token**: 7 days, stored as `httpOnly` cookie (path: `/api/auth`), hash stored in DB.
- **Auto-retry**: `ApiClient.ts` intercepts 401 errors, silently refreshes the token, and retries the request.

---

## Session Lifecycle

### 1. Create

`POST /api/sessions` (requires auth) → creates a session row linked to a project.

### 2. Join Protocol

```
Client                               Server
  │                                    │
  ├──POST /api/sessions/:id/join──────>│  Insert into session_participants
  │<──{ participantId,                 │  Count participants
  │     participantNumber,             │  If participantNumber == 1: include crdt_data
  │     crdtData?, sessionName }───────│
  │                                    │
  ├──NewApp.start(participantId, ...)  │  ← BabylonJS + Node3dManager initialized
  │                                    │
  ├──initCRDTState(#, crdtData)        │
  │  if #1: Serialization.load(data)   │  ← Hydrate 3D nodes from saved JSON
  │         set session_state="ready"  │
  │  else:  wait for "ready" via Y.js  │  ← Sync with leader via WebRTC
```

**Why two phases?** `connect()` runs before BabylonJS starts (gets participantId for the network layer). `initCRDTState()` runs after `NewApp.start()` because `Serialization.load()` needs `Node3dManager` to be initialized.

### 3. Participant ID

- Generated server-side (UUID) on join.
- Passed to `PlayerManager`, `NetworkManager`, and `PeerToPeerManager`.
- All three systems must share the same ID so player movements broadcast correctly.

### 4. Leave

On `beforeunload`, the client fires `navigator.sendBeacon()` to `/api/sessions/:id/leave` (fire-and-forget for tab close).

---

## Heartbeat & TTL

```
Client (SessionConnector)              Server (heartbeat.js)
  │                                      │
  ├──POST /heartbeat {participantId}────>│  UPDATE last_heartbeat = now()
  │  every 15 seconds                    │
  │                                      │  every 10 seconds:
  │                                      │  DELETE WHERE last_heartbeat
  │                                      │    < datetime('now', '-30 seconds')
```

- **Purpose**: Detect crashed/disconnected clients that didn't call `/leave`.
- **TTL**: 30 seconds. Client heartbeat interval: 15 seconds (leaves ~15s margin).
- **Important**: Timestamps use SQLite's `datetime('now')` consistently (not JS `Date.toISOString()`) to avoid format mismatch in comparisons.

---

## Auto-Save (CRDT Persistence)

Every 30 seconds, `SessionConnector.startAutoSave()`:

1. Gets all node instances from `NetworkManager.node3d.nodes.entries()`
2. Calls `Serialization.save(nodes, false)` → produces `{nodes:[], connections:[]}`
3. `POST /api/sessions/:id/save` with the JSON string

**Server-side safety**: The save endpoint rejects requests where the node count drops by >50% compared to the existing data (prevents accidental wipes from desync).

---

## Client Routing (SPA)

Hash-based router (`#route?param=value`):

| Route | Page | Auth Required |
|-------|------|:---:|
| `#login` | Login form | No |
| `#register` | Register form | No |
| `#sessions` | Session browser | No (browse public) |
| `#projects` | Project manager | Yes |
| `#app?session=ID` | 3D VR environment | No* |

*Public sessions allow anonymous join. Private sessions require auth or a `share` token.

**BabylonJS teardown**: When leaving `#app`, the page does a `window.location.reload()` because BabylonJS doesn't support clean disposal.

---

## Y.js Document Structure

The shared `Y.Doc` contains:

| Y.js Map | Purpose |
|----------|---------|
| `session_state` | Protocol flag: `{status: "ready"}` signals to late joiners that the leader has finished loading |
| `players` | Player positions/rotations, keyed by participantId |
| `nodes` (via SyncManager) | 3D node instances and their synchronized state |
| `connections` (via SyncManager) | Connections between nodes |

The `PeerToPeerManager` connects the Y.Doc to a WebRTC room via `y-webrtc`, using an external signaling server.

---

## API Routes Summary

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/register` | — | Create account |
| POST | `/login` | — | Login |
| POST | `/refresh` | Cookie | Refresh access token |
| POST | `/logout` | Cookie | Invalidate refresh token |
| GET | `/me` | Bearer | Get current user |

### Projects (`/api/projects`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/` | Bearer | List user's projects |
| POST | `/` | Bearer | Create project |
| PUT | `/:id` | Bearer | Update project |
| DELETE | `/:id` | Bearer | Delete project + sessions |

### Sessions (`/api/sessions`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/public` | — | List public sessions |
| GET | `/mine` | Bearer | List user's sessions |
| GET | `/project/:id` | Bearer | List sessions in project |
| POST | `/` | Bearer | Create session |
| PUT | `/:id` | Bearer | Update session |
| DELETE | `/:id` | Bearer | Delete session |
| POST | `/:id/join` | Optional | Join session (returns participantId) |
| POST | `/:id/leave` | — | Leave session (sendBeacon) |
| POST | `/:id/heartbeat` | — | Update heartbeat timestamp |
| GET | `/:id/participants` | — | Get participant count |
| POST | `/:id/save` | — | Save CRDT data |
| POST | `/:id/share` | Bearer | Generate share token |

---

## File Map

```
server-config/
├── server.js          # Express app, middleware, route mounting
├── database.js        # SQLite init, schema, getDb()
├── auth.js            # JWT helpers, requireAuth/optionalAuth middleware
├── heartbeat.js       # TTL cleanup service (setInterval)
├── routes/
│   ├── auth.js        # /api/auth/* endpoints
│   ├── projects.js    # /api/projects/* endpoints
│   └── sessions.js    # /api/sessions/* endpoints
└── data/
    └── wamjam.db      # SQLite database (gitignored)

src/
├── index.ts                          # App entry: router, auth, page orchestration
└── Refactoring/
    ├── auth/
    │   ├── ApiClient.ts              # Fetch wrapper with auto token refresh
    │   └── AuthService.ts            # Login/register/logout state management
    ├── router/
    │   ├── HashRouter.ts             # SPA hash-based router
    │   └── routes.ts                 # Route constants
    ├── network/
    │   ├── NetworkManager.ts         # Y.Doc + PeerToPeer + Player + Node3D networks
    │   ├── PeerToPeerManager.ts      # y-webrtc provider, awareness, keepalive
    │   ├── PlayerNetwork.ts          # Player state sync via Y.Map
    │   ├── SessionConnector.ts       # Join protocol, heartbeat, auto-save
    │   ├── SessionAPIClient.ts       # Typed API client for session endpoints
    │   └── sync/SyncManager.ts       # Generic Y.js-backed object registry
    ├── app/
    │   ├── NewApp.ts                 # BabylonJS bootstrap orchestrator
    │   ├── PlayerManager.ts          # Local player XR state → network broadcast
    │   ├── Node3dManager.ts          # 3D node creation factory
    │   └── Serialization.ts          # Save/load node graphs as JSON
    └── ui/pages/
        ├── LoginPage.ts              # Login form
        ├── RegisterPage.ts           # Register form
        ├── SessionBrowserPage.ts     # Public/private session list
        ├── ProjectsPage.ts           # Project CRUD + session creation
        ├── LoadingOverlay.ts         # Frosted loading screen
        └── SessionHUD.ts            # In-session participant count + leave button
```

---

## Running Locally

```bash
# Terminal 1: Backend (requires Node ≥ 22.5)
cd server-config && npm install && npm run dev

# Terminal 2: Frontend
npm install && npm run dev
```

Backend runs on `:3000`. Vite proxies `/api/*` to it (configured in `vite.config.js`).

> **Note**: If Vite crashes after editing `vite.config.js`, delete `node_modules/.vite` and restart.
