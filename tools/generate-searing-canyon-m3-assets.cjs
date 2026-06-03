const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const MAGENTA = [255, 0, 255, 255];
const GUTTER = 8;
const LABEL_H = 7;
const OUT_DIR = path.join(__dirname, '..', 'assetsources', 'curated', 'bespoke', 'searing-canyon-m3-assets');
const GROUND_OUT = path.join(OUT_DIR, 'cracked-earth-desert.png');
const PROPS_OUT = path.join(OUT_DIR, 'desert-props.png');

const pal = {
  label: [75, 38, 67, 255],
  labelHi: [255, 221, 169, 255],
  sandHi: [231, 151, 75, 255],
  sand: [196, 91, 45, 255],
  sandLo: [145, 64, 39, 255],
  rust: [93, 43, 37, 255],
  rust2: [64, 34, 37, 255],
  pale: [234, 196, 128, 255],
  pebble: [172, 100, 67, 255],
  shadow: [68, 45, 54, 255],
  cactusHi: [133, 157, 111, 255],
  cactus: [89, 124, 88, 255],
  cactusLo: [54, 87, 69, 255],
  dry: [133, 102, 75, 255],
  dead: [92, 79, 68, 255],
  bone: [225, 210, 166, 255],
  boneLo: [154, 130, 96, 255],
};

const FONT = {
  A: ['111', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['111', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['111', '100', '101', '101', '111'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'], P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'], S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  W: ['101', '101', '111', '111', '101'], Y: ['101', '101', '010', '010', '010'],
  _: ['000', '000', '000', '000', '111'], 0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
};

function makePng(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = MAGENTA[0];
    png.data[i + 1] = MAGENTA[1];
    png.data[i + 2] = MAGENTA[2];
    png.data[i + 3] = MAGENTA[3];
  }
  return png;
}

function put(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
}

function rect(png, x, y, w, h, rgba) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) put(png, xx, yy, rgba);
  }
}

function disk(png, cx, cy, rx, ry, rgba) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(png, x, y, rgba);
    }
  }
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

function noise(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function drawText(png, x, y, text) {
  const s = text.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const glyph = FONT[s[i]] || FONT._;
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        put(png, x + i * 4 + gx + 1, y + gy + 1, pal.label);
        put(png, x + i * 4 + gx, y + gy, pal.labelHi);
      }
    }
  }
}

function line(png, x0, y0, x1, y1, rgba) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(png, x0, y0, rgba);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function drawGroundTile(png, x0, y0, seed) {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const edge = x < 2 || y < 2 || x > 29 || y > 29;
      const n = edge ? noise(x % 30, y % 30, 777) : noise(x, y, seed);
      const bands = Math.sin((x + y) * 0.42) * 0.06 + Math.sin((x - y) * 0.31) * 0.05;
      let c = mix(pal.sandHi, pal.sand, 0.42 + n * 0.28 + bands);
      if (noise(x * 2, y, seed + 8) > 0.88 && !edge) c = mix(c, pal.pale, 0.32);
      if (edge) c = mix(pal.sandHi, pal.sand, 0.5 + n * 0.08);
      put(png, x0 + x, y0 + y, c);
    }
  }

  const cracks = [
    [[7, 8], [12, 10], [16, 15], [22, 16]],
    [[9, 23], [12, 19], [18, 20], [22, 24]],
    [[21, 8], [18, 12], [19, 17]],
    [[10, 14], [8, 18], [11, 21]],
    [[14, 7], [15, 11], [12, 14]],
  ];
  cracks.forEach((pts, i) => {
    if (noise(i, seed, 15) < 0.18) return;
    const shifted = pts.map(([x, y]) => [
      Math.max(4, Math.min(27, x + Math.round((noise(x, y, seed) - 0.5) * 5))),
      Math.max(4, Math.min(27, y + Math.round((noise(y, x, seed + 4) - 0.5) * 5))),
    ]);
    for (let p = 0; p < shifted.length - 1; p++) {
      line(png, x0 + shifted[p][0], y0 + shifted[p][1], x0 + shifted[p + 1][0], y0 + shifted[p + 1][1], pal.rust2);
      if (noise(p, i, seed) > 0.52) {
        put(png, x0 + shifted[p][0] + 1, y0 + shifted[p][1], pal.rust);
      }
    }
    if (shifted.length > 2 && noise(i, seed, 22) > 0.45) {
      const [bx, by] = shifted[1];
      line(png, x0 + bx, y0 + by, x0 + Math.max(4, bx - 3), y0 + by + 3, pal.rust);
    }
  });

  const debrisCount = 5 + (seed % 5);
  for (let i = 0; i < debrisCount; i++) {
    const x = 5 + Math.floor(noise(i, seed, 2) * 22);
    const y = 5 + Math.floor(noise(seed, i, 3) * 22);
    const c = noise(i, i, seed) > 0.55 ? pal.pebble : pal.pale;
    put(png, x0 + x, y0 + y, c);
    if (noise(i, seed, 9) > 0.65) put(png, x0 + x + 1, y0 + y, mix(c, pal.rust, 0.35));
  }

  for (let y = 0; y < 32; y++) {
    const edge1 = mix(pal.sandHi, pal.sand, 0.48 + noise(0, y, 777) * 0.08);
    const edge2 = mix(pal.sandHi, pal.sand, 0.55 + noise(1, y, 777) * 0.08);
    put(png, x0, y0 + y, edge1);
    put(png, x0 + 31, y0 + y, edge1);
    put(png, x0 + 1, y0 + y, edge2);
    put(png, x0 + 30, y0 + y, edge2);
  }
  for (let x = 0; x < 32; x++) {
    const edge1 = mix(pal.sandHi, pal.sand, 0.48 + noise(x, 0, 778) * 0.08);
    const edge2 = mix(pal.sandHi, pal.sand, 0.55 + noise(x, 1, 778) * 0.08);
    put(png, x0 + x, y0, edge1);
    put(png, x0 + x, y0 + 31, edge1);
    put(png, x0 + x, y0 + 1, edge2);
    put(png, x0 + x, y0 + 30, edge2);
  }
  for (let y = 0; y < 32; y++) {
    const yy = y === 31 ? 0 : (y === 30 ? 1 : y);
    const edge1 = mix(pal.sandHi, pal.sand, 0.48 + noise(0, yy, 777) * 0.08);
    const edge2 = mix(pal.sandHi, pal.sand, 0.55 + noise(1, yy, 777) * 0.08);
    put(png, x0, y0 + y, edge1);
    put(png, x0 + 31, y0 + y, edge1);
    put(png, x0 + 1, y0 + y, edge2);
    put(png, x0 + 30, y0 + y, edge2);
  }
  const corner1 = mix(pal.sandHi, pal.sand, 0.52);
  const corner2 = mix(pal.sandHi, pal.sand, 0.58);
  for (const [cx, cy] of [[0, 0], [31, 0], [0, 31], [31, 31]]) put(png, x0 + cx, y0 + cy, corner1);
  for (const [cx, cy] of [[1, 1], [30, 1], [1, 30], [30, 30]]) put(png, x0 + cx, y0 + cy, corner2);
}

