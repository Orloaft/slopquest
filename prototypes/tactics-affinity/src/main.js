import "./styles.css";
import { intents, logLines, objective, overlays, props, units } from "./battle-data.js";

const SPRITE_ROOT = "/assets/generated/ruined-crossing-v1/sprites";
const FLAT_BOARD_ROOT = "/assets/generated/ruined-crossing-v1/flat-board";
const ACTOR_SHEET = "/assets/generated/actor-feet-outline-v4/generated-low-res-actor-poses.png";
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

const sprite = (name) => `${SPRITE_ROOT}/${name}.png`;

function cellVars({ col, row }, layer = 0) {
  return `--col:${col}; --row:${row}; --iso-x:${col - row}; --iso-y:${col + row}; --z:${(col + row) * 12 + col + layer};`;
}

function img(name, alt, className = "") {
  return `<img class="${className}" src="${sprite(name)}" alt="${alt}" draggable="false" />`;
}

function renderOverlay(overlay) {
  return `<div class="tile-overlay ${overlay.tone}" style="${cellVars(overlay)}">${img(overlay.name, "", "overlay-art")}</div>`;
}

function renderProp(prop) {
  return `<div class="prop ${prop.className}" style="${cellVars(prop)}">${img(prop.name, prop.name.replaceAll("_", " "), "prop-art")}</div>`;
}

function renderGeneratedActor(unit, extraClass = "") {
  const state = unit.poseState ?? "idle";
  const row = actorRows[unit.id] ?? 0;
  const col = poseColumns[state] ?? 0;
  return `
    <span class="generated-actor ${unit.team} ${unit.className} pose-${state} ${extraClass}" data-actor-sheet="actor-feet-outline-v4" style="--actor-row:${row}; --actor-col:${col};" aria-hidden="true">
      <span class="generated-actor-shadow"></span>
      <span class="generated-actor-sprite" style="background-image:url('${ACTOR_SHEET}')"></span>
    </span>
  `;
}

function renderUnit(unit) {
  const select = unit.selected
    ? `<div class="selection-ring">${img("overlay_ally_select", "", "selection-art")}</div>`
    : unit.team === "enemy"
      ? `<div class="selection-ring enemy-ring">${img("overlay_enemy_select", "", "selection-art")}</div>`
      : "";

  return `
    <button class="unit ${unit.team} ${unit.selected ? "selected" : ""} ${unit.className} pose-${unit.poseState ?? "idle"}" style="${cellVars(unit)}" aria-label="${unit.name}, ${unit.hp}">
      ${select}
      ${renderGeneratedActor(unit)}
      <span class="unit-chip">${unit.chip}</span>
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
  return units
    .filter((unit) => unit.team === team)
    .map(
      (unit) => `
        <li class="${unit.selected ? "active" : ""}">
          <strong>${unit.name}</strong>
          <span>${unit.hp}</span>
          <em>${unit.badge}</em>
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
  return `
    <section class="battlefield" aria-label="Ruined Crossing battle board">
      <div class="board-frame">
        <div class="board" aria-label="8 by 8 oblique tactics board">
          <img class="flat-board flat-board-skirt" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-skirt.png" alt="" draggable="false" aria-hidden="true" />
          <img class="flat-board flat-board-surface" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-surface.png" alt="" draggable="false" aria-hidden="true" />
          <img class="flat-board flat-board-decals" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-decals.png" alt="" draggable="false" aria-hidden="true" />
          <img class="flat-board flat-board-grid" src="${FLAT_BOARD_ROOT}/ruined-crossing-board-grid.png" alt="" draggable="false" aria-hidden="true" />
          ${overlays.map(renderOverlay).join("")}
          <div class="objective" style="${cellVars(objective)}">
            ${img("overlay_objective_badge", "objective marker", "objective-badge")}
            ${img(objective.name, "Shrine objective", "objective-art")}
            <span>Shrine ${objective.hp}</span>
          </div>
          ${props.map(renderProp).join("")}
          ${intents.map(renderIntent).join("")}
          ${units.map(renderUnit).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderApp() {
  const selected = units.find((unit) => unit.selected);

  document.documentElement.classList.toggle("grayscale", new URLSearchParams(window.location.search).get("gray") === "1");
  document.querySelector("#app").innerHTML = `
    <div class="stage-shell">
      <header class="top-bar">
        <div>
          <p>Ruined Crossing</p>
          <h1>Tactics Battle Stage V4</h1>
        </div>
        <div class="turn-pill">Player Turn 3</div>
      </header>

      <div class="stage-layout">
        ${renderBoard()}

        <aside class="hud" aria-label="Battle state">
          <section class="panel selected-panel">
            <div class="panel-head">
              ${img("icon_ward", "ward affinity", "panel-icon")}
              <div>
                <p>Selected</p>
                <h2>${selected.name}</h2>
              </div>
            </div>
            <div class="forecast">
              <span>Action preview</span>
              <strong>Shield Bash -> Stone Brute</strong>
              <small>Push 1, prevent shrine damage, Guarded after strike.</small>
            </div>
            ${renderPosePreview(selected)}
            <div class="meter">
              <span>HP</span>
              <div><i style="width:90%"></i></div>
              <b>${selected.hp}</b>
            </div>
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
              <div><i style="width:75%"></i></div>
              <b>${objective.hp}</b>
            </div>
            <p class="compact-note">${objective.ward}; one enemy intent is targeting the pad.</p>
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

          <section class="panel log-panel">
            <h3>Combat forecast</h3>
            <ol>
              ${logLines.map((line) => `<li>${line}</li>`).join("")}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  `;
}

renderApp();
