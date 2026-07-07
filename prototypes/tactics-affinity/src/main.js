import "./styles.css";
import {
  intents as baseIntents,
  logLines as baseLogLines,
  objective as baseObjective,
  overlays,
  props,
  units as baseUnits
} from "./battle-data.js";

const SPRITE_ROOT = "/assets/generated/ruined-crossing-v1/sprites";
const FLAT_BOARD_ROOT = "/assets/generated/ruined-crossing-v1/flat-board";
const ACTOR_SHEET = "/assets/generated/actor-feet-outline-v4/generated-low-res-actor-poses.png";
const BOARD_SIZE = 8;
const actorRows = {
  "iron-guard": 0,
  "verdant-ranger": 1,
  "radiant-acolyte": 2,
  "grave-skitter": 3,
  "stone-brute": 4,
  "grave-archer": 5
};
const poseColumns = {
  idle: 0,
  windup: 1,
  hit: 2,
  move: 3
};

const abilities = {
  "iron-guard": [
    {
      id: "shield-bash",
      name: "Shield Bash",
      detail: "Deal 3 and push Stone Brute 1 tile. Pushed brutes miss the shrine line.",
      targetTeam: "enemy"
    }
  ],
  "verdant-ranger": [
    {
      id: "root-shot",
      name: "Root Shot",
      detail: "Deal 2 and root Grave Skitter, preventing its leap this enemy turn.",
      targetTeam: "enemy"
    }
  ],
  "radiant-acolyte": [
    {
      id: "ward",
      name: "Ward",
      detail: "Ward the shrine, absorbing the next incoming objective hit.",
      targetTeam: "objective"
    }
  ]
};

const initialAbilityByUnit = {
  "iron-guard": "shield-bash",
  "verdant-ranger": "root-shot",
  "radiant-acolyte": "ward"
};

const sprite = (name) => `${SPRITE_ROOT}/${name}.png`;
const clampHp = (value, max) => Math.max(0, Math.min(max, value));

function parseHp(hp) {
  const [current, max] = hp.split("/").map((part) => Number.parseInt(part, 10));
  return { hp: current, maxHp: max };
}

function hpText(entity) {
  return `${entity.hp}/${entity.maxHp}`;
}

function cellVars({ col, row }, layer = 0) {
  return `--col:${col}; --row:${row}; --iso-x:${col - row}; --iso-y:${col + row}; --z:${(col + row) * 12 + col + layer};`;
}

function img(name, alt, className = "") {
  return `<img class="${className}" src="${sprite(name)}" alt="${alt}" draggable="false" />`;
}

function createInitialState() {
  const selectedUnitId = "iron-guard";

  return {
    turn: 3,
    phase: "player",
    selectedUnitId,
    selectedAbilityId: initialAbilityByUnit[selectedUnitId],
    selectedTargetId: "stone-brute",
    combatResult: null,
    objective: {
      ...baseObjective,
      ...parseHp(baseObjective.hp),
      warded: false
    },
    units: baseUnits.map((unit) => ({
      ...unit,
      ...parseHp(unit.hp),
      acted: false,
      dead: false,
      statuses: []
    })),
    log: [...baseLogLines]
  };
}

const state = createInitialState();

function getUnit(id) {
  return state.units.find((unit) => unit.id === id);
}

function getSelectedUnit() {
  return getUnit(state.selectedUnitId) ?? state.units.find((unit) => unit.team === "ally" && !unit.dead);
}

function getSelectedAbility() {
  const selected = getSelectedUnit();
  return selected ? abilities[selected.id]?.find((ability) => ability.id === state.selectedAbilityId) : null;
}

function selectUnit(unitId) {
  const unit = getUnit(unitId);
  if (!unit || unit.dead || unit.team !== "ally" || state.phase !== "player") return;
  state.selectedUnitId = unitId;
  state.selectedAbilityId = initialAbilityByUnit[unitId] ?? abilities[unitId]?.[0]?.id ?? null;
  state.selectedTargetId = defaultTargetForAbility(state.selectedAbilityId);
  state.combatResult = null;
  renderApp();
}

function selectAbility(abilityId) {
  const selected = getSelectedUnit();
  if (!selected || selected.acted || state.phase !== "player") return;
  state.selectedAbilityId = abilityId;
  state.selectedTargetId = defaultTargetForAbility(abilityId);
  state.combatResult = null;
  renderApp();
}

