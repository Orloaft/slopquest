import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Throwaway visual audit: export every monster family's ACTUALLY-SLICED walk +
// attack frames (the recentered textures the player sees) as a labeled contact
// grid per family, on a checkerboard so transparent regions read. The alpha-stat
// audit can't catch a crop that grabbed the wrong region (recentering hides it);
// the eye can. One screenshot per family under artifacts/enemy-contact/.
const OUT = path.join(process.cwd(), "artifacts", "enemy-contact");

const TYPES = [
  "rat", "spider", "skeleton", "ghoul", "boss", "orc", "goblin", "goblin_scout",
  "goblin_shaman", "wolf", "wisp", "dire_wolf", "wild_boar", "thorn_hedgehog",
  "forest_spider", "forest_slime", "mushroom_brute", "sapling_deer",
  "ancient_treant", "bone_druid", "forest_pixie", "bog_wraith", "grave_revenant",
  "crypt_sentinel", "pale_banshee", "skitterer", "mire_spitter",
  "canyon_scavenger", "dust_burrower", "dune_skitterer", "sun_wraith",
  "reef_prowler", "venomous_stalker", "totem_wraith", "reach_hen",
  "meadow_hopper", "reach_vole", "restless_husk", "grave_shambler",
  "bound_wight", "crimson_burrower", "deepdelve_wight", "verdant_faultwarden",
  "drowned_marauder"
];

test("enemy contact grid", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));

  // Build, per family, the labeled list of walk+attack frame cells with data URLs.
  const families = await page.evaluate((types) => {
    const e2e = window.__TIB_E2E__!;
    const cov = e2e.monsterTextureCoverage(types);
    // De-dup by family (many types reuse one family) and remember an example type.
    const byFamily = new Map<string, { type: string; family: string; cells: Array<{ label: string; key: string }> }>();
    for (const c of cov) {
      if (byFamily.has(c.family)) continue;
      const cells: Array<{ label: string; key: string }> = [];
      for (const f of c.frames) cells.push({ label: `${f.dir} w${f.frame}`, key: f.key });
      for (const f of c.attackFrames) cells.push({ label: `${f.dir} a${f.frame}`, key: f.key });
      byFamily.set(c.family, { type: c.type, family: c.family, cells });
    }
    const groups = Array.from(byFamily.values());
    const allKeys = Array.from(new Set(groups.flatMap((g) => g.cells.map((c) => c.key))));
    const urls = e2e.frameDataUrls(allKeys);
    const urlByKey: Record<string, { exists: boolean; dataUrl: string | null }> = {};
    for (const u of urls) urlByKey[u.key] = { exists: u.exists, dataUrl: u.dataUrl };
    return groups.map((g) => ({
      ...g,
      cells: g.cells.map((c) => ({ ...c, ...urlByKey[c.key] }))
    }));
  }, TYPES);

  for (const fam of families) {
    // Render one family's grid into the DOM and screenshot just that element.
    await page.evaluate((g) => {
      document.querySelectorAll(".__contact").forEach((n) => n.remove());
      const root = document.createElement("div");
      root.className = "__contact";
      root.style.cssText =
        "position:absolute;top:0;left:0;width:1320px;z-index:99999;background:#222;padding:12px;" +
        "font:12px monospace;color:#eee;display:flex;flex-direction:column;gap:6px;";
      const title = document.createElement("div");
      title.textContent = `${g.family}   (example type: ${g.type})   ${g.cells.length} frames`;
      title.style.cssText = "font-size:16px;font-weight:bold;color:#fff;";
      root.appendChild(title);
      const grid = document.createElement("div");
      grid.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;";
      const checker =
        "background-image:linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%);" +
        "background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0;background-color:#999;";
      for (const c of g.cells) {
        const cell = document.createElement("div");
        cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;";
        const box = document.createElement("div");
        box.style.cssText = `${checker}border:1px solid #000;display:flex;align-items:center;justify-content:center;`;
        if (c.dataUrl) {
          const img = document.createElement("img");
          img.src = c.dataUrl;
          img.style.cssText = "image-rendering:pixelated;display:block;";
          box.appendChild(img);
        } else {
          box.textContent = "MISSING";
          box.style.cssText += "width:48px;height:48px;color:#f55;";
        }
        const lbl = document.createElement("div");
        lbl.textContent = c.label;
        cell.appendChild(box);
        cell.appendChild(lbl);
        grid.appendChild(cell);
      }
      root.appendChild(grid);
      document.body.appendChild(root);
    }, fam);
    await page.waitForTimeout(150);
    const el = page.locator(".__contact");
    await el.screenshot({ path: path.join(OUT, `fam-${fam.family}.png`) });
    // eslint-disable-next-line no-console
    console.log(`SHEET ${fam.family} (${fam.cells.length} frames)`);
  }
});
