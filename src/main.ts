import Phaser from "phaser";
import "./style.css";
import {
  ABILITIES,
  SKILLS,
  CLASSES,
  CLASS_UNLOCKS,
  ITEMS,
  MAP_COLS,
  MAP_ROWS,
  MONSTERS,
  NPCS,
  SHOP,
  TILE_SIZE,
  TREE_TYPES,
  ZONES,
  floorCols,
  floorRows,
  contentScaleX,
  contentScaleY,
  isBlockedTile,
  isSafeZone,
  makeFloorTiles,
  tileAt,
  xpForLevel
} from "./shared.ts";
import type { ClassSpec } from "./shared.ts";
import { MAP_OBJECTS } from "./map-objects.ts";
import { setTrack, unlockAudio, setMusicEnabled, currentTrack } from "./audio.ts";
import { normalizeServerMessage, type WireServerMessage } from "./wire.ts";

// --- Music: per-zone score with a crossfade on transitions -----------------
// Track names map to /music/<name>.mp3 (see public/music/README.md). The OSRS
// titles in the design doc are the suggested fit per zone; supply your own.
const TITLE_TRACK = "scape-main";
const FLOOR_TRACK: Record<number, string> = {
  0: "garden", // Waystone hub
  1: "rest-in-peace", // Southgate Cemetery
  2: "spooky", // Ashen Crypt
  3: "harmony", // Northwood — central forest valley
  4: "borderland", // Northwatch outpost
  5: "swamp-fever", // The Sunken Marsh — rotten causeway
  6: "al-kharid", // The Searing Badlands — canyon ravines
  7: "the-desert", // The Sunken Desert
  8: "sea-shanty-2", // The Sunken Beach
  9: "tribal" // The Untamed Jungle
};
// A different cue when resting in a safe outpost.
const OUTPOST_TRACK: Record<number, string> = {
  5: "serenade", // Alchemist's Hut
  6: "mirage" // Frontier Camp
};
import type { ItemUse, TreeType } from "./content-types.ts";
import type {
  AbilityView,
  BuffsView,
  ClientMessage,
  CorpseView,
  Direction,
  FireView,
  FishingNodeView,
  GameEvent,
  HerbNodeView,
  InputPayload,
  InventoryItemView,
  MiningNodeView,
  MonsterView,
  NpcView,
  PlayerView,
  QuestView,
  SkillView,
  StateMetrics,
  StateSnapshot,
  TreeView
} from "./types.ts";

void MONSTERS;

// --- Local client-side structures -----------------------------------------

type TilePoint = { x: number; y: number };

interface PathNode {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: PathNode | null;
}

interface PathDestination {
  floor: number;
  x: number;
  y: number;
}

interface ApproachCandidate {
  x: number;
  y: number;
  score: number;
}

interface MovementInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  moveX: number;
  moveY: number;
}

interface MonsterActorSpec {
  family: string;
  width: number;
  height: number;
  yOffset: number;
  tint?: number;
}

interface TreeSpec {
  textureKey: string;
  width: number;
  height: number;
  zoneWidth: number;
  zoneHeight: number;
}

// A point-like target used for fishing approach math; floor + x/y is enough.
interface ApproachPoint {
  floor: number;
  x: number;
  y: number;
}

interface DynamicPathTarget {
  kind: string;
  id: string;
  x: number;
  y: number;
}

interface HoldMoveTile {
  x: number;
  y: number;
}

interface ActiveDialogue {
  lines: DialogueLine[];
  index: number;
  opensShop: boolean;
  opensAlchemist: boolean;
}

interface DialogueLine {
  speaker?: string;
  text?: string;
}

// Per-entity Phaser containers the client tracks. Containers carry extra
// fields (sub-objects, animation/interpolation state) bolted onto the base.
interface EntityView extends Phaser.GameObjects.Container {
  targetX?: number;
  targetY?: number;
  animFamily?: string;
  animDir?: Direction;
  animMoving?: boolean;
  animAttacking?: boolean;
  animWidth?: number;
  animHeight?: number;
  currentFrameKey?: string;
  currentFlipX?: boolean;
  sprite?: Phaser.GameObjects.Sprite;
}

interface ActorView extends EntityView {
  nameText: Phaser.GameObjects.Text;
  sprite: Phaser.GameObjects.Sprite;
}

interface PlayerEntityView extends ActorView {
  hp: Phaser.GameObjects.Rectangle;
  targetRing: Phaser.GameObjects.Ellipse;
}

interface MonsterEntityView extends ActorView {
  hp: Phaser.GameObjects.Rectangle;
  targetRing: Phaser.GameObjects.Ellipse;
}

interface NpcEntityView extends ActorView {}

interface TreeEntityView extends Phaser.GameObjects.Container {
  treeSprite: Phaser.GameObjects.Image;
  stump: Phaser.GameObjects.Rectangle;
  zone: Phaser.GameObjects.Zone;
  treeType: string;
}

interface FishingEntityView extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Image;
}

interface MiningEntityView extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Image;
}

interface HerbEntityView extends Phaser.GameObjects.Container {
  bloom: Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
}

interface FireEntityView extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Image;
  flame?: Phaser.GameObjects.GameObject & { setScale(x: number, y?: number): unknown };
}

interface Floater extends Phaser.GameObjects.Text {
  life: number;
}

type HotbarSlot =
  | { kind: "item"; itemId: string }
  | { kind: "ability"; abilityId: string }
  | null;

type HotbarDrag =
  | { source: "inventory"; itemId: string }
  | { source: "abilities"; abilityId: string }
  | { source: "hotbar"; slotIndex: number };

interface AbilityRowEntry {
  row: HTMLDivElement;
  nameEl: HTMLSpanElement;
  descEl: HTMLSpanElement;
  statusEl: HTMLSpanElement;
  progressEl: HTMLSpanElement;
  button: HTMLButtonElement;
}

interface SpriteFrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DirectionFrames {
  up: SpriteFrameBox[];
  right: SpriteFrameBox[];
  down: SpriteFrameBox[];
  left: SpriteFrameBox[];
}

interface DecorationSprite {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MapRenderState {
  floor: number;
  rows: string[];
  cols: number;
  rowCount: number;
  chunks: Map<string, Phaser.GameObjects.Container>;
  visibleChunkBoundsKey: string | null;
}

interface MapChunkStats {
  floor: number | null;
  chunkTiles: number;
  activeChunks: number;
  maxChunkTextureEdge: number;
}

interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface CharacterRosterEntry {
  name: string;
  level: number;
  gold: number;
}

interface E2EHooks {
  getState: () => StateSnapshot | null;
  self: () => PlayerView | undefined;
  fireScreenPoint: (id?: string | null) => { x: number; y: number } | null;
  send: (msg: ClientMessage) => void;
  stateVersion: () => number;
  actorFrameAnchorDrift: () => Array<{ family: string; dir: Direction; driftX: number; driftY: number }>;
  monsterTextureCoverage: (
    types?: string[]
  ) => Array<{
    type: string;
    family: string;
    frames: Array<{ dir: Direction; frame: number; key: string; exists: boolean }>;
    attackFamily?: string;
    attackFrames: Array<{ dir: Direction; frame: number; key: string; exists: boolean }>;
  }>;
  mapChunkStats: () => MapChunkStats;
  currentTrack: () => string | null;
  recentEvents: () => GameEvent[];
}

declare global {
  interface Window {
    __TIB_E2E__?: E2EHooks;
  }
}

let socket: WebSocket | null = null;
let selfId: string | null = null;
let latestState: StateSnapshot | null = null;
let selfView: PlayerView | undefined;
let stateVersion = 0;
let metricsVersion = 0;
let syncedStateVersion = -1;
let hudStateVersion = -1;
let renderedMetricsVersion = -1;
const chatLines: string[] = [];
const E2E_MODE = new URLSearchParams(location.search).has("e2e");
let renderedHudCoreSignature = "";
let renderedBuffSignature = "";
let renderedQuestSignature = "";
let renderedSkillSignature = "";
let renderedInventoryDataSignature = "";
let renderedInventorySignature = "";
let renderedAbilitySignature = "";
let renderedEquipmentSignature = "";
let renderedClassesSignature = "";
let renderedHotbarDataSignature = "";
const observedEvents: GameEvent[] = [];

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node as T;
}

const dom = {
  join: el<HTMLElement>("#join"),
  hud: el<HTMLElement>("#hud"),
  nameInput: el<HTMLInputElement>("#nameInput"),
  joinButton: el<HTMLButtonElement>("#joinButton"),
  refreshRosterButton: el<HTMLButtonElement>("#refreshRosterButton"),
  rosterList: el<HTMLElement>("#rosterList"),
  charName: el<HTMLElement>("#charName"),
  classLabel: el<HTMLElement>("#classLabel"),
  hpBar: el<HTMLElement>("#hpBar"),
  manaBar: el<HTMLElement>("#manaBar"),
  xpBar: el<HTMLElement>("#xpBar"),
  hpText: el<HTMLElement>("#hpText"),
  manaText: el<HTMLElement>("#manaText"),
  xpText: el<HTMLElement>("#xpText"),
  levelText: el<HTMLElement>("#levelText"),
  goldText: el<HTMLElement>("#goldText"),
  weaponText: el<HTMLElement>("#weaponText"),
  armorText: el<HTMLElement>("#armorText"),
  weightText: el<HTMLElement>("#weightText"),
  weightMax: el<HTMLElement>("#weightMax"),
  systemFeed: el<HTMLElement>("#systemFeed"),
  buffTracker: el<HTMLElement>("#buffTracker"),
  questTracker: el<HTMLElement>("#questTracker"),
  menuBackdrop: el<HTMLElement>("#menuBackdrop"),
  skillsButton: el<HTMLButtonElement>("#skillsButton"),
  inventoryButton: el<HTMLButtonElement>("#inventoryButton"),
  skillsPanel: el<HTMLElement>("#skillsPanel"),
  inventoryPanel: el<HTMLElement>("#inventoryPanel"),
  skillsCloseButton: el<HTMLButtonElement>("#skillsCloseButton"),
  inventoryCloseButton: el<HTMLButtonElement>("#inventoryCloseButton"),
  abilitiesButton: el<HTMLButtonElement>("#abilitiesButton"),
  abilitiesPanel: el<HTMLElement>("#abilitiesPanel"),
  abilitiesCloseButton: el<HTMLButtonElement>("#abilitiesCloseButton"),
  abilitiesList: el<HTMLElement>("#abilitiesList"),
  classesButton: el<HTMLButtonElement>("#classesButton"),
  classesPanel: el<HTMLElement>("#classesPanel"),
  classesCloseButton: el<HTMLButtonElement>("#classesCloseButton"),
  classList: el<HTMLElement>("#classList"),
  skillTracker: el<HTMLElement>("#skillTracker"),
  inventoryGrid: el<HTMLElement>("#inventoryGrid"),
  equipmentButton: el<HTMLButtonElement>("#equipmentButton"),
  equipmentPanel: el<HTMLElement>("#equipmentPanel"),
  equipmentCloseButton: el<HTMLButtonElement>("#equipmentCloseButton"),
  equipClass: el<HTMLElement>("#equipClass"),
  paperdoll: el<HTMLElement>("#paperdoll"),
  equipStats: el<HTMLElement>("#equipStats"),
  hotbar: el<HTMLElement>("#hotbar"),
  minimapCanvas: el<HTMLCanvasElement>("#minimapCanvas"),
  compassCanvas: el<HTMLCanvasElement>("#compassCanvas"),
  minimapZone: el<HTMLElement>("#minimapZone"),
  netStats: el<HTMLElement>("#netStats"),
  vendor: el<HTMLElement>("#vendor"),
  vendorCloseButton: el<HTMLButtonElement>("#vendorCloseButton"),
  alchemist: el<HTMLElement>("#alchemist"),
  alchemistCloseButton: el<HTMLButtonElement>("#alchemistCloseButton"),
  brewButton: el<HTMLButtonElement>("#brewButton"),
  dialogue: el<HTMLElement>("#dialogue"),
  dialogueSpeaker: el<HTMLElement>("#dialogueSpeaker"),
  dialogueLine: el<HTMLElement>("#dialogueLine"),
  dialogueNextButton: el<HTMLButtonElement>("#dialogueNextButton"),
  mapScreen: el<HTMLElement>("#mapScreen"),
  mapTitle: el<HTMLElement>("#mapTitle"),
  mapCanvas: el<HTMLCanvasElement>("#mapCanvas"),
  mapHint: el<HTMLElement>("#mapHint"),
  mapCloseButton: el<HTMLButtonElement>("#mapCloseButton"),
  mapBackButton: el<HTMLButtonElement>("#mapBackButton"),
  itemPopover: el<HTMLElement>("#itemPopover"),
  death: el<HTMLElement>("#death"),
  chatLog: el<HTMLElement>("#chatLog"),
  chatForm: el<HTMLFormElement>("#chatForm"),
  chatInput: el<HTMLInputElement>("#chatInput"),
  respawnButton: el<HTMLButtonElement>("#respawnButton"),
  loadingScreen: el<HTMLElement>("#loadingScreen"),
  loadingTitle: el<HTMLElement>("#loadingTitle"),
  loadingFlavor: el<HTMLElement>("#loadingFlavor"),
  loadingBarFill: el<HTMLElement>("#loadingBarFill"),
  titleScreen: el<HTMLElement>("#titleScreen"),
  tsScene: el<HTMLElement>("#tsScene"),
  titleSettings: el<HTMLElement>("#titleSettings"),
  titleCredits: el<HTMLElement>("#titleCredits"),
  titleExit: el<HTMLElement>("#titleExit"),
  settingSound: el<HTMLInputElement>("#settingSound"),
  settingParallax: el<HTMLInputElement>("#settingParallax"),
  settingMusic: el<HTMLInputElement>("#settingMusic"),
  joinBackdrop: el<HTMLElement>("#joinBackdrop"),
  joinBackButton: el<HTMLButtonElement>("#joinBackButton")
};

dom.joinButton.addEventListener("click", () => joinCharacter(dom.nameInput.value, true));
dom.refreshRosterButton.addEventListener("click", () => send({ type: "characters" }));
dom.respawnButton.addEventListener("click", () => send({ type: "respawn" }));
dom.skillsButton.addEventListener("click", () => toggleCenterPanel(dom.skillsPanel));
dom.inventoryButton.addEventListener("click", () => toggleCenterPanel(dom.inventoryPanel));
dom.equipmentButton.addEventListener("click", () => {
  toggleCenterPanel(dom.equipmentPanel);
  if (!dom.equipmentPanel.classList.contains("hidden")) renderEquipment(self());
});
dom.abilitiesButton.addEventListener("click", () => toggleCenterPanel(dom.abilitiesPanel));
dom.classesButton.addEventListener("click", () => {
  toggleCenterPanel(dom.classesPanel);
  if (!dom.classesPanel.classList.contains("hidden")) renderClasses(self());
});
dom.skillsCloseButton.addEventListener("click", () => hideCenterPanels());
dom.inventoryCloseButton.addEventListener("click", () => hideCenterPanels());
dom.equipmentCloseButton.addEventListener("click", () => hideCenterPanels());
dom.abilitiesCloseButton.addEventListener("click", () => hideCenterPanels());
dom.classesCloseButton.addEventListener("click", () => hideCenterPanels());
dom.vendorCloseButton.addEventListener("click", () => hideCenterPanels());
dom.alchemistCloseButton.addEventListener("click", () => hideCenterPanels());
dom.mapCloseButton.addEventListener("click", () => hideCenterPanels());
dom.mapBackButton.addEventListener("click", () => {
  mapView = "region";
  const me = self();
  if (me) renderMapScreen(me);
});
dom.mapCanvas.addEventListener("click", (event) => handleMapClick(event));
dom.menuBackdrop.addEventListener("click", () => hideCenterPanels());
dom.dialogueNextButton.addEventListener("click", advanceDialogue);
[dom.vendor, dom.alchemist].forEach((panel) => {
  panel.querySelectorAll<HTMLElement>("[data-buy]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.dataset.buy;
      if (item) send({ type: "buy", item });
    });
  });
});
dom.brewButton.addEventListener("click", () => send({ type: "brewPotion" }));
dom.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = dom.chatInput.value.trim();
  if (text) send({ type: "chat", text });
  dom.chatInput.value = "";
  dom.chatInput.blur();
});
document.addEventListener("focusin", () => {
  if (isTextEntryFocused()) sendStopInput();
  refreshKeyboardCapture();
});
document.addEventListener("focusout", () => setTimeout(refreshKeyboardCapture, 0));
document.addEventListener("keydown", stopTextEntryKeyPropagation);
document.addEventListener("keyup", stopTextEntryKeyPropagation);
window.addEventListener("blur", () => sendStopInput());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) sendStopInput();
});
setupTitleScreen();
ensureSocket();
if (E2E_MODE) {
  window.__TIB_E2E__ = {
    getState: () => latestState,
    self: () => self(),
    fireScreenPoint: (id: string | null = null) => {
      const fire = (latestState?.fires ?? []).find((item) => !id || item.id === id);
      const camera = scene?.cameras?.main;
      if (!fire || !camera) return null;
      return {
        x: (fire.x * TILE_SIZE - camera.worldView.x) * camera.zoom,
        y: (fire.y * TILE_SIZE - camera.worldView.y) * camera.zoom
      };
    },
    send,
    stateVersion: () => stateVersion,
    actorFrameAnchorDrift: () => actorFrameAnchorDrift(),
    monsterTextureCoverage: (types?: string[]) =>
      (types ?? []).map((type) => {
        const spec = monsterActorSpec({ type });
        const walkCount = FAMILY_WALK_FRAMES[spec.family] ?? 4;
        const frames = DIRECTIONS.flatMap((dir) =>
          Array.from({ length: walkCount }, (_, frame) => {
            const key = actorTextureKey(spec.family, dir, frame);
            return { dir, frame, key, exists: Boolean(scene?.textures?.exists?.(key)) };
          })
        );
        const attackFamily = ATTACK_FAMILY[spec.family];
        const attackFrames = attackFamily
          ? DIRECTIONS.flatMap((dir) =>
              Array.from({ length: ATTACK_FAMILY_FRAMES[attackFamily] ?? 4 }, (_, frame) => {
                const key = actorTextureKey(attackFamily, dir, frame);
                return { dir, frame, key, exists: Boolean(scene?.textures?.exists?.(key)) };
              })
            )
          : [];
        return { type, family: spec.family, frames, attackFamily, attackFrames };
      }),
    mapChunkStats: () => mapChunkStats(),
    currentTrack: () => currentTrack(),
    recentEvents: () => observedEvents.slice(-80)
  };
}

const game = new Phaser.Game({
  type: E2E_MODE ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#111412",
  pixelArt: true,
  scene: { preload, create, update },
  // Listen for pointer events on the canvas only, not the window. Otherwise
  // clicks on the HTML HUD/menus also reach Phaser and hit-test world entities
  // behind them — e.g. opening the inventory would path the player to an NPC.
  input: { windowEvents: false },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
});
void game;

let scene: Phaser.Scene;
let cursors: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
let keys: Record<string, Phaser.Input.Keyboard.Key>;
let lastInputAt = 0;
let lastInputBits = -1;
let lastInputMoveX = Number.NaN;
let lastInputMoveY = Number.NaN;
let lastMinimapDrawAt = 0;
let currentFloor: number | null = null;
let clickDestination: PathDestination | null = null;
let clickPath: PathDestination[] = [];
let pendingTreeCut: string | null = null;
let pendingAttackTarget: string | null = null;
let pendingLootTarget: string | null = null;
let pendingNpcTalk: string | null = null;
let pendingFishingNode: string | null = null;
let pendingMiningNode: string | null = null;
let pendingHerbNode: string | null = null;
let pendingCookingFire: string | null = null;
let dynamicPathTarget: DynamicPathTarget | null = null;
let lastDynamicPathRefreshAt = 0;
let clickMarker: Phaser.GameObjects.Ellipse | null = null;
let holdMoveActive = false;
let holdMoveTile: HoldMoveTile | null = null;
let holdMoveLastRepathAt = 0;
const HOLD_MOVE_REPATH_MS = 80;
const MINIMAP_DRAW_MS = 100;
const MAP_CHUNK_TILES = 16;
const MAP_CHUNK_PADDING = 1;
let mapLayer: Phaser.GameObjects.Container;
let entityLayer: Phaser.GameObjects.Container;
let fxLayer: Phaser.GameObjects.Container;
let mapRender: MapRenderState | null = null;
const playerViews = new Map<string, PlayerEntityView>();
const monsterViews = new Map<string, MonsterEntityView>();
const corpseViews = new Map<string, Phaser.GameObjects.Container>();
const npcViews = new Map<string, NpcEntityView>();
const treeViews = new Map<string, TreeEntityView>();
const fishingViews = new Map<string, FishingEntityView>();
const miningViews = new Map<string, MiningEntityView>();
const herbViews = new Map<string, HerbEntityView>();
const fireViews = new Map<string, FireEntityView>();
const interpolatingEntityViews = new Set<EntityView>();
const animatingActorViews = new Set<EntityView>();
const visiblePlayerIds = new Set<string>();
const visibleMonsterIds = new Set<string>();
const visibleCorpseIds = new Set<string>();
const visibleNpcIds = new Set<string>();
const visibleTreeIds = new Set<string>();
const visibleFishingNodeIds = new Set<string>();
const visibleMiningNodeIds = new Set<string>();
const visibleHerbNodeIds = new Set<string>();
const visibleFireIds = new Set<string>();
const floaters: Floater[] = [];
let selectedInventorySlot: number | null = null;
let selectedInventoryItem: string | null = null;
let activeDialogue: ActiveDialogue | null = null;
const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
const WALK_FRAME_MS = 125;
const ATTACK_FRAME_MS = 110;
// Runtime families generated by tools/generate_woodland_enemy_sprites_v2.py.
// Keep this aligned with docs/enemy-asset-pipeline.md and validate with
// `npm run assets:enemies:check` after adding an enemy.
const WOODLAND_BESPOKE_FAMILIES = [
  "dire_wolf",
  "orc",
  "ghoul",
  "wild_boar",
  "thorn_hedgehog",
  "forest_spider",
  "forest_slime",
  "mushroom_brute",
  "sapling_deer",
  "ancient_treant",
  "bone_druid",
  "forest_pixie",
  "bog_wraith",
  "grave_revenant",
  "crypt_sentinel",
  "pale_banshee"
] as const;
// Walk cycles are 4 frames unless a family overrides it here.
const FAMILY_WALK_FRAMES: Record<string, number> = {
  mire_spitter: 3,
  ...Object.fromEntries(WOODLAND_BESPOKE_FAMILIES.map((family) => [family, 8]))
};
// Families with a bespoke attack animation: base family -> attack texture family.
const ATTACK_FAMILY: Record<string, string> = {
  skitterer: "skittererAtk",
  mire_spitter: "mireSpitterAtk",
  ...Object.fromEntries(WOODLAND_BESPOKE_FAMILIES.map((family) => [family, `${family}Atk`]))
};
const ATTACK_FAMILY_FRAMES: Record<string, number> = {
  skittererAtk: 3,
  mireSpitterAtk: 4,
  ...Object.fromEntries(WOODLAND_BESPOKE_FAMILIES.map((family) => [`${family}Atk`, 8]))
};
const DYNAMIC_PATH_REFRESH_MS = 350;
const DYNAMIC_PATH_REFRESH_DISTANCE = 0.65;
function itemUseKind(itemId: string | null): ItemUse["kind"] | null {
  if (!itemId) return null;
  return ITEMS[itemId]?.use?.kind ?? null;
}

function preload(this: Phaser.Scene): void {
  scene = this;
  this.load.image("playerSheet", "/player-sheet.png");
  this.load.image("goblinSheet", "/goblin.png");
  this.load.image("skeletonSheet", "/skeleton.png");
  this.load.image("ratSpiderSheet", "/ratandspiders.png");
  this.load.image("goblinScoutSheet", "/goblin-scout-sheet.png");
  this.load.image("goblinShamanSheet", "/goblin-shaman-sheet.png");
  this.load.image("goblinRaiderSheet", "/goblin-raider-sheet.png");
  this.load.image("greyWolfSheet", "/grey-wolf-sheet.png");
  this.load.image("wispSheet", "/wisp-sheet.png");
  for (const family of WOODLAND_BESPOKE_FAMILIES) {
    this.load.image(woodlandBespokeSheetKey(family), `/${family.replaceAll("_", "-")}-sheet.png`);
  }
  this.load.image("newEnemiesSheet", "/new-enemies.png");
  this.load.image("swampEnemySheet", "/skitterer-spitter.png");
  this.load.image("uiSheet", "/ui-sheet.png");
  this.load.image("townTiles", "/towntiles.png");
  this.load.image("forestTiles", "/foresttiles.png");
  this.load.image("graveyardTiles", "/graveyardtiles.png");
  this.load.image("darkForestTiles", "/dark-forest-tiles.png");
  this.load.image("swampTiles", "/swamp-tiles.png");
  this.load.image("badlandsTiles", "/badlands-tiles.png");
  this.load.image("desertTiles", "/desert-tiles.png");
  this.load.image("beachTiles", "/beach-tiles.png");
  this.load.image("jungleTiles", "/jungle-tiles.png");
  this.load.image("effectsSheet", "/effects.png");
  this.load.image("waterFishingSpots", "/water-fishing-spots.png");
  this.load.image("oreNodeSheet", "/ore-rock-gathering-nodes.png");
  this.load.image("spriteCampfire", "/campfire.png");
  this.load.image("herbBloom", "/herb-bloom.png");
  this.load.image("herbField", "/herb-field.png");
  this.load.image("herbTidal", "/herb-tidal.png");
}

