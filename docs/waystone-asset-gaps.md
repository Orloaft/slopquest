# Waystone — Asset Gaps Worklist

Hard requirements for the next Asset Forge generation loop. These are genuine art gaps
the current Waystone index **cannot** satisfy for 1:1 mockup parity
(`assetsources/waystone/waystone-mockup.jpg`). The compositor/baker cannot fake them —
flagged per the §3 honesty audit in `world_crafting_spec.md`.

All sheets follow the standard pipeline (`world_crafting_spec.md` §2/§8):
magenta `#FF00FF` background, hard edges, **fixed visual cell order**, 32px authored @1×,
sliced with the magenta key (`blue ≥ green + 8`).

## 1. Roof palette variants — ✅ RESOLVED (no gap; closed 2026-06-03)

**Not a real gap.** The houses are `townTiles` atlas slices, and the baker already places
four distinct colors — `spriteRedHouse`, `spriteThatchHouse` (yellow), `spriteGreenHouse`,
`spriteBlueHouse` (`build-waystone-from-authored.ts:57-60`). The render confirms a red roof
and a yellow thatch roof in the top row plus the blue west manor, which covers the mockup's
red/yellow/blue trio. No generation needed; the original flag was made from the mockup alone
without checking the atlas. Reopen only if we want bespoke half-timbered houses for higher
fidelity than the atlas slices.

## 2. Unique main tower (starting-town variant) — 🎯 ACTIVE

The mockup's main tower must read as a distinct **starting-town landmark**, not the reused
Northwood `watchtower.png` (currently identical art → breaks regional identity).

- [ ] **`tower-waystone.png`** — bespoke town tower (square stone base + oversailing
  half-timber gallery + teal/brown hip roof, NOT a grey round turret with a red cone).

**Generation prompt + full wiring contract:** `docs/waystone-tower-prompt.md`.
Target B(...) swap at `build-waystone-from-authored.ts:64` (keeps map position col 104, row 11):

```ts
B("spriteWatchtower", `${BESPOKE}/tower-waystone.png`, 112, 256, 104, 11, 140, [3, 2]),
```

Set `nw/nh` to the trimmed PNG's actual px. Then `npm run assets:waystone && npm run workflow:waystone`.

---

_Generated 2026-06-03 during the Waystone overhaul pass. Tied to the elevation/fence parity
work in the same session — see git history for the elevation stagger commit._
