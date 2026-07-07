import "./styles.css";
import {
  BOARD_SIZE,
  abilities,
  objective as baseObjective,
  openingLog,
  terrain as baseTerrain,
  units as baseUnits
} from "./battle-data.js";
import {
  abilityCost,
  canUseAbility as canUseAbilityRule,
  damageUnit as getDamagedUnit,
  isSafeState,
  keyFor,
  movementPreview as previewMovement,
  forcedMovementDestination as previewForcedMovementDestination,
  pullDestination as findPullDestination,
  pushDestination as findPushDestination,
  relationFor,
  resolveWait,
  terrainDamage as resolveTerrainDamage,
  tileState as getTileState,
  unitAt as findUnitAt
} from "./mechanics.js";

const clone = (value) => structuredClone(value);

const state = createInitialState();

function createInitialState() {
  const units = clone(baseUnits).map((unit) => ({ ...unit, dead: false, acted: false }));
  return {
    phase: "player",
    safe: false,
    turn: 1,
    mode: "attack",
    selectedUnitId: "sprite",
    selectedAbilityId: "oil-font",
    selectedTarget: { type: "cell", col: 5, row: 3 },
    tiles: new Map(baseTerrain.map((tile) => [keyFor(tile.col, tile.row), tile.state])),
    objective: clone(baseObjective),
    units,
    log: [...openingLog]
  };
}

function resetScenario() {
  const next = createInitialState();
  Object.assign(state, next);
  renderApp();
}

function getUnit(id) {
  return state.units.find((unit) => unit.id === id);
}

function getSelectedUnit() {
  return getUnit(state.selectedUnitId) ?? state.units.find((unit) => unit.team === "ally" && !unit.dead);
}

function getAbility(id = state.selectedAbilityId) {
  return abilities.find((ability) => ability.id === id);
}

function unitAt(col, row) {
  return findUnitAt(state.units, col, row);
}

function tileState(col, row) {
  return getTileState(state.tiles, col, row);
}

function setTileState(col, row, value) {
  const key = keyFor(col, row);
  if (value === "plain") state.tiles.delete(key);
  else state.tiles.set(key, value);
}

function hpText(unit) {
  return `${unit.hp}/${unit.maxHp}`;
}

function apText(unit) {
  return `${unit.ap}/${unit.maxAp}`;
}

function canUseAbility(unit, ability) {
  return canUseAbilityRule(unit, ability, state.phase);
}

function applyDamageUnit(unit, amount) {
  Object.assign(unit, getDamagedUnit(unit, amount));
}

function addLog(line) {
  state.log = [line, ...state.log].slice(0, 10);
}

function selectUnit(unitId) {
  const unit = getUnit(unitId);
  if (!unit || unit.dead || unit.team !== "ally" || state.phase !== "player") return;
  state.selectedUnitId = unitId;
  const firstUsable = abilities.find((ability) => relationFor(unit, ability) !== "opposite");
  state.selectedAbilityId = firstUsable?.id ?? null;
  state.selectedTarget = null;
  state.mode = "attack";
  renderApp();
}

function selectAbility(abilityId) {
  const ability = getAbility(abilityId);
  const unit = getSelectedUnit();
  if (!ability || !unit || state.phase !== "player") return;
  state.mode = "attack";
  state.selectedAbilityId = abilityId;
  state.selectedTarget = ability.target === "cell" ? { type: "cell", col: 5, row: 3 } : null;
  renderApp();
}

function selectMode(mode) {
  if (state.phase !== "player") return;
  state.mode = mode;
  state.selectedTarget = null;
  if (mode === "wait") state.selectedAbilityId = null;
  renderApp();
}

function selectCell(col, row) {
  if (state.phase !== "player") return;
  if (state.mode === "move") {
    state.selectedTarget = { type: "move", col, row };
  } else if (state.mode === "attack") {
    const ability = getAbility();
    if (ability?.target === "cell") state.selectedTarget = { type: "cell", col, row };
  }
  renderApp();
}

