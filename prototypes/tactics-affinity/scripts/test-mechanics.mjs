import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  abilities,
  objective,
  terrain,
  units as baseUnits
} from "../src/battle-data.js";
import {
  abilityCost,
  canUseAbility,
  damageUnit,
  forcedMovementDestination,
  keyFor,
  movementPreview,
  pullDestination,
  pushDestination,
  relationFor,
  resolveWait,
  terrainDamage
} from "../src/mechanics.js";

const clone = (value) => structuredClone(value);
const ability = (id) => abilities.find((candidate) => candidate.id === id);
const unit = (units, id) => units.find((candidate) => candidate.id === id);

function freshUnits(overrides = {}) {
  return clone(baseUnits).map((candidate) => ({
    ...candidate,
    dead: false,
    acted: false,
    ...overrides[candidate.id]
  }));
}

function terrainMap(extra = []) {
  return new Map([...terrain, ...extra].map((tile) => [keyFor(tile.col, tile.row), tile.state]));
}

function preview({ units = freshUnits(), tiles = terrainMap(), actorId = "sprite", col, row }) {
  return movementPreview({
    unit: unit(units, actorId),
    col,
    row,
    boardSize: BOARD_SIZE,
    units,
    objective,
    tiles
  });
}

function assertBlocked(result, pattern, label) {
  assert.equal(result.ok, false, label);
  assert.match(result.detail, pattern, label);
}

function runAffinityTests() {
  const units = freshUnits();
  const tortollan = unit(units, "tortollan");

  assert.equal(relationFor(tortollan, ability("terra-push")), "primary");
  assert.equal(abilityCost(tortollan, ability("terra-push")), 1);
  assert.equal(relationFor(tortollan, ability("fulgur-pull")), "secondary");
  assert.equal(abilityCost(tortollan, ability("fulgur-pull")), 2);
  assert.equal(relationFor(tortollan, ability("ignis-spark")), "secondary");
  assert.equal(abilityCost(tortollan, ability("ignis-spark")), 2);
  assert.equal(relationFor(tortollan, ability("void-snare")), "opposite");
  assert.equal(abilityCost(tortollan, ability("void-snare")), 4);
  assert.equal(canUseAbility(tortollan, ability("void-snare"), "player"), false);
}

function runMovementTests() {
  const tiles = terrainMap([
    { col: 0, row: 1, state: "oil" },
    { col: 0, row: 2, state: "fire" },
    { col: 0, row: 3, state: "oil" },
    { col: 1, row: 2, state: "fire" }
  ]);

  assert.equal(preview({ tiles, col: 2, row: 1 }).ok, true, "flying enters water");
  assert.equal(preview({ tiles, col: 3, row: 1 }).ok, true, "flying enters block");
  assert.equal(preview({ tiles, col: 0, row: 1 }).ok, true, "flying enters oil");
  assert.equal(preview({ tiles, col: 0, row: 2 }).ok, true, "flying enters fire");

  assertBlocked(preview({ tiles, actorId: "tortollan", col: 2, row: 2 }), /grounded.*water/i, "grounded rejects water");
  assertBlocked(preview({ tiles, actorId: "tortollan", col: 0, row: 3 }), /grounded.*oil/i, "grounded rejects oil");
  assertBlocked(preview({ tiles, actorId: "tortollan", col: 1, row: 2 }), /grounded.*fire/i, "grounded rejects fire");
  assertBlocked(preview({ tiles, actorId: "tortollan", col: 3, row: 1 }), /grounded.*block/i, "grounded rejects block");

  assertBlocked(preview({ col: 1, row: 3 }), /occupied/i, "movement rejects occupied");
  assertBlocked(preview({ col: objective.col, row: objective.row }), /beacon/i, "movement rejects objective");
  assertBlocked(preview({ col: -1, row: 1 }), /outside/i, "movement rejects out-of-bounds");
  assertBlocked(preview({ col: 7, row: 7 }), /too far/i, "movement rejects excessive distance");
}

