// Artificial Savior — playable test iteration.
// Side-scrolling space shooter using the Ship art/ PNGs. Loads sprite paths
// from content/sprites.json so art can be swapped without code changes.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const SPRITES_URL = "content/sprites.json";

const WEAPONS = {
  small:  { sprite: "weaponSmall",  cooldown: 0.12, speed: 720, damage: 1,  size: 14, color: "#9fd1ff", label: "Small Gun" },
  large:  { sprite: "weaponLarge",  cooldown: 0.35, speed: 600, damage: 3,  size: 22, color: "#ffd27a", label: "Large Gun" },
  laser:  { sprite: "weaponLaser",  cooldown: 0.06, speed: 980, damage: 1,  size: 26, color: "#ff6bd6", label: "Laser"     },
  missle: { sprite: "weaponMissle", cooldown: 0.55, speed: 520, damage: 5,  size: 22, color: "#ffb26b", label: "Missile"   }
};
const WEAPON_ORDER = ["small", "large", "laser", "missle"];

const UPGRADE_INTERVAL = 3000;
const BOSS_SCORE_TRIGGER = 10000;
const BOSS_HP = 5000;
const BOSS_REWARD = 5000;

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
    out[key] = { ...def, img: await loadImage(def.image) };
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

  if (e.repeat) return void keys.add(k);
  keys.add(k);
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  if (k === "m") audio.toggleMute();
  if (k === "p") togglePause();
  audio.unlockAndPlay();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("pointerdown", () => audio.unlockAndPlay());

function togglePause() {
  // Pausing is only meaningful during active gameplay.
  if (state.phase !== "play" || state.gameOver) return;
  state.paused = !state.paused;
  if (state.paused) audio.pauseMusic();
  else audio.resumeMusic();
}