function selectTarget(targetId) {
  if (state.phase !== "player") return;
  const ability = getSelectedAbility();
  const target = targetId === "objective" ? state.objective : getUnit(targetId);
  if (!ability || !target || target.dead) return;
  if (ability.targetTeam === "objective" && targetId !== "objective") return;
  if (ability.targetTeam === "enemy" && target.team !== "enemy") return;
  state.selectedTargetId = targetId;
  renderApp();
}

function defaultTargetForAbility(abilityId) {
  if (abilityId === "shield-bash") return "stone-brute";
  if (abilityId === "root-shot") return "grave-skitter";
  if (abilityId === "ward") return "objective";
  return null;
}

function occupiedCell(col, row, ignoreUnitId) {
  if (state.objective.col === col && state.objective.row === row) return true;
  if (props.some((prop) => prop.col === col && prop.row === row && prop.className.includes("low-prop"))) return true;
  return state.units.some((unit) => !unit.dead && unit.id !== ignoreUnitId && unit.col === col && unit.row === row);
}

function pushDestination(attacker, target) {
  const dx = Math.sign(target.col - attacker.col);
  const dy = Math.sign(target.row - attacker.row);
  const col = target.col + dx;
  const row = target.row + dy;
  if (col < 0 || row < 0 || col >= BOARD_SIZE || row >= BOARD_SIZE) return null;
  if (occupiedCell(col, row, target.id)) return null;
  return { col, row };
}

function targetName(targetId) {
  if (targetId === "objective") return "Shrine";
  return getUnit(targetId)?.name ?? "No target";
}

function buildPreview() {
  const actor = getSelectedUnit();
  const ability = getSelectedAbility();
  if (!actor || !ability) {
    return {
      title: "No action selected",
      detail: "Select an adventurer and choose an ability."
    };
  }

  if (actor.acted) {
    return {
      title: `${actor.name} has acted`,
      detail: "Choose another adventurer or end the player turn."
    };
  }

  if (!state.selectedTargetId) {
    return {
      title: `${ability.name} -> choose target`,
      detail: ability.detail
    };
  }

  if (ability.id === "shield-bash") {
    const target = getUnit(state.selectedTargetId);
    const push = target ? pushDestination(actor, target) : null;
    return {
      title: `Shield Bash -> ${targetName(state.selectedTargetId)}`,
      detail: push
        ? `Deals 3 damage and pushes 1 tile to (${push.col}, ${push.row}); Stone Brute will miss the shrine line.`
        : "Deals 3 damage; push is blocked, so the brute keeps its shrine line."
    };
  }

  if (ability.id === "root-shot") {
    return {
      title: `Root Shot -> ${targetName(state.selectedTargetId)}`,
      detail: "Deals 2 damage and roots Grave Skitter; rooted Skitter cannot leap during enemy resolution."
    };
  }

  if (ability.id === "ward") {
    return {
      title: "Ward -> Shrine",
      detail: "Applies a ward to absorb the next objective hit during enemy resolution."
    };
  }

  return {
    title: `${ability.name} -> ${targetName(state.selectedTargetId)}`,
    detail: ability.detail
  };
}

function addStatus(unit, status) {
  if (!unit.statuses.includes(status)) unit.statuses.push(status);
}

function damageUnit(unit, amount) {
  unit.hp = clampHp(unit.hp - amount, unit.maxHp);
  unit.dead = unit.hp <= 0;
  unit.poseState = unit.dead ? "hit" : "hit";
}

