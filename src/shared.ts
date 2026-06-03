import type { Range, ZoneId } from "./content-types.ts";
import {
  MAP_OBJECTS,
  BLOCKING_OBJECT_KEYS,
  buildingDoorX,
  buildingFootprintBounds,
  buildingInteriorBounds,
  isCutawayBuilding
} from "./map-objects.ts";
import { NORTHWOOD_STAGE } from "./generated/stages/index.ts";

export {
  ABILITIES,
  COMBAT_ANIMATIONS,
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
export type {
  AbilityConditionalBonus,
  AbilityAnimation,
  AbilityEffect,
  AbilityFloat,
  AbilityGuard,
  AbilityProjectile,
  AbilitySpec,
  AbilityTargeting,
  AbilityVfx,
  CombatAnimationSpec
} from "./content-types.ts";

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
const ENLARGED = { cols: 110, rows: 72 }; // Phase C target (~1.5x); floors migrated one at a time
const FLOOR_DIMS: Record<number, { cols: number; rows: number }> = {
  0: ENLARGED,
  1: ENLARGED,
  2: ENLARGED,
  3: ENLARGED,
  4: ENLARGED,
  5: ENLARGED,
  6: ENLARGED,
  7: ENLARGED,
  8: ENLARGED,
  9: ENLARGED,
  10: EXPANDED // Deepdelve Mine (cave floor reached from the Searing Badlands)
};
// Floors authored directly at the expanded size (their content is already
// placed in expanded coordinates, so it must NOT be scaled again).
const AUTHORED_AT_TARGET = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const SWAMP_WATER_TILES = new Set(["W", "3", "4"]);
const NORTHWOOD_WATER_TILES = new Set(["~", "!", "?", "=", "{", "}", "(", ")", "/", "P", "w", "Q", "V", "U", "x", "0", "J"]);
const SWAMP_LAND_TILES = new Set(["m", "k", "B", "M", "L", "o"]);
const BEACH_LAND_TILES = new Set(["e", "l", ",", ";", "z", "2", "[", "]", "x", "0", "1", "|", "u", "Y", "j"]);
const BEACH_WATER_TILES = new Set(["I", "!", "?", "=", "v", "{", "}", "(", ")"]);

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
  maxFavor: number;
  abilities: string[];
  // Passive chance (0..1) to fully dodge an incoming hit. Class-differentiated;
  // Agility level raises it further (see dodgeChanceFor).
  dodgeChance: number;
}

export interface SkillDef {
  label: string;
  iconUrl: string;
}

export const START: Portal = { floor: 0, x: 55.5, y: 40.5 };

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
  jungle: { id: "jungle", label: "The Untamed Jungle", floor: 9, x1: 0, y1: 0, x2: MAP_COLS - 1, y2: MAP_ROWS - 1 },
  deepMine: { id: "deepMine", label: "The Deepdelve Mine", floor: 10, x1: 0, y1: 0, x2: floorCols(10) - 1, y2: floorRows(10) - 1 }
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
  manaPerMagic: 8,
  maxFavor: 0
};

