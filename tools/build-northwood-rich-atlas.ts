// DEPRECATED / RETIRED (2026-06-02). This procedural generator invented Northwood's
// layout + tileset from scratch and never read the authored mockup. The in-game stage is
// now produced by the authored-layout bridge: tools/build-northwood-from-authored.ts
// (`npm run assets:northwood`). Kept for reference only; not wired into any npm script.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { PNG } from "pngjs";

interface TileDef {
  id: string;
  char?: string;
  name: string;
  blocked: boolean;
  sightBlocked: boolean;
  road?: boolean;
  textureKey: string;
  minimapColor: string;
  tags: string[];
  draw: (png: PNG, dx: number, dy: number, index: number) => void;
}

const repoRoot = process.cwd();
const outDir = nodePath.join(repoRoot, "assetsources/asset-forge/exports/northwood");
const publicDir = nodePath.join(repoRoot, "public/tilesets/northwood");
const vocabPath = nodePath.join(repoRoot, "assetsources/asset-forge/northwood.vocab.json");
const treeSourcePath = nodePath.join(repoRoot, "assetsources/curated/bespoke/northwood-trees-v1/northwood-trees-source-alpha.png");
const showcaseWaterPath = nodePath.join(repoRoot, "assetsources/curated/bespoke/northwood-tileset-v1/tileset-1-aligned.png");
const showcaseRoadPath = nodePath.join(repoRoot, "assetsources/curated/bespoke/northwood-tileset-v1/tileset-2-road-aligned.png");
const showcaseGrassPath = nodePath.join(repoRoot, "assetsources/curated/bespoke/northwood-tileset-v1/grass.png");
const tileSize = 32;
const columns = 8;
const stageCols = 110;
const stageRows = 72;

const waterChars = ["~", "!", "?", "=", "{", "}", "(", ")", "/", "P", "w", "Q", "V", "U", "x", "0", "J"];
const roadEdgeChars = ["$", "%", "&", "+", "g", "h", "j", "k", "@", "`", ":", ";", "<", ">", "A"];
const protectedRoadChars = ["t", "S", "N", "M", "D", ...roadEdgeChars];
const detailChars = ["B", "C", "H", "Y", "z", "e", "i", "l"] as const;
const elevationChars = ["L", "q", "o", "m"];
const sceneChars = ["R", "G", "s", "n"];
const overheadChars = ["^", "f", "J", ...detailChars] as const;
const WANG_N = 1;
const WANG_E = 2;
const WANG_S = 4;
const WANG_W = 8;
let cachedTreeSource: PNG | null = null;
let cachedShowcaseWater: PNG | null = null;
let cachedShowcaseRoad: PNG | null = null;
let cachedShowcaseGrass: PNG | null = null;

