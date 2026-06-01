import { DEFAULT_COMBAT_PROFILES, monsterCombatMetrics } from "../src/balance.ts";
import { MONSTERS } from "../src/shared.ts";

const metrics = monsterCombatMetrics(MONSTERS, DEFAULT_COMBAT_PROFILES);

console.log("monster\trole\tmonster_level\tprofile\tplayer_level\tttk_sec\tttd_sec\tdanger\txp_per_min");
for (const row of metrics) {
  console.log(
    [
      row.monster,
      row.role,
      row.level,
      row.profile,
      row.playerLevel,
      row.timeToKillSec,
      row.timeToDieSec,
      row.dangerRatio,
      row.xpPerMinute
    ].join("\t")
  );
}