function handleEntryKey(key) {
  const en = state.entry;
  if (!en || en.submitted) return;
  if (key === "Enter") {
    en.submitted = true;
    submitHiscore(en.letters.join(""), en.score);
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
    const dir = key === "ArrowUp" ? 1 : -1;
    const cur = en.letters[en.pos];
    const idx = cur >= "A" && cur <= "Z" ? cur.charCodeAt(0) - 65 : 0;
    const next = (idx + dir + 26) % 26;
    en.letters[en.pos] = String.fromCharCode(65 + next);
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

// ---------- Audio ----------

const audio = (() => {
  const music = new Audio("audio/Artificial Savior.mp3");
  music.loop = true;
  music.preload = "auto";
  music.volume = 0.55;
  let muted = false;
  let started = false;
  let available = true;
  music.addEventListener("error", () => { available = false; });

  // Procedural SFX via Web Audio so we don't need any additional files.
  let actx = null;
  function ensureCtx() {
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { actx = new C(); } catch (e) { return null; }
    }
    if (actx.state === "suspended") actx.resume();
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

  function sfxSmall(ac) {
    // Tiny "pew" — short high square blip.
    const o = ac.createOscillator();
    o.type = "square";
    const now = ac.currentTime;
    o.frequency.setValueAtTime(1400, now);
    o.frequency.exponentialRampToValueAtTime(700, now + 0.05);
    const g = envGain(ac, 0.03, 0.02, 0.05);
    o.connect(g).connect(ac.destination);
    o.start(); o.stop(now + 0.09);
  }

  function sfxLarge(ac) {
    // Robust, heavier thump — triangle body + square snap.
    const now = ac.currentTime;
    const tri = ac.createOscillator(); tri.type = "triangle";
    tri.frequency.setValueAtTime(320, now);
    tri.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    const g1 = envGain(ac, 0.085, 0.05, 0.18);
    tri.connect(g1).connect(ac.destination);
    tri.start(); tri.stop(now + 0.25);

    const sq = ac.createOscillator(); sq.type = "square";
    sq.frequency.setValueAtTime(180, now);
    sq.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    const g2 = envGain(ac, 0.045, 0.02, 0.12);
    sq.connect(g2).connect(ac.destination);
    sq.start(); sq.stop(now + 0.18);
  }

  function sfxLaser(ac) {
    // Energy ray — saw sweeping down through a resonant lowpass.
    const now = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(1600, now);
    o.frequency.exponentialRampToValueAtTime(260, now + 0.22);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 12;
    lp.frequency.setValueAtTime(2200, now);
    lp.frequency.exponentialRampToValueAtTime(500, now + 0.22);
    const g = envGain(ac, 0.055, 0.05, 0.18);
    o.connect(lp).connect(g).connect(ac.destination);
    o.start(); o.stop(now + 0.28);
  }

  function sfxMissle(ac) {
    // Rocket whoosh — filtered noise + low rumble sweep.
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.6);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(220, now + 0.5);
    const gn = envGain(ac, 0.075, 0.18, 0.35);
    src.connect(bp).connect(gn).connect(ac.destination);
    src.start(); src.stop(now + 0.6);

    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.5);
    const g2 = envGain(ac, 0.045, 0.20, 0.30);
    o.connect(g2).connect(ac.destination);
    o.start(); o.stop(now + 0.6);
  }

  function sfxExplosion(ac) {
    // Big boom — loud low thump + sustained noise tail.
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 1.2);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.9);
    const gn = envGain(ac, 0.55, 0.25, 0.9);
    src.connect(lp).connect(gn).connect(ac.destination);
    src.start(); src.stop(now + 1.2);

    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.9);
    const g2 = envGain(ac, 0.55, 0.15, 0.9);
    o.connect(g2).connect(ac.destination);
    o.start(); o.stop(now + 1.1);
  }

  function sfxEnemyShot(ac) {
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
    o.connect(lp).connect(g).connect(ac.destination);
    o.start(); o.stop(now + 0.28);
  }

  function sfxEnemyDie(ac) {
    // Small explosion — brief noise burst + low thump, no screen shake.
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.3);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(260, now + 0.22);
    const gn = envGain(ac, 0.22, 0.06, 0.22);
    src.connect(lp).connect(gn).connect(ac.destination);
    src.start(); src.stop(now + 0.32);

    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(210, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.22);
    const g2 = envGain(ac, 0.20, 0.04, 0.2);
    o.connect(g2).connect(ac.destination);
    o.start(); o.stop(now + 0.28);
  }

  const SFX = { small: sfxSmall, large: sfxLarge, laser: sfxLaser, missle: sfxMissle, explosion: sfxExplosion, enemyShot: sfxEnemyShot, enemyDie: sfxEnemyDie };

  // Analyser hookup for music-reactive visuals.
  let source = null;
  let analyser = null;
  let freqData = null;
  const energy = { bass: 0, mid: 0, treble: 0, level: 0 };
  function ensureAnalyser() {
    const ac = ensureCtx();
    if (!ac || source) return;
    try {
      source = ac.createMediaElementSource(music);
      analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      // Route music through the analyser so we can read it while it still plays.
      source.connect(analyser);
      analyser.connect(ac.destination);
    } catch (e) {
      source = null; analyser = null; freqData = null;
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
      ensureAnalyser();
      if (!available || muted || started) return;
      const p = music.play();
      if (p && typeof p.then === "function") {
        p.then(() => { started = true; }).catch(() => { /* retry on next input */ });
      } else {
        started = true;
      }
    },
    toggleMute() {
      muted = !muted;
      if (muted) { music.pause(); }
      else { started = false; this.unlockAndPlay(); }
    },
    pauseMusic() { if (!muted && started) music.pause(); },
    resumeMusic() {
      if (muted) return;
      const p = music.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    },
    playSfx(kind) {
      if (muted) return;
      const ac = ensureCtx();
      if (!ac) return;
      const fn = SFX[kind];
      if (fn) fn(ac);
    },
    getEnergy() { return sampleEnergy(); },
    get muted() { return muted; },
    get available() { return available; },
    get started() { return started; }
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
    speed: 340,
    hp: 10, maxHp: 10,
    weapon: "small",
    unlocked: { small: true, large: false, laser: false, missle: false },
    cd: 0,
    invuln: 0,
    tier: 1,
    nextUpgrade: UPGRADE_INTERVAL,
    cooldownMul: 1,
    damageBonus: 0,
    speedMul: 1
  };
}

