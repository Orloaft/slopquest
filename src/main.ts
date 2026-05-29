import Phaser from "phaser";
import "./style.css";
import {
  ABILITIES,
  CLASSES,
  ITEMS,
  MAP_COLS,
  MAP_ROWS,
  MONSTERS,
  NPCS,
  SHOP,
  TILE_SIZE,
  TREE_TYPES,
  isBlockedTile,
  makeFloorTiles,
  tileAt,
  xpForLevel
} from "./shared.ts";
import type { ClassSpec } from "./shared.ts";
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
  InputPayload,
  InventoryItemView,
  MonsterView,
  NpcView,
  PlayerView,
  QuestView,
  ServerMessage,
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
  animWidth?: number;
  animHeight?: number;
  currentFrameKey?: string;
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
  }>;
}

declare global {
  interface Window {
    __TIB_E2E__?: E2EHooks;
  }
}

let socket: WebSocket | null = null;
let selfId: string | null = null;
let latestState: StateSnapshot | null = null;
let stateVersion = 0;
let syncedStateVersion = -1;
let hudStateVersion = -1;
const chatLines: string[] = [];
const E2E_MODE = new URLSearchParams(location.search).has("e2e");
let renderedSkillSignature = "";
let renderedInventorySignature = "";

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
  skillTracker: el<HTMLElement>("#skillTracker"),
  inventoryGrid: el<HTMLElement>("#inventoryGrid"),
  hotbar: el<HTMLElement>("#hotbar"),
  netStats: el<HTMLElement>("#netStats"),
  vendor: el<HTMLElement>("#vendor"),
  vendorCloseButton: el<HTMLButtonElement>("#vendorCloseButton"),
  dialogue: el<HTMLElement>("#dialogue"),
  dialogueSpeaker: el<HTMLElement>("#dialogueSpeaker"),
  dialogueLine: el<HTMLElement>("#dialogueLine"),
  dialogueNextButton: el<HTMLButtonElement>("#dialogueNextButton"),
  itemPopover: el<HTMLElement>("#itemPopover"),
  death: el<HTMLElement>("#death"),
  chatLog: el<HTMLElement>("#chatLog"),
  chatForm: el<HTMLFormElement>("#chatForm"),
  chatInput: el<HTMLInputElement>("#chatInput"),
  respawnButton: el<HTMLButtonElement>("#respawnButton")
};

dom.joinButton.addEventListener("click", () => joinCharacter(dom.nameInput.value, true));
dom.refreshRosterButton.addEventListener("click", () => send({ type: "characters" }));
dom.respawnButton.addEventListener("click", () => send({ type: "respawn" }));
dom.skillsButton.addEventListener("click", () => toggleCenterPanel(dom.skillsPanel));
dom.inventoryButton.addEventListener("click", () => toggleCenterPanel(dom.inventoryPanel));
dom.abilitiesButton.addEventListener("click", () => toggleCenterPanel(dom.abilitiesPanel));
dom.skillsCloseButton.addEventListener("click", () => hideCenterPanels());
dom.inventoryCloseButton.addEventListener("click", () => hideCenterPanels());
dom.abilitiesCloseButton.addEventListener("click", () => hideCenterPanels());
dom.vendorCloseButton.addEventListener("click", () => hideCenterPanels());
dom.menuBackdrop.addEventListener("click", () => hideCenterPanels());
dom.dialogueNextButton.addEventListener("click", advanceDialogue);
dom.vendor.querySelectorAll<HTMLElement>("[data-buy]").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.dataset.buy;
    if (item) send({ type: "buy", item });
  });
});
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
        const frames = DIRECTIONS.flatMap((dir) =>
          [0, 1, 2, 3].map((frame) => {
            const key = actorTextureKey(spec.family, dir, frame);
            return { dir, frame, key, exists: Boolean(scene?.textures?.exists?.(key)) };
          })
        );
        return { type, family: spec.family, frames };
      })
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
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
});
void game;

