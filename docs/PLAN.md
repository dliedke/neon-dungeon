# Plano: Abismo, divinos, raridade Primordial e árvore expandida

Plano de trabalho para continuar em qualquer sessão/conta. Leia o `AGENTS.md` antes (fluxo: testar no Edge headless, commit em português, push no `main`, acompanhar o build do Pages e avisar quando estiver no ar).
Marque `[x]` ao concluir cada passo e faça commit deste arquivo junto. Faça uma fase por vez, cada uma com seu próprio commit/push.

Pedidos do usuário:
1. Dificuldades acima da Morte com mais recompensa (o baú compartilhado deixou o jogo fácil). → **Fase 1 (Abismo)**
2. Itens divinos mais frequentes. → **Fase 2**
3. Uma raridade nova acima do divino, rara mas alcançável. → **Fase 3 (Primordial)**
4. Árvore de habilidades com mais 4 passivos e 4 ataques novos para todas as 10 classes. → **Fase 7**
5. Santuários mais divertidos (super velocidade, superpoderes, superteleporte...). → **Fase 4**
6. Duas músicas novas, sons mais variados. → **Fase 5 (concluída)**
7. 10 eventos novos e uns 5 eventos por andar. → **Fase 6**

---

## Fase 1 — Abismo I–X (concluída)

Ideia: no Morte, um seletor separado (não no slider de dificuldade) com 10 níveis de Abismo. Cada nível empurra o andar efetivo +6 (`ABYSS_STEP`), soma uma regra cumulativa (`ABYSS_RULES`) e aumenta créditos/loot (`REWARD` ganha 10 entradas: créditos 8.2×…17.2×, loot 5.85…8.1). Desbloqueia matando chefes: o Morte com chefe abatido (`flags.deathBoss`) abre o Abismo I; matar um chefe no Abismo N abre o N+1 (fica em `stats.sets.abyss`, que já sincroniza na nuvem por união).

Regras (índice = nível): I Horda de Elites, II Caçadores Velozes (+15% velocidade), III Feridas Profundas (cura −30%), IV Afixo Extra, V Fúria Precoce (chefe enfurece a 60%), VI Elites Instáveis (explodem), VII Tiros Acelerados (+25%), VIII Frenesi (ataque 20% mais rápido), IX Enxame (+20% inimigos), X Senhores do Abismo (+50% vida de chefes/elites).

Feito:
- [x] `enemies.js`: `ABYSS_MAX/STEP`, `ROMAN`, `ABYSS_RULES`, `abyssLvl/abyssOn/abyssUnlocked/abyssBest/abyssName/abyssColor`, `diffRank` soma o Abismo, `REWARD` estendido, `diffIlvl` com Abismo, `rescaleLive` + `setDifficulty`/`setAbyss` (reescala inimigos vivos), regras em `spawnEnemy`, `bossPressure`, `populateFloor`; chefes guardam `e.abyMin` (menor Abismo durante a luta, contra exploit de subir no fim).
- [x] `run.js`: `tierFloor()` (sem Abismo) e `effFloor()` (com Abismo); elites explodem no Abismo VI.
- [x] `events.js`: caça-níquel usa `tierFloor()` + `diffIlvl()`.
- [x] `loot.js`: divino +10% por nível de Abismo; inimigos comuns não ganham mais itens que no Morte; Abismo V+ dá +1 item em chefes e baús.
- [x] `combat.js`: cura ×0.7 (III), tiros inimigos ×1.25 (VII).

