# Soundtracks moved off-repo

The `assetsources/soundtracks/` archive (~967 MB of OSRS `.ogg` files) was **removed from git
tracking** and relocated to free up the root disk. It was never used at runtime — the game streams
music from `public/music/<name>.mp3` (see `src/audio.ts`), and no audio ships with the repo.

**Current location:** `/mnt/nxt-dev/tib-archive/assetsources/soundtracks/` (on the SSD loop mount,
which has ample free space).

The path is gitignored so it won't be re-added. To use any of these tracks in-game, drop
legally-licensed files into `public/music/` per `public/music/README.md`.
