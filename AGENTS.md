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
- Debug mode: add `?debug` to the URL (e.g. `?debug&lang=pt`, also works on the live site). The pause menu gets a "🐞 Debug: events" button that lists every floor event; picking one rebuilds the floor with only that event and puts the player 3m from it (max floor reached is kept).

Debug handles in the console (set at the end of `boot()` in `js/main.js`):
- `window.__G`: the global state `G`.
- `window.__classes`: `CLASSES`.
- `window.__dbg`: `spawnEnemy`, `spawnPet`, `nextFloor`, `startFloor`, `debugEvent(kind)` (same as the debug panel, e.g. `'ball'`), `makeItem`, `spawnPickup`, `spawnChest`, `findPath`, `lineOfSight`, `Input`, `refresh` (recomputes player stats).
- `__dbg.sim(seconds, onStep)`: runs game logic without rendering, for automated checks.

## Verifying changes

There are no automated tests. **Every feature must be checked in two browsers before committing: desktop and mobile.** A change that only looks right on desktop is not done (example of a past miss: the touch skill buttons covered the mission texts in the HUD; a mobile screenshot plus the overlap check would have caught it).

1. **Desktop pass** (1600×1000, keyboard+mouse): play the change, take a screenshot, check it with a gamepad too (fake one over CDP, see Testing tips).
2. **Mobile pass** (touch mode, landscape small phone): emulate at least **667×375** and **740×360** with `mobile: true` and touch emulation, call `setTouchMode()` (or dispatch a touch), and take a screenshot of the HUD **with the feature on screen** (mission/event active, boss bar, toasts, panels open). Also look at **portrait** (the rotate overlay must show) and a tablet size (1024×768).
3. **Look at the screenshots yourself** (Read the PNG). Don't trust that "no errors" means it looks right.

What to check in both passes (mobile especially):

