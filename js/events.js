// Eventos e quebra-cabeças dos andares: de 3 a 6 eventos principais e um pequeno por andar.
// Principais: Sequência de Terminais, Piso de Luzes, Prismas de Laser, Upload de Dados, Bomba-Relógio,
// Procurado, Caça aos Fragmentos, Prisioneiro, Circuito Neon, Sinal Perdido, Servidores Corrompidos,
// Escolta do Drone, Pares de Memória, Chuva de Meteoros, Cofre Rachado, Arena de Gladiadores,
// Caixa de Pandora, Jogo dos Baús, Duelo de Espelho, Bola de Plasma, Olho Vigia, Corrida Fantasma
// e Laser Giratório. Pequenos: Sala Secreta e Máquina de Apostas.
// Tudo funciona só andando (pisar, ficar perto) e com o botão de interagir, então vale para
// teclado+mouse, controle e toque. O sorteio usa a semente do andar (continuar o andar refaz igual);
// o estado de cada evento vai no retrato do andar (eventsSnapshot/eventsRestore).
import * as THREE from 'three';
import { G, TILE, gk } from './state.js';
import { L } from './i18n.js';
import { rr, ri, pick, chance, shuffle, fmt, short, isolateRandom } from './utils.js';
import { glowMat, box, makePlayerModel, animWalk } from './models.js';
import { burst, ringFx, floatText, telegraphFx, beamFx } from './fx.js';
import { sfx } from './audio.js';
import { toast, banner } from './ui.js';
import { spawnEnemy, killQuiet, pickEnemyType, ETYPES, rewardK, diffRank, diffIlvl, rewardRank, abyssLvl } from './enemies.js';
import { dropLoot, spawnPickup, spawnChest } from './loot.js';
import { explosion, damagePlayer, hitEnemy, enemiesInRadius, enemyExplosion, after } from './combat.js';
import { isWalkable, lineOfSight, isFinalFloor, tileAt, computeFlow, findPath, routeTime } from './dungeon.js';
import { achAdd, achMark } from './ach.js';
import { saveGame } from './main.js';
import { tierOf, tierFloor, applyAnomalyToEnemy, runHurt } from './run.js';
import { makeItem, MYTHIC, DIVINE, PRIMORDIAL, RARITY, itemName } from './items.js';
import { CLASSES, CLASS_ORDER } from './classes.js';

// eventos principais (de 3 a 6 por andar) e os pequenos (Sala Secreta ou Máquina de Apostas)
export const MAIN_EVENTS = ['terminals', 'lights', 'prisms', 'upload', 'bomb', 'wanted', 'shards', 'prisoner', 'relay', 'signal', 'servers', 'escort', 'pairs', 'meteor', 'vault', 'arena', 'pandora', 'shell', 'mirror', 'ball', 'watcher', 'race', 'spinner'];
export const EVENT_KINDS = [...MAIN_EVENTS, 'secret', 'gamble'];
export const EVENT_INFO = {
  terminals: { icon: '🖥️', css: '#00f0ff', name: L('Sequência de Terminais', 'Terminal Sequence'), short: L('Terminais', 'Terminals') },
  lights: { icon: '💡', css: '#7affc8', name: L('Piso de Luzes', 'Light Floor') },
  prisms: { icon: '🔺', css: '#ff4d75', name: L('Prismas de Laser', 'Laser Prisms') },
  upload: { icon: '📡', css: '#6b93ff', name: L('Upload de Dados', 'Data Upload') },
  bomb: { icon: '💣', css: '#ff7a1a', name: L('Bomba-Relógio', 'Time Bomb'), short: L('Bomba', 'Bomb') },
  wanted: { icon: '🎯', css: '#ffaa00', name: L('Procurado', 'Wanted') },
  shards: { icon: '💠', css: '#7affc8', name: L('Caça aos Fragmentos', 'Shard Hunt'), short: L('Fragmentos', 'Shards') },
  prisoner: { icon: '⛓️', css: '#c08aff', name: L('Prisioneiro', 'Prisoner') },
  relay: { icon: '🏁', css: '#ff9a3d', name: L('Circuito Neon', 'Neon Circuit'), short: L('Circuito', 'Circuit') },
  signal: { icon: '📶', css: '#5affd2', name: L('Sinal Perdido', 'Lost Signal'), short: L('Sinal', 'Signal') },
  servers: { icon: '🗄️', css: '#ff3366', name: L('Servidores Corrompidos', 'Corrupted Servers'), short: L('Servidores', 'Servers') },
  escort: { icon: '🛸', css: '#5ab8ff', name: L('Escolta do Drone', 'Drone Escort'), short: L('Escolta', 'Escort') },
  pairs: { icon: '🃏', css: '#e07bff', name: L('Pares de Memória', 'Memory Pairs'), short: L('Pares', 'Pairs') },
  meteor: { icon: '☄️', css: '#ff6a2a', name: L('Chuva de Meteoros', 'Meteor Shower'), short: L('Meteoros', 'Meteors') },
  vault: { icon: '💰', css: '#ffd23d', name: L('Cofre Rachado', 'Cracked Vault'), short: L('Cofre', 'Vault') },
  arena: { icon: '⚔️', css: '#ff3d6e', name: L('Arena de Gladiadores', 'Gladiator Arena'), short: L('Arena', 'Arena') },
  pandora: { icon: '🎁', css: '#b44dff', name: L('Caixa de Pandora', "Pandora's Box"), short: L('Pandora', 'Pandora') },
  shell: { icon: '🎲', css: '#ffb84d', name: L('Jogo dos Baús', 'Chest Shuffle'), short: L('Baús', 'Chests') },
  mirror: { icon: '🪞', css: '#9a7bff', name: L('Duelo de Espelho', 'Mirror Duel'), short: L('Espelho', 'Mirror') },
  ball: { icon: '⚽', css: '#00f0ff', name: L('Bola de Plasma', 'Plasma Ball'), short: L('Bola', 'Ball') },
  watcher: { icon: '👁️', css: '#39ff88', name: L('Olho Vigia', "Watcher's Eye"), short: L('Olho', 'Eye') },
  race: { icon: '👻', css: '#7affc8', name: L('Corrida Fantasma', 'Ghost Race'), short: L('Corrida', 'Race') },
  spinner: { icon: '🌀', css: '#ff2244', name: L('Laser Giratório', 'Laser Spinner'), short: L('Giratório', 'Spinner') },
  secret: { icon: '🧱', css: '#ffaa33', name: L('Sala Secreta', 'Secret Room') },
  gamble: { icon: '🎰', css: '#ff2bd6', name: L('Máquina de Apostas', 'Slot Machine') },
};

// principais do andar anterior (não repetem no seguinte)
let lastMain = [];
// continuar um andar salvo: os eventos principais que ele tinha (undefined = sorteia normalmente)
let forcedMain;
export function eventsResume(h) {
  forcedMain = h && Array.isArray(h.ev) ? h.ev.filter((s) => s && MAIN_EVENTS.includes(s.k)).map((s) => s.k) : undefined;
}

// ------------------------------------------------------------------
// Peças compartilhadas
// ------------------------------------------------------------------
let M = null;
function mats() {
  if (M) return M;
  M = {
    metal: new THREE.MeshLambertMaterial({ color: 0x3a4258 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x161b28 }),
    plateOff: new THREE.MeshLambertMaterial({ color: 0x1a2232 }),
    disc: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
    ring: new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    bar: new THREE.CylinderGeometry(0.035, 0.035, 1.9, 5),
    oct: new THREE.OctahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(0.13, 0.36, 6).rotateX(Math.PI / 2),
    beam: new THREE.BoxGeometry(1, 0.07, 0.07),
  };
  return M;
}
function put(parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
function groupAt(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  G.world.add(g);
  return g;
}
// materiais próprios de cada peça que acende/apaga ou muda de cor
const lightMat = (color, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(k)) });
const setLight = (m, color, k) => m.color.setHex(color).multiplyScalar(gk(k));
const flatMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false });
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const near = (E, r) => {
  const p = G.player;
  return p && p.alive && Math.hypot(p.x - E.x, p.z - E.z) < r;
};

// console com tela (frente = +z local), virado para (tx, tz)
function makeConsole(parent, x, z, color, tx, tz) {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  c.rotation.y = Math.atan2(tx - x, tz - z);
  put(c, box(0.6, 0.9, 0.4), mats().metal, 0, 0.45, 0);
  put(c, box(0.66, 0.08, 0.46), mats().dark, 0, 0.92, 0);
  const scr = lightMat(color, 0.6);
  put(c, box(0.46, 0.3, 0.03), scr, 0, 0.66, 0.21);
  parent.add(c);
  return { node: c, scr };
}

// ------------------------------------------------------------------
// Onde colocar: um quadrado livre de piso comum, longe da saída, do início, das fendas,
// do mercador/ferreiro/baú, do Ninho, de barris e dos outros eventos
// ------------------------------------------------------------------
const NPCS = ['merchant', 'smith', 'stash', 'gamble'];
function spotOk(d, x, z, hx, hz, avoid = []) {
  for (let j = Math.floor(z - hz); j <= Math.floor(z + hz); j++)
    for (let i = Math.floor(x - hx); i <= Math.floor(x + hx); i++) if (tileAt(d, i, j) !== TILE.FLOOR || d.feat[j * d.W + i]) return false;
  const r = Math.max(hx, hz);
  if (Math.hypot(x - d.exit.x, z - d.exit.z) < r + 4) return false;
  if (Math.hypot(x - d.start.x, z - d.start.z) < r + 6) return false;
  if (G.pickups.some((pk) => Math.hypot(pk.x - x, pk.z - z) < (pk.type === 'rift' ? 9 : r + 1.5))) return false;
  if (d.props.some((p) => Math.hypot(p.x - x, p.z - z) < (NPCS.includes(p.type) ? r + 4 : r + 1))) return false;
  if (G.enemies.some((e) => e.static && Math.hypot(e.x - x, e.z - z) < r + 1)) return false;
  if (G.nest && Math.hypot(G.nest.x - x, G.nest.z - z) < r + 8) return false;
  if (G.events.some((E) => (E.x != null && Math.hypot(E.x - x, E.z - z) < r + 8) || (E.pts && E.pts.some((q) => Math.hypot(q.x - x, q.z - z) < r + 5)))) return false;
  if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) return false;
  return true;
}
function findSpot(d, rooms, hx, hz = hx, avoid) {
  // praça da masmorra: primeiro para as peças grandes, por último para as pequenas
  const big = Math.max(hx, hz) >= 2.4;
  const list = shuffle(rooms.slice()).sort((a, b) => (big ? (b.plaza ? 1 : 0) - (a.plaza ? 1 : 0) : (a.plaza ? 1 : 0) - (b.plaza ? 1 : 0)));
  for (const r of list) {
    for (let t = 0; t < 11; t++) {
      // primeiro perto do meio; depois em qualquer canto da sala onde a peça caiba
      const ax = t < 5 ? r.w / 4 : Math.max(0, r.w / 2 - hx - 1);
      const az = t < 5 ? r.h / 4 : Math.max(0, r.h / 2 - hz - 1);
      const x = Math.floor(r.x + r.w / 2 + rr(-ax, ax)) + 0.5;
      const z = Math.floor(r.y + r.h / 2 + rr(-az, az)) + 0.5;
      if (spotOk(d, x, z, hx, hz, avoid)) return { x, z, r };
    }
  }
  return null;
}
// ponto livre a até `rad` de (x, z) para nascer inimigo
function freeAround(d, x, z, r0, r1) {
  for (let t = 0; t < 14; t++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    const nx = x + Math.cos(a) * r;
    const nz = z + Math.sin(a) * r;
    if (isWalkable(d, nx, nz)) return { x: nx, z: nz };
  }
  return null;
}
// ondas de inimigos (alarme dos terminais e o upload): já chegam atacando
function spawnWave(E, n, x, z, r0, r1, color) {
  const d = G.dungeon;
  E.foes = (E.foes || []).filter((e) => e.alive);
  n = Math.min(n, 16 - E.foes.length);
  for (let k = 0; k < n; k++) {
    const pt = freeAround(d, x, z, r0, r1);
    if (!pt) continue;
    let type = pickEnemyType(G.floor);
    if (ETYPES[type].solo) type = pickEnemyType(G.floor);
    const e = spawnEnemy(type, pt.x, pt.z, {});
    applyAnomalyToEnemy(e);
    e.aggro = true;
    e.alerted = true;
    E.foes.push(e);
    burst(pt.x, 0.8, pt.z, color, 12, 4, 0.07, 0.5, { up: 1 });
    ringFx(pt.x, pt.z, 1, color, 0.3);
  }
}

// ------------------------------------------------------------------
// Prêmio de um evento concluído: créditos na carteira + itens no chão
// ------------------------------------------------------------------
export const eventCredits = (mult) => Math.round((80 + G.floor * 25) * tierOf().credits * rewardK('cr') * mult);
function complete(E, mult, title, sub, x, z, o = {}) {
  const c = G.char;
  const p = G.player;
  E.st = 'done';
  const cr = eventCredits(mult);
  c.credits += cr;
  achAdd('credits', cr);
  achAdd('events');
  achMark('evDone', E.kind);
  dropLoot(x, z, o.loot || { contract: true });
  if (o.extra) dropLoot(x, z, { chest: true });
  // Festival: 5 eventos concluídos no mesmo andar
  if (G.events.filter((o) => o.st === 'done').length >= 5) achMark('flags', 'evFest');
  const col = new THREE.Color(EVENT_INFO[E.kind].css).getHex();
  banner(title, `${sub} · +${fmt(cr)}¢`);
  sfx.legendary();
  ringFx(x, z, 4, col, 0.7);
  burst(x, 1.2, z, col, 50, 7, 0.08, 0.9, { up: 1.6 });
  floatText(p.x, 2.4, p.z, `+${fmt(cr)}¢`, 'up');
  saveGame();
}
function failed(E, msg) {
  E.st = 'failed';
  sfx.deny();
  toast(`${EVENT_INFO[E.kind].icon} ${msg}`, 'warn');
}

// ==================================================================
// 1. Sequência de Terminais: 4 terminais acendem numa ordem; repita pisando nas placas
// ==================================================================
const T_COL = [0xff3355, 0x39ff88, 0x3d8bff, 0xffd23d];
const T_OFF = [
  [-1.6, 0],
  [1.6, 0],
  [0, -1.6],
  [0, 1.6],
];
const terminals = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3);
    if (!s) return null;
    const n = Math.min(7, 3 + Math.floor(floor / 7));
    const seq = [];
    for (let k = 0; k < n; k++) {
      let v = ri(0, 3);
      if (k && v === seq[k - 1]) v = (v + 1 + ri(0, 2)) % 4;
      seq.push(v);
    }
    const g = groupAt(s.x, s.z);
    const pads = T_OFF.map(([ox, oz], i) => {
      const ring = lightMat(T_COL[i], 0.5);
      put(g, mats().ring, ring, ox, 0.03, oz, 0.62, 1, 0.62);
      const fill = flatMat(T_COL[i], 0.12);
      put(g, mats().disc, fill, ox, 0.025, oz, 0.55, 1, 0.55);
      const con = makeConsole(g, ox * 1.65, oz * 1.65, T_COL[i], 0, 0);
      return { x: s.x + ox, z: s.z + oz, ring, fill, scr: con.scr };
    });
    put(g, box(0.3, 0.05, 0.3), mats().dark, 0, 0.025, 0);
    return { kind: 'terminals', x: s.x, z: s.z, g, seq, pads, st: 'idle', step: 0, t: 0, err: 0, lastPad: -1, litT: 0, lit: -1 };
  },
  light(E, i, on) {
    E.pads.forEach((pd, k) => {
      const hot = k === i && on;
      setLight(pd.ring, T_COL[k], hot ? 3 : 0.5);
      setLight(pd.scr, T_COL[k], hot ? 3 : 0.6);
      pd.fill.opacity = hot ? 0.55 : 0.12;
    });
  },
  flash(E, i) {
    terminals.light(E, i, true);
    E.lit = i;
    E.litT = 0.42;
    sfx.seq(i);
    const pd = E.pads[i];
    burst(pd.x, 0.4, pd.z, T_COL[i], 8, 2.5, 0.06, 0.4, { up: 1 });
  },
  padUnder(E) {
    const p = G.player;
    if (!p.alive) return -1;
    for (let k = 0; k < 4; k++) if (Math.hypot(p.x - E.pads[k].x, p.z - E.pads[k].z) < 0.62) return k;
    return -1;
  },
  update(E, dt) {
    if (E.st === 'done' || E.st === 'failed') return;
    if (E.litT > 0) {
      E.litT -= dt;
      if (E.litT <= 0) terminals.light(E, -1, false);
    }
    if (E.st === 'idle') {
      if (near(E, 4.4)) {
        E.st = 'show';
        E.step = 0;
        E.t = 1;
        toast(L(`🖥️ Observe a ordem em que os terminais acendem e depois <b>pise nas placas</b> na mesma ordem (${E.seq.length} passos).`, `🖥️ Watch the order the terminals light up, then <b>step on the pads</b> in the same order (${E.seq.length} steps).`), 'leg', 'ev');
      }
      return;
    }
    const pad = terminals.padUnder(E);
    if (E.st === 'show') {
      E.lastPad = pad; // pisar enquanto mostra não conta
      E.t -= dt;
      if (E.t > 0) return;
      if (E.step < E.seq.length) {
        terminals.flash(E, E.seq[E.step++]);
        E.t = Math.max(0.45, 0.72 - G.floor * 0.008);
      } else {
        E.st = 'input';
        E.step = 0;
        floatText(E.x, 2.2, E.z, L('SUA VEZ!', 'YOUR TURN!'), 'up');
        sfx.click();
      }
      return;
    }
    // vez do jogador: conta ao entrar numa placa
    if (pad === E.lastPad) return;
    E.lastPad = pad;
    if (pad < 0) return;
    terminals.flash(E, pad);
    if (E.seq[E.step] === pad) {
      E.step++;
      if (E.step >= E.seq.length) {
        for (const pd of E.pads) {
          setLight(pd.ring, 0x39ff88, 2.4);
          setLight(pd.scr, 0x39ff88, 2);
        }
        E.litT = 0;
        complete(E, 1 + E.seq.length * 0.1, L('ACESSO LIBERADO', 'ACCESS GRANTED'), L('O cofre dos terminais abriu', 'The terminal vault opened'), E.x, E.z, { extra: E.err === 0 });
        if (E.err === 0) achMark('flags', 'evPerfect');
      }
      return;
    }
    // erro: alarme com inimigos e a sequência recomeça (tentativas ilimitadas)
    E.err++;
    sfx.alarm();
    G.shake = Math.max(G.shake, 0.3);
    ringFx(E.x, E.z, 5, 0xff2244, 0.5);
    floatText(E.x, 2.2, E.z, L('ALARME!', 'ALARM!'), 'hurt');
    toast(L('🚨 Ordem errada! O alarme chamou reforços. A sequência vai repetir: tente de novo quantas vezes precisar.', '🚨 Wrong order! The alarm called reinforcements. The sequence will repeat: try again as many times as you need.'), 'warn');
    E.st = 'show';
    E.step = 0;
    E.t = 2.4;
    spawnWave(E, Math.min(8, 3 + Math.floor(G.floor / 5)), E.x, E.z, 4.5, 8, 0xff2244);
  },
  hud(E) {
    if (E.st === 'idle') return L('vá até lá', 'go there');
    const x = E.err ? ` <span style="color:#ff4466">${E.err > 3 ? '✖×' + E.err : '✖'.repeat(E.err)}</span>` : '';
    if (E.st === 'show') return L('observe', 'watch') + x;
    return `${E.step}/${E.seq.length}${x}`;
  },
  save: (E) => ({ err: E.err }),
  load(E, s) {
    E.err = s.err | 0;
    if (s.st === 'done') {
      E.st = 'done';
      for (const pd of E.pads) {
        setLight(pd.ring, 0x39ff88, 2.4);
        setLight(pd.scr, 0x39ff88, 2);
      }
    } else if (s.st === 'failed') {
      E.st = 'failed';
      for (const pd of E.pads) {
        setLight(pd.ring, 0x333344, 0.3);
        setLight(pd.scr, 0x333344, 0.3);
        pd.fill.opacity = 0.04;
      }
    }
  },
  intro: (E) => L(`repita a ordem em que os ${E.pads.length} terminais acendem (marcados no mapa). Errar dispara o alarme.`, `repeat the order in which the ${E.pads.length} terminals light up (marked on the map). Mistakes trigger the alarm.`),
};