function selectTargetUnit(unitId) {
  if (state.phase !== "player") return;
  const unit = getUnit(unitId);
  if (!unit || unit.dead) return;
  if (state.mode === "attack" && getAbility()?.target === "unit") {
    state.selectedTarget = { type: "unit", id: unitId };
  }
  renderApp();
}

function movementPreview(unit, col, row) {
  return previewMovement({
    unit,
    col,
    row,
    boardSize: BOARD_SIZE,
    units: state.units,
    objective: state.objective,
    tiles: state.tiles
  });
}

function pushDestination(actor, target) {
  return findPushDestination({
    actor,
    target,
    boardSize: BOARD_SIZE,
    units: state.units,
    objective: state.objective,
    tiles: state.tiles
  });
}

function pullDestination(actor, target) {
  return findPullDestination({
    actor,
    target,
    boardSize: BOARD_SIZE,
    units: state.units,
    objective: state.objective,
    tiles: state.tiles
  });
}

function forcedMovementPreview(actor, target, intent) {
  return previewForcedMovementDestination({
    actor,
    target,
    intent,
    boardSize: BOARD_SIZE,
    units: state.units,
    objective: state.objective,
    tiles: state.tiles
  });
}

function forcedMovementConfig(ability) {
  if (ability?.id === "terra-push") return { intent: "push", verb: "Push", label: "Force Push" };
  if (ability?.id === "fulgur-pull") return { intent: "pull", verb: "Pull", label: "Arc Pull" };
  return null;
}

function previewAbility(unit, ability, target) {
  if (!unit || !ability) return { title: "Choose a unit and action", detail: "Move, Attack, or Wait are available in this MVP." };

  const cost = abilityCost(unit, ability);
  const relation = relationFor(unit, ability);
  if (relation === "opposite") {
    return {
      title: `${ability.name} unavailable`,
      detail: `Opposite affinity ${ability.affinity} is shown at 4 AP and disabled for ${unit.shortName}.`
    };
  }
  if (!canUseAbility(unit, ability)) {
    return {
      title: `${ability.name} lacks AP`,
      detail: `${unit.shortName} needs ${cost} AP for this ${relation} affinity skill.`
    };
  }
  if (!target) {
    return {
      title: `${ability.name} ready`,
      detail: `${relation} ${ability.affinity} skill costs ${cost} AP. Choose a ${ability.target}.`
    };
  }

  if (ability.id === "oil-font" && target.type === "cell") {
    const occupant = unitAt(target.col, target.row);
    const existing = tileState(target.col, target.row);
    return {
      title: `Oil Font -> (${target.col}, ${target.row})`,
      detail: occupant
        ? "Cannot set oil under a standing unit in this MVP."
        : `Costs ${cost} AP. Sets ${existing} tile to oil/liquid; preview chain marks this as the push destination for Oilbound Wrecker and an Ignis Spark fuel tile.`
    };
  }

  if (ability.id === "ignis-spark" && target.type === "cell") {
    const occupant = unitAt(target.col, target.row);
    const existing = tileState(target.col, target.row);
    const burn = occupant ? ` ${occupant.name} takes 3 fire damage and ${occupant.hp <= 3 ? "is neutralized" : "survives"}.` : "";
    return {
      title: `Ignis Spark -> (${target.col}, ${target.row})`,
      detail:
        existing === "oil"
          ? `Costs ${cost} AP. Ignites oil into fire, creates a burning tile, and resolves fire damage.${burn}`
          : `Costs ${cost} AP. Creates fire on ${existing} terrain; oil gives the cleanest chain preview.${burn}`
    };
  }

  const movementConfig = forcedMovementConfig(ability);
  if (movementConfig && target.type === "unit") {
    const targetUnit = getUnit(target.id);
    if (!targetUnit) return { title: `No ${movementConfig.intent} target`, detail: `Choose a unit to ${movementConfig.intent}.` };
    if (targetUnit.immovable) {
      return {
        title: `${movementConfig.label} -> ${targetUnit.shortName}`,
        detail: `${targetUnit.name} has Immovable shell; the ${movementConfig.intent} is resisted and displacement is blocked.`
      };
    }
    const result = forcedMovementPreview(unit, targetUnit, movementConfig.intent);
    if (!result.ok) {
      return {
        title: `${movementConfig.label} -> ${targetUnit.name}`,
        detail: `Costs ${cost} AP. Deals 1 damage, but no legal ${movementConfig.intent} destination is open: ${result.detail}`
      };
    }
    const destination = result.destination;
    const terrainLine =
      destination.state === "fire"
        ? " Fire damage adds 3 more and neutralizes the forecast if HP reaches 0."
        : destination.state === "oil"
          ? " Target lands in oil; Ignis Spark preview will ignite it next."
          : "";
    return {
      title: `${movementConfig.label} -> ${targetUnit.name}`,
      detail: `Costs ${cost} AP. ${movementConfig.verb} destination (${destination.col}, ${destination.row}) is ${destination.state}; ${movementConfig.intent} damage 1.${terrainLine}`
    };
  }

  return { title: ability.name, detail: ability.detail };
}

