import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  CLASSES,
  COMPOSED_TREE_NODES,
  FISHING_NODES,
  ITEMS,
  MAP_COLS,
  MAP_ROWS,
  MONSTERS,
  MONSTER_SPAWNS,
  NPCS,
  QUEST_DROPS,
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
const E2E_TEST = process.env.E2E_TEST === "1";
const SNAPSHOT_RADIUS = 18;
const SNAPSHOT_RADIUS_SQ = SNAPSHOT_RADIUS ** 2;
const TREE_SNAPSHOT_RADIUS = 32;
const TREE_SNAPSHOT_RADIUS_SQ = TREE_SNAPSHOT_RADIUS ** 2;
const METRIC_WINDOW = 60;
const SPATIAL_CELL_SIZE = 8;
const TREE_RESPAWN_MS = 30000;
const FIRE_DURATION_MS = 120000;
const INVENTORY_SIZE = 30;
const QUESTS = {
  southgate: {
    id: "southgate",
    title: "Thin the Cemetery",
    kind: "kill",
    giverId: "cemetery-warden",
    zone: "cemetery",
    targetTypes: new Set(["skeleton", "ghoul"]),
    targetCount: 3,
    rewardGold: 45,
    rewardXp: 60
  },
  pine_logs: {
    id: "pine_logs",
    title: "Pine for the Yards",
    kind: "gather",
    giverId: "lumberjack",
    itemId: "pine_logs",
    targetCount: 5,
    rewardGold: 60,
    rewardXp: 80
  },
  goblin_shaman: {
    id: "goblin_shaman",
    title: "Silence the Shamans",
    kind: "kill",
    giverId: "hunter",
    zone: "woods",
    targetTypes: new Set(["goblin_shaman"]),
    targetCount: 2,
    rewardGold: 90,
    rewardXp: 110
  },
  stolen_goods: {
    id: "stolen_goods",
    title: "Stolen Cargo",
    kind: "fetch",
    giverId: "merchant",
    itemId: "stolen_goods",
    targetCount: 1,
    rewardGold: 75,
    rewardXp: 90
  }
};
mkdirSync(DATA_DIR, { recursive: true });

