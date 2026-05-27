# Waystone MVP

A small, modern-minimal Tibia-inspired multiplayer dungeon slice.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`. Friends on the same network can use the Vite network URL printed by the dev server, while the authoritative WebSocket server runs on port `8787`.

## Current MVP Loop

- WASD or arrow-key movement with server-authoritative positions.
- Left-click a walkable tile to move toward it.
- Two archetypes: Knight and Caster.
- Click a monster to auto-attack it.
- `Tab` cycles through nearby attack targets.
- `1` uses the class active ability.
- `2` uses a potion.
- `F` loots adjacent corpses and item drops.
- Click a dropped corpse/item bundle to loot that specific drop.
- Use the startup roster to play or delete saved characters, or create a fresh character.
- Buy an axe from the starting-town trader before chopping trees for logs.
- `B` opens the vendor panel near the trader in town.
- Chat supports lightweight party/system messages.
- Characters persist to `data/players.json`.

The test sandbox is split into five server instances: the safe Waystone town, Southgate Cemetery with a crypt entrance, Ashen Crypt with undead and a boss, Northwood with woodland creatures plus goblins and orcs, and the friendly Northwatch town at the far end of the woods.

## Performance Foundation

- The server remains authoritative for movement, combat, targeting, loot, and persistence.
- Clients receive area-of-interest snapshots instead of the full world.
- The world is divided into named instances that can later become chunk, instance, or shard boundaries.
- Server snapshots include lightweight metrics for connected clients, visible entities, tick time, snapshot time, and outbound bandwidth.
- Character persistence is batched through an async save queue instead of writing once per player in the periodic save loop.
- Floor collision data is cached after generation.

Next foundation targets before adding lots of content:

- Replace floor-wide monster/player scans with spatial grid buckets.
- Add snapshot deltas with periodic full resyncs.
- Move persistence from JSON to SQLite or Postgres.
- Add load-test scripts for simulated players.
- Split map data into chunks so the client can stream large worlds.