const tileDefs: TileDef[] = [
  tile("northwood_forest_floor", "F", "forest-floor", false, false, "tileForest", "#315f35", ["forest-floor", "base"], drawGrass(0)),
  tile("northwood_grass_moss", "a", "mossy-grass", false, false, "tileForest", "#38683a", ["forest-floor", "variant"], drawGrass(1)),
  tile("northwood_grass_clover", "b", "clover-grass", false, false, "tileForest", "#2c5635", ["forest-floor", "variant"], drawGrass(2)),
  tile("northwood_grass_needles", "c", "pine-needle-grass", false, false, "tileForest", "#46623a", ["forest-floor", "variant"], drawGrass(3)),
  tile("northwood_leaf_litter", "B", "leaf-litter", false, false, "tileForest", "#4f6134", ["forest-floor", "detail", "leaf-litter"], drawForestDetail(0)),
  tile("northwood_fern_moss", "C", "fern-moss", false, false, "tileForest", "#355f33", ["forest-floor", "detail", "fern"], drawForestDetail(1)),
  tile("northwood_root_shadow", "H", "root-shadow", false, false, "tileForest", "#3a5031", ["forest-floor", "detail", "root"], drawForestDetail(2)),
  tile("northwood_wildflower_moss", "Y", "wildflower-moss", false, false, "tileForest", "#416b39", ["forest-floor", "detail", "wildflower"], drawForestDetail(3)),
  tile("northwood_pine_duff", "z", "pine-duff", false, false, "tileForest", "#4d5b34", ["forest-floor", "detail", "pine-duff"], drawForestDetail(4)),
  tile("northwood_mushroom_moss", "e", "mushroom-moss", false, false, "tileForest", "#435f36", ["forest-floor", "detail", "mushroom"], drawForestDetail(5)),
  tile("northwood_bluebell_moss", "i", "bluebell-moss", false, false, "tileForest", "#3b663d", ["forest-floor", "detail", "bluebell"], drawForestDetail(6)),
  tile("northwood_twigs_and_stones", "l", "twigs-and-stones", false, false, "tileForest", "#4f5d38", ["forest-floor", "detail", "twigs"], drawForestDetail(7)),
  tile("northwood_glade_dirt", "d", "glade-dirt", false, false, "tileDirt", "#8b6f45", ["glade-dirt", "ground"], drawDirt(0)),
  tile("northwood_road", "t", "packed-road", false, false, "tileDirt", "#a7834f", ["road", "ground"], drawRoadWang(15), true),
  tile("northwood_road_edge_north", "$", "road-grass-border-north", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "edge-north"], drawRoadWang(12), true),
  tile("northwood_road_edge_south", "%", "road-grass-border-south", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "edge-south"], drawRoadWang(3), true),
  tile("northwood_road_edge_west", "&", "road-grass-border-west", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "edge-west"], drawRoadWang(6), true),
  tile("northwood_road_edge_east", "+", "road-grass-border-east", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "edge-east"], drawRoadWang(9), true),
  tile("northwood_road_corner_nw", "g", "road-grass-corner-northwest", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "corner-northwest"], drawRoadWang(14), true),
  tile("northwood_road_corner_ne", "h", "road-grass-corner-northeast", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "corner-northeast"], drawRoadWang(13), true),
  tile("northwood_road_corner_sw", "j", "road-grass-corner-southwest", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "corner-southwest"], drawRoadWang(7), true),
  tile("northwood_road_corner_se", "k", "road-grass-corner-southeast", false, false, "tileDirt", "#6f7442", ["road", "transition", "wang-road", "corner-southeast"], drawRoadWang(11), true),
  tile("northwood_deep_water", "~", "deep-water", true, false, "tileWater", "#356ea6", ["water", "open"], drawWaterWang(15)),
  tile("northwood_shore_north", "!", "shore-north", true, false, "tileWater", "#3d789f", ["water", "shore", "wang-water", "north"], drawWaterWang(12)),
  tile("northwood_shore_south", "?", "shore-south", true, false, "tileWater", "#3d789f", ["water", "shore", "wang-water", "south"], drawWaterWang(3)),
  tile("northwood_shore_west", "=", "shore-west", true, false, "tileWater", "#3d789f", ["water", "shore", "wang-water", "west"], drawWaterWang(6)),
  tile("northwood_shore_east", "{", "shore-east", true, false, "tileWater", "#3d789f", ["water", "shore", "wang-water", "east"], drawWaterWang(9)),
  tile("northwood_cove_nw", "}", "cove-northwest", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "corner"], drawWaterWang(14)),
  tile("northwood_cove_ne", "(", "cove-northeast", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "corner"], drawWaterWang(13)),
  tile("northwood_cove_sw", ")", "cove-southwest", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "corner", "southwest"], drawWaterWang(7)),
  tile("northwood_cove_se", "/", "cove-southeast", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "corner", "southeast"], drawWaterWang(11)),
  tile("northwood_water_island", "P", "isolated-water-pocket", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-0"], drawWaterWang(0)),
  tile("northwood_water_endpoint_north", "w", "water-endpoint-north", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-1"], drawWaterWang(WANG_N)),
  tile("northwood_water_endpoint_east", "Q", "water-endpoint-east", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-2"], drawWaterWang(WANG_E)),
  tile("northwood_water_endpoint_south", "V", "water-endpoint-south", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-4"], drawWaterWang(WANG_S)),
  tile("northwood_water_endpoint_west", "U", "water-endpoint-west", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-8"], drawWaterWang(WANG_W)),
  tile("northwood_water_channel_vertical", "x", "water-channel-vertical", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-5"], drawWaterWang(WANG_N | WANG_S)),
  tile("northwood_water_channel_horizontal", "0", "water-channel-horizontal", true, false, "tileWater", "#3b7198", ["water", "shore", "wang-water", "mask-10"], drawWaterWang(WANG_E | WANG_W)),
  tile("northwood_reed_lily_water", "J", "reed-and-lily-water", true, false, "tileWater", "#3b7198", ["water", "open", "interior-detail", "reeds", "lilies"], drawReedLilyWater),
  tile("northwood_wet_bank_stones", "p", "wet-bank-stones", false, false, "tileForest", "#596b49", ["shore-rim", "wet-bank", "walkable"], drawWetBankStones),
  tile("northwood_boulder", "r", "mossy-boulder", true, true, "tileForest", "#69756d", ["boulder", "blocker"], drawBoulder),
  tile("northwood_ruin_paving", "R", "mossy-ruin-paving", false, false, "tileRock", "#69624c", ["poi-scene", "ruin", "walkable"], drawRuinPaving),
  tile("northwood_logging_duff", "G", "logging-duff", false, false, "tileForest", "#66543a", ["poi-scene", "logging", "walkable"], drawLoggingDuff),
  tile("northwood_shrine_moss", "s", "shrine-moss", false, false, "tileForest", "#496d4a", ["poi-scene", "shrine", "walkable"], drawShrineMoss),
  tile("northwood_cave_mouth_shadow", "n", "cave-mouth-shadow", true, true, "tileRock", "#2f3029", ["poi-scene", "cave-mouth", "blocker"], drawCaveMouthShadow),
  tile("northwood_plank_walkway", "T", "weathered-plank-walkway", false, false, "tileDirt", "#8c7448", ["art-spec", "walkway", "timber", "walkable"], drawPlankWalkway),
  tile("northwood_mine_gravel", "K", "ore-flecked-mine-gravel", false, false, "tileRock", "#6c6757", ["art-spec", "mine", "ore", "walkable"], drawMineGravel),
  tile("northwood_exposed_ore_seam", "O", "exposed-ore-seam", true, true, "tileRock", "#56585b", ["art-spec", "mine", "ore", "blocker"], drawOreSeam),
  tile("northwood_ledge_top", "L", "mossy-ledge-top", false, false, "tileForest", "#536f40", ["elevation", "ledge-top", "walkable"], drawLedgeTop),
  tile("northwood_cliff_face", "q", "woodland-cliff-face", true, true, "tileRock", "#625846", ["elevation", "cliff-face", "blocker"], drawCliffFace(0)),
  tile("northwood_cliff_shadow", "o", "woodland-cliff-shadow", true, true, "tileRock", "#453e35", ["elevation", "cliff-face", "bottom-cap", "blocker"], drawCliffFace(1)),
  tile("northwood_stone_stairs", "m", "mossy-stone-stairs", false, false, "tileDirt", "#8f805e", ["elevation", "stairs", "walkable"], drawStoneStairs),
  tile("northwood_forest_border_canopy", "^", "forest-border-canopy", true, true, "tileForest", "#19381f", ["forest-border-canopy", "blocker"], drawCanopy),
  tile("northwood_cuttable_tree_underlay", "f", "cuttable-tree-underlay", true, true, "tileForest", "#315f35", ["cuttable-tree-underlay", "blocker", "bespoke-tree-source"], drawTreeUnderlay),
  tile("northwood_portal_south", "S", "portal-south", false, false, "tileDirt", "#e7d37c", ["portal-south", "road"], drawPortal("S", 11), true),
  tile("northwood_portal_north", "N", "portal-north", false, false, "tileDirt", "#e7d37c", ["portal-north", "road"], drawPortal("N", 15), true),
  tile("northwood_portal_marsh", "M", "portal-marsh", false, false, "tileDirt", "#e7d37c", ["portal-marsh", "road"], drawPortal("M", 15), true),
  tile("northwood_portal_badlands", "D", "portal-badlands", false, false, "tileDirt", "#e7d37c", ["portal-badlands", "road"], drawPortal("D", 11), true),
  tile("northwood_road_endpoint_north", "@", "road-endpoint-north", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-1"], drawRoadWang(WANG_N), true),
  tile("northwood_road_endpoint_east", "`", "road-endpoint-east", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-2"], drawRoadWang(WANG_E), true),
  tile("northwood_road_endpoint_south", ":", "road-endpoint-south", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-4"], drawRoadWang(WANG_S), true),
  tile("northwood_road_endpoint_west", ";", "road-endpoint-west", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-8"], drawRoadWang(WANG_W), true),
  tile("northwood_road_channel_vertical", "<", "road-channel-vertical", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-5"], drawRoadWang(WANG_N | WANG_S), true),
  tile("northwood_road_channel_horizontal", ">", "road-channel-horizontal", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-10"], drawRoadWang(WANG_E | WANG_W), true),
  tile("northwood_road_island", "A", "isolated-road-pocket", false, false, "tileDirt", "#7b7443", ["road", "transition", "wang-road", "mask-0"], drawRoadWang(0), true),
  ...Array.from({ length: 16 }, (_, index) =>
    tile(`northwood_wang_water_${index.toString().padStart(2, "0")}`, undefined, `wang-water-reference-${index}`, true, false, "tileWater", "#356ea6", ["water", "wang-water", `wang-${index}`], drawWaterWang(index))
  ),
  ...Array.from({ length: 16 }, (_, index) =>
    tile(`northwood_road_transition_${index.toString().padStart(2, "0")}`, undefined, `road-transition-reference-${index}`, false, false, "tileDirt", "#a7834f", ["road", "transition", "wang-road", `road-${index}`], drawRoadWang(index), true)
  ),
  ...Array.from({ length: 9 }, (_, index) =>
    tile(`northwood_ground_detail_${index.toString().padStart(2, "0")}`, undefined, `curated-ground-detail-${index}`, false, false, "tileForest", "#315f35", ["forest-floor", "curated-ground-detail"], drawDetail(index))
  )
];

const rows = Math.ceil(tileDefs.length / columns);
const atlas = new PNG({ width: columns * tileSize, height: rows * tileSize, colorType: 6 });
for (let i = 0; i < tileDefs.length; i += 1) {
  tileDefs[i]!.draw(atlas, (i % columns) * tileSize, Math.floor(i / columns) * tileSize, i);
}

const stage = buildStage();
const vocab = buildVocab();
const manifest = {
  schema: "asset-forge/tileset@1",
  name: "forest",
  image: "forest.png",
  tileSize,
  columns,
  rows,
  sourceProjects: ["wang-water-demo.afproj.json", "grass-water-roads-demo.afproj.json", "highland-blended-demo.afproj.json"],
  sourceAssets: ["assetsources/curated/bespoke/northwood-trees-v1/northwood-trees-source-alpha.png"],
  cleanup: "Northwood blueprint atlas with generated Wang/reference terrain and curated bespoke tree/canopy source art. Demo projects are references only; no mixed raw crops or chroma-key backgrounds are used.",
  tiles: tileDefs.map((def, index) => ({
    index,
    id: def.id,
    char: def.char ?? "",
    name: def.name,
    blocked: def.blocked,
    sightBlocked: def.sightBlocked,
    tags: def.tags
  }))
};

mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
writeFileSync(nodePath.join(outDir, "forest.png"), PNG.sync.write(atlas));
writeFileSync(nodePath.join(publicDir, "forest.png"), PNG.sync.write(atlas));
writeJson(nodePath.join(outDir, "forest.tileset.json"), manifest);
writeJson(nodePath.join(outDir, "northwood.stage.json"), stage);
writeJson(vocabPath, vocab);

console.log(`Built Northwood proof-of-concept atlas and stage: ${tileDefs.length} tiles, ${stageCols}x${stageRows}`);

function tile(
  id: string,
  char: string | undefined,
  name: string,
  blocked: boolean,
  sightBlocked: boolean,
  textureKey: string,
  minimapColor: string,
  tags: string[],
  draw: TileDef["draw"],
  road = false
): TileDef {
  return { id, char, name, blocked, sightBlocked, textureKey, minimapColor, tags, draw, road };
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function buildVocab(): unknown {
  const chars = Object.fromEntries(
    tileDefs
      .filter((def) => def.char)
      .map((def) => [
        def.char!,
        {
          role: def.name,
          blocked: def.blocked,
          sightBlocked: def.sightBlocked,
          road: Boolean(def.road),
          textureKey: def.textureKey,
          minimapColor: def.minimapColor
        }
      ])
  );
  return {
    zone: "northwood",
    floor: 3,
    stageName: "northwood",
    description: "Northwood blueprint vocabulary: one dominant forest floor, sparse grass variants, explicit road/grass edge and corner borders, shore roles, water-bank detail, wooded perimeter blockers, POI scene terrain, art-spec walkway/mine tiles, and portals.",
    requiredPortals: {
      S: { x: 55, y: 70, to: "Waystone" },
      N: { x: 55, y: 1, to: "Northwatch" },
      M: { x: 1, y: 36, to: "The Sunken Marsh" },
      D: { x: 108, y: 35, to: "The Searing Badlands" }
    },
    requiredWalkable: [
      { x: 11, y: 59, label: "southwest ore approach" },
      { x: 99, y: 14, label: "northeast ore approach" },
      { x: 96, y: 56, label: "southeast ore approach" },
      { x: 61, y: 8, label: "coal seam approach" },
      { x: 66, y: 8, label: "iron seam approach" }
    ],
    authoredPasses: {
      elevation: "First parity pass toward the mockup: small authored ledge accents remain available, but floor-wide procedural cliff bands are disabled until the cliff vocabulary can match the mockup quality.",
      waterBankDetail: "Second parity pass: bespoke reed/lily water interiors and walkable wet-bank stones are generated from water masks before roads and props, so ponds read like composed shoreline pockets instead of flat blue shapes.",
      poiSceneRecipes: "Third parity pass: named scene recipes reserve ruin paving, logging duff, shrine moss, cave-mouth blockers, and prop anchors together so Northwood POIs read as composed vignettes rather than loose clearings.",
      northwoodArtSpec: "Fourth parity pass: cliffs, POI walkways, and mine pockets get explicit art-spec tiles: weathered plank walkways, ore-flecked gravel, blocking ore seams, and stronger cliff-rock rendering.",
      depthLayers: "Fifth parity pass: the stage export now carries base, fringe, and overhead tile layers so water ripples/decorations draw over legal base terrain and cliffs/paths/stairs sit above a continuous ground pass.",
      visibleComposition: "Sixth parity pass: visible composition is now guarded by screenshot-quality constraints instead of synthetic floor-wide terraces.",
      parityCorrection: "Seventh parity pass: the cliff-heavy visible pass was reverted as a visual regression; Northwood keeps the painterly road/water/POI vocabulary and uses restrained elevation accents only.",
      depthTextureTraining: "Eighth parity pass: critique-driven training target for valid pixel-art depth. Cliff faces now render as stacked textured stone strata, stair mouths as composed stone runs, and sprite/crop regressions are guarded separately from enemy placement.",
      aestheticParityRealignment: "Ninth parity pass: visual density and composition now target the high-fidelity mockup again. Road edges fade with dirt/forest dithering, cliff lips are jagged rather than ruler-straight, forests cluster tightly around terrain masses, and review framing uses a wider Northwood camera scale."
    },
    chars
  };
}

function buildStage(): unknown {
  const rows = Array.from({ length: stageRows }, () => Array.from({ length: stageCols }, () => "F"));
  const roadMask = Array.from({ length: stageRows }, () => Array.from({ length: stageCols }, () => false));

  for (let y = 0; y < stageRows; y += 1) {
    for (let x = 0; x < stageCols; x += 1) {
      const edge = x === 0 || y === 0 || x === stageCols - 1 || y === stageRows - 1;
      if (edge) rows[y]![x] = "^";
      else rows[y]![x] = "F";
    }
  }

  grassPatch(rows, 31, 14, 10, 5, "a");
  grassPatch(rows, 22, 52, 11, 6, "b");
  grassPatch(rows, 84, 53, 13, 7, "c");
  grassPatch(rows, 74, 24, 10, 6, "a");
  grassPatch(rows, 40, 45, 9, 5, "b");

  const waterMask = Array.from({ length: stageRows }, () => Array.from({ length: stageCols }, () => false));
  scallopedPondMask(waterMask, 15, 37, 10, 15, 11);
  scallopedPondMask(waterMask, 82, 18, 14, 8, 29);
  scallopedPondMask(waterMask, 18, 29, 5, 7, 37);
  scallopedPondMask(waterMask, 88, 22, 8, 5, 43);
  carveStream(waterMask);
  carveWaterNotches(waterMask);
  waterMask[28]![88] = true;
  waterMask[28]![89] = true;
  applyWaterMask(rows, waterMask);
  applyWetShoreRim(rows, waterMask);
  enrichWaterBanks(rows, waterMask);

  glade(rows, 55, 36, 9, 6);
  glade(rows, 11, 59, 6, 4);
  glade(rows, 99, 14, 6, 4);
  glade(rows, 96, 56, 7, 5);
  glade(rows, 63, 8, 8, 4);
  applyRestrainedElevationAccents(rows);

  // Reference-stage contract: a north/south artery, east/west branch, one
  // readable central loop, and a small northwest spur. Keep the road as a
  // worn path network first; clearings and props are layered after the mask.
  markPath(roadMask, rows, [
    [55, 70],
    [53, 66],
    [56, 60],
    [51, 54],
    [48, 46],
    [55, 36],
    [53, 29],
    [58, 22],
    [57, 16],
    [54, 9],
    [55, 1]
  ], { width: 0, wobble: 1.25, seed: 3 });
  markPath(roadMask, rows, [
    [1, 36],
    [10, 35],
    [23, 39],
    [36, 37],
    [48, 36],
    [55, 36],
    [66, 33],
    [80, 36],
    [94, 33],
    [108, 35]
  ], { width: 0, wobble: 1.15, seed: 17 });
  markPath(roadMask, rows, [
    [55, 36],
    [63, 39],
    [68, 47],
    [64, 56],
    [55, 59],
    [48, 52],
    [42, 45],
    [48, 36],
    [55, 36]
  ], { width: 0, wobble: 0.95, seed: 31 });
  markPath(roadMask, rows, [
    [55, 36],
    [46, 32],
    [35, 27],
    [27, 20],
    [22, 17]
  ], { width: 0, wobble: 0.85, seed: 47 });
  clearRoadMaskBites(roadMask, rows);
  widenRoadPocket(roadMask, rows, 55, 36, 1, 1);
  widenRoadPocket(roadMask, rows, 55, 59, 1, 1);
  widenRoadPocket(roadMask, rows, 99, 14, 1, 1);
  widenRoadPocket(roadMask, rows, 55, 2, 1, 2);
  widenRoadPocket(roadMask, rows, 2, 36, 2, 1);
  widenRoadPocket(roadMask, rows, 55, 69, 1, 1);
  closeRoadMaskHoles(roadMask, rows);
  applyRoadMask(rows, roadMask);
  gladeDirtPocket(rows, 52, 37, 1, 1);
  gladeDirtPocket(rows, 58, 37, 1, 1);

  softenCanopyFringes(rows);
  plantCuttableGroves(rows);
  scatterForestDetails(rows);
  scatter(rows, "FabcBCHYz", "f", 14, 43);

  rows[70]![55] = "S";
  rows[1]![55] = "N";
  rows[36]![1] = "M";
  rows[35]![108] = "D";
  for (const [x, y] of [
    [11, 59],
    [99, 14],
    [96, 56],
    [61, 8],
    [66, 8],
    [13, 11],
    [90, 13],
    [40, 18],
    [16, 56],
    [88, 55],
    [70, 47],
    [58, 36],
    [81, 25],
    [86, 26],
    [86, 9],
    [90, 10],
    [46, 62],
    [64, 62],
    [34, 55],
    [73, 56],
    [24, 49],
    [15, 60],
    [90, 59],
    [42, 48],
    [71, 41],
    [16, 58],
    [88, 55],
    [48, 62],
    [24, 23],
    [68, 47],
    [29, 62],
    [66, 66]
  ]) {
    clearApproachPocket(rows, x, y);
  }
  clearGameplayPocket(rows, 96, 56, 4, 4);
  clearGameplayPocket(rows, 93, 47, 2, 2);
  gladeDirtPocket(rows, 58, 36, 2, 1);
  applyPoiScenePass(rows);
  applyNorthwoodArtSpecPass(rows);
  removeProceduralCliffWallpaper(rows);
  restoreCriticalRoadContracts(rows);
  rebuildThinRoadNetwork(rows);
  reinforcePoiSceneVocabulary(rows);
  reinforceArtSpecVocabulary(rows);
  pruneTinyWaterBodies(rows);
  reinforceWetBankVocabulary(rows);
  restoreDetailVocabularySamples(rows);
  normalizeRoadCharacters(rows);
  finalizePortalWangContracts(rows);
  restoreNorthwoodApproachContracts(rows);
  restoreNorthwoodRoadAndSpawnContracts(rows);
  normalizeCliffFragments(rows);
  reinforceLateDetailAndGroves(rows);
  restoreNorthwoodRoadAndSpawnContracts(rows);
  reinforceWetBankVocabulary(rows);
  topUpWalkableWetBanks(rows);
  reinforceArtSpecVocabulary(rows);
  restoreNorthwoodRoadAndSpawnContracts(rows);
  topUpWalkableWetBanks(rows);
  applyMockupDepthParityAccents(rows);
  restoreNorthwoodRoadAndSpawnContracts(rows);
  normalizeRoadCharacters(rows);
  finalizePortalWangContracts(rows);
  reinforceNarrowStairShafts(rows);
  constrainStairMouthsAndCliffFaces(rows);
  anchorStairTransitionsToPlateaus(rows);
  applyContinuousPlateauMassing(rows);
  constrainStairMouthsAndCliffFaces(rows);
  normalizeSolidCliffWallFillers(rows);
  restoreNorthwoodRoadAndSpawnContracts(rows);
  reinforcePoiSceneVocabulary(rows);
  restoreDetailVocabularySamples(rows);
  normalizeRoadCharacters(rows);
  finalizePortalWangContracts(rows);
  normalizeSolidCliffWallFillers(rows);
  applyAestheticParityRealignment(rows);
  normalizeSolidCliffWallFillers(rows);
  reinforceArtSpecVocabulary(rows);

  const legend = Object.fromEntries(tileDefs.filter((def) => def.char).map((def, index) => [def.char!, `forest:${index}`]));
  legend.f = legend.F;
  const layers = buildDepthLayers(rows, legend);
  const collision = rows.map((row) => row.map((char) => (tileDefs.find((def) => def.char === char)?.blocked ? 1 : 0)));
  const objects = buildStageObjects(rows);
  return {
    schema: "asset-forge/stage@1",
    name: "northwood",
    tileSize,
    cols: stageCols,
    rows: stageRows,
    tilesets: [{ name: "forest", image: "forest.png", manifest: "forest.tileset.json" }],
    layers,
    collision,
    objects,
    ascii: { legend, rows: rows.map((row) => row.join("")) }
  };
}

function buildDepthLayers(rows: string[][], legend: Record<string, string>): Array<{ name: string; type: "tile"; data: Array<Array<string | null>> }> {
  const overhead = new Set<string>(overheadChars);
  const fringe = new Set<string>([
    ...waterChars.filter((char) => char !== "~" && char !== "J"),
    ...protectedRoadChars,
    ...elevationChars,
    ...sceneChars,
    "d",
    "p",
    "r",
    "T",
    "K",
    "O"
  ]);
  const baseData = rows.map((row) =>
    row.map((char) => {
      if (waterChars.includes(char)) return legend["~"] ?? legend.F;
      if (char === "^" || char === "f") return legend.F;
      if (fringe.has(char) || overhead.has(char)) return legend.F;
      return legend[char] ?? legend.F;
    })
  );
  const fringeData = rows.map((row) => row.map((char) => (fringe.has(char) ? legend[char] ?? null : null)));
  const overheadData = rows.map((row) => row.map((char) => (overhead.has(char) ? legend[char] ?? null : null)));
  return [
    { name: "base", type: "tile", data: baseData },
    { name: "fringe", type: "tile", data: fringeData },
    { name: "overhead", type: "tile", data: overheadData }
  ];
}

function applyRestrainedElevationAccents(rows: string[][]): void {
  const accents: Array<{ x: number; y: number; length: number; stairs?: number }> = [
    { x: 20, y: 17, length: 7, stairs: 23 },
    { x: 58, y: 12, length: 8, stairs: 62 },
    { x: 93, y: 17, length: 7, stairs: 96 },
    { x: 12, y: 56, length: 6, stairs: 15 },
    { x: 61, y: 55, length: 8, stairs: 64 }
  ];

  for (const accent of accents) {
    for (let x = accent.x; x < accent.x + accent.length; x += 1) {
      if (!inBounds(x, accent.y) || rows[accent.y]![x] === "^" || waterChars.includes(rows[accent.y]![x]!)) continue;
      const isStair = accent.stairs !== undefined && isStairMouthColumn(x, accent.stairs);
      rows[accent.y - 1]![x] = isStair ? "m" : "L";
      rows[accent.y]![x] = isStair ? "m" : "q";
      if (inBounds(x, accent.y + 1) && !waterChars.includes(rows[accent.y + 1]![x]!)) rows[accent.y + 1]![x] = isStair ? "m" : "o";
    }
  }
}

function applyMockupDepthParityAccents(rows: string[][]): void {
  const ledges: Array<{ x: number; y: number; runs: number[]; stairs?: number; seed: number }> = [
    { x: 19, y: 16, runs: [5, 4], stairs: 22, seed: 31 },
    { x: 58, y: 11, runs: [6, 4], stairs: 62, seed: 37 },
    { x: 91, y: 16, runs: [6, 4], stairs: 96, seed: 41 },
    { x: 12, y: 55, runs: [4, 3], stairs: 15, seed: 43 },
    { x: 62, y: 54, runs: [6, 4], stairs: 64, seed: 47 },
    { x: 92, y: 55, runs: [6, 4], stairs: 96, seed: 53 }
  ];

  for (const ledge of ledges) {
    for (let row = 0; row < ledge.runs.length; row += 1) {
      const length = ledge.runs[row]!;
      const y = ledge.y + row;
      const x0 = ledge.x + row + (mod(hash(ledge.seed, y), 3) - 1);
      for (let x = x0; x < x0 + length; x += 1) {
        const isStairs = ledge.stairs !== undefined && isStairMouthColumn(x, ledge.stairs);
        stampElevationColumn(rows, x, y, isStairs, ledge.seed);
      }
    }
  }
}

function stampElevationColumn(rows: string[][], x: number, y: number, stairs: boolean, seed: number): void {
  if (!canStampElevation(rows, x, y - 1) || !canStampElevation(rows, x, y) || !canStampElevation(rows, x, y + 1)) return;
  if (stairs) {
    rows[y - 1]![x] = "m";
    rows[y]![x] = "m";
    rows[y + 1]![x] = "m";
    return;
  }
  rows[y - 1]![x] = "L";
  rows[y]![x] = "q";
  rows[y + 1]![x] = mod(hash(x + seed, y - seed), 5) === 0 ? "q" : "o";
}

function canStampElevation(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  return !protectedRoadChars.includes(tile) && !waterChars.includes(tile) && tile !== "^" && tile !== "f" && tile !== "S" && tile !== "N" && tile !== "M" && tile !== "D";
}

function removeProceduralCliffWallpaper(rows: string[][]): void {
  for (let y = 1; y < stageRows - 1; y += 1) {
    let runStart = -1;
    for (let x = 1; x < stageCols - 1; x += 1) {
      const isCliff = elevationChars.includes(rows[y]![x]!);
      if (isCliff && runStart < 0) runStart = x;
      if ((!isCliff || x === stageCols - 2) && runStart >= 0) {
        const runEnd = isCliff && x === stageCols - 2 ? x : x - 1;
        if (runEnd - runStart + 1 > 12) {
          for (let cx = runStart; cx <= runEnd; cx += 1) rows[y]![cx] = "F";
        }
        runStart = -1;
      }
    }
  }
}

function enforceContinuousCliffRidges(rows: string[][]): void {
  const terraceRuns = [
    { y: 19, x1: 8, x2: 32, stairs: [22], seed: 11 },
    { y: 18, x1: 42, x2: 67, stairs: [55], seed: 17 },
    { y: 20, x1: 76, x2: 104, stairs: [92], seed: 23 },
    { y: 53, x1: 8, x2: 28, stairs: [16], seed: 31 },
    { y: 56, x1: 34, x2: 66, stairs: [39, 56], seed: 37 },
    { y: 54, x1: 74, x2: 103, stairs: [88, 96], seed: 43 }
  ];

  for (const run of terraceRuns) {
    for (let x = run.x1; x <= run.x2; x += 1) {
      const y = run.y + (mod(hash(x + run.seed, run.y - run.seed), 9) === 0 ? 1 : 0);
      if (!inBounds(x, y) || rows[y]![x] === "^" || waterChars.includes(rows[y]![x]!)) continue;
      const stairMouth = run.stairs.some((sx) => isStairMouthColumn(x, sx));
      rows[y - 1]![x] = stairMouth ? "m" : "L";
      rows[y]![x] = stairMouth ? "m" : "q";
      if (inBounds(x, y + 1) && !waterChars.includes(rows[y + 1]![x]!)) rows[y + 1]![x] = stairMouth ? "m" : "o";
    }
  }
}

function applyVisibleCompositionPass(rows: string[][]): void {
  stripLinearCliffBands(rows);
  const terraces = [
    { cx: 17, cy: 18, rx: 16, ry: 7, stairs: [22], seed: 11 },
    { cx: 53, cy: 17, rx: 19, ry: 8, stairs: [55], seed: 17 },
    { cx: 91, cy: 19, rx: 20, ry: 7, stairs: [92], seed: 23 },
    { cx: 17, cy: 53, rx: 16, ry: 7, stairs: [16], seed: 31 },
    { cx: 50, cy: 56, rx: 24, ry: 9, stairs: [39, 56], seed: 37 },
    { cx: 90, cy: 54, rx: 19, ry: 8, stairs: [88, 96], seed: 43 }
  ];

  for (const terrace of terraces) {
    stampTerraceCluster(rows, terrace.cx, terrace.cy, terrace.rx, terrace.ry, terrace.stairs, terrace.seed);
  }

  stampMaterialField(rows, 55, 39, 7, 4, "s", "R");
  stampMaterialField(rows, 25, 20, 7, 4, "R", "n");
  stampMaterialField(rows, 15, 59, 7, 4, "G", "B");
  stampMaterialField(rows, 99, 14, 7, 4, "K", "O");
  stampMaterialField(rows, 96, 56, 7, 4, "s", "G");
  stampMaterialField(rows, 63, 8, 7, 3, "K", "O");

  stampWalkwayRun(rows, [
    [50, 40], [51, 40], [52, 40], [53, 40], [54, 40], [55, 40], [56, 40], [57, 40], [58, 40], [59, 40], [60, 40],
    [54, 38], [55, 38], [56, 38],
    [14, 58], [15, 58], [16, 58], [17, 58], [18, 58],
    [93, 55], [94, 55], [95, 55], [96, 55], [97, 55], [98, 55], [99, 55]
  ]);
  enrichMockupVegetation(rows);
}

function stripLinearCliffBands(rows: string[][]): void {
  for (const y of [18, 19, 20, 54, 55, 56]) {
    let runStart = -1;
    for (let x = 1; x < stageCols - 1; x += 1) {
      const isCliff = elevationChars.includes(rows[y]![x]!);
      if (isCliff && runStart < 0) runStart = x;
      if ((!isCliff || x === stageCols - 2) && runStart >= 0) {
        const runEnd = isCliff && x === stageCols - 2 ? x : x - 1;
        if (runEnd - runStart + 1 >= 34) {
          for (let cx = runStart; cx <= runEnd; cx += 1) {
            if (!waterChars.includes(rows[y]![cx]!)) rows[y]![cx] = "F";
          }
        }
        runStart = -1;
      }
    }
  }
}

function stampTerraceCluster(rows: string[][], cx: number, cy: number, rx: number, ry: number, stairs: number[], seed: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    const dy = y - cy;
    const curve = Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    const left = Math.round(cx - rx * curve + Math.sin((y + seed) * 0.35) * 2);
    const right = Math.round(cx + rx * curve + Math.cos((y - seed) * 0.29) * 2);
    if (right - left < 7) continue;
    const faceY = y;
    for (let x = left; x <= right; x += 1) {
      if (!inBounds(x, faceY) || rows[faceY]![x] === "^" || waterChars.includes(rows[faceY]![x]!)) continue;
      const edgeChip = mod(hash(x + seed, y - seed), 13) === 0;
      if (edgeChip && (x < left + 3 || x > right - 3)) continue;
      const stairMouth = stairs.some((sx) => isStairMouthColumn(x, sx)) && Math.abs(y - cy) <= 2;
      if (stairMouth) {
        rows[faceY - 1]![x] = "m";
        rows[faceY]![x] = "m";
        if (inBounds(x, faceY + 1)) rows[faceY + 1]![x] = "m";
      } else if (Math.abs(y - cy) <= 1 || mod(hash(x - seed, y + seed), 7) <= 2) {
        rows[faceY - 1]![x] = "L";
        rows[faceY]![x] = "q";
        if (inBounds(x, faceY + 1) && !waterChars.includes(rows[faceY + 1]![x]!)) rows[faceY + 1]![x] = "o";
      }
    }
  }

  for (const sx of stairs) {
    for (let y = cy - 3; y <= cy + 4; y += 1) {
      for (let x = sx; x <= sx + 1; x += 1) {
        if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
        rows[y]![x] = "m";
      }
    }
    for (let x = sx - 3; x <= sx + 3; x += 1) {
      if (inBounds(x, cy - 4) && !waterChars.includes(rows[cy - 4]![x]!)) rows[cy - 4]![x] = "L";
      if (inBounds(x, cy + 5) && !waterChars.includes(rows[cy + 5]![x]!)) rows[cy + 5]![x] = "d";
    }
  }
}

function isStairMouthColumn(x: number, sx: number): boolean {
  return x === sx || x === sx + 1;
}

function constrainStairMouthsAndCliffFaces(rows: string[][]): void {
  for (let y = 1; y < stageRows - 1; y += 1) {
    let runStart = -1;
    for (let x = 1; x < stageCols - 1; x += 1) {
      const isStair = rows[y]![x] === "m";
      if (isStair && runStart < 0) runStart = x;
      if ((!isStair || x === stageCols - 2) && runStart >= 0) {
        const runEnd = isStair && x === stageCols - 2 ? x : x - 1;
        for (let sx = runStart + 2; sx <= runEnd; sx += 1) {
          rows[y]![sx] = rows[y - 1]?.[sx] === "L" ? "q" : "o";
        }
        runStart = -1;
      }
    }
  }

  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "m") continue;
      const left = rows[y]![x - 1]!;
      const right = rows[y]![x + 1]!;
      if (left !== "m" && canConvertToStairSideCliff(rows, x - 1, y)) rows[y]![x - 1] = y > 1 && rows[y - 1]?.[x - 1] === "L" ? "q" : "o";
      if (right !== "m" && canConvertToStairSideCliff(rows, x + 1, y)) rows[y]![x + 1] = y > 1 && rows[y - 1]?.[x + 1] === "L" ? "q" : "o";
      if (canConvertToStairSideCliff(rows, x - 1, y - 1)) rows[y - 1]![x - 1] = rows[y - 2]?.[x - 1] === "L" ? "q" : "L";
      if (canConvertToStairSideCliff(rows, x + 1, y - 1)) rows[y - 1]![x + 1] = rows[y - 2]?.[x + 1] === "L" ? "q" : "L";
    }
  }
}

function normalizeSolidCliffWallFillers(rows: string[][]): void {
  const cliffTiles = new Set(["L", "q", "o", "m"]);

  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "L") continue;
      const above = rows[y - 1]?.[x] ?? "";
      if (!cliffTiles.has(above)) continue;
      const below = rows[y + 1]?.[x] ?? "";
      rows[y]![x] = cliffTiles.has(below) ? "q" : "o";
    }
  }

  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "L") continue;
      const below = rows[y + 1]?.[x] ?? "";
      if (!canConvertToStairSideCliff(rows, x, y + 1)) continue;
      if (below !== "q" && below !== "o" && below !== "m") rows[y + 1]![x] = "q";
    }
  }

  for (let y = 1; y < stageRows - 2; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "q") continue;
      const below = rows[y + 1]?.[x] ?? "";
      if (!canConvertToStairSideCliff(rows, x, y + 1) || cliffTiles.has(below)) continue;
      rows[y + 1]![x] = "o";
    }
  }
}

