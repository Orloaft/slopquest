# Waystone — Asset Gaps Worklist

Hard requirements for the next Asset Forge generation loop. These are genuine art gaps
the current Waystone index **cannot** satisfy for 1:1 mockup parity
(`assetsources/waystone/waystone-mockup.jpg`). The compositor/baker cannot fake them —
flagged per the §3 honesty audit in `world_crafting_spec.md`.

All sheets follow the standard pipeline (`world_crafting_spec.md` §2/§8):
magenta `#FF00FF` background, hard edges, **fixed visual cell order**, 32px authored @1×,
sliced with the magenta key (`blue ≥ green + 8`).

## 1. Roof palette variants

The mockup shows the cottage row in **three distinct slate-roof colors** (red, yellow, blue).
The current bespoke house assets do not carry per-roof-color variants.

- [ ] **Red slate roof** sheet
- [ ] **Yellow slate roof** sheet
- [ ] **Blue slate roof** sheet

Author as a roof-tile set (or full house variants) in fixed-cell order so the slicer can
index each color deterministically. Match the existing house sprite dims used in
`tools/build-waystone-from-authored.ts` (the `B(...)` bespoke placements).

## 2. Unique main tower (starting-town variant)

The mockup's main tower must read as a distinct **starting-town landmark**, not the reused
Northwood `watchtower.png`.

- [ ] **`tower-waystone.png`** — bespoke tower distinct from `watchtower.png`.

Target spec dims to drop into the baker's `B(...)` block alongside the current watchtower
entry (`build-waystone-from-authored.ts:64`):

```ts
// current:
B("spriteWatchtower", `${BESPOKE}/watchtower.png`, 96, 224, 104, 11, 120, [2, 2]),
// add a distinct main tower, e.g.:
B("spriteTowerWaystone", `${BESPOKE}/tower-waystone.png`, 96, 256, <tx>, <ty>, 128, [2, 2]),
```

Pick `nw/nh` to fit the authored art; `block` footprint `[2,2]` unless the silhouette needs more.

---

_Generated 2026-06-03 during the Waystone overhaul pass. Tied to the elevation/fence parity
work in the same session — see git history for the elevation stagger commit._
