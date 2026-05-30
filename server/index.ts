import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import type { WebSocket, RawData } from "ws";
import {
  ABILITIES,
  CLASSES,
  CLASS_UNLOCKS,
  COMPOSED_TREE_NODES,
  FISHING_NODES,
  MINING_NODES,
  HERB_NODES,
  ITEMS,
  MONSTERS,
  MONSTER_SPAWNS,
  NPCS,
  QUEST_DROPS,
  QUESTS,
  SKILLS,
  SHOP,
  START,
  TREE_TYPES,
  dodgeChanceFor,
  floorCols,
  floorRows,
  isBlockedTile,
  isSightBlocked,
  isSafeZone,
  makeFloorTiles,
  portalFor,
  tileAt,
  xpForLevel,
  zoneAt
} from "../src/shared.ts";
import type { ClassSpec } from "../src/shared.ts";
import type {
  Item,
  MonsterSpawn,
  Quest,
  QuestDialogue,
  Range,
  TreeType
} from "../src/content-types.ts";
import type {
  AbilityView,
  ActionView,
  BuffsView,
  CharacterSummary,
  ClientMessage,
  CorpseView,
  Direction,
  DialogueLineView,
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
  StateSnapshot,
  TreeView,
  UseItemCtx
} from "../src/types.ts";
import type {
  Corpse,
  Database,
  ExtWebSocket,
  Fire,
  InventorySlot,
  Metrics,
  NpcRuntime,
  PlayerAction,
  Positioned,
  QuestState,
  SavedPlayer,
  HerbNodeRuntime,
  ServerMonster,
  ServerPlayer,
  Session,
  SkillStateEntry,
  SpatialIndex,
  TreeNodeRuntime,
  Vec2
} from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SAVE_FILE = join(DATA_DIR, "players.json");
const PORT = Number(process.env.PORT ?? 8787);
const E2E_TEST = process.env.E2E_TEST === "1";
// Dev/playtest cheats via the `/dev` chat command. On under E2E or `TIB_DEV=1`
// (see the `dev:tools` npm script). Keep off for normal multiplayer sessions.
const DEV_TOOLS = E2E_TEST || process.env.TIB_DEV === "1";
const SNAPSHOT_RADIUS = 18;
const SNAPSHOT_RADIUS_SQ = SNAPSHOT_RADIUS ** 2;
const TREE_SNAPSHOT_RADIUS = 32;
const TREE_SNAPSHOT_RADIUS_SQ = TREE_SNAPSHOT_RADIUS ** 2;
const METRIC_WINDOW = 60;
const SPATIAL_CELL_SIZE = 8;
const TREE_RESPAWN_MS = 30000;
const HERB_RESPAWN_MS = 25000;
const HERB_GATHER_MS = 2600;
const FIRE_DURATION_MS = 120000;
const INVENTORY_SIZE = 30;
const BREW_XP = 30;
// Encumbrance: at/below the soft cap you move at full speed; past it, speed
// falls off linearly to MIN_ENCUMBRANCE_MULT at the hard cap.
const WEIGHT_SOFT_CAP = 40;
const WEIGHT_HARD_CAP = 90;
const MIN_ENCUMBRANCE_MULT = 0.55;
const RANGED_RANGE = 5;
const FORAGE_XP = 12;
mkdirSync(DATA_DIR, { recursive: true });

const ADVENTURER: ClassSpec = CLASSES["adventurer"]!;