// Tier-1 classes are stances layered over the blank-slate Adventurer. Core stats
// stay skill-driven (shared base); a class only swaps the bound ability toolkit,
// dodge profile, and move speed. See CLASS_UNLOCKS for how each is gated.
export const CLASSES: Record<string, ClassSpec> = {
  adventurer: { ...CLASS_BASE, label: "Adventurer", abilities: ["sprint", "second_wind"], dodgeChance: 0.05 },
  vanguard: { ...CLASS_BASE, label: "Vanguard", abilities: ["provoke", "iron_clad", "shield_bash"], dodgeChance: 0.05 },
  thief: { ...CLASS_BASE, label: "Thief", speed: 4.65, abilities: ["quick_step", "backstab"], dodgeChance: 0.12 },
  apothecary: { ...CLASS_BASE, label: "Apothecary", abilities: ["healing_poultice", "volatile_flask"], dodgeChance: 0.06 },
  archer: { ...CLASS_BASE, label: "Archer", speed: 4.4, abilities: ["pinning_shot", "fleet_foot"], dodgeChance: 0.08 },
  mage: { ...CLASS_BASE, label: "Mage", abilities: ["flame_burst", "frost_nova", "arcane_bolt"], dodgeChance: 0.05 },
  acolyte: { ...CLASS_BASE, label: "Acolyte", abilities: ["zealots_strike", "cleansing_flash", "conviction"], dodgeChance: 0.05 }
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
  { key: "mage", label: "Mage", npcId: "hermit-academic", npcName: "Magister Vael", town: "Northwatch", requires: { magic: 15, alchemy: 10 } },
  { key: "acolyte", label: "Acolyte", npcId: "acolyte-prior", npcName: "Prior Elian", town: "Waystone", requires: { attack: 10, faith: 10 } }
];

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
  foraging: { label: "Foraging", iconUrl: "/icons/skill-foraging.png" },
  smithing: { label: "Smithing", iconUrl: "/icons/skill-smithing.png" },
  faith: { label: "Faith", iconUrl: "/icons/skill-magic.png" }
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

  if (floor === NORTHWOOD_STAGE.floor) {
    const generated = [...NORTHWOOD_STAGE.rows];
    FLOOR_TILE_CACHE.set(floor, generated);
    return generated;
  }

  // Floor 3 is authored at the expanded size; the rest are authored at the
  // native footprint and upscaled below.
  const authored = AUTHORED_AT_TARGET.has(floor);
  const authorCols = authored ? floorCols(floor) : MAP_COLS;
  const authorRows = authored ? floorRows(floor) : MAP_ROWS;
  const rows = Array.from({ length: authorRows }, () => Array.from({ length: authorCols }, () => "#"));

  if (floor === 0) {
    // Waystone (enlarged 110x72) — the peaceful starting hub. A townfloor plaza at
    // the heart, ringed by a stone apron and clustered houses/well/market, with
    // winding dirt lanes linking them and a willow-shaded river curling down the
    // west bank (fishing spots on its edge). Woodland frames the whole clearing.
    fillRect(rows, 1, 1, 108, 70, "."); // grass meadow base

    // --- River & pond down the west side (blocks movement, not sight). ---
    fillRect(rows, 9, 10, 6, 10, "~");
    fillRect(rows, 11, 19, 6, 12, "~");
    fillRect(rows, 9, 30, 7, 11, "~"); // widens into a fishing pond
    fillRect(rows, 11, 40, 6, 10, "~");
    fillRect(rows, 13, 48, 5, 8, "~");
    // Reedy rock bank where the water meets the bog edge.
    setTile(rows, 7, 14, "r");
    setTile(rows, 7, 36, "r");
    setTile(rows, 16, 26, "r");
    setTile(rows, 17, 46, "r");

    // --- Central plaza (townfloor) on a broad stone apron. ---
    fillRect(rows, 40, 28, 32, 21, "s"); // stone apron
    fillRect(rows, 46, 32, 20, 12, "p"); // townfloor plaza

    // --- Winding dirt lanes (no straight central corridor). ---
    // North lane: from the N gate, bending down to the plaza.
    fillRect(rows, 54, 4, 3, 7, "t");
    fillRect(rows, 54, 11, 11, 3, "t");
    fillRect(rows, 61, 14, 4, 10, "t");
    fillRect(rows, 55, 24, 10, 4, "t");
    // South lane: plaza down to the S gate, curving east.
    fillRect(rows, 54, 49, 3, 7, "d");
    fillRect(rows, 54, 56, 12, 4, "d");
    fillRect(rows, 62, 60, 4, 8, "d");
    // West lane: plaza out to the riverside (market/well district).
    fillRect(rows, 29, 36, 11, 4, "t");
    fillRect(rows, 26, 29, 3, 11, "t");
    fillRect(rows, 20, 29, 6, 3, "t");
    // East lane: plaza out to the eastern houses.
    fillRect(rows, 72, 34, 12, 3, "d");
    fillRect(rows, 82, 37, 4, 10, "d");

    // --- Garden plot fenced off beside the plaza (decoration only). ---
    fillRect(rows, 73, 48, 15, 1, "q");
    fillRect(rows, 73, 56, 15, 2, "q");
    fillRect(rows, 73, 48, 2, 10, "q");
    fillRect(rows, 87, 48, 1, 10, "q");
    fillRect(rows, 78, 56, 4, 2, "d"); // garden gate gap on the path side

    // Portals at the north and south edges.
    setTile(rows, 55, 2, "N"); // north -> Northwood (floor 3)
    setTile(rows, 64, 70, "S"); // south -> Southgate Cemetery (floor 1)
    // Approach stubs so the gates open onto walkable lane, not raw grass/edge.
    setTile(rows, 55, 4, "t");
    setTile(rows, 64, 68, "d");

    // Woodland framing the clearing (kept clear of the lanes/plaza by seed).
    scatter(rows, ".", "f", 132, 15);
  }

  if (floor === 1) {
    // Southgate Cemetery (enlarged 110x72) — a soft, melancholy graveyard of grave
    // dirt (g) carved into fenced plots (q) by winding grave paths (c/b). The
    // Crypt building broods at the centre with its entrance (C) on a cleared
    // apron just below it; a mausoleum sits in the east. Headstones (h) and
    // obelisks cluster against the fences. Skeletons/ghouls roam the dirt.
    fillRect(rows, 1, 1, 108, 70, "g"); // grave-dirt base

    // --- Fenced grave plots (q blocks; leave gateway gaps onto the paths). ---
    // NW plot
    fillRect(rows, 12, 11, 32, 1, "q");
    fillRect(rows, 12, 31, 32, 1, "q");
    fillRect(rows, 12, 11, 1, 21, "q");
    fillRect(rows, 43, 11, 1, 21, "q");
    fillRect(rows, 26, 31, 3, 1, "g"); // south gate
    fillRect(rows, 43, 19, 1, 4, "g"); // east gate onto the spine
    // NE plot (around the mausoleum)
    fillRect(rows, 66, 11, 32, 1, "q");
    fillRect(rows, 66, 32, 32, 2, "q");
    fillRect(rows, 66, 11, 1, 23, "q");
    fillRect(rows, 97, 11, 1, 23, "q");
    fillRect(rows, 66, 19, 1, 4, "g"); // west gate onto the spine
    fillRect(rows, 78, 32, 4, 2, "g"); // south gate
    // SW plot
    fillRect(rows, 10, 43, 29, 1, "q");
    fillRect(rows, 10, 62, 29, 2, "q");
    fillRect(rows, 10, 43, 1, 21, "q");
    fillRect(rows, 38, 43, 1, 21, "q");
    fillRect(rows, 23, 43, 4, 1, "g"); // north gate
    fillRect(rows, 38, 52, 1, 3, "g"); // east gate
    // SE plot
    fillRect(rows, 68, 46, 32, 1, "q");
    fillRect(rows, 68, 65, 32, 1, "q");
    fillRect(rows, 68, 46, 2, 20, "q");
    fillRect(rows, 99, 46, 1, 20, "q");
    fillRect(rows, 68, 54, 2, 4, "g"); // west gate
    fillRect(rows, 82, 46, 4, 1, "g"); // north gate

    // --- Winding grave paths (the spine: T north -> crypt -> G south). ---
    fillRect(rows, 54, 1, 3, 9, "c"); // from the north gate
    fillRect(rows, 48, 8, 9, 4, "c"); // bend west
    fillRect(rows, 48, 11, 3, 12, "c"); // drop south
    fillRect(rows, 48, 19, 22, 4, "c"); // cross east past the crypt's west flank
    fillRect(rows, 60, 22, 4, 6, "b"); // dip toward the crypt apron
    fillRect(rows, 50, 35, 15, 3, "c"); // crypt-entrance apron (C sits here, just below the footprint)
    fillRect(rows, 54, 37, 3, 12, "c"); // drop south from the apron
    fillRect(rows, 44, 47, 17, 3, "c"); // bend west
    fillRect(rows, 44, 49, 4, 15, "c"); // continue south
    fillRect(rows, 44, 60, 15, 4, "b"); // bend back east
    fillRect(rows, 55, 60, 4, 11, "c"); // down to the south gate (G)

    // A connecting walk linking the two western plot gates to the spine.
    fillRect(rows, 27, 34, 4, 10, "b");
    fillRect(rows, 27, 41, 22, 3, "b");

    // Portals.
    setTile(rows, 55, 1, "T"); // north edge -> Waystone (floor 0)
    setTile(rows, 56, 36, "C"); // crypt entrance -> the Ashen Crypt (floor 2)
    setTile(rows, 56, 70, "G"); // south edge -> the Sunken Desert (floor 7)

    // Headstones (decoration) and mossy rocks, scattered across the dirt.
    scatter(rows, "g", "h", 220, 21);
    scatter(rows, "g", "r", 32, 22);
  }

  if (floor === 2) {
    // The Ashen Crypt (enlarged 110x72) — a claustrophobic enclosed dungeon. Solid
    // rock (#, blocks move + sight) fills the bulk; tight crypt-stone corridors
    // (c) and chamber floors (b/d) are carved out as a maze of linked chambers.
    // The Ashen Warden boss waits in the far east chamber. T returns to the
    // cemetery from the entry chamber.
    fillRect(rows, 0, 0, 110, 72, "#"); // solid rock bulk

    // --- Entry chamber (NW) — T arrives here. ---
    fillRect(rows, 5, 5, 17, 13, "d");
    setTile(rows, 7, 7, "T"); // -> back to the cemetery (floor 1)

    // --- Corridor south out of the entry chamber, then east. ---
    fillRect(rows, 11, 18, 4, 14, "c"); // drop south
    fillRect(rows, 11, 29, 24, 3, "c"); // run east

    // --- West-central chamber. ---
    fillRect(rows, 7, 35, 17, 14, "b");
    fillRect(rows, 13, 32, 4, 4, "c"); // link up to the east-running corridor
    fillRect(rows, 12, 49, 4, 12, "c"); // corridor south
    fillRect(rows, 12, 59, 27, 3, "c"); // run east along the south

    // --- Corridor north-east from the east-running corridor into mid chamber. ---
    fillRect(rows, 32, 22, 3, 10, "c"); // climb north
    fillRect(rows, 29, 17, 20, 7, "b"); // mid-north chamber
    fillRect(rows, 45, 23, 4, 12, "c"); // drop south out of the mid chamber
    fillRect(rows, 45, 34, 20, 3, "c"); // run east

    // --- Central junction chamber. ---
    fillRect(rows, 59, 31, 14, 15, "d");
    fillRect(rows, 65, 46, 3, 14, "c"); // corridor south
    fillRect(rows, 37, 59, 31, 3, "c"); // long south corridor links to the SW corridor
    fillRect(rows, 71, 36, 15, 4, "c"); // corridor east toward the boss

    // --- Boss chamber (far east) — the Ashen Warden. ---
    fillRect(rows, 83, 26, 22, 20, "b");
    fillRect(rows, 86, 46, 3, 10, "c"); // a southern back-passage into the chamber
    fillRect(rows, 68, 54, 20, 4, "c"); // link the back-passage to the south corridor

    scatter(rows, "c", "r", 44, 4);
    scatter(rows, "b", "r", 21, 5);
    scatter(rows, "d", "r", 12, 6);
  }

  if (floor === 3) {
    // Northwood, enlarged ~1.5x to 110x72 (Phase C). One open canopy of walkable
    // forest floor threaded by a wide N-S spine and an E-W road that cross at a
    // central clearing, so all four edge portals stay reachable. The wood reads
    // as a danger gradient: gentle critters near the southern Waystone arrival,
    // tougher greenskins and elites deeper north and out toward the far gates.
    fillRect(rows, 1, 1, 108, 70, "F");
    fillRect(rows, 54, 2, 3, 68, "t"); // north-south spine
    fillRect(rows, 2, 35, 106, 2, "t"); // east-west road

    // Glades: open clearings that break up the trees and host gathering.
    fillRect(rows, 10, 8, 10, 8, "d"); // NW glade
    fillRect(rows, 86, 11, 11, 7, "d"); // NE glade
    fillRect(rows, 12, 54, 11, 7, "d"); // SW glade
    fillRect(rows, 83, 53, 12, 8, "d"); // SE glade
    fillRect(rows, 37, 16, 8, 6, "d"); // north meadow
    fillRect(rows, 66, 44, 9, 6, "d"); // south meadow
    fillRect(rows, 49, 31, 13, 11, "d"); // central crossroads clearing

    // Woodland ponds (impassable water; anglers fish from the bank).
    fillRect(rows, 24, 24, 8, 5, "~");
    fillRect(rows, 78, 24, 8, 5, "~");
    fillRect(rows, 46, 58, 9, 4, "~");

    setTile(rows, 55, 70, "S"); // south edge -> Waystone (floor 0)
    setTile(rows, 55, 1, "N"); // north edge -> Northwatch (floor 4)
    setTile(rows, 1, 36, "M"); // west edge -> the Sunken Marsh (floor 5)
    setTile(rows, 108, 35, "D"); // east edge -> the Searing Badlands (floor 6)

    scatter(rows, "F", "f", 790, 31); // dense canopy
    scatter(rows, "F", "r", 176, 32); // mossy boulders

    // Three ore outcrops, spread across the wood (mining moved out of town).
    // Each sits on rock with a cleared standing spot carved beside it (set
    // after scatter so a stray tree never blocks the approach).
    for (const [rx, ry] of [[10, 59], [98, 14], [95, 56]] as Array<[number, number]>) {
      setTile(rows, rx, ry, "r");
      setTile(rows, rx + 1, ry, "d");
    }

    // A surface cave mouth in the north wood — a rock alcove sheltering an iron
    // vein and a coal seam, open to the south so players duck in off the trail.
    // (A 'cave pocket': no new floor, just a mineable recess on the forest map.)
    fillRect(rows, 59, 7, 11, 1, "r"); // rock back-wall
    fillRect(rows, 59, 7, 1, 6, "r"); // west wall
    fillRect(rows, 68, 7, 2, 6, "r"); // east wall
    fillRect(rows, 60, 8, 8, 5, "d"); // alcove floor, open south into the wood
    setTile(rows, 61, 7, "r"); // coal seam (mine-3-61-7)
    setTile(rows, 66, 7, "r"); // iron vein (mine-3-66-7)
  }

  if (floor === 6) {
    // The Searing Badlands (enlarged 110x72) — a deep ravine carved through a dark
    // rock massif. Pattern: fill massif (w), carve the winding walkable canyon
    // floors (R), then applyCliffEdges() drops a 1-tile south-facing cliff face
    // (X) wherever the massif overhangs a floor, so walls read as layered cliffs
    // instead of a flat-stacked block. Ore clusters against the walls.
    fillRect(rows, 0, 0, 110, 72, "w");
    // Main canyon — an S-curve west mouth -> mid -> Frontier Camp (east).
    fillRect(rows, 1, 36, 20, 8, "R"); // west mouth (forest portal arrives here)
    fillRect(rows, 15, 19, 8, 25, "R"); // climb north
    fillRect(rows, 15, 19, 29, 9, "R"); // upper run east
    fillRect(rows, 37, 19, 8, 27, "R"); // drop south
    fillRect(rows, 37, 37, 34, 9, "R"); // mid lower run east
    fillRect(rows, 64, 17, 8, 29, "R"); // climb to the camp
    fillRect(rows, 64, 14, 36, 14, "R"); // Frontier Camp clearing
    // North prospect shelf: a wider optional mining route above the upper run.
    fillRect(rows, 24, 8, 24, 7, "R");
    fillRect(rows, 31, 15, 6, 5, "R");
    // Dead-end copper canyon off the west mouth.
    fillRect(rows, 5, 49, 15, 6, "R");
    fillRect(rows, 10, 43, 5, 7, "R"); // connector
    // Iron pocket off the mid lower run.
    fillRect(rows, 49, 53, 13, 6, "R");
    fillRect(rows, 54, 44, 5, 10, "R"); // connector
    // South prospect shelf: a broad ore pocket off the lower run.
    fillRect(rows, 69, 49, 27, 9, "R");
    fillRect(rows, 78, 44, 7, 6, "R");
    // High terrace (ranged vantage) over a pit gap, reached from the camp.
    fillRect(rows, 78, 31, 15, 7, "R"); // terrace floor
    fillRect(rows, 86, 26, 3, 6, "R"); // camp -> terrace connector
    fillRect(rows, 87, 37, 2, 1, "A"); // ramp lip
    fillRect(rows, 81, 38, 9, 3, "P"); // pit gap the terrace overlooks (LOS-open)
    // Pit hazards in the canyon floors (block movement, not sight).
    setTile(rows, 31, 19, "P");
    setTile(rows, 40, 44, "P");
    // Floor variants from the badlands sheet: cracked flats and rocky gravel
    // break up the canyon without changing movement semantics.
    for (const [x, y, w, h, tile] of [
      [3, 31, 8, 2, "6"], [13, 18, 4, 12, "7"], [20, 17, 8, 3, "6"],
      [28, 9, 8, 3, "6"], [39, 10, 7, 3, "7"], [31, 32, 12, 3, "7"],
      [48, 32, 8, 4, "6"], [54, 14, 5, 8, "7"], [61, 13, 15, 4, "6"],
      [65, 18, 12, 3, "7"], [42, 45, 7, 3, "6"], [72, 50, 9, 3, "7"],
      [84, 52, 8, 3, "6"], [6, 42, 8, 3, "7"]
    ] as Array<[number, number, number, number, string]>)
      fillRect(rows, x, y, w, h, tile);
    setTile(rows, 29, 22, "R"); // keep the scripted burrower ambush tile plain floor
    setTile(rows, 43, 40, "R"); // keep the second burrower anchor plain floor too
    // Portals.
    setTile(rows, 1, 40, "D"); // west edge -> the forest
    setTile(rows, 95, 16, "Z"); // cliff ledge -> western Northwatch (one-way)
    setTile(rows, 11, 53, ">"); // copper dead-end shaft -> the Deepdelve Mine (floor 10)
    // Layered cliff faces where the massif overhangs a canyon floor.
    applyCliffEdges(rows);
  }

  if (floor === 7) {
    // The Sunken Desert (enlarged 110x72) — open sweeping dunes of sand (a) split by
    // sandstone canyons. Mirrors the badlands: fill the canyon bulk with massif
    // (w), carve the winding sand routes, then applyCliffEdges("a","w","X") drops a
    // 1-tile sandstone cliff face wherever the massif overhangs open sand. Ruins
    // (U) give cover, quicksand (Q) and an oasis (V) gate the routes; the Oasis
    // Trade Outpost (safe) nestles against the south wall.
    fillRect(rows, 0, 0, 110, 72, "a");
    fillRect(rows, 7, 5, 32, 14, "w");
    fillRect(rows, 49, 4, 37, 15, "w");
    fillRect(rows, 37, 26, 24, 12, "w");
    fillRect(rows, 64, 41, 36, 19, "w");
    fillRect(rows, 5, 46, 22, 21, "w");
    fillRect(rows, 27, 4, 6, 19, "a"); // north entry shaft (G at its top)
    fillRect(rows, 27, 19, 27, 6, "a");
    fillRect(rows, 15, 24, 22, 17, "a");
    fillRect(rows, 61, 22, 17, 19, "a");
    fillRect(rows, 32, 38, 32, 8, "a");
    fillRect(rows, 1, 36, 15, 6, "a"); // beach trail (west)
    fillRect(rows, 27, 46, 7, 14, "a"); // route to the outpost
    fillRect(rows, 22, 55, 37, 12, "a"); // outpost clearing
    fillRect(rows, 37, 56, 7, 5, "V"); // oasis pool
    setTile(rows, 31, 59, "H"); // one-way passage to Waystone
    setTile(rows, 29, 2, "G"); // north gate to/from the cemetery
    setTile(rows, 1, 38, "Y"); // west trail to the Sunken Beach
    fillRect(rows, 20, 26, 4, 4, "V");
    fillRect(rows, 68, 24, 5, 4, "V");
    fillRect(rows, 46, 20, 4, 3, "Q");
    fillRect(rows, 29, 29, 3, 3, "Q");
    fillRect(rows, 49, 41, 4, 2, "Q");
    fillRect(rows, 29, 50, 3, 4, "Q");
    for (const [rx, ry] of [[13, 19], [29, 19], [44, 16], [49, 21], [31, 33], [49, 33], [20, 34], [27, 45], [40, 45]] as Array<[number, number]>)
      setTile(rows, rx, ry, "U");
    applyCliffEdges(rows, "a", "w", "X");
  }

  if (floor === 8) {
    // The Sunken Beach (enlarged 110x72) — an island-stage layout, not a sand
    // rectangle: ocean border, foam shore, wet flats, tiered cliffs, stair
    // connectors and POI pockets echoing the beach mockup's arrangement.
    fillRect(rows, 0, 0, 110, 72, "I");

    // Main island mass and sandy spurs. Row spans keep the coastline authored
    // as a sloped silhouette instead of stacked rectangles.
    drawBeachIsland(rows);

    // Bite coves back out of the island to avoid straight rectangular beaches.
    fillRect(rows, 6, 7, 9, 5, "I");
    fillRect(rows, 10, 12, 5, 6, "I");
    fillRect(rows, 34, 2, 17, 6, "I");
    fillRect(rows, 83, 2, 17, 9, "I");
    fillRect(rows, 95, 11, 9, 11, "I");
    fillRect(rows, 6, 43, 12, 6, "I");
    fillRect(rows, 13, 49, 15, 5, "I");
    fillRect(rows, 55, 48, 20, 10, "I");
    fillRect(rows, 71, 53, 11, 9, "I");
    fillRect(rows, 94, 56, 10, 9, "I");
    // Keep the central route dry like the mockup; water belongs around the
    // coast, with small coves cut into the island edges rather than a square
    // lagoon stamped through the middle of the play space.
    fillRect(rows, 17, 6, 5, 5, "l"); // Coastal Harvest shelf used by foraging tests

    // Walkable sand detail: shell flats, trampled paths and wet tide line.
    fillRect(rows, 28, 2, 6, 12, "z"); // desert gate trail
    fillRect(rows, 27, 13, 37, 5, "z");
    fillRect(rows, 60, 14, 23, 6, "z"); // jungle gate trail
    fillRect(rows, 34, 30, 25, 5, "z"); // hut lane
    fillRect(rows, 54, 35, 32, 3, "z");
    for (const [x, y, w, h] of [[14, 14, 8, 4], [18, 30, 10, 4], [28, 38, 12, 4], [58, 36, 10, 4], [70, 39, 7, 5]] as Array<[number, number, number, number]>)
      fillRect(rows, x, y, w, h, "l");
    for (const [x, y] of [[18, 12], [22, 14], [39, 18], [48, 16], [58, 12], [72, 18], [28, 36], [53, 42], [68, 44]] as Array<[number, number]>)
      setTile(rows, x, y, ";");

    // Raised ledges: walkable tops, connected rock-wall faces under the lip,
    // and composed stairs that cut through the face as left/middle/right runs.
    drawBeachLedge(rows, 18, 16, 14, 4, "l", [{ x: 20, w: 4 }]);
    drawBeachLedge(rows, 51, 18, 16, 4, "l", [{ x: 56, w: 4 }]);
    drawBeachLedge(rows, 27, 31, 14, 3, "l", [{ x: 34, w: 4 }]);

    // Rocks/ruins as hard cover and visual anchors around coves/terraces.
    for (const [x, y] of [[13, 11], [16, 34], [25, 16], [30, 23], [49, 17], [66, 27], [72, 34], [33, 43], [53, 36], [61, 13]] as Array<[number, number]>)
      setTile(rows, x, y, "u");

    applyBeachShoreEdges(rows);
    setTile(rows, 31, 1, "Y"); // north trail to/from the desert
    setTile(rows, 61, 17, "j"); // east trail to the Untamed Jungle
  }

  if (floor === 9) {
    // The Untamed Jungle (enlarged 110x72) — a claustrophobic maze of dense canopy
    // walls (E) threaded by tight 3-wide jungle-floor runs (y). A winding river (i)
    // splits the map, forded only at 1-tile boulder chokepoints where venomous
    // stalkers ambush. The sealed Jungle Vault (K) sits in a dead-end clearing.
    fillRect(rows, 0, 0, 110, 72, "E");
    fillRect(rows, 1, 17, 14, 5, "y"); // entry run
    setTile(rows, 1, 18, "j"); // west portal to/from the Sunken Beach (after the fill so it survives)
    fillRect(rows, 10, 7, 5, 15, "y");
    fillRect(rows, 10, 7, 27, 5, "y");
    fillRect(rows, 24, 7, 5, 19, "y");
    fillRect(rows, 15, 22, 14, 4, "y");
    fillRect(rows, 15, 22, 5, 21, "y");
    fillRect(rows, 10, 38, 22, 8, "y"); // vault clearing
    fillRect(rows, 24, 26, 5, 20, "y");
    fillRect(rows, 37, 2, 5, 36, "i"); // river trunk
    fillRect(rows, 37, 34, 31, 4, "i");
    fillRect(rows, 64, 34, 4, 31, "i");
    fillRect(rows, 37, 8, 5, 2, "y"); // upper ford
    fillRect(rows, 37, 36, 5, 1, "y"); // lower ford
    fillRect(rows, 42, 7, 22, 5, "y");
    fillRect(rows, 59, 7, 5, 23, "y");
    fillRect(rows, 44, 25, 20, 5, "y");
    fillRect(rows, 44, 38, 24, 8, "y");
    fillRect(rows, 71, 38, 6, 15, "y");
    fillRect(rows, 80, 38, 17, 14, "y"); // Jungle Vault arena, reached by the sealed K gate
    setTile(rows, 20, 42, "K"); // sealed Jungle Vault (does not transport)
  }

  if (floor === 5) {
    // The Sunken Marsh (enlarged 110x72) — a drowned basin of deep swamp water (W,
    // blocks movement not sight) threaded by winding 1-2 tile marsh (m) and
    // swamp-dirt (k) causeways linked by wooden bridges (B). The Alchemist's Hut
    // sits on solid ground in the NW; Mire-Spitter turrets are anchored on the
    // open water and fire across the causeways. Boulders (o) give LOS cover.
    fillRect(rows, 0, 0, 110, 72, "W");
    fillRect(rows, 54, 22, 16, 13, "m"); // east entry basin (forest portal arrives)
    fillRect(rows, 59, 17, 7, 5, "m");
    setTile(rows, 68, 28, "M"); // east-edge portal back to the forest
    fillRect(rows, 68, 12, 9, 7, "m"); // northern reed loop
    fillRect(rows, 72, 18, 5, 17, "m");
    fillRect(rows, 76, 31, 12, 6, "m");
    fillRect(rows, 61, 34, 11, 7, "m"); // SE marsh shelf
    fillRect(rows, 66, 30, 5, 5, "m");
    fillRect(rows, 46, 24, 9, 5, "m"); // run west off the entry
    fillRect(rows, 42, 17, 6, 12, "m"); // climb north
    fillRect(rows, 38, 17, 4, 3, "B"); // bridge 1 (chokepoint)
    fillRect(rows, 29, 16, 10, 6, "m");
    fillRect(rows, 29, 22, 5, 12, "m"); // drop south
    fillRect(rows, 26, 30, 3, 4, "B"); // bridge 2 (chokepoint)
    fillRect(rows, 16, 29, 11, 7, "m"); // mid-west shelf
    fillRect(rows, 16, 19, 6, 11, "m"); // climb to the hut
    fillRect(rows, 16, 19, 11, 5, "m");
    fillRect(rows, 5, 14, 15, 12, "k"); // Alchemist's Hut clearing (safe)
    fillRect(rows, 15, 17, 3, 7, "m");
    fillRect(rows, 25, 9, 22, 7, "k"); // glowcap shelf above the hut route
    fillRect(rows, 30, 15, 6, 3, "B");
    fillRect(rows, 20, 36, 3, 4, "B"); // bridge 3 into the lotus pocket
    fillRect(rows, 11, 40, 16, 8, "m"); // southern Mire-Lotus pocket
    fillRect(rows, 22, 43, 10, 5, "m");
    fillRect(rows, 36, 48, 30, 10, "m"); // southern mushroom bog
    fillRect(rows, 31, 45, 7, 5, "B");
    setTile(rows, 50, 23, "o");
    setTile(rows, 46, 26, "o");
    setTile(rows, 33, 17, "o");
    setTile(rows, 31, 31, "o");
    setTile(rows, 22, 32, "o");
    setTile(rows, 13, 42, "o");
    setTile(rows, 24, 46, "o");
    setTile(rows, 64, 36, "o");
    setTile(rows, 43, 52, "o");
    setTile(rows, 59, 55, "o");
    setTile(rows, 74, 14, "o");
    setTile(rows, 83, 34, "o");
    setTile(rows, 7, 16, "L"); // one-way cliff ledge -> northern Waystone
    scatter(rows, "W", "3", 264, 55); // open-water interior variation
    applySwampWaterEdges(rows);
  }

  if (floor === 4) {
    // Northwatch (enlarged 110x72) — a rugged frontier garrison ringed by a timber
    // palisade. A stone parade ground musters at its heart, barracks/quarters and
    // a quartermaster's market cluster inside the walls, and gates pierce the
    // palisade to the south (forest road) and west (the badlands cliff drop).
    fillRect(rows, 1, 1, 108, 70, "."); // open ground base
    scatter(rows, ".", "r", 103, 42); // scattered rubble/boulders on the frontier

    // --- Timber palisade enclosing the garrison core. ---
    fillRect(rows, 24, 14, 63, 2, "q"); // north wall
    fillRect(rows, 24, 56, 63, 2, "q"); // south wall
    fillRect(rows, 24, 14, 2, 44, "q"); // west wall
    fillRect(rows, 86, 14, 1, 44, "q"); // east wall
    // Gate gaps (kept walkable by laying path over the wall line).
    fillRect(rows, 54, 56, 5, 2, "d"); // south gate
    fillRect(rows, 24, 35, 2, 5, "d"); // west gate (badlands drop arrives here)

    // --- Stone parade ground with a townfloor muster square. ---
    fillRect(rows, 39, 24, 34, 24, "s"); // parade ground
    fillRect(rows, 49, 30, 15, 12, "p"); // muster square

    // --- Roads (winding, hugging the buildings). ---
    // South road: muster square down to the south gate and out to the forest.
    fillRect(rows, 54, 42, 3, 16, "d");
    fillRect(rows, 54, 58, 3, 12, "d");
    // West road: muster square out to the west gate (the drop-in lands here).
    fillRect(rows, 26, 35, 14, 3, "d");
    // North spur to the barracks.
    fillRect(rows, 55, 16, 4, 9, "d");
    // East spur to the quartermaster's market.
    fillRect(rows, 72, 34, 11, 3, "d");

    // South-edge portal to the forest, with an approach stub past the gate.
    setTile(rows, 55, 70, "S"); // south -> Northwood (floor 3)
    setTile(rows, 55, 68, "d");

    scatter(rows, ".", "f", 117, 41); // woodland framing the clearing
  }

  if (floor === 10) {
    // The Deepdelve Mine (bespoke 90x60) — an enclosed cave reached from the
    // Searing Badlands' copper dead-end (>). Solid rock (#) fills the bulk; a
    // winding crypt-stone spine (c) links six worked-out chambers (b) that
    // descend in ore tier: a SAFE entry chamber (d, copper/tin) -> iron -> coal
    // -> silver -> gold -> a deepest mithril/adamant pocket. Veins sit on rock
    // outcrops (r) with a cleared standing tile beside them; danger rises with
    // depth. < returns to the badlands.
    fillRect(rows, 0, 0, 90, 60, "#"); // solid rock bulk

    // --- Winding main spine (c), entry (NW) -> deepest (S-centre). ---
    fillRect(rows, 9, 14, 3, 16, "c"); // drop south from the entry
    fillRect(rows, 9, 27, 20, 3, "c"); // run east
    fillRect(rows, 26, 14, 3, 16, "c"); // climb north
    fillRect(rows, 26, 14, 22, 3, "c"); // run east along the top
    fillRect(rows, 45, 14, 3, 20, "c"); // drop south
    fillRect(rows, 45, 31, 22, 3, "c"); // run east
    fillRect(rows, 64, 31, 3, 18, "c"); // drop south toward the deep
    fillRect(rows, 48, 46, 19, 3, "c"); // run west into the deep pocket

    // --- Entry chamber (safe), copper + tin starter veins. ---
    fillRect(rows, 4, 5, 16, 11, "d"); // x4..19, y5..15
    setTile(rows, 6, 8, "<"); // -> back up to the Searing Badlands (floor 6)

    // --- Worked chambers hung off the spine, each overlapping it. ---
    fillRect(rows, 30, 5, 14, 11, "b"); // B: iron (top, off the east-top run)
    fillRect(rows, 12, 29, 14, 12, "b"); // C: coal (SW, off the lower run)
    fillRect(rows, 47, 18, 16, 12, "b"); // D: silver (mid-east, off the south drop)
    fillRect(rows, 66, 31, 18, 14, "b"); // E: gold (deep east)
    fillRect(rows, 40, 48, 16, 11, "b"); // F: mithril/adamant (deepest pocket)

    scatter(rows, "c", "r", 14, 71); // loose rubble along the corridors
    scatter(rows, "b", "r", 10, 72); // and in the chambers

    // --- Ore veins: outcrop tile (r) with a cleared approach floor beside it.
    // Placed AFTER scatter so stray rubble never seals an approach. Coordinates
    // mirror content/mining-nodes.yaml floor-10 entries (at -> approach).
    for (const [ax, ay, px, py, floorCh] of [
      [6, 6, 6, 7, "d"], [17, 6, 17, 7, "d"], // entry: copper, tin
      [32, 6, 32, 7, "b"], [41, 14, 40, 14, "b"], // B: iron
      [14, 31, 14, 32, "b"], [23, 39, 23, 38, "b"], // C: coal
      [50, 19, 50, 20, "b"], [60, 28, 60, 27, "b"], // D: silver
      [70, 32, 70, 33, "b"], [81, 43, 81, 42, "b"], // E: gold
      [42, 50, 42, 51, "b"], [53, 57, 53, 56, "b"], // F: mithril
      [47, 57, 47, 56, "b"], [44, 49, 44, 50, "b"] // F: adamant
    ] as Array<[number, number, number, number, string]>) {
      setTile(rows, ax, ay, "r"); // the vein outcrop (blocker)
      setTile(rows, px, py, floorCh); // its standing tile, guaranteed walkable
    }
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
    const placed = { ...obj, x: obj.x * sx, y: obj.y * sy };
    const footprint = buildingFootprintBounds(placed);
    const interior = buildingInteriorBounds(placed);
    const doorX = buildingDoorX(placed);
    for (let y = footprint.top; y <= footprint.bottom; y += 1) {
      const row = rows[y];
      if (!row) continue;
      for (let x = footprint.left; x <= footprint.right; x += 1) {
        const tile = row[x];
        if (tile === undefined || FOOTPRINT_SKIP.has(tile)) continue;
        if (isCutawayBuilding(obj)) {
          const insideRoom = x >= interior.left && x <= interior.right && y >= interior.top && y <= interior.bottom;
          const doorway = x === doorX && y === footprint.bottom;
          if (insideRoom || doorway) {
            if (!isBlockedTile(tile)) row[x] = "n";
            continue;
          }
          const cutawayEdge = x >= interior.left - 1 && x <= interior.right + 1 && y >= interior.top - 1 && y <= interior.bottom + 1;
          if (!isBlockedTile(tile)) row[x] = cutawayEdge ? "*" : "O";
          continue;
        }
        if (!isBlockedTile(tile)) row[x] = "O";
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

function applyBeachShoreEdges(rows: string[][]): void {
  const wetSand: Array<[number, number]> = [];
  const shore: Array<[number, number, string]> = [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      if (BEACH_LAND_TILES.has(tile ?? "")) {
        if (
          BEACH_WATER_TILES.has(rows[y - 1]?.[x] ?? "") ||
          BEACH_WATER_TILES.has(rows[y + 1]?.[x] ?? "") ||
          BEACH_WATER_TILES.has(row[x - 1] ?? "") ||
          BEACH_WATER_TILES.has(row[x + 1] ?? "")
        ) {
          wetSand.push([x, y]);
        }
        continue;
      }
      if (!BEACH_WATER_TILES.has(tile ?? "")) continue;
      const n = BEACH_LAND_TILES.has(rows[y - 1]?.[x] ?? "");
      const s = BEACH_LAND_TILES.has(rows[y + 1]?.[x] ?? "");
      const w = BEACH_LAND_TILES.has(row[x - 1] ?? "");
      const e = BEACH_LAND_TILES.has(row[x + 1] ?? "");
      if (!n && !s && !w && !e) continue;
      if (tile === "=") continue;
      const shoreTile = n && w ? "{" : n && e ? "}" : s && w ? "(" : s && e ? ")" : "v";
      shore.push([x, y, shoreTile]);
    }
  }
  wetSand.forEach(([x, y]) => {
    const tile = rows[y]?.[x];
    if (tile === "e" || tile === "l" || tile === ";") setTile(rows, x, y, ",");
  });
  shore.forEach(([x, y, tile]) => setTile(rows, x, y, tile));
  smoothBeachShoreCornerClusters(rows);
  blendBeachShallowWater(rows);
  varyBeachOpenWater(rows);
}

function drawBeachIsland(rows: string[][]): void {
  const spans: Array<[number, number, number]> = [
    [2, 23, 27], [2, 42, 63],
    [3, 22, 31], [3, 37, 66],
    [4, 18, 34], [4, 36, 68],
    [5, 14, 70],
    [6, 13, 72],
    [7, 12, 74],
    [8, 12, 76],
    [9, 13, 78],
    [10, 12, 80],
    [11, 10, 81],
    [12, 9, 82],
    [13, 9, 82],
    [14, 9, 82],
    [15, 9, 82],
    [16, 8, 82],
    [17, 8, 82],
    [18, 7, 82],
    [19, 7, 82],
    [20, 7, 83],
    [21, 6, 83],
    [22, 5, 83],
    [23, 4, 83],
    [24, 4, 83],
    [25, 4, 83],
    [26, 4, 83],
    [27, 4, 83],
    [28, 4, 83],
    [29, 4, 83],
    [30, 4, 83],
    [31, 4, 83],
    [32, 5, 83],
    [33, 5, 83],
    [34, 6, 83],
    [35, 8, 82],
    [36, 12, 82],
    [37, 16, 81],
    [38, 18, 80],
    [39, 20, 80],
    [40, 22, 80],
    [41, 23, 80],
    [42, 24, 80],
    [43, 24, 80],
    [44, 24, 80],
    [45, 24, 80],
    [46, 24, 80],
    [47, 26, 78],
    [48, 29, 76],
    [49, 32, 72],
    [50, 35, 68],
    [51, 39, 61]
  ];
  for (const [y, x1, x2] of spans) fillRect(rows, x1, y, x2 - x1 + 1, 1, "e");
}

function drawBeachLedge(rows: string[][], x: number, y: number, w: number, topH: number, topTile: string, stairs: Array<{ x: number; w: number }>): void {
  fillRect(rows, x, y, w, topH, topTile);
  const faceY = y + topH;
  setTile(rows, x - 1, faceY, "0");
  fillRect(rows, x, faceY, w, 1, "x");
  setTile(rows, x + w, faceY, "1");
  fillRect(rows, x, faceY + 1, w, 1, "|");
  for (const stair of stairs) {
    drawBeachStairs(rows, stair.x, faceY, stair.w);
    fillRect(rows, stair.x, y + topH - 1, stair.w, 1, "z");
  }
}

function drawBeachStairs(rows: string[][], x: number, y: number, w: number): void {
  if (w < 2) return;
  setTile(rows, x, y, "[");
  for (let xx = x + 1; xx < x + w - 1; xx += 1) setTile(rows, xx, y, "2");
  setTile(rows, x + w - 1, y, "]");
}

function smoothBeachShoreCornerClusters(rows: string[][]): void {
  const corners = new Set(["{", "}", "(", ")"]);
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x += 1) {
      if (!corners.has(row[x] ?? "")) continue;
      if (corners.has(row[x - 1] ?? "") || corners.has(row[x + 1] ?? "") || corners.has(rows[y - 1]?.[x] ?? "") || corners.has(rows[y + 1]?.[x] ?? "")) {
        row[x] = "v";
      }
    }
  }
}