- **Nothing overlaps:** no button, joystick, skill button, minimap or bar on top of text (mission/event HUD, `#run-info`, toasts, banners, interact prompt, boss bar, combo, item cards). Run the overlap checker from [Testing tips](docs/ARCHITECTURE.md#layout-checks-overlap-and-overflow) and fix every hit it reports for the new/changed elements.
- **Nothing off-screen or clipped:** text fits its box (no cut words, no `...` hiding info), panels scroll when taller than the screen, nothing hides behind the notch (`--safe-*` insets).
- **Long text:** check both languages (`?lang=pt` is usually longer than `en`) and the worst case (big numbers, long item/enemy names, several missions at once, Abyss row visible).
- **Tap targets:** touch buttons at least ~40px and not stacked on each other; every new button reachable and working with a tap.
- **Gamepad:** every new menu element has `data-nav`, focus is visible, `{B}` closes the panel, glyphs render (`padText`).
- **No console errors:** listen to `Runtime.exceptionThrown` and `console.error` during both passes.
- **Performance on mobile:** no new per-frame allocations or extra draw calls; the game still feels smooth with phone quality settings.
- **Saves:** if the change touches the character or items, reload the page and continue the run (old saves must still load, see `sanitizeChar`).

Tools:

- Headless screenshots: `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --screenshot=out.png --window-size=1600,1000 http://127.0.0.1:8000/`. Save screenshots outside the repo or in the root (root `*.png` files are gitignored).
- Scripted checks: run headless Edge with `--remote-debugging-port=9333` and drive it over the Chrome DevTools Protocol with Node's built-in `WebSocket` (Node 22+, no puppeteer needed). Use `Runtime.evaluate` to `import('/js/main.js')`, call `startGame('blade', true)` and inspect `window.__G`. See [Testing tips](docs/ARCHITECTURE.md#testing-tips) for the mobile emulation, overlap checker, gamepad and frame-stepping tricks.
- Serve with `-c-1` (no cache) while testing, or the browser keeps old modules.
- In the final report, say which passes ran (desktop / mobile sizes / gamepad) and what the overlap checker found.

## Deploy: always report when the Pages build is live

**Default workflow:** when a change is done, commit it and push to `main` without asking (commit message in Portuguese, see Conventions). Then wait for the Pages build and report it as below.

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
docs/                 ARCHITECTURE.md, CONTENT.md and screenshots/ (used by README.md and as reference, not loaded by the game)
js/                   game modules (see below)
tools/                dev-only scripts, not loaded by the game: balance.mjs + balance-page.js (balance report, see docs/ARCHITECTURE.md#balance-report)
vendor/three/         Three.js r160 + the postprocessing addons in use. Don't edit; copy new addons from r160 with their deps
web.config            IIS Express settings for Visual Studio (ignored by Pages)
```

Module map (`js/`):

| Module | What it owns |
|---|---|
| `main.js` | Entry point. Renderer, bloom, camera, game loop (`frame` → `logic(dt)`), floor lifecycle (`buildFloor` / `startFloor` / `nextFloor`), `startGame`, `sanitizeChar`, save/load, `boot()`. |
| `state.js` | The shared global object `G`, `TILE`, `GLOW` and `gk()`. |
| `dungeon.js` | `THEMES` (33 biomes), `themeFor(floor)`, `BOSS_EVERY` / `FINAL_FLOOR`, layout generators (`rooms`, `cave`, `meadow`, `sewer`, `grid`, `market`), floor/wall meshes, collision, flow field, A*. |
| `biomes.js` | Biome features (`FEAT` floor tiles, hazards, mechanisms, decoration), the merchant and the blacksmith. |
| `wilds2.js` | The third wave of wild biomes (aurora, coral, clock, mirrorlake, arcade, mushroom, storm, library, lavafall, garden): strips of aurora light, reef currents and bubbles, gears and clock hands, mirror floor, pinball bumpers, bouncy mushrooms and spores, lightning and rods, trap pages, lava columns, healing lanterns. `wilds.js` delegates to it (`placeWild2`, `wildGround2`, `buildWilds2`, `updateWilds2`) and exports the shared helpers (`blobs`, `spots`, `layer`, `lam`, `basic`...). |
| `wilds.js` | The 10 "wild" biomes (bones, glass, starswamp, hive, stonesea, armory, titan, ashwinter, uprain, salt): their floor tiles (`FEAT` 15+), placement, instanced meshes, breakable props, and runtime rules (shattering glass, tides, updrafts, sentinels, breath/heartbeat, gusts). |
| `classes.js` | `CLASSES` (10 classes), `CLASS_ORDER`, passives, the shared Teleport skill, `SKILL_FN` (skill logic) and the inline-SVG `ICONS`. |
| `mythtree.js` | The last two rows of every skill tree: 5 mythic attacks (`myth`, levels 104–136) and 5 mythic defenses (`ward`, levels 108–140) per class, built from archetype tables (`ATK`, `WRD`) with the `myth()` / `ward()` / `wardP()` helpers. Appended to `CLASSES[cls].skills` after everything else. |
| `powers.js` | Advanced tree powers: summons, orbitals, black holes, storms, transformations. |
| `player.js` | The player entity, `newCharacter`, `computeStats`, XP/levels, skill use. |
| `enemies.js` | `ETYPES` (enemy types), AI, elites and affixes, `DIFFICULTY`, `populateFloor`, bosses (`BOSS_ORDER`, one update function per boss) and the final battle. |
| `enemies2.js` | The 15 newer enemies (Mirror Drone, Gravitator, Data Reaper, Builder, Fly Swarm and the fauna of the newer biomes): `aiNew` (extra AI, called from the `default:` of the AI switch), `preDamage` / `postDamage` / `reflectShot` hooks used by `combat.js`, `tickExtras` (ink overlay `#ink`), `tickVisual`. Types with `x2: true` in `ETYPES` get the visual and damage hooks; models are `newEnemyModel` in `models.js`. |
| `combat.js` | Damage (`hitEnemy`, `damageEnemy`, `damagePlayer`), statuses, projectiles, hazards, turrets. |
| `items.js` | Slots, rarities, affixes, legendary and mythic powers, `makeItem`, forging, `itemScore`, item cards. |
| `loot.js` | Ground loot, pickups, chests, shrines. |
| `gems.js` | Gems: the 6 kinds and 7 tiers (`GEMS`), drops (`dropGems`), the pouch `c.gems`, sockets per equip slot `c.sockets`, fusion and `gemMods` (stats into `computeStats`). |
| `mythic.js` | Runtime effects of mythic items (orbital laser, phantom blades, reaper, singularity, phoenix, avatar). |
| `finale.js` | True-ending cinematic after beating the Inferno: 2D canvas in the `#finale` overlay, its own theme song (`ANTHEM` in `music.js`). |
| `run.js` | Per-floor events: anomalies, contracts, challenge rifts, kill combo, floor-clear bonus, implants, tiers (Nightmare/Inferno, New Game+). |
| `events.js` | Floor puzzles and challenges (terminals, light floor, laser prisms, upload, time bomb, wanted, shard hunt, prisoner, neon circuit, lost signal, corrupted servers, drone escort, memory pairs, secret room, slot machine). |
| `events2.js` | The newer floor events (Energy Boxes, Plumbing, Giant Keyboard, Scales, Light Maze, Collapsing Bridge, Paint the Floor, Hide and Seek, Living Statues, Neon Cannon and the batches after them). Same `KIND` contract as `events.js`; exports `NEW_KIND`, `NEW_INFO`, `NEW_IDS`, `NEW_TIMED`, which `events.js` merges into `KIND`, `EVENT_INFO`, `MAIN_EVENTS` and `TIMED`. It imports the shared helpers back from `events.js` (circular, runtime only). |
| `pets.js` | Decorative pets that wander each biome. |
| `models.js` | Low-poly models built from primitives (`makePlayerModel`, `makeEnemyModel`, `glowMat`, merged geometry cache). |
| `fx.js` | Particles, rings, beams, floating numbers. |
| `audio.js` | WebAudio sound effects (`sfx.*`) and music playback. |
| `music.js` | The 7 soundtrack songs and the synth/sequencer. Imports nothing, so it also runs in an `OfflineAudioContext`. |
| `input.js` | Unified keyboard/mouse, gamepad and touch input (`Input`). |
| `padglyphs.js` | Gamepad model detection (Xbox / PlayStation / Switch) and button glyphs (`padText`). |
| `ui.js` | Menus, HUD, inventory, skill tree, shop, forge, minimap, medals screen, gamepad menu navigation. |
| `i18n.js` | Language detection, `L()`, the `DICT` for `index.html`, `translateDom`. |
| `ach.js` | Medals (achievements) and their counters. |
| `sync.js` | Google sign-in and Google Drive cloud save, including the merge. |
| `backup.js` | Character backups (2 automatic copies per class, the one erased by "New", undo of a restore), stored in localStorage and in the cloud. |
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
- **Saves:** stored in localStorage under `neon-dungeon-save-v1`, one slot per class (`G.save.slots[cls]`). Settings are under `neon-dungeon-settings-v1` and backups under `neon-dungeon-backup-v1`.
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
  - The meta/og/twitter descriptions in `index.html` (they say "10 classes ... 7 chefes, 33 biomas, 50 andares").
  - The counts baked into `img/og-image.png` (needs regenerating).
  - `docs/ARCHITECTURE.md` and `docs/CONTENT.md` if the structure or a recipe changed.
