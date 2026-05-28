export {
  ITEMS,
  MONSTERS,
  QUEST_DROPS,
  QUESTS,
  TREE_TYPES,
  NPCS,
  SHOP,
  MONSTER_SPAWNS,
  COMPOSED_TREE_NODES,
  FISHING_NODES
} from "./generated/catalog.js";

export const TILE_SIZE = 32;
export const MAP_COLS = 52;
export const MAP_ROWS = 34;

export const START = { floor: 0, x: 16.5, y: 17.5 };
export const ZONES = {
  southTown: { id: "southTown", label: "Waystone", floor: 0, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  cemetery: { id: "cemetery", label: "Southgate Cemetery", floor: 1, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  crypt: { id: "crypt", label: "Ashen Crypt", floor: 2, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  woods: { id: "woods", label: "Northwood", floor: 3, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  northTown: { id: "northTown", label: "Northwatch", floor: 4, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 }
};
const FLOOR_TILE_CACHE = new Map();

export const CLASSES = {
  adventurer: {
    label: "Adventurer",
    maxHp: 120,
    maxMana: 60,
    speed: 4.25,
    range: 1.35,
    magicRange: 6,
    attackDamage: [8, 13],
    abilityDamage: [18, 28],
    abilityCost: 14,
    attackMs: 820,
    abilityMs: 2800,
    hpPerDefense: 10,
    manaPerMagic: 8,
    abilities: ["sprint", "second_wind"]
  }
};

export const ABILITIES = {
  sprint: {
    id: "sprint",
    label: "Sprint",
    description: "Move 50% faster for 10s.",
    cooldownMs: 30000,
    durationMs: 10000,
    speedMultiplier: 1.5
  },
  second_wind: {
    id: "second_wind",
    label: "Second Wind",
    description: "Regenerate 50% of max HP over 5s.",
    cooldownMs: 90000,
    durationMs: 5000,
    healFraction: 0.5
  }
};

export const SKILLS = {
  attack: { label: "Attack", iconUrl: "/icons/skill-attack.png" },
  defense: { label: "Defense", iconUrl: "/icons/skill-defense.png" },
  magic: { label: "Magic", iconUrl: "/icons/skill-magic.png" },
  woodcutting: { label: "Woodcutting", iconUrl: "/icons/skill-woodcutting.png" },
  fishing: { label: "Fishing", iconUrl: "/icons/skill-fishing.png" },
  firemaking: { label: "Firemaking", iconUrl: "/icons/skill-firemaking.png" },
  cooking: { label: "Cooking", iconUrl: "/icons/skill-cooking.png" }
};

export function xpForLevel(level) {
  return level <= 1 ? 0 : Math.round(70 * (level - 1) ** 1.55);
}

export function makeFloorTiles(floor) {
  if (FLOOR_TILE_CACHE.has(floor)) return FLOOR_TILE_CACHE.get(floor);

  const rows = Array.from({ length: MAP_ROWS }, () => Array.from({ length: MAP_COLS }, () => "#"));

  if (floor === 0) {
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, ".");
    fillRect(rows, 1, 5, 6, 27, "~");
    fillRect(rows, 6, 5, 1, 27, "r");
    fillRect(rows, 5, 16, 5, 3, "t");
    fillRect(rows, 9, 12, 27, 11, "s");
    fillRect(rows, 13, 15, 13, 6, "p");
    fillRect(rows, 10, 17, 40, 2, "s");
    fillRect(rows, 16, 7, 2, 23, "s");
    fillRect(rows, 35, 14, 10, 6, "d");
    fillRect(rows, 20, 6, 10, 5, "O");
    fillRect(rows, 34, 6, 8, 5, "O");
    fillRect(rows, 8, 23, 8, 5, "O");
    fillRect(rows, 24, 25, 8, 5, "O");
    fillRect(rows, 38, 22, 8, 5, "O");
    fillRect(rows, 21, 16, 3, 3, "O");
    fillRect(rows, 5, 24, 39, 1, "q");
    fillRect(rows, 5, 29, 39, 1, "q");
    fillRect(rows, 5, 24, 1, 6, "q");
    fillRect(rows, 43, 24, 1, 6, "q");
    fillRect(rows, 23, 24, 5, 1, "c");
    fillRect(rows, 23, 29, 5, 1, "c");
    fillRect(rows, 20, 26, 8, 2, "c");
    rows[2][25] = "N";
    rows[31][25] = "S";
    rows[15][17] = "n";
    scatter(rows, ".", "f", 10, 15);
  }

  if (floor === 1) {
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "g");
    fillRect(rows, 23, 1, 5, 31, "c");
    fillRect(rows, 5, 5, 40, 1, "q");
    fillRect(rows, 5, 28, 40, 1, "q");
    fillRect(rows, 5, 5, 1, 24, "q");
    fillRect(rows, 44, 5, 1, 24, "q");
    fillRect(rows, 23, 5, 5, 1, "c");
    fillRect(rows, 23, 28, 5, 1, "c");
    rows[16][5] = "g";
    rows[16][44] = "g";
    fillRect(rows, 22, 18, 8, 5, "O");
    fillRect(rows, 25, 18, 1, 3, "c");
    rows[2][25] = "T";
    rows[20][25] = "C";
    scatter(rows, "g", "h", 72, 21);
    scatter(rows, "g", "r", 16, 22);
  }

  if (floor === 2) {
    fillRect(rows, 3, 3, MAP_COLS - 6, MAP_ROWS - 6, "c");
    fillRect(rows, 3, 3, 10, 8, "d");
    fillRect(rows, 31, 9, 16, 16, "b");
    fillRect(rows, 25, 14, 7, 5, "c");
    fillRect(rows, 18, 5, 4, 17, "#");
    fillRect(rows, 12, 25, 21, 3, "#");
    rows[6][6] = "T";
    scatter(rows, "c", "r", 26, 4);
    scatter(rows, "b", "r", 12, 5);
  }

  if (floor === 3) {
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "F");
    fillRect(rows, 24, 1, 4, MAP_ROWS - 2, "t");
    fillRect(rows, 4, 16, 44, 2, "t");
    fillRect(rows, 7, 23, 36, 3, "t");
    fillRect(rows, 9, 7, 3, 8, "t");
    fillRect(rows, 40, 18, 8, 3, "t");
    fillRect(rows, 34, 5, 8, 7, "d");
    fillRect(rows, 35, 6, 6, 5, "~");
    fillRect(rows, 5, 4, 6, 4, "d");
    fillRect(rows, 6, 5, 4, 2, "~");
    fillRect(rows, 6, 25, 5, 5, "d");
    fillRect(rows, 38, 25, 8, 5, "d");
    fillRect(rows, 14, 11, 6, 5, "d");
    fillRect(rows, 30, 19, 6, 4, "d");
    rows[31][25] = "S";
    rows[2][25] = "N";
    scatter(rows, "F", "f", 220, 31);
    scatter(rows, "F", "r", 48, 32);
  }

  if (floor === 4) {
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, ".");
    fillRect(rows, 9, 10, 34, 13, "s");
    fillRect(rows, 13, 14, 12, 6, "p");
    fillRect(rows, 24, 2, 3, 30, "s");
    fillRect(rows, 10, 16, 34, 3, "s");
    fillRect(rows, 12, 7, 9, 5, "O");
    fillRect(rows, 31, 7, 8, 5, "O");
    fillRect(rows, 17, 23, 9, 5, "O");
    fillRect(rows, 34, 23, 8, 5, "O");
    rows[31][25] = "S";
    scatter(rows, ".", "f", 28, 41);
    scatter(rows, ".", "r", 16, 42);
  }

  const tiles = rows.map((row) => row.join(""));
  FLOOR_TILE_CACHE.set(floor, tiles);
  return tiles;
}

