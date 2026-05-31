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
- High-cardinality trees are chunk-derived and materialized only near players.
- Monsters/NPCs simulate only in active regions near players.
- Backpressure skips snapshots for slow sockets instead of piling up writes.
- The client uses chunked/culled map rendering, heap-based A*, and a throttled minimap.
- Class abilities are now data-driven YAML compositions instead of a branch-per-ability monolith.

Fresh load checks on 2026-05-31 show the current build handles 50 simulated
clients in clustered/combat scenarios and 100 distributed regional clients with
no socket errors and no backpressure skips. See
`docs/load-baseline-2026-05-31.md`.

## Current Runtime Shape

- Single Node process, `ws` server.
- Authoritative sim tick: 50 ms.
- Snapshot broadcast: 75 ms.
- Interest radius: 18 tiles for dynamic entities, 32 tiles for trees.
- Spatial cell size: 8 tiles.
- Static trees/resources are initial-full per session, then delta/removal only.
- Tree resource cells are generated lazily around players and pruned when no
  players are nearby.
- Transient event queues are bounded per global, targeted, and spatial-cell
  queue, with drop telemetry in load gates.
- Load gates track raw state-message byte sizes to catch protocol bloat before
  aggregate bandwidth becomes the only warning sign.
- Current content: 10 floors, 77 monsters, roughly 1,385 derivable tree tiles,
  NPCs, gathering resources, fires, corpses, and per-player persistence.

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

Static trees and gatherable resources no longer participate in periodic full
snapshot recovery. Each session receives one full sync per static category, and
then only signature changes or interest-range removals are sent. This keeps
tree/resource-heavy regions from producing recurring full-list bursts as world
density grows.

Transient combat/UI events are also bounded before snapshot fan-out. Normal
50-client load gates assert `eventsDroppedPerSecond.max` stays at `0`, while
pathological bursts degrade by dropping excess float/projectile/chat events
instead of building unbounded packets.

The load driver also records raw state message sizes. `npm run perf:gate` caps
state packets at 60 KB max and 25 KB average across its clustered, combat,
regional, and slow-reader scenarios.

### Spatial indexing and active regions

The server no longer rebuilds one all-entity spatial index every tick.

- Players, monsters, corpses, NPCs, and fires are in dynamic spatial maps.
- Fishing nodes, mining nodes, and herb nodes are indexed once at startup.
- Trees are derived from map chunks on demand instead of being instantiated for
  the whole authored world at boot.
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
| 100 distributed regional combat | 0 | 0 | 0.64 / 0.81 ms | 10.06 / 11.81 ms | 12.06 / 13.23 MB/s |

This validates the original target: 50 co-located clients are no longer near the
50 ms snapshot budget. It also gives the project a larger regional smoke gate:
100 clients spread across four active zones with active target churn stay
comfortably below the 75 ms broadcast interval without compression.

## Remaining Risks

### Large-world content residency

The server avoids ticking inactive regions, and tree resources now follow the
same rule for residency: tree cells are generated only near players and active
tree runtimes are pruned again when the area goes cold. Remaining static
resource lists are currently small, but fishing/mining/herb definitions should
use the same chunk-derived pattern before they become high-cardinality content.

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
- [x] 100-client distributed regional smoke scenario in the local performance
  gate.
- [x] Slow-reader smoke scenario in the local performance gate.
- [x] Co-located combat scenario in the local performance gate.
- [x] Optional longer mixed-combat soak gate (`npm run perf:soak`).
- [x] Memory/entity residency telemetry in server snapshots and load gates.
- [x] Static resource snapshot regression gate; full static lists are initial
  sync only, then deltas/removals.
- [x] Chunk-derived tree resources with active-cell pruning and resident
  resource load gates.
- [x] Bounded transient event queues with event-drop telemetry in load gates.
- [x] Raw state-message byte telemetry and packet-size thresholds in load gates.
- [ ] Protocol compaction if bytes/sec becomes a real hosting limit.
- [ ] Region-streamed client assets once content volume warrants it.
- [ ] Chunk-derived fishing/mining/herb resources before those lists grow by an
  order of magnitude.

### Stage 3 - Defer until one process is the bottleneck

- [ ] Zone/floor workers behind a gateway.
- [ ] Real datastore for accounts and persistent world state.
- [ ] Cross-zone handoff semantics for parties, chat, combat, and item drops.

## Operational Rule

Keep the interest-management contract sacred: the client should receive only the
nearby world and its own private state. World size can grow dramatically as long
as server tick, snapshot build, client render, and asset load all remain bounded
by active/nearby regions instead of total world size.
