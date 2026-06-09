import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Throwaway audit: load the real game, then for every monster type pull its
// walk + attack frame keys, measure each sliced frame's opaque/edge pixels and
// per-family anchor drift. Flags improper slicing: empty frames (slice landed on
// background), content clipped at the crop edge, or frames that don't align.
const OUT = path.join(process.cwd(), "artifacts", "enemy-slice-audit");

const TYPES = [
  "rat", "spider", "skeleton", "boss", "goblin", "goblin_scout",
  "goblin_shaman", "wolf", "wisp", "ghoul", "bone_druid", "bog_wraith",
  "grave_revenant", "crypt_sentinel", "pale_banshee", "dire_wolf",
  "wild_boar", "thorn_hedgehog", "forest_spider", "forest_slime",
  "mushroom_brute", "sapling_deer", "ancient_treant", "orc",
  "forest_pixie", "reach_hen", "meadow_hopper", "reach_vole",
  "grave_shambler", "skitterer", "mire_spitter", "canyon_scavenger",
  "dust_burrower", "crimson_burrower", "dune_skitterer", "sun_wraith",
  "reef_prowler", "venomous_stalker", "totem_wraith", "bog_leech",
  "marsh_hag", "gloom_toad", "magma_hound", "cinder_shade",
  "basalt_brute", "bone_scorpion", "dune_reaver", "mirage_shade",
  "tide_lurker", "drowned_marauder", "brine_siren", "coral_crab",
  "canopy_stalker", "blowpipe_headhunter", "verdant_faultwarden",
  "deepdelve_wight"
];

test("enemy slice audit", async ({ page }) => {
  test.setTimeout(120000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  const report = await page.evaluate((types) => {
    const e2e = window.__TIB_E2E__!;
    const cov = e2e.monsterTextureCoverage(types);
    const allKeys = Array.from(
      new Set(cov.flatMap((c) => [...c.frames, ...c.attackFrames].map((f) => f.key)))
    );
    const stats = e2e.textureAlphaStats(allKeys);
    const statByKey: Record<string, (typeof stats)[number]> = {};
    for (const s of stats) statByKey[s.key] = s;
    const drift = e2e.actorFrameAnchorDrift();
    return { cov, statByKey, drift };
  }, TYPES);

  writeFileSync(path.join(OUT, "raw.json"), JSON.stringify(report, null, 2));

  // ---- Analysis ----
  const findings: string[] = [];
  const familyDims: Record<string, Set<string>> = {};
  for (const c of report.cov) {
    const all = [...c.frames, ...c.attackFrames];
    for (const f of all) {
      const s = report.statByKey[f.key];
      if (!f.exists || !s || !s.exists) {
        findings.push(`MISSING  ${c.type} (${c.family}) ${f.key}`);
        continue;
      }
      const perimeter = 2 * (s.width + s.height) - 4;
      const edgeRatio = perimeter > 0 ? s.edgeOpaque / perimeter : 0;
      const fill = s.width * s.height > 0 ? s.opaque / (s.width * s.height) : 0;
      (familyDims[c.family] ??= new Set()).add(`${s.width}x${s.height}`);
      if (s.opaque === 0) findings.push(`EMPTY    ${c.type} (${c.family}) ${f.key} ${s.width}x${s.height}`);
      else if (fill < 0.02) findings.push(`SPARSE   ${c.type} (${c.family}) ${f.key} fill=${(fill * 100).toFixed(1)}% ${s.width}x${s.height}`);
      if (edgeRatio > 0.25) findings.push(`CLIPPED  ${c.type} (${c.family}) ${f.key} edge=${(edgeRatio * 100).toFixed(0)}% (content bleeds to crop border)`);
    }
  }
  const driftFlags = report.drift
    .filter((d) => d.driftX > 6 || d.driftY > 6)
    .map((d) => `DRIFT    ${d.family} ${d.dir} dx=${d.driftX} dy=${d.driftY}`);

  // Families whose frames are not all the same canvas size = inconsistent slicing.
  const sizeFlags = Object.entries(familyDims)
    .filter(([, set]) => set.size > 1)
    .map(([fam, set]) => `MULTISIZE ${fam}: ${[...set].join(", ")}`);

  const fallbackGoblin = report.cov.filter((c) => c.family === "goblin" && c.type !== "goblin").map((c) => `FALLBACK ${c.type} -> goblin (no mapping)`);

  const summary = [
    `# Enemy slice audit (${report.cov.length} types)`,
    "",
    "## Missing / empty / sparse / clipped frames",
    ...(findings.length ? findings : ["(none)"]),
    "",
    "## Anchor drift (>6px across frames 0-3)",
    ...(driftFlags.length ? driftFlags : ["(none)"]),
    "",
    "## Inconsistent frame canvas sizes per family",
    ...(sizeFlags.length ? sizeFlags : ["(none)"]),
    "",
    "## Types falling back to goblin (no resolver mapping)",
    ...(fallbackGoblin.length ? fallbackGoblin : ["(none)"])
  ].join("\n");
  writeFileSync(path.join(OUT, "summary.md"), summary);
  // eslint-disable-next-line no-console
  console.log("\n" + summary + "\n");
});
