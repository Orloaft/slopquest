# Load Baseline — 2026-05-28

First captured baseline before the spatial-grid / snapshot-delta work in the README's "Next foundation targets" section. Re-run after each foundation change and compare.

## Setup

- Commit: `7fb9566` (E2E: cover YAML quest dialogue end-to-end)
- Server: `node server/index.js` on `ws://127.0.0.1:8787` (default config, no env overrides)
- Driver: `node scripts/load-test.js` with defaults
- Clients: 12 simulated WebSocket joiners, random WASD input every 90 ms
- Duration: 10 000 ms
- Errors: 0 / 12 clients welcomed and closed cleanly
- State messages observed: 2346

All clients join via the standard `join` flow and therefore spawn in `southTown` (Waystone), which has **no monster spawns**. Treat this as a "crowded town" baseline, not a "combat zone" baseline. A future driver should teleport some fraction of clients into `cemetery` / `crypt` / `woods` to exercise the AoI + combat paths.

## Result

Raw output of `node scripts/load-test.js`:

```json
{
  "url": "ws://127.0.0.1:8787",
  "clients": 12,
  "durationMs": 10000,
  "opened": 12,
  "welcomed": 12,
  "states": 2346,
  "errors": 0,
  "closed": 12,
  "server": {
    "clientsPeak": 12,
    "monsters": 30,
    "spatialCells": 79
  },
  "perTick": {
    "tickMs":            { "samples": 2346, "min": 0.30, "max": 0.40, "avg": 0.35 },
    "snapshotMs":        { "samples": 2346, "min": 0.08, "max": 2.81, "avg": 2.15 },
    "bytesOutPerSecond": { "samples": 2346, "min": 0,    "max": 6298266, "avg": 5623180.16 }
  },
  "perClient": {
    "visiblePlayers":  { "samples": 2346, "min": 2, "max": 12, "avg": 11.94 },
    "visibleMonsters": { "samples": 2346, "min": 0, "max": 0,  "avg": 0.00 },
    "visibleTrees":    { "samples": 2346, "min": 5, "max": 7,  "avg": 6.52 },
    "visibleFires":    { "samples": 2346, "min": 0, "max": 0,  "avg": 0.00 }
  }
}
```

## Highlights

- **Server-wide tick** averages 0.35 ms — well within the 50 ms tick budget (~0.7 % headroom used).
- **Snapshot build** averages 2.15 ms, peaks at 2.81 ms — also well inside the 50 ms snapshot interval.
- **Outbound bandwidth** averages ~5.6 MB/s server-wide for 12 town-clustered clients (~470 KB/s per client). This is full-snapshot traffic; once snapshot deltas land this number is the obvious before-shot.
- **AoI sanity**: every client sees ~12 players (the whole crowd is in town) and ~6–7 trees. `visibleMonsters` is 0 because no client crosses into a combat zone.
- 79 spatial cells were allocated on the server side at peak.

## Re-running

```bash
node server/index.js &
SERVER_PID=$!
# (wait a second for ws://0.0.0.0:8787 to bind)
node scripts/load-test.js
kill $SERVER_PID
```

Optional overrides: `--clients N`, `--duration MS`, `--port 8787`, `--url ws://host:port`.

## Next baselines to capture

- ~~Same config but with half the clients teleported into `cemetery` and `woods` (covers visibleMonsters + combat tick cost).~~ *Captured below.*
- 32-client run for stress (default is 12; bytes/s per client should stay roughly flat under full snapshots and *fall* once deltas ship).
- Re-capture immediately after the spatial-grid bucket change to confirm `spatialCells` behaviour and tick cost.

## Combat-zone baseline (2026-05-28)

Same driver, but six of twelve clients (`--combat 0.5`) teleport into `cemetery`, `crypt`, and `woods` immediately after `welcome` via the `e2eGrantItems` debug message. Requires the server to be started with `E2E_TEST=1`; the other six remain in southTown.

