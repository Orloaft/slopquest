import { test } from "@playwright/test";

// Audit capture: warp around floor 3 (Northwood forest) + the floor-6 canyon
// arrival, screenshotting the live client render so the actual visual state can
// be eyeballed (tile seams on elevations, road placement, the canyon-edge
// portal approach). Throwaway diagnostic — not a pass/fail gate.
const FLOOR3: Array<{ name: string; x: number; y: number }> = [
  { name: "01-south-arrival", x: 55, y: 64 }, // where you walk in from Waystone
  { name: "02-crossroads", x: 55, y: 35 }, // N-S spine x E-W road cross
  { name: "03-ew-road-east", x: 95, y: 35 }, // E-W road heading to the canyon
  { name: "04-canyon-edge-D", x: 105, y: 35 }, // approach to the D portal @ (108,35)
  { name: "05-north-spine", x: 55, y: 10 }, // northern spine toward Northwatch gate
  { name: "06-cave-alcove", x: 64, y: 11 }, // north-wood mining recess
  { name: "07-ne-glade", x: 90, y: 14 }, // NE glade + ore outcrop
  { name: "08-nw-glade", x: 15, y: 12 }, // NW glade
  { name: "09-west-marsh-edge", x: 6, y: 36 }, // west M portal approach
  { name: "10-pond-bank", x: 28, y: 26 } // woodland pond
];

test("Northwood floor 3 + canyon route — audit capture", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  await page.goto("/?e2e");
  await page.locator("#nameInput").fill(`audit_${Date.now().toString(36)}`);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean((window as any).__TIB_E2E__?.self()));

  const warp = async (floor: number, x: number, y: number, name: string): Promise<void> => {
    await page.evaluate((p) => (window as any).__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x, y: p.y }), { floor, x, y });
    const landed = await page
      .waitForFunction(
        (p) => {
          const me = (window as any).__TIB_E2E__?.self();
          return Boolean(me && me.floor === p.floor && Math.hypot(me.x - p.x, me.y - p.y) < 8);
        },
        { floor, x, y },
        { timeout: 8000 }
      )
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1600);
    await page.locator("#game canvas").screenshot({ path: `artifacts/audit/nw-${name}.png` });
    const me = await page.evaluate(() => (window as any).__TIB_E2E__?.self());
    console.log(`[shot] ${name}: requested (${floor},${x},${y}) landed=${landed} at (${me?.floor},${me?.x?.toFixed(1)},${me?.y?.toFixed(1)})`);
  };

  for (const s of FLOOR3) await warp(3, s.x, s.y, s.name);
  // Canyon side of the Northwood->Searing route (arrival lands at 4.5,40.5).
  await warp(6, 8, 40, "11-canyon-west-mouth");
  await warp(6, 12, 39, "12-canyon-cultist");

  const relevant = errors.filter((e) => !/favicon|net::ERR|WebGL warning/i.test(e));
  if (relevant.length) console.error("Runtime errors:\n" + relevant.join("\n"));
});
