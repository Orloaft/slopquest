import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  CLASSES,
  MAP_COLS,
  MAP_ROWS,
  MONSTERS,
  MONSTER_SPAWNS,
  NPCS,
  SKILLS,
  SHOP,
  START,
  TREE_TYPES,
  isBlockedTile,
  isSafeZone,
  makeFloorTiles,
  portalFor,
  tileAt,
  xpForLevel,
  zoneAt
} from "../src/shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SAVE_FILE = join(DATA_DIR, "players.json");
const PORT = Number(process.env.PORT ?? 8787);
const SNAPSHOT_RADIUS = 18;
const SNAPSHOT_RADIUS_SQ = SNAPSHOT_RADIUS ** 2;
const TREE_SNAPSHOT_RADIUS = 32;
const TREE_SNAPSHOT_RADIUS_SQ = TREE_SNAPSHOT_RADIUS ** 2;
const METRIC_WINDOW = 60;
const SPATIAL_CELL_SIZE = 8;
const TREE_RESPAWN_MS = 30000;
const INVENTORY_SIZE = 30;
const ITEMS = {
  axe: { id: "axe", label: "Bronze Axe", icon: "A" },
  logs: { id: "logs", label: "Oak Logs", icon: "L" },
  pine_logs: { id: "pine_logs", label: "Pine Logs", icon: "P" },
  potion: { id: "potion", label: "Health Potion", icon: "P" }
};
const COMPOSED_TREE_NODES = [
  { floor: 0, x: 12.8, y: 10.7, type: "oak" },
  { floor: 0, x: 36.2, y: 17.4, type: "oak" },
  { floor: 0, x: 20.2, y: 31.6, type: "pine" },
  { floor: 3, x: 8.5, y: 10.4, type: "oak" },
  { floor: 3, x: 11.5, y: 18.8, type: "pine" },
  { floor: 3, x: 14.2, y: 29.8, type: "pine" },
  { floor: 3, x: 19.5, y: 7.4, type: "oak" },
  { floor: 3, x: 23.4, y: 27.2, type: "pine" },
  { floor: 3, x: 28.8, y: 9.6, type: "pine" },
  { floor: 3, x: 31.3, y: 23.8, type: "pine" },
  { floor: 3, x: 38.6, y: 17.8, type: "pine" },
  { floor: 3, x: 45.2, y: 15.3, type: "oak" },
  { floor: 4, x: 9, y: 9.5, type: "oak" },
  { floor: 4, x: 44, y: 30.2, type: "pine" }
];
const QUESTS = {
  southgate: {
    id: "southgate",
    title: "Thin the Cemetery",
    giverId: "cemetery-warden",
    zone: "cemetery",
    targetTypes: new Set(["skeleton", "ghoul"]),
    targetCount: 3,
    rewardGold: 45,
    rewardXp: 60
  }
};

mkdirSync(DATA_DIR, { recursive: true });

const db = loadDb();
const clients = new Map();
const monsters = new Map();
const corpses = new Map();
const treeNodes = new Map();
const npcs = new Map();
let spatial = createSpatialIndex();
let nextMonsterId = 1;
let nextCorpseId = 1;
const events = [];
const metrics = {
  tickSamples: [],
  snapshotSamples: [],
  bytesOutThisSecond: 0,
  bytesOutPerSecond: 0,
  lastBytesAt: performance.now()
};
let saveQueued = false;
let saveInFlight = false;

for (const spawn of MONSTER_SPAWNS) {
  spawnMonster(spawn);
}
spawnNpcs();
spawnTreeNodes();

const wss = new WebSocketServer({ port: PORT });
console.log(`Waystone server listening on ws://0.0.0.0:${PORT}`);

wss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const session = clients.get(socket);
    if (message.type === "characters") return sendCharacterRoster(socket);
    if (message.type === "deleteCharacter") return deleteCharacter(socket, String(message.name ?? ""));
    if (message.type === "join") return joinWorld(socket, message);
    if (!session) return;

    if (message.type === "input") {
      session.input = sanitizeInput(message.input);
      session.lastInputAt = performance.now();
    }
    if (message.type === "target") setTarget(session.player, message.id);
    if (message.type === "ability") useAbility(session.player, String(message.slot ?? "1"));
    if (message.type === "loot") lootAdjacent(session.player);
    if (message.type === "lootCorpse") lootCorpse(session.player, String(message.id ?? ""));
    if (message.type === "buy") buyItem(session.player, String(message.item ?? ""));
    if (message.type === "talkNpc") talkNpc(session.player, String(message.id ?? ""));
    if (message.type === "cutTree") cutTree(session.player, String(message.id ?? ""));
    if (message.type === "chat") chat(session.player, String(message.text ?? ""));
    if (message.type === "respawn") respawn(session.player);
  });

  socket.on("close", () => {
    const session = clients.get(socket);
    if (session) {
      persistPlayer(session.player);
      clients.delete(socket);
      event("system", `${session.player.name} left the world.`);
    }
  });

  socket.on("error", () => {
    socket.close();
  });
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  const started = performance.now();
  updatePlayers(dt, now);
  updateNpcs(dt, now);
  updateTreeNodes(now);
  rebuildSpatialIndex();
  updateMonsters(dt, now);
  recordSample(metrics.tickSamples, performance.now() - started);
}, 50);

