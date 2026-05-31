# Load Baseline - 2026-05-31

Fresh baseline after the public/private snapshot split, per-session deltas,
static spatial indexing, active-region simulation, heap A*, throttled minimap,
chunked map rendering, and data-driven abilities.

## Setup

- Baseline HEAD: `4dfadec`. The worktree also contained unrelated beach
  tile/layout edits in `src/main.ts` and `src/shared.ts`; those do not touch the
  networking, snapshot, spatial-index, or load-test paths measured here.
- Server:

```bash
PORT=8788 E2E_TEST=1 TIB_ALLOW_TRANSIENT_PLAYERS=1 TIB_WS_COMPRESSION=0 node server/index.ts
```

- Driver:

```bash
node scripts/load-test.ts --port 8788 --clients 50 --duration 15000 --combat 0.4
node scripts/load-test.ts --port 8788 --clients 50 --duration 15000
```

Compression was disabled to measure raw JSON pressure. Transient E2E players
avoid save-file churn.

## 50 Clients - Mixed Town/Combat

20 of 50 clients were teleported across cemetery, crypt, and woods.

```json
{
  "clients": 50,
  "durationMs": 15000,
  "combat": {
    "ratio": 0.4,
    "assigned": 20,
    "zones": {
      "cemetery": 7,
      "crypt": 7,
      "woods": 6
    }
  },
  "opened": 50,
  "welcomed": 50,
  "states": 9577,
  "errors": 0,
  "closed": 50,
  "server": {
    "clientsPeak": 50,
    "monsters": 77,
    "spatialCells": 367,
    "socketBackpressureBytes": 524288
  },
  "snapshotFlags": {
    "staticFull": 200
  },
  "perTick": {
    "tickMs": { "samples": 9577, "min": 0.01, "max": 0.47, "avg": 0.39 },
    "snapshotMs": { "samples": 9577, "min": 0.01, "max": 5.81, "avg": 4.7 },
    "bytesOutPerSecond": { "samples": 9577, "min": 0, "max": 6544709, "avg": 5831051.83 },
    "snapshotsSentPerSecond": { "samples": 9577, "min": 0, "max": 700, "avg": 647.73 },
    "snapshotsSkippedBackpressurePerSecond": { "samples": 9577, "min": 0, "max": 0, "avg": 0 }
  },
  "perClient": {
    "visiblePlayers": { "samples": 9577, "min": 1, "max": 30, "avg": 20.28 },
    "visibleMonsters": { "samples": 9577, "min": 0, "max": 5, "avg": 1.08 },
    "visibleTrees": { "samples": 9577, "min": 0, "max": 296, "avg": 85.63 },
    "visibleFires": { "samples": 9577, "min": 0, "max": 0, "avg": 0 }
  }
}
```

## 50 Clients - Clustered Town

All clients spawned together in town, making this the worst current test for
visible-player density.

```json
{
  "clients": 50,
  "durationMs": 15000,
  "combat": {
    "ratio": 0,
    "assigned": 0,
    "zones": {}
  },
  "opened": 50,
  "welcomed": 50,
  "states": 9592,
  "errors": 0,
  "closed": 50,
  "server": {
    "clientsPeak": 50,
    "monsters": 77,
    "spatialCells": 359,
    "socketBackpressureBytes": 524288
  },
  "snapshotFlags": {
    "staticFull": 200
  },
  "perTick": {
    "tickMs": { "samples": 9592, "min": 0.01, "max": 0.29, "avg": 0.24 },
    "snapshotMs": { "samples": 9592, "min": 0.01, "max": 6.3, "avg": 5.09 },
    "bytesOutPerSecond": { "samples": 9592, "min": 0, "max": 10595912, "avg": 9417464.33 },
    "snapshotsSentPerSecond": { "samples": 9592, "min": 0, "max": 700, "avg": 648.49 },
    "snapshotsSkippedBackpressurePerSecond": { "samples": 9592, "min": 0, "max": 0, "avg": 0 }
  },
  "perClient": {
    "visiblePlayers": { "samples": 9592, "min": 2, "max": 50, "avg": 49.28 },
    "visibleMonsters": { "samples": 9592, "min": 0, "max": 0, "avg": 0 },
    "visibleTrees": { "samples": 9592, "min": 0, "max": 100, "avg": 88.09 },
    "visibleFires": { "samples": 9592, "min": 0, "max": 0, "avg": 0 }
  }
}
```

