# Enemy Directional 4x4 V2 Imagegen Source

Historical source metadata only. This prompt is superseded as style authority by
`docs/enemy-sprite-style-bible.md`; use that bible for current style, prompt template,
authored-facing, motion, and review-gate requirements.

Generator warning: `tools/generate_woodland_enemy_sprites_v2.py` is legacy.
It can derive rows with flip/darken substitutions and synthetic motion, so
outputs from that script are not acceptable as current authored-facing sprites.

The production v2 enemy sheets are imported from an image-generated
simplified contact sheet. The model output is kept as the original
source artifact, then locally normalized to an exact `#ff00ff`
chroma background before slicing and alpha cleanup.

Runtime contract: 384x384 sheets, 96px cells, 4 columns, rows
`walk_up`, `walk_right`, `walk_down`, `walk_left`.