function levelUp(p) {
  p.tier += 1;
  p.nextUpgrade += UPGRADE_INTERVAL;

  // One-time sprite swap to MK 2 at tier 2 and above.
  if (p.tier >= 2 && p.img !== state.sprites.playerMk2.img) {
    const s = state.sprites.playerMk2;
    p.img = s.img;
    p.size = s.size;
  }

  p.maxHp += 3;
  p.hp = Math.min(p.maxHp, p.hp + 4);
  p.speed += 20;
  p.cooldownMul *= 0.9;
  p.damageBonus += 1;

  state.upgradeBanner = 2.5;
  state.upgradeText = `MK ${p.tier} ONLINE`;
  burst(p.x, p.y, "#9fd1ff", 40);
}

const state = {
  sprites: null,
  player: null,
  bullets: [],
  enemies: [],
  pickups: [],
  particles: [],
  stars: [],
  score: 0,
  spawnTimer: 0,
  t: 0,
  gameOver: false,
  loaded: false,
  error: null,
  upgradeBanner: 0,
  upgradeText: "",
  toast: null,
  boss: null,
  bossTriggered: false,
  bossDefeated: false,
  phase: "title",
  titleElapsed: 0,
  paused: false,
  hiscores: [],
  entry: null
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
      .map(r => ({ initials: r.initials.slice(0, 3).toUpperCase(), score: r.score | 0 }))
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

function submitHiscore(initials, score) {
  const clean = (initials || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "A");
  state.hiscores.push({ initials: clean, score });
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
  state.score = 0;
  state.spawnTimer = 0;
  state.gameOver = false;
  state.upgradeBanner = 0;
  state.toast = null;
  state.boss = null;
  state.bossTriggered = false;
  state.bossDefeated = false;
  state.entry = null;
}

function spawnBoss() {
  const s = state.sprites.enemyDragon;
  const boss = {
    x: W + 160, y: H / 2,
    vx: -90, vy: 0,
    baseY: H / 2,
    size: s.size * 2.6,
    img: s.img,
    hp: BOSS_HP, maxHp: BOSS_HP,
    fireCd: 1.2,
    burstCd: 3.0,
    isBoss: true,
    entering: true,
    phase: 0,
    t: 0
  };
  state.enemies.push(boss);
  state.boss = boss;
  state.bossTriggered = true;
  state.upgradeBanner = 3.5;
  state.upgradeText = "!! MINI-BOSS INCOMING !!";
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

// ---------- Systems ----------

function fireWeapon(p, dt) {
  p.cd -= dt;
  if (!keys.has(" ") || p.cd > 0) return;
  const w = WEAPONS[p.weapon];
  p.cd = w.cooldown * (p.cooldownMul || 1);
  state.bullets.push({
    x: p.x + p.size * 0.5, y: p.y,
    vx: w.speed, vy: 0,
    size: w.size, damage: w.damage + (p.damageBonus || 0),
    color: w.color,
    weapon: p.weapon,
    img: null,
    life: 1.6,
    friendly: true
  });
  audio.playSfx(p.weapon);
}

function spawnEnemy() {
  const s = state.sprites.enemyDragon;
  const y = 60 + Math.random() * (H - 120);
  state.enemies.push({
    x: W + 80, y,
    vx: -(90 + Math.random() * 90),
    vy: 0,
    baseY: y,
    size: s.size,
    img: s.img,
    hp: 6,
    fireCd: 0.8 + Math.random() * 1.2
  });
}

function enemyFire(e) {
  state.bullets.push({
    x: e.x - e.size * 0.4, y: e.y,
    vx: -380, vy: 0,
    size: 12, damage: 1,
    color: "#ff5a5a",
    img: null,
    life: 2.2,
    friendly: false
  });
  audio.playSfx("enemyShot");
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

const UNLOCK_LABEL = {
  large:  { text: "LARGE GUN UNLOCKED", color: "#ffd27a", sprite: "weaponLarge"  },
  laser:  { text: "LASER UNLOCKED",     color: "#ff6bd6", sprite: "weaponLaser"  },
  missle: { text: "MISSILE UNLOCKED",   color: "#ffb26b", sprite: "weaponMissle" }
};

function collectPickup(p, pk) {
  if (pk.type === "health") {
    const heal = 2 + Math.floor(p.tier);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    showToast(`+${heal} HP`, "#6bd68a");
    burst(pk.x, pk.y, "#6bd68a", 18);
  } else if (pk.type === "boost") {
    p.damageBonus += 1;
    p.cooldownMul *= 0.92;
    showToast("WEAPON BOOST", "#ffd27a");
    burst(pk.x, pk.y, "#ffd27a", 18);
  } else if (pk.type && pk.type.startsWith("unlock-")) {
    const key = pk.weapon;
    if (key && !p.unlocked[key]) {
      p.unlocked[key] = true;
      p.weapon = key; // Auto-equip the newly unlocked weapon.
      const info = UNLOCK_LABEL[key] || { text: key.toUpperCase() + " UNLOCKED", color: "#fff" };
      showToast(info.text, info.color);
      burst(pk.x, pk.y, info.color, 24);
    } else {
      // Already unlocked (edge case): treat as a boost instead.
      p.damageBonus += 1;
      p.cooldownMul *= 0.92;
      showToast("WEAPON BOOST", "#ffd27a");
      burst(pk.x, pk.y, "#ffd27a", 18);
    }
  }
}

function update(dt) {
  state.t += dt;

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
    if (keys.has("r") && (!state.entry || state.entry.submitted)) reset();
    return;
  }

  const p = state.player;

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

  // Trigger the mini-boss once the threshold is crossed.
  if (!state.bossTriggered && !state.bossDefeated && state.score >= BOSS_SCORE_TRIGGER) {
    spawnBoss();
  }

  // Suspend regular spawns while the boss is alive.
  if (!state.boss) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = Math.max(0.45, 1.6 - state.t * 0.015);
    }
  }

  for (const e of state.enemies) {
    if (e.isBoss) {
      e.t += dt;
      // Slide in from the right, then hover and track player Y.
      if (e.entering) {
        e.x += e.vx * dt;
        if (e.x <= W - e.size * 0.55) { e.x = W - e.size * 0.55; e.entering = false; e.vx = 0; }
      } else {
        const trackSpeed = 140;
        const dy = state.player.y - e.y;
        e.vy = Math.max(-trackSpeed, Math.min(trackSpeed, dy * 2.2));
        // Add sinusoidal lunge toward and away from the player.
        const lunge = Math.sin(e.t * 1.3) * 60;
        e.x += (W - e.size * 0.55 - lunge - e.x) * Math.min(1, dt * 2.5);
        e.y += e.vy * dt;
        e.y = Math.max(e.size / 2, Math.min(H - e.size / 2, e.y));
      }
      e.fireCd -= dt;
      e.burstCd -= dt;
      if (!e.entering && e.fireCd <= 0) {
        bossFire(e);
        // Fire rate intensifies as HP drops.
        const rage = 1 - Math.max(0, e.hp) / e.maxHp;
        e.fireCd = Math.max(0.25, 0.9 - rage * 0.6);
      }
      if (!e.entering && e.burstCd <= 0) {
        bossBurst(e);
        e.burstCd = 3.4 - (1 - e.hp / e.maxHp) * 1.4;
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
          if (e.hp <= 0) {
            if (e.isBoss) {
              for (let k = 0; k < 6; k++) burst(e.x + (Math.random() - 0.5) * e.size * 0.8, e.y + (Math.random() - 0.5) * e.size * 0.8, "#ff9a3a", 40);
              state.score += BOSS_REWARD;
              state.bossDefeated = true;
              state.boss = null;
              state.upgradeBanner = 4.0;
              state.upgradeText = "BOSS DEFEATED";
              // Reward drops.
              for (let k = 0; k < 3; k++) spawnPickup(e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 60, state.player.tier + 2);
            } else {
              burst(e.x, e.y, "#ffb26b", 24);
              audio.playSfx("enemyDie");
              state.score += 100;
              const dropChance = 0.15 + Math.min(0.25, (state.player.tier - 1) * 0.04);
              if (Math.random() < dropChance) spawnPickup(e.x, e.y, state.player.tier);
            }
            while (state.score >= state.player.nextUpgrade) levelUp(state.player);
          }
        }
      }
    } else if (p.invuln <= 0) {
      if (Math.abs(b.x - p.x) < p.size * 0.4 && Math.abs(b.y - p.y) < p.size * 0.4) {
        p.hp -= b.damage; b.life = 0; p.invuln = 0.8;
        burst(p.x, p.y, "#ff5a5a", 16);
        if (p.hp <= 0) killPlayer(p);
      }
    }
  }
  // Enemy ramming
  if (p.invuln <= 0) {
    for (const e of state.enemies) {
      if (Math.abs(e.x - p.x) < (e.size + p.size) * 0.4 && Math.abs(e.y - p.y) < (e.size + p.size) * 0.4) {
        const dmg = e.isBoss ? 5 : 3;
        p.hp -= dmg; p.invuln = 1.0;
        if (!e.isBoss) { e.hp = 0; audio.playSfx("enemyDie"); }
        burst((e.x + p.x) / 2, (e.y + p.y) / 2, "#ffb26b", 28);
        if (p.hp <= 0) killPlayer(p);
      }
    }
  }

  state.bullets = state.bullets.filter(b => b.life > 0 && b.x > -40 && b.x < W + 40);

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

  // Title "Artificial Savior" with neon-glow double-draw.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tx = W / 2, ty = H * 0.42;
  const bob = Math.sin(t * 1.6) * 3;

  ctx.save();
  ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 40;
  ctx.fillStyle = "#9fd1ff";
  ctx.font = "bold 92px system-ui";
  ctx.fillText("Artificial Savior", tx, ty + bob);
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Artificial Savior", tx, ty + bob);
  ctx.restore();

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
    ctx.fillText(`(audio/Artificial Savior.mp3 missing — starting in ${Math.ceil(remaining)}s)`, tx, H - 80);
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
  ctx.fillText("WASD / Arrows to move   ·   Space to fire   ·   1-4 weapons   ·   P pause   ·   M mute", tx, H - 46);

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

