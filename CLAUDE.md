# CLAUDE.md

Do not produce documentation files unless explicitly asked. Doc comments on code are governed by the Documentation section below.

Comments stay slim and current. Delete stale context.

---

## CARDINAL RULES

1. Nothing misleading. Names, comments, abstractions, re-exports : anything that suggests one thing while doing another is the root defect to fight.
2. No tech debt, no fake abstractions, no workarounds. If a downstream problem exists because of an upstream limitation, fix the upstream. Never take the simpler fix when a better long-term fix exists.
3. Break down complex functions. Refactor with meaningful names, especially for conditionals. If a comment is needed to explain a name, rename instead.
4. No deep imports across modules: only `#module/test` for test exports. Module boundaries cross through `index.ts` barrels only. No circular imports. Never re-export from another module.
5. Uniform shape, zero branching on structure. Complexity lives at the authoring boundary only.
6. Function definition order: outermost to innermost. Non-exported functions at the end, same outermost-to-innermost order.
7. Never deprecate: delete and update what breaks. Never commit commented-out or unreachable code.
8. Never fail silently.
9. Never use this symbole `—`. if you find one, rewrite.
---

## CLASS MEMBER ORDER

1. Public member variables
2. Constructor
3. Public methods
4. Protected `didSet` / `willSet` callbacks
5. Protected methods
6. Private variables
7. Private methods
8. `#`-private variables
9. `#`-private methods

---

DONT USE <div> unless for upmost primitives.

---

## NULLABILITY

- `undefined` : not yet set. Will exist eventually.
- `null` : explicitly cleared. Existed, now does not.
- `?` : optional capability. Some instances have it, others do not.

---

## CODE STYLE

### File Header

```ts
// Copyright © 2026 InductiveArt. All rights reserved.
// One-line purpose.
```

Barrel files use `@packageDocumentation` instead. No author names, changelogs, or dates.

### File Size

If a file needs more than four section separators, split it.

### Access Modifiers

Every member has an explicit modifier. Default to `#`-private; escalate only with reason. Always use ES `#field` syntax for private. Never the `private` keyword.

### Interfaces as Contracts

Public-facing classes implement an interface. Consumers depend on the interface.

### Section Separators

Format: `// region WORD`. Acts as a navigation marker.

```ts
// region Public
```

### Boolean Checks

Explicit comparison only. No `!` for negation.

```ts
if (this.isDestroyed === false) { ... }
if (this.isReady === true) { ... }
```

### Switch Statements

Every case ends with `break`, `return`, or `// Falls through.`. Always include `default`.

### Markers

Include author initials and resolution path:
- `TODO(xx):` : missing feature.
- `FIXME(xx):` : broken code.
- `WORKAROUND(xx):` : non-obvious solution; describe the proper fix.
- `NOTE(xx):` : non-obvious context.

---

## DOCUMENTATION

Public and protected members get full doc comments. Private members only when the *why* is non-obvious; otherwise the name must be self-explanatory.

First sentence: what it does. Following sentences: why, constraint, or tradeoff. Never restate code. Describe the system, not the reader : state what things are and who owns them; never instruct.

Order: summary → `@remarks` → block tags → modifier tags.

### Release Tags

Members inherit the containing class tag. Tag only when different.
- `@public` : stable
- `@beta` : preview
- `@alpha` : early dev
- `@internal` : requires underscore prefix

### Key Tags

`@param name -` (dash separator) · `@returns` (not `@return`, omit if obvious) · `@throws` (one per exception) · `@remarks` · `@example` (fenced code) · `@see {@link S}` · `@defaultValue` · `@override` · `@sealed` · `@virtual`

Do not use `@warning`, `@note`, `@author`.

### `{@link}` Usage

Use for: types not in the signature, cross-module references, `@see` targets, `@throws` types.
Do not use for: types already in the signature, the containing class, or primitives.

---

## COMMENTS

A comment must not be ambiguous or refer to things in a vacuum.

- Third person, professional, same terminology as code.
- Capital letter, full stop. Acronyms uppercase.
- Update or delete when code changes. A wrong comment is worse than no comment.
- No changelogs in comments.
- No em-dashes in comments.

---

## ERROR HANDLING

Queries return sensible defaults. Commands throw.

- **Internal failures** (invalid state, spawn errors): log with full detail, then crash. Never hide defects.
- **External failures** (network, malformed input): `try/catch`, handle gracefully.

### Accessor Conventions

- Property accessors (`get x`) are asserting : they throw if the value is missing.
- `tryGetX()` methods are nullable; return type follows the Nullability convention.

---

## ARCHITECTURE INTEGRITY

All changes are explicit. If one file change forces edits in unrelated files, the architecture is wrong : report it instead of propagating the change.

---

## TESTING

File naming: `FileName_FeatureUnderTest.test.ts`.

`__tests__/` folders never host tests directly. Tests live in `unit/` or `integration/` subfolders.

```sh
npm run test:unit
npm run test:integration
```

Integration tests verify module cooperation in controlled environments. Simulated components, no real network.

---

## CHANGE PROCEDURE

1. Apply the modification.
2. `npm run lint:fix`.
3. `npm run build` (includes tests).
4. Verify no unexpected cross-module edits.
5. If many files affected, evaluate subsystem boundaries.
```