import { expect, test } from "@playwright/test";

// The stage editor's Ore layer (a gathering-node layer). Place/move/delete ore
// veins on the grid; the editor writes ONLY its placements + id-keyed suppressions
// to content/mining-nodes.editor.yaml (merged at build time), leaving the
// hand-authored mining-nodes.yaml untouched. Gathering nodes differ from spawns:
// tile-centre coords (x.5/y.5), a unique id, and an auto-derived approach tile.
// Driven through the ?__test seam; asserts the working set + save payload only.

async function loadNorthwoodOre(page: import("@playwright/test").Page) {
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__ed?.stage(), null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.loadStage("northwood"));
  await page.waitForFunction(
    () => (window as any).__ed.stage() === "northwood" && (window as any).__ed.floor() === 3,
    null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.setLayer("ore"));
}

test.describe("editor ore layer", () => {
  test("places a vein at tile-centre coords with an auto approach + id", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodOre(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      ed.place(45, 35);                       // cell (45,35)
      return { placed: ed.entAt(45, 35), payload: ed.payload() };
    });

    // tile-centre coords; overlay source; has an id + approach
    expect(r.placed).toMatchObject({ x: 45.5, y: 35.5, source: "overlay" });
    expect(r.placed.id).toMatch(/^mine-3-45-35/);
    expect(typeof r.placed.ax).toBe("number");
    const node = r.payload.nodes.find((n: any) => n.id === r.placed.id);
    expect(node).toMatchObject({ x: 45.5, y: 35.5, kind: r.placed.kind });
    expect(r.payload.removed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("moving a base vein suppresses it by id and re-emits it as an overlay node", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodOre(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const base = ed.entities().find((e: any) => e.source === "base");
      const fromCell = { cx: Math.floor(base.x), cy: Math.floor(base.y) };
      ed.move(ed.entAt(fromCell.cx, fromCell.cy), fromCell.cx + 2, fromCell.cy + 2);
      return { id: base.id, fromCell, moved: ed.entAt(fromCell.cx + 2, fromCell.cy + 2), payload: ed.payload() };
    });

    expect(r.moved).toMatchObject({ source: "overlay", id: r.id, x: r.fromCell.cx + 2 + 0.5, y: r.fromCell.cy + 2 + 0.5 });
    expect(r.payload.removed).toContain(r.id);                          // suppressed by id
    expect(r.payload.nodes.some((n: any) => n.id === r.id)).toBe(true); // re-emitted
    expect(errors).toEqual([]);
  });

  test("deleting a base vein suppresses it; deleting an overlay vein just drops it", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodOre(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const base = ed.entities().find((e: any) => e.source === "base");
      ed.del(ed.entAt(Math.floor(base.x), Math.floor(base.y)));
      ed.place(48, 38);
      const overId = ed.entAt(48, 38).id;
      ed.del(ed.entAt(48, 38));
      return { baseId: base.id, overId, baseGone: ed.entAt(Math.floor(base.x), Math.floor(base.y)), overGone: ed.entAt(48, 38), payload: ed.payload() };
    });

    expect(r.baseGone).toBeNull();
    expect(r.overGone).toBeNull();
    expect(r.payload.removed).toContain(r.baseId);                          // base → suppressed
    expect(r.payload.nodes.some((n: any) => n.id === r.overId)).toBe(false); // overlay → just gone
    expect(errors).toEqual([]);
  });
});