function create(this: Phaser.Scene): void {
  createActorFrames(this);
  createEffectFrames(this);
  makeTileTexture(this, "townTiles", "tileGrass", 24, 24, 84, 84);
  makeTileTexture(this, "townTiles", "tileStone", 236, 248, 84, 84);
  makeTileTexture(this, "townTiles", "tileTownFloor", 1004, 794, 84, 84);
  makeTileTexture(this, "townTiles", "tileDirt", 236, 24, 84, 84);
  makeTileTexture(this, "forestTiles", "tileForest", 24, 34, 84, 84);
  makeTileTexture(this, "forestTiles", "tileRock", 1120, 794, 84, 84);
  makeTileTexture(this, "graveyardTiles", "tileGraveDirt", 24, 34, 84, 84);
  makeTileTexture(this, "graveyardTiles", "tileGravePath", 612, 860, 84, 84);
  makeTileTexture(this, "townTiles", "tileWater", 24, 248, 84, 84);
  makeSpriteTexture(this, "forestTiles", "spriteTree", 578, 28, 120, 150);
  makeSpriteTexture(this, "forestTiles", "spritePine", 820, 30, 82, 150);
  makeSpriteTexture(this, "forestTiles", "spriteRock", 640, 500, 92, 72);
  // First sprite wired from the reviewed dark-forest source sheet (see
  // assetsources/asset-review.md). Background normalized to the project magenta
  // key before copying into public/. Crop is the boulder cluster in the sheet's
  // "ROCKS & BOULDERS" block.
  makeSpriteTexture(this, "darkForestTiles", "spriteBoulder", 1128, 590, 42, 54);
  makeSpriteTexture(this, "waterFishingSpots", "spriteFishingRipple", 920, 800, 70, 70);
  // Mining nodes wired from the reviewed ore/rock gathering source sheet (see
  // assetsources/asset-review.md). Crops are the stage-1 "rich" veins from the
  // sheet's left ORE VEINS column — copper (row 1), tin (row 2), iron (row 3),
  // each one row (~83px) down from the last. The sheet ships on the project
  // magenta key, so it chroma-keys cleanly without normalization.
  makeSpriteTexture(this, "oreNodeSheet", "spriteCopperVein", 193, 107, 123, 66);
  makeSpriteTexture(this, "oreNodeSheet", "spriteTinVein", 193, 190, 123, 66);
  makeSpriteTexture(this, "oreNodeSheet", "spriteIronVein", 193, 273, 123, 66);
  makeSpriteTexture(this, "graveyardTiles", "spriteGrave", 580, 360, 58, 78);
  makeSpriteTexture(this, "graveyardTiles", "spriteFence", 20, 552, 126, 66);
  makeSpriteTexture(this, "graveyardTiles", "spriteDeadTree", 548, 18, 116, 198);
  makeSpriteTexture(this, "graveyardTiles", "spriteCrypt", 1164, 18, 116, 202);
  makeSpriteTexture(this, "graveyardTiles", "spriteMausoleum", 1148, 260, 132, 170);
  makeSpriteTexture(this, "graveyardTiles", "spriteStoneWall", 20, 356, 126, 64);
  makeSpriteTexture(this, "graveyardTiles", "spriteObelisk", 806, 176, 66, 102);
  makeSpriteTexture(this, "townTiles", "spritePortal", 828, 424, 86, 132);
  makeSpriteTexture(this, "townTiles", "spriteBridge", 20, 466, 92, 56);
  makeSpriteTexture(this, "townTiles", "spriteWell", 824, 420, 94, 132);
  makeSpriteTexture(this, "townTiles", "spriteRedHouse", 996, 22, 238, 176);
  makeSpriteTexture(this, "townTiles", "spriteBlueHouse", 996, 374, 250, 180);
  makeSpriteTexture(this, "townTiles", "spriteGreenHouse", 1272, 374, 142, 178);
  makeSpriteTexture(this, "townTiles", "spriteThatchHouse", 1294, 24, 130, 176);
  makeSpriteTexture(this, "townTiles", "spriteMarket", 1208, 786, 188, 84);
  makeSpriteTexture(this, "townTiles", "spriteSign", 616, 420, 74, 90);
  makeSpriteTexture(this, "townTiles", "spriteLamp", 912, 424, 38, 136);
  makeSpriteTexture(this, "townTiles", "spriteBarrels", 1200, 700, 90, 70);
  // Sunken Marsh (floor 5). Crops dialed in from assetsources/deferred/swamp-biome-tiles.png
  // (1536x1024, magenta-keyed) — ground/dirt/water tiles, a plank bridge, and swamp props.
  makeTileTexture(this, "swampTiles", "tileMarsh", 18, 98, 69, 72);
  makeTileTexture(this, "swampTiles", "tileSwampDirt", 97, 98, 67, 72);
  makeTileTexture(this, "swampTiles", "tileSwampWater", 1041, 102, 74, 71);
  makeTileTexture(this, "swampTiles", "tileBridge", 95, 744, 68, 66);
  makeSpriteTexture(this, "swampTiles", "spriteSwampBoulder", 1150, 392, 62, 50);
  makeSpriteTexture(this, "swampTiles", "spriteMireLotus", 820, 388, 38, 36);
  makeSpriteTexture(this, "swampTiles", "spriteCliffLedge", 714, 958, 70, 58);
  // Searing Badlands (floor 6). Crops from assetsources/rejected/badlands-biome-tiles-01.png
  // (1536x1024, magenta-keyed) — rust ground/rock/cliff/pit/ramp tiles + a frontier tent.
  makeTileTexture(this, "badlandsTiles", "tileBadlands", 18, 99, 70, 74);
  makeTileTexture(this, "badlandsTiles", "tileBadlandsRock", 180, 99, 73, 74);
  makeTileTexture(this, "badlandsTiles", "tileMassif", 180, 180, 72, 74); // dark impassable rock bulk behind cliff faces
  makeTileTexture(this, "badlandsTiles", "tileCliff", 528, 100, 68, 82);
  makeTileTexture(this, "badlandsTiles", "tilePit", 1346, 188, 72, 70);
  makeTileTexture(this, "badlandsTiles", "tileRamp", 392, 864, 68, 80);
  makeSpriteTexture(this, "badlandsTiles", "spriteTent", 1070, 873, 92, 72);
  makeSpriteTexture(this, "badlandsTiles", "spriteBadlandsLedge", 20, 862, 72, 86);
  // Sunken Desert (floor 7). Crops from assetsources/rejected/desert-biome-tiles.png
  // (1536x1024, magenta-keyed) — sand/quicksand/oasis tiles + palm, market tent, ledge.
  makeTileTexture(this, "desertTiles", "tileSand", 25, 101, 71, 73);
  makeTileTexture(this, "desertTiles", "tileQuicksand", 1344, 188, 70, 70);
  makeTileTexture(this, "desertTiles", "tileOasisWater", 98, 862, 70, 72);
  makeSpriteTexture(this, "desertTiles", "spriteOutpostTent", 1364, 854, 104, 84);
  makeSpriteTexture(this, "desertTiles", "spritePalm", 1456, 958, 62, 58);
  makeSpriteTexture(this, "desertTiles", "spriteDesertLedge", 22, 856, 66, 86);
  // Sunken Beach (floor 8). Crops from assetsources/rejected/beach-biome-tiles.png.
  makeTileTexture(this, "beachTiles", "tileBeachSand", 20, 99, 70, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShellSand", 180, 99, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachPebbleSand", 340, 99, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachMossyStone", 180, 180, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachWetSand", 20, 180, 70, 72);
  makeTileTexture(this, "beachTiles", "tileBeachRippleSand", 100, 99, 70, 72);
  makeTileTexture(this, "beachTiles", "tileBeachWoodPlanks", 100, 262, 70, 72);
  makeTileTexture(this, "beachTiles", "tileBeachPath", 96, 402, 70, 72);
  makeTileTexture(this, "beachTiles", "tileBeachStairs", 390, 864, 72, 82, 0);
  makeTileTexture(this, "beachTiles", "tileBeachCliff", 596, 100, 72, 82, 0);
  makeTileTexture(this, "beachTiles", "tileBeachCliffLeft", 528, 100, 72, 82, 0);
  makeTileTexture(this, "beachTiles", "tileBeachCliffRight", 740, 100, 72, 82, 0);
  makeTileTexture(this, "beachTiles", "tileBeachRock", 1048, 482, 70, 62);
  makeTileTexture(this, "beachTiles", "tileBeachShore", 1200, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreNorth", 1040, 260, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreEast", 1144, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreSouth", 1232, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreWest", 1056, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreCornerNW", 1216, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreCornerNE", 1216, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreCornerSW", 1216, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachShoreCornerSE", 1216, 100, 72, 72);
  makeTileTexture(this, "beachTiles", "tileBeachLagoon", 1130, 101, 72, 72);
  makeTileTexture(this, "beachTiles", "tileOcean", 1052, 101, 72, 72);
  makeSpriteTexture(this, "beachTiles", "spriteBeachHut", 1366, 860, 116, 118);
  makeSpriteTexture(this, "beachTiles", "spriteBeachDock", 642, 650, 168, 86);
  makeSpriteTexture(this, "beachTiles", "spriteBeachBoat", 560, 722, 74, 48);
  makeSpriteTexture(this, "beachTiles", "spriteBeachCave", 714, 840, 104, 102);
  makeSpriteTexture(this, "beachTiles", "spriteBeachTent", 1040, 866, 92, 70);
  makeSpriteTexture(this, "beachTiles", "spriteBeachCampfire", 1160, 872, 72, 66);
  makeSpriteTexture(this, "beachTiles", "spriteBeachPalm", 1438, 944, 86, 72);
  makeSpriteTexture(this, "beachTiles", "spriteBeachRocks", 1204, 402, 88, 74);
  makeSpriteTexture(this, "beachTiles", "spriteBeachBoulder", 1224, 384, 112, 72);
  makeSpriteTexture(this, "beachTiles", "spriteBeachFlowerYellow", 528, 398, 44, 34);
  makeSpriteTexture(this, "beachTiles", "spriteBeachFlowerWhite", 672, 398, 46, 34);
  makeSpriteTexture(this, "beachTiles", "spriteBeachStump", 676, 482, 56, 46);
  makeSpriteTexture(this, "beachTiles", "spriteBeachBonePile", 528, 482, 70, 34);
  makeSpriteTexture(this, "beachTiles", "spriteBeachLogPile", 910, 476, 92, 54);
  makeSpriteTexture(this, "beachTiles", "spriteBeachBarrel", 438, 732, 46, 58);
  makeSpriteTexture(this, "beachTiles", "spriteBeachWell", 1200, 674, 64, 92);
  makeSpriteTexture(this, "beachTiles", "spriteBeachFence", 20, 744, 230, 62);
  makeSpriteTexture(this, "beachTiles", "spriteBeachStoneWall", 1112, 680, 116, 70);
  makeSpriteTexture(this, "beachTiles", "spriteBeachSign", 340, 650, 62, 72);
  makeSpriteTexture(this, "beachTiles", "spriteBeachRuin", 842, 680, 70, 76);
  // Untamed Jungle (floor 9). Crops from assetsources/rejected/jungle-biome-tiles.png.
  makeTileTexture(this, "jungleTiles", "tileJungle", 18, 97, 72, 74);
  makeTileTexture(this, "jungleTiles", "tileJungleWall", 524, 100, 68, 82);
  makeTileTexture(this, "jungleTiles", "tileJungleRiver", 1069, 100, 72, 72);
  makeSpriteTexture(this, "jungleTiles", "spriteJungleVault", 676, 862, 120, 100);

  mapLayer = this.add.container(0, 0);
  entityLayer = this.add.container(0, 0);
  fxLayer = this.add.container(0, 0);
  this.cameras.main.setBounds(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
  this.cameras.main.setZoom(1.35);

  const keyboard = this.input.keyboard;
  if (!keyboard) throw new Error("Keyboard input plugin unavailable");
  cursors = keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.UP,
    down: Phaser.Input.Keyboard.KeyCodes.DOWN,
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT
  }, false) as typeof cursors;
  keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB]);
  keys = keyboard.addKeys("W,A,S,D,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,F,B,M,ENTER,TAB", false) as Record<string, Phaser.Input.Keyboard.Key>;
  const hotbarKeys = [keys.ONE, keys.TWO, keys.THREE, keys.FOUR, keys.FIVE, keys.SIX, keys.SEVEN, keys.EIGHT];
  hotbarKeys.forEach((key, index) => {
    if (!key) return;
    key.on("down", () => {
      if (isTextEntryFocused()) return;
      if (activateHotbarSlot(index)) return;
      // Empty slot 1 still fires the default Magic strike; a bound item/ability
      // slot consumes the key above before reaching this fallback.
      if (index === 0) send({ type: "ability", slot: "1" });
    });
  });
  keys.F?.on("down", () => {
    if (!isTextEntryFocused()) send({ type: "loot" });
  });
  keys.B?.on("down", () => {
    if (!isTextEntryFocused()) toggleCenterPanel(dom.vendor);
  });
  keys.M?.on("down", () => {
    if (!isTextEntryFocused()) toggleMapScreen();
  });
  keys.ENTER?.on("down", () => {
    if (!isTextEntryFocused()) dom.chatInput.focus();
  });
  keyboard.on("keydown-TAB", (event: KeyboardEvent) => {
    if (isTextEntryFocused()) return;
    event.preventDefault();
    cycleTarget();
  });
  this.input.on("pointerdown", handleWorldClick);
  refreshKeyboardCapture();
}

function update(this: Phaser.Scene, time: number): void {
  if (!latestState || !self()) return;
  const me = self();
  if (!me) return;
  applyZoneMusic(me);
  if (currentFloor !== me.floor) {
    clearResourceViews();
    drawMap(me.floor, { x: me.x, y: me.y });
    syncedStateVersion = -1;
    clearClickDestination();
  }
  if (syncedStateVersion !== stateVersion) {
    syncEntities();
    syncedStateVersion = stateVersion;
  }
  interpolateEntities();
  animateEntities();
  if (hudStateVersion !== stateVersion) {
    renderHud(me);
    hudStateVersion = stateVersion;
  }
  if (renderedMetricsVersion !== metricsVersion) {
    renderMetrics(latestState.metrics);
    renderedMetricsVersion = metricsVersion;
  }
  sendInput(time);
  tickHoldMove(time);
  updateFloaters();
  const ownView = selfId ? playerViews.get(selfId) : undefined;
  if (ownView) {
    scene.cameras.main.centerOn(ownView.x, ownView.y);
    updateVisibleMapChunks();
  }
  if (time - lastMinimapDrawAt >= MINIMAP_DRAW_MS) {
    drawMinimap(me);
    lastMinimapDrawAt = time;
  }
  drawCompass(me.dir);
  updateFog(me, time);
  if (!dom.mapScreen.classList.contains("hidden")) renderMapScreen(me);
}