Falta:
- [x] `ach.js`: em `achKill` (chefe): `const ab = Math.min(abyssLvl(), e.abyMin ?? abyssLvl()); if (ab) achMark('abyss', String(ab));` e avisar a UI se `abyssUnlocked()` subiu (banner "O ABISMO SE ABRIU" no I, toast nos outros). Medalhas: Abismo I, V, X (via `abyssBest()`), `winAbyss`.
- [x] `enemies.js` batalha final: `if (abyssLvl() >= 10) achMark('flags', 'winAbyss');` junto do `winDeath`.
- [x] `state.js`/`main.js`: `abyss: 0` no padrão das configurações; ao carregar, limitar a `abyssUnlocked()` e zerar se a dificuldade não for `death`.
- [x] `ui.js` + `index.html` + `css/style.css`: linha do Abismo dentro de `#diff-ctl` (só aparece no Morte): `−`, 10 marcadores, `+`, nome em algarismo romano com a cor `abyssColor(n)`, regras ativas no tooltip; bloqueado mostra cadeado com dica. Moldura `#diff-ctl.abyss` com brilho girando. Nas Opções, um range `opt-abyss` (`data-nav`) para o controle. Banner ao subir, toast ao descer. Toque: botões grandes em `body.touch`. Chaves do `DICT` em `i18n.js` para textos novos do HTML.
- [x] Docs: README (dificuldades + Abismo, contagem de medalhas: conferir `achList().length`), `docs/ARCHITECTURE.md` (campo `abyss` nas configurações, seção de dificuldade). Meta/og do `index.html` se mencionar dificuldades.
- [x] Testar (CDP): `__G.save.stats.sets.flags = {deathBoss:1}`, `setAbyss(n)`, conferir `effFloor()`, `rewardK`, reescala de inimigos, HUD no desktop e toque (screenshots), nenhum erro de módulo.
- [x] Commit + push + build do Pages.

---

## Fase 2 — Divinos mais frequentes (concluída)

Hoje (`loot.js`, `divChance`): só a partir do andar efetivo 10; `k` = Morte 1.5 (Abismo +10%/nível), Apocalipse 1, Caos/Insano/Brutal no Pesadelo/Inferno 0.6/0.5/0.4; base por fonte: chefe 2%, fenda 1.5%, ladrão/fera 1.25%, contrato 0.75%, baú 0.4%, elite 0.2%, comum 0.03%.

- [x] Dobrar o `k` de todas as faixas (Morte 3, Apocalipse 2, 1.2/1.0/0.8 no tier) e liberar o Brutal+ no tier 0 com `k` pequeno (0.3/0.4/0.5)? Combinar com o usuário só se ficar em dúvida; senão: dobrar e abrir o Caos (k 0.5) no tier 0.
- [x] Caça-níquel (`events.js` ~1267): divino de 2.5% → 5% no prêmio máximo.
- [x] Baixar o piso de andar efetivo de 10 para 8.
- [x] Testar estatisticamente com `__dbg.makeItem` / chamando `dropLoot` em loop (ou expor `divChance` no `__dbg`) e anotar as chances novas no README.

Resultado (medido com 600–1000 drops de chefe no andar 10): chefe com pelo menos 1 divino: Caos 5,5%, Apocalipse 17%, Morte 27% (antes ~14%), Abismo VI 45%, Abismo X 51%. `k` final: Morte 3 (+10%/Abismo), Apocalipse 2, Caos 0,6 (tier 0) / 1,2 (tier ≥ 1), Insano 1, Brutal 0,8 no tier.

---

## Fase 3 — Raridade nova: **Primordial** (acima do Divino) (concluída)

Tema: antes dos deuses vieram os Primordiais (Caos, Gaia, Nyx, Cronos, Érebo, Urano). Visual: nome com gradiente prismático animado (arco-íris neon), feixe de loot trocando de cor, banner próprio ("✺ ITEM PRIMORDIAL ✺"), som próprio.

Dados (`items.js`):
- [x] `RARITY[6] = { name: L('Primordial', 'Primordial'), color: '#7dfff0', hex: 0x7dfff0, n: [6, 6], mult: 1.95 }` e `export const PRIMORDIAL = 6;` (cor base ciano-branco; o prisma vem do CSS).
- [x] `makeItem`: afixos ×1.6, um poder mítico + o poder divino do espaço + um poder primordial do espaço (`it.prim`). Campo ausente = sem poder (saves antigos ok).
- [x] `PRIMORDIALS` (um por espaço, lógica em `mythic.js`), sugestões:
  - arma `chaos` — Lâmina do Caos: 15% dos acertos abrem uma fenda que repete o golpe em todos os inimigos a 6m (120%).
  - cabeça `nyx` — Olhar de Nyx: críticos marcam o alvo; marcados recebem +40% de dano por 4s.
  - peito `gaia` — Pele de Gaia: 20% menos dano recebido e regenera 1% da vida por segundo.
  - mãos `cronos` — Mãos de Cronos: a cada 8 golpes, recarrega 1s de todos os poderes.
  - pés `erebus` — Passos de Érebo: +10% de esquiva (teto 35%); ao esquivar deixa uma sombra que explode (300%).
  - chip `uranus` — Coroa de Urano: a cada 12s caem 8 meteoros nos inimigos a 10m (220% cada).
  - Conjunto `GENESIS` (6 peças): "Gênese" — +50% de dano e todo poder usado solta uma onda prismática (300%).