let scene: Phaser.Scene;
let cursors: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
let keys: Record<string, Phaser.Input.Keyboard.Key>;
let lastInputAt = 0;
let lastInputSignature = "";
let currentFloor: number | null = null;
let clickDestination: PathDestination | null = null;
let clickPath: PathDestination[] = [];
let pendingTreeCut: string | null = null;
let pendingAttackTarget: string | null = null;
let pendingLootTarget: string | null = null;
let pendingNpcTalk: string | null = null;
let pendingFishingNode: string | null = null;
let pendingCookingFire: string | null = null;
let dynamicPathTarget: DynamicPathTarget | null = null;
let lastDynamicPathRefreshAt = 0;
let clickMarker: Phaser.GameObjects.Ellipse | null = null;
let holdMoveActive = false;
let holdMoveTile: HoldMoveTile | null = null;
let holdMoveLastRepathAt = 0;
const HOLD_MOVE_REPATH_MS = 80;
let mapLayer: Phaser.GameObjects.Container;
let entityLayer: Phaser.GameObjects.Container;
let fxLayer: Phaser.GameObjects.Container;
const playerViews = new Map<string, PlayerEntityView>();
const monsterViews = new Map<string, MonsterEntityView>();
const corpseViews = new Map<string, Phaser.GameObjects.Container>();
const npcViews = new Map<string, NpcEntityView>();
const treeViews = new Map<string, TreeEntityView>();
const fishingViews = new Map<string, FishingEntityView>();
const fireViews = new Map<string, FireEntityView>();
const floaters: Floater[] = [];
let selectedInventorySlot: number | null = null;
let selectedInventoryItem: string | null = null;
let activeDialogue: ActiveDialogue | null = null;
const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
const WALK_FRAME_MS = 125;
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
  this.load.image("uiSheet", "/ui-sheet.png");
  this.load.image("townTiles", "/towntiles.png");
  this.load.image("forestTiles", "/foresttiles.png");
  this.load.image("graveyardTiles", "/graveyardtiles.png");
  this.load.image("darkForestTiles", "/dark-forest-tiles.png");
  this.load.image("effectsSheet", "/effects.png");
  this.load.image("waterFishingSpots", "/water-fishing-spots.png");
  this.load.image("spriteCampfire", "/campfire.png");
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
  keys = keyboard.addKeys("W,A,S,D,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,F,B,ENTER,TAB", false) as Record<string, Phaser.Input.Keyboard.Key>;
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
  if (currentFloor !== me.floor) {
    drawMap(me.floor);
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
    renderMetrics(latestState.metrics);
    hudStateVersion = stateVersion;
  }
  sendInput(time);
  tickHoldMove(time);
  updateFloaters();
  const ownView = selfId ? playerViews.get(selfId) : undefined;
  if (ownView) scene.cameras.main.centerOn(ownView.x, ownView.y);
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
    const message = JSON.parse(event.data as string) as ServerMessage;
    if (message.type === "characters") renderRoster(message.characters ?? []);
    if (message.type === "characterDeleted" && !message.ok) dom.rosterList.textContent = "That character is online or no longer exists.";
    if (message.type === "welcome") selfId = message.id;
    if (message.type === "state") {
      latestState = message;
      stateVersion += 1;
      consumeEvents(message.events ?? []);
    }
  });
  socket.addEventListener("close", () => {
    addChat("Disconnected from server.");
    if (!selfId) dom.rosterList.textContent = "Disconnected. Refresh to retry.";
  });
  socket.addEventListener("error", () => addChat("Connection error. Refresh if the world stops updating."));
}

function joinCharacter(name: string, fresh = false): void {
  ensureSocket();
  const clean = String(name ?? "").trim();
  if (!clean) return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    send({ type: "join", name: clean, fresh });
    dom.join.classList.add("hidden");
    dom.hud.classList.remove("hidden");
    addChat("Connected to Waystone.");
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

function drawMap(floor: number): void {
  currentFloor = floor;
  mapLayer.removeAll(true);
  const rows = makeFloorTiles(floor);
  const mapTexture = scene.add.renderTexture(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE).setOrigin(0);
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    if (row === undefined) continue;
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x] ?? "";
      mapTexture.draw(tileBaseTexture(tile), x * TILE_SIZE, y * TILE_SIZE);
    }
  }
  mapLayer.add(mapTexture);
  addTileDecorations(rows);
  addComposedMapObjects(floor);

}