// ==================================================================
// 2. Piso de Luzes: 3x3 placas; pisar inverte a placa e as vizinhas. Acenda todas.
// ==================================================================
const LS = 1.75;
const lights = {
  setup(d, floor, rooms) {
    // a placa de recomeçar fica a 3,9 do centro (no lado +z): a área livre precisa cobrir ela
    const s = findSpot(d, rooms, 3.2, 4.5);
    if (!s) return null;
    // começa resolvido e embaralha com toques aleatórios (então sempre tem solução)
    const bits = new Array(9).fill(1);
    const presses = ri(3, 4 + Math.min(3, Math.floor(floor / 8)));
    for (let k = 0; k < presses; k++) lights.toggle(bits, ri(0, 8));
    if (bits.every((b) => b)) lights.toggle(bits, 4);
    const g = groupAt(s.x, s.z);
    const plates = [];
    for (let k = 0; k < 9; k++) {
      const ox = ((k % 3) - 1) * LS;
      const oz = (Math.floor(k / 3) - 1) * LS;
      put(g, box(1.22, 0.04, 1.22), mats().dark, ox, 0.02, oz);
      const m = put(g, box(1.06, 0.07, 1.06), mats().plateOff, ox, 0.035, oz);
      plates.push({ x: s.x + ox, z: s.z + oz, m });
    }
    // placa de recomeçar (volta ao começo)
    const rx = 0;
    const rz = 2 * LS + 0.4;
    const rmat = lightMat(0xff4466, 1.2);
    put(g, mats().ring, rmat, rx, 0.03, rz, 0.45, 1, 0.45);
    put(g, mats().disc, flatMat(0xff4466, 0.15), rx, 0.025, rz, 0.4, 1, 0.4);
    const hint = put(g, mats().ring, lightMat(0xffd23d, 1.6), 0, 0.13, 0, 0.78, 1, 0.78);
    const E = { kind: 'lights', x: s.x, z: s.z, g, bits, init: bits.slice(), plates, hint, hintWait: 0, hintLeft: 0, reset: { x: s.x + rx, z: s.z + rz }, st: 'play', last: -1, hinted: false };
    lights.paint(E);
    return E;
  },
  toggle(bits, k) {
    const i = k % 3;
    const j = Math.floor(k / 3);
    for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a >= 0 && a < 3 && b >= 0 && b < 3) bits[b * 3 + a] ^= 1;
    }
  },
  paint(E) {
    const on = glowMat(E.st === 'done' ? 0x39ff88 : 0x7affc8, 1.3);
    E.plates.forEach((pl, k) => (pl.m.material = E.bits[k] ? on : mats().plateOff));
    if (E.hint.visible) E.hintWait = 0;
    E.hint.visible = false;
    E.hintLeft = 0;
  },
  showHint(E) {
    // Só nove placas: procura a solução com menos passos apenas ao oferecer uma dica.
    let best = 0;
    let count = 10;
    if (E.st === 'play') for (let mask = 1; mask < 512; mask++) {
      const bits = E.bits.slice();
      let n = 0;
      for (let k = 0; k < 9; k++) if (mask & (1 << k)) {
        lights.toggle(bits, k);
        n++;
      }
      if (n < count && bits.every((b) => b)) {
        best = mask;
        count = n;
      }
    }
    E.hint.visible = best !== 0;
    E.hintLeft = best ? 5 : 0;
    if (best) {
      // Prefere a placa mais próxima para reduzir travessias sobre as outras.
      let next = -1;
      let dist = Infinity;
      for (let k = 0; k < 9; k++) if (best & (1 << k)) {
        const pl = E.plates[k];
        const d = G.player ? Math.hypot(pl.x - G.player.x, pl.z - G.player.z) : k;
        if (d < dist) { next = k; dist = d; }
      }
      E.hint.position.set(E.plates[next].x - E.x, 0.13, E.plates[next].z - E.z);
    }
  },
  under(E) {
    const p = G.player;
    if (!p.alive) return -1;
    for (let k = 0; k < 9; k++) if (Math.abs(p.x - E.plates[k].x) < 0.55 && Math.abs(p.z - E.plates[k].z) < 0.55) return k;
    if (Math.hypot(p.x - E.reset.x, p.z - E.reset.z) < 0.5) return 9;
    return -1;
  },
  update(E, dt) {
    if (E.st !== 'play') return;
    // Conta só o tempo perto do quebra-cabeça; uma dica não revela a sequência toda.
    if (!G.player.alive || !near(E, 5.5)) {
      E.hintWait = E.hintLeft = 0;
      E.hint.visible = false;
    } else if (E.hintLeft > 0) {
      E.hintLeft = Math.max(0, E.hintLeft - dt);
      if (!E.hintLeft) E.hint.visible = false;
    } else {
      E.hintWait += dt;
      if (E.hintWait >= 30) {
        E.hintWait = 0;
        lights.showHint(E);
      }
    }
    if (!E.hinted && near(E, 5.5)) {
      E.hinted = true;
      toast(L('💡 Acenda as 9 placas! Cada passo inverte a placa e as vizinhas dos lados. Ande pelos espaços entre as placas; o círculo vermelho recomeça. <b>Se demorar, um anel dourado dará uma dica breve.</b>', '💡 Light all 9 plates! Each step flips that plate and its side neighbors. Walk through the gaps between plates; the red circle resets. <b>If you get stuck, a gold ring will offer a brief hint.</b>'), 'leg', 'ev');
    }
    const k = lights.under(E);
    if (k === E.last) return;
    E.last = k;
    if (k < 0) return;
    if (k === 9) {
      E.bits = E.init.slice();
      E.hintWait = 0;
      lights.paint(E);
      sfx.deny();
      floatText(E.reset.x, 1.6, E.reset.z, L('RECOMEÇAR', 'RESET'), 'shield');
      return;
    }
    lights.toggle(E.bits, k);
    lights.paint(E);
    sfx.seq(E.bits[k] ? 3 : 0);
    const pl = E.plates[k];
    burst(pl.x, 0.2, pl.z, 0x7affc8, 8, 2, 0.05, 0.4, { up: 1 });
    if (E.bits.every((b) => b)) {
      E.st = 'done';
      lights.paint(E);
      complete(E, 1.1, L('PISO ACESO!', 'FLOOR LIT!'), L('Um cofre especial apareceu', 'A special cache appeared'), E.x, E.z, { extra: true });
    }
  },
  hud: (E) => `${E.bits.filter((b) => b).length}/9${E.hint.visible ? L(' · dica: anel dourado', ' · hint: gold ring') : ''}`,
  save: (E) => ({ bits: E.bits.join('') }),
  load(E, s) {
    if (typeof s.bits === 'string' && s.bits.length === 9) E.bits = s.bits.split('').map(Number);
    if (s.st === 'done') E.st = 'done';
    E.hintWait = 0;
    lights.paint(E);
  },
  intro: () => L('acenda as 9 placas por um cofre especial. Ande pelos espaços entre elas; se demorar, aparece uma dica breve em dourado.', 'light all 9 plates for a special cache. Walk through the gaps between them; if you get stuck, a brief gold hint appears.'),
};

// ==================================================================
// 3. Prismas de Laser: pise nos prismas para girá-los e leve o raio até o receptor
// ==================================================================
const PS = 1.7;
const DV = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const prisms = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2 * PS + 0.7, PS + 0.9);
    if (!s) return null;
    // caminho garantido: emissor -> P1 (a, j0) -> P2 (a, b) -> receptor (3, b)
    const j0 = ri(0, 2);
    const b = pick([0, 1, 2].filter((v) => v !== j0));
    const a = ri(0, 2);
    const list = [
      { i: a, j: j0, sol: b > j0 ? 1 : 3 },
      { i: a, j: b, sol: 0 },
    ];
    // prisma extra fora do caminho (para confundir)
    const onPath = (i, j) => (j === j0 && i <= a) || (i === a && j >= Math.min(j0, b) && j <= Math.max(j0, b)) || (j === b && i >= a);
    const extra = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!onPath(i, j)) extra.push({ i, j });
    if (extra.length && floor >= 4) list.push({ ...pick(extra), sol: -1 });
    for (const pr of list) pr.dir = ri(0, 3);
    if (list[0].dir === list[0].sol && list[1].dir === list[1].sol) list[1].dir = (list[1].dir + 1) % 4;
    const g = groupAt(s.x, s.z);
    const E = { kind: 'prisms', x: s.x, z: s.z, g, j0, b, list, st: 'play', last: -1, segs: [], hinted: false };
    const cell = (i, j) => [(i - 1) * PS, (j - 1) * PS];
    // grade no chão
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const [ox, oz] = cell(i, j);
        put(g, mats().ring, glowMat(0x553344, 0.8), ox, 0.02, oz, 0.5, 1, 0.5);
      }
    // emissor e receptor
    const [ex, ez] = cell(-1, j0);
    put(g, box(0.6, 1.1, 0.6), mats().metal, ex, 0.55, ez);
    put(g, box(0.06, 0.18, 0.18), glowMat(0xff2244, 3), ex + 0.31, 0.85, ez);
    const [qx, qz] = cell(3, b);
    put(g, mats().cyl, mats().metal, qx, 0.55, qz, 0.32, 1.1, 0.32);
    E.recv = lightMat(0xff2244, 1);
    E.recvRing = put(g, new THREE.TorusGeometry(0.34, 0.05, 6, 18), E.recv, qx, 1.15, qz);
    E.recvRing.rotation.y = Math.PI / 2;
    E.cell = (i, j) => ({ x: s.x + (i - 1) * PS, z: s.z + (j - 1) * PS });
    for (const pr of list) {
      const [ox, oz] = cell(pr.i, pr.j);
      put(g, mats().cyl, mats().metal, ox, 0.25, oz, 0.3, 0.5, 0.3);
      const head = new THREE.Group();
      head.position.set(ox, 0.85, oz);
      put(head, mats().oct, glowMat(0xffc0d8, 1.6), 0, 0, 0, 0.22, 0.3, 0.22);
      put(head, mats().cone, glowMat(0xff4d75, 2.2), 0, 0, 0.32);
      g.add(head);
      pr.head = head;
      pr.rot = Math.atan2(DV[pr.dir][0], DV[pr.dir][1]);
      head.rotation.y = pr.rot;
      Object.assign(pr, E.cell(pr.i, pr.j));
    }
    prisms.trace(E);
    return E;
  },
  // refaz o raio: anda de célula em célula, cada prisma manda o raio para onde aponta
  trace(E) {
    const at = (i, j) => E.list.find((p) => p.i === i && p.j === j);
    const pts = [E.cell(-1, E.j0)];
    let ci = -1;
    let cj = E.j0;
    let dir = 0;
    let hit = false;
    const seen = new Set();
    for (let k = 0; k < 24; k++) {
      const ni = ci + DV[dir][0];
      const nj = cj + DV[dir][1];
      if (ni === 3 && nj === E.b) {
        pts.push(E.cell(ni, nj));
        hit = true;
        break;
      }
      if (ni < 0 || ni > 2 || nj < 0 || nj > 2) {
        pts.push(E.cell(ci + DV[dir][0] * 0.75, cj + DV[dir][1] * 0.75));
        break;
      }
      const pr = at(ni, nj);
      if (pr) {
        pts.push(E.cell(ni, nj));
        const key = ni * 3 + nj + dir * 9;
        if (seen.has(key) || pr.dir === (dir + 2) % 4) break;
        seen.add(key);
        dir = pr.dir;
      }
      ci = ni;
      cj = nj;
    }
    // segmentos (reaproveitados)
    const mat = glowMat(hit ? 0x39ff88 : 0xff2244, 2.8);
    for (let k = 0; k < Math.max(E.segs.length, pts.length - 1); k++) {
      let s = E.segs[k];
      if (k >= pts.length - 1) {
        if (s) s.visible = false;
        continue;
      }
      if (!s) {
        s = new THREE.Mesh(mats().beam, mat);
        G.world.add(s);
        E.segs.push(s);
      }
      const A = pts[k];
      const B = pts[k + 1];
      s.visible = true;
      s.material = mat;
      s.position.set((A.x + B.x) / 2, 0.85, (A.z + B.z) / 2);
      s.scale.x = Math.hypot(B.x - A.x, B.z - A.z) || 0.01;
      s.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    }
    return hit;
  },
  update(E, dt) {
    for (const pr of E.list) {
      let diff = pr.rot - pr.head.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      pr.head.rotation.y += diff * Math.min(1, dt * 12);
    }
    if (E.st !== 'play') return;
    if (!E.hinted && near(E, 6)) {
      E.hinted = true;
      toast(L('🔺 Pise num prisma para girá-lo. Leve o laser até o receptor do outro lado!', '🔺 Step on a prism to rotate it. Guide the laser to the receiver on the other side!'), 'leg', 'ev');
    }
    const p = G.player;
    let k = -1;
    if (p.alive) E.list.forEach((pr, i) => Math.hypot(p.x - pr.x, p.z - pr.z) < 0.6 && (k = i));
    if (k === E.last) return;
    E.last = k;
    if (k < 0) return;
    const pr = E.list[k];
    pr.dir = (pr.dir + 1) % 4;
    pr.rot = Math.atan2(DV[pr.dir][0], DV[pr.dir][1]);
    sfx.click();
    burst(pr.x, 0.9, pr.z, 0xff4d75, 6, 2, 0.05, 0.3);
    if (prisms.trace(E)) {
      setLight(E.recv, 0x39ff88, 3);
      const R = E.cell(3, E.b);
      complete(E, 1.2, L('CIRCUITO FECHADO', 'CIRCUIT COMPLETE'), L('O receptor liberou o prêmio', 'The receiver released the reward'), R.x, R.z);
    }
  },
  hud: () => L('guie o laser', 'guide the laser'),
  save: (E) => ({ dirs: E.list.map((p) => p.dir).join('') }),
  load(E, s) {
    if (typeof s.dirs === 'string' && s.dirs.length === E.list.length)
      E.list.forEach((pr, i) => {
        pr.dir = +s.dirs[i] % 4;
        pr.rot = Math.atan2(DV[pr.dir][0], DV[pr.dir][1]);
        pr.head.rotation.y = pr.rot;
      });
    const hit = prisms.trace(E);
    if (s.st === 'done' || hit) {
      E.st = 'done';
      setLight(E.recv, 0x39ff88, 3);
    }
  },
  intro: () => L('gire os prismas pisando neles e leve o laser até o receptor (marcado no mapa).', 'rotate the prisms by stepping on them and guide the laser to the receiver (marked on the map).'),
};

// ==================================================================
// 4. Upload de Dados: fique no círculo por 45s enquanto ondas atacam (sair pausa)
// ==================================================================
const UP_R = 3;
const upload = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, UP_R + 0.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(0.5, 1.5, 0.5), mats().metal, 0, 0.75, 0);
    put(g, mats().cyl, mats().dark, 0, 1.7, 0, 0.05, 0.5, 0.05);
    const core = put(g, mats().oct, glowMat(0x6b93ff, 3), 0, 2.05, 0, 0.18, 0.24, 0.18);
    const ringMat = lightMat(0x6b93ff, 1.4);
    put(g, mats().ring, ringMat, 0, 0.03, 0, UP_R, 1, UP_R);
    const fill = put(g, mats().disc, flatMat(0x6b93ff, 0.22), 0, 0.025, 0, 0.001, 1, 0.001);
    return { kind: 'upload', x: s.x, z: s.z, g, core, ringMat, fill, need: 45, prog: 0, st: 'idle', waveT: 3, inside: false, t: 0 };
  },
  update(E, dt) {
    E.t += dt;
    E.core.rotation.y += dt * (E.st === 'active' ? 5 : 1);
    if (E.st === 'done') return;
    const inside = near(E, UP_R);
    if (E.st === 'idle') {
      if (!inside) return;
      E.st = 'active';
      banner(L('UPLOAD INICIADO', 'UPLOAD STARTED'), L('Fique dentro do círculo: sair pausa o envio', 'Stay inside the circle: leaving pauses it'));
      sfx.deploy();
      ringFx(E.x, E.z, UP_R, 0x6b93ff, 0.5);
    }
    if (inside !== E.inside) {
      E.inside = inside;
      setLight(E.ringMat, inside ? 0x6b93ff : 0xff4466, inside ? 1.4 : 1.8);
      if (!inside) floatText(E.x, 2.4, E.z, L('PAUSADO', 'PAUSED'), 'hurt');
    }
    if (inside) {
      E.prog += dt;
      if (Math.random() < dt * 8) burst(E.x, 2.1, E.z, 0x6b93ff, 1, 1.5, 0.05, 0.7, { grav: -4 });
    }
    const k = Math.min(1, E.prog / E.need);
    E.fill.scale.set(Math.max(0.001, k * UP_R), 1, Math.max(0.001, k * UP_R));
    E.waveT -= dt;
    if (E.waveT <= 0) {
      E.waveT = 6 + Math.random() * 2.5;
      spawnWave(E, Math.min(7, 2 + Math.floor(G.floor / 5)), E.x, E.z, 6, 9, 0x6b93ff);
      sfx.telegraph();
    }
    if (E.prog >= E.need) complete(E, 1.5, L('UPLOAD CONCLUÍDO', 'UPLOAD COMPLETE'), L('Os dados renderam um prêmio', 'The data paid off'), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'step in') : `${Math.floor((E.prog / E.need) * 100)}%${E.inside ? '' : ' ⏸'}`),
  save: (E) => ({ prog: Math.round(E.prog * 10) / 10 }),
  load(E, s) {
    E.prog = Math.min(E.need, +s.prog || 0);
    if (s.st === 'done') {
      E.st = 'done';
      E.prog = E.need;
    }
    const k = E.prog / E.need;
    E.fill.scale.set(Math.max(0.001, k * UP_R), 1, Math.max(0.001, k * UP_R));
  },
  busy: (E) => E.st === 'active',
  intro: () => L('fique no círculo do terminal por 45s enquanto ondas de inimigos atacam (marcado no mapa).', 'stay inside the terminal circle for 45s while waves of enemies attack (marked on the map).'),
};

// ==================================================================
// 5. Bomba-Relógio: desarme 3 consoles antes do tempo acabar
// ==================================================================
const HOLD = 2.5;
const bomb = {
  setup(d, floor, rooms) {
    const cons = [];
    for (let k = 0; k < 3; k++) {
      const s = findSpot(d, rooms, 0.9, 0.9, cons.map((c) => ({ x: c.x, z: c.z, r: 11 })));
      if (!s) return null;
      cons.push({ x: s.x, z: s.z });
    }
    // tempo: volta mais curta passando pelos 3 pelo caminho de verdade (com folga para lutas e,
    // na masmorra, para os desvios)
    const limit = Math.round(Math.min(d.maze ? 480 : 300, Math.max(75, 35 + routeTime(d, d.start.x, d.start.z, cons) + 3 * HOLD)) / 5) * 5;
    const E = { kind: 'bomb', x: null, z: null, cons, t: limit, limit, delay: 8, st: 'armed', beep: 0, tipT: 0, hinted: false };
    for (const c of cons) {
      c.g = groupAt(c.x, c.z);
      const con = makeConsole(c.g, 0, -0.1, 0xff2244, 0, 5);
      c.scr = con.scr;
      put(c.g, box(0.36, 0.2, 0.22), glowMat(0xff7a1a, 1.4), 0, 1.06, -0.1);
      c.ringMat = lightMat(0xff2244, 1.2);
      put(c.g, mats().ring, c.ringMat, 0, 0.03, 0, 1.25, 1, 1.25);
      c.fill = put(c.g, mats().disc, flatMat(0x39ff88, 0.3), 0, 0.025, 0, 0.001, 1, 0.001);
      c.hold = 0;
      c.off = false;
    }
    return E;
  },
  update(E, dt) {
    if (E.st !== 'armed') return;
    const p = G.player;
    if (!p.alive || G.mode !== 'play') return;
    const blink = Math.sin(G.t * (E.t < 15 ? 18 : 8)) > 0;
    E.tipT -= dt;
    for (const c of E.cons) {
      if (c.off) continue;
      setLight(c.scr, 0xff2244, blink ? 2.4 : 0.6);
      const dc = Math.hypot(p.x - c.x, p.z - c.z);
      const on = dc < 1.3;
      c.hold = on ? c.hold + dt : Math.max(0, c.hold - dt * 2);
      // explicação na tela: perto do console diz o que fazer; em cima mostra o progresso
      if (dc < 7 && E.tipT <= 0) {
        E.tipT = on ? 0.8 : 1.6;
        if (on) floatText(c.x, 2.3, c.z, L(`DESARMANDO ${Math.min(99, Math.floor((c.hold / HOLD) * 100))}%`, `DISARMING ${Math.min(99, Math.floor((c.hold / HOLD) * 100))}%`), 'up');
        else floatText(c.x, 2.3, c.z, c.hold > 0 ? L('▼ VOLTE AO CÍRCULO', '▼ STEP BACK IN') : L('▼ FIQUE NO CÍRCULO', '▼ STAND IN THE CIRCLE'), 'info');
      }
      if (dc < 7 && !E.hinted) {
        E.hinted = true;
        toast(L(`💣 <b>Como desarmar:</b> entre no círculo vermelho do console e fique dentro dele por 2,5s, até o círculo encher de verde. Se sair antes, o progresso volta. Faça isso nos 3 consoles antes do tempo acabar.`, `💣 <b>How to disarm:</b> step into the console's red circle and stay inside for ${HOLD}s, until it fills up green. If you leave early, the progress drains. Do it on all 3 consoles before time runs out.`), 'leg');
      }
      const k = Math.min(1, c.hold / HOLD) * 1.2;
      c.fill.scale.set(Math.max(0.001, k), 1, Math.max(0.001, k));
      if (on && Math.random() < dt * 10) burst(c.x, 0.9, c.z, 0x39ff88, 1, 1.5, 0.05, 0.4, { up: 1 });
      if (c.hold >= HOLD) {
        c.off = true;
        setLight(c.scr, 0x39ff88, 2);
        setLight(c.ringMat, 0x39ff88, 1.2);
        sfx.upgrade();
        const n = E.cons.filter((o) => o.off).length;
        floatText(c.x, 2, c.z, L(`DESARMADO ${n}/3`, `DISARMED ${n}/3`), 'up');
        if (n >= 3) {
          complete(E, 2.2, L('BOMBA DESARMADA!', 'BOMB DEFUSED!'), L(`Com ${mmss(E.t)} de sobra`, `With ${mmss(E.t)} to spare`), p.x, p.z);
          if (E.t >= E.limit / 2) achMark('flags', 'evBombFast');
          return;
        }
      }
    }
    if (E.delay > 0) {
      E.delay -= dt;
      return;
    }
    E.t -= dt;
    if (E.t < 10 && Math.floor(E.t) !== E.beep) {
      E.beep = Math.floor(E.t);
      sfx.telegraph();
    }
    if (E.t > 0) return;
    // explodiu: o jogador perde 20% da vida (nunca morre disso) e o bônus
    E.t = 0;
    for (const c of E.cons) {
      if (c.off) continue;
      explosion(c.x, c.z, 3.2, 2, { color: 0xff7a1a, noProc: true, knock: 6 });
      setLight(c.scr, 0x333344, 0.3);
      setLight(c.ringMat, 0x333344, 0.3);
    }
    G.shake = Math.max(G.shake, 0.9);
    const loss = Math.round(p.stats.maxHp * 0.2);
    p.hp = Math.max(1, p.hp - loss);
    floatText(p.x, 2.2, p.z, `-${short(loss)}`, 'hurt');
    banner(L('BOOM!', 'BOOM!'), L('A bomba explodiu e o bônus foi perdido', 'The bomb went off and the bonus is lost'));
    E.st = 'failed';
    sfx.deny();
  },
  hud: (E) => `${L('consoles', 'consoles')} ${E.cons.filter((c) => c.off).length}/3 · <span style="color:${E.t < 15 ? '#ff4466' : 'inherit'}">${mmss(E.t)}</span>`,
  save: (E) => ({ t: Math.round(E.t), off: E.cons.map((c) => (c.off ? 1 : 0)).join('') }),
  load(E, s) {
    E.t = Math.max(1, +s.t || E.limit);
    if (typeof s.off === 'string') E.cons.forEach((c, i) => (c.off = s.off[i] === '1'));
    for (const c of E.cons) {
      if (!c.off) continue;
      setLight(c.scr, 0x39ff88, 2);
      setLight(c.ringMat, 0x39ff88, 1.2);
    }
    if (s.st === 'done' || s.st === 'failed') {
      E.st = s.st;
      if (s.st === 'failed') for (const c of E.cons) if (!c.off) setLight(c.scr, 0x333344, 0.3);
    }
  },
  intro: (E) => L(`uma bomba foi armada! Ache os 3 consoles vermelhos (◆ laranja no mapa e setas na borda da tela) e desarme cada um ficando dentro do círculo dele por 2,5s, até encher de verde. Você tem <b>${mmss(E.limit)}</b>; se o tempo acabar, ela explode.`, `a bomb has been armed! Find the 3 red consoles (orange ◆ on the map and arrows at the screen edge) and disarm each one by staying inside its circle for ${HOLD}s, until it fills up green. You have <b>${mmss(E.limit)}</b>; if time runs out, it blows up.`),
};

