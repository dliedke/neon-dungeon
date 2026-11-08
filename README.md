# Neon Dungeon

### ▶ [Play now: dliedke.github.io/neon-dungeon](https://dliedke.github.io/neon-dungeon/)

A cyberpunk isometric action RPG that runs right in the browser, on desktop and mobile.
The game is shown in **English or Portuguese** based on your browser language.

## Goal

Descend through 30 dungeon floors, defeat enemies, collect gear and level up your character.
Find the glowing **elevator** on each floor to go down. Every 3 floors, a **boss** guards the exit.
On **floor 30**, the final battle pits you against all 7 bosses in waves: two at a time, and when both fall the next two arrive. Defeat them all to win the game, see your class's ending and earn the final-battle medals.
Items marked with **▲** and a green glow are better than what you have equipped.

After you win, the same character can descend again from floor 1 in **Nightmare ☠️** and then **Inferno 🔥** mode (New Game+).
You keep your level, items and implants. Each mode picks up where the previous one ended (Nightmare floor 1 is as deep as floor 31, Inferno floor 1 as floor 61) and enemies also get extra health (×1.25 in Nightmare, ×1.5 in Inferno) and damage (×1.5 and ×1.75). Deep enemies also pierce armor: past the 30th effective floor, the same armor blocks less and less (e.g. 658 armor blocks 87% on floor 30, about 67% on Nightmare floor 10 and about 50% in Inferno), so a maxed-out character still has a fight on its hands. Elites are more common and have more affixes, and items and credits are better.
Each mode grants its own set of implants and has its own medal.

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
| **Huntress** (Neon Archer) | Long-range piercing arrows, traps and a hunting hawk | Light Arrow, Multishot, Shock Net, Arrow Rain |
| **Valkyrie** (Volt Lancer) | Long-reach melee with an electric spear | Thrust, Spear Charge, Volt Javelin, Thunderfall |
| **Biohacker** (Street Chemist) | Mid-range poison, healing and a lab mutant | Toxic Dart, Toxic Cloud, Nano Heal, Plague |

Each class has its own save slot, stored in the browser. The game autosaves every 20 seconds, and **Continue** puts you back exactly where you left off: same floor layout and position, with the enemies you killed, opened chests, loot on the ground and the explored map all kept.

**Cloud save (optional):** sign in with Google (☁ button on the main menu or in the pause menu) to sync your characters across devices (every 3 minutes while playing, and right away when you change floors, leave the tab or quit to the menu).
The save goes to a hidden app folder in your own Google Drive (`drive.appdata` scope), so there is no server.
If two devices disagree, each class keeps the most advanced character and the best item for each gear slot.

### Skill tree

Every class has a **skill tree with 10 active powers and 3 passive powers** (the Netrunner has 9 plus its own Net Jump). You start with only the basic attack and one skill;
new powers unlock as you level up (levels 2, 4, 5, 7, 9, 12 and 15) and cost one skill point to learn.
Points also upgrade each power up to rank 10. Pick which **6 powers** go on your 1–6 buttons
(X / Y / B / LB / RB / LT on a gamepad).

Passive powers (levels 3, 8 and 14) are always on and don't take a button. They give permanent bonuses that
fit the class, such as dodge chance, damage reduction, healing or energy on kills, extra damage to elites and bosses,
stronger burns or extra damage to slowed and frozen enemies.

Some of the wilder powers: summoned demons (Oni, Digital Daemon, Ifrit), a steel golem, an ice wolf pack, a bionic hawk, a winged valkyrie and a lab mutant,
orbiting blades, black holes, orbital lasers, lightning storms, time warps that slow enemies and their bullets,
plasma shields that reflect shots, Mind Hack (enemies fight for you), Omnislash, Demon Form, Mech Suit,
meteor showers, arrow hurricanes, a pandemic and a nuclear strike.

Every class can also learn **Teleport** (from level 3): it blinks up to 8m toward the cursor (or the stick/move direction), grants a moment of invulnerability and releases a damaging pulse where you land. It works for escaping too.

## Controls

- **Keyboard + mouse:**
  - Click to move and attack, or use WASD to move and Space to attack.
  - 1–6 for powers (Q / E / R also fire the first three), F for a stim, I for the inventory and Esc to pause.