function commitAction() {
  const actor = getSelectedUnit();
  const ability = getSelectedAbility();
  if (!actor || !ability || actor.acted || state.phase !== "player") return;
  if (!state.selectedTargetId) return;

  const target = state.selectedTargetId === "objective" ? state.objective : getUnit(state.selectedTargetId);
  if (!target || target.dead) return;

  const newLog = [];
  if (ability.id === "shield-bash" && target.id === "stone-brute") {
    const push = pushDestination(actor, target);
    damageUnit(target, 3);
    if (push && !target.dead) {
      target.col = push.col;
      target.row = push.row;
      target.poseState = "move";
      newLog.push("Iron Guard used Shield Bash: Stone Brute took 3 and was pushed off the shrine line.");
    } else {
      newLog.push("Iron Guard used Shield Bash: Stone Brute took 3, but the push lane was blocked.");
    }
  } else if (ability.id === "root-shot" && target.id === "grave-skitter") {
    damageUnit(target, 2);
    if (!target.dead) addStatus(target, "rooted");
    newLog.push("Verdant Ranger used Root Shot: Grave Skitter took 2 and is rooted for enemy resolution.");
  } else if (ability.id === "ward" && state.selectedTargetId === "objective") {
    state.objective.warded = true;
    newLog.push("Radiant Acolyte used Ward: the shrine will absorb the next objective hit.");
  } else {
    return;
  }

  actor.acted = true;
  actor.poseState = "windup";
  state.combatResult = `${ability.name} committed`;
  state.log = [...newLog, ...state.log].slice(0, 8);
  if (state.units.every((unit) => unit.team !== "enemy" || unit.dead)) {
    state.phase = "won";
    state.log = ["Victory: all hostile intent has been cleared.", ...state.log].slice(0, 8);
  }
  renderApp();
}

function damageObjective(amount) {
  state.objective.hp = clampHp(state.objective.hp - amount, state.objective.maxHp);
  if (state.objective.hp <= 0) state.phase = "lost";
}

function resolveEnemyTurn() {
  if (state.phase !== "player") return;

  const newLog = [`Enemy resolution starts for turn ${state.turn}.`];
  const archer = getUnit("grave-archer");
  const guard = getUnit("iron-guard");
  if (archer && !archer.dead && guard && !guard.dead) {
    damageUnit(guard, 2);
    newLog.push("Grave Archer pierces Iron Guard for 2.");
  }

  const brute = getUnit("stone-brute");
  if (brute && !brute.dead) {
    if (brute.col === 6 && brute.row === 3) {
      if (state.objective.warded) {
        state.objective.warded = false;
        newLog.push("Stone Brute struck the shrine line, but Ward absorbed the objective damage.");
      } else {
        damageObjective(3);
        newLog.push("Stone Brute crushed the shrine for 3 objective damage.");
      }
    } else {
      newLog.push("Stone Brute missed the shrine line after being pushed out of position.");
    }
  }

  const skitter = getUnit("grave-skitter");
  const ranger = getUnit("verdant-ranger");
  if (skitter && !skitter.dead) {
    if (skitter.statuses.includes("rooted")) {
      skitter.statuses = skitter.statuses.filter((status) => status !== "rooted");
      newLog.push("Grave Skitter's leap was prevented by Root Shot.");
    } else if (ranger && !ranger.dead) {
      damageUnit(ranger, 2);
      newLog.push("Grave Skitter leapt at Verdant Ranger for 2.");
    }
  }

  state.units.forEach((unit) => {
    if (unit.team === "ally" && !unit.dead) unit.acted = false;
    if (!unit.dead) unit.poseState = unit.team === "enemy" ? "windup" : "idle";
  });
  state.turn += 1;
  state.selectedUnitId = state.units.find((unit) => unit.team === "ally" && !unit.dead)?.id ?? null;
  state.selectedAbilityId = initialAbilityByUnit[state.selectedUnitId] ?? null;
  state.selectedTargetId = defaultTargetForAbility(state.selectedAbilityId);
  state.combatResult = null;

  if (state.objective.hp <= 0) {
    state.phase = "lost";
    newLog.push("Defeat: the shrine has fallen.");
  }

  state.log = [...newLog, ...state.log].slice(0, 10);
  renderApp();
}

function renderOverlay(overlay) {
  return `<div class="tile-overlay ${overlay.tone}" style="${cellVars(overlay)}">${img(overlay.name, "", "overlay-art")}</div>`;
}

function renderProp(prop) {
  return `<div class="prop ${prop.className}" style="${cellVars(prop)}">${img(prop.name, prop.name.replaceAll("_", " "), "prop-art")}</div>`;
}

function renderGeneratedActor(unit, extraClass = "") {
  const stateName = unit.poseState ?? "idle";
  const row = actorRows[unit.id] ?? 0;
  const col = poseColumns[stateName] ?? 0;
  return `
    <span class="generated-actor ${unit.team} ${unit.className} pose-${stateName} ${extraClass}" data-actor-sheet="actor-feet-outline-v4" style="--actor-row:${row}; --actor-col:${col};" aria-hidden="true">
      <span class="generated-actor-shadow"></span>
      <span class="generated-actor-sprite" style="background-image:url('${ACTOR_SHEET}')"></span>
    </span>
  `;
}

