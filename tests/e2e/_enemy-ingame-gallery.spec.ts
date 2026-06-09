import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "artifacts", "enemy-ingame-gallery");

const GROUPS: Array<{
  name: string;
  title: string;
  floor: number;
  x: number;
  y: number;
  types: string[];
}> = [
  {
    name: "01-marsh",
    title: "Sunken Marsh v2 enemies",
    floor: 5,
    x: 32,
    y: 22,
    types: ["skitterer", "mire_spitter", "bog_leech", "marsh_hag", "gloom_toad"]
  },
  {
    name: "02-badlands",
    title: "Searing Badlands v2 enemies",
    floor: 6,
    x: 44,
    y: 36,
    types: ["canyon_scavenger", "dust_burrower", "crimson_burrower", "magma_hound", "cinder_shade", "basalt_brute"]
  },
  {
    name: "03-desert",
    title: "Sunken Desert v2 enemies",
    floor: 7,
    x: 48,
    y: 28,
    types: ["dune_skitterer", "sun_wraith", "bone_scorpion", "dune_reaver", "mirage_shade"]
  },
  {
    name: "04-beach",
    title: "Sunken Beach v2 enemies",
    floor: 8,
    x: 42,
    y: 36,
    types: ["reef_prowler", "tide_lurker", "drowned_marauder", "brine_siren", "coral_crab"]
  },
  {
    name: "05-jungle",
    title: "Untamed Jungle v2 enemies",
    floor: 9,
    x: 70,
    y: 42,
    types: ["venomous_stalker", "totem_wraith", "canopy_stalker", "blowpipe_headhunter", "verdant_faultwarden"]
  },
  {
    name: "06-deepmine",
    title: "Deepdelve Mine v2 enemies",
    floor: 10,
    x: 50,
    y: 30,
    types: ["deepdelve_wight", "crypt_sentinel", "bone_scorpion", "basalt_brute", "crimson_burrower"]
  }
];

test("capture in-game screenshots of v2 enemy groups", async ({ page }) => {
  test.setTimeout(180000);
  mkdirSync(OUT, { recursive: true });
  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`enemy_gallery_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
  await page.addStyleTag({
    content: "#hud,.dialogue-dim{display:none!important;} body{overflow:hidden!important;}"
  });
  await page.evaluate(() => window.__TIB_E2E__?.send({ type: "chat", text: "/dev god" }));
  await page.evaluate(() => window.__TIB_E2E__?.setUserZoom(2));

  for (const group of GROUPS) {
    await page.evaluate(
      (p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y, hp: 100 }),
      { floor: group.floor, x: group.x, y: group.y }
    );
    await page.waitForFunction((floor) => window.__TIB_E2E__?.self()?.floor === floor, group.floor);
    const center = await page.evaluate(() => {
      const me = window.__TIB_E2E__?.self();
      if (!me) throw new Error("missing e2e player");
      return { floor: me.floor, x: me.x, y: me.y };
    });

    await page.evaluate(
      ({ floor, x, y, types }) => {
        const hidden = new Set(["bog_leech", "dust_burrower", "crimson_burrower", "bone_scorpion", "venomous_stalker", "canopy_stalker"]);
        const hiddenOffsets = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1]
        ];
        const regularOffsets = [
          [-3, -2],
          [0, -2],
          [3, -2],
          [-3, 2],
          [0, 2],
          [3, 2]
        ];
        let hiddenIndex = 0;
        let regularIndex = 0;
        for (const type of types) {
          const [dx, dy] = hidden.has(type) ? hiddenOffsets[hiddenIndex++ % hiddenOffsets.length]! : regularOffsets[regularIndex++ % regularOffsets.length]!;
          window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: type, floor, x: x + dx, y: y + dy });
        }
      },
      { ...center, types: group.types }
    );

    await page.evaluate((g) => {
      document.querySelectorAll(".__enemy_gallery_label").forEach((node) => node.remove());
      const el = document.createElement("div");
      el.className = "__enemy_gallery_label";
      el.textContent = `${g.title}: ${g.types.join(", ")}`;
      el.style.cssText =
        "position:fixed;left:14px;top:14px;z-index:99999;max-width:820px;padding:8px 10px;" +
        "background:rgba(10,12,16,.76);color:#f4f0dc;font:13px/1.35 monospace;border:1px solid rgba(244,240,220,.35);";
      document.body.appendChild(el);
    }, group);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, `${group.name}.png`) });
  }
});
