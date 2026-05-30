// --- Jib music manager -----------------------------------------------------
// Background score with a clean crossfade on zone transitions. Tracks are
// streamed from /music/<name>.mp3. No audio ships with the repo — drop your own
// legally-licensed files in public/music/ named per the mapping in
// public/music/README.md (the OSRS track names in the design doc are just the
// suggested fit per zone; supply audio you have the rights to use).

const TRACK_DIR = "/music/";
const TRACK_EXT = ".mp3";
const FADE_MS = 2000;

let enabled = true;
let masterVolume = 0.45;
let unlocked = false;
let currentName: string | null = null;
let currentEl: HTMLAudioElement | null = null;
const cache = new Map<string, HTMLAudioElement>();
const fadeTokens = new WeakMap<HTMLAudioElement, number>();
let fadeSeq = 0;

function element(name: string): HTMLAudioElement {
  let el = cache.get(name);
  if (!el) {
    el = new Audio(`${TRACK_DIR}${name}${TRACK_EXT}`);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0;
    // A missing track is fine — the zone just plays silent.
    el.addEventListener("error", () => undefined);
    cache.set(name, el);
  }
  return el;
}

function fade(el: HTMLAudioElement, to: number, done?: () => void): void {
  const token = (fadeSeq += 1);
  fadeTokens.set(el, token);
  const from = el.volume;
  const start = performance.now();
  const tick = (now: number): void => {
    if (fadeTokens.get(el) !== token) return; // superseded by a newer fade
    const t = Math.min(1, (now - start) / FADE_MS);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(tick);
    else done?.();
  };
  requestAnimationFrame(tick);
}

function startCurrent(): void {
  if (!enabled || !unlocked || !currentName) return;
  const el = element(currentName);
  currentEl = el;
  el.volume = 0;
  const play = el.play();
  if (play) play.catch(() => undefined); // autoplay blocked or file missing
  fade(el, masterVolume);
}

// Switch the playing track, crossfading out the old one. No-op if unchanged.
export function setTrack(name: string | null): void {
  if (name === currentName) return;
  const prev = currentEl;
  currentName = name;
  if (prev) {
    fade(prev, 0, () => prev.pause());
    currentEl = null;
  }
  startCurrent();
}

// Call from the first user gesture so browsers permit playback.
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  startCurrent();
}

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    if (currentEl) {
      const el = currentEl;
      fade(el, 0, () => el.pause());
    }
  } else {
    startCurrent();
  }
}

export function setMusicVolume(volume: number): void {
  masterVolume = Math.max(0, Math.min(1, volume));
  if (currentEl && enabled && unlocked) currentEl.volume = masterVolume;
}

export function currentTrack(): string | null {
  return currentName;
}