// ==================================================================
// 6. Procurado: elite forte com nome e cartaz; foge e se esconde entre outros inimigos
// ==================================================================
const W_NAMES = ['Rex', 'Vex', 'Kira', 'Dax', 'Nyx', 'Zed', 'Juno', 'Kade', 'Rook', 'Mira', 'Orsk', 'Talon', 'Vira', 'Brix'];
const W_NICKS = [
  ['Navalha', 'Razor'],
  ['Fantasma', 'Ghost'],
  ['Curto-Circuito', 'Short-Circuit'],
  ['Víbora', 'Viper'],
  ['Cromado', 'Chrome'],
  ['Estática', 'Static'],
  ['Sem-Rosto', 'Faceless'],
  ['Mil Volts', 'Kilovolt'],
  ['Corvo', 'Raven'],
  ['Ferrugem', 'Rust'],
];
let posterTex = null;
function posterTexture(name, cr) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1410';
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#ffaa00';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 240, 304);
  g.fillStyle = '#ffaa00';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 36px Orbitron, Arial, sans-serif';
  g.fillText(L('PROCURADO', 'WANTED'), 128, 44, 228);
  // silhueta
  g.fillStyle = '#ff5a3a';
  g.beginPath();
  g.arc(128, 112, 30, 0, Math.PI * 2);
  g.fill();
  g.fillRect(84, 146, 88, 70);
  g.fillStyle = '#1b1410';
  g.fillRect(108, 104, 40, 8);
  g.fillStyle = '#ffffff';
  g.font = 'bold 24px Arial, sans-serif';
  g.fillText(name, 128, 242, 232);
  g.fillStyle = '#ffd23d';
  g.font = 'bold 26px Orbitron, Arial, sans-serif';
  g.fillText(`${fmt(cr)}¢`, 128, 284, 228);
  if (posterTex) posterTex.dispose();
  posterTex = new THREE.CanvasTexture(c);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  return posterTex;
}
const wanted = {
  setup(d, floor, rooms) {
    const far = rooms.filter((r) => Math.hypot(r.x + r.w / 2 - d.start.x, r.y + r.h / 2 - d.start.z) > 16);
    const s = findSpot(d, far.length ? far : rooms, 1);
    if (!s) return null;
    // cartaz perto do início
    let post = null;
    for (let t = 0; t < 30 && !post; t++) {
      const x = Math.floor(d.start.x + rr(-4, 4)) + 0.5;
      const z = Math.floor(d.start.z + rr(-4, 4)) + 0.5;
      if (Math.hypot(x - d.start.x, z - d.start.z) < 2 || !isWalkable(d, x, z) || d.props.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
      post = { x, z };
    }
    let type = pickEnemyType(floor);
    for (let t = 0; t < 6 && (ETYPES[type].solo || ETYPES[type].ai === 'inert'); t++) type = pickEnemyType(floor);
    const nick = pick(W_NICKS);
    const name = `${pick(W_NAMES)} "${L(nick[0], nick[1])}"`;
    const e = spawnEnemy(type, s.x, s.z, { elite: true, anomaly: true });
    e.hp = e.maxHp = e.maxHp * 3;
    e.dmg *= 1.15;
    e.xp = Math.round(e.xp * 2);
    e.r *= 1.1;
    e.height *= 1.15;
    e.model.root.scale.multiplyScalar(1.15);
    e.wanted = true;
    e.name = name;
    const E = { kind: 'wanted', x: null, z: null, e, name, st: 'hunt', blinks: 0 };
    if (post) {
      const g = groupAt(post.x, post.z);
      put(g, mats().cyl, mats().dark, 0, 0.8, 0, 0.05, 1.6, 0.05);
      const board = put(g, new THREE.PlaneGeometry(0.9, 1.12), new THREE.MeshBasicMaterial({ map: posterTexture(name, eventCredits(2.5)) }), 0, 1.75, 0.06);
      g.rotation.y = Math.PI / 4;
      E.poster = board;
    }
    return E;
  },
  // foge para longe, para perto de outro grupo de inimigos
  blink(E) {
    const e = E.e;
    const d = G.dungeon;
    const p = G.player;
    burst(e.x, 1, e.z, 0x888899, 30, 4, 0.12, 0.8, { up: 1 });
    ringFx(e.x, e.z, 2, 0xffaa00, 0.4);
    floatText(e.x, e.height + 0.6, e.z, L('FUGIU!', 'FLED!'), 'shield');
    const others = G.enemies.filter((o) => o.alive && o !== e && !o.inert && !o.boss && !o.decoy && o.type !== 'pylon' && Math.hypot(o.x - p.x, o.z - p.z) > 14);
    let pt = null;
    if (others.length) {
      const o = others[Math.floor(Math.random() * others.length)];
      pt = freeAround(d, o.x, o.z, 0.8, 2);
    }
    if (!pt) {
      const rooms = d.rooms.filter((r) => Math.hypot(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.z) > 14);
      const r = rooms.length ? rooms[Math.floor(Math.random() * rooms.length)] : null;
      if (r && isWalkable(d, r.x + r.w / 2, r.y + r.h / 2)) pt = { x: r.x + r.w / 2, z: r.y + r.h / 2 };
    }
    // último recurso (cavernas sem salas): um piso livre qualquer longe do jogador
    for (let k = 0; !pt && k < 200; k++) {
      const x = Math.floor(1 + Math.random() * (d.W - 2)) + 0.5, z = Math.floor(1 + Math.random() * (d.H - 2)) + 0.5;
      if (Math.hypot(x - p.x, z - p.z) > 12 && isWalkable(d, x, z)) pt = { x, z };
    }
    if (!pt) return;
    e.x = e.safeX = pt.x;
    e.z = e.safeZ = pt.z;
    e.kx = e.kz = 0;
    e.aggro = false;
    e.alerted = false;
    e.path = null;
    burst(e.x, 1, e.z, 0x888899, 20, 3, 0.1, 0.6, { up: 1 });
    sfx.dash();
    toast(L(`🎯 <b>${E.name}</b> fugiu e se escondeu! Siga a seta no mapa.`, `🎯 <b>${E.name}</b> fled and is hiding! Follow the arrow on the map.`), 'warn', 'ev');
  },
  update(E) {
    const e = E.e;
    if (E.st !== 'hunt' || !e.alive) return;
    const f = e.hp / e.maxHp;
    if ((E.blinks === 0 && f < 0.66) || (E.blinks === 1 && f < 0.33)) {
      E.blinks++;
      wanted.blink(E);
    }
  },
  kill(E, e) {
    if (E.e !== e || E.st !== 'hunt') return;
    complete(E, 2.5, L('ALVO CAPTURADO', 'TARGET CAPTURED'), L(`Recompensa por ${E.name}`, `Bounty for ${E.name}`), e.x, e.z, { loot: { thief: true } });
    if (E.poster) E.poster.material.color.setHex(0x555555);
  },
  hud: (E) => E.name,
  save: (E) => ({ blinks: E.blinks }),
  load(E, s) {
    E.blinks = s.blinks | 0;
    if (s.st === 'done' || !E.e.alive) {
      E.st = 'done';
      if (E.poster) E.poster.material.color.setHex(0x555555);
    }
  },
  intro: (E) => L(`<b>${E.name}</b> está neste andar (marcado no mapa). Ele foge quando apanha: cace-o pela recompensa de ${fmt(eventCredits(2.5))}¢!`, `<b>${E.name}</b> is on this floor (marked on the map). They flee when hurt: hunt them down for a ${fmt(eventCredits(2.5))}¢ bounty!`),
};

// ==================================================================
// 7. Caça aos Fragmentos: pegue 6 fragmentos de dados contra o relógio
// ==================================================================
const SHARDS = 6;
const shards = {
  setup(d, floor, rooms) {
    const list = [];
    const all = d.rooms.filter((r) => r !== d.rooms[0] && !r.safe);
    for (let t = 0; t < 160 && list.length < SHARDS; t++) {
      const r = pick(all);
      const x = Math.floor(r.x + rr(1, r.w - 1)) + 0.5;
      const z = Math.floor(r.y + rr(1, r.h - 1)) + 0.5;
      if (!spotOk(d, x, z, 0.4, 0.4, list.map((s) => ({ x: s.x, z: s.z, r: 7 })))) continue;
      list.push({ x, z });
    }
    if (list.length < SHARDS) return null;
    const mat = glowMat(0x7affc8, 2.6);
    for (const s of list) {
      s.g = groupAt(s.x, s.z);
      s.gem = put(s.g, mats().oct, mat, 0, 0.9, 0, 0.2, 0.32, 0.2);
      put(s.g, mats().ring, glowMat(0x7affc8, 0.9), 0, 0.03, 0, 0.45, 1, 0.45);
      s.got = false;
      s.ph = rr(0, 6);
    }
    return { kind: 'shards', x: null, z: null, list, st: 'idle', t: 0, limit: 0 };
  },
  remove(s, fx) {
    s.got = true;
    s.g.parent && s.g.parent.remove(s.g);
    if (fx) burst(s.x, 0.9, s.z, 0x7affc8, 16, 4, 0.07, 0.5, { up: 1.2 });
  },
  update(E, dt) {
    const p = G.player;
    for (const s of E.list) {
      if (s.got) continue;
      s.gem.rotation.y += dt * 2;
      s.gem.position.y = 0.9 + Math.sin(G.t * 3 + s.ph) * 0.1;
    }
    if (E.st === 'done' || E.st === 'failed' || !p.alive) return;
    for (const s of E.list) {
      if (s.got || Math.hypot(p.x - s.x, p.z - s.z) > 1.1) continue;
      shards.remove(s, true);
      sfx.pickup();
      const n = E.list.filter((o) => o.got).length;
      floatText(s.x, 1.8, s.z, `${n}/${SHARDS}`, 'up');
      if (E.st === 'idle') {
        // o relógio começa no primeiro: volta mais curta pelos que faltam (caminho de verdade) + folga
        const d = G.dungeon;
        E.limit = E.t = Math.round(Math.min(d.maze ? 420 : 260, 35 + routeTime(d, s.x, s.z, E.list.filter((o) => !o.got))) / 5) * 5;
        E.st = 'run';
        toast(L(`💠 O relógio começou: pegue os outros ${SHARDS - 1} fragmentos em <b>${mmss(E.t)}</b> (setas no mapa).`, `💠 The clock is ticking: grab the other ${SHARDS - 1} shards within <b>${mmss(E.t)}</b> (arrows on the map).`), 'leg', 'ev');
      }
      if (n >= SHARDS) {
        complete(E, 1.4, L('FRAGMENTOS RECUPERADOS', 'SHARDS RECOVERED'), L(`Com ${mmss(E.t)} de sobra`, `With ${mmss(E.t)} to spare`), p.x, p.z);
        return;
      }
    }
    if (E.st !== 'run') return;
    E.t -= dt;
    if (E.t > 0) return;
    E.t = 0;
    for (const s of E.list) if (!s.got) shards.remove(s, true);
    failed(E, L('O tempo acabou: os fragmentos se desfizeram.', 'Time is up: the shards dissolved.'));
  },
  hud: (E) => `${E.list.filter((s) => s.got).length}/${SHARDS}${E.st === 'run' ? ` · <span style="color:${E.t < 15 ? '#ff4466' : 'inherit'}">${mmss(E.t)}</span>` : ''}`,
  save: (E) => ({ got: E.list.map((s) => (s.got ? 1 : 0)).join(''), t: Math.round(E.t), limit: E.limit }),
  load(E, s) {
    if (typeof s.got === 'string') E.list.forEach((sh, i) => s.got[i] === '1' && shards.remove(sh, false));
    E.t = +s.t || 0;
    E.limit = +s.limit || 0;
    if (s.st === 'run' || s.st === 'done' || s.st === 'failed') E.st = s.st;
    if (E.st === 'run') E.t = Math.max(15, E.t);
    if (E.st === 'failed') for (const sh of E.list) if (!sh.got) shards.remove(sh, false);
  },
  intro: () => L(`${SHARDS} fragmentos de dados estão espalhados (marcados no mapa). O relógio começa quando você pegar o primeiro!`, `${SHARDS} data shards are scattered around (marked on the map). The clock starts when you grab the first one!`),
};

// ==================================================================
// 8. Prisioneiro: cela vigiada; derrote os guardas e solte o prisioneiro
// ==================================================================
const FREE_HOLD = 1.5;
const prisoner = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.4);
    if (!s) return null;
    const cls = pick(CLASS_ORDER);
    const g = groupAt(s.x, s.z);
    put(g, box(1.7, 0.1, 1.7), mats().metal, 0, 0.05, 0);
    put(g, box(1.7, 0.1, 1.7), mats().metal, 0, 1.95, 0);
    const bars = new THREE.Group();
    const barMat = lightMat(0xff3355, 1.4);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      put(bars, mats().bar, barMat, Math.cos(a) * 0.78, 1, Math.sin(a) * 0.78);
    }
    g.add(bars);
    const model = makePlayerModel(cls, CLASSES[cls].accent);
    model.root.rotation.y = Math.PI / 4;
    model.root.position.y = 0.1;
    g.add(model.root);
    // guardas em volta (um deles elite)
    const guards = [];
    const n = ri(4, 6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rr(-0.3, 0.3);
      const r = rr(2, 3.3);
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      if (!isWalkable(d, x, z)) continue;
      let type = pickEnemyType(floor);
      if (ETYPES[type].solo) type = pickEnemyType(floor);
      const e = spawnEnemy(type, x, z, { elite: k === 0, anomaly: true });
      e.guard = true;
      guards.push(e);
    }
    return { kind: 'prisoner', x: s.x, z: s.z, g, bars, barMat, model, guards, st: 'guarded', hold: 0, hinted: false };
  },
  free(E, quiet) {
    E.g.remove(E.bars);
    if (quiet) {
      E.g.remove(E.model.root);
      return;
    }
    const p = G.player;
    floatText(E.x, 2.4, E.z, L('OBRIGADO!', 'THANK YOU!'), 'up');
    sfx.heal();
    burst(E.x, 1, E.z, 0x39ff88, 30, 4, 0.07, 0.6, { up: 1.5 });
    // o prisioneiro agradece com um reforço de combate
    p.buffs.fury = Math.max(p.buffs.fury || 0, 120);
    p.buffs.haste = Math.max(p.buffs.haste || 0, 120);
    complete(E, 1.2, L('PRISIONEIRO LIBERTADO', 'PRISONER FREED'), L('+50% de dano e velocidade por 2 minutos', '+50% damage and speed for 2 minutes'), E.x, E.z);
    setTimeout(() => {
      if (!E.model.root.parent) return;
      burst(E.x, 1, E.z, 0x00f0ff, 24, 3, 0.07, 0.5, { up: 2 });
      E.g.remove(E.model.root);
    }, 1400);
  },
  update(E, dt) {
    if (E.st === 'done') return;
    E.model.root.rotation.y += dt * 0.3;
    if (E.st === 'guarded') {
      if (E.guards.some((e) => e.alive)) return;
      E.st = 'open';
      setLight(E.barMat, 0x39ff88, 1.6);
      toast(L('⛓️ Os guardas caíram! Fique perto da cela para soltar o prisioneiro.', '⛓️ The guards are down! Stand next to the cage to free the prisoner.'), 'leg', 'ev');
    }
    const on = near(E, 1.7);
    E.hold = on ? E.hold + dt : Math.max(0, E.hold - dt * 2);
    if (on && Math.random() < dt * 12) burst(E.x + rr(-0.7, 0.7), rr(0.3, 1.8), E.z + rr(-0.7, 0.7), 0x39ff88, 1, 1, 0.05, 0.4);
    if (E.hold >= FREE_HOLD) prisoner.free(E, false);
  },
  hud: (E) => (E.st === 'guarded' ? L(`${E.guards.filter((e) => e.alive).length} guardas`, `${E.guards.filter((e) => e.alive).length} guards`) : L('abra a cela', 'open the cage')),
  save: () => ({}),
  load(E, s) {
    if (s.st === 'done') {
      E.st = 'done';
      prisoner.free(E, true);
    } else if (!E.guards.some((e) => e.alive)) {
      E.st = 'open';
      setLight(E.barMat, 0x39ff88, 1.6);
    }
  },
  intro: (E) => L(`um prisioneiro está preso numa cela com ${E.guards.length} guardas (marcado no mapa). Solte-o para ganhar um reforço e itens.`, `a prisoner is locked in a cage with ${E.guards.length} guards (marked on the map). Free them for a combat boost and items.`),
};