function syncEntities(): void {
  const me = self();
  if (!me || !latestState) return;
  const visiblePlayers = new Set<string>();
  const visibleMonsters = new Set<string>();
  const visibleCorpses = new Set<string>();
  const visibleNpcs = new Set<string>();
  const visibleTrees = new Set<string>();
  const visibleFishingNodes = new Set<string>();
  const visibleFires = new Set<string>();

  for (const player of latestState.players.filter((item) => item.floor === me.floor)) {
    visiblePlayers.add(player.id);
    let view = playerViews.get(player.id);
    if (!view) {
      view = createPlayerView(player);
      playerViews.set(player.id, view);
      entityLayer.add(view);
    }
    setEntityTarget(view, player.x * TILE_SIZE, player.y * TILE_SIZE);
    setActorAnimation(view, "knight", player.dir, player.moving || (player.action != null && ["woodcutting", "fishing", "cooking"].includes(player.action.type)), 40, 48);
    view.setAlpha(player.dead ? 0.45 : 1);
    view.nameText.setText(player.name);
    view.hp.width = 34 * (player.hp / player.maxHp);
    view.targetRing.setVisible(player.id === selfId);
  }

  for (const [id, view] of playerViews) {
    if (!visiblePlayers.has(id)) {
      view.destroy();
      playerViews.delete(id);
    }
  }

  for (const monster of latestState.monsters.filter((item) => item.floor === me.floor)) {
    visibleMonsters.add(monster.id);
    let view = monsterViews.get(monster.id);
    if (!view) {
      view = createMonsterView(monster);
      monsterViews.set(monster.id, view);
      entityLayer.add(view);
    }
    setEntityTarget(view, monster.x * TILE_SIZE, monster.y * TILE_SIZE);
    const actor = monsterActorSpec(monster);
    setActorAnimation(view, actor.family, monster.dir, monster.moving, actor.width, actor.height);
    view.sprite.y = actor.yOffset;
    view.sprite.clearTint();
    if (actor.tint) view.sprite.setTint(actor.tint);
    view.nameText.setText(monster.name);
    view.hp.width = 36 * (monster.hp / monster.maxHp);
    view.targetRing.setVisible(me.targetId === monster.id);
  }

  for (const [id, view] of monsterViews) {
    if (!visibleMonsters.has(id)) {
      view.destroy();
      monsterViews.delete(id);
    }
  }

  for (const corpse of latestState.corpses.filter((item) => item.floor === me.floor)) {
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

  for (const npc of (latestState.npcs ?? []).filter((item) => item.floor === me.floor)) {
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
      view.destroy();
      npcViews.delete(id);
    }
  }

  for (const tree of (latestState.trees ?? []).filter((item) => item.floor === me.floor)) {
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

  for (const node of (latestState.fishingNodes ?? []).filter((item) => item.floor === me.floor)) {
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

  for (const fire of (latestState.fires ?? []).filter((item) => item.floor === me.floor)) {
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
  setActorAnimation(view, actor.family, monster.dir, monster.moving, actor.width, actor.height);
  return view;
}

function monsterActorSpec(monster: { type: string }): MonsterActorSpec {
  if (monster.type === "rat") return { family: "rat", width: 44, height: 28, yOffset: 2 };
  if (monster.type === "spider") return { family: "spider", width: 48, height: 34, yOffset: -1 };
  if (monster.type === "skeleton") return { family: "skeleton", width: 42, height: 48, yOffset: -10 };
  if (monster.type === "ghoul") return { family: "skeleton", width: 44, height: 50, yOffset: -11, tint: 0x9ec39c };
  if (monster.type === "boss") return { family: "skeleton", width: 62, height: 66, yOffset: -18, tint: 0xff8a5c };
  if (monster.type === "orc") return { family: "goblinRaider", width: 54, height: 58, yOffset: -16 };
  if (monster.type === "goblin_scout") return { family: "goblinScout", width: 42, height: 52, yOffset: -14 };
  if (monster.type === "goblin_shaman") return { family: "goblinShaman", width: 46, height: 56, yOffset: -16 };
  if (monster.type === "wolf") return { family: "greyWolf", width: 58, height: 44, yOffset: -8 };
  if (monster.type === "wisp") return { family: "wisp", width: 40, height: 56, yOffset: -18 };
  return { family: "goblin", width: 42, height: 46, yOffset: -10 };
}

function setEntityTarget(view: EntityView, x: number, y: number): void {
  view.targetX = x;
  view.targetY = y;
  if (Math.hypot(view.x - x, view.y - y) > TILE_SIZE * 3) {
    view.x = x;
    view.y = y;
  }
}

function interpolateEntities(): void {
  for (const view of playerViews.values()) easeToTarget(view);
  for (const view of monsterViews.values()) easeToTarget(view);
  for (const view of npcViews.values()) easeToTarget(view);
}

function easeToTarget(view: EntityView): void {
  if (view.targetX === undefined || view.targetY === undefined) return;
  view.x += (view.targetX - view.x) * 0.32;
  view.y += (view.targetY - view.y) * 0.32;
}

function setActorAnimation(view: EntityView, family: string, dir: Direction = "down", moving = false, width = 40, height = 48): void {
  view.animFamily = family;
  view.animDir = DIRECTIONS.includes(dir) ? dir : "down";
  view.animMoving = Boolean(moving);
  view.animWidth = width;
  view.animHeight = height;
}

function animateEntities(): void {
  for (const view of playerViews.values()) animateActor(view);
  for (const view of monsterViews.values()) animateActor(view);
  for (const view of npcViews.values()) animateActor(view);
  for (const view of fireViews.values()) {
    if (!view.flame) continue;
    view.flame.setScale(1 + Math.sin(scene.time.now / 95) * 0.08, 1 + Math.cos(scene.time.now / 120) * 0.06);
  }
}

function animateActor(view: EntityView): void {
  if (!view.sprite || !view.animFamily || !view.animDir) return;
  const frame = view.animMoving ? Math.floor(scene.time.now / WALK_FRAME_MS) % 4 : 0;
  const key = actorTextureKey(view.animFamily, view.animDir, frame);
  if (view.currentFrameKey !== key) {
    view.sprite.setTexture(key);
    view.sprite.setDisplaySize(view.animWidth ?? 40, view.animHeight ?? 48);
    view.currentFrameKey = key;
  }
  view.sprite.setFlipX(actorFlipX(view.animFamily, view.animDir));
}

function renderHud(me: PlayerView): void {
  const spec: ClassSpec = CLASSES[me.classKey] ?? CLASSES.adventurer ?? fallbackClassSpec();
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
  renderBuffTracker(me.buffs);
  renderQuestTracker(me.quests);
  renderSkillTracker(me.skills);
  renderInventory(me.inventory);
  renderAbilities(me.abilities);
  loadHotbarFor(me.name);
  renderHotbar(me.inventory);
  dom.death.classList.toggle("hidden", !me.dead);
  const vendorNpc = NPCS[0];
  const nearVendor = vendorNpc != null && me.floor === vendorNpc.floor && Phaser.Math.Distance.Between(me.x, me.y, vendorNpc.x, vendorNpc.y) < 2.2;
  if (!nearVendor && !dom.vendor.classList.contains("hidden")) hideCenterPanels();
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
    abilities: ["sprint", "second_wind"]
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
    slot.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const itemId = slot.dataset.item;
      if (itemId) handleInventoryClick(Number(slot.dataset.slot), itemId);
    });
    slot.addEventListener("mouseenter", () => showItemPopover(slot, slot.dataset.label ?? ""));
    slot.addEventListener("mousemove", () => positionItemPopover(slot));
    slot.addEventListener("mouseleave", hideItemPopover);
    slot.addEventListener("dblclick", () => {
      const id = slot.dataset.item;
      if (id && itemUseKind(id) === "eat") send({ type: "eatItem", item: id });
    });
    if (isHotbarUsable(slot.dataset.item ?? null)) {
      slot.setAttribute("draggable", "true");
      slot.addEventListener("dragstart", (event) => {
        const itemId = slot.dataset.item ?? "";
        activeHotbarDrag = { source: "inventory", itemId };
        hotbarDragLandedInHotbar = false;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.setData("text/plain", `inventory:${itemId}`);
        }
      });
      slot.addEventListener("dragend", finishHotbarDrag);
    }
  });
  dom.inventoryGrid.querySelectorAll<HTMLElement>(".inventory-slot.empty").forEach((slot) => {
    slot.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      clearInventorySelection();
      renderInventory(self()?.inventory ?? []);
    });
  });
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
      if (!slot) {
        return `<button class="hotbar-slot empty" type="button" data-slot="${i}"><b class="hotbar-key">${key}</b></button>`;
      }
      if (slot.kind === "item") {
        const item = ITEMS[slot.itemId];
        const qty = inventoryQty(inventory, slot.itemId);
        const depleted = qty === 0 ? " depleted" : "";
        const icon = item ? iconMarkup(item.iconUrl, item.icon, "item-icon") : "?";
        const label = item?.label ?? slot.itemId;
        return `<button class="hotbar-slot${depleted}" type="button" draggable="true" data-slot="${i}" data-item="${escapeHtml(slot.itemId)}" data-label="${escapeHtml(label)}"><b class="hotbar-key">${key}</b>${icon}<span class="hotbar-qty">${qty}</span></button>`;
      }
      const ability = ABILITIES[slot.abilityId];
      const live = abilities.find((a) => a.id === slot.abilityId);
      const isActive = (live?.activeRemainingMs ?? 0) > 0;
      const onCooldown = (live?.cooldownRemainingMs ?? 0) > 0;
      const stateClass = isActive ? " ability-active" : onCooldown ? " ability-cooldown" : "";
      const label = ability?.label ?? slot.abilityId;
      const glyph = abilityGlyph(label);
      return `<button class="hotbar-slot ability${stateClass}" type="button" draggable="true" data-slot="${i}" data-ability="${escapeHtml(slot.abilityId)}" data-label="${escapeHtml(label)}"><b class="hotbar-key">${key}</b><span class="hotbar-ability">${escapeHtml(glyph)}</span></button>`;
    })
    .join("");

  dom.hotbar.querySelectorAll<HTMLElement>(".hotbar-slot").forEach((elem) => {
    const slotIndex = Number(elem.dataset.slot);
    elem.addEventListener("click", () => activateHotbarSlot(slotIndex));
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

function handleHotbarDrop(targetSlot: number): void {
  const drag = activeHotbarDrag;
  if (!drag) return;
  if (drag.source === "inventory") {
    if (!isHotbarUsable(drag.itemId)) return;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = hotbarLayout[i];
      if (i !== targetSlot && slot?.kind === "item" && slot.itemId === drag.itemId) {
        hotbarLayout[i] = null;
      }
    }
    hotbarLayout[targetSlot] = { kind: "item", itemId: drag.itemId };
  } else if (drag.source === "abilities") {
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
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(fallback ?? "")}" loading="lazy" />`;
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
  const signature = JSON.stringify(input);
  if (time - lastInputAt < 50 && signature === lastInputSignature) return;
  lastInputAt = time;
  lastInputSignature = signature;
  send({ type: "input", input });
}

function sendStopInput(): void {
  const input: InputPayload = { up: false, down: false, left: false, right: false, moveX: 0, moveY: 0 };
  const signature = JSON.stringify(input);
  if (signature === lastInputSignature) return;
  lastInputSignature = signature;
  send({ type: "input", input });
}

function handleWorldClick(pointer: Phaser.Input.Pointer): void {
  if (!latestState || !self() || pointer.leftButtonDown() === false) return;
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
  dom.abilitiesPanel.classList.add("hidden");
  dom.vendor.classList.add("hidden");
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
  fireId: string | null = null
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
  if (!attackId && !npcId) dynamicPathTarget = null;
  drawClickMarker({ floor, x: destination.x + 0.5, y: destination.y + 0.5 });
  return true;
}

function findReachableClickTile(floor: number, startX: number, startY: number, tx: number, ty: number): TilePoint | null {
  if (!isInMap(tx, ty)) return null;
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
  const open: PathNode[] = [startNode];
  const bestByKey = new Map<string, PathNode>([[tileKey(startX, startY), startNode]]);
  const closed = new Set<string>();
  const maxVisited = MAP_COLS * MAP_ROWS;

  while (open.length && closed.size < maxVisited) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
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
  return isInMap(tx, ty) && !isBlockedTile(tileAt(floor, tx, ty));
}

function isInMap(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < MAP_COLS && ty < MAP_ROWS;
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
  dynamicPathTarget = null;
  if (!keepHold) {
    holdMoveActive = false;
    holdMoveTile = null;
  }
  if (clickMarker) clickMarker.setVisible(false);
}

function addTileDecorations(rows: string[]): void {
  const decorations: DecorationSprite[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    if (row === undefined) continue;
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x] ?? "";
      if (tile === "r") decorations.push({ key: "spriteRock", x: x + 0.5, y: y + 0.78, w: 38, h: 28 });
      if (tile === "h") decorations.push({ key: "spriteGrave", x: x + 0.5, y: y + 0.95, w: 24, h: 34 });
      if (tile === "q") decorations.push({ key: "spriteFence", x: x + 0.5, y: y + 0.78, w: 46, h: 24 });
      if (["N", "S", "T", "C", ">", "<"].includes(tile)) decorations.push({ key: "spritePortal", x: x + 0.5, y: y + 1.2, w: 34, h: 52 });
    }
  }
  decorations.sort((a, b) => a.y - b.y).forEach(placeMapSprite);
}

