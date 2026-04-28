// Artificial Savior — playable test iteration.
// Side-scrolling space shooter using the Ship art/ PNGs. Loads sprite paths
// from content/sprites.json so art can be swapped without code changes.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 960, H = 540;
// Canvas backing store is resized to (displayedSize × devicePixelRatio) so
// gameplay (which always works in 960×540 logical coords) stays crisp when
// the page is enlarged or full-screened. The world transform is reapplied
// at the start of every frame in `render()` via setTransform(scale,...).
let renderScale = 1;
function resizeCanvasBacking() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = canvas.getBoundingClientRect();
  // Fall back to logical size before CSS has computed (e.g. very early frames).
  const cssW = r.width  || W;
  const cssH = r.height || H;
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  // Lock to W (16:9 aspect is enforced by CSS), so x-scale == y-scale.
  renderScale = bw / W;
}
resizeCanvasBacking();
window.addEventListener("resize", resizeCanvasBacking);
document.addEventListener("fullscreenchange", resizeCanvasBacking);
document.addEventListener("webkitfullscreenchange", resizeCanvasBacking);

const SPRITES_URL = "content/sprites.json";

const WEAPONS = {
  small:  { sprite: "weaponSmall",  cooldown: 0.12, speed: 720, damage: 1,  size: 14, color: "#9fd1ff", label: "Small Gun" },
  large:  { sprite: "weaponLarge",  cooldown: 0.35, speed: 600, damage: 6,  size: 22, color: "#ffd27a", label: "Large Gun" },
  laser:  { sprite: "weaponLaser",  cooldown: 0.06, speed: 980, damage: 1,  size: 26, color: "#ff6bd6", label: "Laser"     },
  missle: { sprite: "weaponMissle", cooldown: 0.55, speed: 520, damage: 5,  size: 22, color: "#ffb26b", label: "Missile"   }
};
const WEAPON_ORDER = ["small", "large", "laser", "missle"];

const SHIELD_DURATION = 25;
const FINAL_BOSS_SHIELD_MIN = 5000;
const FINAL_BOSS_SHIELD_MAX = 10000;

const UPGRADE_INTERVAL = 10000;
const BOSS_SCORE_TRIGGER = 10000;
const MK2_TIER = 5;
const MK3_TIER = 10;
const BOSS_HP = 5000;
const BOSS_REWARD = 5000;
const SEMIBOSS_SCORE_TRIGGER = 50000;
const SEMIBOSS_HP = 31000;
const SEMIBOSS_REWARD = 15000;
const FINAL_BOSS_SCORE_TRIGGER = 100000;
const FINAL_BOSS_LEVEL_TRIGGER = 20;
const FINAL_BOSS_HP = SEMIBOSS_HP * 2;
const FINAL_BOSS_REWARD = 30000;

// God Mode pickup — temporary 60s invulnerability via rare drop. Distinct from MICO cheat (permanent).
const GODMODE_PICKUP_DURATION = 60.0;
const GODMODE_PICKUP_WEIGHT = 0.5;

// Mother Ship final boss (Level 2) — homing eye lasers + shockwave.
const MOTHERSHIP_LASER_INTERVAL = 4.0;     // seconds between bursts
const MOTHERSHIP_LASER_BURST_GAP = 0.18;   // seconds between the 2 beams from one eye
const MOTHERSHIP_LASER_SPEED = 320;        // px/s
const MOTHERSHIP_LASER_TURN_RATE = 2.4;    // rad/s — capped angular velocity
const MOTHERSHIP_LASER_LIFE = 4.5;         // seconds before despawn
const MOTHERSHIP_LASER_DAMAGE = 3;
const MOTHERSHIP_LASER_RADIUS = 8;
const MOTHERSHIP_SHOCKWAVE_INTERVAL = 7.0;
const MOTHERSHIP_SHOCKWAVE_SPEED = 240;
const MOTHERSHIP_SHOCKWAVE_MAX_R = 520;
const MOTHERSHIP_SHOCKWAVE_THICKNESS = 22;
const MOTHERSHIP_SHOCKWAVE_DAMAGE = 2;

// Asteroids (L2, after Cube Mini-Boss is defeated).
const ASTEROID_MEDIUM_HP = 5;
const ASTEROID_SMALL_HP = 2;
const ASTEROID_MEDIUM_SCORE = 200;
const ASTEROID_SMALL_SCORE = 75;
const ASTEROID_MEDIUM_DAMAGE = 3;
const ASTEROID_SMALL_DAMAGE = 1;
const ASTEROID_SPAWN_INTERVAL_MIN = 1.4;
const ASTEROID_SPAWN_INTERVAL_MAX = 3.0;
const ASTEROID_MEDIUM_RADIUS = 38;
const ASTEROID_SMALL_RADIUS = 22;
const ASTEROID_CONTACT_DAMAGE = 3;

// Data-driven enemy kinds (L1 dragon + L2 orb). Used by spawnEnemy + enemyFire.
const ENEMY_KINDS = {
  dragon: {
    sprite: "enemyDragon",
    hp: 6,
    speedMin: 90, speedMax: 180,
    fireCdMin: 0.8, fireCdMax: 2.0,
    scoreReward: 100,
    hpPerTier: 100,
    fireCdTierShrink: 0.06,
    shotConfig: { color: "#ff5a5a", size: 12, speed: 380, damage: 1, life: 2.2, speedTierBonus: 12 }
  },
  orb: {
    sprite: "enemyOrb",
    hp: 4,
    speedMin: 18, speedMax: 38,
    speedTierBonus: 5,
    fireCdMin: 1.6, fireCdMax: 3.2,
    scoreReward: 200,
    hpPerTier: 8,
    fireCdTierShrink: 0.05,
    shotConfig: { color: "#5fb8ff", size: 24, speed: 460, damage: 2, life: 2.4, speedTierBonus: 10 }
  },
  tenticle: {
    sprite: "tenticleEnemy",
    hp: 7,
    speedMin: 60, speedMax: 130,
    speedTierBonus: 10,
    fireCdMin: 1.2, fireCdMax: 2.4,
    scoreReward: 250,
    hpPerTier: 11,
    fireCdTierShrink: 0.06,
    shotConfig: { color: "#c47bff", size: 16, speed: 420, damage: 2, life: 2.3, speedTierBonus: 12 }
  }
};

// Per-level config — each level supplies score thresholds, sprite keys, HP, labels, planet style, music key.
const LEVELS = [
  {
    id: 1,
    name: "Outer Approach",
    bossScore: BOSS_SCORE_TRIGGER,
    semiBossScore: SEMIBOSS_SCORE_TRIGGER,
    finalBossScore: FINAL_BOSS_SCORE_TRIGGER,
    finalBossLevelTier: FINAL_BOSS_LEVEL_TRIGGER,
    bossSprite: "demonMini",
    bossSpriteScale: 1.0,
    semiBossSprite: "semiBoss",
    finalBossSprite: "finalBoss",
    bossHp: BOSS_HP,
    semiBossHp: SEMIBOSS_HP,
    finalBossHp: FINAL_BOSS_HP,
    bossLabel: "MINI-BOSS",
    semiBossLabel: "SEMI-FINAL BOSS — THE SCOURGE",
    finalBossLabel: "FINAL BOSS — THE HARBINGER",
    bossIncomingText: "!! MINI-BOSS INCOMING !!",
    semiBossIncomingText: "!! SEMI-FINAL BOSS — THE SCOURGE !!",
    finalBossIncomingText: "!! FINAL BOSS — THE HARBINGER !!",
    enemyKinds: ["dragon"],
    asteroidsAfterMiniBoss: true,
    planet: { sprite: "planetSprite", palette: ["#6fa8ff", "#2e4da8", "#070a22"], ringColor: "rgba(255,210,160,0.55)" },
    outroPrompt: "CONTINUE",
    nextLevel: 2,
    music: "l1"
  },
  {
    id: 2,
    name: "Asteroid Belt",
    bossScore: 12000,
    semiBossScore: 50000,
    finalBossScore: 100000,
    finalBossLevelTier: 25,
    bossSprite: "cubeBoss",
    bossSpriteScale: 1.0,
    semiBossSprite: "bluebird",
    finalBossSprite: "motherShip",
    bossHp: BOSS_HP * 2,
    semiBossHp: Math.round(SEMIBOSS_HP * 1.5),
    finalBossHp: SEMIBOSS_HP * 3,
    bossLabel: "MINI-BOSS — THE CUBE",
    semiBossLabel: "SEMI-FINAL BOSS — BLUEBIRD",
    finalBossLabel: "FINAL BOSS — MOTHER SHIP",
    bossIncomingText: "!! MINI-BOSS — THE CUBE !!",
    semiBossIncomingText: "!! SEMI-FINAL BOSS — BLUEBIRD !!",
    finalBossIncomingText: "!! FINAL BOSS — MOTHER SHIP !!",
    enemyKinds: ["orb"],
    asteroidsAfterMiniBoss: false,
    planet: { sprite: "planetSprite", palette: ["#c8a8ff", "#5b3aa8", "#1a0a2a"], ringColor: "rgba(190,170,255,0.55)" },
    outroPrompt: "CONTINUE",
    nextLevel: 3,
    music: "l2"
  },
  {
    id: 3,
    name: "Dimensional City",
    bossScore: 15000,
    semiBossScore: 55000,
    finalBossScore: 110000,
    finalBossLevelTier: 30,
    bossSprite: "tenticleSkull",
    bossSpriteScale: 1.0,
    semiBossSprite: "technoDemon",
    finalBossSprite: "dimensionalBoss",
    bossHp: Math.round(BOSS_HP * 2.5) + 20000,
    semiBossHp: Math.round(SEMIBOSS_HP * 1.7) + 20000,
    finalBossHp: Math.round(FINAL_BOSS_HP * 1.4) + 20000,
    bossLabel: "MINI-BOSS — TENTICLE SKULL",
    semiBossLabel: "SEMI-FINAL BOSS — TECHNO DEMON",
    finalBossLabel: "FINAL BOSS — DIMENSIONAL HORROR",
    bossIncomingText: "!! MINI-BOSS — TENTICLE SKULL !!",
    semiBossIncomingText: "!! SEMI-FINAL BOSS — TECHNO DEMON !!",
    finalBossIncomingText: "!! FINAL BOSS — DIMENSIONAL HORROR !!",
    enemyKinds: ["tenticle"],
    asteroidsAfterMiniBoss: false,
    planet: { sprite: "planetSprite", palette: ["#c8a8ff", "#4a2880", "#150525"], ringColor: "rgba(220,200,255,0.6)" },
    outroPrompt: "MISSION COMPLETE",
    nextLevel: null,
    music: "l3"
  }
];

function getLevelByIdx(idx) { return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, idx))]; }

// ---------- Asset loader ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load " + src));
    // Encode spaces etc. so paths like "Ship art/MK 1 ship.png" work.
    img.src = src.split("/").map(encodeURIComponent).join("/");
  });
}

async function loadSprites() {
  const res = await fetch(SPRITES_URL);
  const defs = await res.json();
  const out = {};
  await Promise.all(Object.entries(defs).map(async ([key, def]) => {
    try {
      out[key] = { ...def, img: await loadImage(def.image) };
    } catch (err) {
      if (def.optional) {
        console.warn(`Optional sprite "${key}" failed to load (${def.image}); falling back.`);
        out[key] = { ...def, img: null };
      } else {
        throw err;
      }
    }
  }));
  return out;
}

// ---------- Input ----------

const keys = new Set();
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();

  // Initials entry intercepts keystrokes so gameplay/music keys don't interfere.
  if (state.entry && !state.entry.submitted) {
    e.preventDefault();
    handleEntryKey(e.key);
    return;
  }

  // Pause-menu audio submenu intercepts arrow-keys / Esc so they don't leak into gameplay.
  if (state.paused && state.audioMenu) {
    if (k === "escape") {
      e.preventDefault();
      closeAudioMenu();
      return;
    }
    const am = state.audioMenu;
    const rows = ["bgm", "weapon", "sfx"];
    if (k === "arrowup" || k === "arrowdown") {
      e.preventDefault();
      am.focus = (am.focus + (k === "arrowup" ? -1 : 1) + rows.length) % rows.length;
      return;
    }
    if (k === "arrowleft" || k === "arrowright") {
      e.preventDefault();
      nudgeVolume(rows[am.focus], k === "arrowleft" ? -1 : 1);
      return;
    }
  }

  // Pause-menu cheat-code entry intercepts alpha/num/nav keys EXCEPT 'p' and 'x'
  // so the user can always close the cheat entry / unpause / mute regardless.
  if (state.paused && state.cheatEntry) {
    if (k === "escape") {
      e.preventDefault();
      state.cheatEntry = null;
      return;
    }
    const isLetter = /^[a-z0-9]$/.test(k) && k !== "p" && k !== "x";
    const isNav = ["arrowleft", "arrowright", "arrowup", "arrowdown", "backspace", "enter"].includes(k);
    if (isLetter || isNav) {
      e.preventDefault();
      handleCheatEntryKey(e.key);
      return;
    }
  }

  // While paused with no submenu open: Esc unpauses; arrows / WASD switch focus
  // between CHEAT CODE and AUDIO; Enter activates the focused button.
  if (state.paused && !state.cheatEntry && !state.audioMenu) {
    if (k === "escape") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (k === "arrowleft" || k === "a" || k === "arrowup" || k === "w") {
      e.preventDefault();
      state.pauseSel = "cheat";
      return;
    }
    if (k === "arrowright" || k === "d" || k === "arrowdown" || k === "s") {
      e.preventDefault();
      state.pauseSel = "audio";
      return;
    }
    if (k === "enter" || k === " ") {
      e.preventDefault();
      if (state.pauseSel === "audio") openAudioMenu();
      else openCheatEntry();
      return;
    }
  }

  // Title-screen cheat-code capture. Silent — not shown publicly.
  if (state.phase === "title" && /^[a-z]$/.test(k)) {
    state.cheatBuffer = (state.cheatBuffer + k.toUpperCase()).slice(-8);
    for (const code of Object.keys(CHEAT_CODES)) {
      if (state.cheatBuffer.endsWith(code)) {
        state.activeCheat = code;
        state.cheatBanner = 2.5;
        audio.playSfx && audio.playSfx("laser");
        // Apply immediately so the first run benefits (reset() also re-applies on Retry).
        if (state.player) applyCheat(state.player);
        break;
      }
    }
  }

  if (e.repeat) return void keys.add(k);
  keys.add(k);
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  if (k === "x") audio.toggleMute();
  if (k === "p") togglePause();
  audio.unlockAndPlay();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("pointerdown", () => audio.unlockAndPlay());

function togglePause() {
  // Pausing is only meaningful during active gameplay.
  if (state.phase !== "play" || state.gameOver) return;
  state.paused = !state.paused;
  if (state.paused) {
    audio.pauseMusic();
    // Cheat entry / audio menu are opt-in via on-screen buttons so 'p' isn't eaten.
    state.cheatEntry = null;
    state.audioMenu = null;
    if (!state.pauseSel) state.pauseSel = "cheat";
  } else {
    audio.resumeMusic();
    state.cheatEntry = null;
    state.audioMenu = null;
  }
}

// Pause-menu top-row buttons: CHEAT CODE on the left, AUDIO on the right.
function pauseButtonRects() {
  const w = 190, h = 36, gap = 16;
  const totalW = w * 2 + gap;
  const x0 = (W - totalW) / 2;
  const y = 132;
  return {
    cheat: { x: x0,             y, w, h },
    audio: { x: x0 + w + gap,   y, w, h }
  };
}
function cheatButtonRect() { return pauseButtonRects().cheat; }
function audioButtonRect() { return pauseButtonRects().audio; }

// Audio submenu geometry — three rows, each with a "−" button, a value display,
// and a "+" button. Returned shape includes hit-rects for pointer handling.
function audioMenuRects() {
  const rows = ["bgm", "weapon", "sfx"];
  const rowH = 44, gap = 6;
  const startY = 184;
  const labelW = 110, btnW = 38, valW = 70;
  const totalW = labelW + btnW + valW + btnW + 16;
  const x0 = (W - totalW) / 2;
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const y = startY + i * (rowH + gap);
    out.push({
      kind: rows[i],
      y,
      h: rowH,
      label:  { x: x0,                        y, w: labelW, h: rowH },
      minus:  { x: x0 + labelW,               y, w: btnW,   h: rowH },
      value:  { x: x0 + labelW + btnW + 4,    y, w: valW,   h: rowH },
      plus:   { x: x0 + labelW + btnW + valW + 8, y, w: btnW,   h: rowH }
    });
  }
  return out;
}
const AUDIO_LABELS = { bgm: "MUSIC", weapon: "WEAPONS", sfx: "SFX" };

let _audioPreviewAt = 0;
function audioPreviewSfx(kind) {
  // Throttle so holding +/- doesn't stack a wall of sounds.
  const now = performance.now();
  if (now - _audioPreviewAt < 140) return;
  _audioPreviewAt = now;
  if (kind === "weapon") audio.playSfx && audio.playSfx("small");
  else if (kind === "sfx") audio.playSfx && audio.playSfx("enemyDie");
  // No preview for bgm — track volume changes live.
}

function nudgeVolume(kind, dir) {
  const cur = audio.getVolume(kind);
  const next = Math.max(0, Math.min(1, Math.round((cur + dir * 0.1) * 10) / 10));
  audio.setVolume(kind, next);
  if (next !== cur) audioPreviewSfx(kind);
}

function openAudioMenu() {
  if (!state.paused) return;
  state.cheatEntry = null;
  state.audioMenu = { focus: 0 };
}
function closeAudioMenu() {
  state.audioMenu = null;
}

function openCheatEntry() {
  if (!state.paused) return;
  state.audioMenu = null;
  state.cheatEntry = { letters: ["A", "A", "A", "A"], pos: 0 };
}

function handleEntryKey(key) {
  const en = state.entry;
  if (!en || en.submitted) return;
  if (key === "Enter") {
    en.submitted = true;
    submitHiscore(en.letters.join(""), en.score, state.kills | 0);
    // Clear held-key state so the auto-restart doesn't trigger from an 'r' held before entry.
    keys.clear();
    return;
  }
  if (key === "Backspace") {
    if (en.pos > 0) en.pos -= 1;
    en.letters[en.pos] = "A";
    return;
  }
  if (key === "ArrowLeft") { if (en.pos > 0) en.pos -= 1; return; }
  if (key === "ArrowRight") { if (en.pos < 2) en.pos += 1; return; }
  if (key === "ArrowUp" || key === "ArrowDown") {
    cycleEntryLetter(en.pos, key === "ArrowUp" ? 1 : -1);
    return;
  }
  // Typed letter/number fills current slot and advances.
  if (key.length === 1) {
    const ch = key.toUpperCase();
    if (/[A-Z0-9]/.test(ch)) {
      en.letters[en.pos] = ch;
      if (en.pos < 2) en.pos += 1;
    }
  }
}

// Shared box geometry so rendering and touch hit-testing stay in sync.
function entryBoxRects() {
  const boxW = 70, boxH = 86, gap = 18;
  const totalW = boxW * 3 + gap * 2;
  const bx = (960 - totalW) / 2;
  const y = 370;
  const rects = [];
  for (let i = 0; i < 3; i++) {
    rects.push({ i, x: bx + i * (boxW + gap), y, w: boxW, h: boxH });
  }
  return rects;
}

function cycleEntryLetter(pos, dir) {
  const en = state.entry;
  if (!en) return;
  // Cycle through A-Z then 0-9 so touch users can still reach digits.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const cur = en.letters[pos];
  let idx = alphabet.indexOf(cur);
  if (idx < 0) idx = 0;
  idx = (idx + dir + alphabet.length) % alphabet.length;
  en.letters[pos] = alphabet[idx];
}

// ---------- Pause-menu cheat-code entry (4 chars, mirrors initials UX) ----------

function cheatBoxRects() {
  const boxW = 56, boxH = 70, gap = 14;
  const totalW = boxW * 4 + gap * 3;
  const bx = (W - totalW) / 2;
  const y = 168;
  const rects = [];
  for (let i = 0; i < 4; i++) {
    rects.push({ i, x: bx + i * (boxW + gap), y, w: boxW, h: boxH });
  }
  return rects;
}

function cycleCheatLetter(pos, dir) {
  const en = state.cheatEntry;
  if (!en) return;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let idx = alphabet.indexOf(en.letters[pos]);
  if (idx < 0) idx = 0;
  idx = (idx + dir + alphabet.length) % alphabet.length;
  en.letters[pos] = alphabet[idx];
}

function submitCheatEntry() {
  const en = state.cheatEntry;
  if (!en) return;
  const code = en.letters.join("");
  if (CHEAT_CODES[code]) {
    state.activeCheat = code;
    state.cheatBanner = 2.5;
    audio.playSfx && audio.playSfx("laser");
    if (state.player) applyCheat(state.player);
  }
  // Silent on miss — leave boxes intact so a single bad swipe doesn't wipe progress.
}

