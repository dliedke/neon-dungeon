# Neon Dungeon

Action RPG isométrico cyberpunk que roda direto no navegador, no PC e no celular.
É feito com [Three.js](https://threejs.org/) e não precisa de build nem de instalação.

## Como jogar

Abra o `index.html` por um servidor web local (módulos ES não carregam via `file://`):

```bash
python3 -m http.server 8000
```

Depois acesse http://localhost:8000. Também funciona no GitHub Pages.

### Objetivo

Desça pelos andares da masmorra derrotando inimigos, colecionando equipamentos e evoluindo seu personagem.
Em cada andar, encontre o **elevador** brilhante para descer. A cada 3 andares, um **chefe** guarda a saída.

## Classes

| Classe | Estilo | Habilidades |
| --- | --- | --- |
| **Lâmina** (Samurai Cromado) | Corpo a corpo, resistente, ganha energia ao acertar | Corte de Plasma, Investida, Turbilhão, Overclock |
| **Atiradora** (Pistoleira de Aluguel) | À distância, rápida e ágil | Disparo Duplo, Leque de Balas, Granada de Pulso, Rolamento Tático |
| **Netrunner** (Hacker de Combate) | Controle de área e invocações | Pulso de Dados, Torre-Drone, Curto-Circuito, Salto de Rede |

Cada classe tem um save próprio, salvo no navegador (`localStorage`).

## Controles

**Teclado + mouse**
- Clique esquerdo no chão para mover; no inimigo, para atacar
- WASD para mover; Espaço ou Shift + clique para atacar no lugar
- Q / E / R (ou 1 / 2 / 3) para habilidades; botão direito para a habilidade 1
- F para usar stim, I ou Tab para abrir o personagem, Esc para pausar

**Controle (Xbox/PlayStation via Gamepad API)**
- Analógico esquerdo para mover; analógico direito para mirar (há mira automática)
- A / RB / RT para atacar; X / Y / B para habilidades
- LB / LT para stim, Select para o personagem, Start para pausar
- Nos menus: D-pad para navegar, A para confirmar, B para voltar, X para reciclar item, Y para trocar de aba

**Toque (celular)**
- Arraste no lado esquerdo da tela para mover (joystick virtual)
- Botões à direita: ataque (segure), 3 habilidades e stim, com mira automática

## Sistemas

- **Masmorras procedurais** com salas, corredores, pilares, letreiros de neon e 4 temas visuais
- **Inimigos:** Punk de Rua, Drone Vigia, Agente Corporativo, Aranha-Bomba e Mech Brutamontes
- **Elites** com afixos (Veloz, Blindado, Vampírico e Instável)
- **Chefe:** Executor ARC-9, com rajadas em anel, investida telegrafada, pisão em área, invocações e uma segunda fase
- **Loot** com 4 raridades (Comum, Modificado, Raro e Protótipo), 13 tipos de atributo e 6 efeitos lendários
- **Progressão:** níveis, pontos de habilidade (cada habilidade vai até o nível 10), créditos, reciclagem de itens e compra de stims
- **Interface:** HUD, minimapa com névoa de guerra, inventário com comparação de itens, opções de áudio e gráficos

## Estrutura

```
index.html          página e HUD
css/style.css       estilos da interface
js/main.js          renderização, câmera, laço principal, andares e saves
js/dungeon.js       geração procedural, colisão, A* e campo de fluxo
js/player.js        jogador, atributos e progressão
js/classes.js       classes e habilidades
js/enemies.js       inimigos, IA e chefe
js/combat.js        dano, projéteis, explosões e torres
js/items.js         geração de itens e atributos
js/loot.js          itens no chão
js/fx.js            partículas e efeitos visuais
js/models.js        modelos low-poly feitos com primitivas
js/input.js         teclado, mouse, controle e toque
js/audio.js         efeitos sonoros e música synthwave gerados com WebAudio
js/ui.js            menus, inventário, minimapa e navegação por controle
vendor/three/       Three.js r160 (licença MIT)
```
