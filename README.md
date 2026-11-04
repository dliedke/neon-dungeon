# Neon Dungeon

### ▶ [Play now: dliedke.github.io/neon-dungeon](https://dliedke.github.io/neon-dungeon/)

A cyberpunk isometric action RPG that runs right in the browser, on desktop and mobile.
The game is shown in **English or Portuguese** based on your browser language.

## Goal

Descend through endless dungeon floors, defeat enemies, collect gear and level up your character.
Find the glowing **elevator** on each floor to go down. Every 3 floors, a **boss** guards the exit.
Items marked with **▲** and a green glow are better than what you have equipped.

## Classes

| Class | Style | Skills |
| --- | --- | --- |
| **Blade** (Chrome Samurai) | Tough melee fighter that gains energy on hit | Plasma Slash, Lunge, Whirlwind, Overclock |
| **Gunslinger** (Hired Gun) | Fast and agile ranged attacker | Double Tap, Bullet Fan, Pulse Grenade, Tactical Roll |
| **Netrunner** (Combat Hacker) | Area control and summons | Data Pulse, Drone Turret, Short Circuit, Net Jump |
| **Iron Fist** (Cyber Brawler) | Heavy melee with stunning combos | Cyber Combo, Rocket Fist, Titanium Skin, Earthquake |
| **Pyro** (Street Pyromaniac) | Short-range fire that burns and lingers | Flamethrower, Napalm Cocktail, Jet Leap, Supernova |
| **Frost** (Cryo Sniper) | Long-range piercing shots that slow and freeze | Cryo Shot, Ice Bomb, Holo Decoy, Railgun |
| **Juggernaut** (Heavy Cyborg) | Very tough, a minigun that spins up | Minigun, Rocket, Energy Barrier, Missile Rain |

Each class has its own save slot, stored in the browser.

## Controls

- **Keyboard + mouse:**
  - Click to move and attack, or use WASD to move and Space to attack.
  - Q / E / R for skills, F for a stim, I for the inventory and Esc to pause.
- **Gamepad:**
  - Left stick to move; A, RB or RT to attack.
  - X / Y / B for skills, LB for a stim, Select for the inventory and Start to pause.
  - Menus can be navigated with the D-pad.
- **Mobile:**
  - Drag on the left side of the screen to move.
  - Use the buttons on the right to attack and use skills.
  - The game switches to fullscreen landscape when you tap Play (on Android), and pauses with a hint if the phone is held upright.
  - It can be installed to the home screen as an app (Share → Add to Home Screen on iPhone) to play in fullscreen.

Attacks and skills **aim automatically** at the nearest enemy.

## Biomes

Every floor changes biome, each with its own map layout and environmental hazards:

| Biome | Layout | Environment |
| --- | --- | --- |
| **Neon District** | Rooms and corridors | Rain and electric puddles that shock anyone standing in them |
| **Toxic Sewers** | Wide sewer corridors | Toxic sludge rivers that slow you down and hurt |
| **Corporate Factory** | Rooms and corridors | Conveyor belts and hydraulic presses (they crush enemies too) |
| **Cryo Lab** | Organic caves | Slippery ice and cryo vents that freeze enemies and chill you |
| **Data Core** | Grid of rooms | Laser grids that switch on and off |
| **Night Market** | Large open plazas | Market stalls, lanterns and a **merchant** who sells gear |

Floors also have explosive barrels and golden loot caches.

## Enemies

**13 enemy types:**

- Street Punk, Watcher Drone, Corporate Agent, Bomb Spider and Brute Mech.
- **Sentry Turret.**
- **Riot Trooper**, whose shield blocks attacks from the front.
- **Medic Drone**, which heals other enemies.
- **Sniper**, which aims with a laser before firing.
- **Holo Assassin**, which teleports behind you.
- **Kamikaze Drone**, which locks on and dives in a straight line.
- **Illusionist**, which creates fake copies of itself.
- **Missile Tank**, whose homing missiles can be shot down.

**Elites** have affixes: Swift, Armored, Vampiric or Unstable.

## Bosses

| Boss | Mechanics |
| --- | --- |
| **Executor ARC-9** | Ring barrages, charge and ground slam |
| **Arachnid Matriarch** | Leaps, acid pools and spider broods |
| **Scrap King** | Throws scrap, magnetically pulls you in and sends out shockwaves |
| **Phantom Reaper** | Dashes, vanishes to reappear behind you and splits into clones |
| **Assault Gunship** | Circles the arena with bombing runs; vulnerable when it lands |
| **Grand Hacker** | Corrupts floor tiles in patterns and sends firewalls with a gap |
| **OMEGA Core** | Immune until its shield pylons are destroyed; rotating laser beams |

## Loot and progression

- **Loot:**
  - 4 rarities and 13 stat types.
  - 6 legendary effects.
  - Upgrade highlighting for items better than what you have equipped.
- **Progression:** levels, skill points (up to rank 10 per skill), credits, stims and health orbs.
- **Options:** difficulty (Easy, Normal or Hard), neon glow intensity, graphics quality and volume.

## Development

Built with [Three.js](https://threejs.org/) with no build step. All models, sounds and music are generated in code.
To run locally, serve the folder with any web server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To force a language, add `?lang=en` or `?lang=pt` to the URL.

```
index.html        page and HUD
css/style.css     UI styles
js/main.js        rendering, camera, game loop, floors and saves
js/i18n.js        translations (English / Portuguese)
js/dungeon.js     procedural map layouts, collision and pathfinding
js/biomes.js      biome hazards, mechanisms and decoration
js/player.js      player character and progression
js/classes.js     classes and skills
js/enemies.js     enemies, AI and bosses
js/combat.js      damage, statuses, projectiles and hazards
js/items.js       item generation
js/loot.js        ground loot and loot caches
js/fx.js          particles and visual effects
js/models.js      low-poly models built from primitives
js/input.js       keyboard, mouse, gamepad and touch input
js/audio.js       synthesized sound effects and music
js/ui.js          menus, inventory, shop and gamepad navigation
vendor/three/     Three.js r160 (MIT)
```