function blendBeachShallowWater(rows: string[][]): void {
  const shore = new Set(["v", "{", "}", "(", ")"]);
  for (let y = 1; y < rows.length - 1; y += 1) {
    const row = rows[y];
    if (!row) continue;
    for (let x = 1; x < row.length - 1; x += 1) {
      if (row[x] !== "I") continue;
      const nearFoam =
        shore.has(rows[y - 1]?.[x] ?? "") ||
        shore.has(rows[y + 1]?.[x] ?? "") ||
        shore.has(row[x - 1] ?? "") ||
        shore.has(row[x + 1] ?? "");
      if (nearFoam) row[x] = "=";
    }
  }
}

function varyBeachOpenWater(rows: string[][]): void {
  const shore = new Set(["v", "{", "}", "(", ")", "="]);
  for (let y = 1; y < rows.length - 1; y += 1) {
    const row = rows[y];
    if (!row) continue;
    for (let x = 1; x < row.length - 1; x += 1) {
      if (row[x] !== "I") continue;
      const nearShore =
        shore.has(rows[y - 1]?.[x] ?? "") ||
        shore.has(rows[y + 1]?.[x] ?? "") ||
        shore.has(row[x - 1] ?? "") ||
        shore.has(row[x + 1] ?? "");
      if (nearShore) continue;
      if ((x * 17 + y * 31) % 97 === 0) row[x] = "?";
      else if ((x * 11 + y * 19) % 23 === 0) row[x] = "!";
    }
  }
}