function addComposedMapObjects(floor: number): void {
  const southTownObjects: DecorationSprite[] = [
    { key: "spriteBridge", x: 7.2, y: 18.6, w: 108, h: 58 },
    { key: "spriteRedHouse", x: 25, y: 11.4, w: 288, h: 198 },
    { key: "spriteBlueHouse", x: 38, y: 11.3, w: 244, h: 176 },
    { key: "spriteGreenHouse", x: 12, y: 28.3, w: 192, h: 184 },
    { key: "spriteThatchHouse", x: 28, y: 30.3, w: 210, h: 172 },
    { key: "spriteBlueHouse", x: 42, y: 27.4, w: 210, h: 156 },
    { key: "spriteWell", x: 22.5, y: 19.5, w: 94, h: 132 },
    { key: "spriteMarket", x: 43, y: 31.2, w: 174, h: 78 },
    { key: "spriteLamp", x: 19.5, y: 19.2, w: 28, h: 100 },
    { key: "spriteLamp", x: 25.5, y: 19.2, w: 28, h: 100 },
    { key: "spriteSign", x: 14.2, y: 20.4, w: 54, h: 66 },
    { key: "spriteSign", x: 32.4, y: 16.1, w: 58, h: 70 },
    { key: "spriteBarrels", x: 18.8, y: 12.2, w: 58, h: 46 },
    { key: "spriteBarrels", x: 40.8, y: 21.2, w: 58, h: 46 },
    { key: "spriteTree", x: 12.8, y: 10.7, w: 70, h: 90 },
    { key: "spriteTree", x: 36.2, y: 17.4, w: 62, h: 80 },
    { key: "spritePine", x: 20.2, y: 31.6, w: 54, h: 84 }
  ];
  const northTownObjects: DecorationSprite[] = [
    { key: "spriteGreenHouse", x: 16.5, y: 12.6, w: 190, h: 176 },
    { key: "spriteBlueHouse", x: 35.3, y: 12.7, w: 220, h: 164 },
    { key: "spriteThatchHouse", x: 21.5, y: 28.4, w: 210, h: 170 },
    { key: "spriteRedHouse", x: 37.2, y: 28.2, w: 230, h: 172 },
    { key: "spriteWell", x: 25.5, y: 19.5, w: 88, h: 122 },
    { key: "spriteMarket", x: 42, y: 20.6, w: 160, h: 72 },
    { key: "spriteLamp", x: 22, y: 19.2, w: 28, h: 100 },
    { key: "spriteLamp", x: 29, y: 19.2, w: 28, h: 100 },
    { key: "spriteSign", x: 25.5, y: 30.8, w: 54, h: 66 },
    { key: "spriteTree", x: 9, y: 9.5, w: 66, h: 86 },
    { key: "spritePine", x: 44, y: 30.2, w: 54, h: 84 }
  ];
  const cemeteryObjects: DecorationSprite[] = [
    { key: "spriteCrypt", x: 26, y: 23.1, w: 126, h: 206 },
    { key: "spriteStoneWall", x: 15, y: 6.1, w: 112, h: 54 },
    { key: "spriteStoneWall", x: 36, y: 28.8, w: 112, h: 54 },
    { key: "spriteMausoleum", x: 37.5, y: 17.1, w: 118, h: 150 },
    { key: "spriteDeadTree", x: 10.4, y: 14.8, w: 72, h: 118 },
    { key: "spriteDeadTree", x: 41.2, y: 10.8, w: 66, h: 108 },
    { key: "spriteObelisk", x: 15.8, y: 18.5, w: 38, h: 60 },
    { key: "spriteObelisk", x: 34.3, y: 23.4, w: 34, h: 54 }
  ];
  const cryptObjects: DecorationSprite[] = [
    { key: "spriteStoneWall", x: 8, y: 11.1, w: 118, h: 58 },
    { key: "spriteStoneWall", x: 36, y: 9.8, w: 118, h: 58 },
    { key: "spriteObelisk", x: 16.4, y: 18.8, w: 36, h: 58 },
    { key: "spriteObelisk", x: 42.6, y: 23.8, w: 40, h: 64 }
  ];
  const woodsObjects: DecorationSprite[] = [
    { key: "spriteTree", x: 8.5, y: 10.4, w: 80, h: 104 },
    { key: "spritePine", x: 14.2, y: 29.8, w: 58, h: 92 },
    { key: "spriteTree", x: 19.5, y: 7.4, w: 76, h: 98 },
    { key: "spritePine", x: 31.3, y: 23.8, w: 56, h: 90 },
    { key: "spriteTree", x: 45.2, y: 15.3, w: 82, h: 106 },
    { key: "spriteRock", x: 18.7, y: 25.2, w: 44, h: 34 },
    { key: "spriteRock", x: 38.5, y: 5.7, w: 48, h: 36 },
    { key: "spriteBoulder", x: 28.4, y: 12.6, w: 52, h: 64 },
    { key: "spriteBoulder", x: 41.6, y: 27.3, w: 46, h: 58 }
  ];

  const objectsByFloor: Record<number, DecorationSprite[]> = {
    0: southTownObjects,
    1: cemeteryObjects,
    2: cryptObjects,
    3: woodsObjects,
    4: northTownObjects
  };
  const objects = objectsByFloor[floor] ?? [];
  objects
    .filter((item) => item.key !== "spriteTree" && item.key !== "spritePine")
    .sort((a, b) => a.y - b.y)
    .forEach(placeMapSprite);
}