function ensureSocket(): void {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.hostname}:8787`);
  socket.addEventListener("open", () => {
    send({ type: "characters" });
    dom.rosterList.textContent = "Choose a character or create a new one.";
  });
  socket.addEventListener("message", (event) => {
    const message = normalizeServerMessage(JSON.parse(event.data as string) as WireServerMessage);
    if (message.type === "characters") renderRoster(message.characters ?? []);
    if (message.type === "characterDeleted" && !message.ok) dom.rosterList.textContent = "That character is online or no longer exists.";
    if (message.type === "welcome") selfId = message.id;
    if (message.type === "state") {
      const hadState = latestState != null;
      latestState = mergeStateSnapshot(latestState, message);
      selfView = resolveSelfView(latestState);
      if (!hadState || snapshotHasEntityChanges(message)) stateVersion += 1;
      if (message.metrics) metricsVersion += 1;
      if ((message.events ?? []).length > 0) consumeEvents(message.events ?? []);
    }
  });
  socket.addEventListener("close", () => {
    addSystemLine("Disconnected from server.");
    if (!selfId) dom.rosterList.textContent = "Disconnected. Refresh to retry.";
  });
  socket.addEventListener("error", () => addSystemLine("Connection error. Refresh if the world stops updating."));
}

function mergeStateSnapshot(previous: StateSnapshot | null, next: StateSnapshot): StateSnapshot {
  if (!previous) return withSnapshotDefaults(next);
  return {
    ...next,
    players: mergeEntityViews(previous.players, next.players, next.removedPlayerIds, next.playersFull),
    monsters: mergeEntityViews(previous.monsters, next.monsters, next.removedMonsterIds, next.monstersFull),
    corpses: mergeEntityViews(previous.corpses, next.corpses, next.removedCorpseIds, next.corpsesFull),
    npcs: mergeEntityViews(previous.npcs, next.npcs, next.removedNpcIds, next.npcsFull),
    trees: mergeEntityViews(previous.trees, next.trees, next.removedTreeIds, next.treesFull),
    fishingNodes: mergeEntityViews(previous.fishingNodes, next.fishingNodes, next.removedFishingNodeIds, next.fishingNodesFull),
    miningNodes: mergeEntityViews(previous.miningNodes, next.miningNodes, next.removedMiningNodeIds, next.miningNodesFull),
    herbNodes: mergeEntityViews(previous.herbNodes, next.herbNodes, next.removedHerbNodeIds, next.herbNodesFull),
    fires: mergeEntityViews(previous.fires, next.fires, next.removedFireIds, next.firesFull),
    metrics: next.metrics ?? previous.metrics
  };
}

function resolveSelfView(state: StateSnapshot | null): PlayerView | undefined {
  return selfId ? state?.players.find((player) => player.id === selfId) : undefined;
}

function snapshotHasEntityChanges(snapshot: StateSnapshot): boolean {
  return Boolean(
    snapshot.playersFull ||
      snapshot.monstersFull ||
      snapshot.corpsesFull ||
      snapshot.npcsFull ||
      snapshot.treesFull ||
      snapshot.fishingNodesFull ||
      snapshot.miningNodesFull ||
      snapshot.herbNodesFull ||
      snapshot.firesFull ||
      snapshot.players.length > 0 ||
      snapshot.monsters.length > 0 ||
      snapshot.corpses.length > 0 ||
      snapshot.npcs.length > 0 ||
      snapshot.trees.length > 0 ||
      snapshot.fishingNodes.length > 0 ||
      snapshot.miningNodes.length > 0 ||
      snapshot.herbNodes.length > 0 ||
      snapshot.fires.length > 0 ||
      (snapshot.removedPlayerIds?.length ?? 0) > 0 ||
      (snapshot.removedMonsterIds?.length ?? 0) > 0 ||
      (snapshot.removedCorpseIds?.length ?? 0) > 0 ||
      (snapshot.removedNpcIds?.length ?? 0) > 0 ||
      (snapshot.removedTreeIds?.length ?? 0) > 0 ||
      (snapshot.removedFishingNodeIds?.length ?? 0) > 0 ||
      (snapshot.removedMiningNodeIds?.length ?? 0) > 0 ||
      (snapshot.removedHerbNodeIds?.length ?? 0) > 0 ||
      (snapshot.removedFireIds?.length ?? 0) > 0
  );
}

function withSnapshotDefaults(snapshot: StateSnapshot): StateSnapshot {
  return {
    ...snapshot,
    playersFull: snapshot.playersFull ?? true,
    removedPlayerIds: snapshot.removedPlayerIds ?? [],
    monstersFull: snapshot.monstersFull ?? true,
    removedMonsterIds: snapshot.removedMonsterIds ?? [],
    corpsesFull: snapshot.corpsesFull ?? true,
    removedCorpseIds: snapshot.removedCorpseIds ?? [],
    npcsFull: snapshot.npcsFull ?? true,
    removedNpcIds: snapshot.removedNpcIds ?? [],
    treesFull: snapshot.treesFull ?? true,
    removedTreeIds: snapshot.removedTreeIds ?? [],
    fishingNodesFull: snapshot.fishingNodesFull ?? true,
    removedFishingNodeIds: snapshot.removedFishingNodeIds ?? [],
    miningNodesFull: snapshot.miningNodesFull ?? true,
    removedMiningNodeIds: snapshot.removedMiningNodeIds ?? [],
    herbNodesFull: snapshot.herbNodesFull ?? true,
    removedHerbNodeIds: snapshot.removedHerbNodeIds ?? [],
    firesFull: snapshot.firesFull ?? true,
    removedFireIds: snapshot.removedFireIds ?? []
  };
}

function mergeEntityViews<T extends { id: string }>(previous: T[], updates: T[], removedIds: string[] = [], full = true): T[] {
  if (full) return updates;
  if (updates.length === 0 && removedIds.length === 0) return previous;
  if (previous.length === 0) return updates;
  const byId = new Map(previous.map((item) => [item.id, item]));
  for (const id of removedIds) byId.delete(id);
  for (const item of updates) byId.set(item.id, item);
  return [...byId.values()];
}

function zoneTrackFor(me: PlayerView): string {
  const outpost = OUTPOST_TRACK[me.floor];
  if (outpost && isSafeZone(me.floor, me.x, me.y)) return outpost;
  return FLOOR_TRACK[me.floor] ?? TITLE_TRACK;
}

function applyZoneMusic(me: PlayerView): void {
  setTrack(zoneTrackFor(me));
}

// --- Title screen ("The Coastal Overlook") ---------------------------------
let titleSoundOn = true;
let titleParallaxOn = true;
let titleAudioCtx: AudioContext | null = null;

function setupTitleScreen(): void {
  // In e2e the title is skipped so specs land straight on the login form (no
  // title backdrop, so the "back to title" affordance is irrelevant there). The
  // zone-music mapping still updates currentTrack() for assertions, but audio is
  // never unlocked, so no playback is attempted under test.
  if (E2E_MODE) {
    dom.titleScreen.classList.add("hidden");
    dom.joinBackButton.classList.add("hidden");
    dom.join.classList.remove("hidden");
    return;
  }

  // Queue the title theme; browsers only allow playback after a user gesture.
  setTrack(TITLE_TRACK);
  const unlock = (): void => unlockAudio();
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
  dom.settingMusic.addEventListener("change", () => setMusicEnabled(dom.settingMusic.checked));

  dom.joinBackButton.addEventListener("click", () => closeCharacterSelect());

  dom.settingSound.addEventListener("change", () => {
    titleSoundOn = dom.settingSound.checked;
  });
  dom.settingParallax.addEventListener("change", () => {
    titleParallaxOn = dom.settingParallax.checked;
    if (!titleParallaxOn) resetTitleParallax();
  });

  dom.titleScreen.querySelectorAll<HTMLElement>("[data-title-action]").forEach((button) => {
    button.addEventListener("click", () => handleTitleAction(button.dataset.titleAction ?? ""));
    if (button.classList.contains("ts-btn")) {
      button.addEventListener("pointerenter", () => playTitleHover());
    }
  });

  dom.tsScene.addEventListener("pointermove", onTitleParallax);
}

function handleTitleAction(action: string): void {
  switch (action) {
    case "embark":
      openCharacterSelect();
      break;
    case "settings":
      dom.titleSettings.classList.remove("hidden");
      break;
    case "close-settings":
      dom.titleSettings.classList.add("hidden");
      break;
    case "credits":
      dom.titleCredits.classList.remove("hidden");
      break;
    case "close-credits":
      dom.titleCredits.classList.add("hidden");
      break;
    case "exit":
      dom.titleExit.classList.remove("hidden");
      break;
    case "close-exit":
      dom.titleExit.classList.add("hidden");
      break;
    case "confirm-exit":
      leaveGame();
      break;
    default:
      break;
  }
}

// Embark opens the character-select over the title scene, which stays as a
// living backdrop; "Back to title" closes it again.
function openCharacterSelect(): void {
  dom.joinBackdrop.classList.remove("hidden");
  dom.join.classList.remove("hidden");
  playTitleHover();
}

function closeCharacterSelect(): void {
  dom.join.classList.add("hidden");
  dom.joinBackdrop.classList.add("hidden");
}

function leaveGame(): void {
  sendStopInput();
  // A browser tab can't be force-closed unless it was script-opened; try, then
  // fall back to a calm goodbye screen.
  window.close();
  document.body.innerHTML =
    '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:#07090a;color:#9ee6b1;font-family:Georgia,serif;font-size:20px;letter-spacing:0.1em;text-align:center;">' +
    "Safe travels, wanderer.<br><br>" +
    '<span style="font-size:13px;color:#8a9b8e;">You may close this tab.</span></div>';
}

function onTitleParallax(event: PointerEvent): void {
  if (!titleParallaxOn) return;
  const dx = event.clientX / window.innerWidth - 0.5;
  const dy = event.clientY / window.innerHeight - 0.5;
  dom.tsScene.querySelectorAll<HTMLElement>(".ts-layer").forEach((layer) => {
    const depth = Number(layer.dataset.depth ?? 0);
    layer.style.transform = `translate(${(-dx * depth).toFixed(1)}px, ${(-dy * depth * 0.6).toFixed(1)}px)`;
  });
}

function resetTitleParallax(): void {
  dom.tsScene.querySelectorAll<HTMLElement>(".ts-layer").forEach((layer) => {
    layer.style.transform = "";
  });
}

function playTitleHover(): void {
  if (!titleSoundOn) return;
  try {
    if (!titleAudioCtx) titleAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = titleAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    // A short, soft "stone slide" — low triangle tone through a quick low-pass.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    // Audio is a nicety; never let it break the menu.
  }
}

function joinCharacter(name: string, fresh = false): void {
  ensureSocket();
  const clean = String(name ?? "").trim();
  if (!clean) return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    send({ type: "join", name: clean, fresh });
    dom.join.classList.add("hidden");
    dom.joinBackdrop.classList.add("hidden");
    dom.titleScreen.classList.add("hidden");
    dom.hud.classList.remove("hidden");
    addSystemLine("Connected to Waystone.");
    return;
  }
  dom.rosterList.textContent = "Connecting...";
  socket?.addEventListener("open", () => joinCharacter(clean, fresh), { once: true });
}

function renderRoster(characters: CharacterRosterEntry[]): void {
  if (!characters.length) {
    dom.rosterList.textContent = "No saved characters yet.";
    return;
  }
  dom.rosterList.innerHTML = characters
    .map((character) => `
      <div class="roster-row">
        <div><strong>${escapeHtml(character.name)}</strong><small>Level ${character.level} · ${character.gold}g</small></div>
        <button data-play="${escapeHtml(character.name)}">Play</button>
        <button data-delete="${escapeHtml(character.name)}">Delete</button>
      </div>
    `)
    .join("");
  dom.rosterList.querySelectorAll<HTMLElement>("[data-play]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.play;
      if (name) joinCharacter(name, false);
    });
  });
  dom.rosterList.querySelectorAll<HTMLElement>("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.delete;
      if (name) send({ type: "deleteCharacter", name });
    });
  });
}

function drawMap(floor: number, center?: TilePoint): void {
  currentFloor = floor;
  hideLoadingScreen();
  mapLayer.removeAll(true);
  const rows = makeFloorTiles(floor);
  const cols = floorCols(floor);
  const rowCount = floorRows(floor);
  scene.cameras.main.setBounds(0, 0, cols * TILE_SIZE, rowCount * TILE_SIZE);
  mapRender = { floor, rows, cols, rowCount, chunks: new Map(), visibleChunkBoundsKey: null };
  updateVisibleMapChunks(center ? center.x * TILE_SIZE : undefined, center ? center.y * TILE_SIZE : undefined);
}

function hideLoadingScreen(): void {
  dom.loadingScreen.classList.add("hidden");
}

function updateVisibleMapChunks(centerX?: number, centerY?: number): void {
  if (!mapRender) return;
  const camera = scene.cameras.main;
  const view = camera.worldView;
  const fallbackWidth = camera.width / camera.zoom;
  const fallbackHeight = camera.height / camera.zoom;
  const left = centerX === undefined ? view.x : centerX - fallbackWidth / 2;
  const right = centerX === undefined ? view.right : centerX + fallbackWidth / 2;
  const top = centerY === undefined ? view.y : centerY - fallbackHeight / 2;
  const bottom = centerY === undefined ? view.bottom : centerY + fallbackHeight / 2;

  const minChunkX = clampChunk(Math.floor(Math.floor(left / TILE_SIZE) / MAP_CHUNK_TILES) - MAP_CHUNK_PADDING, mapRender.cols);
  const maxChunkX = clampChunk(Math.floor(Math.floor(right / TILE_SIZE) / MAP_CHUNK_TILES) + MAP_CHUNK_PADDING, mapRender.cols);
  const minChunkY = clampChunk(Math.floor(Math.floor(top / TILE_SIZE) / MAP_CHUNK_TILES) - MAP_CHUNK_PADDING, mapRender.rowCount);
  const maxChunkY = clampChunk(Math.floor(Math.floor(bottom / TILE_SIZE) / MAP_CHUNK_TILES) + MAP_CHUNK_PADDING, mapRender.rowCount);
  const boundsKey = `${minChunkX}:${maxChunkX}:${minChunkY}:${maxChunkY}`;
  if (boundsKey === mapRender.visibleChunkBoundsKey) return;
  mapRender.visibleChunkBoundsKey = boundsKey;
  const needed = new Set<string>();

  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const key = mapChunkKey(chunkX, chunkY);
      needed.add(key);
      if (!mapRender.chunks.has(key)) mapRender.chunks.set(key, createMapChunk(mapRender, chunkX, chunkY));
    }
  }

  for (const [key, chunk] of mapRender.chunks) {
    if (needed.has(key)) continue;
    chunk.destroy(true);
    mapRender.chunks.delete(key);
  }
}

function createMapChunk(state: MapRenderState, chunkX: number, chunkY: number): Phaser.GameObjects.Container {
  const tileX = chunkX * MAP_CHUNK_TILES;
  const tileY = chunkY * MAP_CHUNK_TILES;
  const tileRight = Math.min(tileX + MAP_CHUNK_TILES, state.cols);
  const tileBottom = Math.min(tileY + MAP_CHUNK_TILES, state.rowCount);
  const width = (tileRight - tileX) * TILE_SIZE;
  const height = (tileBottom - tileY) * TILE_SIZE;
  const chunk = scene.add.container(0, 0);
  chunk.setDepth(chunkY);

  const texture = scene.add.renderTexture(tileX * TILE_SIZE, tileY * TILE_SIZE, width, height).setOrigin(0);
  for (let y = tileY; y < tileBottom; y += 1) {
    const row = state.rows[y];
    if (row === undefined) continue;
    for (let x = tileX; x < tileRight; x += 1) {
      texture.draw(tileBaseTexture(row[x] ?? ""), (x - tileX) * TILE_SIZE, (y - tileY) * TILE_SIZE);
    }
  }
  chunk.add(texture);
  addTileDecorations(state.rows, chunk, tileX, tileY, tileRight, tileBottom);
  addComposedMapObjects(state.floor, chunk, tileX, tileY, tileRight, tileBottom);
  mapLayer.add(chunk);
  return chunk;
}

function clampChunk(value: number, tileCount: number): number {
  return Math.max(0, Math.min(Math.ceil(tileCount / MAP_CHUNK_TILES) - 1, value));
}

function mapChunkKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}

function mapChunkStats(): MapChunkStats {
  return {
    floor: mapRender?.floor ?? null,
    chunkTiles: MAP_CHUNK_TILES,
    activeChunks: mapRender?.chunks.size ?? 0,
    maxChunkTextureEdge: MAP_CHUNK_TILES * TILE_SIZE
  };
}

function syncEntities(): void {
  const me = self();
  if (!me || !latestState) return;
  const visiblePlayers = visiblePlayerIds;
  const visibleMonsters = visibleMonsterIds;
  const visibleCorpses = visibleCorpseIds;
  const visibleNpcs = visibleNpcIds;
  const visibleTrees = visibleTreeIds;
  const visibleFishingNodes = visibleFishingNodeIds;
  const visibleMiningNodes = visibleMiningNodeIds;
  const visibleHerbNodes = visibleHerbNodeIds;
  const visibleFires = visibleFireIds;
  visiblePlayers.clear();
  visibleMonsters.clear();
  visibleCorpses.clear();
  visibleNpcs.clear();
  visibleTrees.clear();
  visibleFishingNodes.clear();
  visibleMiningNodes.clear();
  visibleHerbNodes.clear();
  visibleFires.clear();

  for (const player of latestState.players) {
    if (player.floor !== me.floor) continue;
    visiblePlayers.add(player.id);
    let view = playerViews.get(player.id);
    if (!view) {
      view = createPlayerView(player);
      playerViews.set(player.id, view);
      entityLayer.add(view);
    }
    setEntityTarget(view, player.x * TILE_SIZE, player.y * TILE_SIZE);
    setActorAnimation(view, "knight", player.dir, player.moving || (player.action != null && ["woodcutting", "fishing", "mining", "cooking"].includes(player.action.type)), 40, 48);
    view.setAlpha(player.dead ? 0.45 : 1);
    view.nameText.setText(player.name);
    view.hp.width = 34 * (player.hp / player.maxHp);
    view.targetRing.setVisible(player.id === selfId);
  }

  for (const [id, view] of playerViews) {
    if (!visiblePlayers.has(id)) {
      destroyEntityView(view);
      playerViews.delete(id);
    }
  }

  for (const monster of latestState.monsters) {
    if (monster.floor !== me.floor) continue;
    visibleMonsters.add(monster.id);
    let view = monsterViews.get(monster.id);
    if (!view) {
      view = createMonsterView(monster);
      monsterViews.set(monster.id, view);
      entityLayer.add(view);
    }
    setEntityTarget(view, monster.x * TILE_SIZE, monster.y * TILE_SIZE);
    const actor = monsterActorSpec(monster);
    setActorAnimation(view, actor.family, monster.dir, monster.moving, actor.width, actor.height, monster.attacking);
    view.sprite.y = actor.yOffset;
    view.sprite.clearTint();
    if (actor.tint) view.sprite.setTint(actor.tint);
    view.nameText.setText(monster.name);
    view.hp.width = 36 * (monster.hp / monster.maxHp);
    view.targetRing.setVisible(me.targetId === monster.id);
  }

  for (const [id, view] of monsterViews) {
    if (!visibleMonsters.has(id)) {
      destroyEntityView(view);
      monsterViews.delete(id);
    }
  }

  for (const corpse of latestState.corpses) {
    if (corpse.floor !== me.floor) continue;
    visibleCorpses.add(corpse.id);
    let view = corpseViews.get(corpse.id);
    if (!view) {
      view = scene.add.container(corpse.x * TILE_SIZE, corpse.y * TILE_SIZE);
      view.add(scene.add.ellipse(0, 6, 24, 12, 0x3b2017, 0.9));
      const isDrop = corpse.kind === "drop";
      if (isDrop) view.add(scene.add.rectangle(0, -4, 22, 10, 0x7b5434).setStrokeStyle(2, 0x2c1b10));
      else view.add(scene.add.rectangle(0, -5, 18, 12, 0x8a5d32).setStrokeStyle(2, 0x2c1b10));
      view.add(scene.add.text(0, -20, lootLabel(corpse), textStyle(10, isDrop ? "#9ee6b1" : "#ffd166")).setOrigin(0.5));
      const zone = scene.add.zone(0, -4, 44, 34).setInteractive({ cursor: "pointer" });
      zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        startLootPath(corpse);
      });
      view.add(zone);
      corpseViews.set(corpse.id, view);
      entityLayer.add(view);
    }
  }
  for (const [id, view] of corpseViews) {
    if (!visibleCorpses.has(id)) {
      view.destroy();
      corpseViews.delete(id);
    }
  }

  for (const npc of latestState.npcs ?? []) {
    if (npc.floor !== me.floor) continue;
    visibleNpcs.add(npc.id);
    let view = npcViews.get(npc.id);
    if (!view) {
      view = createNpcView(npc);
      npcViews.set(npc.id, view);
      entityLayer.add(view);
    }
    setEntityTarget(view, npc.x * TILE_SIZE, npc.y * TILE_SIZE);
    setActorAnimation(view, npc.role === "quest" ? "caster" : "knight", npc.dir, npc.moving, 40, 48);
    view.nameText.setText(npc.name);
  }
  for (const [id, view] of npcViews) {
    if (!visibleNpcs.has(id)) {
      destroyEntityView(view);
      npcViews.delete(id);
    }
  }

  if (latestState.treesFull) {
    for (const tree of latestState.trees ?? []) {
      if (tree.floor !== me.floor) continue;
      visibleTrees.add(tree.id);
      let view = treeViews.get(tree.id);
      if (!view) {
        view = createTreeView(tree);
        treeViews.set(tree.id, view);
        entityLayer.add(view);
      }
      view.setPosition(tree.x * TILE_SIZE, tree.y * TILE_SIZE);
      if (view.treeType !== tree.type) {
        updateTreeViewTexture(view, tree);
      }
      view.treeSprite.setVisible(tree.active);
      view.stump.setVisible(false);
      if (view.zone.input) view.zone.input.enabled = tree.active;
    }
    for (const [id, view] of treeViews) {
      if (!visibleTrees.has(id)) {
        view.destroy();
        treeViews.delete(id);
      }
    }
  }

  for (const node of latestState.fishingNodes ?? []) {
    if (node.floor !== me.floor) continue;
    visibleFishingNodes.add(node.id);
    let view = fishingViews.get(node.id);
    if (!view) {
      view = createFishingNodeView(node);
      fishingViews.set(node.id, view);
      entityLayer.add(view);
    }
    view.setPosition(node.x * TILE_SIZE, node.y * TILE_SIZE);
    view.sprite.setScale(1 + Math.sin(scene.time.now / 360 + node.x) * 0.04);
  }
  for (const [id, view] of fishingViews) {
    if (!visibleFishingNodes.has(id)) {
      view.destroy();
      fishingViews.delete(id);
    }
  }

  for (const node of latestState.miningNodes ?? []) {
    if (node.floor !== me.floor) continue;
    visibleMiningNodes.add(node.id);
    let view = miningViews.get(node.id);
    if (!view) {
      view = createMiningNodeView(node);
      miningViews.set(node.id, view);
      entityLayer.add(view);
    }
    view.setPosition(node.x * TILE_SIZE, node.y * TILE_SIZE);
  }
  for (const [id, view] of miningViews) {
    if (!visibleMiningNodes.has(id)) {
      view.destroy();
      miningViews.delete(id);
    }
  }

  for (const node of latestState.herbNodes ?? []) {
    if (node.floor !== me.floor) continue;
    visibleHerbNodes.add(node.id);
    let view = herbViews.get(node.id);
    if (!view) {
      view = createHerbNodeView(node);
      herbViews.set(node.id, view);
      entityLayer.add(view);
    }
    view.setPosition(node.x * TILE_SIZE, node.y * TILE_SIZE);
    view.setAlpha(node.active ? 1 : 0.3);
    view.bloom.setVisible(node.active);
  }
  for (const [id, view] of herbViews) {
    if (!visibleHerbNodes.has(id)) {
      view.destroy();
      herbViews.delete(id);
    }
  }

  for (const fire of latestState.fires ?? []) {
    if (fire.floor !== me.floor) continue;
    visibleFires.add(fire.id);
    let view = fireViews.get(fire.id);
    if (!view) {
      view = createFireView(fire);
      fireViews.set(fire.id, view);
      entityLayer.add(view);
    }
    view.setPosition(fire.x * TILE_SIZE, fire.y * TILE_SIZE);
  }
  for (const [id, view] of fireViews) {
    if (!visibleFires.has(id)) {
      view.destroy();
      fireViews.delete(id);
    }
  }
}

function clearResourceViews(): void {
  for (const views of [treeViews, fishingViews, miningViews, herbViews, fireViews]) {
    for (const view of views.values()) view.destroy();
    views.clear();
  }
}

function createPlayerView(player: PlayerView): PlayerEntityView {
  const view = scene.add.container(player.x * TILE_SIZE, player.y * TILE_SIZE) as PlayerEntityView;
  view.targetX = view.x;
  view.targetY = view.y;
  const targetRing = scene.add.ellipse(0, 8, 34, 18).setStrokeStyle(2, 0x86efac, 0.8);
  const shadow = scene.add.ellipse(0, 13, 26, 10, 0x000000, 0.26);
  const family = "knight";
  const sprite = scene.add.sprite(0, -10, actorTextureKey(family, player.dir, 0)).setDisplaySize(40, 48);
  const nameText = scene.add.text(0, -43, player.name, textStyle(11, "#eef6ee")).setOrigin(0.5);
  const hpBack = scene.add.rectangle(-17, -31, 34, 4, 0x191d1a).setOrigin(0, 0.5);
  const hp = scene.add.rectangle(-17, -31, 34, 4, 0xef4444).setOrigin(0, 0.5);
  view.add([targetRing, shadow, sprite, nameText, hpBack, hp]);
  view.nameText = nameText;
  view.hp = hp;
  view.targetRing = targetRing;
  view.sprite = sprite;
  setActorAnimation(view, family, player.dir, player.moving, 40, 48);
  return view;
}

function createNpcView(npc: NpcView): NpcEntityView {
  const view = scene.add.container(npc.x * TILE_SIZE, npc.y * TILE_SIZE) as NpcEntityView;
  view.targetX = view.x;
  view.targetY = view.y;
  const shadow = scene.add.ellipse(0, 13, 26, 10, 0x000000, 0.26);
  const family = npc.role === "quest" ? "caster" : "knight";
  const sprite = scene.add.sprite(0, -10, actorTextureKey(family, npc.dir, 0)).setDisplaySize(40, 48);
  const nameText = scene.add.text(0, -45, npc.name, textStyle(11, npc.role === "quest" ? "#f7d486" : "#f5ddb1")).setOrigin(0.5);
  const zone = scene.add.zone(0, 0, 50, 58).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startNpcTalkPath(npc.id);
  });
  view.add([shadow, sprite, nameText, zone]);
  view.nameText = nameText;
  view.sprite = sprite;
  setActorAnimation(view, family, npc.dir, npc.moving, 40, 48);
  return view;
}

function createTreeView(tree: TreeView): TreeEntityView {
  const view = scene.add.container(tree.x * TILE_SIZE, tree.y * TILE_SIZE) as TreeEntityView;
  const spec = treeTypeSpec(tree);
  const treeSprite = scene.add.image(0, 4, spec.textureKey).setOrigin(0.5, 1).setDisplaySize(spec.width, spec.height);
  const stump = scene.add.rectangle(0, 12, 20, 12, 0x705036).setStrokeStyle(2, 0x2d1f14).setVisible(false);
  const zone = scene.add.zone(0, -18, spec.zoneWidth, spec.zoneHeight).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startTreeCutPath(tree);
  });
  view.add([treeSprite, stump, zone]);
  view.treeSprite = treeSprite;
  view.stump = stump;
  view.zone = zone;
  view.treeType = tree.type;
  return view;
}

function updateTreeViewTexture(view: TreeEntityView, tree: TreeView): void {
  const spec = treeTypeSpec(tree);
  view.treeSprite.setTexture(spec.textureKey);
  view.treeSprite.setDisplaySize(spec.width, spec.height);
  view.zone.setSize(spec.zoneWidth, spec.zoneHeight);
  view.treeType = tree.type;
}

function treeTypeSpec(tree: TreeView): TreeType | TreeSpec {
  return TREE_TYPES[tree.type] ?? TREE_TYPES.oak ?? { textureKey: "spriteTree", width: 70, height: 90, zoneWidth: 40, zoneHeight: 60 };
}

function createFishingNodeView(node: FishingNodeView): FishingEntityView {
  const view = scene.add.container(node.x * TILE_SIZE, node.y * TILE_SIZE) as FishingEntityView;
  const ring = scene.add.ellipse(0, 2, 34, 14, 0x4db6d8, 0.16).setStrokeStyle(1, 0xbbeeff, 0.55);
  const sprite = scene.add.image(0, 0, "spriteFishingRipple").setDisplaySize(34, 34);
  const zone = scene.add.zone(0, 0, 48, 42).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startFishingPath(node);
  });
  view.add([ring, sprite, zone]);
  view.sprite = sprite;
  return view;
}

const ORE_VEIN_TEXTURES: Record<string, string> = {
  copper: "spriteCopperVein",
  tin: "spriteTinVein",
  iron: "spriteIronVein"
};

function createMiningNodeView(node: MiningNodeView): MiningEntityView {
  const view = scene.add.container(node.x * TILE_SIZE, node.y * TILE_SIZE) as MiningEntityView;
  const texture = ORE_VEIN_TEXTURES[node.kind] ?? "spriteCopperVein";
  const sprite = scene.add.image(0, -2, texture).setOrigin(0.5, 1).setDisplaySize(46, 30);
  const zone = scene.add.zone(0, -12, 48, 36).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startMiningPath(node);
  });
  view.add([sprite, zone]);
  view.sprite = sprite;
  return view;
}

// Pixel-art plant per node: the gated Mire-Lotus keeps its swamp sprite, beach
// Tidal Blooms read blue, and ordinary herb patches alternate white/yellow
// blooms for natural variety. Mineral nodes (quartz) fall back to a sketch.
const HERB_SPRITES: Record<string, { key: string; w: number; h: number }> = {
  herbBloom: { key: "herbBloom", w: 30, h: 40 },
  herbField: { key: "herbField", w: 28, h: 44 },
  herbTidal: { key: "herbTidal", w: 29, h: 40 }
};

function herbPlantSprite(node: HerbNodeView): { key: string; w: number; h: number } | null {
  const label = node.label.toLowerCase();
  if (label.includes("tidal")) return HERB_SPRITES.herbTidal ?? null;
  if (label.includes("quartz")) return null; // a mineral, not a plant
  let hash = 0;
  for (let i = 0; i < node.id.length; i += 1) hash = (hash + node.id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 2 === 0 ? HERB_SPRITES.herbBloom : HERB_SPRITES.herbField) ?? null;
}

function createHerbNodeView(node: HerbNodeView): HerbEntityView {
  const view = scene.add.container(node.x * TILE_SIZE, node.y * TILE_SIZE) as HerbEntityView;
  const base = scene.add.ellipse(0, 7, 26, 12, 0x3a5a2a, 0.4);
  view.add(base);
  const zone = scene.add.zone(0, -4, 40, 40).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startHerbPath(node);
  });

  if (node.requiredLevel > 0) {
    // Mire-Lotus keeps its bespoke swamp-lotus sprite.
    const lotus = scene.add.image(0, 8, "spriteMireLotus").setOrigin(0.5, 1).setDisplaySize(36, 34);
    view.add([lotus, zone]);
    view.bloom = lotus;
    return view;
  }

  const plant = herbPlantSprite(node);
  if (plant) {
    const sprite = scene.add.image(0, 9, plant.key).setOrigin(0.5, 1).setDisplaySize(plant.w, plant.h);
    view.add([sprite, zone]);
    view.bloom = sprite;
    return view;
  }

  // Fallback sketch for non-plant foraging nodes (e.g. quartz outcrops).
  const leafA = scene.add.ellipse(-5, -1, 10, 18, 0x4caf50, 0.95).setRotation(-0.4);
  const leafB = scene.add.ellipse(5, -1, 10, 18, 0x66bb6a, 0.95).setRotation(0.4);
  const leafC = scene.add.ellipse(0, -5, 9, 17, 0x81c784, 0.95);
  const bloom = scene.add.circle(0, -10, 3, 0xf6c9e0, 0.95);
  view.add([leafA, leafB, leafC, bloom, zone]);
  view.bloom = bloom;
  return view;
}

function createFireView(fire: FireView): FireEntityView {
  const view = scene.add.container(fire.x * TILE_SIZE, fire.y * TILE_SIZE) as FireEntityView;
  const glow = scene.add.ellipse(0, 7, 34, 16, 0xff7a2f, 0.28);
  const sprite = scene.add.image(0, 1, "spriteCampfire").setDisplaySize(58, 58);
  const zone = scene.add.zone(0, -2, 48, 48).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startCookingPath(fire);
  });
  view.add([glow, sprite, zone]);
  view.sprite = sprite;
  return view;
}

function createMonsterView(monster: MonsterView): MonsterEntityView {
  const view = scene.add.container(monster.x * TILE_SIZE, monster.y * TILE_SIZE) as MonsterEntityView;
  view.targetX = view.x;
  view.targetY = view.y;
  const targetRing = scene.add.ellipse(0, 8, 38, 20).setStrokeStyle(2, 0xf97316, 0.9).setVisible(false);
  const shadow = scene.add.ellipse(0, 13, 30, 12, 0x000000, 0.28);
  const actor = monsterActorSpec(monster);
  const sprite = scene.add.sprite(0, actor.yOffset, actorTextureKey(actor.family, monster.dir, 0)).setDisplaySize(actor.width, actor.height);
  if (actor.tint) sprite.setTint(actor.tint);
  const nameText = scene.add.text(0, -45, monster.name, textStyle(11, "#f8ead0")).setOrigin(0.5);
  const hpBack = scene.add.rectangle(-18, -32, 36, 4, 0x191d1a).setOrigin(0, 0.5);
  const hp = scene.add.rectangle(-18, -32, 36, 4, 0xef4444).setOrigin(0, 0.5);
  const zone = scene.add.zone(0, 0, 54, 56).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    startAttackPath(monster.id);
  });
  view.add([targetRing, shadow, sprite, nameText, hpBack, hp, zone]);
  view.nameText = nameText;
  view.hp = hp;
  view.targetRing = targetRing;
  view.sprite = sprite;
  setActorAnimation(view, actor.family, monster.dir, monster.moving, actor.width, actor.height, monster.attacking);
  return view;
}

function monsterActorSpec(monster: { type: string }): MonsterActorSpec {
  if (monster.type === "rat") return { family: "rat", width: 44, height: 28, yOffset: 2 };
  if (monster.type === "spider") return { family: "spider", width: 48, height: 34, yOffset: -1 };
  if (monster.type === "skeleton") return { family: "skeleton", width: 42, height: 48, yOffset: -10 };
  if (monster.type === "ghoul") return { family: "ghoul", width: 46, height: 54, yOffset: -13 };
  if (monster.type === "boss") return { family: "skeleton", width: 62, height: 66, yOffset: -18, tint: 0xff8a5c };
  if (monster.type === "orc") return { family: "orc", width: 56, height: 60, yOffset: -17 };
  if (monster.type === "goblin_scout") return { family: "goblinScout", width: 42, height: 52, yOffset: -14 };
  if (monster.type === "goblin_shaman") return { family: "goblinShaman", width: 46, height: 56, yOffset: -16 };
  if (monster.type === "wolf") return { family: "greyWolf", width: 58, height: 44, yOffset: -8 };
  if (monster.type === "wisp") return { family: "wisp", width: 40, height: 56, yOffset: -18 };
  if (monster.type === "dire_wolf") return { family: "dire_wolf", width: 64, height: 48, yOffset: -9 };
  if (monster.type === "wild_boar") return { family: "wild_boar", width: 54, height: 40, yOffset: -6 };
  if (monster.type === "thorn_hedgehog") return { family: "thorn_hedgehog", width: 46, height: 34, yOffset: -5 };
  if (monster.type === "forest_spider") return { family: "forest_spider", width: 50, height: 36, yOffset: -4 };
  if (monster.type === "forest_slime") return { family: "forest_slime", width: 42, height: 34, yOffset: -4 };
  if (monster.type === "mushroom_brute") return { family: "mushroom_brute", width: 50, height: 52, yOffset: -14 };
  if (monster.type === "sapling_deer") return { family: "sapling_deer", width: 58, height: 50, yOffset: -10 };
  if (monster.type === "ancient_treant") return { family: "ancient_treant", width: 58, height: 68, yOffset: -22 };
  if (monster.type === "bone_druid") return { family: "bone_druid", width: 46, height: 58, yOffset: -17 };
  if (monster.type === "forest_pixie") return { family: "forest_pixie", width: 38, height: 50, yOffset: -18 };
  if (monster.type === "bog_wraith") return { family: "bog_wraith", width: 46, height: 58, yOffset: -18 };
  if (monster.type === "grave_revenant") return { family: "grave_revenant", width: 46, height: 56, yOffset: -16 };
  if (monster.type === "crypt_sentinel") return { family: "crypt_sentinel", width: 52, height: 60, yOffset: -17 };
  if (monster.type === "pale_banshee") return { family: "pale_banshee", width: 44, height: 60, yOffset: -19 };
  // New-area monsters (montage families in /new-enemies.png).
  if (monster.type === "skitterer") return { family: "skitterer", width: 50, height: 44, yOffset: -6 };
  if (monster.type === "mire_spitter") return { family: "mire_spitter", width: 50, height: 56, yOffset: -16 };
  if (monster.type === "canyon_scavenger") return { family: "canyon_scavenger", width: 52, height: 56, yOffset: -14 };
  if (monster.type === "dust_burrower") return { family: "dust_burrower", width: 54, height: 46, yOffset: -6 };
  if (monster.type === "dune_skitterer") return { family: "dune_skitterer", width: 50, height: 48, yOffset: -10 };
  if (monster.type === "sun_wraith") return { family: "sun_wraith", width: 50, height: 56, yOffset: -16, tint: 0xffd98a };
  if (monster.type === "reef_prowler") return { family: "reef_prowler", width: 54, height: 50, yOffset: -10 };
  if (monster.type === "venomous_stalker") return { family: "venomous_stalker", width: 52, height: 46, yOffset: -8, tint: 0x9fd07a };
  if (monster.type === "totem_wraith") return { family: "totem_wraith", width: 48, height: 56, yOffset: -16, tint: 0xd0b3ff };
  return { family: "goblin", width: 42, height: 46, yOffset: -10 };
}

function setEntityTarget(view: EntityView, x: number, y: number): void {
  const dx = view.x - x;
  const dy = view.y - y;
  const distanceSq = dx * dx + dy * dy;
  const snapDistance = TILE_SIZE * 3;
  if (distanceSq > snapDistance * snapDistance || distanceSq < 0.01) {
    view.x = x;
    view.y = y;
    view.targetX = undefined;
    view.targetY = undefined;
    interpolatingEntityViews.delete(view);
    return;
  }
  view.targetX = x;
  view.targetY = y;
  interpolatingEntityViews.add(view);
}

function interpolateEntities(): void {
  for (const view of interpolatingEntityViews) easeToTarget(view);
}

function easeToTarget(view: EntityView): void {
  const targetX = view.targetX;
  const targetY = view.targetY;
  if (targetX === undefined || targetY === undefined) return;
  const dx = targetX - view.x;
  const dy = targetY - view.y;
  if (dx * dx + dy * dy < 0.01) {
    view.x = targetX;
    view.y = targetY;
    view.targetX = undefined;
    view.targetY = undefined;
    interpolatingEntityViews.delete(view);
    return;
  }
  view.x += dx * 0.32;
  view.y += dy * 0.32;
}

function setActorAnimation(view: EntityView, family: string, dir: Direction = "down", moving = false, width = 40, height = 48, attacking = false): void {
  const previousFamily = view.animFamily;
  const previousDir = view.animDir;
  const previousMoving = view.animMoving;
  const previousAttacking = view.animAttacking;
  const previousWidth = view.animWidth;
  const previousHeight = view.animHeight;
  view.animFamily = family;
  view.animDir = DIRECTIONS.includes(dir) ? dir : "down";
  view.animMoving = Boolean(moving);
  view.animAttacking = Boolean(attacking);
  view.animWidth = width;
  view.animHeight = height;
  if (view.animMoving || view.animAttacking) {
    animatingActorViews.add(view);
    return;
  }
  animatingActorViews.delete(view);
  if (
    previousFamily !== view.animFamily ||
    previousDir !== view.animDir ||
    previousMoving !== view.animMoving ||
    previousAttacking !== view.animAttacking ||
    previousWidth !== view.animWidth ||
    previousHeight !== view.animHeight
  ) {
    animateActor(view);
  }
}

function animateEntities(): void {
  for (const view of animatingActorViews) animateActor(view);
  for (const view of fireViews.values()) {
    if (!view.flame) continue;
    view.flame.setScale(1 + Math.sin(scene.time.now / 95) * 0.08, 1 + Math.cos(scene.time.now / 120) * 0.06);
  }
}

function destroyEntityView(view: EntityView): void {
  interpolatingEntityViews.delete(view);
  animatingActorViews.delete(view);
  view.destroy();
}

function animateActor(view: EntityView): void {
  if (!view.sprite || !view.animFamily || !view.animDir) return;
  const attackFamily = view.animAttacking ? ATTACK_FAMILY[view.animFamily] : undefined;
  let family = view.animFamily;
  let frame = 0;
  if (attackFamily) {
    family = attackFamily;
    const count = ATTACK_FAMILY_FRAMES[attackFamily] ?? 4;
    frame = Math.floor(scene.time.now / ATTACK_FRAME_MS) % count;
  } else if (view.animMoving) {
    const count = FAMILY_WALK_FRAMES[view.animFamily] ?? 4;
    frame = Math.floor(scene.time.now / WALK_FRAME_MS) % count;
  }
  const key = actorTextureKey(family, view.animDir, frame);
  if (view.currentFrameKey !== key) {
    view.sprite.setTexture(key);
    view.sprite.setDisplaySize(view.animWidth ?? 40, view.animHeight ?? 48);
    view.currentFrameKey = key;
  }
  const flipX = actorFlipX(family, view.animDir);
  if (view.currentFlipX !== flipX) {
    view.sprite.setFlipX(flipX);
    view.currentFlipX = flipX;
  }
}

function renderHud(me: PlayerView): void {
  const spec: ClassSpec = CLASSES[me.classKey] ?? CLASSES.adventurer ?? fallbackClassSpec();
  const coreSignature = [
    me.name,
    me.classKey,
    spec.label,
    me.hp,
    me.maxHp,
    me.mana,
    me.maxMana,
    me.level,
    me.xp,
    me.gold,
    me.weaponTier,
    me.armorTier,
    me.weight,
    me.maxWeight,
    me.dead ? 1 : 0
  ].join("|");
  if (coreSignature !== renderedHudCoreSignature) {
    renderedHudCoreSignature = coreSignature;
    dom.charName.textContent = me.name;
    dom.classLabel.textContent = spec.label;
    setBar(dom.hpBar, dom.hpText, me.hp, me.maxHp, "HP");
    setBar(dom.manaBar, dom.manaText, me.mana, me.maxMana, "MP");
    const levelStart = xpForLevel(me.level);
    const levelEnd = xpForLevel(me.level + 1);
    setBar(dom.xpBar, dom.xpText, me.xp - levelStart, levelEnd - levelStart, "XP");
    dom.levelText.textContent = String(me.level);
    dom.goldText.textContent = String(me.gold);
    dom.weaponText.textContent = me.weaponTier ? (SHOP.weapon?.knightName ?? "Basic") : "Basic";
    dom.armorText.textContent = me.armorTier ? (SHOP.armor?.name ?? "Cloth") : "Cloth";
    dom.weightText.textContent = String(me.weight);
    dom.weightMax.textContent = String(me.maxWeight);
    dom.weightText.classList.toggle("over", me.weight > me.maxWeight);
    dom.death.classList.toggle("hidden", !me.dead);
  }
  const buffsSignature = buffHudSignature(me.buffs);
  if (buffsSignature !== renderedBuffSignature) {
    renderedBuffSignature = buffsSignature;
    renderBuffTracker(me.buffs);
  }
  const questSignature = questHudSignature(me.quests);
  if (questSignature !== renderedQuestSignature) {
    renderedQuestSignature = questSignature;
    renderQuestTracker(me.quests);
  }
  renderSkillTracker(me.skills);
  const inventorySignature = inventoryHudSignature(me.inventory);
  if (inventorySignature !== renderedInventoryDataSignature) {
    renderedInventoryDataSignature = inventorySignature;
    renderInventory(me.inventory);
  }
  const equipmentSignature = equipmentHudSignature(me);
  if (!dom.equipmentPanel.classList.contains("hidden") && equipmentSignature !== renderedEquipmentSignature) {
    renderedEquipmentSignature = equipmentSignature;
    renderEquipment(me);
  }
  const abilitySignature = abilityHudSignature(me.abilities);
  if (abilitySignature !== renderedAbilitySignature) {
    renderedAbilitySignature = abilitySignature;
    renderAbilities(me.abilities);
  }
  const classesSignature = classesHudSignature(me);
  if (!dom.classesPanel.classList.contains("hidden") && classesSignature !== renderedClassesSignature) {
    renderedClassesSignature = classesSignature;
    renderClasses(me);
  }
  loadHotbarFor(me.name);
  const hotbarDataSignature = `${me.name}|${hotbarLayoutSignature()}|${inventorySignature}|${abilitySignature}`;
  if (hotbarDataSignature !== renderedHotbarDataSignature) {
    renderedHotbarDataSignature = hotbarDataSignature;
    renderHotbar(me.inventory);
  }
  const vendorNpc = NPCS[0];
  const nearVendor = vendorNpc != null && me.floor === vendorNpc.floor && Phaser.Math.Distance.Between(me.x, me.y, vendorNpc.x, vendorNpc.y) < 2.2;
  if (!nearVendor && !dom.vendor.classList.contains("hidden")) hideCenterPanels();
  const alchemistNpc = NPCS.find((npc) => npc.role === "alchemist");
  const nearAlchemist = alchemistNpc != null && me.floor === alchemistNpc.floor && Phaser.Math.Distance.Between(me.x, me.y, alchemistNpc.x, alchemistNpc.y) < 2.2;
  if (!nearAlchemist && !dom.alchemist.classList.contains("hidden")) hideCenterPanels();
}

function buffHudSignature(buffs: Partial<BuffsView> = {}): string {
  return [
    buffs.wellFed,
    buffs.foodRegen,
    buffs.sprint,
    buffs.secondWind,
    buffs.ironClad,
    buffs.fleetFoot,
    buffs.slowed,
    buffs.stunned,
    buffs.weakened
  ].map((value) => Math.ceil((value ?? 0) / 250)).join("|");
}

function questHudSignature(quests: QuestView[] = []): string {
  return quests
    .map((quest) => `${quest.id}:${quest.accepted ? 1 : 0}:${quest.progress}:${quest.complete ? 1 : 0}:${quest.claimed ? 1 : 0}`)
    .join("|");
}

function inventoryHudSignature(inventory: Array<InventoryItemView | null> = []): string {
  return inventory.map((item) => item ? `${item.id}:${item.qty}:${item.label}:${item.iconUrl}` : "-").join("|");
}

function abilityHudSignature(abilities: AbilityView[] = []): string {
  return abilities
    .map((ability) => {
      const cooldown = Math.ceil((ability.cooldownRemainingMs ?? 0) / 250);
      const active = Math.ceil((ability.activeRemainingMs ?? 0) / 250);
      return `${ability.id}:${ability.label}:${cooldown}:${active}`;
    })
    .join("|");
}

function equipmentHudSignature(me: PlayerView): string {
  const bow = (me.inventory ?? []).find((item) => item && /bow/.test(item.id));
  const attack = skillLevelOf(me, "attack");
  const ranged = skillLevelOf(me, "ranged");
  const defense = skillLevelOf(me, "defense");
  return [me.classKey, me.weaponTier, me.armorTier, bow?.id ?? "", bow?.label ?? "", attack, ranged, defense].join("|");
}

function classesHudSignature(me: PlayerView): string {
  const skillSignature = (me.skills ?? []).map((skill) => `${skill.id}:${skill.level}`).join("|");
  return [me.classKey, me.floor, me.unlockedClasses.join(","), skillSignature].join("|");
}

function hotbarLayoutSignature(): string {
  return hotbarLayout.map((slot) => slot ? `${slot.kind}:${slot.kind === "item" ? slot.itemId : slot.abilityId}` : "-").join("|");
}

function fallbackClassSpec(): ClassSpec {
  return {
    label: "Adventurer",
    maxHp: 120,
    maxMana: 60,
    speed: 4.25,
    range: 1.35,
    magicRange: 6,
    attackDamage: [8, 13],
    abilityDamage: [18, 28],
    abilityCost: 14,
    attackMs: 820,
    abilityMs: 2800,
    hpPerDefense: 10,
    manaPerMagic: 8,
    abilities: ["sprint", "second_wind"],
    dodgeChance: 0.05
  };
}

function renderMetrics(metrics: StateMetrics | null | undefined): void {
  if (!metrics) {
    dom.netStats.textContent = "net -";
    return;
  }
  dom.netStats.textContent = `zone ${metrics.zone} | net ${formatBytes(metrics.bytesOutPerSecond)}/s | tick ${metrics.tickMs}ms | snap ${metrics.snapshotMs}ms | seen ${metrics.visiblePlayers}p/${metrics.visibleMonsters}m/${metrics.visibleTrees ?? 0}t | cells ${metrics.spatialCells}`;
}

function renderQuestTracker(quests: QuestView[] = []): void {
  const active = quests.filter((quest) => quest.accepted && !quest.claimed);
  if (!active.length) {
    dom.questTracker.textContent = "";
    return;
  }
  dom.questTracker.innerHTML = active
    .map((quest) => {
      const ready = quest.progress >= quest.target;
      const status = ready ? "Ready to turn in" : `${quest.progress}/${quest.target}`;
      const color = ready ? "#9ee6b1" : "#f7d486";
      return `<div style="color:${color}">${escapeHtml(quest.title)}: ${escapeHtml(status)}</div>`;
    })
    .join("");
}

function renderBuffTracker(buffs: Partial<BuffsView> = {}): void {
  const active: string[] = [];
  if ((buffs.wellFed ?? 0) > 0) active.push(`Well fed ${Math.ceil((buffs.wellFed ?? 0) / 1000)}s`);
  if ((buffs.foodRegen ?? 0) > 0) active.push(`Food heal ${Math.ceil((buffs.foodRegen ?? 0) / 1000)}s`);
  if ((buffs.sprint ?? 0) > 0) active.push(`Sprint ${Math.ceil((buffs.sprint ?? 0) / 1000)}s`);
  if ((buffs.secondWind ?? 0) > 0) active.push(`Second wind ${Math.ceil((buffs.secondWind ?? 0) / 1000)}s`);
  if ((buffs.ironClad ?? 0) > 0) active.push(`Iron Clad ${Math.ceil((buffs.ironClad ?? 0) / 1000)}s`);
  if ((buffs.fleetFoot ?? 0) > 0) active.push(`Fleet Foot ${Math.ceil((buffs.fleetFoot ?? 0) / 1000)}s`);
  if ((buffs.slowed ?? 0) > 0) active.push(`Slowed ${Math.ceil((buffs.slowed ?? 0) / 1000)}s`);
  if ((buffs.stunned ?? 0) > 0) active.push(`Stunned ${Math.ceil((buffs.stunned ?? 0) / 1000)}s`);
  if ((buffs.weakened ?? 0) > 0) active.push(`Weakened ${Math.ceil((buffs.weakened ?? 0) / 1000)}s`);
  dom.buffTracker.textContent = active.join(" | ");
  dom.buffTracker.classList.toggle("hidden", !active.length);
}

function renderSkillTracker(skills: SkillView[] = []): void {
  const signature = skills.map((skill) => `${skill.id}:${skill.level}:${skill.xp}:${skill.nextXp}`).join("|");
  if (signature === renderedSkillSignature) return;
  renderedSkillSignature = signature;
  dom.skillTracker.innerHTML = skills
    .map((skill) => {
      const previousXp = xpForLevel(skill.level);
      const nextXp = Math.max(skill.nextXp, previousXp + 1);
      const progress = Math.max(0, Math.min(1, (skill.xp - previousXp) / (nextXp - previousXp)));
      return `
        <div class="skill-row" title="${escapeHtml(skill.label)} level ${skill.level}">
          ${iconMarkup(skill.iconUrl, skill.label, "skill-icon")}
          <div class="skill-meta">
            <span class="skill-name">${escapeHtml(skill.label)}</span>
            <div class="skill-progress"><span style="width: ${Math.round(progress * 100)}%"></span></div>
          </div>
          <b class="skill-level">${skill.level}</b>
        </div>
      `;
    })
    .join("");
}

// The worn-equipment paperdoll. Equipment is currently a small model — a melee
// weapon tier (or a bow held in the pack), a body-armour tier, and the equipped
// class stance — so the populated slots are Weapon and Body; the rest are shown
// as empty wells in the familiar slot layout, ready for future gear.
interface EquipSlotFill {
  name: string;
  iconUrl: string | null;
  detail: string;
}

const PAPERDOLL_LAYOUT: Array<string | null> = [
  null, "head", null,
  "cape", "amulet", "ammo",
  "weapon", "body", "shield",
  null, "legs", null,
  "hands", "feet", "ring"
];
const SLOT_LABELS: Record<string, string> = {
  head: "Head", cape: "Cape", amulet: "Amulet", ammo: "Ammo", weapon: "Weapon",
  body: "Body", shield: "Shield", legs: "Legs", hands: "Hands", feet: "Feet", ring: "Ring"
};

function renderEquipment(me: PlayerView | null | undefined): void {
  if (!me) return;
  const spec: ClassSpec = CLASSES[me.classKey] ?? CLASSES.adventurer ?? fallbackClassSpec();
  dom.equipClass.textContent = spec.label;

  // A bow in the pack acts as the worn weapon (attacks route to Ranged).
  const bow = (me.inventory ?? []).find((item) => item && /bow/.test(item.id));
  const dmgBonus = me.weaponTier * (SHOP.weapon?.damageBonus ?? 0);
  const armorBonus = me.armorTier * (SHOP.armor?.armorBonus ?? 0);

  const fills: Record<string, EquipSlotFill> = {};
  if (bow) {
    fills.weapon = { name: bow.label, iconUrl: bow.iconUrl, detail: "Ranged" };
  } else {
    fills.weapon = me.weaponTier
      ? { name: SHOP.weapon?.knightName ?? "Forged Blade", iconUrl: "/icons/shop-weapon.png", detail: `+${dmgBonus} dmg` }
      : { name: "Worn Blade", iconUrl: "/icons/ui-weapon.png", detail: "starter" };
  }
  fills.body = me.armorTier
    ? { name: SHOP.armor?.name ?? "Plated Mail", iconUrl: "/icons/shop-armor.png", detail: `+${armorBonus} armour` }
    : { name: "Cloth Tunic", iconUrl: "/icons/ui-armor.png", detail: "starter" };

  dom.paperdoll.innerHTML = PAPERDOLL_LAYOUT
    .map((slot) => {
      if (!slot) return `<div class="equip-spacer"></div>`;
      const fill = fills[slot];
      if (fill) {
        return `<div class="equip-slot filled" title="${escapeHtml(`${fill.name} — ${fill.detail}`)}">${iconMarkup(fill.iconUrl, fill.name, "equip-icon")}<span class="equip-tag">${escapeHtml(fill.name)}</span></div>`;
      }
      return `<div class="equip-slot empty" title="${escapeHtml(SLOT_LABELS[slot] ?? slot)}"><span class="equip-empty-label">${escapeHtml(SLOT_LABELS[slot] ?? slot)}</span></div>`;
    })
    .join("");

  const attackTotal = skillLevelOf(me, "attack") + dmgBonus;
  const defenceTotal = Math.floor(skillLevelOf(me, "defense") / 3) + armorBonus;
  dom.equipStats.innerHTML = [
    bow
      ? `<span><i>Ranged</i><b>${skillLevelOf(me, "ranged")}</b></span>`
      : `<span><i>Attack</i><b>${attackTotal}</b></span>`,
    `<span><i>Armour</i><b>${defenceTotal}</b></span>`,
    `<span><i>Weapon</i><b>${escapeHtml(fills.weapon.name)}</b></span>`
  ].join("");
}

function skillLevelOf(me: PlayerView, id: string): number {
  return me.skills.find((skill) => skill.id === id)?.level ?? 1;
}

function renderInventory(inventory: Array<InventoryItemView | null> = []): void {
  const slots: Array<InventoryItemView | null> = Array.from({ length: 30 }, (_, index) => inventory[index] ?? null);
  const selectedSlotItem = selectedInventorySlot === null ? null : (slots[selectedInventorySlot] ?? null);
  if (selectedInventorySlot !== null && selectedSlotItem?.id !== selectedInventoryItem) {
    selectedInventorySlot = null;
    selectedInventoryItem = null;
  } else if (selectedInventoryItem && !slots.some((item) => item?.id === selectedInventoryItem)) {
    clearInventorySelection();
  }
  const signature = `${slots.map((item) => item ? `${item.id}:${item.qty}:${item.label}:${item.iconUrl}` : "-").join("|")}|selected:${selectedInventorySlot ?? ""}:${selectedInventoryItem ?? ""}`;
  if (signature === renderedInventorySignature) return;
  renderedInventorySignature = signature;
  dom.inventoryGrid.innerHTML = slots
    .map((item, index) => {
      if (!item) return `<button class="inventory-slot empty" type="button" data-slot="${index}">.</button>`;
      const qty = item.qty > 1 ? `<span>${item.qty}</span>` : "";
      const selected = selectedInventorySlot === index && selectedInventoryItem === item.id ? " selected" : "";
      return `<button class="inventory-slot${selected}" type="button" data-slot="${index}" data-item="${escapeHtml(item.id)}" data-label="${escapeHtml(item.label)}">${iconMarkup(item.iconUrl, item.icon, "item-icon")}${qty}</button>`;
    })
    .join("");
  dom.inventoryGrid.querySelectorAll<HTMLElement>("[data-item]").forEach((slot) => {
    const itemId = slot.dataset.item ?? "";
    const select = (): void => {
      if (itemId) handleInventoryClick(Number(slot.dataset.slot), itemId);
    };
    // Hotbar-usable items must be draggable onto the hotbar (like abilities).
    // They select on `click`, not `pointerdown`: calling preventDefault on
    // pointerdown cancels the browser's native HTML5 drag, and re-rendering the
    // grid on pointerdown would destroy the drag source before dragstart fires.
    // A real `click` only fires when the press did not become a drag, so this
    // keeps click-to-select and drag-to-hotbar both working. Non-usable items
    // can't be slotted, so they keep the snappier pointerdown selection.
    if (isHotbarUsable(itemId)) {
      slot.setAttribute("draggable", "true");
      slot.addEventListener("click", select);
      slot.addEventListener("dragstart", (event) => {
        activeHotbarDrag = { source: "inventory", itemId };
        hotbarDragLandedInHotbar = false;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.setData("text/plain", `inventory:${itemId}`);
        }
      });
      slot.addEventListener("dragend", finishHotbarDrag);
    } else {
      slot.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        select();
      });
    }
    slot.addEventListener("mouseenter", () => showItemPopover(slot, slot.dataset.label ?? ""));
    slot.addEventListener("mousemove", () => positionItemPopover(slot));
    slot.addEventListener("mouseleave", hideItemPopover);
    slot.addEventListener("dblclick", () => {
      if (itemId && itemUseKind(itemId) === "eat") send({ type: "eatItem", item: itemId });
    });
  });
  dom.inventoryGrid.querySelectorAll<HTMLElement>(".inventory-slot.empty").forEach((slot) => {
    slot.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      clearInventorySelection();
      renderInventory(self()?.inventory ?? []);
    });
  });
}

let classesClickBound = false;

function renderClasses(me: PlayerView | undefined): void {
  if (!classesClickBound) {
    dom.classList.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".class-equip");
      if (!button || button.disabled) return;
      const key = button.dataset.class;
      if (key) send({ type: "setClass", classKey: key });
    });
    classesClickBound = true;
  }
  if (!me) {
    dom.classList.innerHTML = "";
    return;
  }
  const inTown = me.floor === 0 || me.floor === 4;
  const levelOf = (id: string): number => me.skills.find((skill) => skill.id === id)?.level ?? 1;

  const entries = [
    { key: "adventurer", label: "Adventurer", town: null as string | null, npcName: null as string | null, requires: {} as Partial<Record<string, number>>, unlocked: true },
    ...CLASS_UNLOCKS.map((unlock) => ({
      key: unlock.key,
      label: unlock.label,
      town: unlock.town,
      npcName: unlock.npcName,
      requires: unlock.requires,
      unlocked: me.unlockedClasses.includes(unlock.key)
    }))
  ];

  dom.classList.innerHTML = entries
    .map((entry) => {
      const equipped = me.classKey === entry.key;
      const reqs = Object.entries(entry.requires)
        .map(([skill, level]) => {
          const have = levelOf(skill);
          const ok = have >= (level ?? 0);
          return `<span class="class-req ${ok ? "met" : "unmet"}">${escapeHtml(SKILLS[skill]?.label ?? skill)} ${have}/${level}</span>`;
        })
        .join("");
      const abilities = (CLASSES[entry.key]?.abilities ?? [])
        .map((id) => `<span>${escapeHtml(ABILITIES[id]?.label ?? id)}</span>`)
        .join("");
      let action: string;
      if (equipped) {
        action = `<span class="class-status equipped">Equipped</span>`;
      } else if (entry.unlocked) {
        action = `<button class="class-equip" type="button" data-class="${escapeHtml(entry.key)}"${inTown ? "" : " disabled"}>${inTown ? "Equip" : "Town only"}</button>`;
      } else {
        const hint = `Unlock from ${entry.npcName ?? "a trainer"} in ${entry.town ?? "town"}`;
        action = `<span class="class-status locked" title="${escapeHtml(hint)}">Locked</span>`;
      }
      const lockHint = !entry.unlocked && entry.npcName ? `<div class="class-hint">See ${escapeHtml(entry.npcName)} · ${escapeHtml(entry.town ?? "")}</div>` : "";
      return `<div class="class-row ${equipped ? "equipped" : entry.unlocked ? "unlocked" : "locked"}">
        <div class="class-head"><strong>${escapeHtml(entry.label)}</strong>${action}</div>
        ${reqs ? `<div class="class-reqs">${reqs}</div>` : `<div class="class-reqs"><span class="class-req met">Starter stance</span></div>`}
        <div class="class-abilities">${abilities}</div>
        ${lockHint}
      </div>`;
    })
    .join("");
}

let abilitiesClickBound = false;
const abilityRows = new Map<string, AbilityRowEntry>();
let abilityEmptyEl: HTMLDivElement | null = null;

function renderAbilities(abilities: AbilityView[] = []): void {
  if (!abilitiesClickBound) {
    dom.abilitiesList.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".ability-activate");
      if (!target || target.disabled) return;
      const id = target.dataset.ability;
      if (id) send({ type: "useClassAbility", id });
    });
    abilitiesClickBound = true;
  }

  if (!abilities.length) {
    for (const { row } of abilityRows.values()) row.remove();
    abilityRows.clear();
    if (!abilityEmptyEl) {
      abilityEmptyEl = document.createElement("div");
      abilityEmptyEl.className = "ability-empty";
      abilityEmptyEl.textContent = "No abilities yet.";
      dom.abilitiesList.appendChild(abilityEmptyEl);
    }
    return;
  }

  if (abilityEmptyEl) {
    abilityEmptyEl.remove();
    abilityEmptyEl = null;
  }

  const seen = new Set<string>();
  abilities.forEach((ability, index) => {
    seen.add(ability.id);
    let entry = abilityRows.get(ability.id);
    if (!entry) {
      entry = createAbilityRow(ability);
      abilityRows.set(ability.id, entry);
    }
    const expected = dom.abilitiesList.children[index];
    if (expected !== entry.row) {
      dom.abilitiesList.insertBefore(entry.row, expected ?? null);
    }
    updateAbilityRow(entry, ability);
  });

  for (const [id, entry] of abilityRows) {
    if (!seen.has(id)) {
      entry.row.remove();
      abilityRows.delete(id);
    }
  }
}

function createAbilityRow(ability: AbilityView): AbilityRowEntry {
  const row = document.createElement("div");
  row.className = "ability-row";
  row.draggable = true;
  row.dataset.ability = ability.id;
  row.addEventListener("dragstart", (event) => {
    activeHotbarDrag = { source: "abilities", abilityId: ability.id };
    hotbarDragLandedInHotbar = false;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/plain", `ability:${ability.id}`);
    }
  });
  row.addEventListener("dragend", finishHotbarDrag);

  const meta = document.createElement("div");
  meta.className = "ability-meta";

  const nameEl = document.createElement("span");
  nameEl.className = "ability-name";

  const descEl = document.createElement("span");
  descEl.className = "ability-desc";

  const progressWrap = document.createElement("div");
  progressWrap.className = "ability-progress";
  const progressEl = document.createElement("span");
  progressWrap.appendChild(progressEl);

  meta.append(nameEl, descEl, progressWrap);

  const actions = document.createElement("div");
  actions.className = "ability-actions";

  const statusEl = document.createElement("span");

  const button = document.createElement("button");
  button.className = "ability-activate";
  button.type = "button";
  button.dataset.ability = ability.id;
  button.textContent = "Use";

  actions.append(statusEl, button);
  row.append(meta, actions);

  return { row, nameEl, descEl, statusEl, progressEl, button };
}

function updateAbilityRow(entry: AbilityRowEntry, ability: AbilityView): void {
  entry.nameEl.textContent = ability.label;
  entry.descEl.textContent = ability.description;

  const onCooldown = ability.cooldownRemainingMs > 0;
  const isActive = ability.activeRemainingMs > 0;
  let status = "Ready";
  let statusClass = "ready";
  if (isActive) {
    status = `Active ${Math.ceil(ability.activeRemainingMs / 1000)}s`;
    statusClass = "active";
  } else if (onCooldown) {
    status = `Cooldown ${Math.ceil(ability.cooldownRemainingMs / 1000)}s`;
    statusClass = "cooldown";
  }
  entry.statusEl.textContent = status;
  entry.statusEl.className = `ability-status ${statusClass}`;

  const progressDenom = isActive
    ? Math.max(1, ability.durationMs)
    : Math.max(1, ability.cooldownMs);
  const progressNum = isActive ? ability.activeRemainingMs : ability.cooldownRemainingMs;
  const progress = Math.max(0, Math.min(1, progressNum / progressDenom));
  entry.progressEl.style.width = `${Math.round(progress * 100)}%`;
  entry.progressEl.className = statusClass;

  entry.button.disabled = onCooldown || isActive;
}

function showItemPopover(slot: HTMLElement, label: string): void {
  dom.itemPopover.textContent = label;
  dom.itemPopover.classList.remove("hidden");
  positionItemPopover(slot);
}

function positionItemPopover(slot: HTMLElement): void {
  if (dom.itemPopover.classList.contains("hidden")) return;
  const rect = slot.getBoundingClientRect();
  const popoverRect = dom.itemPopover.getBoundingClientRect();
  const x = Math.min(window.innerWidth - popoverRect.width - 8, rect.left + rect.width / 2 - popoverRect.width / 2);
  const y = rect.top > popoverRect.height + 14 ? rect.top - popoverRect.height - 8 : rect.bottom + 8;
  dom.itemPopover.style.left = `${Math.max(8, x)}px`;
  dom.itemPopover.style.top = `${Math.max(8, Math.min(window.innerHeight - popoverRect.height - 8, y))}px`;
}

function hideItemPopover(): void {
  dom.itemPopover.classList.add("hidden");
}

function handleInventoryClick(slotIndex: number, itemId: string): void {
  const fireLog = firemakingLogItem(selectedInventoryItem, itemId);
  if (fireLog) {
    send({ type: "makeFire", logItem: fireLog });
    clearInventorySelection();
    hideItemPopover();
    hideCenterPanels();
    renderInventory(self()?.inventory ?? []);
    return;
  }
  if (pendingCookingFire && isCookableItem(itemId)) {
    const fire = latestState?.fires?.find((item) => item.id === pendingCookingFire);
    clearInventorySelection();
    hideItemPopover();
    hideCenterPanels();
    if (fire) startCookingPath(fire, itemId);
    else pendingCookingFire = null;
    renderInventory(self()?.inventory ?? []);
    return;
  }
  if (selectedInventorySlot === slotIndex && selectedInventoryItem === itemId) {
    clearInventorySelection();
  } else {
    selectedInventorySlot = slotIndex;
    selectedInventoryItem = itemId;
  }
  renderInventory(self()?.inventory ?? []);
}

function clearInventorySelection(): void {
  selectedInventorySlot = null;
  selectedInventoryItem = null;
}

function firemakingLogItem(firstItemId: string | null, secondItemId: string | null): string | null {
  const pair = [firstItemId, secondItemId];
  const lighter = pair.find((id) => itemUseKind(id) === "light_fire");
  if (!lighter) return null;
  const lighterUse = ITEMS[lighter]?.use;
  const consumesAny = lighterUse && lighterUse.kind === "light_fire" ? lighterUse.consumesAny : [];
  const consumables = new Set((consumesAny ?? []).map((c) => c.item));
  return pair.find((id) => id != null && consumables.has(id)) ?? null;
}

function isCookableItem(itemId: string | null): boolean {
  return itemUseKind(itemId) === "cook_on_fire";
}

// --- Hotbar ---------------------------------------------------------------
// Bottom-center bar holding consumables and class abilities for fast use.
// Layout is per-character in localStorage. Slots are either
// { kind: "item", itemId } (dragged from inventory) or
// { kind: "ability", abilityId } (dragged from the abilities panel).

const HOTBAR_SLOTS = 8;
let hotbarLayout: HotbarSlot[] = Array<HotbarSlot>(HOTBAR_SLOTS).fill(null);
let hotbarBoundCharacter: string | null = null;
let hotbarRenderedSig = "";
let activeHotbarDrag: HotbarDrag | null = null;
let hotbarDragLandedInHotbar = false;

function hotbarStorageKey(name: string): string {
  return `tib.hotbar.${name}`;
}

function loadHotbarFor(name: string): void {
  if (!name || hotbarBoundCharacter === name) return;
  hotbarBoundCharacter = name;
  hotbarLayout = Array<HotbarSlot>(HOTBAR_SLOTS).fill(null);
  try {
    const raw = localStorage.getItem(hotbarStorageKey(name));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < Math.min(parsed.length, HOTBAR_SLOTS); i++) {
          const slot = parsed[i] as { kind?: unknown; itemId?: unknown; abilityId?: unknown } | null;
          if (slot?.kind === "item" && typeof slot.itemId === "string" && ITEMS[slot.itemId]?.use) {
            hotbarLayout[i] = { kind: "item", itemId: slot.itemId };
          } else if (slot?.kind === "ability" && typeof slot.abilityId === "string" && ABILITIES[slot.abilityId]) {
            hotbarLayout[i] = { kind: "ability", abilityId: slot.abilityId };
          }
        }
      }
    }
  } catch {
    // ignore corrupt storage
  }
  hotbarRenderedSig = "";
}

function saveHotbar(): void {
  if (!hotbarBoundCharacter) return;
  try {
    localStorage.setItem(hotbarStorageKey(hotbarBoundCharacter), JSON.stringify(hotbarLayout));
  } catch {
    // storage quota / private mode — keep going, layout is non-essential
  }
}

function inventoryQty(inventory: Array<InventoryItemView | null> | undefined, itemId: string): number {
  let total = 0;
  for (const item of inventory ?? []) if (item?.id === itemId) total += item.qty ?? 1;
  return total;
}

function isHotbarUsable(itemId: string | null): boolean {
  if (!itemId) return false;
  return Boolean(ITEMS[itemId]?.use);
}

function isAbilitySlottable(abilityId: string | null): boolean {
  if (!abilityId) return false;
  return Boolean(ABILITIES[abilityId]);
}

function renderHotbar(inventory: Array<InventoryItemView | null> = []): void {
  const abilities = self()?.abilities ?? [];
  const sig = hotbarLayout
    .map((slot, i) => {
      if (!slot) return `${i}:-`;
      if (slot.kind === "item") return `${i}:i:${slot.itemId}:${inventoryQty(inventory, slot.itemId)}`;
      const live = abilities.find((a) => a.id === slot.abilityId);
      const onCooldown = (live?.cooldownRemainingMs ?? 0) > 0 ? 1 : 0;
      const isActive = (live?.activeRemainingMs ?? 0) > 0 ? 1 : 0;
      return `${i}:a:${slot.abilityId}:${onCooldown}:${isActive}`;
    })
    .join("|");
  if (sig === hotbarRenderedSig) return;
  hotbarRenderedSig = sig;

  dom.hotbar.innerHTML = hotbarLayout
    .map((slot, i) => {
      const key = i < 9 ? `${i + 1}` : "";
      // Slots 1, 3, 4 are the class-specific slots that swap with the equipped
      // weapon/class — flagged with a faint jade frame.
      const classSlot = i === 0 || i === 2 || i === 3 ? " class-slot" : "";
      if (!slot) {
        return `<button class="hotbar-slot empty${classSlot}" type="button" data-slot="${i}"><b class="hotbar-key">${key}</b></button>`;
      }
      if (slot.kind === "item") {
        const item = ITEMS[slot.itemId];
        const qty = inventoryQty(inventory, slot.itemId);
        const depleted = qty === 0 ? " depleted" : "";
        const icon = item ? iconMarkup(item.iconUrl, item.icon, "item-icon") : "?";
        const label = item?.label ?? slot.itemId;
        return `<button class="hotbar-slot${depleted}${classSlot}" type="button" draggable="true" data-slot="${i}" data-item="${escapeHtml(slot.itemId)}" data-label="${escapeHtml(label)}"><b class="hotbar-key">${key}</b>${icon}<span class="hotbar-qty">${qty}</span></button>`;
      }
      const ability = ABILITIES[slot.abilityId];
      const live = abilities.find((a) => a.id === slot.abilityId);
      const isActive = (live?.activeRemainingMs ?? 0) > 0;
      const onCooldown = (live?.cooldownRemainingMs ?? 0) > 0;
      const stateClass = isActive ? " ability-active" : onCooldown ? " ability-cooldown" : "";
      const label = ability?.label ?? slot.abilityId;
      const glyph = abilityGlyph(label);
      return `<button class="hotbar-slot ability${stateClass}${classSlot}" type="button" draggable="true" data-slot="${i}" data-ability="${escapeHtml(slot.abilityId)}" data-label="${escapeHtml(label)}"><b class="hotbar-key">${key}</b><span class="hotbar-ability">${escapeHtml(glyph)}</span></button>`;
    })
    .join("");

  dom.hotbar.querySelectorAll<HTMLElement>(".hotbar-slot").forEach((elem) => {
    const slotIndex = Number(elem.dataset.slot);
    elem.addEventListener("click", () => handleHotbarSlotClick(slotIndex));
    elem.addEventListener("dragover", (event) => {
      if (!activeHotbarDrag) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      elem.classList.add("drag-over");
    });
    elem.addEventListener("dragleave", () => elem.classList.remove("drag-over"));
    elem.addEventListener("drop", (event) => {
      event.preventDefault();
      elem.classList.remove("drag-over");
      hotbarDragLandedInHotbar = true;
      handleHotbarDrop(slotIndex);
    });
    if (elem.getAttribute("draggable") === "true") {
      const label = elem.dataset.label ?? "";
      elem.addEventListener("dragstart", (event) => {
        activeHotbarDrag = { source: "hotbar", slotIndex };
        hotbarDragLandedInHotbar = false;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `hotbar:${slotIndex}`);
        }
      });
      elem.addEventListener("dragend", finishHotbarDrag);
      elem.addEventListener("mouseenter", () => showItemPopover(elem, label));
      elem.addEventListener("mousemove", () => positionItemPopover(elem));
      elem.addEventListener("mouseleave", hideItemPopover);
    }
  });
}

// Place an inventory item shortcut into a hotbar slot, clearing any other slot
// that already held the same item so it never appears twice. Shared by the
// drag path and the click-to-place path.
function assignInventoryItemToHotbar(itemId: string, targetSlot: number): void {
  if (!isHotbarUsable(itemId)) return;
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    const slot = hotbarLayout[i];
    if (i !== targetSlot && slot?.kind === "item" && slot.itemId === itemId) {
      hotbarLayout[i] = null;
    }
  }
  hotbarLayout[targetSlot] = { kind: "item", itemId };
  saveHotbar();
  hotbarRenderedSig = "";
  renderHotbar(self()?.inventory ?? []);
}

// Clicking a hotbar slot while a hotbar-usable inventory item is highlighted
// drops that item's shortcut onto the slot instead of activating it. Returns
// true if it consumed the click as a placement.
function tryPlaceSelectedItemOnHotbar(slotIndex: number): boolean {
  if (!selectedInventoryItem || !isHotbarUsable(selectedInventoryItem)) return false;
  assignInventoryItemToHotbar(selectedInventoryItem, slotIndex);
  clearInventorySelection();
  hideItemPopover();
  renderInventory(self()?.inventory ?? []);
  return true;
}

function handleHotbarSlotClick(slotIndex: number): void {
  if (tryPlaceSelectedItemOnHotbar(slotIndex)) return;
  activateHotbarSlot(slotIndex);
}

function handleHotbarDrop(targetSlot: number): void {
  const drag = activeHotbarDrag;
  if (!drag) return;
  if (drag.source === "inventory") {
    assignInventoryItemToHotbar(drag.itemId, targetSlot);
    return;
  }
  if (drag.source === "abilities") {
    if (!isAbilitySlottable(drag.abilityId)) return;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = hotbarLayout[i];
      if (i !== targetSlot && slot?.kind === "ability" && slot.abilityId === drag.abilityId) {
        hotbarLayout[i] = null;
      }
    }
    hotbarLayout[targetSlot] = { kind: "ability", abilityId: drag.abilityId };
  } else if (drag.source === "hotbar") {
    if (drag.slotIndex === targetSlot) return;
    const moved = hotbarLayout[drag.slotIndex] ?? null;
    hotbarLayout[drag.slotIndex] = hotbarLayout[targetSlot] ?? null;
    hotbarLayout[targetSlot] = moved;
  }
  saveHotbar();
  hotbarRenderedSig = "";
  renderHotbar(self()?.inventory ?? []);
}

function finishHotbarDrag(): void {
  const drag = activeHotbarDrag;
  activeHotbarDrag = null;
  document.querySelectorAll<HTMLElement>(".hotbar-slot.drag-over").forEach((elem) => elem.classList.remove("drag-over"));
  if (!drag) return;
  if (drag.source === "hotbar" && !hotbarDragLandedInHotbar) {
    hotbarLayout[drag.slotIndex] = null;
    saveHotbar();
    hotbarRenderedSig = "";
    renderHotbar(self()?.inventory ?? []);
  }
  hotbarDragLandedInHotbar = false;
}

function activateHotbarSlot(slotIndex: number): boolean {
  const slot = hotbarLayout[slotIndex];
  if (!slot) return false;
  if (slot.kind === "item") {
    const me = self();
    if (!me || me.dead) return false;
    if (inventoryQty(me.inventory, slot.itemId) <= 0) return false;
    send({ type: "useItem", item: slot.itemId });
    return true;
  }
  if (slot.kind === "ability") {
    const me = self();
    if (!me || me.dead) return false;
    if (!me.abilities?.some((a) => a.id === slot.abilityId)) return false;
    // Server is authoritative on cooldown/active gating; the keypress is still
    // consumed so a bound slot never falls through to the Magic-strike default.
    send({ type: "useClassAbility", id: slot.abilityId });
    return true;
  }
  return false;
}

function abilityGlyph(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function iconMarkup(url: string | null, fallback: string | null, className: string): string {
  if (!url) return escapeHtml(fallback ?? "");
  // draggable="false": images drag natively by default, which would hijack the
  // press and start an image-drag instead of the parent slot's hotbar drag.
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(fallback ?? "")}" draggable="false" loading="lazy" />`;
}