function applySwampWaterEdges(rows: string[][]): void {
  const edge: Array<[number, number]> = [];
  for (let y = 1; y < rows.length - 1; y += 1) {
    const row = rows[y];
    if (!row) continue;
    for (let x = 1; x < row.length - 1; x += 1) {
      const tile = row[x] ?? "";
      if (!SWAMP_WATER_TILES.has(tile)) continue;
      const touchesLand =
        SWAMP_LAND_TILES.has(rows[y - 1]?.[x] ?? "") ||
        SWAMP_LAND_TILES.has(rows[y + 1]?.[x] ?? "") ||
        SWAMP_LAND_TILES.has(row[x - 1] ?? "") ||
        SWAMP_LAND_TILES.has(row[x + 1] ?? "");
      if (touchesLand) edge.push([x, y]);
    }
  }
  edge.forEach(([x, y]) => setTile(rows, x, y, "4"));
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
    tile === "#" || NORTHWOOD_WATER_TILES.has(tile) || SWAMP_WATER_TILES.has(tile) || tile === "f" || tile === "y" || tile === "^" || tile === "q" || tile === "r" || tile === "n" || tile === "O" || tile === "o" ||
    tile === "*" ||
    tile === "X" || tile === "P" || tile === "w" || // badlands cliff wall + pit + massif
    tile === "Q" || tile === "V" || tile === "U" || // desert quicksand + oasis + ruin
    BEACH_WATER_TILES.has(tile) || tile === "x" || tile === "0" || tile === "1" || tile === "|" || tile === "u" || // beach sea/shore/cliff/rocks
    tile === "E" || tile === "i" // jungle wall + jungle river
  );
}