function applyAestheticParityRealignment(rows: string[][]): void {
  jagCliffLips(rows);
  featherRoadShoulders(rows);
  densifyForestClusters(rows);
  scatterFieldMicroDetails(rows);
}

function jagCliffLips(rows: string[][]): void {
  for (let y = 2; y < stageRows - 3; y += 1) {
    let runStart = -1;
    for (let x = 1; x < stageCols - 1; x += 1) {
      const lip = rows[y]![x] === "L";
      if (lip && runStart < 0) runStart = x;
      if ((!lip || x === stageCols - 2) && runStart >= 0) {
        const runEnd = lip && x === stageCols - 2 ? x : x - 1;
        const length = runEnd - runStart + 1;
        if (length >= 8) {
          for (let cx = runStart + 4; cx <= runEnd - 2; cx += 2) {
            if (mod(hash(cx + y * 13, y - cx * 7), 5) === 0) offsetCliffLip(rows, cx, y, -1);
            if (mod(hash(cx - y * 17, y + cx * 11), 7) === 0) offsetCliffLip(rows, cx, y, 1);
          }
        }
        runStart = -1;
      }
    }
  }
}

function offsetCliffLip(rows: string[][], x: number, y: number, dy: -1 | 1): void {
  const targetY = y + dy;
  if (!inBounds(x, targetY) || !canConvertToStairSideCliff(rows, x, targetY)) return;
  if (protectedRoadChars.includes(rows[targetY]![x]!) || waterChars.includes(rows[targetY]![x]!)) return;
  rows[y]![x] = dy < 0 ? "q" : "o";
  rows[targetY]![x] = "L";
  if (canConvertToStairSideCliff(rows, x, targetY + 1)) rows[targetY + 1]![x] = "q";
  if (canConvertToStairSideCliff(rows, x, targetY + 2)) rows[targetY + 2]![x] = "o";
}

function featherRoadShoulders(rows: string[][]): void {
  const roadSet = new Set(protectedRoadChars);
  for (let y = 2; y < stageRows - 2; y += 1) {
    for (let x = 2; x < stageCols - 2; x += 1) {
      const tile = rows[y]![x]!;
      if (!"Fabc".includes(tile)) continue;
      if (!nearTerrainChar(rows, x, y, roadSet, 1)) continue;
      if (isWaterProtected(rows, x, y, 1) || isElevationProtected(rows, x, y, 1)) continue;
      const noise = mod(hash(x + 307, y - 193), 9);
      if (noise <= 2) rows[y]![x] = "d";
      else if (noise <= 5) rows[y]![x] = "B";
      else if (noise === 6) rows[y]![x] = "l";
    }
  }
}

function densifyForestClusters(rows: string[][]): void {
  const anchors: Array<[number, number, number, number, number]> = [
    [12, 13, 7, 5, 101],
    [32, 16, 9, 5, 103],
    [84, 18, 10, 5, 107],
    [88, 14, 9, 5, 109],
    [18, 61, 10, 6, 113],
    [43, 63, 12, 5, 127],
    [74, 60, 12, 6, 131],
    [98, 50, 10, 6, 137],
    [89, 31, 9, 5, 139]
  ];
  for (const [cx, cy, rx, ry, seed] of anchors) {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        if (!inBounds(x, y) || !"FabcBCHYzeil".includes(rows[y]![x]!)) continue;
        if (isRoadProtected(rows, x, y, 3) || isWaterProtected(rows, x, y, 2) || isElevationProtected(rows, x, y, 1)) continue;
        const nx = rx === 0 ? 0 : (x - cx) / rx;
        const ny = ry === 0 ? 0 : (y - cy) / ry;
        const falloff = nx * nx + ny * ny;
        if (falloff < 0.68 && mod(hash(x + seed, y - seed), 6) !== 0) rows[y]![x] = "f";
        else if (falloff < 0.98 && mod(hash(x - seed, y + seed), 4) === 0) rows[y]![x] = detailChars[mod(hash(x, y), detailChars.length)]!;
      }
    }
  }
}

function scatterFieldMicroDetails(rows: string[][]): void {
  for (let y = 3; y < stageRows - 3; y += 2) {
    for (let x = 3; x < stageCols - 3; x += 2) {
      if (!"Fabc".includes(rows[y]![x]!)) continue;
      if (isRoadProtected(rows, x, y, 2) || isWaterProtected(rows, x, y, 1) || isElevationProtected(rows, x, y, 1)) continue;
      const noise = mod(hash(x + 401, y - 271), 17);
      if (noise <= 1) rows[y]![x] = "Y";
      else if (noise === 2) rows[y]![x] = "C";
      else if (noise === 3) rows[y]![x] = "e";
      else if (noise === 4) rows[y]![x] = "l";
    }
  }
}

function canConvertToStairSideCliff(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  return tile !== "m" && !protectedRoadChars.includes(tile) && !waterChars.includes(tile) && tile !== "^" && tile !== "f" && tile !== "S" && tile !== "N" && tile !== "M" && tile !== "D";
}

function reinforceNarrowStairShafts(rows: string[][]): void {
  const shafts: Array<{ x: number; y: number; height: number }> = [
    { x: 22, y: 16, height: 4 },
    { x: 62, y: 12, height: 4 },
    { x: 96, y: 15, height: 5 },
    { x: 64, y: 54, height: 4 }
  ];

  for (const shaft of shafts) {
    for (let y = shaft.y; y < shaft.y + shaft.height; y += 1) {
      for (let x = shaft.x; x <= shaft.x + 1; x += 1) {
        if (canConvertToStairSideCliff(rows, x, y)) {
          rows[y]![x] = "m";
        }
      }
      for (const [x, tile] of [
        [shaft.x - 1, y === shaft.y ? "L" : y >= shaft.y + shaft.height - 1 ? "o" : "q"],
        [shaft.x + 2, y === shaft.y ? "L" : y >= shaft.y + shaft.height - 1 ? "o" : "q"]
      ] as Array<[number, string]>) {
        if (canConvertToStairSideCliff(rows, x, y)) rows[y]![x] = tile;
      }
    }
    stampStairTransitionAnchor(rows, shaft.x, shaft.x + 1, shaft.y, shaft.y + shaft.height - 1);
  }
}

function anchorStairTransitionsToPlateaus(rows: string[][]): void {
  const seen = new Set<string>();
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "m" || rows[y - 1]?.[x] === "m" || rows[y]?.[x - 1] === "m" || seen.has(`${x},${y}`)) continue;
      let x2 = x;
      while (rows[y]?.[x2 + 1] === "m") x2 += 1;
      let bottomY = y;
      while (bottomY + 1 < stageRows - 1) {
        let nextRowContinues = true;
        for (let sx = x; sx <= x2; sx += 1) {
          if (rows[bottomY + 1]?.[sx] !== "m") nextRowContinues = false;
        }
        if (!nextRowContinues) break;
        bottomY += 1;
      }
      for (let sy = y; sy <= bottomY; sy += 1) {
        for (let sx = x; sx <= x2; sx += 1) seen.add(`${sx},${sy}`);
      }
      stampStairTransitionAnchor(rows, x, x2, y, bottomY);
    }
  }
}

function stampStairTransitionAnchor(rows: string[][], x1: number, x2: number, topY: number, bottomY: number): void {
  const left = Math.max(1, x1 - 2);
  const right = Math.min(stageCols - 2, x2 + 2);

  for (let y = topY - 3; y <= topY - 1; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (!canConvertToAnchoredWalkable(rows, x, y)) continue;
      rows[y]![x] = y === topY - 1 ? "L" : mod(hash(x + topY, y - bottomY), 5) === 0 ? "a" : "F";
    }
  }

  for (let y = topY; y <= Math.min(bottomY, topY + 1); y += 1) {
    for (const [startX, endX] of [
      [left, x1 - 1],
      [x2 + 1, right]
    ] as Array<[number, number]>) {
      for (let x = startX; x <= endX; x += 1) {
      if (!canConvertToStairSideCliff(rows, x, y)) continue;
      rows[y]![x] = y === topY ? "q" : "o";
      }
    }
  }

  for (let y = bottomY + 1; y <= bottomY + 2; y += 1) {
    for (let x = x1 - 2; x <= x2 + 3; x += 1) {
      if (rows[y]?.[x - 1] === "m" || rows[y]?.[x + 1] === "m") continue;
      if (!canConvertToAnchoredWalkable(rows, x, y)) continue;
      rows[y]![x] = mod(hash(x - topY, y + bottomY), 4) === 0 ? "d" : "F";
    }
  }
}

function applyContinuousPlateauMassing(rows: string[][]): void {
  for (const transition of findStairTransitions(rows)) {
    stampContinuousPlateauMass(rows, transition.x1, transition.x2, transition.topY, transition.bottomY);
  }
}

function findStairTransitions(rows: string[][]): Array<{ x1: number; x2: number; topY: number; bottomY: number }> {
  const transitions: Array<{ x1: number; x2: number; topY: number; bottomY: number }> = [];
  const seen = new Set<string>();
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "m" || rows[y - 1]?.[x] === "m" || rows[y]?.[x - 1] === "m" || seen.has(`${x},${y}`)) continue;
      let x2 = x;
      while (rows[y]?.[x2 + 1] === "m") x2 += 1;
      let bottomY = y;
      while (bottomY + 1 < stageRows - 1) {
        let nextRowContinues = true;
        for (let sx = x; sx <= x2; sx += 1) {
          if (rows[bottomY + 1]?.[sx] !== "m") nextRowContinues = false;
        }
        if (!nextRowContinues) break;
        bottomY += 1;
      }
      for (let sy = y; sy <= bottomY; sy += 1) {
        for (let sx = x; sx <= x2; sx += 1) seen.add(`${sx},${sy}`);
      }
      transitions.push({ x1: x, x2, topY: y, bottomY });
    }
  }
  return transitions;
}

function stampContinuousPlateauMass(rows: string[][], x1: number, x2: number, topY: number, bottomY: number): void {
  const centerX = Math.floor((x1 + x2) / 2);
  const left = Math.max(1, x1 - 11);
  const right = Math.min(stageCols - 2, x2 + 11);
  const upperTop = Math.max(1, topY - 11);
  const upperBottom = Math.max(1, topY - 1);

  for (let y = upperTop; y <= upperBottom; y += 1) {
    const distanceFromLip = upperBottom - y;
    const organicInset = Math.max(0, Math.floor(distanceFromLip / 4) - (mod(hash(centerX + y, topY - y), 3) === 0 ? 1 : 0));
    for (let x = left + organicInset; x <= right - organicInset; x += 1) {
      if (!canConvertToPlateauSurface(rows, x, y)) continue;
      rows[y]![x] = plateauSurfaceChar(x, y, centerX, topY);
    }
  }

  for (const side of [
    { start: Math.max(1, x1 - 10), end: x1 - 1 },
    { start: x2 + 1, end: Math.min(stageCols - 2, x2 + 10) }
  ]) {
    for (let x = side.start; x <= side.end; x += 1) {
      const y = topY + (mod(hash(x + topY, bottomY - x), 11) === 0 ? 1 : 0);
      if (canConvertToStairSideCliff(rows, x, y - 1)) rows[y - 1]![x] = "L";
      if (canConvertToStairSideCliff(rows, x, y)) rows[y]![x] = "q";
      if (canConvertToStairSideCliff(rows, x, y + 1) && mod(hash(x - topY, y + bottomY), 5) !== 0) rows[y + 1]![x] = "o";
    }
  }

  for (let y = bottomY + 1; y <= Math.min(stageRows - 2, bottomY + 2); y += 1) {
    for (let x = x1 - 3; x <= x2 + 4; x += 1) {
      if (!canConvertToAnchoredWalkable(rows, x, y)) continue;
      rows[y]![x] = mod(hash(x - topY, y + bottomY), 4) === 0 ? "d" : "F";
    }
  }
}

function canConvertToPlateauSurface(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  if (sceneChars.includes(tile) || tile === "T" || tile === "K" || tile === "O") return false;
  return !protectedRoadChars.includes(tile) && !waterChars.includes(tile) && tile !== "^" && tile !== "f" && tile !== "S" && tile !== "N" && tile !== "M" && tile !== "D";
}