function handleCheatEntryKey(key) {
  const en = state.cheatEntry;
  if (!en) return;
  if (key === "Enter") { submitCheatEntry(); return; }
  if (key === "Backspace") {
    if (en.pos > 0) en.pos -= 1;
    en.letters[en.pos] = "A";
    return;
  }
  if (key === "ArrowLeft")  { if (en.pos > 0) en.pos -= 1; return; }
  if (key === "ArrowRight") { if (en.pos < 3) en.pos += 1; return; }
  if (key === "ArrowUp" || key === "ArrowDown") {
    cycleCheatLetter(en.pos, key === "ArrowUp" ? 1 : -1);
    return;
  }
  if (key.length === 1) {
    const ch = key.toUpperCase();
    if (/[A-Z0-9]/.test(ch)) {
      en.letters[en.pos] = ch;
      if (en.pos < 3) en.pos += 1;
    }
  }
}

// ---------- Audio ----------

const audio = (() => {
  // Track registry — lazy-init Audio elements + MediaElementSource on first use.
  // Each track stays connected to the analyser; only the playing one produces output.
  const TRACKS = {
    l1: { src: "audio/Artificial Savior.mp3", el: null, srcNode: null, available: true },
    l2: { src: "audio/AS LVL2.mp3",           el: null, srcNode: null, available: true },
    l3: { src: "audio/AS L3.mp3",             el: null, srcNode: null, available: true }
  };
  let activeKey = "l1";
  let muted = false;
  let started = false;
  const MASTER_BGM_BASE = 0.55;
  let crossfade = null; // { from, to, t, dur }

  // Persisted volume settings (0..1 each). Multiplies into the relevant signal path.
  const VOL_KEY = "artificialSaviorVolumes";
  const vols = { bgm: 1, weapon: 1, sfx: 1 };
  (function loadVols() {
    try {
      const raw = localStorage.getItem(VOL_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const k of ["bgm", "weapon", "sfx"]) {
        const v = obj && typeof obj[k] === "number" ? obj[k] : null;
        if (v !== null && isFinite(v)) vols[k] = Math.max(0, Math.min(1, v));
      }
    } catch (e) { /* ignore corrupt entry */ }
  })();
  function saveVols() {
    try { localStorage.setItem(VOL_KEY, JSON.stringify(vols)); } catch (e) {}
  }

  // Per-category SFX gain buses — created lazily once an AudioContext exists.
  let weaponBus = null, sfxBus = null;

  function ensureTrack(key) {
    const tr = TRACKS[key];
    if (!tr || tr.el) return tr;
    const el = new Audio(tr.src);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0;
    el.addEventListener("error", () => { tr.available = false; });
    tr.el = el;
    return tr;
  }

  // Procedural SFX via Web Audio so we don't need any additional files.
  let actx = null;
  function ensureCtx() {
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { actx = new C(); } catch (e) { return null; }
    }
    if (actx.state === "suspended") actx.resume();
    if (!weaponBus) {
      try {
        weaponBus = actx.createGain(); weaponBus.gain.value = vols.weapon;
        weaponBus.connect(actx.destination);
        sfxBus = actx.createGain(); sfxBus.gain.value = vols.sfx;
        sfxBus.connect(actx.destination);
      } catch (e) { weaponBus = null; sfxBus = null; }
    }
    return actx;
  }

  function envGain(ac, startVol, sustain, release) {
    const g = ac.createGain();
    const now = ac.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(startVol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, startVol * 0.6), now + 0.005 + sustain);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.005 + sustain + release);
    return g;
  }

  function noiseBuffer(ac, duration) {
    const n = Math.floor(ac.sampleRate * duration);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function sfxSmall(ac, dest) {
    // Tiny "pew" — short high square blip.
    const o = ac.createOscillator();
    o.type = "square";
    const now = ac.currentTime;
    o.frequency.setValueAtTime(1400, now);
    o.frequency.exponentialRampToValueAtTime(700, now + 0.05);
    const g = envGain(ac, 0.015, 0.02, 0.05);
    o.connect(g).connect(dest);
    o.start(); o.stop(now + 0.09);
  }

  function sfxLarge(ac, dest) {
    // Robust, heavier thump — triangle body + square snap.
    const now = ac.currentTime;
    const tri = ac.createOscillator(); tri.type = "triangle";
    tri.frequency.setValueAtTime(320, now);
    tri.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    const g1 = envGain(ac, 0.042, 0.05, 0.18);
    tri.connect(g1).connect(dest);
    tri.start(); tri.stop(now + 0.25);

    const sq = ac.createOscillator(); sq.type = "square";
    sq.frequency.setValueAtTime(180, now);
    sq.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    const g2 = envGain(ac, 0.022, 0.02, 0.12);
    sq.connect(g2).connect(dest);
    sq.start(); sq.stop(now + 0.18);
  }

  function sfxLaser(ac, dest) {
    // Energy ray — saw sweeping down through a resonant lowpass.
    const now = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(1600, now);
    o.frequency.exponentialRampToValueAtTime(260, now + 0.22);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 12;
    lp.frequency.setValueAtTime(2200, now);
    lp.frequency.exponentialRampToValueAtTime(500, now + 0.22);
    const g = envGain(ac, 0.027, 0.05, 0.18);
    o.connect(lp).connect(g).connect(dest);
    o.start(); o.stop(now + 0.28);
  }

  function sfxMissle(ac, dest) {
    // Rocket whoosh — filtered noise + low rumble sweep.
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.6);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(220, now + 0.5);
    const gn = envGain(ac, 0.075, 0.18, 0.35);
    src.connect(bp).connect(gn).connect(dest);
    src.start(); src.stop(now + 0.6);

    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.5);
    const g2 = envGain(ac, 0.045, 0.20, 0.30);
    o.connect(g2).connect(dest);
    o.start(); o.stop(now + 0.6);
  }

  function sfxExplosion(ac, dest) {
    // Big boom — loud low thump + sustained noise tail.
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 1.2);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.9);
    const gn = envGain(ac, 0.55, 0.25, 0.9);
    src.connect(lp).connect(gn).connect(dest);
    src.start(); src.stop(now + 1.2);

    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.9);
    const g2 = envGain(ac, 0.55, 0.15, 0.9);
    o.connect(g2).connect(dest);
    o.start(); o.stop(now + 1.1);
  }

  function sfxEnemyShot(ac, dest) {
    // Dark laser-style enemy shot — saw sweeping through a resonant lowpass,
    // tuned lower and quieter than the player's laser.
    const now = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(140, now + 0.22);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 10;
    lp.frequency.setValueAtTime(1200, now);
    lp.frequency.exponentialRampToValueAtTime(280, now + 0.22);
    const g = envGain(ac, 0.025, 0.05, 0.18);
    o.connect(lp).connect(g).connect(dest);
    o.start(); o.stop(now + 0.28);
  }

  function sfxEnemyDie(ac, dest) {
    // Small explosion — brief noise burst + low thump, no screen shake.
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.3);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(260, now + 0.22);
    const gn = envGain(ac, 0.22, 0.06, 0.22);
    src.connect(lp).connect(gn).connect(dest);
    src.start(); src.stop(now + 0.32);

    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(210, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.22);
    const g2 = envGain(ac, 0.20, 0.04, 0.2);
    o.connect(g2).connect(dest);
    o.start(); o.stop(now + 0.28);
  }

  function sfxNukeScream(ac, dest) {
    // Death-scream: starts as a sharp wail (~700 Hz), gargles down through the
    // throat, then breaks into a wet rasp before fading. Lower in the mix than
    // before so it doesn't trample the explosion+missile SFX.
    const now = ac.currentTime;
    const dur = 1.6;

    // Throat formant — resonant bandpass roughly tracking a vowel collapse.
    const formant = ac.createBiquadFilter();
    formant.type = "bandpass"; formant.Q.value = 8;
    formant.frequency.setValueAtTime(900, now);
    formant.frequency.exponentialRampToValueAtTime(260, now + dur);

    // Master gain, sharp attack + long release for a dying tail. Halved versus prior version.
    const gnMain = ac.createGain();
    gnMain.gain.setValueAtTime(0.0001, now);
    gnMain.gain.exponentialRampToValueAtTime(0.16, now + 0.04);
    gnMain.gain.exponentialRampToValueAtTime(0.09, now + 0.55);
    gnMain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    formant.connect(gnMain).connect(dest);

    // Two voices: one sawtooth (vocal cord buzz), one square (chip-tune edge),
    // both pitch-bending downward with a wider, slower vibrato for "agony".
    const voices = [
      { type: "sawtooth", f0: 720, f1: 95, det: 0 },
      { type: "square",   f0: 706, f1: 90, det: 9 }
    ];
    for (const v of voices) {
      const o = ac.createOscillator(); o.type = v.type;
      o.frequency.setValueAtTime(v.f0 + v.det, now);
      o.frequency.exponentialRampToValueAtTime(v.f1 + v.det, now + dur);
      const lfo = ac.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 4.2;
      const lfoGain = ac.createGain(); lfoGain.gain.value = 28;
      lfo.connect(lfoGain).connect(o.frequency);
      o.connect(formant);
      o.start(); o.stop(now + dur);
      lfo.start(); lfo.stop(now + dur);
    }

    // Wet rasp: filtered noise with its own envelope that swells in the back half
    // — gives the "death gurgle" before silence.
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, dur);
    const noiseBp = ac.createBiquadFilter();
    noiseBp.type = "bandpass"; noiseBp.Q.value = 4;
    noiseBp.frequency.setValueAtTime(1100, now);
    noiseBp.frequency.exponentialRampToValueAtTime(220, now + dur);
    const gnNoise = ac.createGain();
    gnNoise.gain.setValueAtTime(0.0001, now);
    gnNoise.gain.exponentialRampToValueAtTime(0.05, now + 0.15);
    gnNoise.gain.exponentialRampToValueAtTime(0.09, now + 0.85);
    gnNoise.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(noiseBp).connect(gnNoise).connect(dest);
    src.start(); src.stop(now + dur);
  }

  // Each entry: { fn, bus: 'weapon' | 'sfx' }. Player projectiles route through weaponBus,
  // everything else (enemy shots, explosions, deaths, nuke) routes through sfxBus.
  const SFX = {
    small:      { fn: sfxSmall,      bus: "weapon" },
    large:      { fn: sfxLarge,      bus: "weapon" },
    laser:      { fn: sfxLaser,      bus: "weapon" },
    missle:     { fn: sfxMissle,     bus: "sfx"    },
    explosion:  { fn: sfxExplosion,  bus: "sfx"    },
    enemyShot:  { fn: sfxEnemyShot,  bus: "sfx"    },
    enemyDie:   { fn: sfxEnemyDie,   bus: "sfx"    },
    nukeScream: { fn: sfxNukeScream, bus: "sfx"    }
  };

  // Analyser hookup for music-reactive visuals — both tracks share one analyser.
  let analyser = null;
  let freqData = null;
  const energy = { bass: 0, mid: 0, treble: 0, level: 0 };
  function ensureAnalyser() {
    const ac = ensureCtx();
    if (!ac) return;
    if (!analyser) {
      try {
        analyser = ac.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;
        freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.connect(ac.destination);
      } catch (e) {
        analyser = null; freqData = null;
        return;
      }
    }
    // Hook up source nodes for any track that has been instantiated.
    for (const key of Object.keys(TRACKS)) {
      const tr = TRACKS[key];
      if (tr.el && !tr.srcNode) {
        try {
          tr.srcNode = ac.createMediaElementSource(tr.el);
          tr.srcNode.connect(analyser);
        } catch (e) {
          tr.srcNode = null;
        }
      }
    }
  }
  function sampleEnergy() {
    if (!analyser || !freqData) return energy;
    analyser.getByteFrequencyData(freqData);
    const n = freqData.length;
    // Split into bass / mid / treble by frequency-bin thirds (roughly 0-1.4k, 1.4k-4.2k, 4.2k+).
    const b1 = Math.floor(n * 0.06), b2 = Math.floor(n * 0.22), b3 = Math.floor(n * 0.55);
    let bs = 0, md = 0, tr = 0, total = 0;
    for (let i = 0; i < b1; i++) bs += freqData[i];
    for (let i = b1; i < b2; i++) md += freqData[i];
    for (let i = b2; i < b3; i++) tr += freqData[i];
    for (let i = 0; i < n; i++) total += freqData[i];
    energy.bass   = (bs / Math.max(1, b1))       / 255;
    energy.mid    = (md / Math.max(1, b2 - b1))  / 255;
    energy.treble = (tr / Math.max(1, b3 - b2))  / 255;
    energy.level  = total / (n * 255);
    return energy;
  }

  return {
    unlockAndPlay() {
      ensureCtx();
      ensureTrack(activeKey);
      ensureAnalyser();
      const tr = TRACKS[activeKey];
      if (!tr || !tr.available || muted || started) return;
      const p = tr.el.play();
      const onStart = () => { started = true; tr.el.volume = MASTER_BGM_BASE * vols.bgm; };
      if (p && typeof p.then === "function") {
        p.then(onStart).catch(() => { /* retry on next input */ });
      } else {
        onStart();
      }
    },
    toggleMute() {
      muted = !muted;
      if (muted) {
        for (const key of Object.keys(TRACKS)) {
          const tr = TRACKS[key];
          if (tr.el) tr.el.pause();
        }
      } else {
        started = false; this.unlockAndPlay();
      }
    },
    pauseMusic() {
      if (muted || !started) return;
      for (const key of Object.keys(TRACKS)) {
        const tr = TRACKS[key];
        if (tr.el && !tr.el.paused) tr.el.pause();
      }
    },
    resumeMusic() {
      if (muted) return;
      // Resume whatever was playing (active track + the other side of any crossfade).
      const resumeOne = (key) => {
        const tr = TRACKS[key];
        if (!tr || !tr.el) return;
        const p = tr.el.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      };
      resumeOne(activeKey);
      if (crossfade) resumeOne(crossfade.from);
    },
    crossfadeTo(key, dur) {
      if (!TRACKS[key]) return;
      if (typeof dur !== "number") dur = 1.5;
      if (key === activeKey && !crossfade) return;
      ensureCtx();
      ensureTrack(key);
      ensureAnalyser();
      const fromKey = crossfade ? crossfade.to : activeKey;
      if (key === fromKey) {
        // Cancel any in-flight fade and just snap to the active track.
        crossfade = null;
        return;
      }
      const toTr = TRACKS[key];
      if (muted || !toTr.available) {
        // Defer — just record the new active track; unlockAndPlay will pick it up.
        const fromTr = TRACKS[fromKey];
        if (fromTr && fromTr.el) { fromTr.el.pause(); fromTr.el.currentTime = 0; fromTr.el.volume = 0; }
        activeKey = key;
        return;
      }
      // Start the new track at volume 0 and ramp via tickMusic.
      try { toTr.el.currentTime = 0; } catch (e) { /* some browsers throw before metadata */ }
      toTr.el.volume = 0;
      const p = toTr.el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      crossfade = { from: fromKey, to: key, t: 0, dur };
      // Mark started=true since at least one track is playing now.
      started = true;
    },
    tickMusic(dt) {
      if (!crossfade) return;
      crossfade.t += dt;
      const k = Math.max(0, Math.min(1, crossfade.t / crossfade.dur));
      const fromTr = TRACKS[crossfade.from];
      const toTr = TRACKS[crossfade.to];
      if (fromTr && fromTr.el) fromTr.el.volume = MASTER_BGM_BASE * vols.bgm * (1 - k);
      if (toTr && toTr.el) toTr.el.volume = MASTER_BGM_BASE * vols.bgm * k;
      if (k >= 1) {
        if (fromTr && fromTr.el) {
          fromTr.el.pause();
          try { fromTr.el.currentTime = 0; } catch (e) {}
          fromTr.el.volume = 0;
        }
        activeKey = crossfade.to;
        crossfade = null;
      }
    },
    playSfx(kind) {
      if (muted) return;
      const ac = ensureCtx();
      if (!ac) return;
      const entry = SFX[kind];
      if (!entry) return;
      const dest = entry.bus === "weapon" ? (weaponBus || ac.destination) : (sfxBus || ac.destination);
      entry.fn(ac, dest);
    },
    getVolume(kind) {
      return vols[kind];
    },
    setVolume(kind, v) {
      if (!(kind in vols)) return;
      v = Math.max(0, Math.min(1, +v || 0));
      vols[kind] = v;
      saveVols();
      if (kind === "bgm") {
        // Preserve crossfade weights so an in-flight fade doesn't get clobbered.
        const base = MASTER_BGM_BASE * vols.bgm;
        if (crossfade) {
          const k = Math.max(0, Math.min(1, crossfade.t / crossfade.dur));
          const fromTr = TRACKS[crossfade.from], toTr = TRACKS[crossfade.to];
          if (fromTr && fromTr.el) fromTr.el.volume = base * (1 - k);
          if (toTr && toTr.el) toTr.el.volume = base * k;
        } else {
          const tr = TRACKS[activeKey];
          if (tr && tr.el) tr.el.volume = base;
        }
      } else if (kind === "weapon") {
        if (weaponBus) weaponBus.gain.value = v;
      } else if (kind === "sfx") {
        if (sfxBus) sfxBus.gain.value = v;
      }
    },
    getEnergy() { return sampleEnergy(); },
    get muted() { return muted; },
    get available() {
      const tr = TRACKS[activeKey];
      return !!(tr && tr.available);
    },
    get started() { return started; },
    get activeKey() { return activeKey; },
    get activeTrackPath() {
      const tr = TRACKS[activeKey];
      return tr ? tr.src : "";
    }
  };
})();

// ---------- Entities ----------

function makePlayer(sprites) {
  const s = sprites.player;
  return {
    x: 120, y: H / 2,
    vx: 0, vy: 0,
    size: s.size,
    img: s.img,
    speed: 400,
    hp: 10, maxHp: 10,
    weapon: "small",
    unlocked: { small: true, large: false, laser: false, missle: false },
    nukeAmmo: 0,
    nukeBtnLatch: false,
    energy: 100, maxEnergy: 100,
    energyBonus: 0,
    cd: 0,
    invuln: 0,
    shieldT: 0,
    tier: 1,
    nextUpgrade: UPGRADE_INTERVAL,
    cooldownMul: 1,
    damageBonus: 0,
    speedMul: 1,
    mk4Unlocked: false,
    godPickupT: 0
  };
}

// Single source of truth for player sprite selection.
// Priority: god mode (timer or MICO cheat) > mk4Unlocked > MK3 (tier) > MK2 (tier) > MK1.
// Each step falls back to the next if its sprite is missing.
function resolvePlayerSprite(p) {
  if (!p || !state.sprites) return;
  const pickIfReady = (key) => {
    const s = state.sprites[key];
    return s && s.img ? s : null;
  };
  let chosen = null;
  if (p.godPickupT > 0 || state.godMode) chosen = pickIfReady("playerGod");
  if (!chosen && p.mk4Unlocked)         chosen = pickIfReady("playerMk4");
  if (!chosen && p.tier >= MK3_TIER)    chosen = pickIfReady("playerMk3");
  if (!chosen && p.tier >= MK2_TIER)    chosen = pickIfReady("playerMk2");
  if (!chosen)                          chosen = pickIfReady("player");
  if (chosen) {
    p.img = chosen.img;
    p.size = chosen.size;
  }
}

function levelUp(p) {
  p.tier += 1;
  p.nextUpgrade += UPGRADE_INTERVAL;

  resolvePlayerSprite(p);
  refreshMaxEnergy(p);

  p.maxHp += 3;
  p.hp = Math.min(p.maxHp, p.hp + 4);
  p.speed += 20;
  p.cooldownMul *= 0.9;
  p.damageBonus += 1;

  state.upgradeBanner = 2.5;
  state.upgradeText = `MK ${p.tier} ONLINE`;
  burst(p.x, p.y, "#9fd1ff", 40);
}

// Energy capacity scales with the player's current MK tier. Bonus from boost
// pickups (p.energyBonus) is additive on top of the tier base.
//   MK1: 100, MK2: 250, MK3: 600, MK4: 1000.
function maxEnergyBase(p) {
  if (p.mk4Unlocked) return 1000;
  if (p.tier >= MK3_TIER) return 600;
  if (p.tier >= MK2_TIER) return 250;
  return 100;
}
function refreshMaxEnergy(p) {
  const newMax = maxEnergyBase(p) + (p.energyBonus || 0);
  // Award the delta so a fresh upgrade feels like a recharge.
  if (newMax > (p.maxEnergy || 0)) p.energy = (p.energy || 0) + (newMax - (p.maxEnergy || 0));
  p.maxEnergy = newMax;
  p.energy = Math.min(p.maxEnergy, p.energy);
}

