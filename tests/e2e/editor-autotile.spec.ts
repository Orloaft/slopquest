import { expect, test } from "@playwright/test";

// The stage editor's road blob autotile: paint a path and every cell resolves to a
// direction-appropriate tile (straight / corner / cross) via blobResolver, driven by
// the per-stage <zone>.blobset.json. We drive the engine through the ?__test seam so
// the assertion is on resolved tile CHARS, not canvas pixels.

test.describe("editor road autotiling", () => {
  test("paints direction-dependent road tiles from the blobset", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as any).__ed?.stage(), null, { timeout: 10000 });
    await page.evaluate(() => (window as any).__ed.loadStage("northwood"));
    await page.waitForFunction(
      () => (window as any).__ed.stage() === "northwood" && (window as any).__ed.parts().length,
      null, { timeout: 10000 });

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const road = ed.parts().find((p: any) => p.id === "road");
      if (!road) return { ok: false, reason: "no road part" };
      const vert: [number, number][] = []; for (let y = 28; y <= 34; y++) vert.push([55, y]);
      const horiz: [number, number][] = []; for (let x = 56; x <= 62; x++) horiz.push([x, 34]);
      const path = [...vert, ...horiz];
      for (const [x, y] of path) ed.paint(road, x, y);
      const ch = (x: number, y: number) => ed.charAt(x, y);
      const vSet = new Set(vert.slice(1, -1).map(([x, y]) => ch(x, y)));
      const hSet = new Set(horiz.slice(1, -1).map(([x, y]) => ch(x, y)));
      return {
        ok: true,
        vert: [...vSet], horiz: [...hSet], corner: ch(55, 34),
        allRoad: path.every(([x, y]) => road.memberOf(x, y)),
      };
    });

    expect(r.ok, (r as any).reason).toBe(true);
    expect(r.allRoad).toBe(true);
    // A straight run is one consistent tile; vertical ≠ horizontal ≠ corner.
    expect(r.vert!.length).toBe(1);
    expect(r.horiz!.length).toBe(1);
    expect(r.vert![0]).not.toBe(r.horiz![0]);
    expect(r.corner).not.toBe(r.vert![0]);
    expect(r.corner).not.toBe(r.horiz![0]);
    expect(errors).toEqual([]);
  });
});
