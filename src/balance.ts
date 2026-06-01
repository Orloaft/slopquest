import type { EncounterRole, Monster, MonsterSpawn } from "./content-types.ts";

export interface PlayerCombatProfile {
  level: number;
  attack: number;
  defense: number;
  ranged: number;
  magic: number;
  faith: number;
}

export interface AreaBalanceMetric {
  zone: string;
  floor: number;
  role: EncounterRole | "all";
  spawns: number;
  uniqueMonsters: number;
  minLevel: number;
  maxLevel: number;
  averageLevel: number;
  averageHp: number;
  averageDps: number;
  totalXp: number;
  aggressiveUntilPlayerLevel: number;
}

export interface CombatBalanceProfile extends PlayerCombatProfile {
  label: string;
  maxHp: number;
  weaponTier: number;
  armorTier: number;
}

export interface MonsterCombatMetric {
  monster: string;
  role: EncounterRole;
  level: number;
  profile: string;
  playerLevel: number;
  timeToKillSec: number;
  timeToDieSec: number;
  dangerRatio: number;
  xpPerMinute: number;
}

export const DEFAULT_COMBAT_PROFILES: CombatBalanceProfile[] = [
  { label: "fresh", level: 1, attack: 1, defense: 1, ranged: 1, magic: 1, faith: 1, maxHp: 120, weaponTier: 0, armorTier: 0 },
  { label: "woods_entry", level: 10, attack: 10, defense: 8, ranged: 7, magic: 6, faith: 4, maxHp: 200, weaponTier: 1, armorTier: 1 },
  { label: "crypt_ready", level: 22, attack: 22, defense: 18, ranged: 16, magic: 15, faith: 12, maxHp: 300, weaponTier: 2, armorTier: 1 },
  { label: "frontier", level: 38, attack: 36, defense: 30, ranged: 34, magic: 30, faith: 22, maxHp: 420, weaponTier: 2, armorTier: 2 },
  { label: "jungle_ready", level: 58, attack: 54, defense: 48, ranged: 50, magic: 48, faith: 40, maxHp: 600, weaponTier: 3, armorTier: 3 }
];

export function playerCombatLevel(profile: PlayerCombatProfile): number {
  const offense = Math.max(profile.attack, profile.ranged, profile.magic, profile.faith);
  const hybrid = Math.round((offense * 0.75) + (profile.defense * 0.25));
  return Math.max(1, Math.max(profile.level, offense, hybrid));
}

export function monsterCombatLevel(monster: Monster): number {
  const averageDamage = (monster.damage[0] + monster.damage[1]) / 2;
  const attacksPerSecond = 1000 / monster.attackMs;
  const rangedBonus = monster.ranged ? 3 + Math.max(0, monster.range - 1) * 1.2 : 0;
  const armorBonus = (monster.armor ?? 0) * 1.8;
  const controlBonus =
    (monster.slowPct ? 2 : 0) +
    (monster.weakenPct ? 3 : 0) +
    (monster.stunMs ? Math.min(5, monster.stunMs / 500) : 0) +
    (monster.pack ? 2 : 0) +
    (monster.burrow ? 2 : 0);
  const bossBonus = monster.maxHp >= 180 ? 8 : 0;
  const raw =
    monster.maxHp / 7.5 +
    averageDamage * 1.45 +
    attacksPerSecond * 3 +
    monster.speed * 1.15 +
    rangedBonus +
    armorBonus +
    controlBonus +
    bossBonus -
    9;
  return Math.max(1, Math.round(raw));
}

export function encounterRole(monster: Monster): EncounterRole {
  if (monster.role) return monster.role;
  if (monster.maxHp >= 220) return "boss";
  if (monster.maxHp >= 115 || monster.heavyAttack) return "elite";
  if (monster.burrow) return "ambush";
  if (monster.ranged && monster.speed <= 0) return "turret";
  if (monster.ranged) return "turret";
  if (monster.pack) return "pack";
  return "trash";
}

export function aggressiveUntilPlayerLevel(monsterLevel: number): number {
  return monsterLevel * 2;
}

export function isNaturallyAggressive(monsterLevel: number, playerLevel: number): boolean {
  return playerLevel <= aggressiveUntilPlayerLevel(monsterLevel);
}

