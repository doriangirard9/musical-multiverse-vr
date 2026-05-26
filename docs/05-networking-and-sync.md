# 05 — Networking & sync

This chapter covers everything multiplayer: how peers find each other,
how state survives joins/leaves, the generic `SyncManager<T, D>`
registry that's the spine of the whole sync system, and the small
Express server that ships WAM configs.

## Files covered

| Folder | Files |
|---|---|
| `network/` | [`NetworkManager.ts`](../src/network/NetworkManager.ts), [`PeerToPeerManager.ts`](../src/network/PeerToPeerManager.ts), [`PlayerNetwork.ts`](../src/network/PlayerNetwork.ts), [`Node3DNetwork.ts`](../src/network/Node3DNetwork.ts), [`VisualNetwork.ts`](../src/network/VisualNetwork.ts), [`types.ts`](../src/network/types.ts) |
| `network/sync/` | [`SyncManager.ts`](../src/network/sync/SyncManager.ts), [`Synchronized.ts`](../src/network/sync/Synchronized.ts), [`SyncSerializable.ts`](../src/network/sync/SyncSerializable.ts) |
| `server-config/` | [`server.js`](../server-config/server.js) |

---

## Big picture

```
   Browser (peer 1)              Browser (peer 2)
   ┌──────────────┐              ┌──────────────┐
   │  NetworkMgr  │              │  NetworkMgr  │
   │   ┌──────┐   │              │   ┌──────┐   │
   │   │ Y.Doc│   │   WebRTC     │   │ Y.Doc│   │
   │   └──┬───┘   │◀────────────▶│   └──┬───┘   │
   │      │       │  (CRDT diff) │      │       │
   │  PeerToPeer──┼─────signaling┼──────PeerToPeer
   │  PlayerNet   │              │  PlayerNet   │
   │  Node3DNet   │              │  Node3DNet   │
   │  VisualNet   │              │  VisualNet   │
   └──────────────┘              └──────────────┘
                  ▲                            ▲
                  │ WebRTC needs a signaling   │
                  │ rendezvous to bootstrap    │
                  │                            │
                  └─── wss://wamjamparty.i3s ──┘
                       .univ-cotedazur.fr/rtc
                       (a y-webrtc signaling server)


   Browser (any)                  Local config server
   ┌──────────────┐               ┌──────────────────┐
   │ Node3DBuilder│  HTTP GET     │ Express          │
   │              │──────────────▶│  /wamsConfig/    │
   │              │◀──────────────│  /coreConfig/    │
   └──────────────┘  JSON          └──────────────────┘
                                   :3000 (server-config/server.js)
```

Two transports, with very different jobs:

- **Yjs over y-webrtc** carries **shared state** — every player's
  position, every spawned Node3D, every connection between Node3Ds.
  This is the multiplayer.
- **Plain HTTP to the config server** fetches **WAM plugin configs**
  (which 3D-GUI to draw for which WAM). This is just static content
  — no multiplayer involved.

The config server is described at the end of this chapter.

---

## The Yjs document

Everything multiplayer lives in **one shared `Y.Doc`** owned by
`NetworkManager`. Subsystems carve out named slots:

| Slot | Owner | What it holds |
|---|---|---|
| `'players'` (Y.Map) | [`PlayerNetwork`](../src/network/PlayerNetwork.ts) | `playerId → PlayerState` |
| `'node3d_instances'` (Y.Map via SyncManager) | [`Node3DNetwork.nodes`](../src/network/Node3DNetwork.ts) | `nodeId → kind` (data) plus state map per node |
| `'node3d_connections'` (Y.Map via SyncManager) | [`Node3DNetwork.connections`](../src/network/Node3DNetwork.ts) | wire id → wire state |
| `'visual_tubes'` (Y.Map via SyncManager) | [`VisualNetwork.tubes`](../src/network/VisualNetwork.ts) | floating visual tube id → state |
| Awareness | [`PeerToPeerManager`](../src/network/PeerToPeerManager.ts) | per-peer `{playerId, lastActive}` (transient — not saved in the doc) |

