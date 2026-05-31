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
- Static resource full snapshot flags are now counted by the load driver.
  `staticFull: 200` means 50 clients received one initial full sync for each of
  the four static categories; the gate fails if periodic recovery starts
  resending full static lists again.
- Tree resources are now chunk-derived instead of spawned whole-world at boot.
  The 50-client gate tightened `residentStaticResources.max` to `1200`; the
  latest mixed town/combat run peaked at `774` resident static resources while
  preserving visible-tree density.
- Transient event queues now expose `eventsDroppedPerSecond`; the local perf
  gate requires it to remain `0` for normal clustered, mixed, combat, and
  slow-reader scenarios.
- The load driver now records raw state message byte sizes. The perf gate caps
  state packets at `60 KB` max and `25 KB` average; the latest 100-client
  targeted regional sample peaked at roughly `33 KB` and averaged roughly `9 KB`.
- The next performance work should be longer/slow-client scenarios and eventual
  protocol compaction only if telemetry asks for it.
