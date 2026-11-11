// Geração procedural das masmorras, malhas, colisão, campo de fluxo e A*.
import * as THREE from 'three';
import { G, TILE, gk } from './state.js';
import { ri, rr, rnd, pick, clamp, shuffle, chance } from './utils.js';
import { L } from './i18n.js';

const NEON_LIGHT = { sky: 0x8a90ff, ground: 0x1a0f2a, hemi: 1.25, dir: 0xd8ccff, dirI: 1.5, fogNear: 22, fogFar: 44 };
export const THEMES = [
  { id: 'neon', name: L('Distrito Neon', 'Neon District'), a: 0x00f0ff, b: 0xff2bd6, floor: 0x2a2f4a, wall: 0x1a1d33, fog: 0x07061a, layout: 'rooms', features: ['puddles', 'rain'], hint: L('Cuidado com as poças elétricas!', 'Watch out for the electric puddles!') },
  { id: 'forest', name: L('Floresta Sombria', 'Dark Forest'), a: 0x7affc8, b: 0xb36bff, floor: 0x2a3a2a, wall: 0x14261a, cap: 0x1e3a22, fog: 0x050c0a, layout: 'cave', ground: 'soil', walls: 'natural', wallH: [1.6, 3.2], natural: true, fauna: ['ghost', 'wisp'], features: ['trees', 'mushrooms', 'fireflies', 'thorns'], light: { sky: 0x4a6a8a, ground: 0x0a1a10, hemi: 0.9, dir: 0x9ab0ff, dirI: 0.8, fogNear: 10, fogFar: 26 }, hint: L('Fantasmas atravessam paredes… e os espinhos machucam.', 'Ghosts pass through walls… and the thorns hurt.') },
  { id: 'factory', name: L('Fábrica Corporativa', 'Corporate Factory'), a: 0xff8a00, b: 0x2b8cff, floor: 0x3a3128, wall: 0x2a2118, fog: 0x0d0805, layout: 'rooms', features: ['conveyor', 'crusher'], hint: L('Esteiras empurram tudo e prensas esmagam inimigos também!', 'Conveyors push everything and presses crush enemies too!') },
  { id: 'snow', name: L('Picos Nevados', 'Snowy Peaks'), a: 0x8ad8ff, b: 0xffffff, floor: 0xaebccc, wall: 0x7e8ca0, cap: 0xc4d0de, fog: 0x6e8098, layout: 'meadow', ground: 'snow', walls: 'natural', wallH: [1.2, 2.6], natural: true, fauna: ['yeti', 'icewolf'], features: ['pines', 'ice', 'drifts', 'snowfall', 'blizzard'], light: { sky: 0xc8d8f0, ground: 0x4a5868, hemi: 1.0, dir: 0xe4ecff, dirI: 0.95, fogNear: 20, fogFar: 46 }, hint: L('Neve fofa deixa você lento; na nevasca não dá pra ver longe.', 'Deep snow slows you down; in a blizzard you can\'t see far.') },
  { id: 'meadow', name: L('Pradaria Mutante', 'Mutant Meadow'), a: 0xffe14d, b: 0xff6ad5, floor: 0x5a8a3a, wall: 0x3a6a2a, cap: 0x4a8a34, fog: 0x9ec8e8, layout: 'meadow', ground: 'grass', walls: 'natural', wallH: [0.9, 1.5], natural: true, fauna: ['boar', 'toad'], features: ['lakes', 'grass', 'flowers', 'boulders', 'butterflies'], light: { sky: 0xcfe8ff, ground: 0x4a6a2a, hemi: 2.0, dir: 0xfff0c8, dirI: 2.0, fogNear: 30, fogFar: 60 }, hint: L('Javalis mutantes avançam em linha reta: desvie para o lado!', 'Mutant boars charge in a straight line: sidestep them!') },
  { id: 'sewer', name: L('Esgotos Tóxicos', 'Toxic Sewers'), a: 0x39ff14, b: 0x9d4dff, floor: 0x24352c, wall: 0x16251d, fog: 0x040d08, layout: 'sewer', features: ['sludge'], hint: L('O lodo tóxico deixa você lento e causa dano.', 'Toxic sludge slows you down and hurts.') },
  { id: 'mountain', name: L('Passo da Montanha', 'Mountain Pass'), a: 0xffb35a, b: 0x8ab4ff, floor: 0x6a6660, wall: 0x4a4642, cap: 0xc8ccd4, fog: 0x8a96a8, layout: 'cave', ground: 'rock', walls: 'natural', wallH: [2.6, 4.8], natural: true, fauna: ['goat', 'eagle'], features: ['boulders', 'chasms', 'rockfall'], light: { sky: 0xc0d0e8, ground: 0x3a3630, hemi: 1.5, dir: 0xffe8c8, dirI: 1.7, fogNear: 16, fogFar: 40 }, hint: L('Pedras despencam dos penhascos: saia dos círculos!', 'Rocks tumble from the cliffs: get out of the circles!') },
  { id: 'space', name: L('Estação Orbital', 'Orbital Station'), a: 0x00f0ff, b: 0xffffff, floor: 0x3a4250, wall: 0x22283a, fog: 0x000000, layout: 'rooms', ground: 'deck', sky: 'stars', fauna: ['alien'], features: ['void', 'airlocks', 'stars'], light: { sky: 0x9ab8ff, ground: 0x0a0a1a, hemi: 1.2, dir: 0xffffff, dirI: 1.6, fogNear: 34, fogFar: 70 }, hint: L('Comportas de vácuo puxam tudo para o espaço. Fique longe dos buracos!', 'Vacuum airlocks pull everything into space. Stay away from the holes!') },
  { id: 'cryo', name: L('Laboratório Criogênico', 'Cryo Lab'), a: 0x8ad8ff, b: 0xd0f0ff, floor: 0x2c3c4e, wall: 0x1a2836, fog: 0x06101a, layout: 'cave', features: ['ice', 'vents'], hint: L('Gelo escorrega; as ventoinhas congelam inimigos (e deixam você lento).', 'Ice is slippery; vents freeze enemies (and slow you down).') },
  { id: 'desert', name: L('Deserto Radioativo', 'Radioactive Wasteland'), a: 0xc8ff3a, b: 0xff8a00, floor: 0xb08a5a, wall: 0x8a6a44, cap: 0xa88050, fog: 0xd8b088, layout: 'meadow', ground: 'sand', walls: 'natural', wallH: [1.0, 2.4], natural: true, fauna: ['scorpion'], features: ['radiation', 'cacti', 'sandstorm'], light: { sky: 0xffe0b0, ground: 0x6a4a2a, hemi: 1.9, dir: 0xffd8a0, dirI: 2.0, fogNear: 22, fogFar: 48 }, hint: L('Poças radioativas machucam e escorpiões envenenam.', 'Radioactive pools hurt and scorpions poison you.') },
  { id: 'volcano', name: L('Caldeira Vulcânica', 'Volcanic Caldera'), a: 0xff5a1a, b: 0xffd23d, floor: 0x3a2a26, wall: 0x2a1a16, cap: 0x4a2a1e, fog: 0x1a0805, layout: 'cave', ground: 'ash', walls: 'natural', wallH: [1.4, 3.2], natural: true, fauna: ['salamander', 'magmagolem'], features: ['lava', 'geysers', 'embers', 'boulders'], light: { sky: 0xff8a5a, ground: 0x2a0a04, hemi: 1.1, dir: 0xffa070, dirI: 1.2, fogNear: 14, fogFar: 34 }, hint: L('Rios de lava queimam muito; gêiseres avisam antes de jorrar.', 'Lava rivers burn badly; geysers flash before they erupt.') },
  { id: 'data', name: L('Núcleo de Dados', 'Data Core'), a: 0xff2244, b: 0x00f0ff, floor: 0x35202c, wall: 0x261420, fog: 0x0d040a, layout: 'grid', features: ['lasers'], hint: L('Grades de laser ligam e desligam: espere o momento certo.', 'Laser grids switch on and off: time your crossing.') },
  { id: 'market', name: L('Mercado Noturno', 'Night Market'), a: 0xffd23d, b: 0xff2bd6, floor: 0x3a2a30, wall: 0x2a1a22, fog: 0x100608, layout: 'market', features: ['stalls', 'merchant', 'lanterns'], hint: L('Há um mercador escondido em alguma praça.', 'A merchant is hiding in one of the plazas.') },
  // biomas selvagens (mecânicas em wilds.js)
  { id: 'bones', name: L('Floresta de Ossos', 'Bone Forest'), a: 0xff4d6a, b: 0x7affc8, floor: 0x8a8070, wall: 0x5a5244, cap: 0xd8cfb8, fog: 0x1a1410, layout: 'cave', ground: 'bone', walls: 'natural', wallH: [1.6, 3.4], natural: true, fauna: ['bonestalker', 'ghost'], features: ['ribs', 'trees', 'bonepiles', 'marrow', 'fireflies'], light: { sky: 0xd8c8b0, ground: 0x2a1e14, hemi: 1.25, dir: 0xffe8c8, dirI: 1.2, fogNear: 14, fogFar: 34 }, hint: L('Pilhas de ossos guardam medula que cura, mas quebrá-las faz barulho e atrai predadores. Inimigos na poça de medula se curam.', 'Bone piles hold healing marrow, but breaking them is loud and draws predators. Enemies standing in marrow pools heal.') },
  { id: 'glass', name: L('Deserto de Vidro', 'Glass Desert'), a: 0x6af0ff, b: 0xff6ad5, floor: 0xa8c8d0, wall: 0x7a9aa8, cap: 0xc8e8f0, fog: 0xb8d8e8, layout: 'meadow', ground: 'glass', walls: 'natural', wallH: [1.0, 2.6], natural: true, fauna: ['shardling', 'eagle'], features: ['crystals', 'glassfloor', 'shardstorm'], light: { sky: 0xe0f4ff, ground: 0x4a6a7a, hemi: 1.9, dir: 0xfff4e0, dirI: 2.0, fogNear: 24, fogFar: 52 }, hint: L('Explosões e golpes pesados racham o chão de vidro e deixam cacos cortantes. Golems de vidro somem nos reflexos e reaparecem ao seu lado.', 'Explosions and heavy blows crack the glass floor into cutting shards. Glass golems vanish into reflections and reappear beside you.') },
  { id: 'starswamp', name: L('Pântano de Estrelas Caídas', 'Fallen Star Swamp'), a: 0xb36bff, b: 0x6af0ff, floor: 0x2c3448, wall: 0x1c2230, cap: 0x2a3a2e, fog: 0x05060c, layout: 'cave', ground: 'mud', walls: 'natural', wallH: [1.2, 2.6], natural: true, fauna: ['starwisp', 'toad'], features: ['blackwater', 'craters', 'starshards', 'fireflies'], light: { sky: 0x7a6ac0, ground: 0x14142a, hemi: 1.4, dir: 0xb8b0ff, dirI: 1.2, fogNear: 14, fogFar: 34 }, hint: L('Nas crateras a gravidade é fraca: você corre mais e os tiros ficam lentos. Pegue os fragmentos estelares antes que as criaturas se energizem com eles.', 'Gravity is weak inside the craters: you run faster and shots slow down. Grab the star fragments before the creatures feed on them.') },
  { id: 'hive', name: L('Cidade-Colmeia', 'Hive City'), a: 0xffc21a, b: 0xff6a00, floor: 0x5a4220, wall: 0x6a4814, cap: 0xd8a040, fog: 0x1a0e02, layout: 'rooms', ground: 'wax', fauna: ['wasp'], features: ['resin', 'honey', 'sentinels'], light: { sky: 0xffc870, ground: 0x2a1404, hemi: 1.3, dir: 0xffd890, dirI: 1.4, fogNear: 18, fogFar: 40 }, hint: L('A resina prende os pés: explosões e fogo a queimam, mas a fumaça alerta o enxame. Mate as sentinelas antes que terminem de chamar reforços!', 'Resin glues your feet: explosions and fire burn it away, but the smoke alerts the swarm. Kill the sentinels before they finish calling reinforcements!') },
  { id: 'stonesea', name: L('Mar Petrificado', 'Petrified Sea'), a: 0x3ad8ff, b: 0xffd23d, floor: 0x6a7078, wall: 0x4a525c, cap: 0x8a96a0, fog: 0x3a4a5a, layout: 'meadow', ground: 'stone', walls: 'natural', wallH: [1.8, 3.6], natural: true, fauna: ['fossilcrab', 'eagle'], features: ['waves', 'wrecks', 'fossils', 'tides'], light: { sky: 0xb8d0e8, ground: 0x2a3440, hemi: 1.6, dir: 0xe8f0ff, dirI: 1.6, fogNear: 20, fogFar: 46 }, hint: L('Algumas áreas voltam a ser mar por alguns segundos: a correnteza arrasta todo mundo e deixa lento. Fique de olho nos círculos azuis.', 'Some areas turn back into sea for a few seconds: the current drags everyone and slows them down. Watch the blue circles.') },
  { id: 'armory', name: L('Jardim de Armas', 'Weapon Garden'), a: 0xff3a5a, b: 0xc8d8ff, floor: 0x3a4a34, wall: 0x2a3626, cap: 0x4a6a3a, fog: 0x0c140c, layout: 'meadow', ground: 'grass', walls: 'natural', wallH: [1.0, 1.8], natural: true, fauna: ['bladeknight', 'boar'], features: ['bladetrees', 'swordplants', 'shieldflowers', 'steelgrass'], light: { sky: 0xc8d8ff, ground: 0x2a3a2a, hemi: 1.6, dir: 0xfff0e0, dirI: 1.7, fogNear: 22, fogFar: 50 }, hint: L('Os inimigos arrancam espadas do chão e ficam mais fortes. Chegue antes: pegar uma espada dá Fúria a você.', 'Enemies pull swords out of the ground and grow stronger. Get there first: taking a sword gives you Fury.') },
  { id: 'titan', name: L('Montanha do Deus Adormecido', 'Sleeping God Mountain'), a: 0xff3a5a, b: 0xffb35a, floor: 0x7a4a48, wall: 0x5a3030, cap: 0x8a5a54, fog: 0x1a0808, layout: 'cave', ground: 'flesh', walls: 'natural', wallH: [2.0, 4.2], natural: true, fauna: ['antibody', 'toad'], features: ['veins', 'breath', 'heartbeat'], light: { sky: 0xffa090, ground: 0x2a0a0a, hemi: 1.2, dir: 0xffc0a8, dirI: 1.3, fogNear: 14, fogFar: 34 }, hint: L('A montanha respira e o vento empurra todos. As veias queimam a cada batida do coração. Destruição demais desperta as defesas do corpo!', 'The mountain breathes and the wind pushes everyone. The veins burn on every heartbeat. Too much destruction wakes the body\'s defenses!') },
  { id: 'ashwinter', name: L('Inverno de Cinzas', 'Ash Winter'), a: 0xff6a1a, b: 0xd8d8e0, floor: 0x8a8888, wall: 0x5a5656, cap: 0xb8b4b0, fog: 0x5a5454, layout: 'meadow', ground: 'ashsnow', walls: 'natural', wallH: [1.2, 2.6], natural: true, fauna: ['ashwolf', 'salamander'], features: ['deadtrees', 'ashfall', 'hiddenembers', 'gusts'], light: { sky: 0xc8c0b8, ground: 0x3a2a24, hemi: 1.35, dir: 0xffd8c0, dirI: 1.2, fogNear: 16, fogFar: 38 }, hint: L('Parece neve, mas é cinza: brasas escondidas queimam quem pisa. As rajadas de vento revelam as brasas e reacendem o fogo.', 'It looks like snow, but it is ash: hidden embers burn whoever steps on them. Wind gusts reveal the embers and rekindle the fire.') },
  { id: 'uprain', name: L('Floresta da Chuva Invertida', 'Upside-Down Rain Forest'), a: 0x4dd2ff, b: 0x9dff3a, floor: 0x2a4038, wall: 0x1a3028, cap: 0x2a5a3a, fog: 0x0a1a1e, layout: 'cave', ground: 'moss', walls: 'natural', wallH: [1.6, 3.2], natural: true, fauna: ['skyray', 'wisp'], features: ['trees', 'mushrooms', 'uprain', 'updrafts', 'skylakes'], light: { sky: 0x8ac8e8, ground: 0x0a2018, hemi: 1.25, dir: 0xc8e8ff, dirI: 1.1, fogNear: 14, fogFar: 34 }, hint: L('Entre numa corrente de chuva subindo para ser lançado ao alto e cair com um golpe no inimigo mais próximo. Tiros não atravessam as correntes.', 'Step into a rising rain current to be lifted up and slam down on the nearest enemy. Shots can\'t pass through the currents.') },
  { id: 'salt', name: L('Salinas dos Esquecidos', 'Salt Flats of the Forgotten'), a: 0xff4d6a, b: 0x3ad8d0, floor: 0xaaa49c, wall: 0x908880, cap: 0xc4beb4, fog: 0x9a948e, layout: 'meadow', ground: 'salt', walls: 'natural', wallH: [1.0, 2.2], natural: true, fauna: ['saltwraith', 'scorpion'], features: ['statues', 'brine', 'saltcrystals'], light: { sky: 0xf4ece4, ground: 0x4a3e38, hemi: 1.55, dir: 0xfff0e0, dirI: 1.5, fogNear: 24, fogFar: 54 }, hint: L('Cristais de sal guardam tesouros (brilho dourado) ou esquecidos antigos (brilho vermelho). Escolha o que libertar antes de enfrentar a sala.', 'Salt crystals hold treasure (golden glow) or ancient forgotten ones (red glow). Choose what to release before taking on the room.') },
];
THEMES.forEach((t) => (t.light = t.light || NEON_LIGHT));
THEMES.forEach((t) => (t.line = '#' + new THREE.Color(t.a).getHexString()));

