# Jib music

The game streams a background track per zone with a 2-second crossfade on
transitions (see `src/audio.ts` and the `FLOOR_TRACK` / `OUTPOST_TRACK` maps in
`src/main.ts`). The engine loads `/music/<name>.mp3` for each name below.

**No audio ships with this repo.** Drop your own legally-licensed files here with
the exact filenames. A missing file just means that zone plays silent — nothing
breaks. The OSRS titles listed are the *suggested fit* per zone from the design
doc; use audio you actually have the rights to use.

| File (`public/music/`)   | Zone                                   | Suggested track |
| ------------------------ | -------------------------------------- | --------------- |
| `scape-main.mp3`         | Title screen ("The Coastal Overlook")  | Scape Main / Autumn Voyage |
| `garden.mp3`             | Waystone (hub town)                    | Garden / Flute Salad |
| `borderland.mp3`         | Northwatch (frontier outpost)          | Borderland / Unknown Land |
| `harmony.mp3`            | Northwood (central forest valley)      | Harmony / Tree Spirits |
| `rest-in-peace.mp3`      | Southgate Cemetery                     | Rest in Peace / Spooky |
| `spooky.mp3`             | Ashen Crypt (dungeon)                  | Spooky |
| `swamp-fever.mp3`        | The Sunken Marsh (rotten causeway)     | Swamp Fever / Mage Arena |
| `serenade.mp3`           | Alchemist's Hut (marsh safe outpost)   | Serenade |
| `al-kharid.mp3`          | The Searing Badlands (canyon ravines)  | Al Kharid / Arabian 2 |
| `mirage.mp3`             | Frontier Camp (badlands safe outpost)  | Mirage |
| `the-desert.mp3`         | The Sunken Desert                      | The Desert / Shine |
| `sea-shanty-2.mp3`       | The Sunken Beach                       | Sea Shanty II / Horizon |
| `tribal.mp3`             | The Untamed Jungle                     | Tribal / Jungle Island |

## How it works

- The desired track is recomputed every frame from the player's floor (and
  whether they're standing in a safe outpost). When it changes, `setTrack`
  crossfades over `FADE_MS` (2s).
- Playback is unlocked on the first user gesture (browsers block autoplay).
- A **Music** toggle in the title Settings menu enables/disables it; default
  volume is 0.45.
- To add or move tracks, edit `FLOOR_TRACK` / `OUTPOST_TRACK` in `src/main.ts`.
