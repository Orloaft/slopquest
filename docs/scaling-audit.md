# Jib — Performance Audit & Scaling Plan (2 → 50 concurrent players)

_Status: diagnostic + staged plan. Read-only audit; no engine code changed by this document.
The fix #1 diff below is **proposed, not yet applied** — see "Why this isn't applied yet"._

## TL;DR

The architecture is right for 50 friends: authoritative sim, interest management, spatial
grid. **One design flaw makes snapshots O(N²) in players** — the server ships every player's
full private state (inventory, skills, quests, abilities) to _every_ viewer, 20×/second. That
walls you around a dozen co-located players, long before CPU is the issue. Fix that plus three
smaller server cleanups and a single small cloud VM carries 50 concurrent players with margin.

Runtime shape: single Node process, `ws` server, authoritative sim at **20 Hz** (50 ms) + a
separate **20 Hz** snapshot broadcast. Phaser 3 client, server-authoritative with linear
interpolation. World: 10 floors ~52×34 tiles; **57 monsters, ~1,385 tree nodes, 20 NPCs**,
small node sets.

---

## 🔴 Headline: snapshot cost is O(N²) in players

`buildSnapshotFor()` runs **per viewer** (`server/index.ts:1978-1986`), and for every _other_
visible player it calls `serializePlayer()` (`:1993` → `:2073`), which serializes that player's
**entire private state**: 30 inventory slots, 12 skills (each `id/label/iconUrl/xp/level/nextXp`),
9 quests, abilities, buffs, unlocked classes — ~1.5 KB JSON **per player, per viewer, 20×/s**.

In a town everyone sits inside everyone's interest radius (towns are 52×34, radius 18 → near-total
overlap), so it's a full N×N matrix on both bandwidth and CPU (`serializeSkills`/`serializeQuests`
re-run for every player for every viewer):

| Players together | Outbound (current) | With fix #1 |
|---|---|---|
| 10 | ~3 MB/s (24 Mbps) | ~0.3 MB/s |
| 30 | ~27 MB/s (**216 Mbps**) | ~3 MB/s |
| 50 | ~75 MB/s (**600 Mbps**) | ~9 MB/s |

Practical wall: **~12–18 players gathered in one place**, where a typical host uplink saturates
and the matching `JSON.stringify` work blows the 50 ms snapshot budget. Combat in a shared zone
hits the same wall, less extreme. **Nobody needs another player's inventory/skills/quests** — the
fix is to send those only to their owner.

---

## Other server-side pitfalls (ranked)

- **🟠 Spatial index rebuilt ~40×/sec, dominated by 1,385 static trees.**
  `rebuildSpatialIndex()` (`:2627`) allocates 6 fresh Maps and re-inserts _every_ entity. It runs
  once in the sim tick (`:227`) **and again** in `broadcastState()` (`:1977`) — two full rebuilds
  per 50 ms cycle, ~1,460 entities each, almost all static trees/NPCs that never move (~58k
  string-keyed inserts/sec). Fix: drop the duplicate rebuild; build static layers
  (trees/NPCs/fishing/mining nodes) **once at startup**; rebuild only the dynamic sets
  (players/monsters/corpses/fires).

