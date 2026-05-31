# Jib - Performance Audit & Scaling Plan

_Status: updated 2026-05-31 against the current worktree. This replaces the
original read-only audit; the Stage 1 fixes from that audit are now implemented._

## TL;DR

The 50-friend MVP foundation is now in good shape for a single authoritative
Node/WebSocket process:

- Server simulation remains authoritative at 20 Hz.
- Snapshots are decoupled to ~13.3 Hz, with interpolation hiding the lower send rate.
- Player snapshots are split into owner-private and public views.
- Per-session entity deltas avoid resending unchanged world objects.
- Static resources are indexed once; moving entities update spatial cells incrementally.
- Monsters/NPCs simulate only in active regions near players.
- Backpressure skips snapshots for slow sockets instead of piling up writes.
- The client uses chunked/culled map rendering, heap-based A*, and a throttled minimap.
- Class abilities are now data-driven YAML compositions instead of a branch-per-ability monolith.

Fresh load checks on 2026-05-31 show the current build handles 50 simulated clients
with no socket errors and no backpressure skips. See
`docs/load-baseline-2026-05-31.md`.

## Current Runtime Shape

- Single Node process, `ws` server.
- Authoritative sim tick: 50 ms.
- Snapshot broadcast: 75 ms.
- Interest radius: 18 tiles for dynamic entities, 32 tiles for trees.
- Spatial cell size: 8 tiles.
- Current content: 10 floors, 77 monsters, roughly 1,385 tree nodes, NPCs,
  gathering resources, fires, corpses, and per-player persistence.

## What Is Resolved

### Public/private player snapshots

The original O(N^2) cliff came from sending every player's full private state to
every other viewer. That is fixed:

- `serializePlayer()` is used for the viewer's own full record.
- `serializePlayerPublicCached()` is used for other players.
- Public views include only fields needed for rendering: identity, position,
  facing, movement/action, HP, and death state.
- Inventory, quests, skills, abilities, unlocked classes, carry weight, target
  id, gold, XP, and equipment detail stay owner-only.
- Public and private views are cached by signature so stable players do not
  allocate fresh heavy arrays every snapshot.

### Snapshot deltas and backpressure

`buildSnapshotFor()` now keeps a per-session cache for players, monsters,
corpses, NPCs, trees, resource nodes, and fires. It sends:

- full lists on recovery/full intervals,
- changed items when signatures change,
- removed ids when items leave interest range,
- empty heartbeat snapshots only after `TIB_SNAPSHOT_HEARTBEAT_MS`.

Slow sockets are guarded by `socket.bufferedAmount >
TIB_SOCKET_BACKPRESSURE_BYTES`, which skips that snapshot for the lagging client
and records the skip in metrics.

### Spatial indexing and active regions

The server no longer rebuilds one all-entity spatial index every tick.

- Players, monsters, corpses, NPCs, and fires are in dynamic spatial maps.
- Trees, fishing nodes, mining nodes, and herb nodes are indexed once at startup.
- Movement calls update the old and new cells directly.
- Monsters and NPCs tick only in cells near online players.
- Tree/herb, fire, and corpse expiry use min-heaps instead of whole-world scans.
- `playersById` makes taunt/alert/burn owner lookup O(1).

This is the main 100x-world foundation already in place on the server side:
inactive regions do not burn CPU just because they exist.

### Client hot paths

The previous client risks are also addressed:

- Click-to-walk A* uses a binary heap instead of sorting the open list every step.
- Minimap base layers are cached and redraw is throttled.
- The main map is rendered as visible chunks instead of one floor-sized render texture.
- E2E coverage includes a map chunking assertion.

### Content growth

Abilities are already data-driven in `content/abilities.yaml` and validated by
the content build. `useClassAbility()` interprets targeting/effects/projectiles/
VFX, so adding abilities that compose existing primitives is now content work.

## Current 50-Client Evidence

All runs below used:

```bash
PORT=8788 E2E_TEST=1 TIB_ALLOW_TRANSIENT_PLAYERS=1 TIB_WS_COMPRESSION=0 node server/index.ts
```

Then:

```bash
node scripts/load-test.ts --port 8788 --clients 50 --duration 15000 --combat 0.4
node scripts/load-test.ts --port 8788 --clients 50 --duration 15000
```

Headline results:

| Scenario | Errors | Backpressure skips | Tick avg/max | Snapshot avg/max | Outbound avg/max |
|---|---:|---:|---:|---:|---:|
| 50 mixed town/combat | 0 | 0 | 0.39 / 0.47 ms | 4.70 / 5.81 ms | 5.83 / 6.54 MB/s |
| 50 clustered town | 0 | 0 | 0.24 / 0.29 ms | 5.09 / 6.30 ms | 9.42 / 10.60 MB/s |

This validates the original target: 50 co-located clients are no longer near the
50 ms snapshot budget. The clustered-town outbound result is also close to the
original post-fix estimate of ~9 MB/s uncompressed.

## Remaining Risks

### Large-world content residency

The server avoids ticking inactive regions, but it still instantiates static
features such as trees for the whole authored world at startup. That is fine for
the current MVP. For a 100x world, static features should become chunk-derived
or chunk-loaded data so RAM scales with active/nearby regions rather than total
world size.

### Asset streaming

Map rendering is chunked, but asset loading is still mostly up-front. A much
larger world with many more enemy/item/biome textures will need region-streamed
assets and unload policies. Do this when content volume, load time, or VRAM
starts showing pressure.

### Protocol size

JSON is acceptable for 50 friends after deltas. If telemetry later shows
network pressure, the next step is not more gameplay logic optimization; it is a
wire-format pass: short keys, binary/delta packets, or compression tuned for the
hosting environment.

### Persistence

Player saves now live in per-player files with legacy migration, which is a
good step beyond whole-DB rewrites. SQLite/Postgres is still the right move
before hundreds of accounts, shared world-state persistence, guilds, market
orders, or multi-process sharding.

### Multi-process sharding

Do not pre-build sharding for the 50-friend MVP. Floors/zones are already a
natural future seam. Add a gateway + worker model only when telemetry proves one
process cannot tick the populated world.

## Staged Plan From Here

### Stage 1 - Complete for current MVP scale

- [x] Public/private player snapshot split.
- [x] Owner-only private state with cache signatures.
- [x] Per-session snapshot deltas.
- [x] Static spatial layers and incremental dynamic spatial updates.
- [x] Active-region monster/NPC simulation.
- [x] Event-scheduled resource/fire/corpse expiry.
- [x] `playersById` lookup map.
- [x] Broadcast at 75 ms instead of 50 ms.
- [x] Socket backpressure skip metric.
- [x] Heap A* and throttled minimap.
- [x] Chunked client map rendering.
- [x] Data-driven ability effects.

### Stage 2 - Add when telemetry asks for it

- [x] Local automated load-test gate with thresholds (`npm run perf:gate`).
- [x] Slow-reader smoke scenario in the local performance gate.
- [ ] Better load-test scenarios for co-located combat and long sessions.
- [ ] Protocol compaction if bytes/sec becomes a real hosting limit.
- [ ] Region-streamed client assets once content volume warrants it.
- [ ] Chunk-derived static resources before the world grows by an order of magnitude.

### Stage 3 - Defer until one process is the bottleneck

- [ ] Zone/floor workers behind a gateway.
- [ ] Real datastore for accounts and persistent world state.
- [ ] Cross-zone handoff semantics for parties, chat, combat, and item drops.

## Operational Rule

Keep the interest-management contract sacred: the client should receive only the
nearby world and its own private state. World size can grow dramatically as long
as server tick, snapshot build, client render, and asset load all remain bounded
by active/nearby regions instead of total world size.
