import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(__dirname, "..");
const spriteRoot = path.join(prototypeRoot, "assets/generated/ruined-crossing-v1/sprites");
const outDir = path.join(spriteRoot, "aligned-terrain");
const topFaceDir = path.join(outDir, "top-face");

const terrainTiles = [
  "tile_grass",
  "tile_moss_stone",
  "tile_dirt_path",
  "tile_cracked_earth",
  "tile_shallow_water",
  "tile_water_edge",
  "tile_bramble",
  "tile_rock_blocker",
  "tile_rubble",
  "tile_raised_block",
  "tile_spawn_crack_inactive",
  "tile_spawn_crack_active",
  "tile_objective_pad"
];

const canvas = { width: 160, height: 144 };
const anchor = { x: 80, y: 136 };
const alphaThreshold = 12;
const topFaceMask = [
  { x: 80, y: 7 },
  { x: 159, y: 62 },
  { x: 80, y: 134 },
  { x: 1, y: 62 }
];
const topFaceTargetBottomY = 136;

function getAlphaBounds(png) {
  const bounds = {
    minX: png.width,
    minY: png.height,
    maxX: -1,
    maxY: -1
  };

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  if (bounds.maxX < 0) {
    throw new Error("No visible pixels found");
  }

  return bounds;
}

function blit(source, target, offsetX, offsetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const targetX = x + offsetX;
      const targetY = y + offsetY;

      if (targetX < 0 || targetX >= target.width || targetY < 0 || targetY >= target.height) {
        continue;
      }

      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = (targetY * target.width + targetX) * 4;

      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
}

function isInsidePolygon(x, y, points) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function createTopFace(source) {
  const topFace = new PNG({ width: canvas.width, height: canvas.height });
  const shiftY = topFaceTargetBottomY - topFaceMask[2].y;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (!isInsidePolygon(x + 0.5, y + 0.5, topFaceMask)) {
        continue;
      }

      const targetY = y + shiftY;

      if (targetY < 0 || targetY >= topFace.height) {
        continue;
      }

      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = (targetY * topFace.width + x) * 4;

      topFace.data[targetIndex] = source.data[sourceIndex];
      topFace.data[targetIndex + 1] = source.data[sourceIndex + 1];
      topFace.data[targetIndex + 2] = source.data[sourceIndex + 2];
      topFace.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  return topFace;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(topFaceDir, { recursive: true });

  const manifest = {
    canvas,
    anchor,
    alphaThreshold,
    topFaceMask,
    topFaceTargetBottomY,
    tiles: []
  };

  for (const name of terrainTiles) {
    const source = PNG.sync.read(await readFile(path.join(spriteRoot, `${name}.png`)));
    const bounds = getAlphaBounds(source);
    const sourceAnchorX = (bounds.minX + bounds.maxX) / 2;
    const offsetX = Math.round(anchor.x - sourceAnchorX);
    const offsetY = Math.round(anchor.y - bounds.maxY);
    const normalized = new PNG({ width: canvas.width, height: canvas.height });

    blit(source, normalized, offsetX, offsetY);
    await writeFile(path.join(outDir, `${name}.png`), PNG.sync.write(normalized));

    const topFace = createTopFace(normalized);
    await writeFile(path.join(topFaceDir, `${name}.png`), PNG.sync.write(topFace));

    manifest.tiles.push({
      name,
      sourceSize: [source.width, source.height],
      alphaBounds: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
      offset: [offsetX, offsetY],
      topFace: `top-face/${name}.png`
    });
  }

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`normalized ${terrainTiles.length} terrain tiles to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