const state = {
  sprites: null,
  player: null,
  bullets: [],
  enemies: [],
  pickups: [],
  particles: [],
  asteroids: [],
  homingBeams: [],
  bossShockwave: null,
  stars: [],
  score: 0,
  kills: 0,
  shake: 0,
  shakeMag: 0,
  outroDelay: 0,
  // L2 electrical-storm: time until next lightning bolt + currently-visible bolt.
  lightningCd: 0,
  lightning: null,
  spawnTimer: 0,
  asteroidSpawnTimer: 0,
  t: 0,
  gameOver: false,
  victory: false,
  victoryStartT: 0,
  outro: false,
  continueAvailable: false,
  loaded: false,
  error: null,
  upgradeBanner: 0,
  upgradeText: "",
  toast: null,
  boss: null,
  bossTriggered: false,
  bossDefeated: false,
  semiBossTriggered: false,
  semiBossDefeated: false,
  finalBossTriggered: false,
  finalBossDefeated: false,
  cubeBossDefeated: false,
  godPickupsThisLevel: 0,
  phase: "title",
  titleElapsed: 0,
  paused: false,
  hiscores: [],
  entry: null,
  cheatEntry: null,
  audioMenu: null,
  cheatBuffer: "",
  activeCheat: null,
  godMode: false,
  cheatBanner: 0,
  levelIdx: 0,
  level: LEVELS[0],
  levelStartScore: 0
};

// Secret cheat codes (entered on the title screen; not surfaced to the UI).
const CHEAT_CODES = {
  EDGE: "MK2 ship at level 20 with all projectiles",
  MICO: "God mode — invulnerable but progress normally"
};

const TITLE_DURATION = 20;
const HISCORE_KEY = "artificialSaviorHiscores";
const HISCORE_MAX = 10;

function loadHiscores() {
  try {
    const raw = localStorage.getItem(HISCORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(r => r && typeof r.initials === "string" && typeof r.score === "number")
      .map(r => ({ initials: r.initials.slice(0, 3).toUpperCase(), score: r.score | 0, kills: (typeof r.kills === "number" ? r.kills | 0 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, HISCORE_MAX);
  } catch (e) { return []; }
}

function saveHiscores(list) {
  try { localStorage.setItem(HISCORE_KEY, JSON.stringify(list)); } catch (e) { /* private mode etc. */ }
}

function qualifiesForHiscore(score) {
  if (score <= 0) return false;
  if (state.hiscores.length < HISCORE_MAX) return true;
  return score > state.hiscores[state.hiscores.length - 1].score;
}

function submitHiscore(initials, score, kills) {
  const clean = (initials || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "A");
  state.hiscores.push({ initials: clean, score, kills: (kills | 0) });
  state.hiscores.sort((a, b) => b.score - a.score);
  state.hiscores = state.hiscores.slice(0, HISCORE_MAX);
  saveHiscores(state.hiscores);
}

function initStars() {
  state.stars = [];
  for (let i = 0; i < 140; i++) {
    state.stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 2 + 0.3 });
  }
}

function reset() {
  state.player = makePlayer(state.sprites);
  state.bullets = [];
  state.enemies = [];
  state.pickups = [];
  state.particles = [];
  state.asteroids = [];
  state.homingBeams = [];
  state.bossShockwave = null;
  state.score = 0;
  state.kills = 0;
  state.shake = 0;
  state.outroDelay = 0;
  state.spawnTimer = 0;
  state.asteroidSpawnTimer = 0;
  state.gameOver = false;
  state.victory = false;
  state.victoryStartT = 0;
  state.outro = false;
  state.continueAvailable = false;
  state.upgradeBanner = 0;
  state.toast = null;
  state.boss = null;
  state.bossTriggered = false;
  state.bossDefeated = false;
  state.semiBossTriggered = false;
  state.semiBossDefeated = false;
  state.finalBossTriggered = false;
  state.finalBossDefeated = false;
  state.cubeBossDefeated = false;
  state.godPickupsThisLevel = 0;
  state.entry = null;
  state.godMode = false;
  state.levelIdx = 0;
  state.level = LEVELS[0];
  state.levelStartScore = 0;
  applyCheat(state.player);
  resolvePlayerSprite(state.player);
  // Retry from L2 returns to L1 music with a short fade.
  if (audio && audio.crossfadeTo) audio.crossfadeTo("l1", 0.5);
}

// Carry the player across to the next level. Preserves score, weapons, tier, hp,
// shield, cheats, godMode, and the active God Mode pickup timer. Resets per-level
// flags + spawn collections + boss state. Triggers the music crossfade.
function advanceLevel() {
  const next = LEVELS.find(l => l.id === state.level.nextLevel);
  if (!next) return;
  state.levelIdx = LEVELS.indexOf(next);
  state.level = next;
  state.levelStartScore = state.score;
  state.bullets = [];
  state.enemies = [];
  state.pickups = [];
  state.particles = [];
  state.asteroids = [];
  state.homingBeams = [];
  state.bossShockwave = null;
  state.boss = null;
  state.bossTriggered = false;
  state.bossDefeated = false;
  state.semiBossTriggered = false;
  state.semiBossDefeated = false;
  state.finalBossTriggered = false;
  state.finalBossDefeated = false;
  state.cubeBossDefeated = false;
  state.godPickupsThisLevel = 0;
  state.outro = false;
  state.victory = false;
  state.continueAvailable = false;
  state.gameOver = false;
  state.entry = null;
  state.spawnTimer = 0;
  state.asteroidSpawnTimer = 0;
  // Story-driven MK4 unlock.
  state.player.mk4Unlocked = true;
  resolvePlayerSprite(state.player);
  refreshMaxEnergy(state.player);
  // Re-place the player on the left edge so the new level reads as a fresh start.
  state.player.x = 120;
  state.player.y = H / 2;
  state.player.invuln = 1.2;
  state.upgradeBanner = 4.0;
  state.upgradeText = `LEVEL ${next.id} — ${next.name.toUpperCase()}`;
  if (audio && audio.crossfadeTo) audio.crossfadeTo(next.music, 1.5);
}

function applyCheat(p) {
  if (!state.activeCheat) return;
  const unlockAll = () => { p.unlocked = { small: true, large: true, laser: true, missle: true }; };
  switch (state.activeCheat) {
    case "EDGE": {
      // Jump to MK 20 with cumulative stat gains equivalent to 19 levelUps.
      const levels = 19;
      p.tier = 1 + levels;
      p.maxHp = 10 + 3 * levels;
      p.hp = p.maxHp;
      p.speed = 400 + 20 * levels;
      p.cooldownMul = Math.pow(0.9, levels);
      p.damageBonus = levels;
      p.nextUpgrade = UPGRADE_INTERVAL * (levels + 1);
      // Cheat-driven MK4 unlock.
      p.mk4Unlocked = true;
      resolvePlayerSprite(p);
      refreshMaxEnergy(p);
      unlockAll();
      p.nukeAmmo = NUKE_MAX;
      p.weapon = "laser";
      state.upgradeBanner = 2.5;
      state.upgradeText = `MK ${p.tier} ONLINE`;
      break;
    }
    case "MICO": {
      state.godMode = true;
      unlockAll();
      p.nukeAmmo = NUKE_MAX;
      p.weapon = "laser";
      resolvePlayerSprite(p);
      state.upgradeBanner = 2.5;
      state.upgradeText = "GOD MODE ENGAGED";
      break;
    }
  }
}

function spawnBoss() {
  const lvl = state.level;
  const sprite = state.sprites[lvl.bossSprite] || state.sprites.enemyDragon;
  const baseSize = sprite ? sprite.size : 80;
  const size = baseSize * (lvl.bossSpriteScale || 1);
  const boss = {
    x: W + 160, y: H / 2,
    vx: -90, vy: 0,
    baseY: H / 2,
    size,
    img: sprite ? sprite.img : null,
    hp: lvl.bossHp, maxHp: lvl.bossHp,
    fireCd: 1.2,
    burstCd: 3.0,
    isBoss: true,
    kind: "mini",
    label: lvl.bossLabel,
    entering: true,
    phase: 0,
    t: 0
  };
  state.enemies.push(boss);
  state.boss = boss;
  state.bossTriggered = true;
  state.upgradeBanner = 3.5;
  state.upgradeText = lvl.bossIncomingText || "!! MINI-BOSS INCOMING !!";
}

function spawnSemiBoss() {
  const lvl = state.level;
  const sprite = state.sprites[lvl.semiBossSprite];
  const hasImg = !!(sprite && sprite.img);
  const boss = {
    x: W + 220, y: H / 2,
    vx: -110, vy: 0,
    baseY: H / 2,
    size: hasImg ? sprite.size : 260,
    img: hasImg ? sprite.img : null,
    hp: lvl.semiBossHp, maxHp: lvl.semiBossHp,
    fireCd: 1.4,
    burstCd: 3.5,
    isBoss: true,
    kind: "semi",
    label: lvl.semiBossLabel,
    entering: true,
    phase: 0,
    t: 0
  };
  state.enemies.push(boss);
  state.boss = boss;
  state.semiBossTriggered = true;
  state.upgradeBanner = 4.5;
  state.upgradeText = lvl.semiBossIncomingText || "!! SEMI-FINAL BOSS !!";
}

function spawnFinalBoss() {
  // The final boss — larger, tougher, and far more aggressive than the semi-final.
  const lvl = state.level;
  const sprite = state.sprites[lvl.finalBossSprite];
  const hasImg = !!(sprite && sprite.img);
  const isMotherShip = lvl.finalBossSprite === "motherShip";
  // Dimensional Horror (L3) tracks the player like Harbinger AND fires Mother
  // Ship homing beams + shockwaves on top — flagged via dimensionalCombo.
  const isDimensional = lvl.finalBossSprite === "dimensionalBoss";
  const boss = {
    x: W + 260, y: H / 2,
    vx: -130, vy: 0,
    baseY: H / 2,
    size: hasImg ? sprite.size : 320,
    img: hasImg ? sprite.img : null,
    hp: lvl.finalBossHp, maxHp: lvl.finalBossHp,
    fireCd: 0.8,
    burstCd: 2.2,
    isBoss: true,
    kind: "final",
    label: lvl.finalBossLabel,
    entering: true,
    phase: 0,
    t: 0,
    finalBossSprite: lvl.finalBossSprite,    // "finalBoss" (Harbinger), "motherShip", or "dimensionalBoss"
    isMotherShip,
    dimensionalCombo: isDimensional,
    // Beam/shockwave timers — used by Mother Ship and by Dimensional Horror's combo mode.
    // Combo mode runs at ~70% of MS cadence so the chase + spread + ring + beams stay survivable.
    motherShipBurstT: (isDimensional ? MOTHERSHIP_LASER_INTERVAL * 1.4 : MOTHERSHIP_LASER_INTERVAL * 0.75),
    motherShipShockT: (isDimensional ? MOTHERSHIP_SHOCKWAVE_INTERVAL * 1.1 : MOTHERSHIP_SHOCKWAVE_INTERVAL * 0.6),
    motherShipBurstQueue: 0,
    motherShipBurstGapT: 0,
    motherShipAnchorX: W * 0.72,
    motherShipAnchorY: H * 0.5
  };
  state.enemies.push(boss);
  state.boss = boss;
  // Shield-drop schedule applies to Harbinger AND Dimensional Horror (Mother Ship is exempt).
  if (!isMotherShip) {
    boss.nextShieldHp = boss.hp - (FINAL_BOSS_SHIELD_MIN + Math.random() * (FINAL_BOSS_SHIELD_MAX - FINAL_BOSS_SHIELD_MIN));
  }
  state.finalBossTriggered = true;
  state.upgradeBanner = 5.0;
  state.upgradeText = lvl.finalBossIncomingText || "!! FINAL BOSS !!";
}

function bossFire(e) {
  // Aimed triple-spread at the player.
  const p = state.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const ang = Math.atan2(dy, dx);
  const speed = 420;
  for (const off of [-0.22, 0, 0.22]) {
    const a = ang + off;
    state.bullets.push({
      x: e.x - e.size * 0.35, y: e.y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      size: 14, damage: 2,
      color: "#ff7a3a",
      img: null,
      life: 2.8,
      friendly: false
    });
  }
  audio.playSfx("enemyShot");
}

function drawSemiBoss(e) {
  const t = state.t;
  const s = e.size;
  ctx.save();
  ctx.translate(e.x, e.y);
  // Face left.
  ctx.scale(-1, 1);

  // Outer menacing aura — pulsing red glow.
  const auraPulse = 0.85 + 0.15 * Math.sin(t * 2.2);
  const aura = ctx.createRadialGradient(0, 0, s * 0.25, 0, 0, s * 0.95 * auraPulse);
  aura.addColorStop(0, "rgba(255, 40, 40, 0.55)");
  aura.addColorStop(1, "rgba(255, 40, 40, 0)");
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.95, 0, Math.PI * 2); ctx.fill();

  // Engine exhaust plumes at the rear (flickering).
  const flick = 0.55 + 0.45 * Math.sin(t * 24);
  const plume = ctx.createLinearGradient(-s * 0.45, 0, -s * 0.85, 0);
  plume.addColorStop(0, `rgba(255, 120, 40, ${0.85 * flick})`);
  plume.addColorStop(1, "rgba(255, 40, 40, 0)");
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.18);
  ctx.lineTo(-s * 0.9 - flick * 18, 0);
  ctx.lineTo(-s * 0.45, s * 0.18);
  ctx.closePath();
  ctx.fill();

  // Main hull — dark angular arrowhead.
  ctx.fillStyle = "#14070f";
  ctx.strokeStyle = "#ff3a3a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, 0);
  ctx.lineTo(s * 0.35, -s * 0.28);
  ctx.lineTo(-s * 0.15, -s * 0.42);
  ctx.lineTo(-s * 0.45, -s * 0.22);
  ctx.lineTo(-s * 0.45,  s * 0.22);
  ctx.lineTo(-s * 0.15,  s * 0.42);
  ctx.lineTo(s * 0.35,  s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Armor striations.
  ctx.strokeStyle = "#5a1820";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, i * s * 0.1);
    ctx.lineTo(s * 0.32, i * s * 0.1);
    ctx.stroke();
  }

  // Jagged teeth at the front (shark-like maw).
  ctx.fillStyle = "#3a1010";
  for (let i = -3; i <= 3; i++) {
    const yy = i * s * 0.09;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, yy - s * 0.035);
    ctx.lineTo(s * 0.62, yy);
    ctx.lineTo(s * 0.5, yy + s * 0.035);
    ctx.closePath();
    ctx.fill();
  }

  // Glowing crimson core — pulsing, with an inner hot-white point.
  const pulse = 0.72 + 0.28 * Math.sin(t * 3.1);
  const coreR = s * 0.14 * pulse;
  ctx.save();
  ctx.shadowColor = "#ff1818";
  ctx.shadowBlur = 36;
  ctx.fillStyle = "#ff3030";
  ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(0, 0, coreR * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Turret pods above and below that track the player (aim indicators).
  const p = state.player;
  // We're in a flipped frame, so invert x-delta for aiming.
  const aimAng = Math.atan2(p.y - e.y, -(p.x - e.x));
  for (const py of [-s * 0.3, s * 0.3]) {
    ctx.save();
    ctx.translate(0, py);
    ctx.rotate(aimAng);
    ctx.fillStyle = "#260808";
    ctx.strokeStyle = "#ff3a3a";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.085, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff3a3a";
    ctx.fillRect(0, -s * 0.022, s * 0.2, s * 0.044);
    // Muzzle tip highlight when firing is imminent.
    if (e.fireCd < 0.2) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(s * 0.2, 0, s * 0.018, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Forward horn spikes on the nose.
  ctx.fillStyle = "#2a0a0a";
  ctx.strokeStyle = "#ff3a3a";
  ctx.lineWidth = 1.5;
  for (const yy of [-s * 0.24, s * 0.24]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.35, yy);
    ctx.lineTo(s * 0.55, yy * 0.55);
    ctx.lineTo(s * 0.35, yy * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function killPlayer(p) {
  if (state.gameOver) return;
  state.gameOver = true;
  // Big visual explosion — several overlapping colored bursts.
  for (let k = 0; k < 5; k++) {
    const ox = (Math.random() - 0.5) * p.size * 0.9;
    const oy = (Math.random() - 0.5) * p.size * 0.9;
    burst(p.x + ox, p.y + oy, "#ffd27a", 28);
    burst(p.x + ox, p.y + oy, "#ff5a3a", 28);
  }
  burst(p.x, p.y, "#ffffff", 40);
  burst(p.x, p.y, "#9fd1ff", 24);
  audio.playSfx("explosion");

  // Start initials entry if the score qualifies for the leaderboard.
  if (qualifiesForHiscore(state.score)) {
    state.entry = { letters: ["A", "A", "A"], pos: 0, submitted: false, score: state.score };
  }
}

function triggerLevelOutro() {
  if (state.outro) return;
  state.outro = true;
  state.victory = true;
  state.victoryStartT = state.t;
  state.gameOver = true;
  state.continueAvailable = !!state.level.nextLevel;
  // 4.5-second hold so the music crossfade can land and the player can read
  // the "level complete" beat before any input advances the level.
  state.outroDelay = state.continueAvailable ? 4.5 : 0;
  // Clear remaining hostile bullets / homing beams / shockwave so the cinematic isn't interrupted.
  state.bullets = state.bullets.filter(b => b.friendly);
  state.homingBeams = [];
  state.bossShockwave = null;
  // Initials entry only on the FINAL level (no nextLevel).
  if (!state.continueAvailable) {
    state.entry = { letters: ["A", "A", "A"], pos: 0, submitted: false, score: state.score };
  }
  audio.playSfx("explosion");
}

// Backwards-compat alias — older call sites referenced triggerVictory().
const triggerVictory = triggerLevelOutro;

function bossBurst(e) {
  // Radial burst — punishes staying still.
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.05;
    state.bullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
      size: 12, damage: 2,
      color: "#ff3a7a",
      img: null,
      life: 2.5,
      friendly: false
    });
  }
  audio.playSfx("enemyShot");
}

function semiBossFire(e) {
  // Wide 5-way aimed spread with slight y-scatter per barrel.
  const p = state.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const ang = Math.atan2(dy, dx);
  const speed = 480;
  for (const off of [-0.36, -0.18, 0, 0.18, 0.36]) {
    const a = ang + off;
    state.bullets.push({
      x: e.x - e.size * 0.35, y: e.y + (Math.random() - 0.5) * 24,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      size: 16, damage: 3,
      color: "#ff4040",
      img: null,
      life: 3.0,
      friendly: false
    });
  }
  audio.playSfx("enemyShot");
}

function semiBossBurst(e) {
  // Dense rotating radial barrage.
  const n = 24;
  const spin = e.t * 0.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + spin;
    state.bullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
      size: 14, damage: 2,
      color: "#ff2070",
      img: null,
      life: 2.8,
      friendly: false
    });
  }
  audio.playSfx("enemyShot");
}

function finalBossFire(e) {
  // Aggressive 7-way aimed spread plus two flanking straight shots.
  const p = state.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const ang = Math.atan2(dy, dx);
  const speed = 560;
  for (const off of [-0.48, -0.32, -0.16, 0, 0.16, 0.32, 0.48]) {
    const a = ang + off;
    state.bullets.push({
      x: e.x - e.size * 0.35, y: e.y + (Math.random() - 0.5) * 18,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      size: 16, damage: 3,
      color: "#ffb347",
      img: null,
      life: 3.2,
      friendly: false
    });
  }
  // Flanking sniper shots from turret pods.
  for (const py of [-e.size * 0.3, e.size * 0.3]) {
    state.bullets.push({
      x: e.x - e.size * 0.2, y: e.y + py,
      vx: -720, vy: 0,
      size: 14, damage: 3,
      color: "#ffffff",
      img: null,
      life: 2.5,
      friendly: false
    });
  }
  audio.playSfx("enemyShot");
}

function finalBossBurst(e) {
  // Two counter-rotating rings — dense, punishing radial pressure.
  const n = 20;
  const spin = e.t * 0.5;
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2 + spin;
    const a2 = (i / n) * Math.PI * 2 - spin * 1.2;
    state.bullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a1) * 380, vy: Math.sin(a1) * 380,
      size: 14, damage: 2,
      color: "#ff9020",
      img: null, life: 3.0, friendly: false
    });
    state.bullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a2) * 260, vy: Math.sin(a2) * 260,
      size: 12, damage: 2,
      color: "#b040ff",
      img: null, life: 3.2, friendly: false
    });
  }
  audio.playSfx("enemyShot");
}

// ---------- Systems ----------

function autoSwitchFromLaser(p) {
  // If laser is selected and energy is fully depleted (from laser drain or shield-hit drain),
  // auto-fall back to the highest-tier non-laser weapon the player owns. God Mode bypasses.
  if (!p || p.weapon !== "laser") return;
  if (p.energy > 0) return;
  if (state.godMode || (p.godPickupT || 0) > 0) return;
  const next = p.unlocked && p.unlocked.large ? "large" : "small";
  if (next === p.weapon) return;
  p.weapon = next;
  p._laserOut = false;
  showToast(`ENERGY DEPLETED — ${WEAPONS[next].label}`, "#ffd66b");
}

