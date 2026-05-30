import type { Range, ZoneId } from "./content-types.ts";
import { MAP_OBJECTS, BLOCKING_OBJECT_KEYS } from "./map-objects.ts";

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
const AUTHORED_AT_TARGET = new Set<number>([3, 5, 6, 7, 8, 9]);

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
    // Building collision is stamped from the composed sprites post-scale
    // (stampBuildingCollision), so it stays aligned with the visible building.
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
    // The Searing Badlands (bespoke 90x60) — a deep ravine carved through a dark
    // rock massif. Pattern: fill massif (w), carve the winding walkable canyon
    // floors (R), then applyCliffEdges() drops a 1-tile south-facing cliff face
    // (X) wherever the massif overhangs a floor, so walls read as layered cliffs
    // instead of a flat-stacked block. Ore clusters against the walls.
    fillRect(rows, 0, 0, 90, 60, "w");
    // Main canyon — an S-curve west mouth -> mid -> Frontier Camp (east).
    fillRect(rows, 1, 30, 16, 7, "R"); // west mouth (forest portal arrives here)
    fillRect(rows, 12, 16, 7, 21, "R"); // climb north
    fillRect(rows, 12, 16, 24, 7, "R"); // upper run east
    fillRect(rows, 30, 16, 7, 22, "R"); // drop south
    fillRect(rows, 30, 31, 28, 7, "R"); // mid lower run east
    fillRect(rows, 52, 14, 7, 24, "R"); // climb to the camp
    fillRect(rows, 52, 12, 30, 11, "R"); // Frontier Camp clearing
    // Dead-end copper canyon off the west mouth.
    fillRect(rows, 4, 41, 12, 5, "R");
    fillRect(rows, 8, 36, 4, 6, "R"); // connector
    // Iron pocket off the mid lower run.
    fillRect(rows, 40, 44, 11, 5, "R");
    fillRect(rows, 44, 37, 4, 8, "R"); // connector
    // High terrace (ranged vantage) over a pit gap, reached from the camp.
    fillRect(rows, 64, 26, 12, 6, "R"); // terrace floor
    fillRect(rows, 70, 22, 3, 5, "R"); // camp -> terrace connector
    fillRect(rows, 71, 31, 2, 1, "A"); // ramp lip
    fillRect(rows, 66, 32, 8, 2, "P"); // pit gap the terrace overlooks (LOS-open)
    // Pit hazards in the canyon floors (block movement, not sight).
    setTile(rows, 25, 16, "P");
    setTile(rows, 33, 37, "P");
    // Portals.
    setTile(rows, 1, 33, "D"); // west edge -> the forest
    setTile(rows, 78, 13, "Z"); // cliff ledge -> western Northwatch (one-way)
    // Layered cliff faces where the massif overhangs a canyon floor.
    applyCliffEdges(rows);
  }

  if (floor === 7) {
    // The Sunken Desert (bespoke 90x60) — open sweeping dunes of sand (a) split by
    // sandstone canyons. Mirrors the badlands: fill the canyon bulk with massif
    // (w), carve the winding sand routes, then applyCliffEdges("a","w","X") drops a
    // 1-tile sandstone cliff face wherever the massif overhangs open sand. Ruins
    // (U) give cover, quicksand (Q) and an oasis (V) gate the routes; the Oasis
    // Trade Outpost (safe) nestles against the south wall.
    fillRect(rows, 0, 0, 90, 60, "a");
    fillRect(rows, 6, 4, 26, 12, "w");
    fillRect(rows, 40, 3, 30, 13, "w");
    fillRect(rows, 30, 22, 20, 10, "w");
    fillRect(rows, 52, 34, 30, 16, "w");
    fillRect(rows, 4, 38, 18, 18, "w");
    fillRect(rows, 22, 3, 5, 16, "a"); // north entry shaft (G at its top)
    fillRect(rows, 22, 16, 22, 5, "a");
    fillRect(rows, 12, 20, 18, 14, "a");
    fillRect(rows, 50, 18, 14, 16, "a");
    fillRect(rows, 26, 32, 26, 6, "a");
    fillRect(rows, 1, 30, 12, 5, "a"); // beach trail (west)
    fillRect(rows, 22, 38, 6, 12, "a"); // route to the outpost
    fillRect(rows, 18, 46, 30, 10, "a"); // outpost clearing
    fillRect(rows, 30, 47, 6, 4, "V"); // oasis pool
    setTile(rows, 25, 49, "H"); // one-way passage to Waystone
    setTile(rows, 24, 2, "G"); // north gate to/from the cemetery
    setTile(rows, 1, 32, "Y"); // west trail to the Sunken Beach
    fillRect(rows, 16, 22, 4, 3, "V");
    fillRect(rows, 56, 20, 4, 3, "V");
    fillRect(rows, 38, 17, 3, 2, "Q");
    fillRect(rows, 24, 24, 2, 3, "Q");
    fillRect(rows, 40, 34, 3, 2, "Q");
    fillRect(rows, 24, 42, 2, 3, "Q");
    for (const [rx, ry] of [[13, 19], [29, 19], [44, 16], [49, 21], [31, 33], [49, 33], [20, 34], [27, 45], [40, 45]] as Array<[number, number]>)
      setTile(rows, rx, ry, "U");
    applyCliffEdges(rows, "a", "w", "X");
  }

  if (floor === 8) {
    // The Sunken Beach (bespoke 90x60) — a wide open coast of white sand (e) for
    // kiting reef prowlers, with the sea (I) washing in along an organic coastline
    // of coves and spits. A driftwood hut + palms sit on the dry sand.
    fillRect(rows, 0, 0, 90, 60, "e");
    fillRect(rows, 1, 46, 88, 13, "I"); // open southern sea
    fillRect(rows, 6, 42, 18, 4, "I"); // west cove
    fillRect(rows, 10, 39, 9, 3, "I");
    fillRect(rows, 30, 43, 14, 3, "I"); // central scoop
    fillRect(rows, 60, 41, 16, 5, "I"); // east bay
    fillRect(rows, 64, 37, 8, 4, "I");
    fillRect(rows, 70, 44, 6, 6, "e"); // sandy spit into the bay
    fillRect(rows, 36, 22, 12, 7, "I"); // tidal lagoon
    fillRect(rows, 40, 20, 5, 2, "I");
    fillRect(rows, 8, 1, 7, 6, "I"); // NW cove
    fillRect(rows, 54, 1, 10, 5, "I"); // NE cove
    fillRect(rows, 78, 8, 11, 10, "I"); // eastern inlet by the jungle trail
    setTile(rows, 25, 1, "Y"); // north trail to/from the desert
    setTile(rows, 50, 14, "j"); // east trail to the Untamed Jungle
  }

  if (floor === 9) {
    // The Untamed Jungle (bespoke 90x60) — a claustrophobic maze of dense canopy
    // walls (E) threaded by tight 3-wide jungle-floor runs (y). A winding river (i)
    // splits the map, forded only at 1-tile boulder chokepoints where venomous
    // stalkers ambush. The sealed Jungle Vault (K) sits in a dead-end clearing.
    fillRect(rows, 0, 0, 90, 60, "E");
    setTile(rows, 1, 15, "j"); // west portal to/from the Sunken Beach
    fillRect(rows, 1, 14, 11, 4, "y"); // entry run
    fillRect(rows, 8, 6, 4, 12, "y");
    fillRect(rows, 8, 6, 22, 4, "y");
    fillRect(rows, 20, 6, 4, 16, "y");
    fillRect(rows, 12, 18, 12, 4, "y");
    fillRect(rows, 12, 18, 4, 18, "y");
    fillRect(rows, 8, 32, 18, 6, "y"); // vault clearing
    fillRect(rows, 20, 22, 4, 16, "y");
    fillRect(rows, 30, 2, 4, 30, "i"); // river trunk
    fillRect(rows, 30, 28, 26, 4, "i");
    fillRect(rows, 52, 28, 4, 26, "i");
    fillRect(rows, 30, 7, 4, 1, "y"); // upper ford
    fillRect(rows, 30, 30, 4, 1, "y"); // lower ford
    fillRect(rows, 34, 6, 18, 4, "y");
    fillRect(rows, 48, 6, 4, 19, "y");
    fillRect(rows, 36, 21, 16, 4, "y");
    fillRect(rows, 36, 32, 20, 6, "y");
    fillRect(rows, 58, 32, 5, 12, "y");
    setTile(rows, 16, 35, "K"); // sealed Jungle Vault (does not transport)
  }

  if (floor === 5) {
    // The Sunken Marsh (bespoke 90x60) — a drowned basin of deep swamp water (W,
    // blocks movement not sight) threaded by winding 1-2 tile marsh (m) and
    // swamp-dirt (k) causeways linked by wooden bridges (B). The Alchemist's Hut
    // sits on solid ground in the NW; Mire-Spitter turrets are anchored on the
    // open water and fire across the causeways. Boulders (o) give LOS cover.
    fillRect(rows, 0, 0, 90, 60, "W");
    fillRect(rows, 44, 18, 13, 11, "m"); // east entry basin (forest portal arrives)
    fillRect(rows, 48, 14, 6, 4, "m");
    setTile(rows, 56, 23, "M"); // east-edge portal back to the forest
    fillRect(rows, 50, 28, 9, 6, "m"); // SE marsh shelf
    fillRect(rows, 54, 25, 4, 4, "m");
    fillRect(rows, 38, 20, 7, 4, "m"); // run west off the entry
    fillRect(rows, 34, 14, 5, 10, "m"); // climb north
    fillRect(rows, 31, 14, 3, 3, "B"); // bridge 1 (chokepoint)
    fillRect(rows, 24, 13, 8, 5, "m");
    fillRect(rows, 24, 18, 4, 10, "m"); // drop south
    fillRect(rows, 21, 25, 3, 3, "B"); // bridge 2 (chokepoint)
    fillRect(rows, 13, 24, 9, 6, "m"); // mid-west shelf
    fillRect(rows, 13, 16, 5, 9, "m"); // climb to the hut
    fillRect(rows, 13, 16, 9, 4, "m");
    fillRect(rows, 4, 12, 12, 10, "k"); // Alchemist's Hut clearing (safe)
    fillRect(rows, 12, 14, 3, 6, "m");
    fillRect(rows, 16, 30, 3, 3, "B"); // bridge 3 into the lotus pocket
    fillRect(rows, 9, 33, 13, 7, "m"); // southern Mire-Lotus pocket
    fillRect(rows, 18, 36, 8, 4, "m");
    setTile(rows, 41, 19, "o");
    setTile(rows, 38, 22, "o");
    setTile(rows, 27, 14, "o");
    setTile(rows, 25, 26, "o");
    setTile(rows, 18, 27, "o");
    setTile(rows, 11, 35, "o");
    setTile(rows, 20, 38, "o");
    setTile(rows, 52, 30, "o");
    setTile(rows, 6, 13, "L"); // one-way cliff ledge -> northern Waystone
  }

  if (floor === 4) {
    fillRect(rows, 1, 1, MAP_COLS - 2, MAP_ROWS - 2, ".");
    fillRect(rows, 9, 10, 34, 13, "s");
    fillRect(rows, 13, 14, 12, 6, "p");
    fillRect(rows, 24, 2, 3, 30, "s");
    fillRect(rows, 10, 16, 34, 3, "s");
    setTile(rows, 25, 31, "S");
    scatter(rows, ".", "f", 28, 41);
    scatter(rows, ".", "r", 16, 42);
  }

  const sized = authored || !FLOOR_DIMS[floor] ? rows : scaleFloorTiles(rows, floorCols(floor), floorRows(floor));
  frameFloorEdge(sized, floor);
  stampBuildingCollision(sized, floor);

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

