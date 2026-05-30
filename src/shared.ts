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
// Default floor footprint. Most floors are this size; a few biomes override it
// via FLOOR_DIMS, so always size per-floor work with floorCols/floorRows.
export const MAP_COLS = 52;
export const MAP_ROWS = 34;

// Every region is enlarged to this footprint (~3x the original area), matching
// the bespoke Northwood expansion. Floor 3 is authored directly at this size;
// every other floor is authored at the native 52x34 and upscaled, so its tiles
// AND its content coordinates scale by the same factor — which keeps walkable
// tiles walkable and the map connected.
const EXPANDED = { cols: 90, rows: 60 };
const FLOOR_DIMS: Record<number, { cols: number; rows: number }> = {
  0: EXPANDED,
  1: EXPANDED,
  2: EXPANDED,
  3: EXPANDED,
  4: EXPANDED,
  5: EXPANDED,
  6: EXPANDED,
  7: EXPANDED,
  8: EXPANDED,
  9: EXPANDED
};
// Floors authored directly at the expanded size (their content is already
// placed in expanded coordinates, so it must NOT be scaled again).
const AUTHORED_AT_TARGET = new Set<number>([3]);

export function floorCols(floor: number): number {
  return FLOOR_DIMS[floor]?.cols ?? MAP_COLS;
}
export function floorRows(floor: number): number {
  return FLOOR_DIMS[floor]?.rows ?? MAP_ROWS;
}

// Factor by which a floor's native-authored content is stretched to fill its
// expanded footprint. 1 for floors authored directly at the target size.
export function contentScaleX(floor: number): number {
  if (AUTHORED_AT_TARGET.has(floor) || !FLOOR_DIMS[floor]) return 1;
  return FLOOR_DIMS[floor]!.cols / MAP_COLS;
}
export function contentScaleY(floor: number): number {
  if (AUTHORED_AT_TARGET.has(floor) || !FLOOR_DIMS[floor]) return 1;
  return FLOOR_DIMS[floor]!.rows / MAP_ROWS;
}
export function scaleX(floor: number, x: number): number {
  return x * contentScaleX(floor);
}
export function scaleY(floor: number, y: number): number {
  return y * contentScaleY(floor);
}

// Nearest-neighbour upscale of an authored tile grid into a larger footprint.
function scaleFloorTiles(native: string[][], cols: number, rows: number): string[][] {
  const nr = native.length;
  const nc = native[0]?.length ?? 0;
  const out: string[][] = [];
  for (let y = 0; y < rows; y += 1) {
    const oy = Math.min(nr - 1, Math.floor((y * nr) / rows));
    const srcRow = native[oy] ?? [];
    const row: string[] = [];
    for (let x = 0; x < cols; x += 1) {
      const ox = Math.min(nc - 1, Math.floor((x * nc) / cols));
      row.push(srcRow[ox] ?? "#");
    }
    out.push(row);
  }
  return out;
}

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

export const START: Portal = { floor: 0, x: scaleX(0, 16.5), y: scaleY(0, 17.5) };

