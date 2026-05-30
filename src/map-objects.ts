// Composed map decorations (buildings + scenery sprites), authored in each
// floor's native 52x34 coordinates. Shared so the client renders them and
// shared.ts can derive building collision from the SAME data — keeping the
// invisible footprint aligned with the visible building.

export interface MapObject {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Sprites that are solid structures: their footprint blocks movement. Scenery
// (lamps, signs, barrels, trees, boulders, palms, totems) stays walk-through.
export const BLOCKING_OBJECT_KEYS = new Set<string>([
  "spriteRedHouse",
  "spriteBlueHouse",
  "spriteGreenHouse",
  "spriteThatchHouse",
  "spriteWell",
  "spriteMarket",
  "spriteCrypt",
  "spriteMausoleum"
]);

export const MAP_OBJECTS: Record<number, MapObject[]> = {
  0: [
    // Waystone (bespoke 90x60). Houses, well and market cluster around the
    // central plaza; NPCs in npcs.yaml stand on the lanes just outside these
    // footprints. Anchors are bottom-centre tile coords in 90x60 space.
    { key: "spriteWell", x: 46.5, y: 26.5, w: 94, h: 132 }, // plaza well (north edge of plaza)
    { key: "spriteMarket", x: 63, y: 27.5, w: 188, h: 84 }, // market on the east apron
    { key: "spriteRedHouse", x: 36.5, y: 23, w: 238, h: 176 }, // NW of plaza
    { key: "spriteBlueHouse", x: 50.5, y: 22, w: 250, h: 180 }, // N of plaza
    { key: "spriteGreenHouse", x: 27, y: 22, w: 142, h: 178 }, // riverside district (west)
    { key: "spriteThatchHouse", x: 30, y: 35.5, w: 130, h: 176 }, // SW of plaza
    { key: "spriteBlueHouse", x: 72, y: 30, w: 250, h: 180 }, // eastern house by the garden
    { key: "spriteRedHouse", x: 40, y: 44.5, w: 238, h: 176 }, // south lane house
    { key: "spriteLamp", x: 39.5, y: 26.5, w: 28, h: 100 },
    { key: "spriteLamp", x: 53.5, y: 26.5, w: 28, h: 100 },
    { key: "spriteSign", x: 45, y: 23.5, w: 54, h: 66 }, // sign by the north lane
    { key: "spriteBarrels", x: 58.8, y: 36.2, w: 58, h: 46 }, // by the garden fence
    { key: "spriteBarrels", x: 34.8, y: 31.2, w: 58, h: 46 },
    { key: "spriteTree", x: 18.8, y: 47.7, w: 70, h: 90 }, // shade trees in the open meadow
    { key: "spriteTree", x: 76.2, y: 50.4, w: 62, h: 80 },
    { key: "spritePine", x: 22.2, y: 13.6, w: 54, h: 84 },
    { key: "spritePine", x: 78.2, y: 14.6, w: 54, h: 84 }
  ],
  1: [
    // Southgate Cemetery (bespoke 90x60). The Crypt squats at the heart of the
    // graveyard with its entrance (`C` portal) on the cleared dirt apron just
    // below its footprint; a mausoleum sits in the eastern plots. Dead trees,
    // obelisks and stone walls cluster against the iron fences. NPCs/monsters
    // roam the grave dirt outside these footprints (see spawns.yaml).
    { key: "spriteCrypt", x: 45, y: 28.1, w: 126, h: 206 }, // central crypt; entrance apron below
    { key: "spriteMausoleum", x: 65, y: 22.1, w: 118, h: 150 }, // eastern mausoleum
    { key: "spriteStoneWall", x: 16, y: 11.1, w: 112, h: 54 }, // NW plot wall
    { key: "spriteStoneWall", x: 70, y: 44.8, w: 112, h: 54 }, // SE plot wall
    { key: "spriteDeadTree", x: 14.4, y: 23.8, w: 72, h: 118 },
    { key: "spriteDeadTree", x: 74.2, y: 14.8, w: 66, h: 108 },
    { key: "spriteDeadTree", x: 24.2, y: 49.8, w: 66, h: 108 },
    { key: "spriteObelisk", x: 33.8, y: 15.5, w: 38, h: 60 },
    { key: "spriteObelisk", x: 58.3, y: 41.4, w: 34, h: 54 },
    { key: "spriteObelisk", x: 20.5, y: 40.4, w: 34, h: 54 }
  ],
  2: [
    // Ashen Crypt (bespoke 90x60) — an enclosed dungeon of stone chambers. The
    // Ashen Warden boss waits in the far east chamber; stone-wall slabs and
    // obelisks dress the chambers (scenery only — corridors are walled by `#`).
    { key: "spriteStoneWall", x: 14, y: 16.1, w: 118, h: 58 },
    { key: "spriteStoneWall", x: 70, y: 40.8, w: 118, h: 58 },
    { key: "spriteObelisk", x: 26.4, y: 13.8, w: 36, h: 58 },
    { key: "spriteObelisk", x: 78.6, y: 19.8, w: 40, h: 64 },
    { key: "spriteObelisk", x: 50.6, y: 47.8, w: 40, h: 64 }
  ],
  3: [
    { key: "spriteTree", x: 8.5, y: 10.4, w: 80, h: 104 },
    { key: "spritePine", x: 14.2, y: 29.8, w: 58, h: 92 },
    { key: "spriteTree", x: 19.5, y: 7.4, w: 76, h: 98 },
    { key: "spritePine", x: 31.3, y: 23.8, w: 56, h: 90 },
    { key: "spriteTree", x: 45.2, y: 15.3, w: 82, h: 106 },
    { key: "spriteRock", x: 18.7, y: 25.2, w: 44, h: 34 },
    { key: "spriteRock", x: 38.5, y: 5.7, w: 48, h: 36 },
    { key: "spriteBoulder", x: 28.4, y: 12.6, w: 52, h: 64 },
    { key: "spriteBoulder", x: 41.6, y: 27.3, w: 46, h: 58 }
  ],
  4: [
    // Northwatch (bespoke 90x60). Barracks, quarters, well and quartermaster's
    // market cluster inside the palisade around the parade ground. NPCs in
    // npcs.yaml stand on the roads just outside these footprints.
    { key: "spriteWell", x: 46.5, y: 24, w: 88, h: 122 }, // muster-square well
    { key: "spriteMarket", x: 64, y: 25.5, w: 160, h: 72 }, // quartermaster's market (east)
    { key: "spriteGreenHouse", x: 37, y: 20, w: 190, h: 176 }, // barracks (NW)
    { key: "spriteBlueHouse", x: 54, y: 20, w: 220, h: 164 }, // officers' quarters (NE)
    { key: "spriteThatchHouse", x: 35, y: 44.5, w: 210, h: 170 }, // quarters (SW)
    { key: "spriteRedHouse", x: 57, y: 44.5, w: 230, h: 172 }, // smithy (SE)
    { key: "spriteLamp", x: 39.5, y: 24, w: 28, h: 100 },
    { key: "spriteLamp", x: 53.5, y: 24, w: 28, h: 100 },
    { key: "spriteSign", x: 45, y: 21, w: 54, h: 66 }, // muster sign
    { key: "spriteBarrels", x: 60.8, y: 35.2, w: 58, h: 46 },
    { key: "spriteTree", x: 12, y: 52.5, w: 66, h: 86 }, // frontier woodland outside the walls
    { key: "spritePine", x: 78, y: 18.2, w: 54, h: 84 },
    { key: "spritePine", x: 10, y: 14.2, w: 54, h: 84 }
  ],
  5: [
    { key: "spriteThatchHouse", x: 9, y: 19, w: 130, h: 176 }, // Alchemist's Hut (NW clearing)
    { key: "spriteSign", x: 12.5, y: 20.5, w: 48, h: 58 },
    { key: "spriteDeadTree", x: 5.4, y: 16.6, w: 60, h: 100 },
    { key: "spriteDeadTree", x: 42.5, y: 17.6, w: 56, h: 92 },
    { key: "spriteSwampBoulder", x: 52.5, y: 30.2, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 20.5, y: 38.2, w: 44, h: 36 }
  ],
  6: [
    { key: "spriteTent", x: 70.5, y: 17.2, w: 110, h: 86 }, // Frontier Camp (east clearing)
    { key: "spriteCampfire", x: 73.5, y: 19.4, w: 54, h: 54 },
    { key: "spriteBarrels", x: 67.5, y: 14.4, w: 54, h: 42 },
    // Boulders ringing the terrace pit-gap, so it reads as a tectonic tear.
    { key: "spriteSwampBoulder", x: 64.5, y: 33.6, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 74.5, y: 33.6, w: 40, h: 34 },
    // Cluster against the copper-canyon wall.
    { key: "spriteSwampBoulder", x: 14.5, y: 44.6, w: 44, h: 36 }
  ],
  7: [
    { key: "spriteOutpostTent", x: 38.5, y: 53.6, w: 130, h: 104 }, // Oasis Trade Outpost (south)
    { key: "spritePalm", x: 33.5, y: 52.6, w: 78, h: 74 },
    { key: "spritePalm", x: 36.5, y: 50.4, w: 70, h: 66 },
    { key: "spriteObelisk", x: 24.5, y: 5.4, w: 38, h: 60 } // by the north gate
  ],
  8: [
    { key: "spriteBeachHut", x: 60.5, y: 20.6, w: 116, h: 118 }, // driftwood hut on the dry east sand
    { key: "spritePalm", x: 20.5, y: 9.4, w: 62, h: 58 },
    { key: "spritePalm", x: 44.5, y: 12.4, w: 62, h: 58 }, // by the jungle trail
    { key: "spritePalm", x: 72.5, y: 33.4, w: 62, h: 58 }, // on the eastern spit
    { key: "spritePalm", x: 30.5, y: 35.4, w: 62, h: 58 }
  ],
  9: [
    // Boulders clustered at the two river fords (the choke ambush points).
    { key: "spriteSwampBoulder", x: 29.5, y: 7.85, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 34.5, y: 7.85, w: 40, h: 34 },
    { key: "spriteSwampBoulder", x: 29.5, y: 30.85, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 34.5, y: 30.85, w: 40, h: 34 },
    { key: "spriteObelisk", x: 13.5, y: 35.4, w: 38, h: 60 } // tribal totem by the vault
  ]
};
