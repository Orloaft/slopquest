// Applies the Broken Reach (cap L35) re-tier to content/monsters.yaml in place.
// Edits only maxHp/damage/xp/gold for monsters whose level moves >1; preserves
// all comments and formatting. Idempotent-ish: re-running recomputes from the
// CURRENT file, so run once. Verify with `npm run balance:bands` afterward.
import fs from "node:fs";
import yaml from "js-yaml";

const PATH = "content/monsters.yaml";
const text = fs.readFileSync(PATH, "utf8");
const M = yaml.load(text);
const byId = Object.fromEntries(M.map((m) => [m.id, m]));

function lvl(m) {
  const ad = (m.damage[0] + m.damage[1]) / 2, aps = 1000 / m.attackMs;
  const rb = m.ranged ? 3 + Math.max(0, m.range - 1) * 1.2 : 0, ab = (m.armor || 0) * 1.8;
  const cb = (m.slowPct ? 2 : 0) + (m.weakenPct ? 3 : 0) + (m.stunMs ? Math.min(5, m.stunMs / 500) : 0) + (m.pack ? 2 : 0) + (m.burrow ? 2 : 0);
  const bb = m.maxHp >= 180 ? 8 : 0;
  return Math.max(1, Math.round(m.maxHp / 7.5 + ad * 1.45 + aps * 3 + m.speed * 1.15 + rb + ab + cb + bb - 9));
}
function other(m) {
  const aps = 1000 / m.attackMs, rb = m.ranged ? 3 + Math.max(0, m.range - 1) * 1.2 : 0, ab = (m.armor || 0) * 1.8;
  const cb = (m.slowPct ? 2 : 0) + (m.weakenPct ? 3 : 0) + (m.stunMs ? Math.min(5, m.stunMs / 500) : 0) + (m.pack ? 2 : 0) + (m.burrow ? 2 : 0);
  const bb = m.maxHp >= 180 ? 8 : 0;
  return aps * 3 + m.speed * 1.15 + rb + ab + cb + bb - 9;
}
const TARGET = {
  reach_hen: 1, meadow_hopper: 3, reach_vole: 5, rat: 8, spider: 11, wisp: 11,
  forest_slime: 12, wild_boar: 12, thorn_hedgehog: 12, goblin_scout: 15,
  forest_spider: 15, goblin: 15, sapling_deer: 16, wolf: 17, goblin_shaman: 18,
  bog_wraith: 19, forest_pixie: 19, orc: 20, mushroom_brute: 21, dire_wolf: 22,
  bone_druid: 23, ancient_treant: 25,
  restless_husk: 11, grave_shambler: 14, skeleton: 23, grave_revenant: 24, ghoul: 27, pale_banshee: 28,
  bound_wight: 16, boss: 21,
  skitterer: 18, mire_spitter: 26,
  canyon_scavenger: 32, dust_burrower: 35
};
const ROLE_XP = { trash: 1.0, turret: 1.2, pack: 1.2, ambush: 1.3, elite: 1.6, boss: 2.5 };
const roleOf = (m) => m.role || (m.maxHp >= 220 ? "boss" : (m.maxHp >= 115 || m.heavyAttack) ? "elite" : m.ranged ? "turret" : m.pack ? "pack" : "trash");

const changes = {};
for (const [id, L] of Object.entries(TARGET)) {
  const m = byId[id]; if (!m) continue;
  if (Math.abs(L - lvl(m)) <= 1) continue; // leave well-tuned monsters alone
  const o = other(m), hpC = m.maxHp / 7.5, ad = (m.damage[0] + m.damage[1]) / 2, dmgC = ad * 1.45;
  const budget = Math.max(2, L - o), s = budget / (hpC + dmgC);
  const maxHp = Math.max(8, Math.round(m.maxHp * s));
  const adNew = Math.max(1, ad * s);
  const damage = [Math.max(1, Math.round(adNew * 0.82)), Math.max(2, Math.round(adNew * 1.18))];
  const xp = Math.round(L * 1.8 * (ROLE_XP[roleOf(m)] ?? 1.0));
  const ga = xp * 0.45, gold = [Math.max(0, Math.round(ga * 0.7)), Math.round(ga * 1.4)];
  changes[id] = { maxHp, damage, xp, gold };
}

// --- rewrite the four stat lines within each changed monster's block ---
const lines = text.split("\n");
let cur = null, applied = [];
for (let i = 0; i < lines.length; i++) {
  const idm = lines[i].match(/^- id:\s*(\S+)/);
  if (idm) { cur = idm[1]; continue; }
  const c = cur && changes[cur];
  if (!c) continue;
  if (/^  maxHp:\s/.test(lines[i])) lines[i] = `  maxHp: ${c.maxHp}`;
  else if (/^  damage:\s/.test(lines[i])) lines[i] = `  damage: [${c.damage[0]}, ${c.damage[1]}]`;
  else if (/^  xp:\s/.test(lines[i])) lines[i] = `  xp: ${c.xp}`;
  else if (/^  gold:\s/.test(lines[i])) { lines[i] = `  gold: [${c.gold[0]}, ${c.gold[1]}]`; if (!applied.includes(cur)) applied.push(cur); }
}
fs.writeFileSync(PATH, lines.join("\n"));
console.log(`Re-tiered ${Object.keys(changes).length} monsters:`);
for (const id of Object.keys(changes)) console.log(`  ${id}: L${lvl(byId[id])}→${TARGET[id]}  hp${byId[id].maxHp}→${changes[id].maxHp} dmg${byId[id].damage.join("-")}→${changes[id].damage.join("-")} xp${byId[id].xp}→${changes[id].xp}`);