function renderUnit(unit) {
  if (unit.dead) return "";
  const isSelected = unit.id === state.selectedUnitId;
  const isTarget = unit.id === state.selectedTargetId;
  const select = isSelected
    ? `<div class="selection-ring">${img("overlay_ally_select", "", "selection-art")}</div>`
    : unit.team === "enemy" || isTarget
      ? `<div class="selection-ring enemy-ring">${img("overlay_enemy_select", "", "selection-art")}</div>`
      : "";
  const statusText = unit.statuses.length ? ` ${unit.statuses.join(", ")}` : "";
  const actedText = unit.acted ? " acted" : "";

  return `
    <button
      class="unit ${unit.team} ${isSelected ? "selected" : ""} ${isTarget ? "targeted" : ""} ${unit.acted ? "acted" : ""} ${unit.className} pose-${unit.poseState ?? "idle"}"
      style="${cellVars(unit)}"
      aria-label="${unit.name} HP ${hpText(unit)} at ${unit.col},${unit.row}${statusText}${actedText}"
      data-unit-id="${unit.id}">
      ${select}
      ${renderGeneratedActor(unit)}
      <span class="unit-chip">${unit.chip} ${hpText(unit)}</span>
    </button>
  `;
}

function renderIntent(intent) {
  return `
    <div class="intent ${intent.length}" style="${cellVars(intent)} --angle:${intent.angle}deg;" aria-label="${intent.label} intent">
      ${img(intent.sprite, intent.label, "intent-art")}
      <span>${intent.label}</span>
    </div>
  `;
}

function renderUnitList(team) {
  return state.units
    .filter((unit) => unit.team === team)
    .map(
      (unit) => `
        <li class="${unit.id === state.selectedUnitId ? "active" : ""} ${unit.dead ? "dead" : ""}">
          <strong>${unit.name}</strong>
          <span>${hpText(unit)}</span>
          <em>${unit.dead ? "Down" : unit.statuses[0] ?? (unit.acted ? "Acted" : unit.badge)}</em>
        </li>
      `
    )
    .join("");
}