function fireWeapon(p, dt) {
  // Catch shield-drain depletion from prior frame (laser → fallback weapon).
  autoSwitchFromLaser(p);
  // Edge-triggered nuke on weapon-4 / "missle" key. Fires alongside the primary
  // weapon (does not switch p.weapon). Consumes 1 of up to NUKE_MAX charges.
  const nukeHeld = keys.has("4");
  if (nukeHeld && !p.nukeBtnLatch) {
    p.nukeBtnLatch = true;
    const godActiveNow = state.godMode || (p.godPickupT > 0);
    if (p.unlocked.missle && (godActiveNow || (p.nukeAmmo || 0) > 0)) {
      // GOD MODE bypasses ammo consumption entirely.
      if (!godActiveNow) p.nukeAmmo -= 1;
      detonateNuke(p, WEAPONS.missle);
    } else if (!state._nukeEmptyToast || state.toast == null) {
      showToast(p.unlocked.missle ? "NO NUKES" : "NUKE LOCKED", "#ff6b6b");
      state._nukeEmptyToast = true;
    }
  } else if (!nukeHeld) {
    p.nukeBtnLatch = false;
    state._nukeEmptyToast = false;
  }

  p.cd -= dt;
  // Player primary weapon never fires the nuke; guard against stale state.
  const weaponKey = (p.weapon === "missle") ? "small" : p.weapon;
  const isLaser = weaponKey === "laser";
  const wantFire = keys.has(" ");

  // Laser drains energy while held; regenerates otherwise. God Mode (permanent
  // MICO cheat or active GOD MODE pickup timer) bypasses drain entirely.
  const godActive = state.godMode || (p.godPickupT > 0);
  if (isLaser && wantFire && p.energy > 0 && !godActive) {
    p.energy = Math.max(0, p.energy - LASER_DRAIN * dt);
    if (p.energy <= 0) autoSwitchFromLaser(p);
  } else {
    p.energy = Math.min(p.maxEnergy, (p.energy || 0) + LASER_REGEN * dt);
  }

  if (!wantFire || p.cd > 0) return;
  if (isLaser && !godActive) {
    if (p._laserOut) {
      // Currently locked out — wait for the bar to refill past the min threshold.
      if (p.energy < LASER_MIN_ENERGY) return;
      p._laserOut = false;
    }
    if (p.energy <= 0) { p._laserOut = true; return; }
  } else if (godActive) {
    p._laserOut = false;
  }

  const w = WEAPONS[weaponKey];
  p.cd = w.cooldown * (p.cooldownMul || 1);
  state.bullets.push({
    x: p.x + p.size * 0.5, y: p.y,
    vx: w.speed, vy: 0,
    size: w.size, damage: w.damage + (p.damageBonus || 0),
    color: w.color,
    weapon: weaponKey,
    img: null,
    life: 1.6,
    friendly: true
  });
  audio.playSfx(weaponKey);
}

// Boss-death pipeline — applies score, flags, drops, victory trigger.
// Used both by the regular bullet-vs-boss path and by detonateNuke.
function killBoss(e) {
  const semi = e.kind === "semi";
  const finalB = e.kind === "final";
  const bursts = finalB ? 14 : semi ? 10 : 6;
  const burstColor = finalB ? "#ffb040" : semi ? "#ff3a3a" : "#ff9a3a";
  for (let k = 0; k < bursts; k++) burst(e.x + (Math.random() - 0.5) * e.size * 0.8, e.y + (Math.random() - 0.5) * e.size * 0.8, burstColor, 40);
  state.score += finalB ? FINAL_BOSS_REWARD : semi ? SEMIBOSS_REWARD : BOSS_REWARD;
  if (finalB) state.finalBossDefeated = true;
  else if (semi) state.semiBossDefeated = true;
  else {
    state.bossDefeated = true;
    if (state.level && state.level.id === 2) state.cubeBossDefeated = true;
  }
  state.boss = null;
  if (finalB) { state.homingBeams = []; state.bossShockwave = null; }
  state.upgradeBanner = 4.0;
  state.upgradeText = finalB ? "FINAL BOSS DEFEATED" : semi ? "SEMI-FINAL BOSS DEFEATED" : "BOSS DEFEATED";
  const drops = finalB ? 10 : semi ? 6 : 3;
  for (let k = 0; k < drops; k++) spawnPickup(e.x + (Math.random() - 0.5) * 80, e.y + (Math.random() - 0.5) * 80, state.player.tier + (finalB ? 4 : semi ? 3 : 2));
  while (state.score >= state.player.nextUpgrade) levelUp(state.player);
  if (finalB) triggerVictory();
}

const NUKE_MAX = 3;
const LASER_DRAIN = 35;       // energy units per second while firing
const LASER_REGEN = 22;       // energy units per second while not firing
const LASER_MIN_ENERGY = 20;  // must refill to this much before laser can resume after empty

// Nuke: clears all non-boss enemies/asteroids/enemy bullets and chunks boss HP.
function detonateNuke(p, w) {
  // Boss takes a fraction of max HP (1/4 mini, 1/8 semi/final). If HP reaches 0,
  // run the boss-death pipeline so victory/level-progression triggers fire.
  if (state.boss && state.boss.hp > 0) {
    const b = state.boss;
    const frac = b.kind === "mini" ? (w.miniBossFrac || 0.25)
              : b.kind === "final" ? (w.finalBossFrac || 0.125)
              : (w.semiBossFrac || 0.125);
    const dmg = Math.max(1, Math.ceil((b.maxHp || b.hp) * frac));
    b.hp = Math.max(0, b.hp - dmg);
    burst(b.x, b.y, "#fff7d6", 60);
    burst(b.x, b.y, "#ffb26b", 50);
    if (b.hp <= 0) killBoss(b);
  }
  // Vaporise every non-boss enemy on screen, awarding half score + counting kills.
  // Each vaporised enemy rolls the same pickup-drop chance as a regular kill so
  // nuking a wave can still produce loot. Chance is half the normal rate so a
  // full nuke doesn't carpet the screen with pickups.
  let killed = 0;
  for (const e of state.enemies) {
    if (e.isBoss || e.hp <= 0) continue;
    burst(e.x, e.y, "#ffb26b", 24);
    burst(e.x, e.y, "#fff7d6", 12);
    state.score += (e.scoreReward || 100) >> 1;
    state.kills = (state.kills || 0) + 1;
    const dropChance = 0.5 * (0.15 + Math.min(0.25, (state.player.tier - 1) * 0.04));
    if (Math.random() < dropChance) spawnPickup(e.x, e.y, state.player.tier);
    e.hp = 0;
    killed++;
  }
  // Asteroids: nuke obliterates them all (medium does NOT split into smalls).
  for (const a of state.asteroids) {
    if (a.hp <= 0) continue;
    burst(a.x, a.y, "#e0c89a", 18);
    burst(a.x, a.y, "#ffb26b", 10);
    a.hp = 0;
  }
  state.bullets = state.bullets.filter(b => b.friendly);
  // Screen shake + flash only — no fireball at the player ship (it visually
  // looked like the player exploded).
  state.nukeFlash = 0.9;
  state.shake = Math.max(state.shake || 0, 0.7);
  state.shakeMag = 14;
  audio.playSfx("explosion");
  audio.playSfx("missle");
  // Delayed 16-bit scream once the wave dies — only if any ship was destroyed.
  if (killed > 0) {
    setTimeout(() => audio.playSfx && audio.playSfx("nukeScream"), 380);
  }
}

function spawnEnemy() {
  const lvl = state.level;
  const kindKey = lvl.enemyKinds[Math.floor(Math.random() * lvl.enemyKinds.length)] || "dragon";
  const kind = ENEMY_KINDS[kindKey] || ENEMY_KINDS.dragon;
  const sprite = state.sprites[kind.sprite] || state.sprites.enemyDragon;
  const y = 60 + Math.random() * (H - 120);
  // Enemies scale with player tier: +HP per tier, faster movement, quicker firing, harder bullets.
  const tier = (state.player && state.player.tier) || 1;
  const tierBonus = tier - 1;
  const speed = kind.speedMin + Math.random() * (kind.speedMax - kind.speedMin) + tierBonus * (kind.speedTierBonus != null ? kind.speedTierBonus : 18);
  const fireCd = Math.max(0.25, kind.fireCdMin + Math.random() * (kind.fireCdMax - kind.fireCdMin) - tierBonus * kind.fireCdTierShrink);
  state.enemies.push({
    x: W + 80, y,
    vx: -speed,
    vy: 0,
    baseY: y,
    size: sprite.size,
    img: sprite.img,
    hp: kind.hp + tierBonus * kind.hpPerTier,
    fireCd,
    tier,
    enemyKind: kindKey,
    shotConfig: kind.shotConfig,
    scoreReward: kind.scoreReward
  });
}

function enemyFire(e) {
  const extra = Math.max(0, ((e.tier || 1) - 1));
  const sc = e.shotConfig || ENEMY_KINDS.dragon.shotConfig;
  state.bullets.push({
    x: e.x - e.size * 0.4, y: e.y,
    vx: -(sc.speed + extra * (sc.speedTierBonus || 0)), vy: 0,
    size: sc.size, damage: sc.damage + Math.floor(extra / 5),
    color: sc.color,
    img: null,
    life: sc.life,
    friendly: false
  });
  audio.playSfx("enemyShot");
}

// ---------- Asteroids (Level 2, after Cube Mini-Boss is defeated) ----------

function spawnAsteroid(kindOverride, x, y) {
  const isMedium = kindOverride === "small" ? false : (kindOverride === "medium" ? true : Math.random() < 0.7);
  const kind = isMedium ? "medium" : "small";
  const sprite = isMedium ? state.sprites.asteroidMedium : state.sprites.asteroidSmall;
  const baseSize = sprite ? sprite.size : (isMedium ? 96 : 56);
  const px = (typeof x === "number") ? x : W + 60;
  const py = (typeof y === "number") ? y : 60 + Math.random() * (H - 120);
  state.asteroids.push({
    x: px, y: py,
    vx: -(35 + Math.random() * 50),
    vy: (Math.random() - 0.5) * 40,
    size: baseSize,
    kind,
    hp: isMedium ? ASTEROID_MEDIUM_HP : ASTEROID_SMALL_HP,
    rot: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 1.0,
    img: sprite ? sprite.img : null
  });
}

function destroyAsteroid(a, fromShot) {
  if (a.kind === "medium") {
    // Split into 2-3 small fragments that fly outward.
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 80;
      const child = {
        x: a.x, y: a.y,
        vx: Math.cos(ang) * sp - 40,
        vy: Math.sin(ang) * sp,
        size: (state.sprites.asteroidSmall ? state.sprites.asteroidSmall.size : 56),
        kind: "small",
        hp: ASTEROID_SMALL_HP,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2.0,
        img: state.sprites.asteroidSmall ? state.sprites.asteroidSmall.img : null
      };
      state.asteroids.push(child);
    }
    burst(a.x, a.y, "#c9a777", 16);
    audio.playSfx("enemyDie");
    if (fromShot) state.score += ASTEROID_MEDIUM_SCORE;
  } else {
    // Small explodes in a small shrapnel burst.
    burst(a.x, a.y, "#e0c89a", 22);
    burst(a.x, a.y, "#ffb26b", 12);
    audio.playSfx("enemyDie");
    if (fromShot) state.score += ASTEROID_SMALL_SCORE;
  }
  a.hp = 0;
}

// ---------- Mother Ship (Level 2 final) — homing eye lasers + shockwave ----------

function motherShipEyeOrigins(e) {
  // Eyes are roughly upper-third of the sprite. Offsets are sprite-relative,
  // scaled by sprite size relative to the authored 360px reference.
  const k = e.size / 360;
  return [
    { x: e.x + (-38) * k, y: e.y + (-120) * k },
    { x: e.x + ( 38) * k, y: e.y + (-120) * k }
  ];
}

function motherShipFireBeam(e, origin) {
  const p = state.player;
  const dx = (p.x - origin.x), dy = (p.y - origin.y);
  const ang = Math.atan2(dy, dx);
  state.homingBeams.push({
    x: origin.x, y: origin.y,
    vx: Math.cos(ang) * MOTHERSHIP_LASER_SPEED,
    vy: Math.sin(ang) * MOTHERSHIP_LASER_SPEED,
    speed: MOTHERSHIP_LASER_SPEED,
    turnRate: MOTHERSHIP_LASER_TURN_RATE,
    damage: MOTHERSHIP_LASER_DAMAGE,
    life: MOTHERSHIP_LASER_LIFE,
    radius: MOTHERSHIP_LASER_RADIUS,
    trail: []
  });
  // Brief muzzle flash at the eye.
  burst(origin.x, origin.y, "#bfe4ff", 6);
}

function motherShipFireBurst(e) {
  // Pair of bursts: each eye fires 2 beams MOTHERSHIP_LASER_BURST_GAP apart.
  // Set up a queue that the per-frame update consumes via burstGapT.
  e.motherShipBurstQueue = 2;
  e.motherShipBurstGapT = 0;
  // Fire the first pair immediately.
  const eyes = motherShipEyeOrigins(e);
  for (const eye of eyes) motherShipFireBeam(e, eye);
  e.motherShipBurstQueue -= 1;
  e.motherShipBurstGapT = MOTHERSHIP_LASER_BURST_GAP;
  audio.playSfx("enemyShot");
}

function motherShipFireShockwave(e) {
  state.bossShockwave = {
    cx: e.x, cy: e.y,
    r: 20,
    maxR: MOTHERSHIP_SHOCKWAVE_MAX_R,
    speed: MOTHERSHIP_SHOCKWAVE_SPEED,
    thickness: MOTHERSHIP_SHOCKWAVE_THICKNESS,
    damage: MOTHERSHIP_SHOCKWAVE_DAMAGE,
    hit: false
  };
  audio.playSfx("explosion");
}

function updateHomingBeams(dt) {
  const p = state.player;
  for (const beam of state.homingBeams) {
    // True homing: rotate heading toward player with capped angular velocity.
    const desired = Math.atan2(p.y - beam.y, p.x - beam.x);
    const cur = Math.atan2(beam.vy, beam.vx);
    let delta = desired - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxDelta = beam.turnRate * dt;
    if (delta > maxDelta) delta = maxDelta;
    else if (delta < -maxDelta) delta = -maxDelta;
    const newAng = cur + delta;
    beam.vx = Math.cos(newAng) * beam.speed;
    beam.vy = Math.sin(newAng) * beam.speed;
    beam.x += beam.vx * dt;
    beam.y += beam.vy * dt;
    beam.life -= dt;
    beam.trail.push({ x: beam.x, y: beam.y });
    if (beam.trail.length > 14) beam.trail.shift();
    // Player collision (respects shield + invuln + godmode timer).
    if (p.invuln <= 0) {
      const dx = p.x - beam.x, dy = p.y - beam.y;
      if (dx * dx + dy * dy < (beam.radius + p.size * 0.35) * (beam.radius + p.size * 0.35)) {
        if (p.shieldT > 0) {
          p.energy = Math.max(0, (p.energy || 0) - beam.damage);
          if (p.energy <= 0) p.shieldT = 0;
          p.invuln = 0.4;
          burst(p.x, p.y, "#7fd6ff", 14);
        } else {
          if (!state.godMode && p.godPickupT <= 0) p.hp -= beam.damage;
          p.invuln = 0.8;
          burst(p.x, p.y, "#5fb8ff", 18);
          if (p.hp <= 0) killPlayer(p);
        }
        beam.life = 0;
      }
    }
  }
  state.homingBeams = state.homingBeams.filter(b => b.life > 0 && b.x > -50 && b.x < W + 50 && b.y > -50 && b.y < H + 50);
}

function updateShockwave(dt) {
  const sw = state.bossShockwave;
  if (!sw) return;
  sw.r += sw.speed * dt;
  if (sw.r >= sw.maxR) { state.bossShockwave = null; return; }
  if (!sw.hit) {
    const p = state.player;
    const dx = p.x - sw.cx, dy = p.y - sw.cy;
    const d = Math.hypot(dx, dy);
    if (d >= sw.r - sw.thickness && d <= sw.r + sw.thickness) {
      if (p.invuln <= 0) {
        if (p.shieldT > 0) {
          p.energy = Math.max(0, (p.energy || 0) - sw.damage);
          if (p.energy <= 0) p.shieldT = 0;
          p.invuln = 0.4;
          burst(p.x, p.y, "#7fd6ff", 18);
        } else {
          if (!state.godMode && p.godPickupT <= 0) p.hp -= sw.damage;
          p.invuln = 0.9;
          burst(p.x, p.y, "#ffb26b", 22);
          if (p.hp <= 0) killPlayer(p);
        }
        sw.hit = true;
      }
    }
  }
}

function showToast(text, color) {
  state.toast = { text, color: color || "#9fd1ff", life: 1.8 };
}

function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 180;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color });
  }
}

function spawnPickup(x, y, tier) {
  const p = state.player;
  // Prefer weapon-unlock drops for any still-locked weapons, with health as a common drop.
  const lockedKeys = WEAPON_ORDER.filter(k => p && !p.unlocked[k]);
  const pool = [];
  // Health is always in the pool.
  pool.push({ type: "health", weight: 1.2 });
  if (lockedKeys.length > 0) {
    // Locked weapons drop more often as tier increases.
    const lockWeight = 1.0 + Math.min(1.5, (tier - 1) * 0.25);
    for (const k of lockedKeys) pool.push({ type: "unlock-" + k, weapon: k, weight: lockWeight });
  } else {
    // All weapons unlocked => re-enable boost drops.
    pool.push({ type: "boost", weight: 1.4 });
  }
  // Shields become available once the semi-boss fight has started.
  if (state.semiBossTriggered || state.semiBossDefeated) {
    pool.push({ type: "shield", weight: 0.7 });
  }
  // God Mode — very rare, post-mini-boss only, max 2 grants per level
  // (and never while the permanent MICO god mode or the active timer is on).
  if (!state.godMode && state.bossDefeated && (state.godPickupsThisLevel || 0) < 2 && p.godPickupT <= 0) {
    pool.push({ type: "godmode", weight: GODMODE_PICKUP_WEIGHT });
  }
  let total = 0;
  for (const e of pool) total += e.weight;
  let r = Math.random() * total;
  let chosen = pool[0];
  for (const e of pool) { r -= e.weight; if (r <= 0) { chosen = e; break; } }
  state.pickups.push({
    x, y,
    vx: -60 - Math.random() * 40,
    vy: (Math.random() - 0.5) * 40,
    size: 26,
    type: chosen.type,
    weapon: chosen.weapon || null,
    life: 10,
    bob: Math.random() * Math.PI * 2
  });
}

function spawnShieldPickup(x, y) {
  state.pickups.push({
    x, y,
    vx: -70 - Math.random() * 40,
    vy: (Math.random() - 0.5) * 50,
    size: 30,
    type: "shield",
    weapon: null,
    life: 12,
    bob: Math.random() * Math.PI * 2
  });
}

const UNLOCK_LABEL = {
  large:  { text: "LARGE GUN UNLOCKED", color: "#ffd27a", sprite: "weaponLarge"  },
  laser:  { text: "LASER UNLOCKED",     color: "#ff6bd6", sprite: "weaponLaser"  },
  missle: { text: "NUKE UNLOCKED",      color: "#ffb26b", sprite: "weaponMissle" }
};

function collectPickup(p, pk) {
  if (pk.type === "health") {
    if (p.hp >= p.maxHp) {
      // Health is already full — award a small point bonus instead.
      state.score += 10;
      showToast("+10 (HP FULL)", "#9fd1ff");
      burst(pk.x, pk.y, "#9fd1ff", 14);
    } else {
      const heal = 2 + Math.floor(p.tier);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      showToast(`+${heal} HP`, "#6bd68a");
      burst(pk.x, pk.y, "#6bd68a", 18);
    }
  } else if (pk.type === "boost") {
    p.damageBonus += 1;
    p.cooldownMul *= 0.92;
    p.energyBonus = (p.energyBonus || 0) + 25;
    refreshMaxEnergy(p);
    showToast("WEAPON BOOST  +25 ENERGY", "#ffd27a");
    burst(pk.x, pk.y, "#ffd27a", 18);
  } else if (pk.type === "shield") {
    p.shieldT += SHIELD_DURATION;
    showToast(`SHIELD +${SHIELD_DURATION}s (${Math.ceil(p.shieldT)}s)`, "#7fd6ff");
    burst(pk.x, pk.y, "#7fd6ff", 24);
    audio.playSfx && audio.playSfx("laser");
  } else if (pk.type === "godmode") {
    p.godPickupT = GODMODE_PICKUP_DURATION;
    state.godPickupsThisLevel = (state.godPickupsThisLevel || 0) + 1;
    resolvePlayerSprite(p);
    showToast(`GOD MODE — ${GODMODE_PICKUP_DURATION | 0}s`, "#ffd84a");
    burst(pk.x, pk.y, "#ffd84a", 36);
    audio.playSfx && audio.playSfx("explosion");
  } else if (pk.type && pk.type.startsWith("unlock-")) {
    const key = pk.weapon;
    if (key === "missle") {
      // Nukes are an ammo-based stockpile (max 3). First pickup also flags it as unlocked.
      const before = p.nukeAmmo || 0;
      if (before >= NUKE_MAX) {
        state.score += 10;
        showToast("+10 (NUKES FULL)", "#9fd1ff");
        burst(pk.x, pk.y, "#9fd1ff", 14);
      } else {
        p.unlocked.missle = true;
        p.nukeAmmo = before + 1;
        const info = UNLOCK_LABEL[key] || { text: "NUKE +1", color: "#ffb26b" };
        showToast(`NUKE +1  (${p.nukeAmmo}/${NUKE_MAX})`, info.color);
        burst(pk.x, pk.y, info.color, 24);
      }
    } else if (key && !p.unlocked[key]) {
      p.unlocked[key] = true;
      p.weapon = key; // Auto-equip the newly unlocked weapon.
      const info = UNLOCK_LABEL[key] || { text: key.toUpperCase() + " UNLOCKED", color: "#fff" };
      showToast(info.text, info.color);
      burst(pk.x, pk.y, info.color, 24);
    } else {
      // Same weapon type already unlocked — award a small point bonus.
      state.score += 10;
      showToast("+10 (DUPLICATE)", "#9fd1ff");
      burst(pk.x, pk.y, "#9fd1ff", 14);
    }
  }
}

