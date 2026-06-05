// Fails the build if any spawned monster's combat level falls outside its
// zone's declared level band (see ZONE_LEVEL_BANDS in src/balance.ts). The
// balance equivalent of the asset budget. Beyond-the-Reach zones are unlisted
// and therefore not checked yet.
import { zoneBandViolations, ZONE_LEVEL_BANDS, monsterCombatLevel } from "../src/balance.ts";
import { MONSTERS, MONSTER_SPAWNS } from "../src/shared.ts";

const violations = zoneBandViolations(MONSTERS, MONSTER_SPAWNS);

console.log("zone level bands (Broken Reach):");
for (const [zone, [lo, hi]] of Object.entries(ZONE_LEVEL_BANDS)) {
  const levels = [
    ...new Set(
      MONSTER_SPAWNS.filter((s) => s.zone === zone)
        .map((s) => MONSTERS[s.type])
        .filter(Boolean)
        .map((m) => monsterCombatLevel(m!))
    )
  ].sort((a, b) => a - b);
  console.log(`  ${zone.padEnd(10)} [${lo}-${hi}]  actual ${levels.length ? `${Math.min(...levels)}-${Math.max(...levels)}` : "(none)"}`);
}

if (violations.length > 0) {
  console.error("\nBalance band check failed:");
  for (const v of violations) {
    console.error(`  - ${v.zone}/${v.monster} is L${v.level}, outside band [${v.band[0]}-${v.band[1]}]`);
  }
  process.exit(1);
}
console.log("\nAll spawned monsters fall within their zone band.");