const db = loadDb();
const clients = new Map();
const monsters = new Map();
const corpses = new Map();
const treeNodes = new Map();
const fires = new Map();
const npcs = new Map();
let spatial = createSpatialIndex();
let nextMonsterId = 1;
let nextCorpseId = 1;
let nextFireId = 1;
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
    if (message.type === "fishNode") fishNode(session.player, String(message.id ?? ""));
    if (message.type === "makeFire") makeFire(session.player, String(message.logItem ?? "logs"));
    if (message.type === "cookFish") cookFish(session.player, String(message.id ?? ""));
    if (E2E_TEST && message.type === "e2eGrantItems") grantE2EItems(session.player, message);
    if (message.type === "eatItem") eatItem(session.player, String(message.item ?? ""));
    if (message.type === "useItem") useItem(session.player, String(message.item ?? ""), message.ctx ?? {});
    if (message.type === "chat") chat(session.player, String(message.text ?? ""));
    if (message.type === "respawn") respawn(session.player);
  });

  socket.on("close", () => {
    const session = clients.get(socket);
    if (session) {
      if (!E2E_TEST || !session.player.name.startsWith("e2e_")) persistPlayer(session.player);
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
  updateFires(now);
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
  player.wellFedUntil = Number(player.wellFedUntil ?? 0);
  player.foodRegenUntil = Number(player.foodRegenUntil ?? 0);

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
    wellFedUntil: 0,
    foodRegenUntil: 0,
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
  player.wellFedUntil = Number(player.wellFedUntil ?? 0);
  player.foodRegenUntil = Number(player.foodRegenUntil ?? 0);
  return player;
}

function updatePlayers(dt, now) {
  for (const session of clients.values()) {
    const { player } = session;
    const input = now - session.lastInputAt > 280 ? sanitizeInput({}) : session.input;
    player.moving = false;
    if (player.dead) continue;
    const spec = CLASSES.adventurer;
    const speed = spec.speed + (isWellFed(player, now) ? 0.25 : 0);

    const hasMoveVector = Math.hypot(Number(input.moveX), Number(input.moveY)) > 0.01;
    let dx = hasMoveVector ? Number(input.moveX) : Number(input.right) - Number(input.left);
    let dy = hasMoveVector ? Number(input.moveY) : Number(input.down) - Number(input.up);
    if (dx || dy) {
      player.action = null;
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      moveEntity(player, dx * speed * dt, dy * speed * dt);
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

    if (now < player.foodRegenUntil && player.hp < player.maxHp) {
      player.hp = clamp(player.hp + dt * 2.8, 0, player.maxHp);
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
  const damage = roll(spec.attackDamage) + skillLevel(player, "attack") + player.weaponTier * SHOP.weapon.damageBonus + wellFedPower(player);
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
  const damage = roll(spec.abilityDamage) + skillLevel(player, "magic") + wellFedPower(player);
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
    items: rollQuestDrops(monster.type)
  };
  corpses.set(corpse.id, corpse);
  event("system", `${player.name} defeated ${catalog.name}.`);
}

function rollQuestDrops(monsterType) {
  const drop = QUEST_DROPS[monsterType];
  if (!drop || Math.random() >= drop.chance) return [];
  return [{ id: drop.itemId, qty: 1 }];
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
  if (item === "fishing_rod" && !hasInventoryItem(player, "fishing_rod") && player.gold >= SHOP.fishing_rod.cost) {
    if (!addInventoryItem(player, "fishing_rod", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP.fishing_rod.cost;
    event("system", `${player.name} bought a fishing rod.`);
  }
  if (item === "flint_steel" && !hasInventoryItem(player, "flint_steel") && player.gold >= SHOP.flint_steel.cost) {
    if (!addInventoryItem(player, "flint_steel", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP.flint_steel.cost;
    event("system", `${player.name} bought flint and steel.`);
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

  const quest = questForGiver(npc.id);
  if (quest) {
    handleQuestDialogue(player, npc, quest);
    return;
  }

  const dialogue = npcDialogueLines(player, npc);
  if (dialogue) eventDialogue(player, dialogue, npc.role === "vendor" ? { opensShop: true } : {});
}

function questForGiver(giverId) {
  return Object.values(QUESTS).find((quest) => quest.giverId === giverId) ?? null;
}

function handleQuestDialogue(player, npc, quest) {
  const state = player.quests[quest.id];
  if (!state) return;

  if (state.claimed) {
    eventDialogue(player, questDialogue(npc, player, quest, "claimed"));
    return;
  }

  if (!state.accepted) {
    state.accepted = true;
    eventDialogue(player, questDialogue(npc, player, quest, "intro"));
    event("float", "Quest accepted", player.x, player.y, player.floor, "#f7d486");
    return;
  }

  const progress = currentQuestProgress(player, quest, state);
  if (progress >= quest.targetCount) {
    if (!consumeQuestTurnIn(player, quest)) {
      eventDialogue(player, questDialogue(npc, player, quest, "missingItems"));
      return;
    }
    state.progress = quest.targetCount;
    state.complete = true;
    state.claimed = true;
    player.gold += quest.rewardGold;
    player.xp += quest.rewardXp;
    awardLevels(player);
    event("system", `${player.name} completed ${quest.title} and earned ${quest.rewardGold} gold.`);
    event("float", `+${quest.rewardGold}g`, player.x, player.y, player.floor, "#ffd166");
    eventDialogue(player, questDialogue(npc, player, quest, "turnIn"));
    return;
  }

  eventDialogue(player, questDialogue(npc, player, quest, "progress", progress));
}

function consumeQuestTurnIn(player, quest) {
  if (quest.kind === "gather" || quest.kind === "fetch") {
    return removeInventoryItem(player, quest.itemId, quest.targetCount);
  }
  return true;
}

function currentQuestProgress(player, quest, state) {
  if (quest.kind === "gather" || quest.kind === "fetch") {
    return clamp(inventoryCount(player, quest.itemId), 0, quest.targetCount);
  }
  return clamp(state.progress, 0, quest.targetCount);
}

function inventoryCount(player, id) {
  return player.inventory.reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0);
}

function questDialogue(npc, player, quest, phase, progress = 0) {
  const itemLabel = quest.itemId ? ITEMS[quest.itemId]?.label ?? quest.itemId : "";
  const lines = {
    southgate: {
      intro: [
        { speaker: npc.name, text: "Southgate Cemetery is restless again. The dead are testing the gate." },
        { speaker: player.name, text: "What do you need from me?" },
        { speaker: npc.name, text: `Defeat ${quest.targetCount} undead beyond the south gate, then return to me.` }
      ],
      progress: [
        { speaker: npc.name, text: "Keep thinning the undead beyond the south gate." },
        { speaker: player.name, text: `${progress}/${quest.targetCount} so far. I will return when it is done.` }
      ],
      turnIn: [
        { speaker: npc.name, text: "Good. The gate breathes easier tonight." },
        { speaker: player.name, text: "I will keep an eye on the road south." }
      ],
      claimed: [
        { speaker: npc.name, text: "The cemetery is quieter because of you." }
      ]
    },
    pine_logs: {
      intro: [
        { speaker: npc.name, text: "The pine yards are stripped and the carpenters are pacing." },
        { speaker: player.name, text: "How many do you need?" },
        { speaker: npc.name, text: `Bring me ${quest.targetCount} ${itemLabel}. Pines grow north past the south road.` }
      ],
      progress: [
        { speaker: npc.name, text: `Still need ${quest.targetCount - progress} more ${itemLabel}.` },
        { speaker: player.name, text: "I am still chopping." }
      ],
      missingItems: [
        { speaker: npc.name, text: `Bring the ${itemLabel} to my hands, not your pack alone.` }
      ],
      turnIn: [
        { speaker: npc.name, text: "Hah, fine timber. The yards will sing tonight." },
        { speaker: player.name, text: "Glad to help." }
      ],
      claimed: [
        { speaker: npc.name, text: "The yards are stocked. I owe you a drink." }
      ]
    },
    goblin_shaman: {
      intro: [
        { speaker: npc.name, text: "Goblin shamans have been chanting at the woodline. Bad omens." },
        { speaker: player.name, text: "Want them silenced?" },
        { speaker: npc.name, text: `Drop ${quest.targetCount} of them in Northwood and come back to me.` }
      ],
      progress: [
        { speaker: npc.name, text: `${progress}/${quest.targetCount} silenced. The woods are still murmuring.` }
      ],
      turnIn: [
        { speaker: npc.name, text: "Quiet at last. Sleep comes easier in town tonight." },
        { speaker: player.name, text: "Call me again if they start up." }
      ],
      claimed: [
        { speaker: npc.name, text: "The woodline is quiet thanks to you." }
      ]
    },
    stolen_goods: {
      intro: [
        { speaker: npc.name, text: "Orcs took my caravan crate north of here. I would pay well to see it back." },
        { speaker: player.name, text: "I will look for it." },
        { speaker: npc.name, text: `Search any orc you find for ${itemLabel}. They hoard such things.` }
      ],
      progress: [
        { speaker: npc.name, text: `Any luck finding the ${itemLabel}?` },
        { speaker: player.name, text: "Not yet. Still hunting." }
      ],
      missingItems: [
        { speaker: npc.name, text: `Find the ${itemLabel} on the orcs first, then come see me.` }
      ],
      turnIn: [
        { speaker: npc.name, text: "My cargo! Bless you, traveler." },
        { speaker: player.name, text: "Safer in your hands than theirs." }
      ],
      claimed: [
        { speaker: npc.name, text: "Trade is moving again thanks to you." }
      ]
    }
  };
  return lines[quest.id]?.[phase] ?? [{ speaker: npc.name, text: npc.dialogue }];
}

function cutTree(player, id) {
  const tree = treeNodes.get(id);
  if (!tree || player.dead || !tree.active || tree.floor !== player.floor || distance(player, tree) > 1.8) return;
  if (!playerHasCapability(player, "chop_tree")) {
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

function fishNode(player, id) {
  const node = FISHING_NODES.find((item) => item.id === id);
  if (!node || player.dead || node.floor !== player.floor || distance(player, fishingApproachPoint(node)) > 1.45) return;
  if (!playerHasCapability(player, "fish")) {
    event("float", "You need a fishing rod.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  const level = skillLevel(player, "fishing");
  player.action = { type: "fishing", nodeId: node.id, nextAt: performance.now() + fishingCatchMs(level), startedAt: performance.now() };
  event("float", "You cast your line.", node.x, node.y, node.floor, "#8fd8ff");
}

// --- Item use dispatcher (Phase 2) ----------------------------------------
// useItem looks up `ITEMS[itemId].use.kind` and dispatches to a verb handler.
// Each verb owns its own validation, consumption, and effects. Authors compose
// items in content/items.yaml; adding a new verb still requires engine work.

const USE_VERBS = {
  eat: useVerbEat,
  drink_potion: useVerbDrinkPotion,
  light_fire: useVerbLightFire,
  cook_on_fire: useVerbCookOnFire
};

function useItem(player, itemId, ctx = {}) {
  if (player.dead) return;
  const item = ITEMS[itemId];
  if (!item?.use) return;
  const verb = USE_VERBS[item.use.kind];
  if (!verb) return;
  verb(player, item, ctx);
}

function applyBuffs(player, buffs, now) {
  for (const buff of buffs ?? []) {
    if (buff.id === "well_fed") player.wellFedUntil = Math.max(player.wellFedUntil ?? 0, now + buff.durationMs);
    if (buff.id === "food_regen") player.foodRegenUntil = Math.max(player.foodRegenUntil ?? 0, now + buff.durationMs);
  }
}

function useVerbEat(player, item) {
  if (!removeInventoryItem(player, item.id, 1)) return;
  const u = item.use;
  if (u.restoreHp) player.hp = clamp(player.hp + u.restoreHp, 0, player.maxHp);
  applyBuffs(player, u.buffs, performance.now());
  if (u.float) event("float", u.float, player.x, player.y, player.floor, "#9ee6b1");
}

function useVerbDrinkPotion(player, item) {
  if (!removeInventoryItem(player, item.id, 1)) return;
  const u = item.use;
  if (u.restoreHp) player.hp = clamp(player.hp + u.restoreHp, 0, player.maxHp);
  event("float", u.float ?? `${player.name} drinks a potion.`, player.x, player.y, player.floor, "#77e0a0");
}

function useVerbLightFire(player, item, ctx) {
  if (!hasInventoryItem(player, item.id)) return;
  const u = item.use;
  const options = u.consumesAny ?? [];
  const preferred = ctx.logItem ? options.find((o) => o.item === ctx.logItem && hasInventoryItem(player, o.item)) : null;
  const choice = preferred ?? options.find((o) => hasInventoryItem(player, o.item));
  if (!choice) return;
  const qty = choice.qty ?? 1;
  if (!removeInventoryItem(player, choice.item, qty)) return;
  const placement = firePlacementAtPlayer(player);
  if (!placement) {
    addInventoryItem(player, choice.item, qty);
    event("float", "No room for a fire.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  const fire = {
    id: `fire-${nextFireId++}`,
    floor: player.floor,
    x: placement.x,
    y: placement.y,
    expiresAt: performance.now() + (u.durationMs ?? FIRE_DURATION_MS),
    owner: player.name
  };
  fires.set(fire.id, fire);
  if (u.skill && choice.xp) addSkillXp(player, u.skill, choice.xp);
  event("effect", "fire", fire.x, fire.y, fire.floor, null, player.id, fire.id);
  event("float", "Fire lit", fire.x, fire.y, fire.floor, "#ffb35c");
}

function useVerbCookOnFire(player, item, ctx) {
  const fire = fires.get(ctx.fireId);
  if (!fire || fire.floor !== player.floor || distance(player, fire) > 1.9) return;
  if (!hasInventoryItem(player, item.id)) return;
  const skill = item.use.skill ?? "cooking";
  player.targetId = null;
  player.action = {
    type: "cooking",
    itemId: item.id,
    fireId: fire.id,
    nextAt: performance.now() + cookingMs(skillLevel(player, skill))
  };
  event("float", "Cooking...", fire.x, fire.y, fire.floor, "#ffcf7a");
}

function makeFire(player, logItem = "logs") {
  useItem(player, "flint_steel", { logItem });
}

function cookFish(player, fireId) {
  useItem(player, "raw_fish", { fireId });
}

function eatItem(player, itemId) {
  if (ITEMS[itemId]?.use?.kind !== "eat") return;
  useItem(player, itemId);
}

function updatePlayerAction(player, now) {
  if (!player.action) return;
  if (player.action.type === "fishing") return updateFishingAction(player, now);
  if (player.action.type === "cooking") return updateCookingAction(player, now);
  if (player.action.type !== "woodcutting") return;
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

function updateFishingAction(player, now) {
  const node = FISHING_NODES.find((item) => item.id === player.action.nodeId);
  if (!node || player.dead || node.floor !== player.floor || distance(player, fishingApproachPoint(node)) > 1.65 || !playerHasCapability(player, "fish")) {
    player.action = null;
    return;
  }
  if (now < player.action.nextAt) return;
  player.action = null;
  if (!addInventoryItem(player, "raw_fish", 1)) {
    event("system", "Your inventory is full.");
    return;
  }
  const xp = 18;
  addSkillXp(player, "fishing", xp);
  event("effect", "fish", node.x, node.y, node.floor, null, player.id, node.id);
  event("float", `+${xp} Fishing`, node.x, node.y, node.floor, "#8fd8ff");
}

function updateCookingAction(player, now) {
  const fire = fires.get(player.action.fireId);
  if (!fire || player.dead || fire.floor !== player.floor || distance(player, fire) > 2) {
    player.action = null;
    return;
  }
  if (now < player.action.nextAt) return;
  const inputId = player.action.itemId ?? "raw_fish";
  const recipe = ITEMS[inputId]?.use ?? {};
  const produces = recipe.produces ?? "cooked_fish";
  const burns = recipe.burns ?? "burnt_fish";
  const skill = recipe.skill ?? "cooking";
  const xp = recipe.xp ?? 22;
  player.action = null;
  if (!removeInventoryItem(player, inputId, 1)) return;
  const level = skillLevel(player, skill);
  const successChance = clamp(0.45 + level * 0.035, 0.45, 0.92);
  const cooked = E2E_TEST || Math.random() < successChance;
  const result = cooked ? produces : burns;
  if (!addInventoryItem(player, result, 1)) {
    addInventoryItem(player, inputId, 1);
    event("system", "Your inventory is full.");
    return;
  }
  if (cooked) addSkillXp(player, skill, xp);
  event("float", cooked ? `+${xp} ${SKILLS[skill]?.label ?? skill}` : "Burnt", fire.x, fire.y, fire.floor, cooked ? "#9ee6b1" : "#a8a29e");
}

function grantE2EItems(player, message) {
  if (!E2E_TEST) return;
  for (const item of message.items ?? []) {
    const id = String(item.id ?? "");
    const qty = Number(item.qty ?? 1);
    if (ITEMS[id]) addInventoryItem(player, id, qty);
  }
  if (Number.isFinite(message.gold)) player.gold = Math.max(0, Math.floor(message.gold));
  if (Number.isFinite(message.floor) && Number.isFinite(message.x) && Number.isFinite(message.y) && canStand(message.floor, message.x, message.y)) {
    player.floor = Math.floor(message.floor);
    player.x = Number(message.x);
    player.y = Number(message.y);
  }
}

function treeTypeSpec(tree) {
  return TREE_TYPES[tree.type] ?? TREE_TYPES.oak;
}

function fishingApproachPoint(node) {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function npcDialogueLines(player, npc) {
  if (npc.role === "vendor") {
    return [
      { speaker: npc.name, text: "Fresh supplies, sharp edges, and the little things that keep you alive." },
      { speaker: player.name, text: "Show me what you have." },
      { speaker: npc.name, text: "Take your time. Good tools pay for themselves out there." }
    ];
  }
  return [
    { speaker: npc.name, text: npc.dialogue },
    { speaker: player.name, text: "I will remember that." }
  ];
}

function eventDialogue(player, lines, extra = {}) {
  event("dialogue", "", null, null, null, null, null, null, { to: player.id, lines, ...extra });
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
    if (npc.role === "quest") {
      npcs.set(npc.id, {
        id: npc.id,
        name: npc.name,
        role: "quest",
        floor: npc.floor,
        x: npc.x,
        y: npc.y,
        homeX: npc.x,
        homeY: npc.y,
        dir: "down",
        moving: false,
        wanderTarget: null,
        wanderNextAt: performance.now() + 1400,
        dialogue: npc.dialogue
      });
    } else {
      npcs.set(npc.id, {
        id: npc.id,
        name: npc.name,
        role: npc.role,
        floor: npc.floor,
        x: npc.x,
        y: npc.y,
        dir: "down",
        moving: false,
        dialogue: npc.dialogue
      });
    }
  }
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
  for (const npc of npcs.values()) {
    if (npc.homeX == null) continue;
    npc.moving = false;
    if (now >= npc.wanderNextAt && !npc.wanderTarget) {
      npc.wanderTarget = pickNpcWanderTarget(npc);
      npc.wanderNextAt = now + roll([1800, 4200]);
    }
    if (!npc.wanderTarget) continue;
    const dist = distance(npc, npc.wanderTarget);
    if (dist < 0.18) {
      npc.wanderTarget = null;
      continue;
    }
    moveEntity(npc, ((npc.wanderTarget.x - npc.x) / dist) * 1.35 * dt, ((npc.wanderTarget.y - npc.y) / dist) * 1.35 * dt);
  }
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

function updateFires(now) {
  for (const [id, fire] of fires) {
    if (now >= fire.expiresAt) fires.delete(id);
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
  return Math.floor(skillLevel(player, "defense") / 3) + player.armorTier * SHOP.armor.armorBonus + wellFedPower(player);
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

  const visibleFishingNodes = FISHING_NODES
    .filter((node) => inInterestRange(viewer, node))
    .map(serializeFishingNode);
  const visibleFires = [...fires.values()]
    .filter((fire) => inInterestRange(viewer, fire))
    .map(serializeFire);

  return {
    type: "state",
    players,
    monsters: visibleMonsters,
    corpses: visibleCorpses,
    npcs: visibleNpcs,
    trees: visibleTrees,
    fishingNodes: visibleFishingNodes,
    fires: visibleFires,
    events: events.filter((item) => eventVisibleTo(viewer, item)),
    metrics: {
      clients: clients.size,
      monsters: monsters.size,
      zone: zoneAt(viewer.floor, viewer.x, viewer.y),
      visiblePlayers: players.length,
      visibleMonsters: visibleMonsters.length,
      visibleCorpses: visibleCorpses.length,
      visibleTrees: visibleTrees.length,
      visibleFishingNodes: visibleFishingNodes.length,
      visibleFires: visibleFires.length,
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
    action: player.action ? { type: player.action.type, treeId: player.action.treeId, nodeId: player.action.nodeId, fireId: player.action.fireId } : null,
    buffs: serializeBuffs(player),
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

function serializeFishingNode(node) {
  return {
    id: node.id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    approachX: node.approachX,
    approachY: node.approachY,
    label: "Fishing spot"
  };
}

function serializeFire(fire) {
  return {
    id: fire.id,
    floor: fire.floor,
    x: fire.x,
    y: fire.y,
    remainingMs: Math.max(0, Math.round(fire.expiresAt - performance.now()))
  };
}

function serializeBuffs(player) {
  const now = performance.now();
  return {
    wellFed: Math.max(0, Math.round((player.wellFedUntil ?? 0) - now)),
    foodRegen: Math.max(0, Math.round((player.foodRegenUntil ?? 0) - now))
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
  if (item.to && item.to !== viewer.id) return false;
  if (item.type === "chat" || item.type === "system") return true;
  if (item.type === "dialogue") return true;
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
    wellFedUntil: player.wellFedUntil ?? 0,
    foodRegenUntil: player.foodRegenUntil ?? 0,
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
  for (const quest of Object.values(QUESTS)) {
    if (quest.kind !== "kill") continue;
    const state = player.quests[quest.id];
    if (!state || !state.accepted || state.claimed || state.complete) continue;
    if (monster.zone !== quest.zone || !quest.targetTypes.has(monster.type)) continue;
    state.progress = clamp(state.progress + 1, 0, quest.targetCount);
    if (state.progress >= quest.targetCount) {
      state.complete = true;
      event("float", `${quest.title} ready to turn in`, player.x, player.y, player.floor, "#f7d486");
    }
  }
}

function serializeQuests(player) {
  return Object.values(QUESTS).map((quest) => {
    const state = player.quests[quest.id] ?? { accepted: false, progress: 0, complete: false, claimed: false };
    const progress = state.claimed
      ? quest.targetCount
      : (quest.kind === "gather" || quest.kind === "fetch")
        ? clamp(inventoryCount(player, quest.itemId), 0, quest.targetCount)
        : clamp(state.progress, 0, quest.targetCount);
    return {
      id: quest.id,
      title: quest.title,
      kind: quest.kind,
      giverId: quest.giverId,
      accepted: state.accepted,
      progress,
      target: quest.targetCount,
      complete: state.claimed || progress >= quest.targetCount,
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
    return { id: item.id, label: spec.label, icon: spec.icon, iconUrl: spec.iconUrl, qty: item.qty };
  });
}

function hasInventoryItem(player, id) {
  return player.inventory.some((item) => item?.id === id && item.qty > 0);
}

function playerHasCapability(player, capability) {
  for (const slot of player.inventory) {
    if (!slot || slot.qty <= 0) continue;
    const spec = ITEMS[slot.id];
    if (spec?.capabilities?.includes(capability)) return true;
  }
  return false;
}

function addInventoryItem(player, id, qty = 1) {
  if (!ITEMS[id]) return false;
  let remaining = Math.max(1, Math.floor(qty));
  const stackable = ITEMS[id].stackable !== false;
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

function removeInventoryItem(player, id, qty = 1) {
  let remaining = Math.max(1, Math.floor(qty));
  const available = player.inventory.reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0);
  if (available < remaining) return false;
  for (const item of player.inventory) {
    if (!item || item.id !== id) continue;
    const taken = Math.min(item.qty, remaining);
    item.qty -= taken;
    remaining -= taken;
    if (remaining <= 0) break;
  }
  if (remaining > 0) return false;
  for (let i = 0; i < player.inventory.length; i += 1) {
    if (player.inventory[i]?.qty <= 0) player.inventory[i] = null;
  }
  return true;
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
    iconUrl: SKILLS[id]?.iconUrl ?? null,
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

function fishingCatchMs(level) {
  return clamp(3600 - (level - 1) * 80, 1600, 3600);
}

function cookingMs(level) {
  if (E2E_TEST) return 150;
  return clamp(2800 - (level - 1) * 55, 1300, 2800);
}

function firePlacementAtPlayer(player) {
  if (!canStand(player.floor, player.x, player.y) || fireTooClose(player.floor, player.x, player.y)) return null;
  return { x: player.x, y: player.y };
}

function fireTooClose(floor, x, y) {
  return [...fires.values()].some((fire) => fire.floor === floor && Math.hypot(fire.x - x, fire.y - y) < 1.2);
}

function isWellFed(player, now = performance.now()) {
  return now < (player.wellFedUntil ?? 0);
}

function wellFedPower(player) {
  return isWellFed(player) ? 2 : 0;
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
