# Sprite Prototype Probes

This prompt pack defines the next small prototype slice before bulk enemy
restyling. It uses `docs/enemy-sprite-style-bible.md` as the style authority.
Do not mix in older direction from legacy manifests or historical generator
prompts unless the bible is revised to link them.

## Probe Set

Run exactly these four probes first:

- `reach-vole-anchor`: regenerate and confirm the approved reach vole anchor.
- `biped-bandit-probe`: test a compact upright two-legged enemy body plan.
- `mire-wisp-flyer-probe`: test a hovering flyer / odd-body enemy body plan.
- `base-player-probe`: test a base player walk sheet using the same discipline.

The player probe is probe-only and should follow
`docs/player-sprite-style-bible.md` as draft/probe authority. That draft borrows
the enemy sheet contract, prompt discipline, artifact review, and validation
gates, but it is not final bulk-production authority. It also allows cleaner,
more appealing protagonist contrast and stronger at-a-glance readability than
the hostile/natural enemy probes.

## Frozen Shared Prompt Header

Copy this header verbatim for every probe and replace only the variable slots.

```text
Create a 4x4 pixel-art sprite sheet on a perfectly flat pure magenta #ff00ff
background for chroma-key extraction.

Subject: {SUBJECT}
Body plan: {BODY_PLAN}
Fantasy accents: {FANTASY_ACCENTS}
Palette notes: {PALETTE_NOTES}
Scale notes: {SCALE_NOTES}

Style: old-school top-down RPG creature sprite with strong dark outline,
restrained 12-24 color-ish palette, crisp pixel-art clusters, top-left lighting,
hostile/natural tone, and clear gameplay readability. Do not copy Tibia assets.

Sheet contract: 384x384 preferred, 4 columns by 4 rows, 96x96 cells. Row order
is walk_up/back, walk_right, walk_down/front, walk_left. Author 4 unique frames
per row with visible paw/body/head pose changes and stable scale/alignment.
Do not use flip, mirror, darken, or recolor substitutions for any facing.
Do not use magenta inside the creature.
```

## Per-Probe Variable Slots

### reach-vole-anchor

```text
Subject: original small woodland enemy named reach vole; compact crafty vole-like monster for game-scale readability
Body plan: chunky low quadruped body, pointed snout, alert rounded ears, small dark eyes, visible paws/claws, short tail, fur tufts around cheeks and shoulders
Fantasy accents: subtle natural markings, slightly oversized digging claws, wary hostile posture, light shoulder ruff; no props, clothing, armor, or mascot styling
Palette notes: restrained woodland browns, warm gray belly, dark outline, small tan highlights, minimal high-contrast markings to preserve identity across frames
Scale notes: small enemy footprint with generous padding in each 96x96 cell; low scurry motion; stable baseline and center, readable at runtime scale
```

### biped-bandit-probe

```text
Subject: original small hostile biped enemy named thorn gobbet; wiry forest raider silhouette without weapons or readable human equipment
Body plan: compact upright two-legged body, hunched shoulders, large head, long forearms, clawed hands, bent knees, oversized feet, sharp nose and ears
Fantasy accents: thorny bark-like ridges on shoulders and forearms, ragged leaf-like tufts, feral expression; no swords, shields, helmets, text, or humanoid costume detail
Palette notes: restrained moss green, bark brown, muted ochre highlights, dark outline, small red-orange eye accents only if they remain crisp
Scale notes: medium-small enemy footprint; head and hands must read clearly in all facings; keep feet planted and baseline stable through the walk cycle
```

Review result: first probe mechanically passed after normalization into
`384x384` / `4x4` / `96px` cells at `24` colors, but it is a prompt-adjust
candidate rather than a keeper. Preserve the strong thorn gobbet identity while
tightening the front/down row: no frame-height pop, no baseline jump, no scale
change between walk_down frames.

Ready-to-send retry prompt:

```text
Create a 4x4 pixel-art sprite sheet on a perfectly flat pure magenta #ff00ff
background for chroma-key extraction.

Subject: original small hostile biped enemy named thorn gobbet; wiry forest raider silhouette without weapons or readable human equipment
Body plan: compact upright two-legged body, hunched shoulders, large head, long forearms, clawed hands, bent knees, oversized feet, sharp nose and ears
Fantasy accents: thorny bark-like ridges on shoulders and forearms, ragged leaf-like tufts, feral expression; no swords, shields, helmets, text, or humanoid costume detail
Palette notes: restrained moss green, bark brown, muted ochre highlights, dark outline, small red-orange eye accents only if they remain crisp
Scale notes: medium-small enemy footprint with generous padding in every 96x96 cell; maintain the same full-body height and apparent body mass in all 16 frames; in the walk_down/front row, keep both feet planted on one shared baseline, keep the top of the head at a matched height, and keep the torso/feet scale consistent from frame to frame with no popping taller, shrinking, or vertical bob beyond 1-2 pixels

Style: old-school top-down RPG creature sprite with strong dark outline,
restrained 12-24 color-ish palette, crisp pixel-art clusters, top-left lighting,
hostile/natural tone, and clear gameplay readability. Do not copy Tibia assets.

Sheet contract: 384x384 preferred, 4 columns by 4 rows, 96x96 cells. Row order
is walk_up/back, walk_right, walk_down/front, walk_left. Author 4 unique frames
per row with visible arm/leg/head pose changes and stable scale/alignment.
For the walk_down/front row especially, lock the feet to a consistent ground
line and keep the head top, centerline, full-body scale, and bounding-box height
matched across all 4 frames. Do not use flip, mirror, darken, or recolor
substitutions for any facing. Do not use magenta inside the creature.
```

