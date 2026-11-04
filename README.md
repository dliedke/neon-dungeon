# Neon Dungeon

### ▶ [Jogar agora / Play now: dliedke.github.io/neon-dungeon](https://dliedke.github.io/neon-dungeon/)

Action RPG isométrico cyberpunk que roda direto no navegador, no PC e no celular.
O jogo aparece em **português ou inglês** conforme a língua do navegador.

*A cyberpunk isometric action RPG that runs right in the browser, on desktop and mobile.
The game is shown in **English or Portuguese** based on your browser language.*

---

## 🇧🇷 Português

### Objetivo

Desça pelos andares da masmorra derrotando inimigos, colecionando equipamentos e evoluindo seu personagem.
Em cada andar, encontre o **elevador** brilhante para descer. A cada 3 andares, um **chefe** guarda a saída.
Itens marcados com **▲** e brilho verde são melhores que os que você está usando.

### Classes

| Classe | Estilo | Habilidades |
| --- | --- | --- |
| **Lâmina** (Samurai Cromado) | Corpo a corpo, resistente, ganha energia ao acertar | Corte de Plasma, Investida, Turbilhão, Overclock |
| **Atiradora** (Pistoleira de Aluguel) | À distância, rápida e ágil | Disparo Duplo, Leque de Balas, Granada de Pulso, Rolamento Tático |
| **Netrunner** (Hacker de Combate) | Controle de área e invocações | Pulso de Dados, Torre-Drone, Curto-Circuito, Salto de Rede |

### Controles

- **Teclado + mouse:**
  - Clique para mover e atacar, ou use WASD para mover e Espaço para atacar.
  - Q / E / R para habilidades, F para stim, I para o inventário e Esc para pausar.
- **Controle:**
  - Analógico esquerdo para mover; A, RB ou RT para atacar.
  - X / Y / B para habilidades, LB para stim, Select para o inventário e Start para pausar.
- **Celular:**
  - Arraste no lado esquerdo da tela para mover.
  - Use os botões à direita para atacar e usar habilidades.

Os ataques e as habilidades **miram sozinhos** no inimigo mais próximo.

### Conteúdo

- **Masmorras procedurais e infinitas**, com 4 temas visuais, barris explosivos e cofres de loot.
- **10 tipos de inimigos:**
  - Punk de Rua, Drone Vigia, Agente Corporativo, Aranha-Bomba e Mech Brutamontes.
  - **Torreta de Segurança.**
  - **Tropa de Choque**, cujo escudo bloqueia ataques vindos da frente.
  - **Drone Médico**, que cura os outros inimigos.
  - **Franco-atirador**, que mira com um laser antes de atirar.
  - **Assassino Holográfico**, que se teleporta para as suas costas.
- **Elites** com afixos: Veloz, Blindado, Vampírico e Instável.
- **2 chefes:**
  - **Executor ARC-9:** rajadas em anel, investida e pisão.
  - **Matriarca Aracnídea:** salto, poças de ácido e ninhadas de aranhas.
- **Loot:**
  - 4 raridades e 13 tipos de atributo.
  - 6 efeitos lendários.
  - Destaque para itens melhores que os equipados.
- **Progressão:** níveis, pontos de habilidade, créditos, stims e orbes de vida.
- **Opções:** dificuldade (Fácil, Normal ou Difícil), volume e qualidade gráfica.

---

## 🇺🇸 English

### Goal

Descend through the dungeon floors defeating enemies, collecting gear and leveling up your character.
On each floor, find the glowing **elevator** to go down. Every 3 floors, a **boss** guards the exit.
Items marked with **▲** and a green glow are better than what you have equipped.

### Classes

| Class | Style | Skills |
| --- | --- | --- |
| **Blade** (Chrome Samurai) | Tough melee fighter that gains energy on hit | Plasma Slash, Lunge, Whirlwind, Overclock |
| **Gunslinger** (Hired Gun) | Fast and agile ranged attacker | Double Tap, Bullet Fan, Pulse Grenade, Tactical Roll |
| **Netrunner** (Combat Hacker) | Area control and summons | Data Pulse, Drone Turret, Short Circuit, Net Jump |

### Controls

- **Keyboard + mouse:**
  - Click to move and attack, or use WASD to move and Space to attack.
  - Q / E / R for skills, F for a stim, I for the inventory and Esc to pause.
- **Gamepad:**
  - Left stick to move; A, RB or RT to attack.
  - X / Y / B for skills, LB for a stim, Select for the inventory and Start to pause.
- **Mobile:**
  - Drag on the left side of the screen to move.
  - Use the buttons on the right to attack and use skills.

Attacks and skills **aim automatically** at the nearest enemy.

### Content

- **Endless procedural dungeons** with 4 visual themes, explosive barrels and loot caches.
- **10 enemy types:**
  - Street Punk, Watcher Drone, Corporate Agent, Bomb Spider and Brute Mech.
  - **Sentry Turret.**
  - **Riot Trooper**, whose shield blocks attacks from the front.
  - **Medic Drone**, which heals the other enemies.
  - **Sniper**, which aims with a laser before firing.
  - **Holo Assassin**, which teleports behind you.
- **Elites** with affixes: Swift, Armored, Vampiric and Unstable.
- **2 bosses:**
  - **Executor ARC-9:** ring barrages, a charge and a ground slam.
  - **Arachnid Matriarch:** a leap, acid pools and spider broods.
- **Loot:**
  - 4 rarities and 13 stat types.
  - 6 legendary effects.
  - Upgrade highlighting for items better than what you have equipped.
- **Progression:** levels, skill points, credits, stims and health orbs.
- **Options:** difficulty (Easy, Normal or Hard), volume and graphics quality.

---

## Desenvolvimento / Development

Feito com [Three.js](https://threejs.org/), sem build. Para rodar localmente, use um servidor web:
*Built with [Three.js](https://threejs.org/), no build step. To run locally, use any web server:*

```bash
python3 -m http.server 8000
```

Para forçar o idioma, adicione `?lang=pt` ou `?lang=en` ao endereço.
*To force a language, add `?lang=pt` or `?lang=en` to the URL.*

```
index.html        página e HUD / page and HUD
css/style.css     interface / UI styles
js/main.js        renderização, câmera, laço, andares, saves / rendering, camera, loop, floors, saves
js/i18n.js        traduções / translations
js/dungeon.js     geração procedural, colisão, A* / procedural generation, collision, A*
js/player.js      jogador e progressão / player and progression
js/classes.js     classes e habilidades / classes and skills
js/enemies.js     inimigos, IA e chefes / enemies, AI and bosses
js/combat.js      dano, projéteis, perigos / damage, projectiles, hazards
js/items.js       itens / items
js/loot.js        itens no chão e cofres / ground loot and caches
js/fx.js          efeitos visuais / visual effects
js/models.js      modelos low-poly / low-poly models
js/input.js       teclado, mouse, controle, toque / keyboard, mouse, gamepad, touch
js/audio.js       sons e música / sound and music
js/ui.js          menus e inventário / menus and inventory
vendor/three/     Three.js r160 (MIT)
```