function renderPosePreview(unit) {
  const poses = [
    { state: "idle", label: "Idle" },
    { state: "windup", label: "Windup" },
    { state: "hit", label: "Hit" },
    { state: "move", label: "Move" }
  ];

  return `
    <div class="pose-preview" aria-label="${unit.name} low-res pose proof">
      ${poses
        .map(
          (pose) => `
            <div class="pose-cell">
              ${renderGeneratedActor({ ...unit, poseState: pose.state }, "preview-token")}
              <span>${pose.label}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderBoard() {
  const objectiveLabel = `Shrine objective HP ${hpText(state.objective)}${state.objective.warded ? " warded" : ""}`;

  return `
    <section class="battlefield" aria-label="Ruined Crossing battle board">
      <div class="board-frame">
        <div class="board" aria-label="8 by 8 oblique tactics board">
          <img class="flat-board flat-board-skirt" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-skirt.png" alt="" draggable="false" aria-hidden="true" />
          <img class="flat-board flat-board-surface" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-surface.png" alt="" draggable="false" aria-hidden="true" />
          <img class="flat-board flat-board-decals" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-decals.png" alt="" draggable="false" aria-hidden="true" />
          <img class="flat-board flat-board-grid" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-grid.png" alt="" draggable="false" aria-hidden="true" />
          ${overlays.map(renderOverlay).join("")}
          <button class="objective ${state.selectedTargetId === "objective" ? "targeted" : ""} ${state.objective.warded ? "warded" : ""}" style="${cellVars(state.objective)}" aria-label="${objectiveLabel}" data-target-id="objective">
            ${img("overlay_objective_badge", "objective marker", "objective-badge")}
            ${img(state.objective.name, "Shrine objective", "objective-art")}
            <span>Shrine ${hpText(state.objective)}${state.objective.warded ? " Ward" : ""}</span>
          </button>
          ${props.map(renderProp).join("")}
          ${baseIntents.map(renderIntent).join("")}
          ${state.units.map(renderUnit).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderAbilityControls(selected) {
  const unitAbilities = abilities[selected.id] ?? [];
  if (!unitAbilities.length) return "";

  return `
    <div class="action-controls" aria-label="Ability controls">
      ${unitAbilities
        .map(
          (ability) => `
            <button
              class="ability-button ${state.selectedAbilityId === ability.id ? "active" : ""}"
              type="button"
              data-ability-id="${ability.id}"
              ${selected.acted || state.phase !== "player" ? "disabled" : ""}>
              <strong>${ability.name}</strong>
              <span>${ability.detail}</span>
            </button>
          `
        )
        .join("")}
      <button class="commit-button" type="button" data-action="commit" ${!state.selectedTargetId || selected.acted || state.phase !== "player" ? "disabled" : ""}>
        Commit Action
      </button>
      <button class="end-turn-button" type="button" data-action="end-turn" ${state.phase !== "player" ? "disabled" : ""}>
        End Turn
      </button>
    </div>
  `;
}

function renderApp() {
  const selected = getSelectedUnit();
  const preview = buildPreview();
  const selectedHpPct = selected ? (selected.hp / selected.maxHp) * 100 : 0;
  const objectiveHpPct = (state.objective.hp / state.objective.maxHp) * 100;
  const phaseText =
    state.phase === "won" ? "Victory" : state.phase === "lost" ? "Defeat" : `Player Turn ${state.turn}`;

  document.documentElement.classList.toggle("grayscale", new URLSearchParams(window.location.search).get("gray") === "1");
  document.querySelector("#app").innerHTML = `
    <div class="stage-shell">
      <header class="top-bar">
        <div>
          <p>Ruined Crossing</p>
          <h1>Tactics Battle Stage V4</h1>
        </div>
        <div class="turn-pill">${phaseText}</div>
      </header>

      <div class="stage-layout">
        ${renderBoard()}

        <aside class="hud" aria-label="Battle state">
          <section class="panel selected-panel">
            <div class="panel-head">
              ${img("icon_ward", "ward affinity", "panel-icon")}
              <div>
                <p>Selected</p>
                <h2>${selected?.name ?? "None"}</h2>
              </div>
            </div>
            <div class="forecast" aria-live="polite">
              <span>Action preview</span>
              <strong>${preview.title}</strong>
              <small>${preview.detail}</small>
              ${state.combatResult ? `<small>${state.combatResult}</small>` : ""}
            </div>
            ${selected ? renderPosePreview(selected) : ""}
            <div class="meter">
              <span>HP</span>
              <div><i style="width:${selectedHpPct}%"></i></div>
              <b>${selected ? hpText(selected) : "--"}</b>
            </div>
            ${selected ? renderAbilityControls(selected) : ""}
          </section>

          <section class="panel objective-panel">
            <div class="panel-head">
              ${img("overlay_objective_badge", "objective badge", "panel-icon")}
              <div>
                <p>Objective</p>
                <h2>Hold the shrine</h2>
              </div>
            </div>
            <div class="meter shrine-meter">
              <span>Ward</span>
              <div><i style="width:${objectiveHpPct}%"></i></div>
              <b>${hpText(state.objective)}</b>
            </div>
            <p class="compact-note">${state.objective.warded ? "Ward active" : "Ward stable"}; one enemy intent is targeting the pad.</p>
          </section>

          <section class="panel roster-panel">
            <div class="rosters">
              <div>
                <h3>Adventurers</h3>
                <ul>${renderUnitList("ally")}</ul>
              </div>
              <div>
                <h3>Enemy intent</h3>
                <ul>${renderUnitList("enemy")}</ul>
              </div>
            </div>
          </section>

          <section class="panel log-panel" aria-label="Combat log">
            <h3>Combat forecast</h3>
            <ol>
              ${state.log.map((line) => `<li>${line}</li>`).join("")}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  `;
}

document.addEventListener("click", (event) => {
  const unitButton = event.target.closest("[data-unit-id]");
  if (unitButton) {
    const unit = getUnit(unitButton.dataset.unitId);
    if (unit?.team === "ally") selectUnit(unit.id);
    if (unit?.team === "enemy") selectTarget(unit.id);
    return;
  }

  const targetButton = event.target.closest("[data-target-id]");
  if (targetButton) {
    selectTarget(targetButton.dataset.targetId);
    return;
  }

  const abilityButton = event.target.closest("[data-ability-id]");
  if (abilityButton) {
    selectAbility(abilityButton.dataset.abilityId);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton?.dataset.action === "commit") commitAction();
  if (actionButton?.dataset.action === "end-turn") resolveEnemyTurn();
});

renderApp();