function buildPreview() {
  const unit = getSelectedUnit();
  if (state.phase === "won") return { title: "Victory", detail: "All forecast threats are neutralized; the beacon is safe." };
  if (state.phase === "lost") return { title: "Defeat", detail: "The one-turn forecast was not solved before waiting." };
  if (state.mode === "wait") {
    const result = resolveWait(state.units);
    return {
      title: "Wait / End Turn",
      detail: result.liveEnemies.length
        ? `Waiting now fails: ${result.liveEnemies.map((enemy) => enemy.name).join(" and ")} still threaten the Signal Beacon.`
        : "Waiting now resolves safely because every enemy intent is neutralized."
    };
  }
  if (state.mode === "move") {
    const target = state.selectedTarget;
    if (!target) return { title: "Move", detail: "Choose a destination tile. Sprite can fly over liquid and blockers; Tortollan cannot." };
    return {
      title: `Move -> (${target.col}, ${target.row})`,
      detail: movementPreview(unit, target.col, target.row).detail
    };
  }
  return previewAbility(unit, getAbility(), state.selectedTarget);
}

function commitMove() {
  const unit = getSelectedUnit();
  const target = state.selectedTarget;
  if (!unit || !target || target.type !== "move") return;
  const preview = movementPreview(unit, target.col, target.row);
  if (!preview.ok) {
    addLog(`Move blocked: ${preview.detail}`);
    renderApp();
    return;
  }
  unit.col = target.col;
  unit.row = target.row;
  unit.ap -= 1;
  addLog(`${unit.name} moved to (${target.col}, ${target.row}) for 1 AP. ${unit.flying ? "Flying ignored liquid/block routes." : "Grounded movement respected terrain."}`);
  state.selectedTarget = null;
  renderApp();
}