// Blocks line-of-sight for ranged attacks. Solid terrain (walls, boulders,
// buildings, trees, fences, cliffs) blocks sight; open water and pit chasms do
// NOT — so projectiles skim over swamp water / badlands pits, while boulders and
// cliffs give cover.
export function isSightBlocked(tile: string): boolean {
  // Open water/quicksand/pits do NOT block sight; solid walls/ruins/jungle do.
  return (
    tile === "#" || tile === "o" || tile === "O" || tile === "*" || tile === "f" || tile === "y" || tile === "^" || tile === "r" || tile === "q" || tile === "n" ||
    tile === "X" || tile === "w" || tile === "U" || // badlands cliff/massif, ruin
    tile === "x" || tile === "0" || tile === "1" || tile === "|" || tile === "u" || tile === "E" // beach cliff/rocks, jungle wall
  );
}

// "Beaten path" tiles. A player standing on a road is harder for wandering
// monsters to notice (see ROAD_AGGRO_FACTOR in server/index.ts), so a weak
// player can stick to the main road and slip past most of a zone's wildlife.
// `t` is the dirt road/lane used by the Waystone and Northwood arteries; other
// biomes' paths (cemetery `b`/`c`, etc.) can be added here as roads are tuned.
const ROAD_TILES = new Set(["t", "$", "%", "&", "+", "g", "h", "j", "k", "@", "`", ":", ";", "<", ">", "A"]);
export function isRoadTile(tile: string): boolean {
  return ROAD_TILES.has(tile);
}

