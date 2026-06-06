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
});
