# Copilot Instructions — Artificial Savior

Side-scrolling space shooter built as an **installable PWA** with plain vanilla HTML/JS/Canvas. No build system, package manager, bundler, test runner, or linter. Do not introduce any — every piece of tooling would have to be wired up from scratch and is explicitly out of scope.

## Running / previewing

- Serve the repo root over HTTP (e.g. `python -m http.server 8080`) and open `http://localhost:8080/`. Direct `file://` does not work because `game.js` `fetch()`es `content/sprites.json`.
- No tests or linters exist. Do not invent commands.
- After any change to `game.js`, `index.html`, `style.css`, `sw.js`, `content/*.json`, or assets listed in `sw.js`, the browser will likely serve the stale service-worker copy until the cache is bumped (see below).

## Service-worker cache — MUST bump on asset changes

`sw.js` is cache-first and pre-caches every asset on install. Whenever you change a tracked file **you must**:

1. Increment the `CACHE` constant at the top of `sw.js` (e.g. `artificial-savior-v19` → `v20`).
2. If you added a new asset (PNG, JSON, mp3, etc.), append its path to the `ASSETS` array.

Skipping this causes players — and the next play-test — to see stale code even after a reload. To force a refresh from devtools:

```js
navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));
caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))); location.reload();
```

## Architecture (big picture)

Four top-level runtime files, loaded in this order from `index.html`:

1. `index.html` — single `<canvas id="game" width="960" height="540">` plus on-screen touch controls (`#touch`, `#tc-stick`, `#tc-fire`, `#tc-weapons`, `#tc-action`). All DOM UI lives here; the game itself renders to the canvas.
2. `style.css` — page chrome + touch-control layout.
3. `game.js` — the **entire** game (≈2000 lines): sprite loader, input, state, update loop, render, audio, pickup/boss/leaderboard logic, initials entry, victory screen. Everything is one file with browser globals — there are no modules.
4. `sw.js` — offline service worker (cache-first, pre-caches on install, background-refreshes on fetch).

Content is data-driven via `content/sprites.json` (sprite atlas: keyed by entity name with `image` path + `size`, plus optional `"optional": true`). Art PNGs live in `Ship art/` (yes, with a space). `loadImage()` URL-encodes path segments so spaces work — keep using that helper, don't construct raw URLs.

`content/level1.json` exists from an earlier platformer prototype but is **not used** by the current shooter build. Don't treat it as authoritative.

Audio is a single `audio/Artificial Savior.mp3` background track plus procedural WebAudio SFX generated inside `game.js` (`audio.playSfx("laser" | "explosion" | "enemyDie" | ...)`).

## Game.js conventions

- **Plain `<script>` tag, no modules.** Keep browser globals. Don't add `import`/`export` without switching `index.html` to `type="module"`.
- **Tuning constants live at the top of `game.js`** (`WEAPONS`, `SHIELD_DURATION`, `BOSS_HP`, `SEMIBOSS_HP`, `FINAL_BOSS_HP`, `*_SCORE_TRIGGER`, `MK2_TIER`, `MK3_TIER`, `UPGRADE_INTERVAL`, etc.). Change balance by editing these, not by patching spawn code.
- **`state` is a single module-scope object.** New gameplay fields must be added both in the initial `state = {...}` literal **and** in `reset()` so Retry clears them. Same for fields on `state.player` — add them in the player factory (all new fields default there).
- **Enemy `tier` is stamped at spawn** from `state.player.tier` so leveling up mid-fight doesn't retroactively buff existing enemies. Keep that pattern when adding per-tier stats.
- **Boss art direction:** the semi-boss and final-boss PNGs are authored **facing left**, so their render branch does NOT flip. Regular enemies (dragon) use `ctx.scale(-1, 1)` to face left. Don't un-flip regular enemies or flip bosses.
- **Optional sprites:** entries in `sprites.json` marked `"optional": true` may fail to load — `loadSprites()` sets `img: null` with a console warning. Always guard usage with `state.sprites.X && state.sprites.X.img` before drawing; provide a procedural fallback where possible (see the boss render path as the reference pattern).
- **Pickup drop-pool pattern:** `spawnPickup()` builds a weighted pool conditional on player/game state (locked weapons, boss flags). To add a new pickup kind, push into that pool with a weight, then add branches in `collectPickup()` (effect) and in the pickup-render block (visual).
- **Game-over / victory / pause / entry flow** is controlled by flags on `state` (`gameOver`, `victory`, `paused`, `entry`, `phase`), and the update loop short-circuits while `gameOver` is set except for restart input. Render branches on those flags in order: victory → gameOver → paused. `actionLabel()` picks the touch action-button label from the same flags.
- **Canvas is fixed 960×540** logical resolution (`W`, `H` constants). Scale with CSS; do not change the canvas attributes.
- **Weapon keys 1/2/3/4** index into `WEAPON_ORDER = ["small","large","laser","missle"]` and the four touch buttons in `#tc-weapons` use the same `data-k` values. Add new weapons by extending `WEAPONS`, `WEAPON_ORDER`, the unlock logic, and the `#tc-weapons` markup in `index.html` together — they must stay in sync.
- **Cheat codes** (`CHEAT_CODES`, currently `EDGE` and `MICO`) have two entry paths: (1) silent rolling 8-char `state.cheatBuffer` on the title screen for keyboard users, and (2) a 4-character pause-menu input (`state.cheatEntry`, geometry via `cheatBoxRects()`/`cheatEnterRect()`, submitted by `submitCheatEntry()`) for touch users. Both call `applyCheat(state.player)` and set `state.cheatBanner = 2.5`. `applyCheat()` also re-runs inside `reset()` so Retry preserves them. Don't add cheat hints to on-screen UI; pause-menu misses are silent by design (boxes are NOT cleared on miss).
- **Initials entry intercepts the keyboard.** While `state.entry` exists and `!state.entry.submitted`, `keydown` is fully consumed by `handleEntryKey()` — pause/mute/restart hotkeys are deliberately blocked. Cheat-entry input (alpha/digit/arrows/Backspace/Enter) is similarly routed to `handleCheatEntryKey()` while `state.paused && state.cheatEntry`, but `p`/`m`/`r` intentionally fall through so users can still resume/mute/restart.
- **Local leaderboard** lives in `localStorage` under `HISCORE_KEY = "artificialSaviorHiscores"` (top `HISCORE_MAX = 10`). `loadHiscores()` defensively re-validates shape/types — preserve that pattern when changing the record schema, and bump or migrate the key if you change the format incompatibly.

## Mobile / touch UI

`#touch` and its children (`#tc-stick`, `#tc-knob`, `#tc-fire`, `#tc-weapons`, `#tc-action`, `#tc-pause`) are hidden by default and only become visible via the `@media (pointer:coarse)` rule in `style.css`. `#tc-pause` is additionally gated by a `.show` class toggled from the touch setup (only during active gameplay), and its label flips between `II` and `▶` based on `state.paused`. Other controls are not toggled from JS. If you add new on-screen controls, add the corresponding `pointer:coarse` styling or they will be invisible on phones/tablets. The action button label is driven by `actionLabel()` and changes with `state` flags (paused/gameOver/victory/entry) — update that function rather than writing to the DOM directly.

## Art source folder

`Ship art/` holds raw PNG source art referenced directly by `sprites.json` and `sw.js`. The space in the folder name is intentional — `loadImage()` URL-encodes it. When adding new art, (a) drop the PNG in `Ship art/`, (b) register it in `content/sprites.json` (with `"optional": true` if you haven't committed the file yet), (c) add its path to `sw.js` `ASSETS`, and (d) bump `CACHE`.