// ==================================================================
// 9. Sala Secreta: parede rachada com faíscas; quebre com ataques
// ==================================================================
// escavada na geração (etapa 3, antes das malhas): a porta vira obstáculo sem pilar e a sala fica
// escondida no mapa (d.hidden) até a parede cair
export function carveSecret(d, floor) {
  G.events = [];
  d.secret = null;
  d.hidden = null;
  if (floor < 2 || isFinalFloor(floor) || !chance(0.35)) return;
  const { W, H, grid } = d;
  // só paredes viradas para a câmera (porta a -x ou -z), assim a rachadura aparece
  const DIRS = [
    [-1, 0],
    [0, -1],
  ];
  const cand = [];
  for (let j = 2; j < H - 2; j++)
    for (let i = 2; i < W - 2; i++) {
      const k = j * W + i;
      if (grid[k] !== TILE.FLOOR || d.feat[k]) continue;
      for (const [dx, dy] of DIRS) if (grid[(j + dy) * W + i + dx] === TILE.WALL) cand.push([i, j, dx, dy]);
    }
  for (const [i, j, dx, dy] of shuffle(cand).slice(0, 300)) {
    const px = -dy;
    const py = dx;
    let ok = true;
    for (let a = 1; a <= 5 && ok; a++)
      for (let b = -2; b <= 2 && ok; b++) {
        const x = i + dx * a + px * b;
        const y = j + dy * a + py * b;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || grid[y * W + x] !== TILE.WALL) ok = false;
      }
    if (!ok) continue;
    // a frente da parede precisa ser um corredor/sala de verdade (vizinhos laterais de piso)
    if (tileAt(d, i + px, j + py) !== TILE.FLOOR || tileAt(d, i - px, j - py) !== TILE.FLOOR) continue;
    if (Math.hypot(i + 0.5 - d.exit.x, j + 0.5 - d.exit.z) < 5 || Math.hypot(i + 0.5 - d.start.x, j + 0.5 - d.start.z) < 6) continue;
    if ((d.props || []).some((p) => Math.hypot(p.x - i - 0.5, p.z - j - 0.5) < 2.5)) continue;
    d.hidden = new Uint8Array(W * H);
    const di = i + dx;
    const dj = j + dy;
    grid[dj * W + di] = TILE.OBST;
    d.feat[dj * W + di] = 9; // sem pilar
    d.hidden[dj * W + di] = 1;
    for (let a = 2; a <= 4; a++)
      for (let b = -1; b <= 1; b++) {
        const x = i + dx * a + px * b;
        const y = j + dy * a + py * b;
        grid[y * W + x] = TILE.FLOOR;
        d.hidden[y * W + x] = 1;
      }
    d.secret = { i: di, j: dj, dx, dy, fx: i + 0.5, fz: j + 0.5, cx: i + dx * 3 + 0.5, cz: j + dy * 3 + 0.5 };
    return;
  }
}
const secret = {
  setup(d) {
    const S = d.secret;
    if (!S) return null;
    const e = spawnEnemy('crack', S.fx, S.fz, {});
    e.hp = e.maxHp = 3;
    e.facing = Math.atan2(S.dx, S.dy);
    e.model.root.rotation.y = e.facing;
    if (G.theme && e.model.mats[0]) e.model.mats[0].color.set(G.theme.wall);
    // altura das paredes do bioma
    const wh = G.theme && G.theme.wallH ? (G.theme.wallH[0] + G.theme.wallH[1]) / 2 : 1.7;
    if (e.model.wall) {
      e.model.wall.scale.y = wh / 1.7;
      e.model.wall.position.y = wh / 2;
    }
    e.secret = true;
    const chest = spawnChest(S.cx, S.cz);
    chest.group.visible = false;
    return { kind: 'secret', x: S.fx, z: S.fz, e, chest, st: 'hidden', hinted: false, sparkT: 0 };
  },
  open(E, quiet) {
    const d = G.dungeon;
    const S = d.secret;
    E.st = 'done';
    d.grid[S.j * d.W + S.i] = TILE.FLOOR;
    d.feat[S.j * d.W + S.i] = 0;
    if (d.hidden) d.hidden.fill(0);
    E.chest.group.visible = true;
    if (G.player) computeFlow(d, G.player.x, G.player.z);
    if (quiet) return;
    const wx = S.i + 0.5;
    const wz = S.j + 0.5;
    burst(wx, 1, wz, 0x9aa4c0, 40, 6, 0.12, 0.9, { up: 1.2 });
    burst(wx, 1, wz, 0xffaa33, 20, 5, 0.06, 0.5);
    sfx.explode();
    G.shake = Math.max(G.shake, 0.4);
    complete(E, 0.6, L('SALA SECRETA!', 'SECRET ROOM!'), L('Um cofre escondido atrás da parede', 'A cache hidden behind the wall'), wx, wz, { loot: {} });
  },
  update(E, dt) {
    if (E.st !== 'hidden') return;
    const p = G.player;
    const dist = Math.hypot(p.x - E.x, p.z - E.z);
    if (dist > 18) return;
    const S = G.dungeon.secret;
    E.sparkT -= dt;
    if (E.sparkT <= 0) {
      E.sparkT = 0.2 + Math.random() * 0.8;
      const wx = S.i + 0.5 - S.dx * 0.52 + (S.dy ? (Math.random() - 0.5) * 0.7 : 0);
      const wz = S.j + 0.5 - S.dy * 0.52 + (S.dx ? (Math.random() - 0.5) * 0.7 : 0);
      burst(wx, 0.4 + Math.random() * 1.1, wz, 0xffaa33, 3, 2.5, 0.04, 0.35, { grav: 9 });
    }
    if (!E.hinted && dist < 5 && p.alive) {
      E.hinted = true;
      toast(L('🧱 Essa parede tem rachaduras soltando faíscas... talvez ela quebre com alguns golpes.', '🧱 This wall has cracks throwing sparks... maybe a few hits will break it.'), 'leg', 'ev');
    }
  },
  save: () => ({}),
  load(E, s) {
    if (s.st === 'done' || !E.e.alive) secret.open(E, true);
  },
};
// a parede rachada caiu (chamado em killEnemy)
export function propBroken(e) {
  const E = (G.events || []).find((o) => o.kind === 'secret' && o.e === e);
  if (E && E.st === 'hidden') secret.open(E, false);
}

// ==================================================================
// 10. Máquina de Apostas: pague créditos por um item aleatório (pode ser mítico)
// ==================================================================
const REEL_COL = [0xff2bd6, 0x00f0ff, 0xffd23d];
export function gambleCost(E) {
  const c = G.char;
  return Math.round((50 + tierFloor() * 15 + (c ? c.level : 1) * 3) * tierOf().credits * Math.pow(1.25, E.uses));
}
const gamble = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    g.rotation.y = Math.PI / 4; // de frente para a câmera
    put(g, box(0.95, 1.5, 0.65), mats().dark, 0, 0.75, 0);
    put(g, box(1.0, 0.1, 0.7), glowMat(0xff2bd6, 2), 0, 1.55, 0);
    put(g, box(0.8, 0.3, 0.05), glowMat(0xffd23d, 1.8), 0, 1.78, 0);
    const scr = lightMat(0x2a0f30, 1);
    put(g, box(0.78, 0.42, 0.03), scr, 0, 1.08, 0.33);
    const reels = REEL_COL.map((col, k) => {
      const m = lightMat(col, 2);
      const r = put(g, box(0.18, 0.26, 0.06), m, (k - 1) * 0.24, 1.08, 0.35);
      return { r, m };
    });
    put(g, mats().cyl, mats().metal, 0.56, 1.1, 0, 0.03, 0.5, 0.03);
    const knob = put(g, new THREE.SphereGeometry(0.08, 8, 6), glowMat(0xff3355, 2.4), 0.56, 1.4, 0);
    const E = { kind: 'gamble', x: s.x, z: s.z, g, scr, reels, knob, uses: 0, spinT: 0, hinted: false };
    E.pr = { type: 'gamble', x: s.x, z: s.z, ev: E };
    d.props.push(E.pr);
    return E;
  },
  use(E) {
    const c = G.char;
    if (E.spinT > 0) return;
    const cost = gambleCost(E);
    if (c.credits < cost) {
      sfx.deny();
      toast(L(`Créditos insuficientes: a aposta custa ${fmt(cost)}¢.`, `Not enough credits: a bet costs ${fmt(cost)}¢.`), 'warn');
      return;
    }
    c.credits -= cost;
    E.uses++;
    E.spinT = 1.3;
    E.knob.position.y = 1.15;
    sfx.spin();
  },
  result(E) {
    const r = Math.random();
    const top = diffRank() >= 7 || (G.char.tier | 0) >= 1;
    // mesmo piso de raridade dos drops: do Insano para cima (ou no Inferno) não sai modificado
    const minR = rewardRank() >= 5 || tierOf().off >= 60 ? 2 : 1;
    // no Abismo o prêmio máximo pode ser primordial (0,5%)
    const rarity = Math.max(minR, abyssLvl() && r < 0.005 ? PRIMORDIAL : top && r < 0.05 ? DIVINE : r < (top ? 0.08 : 0.05) ? MYTHIC : r < 0.21 ? 3 : r < 0.66 ? 2 : 1);
    const it = makeItem({ ilvl: tierFloor() + diffIlvl() + 1, rarity, cls: G.char.cls });
    const d = G.dungeon;
    const fx = E.x + 0.8;
    const fz = E.z + 0.8;
    spawnPickup('item', isWalkable(d, fx, fz) ? fx : E.x, isWalkable(d, fx, fz) ? fz : E.z + 1, { item: it });
    const col = RARITY[rarity].hex;
    for (const rl of E.reels) setLight(rl.m, col, 2.6);
    setLight(E.scr, col, 0.8);
    burst(E.x, 1.3, E.z, col, rarity >= MYTHIC ? 60 : 20, rarity >= MYTHIC ? 7 : 4, 0.07, 0.7, { up: 1.5 });
    if (E.uses === 1) {
      achAdd('events');
      achMark('evDone', 'gamble');
    }
    achAdd('gambles');
    if (rarity >= MYTHIC) {
      achMark('flags', 'gambleMyth');
      banner(L('JACKPOT!', 'JACKPOT!'), itemName(it));
      sfx.mythic();
      ringFx(E.x, E.z, 3, col, 0.6);
    } else if (rarity >= 3) sfx.legendary();
    else sfx.coin();
    saveGame();
  },
  update(E, dt) {
    if (!E.hinted && near(E, 4)) {
      E.hinted = true;
      toast(L(`🎰 <b>Máquina de Apostas</b>: pague ${fmt(gambleCost(E))}¢ por um item aleatório. Pode sair até um mítico!`, `🎰 <b>Slot Machine</b>: pay ${fmt(gambleCost(E))}¢ for a random item. It might even be mythic!`), 'item', 'ev');
    }
    if (E.spinT <= 0) return;
    E.spinT -= dt;
    E.reels.forEach((rl, k) => {
      rl.r.rotation.x += dt * (24 + k * 6);
      if (Math.random() < dt * 14) setLight(rl.m, REEL_COL[Math.floor(Math.random() * 3)], 2.4);
    });
    E.knob.position.y = Math.min(1.4, E.knob.position.y + dt * 0.4);
    if (E.spinT > 0) return;
    E.reels.forEach((rl) => (rl.r.rotation.x = 0));
    E.knob.position.y = 1.4;
    gamble.result(E);
  },
  save: (E) => ({ uses: E.uses }),
  load(E, s) {
    E.uses = s.uses | 0;
  },
};
export function useGamble(pr) {
  if (pr && pr.ev && G.events.includes(pr.ev)) gamble.use(pr.ev);
}

// ==================================================================
// 11. Circuito Neon: passe pelos portais na ordem; cada portal dá mais tempo no relógio
// ==================================================================
const GATES = 6;
const GATE_COL = 0xff9a3d;
const relay = {
  setup(d, floor, rooms) {
    const all = d.rooms.filter((r) => r !== d.rooms[0] && !r.safe);
    if (!all.length) return null;
    const pts = [];
    for (let t = 0; t < 220 && pts.length < GATES; t++) {
      const r = pick(all);
      const x = Math.floor(r.x + rr(1, r.w - 1)) + 0.5;
      const z = Math.floor(r.y + rr(1, r.h - 1)) + 0.5;
      if (!spotOk(d, x, z, 1, 1, pts.map((s) => ({ x: s.x, z: s.z, r: 9 })))) continue;
      pts.push({ x, z });
    }
    if (pts.length < GATES) return null;
    // ordem: sempre o portal mais perto (pelo caminho) do anterior, começando pelo mais perto da
    // entrada; cada portal guarda os segundos que dá para chegar ao próximo
    const { legs } = routeTime(d, d.start.x, d.start.z, pts, true);
    const list = legs.map((l) => l.p);
    legs.forEach((l, i) => i && (list[i - 1].add = Math.round(5 + l.s)));
    list.forEach((g, i) => {
      const o = list[i + 1] || list[i - 1];
      g.g = groupAt(g.x, g.z);
      // o arco fica de frente para o próximo portal
      g.g.rotation.y = Math.atan2(o.x - g.x, o.z - g.z);
      g.mat = lightMat(GATE_COL, 0.4);
      put(g.g, box(0.16, 1.9, 0.16), mats().metal, -0.95, 0.95, 0);
      put(g.g, box(0.16, 1.9, 0.16), mats().metal, 0.95, 0.95, 0);
      put(g.g, box(2.06, 0.14, 0.18), g.mat, 0, 1.92, 0);
      put(g.g, box(0.08, 1.7, 0.2), g.mat, -0.95, 0.95, 0);
      put(g.g, box(0.08, 1.7, 0.2), g.mat, 0.95, 0.95, 0);
      put(g.g, mats().ring, g.mat, 0, 0.03, 0, 1.05, 1, 1.05);
    });
    const E = { kind: 'relay', x: null, z: null, list, idx: 0, st: 'idle', t: 0, beep: -1 };
    relay.paint(E);
    return E;
  },
  paint(E) {
    E.list.forEach((g, i) => {
      if (i < E.idx) setLight(g.mat, 0x39ff88, 1);
      else if (E.st === 'failed') setLight(g.mat, 0x333344, 0.3);
      else setLight(g.mat, GATE_COL, i === E.idx ? 2 : 0.4);
    });
  },
  update(E, dt) {
    if (E.st === 'done' || E.st === 'failed') return;
    const p = G.player;
    const cur = E.list[E.idx];
    setLight(cur.mat, GATE_COL, 1.8 + Math.sin(G.t * 7) * 0.7);
    if (p.alive && Math.hypot(p.x - cur.x, p.z - cur.z) < 1.25) {
      E.idx++;
      setLight(cur.mat, 0x39ff88, 1);
      sfx.seq(E.idx % 4);
      burst(cur.x, 1, cur.z, GATE_COL, 18, 4, 0.07, 0.5, { up: 1.2 });
      ringFx(cur.x, cur.z, 1.6, 0x39ff88, 0.35);
      floatText(cur.x, 2.5, cur.z, `${E.idx}/${GATES}`, 'up');
      if (E.idx >= GATES) {
        complete(E, 1.5, L('CIRCUITO COMPLETO!', 'CIRCUIT COMPLETE!'), L(`Com ${mmss(E.t)} de sobra`, `With ${mmss(E.t)} to spare`), p.x, p.z, { extra: E.t >= 10 });
        return;
      }
      // tempo para o próximo: caminho de verdade com folga para lutas (e desvios, na masmorra)
      const add = cur.add;
      if (E.st === 'idle') {
        E.st = 'run';
        E.t = add;
        toast(L(`🏁 Valendo! Corra para o próximo portal (seta na borda da tela). Cada portal dá mais tempo.`, `🏁 Go! Run to the next gate (arrow at the screen edge). Each gate gives you more time.`), 'leg', 'ev');
      } else {
        E.t += add;
        floatText(cur.x, 1.9, cur.z, `+${add}s`, 'info');
      }
      return;
    }
    if (E.st !== 'run' || !p.alive || G.mode !== 'play') return;
    E.t -= dt;
    if (E.t < 5 && Math.floor(E.t) !== E.beep) {
      E.beep = Math.floor(E.t);
      sfx.telegraph();
    }
    if (E.t > 0) return;
    E.t = 0;
    E.st = 'failed';
    relay.paint(E);
    failed(E, L('O tempo acabou: o circuito desligou.', 'Time is up: the circuit shut down.'));
  },
  hud: (E) => (E.st === 'idle' ? L('ache o 1º portal', 'find gate 1') : `${E.idx}/${GATES} · <span style="color:${E.t < 8 ? '#ff4466' : 'inherit'}">${mmss(E.t)}</span>`),
  save: (E) => ({ idx: E.idx, t: Math.round(E.t) }),
  load(E, s) {
    E.idx = Math.max(0, Math.min(GATES - 1, s.idx | 0));
    E.t = +s.t || 0;
    if (s.st === 'run' || s.st === 'done' || s.st === 'failed') E.st = s.st;
    if (E.st === 'done') E.idx = GATES;
    if (E.st === 'run') E.t = Math.max(15, E.t);
    relay.paint(E);
  },
  intro: () => L(`${GATES} portais formam um circuito pelo andar (o próximo fica marcado no mapa). Passe pelo primeiro e o relógio começa: cada portal dá mais tempo.`, `${GATES} gates form a circuit across the floor (the next one is marked on the map). Go through the first and the clock starts: every gate adds time.`),
};

// ==================================================================
// 12. Sinal Perdido: um cofre de dados enterrado numa área do mapa; o bipe acelera quando você chega perto
// ==================================================================
const SIG_COL = 0x5affd2;
const SIG_HOLD = 3;
const SIG_R = 7; // raio da área marcada no mapa
const signal = {
  setup(d, floor, rooms) {
    const far = rooms.filter((r) => Math.hypot(r.x + r.w / 2 - d.start.x, r.y + r.h / 2 - d.start.z) > 14);
    const s = findSpot(d, far.length ? far : rooms, 1);
    if (!s) return null;
    // a área do mapa não fica centrada no esconderijo
    const a = rr(0, Math.PI * 2);
    const off = rr(2, 4.5);
    const cx = s.x + Math.cos(a) * off;
    const cz = s.z + Math.sin(a) * off;
    const g = groupAt(s.x, s.z);
    put(g, box(0.55, 0.1, 0.55), mats().dark, 0, 0.05, 0);
    put(g, mats().cyl, mats().metal, 0, 0.35, 0, 0.03, 0.55, 0.03);
    const tip = lightMat(SIG_COL, 0.3);
    put(g, mats().oct, tip, 0, 0.68, 0, 0.07, 0.1, 0.07);
    const ringMat = flatMat(SIG_COL, 0);
    put(g, mats().ring, ringMat, 0, 0.03, 0, 1.1, 1, 1.1);
    const fill = put(g, mats().disc, flatMat(SIG_COL, 0.3), 0, 0.025, 0, 0.001, 1, 0.001);
    return { kind: 'signal', x: s.x, z: s.z, cx, cz, g, tip, ringMat, fill, st: 'search', hold: 0, beepT: 0, flash: 0, dist: 99, amb: false };
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const p = G.player;
    if (!p.alive) return;
    const dist = Math.hypot(p.x - E.x, p.z - E.z);
    E.dist = dist;
    // bipe (e a antena pisca) mais rápido quanto mais perto
    E.flash -= dt;
    if (dist < 18) {
      E.beepT -= dt;
      if (E.beepT <= 0) {
        E.beepT = 0.16 + dist * 0.07;
        E.flash = 0.09;
        sfx.click();
      }
    }
    setLight(E.tip, SIG_COL, E.flash > 0 ? 3 : dist < 5 ? 1.2 : 0.3);
    E.ringMat.opacity = dist < 6 ? 0.55 : 0;
    const on = dist < 1.15;
    if (on && !E.amb) {
      // desenterrar faz barulho: catadores aparecem
      E.amb = true;
      spawnWave(E, Math.min(6, 2 + Math.floor(G.floor / 6)), E.x, E.z, 4, 7, SIG_COL);
      sfx.alarm();
      toast(L('📶 Achou! Fique em cima para desenterrar o cofre... e cuidado com os catadores!', '📶 Found it! Stand on it to dig up the cache... and watch out for scavengers!'), 'leg', 'ev');
    }
    E.hold = on ? E.hold + dt : Math.max(0, E.hold - dt * 0.5);
    const k = Math.min(1, E.hold / SIG_HOLD) * 1.1;
    E.fill.scale.set(Math.max(0.001, k), 1, Math.max(0.001, k));
    if (on && Math.random() < dt * 10) burst(E.x, 0.2, E.z, 0x8a6a44, 1, 2, 0.06, 0.4, { up: 1 });
    if (E.hold >= SIG_HOLD) {
      setLight(E.tip, 0x39ff88, 2);
      E.ringMat.opacity = 0;
      E.fill.scale.set(0.001, 1, 0.001);
      complete(E, 1.4, L('SINAL RECUPERADO', 'SIGNAL RECOVERED'), L('O cofre de dados estava enterrado aqui', 'The data cache was buried here'), E.x, E.z, { extra: true });
    }
  },
  hud(E) {
    if (E.hold > 0) return `${Math.floor((E.hold / SIG_HOLD) * 100)}%`;
    const d = E.dist;
    return d < 5 ? `<span style="color:#ff4466">${L('fervendo!', 'burning hot!')}</span>` : d < 12 ? L('quente', 'warm') : d < 22 ? L('morno', 'lukewarm') : L('frio', 'cold');
  },
  save: (E) => ({ amb: E.amb ? 1 : 0 }),
  load(E, s) {
    E.amb = !!s.amb;
    if (s.st === 'done') {
      E.st = 'done';
      setLight(E.tip, 0x39ff88, 2);
    }
  },
  intro: () => L('um cofre de dados está enterrado em algum lugar dentro do círculo do mapa. Siga o bipe: quanto mais perto, mais rápido ele toca.', 'a data cache is buried somewhere inside the circle on the map. Follow the beep: the closer you get, the faster it goes.'),
};