- [x] `itemName` (prefixo ✺), `itemScore` (+160), `itemCardHtml`/`itemDiffHtml` (linha `.it-prim`), forja (`forgeMax`, custos, `recycleValue`: conferir arrays indexados por raridade), `sortInventory`.

Drop (`loot.js`):
- [x] `primChance(o, find)`: só com `rewardRank() >= 8` (Morte/Abismo) **ou** tier ≥ 1 no Apocalipse+, andar efetivo ≥ 15, apenas chefes/fendas/feras/ladrões/baús (nunca inimigo comum). Valor = `divChance × 0.1 × (1 + 0.1 × nível do Abismo)`. Rolado depois do divino (e o substitui).
- [x] Recompensa garantida: primeira vitória da batalha final no Abismo X dá 1 Primordial (flag em `stats.sets.flags`).
- [x] Ground loot: cor, feixe maior, rótulo `.ilabel.r6`, `achAdd('primordials')`, banner/toast `prim`, som (`sfx.primordial` em `audio.js`, sintetizado).
- [x] `events.js` caça-níquel: Primordial só no Abismo, 0.5%.

Resto:
- [x] `player.js` `computeStats`: `s.prims = new Set()` e bônus passivos (Gaia, conjunto).
- [x] `mythic.js`: lógica dos 6 poderes + conjunto (evitar alocação por frame, reaproveitar geometrias/fx).
- [x] `ui.js`: lista de bônus do personagem (perto da linha que mostra `DIVINES` em `s.divs`), minimapa (`RARITY[...]` já cobre), forja, baú.
- [x] `css/style.css`: `--r6`, `.cell.r6`, `.item-card.r6`, `.ilabel.r6`, `.toast.prim`, `.it-prim` com `@keyframes` de gradiente; tamanhos em `body.touch`.
- [x] `ach.js`: medalhas "Primordial" (achar 1), "Gênese" (6 equipados), contador `primordials`; conferir `divPlus`/`div6` que usam `rarity >= 5` (Primordial também conta como "divino ou melhor"? Sim, manter `>= 5`).
- [x] `sync.js`: o melhor item por espaço usa `itemScore` (conferir que o Primordial ganha).
- [x] Docs: README (raridades e poderes), `docs/CONTENT.md` (receita de raridade), og/meta se citarem raridades.

Resultado medido (qualquer Primordial por chefe): Morte andar 10 = 0% (piso 15), Morte andar 20 ≈ 3%, Abismo V ≈ 7%, Abismo X ≈ 13%; baú no Morte ≈ 0,4%. Apocalipse no tier 0 = 0%. O mercador nunca vende. 153 medalhas.

---

## Fase 4 — Santuários mais divertidos (concluída)

Antes (`loot.js` `SHRINES`): 11 buffs de números, 30s, 2–3 por andar.
- [x] 6 santuários especiais acrescentados no fim de `SHRINES` (`super: true`, ícone, gema maior com anéis girando, banner e `sfx.superShrine`):
  - `blitz` — Supervelocidade: +80% de movimento, +40% de ataque, rastro de imagens (`ghostFx`) e atropela (0,7 a cada 0,2s em 1,6m).
  - `giant` — Gigante: modelo ×1,45 (convive com as transformações), +60% de dano, −40% de dano recebido, golpes empurram, passos tremem o chão (0,5 em 2,6m).
  - `phase` — Superteleporte: Teleporte/Salto de Rede sem custo, recarga 0,35s, explosão na chegada (2,4×) e na saída (1,8×, 0,45s depois). Só aparece com o Teleporte aprendido e num atalho (`shrineOk`).
  - `surge` — Superpoderes: habilidades sem custo e recarga 4×.
  - `midas` — Toque de Midas: recompensa por abate ×5 com chuva de moedas.
  - `clone` — Gêmeos Neon: 2 clones (`spawnAlly('clone')`, `a.shrine`), recriados ao trocar de andar/carregar.
