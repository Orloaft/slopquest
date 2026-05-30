import type { Range, ZoneId } from "./content-types.ts";

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
  FISHING_NODES,
  MINING_NODES,
  HERB_NODES
} from "./generated/catalog.ts";

export const TILE_SIZE = 32;
export const MAP_COLS = 52;
export const MAP_ROWS = 34;

export interface Portal {
  floor: number;
  x: number;
  y: number;
}

export interface Zone {
  id: ZoneId;
  label: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ClassSpec {
  label: string;
  maxHp: number;
  maxMana: number;
  speed: number;
  range: number;
  magicRange: number;
  attackDamage: Range;
  abilityDamage: Range;
  abilityCost: number;
  attackMs: number;
  abilityMs: number;
  hpPerDefense: number;
  manaPerMagic: number;
  abilities: string[];
  // Passive chance (0..1) to fully dodge an incoming hit. Class-differentiated;
  // Agility level raises it further (see dodgeChanceFor).
  dodgeChance: number;
}

export interface AbilitySpec {
  id: string;
  label: string;
  description: string;
  cooldownMs: number;
  durationMs: number;
  speedMultiplier?: number;
  healFraction?: number;
  // Offensive (class "strike") abilities: deal damage to the current target.
  damage?: Range;
  manaCost?: number;
  skill?: string; // skill trained + scaled by (e.g. "attack" | "ranged" | "magic")
  range?: number; // attack range in tiles (defaults to the class melee range)
  effectKind?: string; // visual effect kind (e.g. "hit" | "flare" | "frost" | "arrow")
}

export interface SkillDef {
  label: string;
  iconUrl: string;
}

export const START: Portal = { floor: 0, x: 16.5, y: 17.5 };

export const ZONES: Record<ZoneId, Zone> = {
  southTown: { id: "southTown", label: "Waystone", floor: 0, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  cemetery: { id: "cemetery", label: "Southgate Cemetery", floor: 1, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  crypt: { id: "crypt", label: "Ashen Crypt", floor: 2, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  woods: { id: "woods", label: "Northwood", floor: 3, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  northTown: { id: "northTown", label: "Northwatch", floor: 4, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  marsh: { id: "marsh", label: "The Sunken Marsh", floor: 5, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  badlands: { id: "badlands", label: "The Searing Badlands", floor: 6, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 }
};
const FLOOR_TILE_CACHE = new Map<number, string[]>();

const CLASS_BASE = {
  maxHp: 120,
  maxMana: 60,
  speed: 4.25,
  range: 1.35,
  magicRange: 6,
  attackDamage: [8, 13] as Range,
  abilityDamage: [18, 28] as Range,
  abilityCost: 14,
  attackMs: 820,
  abilityMs: 2800,
  hpPerDefense: 10,
  manaPerMagic: 8
};

// Tier-1 classes are stances layered over the blank-slate Adventurer. Core stats
// stay skill-driven (shared base); a class only swaps the bound ability toolkit,
// dodge profile, and move speed. See CLASS_UNLOCKS for how each is gated.
export const CLASSES: Record<string, ClassSpec> = {
  adventurer: { ...CLASS_BASE, label: "Adventurer", abilities: ["sprint", "second_wind"], dodgeChance: 0.05 },
  vanguard: { ...CLASS_BASE, label: "Vanguard", abilities: ["provoke", "iron_clad"], dodgeChance: 0.05 },
  thief: { ...CLASS_BASE, label: "Thief", speed: 4.65, abilities: ["quick_step", "backstab"], dodgeChance: 0.12 },
  apothecary: { ...CLASS_BASE, label: "Apothecary", abilities: ["healing_poultice", "volatile_flask"], dodgeChance: 0.06 },
  archer: { ...CLASS_BASE, label: "Archer", speed: 4.4, abilities: ["pinning_shot", "fleet_foot"], dodgeChance: 0.08 },
  mage: { ...CLASS_BASE, label: "Mage", abilities: ["flame_burst", "frost_nova"], dodgeChance: 0.05 }
};

export interface ClassUnlock {
  key: string;
  label: string;
  npcId: string;
  npcName: string;
  town: string;
  requires: Partial<Record<string, number>>;
}

// Each Tier-1 class is unlocked by reaching its skill thresholds and talking to
// the named NPC trainer in the named town. The client reads this to render the
// class panel (requirements + trainer hint); the server enforces it on unlock.
export const CLASS_UNLOCKS: ClassUnlock[] = [
  { key: "vanguard", label: "Vanguard", npcId: "fighter-captain", npcName: "Captain Doran", town: "Waystone", requires: { attack: 15, defense: 15 } },
  { key: "thief", label: "Thief", npcId: "shady-contact", npcName: "Sly Nessa", town: "Waystone", requires: { agility: 15, attack: 10 } },
  { key: "apothecary", label: "Apothecary", npcId: "cleric-monk", npcName: "Brother Aldric", town: "Waystone", requires: { defense: 10, alchemy: 15 } },
  { key: "archer", label: "Archer", npcId: "scout-leader", npcName: "Ranger Wynn", town: "Northwatch", requires: { ranged: 15, foraging: 10 } },
  { key: "mage", label: "Mage", npcId: "hermit-academic", npcName: "Magister Vael", town: "Northwatch", requires: { magic: 15, alchemy: 10 } }
];

export const ABILITIES: Record<string, AbilitySpec> = {
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
  },
  // --- Vanguard ---
  provoke: {
    id: "provoke",
    label: "Provoke",
    description: "Taunt all nearby monsters, forcing them to attack you.",
    cooldownMs: 12000,
    durationMs: 6000,
    manaCost: 6
  },
  iron_clad: {
    id: "iron_clad",
    label: "Iron Clad",
    description: "Take 30% less damage but move 15% slower for 6s.",
    cooldownMs: 20000,
    durationMs: 6000,
    manaCost: 8
  },
  // --- Archer ---
  pinning_shot: {
    id: "pinning_shot",
    label: "Pinning Shot",
    description: "A ranged shot that snares the target in place.",
    cooldownMs: 8000,
    durationMs: 2500,
    manaCost: 8,
    damage: [10, 16],
    skill: "ranged",
    range: 5,
    effectKind: "arrow"
  },
  fleet_foot: {
    id: "fleet_foot",
    label: "Fleet Foot",
    description: "Cleanse slows and move 25% faster for 4s.",
    cooldownMs: 15000,
    durationMs: 4000,
    manaCost: 6
  },
  // --- Thief ---
  quick_step: {
    id: "quick_step",
    label: "Quick Step",
    description: "Dash 2 tiles in the direction you face.",
    cooldownMs: 6000,
    durationMs: 0,
    manaCost: 4
  },
  backstab: {
    id: "backstab",
    label: "Backstab",
    description: "Strike from behind for 2.5x damage; otherwise normal.",
    cooldownMs: 10000,
    durationMs: 0,
    manaCost: 8,
    damage: [12, 18],
    skill: "attack",
    range: 1.6,
    effectKind: "hit"
  },
  // --- Mage ---
  flame_burst: {
    id: "flame_burst",
    label: "Flame Burst",
    description: "Ignite a 3x3 area in front of you with a burning DoT.",
    cooldownMs: 5000,
    durationMs: 4000,
    manaCost: 12,
    damage: [10, 16],
    skill: "magic",
    effectKind: "flare"
  },
  frost_nova: {
    id: "frost_nova",
    label: "Frost Nova",
    description: "Freeze monsters around you for 3s (damage breaks it).",
    cooldownMs: 18000,
    durationMs: 3000,
    manaCost: 14,
    damage: [6, 10],
    skill: "magic",
    effectKind: "frost"
  },
  // --- Apothecary ---
  healing_poultice: {
    id: "healing_poultice",
    label: "Healing Poultice",
    description: "Heal instantly, then regenerate over 5s. Scales with Alchemy.",
    cooldownMs: 10000,
    durationMs: 5000,
    manaCost: 10,
    healFraction: 0.18
  },
  volatile_flask: {
    id: "volatile_flask",
    label: "Volatile Flask",
    description: "Hurl a flask: 3x3 toxic burst that lowers enemy accuracy.",
    cooldownMs: 14000,
    durationMs: 5000,
    manaCost: 12,
    damage: [10, 16],
    skill: "magic",
    range: 4,
    effectKind: "flare"
  }
};

export const SKILLS: Record<string, SkillDef> = {
  attack: { label: "Attack", iconUrl: "/icons/skill-attack.png" },
  defense: { label: "Defense", iconUrl: "/icons/skill-defense.png" },
  magic: { label: "Magic", iconUrl: "/icons/skill-magic.png" },
  woodcutting: { label: "Woodcutting", iconUrl: "/icons/skill-woodcutting.png" },
  fishing: { label: "Fishing", iconUrl: "/icons/skill-fishing.png" },
  mining: { label: "Mining", iconUrl: "/icons/skill-mining.png" },
  firemaking: { label: "Firemaking", iconUrl: "/icons/skill-firemaking.png" },
  cooking: { label: "Cooking", iconUrl: "/icons/skill-cooking.png" },
  agility: { label: "Agility", iconUrl: "/icons/skill-agility.png" },
  alchemy: { label: "Alchemy", iconUrl: "/icons/skill-alchemy.png" },
  ranged: { label: "Ranged", iconUrl: "/icons/skill-ranged.png" },
  foraging: { label: "Foraging", iconUrl: "/icons/skill-foraging.png" }
};

export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(70 * (level - 1) ** 1.55);
}

// Chance (0..1) to dodge an incoming hit: the class base plus +0.5% per Agility
// level above 1, with a soft cap on the Agility bonus and a hard overall cap.
export function dodgeChanceFor(classKey: string, agilityLevel: number): number {
  const base = CLASSES[classKey]?.dodgeChance ?? 0;
  const bonus = Math.min(0.2, Math.max(0, agilityLevel - 1) * 0.005);
  return Math.min(0.3, base + bonus);
}

export function makeFloorTiles(floor: number): string[] {
  const cached = FLOOR_TILE_CACHE.get(floor);
  if (cached) return cached;

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
    setTile(rows, 25, 2, "N");
    setTile(rows, 25, 31, "S");
    setTile(rows, 17, 15, "n");
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
    setTile(rows, 5, 16, "g");
    setTile(rows, 44, 16, "g");
    fillRect(rows, 22, 18, 8, 5, "O");
    fillRect(rows, 25, 18, 1, 3, "c");
    setTile(rows, 25, 2, "T");
    setTile(rows, 25, 20, "C");
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
    setTile(rows, 6, 6, "T");
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
    setTile(rows, 25, 31, "S");
    setTile(rows, 25, 2, "N");
    setTile(rows, 1, 17, "M"); // west-edge portal to the Sunken Marsh (floor 5)
    setTile(rows, 50, 16, "D"); // east-edge portal to the Searing Badlands (floor 6)
    scatter(rows, "F", "f", 220, 31);
    scatter(rows, "F", "r", 48, 32);
  }

  if (floor === 6) {
    // The Searing Badlands: a rust massif of cliff walls carved into winding
    // canyon floors, with a high terrace over a pit gap and a frontier camp east.
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "X"); // cliff massif (impassable)
    // West entry ravine + portal back to the forest.
    fillRect(rows, 2, 14, 9, 6, "R");
    setTile(rows, 1, 16, "D");
    // Main winding ravine west -> east (kept clear of pits).
    fillRect(rows, 9, 15, 13, 4, "R"); // lower-west run
    fillRect(rows, 18, 8, 4, 11, "R"); // north turn
    fillRect(rows, 18, 8, 14, 4, "R"); // upper run
    fillRect(rows, 28, 8, 4, 13, "R"); // south turn
    fillRect(rows, 28, 18, 14, 4, "R"); // lower-east run
    fillRect(rows, 38, 9, 4, 11, "R"); // north turn to camp
    fillRect(rows, 38, 6, 11, 8, "R"); // Frontier Camp clearing
    setTile(rows, 46, 8, "Z"); // cliff ledge -> western Northwatch (one-way)
    // Dead-end canyon with copper ore, off the lower-west run.
    fillRect(rows, 3, 21, 8, 4, "R");
    fillRect(rows, 5, 19, 3, 2, "R"); // connector
    // High-ground terrace (ranged vantage) reached by a ramp, over a pit gap.
    fillRect(rows, 23, 23, 8, 4, "R"); // terrace
    fillRect(rows, 30, 22, 2, 2, "A"); // ramp up from the lower-east run
    fillRect(rows, 24, 21, 7, 2, "P"); // pit gap below the upper run (LOS-open)
    // Pit hazards in canyon floors (block movement, not sight).
    setTile(rows, 23, 9, "P");
    setTile(rows, 33, 20, "P");
  }

  if (floor === 5) {
    // The Sunken Marsh: a basin of impassable swamp water with a winding marsh
    // causeway from the east entry to the Alchemist's Hut clearing in the west.
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "W");
    // East entry clearing + portal back to the forest.
    fillRect(rows, 42, 13, 8, 8, "m");
    setTile(rows, 50, 16, "M"); // east-edge portal back to the forest
    // Winding causeway east -> west.
    fillRect(rows, 30, 14, 13, 4, "m"); // upper-east run
    fillRect(rows, 27, 14, 3, 2, "B"); // bridge 1 (narrow chokepoint)
    fillRect(rows, 18, 14, 9, 4, "m"); // mid run
    fillRect(rows, 18, 6, 4, 11, "m"); // north turn
    fillRect(rows, 8, 6, 12, 4, "m"); // west run (upper)
    fillRect(rows, 4, 6, 8, 9, "k"); // Alchemist's Hut clearing (dirt)
    // South loop (Mire-Lotus pocket) gated by a second bridge.
    fillRect(rows, 20, 16, 2, 3, "B"); // bridge 2 (narrow chokepoint)
    fillRect(rows, 14, 18, 8, 5, "m"); // south pocket
    fillRect(rows, 8, 21, 8, 4, "m"); // south-west pocket
    // Boulders for line-of-sight cover along the paths.
    setTile(rows, 35, 15, "o");
    setTile(rows, 24, 15, "o");
    setTile(rows, 19, 11, "o");
    setTile(rows, 16, 20, "o");
    setTile(rows, 11, 22, "o");
    // One-way cliff ledge: hop down into northern Waystone.
    setTile(rows, 5, 9, "L");
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
    setTile(rows, 25, 31, "S");
    scatter(rows, ".", "f", 28, 41);
    scatter(rows, ".", "r", 16, 42);
  }

  const tiles = rows.map((row) => row.join(""));
  FLOOR_TILE_CACHE.set(floor, tiles);
  return tiles;
}

export function tileAt(floor: number, tx: number, ty: number): string {
  const rows = makeFloorTiles(floor);
  if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return "#";
  return rows[ty]?.[tx] ?? "#";
}

export function isBlockedTile(tile: string): boolean {
  return (
    tile === "#" || tile === "~" || tile === "W" || tile === "f" || tile === "q" || tile === "r" || tile === "O" || tile === "o" ||
    tile === "X" || tile === "P" // badlands cliff wall + pit
  );
}

// Blocks line-of-sight for ranged attacks. Solid terrain (walls, boulders,
// buildings, trees, fences, cliffs) blocks sight; open water and pit chasms do
// NOT — so projectiles skim over swamp water / badlands pits, while boulders and
// cliffs give cover.
export function isSightBlocked(tile: string): boolean {
  return tile === "#" || tile === "o" || tile === "O" || tile === "f" || tile === "r" || tile === "q" || tile === "X";
}

export function isSafeZone(floor: number, x: number, y: number): boolean {
  if (floor === 0 || floor === 4) return true;
  // The Alchemist's Hut clearing in the Sunken Marsh is a safe rest spot.
  if (floor === 5 && x >= 3 && x <= 13 && y >= 5 && y <= 15) return true;
  // The Frontier Camp clearing in the Searing Badlands.
  if (floor === 6 && x >= 38 && x <= 49 && y >= 6 && y <= 14) return true;
  return false;
}

export function zoneAt(floor: number, x: number, y: number): string {
  for (const zone of Object.values(ZONES)) {
    if (zone.floor !== floor) continue;
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) return zone.id;
  }
  return `floor-${floor}`;
}

export function portalFor(floor: number, x: number, y: number): Portal | null {
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
  if (floor === 3 && tile === "M") return { floor: 5, x: 48.5, y: 16.5 };
  if (floor === 4 && tile === "S") return { floor: 3, x: 25.5, y: 3.5 };
  if (floor === 5 && tile === "M") return { floor: 3, x: 2.5, y: 17.5 };
  if (floor === 5 && tile === "L") return { floor: 0, x: 25.5, y: 4.5 }; // one-way drop into Waystone
  if (floor === 3 && tile === "D") return { floor: 6, x: 3.5, y: 16.5 };
  if (floor === 6 && tile === "D") return { floor: 3, x: 49.5, y: 16.5 };
  if (floor === 6 && tile === "Z") return { floor: 4, x: 6.5, y: 16.5 }; // one-way drop into Northwatch
  return null;
}

function fillRect(rows: string[][], x: number, y: number, w: number, h: number, tile: string): void {
  for (let yy = y; yy < y + h; yy += 1) {
    const row = rows[yy];
    if (!row) continue;
    for (let xx = x; xx < x + w; xx += 1) {
      if (row[xx] !== undefined) row[xx] = tile;
    }
  }
}

function setTile(rows: string[][], x: number, y: number, tile: string): void {
  const row = rows[y];
  if (row && row[x] !== undefined) row[x] = tile;
}

function scatter(rows: string[][], onTile: string, newTile: string, count: number, seed: number): void {
  let value = seed * 9973;
  for (let i = 0; i < count; i += 1) {
    value = (value * 48271) % 2147483647;
    const x = 3 + (value % (MAP_COLS - 6));
    value = (value * 48271) % 2147483647;
    const y = 3 + (value % (MAP_ROWS - 6));
    const row = rows[y];
    if (row && row[x] === onTile) row[x] = newTile;
  }
}
