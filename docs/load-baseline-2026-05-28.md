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

- Same config but with half the clients teleported into `cemetery` and `woods` (covers visibleMonsters + combat tick cost).
- 32-client run for stress (default is 12; bytes/s per client should stay roughly flat under full snapshots and *fall* once deltas ship).
- Re-capture immediately after the spatial-grid bucket change to confirm `spatialCells` behaviour and tick cost.