function update(dt) {
  state.t += dt;
  state.lastDt = dt;

  // Music crossfade ramps regardless of phase / pause so transitions feel smooth.
  if (audio && audio.tickMusic) audio.tickMusic(dt);

  for (const s of state.stars) {
    s.x -= s.z * 60 * dt;
    if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
  }

  if (state.phase === "title") {
    // Advance the title timer only once music has actually started playing.
    // If audio is unavailable (missing file), still advance so the game isn't stuck.
    if (audio.started || !audio.available) state.titleElapsed += dt;
    // Let the player skip with Enter or Space once music has started.
    if ((keys.has("enter") || keys.has(" ")) && (audio.started || !audio.available)) {
      state.phase = "play";
    }
    if (state.titleElapsed >= TITLE_DURATION) state.phase = "play";
    return;
  }

  if (state.gameOver) {
    // Tick down the post-victory hold so screens & music can settle.
    if (state.outroDelay > 0) state.outroDelay = Math.max(0, state.outroDelay - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    if (keys.has("r") && (!state.entry || state.entry.submitted)) reset();
    // Mid-progression CONTINUE: outro screen of an intermediate level — Enter/Space jumps to next level
    // (only after the post-victory hold elapses).
    if (state.outro && state.continueAvailable && state.outroDelay <= 0 && (keys.has("enter") || keys.has(" "))) {
      advanceLevel();
    }
    return;
  }

  const p = state.player;

  // Screen-shake decay (nuke etc.) — runs during active play. Decay rate ensures
  // the shake never lasts more than ~3 seconds even if re-triggered.
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
  const ax = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
  const ay = (keys.has("arrowdown")  || keys.has("s") ? 1 : 0) - (keys.has("arrowup")   || keys.has("w") ? 1 : 0);
  const len = Math.hypot(ax, ay) || 1;
  p.x += (ax / len) * p.speed * dt;
  p.y += (ay / len) * p.speed * dt;
  p.x = Math.max(p.size / 2, Math.min(W - p.size / 2, p.x));
  p.y = Math.max(p.size / 2, Math.min(H - p.size / 2, p.y));

  for (let i = 0; i < WEAPON_ORDER.length; i++) {
    if (keys.has(String(i + 1))) {
      const key = WEAPON_ORDER[i];
      // Slot 4 (nuke) is handled in fireWeapon as an edge-triggered ammo action;
      // never set it as the primary weapon.
      if (key === "missle") continue;
      if (p.unlocked[key]) {
        p.weapon = key;
      } else {
        // Prevent spamming the toast on key repeat.
        if (!state._lockedToastKey || state._lockedToastKey !== key || (state.toast == null)) {
          showToast(`${WEAPONS[key].label.toUpperCase()} LOCKED`, "#ff6b6b");
          state._lockedToastKey = key;
        }
      }
    }
  }

  fireWeapon(p, dt);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.shieldT > 0) p.shieldT -= dt;
  // God-mode pickup countdown (separate from the permanent MICO cheat).
  if (p.godPickupT > 0) {
    p.godPickupT = Math.max(0, p.godPickupT - dt);
    if (p.godPickupT === 0) resolvePlayerSprite(p);
  }

  // Trigger the mini-boss once the threshold is crossed (delta from level start).
  const lvlScore = state.score - state.levelStartScore;
  if (!state.bossTriggered && !state.bossDefeated && lvlScore >= state.level.bossScore) {
    spawnBoss();
  }
  // Trigger the semi-final boss once the threshold is crossed (and no other boss is active).
  if (!state.semiBossTriggered && !state.semiBossDefeated && !state.boss && lvlScore >= state.level.semiBossScore) {
    spawnSemiBoss();
  }
  // Trigger the FINAL boss at the per-level threshold OR player tier crossing the level's tier trigger.
  if (!state.finalBossTriggered && !state.finalBossDefeated && !state.boss &&
      (lvlScore >= state.level.finalBossScore || state.player.tier >= state.level.finalBossLevelTier)) {
    spawnFinalBoss();
  }

  // Suspend regular spawns while the boss is alive.
  if (!state.boss) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(0.45, 1.6 - state.t * 0.015);
    }
  }

  // Asteroids (L2): start spawning after the Cube Mini-Boss is defeated.
  if (state.level && state.level.asteroidsAfterMiniBoss && state.bossDefeated && !state.outro) {
    state.asteroidSpawnTimer -= dt;
    if (state.asteroidSpawnTimer <= 0) {
      spawnAsteroid();
      state.asteroidSpawnTimer = ASTEROID_SPAWN_INTERVAL_MIN +
        Math.random() * (ASTEROID_SPAWN_INTERVAL_MAX - ASTEROID_SPAWN_INTERVAL_MIN);
    }
  }
  // Move + tumble asteroids; despawn off the left edge.
  for (const a of state.asteroids) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.spin * dt;
  }

  for (const e of state.enemies) {
    if (e.isBoss) {
      e.t += dt;
      const semi = e.kind === "semi";
      const finalB = e.kind === "final";
      const isMs = finalB && e.isMotherShip;
      // Slide in from the right, then hover and track player Y.
      if (e.entering) {
        e.x += e.vx * dt;
        const stopX = isMs ? e.motherShipAnchorX : (W - e.size * 0.55);
        if (e.x <= stopX) { e.x = stopX; e.entering = false; e.vx = 0; }
      } else if (isMs) {
        // Mother Ship: stationary anchor with subtle idle bob; no chasing/lunge.
        e.x = e.motherShipAnchorX;
        e.y = e.motherShipAnchorY + Math.sin(e.t * 0.9) * 18;
      } else {
        const trackSpeed = finalB ? 320 : semi ? 220 : 140;
        const dy = state.player.y - e.y;
        e.vy = Math.max(-trackSpeed, Math.min(trackSpeed, dy * (finalB ? 3.4 : semi ? 2.8 : 2.2)));
        // Add sinusoidal lunge toward and away from the player.
        const lunge = Math.sin(e.t * (finalB ? 2.2 : semi ? 1.8 : 1.3)) * (finalB ? 120 : semi ? 90 : 60);
        e.x += (W - e.size * 0.55 - lunge - e.x) * Math.min(1, dt * (finalB ? 3.8 : semi ? 3.2 : 2.5));
        e.y += e.vy * dt;
        e.y = Math.max(e.size / 2, Math.min(H - e.size / 2, e.y));
      }
      if (isMs) {
        // Homing eye-laser bursts (4 beams: 2 per eye, gap-spaced).
        e.motherShipBurstT -= dt;
        if (e.motherShipBurstT <= 0 && !e.entering) {
          motherShipFireBurst(e);
          e.motherShipBurstT = MOTHERSHIP_LASER_INTERVAL;
        }
        if (e.motherShipBurstQueue > 0) {
          e.motherShipBurstGapT -= dt;
          if (e.motherShipBurstGapT <= 0) {
            const eyes = motherShipEyeOrigins(e);
            for (const eye of eyes) motherShipFireBeam(e, eye);
            e.motherShipBurstQueue -= 1;
            e.motherShipBurstGapT = MOTHERSHIP_LASER_BURST_GAP;
          }
        }
        // Shockwave ring on its own cadence.
        e.motherShipShockT -= dt;
        if (e.motherShipShockT <= 0 && !e.entering && !state.bossShockwave) {
          motherShipFireShockwave(e);
          e.motherShipShockT = MOTHERSHIP_SHOCKWAVE_INTERVAL;
        }
      } else {
        e.fireCd -= dt;
        e.burstCd -= dt;
        if (!e.entering && e.fireCd <= 0) {
          if (finalB) finalBossFire(e);
          else if (semi) semiBossFire(e);
          else bossFire(e);
          // Fire rate intensifies as HP drops.
          const rage = 1 - Math.max(0, e.hp) / e.maxHp;
          e.fireCd = finalB ? Math.max(0.12, 0.5 - rage * 0.4)
                   : semi   ? Math.max(0.18, 0.7 - rage * 0.5)
                            : Math.max(0.25, 0.9 - rage * 0.6);
        }
        if (!e.entering && e.burstCd <= 0) {
          if (finalB) finalBossBurst(e);
          else if (semi) semiBossBurst(e);
          else bossBurst(e);
          e.burstCd = finalB ? (1.6 - (1 - e.hp / e.maxHp) * 1.0)
                    : semi   ? (2.4 - (1 - e.hp / e.maxHp) * 1.2)
                             : (3.4 - (1 - e.hp / e.maxHp) * 1.4);
        }
        // Dimensional Horror combo: layer Mother Ship homing beams + shockwaves
        // on top of Harbinger's chase + spread + ring patterns.
        if (e.dimensionalCombo) {
          e.motherShipBurstT -= dt;
          if (e.motherShipBurstT <= 0 && !e.entering) {
            motherShipFireBurst(e);
            e.motherShipBurstT = MOTHERSHIP_LASER_INTERVAL * 1.4;
          }
          if (e.motherShipBurstQueue > 0) {
            e.motherShipBurstGapT -= dt;
            if (e.motherShipBurstGapT <= 0) {
              const eyes = motherShipEyeOrigins(e);
              for (const eye of eyes) motherShipFireBeam(e, eye);
              e.motherShipBurstQueue -= 1;
              e.motherShipBurstGapT = MOTHERSHIP_LASER_BURST_GAP;
            }
          }
          e.motherShipShockT -= dt;
          if (e.motherShipShockT <= 0 && !e.entering && !state.bossShockwave) {
            motherShipFireShockwave(e);
            e.motherShipShockT = MOTHERSHIP_SHOCKWAVE_INTERVAL * 1.1;
          }
        }
      }
    } else {
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(state.t * 2 + e.baseY) * 24;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.x < W - 20) { enemyFire(e); e.fireCd = 1.0 + Math.random() * 1.4; }
    }
  }
  state.enemies = state.enemies.filter(e => e.hp > 0 && (e.isBoss || e.x > -100));

  for (const b of state.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
  }

  // Collisions
  for (const b of state.bullets) {
    if (b.friendly) {
      for (const e of state.enemies) {
        if (Math.abs(b.x - e.x) < e.size * 0.45 && Math.abs(b.y - e.y) < e.size * 0.45) {
          e.hp -= b.damage; b.life = 0;
          burst(b.x, b.y, b.color, 6);
          // Final Boss sheds a shield pickup every 5000–10000 HP lost.
          if (e.kind === "final" && e.hp > 0 && e.nextShieldHp !== undefined && e.hp <= e.nextShieldHp) {
            spawnShieldPickup(e.x, e.y);
            e.nextShieldHp -= FINAL_BOSS_SHIELD_MIN + Math.random() * (FINAL_BOSS_SHIELD_MAX - FINAL_BOSS_SHIELD_MIN);
          }
          if (e.hp <= 0) {
            if (e.isBoss) {
              killBoss(e);
            } else {
              burst(e.x, e.y, "#ffb26b", 24);
              audio.playSfx("enemyDie");
              state.score += (e.scoreReward || 100);
              state.kills = (state.kills || 0) + 1;
              const dropChance = 0.15 + Math.min(0.25, (state.player.tier - 1) * 0.04);
              if (Math.random() < dropChance) spawnPickup(e.x, e.y, state.player.tier);
            }
            while (state.score >= state.player.nextUpgrade) levelUp(state.player);
          }
        }
      }
    } else if (p.invuln <= 0) {
      if (Math.abs(b.x - p.x) < p.size * 0.4 && Math.abs(b.y - p.y) < p.size * 0.4) {
        if (p.shieldT > 0) {
          // Shield absorbs the hit but drains energy equal to the damage.
          p.energy = Math.max(0, (p.energy || 0) - b.damage);
          if (p.energy <= 0) p.shieldT = 0;
          b.life = 0; p.invuln = 0.2;
          burst(p.x, p.y, "#7fd6ff", 14);
        } else {
          if (!state.godMode && p.godPickupT <= 0) p.hp -= b.damage;
          b.life = 0; p.invuln = 0.8;
          burst(p.x, p.y, "#ff5a5a", 16);
          if (p.hp <= 0) killPlayer(p);
        }
      }
    }
  }
  // Enemy ramming
  if (p.invuln <= 0) {
    for (const e of state.enemies) {
      if (Math.abs(e.x - p.x) < (e.size + p.size) * 0.4 && Math.abs(e.y - p.y) < (e.size + p.size) * 0.4) {
        const dmg = e.isBoss ? (e.kind === "final" ? 10 : e.kind === "semi" ? 7 : 5) : 3;
        if (p.shieldT > 0) {
          p.energy = Math.max(0, (p.energy || 0) - dmg);
          if (p.energy <= 0) p.shieldT = 0;
          p.invuln = 0.5;
          if (!e.isBoss) { e.hp = 0; audio.playSfx("enemyDie"); state.kills = (state.kills || 0) + 1; }
          burst((e.x + p.x) / 2, (e.y + p.y) / 2, "#7fd6ff", 24);
        } else {
          if (!state.godMode && p.godPickupT <= 0) p.hp -= dmg;
          p.invuln = 1.0;
          if (!e.isBoss) { e.hp = 0; audio.playSfx("enemyDie"); state.kills = (state.kills || 0) + 1; }
          burst((e.x + p.x) / 2, (e.y + p.y) / 2, "#ffb26b", 28);
          if (p.hp <= 0) killPlayer(p);
        }
      }
    }
  }

  state.bullets = state.bullets.filter(b => b.life > 0 && b.x > -40 && b.x < W + 40);

  // Asteroids vs friendly bullets (medium splits → smalls; small explodes).
  for (const b of state.bullets) {
    if (!b.friendly) continue;
    for (const a of state.asteroids) {
      if (a.hp <= 0) continue;
      const r = (a.kind === "medium" ? ASTEROID_MEDIUM_RADIUS : ASTEROID_SMALL_RADIUS) + b.size * 0.3;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy < r * r) {
        a.hp -= b.damage;
        b.life = 0;
        burst(b.x, b.y, "#d8b87a", 6);
        if (a.hp <= 0) destroyAsteroid(a, true);
        break;
      }
    }
  }
  // Asteroids vs player hull (asteroid is consumed; player takes contact damage).
  if (p.invuln <= 0) {
    for (const a of state.asteroids) {
      if (a.hp <= 0) continue;
      const r = (a.kind === "medium" ? ASTEROID_MEDIUM_RADIUS : ASTEROID_SMALL_RADIUS) + p.size * 0.4;
      const dx = a.x - p.x, dy = a.y - p.y;
      if (dx * dx + dy * dy < r * r) {
        if (p.shieldT > 0) {
          p.energy = Math.max(0, (p.energy || 0) - ASTEROID_CONTACT_DAMAGE);
          if (p.energy <= 0) p.shieldT = 0;
          p.invuln = 0.5;
          burst((a.x + p.x) / 2, (a.y + p.y) / 2, "#7fd6ff", 22);
        } else {
          if (!state.godMode && p.godPickupT <= 0) p.hp -= ASTEROID_CONTACT_DAMAGE;
          p.invuln = 0.9;
          burst((a.x + p.x) / 2, (a.y + p.y) / 2, "#ffb26b", 24);
          if (p.hp <= 0) killPlayer(p);
        }
        destroyAsteroid(a, false);
      }
    }
  }
  state.asteroids = state.asteroids.filter(a => a.hp > 0 && a.x > -120 && a.x < W + 200);

  // Mother Ship homing beams + shockwave.
  updateHomingBeams(dt);
  updateShockwave(dt);

  for (const pt of state.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.92; pt.vy *= 0.92;
    pt.life -= dt;
  }
  state.particles = state.particles.filter(pt => pt.life > 0);

  // Pickups drift, collect on overlap, expire over time.
  for (const pk of state.pickups) {
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt + Math.sin(state.t * 3 + pk.bob) * 0.3;
    pk.life -= dt;
    if (Math.abs(pk.x - p.x) < (pk.size + p.size) * 0.45 &&
        Math.abs(pk.y - p.y) < (pk.size + p.size) * 0.45) {
      collectPickup(p, pk);
      pk.life = 0;
    }
  }
  state.pickups = state.pickups.filter(pk => pk.life > 0 && pk.x > -40);

  if (state.upgradeBanner > 0) state.upgradeBanner -= dt;
  if (state.cheatBanner > 0) state.cheatBanner -= dt;
  if (state.toast) { state.toast.life -= dt; if (state.toast.life <= 0) state.toast = null; }
}

// ---------- Render ----------

function drawSprite(img, x, y, size, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawProjectile(kind, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "small") {
    // Tiny yellow dot.
    const r = Math.max(2.5, size * 0.22);
    ctx.shadowColor = "#ffe066"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#fff3a0";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd400";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "large") {
    // Orange orb with softer outer glow.
    const r = size * 0.42;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, "#fff3c2");
    g.addColorStop(0.35, "#ffb347");
    g.addColorStop(1, "#c44a00");
    ctx.shadowColor = "#ff8a1f"; ctx.shadowBlur = 14;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "laser") {
    // Horizontal glowing blue line.
    const len = size * 1.6, th = Math.max(2, size * 0.14);
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#bfe4ff";
    ctx.fillRect(-len / 2, -th / 2, len, th);
    ctx.fillStyle = "#2aa4ff";
    ctx.fillRect(-len / 2, -th * 0.25, len, th * 0.5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-len / 2, -th * 0.1, len, th * 0.2);
  } else if (kind === "missle") {
    // Missile-shaped sprite in grey with red nose and fins.
    const L = size * 1.4, H2 = size * 0.45;
    // Body (grey)
    ctx.fillStyle = "#8a8f96";
    ctx.fillRect(-L * 0.4, -H2 / 2, L * 0.75, H2);
    // Body highlight
    ctx.fillStyle = "#c2c7cc";
    ctx.fillRect(-L * 0.4, -H2 / 2, L * 0.75, H2 * 0.25);
    // Red nose cone (pointing right — travel direction)
    ctx.fillStyle = "#d0302a";
    ctx.beginPath();
    ctx.moveTo(L * 0.35, -H2 / 2);
    ctx.lineTo(L * 0.6, 0);
    ctx.lineTo(L * 0.35, H2 / 2);
    ctx.closePath(); ctx.fill();
    // Red tail fins
    ctx.fillStyle = "#b02822";
    ctx.beginPath();
    ctx.moveTo(-L * 0.4, -H2 / 2);
    ctx.lineTo(-L * 0.55, -H2);
    ctx.lineTo(-L * 0.25, -H2 / 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-L * 0.4, H2 / 2);
    ctx.lineTo(-L * 0.55, H2);
    ctx.lineTo(-L * 0.25, H2 / 2);
    ctx.closePath(); ctx.fill();
    // Exhaust flicker
    ctx.shadowColor = "#ffb347"; ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffd27a";
    const flick = 0.6 + Math.random() * 0.5;
    ctx.beginPath();
    ctx.moveTo(-L * 0.4, -H2 * 0.35);
    ctx.lineTo(-L * (0.55 + 0.1 * flick), 0);
    ctx.lineTo(-L * 0.4, H2 * 0.35);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = "#fff";
    ctx.fillRect(-size / 2, -2, size, 4);
  }
  ctx.restore();
}