export const BOSS_EVERY = 3;
export const isBossFloor = (f) => f % BOSS_EVERY === 0;
// último andar: batalha final contra os 7 chefes (2 de cada vez); vencer termina o jogo
export const FINAL_FLOOR = 30;
export const isFinalFloor = (f) => f >= FINAL_FLOOR;

// Bioma de cada andar (1 a 29): os mais fáceis no começo e todos aparecem até o andar 23
// (medalha de visitar todos). Mercados no 13 e no 25 (o 22 tem loja extra em biomes.js).
const FLOOR_THEMES = [null, 'neon', 'forest', 'factory', 'meadow', 'bones', 'sewer', 'snow', 'glass', 'mountain', 'armory', 'starswamp', 'space', 'market', 'cryo', 'hive', 'stonesea', 'desert', 'uprain', 'ashwinter', 'volcano', 'titan', 'salt', 'data', 'hive', 'market', 'glass', 'ashwinter', 'starswamp', 'titan'];
export function themeFor(floor) {
  if (isFinalFloor(floor)) return THEMES.find((t) => t.id === 'data'); // o coração da corporação
  const id = FLOOR_THEMES[floor];
  return (id && THEMES.find((t) => t.id === id)) || THEMES[(floor - 1) % THEMES.length];
}

// ------------------------------------------------------------------
// Geração
// ------------------------------------------------------------------
// Formato do andar, alternando em ciclos de 3: masmorra pequena, campo aberto, masmorra grande
// (a masmorra grande cai nos andares de chefe, com a arena no fim do caminho). `d.maze` marca as masmorras.
export function floorShape(floor) {
  const k = (floor - 1) % 3;
  return k === 0 ? 'dungS' : k === 1 ? 'open' : 'dungL';
}