function lootLabel(corpse: CorpseView): string {
  if (corpse.kind === "drop") return corpse.label ?? "Drop";
  return `${corpse.gold}g`;
}

function sendInput(time: number): void {
  if (isTextEntryFocused()) {
    sendStopInput();
    return;
  }
  const me = self();
  const clickInput = clickDestination && me ? inputTowardDestination(me) : null;
  const hasManualInput = keys.W?.isDown || cursors.up.isDown || keys.S?.isDown || cursors.down.isDown || keys.A?.isDown || cursors.left.isDown || keys.D?.isDown || cursors.right.isDown;
  if (hasManualInput) clearClickDestination();
  const input: InputPayload = {
    up: Boolean(keys.W?.isDown) || cursors.up.isDown || Boolean(clickInput?.up),
    down: Boolean(keys.S?.isDown) || cursors.down.isDown || Boolean(clickInput?.down),
    left: Boolean(keys.A?.isDown) || cursors.left.isDown || Boolean(clickInput?.left),
    right: Boolean(keys.D?.isDown) || cursors.right.isDown || Boolean(clickInput?.right),
    moveX: clickInput?.moveX ?? 0,
    moveY: clickInput?.moveY ?? 0
  };
  const bits = inputBits(input);
  if (time - lastInputAt < 50 && inputMatchesLast(bits, input.moveX, input.moveY)) return;
  lastInputAt = time;
  rememberInput(bits, input.moveX, input.moveY);
  send({ type: "input", input });
}