### mire-wisp-flyer-probe

```text
Subject: original hovering odd-body enemy named mire wisp; hostile swamp spirit with a readable floating body
Body plan: round compact floating core, trailing ragged lower wisps, two small wing-like fins or vapor fins, simple face marks that turn with each facing
Fantasy accents: swamp-flame crown, dangling reed-like tendrils, faint skull or mask suggestion through shape only; no glow spilling onto the magenta background
Palette notes: restrained teal, sickly green, dark blue-gray outline, pale yellow-green highlights, strong silhouette contrast without soft blur
Scale notes: medium-small floating enemy footprint; hovering bob motion must be authored per frame while keeping center and apparent size stable
```

### base-player-probe

```text
Subject: original base player adventurer probe; neutral readable top-down RPG player character for motion/style testing only
Body plan: compact upright humanoid, clear head/torso/legs, simple boots and gloves, short hair or hood shape, arms visible in side and front facings
Fantasy accents: plain travel tunic, small belt shape, minimal shoulder detail; no class-specific weapon, shield, cape, logo, or ornate costume
Palette notes: restrained readable cloth palette with muted blue tunic, warm leather boots/belt, skin or hood tones, dark outline, top-left highlights
Scale notes: player-sized footprint slightly taller than small enemies but still padded inside 96x96 cells; stable registration suitable for future outfit tests
```

## Next Enemy Batch After Anchor/Biped

After `reach-vole-anchor` and `biped-bandit-probe`, the next enemy-only batch
should cover silhouette and facing risks that those probes do not exercise.
Recommended order:

- `mire-wisp-flyer-probe`: already defined above; tests hovering odd-body
  motion, front/back face readability, and no-glow magenta discipline.
- `reed-mantis-probe`: tests a tall narrow insectoid with thin limbs, angled
  silhouette, and authored left/right rows that cannot pass as simple mirrors.
- `bog-slime-probe`: tests amorphous wobble, nonstandard footprint, and hard
  pixel clusters without alpha haze, glow, or painterly translucency.

Ready-to-send prompts:

### mire-wisp-flyer-probe

```text
Create a 4x4 pixel-art sprite sheet on a perfectly flat pure magenta #ff00ff
background for chroma-key extraction.

Subject: original hovering odd-body enemy named mire wisp; hostile swamp spirit with a readable floating body
Body plan: round compact floating core, trailing ragged lower wisps, two small wing-like fins or vapor fins, simple face marks that turn with each facing
Fantasy accents: swamp-flame crown, dangling reed-like tendrils, faint skull or mask suggestion through shape only; no glow spilling onto the magenta background
Palette notes: restrained teal, sickly green, dark blue-gray outline, pale yellow-green highlights, strong silhouette contrast without soft blur
Scale notes: medium-small floating enemy footprint; hovering bob motion must be authored per frame while keeping center and apparent size stable

Style: old-school top-down RPG creature sprite with strong dark outline,
restrained 12-24 color-ish palette, crisp pixel-art clusters, top-left lighting,
hostile/natural tone, and clear gameplay readability. Do not copy Tibia assets.

Sheet contract: 384x384 preferred, 4 columns by 4 rows, 96x96 cells. Row order
is walk_up/back, walk_right, walk_down/front, walk_left. Author 4 unique frames
per row with visible core/fin/tendril bob changes and stable scale/alignment.
Do not use flip, mirror, darken, or recolor substitutions for any facing.
Do not use magenta inside the creature.
```

### reed-mantis-probe

```text
Create a 4x4 pixel-art sprite sheet on a perfectly flat pure magenta #ff00ff
background for chroma-key extraction.

Subject: original hostile marsh insect enemy named reed mantis; sharp reedy ambusher with a readable top-down game silhouette
Body plan: tall narrow insectoid body, triangular head, bent raptorial forelegs, two smaller rear legs, thin abdomen, hooked feet, antennae kept short and readable
Fantasy accents: reed-blade ridges on forearms and back, small swamp thorn plates, predatory posture; no weapons, armor, clothing, text, logos, or human equipment
Palette notes: restrained olive green, reed tan, dark brown outline, muted yellow highlights, tiny dark eye marks only if crisp; no neon glow or transparent haze
Scale notes: medium-small enemy footprint with generous padding in every 96x96 cell; thin limbs must stay inside the cell and remain readable at runtime scale; stable baseline and center

Style: old-school top-down RPG creature sprite with strong dark outline,
restrained 12-24 color-ish palette, crisp pixel-art clusters, top-left lighting,
hostile/natural tone, and clear gameplay readability. Do not copy Tibia assets.

Sheet contract: 384x384 preferred, 4 columns by 4 rows, 96x96 cells. Row order
is walk_up/back, walk_right, walk_down/front, walk_left. Author 4 unique frames
per row with visible leg/body/head pose changes and stable scale/alignment.
Do not use flip, mirror, darken, or recolor substitutions for any facing.
Do not use magenta inside the creature.
```