// ==================================================================
// 13. Servidores Corrompidos: 3 torres que chamam defensores; destrua as 3
// ==================================================================
const SRV = 3;
const SRV_COL = 0xff3366;
const servers = {
  setup(d, floor, rooms) {
    const pts = [];
    for (let k = 0; k < SRV; k++) {
      const s = findSpot(d, rooms, 1, 1, pts.map((o) => ({ x: o.x, z: o.z, r: 13 })));
      if (!s) return null;
      pts.push({ x: s.x, z: s.z });
    }
    const list = pts.map((s) => {
      const e = spawnEnemy('pylon', s.x, s.z, {});
      e.hp = e.maxHp = e.maxHp * 6;
      e.xp = Math.round(e.xp * 4);
      e.name = L('Servidor Corrompido', 'Corrupted Server');
      e.server = true;
      const g = groupAt(s.x, s.z);
      const ring = lightMat(SRV_COL, 1.4);
      put(g, mats().ring, ring, 0, 0.03, 0, 1.3, 1, 1.3);
      return { x: s.x, z: s.z, e, g, ring, t: rr(1, 3) };
    });
    return { kind: 'servers', x: null, z: null, list, st: 'idle' };
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const p = G.player;
    for (const s of E.list) {
      if (!s.e.alive) continue;
      if (Math.random() < dt * 5) burst(s.x, rr(0.6, 2.2), s.z, SRV_COL, 1, 1.2, 0.05, 0.4, { grav: -3 });
      if (!p.alive || Math.hypot(p.x - s.x, p.z - s.z) > 10) continue;
      if (E.st === 'idle') {
        E.st = 'active';
        toast(L('🗄️ O servidor detectou você e está chamando defensores! Destrua as torres rápido.', '🗄️ The server spotted you and is calling defenders! Destroy the towers fast.'), 'leg', 'ev');
      }
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = rr(8, 11);
      spawnWave(E, Math.min(4, 1 + Math.floor(G.floor / 8)), s.x, s.z, 1.6, 3.5, SRV_COL);
      sfx.telegraph();
    }
  },
  kill(E, e) {
    const s = E.list.find((o) => o.e === e);
    if (!s || E.st === 'done') return;
    setLight(s.ring, 0x333344, 0.3);
    G.shake = Math.max(G.shake, 0.3);
    const n = E.list.filter((o) => !o.e.alive).length;
    floatText(e.x, 2.8, e.z, L(`SERVIDOR ${n}/${SRV}`, `SERVER ${n}/${SRV}`), 'up');
    if (n >= SRV) complete(E, 1.8, L('REDE LIMPA!', 'NETWORK PURGED!'), L('Os 3 servidores caíram', 'All 3 servers are down'), e.x, e.z);
  },
  hud: (E) => `${E.list.filter((o) => !o.e.alive).length}/${SRV}`,
  save: () => ({}),
  load(E, s) {
    for (const o of E.list) if (!o.e.alive) setLight(o.ring, 0x333344, 0.3);
    if (s.st === 'done' || E.list.every((o) => !o.e.alive)) E.st = 'done';
  },
  intro: () => L(`${SRV} servidores corrompidos estão neste andar (marcados no mapa). Eles chamam defensores quando você chega perto: destrua os ${SRV}.`, `${SRV} corrupted servers are on this floor (marked on the map). They call defenders when you get close: destroy all ${SRV}.`),
};

// ==================================================================
// 14. Escolta do Drone: o drone só anda com você por perto; ondas tentam pará-lo
// ==================================================================
const ESC_COL = 0x5ab8ff;
const ESC_R = 4.5;
const ESC_SPEED = 1.7;
const escort = {
  setup(d, floor, rooms) {
    const a = findSpot(d, rooms, 1);
    if (!a) return null;
    // destino: a reta entre 16 e 42 e o caminho de verdade até 75 (na masmorra a reta engana)
    let b = null;
    let pts = null;
    let tot = 0;
    let tries = 0;
    for (const r of shuffle(rooms.slice())) {
      const x = Math.floor(r.x + r.w / 2) + 0.5;
      const z = Math.floor(r.y + r.h / 2) + 0.5;
      const dd = Math.hypot(x - a.x, z - a.z);
      if (dd < 16 || dd > 42 || !spotOk(d, x, z, 1, 1, [{ x: a.x, z: a.z, r: 12 }])) continue;
      if (++tries > 10) break;
      const path = findPath(d, a.x, a.z, x, z, 12000);
      if (!path || !path.length) continue;
      const p2 = [{ x: a.x, z: a.z }, ...path];
      let len = 0;
      for (let i = 1; i < p2.length; i++) len += Math.hypot(p2[i].x - p2[i - 1].x, p2[i].z - p2[i - 1].z);
      if (len > 75) continue;
      b = { x, z };
      pts = p2;
      tot = len;
      break;
    }
    if (!b) return null;
    const g = groupAt(a.x, a.z);
    const bob = new THREE.Group();
    g.add(bob);
    put(bob, box(0.7, 0.26, 0.7), mats().metal, 0, 1.35, 0);
    put(bob, box(1.1, 0.06, 0.12), mats().dark, 0, 1.45, 0);
    put(bob, box(0.12, 0.06, 1.1), mats().dark, 0, 1.45, 0);
    put(bob, mats().oct, glowMat(ESC_COL, 2.6), 0, 1.05, 0, 0.17, 0.24, 0.17);
    const rmat = lightMat(ESC_COL, 1.2);
    put(g, mats().ring, rmat, 0, 0.03, 0, ESC_R, 1, ESC_R);
    const tg = groupAt(b.x, b.z);
    put(tg, mats().ring, lightMat(ESC_COL, 1.6), 0, 0.03, 0, 1.3, 1, 1.3);
    put(tg, mats().cyl, flatMat(ESC_COL, 0.18), 0, 2.5, 0, 0.6, 5, 0.6);
    return { kind: 'escort', x: a.x, z: a.z, g, bob, tg, rmat, pts, tot, prog: 0, tx: b.x, tz: b.z, st: 'idle', waveT: 3, stall: false, tipT: 0 };
  },
  place(E) {
    let left = E.prog;
    for (let i = 1; i < E.pts.length; i++) {
      const p0 = E.pts[i - 1];
      const p1 = E.pts[i];
      const L0 = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (left <= L0 || i === E.pts.length - 1) {
        const k = L0 > 0 ? Math.min(1, left / L0) : 1;
        E.x = p0.x + (p1.x - p0.x) * k;
        E.z = p0.z + (p1.z - p0.z) * k;
        E.bob.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        break;
      }
      left -= L0;
    }
    E.g.position.set(E.x, 0, E.z);
  },
  update(E, dt) {
    E.bob.position.y = Math.sin(G.t * 2.4) * 0.1;
    if (E.st === 'done') return;
    if (E.st === 'idle') {
      if (!near(E, 3)) return;
      E.st = 'move';
      banner(L('ESCOLTA INICIADA', 'ESCORT STARTED'), L('Fique dentro do círculo: o drone só anda com você por perto', 'Stay inside the circle: the drone only moves with you nearby'));
      sfx.deploy();
    }
    const inside = near(E, ESC_R);
    if (inside === E.stall) {
      E.stall = !inside;
      setLight(E.rmat, inside ? ESC_COL : 0xff4466, inside ? 1.2 : 1.8);
    }
    E.tipT -= dt;
    if (inside) {
      E.prog = Math.min(E.tot, E.prog + dt * ESC_SPEED);
      escort.place(E);
      if (Math.random() < dt * 6) burst(E.x, 0.9, E.z, ESC_COL, 1, 1.2, 0.05, 0.4, { grav: 4 });
    } else if (E.tipT <= 0) {
      E.tipT = 2.5;
      floatText(E.x, 2.3, E.z, L('ESPERANDO VOCÊ', 'WAITING FOR YOU'), 'shield');
    }
    E.waveT -= dt;
    if (E.waveT <= 0) {
      E.waveT = 7 + Math.random() * 2.5;
      spawnWave(E, Math.min(6, 2 + Math.floor(G.floor / 6)), E.x, E.z, 6, 9, ESC_COL);
      sfx.telegraph();
    }
    if (E.prog < E.tot) return;
    E.tg.visible = false;
    setLight(E.rmat, 0x39ff88, 1.2);
    complete(E, 1.6, L('ENTREGA CONCLUÍDA', 'DELIVERY COMPLETE'), L('O drone chegou inteiro', 'The drone made it in one piece'), E.tx, E.tz);
  },
  hud: (E) => (E.st === 'idle' ? L('vá até o drone', 'reach the drone') : `${Math.floor((E.prog / E.tot) * 100)}%${E.stall ? ' ⏸' : ''}`),
  save: (E) => ({ prog: Math.round(E.prog * 10) / 10 }),
  load(E, s) {
    E.prog = Math.max(0, Math.min(E.tot, +s.prog || 0));
    if (s.st === 'move') E.st = 'move';
    if (s.st === 'done') {
      E.st = 'done';
      E.prog = E.tot;
      E.tg.visible = false;
      setLight(E.rmat, 0x39ff88, 1.2);
    }
    escort.place(E);
  },
  busy: (E) => E.st === 'move',
  intro: () => L('leve o drone até o destino (marcado no mapa). Ele só anda com você dentro do círculo, e ondas de inimigos vão atacar no caminho.', 'escort the drone to its destination (marked on the map). It only moves while you are inside its circle, and waves of enemies will attack along the way.'),
};

// ==================================================================
// 15. Pares de Memória: placas escondem cores; pise em duas para revelar e ache todos os pares
// ==================================================================
const PAIR_COL = [0xff3355, 0x39ff88, 0x3d8bff, 0xffd23d, 0xff2bd6, 0x00f0ff];
const PCS = 1.75;
const pairs = {
  setup(d, floor, rooms) {
    const n = floor >= 12 ? 6 : 4;
    const rows = n / 2;
    const s = findSpot(d, rooms, 3.4, rows === 3 ? 2.6 : 1.7);
    if (!s) return null;
    const vals = shuffle([...Array(n).keys(), ...Array(n).keys()]);
    const g = groupAt(s.x, s.z);
    const tiles = vals.map((v, k) => {
      const ox = ((k % 4) - 1.5) * PCS;
      const oz = (Math.floor(k / 4) - (rows - 1) / 2) * PCS;
      put(g, box(1.22, 0.04, 1.22), mats().dark, ox, 0.02, oz);
      const m = put(g, box(1.06, 0.07, 1.06), mats().plateOff, ox, 0.035, oz);
      return { x: s.x + ox, z: s.z + oz, m, v };
    });
    return { kind: 'pairs', x: s.x, z: s.z, g, n, tiles, matched: tiles.map(() => 0), open: [], miss: 0, hideT: 0, last: -1, st: 'play', hinted: false };
  },
  paint(E) {
    E.tiles.forEach((t, k) => {
      t.m.material = E.matched[k] ? glowMat(PAIR_COL[t.v], E.st === 'done' ? 1.3 : 0.9) : E.open.includes(k) ? glowMat(PAIR_COL[t.v], 1.8) : mats().plateOff;
    });
  },
  under(E) {
    const p = G.player;
    if (!p.alive) return -1;
    for (let k = 0; k < E.tiles.length; k++) if (Math.abs(p.x - E.tiles[k].x) < 0.55 && Math.abs(p.z - E.tiles[k].z) < 0.55) return k;
    return -1;
  },
  update(E, dt) {
    if (E.st !== 'play') return;
    if (!E.hinted && near(E, 5.5)) {
      E.hinted = true;
      toast(L('🃏 Pise numa placa para ver a cor dela e depois em outra: se as cores forem iguais, o par fica aceso. Ache todos os pares!', '🃏 Step on a plate to see its color, then on another: if the colors match, the pair stays lit. Find every pair!'), 'leg', 'ev');
    }
    if (E.hideT > 0) {
      E.hideT -= dt;
      if (E.hideT <= 0) {
        E.open = [];
        pairs.paint(E);
      }
    }
    const k = pairs.under(E);
    if (k === E.last) return;
    E.last = k;
    if (k < 0 || E.hideT > 0 || E.matched[k] || E.open.includes(k)) return;
    const t = E.tiles[k];
    E.open.push(k);
    pairs.paint(E);
    sfx.seq(t.v % 4);
    burst(t.x, 0.2, t.z, PAIR_COL[t.v], 8, 2, 0.05, 0.4, { up: 1 });
    if (E.open.length < 2) return;
    const [a, b] = E.open;
    if (E.tiles[a].v === E.tiles[b].v) {
      E.matched[a] = E.matched[b] = 1;
      E.open = [];
      sfx.upgrade();
      floatText(t.x, 1.6, t.z, L('PAR!', 'PAIR!'), 'up');
      if (E.matched.every((m) => m)) {
        E.st = 'done';
        pairs.paint(E);
        const perfect = E.miss <= E.n / 2;
        complete(E, 1.1 + E.n * 0.05, L('MEMÓRIA PERFEITA', 'TOTAL RECALL'), L(`${E.n} pares com ${E.miss} erros`, `${E.n} pairs with ${E.miss} misses`), E.x, E.z, { extra: perfect });
        return;
      }
      pairs.paint(E);
      return;
    }
    // errou: as duas ficam à mostra um instante e apagam; muitos erros chamam inimigos
    E.miss++;
    E.hideT = 0.9;
    sfx.deny();
    floatText(t.x, 1.6, t.z, '✖', 'hurt');
    if (E.miss > E.n && E.miss % 2 === 0) {
      spawnWave(E, 2, E.x, E.z, 4.5, 7, 0xff2244);
      floatText(E.x, 2.2, E.z, L('ALARME!', 'ALARM!'), 'hurt');
    }
  },
  hud: (E) => `${E.matched.filter((m) => m).length / 2}/${E.n}${E.miss ? ` <span style="color:#ff4466">✖${E.miss}</span>` : ''}`,
  save: (E) => ({ m: E.matched.join(''), miss: E.miss }),
  load(E, s) {
    if (typeof s.m === 'string' && s.m.length === E.tiles.length) E.matched = s.m.split('').map(Number);
    E.miss = s.miss | 0;
    if (s.st === 'done') {
      E.st = 'done';
      E.matched = E.tiles.map(() => 1);
    }
    pairs.paint(E);
  },
  intro: (E) => L(`${E.n * 2} placas escondem ${E.n} pares de cores (marcado no mapa). Revele duas de cada vez e ache todos os pares; quem erra menos ganha um cofre extra.`, `${E.n * 2} plates hide ${E.n} pairs of colors (marked on the map). Reveal two at a time and find every pair; few misses earn an extra cache.`),
};

// ------------------------------------------------------------------
// Peças dos eventos novos (16 a 25)
// ------------------------------------------------------------------
// dano de evento: fração da vida máxima, nunca mata e respeita a invulnerabilidade (esquiva, teleporte)
function eventHurt(frac, x, z, knock = 0) {
  const p = G.player;
  if (!p || !p.alive || p.invuln > 0 || G.mode !== 'play') return false;
  const loss = Math.max(1, Math.round(p.stats.maxHp * frac));
  p.hp = Math.max(1, p.hp - loss);
  p.hurtT = 0.12;
  runHurt();
  floatText(p.x, 1.8, p.z, `-${short(loss)}`, 'hurt');
  sfx.hurt();
  if (knock && x != null) {
    const dx = p.x - x;
    const dz = p.z - z;
    const l = Math.hypot(dx, dz) || 1;
    p.kx = (p.kx || 0) + (dx / l) * knock;
    p.kz = (p.kz || 0) + (dz / l) * knock;
  }
  return true;
}
// distância de (px, pz) até o segmento a–b
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
// alvo que apanha (cofre, bola): uma "parede rachada" invisível; cada golpe tira 1 de vida (até 4 por segundo)
function hitTarget(x, z, r, h, name) {
  const e = spawnEnemy('crack', x, z, {});
  e.hp = e.maxHp = 1e6;
  e.r = r;
  e.height = h;
  e.name = name;
  e.model.root.visible = false;
  return e;
}
// golpes novos no alvo desde a última olhada
function hitsOf(E) {
  const n = Math.round(E.e.maxHp - E.e.hp);
  const k = n - E.hits;
  E.hits = n;
  return Math.max(0, k);
}
// some com o alvo sem efeito nenhum
function dropTarget(E) {
  const e = E.e;
  if (!e || !e.alive) return;
  killQuiet(e);
}
// inimigo que luta de verdade (sem torres, objetos ou chefes solitários)
function fighterType() {
  let type = pickEnemyType(G.floor);
  for (let t = 0; t < 8 && (ETYPES[type].solo || ETYPES[type].static || ETYPES[type].ai === 'inert'); t++) type = pickEnemyType(G.floor);
  return type;
}
function ambush(E, n, x, z, r0, r1, color, o = {}) {
  for (let k = 0; k < n; k++) {
    const pt = freeAround(G.dungeon, x, z, r0, r1);
    if (!pt) continue;
    const e = spawnEnemy(fighterType(), pt.x, pt.z, { elite: o.elite });
    applyAnomalyToEnemy(e);
    if (o.hp) e.hp = e.maxHp = e.maxHp * o.hp;
    if (o.name) e.name = o.name;
    e.aggro = true;
    e.alerted = true;
    E.foes.push(e);
    burst(pt.x, 0.8, pt.z, color, 18, 5, 0.08, 0.6, { up: 1.2 });
    ringFx(pt.x, pt.z, 1.2, color, 0.35);
  }
}
let thinRing = null;
const ringThin = () => thinRing || (thinRing = new THREE.RingGeometry(0.985, 1, 72).rotateX(-Math.PI / 2));

// ==================================================================
// 16. Chuva de Meteoros: entre no círculo; por 25s caem meteoros que deixam cristais. Pegue 12
// ==================================================================
const MET_COL = 0xff6a2a;
const GEM_COL = 0xffc23d;
const MET_R = 5;
const MET_NEED = 12;
const MET_TIME = 25;
let metGeo = null;
const meteor = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const ringMat = lightMat(MET_COL, 1.4);
    put(g, mats().ring, ringMat, 0, 0.03, 0, MET_R, 1, MET_R);
    put(g, mats().disc, flatMat(MET_COL, 0.07), 0, 0.02, 0, MET_R, 1, MET_R);
    put(g, mats().cyl, mats().dark, 0, 0.25, 0, 0.4, 0.5, 0.4);
    const core = put(g, mats().oct, glowMat(GEM_COL, 2.6), 0, 1.05, 0, 0.28, 0.42, 0.28);
    return { kind: 'meteor', x: s.x, z: s.z, g, ringMat, core, st: 'idle', t: MET_TIME, got: 0, rocks: [], gems: [], dropT: 0 };
  },
  clear(E) {
    for (const r of E.rocks) G.world.remove(r.m);
    for (const c of E.gems) G.world.remove(c.m);
    E.rocks = [];
    E.gems = [];
  },
  end(E) {
    meteor.clear(E);
    E.core.visible = false;
    setLight(E.ringMat, 0x333344, 0.3);
    if (E.got >= MET_NEED) complete(E, 2.2, L('CHUVA DE ESTRELAS!', 'STAR SHOWER!'), L(`Os ${MET_NEED} cristais foram pegos`, `All ${MET_NEED} crystals caught`), E.x, E.z, { extra: true });
    else if (E.got >= 4) complete(E, (1.6 * E.got) / MET_NEED, L('A CHUVA PASSOU', 'THE STORM IS OVER'), L(`${E.got}/${MET_NEED} cristais`, `${E.got}/${MET_NEED} crystals`), E.x, E.z);
    else failed(E, L('A chuva passou e quase nenhum cristal foi pego.', 'The storm is over and almost no crystals were caught.'));
  },
  update(E, dt) {
    if (E.st === 'done' || E.st === 'failed') return;
    const p = G.player;
    E.core.rotation.y += dt * (E.st === 'run' ? 6 : 1.2);
    if (E.st === 'idle') {
      if (!near(E, MET_R)) return;
      E.st = 'run';
      banner(L('CHUVA DE METEOROS!', 'METEOR SHOWER!'), L(`Desvie das sombras e pegue ${MET_NEED} cristais em ${MET_TIME}s`, `Dodge the shadows and grab ${MET_NEED} crystals in ${MET_TIME}s`));
      sfx.alarm();
      ringFx(E.x, E.z, MET_R, MET_COL, 0.6);
    }
    E.t -= dt;
    // meteoro novo: um em cada três mira no jogador
    E.dropT -= dt;
    if (E.dropT <= 0 && E.t > 1.2) {
      E.dropT = 0.4 + Math.random() * 0.25;
      const toP = Math.random() < 0.35 && near(E, MET_R + 2);
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (toP ? 1.2 : MET_R - 0.5);
        const x = (toP ? p.x : E.x) + Math.cos(a) * r;
        const z = (toP ? p.z : E.z) + Math.sin(a) * r;
        if (!isWalkable(G.dungeon, x, z)) continue;
        telegraphFx(x, z, 1.3, 1.1, MET_COL);
        if (!metGeo) metGeo = new THREE.IcosahedronGeometry(0.42, 0);
        E.rocks.push({ x, z, t: 1.1, m: put(G.world, metGeo, glowMat(MET_COL, 2.2), x + 3, 14, z - 3) });
        break;
      }
    }
    for (const r of E.rocks) {
      r.t -= dt;
      const k = Math.max(0, r.t / 1.1);
      r.m.position.set(r.x + 3 * k, 0.4 + 13.6 * k, r.z - 3 * k);
      r.m.rotation.x += dt * 8;
      if (Math.random() < dt * 25) burst(r.m.position.x, r.m.position.y, r.m.position.z, MET_COL, 1, 0.5, 0.12, 0.4, { grav: 0 });
      if (r.t > 0) continue;
      G.world.remove(r.m);
      explosion(r.x, r.z, 1.4, 1.2, { color: MET_COL, noProc: true, knock: 4, small: true });
      G.shake = Math.max(G.shake, 0.2);
      if (Math.hypot(p.x - r.x, p.z - r.z) < 1.3 + p.r) eventHurt(0.07, r.x, r.z, 9);
      // o cristal quica para longe da cratera: parado no lugar não dá para pegar
      let cx = r.x;
      let cz = r.z;
      for (let t = 0; t < 6; t++) {
        const a = Math.random() * Math.PI * 2;
        const l = 1.3 + Math.random() * 1.2;
        if (!isWalkable(G.dungeon, r.x + Math.cos(a) * l, r.z + Math.sin(a) * l)) continue;
        cx = r.x + Math.cos(a) * l;
        cz = r.z + Math.sin(a) * l;
        break;
      }
      E.gems.push({ x: cx, z: cz, life: 7, m: put(G.world, mats().oct, glowMat(GEM_COL, 2.6), cx, 0.45, cz, 0.17, 0.25, 0.17) });
    }
    E.rocks = E.rocks.filter((r) => r.t > 0);
    for (const c of E.gems) {
      c.life -= dt;
      c.m.rotation.y += dt * 3;
      c.m.position.y = 0.45 + Math.sin(G.t * 4 + c.x) * 0.08;
      if (c.life < 2) c.m.visible = Math.sin(G.t * 22) > 0;
      if (p.alive && Math.hypot(p.x - c.x, p.z - c.z) < 0.95) {
        c.life = 0;
        E.got++;
        sfx.pickup();
        burst(c.x, 0.6, c.z, GEM_COL, 12, 3, 0.06, 0.4, { up: 1.5 });
        floatText(c.x, 1.4, c.z, `${E.got}/${MET_NEED}`, 'up');
      }
      if (c.life <= 0) G.world.remove(c.m);
    }
    E.gems = E.gems.filter((c) => c.life > 0);
    if (E.got >= MET_NEED || E.t <= 0) meteor.end(E);
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'step in') : `${E.got}/${MET_NEED} · ${Math.ceil(Math.max(0, E.t))}s`),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done' && s.st !== 'failed') return;
    E.st = s.st;
    E.core.visible = false;
    setLight(E.ringMat, 0x333344, 0.3);
  },
  busy: (E) => E.st === 'run',
  intro: () => L(`entre no círculo laranja e meteoros vão cair por ${MET_TIME}s. Desvie das sombras no chão e pegue ${MET_NEED} cristais que eles deixam.`, `step into the orange circle and meteors will fall for ${MET_TIME}s. Dodge the shadows on the ground and grab ${MET_NEED} of the crystals they leave.`),
};

