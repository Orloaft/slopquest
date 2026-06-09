# MMO Production Readiness Reassessment

Use this template when content, renderer, networking, or server changes could
move TIB closer to MMO-scale production risk. Keep the reassessment short, save
the supporting JSON artifacts, and let `node scripts/perf-reassess.ts`
summarize the bundle.

## Verdict

- Date:
- Commit range:
- Assessor:
- Overall grade: `PASS | WARN | FAIL`
- Ship decision: `ship | hold | stack review`
- Blockers:
- Follow-up owner:

## Artifact Bundle

Save JSON evidence under `docs/performance/artifacts/<date>/`:

- Asset budget output from `npm run assets:budget`.
- Browser visual perf JSON from `npm run perf:visual` with a JSON reporter.
- Repeated browser visual evidence from `npm run perf:visual:repeat -- --runs=3`
  when a single run is close to the threshold or host load is suspected.
- Server load JSON from the `scripts/load-test.ts` scenarios behind
  `npm run perf:gate` and `npm run perf:gate:prod`.
- Soak and stress JSON from `npm run perf:soak` and `npm run perf:stress` when
  the change affects memory, fanout, persistence, streaming, or density.
- Optional manual JSON for evidence that only exists as a human checklist.

Manual JSON sections may use `status`, `grade`, or `result` with
`pass`, `warn`, or `fail`:

```json
{
  "assetBudgets": {
    "status": "pass",
    "summary": "preload 43.2 MB / 55 MB; 74 / 80 preload files"
  },
  "streaming": {
    "status": "warn",
    "summary": "floor transition p95 430 ms; jungle tiles still preload"
  },
  "stackPivot": {
    "status": "pass",
    "summary": "single Node/WebSocket shard still has >2x headroom at 150 clients"
  }
}
```

## Checklist

### Asset Budgets

- Startup preload budget stays within `32 MiB` and `64` files.
- Lazy/play-context budget stays within `32 MiB` and `128` files, with headroom
  recorded from `artifacts/asset-budget-report.json`.
- Runtime assets are lowercase, compressed, and deduplicated.
- New floor, enemy, spell, and UI assets have explicit load ownership:
  preload only if needed before login or first spawn, otherwise streamed.
- Budget failures include the largest offenders and a removal, compression, or
  streaming plan.

### Streaming

- Initial route to login and first spawn does not fetch future floor art.
- Floor and biome transitions have p95 load/settle time recorded.
- Static resource residency remains bounded during travel, not proportional to
  authored world size.
- Snapshot/delta caches are tied to current interest, not travel history.
- Repeated full static snapshots are limited to initial category syncs.

### Browser Visual Performance

- `npm run perf:visual` passes on Chromium.
- `npm run perf:visual:repeat -- --runs=3` passes before declaring a
  host-sensitive browser warning resolved.
- No blank canvas, missing tiles, major overlap, or sustained camera jitter.
- Target crowd scene holds 55-60 FPS on the reference machine.
- Frame p95 is under `16.7 ms`; long tasks above `50 ms` are explained.
- Client decode/normalize timings stay inside the server gate thresholds.

### Server Gates

- `npm run perf:gate` passes.
- `npm run perf:gate:prod` passes before production-like claims.
- Tick, snapshot, pathfinding, event loop, backpressure, dropped-event, and
  persistence-save gates have no threshold failures.
- Co-located crowd and distributed combat scenarios both pass.
- Boss telegraph visibility survives cosmetic event pressure.

### Soak And Stress

- Run soak for changes that can leak memory or accumulate caches.
- Run stress for changes that affect fanout, interest management, combat
  density, compression, or persistence.
- Soak notes include duration, clients, combat mix, heap/RSS start and end,
  errors, dropped messages, save queue depth, and cache growth.
- Stress notes include max connected clients, visible-player cap, average wire
  bytes, snapshot max, event loop p95, and where the first bottleneck appears.

### Memory

- Heap and RSS max stay below gate budgets for the scenario.
- Heap/RSS slope during soak is flat after warmup.
- Snapshot cache entries peak within the configured cap and shrink after travel.
- Static resource residency stays bounded by active regions.
- Save queue depth and in-flight writes return to zero after load ends.

### Stack Pivot Criteria

Open a stack review if any condition repeats after asset reduction, streaming,
interest management, and scenario-specific tuning:

- Browser frame p95 remains above `16.7 ms` or FPS remains below `55` in the
  reference crowd scene.
- Server tick max stays above `50 ms`, snapshot max above `75 ms`, or event loop
  p95 above `40 ms` in production-like load.
- Backpressure skips, socket terminations, dropped events, or dropped client
  messages are non-zero in gate runs.
- Heap exceeds `1 GiB`, RSS exceeds `2 GiB`, or soak shows sustained growth after
  warmup.
- Single-process Node/WebSocket cannot pass the 150-client production-like gate
  with compression and visible-player caps enabled.
- JSON persistence causes sustained save queue depth or non-zero in-flight saves
  after a load run; plan SQLite/Postgres before adding more persistence load.
- Asset budget can only pass by removing required MMO content; plan stronger
  chunking, CDN packaging, or renderer pipeline changes.

## Compact Report

```text
Date:
Commit range:
Artifacts:

asset-budgets:
streaming:
browser-visual-perf:
server-gates:
soak-stress:
memory:
stack-pivot:

Decision:
Blockers:
Next reassessment trigger:
```

Run the artifact grader:

```bash
node scripts/perf-reassess.ts docs/performance/artifacts/<date>
```