### bog-slime-probe

```text
Create a 4x4 pixel-art sprite sheet on a perfectly flat pure magenta #ff00ff
background for chroma-key extraction.

Subject: original hostile swamp ooze enemy named bog slime; compact crawling slime monster with a hard-edged readable blob silhouette
Body plan: squat amorphous body, lopsided crown, heavy lower mass, two small embedded eye pits or dark stones, short pseudopod feet that change shape while walking
Fantasy accents: trapped leaf fragments and mud flecks as simple pixel clusters, subtle tooth-like dark notches in the front facing; no glassy transparency, no glow, no soft smoke
Palette notes: restrained moss green, dark olive shadow, muddy brown outline, pale yellow-green highlights, a few tan leaf pixels; keep the outline opaque and crisp
Scale notes: small-to-medium enemy footprint; wobble and pseudopod motion must be authored per frame while apparent size, center, and contact shadow remain stable

Style: old-school top-down RPG creature sprite with strong dark outline,
restrained 12-24 color-ish palette, crisp pixel-art clusters, top-left lighting,
hostile/natural tone, and clear gameplay readability. Do not copy Tibia assets.

Sheet contract: 384x384 preferred, 4 columns by 4 rows, 96x96 cells. Row order
is walk_up/back, walk_right, walk_down/front, walk_left. Author 4 unique frames
per row with visible body/pseudopod/face-mark pose changes and stable scale/alignment.
Do not use flip, mirror, darken, or recolor substitutions for any facing.
Do not use magenta inside the creature.
```

## Expected Review Artifacts

For each generated raw sheet, preserve the generator output and the review tool
outputs together in a probe directory. Expected files:

- `{slug}-raw-magenta.png`: raw generated 384x384 magenta sheet.
- `{slug}-keyed.png`: transparent sheet produced by the review tool.
- `{slug}-contact.png`: checker/dark-background contact sheet.
- `{slug}-runtime-contact.png`: nearest-neighbor contact sheet at runtime review scale.
- `{slug}-walk-up.gif`
- `{slug}-walk-right.gif`
- `{slug}-walk-down.gif`
- `{slug}-walk-left.gif`
- `{slug}-gate-report.json`

Suggested staging root:

```text
assetsources/curated/bespoke/prototype-probes/{slug}/
```

Do not copy any probe into `public/` or wire any probe into runtime manifests
until Alex approves the artifacts and the relevant bible/process is updated.

## Review Command

After generation, save the raw magenta sheet as
`assetsources/curated/bespoke/prototype-probes/{slug}/{slug}-raw-magenta.png`,
then run:

```bash
python3 tools/review_enemy_sprite_sheet.py \
  --sheet assetsources/curated/bespoke/prototype-probes/{slug}/{slug}-raw-magenta.png \
  --out-dir assetsources/curated/bespoke/prototype-probes/{slug} \
  --slug {slug} \
  --strict-prototype
```

The review tool defaults to a `24` opaque-color cap to match the bible's
restrained `12-24` color target, and writes `{slug}-runtime-contact.png` at
`32x32` per frame. Prototype review may use `--max-colors 32` only when the
extra colors come from imagegen edge cleanup or anti-aliasing, not from
painterly/noisy rendering. Anything above `32` is a style failure unless Alex
explicitly approves it. If a probe intentionally needs a different display
size, pass explicit overrides such as `--runtime-width 40` and
`--runtime-height 40`; document the exception next to the artifact.

Use the slug names from the probe set:

- `reach-vole-anchor`
- `biped-bandit-probe`
- `mire-wisp-flyer-probe`
- `base-player-probe`

## Review Checklist

Approve a probe only after reviewing the raw sheet, keyed sheet, source-scale
contact sheet, runtime-scale contact sheet, all four row GIFs, and gate report.
The strict prototype command must pass. In strict mode, near-static rows,
suspicious right/left mirror similarity, and near-magenta fringe are failures,
not ignorable warnings. Any remaining warnings, including bounding-box drift,
are manual review triggers rather than automatic approvals.

The probes should answer these questions before production:

- Does the reach vole still match the approved anchor after regeneration?
- Does the style hold on an upright biped without becoming mascot-like?
- Does the style hold on a flyer or odd-body enemy without soft blur or glow?
- Does the shared process expose player-specific needs before a player bible is
  written?