export function areaBalanceMetrics(monsters: Record<string, Monster>, spawns: MonsterSpawn[]): AreaBalanceMetric[] {
  const groups = new Map<string, MonsterSpawn[]>();
  for (const spawn of spawns) {
    addSpawnGroup(groups, `${spawn.zone}:${spawn.floor}:all`, spawn);
    const role = encounterRole(monsters[spawn.type] ?? ({ maxHp: 1, speed: 1, damage: [1, 1], attackMs: 1000, xp: 0, gold: [0, 0], aggro: 0, range: 1, name: spawn.type } satisfies Monster));
    addSpawnGroup(groups, `${spawn.zone}:${spawn.floor}:${role}`, spawn);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const [zone, floorText, roleText] = key.split(":");
      const role: EncounterRole | "all" = roleText === "all" ? "all" : (roleText as EncounterRole);
      const specs = group.map((spawn) => monsters[spawn.type]).filter((monster): monster is Monster => Boolean(monster));
      const levels = specs.map(monsterCombatLevel);
      const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      return {
        zone: zone ?? "unknown",
        floor: Number(floorText ?? 0),
        role,
        spawns: group.length,
        uniqueMonsters: new Set(group.map((spawn) => spawn.type)).size,
        minLevel: Math.min(...levels),
        maxLevel: Math.max(...levels),
        averageLevel: round1(average(levels)),
        averageHp: round1(average(specs.map((monster) => monster.maxHp))),
        averageDps: round1(average(specs.map((monster) => ((monster.damage[0] + monster.damage[1]) / 2) * (1000 / monster.attackMs)))),
        totalXp: specs.reduce((sum, monster) => sum + monster.xp, 0),
        aggressiveUntilPlayerLevel: Math.max(...levels.map(aggressiveUntilPlayerLevel))
      };
    })
    .sort((a, b) => a.floor - b.floor || a.zone.localeCompare(b.zone) || roleSort(a.role) - roleSort(b.role));
}

export function monsterCombatMetrics(monsters: Record<string, Monster>, profiles: CombatBalanceProfile[] = DEFAULT_COMBAT_PROFILES): MonsterCombatMetric[] {
  const rows: MonsterCombatMetric[] = [];
  for (const [id, monster] of Object.entries(monsters)) {
    const level = monsterCombatLevel(monster);
    for (const profile of profiles) {
      const timeToKillSec = estimateTimeToKill(monster, profile);
      const timeToDieSec = estimateTimeToDie(monster, profile);
      rows.push({
        monster: id,
        role: encounterRole(monster),
        level,
        profile: profile.label,
        playerLevel: playerCombatLevel(profile),
        timeToKillSec,
        timeToDieSec,
        dangerRatio: round2(timeToKillSec / Math.max(0.1, timeToDieSec)),
        xpPerMinute: Math.round(monster.xp * (60 / Math.max(0.1, timeToKillSec)))
      });
    }
  }
  return rows.sort((a, b) => a.level - b.level || a.monster.localeCompare(b.monster) || a.playerLevel - b.playerLevel);
}

export function estimateTimeToKill(monster: Monster, profile: CombatBalanceProfile): number {
  const armor = monster.armor ?? 0;
  const meleeDps = Math.max(1, averageRange([8, 13]) + profile.attack + profile.weaponTier * 4 - armor) / 0.82;
  const rangedDps = Math.max(1, averageRange([6, 11]) + profile.ranged - armor) / 0.95;
  const magicDps = Math.max(1, averageRange([18, 28]) + profile.magic - armor) / 2.8;
  const bestDps = Math.max(meleeDps, rangedDps, magicDps);
  return round1(monster.maxHp / bestDps);
}

export function estimateTimeToDie(monster: Monster, profile: CombatBalanceProfile): number {
  const armorReduction = Math.floor(profile.defense / 3) + profile.armorTier * 4;
  const averageHit = Math.max(1, averageRange(monster.damage) - armorReduction);
  const heavyDps = monster.heavyAttack ? (averageRange(monster.damage) * (monster.heavyAttack.damageMultiplier - 1)) / (monster.heavyAttack.cooldownMs / 1000) : 0;
  const incomingDps = averageHit * (1000 / monster.attackMs) + heavyDps;
  return round1(profile.maxHp / Math.max(0.1, incomingDps));
}

function addSpawnGroup(groups: Map<string, MonsterSpawn[]>, key: string, spawn: MonsterSpawn): void {
  const group = groups.get(key);
  if (group) group.push(spawn);
  else groups.set(key, [spawn]);
}

function averageRange(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

function roleSort(role: EncounterRole | "all"): number {
  return ["all", "trash", "pack", "ambush", "turret", "elite", "boss"].indexOf(role);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