function commitAbility() {
  const actor = getSelectedUnit();
  const ability = getAbility();
  const target = state.selectedTarget;
  if (!actor || !ability || !target || !canUseAbility(actor, ability)) return;
  const cost = abilityCost(actor, ability);

  if (ability.id === "oil-font" && target.type === "cell") {
    if (unitAt(target.col, target.row)) {
      addLog("Oil Font blocked: occupied tiles cannot receive liquid in this MVP.");
      renderApp();
      return;
    }
    setTileState(target.col, target.row, "oil");
    actor.ap -= cost;
    addLog(`${actor.name} used Oil Font (${relationFor(actor, ability)}, ${cost} AP): oil/liquid set at (${target.col}, ${target.row}).`);
  } else if (ability.id === "ignis-spark" && target.type === "cell") {
    setTileState(target.col, target.row, "fire");
    const occupant = unitAt(target.col, target.row);
    const before = occupant?.hp ?? null;
    if (occupant) applyDamageUnit(occupant, 3);
    actor.ap -= cost;
    addLog(
      `${actor.name} used Ignis Spark (${relationFor(actor, ability)}, ${cost} AP): oil ignited into fire at (${target.col}, ${target.row})${
        occupant ? `; ${occupant.name} took 3 (${before}->${occupant.hp}).` : "."
      }`
    );
  } else if (forcedMovementConfig(ability) && target.type === "unit") {
    const movementConfig = forcedMovementConfig(ability);
    const targetUnit = getUnit(target.id);
    if (!targetUnit || targetUnit.dead) return;
    actor.ap -= cost;
    if (targetUnit.immovable) {
      addLog(`${actor.name} used ${movementConfig.label} (${relationFor(actor, ability)}, ${cost} AP): ${targetUnit.name}'s Immovable shell blocked displacement.`);
    } else {
      const result = forcedMovementPreview(actor, targetUnit, movementConfig.intent);
      const destination = movementConfig.intent === "pull" ? pullDestination(actor, targetUnit) : pushDestination(actor, targetUnit);
      const before = targetUnit.hp;
      applyDamageUnit(targetUnit, 1);
      let terrainLine = "";
      if (destination && !targetUnit.dead) {
        targetUnit.col = destination.col;
        targetUnit.row = destination.row;
        const terrainResult = resolveTerrainDamage(targetUnit, state.tiles);
        Object.assign(targetUnit, terrainResult.unit);
        terrainLine = terrainResult.log ? `; ${terrainResult.log}` : `; ${movementConfig.intent}ed to (${destination.col}, ${destination.row}) ${destination.state}`;
      } else if (!result.ok) {
        terrainLine = `; displacement blocked: ${result.detail}`;
      }
      addLog(`${actor.name} used ${movementConfig.label} (${relationFor(actor, ability)}, ${cost} AP): ${targetUnit.name} took 1 (${before}->${targetUnit.hp})${terrainLine}.`);
    }
  }

  state.selectedTarget = null;
  checkSolved();
  renderApp();
}

function waitTurn() {
  const result = resolveWait(state.units);
  state.phase = result.phase;
  if (result.liveEnemies.length) {
    addLog(`Defeat: ${result.liveEnemies.map((enemy) => enemy.name).join(" and ")} carried out the forecast against the Signal Beacon.`);
  } else {
    addLog("Victory: wait resolved safely because every hostile forecast was neutralized.");
  }
  renderApp();
}

function checkSolved() {
  if (isSafeState(state.units) && !state.safe) {
    state.safe = true;
    addLog("Safe state: all forecasted threats are neutralized. Wait to lock the victory.");
  }
}

function terrainLabel(col, row) {
  const stateName = tileState(col, row);
  if (stateName === "plain") return "plain tile";
  if (stateName === "block") return "raised blocker";
  return `${stateName} tile`;
}

function renderCell(col, row) {
  const stateName = tileState(col, row);
  const target = state.selectedTarget;
  const selected =
    target && (target.type === "cell" || target.type === "move") && target.col === col && target.row === row;
  return `
    <button
      class="cell ${stateName} ${selected ? "selected-cell" : ""}"
      style="--col:${col}; --row:${row};"
      data-cell="${col},${row}"
      aria-label="Tile ${col},${row} ${terrainLabel(col, row)}">
      <span>${stateName === "plain" ? "" : stateName}</span>
    </button>
  `;
}

