import { expect, test } from "@playwright/test";
import { areaBalanceMetrics, aggressiveUntilPlayerLevel, encounterRole, estimateTimeToDie, estimateTimeToKill, isNaturallyAggressive, monsterCombatLevel, monsterCombatMetrics, playerCombatLevel } from "../../src/balance.ts";
import { MONSTERS, MONSTER_SPAWNS } from "../../src/shared.ts";

test("RuneScape-style aggro turns off once the player clearly outlevels a monster", () => {
  const ratLevel = monsterCombatLevel(MONSTERS["rat"]!);
  expect(isNaturallyAggressive(ratLevel, aggressiveUntilPlayerLevel(ratLevel))).toBe(true);
  expect(isNaturallyAggressive(ratLevel, aggressiveUntilPlayerLevel(ratLevel) + 1)).toBe(false);
});

test("player combat level follows the strongest combat path", () => {
  expect(playerCombatLevel({ level: 3, attack: 8, defense: 4, ranged: 1, magic: 1, faith: 1 })).toBe(8);
  expect(playerCombatLevel({ level: 12, attack: 1, defense: 1, ranged: 1, magic: 1, faith: 1 })).toBe(12);
});

test("area balance metrics summarize each monster-spawn zone", () => {
  const metrics = areaBalanceMetrics(MONSTERS, MONSTER_SPAWNS);
  const woods = metrics.find((metric) => metric.zone === "woods" && metric.role === "all");
  const woodsTrash = metrics.find((metric) => metric.zone === "woods" && metric.role === "trash");
  const jungle = metrics.find((metric) => metric.zone === "jungle" && metric.role === "all");
  expect(woods?.spawns).toBeGreaterThan(0);
  expect(woodsTrash?.maxLevel).toBeLessThanOrEqual(woods?.maxLevel ?? 0);
  expect(woods?.averageLevel).toBeGreaterThan(0);
  expect(jungle?.maxLevel).toBeGreaterThan(woods?.minLevel ?? 0);
});

test("encounter roles and combat metrics expose TTK/TTD balance pressure", () => {
  expect(encounterRole(MONSTERS["mire_spitter"]!)).toBe("turret");
  expect(encounterRole(MONSTERS["boss"]!)).toBe("boss");
  const profile = { label: "test", level: 20, attack: 20, defense: 16, ranged: 14, magic: 10, faith: 8, maxHp: 280, weaponTier: 1, armorTier: 1 };
  expect(estimateTimeToKill(MONSTERS["wolf"]!, profile)).toBeGreaterThan(0);
  expect(estimateTimeToDie(MONSTERS["wolf"]!, profile)).toBeGreaterThan(0);
  const rows = monsterCombatMetrics({ wolf: MONSTERS["wolf"]! }, [profile]);
  expect(rows[0]?.dangerRatio).toBeGreaterThan(0);
});