- **🟡 `serializePlayer` re-derives everything every tick, even for the owner.**
  `serializeSkills` (`:2486`), `serializeQuests` (`:2373`), `serializeInventory` (`:2416`, which
  re-runs `normalizeInventory`) allocate fresh arrays at 20 Hz regardless of change. Gate the
  private blocks behind a dirty flag once the public/private split (fix #1) is in.

- **🟡 All monsters on all floors simulated every tick regardless of occupancy.**
  `updateMonsters` (`:432`) iterates the full set; pack-alert (`:475-483`) is O(monsters²) per
  floor. Fine at 57, wrong shape as content grows. Skip floors with zero players.

- **🟡 `playerById()` is a linear scan of all sessions** (`:549`), called inside the monster loop
  (taunt/alert/burn) → O(players×monsters)/tick. Keep a `Map<id, player>` alongside `clients`.

- **🟢 Non-spatial per-viewer scans for some nodes.** Fishing/mining filter the global list per
  viewer (`:2020-2025`); herb nodes iterate all 14 (`:2027`). Trivial today; route through the
  spatial index when you add the static layers above.

- **🟢 Whole-DB JSON rewrite on every persist.** `persistPlayer` → `queueSave` (`:2282`) rewrites
  all of `players.json` on class change / quest turn-in / every 10 s. Single-flight + async so it
  won't corrupt, but it's an O(accounts) write. Fine to a few hundred accounts; move to per-player
  files or SQLite before that.

---

## Client-side pitfalls (`src/main.ts`)

- **🟠 A\* uses `open.sort()` every iteration** (`~2883`) instead of a priority queue —
  O(n² log n) worst case on the 90×60 floor → click-to-move lag spikes. Use a binary heap.
- **🟡 Minimap fully re-rendered every frame** (`~3852`): canvas clear + per-entity `arc()/fill()`
  over all players+monsters+NPCs. Throttle to ~10 Hz or dirty-redraw.
- **🟡 Triple per-frame entity loops** for interpolation (`~1460`) and quadruple for animation
  (`~1480`). Linear in visible entities, no pooling — fine now, watch under heavy crowds.
- **🟢 Interpolation only, no prediction** (`easeToTarget`, factor 0.32, 3-tile snap). Fine for
  co-op; add local-player prediction only if rubber-banding shows up under latency.
- **🟢 No obvious leaks** — view Maps and floaters clean up on despawn.

---

## Staged scaling plan

**Stage 0 — now → ~12 players.** Holds today as long as players stay spread out. The cliff is
_crowding_, not headcount.

**Stage 1 — the must-do for 30–50 (still single-process, no infra change). ~90% of the win:**
1. Public/private snapshot split (**fix #1 below**) — biggest single lever.
2. Private detail (inventory/skills/quests/abilities) only to its owner, only on change (dirty flags).
3. Spatial index: drop duplicate rebuild; static layers build-once.
4. `playerById` map; skip player-less floors.
5. Decouple broadcast (10–15 Hz) from sim (20 Hz) — halves bandwidth/CPU, interpolation hides it.

After Stage 1, 50 co-located players cost ~9 MB/s (~70 Mbps) outbound and a sub-ms snapshot pass —
comfortably one small cloud VM. **Do not host off a home uplink**; even post-fix, 50 players want a
datacenter NIC.

**Stage 2 — headroom (only if Stage 1 telemetry still shows pressure):** delta encoding for world
entities; binary/short-key protocol (JSON key names dominate small payloads); `bufferedAmount`
backpressure (skip a snapshot to a lagging client); heap A\* + throttled minimap on the client.

**Stage 3 — only past ~50 or many busy zones at once:** shard by floor/zone across workers (each
floor is already independent — natural seam) behind a thin gateway; persistence to SQLite/Postgres.
This rewrites the process model — **don't pre-build it**; 50 friends don't need it.

### Prioritized actions

| # | Change | Effort | Payoff |
|---|---|---|---|
| 1 | Public/private snapshot split | M | 🔴 unblocks everything |
| 2 | Owner-only private state + dirty flags | S–M | 🔴 |
| 3 | Spatial index: kill duplicate rebuild, static layers build-once | S | 🟠 |
| 4 | Decouple broadcast (10–15 Hz) from sim (20 Hz) | S | 🟠 |
| 5 | `playerById` map; skip player-less floors | S | 🟡 |
| 6 | Heap A\* + throttled minimap (client) | S–M | 🟡 |
| 7 | Delta/binary encoding + send backpressure | L | 🟢 Stage-2 |
| 8 | Per-player save / SQLite | M | 🟢 before hundreds of accounts |

---

## Fix #1 — snapshot split (proposed diff, server-only)

**Why this is low-risk:** the client reads only scalar fields for _other_ players
(`x, y, dir, moving, action, dead, name, hp, maxHp` — `main.ts:1038-1051`) and pulls its own full
record by id via `self()` (`main.ts:3748`). It never reads another player's
`inventory/skills/quests/abilities`. So we can keep the wire type (`PlayerView`) unchanged and just
emit a lightweight record for non-self players — **no protocol change, no client change.**

### 1. Add a public serializer (next to `serializePlayer`, `server/index.ts:~2104`)

```ts
// Lightweight view for OTHER players: only the fields the client renders for
// someone who isn't you (position, animation, nameplate, hp bar). Drops the
// heavy private arrays (inventory/skills/quests/abilities) that no viewer needs
// for anyone but themselves — those arrays are what made snapshots O(N^2).
function serializePlayerPublic(player: ServerPlayer): PlayerView {
  return {
    id: player.id,
    name: player.name,
    classKey: player.classKey,
    floor: player.floor,
    x: round(player.x),
    y: round(player.y),
    dir: player.dir,
    moving: player.moving,
    hp: Math.round(player.hp),
    maxHp: player.maxHp,
    mana: Math.round(player.mana),
    maxMana: player.maxMana,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    targetId: null,
    dead: player.dead,
    action: player.action ? actionView(player.action) : null,
    buffs: serializeBuffs(player),
    inventory: [],
    quests: [],
    skills: [],
    abilities: [],
    unlockedClasses: [],
    weight: 0,
    maxWeight: WEIGHT_SOFT_CAP
  };
}
```

### 2. Use it for non-self players in `buildSnapshotFor` (`server/index.ts:1990-1994`)

```ts
  const players: PlayerView[] = [];
  for (const player of querySpatial(spatial.players, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (player.id !== viewer.id && !inInterestRange(viewer, player)) continue;
    players.push(player.id === viewer.id ? serializePlayer(player) : serializePlayerPublic(player));
  }
```

That's the whole core change (~25 lines, one file). It removes ~90% of per-player bytes while
leaving every scalar the client reads intact, so nameplates/hp bars/animation are unaffected.

### Optional refinement — make it O(N) instead of O(N²) objects

The above still builds one public object per viewer-pair. To serialize each other-player **once
per tick** and reuse it across viewers, add a per-broadcast cache:

```ts
const publicViewCache = new Map<string, PlayerView>();

function broadcastState(): void {
  updateByteMetric();
  rebuildSpatialIndex();
  publicViewCache.clear();              // once per broadcast
  for (const session of clients.values()) {
    const { socket, player } = session;
    if (socket.readyState !== socket.OPEN) continue;
    const raw = JSON.stringify(buildSnapshotFor(player));
    metrics.bytesOutThisSecond += Buffer.byteLength(raw);
    socket.send(raw);
  }
}
```

…and in `buildSnapshotFor`, for non-self players:

```ts
    if (player.id === viewer.id) {
      players.push(serializePlayer(player));
    } else {
      let pub = publicViewCache.get(player.id);
      if (!pub) { pub = serializePlayerPublic(player); publicViewCache.set(player.id, pub); }
      players.push(pub);
    }
```

### Why this isn't applied yet

`server/index.ts` and `src/main.ts` are the files your background agents are editing. Applying a
diff there now risks merge churn/conflicts. When the agents finish (or you confirm they're not in
these files), the core change is server-only and safe to apply directly; I can do it and run
`npm run typecheck` + the validation below.

---

## Validate (before/after)

The server self-reports `tickMs`, `snapshotMs`, `bytesOutPerSecond` in each snapshot's `metrics`,
and `scripts/load-test.ts` aggregates them. Note this writes `data/players.json` (gitignored) and
needs a free port 8787 — don't point it at a server your agents are using.

```bash
npm run load:test -- --clients 50 --duration 20000 --combat 0   # all idle in spawn town = worst case
npm run load:test -- --clients 50 --duration 20000 --combat 1   # spread across combat zones
```

Watch `bytesOutPerSecond` and `snapshotMs.max`. Pre-fix: bytes balloon and `snapshotMs` approaches
or exceeds 50 ms as clients cluster. Post-fix #1: both should drop ~20×.
