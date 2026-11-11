# Architecture

How Neon Dungeon works inside. For conventions and the deploy routine see [AGENTS.md](../AGENTS.md). For step-by-step recipes see [CONTENT.md](CONTENT.md).

## Big picture

- A single page (`index.html`) holds all HUD and menu markup. The 3D scene renders into `<canvas id="game">` beneath it.
- `index.html` has an importmap that maps `three` to `vendor/three/`. Everything else is plain ES modules in `js/`, loaded from `js/main.js`.
- There is no server code. Saves live in localStorage and, optionally, in the player's own Google Drive (`sync.js`).
- Everything is generated in code: maps, 3D models, particles, icons (inline SVG), sound effects and music.

### Module dependencies

Modules import each other freely, including cycles (`combat` ↔ `enemies` ↔ `ui` ↔ `player` …). ES modules allow that as long as no imported binding is used while modules are still evaluating. So:

- Module top level may only define things: constants, tables, functions.
- Calls into other modules happen inside functions that run after `boot()`.
- Tables that need data from other modules are built lazily on first use (e.g. `achList()` in `ach.js`).
- Translated names are fine at top level (`L()` from `i18n.js` has no dependencies).

`music.js` is the only leaf module: it imports nothing and gets the `AudioContext` and an output node as arguments.

## Global state (`state.js`)

`G` is the single shared object. The important fields:

