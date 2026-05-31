# TIB Agent Guide

TIB is a top-down 2D MMO prototype for friends.

## Stack

- Phaser client in `src/`
- Authoritative Node/WebSocket server in `server/`
- Runtime assets in `public/`
- Source/generated assets in `assetsources/`
- Player persistence in `data/players.json`

## Workflow

- Keep multiplayer authority on the server.
- Treat client state as presentation and input, not truth.
- Prefer small vertical slices that can be tested quickly.
- Run `npm run check` before committing.
- Commit directly when the requested task is complete and checks pass.
- End every task with changed files, commands run, commit hash, and risks.

## Git

TIB lives on a mounted ext4 image (loop device, label `NXT-DEV`) at
`/mnt/nxt-dev/tib`. Make sure Git resolves there before autonomous commits. If
`git rev-parse --show-toplevel` returns `/mnt/nxt-dev` (the image root) or
anything other than `/mnt/nxt-dev/tib`, ask to initialize TIB as its own repo or
do that first. If `/mnt/nxt-dev` is empty, the loop image isn't mounted — remount
it before working (`losetup -a` to find the backing `.ext4` file, then
`sudo mount -o loop <file> /mnt/nxt-dev`).

## Assets

- Never delete originals from `/home/orlovboros/Downloads`.
- Use `assetsources/inbox/YYYY-MM-DD` for copied intake.
- Use `assetsources/selected` for source images worth keeping.
- Use `assetsources/rejected` for project-local rejected copies.
- Use `public/` only for game-ready assets.
- Use lowercase hyphenated runtime filenames.
- For top-down character/enemy sprites, game-ready means four-direction movement in row order `up`, `right`, `down`, `left`.
- Treat the approved walk sheet as the identity lock. Attack/action sheets must match the walk sheet's proportions, palette, outline weight, gear, and silhouette before import.
- Send dark-background GIF previews for walk, attack/action, and walk-vs-action identity comparison before copying generated sprites into `public/`.
- Validate generated sheets through `sprite_processor grid-sheet`; require transparent corners, `0` chroma remnants, stable post-alignment drift, and matching runtime frame counts.
