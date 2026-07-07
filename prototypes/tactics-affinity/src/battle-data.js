export const BOARD_SIZE = 8;

export const affinityWheel = ["Terra", "Fulgur", "Ignis", "Aqua"];

export const terrain = [
  { col: 2, row: 1, state: "water" },
  { col: 2, row: 2, state: "water" },
  { col: 3, row: 1, state: "block" },
  { col: 4, row: 1, state: "block" },
  { col: 3, row: 5, state: "water" },
  { col: 6, row: 2, state: "block" }
];

export const units = [
  {
    id: "tortollan",
    team: "ally",
    name: "Tortollan Shellbreaker",
    shortName: "Tortollan",
    race: "Tortollan",
    job: "Shell Warden",
    hp: 12,
    maxHp: 12,
    ap: 4,
    maxAp: 4,
    col: 1,
    row: 3,
    primary: "Terra",
    secondary: "Fulgur",
    traits: ["Immovable shell", "High HP", "Grounded"],
    immovable: true,
    flying: false,
    chip: "TOR",
    color: "terra"
  },
  {
    id: "sprite",
    team: "ally",
    name: "Sprite Voltweaver",
    shortName: "Sprite",
    race: "Sprite",
    job: "Storm Scout",
    hp: 4,
    maxHp: 4,
    ap: 6,
    maxAp: 6,
    col: 1,
    row: 1,
    primary: "Fulgur",
    secondary: "Terra",
    traits: ["Flying", "Low HP", "Ignores liquid/block routes"],
    immovable: false,
    flying: true,
    chip: "SPR",
    color: "fulgur"
  },
  {
    id: "oilbound-wrecker",
    team: "enemy",
    name: "Oilbound Wrecker",
    hp: 3,
    maxHp: 3,
    ap: 0,
    maxAp: 0,
    col: 4,
    row: 3,
    intent: "Crush the beacon unless shoved into oil and ignited.",
    chip: "E1",
    color: "enemy"
  },
  {
    id: "cinder-guard",
    team: "enemy",
    name: "Cinder Guard",
    hp: 4,
    maxHp: 4,
    ap: 0,
    maxAp: 0,
    col: 5,
    row: 4,
    intent: "Strike the beacon unless pushed into burning terrain.",
    chip: "E2",
    color: "enemy"
  }
];

export const objective = {
  name: "Signal Beacon",
  col: 6,
  row: 3,
  hp: 1,
  maxHp: 1
};

export const abilities = [
  {
    id: "terra-push",
    name: "Force Push",
    affinity: "Terra",
    kind: "Mover",
    target: "unit",
    detail: "Push one unit away from the caster, deal 1 push damage, then resolve terrain."
  },
  {
    id: "fulgur-pull",
    name: "Arc Pull",
    affinity: "Fulgur",
    kind: "Mover",
    target: "unit",
    detail: "Pull one unit toward the caster, deal 1 pull damage, then resolve terrain."
  },
  {
    id: "oil-font",
    name: "Oil Font",
    affinity: "Terra",
    kind: "State-setter",
    target: "cell",
    detail: "Set a clean tile to oil/liquid so it can be ignited."
  },
  {
    id: "ignis-spark",
    name: "Ignis Spark",
    affinity: "Fulgur",
    kind: "Igniter",
    target: "cell",
    detail: "Ignite oil into fire. Burning tiles deal 3 damage to occupants."
  },
  {
    id: "void-snare",
    name: "Void Snare",
    affinity: "Umbra",
    kind: "Opposite",
    target: "unit",
    detail: "Opposite affinity proof: shown at cost 4 AP and unavailable in this MVP."
  }
];

export const openingLog = [
  "TIB Gathering tactics affinity MVP loaded: solve the one-turn environmental forecast.",
  "Forecast: both enemies hit the Signal Beacon if either survives the player turn.",
  "Required chain: set oil, push Wrecker into it, ignite, then push Cinder Guard into fire."
];