// Door/portal/landmark tiles that must stay walkable even if a building
// footprint overlaps them.
const FOOTPRINT_SKIP = new Set<string>(["N", "S", "T", "C", "M", "D", "G", "H", "Y", "j", "L", "Z", "A", ">", "<"]);

// Block a footprint under each solid composed building, sized to the sprite
// (native pixel size at the scaled position), so collision matches what the
// player sees instead of the old over-scaled rectangle.
function stampBuildingCollision(rows: string[][], floor: number): void {
  const objects = MAP_OBJECTS[floor];
  if (!objects) return;
  const sx = contentScaleX(floor);
  const sy = contentScaleY(floor);
  for (const obj of objects) {
    if (!BLOCKING_OBJECT_KEYS.has(obj.key)) continue;
    const cx = obj.x * sx;
    const baseY = obj.y * sy; // sprite bottom-centre anchor, scaled position
    const halfW = (obj.w / TILE_SIZE) * 0.42;
    const left = Math.round(cx - halfW);
    const right = Math.round(cx + halfW);
    const bottom = Math.round(baseY - 0.6); // leave the doorstep row walkable
    const top = Math.round(baseY - (obj.h / TILE_SIZE) * 0.8);
    for (let y = top; y <= bottom; y += 1) {
      const row = rows[y];
      if (!row) continue;
      for (let x = left; x <= right; x += 1) {
        const tile = row[x];
        if (tile === undefined || isBlockedTile(tile) || FOOTPRINT_SKIP.has(tile)) continue;
        row[x] = "O";
      }
    }
  }
}

