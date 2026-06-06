import { expect, test } from "@playwright/test";

// The stage editor's Herb layer (a gathering-node layer like ore). Its wrinkle:
// a herb "type" is a preset (label + optional item/requiredLevel/xp) derived from
// herb-nodes.yaml — placing copies the whole preset, not just one value. Same
// overlay/suppression model as ore (by id). Driven via the ?__test seam; asserts
// the working set + save payload only, without writing files.

async function loadSwampHerbs(page: import("@playwright/test").Page) {
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__ed?.stage(), null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.loadStage("swamp"));   // floor 5 — many herb types
  await page.waitForFunction(
    () => (window as any).__ed.stage() === "swamp" && (window as any).__ed.floor() === 5,
    null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.setLayer("herbs"));
}

test.describe("editor herb layer", () => {
  test("placing a preset copies its label + level/xp/item into the payload", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadSwampHerbs(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      // choose a preset that carries every field (item + level + xp)
      const opt = ed.palette().find((o: any) => o.fields.item && o.fields.requiredLevel && o.fields.xp);
      ed.setPalette(opt.value);
      ed.place(50, 30);
      return { opt, placed: ed.entAt(50, 30), payload: ed.payload() };
    });

    expect(r.opt).toBeTruthy();
    // the placed node + its payload entry carry the whole preset, at tile-centre coords
    expect(r.placed).toMatchObject({ x: 50.5, y: 30.5, source: "overlay", ...r.opt.fields });
    const node = r.payload.nodes.find((n: any) => n.id === r.placed.id);
    expect(node).toMatchObject({ x: 50.5, y: 30.5, ...r.opt.fields });
    expect(errors).toEqual([]);
  });

  test("moving a base patch suppresses it by id and re-emits it", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadSwampHerbs(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const base = ed.entities().find((e: any) => e.source === "base");
      const cx = Math.floor(base.x), cy = Math.floor(base.y);
      ed.move(ed.entAt(cx, cy), cx + 1, cy + 1);
      return { id: base.id, label: base.label, moved: ed.entAt(cx + 1, cy + 1), payload: ed.payload() };
    });

    expect(r.moved).toMatchObject({ source: "overlay", id: r.id, label: r.label });
    expect(r.payload.removed).toContain(r.id);
    expect(r.payload.nodes.some((n: any) => n.id === r.id)).toBe(true);
    expect(errors).toEqual([]);
  });
});
