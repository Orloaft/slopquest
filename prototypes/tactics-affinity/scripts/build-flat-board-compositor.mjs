import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { baseTerrainByFeature, board, objective, terrainFeatureTiles } from "../src/battle-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const spriteRoot = path.join(prototypeRoot, "assets/generated/ruined-crossing-v1/sprites");
const terrainRoot = path.join(spriteRoot, "aligned-terrain");
const outDir = path.join(prototypeRoot, "assets/generated/ruined-crossing-v1/flat-board");

const tile = { width: 160, height: 96 };
const step = { x: 80, y: 48 };
const skirtDepth = 30;
const rows = board.length;
const cols = board[0].length;
const size = {
  width: (cols + rows - 2) * step.x + tile.width,
  height: (cols + rows - 2) * step.y + tile.height + skirtDepth
};
const origin = {
  x: (rows - 1) * step.x + tile.width / 2,
  y: tile.height
};

const sourceTop = {
  centerX: 80,
  topY: 34,
  bottomY: 80,
  halfWidth: 44
};

const terrainTints = {
  tile_grass: [96, 111, 58],
  tile_dirt_path: [137, 102, 61],
  tile_cracked_earth: [117, 82, 58],
  tile_moss_stone: [112, 113, 88],
  tile_shallow_water: [72, 123, 135],
  tile_water_edge: [84, 122, 119]
};

const featureDecals = {
  tile_bramble: { alpha: 0.3, scale: 0.78, tint: [67, 92, 52] },
  tile_rock_blocker: { alpha: 0.34, scale: 0.68, tint: [111, 111, 94] },
  tile_rubble: { alpha: 0.34, scale: 0.7, tint: [122, 102, 79] },
  tile_raised_block: { alpha: 0.36, scale: 0.72, tint: [111, 111, 96] },
  tile_spawn_crack_inactive: { alpha: 0.44, scale: 0.62, tint: [92, 65, 51] },
  tile_spawn_crack_active: { alpha: 0.5, scale: 0.62, tint: [133, 71, 49] },
  tile_objective_pad: { alpha: 0.42, scale: 0.62, tint: [177, 145, 72] }
};

function blank() {
  return new PNG({ width: size.width, height: size.height });
}

function cellAnchor(col, row) {
  return {
    x: origin.x + (col - row) * step.x,
    y: origin.y + (col + row) * step.y
  };
}

function getIndex(png, x, y) {
  return (y * png.width + x) * 4;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mixColor(a, b, amount) {
  return [
    Math.round(a[0] * (1 - amount) + b[0] * amount),
    Math.round(a[1] * (1 - amount) + b[1] * amount),
    Math.round(a[2] * (1 - amount) + b[2] * amount)
  ];
}

function insideDiamond(x, y) {
  const dx = Math.abs(x - tile.width / 2) / (tile.width / 2);
  const dy = Math.abs(y - tile.height / 2) / (tile.height / 2);
  return dx + dy <= 1.018;
}

function diamondWeight(x, y, scale) {
  const dx = Math.abs(x - tile.width / 2) / (tile.width / 2);
  const dy = Math.abs(y - tile.height / 2) / (tile.height / 2);
  const distance = dx + dy;
  const fade = 0.16;

  if (distance > scale) {
    return 0;
  }

  if (distance < scale - fade) {
    return 1;
  }

  return clamp((scale - distance) / fade, 0, 1);
}

function topSample(png, x, y) {
  const sourceX = clamp(
    Math.round(sourceTop.centerX + (x - tile.width / 2) * (sourceTop.halfWidth / (tile.width / 2))),
    0,
    png.width - 1
  );
  const sourceY = clamp(
    Math.round(sourceTop.topY + y * ((sourceTop.bottomY - sourceTop.topY) / tile.height)),
    0,
    png.height - 1
  );
  const index = getIndex(png, sourceX, sourceY);

  return {
    color: [png.data[index], png.data[index + 1], png.data[index + 2]],
    alpha: png.data[index + 3]
  };
}

function averageTopColor(png) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = 0; y < tile.height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      if (!insideDiamond(x + 0.5, y + 0.5)) {
        continue;
      }

      const { color, alpha } = topSample(png, x, y);

      if (alpha <= 16) {
        continue;
      }

      r += color[0];
      g += color[1];
      b += color[2];
      count += 1;
    }
  }

  return count > 0 ? [Math.round(r / count), Math.round(g / count), Math.round(b / count)] : [105, 112, 69];
}