- **Gamepad:**
  - Left stick to move; A or RT to attack.
  - X / Y / B / LB / RB / LT for powers 1–6, click a stick (LS / RS) for a stim, Select for the inventory and Start to pause.
  - Menus can be navigated with the D-pad; A selects/equips, X recycles, Y recycles all (equipment tab) or switches tabs, RT favorites the item, LB/RB switch tabs and B goes back.
  - The game detects Xbox, PlayStation 4/5 and Nintendo Switch Pro controllers and shows the matching button icons.
- **Mobile:**
  - Drag on the left side of the screen to move.
  - Use the buttons on the right to attack and use up to 6 powers.
  - The game switches to fullscreen landscape when you tap Play (on Android), and pauses with a hint if the phone is held upright.
  - It can be installed to the home screen as an app (Share → Add to Home Screen on iPhone) to play in fullscreen.

Attacks and skills **aim automatically** at the nearest enemy.

The merchant, the blacksmith and the shared stash only open when you ask: **click** them (your character walks there if they are far), press **Enter** or **A** next to them, or **tap** the button that pops up above them on mobile.

## Biomes

Every floor changes biome (13 in total), each with its own map layout, lighting and hazards:

| Biome | Layout | Environment |
| --- | --- | --- |
| **Neon District** | Rooms and corridors | Rain and electric puddles that shock anyone standing in them |
| **Dark Forest** | Organic clearings | Dense fog, trees, glowing mushrooms, fireflies, thorn patches; **ghosts** that pass through walls and exploding **wisps** |
| **Corporate Factory** | Rooms and corridors | Conveyor belts and hydraulic presses (they crush enemies too) |
| **Snowy Peaks** | Open snowfields | Snowfall, pine trees, ice and deep snow that slows you; blizzards cut your vision; **cyber yetis** that throw snowballs and **frost wolves** whose bites chill |
| **Mutant Meadow** | Open fields | Daylight, grass, flowers, lakes and boulders; charging **mutant boars** and acid-spitting **toads** |
| **Toxic Sewers** | Wide sewer corridors | Toxic sludge rivers that slow you down and hurt |
| **Mountain Pass** | Rocky canyons | Tall cliffs, bottomless chasms and falling rocks; charging **armored rams** and diving **bionic eagles** |
| **Orbital Station** | Rooms over open space | Holes into space, vacuum airlocks that pull everything in; pouncing **xeno stalkers** |
| **Cryo Lab** | Organic caves | Slippery ice and cryo vents that freeze enemies and chill you |
| **Radioactive Wasteland** | Open dunes | Radioactive pools, cacti and sandstorms; poisonous **rad scorpions** |
| **Volcano** | Ash caves | Lava rivers that burn, erupting geysers and drifting embers; fire-spitting **magma salamanders** and **magma golems** that leave burning trails |
| **Data Core** | Grid of rooms | Laser grids that switch on and off |
| **Night Market** | Large open plazas | Market stalls, lanterns and a **merchant** who always sells upgrades |

Tech biomes also have explosive barrels; every biome has golden loot caches.

## Enemies

**29 enemy types** (17 roaming the tech biomes plus 12 biome creatures):

- Street Punk, Watcher Drone, Corporate Agent, Bomb Spider and Brute Mech.
- **Sentry Turret.**
- **Riot Trooper**, whose shield blocks attacks from the front.
- **Medic Drone**, which heals other enemies.
- **Sniper**, which aims with a laser before firing.
- **Holo Assassin**, which teleports behind you.
- **Kamikaze Drone**, which locks on and dives in a straight line.
- **Illusionist**, which creates fake copies of itself.
- **Missile Tank**, whose homing missiles can be shot down.
- **Cyber Hound**, a fast robot dog that pounces.
- **Tesla Drone**, which charges up and zaps everything around it.
- **Flame Trooper**, which warns with a red line and then sweeps a cone of fire.
- **Mortar Walker**, which shells you from far away with three marked grenades.

**Elites** have affixes: Swift, Armored, Vampiric or Unstable.
Deeper floors add support elites that change the fight: the **Mender** heals nearby enemies (green aura), the **Warden** shields nearby enemies so they take 60% less damage (blue aura), and the **Bombardier** marks your position and strikes it a moment later, so you have to keep moving.
Kill them first. From floor 14 onwards elites can have two affixes, and from floor 26 three.

Enemies keep getting tougher faster on deep floors, so a strong character still has to fight.