function plateauSurfaceChar(x: number, y: number, centerX: number, topY: number): string {
  const noise = mod(hash(x + centerX * 3, y - topY * 5), 9);
  if (noise <= 1) return "a";
  if (noise === 2) return "b";
  if (noise === 3) return "c";
  return "F";
}

function canConvertToAnchoredWalkable(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  if (sceneChars.includes(tile) || tile === "T" || tile === "K" || tile === "O") return false;
  return tile !== "m" && !protectedRoadChars.includes(tile) && !waterChars.includes(tile) && tile !== "^" && tile !== "f" && tile !== "S" && tile !== "N" && tile !== "M" && tile !== "D";
}

function enrichMockupVegetation(rows: string[][]): void {
  const clusters: Array<[number, number, number, number, string, number]> = [
    [10, 22, 8, 4, "Y", 3],
    [34, 18, 9, 5, "C", 5],
    [76, 15, 10, 5, "i", 7],
    [96, 23, 8, 4, "Y", 11],
    [24, 55, 9, 5, "e", 13],
    [70, 56, 11, 5, "l", 17],
    [91, 48, 9, 5, "C", 19],
    [50, 32, 8, 4, "Y", 23]
  ];
  for (const [cx, cy, rx, ry, char, seed] of clusters) {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        if (!inBounds(x, y) || rows[y]![x] !== "F") continue;
        if (isRoadProtected(rows, x, y, 2) || isWaterProtected(rows, x, y, 1)) continue;
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny < 0.72 && mod(hash(x + seed, y - seed), 5) <= 2) rows[y]![x] = char;
      }
    }
  }
}

function stampMaterialField(rows: string[][], cx: number, cy: number, rx: number, ry: number, ground: string, accent: string): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y)) continue;
      const tile = rows[y]![x]!;
      if (protectedRoadChars.includes(tile) || waterChars.includes(tile) || tile === "^" || tile === "f") continue;
      if (tile === "q" || tile === "o" || tile === "m") continue;
      const nx = rx === 0 ? 0 : (x - cx) / rx;
      const ny = ry === 0 ? 0 : (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      rows[y]![x] = mod(hash(x + cx * 13, y - cy * 7), 6) === 0 ? accent : ground;
    }
  }
}

function restoreCriticalRoadContracts(rows: string[][]): void {
  const samples: Array<[number, number]> = [
    [55, 9],
    [48, 36],
    [64, 40],
    [68, 49],
    [62, 57],
    [49, 51],
    [43, 44]
  ];
  for (const [x, y] of samples) {
    if (inBounds(x, y) && rows[y]![x] !== "q" && rows[y]![x] !== "o" && rows[y]![x] !== "^") rows[y]![x] = "t";
  }
  if (inBounds(96, 32)) rows[32]![96] = "F";
  for (let x = 95; x <= 108; x += 1) {
    if (inBounds(x, 33)) rows[33]![x] = "$";
    if (inBounds(x, 34)) rows[34]![x] = "t";
  }
  for (let x = 95; x <= 107; x += 1) {
    if (inBounds(x, 35)) rows[35]![x] = "t";
  }
  for (let x = 54; x <= 56; x += 1) {
    if (inBounds(x, 69)) rows[69]![x] = "t";
  }
  if (inBounds(54, 70)) rows[70]![54] = "t";
  if (inBounds(56, 70)) rows[70]![56] = "t";
}

function rebuildThinRoadNetwork(rows: string[][]): void {
  const roadMask = Array.from({ length: stageRows }, () => Array.from({ length: stageCols }, () => false));
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (protectedRoadChars.includes(rows[y]![x]!)) rows[y]![x] = "F";
    }
  }

  markPath(roadMask, rows, [
    [55, 70], [54, 62], [56, 54], [52, 45], [55, 36], [53, 29], [57, 22], [55, 14], [55, 1]
  ], { width: 0, wobble: 0.55, seed: 103 });
  markPath(roadMask, rows, [
    [1, 36], [12, 35], [24, 38], [36, 37], [48, 36], [55, 36], [66, 34], [80, 36], [94, 33], [108, 35]
  ], { width: 0, wobble: 0.45, seed: 117 });
  markPath(roadMask, rows, [
    [55, 36], [64, 40], [68, 49], [62, 57], [49, 51], [43, 44], [48, 36], [55, 36]
  ], { width: 0, wobble: 0.45, seed: 131 });
  markPath(roadMask, rows, [
    [55, 36], [46, 32], [35, 27], [27, 20], [22, 17]
  ], { width: 0, wobble: 0.45, seed: 147 });

  for (const [x, y] of [
    [55, 9], [48, 36], [64, 40], [68, 49], [62, 57], [49, 51], [43, 44],
    [55, 70], [55, 1], [1, 36], [108, 35]
  ] as Array<[number, number]>) {
    if (inBounds(x, y) && !waterChars.includes(rows[y]![x]!) && !isElevationProtected(rows, x, y, 0)) roadMask[y]![x] = true;
  }

  widenRoadPocket(roadMask, rows, 55, 36, 1, 1);
  widenRoadPocket(roadMask, rows, 55, 70, 1, 1);
  widenRoadPocket(roadMask, rows, 55, 1, 1, 1);
  widenRoadPocket(roadMask, rows, 1, 36, 1, 1);
  widenRoadPocket(roadMask, rows, 108, 35, 1, 1);
  applyRoadMask(rows, roadMask);
  rows[70]![55] = "S";
  rows[1]![55] = "N";
  rows[36]![1] = "M";
  rows[35]![108] = "D";
}

function normalizeRoadCharacters(rows: string[][]): void {
  const roadMask = rows.map((row) => row.map((char) => protectedRoadChars.includes(char)));
  const portalChars = new Set(["S", "N", "M", "D"]);
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (!roadMask[y]![x] || portalChars.has(rows[y]![x]!)) continue;
      rows[y]![x] = roadCharForMask(cornerWangMask(roadMask, x, y));
    }
  }
}

function finalizePortalWangContracts(rows: string[][]): void {
  if (inBounds(108, 34)) rows[34]![108] = "$";
  if (inBounds(107, 35)) rows[35]![107] = "k";
  if (inBounds(54, 70)) rows[70]![54] = "k";
}

function restoreNorthwoodApproachContracts(rows: string[][]): void {
  const required: Array<[number, number, string]> = [
    [11, 59, "G"],
    [99, 14, "K"],
    [96, 56, "s"],
    [61, 8, "K"],
    [66, 8, "K"]
  ];
  for (const [cx, cy, char] of required) {
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
        rows[y]![x] = char;
      }
    }
  }
}

function restoreNorthwoodRoadAndSpawnContracts(rows: string[][]): void {
  for (const [x, y] of [
    [55, 9],
    [48, 36],
    [64, 40],
    [68, 49],
    [62, 57],
    [49, 51],
    [43, 44]
  ] as Array<[number, number]>) {
    if (inBounds(x, y) && !waterChars.includes(rows[y]![x]!) && rows[y]![x] !== "^") rows[y]![x] = "t";
  }

  for (const [cx, cy] of [
    [64, 62],
    [15, 60],
    [67, 13],
    [81, 25],
    [74, 11],
    [90, 13],
    [86, 26],
    [86, 9],
    [90, 10],
    [24, 23],
    [68, 47],
    [71, 41],
    [42, 48],
    [46, 62],
    [48, 62],
    [57, 53],
    [66, 66],
    [29, 62],
    [73, 56],
    [88, 55],
    [90, 59]
  ] as Array<[number, number]>) {
    for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        if (!inBounds(x, y) || protectedRoadChars.includes(rows[y]![x]!) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
        rows[y]![x] = "F";
      }
    }
  }
}

function normalizeCliffFragments(rows: string[][]): void {
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (rows[y]![x] !== "q") continue;
      const west = rows[y]?.[x - 1] ?? "";
      const east = rows[y]?.[x + 1] ?? "";
      if (!"qom".includes(west) || !"qom".includes(east)) rows[y]![x] = "o";
    }
  }
}

function reinforceLateDetailAndGroves(rows: string[][]): void {
  let detailCount = rows.flat().filter((tile) => detailChars.includes(tile as (typeof detailChars)[number])).length;
  for (let y = 3; y < stageRows - 3 && detailCount < 145; y += 2) {
    for (let x = 3; x < stageCols - 3 && detailCount < 145; x += 2) {
      if (rows[y]![x] !== "F") continue;
      if (isRoadProtected(rows, x, y, 2) || isWaterProtected(rows, x, y, 1) || isElevationProtected(rows, x, y, 1)) continue;
      const char = detailChars[mod(hash(x + 211, y - 149), detailChars.length)]!;
      rows[y]![x] = char;
      detailCount += 1;
    }
  }

  for (const [cx, cy, seed] of [
    [12, 9, 3],
    [31, 10, 5],
    [88, 12, 7],
    [19, 64, 11],
    [72, 62, 13],
    [98, 42, 17],
    [36, 64, 19]
  ] as Array<[number, number, number]>) {
    for (let y = cy - 2; y <= cy + 2; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        if (!inBounds(x, y) || !"FabcBCHYzeil".includes(rows[y]![x]!)) continue;
        if (isRoadProtected(rows, x, y, 3) || isWaterProtected(rows, x, y, 2) || isElevationProtected(rows, x, y, 1)) continue;
        if (mod(hash(x + seed, y - seed), 4) !== 0) rows[y]![x] = "f";
      }
    }
  }
}

function reinforcePoiSceneVocabulary(rows: string[][]): void {
  const patches: Array<{ cx: number; cy: number; rx: number; ry: number; char: string }> = [
    { cx: 55, cy: 39, rx: 4, ry: 2, char: "s" },
    { cx: 25, cy: 20, rx: 4, ry: 2, char: "R" },
    { cx: 15, cy: 59, rx: 4, ry: 2, char: "G" },
    { cx: 99, cy: 14, rx: 4, ry: 2, char: "R" },
    { cx: 96, cy: 56, rx: 4, ry: 2, char: "s" },
    { cx: 63, cy: 8, rx: 4, ry: 2, char: "G" }
  ];
  for (const patch of patches) {
    for (let y = patch.cy - patch.ry; y <= patch.cy + patch.ry; y += 1) {
      for (let x = patch.cx - patch.rx; x <= patch.cx + patch.rx; x += 1) {
        if (!inBounds(x, y) || protectedRoadChars.includes(rows[y]![x]!) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
        if (elevationChars.includes(rows[y]![x]!) || rows[y]![x] === "T" || rows[y]![x] === "K" || rows[y]![x] === "O") continue;
        if (Math.abs(x - patch.cx) + Math.abs(y - patch.cy) <= patch.rx + 1) rows[y]![x] = patch.char;
      }
    }
  }
}

function reinforceArtSpecVocabulary(rows: string[][]): void {
  const walkways: Array<[number, number]> = [
    [52, 39], [53, 39], [54, 39], [55, 39], [56, 39], [57, 39], [58, 39],
    [52, 40], [53, 40], [54, 40], [55, 40], [56, 40], [57, 40], [58, 40],
    [13, 59], [14, 59], [15, 59], [16, 59], [17, 60],
    [13, 60], [14, 60], [16, 60],
    [94, 56], [95, 56], [96, 56], [97, 56], [98, 57], [95, 57], [96, 57],
    [61, 8], [62, 8], [63, 8], [64, 8], [65, 8], [66, 8], [62, 9], [65, 9]
  ];
  const gravels: Array<[number, number]> = [
    [101, 11], [98, 13], [99, 13], [100, 13], [98, 14], [100, 14], [99, 15], [101, 15], [100, 16], [101, 16],
    [61, 8], [62, 8], [64, 8], [65, 8], [63, 9], [64, 9],
    [24, 20], [25, 20], [26, 20], [24, 21], [26, 21], [27, 21],
    [10, 58], [11, 58], [12, 58], [10, 59], [12, 59], [11, 60]
  ];
  const seams: Array<[number, number]> = [
    [101, 12], [102, 12], [102, 13],
    [63, 6], [64, 6], [65, 6],
    [22, 18], [23, 18], [24, 18]
  ];
  for (const [x, y] of walkways) forceArtSpecTile(rows, x, y, "T");
  for (const [x, y] of gravels) forceArtSpecTile(rows, x, y, "K");
  for (const [x, y] of seams) forceArtSpecTile(rows, x, y, "O");
}

function forceArtSpecTile(rows: string[][], x: number, y: number, char: "T" | "K" | "O"): void {
  if (!inBounds(x, y)) return;
  const existing = rows[y]![x]!;
  if (protectedRoadChars.includes(existing) || waterChars.includes(existing) || existing === "^" || existing === "f" || existing === "q" || existing === "o" || existing === "m") return;
  rows[y]![x] = char;
}

function restoreDetailVocabularySamples(rows: string[][]): void {
  const samples: Array<[number, number, (typeof detailChars)[number]]> = [
    [70, 48, "Y"],
    [31, 31, "e"],
    [85, 40, "i"],
    [102, 25, "l"]
  ];
  for (const [x, y, char] of samples) {
    if (!inBounds(x, y)) continue;
    const existing = rows[y]![x]!;
    if (protectedRoadChars.includes(existing) || waterChars.includes(existing) || elevationChars.includes(existing) || sceneChars.includes(existing) || existing === "^" || existing === "f") continue;
    rows[y]![x] = char;
  }
}

function reinforceWetBankVocabulary(rows: string[][]): void {
  let wetBanks = rows.flat().filter((tile) => tile === "p").length;
  if (wetBanks > 34) return;
  const waterSet = new Set(waterChars);
  for (let y = 2; y < stageRows - 2 && wetBanks <= 34; y += 1) {
    for (let x = 2; x < stageCols - 2 && wetBanks <= 34; x += 1) {
      const tile = rows[y]![x]!;
      if (protectedRoadChars.includes(tile) || waterChars.includes(tile) || elevationChars.includes(tile) || sceneChars.includes(tile) || tile === "^" || tile === "f") continue;
      if (!nearTerrainChar(rows, x, y, waterSet, 2)) continue;
      rows[y]![x] = "p";
      wetBanks += 1;
    }
  }
}

function topUpWalkableWetBanks(rows: string[][]): void {
  const waterSet = new Set(waterChars);
  let wetBanks = rows.flat().filter((tile) => tile === "p").length;
  for (let y = 2; y < stageRows - 2 && wetBanks <= 34; y += 1) {
    for (let x = 2; x < stageCols - 2 && wetBanks <= 34; x += 1) {
      const tile = rows[y]![x]!;
      if (!"FabcBCHYzeilL".includes(tile)) continue;
      if (protectedRoadChars.includes(tile) || (elevationChars.includes(tile) && tile !== "L") || sceneChars.includes(tile) || tile === "^" || tile === "f") continue;
      if (!nearTerrainChar(rows, x, y, waterSet, 2)) continue;
      rows[y]![x] = "p";
      wetBanks += 1;
    }
  }
}

function pruneTinyWaterBodies(rows: string[][]): void {
  const waterSet = new Set(waterChars);
  const seen = new Set<string>();
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      const key = `${x},${y}`;
      if (seen.has(key) || !waterSet.has(rows[y]![x]!)) continue;
      const cells: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[x, y]];
      seen.add(key);
      while (queue.length) {
        const [cx, cy] = queue.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nextKey = `${nx},${ny}`;
          if (seen.has(nextKey) || !waterSet.has(rows[ny]?.[nx] ?? "")) continue;
          seen.add(nextKey);
          queue.push([nx, ny]);
        }
      }
      if (cells.length >= 12) continue;
      for (const [cx, cy] of cells) rows[cy]![cx] = "p";
    }
  }
}

function nearTerrainChar(rows: string[][], cx: number, cy: number, chars: Set<string>, radius: number): boolean {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (chars.has(rows[y]?.[x] ?? "")) return true;
    }
  }
  return false;
}

function clearRoadPocket(rows: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (inBounds(x, y) && protectedRoadChars.includes(rows[y]![x]!)) rows[y]![x] = "d";
    }
  }
}

function gladeDirtPocket(rows: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!)) continue;
      if (elevationChars.includes(rows[y]![x]!)) continue;
      if (!protectedRoadChars.includes(rows[y]![x]!)) rows[y]![x] = "d";
    }
  }
}

function clearApproachPocket(rows: string[][], cx: number, cy: number): void {
  for (let y = cy - 1; y <= cy + 1; y += 1) {
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      if (!inBounds(x, y) || isRoadProtected(rows, x, y, 0)) continue;
      const isCenter = x === cx && y === cy;
      if (!isCenter && isWaterProtected(rows, x, y, 0)) continue;
      rows[y]![x] = "F";
    }
  }
}

function clearGameplayPocket(rows: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y) || protectedRoadChars.includes(rows[y]![x]!) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
      const nx = rx === 0 ? 0 : (x - cx) / rx;
      const ny = ry === 0 ? 0 : (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) rows[y]![x] = "F";
    }
  }
}

function markPath(mask: boolean[][], rows: string[][], points: Array<[number, number]>, options: { width: number; wobble: number; seed: number }): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let s = 0; s <= steps; s += 1) {
      const t = steps === 0 ? 0 : s / steps;
      const phase = options.seed + i * 19 + s;
      const bend =
        Math.sin((s + i * 3 + options.seed) * 0.31) * options.wobble +
        Math.cos((s - i * 5 + options.seed) * 0.17) * options.wobble * 0.45 +
        (mod(hash(x1 + phase, y1 - phase), 9) - 4) * 0.08;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.max(1, Math.hypot(dx, dy));
      const x = Math.round(x1 + dx * t + (-dy / length) * bend);
      const y = Math.round(y1 + dy * t + (dx / length) * bend);
      const width = options.width + (options.width > 0 && mod(hash(x + phase, y - phase), 7) === 0 ? 1 : 0);
      stampRoadMask(mask, rows, x, y, width, phase);
    }
  }
}