function sendStopInput(): void {
  const input: InputPayload = { up: false, down: false, left: false, right: false, moveX: 0, moveY: 0 };
  const bits = inputBits(input);
  if (inputMatchesLast(bits, input.moveX, input.moveY)) return;
  rememberInput(bits, input.moveX, input.moveY);
  send({ type: "input", input });
}

function inputBits(input: InputPayload): number {
  return Number(input.up) | (Number(input.down) << 1) | (Number(input.left) << 2) | (Number(input.right) << 3);
}

function inputMatchesLast(bits: number, moveX: number, moveY: number): boolean {
  return bits === lastInputBits && moveX === lastInputMoveX && moveY === lastInputMoveY;
}

function rememberInput(bits: number, moveX: number, moveY: number): void {
  lastInputBits = bits;
  lastInputMoveX = moveX;
  lastInputMoveY = moveY;
}

function isMenuOpen(): boolean {
  return !dom.menuBackdrop.classList.contains("hidden");
}

function handleWorldClick(pointer: Phaser.Input.Pointer): void {
  if (!latestState || !self() || pointer.leftButtonDown() === false) return;
  // A center panel / dialogue is open: don't let clicks fall through to world movement.
  if (isMenuOpen()) return;
  const tx = Math.floor(pointer.worldX / TILE_SIZE);
  const ty = Math.floor(pointer.worldY / TILE_SIZE);
  const me = self();
  if (!me) return;
  if (startPathToTile(me.floor, tx, ty)) {
    holdMoveActive = true;
    holdMoveTile = { x: tx, y: ty };
    holdMoveLastRepathAt = scene?.time?.now ?? 0;
  } else {
    clearClickDestination();
  }
}

function tickHoldMove(time: number): void {
  if (!holdMoveActive) return;
  if (isMenuOpen()) {
    holdMoveActive = false;
    holdMoveTile = null;
    return;
  }
  const pointer = scene?.input?.activePointer;
  if (!pointer || !pointer.leftButtonDown()) {
    holdMoveActive = false;
    holdMoveTile = null;
    return;
  }
  const me = self();
  if (!me || me.dead) {
    holdMoveActive = false;
    holdMoveTile = null;
    return;
  }
  const tx = Math.floor(pointer.worldX / TILE_SIZE);
  const ty = Math.floor(pointer.worldY / TILE_SIZE);
  if (Math.floor(me.x) === tx && Math.floor(me.y) === ty) {
    holdMoveTile = { x: tx, y: ty };
    return;
  }
  const sameTile = holdMoveTile && holdMoveTile.x === tx && holdMoveTile.y === ty;
  if (sameTile && clickDestination) return;
  if (time - holdMoveLastRepathAt < HOLD_MOVE_REPATH_MS && clickDestination) return;
  if (!startPathToTile(me.floor, tx, ty)) return;
  holdMoveTile = { x: tx, y: ty };
  holdMoveLastRepathAt = time;
}

function inputTowardDestination(me: PlayerView): MovementInput | null {
  if (!clickDestination || clickDestination.floor !== me.floor || me.dead) {
    clearClickDestination();
    return null;
  }
  if (pendingAttackTarget) {
    const monster = latestState?.monsters?.find((item) => item.id === pendingAttackTarget);
    if (!monster || monster.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (isInAttackRange(me, monster)) {
      const monsterId = pendingAttackTarget;
      clearClickDestination();
      sendStopInput();
      send({ type: "target", id: monsterId });
      return null;
    }
    if (shouldRefreshDynamicPath("attack", monster)) {
      if (!refreshAttackPath(me, monster)) clearClickDestination();
      return null;
    }
  }
  if (pendingTreeCut) {
    const tree = latestState?.trees?.find((item) => item.id === pendingTreeCut && item.active);
    if (!tree || tree.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (Phaser.Math.Distance.Between(me.x, me.y, tree.x, tree.y) <= 1.78) {
      const treeId = pendingTreeCut;
      clearClickDestination();
      sendStopInput();
      send({ type: "cutTree", id: treeId });
      return null;
    }
  }
  if (pendingLootTarget) {
    const corpse = latestState?.corpses?.find((item) => item.id === pendingLootTarget);
    if (!corpse || corpse.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (Phaser.Math.Distance.Between(me.x, me.y, corpse.x, corpse.y) <= 1.85) {
      const corpseId = pendingLootTarget;
      clearClickDestination();
      sendStopInput();
      send({ type: "lootCorpse", id: corpseId });
      return null;
    }
  }
  if (pendingNpcTalk) {
    const npc = latestState?.npcs?.find((item) => item.id === pendingNpcTalk);
    if (!npc || npc.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (Phaser.Math.Distance.Between(me.x, me.y, npc.x, npc.y) <= 2.25) {
      const npcId = pendingNpcTalk;
      clearClickDestination();
      sendStopInput();
      if (npc.role === "vendor") openVendor();
      send({ type: "talkNpc", id: npcId });
      return null;
    }
    if (shouldRefreshDynamicPath("npc", npc)) {
      if (!refreshNpcTalkPath(me, npc)) clearClickDestination();
      return null;
    }
  }
  if (pendingFishingNode) {
    const node = latestState?.fishingNodes?.find((item) => item.id === pendingFishingNode);
    if (!node || node.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (isNearFishingSpot(me, node)) {
      const nodeId = pendingFishingNode;
      clearClickDestination();
      sendStopInput();
      send({ type: "fishNode", id: nodeId });
      return null;
    }
  }
  if (pendingMiningNode) {
    const node = latestState?.miningNodes?.find((item) => item.id === pendingMiningNode);
    if (!node || node.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (isNearMiningNode(me, node)) {
      const nodeId = pendingMiningNode;
      clearClickDestination();
      sendStopInput();
      send({ type: "mineNode", id: nodeId });
      return null;
    }
  }
  if (pendingHerbNode) {
    const node = latestState?.herbNodes?.find((item) => item.id === pendingHerbNode);
    if (!node || node.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (isNearHerbNode(me, node)) {
      const nodeId = pendingHerbNode;
      clearClickDestination();
      sendStopInput();
      send({ type: "gatherHerb", id: nodeId });
      return null;
    }
  }
  if (pendingCookingFire) {
    const fire = latestState?.fires?.find((item) => item.id === pendingCookingFire);
    if (!fire || fire.floor !== me.floor) {
      clearClickDestination();
      return null;
    }
    if (Phaser.Math.Distance.Between(me.x, me.y, fire.x, fire.y) <= 1.8) {
      const fireId = pendingCookingFire;
      clearClickDestination();
      sendStopInput();
      send({ type: "cookFish", id: fireId });
      return null;
    }
  }
  const dx = clickDestination.x - me.x;
  const dy = clickDestination.y - me.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.16) {
    if (clickPath.length) {
      clickDestination = clickPath.shift() ?? null;
    } else if (pendingAttackTarget && refreshAttackPath(me)) {
      return null;
    } else if (pendingLootTarget && refreshLootPath(me)) {
      return null;
    } else if (pendingNpcTalk && refreshNpcTalkPath(me)) {
      return null;
    } else if (pendingFishingNode && refreshFishingPath(me)) {
      return null;
    } else if (pendingMiningNode && refreshMiningPath(me)) {
      return null;
    } else if (pendingHerbNode && refreshHerbPath(me)) {
      return null;
    } else if (pendingCookingFire && refreshCookingPath(me)) {
      return null;
    } else if (holdMoveActive && scene?.input?.activePointer?.leftButtonDown()) {
      clearClickDestination({ keepHold: true });
    } else {
      clearClickDestination();
    }
    return null;
  }

  return {
    up: dy < -0.12,
    down: dy > 0.12,
    left: dx < -0.12,
    right: dx > 0.12,
    moveX: dx / distance,
    moveY: dy / distance
  };
}

function startAttackPath(monsterOrId: string | MonsterView): void {
  const monster = resolveMonster(monsterOrId);
  const me = self();
  if (!me || !monster || monster.floor !== me.floor) return;
  clearClickDestination();
  send({ type: "target", id: monster.id });
  if (isInAttackRange(me, monster)) return;

  pendingAttackTarget = monster.id;
  if (!refreshAttackPath(me, monster)) {
    pendingAttackTarget = null;
  }
}

function refreshAttackPath(me: PlayerView, monster: MonsterView | null = null): boolean {
  const target = monster ?? latestState?.monsters?.find((item) => item.id === pendingAttackTarget);
  if (!target || target.floor !== me.floor) return false;
  if (isInAttackRange(me, target)) return true;
  const destination = nearestEntityApproachTile(me, target, attackRange(me) - 0.08);
  const started = Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, target.id));
  if (started) rememberDynamicPathTarget("attack", target);
  return started;
}

function isInAttackRange(me: PlayerView, monster: MonsterView): boolean {
  return Phaser.Math.Distance.Between(me.x, me.y, monster.x, monster.y) <= attackRange(me) + 0.08;
}

function attackRange(me: PlayerView): number {
  return (CLASSES[me.classKey] ?? CLASSES.adventurer ?? fallbackClassSpec()).range;
}

function startTreeCutPath(tree: TreeView): void {
  const me = self();
  if (!me || !tree.active || tree.floor !== me.floor) return;
  clearClickDestination();
  pendingTreeCut = tree.id;
  if (Phaser.Math.Distance.Between(me.x, me.y, tree.x, tree.y) <= 1.78) {
    pendingTreeCut = null;
    send({ type: "cutTree", id: tree.id });
    return;
  }

  const destination = nearestTreeApproachTile(me, tree);
  if (!destination || !startPathToTile(me.floor, destination.x, destination.y, tree.id)) {
    pendingTreeCut = null;
  }
}

function startLootPath(corpse: CorpseView): void {
  const me = self();
  if (!me || corpse.floor !== me.floor) return;
  clearClickDestination();
  pendingLootTarget = corpse.id;
  if (Phaser.Math.Distance.Between(me.x, me.y, corpse.x, corpse.y) <= 1.85) {
    pendingLootTarget = null;
    send({ type: "lootCorpse", id: corpse.id });
    return;
  }

  if (!refreshLootPath(me, corpse)) {
    pendingLootTarget = null;
  }
}

function refreshLootPath(me: PlayerView, corpse: CorpseView | null = null): boolean {
  const target = corpse ?? latestState?.corpses?.find((item) => item.id === pendingLootTarget);
  if (!target || target.floor !== me.floor) return false;
  if (Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) <= 1.85) return true;
  const destination = nearestEntityApproachTile(me, target, 1.8);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, target.id));
}

function startNpcTalkPath(npcOrId: string | NpcView): void {
  const npc = resolveNpc(npcOrId);
  const me = self();
  if (!me || !npc || npc.floor !== me.floor) return;
  clearClickDestination();
  pendingNpcTalk = npc.id;
  if (Phaser.Math.Distance.Between(me.x, me.y, npc.x, npc.y) <= 2.25) {
    pendingNpcTalk = null;
    if (npc.role === "vendor") openVendor();
    send({ type: "talkNpc", id: npc.id });
    return;
  }

  if (!refreshNpcTalkPath(me, npc)) {
    pendingNpcTalk = null;
  }
}

function startFishingPath(node: FishingNodeView): void {
  const me = self();
  if (!me || !node || node.floor !== me.floor) return;
  clearClickDestination();
  pendingFishingNode = node.id;
  if (isNearFishingSpot(me, node)) {
    pendingFishingNode = null;
    send({ type: "fishNode", id: node.id });
    return;
  }
  if (!refreshFishingPath(me, node)) pendingFishingNode = null;
}

function refreshFishingPath(me: PlayerView, node: FishingNodeView | null = null): boolean {
  const target = node ?? latestState?.fishingNodes?.find((item) => item.id === pendingFishingNode);
  if (!target || target.floor !== me.floor) return false;
  if (isNearFishingSpot(me, target)) return true;
  const destination = fishingApproachTile(me, target) ?? nearestEntityApproachTile(me, fishingApproachPoint(target), 1.15);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, null, null, target.id));
}

