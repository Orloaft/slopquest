import Phaser from "phaser";
import "./style.css";
import {
  CLASSES,
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
} from "./shared.js";

let socket = null;
let selfId = null;
let latestState = null;
let stateVersion = 0;
let syncedStateVersion = -1;
let hudStateVersion = -1;
const chatLines = [];

const dom = {
  join: document.querySelector("#join"),
  hud: document.querySelector("#hud"),
  nameInput: document.querySelector("#nameInput"),
  joinButton: document.querySelector("#joinButton"),
  refreshRosterButton: document.querySelector("#refreshRosterButton"),
  rosterList: document.querySelector("#rosterList"),
  charName: document.querySelector("#charName"),
  classLabel: document.querySelector("#classLabel"),
  hpBar: document.querySelector("#hpBar"),
  manaBar: document.querySelector("#manaBar"),
  xpBar: document.querySelector("#xpBar"),
  hpText: document.querySelector("#hpText"),
  manaText: document.querySelector("#manaText"),
  xpText: document.querySelector("#xpText"),
  levelText: document.querySelector("#levelText"),
  goldText: document.querySelector("#goldText"),
  potionText: document.querySelector("#potionText"),
  weaponText: document.querySelector("#weaponText"),
  armorText: document.querySelector("#armorText"),
  questTracker: document.querySelector("#questTracker"),
  skillTracker: document.querySelector("#skillTracker"),
  inventoryGrid: document.querySelector("#inventoryGrid"),
  netStats: document.querySelector("#netStats"),
  vendor: document.querySelector("#vendor"),
  death: document.querySelector("#death"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  abilityOne: document.querySelector("#abilityOne"),
  potionButton: document.querySelector("#potionButton"),
  lootButton: document.querySelector("#lootButton"),
  vendorButton: document.querySelector("#vendorButton"),
  respawnButton: document.querySelector("#respawnButton")
};

dom.joinButton.addEventListener("click", () => joinCharacter(dom.nameInput.value, true));
dom.refreshRosterButton.addEventListener("click", () => send({ type: "characters" }));
dom.abilityOne.addEventListener("click", () => send({ type: "ability", slot: "1" }));
dom.potionButton.addEventListener("click", () => send({ type: "ability", slot: "2" }));
dom.lootButton.addEventListener("click", () => send({ type: "loot" }));
dom.vendorButton.addEventListener("click", () => dom.vendor.classList.toggle("hidden"));
dom.respawnButton.addEventListener("click", () => send({ type: "respawn" }));
dom.vendor.querySelectorAll("[data-buy]").forEach((button) => {
  button.addEventListener("click", () => send({ type: "buy", item: button.dataset.buy }));
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

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#111412",
  pixelArt: true,
  scene: { preload, create, update },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
});

let scene;
let cursors;
let keys;
let lastInputAt = 0;
let lastInputSignature = "";
let currentFloor = null;
let clickDestination = null;
let clickPath = [];
let pendingTreeCut = null;
let pendingAttackTarget = null;
let pendingLootTarget = null;
let pendingNpcTalk = null;
let clickMarker = null;
let mapLayer;
let entityLayer;
let fxLayer;
const playerViews = new Map();
const monsterViews = new Map();
const corpseViews = new Map();
const npcViews = new Map();
const treeViews = new Map();
const floaters = [];
const DIRECTIONS = ["up", "right", "down", "left"];
const WALK_FRAME_MS = 125;

function preload() {
  scene = this;
  this.load.image("playerSheet", "/player-sheet.png");
  this.load.image("goblinSheet", "/goblin.png");
  this.load.image("skeletonSheet", "/skeleton.png");
  this.load.image("ratSpiderSheet", "/ratandspiders.png");
  this.load.image("uiSheet", "/ui-sheet.png");
  this.load.image("townTiles", "/towntiles.png");
  this.load.image("forestTiles", "/foresttiles.png");
  this.load.image("graveyardTiles", "/graveyardtiles.png");
  this.load.image("effectsSheet", "/effects.png");
}

function create() {
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

  cursors = this.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.UP,
    down: Phaser.Input.Keyboard.KeyCodes.DOWN,
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT
  }, false);
  this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB]);
  keys = this.input.keyboard.addKeys("W,A,S,D,ONE,TWO,F,B,ENTER,TAB", false);
  keys.ONE.on("down", () => {
    if (!isTextEntryFocused()) send({ type: "ability", slot: "1" });
  });
  keys.TWO.on("down", () => {
    if (!isTextEntryFocused()) send({ type: "ability", slot: "2" });
  });
  keys.F.on("down", () => {
    if (!isTextEntryFocused()) send({ type: "loot" });
  });
  keys.B.on("down", () => {
    if (!isTextEntryFocused()) dom.vendor.classList.toggle("hidden");
  });
  keys.ENTER.on("down", () => {
    if (!isTextEntryFocused()) dom.chatInput.focus();
  });
  this.input.keyboard.on("keydown-TAB", (event) => {
    if (isTextEntryFocused()) return;
    event.preventDefault();
    cycleTarget();
  });
  this.input.on("pointerdown", handleWorldClick);
  refreshKeyboardCapture();
}

