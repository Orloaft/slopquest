import { areaBalanceMetrics } from "../src/balance.ts";
import { MONSTERS, MONSTER_SPAWNS } from "../src/shared.ts";

const metrics = areaBalanceMetrics(MONSTERS, MONSTER_SPAWNS);

console.log("zone\tfloor\trole\tspawns\tunique\tlevel_min\tlevel_avg\tlevel_max\taggressive_until\tavg_hp\tavg_dps\ttotal_xp");
for (const metric of metrics) {
  console.log(
    [
      metric.zone,
      metric.floor,
      metric.role,
      metric.spawns,
      metric.uniqueMonsters,
      metric.minLevel,
      metric.averageLevel,
      metric.maxLevel,
      metric.aggressiveUntilPlayerLevel,
      metric.averageHp,
      metric.averageDps,
      metric.totalXp
    ].join("\t")
  );
}
