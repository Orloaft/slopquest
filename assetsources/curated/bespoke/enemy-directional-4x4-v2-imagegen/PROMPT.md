# Enemy Directional 4x4 V2 Imagegen Source

The production v2 enemy sheets are imported from an image-generated
simplified contact sheet. The model output is kept as the original
source artifact, then locally normalized to an exact `#ff00ff`
chroma background before slicing and alpha cleanup.

Runtime contract: 384x384 sheets, 96px cells, 4 columns, rows
`walk_up`, `walk_right`, `walk_down`, `walk_left`.