### Setup

- Commit: `2f58b72` (Load test: capture snapshot metrics and record a baseline) + this run's local change adding `--combat` / `--zones` to the driver.
- Server: `E2E_TEST=1 node server/index.js` on `ws://127.0.0.1:8787`.
- Driver: `node scripts/load-test.js --combat 0.5` (default zones: `cemetery,crypt,woods`; 2 clients teleported per zone).
- Teleport targets: `cemetery` (floor 1, 18.5/12.5), `crypt` (floor 2, 22.5/23.5), `woods` (floor 3, 16.5/20.5) — all near monster spawn clusters from `content/spawns.yaml`.
- Clients: 12 simulated, random WASD every 90 ms, 10 000 ms duration.
- Errors: 0 / 12 welcomed and closed cleanly.

### Result

```json
{
  "url": "ws://127.0.0.1:8787",
  "clients": 12,
  "durationMs": 10000,
  "combat": { "ratio": 0.5, "assigned": 6, "zones": { "cemetery": 2, "crypt": 2, "woods": 2 } },
  "opened": 12,
  "welcomed": 12,
  "states": 2352,
  "errors": 0,
  "closed": 12,
  "server": {
    "clientsPeak": 12,
    "monsters": 30,
    "spatialCells": 78
  },
  "perTick": {
    "tickMs":            { "samples": 2352, "min": 0.31, "max": 0.43, "avg": 0.37 },
    "snapshotMs":        { "samples": 2352, "min": 0.10, "max": 2.21, "avg": 1.64 },
    "bytesOutPerSecond": { "samples": 2352, "min": 0,    "max": 2901036, "avg": 2574385.29 }
  },
  "perClient": {
    "visiblePlayers":  { "samples": 2352, "min": 1, "max": 6,   "avg": 3.98 },
    "visibleMonsters": { "samples": 2352, "min": 0, "max": 15,  "avg": 3.06 },
    "visibleTrees":    { "samples": 2352, "min": 0, "max": 124, "avg": 23.48 },
    "visibleFires":    { "samples": 2352, "min": 0, "max": 0,   "avg": 0 }
  }
}
```

### Compared to the town-only baseline

- **Server tick** rose marginally: 0.35 → 0.37 ms avg (+5 %). Combat AI scans are nearly free at this scale.
- **Snapshot build** *dropped*: 2.15 → 1.64 ms avg (-24 %). Clients are spread across five floors now, so per-snapshot AoI sets are smaller.
- **Outbound bandwidth** roughly halved: 5.62 MB/s → 2.57 MB/s avg server-wide. Same root cause — players no longer all-see-all in southTown, so each snapshot ships fewer entities.
- **`visibleMonsters`** went from 0 to avg 3.06 / max 15 — combat zones are now exercised. Once snapshot deltas land, monster churn (HP, position, attack state) is where the win/regression will show up first.
- **`visibleTrees`** jumped from ~6.5 to ~23.5 avg with a max of 124. The `woods` floor is tree-dense; this is the realistic upper bound for tree visibility per snapshot.
- **`spatialCells`** dropped 79 → 78 (noise; both runs at full server population).

This is now the better "real gameplay" before-shot for the upcoming spatial-grid / snapshot-delta work. The town-only baseline above is still useful as the worst-case clustered-bandwidth scenario.

### Re-running

```bash
E2E_TEST=1 node server/index.js &
SERVER_PID=$!
# (wait ~1.5 s for ws://0.0.0.0:8787 to bind)
node scripts/load-test.js --combat 0.5
kill $SERVER_PID
```

Optional overrides: `--combat 0..1` (fraction teleported), `--zones cemetery,crypt,woods` (subset/order), plus the existing `--clients N`, `--duration MS`, `--port 8787`, `--url ws://host:port`. With `--combat 0` or against a non-E2E server, the driver behaves exactly as the original town-only baseline.
