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

export interface BuildingBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
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
  "spriteMausoleum",
  // Searing Badlands outpost: solid palisade wall + watchtower. (Mine arch,
  // cultist camp, and ritual props stay walk-through — the canyon is narrow and
  // the mine portal must stay reachable.)
  "spriteOutpostPalisade",
  "spriteOutpostWatchtower",
  // Northwatch city districts: solid buildings (towers/trees stay walk-through).
  "spriteCityHouseA",
  "spriteCityHouseB",
  "spriteCityHouseC",
  "spriteCityHouseD",
  "spriteCityCathedral",
  "spriteCityHall"
]);

// Buildings that should behave like same-map cutaways: the exterior sprite
// stays on the world map, but the footprint is carved into a small room and the
// sprite is hidden while the local player stands inside.
export const CUTAWAY_BUILDING_KEYS = new Set<string>([
  "spriteRedHouse",
  "spriteBlueHouse",
  "spriteGreenHouse",
  "spriteThatchHouse"
]);

interface CutawayBuildingProfile {
  footprintLeft: number;
  footprintRight: number;
  footprintTop: number;
  roomLeft: number;
  roomRight: number;
  roomTop: number;
  roomBottom: number;
  doorOffset: number;
}

const DEFAULT_CUTAWAY_PROFILE: CutawayBuildingProfile = {
  footprintLeft: 0.42,
  footprintRight: 0.42,
  footprintTop: 0.8,
  roomLeft: 0.3,
  roomRight: 0.3,
  roomTop: 0.54,
  roomBottom: 0.14,
  doorOffset: 0
};

const CUTAWAY_BUILDING_PROFILES: Record<string, CutawayBuildingProfile> = {
  spriteRedHouse: {
    footprintLeft: 0.46,
    footprintRight: 0.46,
    footprintTop: 0.82,
    roomLeft: 0.35,
    roomRight: 0.27,
    roomTop: 0.5,
    roomBottom: 0.13,
    doorOffset: -0.9
  },
  spriteBlueHouse: {
    footprintLeft: 0.48,
    footprintRight: 0.48,
    footprintTop: 0.82,
    roomLeft: 0.36,
    roomRight: 0.22,
    roomTop: 0.52,
    roomBottom: 0.13,
    doorOffset: 0.35
  },
  spriteGreenHouse: {
    footprintLeft: 0.45,
    footprintRight: 0.45,
    footprintTop: 0.82,
    roomLeft: 0.27,
    roomRight: 0.27,
    roomTop: 0.5,
    roomBottom: 0.13,
    doorOffset: 0
  },
  spriteThatchHouse: {
    footprintLeft: 0.42,
    footprintRight: 0.42,
    footprintTop: 0.8,
    roomLeft: 0.27,
    roomRight: 0.24,
    roomTop: 0.48,
    roomBottom: 0.13,
    doorOffset: -0.55
  }
};

function cutawayProfile(obj: MapObject): CutawayBuildingProfile {
  return CUTAWAY_BUILDING_PROFILES[obj.key] ?? DEFAULT_CUTAWAY_PROFILE;
}

export function buildingFootprintBounds(obj: MapObject): BuildingBounds {
  const profile = isCutawayBuilding(obj) ? cutawayProfile(obj) : DEFAULT_CUTAWAY_PROFILE;
  const tileW = obj.w / 32;
  return {
    left: Math.round(obj.x - tileW * profile.footprintLeft),
    right: Math.round(obj.x + tileW * profile.footprintRight),
    bottom: Math.round(obj.y - 0.6),
    top: Math.round(obj.y - (obj.h / 32) * profile.footprintTop)
  };
}

export function buildingInteriorBounds(obj: MapObject): BuildingBounds {
  const footprint = buildingFootprintBounds(obj);
  const profile = cutawayProfile(obj);
  const tileW = obj.w / 32;
  const tileH = obj.h / 32;
  return {
    left: Math.max(footprint.left + 1, Math.round(obj.x - tileW * profile.roomLeft)),
    right: Math.min(footprint.right - 1, Math.round(obj.x + tileW * profile.roomRight)),
    top: Math.max(footprint.top + 1, Math.round(obj.y - tileH * profile.roomTop)),
    bottom: Math.min(footprint.bottom - 1, Math.round(obj.y - tileH * profile.roomBottom))
  };
}

