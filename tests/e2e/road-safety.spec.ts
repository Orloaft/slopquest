import { expect, test, type Page } from "@playwright/test";
import { isBlockedTile, isRoadTile, makeFloorTiles } from "../../src/shared.ts";

test("isRoadTile marks the dirt road/lane, and the Northwood roads read as road", () => {
  expect(isRoadTile("t")).toBe(true);
  expect(isRoadTile("d")).toBe(false); // glade/meadow dirt is open ground, not road
  expect(isRoadTile("F")).toBe(false); // canopy floor
  expect(isBlockedTile("t")).toBe(false); // roads are walkable

  const rows = makeFloorTiles(3);
  // Authored-layout roads run as east-west lanes through the wood; these two
  // packed-road cells must read as road for the safe-path mechanic.
  expect(isRoadTile(rows[20]?.[66] ?? "")).toBe(true);
  expect(isRoadTile(rows[23]?.[84] ?? "")).toBe(true);
});

// Geometry verified against makeFloorTiles(3): the wolf sits on open ground just
// off the northern east-west lane. The on-road spot (dist 5.0) stays outside the
// reduced on-road aggro range (6.8 * 0.45 = 3.06), while the off-road spot
// (dist 4.47) stays inside normal aggro range, so the player's road status is the
// thing that changes the outcome.
const WOLF = { x: 71, y: 20 };
const ON_ROAD = { x: 66, y: 20 };
const OFF_ROAD = { x: 73, y: 24 };

test("a player on the road slips past a wolf that aggros them off-road", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  // Stand on the east-west road, then pin a stationary wolf 5 tiles away.
  await place(page, 3, ON_ROAD.x, ON_ROAD.y);
  await page.evaluate((w) => window.__TIB_E2E__?.send({ type: "e2eSpawnMonster", monster: "wolf", floor: 3, x: w.x, y: w.y }), WOLF);

  // Identify our wolf by its home tile (it is the only stationary one there).
  const wolfId = await page
    .waitForFunction((home) => {
      const wolves = (window.__TIB_E2E__?.getState()?.monsters ?? []).filter(
        (m) => m.type === "wolf" && m.floor === 3 && Math.hypot(m.x - (home.x + 0.5), m.y - (home.y + 0.5)) < 0.6
      );
      return wolves[0]?.id ?? null;
    }, WOLF)
    .then((h) => h.jsonValue() as Promise<string>);

  // On the road: after a couple of seconds the wolf has not noticed the player —
  // it is still sitting on its home tile and has not started moving.
  await page.waitForTimeout(2500);
  const onRoad = await page.evaluate((id) => {
    const m = (window.__TIB_E2E__?.getState()?.monsters ?? []).find((mm) => mm.id === id);
    return m ? { x: m.x, y: m.y, moving: m.moving } : null;
  }, wolfId);
  expect(onRoad, "wolf should still be visible").not.toBeNull();
  expect(onRoad!.moving, "wolf must not chase an on-road player").toBe(false);
  expect(Math.hypot(onRoad!.x - (WOLF.x + 0.5), onRoad!.y - (WOLF.y + 0.5))).toBeLessThan(0.6);

  // Step one tile-equivalent off the road (same 5.0-tile distance) and the wolf
  // now aggros: it leaves its home and chases east toward the player.
  await place(page, 3, OFF_ROAD.x, OFF_ROAD.y);
  await page.waitForFunction(
    (id) => {
      const m = (window.__TIB_E2E__?.getState()?.monsters ?? []).find((mm) => mm.id === id);
      return Boolean(m && m.x > 72); // moved east of its home (71) toward the off-road player
    },
    wolfId,
    { timeout: 12000 }
  );
});

// --- helpers ---------------------------------------------------------------

function logErrors(page: Page): void {
  page.on("pageerror", (error) => console.error(error));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
}

async function join(page: Page): Promise<void> {
  const name = `e2e_${Date.now().toString(36)}`;
  await page.locator("#nameInput").fill(name);
  await page.locator("#joinButton").click();
  await page.waitForFunction(() => Boolean(window.__TIB_E2E__?.self()));
}

// Floor 3 is authored at target size, so tile coords are used directly. Land the
// player exactly on the requested tile (+0.5 centre).
async function place(page: Page, floor: number, x: number, y: number): Promise<void> {
  await page.evaluate((p) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: p.floor, x: p.x + 0.5, y: p.y + 0.5 }), { floor, x, y });
  await page.waitForFunction(
    (p) => {
      const me = window.__TIB_E2E__?.self();
      return Boolean(me && me.floor === p.floor && Math.floor(me.x) === p.x && Math.floor(me.y) === p.y);
    },
    { floor, x, y }
  );
}