export function generateDungeon(floor) {
  const theme = themeFor(floor);
  const shape = floorShape(floor);
  const base = Math.min(46 + floor * 3, 92);
  let layout = theme.layout;
  let W = base + (layout === 'market' ? 6 : 0);
  if (shape === 'dungS') {
    layout = 'dungS';
    W = clamp(Math.round(base * 0.8), 42, 70);
  } else if (shape === 'dungL') {
    layout = 'dungL';
    W = Math.min(base + 12, 96);
  } else if (!['cave', 'meadow', 'market'].includes(layout)) layout = 'plaza'; // campo aberto nos biomas de cidade: praças grandes
  const H = W;
  for (let attempt = 0; attempt < 30; attempt++) {
    const d = tryGenerate(floor, W, H, layout);
    if (d) return d;
  }
  return tryGenerate(floor, W, H, 'rooms', true);
}

function overlaps(rooms, x, y, w, h, gap) {
  for (const r of rooms) if (x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y) return true;
  return false;
}

// Salas ligadas por corredores (árvore mínima + alguns ciclos)
function genRooms(W, H, floor, o = {}) {
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const target = o.target ?? Math.min(7 + Math.floor(floor / 2), 15);
  const [mn, mx] = o.size ?? [6, 12];
  for (let t = 0; t < 800 && rooms.length < target; t++) {
    const w = ri(mn, mx);
    const h = ri(mn, mx);
    const x = ri(2, W - w - 3);
    const y = ri(2, H - h - 3);
    if (overlaps(rooms, x, y, w, h, o.gap ?? 3)) continue;
    rooms.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
  }
  for (const r of rooms) for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) grid[j * W + i] = TILE.FLOOR;
  connectRooms(grid, W, H, rooms, o.corridor ?? 2);
  return { grid, rooms };
}

function connectRooms(grid, W, H, rooms, width) {
  if (!rooms.length) return;
  const connected = [rooms[0]];
  const remaining = rooms.slice(1);
  const edges = [];
  while (remaining.length) {
    let best = null;
    let bd = Infinity;
    let bi = -1;
    remaining.forEach((r, k) => {
      for (const c of connected) {
        const dd = (r.cx - c.cx) ** 2 + (r.cy - c.cy) ** 2;
        if (dd < bd) {
          bd = dd;
          best = [r, c];
          bi = k;
        }
      }
    });
    edges.push(best);
    connected.push(best[0]);
    remaining.splice(bi, 1);
  }
  for (let k = 0; k < Math.floor(rooms.length / 3); k++) {
    const a = pick(rooms);
    const b = pick(rooms);
    if (a !== b) edges.push([a, b]);
  }
  for (const [a, b] of edges) carveCorridor(grid, W, H, Math.floor(a.cx), Math.floor(a.cy), Math.floor(b.cx), Math.floor(b.cy), width);
}

// Cavernas orgânicas (autômato celular)
function genCave(W, H, open = 0.55) {
  let grid = new Uint8Array(W * H);
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) grid[j * W + i] = rnd() < open ? TILE.FLOOR : TILE.WALL;
  for (let it = 0; it < 5; it++) {
    const ng = new Uint8Array(W * H);
    for (let j = 2; j < H - 2; j++)
      for (let i = 2; i < W - 2; i++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grid[(j + dy) * W + i + dx] !== TILE.FLOOR) walls++;
        ng[j * W + i] = walls >= 5 ? TILE.WALL : TILE.FLOOR;
      }
    grid = ng;
  }
  // mantém só a maior região conectada
  const seen = new Int32Array(W * H).fill(-1);
  let best = -1;
  let bestSize = 0;
  let id = 0;
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== TILE.FLOOR || seen[k] !== -1) continue;
    const q = [k];
    seen[k] = id;
    let size = 0;
    while (q.length) {
      const c = q.pop();
      size++;
      const ci = c % W;
      const cj = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (cj + dy) * W + ci + dx;
        if (grid[n] === TILE.FLOOR && seen[n] === -1) {
          seen[n] = id;
          q.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
    id++;
  }
  if (bestSize < W * H * 0.28) return null;
  for (let k = 0; k < W * H; k++) if (grid[k] === TILE.FLOOR && seen[k] !== best) grid[k] = TILE.WALL;
  // "salas" virtuais: blocos com bastante chão (usadas para posicionar inimigos)
  const rooms = [];
  const B = 11;
  for (let by = 2; by < H - B; by += B)
    for (let bx = 2; bx < W - B; bx += B) {
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let j = by; j < by + B; j++)
        for (let i = bx; i < bx + B; i++)
          if (grid[j * W + i] === TILE.FLOOR) {
            n++;
            sx += i;
            sy += j;
          }
      if (n < 45) continue;
      // centro: o tile de chão mais próximo do centróide
      let cx = Math.round(sx / n);
      let cy = Math.round(sy / n);
      let bd = Infinity;
      let fx = cx;
      let fy = cy;
      for (let j = by; j < by + B; j++)
        for (let i = bx; i < bx + B; i++)
          if (grid[j * W + i] === TILE.FLOOR) {
            const dd = (i - cx) ** 2 + (j - cy) ** 2;
            if (dd < bd) {
              bd = dd;
              fx = i;
              fy = j;
            }
          }
      rooms.push({ x: bx, y: by, w: B, h: B, cx: fx + 0.5, cy: fy + 0.5, cave: true });
    }
  rooms.sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
  // mantém o início e uma seleção espalhada das outras áreas
  const keep = Math.min(rooms.length, 6 + Math.floor(W / 12));
  const rest = shuffle(rooms.slice(1)).slice(0, keep - 1);
  return { grid, rooms: [rooms[0], ...rest] };
}