// ==================================================================
// 17. Cofre Rachado: o primeiro golpe abre 15s; cada golpe espirra créditos
// ==================================================================
const VAULT_COL = 0xffd23d;
const VAULT_T = 15;
const vault = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    g.rotation.y = Math.PI / 4; // porta para a câmera
    const gold = new THREE.MeshLambertMaterial({ color: 0xd8a63a, emissive: 0x3a2400 });
    put(g, box(1.3, 1.4, 1.1), gold, 0, 0.7, 0);
    put(g, box(1.38, 0.08, 1.18), mats().dark, 0, 1.43, 0);
    put(g, box(1.38, 0.08, 1.18), mats().dark, 0, 0.04, 0);
    const doorMat = lightMat(VAULT_COL, 1.3);
    // rachaduras brilhando nos lados
    put(g, box(0.03, 0.5, 0.02), doorMat, 0.66, 0.9, 0.2);
    put(g, box(0.03, 0.34, 0.02), doorMat, -0.66, 0.5, -0.2);
    put(g, box(0.02, 0.3, 0.4), doorMat, 0.66, 0.4, -0.1);
    // porta com dobradiça na esquerda
    const door = new THREE.Group();
    door.position.set(-0.52, 0, 0.57);
    g.add(door);
    put(door, box(1.04, 1.12, 0.06), mats().metal, 0.52, 0.72, 0);
    const dial = put(door, mats().cyl, glowMat(VAULT_COL, 2), 0.52, 0.76, 0.05, 0.22, 0.05, 0.22);
    dial.rotation.x = Math.PI / 2;
    put(door, box(0.5, 0.05, 0.03), doorMat, 0.52, 0.76, 0.07);
    const e = hitTarget(s.x, s.z, 0.8, 1.5, L('Cofre Rachado', 'Cracked Vault'));
    return { kind: 'vault', x: s.x, z: s.z, g, door, dial, doorMat, e, st: 'idle', t: VAULT_T, hits: 0, n: 0, per: 1 };
  },
  spray(E) {
    E.n++;
    for (let j = 0; j < 3; j++) spawnPickup('credits', E.x, E.z, { amount: E.per });
    burst(E.x, 1.3, E.z, VAULT_COL, 10, 5, 0.07, 0.5, { up: 1.5 });
    sfx.coin();
    if (E.n % 10 === 0) {
      floatText(E.x, 2.4, E.z, `x${E.n}!`, 'crit');
      ringFx(E.x, E.z, 2, VAULT_COL, 0.4);
    }
  },
  finish(E) {
    dropTarget(E);
    setLight(E.doorMat, 0x555566, 0.4);
    E.dial.visible = false;
    complete(E, 0.6, L('COFRE ESVAZIADO', 'VAULT EMPTIED'), L(`${E.n} golpes`, `${E.n} hits`), E.x, E.z);
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const k = hitsOf(E);
    if (E.st === 'idle') {
      if (!k) return;
      E.st = 'open';
      E.t = VAULT_T;
      // até 60 golpes em 15s; 3 moedas por golpe
      E.per = Math.max(1, Math.round(eventCredits(2.6) / 180));
      banner(L('COFRE ABERTO!', 'VAULT CRACKED!'), L(`Bata sem parar por ${VAULT_T}s: cada golpe espirra créditos`, `Keep hitting for ${VAULT_T}s: every blow sprays credits`));
      sfx.upgrade();
    }
    E.t -= dt;
    E.door.rotation.y = Math.max(-1.9, E.door.rotation.y - dt * 4);
    E.dial.rotation.y += dt * 9;
    for (let i = 0; i < k; i++) vault.spray(E);
    if (Math.random() < dt * 6) burst(E.x, 1, E.z, VAULT_COL, 1, 2, 0.06, 0.5, { up: 2 });
    if (E.t <= 0) vault.finish(E);
  },
  hud: (E) => (E.st === 'idle' ? L('bata no cofre', 'hit the vault') : `${E.n} · ${Math.ceil(Math.max(0, E.t))}s`),
  save: () => ({}),
  load(E, s) {
    if (s.st === 'done' || !E.e.alive) {
      E.st = 'done';
      dropTarget(E);
      setLight(E.doorMat, 0x555566, 0.4);
      E.dial.visible = false;
      E.door.rotation.y = -1.9;
      return;
    }
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L(`um cofre dourado está rachado. Bata nele: por ${VAULT_T}s cada golpe espirra créditos. Quanto mais rápido, mais dinheiro!`, `a golden vault is cracked. Hit it: for ${VAULT_T}s every blow sprays credits. The faster you hit, the more money!`),
};

// ==================================================================
// 18. Arena de Gladiadores: entre no anel; 3 ondas e um campeão elite
// ==================================================================
const AR_COL = 0xff3d6e;
const AR_R = 5;
const arena = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const ringMat = lightMat(AR_COL, 1.4);
    put(g, mats().ring, ringMat, 0, 0.03, 0, AR_R, 1, AR_R);
    put(g, ringThin(), ringMat, 0, 0.03, 0, AR_R - 0.45, 1, AR_R - 0.45);
    put(g, mats().disc, flatMat(AR_COL, 0.06), 0, 0.02, 0, AR_R, 1, AR_R);
    // colunas com chama nas diagonais
    const fires = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const x = Math.cos(a) * (AR_R - 0.2);
      const z = Math.sin(a) * (AR_R - 0.2);
      if (!isWalkable(d, s.x + x, s.z + z)) continue;
      put(g, mats().cyl, mats().metal, x, 0.6, z, 0.16, 1.2, 0.16);
      fires.push(put(g, mats().oct, glowMat(AR_COL, 2.6), x, 1.38, z, 0.16, 0.24, 0.16));
    }
    return { kind: 'arena', x: s.x, z: s.z, g, ringMat, fires, st: 'idle', wave: 0, gap: 0, foes: [] };
  },
  update(E, dt) {
    for (const f of E.fires) f.rotation.y += dt * 3;
    if (E.st === 'done') return;
    if (E.st === 'idle') {
      if (!near(E, AR_R - 0.6)) return;
      E.st = 'fight';
      E.wave = 0;
      E.gap = 1.4;
      E.foes = [];
      banner(L('ARENA DE GLADIADORES', 'GLADIATOR ARENA'), L('Vença 3 ondas e o campeão', 'Beat 3 waves and the champion'));
      sfx.roar();
      ringFx(E.x, E.z, AR_R, AR_COL, 0.6);
      return;
    }
    E.foes = E.foes.filter((e) => e.alive);
    if (E.foes.length) return;
    E.gap -= dt;
    if (E.gap > 0) return;
    if (E.wave >= 4) {
      setLight(E.ringMat, 0xffd23d, 1.6);
      complete(E, 2.4, L('CAMPEÃO DA ARENA!', 'ARENA CHAMPION!'), L('A multidão vai à loucura', 'The crowd goes wild'), E.x, E.z, { extra: true });
      return;
    }
    E.wave++;
    E.gap = 1.6;
    sfx.telegraph();
    if (E.wave <= 3) {
      spawnWave(E, Math.min(9, 2 + E.wave + Math.floor(G.floor / 6)), E.x, E.z, 1.5, AR_R - 0.7, AR_COL);
      floatText(E.x, 2.6, E.z, L(`ONDA ${E.wave}/3`, `WAVE ${E.wave}/3`), 'crit');
    } else {
      ambush(E, 1, E.x, E.z, 0.5, 2.5, AR_COL, { elite: true, hp: 2.2, name: L('Campeão da Arena', 'Arena Champion') });
      for (const e of E.foes) {
        e.xp *= 2;
        e.model.root.scale.multiplyScalar(1.15);
      }
      banner(L('O CAMPEÃO ENTRA!', 'THE CHAMPION ENTERS!'), L('Derrote o campeão da arena', 'Defeat the arena champion'));
      sfx.roar();
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre na arena', 'step in') : E.wave >= 4 ? L('campeão', 'champion') : L(`onda ${Math.max(1, E.wave)}/3`, `wave ${Math.max(1, E.wave)}/3`)),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    setLight(E.ringMat, 0xffd23d, 1.6);
  },
  busy: (E) => E.st === 'fight',
  intro: () => L('entre no anel da arena para lutar contra 3 ondas de inimigos e um campeão elite. Vença todos pelo prêmio.', 'step into the arena ring to fight 3 waves of enemies and an elite champion. Beat them all for the prize.'),
};

// ==================================================================
// 19. Caixa de Pandora: encoste para abrir: tesouro ou maldição (emboscada que dobra o prêmio)
// ==================================================================
const PAN_COL = 0xb44dff;
const pandora = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    g.rotation.y = Math.PI / 4;
    const boxM = new THREE.MeshLambertMaterial({ color: 0x2a1640 });
    const trim = glowMat(0xffd23d, 2);
    put(g, box(0.9, 0.6, 0.7), boxM, 0, 0.32, 0);
    put(g, box(0.94, 0.05, 0.74), trim, 0, 0.62, 0);
    for (const sx of [-0.3, 0.3]) put(g, box(0.06, 0.62, 0.74), trim, sx, 0.32, 0);
    const lid = new THREE.Group();
    lid.position.set(0, 0.66, 0);
    g.add(lid);
    put(lid, box(0.98, 0.16, 0.78), boxM, 0, 0.08, 0);
    put(lid, mats().oct, glowMat(PAN_COL, 2.6), 0, 0.32, 0, 0.12, 0.18, 0.12);
    const ringMat = lightMat(PAN_COL, 1.3);
    put(g, mats().ring, ringMat, 0, 0.03, 0, 1.3, 1, 1.3);
    return { kind: 'pandora', x: s.x, z: s.z, g, lid, ringMat, st: 'idle', foes: [], lidT: 0 };
  },
  open(E) {
    E.lidT = 1;
    burst(E.x, 1, E.z, PAN_COL, 40, 6, 0.09, 0.8, { up: 1.6 });
    G.shake = Math.max(G.shake, 0.3);
    if (Math.random() < 0.6) {
      for (let k = 0; k < 8; k++) spawnPickup('credits', E.x, E.z, { amount: Math.max(1, Math.round(eventCredits(0.1))) });
      complete(E, 1.6, L('TESOURO!', 'TREASURE!'), L('A caixa estava cheia de riquezas', 'The box was full of riches'), E.x, E.z, { extra: true });
      return;
    }
    E.st = 'curse';
    E.foes = [];
    setLight(E.ringMat, 0xff2244, 1.8);
    banner(L('MALDIÇÃO!', 'CURSED!'), L('Derrote a emboscada para dobrar o prêmio', 'Defeat the ambush to double the prize'));
    sfx.alarm();
    ambush(E, 2 + (G.floor >= 10 ? 1 : 0) + (G.floor >= 20 ? 1 : 0), E.x, E.z, 2, 4, PAN_COL, { elite: true });
  },
  update(E, dt) {
    if (E.lidT > 0) {
      E.lidT -= dt;
      E.lid.position.y += dt * 4;
      E.lid.rotation.z += dt * 6;
      if (E.lidT <= 0) E.lid.visible = false;
    }
    if (E.st === 'done') return;
    if (E.st === 'idle') {
      E.lid.position.y = 0.66 + Math.abs(Math.sin(G.t * 7)) * 0.04;
      if (Math.random() < dt * 4) burst(E.x, 0.9, E.z, PAN_COL, 1, 1, 0.05, 0.6, { grav: -3 });
      if (near(E, 1.3)) pandora.open(E);
      return;
    }
    E.foes = E.foes.filter((e) => e.alive);
    if (!E.foes.length) complete(E, 3, L('MALDIÇÃO QUEBRADA!', 'CURSE BROKEN!'), L('O prêmio dobrou', 'The prize doubled'), E.x, E.z, { extra: true });
  },
  hud: (E) => (E.st === 'idle' ? L('encoste para abrir', 'touch to open') : L(`${E.foes.length} amaldiçoados`, `${E.foes.length} cursed`)),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    E.lid.visible = false;
  },
  busy: (E) => E.st === 'curse',
  intro: () => L('uma caixa misteriosa. Encoste para abrir: pode ter um tesouro... ou uma maldição. Vencer a maldição dobra o prêmio.', 'a mysterious box. Touch it to open: it may hold treasure... or a curse. Beating the curse doubles the prize.'),
};

// ==================================================================
// 20. Jogo dos Baús: veja onde está o prêmio, acompanhe o embaralhamento e encoste no certo
// ==================================================================
const SH_COL = 0xffb84d;
const SH_GAP = 2.1;
const shell = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.2, 1.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const bodyM = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
    const chests = [];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Group();
      c.position.set((k - 1) * SH_GAP, 0, 0);
      put(c, box(0.8, 0.5, 0.56), bodyM, 0, 0.25, 0);
      put(c, box(0.84, 0.06, 0.6), glowMat(SH_COL, 1.6), 0, 0.48, 0);
      const lid = new THREE.Group();
      lid.position.set(0, 0.52, -0.28);
      c.add(lid);
      put(lid, box(0.82, 0.18, 0.58), bodyM, 0, 0.09, 0.29);
      put(lid, box(0.14, 0.12, 0.04), glowMat(SH_COL, 2.2), 0, 0.03, 0.6);
      const ring = lightMat(SH_COL, 0.7);
      put(c, mats().ring, ring, 0, 0.03, 0, 0.75, 1, 0.75);
      g.add(c);
      chests.push({ c, lid, ring });
    }
    const gem = put(g, mats().oct, glowMat(0x39ff88, 3), 0, 1.1, 0, 0.2, 0.3, 0.2);
    gem.visible = false;
    return { kind: 'shell', x: s.x, z: s.z, g, chests, gem, slot: [0, 1, 2], prize: 0, st: 'idle', t: 0, swaps: 0, sw: null, foes: [], block: -1 };
  },
  // posição (local) da vaga de cada baú
  sx: (i) => (i - 1) * SH_GAP,
  where(E, k) {
    return { x: E.x + E.chests[k].c.position.x, z: E.z + E.chests[k].c.position.z };
  },
  touching(E) {
    const p = G.player;
    if (!p.alive) return -1;
    for (let k = 0; k < 3; k++) {
      const w = shell.where(E, k);
      if (Math.hypot(p.x - w.x, p.z - w.z) < 0.95) return k;
    }
    return -1;
  },
  update(E, dt) {
    if (E.st === 'done') return;
    E.t += dt;
    if (E.st === 'idle') {
      if (!near(E, 4.5)) return;
      E.st = 'show';
      E.t = 0;
      E.prize = Math.floor(Math.random() * 3);
      E.swaps = 0;
      floatText(E.x, 2.4, E.z, L('OLHE BEM!', 'WATCH CLOSELY!'), 'info');
      sfx.seq();
    }
    const P = E.chests[E.prize];
    if (E.st === 'show') {
      P.lid.rotation.x = -Math.min(1.3, E.t * 4);
      E.gem.visible = true;
      E.gem.position.set(P.c.position.x, 0.8 + Math.min(0.5, E.t), 0);
      E.gem.rotation.y += dt * 3;
      if (E.t > 2) {
        E.st = 'close';
        E.t = 0;
      }
    } else if (E.st === 'close') {
      P.lid.rotation.x = -1.3 * Math.max(0, 1 - E.t * 3);
      E.gem.position.y = Math.max(0.3, 1.3 - E.t * 3);
      if (E.t > 0.5) {
        E.gem.visible = false;
        E.st = 'shuffle';
        E.t = 0;
        E.sw = null;
      }
    } else if (E.st === 'shuffle') {
      const total = Math.min(12, 6 + Math.floor(G.floor / 5));
      if (!E.sw) {
        if (E.swaps >= total) {
          E.st = 'pick';
          E.block = shell.touching(E);
          for (const c of E.chests) setLight(c.ring, SH_COL, 1.6);
          floatText(E.x, 2.4, E.z, L('ESCOLHA UM BAÚ!', 'PICK A CHEST!'), 'info');
          sfx.click();
          return;
        }
        const a = Math.floor(Math.random() * 3);
        const b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
        // ka/kb: baús que estão nas vagas a e b
        E.sw = { ka: E.slot.indexOf(a), kb: E.slot.indexOf(b), a, b, dur: Math.max(0.22, 0.6 - E.swaps * 0.04) };
        E.t = 0;
        sfx.dash();
      }
      const S = E.sw;
      const k = Math.min(1, E.t / S.dur);
      const ca = E.chests[S.ka].c;
      const cb = E.chests[S.kb].c;
      ca.position.set(shell.sx(S.a) + (shell.sx(S.b) - shell.sx(S.a)) * k, 0, Math.sin(k * Math.PI) * 0.9);
      cb.position.set(shell.sx(S.b) + (shell.sx(S.a) - shell.sx(S.b)) * k, 0, -Math.sin(k * Math.PI) * 0.9);
      if (k >= 1) {
        E.slot[S.ka] = S.b;
        E.slot[S.kb] = S.a;
        E.swaps++;
        E.sw = null;
      }
    } else if (E.st === 'pick') {
      const k = shell.touching(E);
      if (k !== E.block) E.block = -1;
      if (k < 0 || k === E.block) return;
      const c = E.chests[k];
      c.lid.rotation.x = -1.3;
      for (const o of E.chests) setLight(o.ring, 0x333344, 0.3);
      if (k === E.prize) {
        E.gem.visible = true;
        E.gem.position.set(c.c.position.x, 1.1, 0);
        const w = shell.where(E, k);
        complete(E, 2.4, L('ACERTOU!', 'YOU GOT IT!'), L('Olho de lince', 'Eagle eye'), w.x, w.z, { extra: true });
        return;
      }
      // errou: o certo se mostra e o escolhido era um mímico
      P.lid.rotation.x = -1.3;
      E.gem.visible = true;
      E.gem.position.set(P.c.position.x, 1.1, 0);
      const w = shell.where(E, k);
      c.c.visible = false;
      E.st = 'mimic';
      E.foes = [];
      ambush(E, 1, w.x, w.z, 0, 0.6, SH_COL, { elite: true, name: L('Mímico', 'Mimic') });
      banner(L('MÍMICO!', 'MIMIC!'), L('Era o baú errado... derrote-o', 'Wrong chest... defeat it'));
      sfx.roar();
    } else if (E.st === 'mimic') {
      E.foes = E.foes.filter((e) => e.alive);
      if (!E.foes.length) complete(E, 0.9, L('MÍMICO DERROTADO', 'MIMIC DEFEATED'), L('Prêmio de consolação', 'Consolation prize'), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue perto', 'get close') : E.st === 'pick' ? L('escolha um baú', 'pick a chest') : E.st === 'mimic' ? L('mímico!', 'mimic!') : L('olhe bem...', 'watch...')),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    for (const c of E.chests) c.lid.rotation.x = -1.3;
  },
  busy: (E) => E.st === 'mimic',
  intro: () => L('3 baús, um com prêmio. Chegue perto, veja onde ele está, acompanhe o embaralhamento e encoste no baú certo. O errado é um mímico!', '3 chests, one holds the prize. Get close, see where it is, follow the shuffle and touch the right chest. The wrong one is a mimic!'),
};

// ==================================================================
// 21. Duelo de Espelho: sua cópia sombria sai do espelho, com investidas e ondas de choque
// ==================================================================
const MIR_COL = 0xff2244;
const MIR_FRAME = 0x9a7bff;
const mirror = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    g.rotation.y = Math.PI / 4;
    for (const sx of [-0.78, 0.78]) put(g, box(0.12, 2.3, 0.14), mats().metal, sx, 1.15, 0);
    put(g, box(1.7, 0.12, 0.16), mats().metal, 0, 2.32, 0);
    put(g, box(1.7, 0.05, 0.05), glowMat(MIR_FRAME, 2.2), 0, 2.42, 0.02);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x2a1040, transparent: true, opacity: 0.8 });
    const glass = put(g, box(1.44, 2.12, 0.04), glassMat, 0, 1.15, 0);
    const ringMat = lightMat(MIR_FRAME, 1.3);
    put(g, mats().ring, ringMat, 0, 0.03, 0, 2.2, 1, 2.2);
    return { kind: 'mirror', x: s.x, z: s.z, g, glass, glassMat, ringMat, st: 'idle', e: null, dashT: 3, dash: null, wave: 0, low: 1 };
  },
  spawn(E) {
    const d = G.dungeon;
    const c = G.char;
    const m = makePlayerModel(c.cls, MIR_COL);
    for (const mt of m.mats) mt.color.multiplyScalar(0.28);
    m.kind = 'humanoid';
    const pt = freeAround(d, E.x, E.z, 1.2, 2) || { x: E.x, z: E.z };
    const e = spawnEnemy('bladeknight', pt.x, pt.z, { model: m });
    e.hp = e.maxHp = e.maxHp * 9;
    e.dmg *= 1.5;
    e.speed = 4;
    e.xp = Math.round(e.xp * 5);
    e.height = 1.7;
    e.name = L('Reflexo Sombrio', 'Dark Reflection');
    e.aggro = true;
    e.alerted = true;
    applyAnomalyToEnemy(e);
    E.e = e;
    E.st = 'fight';
    E.dashT = 3;
    E.wave = 0;
    E.low = 1;
    E.glassMat.opacity = 0.25;
    burst(pt.x, 1, pt.z, MIR_COL, 40, 6, 0.08, 0.7, { up: 1.4 });
    banner(L('DUELO DE ESPELHO', 'MIRROR DUEL'), L('Seu reflexo saiu do espelho!', 'Your reflection stepped out of the mirror!'));
    sfx.roar();
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const p = G.player;
    const d = G.dungeon;
    if (E.st === 'idle') {
      E.glassMat.color.setHSL(0.76, 0.6, 0.12 + Math.sin(G.t * 2) * 0.04);
      if (near(E, 5)) mirror.spawn(E);
      return;
    }
    const e = E.e;
    if (!e.alive) {
      E.glass.visible = false;
      complete(E, 3, L('REFLEXO DESTRUÍDO', 'REFLECTION SHATTERED'), L('Você venceu a si mesmo', 'You beat yourself'), e.x, e.z, { loot: { thief: true } });
      if (E.low >= 0.5) achMark('flags', 'evMirror');
      return;
    }
    if (p.alive) E.low = Math.min(E.low, p.hp / p.stats.maxHp);
    // onda de choque com metade e com um quarto da vida
    if ((E.wave === 0 && e.hp < e.maxHp * 0.5) || (E.wave === 1 && e.hp < e.maxHp * 0.25)) {
      E.wave++;
      telegraphFx(e.x, e.z, 4, 0.8, MIR_COL);
      floatText(e.x, e.height + 0.6, e.z, '!!', 'hurt');
      after(0.8, () => {
        if (!e.alive) return;
        enemyExplosion(e.x, e.z, 4, e.dmg * 1.4, MIR_COL);
        if (Math.hypot(p.x - e.x, p.z - e.z) < 4 + p.r) {
          const l = Math.hypot(p.x - e.x, p.z - e.z) || 1;
          p.kx = (p.kx || 0) + ((p.x - e.x) / l) * 12;
          p.kz = (p.kz || 0) + ((p.z - e.z) / l) * 12;
        }
        G.shake = Math.max(G.shake, 0.5);
        sfx.explode();
      });
    }
    // investida avisada no chão
    const D = E.dash;
    if (D) {
      D.t -= dt;
      if (D.go) {
        for (let s = 0; s < 3; s++) {
          const nx = e.x + D.dx * D.sp * (dt / 3);
          const nz = e.z + D.dz * D.sp * (dt / 3);
          if (!isWalkable(d, nx, nz)) {
            D.t = 0;
            break;
          }
          e.x = nx;
          e.z = nz;
        }
        if (Math.random() < dt * 20) burst(e.x, 1, e.z, MIR_COL, 3, 2, 0.08, 0.4);
        if (!D.hit && p.alive && Math.hypot(p.x - e.x, p.z - e.z) < e.r + p.r + 0.35) {
          D.hit = true;
          damagePlayer(e.dmg * 1.6);
          p.kx = (p.kx || 0) + D.dx * 10;
          p.kz = (p.kz || 0) + D.dz * 10;
        }
        if (D.t <= 0) {
          e.speed = D.speed;
          E.dash = null;
          E.dashT = (e.hp < e.maxHp * 0.5 ? 2.6 : 3.6) + Math.random() * 1.2;
        }
      } else if (D.t <= 0) {
        D.go = true;
        D.t = 0.32;
        sfx.dash();
      }
      return;
    }
    E.dashT -= dt;
    const dist = Math.hypot(p.x - e.x, p.z - e.z);
    if (E.dashT <= 0 && p.alive && e.stun <= 0 && dist > 2.5 && dist < 10 && lineOfSight(d, e.x, e.z, p.x, p.z)) {
      const dx = (p.x - e.x) / dist;
      const dz = (p.z - e.z) / dist;
      E.dash = { t: 0.6, dx, dz, sp: 26, speed: e.speed, go: false, hit: false };
      e.speed = 0;
      e.faceX = dx;
      e.faceZ = dz;
      for (let k = 1; k <= 7; k++) telegraphFx(e.x + dx * k * 1.2, e.z + dz * k * 1.2, 0.6, 0.6, MIR_COL);
      floatText(e.x, e.height + 0.6, e.z, '!', 'hurt');
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue perto do espelho', 'approach the mirror') : `${Math.max(1, Math.ceil((E.e.hp / E.e.maxHp) * 100))}%`),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    E.glass.visible = false;
  },
  busy: (E) => E.st === 'fight',
  intro: () => L('um espelho escuro. Chegue perto e seu reflexo sai para lutar: ele investe em linha reta (veja o aviso no chão) e solta ondas de choque quando está ferido.', 'a dark mirror. Get close and your reflection steps out to fight: it dashes in a straight line (watch the warning on the ground) and releases shockwaves when hurt.'),
};