## 100 Clients - Distributed Regional Combat

100 clients were distributed evenly across cemetery, crypt, woods, and
woodsNorth with active monster targeting. This exercises active-region scaling
and combat fanout without making every client see every other client.

```json
{
  "clients": 100,
  "durationMs": 20000,
  "opened": 100,
  "welcomed": 100,
  "states": 25046,
  "errors": 0,
  "closed": 100,
  "server": {
    "clientsPeak": 100,
    "monsters": 77,
    "spatialCells": 221,
    "socketBackpressureBytes": 524288
  },
  "snapshotFlags": {
    "staticFull": 400
  },
  "perTick": {
    "tickMs": { "samples": 25046, "min": 0.02, "max": 0.81, "avg": 0.64 },
    "snapshotMs": { "samples": 25046, "min": 0.09, "max": 11.81, "avg": 10.06 },
    "bytesOutPerSecond": { "samples": 25046, "min": 0, "max": 13230504, "avg": 12061392.06 },
    "snapshotsSentPerSecond": { "samples": 25046, "min": 0, "max": 1400, "avg": 1314.02 },
    "snapshotsSkippedBackpressurePerSecond": { "samples": 25046, "min": 0, "max": 0, "avg": 0 },
    "eventsDroppedPerSecond": { "samples": 25046, "min": 0, "max": 0, "avg": 0 },
    "heapUsedMb": { "samples": 25046, "min": 11.08, "max": 29.56, "avg": 20.55 },
    "rssMb": { "samples": 25046, "min": 94.48, "max": 143.04, "avg": 132.28 },
    "residentStaticResources": { "samples": 25046, "min": 29, "max": 824, "avg": 699.89 }
  },
  "perClient": {
    "visiblePlayers": { "samples": 25046, "min": 1, "max": 25, "avg": 24.34 },
    "visibleMonsters": { "samples": 25046, "min": 0, "max": 8, "avg": 3.24 },
    "visibleTrees": { "samples": 25046, "min": 0, "max": 330, "avg": 129.4 }
  }
}
```

## Interpretation

- Both 50-client scenarios completed with `0` socket errors and `0` backpressure skips.
- The 100-client distributed scenario also completed with `0` socket errors,
  `0` backpressure skips, and `0` event drops.
- The clustered-town run validates the original post-fix bandwidth estimate:
  roughly 9 MB/s raw outbound for 50 co-located players.
- The perf gate now includes a 150-client co-located town crowd scenario with
  `TIB_MAX_VISIBLE_PLAYERS=50`, keeping each client at or below 50 visible
  player views instead of letting crowded hubs grow without bound. That scenario
  runs with WebSocket compression enabled and gates actual socket wire bytes.
- Snapshot build stayed under 6.3 ms max, well below the 75 ms broadcast interval.
- Tick time stayed under 0.5 ms max in these samples.
- `npm run perf:gate` now starts isolated E2E servers and re-runs the two
  50-client scenarios plus co-located crypt combat and slow-reader smoke
  scenarios with conservative failure thresholds. Use it before risky network,
  spatial, AI, or content-density changes.
- `npm run perf:soak` runs a longer 50-client mixed-combat soak gate for
  changes that may leak memory, accumulate stale snapshot cache state, or drift
  over time.
- Snapshot metrics now include heap/RSS, dynamic entity count, and resident
  static resource count so the gates can catch memory or world-residency
  regressions before the authored world grows.
- Snapshot metrics now include total per-session delta-cache entries and the
  largest single-session cache. The perf gate caps these so interest caches stay
  tied to nearby visible entities rather than accumulated travel history. The
  latest full gate peaked around `22.6k` total cache entries and `349` entries
  in the largest single-session cache.
- Static resource full snapshot flags are now counted by the load driver.
  `staticFull: 200` means 50 clients received one initial full sync for each of
  the four static categories; the gate fails if periodic recovery starts
  resending full static lists again.
- Tree resources are now chunk-derived instead of spawned whole-world at boot.
  The 50-client gate tightened `residentStaticResources.max` to `1200`; the
  current 100-client regional gate peaks around `800` resident static resources
  while preserving visible-tree density.