**Bosses** are tough: they fire aimed volleys between their attacks and become **enraged** below 30% health (faster, harder hitting and with bigger volleys).
The first boss hits softer and attacks more slowly, since you are still weak; every boss after it gets more health.

After each boss you **choose an implant** (1 of 3 random options; golden implants are worth double): permanent bonuses such as damage, health, crit, speed, cooldowns, lifesteal, dodge or extra damage to elites. They stack for the whole run.

## Floor events

- **Data Thief:** a rare golden runner carrying a backpack of stolen data. It flees from you, drops credits as it runs and teleports away after about 14 seconds.
  Catch it for a jackpot: guaranteed rare-or-better items, a pile of credits and a stim.
- **Raging Behemoth:** from floor 3 on, about one floor in three hides a huge armored beast in a far room. You are warned when you arrive, and it shows on the minimap (with an arrow at the edge) and on the full map. It is very tough (it shrugs off 20% of all damage), roars when it spots you and hits extremely hard: a ground slam and a straight-line charge, both telegraphed on the floor. If the charge hits a wall it is stunned for a moment. Below half health it becomes enraged: faster, stronger, double slams and double charges.
  Kill it for a big payout: a pile of credits (about the price of a legendary in the shop), 3 items (the first is rare or better), a stim and an orb.
- **Neon Shrines:** glowing pillars that grant a 30-second buff when you walk over them:
  **Fury** (+50% damage), **Haste** (+35% move speed, +30% attack speed), **Fortune** (more loot and double credits) or **Aegis** (half damage taken).

- **Floor anomalies:** many floors roll a random modifier that changes how they play, with risk and reward:
  Horde, Frenzy, Elite Surge, Gold Rush, Glass Cannon, Blood Moon, Chain Reaction, Overload, Giants and Blackout.
- **Contracts:** an optional objective per floor (kill elites, kill fast, reach a combo, clear the floor, kill without getting hit, catch the Data Thief, close the rift...).
  Completing one pays credits and good items.