function update(time) {
  if (!latestState || !self()) return;
  const me = self();
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
  updateFloaters();
  const ownView = playerViews.get(selfId);
  if (ownView) scene.cameras.main.centerOn(ownView.x, ownView.y);
}

function ensureSocket() {
  if (socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) return;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.hostname}:8787`);
  socket.addEventListener("open", () => {
    send({ type: "characters" });
    dom.rosterList.textContent = "Choose a character or create a new one.";
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
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

function joinCharacter(name, fresh = false) {
  ensureSocket();
  const clean = String(name ?? "").trim();
  if (!clean) return;
  if (socket.readyState === WebSocket.OPEN) {
    send({ type: "join", name: clean, fresh });
    dom.join.classList.add("hidden");
    dom.hud.classList.remove("hidden");
    addChat("Connected to Waystone.");
    return;
  }
  dom.rosterList.textContent = "Connecting...";
  socket.addEventListener("open", () => joinCharacter(clean, fresh), { once: true });
}

function renderRoster(characters) {
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
  dom.rosterList.querySelectorAll("[data-play]").forEach((button) => {
    button.addEventListener("click", () => joinCharacter(button.dataset.play, false));
  });
  dom.rosterList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => send({ type: "deleteCharacter", name: button.dataset.delete }));
  });
}

function drawMap(floor) {
  currentFloor = floor;
  mapLayer.removeAll(true);
  const rows = makeFloorTiles(floor);
  const mapTexture = scene.add.renderTexture(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE).setOrigin(0);
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const tile = rows[y][x];
      mapTexture.draw(tileBaseTexture(tile), x * TILE_SIZE, y * TILE_SIZE);
    }
  }
  mapLayer.add(mapTexture);
  addTileDecorations(rows);
  addComposedMapObjects(floor);

}

function syncEntities() {
  const me = self();
  const visiblePlayers = new Set();
  const visibleMonsters = new Set();
  const visibleCorpses = new Set();
  const visibleNpcs = new Set();
  const visibleTrees = new Set();

  for (const player of latestState.players.filter((item) => item.floor === me.floor)) {
    visiblePlayers.add(player.id);
    let view = playerViews.get(player.id);
    if (!view) {
      view = createPlayerView(player);
      playerViews.set(player.id, view);
      entityLayer.add(view);
    }
    setEntityTarget(view, player.x * TILE_SIZE, player.y * TILE_SIZE);
    setActorAnimation(view, "knight", player.dir, player.moving || player.action?.type === "woodcutting", 40, 48);
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
      zone.on("pointerdown", (pointer, localX, localY, event) => {
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
    view.zone.input.enabled = tree.active;
  }
  for (const [id, view] of treeViews) {
    if (!visibleTrees.has(id)) {
      view.destroy();
      treeViews.delete(id);
    }
  }
}

function createPlayerView(player) {
  const view = scene.add.container(player.x * TILE_SIZE, player.y * TILE_SIZE);
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

function createNpcView(npc) {
  const view = scene.add.container(npc.x * TILE_SIZE, npc.y * TILE_SIZE);
  view.targetX = view.x;
  view.targetY = view.y;
  const shadow = scene.add.ellipse(0, 13, 26, 10, 0x000000, 0.26);
  const family = npc.role === "quest" ? "caster" : "knight";
  const sprite = scene.add.sprite(0, -10, actorTextureKey(family, npc.dir, 0)).setDisplaySize(40, 48);
  const nameText = scene.add.text(0, -45, npc.name, textStyle(11, npc.role === "quest" ? "#f7d486" : "#f5ddb1")).setOrigin(0.5);
  const zone = scene.add.zone(0, 0, 50, 58).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (pointer, localX, localY, event) => {
    event.stopPropagation();
    startNpcTalkPath(npc);
  });
  view.add([shadow, sprite, nameText, zone]);
  view.nameText = nameText;
  view.sprite = sprite;
  setActorAnimation(view, family, npc.dir, npc.moving, 40, 48);
  return view;
}

function createTreeView(tree) {
  const view = scene.add.container(tree.x * TILE_SIZE, tree.y * TILE_SIZE);
  const spec = treeTypeSpec(tree);
  const treeSprite = scene.add.image(0, 4, spec.textureKey).setOrigin(0.5, 1).setDisplaySize(spec.width, spec.height);
  const stump = scene.add.rectangle(0, 12, 20, 12, 0x705036).setStrokeStyle(2, 0x2d1f14).setVisible(false);
  const zone = scene.add.zone(0, -18, spec.zoneWidth, spec.zoneHeight).setInteractive({ cursor: "pointer" });
  zone.on("pointerdown", (pointer, localX, localY, event) => {
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

function updateTreeViewTexture(view, tree) {
  const spec = treeTypeSpec(tree);
  view.treeSprite.setTexture(spec.textureKey);
  view.treeSprite.setDisplaySize(spec.width, spec.height);
  view.zone.setSize(spec.zoneWidth, spec.zoneHeight);
  view.treeType = tree.type;
}

function treeTypeSpec(tree) {
  return TREE_TYPES[tree.type] ?? TREE_TYPES.oak;
}

function createMonsterView(monster) {
  const view = scene.add.container(monster.x * TILE_SIZE, monster.y * TILE_SIZE);
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
  zone.on("pointerdown", (pointer, localX, localY, event) => {
    event.stopPropagation();
    startAttackPath(monster);
  });
  view.add([targetRing, shadow, sprite, nameText, hpBack, hp, zone]);
  view.nameText = nameText;
  view.hp = hp;
  view.targetRing = targetRing;
  view.sprite = sprite;
  setActorAnimation(view, actor.family, monster.dir, monster.moving, actor.width, actor.height);
  return view;
}

function monsterActorSpec(monster) {
  if (monster.type === "rat") return { family: "rat", width: 44, height: 28, yOffset: 2 };
  if (monster.type === "spider") return { family: "spider", width: 48, height: 34, yOffset: -1 };
  if (monster.type === "skeleton") return { family: "skeleton", width: 42, height: 48, yOffset: -10 };
  if (monster.type === "ghoul") return { family: "skeleton", width: 44, height: 50, yOffset: -11, tint: 0x9ec39c };
  if (monster.type === "boss") return { family: "skeleton", width: 62, height: 66, yOffset: -18, tint: 0xff8a5c };
  if (monster.type === "orc") return { family: "goblin", width: 48, height: 50, yOffset: -12, tint: 0xb7d17a };
  if (monster.type === "wolf") return { family: "rat", width: 54, height: 34, yOffset: -2, tint: 0x9ca3af };
  return { family: "goblin", width: 42, height: 46, yOffset: -10 };
}

function setEntityTarget(view, x, y) {
  view.targetX = x;
  view.targetY = y;
  if (Math.hypot(view.x - x, view.y - y) > TILE_SIZE * 3) {
    view.x = x;
    view.y = y;
  }
}

function interpolateEntities() {
  for (const view of playerViews.values()) easeToTarget(view);
  for (const view of monsterViews.values()) easeToTarget(view);
  for (const view of npcViews.values()) easeToTarget(view);
}

function easeToTarget(view) {
  if (view.targetX === undefined) return;
  view.x += (view.targetX - view.x) * 0.32;
  view.y += (view.targetY - view.y) * 0.32;
}

function setActorAnimation(view, family, dir = "down", moving = false, width = 40, height = 48) {
  view.animFamily = family;
  view.animDir = DIRECTIONS.includes(dir) ? dir : "down";
  view.animMoving = Boolean(moving);
  view.animWidth = width;
  view.animHeight = height;
}

function animateEntities() {
  for (const view of playerViews.values()) animateActor(view);
  for (const view of monsterViews.values()) animateActor(view);
  for (const view of npcViews.values()) animateActor(view);
}

function animateActor(view) {
  if (!view.sprite || !view.animFamily) return;
  const frame = view.animMoving ? Math.floor(scene.time.now / WALK_FRAME_MS) % 4 : 0;
  const key = actorTextureKey(view.animFamily, view.animDir, frame);
  if (view.currentFrameKey !== key) {
    view.sprite.setTexture(key);
    view.sprite.setDisplaySize(view.animWidth, view.animHeight);
    view.currentFrameKey = key;
  }
  view.sprite.setFlipX(actorFlipX(view.animFamily, view.animDir));
}

function renderHud(me) {
  const spec = CLASSES[me.classKey] ?? CLASSES.adventurer;
  dom.charName.textContent = me.name;
  dom.classLabel.textContent = spec.label;
  setBar(dom.hpBar, dom.hpText, me.hp, me.maxHp, "HP");
  setBar(dom.manaBar, dom.manaText, me.mana, me.maxMana, "MP");
  const levelStart = xpForLevel(me.level);
  const levelEnd = xpForLevel(me.level + 1);
  setBar(dom.xpBar, dom.xpText, me.xp - levelStart, levelEnd - levelStart, "XP");
  dom.levelText.textContent = me.level;
  dom.goldText.textContent = me.gold;
  dom.potionText.textContent = me.potions;
  dom.weaponText.textContent = me.weaponTier ? SHOP.weapon.knightName : "Basic";
  dom.armorText.textContent = me.armorTier ? SHOP.armor.name : "Cloth";
  renderQuestTracker(me.quests);
  renderSkillTracker(me.skills);
  renderInventory(me.inventory);
  dom.abilityOne.querySelector("span").textContent = "Magic";
  dom.death.classList.toggle("hidden", !me.dead);
  const nearVendor = me.floor === NPCS[0].floor && Phaser.Math.Distance.Between(me.x, me.y, NPCS[0].x, NPCS[0].y) < 2.2;
  dom.vendorButton.classList.toggle("lit", nearVendor);
  if (!nearVendor) dom.vendor.classList.add("hidden");
}

function renderMetrics(metrics) {
  if (!metrics) {
    dom.netStats.textContent = "net -";
    return;
  }
  dom.netStats.textContent = `zone ${metrics.zone} | net ${formatBytes(metrics.bytesOutPerSecond)}/s | tick ${metrics.tickMs}ms | snap ${metrics.snapshotMs}ms | seen ${metrics.visiblePlayers}p/${metrics.visibleMonsters}m/${metrics.visibleTrees ?? 0}t | cells ${metrics.spatialCells}`;
}

function renderQuestTracker(quests = []) {
  const quest = quests.find((item) => item.accepted && !item.claimed) ?? quests.find((item) => !item.claimed) ?? quests[0];
  if (!quest) {
    dom.questTracker.textContent = "";
    return;
  }
  const status = quest.claimed ? "Complete" : quest.accepted ? `${quest.progress}/${quest.target}` : "Talk to Mira";
  dom.questTracker.textContent = `${quest.title}: ${status}`;
}

function renderSkillTracker(skills = []) {
  dom.skillTracker.innerHTML = skills
    .map((skill) => `<span>${escapeHtml(skill.label)}</span><b>${skill.level}</b>`)
    .join("");
}

function renderInventory(inventory = []) {
  const slots = Array.from({ length: 30 }, (_, index) => inventory[index] ?? null);
  dom.inventoryGrid.innerHTML = slots
    .map((item) => {
      if (!item) return `<div class="inventory-slot empty">.</div>`;
      const qty = item.qty > 1 ? `<span>${item.qty}</span>` : "";
      return `<div class="inventory-slot" title="${escapeHtml(item.label)}">${escapeHtml(item.icon)}${qty}</div>`;
    })
    .join("");
}

function lootLabel(corpse) {
  if (corpse.kind === "drop") return corpse.label ?? "Drop";
  return `${corpse.gold}g`;
}

function sendInput(time) {
  if (isTextEntryFocused()) {
    sendStopInput();
    return;
  }
  const me = self();
  const clickInput = clickDestination && me ? inputTowardDestination(me) : null;
  const hasManualInput = keys.W.isDown || cursors.up.isDown || keys.S.isDown || cursors.down.isDown || keys.A.isDown || cursors.left.isDown || keys.D.isDown || cursors.right.isDown;
  if (hasManualInput) clearClickDestination();
  const input = {
    up: keys.W.isDown || cursors.up.isDown || Boolean(clickInput?.up),
    down: keys.S.isDown || cursors.down.isDown || Boolean(clickInput?.down),
    left: keys.A.isDown || cursors.left.isDown || Boolean(clickInput?.left),
    right: keys.D.isDown || cursors.right.isDown || Boolean(clickInput?.right),
    moveX: clickInput?.moveX ?? 0,
    moveY: clickInput?.moveY ?? 0
  };
  const signature = JSON.stringify(input);
  if (time - lastInputAt < 50 && signature === lastInputSignature) return;
  lastInputAt = time;
  lastInputSignature = signature;
  send({ type: "input", input });
}

function sendStopInput() {
  const input = { up: false, down: false, left: false, right: false };
  const signature = JSON.stringify(input);
  if (signature === lastInputSignature) return;
  lastInputSignature = signature;
  send({ type: "input", input });
}

function handleWorldClick(pointer) {
  if (!latestState || !self() || pointer.leftButtonDown() === false) return;
  const tx = Math.floor(pointer.worldX / TILE_SIZE);
  const ty = Math.floor(pointer.worldY / TILE_SIZE);
  const me = self();
  startPathToTile(me.floor, tx, ty);
}

function inputTowardDestination(me) {
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
      send({ type: "talkNpc", id: npcId });
      return null;
    }
  }
  const dx = clickDestination.x - me.x;
  const dy = clickDestination.y - me.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.16) {
    if (clickPath.length) {
      clickDestination = clickPath.shift();
    } else if (pendingAttackTarget && refreshAttackPath(me)) {
      return null;
    } else if (pendingLootTarget && refreshLootPath(me)) {
      return null;
    } else if (pendingNpcTalk && refreshNpcTalkPath(me)) {
      return null;
    } else {
      clearClickDestination();
    }
    return null;
  }

  return {
    moveX: dx / distance,
    moveY: dy / distance
  };
}

function startAttackPath(monster) {
  const me = self();
  if (!me || monster.floor !== me.floor) return;
  clearClickDestination();
  send({ type: "target", id: monster.id });
  if (isInAttackRange(me, monster)) return;

  pendingAttackTarget = monster.id;
  if (!refreshAttackPath(me, monster)) {
    pendingAttackTarget = null;
  }
}

function refreshAttackPath(me, monster = null) {
  const target = monster ?? latestState?.monsters?.find((item) => item.id === pendingAttackTarget);
  if (!target || target.floor !== me.floor) return false;
  if (isInAttackRange(me, target)) return true;
  const destination = nearestEntityApproachTile(me, target, attackRange(me) - 0.08);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, target.id));
}

function isInAttackRange(me, monster) {
  return Phaser.Math.Distance.Between(me.x, me.y, monster.x, monster.y) <= attackRange(me) + 0.08;
}

function attackRange(me) {
  return (CLASSES[me.classKey] ?? CLASSES.adventurer).range;
}

function startTreeCutPath(tree) {
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

function startLootPath(corpse) {
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

function refreshLootPath(me, corpse = null) {
  const target = corpse ?? latestState?.corpses?.find((item) => item.id === pendingLootTarget);
  if (!target || target.floor !== me.floor) return false;
  if (Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) <= 1.85) return true;
  const destination = nearestEntityApproachTile(me, target, 1.8);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, target.id));
}

function startNpcTalkPath(npc) {
  const me = self();
  if (!me || npc.floor !== me.floor) return;
  clearClickDestination();
  pendingNpcTalk = npc.id;
  if (Phaser.Math.Distance.Between(me.x, me.y, npc.x, npc.y) <= 2.25) {
    pendingNpcTalk = null;
    send({ type: "talkNpc", id: npc.id });
    return;
  }

  if (!refreshNpcTalkPath(me, npc)) {
    pendingNpcTalk = null;
  }
}

function refreshNpcTalkPath(me, npc = null) {
  const target = npc ?? latestState?.npcs?.find((item) => item.id === pendingNpcTalk);
  if (!target || target.floor !== me.floor) return false;
  if (Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) <= 2.25) return true;
  const destination = nearestEntityApproachTile(me, target, 2.15);
  return Boolean(destination && startPathToTile(me.floor, destination.x, destination.y, null, null, null, target.id));
}

function nearestTreeApproachTile(me, tree) {
  const treeTileX = Math.floor(tree.x);
  const treeTileY = Math.floor(tree.y);
  const candidates = [];
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

function nearestEntityApproachTile(me, entity, maxRange) {
  const entityTileX = Math.floor(entity.x);
  const entityTileY = Math.floor(entity.y);
  const candidates = [];
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

function startPathToTile(floor, tx, ty, treeId = null, attackId = null, lootId = null, npcId = null) {
  const me = self();
  if (!me || floor !== me.floor || !canStandAtTile(floor, tx, ty)) return false;
  const path = findTilePath(floor, Math.floor(me.x), Math.floor(me.y), tx, ty);
  if (!path.length) return false;
  clickPath = simplifyTilePath(path).slice(1).map((node) => ({ floor, x: node.x + 0.5, y: node.y + 0.5 }));
  clickDestination = clickPath.shift() ?? { floor, x: tx + 0.5, y: ty + 0.5 };
  pendingTreeCut = treeId;
  pendingAttackTarget = attackId;
  pendingLootTarget = lootId;
  pendingNpcTalk = npcId;
  drawClickMarker({ floor, x: tx + 0.5, y: ty + 0.5 });
  return true;
}

function simplifyTilePath(path) {
  if (path.length <= 2) return path;
  const simplified = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    const previous = simplified[simplified.length - 1];
    const current = path[i];
    const next = path[i + 1];
    const dx1 = Math.sign(current.x - previous.x);
    const dy1 = Math.sign(current.y - previous.y);
    const dx2 = Math.sign(next.x - current.x);
    const dy2 = Math.sign(next.y - current.y);
    if (dx1 === dx2 && dy1 === dy2) continue;
    simplified.push(current);
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}

function findTilePath(floor, startX, startY, goalX, goalY) {
  if (startX === goalX && startY === goalY) return [{ x: startX, y: startY }];
  const open = [{ x: startX, y: startY, g: 0, f: tileHeuristic(startX, startY, goalX, goalY), parent: null }];
  const bestByKey = new Map([[tileKey(startX, startY), open[0]]]);
  const closed = new Set();
  const maxVisited = MAP_COLS * MAP_ROWS;

  while (open.length && closed.size < maxVisited) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
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
      const next = {
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

function pathNeighbors(floor, x, y) {
  const neighbors = [];
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

function canStandAtTile(floor, tx, ty) {
  return tx >= 0 && ty >= 0 && tx < MAP_COLS && ty < MAP_ROWS && !isBlockedTile(tileAt(floor, tx, ty));
}

function tileHeuristic(x, y, goalX, goalY) {
  const dx = Math.abs(goalX - x);
  const dy = Math.abs(goalY - y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function unwindPath(node) {
  const path = [];
  for (let current = node; current; current = current.parent) path.push({ x: current.x, y: current.y });
  return path.reverse();
}

function cycleTarget() {
  const me = self();
  if (!me || isTextEntryFocused()) return;
  const candidates = latestState.monsters
    .filter((monster) => monster.floor === me.floor)
    .map((monster) => ({ ...monster, dist: Phaser.Math.Distance.Between(me.x, me.y, monster.x, monster.y) }))
    .sort((a, b) => a.dist - b.dist);
  if (!candidates.length) return;

  const currentIndex = candidates.findIndex((monster) => monster.id === me.targetId);
  const next = candidates[(currentIndex + 1) % candidates.length];
  clearClickDestination();
  send({ type: "target", id: next.id });
}

function isTextEntryFocused() {
  return isTextEntryElement(document.activeElement);
}

function isTextEntryElement(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function stopTextEntryKeyPropagation(event) {
  if (isTextEntryElement(event.target)) event.stopPropagation();
}

function refreshKeyboardCapture() {
  const keyboard = scene?.input?.keyboard;
  if (!keyboard) return;
  if (isTextEntryFocused()) {
    keyboard.disableGlobalCapture();
  } else {
    keyboard.enableGlobalCapture();
  }
}

function drawClickMarker(destination) {
  if (!clickMarker) {
    clickMarker = scene.add.ellipse(0, 0, 22, 12).setStrokeStyle(2, 0x9ee6b1, 0.95);
    fxLayer.add(clickMarker);
  }
  clickMarker.setPosition(destination.x * TILE_SIZE, destination.y * TILE_SIZE + 9);
  clickMarker.setVisible(true);
}

function clearClickDestination() {
  clickDestination = null;
  clickPath = [];
  pendingTreeCut = null;
  pendingAttackTarget = null;
  pendingLootTarget = null;
  pendingNpcTalk = null;
  if (clickMarker) clickMarker.setVisible(false);
}

function addTileDecorations(rows) {
  const decorations = [];
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const tile = rows[y][x];
      if (tile === "r") decorations.push({ key: "spriteRock", x: x + 0.5, y: y + 0.78, w: 38, h: 28 });
      if (tile === "h") decorations.push({ key: "spriteGrave", x: x + 0.5, y: y + 0.95, w: 24, h: 34 });
      if (tile === "q") decorations.push({ key: "spriteFence", x: x + 0.5, y: y + 0.78, w: 46, h: 24 });
      if (["N", "S", "T", "C", ">", "<"].includes(tile)) decorations.push({ key: "spritePortal", x: x + 0.5, y: y + 1.2, w: 34, h: 52 });
    }
  }
  decorations.sort((a, b) => a.y - b.y).forEach(placeMapSprite);
}

function addComposedMapObjects(floor) {
  const southTownObjects = [
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
  const northTownObjects = [
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
  const cemeteryObjects = [
    { key: "spriteCrypt", x: 26, y: 23.1, w: 126, h: 206 },
    { key: "spriteStoneWall", x: 15, y: 6.1, w: 112, h: 54 },
    { key: "spriteStoneWall", x: 36, y: 28.8, w: 112, h: 54 },
    { key: "spriteMausoleum", x: 37.5, y: 17.1, w: 118, h: 150 },
    { key: "spriteDeadTree", x: 10.4, y: 14.8, w: 72, h: 118 },
    { key: "spriteDeadTree", x: 41.2, y: 10.8, w: 66, h: 108 },
    { key: "spriteObelisk", x: 15.8, y: 18.5, w: 38, h: 60 },
    { key: "spriteObelisk", x: 34.3, y: 23.4, w: 34, h: 54 }
  ];
  const cryptObjects = [
    { key: "spriteStoneWall", x: 8, y: 11.1, w: 118, h: 58 },
    { key: "spriteStoneWall", x: 36, y: 9.8, w: 118, h: 58 },
    { key: "spriteObelisk", x: 16.4, y: 18.8, w: 36, h: 58 },
    { key: "spriteObelisk", x: 42.6, y: 23.8, w: 40, h: 64 }
  ];
  const woodsObjects = [
    { key: "spriteTree", x: 8.5, y: 10.4, w: 80, h: 104 },
    { key: "spritePine", x: 14.2, y: 29.8, w: 58, h: 92 },
    { key: "spriteTree", x: 19.5, y: 7.4, w: 76, h: 98 },
    { key: "spritePine", x: 31.3, y: 23.8, w: 56, h: 90 },
    { key: "spriteTree", x: 45.2, y: 15.3, w: 82, h: 106 },
    { key: "spriteRock", x: 18.7, y: 25.2, w: 44, h: 34 },
    { key: "spriteRock", x: 38.5, y: 5.7, w: 48, h: 36 }
  ];

  const objects = {
    0: southTownObjects,
    1: cemeteryObjects,
    2: cryptObjects,
    3: woodsObjects,
    4: northTownObjects
  }[floor] ?? [];
  objects
    .filter((item) => item.key !== "spriteTree" && item.key !== "spritePine")
    .sort((a, b) => a.y - b.y)
    .forEach(placeMapSprite);
}

function placeMapSprite(item) {
  const sprite = scene.add.image(item.x * TILE_SIZE, item.y * TILE_SIZE, item.key).setOrigin(0.5, 1);
  sprite.setDisplaySize(item.w, item.h);
  mapLayer.add(sprite);
  return sprite;
}

function consumeEvents(events) {
  for (const event of events) {
    if (event.type === "system" || event.type === "chat") addChat(event.text);
    if (event.type === "effect" && self()?.floor === event.floor) playCombatEffect(event);
    if ((event.type === "hit" || event.type === "float") && self()?.floor === event.floor) {
      const floater = scene.add.text(event.x * TILE_SIZE, event.y * TILE_SIZE, String(event.text), textStyle(13, event.color ?? "#fff")).setOrigin(0.5);
      floater.life = 1000;
      floaters.push(floater);
      fxLayer.add(floater);
    }
  }
}

function playCombatEffect(event) {
  const targetX = event.x * TILE_SIZE;
  const targetY = event.y * TILE_SIZE - 10;
  const fromX = (event.fromX ?? event.x) * TILE_SIZE;
  const fromY = (event.fromY ?? event.y) * TILE_SIZE - 10;
  const angle = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);

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

function playSlash(x, y, angle) {
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

function playBurst(family, x, y) {
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

function updateFloaters() {
  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const floater = floaters[i];
    floater.y -= 0.45;
    floater.life -= scene.game.loop.delta;
    floater.setAlpha(Math.max(0, floater.life / 1000));
    if (floater.life <= 0) {
      floater.destroy();
      floaters.splice(i, 1);
    }
  }
}

function createActorFrames(scene) {
  const knightRows = { up: 74, right: 202, down: 328, left: 456 };
  const casterRows = { up: 692, right: 818, down: 948, left: 1078 };
  const monsterRows = { up: 48, right: 204, down: 360, left: 516 };
  const knightXs = [330, 456, 582, 708];
  const casterXs = [334, 460, 586, 712];
  const monsterXs = [298, 490, 682, 874];

  createFrameSet(scene, "playerSheet", "knight", knightRows, knightXs, 78, 92);
  createFrameSet(scene, "playerSheet", "caster", casterRows, casterXs, 82, 96);
  createFrameSet(scene, "goblinSheet", "goblin", monsterRows, monsterXs, 118, 106);
  createFrameSet(scene, "skeletonSheet", "skeleton", monsterRows, monsterXs, 118, 106);
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
}

function createEffectFrames(scene) {
  const slashXs = [260, 360, 480, 620, 780, 960];
  slashXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("slash", index), x, 64, 160, 70));

  const missileXs = [184, 276, 386, 506, 626, 760];
  missileXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("fireMissile", index), x, 626, 116, 62));
  missileXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("iceMissile", index), x, 706, 116, 62));

  const burstXs = [1038, 1150, 1246, 1338];
  burstXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("fireMissileBurst", index), x, 618, 96, 82));
  burstXs.forEach((x, index) => makeSpriteTexture(scene, "effectsSheet", effectFrameKey("iceMissileBurst", index), x, 698, 96, 82));
}

function effectFrameKey(family, frame) {
  return `${family}-${frame}`;
}

function createFrameSet(scene, sourceKey, family, rows, xs, width, height) {
  for (const dir of DIRECTIONS) {
    xs.forEach((x, index) => {
      makeTransparentCrop(scene, sourceKey, actorFrameKey(family, dir, index), x, rows[dir], width, height);
    });
  }
}

function createExplicitFrameSet(scene, sourceKey, family, framesByDir) {
  for (const dir of DIRECTIONS) {
    framesByDir[dir].forEach((frame, index) => {
      makeTransparentCrop(scene, sourceKey, actorFrameKey(family, dir, index), frame.x, frame.y, frame.w, frame.h);
    });
  }
}

function spriteFrames(xs, y, w, h) {
  return xs.map((x) => ({ x, y, w, h }));
}

function actorFrameKey(family, dir, frame) {
  const safeDir = DIRECTIONS.includes(dir) ? dir : "down";
  return `${family}-${safeDir}-${frame}`;
}

function actorTextureKey(family, dir, frame) {
  let textureDir = DIRECTIONS.includes(dir) ? dir : "down";
  if (mirrorRightFromLeft(family) && textureDir === "right") textureDir = "left";
  if (mirrorLeftFromRight(family) && textureDir === "left") textureDir = "right";
  return actorFrameKey(family, textureDir, frame);
}

function actorFlipX(family, dir) {
  return (mirrorRightFromLeft(family) && dir === "right") || (mirrorLeftFromRight(family) && dir === "left");
}

function mirrorRightFromLeft(family) {
  return family === "knight" || family === "caster" || family === "goblin" || family === "skeleton";
}

function mirrorLeftFromRight(family) {
  return family === "rat" || family === "spider";
}

function makeTransparentCrop(scene, sourceKey, newKey, sx, sy, sw, sh) {
  const source = scene.textures.get(sourceKey).getSourceImage();
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  chromaKeyMagenta(ctx, sw, sh);
  scene.textures.addCanvas(newKey, canvas);
  scene.textures.get(newKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function makeTileTexture(scene, sourceKey, newKey, sx, sy, sw, sh) {
  const source = scene.textures.get(sourceKey).getSourceImage();
  const sourceCanvas = document.createElement("canvas");
  const inset = Math.min(10, Math.floor(sw / 5), Math.floor(sh / 5));
  const cropW = sw - inset * 2;
  const cropH = sh - inset * 2;
  sourceCanvas.width = cropW;
  sourceCanvas.height = cropH;
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(source, sx + inset, sy + inset, cropW, cropH, 0, 0, cropW, cropH);
  chromaKeyMagenta(sourceCtx, cropW, cropH);

  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, cropW, cropH, 0, 0, TILE_SIZE, TILE_SIZE);
  chromaKeyMagenta(ctx, TILE_SIZE, TILE_SIZE);
  fillTransparentPixels(ctx, TILE_SIZE, TILE_SIZE);
  scene.textures.addCanvas(newKey, canvas);
  scene.textures.get(newKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function makeSpriteTexture(scene, sourceKey, newKey, sx, sy, sw, sh) {
  const source = scene.textures.get(sourceKey).getSourceImage();
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  chromaKeyMagenta(ctx, sw, sh);
  scene.textures.addCanvas(newKey, canvas);
  scene.textures.get(newKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function chromaKeyMagenta(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    if (isMagentaKey(r, g, b)) image.data[i + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);
}

function fillTransparentPixels(ctx, width, height) {
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

function sampleOpaqueColor(image, width, height) {
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
      r += image.data[i];
      g += image.data[i + 1];
      b += image.data[i + 2];
      count += 1;
    }
  }
  if (!count) return { r: 40, g: 90, b: 40 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

function isMagentaKey(r, g, b) {
  return r > 95 && b > 90 && g < 135 && Math.abs(r - b) < 95 && r > g * 1.35 && b > g * 1.25;
}

function addChat(line) {
  chatLines.push(line);
  while (chatLines.length > 9) chatLines.shift();
  dom.chatLog.innerHTML = chatLines.map((item) => `<div>${escapeHtml(item)}</div>`).join("");
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function self() {
  return latestState?.players.find((player) => player.id === selfId);
}

function setBar(bar, label, value, max, prefix) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  bar.style.width = `${pct * 100}%`;
  label.textContent = `${prefix} ${Math.round(value)}/${Math.round(max)}`;
}

function tileColor(tile) {
  return {
    "#": 0x191f1b,
    ".": 0x315f41,
    s: 0x5e7164,
    p: 0x7b7467,
    d: 0x4a3c34,
    c: 0x362f31,
    b: 0x493339,
    r: 0x252320,
    f: 0x223727,
    "~": 0x1f5a74,
    ">": 0xc99a4e,
    "<": 0xc99a4e,
    n: 0xb08954
  }[tile] ?? 0x315f41;
}

function tileBaseTexture(tile) {
  return {
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
  }[tile] ?? "tileGrass";
}

function textStyle(size, color) {
  return {
    fontFamily: "Inter, ui-sans-serif, system-ui",
    fontSize: `${size}px`,
    color,
    stroke: "#101211",
    strokeThickness: 3
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
}

function formatBytes(value) {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 104857.6) / 10}MB`;
}