function generateGround() {
  const cell = 32;
  const width = 4 * cell + 3 * GUTTER;
  const height = 4 * (LABEL_H + cell) + 3 * GUTTER;
  const png = makePng(width, height);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = c * (cell + GUTTER);
      const y = r * (LABEL_H + cell + GUTTER) + LABEL_H;
      drawText(png, x + 8, y - LABEL_H, `G${r}${c}`);
      drawGroundTile(png, x, y, 100 + r * 19 + c * 7);
    }
  }
  return png;
}

function trunk(png, x, y, w, h) {
  const r = Math.floor(w / 2);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      const cap = yy < r ? Math.abs(xx) <= Math.max(0, yy) : true;
      if (!cap || Math.abs(xx) > r) continue;
      let c = xx < -1 ? pal.cactusHi : (xx > 1 ? pal.cactusLo : pal.cactus);
      if ((xx + r) % 4 === 0) c = mix(c, pal.cactusLo, 0.35);
      put(png, x + xx, y - yy, c);
    }
  }
}

function cactusArm(png, x, y, side, up, h) {
  const sx = side < 0 ? -1 : 1;
  for (let i = 1; i <= 8; i++) rect(png, x + sx * i, y - 3, 1, 5, pal.cactus);
  rect(png, x + sx * 3, y - h, 5, h, pal.cactus);
  rect(png, x + sx * 3, y - h - 2, 5, 3, pal.cactusHi);
  rect(png, x + sx * 7, y - 2, 2, 4, pal.cactusLo);
  for (let yy = y - h; yy <= y; yy += 5) put(png, x + sx * 5, yy, pal.cactusLo);
  if (up) put(png, x + sx * 5, y - h - 3, pal.cactusHi);
}

function drawCactus(png, x0, y0, w, h, variant) {
  const baseX = x0 + Math.floor(w / 2);
  const baseY = y0 + h - 5;
  disk(png, baseX + 1, baseY + 2, Math.min(13, w / 3), 3, pal.shadow);
  const mainH = h - 11;
  trunk(png, baseX, baseY, variant === 'sm' ? 7 : 9, mainH);
  for (let yy = baseY - mainH + 7; yy < baseY - 4; yy += 6) {
    put(png, baseX - 3, yy, pal.cactusHi);
    put(png, baseX + 3, yy, pal.cactusLo);
  }
  if (variant !== 'sm') {
    cactusArm(png, baseX - 4, baseY - Math.floor(mainH * 0.42), -1, true, Math.floor(mainH * 0.34));
    cactusArm(png, baseX + 4, baseY - Math.floor(mainH * 0.55), 1, true, Math.floor(mainH * 0.28));
  }
  if (variant === 'lg') {
    cactusArm(png, baseX + 4, baseY - Math.floor(mainH * 0.28), 1, true, Math.floor(mainH * 0.22));
    cactusArm(png, baseX - 4, baseY - Math.floor(mainH * 0.68), -1, true, Math.floor(mainH * 0.18));
  }
}