const db: Database = loadDb();
const clients = new Map<ExtWebSocket, Session>();
const monsters = new Map<string, ServerMonster>();
const corpses = new Map<string, Corpse>();
const treeNodes = new Map<string, TreeNodeRuntime>();
const herbNodes = new Map<string, HerbNodeRuntime>();
const fires = new Map<string, Fire>();
const npcs = new Map<string, NpcRuntime>();
let spatial: SpatialIndex = createSpatialIndex();
let nextMonsterId = 1;
let nextCorpseId = 1;
let nextFireId = 1;
const events: GameEvent[] = [];
const metrics: Metrics = {
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
spawnHerbNodes();

const wss = new WebSocketServer({ port: PORT });
console.log(`Waystone server listening on ws://0.0.0.0:${PORT}`);

wss.on("connection", (rawSocket: WebSocket) => {
  const socket = rawSocket as ExtWebSocket;
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw: RawData) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
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
    if (message.type === "ability") useAbility(session.player);
    if (message.type === "useClassAbility") useClassAbility(session.player, String(message.id ?? ""));
    if (message.type === "loot") lootAdjacent(session.player);
    if (message.type === "lootCorpse") lootCorpse(session.player, String(message.id ?? ""));
    if (message.type === "buy") buyItem(session.player, String(message.item ?? ""));
    if (message.type === "talkNpc") talkNpc(session.player, String(message.id ?? ""));
    if (message.type === "cutTree") cutTree(session.player, String(message.id ?? ""));
    if (message.type === "fishNode") fishNode(session.player, String(message.id ?? ""));
    if (message.type === "mineNode") mineNode(session.player, String(message.id ?? ""));
    if (message.type === "gatherHerb") gatherHerb(session.player, String(message.id ?? ""));
    if (message.type === "brewPotion") brewPotion(session.player);
    if (message.type === "setClass") setClass(session.player, String(message.classKey ?? ""));
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

function joinWorld(socket: ExtWebSocket, message: { type: "join"; name: string; fresh?: boolean }): void {
  const name = cleanName(message.name);
  const saved = db.players[name.toLowerCase()];
  const player = saved && !message.fresh ? hydratePlayer(saved) : createPlayer(name);
  player.id = crypto.randomUUID();
  player.online = true;
  player.targetId = null;
  player.lastAttack = 0;
  player.cooldowns = { ability: 0 };
  player.abilityCooldowns = {};
  player.abilityBuffs = {};
  player.action = null;
  player.portalReadyAt = 0;
  player.dead = player.hp <= 0;
  player.wellFedUntil = Number(player.wellFedUntil ?? 0);
  player.foodRegenUntil = Number(player.foodRegenUntil ?? 0);

  clients.set(socket, { socket, player, input: sanitizeInput({}), lastInputAt: performance.now() });
  socket.send(JSON.stringify({ type: "welcome", id: player.id, maps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }));
  event("system", `${player.name} entered the world.`);
}

function sendCharacterRoster(socket: ExtWebSocket): void {
  const characters: CharacterSummary[] = Object.values(db.players)
    .map((player) => ({
      name: player.name,
      level: Number(player.level ?? 1),
      gold: Number(player.gold ?? 0),
      updatedAt: player.updatedAt ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  socket.send(JSON.stringify({ type: "characters", characters }));
}

function deleteCharacter(socket: ExtWebSocket, rawName: string): void {
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

function createPlayer(name: string): ServerPlayer {
  const spec = ADVENTURER;
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
    weaponTier: 0,
    armorTier: 0,
    wellFedUntil: 0,
    foodRegenUntil: 0,
    inventory: createInventory(),
    quests: createQuestState(),
    skills: createSkillState(),
    online: false,
    targetId: null,
    lastAttack: 0,
    cooldowns: { ability: 0 },
    abilityCooldowns: {},
    abilityBuffs: {},
    action: null,
    portalReadyAt: 0,
    dead: false,
    unlockedClasses: []
  };
}

function hydratePlayer(saved: SavedPlayer): ServerPlayer {
  const player = { ...createPlayer(saved.name), ...saved } as ServerPlayer;
  player.unlockedClasses = Array.isArray(saved.unlockedClasses)
    ? saved.unlockedClasses.filter((key) => CLASSES[key] && key !== "adventurer")
    : [];
  // Only keep an equipped class the player still has unlocked; otherwise revert.
  player.classKey =
    saved.classKey && (saved.classKey === "adventurer" || player.unlockedClasses.includes(saved.classKey))
      ? saved.classKey
      : "adventurer";
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

function updatePlayers(dt: number, now: number): void {
  for (const session of clients.values()) {
    const { player } = session;
    const input = now - session.lastInputAt > 280 ? sanitizeInput({}) : session.input;
    player.moving = false;
    if (player.dead) continue;
    const spec = classOf(player);
    let speed = spec.speed + (isWellFed(player, now) ? 0.25 : 0);
    speed *= encumbranceMultiplier(carriedWeight(player));
    if (now < (player.abilityBuffs?.sprint?.until ?? 0)) {
      speed *= ABILITIES["sprint"]?.speedMultiplier ?? 1;
    } else if (player.abilityBuffs?.sprint) {
      delete player.abilityBuffs.sprint;
    }
    if (now < (player.abilityBuffs?.fleetFoot?.until ?? 0)) {
      speed *= 1.25;
    } else if (player.abilityBuffs?.fleetFoot) {
      delete player.abilityBuffs.fleetFoot;
    }
    if (now < (player.abilityBuffs?.ironClad?.until ?? 0)) {
      speed *= 0.85;
    } else if (player.abilityBuffs?.ironClad) {
      delete player.abilityBuffs.ironClad;
    }
    if (player.slowUntil && now < player.slowUntil) {
      speed *= player.slowMult ?? 1;
    } else if (player.slowUntil) {
      player.slowUntil = 0;
    }

    const hasMoveVector = Math.hypot(Number(input.moveX), Number(input.moveY)) > 0.01;
    let dx = hasMoveVector ? Number(input.moveX) : Number(input.right) - Number(input.left);
    let dy = hasMoveVector ? Number(input.moveY) : Number(input.down) - Number(input.up);
    if ((dx || dy) && !isStunned(player)) {
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
    } else if (now >= player.portalReadyAt && tileAt(player.floor, Math.floor(player.x), Math.floor(player.y)) === "K") {
      // The sealed Jungle Vault — a Tier-1 dungeon hook (no instance yet).
      player.portalReadyAt = now + 4000;
      event("float", "The Jungle Vault is sealed... for now.", player.x, player.y - 0.6, player.floor, "#c8e6a0");
    }

    if (now < player.foodRegenUntil && player.hp < player.maxHp) {
      player.hp = clamp(player.hp + dt * 2.8, 0, player.maxHp);
    }
    const secondWind = player.abilityBuffs?.second_wind;
    if (secondWind && now < secondWind.until) {
      player.hp = clamp(player.hp + secondWind.healPerMs * dt * 1000, 0, player.maxHp);
    } else if (secondWind) {
      delete player.abilityBuffs.second_wind;
    }
    player.mana = clamp(player.mana + dt * 2.5, 0, player.maxMana);
    autoAttack(player, now);
    updatePlayerAction(player, now);
  }
}

function updateMonsters(dt: number, now: number): void {
  for (const monster of monsters.values()) {
    monster.moving = false;
    if (monster.deadUntil) {
      if (now >= monster.deadUntil) respawnMonster(monster);
      continue;
    }
    const catalog = MONSTERS[monster.type];
    if (!catalog) continue;

    // Hidden burrower (Dust Burrower): inert and invisible until a player steps
    // adjacent, then it bursts out for heavy damage + a stun.
    if (monster.hidden) {
      const victim = nearestPlayer(monster, 1.3);
      if (victim && !victim.dead && !isSafeZone(victim.floor, victim.x, victim.y)) {
        monster.hidden = false;
        monster.lastAttack = now;
        const burst = Math.max(1, roll(catalog.damage) - armorReduction(victim));
        event("effect", "hit", monster.x, monster.y, monster.floor, "#d9a441", monster.id, victim.id);
        event("float", "Ambush!", monster.x, monster.y - 0.6, monster.floor, "#f0b24a");
        damagePlayer(victim, burst, catalog.name);
        if (catalog.stunMs) applyPlayerStun(victim, catalog.stunMs);
      }
      continue; // stays buried (and unrendered) until triggered
    }

    tickMonsterStatus(monster, now);
    if (monster.deadUntil) continue; // burn may have killed it this tick

    // Taunt (Provoke) overrides aggro to the taunting player while it lasts.
    let target = nearestPlayer(monster, catalog.aggro);
    if (monster.tauntUntil && now < monster.tauntUntil && monster.tauntBy) {
      const taunter = playerById(monster.tauntBy);
      if (taunter && !taunter.dead && taunter.floor === monster.floor && !isSafeZone(taunter.floor, taunter.x, taunter.y)) {
        target = taunter;
      }
    }
    // Pack alert: honor a partner's call even if the player is out of aggro range.
    if (!target && monster.alertUntil && now < monster.alertUntil && monster.alertTarget) {
      const ally = playerById(monster.alertTarget);
      if (ally && !ally.dead && ally.floor === monster.floor && !isSafeZone(ally.floor, ally.x, ally.y)) target = ally;
    }
    // Pack hunters: an aggroed member alerts nearby same-type members to the kill.
    if (catalog.pack && target && !isSafeZone(target.floor, target.x, target.y)) {
      for (const other of monsters.values()) {
        if (other === monster || other.deadUntil || other.hidden || other.type !== monster.type || other.floor !== monster.floor) continue;
        if (distance(monster, other) <= 8) {
          other.alertUntil = now + 5000;
          other.alertTarget = target.id;
        }
      }
    }
    if (!target || isSafeZone(target.floor, target.x, target.y)) {
      if (!(monster.freezeUntil && now < monster.freezeUntil) && !(monster.snareUntil && now < monster.snareUntil)) {
        wanderMonster(monster, catalog, dt, now);
      }
      continue;
    }

    const frozen = Boolean(monster.freezeUntil && now < monster.freezeUntil);
    const snared = Boolean(monster.snareUntil && now < monster.snareUntil);
    const dist = distance(monster, target);

    // Ranged turret (Mire Spitter): anchored, fires a slowing projectile on sight.
    if (catalog.ranged) {
      if (!frozen && dist <= catalog.range && now - monster.lastAttack >= catalog.attackMs && hasLineOfSight(monster.floor, monster.x, monster.y, target.x, target.y)) {
        monster.lastAttack = now;
        const shot = Math.max(1, roll(catalog.damage) - armorReduction(target));
        if (rollDodge(target)) {
          addSkillXp(target, "agility", Math.max(1, shot));
          event("float", "Dodge!", target.x, target.y - 0.55, target.floor, "#a0e8ff");
        } else {
          event("projectile", "spit", target.x, target.y, target.floor, "#9ad36b", monster.id, target.id, { fromX: monster.x, fromY: monster.y });
          damagePlayer(target, shot, catalog.name);
          if (catalog.slowPct) applyPlayerSlow(target, catalog.slowPct, catalog.slowMs ?? 1500);
          if (catalog.weakenPct) applyPlayerWeaken(target, catalog.weakenPct, catalog.weakenMs ?? 4000);
        }
      }
      continue; // anchored — never chases or melees
    }

    if (dist > catalog.range && !frozen && !snared) {
      const dx = (target.x - monster.x) / dist;
      const dy = (target.y - monster.y) / dist;
      moveEntity(monster, dx * catalog.speed * dt, dy * catalog.speed * dt);
    }

    if (!frozen && dist <= catalog.range + 0.15 && now - monster.lastAttack >= catalog.attackMs) {
      monster.lastAttack = now;
      // Gas cloud (Volatile Flask) makes the monster miss sometimes.
      if (monster.inaccurateUntil && now < monster.inaccurateUntil && Math.random() < 0.2) {
        event("float", "Miss", monster.x, monster.y - 0.5, monster.floor, "#a8a29e");
        continue;
      }
      const damage = Math.max(1, roll(catalog.damage) - armorReduction(target));
      if (rollDodge(target)) {
        addSkillXp(target, "agility", Math.max(1, damage));
        event("float", "Dodge!", target.x, target.y - 0.55, target.floor, "#a0e8ff");
        continue;
      }
      damagePlayer(target, damage, catalog.name);
    }
  }
}

// Apply per-tick status effects (currently the burning DoT) and let it kill.
function tickMonsterStatus(monster: ServerMonster, now: number): void {
  if (monster.burnUntil && now < monster.burnUntil && monster.burnNextAt && now >= monster.burnNextAt) {
    monster.burnNextAt = now + 1000;
    const burner = monster.burnBy ? playerById(monster.burnBy) : null;
    const dmg = monster.burnPerTick ?? 0;
    if (burner && dmg > 0) damageMonster(burner, monster, dmg, "flare");
  } else if (monster.burnUntil && now >= monster.burnUntil) {
    monster.burnUntil = 0;
  }
}

function playerById(id: string): ServerPlayer | null {
  for (const session of clients.values()) {
    if (session.player.id === id) return session.player;
  }
  return null;
}

function autoAttack(player: ServerPlayer, now: number): void {
  if (isStunned(player)) return;
  const monster = player.targetId == null ? undefined : monsters.get(player.targetId);
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  const spec = ADVENTURER;
  const ranged = playerHasCapability(player, "ranged");
  const dist = distance(player, monster);
  if (ranged) {
    // Bow attack: fire up to RANGED_RANGE tiles with clear line of sight.
    if (dist > RANGED_RANGE) return;
    if (now - player.lastAttack < spec.attackMs) return;
    if (!hasLineOfSight(player.floor, player.x, player.y, monster.x, monster.y)) return;
    player.lastAttack = now;
    const damage = Math.max(1, Math.round((roll([6, 11]) + skillLevel(player, "ranged") + wellFedPower(player)) * physicalMult(player)));
    addSkillXp(player, "ranged", Math.max(1, Math.floor(damage * 1.5)));
    fireProjectile(player, monster, damage, "arrow");
    return;
  }
  if (dist > spec.range) return;
  if (now - player.lastAttack < spec.attackMs) return;
  player.lastAttack = now;
  const damage = Math.max(1, Math.round((roll(spec.attackDamage) + skillLevel(player, "attack") + player.weaponTier * (SHOP["weapon"]!.damageBonus ?? 0) + wellFedPower(player)) * physicalMult(player)));
  addSkillXp(player, "attack", Math.max(1, Math.floor(damage * 1.5)));
  damageMonster(player, monster, damage, "hit");
}

function useAbility(player: ServerPlayer): void {
  if (player.dead || isStunned(player)) return;
  const now = performance.now();
  const spec = ADVENTURER;
  const monster = player.targetId == null ? undefined : monsters.get(player.targetId);
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

const DIR_VECTORS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function monstersInRadius(floor: number, cx: number, cy: number, radius: number): ServerMonster[] {
  const hits: ServerMonster[] = [];
  for (const monster of monsters.values()) {
    if (monster.deadUntil || monster.floor !== floor) continue;
    if (Math.hypot(monster.x - cx, monster.y - cy) <= radius) hits.push(monster);
  }
  return hits;
}

function applyBurn(player: ServerPlayer, monster: ServerMonster, durationMs: number, perTick: number): void {
  const now = performance.now();
  monster.burnUntil = now + durationMs;
  monster.burnPerTick = perTick;
  monster.burnNextAt = now + 1000;
  monster.burnBy = player.id;
}

// Move the player up to `tiles` tiles along their facing, stopping before the
// first blocked tile or occupied monster tile.
function dashPlayer(player: ServerPlayer, tiles: number): void {
  const dir = DIR_VECTORS[player.dir];
  const startX = Math.floor(player.x);
  const startY = Math.floor(player.y);
  let destX = player.x;
  let destY = player.y;
  for (let step = 1; step <= tiles; step += 1) {
    const tx = startX + dir.x * step;
    const ty = startY + dir.y * step;
    if (isBlockedTile(tileAt(player.floor, tx, ty))) break;
    const occupied = [...monsters.values()].some(
      (m) => !m.deadUntil && m.floor === player.floor && Math.floor(m.x) === tx && Math.floor(m.y) === ty
    );
    if (occupied) break;
    destX = tx + 0.5;
    destY = ty + 0.5;
  }
  player.x = destX;
  player.y = destY;
}

function useClassAbility(player: ServerPlayer, id: string): void {
  if (player.dead || isStunned(player)) return;
  const spec = ABILITIES[id];
  if (!spec) return;
  const classSpec = CLASSES[player.classKey ?? "adventurer"] ?? CLASSES["adventurer"]!;
  if (!classSpec.abilities?.includes(id)) return;
  const now = performance.now();
  if (!player.abilityCooldowns) player.abilityCooldowns = {};
  if (!player.abilityBuffs) player.abilityBuffs = {};
  if (now < (player.abilityCooldowns[id] ?? 0)) return;
  const manaCost = spec.manaCost ?? 0;

  // --- Vanguard: Provoke — taunt nearby monsters onto the player. ---
  if (id === "provoke") {
    if (player.mana < manaCost) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    const taunted = monstersInRadius(player.floor, player.x, player.y, 1.8);
    for (const monster of taunted) {
      monster.tauntUntil = now + spec.durationMs;
      monster.tauntBy = player.id;
    }
    event("effect", "flare", player.x, player.y, player.floor, "#ffcf6b", player.id);
    event("float", taunted.length ? "Provoke!" : "Provoke", player.x, player.y - 0.5, player.floor, "#ffcf6b");
    return;
  }

  // --- Vanguard: Iron Clad — damage-reduction stance (with a slow). ---
  if (id === "iron_clad") {
    if (player.mana < manaCost) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    player.abilityBuffs.ironClad = { until: now + spec.durationMs };
    event("float", "Iron Clad", player.x, player.y - 0.5, player.floor, "#bcd3e0");
    return;
  }

  // --- Archer: Fleet Foot — cleanse + speed burst. ---
  if (id === "fleet_foot") {
    if (player.mana < manaCost) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    player.abilityBuffs.fleetFoot = { until: now + spec.durationMs };
    player.slowUntil = 0; // cleanse active movement slows
    event("float", "Fleet Foot", player.x, player.y - 0.5, player.floor, "#9ae6b4");
    return;
  }

  // --- Thief: Quick Step — short directional dash. ---
  if (id === "quick_step") {
    if (player.mana < manaCost) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    dashPlayer(player, 2);
    event("float", "Quick Step", player.x, player.y - 0.5, player.floor, "#e0c8ff");
    return;
  }

  // --- Apothecary: Healing Poultice — instant heal + heal-over-time. ---
  if (id === "healing_poultice") {
    if (player.mana < manaCost || player.hp >= player.maxHp) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    const instant = Math.max(1, Math.round(player.maxHp * (spec.healFraction ?? 0)) + skillLevel(player, "alchemy"));
    player.hp = clamp(player.hp + instant, 0, player.maxHp);
    const overTime = Math.max(1, Math.round(player.maxHp * 0.12));
    player.abilityBuffs.second_wind = { until: now + spec.durationMs, healPerMs: overTime / spec.durationMs };
    addSkillXp(player, "alchemy", 4);
    event("float", `+${instant} HP`, player.x, player.y - 0.5, player.floor, "#9ee6b1");
    return;
  }

  // --- Mage: Flame Burst — 3x3 AoE in front + burning DoT. ---
  if (id === "flame_burst") {
    if (player.mana < manaCost) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    const dir = DIR_VECTORS[player.dir];
    const cx = player.x + dir.x * 1.5;
    const cy = player.y + dir.y * 1.5;
    for (const monster of monstersInRadius(player.floor, cx, cy, 1.6)) {
      const damage = roll(spec.damage ?? [10, 16]) + skillLevel(player, "magic") + wellFedPower(player);
      addSkillXp(player, "magic", Math.max(1, Math.floor(damage * 1.2)));
      damageMonster(player, monster, damage, "flare");
      if (!monster.deadUntil) applyBurn(player, monster, spec.durationMs, 3);
    }
    event("effect", "flare", cx, cy, player.floor, "#ff8a3d", player.id);
    event("float", "Flame Burst", cx, cy, player.floor, "#ff8a3d");
    return;
  }

  // --- Mage: Frost Nova — ring AoE + freeze (broken by later damage). ---
  if (id === "frost_nova") {
    if (player.mana < manaCost) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    for (const monster of monstersInRadius(player.floor, player.x, player.y, 2.2)) {
      const damage = roll(spec.damage ?? [6, 10]) + skillLevel(player, "magic") + wellFedPower(player);
      addSkillXp(player, "magic", Math.max(1, Math.floor(damage * 1.2)));
      damageMonster(player, monster, damage, "frost");
      if (!monster.deadUntil) monster.freezeUntil = now + spec.durationMs;
    }
    event("effect", "frost", player.x, player.y, player.floor, "#a8e6ff", player.id);
    event("float", "Frost Nova", player.x, player.y - 0.5, player.floor, "#a8e6ff");
    return;
  }

  // --- Apothecary: Volatile Flask — thrown 3x3 toxic burst + accuracy debuff. ---
  if (id === "volatile_flask") {
    if (player.mana < manaCost) return;
    const target = player.targetId == null ? undefined : monsters.get(player.targetId);
    let tx: number;
    let ty: number;
    if (target && !target.deadUntil && target.floor === player.floor && distance(player, target) <= (spec.range ?? 4)) {
      tx = target.x;
      ty = target.y;
    } else {
      const dir = DIR_VECTORS[player.dir];
      tx = player.x + dir.x * 2.5;
      ty = player.y + dir.y * 2.5;
    }
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    event("projectile", "flask", tx, ty, player.floor, "#a6e06b", player.id, null, { fromX: player.x, fromY: player.y });
    for (const monster of monstersInRadius(player.floor, tx, ty, 1.6)) {
      const damage = roll(spec.damage ?? [10, 16]) + skillLevel(player, "magic") + wellFedPower(player);
      addSkillXp(player, "magic", Math.max(1, Math.floor(damage * 1.2)));
      damageMonster(player, monster, damage, "flare");
      if (!monster.deadUntil) monster.inaccurateUntil = now + spec.durationMs;
    }
    event("float", "Volatile Flask", tx, ty, player.floor, "#a6e06b");
    return;
  }

  // Offensive single-target abilities: damage the current target.
  if (spec.damage) {
    const monster = player.targetId == null ? undefined : monsters.get(player.targetId);
    if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
    const range = spec.range ?? classOf(player).range;
    if (distance(player, monster) > range) return;
    if (player.mana < manaCost) return;
    const skill = spec.skill ?? "attack";
    const isRanged = skill === "ranged";
    if (isRanged && !hasLineOfSight(player.floor, player.x, player.y, monster.x, monster.y)) return;
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.mana -= manaCost;
    let damage = roll(spec.damage) + skillLevel(player, skill) + wellFedPower(player);
    // Weaken (Sun-Scorched Wraith) saps physical strikes, not magic.
    if (skill !== "magic") damage = Math.max(1, Math.round(damage * physicalMult(player)));
    // Backstab: 2.5x when striking from behind (player faces the monster's back).
    if (id === "backstab" && player.dir === monster.dir) {
      damage = Math.round(damage * 2.5);
      event("float", "Backstab!", monster.x, monster.y - 0.6, monster.floor, "#ffd166");
    }
    addSkillXp(player, skill, Math.max(1, Math.floor(damage * 1.5)));
    if (isRanged) fireProjectile(player, monster, damage, spec.effectKind ?? "arrow");
    else damageMonster(player, monster, damage, spec.effectKind ?? "flare");
    // Pinning Shot: snare the struck target in place.
    if (id === "pinning_shot" && !monster.deadUntil) {
      monster.snareUntil = now + spec.durationMs;
      event("float", "Pinned!", monster.x, monster.y - 0.6, monster.floor, "#cfe8a0");
    }
    return;
  }

  if (id === "sprint") {
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.abilityBuffs.sprint = { until: now + spec.durationMs };
    event("float", `${player.name} sprints.`, player.x, player.y, player.floor, "#9ae6b4");
    return;
  }
  if (id === "second_wind") {
    if (player.hp >= player.maxHp) return;
    const totalHeal = Math.max(1, Math.round(player.maxHp * (spec.healFraction ?? 0)));
    player.abilityCooldowns[id] = now + spec.cooldownMs;
    player.abilityBuffs.second_wind = {
      until: now + spec.durationMs,
      healPerMs: totalHeal / spec.durationMs
    };
    event("float", `${player.name} catches a second wind.`, player.x, player.y, player.floor, "#f7d486");
  }
}

function damageMonster(player: ServerPlayer, monster: ServerMonster, damage: number, kind: string): void {
  const armor = MONSTERS[monster.type]?.armor ?? 0;
  const dealt = Math.max(1, damage - armor);
  monster.hp = clamp(monster.hp - dealt, 0, monster.maxHp);
  // Taking damage shatters a freeze (per Frost Nova design).
  if (monster.freezeUntil) monster.freezeUntil = 0;
  event("effect", kind, monster.x, monster.y, monster.floor, null, player.id, monster.id, { fromX: player.x, fromY: player.y });
  event("hit", dealt, monster.x, monster.y - 0.45, monster.floor, kind === "flare" ? "#8fd8ff" : "#ffd166", player.id, monster.id);
  if (monster.hp > 0) return;

  const catalog = MONSTERS[monster.type];
  if (!catalog) return;
  monster.deadUntil = performance.now() + (monster.type === "boss" ? 45000 : 18000);
  player.xp += catalog.xp;
  updateQuestProgress(player, monster);
  awardLevels(player);

  const corpse: Corpse = {
    id: `c${nextCorpseId++}`,
    floor: monster.floor,
    x: monster.x,
    y: monster.y,
    gold: roll(catalog.gold),
    label: catalog.name,
    kind: "corpse",
    items: [...rollQuestDrops(monster.type), ...rollPotionDrop(monster.type)]
  };
  corpses.set(corpse.id, corpse);
  event("system", `${player.name} defeated ${catalog.name}.`);
}

function rollQuestDrops(monsterType: string): Array<{ id: string; qty: number }> {
  const drop = QUEST_DROPS[monsterType];
  if (!drop || Math.random() >= drop.chance) return [];
  return [{ id: drop.itemId, qty: 1 }];
}

function rollPotionDrop(monsterType: string): Array<{ id: string; qty: number }> {
  if (monsterType === "boss" || Math.random() < 0.18) return [{ id: "potion", qty: 1 }];
  return [];
}

// Passive dodge: class base + Agility scaling (see dodgeChanceFor). Under E2E
// the outcome is deterministic (the player's forceDodge flag, default false) so
// existing combat tests are unaffected.
function rollDodge(player: ServerPlayer): boolean {
  if (E2E_TEST) return player.forceDodge === true;
  return Math.random() < dodgeChanceFor(player.classKey, skillLevel(player, "agility"));
}

function damagePlayer(player: ServerPlayer, damage: number, source: string): void {
  // Iron Clad mitigates incoming damage.
  if (player.abilityBuffs?.ironClad && performance.now() < player.abilityBuffs.ironClad.until) {
    damage = Math.max(1, Math.round(damage * 0.7));
  }
  player.hp = clamp(player.hp - damage, 0, player.maxHp);
  addSkillXp(player, "defense", Math.max(1, damage));
  event("hit", damage, player.x, player.y - 0.55, player.floor, "#ff6b6b", source);
  if (player.hp > 0) return;
  player.dead = true;
  player.targetId = null;
  event("system", `${player.name} was brought down by ${source}.`);
}

function lootAdjacent(player: ServerPlayer): void {
  if (player.dead) return;
  let found = 0;
  for (const corpse of querySpatial(spatial.corpses, player.floor, player.x, player.y, 1.6)) {
    if (corpse.floor !== player.floor || distance(player, corpse) > 1.6) continue;
    found += 1;
    collectCorpse(player, corpse);
  }
  if (found) event("float", `Looted ${found} corpse${found > 1 ? "s" : ""}.`, player.x, player.y, player.floor, "#ffd166");
}

function lootCorpse(player: ServerPlayer, id: string): void {
  if (player.dead) return;
  const corpse = corpses.get(id);
  if (!corpse || corpse.floor !== player.floor || distance(player, corpse) > 2) return;
  collectCorpse(player, corpse);
  event("float", `Looted ${corpse.label}.`, player.x, player.y, player.floor, "#ffd166");
}

function collectCorpse(player: ServerPlayer, corpse: Corpse): void {
  for (const item of corpse.items ?? []) {
    if (!addInventoryItem(player, item.id, item.qty)) {
      event("system", "Your inventory is full.");
      return;
    }
  }
  player.gold += corpse.gold;
  corpses.delete(corpse.id);
  removeFromSpatial(spatial.corpses, corpse);
}

function nearbyNpcOfRole(player: ServerPlayer, role: string): NpcRuntime | null {
  let best: NpcRuntime | null = null;
  let bestDist = Infinity;
  for (const npc of npcs.values()) {
    if (npc.role !== role || npc.floor !== player.floor) continue;
    const d = distance(player, npc);
    if (d <= 2 && d < bestDist) {
      best = npc;
      bestDist = d;
    }
  }
  return best;
}

function buyItem(player: ServerPlayer, item: string): void {
  if (player.dead) return;
  const role = item === "empty_flask" || item === "alchemy_kit" ? "alchemist" : "vendor";
  if (!nearbyNpcOfRole(player, role)) return;
  if (item === "weapon" && player.weaponTier === 0 && player.gold >= SHOP["weapon"]!.cost) {
    player.gold -= SHOP["weapon"]!.cost;
    player.weaponTier = 1;
    event("system", `${player.name} bought a better weapon.`);
  }
  if (item === "armor" && player.armorTier === 0 && player.gold >= SHOP["armor"]!.cost) {
    player.gold -= SHOP["armor"]!.cost;
    player.armorTier = 1;
    event("system", `${player.name} bought padded mail.`);
  }
  if (item === "potion" && player.gold >= SHOP["potion"]!.cost) {
    player.gold -= SHOP["potion"]!.cost;
    addInventoryItem(player, "potion", 1);
  }
  if (item === "axe" && !hasInventoryItem(player, "axe") && player.gold >= SHOP["axe"]!.cost) {
    if (!addInventoryItem(player, "axe", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["axe"]!.cost;
    event("system", `${player.name} bought a bronze axe.`);
  }
  if (item === "fishing_rod" && !hasInventoryItem(player, "fishing_rod") && player.gold >= SHOP["fishing_rod"]!.cost) {
    if (!addInventoryItem(player, "fishing_rod", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["fishing_rod"]!.cost;
    event("system", `${player.name} bought a fishing rod.`);
  }
  if (item === "pickaxe" && !hasInventoryItem(player, "pickaxe") && player.gold >= SHOP["pickaxe"]!.cost) {
    if (!addInventoryItem(player, "pickaxe", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["pickaxe"]!.cost;
    event("system", `${player.name} bought a bronze pickaxe.`);
  }
  if (item === "flint_steel" && !hasInventoryItem(player, "flint_steel") && player.gold >= SHOP["flint_steel"]!.cost) {
    if (!addInventoryItem(player, "flint_steel", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["flint_steel"]!.cost;
    event("system", `${player.name} bought flint and steel.`);
  }
  if (item === "empty_flask" && player.gold >= SHOP["empty_flask"]!.cost) {
    if (!addInventoryItem(player, "empty_flask", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["empty_flask"]!.cost;
    event("system", `${player.name} bought an empty flask.`);
  }
  if (item === "alchemy_kit" && !hasInventoryItem(player, "alchemy_kit") && player.gold >= SHOP["alchemy_kit"]!.cost) {
    if (!addInventoryItem(player, "alchemy_kit", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["alchemy_kit"]!.cost;
    event("system", `${player.name} bought an alchemy kit.`);
  }
  if (item === "broken_reach_map" && !hasInventoryItem(player, "broken_reach_map") && player.gold >= SHOP["broken_reach_map"]!.cost) {
    if (!addInventoryItem(player, "broken_reach_map", 1)) {
      event("system", "Your inventory is full.");
      return;
    }
    player.gold -= SHOP["broken_reach_map"]!.cost;
    event("system", `${player.name} bought the Inked Survey of The Broken Reach.`);
  }
}

function brewPotion(player: ServerPlayer): void {
  if (player.dead) return;
  if (!nearbyNpcOfRole(player, "alchemist")) return;
  if (!hasInventoryItem(player, "alchemy_kit")) {
    event("float", "You need an alchemy kit.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  if (!hasInventoryItem(player, "herb") || !hasInventoryItem(player, "empty_flask")) {
    event("float", "You need a herb and an empty flask.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  if (!removeInventoryItem(player, "herb", 1)) return;
  if (!removeInventoryItem(player, "empty_flask", 1)) {
    addInventoryItem(player, "herb", 1);
    return;
  }
  if (!addInventoryItem(player, "potion", 1)) {
    addInventoryItem(player, "herb", 1);
    addInventoryItem(player, "empty_flask", 1);
    event("system", "Your inventory is full.");
    return;
  }
  addSkillXp(player, "alchemy", BREW_XP);
  event("float", `+${BREW_XP} Alchemy`, player.x, player.y - 0.55, player.floor, "#c8a8ff");
}

// --- Tier-1 classes --------------------------------------------------------

// Class switching is a safe-zone activity (Waystone floor 0 / Northwatch floor 4).
function meetsClassRequirements(player: ServerPlayer, unlock: { requires: Partial<Record<string, number>> }): boolean {
  return Object.entries(unlock.requires).every(([skill, level]) => skillLevel(player, skill) >= (level ?? 0));
}

function setClass(player: ServerPlayer, classKey: string): void {
  if (player.dead) return;
  // Class toggling is a town activity (Waystone / Northwatch) — not every safe spot.
  if (player.floor !== 0 && player.floor !== 4) {
    event("float", "You can only change class in a town.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  const target = classKey || "adventurer";
  if (target !== "adventurer" && !player.unlockedClasses.includes(target)) {
    event("float", "That class is not unlocked.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  if (!CLASSES[target]) return;
  if (player.classKey === target) return;
  player.classKey = target;
  // Drop any cooldowns/buffs tied to abilities the new class can't use.
  player.abilityCooldowns = {};
  player.abilityBuffs = {};
  recalculateVitals(player);
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.mana = clamp(player.mana, 0, player.maxMana);
  event("system", `${player.name} takes up the ${CLASSES[target]!.label} stance.`);
  persistPlayer(player);
}

function trainWithNpc(player: ServerPlayer, npc: NpcRuntime): void {
  const unlock = CLASS_UNLOCKS.find((entry) => entry.npcId === npc.id);
  if (!unlock) return;
  if (player.unlockedClasses.includes(unlock.key)) {
    eventDialogue(player, [
      { speaker: npc.name, text: `You already walk the ${unlock.label}'s path. Equip it from your Classes panel in town.` }
    ]);
    return;
  }
  if (!meetsClassRequirements(player, unlock)) {
    const reqs = Object.entries(unlock.requires)
      .map(([skill, level]) => `${SKILLS[skill]?.label ?? skill} ${level} (you have ${skillLevel(player, skill)})`)
      .join(", ");
    eventDialogue(player, [
      { speaker: npc.name, text: unlock.requires ? `Come back when you're ready: ${reqs}.` : "Not yet." }
    ]);
    return;
  }
  player.unlockedClasses.push(unlock.key);
  persistPlayer(player);
  eventDialogue(player, [
    { speaker: npc.name, text: `It's done — you are now a ${unlock.label}. Equip the stance from your Classes panel here in town.` }
  ]);
  event("system", `${player.name} unlocked the ${unlock.label} class.`);
}

function respawn(player: ServerPlayer): void {
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

function setTarget(player: ServerPlayer, id: string): void {
  const monster = monsters.get(String(id));
  if (!monster || monster.deadUntil || monster.floor !== player.floor) return;
  player.targetId = monster.id;
}

function chat(player: ServerPlayer, text: string): void {
  const clean = text.trim().slice(0, 120);
  if (!clean) return;
  if (DEV_TOOLS && clean.startsWith("/dev")) {
    handleDevCommand(player, clean);
    return;
  }
  event("chat", `${player.name}: ${clean}`);
}

// Playtest cheats (DEV_TOOLS only). Usage in chat:
//   /dev          — level all skills to 20, +1000g, plus a bow + alchemy gear
//   /dev skills N  — set every skill to level N (default 20)
//   /dev unlock    — unlock all Tier-1 classes (skip the trainers)
//   /dev gold N    — set gold to N
//   /dev help      — list commands
function handleDevCommand(player: ServerPlayer, text: string): void {
  const [, sub, arg] = text.split(/\s+/);
  const sysToPlayer = (msg: string): void => event("system", msg);
  if (!sub || sub === "kit") {
    devSetAllSkills(player, 20);
    player.gold += 1000;
    for (const [id, qty] of [["hunting_bow", 1], ["alchemy_kit", 1], ["empty_flask", 5], ["herb", 5]] as const) {
      if (!hasInventoryItem(player, id)) addInventoryItem(player, id, qty);
    }
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} kitted out: all skills 20, +1000g, bow + alchemy gear. Visit a trainer, then equip in the Classes panel.`);
    return;
  }
  if (sub === "skills") {
    const level = clamp(Math.floor(Number(arg) || 20), 1, 99);
    devSetAllSkills(player, level);
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} set all skills to level ${level}.`);
    return;
  }
  if (sub === "unlock") {
    for (const unlock of CLASS_UNLOCKS) {
      if (!player.unlockedClasses.includes(unlock.key)) player.unlockedClasses.push(unlock.key);
    }
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} unlocked all classes. Equip them from the Classes panel (in a town).`);
    return;
  }
  if (sub === "gold") {
    player.gold = clamp(Math.floor(Number(arg) || 0), 0, 1_000_000);
    persistPlayer(player);
    sysToPlayer(`[dev] ${player.name} gold set to ${player.gold}.`);
    return;
  }
  sysToPlayer("[dev] commands: /dev (full kit) · /dev skills N · /dev unlock · /dev gold N");
}

function devSetAllSkills(player: ServerPlayer, level: number): void {
  const xp = xpForLevel(level);
  for (const id of Object.keys(SKILLS)) {
    (player.skills[id] ?? (player.skills[id] = { xp: 0 })).xp = xp;
  }
  recalculateVitals(player);
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.mana = clamp(player.mana, 0, player.maxMana);
}

function talkNpc(player: ServerPlayer, id: string): void {
  const npc = npcs.get(id);
  if (!npc || player.dead || npc.floor !== player.floor || distance(player, npc) > 2.4) return;

  const quest = questForGiver(npc.id);
  if (quest) {
    handleQuestDialogue(player, npc, quest);
    return;
  }

  if (npc.role === "trainer") {
    trainWithNpc(player, npc);
    return;
  }

  const dialogue = npcDialogueLines(player, npc);
  if (!dialogue) return;
  if (npc.role === "vendor") eventDialogue(player, dialogue, { opensShop: true });
  else if (npc.role === "alchemist") eventDialogue(player, dialogue, { opensAlchemist: true });
  else eventDialogue(player, dialogue, {});
}

function questForGiver(giverId: string): Quest | null {
  return Object.values(QUESTS).find((quest) => quest.giverId === giverId) ?? null;
}

function handleQuestDialogue(player: ServerPlayer, npc: NpcRuntime, quest: Quest): void {
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

function consumeQuestTurnIn(player: ServerPlayer, quest: Quest): boolean {
  if (quest.kind === "gather" || quest.kind === "fetch") {
    return removeInventoryItem(player, quest.itemId ?? "", quest.targetCount);
  }
  return true;
}

function currentQuestProgress(player: ServerPlayer, quest: Quest, state: QuestState): number {
  if (quest.kind === "gather" || quest.kind === "fetch") {
    return clamp(inventoryCount(player, quest.itemId ?? ""), 0, quest.targetCount);
  }
  return clamp(state.progress, 0, quest.targetCount);
}

function inventoryCount(player: ServerPlayer, id: string): number {
  return player.inventory.reduce((sum, item) => sum + (item?.id === id ? item.qty : 0), 0);
}

function questDialogue(
  npc: NpcRuntime,
  player: ServerPlayer,
  quest: Quest,
  phase: keyof QuestDialogue,
  progress = 0
): DialogueLineView[] {
  const phaseLines = quest.dialogue?.[phase];
  if (!Array.isArray(phaseLines) || phaseLines.length === 0) {
    return [{ speaker: npc.name, text: npc.dialogue }];
  }
  const item = quest.itemId ? ITEMS[quest.itemId] ?? null : null;
  const ctx: Record<string, unknown> = {
    progress,
    target: {
      count: quest.targetCount,
      remaining: Math.max(0, quest.targetCount - progress),
      item: item ? { id: item.id, label: item.label } : null
    },
    reward: { gold: quest.rewardGold, xp: quest.rewardXp },
    player: { name: player.name },
    npc: { name: npc.name }
  };
  return phaseLines.map((line) => {
    const isNpc = "npc" in line;
    return {
      speaker: isNpc ? npc.name : player.name,
      text: renderQuestLine(isNpc ? line.npc : line.player, ctx)
    };
  });
}

function renderQuestLine(text: string, ctx: Record<string, unknown>): string {
  return text.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const parts = key.split(".");
    let value: unknown = ctx;
    for (const part of parts) {
      if (value == null) return `{${key}}`;
      value = (value as Record<string, unknown>)[part];
    }
    return value == null ? `{${key}}` : String(value);
  });
}

function cutTree(player: ServerPlayer, id: string): void {
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

function fishNode(player: ServerPlayer, id: string): void {
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

function mineNode(player: ServerPlayer, id: string): void {
  const node = MINING_NODES.find((item) => item.id === id);
  if (!node || player.dead || node.floor !== player.floor || distance(player, miningApproachPoint(node)) > 1.45) return;
  if (!playerHasCapability(player, "mine")) {
    event("float", "You need a pickaxe.", player.x, player.y, player.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  const level = skillLevel(player, "mining");
  player.action = { type: "mining", nodeId: node.id, nextAt: performance.now() + miningSwingMs(level), startedAt: performance.now() };
  event("float", "You swing your pickaxe.", node.x, node.y, node.floor, "#d8a86a");
}

function gatherHerb(player: ServerPlayer, id: string): void {
  const node = herbNodes.get(id);
  if (!node || player.dead || !node.active || node.floor !== player.floor || distance(player, herbApproachPoint(node)) > 1.45) return;
  if (node.requiredLevel > 0 && skillLevel(player, "foraging") < node.requiredLevel) {
    event("float", `Requires Foraging ${node.requiredLevel}.`, node.x, node.y, node.floor, "#f7d486");
    return;
  }
  player.targetId = null;
  player.action = { type: "herbing", nodeId: node.id, nextAt: performance.now() + HERB_GATHER_MS, startedAt: performance.now() };
  event("float", "You start gathering herbs.", node.x, node.y, node.floor, "#9ee6b1");
}

// --- Item use dispatcher (Phase 2) ----------------------------------------
// useItem looks up `ITEMS[itemId].use.kind` and dispatches to a verb handler.
// Each verb owns its own validation, consumption, and effects. Authors compose
// items in content/items.yaml; adding a new verb still requires engine work.

const USE_VERBS: Record<string, (player: ServerPlayer, item: Item, ctx: UseItemCtx) => void> = {
  eat: useVerbEat,
  drink_potion: useVerbDrinkPotion,
  light_fire: useVerbLightFire,
  cook_on_fire: useVerbCookOnFire
};

function useItem(player: ServerPlayer, itemId: string, ctx: UseItemCtx = {}): void {
  if (player.dead) return;
  const item = ITEMS[itemId];
  if (!item?.use) return;
  const verb = USE_VERBS[item.use.kind];
  if (!verb) return;
  verb(player, item, ctx);
}

function applyBuffs(player: ServerPlayer, buffs: Array<{ id: string; durationMs: number }> | undefined, now: number): void {
  for (const buff of buffs ?? []) {
    if (buff.id === "well_fed") player.wellFedUntil = Math.max(player.wellFedUntil ?? 0, now + buff.durationMs);
    if (buff.id === "food_regen") player.foodRegenUntil = Math.max(player.foodRegenUntil ?? 0, now + buff.durationMs);
  }
}

function useVerbEat(player: ServerPlayer, item: Item): void {
  if (!removeInventoryItem(player, item.id, 1)) return;
  const u = item.use;
  if (u?.kind !== "eat") return;
  if (u.restoreHp) player.hp = clamp(player.hp + u.restoreHp, 0, player.maxHp);
  applyBuffs(player, u.buffs, performance.now());
  if (u.float) event("float", u.float, player.x, player.y, player.floor, "#9ee6b1");
}

function useVerbDrinkPotion(player: ServerPlayer, item: Item): void {
  if (!removeInventoryItem(player, item.id, 1)) return;
  const u = item.use;
  if (u?.kind !== "drink_potion") return;
  if (u.restoreHp) player.hp = clamp(player.hp + u.restoreHp, 0, player.maxHp);
  event("float", u.float ?? `${player.name} drinks a potion.`, player.x, player.y, player.floor, "#77e0a0");
}

function useVerbLightFire(player: ServerPlayer, item: Item, ctx: UseItemCtx): void {
  if (!hasInventoryItem(player, item.id)) return;
  const u = item.use;
  if (u?.kind !== "light_fire") return;
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
  const fire: Fire = {
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

function useVerbCookOnFire(player: ServerPlayer, item: Item, ctx: UseItemCtx): void {
  const fire = ctx.fireId == null ? undefined : fires.get(ctx.fireId);
  if (!fire || fire.floor !== player.floor || distance(player, fire) > 1.9) return;
  if (!hasInventoryItem(player, item.id)) return;
  const u = item.use;
  const skill = (u?.kind === "cook_on_fire" ? u.skill : undefined) ?? "cooking";
  player.targetId = null;
  player.action = {
    type: "cooking",
    itemId: item.id,
    fireId: fire.id,
    nextAt: performance.now() + cookingMs(skillLevel(player, skill))
  };
  event("float", "Cooking...", fire.x, fire.y, fire.floor, "#ffcf7a");
}

function makeFire(player: ServerPlayer, logItem = "logs"): void {
  useItem(player, "flint_steel", { logItem });
}

function cookFish(player: ServerPlayer, fireId: string): void {
  useItem(player, "raw_fish", { fireId });
}

function eatItem(player: ServerPlayer, itemId: string): void {
  if (ITEMS[itemId]?.use?.kind !== "eat") return;
  useItem(player, itemId);
}

function updatePlayerAction(player: ServerPlayer, now: number): void {
  if (!player.action) return;
  if (player.action.type === "fishing") return updateFishingAction(player, now);
  if (player.action.type === "mining") return updateMiningAction(player, now);
  if (player.action.type === "herbing") return updateHerbingAction(player, now);
  if (player.action.type === "cooking") return updateCookingAction(player, now);
  if (player.action.type !== "woodcutting") return;
  const action = player.action;
  const tree = treeNodes.get(action.treeId);
  if (!tree || player.dead || !tree.active || tree.floor !== player.floor || distance(player, tree) > 1.9) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;

  action.swings += 1;
  const treeSpec = treeTypeSpec(tree);
  const level = skillLevel(player, "woodcutting");
  action.nextAt = now + woodcutSwingMs(level, treeSpec);
  const angle = Math.atan2(tree.y - player.y, tree.x - player.x);
  event("effect", "chop", tree.x, tree.y - 0.35, tree.floor, null, player.id, tree.id, { fromX: player.x, fromY: player.y, angle });
  action.remaining -= woodcutPower(level, treeSpec);
  if (action.remaining > 0) {
    if (action.swings % 3 === 0) event("float", "Chop", tree.x, tree.y, tree.floor, "#d8c68a");
    return;
  }

  tree.active = false;
  tree.respawnAt = performance.now() + TREE_RESPAWN_MS;
  player.action = null;
  addSkillXp(player, "woodcutting", treeSpec.xp);
  dropItem(tree.floor, tree.x + 0.12, tree.y, [{ id: treeSpec.itemId, qty: 1 }], treeSpec.dropLabel);
  event("float", `+${treeSpec.xp} Woodcutting`, tree.x, tree.y, tree.floor, "#9ee6b1");
}

function updateFishingAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "fishing") return;
  const node = FISHING_NODES.find((item) => item.id === action.nodeId);
  if (!node || player.dead || node.floor !== player.floor || distance(player, fishingApproachPoint(node)) > 1.65 || !playerHasCapability(player, "fish")) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
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

function updateMiningAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "mining") return;
  const node = MINING_NODES.find((item) => item.id === action.nodeId);
  if (!node || player.dead || node.floor !== player.floor || distance(player, miningApproachPoint(node)) > 1.65 || !playerHasCapability(player, "mine")) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  player.action = null;
  if (!addInventoryItem(player, "copper_ore", 1)) {
    event("system", "Your inventory is full.");
    return;
  }
  const xp = 20;
  addSkillXp(player, "mining", xp);
  event("float", `+${xp} Mining`, node.x, node.y, node.floor, "#d8a86a");
}

function updateHerbingAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "herbing") return;
  const node = herbNodes.get(action.nodeId);
  if (!node || player.dead || !node.active || node.floor !== player.floor || distance(player, herbApproachPoint(node)) > 1.65) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  player.action = null;
  if (!addInventoryItem(player, node.item, 1)) {
    event("system", "Your inventory is full.");
    return;
  }
  node.active = false;
  node.respawnAt = performance.now() + HERB_RESPAWN_MS;
  addSkillXp(player, "foraging", node.xp);
  const label = ITEMS[node.item]?.label ?? node.item;
  event("float", `+1 ${label} · +${node.xp} Foraging`, node.x, node.y, node.floor, "#9ee6b1");
}

function updateCookingAction(player: ServerPlayer, now: number): void {
  const action = player.action;
  if (action?.type !== "cooking") return;
  const fire = fires.get(action.fireId);
  if (!fire || player.dead || fire.floor !== player.floor || distance(player, fire) > 2) {
    player.action = null;
    return;
  }
  if (now < action.nextAt) return;
  const inputId = action.itemId ?? "raw_fish";
  const recipe = ITEMS[inputId]?.use;
  const cook = recipe?.kind === "cook_on_fire" ? recipe : null;
  const produces = cook?.produces ?? "cooked_fish";
  const burns = cook?.burns ?? "burnt_fish";
  const skill = cook?.skill ?? "cooking";
  const xp = cook?.xp ?? 22;
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

function grantE2EItems(
  player: ServerPlayer,
  message: {
    type: "e2eGrantItems";
    items?: Array<{ id: string; qty: number }>;
    gold?: number;
    hp?: number;
    floor?: number;
    x?: number;
    y?: number;
    skills?: Record<string, number>;
    forceDodge?: boolean;
  }
): void {
  if (!E2E_TEST) return;
  for (const item of message.items ?? []) {
    const id = String(item.id ?? "");
    const qty = Number(item.qty ?? 1);
    if (ITEMS[id]) addInventoryItem(player, id, qty);
  }
  if (Number.isFinite(message.gold)) player.gold = Math.max(0, Math.floor(Number(message.gold)));
  if (Number.isFinite(message.hp)) player.hp = clamp(Number(message.hp), 0, player.maxHp);
  if (message.skills) {
    for (const [id, xp] of Object.entries(message.skills)) {
      if (SKILLS[id] && Number.isFinite(xp)) (player.skills[id] ?? (player.skills[id] = { xp: 0 })).xp = Math.max(0, Number(xp));
    }
  }
  if (typeof message.forceDodge === "boolean") player.forceDodge = message.forceDodge;
  if (Number.isFinite(message.floor) && Number.isFinite(message.x) && Number.isFinite(message.y)) {
    const spot = findStandableNear(Math.floor(Number(message.floor)), Number(message.x), Number(message.y));
    if (spot) {
      player.floor = spot.floor;
      player.x = spot.x;
      player.y = spot.y;
    }
  }
}

function findStandableNear(floor: number, x: number, y: number): Positioned | null {
  if (canStand(floor, x, y)) return { floor, x, y };
  const baseX = Math.floor(x);
  const baseY = Math.floor(y);
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cx = baseX + dx + 0.5;
        const cy = baseY + dy + 0.5;
        if (canStand(floor, cx, cy)) return { floor, x: cx, y: cy };
      }
    }
  }
  return null;
}

function treeTypeSpec(tree: TreeNodeRuntime): TreeType {
  return TREE_TYPES[tree.type] ?? TREE_TYPES["oak"]!;
}

function fishingApproachPoint(node: { floor: number; x: number; y: number; approachX: number; approachY: number }): Positioned {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function miningApproachPoint(node: { floor: number; x: number; y: number; approachX: number; approachY: number }): Positioned {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function herbApproachPoint(node: HerbNodeRuntime): Positioned {
  return {
    floor: node.floor,
    x: node.approachX ?? node.x,
    y: node.approachY ?? node.y
  };
}

function npcDialogueLines(player: ServerPlayer, npc: NpcRuntime): DialogueLineView[] {
  if (npc.role === "vendor") {
    return [
      { speaker: npc.name, text: "Fresh supplies, sharp edges, and the little things that keep you alive." },
      { speaker: player.name, text: "Show me what you have." },
      { speaker: npc.name, text: "Take your time. Good tools pay for themselves out there." }
    ];
  }
  if (npc.role === "alchemist") {
    return [
      { speaker: npc.name, text: "Herbs from the wild, a clean flask, a steady kit — that's all a tonic needs." },
      { speaker: player.name, text: "Show me how to brew." },
      { speaker: npc.name, text: "Gather what you can and bring it to my bench." }
    ];
  }
  return [
    { speaker: npc.name, text: npc.dialogue },
    { speaker: player.name, text: "I will remember that." }
  ];
}

function eventDialogue(player: ServerPlayer, lines: DialogueLineView[], extra: Partial<GameEvent> = {}): void {
  event("dialogue", "", null, null, null, null, null, null, { to: player.id, lines, ...extra });
}

function woodcutSwingMs(level: number, treeSpec: TreeType): number {
  const aboveRequirement = Math.max(0, level - treeSpec.requiredLevel);
  return clamp(treeSpec.baseSwingMs - aboveRequirement * 75, treeSpec.minSwingMs, treeSpec.baseSwingMs);
}

function woodcutPower(level: number, treeSpec: TreeType): number {
  return 1 + Math.floor(Math.max(0, level - treeSpec.requiredLevel) / 8);
}

function dropItem(floor: number, x: number, y: number, items: Array<{ id: string; qty: number }>, label: string): void {
  const drop: Corpse = {
    id: `c${nextCorpseId++}`,
    floor,
    x,
    y,
    gold: 0,
    label,
    kind: "drop",
    items
  };
  corpses.set(drop.id, drop);
  addToSpatial(spatial.corpses, drop);
}

function spawnNpcs(): void {
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

function spawnTreeNodes(): void {
  for (let floor = 0; floor <= 4; floor += 1) {
    const rows = makeFloorTiles(floor);
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== "f") continue;
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

function spawnHerbNodes(): void {
  for (const node of HERB_NODES) {
    herbNodes.set(node.id, {
      id: node.id,
      floor: node.floor,
      x: node.x,
      y: node.y,
      approachX: node.approachX,
      approachY: node.approachY,
      label: node.label,
      requiredLevel: node.requiredLevel ?? 0,
      xp: node.xp ?? FORAGE_XP,
      item: node.item ?? "herb",
      active: true,
      respawnAt: 0
    });
  }
}

function treeTypeForTile(floor: number, x: number, y: number): string {
  const value = (floor * 73856093) ^ (x * 19349663) ^ (y * 83492791);
  if (floor === 3 && Math.abs(value) % 3 === 0) return "pine";
  if (floor === 4 && Math.abs(value) % 4 === 0) return "pine";
  return "oak";
}

function updateNpcs(dt: number, now: number): void {
  for (const npc of npcs.values()) {
    const { homeX, homeY } = npc;
    if (homeX == null || homeY == null) continue;
    npc.moving = false;
    if (now >= (npc.wanderNextAt ?? 0) && !npc.wanderTarget) {
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

function pickNpcWanderTarget(npc: NpcRuntime): Vec2 | null {
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1 + Math.random() * 4;
    const x = clamp(npc.homeX! + Math.cos(angle) * radius, 1.5, floorCols(npc.floor) - 1.5);
    const y = clamp(npc.homeY! + Math.sin(angle) * radius, 1.5, floorRows(npc.floor) - 1.5);
    if (canStand(npc.floor, x, y)) return { x, y };
  }
  return null;
}

function updateTreeNodes(now: number): void {
  for (const tree of treeNodes.values()) {
    if (!tree.active && now >= tree.respawnAt) tree.active = true;
  }
  for (const node of herbNodes.values()) {
    if (!node.active && now >= node.respawnAt) node.active = true;
  }
}

function updateFires(now: number): void {
  for (const [id, fire] of fires) {
    if (now >= fire.expiresAt) fires.delete(id);
  }
}

function spawnMonster(spawn: MonsterSpawn): void {
  const catalog = MONSTERS[spawn.type];
  if (!catalog) return;
  const monster: ServerMonster = {
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
    wanderNextAt: performance.now() + roll([800, 2800]),
    hidden: catalog.burrow === true
  };
  monsters.set(monster.id, monster);
}

function respawnMonster(monster: ServerMonster): void {
  const catalog = MONSTERS[monster.type];
  if (!catalog) return;
  monster.floor = monster.spawn.floor;
  monster.x = monster.spawn.x + 0.5;
  monster.y = monster.spawn.y + 0.5;
  monster.hp = catalog.maxHp;
  monster.maxHp = catalog.maxHp;
  monster.deadUntil = 0;
  monster.wanderTarget = null;
  monster.wanderNextAt = performance.now() + roll([1000, 3500]);
  monster.tauntUntil = 0;
  monster.tauntBy = undefined;
  monster.snareUntil = 0;
  monster.freezeUntil = 0;
  monster.burnUntil = 0;
  monster.inaccurateUntil = 0;
  monster.alertUntil = 0;
  monster.alertTarget = undefined;
  monster.hidden = catalog.burrow === true; // re-bury ambushers
}

function wanderMonster(monster: ServerMonster, catalog: { speed: number }, dt: number, now: number): void {
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

function pickWanderTarget(monster: ServerMonster): Vec2 | null {
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.2 + Math.random() * 4.5;
    const x = clamp(monster.homeX + Math.cos(angle) * radius, 1.5, floorCols(monster.floor) - 1.5);
    const y = clamp(monster.homeY + Math.sin(angle) * radius, 1.5, floorRows(monster.floor) - 1.5);
    if (zoneAt(monster.floor, x, y) !== monster.zone) continue;
    if (canStand(monster.floor, x, y)) return { x, y };
  }
  return null;
}

function moveEntity(entity: { floor: number; x: number; y: number; dir: Direction; moving: boolean }, dx: number, dy: number): void {
  const oldX = entity.x;
  const oldY = entity.y;
  if (dx || dy) {
    entity.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }
  const nextX = clamp(entity.x + dx, 0.5, floorCols(entity.floor) - 0.5);
  if (canStand(entity.floor, nextX, entity.y)) entity.x = nextX;
  const nextY = clamp(entity.y + dy, 0.5, floorRows(entity.floor) - 0.5);
  if (canStand(entity.floor, entity.x, nextY)) entity.y = nextY;
  entity.moving = Math.hypot(entity.x - oldX, entity.y - oldY) > 0.001;
}

function canStand(floor: number, x: number, y: number): boolean {
  const checks: Array<[number, number]> = [
    [x - 0.28, y - 0.28],
    [x + 0.28, y - 0.28],
    [x - 0.28, y + 0.28],
    [x + 0.28, y + 0.28]
  ];
  return checks.every(([cx, cy]) => !isBlockedTile(tileAt(floor, Math.floor(cx), Math.floor(cy))));
}

function nearestPlayer(monster: ServerMonster, maxDistance: number): ServerPlayer | null {
  let best: ServerPlayer | null = null;
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

function awardLevels(player: ServerPlayer): void {
  while (player.xp >= xpForLevel(player.level + 1)) {
    player.level += 1;
    recalculateVitals(player);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    event("system", `${player.name} reached level ${player.level}.`);
  }
}

function armorReduction(player: ServerPlayer): number {
  return Math.floor(skillLevel(player, "defense") / 3) + player.armorTier * (SHOP["armor"]!.armorBonus ?? 0) + wellFedPower(player);
}

function broadcastState(): void {
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

function buildSnapshotFor(viewer: ServerPlayer): StateSnapshot {
  const players: PlayerView[] = [];
  for (const player of querySpatial(spatial.players, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (player.id !== viewer.id && !inInterestRange(viewer, player)) continue;
    players.push(serializePlayer(player));
  }

  const visibleMonsters: MonsterView[] = [];
  for (const monster of querySpatial(spatial.monsters, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (monster.deadUntil || monster.hidden || !inInterestRange(viewer, monster)) continue;
    visibleMonsters.push(serializeMonster(monster));
  }

  const visibleCorpses: CorpseView[] = [];
  for (const corpse of querySpatial(spatial.corpses, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (!inInterestRange(viewer, corpse)) continue;
    visibleCorpses.push(corpse);
  }

  const visibleNpcs: NpcView[] = [];
  for (const npc of querySpatial(spatial.npcs, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)) {
    if (!inInterestRange(viewer, npc)) continue;
    visibleNpcs.push(serializeNpc(npc));
  }

  const visibleTrees: TreeView[] = [];
  for (const tree of querySpatial(spatial.trees, viewer.floor, viewer.x, viewer.y, TREE_SNAPSHOT_RADIUS)) {
    if (!inTreeInterestRange(viewer, tree)) continue;
    visibleTrees.push(serializeTree(tree));
  }

  const visibleFishingNodes = FISHING_NODES
    .filter((node) => inInterestRange(viewer, node))
    .map(serializeFishingNode);
  const visibleMiningNodes = MINING_NODES
    .filter((node) => inInterestRange(viewer, node))
    .map(serializeMiningNode);
  const visibleHerbNodes: HerbNodeView[] = [];
  for (const node of herbNodes.values()) {
    if (inInterestRange(viewer, node)) visibleHerbNodes.push(serializeHerbNode(node));
  }
  const visibleFires = querySpatial(spatial.fires, viewer.floor, viewer.x, viewer.y, SNAPSHOT_RADIUS)
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
    miningNodes: visibleMiningNodes,
    herbNodes: visibleHerbNodes,
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
      visibleMiningNodes: visibleMiningNodes.length,
      visibleFires: visibleFires.length,
      spatialCells: spatial.cellCount,
      tickMs: round(avg(metrics.tickSamples)),
      snapshotMs: round(avg(metrics.snapshotSamples)),
      bytesOutPerSecond: metrics.bytesOutPerSecond
    }
  };
}

function actionView(a: PlayerAction): ActionView {
  if (a.type === "woodcutting") return { type: a.type, treeId: a.treeId };
  if (a.type === "fishing") return { type: a.type, nodeId: a.nodeId };
  if (a.type === "mining") return { type: a.type, nodeId: a.nodeId };
  if (a.type === "herbing") return { type: a.type, nodeId: a.nodeId };
  return { type: a.type, fireId: a.fireId };
}

function serializePlayer(player: ServerPlayer): PlayerView {
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
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    targetId: player.targetId,
    dead: player.dead,
    action: player.action ? actionView(player.action) : null,
    buffs: serializeBuffs(player),
    inventory: serializeInventory(player.inventory),
    quests: serializeQuests(player),
    skills: serializeSkills(player),
    abilities: serializeAbilities(player),
    unlockedClasses: [...player.unlockedClasses],
    weight: Math.round(carriedWeight(player)),
    maxWeight: WEIGHT_SOFT_CAP
  };
}

function serializeAbilities(player: ServerPlayer): AbilityView[] {
  const now = performance.now();
  const classSpec = CLASSES[player.classKey ?? "adventurer"] ?? CLASSES["adventurer"]!;
  const ids = classSpec.abilities ?? [];
  return ids.map((id): AbilityView | null => {
    const spec = ABILITIES[id];
    if (!spec) return null;
    const buff = player.abilityBuffs?.[id as keyof typeof player.abilityBuffs];
    return {
      id,
      label: spec.label,
      description: spec.description,
      cooldownMs: spec.cooldownMs,
      durationMs: spec.durationMs,
      cooldownRemainingMs: Math.max(0, Math.round((player.abilityCooldowns?.[id] ?? 0) - now)),
      activeRemainingMs: Math.max(0, Math.round((buff?.until ?? 0) - now))
    };
  }).filter((a): a is AbilityView => a !== null);
}

function serializeMonster(monster: ServerMonster): MonsterView {
  return {
    id: monster.id,
    type: monster.type,
    name: MONSTERS[monster.type]?.name ?? monster.type,
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

function serializeNpc(npc: NpcRuntime): NpcView {
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role as NpcView["role"],
    floor: npc.floor,
    x: round(npc.x),
    y: round(npc.y),
    dir: npc.dir,
    moving: npc.moving,
    dialogue: npc.dialogue
  };
}

function serializeTree(tree: TreeNodeRuntime): TreeView {
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

function serializeFishingNode(node: { id: string; floor: number; x: number; y: number; approachX: number; approachY: number }): FishingNodeView {
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

const ORE_LABELS: Record<string, string> = {
  copper: "Copper vein",
  tin: "Tin vein",
  iron: "Iron vein"
};

function serializeMiningNode(node: { id: string; floor: number; x: number; y: number; approachX: number; approachY: number; kind: string }): MiningNodeView {
  return {
    id: node.id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    approachX: node.approachX,
    approachY: node.approachY,
    kind: node.kind,
    label: ORE_LABELS[node.kind] ?? "Ore vein"
  };
}

function serializeHerbNode(node: HerbNodeRuntime): HerbNodeView {
  return {
    id: node.id,
    floor: node.floor,
    x: node.x,
    y: node.y,
    approachX: node.approachX,
    approachY: node.approachY,
    label: node.label,
    active: node.active,
    requiredLevel: node.requiredLevel
  };
}

function serializeFire(fire: Fire): FireView {
  return {
    id: fire.id,
    floor: fire.floor,
    x: fire.x,
    y: fire.y,
    remainingMs: Math.max(0, Math.round(fire.expiresAt - performance.now()))
  };
}

function serializeBuffs(player: ServerPlayer): BuffsView {
  const now = performance.now();
  return {
    wellFed: Math.max(0, Math.round((player.wellFedUntil ?? 0) - now)),
    foodRegen: Math.max(0, Math.round((player.foodRegenUntil ?? 0) - now)),
    sprint: Math.max(0, Math.round((player.abilityBuffs?.sprint?.until ?? 0) - now)),
    secondWind: Math.max(0, Math.round((player.abilityBuffs?.second_wind?.until ?? 0) - now)),
    ironClad: Math.max(0, Math.round((player.abilityBuffs?.ironClad?.until ?? 0) - now)),
    fleetFoot: Math.max(0, Math.round((player.abilityBuffs?.fleetFoot?.until ?? 0) - now)),
    slowed: Math.max(0, Math.round((player.slowUntil ?? 0) - now)),
    stunned: Math.max(0, Math.round((player.stunUntil ?? 0) - now)),
    weakened: Math.max(0, Math.round((player.weakUntil ?? 0) - now))
  };
}

function inInterestRange(viewer: ServerPlayer, entity: Positioned): boolean {
  if (viewer.floor !== entity.floor) return false;
  return distanceSq(viewer, entity) <= SNAPSHOT_RADIUS_SQ;
}

function inTreeInterestRange(viewer: ServerPlayer, entity: Positioned): boolean {
  if (viewer.floor !== entity.floor) return false;
  return distanceSq(viewer, entity) <= TREE_SNAPSHOT_RADIUS_SQ;
}

function eventVisibleTo(viewer: ServerPlayer, item: GameEvent): boolean {
  if (item.to && item.to !== viewer.id) return false;
  if (item.type === "chat" || item.type === "system") return true;
  if (item.type === "dialogue") return true;
  if (item.floor === null || item.x === null || item.y === null) return true;
  return inInterestRange(viewer, { floor: item.floor, x: item.x, y: item.y });
}

function persistPlayerToDb(player: ServerPlayer): void {
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
    weaponTier: player.weaponTier,
    armorTier: player.armorTier,
    wellFedUntil: player.wellFedUntil ?? 0,
    foodRegenUntil: player.foodRegenUntil ?? 0,
    inventory: serializeInventory(player.inventory),
    quests: normalizeQuestState(player.quests),
    skills: normalizeSkillState(player.skills),
    unlockedClasses: [...player.unlockedClasses],
    updatedAt: new Date().toISOString()
  };
}

function persistPlayer(player: ServerPlayer): void {
  persistPlayerToDb(player);
  queueSave();
}

function persistOnlinePlayers(): void {
  for (const session of clients.values()) persistPlayerToDb(session.player);
  queueSave();
}

function loadDb(): Database {
  if (!existsSync(SAVE_FILE)) return { players: {} };
  try {
    return JSON.parse(readFileSync(SAVE_FILE, "utf8")) as Database;
  } catch {
    return { players: {} };
  }
}

function queueSave(): void {
  saveQueued = true;
  void flushSaveQueue();
}

async function flushSaveQueue(): Promise<void> {
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

function sanitizeInput(input: Partial<InputPayload> = {}): InputPayload {
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

function cleanName(name: unknown): string {
  return String(name ?? "wanderer").trim().replace(/[^\w -]/g, "").slice(0, 18) || "wanderer";
}

function createQuestState(): Record<string, QuestState> {
  return Object.fromEntries(
    Object.values(QUESTS).map((quest) => [quest.id, { accepted: false, progress: 0, complete: false, claimed: false }])
  );
}

function normalizeQuestState(saved: unknown): Record<string, QuestState> {
  const quests = createQuestState();
  const src = (saved ?? {}) as Record<string, Partial<QuestState> | undefined>;
  for (const [id, state] of Object.entries(src)) {
    if (!quests[id] || !state) continue;
    quests[id] = {
      accepted: Boolean(state.accepted) || Boolean(state.progress) || Boolean(state.complete) || Boolean(state.claimed),
      progress: clamp(Number(state.progress ?? 0), 0, QUESTS[id]?.targetCount ?? 0),
      complete: Boolean(state.complete),
      claimed: Boolean(state.claimed)
    };
  }
  return quests;
}

function updateQuestProgress(player: ServerPlayer, monster: ServerMonster): void {
  for (const quest of Object.values(QUESTS)) {
    if (quest.kind !== "kill") continue;
    const state = player.quests[quest.id];
    if (!state || !state.accepted || state.claimed || state.complete) continue;
    if (monster.zone !== quest.zone || !quest.targetTypes.includes(monster.type)) continue;
    state.progress = clamp(state.progress + 1, 0, quest.targetCount);
    if (state.progress >= quest.targetCount) {
      state.complete = true;
      event("float", `${quest.title} ready to turn in`, player.x, player.y, player.floor, "#f7d486");
    }
  }
}

function serializeQuests(player: ServerPlayer): QuestView[] {
  return Object.values(QUESTS).map((quest) => {
    const state = player.quests[quest.id] ?? { accepted: false, progress: 0, complete: false, claimed: false };
    const progress = state.claimed
      ? quest.targetCount
      : (quest.kind === "gather" || quest.kind === "fetch")
        ? clamp(inventoryCount(player, quest.itemId ?? ""), 0, quest.targetCount)
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

function createSkillState(): Record<string, SkillStateEntry> {
  return Object.fromEntries(Object.keys(SKILLS).map((id) => [id, { xp: 0 }]));
}

function createInventory(): InventorySlot[] {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

function normalizeInventory(saved: unknown): InventorySlot[] {
  const inventory = createInventory();
  if (!Array.isArray(saved)) return inventory;
  saved.slice(0, INVENTORY_SIZE).forEach((item: { id?: unknown; qty?: unknown } | null, index: number) => {
    const id = String(item?.id ?? "");
    if (!ITEMS[id]) return;
    inventory[index] = { id, qty: Math.max(1, Math.floor(Number(item?.qty ?? 1))) };
  });
  return inventory;
}

function serializeInventory(inventory: InventorySlot[] = []): Array<InventoryItemView | null> {
  return normalizeInventory(inventory).map((item) => {
    if (!item) return null;
    const spec = ITEMS[item.id];
    if (!spec) return null;
    return { id: item.id, label: spec.label, icon: spec.icon, iconUrl: spec.iconUrl, qty: item.qty };
  });
}

function hasInventoryItem(player: ServerPlayer, id: string): boolean {
  return player.inventory.some((item) => item?.id === id && item.qty > 0);
}

function playerHasCapability(player: ServerPlayer, capability: "chop_tree" | "fish" | "mine" | "ranged"): boolean {
  for (const slot of player.inventory) {
    if (!slot || slot.qty <= 0) continue;
    const spec = ITEMS[slot.id];
    if (spec?.capabilities?.includes(capability)) return true;
  }
  return false;
}

function addInventoryItem(player: ServerPlayer, id: string, qty = 1): boolean {
  const spec = ITEMS[id];
  if (!spec) return false;
  let remaining = Math.max(1, Math.floor(qty));
  const stackable = spec.stackable !== false;
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

function removeInventoryItem(player: ServerPlayer, id: string, qty = 1): boolean {
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
    const slot = player.inventory[i];
    if (slot && slot.qty <= 0) player.inventory[i] = null;
  }
  return true;
}

function normalizeSkillState(saved: unknown): Record<string, SkillStateEntry> {
  const skills = createSkillState();
  const src = (saved ?? {}) as Record<string, { xp?: number } | undefined>;
  for (const id of Object.keys(skills)) {
    skills[id]!.xp = Math.max(0, Number(src[id]?.xp ?? 0));
  }
  return skills;
}

function serializeSkills(player: ServerPlayer): SkillView[] {
  return Object.entries(player.skills).map(([id, state]) => ({
    id,
    label: SKILLS[id]?.label ?? id,
    iconUrl: SKILLS[id]?.iconUrl ?? null,
    xp: Math.floor(state.xp),
    level: skillLevel(player, id),
    nextXp: xpForLevel(skillLevel(player, id) + 1)
  }));
}

function skillLevel(player: ServerPlayer, id: string): number {
  return Math.max(1, levelForXp(player.skills[id]?.xp ?? 0));
}

function addSkillXp(player: ServerPlayer, id: string, amount: number): void {
  const entry = player.skills[id] ?? (player.skills[id] = { xp: 0 });
  const before = skillLevel(player, id);
  entry.xp += amount;
  const after = skillLevel(player, id);
  if (after > before) event("system", `${player.name} reached ${SKILLS[id]?.label ?? id} ${after}.`);
  if (id === "defense" || id === "magic") recalculateVitals(player);
}

function fishingCatchMs(level: number): number {
  return clamp(3600 - (level - 1) * 80, 1600, 3600);
}

function miningSwingMs(level: number): number {
  if (E2E_TEST) return 150;
  return clamp(3800 - (level - 1) * 85, 1700, 3800);
}

function cookingMs(level: number): number {
  if (E2E_TEST) return 150;
  return clamp(2800 - (level - 1) * 55, 1300, 2800);
}

function firePlacementAtPlayer(player: ServerPlayer): Vec2 | null {
  if (!canStand(player.floor, player.x, player.y) || fireTooClose(player.floor, player.x, player.y)) return null;
  return { x: player.x, y: player.y };
}

function fireTooClose(floor: number, x: number, y: number): boolean {
  return [...fires.values()].some((fire) => fire.floor === floor && Math.hypot(fire.x - x, fire.y - y) < 1.2);
}

function isWellFed(player: ServerPlayer, now = performance.now()): boolean {
  return now < (player.wellFedUntil ?? 0);
}

function wellFedPower(player: ServerPlayer): number {
  return isWellFed(player) ? 2 : 0;
}

function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

function recalculateVitals(player: ServerPlayer): void {
  const spec = ADVENTURER;
  player.maxHp = spec.maxHp + (skillLevel(player, "defense") - 1) * spec.hpPerDefense;
  player.maxMana = spec.maxMana + (skillLevel(player, "magic") - 1) * spec.manaPerMagic;
}

function classOf(player: ServerPlayer): ClassSpec {
  return CLASSES[player.classKey ?? "adventurer"] ?? ADVENTURER;
}

function applyPlayerSlow(player: ServerPlayer, pct: number, ms: number): void {
  player.slowUntil = performance.now() + ms;
  player.slowMult = Math.max(0.2, 1 - pct / 100);
  event("float", "Slowed!", player.x, player.y - 0.55, player.floor, "#9ad36b");
}

function applyPlayerStun(player: ServerPlayer, ms: number): void {
  player.stunUntil = performance.now() + ms;
  event("float", "Stunned!", player.x, player.y - 0.55, player.floor, "#f0c84a");
}

function isStunned(player: ServerPlayer): boolean {
  return Boolean(player.stunUntil && performance.now() < player.stunUntil);
}

function applyPlayerWeaken(player: ServerPlayer, pct: number, ms: number): void {
  player.weakUntil = performance.now() + ms;
  player.weakMult = Math.max(0.2, 1 - pct / 100);
  event("float", "Weakened!", player.x, player.y - 0.55, player.floor, "#e6c27a");
}

// Multiplier applied to PHYSICAL (melee/ranged) damage while weakened.
function physicalMult(player: ServerPlayer): number {
  return player.weakUntil && performance.now() < player.weakUntil ? player.weakMult ?? 1 : 1;
}

function carriedWeight(player: ServerPlayer): number {
  let total = 0;
  for (const slot of player.inventory) {
    if (!slot) continue;
    total += (ITEMS[slot.id]?.weight ?? 0) * slot.qty;
  }
  return total;
}

// Linear speed falloff from full at WEIGHT_SOFT_CAP down to MIN_ENCUMBRANCE_MULT
// at WEIGHT_HARD_CAP.
function encumbranceMultiplier(weight: number): number {
  if (weight <= WEIGHT_SOFT_CAP) return 1;
  if (weight >= WEIGHT_HARD_CAP) return MIN_ENCUMBRANCE_MULT;
  const t = (weight - WEIGHT_SOFT_CAP) / (WEIGHT_HARD_CAP - WEIGHT_SOFT_CAP);
  return 1 - t * (1 - MIN_ENCUMBRANCE_MULT);
}

// True line of sight between two points: no blocked tile along the segment.
function hasLineOfSight(floor: number, ax: number, ay: number, bx: number, by: number): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist * 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    // Sight-blocking only (walls/boulders/buildings) — projectiles skim over water.
    if (isSightBlocked(tileAt(floor, Math.floor(x), Math.floor(y)))) return false;
  }
  return true;
}

function fireProjectile(player: ServerPlayer, monster: ServerMonster, damage: number, kind: string): void {
  event("projectile", kind, monster.x, monster.y, monster.floor, null, player.id, monster.id, {
    fromX: player.x,
    fromY: player.y
  });
  damageMonster(player, monster, damage, "hit");
}

function createSpatialIndex(): SpatialIndex {
  return { players: new Map(), monsters: new Map(), corpses: new Map(), npcs: new Map(), trees: new Map(), fires: new Map(), cellCount: 0 };
}

function rebuildSpatialIndex(): void {
  spatial = createSpatialIndex();
  for (const { player } of clients.values()) addToSpatial(spatial.players, player);
  for (const monster of monsters.values()) {
    if (!monster.deadUntil) addToSpatial(spatial.monsters, monster);
  }
  for (const corpse of corpses.values()) addToSpatial(spatial.corpses, corpse);
  for (const npc of npcs.values()) addToSpatial(spatial.npcs, npc);
  for (const tree of treeNodes.values()) addToSpatial(spatial.trees, tree);
  for (const fire of fires.values()) addToSpatial(spatial.fires, fire);
  spatial.cellCount =
    spatial.players.size +
    spatial.monsters.size +
    spatial.corpses.size +
    spatial.npcs.size +
    spatial.trees.size +
    spatial.fires.size;
}

function addToSpatial<T extends Positioned>(index: Map<string, T[]>, entity: T): void {
  const key = spatialKey(entity.floor, entity.x, entity.y);
  const bucket = index.get(key) ?? [];
  bucket.push(entity);
  index.set(key, bucket);
}

function removeFromSpatial<T extends Positioned>(index: Map<string, T[]>, entity: T): void {
  const key = spatialKey(entity.floor, entity.x, entity.y);
  const bucket = index.get(key);
  if (!bucket) return;
  const next = bucket.filter((item) => item !== entity);
  if (next.length) index.set(key, next);
  else index.delete(key);
}

function querySpatial<T>(index: Map<string, T[]>, floor: number, x: number, y: number, radius: number): T[] {
  const minCx = Math.floor((x - radius) / SPATIAL_CELL_SIZE);
  const maxCx = Math.floor((x + radius) / SPATIAL_CELL_SIZE);
  const minCy = Math.floor((y - radius) / SPATIAL_CELL_SIZE);
  const maxCy = Math.floor((y + radius) / SPATIAL_CELL_SIZE);
  const results: T[] = [];
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const bucket = index.get(`${floor}:${cx}:${cy}`);
      if (bucket) results.push(...bucket);
    }
  }
  return results;
}

function spatialKey(floor: number, x: number, y: number): string {
  return `${floor}:${Math.floor(x / SPATIAL_CELL_SIZE)}:${Math.floor(y / SPATIAL_CELL_SIZE)}`;
}

function event(
  type: string,
  text: string | number,
  x: number | null = null,
  y: number | null = null,
  floor: number | null = null,
  color: string | null = null,
  from: string | null = null,
  target: string | null = null,
  extra: Partial<GameEvent> = {}
): void {
  events.push({ type, text, x, y, floor, color, from, target, t: Date.now(), ...extra });
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function recordSample(samples: number[], value: number): void {
  samples.push(value);
  while (samples.length > METRIC_WINDOW) samples.shift();
}

function avg(samples: number[]): number {
  if (!samples.length) return 0;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function updateByteMetric(): void {
  const now = performance.now();
  if (now - metrics.lastBytesAt < 1000) return;
  metrics.bytesOutPerSecond = metrics.bytesOutThisSecond;
  metrics.bytesOutThisSecond = 0;
  metrics.lastBytesAt = now;
}

function roll([min, max]: Range): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
