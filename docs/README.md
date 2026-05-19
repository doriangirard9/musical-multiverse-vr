# musical-multiverse-vr — Contributor Documentation

This `docs/` directory is a contributor-oriented walkthrough of the
codebase: how it boots, what every class does, what design patterns
hold it together, and how to extend it.

It is meant to be **read in numerical order** the first time, then used
as a reference afterward. These docs were written against the
`feature/steering-behaviors` branch.

## Contents

| # | Chapter | What it covers |
|---|---|---|
| 01 | [Architecture overview](01-architecture-overview.md) | The big picture, runtime layers, dev workflow |
| 02 | [App core](02-app-core.md) | `NewApp`, the singleton managers, the typed event-bus spine, full boot sequence, the `Serialization` save/load system |
| 03 | [Node3D system](03-node3d-system.md) | The plugin contract (`.d.ts` files), the runtime instance layer, the connectable/parameter/button tools, the four connection protocols (Audio / MIDI / Automation / Sync) |
| 04 | [Instruments catalog](04-instruments-catalog.md) | Every concrete instrument under `node3d/subs/`: oscillator, pianoroll, drumkit, XRDrumKit (Havok physics), the `automation/` family, the `note_generator/` family, the live-coding `functionsequencer/`, etc. |
| 05 | [Networking & sync](05-networking-and-sync.md) | Yjs + WebRTC, the generic `SyncManager<T,D>`, the `Synchronized` contract, `PeerToPeerManager`, the Express server |
| 06 | [XR input & behaviors](06-xr-input-and-behaviors.md) | WebXR pipeline, the unified `InputManager`, the composable Babylon `Behavior<T>` classes |
| 07 | [Menus & world](07-menus-and-world.md) | `HandMenu`, `SimpleMenu`, the `world/menu/ShopPanel`, shops, stands, previewers, connection visuals |
| 08 | [Patterns & conventions](08-patterns-and-conventions.md) | Singleton/Factory/Strategy/Observer/Mediator + TS idioms |
| 09 | [Contributor guide](09-contributor-guide.md) | End-to-end recipes: add an instrument, add a behavior, add an automation controller, sync a new object |
| 10 | [File reference](10-file-reference.md) | Every single `.ts` file in `src/`: one short entry each, pointing back to the chapter that covers it |

## Quick paths through the docs

**"I just want to add a new instrument."**
Read [01](01-architecture-overview.md) → [03](03-node3d-system.md) →
[09 §1](09-contributor-guide.md#1-add-a-new-instrument-node3d). Skim
[04](04-instruments-catalog.md) for inspiration close to what you want
to build.

**"I want to add a new automation controller (e.g. a new way to drive
parameters)."**
Read [03 §Connection protocols](03-node3d-system.md#connection-protocols)
→ the existing controllers in
[04 §Automation controllers](04-instruments-catalog.md#automation-controllers) →
[09 §2](09-contributor-guide.md#2-add-a-new-automation-controller).

**"I want to understand how multiplayer works."**
Read [01](01-architecture-overview.md) → [05](05-networking-and-sync.md).

**"I want to add a new VR interaction (e.g. a gesture)."**
Read [06](06-xr-input-and-behaviors.md) → [09 §3](09-contributor-guide.md#3-add-a-new-behavior).

**"I want to add a UI panel."**
Read [07](07-menus-and-world.md) → [09 §4](09-contributor-guide.md#4-add-a-menu).

**"I'm trying to find which file does X."**
Jump to [10](10-file-reference.md) and ⌘-F your way through.

## Conventions in these docs

- File references use Markdown links to the path relative to the repo
  root, often with a `:line` suffix, e.g.
  [src/Refactoring/app/NewApp.ts](../src/Refactoring/app/NewApp.ts).
- "Public API" tables list `methodName(args) → return — what it does`
  with the **declaration line** in the source.
- Diagrams are ASCII so they render anywhere.
- Code snippets are illustrative, not always copy-pasteable —
  cross-reference the source.

## A note on the branch name

The branch is called `feature/steering-behaviors`, but at the time
these docs were written there is no AI/steering behavior subsystem in
the tree yet — the name signals an intended direction. The interaction
behaviors that *do* exist (`ShakeBehavior`, `GazeBehavior`, the
hold/move/rotate family) are reactive, not goal-seeking. See
[06 §Behaviors](06-xr-input-and-behaviors.md#behaviors).

## Caveats

- The whole runtime lives under `src/Refactoring/`. The `Refactoring/`
  prefix is a transitional namespace (see
  [01](01-architecture-overview.md#the-refactoring-namespace)) — don't
  mistake it for "this is unfinished and unsafe to touch". It is the
  current code.
- These docs describe the codebase as of `feature/steering-behaviors`.
  If your file:line references no longer match, the file probably
  moved — search by symbol name.