function stampRoadMask(mask: boolean[][], rows: string[][], cx: number, cy: number, radius: number, seed: number): void {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!)) continue;
      if (isElevationProtected(rows, x, y, 1)) continue;
      const manhattan = Math.abs(x - cx) + Math.abs(y - cy);
      if (manhattan <= radius || (radius > 0 && manhattan === radius + 1 && mod(hash(x + seed * 3, y - seed * 5), 5) === 0)) mask[y]![x] = true;
    }
  }
}

function widenRoadPocket(mask: boolean[][], rows: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!)) continue;
      if (isElevationProtected(rows, x, y, 1)) continue;
      const nx = rx === 0 ? 0 : (x - cx) / rx;
      const ny = ry === 0 ? 0 : (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) mask[y]![x] = true;
    }
  }
}

function clearRoadMaskBites(mask: boolean[][], rows: string[][]): void {
  for (let y = 2; y < stageRows - 2; y += 1) {
    for (let x = 2; x < stageCols - 2; x += 1) {
      if (!mask[y]![x] || waterChars.includes(rows[y]![x]!)) continue;
      const protectedJunction = Math.hypot(x - 55, y - 36) < 5 || Math.hypot(x - 55, y - 59) < 4;
      if (protectedJunction) continue;
      const cardinalCount = [
        mask[y - 1]?.[x] ?? false,
        mask[y]?.[x + 1] ?? false,
        mask[y + 1]?.[x] ?? false,
        mask[y]?.[x - 1] ?? false
      ].filter(Boolean).length;
      if (cardinalCount >= 3) continue;
      if (mod(hash(x + 83, y - 41), 17) === 0) mask[y]![x] = false;
    }
  }
}

function applyRoadMask(rows: string[][], mask: boolean[][]): void {
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      const cornerMask = cornerWangMask(mask, x, y);
      if (cornerMask !== 0) rows[y]![x] = roadCharForMask(cornerMask);
    }
  }
}

function closeRoadMaskHoles(mask: boolean[][], rows: string[][]): void {
  for (let pass = 0; pass < 2; pass += 1) {
    const copy = mask.map((row) => [...row]);
    for (let y = 1; y < stageRows - 1; y += 1) {
      for (let x = 1; x < stageCols - 1; x += 1) {
        if (copy[y]![x] || waterChars.includes(rows[y]![x]!)) continue;
        const north = copy[y - 1]?.[x] ?? false;
        const east = copy[y]?.[x + 1] ?? false;
        const south = copy[y + 1]?.[x] ?? false;
        const west = copy[y]?.[x - 1] ?? false;
        const cardinalCount = [north, east, south, west].filter(Boolean).length;
        const diagonalCount = [
          copy[y - 1]?.[x - 1] ?? false,
          copy[y - 1]?.[x + 1] ?? false,
          copy[y + 1]?.[x + 1] ?? false,
          copy[y + 1]?.[x - 1] ?? false
        ].filter(Boolean).length;
        if ((north && south) || (east && west) || cardinalCount >= 3 || (cardinalCount >= 2 && diagonalCount >= 2)) mask[y]![x] = true;
      }
    }
  }
}

function canopyMass(rows: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y) || rows[y]![x] !== "F") continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const falloff = nx * nx + ny * ny;
      if (falloff < 0.82 || (falloff < 1.1 && mod(hash(x, y), 4) !== 0)) rows[y]![x] = "^";
    }
  }
}

function closeCanopyPinholes(rows: string[][]): void {
  for (let pass = 0; pass < 3; pass += 1) {
    const copy = rows.map((row) => [...row]);
    for (let y = 1; y < stageRows - 1; y += 1) {
      for (let x = 1; x < stageCols - 1; x += 1) {
        if (copy[y]![x] !== "F") continue;
        const canopyNeighbors = countNeighbors(copy, x, y, "^");
        if (canopyNeighbors >= 6) rows[y]![x] = "^";
      }
    }
  }
}

function softenCanopyFringes(rows: string[][]): void {
  const copy = rows.map((row) => [...row]);
  for (let y = 2; y < stageRows - 2; y += 1) {
    for (let x = 2; x < stageCols - 2; x += 1) {
      if (copy[y]![x] !== "F") continue;
      if (isRoadProtected(copy, x, y, 3) || isWaterProtected(copy, x, y, 2)) continue;
      const canopyNeighbors = countNeighbors(copy, x, y, "^");
      if (canopyNeighbors >= 2 && mod(hash(x + 19, y - 23), 5) <= 1) rows[y]![x] = "c";
    }
  }
}

function plantCuttableGroves(rows: string[][]): void {
  const groves: Array<[number, number, number, number]> = [
    [16, 9, 3, 2],
    [30, 10, 4, 2],
    [39, 17, 3, 2],
    [88, 12, 4, 2],
    [18, 56, 3, 2],
    [31, 60, 4, 2],
    [45, 61, 4, 2],
    [87, 55, 4, 2],
    [98, 52, 4, 2],
    [71, 49, 3, 2],
    [8, 58, 3, 2],
    [18, 64, 4, 2],
    [40, 8, 3, 2],
    [72, 62, 4, 2],
    [98, 42, 3, 2]
  ];
  for (const [cx, cy, rx, ry] of groves) {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        if (!inBounds(x, y) || !"Fabc".includes(rows[y]![x]!)) continue;
        if (isRoadProtected(rows, x, y, 3) || isWaterProtected(rows, x, y, 2) || isElevationProtected(rows, x, y, 1)) continue;
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny < 1 && mod(hash(x - cx * 3, y + cy * 5), 5) !== 0) rows[y]![x] = "f";
      }
    }
  }
}

function scatterForestDetails(rows: string[][]): void {
  const anchors: Array<[number, number, number, number, (typeof detailChars)[number]]> = [
    [25, 14, 10, 6, "B"],
    [37, 24, 9, 5, "C"],
    [46, 48, 11, 6, "H"],
    [67, 44, 9, 5, "Y"],
    [87, 57, 12, 6, "z"],
    [76, 18, 10, 5, "B"],
    [18, 50, 8, 5, "C"],
    [61, 61, 11, 5, "H"],
    [31, 31, 7, 4, "e"],
    [85, 40, 8, 5, "i"],
    [102, 25, 7, 5, "l"],
    [43, 62, 8, 4, "e"],
    [64, 20, 8, 4, "i"],
    [21, 24, 7, 4, "l"]
  ];

  for (const [cx, cy, rx, ry, char] of anchors) {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        if (!inBounds(x, y) || rows[y]![x] !== "F") continue;
        if (isRoadProtected(rows, x, y, 2) || isWaterProtected(rows, x, y, 1) || isElevationProtected(rows, x, y, 1)) continue;
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const falloff = nx * nx + ny * ny;
        if (falloff < 0.58 && mod(hash(x + cx, y - cy), 5) <= 1) rows[y]![x] = char;
        else if (falloff < 0.92 && mod(hash(x - cy, y + cx), 11) === 0) rows[y]![x] = char;
      }
    }
  }
}

function buildStageObjects(rows: string[][]): Array<{ key: string; x: number; y: number; w: number; h: number; blocking: boolean; tile?: string }> {
  const candidates = [
    { key: "spriteLamp", x: 52.6, y: 38.3, w: 20, h: 74 },
    { key: "spriteSign", x: 58.2, y: 39.9, w: 38, h: 46 },
    { key: "spriteSign", x: 19.4, y: 12.8, w: 34, h: 42 },
    { key: "spriteSign", x: 23.8, y: 20.4, w: 34, h: 42 },
    { key: "spriteBarrels", x: 54.6, y: 41.2, w: 42, h: 32 },
    { key: "spriteBarrels", x: 14.2, y: 58.8, w: 42, h: 32 },
    { key: "spriteBarrels", x: 17.4, y: 60.1, w: 40, h: 31 },
    { key: "spriteBarrels", x: 62.7, y: 9.8, w: 38, h: 30 },
    { key: "spriteBarrels", x: 100.8, y: 16.2, w: 38, h: 30 },
    { key: "spriteBarrels", x: 97.4, y: 57.9, w: 40, h: 31 },
    { key: "spriteRock", x: 13.5, y: 57.7, w: 34, h: 25 },
    { key: "spriteRock", x: 26.1, y: 18.3, w: 34, h: 25 },
    { key: "spriteRock", x: 96.3, y: 12.2, w: 36, h: 27 },
    { key: "spriteRock", x: 100.8, y: 15.8, w: 32, h: 24 },
    { key: "spriteRock", x: 73.7, y: 26.7, w: 30, h: 23 },
    { key: "spriteRock", x: 46.6, y: 54.7, w: 30, h: 22 },
    { key: "spriteBoulder", x: 85.8, y: 28.5, w: 34, h: 42 },
    { key: "spriteBoulder", x: 70.8, y: 52.4, w: 32, h: 41 },
    { key: "spriteBoulder", x: 23.3, y: 21.8, w: 32, h: 40 },
    { key: "spriteBoulder", x: 64.9, y: 7.2, w: 30, h: 38 },
    { key: "spriteLamp", x: 59.6, y: 31.4, w: 24, h: 86 },
    { key: "spriteLamp", x: 71.4, y: 50.2, w: 20, h: 72 },
    { key: "spriteLamp", x: 51.6, y: 62.4, w: 18, h: 64 },
    { key: "spriteLamp", x: 57.2, y: 41.9, w: 18, h: 64 },
    { key: "spriteLamp", x: 94.6, y: 55.6, w: 18, h: 64 },
    { key: "spriteSign", x: 88.8, y: 38.2, w: 34, h: 40 },
    { key: "spriteCampfire", x: 56.2, y: 40.4, w: 36, h: 36 },
    { key: "spriteCampfire", x: 15.5, y: 59.8, w: 32, h: 32 },
    { key: "spriteCampfire", x: 96.2, y: 55.2, w: 32, h: 32 }
  ];

  return candidates
    .filter((item) => {
      const x = Math.floor(item.x);
      const y = Math.floor(item.y);
      const tile = rows[y]?.[x] ?? "#";
      return inBounds(x, y) && !protectedRoadChars.includes(tile) && !waterChars.includes(tile) && tile !== "f" && tile !== "^";
    })
    .map((item) => ({ ...item, blocking: false }));
}

function applyPoiScenePass(rows: string[][]): void {
  const scenes = [
    { label: "central waymeet shrine", cx: 55, cy: 39, rx: 5, ry: 3, ground: "s", accent: "R", blockers: [] as Array<[number, number]> },
    { label: "northwest ruin cave", cx: 25, cy: 20, rx: 6, ry: 3, ground: "R", accent: "s", blockers: [[22, 18], [23, 18], [24, 18]] as Array<[number, number]> },
    { label: "southwest logging camp", cx: 15, cy: 59, rx: 5, ry: 3, ground: "G", accent: "B", blockers: [] as Array<[number, number]> },
    { label: "northeast mine shrine", cx: 99, cy: 14, rx: 5, ry: 3, ground: "R", accent: "s", blockers: [[101, 12]] as Array<[number, number]> },
    { label: "southeast ledge camp", cx: 96, cy: 56, rx: 6, ry: 4, ground: "s", accent: "G", blockers: [] as Array<[number, number]> },
    { label: "north seam cave", cx: 63, cy: 8, rx: 5, ry: 2, ground: "R", accent: "G", blockers: [[63, 6], [64, 6]] as Array<[number, number]> }
  ];

  for (const scene of scenes) {
    for (let y = scene.cy - scene.ry; y <= scene.cy + scene.ry; y += 1) {
      for (let x = scene.cx - scene.rx; x <= scene.cx + scene.rx; x += 1) {
        if (!canStampSceneTile(rows, x, y)) continue;
        const nx = scene.rx === 0 ? 0 : (x - scene.cx) / scene.rx;
        const ny = scene.ry === 0 ? 0 : (y - scene.cy) / scene.ry;
        const falloff = nx * nx + ny * ny;
        if (falloff > 1) continue;
        const edgeNoise = mod(hash(x + scene.cx * 5, y - scene.cy * 7), 7);
        rows[y]![x] = falloff < 0.42 || edgeNoise <= 2 ? scene.ground : scene.accent;
      }
    }
    for (const [x, y] of scene.blockers) {
      if (canStampSceneBlocker(rows, x, y)) rows[y]![x] = "n";
    }
  }
}

function applyNorthwoodArtSpecPass(rows: string[][]): void {
  stampWalkwayRun(rows, [
    [52, 39],
    [53, 39],
    [54, 39],
    [55, 39],
    [56, 39],
    [57, 39],
    [58, 39]
  ]);
  stampWalkwayRun(rows, [
    [13, 59],
    [14, 59],
    [15, 59],
    [16, 59],
    [17, 60]
  ]);
  stampWalkwayRun(rows, [
    [94, 56],
    [95, 56],
    [96, 56],
    [97, 56],
    [98, 57],
    [95, 57],
    [96, 57]
  ]);
  stampWalkwayRun(rows, [
    [61, 8],
    [62, 8],
    [63, 8],
    [64, 8],
    [65, 8],
    [66, 8],
    [62, 9],
    [65, 9]
  ]);

  stampMinePocket(rows, 99, 14, [
    [98, 13],
    [99, 13],
    [100, 13],
    [98, 14],
    [100, 14],
    [99, 15],
    [101, 15],
    [100, 16],
    [101, 16],
    [102, 15],
    [102, 16]
  ], [
    [101, 12],
    [102, 12],
    [102, 13]
  ]);
  stampMinePocket(rows, 63, 8, [
    [61, 8],
    [62, 8],
    [64, 8],
    [65, 8],
    [63, 9],
    [64, 9]
  ], [
    [63, 6],
    [64, 6],
    [65, 6]
  ]);
  stampMinePocket(rows, 25, 20, [
    [24, 19],
    [25, 19],
    [26, 19],
    [24, 20],
    [26, 20],
    [27, 21]
  ], [
    [22, 18],
    [23, 18],
    [24, 18]
  ]);
  stampMinePocket(rows, 11, 59, [
    [10, 58],
    [11, 58],
    [12, 58],
    [10, 59],
    [12, 59],
    [11, 60]
  ], []);
}

function stampWalkwayRun(rows: string[][], cells: Array<[number, number]>): void {
  for (const [x, y] of cells) {
    if (canStampArtSpecWalkable(rows, x, y)) rows[y]![x] = "T";
  }
}

function stampMinePocket(rows: string[][], cx: number, cy: number, gravel: Array<[number, number]>, seams: Array<[number, number]>): void {
  for (const [x, y] of gravel) {
    if (x === cx && y === cy) continue;
    if (canStampArtSpecWalkable(rows, x, y)) rows[y]![x] = "K";
  }
  for (const [x, y] of seams) {
    if (canStampArtSpecBlocker(rows, x, y)) rows[y]![x] = "O";
  }
}

function canStampArtSpecWalkable(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  if (protectedRoadChars.includes(tile) || waterChars.includes(tile) || elevationChars.includes(tile) || tile === "^" || tile === "f" || tile === "n" || tile === "O") return false;
  return true;
}

function canStampArtSpecBlocker(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  if (protectedRoadChars.includes(tile) || waterChars.includes(tile) || elevationChars.includes(tile) || tile === "^" || tile === "f") return false;
  return true;
}

function canStampSceneTile(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  if (sceneChars.includes(tile)) return true;
  if (protectedRoadChars.includes(tile) || waterChars.includes(tile) || tile === "^" || tile === "f") return false;
  if (elevationChars.includes(tile)) return false;
  return true;
}

function canStampSceneBlocker(rows: string[][], x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const tile = rows[y]![x]!;
  return !protectedRoadChars.includes(tile) && !waterChars.includes(tile) && !elevationChars.includes(tile) && tile !== "^" && tile !== "f";
}

function countNeighbors(rows: string[][], cx: number, cy: number, char: string): number {
  let count = 0;
  for (let y = cy - 1; y <= cy + 1; y += 1) {
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      if (x === cx && y === cy) continue;
      if (rows[y]?.[x] === char) count += 1;
    }
  }
  return count;
}

function glade(rows: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!)) continue;
      if (elevationChars.includes(rows[y]![x]!)) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny < 1) rows[y]![x] = "F";
    }
  }
}

