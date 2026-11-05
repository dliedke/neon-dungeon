# CLAUDE.md

Neon Dungeon is a cyberpunk isometric action RPG that runs in the browser (desktop, mobile and gamepad).
It is built with plain ES modules and Three.js. There is **no build step, no package.json, no bundler, no tests and no linter**.
Live at https://dliedke.github.io/neon-dungeon/ (GitHub Pages serves `main` from the repo root, so pushing to `main` deploys).

## Running

ES modules need HTTP, so `file://` won't work. Serve the repo root:

- `python3 -m http.server 8000` (Python isn't installed on this machine) or `npx http-server -p 8000`.
- Visual Studio: open `neon-dungeon.sln` and press F5. This runs IIS Express on port 8000 using `web.config`, which sets the `.webmanifest` and `.js` MIME types. GitHub Pages ignores `web.config`.
- Force a language with `?lang=en` or `?lang=pt`. Otherwise the browser language decides.

Debug handles in the console (set at the end of `boot()` in `js/main.js`):
- `window.__G`: global state.
- `window.__classes`.
- `window.__dbg`: `spawnEnemy`, `nextFloor`, `startFloor`, `makeItem`, `spawnPickup`, `spawnChest`, `findPath`, `refresh`.
- `__dbg.sim(seconds, onStep)`: runs game logic without rendering, for automated checks.

To check something visually, use headless Edge/Chrome against a local server, e.g. `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --screenshot=...`. Save screenshots outside the repo or in the root (root `*.png` files are gitignored).

## Deploy: always report when the Pages build is live

After every push to `main`, **always** wait for the GitHub Pages build and tell the user when the site is live. Don't stop at "pushed".
Pages uses the legacy "build from branch" mode, which runs the `pages-build-deployment` workflow (usually 30s–1.5min):

```bash
sha=$(git rev-parse HEAD)
# the run takes a few seconds to appear after the push; retry until it shows up
id=$(gh run list --workflow pages-build-deployment --commit "$sha" --json databaseId --jq '.[0].databaseId')
gh run watch "$id" --exit-status
```

- Run the watch in the background so the session isn't blocked.
- On success, say the build finished and link https://dliedke.github.io/neon-dungeon/. Mention that the CDN or browser cache may need a hard refresh (Ctrl+F5).
- On failure, report it with `gh run view "$id" --log-failed`.
- Quick status check: `gh api repos/dliedke/neon-dungeon/pages/builds/latest --jq '{status, commit}'`.

## Layout

```
index.html            all HUD/menu markup; importmap maps "three" -> vendor/three
manifest.webmanifest  PWA manifest (icons point into img/)
css/style.css         all UI styles
img/                  app icons (icon.svg, icon-192/512.png) and og-image.png (link preview)
docs/screenshots/     reference screenshots, not loaded by the game
js/                   game modules (see below)
vendor/three/         Three.js r160 + the postprocessing addons in use. Don't edit; copy new addons from r160 with their deps
```

Module map (`js/`):
- `main.js`: entry point; renderer, bloom, camera, game loop (`frame` → `logic(dt)`), floor lifecycle (`buildFloor`/`startFloor`/`nextFloor`), save/load, `boot()`.
- `state.js`: the shared global object `G` (mode, scene, player, entity arrays, settings), `TILE`, and `gk()`.
- `dungeon.js`: `THEMES` (biome definitions), `themeFor(floor)`, procedural layouts (`rooms`, `cave`, `meadow`, `sewer`, `grid`, `market`), meshes, collision, flow field, A*.
- `biomes.js`: biome features and hazards, plus the merchant.
- `classes.js`: `CLASSES` (7 classes, 9-skill trees each), skill logic, and inline-SVG `ICONS`.
- `powers.js`: advanced tree powers (summons, orbitals, black holes, transformations).
- `enemies.js`: enemy types, AI, elites, bosses (`BOSS_ORDER`).
- `combat.js`: damage, statuses, projectiles, hazards, turrets.
- `player.js`: the player and progression.
- `items.js`, `loot.js`: item generation, rarities, ground loot, chests.
- `models.js` (low-poly models built from primitives) and `fx.js` (particles and effects).
- `audio.js`: sounds and music synthesized with WebAudio.
- `input.js` and `padglyphs.js`: keyboard/mouse/gamepad/touch, and gamepad model detection with button glyphs.
- `ui.js`: menus, inventory, skill tree, shop, minimap, gamepad menu navigation.
- `i18n.js`: language handling; `utils.js`: helpers.
- `sync.js`: Google sign-in and Google Drive cloud save.
- `ach.js`: medals (achievements). Counters are per device in `G.save.stats.dev` and summed; sets and unlocks are unioned on cloud merge. Record events with `achAdd` / `achMark` / `achKill`; the list is built lazily in `achList()` because of circular imports.

## Conventions and gotchas

- **All content is procedural.** Models come from Three.js primitives, sounds are synthesized, and icons are inline SVG path strings. Don't add external art, audio or model files. The only image files are the app icons and the og image.
- **Global state:** modules share state through `G` (from `state.js`) instead of passing it around. Modules import each other circularly (e.g. combat ↔ enemies ↔ ui). That works because imports are only used at runtime, so never call an imported function at module top level.
- **Neon glow:** emissive intensities above 1 create bloom. Pass them through `gk(k)` (or `glowMat` in `models.js`) so the global `GLOW` factor applies.
- **Every user-facing string is bilingual (pt-BR + en):**
  - In JS, use `L('português', 'english')`.
  - In `index.html`, use `data-i18n`, `data-i18n-html` or `data-i18n-title` keys, defined in the `DICT` in `i18n.js`.
  - Gamepad button placeholders like `{A}`, `{LB}` and `{START}` go through `padText` / `data-pad-text` so they render as the right glyph for Xbox, PlayStation or Switch.
- **Every input method must work: keyboard+mouse, gamepad and touch.**
  - Menu elements must have the `data-nav` attribute, or the gamepad can't reach them.
  - Check touch layouts in landscape on small screens.
- **Saves:** stored in localStorage under `neon-dungeon-save-v1`, one slot per class (`G.save.slots[cls]`). Settings are under `neon-dungeon-settings-v1`.
  - When you add a character field, backfill it in `sanitizeChar()` in `main.js` so old saves keep loading.
  - Check that cloud merge in `sync.js` (`mergeChar`, `progressOf`) still treats the field correctly.
  - Never change the key names; that would wipe players' progress.
- **Cloud sync:**
  - Uses the OAuth implicit redirect flow with only the public Client ID in code. Never add a client secret, and there is no backend.
  - The redirect URI comes from `location`, so it must be registered in the Google OAuth client. Sign-in only works on authorized origins.
  - Merging must never lose progress: the most advanced character wins per class, and the best item wins per equip slot.
- **Code style:** 2-space indentation, single quotes, semicolons. Long lines are fine. Code comments are in **Portuguese**; keep that.
- **Commit messages are in Portuguese:** a short summary of the player-visible change (see `git log`).
- **Keep public docs in sync with content changes.** When you add or remove classes, bosses, biomes or enemies, update:
  - `README.md` (English) tables and counts.
  - The meta/og descriptions in `index.html` (they say "7 classes, 7 chefes, 10 biomas").
  - The counts baked into `img/og-image.png` (needs regenerating).