function renderUnit(unit) {
  if (unit.dead) return "";
  const selected = unit.id === state.selectedUnitId;
  const target = state.selectedTarget?.type === "unit" && state.selectedTarget.id === unit.id;
  const traitText = unit.team === "ally" ? ` ${unit.primary}/${unit.secondary} ${unit.traits.join(", ")}` : ` ${unit.intent}`;
  return `
    <button
      class="unit-token ${unit.team} ${unit.color} ${selected ? "selected" : ""} ${target ? "targeted" : ""}"
      style="--col:${unit.col}; --row:${unit.row};"
      data-unit-id="${unit.id}"
      aria-label="${unit.name} HP ${hpText(unit)} AP ${apText(unit)} at ${unit.col},${unit.row}${traitText}">
      <strong>${unit.chip}</strong>
      <span>${unit.shortName ?? unit.name}</span>
      <em>HP ${hpText(unit)}${unit.team === "ally" ? ` AP ${apText(unit)}` : ""}</em>
    </button>
  `;
}

function renderObjective() {
  return `
    <div class="objective-token" style="--col:${state.objective.col}; --row:${state.objective.row};" aria-label="TIB Gathering Signal Beacon objective HP ${state.objective.hp}/${state.objective.maxHp}">
      <strong>Beacon</strong>
      <span>one-turn fail target</span>
    </div>
  `;
}

function renderBoard() {
  const cells = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) cells.push(renderCell(col, row));
  }
  return `
    <section class="board-wrap" aria-label="TIB Gathering Tactics MVP board">
      <div class="grid-board">
        ${cells.join("")}
        ${renderObjective()}
        ${state.units.map(renderUnit).join("")}
      </div>
    </section>
  `;
}

function renderAbilityButton(unit, ability) {
  const relation = relationFor(unit, ability);
  const cost = abilityCost(unit, ability);
  const disabled = relation === "opposite" || unit.ap < cost || state.phase !== "player";
  return `
    <button
      class="ability-card ${state.selectedAbilityId === ability.id ? "active" : ""}"
      data-ability-id="${ability.id}"
      type="button"
      ${disabled ? "disabled" : ""}
      aria-label="${ability.name} ${ability.affinity} ${relation} cost ${cost} AP ${disabled ? "disabled" : "available"}">
      <strong>${ability.name}</strong>
      <span>${ability.kind} / ${ability.affinity}</span>
      <em>${relation} cost ${cost} AP${relation === "opposite" ? " unavailable" : ""}</em>
    </button>
  `;
}

function renderUnitCard(unit) {
  return `
    <button class="roster-card ${unit.id === state.selectedUnitId ? "active" : ""}" data-roster-id="${unit.id}" type="button">
      <strong>${unit.name}</strong>
      <span>HP ${hpText(unit)} / AP ${apText(unit)}</span>
      <em>${unit.race}: ${unit.traits.join(" + ")}</em>
      <small>Primary ${unit.primary} = 1 AP; Sub-job ${unit.secondary} = 2 AP; opposite = 4 AP unavailable.</small>
    </button>
  `;
}

function renderEnemyCard(unit) {
  return `
    <li>
      <strong>${unit.name}</strong>
      <span>HP ${hpText(unit)} at (${unit.col}, ${unit.row})</span>
      <em>${unit.dead ? "Neutralized" : unit.intent}</em>
    </li>
  `;
}

