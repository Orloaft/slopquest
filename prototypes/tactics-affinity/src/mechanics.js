export const keyFor = (col, row) => `${col},${row}`;

export function inBounds(col, row, boardSize) {
  return col >= 0 && row >= 0 && col < boardSize && row < boardSize;
}

export function liveUnits(units) {
  return units.filter((unit) => !unit.dead);
}

export function unitAt(units, col, row) {
  return liveUnits(units).find((unit) => unit.col === col && unit.row === row);
}

export function tileState(tiles, col, row) {
  return tiles.get(keyFor(col, row)) ?? "plain";
}

export function relationFor(unit, ability) {
  if (!unit || !ability) return "unavailable";
  if (ability.id === "void-snare") return "opposite";
  if (ability.affinity === unit.primary) return "primary";
  if (ability.affinity === unit.secondary) return "secondary";
  return "opposite";
}

export function abilityCost(unit, ability) {
  const relation = relationFor(unit, ability);
  if (relation === "primary") return 1;
  if (relation === "secondary") return 2;
  return 4;
}

export function canUseAbility(unit, ability, phase = "player") {
  if (!unit || !ability || unit.dead || phase !== "player") return false;
  if (relationFor(unit, ability) === "opposite") return false;
  return unit.ap >= abilityCost(unit, ability);
}

export function movementPreview({ unit, col, row, boardSize, units, objective, tiles }) {
  if (!unit) return { ok: false, detail: "No unit selected." };
  if (!inBounds(col, row, boardSize)) return { ok: false, detail: "Outside the board." };
  if (unitAt(units, col, row)) return { ok: false, detail: "Occupied by another unit." };
  if (objective.col === col && objective.row === row) return { ok: false, detail: "The beacon blocks this tile." };

  const distance = Math.abs(unit.col - col) + Math.abs(unit.row - row);
  const stateName = tileState(tiles, col, row);
  if (distance > 8) return { ok: false, detail: "Too far for this whitebox move." };
  if (!unit.flying && ["water", "oil", "fire", "block"].includes(stateName)) {
    return { ok: false, detail: `${unit.shortName} is grounded and cannot enter ${stateName} terrain.` };
  }
  if (unit.ap < 1) return { ok: false, detail: `${unit.shortName} lacks the 1 AP move cost.` };

  return {
    ok: true,
    detail: unit.flying
      ? `Flying move to (${col}, ${row}) costs 1 AP and ignores liquid/block routes.`
      : `Ground move to (${col}, ${row}) costs 1 AP.`
  };
}

export function forcedMovementDestination({ actor, target, intent = "push", boardSize, units, objective, tiles }) {
  if (!actor || !target) return { ok: false, reason: "missing-unit", detail: "Forced movement needs an actor and target." };

  const dx = Math.sign(target.col - actor.col);
  const dy = Math.sign(target.row - actor.row);
  if (!dx && !dy) {
    return { ok: false, reason: "same-cell", detail: "Forced movement needs a direction." };
  }

  const force = intent === "pull" ? -1 : 1;
  const col = target.col + dx * force;
  const row = target.row + dy * force;
  if (!inBounds(col, row, boardSize)) {
    return { ok: false, reason: "bounds", detail: "Destination is outside the board." };
  }
  if (unitAt(units, col, row)) {
    return { ok: false, reason: "occupied", detail: "Destination is occupied by another unit." };
  }
  if (objective.col === col && objective.row === row) {
    return { ok: false, reason: "objective", detail: "The beacon blocks the destination." };
  }

  const state = tileState(tiles, col, row);
  if (state === "block") {
    return { ok: false, reason: "blocker-terrain", detail: "Raised blocker terrain stops forced movement." };
  }
  return { ok: true, destination: { col, row, state }, detail: `Destination (${col}, ${row}) is ${state}.` };
}

export function pushDestination(args) {
  return forcedMovementDestination({ ...args, intent: "push" }).destination ?? null;
}

export function pullDestination(args) {
  return forcedMovementDestination({ ...args, intent: "pull" }).destination ?? null;
}

export function damageUnit(unit, amount) {
  const hp = Math.max(0, unit.hp - amount);
  return {
    ...unit,
    hp,
    dead: hp <= 0 ? true : unit.dead
  };
}

export function terrainDamage(unit, tiles) {
  const stateName = tileState(tiles, unit.col, unit.row);
  if (stateName !== "fire") return { unit, log: null, damage: 0 };

  const nextUnit = damageUnit(unit, 3);
  return {
    unit: nextUnit,
    log: `${unit.name} burned for 3 on fire`,
    damage: 3
  };
}

export function liveEnemies(units) {
  return liveUnits(units).filter((unit) => unit.team === "enemy");
}

export function isSafeState(units) {
  return liveEnemies(units).length === 0;
}

export function resolveWait(units) {
  const enemies = liveEnemies(units);
  return {
    phase: enemies.length ? "lost" : "won",
    liveEnemies: enemies,
    safe: enemies.length === 0
  };
}