function isNearFishingSpot(me: PlayerView, node: FishingNodeView): boolean {
  const approach = fishingApproachPoint(node);
  return Phaser.Math.Distance.Between(me.x, me.y, approach.x, approach.y) <= 1.35;
}

function fishingApproachPoint(node: FishingNodeView): ApproachPoint {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function fishingApproachTile(me: PlayerView, node: FishingNodeView): ApproachCandidate | TilePoint | null {
  const approach = fishingApproachPoint(node);
  const tx = Math.floor(approach.x);
  const ty = Math.floor(approach.y);
  if (canStandAtTile(node.floor, tx, ty)) return { x: tx, y: ty };
  return nearestEntityApproachTile(me, approach, 1.2);
}

function startMiningPath(node: MiningNodeView): void {
  const me = self();
  if (!me || !node || node.floor !== me.floor) return;
  clearClickDestination();
  pendingMiningNode = node.id;
  if (isNearMiningNode(me, node)) {
    pendingMiningNode = null;
    send({ type: "mineNode", id: node.id });
    return;
  }
  if (!refreshMiningPath(me, node)) pendingMiningNode = null;
}

function refreshMiningPath(me: PlayerView, node: MiningNodeView | null = null): boolean {
  const target = node ?? latestState?.miningNodes?.find((item) => item.id === pendingMiningNode);
  if (!target || target.floor !== me.floor) return false;
  if (isNearMiningNode(me, target)) return true;
  const destination = miningApproachTile(me, target) ?? nearestEntityApproachTile(me, miningApproachPoint(target), 1.15);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, null, null, null, null, target.id));
}

function isNearMiningNode(me: PlayerView, node: MiningNodeView): boolean {
  const approach = miningApproachPoint(node);
  return Phaser.Math.Distance.Between(me.x, me.y, approach.x, approach.y) <= 1.35;
}

function miningApproachPoint(node: MiningNodeView): ApproachPoint {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function miningApproachTile(me: PlayerView, node: MiningNodeView): ApproachCandidate | TilePoint | null {
  const approach = miningApproachPoint(node);
  const tx = Math.floor(approach.x);
  const ty = Math.floor(approach.y);
  if (canStandAtTile(node.floor, tx, ty)) return { x: tx, y: ty };
  return nearestEntityApproachTile(me, approach, 1.2);
}

function startHerbPath(node: HerbNodeView): void {
  const me = self();
  if (!me || !node || node.floor !== me.floor) return;
  clearClickDestination();
  pendingHerbNode = node.id;
  if (isNearHerbNode(me, node)) {
    pendingHerbNode = null;
    send({ type: "gatherHerb", id: node.id });
    return;
  }
  if (!refreshHerbPath(me, node)) pendingHerbNode = null;
}

function refreshHerbPath(me: PlayerView, node: HerbNodeView | null = null): boolean {
  const target = node ?? latestState?.herbNodes?.find((item) => item.id === pendingHerbNode);
  if (!target || target.floor !== me.floor) return false;
  if (isNearHerbNode(me, target)) return true;
  const destination = herbApproachTile(me, target) ?? nearestEntityApproachTile(me, herbApproachPoint(target), 1.15);
  return Boolean(
    destination && startPathToTile(me.floor, destination.x, destination.y, null, null, null, null, null, null, null, target.id)
  );
}

function isNearHerbNode(me: PlayerView, node: HerbNodeView): boolean {
  const approach = herbApproachPoint(node);
  return Phaser.Math.Distance.Between(me.x, me.y, approach.x, approach.y) <= 1.35;
}

function herbApproachPoint(node: HerbNodeView): ApproachPoint {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function herbApproachTile(me: PlayerView, node: HerbNodeView): ApproachCandidate | TilePoint | null {
  const approach = herbApproachPoint(node);
  const tx = Math.floor(approach.x);
  const ty = Math.floor(approach.y);
  if (canStandAtTile(node.floor, tx, ty)) return { x: tx, y: ty };
  return nearestEntityApproachTile(me, approach, 1.2);
}

function startCookingPath(fire: FireView, itemId: string | null = selectedInventoryItem): void {
  const me = self();
  if (!me || !fire || fire.floor !== me.floor) return;
  clearClickDestination();
  pendingCookingFire = fire.id;
  if (!isCookableItem(itemId)) {
    showCenterPanel(dom.inventoryPanel);
    renderInventory(me.inventory ?? []);
    return;
  }
  if (Phaser.Math.Distance.Between(me.x, me.y, fire.x, fire.y) <= 1.8) {
    pendingCookingFire = null;
    send({ type: "cookFish", id: fire.id });
    return;
  }
  if (!refreshCookingPath(me, fire)) pendingCookingFire = null;
}

function refreshCookingPath(me: PlayerView, fire: FireView | null = null): boolean {
  const target = fire ?? latestState?.fires?.find((item) => item.id === pendingCookingFire);
  if (!target || target.floor !== me.floor) return false;
  if (Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) <= 1.8) return true;
  const destination = nearestEntityApproachTile(me, target, 1.7);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, null, null, null, target.id));
}

function refreshNpcTalkPath(me: PlayerView, npc: NpcView | null = null): boolean {
  const target = npc ?? latestState?.npcs?.find((item) => item.id === pendingNpcTalk);
  if (!target || target.floor !== me.floor) return false;
  if (Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) <= 2.25) return true;
  const destination = nearestEntityApproachTile(me, target, 2.15);
  const started = Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, null, target.id));
  if (started) rememberDynamicPathTarget("npc", target);
  return started;
}

function shouldRefreshDynamicPath(kind: string, entity: { id: string; x: number; y: number }): boolean {
  const now = performance.now();
  if (now - lastDynamicPathRefreshAt < DYNAMIC_PATH_REFRESH_MS) return false;
  if (!dynamicPathTarget || dynamicPathTarget.kind !== kind || dynamicPathTarget.id !== entity.id) return true;
  return Phaser.Math.Distance.Between(dynamicPathTarget.x, dynamicPathTarget.y, entity.x, entity.y) >= DYNAMIC_PATH_REFRESH_DISTANCE;
}

function rememberDynamicPathTarget(kind: string, entity: { id: string; x: number; y: number }): void {
  dynamicPathTarget = { kind, id: entity.id, x: entity.x, y: entity.y };
  lastDynamicPathRefreshAt = performance.now();
}

function resolveMonster(monsterOrId: string | MonsterView): MonsterView | null {
  const id = typeof monsterOrId === "string" ? monsterOrId : monsterOrId?.id;
  return latestState?.monsters?.find((monster) => monster.id === id) ?? null;
}

function resolveNpc(npcOrId: string | NpcView): NpcView | null {
  const id = typeof npcOrId === "string" ? npcOrId : npcOrId?.id;
  return latestState?.npcs?.find((npc) => npc.id === id) ?? null;
}

function openVendor(): void {
  showCenterPanel(dom.vendor);
}

function toggleCenterPanel(panel: HTMLElement): void {
  if (panel.classList.contains("hidden")) showCenterPanel(panel);
  else hideCenterPanels();
}

function showCenterPanel(panel: HTMLElement): void {
  hideCenterPanels();
  dom.menuBackdrop.classList.remove("hidden");
  panel.classList.remove("hidden");
}

function hideCenterPanels(): void {
  dom.menuBackdrop.classList.add("hidden");
  dom.skillsPanel.classList.add("hidden");
  dom.inventoryPanel.classList.add("hidden");
  dom.equipmentPanel.classList.add("hidden");
  dom.abilitiesPanel.classList.add("hidden");
  dom.classesPanel.classList.add("hidden");
  dom.vendor.classList.add("hidden");
  dom.alchemist.classList.add("hidden");
  dom.mapScreen.classList.add("hidden");
  closeDialogue(false);
}

function nearestTreeApproachTile(me: PlayerView, tree: TreeView): ApproachCandidate | null {
  const treeTileX = Math.floor(tree.x);
  const treeTileY = Math.floor(tree.y);
  const candidates: ApproachCandidate[] = [];
  for (let y = treeTileY - 2; y <= treeTileY + 2; y += 1) {
    for (let x = treeTileX - 2; x <= treeTileX + 2; x += 1) {
      if (!canStandAtTile(tree.floor, x, y)) continue;
      const center = { x: x + 0.5, y: y + 0.5 };
      const treeDistance = Phaser.Math.Distance.Between(center.x, center.y, tree.x, tree.y);
      if (treeDistance > 1.72) continue;
      candidates.push({
        x,
        y,
        score: Phaser.Math.Distance.Between(me.x, me.y, center.x, center.y) + treeDistance * 0.2
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

function nearestEntityApproachTile(me: PlayerView, entity: { floor: number; x: number; y: number }, maxRange: number): ApproachCandidate | null {
  const entityTileX = Math.floor(entity.x);
  const entityTileY = Math.floor(entity.y);
  const candidates: ApproachCandidate[] = [];
  for (let y = entityTileY - 2; y <= entityTileY + 2; y += 1) {
    for (let x = entityTileX - 2; x <= entityTileX + 2; x += 1) {
      if (!canStandAtTile(entity.floor, x, y)) continue;
      const center = { x: x + 0.5, y: y + 0.5 };
      const targetDistance = Phaser.Math.Distance.Between(center.x, center.y, entity.x, entity.y);
      if (targetDistance > maxRange) continue;
      candidates.push({
        x,
        y,
        score: Phaser.Math.Distance.Between(me.x, me.y, center.x, center.y) + targetDistance * 0.25
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

function startPathToTile(
  floor: number,
  tx: number,
  ty: number,
  treeId: string | null = null,
  attackId: string | null = null,
  lootId: string | null = null,
  npcId: string | null = null,
  fishingId: string | null = null,
  fireId: string | null = null,
  miningId: string | null = null,
  herbId: string | null = null
): boolean {
  const me = self();
  if (!me || floor !== me.floor) return false;
  const destination = findReachableClickTile(floor, Math.floor(me.x), Math.floor(me.y), tx, ty);
  if (!destination) return false;
  const path = findTilePath(floor, Math.floor(me.x), Math.floor(me.y), destination.x, destination.y);
  if (!path.length) return false;
  clickPath = simplifyTilePath(path).slice(1).map((node) => ({ floor, x: node.x + 0.5, y: node.y + 0.5 }));
  clickDestination = clickPath.shift() ?? { floor, x: destination.x + 0.5, y: destination.y + 0.5 };
  pendingTreeCut = treeId;
  pendingAttackTarget = attackId;
  pendingLootTarget = lootId;
  pendingNpcTalk = npcId;
  pendingFishingNode = fishingId;
  pendingCookingFire = fireId;
  pendingMiningNode = miningId;
  pendingHerbNode = herbId;
  if (!attackId && !npcId) dynamicPathTarget = null;
  drawClickMarker({ floor, x: destination.x + 0.5, y: destination.y + 0.5 });
  return true;
}

function findReachableClickTile(floor: number, startX: number, startY: number, tx: number, ty: number): TilePoint | null {
  if (!isInMap(floor, tx, ty)) return null;
  if (canStandAtTile(floor, tx, ty)) return { x: tx, y: ty };

  const maxRadius = 4;
  const candidates: ApproachCandidate[] = [];
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let y = ty - radius; y <= ty + radius; y += 1) {
      for (let x = tx - radius; x <= tx + radius; x += 1) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== radius) continue;
        if (!canStandAtTile(floor, x, y)) continue;
        candidates.push({
          x,
          y,
          score: tileHeuristic(startX, startY, x, y) + tileHeuristic(tx, ty, x, y) * 0.4
        });
      }
    }
    if (candidates.length) break;
  }

  candidates.sort((a, b) => a.score - b.score);
  for (const candidate of candidates) {
    if (findTilePath(floor, startX, startY, candidate.x, candidate.y).length) {
      return { x: candidate.x, y: candidate.y };
    }
  }
  return null;
}

function simplifyTilePath(path: TilePoint[]): TilePoint[] {
  if (path.length <= 2) return path;
  const first = path[0];
  if (!first) return path;
  const simplified: TilePoint[] = [first];
  for (let i = 1; i < path.length - 1; i += 1) {
    const previous = simplified[simplified.length - 1];
    const current = path[i];
    const next = path[i + 1];
    if (!previous || !current || !next) continue;
    const dx1 = Math.sign(current.x - previous.x);
    const dy1 = Math.sign(current.y - previous.y);
    const dx2 = Math.sign(next.x - current.x);
    const dy2 = Math.sign(next.y - current.y);
    if (dx1 === dx2 && dy1 === dy2) continue;
    simplified.push(current);
  }
  const last = path[path.length - 1];
  if (last) simplified.push(last);
  return simplified;
}

function findTilePath(floor: number, startX: number, startY: number, goalX: number, goalY: number): TilePoint[] {
  if (startX === goalX && startY === goalY) return [{ x: startX, y: startY }];
  const startNode: PathNode = { x: startX, y: startY, g: 0, f: tileHeuristic(startX, startY, goalX, goalY), parent: null };
  const open = new BinaryHeap<PathNode>((a, b) => a.f - b.f);
  open.push(startNode);
  const bestByKey = new Map<string, PathNode>([[tileKey(startX, startY), startNode]]);
  const closed = new Set<string>();
  const maxVisited = floorCols(floor) * floorRows(floor);

  while (open.size > 0 && closed.size < maxVisited) {
    const current = open.pop();
    if (!current) break;
    const currentKey = tileKey(current.x, current.y);
    if (closed.has(currentKey)) continue;
    if (current.x === goalX && current.y === goalY) return unwindPath(current);
    closed.add(currentKey);

    for (const neighbor of pathNeighbors(floor, current.x, current.y)) {
      const key = tileKey(neighbor.x, neighbor.y);
      if (closed.has(key)) continue;
      const g = current.g + neighbor.cost;
      const existing = bestByKey.get(key);
      if (existing && existing.g <= g) continue;
      const next: PathNode = {
        x: neighbor.x,
        y: neighbor.y,
        g,
        f: g + tileHeuristic(neighbor.x, neighbor.y, goalX, goalY),
        parent: current
      };
      bestByKey.set(key, next);
      open.push(next);
    }
  }

  return [];
}

class BinaryHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const item = this.items[index];
      const parentItem = this.items[parent];
      if (item === undefined || parentItem === undefined || this.compare(item, parentItem) >= 0) break;
      this.items[index] = parentItem;
      this.items[parent] = item;
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      const leftItem = this.items[left];
      const rightItem = this.items[right];
      const smallestItem = this.items[smallest];
      if (leftItem !== undefined && smallestItem !== undefined && this.compare(leftItem, smallestItem) < 0) smallest = left;
      const nextSmallest = this.items[smallest];
      if (rightItem !== undefined && nextSmallest !== undefined && this.compare(rightItem, nextSmallest) < 0) smallest = right;
      if (smallest === index) break;
      const item = this.items[index];
      const swap = this.items[smallest];
      if (item === undefined || swap === undefined) break;
      this.items[index] = swap;
      this.items[smallest] = item;
      index = smallest;
    }
  }
}

function pathNeighbors(floor: number, x: number, y: number): Array<{ x: number; y: number; cost: number }> {
  const neighbors: Array<{ x: number; y: number; cost: number }> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!canStandAtTile(floor, nx, ny)) continue;
      if (dx && dy && (!canStandAtTile(floor, x + dx, y) || !canStandAtTile(floor, x, y + dy))) continue;
      neighbors.push({ x: nx, y: ny, cost: dx && dy ? Math.SQRT2 : 1 });
    }
  }
  return neighbors;
}

function canStandAtTile(floor: number, tx: number, ty: number): boolean {
  return isInMap(floor, tx, ty) && !isBlockedTile(tileAt(floor, tx, ty));
}

function isInMap(floor: number, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < floorCols(floor) && ty < floorRows(floor);
}