function placeMapSprite(item: DecorationSprite): Phaser.GameObjects.Image {
  const sprite = scene.add.image(item.x * TILE_SIZE, item.y * TILE_SIZE, item.key).setOrigin(0.5, 1);
  sprite.setDisplaySize(item.w, item.h);
  mapLayer.add(sprite);
  return sprite;
}

function consumeEvents(events: GameEvent[]): void {
  for (const event of events) {
    if (event.type === "system" || event.type === "chat") addChat(String(event.text));
    if (event.type === "dialogue") openDialogue(event);
    if (event.type === "effect" && self()?.floor === event.floor) playCombatEffect(event);
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
  activeDialogue = { lines, index: 0, opensShop: Boolean(event.opensShop) };
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
  activeDialogue = null;
  dom.dialogue.classList.add("hidden");
  if (openFollowup && opensShop) {
    dom.menuBackdrop.classList.remove("hidden");
    dom.vendor.classList.remove("hidden");
    return;
  }
  if ([dom.skillsPanel, dom.inventoryPanel, dom.abilitiesPanel, dom.vendor].every((panel) => panel.classList.contains("hidden"))) {
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

  if (event.text === "bolt" || event.text === "flare") {
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
    "wisp"
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

function makeTileTexture(scene: Phaser.Scene, sourceKey: string, newKey: string, sx: number, sy: number, sw: number, sh: number): void {
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
  const sourceCanvas = document.createElement("canvas");
  const inset = Math.min(10, Math.floor(sw / 5), Math.floor(sh / 5));
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
  return r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25;
}

function addChat(line: string): void {
  chatLines.push(line);
  while (chatLines.length > 9) chatLines.shift();
  dom.chatLog.innerHTML = chatLines.map((item) => `<div>${escapeHtml(item)}</div>`).join("");
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function self(): PlayerView | undefined {
  return latestState?.players.find((player) => player.id === selfId);
}

function setBar(bar: HTMLElement, label: HTMLElement, value: number, max: number, prefix: string): void {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  bar.style.width = `${pct * 100}%`;
  label.textContent = `${prefix} ${Math.round(value)}/${Math.round(max)}`;
}

function tileBaseTexture(tile: string): string {
  const map: Record<string, string> = {
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
    n: "tileTownFloor"
  };
  return map[tile] ?? "tileGrass";
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