export function buildingDoorX(obj: MapObject): number {
  return Math.round(obj.x + cutawayProfile(obj).doorOffset);
}

export function isCutawayBuilding(obj: MapObject): boolean {
  return CUTAWAY_BUILDING_KEYS.has(obj.key);
}

export function isInsideCutawayBuilding(obj: MapObject, x: number, y: number): boolean {
  if (!isCutawayBuilding(obj)) return false;
  const interior = buildingInteriorBounds(obj);
  const doorX = buildingDoorX(obj);
  const footprint = buildingFootprintBounds(obj);
  return (
    (x >= interior.left && x <= interior.right && y >= interior.top && y <= interior.bottom) ||
    (Math.floor(x) === doorX && Math.floor(y) === footprint.bottom)
  );
}

export const MAP_OBJECTS: Record<number, MapObject[]> = {
  0: [
    // Waystone (bespoke 90x60). Houses, well and market cluster around the
    // central plaza; NPCs in npcs.yaml stand on the lanes just outside these
    // footprints. Anchors are bottom-centre tile coords in 90x60 space.
    { key: "spriteWell", x: 56.8, y: 31.8, w: 94, h: 132 }, // plaza well (north edge of plaza)
    { key: "spriteMarket", x: 77, y: 33, w: 188, h: 84 }, // market on the east apron
    { key: "spriteRedHouse", x: 44.6, y: 27.6, w: 238, h: 176 }, // NW of plaza
    { key: "spriteBlueHouse", x: 61.7, y: 26.4, w: 250, h: 180 }, // N of plaza
    { key: "spriteGreenHouse", x: 33, y: 26.4, w: 142, h: 178 }, // riverside district (west)
    { key: "spriteThatchHouse", x: 36.7, y: 42.6, w: 130, h: 176 }, // SW of plaza
    { key: "spriteBlueHouse", x: 88, y: 36, w: 250, h: 180 }, // eastern house by the garden
    { key: "spriteRedHouse", x: 48.9, y: 53.4, w: 238, h: 176 }, // south lane house
    { key: "spriteLamp", x: 48.3, y: 31.8, w: 28, h: 100 },
    { key: "spriteLamp", x: 65.4, y: 31.8, w: 28, h: 100 },
    { key: "spriteSign", x: 55, y: 28.2, w: 54, h: 66 }, // sign by the north lane
    { key: "spriteBarrels", x: 71.9, y: 43.4, w: 58, h: 46 }, // by the garden fence
    { key: "spriteBarrels", x: 42.5, y: 37.4, w: 58, h: 46 },
    { key: "spriteTree", x: 23, y: 57.2, w: 70, h: 90 }, // shade trees in the open meadow
    { key: "spriteTree", x: 93.1, y: 60.5, w: 62, h: 80 },
    { key: "spritePine", x: 27.1, y: 16.3, w: 54, h: 84 },
    { key: "spritePine", x: 95.6, y: 17.5, w: 54, h: 84 }
  ],
  1: [
    // Southgate Cemetery (bespoke 90x60). The Crypt squats at the heart of the
    // graveyard with its entrance (`C` portal) on the cleared dirt apron just
    // below its footprint; a mausoleum sits in the eastern plots. Dead trees,
    // obelisks and stone walls cluster against the iron fences. NPCs/monsters
    // roam the grave dirt outside these footprints (see spawns.yaml).
    { key: "spriteCrypt", x: 55, y: 33.7, w: 126, h: 206 }, // central crypt; entrance apron below
    { key: "spriteMausoleum", x: 79.4, y: 26.5, w: 118, h: 150 }, // eastern mausoleum
    { key: "spriteStoneWall", x: 19.6, y: 13.3, w: 112, h: 54 }, // NW plot wall
    { key: "spriteStoneWall", x: 85.6, y: 53.8, w: 112, h: 54 }, // SE plot wall
    { key: "spriteDeadTree", x: 17.6, y: 28.6, w: 72, h: 118 },
    { key: "spriteDeadTree", x: 90.7, y: 17.8, w: 66, h: 108 },
    { key: "spriteDeadTree", x: 29.6, y: 59.8, w: 66, h: 108 },
    { key: "spriteObelisk", x: 41.3, y: 18.6, w: 38, h: 60 },
    { key: "spriteObelisk", x: 71.3, y: 49.7, w: 34, h: 54 },
    { key: "spriteObelisk", x: 25.1, y: 48.5, w: 34, h: 54 }
  ],
  2: [
    // Ashen Crypt (bespoke 90x60) — an enclosed dungeon of stone chambers. The
    // Ashen Warden boss waits in the far east chamber; stone-wall slabs and
    // obelisks dress the chambers (scenery only — corridors are walled by `#`).
    { key: "spriteStoneWall", x: 17.1, y: 19.3, w: 118, h: 58 },
    { key: "spriteStoneWall", x: 85.6, y: 49, w: 118, h: 58 },
    { key: "spriteObelisk", x: 32.3, y: 16.6, w: 36, h: 58 },
    { key: "spriteObelisk", x: 96.1, y: 23.8, w: 40, h: 64 },
    { key: "spriteObelisk", x: 61.8, y: 57.4, w: 40, h: 64 }
  ],
  3: [
    { key: "spriteTree", x: 10.4, y: 12.5, w: 80, h: 104 },
    { key: "spritePine", x: 17.4, y: 35.8, w: 58, h: 92 },
    { key: "spriteTree", x: 23.8, y: 8.9, w: 76, h: 98 },
    { key: "spritePine", x: 38.3, y: 28.6, w: 56, h: 90 },
    { key: "spriteTree", x: 55.2, y: 18.4, w: 82, h: 106 }
  ],
  4: [
    // Northwatch (110x72) — walled CITY rebuild, MILESTONE 4 (parity push). Houses
    // packed two-deep into the grass blocks of the street grid (authored in shared.ts).
    // Central N-S avenue (x53..56) + plaza kept clear; landmarks: town hall (NW),
    // blue-dome cathedral (W); market stalls at the plaza fringe; SE water-inlet harbour.
    // --- Towers: corners, gate flanks, wall midpoints. ---
    { key: "spriteCityTowerRed", x: 15, y: 11.4, w: 48, h: 108 }, // NW
    { key: "spriteCityTowerRed", x: 95, y: 11.4, w: 48, h: 108 }, // NE
    { key: "spriteCityTowerRed", x: 15, y: 63, w: 48, h: 108 }, // SW
    { key: "spriteCityTowerRed", x: 95, y: 63, w: 48, h: 108 }, // SE
    { key: "spriteCityTowerRed", x: 50, y: 63, w: 48, h: 108 }, // S gate W
    { key: "spriteCityTowerRed", x: 59, y: 63, w: 48, h: 108 }, // S gate E
    { key: "spriteCityTowerRed", x: 15, y: 32, w: 48, h: 108 }, // W gate N
    { key: "spriteCityTowerRed", x: 15, y: 40, w: 48, h: 108 }, // W gate S
    { key: "spriteCityTowerRed", x: 35, y: 11.4, w: 48, h: 108 }, // N mid-W
    { key: "spriteCityTowerRed", x: 74, y: 11.4, w: 48, h: 108 }, // N mid-E
    { key: "spriteCityTowerRed", x: 35, y: 63, w: 48, h: 108 }, // S mid-W
    { key: "spriteCityTowerRed", x: 78, y: 63, w: 48, h: 108 }, // S mid-E
    { key: "spriteCityTowerRed", x: 95, y: 32, w: 48, h: 108 }, // E gate N
    { key: "spriteCityTowerRed", x: 95, y: 40, w: 48, h: 108 }, // E gate S
    { key: "spriteCityTowerRed", x: 95, y: 22, w: 48, h: 108 }, // E mid-N
    { key: "spriteCityTowerRed", x: 95, y: 52, w: 48, h: 108 }, // E mid-S
    // --- Landmarks. ---
    { key: "spriteCityHall", x: 23, y: 19, w: 150, h: 168 }, // town hall (NW)
    { key: "spriteCityCathedral", x: 23, y: 46, w: 156, h: 156 }, // cathedral (W)
    // --- Packed terraced houses (two rows per block, x-step 6). ---
    { key: "spriteCityHouseA", x: 36, y: 20, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 42, y: 20, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 48, y: 20, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 60, y: 20, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 66, y: 20, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 78, y: 20, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 84, y: 20, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 90, y: 20, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 36, y: 15, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 42, y: 15, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 48, y: 15, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 60, y: 15, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 66, y: 15, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 78, y: 15, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 84, y: 15, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 90, y: 15, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 18, y: 33, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 24, y: 33, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 30, y: 33, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 36, y: 33, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 42, y: 33, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 66, y: 33, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 78, y: 33, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 84, y: 33, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 90, y: 33, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 36, y: 28, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 42, y: 28, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 66, y: 28, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 78, y: 28, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 84, y: 28, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 90, y: 28, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 36, y: 47, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 42, y: 47, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 48, y: 47, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 60, y: 47, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 66, y: 47, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 78, y: 47, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 84, y: 47, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 90, y: 47, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 36, y: 42, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 42, y: 42, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 66, y: 42, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 78, y: 42, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 84, y: 42, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 90, y: 42, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 18, y: 60, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 24, y: 60, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 30, y: 60, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 36, y: 60, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 42, y: 60, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 48, y: 60, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 60, y: 60, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 66, y: 60, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 18, y: 55, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 24, y: 55, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 30, y: 55, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 36, y: 55, w: 126, h: 136 },
    { key: "spriteCityHouseB", x: 42, y: 55, w: 74, h: 138 },
    { key: "spriteCityHouseC", x: 48, y: 55, w: 78, h: 138 },
    { key: "spriteCityHouseD", x: 60, y: 55, w: 84, h: 136 },
    { key: "spriteCityHouseA", x: 66, y: 55, w: 126, h: 136 },
    // --- Market stalls (plaza fringe). ---
    { key: "spriteCityStall", x: 46, y: 45, w: 70, h: 56 },
    { key: "spriteCityStall", x: 50, y: 45, w: 70, h: 56 },
    { key: "spriteCityStall", x: 58, y: 45, w: 70, h: 56 },
    { key: "spriteCityStall", x: 62, y: 45, w: 70, h: 56 },
    // --- Plaza wells. ---
    { key: "spriteWell", x: 49, y: 32, w: 88, h: 122 },
    { key: "spriteWell", x: 60, y: 41, w: 88, h: 122 },
    { key: "spriteWell", x: 49, y: 41, w: 88, h: 122 },
    { key: "spriteWell", x: 60, y: 32, w: 88, h: 122 },
    // --- SE harbour boats. ---
    { key: "spriteCityBoat", x: 85, y: 57, w: 118, h: 98 },
    { key: "spriteCityBoat", x: 90, y: 54, w: 118, h: 98 },
    { key: "spriteCityBoat", x: 82, y: 59, w: 118, h: 98 },
    // --- Trees. ---
    { key: "spriteCityTree", x: 18, y: 57, w: 74, h: 74 },
    { key: "spriteCityTree", x: 64, y: 16, w: 74, h: 74 },
    { key: "spriteCityTree", x: 40, y: 16, w: 74, h: 74 }
  ],
  5: [
    { key: "spriteThatchHouse", x: 11, y: 22.8, w: 130, h: 176 }, // Alchemist's Hut (NW clearing)
    { key: "spriteSign", x: 15.3, y: 24.6, w: 48, h: 58 },
    { key: "spriteDeadTree", x: 6.6, y: 19.9, w: 60, h: 100 },
    { key: "spriteDeadTree", x: 51.9, y: 21.1, w: 56, h: 92 },
    { key: "spriteSwampBoulder", x: 64.2, y: 36.2, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 25.1, y: 45.8, w: 44, h: 36 },
    { key: "spriteSwampReeds", x: 37.3, y: 17.6, w: 58, h: 58 },
    { key: "spriteSwampReeds", x: 22.6, y: 38, w: 54, h: 54 },
    { key: "spriteSwampLog", x: 58.1, y: 33.2, w: 88, h: 40 },
    { key: "spriteMireLotus", x: 16.5, y: 46.2, w: 34, h: 32 }
  ],
  6: [
    // East clearing — painterly raider Outpost kit replaces the old placeholder
    // Frontier Camp. The Northwatch portal (Z @ 95,16) stays clear; FOOTPRINT_SKIP
    // shields it from the blocking watchtower/palisade footprints in shared.ts.
    { key: "spriteOutpostWatchtower", x: 82, y: 21, w: 122, h: 230 },
    { key: "spriteRaiderTent", x: 93, y: 24, w: 119, h: 150 },
    { key: "spriteOutpostPalisade", x: 74, y: 18, w: 150, h: 103 },
    { key: "spriteOutpostPalisade", x: 89, y: 16, w: 150, h: 103 },
    { key: "spriteOutpostTotem", x: 97, y: 23, w: 68, h: 170 },
    // West copper dead-end canyon — Deepdelve Mine surface entry framing the
    // shaft portal (> @ 11,53). All non-blocking so the portal stays reachable.
    { key: "spriteMineArch", x: 11, y: 53, w: 155, h: 140 },
    { key: "spriteMineHoist", x: 14, y: 52, w: 114, h: 130 },
    { key: "spriteMineCart", x: 8.5, y: 53, w: 58, h: 60 },
    { key: "spriteMineTrack", x: 12.5, y: 53.6, w: 120, h: 69 },
    // West-mouth niche — hidden zealot Cultist encampment, moved well clear of
    // the mine canyon so the two sites read as distinct (forest portal D@1,40 stays clear).
    { key: "spriteCultistTent", x: 12, y: 39, w: 122, h: 130 },
    { key: "spriteCultistCampfire", x: 14, y: 40, w: 66, h: 60 },
    { key: "spriteCultistTotem", x: 9.5, y: 38, w: 71, h: 165 },
    // Hidden iron-pocket ravine (off the mid lower run) — Ritual circle. The
    // floor is a walk-over decal (non-blocking); two leaning monoliths flank the core.
    { key: "spriteRitualFloor", x: 55, y: 56, w: 210, h: 200 },
    { key: "spriteRitualCore", x: 55, y: 55.4, w: 97, h: 95 },
    { key: "spriteRitualArch", x: 52, y: 55, w: 126, h: 110 },
    { key: "spriteRitualArch", x: 58, y: 55, w: 126, h: 110 },
    // Native badlands rocks ring the terrace pit-gap, so it reads as a tectonic tear.
    { key: "spriteBadlandsBoulder", x: 78.8, y: 40.7, w: 76, h: 62 },
    { key: "spriteBadlandsShard", x: 91.1, y: 40.6, w: 74, h: 54 },
    // Cluster against the copper-canyon wall.
    { key: "spriteBadlandsBoulder", x: 17.7, y: 53.8, w: 72, h: 58 },
    { key: "spriteBadlandsShard", x: 62.9, y: 44.3, w: 70, h: 50 },
    { key: "spriteBadlandsBoulder", x: 71.5, y: 26.9, w: 76, h: 60 },
    // --- Density pass: raider Outpost defensive layers (east clearing). Extra tents +
    // totems spread the camp into believable depth. Non-blocking; clear of Northwatch Z@95,16.
    { key: "spriteRaiderTent", x: 78.0, y: 23.2, w: 104, h: 131 },
    { key: "spriteRaiderTent", x: 86.4, y: 25.4, w: 92, h: 116 },
    { key: "spriteOutpostTotem", x: 72.2, y: 22.0, w: 60, h: 150 },
    { key: "spriteCultistTotem", x: 88.6, y: 14.6, w: 56, h: 132 }, // raider trophy stake on the back line
    // --- Rubble nestled against cliff bases so landmarks/terrain feel anchored, not floated.
    { key: "spriteBadlandsBoulder", x: 7.4, y: 54.1, w: 70, h: 56 },  // mine canyon wall
    { key: "spriteBadlandsShard", x: 15.6, y: 41.2, w: 66, h: 48 },   // west climb mouth
    { key: "spriteBadlandsBoulder", x: 8.8, y: 36.4, w: 64, h: 52 },  // cultist niche shoulder
    { key: "spriteBadlandsShard", x: 30.4, y: 26.3, w: 68, h: 48 },   // upper run south wall
    { key: "spriteBadlandsBoulder", x: 43.2, y: 44.1, w: 74, h: 58 }, // mid run elbow
    { key: "spriteBadlandsShard", x: 60.3, y: 53.7, w: 64, h: 46 },   // ritual pocket rim
    { key: "spriteBadlandsBoulder", x: 50.6, y: 57.4, w: 72, h: 56 }, // ritual pocket floor
    { key: "spriteBadlandsShard", x: 26.4, y: 13.2, w: 66, h: 48 },   // north prospect shelf
    { key: "spriteBadlandsBoulder", x: 72.6, y: 56.2, w: 76, h: 60 }, // south shelf wall
    { key: "spriteBadlandsShard", x: 90.4, y: 50.3, w: 70, h: 50 },   // south shelf east
    { key: "spriteBadlandsBoulder", x: 79.3, y: 37.2, w: 70, h: 56 }, // terrace base
    { key: "spriteBadlandsShard", x: 66.5, y: 26.4, w: 64, h: 46 }    // camp approach wall
  ],
  7: [
    { key: "spriteOutpostTent", x: 47.1, y: 64.3, w: 130, h: 104 }, // Oasis Trade Outpost (south)
    { key: "spritePalm", x: 40.9, y: 63.1, w: 78, h: 74 },
    { key: "spritePalm", x: 44.6, y: 60.5, w: 70, h: 66 },
    { key: "spriteObelisk", x: 29.9, y: 6.5, w: 38, h: 60 } // by the north gate
  ],
  8: [
    // Sunken Beach: grouped POIs instead of sparse single props. All anchors
    // sit on the authored sand/path pockets and leave the portal lanes clear.
    // Ledger-driven terrain overlays: these larger source-sheet pieces break
    // up repeated tile rows while the underlying grid keeps collision exact.
    { key: "spriteBeachCliffLipA", x: 23.5, y: 25.7, w: 104, h: 74 },
    { key: "spriteBeachCliffLipB", x: 34.5, y: 25.7, w: 240, h: 74 },
    { key: "spriteBeachStairsRun4", x: 26.9, y: 27.1, w: 128, h: 82 },
    { key: "spriteBeachCliffLipA", x: 65.4, y: 28.1, w: 160, h: 74 },
    { key: "spriteBeachCliffLipB", x: 77.5, y: 28.1, w: 224, h: 74 },
    { key: "spriteBeachStairsRun4", x: 70.9, y: 29.5, w: 128, h: 82 },
    { key: "spriteBeachCliffLipB", x: 37.5, y: 42.5, w: 224, h: 74 },
    { key: "spriteBeachCliffLipA", x: 48.3, y: 42.5, w: 104, h: 74 },
    { key: "spriteBeachStairsRun4", x: 44, y: 43.9, w: 128, h: 82 },
    { key: "spriteBeachHut", x: 72.7, y: 21.4, w: 116, h: 118 }, // driftwood hut on the high east shelf
    { key: "spriteBeachCave", x: 38.5, y: 30.5, w: 104, h: 102 }, // cliff cave POI
    { key: "spriteBeachRuin", x: 63.1, y: 20.9, w: 62, h: 82 }, // broken arch on the high path
    { key: "spriteBeachDock", x: 40.9, y: 56.6, w: 168, h: 86 }, // southwest tidal dock
    { key: "spriteBeachBoat", x: 54, y: 57.4, w: 74, h: 48 },
    { key: "spriteBeachTent", x: 84.9, y: 47.6, w: 92, h: 70 }, // eastern spit camp
    { key: "spriteBeachCampfire", x: 79.3, y: 49.1, w: 72, h: 66 },
    { key: "spriteBeachSign", x: 49.9, y: 35.3, w: 48, h: 56 },
    { key: "spriteBeachRocks", x: 37.6, y: 22.3, w: 76, h: 64 },
    { key: "spriteBeachRocks", x: 81, y: 32.2, w: 70, h: 58 },
    { key: "spriteBeachRocks", x: 52.1, y: 43, w: 72, h: 60 },
    { key: "spriteBeachBoulder", x: 90, y: 34.1, w: 82, h: 54 },
    { key: "spriteBeachStoneWall", x: 67.1, y: 23.5, w: 86, h: 52 },
    { key: "spriteBeachFence", x: 71.5, y: 42.7, w: 136, h: 36 },
    { key: "spriteBeachWell", x: 76.8, y: 36.1, w: 42, h: 60 },
    { key: "spriteBeachLogPile", x: 55.2, y: 36.5, w: 76, h: 44 },
    { key: "spriteBeachLogPile", x: 70.3, y: 44.6, w: 68, h: 40 },
    { key: "spriteBeachStump", x: 46.6, y: 41.4, w: 44, h: 34 },
    { key: "spriteBeachBonePile", x: 81.2, y: 29.4, w: 50, h: 24 },
    { key: "spriteBeachBarrel", x: 36.4, y: 55, w: 42, h: 52 },
    { key: "spriteBeachBarrel", x: 87.8, y: 51.1, w: 38, h: 48 },
    { key: "spriteBeachFlowerYellow", x: 29.6, y: 27.4, w: 34, h: 26 },
    { key: "spriteBeachFlowerYellow", x: 44.7, y: 19, w: 32, h: 24 },
    { key: "spriteBeachFlowerYellow", x: 88.1, y: 46.6, w: 34, h: 26 },
    { key: "spriteBeachFlowerWhite", x: 26.3, y: 39.1, w: 34, h: 26 },
    { key: "spriteBeachFlowerWhite", x: 60.3, y: 34.7, w: 34, h: 26 },
    { key: "spriteBeachFlowerWhite", x: 73.6, y: 18.6, w: 32, h: 24 },
    { key: "spriteBeachPalm", x: 21.4, y: 16.1, w: 86, h: 72 },
    { key: "spriteBeachPalm", x: 47.1, y: 13.7, w: 82, h: 68 },
    { key: "spriteBeachPalm", x: 66.6, y: 15.8, w: 80, h: 66 }, // high shelf grove
    { key: "spriteBeachPalm", x: 62.9, y: 38.9, w: 74, h: 62 },
    { key: "spriteBeachPalm", x: 88.6, y: 41.3, w: 86, h: 72 }, // on the eastern spit
    { key: "spriteBeachPalm", x: 29.9, y: 47.3, w: 82, h: 68 },
    { key: "spriteBeachPalm", x: 92.3, y: 30.6, w: 72, h: 60 }
  ],
  9: [
    // Boulders clustered at the two river fords (the choke ambush points).
    { key: "spriteSwampBoulder", x: 36.1, y: 9.4, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 42.2, y: 9.4, w: 40, h: 34 },
    { key: "spriteSwampBoulder", x: 36.1, y: 37, w: 44, h: 36 },
    { key: "spriteSwampBoulder", x: 42.2, y: 37, w: 40, h: 34 },
    { key: "spriteObelisk", x: 16.5, y: 42.5, w: 38, h: 60 } // tribal totem by the vault
  ]
};