Yjs is a CRDT, so concurrent edits don't conflict — every peer
converges on the same state regardless of message order. The
**room name** is `"WamJamParty" + document.location.hash`
([NetworkManager.ts:26](../src/network/NetworkManager.ts)) — so
loading the same URL hash (`?#room1`) lands you in the same room.
Different hashes = different rooms.

---

## Per-class reference

### `NetworkManager` ([NetworkManager.ts](../src/network/NetworkManager.ts))

The singleton facade. Owns the `Y.Doc` and the four sub-managers.

| Member | Line | What |
|---|---|---|
| `readonly doc: Y.Doc` | 16 | The shared CRDT document |
| `private readonly playerId: string` | 17 | Pulled from `PlayerManager.getInstance().getId()` |
| `readonly connection: PeerToPeerManager` | 19 | WebRTC + awareness |
| `readonly player: PlayerNetwork` | 21 | Avatar sync |
| `readonly node3d: Node3DNetwork` | 22 | Nodes + connections |
| `readonly visual: VisualNetwork` | 23 | Tube visuals |
| `static initialize()` | 38 | Construct the singleton |
| `static getInstance()` | 44 | Throws if not initialized |
| `updatePlayers(deltaTime)` | 51 | Per-frame interpolation tick — called by `SceneManager.start()` |

The constructor (lines 25–36) builds everything in order:

```typescript
const roomName = "WamJamParty" + document.location.hash
this.doc = new Y.Doc()
this.playerId = PlayerManager.getInstance().getId()
this.connection = new PeerToPeerManager(this.doc, this.playerId, roomName)
this.player    = new PlayerNetwork(this.doc, this.playerId)
this.node3d    = new Node3DNetwork(this.doc)
this.visual    = new VisualNetwork(this.doc)
```

That's it — the whole networking init is six lines. Everything else
flows from event-bus messages.

### `PeerToPeerManager` ([PeerToPeerManager.ts](../src/network/PeerToPeerManager.ts))

WebRTC connection + Yjs awareness.

| Member | Line | What |
|---|---|---|
| `provider: WebrtcProvider` | 23 | The y-webrtc provider |
| `awareness: Awareness` | 22 | The Yjs awareness handle |
| `peerToPlayerMap: Map<peerId, playerId>` | 27 | Mapping of WebRTC peer IDs to logical player IDs |
| `lastKnownPlayerIds: Map<peerId, playerId>` | 28 | Used to detect when a peer's `playerId` changed mid-session |
| `keepAliveInterval` | 32 | 15-second heartbeat |
| `connect(roomName)` | 56 | Constructs the `WebrtcProvider` with the signaling URL, calls `setupAwareness()` |
| `setupAwareness()` | 72 | Sets `playerId` and `lastActive` on local awareness, listens for changes, starts the heartbeat |
| `handleAwarenessChange({added, updated, removed})` | 96 | The heart of presence detection — see below |
| `getAwareness()` | 158 | Accessor |
| `getConnectedPlayers()` | 165 | List of player IDs other than self |

#### Signaling endpoint

[Line 8](../src/network/PeerToPeerManager.ts):

```typescript
const SIGNALING_SERVER = `https://wamjamparty.i3s.univ-cotedazur.fr/rtc`
```

This is a y-webrtc signaling server (a tiny WebSocket relay that helps
peers find each other). For local dev, you can spin up your own with
`npx y-webrtc-signaling-server` and point this constant at it.

The commented-out line above
(`wss://${window.location.hostname}:443`) was the old "use whatever's
on the same host" approach.

#### Awareness change → events

`handleAwarenessChange` (lines 96–153) is what produces the
`PLAYER_ADDED` and `PLAYER_DELETED` events on `NetworkEventBus`:

| Yjs event | What it does |
|---|---|
| `added` peer | Set `peerToPlayerMap`, emit `PLAYER_ADDED` |
| `updated` peer where `playerId` changed (rare) | Emit `PLAYER_DELETED` for the old, `PLAYER_ADDED` for the new |
| `removed` peer | Emit `PLAYER_DELETED`, drop from the map |

Updates that *don't* change `playerId` (e.g. just the heartbeat
`lastActive`) are ignored.

### `PlayerNetwork` ([PlayerNetwork.ts](../src/network/PlayerNetwork.ts))

Syncs avatar state via the `'players'` Y.Map. Each player writes
their own `PlayerState` into the map; remote peers observe it.

| Member | Line | What |
|---|---|---|
| `networkPlayers: Y.Map<PlayerState>` | 19 | `doc.getMap('players')` |
| `players: Map<string, Player>` | 20 | Local instances of remote `Player` avatars |
| `setupEventListeners()` | 37 | Subscribes to `PLAYER_ADDED`, `PLAYER_DELETED`, `PLAYER_STATE_UPDATED`, plus `networkPlayers.observe` |
| `handlePlayerStateUpdated(payload)` | 47 | When the local `PlayerManager` emits a new state, write it into the map |
| `handlePlayerAdded(payload)` | 56 | When a new peer joins, instantiate a `Player` for them (unless it's us). If their state is already in the map, set it immediately |
| `handlePlayerDeleted(payload)` | 72 | Dispose the local `Player`, remove from `networkPlayers` |
| `handleNetworkPlayersChange(event)` | 88 | Yjs map observer — for each `add/update/delete` key in the change set, instantiate or update or dispose the local `Player`. Skips the local player |
| `update(deltaTime)` | 123 | For each remote `Player`, call `interpolateMovement(deltaTime)` — produces the smooth movement |

> **TODO** at line 11: the comment "Changer tout ça pour plutôt
> utiliser SyncManager" is a planned refactor. PlayerNetwork
> predates SyncManager and works directly on `Y.Map`. If you want
> one less special case in the codebase, this is a good
> refactoring target.

#### Local-player double-handling

There are **two writers** to the `'players'` Y.Map for the local
player:

1. The local client itself, via `handlePlayerStateUpdated` (every 50ms
   when the player moves).
2. Nobody else — the local-player update is a *write*, not a *read*.

And **two readers**:

1. The `handleNetworkPlayersChange` observer (skipped for local id).
2. Other peers' `handleNetworkPlayersChange`.

So every 50ms, when you move, you write your own state to a CRDT map
that's automatically replicated. No explicit "send" call.

### `Node3DNetwork` ([Node3DNetwork.ts](../src/network/Node3DNetwork.ts))

A thin holder for two `SyncManager`s built by other classes.

| Member | Line | What |
|---|---|---|
| `nodes: SyncManager<Node3DInstance, string>` | 33 | Built by `Node3DInstance.getSyncManager(...)`. The third type arg is the `kind` string carried as data |
| `connections: SyncManager<N3DConnectionInstance, any>` | 40 | Built by `N3DConnectionInstance.getSyncManager(...)` |

Also exports `Node3DGraphDescription` (lines 51–64) — the format
[`Serialization`](02-app-core.md#serialization-serializationts) uses
to save/load graphs.

### `VisualNetwork` ([VisualNetwork.ts](../src/network/VisualNetwork.ts))

Owns one more `SyncManager`:

| Member | Line | What |
|---|---|---|
| `tubes: SyncManager<VisualTube, ...>` | 23 | Built by `VisualTube.getSyncManager(scene, doc)`. See chapter [07 §VisualTube](07-menus-and-world.md#visualtube) |

### `types.ts` ([types.ts](../src/network/types.ts))

The wire format for player state:

```typescript
type PlayerState = {
    id: string
    position:          { x, y, z }
    direction:         { x, y, z }
    leftHandPosition:  { x, y, z }
    rightHandPosition: { x, y, z }
}
```

`Position3D` from `shared/SharedTypes.ts` is the same shape — both
exist because Babylon `Vector3` is **not** JSON-serializable, so we
serialize at the boundary. (Yjs would happily JSON.stringify a
`Vector3` but not deserialize it — methods would be lost.)

---

## The generic `SyncManager<T, D>`

[`SyncManager.ts`](../src/network/sync/SyncManager.ts) is
the single most reused class in the networking layer. It's a generic
"registry of synchronized objects" — give it a Yjs doc and a factory
function, and it handles add/remove/state-sync over the network.

It backs **all three** of the Node3D/connection/visual-tube networks.

### Type parameters

```typescript
class SyncManager<
    T extends Synchronized,
    D extends SyncSerializable | undefined = undefined
>
```

- `T` — the synchronized object type. Must implement
  [`Synchronized`](../src/network/sync/Synchronized.ts).
- `D` — optional **per-instance "data"** that travels alongside the
  state but is set once at `add()` time. For Node3D nodes, this is
  the `kind` string ("oscillator", "harp", etc.) — it's how a
  remote peer knows *which factory to use* before it even knows the
  state.

### Constructor options

[Lines 27–43](../src/network/sync/SyncManager.ts):

| Option | Required | What |
|---|---|---|
| `name: string` | yes | Yjs map key for the data slot |
| `doc: Y.Doc` | yes | The shared document |
| `create(id, state, data) => Promise<T>` | yes | Factory used when **another peer** added an object — your code instantiates a `T` from the just-arrived data |
| `on_add(instance, state, data)` | no | Hook on every add (local or remote) |
| `on_remove(instance, state, data)` | no | Hook on every remove (local or remote) |
| `send_interval = 100` | no | Debounce window for state changes (ms) |
| `get_timeout = 10_000` | no | How long `await get(id)` waits before resolving `undefined` (ms) |

### Public API

| Method | Line | What |
|---|---|---|
| `async add(id, instance, data?)` | 64 | Register, collect initial state via `instance.askStates()`, write to Yjs in a single transaction |
| `async remove(id_or_instance)` | 102 | Unregister, call `on_remove`, write deletion to Yjs |
| `getNow(id): T \| undefined` | 143 | Synchronous lookup (returns `undefined` if not yet synced) |
| `async get(id, timeout?): Promise<T \| undefined>` | 170 | Asynchronous — waits for the instance to arrive (used by `N3DConnectionInstance` to resolve the two endpoints of a wire) |
| `entries()` | 150 | Iterator over `[id, instance]` |
| `getId(instance): string \| undefined` | 159 | Reverse lookup |
| `getState(id): Record<string, SyncSerializable>` | 205 | Snapshot of all the synced state keys for an instance — useful for save/load |
| `async setState(id, state)` | 216 | Bulk replace all state keys for an instance — diffing existing keys against the new state, removing the gone ones, setting the present ones |
| `getData(id): D \| undefined` | 244 | The auxiliary `data` (the third constructor arg of `add`) |

### How it works internally

The class uses two Y.Maps per registry:

| Y.Map | Holds | Purpose |
|---|---|---|
| `shared_data` (named after `options.name`) | `{ data: D }` | One entry per synced instance. **The presence** of an entry is what triggers add/remove on remote peers |
| `shared_state` (anonymous root map of maps) | `Y.Map<SyncSerializable>` per id | The actual state keys for each instance |

#### Add flow (line 64–96)

When you call `add(id, instance, data)`:

1. Resolve any pending `await get(id, ...)` callers immediately
   (line 68).
2. Register in local `instances` and `reverse_instances` maps.
3. Allocate a fresh `Y.Map<SyncSerializable>` for the state.
4. `await initialize(id, instance, state)` (line 326) — calls
   `instance.initSync(id, set_state, remove_state)`, then attaches a
   Yjs observer to the state map so remote changes flow into
   `instance.setState` / `removeState`.
5. `instance.askStates()` — the synchronizable should now call
   `set_state(key)` for every initial state. Those calls accumulate
   in `pendingStateChange`.
6. `get_changes_and_remove(id)` collects them — for each, it calls
   `await instance.getState(key)` to materialize the value.
7. Apply them all to the local `state` map.
8. `doc.transact()` writes both the state map and the data entry —
   atomically, so a remote observer sees both at once.
9. Call `on_add(instance, state, data)`.

#### Remote-add flow (line 250–289)

When the **other** peer added something, our `shared_data.observe`
fires `add_from_network`:

1. For each new id, fetch its `shared_state` and `shared_data` from
   the doc (already arrived, since the writer used a single
   transaction).
2. `await this.create(id, state, data)` — the factory builds the
   right kind of instance (e.g. for Node3D, calls
   `audioManager.builder.create(kind)` from
   [Node3DInstance.ts:354](../src/node3d/instance/Node3DInstance.ts)).
3. Register, then `initialize()` — same as above, except instead of
   asking the instance for its state, we **replay every entry from
   the shared map into `instance.setState(key, value)`** (line 267).
   That's how the remote peer gets the same parameter values.
4. Resolve any pending `await get(id, ...)` waiters.

#### State-change flow (line 297–319)

When a synchronizable does `set_state(key)`:

- The key is queued in `pendingStateChange[id]`.
- A debounce timer is set for `send_interval` (default 100ms).
- On fire, `send_changes()` runs `get_changes_and_remove` to call
  `instance.getState(key)` for each queued key, and writes them
  all into the Yjs map in one `doc.transact()`.
- Remote peers' state-map observer (set up in `initialize`, line
  336) calls `instance.setState(key, value)` for each change.

The debounce matters: if you drag a knob continuously, the local
`getState/setState` callbacks fire dozens of times per second, but
the network sees one merged `transact` every 100ms.

#### Remove flow (line 102–135)

`remove(id)`:
1. Call `instance.disposeSync()` — gives the synchronizable a chance
   to detach its `set_state` callback.
2. Drop the `pendingStateChange[id]` (any in-flight changes are
   discarded — the instance is going away).
3. Drop from local maps.
4. Call `on_remove(instance, state, data)` with the soon-to-be-gone
   shared state.
5. `doc.transact()` deletes the data entry, which causes the
   observer on remote peers to fire `add_from_network` with a
   `delete` event — they then dispose their copy.

#### The `get(id)` async pattern

[`N3DConnectionInstance`](../src/node3d/instance/N3DConnectionInstance.ts)
needs to look up its two endpoints by id, but the endpoints might not
have synced yet (the connection's "this is the wire payload" arrives
through a different transaction than the wire's "I exist" payload).

`get(id, timeout?)` (line 170):
- If the instance is registered now, return it immediately.
- Otherwise, register a `{resolve, timeout}` entry in `pendingGet`.
- When the instance shows up later (via either local `add` or
  network add), `get_resolver` pulls all the pending callers and
  calls `resolve(instance)`.
- If the timeout fires first, `resolve(undefined)`.

### `Synchronized` interface

[`Synchronized.ts`](../src/network/sync/Synchronized.ts):

```typescript
interface Synchronized {
    initSync(
        id: string,
        set_state:    (key: string) => void,    // call to broadcast a change
        remove_state: (key: string) => void,    // call to broadcast a deletion
    ): Promise<void>

    disposeSync(): void              // detach your set_state callback
    askStates(): void                // emit set_state for every initial key
    setState(key: string, value: SyncSerializable): Promise<void>
    removeState(key: string): Promise<void>
    getState(key: string): Promise<SyncSerializable>
}
```

Three classes implement this:

- [`Node3DInstance`](../src/node3d/instance/Node3DInstance.ts)
  — handles the `"position"` and `"node3d_parameter_*"` keys directly,
  delegates everything else to the underlying plugin's
  `getState/setState`.
- [`N3DConnectionInstance`](../src/node3d/instance/N3DConnectionInstance.ts)
  — handles the `"connectables"` key with a `{fromId, fromPortId,
  toId, toPortId}` payload.
- [`VisualTube`](../src/visual/VisualTube.ts) — handles
  `"position"` and `"color"`.

> **Quirk**: `Node3DInstance.initSync` only takes `(id, set_state)`
> — the third `remove_state` argument is dropped. So Node3D plugins
> can call `notifyStateChange(key)` to set, but **there's no
> `notifyStateRemoved(key)`** that propagates a deletion. If you
> need to remove a state key, the convention is to set it to `null`
> (`Serializable` allows `null`) and treat that as "absent" on
> the receiver. The lower-level `SyncManager` does support
> `removeState`, but the path from a plugin to it isn't wired.

### `SyncSerializable`

```typescript
type SyncSerializable = number | string | boolean | null
                      | { [key: string]: SyncSerializable }
                      | SyncSerializable[]
```

JSON, basically. Anything `Y.Map` can store.

---

## Worked example: spawn an Oscillator and watch it sync

```
Local user clicks "Oscillator" in ShopPanel
   │
   ▼
ShopPanel.emit("CREATE_AUDIO_NODE", {nodeId, name, kind:"oscillator"})
   │
   ▼ AppOrchestrator.onMenuEvent listens:
   │
   ▼
Node3dManager.createNode3d("oscillator", Vector3(0,0,5), nodeId)
   │  emit("AUDIO_NODE_CREATED", ...)
   ▼
builder.create("oscillator")  ← OscillatorN3DFactory.create(...)
   │   builds OscillatorN3DGUI + OscillatorN3D
   │   in OscillatorN3D's constructor:
   │     - context.addToBoundingBox(gui.block)
   │     - context.createConnectable(...)
   │     - context.createParameter({id:"frequency", ...})
   │   Node3DInstance now wraps this as a Node3DInstance instance
   ▼
NetworkManager.node3d.nodes.add(nodeId, instance, "oscillator")
   │
   │  SyncManager:
   │    1. instances.set(nodeId, instance)
   │    2. allocate Y.Map<SyncSerializable> for state
   │    3. initialize() → instance.initSync(id, set_state, ...)
   │    4. instance.askStates()
   │       → Node3DInstance pushes "position" + "node3d_parameter_frequency"
   │    5. for each, await instance.getState(key) → values
   │    6. doc.transact():
   │         shared_state.set(nodeId, stateMap)
   │         shared_data.set(nodeId, {data: "oscillator"})
   ▼
   │  Yjs replicates both in a single CRDT update
   │
   ▼
Remote peer's PeerToPeerManager receives WebRTC payload
Remote peer's shared_data observer fires:
   │  add_from_network for nodeId, action="add"
   │
   ▼
SyncManager (remote):
   1. const new_shared = shared_data.get(nodeId) // {data: "oscillator"}
   2. const new_shared_state = shared_state.get(nodeId)
   3. await create(nodeId, state, "oscillator")
      → Node3DInstance.getSyncManager.create
      → audioManager.builder.create("oscillator")
        which spawns the same OscillatorN3DGUI + OscillatorN3D
   4. instances.set(nodeId, instance)
   5. initialize(nodeId, instance, new_shared_state)
   6. for each [key, value] in new_shared_state:
        await instance.setState(key, value)
        e.g. setState("position", {position:[0,0,5], rotation:[…]})
        e.g. setState("node3d_parameter_frequency", 0.42)
   ▼
Remote peer now sees the same oscillator in the same place.

If the local user drags the frequency knob:
   parameter.config.setValue(0.7)
   → context.notifyStateChange("frequency")  ← actually drives the
     "node3d_parameter_frequency" auto-sync (see chapter 03)
   → SyncManager.addChange → debounce 100ms → send_changes
   → doc.transact: shared_state.get(nodeId).set("node3d_parameter_frequency", 0.7)
   → Yjs replicates
   → Remote shared_state observer fires
   → instance.setState("node3d_parameter_frequency", 0.7)
   → param.config.setValue(0.7)
   → audionode.frequency.value = 0.7 * 100 + 130 = 200 Hz
```

Same dance for connections (`N3DConnectionInstance`), avatars
(`PlayerNetwork`), and visual tubes (`VisualTube`).

---

## Reading the test reference files

The directory `network/sync/test/` was listed as containing `SyncLink.ts`
and `SyncBlock.ts` in older branches as reference implementations.
**On `feature/steering-behaviors` they have been deleted**. The
remaining canonical examples of `Synchronized` are
`Node3DInstance`, `N3DConnectionInstance`, and `VisualTube`. If you
need a stripped-down example to copy from, the **tube** is the
smallest:
[`src/visual/VisualTube.ts`](../src/visual/VisualTube.ts)
(see chapter [07 §Visuals](07-menus-and-world.md#visualtube)).

---

## The config server

[`server-config/server.js`](../server-config/server.js) is a tiny
Express server, ~80 lines.

| Route | Returns |
|---|---|
| `GET /coreConfig/:name` | The contents of `server-config/public/coreConfig/<name>.json` |
| `GET /wamsConfig/:name` | The contents of `server-config/public/wamsConfig/<name>.json` |
| `GET /wamsConfig/` | Array of every `.json` filename (sans extension) in `public/wamsConfig/` |
| `GET /…/something.json` | Static file from `server-config/public/` |

`Node3DBuilder` consumes both:

- On `initialize()` (line 240 in `Node3DBuilder.ts`), `GET /wamsConfig`
  to learn the list of available WAMs and prepend them to
  `FACTORY_KINDS`.
- On `createFactories(kind)` (line 124), `GET /wamsConfig/<kind>.json`
  for any kind that wasn't matched by a builtin / `wam3d-` /
  `external:` / `desc:` / `add-` prefix.
- At module load (line 34), `GET /wamsConfig/additionalConfigs.json`
  for the `add-*` kinds.

Configuration:

- **Port**: 3000 (line 16). Hardcoded.
- **CORS**: open (`cors({optionsSuccessStatus:200})` at line 25).
- **HTTPS**: disabled in code (lines 9–14, 74–78 commented out).
  The intent is to put an HTTPS reverse proxy (Nginx) in front of
  this in production.
- **Static**: also serves `public/` from `/` and `/config/`.

For the client to find it, `Node3DBuilder.ts:32`:

```typescript
const WAM_CONFIGS_URL = `http://${window.location.hostname}:3000`
```

So when you load the client at `https://localhost:5173`, it expects
the server at `http://localhost:3000`. Mixed-content rules will
silently block this in some browsers — if WAMs aren't loading,
check the console for blocked HTTP fetches.

---

## Quick reference: sync flows by domain

| Domain | Class implementing `Synchronized` | Key state keys | Wire format |
|---|---|---|---|
| Player avatars | (not via SyncManager — direct `Y.Map<PlayerState>` in `PlayerNetwork`) | (full state per write) | `PlayerState` |
| Node3D instances | `Node3DInstance` | `"position"`, `"delete"`, `"node3d_parameter_<id>"`, plus whatever the plugin exposes via `getStateKeys()` | varies — `position` is `{position:[x,y,z], rotation:[qx,qy,qz,qw]}`, parameters are `[0..1]` numbers, plugin keys are arbitrary `Serializable` |
| Node3D connections | `N3DConnectionInstance` | `"connectables"` | `{fromId, fromPortId, toId, toPortId}` |
| Visual tubes | `VisualTube` | `"position"`, `"color"` | arrays of numbers |

---

## Where to go next

- The visual-cable counterpart of audio connections is in
  [07 §VisualTube](07-menus-and-world.md#visualtube).
- The **save/load** of node graphs (which uses these sync primitives
  but produces standalone JSON) is
  [02 §Serialization](02-app-core.md#serialization-serializationts).
- For the **plugin contract** that drives state changes, read
  [03](03-node3d-system.md).
