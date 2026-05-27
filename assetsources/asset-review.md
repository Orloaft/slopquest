# TIB Asset Review - 2026-05-26 Generated Batch

Reviewed 34 generated PNGs against the current Waystone/TIB direction: a small top-down MMO with town, cemetery, crypt, forest, NPC, loot, and lightweight progression loops.

## Import-Ready Candidates

These are useful as source sheets now and have lowercase import-safe filenames. They are not copied into `public/` yet because the client currently uses hand-picked crop coordinates from known sheets.

- `selected/import-ready/city-exterior-tiles-01.png` - town exterior walls, roofs, streets, and building pieces.
- `selected/import-ready/city-exterior-tiles-02.png` - second town exterior variant, useful with the first city sheet.
- `selected/import-ready/city-interiors-tiles.png` - interior floors, walls, and furniture for town buildings.
- `selected/import-ready/consumables-tools-icons.png` - potions, food, lamps, bags, tools, and adventure props.
- `selected/import-ready/crypt-dungeon-tiles.png` - crypt/dungeon wall, floor, trap, and door pieces.
- `selected/import-ready/dark-forest-tiles.png` - strong fit for Northwood and cemetery edge dressing.
- `selected/import-ready/rural-village-tiles.png` - cottages, fencing, paths, and town-outskirts dressing.
- `selected/import-ready/skill-icons-sheet.png` - UI icons for gathering/profession progression.
- `selected/import-ready/town-npcs-sheet.png` - NPC/villager source sprites for trader and quest-giver variety.
- `selected/import-ready/village-house-interiors.png` - small house interiors for town/Northwatch buildings.
- `selected/import-ready/woodland-enemies-sheet.png` - forest creature source sprites for Northwood encounters.

## Selected For Manual Slicing

These fit the project, but need explicit frame/tile sizes or crop coordinates before they become runtime assets.

- `selected/manual-slicing/cave-enemies-sheet-01.png` - cave/crypt monster candidates.
- `selected/manual-slicing/cave-enemies-sheet-02.png` - additional cave/crypt monster candidates.
- `selected/manual-slicing/goblin-camp-props.png` - goblin tents, markers, and forest encounter props.
- `selected/manual-slicing/goblin-enemies-sheet.png` - goblin enemy variants to compare with the current goblin sheet.
- `selected/manual-slicing/herbs-shrubs-foraging.png` - foraging nodes and forest ground-cover props.
- `selected/manual-slicing/ore-rock-gathering-nodes.png` - ore, rock, and rubble nodes.
- `selected/manual-slicing/tree-cutting-progression-01.png` - basic woodcutting progression states.
- `selected/manual-slicing/tree-cutting-progression-02.png` - alternate woodcutting progression states.
- `selected/manual-slicing/water-fishing-spots.png` - fishing/water interaction props.
- `selected/manual-slicing/weapons-tools-icons.png` - weapon/tool icons; useful but visually dense.
- `selected/manual-slicing/wild-game-animals-sheet.png` - ambient forest animal candidates.

## Deferred Expansion Assets

These are decent assets but outside the immediate town/cemetery/crypt/forest loop.

- `deferred/advanced-tree-cutting-progression.png` - useful later if gathering becomes a real system.
- `deferred/highland-biome-tiles.png` - possible future mountain/cliff biome.
- `deferred/mystic-rainforest-tiles.png` - possible enchanted grove variant.
- `deferred/rocky-mountain-tiles.png` - future cliff/rocky outdoor zone.
- `deferred/snow-biome-tiles.png` - future snow expansion.
- `deferred/swamp-biome-tiles.png` - possible cemetery approach or future swamp zone.

## Rejected For Current Direction

These are off-theme for the current Waystone slice.

- `rejected/badlands-biome-tiles-01.png`
- `rejected/badlands-biome-tiles-02.png`
- `rejected/beach-biome-tiles.png`
- `rejected/desert-biome-tiles.png`
- `rejected/desert-enemies-sheet.png`
- `rejected/jungle-biome-tiles.png`

## Import Notes

- No files were placed in `public/`; none of this batch is runtime-wired yet.
- Next best import step is to choose a sheet size convention for new sources. Most sheets are `1536x1024`, while a few icon sheets are `1402x1122` or `1660x947`.
- For runtime integration, prefer adding one sheet at a time and recording crop coordinates beside the existing `makeSpriteTexture` / `makeTileTexture` calls.
- Review contact sheets are in `assetsources/review/contact-sheet-1.jpg`, `contact-sheet-2.jpg`, and `contact-sheet-3.jpg`.