// Grade de salas alinhadas (Núcleo de Dados)
function genGrid(W, H) {
  const grid = new Uint8Array(W * H);
  const n = W > 64 ? 5 : 4;
  const S = Math.floor((W - 4) / n);
  const cells = [];
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++) {
      if (rnd() < 0.12) {
        cells.push(null);
        continue;
      }
      const w = ri(5, S - 3);
      const h = ri(5, S - 3);
      const x = 2 + gx * S + ri(1, S - w - 1);
      const y = 2 + gy * S + ri(1, S - h - 1);
      const r = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
      cells.push(r);
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * W + i] = TILE.FLOOR;
    }
  const rooms = cells.filter(Boolean);
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++) {
      const a = cells[gy * n + gx];
      if (!a) continue;
      const right = gx + 1 < n ? cells[gy * n + gx + 1] : null;
      const down = gy + 1 < n ? cells[(gy + 1) * n + gx] : null;
      if (right) carveCorridor(grid, W, H, Math.floor(a.cx), Math.floor(a.cy), Math.floor(right.cx), Math.floor(right.cy), 2);
      if (down) carveCorridor(grid, W, H, Math.floor(a.cx), Math.floor(a.cy), Math.floor(down.cx), Math.floor(down.cy), 2);
    }
  // garante conexão total (células vazias podem isolar partes)
  connectRooms(grid, W, H, rooms, 2);
  return { grid, rooms };
}

// Masmorra: salas grandes bem juntas (paredes entre elas), ligadas às vizinhas mais próximas por
// corredores largos, com vários ciclos para não ter becos. As salas de verdade vêm primeiro em
// `rooms` (a do início na frente, num canto; a segunda no canto oposto, para a saída ficar longe);
// depois vêm trechos de corredor (`hall`) para espalhar inimigos, cofres e santuários.
function genDungeon(W, H, big) {
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const gap = 3;
  const [mn, mx] = big ? [9, 17] : [8, 14];
  const add = (x, y, w, h) => {
    const r = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    rooms.push(r);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * W + i] = TILE.FLOOR;
    return r;
  };
  const corner = ri(0, 3);
  const sw = 9;
  add(corner & 1 ? W - 3 - sw : 3, corner & 2 ? H - 3 - sw : 3, sw, sw);
  const ew = big ? 14 : 12;
  add(corner & 1 ? 3 : W - 3 - ew, corner & 2 ? 3 : H - 3 - ew, ew, ew);
  // as primeiras sorteadas são grandes: cabem os quebra-cabeças (luzes, prismas, pares, upload)
  for (let t = 0; t < 2500 && rooms.length < 40; t++) {
    const first = rooms.length < 5 && t < 400;
    const w = first ? ri(13, mx + 1) : ri(mn, mx);
    const h = first ? ri(13, mx + 1) : ri(mn, mx);
    const x = ri(3, W - w - 3);
    const y = ri(3, H - h - 3);
    if (overlaps(rooms, x, y, w, h, gap)) continue;
    add(x, y, w, h);
  }
  // ligações: árvore pelas vizinhas mais próximas + cada sala liga também à segunda mais próxima (ciclos)
  const dist = (p, q) => Math.hypot(p.cx - q.cx, p.cy - q.cy);
  const edges = new Set();
  const key = (i, j) => (i < j ? i * 100 + j : j * 100 + i);
  const inTree = [0];
  const rest = rooms.map((_, i) => i).slice(1);
  while (rest.length) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (const i of rest)
      for (const j of inTree) {
        const dd = dist(rooms[i], rooms[j]);
        if (dd < bd) {
          bd = dd;
          bi = i;
          bj = j;
        }
      }
    edges.add(key(bi, bj));
    inTree.push(bi);
    rest.splice(rest.indexOf(bi), 1);
  }
  rooms.forEach((r, i) => {
    const near = rooms.map((o, j) => [dist(r, o), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]);
    if (near[1] && near[1][0] < (big ? 34 : 28) && chance(0.7)) edges.add(key(i, near[1][1]));
  });
  const cw = big ? 4 : 3;
  for (const k of edges) {
    const p = rooms[Math.floor(k / 100)];
    const q = rooms[k % 100];
    carveCorridor(grid, W, H, Math.floor(p.cx) - 1, Math.floor(p.cy) - 1, Math.floor(q.cx) - 1, Math.floor(q.cy) - 1, cw);
  }
  // no pequeno, a maior sala sorteada fica livre de obstáculos, buracos e lojas (praça para os quebra-cabeças)
  if (!big && rooms.length > 2) rooms.slice(2).reduce((p, q) => (q.w * q.h > p.w * p.h ? q : p)).plaza = true;
  // trechos de corredor longe das salas (para espalhar inimigos e achados pelos corredores)
  const B = 10;
  const halls = [];
  for (let by = 2; by + B <= H - 2; by += B)
    for (let bx = 2; bx + B <= W - 2; bx += B) {
      if (rooms.some((o) => bx < o.x + o.w && bx + B > o.x && by < o.y + o.h && by + B > o.y)) continue;
      let n = 0;
      let best = null;
      let bd = Infinity;
      for (let j = by; j < by + B; j++)
        for (let i = bx; i < bx + B; i++) {
          if (grid[j * W + i] !== TILE.FLOOR) continue;
          n++;
          const dd = (i - bx - B / 2) ** 2 + (j - by - B / 2) ** 2;
          if (dd < bd) {
            bd = dd;
            best = [i, j];
          }
        }
      if (n >= 12) halls.push({ x: bx, y: by, w: B, h: B, cx: best[0] + 0.5, cy: best[1] + 0.5, cave: true, hall: true });
    }
  return { grid, rooms: [...rooms, ...shuffle(halls).slice(0, Math.ceil(halls.length * 0.6))] };
}

// Praças: salas grandes e corredores largos (campo aberto nos biomas de cidade)
function genPlaza(W, H, floor) {
  return genRooms(W, H, floor, { target: Math.min(5 + Math.floor(W / 20), 9), size: [12, 18], gap: 4, corridor: 3 });
}