function paintPixel(target, x, y, rgba) {
  if (x < 0 || x >= target.width || y < 0 || y >= target.height) {
    return;
  }

  const index = getIndex(target, x, y);
  const alpha = rgba[3] / 255;
  const inverse = 1 - alpha;

  target.data[index] = Math.round(rgba[0] * alpha + target.data[index] * inverse);
  target.data[index + 1] = Math.round(rgba[1] * alpha + target.data[index + 1] * inverse);
  target.data[index + 2] = Math.round(rgba[2] * alpha + target.data[index + 2] * inverse);
  target.data[index + 3] = Math.min(255, Math.round(rgba[3] + target.data[index + 3] * inverse));
}

function paintTerrainDiamond(target, png, col, row, terrainName) {
  const anchor = cellAnchor(col, row);
  const average = averageTopColor(png);
  const terrainTint = terrainTints[terrainName] ?? average;

  for (let y = 0; y < tile.height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      if (!insideDiamond(x + 0.5, y + 0.5)) {
        continue;
      }

      const targetX = Math.round(anchor.x - tile.width / 2 + x);
      const targetY = Math.round(anchor.y - tile.height + y);
      const sample = topSample(png, x, y);

      const color = sample.alpha > 16 ? sample.color : average;
      const smoothed = mixColor(mixColor(color, average, 0.54), terrainTint, 0.2);

      paintPixel(target, targetX, targetY, [smoothed[0], smoothed[1], smoothed[2], 255]);
    }
  }
}

function paintFeatureDecal(target, png, tileName, col, row) {
  const config = featureDecals[tileName];

  if (!config) {
    return;
  }

  const anchor = cellAnchor(col, row);
  const average = averageTopColor(png);
  const clusterDistance = Math.abs(col - objective.col) + Math.abs(row - objective.row);
  const clusterFactor = tileName === "tile_objective_pad" ? 0.95 : clusterDistance <= 2 ? 0.68 : 1;

  for (let y = 0; y < tile.height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      const weight = diamondWeight(x + 0.5, y + 0.5, config.scale);

      if (weight <= 0) {
        continue;
      }

      const sample = topSample(png, x, y);

      if (sample.alpha <= 16) {
        continue;
      }

      const targetX = Math.round(anchor.x - tile.width / 2 + x);
      const targetY = Math.round(anchor.y - tile.height + y);
      const color = mixColor(mixColor(sample.color, average, 0.46), config.tint ?? average, 0.28);
      const alpha = Math.round(sample.alpha * config.alpha * weight * clusterFactor);

      paintPixel(target, targetX, targetY, [color[0], color[1], color[2], alpha]);
    }
  }
}

function edgePoints(col, row, edge) {
  const anchor = cellAnchor(col, row);
  const top = { x: anchor.x, y: anchor.y - tile.height };
  const right = { x: anchor.x + tile.width / 2, y: anchor.y - tile.height / 2 };
  const bottom = { x: anchor.x, y: anchor.y };
  const left = { x: anchor.x - tile.width / 2, y: anchor.y - tile.height / 2 };

  return {
    nw: [left, top],
    ne: [top, right],
    se: [right, bottom],
    sw: [bottom, left]
  }[edge];
}

function hasCell(col, row) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

function neighborsForEdge(col, row, edge) {
  return {
    nw: [col, row - 1],
    ne: [col + 1, row],
    se: [col, row + 1],
    sw: [col - 1, row]
  }[edge];
}