- Fishing, mining, and herb nodes now use the same active-cell runtime
  residency model. Their authored definitions are still source data, but they
  no longer populate the runtime static spatial index for cold regions.
- Transient event queues now expose `eventsDroppedPerSecond`; the local perf
  gate requires it to remain `0` for normal clustered, mixed, combat, and
  slow-reader scenarios.
- Client command intake is now byte-capped and token-bucket rate-limited per
  socket before JSON parsing. The local perf gate tracks
  `clientMessagesDroppedPerSecond` and requires it to remain `0` for normal
  scenarios, proving the guards do not affect expected playtest input rates.
  Low-limit and oversized-payload tripwire scenarios require drops, so both
  guard paths are covered too.
- The load driver now records raw state message byte sizes. The perf gate caps
  state packets at `60 KB` max and `25 KB` average; the latest 100-client
  targeted regional sample peaked at roughly `27 KB` and averaged roughly `7 KB`.
- State packets now omit empty removed-id lists and empty event arrays on the
  wire; clients treat absent values as empty, preserving compatibility while
  trimming repeated JSON key overhead.
- Metrics frames are now sent at a per-client interval instead of on every state
  packet. The client carries forward the latest frame, and `npm run perf:gate`
  requires minimum metrics sample counts so the telemetry path remains covered.
- Metrics frames now use compact wire keys and expand back to `StateMetrics`
  through shared client/load-test normalization, trimming observability overhead
  without changing HUD or gate code.
- State packets now use compact top-level and entity keys on the wire and are
  expanded by shared client/load-test helpers. The perf gate requires minimum
  compact-state counts, proving the compact path is active during every load
  scenario.
- Monster and NPC views are now cached per broadcast sequence and reused across
  observing clients, so clustered combat pays for one serialization/signature
  pass per entity per tick rather than one per entity per viewer.
- The load driver tracks state-packet parse, compact-normalize, and total decode
  timing with p95 summaries. The latest full gate kept state decode averages at
  or below `0.07 ms` per packet, with worst single-sample decode around
  `3.16 ms`.
- Event-loop delay metrics now track mean, p95, and max delay per metrics
  window. The latest full gate's worst scenario stayed around `13.1 ms` mean,
  `29.1 ms` p95, and `49.2 ms` max.
- `npm run check` now includes `npm run assets:budget`, currently guarding
  runtime assets at `100 MiB` total, `5 MiB` per file, and `500` files. The
  same gate now tracks Phaser startup preload separately; current preload is
  `44` files / `42.06 MiB` against a `55 MiB` / `60` file budget.
- Save flush telemetry is now part of snapshots and the load driver. The perf
  gate includes a 25 persistent-client temp-data scenario with
  `TIB_SAVE_CONCURRENCY=4`, ensuring player-file saves stay bounded without
  touching the real `data/players` directory.
- The next performance work should be longer/slow-client scenarios and eventual
  protocol compaction only if telemetry asks for it.

## Same-Day Protocol Compaction Gate

After throttling metrics frames and compacting state/entity wire keys,
`npm run perf:gate` passed all scenarios with explicit minimum metrics-sample
and compact-state thresholds. Headline state-packet averages:

| Scenario | Metric samples | Compact states | State bytes avg/max | Wire bytes avg/max |
|---|---:|---:|---:|---:|
| 50 clustered town | 709 | 9,558 | 10.83 / 18.87 KB | 6.57 / 7.99 MB/s |
| 150 capped town, compressed | 1,517 | 20,225 | 11.24 / 19.03 KB | 5.22 / 6.68 MB/s |
| 50 mixed town/combat | 709 | 9,558 | 6.75 / 24.06 KB | 4.06 / 4.85 MB/s |
| 100 distributed regional combat | 1,826 | 24,983 | 6.97 / 26.67 KB | 8.68 / 10.13 MB/s |
| 50 co-located crypt combat | 710 | 9,573 | 10.45 / 13.50 KB | 6.35 / 7.50 MB/s |
| 50 mixed slow readers | 639 | 8,630 | 6.98 / 24.06 KB | 4.04 / 4.92 MB/s |
| 25 persistent save flush | 315 | 4,233 | 7.58 / 15.19 KB | 2.25 / 2.77 MB/s |