- [x] Duração 30s → 40s; brilho em volta do jogador com a cor de cada santuário ativo; ícones na barra de buffs.
- [x] 3–4 santuários por andar (2 nos primeiros), um especial garantido do andar 2 em diante; Santuário Supremo (~25% dos andares a partir do 3): dourado, dois efeitos (pelo menos um especial) por 60s; contorno dourado no minimapa.
- [x] Medalhas "Super-Herói" (usar os 6 especiais) e "Supremo" (usar um Supremo): 155 medalhas.
- [x] Docs: README, `docs/CONTENT.md`, `docs/ARCHITECTURE.md`.

## Fase 5 — 2 músicas novas (concluída)

- [x] Música 6 "Fliperama Fantasma / Ghost Arcade": chiptune 144 bpm em Mi maior, lead `pulse` (onda de pulso 25% via `createPeriodicWave`), baixo `tri` em oitavas (`bassOct: 12`), bateria de 8 bits (`chip: true`: `chipKick`/`chipSnare`), arpejo rápido de 3 notas.
- [x] Música 7 "Velocidade Terminal / Terminal Velocity": drum & bass 174 bpm em Sol menor, bateria quebrada (bumbo 1 e 3½, caixa 2 e 4), baixo `reese` (serras desafinadas ±20 cents + sub), lead `pluck` com eco.
- [x] Timbres novos em `LEADS` (`pulse`, `pluck`, com `fe`/`fd` próprios) e `BASSES` (`saw`, `tri`, `reese`); músicas antigas inalteradas.
- [x] Volume igualado renderizando offline (RMS ~0,075–0,08); seletor nas Opções mostra as 7; README, AGENTS e `docs/CONTENT.md`.

## Fase 6 — 10 eventos novos, ~5 por andar

`events.js` `setupEvents`: `want = boss || !free.length ? 0 : roll ? 2 : 1` de `MAIN_EVENTS` (`KIND[k].setup(d, floor, free)`), mais 1 evento pequeno (sala secreta ou caça-níquel 30%). `isolateRandom` mantém a semente (continuar o andar refaz igual), `lastMain` evita repetir.
- [ ] 10 eventos novos em `KIND`/`MAIN_EVENTS` (curtos, 30–90s, cada um com recompensa e som):
  1. Corrida de Checkpoints (anéis de neon com tempo).
  2. Horda (sobreviva a ondas por 45s numa arena marcada).
  3. Caça ao Tesouro (sinal quente/frio até um baú enterrado).
  4. Chuva de Meteoros (desvie das sombras e pegue os cristais).
  5. Hacker de Torres (capture 3 torres antes dos inimigos).
  6. Caixa de Pandora (abrir = recompensa ou maldição).
  7. Elite Fugitivo (um elite rico foge; pegue antes de escapar).
  8. Duelo de Espelho (uma cópia sombria sua).
  9. Pinball de Bombas (empurre bombas até os alvos).
  10. Chuva de Créditos (créditos caindo por 20s).
- [ ] `setupEvents`: ~5 eventos por andar normal (4–6 conforme salas livres), 0 em andar de chefe; sem repetir no mesmo andar.
- [ ] Toque, controle e teclado em todos (eventos usam encostar/atacar, sem botão novo); textos bilíngues.
- [ ] Medalhas (contadores de eventos) se fizer sentido; README (tabela de eventos).

---

## Fase 7 — Árvore: +4 passivos e +4 ataques por classe (80 poderes novos)

Estrutura atual (`classes.js`): `skills` base → `PASSIVES` → Teleporte (exceto Netrunner) → `LATE_PASSIVES` (níveis 20/28/36, marca `late`) → `ADV_POWERS` (40/50/60/70, marca `adv`, lógica em `SKILL_FN`). A árvore em `ui.js` (`TIERS`, `tierIdx`) agrupa pelas marcas. Nível máximo do personagem é infinito (`MAX_LEVEL`), XP `45·lvl^1.5`, `MAX_RANK = 30`. `sanitizeChar` já completa `c.skills` com zeros, então **só acrescentar no fim** (índices são save).