// ==================================================================
// 22. Bola de Plasma: empurre (andando) ou chute (golpes) a bola até o gol; 3 gols em 75s
// ==================================================================
const BALL_COL = 0x00f0ff;
const GOAL_COL = 0x39ff88;
const BALL_R = 0.42;
const GOALS = 3;
const BALL_TIME = 75;
let ballGeo = null;
const ball = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.4);
    if (!s) return null;
    // gol: 6–10m do centro, à vista, com espaço em volta
    let goal = null;
    for (let t = 0; t < 30 && !goal; t++) {
      const a = rr(0, Math.PI * 2);
      const r = rr(6, 10);
      const gx = Math.floor(s.x + Math.cos(a) * r) + 0.5;
      const gz = Math.floor(s.z + Math.sin(a) * r) + 0.5;
      if (spotOk(d, gx, gz, 1.2, 1.2) && lineOfSight(d, s.x, s.z, gx, gz)) goal = { x: gx, z: gz };
    }
    if (!goal) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(BALL_COL, 1), 0, 0.03, 0, 0.8, 1, 0.8);
    const gg = groupAt(goal.x, goal.z);
    const goalMat = lightMat(GOAL_COL, 1.5);
    put(gg, mats().ring, goalMat, 0, 0.03, 0, 1.3, 1, 1.3);
    put(gg, mats().disc, flatMat(GOAL_COL, 0.14), 0, 0.02, 0, 1.3, 1, 1.3);
    gg.rotation.y = Math.atan2(s.x - goal.x, s.z - goal.z);
    for (const sx of [-1.3, 1.3]) put(gg, mats().cyl, mats().metal, sx, 0.8, 0, 0.07, 1.6, 0.07);
    put(gg, box(2.7, 0.08, 0.08), goalMat, 0, 1.62, 0);
    if (!ballGeo) ballGeo = new THREE.IcosahedronGeometry(BALL_R, 1);
    const bm = new THREE.Group();
    bm.add(new THREE.Mesh(ballGeo, glowMat(BALL_COL, 2.2)));
    const band = new THREE.Mesh(mats().ring, glowMat(0xffffff, 2));
    band.scale.setScalar(BALL_R * 1.08);
    band.rotation.x = Math.PI / 2;
    bm.add(band);
    bm.position.set(s.x, BALL_R + 0.05, s.z);
    G.world.add(bm);
    const e = hitTarget(s.x, s.z, BALL_R + 0.1, 0.9, L('Bola de Plasma', 'Plasma Ball'));
    return { kind: 'ball', x: s.x, z: s.z, g, gg, goalMat, gx: goal.x, gz: goal.z, pts: [goal], bx: s.x, bz: s.z, vx: 0, vz: 0, bm, e, st: 'idle', goals: 0, t: BALL_TIME, hits: 0, resetT: 0 };
  },
  kick(E, sp) {
    const p = G.player;
    const dx = E.bx - p.x;
    const dz = E.bz - p.z;
    const l = Math.hypot(dx, dz) || 1;
    E.vx = (dx / l) * sp;
    E.vz = (dz / l) * sp;
    ringFx(E.bx, E.bz, 0.9, BALL_COL, 0.25);
    sfx.punch();
    ball.start(E);
  },
  start(E) {
    if (E.st !== 'idle') return;
    E.st = 'play';
    banner(L('BOLA EM JOGO!', 'BALL IN PLAY!'), L(`Leve a bola ao anel verde: ${GOALS} gols em ${BALL_TIME}s`, `Get the ball into the green ring: ${GOALS} goals in ${BALL_TIME}s`));
  },
  end(E) {
    dropTarget(E);
    G.world.remove(E.bm);
    setLight(E.goalMat, 0x333344, 0.3);
  },
  update(E, dt) {
    if (E.st === 'done' || E.st === 'failed') return;
    const p = G.player;
    const d = G.dungeon;
    if (E.st === 'play') {
      E.t -= dt;
      if (E.t <= 0) {
        ball.end(E);
        if (E.goals) complete(E, 0.6 * E.goals, L('FIM DE JOGO', 'FULL TIME'), L(`${E.goals} gol(s)`, `${E.goals} goal(s)`), E.gx, E.gz);
        else failed(E, L('O tempo acabou sem gol.', 'Time ran out without a goal.'));
        return;
      }
    }
    if (E.resetT > 0) {
      E.resetT -= dt;
      hitsOf(E);
      if (E.resetT > 0) return;
      E.bx = E.x;
      E.bz = E.z;
      E.vx = E.vz = 0;
      E.bm.visible = true;
      ringFx(E.x, E.z, 1.2, BALL_COL, 0.4);
    }
    // golpes chutam a bola; andando nela você empurra
    if (hitsOf(E)) ball.kick(E, 13);
    const dist = Math.hypot(E.bx - p.x, E.bz - p.z);
    if (p.alive && dist < p.r + BALL_R + 0.08) {
      const nx = (E.bx - p.x) / (dist || 1);
      const nz = (E.bz - p.z) / (dist || 1);
      const sp = Math.max(Math.hypot(E.vx, E.vz), Math.hypot(p.ivx || 0, p.ivz || 0) * 1.6, 4);
      E.vx = nx * sp;
      E.vz = nz * sp;
      const ox = p.x + nx * (p.r + BALL_R + 0.1);
      const oz = p.z + nz * (p.r + BALL_R + 0.1);
      if (isWalkable(d, ox, oz)) {
        E.bx = ox;
        E.bz = oz;
      }
      ball.start(E);
    }
    const sp = Math.hypot(E.vx, E.vz);
    if (sp > 0.05) {
      // quica nas paredes
      const nx = E.bx + E.vx * dt;
      if (!isWalkable(d, nx + Math.sign(E.vx) * BALL_R, E.bz)) E.vx = -E.vx * 0.8;
      else E.bx = nx;
      const nz = E.bz + E.vz * dt;
      if (!isWalkable(d, E.bx, nz + Math.sign(E.vz) * BALL_R)) E.vz = -E.vz * 0.8;
      else E.bz = nz;
      const f = Math.exp(-dt * 1.1);
      E.vx *= f;
      E.vz *= f;
      E.bm.rotation.x += (E.vz * dt) / BALL_R;
      E.bm.rotation.z -= (E.vx * dt) / BALL_R;
      // atropela inimigos no caminho
      if (sp > 4) {
        for (const o of enemiesInRadius(E.bx, E.bz, BALL_R + 0.3)) {
          if (o === E.e || o.inert || (o.ballT || 0) > G.t) continue;
          o.ballT = G.t + 0.5;
          hitEnemy(o, 1 + sp * 0.12, { knock: 6, kx: E.bx, kz: E.bz, noProc: true });
        }
      }
      if (Math.random() < dt * sp * 2) burst(E.bx, BALL_R, E.bz, BALL_COL, 1, 1, 0.06, 0.4, { grav: -1 });
    }
    if (!isWalkable(d, E.bx, E.bz)) {
      E.bx = E.x;
      E.bz = E.z;
      E.vx = E.vz = 0;
    }
    E.e.x = E.bx;
    E.e.z = E.bz;
    E.bm.position.set(E.bx, BALL_R + 0.05, E.bz);
    // gol!
    if (E.st === 'play' && Math.hypot(E.bx - E.gx, E.bz - E.gz) < 1.25) {
      E.goals++;
      for (const c of [GOAL_COL, BALL_COL, 0xffd23d]) burst(E.gx, 1.2, E.gz, c, 25, 7, 0.08, 0.9, { up: 1.8 });
      ringFx(E.gx, E.gz, 3, GOAL_COL, 0.6);
      sfx.upgrade();
      if (E.goals >= GOALS) {
        ball.end(E);
        complete(E, 2.2, L('HAT-TRICK!', 'HAT TRICK!'), L(`${GOALS} gols com ${Math.ceil(E.t)}s de sobra`, `${GOALS} goals with ${Math.ceil(E.t)}s to spare`), E.gx, E.gz);
        return;
      }
      banner(L(`GOL! ${E.goals}/${GOALS}`, `GOAL! ${E.goals}/${GOALS}`), L('A bola volta para o centro', 'The ball goes back to the center'));
      E.bm.visible = false;
      E.vx = E.vz = 0;
      E.resetT = 1.2;
    }
  },
  hud: (E) => (E.st === 'idle' ? L('empurre a bola', 'push the ball') : `${E.goals}/${GOALS} · ${Math.ceil(Math.max(0, E.t))}s`),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done' && s.st !== 'failed' && E.e.alive) {
      E.e.hp = E.e.maxHp;
      return;
    }
    E.st = s.st === 'failed' ? 'failed' : 'done';
    ball.end(E);
  },
  intro: () => L(`empurre a bola de plasma andando nela (golpes chutam) até o anel verde. Faça ${GOALS} gols em ${BALL_TIME}s; ela atropela inimigos no caminho.`, `push the plasma ball by walking into it (attacks kick it) into the green ring. Score ${GOALS} goals in ${BALL_TIME}s; it runs over enemies on the way.`),
};