function tryGenerate(floor, W, H, layout, force) {
  let base;
  if (layout === 'dungS' || layout === 'dungL') base = genDungeon(W, H, layout === 'dungL');
  else if (layout === 'plaza') base = genPlaza(W, H, floor);
  else if (layout === 'cave') base = genCave(W, H);
  else if (layout === 'meadow') base = genCave(W, H, 0.64);
  else if (layout === 'grid') base = genGrid(W, H);
  else if (layout === 'market') base = genRooms(W, H, floor, { target: 5, size: [13, 19], gap: 4, corridor: 3 });
  else if (layout === 'sewer') base = genRooms(W, H, floor, { corridor: 3, size: [6, 10] });
  else base = genRooms(W, H, floor);
  if (!base) return null;
  const { grid, rooms } = base;
  if (rooms.length < (layout === 'market' ? 3 : 5) && !force) return null;
  const d = { W, H, grid, rooms, floor, layout, maze: layout === 'dungS' ? 'S' : layout === 'dungL' ? 'L' : null };
  const start = rooms[0];
  d.start = { x: Math.floor(start.cx) + 0.5, z: Math.floor(start.cy) + 0.5 };

  // Sala de saída: a mais distante (em passos) do início
  const dist = bfs(d, Math.floor(d.start.x), Math.floor(d.start.z), 9999);
  let exitRoom = rooms[1];
  let bestD = -1;
  for (const r of rooms) {
    if (r === start || r.hall) continue; // na masmorra a saída fica numa sala de verdade
    const v = dist[Math.floor(r.cy) * W + Math.floor(r.cx)];
    if (v > bestD) {
      bestD = v;
      exitRoom = r;
    }
  }
  if (bestD < 10 && !force) return null;
  d.exitRoom = exitRoom;
  d.exit = { x: Math.floor(exitRoom.cx) + 0.5, z: Math.floor(exitRoom.cy) + 0.5 };

  // Pilares (obstáculos) em salas grandes
  for (const r of rooms) {
    if (r === start || r.w < 8 || r.h < 8 || r.cave || r.plaza || layout === 'market') continue;
    const n = ri(1, 4);
    for (let k = 0; k < n * 4 && r.pillars !== n; k++) {
      const i = ri(r.x + 2, r.x + r.w - 3);
      const j = ri(r.y + 2, r.y + r.h - 3);
      if (Math.abs(i + 0.5 - d.exit.x) < 2.5 && Math.abs(j + 0.5 - d.exit.z) < 2.5) continue;
      if (Math.abs(i + 0.5 - r.cx) < 1.5 && Math.abs(j + 0.5 - r.cy) < 1.5) continue;
      let free = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[(j + dy) * W + i + dx] !== TILE.FLOOR) free = false;
      if (!free) continue;
      grid[j * W + i] = TILE.OBST;
      r.pillars = (r.pillars || 0) + 1;
    }
  }

  // andar de chefe: abre uma arena grande em volta da saída
  if (isBossFloor(floor)) {
    const R = isFinalFloor(floor) ? 10 : 7; // a batalha final precisa de espaço para dois chefes
    const x0 = clamp(Math.floor(d.exit.x) - R, 2, W - 3 - 2 * R);
    const y0 = clamp(Math.floor(d.exit.z) - R, 2, H - 3 - 2 * R);
    for (let j = y0; j <= y0 + 2 * R; j++) for (let i = x0; i <= x0 + 2 * R; i++) grid[j * W + i] = TILE.FLOOR;
    d.exit = { x: x0 + R + 0.5, z: y0 + R + 0.5 };
    const arena = { x: x0, y: y0, w: 2 * R + 1, h: 2 * R + 1, cx: d.exit.x, cy: d.exit.z, arena: true };
    d.rooms[d.rooms.indexOf(d.exitRoom)] = arena;
    d.exitRoom = arena;
    d.arena = { ...arena, cz: d.exit.z };
  }
  d.explored = new Uint8Array(W * H);
  d.flow = new Int16Array(W * H).fill(-1);
  d.feat = new Uint8Array(W * H);
  d.props = [];
  return d;
}

function carveCorridor(grid, W, H, x1, y1, x2, y2, width = 2) {
  const carve = (x, y) => {
    for (let dy = 0; dy < width; dy++)
      for (let dx = 0; dx < width; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx > 1 && yy > 1 && xx < W - 2 && yy < H - 2) grid[yy * W + xx] = TILE.FLOOR;
      }
  };
  if (rnd() < 0.5) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y1);
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x2, y);
  } else {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x1, y);
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y2);
  }
}

// ------------------------------------------------------------------
// Consultas de grade
// ------------------------------------------------------------------
export function tileAt(d, i, j) {
  if (i < 0 || j < 0 || i >= d.W || j >= d.H) return TILE.WALL;
  return d.grid[j * d.W + i];
}
export function isWalkable(d, x, z) {
  return tileAt(d, Math.floor(x), Math.floor(z)) === TILE.FLOOR;
}
export function isWalkableTile(d, i, j) {
  return tileAt(d, i, j) === TILE.FLOOR;
}

// Empurra um círculo para fora das paredes
export function resolveCircle(d, e) {
  const r = e.r;
  for (let pass = 0; pass < 2; pass++) {
    const i0 = Math.floor(e.x - r);
    const i1 = Math.floor(e.x + r);
    const j0 = Math.floor(e.z - r);
    const j1 = Math.floor(e.z + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (tileAt(d, i, j) === TILE.FLOOR) continue;
        const cx = clamp(e.x, i, i + 1);
        const cz = clamp(e.z, j, j + 1);
        const dx = e.x - cx;
        const dz = e.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const dd = Math.sqrt(d2);
            e.x += (dx / dd) * (r - dd);
            e.z += (dz / dd) * (r - dd);
          } else {
            // centro dentro do bloco: empurra pelo menor eixo
            const left = e.x - i;
            const right = i + 1 - e.x;
            const top = e.z - j;
            const bottom = j + 1 - e.z;
            const m = Math.min(left, right, top, bottom);
            if (m === left) e.x = i - r;
            else if (m === right) e.x = i + 1 + r;
            else if (m === top) e.z = j - r;
            else e.z = j + 1 + r;
          }
        }
      }
    }
  }
}

export function lineOfSight(d, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l = Math.hypot(dx, dz);
  const steps = Math.ceil(l / 0.3);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (blocksSight(d, x1 + dx * t, z1 + dz * t)) return false;
  }
  return true;
}

// Paredes e obstáculos bloqueiam visão e tiros; lagos/vácuo (PIT) não
export function blocksSight(d, x, z) {
  const t = tileAt(d, Math.floor(x), Math.floor(z));
  return t === TILE.WALL || t === TILE.OBST;
}

// BFS genérica a partir de um bloco (usada para fluxo e escolha da saída)
const DIRS8 = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4], [1, -1, 1.4], [-1, 1, 1.4], [-1, -1, 1.4],
];
function bfs(d, si, sj, maxSteps, out) {
  const { W, H } = d;
  const dist = out || new Int16Array(W * H);
  dist.fill(-1);
  if (!isWalkableTile(d, si, sj)) return dist;
  const q = new Int32Array(W * H);
  let h = 0;
  let t = 0;
  q[t++] = sj * W + si;
  dist[sj * W + si] = 0;
  while (h < t) {
    const c = q[h++];
    const ci = c % W;
    const cj = (c / W) | 0;
    const cd = dist[c];
    if (cd >= maxSteps) continue;
    for (let k = 0; k < 4; k++) {
      const ni = ci + DIRS8[k][0];
      const nj = cj + DIRS8[k][1];
      const n = nj * W + ni;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (dist[n] !== -1 || d.grid[n] !== TILE.FLOOR) continue;
      dist[n] = cd + 1;
      q[t++] = n;
    }
  }
  return dist;
}

// Distância andando (em blocos) de um ponto a todo o mapa; -1 = inalcançável
export function distFrom(d, x, z) {
  return bfs(d, Math.floor(x), Math.floor(z), 32000);
}

// Segundos para percorrer, partindo de (x, z), todos os pontos (na ordem gulosa do mais perto), com
// folga para lutas e erros de caminho: o maior entre a reta x1,6 (o cálculo antigo) e o caminho de
// verdade x1,3 (na masmorra x1,5, porque o jogador não conhece o caminho e erra algumas portas).
// Com `each`, devolve também os segundos de cada trecho, na ordem visitada.
export function routeTime(d, x, z, pts, each) {
  const k = d.maze ? 1.5 : 1.3;
  const left = pts.slice();
  const legs = [];
  let tot = 0;
  while (left.length) {
    const map = distFrom(d, x, z);
    const cost = (p) => {
      const v = map[Math.floor(p.z) * d.W + Math.floor(p.x)];
      return Math.max(Math.hypot(p.x - x, p.z - z) * 1.6, v >= 0 ? v * k : 0) / 4.6;
    };
    let bi = 0;
    let bc = Infinity;
    left.forEach((p, i) => {
      const c = cost(p);
      if (c < bc) {
        bc = c;
        bi = i;
      }
    });
    const p = left.splice(bi, 1)[0];
    legs.push({ p, s: bc });
    tot += bc;
    x = p.x;
    z = p.z;
  }
  return each ? { tot, legs } : tot;
}

export function computeFlow(d, x, z) {
  bfs(d, Math.floor(x), Math.floor(z), 40, d.flow);
}

// Direção para descer o campo de fluxo em direção ao jogador
export function flowDir(d, x, z) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const here = d.flow[j * d.W + i];
  if (here < 0) return null;
  let best = here;
  let bi = 0;
  let bj = 0;
  for (const [dx, dy] of DIRS8) {
    const ni = i + dx;
    const nj = j + dy;
    if (!isWalkableTile(d, ni, nj)) continue;
    if (dx && dy && (!isWalkableTile(d, i + dx, j) || !isWalkableTile(d, i, j + dy))) continue;
    const v = d.flow[nj * d.W + ni];
    if (v >= 0 && v < best) {
      best = v;
      bi = dx;
      bj = dy;
    }
  }
  if (bi === 0 && bj === 0) return null;
  const tx = i + bi + 0.5 - x;
  const tz = j + bj + 0.5 - z;
  const l = Math.hypot(tx, tz) || 1;
  return { x: tx / l, z: tz / l };
}