function renderHud() {
  const selected = getSelectedUnit();
  const preview = buildPreview();
  const phaseText = state.phase === "player" ? "Player Turn 1" : state.phase === "won" ? "Victory / Safe" : "Defeat / Forecast hit";
  return `
    <aside class="hud" aria-label="MVP combat HUD">
      <section class="panel status-panel">
        <p>TIB Gathering Prototype</p>
        <h1>Tactics Affinity MVP</h1>
        <div class="phase-pill">${phaseText}</div>
      </section>

      <section class="panel selected-panel">
        <div class="selected-title">
          <div>
            <p>Selected build</p>
            <h2>${selected?.name ?? "None"}</h2>
          </div>
          <strong>${selected ? `HP ${hpText(selected)} AP ${apText(selected)}` : "--"}</strong>
        </div>
        <div class="build-grid">
          <span>Primary ${selected?.primary ?? "--"}: 1 AP</span>
          <span>Sub-job ${selected?.secondary ?? "--"}: 2 AP</span>
          <span>Opposite: 4 AP unavailable</span>
        </div>
        <div class="preview" aria-live="polite">
          <span>Preview</span>
          <strong>${preview.title}</strong>
          <small>${preview.detail}</small>
        </div>
      </section>

      <section class="panel mode-panel" aria-label="Action controls">
        <div class="segmented">
          <button class="${state.mode === "move" ? "active" : ""}" data-mode="move" type="button">Move</button>
          <button class="${state.mode === "attack" ? "active" : ""}" data-mode="attack" type="button">Attack</button>
          <button class="${state.mode === "wait" ? "active" : ""}" data-mode="wait" type="button">Wait</button>
        </div>
        <div class="ability-list">
          ${selected ? abilities.map((ability) => renderAbilityButton(selected, ability)).join("") : ""}
        </div>
        <div class="commit-row">
          <button class="commit-button" data-action="commit" type="button" ${state.phase !== "player" ? "disabled" : ""}>Commit</button>
          <button class="wait-button" data-action="wait" type="button" ${state.phase !== "player" ? "disabled" : ""}>Wait / End Turn</button>
          <button class="reset-button" data-action="reset" type="button">Reset</button>
        </div>
      </section>

      <section class="panel roster-panel">
        <p>Two-build roster</p>
        <div class="roster-list">
          ${state.units.filter((unit) => unit.team === "ally").map(renderUnitCard).join("")}
        </div>
      </section>

      <section class="panel enemy-panel">
        <p>Deterministic forecast</p>
        <ul>${state.units.filter((unit) => unit.team === "enemy").map(renderEnemyCard).join("")}</ul>
      </section>

      <section class="panel log-panel" aria-label="Combat log">
        <p>Combat log</p>
        <ol>${state.log.map((line) => `<li>${line}</li>`).join("")}</ol>
      </section>
    </aside>
  `;
}

function renderApp() {
  document.querySelector("#app").innerHTML = `
    <main class="app-shell">
      <div class="layout">
        ${renderBoard()}
        ${renderHud()}
      </div>
    </main>
  `;
}

document.addEventListener("click", (event) => {
  const rosterButton = event.target.closest("[data-roster-id]");
  if (rosterButton) {
    selectUnit(rosterButton.dataset.rosterId);
    return;
  }

  const unitButton = event.target.closest("[data-unit-id]");
  if (unitButton) {
    const unit = getUnit(unitButton.dataset.unitId);
    if (unit && state.mode === "attack" && getAbility()?.target === "cell") {
      selectCell(unit.col, unit.row);
    } else if (unit?.team === "ally" && state.mode === "attack" && getAbility()?.target === "unit" && unit.id !== state.selectedUnitId) {
      selectTargetUnit(unit.id);
    } else if (unit?.team === "ally") selectUnit(unit.id);
    else if (unit?.team === "enemy") selectTargetUnit(unit.id);
    return;
  }

  const cellButton = event.target.closest("[data-cell]");
  if (cellButton) {
    const [col, row] = cellButton.dataset.cell.split(",").map(Number);
    selectCell(col, row);
    return;
  }

  const abilityButton = event.target.closest("[data-ability-id]");
  if (abilityButton) {
    selectAbility(abilityButton.dataset.abilityId);
    return;
  }

  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) {
    selectMode(modeButton.dataset.mode);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  if (actionButton.dataset.action === "commit") {
    if (state.mode === "move") commitMove();
    else if (state.mode === "attack") commitAbility();
    else waitTurn();
  }
  if (actionButton.dataset.action === "wait") waitTurn();
  if (actionButton.dataset.action === "reset") resetScenario();
});

renderApp();