function applyElevationPass(rows: string[][]): void {
  const plateauMask = Array.from({ length: stageRows }, () => Array.from({ length: stageCols }, () => false));
  const ridges: Array<{ x1: number; x2: number; topY: number; faceY: number; seed: number; stairs: number[] }> = [
    { x1: 5, x2: 34, topY: 7, faceY: 19, seed: 11, stairs: [22] },
    { x1: 42, x2: 69, topY: 6, faceY: 19, seed: 17, stairs: [55] },
    { x1: 76, x2: 105, topY: 7, faceY: 20, seed: 23, stairs: [92] },
    { x1: 5, x2: 30, topY: 43, faceY: 55, seed: 31, stairs: [16] },
    { x1: 36, x2: 70, topY: 41, faceY: 56, seed: 37, stairs: [39, 56] },
    { x1: 75, x2: 105, topY: 43, faceY: 55, seed: 43, stairs: [88, 96] }
  ];

  for (const ridge of ridges) {
    for (let y = ridge.topY; y < ridge.faceY; y += 1) {
      for (let x = ridge.x1; x <= ridge.x2; x += 1) {
        if (!inBounds(x, y) || rows[y]![x] === "^" || waterChars.includes(rows[y]![x]!)) continue;
        const inset = y - ridge.topY;
        const leftWobble = Math.round(Math.sin((y + ridge.seed) * 0.27) * 2 + (mod(hash(y, ridge.seed), 3) - 1));
        const rightWobble = Math.round(Math.cos((y - ridge.seed) * 0.19) * 2 + (mod(hash(y, ridge.seed + 17), 3) - 1));
        const left = ridge.x1 + Math.max(0, 4 - inset) + leftWobble;
        const right = ridge.x2 - Math.max(0, 4 - inset) + rightWobble;
        if (x >= left && x <= right) plateauMask[y]![x] = true;
      }
    }
  }

  for (let y = 1; y < stageRows - 2; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (!plateauMask[y]![x] || waterChars.includes(rows[y]![x]!)) continue;
      const exposedRim = !(plateauMask[y + 1]?.[x] ?? false);
      const sideChip = (!(plateauMask[y]?.[x - 1] ?? false) || !(plateauMask[y]?.[x + 1] ?? false)) && mod(hash(x + ridgeSalt(y), y), 5) <= 1;
      rows[y]![x] = exposedRim || sideChip ? "L" : mod(hash(x + 7, y - 13), 5) === 0 ? "a" : "F";
    }
  }

  for (let y = 2; y < stageRows - 2; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (plateauMask[y]![x] || waterChars.includes(rows[y]![x]!) || protectedRoadChars.includes(rows[y]![x]!)) continue;
      const above = plateauMask[y - 1]?.[x] ?? false;
      const aboveLeft = plateauMask[y - 1]?.[x - 1] ?? false;
      const aboveRight = plateauMask[y - 1]?.[x + 1] ?? false;
      if (above || (aboveLeft && aboveRight)) {
        rows[y]![x] = "q";
      } else if (rows[y - 1]?.[x] === "q" && mod(hash(x, y), 5) !== 0) {
        rows[y]![x] = "o";
      }
    }
  }

  for (const ridge of ridges) {
    rows[ridge.faceY]![ridge.x1] = "q";
    rows[ridge.faceY]![ridge.x2] = "q";
    rows[ridge.faceY + 1]![ridge.x1] = "o";
    rows[ridge.faceY + 1]![ridge.x2] = "o";
    for (const sx of ridge.stairs) {
      carveStairBreak(rows, plateauMask, sx, ridge.faceY);
    }
  }
}

function carveStairBreak(rows: string[][], plateauMask: boolean[][], sx: number, sy: number): void {
  for (let y = sy - 2; y <= sy + 2; y += 1) {
    for (let x = sx; x <= sx + 1; x += 1) {
      if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
      rows[y]![x] = "m";
      plateauMask[y]![x] = false;
    }
    for (const [x, cliffTile] of [
      [sx - 1, "q"],
      [sx + 2, "q"]
    ] as Array<[number, string]>) {
      if (!inBounds(x, y) || waterChars.includes(rows[y]![x]!) || rows[y]![x] === "^") continue;
      rows[y]![x] = y >= sy + 1 ? "o" : cliffTile;
      plateauMask[y]![x] = false;
    }
  }
  for (let y = sy - 4; y <= sy - 3; y += 1) {
    for (let x = sx; x <= sx + 1; x += 1) {
      if (inBounds(x, y) && !waterChars.includes(rows[y]![x]!) && rows[y]![x] !== "^") rows[y]![x] = "L";
    }
  }
}

function ridgeSalt(y: number): number {
  return y * 17 + 31;
}

function grassPatch(rows: string[][], cx: number, cy: number, rx: number, ry: number, char: string): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y) || rows[y]![x] !== "F") continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const falloff = nx * nx + ny * ny;
      if (falloff < 0.78) rows[y]![x] = char;
      else if (falloff < 1 && mod(hash(x, y), 5) <= 1) rows[y]![x] = char;
    }
  }
}

function ellipse(rows: string[][], cx: number, cy: number, rx: number, ry: number, char: string): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y)) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny < 1) rows[y]![x] = char;
    }
  }
}

function ellipseMask(mask: boolean[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (!inBounds(x, y)) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny < 1) mask[y]![x] = true;
    }
  }
}

function scallopedPondMask(mask: boolean[][], cx: number, cy: number, rx: number, ry: number, seed: number): void {
  for (let y = cy - ry - 3; y <= cy + ry + 3; y += 1) {
    for (let x = cx - rx - 3; x <= cx + rx + 3; x += 1) {
      if (!inBounds(x, y)) continue;
      const wobbleCx = cx + Math.sin((y + seed) * 0.22) * 1.2 + Math.cos((y - seed) * 0.37) * 0.7;
      const wobbleCy = cy + Math.cos((x + seed) * 0.19) * 0.9;
      const nx = (x - wobbleCx) / rx;
      const ny = (y - wobbleCy) / ry;
      const wave = Math.sin((x + seed) * 0.47) * 0.11 + Math.cos((y - seed) * 0.39) * 0.1 + Math.sin((x + y + seed) * 0.21) * 0.07;
      const chippedEdge = (mod(hash(x + seed * 17, y - seed * 11), 11) - 5) * 0.022;
      const falloff = nx * nx + ny * ny + wave + chippedEdge;
      if (falloff < 0.86 || (falloff < 1.05 && mod(hash(x - seed, y + seed), 5) <= 1)) mask[y]![x] = true;
    }
  }
}

function carveStream(mask: boolean[][]): void {
  for (let y = 17; y <= 54; y += 1) {
    const x = Math.round(78 + Math.sin(y * 0.27) * 6 + Math.cos(y * 0.13) * 3 + (y - 30) * 0.16);
    const width = 1 + (mod(hash(x, y), 9) === 0 ? 2 : mod(hash(y, x), 4) === 0 ? 1 : 0);
    for (let dx = -width; dx <= width; dx += 1) {
      if (inBounds(x + dx, y) && (Math.abs(dx) < width || mod(hash(x + dx, y), 4) !== 0)) mask[y]![x + dx] = true;
    }
    if (mod(hash(x + 31, y - 7), 6) === 0) {
      const shelf = x + (mod(hash(y, x), 2) === 0 ? width + 1 : -width - 1);
      if (inBounds(shelf, y)) mask[y]![shelf] = true;
    }
  }
}

function carveWaterNotches(mask: boolean[][]): void {
  const copy = mask.map((row) => [...row]);
  for (let y = 2; y < stageRows - 2; y += 1) {
    for (let x = 2; x < stageCols - 2; x += 1) {
      if (!copy[y]![x]) continue;
      const waterNeighbors = [
        copy[y - 1]?.[x] ?? false,
        copy[y]?.[x + 1] ?? false,
        copy[y + 1]?.[x] ?? false,
        copy[y]?.[x - 1] ?? false
      ].filter(Boolean).length;
      if (waterNeighbors >= 4) continue;
      if (mod(hash(x + 101, y - 59), 13) === 0) mask[y]![x] = false;
    }
  }
}

function applyWaterMask(rows: string[][], mask: boolean[][]): void {
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      const cornerMask = cornerWangMask(mask, x, y);
      if (cornerMask !== 0 && !isSingleCornerMask(cornerMask)) rows[y]![x] = waterCharForMask(cornerMask);
    }
  }
}

function applyWetShoreRim(rows: string[][], mask: boolean[][]): void {
  for (let y = 1; y < stageRows - 1; y += 1) {
    for (let x = 1; x < stageCols - 1; x += 1) {
      if (mask[y]![x] || waterChars.includes(rows[y]![x]!) || protectedRoadChars.includes(rows[y]![x]!)) continue;
      const nearWater =
        Boolean(mask[y - 1]?.[x]) || Boolean(mask[y]?.[x + 1]) || Boolean(mask[y + 1]?.[x]) || Boolean(mask[y]?.[x - 1]) ||
        Boolean(mask[y - 1]?.[x - 1]) || Boolean(mask[y - 1]?.[x + 1]) || Boolean(mask[y + 1]?.[x + 1]) || Boolean(mask[y + 1]?.[x - 1]);
      if (!nearWater) continue;
      const roll = mod(hash(x + 23, y - 71), 10);
      if (roll <= 3) rows[y]![x] = "a";
      else if (roll === 4) rows[y]![x] = "B";
      else if (roll === 5) rows[y]![x] = "c";
    }
  }
}

function enrichWaterBanks(rows: string[][], mask: boolean[][]): void {
  for (let y = 2; y < stageRows - 2; y += 1) {
    for (let x = 2; x < stageCols - 2; x += 1) {
      const tile = rows[y]![x]!;
      if (tile === "~" && countMaskNeighbors(mask, x, y, 2) >= 13 && mod(hash(x + 173, y - 89), 9) <= 1) {
        rows[y]![x] = "J";
        continue;
      }
      if (mask[y]![x] || waterChars.includes(tile) || protectedRoadChars.includes(tile) || elevationChars.includes(tile)) continue;
      const cardinalWater = [
        mask[y - 1]?.[x] ?? false,
        mask[y]?.[x + 1] ?? false,
        mask[y + 1]?.[x] ?? false,
        mask[y]?.[x - 1] ?? false
      ].filter(Boolean).length;
      const diagonalWater = [
        mask[y - 1]?.[x - 1] ?? false,
        mask[y - 1]?.[x + 1] ?? false,
        mask[y + 1]?.[x + 1] ?? false,
        mask[y + 1]?.[x - 1] ?? false
      ].filter(Boolean).length;
      if (cardinalWater >= 1 && diagonalWater >= 1 && mod(hash(x - 151, y + 61), 5) <= 1) rows[y]![x] = "p";
    }
  }
}

function countMaskNeighbors(mask: boolean[][], cx: number, cy: number, radius: number): number {
  let count = 0;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x === cx && y === cy) continue;
      if (mask[y]?.[x]) count += 1;
    }
  }
  return count;
}

function cornerWangMask(mask: boolean[][], x: number, y: number): number {
  let bits = 0;
  if (mask[y]?.[x]) bits |= 1;
  if (mask[y]?.[x + 1]) bits |= 2;
  if (mask[y + 1]?.[x + 1]) bits |= 4;
  if (mask[y + 1]?.[x]) bits |= 8;
  return bits;
}

function isSingleCornerMask(mask: number): boolean {
  return mask === WANG_N || mask === WANG_E || mask === WANG_S || mask === WANG_W;
}

function neighborMask(rows: string[][], x: number, y: number, isSameTerrain: (char: string) => boolean): number {
  let mask = 0;
  if (isSameTerrain(rows[y - 1]?.[x] ?? "")) mask |= WANG_N;
  if (isSameTerrain(rows[y]?.[x + 1] ?? "")) mask |= WANG_E;
  if (isSameTerrain(rows[y + 1]?.[x] ?? "")) mask |= WANG_S;
  if (isSameTerrain(rows[y]?.[x - 1] ?? "")) mask |= WANG_W;
  return mask;
}

function waterCharForMask(mask: number): string {
  return (
    {
      0: "P",
      1: "w",
      2: "Q",
      3: "?",
      4: "V",
      5: "x",
      6: "=",
      7: ")",
      8: "U",
      9: "{",
      10: "0",
      11: "/",
      12: "!",
      13: "(",
      14: "}",
      15: "~"
    } as Record<number, string>
  )[mask] ?? "~";
}

function roadCharForMask(mask: number): string {
  return (
    {
      0: "A",
      1: "@",
      2: "`",
      3: "%",
      4: ":",
      5: "<",
      6: "&",
      7: "j",
      8: ";",
      9: "+",
      10: ">",
      11: "k",
      12: "$",
      13: "h",
      14: "g",
      15: "t"
    } as Record<number, string>
  )[mask] ?? "t";
}

function scatter(rows: string[][], targets: string, char: string, count: number, seed: number): void {
  let state = seed;
  for (let i = 0; i < count; i += 1) {
    state = next(state);
    const x = 3 + (state % (stageCols - 6));
    state = next(state);
    const y = 3 + (state % (stageRows - 6));
    if (targets.includes(rows[y]![x]!) && !isRoadProtected(rows, x, y, 2) && !isWaterProtected(rows, x, y, 2)) rows[y]![x] = char;
  }
}

function scatterClusters(rows: string[][]): void {
  for (const [cx, cy] of [
    [30, 15],
    [21, 53],
    [86, 51],
    [72, 25],
    [39, 45]
  ] as Array<[number, number]>) {
    for (let y = cy - 2; y <= cy + 2; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        if (inBounds(x, y) && "Fabc".includes(rows[y]![x]!) && !isRoadProtected(rows, x, y, 3) && mod(hash(x, y), 3) !== 0) rows[y]![x] = "f";
      }
    }
  }
}

function isRoadProtected(rows: string[][], cx: number, cy: number, radius: number): boolean {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (inBounds(x, y) && protectedRoadChars.includes(rows[y]![x]!)) return true;
    }
  }
  return false;
}

function isWaterProtected(rows: string[][], cx: number, cy: number, radius: number): boolean {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (inBounds(x, y) && waterChars.includes(rows[y]![x]!)) return true;
    }
  }
  return false;
}

function isElevationProtected(rows: string[][], cx: number, cy: number, radius: number): boolean {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (inBounds(x, y) && elevationChars.includes(rows[y]![x]!)) return true;
    }
  }
  return false;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < stageCols && y < stageRows;
}

function next(value: number): number {
  return (value * 1664525 + 1013904223) >>> 0;
}

function hash(x: number, y: number): number {
  return (x * 73856093) ^ (y * 19349663);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function drawGrass(variant: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawScaledCrop(png, dx, dy, showcaseGrass(), 0, 0, showcaseGrass().width, showcaseGrass().height);
    if (variant === 0) return;

    const tint = [
      [42, 78, 45, 24],
      [35, 70, 47, 18],
      [74, 91, 51, 20]
    ][(variant - 1) % 3]!;
    for (let y = 0; y < tileSize; y += 1) {
      for (let x = 0; x < tileSize; x += 1) {
        if (mod(hash(x + variant * 13, y - variant * 7), 5) <= 2) {
          blendPixel(png, dx + x, dy + y, tint[0], tint[1], tint[2], tint[3]);
        }
      }
    }
  };
}

function drawForestDetail(variant: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawGrass((variant % 3) + 1)(png, dx, dy, variant);
    if (variant === 0 || variant === 4) {
      const palette = variant === 0 ? ([96, 79, 42] as const) : ([97, 89, 51] as const);
      for (let i = 0; i < 28; i += 1) {
        const x = mod(i * 7 + variant * 5, tileSize);
        const y = mod(i * 11 + variant * 3, tileSize);
        blendPixel(png, dx + x, dy + y, palette[0], palette[1], palette[2], 145);
        if (i % 3 === 0) blendPixel(png, dx + x + 1, dy + y, 48, 55, 31, 90);
      }
    }
    if (variant === 1) {
      for (const [cx, cy] of [
        [8, 22],
        [18, 17],
        [24, 25],
        [13, 10]
      ] as const) {
        drawFern(png, dx + cx, dy + cy, cx + cy);
      }
    }
    if (variant === 2) {
      for (const [x1, y1, x2, y2] of [
        [3, 22, 16, 13],
        [13, 28, 28, 20],
        [6, 9, 18, 16]
      ] as const) {
        drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 72, 52, 31, 150);
      }
    }
    if (variant === 3) {
      for (const [cx, cy, seed] of [
        [8, 21, 5],
        [19, 13, 7],
        [24, 23, 11]
      ] as const) {
        drawLeafCluster(png, dx + cx, dy + cy, seed);
        blendPixel(png, dx + cx, dy + cy - 2, 212, 190, 94, 175);
        blendPixel(png, dx + cx + 2, dy + cy, 198, 128, 160, 145);
      }
    }
    if (variant === 5) {
      for (const [cx, cy, seed] of [
        [9, 20, 5],
        [15, 23, 7],
        [23, 14, 11],
        [25, 25, 13]
      ] as const) {
        drawLeafCluster(png, dx + cx - 1, dy + cy + 1, seed);
        blendPixel(png, dx + cx, dy + cy, 198, 174, 119, 190);
        blendPixel(png, dx + cx + 1, dy + cy, 156, 76, 58, 170);
        blendPixel(png, dx + cx, dy + cy - 1, 236, 219, 156, 130);
      }
    }
    if (variant === 6) {
      for (const [cx, cy, seed] of [
        [7, 23, 3],
        [14, 16, 9],
        [21, 21, 15],
        [27, 12, 21]
      ] as const) {
        drawFern(png, dx + cx, dy + cy, seed);
        blendPixel(png, dx + cx, dy + cy - 3, 120, 150, 214, 185);
        blendPixel(png, dx + cx + 1, dy + cy - 2, 90, 112, 184, 150);
        blendPixel(png, dx + cx - 1, dy + cy - 1, 176, 191, 232, 120);
      }
    }
    if (variant === 7) {
      for (const [x1, y1, x2, y2] of [
        [4, 24, 12, 19],
        [11, 11, 22, 15],
        [18, 28, 29, 21],
        [6, 7, 15, 12]
      ] as const) {
        drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 83, 61, 35, 135);
      }
      for (const [cx, cy] of [
        [9, 17],
        [20, 10],
        [25, 24],
        [15, 27]
      ] as const) {
        blendPixel(png, dx + cx, dy + cy, 119, 121, 101, 180);
        blendPixel(png, dx + cx + 1, dy + cy, 68, 74, 63, 95);
      }
    }
  };
}

function drawDirt(variant: number): TileDef["draw"] {
  return (png, dx, dy) => {
    fillNoise(png, dx, dy, 138, 105, 62, 24, variant + 9);
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 7 + 3) % tileSize;
      const y = (i * 13 + 8) % tileSize;
      blendPixel(png, dx + x, dy + y, 88, 68, 45, 110);
    }
  };
}

function drawRoad(variant: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawDirt(variant)(png, dx, dy, variant);
    for (let y = 11; y < 21; y += 1) for (let x = 3; x < 29; x += 1) blendPixel(png, dx + x, dy + y, 158, 119, 66, 35);
    if (variant % 3 === 2) {
      for (let i = 0; i < 11; i += 1) blendPixel(png, dx + ((i * 9) % 28) + 2, dy + ((i * 5) % 26) + 3, 183, 141, 62, 130);
    }
  };
}