// A* com 8 direções, retorna pontos do mundo (com suavização por linha de visão)
export function findPath(d, sx, sz, tx, tz, maxNodes = 4000) {
  const { W } = d;
  let ti = Math.floor(tx);
  let tj = Math.floor(tz);
  if (!isWalkableTile(d, ti, tj)) {
    // procura o bloco livre mais próximo do destino
    let found = false;
    for (let r = 1; r < 4 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++)
        for (let dx = -r; dx <= r && !found; dx++)
          if (isWalkableTile(d, ti + dx, tj + dy)) {
            ti += dx;
            tj += dy;
            found = true;
          }
    }
    if (!found) return null;
    tx = ti + 0.5;
    tz = tj + 0.5;
  }
  const si = Math.floor(sx);
  const sj = Math.floor(sz);
  if (si === ti && sj === tj) return [{ x: tx, z: tz }];
  if (walkClear(d, sx, sz, tx, tz)) return [{ x: tx, z: tz }];

  const start = sj * W + si;
  const goal = tj * W + ti;
  const g = new Map([[start, 0]]);
  const came = new Map();
  const open = [{ n: start, f: 0 }];
  const closed = new Set();
  let nodes = 0;
  while (open.length && nodes < maxNodes) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const cur = open[bi].n;
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    nodes++;
    const ci = cur % W;
    const cj = (cur / W) | 0;
    for (const [dx, dy, c] of DIRS8) {
      const ni = ci + dx;
      const nj = cj + dy;
      if (!isWalkableTile(d, ni, nj)) continue;
      if (dx && dy && (!isWalkableTile(d, ci + dx, cj) || !isWalkableTile(d, ci, cj + dy))) continue;
      const n = nj * W + ni;
      const ng = g.get(cur) + c;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        const h = Math.hypot(ni - ti, nj - tj);
        open.push({ n, f: ng + h });
      }
    }
  }
  if (!came.has(goal)) return null;
  const raw = [];
  let c = goal;
  while (c !== start) {
    raw.push({ x: (c % W) + 0.5, z: ((c / W) | 0) + 0.5 });
    c = came.get(c);
  }
  raw.reverse();
  raw[raw.length - 1] = { x: tx, z: tz };
  // suavização: estica cada trecho reto enquanto der para andar (não corta por cima de lagos nem quinas)
  const out = [];
  let ax = sx;
  let az = sz;
  let k = 0;
  while (k < raw.length) {
    let far = k;
    while (far + 1 < raw.length && walkClear(d, ax, az, raw[far + 1].x, raw[far + 1].z)) far++;
    out.push(raw[far]);
    ax = raw[far].x;
    az = raw[far].z;
    k = far + 1;
  }
  return out;
}

// dá para andar em linha reta de A até B? (só chão; confere a largura do corpo, não só a linha do meio)
function walkClear(d, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return true;
  const ox = (-dz / l) * 0.32;
  const oz = (dx / l) * 0.32;
  const steps = Math.ceil(l / 0.25);
  for (let s = 1; s <= steps; s++) {
    const x = x1 + (dx * s) / steps;
    const z = z1 + (dz * s) / steps;
    if (!isWalkable(d, x, z) || !isWalkable(d, x + ox, z + oz) || !isWalkable(d, x - ox, z - oz)) return false;
  }
  return true;
}

export function randomFloorInRoom(d, r, margin = 1) {
  for (let t = 0; t < 40; t++) {
    const i = ri(r.x + margin, r.x + r.w - 1 - margin);
    const j = ri(r.y + margin, r.y + r.h - 1 - margin);
    if (isWalkableTile(d, i, j)) return { x: i + rr(0.3, 0.7), z: j + rr(0.3, 0.7) };
  }
  return { x: r.cx, z: r.cy };
}

export function revealAround(d, x, z, radius) {
  const ci = Math.floor(x);
  const cj = Math.floor(z);
  const newly = [];
  for (let j = cj - radius; j <= cj + radius; j++) {
    for (let i = ci - radius; i <= ci + radius; i++) {
      if (i < 0 || j < 0 || i >= d.W || j >= d.H) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > radius * radius) continue;
      const k = j * d.W + i;
      if (d.hidden && d.hidden[k]) continue; // Sala Secreta ainda fechada
      if (!d.explored[k]) {
        d.explored[k] = 1;
        newly.push(k);
      }
    }
  }
  return newly;
}

// ------------------------------------------------------------------
// Malhas
// ------------------------------------------------------------------
const WALL_H = 1.7;
const LOW_H = 0.32;