// ==================================================================
// 23. Olho Vigia: ande no verde, pare no vermelho; mexer no vermelho dá choque e empurra para trás
// ==================================================================
const WAT_R = 11;
const WAT_COL = { green: 0x39ff88, yellow: 0xffd23d, red: 0xff2244 };
const watcher = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1.4);
    if (!s) return null;
    // precisa de caminho: chão andável em volta, longe do olho
    let ok = 0;
    for (let k = 0; k < 16; k++) if (isWalkable(d, s.x + Math.cos((k / 16) * Math.PI * 2) * 8, s.z + Math.sin((k / 16) * Math.PI * 2) * 8)) ok++;
    if (ok < 3) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().metal, 0, 0.9, 0, 0.22, 1.8, 0.22);
    put(g, mats().cyl, mats().dark, 0, 0.1, 0, 0.6, 0.2, 0.6);
    const eye = new THREE.Group();
    eye.position.y = 2.4;
    g.add(eye);
    put(eye, new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshLambertMaterial({ color: 0xe8e4f0 }), 0, 0, 0);
    const irisMat = lightMat(WAT_COL.green, 1.6);
    put(eye, mats().disc, irisMat, 0, 0, 0.6, 0.32, 1, 0.32).rotation.x = Math.PI / 2;
    put(eye, mats().disc, new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0, 0.615, 0.14, 1, 0.14).rotation.x = Math.PI / 2;
    const lineMat = lightMat(WAT_COL.green, 0.9);
    put(g, ringThin(), lineMat, 0, 0.03, 0, WAT_R, 1, WAT_R);
    put(g, mats().ring, lineMat, 0, 0.03, 0, 1.8, 1, 1.8);
    return { kind: 'watcher', x: s.x, z: s.z, introR: WAT_R + 3, g, eye, irisMat, lineMat, st: 'idle', light: 'green', lt: 0, grace: 0, zapCd: 0, zaps: 0, px: 0, pz: 0 };
  },
  setLightTo(E, l) {
    E.light = l;
    setLight(E.irisMat, WAT_COL[l], l === 'red' ? 2.6 : 1.8);
    setLight(E.lineMat, WAT_COL[l], 1.1);
    if (l === 'green') {
      E.lt = 1.6 + Math.random() * 1.8;
      floatText(E.x, 3.4, E.z, L('ANDE!', 'GO!'), 'up');
    } else if (l === 'yellow') {
      E.lt = 0.8;
      sfx.telegraph();
    } else {
      E.lt = 1.4 + Math.random() * 1.2;
      E.grace = 0.25;
      floatText(E.x, 3.4, E.z, L('PARE!', 'FREEZE!'), 'hurt');
      sfx.alarm();
    }
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const p = G.player;
    const dist = Math.hypot(p.x - E.x, p.z - E.z);
    // o olho segue o jogador no amarelo/vermelho e olha para longe no verde
    if (E.st === 'idle') E.eye.rotation.y += dt * 0.6;
    else {
      const look = Math.atan2(p.x - E.x, p.z - E.z) + (E.light === 'green' ? Math.PI : 0);
      const da = ((((look - E.eye.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      E.eye.rotation.y += Math.max(-dt * 5, Math.min(dt * 5, da));
    }
    if (E.st === 'idle') {
      if (!p.alive || dist > WAT_R) return;
      E.st = 'play';
      E.zaps = 0;
      E.px = p.x;
      E.pz = p.z;
      watcher.setLightTo(E, 'green');
      banner(L('OLHO VIGIA', "WATCHER'S EYE"), L('Ande no verde, PARE no vermelho e encoste no olho', 'Move on green, FREEZE on red and touch the eye'));
      return;
    }
    const moved = Math.hypot(p.x - E.px, p.z - E.pz);
    E.px = p.x;
    E.pz = p.z;
    if (dist > WAT_R + 4) {
      E.st = 'idle';
      setLight(E.lineMat, WAT_COL.green, 0.9);
      setLight(E.irisMat, WAT_COL.green, 1.6);
      toast(L('👁️ Você saiu do anel do Olho Vigia: entre de novo para recomeçar.', "👁️ You left the Watcher's ring: step back in to start over."), 'warn', 'ev');
      return;
    }
    if (dist < 1.9) {
      setLight(E.irisMat, 0x333344, 0.4);
      setLight(E.lineMat, 0x333344, 0.3);
      complete(E, 1.9, L('VOCÊ CHEGOU!', 'YOU MADE IT!'), E.zaps ? L(`${E.zaps} choque(s)`, `${E.zaps} zap(s)`) : L('Sem levar nenhum choque!', 'Without a single zap!'), E.x, E.z);
      return;
    }
    E.lt -= dt;
    E.zapCd -= dt;
    if (E.lt <= 0) watcher.setLightTo(E, E.light === 'green' ? 'yellow' : E.light === 'yellow' ? 'red' : 'green');
    if (E.light !== 'red') return;
    E.grace -= dt;
    // mexeu no vermelho (andar ou teleportar; empurrão de golpe não conta)
    if (E.grace > 0 || E.zapCd > 0 || !p.alive || !(p.moving || moved > 0.5)) return;
    E.zapCd = 1;
    E.zaps++;
    beamFx(E.x, 2.4, E.z, p.x, 1, p.z, WAT_COL.red, 0.3, 8);
    sfx.zap();
    eventHurt(0.06, E.x, E.z, 22);
    floatText(p.x, 2.4, p.z, L('TE VI!', 'GOTCHA!'), 'hurt');
  },
  hud: (E) => (E.st === 'idle' ? L('entre no anel', 'step in') : E.light === 'green' ? L('🟢 ande', '🟢 go') : E.light === 'yellow' ? L('🟡 atenção', '🟡 careful') : L('🔴 pare!', '🔴 freeze!')),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    setLight(E.irisMat, 0x333344, 0.4);
    setLight(E.lineMat, 0x333344, 0.3);
  },
  intro: () => L('um olho gigante vigia o anel. Ande enquanto ele está verde e PARE quando ficar vermelho (amarelo avisa); se você se mexer no vermelho, leva choque e é empurrado. Encoste no olho para vencer.', "a giant eye watches the ring. Move while it is green and FREEZE when it turns red (yellow warns you); move on red and you get zapped and pushed back. Touch the eye to win."),
};

// ==================================================================
// 24. Corrida Fantasma: pise na largada; depois do 3-2-1, chegue antes do corredor fantasma
// ==================================================================
const RACE_COL = 0x7affc8;
const race = {
  setup(d, floor, rooms) {
    const a = findSpot(d, rooms, 1.2);
    if (!a) return null;
    let b = null;
    let path = null;
    for (let t = 0; t < 4 && !b; t++) {
      const s = findSpot(d, rooms, 1.2, 1.2, [{ x: a.x, z: a.z, r: 14 }]);
      if (!s) break;
      const pth = findPath(d, a.x, a.z, s.x, s.z, 6000);
      if (!pth) continue;
      let len = 0;
      let px = a.x;
      let pz = a.z;
      for (const q of pth) {
        len += Math.hypot(q.x - px, q.z - pz);
        px = q.x;
        pz = q.z;
      }
      if (len < 16 || len > 55) continue;
      b = s;
      path = pth;
    }
    if (!b) return null;
    const padMat = lightMat(RACE_COL, 1.4);
    const ga = groupAt(a.x, a.z);
    put(ga, mats().ring, padMat, 0, 0.03, 0, 1.2, 1, 1.2);
    put(ga, mats().disc, flatMat(RACE_COL, 0.18), 0, 0.02, 0, 1.2, 1, 1.2);
    const gb = groupAt(b.x, b.z);
    const finMat = lightMat(0xffffff, 1.2);
    put(gb, mats().ring, finMat, 0, 0.03, 0, 1.4, 1, 1.4);
    for (const sx of [-1.3, 1.3]) put(gb, mats().cyl, mats().metal, sx, 1, 0, 0.07, 2, 0.07);
    // faixa xadrez da chegada
    for (let k = 0; k < 6; k++) put(gb, box(0.43, 0.3, 0.05), k % 2 ? finMat : mats().dark, -1.08 + k * 0.43, 1.85, 0);
    gb.rotation.y = Math.PI / 4;
    const ghost = makePlayerModel(pick(CLASS_ORDER), RACE_COL);
    const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(RACE_COL).multiplyScalar(gk(1.1)), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    ghost.root.traverse((o) => o.isMesh && (o.material = gm));
    ghost.root.position.set(a.x + 0.8, 0, a.z);
    G.world.add(ghost.root);
    return { kind: 'race', x: a.x, z: a.z, fx: b.x, fz: b.z, pts: [{ x: b.x, z: b.z }], ga, gb, padMat, finMat, path, ghost, st: 'idle', t: 0, gi: 0, gxp: a.x + 0.8, gzp: a.z, phase: 0, beep: -1, losses: 0 };
  },
  reset(E) {
    E.st = 'idle';
    E.gi = 0;
    E.gxp = E.x + 0.8;
    E.gzp = E.z;
    E.ghost.root.position.set(E.gxp, 0, E.gzp);
    setLight(E.padMat, RACE_COL, 1.4);
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const p = G.player;
    const m = E.ghost;
    if (E.st === 'idle') {
      m.root.rotation.y += dt;
      animWalk(m, 0, false);
      if (!near(E, 1.2)) return;
      E.st = 'count';
      E.t = 3;
      E.beep = 4;
      m.root.position.set(E.x + 0.8, 0, E.z);
      m.root.rotation.y = Math.atan2(E.path[0].x - E.x, E.path[0].z - E.z);
      return;
    }
    if (E.st === 'count') {
      E.t -= dt;
      const n = Math.ceil(E.t);
      if (n !== E.beep && n > 0) {
        E.beep = n;
        floatText(E.x, 2.6, E.z, `${n}`, 'crit');
        sfx.click();
      }
      if (E.t > 0) return;
      E.st = 'run';
      E.t = 0;
      E.speed = p.stats.speed * 0.86;
      floatText(E.x, 2.6, E.z, L('JÁ!', 'GO!'), 'up');
      setLight(E.padMat, 0x333344, 0.4);
      sfx.deploy();
      return;
    }
    // corrida
    E.t += dt;
    let step = E.speed * dt;
    while (step > 0 && E.gi < E.path.length) {
      const q = E.path[E.gi];
      const dx = q.x - E.gxp;
      const dz = q.z - E.gzp;
      const l = Math.hypot(dx, dz);
      if (l <= step) {
        E.gxp = q.x;
        E.gzp = q.z;
        step -= l;
        E.gi++;
      } else {
        E.gxp += (dx / l) * step;
        E.gzp += (dz / l) * step;
        m.root.rotation.y = Math.atan2(dx, dz);
        step = 0;
      }
    }
    E.phase += dt * E.speed * 2.6;
    animWalk(m, E.phase, true);
    m.root.position.set(E.gxp, 0, E.gzp);
    if (Math.random() < dt * 12) burst(E.gxp, 0.8, E.gzp, RACE_COL, 1, 1, 0.06, 0.5, { grav: -1 });
    if (p.alive && Math.hypot(p.x - E.fx, p.z - E.fz) < 1.5) {
      G.world.remove(m.root);
      complete(E, 2.1, L('VITÓRIA NA CORRIDA!', 'RACE WON!'), L(`${E.t.toFixed(1)}s`, `${E.t.toFixed(1)}s`), E.fx, E.fz);
      return;
    }
    if (E.gi >= E.path.length) {
      E.losses++;
      burst(E.fx, 1, E.fz, RACE_COL, 30, 5, 0.08, 0.6, { up: 1.4 });
      sfx.deny();
      toast(L('👻 O fantasma chegou primeiro! Volte à largada para a revanche.', '👻 The ghost got there first! Go back to the start for a rematch.'), 'warn', 'ev');
      race.reset(E);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('vá à largada', 'go to the start') : E.st === 'count' ? `${Math.ceil(E.t)}...` : `${E.t.toFixed(0)}s`),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    G.world.remove(E.ghost.root);
    setLight(E.padMat, 0x333344, 0.4);
  },
  intro: () => L('pise na largada verde e, depois do 3-2-1, chegue na linha de chegada antes do corredor fantasma (o Teleporte vale!).', 'step on the green start pad and, after the 3-2-1, reach the finish line before the ghost runner (Teleport counts!).'),
};

// ==================================================================
// 25. Laser Giratório: feixes giram em volta do centro; chegue lá e fique 2s
// ==================================================================
const SPIN_COL = 0xff2244;
const SPIN_R = 4.6;
const SPIN_IN = 1.35;
const SPIN_HOLD = 2;
const spinner = {
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.5);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(SPIN_COL, 1), 0, 0.03, 0, SPIN_R, 1, SPIN_R);
    const padMat = lightMat(0x39ff88, 1.3);
    put(g, mats().ring, padMat, 0, 0.035, 0, 1, 1, 1);
    const fill = put(g, mats().disc, flatMat(0x39ff88, 0.3), 0, 0.03, 0, 0.001, 1, 0.001);
    const rot = new THREE.Group();
    rot.position.y = 0.6;
    g.add(rot);
    const n = floor >= 12 ? 3 : 2;
    const beamMat = lightMat(SPIN_COL, 3);
    for (let k = 0; k < n; k++) {
      const arm = new THREE.Group();
      arm.rotation.y = (k / n) * Math.PI * 2;
      rot.add(arm);
      put(arm, box(SPIN_R - SPIN_IN, 0.1, 0.1), beamMat, (SPIN_R + SPIN_IN) / 2, 0, 0);
      put(arm, box(0.24, 0.5, 0.24), mats().metal, SPIN_R, -0.35, 0);
      put(arm, box(0.24, 0.3, 0.24), mats().metal, SPIN_IN, -0.45, 0);
    }
    return { kind: 'spinner', x: s.x, z: s.z, g, rot, n, beamMat, padMat, fill, st: 'idle', w: Math.min(1.6, 1.1 + floor * 0.015), dir: 1, flipT: rr(5, 8), hold: 0, hitCd: 0, hits: 0 };
  },
  update(E, dt) {
    if (E.st === 'done') return;
    const p = G.player;
    // de vez em quando inverte o giro (pisca branco antes)
    E.flipT -= dt;
    if (E.flipT <= 0) {
      E.dir = -E.dir;
      E.flipT = 5 + Math.random() * 3;
      setLight(E.beamMat, SPIN_COL, 3);
    } else if (E.flipT < 0.6) setLight(E.beamMat, Math.sin(G.t * 30) > 0 ? 0xffffff : SPIN_COL, 3);
    E.rot.rotation.y += E.dir * E.w * dt;
    if (E.st === 'idle') {
      if (!near(E, SPIN_R + 1)) return;
      E.st = 'run';
    }
    E.hitCd -= dt;
    if (p.alive && E.hitCd <= 0) {
      for (let k = 0; k < E.n; k++) {
        const a = E.rot.rotation.y + (k / E.n) * Math.PI * 2;
        const cx = Math.cos(a);
        const cz = -Math.sin(a);
        if (segDist(p.x, p.z, E.x + cx * SPIN_IN, E.z + cz * SPIN_IN, E.x + cx * SPIN_R, E.z + cz * SPIN_R) > p.r + 0.12) continue;
        if (!eventHurt(0.07, E.x, E.z, 14)) break;
        E.hitCd = 0.8;
        E.hits++;
        burst(p.x, 1, p.z, SPIN_COL, 14, 4, 0.06, 0.4);
        sfx.zap();
        break;
      }
    }
    const on = near(E, 1);
    E.hold = on ? E.hold + dt : Math.max(0, E.hold - dt * 2);
    const k = Math.min(1, E.hold / SPIN_HOLD);
    E.fill.scale.set(Math.max(0.001, k), 1, Math.max(0.001, k));
    if (on && Math.random() < dt * 10) burst(E.x, 0.9, E.z, 0x39ff88, 1, 1.5, 0.05, 0.4, { up: 1 });
    if (E.hold < SPIN_HOLD) return;
    E.rot.visible = false;
    complete(E, 1.7, L('NO OLHO DO FURACÃO', 'IN THE EYE OF THE STORM'), E.hits ? L(`${E.hits} queimadura(s)`, `${E.hits} burn(s)`) : L('Sem encostar em nenhum feixe!', 'Without touching a single beam!'), E.x, E.z);
  },
  hud: (E) => (E.hold > 0 ? `${Math.floor((E.hold / SPIN_HOLD) * 100)}%` : L('chegue ao centro', 'reach the center')),
  save: () => ({}),
  load(E, s) {
    if (s.st !== 'done') return;
    E.st = 'done';
    E.rot.visible = false;
  },
  intro: () => L(`feixes de laser giram em volta de um centro verde (às vezes invertem: piscam branco antes). Chegue ao centro e fique ${SPIN_HOLD}s; encostar num feixe queima e empurra.`, `laser beams spin around a green center (sometimes they reverse: they flash white first). Reach the center and stay ${SPIN_HOLD}s; touching a beam burns and pushes you.`),
};

// ------------------------------------------------------------------
// Ganchos chamados pelo resto do jogo
// ------------------------------------------------------------------
const KIND = { terminals, lights, prisms, upload, bomb, wanted, shards, prisoner, relay, signal, servers, escort, pairs, meteor, vault, arena, pandora, shell, mirror, ball, watcher, race, spinner, secret, gamble };

// Andar novo (etapa 5, com a semente do andar): sorteia os eventos principais (3 no começo, 4 do andar 4,
// 5 do andar 8, e às vezes um a mais) e o pequeno
export function setupEvents(d, floor, boss, rooms) {
  if (!G.events) G.events = [];
  const forced = forcedMain;
  forcedMain = undefined;
  if (floor < 2 || isFinalFloor(floor)) return;
  const free = rooms.filter((r) => !r.safe);
  // sempre gasta os mesmos sorteios (continuar o andar refaz igual)
  const roll = chance(floor < 4 ? 0.55 : 0.7);
  const fresh = MAIN_EVENTS.filter((k) => !lastMain.includes(k));
  const first = pick(fresh);
  const second = pick(fresh.filter((k) => k !== first));
  const base = floor < 4 ? 3 : floor < 8 ? 4 : 5;
  const want = boss || !free.length ? 0 : Math.min(base + (roll && floor >= 4 ? 1 : 0), Math.max(1, free.length));
  // cada tentativa começa do mesmo ponto da semente: se uma não couber, a próxima sai igual ao continuar
  // embaralha a lista inteira (mesmo número de sorteios com ou sem andar salvo)
  const rest = shuffle(MAIN_EVENTS.slice()).filter((k) => k !== first && k !== second && fresh.includes(k));
  const order = forced !== undefined ? forced : [first, second, ...rest];
  const got = [];
  for (const k of order) {
    if (forced === undefined && got.length >= want) break;
    const E = isolateRandom(() => KIND[k].setup(d, floor, free));
    if (!E) continue;
    G.events.push(E);
    got.push(k);
  }
  if (forced === undefined) lastMain = got;
  // pequeno: Sala Secreta (já escavada) ou Máquina de Apostas
  if (d.secret) {
    const E = secret.setup(d);
    if (E) G.events.push(E);
  } else if (chance(0.3)) {
    const E = gamble.setup(d, floor, free.length ? free : rooms);
    if (E) G.events.push(E);
  }
}

export function updateEvents(dt) {
  if (!G.events || !G.events.length || !G.player) return;
  const p = G.player;
  for (const E of G.events) {
    KIND[E.kind].update(E, dt);
    // explicação de cada evento quando o jogador chega perto
    if (!E.told && E.x != null && KIND[E.kind].intro && E.st !== 'done' && E.st !== 'failed' && p.alive && Math.hypot(p.x - E.x, p.z - E.z) < Math.max(9, E.introR || 0)) {
      E.told = true;
      toast(introHtml(E), 'leg');
    }
  }
}
const introHtml = (E) => {
  const I = EVENT_INFO[E.kind];
  return `${I.icon} <b style="color:${I.css}">${I.name}</b>: ${KIND[E.kind].intro(E)}`;
};

// inimigo derrotado pelo jogador
export function eventKill(e) {
  if (!(e.wanted || e.server) || !G.events) return;
  for (const E of G.events) if (KIND[E.kind].kill) KIND[E.kind].kill(E, e);
}

// evento que ainda manda ondas: o andar só conta como limpo depois
export const eventsBusy = () => (G.events || []).some((E) => KIND[E.kind].busy && KIND[E.kind].busy(E));

// avisos do começo do andar (em sequência com os outros avisos); devolve o próximo horário livre
// um resumo com todos os eventos; a explicação de cada um aparece quando o jogador chega perto
// (os que não têm lugar fixo, como a bomba e o procurado, são explicados logo no começo)
export function announceEvents(floor, t) {
  const list = (G.events || []).filter((E) => KIND[E.kind].intro && E.st !== 'done' && E.st !== 'failed');
  if (!list.length) return t;
  const names = list.map((E) => `<span style="color:${EVENT_INFO[E.kind].css}">${EVENT_INFO[E.kind].icon} ${EVENT_INFO[E.kind].short || EVENT_INFO[E.kind].name}</span>`).join(' · ');
  setTimeout(() => G.floor === floor && toast(`🎪 <b>${L(`${list.length} eventos neste andar`, `${list.length} events on this floor`)}</b> (${L('marcados no mapa', 'marked on the map')}):<br>${names}`, 'leg'), t);
  t += 4300;
  for (const E of list) {
    if (E.x != null && E.kind !== 'signal') continue;
    E.told = true;
    const html = introHtml(E);
    setTimeout(() => G.floor === floor && G.events.includes(E) && E.st !== 'done' && E.st !== 'failed' && toast(html, 'leg'), t);
    // a bomba só começa a contar depois do aviso
    if (E.kind === 'bomb') E.delay = t / 1000 + 4;
    t += 4300;
  }
  return t;
}

// linhas do HUD (abaixo do contrato)
// (os já terminados ficam juntos numa linha só de ícones)
export function eventsHud() {
  let h = '';
  let fin = '';
  for (const E of G.events || []) {
    const K = KIND[E.kind];
    if (!K.hud) continue;
    const I = EVENT_INFO[E.kind];
    if (E.st === 'done' || E.st === 'failed') {
      fin += `<span class="${E.st === 'done' ? 'ok' : 'ko'}">${I.icon}</span>`;
      continue;
    }
    h += `<div class="ri-con ri-ev" style="--c:${I.css}">${I.icon}<span class="ri-nm"> ${I.short || I.name} ·</span><b> ${K.hud(E)}</b></div>`;
  }
  if (fin) h += `<div class="ri-con ri-evfin">${fin}</div>`;
  return h;
}

// retrato do andar (save) e volta
export function eventsSnapshot() {
  return (G.events || []).map((E) => ({ k: E.kind, st: E.st, ...KIND[E.kind].save(E) }));
}
export function eventsRestore(list) {
  if (!Array.isArray(list)) return;
  list.forEach((s, i) => {
    const E = G.events[i];
    if (E && s && E.kind === s.k) KIND[E.kind].load(E, s);
  });
}

// ------------------------------------------------------------------
// Minimapa: marcas dos eventos e setas na borda
// ------------------------------------------------------------------
function diamond(ctx, x, z, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, z - r);
  ctx.lineTo(x + r, z);
  ctx.lineTo(x, z + r);
  ctx.lineTo(x - r, z);
  ctx.fill();
}
export function drawEventMarks(ctx, d) {
  for (const E of G.events || []) {
    if (E.st === 'done' || E.st === 'failed') continue;
    const I = EVENT_INFO[E.kind];
    const pulse = 1 + Math.sin(G.t * 5) * 0.2;
    if (E.kind === 'bomb') {
      for (const c of E.cons) if (!c.off) diamond(ctx, c.x, c.z, 1.2 * pulse, I.css);
    } else if (E.kind === 'shards') {
      for (const s of E.list) if (!s.got) diamond(ctx, s.x, s.z, 0.9 * pulse, I.css);
    } else if (E.kind === 'wanted') {
      const e = E.e;
      if (!e.alive) continue;
      ctx.strokeStyle = I.css;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(e.x, e.z, 2.2 * pulse, 0, Math.PI * 2);
      ctx.moveTo(e.x - 3, e.z);
      ctx.lineTo(e.x + 3, e.z);
      ctx.moveTo(e.x, e.z - 3);
      ctx.lineTo(e.x, e.z + 3);
      ctx.stroke();
    } else if (E.kind === 'relay') {
      const g = E.list[E.idx];
      if (!g) continue;
      ctx.strokeStyle = I.css;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(g.x, g.z, 1.8 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      diamond(ctx, g.x, g.z, 1, I.css);
    } else if (E.kind === 'signal') {
      // só a área aproximada
      ctx.strokeStyle = I.css;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([1.5, 1.2]);
      ctx.beginPath();
      ctx.arc(E.cx, E.cz, SIG_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (E.kind === 'servers') {
      for (const s of E.list) if (s.e.alive) diamond(ctx, s.x, s.z, 1.2 * pulse, I.css);
    } else if (E.kind === 'escort') {
      diamond(ctx, E.x, E.z, 1.1, I.css);
      ctx.strokeStyle = I.css;
      ctx.lineWidth = 0.7;
      ctx.strokeRect(E.tx - 1.6 * pulse, E.tz - 1.6 * pulse, 3.2 * pulse, 3.2 * pulse);
    } else if (E.kind === 'ball') {
      diamond(ctx, E.bx, E.bz, 0.8, I.css);
      ctx.strokeStyle = '#39ff88';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(E.gx, E.gz, 1.6 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    } else if (E.kind === 'race') {
      diamond(ctx, E.x, E.z, 1, I.css);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(E.fx - 1.4 * pulse, E.fz - 1.4 * pulse, 2.8 * pulse, 2.8 * pulse);
    } else if (E.kind === 'secret') {
      continue; // segredo não aparece no mapa
    } else if (E.kind === 'gamble') {
      if (!d.explored[Math.floor(E.z) * d.W + Math.floor(E.x)]) continue;
      ctx.fillStyle = I.css;
      ctx.fillRect(E.x - 0.7, E.z - 0.9, 1.4, 1.8);
    } else {
      ctx.strokeStyle = I.css;
      ctx.lineWidth = 0.7;
      ctx.strokeRect(E.x - 2 * pulse, E.z - 2 * pulse, 4 * pulse, 4 * pulse);
      diamond(ctx, E.x, E.z, 0.9, I.css);
    }
  }
}
export function eventArrows(arrow) {
  for (const E of G.events || []) {
    if (E.st === 'done' || E.st === 'failed') continue;
    if (E.kind === 'wanted' && E.e.alive) arrow(E.e.x, E.e.z, '#ffaa00', 1);
    else if (E.kind === 'bomb') for (const c of E.cons) !c.off && arrow(c.x, c.z, '#ff7a1a', 0.85);
    else if (E.kind === 'shards' && E.st === 'run') for (const s of E.list) !s.got && arrow(s.x, s.z, '#7affc8', 0.7);
    else if (E.kind === 'relay' && E.st === 'run' && E.list[E.idx]) arrow(E.list[E.idx].x, E.list[E.idx].z, '#ff9a3d', 1);
    else if (E.kind === 'escort' && E.st === 'move') arrow(E.stall ? E.x : E.tx, E.stall ? E.z : E.tz, '#5ab8ff', 0.85);
    else if (E.kind === 'race' && E.st !== 'idle') arrow(E.fx, E.fz, '#7affc8', 1);
    else if (E.kind === 'ball' && E.st === 'play') arrow(E.gx, E.gz, '#39ff88', 0.85);
  }
}