function render() {
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
    } else {
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
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(-1, 1);
    ctx.drawImage(e.img, -e.size / 2, -e.size / 2, e.size, e.size);
    ctx.restore();
  }

  // Player
  const p = state.player;
  const blink = p.invuln > 0 && Math.floor(state.t * 20) % 2 === 0;
  if (!blink) drawSprite(p.img, p.x, p.y, p.size);

  // Particles
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 1.4);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = "#0b1224cc";
  ctx.fillRect(10, 10, 260, 58);
  ctx.strokeStyle = "#ffffff22"; ctx.strokeRect(10, 10, 260, 58);
  ctx.fillStyle = "#fff"; ctx.font = "14px system-ui"; ctx.textAlign = "left";
  ctx.fillText(`Score: ${state.score}`, 20, 30);
  ctx.fillText(`Weapon: ${WEAPONS[p.weapon].label}`, 20, 50);
  // HP bar
  ctx.fillStyle = "#ffffff33"; ctx.fillRect(140, 18, 120, 14);
  ctx.fillStyle = p.hp > 3 ? "#6bd68a" : "#ff6b6b";
  ctx.fillRect(140, 18, 120 * Math.max(0, p.hp) / p.maxHp, 14);
  ctx.strokeStyle = "#fff6"; ctx.strokeRect(140, 18, 120, 14);

  // Boss HP bar
  if (state.boss) {
    const b = state.boss;
    const bw = 520, bh = 16, bx = (W - bw) / 2, by = 74;
    ctx.fillStyle = "#0b1224cc"; ctx.fillRect(bx - 6, by - 22, bw + 12, bh + 28);
    ctx.strokeStyle = "#ffffff33"; ctx.strokeRect(bx - 6, by - 22, bw + 12, bh + 28);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 14px system-ui";
    ctx.fillText(`MINI-BOSS  —  ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`, W / 2, by - 6);
    ctx.fillStyle = "#ffffff22"; ctx.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, b.hp) / b.maxHp;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, "#ff3a7a"); grad.addColorStop(1, "#ff9a3a");
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

  // Audio indicator
  const ax = W - 20, ay = 60;
  ctx.textAlign = "right"; ctx.font = "12px system-ui";
  if (!audio.available) {
    ctx.fillStyle = "#ff8a8a"; ctx.fillText("♪ missing audio/Artificial Savior.mp3", ax, ay);
  } else if (audio.muted) {
    ctx.fillStyle = "#ffb26b"; ctx.fillText("♪ muted (M)", ax, ay);
  } else if (!audio.started) {
    ctx.fillStyle = "#cfd6ee"; ctx.fillText("♪ press any key to play music (M to mute)", ax, ay);
  } else {
    ctx.fillStyle = "#9fd1ff"; ctx.fillText("♪ playing (M to mute)", ax, ay);
  }

  if (state.gameOver) {
    ctx.fillStyle = "#000b"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "48px system-ui"; ctx.fillText("GAME OVER", W / 2, 110);
    ctx.font = "20px system-ui"; ctx.fillStyle = "#cfd6ee";
    ctx.fillText(`Score: ${state.score}`, W / 2, 150);

    if (state.entry && !state.entry.submitted) {
      const en = state.entry;
      ctx.fillStyle = "#ffd27a"; ctx.font = "bold 22px system-ui";
      ctx.fillText("NEW HIGH SCORE — ENTER YOUR INITIALS", W / 2, 200);
      ctx.fillStyle = "#cfd6ee"; ctx.font = "13px system-ui";
      ctx.fillText("Type A–Z / 0–9   ·   ← →  move   ·   ↑ ↓  cycle   ·   Enter  submit", W / 2, 224);
      // Big glowing letter boxes.
      const boxW = 70, boxH = 86, gap = 18;
      const totalW = boxW * 3 + gap * 2;
      const bx = (W - totalW) / 2;
      for (let i = 0; i < 3; i++) {
        const x = bx + i * (boxW + gap);
        const y = 250;
        const active = i === en.pos;
        ctx.fillStyle = active ? "#1a2a6c" : "#0b1224";
        ctx.fillRect(x, y, boxW, boxH);
        ctx.strokeStyle = active ? "#ffd27a" : "#ffffff44";
        ctx.lineWidth = active ? 3 : 2;
        ctx.strokeRect(x, y, boxW, boxH);
        ctx.save();
        if (active) { ctx.shadowColor = "#ffd27a"; ctx.shadowBlur = 18; }
        ctx.fillStyle = "#fff"; ctx.font = "bold 54px system-ui";
        ctx.fillText(en.letters[i], x + boxW / 2, y + boxH / 2 + 4);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = "#cfd6ee"; ctx.font = "16px system-ui";
      ctx.fillText("Press R to restart", W / 2, 188);
    }

    // Leaderboard panel.
    const panelX = W / 2 - 170, panelY = 360, panelW = 340, panelH = 160;
    ctx.fillStyle = "#0b1224dd"; ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = "#ffffff22"; ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = "#9fd1ff"; ctx.font = "bold 18px system-ui";
    ctx.fillText("HIGH SCORES", W / 2, panelY + 22);
    const entries = state.hiscores.slice(0, 5);
    ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    const just = (state.entry && state.entry.submitted) ? state.entry.letters.join("") : null;
    const justScore = state.entry ? state.entry.score : null;
    for (let i = 0; i < entries.length; i++) {
      const row = entries[i];
      const y = panelY + 52 + i * 20;
      const isJust = just && row.initials === just && row.score === justScore;
      ctx.fillStyle = isJust ? "#ffd27a" : "#cfd6ee";
      ctx.fillText(`${String(i + 1).padStart(2, " ")}.`, panelX + 20, y);
      ctx.fillText(row.initials, panelX + 60, y);
      ctx.textAlign = "right";
      ctx.fillText(String(row.score), panelX + panelW - 20, y);
      ctx.textAlign = "left";
    }
    if (entries.length === 0) {
      ctx.fillStyle = "#8d95ad"; ctx.textAlign = "center";
      ctx.fillText("(no scores yet)", W / 2, panelY + 72);
    }
    ctx.textBaseline = "alphabetic";
  }

  if (state.paused) {
    ctx.fillStyle = "#000a"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowColor = "#5fb8ff"; ctx.shadowBlur = 28;
    ctx.fillStyle = "#9fd1ff";
    ctx.font = "bold 64px system-ui";
    ctx.fillText("PAUSED", W / 2, H / 2 - 10);
    ctx.restore();
    ctx.fillStyle = "#cfd6ee"; ctx.font = "18px system-ui";
    ctx.fillText("Press P to resume", W / 2, H / 2 + 36);
    ctx.textBaseline = "alphabetic";
  }
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