function drawScrub(png, x0, y0, w, h, dry) {
  const cx = x0 + Math.floor(w / 2);
  const by = y0 + h - 6;
  disk(png, cx, by + 2, 12, 3, pal.shadow);
  const colors = dry ? [pal.dry, pal.pebble, pal.rust] : [pal.dead, pal.dry, pal.shadow];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const len = 7 + Math.floor(noise(i, w, h) * 8);
    const x1 = cx + Math.round(Math.cos(a) * len);
    const y1 = by - 2 + Math.round(Math.sin(a) * len * 0.45) - Math.floor(noise(i, h, w) * 7);
    line(png, cx, by - 2, x1, y1, colors[i % colors.length]);
    if (!dry && i % 3 === 0) line(png, x1, y1, x1 + (i % 2 ? -3 : 3), y1 - 2, colors[(i + 1) % colors.length]);
  }
  if (dry) {
    for (let i = 0; i < 9; i++) disk(png, cx - 10 + i * 3, by - 2 + (i % 3), 2, 1, colors[i % colors.length]);
  }
}

function drawSkullPile(png, x0, y0, w, h) {
  const cx = x0 + Math.floor(w / 2);
  const by = y0 + h - 5;
  disk(png, cx, by + 1, 12, 3, pal.shadow);
  for (let i = 0; i < 8; i++) {
    const x = x0 + 9 + Math.floor(noise(i, 2, 3) * 22);
    const y = y0 + 18 + Math.floor(noise(3, i, 4) * 8);
    rect(png, x, y, 7, 2, i % 2 ? pal.bone : pal.boneLo);
  }
  disk(png, x0 + 16, y0 + 18, 7, 5, pal.bone);
  rect(png, x0 + 14, y0 + 21, 8, 5, pal.bone);
  put(png, x0 + 14, y0 + 18, pal.rust2);
  put(png, x0 + 19, y0 + 18, pal.rust2);
  put(png, x0 + 17, y0 + 22, pal.rust);
  line(png, x0 + 10, y0 + 16, x0 + 6, y0 + 12, pal.boneLo);
  line(png, x0 + 22, y0 + 16, x0 + 26, y0 + 12, pal.boneLo);
}

function drawScree(png, x0, y0, w, h, large) {
  const cx = x0 + Math.floor(w / 2);
  const by = y0 + h - 5;
  disk(png, cx, by + 2, large ? 13 : 10, 3, pal.shadow);
  const count = large ? 8 : 5;
  for (let i = 0; i < count; i++) {
    const rx = large ? 4 + Math.floor(noise(i, w, 1) * 5) : 3 + Math.floor(noise(i, w, 1) * 3);
    const ry = large ? 3 + Math.floor(noise(i, h, 2) * 4) : 2 + Math.floor(noise(i, h, 2) * 3);
    const x = x0 + 7 + Math.floor(noise(i, 4, w) * (w - 14));
    const y = y0 + h - 10 - Math.floor(noise(i, 5, h) * (large ? 13 : 7));
    disk(png, x, y, rx, ry, pal.sandLo);
    rect(png, x - rx + 1, y - ry + 1, rx + 1, 2, pal.sandHi);
    put(png, x + rx - 1, y + ry - 1, pal.rust2);
  }
}

function generateProps() {
  const cells = [
    ['saguaro_lg', 64, 96, (png, x, y, w, h) => drawCactus(png, x, y, w, h, 'lg')],
    ['saguaro_md', 52, 80, (png, x, y, w, h) => drawCactus(png, x, y, w, h, 'md')],
    ['saguaro_sm', 40, 56, (png, x, y, w, h) => drawCactus(png, x, y, w, h, 'sm')],
    ['scrub_dead', 40, 40, (png, x, y, w, h) => drawScrub(png, x, y, w, h, false)],
    ['scrub_dry', 40, 40, (png, x, y, w, h) => drawScrub(png, x, y, w, h, true)],
    ['skull_pile', 40, 36, drawSkullPile],
    ['scree_lg', 40, 36, (png, x, y, w, h) => drawScree(png, x, y, w, h, true)],
    ['scree_sm', 32, 28, (png, x, y, w, h) => drawScree(png, x, y, w, h, false)],
  ];
  const width = cells.reduce((sum, [, w]) => sum + w, 0) + GUTTER * (cells.length - 1);
  const maxH = Math.max(...cells.map(([, , h]) => h));
  const height = LABEL_H + maxH;
  const png = makePng(width, height);
  let x = 0;
  for (const [label, w, h, draw] of cells) {
    drawText(png, x + Math.max(0, Math.floor((w - label.length * 4) / 2)), 0, label);
    draw(png, x, LABEL_H + maxH - h, w, h);
    x += w + GUTTER;
  }
  return png;
}

function writePng(png, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

writePng(generateGround(), GROUND_OUT);
writePng(generateProps(), PROPS_OUT);
console.log(GROUND_OUT);
console.log(PROPS_OUT);
