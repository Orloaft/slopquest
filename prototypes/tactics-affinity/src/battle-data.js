export const board = [
  ["tile_moss_stone", "tile_moss_stone", "tile_dirt_path", "tile_rubble", "tile_grass", "tile_water_edge", "tile_shallow_water", "tile_shallow_water"],
  ["tile_moss_stone", "tile_dirt_path", "tile_dirt_path", "tile_cracked_earth", "tile_rubble", "tile_grass", "tile_water_edge", "tile_shallow_water"],
  ["tile_grass", "tile_dirt_path", "tile_rubble", "tile_bramble", "tile_cracked_earth", "tile_dirt_path", "tile_spawn_crack_inactive", "tile_water_edge"],
  ["tile_grass", "tile_rubble", "tile_raised_block", "tile_dirt_path", "tile_objective_pad", "tile_cracked_earth", "tile_dirt_path", "tile_grass"],
  ["tile_bramble", "tile_grass", "tile_dirt_path", "tile_objective_pad", "tile_objective_pad", "tile_dirt_path", "tile_rubble", "tile_grass"],
  ["tile_grass", "tile_dirt_path", "tile_cracked_earth", "tile_dirt_path", "tile_rubble", "tile_rock_blocker", "tile_grass", "tile_bramble"],
  ["tile_water_edge", "tile_grass", "tile_dirt_path", "tile_moss_stone", "tile_dirt_path", "tile_grass", "tile_rubble", "tile_grass"],
  ["tile_shallow_water", "tile_water_edge", "tile_grass", "tile_grass", "tile_moss_stone", "tile_dirt_path", "tile_grass", "tile_moss_stone"]
];

export const baseTerrainByFeature = {
  tile_bramble: "tile_grass",
  tile_rock_blocker: "tile_moss_stone",
  tile_rubble: "tile_dirt_path",
  tile_raised_block: "tile_moss_stone",
  tile_spawn_crack_inactive: "tile_cracked_earth",
  tile_spawn_crack_active: "tile_cracked_earth",
  tile_objective_pad: "tile_dirt_path"
};

export const terrainFeatureTiles = new Set(Object.keys(baseTerrainByFeature));

export const overlays = [
  { name: "overlay_move_tile", col: 2, row: 4, tone: "move" },
  { name: "overlay_move_tile", col: 1, row: 5, tone: "move" },
  { name: "overlay_attack_tile", col: 5, row: 3, tone: "attack" },
  { name: "overlay_attack_tile", col: 4, row: 4, tone: "attack" },
  { name: "overlay_root_tile", col: 3, row: 3, tone: "field" },
  { name: "overlay_spawn_warning", col: 6, row: 2, tone: "danger" },
  { name: "overlay_danger_border", col: 5, row: 5, tone: "danger-border" }
];

export const props = [
  { name: "prop_broken_wall", col: 2, row: 3, className: "low-prop" },
  { name: "prop_low_pillar", col: 5, row: 5, className: "low-prop small" },
  { name: "prop_banner", col: 0, row: 4, className: "banner" },
  { name: "objective_wagon", col: 6, row: 6, className: "wagon" }
];

export const objective = {
  name: "objective_shrine",
  col: 4,
  row: 4,
  hp: "6/8",
  ward: "Ward stable"
};

export const units = [
  {
    id: "iron-guard",
    team: "ally",
    name: "Iron Guard",
    sprite: "adventurer_iron_guard",
    col: 2,
    row: 5,
    hp: "9/10",
    badge: "Ward",
    chip: "Guard",
    selected: true,
    stance: "Guard",
    poseState: "move",
    className: "iron"
  },
  {
    id: "verdant-ranger",
    team: "ally",
    name: "Verdant Ranger",
    sprite: "adventurer_verdant_ranger",
    col: 1,
    row: 6,
    hp: "7/7",
    badge: "Root",
    chip: "Ranger",
    stance: "Pin",
    poseState: "idle",
    className: "ranger"
  },
  {
    id: "radiant-acolyte",
    team: "ally",
    name: "Radiant Acolyte",
    sprite: "adventurer_radiant_acolyte",
    col: 3,
    row: 6,
    hp: "6/6",
    badge: "Echo",
    chip: "Acolyte",
    stance: "Mend",
    poseState: "idle",
    className: "acolyte"
  },
  {
    id: "grave-skitter",
    team: "enemy",
    name: "Grave Skitter",
    sprite: "enemy_grave_skitter",
    col: 4,
    row: 2,
    hp: "4/4",
    badge: "Leap",
    chip: "Skitter",
    stance: "Bite Ranger",
    poseState: "windup",
    className: "skitter"
  },
  {
    id: "stone-brute",
    team: "enemy",
    name: "Stone Brute",
    sprite: "enemy_stone_brute",
    col: 6,
    row: 3,
    hp: "12/12",
    badge: "Shove",
    chip: "Brute",
    stance: "Crush shrine",
    poseState: "windup",
    className: "brute"
  },
  {
    id: "grave-archer",
    team: "enemy",
    name: "Grave Archer",
    sprite: "enemy_grave_archer",
    col: 5,
    row: 1,
    hp: "5/5",
    badge: "Line",
    chip: "Archer",
    stance: "Pierce Guard",
    poseState: "windup",
    className: "archer"
  }
];

export const intents = [
  { sprite: "overlay_line_arrow", col: 5, row: 1, angle: 128, length: "long", label: "Pierce" },
  { sprite: "overlay_charge_chevrons", col: 6, row: 3, angle: 158, length: "short", label: "Shove" },
  { sprite: "overlay_melee_arrow", col: 4, row: 2, angle: 206, length: "melee", label: "Bite" },
  { sprite: "overlay_objective_badge", col: 4, row: 4, angle: 0, length: "badge", label: "Protect" }
];

export const logLines = [
  "Iron Guard selected: shield bash pushes Stone Brute off shrine lane.",
  "Grave Archer intent: line shot through cracked earth into Guard.",
  "Fieldcraft: Root tile can stop Skitter leap this turn."
];