function tileHeuristic(x: number, y: number, goalX: number, goalY: number): number {
  const dx = Math.abs(goalX - x);
  const dy = Math.abs(goalY - y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function unwindPath(node: PathNode): TilePoint[] {
  const path: TilePoint[] = [];
  for (let current: PathNode | null = node; current; current = current.parent) path.push({ x: current.x, y: current.y });
  return path.reverse();
}

function cycleTarget(): void {
  const me = self();
  if (!me || isTextEntryFocused() || !latestState) return;
  const candidates = latestState.monsters
    .filter((monster) => monster.floor === me.floor)
    .map((monster) => ({ ...monster, dist: Phaser.Math.Distance.Between(me.x, me.y, monster.x, monster.y) }))
    .sort((a, b) => a.dist - b.dist);
  if (!candidates.length) return;

  const currentIndex = candidates.findIndex((monster) => monster.id === me.targetId);
  const next = candidates[(currentIndex + 1) % candidates.length];
  if (!next) return;
  clearClickDestination();
  send({ type: "target", id: next.id });
}

function isTextEntryFocused(): boolean {
  return isTextEntryElement(document.activeElement);
}

function isTextEntryElement(element: Element | null): boolean {
  if (!element) return false;
  if ((element as HTMLElement).isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function stopTextEntryKeyPropagation(event: KeyboardEvent): void {
  if (isTextEntryElement(event.target as Element | null)) event.stopPropagation();
}

function refreshKeyboardCapture(): void {
  const keyboard = scene?.input?.keyboard;
  if (!keyboard) return;
  if (isTextEntryFocused()) {
    keyboard.disableGlobalCapture();
  } else {
    keyboard.enableGlobalCapture();
  }
}

function drawClickMarker(destination: PathDestination): void {
  if (!clickMarker) {
    clickMarker = scene.add.ellipse(0, 0, 22, 12).setStrokeStyle(2, 0x9ee6b1, 0.95);
    fxLayer.add(clickMarker);
  }
  clickMarker.setPosition(destination.x * TILE_SIZE, destination.y * TILE_SIZE + 9);
  clickMarker.setVisible(true);
}

function clearClickDestination({ keepHold = false }: { keepHold?: boolean } = {}): void {
  clickDestination = null;
  clickPath = [];
  pendingTreeCut = null;
  pendingAttackTarget = null;
  pendingLootTarget = null;
  pendingNpcTalk = null;
  pendingFishingNode = null;
  pendingCookingFire = null;
  pendingMiningNode = null;
  pendingHerbNode = null;
  dynamicPathTarget = null;
  if (!keepHold) {
    holdMoveActive = false;
    holdMoveTile = null;
  }
  if (clickMarker) clickMarker.setVisible(false);
}

function addTileDecorations(
  rows: string[],
  parent: Phaser.GameObjects.Container,
  fromX = 0,
  fromY = 0,
  toX = rows[0]?.length ?? 0,
  toY = rows.length
): void {
  const decorations: DecorationSprite[] = [];
  for (let y = fromY; y < toY; y += 1) {
    const row = rows[y];
    if (row === undefined) continue;
    for (let x = fromX; x < Math.min(toX, row.length); x += 1) {
      const tile = row[x] ?? "";
      if (tile === "r") decorations.push({ key: "spriteRock", x: x + 0.5, y: y + 0.78, w: 38, h: 28 });
      if (tile === "h") decorations.push({ key: "spriteGrave", x: x + 0.5, y: y + 0.95, w: 24, h: 34 });
      if (tile === "q") decorations.push({ key: "spriteFence", x: x + 0.5, y: y + 0.78, w: 46, h: 24 });
      if (tile === "o") decorations.push({ key: "spriteSwampBoulder", x: x + 0.5, y: y + 0.85, w: 44, h: 36 });
      if (tile === "L") decorations.push({ key: "spriteCliffLedge", x: x + 0.5, y: y + 0.95, w: 52, h: 44 });
      if (tile === "Z") decorations.push({ key: "spriteBadlandsLedge", x: x + 0.5, y: y + 0.95, w: 54, h: 50 });
      if (tile === "U") decorations.push({ key: "spriteObelisk", x: x + 0.5, y: y + 0.95, w: 40, h: 64 });
      if (tile === "H") decorations.push({ key: "spriteDesertLedge", x: x + 0.5, y: y + 0.95, w: 52, h: 50 });
      if (tile === "K") decorations.push({ key: "spriteJungleVault", x: x + 0.5, y: y + 1.0, w: 96, h: 80 });
      if (["N", "S", "T", "C", "M", "D", "G", "Y", "j", ">", "<"].includes(tile)) decorations.push({ key: "spritePortal", x: x + 0.5, y: y + 1.2, w: 34, h: 52 });
    }
  }
  decorations.sort((a, b) => a.y - b.y).forEach((item) => placeMapSprite(item, parent));
}

function addComposedMapObjects(
  floor: number,
  parent: Phaser.GameObjects.Container,
  fromX = 0,
  fromY = 0,
  toX = floorCols(floor),
  toY = floorRows(floor)
): void {
  // Composed objects are authored in native coords; stretch them to the floor's
  // expanded footprint (factor 1 for floors authored at the target size).
  const fx = contentScaleX(floor);
  const fy = contentScaleY(floor);
  const objects = MAP_OBJECTS[floor] ?? [];
  objects
    .filter((item) => item.key !== "spriteTree" && item.key !== "spritePine")
    .map((item) => ({ ...item, x: item.x * fx, y: item.y * fy }))
    .filter((item) => item.x >= fromX - 2 && item.x < toX + 2 && item.y >= fromY - 3 && item.y < toY + 1)
    .sort((a, b) => a.y - b.y)
    .forEach((item) => placeMapSprite(item, parent));
}

function placeMapSprite(item: DecorationSprite, parent: Phaser.GameObjects.Container): Phaser.GameObjects.Image {
  const sprite = scene.add.image(item.x * TILE_SIZE, item.y * TILE_SIZE, item.key).setOrigin(0.5, 1);
  sprite.setDisplaySize(item.w, item.h);
  parent.add(sprite);
  return sprite;
}

function consumeEvents(events: GameEvent[]): void {
  for (const event of events) {
    observedEvents.push(event);
    if (observedEvents.length > 160) observedEvents.splice(0, observedEvents.length - 160);
    if (event.type === "system") addSystemLine(String(event.text));
    if (event.type === "chat") addChat(String(event.text));
    if (event.type === "dialogue") openDialogue(event);
    if (event.type === "effect" && self()?.floor === event.floor) playCombatEffect(event);
    if (event.type === "ability_vfx" && self()?.floor === event.floor) playAbilityVfx(event);
    if (event.type === "projectile" && self()?.floor === event.floor) playProjectile(event);
    if ((event.type === "hit" || event.type === "float") && self()?.floor === event.floor) {
      const floater = scene.add.text((event.x ?? 0) * TILE_SIZE, (event.y ?? 0) * TILE_SIZE, String(event.text), textStyle(13, event.color ?? "#fff")).setOrigin(0.5) as Floater;
      floater.life = 1000;
      floaters.push(floater);
      fxLayer.add(floater);
    }
  }
}

function openDialogue(event: GameEvent): void {
  const lines: DialogueLine[] = Array.isArray(event.lines) ? event.lines : [];
  if (!lines.length) return;
  hideCenterPanels();
  activeDialogue = { lines, index: 0, opensShop: Boolean(event.opensShop), opensAlchemist: Boolean(event.opensAlchemist) };
  dom.menuBackdrop.classList.remove("hidden");
  dom.dialogue.classList.remove("hidden");
  renderDialogueLine();
}

function renderDialogueLine(): void {
  const line = activeDialogue?.lines?.[activeDialogue.index];
  if (!line || !activeDialogue) {
    closeDialogue();
    return;
  }
  dom.dialogueSpeaker.textContent = line.speaker ?? "";
  dom.dialogueLine.textContent = line.text ?? "";
  dom.dialogueNextButton.textContent = activeDialogue.index >= activeDialogue.lines.length - 1 ? "Done" : "Continue";
}

function advanceDialogue(): void {
  if (!activeDialogue) return;
  activeDialogue.index += 1;
  renderDialogueLine();
}

function closeDialogue(openFollowup = true): void {
  const opensShop = Boolean(activeDialogue?.opensShop);
  const opensAlchemist = Boolean(activeDialogue?.opensAlchemist);
  activeDialogue = null;
  dom.dialogue.classList.add("hidden");
  if (openFollowup && (opensShop || opensAlchemist)) {
    dom.menuBackdrop.classList.remove("hidden");
    (opensAlchemist ? dom.alchemist : dom.vendor).classList.remove("hidden");
    return;
  }
  if ([dom.skillsPanel, dom.inventoryPanel, dom.equipmentPanel, dom.abilitiesPanel, dom.vendor, dom.alchemist].every((panel) => panel.classList.contains("hidden"))) {
    dom.menuBackdrop.classList.add("hidden");
  }
}

function playCombatEffect(event: GameEvent): void {
  const targetX = (event.x ?? 0) * TILE_SIZE;
  const targetY = (event.y ?? 0) * TILE_SIZE - 10;
  const fromX = (event.fromX ?? event.x ?? 0) * TILE_SIZE;
  const fromY = (event.fromY ?? event.y ?? 0) * TILE_SIZE - 10;
  const angle = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);

  if (event.text === "fish") {
    const splash = scene.add.ellipse(targetX, targetY + 12, 38, 16, 0x8fd8ff, 0.48).setStrokeStyle(2, 0xbbeeff);
    fxLayer.add(splash);
    scene.tweens.add({ targets: splash, alpha: 0, scale: 1.7, duration: 520, onComplete: () => splash.destroy() });
    return;
  }

  if (event.text === "fire") {
    const spark = scene.add.circle(targetX, targetY, 12, 0xffb23d, 0.72);
    fxLayer.add(spark);
    scene.tweens.add({ targets: spark, alpha: 0, scale: 2.2, duration: 420, onComplete: () => spark.destroy() });
    return;
  }

  if (event.text === "bolt" || event.text === "flare" || event.text === "frost") {
    const family = event.text === "flare" ? "fireMissile" : "iceMissile";
    const missile = scene.add.sprite(fromX, fromY, effectFrameKey(family, 0)).setOrigin(0.5);
    missile.setDisplaySize(58, 28);
    missile.setRotation(angle);
    fxLayer.add(missile);
    scene.tweens.add({
      targets: missile,
      x: targetX,
      y: targetY,
      duration: 180,
      ease: "Quad.easeOut",
      onUpdate: () => {
        const frame = Math.min(5, Math.floor((scene.time.now / 45) % 6));
        missile.setTexture(effectFrameKey(family, frame));
      },
      onComplete: () => {
        missile.destroy();
        playBurst(family, targetX, targetY);
      }
    });
    return;
  }

  playSlash(targetX, targetY, angle);
}

function playProjectile(event: GameEvent): void {
  const targetX = (event.x ?? 0) * TILE_SIZE;
  const targetY = (event.y ?? 0) * TILE_SIZE - 10;
  const fromX = (event.fromX ?? event.x ?? 0) * TILE_SIZE;
  const fromY = (event.fromY ?? event.y ?? 0) * TILE_SIZE - 10;
  const angle = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);
  const fill = hexColorToNumber(event.color, event.text === "arcane" ? 0xc8a8ff : 0xf4e3b0);
  const stroke = event.text === "arcane" ? 0x5f3fa8 : 0x6b4a1f;
  const arrow = scene.add.rectangle(fromX, fromY, event.text === "arcane" ? 24 : 20, event.text === "arcane" ? 5 : 3, fill).setRotation(angle);
  arrow.setStrokeStyle(1, stroke);
  fxLayer.add(arrow);
  scene.tweens.add({
    targets: arrow,
    x: targetX,
    y: targetY,
    duration: 150,
    ease: "Quad.easeIn",
    onComplete: () => arrow.destroy()
  });
}

function playAbilityVfx(event: GameEvent): void {
  const x = (event.x ?? 0) * TILE_SIZE;
  const y = (event.y ?? 0) * TILE_SIZE - 10;
  const fromX = (event.fromX ?? event.x ?? 0) * TILE_SIZE;
  const fromY = (event.fromY ?? event.y ?? 0) * TILE_SIZE - 10;
  const color = hexColorToNumber(event.color, 0xc8a8ff);
  const scale = event.scale ?? 1;
  const duration = event.durationMs ?? 360;
  const kind = String(event.text);

  if (kind === "slash_arc") {
    playSlash(x, y, Phaser.Math.Angle.Between(fromX, fromY, x, y));
    return;
  }

  if (kind === "impact_ring") {
    const ring = scene.add.ellipse(x, y + 4, 34 * scale, 18 * scale, color, 0.18).setStrokeStyle(Math.max(2, 3 * scale), color, 0.95);
    fxLayer.add(ring);
    scene.tweens.add({ targets: ring, alpha: 0, scale: 1.8, duration, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    return;
  }

  if (kind === "ground_burst") {
    const burst = scene.add.circle(x, y + 10, 18 * scale, color, 0.32).setStrokeStyle(2, color, 0.85);
    fxLayer.add(burst);
    scene.tweens.add({ targets: burst, alpha: 0, scale: 2.3, duration, ease: "Cubic.easeOut", onComplete: () => burst.destroy() });
    return;
  }

  if (kind === "projectile_trail" || kind === "path") {
    const trail = scene.add.line(0, 0, fromX, fromY, x, y, color, 0.55).setLineWidth(4 * scale, 1 * scale);
    fxLayer.add(trail);
    scene.tweens.add({ targets: trail, alpha: 0, duration, ease: "Quad.easeOut", onComplete: () => trail.destroy() });
    return;
  }

  const pulse = scene.add.circle(x, y, 14 * scale, color, 0.28).setStrokeStyle(2, color, 0.9);
  fxLayer.add(pulse);
  scene.tweens.add({ targets: pulse, alpha: 0, scale: 2, duration, ease: "Quad.easeOut", onComplete: () => pulse.destroy() });
}

function playSlash(x: number, y: number, angle: number): void {
  const slash = scene.add.sprite(x, y, effectFrameKey("slash", 0)).setOrigin(0.5);
  slash.setDisplaySize(76, 44);
  slash.setRotation(angle);
  fxLayer.add(slash);
  let frame = 0;
  const timer = scene.time.addEvent({
    delay: 45,
    repeat: 5,
    callback: () => {
      frame += 1;
      if (frame >= 6) {
        slash.destroy();
        timer.remove();
        return;
      }
      slash.setTexture(effectFrameKey("slash", frame));
    }
  });
}

function hexColorToNumber(color: string | null | undefined, fallback: number): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(color ?? "");
  return match?.[1] ? parseInt(match[1], 16) : fallback;
}

function playBurst(family: string, x: number, y: number): void {
  const burst = scene.add.sprite(x, y, effectFrameKey(`${family}Burst`, 0)).setOrigin(0.5);
  burst.setDisplaySize(58, 58);
  fxLayer.add(burst);
  let frame = 0;
  const timer = scene.time.addEvent({
    delay: 55,
    repeat: 3,
    callback: () => {
      frame += 1;
      if (frame >= 4) {
        burst.destroy();
        timer.remove();
        return;
      }
      burst.setTexture(effectFrameKey(`${family}Burst`, frame));
    }
  });
}

function updateFloaters(): void {
  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const floater = floaters[i];
    if (!floater) continue;
    floater.y -= 0.45;
    floater.life -= scene.game.loop.delta;
    floater.setAlpha(Math.max(0, floater.life / 1000));
    if (floater.life <= 0) {
      floater.destroy();
      floaters.splice(i, 1);
    }
  }
}

function createActorFrames(scene: Phaser.Scene): void {
  const knightRows: Record<Direction, number> = { up: 74, right: 202, down: 328, left: 456 };
  const casterRows: Record<Direction, number> = { up: 692, right: 818, down: 948, left: 1078 };
  const knightXs = [330, 456, 582, 708];
  const casterXs = [334, 460, 586, 712];
  const goblinFrames: DirectionFrames = {
    up: paddedSpriteFrames([
      [305, 46, 100, 113],
      [496, 41, 100, 118],
      [687, 41, 99, 118],
      [876, 41, 101, 118]
    ]),
    right: paddedSpriteFrames([
      [305, 190, 95, 110],
      [502, 190, 90, 110],
      [694, 190, 89, 110],
      [878, 190, 94, 110]
    ]),
    down: paddedSpriteFrames([
      [303, 346, 99, 108],
      [492, 346, 101, 108],
      [685, 346, 99, 108],
      [873, 346, 101, 108]
    ]),
    left: paddedSpriteFrames([
      [307, 490, 89, 114],
      [499, 490, 89, 114],
      [689, 490, 86, 114],
      [877, 490, 89, 114]
    ])
  };
  const skeletonFrames: DirectionFrames = {
    up: paddedSpriteFrames([
      [298, 54, 96, 116],
      [471, 54, 93, 116],
      [647, 54, 95, 117],
      [826, 55, 94, 115]
    ]),
    right: paddedSpriteFrames([
      [296, 204, 83, 112],
      [484, 206, 68, 111],
      [662, 206, 70, 111],
      [832, 206, 82, 110]
    ]),
    down: paddedSpriteFrames([
      [296, 352, 92, 111],
      [468, 355, 92, 110],
      [648, 355, 93, 110],
      [828, 353, 90, 112]
    ]),
    left: paddedSpriteFrames([
      [306, 499, 80, 110],
      [479, 500, 66, 109],
      [661, 500, 63, 112],
      [839, 499, 77, 110]
    ])
  };

  createFrameSet(scene, "playerSheet", "knight", knightRows, knightXs, 78, 92);
  createFrameSet(scene, "playerSheet", "caster", casterRows, casterXs, 82, 96);
  createExplicitFrameSet(scene, "goblinSheet", "goblin", goblinFrames);
  createExplicitFrameSet(scene, "skeletonSheet", "skeleton", skeletonFrames);
  createExplicitFrameSet(scene, "ratSpiderSheet", "rat", {
    up: spriteFrames([700, 748, 796, 844], 126, 54, 46),
    right: spriteFrames([132, 260, 388, 516], 124, 112, 48),
    down: spriteFrames([612, 660, 612, 660], 126, 54, 46),
    left: spriteFrames([132, 260, 388, 516], 124, 112, 48)
  });
  createExplicitFrameSet(scene, "ratSpiderSheet", "spider", {
    up: spriteFrames([708, 760, 812, 864], 686, 58, 54),
    right: spriteFrames([128, 256, 384, 512], 678, 118, 58),
    down: spriteFrames([616, 668, 616, 668], 686, 58, 54),
    left: spriteFrames([128, 256, 384, 512], 678, 118, 58)
  });
  createExplicitFrameSet(scene, "goblinScoutSheet", "goblinScout", uniformDirectionFrames(281, 293, 4));
  createExplicitFrameSet(scene, "goblinShamanSheet", "goblinShaman", uniformDirectionFrames(313, 313, 4));
  createExplicitFrameSet(scene, "goblinRaiderSheet", "goblinRaider", uniformDirectionFrames(320, 320, 4));
  createExplicitFrameSet(scene, "greyWolfSheet", "greyWolf", uniformDirectionFrames(320, 320, 4));
  const wispRow = spriteFrames([0, 221, 442, 663], 0, 221, 443);
  createExplicitFrameSet(scene, "wispSheet", "wisp", {
    up: wispRow,
    right: wispRow,
    down: wispRow,
    left: wispRow
  });
  createWoodlandBespokeFrames(scene);
  // The remaining new-area monsters share one montage sheet (public/new-enemies.png):
  // a 4-frame walk row per family, the same frames used for all four facings.
  const newEnemyFamilies = [
    "canyon_scavenger", "dust_burrower", "dune_skitterer",
    "sun_wraith", "reef_prowler", "venomous_stalker", "totem_wraith"
  ];
  newEnemyFamilies.forEach((family, r) => {
    // These sit on rows 2..8 of the sheet (rows 0..1 were the now-bespoke swamp pair).
    const frames = spriteFrames([0, 64, 128, 192], (r + 2) * 56, 64, 56);
    createExplicitFrameSet(scene, "newEnemiesSheet", family, { up: frames, right: frames, down: frames, left: frames });
  });

  createSwampEnemyFrames(scene);
}

function createWoodlandBespokeFrames(scene: Phaser.Scene): void {
  const directionalFrames = (rowOffset: number): DirectionFrames => {
    const xs = Array.from({ length: 8 }, (_, index) => index * 96);
    return {
      up: spriteFrames(xs, (rowOffset + 0) * 96, 96, 96),
      right: spriteFrames(xs, (rowOffset + 1) * 96, 96, 96),
      down: spriteFrames(xs, (rowOffset + 2) * 96, 96, 96),
      left: spriteFrames(xs, (rowOffset + 3) * 96, 96, 96)
    };
  };
  for (const family of WOODLAND_BESPOKE_FAMILIES) {
    const sourceKey = woodlandBespokeSheetKey(family);
    createExplicitFrameSet(scene, sourceKey, family, directionalFrames(0));
    createExplicitFrameSet(scene, sourceKey, `${family}Atk`, directionalFrames(4));
  }
}

function woodlandBespokeSheetKey(family: string): string {
  return `${family}Sheet`;
}

// The two swamp enemies get hand-authored 4-direction walk + attack animations
// from public/skitterer-spitter.png (magenta-keyed at runtime). The Skitterer
// walks in 4 frames and attacks in 3; the Mire Spitter walks in 3 and spits in 4.
function createSwampEnemyFrames(scene: Phaser.Scene): void {
  // Movement block (top of sheet): UP/RIGHT/DOWN/LEFT row y-bands.
  const moveY: Record<Direction, number> = { up: 58, right: 163, down: 274, left: 372 };
  const moveH: Record<Direction, number> = { up: 102, right: 100, down: 96, left: 100 };
  const skitterMoveXs = [257, 357, 457, 557];
  const spitterMoveXs = [683, 789, 895];
  const skitterMove: DirectionFrames = {} as DirectionFrames;
  const spitterMove: DirectionFrames = {} as DirectionFrames;
  for (const dir of DIRECTIONS) {
    skitterMove[dir] = spriteFrames(skitterMoveXs, moveY[dir], 88, moveH[dir]);
    spitterMove[dir] = spriteFrames(spitterMoveXs, moveY[dir], 100, moveH[dir]);
  }
  createExplicitFrameSet(scene, "swampEnemySheet", "skitterer", skitterMove);
  createExplicitFrameSet(scene, "swampEnemySheet", "mire_spitter", spitterMove);

  // Attack block (bottom of sheet): UP/RIGHT/DOWN/LEFT row y-bands.
  const atkY: Record<Direction, number> = { up: 559, right: 673, down: 772, left: 884 };
  const atkH: Record<Direction, number> = { up: 100, right: 100, down: 98, left: 104 };
  const skitterAtkXs = [252, 353, 454];
  const skitterAtk: DirectionFrames = {} as DirectionFrames;
  const spitterAtk: DirectionFrames = {} as DirectionFrames;
  for (const dir of DIRECTIONS) {
    skitterAtk[dir] = spriteFrames(skitterAtkXs, atkY[dir], 96, atkH[dir]);
    // The spit frames pack tighter and the final lash-out frame is wider.
    spitterAtk[dir] = [
      { x: 570, y: atkY[dir], w: 94, h: atkH[dir] },
      { x: 672, y: atkY[dir], w: 92, h: atkH[dir] },
      { x: 773, y: atkY[dir], w: 102, h: atkH[dir] },
      { x: 876, y: atkY[dir], w: 120, h: atkH[dir] }
    ];
  }
  createExplicitFrameSet(scene, "swampEnemySheet", "skittererAtk", skitterAtk);
  createExplicitFrameSet(scene, "swampEnemySheet", "mireSpitterAtk", spitterAtk);
}

function uniformDirectionFrames(cellW: number, cellH: number, frames: number): DirectionFrames {
  const xs = Array.from({ length: frames }, (_, i) => i * cellW);
  return {
    up: spriteFrames(xs, 0, cellW, cellH),
    right: spriteFrames(xs, cellH, cellW, cellH),
    down: spriteFrames(xs, cellH * 2, cellW, cellH),
    left: spriteFrames(xs, cellH * 3, cellW, cellH)
  };
}

function createEffectFrames(scene: Phaser.Scene): void {
  const slashXs = [260, 360, 480, 620, 780, 960];
  slashXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("slash", index), x, 64, 160, 70));

  const missileXs = [184, 276, 386, 506, 626, 760];
  missileXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("fireMissile", index), x, 626, 116, 62));
  missileXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("iceMissile", index), x, 706, 116, 62));

  const burstXs = [1038, 1150, 1246, 1338];
  burstXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("fireMissileBurst", index), x, 618, 96, 82));
  burstXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("iceMissileBurst", index), x, 698, 96, 82));
}

function effectFrameKey(family: string, frame: number): string {
  return `${family}-${frame}`;
}

function createFrameSet(scene: Phaser.Scene, sourceKey: string, family: string, rows: Record<Direction, number>, xs: number[], width: number, height: number): void {
  for (const dir of DIRECTIONS) {
    createAlignedTransparentFrames(
      scene,
      sourceKey,
      xs.map((x, index) => ({ key: actorFrameKey(family, dir, index), x, y: rows[dir], w: width, h: height }))
    );
  }
}

function createExplicitFrameSet(scene: Phaser.Scene, sourceKey: string, family: string, framesByDir: DirectionFrames): void {
  for (const dir of DIRECTIONS) {
    createAlignedTransparentFrames(
      scene,
      sourceKey,
      framesByDir[dir].map((frame, index) => ({ key: actorFrameKey(family, dir, index), ...frame }))
    );
  }
}

function spriteFrames(xs: number[], y: number, w: number, h: number): SpriteFrameBox[] {
  return xs.map((x) => ({ x, y, w, h }));
}

function paddedSpriteFrames(boxes: Array<[number, number, number, number]>, padding = 8): SpriteFrameBox[] {
  return boxes.map(([x, y, w, h]) => ({
    x: Math.max(0, x - padding),
    y: Math.max(0, y - padding),
    w: w + padding * 2,
    h: h + padding * 2
  }));
}

function actorFrameKey(family: string, dir: Direction, frame: number): string {
  const safeDir = DIRECTIONS.includes(dir) ? dir : "down";
  return `${family}-${safeDir}-${frame}`;
}

function actorTextureKey(family: string, dir: Direction, frame: number): string {
  let textureDir: Direction = DIRECTIONS.includes(dir) ? dir : "down";
  if (mirrorRightFromLeft(family) && textureDir === "right") textureDir = "left";
  if (mirrorLeftFromRight(family) && textureDir === "left") textureDir = "right";
  return actorFrameKey(family, textureDir, frame);
}

function actorFlipX(family: string, dir: Direction): boolean {
  return (mirrorRightFromLeft(family) && dir === "right") || (mirrorLeftFromRight(family) && dir === "left");
}

function actorFrameAnchorDrift(): Array<{ family: string; dir: Direction; driftX: number; driftY: number }> {
  if (!scene) return [];
  const families = [
    "knight",
    "caster",
    "goblin",
    "skeleton",
    "rat",
    "spider",
    "goblinScout",
    "goblinShaman",
    "goblinRaider",
    "greyWolf",
    "wisp",
    ...WOODLAND_BESPOKE_FAMILIES
  ];
  return families.flatMap((family) =>
    DIRECTIONS.map((dir) => {
      const anchors = [0, 1, 2, 3].map((frame) => {
        const image = scene.textures.get(actorFrameKey(family, dir, frame)).getSourceImage();
        const bbox = opaqueBoundingBox(image as HTMLCanvasElement);
        return bbox ? { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h } : { x: 0, y: 0 };
      });
      return {
        family,
        dir,
        driftX: Math.max(...anchors.map((anchor) => anchor.x)) - Math.min(...anchors.map((anchor) => anchor.x)),
        driftY: Math.max(...anchors.map((anchor) => anchor.y)) - Math.min(...anchors.map((anchor) => anchor.y))
      };
    })
  );
}

function mirrorRightFromLeft(family: string): boolean {
  return family === "knight" || family === "caster" || family === "goblin" || family === "skeleton";
}

function mirrorLeftFromRight(family: string): boolean {
  return family === "rat" || family === "spider";
}

interface AlignedFrameSpec {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function createAlignedTransparentFrames(scene: Phaser.Scene, sourceKey: string, frames: AlignedFrameSpec[]): void {
  const crops = frames.map((frame) => {
    const canvas = createTransparentCropCanvas(scene, sourceKey, frame.x, frame.y, frame.w, frame.h);
    const bbox = opaqueBoundingBox(canvas) ?? { x: 0, y: 0, w: frame.w, h: frame.h };
    const anchor = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h };
    return { ...frame, canvas, bbox, anchor };
  });
  const maxLeft = Math.max(...crops.map((crop) => crop.anchor.x - crop.bbox.x));
  const maxRight = Math.max(...crops.map((crop) => crop.bbox.x + crop.bbox.w - crop.anchor.x));
  const maxUp = Math.max(...crops.map((crop) => crop.anchor.y - crop.bbox.y));
  const maxDown = Math.max(...crops.map((crop) => crop.bbox.y + crop.bbox.h - crop.anchor.y));
  const sourceW = Math.max(...crops.map((crop) => crop.w));
  const sourceH = Math.max(...crops.map((crop) => crop.h));
  const canvasW = Math.max(sourceW, Math.ceil(maxLeft + maxRight));
  const canvasH = Math.max(sourceH, Math.ceil(maxUp + maxDown));
  const targetAnchor = { x: Math.round(canvasW / 2), y: canvasH };

  for (const crop of crops) {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(crop.canvas, Math.round(targetAnchor.x - crop.anchor.x), Math.round(targetAnchor.y - crop.anchor.y));
    addNearestCanvasTexture(scene, crop.key, canvas);
  }
}

function createTransparentCropCanvas(scene: Phaser.Scene, sourceKey: string, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  chromaKeyMagenta(ctx, sw, sh);
  return canvas;
}

