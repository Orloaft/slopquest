import { expect, test, type Page } from "@playwright/test";
import {
  MAP_OBJECTS,
  buildingDoorX,
  buildingFootprintBounds,
  buildingInteriorBounds,
  isCutawayBuilding
} from "../../src/map-objects.ts";
import { isBlockedTile, tileAt } from "../../src/shared.ts";

test("Broken Reach house buildings carve walkable same-map interiors", () => {
  const floors = [0, 4, 5];
  for (const floor of floors) {
    for (const building of MAP_OBJECTS[floor]?.filter(isCutawayBuilding) ?? []) {
      const footprint = buildingFootprintBounds(building);
      const interior = buildingInteriorBounds(building);
      const doorX = buildingDoorX(building);

      expect(isBlockedTile(tileAt(floor, interior.left, interior.top)), `${building.key} interior should be walkable`).toBe(false);
      expect(isBlockedTile(tileAt(floor, doorX, footprint.bottom)), `${building.key} doorway should be walkable`).toBe(false);
      expect(isBlockedTile(tileAt(floor, footprint.left, footprint.top)), `${building.key} outer wall should remain blocked`).toBe(true);
      expect(tileAt(floor, interior.left, interior.top), `${building.key} should use town-floor interior tiles`).toBe("n");
      expect(tileAt(floor, interior.left - 1, interior.top), `${building.key} should render a stone cutaway edge`).toBe("*");
    }
  }
});

test("standing inside a Waystone building hides only its exterior sprite", async ({ page }) => {
  logErrors(page);
  await page.goto("/?e2e");
  await join(page);

  const building = MAP_OBJECTS[0]!.find((item) => item.key === "spriteBlueHouse" && item.x > 60 && item.y < 30);
  if (!building) throw new Error("missing Waystone north blue house");
  const interior = buildingInteriorBounds(building);
  const x = interior.left + 0.5;
  const y = interior.top + 0.5;

  await page.evaluate((pos) => window.__TIB_E2E__?.send({ type: "e2eGrantItems", floor: 0, x: pos.x, y: pos.y }), { x, y });
  await page.waitForFunction(
    (pos) => {
      const me = window.__TIB_E2E__?.self();
      return me?.floor === 0 && Math.abs(me.x - pos.x) < 0.1 && Math.abs(me.y - pos.y) < 0.1;
    },
    { x, y }
  );
  await page.waitForFunction(() => (window.__TIB_E2E__?.cutawayRoofAlphas?.() ?? []).some((entry) => entry.alpha === 0), null, {
    timeout: 8000
  });

  const hidden = await page.evaluate(() => (window.__TIB_E2E__?.cutawayRoofAlphas?.() ?? []).filter((entry) => entry.alpha === 0));
  expect(hidden).toHaveLength(1);
  expect(hidden[0]?.key).toBe("spriteBlueHouse");
});

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