export const ZONES: Record<ZoneId, Zone> = {
  southTown: { id: "southTown", label: "Waystone", floor: 0, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  cemetery: { id: "cemetery", label: "Southgate Cemetery", floor: 1, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  crypt: { id: "crypt", label: "Ashen Crypt", floor: 2, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  woods: { id: "woods", label: "Northwood", floor: 3, x1: 0, y1: 0, x2: floorCols(3) - 1, y2: floorRows(3) - 1 },
  northTown: { id: "northTown", label: "Northwatch", floor: 4, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  marsh: { id: "marsh", label: "The Sunken Marsh", floor: 5, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  badlands: { id: "badlands", label: "The Searing Badlands", floor: 6, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  desert: { id: "desert", label: "The Sunken Desert", floor: 7, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  beach: { id: "beach", label: "The Sunken Beach", floor: 8, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  jungle: { id: "jungle", label: "The Untamed Jungle", floor: 9, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 }
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

  // Floor 3 is authored at the expanded size; the rest are authored at the
  // native footprint and upscaled below.
  const authored = AUTHORED_AT_TARGET.has(floor);
  const authorCols = authored ? floorCols(floor) : MAP_COLS;
  const authorRows = authored ? floorRows(floor) : MAP_ROWS;
  const rows = Array.from({ length: authorRows }, () => Array.from({ length: authorCols }, () => "#"));

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
    setTile(rows, 25, 32, "G"); // south-edge portal to the Sunken Desert (floor 7)
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
    // Northwood, expanded ~3x (90x60). One open canopy of walkable forest floor
    // threaded by two broad roads that cross at the heart of the wood, so all
    // four edge portals stay reachable.
    fillRect(rows, 1, 1, 88, 58, "F");
    fillRect(rows, 44, 2, 3, 56, "t"); // north-south spine
    fillRect(rows, 2, 29, 86, 2, "t"); // east-west road

    // Glades: open clearings that break up the trees and host gathering.
    fillRect(rows, 8, 7, 8, 6, "d"); // NW glade
    fillRect(rows, 70, 9, 9, 6, "d"); // NE glade
    fillRect(rows, 10, 45, 9, 6, "d"); // SW glade
    fillRect(rows, 68, 44, 10, 7, "d"); // SE glade
    fillRect(rows, 30, 13, 7, 5, "d"); // north meadow
    fillRect(rows, 54, 37, 7, 5, "d"); // south meadow
    fillRect(rows, 40, 26, 11, 9, "d"); // central crossroads clearing

    // Woodland ponds (impassable water; anglers fish from the bank).
    fillRect(rows, 20, 20, 6, 4, "~");
    fillRect(rows, 64, 20, 6, 4, "~");
    fillRect(rows, 38, 48, 7, 4, "~");

    setTile(rows, 45, 58, "S"); // south edge -> Waystone (floor 0)
    setTile(rows, 45, 1, "N"); // north edge -> Northwatch (floor 4)
    setTile(rows, 1, 30, "M"); // west edge -> the Sunken Marsh (floor 5)
    setTile(rows, 88, 29, "D"); // east edge -> the Searing Badlands (floor 6)

    scatter(rows, "F", "f", 540, 31); // dense canopy
    scatter(rows, "F", "r", 120, 32); // mossy boulders

    // Three ore outcrops, spread across the wood (mining moved out of town).
    // Each sits on rock with a cleared standing spot carved beside it (set
    // after scatter so a stray tree never blocks the approach).
    for (const [rx, ry] of [[8, 49], [80, 12], [78, 47]] as Array<[number, number]>) {
      setTile(rows, rx, ry, "r");
      setTile(rows, rx + 1, ry, "d");
    }
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

  if (floor === 7) {
    // The Sunken Desert: a wide-open expanse of sand with quicksand hazards,
    // oasis bottlenecks, and crumbling ruins for cover.
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "a"); // open sand
    setTile(rows, 25, 1, "G"); // north portal to/from the cemetery
    // Oasis pools (impassable bottlenecks).
    fillRect(rows, 8, 7, 5, 3, "V");
    fillRect(rows, 38, 9, 5, 3, "V");
    fillRect(rows, 16, 20, 4, 3, "V");
    // Quicksand hazards (impassable, sight-open).
    fillRect(rows, 28, 6, 3, 3, "Q");
    fillRect(rows, 12, 16, 3, 2, "Q");
    fillRect(rows, 33, 18, 3, 2, "Q");
    // Crumbling ruins for line-of-sight cover.
    for (const [rx, ry] of [[20, 10], [30, 12], [15, 13], [36, 15], [24, 16], [27, 22]] as const) setTile(rows, rx, ry, "U");
    // Oasis Trade Outpost (south) — safe, with palm + tent and a passage to Waystone.
    fillRect(rows, 20, 26, 11, 5, "a");
    setTile(rows, 25, 31, "H");
    setTile(rows, 10, 32, "Y"); // coastal trail to the Sunken Beach (floor 8)
  }

  if (floor === 8) {
    // The Sunken Beach: a wide, open coast of white sand with the impassable sea
    // to the south and shipwreck ruins for sparse cover.
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "e"); // white sand
    fillRect(rows, 1, 24, MAP_COLS - 2, 8, "I"); // the sea (impassable, sight-open)
    fillRect(rows, 12, 18, 4, 4, "I"); // tidal inlet
    fillRect(rows, 36, 16, 5, 4, "I"); // tidal inlet
    for (const [rx, ry] of [[10, 8], [20, 6], [30, 10], [40, 8], [16, 12], [34, 14], [25, 12]] as const) setTile(rows, rx, ry, "U");
    setTile(rows, 25, 1, "Y"); // north trail to/from the desert
    setTile(rows, 50, 14, "j"); // east trail to the Untamed Jungle (floor 9)
  }

  if (floor === 9) {
    // The Untamed Jungle: a claustrophobic maze of dense canopy walls and rivers,
    // crossed by a narrow vine bridge, with a sealed vault deep inside.
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, "E"); // dense jungle (wall + canopy)
    setTile(rows, 1, 15, "j"); // west portal to/from the beach
    // Winding 2-tile paths.
    fillRect(rows, 2, 14, 9, 3, "y"); // west entry run
    fillRect(rows, 8, 7, 3, 10, "y"); // turn north
    fillRect(rows, 8, 7, 19, 3, "y"); // upper run east (reaches the bridge)
    fillRect(rows, 21, 7, 3, 12, "y"); // turn south
    fillRect(rows, 14, 16, 10, 3, "y"); // lower run west
    fillRect(rows, 14, 16, 3, 10, "y"); // turn south to the vault
    fillRect(rows, 10, 24, 12, 4, "y"); // vault clearing
    setTile(rows, 15, 26, "K"); // sealed Jungle Vault (Tier-1 dungeon hook)
    // Deep river + vine bridge chokepoint to the east jungle.
    fillRect(rows, 27, 5, 3, 23, "i"); // river
    fillRect(rows, 27, 8, 3, 2, "B"); // vine bridge (narrow choke)
    fillRect(rows, 30, 7, 15, 3, "y"); // east jungle run
    fillRect(rows, 42, 7, 3, 14, "y"); // east turn south
    fillRect(rows, 34, 18, 11, 3, "y"); // east lower run
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

  const sized = authored || !FLOOR_DIMS[floor] ? rows : scaleFloorTiles(rows, floorCols(floor), floorRows(floor));
  frameFloorEdge(sized, floor);

  const tiles = sized.map((row) => row.join(""));
  FLOOR_TILE_CACHE.set(floor, tiles);
  return tiles;
}

// Natural biome boundary for each floor's outer ring, so map edges read as
// forest/water/cliff/canopy instead of a bare grey rock wall. Only ever
// recolors the grey `#` border tiles — portals and interior are left untouched.
const FLOOR_EDGE: Record<number, string> = {
  0: "f", // Waystone — ringed by woods
  3: "f", // Northwood — dense treeline
  4: "f", // Northwatch — ringed by woods
  5: "W", // The Sunken Marsh — deep water
  6: "X", // The Searing Badlands — cliff walls
  7: "X", // The Sunken Desert — sandstone walls
  8: "I", // The Sunken Beach — open sea
  9: "E" // The Untamed Jungle — impassable canopy
};

function frameFloorEdge(rows: string[][], floor: number): void {
  const edge = FLOOR_EDGE[floor];
  if (!edge) return;
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  for (let y = 0; y < h; y += 1) {
    const onVerticalEdge = y === 0 || y === h - 1;
    const row = rows[y];
    if (!row) continue;
    for (let x = 0; x < w; x += 1) {
      if ((onVerticalEdge || x === 0 || x === w - 1) && row[x] === "#") row[x] = edge;
    }
  }
}

export function tileAt(floor: number, tx: number, ty: number): string {
  const rows = makeFloorTiles(floor);
  if (tx < 0 || ty < 0 || tx >= floorCols(floor) || ty >= floorRows(floor)) return "#";
  return rows[ty]?.[tx] ?? "#";
}

export function isBlockedTile(tile: string): boolean {
  return (
    tile === "#" || tile === "~" || tile === "W" || tile === "f" || tile === "q" || tile === "r" || tile === "O" || tile === "o" ||
    tile === "X" || tile === "P" || // badlands cliff wall + pit
    tile === "Q" || tile === "V" || tile === "U" || // desert quicksand + oasis + ruin
    tile === "I" || tile === "E" || tile === "i" // beach sea + jungle wall + jungle river
  );
}

// Blocks line-of-sight for ranged attacks. Solid terrain (walls, boulders,
// buildings, trees, fences, cliffs) blocks sight; open water and pit chasms do
// NOT — so projectiles skim over swamp water / badlands pits, while boulders and
// cliffs give cover.
export function isSightBlocked(tile: string): boolean {
  // Open water/quicksand/pits do NOT block sight; solid walls/ruins/jungle do.
  return (
    tile === "#" || tile === "o" || tile === "O" || tile === "f" || tile === "r" || tile === "q" ||
    tile === "X" || tile === "U" || tile === "E" // badlands cliff, ruin, jungle wall
  );
}

export function isSafeZone(floor: number, x: number, y: number): boolean {
  if (floor === 0 || floor === 4) return true;
  // Outpost clearings are authored in native coords; scale the rect to match
  // the floor's expanded footprint.
  const inRect = (f: number, x1: number, y1: number, x2: number, y2: number): boolean =>
    floor === f && x >= scaleX(f, x1) && x <= scaleX(f, x2) && y >= scaleY(f, y1) && y <= scaleY(f, y2);
  // The Alchemist's Hut clearing in the Sunken Marsh is a safe rest spot.
  if (inRect(5, 3, 5, 13, 15)) return true;
  // The Frontier Camp clearing in the Searing Badlands.
  if (inRect(6, 38, 6, 49, 14)) return true;
  // The Oasis Trade Outpost in the Sunken Desert.
  if (inRect(7, 19, 25, 31, 32)) return true;
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
  const dest = portalForRaw(floor, x, y);
  if (!dest) return null;
  // Destinations are written in each floor's authored coordinates; stretch them
  // into the floor's expanded footprint.
  return { floor: dest.floor, x: scaleX(dest.floor, dest.x), y: scaleY(dest.floor, dest.y) };
}

function portalForRaw(floor: number, x: number, y: number): Portal | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tile = tileAt(floor, tx, ty);
  if (floor === 0 && tile === "N") return { floor: 3, x: 45.5, y: 57.5 };
  if (floor === 0 && tile === "S") return { floor: 1, x: 25.5, y: 3.5 };
  if (floor === 1 && tile === "T") return { floor: 0, x: 25.5, y: 30.5 };
  if (floor === 1 && tile === "C") return { floor: 2, x: 6.5, y: 6.5 };
  if (floor === 2 && tile === "T") return { floor: 1, x: 25.5, y: 21.5 };
  if (floor === 3 && tile === "S") return { floor: 0, x: 25.5, y: 3.5 };
  if (floor === 3 && tile === "N") return { floor: 4, x: 25.5, y: 30.5 };
  if (floor === 3 && tile === "M") return { floor: 5, x: 48.5, y: 16.5 };
  if (floor === 4 && tile === "S") return { floor: 3, x: 45.5, y: 2.5 };
  if (floor === 5 && tile === "M") return { floor: 3, x: 2.5, y: 30.5 };
  if (floor === 5 && tile === "L") return { floor: 0, x: 25.5, y: 4.5 }; // one-way drop into Waystone
  if (floor === 3 && tile === "D") return { floor: 6, x: 3.5, y: 16.5 };
  if (floor === 6 && tile === "D") return { floor: 3, x: 87.5, y: 29.5 };
  if (floor === 6 && tile === "Z") return { floor: 4, x: 6.5, y: 16.5 }; // one-way drop into Northwatch
  if (floor === 1 && tile === "G") return { floor: 7, x: 25.5, y: 2.5 };
  if (floor === 7 && tile === "G") return { floor: 1, x: 25.5, y: 30.5 };
  if (floor === 7 && tile === "H") return { floor: 0, x: 25.5, y: 27.5 }; // one-way passage into Waystone
  if (floor === 7 && tile === "Y") return { floor: 8, x: 25.5, y: 2.5 };
  if (floor === 8 && tile === "Y") return { floor: 7, x: 10.5, y: 31.5 };
  if (floor === 8 && tile === "j") return { floor: 9, x: 2.5, y: 15.5 };
  if (floor === 9 && tile === "j") return { floor: 8, x: 49.5, y: 14.5 };
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
  const cols = rows[0]?.length ?? MAP_COLS;
  const rowCount = rows.length;
  let value = seed * 9973;
  for (let i = 0; i < count; i += 1) {
    value = (value * 48271) % 2147483647;
    const x = 3 + (value % (cols - 6));
    value = (value * 48271) % 2147483647;
    const y = 3 + (value % (rowCount - 6));
    const row = rows[y];
    if (row && row[x] === onTile) row[x] = newTile;
  }
}
