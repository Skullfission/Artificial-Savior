# Copilot Instructions — Artificial Savior

Edge-targeted web platform game (RPG-lite platformer). The project is an **early-stage vanilla HTML/JS scaffold** with no build system, package manager, test runner, or linter. Do not introduce one unless the user asks.

## Running / previewing

- No build step. Open `index.html` directly in a browser, or serve the repo root over HTTP (e.g. `python -m http.server`) so `fetch` for `content/*.json` works.
- There are no tests and no lint config. Do not invent commands or add tooling.

## Architecture (big picture)

The runtime is composed of three pieces that load in this order from `index.html`:

1. `index.html` — single `<canvas id="game" width="960" height="540">` plus `<script src="game.js">`. All UI lives in this one file.
2. `style.css` — minimal page chrome; the game itself renders to the canvas, not the DOM.
3. `game.js` — the entire game loop and logic (currently just a scaffold stub).

Game data is **data-driven via JSON in `content/`**, not hardcoded in `game.js`:

- `content/level1.json` — level definition. `tileSize` (px), `spawn` / `goal` as tile coordinates, and `grid` as an array of equal-length strings where each character is a tile id (`"1"` = solid, `"0"` = empty). Row index = y, column index = x.
- `content/sprites.json` — sprite atlas metadata keyed by entity name (e.g. `player`). Each entry has `image` (path), `frameW`/`frameH` (px), and `animations` mapping a name to `{ row, frames }` for a horizontal strip on that row.

When adding features, keep this split: engine code in `game.js`, content in `content/*.json`. Image paths in `sprites.json` are relative to the repo root (e.g. `assets/player.png`); note that `assets/` does not yet exist — create it when wiring sprites rather than dumping images in the repo root.

`Ship art/` holds raw PNG source art (e.g. `MK 2 ship.png`, `Dragon Ship.png`). Treat this as a source folder; reference art from `sprites.json` via an `assets/` path, not directly from `Ship art/` (the space in the folder name is awkward for URLs).

## Conventions

- Plain ES (browser globals), no modules, no bundler. Keep `game.js` loadable via a plain `<script>` tag — do not add `import`/`export` without also updating `index.html` to use `type="module"`.
- Level grids are **strings of single-char tile ids**, not nested arrays. Preserve that shape when editing/extending levels.
- Coordinates in JSON are in **tiles**, not pixels. Multiply by `tileSize` in `game.js` when rendering.
- Canvas is a fixed 960×540 logical resolution; scale via CSS, not by changing canvas attributes.