// Layered-cliff helper: any massif tile (`w`) sitting directly above a walkable
// floor (`R`) becomes a 1-tile south-facing cliff face (`X`). Authoring a zone
// is then just: fill `w`, carve the `R` canyon floors, call this. Faces stay one
// tile tall (terminating at the lip), exactly per the map-authoring guide.
function applyCliffEdges(rows: string[][], floorChar = "R", massifChar = "w", faceChar = "X"): void {
  for (let y = 0; y < rows.length - 1; y += 1) {
    const row = rows[y];
    const below = rows[y + 1];
    if (!row || !below) continue;
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === massifChar && below[x] === floorChar) row[x] = faceChar;
    }
  }
}

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
    tile === "X" || tile === "P" || tile === "w" || // badlands cliff wall + pit + massif
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
    tile === "X" || tile === "w" || tile === "U" || tile === "E" // badlands cliff/massif, ruin, jungle wall
  );
}

export function isSafeZone(floor: number, x: number, y: number): boolean {
  if (floor === 0 || floor === 4) return true;
  // Outpost clearings are authored in native coords; scale the rect to match
  // the floor's expanded footprint.
  const inRect = (f: number, x1: number, y1: number, x2: number, y2: number): boolean =>
    floor === f && x >= scaleX(f, x1) && x <= scaleX(f, x2) && y >= scaleY(f, y1) && y <= scaleY(f, y2);
  // The Alchemist's Hut clearing in the Sunken Marsh is a safe rest spot.
  if (inRect(5, 3, 11, 17, 22)) return true;
  // The Frontier Camp clearing in the Searing Badlands (bespoke 90x60 coords).
  if (inRect(6, 52, 12, 81, 22)) return true;
  // The Oasis Trade Outpost in the Sunken Desert (bespoke 90x60 coords).
  if (inRect(7, 18, 46, 47, 55)) return true;
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
  if (floor === 3 && tile === "D") return { floor: 6, x: 3.5, y: 33.5 };
  if (floor === 6 && tile === "D") return { floor: 3, x: 87.5, y: 29.5 };
  if (floor === 6 && tile === "Z") return { floor: 4, x: 6.5, y: 16.5 }; // one-way drop into Northwatch
  if (floor === 1 && tile === "G") return { floor: 7, x: 24.5, y: 3.5 };
  if (floor === 7 && tile === "G") return { floor: 1, x: 25.5, y: 30.5 };
  if (floor === 7 && tile === "H") return { floor: 0, x: 25.5, y: 27.5 }; // one-way passage into Waystone
  if (floor === 7 && tile === "Y") return { floor: 8, x: 25.5, y: 2.5 };
  if (floor === 8 && tile === "Y") return { floor: 7, x: 2.5, y: 32.5 };
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
