# AGENTS.md

Guide for AI coding agents (and humans) working on this repo. `CLAUDE.md` just imports this file, so keep everything here.

Neon Dungeon is a cyberpunk isometric action RPG that runs in the browser (desktop, mobile and gamepad).
It is built with plain ES modules and Three.js. There is **no build step, no package.json, no bundler, no tests and no linter**.
Live at https://dliedke.github.io/neon-dungeon/. GitHub Pages serves `main` from the repo root, so pushing to `main` deploys.

More docs:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the game works inside (loop, floors, combat, saves, input, UI).
- [docs/CONTENT.md](docs/CONTENT.md): step-by-step recipes for adding classes, skills, enemies, bosses, biomes, items, medals, sounds and more.

## Running

ES modules need HTTP, so `file://` won't work. Serve the repo root:

- `npx http-server -p 8000 -c-1` (Python isn't installed on this machine; elsewhere `python3 -m http.server 8000` works too).
- Visual Studio: open `neon-dungeon.sln` and press F5. This runs IIS Express on port 8000 using `web.config`, which sets the `.webmanifest` and `.js` MIME types. GitHub Pages ignores `web.config`.
- Force a language with `?lang=en` or `?lang=pt`. Otherwise the browser language decides.

Debug handles in the console (set at the end of `boot()` in `js/main.js`):
- `window.__G`: the global state `G`.
- `window.__classes`: `CLASSES`.
- `window.__dbg`: `spawnEnemy`, `spawnPet`, `nextFloor`, `startFloor`, `makeItem`, `spawnPickup`, `spawnChest`, `findPath`, `lineOfSight`, `Input`, `refresh` (recomputes player stats).
- `__dbg.sim(seconds, onStep)`: runs game logic without rendering, for automated checks.

## Verifying changes

There are no automated tests. Check changes in a real browser:

- Play the change with keyboard+mouse, then with a gamepad, then in touch mode (DevTools device emulation, landscape on a small phone).
- Headless screenshots: `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --screenshot=out.png --window-size=1600,1000 http://127.0.0.1:8000/`. Save screenshots outside the repo or in the root (root `*.png` files are gitignored).
- Scripted checks: run headless Edge with `--remote-debugging-port=9333` and drive it over the Chrome DevTools Protocol with Node's built-in `WebSocket` (Node 22+, no puppeteer needed). Use `Runtime.evaluate` to `import('/js/main.js')`, call `startGame('blade', true)` and inspect `window.__G`. See [Testing tips](docs/ARCHITECTURE.md#testing-tips) for the gamepad and frame-stepping tricks.
- Serve with `-c-1` (no cache) while testing, or the browser keeps old modules.

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
img/                  app icons (icon.svg, icon-192/512.png, icon-maskable-512.png; letters are drawn as paths, no fonts) and og-image.png (link preview)
docs/                 ARCHITECTURE.md, CONTENT.md and screenshots/ (reference only, not loaded by the game)
js/                   game modules (see below)
vendor/three/         Three.js r160 + the postprocessing addons in use. Don't edit; copy new addons from r160 with their deps
web.config            IIS Express settings for Visual Studio (ignored by Pages)
```

Module map (`js/`):

| Module | What it owns |
|---|---|
| `main.js` | Entry point. Renderer, bloom, camera, game loop (`frame` → `logic(dt)`), floor lifecycle (`buildFloor` / `startFloor` / `nextFloor`), `startGame`, `sanitizeChar`, save/load, `boot()`. |
| `state.js` | The shared global object `G`, `TILE`, `GLOW` and `gk()`. |
| `dungeon.js` | `THEMES` (13 biomes), `themeFor(floor)`, `BOSS_EVERY` / `FINAL_FLOOR`, layout generators (`rooms`, `cave`, `meadow`, `sewer`, `grid`, `market`), floor/wall meshes, collision, flow field, A*. |
| `biomes.js` | Biome features (`FEAT` floor tiles, hazards, mechanisms, decoration), the merchant and the blacksmith. |
| `classes.js` | `CLASSES` (10 classes), `CLASS_ORDER`, passives, the shared Teleport skill, `SKILL_FN` (skill logic) and the inline-SVG `ICONS`. |
| `powers.js` | Advanced tree powers: summons, orbitals, black holes, storms, transformations. |
| `player.js` | The player entity, `newCharacter`, `computeStats`, XP/levels, skill use. |
| `enemies.js` | `ETYPES` (enemy types), AI, elites and affixes, `DIFFICULTY`, `populateFloor`, bosses (`BOSS_ORDER`, one update function per boss) and the final battle. |
| `combat.js` | Damage (`hitEnemy`, `damageEnemy`, `damagePlayer`), statuses, projectiles, hazards, turrets. |
| `items.js` | Slots, rarities, affixes, legendary and mythic powers, `makeItem`, forging, `itemScore`, item cards. |
| `loot.js` | Ground loot, pickups, chests, shrines, `INV_SIZE`. |
| `mythic.js` | Runtime effects of mythic items (orbital laser, phantom blades, reaper, singularity, phoenix, avatar). |
| `finale.js` | True-ending cinematic after beating the Inferno: 2D canvas in the `#finale` overlay, its own theme song (`ANTHEM` in `music.js`). |
| `run.js` | Per-floor events: anomalies, contracts, challenge rifts, kill combo, floor-clear bonus, implants, tiers (Nightmare/Inferno, New Game+). |
| `events.js` | Floor puzzles and challenges (terminals, light floor, laser prisms, upload, time bomb, wanted, shard hunt, prisoner, secret room, slot machine). |
| `pets.js` | Decorative pets that wander each biome. |
| `models.js` | Low-poly models built from primitives (`makePlayerModel`, `makeEnemyModel`, `glowMat`, merged geometry cache). |
| `fx.js` | Particles, rings, beams, floating numbers. |
| `audio.js` | WebAudio sound effects (`sfx.*`) and music playback. |
| `music.js` | The 5 soundtrack songs and the synth/sequencer. Imports nothing, so it also runs in an `OfflineAudioContext`. |
| `input.js` | Unified keyboard/mouse, gamepad and touch input (`Input`). |
| `padglyphs.js` | Gamepad model detection (Xbox / PlayStation / Switch) and button glyphs (`padText`). |
| `ui.js` | Menus, HUD, inventory, skill tree, shop, forge, minimap, medals screen, gamepad menu navigation. |
| `i18n.js` | Language detection, `L()`, the `DICT` for `index.html`, `translateDom`. |
| `ach.js` | Medals (achievements) and their counters. |
| `sync.js` | Google sign-in and Google Drive cloud save, including the merge. |
| `utils.js` | Random, math and formatting helpers. |

## Conventions and gotchas

- **All content is procedural.** Models come from Three.js primitives, sounds and music are synthesized, and icons are inline SVG path strings. Don't add external art, audio or model files. The only image files are the app icons and the og image.
- **Global state:** modules share state through `G` (from `state.js`) instead of passing it around. Modules import each other circularly (e.g. combat ↔ enemies ↔ ui). That works because imports are only used at runtime, so **never call an imported function at module top level**. Data tables built from other modules (like the medal list) are built lazily.
- **Neon glow:** emissive intensities above 1 create bloom. Pass them through `gk(k)` (or `glowMat` in `models.js`) so the global `GLOW` factor applies.
- **Every user-facing string is bilingual (pt-BR + en):**
  - In JS, use `L('português', 'english')`.
  - In `index.html`, use `data-i18n`, `data-i18n-html` or `data-i18n-title` keys, defined in the `DICT` in `i18n.js`.
  - Gamepad button placeholders like `{A}`, `{LB}`, `{RT}` and `{START}` go through `padText` / `data-pad-text` so they render as the right glyph for Xbox, PlayStation or Switch.
- **Every input method must work: keyboard+mouse, gamepad and touch.**
  - Menu elements must have the `data-nav` attribute, or the gamepad can't reach them.
  - New panels must be added to `PANEL_ORDER` in `ui.js` (the topmost open panel gets gamepad focus) and close with `{B}`.
  - Check touch layouts in landscape on small screens.
- **Saves:** stored in localStorage under `neon-dungeon-save-v1`, one slot per class (`G.save.slots[cls]`). Settings are under `neon-dungeon-settings-v1`.
  - **Never change the key names**; that would wipe players' progress.
  - When you add a character field, backfill it in `sanitizeChar()` in `main.js` so old saves keep loading.
  - Check that cloud merge in `sync.js` (`mergeChar`, `progressOf`) still treats the field correctly.
  - **Skill indices are save data.** `c.skills[i]` and `c.slots` store positions in `CLASSES[cls].skills`. Only append new skills at the end, never insert or reorder (that's why Teleport is pushed last).
  - Item fields travel with the item (e.g. `fav`, `leg`, `myth`, `plus`). A missing field must mean the old default.
- **Cloud sync:**
  - Uses the OAuth implicit redirect flow with only the public Client ID in code. **Never add a client secret**, and there is no backend.
  - The redirect URI comes from `location`, so it must be registered in the Google OAuth client. Sign-in only works on authorized origins.
  - Merging must never lose progress: the most advanced character wins per class, and the best item wins per equip slot. Medal counters are per device and summed; sets and unlocks are unioned.
- **Performance:** the game must run on phones. Reuse geometries and materials (`merged()`, cached geometries in `models.js`), avoid per-frame allocations in hot loops, and keep draw calls low.
- **Code style:** 2-space indentation, single quotes, semicolons. Long lines are fine. Code comments are in **Portuguese**; keep that.
- **Commit messages are in Portuguese:** a short summary of the player-visible change (see `git log`).
- **Keep public docs in sync with content changes.** When you add or remove classes, bosses, biomes, enemies or features, update:
  - `README.md` (English) tables and counts.
  - The meta/og/twitter descriptions in `index.html` (they say "10 classes ... 7 chefes, 13 biomas, 30 andares").
  - The counts baked into `img/og-image.png` (needs regenerating).
  - `docs/ARCHITECTURE.md` and `docs/CONTENT.md` if the structure or a recipe changed.