- [ ] Duas fileiras novas na árvore (marcas novas, ex.: `sup` para passivos e `apex` para ataques):
  - Passivos Supremos: níveis 75, 85, 95, 105.
  - Ataques Supremos: níveis 80, 90, 100, 110 (conferir com o usuário/medalhas qual nível os jogadores alcançam no Inferno; ajustar se for alto demais).
- [ ] `TIERS` em `ui.js`: `{ label: [75, 105], sup: true }`, `{ label: [80, 110], apex: true }`; generalizar `tierIdx` para a marca do tier (`t.mark`). Conferir layout no desktop, toque (paisagem, celular pequeno, rolagem) e navegação do controle.
- [ ] Passivos: `PFMT` pode ganhar chaves novas (ex.: `bossDmg`, `skillDmg`, `aoePct`), sempre somadas em `computeStats` (`passiveMods`).
- [ ] Ataques: `adv(...)`-like com `desc(r)` bilíngue, ícone novo em `ICONS` (SVG em linhas), função em `SKILL_FN` (reaproveitar `powers.js`: invocações, orbitais, buracos negros, tempestades), fx e som. Teste de cada um: usar via `__dbg` com inimigos spawnados e conferir dano/sem erro.
- [ ] Fazer **2 classes por commit** (5 commits), na ordem do `CLASS_ORDER`, para caber nos créditos e manter o jogo sempre funcionando.

Sugestões de tema (ajuste livre; nomes em pt/en):

| Classe | Passivos (75/85/95/105) | Ataques (80/90/100/110) |
|---|---|---|
| blade | Lâmina Ancestral, Kata Infinito, Espírito do Ronin, Shogun | Tempestade de Pétalas, Iaijutsu Absoluto, Clones de Sombra, Corte Dimensional |
| gunner | Cano Quente, Mira Fantasma, Sangue Frio, Mito do Velho Oeste | Tiro de Trilha (atravessa tudo), Granada Cluster, Dança das Balas, Canhão Orbital |
| netrunner | Criptografia Quântica, Botnet, Kernel Zero, Deus da Rede | Vírus em Cadeia, Firewall Ofensivo, Exército de Drones, Apagão Total |
| brawler | Punhos de Aço Puro, Couraça Hidráulica, Fúria Inquebrável, Lenda do Ringue | Terremoto, Gancho Foguete, Combo de 100 Socos, Meteoro Humano |
| pyro | Combustão Lenta, Pele de Magma, Chama Azul, Sol Interior | Muralha de Fogo, Dragão de Chamas, Chuva de Napalm, Nova Solar |
| frost | Cristal Vivo, Coração de Geleira, Nevasca Eterna, Rainha do Gelo | Lanças de Gelo, Prisão Glacial, Avalanche, Era do Gelo |
| heavy | Munição Infinita, Chassi Titânico, Calibre Pesado, Arsenal Vivo | Barragem de Mísseis, Torre Pesada, Mech de Batalha, Bomba Tática |
| hunter | Instinto Selvagem, Camuflagem, Veneno Raro, Rainha da Selva | Matilha de Lobos, Flecha Perfurante, Chuva de Flechas, Fera Lendária |
| lancer | Escudo de Valquíria, Raio Cativo, Asas de Aço, Rainha de Asgard | Lança Trovejante, Salto do Céu, Ragnarök, Ponte Bifrost |
| biohacker | DNA Adaptável, Nanocura, Toxina Dupla, Paciente Zero | Nuvem Mutante, Enxame de Nanobots, Pandemia, Forma Quimera |

- [ ] Docs: README (poderes por classe), `docs/CONTENT.md` (receita de "fileira nova da árvore"), og/meta se citarem número de habilidades.

---

## Como testar (resumo)

- Servidor: `npx http-server -p 8000 -c-1` (em segundo plano).
- Edge headless com `--remote-debugging-port=9333` e um perfil próprio (`--user-data-dir` temporário); guarde o PID e mate **só esse PID** no fim (nunca `taskkill` por nome: o usuário usa o Edge).
- Via CDP (Node 22 `WebSocket`): `import('/js/main.js')`, `startGame('blade', true)`, inspecionar `window.__G`, usar `__dbg.*` e `__dbg.sim(seg)`. Capturar `Runtime.exceptionThrown`/console de erro.
- Screenshots fora do repo ou na raiz (`*.png` na raiz é ignorado pelo git).
