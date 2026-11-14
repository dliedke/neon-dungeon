# Adding content

Step-by-step recipes for the most common changes. Read [AGENTS.md](../AGENTS.md) first (conventions) and [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit.

Rules that apply to every recipe:

- Every player-visible string is bilingual: `L('português', 'english')` in JS, `DICT` keys in `i18n.js` for `index.html`.
- Comments in Portuguese, commit messages in Portuguese.
- **Keys are save data.** Class ids, skill indices, affix keys, legendary/mythic keys, implant keys and medal ids end up in players' saves. Never rename or remove them. Add new ones instead.
- New menus and buttons need `data-nav` (gamepad) and must work with touch.
- Test with keyboard+mouse, gamepad and a small landscape touch screen. `window.__dbg` helps: `spawnEnemy`, `makeItem`, `startFloor`, `nextFloor`.
- Update the public docs when counts change (see [the checklist](#public-docs-checklist)).

## Contents

- [Class](#class)
- [Skill or passive](#skill-or-passive)
- [Enemy](#enemy)
- [Elite affix](#elite-affix)
- [Boss](#boss)
- [Biome](#biome)
- [Biome feature or hazard](#biome-feature-or-hazard)
- [Item affix](#item-affix)
- [Legendary (Prototype) power](#legendary-prototype-power)
- [Mythic power](#mythic-power) (and divine powers)
- [Anomaly, implant or shrine](#anomaly-implant-or-shrine)
- [Floor event (puzzle or challenge)](#floor-event-puzzle-or-challenge)
- [Medal](#medal)
- [Sound effect](#sound-effect)
- [Song](#song)
- [Pet](#pet)
- [Setting (option)](#setting-option)
- [UI panel](#ui-panel)
- [Character field](#character-field)
- [Public docs checklist](#public-docs-checklist)

## Class

1. **Definition** in `CLASSES` (`js/classes.js`):

   ```js
   newcls: {
     id: 'newcls',
     name: L('Nome', 'Name'),
     title: L('Título', 'Title'),
     desc: L('Descrição curta.', 'Short description.'),
     css: '#00f0ff',          // cor da interface
     accent: 0x00f0ff,        // cor do brilho no modelo e nos efeitos
     melee: false,
     range: 12,               // alcance do ataque básico (corpo a corpo ~1.9)
     base: { hp: 150, en: 100, armor: 10, speed: 5.4, wMin: 10, wMax: 15, enRegen: 8, hpRegen: 1.5, crit: 8, critDmg: 60, atkRate: 3 },
     weaponNames: [L('Arma 1', 'Weapon 1'), /* ... */],
     skills: [ /* 9 habilidades */ ],
   },
   ```

2. **Skills:** exactly 9 active skills. `skills[0]` is the primary attack (`cost: 0, cd: 0`) and `skills[1]` starts unlocked. The rest need `req` (the level needed). The tree rows are fixed in `TIERS` in `ui.js`: index 0–1 (lv 1), 2/3/9/12 (lv 2–4), 4/5/6/10 (lv 5–9), 7/8/11 (lv 12–15). Copy the `req` values of an existing class. Each skill is `{ id, req, name, icon, cost, cd, desc: (rank) => L(...) }`.
3. **Passives:** add 3 entries to `PASSIVES[newcls]` with the `passive(id, req, name, icon, mods)` helper, at `req` 3, 8 and 14. `mods(rank)` returns stat keys that `computeStats` understands (see `PFMT` for the formatted list: `crit`, `critDmg`, `dmgPct`, `hpPct`, `armorPct`, `dodge`, `dmgRed`, `lifeSteal`, `cdr`, `costRed`, `eliteDmg`, `lowHpDmg`, `burnPct`, `chillDmg`, `killHeal`, `killEn`, …).
4. Teleport (`warp`) is appended to every class automatically. Skip it like the Netrunner if the class already has its own teleport.
5. **Advanced passives:** add 3 entries to `LATE_PASSIVES[newcls]` with the `late(id, req, name, icon, mods)` helper, at `req` 20, 28 and 36. They are appended after `warp` with `late: true`, and the last tree row (`late: true` in `TIERS`) finds them by that flag, so their index can differ per class.
5. **Advanced powers:** add 4 entries to `ADV_POWERS[newcls]` with the `adv(id, req, name, icon, cost, cd, desc)` helper, at `req` 40 (attack), 50 (defense), 60 (attack) and 70 (defense). They are appended after the advanced passives with `adv: true`, and the `adv` row in `TIERS` finds them by that flag. Defensive powers can reuse the helpers next to their `SKILL_FN` block: `guard` (less damage taken), `mend` (heal over time), `evade` (dodge), `leech` (life steal), `aura` (damage around you) and `bigHeal`; attacks can use `lineBeam` and `coneBlast`.
5. **Skill logic:** add one function per skill id to `SKILL_FN` (in a new `Object.assign(SKILL_FN, { ... })` block). Skill ids share one flat namespace across all classes, so they must be unique. Signature: `(p, rank) => { ... }`. Return `false` if the skill can't be used right now (no target, etc.) and the energy and cooldown aren't spent. Damage goes through `hitEnemy` / `explosion` / `spawnProjectile({ from: 'player', ... })`. Scale with `rankMult(rank)`. Reuse `powers.js` (summons, orbitals, storms, black holes, transformations) where it fits.
6. **Icons:** new icon keys go in `ICONS` (`classes.js`) as SVG path strings on a 32×32 viewBox, stroke-based like the others.
7. **Model:** in `makePlayerModel(cls, accent)` (`models.js`) add an `if (cls === 'newcls')` block with the weapon and gear on top of the shared `humanoid()` body. If the attack pose differs, add the class to the matching arm-pose branch in `updatePlayer` (`player.js`, around the "attackHold" poses).
8. **Order:** add the id to `CLASS_ORDER` (the class select order). Save slots are keyed by id, so order is free.
9. **Ending:** add an `EPILOGUE[newcls]` line (pt, en) in `ui.js`.
10. **Medals:** `class10_<id>` is generated automatically. Rename the `winAll` medal ("Os Dez Heróis" / "The Ten Heroes") to match the new count, but keep its id.
11. **Docs:** README "Classes" table and counts, the meta descriptions in `index.html`, `img/og-image.png` and AGENTS.md.

Test: pick the class from the menu, use every skill at rank 1 and after leveling (`G.char.level = 15; G.char.skillPoints = 30; __dbg.refresh()`), check the skill tree with the gamepad, and win or lose a boss fight.

## Skill or passive

- **Changing a skill's behavior or numbers:** edit its `SKILL_FN[id]` and its `desc`. The index doesn't change, so saves are fine.
- **Adding a new skill to an existing class:** **append** it to the end of that class's `skills` array (after `warp`), never insert it in the middle. `c.skills[i]` and `c.slots` store indices, so inserting would shift every saved rank. Then add the new index to a row in `TIERS` (`ui.js`); classes that don't have that index just skip it. `sanitizeChar` already pads `c.skills` with zeros.
- **Passives** use `passive: true` and are never placed on the skill bar. Their `mods(rank)` keys are summed in `passiveMods` → `computeStats`. A new stat key must be read somewhere (`computeStats` caps, `combat.js` damage, `player.js`), and needs a formatter in `PFMT`.

## Enemy

1. **Type** in `ETYPES` (`js/enemies.js`):

   ```js
   newfoe: { name: L('Nome', 'Name'), hp: 40, dmg: 8, speed: 3.2, r: 0.38, h: 1.4, xp: 12, minFloor: 4, weight: 5, ai: 'melee', range: 1.0, atkCd: 1.3, blood: 0x00f0ff },
   ```

   - `minFloor` and `weight` control the normal spawn pool. Biome-only fauna uses `minFloor: 99, weight: 0`, so it only spawns where a theme lists it in `fauna`.
   - Ranged types add `range`, `keep: [min, max]`, `proj: { speed, color, size }` and optionally `burst`.
   - Flags: `fly`, `heavy` (no knockback), `static` (doesn't move), `shield`, `blink`, `solo`.
2. **AI:** reuse an existing `ai` (`melee`, `ranged`, `bomber`, `sniper`, `sentry`, `ninja`, …) or add a `case` in the `switch (e.T.ai)` in `updateEnemies`. Telegraph dangerous attacks (`telegraphFx`, `lineTelegraph`) so players can dodge.
3. **Model:** add a `case 'newfoe':` in `makeEnemyModel` (`models.js`). Copy a similar enemy: humanoids use `humanoid()` and expose `armL` / `armR`; animals and machines build their own parts. Return the same shape the others return (`root`, `body`, `mats`, `kind`, …). Extra detail goes in `decorate()` using `part()` (merged geometry, few draw calls). Use `glowMat` for neon parts.
4. **Biome:** to tie it to a biome, add it to that theme's `fauna`.
5. **Medals:** the bestiary medals pick it up automatically (`BESTIARY()` in `ach.js` excludes bosses, barrels, pylons, the thief and the behemoth).
6. **Docs:** README "Enemies" table.

Test: `__dbg.spawnEnemy('newfoe', G.player.x + 4, G.player.z)`, also as an elite: `__dbg.spawnEnemy('newfoe', x, z, { elite: true })`.

## Elite affix

Add an entry to `ELITE` (`enemies.js`): `{ name, color, minF, apply: (e) => { ... } }`. `minF` is the minimum effective floor. `apply` sets fields on the enemy that the update or damage code reads (e.g. `e.dr`, `e.vamp`, `e.explodeOnDeath`), so add that handling too.

## Boss

1. **Type** in `ETYPES` with `boss: true, minFloor: 99, weight: 0, ai: 'newboss'`, high `hp` and `xp`, `heavy: true`.
2. **Update function** `updateNewboss(e, dt, dist, ux, uz)` in `enemies.js` that returns `{ x, z, speed }` (desired movement). Add it to the boss dispatch (the `case 'scrap': case 'reaper': ...` block that maps `ai` → function). Use phases based on `e.hp / e.maxHp`, telegraphs, `spawnProjectile({ from: 'enemy', ... })`, `enemyExplosion` and summons via `spawnEnemy`. Respect `e.tempoK` (the first boss attacks more slowly).
3. **Subtitle:** add a gameplay hint to `BOSS_SUB`.
4. **Order:** add the id to `BOSS_ORDER`. The boss on floor `f` is `BOSS_ORDER[(round(f / 3) - 1) % length]`, and the final battle (floor 30) spawns all of them in waves of 2, with the last pair arriving last (keep `omega` at the end). Changing the order moves which boss appears on which floor for everyone.
5. **Model:** a `case` in `makeEnemyModel` plus `decorate()`. Bosses are big, so check that the camera framing and the health bar look right.
6. **Medals:** `boss_<id>` is automatic. Add an emoji in `BOSS_ICON` (`ach.js`).
7. **Hardcoded "7":** the banner in `startFloor` (`main.js`), the help text in `i18n.js` (`DICT`), the README goal text, and Portuguese comments in `dungeon.js` / `enemies.js`.
8. **Docs:** README "Bosses" table, `index.html` meta ("7 chefes"), `og-image.png` and AGENTS.md.

Test: `__dbg.startFloor(3)` (or any multiple of 3 that maps to the boss), then `__dbg.startFloor(30)` for the final battle.

## Biome

1. **Theme** in `THEMES` (`js/dungeon.js`):

   ```js
   { id: 'newbiome', name: L('Nome', 'Name'), a: 0x00f0ff, b: 0xff2bd6, floor: 0x2a2f4a, wall: 0x1a1d33, fog: 0x07061a,
     layout: 'rooms', features: ['puddles'], fauna: ['newfoe'],
     light: { sky: 0x8a90ff, ground: 0x1a0f2a, hemi: 1.25, dir: 0xd8ccff, dirI: 1.5, fogNear: 22, fogFar: 44 },
     hint: L('Dica do bioma.', 'Biome tip.') },
   ```

   - Outdoor biomes add `ground` (`soil`, `snow`, `grass`, `rock`, `sand`, `ash`, `deck`), `walls: 'natural'`, `wallH: [min, max]`, `cap` (top color) and `natural: true` (prefers fauna, fewer robots).
   - `light` is optional (defaults to `NEON_LIGHT`). Bright outdoor biomes need a light fog color and a stronger `hemi`.
2. **Layout:** use an existing one (`rooms`, `cave`, `meadow`, `sewer`, `grid`, `market`) or add a generator in `dungeon.js` and a branch in `tryGenerate`. The map must stay connected from `start` to `exit` (the generator retries otherwise). The `layout` only applies on open-field floors: every third floor starting at 1 is a small dungeon and every third starting at 3 is a large dungeon, whatever the biome (`floorShape`). Your features must also work in dungeons (3-wide corridors, `hall` rooms, the `plaza` room that must stay clear), and anything carved as `PIT` must go through the `reachable()` check in `carvePits` so no tile that was reachable gets cut off.
3. **Order:** the array position sets where it appears in the floor rotation (`themeFor`). Appending is safe. The final floor always uses `data`.
4. **Pets:** optionally add the biome to `BY_THEME` in `pets.js`.
5. **Medals:** `biomesAll` counts `THEMES.length` automatically.
6. **Docs:** README "Biomes" table, `index.html` meta ("23 biomas"), `og-image.png` and AGENTS.md.

Test: find a floor that maps to the new biome with `themeFor(n)`, or temporarily return it from `themeFor`, then `__dbg.startFloor(n)`. Check it on phone quality settings too (fog and lights matter more there).

## Biome feature or hazard

Features are string keys in a theme's `features` list, implemented in `js/biomes.js` in three places:

1. `placeFeatures(d, theme)`: data. Mark tiles in `d.feat` with a `FEAT` value (add a new number to `FEAT` if needed; 9+ are solid decorative obstacles) or push entries into `d.props`. Keep the start, the exit and the paths between them clear. Lakes and holes are only kept if the map stays connected.
2. `buildFeatures(d, theme, group)`: meshes. Use merged and instanced geometry, since a floor can have hundreds of tiles.
3. `updateBiome(dt, camera)`: behavior. Hazards should warn first (telegraph, sound), then act, and usually affect enemies too. Floor effects on movement go in `groundEffect`.

Then add the key to one or more themes and update that biome's `hint` and the README "Biomes" row.

The 10 wild biomes keep their features in `js/wilds.js` instead (`placeWild`, `buildWilds`, `updateWilds`, `wildGround`); `placeFeatures` falls through to `placeWild` for keys it doesn't know. Follow the same three steps there, using `FEAT` values from 15 up (add new walkable ones to `SAFE_FEAT` in `player.js` if the player may spawn on them).

## Item affix

Add to `AFFIXES` (`js/items.js`): `{ fmt: (v) => L(...), roll: (ilvl) => number, w: weight, slots: [...] }` (`slots` is optional and restricts which slots can roll it).

- `computeStats` adds `it.affixes[key]` into `stats[key]` automatically. Make sure something reads that stat, and add a cap in `computeStats` if it could get out of hand.
- Check `itemScore` if the new stat should count when comparing items (▲ marker, shop, cloud merge).

## Legendary (Prototype) power

1. Add `{ name, desc }` to `LEGENDARIES` (`items.js`). Prototype items pick one at random.
2. Implement the effect where it triggers, checking `p.stats.legs.has('key')` (examples: `arc` in `hitEnemy`, `shield` in `damagePlayer`, `echo` in `tryUseSkill`).
3. README "Loot and progression" list.

## Mythic power

1. Add `{ name, desc }` to `MYTHICS` (`items.js`).
2. Implement it in `js/mythic.js`, checking `p.stats.myths.has('key')`: `updateMythic(dt)` for periodic effects, `mythOnHit`, `mythOnKill`, `mythDmgMult(e)`, `mythSave()` (death prevention) and `mythHud()` for a HUD indicator. Reset per-floor state in `resetMythic()`.
3. README mythic list.

Divine powers work the same way: `DIVINES` in `items.js` has one entry per slot (`slot` decides which items get it), checked with `hasDiv('key')` in `mythic.js`. Pure stat bonuses go in `computeStats` (`player.js`, see `olympus` and `hermes`). Primordial powers too: `PRIMORDIALS` (one per slot) and `hasPrim('key')` in `mythic.js` (hooks `primOnHit`, `primDmgMult`, `primDodge`, `updatePrimordial`; stat parts like `gaia`/`erebus` in `computeStats`).

Test: `G.char.inv.push(__dbg.makeItem({ ilvl: 10, rarity: 4, slot: 'chip', cls: G.char.cls }))`, then set `.myth = 'key'` on it and equip it.

## Anomaly, implant or shrine

All in `js/run.js` except shrines (`js/loot.js`).

- **Anomaly:** add to `ANOMALIES`: `{ icon, css, name, desc, ...modifiers }`. Existing modifier keys are read with `amod(key, default)` (`count`, `elite`, `hp`, `dmg`, `speed`, `xp`, `credits`, `loot`, `orbs`, `pdmg`, `taken`, `cd`, `regen`, `killHeal`, `explode`, `giant`, `dark`). A new key needs an `amod('key')` call where it applies. The `anomalyAll` medal counts the list automatically. README "Floor events".
- **Implant:** add to `IMPLANTS`: `{ icon, name, mods }`, where `mods` uses `computeStats` keys (including `hpPct` / `armorPct`). Implant keys are stored in `c.implants`. README "Floor events" or "Loot and progression".
- **Shrine:** add to `SHRINES`: `{ name, desc, color, css }`. Touching one sets a timed `p.buffs[key]`. Apply the effect where it matters (search for an existing one, e.g. `buffs.fury` in `combat.js`).

## Floor event (puzzle or challenge)

All in `js/events.js`. See [Floor events](ARCHITECTURE.md#floor-events-eventsjs) for how they run.

1. Add `EVENT_INFO[kind]` with `{ icon, css, name }` (plus `short` if the name is long for the HUD).
2. Write the kind object:
   - `setup(d, floor, rooms)`: find a spot with `findSpot(d, rooms, radius)`, build the meshes in a group from `groupAt`, and return `{ kind, x, z, st, ... }` (or `null` if it doesn't fit).
   - Only draw from `rr`/`ri`/`pick`/`chance` in `setup` (it runs inside `isolateRandom`). Use `Math.random` in `update`.
   - `update(E, dt)` drives it. End with `complete(E, mult, title, sub, x, z)` or `failed(E, msg)`.
   - `hud(E)` returns the short text after the name. `intro(E)` shows the arrival toast.
   - `save(E)` / `load(E, s)` keep its progress across a resume.
3. Register it in `KIND`. Main events also go in `MAIN_EVENTS`; a small event needs its own roll in `setupEvents`.
4. Make it playable with every input method: walk-over pads, things you hit, or an NPC prop (see the slot machine).
5. Add the minimap mark in `drawEventMarks` and, if it needs one, an arrow in `eventArrows`.
6. Medals: `complete` already marks `evDone`. Add the kind to the `evMedals` table in `ach.js` (it creates the `ev_<kind>` medal); `evAll` counts it automatically.
7. Add it to the README "Puzzles and challenges" table and update the medal count.

## Medal

In `achList()` (`js/ach.js`):

```js
add('myMedal', '🎯', 1, L('Nome', 'Name'), L('Descrição', 'Description'), () => total('myCounter'), 10);
```

- Arguments: `id`, emoji, tier (0 bronze, 1 silver, 2 gold, 3 platinum; each pays credits), name, description, `cur()` progress function and `goal`.
- Record progress where it happens: `achAdd('myCounter')` for counts, `achMark('set', key)` for "collect them all" sets, `achMark('flags', 'name')` for one-off feats. Read them with `total(counter)`, `count(set)` and `has(set, key)`.
- Ids are saved in `G.save.ach`. Never rename them. Counters only grow, which is what makes the cloud merge safe.
- README "Medals" count.

## Sound effect

Add a method to `sfx` in `js/audio.js` built from `tone({ type, f, f2, dur, vol })` (oscillator sweeping from `f` to `f2`) and `noise({ dur, vol, type, f, f2, q })` (filtered noise). Start with `if (throttle('name', ms)) return;` for sounds that can fire many times per frame. Keep volumes in line with the existing ones (0.03–0.2). Call it with `sfx.name()`.

## Song

Add an entry to `SONGS` in `js/music.js`. Copy an existing song and change it:

- `name: [pt, en]`, `bpm`, `prog` (named chord progressions, one chord per bar: `'Am F C G'`).
- Step patterns of 16 sixteenths: `kick`, `snare`, `hat` (`x` hit, `o` open hat), `bass` (`r` root, `o` octave, `f` fifth, `t` third, `-` hold, `.` rest), `arp` (indices into the chord notes).
- `mel`: melodies per section in eighth notes (`a4`, `c#5`, `-` hold, `.` rest, `|` separates bars; whole bars only).
- `secs`: the arrangement, `[section, bars, layers]`, where layers are letters: `p` pad, `a` arp, `k` kick, `s` snare, `h` hat, `b` bass, `l` lead, `c` crash at start, `r` riser at end.

The options track picker and shuffle pick it up automatically (`trackNames()`). Update the song count in README. Listen to the whole song; a bad note name or an incomplete bar throws an error.

## Pet

Add a kind to `PET_KINDS` (`js/pets.js`): `{ name, icon, speed, fly? }`, a model branch in `makePetModel(kind, accent)` (low-poly, facing +z, head parts as children of the head) and the kind to `BY_THEME` and/or `ALL`.

## Setting (option)

1. Default value in `G.settings` (`js/state.js`).
2. A row in `#panel-opts` in `index.html`: `<div class="opt"><span data-i18n="key">Rótulo</span> <button class="btn small" id="opt-key" data-nav></button></div>`, plus the `key: ['Rótulo', 'Label']` entry in `DICT`.
3. Handler in `initUI()` (`js/ui.js`) next to `opt-shake`: update the label, change `G.settings`, call `saveSettings()` and apply the effect.
4. To change a default for existing players, bump `sv` and migrate in `loadSave()` (`main.js`), as was done for `glow`.

## UI panel

1. Markup in `index.html` (`<div id="panel-x" class="screen hidden">`), with `data-i18n*` texts and `data-nav` on every interactive element.
2. Add the id to `PANEL_ORDER` in `ui.js` (earlier = on top for gamepad focus) and a `case` in `uiBack` so `{B}` closes it.
3. Open and close it with `openOverlay(id)` / `closeOverlay(id)` (or set `G.mode` if the game must pause).
4. Gamepad hints use `{A}` / `{B}` placeholders through `padText` or `data-pad-text`.
5. Styles in `css/style.css`. Check phone landscape (the `max-height: 520px` query) and portrait.

## Character field

1. Initialize it in `newCharacter` (`player.js`).
2. Backfill it in `sanitizeChar` (`main.js`), so old saves get it.
3. Decide how cloud merge treats it in `mergeChar` (`sync.js`): it rides with the winning character by default; take the max for lifetime stats (like `wins`, `playTime`); add it to `progressOf` only if it measures progress.
4. If it changes what "more advanced" means, think about two devices with different values and make sure nothing is lost.

## Public docs checklist

When content counts change, update:

- `README.md`: the tables (Classes, Biomes, Enemies, Bosses, Floor events, Medals, Loot) and the counts in the text.
- `index.html`: `description`, `og:description` and `twitter:description` ("10 classes …, 7 chefes, 23 biomas, 30 andares").
- `img/og-image.png`: the counts are baked into the image, so regenerate it.
- `AGENTS.md` (module map, counts) and these docs if a recipe changed.