function renderTitle() {
  const t = state.t;
  // Dim vignette behind the title.
  const vg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, "#0b1a3acc");
  vg.addColorStop(1, "#00000000");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // Player ship drifts slowly across as flavor.
  if (state.sprites && state.sprites.player) {
    const s = state.sprites.player;
    const sx = ((t * 40) % (W + 200)) - 100;
    const sy = H * 0.75 + Math.sin(t * 0.8) * 18;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(s.img, sx - s.size / 2, sy - s.size / 2, s.size, s.size);
    ctx.restore();
  }

  // Title — banner sprite if available, otherwise the original neon-glow text.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tx = W / 2, ty = H * 0.42;
  const bob = Math.sin(t * 1.6) * 3;

  const banner = state.sprites && state.sprites.titleBanner;
  if (banner && banner.img) {
    // 2× the natural-fit size for a much bolder presence on the title screen.
    const fitW = W * 0.7;
    const fitH = H * 0.45;
    const baseScale = Math.min(fitW / banner.img.width, fitH / banner.img.height);
    const scale = baseScale * 2;
    const bw = banner.img.width * scale;
    const bh = banner.img.height * scale;
    ctx.save();
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 36;
    ctx.drawImage(banner.img, (W - bw) / 2, H * -0.06 + bob, bw, bh);
    ctx.restore();
  } else {
    ctx.save();
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 40;
    ctx.fillStyle = "#9fd1ff";
    ctx.font = "bold 92px system-ui";
    ctx.fillText("Artificial Savior", tx, ty + bob);
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Artificial Savior", tx, ty + bob);
    ctx.restore();
  }

  // Credit line.
  ctx.save();
  ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 12;
  ctx.fillStyle = "#cfe3ff";
  ctx.font = "italic 22px system-ui";
  ctx.fillText("Created by Bruce Beerman", tx, ty + bob + 64);
  ctx.restore();

  // Subtitle underline.
  ctx.strokeStyle = "#5fb8ff88"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tx - 260, ty + 94); ctx.lineTo(tx + 260, ty + 94); ctx.stroke();

  // Tagline.
  ctx.fillStyle = "#cfd6ee"; ctx.font = "18px system-ui";
  ctx.fillText("A space shooter", tx, ty + 86);

  // Prompt / countdown.
  ctx.font = "16px system-ui";
  if (!audio.available) {
    const remaining = Math.max(0, TITLE_DURATION - state.titleElapsed);
    ctx.fillStyle = "#ff8a8a";
    ctx.fillText(`(${audio.activeTrackPath || "audio/Artificial Savior.mp3"} missing — starting in ${Math.ceil(remaining)}s)`, tx, H - 80);
  } else if (!audio.started) {
    const pulse = 0.6 + Math.abs(Math.sin(t * 3)) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ffd27a";
    ctx.fillText("Press any key to begin", tx, H - 80);
    ctx.globalAlpha = 1;
  } else {
    const remaining = Math.max(0, TITLE_DURATION - state.titleElapsed);
    ctx.fillStyle = "#9fd1ff";
    ctx.fillText(`Launching in ${Math.ceil(remaining)}s  —  press Enter to skip`, tx, H - 80);
  }

  // Controls reminder.
  ctx.fillStyle = "#8d95ad"; ctx.font = "13px system-ui";
  ctx.fillText("WASD / Arrows to move   ·   Space to fire   ·   1-4 weapons   ·   P pause   ·   X mute", tx, H - 46);

  // Brief cheat confirmation flash (never reveals the code list).
  if (state.cheatBanner > 0 && state.activeCheat) {
    const a = Math.min(1, state.cheatBanner / 0.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffd27a"; ctx.font = "bold 18px system-ui";
    ctx.fillText(`◆ ${state.activeCheat} ARMED ◆`, tx, H - 110);
    ctx.globalAlpha = 1;
  } else if (state.activeCheat) {
    // Tiny corner indicator once armed, non-revealing.
    ctx.fillStyle = "#ffd27a88"; ctx.font = "11px system-ui"; ctx.textAlign = "right";
    ctx.fillText(`◆ ${state.activeCheat}`, W - 12, H - 12);
    ctx.textAlign = "center";
  }

  // High-score panel on the right.
  if (state.hiscores && state.hiscores.length > 0) {
    const panelW = 230, panelH = 210;
    const px = W - panelW - 24, py = (H - panelH) / 2;
    ctx.fillStyle = "#0b1224cc"; ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = "#ffffff22"; ctx.strokeRect(px, py, panelW, panelH);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#9fd1ff"; ctx.font = "bold 16px system-ui";
    ctx.fillText("HIGH SCORES", px + panelW / 2, py + 24);
    ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    const rows = state.hiscores.slice(0, HISCORE_MAX);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ry = py + 48 + i * 16;
      ctx.fillStyle = i === 0 ? "#ffd27a" : "#cfd6ee";
      ctx.fillText(`${String(i + 1).padStart(2, " ")}. ${r.initials}`, px + 20, ry);
      ctx.textAlign = "right";
      ctx.fillText(String(r.score), px + panelW - 20, ry);
      ctx.textAlign = "left";
    }
  }

  ctx.textBaseline = "alphabetic";
}

function renderBackground() {
  // Base black.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // Sample music energy (bass/mid/treble/level). Falls back to zeros before music starts.
  const e = audio.getEnergy ? audio.getEnergy() : { bass: 0, mid: 0, treble: 0, level: 0 };
  const t = state.t;

  // L2 swaps the cosmic nebula for an electrical-storm backdrop.
  if (state.level && state.level.id === 2) {
    renderStormBackground(e, t);
    return;
  }
  // L3 — Dimensional City: painted backdrop + animated rifts/sparkles overlay.
  if (state.level && state.level.id === 3) {
    renderDimensionalBackground(e, t);
    return;
  }

  // Base hue drifts slowly; bass pushes it warmer, treble nudges it cooler.
  const baseHue = (220 + t * 6 + e.bass * 60 - e.treble * 30) % 360;

  // Two morphing nebula lobes — positions drift sinusoidally, radii pulse with bass/mid.
  const lobes = [
    {
      x: W * (0.3 + Math.sin(t * 0.17) * 0.08),
      y: H * (0.45 + Math.cos(t * 0.21) * 0.12),
      r: W * (0.45 + e.bass * 0.35),
      hue: baseHue,
      a: 0.22 + e.bass * 0.30
    },
    {
      x: W * (0.72 + Math.cos(t * 0.13) * 0.09),
      y: H * (0.55 + Math.sin(t * 0.19) * 0.10),
      r: W * (0.40 + e.mid * 0.35),
      hue: (baseHue + 90) % 360,
      a: 0.18 + e.mid * 0.28
    }
  ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const lo of lobes) {
    const g = ctx.createRadialGradient(lo.x, lo.y, 20, lo.x, lo.y, lo.r);
    g.addColorStop(0, `hsla(${lo.hue}, 90%, 60%, ${lo.a})`);
    g.addColorStop(0.5, `hsla(${lo.hue}, 80%, 40%, ${lo.a * 0.55})`);
    g.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Horizon accent band that brightens with overall level.
  const band = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.85);
  band.addColorStop(0, "hsla(0,0%,0%,0)");
  band.addColorStop(0.5, `hsla(${(baseHue + 40) % 360}, 85%, ${30 + e.level * 35}%, ${0.10 + e.level * 0.35})`);
  band.addColorStop(1, "hsla(0,0%,0%,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Treble-driven sparkles in the far-field stars.
  const sparkle = e.treble;
  for (const s of state.stars) {
    const bright = 0.3 + s.z * 0.3 + sparkle * s.z * 0.6;
    const size = s.z * (1 + sparkle * 0.6);
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, bright)})`;
    ctx.fillRect(s.x, s.y, size, size);
  }

  // Low-frequency pulse halo around the action.
  if (e.bass > 0.15) {
    const r0 = Math.max(W, H) * 0.25;
    const pg = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, Math.max(W, H) * 0.75);
    pg.addColorStop(0, `hsla(${baseHue}, 85%, 60%, ${e.bass * 0.08})`);
    pg.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, W, H);
  }
}

// Mirror-tiled scrolling cover-fit background. Scrolls leftward at speedPxSec
// to mimic the ship flying past static scenery; mirrors every other tile so the
// loop seam is invisible even when the source PNG isn't tileable.
function drawScrollingBg(img, t, speedPxSec) {
  const iw = img.width, ih = img.height;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale, dh = ih * scale;
  const dy = (H - dh) / 2;
  const period = dw * 2;
  const t01 = ((t * speedPxSec) % period + period) % period; // [0, period)
  const baseX = -t01;
  for (let i = 0; i < 3; i++) {
    const x = baseX + i * dw;
    if (x >= W || x + dw <= 0) continue;
    const flip = (i % 2) === 1;
    if (flip) {
      ctx.save();
      ctx.translate(x + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, dy, dw, dh);
    }
  }
}

// L2 electrical-storm backdrop. Heavy purple/teal cloud gradient + drifting
// lightning bolts that flash the screen, plus rain streaks and a faint glow.
function renderStormBackground(e, t) {
  // If the painted LV2 backdrop is loaded, use it as the base layer in place
  // of the procedural sky gradient. The cloud-lobe glow + rain + lightning
  // continue to animate over it for live storm activity.
  const bg = state.sprites && state.sprites.lv2Bg;
  if (bg && bg.img) {
    drawScrollingBg(bg.img, t, 28);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,    "#0a0816");
    sky.addColorStop(0.45, "#1c1338");
    sky.addColorStop(0.75, "#241844");
    sky.addColorStop(1,    "#080612");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  // Drifting cloud lobes — translucent plum + teal blobs that morph slowly.
  // Slightly dimmer when layered on the painted backdrop so they enhance,
  // not drown out, the underlying art.
  const lobeBoost = (bg && bg.img) ? 0.55 : 1.0;
  const baseHue = (260 + Math.sin(t * 0.07) * 20) % 360;
  const lobes = [
    { x: W * (0.25 + Math.sin(t * 0.11) * 0.06), y: H * 0.30, r: W * 0.45, hue: baseHue,             a: (0.18 + e.bass  * 0.18) * lobeBoost },
    { x: W * (0.70 + Math.cos(t * 0.09) * 0.07), y: H * 0.55, r: W * 0.50, hue: (baseHue + 40) % 360, a: (0.14 + e.mid   * 0.18) * lobeBoost },
    { x: W * (0.50 + Math.sin(t * 0.05) * 0.05), y: H * 0.80, r: W * 0.55, hue: (baseHue + 80) % 360, a: (0.12 + e.level * 0.15) * lobeBoost }
  ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const lo of lobes) {
    const g = ctx.createRadialGradient(lo.x, lo.y, 20, lo.x, lo.y, lo.r);
    g.addColorStop(0,   `hsla(${lo.hue}, 65%, 30%, ${lo.a})`);
    g.addColorStop(0.6, `hsla(${lo.hue}, 55%, 18%, ${lo.a * 0.5})`);
    g.addColorStop(1,   "hsla(0,0%,0%,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  // Rain streaks — diagonal lines moving downward.
  ctx.save();
  ctx.strokeStyle = "rgba(180, 200, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 80; i++) {
    const phase = (i * 137.508 + t * 480) % (H + 80);
    const x = ((i * 71.3) % W);
    const y = phase - 80;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + 18);
  }
  ctx.stroke();
  ctx.restore();

  // Lightning scheduling. Random bolts every 0.4-2.4s, more often on bass spikes.
  const dt = state.lastDt || 0;
  state.lightningCd = (state.lightningCd || 0) - dt - e.bass * dt * 1.5;
  if (state.lightningCd <= 0) {
    state.lightningCd = 0.4 + Math.random() * 2.0;
    state.lightning = makeLightningBolt();
  }
  if (state.lightning) {
    const b = state.lightning;
    b.life -= dt;
    if (b.life <= 0) {
      state.lightning = null;
    } else {
      const fadeT = Math.max(0, b.life / b.dur);
      // Full-screen flash on the early frames.
      if (fadeT > 0.55) {
        ctx.fillStyle = `rgba(190, 215, 255, ${0.35 * (fadeT - 0.55) / 0.45})`;
        ctx.fillRect(0, 0, W, H);
      }
      // Bolt itself — bright core + soft glow.
      ctx.save();
      ctx.shadowColor = "rgba(180, 210, 255, 0.9)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(220, 235, 255, ${0.6 + 0.4 * fadeT})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.stroke();
      // Inner white-hot core.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 + 0.3 * fadeT})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Forks.
      for (const f of b.forks) {
        ctx.beginPath();
        ctx.moveTo(f[0].x, f[0].y);
        for (let i = 1; i < f.length; i++) ctx.lineTo(f[i].x, f[i].y);
        ctx.strokeStyle = `rgba(200, 220, 255, ${0.5 * fadeT})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Subtle horizon glow on bass.
  if (e.bass > 0.1) {
    const pg = ctx.createRadialGradient(W / 2, H * 0.85, 40, W / 2, H * 0.85, W * 0.7);
    pg.addColorStop(0, `rgba(180, 140, 255, ${e.bass * 0.18})`);
    pg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, W, H);
  }
}

function renderDimensionalBackground(e, t) {
  // Painted "Dimensional City" backdrop as the base layer (cover-fit). Falls back
  // to a deep-violet gradient if the optional PNG isn't loaded.
  const bg = state.sprites && state.sprites.dimensionalCity;
  if (bg && bg.img) {
    drawScrollingBg(bg.img, t, 42);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0a0418");
    sky.addColorStop(0.55, "#1a0838");
    sky.addColorStop(1, "#04020c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  // Drifting dimensional rifts — vertical violet/teal slits that pulse with the bass.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const rifts = 4;
  for (let i = 0; i < rifts; i++) {
    const phase = i * 0.41 + t * (0.08 + i * 0.03);
    const cx = (W * 0.18) + ((Math.sin(phase) * 0.5 + 0.5) * W * 0.7);
    const cy = H * (0.28 + 0.4 * (i / rifts)) + Math.cos(phase * 1.3) * 30;
    const h = H * (0.55 + 0.18 * Math.sin(t * 0.6 + i));
    const w = 26 + e.bass * 32 + 8 * Math.sin(t * 2.1 + i);
    const hue = (280 + i * 22 + e.mid * 30) % 360;
    const a = 0.18 + e.bass * 0.30 + 0.10 * Math.sin(t * 1.5 + i);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, "hsla(0,0%,0%,0)");
    g.addColorStop(0.5, `hsla(${hue}, 90%, 65%, ${a})`);
    g.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  }
  ctx.restore();

  // Treble-driven sparkle motes — interdimensional dust drifting leftward.
  const sparkle = e.treble;
  for (const s of state.stars) {
    const sx = s.x;
    const sy = (s.y + (1 - s.z) * 12 * Math.sin(t * 1.4 + s.y * 0.03)) % H;
    const bright = 0.20 + s.z * 0.45 + sparkle * s.z * 0.7;
    const size = s.z * (1 + sparkle * 0.8);
    const hue = 280 + (s.y % 60);
    ctx.fillStyle = `hsla(${hue}, 80%, 75%, ${Math.min(1, bright)})`;
    ctx.fillRect(sx, sy, size, size);
  }

  // Bass-driven horizon flare from below (city glow pulse).
  if (e.bass > 0.10) {
    const pg = ctx.createRadialGradient(W / 2, H * 0.92, 30, W / 2, H * 0.92, W * 0.75);
    pg.addColorStop(0, `rgba(200, 140, 255, ${0.05 + e.bass * 0.22})`);
    pg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, W, H);
  }

  // Subtle vignette for legibility against bright signage in the painted city.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function makeLightningBolt() {
  // Jagged top-to-bottom polyline with a few side forks.
  const startX = 50 + Math.random() * (W - 100);
  const pts = [{ x: startX, y: -10 }];
  let x = startX, y = 0;
  while (y < H) {
    y += 18 + Math.random() * 26;
    x += (Math.random() - 0.5) * 70;
    pts.push({ x, y });
  }
  const forks = [];
  const forkCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < forkCount; i++) {
    const start = pts[2 + Math.floor(Math.random() * Math.max(1, pts.length - 4))];
    if (!start) continue;
    const f = [{ x: start.x, y: start.y }];
    let fx = start.x, fy = start.y;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const len = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < len; j++) {
      fx += dir * (16 + Math.random() * 22);
      fy += 8 + Math.random() * 18;
      f.push({ x: fx, y: fy });
    }
    forks.push(f);
  }
  const dur = 0.18 + Math.random() * 0.14;
  return { pts, forks, dur, life: dur };
}