function naturalTexture(style) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const base = { soil: '#8a8a7a', grass: '#b8c8a0', sand: '#d8c8a8', snow: '#d4dce8', rock: '#9a968e', ash: '#6a5e5a', bone: '#c8bca4', glass: '#c8e0e8', mud: '#3a4048', wax: '#c89a48', stone: '#8a9098', flesh: '#b87a74', ashsnow: '#b0acaa', moss: '#7a9a80', salt: '#ece8e0' }[style];
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${Math.random() * 0.14})` : `rgba(255,255,255,${Math.random() * 0.1})`;
    if (style === 'grass') {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      g.fillRect(x, y, 1, 3 + Math.random() * 4);
    } else g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 2 + Math.random() * 2);
  }
  if (style === 'soil') {
    // folhas secas
    for (let k = 0; k < 24; k++) {
      g.fillStyle = `rgba(${60 + Math.random() * 40},${50 + Math.random() * 30},20,0.45)`;
      g.beginPath();
      g.ellipse(Math.random() * 128, Math.random() * 128, 3, 1.5, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (style === 'rock') {
    // rachaduras na rocha
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      let x = Math.random() * 128;
      let y = Math.random() * 128;
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) g.lineTo((x += (Math.random() - 0.5) * 30), (y += (Math.random() - 0.5) * 30));
      g.stroke();
    }
  }
  if (style === 'ash') {
    // veios de magma brilhando nas cinzas
    g.strokeStyle = 'rgba(255,110,30,0.35)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      let x = Math.random() * 128;
      let y = Math.random() * 128;
      g.moveTo(x, y);
      for (let s = 0; s < 3; s++) g.lineTo((x += (Math.random() - 0.5) * 26), (y += (Math.random() - 0.5) * 26));
      g.stroke();
    }
  }
  if (style === 'snow') {
    // pegadas e brilho da neve
    for (let k = 0; k < 40; k++) {
      g.fillStyle = 'rgba(160,190,230,0.25)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  }
  if (style === 'sand') {
    g.strokeStyle = 'rgba(120,80,40,0.18)';
    for (let y = 8; y < 128; y += 16) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x / 10 + y) * 3);
      g.stroke();
    }
  }
  wildTexture(g, style);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// detalhes dos pisos dos biomas selvagens
function wildTexture(g, style) {
  const R = Math.random;
  const crack = (n, len, col, w = 1) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    for (let k = 0; k < n; k++) {
      g.beginPath();
      let x = R() * 128;
      let y = R() * 128;
      g.moveTo(x, y);
      for (let s2 = 0; s2 < 4; s2++) g.lineTo((x += (R() - 0.5) * len), (y += (R() - 0.5) * len));
      g.stroke();
    }
  };
  if (style === 'bone') {
    // lascas de osso e manchas de medula
    for (let k = 0; k < 18; k++) {
      g.fillStyle = 'rgba(245,238,220,0.55)';
      g.save();
      g.translate(R() * 128, R() * 128);
      g.rotate(R() * 3);
      g.fillRect(-5, -1, 10, 2.5);
      g.beginPath();
      g.arc(-5, 0, 2, 0, 7);
      g.arc(5, 0, 2, 0, 7);
      g.fill();
      g.restore();
    }
    for (let k = 0; k < 6; k++) {
      g.fillStyle = 'rgba(160,40,50,0.18)';
      g.beginPath();
      g.arc(R() * 128, R() * 128, 3 + R() * 5, 0, 7);
      g.fill();
    }
  } else if (style === 'glass') {
    // facetas de vidro com reflexo
    crack(10, 40, 'rgba(255,255,255,0.55)');
    crack(6, 30, 'rgba(60,110,140,0.35)');
    for (let k = 0; k < 12; k++) {
      g.fillStyle = `rgba(${R() < 0.5 ? '255,140,230' : '120,240,255'},0.18)`;
      g.beginPath();
      const x = R() * 128;
      const y = R() * 128;
      g.moveTo(x, y);
      g.lineTo(x + 8 + R() * 10, y + R() * 6);
      g.lineTo(x + R() * 6, y + 8 + R() * 10);
      g.fill();
    }
  } else if (style === 'mud') {
    // lama escura com pontinhos de poeira estelar
    for (let k = 0; k < 10; k++) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(R() * 128, R() * 128, 6 + R() * 8, 3 + R() * 4, R() * 3, 0, 7);
      g.fill();
    }
    for (let k = 0; k < 30; k++) {
      g.fillStyle = R() < 0.5 ? 'rgba(180,120,255,0.5)' : 'rgba(120,240,255,0.45)';
      g.fillRect(R() * 128, R() * 128, 1.5, 1.5);
    }
  } else if (style === 'wax') {
    // favos hexagonais
    g.strokeStyle = 'rgba(90,50,10,0.45)';
    g.lineWidth = 1.5;
    const r = 8;
    for (let row = -1; row < 10; row++)
      for (let col = -1; col < 10; col++) {
        const cx = col * r * 1.5;
        const cy = row * r * 1.732 + (col % 2 ? r * 0.866 : 0);
        g.beginPath();
        for (let a = 0; a < 6; a++) g.lineTo(cx + Math.cos((a * Math.PI) / 3) * r, cy + Math.sin((a * Math.PI) / 3) * r);
        g.closePath();
        g.stroke();
        if (R() < 0.15) {
          g.fillStyle = 'rgba(255,190,40,0.35)';
          g.fill();
        }
      }
  } else if (style === 'stone') {
    // ondas congeladas na pedra
    g.strokeStyle = 'rgba(40,50,60,0.3)';
    g.lineWidth = 2;
    for (let y = 6; y < 128; y += 14) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 6) g.lineTo(x, y + Math.sin(x / 9 + y * 0.7) * 4);
      g.stroke();
    }
    g.strokeStyle = 'rgba(220,235,255,0.2)';
    g.lineWidth = 1;
    for (let y = 9; y < 128; y += 14) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 6) g.lineTo(x, y + Math.sin(x / 9 + y * 0.7) * 4);
      g.stroke();
    }
  } else if (style === 'flesh') {
    // pele com poros e veias
    for (let k = 0; k < 60; k++) {
      g.fillStyle = 'rgba(90,30,30,0.3)';
      g.beginPath();
      g.arc(R() * 128, R() * 128, 0.8 + R() * 1.2, 0, 7);
      g.fill();
    }
    crack(6, 34, 'rgba(160,30,60,0.4)', 2);
  } else if (style === 'ashsnow') {
    // cinza fofa com brasas fracas por baixo
    for (let k = 0; k < 50; k++) {
      g.fillStyle = 'rgba(230,226,222,0.3)';
      g.fillRect(R() * 128, R() * 128, 2, 2);
    }
    for (let k = 0; k < 10; k++) {
      g.fillStyle = 'rgba(255,110,30,0.22)';
      g.fillRect(R() * 128, R() * 128, 1.5, 1.5);
    }
  } else if (style === 'moss') {
    for (let k = 0; k < 120; k++) {
      g.fillStyle = R() < 0.5 ? 'rgba(40,90,50,0.35)' : 'rgba(160,220,170,0.2)';
      g.beginPath();
      g.arc(R() * 128, R() * 128, 1 + R() * 2, 0, 7);
      g.fill();
    }
    for (let k = 0; k < 12; k++) {
      g.fillStyle = 'rgba(120,200,255,0.35)';
      g.beginPath();
      g.arc(R() * 128, R() * 128, 1.2, 0, 7);
      g.fill();
    }
  } else if (style === 'salt') {
    // crosta de sal em polígonos
    crack(14, 36, 'rgba(150,140,128,0.4)');
    for (let k = 0; k < 40; k++) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(R() * 128, R() * 128, 1.5, 1.5);
    }
  }
}

function deckTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b8c0cc';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  for (let k = 16; k < 128; k += 16) {
    g.beginPath();
    g.moveTo(k, 6);
    g.lineTo(k, 122);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,240,255,0.35)';
  g.fillRect(6, 60, 116, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function floorTexture(theme) {
  if (['soil', 'grass', 'sand', 'snow', 'rock', 'ash', 'bone', 'glass', 'mud', 'wax', 'stone', 'flesh', 'ashsnow', 'moss', 'salt'].includes(theme.ground)) return naturalTexture(theme.ground);
  if (theme.ground === 'deck') return deckTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa0b8';
  g.fillRect(0, 0, 128, 128);
  // placas metálicas
  g.fillStyle = '#8a90a8';
  g.fillRect(4, 4, 58, 58);
  g.fillRect(66, 66, 58, 58);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 128);
  g.moveTo(0, 64);
  g.lineTo(128, 64);
  g.stroke();
  for (let k = 0; k < 140; k++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [x, y] of [[8, 8], [56, 8], [8, 56], [56, 56]]) {
    g.beginPath();
    g.arc(x, y, 2, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const SIGN_WORDS = ['NEON', 'BAR', '24H', 'HOTEL', 'RAMEN', 'ネオン', 'データ', 'CLINIC', 'ARCADE', 'SUSHI', 'CYBER', 'TECH', 'OPEN', '危険', 'ZONA 9', 'NO EXIT', 'メトロ', 'BIO', 'LAB'];

function signTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 96);
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = color;
  g.font = 'bold 54px Orbitron, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDungeonMeshes(d, theme) {
  const group = new THREE.Group();
  const { W, H, grid } = d;

  // --- piso ---
  const floorTiles = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (grid[j * W + i] !== TILE.WALL && grid[j * W + i] !== TILE.PIT) floorTiles.push([i, j]);
  const natural = theme.walls === 'natural';
  const floorGeo = new THREE.PlaneGeometry(1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTexture(theme), color: theme.floor });
  const floorMesh = new THREE.InstancedMesh(floorGeo, floorMat, floorTiles.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  floorTiles.forEach(([i, j], k) => {
    m4.makeTranslation(i + 0.5, 0, j + 0.5);
    floorMesh.setMatrixAt(k, m4);
    const v = natural ? rr(0.8, 1.15) : rr(0.85, 1.1);
    col.setRGB(v, v, v);
    floorMesh.setColorAt(k, col);
  });
  group.add(floorMesh);
  if (natural) d.noLines = true;

  // linhas de neon no chão dos corredores/salas (decoração)
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(0.55), transparent: true, opacity: 0.55, depthWrite: false });
  const lineGeo = new THREE.PlaneGeometry(1, 0.05);
  lineGeo.rotateX(-Math.PI / 2);
  const roomLines = [];
  for (const r of d.rooms) {
    if (r.cave || d.noLines) continue;
    const inset = 0.6;
    roomLines.push([r.x + inset, r.y + inset, r.x + r.w - inset, r.y + inset]);
    roomLines.push([r.x + inset, r.y + r.h - inset, r.x + r.w - inset, r.y + r.h - inset]);
    roomLines.push([r.x + inset, r.y + inset, r.x + inset, r.y + r.h - inset]);
    roomLines.push([r.x + r.w - inset, r.y + inset, r.x + r.w - inset, r.y + r.h - inset]);
  }
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, roomLines.length);
  roomLines.forEach(([x1, z1, x2, z2], k) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(-(z2 - z1), x2 - x1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    m4.compose(new THREE.Vector3((x1 + x2) / 2, 0.012, (z1 + z2) / 2), q, new THREE.Vector3(len, 1, 1));
    lines.setMatrixAt(k, m4);
  });
  group.add(lines);

  // --- paredes ---
  const walls = [];
  const isFloorish = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] !== TILE.WALL;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const t = grid[j * W + i];
      if (t === TILE.FLOOR) continue;
      if (t === TILE.OBST) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (isFloorish(i + dx, j + dy)) near = true;
      if (near) {
        const base = theme.wallH ? rr(theme.wallH[0], theme.wallH[1]) : WALL_H;
        walls.push({ i, j, x: i + 0.5, z: j + 0.5, h: base, base, target: base, strips: [], signs: [] });
      }
    }
  }
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallGeo.translate(0, 0.5, 0);
  const wallMat = new THREE.MeshLambertMaterial({ color: theme.wall });
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
  wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  walls.forEach((w, k) => {
    m4.makeScale(1, w.h, 1).setPosition(w.x, 0, w.z);
    wallMesh.setMatrixAt(k, m4);
    const v = natural ? rr(0.7, 1.3) : rr(0.85, 1.15);
    col.setRGB(v, v * (natural ? rr(0.9, 1.1) : 1), v);
    wallMesh.setColorAt(k, col);
  });
  group.add(wallMesh);

  // topo das paredes levemente iluminado
  const capGeo = new THREE.PlaneGeometry(1, 1);
  capGeo.rotateX(-Math.PI / 2);
  const capMat = theme.cap ? new THREE.MeshLambertMaterial({ color: theme.cap }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.wall).multiplyScalar(0.7) });
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, walls.length);
  capMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  walls.forEach((w, k) => {
    m4.makeTranslation(w.x, w.h + 0.001, w.z);
    capMesh.setMatrixAt(k, m4);
  });
  group.add(capMesh);

  // faixas de neon nas faces das paredes voltadas para o chão
  const strips = [];
  const faces = [
    [1, 0, Math.PI / 2],
    [-1, 0, Math.PI / 2],
    [0, 1, 0],
    [0, -1, 0],
  ];
  walls.forEach((w, wi) => {
    if (natural) return;
    for (const [dx, dy, rot] of faces) {
      if (grid[(w.j + dy) * W + w.i + dx] === TILE.FLOOR || grid[(w.j + dy) * W + w.i + dx] === TILE.OBST) {
        if (!isFloorish(w.i + dx, w.j + dy)) continue;
        const useB = ((w.i * 7 + w.j * 13) % 11) === 0;
        strips.push({ wi, x: w.x + dx * 0.51, z: w.z + dy * 0.51, rot, color: useB ? theme.b : theme.a });
        w.strips.push(strips.length - 1);
      }
    }
  });
  const stripGeo = new THREE.BoxGeometry(1, 0.06, 0.03);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stripMesh = new THREE.InstancedMesh(stripGeo, stripMat, Math.max(1, strips.length));
  stripMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  strips.forEach((s, k) => {
    q.setFromAxisAngle(up, s.rot);
    m4.compose(new THREE.Vector3(s.x, WALL_H - 0.18, s.z), q, new THREE.Vector3(1, 1, 1));
    stripMesh.setMatrixAt(k, m4);
    col.set(s.color).multiplyScalar(gk(2.2));
    stripMesh.setColorAt(k, col);
  });
  group.add(stripMesh);

  // letreiros de neon nas paredes do "fundo" (faces voltadas para a câmera)
  const signCount = natural ? 0 : Math.min(4 + d.rooms.length, 18);
  const candidates = shuffle(
    walls.filter((w) => isFloorish(w.i + 1, w.j) && grid[w.j * W + w.i + 1] === TILE.FLOOR && isFloorish(w.i + 1, w.j + 1) && isFloorish(w.i + 1, w.j - 1)).concat(
      walls.filter((w) => isFloorish(w.i, w.j + 1) && grid[(w.j + 1) * W + w.i] === TILE.FLOOR && isFloorish(w.i + 1, w.j + 1) && isFloorish(w.i - 1, w.j + 1))
    )
  );
  const usedSign = new Set();
  let placed = 0;
  for (const w of candidates) {
    if (placed >= signCount) break;
    const key = `${Math.floor(w.i / 4)},${Math.floor(w.j / 4)}`;
    if (usedSign.has(key)) continue;
    usedSign.add(key);
    const color = Math.random() < 0.5 ? theme.a : theme.b;
    const css = '#' + new THREE.Color(color).getHexString();
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(pick(SIGN_WORDS), css), transparent: true, depthWrite: false, color: new THREE.Color(gk(2.2), gk(2.2), gk(2.2)) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), mat);
    const faceX = isFloorish(w.i + 1, w.j) && grid[w.j * W + w.i + 1] === TILE.FLOOR;
    if (faceX) {
      sign.position.set(w.x + 0.52, 1.12, w.z);
      sign.rotation.y = Math.PI / 2;
    } else {
      sign.position.set(w.x, 1.12, w.z + 0.52);
    }
    group.add(sign);
    w.signs.push(sign);
    placed++;
  }

  // pilares
  const pillarGeo = new THREE.CylinderGeometry(0.38, 0.42, WALL_H, 8);
  pillarGeo.translate(0, WALL_H / 2, 0);
  const pillarMat = new THREE.MeshLambertMaterial({ color: theme.wall });
  const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 16);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.b).multiplyScalar(gk(2.2)) });
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      if (grid[j * W + i] === TILE.OBST && d.feat[j * W + i] < 9) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(i + 0.5, 0, j + 0.5);
        group.add(p);
        for (const y of [0.35, 1.3]) {
          const rg = new THREE.Mesh(ringGeo, ringMat);
          rg.position.set(i + 0.5, y, j + 0.5);
          group.add(rg);
        }
      }

  // elevador de saída
  const exit = makeExitPad(theme);
  exit.group.position.set(d.exit.x, 0, d.exit.z);
  group.add(exit.group);

  // plataforma de início
  const startRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(gk(1.5)), transparent: true, opacity: 0.6, depthWrite: false }));
  startRing.rotation.x = -Math.PI / 2;
  startRing.position.set(d.start.x, 0.015, d.start.z);
  group.add(startRing);

  d.meshes = { wallMesh, capMesh, stripMesh, walls, strips, exit };
  return group;
}

function makeExitPad(theme) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.12, 32), new THREE.MeshLambertMaterial({ color: 0x20243a }));
  base.position.y = 0.06;
  group.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(gk(2.4)) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.13;
  group.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(gk(1.2)), transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 4, 24, 1, true), beamMat);
  beam.position.y = 2;
  group.add(beam);
  const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(gk(2.4)), wireframe: true }));
  holo.position.y = 1.4;
  group.add(holo);
  return { group, ring, ringMat, beam, beamMat, holo, theme };
}

// Abaixa as paredes que ficam entre a câmera e o jogador
export function updateWalls(d, px, pz, dt) {
  const M = d.meshes;
  if (!M) return;
  const m4 = new THREE.Matrix4();
  let changed = false;
  const k = Math.min(1, dt * 10);
  for (let wi = 0; wi < M.walls.length; wi++) {
    const w = M.walls[wi];
    const dx = w.x - px;
    const dz = w.z - pz;
    const along = (dx + dz) * Math.SQRT1_2;
    const side = Math.abs(dx - dz) * Math.SQRT1_2;
    const target = along > -0.2 && along < 6.5 && side < 3.2 + along * 0.25 ? LOW_H : w.base || WALL_H;
    if (Math.abs(w.h - target) < 0.005) {
      if (w.h !== target) w.h = target;
      else continue;
    } else {
      w.h += (target - w.h) * k;
    }
    changed = true;
    m4.makeScale(1, w.h, 1).setPosition(w.x, 0, w.z);
    M.wallMesh.setMatrixAt(wi, m4);
    m4.makeTranslation(w.x, w.h + 0.001, w.z);
    M.capMesh.setMatrixAt(wi, m4);
    for (const si of w.strips) {
      M.stripMesh.getMatrixAt(si, m4);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      m4.decompose(pos, q, s);
      pos.y = Math.min((w.base || WALL_H) - 0.18, w.h - 0.06);
      m4.compose(pos, q, s);
      M.stripMesh.setMatrixAt(si, m4);
    }
    for (const sg of w.signs) sg.visible = w.h > 1.3;
  }
  if (changed) {
    M.wallMesh.instanceMatrix.needsUpdate = true;
    M.capMesh.instanceMatrix.needsUpdate = true;
    M.stripMesh.instanceMatrix.needsUpdate = true;
  }
}
