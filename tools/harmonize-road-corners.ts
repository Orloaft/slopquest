// Build the aligned road-wang.png from the pristine authored source.
// ---------------------------------------------------------------------------
// road-wang.png is a 4x4 @32px edge-Wang atlas the bakers index DIRECTLY by the
// NESW mask (N=1,E=2,S=4,W=8 -> idx==mask; blit road[m], no LUT). The STRAIGHTS
// (V=5 N+S, H=10 E+W), the T-junctions and the cross are authored correctly and are
// left byte-for-byte untouched. The four CORNERS (NW=9, NE=3, ES=6, SW=12) were the
// problem: their authored bands sit at the wrong offset relative to the straights, so
// a bend kinked at the tile seam. Only NW happened to be painted on-register.
//
// HISTORY of what did NOT work, so nobody re-treads it:
//   - Rotating/mirroring the good NW corner: the road band sits at x~22 (right of the
//     32px centre, because the straights' bands are off-centre), so any flip/rotate
//     reflects it to x~10 -> ~12px off the straight. Dead end.
//   - Warping each authored corner to re-register it (rigid shift, diagonal-ramp, then
//     a gated separable shear): registration could be made to match at the seam, but
//     warping SHEARS the authored pixels, so the grass COLLAR edge still stepped at the
//     seam and large corrections (NE needed +7px) tore the band. Three corners never
//     looked as clean as NW. Dead end.
//
// WHAT WORKS — SYNTHESISE every corner from the two straights (this file):
//   A corner is just an L made of the vertical straight's band and the horizontal
//   straight's band. So we composite the actual V and H straight TILES, each clipped to
//   the half that reaches its connecting edge, and union them at the elbow. Because each
//   arm IS the straight's own pixels (band AND collar), every connecting edge is
//   pixel-identical to the neighbouring straight by construction -> seams are perfect,
//   no step, no fringe. All four corners are built the same way, so they are uniform in
//   quality (NW is rebuilt too, so it matches the others exactly). The inner concave
//   corner carries the straights' collar (grass + flower dither); the outer corner is
//   solid dirt. Out-of-L pixels stay TRANSPARENT so world grass shows through.
//
// Idempotent. Source of truth: road-wang.src.png (committed). Re-run with
// `npm run assets:fix:road-corners`, then re-bake the road stages (route, northwood).
import { readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const SRC = nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.src.png");
const OUT = nodePath.join(repoRoot, "assetsources/curated/sliced/road-wang.png");
const ts = 32, COLS = 4;
const V_STRAIGHT = 5, H_STRAIGHT = 10; // NESW masks: 5 = N+S, 10 = E+W

const src = PNG.sync.read(readFileSync(SRC));
const tileXY = (idx: number) => [(idx % COLS) * ts, Math.floor(idx / COLS) * ts] as const;
// Strict core-dirt: orange/brown band only, excludes the greenish collar / flower dither.
const isDirt = (r: number, g: number, b: number, a: number) => a > 127 && r - g > 22 && r - b > 45;
function pixel(idx: number, x: number, y: number): [number, number, number, number] {
  const [tx, ty] = tileXY(idx);
  const i = ((ty + y) * src.width + (tx + x)) * 4;
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
}

// Median of the longest contiguous dirt run, sampled across the straight's length —
// robust to the per-row/col dither wobble that throws off a min/max or centroid.
function medianRun(idx: number, axis: "row" | "col"): [number, number] {
  const los: number[] = [], his: number[] = [];
  for (let s = 2; s <= 30; s++) {
    let best: [number, number] | null = null, run: [number, number] | null = null;
    for (let t = 0; t < ts; t++) {
      const [r, g, b, a] = axis === "row" ? pixel(idx, t, s) : pixel(idx, s, t);
      if (isDirt(r, g, b, a)) run = run ? [run[0], t] : [t, t];
      else { if (run && (!best || run[1] - run[0] > best[1] - best[0])) best = run; run = null; }
    }
    if (run && (!best || run[1] - run[0] > best[1] - best[0])) best = run;
    if (best) { los.push(best[0]); his.push(best[1]); }
  }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return [med(los), med(his)];
}
const [XL, XR] = medianRun(V_STRAIGHT, "row"); // vertical band's x-extent
const [YT, YB] = medianRun(H_STRAIGHT, "col"); // horizontal band's y-extent

const out = new PNG({ width: src.width, height: src.height });
out.data.set(src.data); // straights / T / cross stay pristine; only corners are rebuilt

// v/h name the connecting edges. Corner = (vertical straight's arm reaching that edge)
// L (horizontal straight's arm reaching its edge).
const CORNERS: Record<number, { v: "N" | "S"; h: "W" | "E" }> = {
  9: { v: "N", h: "W" }, 3: { v: "N", h: "E" }, 6: { v: "S", h: "E" }, 12: { v: "S", h: "W" },
};

for (const [idxStr, { v, h }] of Object.entries(CORNERS)) {
  const idx = Number(idxStr);
  const [tx, ty] = tileXY(idx);
  for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
    // Keep the vertical arm from its connecting edge down/up to the far edge of the
    // horizontal band (so it reaches the elbow but grows no stub past it); mirror for H.
    const keepV = v === "N" ? y <= YB : y >= YT;
    const keepH = h === "W" ? x <= XR : x >= XL;
    const vp = pixel(V_STRAIGHT, x, y), hp = pixel(H_STRAIGHT, x, y);
    const vOpaque = keepV && vp[3] > 127, hOpaque = keepH && hp[3] > 127;
    const vDirt = vOpaque && isDirt(...vp), hDirt = hOpaque && isDirt(...hp);
    const inVBand = x >= XL && x <= XR;
    // Dirt always wins over collar (so neither arm's collar bleeds into the other's
    // band at the elbow); within the vertical band columns prefer the V arm, else H.
    let pick: [number, number, number, number] | null = null;
    if (vDirt || hDirt) pick = vDirt && (inVBand || !hDirt) ? vp : hp;
    else if (vOpaque || hOpaque) pick = vOpaque ? vp : hp; // collar
    const di = ((ty + y) * out.width + (tx + x)) * 4;
    if (pick) { out.data[di] = pick[0]; out.data[di + 1] = pick[1]; out.data[di + 2] = pick[2]; out.data[di + 3] = 255; }
    else { out.data[di] = 0; out.data[di + 1] = 0; out.data[di + 2] = 0; out.data[di + 3] = 0; } // grass shows through
  }
}

writeFileSync(OUT, PNG.sync.write(out));
console.log(`road-wang.png built: straights/T/cross pristine; 4 corners SYNTHESISED from straights ` +
  `(V band x[${XL},${XR}], H band y[${YT},${YB}]) — seams pixel-identical to straights, all four uniform.`);