- **Challenge Rifts:** most floors have one (sometimes two or three). Stand on the rift to open it and survive 3 to 10 waves (random per rift) of big enemy packs, great for combos; the last wave includes an elite (two in rifts of 7+ waves). The reward is a guaranteed Prototype item and more, growing with the number of waves.
- **Floor cleared:** kill every enemy on a floor (the final battle doesn't count) for a credit bonus that grows with the floor and difficulty, plus its own medals. When 10 or fewer remain, the HUD shows how many are left.
- **Kill combo:** chain kills quickly to build a combo. It adds bonus experience and pays credits every 10 kills. The time window grows with the combo (3.5s up to 6s at 50 kills), so you can reach the next group.
- **Nest:** from floor 4 on, about one floor in three has a big room packed with 30 to 60 weaker enemies (plus one elite). You are warned on arrival and it is marked on the map. When one of them spots you, the whole nest charges at once: perfect for big combos. Wipe it out for a loot cache and credits.

Thieves, shrines and rifts show up on the minimap once explored. Click or tap the minimap (or press M) to open the full map.

## Medals

**112 achievements** in four tiers (Bronze, Silver, Gold and Platinum), shared across all classes. Each medal pays out credits.
They cover kills, elites, every boss, depth, levels, playing every class, biomes, a bestiary, Data Thieves, shrines, critters, contracts, rifts, combos, anomalies, implants, loot caches,
legendaries, mythics, the blacksmith, credits, deaths, total play time and more. The medals screen also shows your total play time. Open them from the 🏅 button on the main menu or in the pause menu.
Medals and their counters sync with the Google cloud save; progress from every device adds up.

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
  - 5 rarities and 13 stat types.
  - 6 legendary effects.
  - **Mythic items** (from floor 3 onwards): very rare purple drops with a light beam, their own sound and a big announcement. Each one has a special power:
    **Orbital Laser** (strikes the strongest nearby enemy every 3 s), **Phantom Blades** (three blades orbit you and cut everything they touch),
    **Reaper** (executes enemies below 15% health and deals +25% to bosses), **Singularity** (crits can open a black hole that pulls enemies in and explodes),
    **Phoenix Protocol** (once every 90 s, a fatal blow revives you at half health) and **Neon Avatar** (every 15 kills you transform for 8 s).
    Bosses, rifts, the Data Thief and the harder modes drop them more often. "Recycle all" never recycles mythics.
  - **Favorites:** mark any item (in the inventory or equipped) with ★ Favorite and it can't be recycled, neither one by one nor with "Recycle all".
  - **Blacksmith:** appears on floors 4, 7, 10… and sometimes on others. For credits he upgrades your equipped items:
    up to +4/+6/+8/+10/+12 depending on rarity, each level adds damage or armor and boosts every stat, and every 4 levels the item gains a new stat.
    Costs grow with each level, so there is always something to spend credits on once you can't find better items.
  - Upgrade highlighting for items better than what you have equipped.
  - **Shared stash:** a chest a few steps from the start of every floor holds up to 100 items shared by all your characters (and synced to the cloud).
    Click it (or press A / tap it) to store or take items. Weapons can only be taken by their own class.
    **Equip** wears an item straight from the stash and swaps it with what you had on, which goes into the stash in its place (works even with a full inventory).
    A green ▲ marks items better than what your current character has equipped (the header counts them), and a blue ▲ marks items that would be an upgrade for another of your characters.
- **Progression:** levels, skill points (up to rank 10 per skill), credits, stims and health orbs.
- **Soundtrack:** 5 synthwave tracks synthesized live (Neon Pulse, Chrome Rain, Midnight Grid, Data Ghosts, Overdrive), played in shuffle or fixed to one in the options. Drums and bass kick in during fights and bosses.
- **Difficulty:** a small slider in the HUD (also in the options) with 5 levels: Easy, Normal, Hard, Brutal and Insane. It changes instantly, enemies on the floor included.
  The harder it is, the bigger the rewards: up to ×3.5 credits and far more and better items (more drops, higher rarity, more mythics).
  When you raise it the reward bonus ramps up over a few seconds, so it can't be flipped up just to open a chest.
- **Healing that scales with damage** (life steal, heal on kill) has a per-second cap, so a strong character still has to watch their health.
- **Options:** difficulty, neon glow intensity, graphics quality, soundtrack and volume.

## Development

Built with [Three.js](https://threejs.org/) with no build step. All models, sounds and music are generated in code.
To run locally, serve the folder with any web server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To force a language, add `?lang=en` or `?lang=pt` to the URL.

You can also open `neon-dungeon.sln` in Visual Studio and press F5. It runs the folder on IIS Express at port 8000, using `web.config`.

Developer docs:

- [AGENTS.md](AGENTS.md): conventions, gotchas and the deploy routine, for contributors and AI coding agents.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the game works inside (game loop, floors, combat, items, saves, cloud sync, input, UI, audio).
- [docs/CONTENT.md](docs/CONTENT.md): step-by-step recipes for adding classes, skills, enemies, bosses, biomes, items, medals, songs and more.

```
index.html             page and HUD
manifest.webmanifest   PWA manifest (install to home screen)
css/style.css          UI styles
img/                   app icons and the link preview image (og-image.png)
docs/                  developer docs and reference screenshots (not used by the game)
js/main.js             rendering, camera, game loop, floors and saves
js/state.js            shared global state (G) and tile constants
js/utils.js            random, math and formatting helpers
js/i18n.js             translations (English / Portuguese)
js/dungeon.js          procedural map layouts, collision and pathfinding
js/biomes.js           biome hazards, mechanisms, decoration, merchant and blacksmith
js/player.js           player character and progression
js/classes.js          classes, skill trees and skills
js/powers.js           advanced skill-tree powers (summons, orbitals, transformations)
js/enemies.js          enemies, AI and bosses
js/combat.js           damage, statuses, projectiles and hazards
js/items.js            item generation
js/loot.js             ground loot and loot caches
js/fx.js               particles and visual effects
js/models.js           low-poly models built from primitives
js/input.js            keyboard, mouse, gamepad and touch input
js/padglyphs.js        gamepad model detection and button icons
js/audio.js            synthesized sound effects and music playback
js/music.js            the 5 soundtrack songs and the synth/sequencer that plays them
js/ui.js               menus, inventory, shop and gamepad navigation
js/sync.js             Google sign-in and Google Drive cloud save
js/ach.js              medals (achievements) and their counters
js/run.js              floor anomalies, contracts, rifts, kill combo and implants
js/mythic.js           mythic item powers
js/pets.js             decorative pets that wander each biome
vendor/three/          Three.js r160 (MIT)
web.config             IIS Express settings for Visual Studio (ignored by GitHub Pages)
```