// Mining ore ladder. A node's `kind` (content/mining-nodes.yaml) selects the ore
// it yields, the Mining level required to work the vein, and the XP per swing.
// A new ore needs only: a tier here, an item in items.yaml, an icon, and the
// `kind` added to the mining-nodes schema enum.
export interface OreTier {
  item: string;
  reqLevel: number;
  xp: number;
  label: string;
}
export const ORE_TIERS: Record<string, OreTier> = {
  copper: { item: "copper_ore", reqLevel: 1, xp: 20, label: "Copper" },
  tin: { item: "tin_ore", reqLevel: 1, xp: 25, label: "Tin" },
  iron: { item: "iron_ore", reqLevel: 10, xp: 35, label: "Iron" },
  coal: { item: "coal", reqLevel: 15, xp: 40, label: "Coal" },
  silver: { item: "silver_ore", reqLevel: 20, xp: 45, label: "Silver" },
  gold: { item: "gold_ore", reqLevel: 30, xp: 65, label: "Gold" },
  mithril: { item: "mithril_ore", reqLevel: 40, xp: 80, label: "Mithril" },
  adamant: { item: "adamant_ore", reqLevel: 50, xp: 95, label: "Adamant" }
};
export function oreTierFor(kind: string): OreTier {
  return ORE_TIERS[kind] ?? ORE_TIERS.copper!;
}

