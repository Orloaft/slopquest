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
    { key: "spriteBridge", x: 7.2, y: 18.6, w: 108, h: 58 },
    { key: "spriteRedHouse", x: 25, y: 11.4, w: 288, h: 198 },
    { key: "spriteBlueHouse", x: 38, y: 11.3, w: 244, h: 176 },
    { key: "spriteGreenHouse", x: 12, y: 28.3, w: 192, h: 184 },
    { key: "spriteThatchHouse", x: 28, y: 30.3, w: 210, h: 172 },
    { key: "spriteBlueHouse", x: 42, y: 27.4, w: 210, h: 156 },
    { key: "spriteWell", x: 22.5, y: 19.5, w: 94, h: 132 },
    { key: "spriteMarket", x: 43, y: 31.2, w: 174, h: 78 },
    { key: "spriteLamp", x: 19.5, y: 19.2, w: 28, h: 100 },
    { key: "spriteLamp", x: 25.5, y: 19.2, w: 28, h: 100 },
    { key: "spriteSign", x: 14.2, y: 20.4, w: 54, h: 66 },
    { key: "spriteSign", x: 32.4, y: 16.1, w: 58, h: 70 },
    { key: "spriteBarrels", x: 18.8, y: 12.2, w: 58, h: 46 },
    { key: "spriteBarrels", x: 40.8, y: 21.2, w: 58, h: 46 },
    { key: "spriteTree", x: 12.8, y: 10.7, w: 70, h: 90 },
    { key: "spriteTree", x: 36.2, y: 17.4, w: 62, h: 80 },
    { key: "spritePine", x: 20.2, y: 31.6, w: 54, h: 84 }
  ],
  1: [
    { key: "spriteCrypt", x: 26, y: 23.1, w: 126, h: 206 },
    { key: "spriteStoneWall", x: 15, y: 6.1, w: 112, h: 54 },
    { key: "spriteStoneWall", x: 36, y: 28.8, w: 112, h: 54 },
    { key: "spriteMausoleum", x: 37.5, y: 17.1, w: 118, h: 150 },
    { key: "spriteDeadTree", x: 10.4, y: 14.8, w: 72, h: 118 },
    { key: "spriteDeadTree", x: 41.2, y: 10.8, w: 66, h: 108 },
    { key: "spriteObelisk", x: 15.8, y: 18.5, w: 38, h: 60 },
    { key: "spriteObelisk", x: 34.3, y: 23.4, w: 34, h: 54 }
  ],
  2: [
    { key: "spriteStoneWall", x: 8, y: 11.1, w: 118, h: 58 },
    { key: "spriteStoneWall", x: 36, y: 9.8, w: 118, h: 58 },
    { key: "spriteObelisk", x: 16.4, y: 18.8, w: 36, h: 58 },
    { key: "spriteObelisk", x: 42.6, y: 23.8, w: 40, h: 64 }
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
    { key: "spriteGreenHouse", x: 16.5, y: 12.6, w: 190, h: 176 },
    { key: "spriteBlueHouse", x: 35.3, y: 12.7, w: 220, h: 164 },
    { key: "spriteThatchHouse", x: 21.5, y: 28.4, w: 210, h: 170 },
    { key: "spriteRedHouse", x: 37.2, y: 28.2, w: 230, h: 172 },
    { key: "spriteWell", x: 25.5, y: 19.5, w: 88, h: 122 },
    { key: "spriteMarket", x: 42, y: 20.6, w: 160, h: 72 },
    { key: "spriteLamp", x: 22, y: 19.2, w: 28, h: 100 },
    { key: "spriteLamp", x: 29, y: 19.2, w: 28, h: 100 },
    { key: "spriteSign", x: 25.5, y: 30.8, w: 54, h: 66 },
    { key: "spriteTree", x: 9, y: 9.5, w: 66, h: 86 },
    { key: "spritePine", x: 44, y: 30.2, w: 54, h: 84 }
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