| Field | Meaning |
|---|---|
| `mode` | Current screen. See [Modes](#modes). |
| `t` | Game clock in seconds (only advances while frames run). |
| `scene`, `camera`, `renderer`, `composer`, `bloom` | Three.js objects. |
| `world` | `THREE.Group` holding everything that belongs to the current floor. `clearWorld()` drops it. |
| `dungeon`, `theme`, `floor` | Current map object, biome definition and floor number. |
| `player` | Runtime player entity (position, hp/en, cooldowns `cds[]`, `stats`, `buffs`, model). |
| `char` | The persistent character (what is saved). See [Saves](#saves-and-cloud-sync). |
| `save` | Whole save: `{ v, slots: { [cls]: char }, stats, ach, stash, stashOut }`. `stash` is the shared chest (up to 500 items, all classes; one flat array, sorted best-first and shown in 5 tabs of 100). |
| `settings` | Options (`music`, `sfx`, `track`, `quality`, `shake`, `difficulty`, `glow`, `sv`). |
| `enemies`, `projectiles`, `pickups`, `turrets`, `timers`, `hazards`, `barriers`, `allies`, `orbiters`, `warps`, `lasers`, `holes`, `storms` | Entity lists, updated each logic tick. |
| `boss`, `bosses`, `final` | Active bosses (2 at a time in the final battle) and final-battle state. |
| `anomaly`, `contract`, `clear` | Per-floor run events (`run.js`). |
| `events` | Active floor puzzles and challenges (`events.js`), one object per event with `kind` and `st`. |
| `lastInput`, `padType`, `isTouch` | Which input method is in use (`kb` / `pad` / `touch`) and which gamepad family. |
| `mouseWorld`, `hoverEnemy`, `camFocus` | Mouse ray on the ground, hovered enemy, camera target. |

`TILE` (`WALL`, `FLOOR`, `OBST`, `PIT`) are the map cell values. `gk(k)` scales emissive intensities above 1 by `GLOW`, so the bloom strength can be tuned globally.

## Boot and the frame loop (`main.js`)

`boot()`:

1. If we're coming back from Google sign-in (`syncReadRedirect`), or the saved login expired, handle that first.
2. `translateDom()` applies the `DICT` to `index.html`. Then `loadSave()` reads localStorage.
3. `initRenderer()` creates the WebGL renderer and `EffectComposer` (RenderPass → UnrealBloomPass → OutputPass), a 38° perspective camera, hemisphere + directional lights. Quality and glow come from settings (`applyQuality`).
4. `initFx`, `initInput(canvas)`, `initUI`, `applyVolumes`.
5. `buildFloor(1, false)` builds an empty floor to show behind the main menu, then `showMenu()` and `frame()`.
6. Hooks: save and pause on tab hide, periodic sync token refresh, `setSyncHooks`, debug handles (`window.__G`, `__classes`, `__dbg`).

`frame()` runs on every `requestAnimationFrame`:

```
dt = min(clock delta, 0.05)
Input.update(dt) → handleGlobalInput() → uiPadUpdate() → updateOrientation() → updateMouseWorld()
if mode is play or dying: logic(dt)
HUD, camera, wall fading (updateWalls), fx, floating texts
render (composer when bloom is on)
Input.endFrame()
```

`logic(dt)` is the game simulation, in this order: `updatePlayer` → flow field (every 0.25 s) → `updateEnemies` → `updateProjectiles` → `updateTurrets` → `updateTimers` → `updateHazards` → `updateBarriers` → `updateBiome` → `updatePowers` → `updateDecoy` → `updatePickups` → `updatePets` → `updateMythic` → `updateRun` → `updateExit`. Medal checks run every 1 s and autosave every 20 s.

Delayed actions use `after(seconds, fn)` from `combat.js`. It runs on game time (paused with the game), unlike `setTimeout`.

### Modes

`G.mode` is one of:

| Mode | Meaning |
|---|---|
| `boot` | Before `boot()` finishes. |
| `menu` | Class select / main menu. |
| `play` | In game. Logic runs. |
| `dying` | Death animation. Logic still runs. |
| `dead` | Death screen. |
| `pause`, `char`, `shop`, `forge`, `implant` | Overlays. Logic is paused. |
| `loading` | Elevator fade between floors. |
| `finale` | True-ending cinematic (`finale.js`). The 3D scene is not rendered. |
| `ending` | Ending screen after the final battle. |

## Floors

### Lifecycle

- `startGame(cls, fresh)` loads or creates the character (`newCharacter`), runs `sanitizeChar`, creates the player and calls `resumeFloor(c)` (back to where the player left off, see below) or else `startFloor(c.floor)`.
- `buildFloor(floor)`:
  1. `clearWorld()`.
  2. `themeFor(floor)` picks the biome. `rollAnomaly(floor)` may roll a floor anomaly.
  3. `generateDungeon(floor)` builds the map. `placeFeatures` adds biome tiles and props, then `carveSecret` (`events.js`) may carve a hidden room behind a cracked wall (`d.secret`; `d.hidden` keeps its tiles off the explored map until the wall breaks).
  4. `buildDungeonMeshes` and `buildFeatures` build the meshes. Fog and lights come from `theme.light`; the `dark` anomaly dims them.
  5. `resetMinimap`, `populateFloor` (enemies, chests, shrines, boss, rift, contract, then `setupEvents` for the floor puzzles) and `spawnPets`.
- Every floor is built from a seed (`newSeed` / `seedRandom` in `utils.js`), and each step above reseeds from it, so the same seed always rebuilds the same floor. **Game logic must draw from `rnd`/`rr`/`ri`/`pick`/`chance`/`shuffle` (utils.js); visuals, particles and Three.js stay on `Math.random`.** Never use `sort(() => rnd() - 0.5)` (the number of comparator calls varies) and wrap draws that depend on the player's state in `isolateRandom` (like the shop stock). `G.floorRun` keeps the seed, the initial enemies and statics, and a fingerprint (`floorPrint`).
- Resume: `saveGame` stores `c.here` = `floorSnapshot()` (seed, fingerprint, player position/HP/energy/buffs, HP of each initial enemy, used chests/shrines/rifts, ground loot, explored map as RLE, contract, clear, nest, shop, anomaly, floor events `ev`). `resumeFloor(c)` rebuilds the floor with the same seed, checks the fingerprint and applies the snapshot; if anything doesn't match (old save, generation changed) it returns false and the floor starts fresh. No snapshot on the final floor or while dead.
- `startFloor(floor)` also stores `c.floor` / `c.maxFloor`, places the player at `d.start`, reveals the minimap around it and announces the floor.
- `updateExit` watches the elevator. It stays locked while a boss is alive. Using it calls `nextFloor()`: fade out, `runFloorDone()` (contract and clear rewards), `startFloor(floor + 1)`, heal 25 % HP and give +1 stim if the player has fewer than 3.
- Every `BOSS_EVERY` (3) floors is a boss floor. `FINAL_FLOOR` (30) is the final battle: all 7 bosses in waves of 2. Winning leads to `endGame()` → `showEnding()`. When the win was in the last mode (`tier >= MAX_TIER`, Inferno), `endGame()` first awaits `playFinale()` from `finale.js`: a ~58 s 2D-canvas cinematic in the `#finale` overlay (server → elevator through 90 floors → dawn with fireworks → credits). Skip goes through `uiBack` (`'finale'` is first in `PANEL_ORDER`), so Esc, {B} and the button all work. Then `showEnding({ legend: true })` shows the golden "Neon Legend" screen, and `closeFinale()` hides the overlay. `bestTier > MAX_TIER` marks a legend (👑 on the class card).
- After winning, `startTier(tier)` restarts from floor 1 in Nightmare or Inferno (New Game+), keeping level, items and implants. `replayFinal()` replays floor 30.

### Biomes (`dungeon.js` `THEMES`)

`THEMES` is an array of 23 biomes: neon, forest, factory, snow, meadow, sewer, mountain, space, cryo, desert, volcano, data, market, plus 10 "wild" biomes (bones, glass, starswamp, hive, stonesea, armory, titan, ashwinter, uprain, salt) whose rules live in `wilds.js`. Each entry has:

- `id`, `name`, and the colors `a` (main accent), `b` (second accent), `floor`, `wall`, `fog` and optional `cap` (wall tops).
- `layout`: which generator to use.
- `features`: a list of biome feature keys handled in `biomes.js`.
- `hint`: the tip shown on arrival.
- Optional: `light` (otherwise `NEON_LIGHT`), `ground` (floor texture style), `walls: 'natural'` and `wallH`, `natural`, `sky`, and `fauna` (enemy types that spawn more often there).

`themeFor(floor)` uses `data` for the final floor. Otherwise it reads the hand-ordered `FLOOR_THEMES` table (every biome shows up at least once in floors 1–29, mixing tech and wild ones), falling back to `THEMES[(floor - 1) % n]`.

### Map generation

`generateDungeon(floor)` retries `tryGenerate` until it gets a connected map. Width is `min(46 + floor * 3, 92)` (+6 for markets). Layouts:

| `layout` | Generator |
|---|---|
| `rooms` | `genRooms`: rectangular rooms and corridors. |
| `sewer` | `genRooms` with wide corridors and small rooms. |
| `market` | `genRooms` with 5 big plazas and wide streets. |
| `cave` | `genCave`: cellular-automata caves. |
| `meadow` | `genCave(0.64)`: open fields. |
| `grid` | `genGrid`: data-center blocks. |

The map object is `d = { W, H, grid: Uint8Array, rooms, floor, layout, start, exitRoom, exit, props, meshes }`. `biomes.js` adds `d.feat` (a `FEAT` value per tile: sludge, ice, conveyors, thorns, radiation, lava, snow, plus decorative obstacles 9+; the wild biomes add 15+: marrow, glass, shards, resin, veins, embers, gravity craters and tides, plus their own obstacles). The exit goes in the room farthest from the start (BFS).

Navigation helpers:

- `computeFlow` builds a flow field toward the player every 0.25 s. Enemies follow `flowDir`.
- `findPath` is 8-direction A* with line-of-sight smoothing (click-to-move).
- `resolveCircle` handles collision against walls. `lineOfSight` / `blocksSight` handle vision (pits don't block sight or shots).
- `revealAround` reveals the minimap fog.

`biomes.js` then runs `placeFeatures(d, theme)` (data), `buildFeatures(d, theme, group)` (meshes) and `updateBiome(dt)` (hazards: electric puddles, presses, laser grids, geysers, rockfall, airlocks, cryo vents, weather). On wild biomes (`d.wild`) it delegates to `wilds.js`: `placeWild`, `buildWilds` (instanced tile layers in `d.biome.wild`), `updateWilds` and `wildGround` (floor effects for `FEAT` 15+). `wildPopulate` adds breakable props (bone piles, salt crystals: inert 1-HP enemies with `breakable: true`) and hive sentinels; `combat.js` calls `wildBlast` on explosions (shatter glass, burn resin, wake the sleeping god), `wildKill` on deaths and `projZone` for projectiles (slow in craters, blocked by updrafts). It also places the merchant (`refreshShopStock`), the shared stash (`placeStash`, a few steps from the start of every floor) and then the blacksmith (on every floor; `placeSmithAtStart` puts him next to the stash, outside the arena, falling back to near the start or a random room). `npcNear(d, x, z, r)` keeps rifts, shrines and chests away from all three. None of them opens by proximity: `updateNpcInteract` shows the `#interact` prompt above the closest one in range, and the `interact` input action (Enter, pad {A} when no enemy is close, or tapping/clicking the prompt) opens it. Clicking the NPC with the mouse (`G.hoverNpc`, computed in `updateMouseWorld`) sets `p.npcGo` and walks there; it opens on arrival.

## Entities

### Player (`player.js`)

- `newCharacter(cls)` creates the saved character.
- `createPlayer()` creates the runtime entity and model. `refreshStats()` recomputes `p.stats = computeStats(G.char)` after anything changes (gear, level, skills, implants).
- `computeStats` adds up: class `base` + level scaling + equipped items (armor, weapon damage, affixes, `legs` / `myths` sets) + passive skills (`passiveMods`) + implants (`implantMods`) − difficulty, then applies the caps (crit 75 %, CDR 40 %, life steal 20 %, dodge 25 %, damage reduction 30 %).
- `updatePlayer(dt)` handles movement (keys, stick, click-to-move path, touch joystick), the attack button `primary` (the basic attack `SKILL_FN[skills[0].id]`, or the power in `c.atk`, retried while held), skill slots `s1`..`s7` (a slot holding `0` fires the basic attack while held) (`tryUseSkill`: checks rank, cooldown and energy, then calls `SKILL_FN[id](p, rank)`; returning `false` means "couldn't use, refund"), stims, regen, buffs and statuses.
- `gainXp`, `spendPoint` (up to `MAX_RANK` = 20, in `classes.js`), `refundSkill` (gives back every point of one power, including the free rank 1 of the basic attack and the first power, locks it and clears its button; if it was on the attack button, the basic attack goes back there, and with the basic attack locked the attack button is empty), `assignSlot(slot, i)` (slot `-1` is the attack button; a power already on another button swaps places), `skillReq`, `skillCost`, `skillCd`. `MAX_LEVEL` is `Infinity`, so there is no level cap (`xpNeeded(lvl) = 45 × lvl^1.5`). `SLOT_N` = 7 skill-bar slots (plus the basic attack = 8 actions, one per gamepad button: A, X, Y, B, LB, RB, LT, RT). In `computeStats`, levels above 50 count half (effective level `50 + (level − 50) × 0.5`), so the stats keep growing without running away.
- Timed defensive buffs used by the advanced powers: `p.buffs.guard` (damage taken × `p.guardK`, applied in `damagePlayer`), `p.buffs.mend` (heals `p.mendRate` × max HP per second in the regen step), `p.buffs.evade` (+`p.evadeK` dodge %) and `p.buffs.leech` (+10 life steal). `p.aura` (`{ t, tick, r, mult, color, burn, slow }`) is a damage aura around the player, ticked every 0.5 s by `updateAura` (`classes.js`); it is cleared on floor start and death.

### Classes and skills (`classes.js`, `powers.js`)

- `CLASSES[id]` holds `name`, `title`, `desc`, colors (`css`, `accent`), `melee`, `range`, `base` stats, `weaponNames` and `skills`.
- Each class has 9 active skills, then 3 passives (`PASSIVES`, built with the `passive()` helper; `mods(rank)` returns stat bonuses), then the shared Teleport (`warp`), then 3 advanced passives (`LATE_PASSIVES`, marked `late: true`, levels 20/28/36), then 4 advanced powers (`ADV_POWERS`, built with the `adv()` helper and marked `adv: true`, levels 40/50/60/70: attack, defense, attack, defense). The Netrunner has its own teleport, so it has 19 skills instead of 20.
- `skills[0]` is the primary attack (free, no cooldown). `skills[1]` starts unlocked.
- The skill tree layout (which index goes in which row) is `TIERS` in `ui.js`. A skill's `req` is the level needed. The last two rows find their skills by the `late` and `adv` flags instead of fixed indices.
- Skill logic lives in `SKILL_FN`, keyed by skill `id`, extended by `Object.assign(SKILL_FN, {...})` blocks. Big reusable powers (summons, orbitals, black holes, storms, transformations) are in `powers.js`.
- `ICONS` holds inline-SVG path strings on a 32×32 viewBox.

### Enemies and bosses (`enemies.js`)

- `ETYPES[type]`: `name`, `hp`, `dmg`, `speed`, `r` (radius), `h` (height), `xp`, `minFloor`, `weight` (spawn weight), `ai`, `range`, `atkCd`, `blood` (particle color). Optional: `fly`, `keep: [min, max]` (preferred distance), `proj: { speed, color, size }`, `burst`, `solo`, `boss`, `heavy` (no knockback), `inert`, `static`, `blink`, `shield`.
- `floorScale(f)` and `DIFFICULTY` scale HP and damage. `DIFF_ORDER` has 9 levels (easy → death). The settings save the key (not the position), so renaming a key needs a migration in `loadSave`, like settings `sv` 4, which turned the old `brutal` → `vhard` and `insane` → `brutal`. `setDifficulty(key)` changes it live and rescales living enemies. `rewardK('cr' | 'loot')` gives the reward multipliers used by `dropLoot`. They ramp up 1 level per 15 s after raising the difficulty (`tickReward`) and drop instantly when lowering it. `rewardRank()` is that ramped level; `diffIlvl()` turns it into the item level bonus (Chaos +10, Apocalypse +20, Death +30), and `divChance` uses it too. Tiers add an effective floor offset (`TIERS[t].off`) and multiply HP and damage (`TIERS[t].hp` / `.dmg`).
- `pickEnemyType` picks by weight from types with `minFloor <= floor`, strongly favoring `theme.fauna`. In natural biomes (`natural: true`) the other types drop to 20 % weight.
- `spawnEnemy(type, x, z, { elite, decoy, anomaly })` builds the model (`makeEnemyModel`) and applies elite affixes (`ELITE`) and anomaly modifiers.
- Elites get 1, 2 or 3 affixes depending on the effective floor (2 from 14, 3 from 26).
- `populateFloor(d, floor, boss)` spends a budget across rooms, adds chests, shrines and barrels, sets up floor events and spawns the boss.
- `updateEnemies(dt)` moves each enemy along the flow field (or straight when it has line of sight), handles statuses and dispatches on `e.T.ai` (`melee`, `ranged`, `bomber`, `sentry`, `sniper`, `ninja`, …).
- Bosses: `BOSS_ORDER = ['boss', 'queen', 'scrap', 'reaper', 'gunship', 'hacker', 'omega']`. The boss on floor `f` is `BOSS_ORDER[(round(f / 3) - 1) % 7]`, getting tougher each lap (`II`, `III`…). Each has its own update function (`updateBoss`, `updateQueen`, `updateScrap`, `updateReaper`, `updateGunship`, `updateHackerBoss`, `updateOmega` + `updatePylon`). `startBoss` shows the bar and the `BOSS_SUB` subtitle.
- Kills go through `killEnemy` (`combat.js`) → `onEnemyKilled` (XP, loot, medals, `runKill`, mythic on-kill).

### Combat (`combat.js`)

Hit pipeline for player damage:

```
hitEnemy(e, mult, opts)
  → playerDamageRoll(mult)           weapon roll × dmgPct × buffs (fury, avatar, forms) + crit
  → passives (eliteDmg, lowHpDmg, chillDmg) × mythDmgMult(e)
  → damageEnemy(e, amount, crit)     armor/shield, floating number, hit flash, death → killEnemy
  → life steal (capped per second by `capHeal`, like kill heals), energy on hit, applyStatus (burn, chill, freeze, stun…)
  → legendary procs ('arc' chain lightning) → mythOnHit
```

- In `damageEnemy`, the enemy's damage reductions (`e.dr` from Armored elites or the Behemoth, and the Warden ring `wardT`, which only covers non-elite enemies) multiply together but are capped at 60 % total. The Riot Trooper's front shield block is separate.
- `damagePlayer(amount)` applies armor, dodge, damage reduction, shields and the phoenix save (`mythSave`).
- Area helpers: `enemiesInRadius`, `enemiesInCone`, `nearestEnemy`, `explosion`, `chainFrom`.
- Other entities: projectiles (`spawnProjectile`, `lob`), ground hazards, turrets, barriers and the decoy.

## Items and loot (`items.js`, `loot.js`, `mythic.js`)

- Slots: `weapon`, `head`, `chest`, `hands`, `feet`, `chip`.
- Rarities (`RARITY`, index 0–5): Common, Modded, Rare, Prototype, Mythic (`MYTHIC`), Divine (`DIVINE`). Each sets the affix count `n` and the stat multiplier `mult`.
- `makeItem({ ilvl, rarity, slot, cls })` returns `{ uid, slot, rarity, ilvl, affixes, bi, si, … }`. Weapons also get `cls`, `wMin` and `wMax`; armor gets `armor`. Prototypes get a legendary power `leg` (`LEGENDARIES`), Mythics a mythic power `myth` (`MYTHICS`). Divine items get a random `myth` plus `div`, the divine power of their slot (`DIVINES`, one per slot; `DIV_SET` is the 6-piece bonus). `computeStats` collects them in `p.stats.divs`.
- Optional item fields: `plus` (forge level) with `base` (the pre-forge stats that `forgeItem` scales from; every 4th level adds or boosts an affix), and `fav` (favorite, protected from recycling).
- `itemScore` ranks items. `isUpgrade` (more than 3 % better than equipped) drives the ▲ marker and the shop stock.
- `loot.js`: `dropLoot`, `spawnPickup` (items, credits, orbs), `spawnChest`, shrines (`SHRINES`, timed buffs in `p.buffs`) and `INV_SIZE` (50).
- Divine drops: `divChance` in `loot.js` (0 below Apocalypse, except Brutal+ in Nightmare/Inferno; needs effective floor 10).
- `mythic.js` runs the mythic and divine powers each frame and hooks into hits (`mythOnHit`, `divOnHit`), kills, damage taken (`divBlock` before armor, `divAmbrosia` after the hit) and death.

## Run events (`run.js`)

- **Anomalies** (`ANOMALIES`): one optional modifier per normal floor. Code reads it with `amod(key, default)`. Keys include `count`, `elite`, `hp`, `dmg`, `speed`, `xp`, `credits`, `loot`, `orbs`, `pdmg`, `taken`, `cd`, `regen`, `killHeal`, `explode`, `giant` and `dark`.
- **Contracts**: optional floor goals (`rollContract`), paid out in `runFloorDone`.
- **Challenge rifts**: `spawnRift`, a timed arena with a reward.
- **Nest** (`spawnNest` / `wakeNest` / `nestDown` in `enemies.js`, state in `G.nest`): a packed room whose enemies (`e.nest`) all wake together; clearing it drops a chest.
- **Kill combo** (`runKill`) and the **floor-clear bonus** (`clearBonus = (150 + floor × 40) × (1 + tier × 0.5)`).
- **Implants** (`IMPLANTS`): pick one of three after each boss. `bossReward()` keys them by `floor + 100 × tier`, so each tier grants its own. `implantMods(c)` feeds `computeStats`.
- **Floor events**: see [Floor events](#floor-events-eventsjs) below.
- **Tiers** (`TIERS`): Normal, Nightmare and Inferno, with floor offset (30 / 60, so each mode continues where the previous one ended), enemy HP and damage multipliers, and loot, credits and elite bonuses.

## Floor events (`events.js`)

Puzzles and challenges. Each floor gets up to two main events (`MAIN_EVENTS`: terminals, lights, prisms, upload, bomb, wanted, shards, prisoner, relay, signal, servers, escort, pairs) and one small event (secret room or slot machine). They start on floor 2 and never appear on boss floors or the final floor.

- Each kind is an object registered in `KIND`:
  - `setup(d, floor, rooms)` builds the meshes and returns the event object, or `null` if it doesn't fit.
  - `update(E, dt)`, `hud(E)`, `save(E)` / `load(E, s)` and `intro(E)` (the arrival toast).
  - Optional: `busy(E)` holds the floor-clear check (e.g. during the upload), and `kill(E, e)` reacts to kills.
- `EVENT_INFO[kind]` has the icon, color, name and an optional `short` name for the HUD.
- Resuming rebuilds the same events:
  - `setupEvents` always spends the same random draws, and each setup runs inside `isolateRandom`.
  - `eventsSnapshot()` / `eventsRestore(list)` save and restore their progress in the floor snapshot (`ev`).
  - For testing, calling `eventsResume({ ev: [{ k: kind }] })` before `startFloor` forces a kind.
- Shared helpers: `complete(E, mult, title, sub, x, z)` pays credits, drops loot, counts the medal and saves. `failed(E, msg)` ends the event without a reward.
- Interactive objects are walk-over pads, so every input method works.
- The cracked wall is an enemy with `T.prop` (`crack` in `ETYPES`). It takes 1 damage per hit and gives no XP, loot or kill medals. When it dies, `killEnemy` calls `propBroken`.
- The slot machine is an NPC prop (`type: 'gamble'`) opened through `openNpc` in `biomes.js`.
- The minimap draws the events with `drawEventMarks` and the edge arrows with `eventArrows`.

## Saves and cloud sync

```
localStorage['neon-dungeon-save-v1']     = { v: 1, slots: { blade: char, gunner: char, … }, stats, ach, stash, stashOut }
localStorage['neon-dungeon-settings-v1'] = G.settings
localStorage['neon-dungeon:device']      = random device id (medal counters)
sessionStorage['neon-dungeon-resume']    = class that was playing when the page unloaded (pagehide); boot() resumes it, so a reload goes straight back into the game
```

- The character (`G.char`, saved in `slots[cls]`) holds: `cls`, `level`, `xp`, `credits`, `stims`, `floor`, `maxFloor`, `skills` (rank per skill index), `slots` (`SLOT_N` = 7 skill-bar slots → skill index, `0` = basic attack; `sanitizeChar` pads older saves), `atk` (skill index on the attack button ⚔ / A / big touch button, default `0` = basic attack; it is empty when that is `0` and the basic attack is locked), `skillPoints` (`SP_PER_LEVEL` = 2 per level; `spV` marks saves that already got the retroactive points in `sanitizeChar`), `equip`, `inv`, `kills`, `created`, `wins`, `playTime`, `deaths`, `implants`, `implantFloors`, `implantPending`, `tier`, `bestTier`, `resetAt`, `here` (floor snapshot or null).
- `saveGame()` writes it (autosave every 20 s, on tab hide and after important actions like equipping or leveling), with the floor snapshot `here`, and marks the cloud dirty (`syncDirty(delay)`: 3 min while playing, 4 s elsewhere; an earlier scheduled sync is never postponed). Changing floor, hiding the tab and quitting to the menu sync right away.
- `sanitizeChar(c)` runs on load and is the single place where old saves are upgraded. Backfill every new field there.
- `sync.js` signs in with the Google OAuth implicit flow (public Client ID only) and stores one JSON file in the hidden `appDataFolder` of the user's own Drive (scope `drive.appdata`). `mergeProgress(local, cloud)`:
  - For each class, `mergeChar` keeps the more advanced character by `progressOf` = `[tier, level, maxFloor, kills, xp]`.
  - For each equip slot, it keeps the better item (`itemScore`).
  - `wins`, `playTime`, `deaths` and `bestTier` take the max.
  - Medal counters are per device and summed (`stats.dev`); sets (`stats.sets`) and unlocks (`ach`) are unioned.
  - A "New character" reset (`resetAt`) wins over an older character.
  - Shared stash (`mergeStash`): every stored item carries `st` (when it went in) and every withdrawal is logged in `stashOut[uid]` (when it came out). Items are unioned by uid and an item stays only if it went in after its last withdrawal, so nothing is lost and nothing is duplicated. The merge never trims the stash, even above 100.
- The character in play is never replaced mid-run; merged slots apply when the player returns to the menu.

## Input (`input.js`, `padglyphs.js`)

- `Input.update(dt)` merges four sources (`kb`, `mouse`, `touch`, `pad`) into named actions: `primary`, `s1`..`s7`, `stim`, `inv`, `skills`, `pause`, `map`. Read them with `Input.pressed(action)` (edge) or `Input.held[action]`.
- `Input.move` and `Input.aimStick` are analog vectors. `Input.mouse` has the cursor and `lmbPressed`.
- Menu navigation uses `Input.nav(name)` for `up`, `down`, `left`, `right`, `a`, `b`, `x`, `y`, `lb`, `rb`, `rt`, with key repeat. A `latch` makes sure quick taps that press and release within one frame are still seen.
- `G.lastInput` switches between `kb`, `pad` and `touch`. The body classes and the HUD labels follow it (`refreshKeyLabels`, `refreshPadLabels`).
- `padglyphs.js` detects Xbox / PlayStation (ps4/ps5) / Nintendo from the gamepad id. `padText('{A} Confirm')` renders the right glyphs.
- Touch: a virtual joystick on the canvas and skill buttons bound with `bindTouchButton(el, action)`.

## UI (`ui.js`, `index.html`, `css/style.css`)

- All panels already exist in `index.html` and are shown and hidden with classes. `ui.js` fills them (`renderChar`, `renderClassCards`, `openShop`, `openForge`, `openAch`, …).
- **Gamepad navigation:** `uiPadUpdate()` finds the topmost open panel (`PANEL_ORDER`), moves a `.gp-focus` highlight between `[data-nav]` elements by screen position, and maps `{A}` to click and `{B}` to back (`uiBack`). In the stash `{A}` stores or takes the item. In the character panel `{A}` equips or unequips, `{X}` recycles (or, in the skill tree, cycles the skill's bar slot), `{Y}` is "Recycle all" on the equipment tab, `{LB}`/`{RB}` switch tabs and `{RT}` toggles favorite.
- Feedback: `toast(html, cls, key)` (a `key` replaces the previous toast with the same key), `banner(title, sub)`, `confirmDialog(title, text, onYes)`, `floatText`.
- HUD: `updateHUD(dt)` (bars, skill cooldowns, buffs, minimap), `bossBar()`, `runHud()`, `mythHud()`.
- Layout must work from phone landscape (around 640×360) up to desktop. The `max-width: 760px` and `max-height: 520px` media queries handle small screens.

## i18n (`i18n.js`)

- `LANG` is `pt` or `en`, from `?lang=` or `navigator.language`.
- `L(pt, en)` picks the string. Because `LANG` is fixed at load, tables can call `L()` at module top level.
- `DICT` holds the keys for `index.html` (`data-i18n`, `data-i18n-html`, `data-i18n-title`). `t(key, vars)` reads them from JS.

## Audio (`audio.js`, `music.js`)

- `initAudio()` creates the `AudioContext` on the first user gesture, with `sfxBus` and `musBus` gains (`applyVolumes`).
- `sfx.name()` functions build each sound from `tone({ type, f, f2, dur, vol })` and `noise({ dur, vol, type, f, f2, q })`. `throttle(key, ms)` stops floods of the same sound.
- `music.js` `SONGS` describes each song as data: `bpm`, chord progressions `prog`, drum and bass step patterns, `arp`, `lead` timbre, `mel` melodies (eighth notes, `-` hold, `.` rest) and `secs` (arrangement sections with active layers). `createMusic(ctx, dest, opts)` schedules it. Drums and bass come in during fights.
- `applyTrack()` follows `G.settings.track` (`'shuffle'` or a song index).
- `ANTHEM` (Neon Dawn) is an extra song outside `SONGS`, so it never enters the shuffle or the track option. `playAnthem(true)` fixes it during the true ending; `playAnthem(false)` (the ending-screen buttons) returns to the previous track setting.

## Medals (`ach.js`)

- `achAdd(counter, n)` adds to a per-device counter. `achMark(set, key)` adds to a set. `achKill(e)` records a kill.
- `achList()` builds the medal list lazily: `{ id, icon, tier, name, desc, cur(), goal }`.
- `achCheck()` runs every second and unlocks medals whose `cur() >= goal`, showing `medalPopup`. Unlock times are stored in `G.save.ach[id]`.

## Testing tips

There are no automated tests. The cheapest reliable check is a scripted headless browser:

1. Serve the repo: `npx http-server -p 8123 -s -c-1 .`
2. Start Edge: `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9333 about:blank`
3. From Node 22+, `fetch('http://127.0.0.1:9333/json')`, open the page's `webSocketDebuggerUrl` with the built-in `WebSocket`, and send CDP commands: `Page.navigate`, `Emulation.setDeviceMetricsOverride` (screen size, `mobile: true` for touch), `Runtime.evaluate` (with `awaitPromise` and `returnByValue`) and `Page.captureScreenshot`.
4. Inside `Runtime.evaluate`, import modules directly: `const m = await import('/js/main.js'); m.startGame('blade', true);`, then use `window.__G` and `window.__dbg` (`makeItem`, `spawnEnemy`, `nextFloor`, `sim`).

Gotchas:

- Headless Chrome/Edge throttles `requestAnimationFrame` to about 1 fps, so input that depends on frames seems to be ignored. Step frames by hand: `Input.update(1/60); ui.uiPadUpdate(); Input.endFrame();`.
- To fake a gamepad, replace `navigator.getGamepads` with a function that returns an object with `id`, `mapping: 'standard'`, `axes` and 17 `buttons` (`{ pressed, value }`), then dispatch a `gamepadconnected` event. Standard button indices: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Start, 12–15 D-pad.
- Use `__dbg.sim(seconds)` to run game logic quickly without rendering (balance checks, spawn tests).
- Listen to `Runtime.exceptionThrown` and `Runtime.consoleAPICalled` to catch errors.
- Clean up: saves made by tests stay in that browser profile's localStorage. Use a temporary `--user-data-dir`.