function render() {
  // Reset to the world transform (logical 960×540) before drawing each frame.
  // resizeCanvasBacking() updates renderScale on resize/fullscreen.
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  renderBackground();

  if (!state.loaded) {
    ctx.fillStyle = "#fff"; ctx.font = "20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.error ? "Error: " + state.error : "Loading sprites…", W / 2, H / 2);
    return;
  }

  if (state.phase === "title") {
    renderTitle();
    return;
  }

  // Screen-shake offset (e.g. from a nuke detonation) — applied to the gameplay
  // world but reset before HUD/pause/victory rendering so UI stays steady.
  let shakeApplied = false;
  if ((state.shake || 0) > 0) {
    const k = Math.min(1, state.shake / 0.7);
    const mag = (state.shakeMag || 12) * k;
    const ox = (Math.random() - 0.5) * 2 * mag;
    const oy = (Math.random() - 0.5) * 2 * mag;
    ctx.save();
    ctx.translate(ox, oy);
    shakeApplied = true;
  }

  // Bullets
  for (const b of state.bullets) {
    if (b.friendly) {
      drawProjectile(b.weapon || "small", b.x, b.y, b.size);
    } else {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - b.size / 2, b.y - 2, b.size, 4);
    }
  }

  // Pickups
  for (const pk of state.pickups) {
    const pulse = 0.8 + Math.sin(state.t * 6 + pk.bob) * 0.2;
    const fade = pk.life < 1.5 ? Math.max(0.25, pk.life / 1.5) : 1;
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    if (pk.type === "health") {
      ctx.fillStyle = "#6bd68a";
      ctx.strokeStyle = "#0b1224";
      ctx.lineWidth = 2;
      const r = pk.size * 0.5 * pulse;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0b1224";
      ctx.fillRect(-r * 0.55, -r * 0.18, r * 1.1, r * 0.36);
      ctx.fillRect(-r * 0.18, -r * 0.55, r * 0.36, r * 1.1);
    } else if (pk.type === "shield") {
      const r = pk.size * 0.55 * pulse;
      ctx.save();
      ctx.shadowColor = "#7fd6ff"; ctx.shadowBlur = 16;
      ctx.strokeStyle = "#7fd6ff"; ctx.lineWidth = 3;
      ctx.fillStyle = "rgba(30, 80, 140, 0.55)";
      // Shield crest: rounded top, pointed bottom.
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.3);
      ctx.quadraticCurveTo(-r, -r, 0, -r);
      ctx.quadraticCurveTo(r, -r, r, -r * 0.3);
      ctx.lineTo(r * 0.1, r);
      ctx.lineTo(-r * 0.1, r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      // Inner chevron mark.
      ctx.strokeStyle = "#cfeaff"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.1);
      ctx.lineTo(0, r * 0.35);
      ctx.lineTo(r * 0.4, -r * 0.1);
      ctx.stroke();
    } else if (pk.type && pk.type.startsWith("unlock-") && pk.weapon) {
      const info = UNLOCK_LABEL[pk.weapon];
      // Glowing halo ring to flag it as an unlock drop.
      ctx.shadowColor = info ? info.color : "#fff"; ctx.shadowBlur = 16;
      ctx.strokeStyle = info ? info.color : "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, pk.size * 0.7 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      // Draw a scaled-up version of the actual projectile so the pickup reads clearly.
      ctx.restore();
      drawProjectile(pk.weapon, pk.x, pk.y, pk.size * 1.25 * pulse);
      ctx.save();
      ctx.translate(pk.x, pk.y);
    } else if (pk.type === "godmode") {
      // Glowing gold halo + miniature ship icon. Telegraphs rarity at a glance.
      const r = pk.size * 0.85 * pulse;
      ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = 22;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
      g.addColorStop(0, "rgba(255,240,160,0.95)");
      g.addColorStop(0.55, "rgba(255,200,60,0.55)");
      g.addColorStop(1, "rgba(255,140,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff3a0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke();
      // Tiny ship sketch.
      const god = state.sprites.playerGod;
      if (god && god.img) {
        const sz = pk.size * 0.95;
        ctx.drawImage(god.img, -sz / 2, -sz / 2, sz, sz);
      } else {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(-r * 0.35, -r * 0.18);
        ctx.lineTo(r * 0.35, 0);
        ctx.lineTo(-r * 0.35, r * 0.18);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Boost: weaponMissle icon as the visual cue.
      const img = state.sprites.weaponMissle.img;
      const sz = pk.size * pulse;
      ctx.shadowColor = "#ffd27a"; ctx.shadowBlur = 12;
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Enemies (face left)
  for (const e of state.enemies) {
    if (e.kind === "semi" || e.kind === "final") {
      if (e.img) {
        // Custom boss art is authored facing left already — don't flip.
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.drawImage(e.img, -e.size / 2, -e.size / 2, e.size, e.size);
        ctx.restore();
      } else if (e.kind === "final") {
        ctx.save();
        ctx.filter = "hue-rotate(70deg) saturate(1.25) brightness(1.1)";
        drawSemiBoss(e);
        ctx.restore();
      } else {
        drawSemiBoss(e);
      }
      continue;
    }
    if (e.kind === "mini" && e.img) {
      // L1 mini-boss is a scaled-up dragon (faces right in source — flip it).
      // L2+ mini-bosses use bespoke art authored facing left — don't flip.
      const flip = (state.level && state.level.bossSprite === "enemyDragon");
      ctx.save();
      ctx.translate(e.x, e.y);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(e.img, -e.size / 2, -e.size / 2, e.size, e.size);
      ctx.restore();
      continue;
    }
    // Regular enemies face right in source art — flip horizontally.
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.enemyKind === "orb") {
      // Orb is radially symmetric — no flip.
      ctx.drawImage(e.img, -e.size / 2, -e.size / 2, e.size, e.size);
    } else {
      ctx.scale(-1, 1);
      ctx.drawImage(e.img, -e.size / 2, -e.size / 2, e.size, e.size);
    }
    ctx.restore();
  }

  // Asteroids (above enemies, below player).
  for (const a of state.asteroids) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    if (a.img) {
      ctx.drawImage(a.img, -a.size / 2, -a.size / 2, a.size, a.size);
    } else {
      // Procedural fallback: jagged grey polygon.
      const r = (a.kind === "medium" ? ASTEROID_MEDIUM_RADIUS : ASTEROID_SMALL_RADIUS);
      ctx.fillStyle = "#5b5650";
      ctx.strokeStyle = "#2a2622";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sides = 9;
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2;
        const rr = r * (0.85 + ((i * 7) % 5) * 0.05);
        const xx = Math.cos(ang) * rr, yy = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // Mother Ship shockwave (drawn behind beams + ship).
  if (state.bossShockwave) {
    const sw = state.bossShockwave;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,180,90,0.9)";
    ctx.lineWidth = sw.thickness;
    ctx.shadowColor = "#ffb26b"; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(sw.cx, sw.cy, sw.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Homing eye-lasers — additive cyan trail + glowing head.
  for (const beam of state.homingBeams) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(95,184,255,0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < beam.trail.length; i++) {
      const pt = beam.trail[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#cfeaff";
    ctx.beginPath(); ctx.arc(beam.x, beam.y, beam.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Player. Draw with natural aspect — MK 4 (and the God Mode sprite) are
  // wider than tall, so forcing a square box stretches them vertically.
  const p = state.player;
  const blink = p.invuln > 0 && Math.floor(state.t * 20) % 2 === 0;
  if (!blink) {
    const iw = p.img && p.img.width  || 1;
    const ih = p.img && p.img.height || 1;
    const aspect = iw / ih;
    const dw = aspect >= 1 ? p.size : p.size * aspect;
    const dh = aspect >= 1 ? p.size / aspect : p.size;
    if (p.flipX) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(-1, 1);
      ctx.drawImage(p.img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(p.img, p.x - dw / 2, p.y - dh / 2, dw, dh);
    }
  }
  // Shield bubble around the player (flickers when about to expire).
  if (p.shieldT > 0) {
    const expiring = p.shieldT < 3;
    const pulse = 0.55 + 0.45 * Math.sin(state.t * (expiring ? 14 : 5));
    const alpha = expiring ? (0.3 + 0.6 * Math.max(0, p.shieldT / 3)) : 0.85;
    ctx.save();
    ctx.shadowColor = "#7fd6ff"; ctx.shadowBlur = 18;
    ctx.strokeStyle = `rgba(127, 214, 255, ${alpha * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(200, 235, 255, ${alpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // God-mode shimmer halo (permanent MICO cheat OR active God Mode pickup).
  if (state.godMode || p.godPickupT > 0) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(state.t * 6);
    const intensity = state.godMode ? 1 : Math.min(1, p.godPickupT / 5); // fade in last 5s
    ctx.strokeStyle = `rgba(255, 215, 80, ${(0.45 + 0.3 * pulse) * (state.godMode ? 1 : 0.85 + 0.15 * intensity)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Timer pips above the player: shield seconds and (pickup-only) GOD MODE seconds.
  // The MICO cheat grants permanent godmode and intentionally has no countdown.
  {
    const labels = [];
    if (p.shieldT > 0) labels.push({ text: `▣ ${Math.ceil(p.shieldT)}s`, color: "#7fd6ff" });
    if (p.godPickupT > 0) labels.push({ text: `★ ${Math.ceil(p.godPickupT)}s`, color: "#ffd84a" });
    if (labels.length) {
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = "bold 12px system-ui";
      let y = p.y - p.size * 0.85 - 6;
      for (const lab of labels) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const w = ctx.measureText(lab.text).width + 10;
        ctx.fillRect(p.x - w / 2, y - 12, w, 16);
        ctx.fillStyle = lab.color;
        ctx.fillText(lab.text, p.x, y);
        y -= 18;
      }
      ctx.restore();
    }
  }

  // Particles
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 1.4);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  if (shakeApplied) ctx.restore();

  // HUD
  ctx.fillStyle = "#0b1224cc";
  ctx.fillRect(10, 10, 260, 98);
  ctx.strokeStyle = "#ffffff22"; ctx.strokeRect(10, 10, 260, 98);
  ctx.fillStyle = "#fff"; ctx.font = "14px system-ui"; ctx.textAlign = "left";
  ctx.fillText(`Score: ${state.score}`, 20, 30);
  ctx.fillText(`Weapon: ${WEAPONS[p.weapon].label}`, 20, 50);
  ctx.fillStyle = "#cfd6ee"; ctx.font = "12px system-ui";
  ctx.fillText(`Kills: ${state.kills | 0}`, 20, 96);
  // HP bar
  ctx.fillStyle = "#ffffff33"; ctx.fillRect(140, 18, 120, 14);
  ctx.fillStyle = p.hp > 3 ? "#6bd68a" : "#ff6b6b";
  ctx.fillRect(140, 18, 120 * Math.max(0, p.hp) / p.maxHp, 14);
  ctx.strokeStyle = "#fff6"; ctx.strokeRect(140, 18, 120, 14);
  // Energy bar (laser fuel) — drains while holding fire with the laser equipped.
  const energyPct = Math.max(0, Math.min(1, (p.energy || 0) / (p.maxEnergy || 100)));
  const lowE = energyPct < 0.2;
  const isLaserNow = p.weapon === "laser";
  ctx.fillStyle = "#cfe6ff"; ctx.font = "11px system-ui";
  ctx.fillText(`Energy${isLaserNow && p._laserOut ? "  (RECHARGING)" : ""}`, 20, 76);
  ctx.fillStyle = "#ffffff33"; ctx.fillRect(140, 64, 120, 12);
  ctx.fillStyle = lowE ? "#ffb26b" : "#7fd6ff";
  ctx.fillRect(140, 64, 120 * energyPct, 12);
  ctx.strokeStyle = "#fff6"; ctx.strokeRect(140, 64, 120, 12);
  // Nuke charges indicator (right-side of weapon line).
  if (p.unlocked.missle || (p.nukeAmmo || 0) > 0) {
    ctx.fillStyle = "#ffb26b"; ctx.font = "bold 12px system-ui"; ctx.textAlign = "right";
    ctx.fillText(`NUKE ${p.nukeAmmo || 0}/${NUKE_MAX}`, 260, 50);
    ctx.textAlign = "left";
  }

  // Boss HP bar
  if (state.boss) {
    const b = state.boss;
    const semi = b.kind === "semi";
    const finalB = b.kind === "final";
    const bw = 520, bh = 16, bx = (W - bw) / 2, by = 74;
    ctx.fillStyle = "#0b1224cc"; ctx.fillRect(bx - 6, by - 22, bw + 12, bh + 28);
    ctx.strokeStyle = "#ffffff33"; ctx.strokeRect(bx - 6, by - 22, bw + 12, bh + 28);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 14px system-ui";
    const label = b.label || (finalB ? "FINAL BOSS" : semi ? "SEMI-FINAL BOSS" : "MINI-BOSS");
    ctx.fillText(`${label}  —  ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`, W / 2, by - 6);
    ctx.fillStyle = "#ffffff22"; ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, b.hp) / b.maxHp;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (finalB)     { grad.addColorStop(0, "#b040ff"); grad.addColorStop(1, "#ffb040"); }
    else if (semi)  { grad.addColorStop(0, "#ff2020"); grad.addColorStop(1, "#ff5ac0"); }
    else            { grad.addColorStop(0, "#ff3a7a"); grad.addColorStop(1, "#ff9a3a"); }
    ctx.fillStyle = grad; ctx.fillRect(bx, by, bw * pct, bh);
    ctx.strokeStyle = "#fff6"; ctx.strokeRect(bx, by, bw, bh);
  }

  if (state.upgradeBanner > 0) {
    const a = Math.min(1, state.upgradeBanner / 0.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#9fd1ff"; ctx.textAlign = "center";
    ctx.font = "bold 36px system-ui";
    ctx.fillText(state.upgradeText || "UPGRADE", W / 2, 90);
    ctx.font = "16px system-ui";
    ctx.fillStyle = "#e8ecf7";
    ctx.fillText("+HP  +Speed  +Damage  Faster fire rate", W / 2, 114);
    ctx.globalAlpha = 1;
  }

  if (state.toast) {
    const a = Math.min(1, state.toast.life / 0.4);
    ctx.globalAlpha = a;
    ctx.fillStyle = state.toast.color; ctx.textAlign = "center";
    ctx.font = "bold 20px system-ui";
    ctx.fillText(state.toast.text, p.x, p.y - p.size * 0.8);
    ctx.globalAlpha = 1;
  }

  // Progress bar toward next ship level.
  const prev = p.nextUpgrade - UPGRADE_INTERVAL;
  const pct = Math.max(0, Math.min(1, (state.score - prev) / UPGRADE_INTERVAL));
  ctx.fillStyle = "#ffffff22"; ctx.fillRect(W - 190, 18, 170, 10);
  ctx.fillStyle = "#9fd1ff"; ctx.fillRect(W - 190, 18, 170 * pct, 10);
  ctx.strokeStyle = "#fff6"; ctx.strokeRect(W - 190, 18, 170, 10);
  ctx.fillStyle = "#cfd6ee"; ctx.font = "12px system-ui"; ctx.textAlign = "right";
  ctx.fillText(`MK ${p.tier}  →  MK ${p.tier + 1} @ ${p.nextUpgrade}`, W - 20, 44);

  // Active-cheat HUD indicator (small, non-revealing beyond the active code).
  if (state.activeCheat) {
    ctx.textAlign = "left";
    ctx.font = "bold 11px system-ui";
    ctx.fillStyle = state.godMode ? "#ffd27a" : "#ff9ad0";
    ctx.fillText(`◆ ${state.activeCheat}${state.godMode ? "  GOD" : ""}`, 20, 66);
  }

  // Audio indicator
  const ax = W - 20, ay = 60;
  ctx.textAlign = "right"; ctx.font = "12px system-ui";
  if (!audio.available) {
    ctx.fillStyle = "#ff8a8a"; ctx.fillText(`♪ missing ${audio.activeTrackPath || "audio/Artificial Savior.mp3"}`, ax, ay);
  } else if (audio.muted) {
    ctx.fillStyle = "#ffb26b"; ctx.fillText("♪ muted (X)", ax, ay);
  } else if (!audio.started) {
    ctx.fillStyle = "#cfd6ee"; ctx.fillText("♪ press any key to play music (X to mute)", ax, ay);
  } else {
    ctx.fillStyle = "#9fd1ff"; ctx.fillText("♪ playing (X to mute)", ax, ay);
  }

  if (state.gameOver) {
    if (state.victory) {
      drawVictoryScreen();
    } else {
      // Fiery GAME OVER backdrop. Falls back to a plain dark wash if the
      // image hasn't loaded (sprite is marked optional).
      const fire = state.sprites && state.sprites.gameOverFire;
      if (fire && fire.img) {
        const iw = fire.img.width, ih = fire.img.height;
        // Cover the canvas while preserving aspect ratio.
        const scale = Math.max(W / iw, H / ih);
        const dw = iw * scale, dh = ih * scale;
        ctx.drawImage(fire.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        // Subtle dark gradient so text/leaderboard stay readable.
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,   "rgba(0,0,0,0.55)");
        grad.addColorStop(0.5, "rgba(0,0,0,0.25)");
        grad.addColorStop(1,   "rgba(0,0,0,0.65)");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = "#000b"; ctx.fillRect(0, 0, W, H);
      }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      // Pulsing fiery title.
      const pulse = 0.7 + 0.3 * Math.sin(state.t * 3.2);
      ctx.save();
      ctx.shadowColor = "#ff7a1f"; ctx.shadowBlur = 36 * pulse + 14;
      ctx.fillStyle = `rgba(255, 230, 200, ${0.92 + 0.08 * pulse})`;
      ctx.font = "bold 72px system-ui";
      ctx.fillText("GAME OVER", W / 2, 110);
      ctx.restore();
      ctx.font = "20px system-ui"; ctx.fillStyle = "#ffe7c2";
      ctx.fillText(`Score: ${state.score}`, W / 2, 160);
    }

    if (state.entry && !state.entry.submitted) {
      const en = state.entry;
      ctx.fillStyle = "#ffd27a"; ctx.font = "bold 22px system-ui";
      ctx.fillText("NEW HIGH SCORE — ENTER YOUR INITIALS", W / 2, 340);
      // Big glowing letter boxes (geometry via entryBoxRects to keep hit-test in sync).
      const rects = entryBoxRects();
      for (const r of rects) {
        const active = r.i === en.pos;
        ctx.fillStyle = active ? "#1a2a6c" : "#0b1224";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = active ? "#ffd27a" : "#ffffff44";
        ctx.lineWidth = active ? 3 : 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.save();
        if (active) { ctx.shadowColor = "#ffd27a"; ctx.shadowBlur = 18; }
        ctx.fillStyle = "#fff"; ctx.font = "bold 54px system-ui";
        ctx.fillText(en.letters[r.i], r.x + r.w / 2, r.y + r.h / 2 + 4);
        ctx.restore();
        // Up/Down chevrons (also serve as larger tap targets on touch).
        ctx.fillStyle = active ? "#ffd27a" : "#9fd1ff";
        ctx.font = "bold 24px system-ui";
        ctx.fillText("▲", r.x + r.w / 2, r.y - 10);
        ctx.fillText("▼", r.x + r.w / 2, r.y + r.h + 28);
      }
      // Type / touch hints anchored near the bottom for breathing room.
      ctx.fillStyle = "#cfd6ee"; ctx.font = "13px system-ui";
      ctx.fillText("Type A–Z / 0–9  ·  ← → move  ·  ↑ ↓ cycle  ·  Enter submit", W / 2, 500);
      ctx.fillText("Touch: tap box to select  ·  tap ▲▼ or swipe ↕ to change  ·  OK to submit", W / 2, 520);
    } else if (state.outro && state.continueAvailable) {
      // Intermediate-level outro: CONTINUE prompt is rendered inside drawVictoryScreen.
      ctx.fillStyle = "#8d95ad"; ctx.font = "12px system-ui";
      ctx.fillText("(R restarts the entire run)", W / 2, 280);
    } else {
      ctx.fillStyle = "#cfd6ee"; ctx.font = "16px system-ui";
      ctx.fillText("Press R to restart", W / 2, 188);
    }

    // Leaderboard panel — only on the final-level outro / game-over screens.
    // Narrower + shifted left on the final outro so it sits clear of the
    // gold planet rendered on the right half of the canvas. Hidden during
    // initials entry so the type/touch hints can sit at the bottom.
    if ((!state.outro || !state.continueAvailable) && !(state.entry && !state.entry.submitted)) {
      const isFinalOutro = state.outro && !state.continueAvailable;
      if (isFinalOutro) {
        drawLeaderboard(60, 360, 320, 160);
      } else {
        drawLeaderboard(W / 2 - 170, 360, 340, 160);
      }
    }
  }

  if (state.paused) {
    ctx.fillStyle = "#000a"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 28;
    ctx.fillStyle = "#9fd1ff";
    ctx.font = "bold 48px system-ui";
    ctx.fillText("PAUSED", W / 2, 70);
    ctx.restore();
    ctx.fillStyle = "#cfd6ee"; ctx.font = "14px system-ui";
    ctx.fillText("Press P to resume  ·  Tap ▶ on touch", W / 2, 104);

    // 4-character cheat code entry — opt-in via the on-screen button below.
    if (state.cheatEntry) {
      const en = state.cheatEntry;
      ctx.fillStyle = "#9fd1ff"; ctx.font = "bold 16px system-ui";
      ctx.fillText("CHEAT CODE", W / 2, 138);
      const rects = cheatBoxRects();
      for (const r of rects) {
        const active = r.i === en.pos;
        ctx.fillStyle = active ? "#1a2a6c" : "#0b1224";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = active ? "#ffd27a" : "#ffffff44";
        ctx.lineWidth = active ? 3 : 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.save();
        if (active) { ctx.shadowColor = "#ffd27a"; ctx.shadowBlur = 14; }
        ctx.fillStyle = "#fff"; ctx.font = "bold 40px system-ui";
        ctx.textBaseline = "middle";
        ctx.fillText(en.letters[r.i], r.x + r.w / 2, r.y + r.h / 2 + 2);
        ctx.restore();
        ctx.fillStyle = active ? "#ffd27a" : "#9fd1ff";
        ctx.font = "bold 20px system-ui";
        ctx.textBaseline = "middle";
        ctx.fillText("▲", r.x + r.w / 2, r.y - 12);
        ctx.fillText("▼", r.x + r.w / 2, r.y + r.h + 14);
      }
      // Submit / cancel hints.
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#cfd6ee"; ctx.font = "12px system-ui";
      ctx.fillText("Enter / FIRE to submit  ·  Esc to cancel", W / 2, 268);
    } else if (state.audioMenu) {
      // AUDIO submenu — three rows of −/value/+ controls.
      ctx.fillStyle = "#9fd1ff"; ctx.font = "bold 16px system-ui";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("AUDIO", W / 2, 158);
      const rows = audioMenuRects();
      const focus = state.audioMenu.focus | 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const isFocus = i === focus;
        const v = audio.getVolume(r.kind);
        // Label
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillStyle = isFocus ? "#ffd27a" : "#cfd6ee";
        ctx.font = isFocus ? "bold 16px system-ui" : "16px system-ui";
        ctx.fillText(AUDIO_LABELS[r.kind], r.label.x + r.label.w - 10, r.y + r.h / 2);
        // Minus button
        ctx.fillStyle = "#0b1224";
        ctx.fillRect(r.minus.x, r.minus.y, r.minus.w, r.minus.h);
        ctx.strokeStyle = isFocus ? "#ffd27a" : "#ffffff44";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.minus.x, r.minus.y, r.minus.w, r.minus.h);
        ctx.fillStyle = "#fff"; ctx.font = "bold 22px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("−", r.minus.x + r.minus.w / 2, r.minus.y + r.minus.h / 2 + 1);
        // Value bar + percent label
        ctx.fillStyle = "#0b1224";
        ctx.fillRect(r.value.x, r.value.y + 8, r.value.w, r.value.h - 16);
        ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1;
        ctx.strokeRect(r.value.x, r.value.y + 8, r.value.w, r.value.h - 16);
        ctx.fillStyle = "#5fb8ff";
        ctx.fillRect(r.value.x + 2, r.value.y + 10, (r.value.w - 4) * v, r.value.h - 20);
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px system-ui";
        ctx.fillText(`${Math.round(v * 100)}%`, r.value.x + r.value.w / 2, r.value.y + r.value.h / 2 + 1);
        // Plus button
        ctx.fillStyle = "#0b1224";
        ctx.fillRect(r.plus.x, r.plus.y, r.plus.w, r.plus.h);
        ctx.strokeStyle = isFocus ? "#ffd27a" : "#ffffff44";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.plus.x, r.plus.y, r.plus.w, r.plus.h);
        ctx.fillStyle = "#fff"; ctx.font = "bold 22px system-ui";
        ctx.fillText("+", r.plus.x + r.plus.w / 2, r.plus.y + r.plus.h / 2 + 1);
      }
      ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
      ctx.fillStyle = "#cfd6ee"; ctx.font = "12px system-ui";
      ctx.fillText("Tap AUDIO again or press Esc to close  ·  ←/→ adjust  ·  ↑/↓ select", W / 2, 332);
    } else {
      // Top-row buttons: CHEAT CODE | AUDIO. Click either to open its panel.
      const btns = pauseButtonRects();
      const sel = state.pauseSel || "cheat";
      const drawBtn = (rect, label, accent, focused) => {
        ctx.save();
        ctx.shadowColor = accent; ctx.shadowBlur = focused ? 22 : 12;
        ctx.fillStyle = focused ? "#243a8a" : "#1a2a6c";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = accent; ctx.lineWidth = focused ? 3 : 2;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
        ctx.fillStyle = accent; ctx.font = focused ? "bold 17px system-ui" : "bold 16px system-ui";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
      };
      drawBtn(btns.cheat, "◆ CHEAT CODE ◆", "#ffd27a", sel === "cheat");
      drawBtn(btns.audio, "♪ AUDIO ♪",      "#9fd1ff", sel === "audio");
      ctx.textBaseline = "alphabetic";
      // Hint line below the buttons for keyboard controls.
      ctx.fillStyle = "#9aa3bd"; ctx.font = "12px system-ui"; ctx.textAlign = "center";
      ctx.fillText("←/→ or A/D to select  ·  Enter to open  ·  Esc to resume",
        W / 2, btns.cheat.y + btns.cheat.h + 22);
    }

    ctx.textBaseline = "alphabetic";
    if (!state.audioMenu) drawLeaderboard(W / 2 - 170, 322, 340, 200);
  }
}

function drawLeaderboard(panelX, panelY, panelW, panelH) {
  ctx.fillStyle = "#0b1224dd"; ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#ffffff22"; ctx.strokeRect(panelX, panelY, panelW, panelH);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9fd1ff"; ctx.font = "bold 18px system-ui";
  ctx.fillText("HIGH SCORES", panelX + panelW / 2, panelY + 22);
  const maxRows = Math.max(1, Math.floor((panelH - 56) / 20));
  const entries = state.hiscores.slice(0, maxRows);
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "#8d95ad";
  ctx.textAlign = "left";   ctx.fillText("#",       panelX + 20,  panelY + 44);
                            ctx.fillText("INIT",    panelX + 60,  panelY + 44);
  ctx.textAlign = "right";  ctx.fillText("KILLS",   panelX + panelW - 90, panelY + 44);
                            ctx.fillText("SCORE",   panelX + panelW - 20, panelY + 44);
  ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
  const just = (state.entry && state.entry.submitted) ? state.entry.letters.join("") : null;
  const justScore = state.entry ? state.entry.score : null;
  for (let i = 0; i < entries.length; i++) {
    const row = entries[i];
    const y = panelY + 64 + i * 20;
    const isJust = just && row.initials === just && row.score === justScore;
    ctx.fillStyle = isJust ? "#ffd27a" : "#cfd6ee";
    ctx.textAlign = "left";
    ctx.fillText(`${String(i + 1).padStart(2, " ")}.`, panelX + 20, y);
    ctx.fillText(row.initials, panelX + 60, y);
    ctx.textAlign = "right";
    ctx.fillText(String((row.kills | 0)), panelX + panelW - 90, y);
    ctx.fillText(String(row.score), panelX + panelW - 20, y);
  }
  if (entries.length === 0) {
    ctx.fillStyle = "#8d95ad"; ctx.textAlign = "center";
    ctx.fillText("(no scores yet)", panelX + panelW / 2, panelY + 84);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawVictoryScreen() {
  const vt = Math.max(0, state.t - state.victoryStartT);
  const lvl = state.level || LEVELS[0];
  const ps = (lvl.planet) || {};
  const palette = ps.palette || ["#6fa8ff", "#2e4da8", "#070a22"];
  const ringColor = ps.ringColor || "rgba(255,210,160,0.55)";

  // Deep space backdrop with a slow nebula tint.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#050817");
  bg.addColorStop(0.5, "#0a0a2a");
  bg.addColorStop(1, "#1a0830");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Twinkling star field (deterministic positions via sin for a fancy parallax feel).
  for (let i = 0; i < 140; i++) {
    const sx = (i * 83.1 + vt * (10 + (i % 7) * 4)) % W;
    const sy = (i * 47.3) % H;
    const tw = 0.5 + 0.5 * Math.sin(vt * 2 + i);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.55 * tw})`;
    ctx.fillRect(W - sx, sy, 2, 2);
  }

  // Planet on the right — sprite if configured + loaded, else procedural.
  const planet = { x: W - 200, y: H / 2 + 60, r: 110 };
  const isFinal = !lvl.nextLevel;
  const heavenly = isFinal && !ps.sprite;
  const psSprite = ps.sprite ? state.sprites[ps.sprite] : null;
  if (psSprite && psSprite.img) {
    const targetH = H * 0.55;
    const scale = targetH / psSprite.img.height;
    const w = psSprite.img.width * scale, h = psSprite.img.height * scale;

    // Final-victory variant: same planet sprite as the continue screen but
    // crowned with golden rays + halo and tinted gold via canvas filter.
    if (isFinal) {
      ctx.save();
      ctx.translate(planet.x, planet.y);
      const rays = 18;
      const baseR = w * 0.5;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + vt * 0.15;
        const len = baseR * (3.6 + 0.5 * Math.sin(vt * 0.8 + i));
        const w0 = baseR * 0.08;
        ctx.fillStyle = `rgba(255, 240, 190, ${0.05 + 0.05 * Math.sin(vt * 1.2 + i)})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len - Math.sin(a) * w0, Math.sin(a) * len + Math.cos(a) * w0);
        ctx.lineTo(Math.cos(a) * len + Math.sin(a) * w0, Math.sin(a) * len - Math.cos(a) * w0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      const halo = ctx.createRadialGradient(planet.x, planet.y, baseR * 0.95,
                                             planet.x, planet.y, baseR * 2.1);
      halo.addColorStop(0, "rgba(255, 240, 190, 0.55)");
      halo.addColorStop(1, "rgba(255, 240, 190, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(planet.x, planet.y, baseR * 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = isFinal ? "#fff7d6" : palette[0];
    ctx.shadowBlur = isFinal ? 48 : 30;
    if (isFinal) ctx.filter = "sepia(0.75) hue-rotate(-12deg) saturate(1.7) brightness(1.08)";
    ctx.drawImage(psSprite.img, planet.x - w / 2, planet.y - h / 2, w, h);
    ctx.restore();
    // Update planet.r approx for ship-end-position calculation below.
    planet.r = w * 0.5;
  } else {
    // Heavenly variant on the final-victory screen (Mother Ship defeated):
    // gold/white palette, radiant light rays, double halo.
    const useHeavenly = heavenly;
    const heavenPalette = ["#fff7d6", "#ffd27a", "#5a3a18"];
    const drawPalette = useHeavenly ? heavenPalette : palette;
    const drawRing = useHeavenly ? "rgba(255,236,180,0.7)" : ringColor;

    if (useHeavenly) {
      // Radiating light rays behind the planet.
      ctx.save();
      ctx.translate(planet.x, planet.y);
      const rays = 18;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + vt * 0.15;
        const len = planet.r * (3.6 + 0.5 * Math.sin(vt * 0.8 + i));
        const w0 = planet.r * 0.08;
        ctx.fillStyle = `rgba(255, 240, 190, ${0.05 + 0.05 * Math.sin(vt * 1.2 + i)})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len - Math.sin(a) * w0, Math.sin(a) * len + Math.cos(a) * w0);
        ctx.lineTo(Math.cos(a) * len + Math.sin(a) * w0, Math.sin(a) * len - Math.cos(a) * w0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // Outer halo.
      ctx.save();
      const halo = ctx.createRadialGradient(planet.x, planet.y, planet.r * 0.9,
                                             planet.x, planet.y, planet.r * 2.2);
      halo.addColorStop(0, "rgba(255, 240, 190, 0.55)");
      halo.addColorStop(1, "rgba(255, 240, 190, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(planet.x, planet.y, planet.r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const p1 = ctx.createRadialGradient(planet.x - planet.r * 0.4, planet.y - planet.r * 0.4, planet.r * 0.1,
                                         planet.x, planet.y, planet.r);
    p1.addColorStop(0, drawPalette[0]);
    p1.addColorStop(0.55, drawPalette[1]);
    p1.addColorStop(1, drawPalette[2]);
    ctx.fillStyle = p1;
    ctx.beginPath(); ctx.arc(planet.x, planet.y, planet.r, 0, Math.PI * 2); ctx.fill();
    // Rim glow.
    ctx.save();
    ctx.shadowColor = useHeavenly ? "#fff7d6" : drawPalette[0]; ctx.shadowBlur = useHeavenly ? 60 : 40;
    ctx.strokeStyle = useHeavenly ? "rgba(255,250,220,0.85)" : "rgba(160,200,255,0.55)";
    ctx.lineWidth = useHeavenly ? 3 : 2;
    ctx.beginPath(); ctx.arc(planet.x, planet.y, planet.r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Tilted ring.
    ctx.save();
    ctx.translate(planet.x, planet.y);
    ctx.rotate(-0.35);
    ctx.scale(1, 0.22);
    ctx.strokeStyle = drawRing; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, planet.r * 1.55, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = drawRing.replace(/[\d.]+\)$/, "0.25)"); ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(0, 0, planet.r * 1.55, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Player ship flies in from the left toward the planet, then hovers.
  const flightDur = 6;
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, t), 2);
  const prog = ease(vt / flightDur);
  const startX = -120, endX = planet.x - planet.r - 60;
  const shipX = startX + (endX - startX) * prog;
  const shipY = 290 + Math.sin(vt * 1.6) * 8;
  const shipScale = 1.0 - prog * 0.22;

  // Engine exhaust trail.
  const trailLen = 140 * (1 - prog * 0.6);
  const grad = ctx.createLinearGradient(shipX - trailLen, shipY, shipX, shipY);
  grad.addColorStop(0, "rgba(95,184,255,0)");
  grad.addColorStop(1, "rgba(159,209,255,0.85)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(shipX - trailLen, shipY - 6);
  ctx.lineTo(shipX,             shipY - 10);
  ctx.lineTo(shipX,             shipY + 10);
  ctx.lineTo(shipX - trailLen, shipY + 6);
  ctx.closePath(); ctx.fill();

  // Ship sprite — use the player's current sprite (reflects MK4/God if active).
  const shipImg = (state.player && state.player.img) || (state.sprites.player && state.sprites.player.img);
  const shipSize = (state.player && state.player.size) || 72;
  if (shipImg) {
    const sz = shipSize * 1.8 * shipScale;
    ctx.save();
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 18;
    ctx.drawImage(shipImg, shipX - sz / 2, shipY - sz / 2, sz, sz);
    ctx.restore();
  }

  // Title — big glow.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 32;
  ctx.fillStyle = "#cfe6ff";
  ctx.font = "bold 56px system-ui";
  ctx.fillText("ARTIFICIAL SAVIOR", W / 2, 72);
  ctx.restore();

  // Headline differs by intermediate vs final (isFinal declared above).
  const pulse = 0.7 + 0.3 * Math.sin(vt * 2.4);
  ctx.save();
  ctx.shadowColor = "#ffd27a"; ctx.shadowBlur = 28 * pulse + 10;
  ctx.fillStyle = `rgba(255, 220, 140, ${0.85 + 0.15 * pulse})`;
  ctx.font = "bold 40px system-ui";
  if (isFinal) {
    ctx.fillText("MISSION ACCOMPLISHED", W / 2, 128);
  } else {
    ctx.fillText(`LEVEL ${lvl.id} CLEARED`, W / 2, 128);
  }
  ctx.restore();

  // Score / kills line.
  ctx.fillStyle = "#cfd6ee"; ctx.font = "20px system-ui";
  ctx.fillText(`${isFinal ? "Final Score" : "Score"}: ${state.score}`, W / 2, 170);
  ctx.fillStyle = "#9fd1ff"; ctx.font = "16px system-ui";
  ctx.fillText(`Enemy Ships Destroyed: ${state.kills | 0}`, W / 2, 196);

  // Continue prompt for intermediate levels — gated by the post-victory hold so
  // music can crossfade and the player can register the win before advancing.
  // Anchored near the bottom of the canvas so it never collides with the
  // mid-screen ship/planet flight composition.
  if (!isFinal && state.continueAvailable) {
    if ((state.outroDelay || 0) > 0) {
      const remaining = Math.ceil(state.outroDelay);
      ctx.fillStyle = "#9fd1ff"; ctx.font = "bold 18px system-ui";
      ctx.fillText(`LEVEL COMPLETE — ${remaining}…`, W / 2, 470);
    } else {
      const cp = 0.6 + 0.4 * Math.sin(vt * 3);
      ctx.save();
      ctx.shadowColor = "#9fd1ff"; ctx.shadowBlur = 18 * cp + 8;
      ctx.fillStyle = `rgba(207, 230, 255, ${0.7 + 0.3 * cp})`;
      ctx.font = "bold 26px system-ui";
      ctx.fillText(lvl.outroPrompt || "CONTINUE", W / 2, 470);
      ctx.restore();
      ctx.fillStyle = "#cfd6ee"; ctx.font = "14px system-ui";
      ctx.fillText("Press FIRE / Enter / ▶ to continue", W / 2, 500);
    }
  }
  ctx.textBaseline = "alphabetic";
}

// ---------- Loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused) update(dt);
  render();
  requestAnimationFrame(frame);
}

async function main() {
  initStars();
  state.hiscores = loadHiscores();
  try {
    state.sprites = await loadSprites();
    state.player = makePlayer(state.sprites);
    state.loaded = true;
  } catch (err) {
    console.error(err);
    state.error = err.message + " (serve over HTTP, don't open file:// directly)";
  }
  requestAnimationFrame(frame);
}

main();

// ---------- Mobile / touch controls ----------
(function setupTouchControls() {
  const root = document.getElementById("touch");
  if (!root) return;
  const stick = document.getElementById("tc-stick");
  const knob = document.getElementById("tc-knob");
  const fire = document.getElementById("tc-fire");
  const action = document.getElementById("tc-action");
  const weaponBtns = document.querySelectorAll("#tc-weapons .tc-btn");

  const DIRS = ["arrowleft", "arrowright", "arrowup", "arrowdown"];

  let stickId = null;
  function resetStick() {
    DIRS.forEach(d => keys.delete(d));
    knob.style.transform = "";
  }
  function updateStick(cx, cy) {
    const r = stick.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const max = r.width / 2 - 18;
    const dist = Math.hypot(dx, dy) || 1;
    const cl = Math.min(dist, max);
    const ux = dx / dist * cl, uy = dy / dist * cl;
    knob.style.transform = `translate(${ux}px,${uy}px)`;
    const t = max * 0.25;
    DIRS.forEach(d => keys.delete(d));
    if (Math.abs(dx) > t) keys.add(dx > 0 ? "arrowright" : "arrowleft");
    if (Math.abs(dy) > t) keys.add(dy > 0 ? "arrowdown" : "arrowup");
  }
  stick.addEventListener("pointerdown", e => {
    stickId = e.pointerId;
    stick.setPointerCapture(stickId);
    audio.unlockAndPlay();
    updateStick(e.clientX, e.clientY);
    e.preventDefault();
  });
  stick.addEventListener("pointermove", e => {
    if (e.pointerId === stickId) updateStick(e.clientX, e.clientY);
  });
  function endStick(e) {
    if (e.pointerId === stickId) { stickId = null; resetStick(); }
  }
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  // Fire (hold to auto-fire). While the pause-menu cheat entry is open, FIRE
  // doubles as the ENTER/submit button so the on-canvas ENTER affordance can
  // be removed for mobile.
  fire.addEventListener("pointerdown", e => {
    fire.setPointerCapture(e.pointerId);
    audio.unlockAndPlay();
    if (state.paused && state.cheatEntry) {
      submitCheatEntry();
    } else {
      keys.add(" ");
    }
    e.preventDefault();
  });
  const endFire = () => keys.delete(" ");
  fire.addEventListener("pointerup", endFire);
  fire.addEventListener("pointercancel", endFire);
  fire.addEventListener("pointerleave", endFire);

  // Weapon quick-tap buttons
  weaponBtns.forEach(btn => {
    btn.addEventListener("pointerdown", e => {
      const k = btn.dataset.k;
      keys.add(k);
      setTimeout(() => keys.delete(k), 80);
      audio.unlockAndPlay();
      e.preventDefault();
    });
  });

  // Context-aware action button: Start / Pause / Resume / Retry / Continue.
  function actionLabel() {
    if (state.phase === "title") return "START";
    if (state.outro && state.continueAvailable) return "▶";
    if (state.gameOver && (!state.entry || state.entry.submitted)) return "RETRY";
    if (state.entry && !state.entry.submitted) return "OK";
    return state.paused ? "▶" : "II";
  }
  action.addEventListener("pointerdown", e => {
    audio.unlockAndPlay();
    if (state.phase === "title") {
      state.titleElapsed = 1e9;
    } else if (state.outro && state.continueAvailable) {
      if ((state.outroDelay || 0) <= 0) advanceLevel();
    } else if (state.entry && !state.entry.submitted) {
      handleEntryKey("Enter");
    } else if (state.gameOver) {
      keys.add("r");
      setTimeout(() => keys.delete("r"), 80);
    } else {
      togglePause();
    }
    e.preventDefault();
  });
  setInterval(() => { action.textContent = actionLabel(); }, 200);

  // Tap on canvas also skips the title, and handles tap/swipe for high-score initials entry.
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    // Map from CSS pixels to logical world coords (960×540), regardless of
    // backing-store resolution.
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height),
    };
  }
  let tapStart = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase === "title") { state.titleElapsed = 1e9; return; }
    if (state.entry && !state.entry.submitted) {
      const p = toCanvas(e);
      tapStart = { kind: "entry", x: p.x, y: p.y, pos: null, chevron: null, time: performance.now() };
      const rects = entryBoxRects();
      for (const r of rects) {
        // Chevron hit zones extend 32px above and below each box.
        if (p.x >= r.x && p.x <= r.x + r.w) {
          if (p.y >= r.y - 40 && p.y < r.y) { tapStart.pos = r.i; tapStart.chevron = 1;  break; }
          if (p.y > r.y + r.h && p.y <= r.y + r.h + 40) { tapStart.pos = r.i; tapStart.chevron = -1; break; }
          if (p.y >= r.y && p.y <= r.y + r.h) { tapStart.pos = r.i; break; }
        }
      }
      // Fire chevron taps immediately for snappy feedback.
      if (tapStart.chevron !== null && tapStart.pos !== null) {
        state.entry.pos = tapStart.pos;
        cycleEntryLetter(tapStart.pos, tapStart.chevron);
      }
      e.preventDefault();
    } else if (state.paused && state.cheatEntry) {
      const p = toCanvas(e);
      tapStart = { kind: "cheat", x: p.x, y: p.y, pos: null, chevron: null, time: performance.now() };
      const rects = cheatBoxRects();
      for (const r of rects) {
        if (p.x >= r.x && p.x <= r.x + r.w) {
          if (p.y >= r.y - 32 && p.y < r.y) { tapStart.pos = r.i; tapStart.chevron = 1;  break; }
          if (p.y > r.y + r.h && p.y <= r.y + r.h + 32) { tapStart.pos = r.i; tapStart.chevron = -1; break; }
          if (p.y >= r.y && p.y <= r.y + r.h) { tapStart.pos = r.i; break; }
        }
      }
      if (tapStart.chevron !== null && tapStart.pos !== null) {
        state.cheatEntry.pos = tapStart.pos;
        cycleCheatLetter(tapStart.pos, tapStart.chevron);
      }
      e.preventDefault();
    } else if (state.paused && state.audioMenu) {
      const p = toCanvas(e);
      const rows = audioMenuRects();
      const am = state.audioMenu;
      let consumed = false;
      const within = (r, q) => q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (within(r.minus, p)) { am.focus = i; nudgeVolume(r.kind, -1); consumed = true; break; }
        if (within(r.plus,  p)) { am.focus = i; nudgeVolume(r.kind, +1); consumed = true; break; }
        if (within({ x: r.label.x, y: r.y, w: r.plus.x + r.plus.w - r.label.x, h: r.h }, p)) {
          am.focus = i; consumed = true; break;
        }
      }
      // Tapping the AUDIO button again closes the submenu.
      if (!consumed) {
        const btn = audioButtonRect();
        if (within(btn, p)) { closeAudioMenu(); consumed = true; }
      }
      if (consumed) e.preventDefault();
    } else if (state.paused) {
      // Pause menu: click CHEAT CODE to open entry boxes; click AUDIO to open submenu.
      const p = toCanvas(e);
      const btns = pauseButtonRects();
      const within = (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      if (within(btns.cheat)) { openCheatEntry(); e.preventDefault(); }
      else if (within(btns.audio)) { openAudioMenu(); e.preventDefault(); }
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!tapStart) return;
    const t = tapStart; tapStart = null;
    if (t.kind === "entry") {
      if (t.chevron !== null) return; // already handled on pointerdown
      if (t.pos === null) return;
      const p = toCanvas(e);
      const dy = p.y - t.y;
      const dx = p.x - t.x;
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) {
        state.entry.pos = t.pos;
        cycleEntryLetter(t.pos, dy < 0 ? 1 : -1);
      } else if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        state.entry.pos = t.pos;
      }
      return;
    }
    if (t.kind === "cheat") {
      if (!state.cheatEntry) return;
      if (t.chevron !== null) return; // handled on pointerdown
      const p = toCanvas(e);
      const dy = p.y - t.y;
      const dx = p.x - t.x;
      const isTap = Math.abs(dx) < 20 && Math.abs(dy) < 20;
      if (t.pos === null) return;
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) {
        state.cheatEntry.pos = t.pos;
        cycleCheatLetter(t.pos, dy < 0 ? 1 : -1);
      } else if (isTap) {
        state.cheatEntry.pos = t.pos;
      }
    }
  });
  canvas.addEventListener("pointercancel", () => { tapStart = null; });
})();