function runPushTests() {
  const tiles = terrainMap([{ col: 5, row: 3, state: "oil" }]);
  const currentUnits = freshUnits();
  const openDestination = pushDestination({
    actor: unit(currentUnits, "tortollan"),
    target: unit(currentUnits, "oilbound-wrecker"),
    boardSize: BOARD_SIZE,
    units: currentUnits,
    objective,
    tiles
  });
  assert.deepEqual(openDestination, { col: 5, row: 3, state: "oil" });

  const pullDestinationResult = pullDestination({
    actor: unit(currentUnits, "tortollan"),
    target: unit(currentUnits, "oilbound-wrecker"),
    boardSize: BOARD_SIZE,
    units: currentUnits,
    objective,
    tiles
  });
  assert.deepEqual(pullDestinationResult, { col: 3, row: 3, state: "plain" });

  assert.equal(
    pushDestination({
      actor: { id: "actor", col: 6, row: 3 },
      target: { id: "target", col: 7, row: 3 },
      boardSize: BOARD_SIZE,
      units: [],
      objective,
      tiles
    }),
    null,
    "push blocks on board edge"
  );

  assert.equal(
    pushDestination({
      actor: { id: "actor", col: 2, row: 3 },
      target: { id: "target", col: 3, row: 3 },
      boardSize: BOARD_SIZE,
      units: [{ id: "blocker", col: 4, row: 3 }],
      objective,
      tiles
    }),
    null,
    "push blocks on occupied destination"
  );

  assert.equal(
    pushDestination({
      actor: { id: "actor", col: 4, row: 3 },
      target: { id: "target", col: 5, row: 3 },
      boardSize: BOARD_SIZE,
      units: [],
      objective,
      tiles
    }),
    null,
    "push blocks on objective destination"
  );

  assert.equal(
    pushDestination({
      actor: { id: "actor", col: 1, row: 1 },
      target: { id: "target", col: 2, row: 1 },
      boardSize: BOARD_SIZE,
      units: [],
      objective,
      tiles
    }),
    null,
    "push blocks on raised blocker terrain"
  );

  assert.equal(
    pullDestination({
      actor: { id: "actor", col: 4, row: 1 },
      target: { id: "target", col: 5, row: 1 },
      boardSize: BOARD_SIZE,
      units: [],
      objective,
      tiles
    }),
    null,
    "pull blocks on raised blocker terrain"
  );

  assert.equal(
    pullDestination({
      actor: { id: "actor", col: 3, row: 3 },
      target: { id: "target", col: 4, row: 3 },
      boardSize: BOARD_SIZE,
      units: [{ id: "actor", col: 3, row: 3 }],
      objective,
      tiles
    }),
    null,
    "pull blocks on occupied actor cell"
  );

  const blockedByTerrain = forcedMovementDestination({
    actor: { id: "actor", col: 1, row: 1 },
    target: { id: "target", col: 2, row: 1 },
    intent: "push",
    boardSize: BOARD_SIZE,
    units: [],
    objective,
    tiles
  });
  assert.equal(blockedByTerrain.ok, false);
  assert.equal(blockedByTerrain.reason, "blocker-terrain");
}

function runTerrainAndWaitTests() {
  const burningTiles = terrainMap([{ col: 0, row: 0, state: "fire" }]);
  const burned = terrainDamage({ id: "test", name: "Test Enemy", team: "enemy", hp: 3, col: 0, row: 0 }, burningTiles);
  assert.equal(burned.damage, 3);
  assert.equal(burned.unit.hp, 0);
  assert.equal(burned.unit.dead, true);
  assert.match(burned.log, /burned for 3 on fire/);

  assert.deepEqual(damageUnit({ id: "test", hp: 1, dead: false }, 3), { id: "test", hp: 0, dead: true });

  assert.equal(resolveWait(freshUnits()).phase, "lost", "wait loses with live enemies");
  assert.equal(
    resolveWait(freshUnits({ "oilbound-wrecker": { dead: true, hp: 0 }, "cinder-guard": { dead: true, hp: 0 } })).phase,
    "won",
    "wait wins when all enemies are dead"
  );
}

runAffinityTests();
runMovementTests();
runPushTests();
runTerrainAndWaitTests();

console.log("PASS mechanics extraction rules");