function drawRoadWang(mask: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawGrass(0)(png, dx, dy, 0);
    paintOrganicRoadShape(png, dx, dy, mask);
    paintCornerWangBank(png, dx, dy, mask, "road");
  };
}

function paintOrganicRoadShape(png: PNG, dx: number, dy: number, mask: number): void {
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const weight = cornerMaterialWeight(mask, x, y);
      const noise = (mod(hash(x + mask * 29, y - mask * 31), 17) - 8) / 54;
      const core = mask === 15 || weight + noise >= 0.48;
      if (!core) continue;

      const edge = Math.abs(weight - 0.5);
      const jitter = mod(hash(x + mask * 7, y - mask * 11), 23) - 11;
      const touchGrass =
        !cornerMaterialAt(mask, x, y - 1) || !cornerMaterialAt(mask, x + 1, y) || !cornerMaterialAt(mask, x, y + 1) || !cornerMaterialAt(mask, x - 1, y);
      const r = clamp(154 + jitter + (touchGrass ? 5 : 14));
      const g = clamp(113 + Math.floor(jitter / 2) + (touchGrass ? 0 : 8));
      const b = clamp(64 + Math.floor(jitter / 3));
      blendPixel(png, dx + x, dy + y, r, g, b, touchGrass ? 210 : 246);

      if (touchGrass || edge < 0.16) blendPixel(png, dx + x, dy + y, 92, 100, 54, touchGrass ? 85 : 28);
      if (mod(hash(x - mask * 13, y + mask * 17), 43) === 0) blendPixel(png, dx + x, dy + y, 91, 68, 43, 105);
      if (mod(hash(x + 71, y - 37), 67) === 0) blendPixel(png, dx + x, dy + y, 196, 153, 82, 75);
    }
  }
}

function restoreRoadGrassCorners(png: PNG, dx: number, dy: number, mask: number): void {
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (cornerMaterialWeight(mask, x, y) >= 0.34) continue;
      blendPixel(png, dx + x, dy + y, 55, 145, 40, 230);
    }
  }
}

function softenRoadBlackKeyEdges(png: PNG, dx: number, dy: number, mask: number): void {
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (!cornerMaterialAt(mask, x, y)) continue;
      const i = ((dy + y) * png.width + (dx + x)) * 4;
      const r = png.data[i] ?? 0;
      const g = png.data[i + 1] ?? 0;
      const b = png.data[i + 2] ?? 0;
      if (isBlackKeyPixel(r, g, b)) paintRoadPixel(png, dx + x, dy + y, x, y, mask);
    }
  }
}

function warmRoadInterior(png: PNG, dx: number, dy: number, mask: number): void {
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (!cornerMaterialAt(mask, x, y)) continue;
      const i = ((dy + y) * png.width + (dx + x)) * 4;
      const r = png.data[i] ?? 0;
      const g = png.data[i + 1] ?? 0;
      if (g > r + 8 && cornerMaterialWeight(mask, x, y) < 0.64) continue;
      const touchesLand =
        !cornerMaterialAt(mask, x, y - 1) || !cornerMaterialAt(mask, x + 1, y) || !cornerMaterialAt(mask, x, y + 1) || !cornerMaterialAt(mask, x - 1, y);
      blendPixel(png, dx + x, dy + y, 178, 122, 55, touchesLand ? 32 : 78);
    }
  }
}

function cornerMaterialWeight(mask: number, x: number, y: number): number {
  if (mask === 15) return 1;
  const tl = (mask & 1) !== 0 ? 1 : 0;
  const tr = (mask & 2) !== 0 ? 1 : 0;
  const br = (mask & 4) !== 0 ? 1 : 0;
  const bl = (mask & 8) !== 0 ? 1 : 0;
  const fx = clamp01((x + 0.5) / tileSize);
  const fy = clamp01((y + 0.5) / tileSize);
  const top = tl * (1 - fx) + tr * fx;
  const bottom = bl * (1 - fx) + br * fx;
  return top * (1 - fy) + bottom * fy;
}

function paintRoadPixel(png: PNG, px: number, py: number, localX: number, localY: number, seed: number): void {
  const jitter = mod(hash(localX + seed * 11, localY - seed * 7), 17) - 8;
  setPixel(png, px, py, clamp(142 + jitter), clamp(106 + jitter), clamp(61 + Math.floor(jitter / 2)), 255);
  if ((localX * 5 + localY * 3 + seed) % 19 === 0) blendPixel(png, px, py, 94, 70, 45, 95);
}

function drawWaterBase(variant: number): TileDef["draw"] {
  return (png, dx, dy) => {
    fillNoise(png, dx, dy, 48, 111, 151, 18, variant + 31);
    for (let y = 5; y < tileSize; y += 9) {
      for (let x = 0; x < tileSize; x += 1) {
        if ((x + variant * 3 + y) % 7 < 3) blendPixel(png, dx + x, dy + y, 117, 177, 196, 90);
      }
    }
  };
}

function drawWaterWang(mask: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawGrass(0)(png, dx, dy, 0);
    const source = showcaseWater();
    const sourceTile = Math.floor(source.width / 16);
    drawScaledCrop(png, dx, dy, source, mask * sourceTile, 0, sourceTile, source.height);
  };
}

function drawReedLilyWater(png: PNG, dx: number, dy: number): void {
  drawWaterWang(15)(png, dx, dy, 0);
  for (const [cx, cy, seed] of [
    [7, 23, 3],
    [24, 8, 7],
    [25, 24, 11],
    [14, 15, 17]
  ] as const) {
    drawReedClump(png, dx + cx, dy + cy, seed);
  }
  for (const [cx, cy, seed] of [
    [9, 10, 5],
    [18, 22, 9],
    [24, 17, 13]
  ] as const) {
    drawLilyPad(png, dx + cx, dy + cy, seed);
  }
}

function drawWetBankStones(png: PNG, dx: number, dy: number): void {
  drawGrass(1)(png, dx, dy, 1);
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (y > 18 || x < 5 || x > 27) continue;
      const fade = Math.max(0, 18 - y);
      blendPixel(png, dx + x, dy + y, 78, 103, 84, 45 + fade * 6);
    }
  }
  for (const [cx, cy, rx, ry, seed] of [
    [8, 22, 4, 2, 3],
    [17, 25, 5, 2, 7],
    [25, 20, 4, 2, 11],
    [12, 14, 3, 2, 17]
  ] as const) {
    drawBankStone(png, dx + cx, dy + cy, rx, ry, seed);
  }
}

function paintWaterPixel(png: PNG, px: number, py: number, localX: number, localY: number, seed: number): void {
  const jitter = mod(hash(localX + seed * 13, localY - seed * 5), 23) - 11;
  setPixel(png, px, py, clamp(44 + jitter), clamp(116 + jitter), clamp(156 + jitter), 255);
  if ((localX + seed * 2 + localY * 3) % 7 < 3) blendPixel(png, px, py, 119, 181, 196, 70);
}

function wangMaterialAt(mask: number, x: number, y: number): boolean {
  if (mask === 15) return true;
  const wobbleX = mod(hash(x, y), 5) - 2;
  const wobbleY = mod(hash(y, x), 5) - 2;
  const left = 8 + wobbleY;
  const right = tileSize - 9 + wobbleY;
  const top = 8 + wobbleX;
  const bottom = tileSize - 9 + wobbleX;
  const connected = [WANG_N, WANG_E, WANG_S, WANG_W].filter((bit) => (mask & bit) !== 0).length;
  if (connected <= 2) {
    const inCore = x >= left && x <= right && y >= top && y <= bottom;
    const inVerticalBand = x >= left && x <= right;
    const inHorizontalBand = y >= top && y <= bottom;
    const connectsNorth = (mask & WANG_N) !== 0 && inVerticalBand && y <= bottom;
    const connectsEast = (mask & WANG_E) !== 0 && x >= left && inHorizontalBand;
    const connectsSouth = (mask & WANG_S) !== 0 && inVerticalBand && y >= top;
    const connectsWest = (mask & WANG_W) !== 0 && x <= right && inHorizontalBand;
    return inCore || connectsNorth || connectsEast || connectsSouth || connectsWest;
  }
  if (mask === 0) return x >= left && x <= right && y >= top && y <= bottom;
  if ((mask & WANG_N) === 0 && y < top) return false;
  if ((mask & WANG_E) === 0 && x > right) return false;
  if ((mask & WANG_S) === 0 && y > bottom) return false;
  if ((mask & WANG_W) === 0 && x < left) return false;
  return true;
}

function cornerMaterialAt(mask: number, x: number, y: number): boolean {
  if (mask === 15) return true;
  const tl = (mask & 1) !== 0 ? 1 : 0;
  const tr = (mask & 2) !== 0 ? 1 : 0;
  const br = (mask & 4) !== 0 ? 1 : 0;
  const bl = (mask & 8) !== 0 ? 1 : 0;
  const fx = clamp01((x + 0.5) / tileSize);
  const fy = clamp01((y + 0.5) / tileSize);
  const top = tl * (1 - fx) + tr * fx;
  const bottom = bl * (1 - fx) + br * fx;
  const material = top * (1 - fy) + bottom * fy;
  const wobble = (mod(hash(x + mask * 17, y - mask * 13), 7) - 3) / 28;
  return material + wobble >= 0.5;
}

function paintCornerWangBank(png: PNG, dx: number, dy: number, mask: number, material: "road" | "water"): void {
  const edgeColor = material === "road" ? ([63, 80, 42] as const) : ([185, 201, 129] as const);
  const highlightColor = material === "road" ? ([164, 128, 71] as const) : ([116, 190, 205] as const);
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (!cornerMaterialAt(mask, x, y)) continue;
      const touchesLand =
        !cornerMaterialAt(mask, x, y - 1) || !cornerMaterialAt(mask, x + 1, y) || !cornerMaterialAt(mask, x, y + 1) || !cornerMaterialAt(mask, x - 1, y);
      if (!touchesLand) continue;
      blendPixel(png, dx + x, dy + y, edgeColor[0], edgeColor[1], edgeColor[2], material === "road" ? 170 : 135);
      if ((x + y + mask) % 3 === 0) blendPixel(png, dx + x, dy + y, highlightColor[0], highlightColor[1], highlightColor[2], 95);
    }
  }
}

function paintWangBank(png: PNG, dx: number, dy: number, mask: number, material: "road" | "water"): void {
  const edgeColor = material === "road" ? ([63, 80, 42] as const) : ([185, 201, 129] as const);
  const highlightColor = material === "road" ? ([164, 128, 71] as const) : ([116, 190, 205] as const);
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (!wangMaterialAt(mask, x, y)) continue;
      const touchesLand =
        !wangMaterialAt(mask, x, y - 1) || !wangMaterialAt(mask, x + 1, y) || !wangMaterialAt(mask, x, y + 1) || !wangMaterialAt(mask, x - 1, y);
      if (!touchesLand) continue;
      blendPixel(png, dx + x, dy + y, edgeColor[0], edgeColor[1], edgeColor[2], material === "road" ? 170 : 135);
      if ((x + y + mask) % 3 === 0) blendPixel(png, dx + x, dy + y, highlightColor[0], highlightColor[1], highlightColor[2], 95);
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function drawBoulder(png: PNG, dx: number, dy: number): void {
  drawGrass(2)(png, dx, dy, 2);
  for (let y = 5; y < 28; y += 1) {
    for (let x = 4; x < 29; x += 1) {
      const nx = (x - 16) / 12;
      const ny = (y - 17) / 9;
      if (nx * nx + ny * ny < 1) blendPixel(png, dx + x, dy + y, 96 + ((x + y) % 26), 105 + (x % 18), 91, 235);
    }
  }
}

function drawRuinPaving(png: PNG, dx: number, dy: number): void {
  drawGrass(2)(png, dx, dy, 2);
  for (let y = 3; y < tileSize - 2; y += 8) {
    for (let x = 2; x < tileSize - 2; x += 10) {
      const seed = x * 3 + y * 5;
      drawBankStone(png, dx + x + 3, dy + y + 3, 4 + (seed % 2), 3, seed);
      if (mod(seed, 3) === 0) drawLine(png, dx + x, dy + y + 7, dx + x + 8, dy + y + 7, 61, 55, 43, 105);
    }
  }
  for (const [x1, y1, x2, y2] of [
    [4, 6, 28, 9],
    [7, 23, 27, 20],
    [16, 4, 14, 29]
  ] as const) {
    drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 46, 58, 38, 110);
  }
}

function drawLoggingDuff(png: PNG, dx: number, dy: number): void {
  drawForestDetail(7)(png, dx, dy, 7);
  for (const [x1, y1, x2, y2] of [
    [4, 23, 25, 18],
    [7, 12, 28, 17],
    [5, 28, 20, 25]
  ] as const) {
    drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 111, 77, 42, 190);
    drawLine(png, dx + x1, dy + y1 + 1, dx + x2, dy + y2 + 1, 63, 44, 28, 130);
  }
  for (const [cx, cy] of [
    [7, 23],
    [25, 18],
    [28, 17],
    [20, 25]
  ] as const) {
    blendPixel(png, dx + cx, dy + cy, 170, 128, 68, 180);
    blendPixel(png, dx + cx + 1, dy + cy, 48, 33, 22, 120);
  }
}

function drawShrineMoss(png: PNG, dx: number, dy: number): void {
  drawForestDetail(6)(png, dx, dy, 6);
  for (let y = 8; y <= 24; y += 1) {
    for (let x = 8; x <= 24; x += 1) {
      const nx = (x - 16) / 9;
      const ny = (y - 16) / 7;
      if (nx * nx + ny * ny > 1) continue;
      blendPixel(png, dx + x, dy + y, 58, 91, 55, 92);
      if (mod(hash(x + 7, y - 5), 5) === 0) blendPixel(png, dx + x, dy + y, 183, 167, 102, 120);
    }
  }
  for (const [x1, y1, x2, y2] of [
    [16, 5, 16, 27],
    [6, 16, 26, 16]
  ] as const) {
    drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 196, 174, 100, 105);
  }
}

function drawCaveMouthShadow(png: PNG, dx: number, dy: number): void {
  drawCliffFace(0)(png, dx, dy, 0);
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const nx = (x - 16) / 15;
      const ny = (y - 18) / 14;
      if (nx * nx + ny * ny < 1.05) blendPixel(png, dx + x, dy + y, 76, 69, 53, 95);
    }
  }
  for (let y = 8; y < tileSize; y += 1) {
    for (let x = 3; x < tileSize - 3; x += 1) {
      const nx = (x - 16) / 13;
      const ny = (y - 24) / 15;
      if (nx * nx + ny * ny > 1) continue;
      blendPixel(png, dx + x, dy + y, 33, 34, 30, y < 15 ? 90 : 170);
    }
  }
  drawLine(png, dx + 5, dy + 12, dx + 16, dy + 6, 154, 139, 95, 125);
  drawLine(png, dx + 27, dy + 13, dx + 16, dy + 6, 69, 61, 48, 135);
  for (const [cx, cy, seed] of [
    [7, 20, 5],
    [24, 21, 9],
    [15, 27, 13]
  ] as const) {
    drawBankStone(png, dx + cx, dy + cy, 3, 2, seed);
  }
}

function drawPlankWalkway(png: PNG, dx: number, dy: number): void {
  fillNoise(png, dx, dy, 111, 78, 43, 20, 127);
  for (let y = 4; y <= 28; y += 6) {
    for (let x = 2; x < tileSize - 2; x += 1) {
      const jitter = mod(hash(x + 41, y - 17), 19) - 9;
      blendPixel(png, dx + x, dy + y, clamp(148 + jitter), clamp(96 + Math.floor(jitter / 2)), clamp(49 + Math.floor(jitter / 3)), 240);
      blendPixel(png, dx + x, dy + y + 1, 62, 43, 28, 135);
    }
  }
  for (let y = 0; y < tileSize; y += 1) {
    blendPixel(png, dx + 1, dy + y, 48, 63, 34, 95);
    blendPixel(png, dx + 30, dy + y, 48, 63, 34, 95);
  }
  for (let x = 5; x <= 26; x += 10) {
    drawLine(png, dx + x, dy + 4, dx + x - 1, dy + 28, 58, 41, 27, 145);
    for (let y = 8; y <= 24; y += 8) {
      blendPixel(png, dx + x, dy + y, 191, 150, 82, 150);
      blendPixel(png, dx + x + 1, dy + y, 38, 28, 20, 95);
    }
  }
}

function drawMineGravel(png: PNG, dx: number, dy: number): void {
  fillNoise(png, dx, dy, 91, 88, 74, 18, 109);
  for (const [cx, cy, rx, ry, seed] of [
    [7, 22, 4, 2, 3],
    [16, 16, 5, 3, 7],
    [24, 24, 4, 2, 11],
    [26, 10, 3, 2, 17]
  ] as const) {
    drawBankStone(png, dx + cx, dy + cy, rx, ry, seed);
  }
  for (const [cx, cy, seed] of [
    [8, 11, 5],
    [18, 23, 9],
    [25, 17, 13],
    [13, 27, 19]
  ] as const) {
    drawOreFleck(png, dx + cx, dy + cy, seed, 170);
  }
}