function fillPolygon(target, points, rgba) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(target.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))));

  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];

    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i];
      const b = points[j];

      if ((a.y > y) === (b.y > y)) {
        continue;
      }

      intersections.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length; i += 2) {
      const start = Math.max(0, Math.floor(intersections[i]));
      const end = Math.min(target.width - 1, Math.ceil(intersections[i + 1]));

      for (let x = start; x <= end; x += 1) {
        paintPixel(target, x, y, rgba);
      }
    }
  }
}

function drawLine(target, a, b, rgba, width = 1) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));

  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);

    for (let oy = -width; oy <= width; oy += 1) {
      for (let ox = -width; ox <= width; ox += 1) {
        if (ox * ox + oy * oy <= width * width) {
          paintPixel(target, x + ox, y + oy, rgba);
        }
      }
    }
  }
}

function paintSkirt(target, col, row, png) {
  const average = averageTopColor(png);
  const edgeTint = [Math.round(average[0] * 0.48), Math.round(average[1] * 0.42), Math.round(average[2] * 0.36), 238];

  for (const edge of ["nw", "ne", "se", "sw"]) {
    const [neighborCol, neighborRow] = neighborsForEdge(col, row, edge);

    if (hasCell(neighborCol, neighborRow)) {
      continue;
    }

    const [a, b] = edgePoints(col, row, edge);
    fillPolygon(target, [a, b, { x: b.x, y: b.y + skirtDepth }, { x: a.x, y: a.y + skirtDepth }], edgeTint);
    drawLine(target, { x: a.x, y: a.y + skirtDepth }, { x: b.x, y: b.y + skirtDepth }, [18, 20, 15, 110], 1);
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const terrains = new Map();
  const features = new Map();

  for (const row of board) {
    for (const tileName of row) {
      const baseName = baseTerrainByFeature[tileName] ?? tileName;

      if (!terrains.has(baseName)) {
        terrains.set(baseName, PNG.sync.read(await readFile(path.join(terrainRoot, `${baseName}.png`))));
      }

      if (terrainFeatureTiles.has(tileName) && !features.has(tileName)) {
        features.set(tileName, PNG.sync.read(await readFile(path.join(terrainRoot, `${tileName}.png`))));
      }
    }
  }

  const surface = blank();
  const decals = blank();
  const grid = blank();
  const skirt = blank();
  const segments = new Map();

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const terrainName = baseTerrainByFeature[board[row][col]] ?? board[row][col];
      const png = terrains.get(terrainName);

      paintTerrainDiamond(surface, png, col, row, terrainName);
      paintSkirt(skirt, col, row, png);

      if (terrainFeatureTiles.has(board[row][col])) {
        paintFeatureDecal(decals, features.get(board[row][col]), board[row][col], col, row);
      }

      for (const edge of ["nw", "ne", "se", "sw"]) {
        const [a, b] = edgePoints(col, row, edge);
        const key = [a, b]
          .map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)
          .sort()
          .join("|");

        segments.set(key, [a, b]);
      }
    }
  }

  for (const [a, b] of segments.values()) {
    drawLine(grid, a, b, [248, 235, 185, 58], 0);
    drawLine(grid, a, b, [17, 22, 17, 24], 0);
  }

  await writeFile(path.join(outDir, "ruined-crossing-board-surface.png"), PNG.sync.write(surface));
  await writeFile(path.join(outDir, "ruined-crossing-board-decals.png"), PNG.sync.write(decals));
  await writeFile(path.join(outDir, "ruined-crossing-board-grid.png"), PNG.sync.write(grid));
  await writeFile(path.join(outDir, "ruined-crossing-board-skirt.png"), PNG.sync.write(skirt));
  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify({ tile, step, skirtDepth, size, origin, sourceTop, baseTerrainByFeature, featureDecals }, null, 2)}\n`
  );

  console.log(`built flat board compositor assets in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