export function tileAt(floor, tx, ty) {
  const rows = makeFloorTiles(floor);
  if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return "#";
  return rows[ty][tx] ?? "#";
}

export function isBlockedTile(tile) {
  return tile === "#" || tile === "~" || tile === "f" || tile === "q" || tile === "r" || tile === "O";
}

export function isSafeZone(floor, x, y) {
  return floor === 0 || floor === 4;
}

export function zoneAt(floor, x, y) {
  for (const zone of Object.values(ZONES)) {
    if (zone.floor !== floor) continue;
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) return zone.id;
  }
  return `floor-${floor}`;
}

export function portalFor(floor, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tile = tileAt(floor, tx, ty);
  if (floor === 0 && tile === "N") return { floor: 3, x: 25.5, y: 30.5 };
  if (floor === 0 && tile === "S") return { floor: 1, x: 25.5, y: 3.5 };
  if (floor === 1 && tile === "T") return { floor: 0, x: 25.5, y: 30.5 };
  if (floor === 1 && tile === "C") return { floor: 2, x: 6.5, y: 6.5 };
  if (floor === 2 && tile === "T") return { floor: 1, x: 25.5, y: 21.5 };
  if (floor === 3 && tile === "S") return { floor: 0, x: 25.5, y: 3.5 };
  if (floor === 3 && tile === "N") return { floor: 4, x: 25.5, y: 30.5 };
  if (floor === 4 && tile === "S") return { floor: 3, x: 25.5, y: 3.5 };
  return null;
}

function fillRect(rows, x, y, w, h, tile) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (rows[yy]?.[xx] !== undefined) rows[yy][xx] = tile;
    }
  }
}

function scatter(rows, onTile, newTile, count, seed) {
  let value = seed * 9973;
  for (let i = 0; i < count; i += 1) {
    value = (value * 48271) % 2147483647;
    const x = 3 + (value % (MAP_COLS - 6));
    value = (value * 48271) % 2147483647;
    const y = 3 + (value % (MAP_ROWS - 6));
    if (rows[y][x] === onTile) rows[y][x] = newTile;
  }
}