function drawOreSeam(png: PNG, dx: number, dy: number): void {
  drawCliffFace(0)(png, dx, dy, 0);
  for (let y = 9; y < tileSize - 2; y += 1) {
    for (let x = 2; x < tileSize - 2; x += 1) {
      const nx = (x - 16) / 13;
      const ny = (y - 22) / 12;
      if (nx * nx + ny * ny < 0.9 && mod(hash(x + 97, y - 53), 4) !== 0) blendPixel(png, dx + x, dy + y, 38, 39, 36, 90);
    }
  }
  for (const [x1, y1, x2, y2, seed] of [
    [5, 24, 15, 6, 3],
    [13, 28, 24, 7, 7],
    [3, 14, 29, 19, 11]
  ] as const) {
    drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 34, 37, 38, 160);
    drawLine(png, dx + x1, dy + y1 + 1, dx + x2, dy + y2 + 1, 121, 118, 93, 90);
    const midX = Math.round((x1 + x2) / 2);
    const midY = Math.round((y1 + y2) / 2);
    drawOreFleck(png, dx + midX, dy + midY, seed, 230);
  }
}

function drawLedgeTop(png: PNG, dx: number, dy: number): void {
  drawGrass(1)(png, dx, dy, 1);
  for (let y = 20; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const alpha = y < 24 ? 120 : 210;
      blendPixel(png, dx + x, dy + y, 92, 77, 48, alpha);
      if (mod(hash(x + 5, y - 3), 6) <= 1) blendPixel(png, dx + x, dy + y, 158, 141, 86, 140);
    }
  }
  for (let x = 0; x < tileSize; x += 1) {
    blendPixel(png, dx + x, dy + 19, 205, 188, 118, 150);
    blendPixel(png, dx + x, dy + 20, 66, 80, 39, 145);
    if (x % 5 !== 0) blendPixel(png, dx + x, dy + 24, 57, 62, 38, 125);
  }
  for (const [cx, cy, seed] of [
    [6, 24, 3],
    [16, 27, 7],
    [26, 23, 11]
  ] as const) {
    drawBankStone(png, dx + cx, dy + cy, 4, 2, seed);
  }
}

function drawCliffFace(variant: number): TileDef["draw"] {
  return (png, dx, dy) => {
    fillNoise(png, dx, dy, variant === 0 ? 96 : 58, variant === 0 ? 82 : 54, variant === 0 ? 61 : 45, variant === 0 ? 16 : 10, variant + 67);
    for (let y = 0; y < tileSize; y += 1) {
      const depth = y / (tileSize - 1);
      for (let x = 0; x < tileSize; x += 1) {
        const strata = Math.floor(y / (variant === 0 ? 6 : 8));
        const column = Math.floor(Math.sin((x + strata * 5 + variant * 7) * 0.42) * 9);
        const chip = mod(hash(x + strata * 23, y - variant * 31), 19);
        const base = variant === 0 ? 82 : 52;
        const r = clamp(base + Math.floor(depth * 34) + column + (chip < 3 ? 18 : 0));
        const g = clamp(base - 10 + Math.floor(depth * 26) + Math.floor(column / 2) + (chip < 3 ? 13 : 0));
        const b = clamp(base - 25 + Math.floor(depth * 18) + (chip < 3 ? 8 : 0));
        blendPixel(png, dx + x, dy + y, r, g, b, 224);
        if (chip === 8 || chip === 11) blendPixel(png, dx + x, dy + y, 40, 35, 29, variant === 0 ? 185 : 130);
        if (y <= 1 || (chip <= 1 && x > 2 && x < tileSize - 3)) blendPixel(png, dx + x, dy + y, 184, 159, 101, variant === 0 ? 120 : 65);
      }
    }
    for (const [x1, y1, x2, y2, seed] of [
      [4, 2, 2, 30, 3],
      [13, 0, 16, 31, 7],
      [24, 4, 21, 30, 11],
      [3, 18, 31, 21, 17],
      [8, 9, 30, 12, 23],
      [2, 27, 19, 24, 29]
    ] as const) {
      drawLine(png, dx + x1, dy + y1, dx + x2, dy + y2, 25, 23, 19, variant === 0 ? 230 : 150);
      if (seed % 2 === 1) drawLine(png, dx + x1 + 1, dy + y1, dx + x2 + 1, dy + y2, 160, 143, 91, variant === 0 ? 115 : 45);
    }
    for (const [cx, cy, seed] of [
      [7, 7, 3],
      [18, 13, 7],
      [26, 22, 11],
      [11, 27, 17]
    ] as const) {
      drawBankStone(png, dx + cx, dy + cy, variant === 0 ? 4 : 3, 2, seed);
    }
    if (variant === 0) {
      for (const [cx, cy, seed] of [
        [5, 2, 3],
        [14, 1, 7],
        [25, 3, 11],
        [29, 5, 17]
      ] as const) {
        drawLeafCluster(png, dx + cx, dy + cy, seed);
      }
    } else {
      for (let y = 20; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) blendPixel(png, dx + x, dy + y, 25, 27, 23, 95);
      }
    }
    for (let x = 0; x < tileSize; x += 1) {
      blendPixel(png, dx + x, dy, 232, 205, 134, variant === 0 ? 230 : 90);
      blendPixel(png, dx + x, dy + tileSize - 1, 19, 21, 18, variant === 0 ? 150 : 190);
    }
  };
}

function drawStoneStairs(png: PNG, dx: number, dy: number): void {
  drawCliffFace(0)(png, dx, dy, 0);
  for (let y = 0; y < tileSize; y += 1) {
    const halfWidth = 6 + Math.floor(y * 0.25);
    const left = 16 - halfWidth;
    const right = 16 + halfWidth;
    for (let x = left; x <= right; x += 1) {
      const jitter = mod(hash(x + 83, y - 29), 17) - 8;
      blendPixel(png, dx + x, dy + y, clamp(126 + jitter), clamp(114 + Math.floor(jitter / 2)), clamp(84 + Math.floor(jitter / 3)), 245);
      if (y % 6 === 0 || y % 6 === 1) blendPixel(png, dx + x, dy + y, 213, 194, 134, 160);
      if (y % 6 === 3 || y % 6 === 4) blendPixel(png, dx + x, dy + y, 59, 52, 41, 125);
      if (x === left || x === right) blendPixel(png, dx + x, dy + y, 42, 50, 33, 185);
    }
  }
  for (const stepY of [5, 11, 17, 23, 29]) {
    const halfWidth = 6 + Math.floor(stepY * 0.25);
    for (let x = 16 - halfWidth; x <= 16 + halfWidth; x += 1) {
      blendPixel(png, dx + x, dy + stepY, 224, 204, 142, 205);
      if (stepY + 1 < tileSize) blendPixel(png, dx + x, dy + stepY + 1, 45, 40, 33, 150);
    }
  }
  for (const [cx, cy, seed] of [
    [8, 3, 5],
    [24, 5, 9],
    [5, 25, 13],
    [27, 27, 17]
  ] as const) {
    drawLeafCluster(png, dx + cx, dy + cy, seed);
  }
}

function drawCanopy(png: PNG, dx: number, dy: number): void {
  drawGrass(0)(png, dx, dy, 0);

  for (let y = 20; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if (mod(hash(x + 11, y - 29), 5) <= 2) blendPixel(png, dx + x, dy + y, 33, 70, 31, 55);
    }
  }

  drawSourceCrop(png, dx, dy, { x: 35, y: 55, w: 355, h: 385 }, -2, -3, 27, 35);
  drawSourceCrop(png, dx, dy, { x: 455, y: 50, w: 220, h: 390 }, 15, -2, 17, 34);

  for (let x = 5; x <= 26; x += 9) {
    for (let y = 18; y < 31; y += 1) {
      if (mod(hash(x, y), 4) !== 0) blendPixel(png, dx + x, dy + y, 87, 59, 33, 135);
    }
  }

  for (const [cx, cy, seed] of [
    [7, 8, 3],
    [15, 5, 7],
    [23, 9, 11],
    [11, 17, 17],
    [26, 18, 23]
  ] as const) {
    drawLeafCluster(png, dx + cx, dy + cy, seed);
  }
}

function drawCanopyBough(png: PNG, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const jitter = mod(hash(x + seed, y - seed), 19) - 9;
      blendPixel(png, x, y, clamp(45 + jitter), clamp(87 + jitter), clamp(38 + Math.floor(jitter / 2)), 218);
    }
  }
}

function drawTreeUnderlay(png: PNG, dx: number, dy: number): void {
  drawGrass(0)(png, dx, dy, 0);
  for (let y = 10; y < 26; y += 1) {
    for (let x = 8; x < 25; x += 1) {
      const nx = (x - 16) / 9;
      const ny = (y - 18) / 6;
      if (nx * nx + ny * ny < 1 && mod(hash(x, y), 3) !== 0) blendPixel(png, dx + x, dy + y, 24, 62, 31, 60);
    }
  }
}

function drawPortal(label: string, roadMask: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawRoadWang(roadMask)(png, dx, dy, 0);
    const glyphs: Record<string, string[]> = {
      S: ["111", "100", "111", "001", "111"],
      N: ["101", "111", "111", "111", "101"],
      M: ["101", "111", "111", "101", "101"],
      D: ["110", "101", "101", "101", "110"]
    };
    const glyph = glyphs[label] ?? glyphs.S!;
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < glyph[gy]!.length; gx += 1) {
        if (glyph[gy]![gx] !== "1") continue;
        for (let py = 0; py < 3; py += 1) for (let px = 0; px < 3; px += 1) blendPixel(png, dx + 11 + gx * 3 + px, dy + 8 + gy * 3 + py, 242, 218, 107, 230);
      }
    }
  };
}

function drawDetail(index: number): TileDef["draw"] {
  return (png, dx, dy) => {
    drawGrass(0)(png, dx, dy, index);
    const clusters = [
      [9, 20],
      [17, 12],
      [23, 22]
    ] as const;
    for (const [cx, cy] of clusters.slice(0, 1 + (index % clusters.length))) {
      const ox = ((index * 5 + cx) % 7) - 3;
      const oy = ((index * 3 + cy) % 7) - 3;
      drawLeafCluster(png, dx + cx + ox, dy + cy + oy, index);
    }
  };
}

function drawLeafCluster(png: PNG, cx: number, cy: number, seed: number): void {
  const colors = [
    [80, 112, 45],
    [105, 119, 54],
    [57, 86, 40]
  ] as const;
  for (let i = 0; i < 7; i += 1) {
    const [r, g, b] = colors[(i + seed) % colors.length]!;
    const x = cx + ((i * 3 + seed) % 7) - 3;
    const y = cy + ((i * 5 + seed) % 5) - 2;
    blendPixel(png, x, y, r, g, b, 190);
    if (i % 2 === 0) blendPixel(png, x + 1, y, r, g, b, 140);
  }
}

function drawFern(png: PNG, cx: number, cy: number, seed: number): void {
  const stem = [41, 83, 38] as const;
  for (let i = 0; i < 5; i += 1) {
    const y = cy - i;
    blendPixel(png, cx, y, stem[0], stem[1], stem[2], 165);
    const spread = 1 + (i % 3);
    blendPixel(png, cx - spread, y + 1, 58, 103, 44, 150);
    blendPixel(png, cx + spread, y, 72, 116, 48, 140);
    if (mod(seed + i, 2) === 0) blendPixel(png, cx - spread - 1, y + 1, 48, 88, 38, 120);
  }
}

function drawReedClump(png: PNG, cx: number, cy: number, seed: number): void {
  for (let i = 0; i < 5; i += 1) {
    const x = cx + ((i * 3 + seed) % 7) - 3;
    const h = 5 + ((i + seed) % 4);
    drawLine(png, x, cy, x + (i % 2), cy - h, 70, 108, 50, 175);
    blendPixel(png, x + (i % 2), cy - h, 169, 139, 76, 150);
  }
}

function drawLilyPad(png: PNG, cx: number, cy: number, seed: number): void {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -4; x <= 4; x += 1) {
      const nx = x / 4;
      const ny = y / 2.4;
      if (nx * nx + ny * ny > 1) continue;
      if (x > 1 && y < 0 && mod(seed, 2) === 0) continue;
      blendPixel(png, cx + x, cy + y, 72, 128, 60, 185);
      if (x === 0 || y === 0) blendPixel(png, cx + x, cy + y, 117, 161, 79, 90);
    }
  }
}

function drawBankStone(png: PNG, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  for (let y = -ry; y <= ry; y += 1) {
    for (let x = -rx; x <= rx; x += 1) {
      const nx = x / rx;
      const ny = y / ry;
      if (nx * nx + ny * ny > 1) continue;
      const jitter = mod(hash(cx + x + seed, cy + y - seed), 17) - 8;
      blendPixel(png, cx + x, cy + y, clamp(94 + jitter), clamp(102 + jitter), clamp(84 + jitter), 205);
      if (y <= -ry + 1) blendPixel(png, cx + x, cy + y, 146, 151, 118, 95);
    }
  }
}

function drawOreFleck(png: PNG, cx: number, cy: number, seed: number, alpha: number): void {
  const colors = [
    [177, 167, 118],
    [126, 151, 158],
    [211, 194, 126]
  ] as const;
  for (let i = 0; i < 5; i += 1) {
    const [r, g, b] = colors[(i + seed) % colors.length]!;
    const x = cx + ((i * 3 + seed) % 5) - 2;
    const y = cy + ((i * 5 + seed) % 5) - 2;
    blendPixel(png, x, y, r, g, b, alpha);
    if (i % 2 === 0) blendPixel(png, x + 1, y, 240, 229, 161, Math.floor(alpha * 0.45));
  }
}

function drawLine(png: PNG, x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number): void {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    blendPixel(png, x, y, r, g, b, a);
  }
}

function drawSourceCrop(
  target: PNG,
  dx: number,
  dy: number,
  crop: { x: number; y: number; w: number; h: number },
  insetX: number,
  insetY: number,
  outW: number,
  outH: number
): void {
  const source = treeSource();
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const sx = crop.x + Math.min(crop.w - 1, Math.floor((x / Math.max(1, outW - 1)) * crop.w));
      const sy = crop.y + Math.min(crop.h - 1, Math.floor((y / Math.max(1, outH - 1)) * crop.h));
      const si = (sy * source.width + sx) * 4;
      const alpha = source.data[si + 3] ?? 0;
      if (alpha < 20) continue;
      if (isKeyPixel(source.data[si] ?? 0, source.data[si + 1] ?? 0, source.data[si + 2] ?? 0)) continue;
      if (isBlackKeyPixel(source.data[si] ?? 0, source.data[si + 1] ?? 0, source.data[si + 2] ?? 0)) continue;
      blendPixel(target, dx + insetX + x, dy + insetY + y, source.data[si] ?? 0, source.data[si + 1] ?? 0, source.data[si + 2] ?? 0, alpha);
    }
  }
}

function drawScaledCrop(target: PNG, dx: number, dy: number, source: PNG, sx: number, sy: number, sw: number, sh: number): void {
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const localX0 = Math.floor((x / tileSize) * sw);
      const localX1 = Math.max(localX0 + 1, Math.ceil(((x + 1) / tileSize) * sw));
      const localY0 = Math.floor((y / tileSize) * sh);
      const localY1 = Math.max(localY0 + 1, Math.ceil(((y + 1) / tileSize) * sh));
      const x0 = sx + localX0;
      const x1 = sx + localX1;
      const y0 = sy + localY0;
      const y1 = sy + localY1;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let samples = 0;
      for (let py = y0; py < Math.min(sy + sh, y1); py += 1) {
        for (let px = x0; px < Math.min(sx + sw, x1); px += 1) {
          const si = (py * source.width + px) * 4;
          const alpha = source.data[si + 3] ?? 0;
          const r = source.data[si] ?? 0;
          const g = source.data[si + 1] ?? 0;
          const b = source.data[si + 2] ?? 0;
          if (alpha < 20 || isKeyPixel(r, g, b) || isBlackKeyPixel(r, g, b)) continue;
          rSum += r * alpha;
          gSum += g * alpha;
          bSum += b * alpha;
          aSum += alpha;
          samples += 1;
        }
      }
      if (samples === 0 || aSum < 20) continue;
      blendPixel(target, dx + x, dy + y, Math.round(rSum / aSum), Math.round(gSum / aSum), Math.round(bSum / aSum), Math.round(aSum / samples));
    }
  }
}

function isKeyPixel(r: number, g: number, b: number): boolean {
  return r > 220 && g < 60 && b > 200;
}

function isBlackKeyPixel(r: number, g: number, b: number): boolean {
  return r < 6 && g < 6 && b < 6;
}

function treeSource(): PNG {
  cachedTreeSource ??= PNG.sync.read(readFileSync(treeSourcePath));
  return cachedTreeSource;
}

function showcaseWater(): PNG {
  cachedShowcaseWater ??= PNG.sync.read(readFileSync(showcaseWaterPath));
  return cachedShowcaseWater;
}

function showcaseRoad(): PNG {
  cachedShowcaseRoad ??= PNG.sync.read(readFileSync(showcaseRoadPath));
  return cachedShowcaseRoad;
}

function showcaseGrass(): PNG {
  cachedShowcaseGrass ??= PNG.sync.read(readFileSync(showcaseGrassPath));
  return cachedShowcaseGrass;
}

function fillNoise(png: PNG, dx: number, dy: number, r: number, g: number, b: number, amount: number, seed: number): void {
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const jitter = (mod(hash(x + seed, y - seed), amount * 2 + 1) - amount) | 0;
      setPixel(png, dx + x, dy + y, clamp(r + jitter), clamp(g + jitter), clamp(b + jitter), 255);
    }
  }
}

function setPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const i = (y * png.width + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function blendPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  const alpha = a / 255;
  png.data[i] = Math.round((png.data[i] ?? 0) * (1 - alpha) + r * alpha);
  png.data[i + 1] = Math.round((png.data[i + 1] ?? 0) * (1 - alpha) + g * alpha);
  png.data[i + 2] = Math.round((png.data[i + 2] ?? 0) * (1 - alpha) + b * alpha);
  png.data[i + 3] = 255;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}
