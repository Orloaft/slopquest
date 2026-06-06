import { expect, test } from "@playwright/test";

// The stage editor's Decorations layer. Unlike the gathering layers, decorations
// are STAGE-LOCAL visual props living in stage.json `objects` (no `resource`) —
// there's no base/overlay/suppress split and no floor/zone gating. The palette is
// the distinct sprites the stage already uses; placing stamps another of the same
// prop. Save rewrites the stage's non-resource objects (resource objects — e.g.
// choppable trees — are kept untouched). Driven via the ?__test seam; asserts the
// working set + the save PAYLOAD only, without writing files.

async function loadNorthwoodDeco(page: import("@playwright/test").Page) {
  await page.goto("/editor.html?__test=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__ed?.stage(), null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.loadStage("northwood"));
  await page.waitForFunction(() => (window as any).__ed.stage() === "northwood", null, { timeout: 10000 });
  await page.evaluate(() => (window as any).__ed.setLayer("deco"));
}

test.describe("editor decorations layer", () => {
  test("placing a prop stamps the chosen sprite into the objects payload", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodDeco(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const opt = ed.palette()[0];           // a sprite the stage already uses
      ed.setPalette(opt.value);
      ed.place(40, 40);
      return { opt, placed: ed.entAt(40, 40), payload: ed.payload() };
    });

    expect(r.opt).toBeTruthy();
    expect(r.placed).toMatchObject({ x: 40, y: 40, source: "overlay", ...r.opt.fields });
    expect(r.payload.objects).toContainEqual({
      key: r.opt.fields.key, x: 40, y: 40, w: r.opt.fields.w, h: r.opt.fields.h, blocking: r.opt.fields.blocking
    });
    expect(errors).toEqual([]);
  });

  test("the working set seeds from the stage's existing props; place then delete nets out", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodDeco(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      const n0 = ed.payload().objects.length;    // existing props (northwood has many)
      ed.setPalette(ed.palette()[0].value);
      ed.place(41, 41);
      const n1 = ed.payload().objects.length;
      ed.del(ed.entAt(41, 41));
      const n2 = ed.payload().objects.length;
      return { n0, n1, n2 };
    });

    expect(r.n0).toBeGreaterThan(0);
    expect(r.n1).toBe(r.n0 + 1);
    expect(r.n2).toBe(r.n0);
    expect(errors).toEqual([]);
  });

  test("the catalogue carries sprite thumbnails and props the stage doesn't yet use", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodDeco(page);

    const pal = await page.evaluate(() => (window as any).__ed.palette());
    expect(pal.length).toBeGreaterThan(0);
    // every northwood prop resolves to an obj_NNN.png thumbnail URL
    expect(pal.some((o: any) => o.url && /\/sprites\/nw\/obj_\d+\.png$/.test(o.url))).toBe(true);
    // the catalogue extends beyond in-stage props (scanned from the sprite dir)
    expect(pal.some((o: any) => / ·new\)$/.test(o.label))).toBe(true);
    expect(errors).toEqual([]);
  });

  test("dragging a prop keeps its sub-tile offset", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await loadNorthwoodDeco(page);

    const r = await page.evaluate(() => {
      const ed = (window as any).__ed;
      // find a cell whose TOPMOST prop sits at a fractional position
      const insp = ed.entities();
      for (let i = insp.length - 1; i >= 0; i--) {
        const e = insp[i];
        const fx = e.x - Math.floor(e.x), fy = e.y - Math.floor(e.y);
        if (fx < 0.02 && fy < 0.02) continue;
        const cx = Math.floor(e.x), cy = Math.floor(e.y), top = ed.entAt(cx, cy);
        if (top && top.x === e.x && top.y === e.y) {
          ed.move(ed.entAt(cx, cy), cx + 3, cy + 2);
          const moved = ed.entAt(cx + 3, cy + 2);
          return { beforeX: e.x, beforeY: e.y, movedX: moved.x, movedY: moved.y };
        }
      }
      return null;
    });

    expect(r).toBeTruthy();
    // offset within the tile is preserved across the 3,2 nudge
    expect(r!.movedX).toBeCloseTo(r!.beforeX + 3, 5);
    expect(r!.movedY).toBeCloseTo(r!.beforeY + 2, 5);
    expect(errors).toEqual([]);
  });
});