setInterval(() => {
  const started = performance.now();
  broadcastState();
  recordSample(metrics.snapshotSamples, performance.now() - started);
  events.length = 0;
}, 50);

setInterval(() => {
  persistOnlinePlayers();
}, 10000);

setInterval(() => {
  for (const { socket } of clients.values()) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 15000);

function joinWorld(socket, message) {
  const name = cleanName(message.name);
  const saved = db.players[name.toLowerCase()];
  const player = saved && !message.fresh ? hydratePlayer(saved) : createPlayer(name);
  player.id = crypto.randomUUID();
  player.online = true;
  player.targetId = null;
  player.lastAttack = 0;
  player.cooldowns = { ability: 0 };
  player.action = null;
  player.portalReadyAt = 0;
  player.dead = player.hp <= 0;

  clients.set(socket, { socket, player, input: sanitizeInput({}), lastInputAt: performance.now() });
  socket.send(JSON.stringify({ type: "welcome", id: player.id, maps: [0, 1, 2, 3, 4] }));
  event("system", `${player.name} entered the world.`);
}

function sendCharacterRoster(socket) {
  const characters = Object.values(db.players)
    .map((player) => ({
      name: player.name,
      level: Number(player.level ?? 1),
      gold: Number(player.gold ?? 0),
      updatedAt: player.updatedAt ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  socket.send(JSON.stringify({ type: "characters", characters }));
}

function deleteCharacter(socket, rawName) {
  const name = cleanName(rawName);
  const key = name.toLowerCase();
  const online = [...clients.values()].some((session) => session.player.name.toLowerCase() === key);
  if (!db.players[key] || online) {
    socket.send(JSON.stringify({ type: "characterDeleted", ok: false, name }));
    return;
  }
  delete db.players[key];
  queueSave();
  socket.send(JSON.stringify({ type: "characterDeleted", ok: true, name }));
  sendCharacterRoster(socket);
}

function createPlayer(name) {
  const spec = CLASSES.adventurer;
  return {
    id: "",
    name,
    classKey: "adventurer",
    floor: START.floor,
    x: START.x,
    y: START.y,
    dir: "down",
    moving: false,
    level: 1,
    xp: 0,
    hp: spec.maxHp,
    mana: spec.maxMana,
    maxHp: spec.maxHp,
    maxMana: spec.maxMana,
    gold: 30,
    potions: 2,
    weaponTier: 0,
    armorTier: 0,
    inventory: createInventory(),
    quests: createQuestState(),
    skills: createSkillState()
  };
}

function hydratePlayer(saved) {
  const player = { ...createPlayer(saved.name), ...saved, classKey: "adventurer" };
  player.skills = normalizeSkillState(player.skills);
  recalculateVitals(player);
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.mana = clamp(player.mana, 0, player.maxMana);
  player.quests = normalizeQuestState(player.quests);
  player.inventory = normalizeInventory(player.inventory);
  return player;
}

function updatePlayers(dt, now) {
  for (const session of clients.values()) {
    const { player } = session;
    const input = now - session.lastInputAt > 280 ? sanitizeInput({}) : session.input;
    player.moving = false;
    if (player.dead) continue;
    const spec = CLASSES.adventurer;

    const hasMoveVector = Math.hypot(Number(input.moveX), Number(input.moveY)) > 0.01;
    let dx = hasMoveVector ? Number(input.moveX) : Number(input.right) - Number(input.left);
    let dy = hasMoveVector ? Number(input.moveY) : Number(input.down) - Number(input.up);
    if (dx || dy) {
      player.action = null;
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      moveEntity(player, dx * spec.speed * dt, dy * spec.speed * dt);
    }

    const portal = now >= player.portalReadyAt ? portalFor(player.floor, player.x, player.y) : null;
    if (portal) {
      player.floor = portal.floor;
      player.x = portal.x;
      player.y = portal.y;
      player.portalReadyAt = now + 650;
      player.targetId = null;
      event("system", `${player.name} changes depth.`);
    }

    player.mana = clamp(player.mana + dt * 2.5, 0, player.maxMana);
    autoAttack(player, now);
    updatePlayerAction(player, now);
  }
}

function updateMonsters(dt, now) {
  for (const monster of monsters.values()) {
    monster.moving = false;
    if (monster.deadUntil) {
      if (now >= monster.deadUntil) respawnMonster(monster);
      continue;
    }
    const catalog = MONSTERS[monster.type];
    const target = nearestPlayer(monster, catalog.aggro);
    if (!target || isSafeZone(target.floor, target.x, target.y)) {
      wanderMonster(monster, catalog, dt, now);
      continue;
    }

    const dist = distance(monster, target);
    if (dist > catalog.range) {
      const dx = (target.x - monster.x) / dist;
      const dy = (target.y - monster.y) / dist;
      moveEntity(monster, dx * catalog.speed * dt, dy * catalog.speed * dt);
    }

    if (dist <= catalog.range + 0.15 && now - monster.lastAttack >= catalog.attackMs) {
      monster.lastAttack = now;
      const damage = roll(catalog.damage) - armorReduction(target);
      damagePlayer(target, Math.max(1, damage), monster.name);
    }
  }
}

function autoAttack(player, now) {
  const monster = monsters.get(player.targetId);
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  const spec = CLASSES.adventurer;
  if (distance(player, monster) > spec.range) return;
  if (now - player.lastAttack < spec.attackMs) return;
  player.lastAttack = now;
  const damage = roll(spec.attackDamage) + skillLevel(player, "attack") + player.weaponTier * SHOP.weapon.damageBonus;
  addSkillXp(player, "attack", Math.max(1, Math.floor(damage * 1.5)));
  damageMonster(player, monster, damage, "hit");
}

function useAbility(player, slot) {
  if (player.dead) return;
  if (slot === "2") {
    if (player.potions <= 0 || player.hp >= player.maxHp) return;
    player.potions -= 1;
    player.hp = clamp(player.hp + SHOP.potion.heal, 0, player.maxHp);
    event("float", `${player.name} drinks a potion.`, player.x, player.y, player.floor, "#77e0a0");
    return;
  }

  const now = performance.now();
  const spec = CLASSES.adventurer;
  const monster = monsters.get(player.targetId);
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  if (distance(player, monster) > spec.magicRange) return;
  if (now < player.cooldowns.ability) return;
  if (player.mana < spec.abilityCost) return;

  player.cooldowns.ability = now + spec.abilityMs;
  player.mana -= spec.abilityCost;
  const damage = roll(spec.abilityDamage) + skillLevel(player, "magic");
  addSkillXp(player, "magic", Math.max(1, Math.floor(damage * 1.8)));
  damageMonster(player, monster, damage, "flare");
}

function damageMonster(player, monster, damage, kind) {
  monster.hp = clamp(monster.hp - damage, 0, monster.maxHp);
  event("effect", kind, monster.x, monster.y, monster.floor, null, player.id, monster.id, { fromX: player.x, fromY: player.y });
  event("hit", damage, monster.x, monster.y - 0.45, monster.floor, kind === "flare" ? "#8fd8ff" : "#ffd166", player.id, monster.id);
  if (monster.hp > 0) return;

  const catalog = MONSTERS[monster.type];
  monster.deadUntil = performance.now() + (monster.type === "boss" ? 45000 : 18000);
  player.xp += catalog.xp;
  updateQuestProgress(player, monster);
  awardLevels(player);

  const corpse = {
    id: `c${nextCorpseId++}`,
    floor: monster.floor,
    x: monster.x,
    y: monster.y,
    gold: roll(catalog.gold),
    potions: Math.random() < 0.18 || monster.type === "boss" ? 1 : 0,
    label: catalog.name,
    kind: "corpse",
    items: []
  };
  corpses.set(corpse.id, corpse);
  event("system", `${player.name} defeated ${catalog.name}.`);
}

function damagePlayer(player, damage, source) {
  player.hp = clamp(player.hp - damage, 0, player.maxHp);
  addSkillXp(player, "defense", Math.max(1, damage));
  event("hit", damage, player.x, player.y - 0.55, player.floor, "#ff6b6b", source);
  if (player.hp > 0) return;
  player.dead = true;
  player.targetId = null;
  event("system", `${player.name} was brought down by ${source}.`);
}

function lootAdjacent(player) {
  if (player.dead) return;
  let found = 0;
  for (const corpse of [...corpses.values()]) {
    if (corpse.floor !== player.floor || distance(player, corpse) > 1.6) continue;
    found += 1;
    collectCorpse(player, corpse);
  }
  if (found) event("float", `Looted ${found} corpse${found > 1 ? "s" : ""}.`, player.x, player.y, player.floor, "#ffd166");
}

function lootCorpse(player, id) {
  if (player.dead) return;
  const corpse = corpses.get(id);
  if (!corpse || corpse.floor !== player.floor || distance(player, corpse) > 2) return;
  collectCorpse(player, corpse);
  event("float", `Looted ${corpse.label}.`, player.x, player.y, player.floor, "#ffd166");
}

function collectCorpse(player, corpse) {
  for (const item of corpse.items ?? []) {
    if (!addInventoryItem(player, item.id, item.qty)) {
      event("system", "Your inventory is full.");
      return;
    }
  }
  player.gold += corpse.gold;
  player.potions += corpse.potions;
  corpses.delete(corpse.id);
  removeFromSpatial(spatial.corpses, corpse);
}

function buyItem(player, item) {
  if (player.dead || distance(player, NPCS[0]) > 2 || player.floor !== NPCS[0].floor) return;
  if (item === "weapon" && player.weaponTier === 0 && player.gold >= SHOP.weapon.cost) {
    player.gold -= SHOP.weapon.cost;
    player.weaponTier = 1;
    event("system", `${player.name} bought a better weapon.`);
  }
  if (item === "armor" && player.armorTier === 0 && player.gold >= SHOP.armor.cost) {
    player.gold -= SHOP.armor.cost;
    player.armorTier = 1;
    event("system", `${player.name} bought padded mail.`);
  }
  if (item === "potion" && player.gold >= SHOP.potion.cost) {
    player.gold -= SHOP.potion.cost;
    player.potions += 1;
    addInventoryItem(player, "potion", 1);
  }
  if (item === "axe" && !hasInventoryItem(player, "axe") && player.gold >= SHOP.axe.cost) {
    if (!addInventoryItem(player, "axe", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP.axe.cost;
    event("system", `${player.name} bought a bronze axe.`);
  }
}

function respawn(player) {
  if (!player.dead) return;
  player.floor = START.floor;
  player.x = START.x;
  player.y = START.y;
  player.portalReadyAt = performance.now() + 650;
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.dead = false;
  event("system", `${player.name} returns to the temple.`);
}

function setTarget(player, id) {
  const monster = monsters.get(String(id));
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  player.targetId = monster.id;
}

function chat(player, text) {
  const clean = text.trim().slice(0, 120);
  if (!clean) return;
  event("chat", `${player.name}: ${clean}`);
}

function talkNpc(player, id) {
  const npc = npcs.get(id);
  if (!npc || player.dead || npc.floor !== player.floor || distance(player, npc) > 2.4) return;

  if (npc.id === QUESTS.southgate.giverId) {
    const state = player.quests.southgate;
    if (!state.accepted) {
      state.accepted = true;
      event("system", `${npc.name}: Southgate Cemetery is restless. Defeat ${QUESTS.southgate.targetCount} undead and return stronger.`);
      event("float", "Quest accepted", player.x, player.y, player.floor, "#f7d486");
      return;
    }
    if (state.claimed) {
      event("system", `${npc.name}: The cemetery is quieter because of you.`);
      return;
    }
    event("system", `${npc.name}: Keep thinning the undead beyond the south gate.`);
    return;
  }

  event("system", `${npc.name}: ${npc.dialogue}`);
}

function cutTree(player, id) {
  const tree = treeNodes.get(id);
  if (!tree || player.dead || !tree.active || tree.floor !== player.floor || distance(player, tree) > 1.8) return;
  if (!hasInventoryItem(player, "axe")) {
    event("float", "You need an axe.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  const treeSpec = treeTypeSpec(tree);
  const level = skillLevel(player, "woodcutting");
  if (level < treeSpec.requiredLevel) {
    event("float", `Requires Woodcutting ${treeSpec.requiredLevel}.`, tree.x, tree.y, tree.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  player.action = { type: "woodcutting", treeId: tree.id, nextAt: performance.now(), swings: 0, remaining: treeSpec.chopsRequired };
  event("float", `You start chopping ${treeSpec.label}.`, tree.x, tree.y, tree.floor, "#d8c68a");
}

function updatePlayerAction(player, now) {
  if (!player.action || player.action.type !== "woodcutting") return;
  const tree = treeNodes.get(player.action.treeId);
  if (!tree || player.dead || !tree.active || tree.floor !== player.floor || distance(player, tree) > 1.9) {
    player.action = null;
    return;
  }
  if (now < player.action.nextAt) return;

  player.action.swings += 1;
  const treeSpec = treeTypeSpec(tree);
  const level = skillLevel(player, "woodcutting");
  player.action.nextAt = now + woodcutSwingMs(level, treeSpec);
  const angle = Math.atan2(tree.y - player.y, tree.x - player.x);
  event("effect", "chop", tree.x, tree.y - 0.35, tree.floor, null, player.id, tree.id, { fromX: player.x, fromY: player.y, angle });
  player.action.remaining -= woodcutPower(level, treeSpec);
  if (player.action.remaining > 0) {
    if (player.action.swings % 3 === 0) event("float", "Chop", tree.x, tree.y, tree.floor, "#d8c68a");
    return;
  }

  tree.active = false;
  tree.respawnAt = performance.now() + TREE_RESPAWN_MS;
  player.action = null;
  addSkillXp(player, "woodcutting", treeSpec.xp);
  dropItem(tree.floor, tree.x + 0.12, tree.y, [{ id: treeSpec.itemId, qty: 1 }], treeSpec.dropLabel);
  event("float", `+${treeSpec.xp} Woodcutting`, tree.x, tree.y, tree.floor, "#9ee6b1");
}

function treeTypeSpec(tree) {
  return TREE_TYPES[tree.type] ?? TREE_TYPES.oak;
}

function woodcutSwingMs(level, treeSpec) {
  const aboveRequirement = Math.max(0, level - treeSpec.requiredLevel);
  return clamp(treeSpec.baseSwingMs - aboveRequirement * 75, treeSpec.minSwingMs, treeSpec.baseSwingMs);
}

function woodcutPower(level, treeSpec) {
  return 1 + Math.floor(Math.max(0, level - treeSpec.requiredLevel) / 8);
}

function dropItem(floor, x, y, items, label) {
  const drop = {
    id: `c${nextCorpseId++}`,
    floor,
    x,
    y,
    gold: 0,
    potions: 0,
    label,
    kind: "drop",
    items
  };
  corpses.set(drop.id, drop);
  addToSpatial(spatial.corpses, drop);
}

function spawnNpcs() {
  for (const npc of NPCS) {
    npcs.set(npc.id, {
      ...npc,
      role: npc.id === "trader" ? "vendor" : "guide",
      dir: "down",
      moving: false,
      dialogue: npc.id === "trader" ? "Need supplies? Stand close and open the shop." : "Northwatch is quiet for now."
    });
  }
  npcs.set("cemetery-warden", {
    id: "cemetery-warden",
    name: "Mira Gravewatch",
    role: "quest",
    floor: 0,
    x: 18.5,
    y: 18.5,
    homeX: 18.5,
    homeY: 18.5,
    dir: "down",
    moving: false,
    wanderTarget: null,
    wanderNextAt: performance.now() + 1400,
    dialogue: "Southgate Cemetery is restless."
  });
}

function spawnTreeNodes() {
  for (let floor = 0; floor <= 4; floor += 1) {
    const rows = makeFloorTiles(floor);
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < rows[y].length; x += 1) {
        if (rows[y][x] !== "f") continue;
        const id = `tree-${floor}-${x}-${y}`;
        treeNodes.set(id, { id, floor, tileX: x, tileY: y, x: x + 0.5, y: y + 0.95, type: treeTypeForTile(floor, x, y), active: true, respawnAt: 0 });
      }
    }
  }
  for (const tree of COMPOSED_TREE_NODES) {
    const id = `tree-composed-${tree.floor}-${String(tree.x).replace(".", "_")}-${String(tree.y).replace(".", "_")}`;
    treeNodes.set(id, { id, floor: tree.floor, tileX: Math.floor(tree.x), tileY: Math.floor(tree.y), x: tree.x, y: tree.y, type: tree.type, active: true, respawnAt: 0 });
  }
}

function treeTypeForTile(floor, x, y) {
  const value = (floor * 73856093) ^ (x * 19349663) ^ (y * 83492791);
  if (floor === 3 && Math.abs(value) % 3 === 0) return "pine";
  if (floor === 4 && Math.abs(value) % 4 === 0) return "pine";
  return "oak";
}

function updateNpcs(dt, now) {
  const npc = npcs.get("cemetery-warden");
  if (!npc) return;
  npc.moving = false;
  if (now >= npc.wanderNextAt && !npc.wanderTarget) {
    npc.wanderTarget = pickNpcWanderTarget(npc);
    npc.wanderNextAt = now + roll([1800, 4200]);
  }
  if (!npc.wanderTarget) return;
  const dist = distance(npc, npc.wanderTarget);
  if (dist < 0.18) {
    npc.wanderTarget = null;
    return;
  }
  moveEntity(npc, ((npc.wanderTarget.x - npc.x) / dist) * 1.35 * dt, ((npc.wanderTarget.y - npc.y) / dist) * 1.35 * dt);
}

function pickNpcWanderTarget(npc) {
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1 + Math.random() * 4;
    const x = clamp(npc.homeX + Math.cos(angle) * radius, 10, 28);
    const y = clamp(npc.homeY + Math.sin(angle) * radius, 13, 22);
    if (canStand(npc.floor, x, y)) return { x, y };
  }
  return null;
}

function updateTreeNodes(now) {
  for (const tree of treeNodes.values()) {
    if (!tree.active && now >= tree.respawnAt) tree.active = true;
  }
}

function spawnMonster(spawn) {
  const catalog = MONSTERS[spawn.type];
  const monster = {
    id: `m${nextMonsterId++}`,
    spawn,
    type: spawn.type,
    floor: spawn.floor,
    x: spawn.x + 0.5,
    y: spawn.y + 0.5,
    hp: catalog.maxHp,
    maxHp: catalog.maxHp,
    dir: "down",
    moving: false,
    lastAttack: 0,
    deadUntil: 0,
    homeX: spawn.x + 0.5,
    homeY: spawn.y + 0.5,
    zone: spawn.zone ?? zoneAt(spawn.floor, spawn.x + 0.5, spawn.y + 0.5),
    wanderTarget: null,
    wanderNextAt: performance.now() + roll([800, 2800])
  };
  monsters.set(monster.id, monster);
}

function respawnMonster(monster) {
  const catalog = MONSTERS[monster.type];
  monster.floor = monster.spawn.floor;
  monster.x = monster.spawn.x + 0.5;
  monster.y = monster.spawn.y + 0.5;
  monster.hp = catalog.maxHp;
  monster.maxHp = catalog.maxHp;
  monster.deadUntil = 0;
  monster.wanderTarget = null;
  monster.wanderNextAt = performance.now() + roll([1000, 3500]);
}

function wanderMonster(monster, catalog, dt, now) {
  if (now >= monster.wanderNextAt && !monster.wanderTarget) {
    monster.wanderTarget = pickWanderTarget(monster);
    monster.wanderNextAt = now + roll([2200, 5200]);
  }

  if (!monster.wanderTarget) return;
  const dist = distance(monster, monster.wanderTarget);
  if (dist < 0.25) {
    monster.wanderTarget = null;
    return;
  }

  const dx = (monster.wanderTarget.x - monster.x) / dist;
  const dy = (monster.wanderTarget.y - monster.y) / dist;
  moveEntity(monster, dx * catalog.speed * 0.34 * dt, dy * catalog.speed * 0.34 * dt);
}

function pickWanderTarget(monster) {
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.2 + Math.random() * 4.5;
    const x = clamp(monster.homeX + Math.cos(angle) * radius, 1.5, MAP_COLS - 1.5);
    const y = clamp(monster.homeY + Math.sin(angle) * radius, 1.5, MAP_ROWS - 1.5);
    if (zoneAt(monster.floor, x, y) !== monster.zone) continue;
    if (canStand(monster.floor, x, y)) return { x, y };
  }
  return null;
}

function moveEntity(entity, dx, dy) {
  const oldX = entity.x;
  const oldY = entity.y;
  if (dx || dy) {
    entity.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }
  const nextX = clamp(entity.x + dx, 0.5, MAP_COLS - 0.5);
  if (canStand(entity.floor, nextX, entity.y)) entity.x = nextX;
  const nextY = clamp(entity.y + dy, 0.5, MAP_ROWS - 0.5);
  if (canStand(entity.floor, entity.x, nextY)) entity.y = nextY;
  entity.moving = Math.hypot(entity.x - oldX, entity.y - oldY) > 0.001;
}

function canStand(floor, x, y) {
  const checks = [
    [x - 0.28, y - 0.28],
    [x + 0.28, y - 0.28],
    [x - 0.28, y + 0.28],
    [x + 0.28, y + 0.28]
  ];
  return checks.every(([cx, cy]) => !isBlockedTile(tileAt(floor, Math.floor(cx), Math.floor(cy))));
}

function nearestPlayer(monster, maxDistance) {
  let best = null;
  let bestDist = maxDistance;
  for (const player of querySpatial(spatial.players, monster.floor, monster.x, monster.y, maxDistance)) {
    if (player.dead || player.floor !== monster.floor) continue;
    const dist = distance(monster, player);
    if (dist < bestDist) {
      best = player;
      bestDist = dist;
    }
  }
  return best;
}

function awardLevels(player) {
  while (player.xp >= xpForLevel(player.level + 1)) {
    player.level += 1;
    recalculateVitals(player);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    event("system", `${player.name} reached level ${player.level}.`);
  }
}

function armorReduction(player) {
  return Math.floor(skillLevel(player, "defense") / 3) + player.armorTier * SHOP.armor.armorBonus;
}

function broadcastState() {
  updateByteMetric();
  rebuildSpatialIndex();
  for (const session of clients.values()) {
    const { socket, player } = session;
    if (socket.readyState !== socket.OPEN) continue;

    const snapshot = buildSnapshotFor(player);
    const raw = JSON.stringify(snapshot);
    metrics.bytesOutThisSecond += Buffer.byteLength(raw);
    socket.send(raw);
  }
}

function buildSnapshotFor(viewer) {
  const players = [];
  for (const player of querySpatial(spatial.players, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (player.id !== viewer.id && !inInterestRange(viewer, player)) continue;
    players.push(serializePlayer(player));
  }

  const visibleMonsters = [];
  for (const monster of querySpatial(spatial.monsters, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (monster.deadUntil || !inInterestRange(viewer, monster)) continue;
    visibleMonsters.push(serializeMonster(monster));
  }

  const visibleCorpses = [];
  for (const corpse of querySpatial(spatial.corpses, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (!inInterestRange(viewer, corpse)) continue;
    visibleCorpses.push(corpse);
  }

  const visibleNpcs = [];
  for (const npc of querySpatial(spatial.npcs, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (!inInterestRange(viewer, npc)) continue;
    visibleNpcs.push(serializeNpc(npc));
  }

  const visibleTrees = [];
  for (const tree of querySpatial(spatial.trees, viewer.floor, viewer.x, viewer.y, TREE_SNAPSHOT_RADIUS)) {
    if (!inTreeInterestRange(viewer, tree)) continue;
    visibleTrees.push(serializeTree(tree));
  }

  return {
    type: "state",
    players,
    monsters: visibleMonsters,
    corpses: visibleCorpses,
    npcs: visibleNpcs,
    trees: visibleTrees,
    events: events.filter((item) => eventVisibleTo(viewer, item)),
    metrics: {
      clients: clients.size,
      monsters: monsters.size,
      zone: zoneAt(viewer.floor, viewer.x, viewer.y),
      visiblePlayers: players.length,
      visibleMonsters: visibleMonsters.length,
      visibleCorpses: visibleCorpses.length,
      visibleTrees: visibleTrees.length,
      spatialCells: spatial.cellCount,
      tickMs: round(avg(metrics.tickSamples)),
      snapshotMs: round(avg(metrics.snapshotSamples)),
      bytesOutPerSecond: metrics.bytesOutPerSecond
    }
  };
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    classKey: player.classKey,
    floor: player.floor,
    x: round(player.x),
    y: round(player.y),
    dir: player.dir,
    moving: player.moving,
    hp: Math.round(player.hp),
    maxHp: player.maxHp,
    mana: Math.round(player.mana),
    maxMana: player.maxMana,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    potions: player.potions,
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    targetId: player.targetId,
    dead: player.dead,
    action: player.action ? { type: player.action.type, treeId: player.action.treeId } : null,
    inventory: serializeInventory(player.inventory),
    quests: serializeQuests(player),
    skills: serializeSkills(player)
  };
}

function serializeMonster(monster) {
  return {
    id: monster.id,
    type: monster.type,
    name: MONSTERS[monster.type].name,
    floor: monster.floor,
    x: round(monster.x),
    y: round(monster.y),
    dir: monster.dir,
    moving: monster.moving,
    hp: Math.round(monster.hp),
    maxHp: monster.maxHp,
    zone: monster.zone
  };
}

function serializeNpc(npc) {
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role,
    floor: npc.floor,
    x: round(npc.x),
    y: round(npc.y),
    dir: npc.dir,
    moving: npc.moving,
    dialogue: npc.dialogue
  };
}

function serializeTree(tree) {
  const spec = treeTypeSpec(tree);
  return {
    id: tree.id,
    type: tree.type,
    label: spec.label,
    requiredLevel: spec.requiredLevel,
    floor: tree.floor,
    x: tree.x,
    y: tree.y,
    active: tree.active
  };
}

function inInterestRange(viewer, entity) {
  if (viewer.floor !== entity.floor) return false;
  return distanceSq(viewer, entity) <= SNAPSHOT_RADIUS_SQ;
}

function inTreeInterestRange(viewer, entity) {
  if (viewer.floor !== entity.floor) return false;
  return distanceSq(viewer, entity) <= TREE_SNAPSHOT_RADIUS_SQ;
}

function eventVisibleTo(viewer, item) {
  if (item.type === "chat" || item.type === "system") return true;
  if (item.floor === null || item.x === null || item.y === null) return true;
  return inInterestRange(viewer, item);
}

function persistPlayerToDb(player) {
  db.players[player.name.toLowerCase()] = {
    name: player.name,
    classKey: player.classKey,
    floor: player.floor,
    x: player.x,
    y: player.y,
    level: player.level,
    xp: player.xp,
    hp: player.hp,
    mana: player.mana,
    gold: player.gold,
    potions: player.potions,
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    inventory: serializeInventory(player.inventory),
    quests: normalizeQuestState(player.quests),
    skills: normalizeSkillState(player.skills),
    updatedAt: new Date().toISOString()
  };
}

function persistPlayer(player) {
  persistPlayerToDb(player);
  queueSave();
}

function persistOnlinePlayers() {
  for (const session of clients.values()) persistPlayerToDb(session.player);
  queueSave();
}

function loadDb() {
  if (!existsSync(SAVE_FILE)) return { players: {} };
  try {
    return JSON.parse(readFileSync(SAVE_FILE, "utf8"));
  } catch {
    return { players: {} };
  }
}

function queueSave() {
  saveQueued = true;
  void flushSaveQueue();
}

async function flushSaveQueue() {
  if (saveInFlight || !saveQueued) return;
  saveQueued = false;
  saveInFlight = true;
  try {
    await writeFile(SAVE_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Failed to save player data:", error);
  } finally {
    saveInFlight = false;
    if (saveQueued) void flushSaveQueue();
  }
}

function sanitizeInput(input) {
  const moveX = clamp(Number(input?.moveX ?? 0), -1, 1);
  const moveY = clamp(Number(input?.moveY ?? 0), -1, 1);
  const hasMoveVector = Number.isFinite(moveX) && Number.isFinite(moveY) && Math.hypot(moveX, moveY) > 0.01;
  return {
    up: Boolean(input?.up),
    down: Boolean(input?.down),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    moveX: hasMoveVector ? moveX : 0,
    moveY: hasMoveVector ? moveY : 0
  };
}

function cleanName(name) {
  return String(name ?? "wanderer").trim().replace(/[^\w -]/g, "").slice(0, 18) || "wanderer";
}

function createQuestState() {
  return Object.fromEntries(
    Object.values(QUESTS).map((quest) => [quest.id, { accepted: false, progress: 0, complete: false, claimed: false }])
  );
}

function normalizeQuestState(saved = {}) {
  const quests = createQuestState();
  for (const [id, state] of Object.entries(saved)) {
    if (!quests[id]) continue;
    quests[id] = {
      accepted: Boolean(state.accepted) || Boolean(state.progress) || Boolean(state.complete) || Boolean(state.claimed),
      progress: clamp(Number(state.progress ?? 0), 0, QUESTS[id].targetCount),
      complete: Boolean(state.complete),
      claimed: Boolean(state.claimed)
    };
  }
  return quests;
}

function updateQuestProgress(player, monster) {
  const quest = QUESTS.southgate;
  const state = player.quests[quest.id];
  if (!state || !state.accepted || state.claimed || monster.zone !== quest.zone || !quest.targetTypes.has(monster.type)) return;

  state.progress = clamp(state.progress + 1, 0, quest.targetCount);
  if (state.progress < quest.targetCount) return;

  state.complete = true;
  state.claimed = true;
  player.gold += quest.rewardGold;
  player.xp += quest.rewardXp;
  event("system", `${player.name} completed ${quest.title} and earned ${quest.rewardGold} gold.`);
}

function serializeQuests(player) {
  return Object.values(QUESTS).map((quest) => {
    const state = player.quests[quest.id] ?? { progress: 0, complete: false, claimed: false };
    return {
      id: quest.id,
      title: quest.title,
      accepted: state.accepted,
      progress: state.progress,
      target: quest.targetCount,
      complete: state.complete,
      claimed: state.claimed,
      rewardGold: quest.rewardGold,
      rewardXp: quest.rewardXp
    };
  });
}

function createSkillState() {
  return Object.fromEntries(Object.keys(SKILLS).map((id) => [id, { xp: 0 }]));
}

function createInventory() {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

function normalizeInventory(saved = []) {
  const inventory = createInventory();
  if (!Array.isArray(saved)) return inventory;
  saved.slice(0, INVENTORY_SIZE).forEach((item, index) => {
    const id = String(item?.id ?? "");
    if (!ITEMS[id]) return;
    inventory[index] = { id, qty: Math.max(1, Math.floor(Number(item.qty ?? 1))) };
  });
  return inventory;
}

function serializeInventory(inventory = []) {
  return normalizeInventory(inventory).map((item) => {
    if (!item) return null;
    const spec = ITEMS[item.id];
    return { id: item.id, label: spec.label, icon: spec.icon, qty: item.qty };
  });
}

function hasInventoryItem(player, id) {
  return player.inventory.some((item) => item?.id === id && item.qty > 0);
}

function addInventoryItem(player, id, qty = 1) {
  if (!ITEMS[id]) return false;
  let remaining = Math.max(1, Math.floor(qty));
  const stackable = id !== "axe";
  if (stackable) {
    const existing = player.inventory.find((item) => item?.id === id);
    if (existing) {
      existing.qty += remaining;
      return true;
    }
  }
  for (let i = 0; i < player.inventory.length && remaining > 0; i += 1) {
    if (player.inventory[i]) continue;
    player.inventory[i] = { id, qty: stackable ? remaining : 1 };
    remaining -= stackable ? remaining : 1;
  }
  return remaining === 0;
}

function normalizeSkillState(saved = {}) {
  const skills = createSkillState();
  for (const id of Object.keys(skills)) {
    skills[id].xp = Math.max(0, Number(saved[id]?.xp ?? 0));
  }
  return skills;
}

function serializeSkills(player) {
  return Object.entries(player.skills).map(([id, state]) => ({
    id,
    label: SKILLS[id]?.label ?? id,
    xp: Math.floor(state.xp),
    level: skillLevel(player, id),
    nextXp: xpForLevel(skillLevel(player, id) + 1)
  }));
}

function skillLevel(player, id) {
  return Math.max(1, levelForXp(player.skills[id]?.xp ?? 0));
}

function addSkillXp(player, id, amount) {
  if (!player.skills[id]) player.skills[id] = { xp: 0 };
  const before = skillLevel(player, id);
  player.skills[id].xp += amount;
  const after = skillLevel(player, id);
  if (after > before) event("system", `${player.name} reached ${SKILLS[id].label} ${after}.`);
  if (id === "defense" || id === "magic") recalculateVitals(player);
}

function levelForXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

function recalculateVitals(player) {
  const spec = CLASSES.adventurer;
  player.maxHp = spec.maxHp + (skillLevel(player, "defense") - 1) * spec.hpPerDefense;
  player.maxMana = spec.maxMana + (skillLevel(player, "magic") - 1) * spec.manaPerMagic;
}

function createSpatialIndex() {
  return { players: new Map(), monsters: new Map(), corpses: new Map(), npcs: new Map(), trees: new Map(), cellCount: 0 };
}

function rebuildSpatialIndex() {
  spatial = createSpatialIndex();
  for (const { player } of clients.values()) addToSpatial(spatial.players, player);
  for (const monster of monsters.values()) {
    if (!monster.deadUntil) addToSpatial(spatial.monsters, monster);
  }
  for (const corpse of corpses.values()) addToSpatial(spatial.corpses, corpse);
  for (const npc of npcs.values()) addToSpatial(spatial.npcs, npc);
  for (const tree of treeNodes.values()) addToSpatial(spatial.trees, tree);
  spatial.cellCount = spatial.players.size + spatial.monsters.size + spatial.corpses.size + spatial.npcs.size + spatial.trees.size;
}

function addToSpatial(index, entity) {
  const key = spatialKey(entity.floor, entity.x, entity.y);
  const bucket = index.get(key) ?? [];
  bucket.push(entity);
  index.set(key, bucket);
}

function removeFromSpatial(index, entity) {
  const key = spatialKey(entity.floor, entity.x, entity.y);
  const bucket = index.get(key);
  if (!bucket) return;
  const next = bucket.filter((item) => item !== entity);
  if (next.length) index.set(key, next);
  else index.delete(key);
}

function querySpatial(index, floor, x, y, radius) {
  const minCx = Math.floor((x - radius) / SPATIAL_CELL_SIZE);
  const maxCx = Math.floor((x + radius) / SPATIAL_CELL_SIZE);
  const minCy = Math.floor((y - radius) / SPATIAL_CELL_SIZE);
  const maxCy = Math.floor((y + radius) / SPATIAL_CELL_SIZE);
  const results = [];
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const bucket = index.get(`${floor}:${cx}:${cy}`);
      if (bucket) results.push(...bucket);
    }
  }
  return results;
}

function spatialKey(floor, x, y) {
  return `${floor}:${Math.floor(x / SPATIAL_CELL_SIZE)}:${Math.floor(y / SPATIAL_CELL_SIZE)}`;
}

function event(type, text, x = null, y = null, floor = null, color = null, from = null, target = null, extra = {}) {
  events.push({ type, text, x, y, floor, color, from, target, t: Date.now(), ...extra });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function recordSample(samples, value) {
  samples.push(value);
  while (samples.length > METRIC_WINDOW) samples.shift();
}

function avg(samples) {
  if (!samples.length) return 0;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function updateByteMetric() {
  const now = performance.now();
  if (now - metrics.lastBytesAt < 1000) return;
  metrics.bytesOutPerSecond = metrics.bytesOutThisSecond;
  metrics.bytesOutThisSecond = 0;
  metrics.lastBytesAt = now;
}

function roll([min, max]) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
