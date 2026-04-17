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

const UPGRADE_INTERVAL = 2500;

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
  keys.add(e.key.toLowerCase());
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

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
  toast: null
};

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
    img: state.sprites[w.sprite].img,
    life: 1.6,
    friendly: true
  });
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
  // Higher tier => slightly better odds of weapon-boost drops.
  const weaponOdds = 0.45 + Math.min(0.25, (tier - 1) * 0.04);
  const type = Math.random() < weaponOdds ? "weapon" : "health";
  state.pickups.push({
    x, y,
    vx: -60 - Math.random() * 40,
    vy: (Math.random() - 0.5) * 40,
    size: 26,
    type,
    life: 8,
    bob: Math.random() * Math.PI * 2
  });
}

function collectPickup(p, pk) {
  if (pk.type === "health") {
    const heal = 2 + Math.floor(p.tier);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    showToast(`+${heal} HP`, "#6bd68a");
  } else {
    // Permanent projectile boost: a bit more damage + a bit faster fire rate.
    p.damageBonus += 1;
    p.cooldownMul *= 0.92;
    showToast("WEAPON BOOST", "#ffd27a");
  }
  burst(pk.x, pk.y, pk.type === "health" ? "#6bd68a" : "#ffd27a", 18);
}

function update(dt) {
  state.t += dt;

  for (const s of state.stars) {
    s.x -= s.z * 60 * dt;
    if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
  }

  if (state.gameOver) {
    if (keys.has("r")) reset();
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
    if (keys.has(String(i + 1))) p.weapon = WEAPON_ORDER[i];
  }

  fireWeapon(p, dt);
  if (p.invuln > 0) p.invuln -= dt;

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = Math.max(0.45, 1.6 - state.t * 0.015);
  }

  for (const e of state.enemies) {
    e.x += e.vx * dt;
    e.y = e.baseY + Math.sin(state.t * 2 + e.baseY) * 24;
    e.fireCd -= dt;
    if (e.fireCd <= 0 && e.x < W - 20) { enemyFire(e); e.fireCd = 1.0 + Math.random() * 1.4; }
  }
  state.enemies = state.enemies.filter(e => e.x > -100 && e.hp > 0);

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
            burst(e.x, e.y, "#ffb26b", 24);
            state.score += 100;
            // Random drop on kill; chance scales modestly with tier.
            const dropChance = 0.15 + Math.min(0.25, (state.player.tier - 1) * 0.04);
            if (Math.random() < dropChance) spawnPickup(e.x, e.y, state.player.tier);
            // Every UPGRADE_INTERVAL points => ship level up.
            while (state.score >= state.player.nextUpgrade) levelUp(state.player);
          }
        }
      }
    } else if (p.invuln <= 0) {
      if (Math.abs(b.x - p.x) < p.size * 0.4 && Math.abs(b.y - p.y) < p.size * 0.4) {
        p.hp -= b.damage; b.life = 0; p.invuln = 0.8;
        burst(p.x, p.y, "#ff5a5a", 16);
        if (p.hp <= 0) state.gameOver = true;
      }
    }
  }
  // Enemy ramming
  if (p.invuln <= 0) {
    for (const e of state.enemies) {
      if (Math.abs(e.x - p.x) < (e.size + p.size) * 0.4 && Math.abs(e.y - p.y) < (e.size + p.size) * 0.4) {
        p.hp -= 3; p.invuln = 1.0; e.hp = 0;
        burst((e.x + p.x) / 2, (e.y + p.y) / 2, "#ffb26b", 28);
        if (p.hp <= 0) state.gameOver = true;
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

function render() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // Nebula gradient
  const g = ctx.createRadialGradient(W * 0.7, H * 0.4, 20, W * 0.7, H * 0.4, W);
  g.addColorStop(0, "#1a2a6c33");
  g.addColorStop(1, "#00000000");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Stars
  for (const s of state.stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.z * 0.3})`;
    ctx.fillRect(s.x, s.y, s.z, s.z);
  }

  if (!state.loaded) {
    ctx.fillStyle = "#fff"; ctx.font = "20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.error ? "Error: " + state.error : "Loading sprites…", W / 2, H / 2);
    return;
  }

  // Bullets
  for (const b of state.bullets) {
    if (b.img && b.friendly) {
      drawSprite(b.img, b.x, b.y, b.size, Math.PI / 2);
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

  if (state.gameOver) {
    ctx.fillStyle = "#000a"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "48px system-ui"; ctx.fillText("GAME OVER", W / 2, H / 2 - 10);
    ctx.font = "18px system-ui"; ctx.fillText(`Score: ${state.score} — press R to restart`, W / 2, H / 2 + 24);
  }
}

// ---------- Loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

async function main() {
  initStars();
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