function opaqueBoundingBox(canvas: HTMLCanvasElement): BoundingBox | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (image.data[(y * canvas.width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function addNearestCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  scene.textures.addCanvas(key, canvas);
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function makeTileTexture(scene: Phaser.Scene, sourceKey: string, newKey: string, sx: number, sy: number, sw: number, sh: number, insetOverride?: number): void {
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
  const sourceCanvas = document.createElement("canvas");
  const inset = insetOverride ?? Math.min(10, Math.floor(sw / 5), Math.floor(sh / 5));
  const cropW = sw - inset * 2;
  const cropH = sh - inset * 2;
  sourceCanvas.width = cropW;
  sourceCanvas.height = cropH;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(source, sx + inset, sy + inset, cropW, cropH, 0, 0, cropW, cropH);
  chromaKeyMagenta(sourceCtx, cropW, cropH);

  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, cropW, cropH, 0, 0, TILE_SIZE, TILE_SIZE);
  chromaKeyMagenta(ctx, TILE_SIZE, TILE_SIZE);
  fillTransparentPixels(ctx, TILE_SIZE, TILE_SIZE);
  scene.textures.addCanvas(newKey, canvas);
  scene.textures.get(newKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function makeSpriteTexture(scene: Phaser.Scene, sourceKey: string, newKey: string, sx: number, sy: number, sw: number, sh: number): void {
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  chromaKeyMagenta(ctx, sw, sh);
  scene.textures.addCanvas(newKey, canvas);
  scene.textures.get(newKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function chromaKeyMagenta(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0;
    const g = image.data[i + 1] ?? 0;
    const b = image.data[i + 2] ?? 0;
    if (isMagentaKey(r, g, b)) image.data[i + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);
}

function fillTransparentPixels(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const fill = sampleOpaqueColor(image, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 0) continue;
    image.data[i] = fill.r;
    image.data[i + 1] = fill.g;
    image.data[i + 2] = fill.b;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function sampleOpaqueColor(image: ImageData, width: number, height: number): RgbColor {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const startX = Math.floor(width * 0.25);
  const endX = Math.ceil(width * 0.75);
  const startY = Math.floor(height * 0.25);
  const endY = Math.ceil(height * 0.75);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const i = (y * width + x) * 4;
      if (image.data[i + 3] === 0) continue;
      r += image.data[i] ?? 0;
      g += image.data[i + 1] ?? 0;
      b += image.data[i + 2] ?? 0;
      count += 1;
    }
  }
  if (!count) return { r: 40, g: 90, b: 40 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

function isMagentaKey(r: number, g: number, b: number): boolean {
  if (r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25) return true;
  // Darker keyed magenta whose blue dips below the main threshold (e.g. the
  // badlands tent's 143,3,82 -> 91,2,52 gradient): green is essentially zero,
  // red dominates blue, and blue stays well above zero. That near-black-green,
  // red-leaning-purple combination is a chroma key, never real art (warm colours
  // keep green >= ~15; blue-purples have blue above red).
  return g < 10 && r > 70 && b > 42 && r > b - 5 && r > g * 7 && b > g * 7;
}

function addChat(line: string): void {
  chatLines.push(line);
  while (chatLines.length > 9) chatLines.shift();
  dom.chatLog.innerHTML = chatLines.map((item) => `<div>${escapeHtml(item)}</div>`).join("");
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

const systemLines: string[] = [];
// Engine/zone notifications go to the bottom-left system feed, kept apart from
// party chat so debug strings never overlap the world.
function addSystemLine(line: string): void {
  systemLines.push(line);
  while (systemLines.length > 9) systemLines.shift();
  dom.systemFeed.innerHTML = systemLines.map((item) => `<div>${escapeHtml(item)}</div>`).join("");
  dom.systemFeed.scrollTop = dom.systemFeed.scrollHeight;
}

function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function self(): PlayerView | undefined {
  return selfView ?? resolveSelfView(latestState);
}

function setBar(bar: HTMLElement, label: HTMLElement, value: number, max: number, prefix: string): void {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  bar.style.width = `${pct * 100}%`;
  label.textContent = `${prefix} ${Math.round(value)}/${Math.round(max)}`;
}

// --- Minimap + compass ----------------------------------------------------
// Both live in the bottom-right HUD panel. The map data (makeFloorTiles) and the
// player snapshot are already client-side, so this is pure presentation: no new
// server traffic. The per-floor tile layer is rasterized once to a 1px-per-tile
// offscreen canvas and cached; each frame we upscale that and stamp live blips.
const minimapBaseCache = new Map<number, HTMLCanvasElement>();

function minimapTileColor(tile: string): string {
  const colors: Record<string, string> = {
    "#": "#262a26", // rock wall
    ".": "#3f6b3a", // grass
    F: "#2f5230", // forest floor
    f: "#234021", // tree/brush (blocked)
    r: "#4b4a43", // rock (blocked)
    s: "#6e6e62", // stone
    p: "#8a7d5a", // town plaza
    t: "#6a5236", // dirt path
    d: "#5a4530", // dirt
    g: "#46433c", // grave dirt
    b: "#565249", // grave path
    q: "#35332e", // grave fence (blocked)
    c: "#5b574e", // grave path
    h: "#454139", // grave dirt
    O: "#7a6a52", // building
    "~": "#2f5d7a", // water
    ">": "#5a4530",
    "<": "#5a4530",
    N: "#d6ad4e", // portal/stairs (landmark)
    S: "#d6ad4e",
    T: "#d6ad4e",
    C: "#d6ad4e",
    n: "#8a7d5a",
    m: "#4a5b3a", // marsh ground
    k: "#5a4d33", // swamp dirt
    W: "#2b3b38", // swamp water (blocked)
    B: "#6e5836", // wooden bridge
    o: "#5d6452", // boulder (blocked)
    M: "#d6ad4e", // marsh portal (landmark)
    L: "#c8a86a", // cliff ledge (landmark)
    R: "#b5703a", // badlands ground
    J: "#9a5e30", // badlands rock
    w: "#5a3318", // massif (impassable dark rock)
    X: "#5c3320", // cliff wall (blocked)
    P: "#140f0d", // pit chasm (blocked, sight-open)
    A: "#c98a4a", // ramp
    D: "#d6ad4e", // badlands portal (landmark)
    Z: "#e0c070", // badlands ledge (landmark)
    a: "#d8b367", // sand
    Q: "#7a5a2e", // quicksand (blocked, sight-open)
    V: "#2f7d8a", // oasis water (blocked)
    U: "#9a8a6a", // ruin (blocked, sight cover)
    G: "#d6ad4e", // desert portal (landmark)
    H: "#e0c070", // oasis passage (landmark)
    e: "#e6d7a8", // beach sand
    l: "#d7c28f", // shell-strewn beach flat
    ",": "#cbb987", // wet/shelly tide rim
    ";": "#ead49a", // rippled beach sand
    "3": "#d5be82", // pebbly dry beach
    "4": "#8f8f62", // mossy beach stone
    "5": "#9c6b3e", // wooden planks
    z: "#cda76a", // beach path
    "2": "#b98b52", // beach stairs/ramp
    x: "#8d6036", // beach cliff face (blocked)
    "0": "#8d6036", // beach cliff left cap (blocked)
    "1": "#8d6036", // beach cliff right cap (blocked)
    u: "#9b8d68", // beach rocks (blocked, sight cover)
    v: "#68b7bd", // foamy shore water (blocked, sight-open)
    "6": "#68b7bd", // north-facing foamy shore water
    "7": "#68b7bd", // east-facing foamy shore water
    "8": "#68b7bd", // south-facing foamy shore water
    "9": "#68b7bd", // west-facing foamy shore water
    "{": "#72c4c4", // foamy shore corner
    "}": "#72c4c4", // foamy shore corner
    "(": "#72c4c4", // foamy shore corner
    ")": "#72c4c4", // foamy shore corner
    "=": "#4aaab4", // shallow lagoon water
    I: "#2f9bb0", // ocean (blocked, sight-open)
    Y: "#d6ad4e", // beach portal (landmark)
    j: "#d6ad4e", // beach<->jungle portal (landmark)
    y: "#3c6b35", // jungle floor
    E: "#26401f", // jungle wall (blocked)
    i: "#274d44", // jungle river (blocked)
    K: "#caa84e" // jungle vault (landmark)
  };
  return colors[tile] ?? "#3f6b3a";
}

function minimapBase(floor: number): HTMLCanvasElement {
  const cached = minimapBaseCache.get(floor);
  if (cached) return cached;
  const cols = floorCols(floor);
  const rowCount = floorRows(floor);
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rowCount;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const rows = makeFloorTiles(floor);
    for (let y = 0; y < rowCount; y += 1) {
      const row = rows[y] ?? "";
      for (let x = 0; x < cols; x += 1) {
        ctx.fillStyle = minimapTileColor(row[x] ?? "#");
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  minimapBaseCache.set(floor, canvas);
  return canvas;
}

function minimapZoneLabel(floor: number): string {
  for (const zone of Object.values(ZONES)) {
    if (zone.floor === floor) return zone.label;
  }
  return `Floor ${floor}`;
}

function drawMinimap(me: PlayerView): void {
  const ctx = dom.minimapCanvas.getContext("2d");
  if (!ctx) return;
  const w = dom.minimapCanvas.width;
  const h = dom.minimapCanvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(minimapBase(me.floor), 0, 0, w, h);

  // Tiles-to-pixels scale, per floor (bigger floors pack into the same canvas).
  const scaleX = w / floorCols(me.floor);
  const scaleY = h / floorRows(me.floor);

  // Camera viewport rectangle, so the map shows what's currently on screen.
  const camera = scene?.cameras?.main;
  if (camera) {
    const view = camera.worldView;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      (view.x / TILE_SIZE) * scaleX,
      (view.y / TILE_SIZE) * scaleY,
      (view.width / TILE_SIZE) * scaleX,
      (view.height / TILE_SIZE) * scaleY
    );
  }

  const dot = (x: number, y: number, radius: number, fill: string): void => {
    ctx.beginPath();
    ctx.arc(x * scaleX, y * scaleY, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const state = latestState;
  if (state) {
    for (const npc of state.npcs) {
      if (npc.floor === me.floor) dot(npc.x, npc.y, 2, "#f2c14e");
    }
    for (const monster of state.monsters) {
      if (monster.floor === me.floor) dot(monster.x, monster.y, 2, "#e15b5b");
    }
    for (const player of state.players) {
      if (player.floor === me.floor && player.id !== me.id) dot(player.x, player.y, 2.4, "#5cc8e0");
    }
  }

  // Self marker: white dot with a dark outline plus a tick in the facing dir.
  const sx = me.x * scaleX;
  const sy = me.y * scaleY;
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#101211";
  ctx.stroke();
  const facing = directionVector(me.dir);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + facing.x * 6, sy + facing.y * 6);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  dom.minimapZone.textContent = `${minimapZoneLabel(me.floor)} · F${me.floor}`;
}

// --- The Inked Survey: fog of war + the [M] regional map ------------------
// Owning `broken_reach_map` grants the survey perk: walking inks the parchment.
// Revealed tiles are tracked client-side per character + floor in localStorage,
// so a fresh character starts with a blank sheet and charts it by exploring.
const FACTION_LANDMARKS: Record<string, string> = {
  "iron-census-officer": "Iron Census Front",
  "syndicate-contact": "Syndicate Drop",
  "faith-monk": "Sunken Faith Shrine",
  "ranger-scout": "Ranger Camp",
  "cartographer-adept": "Cartographers' Post"
};
const FOG_RADIUS = 2;
let fogName = "";
let fogFloor = -1;
let fogSet = new Set<number>();
let fogDirty = false;
let lastFogSave = 0;
let showFactionMarkers = true;
let mapView: "region" | "zone" = "region";
let mapZoneFloor = 0;

// The Broken Reach laid out as it sits in the travel graph: a cross centred on
// Waystone. col/row are abstract region cells; floor ties a node to its map.
interface RegionNode {
  floor: number;
  col: number;
  row: number;
  label: string;
  short: string;
  color: string;
  kind: "town" | "forest" | "marsh" | "badlands" | "grave" | "crypt" | "desert" | "beach" | "jungle";
}
const REGION_NODES: RegionNode[] = [
  { floor: 4, col: 2, row: 0, label: "Northwatch", short: "Northwatch", color: "#9aa7b6", kind: "town" },
  { floor: 3, col: 2, row: 1, label: "Northwood", short: "Northwood", color: "#3c6b35", kind: "forest" },
  { floor: 5, col: 0, row: 1, label: "The Sunken Marsh", short: "Marsh", color: "#4a5b3a", kind: "marsh" },
  { floor: 6, col: 4, row: 1, label: "The Searing Badlands", short: "Badlands", color: "#b5703a", kind: "badlands" },
  { floor: 0, col: 2, row: 2, label: "Waystone", short: "Waystone", color: "#c2a878", kind: "town" },
  { floor: 1, col: 2, row: 3, label: "Southgate Cemetery", short: "Cemetery", color: "#6f6f5c", kind: "grave" },
  { floor: 2, col: 3, row: 3, label: "Ashen Crypt", short: "Crypt", color: "#5a4f63", kind: "crypt" },
  { floor: 7, col: 2, row: 4, label: "The Sunken Desert", short: "Desert", color: "#d8b367", kind: "desert" },
  { floor: 8, col: 2, row: 5, label: "The Sunken Beach", short: "Beach", color: "#e6d7a8", kind: "beach" },
  { floor: 9, col: 4, row: 5, label: "The Untamed Jungle", short: "Jungle", color: "#2f6b35", kind: "jungle" }
];
// [from, to, oneWay]: a route ink only once both ends are charted; one-way
// drops draw dashed.
const REGION_EDGES: Array<[number, number, boolean]> = [
  [0, 3, false],
  [3, 4, false],
  [3, 5, false],
  [3, 6, false],
  [5, 0, true],
  [6, 4, true],
  [0, 1, false],
  [1, 2, false],
  [1, 7, false],
  [7, 0, true],
  [7, 8, false],
  [8, 9, false]
];
const REGION_W = 540;
const REGION_H = 600;

function regionNodeCenter(node: RegionNode): { x: number; y: number } {
  return { x: 70 + node.col * 100, y: 55 + node.row * 98 };
}

function fogStorageKey(name: string, floor: number): string {
  return `tib.fog.${name}.${floor}`;
}

function loadFog(name: string, floor: number): void {
  fogName = name;
  fogFloor = floor;
  fogSet = new Set<number>();
  try {
    const raw = localStorage.getItem(fogStorageKey(name, floor));
    if (raw) for (const idx of JSON.parse(raw) as number[]) fogSet.add(idx);
  } catch {
    // Corrupt/disabled storage is non-fatal — the sheet just starts blank.
  }
  fogDirty = false;
}

function saveFog(): void {
  if (!fogDirty || !fogName) return;
  try {
    localStorage.setItem(fogStorageKey(fogName, fogFloor), JSON.stringify([...fogSet]));
  } catch {
    // Quota or disabled storage — fog reveal still works for this session.
  }
  fogDirty = false;
}

function ownsSurveyMap(me: PlayerView): boolean {
  return inventoryQty(me.inventory, "broken_reach_map") > 0;
}

function updateFog(me: PlayerView, time: number): void {
  if (!ownsSurveyMap(me)) return;
  if (fogName !== me.name || fogFloor !== me.floor) {
    saveFog();
    loadFog(me.name, me.floor);
  }
  const cols = floorCols(me.floor);
  const rowCount = floorRows(me.floor);
  const cx = Math.floor(me.x);
  const cy = Math.floor(me.y);
  for (let dy = -FOG_RADIUS; dy <= FOG_RADIUS; dy += 1) {
    for (let dx = -FOG_RADIUS; dx <= FOG_RADIUS; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rowCount) continue;
      const idx = y * cols + x;
      if (!fogSet.has(idx)) {
        fogSet.add(idx);
        fogDirty = true;
      }
    }
  }
  if (fogDirty && time - lastFogSave > 1500) {
    saveFog();
    lastFogSave = time;
  }
}

// Revealed tiles for any floor: the live in-memory set for the floor you're on,
// otherwise the persisted set so the survey remembers floors between visits.
function revealedFor(name: string, floor: number): Set<number> {
  if (fogName === name && fogFloor === floor) return fogSet;
  const out = new Set<number>();
  try {
    const raw = localStorage.getItem(fogStorageKey(name, floor));
    if (raw) for (const idx of JSON.parse(raw) as number[]) out.add(idx);
  } catch {
    // Non-fatal: an unreadable floor just reads as uncharted.
  }
  return out;
}

// A floor counts as "visited" the moment the survey has inked any of it.
function isCharted(name: string, floor: number): boolean {
  if (fogName === name && fogFloor === floor) return fogSet.size > 0;
  try {
    const raw = localStorage.getItem(fogStorageKey(name, floor));
    return Boolean(raw) && raw !== "[]";
  } catch {
    return false;
  }
}

function toggleMapScreen(): void {
  if (!dom.mapScreen.classList.contains("hidden")) {
    hideCenterPanels();
    return;
  }
  const me = self();
  if (!me) return;
  if (!ownsSurveyMap(me)) {
    addSystemLine("You have no survey to read. Merchant Nicolas sells the Inked Survey of The Broken Reach.");
    return;
  }
  mapView = "region";
  showCenterPanel(dom.mapScreen);
  renderMapScreen(me);
}

function canvasPoint(event: MouseEvent): { x: number; y: number } {
  const rect = dom.mapCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * dom.mapCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * dom.mapCanvas.height
  };
}

function handleMapClick(event: MouseEvent): void {
  const me = self();
  if (!me) return;
  if (mapView === "zone") {
    // In a zone, clicking toggles its faction markers.
    showFactionMarkers = !showFactionMarkers;
    renderMapScreen(me);
    return;
  }
  // In the region view, clicking a charted biome zooms into its detail map.
  const point = canvasPoint(event);
  for (const node of REGION_NODES) {
    if (!isCharted(me.name, node.floor)) continue;
    const center = regionNodeCenter(node);
    if (Math.hypot(point.x - center.x, point.y - center.y) <= 42) {
      mapView = "zone";
      mapZoneFloor = node.floor;
      renderMapScreen(me);
      return;
    }
  }
}

function parchmentTint(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return hex;
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const blend = (c: number, paper: number): number => Math.round(c * 0.68 + paper * 0.32);
  return `rgb(${blend(r, 205)}, ${blend(g, 180)}, ${blend(b, 135)})`;
}

function markLandmark(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 5, y + 4);
  ctx.lineTo(x - 5, y + 4);
  ctx.closePath();
  ctx.fillStyle = "#7d2b1f";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#2a2014";
  ctx.stroke();
  ctx.font = "10px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(245, 235, 210, 0.9)";
  ctx.fillText(label, x + 1, y - 10);
  ctx.fillStyle = "#3a2410";
  ctx.fillText(label, x, y - 11);
}

function renderMapScreen(me: PlayerView): void {
  dom.mapBackButton.classList.toggle("hidden", mapView !== "zone");
  if (mapView === "zone") renderZoneMap(me, mapZoneFloor);
  else renderRegionMap(me);
}

// Aged-parchment backing shared by both views.
function paintParchment(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#cdb487";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(70, 50, 28, 0.6)";
  ctx.strokeRect(2, 2, w - 4, h - 4);
}

function renderZoneMap(me: PlayerView, floor: number): void {
  const canvas = dom.mapCanvas;
  if (canvas.width !== 520 || canvas.height !== 340) {
    canvas.width = 520;
    canvas.height = 340;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const cols = floorCols(floor);
  const rowCount = floorRows(floor);
  const sx = cw / cols;
  const sy = ch / rowCount;
  paintParchment(ctx, cw, ch);

  const revealed = revealedFor(me.name, floor);
  const rows = makeFloorTiles(floor);
  let revealedCount = 0;
  for (let y = 0; y < rowCount; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < cols; x += 1) {
      if (!revealed.has(y * cols + x)) continue;
      revealedCount += 1;
      ctx.fillStyle = parchmentTint(minimapTileColor(row[x] ?? "#"));
      ctx.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(sx), Math.ceil(sy));
    }
  }

  if (showFactionMarkers) {
    for (const npc of NPCS) {
      if (npc.floor !== floor) continue;
      const label = FACTION_LANDMARKS[npc.id];
      if (!label) continue;
      if (!revealed.has(Math.floor(npc.y) * cols + Math.floor(npc.x))) continue;
      markLandmark(ctx, npc.x * sx, npc.y * sy, label);
    }
  }

  // Player dot only appears on the floor you actually stand on.
  if (floor === me.floor && revealedCount > 0) {
    const px = me.x * sx;
    const py = me.y * sy;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#2a2014";
    ctx.stroke();
  }

  dom.mapTitle.textContent = minimapZoneLabel(floor);
  const pct = Math.round((revealedCount / (cols * rowCount)) * 100);
  dom.mapHint.textContent =
    revealedCount === 0
      ? "Uncharted. Walk the land to ink this sheet."
      : `${pct}% charted · click to ${showFactionMarkers ? "hide" : "show"} faction markers · ‹ Region to zoom out`;
}

function renderRegionMap(me: PlayerView): void {
  const canvas = dom.mapCanvas;
  if (canvas.width !== REGION_W || canvas.height !== REGION_H) {
    canvas.width = REGION_W;
    canvas.height = REGION_H;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintParchment(ctx, REGION_W, REGION_H);

  ctx.font = "20px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#3a2410";
  ctx.fillText("The Broken Reach", REGION_W / 2, 32);

  // Known routes: only ink a road once both ends are charted.
  for (const [from, to, oneWay] of REGION_EDGES) {
    const a = REGION_NODES.find((n) => n.floor === from);
    const b = REGION_NODES.find((n) => n.floor === to);
    if (!a || !b) continue;
    if (!isCharted(me.name, from) || !isCharted(me.name, to)) continue;
    const pa = regionNodeCenter(a);
    const pb = regionNodeCenter(b);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = "rgba(78, 54, 30, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash(oneWay ? [5, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  let charted = 0;
  for (const node of REGION_NODES) {
    const center = regionNodeCenter(node);
    const visited = isCharted(me.name, node.floor);
    if (visited) charted += 1;
    drawRegionNode(ctx, node, center, visited, node.floor === me.floor);
  }

  dom.mapTitle.textContent = "The Broken Reach";
  dom.mapHint.textContent =
    charted <= 1
      ? "Travel the Reach to chart its lands. Click a charted region to zoom in."
      : `${charted} of ${REGION_NODES.length} regions charted · click a region to zoom in`;
}

function drawRegionNode(
  ctx: CanvasRenderingContext2D,
  node: RegionNode,
  center: { x: number; y: number },
  visited: boolean,
  here: boolean
): void {
  const rx = node.kind === "crypt" ? 26 : 38;
  const ry = node.kind === "crypt" ? 20 : 30;
  if (!visited) {
    // Uncharted: a torn, blank patch of parchment — no name, no detail.
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(120, 96, 60, 0.10)";
    ctx.fill();
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(70, 50, 28, 0.35)";
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "16px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(70, 50, 28, 0.4)";
    ctx.fillText("?", center.x, center.y + 5);
    return;
  }

  // Charted: an inked, illustrated region in its biome colour.
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = parchmentTint(node.color);
  ctx.fill();
  ctx.lineWidth = here ? 2.5 : 1.5;
  ctx.strokeStyle = here ? "#f2e2b6" : "#3a2410";
  ctx.stroke();
  if (here) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#3a2410";
    ctx.stroke();
  }

  drawBiomeMotif(ctx, node.kind, center.x, center.y - 2);

  // "You are here" beacon.
  if (here) {
    ctx.beginPath();
    ctx.arc(center.x, center.y - ry - 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#2a2014";
    ctx.stroke();
  }

  ctx.font = "12px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(247, 238, 214, 0.85)";
  ctx.fillText(node.short, center.x + 1, center.y + ry + 14);
  ctx.fillStyle = "#2a1c0e";
  ctx.fillText(node.short, center.x, center.y + ry + 13);
}

// A few ink strokes per biome — enough to read at a glance, drawn not loaded.
function drawBiomeMotif(ctx: CanvasRenderingContext2D, kind: RegionNode["kind"], x: number, y: number): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(40, 28, 14, 0.75)";
  ctx.fillStyle = "rgba(40, 28, 14, 0.7)";
  const tree = (tx: number, ty: number): void => {
    ctx.beginPath();
    ctx.moveTo(tx, ty - 7);
    ctx.lineTo(tx - 5, ty + 4);
    ctx.lineTo(tx + 5, ty + 4);
    ctx.closePath();
    ctx.fill();
  };
  const wave = (wy: number): void => {
    ctx.beginPath();
    for (let i = -10; i <= 10; i += 2) {
      const yy = wy + Math.sin(i / 2) * 2;
      if (i === -10) ctx.moveTo(x + i, yy);
      else ctx.lineTo(x + i, yy);
    }
    ctx.stroke();
  };
  if (kind === "town") {
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 5);
    ctx.lineTo(x - 7, y - 2);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 7, y - 2);
    ctx.lineTo(x + 7, y + 5);
    ctx.closePath();
    ctx.stroke();
  } else if (kind === "forest" || kind === "jungle") {
    tree(x - 7, y);
    tree(x + 7, y);
    tree(x, y - 4);
  } else if (kind === "marsh") {
    wave(y - 3);
    wave(y + 3);
  } else if (kind === "badlands") {
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 6);
    ctx.lineTo(x - 3, y - 6);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + 5, y - 7);
    ctx.lineTo(x + 11, y + 6);
    ctx.stroke();
  } else if (kind === "grave" || kind === "crypt") {
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 6);
    ctx.moveTo(x - 5, y - 2);
    ctx.lineTo(x + 5, y - 2);
    ctx.stroke();
  } else if (kind === "desert") {
    ctx.beginPath();
    ctx.arc(x + 6, y - 5, 3, 0, Math.PI * 2);
    ctx.stroke();
    wave(y + 4);
  } else if (kind === "beach") {
    ctx.beginPath();
    ctx.arc(x + 6, y - 5, 3, 0, Math.PI * 2);
    ctx.stroke();
    wave(y + 3);
  }
  ctx.restore();
}

function directionVector(dir: Direction): { x: number; y: number } {
  if (dir === "up") return { x: 0, y: -1 };
  if (dir === "down") return { x: 0, y: 1 };
  if (dir === "left") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function drawCompass(dir: Direction): void {
  const ctx = dom.compassCanvas.getContext("2d");
  if (!ctx) return;
  const w = dom.compassCanvas.width;
  const h = dom.compassCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) - 2;
  ctx.clearRect(0, 0, w, h);

  // Disc + ring.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(7, 10, 8, 0.78)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.stroke();

  // Cardinal letters; north fixed up and marked so it reads at a glance.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 9px Inter, ui-sans-serif, system-ui";
  const inset = radius - 6;
  const cardinals: Array<[string, number, number, string]> = [
    ["N", cx, cy - inset, "#e15b5b"],
    ["E", cx + inset, cy, "#aeb9af"],
    ["S", cx, cy + inset, "#aeb9af"],
    ["W", cx - inset, cy, "#aeb9af"]
  ];
  for (const [label, lx, ly, color] of cardinals) {
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
  }

  // Needle pointing in the facing direction.
  const facing = directionVector(dir);
  const len = radius - 12;
  const tipX = cx + facing.x * len;
  const tipY = cy + facing.y * len;
  const perpX = -facing.y;
  const perpY = facing.x;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(cx + perpX * 4 - facing.x * 3, cy + perpY * 4 - facing.y * 3);
  ctx.lineTo(cx - perpX * 4 - facing.x * 3, cy - perpY * 4 - facing.y * 3);
  ctx.closePath();
  ctx.fillStyle = "#9ae6b4";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#dbe7dc";
  ctx.fill();
}

// Hoisted out of tileBaseTexture so a big-floor rebuild doesn't reallocate this
// map thousands of times.
const TILE_BASE_TEXTURE: Record<string, string> = {
    "#": "tileRock",
    ".": "tileGrass",
    F: "tileForest",
    f: "tileForest",
    r: "tileForest",
    s: "tileStone",
    p: "tileTownFloor",
    t: "tileDirt",
    d: "tileDirt",
    g: "tileGraveDirt",
    b: "tileGravePath",
    q: "tileGraveDirt",
    c: "tileGravePath",
    h: "tileGraveDirt",
    O: "tileGrass",
    "~": "tileWater",
    ">": "tileDirt",
    "<": "tileDirt",
    N: "tileDirt",
    S: "tileDirt",
    T: "tileDirt",
    C: "tileGravePath",
    n: "tileTownFloor",
    m: "tileMarsh",
    k: "tileSwampDirt",
    W: "tileSwampWater",
    B: "tileBridge",
    o: "tileMarsh",
    M: "tileSwampDirt",
    L: "tileSwampDirt",
    R: "tileBadlands",
    J: "tileBadlandsRock",
    w: "tileMassif",
    X: "tileCliff",
    P: "tilePit",
    A: "tileRamp",
    D: "tileBadlands",
    Z: "tileBadlands",
    a: "tileSand",
    Q: "tileQuicksand",
    V: "tileOasisWater",
    U: "tileSand",
    G: "tileSand",
    H: "tileSand",
    e: "tileBeachSand",
    l: "tileBeachShellSand",
    ",": "tileBeachWetSand",
    ";": "tileBeachRippleSand",
    "3": "tileBeachPebbleSand",
    "4": "tileBeachMossyStone",
    "5": "tileBeachWoodPlanks",
    z: "tileBeachPebbleSand",
    "2": "tileBeachStairs",
    x: "tileBeachCliff",
    "0": "tileBeachCliffLeft",
    "1": "tileBeachCliffRight",
    u: "tileBeachRock",
    v: "tileBeachShore",
    "6": "tileBeachShoreNorth",
    "7": "tileBeachShoreEast",
    "8": "tileBeachShoreSouth",
    "9": "tileBeachShoreWest",
    "{": "tileBeachShoreCornerNW",
    "}": "tileBeachShoreCornerNE",
    "(": "tileBeachShoreCornerSW",
    ")": "tileBeachShoreCornerSE",
    "=": "tileBeachLagoon",
    I: "tileOcean",
    Y: "tileBeachPath",
    j: "tileBeachPath",
    y: "tileJungle",
    E: "tileJungleWall",
    i: "tileJungleRiver",
    K: "tileJungle"
};

function tileBaseTexture(tile: string): string {
  return TILE_BASE_TEXTURE[tile] ?? "tileGrass";
}

function textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: "Inter, ui-sans-serif, system-ui",
    fontSize: `${size}px`,
    color,
    stroke: "#101211",
    strokeThickness: 3
  };
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" };
  return value.replace(/[&<>"']/g, (char) => replacements[char] ?? char);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 104857.6) / 10}MB`;
}