export function isSafeZone(floor: number, x: number, y: number): boolean {
  if (floor === 0 || floor === 4) return true;
  // Outpost clearings are authored in native coords; scale the rect to match
  // the floor's expanded footprint.
  const inRect = (f: number, x1: number, y1: number, x2: number, y2: number): boolean =>
    floor === f && x >= scaleX(f, x1) && x <= scaleX(f, x2) && y >= scaleY(f, y1) && y <= scaleY(f, y2);
  // The Alchemist's Hut clearing in the Sunken Marsh is a safe rest spot.
  if (inRect(5, 4, 13, 21, 26)) return true;
  // The Frontier Camp clearing in the Searing Badlands (bespoke 90x60 coords).
  if (inRect(6, 64, 14, 99, 26)) return true;
  // The Oasis Trade Outpost in the Sunken Desert (bespoke 90x60 coords).
  if (inRect(7, 22, 55, 57, 66)) return true;
  // The Deepdelve Mine entry chamber — a lit, safe staging cave by the stair up.
  if (inRect(10, 3, 4, 20, 16)) return true;
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
  if (floor === 0 && tile === "N") return { floor: 3, x: 55.5, y: 68.5 };
  if (floor === 0 && tile === "S") return { floor: 1, x: 55.5, y: 2.5 }; // arrive just inside the cemetery's north gate
  if (floor === 1 && tile === "T") return { floor: 0, x: 64.5, y: 66.5 }; // arrive at Waystone's south gate
  if (floor === 1 && tile === "C") return { floor: 2, x: 9.5, y: 7.5 }; // arrive in the crypt's entry chamber
  if (floor === 2 && tile === "T") return { floor: 1, x: 56.5, y: 37.5 }; // arrive on the cemetery's crypt-entrance apron
  if (floor === 3 && tile === "S") return { floor: 0, x: 55.5, y: 5.5 }; // arrive at Waystone's north gate
  if (floor === 3 && tile === "N") return { floor: 4, x: 55.5, y: 60.5 }; // arrive at Northwatch's south gate
  if (floor === 3 && tile === "M") return { floor: 5, x: 59.5, y: 19.5 };
  if (floor === 4 && tile === "S") return { floor: 3, x: 55.5, y: 2.5 };
  if (floor === 5 && tile === "M") return { floor: 3, x: 2.5, y: 36.5 };
  if (floor === 5 && tile === "L") return { floor: 0, x: 55.5, y: 8.5 }; // one-way drop into northern Waystone
  if (floor === 3 && tile === "D") return { floor: 6, x: 4.5, y: 40.5 };
  if (floor === 6 && tile === "D") return { floor: 3, x: 106.5, y: 35.5 };
  if (floor === 6 && tile === "Z") return { floor: 4, x: 27.5, y: 36.5 }; // one-way drop just inside Northwatch's west gate
  if (floor === 1 && tile === "G") return { floor: 7, x: 29.5, y: 4.5 };
  if (floor === 7 && tile === "G") return { floor: 1, x: 56.5, y: 68.5 }; // arrive just inside the cemetery's south gate
  if (floor === 7 && tile === "H") return { floor: 0, x: 76.5, y: 35.5 }; // one-way passage into eastern Waystone
  if (floor === 7 && tile === "Y") return { floor: 8, x: 31.5, y: 2.5 };
  if (floor === 8 && tile === "Y") return { floor: 7, x: 2.5, y: 38.5 };
  if (floor === 8 && tile === "j") return { floor: 9, x: 2.5, y: 18.5 };
  if (floor === 9 && tile === "j") return { floor: 8, x: 60.5, y: 17.5 };
  if (floor === 6 && tile === ">") return { floor: 10, x: 8.5, y: 11.5 }; // down into the Deepdelve Mine entry chamber
  if (floor === 10 && tile === "<") return { floor: 6, x: 11.5, y: 52.5 }; // back up to the badlands copper dead-end
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
