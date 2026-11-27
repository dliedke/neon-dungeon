// Biomas selvagens, quarta leva: Fábrica de Doces, Ferro-Velho Magnético, Caverna Cantante, Parque Assombrado,
// Fontes Termais, Selva de Cabos, Estação de Trem Neon, Tumba do Faraó, Ateliê de Tinta e Quarto de Brinquedos.
// wilds2.js chama placeWild3 / buildWilds3 / updateWilds3 / wildGround3 / obstStyle3.
// Mesmas regras: o posicionamento usa só rr/ri/pick/chance (semente), o resto pode usar Math.random.
// Quase tudo aqui é para usar a favor: atrair inimigos para a armadilha, a planta, o trem ou o ímã.
import * as THREE from 'three';
import { G, TILE } from './state.js';
import { rr, ri, pick, chance } from './utils.js';
import { isWalkable, randomFloorInRoom } from './dungeon.js';
import { damagePlayer, damageEnemy, healPlayer } from './combat.js';
import { burst, ringFx, particle, floatText, telegraphFx, lineTelegraph } from './fx.js';
import { sfx } from './audio.js';
import { L } from './i18n.js';
import { glowMat, merged } from './models.js';
import { FEAT, featAt } from './biomes.js';
import { forDisc, blobs, spots, layer, layerAdd, layerHide, discGeo, ringGeo, lam, basic } from './wilds.js';
import { obstacles } from './wilds2.js';
import { spawnPickup } from './loot.js';

export const WILD3_IDS = ['candy', 'junkyard', 'crystalcave', 'carnival', 'springs', 'jungle', 'station', 'tomb', 'atelier', 'toybox'];
const TAU = Math.PI * 2;

// ------------------------------------------------------------------
// Efeito do piso
// ------------------------------------------------------------------
const GE = {
  caramel: { speed: 0.74, eSpeed: 0.42 },
  spring: { speed: 0.86, eSpeed: 0.6 },
  grass: { speed: 0.94 },
  oil: { speed: 1.12, ice: true, eSpeed: 0.8 },
  paint: { speed: 1.04 },
};
export function wildGround3(d, f, x, z) {
  switch (f) {
    case FEAT.CARAMEL:
      return GE.caramel;
    case FEAT.SPRING:
      return GE.spring;
    case FEAT.GRASS2:
      return GE.grass;
    case FEAT.OIL:
      return GE.oil;
    case FEAT.PAINTR:
    case FEAT.PAINTB:
    case FEAT.PAINTG:
      return GE.paint;
    case FEAT.QSAND:
      return (d.qsGe && d.qsGe.get(Math.floor(z) * d.W + Math.floor(x))) || GE.caramel;
  }
  return null;
}

// ------------------------------------------------------------------
// Posicionamento (estágio com semente)
// ------------------------------------------------------------------
// trilho de trem: faixa de 2 ladrilhos atravessando a sala inteira pelo lado mais comprido
function tracks(d, h) {
  d.tracks = [];
  for (const r of h.rooms) {
    if (Math.max(r.w, r.h) < 9 || Math.min(r.w, r.h) < 6 || r.plaza || !chance(0.6)) continue;
    const horiz = r.w >= r.h;
    const line = horiz ? Math.floor(r.cy) + ri(-1, 0) : Math.floor(r.cx) + ri(-1, 0);
    const a0 = horiz ? r.x : r.y;
    const a1 = horiz ? r.x + r.w : r.y + r.h;
    const tiles = [];
    let ok = true;
    for (let s = a0; s < a1 && ok; s++)
      for (let k = 0; k < 2; k++) {
        const i = horiz ? s : line + k;
        const j = horiz ? line + k : s;
        if (h.nearKey(d, i + 0.5, j + 0.5, 3)) ok = false;
        if (d.grid[j * d.W + i] === TILE.FLOOR && !d.feat[j * d.W + i]) tiles.push(j * d.W + i);
      }
    if (!ok || tiles.length < 12) continue;
    for (const k of tiles) h.set(k % d.W, Math.floor(k / d.W), FEAT.TRACK);
    d.tracks.push({ horiz, c: line + 1, a0, a1, st: 'idle', t: rr(3, 8), pos: 0, pass: 0 });
  }
}
// areia movediça: manchas que puxam para o centro
function quicksand(d, h) {
  d.qsGe = new Map();
  for (const r of h.rooms) {
    if (!chance(0.6)) continue;
    for (let k = ri(1, 2); k > 0; k--) {
      const c = randomFloorInRoom(d, r, 1);
      if (h.nearKey(d, c.x, c.z, 4)) continue;
      forDisc(c.x, c.z, rr(1.6, 2.6), (i, j) => {
        const n = j * d.W + i;
        if (d.grid[n] !== TILE.FLOOR || d.feat[n]) return;
        h.set(i, j, FEAT.QSAND);
        if (d.feat[n] !== FEAT.QSAND) return;
        const dx = c.x - (i + 0.5);
        const dz = c.z - (j + 0.5);
        const l = Math.hypot(dx, dz) || 1;
        const k2 = Math.min(1, l / 1.2) * 1.9;
        d.qsGe.set(n, { speed: 0.6, eSpeed: 0.55, push: { x: (dx / l) * k2, z: (dz / l) * k2 } });
      });
    }
  }
}
export function placeWild3(d, theme, f, h) {
  const { rooms } = h;
  switch (f) {
    // ---- Fábrica de Doces ----
    case 'caramel':
      blobs(d, h, FEAT.CARAMEL, 0.65, 1, 2, 1.4, 2.6);
      break;
    case 'candycanes':
      obstacles(d, h, FEAT.CANE, 0.03, 60);
      break;
    case 'jellies':
      spots(d, h, rooms, 0.75, 1, 3, (pt) => d.props.push({ type: 'jelly', x: pt.x, z: pt.z, cd: 0, hit: 0 }));
      break;
    case 'gumballs':
      spots(d, h, rooms, 0.4, 1, 1, (pt) => d.props.push({ type: 'gumball', x: pt.x, z: pt.z, cd: 0 }));
      break;
    // ---- Ferro-Velho Magnético ----
    case 'scrapheaps':
      obstacles(d, h, FEAT.SCRAP, 0.035, 70);
      break;
    case 'magnets':
      spots(d, h, rooms, 0.55, 1, 1, (pt) => d.props.push({ type: 'magnet', x: pt.x, z: pt.z, st: 'idle', t: rr(3, 7), tick: 0 }));
      break;
    case 'oilslicks':
      blobs(d, h, FEAT.OIL, 0.5, 1, 2, 1.3, 2.4);
      break;
    // ---- Caverna Cantante ----
    case 'geodes':
      obstacles(d, h, FEAT.GEODE, 0.035, 70);
      break;
    case 'singers':
      spots(d, h, rooms, 0.8, 1, 3, (pt) => d.props.push({ type: 'singer', x: pt.x, z: pt.z, cd: 0, glow: 0, pend: -1, hue: rr(0.5, 0.85) }));
      break;
    // ---- Parque Assombrado ----
    case 'carousels':
      for (const r of rooms) {
        if (r.w < 7 || r.h < 7 || !chance(0.55)) continue;
        const pt = randomFloorInRoom(d, r, 3);
        if (h.nearKey(d, pt.x, pt.z, 5) || !isWalkable(d, pt.x, pt.z)) continue;
        d.props.push({ type: 'carousel', x: pt.x, z: pt.z, r: rr(2, 2.6), a: rr(0, 6), dir: chance(0.5) ? 1 : -1 });
      }
      break;
    case 'balloons':
      spots(d, h, rooms, 0.7, 1, 3, (pt) => d.props.push({ type: 'balloon', x: pt.x, z: pt.z, t: 0, ph: rr(0, 6), c: pick([0xff3355, 0x3dc7ff, 0xffd23d, 0x39ff88, 0xff4df0]) }));
      break;
    case 'tents':
      obstacles(d, h, FEAT.TENT, 0.025, 30);
      break;
    // ---- Fontes Termais ----
    case 'hotsprings':
      blobs(d, h, FEAT.SPRING, 0.6, 1, 2, 1.4, 2.4);
      break;
    case 'jets':
      spots(d, h, rooms, 0.7, 1, 2, (pt) => d.props.push({ type: 'jet', x: pt.x, z: pt.z, st: 'idle', t: rr(2, 7) }));
      break;
    case 'mossrocks':
      obstacles(d, h, FEAT.MOSSROCK, 0.03, 60);
      break;
    // ---- Selva de Cabos ----
    case 'tallgrass':
      blobs(d, h, FEAT.GRASS2, 0.75, 1, 3, 1.5, 3.2);
      break;
    case 'snappers':
      spots(d, h, rooms, 0.7, 1, 2, (pt) => d.props.push({ type: 'snapper', x: pt.x, z: pt.z, st: 'idle', t: 0, cd: 0, a: rr(0, 6) }));
      break;
    case 'fruits':
      spots(d, h, rooms, 0.5, 1, 1, (pt) => d.props.push({ type: 'fruit', x: pt.x, z: pt.z, t: 0 }));
      break;
    case 'cabletrees':
      obstacles(d, h, FEAT.CABLETREE, 0.06, 80);
      break;
    // ---- Estação de Trem Neon ----
    case 'tracks':
      tracks(d, h);
      break;
    case 'vendings':
      obstacles(d, h, FEAT.VENDING, 0.02, 30);
      break;
    // ---- Tumba do Faraó ----
    case 'quicksand':
      quicksand(d, h);
      break;
    case 'fireplates':
      spots(d, h, rooms, 0.7, 1, 2, (pt) => d.props.push({ type: 'fireplate', x: Math.floor(pt.x) + 0.5, z: Math.floor(pt.z) + 0.5, st: 'idle', t: 0 }));
      break;
    case 'obelisks':
      obstacles(d, h, FEAT.OBELISK, 0.015, 30);
      break;
    case 'scarabs':
      spots(d, h, d.rooms, 0.55, 1, 2, (pt) => d.props.push({ type: 'scarab', x: pt.x, z: pt.z, got: false, ph: rr(0, 6) }));
      break;
    // ---- Ateliê de Tinta ----
    case 'paintpools':
      blobs(d, h, FEAT.PAINTR, 0.35, 1, 1, 1.2, 2);
      blobs(d, h, FEAT.PAINTB, 0.35, 1, 1, 1.2, 2);
      blobs(d, h, FEAT.PAINTG, 0.35, 1, 1, 1.2, 2);
      break;
    case 'buckets':
      spots(d, h, rooms, 0.7, 1, 2, (pt) => d.props.push({ type: 'bucket', x: pt.x, z: pt.z, t: 0, c: ri(0, 2) }));
      break;
    case 'easels':
      obstacles(d, h, FEAT.EASEL, 0.025, 40);
      break;
    // ---- Quarto de Brinquedos ----
    case 'toyblocks':
      obstacles(d, h, FEAT.TOYBLOCK, 0.09, 70);
      break;
    case 'jacks':
      spots(d, h, rooms, 0.6, 1, 2, (pt) => d.props.push({ type: 'jack', x: pt.x, z: pt.z, st: 'idle', t: 0, cd: 0 }));
      break;
    case 'bouncyballs':
      spots(d, h, rooms, 0.55, 1, 1, (pt) => d.props.push({ type: 'bball', x: pt.x, z: pt.z, bx: pt.x, bz: pt.z, vx: 0, vz: 0, cd: 0, c: pick([0xff3355, 0x3dc7ff, 0xffd23d, 0x39ff88]) }));
      break;
  }
}

// ------------------------------------------------------------------
// Obstáculos (instanciados): kind -> estilo
// ------------------------------------------------------------------
export const obstStyle3 = (kind) => ({ [FEAT.CANE]: 'cane', [FEAT.SCRAP]: 'scrap', [FEAT.GEODE]: 'geode', [FEAT.TENT]: 'tent', [FEAT.MOSSROCK]: 'mossrock', [FEAT.CABLETREE]: 'cabletree', [FEAT.VENDING]: 'vending', [FEAT.OBELISK]: 'obelisk', [FEAT.EASEL]: 'easel', [FEAT.TOYBLOCK]: 'toyblock' })[kind] || null;
export const OBST_STYLES3 = {
  cane: () => [
    [merged('w3_cn0', (b, a) => {
      a(new THREE.CylinderGeometry(0.12, 0.12, 1.9, 8), 0, 0.95, 0);
      a(new THREE.TorusGeometry(0.32, 0.12, 6, 10, Math.PI), -0.32, 1.9, 0);
    }), lam(0xfff0f4, 0x2a1a20)],
    [merged('w3_cn1', (b, a) => {
      for (let k = 0; k < 5; k++) a(new THREE.TorusGeometry(0.125, 0.035, 4, 10), 0, 0.25 + k * 0.36, 0, Math.PI / 2 + 0.4, 0, 0);
    }), 'glow:0xff3355'],
  ],
  scrap: () => [
    [merged('w3_sc0', (b, a) => {
      b(1.1, 0.5, 0.8, 0, 0.25, 0, 0.1, 0.3, 0);
      b(0.7, 0.45, 0.6, 0.15, 0.7, 0.05, -0.2, 0.8, 0.15);
      a(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), -0.4, 0.95, 0.2, Math.PI / 2, 0, 0.3);
      b(0.08, 0.9, 0.08, 0.35, 1.0, -0.2, 0.3, 0, 0.4);
    }), lam(0x6a5a4a, 0x140e08)],
    [merged('w3_sc1', (b) => b(0.3, 0.12, 0.05, 0.15, 0.72, 0.36, -0.2, 0.8, 0.15)), 'glow:0xffb84a'],
  ],
  geode: () => [
    [merged('w3_ge0', (b, a) => {
      a(new THREE.DodecahedronGeometry(0.55, 0), 0, 0.35, 0);
    }), lam(0x3a3448, 0x0a0812)],
    [merged('w3_ge1', (b, a) => {
      for (let k = 0; k < 5; k++) {
        const an = (k / 5) * TAU;
        a(new THREE.ConeGeometry(0.12, 0.9 + (k % 2) * 0.4, 5), Math.cos(an) * 0.28, 0.75, Math.sin(an) * 0.28, Math.sin(an) * 0.4, 0, -Math.cos(an) * 0.4);
      }
    }), 'glow:0xb36bff'],
  ],
  tent: () => [
    [merged('w3_te0', (b, a) => {
      a(new THREE.ConeGeometry(1.1, 2.2, 8, 1, true), 0, 1.1, 0);
      a(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), 0, 2.4, 0);
    }), lam(0x7a2a4a, 0x1a0610, { side: THREE.DoubleSide })],
    [merged('w3_te1', (b, a) => {
      for (let k = 0; k < 8; k++) a(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 3), Math.cos((k / 8) * TAU) * 0.55, 1.1, Math.sin((k / 8) * TAU) * 0.55, Math.sin((k / 8) * TAU) * 0.46, 0, -Math.cos((k / 8) * TAU) * 0.46);
      a(new THREE.SphereGeometry(0.1, 6, 4), 0, 2.75, 0);
    }), 'glow:0xffd23d'],
  ],
  mossrock: () => [
    [merged('w3_mr0', (b, a) => {
      a(new THREE.DodecahedronGeometry(0.6, 0), 0, 0.4, 0, 0, 0, 0, 1, 0.7, 1);
      a(new THREE.DodecahedronGeometry(0.35, 0), 0.45, 0.25, 0.25);
    }), lam(0x5a5a5e, 0x0e0e10)],
    [merged('w3_mr1', (b, a) => a(new THREE.SphereGeometry(0.5, 8, 4, 0, TAU, 0, Math.PI / 2), 0, 0.62, 0, 0, 0, 0, 1, 0.3, 1)), lam(0x4a8a4a, 0x0a1a0a)],
  ],
  cabletree: () => [
    [merged('w3_ct0', (b, a) => {
      a(new THREE.CylinderGeometry(0.18, 0.3, 3.2, 7), 0, 1.6, 0);
      a(new THREE.SphereGeometry(1.0, 8, 6), 0, 3.3, 0, 0, 0, 0, 1, 0.6, 1);
    }), lam(0x2a4a2a, 0x061006)],
    [merged('w3_ct1', (b, a) => {
      for (let k = 0; k < 4; k++) {
        const an = (k / 4) * TAU + 0.4;
        a(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 3), Math.cos(an) * 0.7, 1.9, Math.sin(an) * 0.7, Math.sin(an) * 0.15, 0, -Math.cos(an) * 0.15);
      }
    }), 'glow:0x39ff88'],
  ],
  vending: () => [
    [merged('w3_vd0', (b) => {
      b(0.9, 1.9, 0.7, 0, 0.95, 0);
    }), lam(0x2a2a3a, 0x08080e)],
    [merged('w3_vd1', (b) => {
      b(0.6, 1.1, 0.04, -0.08, 1.15, 0.36);
    }), 'glow:0x3dc7ff'],
    [merged('w3_vd2', (b) => b(0.12, 0.3, 0.04, 0.33, 1.1, 0.36)), 'glow:0xff4df0'],
  ],
  obelisk: () => [
    [merged('w3_ob0', (b, a) => {
      b(0.8, 0.3, 0.8, 0, 0.15, 0);
      a(new THREE.CylinderGeometry(0.18, 0.32, 2.8, 4), 0, 1.7, 0, 0, Math.PI / 4, 0);
      a(new THREE.ConeGeometry(0.2, 0.4, 4), 0, 3.3, 0, 0, Math.PI / 4, 0);
    }), lam(0xc8a868, 0x201808)],
    [merged('w3_ob1', (b) => {
      for (let k = 0; k < 4; k++) b(0.06, 0.06, 0.02, 0, 1.2 + k * 0.45, 0.25 - k * 0.012);
    }), 'glow:0x3dc7ff'],
  ],
  easel: () => [
    [merged('w3_ea0', (b) => {
      b(0.06, 1.8, 0.06, -0.35, 0.9, 0.1, 0.12, 0, 0.08);
      b(0.06, 1.8, 0.06, 0.35, 0.9, 0.1, 0.12, 0, -0.08);
      b(0.06, 1.7, 0.06, 0, 0.85, -0.35, -0.3, 0, 0);
      b(0.85, 0.06, 0.12, 0, 0.75, 0.2);
    }), lam(0x8a6a44, 0x140e06)],
    [merged('w3_ea1', (b) => b(0.8, 0.7, 0.04, 0, 1.2, 0.22, 0.12, 0, 0)), lam(0xf4f0e8, 0x2a2824)],
    [merged('w3_ea2', (b) => {
      b(0.3, 0.2, 0.02, -0.15, 1.3, 0.25, 0.12, 0, 0);
      b(0.25, 0.25, 0.02, 0.2, 1.05, 0.25, 0.12, 0, 0);
    }), 'glow:0xff4df0'],
  ],
  toyblock: () => [
    [merged('w3_tb0', (b) => {
      b(0.8, 0.8, 0.8, 0, 0.4, 0);
      b(0.6, 0.6, 0.6, 0.12, 1.1, -0.05, 0, 0.5, 0);
    }), lam(0xffffff, 0x1a1a1a)],
    [merged('w3_tb1', (b) => {
      b(0.82, 0.12, 0.12, 0, 0.8, 0.4);
      b(0.62, 0.1, 0.1, 0.12, 1.4, -0.05, 0, 0.5, 0);
    }), 'glow:0xffd23d'],
  ],
};

// ------------------------------------------------------------------
// Construção (visual)
// ------------------------------------------------------------------
const PAINT = () => [
  [FEAT.PAINTR, 0xff3355],
  [FEAT.PAINTB, 0x3d8bff],
  [FEAT.PAINTG, 0x39ff88],
];
let tuftGeo = null;
export function buildWilds3(d, theme, group, B, W) {
  const add = (Lr) => {
    if (Lr) group.add(Lr.im);
    return Lr;
  };
  W.caramel = add(layer(d, FEAT.CARAMEL, basic(0xc8742a, 1, 0.72, false), 0.024));
  W.spring = add(layer(d, FEAT.SPRING, basic(0x5ad8ff, 1.2, 0.38, true), 0.024));
  W.grass2 = add(layer(d, FEAT.GRASS2, basic(0x3aa84a, 1, 0.45, false), 0.022));
  W.oil = add(layer(d, FEAT.OIL, basic(0x14101c, 1, 0.82, false), 0.024));
  W.qsand = add(layer(d, FEAT.QSAND, basic(0xd8b060, 1, 0.55, false), 0.024));
  W.track = add(layer(d, FEAT.TRACK, basic(0x22262e, 1, 0.9, false), 0.022));
  // tinta: sobra espaço para os respingos dos baldes
  if (theme.features.includes('paintpools')) {
    W.paint = PAINT().map(([f, c]) => add(layer(d, f, basic(c, 1.1, 0.42, true), 0.026, 160)));
  }
  // capim alto: tufos instanciados por cima da camada
  if (W.grass2) {
    if (!tuftGeo) tuftGeo = merged('w3_tuft', (b, a) => {
      for (let k = 0; k < 5; k++) a(new THREE.ConeGeometry(0.05, 0.7 + (k % 3) * 0.2, 3), Math.cos(k * 1.3) * 0.22, 0.35, Math.sin(k * 1.7) * 0.22, Math.sin(k) * 0.2, 0, Math.cos(k) * 0.2);
    });
    const keys = [...W.grass2.idx.keys()];
    const im = new THREE.InstancedMesh(tuftGeo, lam(0x4ac85a, 0x0a2a0a), keys.length);
    const m4 = new THREE.Matrix4();
    keys.forEach((k, n) => im.setMatrixAt(n, m4.makeTranslation((k % d.W) + 0.3 + Math.random() * 0.4, 0, Math.floor(k / d.W) + 0.3 + Math.random() * 0.4)));
    im.computeBoundingSphere();
    group.add(im);
  }
  // trilhos: dormentes e o trem de cada trilho
  if (d.tracks && d.tracks.length) {
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.08), glowMat(0x3dc7ff, 1.4), d.tracks.length * 2);
    const m4 = new THREE.Matrix4();
    d.tracks.forEach((t, i) => {
      const len = t.a1 - t.a0;
      const mid = (t.a0 + t.a1) / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.horiz ? 0 : Math.PI / 2);
      for (const s of [-0.55, 0.55]) {
        m4.compose(new THREE.Vector3(t.horiz ? mid : t.c + s, 0.05, t.horiz ? t.c + s : mid), q, new THREE.Vector3(len, 1, 1));
        rail.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4);
      }
      const train = new THREE.Group();
      const body = new THREE.Mesh(merged('w3_train', (b) => {
        b(4.2, 1.5, 1.5, 0, 0.95, 0);
        b(0.6, 0.9, 1.3, 2.3, 0.75, 0);
      }), lam(0x3a4a6a, 0x0a1020));
      const win = new THREE.Mesh(merged('w3_trainw', (b) => {
        b(3.6, 0.35, 1.54, -0.2, 1.25, 0);
        b(0.1, 0.3, 1.0, 2.62, 0.6, 0);
      }), glowMat(0xffe14d, 2.4));
      train.add(body, win);
      train.visible = false;
      train.rotation.y = t.horiz ? 0 : -Math.PI / 2;
      group.add(train);
      const lamp = basic(0xff3355, 1.6, 0, true);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), lamp);
      strip.scale.set(t.horiz ? len : 2, 1, t.horiz ? 2 : len);
      strip.position.set(t.horiz ? mid : t.c, 0.03, t.horiz ? t.c : mid);
      group.add(strip);
      t.train = train;
      t.lamp = lamp;
    });
    rail.computeBoundingSphere();
    group.add(rail);
  }

  for (const p of d.props) {
    const g = p.group;
    if (!g) continue;
    switch (p.type) {
      case 'jelly': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 8, 0, TAU, 0, Math.PI / 2), basic(0x7affc8, 0.55, 0.38, true));
        const rim = new THREE.Mesh(ringGeo, basic(0xff6ad5, 1.8, 0.7, true));
        rim.scale.setScalar(0.85);
        rim.position.y = 0.03;
        g.add(m, rim);
        p.mesh = m;
        break;
      }
      case 'gumball': {
        const base = new THREE.Mesh(merged('w3_gb0', (b, a) => {
          a(new THREE.CylinderGeometry(0.22, 0.32, 0.8, 8), 0, 0.4, 0);
          b(0.3, 0.2, 0.1, 0, 0.5, 0.28);
        }), lam(0xd02a4a, 0x200408));
        const glass = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9), basic(0xcfeaff, 1, 0.22, false));
        glass.position.y = 1.2;
        const balls = new THREE.Mesh(merged('w3_gb1', (b, a) => {
          for (let k = 0; k < 9; k++) a(new THREE.SphereGeometry(0.1, 6, 4), Math.cos(k * 2.1) * 0.22, 1.0 + (k % 3) * 0.14, Math.sin(k * 2.1) * 0.22);
        }), glowMat(0xffd23d, 1.8));
        g.add(base, glass, balls);
        p.balls = balls;
        break;
      }
      case 'magnet': {
        const post = new THREE.Mesh(merged('w3_mg0', (b, a) => {
          b(0.25, 3.2, 0.25, 0, 1.6, 0);
          b(1.2, 0.18, 0.18, 0.5, 3.2, 0);
          a(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), 1.0, 2.75, 0);
        }), lam(0x6a6a72, 0x0e0e12));
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), glowMat(0xff3355, 1.2));
        head.position.set(1.0, 2.2, 0);
        const pad = new THREE.Mesh(ringGeo, basic(0xff3355, 1.4, 0.4, true));
        pad.scale.setScalar(1.2);
        pad.position.set(1.0, 0.03, 0);
        g.add(post, head, pad);
        // o ímã puxa para baixo da cabeça
        p.cx = p.x + 1.0;
        p.cz = p.z;
        p.head = head;
        p.pad = pad;
        break;
      }
      case 'singer': {
        const mat = glowMat(new THREE.Color().setHSL(p.hue, 0.9, 0.6).getHex(), 0.9);
        const m = new THREE.Mesh(merged('w3_sg', (b, a) => {
          a(new THREE.ConeGeometry(0.28, 2.2, 6), 0, 1.1, 0);
          a(new THREE.ConeGeometry(0.16, 1.3, 6), 0.32, 0.65, 0.1, 0, 0, -0.3);
          a(new THREE.ConeGeometry(0.15, 1.1, 6), -0.28, 0.55, -0.15, 0.25, 0, 0.3);
        }), mat);
        const ring = new THREE.Mesh(ringGeo, basic(0xb36bff, 1.6, 0.35, true));
        ring.scale.setScalar(0.9);
        ring.position.y = 0.03;
        g.add(m, ring);
        p.mat = mat;
        p.ring = ring;
        break;
      }
      case 'carousel': {
        const spin = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.12, 24), lam(0x5a2a4a, 0x14060e));
        deck.position.y = 0.06;
        const top = new THREE.Mesh(new THREE.ConeGeometry(p.r * 0.9, 0.9, 12, 1, true), lam(0xd04a7a, 0x200810, { side: THREE.DoubleSide }));
        top.position.y = 2.9;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.9, 8), lam(0xd0b070, 0x201808));
        pole.position.y = 1.45;
        spin.add(deck, top, pole);
        const horseGeo = merged('w3_horse', (b) => {
          b(0.6, 0.3, 0.2, 0, 0, 0);
          b(0.2, 0.35, 0.16, 0.3, 0.2, 0, 0, 0, 0.4);
          b(0.05, 1.8, 0.05, 0, 0.4, 0);
        });
        p.horses = [];
        for (let k = 0; k < 4; k++) {
          const an = (k / 4) * TAU;
          const h = new THREE.Mesh(horseGeo, glowMat(pick([0xffd23d, 0x7affc8, 0xff6ad5, 0x3dc7ff]), 1.3));
          h.position.set(Math.cos(an) * p.r * 0.65, 1, Math.sin(an) * p.r * 0.65);
          h.rotation.y = -an + (p.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
          spin.add(h);
          p.horses.push(h);
        }
        g.add(spin);
        const rim = new THREE.Mesh(ringGeo, basic(0xffd23d, 1.6, 0.6, true));
        rim.scale.setScalar(p.r + 0.05);
        rim.position.y = 0.14;
        g.add(rim);
        p.spin = spin;
        break;
      }
      case 'balloon': {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 9), glowMat(p.c, 1.4));
        b.scale.set(1, 1.2, 1);
        b.position.y = 1.7;
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.3, 3), lam(0xffffff, 0x222222));
        str.position.y = 0.85;
        const peg = new THREE.Mesh(ringGeo, basic(p.c, 1.4, 0.5, true));
        peg.scale.setScalar(0.4);
        peg.position.y = 0.03;
        g.add(b, str, peg);
        p.ball = b;
        p.str = str;
        break;
      }
      case 'jet': {
        const vent = new THREE.Mesh(merged('w3_jet', (b, a) => {
          a(new THREE.CylinderGeometry(0.45, 0.6, 0.25, 10), 0, 0.12, 0);
        }), lam(0x5a5a62, 0x101014));
        const hole = new THREE.Mesh(discGeo, basic(0x5ad8ff, 1.4, 0.6, true));
        hole.scale.setScalar(0.35);
        hole.position.y = 0.26;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 10, 1, true), basic(0xdff6ff, 1.3, 0.4, true));
        col.material.side = THREE.DoubleSide;
        col.visible = false;
        g.add(vent, hole, col);
        p.col = col;
        p.hole = hole;
        break;
      }
      case 'snapper': {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.9, 6), lam(0x3a8a3a, 0x081a08));
        stem.position.y = 0.45;
        const head = new THREE.Group();
        head.position.y = 1.0;
        const jawM = lam(0x8a2a4a, 0x2a0610);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, TAU, 0, Math.PI / 2), jawM);
        const bot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2), jawM);
        const teeth = new THREE.Mesh(merged('w3_teeth', (b, a) => {
          for (let k = 0; k < 8; k++) a(new THREE.ConeGeometry(0.04, 0.14, 3), Math.cos((k / 8) * TAU) * 0.38, -0.06, Math.sin((k / 8) * TAU) * 0.38, Math.PI, 0, 0);
        }), glowMat(0xffffff, 1.4));
        top.add(teeth);
        head.add(top, bot);
        const leaves = new THREE.Mesh(merged('w3_leaf', (b) => {
          for (let k = 0; k < 4; k++) b(0.7, 0.03, 0.25, Math.cos(k * 1.57) * 0.4, 0.05, Math.sin(k * 1.57) * 0.4, 0, -k * 1.57, 0);
        }), lam(0x4aa84a, 0x0a200a));
        const rim = new THREE.Mesh(ringGeo, basic(0xff3355, 1.4, 0.25, true));
        rim.scale.setScalar(1.7);
        rim.position.y = 0.03;
        g.add(stem, head, leaves, rim);
        p.top = top;
        p.bot = bot;
        p.head = head;
        p.rim = rim;
        break;
      }
      case 'fruit': {
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.6, 9, 6), lam(0x2a7a3a, 0x061406));
        bush.scale.set(1, 0.7, 1);
        bush.position.y = 0.4;
        const fr = new THREE.Mesh(merged('w3_fruit', (b, a) => {
          for (let k = 0; k < 5; k++) a(new THREE.SphereGeometry(0.11, 7, 5), Math.cos(k * 1.26) * 0.45, 0.55 + (k % 2) * 0.12, Math.sin(k * 1.26) * 0.45);
        }), glowMat(0xff6a3d, 2));
        g.add(bush, fr);
        p.fr = fr;
        break;
      }
      case 'fireplate': {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), lam(0xa8884a, 0x1a1206));
        pl.position.y = 0.03;
        const mark = new THREE.Mesh(ringGeo, basic(0xff6a1a, 1.4, 0.5, true));
        mark.scale.setScalar(0.38);
        mark.position.y = 0.07;
        const nozzles = new THREE.Mesh(merged('w3_noz', (b, a) => {
          for (let k = 0; k < 6; k++) a(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 6), Math.cos((k / 6) * TAU) * 2.1, 0.09, Math.sin((k / 6) * TAU) * 2.1);
        }), lam(0x4a3a2a, 0x0e0a06));
        g.add(pl, mark, nozzles);
        p.mark = mark;
        break;
      }
      case 'scarab': {
        const m = new THREE.Mesh(merged('w3_scar', (b, a) => {
          a(new THREE.SphereGeometry(0.2, 8, 6), 0, 0.15, 0, 0, 0, 0, 1, 0.5, 1.3);
          a(new THREE.SphereGeometry(0.09, 6, 4), 0, 0.14, 0.27);
        }), glowMat(0xffd23d, 1.8));
        g.add(m);
        p.mesh = m;
        break;
      }
      case 'bucket': {
        const col = PAINT()[p.c][1];
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.55, 10), lam(0xb0b4bc, 0x101214));
        m.position.y = 0.28;
        const paint = new THREE.Mesh(discGeo, glowMat(col, 1.6));
        paint.scale.setScalar(0.3);
        paint.position.y = 0.56;
        const rim = new THREE.Mesh(ringGeo, basic(col, 1.6, 0.5, true));
        rim.scale.setScalar(0.6);
        rim.position.y = 0.03;
        g.add(m, paint, rim);
        p.paint = paint;
        p.rim = rim;
        break;
      }
      case 'jack': {
        const bx = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), lam(0x3a6ad0, 0x08102a));
        bx.position.y = 0.4;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.84), glowMat(0xffd23d, 1.4));
        lid.position.y = 0.84;
        const clown = new THREE.Group();
        const face = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lam(0xffffff, 0x222222));
        face.position.y = 0.5;
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), glowMat(0xff3355, 2));
        nose.position.set(0, 0.5, 0.3);
        const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), lam(0xa0a0a8, 0x101010));
        spring.position.y = 0.2;
        clown.add(face, nose, spring);
        clown.position.y = 0.5;
        clown.scale.set(1, 0.05, 1);
        const crank = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.35), lam(0xd0b070, 0x201808));
        crank.position.set(0.45, 0.45, 0);
        g.add(bx, lid, clown, crank);
        p.lid = lid;
        p.clown = clown;
        p.crank = crank;
        break;
      }
      case 'bball': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), glowMat(p.c, 1.1));
        m.position.y = 0.55;
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 4, 18), glowMat(0xffffff, 1.8));
        stripe.position.y = 0.55;
        g.add(m, stripe);
        p.mesh = m;
        p.stripe = stripe;
        break;
      }
    }
  }
}

// ------------------------------------------------------------------
// Atualização
// ------------------------------------------------------------------
let acc = 0;
let slowT = 0;
const nearCam = (x, z, r) => Math.abs(x - G.camFocus.x) < r && Math.abs(z - G.camFocus.z) < r;
const dmgBase = (p) => p.stats.maxHp * 0.08 + G.floor * 1.5;
const foeDmg = (p, k) => p.stats.wMax * k + G.floor * 4;
// inimigos que objetos do bioma podem mover/ferir
const movable = (e) => e.alive && !e.inert && !e.static && !e.decoy && !e.T.prop && !e.T.breakable;
function knock(o, fx, fz, k) {
  const dx = o.x - fx;
  const dz = o.z - fz;
  const l = Math.hypot(dx, dz) || 1;
  o.kx = (o.kx || 0) + (dx / l) * k;
  o.kz = (o.kz || 0) + (dz / l) * k;
}
const BUFFS = () => [
  ['haste', 6, L('PRESSA!', 'HASTE!')],
  ['fury', 6, L('FÚRIA!', 'FURY!')],
  ['regen', 6, L('REGENERAÇÃO!', 'REGEN!')],
  ['guard', 5, L('ESCUDO!', 'SHIELD!')],
];
function giveBuff(p, k) {
  const [key, t, name] = BUFFS()[k];
  p.buffs[key] = Math.max(p.buffs[key] || 0, t);
  if (key === 'guard') p.guardK = Math.min(p.guardK ?? 1, 0.6);
  floatText(p.x, 2.3, p.z, name, 'info');
}
// respingo de tinta: pinta os ladrilhos em volta (troca a camada) e machuca quem estiver lá
function splash(d, W, x, z, ci, p) {
  const [f, col] = PAINT()[ci];
  forDisc(x, z, 2.4, (i, j) => {
    const n = j * d.W + i;
    if (d.grid[n] !== TILE.FLOOR) return;
    const cur = d.feat[n];
    if (cur && cur !== FEAT.PAINTR && cur !== FEAT.PAINTB && cur !== FEAT.PAINTG) return;
    if (cur === f) return;
    if (W.paint) {
      if (cur) layerHide(W.paint[cur - FEAT.PAINTR], n);
      d.feat[n] = f;
      layerAdd(W.paint[ci], d, n);
    }
  });
  ringFx(x, z, 2.6, col, 0.45);
  burst(x, 0.6, z, col, 30, 6, 0.09, 0.6, { up: 2 });
  for (const e of G.enemies) {
    if (!movable(e) || Math.hypot(e.x - x, e.z - z) > 2.6) continue;
    damageEnemy(e, foeDmg(p, 2), false, { noProc: true });
    e.slowT = Math.max(e.slowT || 0, 2.5);
  }
}

export function updateWilds3(d, dt, p, W) {
  const alive = p && p.alive;
  const id = G.theme && G.theme.id;
  if (!WILD3_IDS.includes(id)) return;
  const cx = G.camFocus.x;
  const cz = G.camFocus.z;
  acc += dt;
  slowT -= dt;
  const slow = slowT <= 0;
  if (slow) slowT = 0.5;
  const fp = alive ? featAt(d, p.x, p.z) : 0;

  // partículas do ambiente
  if (acc > 0.07) {
    acc = 0;
    if (id === 'candy') particle(cx + rr(-13, 13), rr(2, 4), cz + rr(-12, 12), rr(-0.2, 0.2), rr(-0.6, -0.3), rr(-0.2, 0.2), pick([0xff6ad5, 0x7affc8, 0xffd23d, 0xffffff]), 0.06, 4, 0, 0);
    else if (id === 'junkyard') { if (Math.random() < 0.5) particle(cx + rr(-13, 13), rr(0.2, 2), cz + rr(-12, 12), rr(-0.4, 0.4), rr(0.6, 1.4), rr(-0.4, 0.4), 0xffb84a, 0.04, 0.6, 2, 0); }
    else if (id === 'crystalcave') particle(cx + rr(-13, 13), rr(0.3, 2.5), cz + rr(-12, 12), 0, rr(0.2, 0.5), 0, pick([0xb36bff, 0x6af0ff, 0xff6ad5]), 0.05, 2.4, 0, 0);
    else if (id === 'carnival') { if (Math.random() < 0.5) particle(cx + rr(-13, 13), rr(2, 4), cz + rr(-12, 12), rr(-0.4, 0.4), rr(-0.8, -0.3), 0, pick([0xff3355, 0xffd23d, 0x3dc7ff]), 0.07, 3, 0, 0); }
    else if (id === 'springs') for (let k = 0; k < 2; k++) particle(cx + rr(-13, 13), rr(0.1, 0.6), cz + rr(-12, 12), rr(-0.2, 0.2), rr(0.6, 1.2), rr(-0.2, 0.2), 0xeef6ff, rr(0.06, 0.12), 2.4, 0, 0);
    else if (id === 'jungle') { if (Math.random() < 0.6) particle(cx + rr(-13, 13), rr(1.5, 3.5), cz + rr(-12, 12), rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3), pick([0x39ff88, 0xd4ff3d]), 0.05, 2.2, 0, 0); }
    else if (id === 'station') { if (Math.random() < 0.4) particle(cx + rr(-13, 13), rr(3, 5), cz + rr(-12, 12), 0, rr(-0.4, -0.2), 0, 0x9ad7ff, 0.04, 3, 0, 0); }
    else if (id === 'tomb') particle(cx + rr(-13, 13), rr(0.1, 1.5), cz + rr(-12, 12), rr(0.3, 0.9), rr(-0.1, 0.2), rr(-0.2, 0.2), 0xe0c890, 0.04, 2.5, 0, 0);
    else if (id === 'atelier') { if (Math.random() < 0.6) particle(cx + rr(-13, 13), rr(0.5, 3), cz + rr(-12, 12), rr(-0.3, 0.3), rr(0.1, 0.4), rr(-0.3, 0.3), pick([0xff3355, 0x3d8bff, 0x39ff88, 0xffd23d]), 0.06, 2.2, 0, 0); }
    else if (id === 'toybox') { if (Math.random() < 0.5) particle(cx + rr(-13, 13), rr(2, 4), cz + rr(-12, 12), 0, rr(-0.8, -0.4), 0, pick([0xff3355, 0x3dc7ff, 0xffd23d, 0x39ff88]), 0.08, 2.6, 0, 0); }
  }
  if (W.spring) W.spring.mat.opacity = 0.32 + Math.sin(G.t * 1.6) * 0.06;
  if (W.oil) W.oil.mat.color.setHSL(0.75 + Math.sin(G.t * 0.5) * 0.08, 0.3, 0.08);

  // ---- pisos ----
  if (alive) {
    // fonte termal: cura quem fica dentro
    if (fp === FEAT.SPRING) {
      p.springT = (p.springT || 0) - dt;
      if (p.springT <= 0) {
        p.springT = 0.5;
        healPlayer(p.stats.maxHp * 0.018, false);
        burst(p.x, 0.3, p.z, 0xdff6ff, 4, 1.5, 0.06, 0.6, { grav: -1 });
      }
    }
    // tinta: vermelho = fúria, azul = pressa, verde = regeneração
    if (fp === FEAT.PAINTR) p.buffs.fury = Math.max(p.buffs.fury || 0, 0.4);
    else if (fp === FEAT.PAINTB) p.buffs.haste = Math.max(p.buffs.haste || 0, 0.4);
    else if (fp === FEAT.PAINTG) p.buffs.regen = Math.max(p.buffs.regen || 0, 0.4);
    // capim alto: quem está longe perde você de vista
    if (fp === FEAT.GRASS2) {
      p.hideT = 0.4;
      if (slow)
        for (const e of G.enemies) {
          if (!e.alive || !e.aggro || e.boss || e.inert || e.static || Math.hypot(e.x - p.x, e.z - p.z) < 4.5) continue;
          e.aggro = false;
          if (Math.random() < 0.3) floatText(e.x, 2, e.z, '?', 'info');
        }
    }
  }
  if (p && p.hideT > 0) p.hideT -= dt;

  // ---- trens ----
  if (d.tracks)
    for (const t of d.tracks) {
      const mid = (t.a0 + t.a1) / 2;
      t.t -= dt;
      if (t.st === 'idle') {
        if (t.t > 0) continue;
        const px = t.horiz ? mid : t.c;
        const pz = t.horiz ? t.c : mid;
        if (!nearCam(px, pz, 18)) {
          t.t = 2;
          continue;
        }
        t.st = 'warn';
        t.t = 2.2;
        const len = t.a1 - t.a0;
        lineTelegraph(t.horiz ? t.a0 : t.c, t.horiz ? t.c : t.a0, t.horiz ? 0 : Math.PI / 2, len, 2.2, 2.2, 0xff3355);
        sfx.alarm();
        if (nearCam(px, pz, 12)) floatText(px, 2.4, pz, L('TREM VINDO!', 'TRAIN COMING!'), 'hurt');
      } else if (t.st === 'warn') {
        t.lamp.opacity = Math.floor(t.t * 6) % 2 ? 0.35 : 0.05;
        if (t.t > 0) continue;
        t.st = 'run';
        t.pos = t.a0 - 3;
        t.pass++;
        t.train.visible = true;
        t.lamp.opacity = 0;
        sfx.explode();
      } else {
        t.pos += dt * 20;
        t.train.position.set(t.horiz ? t.pos : t.c, 0, t.horiz ? t.c : t.pos);
        const hit = (o) => {
          const along = t.horiz ? o.x : o.z;
          const perp = t.horiz ? o.z : o.x;
          return Math.abs(perp - t.c) < 1.25 && along > t.pos - 2.4 && along < t.pos + 2.6;
        };
        if (alive && p.trainHit !== t.pass + ':' + d.tracks.indexOf(t) && hit(p)) {
          p.trainHit = t.pass + ':' + d.tracks.indexOf(t);
          damagePlayer(dmgBase(p) * 1.6);
          if (t.horiz) p.kz += Math.sign(p.z - t.c || 1) * 16;
          else p.kx += Math.sign(p.x - t.c || 1) * 16;
          floatText(p.x, 2.2, p.z, L('ATROPELADO!', 'RUN OVER!'), 'hurt');
        }
        for (const e of G.enemies) {
          if (!movable(e) || e.trainHit === t.pass + ':' + d.tracks.indexOf(t) || !hit(e)) continue;
          e.trainHit = t.pass + ':' + d.tracks.indexOf(t);
          damageEnemy(e, foeDmg(p, 5) + e.maxHp * (e.boss ? 0.03 : 0.25), false, { noProc: true });
          if (t.horiz) e.kz += Math.sign(e.z - t.c || 1) * 18;
          else e.kx += Math.sign(e.x - t.c || 1) * 18;
          burst(e.x, 1, e.z, 0xffe14d, 10, 5, 0.07, 0.4, { up: 2 });
        }
        if (t.pos > t.a1 + 3) {
          t.st = 'idle';
          t.t = rr(6, 11);
          t.train.visible = false;
        }
      }
    }

  for (const pr of d.props) {
    switch (pr.type) {
      case 'jelly': {
        if (!pr.mesh) break;
        pr.cd = Math.max(0, pr.cd - dt);
        pr.hit = Math.max(0, pr.hit - dt * 3);
        pr.mesh.scale.set(1 + pr.hit * 0.25 + Math.sin(G.t * 4 + pr.x) * 0.04, 1 - pr.hit * 0.4 + Math.sin(G.t * 4 + pr.x) * 0.05, 1 + pr.hit * 0.25);
        if (pr.cd > 0 || !nearCam(pr.x, pr.z, 16)) break;
        let any = false;
        if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 0.8) {
          // geleia: lança na direção em que você anda (parado, para longe do centro)
          let dx = p.ivx || 0;
          let dz = p.ivz || 0;
          let l = Math.hypot(dx, dz);
          if (l < 0.5) {
            dx = p.x - pr.x;
            dz = p.z - pr.z;
            l = Math.hypot(dx, dz) || 1;
          }
          p.kx += (dx / l) * 17;
          p.kz += (dz / l) * 17;
          p.invuln = Math.max(p.invuln || 0, 0.35);
          any = true;
        }
        for (const e of G.enemies) {
          if (!movable(e) || e.boss || e.T.fly || Math.hypot(e.x - pr.x, e.z - pr.z) > 0.85) continue;
          const a = Math.random() * TAU;
          e.kx += Math.cos(a) * 14;
          e.kz += Math.sin(a) * 14;
          e.stun = Math.max(e.stun || 0, 0.5);
          any = true;
        }
        if (any) {
          pr.cd = 0.5;
          pr.hit = 1;
          burst(pr.x, 0.6, pr.z, 0x7affc8, 12, 4, 0.06, 0.4, { up: 2 });
          sfx.dash();
        }
        break;
      }
      case 'gumball': {
        if (!pr.balls) break;
        pr.cd = Math.max(0, pr.cd - dt);
        pr.balls.visible = pr.cd <= 0;
        if (pr.cd > 0 || !alive || Math.hypot(p.x - pr.x, p.z - pr.z) > 1.1) break;
        pr.cd = 40;
        for (let k = 0; k < 2; k++) spawnPickup('orb', pr.x + rr(-0.8, 0.8), pr.z + rr(-0.8, 0.8), {});
        spawnPickup('credits', pr.x, pr.z + 0.8, { amount: Math.round(rr(4, 8) * (1 + G.floor * 0.5)) });
        burst(pr.x, 1.2, pr.z, 0xffd23d, 20, 5, 0.08, 0.5, { up: 2 });
        floatText(pr.x, 2.2, pr.z, L('CHICLETES!', 'GUMBALLS!'), 'info');
        sfx.coin();
        break;
      }
      case 'magnet': {
        if (!pr.head) break;
        pr.t -= dt;
        if (pr.st === 'idle') {
          pr.pad.material.opacity = 0.3;
          if (pr.t > 0) break;
          if (!nearCam(pr.cx, pr.cz, 16)) {
            pr.t = 2;
            break;
          }
          pr.st = 'warn';
          pr.t = 1.3;
          telegraphFx(pr.cx, pr.cz, 6, 1.3, 0xff3355);
          sfx.zap();
        } else if (pr.st === 'warn') {
          pr.head.material.color.setHex(Math.floor(pr.t * 8) % 2 ? 0xff3355 : 0x3dc7ff).multiplyScalar(2);
          if (pr.t > 0) break;
          pr.st = 'pull';
          pr.t = 2.6;
          if (nearCam(pr.cx, pr.cz, 12)) floatText(pr.cx, 3, pr.cz, L('ÍMÃ LIGADO!', 'MAGNET ON!'), 'info');
        } else {
          pr.head.rotation.y += dt * 12;
          pr.pad.material.opacity = 0.7;
          if (Math.random() < dt * 30) {
            const a = Math.random() * TAU;
            const r = rr(2, 6);
            particle(pr.cx + Math.cos(a) * r, 0.4, pr.cz + Math.sin(a) * r, -Math.cos(a) * r * 1.2, 1, -Math.sin(a) * r * 1.2, 0xff3355, 0.05, 0.6, 0, 0);
          }
          const pull = (o, k) => {
            const dx = pr.cx - o.x;
            const dz = pr.cz - o.z;
            const l = Math.hypot(dx, dz);
            if (l > 6 || l < 0.4) return l;
            o.kx += (dx / l) * k * dt;
            o.kz += (dz / l) * k * dt;
            return l;
          };
          if (alive) pull(p, 22);
          pr.tick -= dt;
          const crush = pr.tick <= 0;
          if (crush) pr.tick = 0.4;
          for (const e of G.enemies) {
            if (!movable(e) || e.boss) continue;
            const l = pull(e, 55);
            if (crush && l < 1.4) {
              damageEnemy(e, foeDmg(p, 1.4), false, { noProc: true });
              burst(e.x, 0.8, e.z, 0xffb84a, 6, 3, 0.05, 0.3);
            }
          }
          if (pr.t <= 0) {
            pr.st = 'idle';
            pr.t = rr(6, 10);
            pr.head.material.color.setHex(0xff3355).multiplyScalar(1.2);
          }
        }
        break;
      }
      case 'singer': {
        if (!pr.mat) break;
        pr.cd = Math.max(0, pr.cd - dt);
        pr.glow = Math.max(0, pr.glow - dt * 1.5);
        pr.mat.color.setHSL(pr.hue, 0.9, 0.3 + pr.glow * 0.35).multiplyScalar(1 + pr.glow * 2);
        pr.ring.material.opacity = 0.25 + pr.glow * 0.6;
        let fire = false;
        if (pr.pend >= 0) {
          pr.pend -= dt;
          if (pr.pend < 0) fire = true;
        } else if (pr.cd <= 0 && alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.5 + (p.swing > 0.4 ? 0.8 : 0)) fire = true;
        if (!fire) break;
        // cristal canta: onda que atordoa e fere os inimigos; ecoa nos cristais perto
        pr.cd = 6;
        pr.glow = 1;
        sfx.seq(Math.floor(pr.hue * 8) % 4);
        ringFx(pr.x, pr.z, 4.5, 0xb36bff, 0.5);
        burst(pr.x, 1.4, pr.z, 0xd8b8ff, 20, 5, 0.07, 0.5, { up: 1 });
        for (const e of G.enemies) {
          if (!movable(e) || Math.hypot(e.x - pr.x, e.z - pr.z) > 4.5) continue;
          damageEnemy(e, foeDmg(p, 1.6), false, { noProc: true });
          if (!e.boss) e.stun = Math.max(e.stun || 0, 1.4);
        }
        for (const q of d.props) if (q.type === 'singer' && q !== pr && q.cd <= 0 && q.pend < 0 && Math.hypot(q.x - pr.x, q.z - pr.z) < 7.5) q.pend = 0.35;
        break;
      }
      case 'carousel': {
        if (!pr.spin) break;
        pr.a += dt * 0.8 * pr.dir;
        pr.spin.rotation.y = -pr.a;
        pr.horses.forEach((h, k) => (h.position.y = 1 + Math.sin(G.t * 3 + k * 1.6) * 0.25));
        if (!nearCam(pr.x, pr.z, 16)) break;
        if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < pr.r) {
          // no carrossel você ganha pressa e gira junto
          p.buffs.haste = Math.max(p.buffs.haste || 0, 0.5);
          const dx = p.x - pr.x;
          const dz = p.z - pr.z;
          const l = Math.hypot(dx, dz) || 1;
          p.kx += (-dz / l) * pr.dir * 10 * dt;
          p.kz += (dx / l) * pr.dir * 10 * dt;
        }
        // inimigos são jogados para fora (força centrífuga)
        for (const e of G.enemies) {
          if (!movable(e) || e.boss || e.T.fly) continue;
          const dx = e.x - pr.x;
          const dz = e.z - pr.z;
          const l = Math.hypot(dx, dz);
          if (l > pr.r || l < 0.2) continue;
          e.kx += (dx / l) * 40 * dt + (-dz / l) * pr.dir * 20 * dt;
          e.kz += (dz / l) * 40 * dt + (dx / l) * pr.dir * 20 * dt;
        }
        break;
      }
      case 'balloon': {
        if (!pr.ball) break;
        if (pr.t > 0) {
          pr.t -= dt;
          pr.ball.visible = pr.str.visible = pr.t <= 0;
          break;
        }
        pr.ball.position.y = 1.7 + Math.sin(G.t * 1.5 + pr.ph) * 0.15;
        if (!alive || Math.hypot(p.x - pr.x, p.z - pr.z) > 0.9) break;
        pr.t = 25;
        pr.ball.visible = pr.str.visible = false;
        burst(pr.x, 1.7, pr.z, pr.c, 22, 6, 0.08, 0.5);
        sfx.punch();
        giveBuff(p, Math.floor(Math.random() * 4));
        break;
      }
      case 'jet': {
        if (!pr.col) break;
        pr.t -= dt;
        if (pr.st === 'idle') {
          if (pr.t > 0) break;
          if (!nearCam(pr.x, pr.z, 15)) {
            pr.t = 2;
            break;
          }
          pr.st = 'warn';
          pr.t = 1.1;
          telegraphFx(pr.x, pr.z, 1.7, 1.1, 0x5ad8ff);
        } else if (pr.st === 'warn') {
          if (Math.random() < dt * 20) particle(pr.x + rr(-0.3, 0.3), 0.3, pr.z + rr(-0.3, 0.3), 0, rr(1, 2), 0, 0xdff6ff, 0.07, 0.5, 0, 0);
          if (pr.t > 0) break;
          pr.st = 'blow';
          pr.t = 0.9;
          pr.col.visible = true;
          sfx.flame && sfx.flame();
          burst(pr.x, 0.5, pr.z, 0xdff6ff, 26, 6, 0.1, 0.8, { up: 5 });
          if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.7) {
            // o vapor empurra você para cima: pressa e um instante intocável
            p.buffs.haste = Math.max(p.buffs.haste || 0, 4);
            p.invuln = Math.max(p.invuln || 0, 0.6);
            floatText(p.x, 2.3, p.z, L('IMPULSO!', 'BOOST!'), 'info');
          }
          for (const e of G.enemies) {
            if (!movable(e) || Math.hypot(e.x - pr.x, e.z - pr.z) > 1.8) continue;
            damageEnemy(e, foeDmg(p, 2.5), false, { noProc: true });
            knock(e, pr.x, pr.z, 12);
          }
        } else {
          const k = Math.min(1, pr.t / 0.3, (0.9 - pr.t) / 0.15);
          pr.col.scale.set(1, 0.2 + Math.max(0, k) * 4.5, 1);
          pr.col.position.y = pr.col.scale.y / 2;
          if (pr.t <= 0) {
            pr.st = 'idle';
            pr.t = rr(5, 9);
            pr.col.visible = false;
          }
        }
        break;
      }
      case 'snapper': {
        if (!pr.top) break;
        pr.cd = Math.max(0, pr.cd - dt);
        pr.head.rotation.y = Math.sin(G.t * 0.8 + pr.a) * 0.6;
        if (pr.st === 'idle') {
          pr.top.rotation.x = -0.5 - Math.sin(G.t * 2 + pr.a) * 0.1;
          pr.bot.rotation.x = 0.3;
          pr.rim.material.opacity = 0.2;
          if (pr.cd > 0 || !nearCam(pr.x, pr.z, 15)) break;
          const prey = (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.7) || G.enemies.some((e) => movable(e) && Math.hypot(e.x - pr.x, e.z - pr.z) < 1.7);
          if (!prey) break;
          pr.st = 'warn';
          pr.t = 0.55;
          pr.rim.material.opacity = 0.8;
          sfx.telegraph();
        } else if (pr.st === 'warn') {
          pr.t -= dt;
          pr.top.rotation.x = -0.9;
          pr.bot.rotation.x = 0.6;
          if (pr.t > 0) break;
          // nhac!: morde quem estiver perto (os inimigos levam muito mais)
          pr.st = 'idle';
          pr.cd = 2.8;
          pr.top.rotation.x = 0;
          pr.bot.rotation.x = 0;
          sfx.slash();
          burst(pr.x, 1, pr.z, 0x4aa84a, 14, 4, 0.07, 0.4, { up: 1 });
          if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.8) {
            damagePlayer(dmgBase(p));
            floatText(p.x, 2, p.z, L('NHAC!', 'CHOMP!'), 'hurt');
          }
          for (const e of G.enemies) {
            if (!movable(e) || Math.hypot(e.x - pr.x, e.z - pr.z) > 1.9) continue;
            damageEnemy(e, foeDmg(p, 3.5), false, { noProc: true });
            floatText(e.x, 2, e.z, L('NHAC!', 'CHOMP!'), 'crit');
          }
        }
        break;
      }
      case 'fruit': {
        if (!pr.fr) break;
        if (pr.t > 0) {
          pr.t -= dt;
          pr.fr.visible = pr.t <= 0;
          break;
        }
        if (!alive || Math.hypot(p.x - pr.x, p.z - pr.z) > 1.1) break;
        pr.t = 25;
        pr.fr.visible = false;
        healPlayer(p.stats.maxHp * 0.12);
        burst(pr.x, 0.8, pr.z, 0xff6a3d, 14, 3, 0.06, 0.5, { up: 1.5 });
        sfx.heal();
        break;
      }
      case 'fireplate': {
        if (!pr.mark) break;
        pr.t -= dt;
        if (pr.st === 'idle') {
          pr.mark.material.opacity = 0.5;
          if (pr.t > 0) break;
          const on = (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 0.6) || G.enemies.some((e) => movable(e) && Math.hypot(e.x - pr.x, e.z - pr.z) < 0.6);
          if (!on) break;
          pr.st = 'warn';
          pr.t = 0.8;
          telegraphFx(pr.x, pr.z, 2.4, 0.8, 0xff6a1a);
          sfx.click();
          if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 3) floatText(pr.x, 2, pr.z, L('ARMADILHA!', 'TRAP!'), 'hurt');
        } else if (pr.st === 'warn') {
          pr.mark.material.opacity = Math.floor(pr.t * 10) % 2 ? 1 : 0.2;
          if (pr.t > 0) break;
          pr.st = 'idle';
          pr.t = 3.5;
          sfx.flame && sfx.flame();
          for (let k = 0; k < 30; k++) {
            const a = Math.random() * TAU;
            const r = Math.random() * 2.3;
            particle(pr.x + Math.cos(a) * r, 0.2, pr.z + Math.sin(a) * r, 0, rr(2, 4), 0, pick([0xff6a1a, 0xffb84a, 0xff3a1a]), 0.1, 0.6, 0, 0);
          }
          ringFx(pr.x, pr.z, 2.4, 0xff6a1a, 0.4);
          if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 2.4) damagePlayer(dmgBase(p) * 1.2);
          for (const e of G.enemies) {
            if (!movable(e) || Math.hypot(e.x - pr.x, e.z - pr.z) > 2.5) continue;
            damageEnemy(e, foeDmg(p, 3), false, { noProc: true });
          }
        }
        break;
      }
      case 'scarab': {
        if (!pr.mesh || pr.got) break;
        pr.mesh.rotation.y += dt * 1.5;
        pr.mesh.position.y = Math.abs(Math.sin(G.t * 3 + pr.ph)) * 0.12;
        if (!alive || Math.hypot(p.x - pr.x, p.z - pr.z) > 0.8) break;
        pr.got = true;
        pr.mesh.visible = false;
        for (let k = 0; k < 3; k++) spawnPickup('credits', pr.x + rr(-0.6, 0.6), pr.z + rr(-0.6, 0.6), { amount: Math.round(rr(4, 9) * (1 + G.floor * 0.5)) });
        burst(pr.x, 0.5, pr.z, 0xffd23d, 16, 4, 0.07, 0.5, { up: 2 });
        floatText(pr.x, 1.8, pr.z, L('ESCARAVELHO DE OURO!', 'GOLDEN SCARAB!'), 'info');
        sfx.coin();
        break;
      }
      case 'bucket': {
        if (!pr.paint) break;
        if (pr.t > 0) {
          pr.t -= dt;
          pr.paint.visible = pr.t <= 0;
          pr.rim.visible = pr.t <= 0;
          break;
        }
        if (!alive || Math.hypot(p.x - pr.x, p.z - pr.z) > 0.9) break;
        // chutou o balde: respingo pinta o chão em volta e suja os inimigos
        pr.t = 18;
        pr.paint.visible = pr.rim.visible = false;
        splash(d, W, pr.x, pr.z, pr.c, p);
        sfx.punch();
        floatText(pr.x, 2, pr.z, L('SPLASH!', 'SPLASH!'), 'info');
        pr.c = (pr.c + 1) % 3;
        const col = PAINT()[pr.c][1];
        pr.paint.material.color.setHex(col).multiplyScalar(1.6);
        pr.rim.material.color.setHex(col).multiplyScalar(1.6);
        break;
      }
      case 'jack': {
        if (!pr.clown) break;
        pr.cd = Math.max(0, pr.cd - dt);
        if (pr.st === 'idle') {
          pr.clown.scale.y += (0.05 - pr.clown.scale.y) * Math.min(1, dt * 6);
          if (pr.cd > 0 || !alive || Math.hypot(p.x - pr.x, p.z - pr.z) > 2.3) break;
          pr.st = 'crank';
          pr.t = 1;
          pr.n = 0;
          telegraphFx(pr.x, pr.z, 2.9, 1, 0xffd23d);
        } else if (pr.st === 'crank') {
          pr.t -= dt;
          pr.crank.rotation.x += dt * 14;
          const n = Math.floor((1 - pr.t) * 5);
          if (n > pr.n) {
            pr.n = n;
            sfx.seq(n % 4);
          }
          if (pr.t > 0) break;
          // POP!: empurra todos; inimigos ficam tontos e feridos
          pr.st = 'idle';
          pr.cd = 7;
          pr.clown.scale.y = 1.6;
          sfx.explode();
          ringFx(pr.x, pr.z, 2.9, 0xffd23d, 0.4);
          burst(pr.x, 1.4, pr.z, pick([0xff3355, 0x3dc7ff, 0xffd23d]), 24, 6, 0.08, 0.6, { up: 3 });
          if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 2.9) knock(p, pr.x, pr.z, 9);
          for (const e of G.enemies) {
            if (!movable(e) || Math.hypot(e.x - pr.x, e.z - pr.z) > 2.9) continue;
            damageEnemy(e, foeDmg(p, 2.5), false, { noProc: true });
            if (!e.boss) {
              e.stun = Math.max(e.stun || 0, 1.2);
              knock(e, pr.x, pr.z, 14);
            }
          }
        }
        break;
      }
      case 'bball': {
        if (!pr.mesh || !nearCam(pr.bx, pr.bz, 20)) break;
        pr.cd = Math.max(0, pr.cd - dt);
        // empurrada pelo jogador (andando contra ou golpeando perto)
        if (alive) {
          const dx = pr.bx - p.x;
          const dz = pr.bz - p.z;
          const l = Math.hypot(dx, dz) || 1;
          const reach = 0.55 + p.r + (p.swing > 0.4 ? 0.8 : 0.05);
          if (l < reach) {
            const v = p.swing > 0.4 ? 11 : Math.max(5, Math.hypot(pr.vx, pr.vz));
            pr.vx = (dx / l) * v;
            pr.vz = (dz / l) * v;
            if (p.swing > 0.4 && pr.cd <= 0) {
              pr.cd = 0.3;
              sfx.punch();
            }
          }
        }
        const sp = Math.hypot(pr.vx, pr.vz);
        if (sp > 0.05) {
          const f = Math.max(0, sp - 2.2 * dt) / sp;
          pr.vx *= f;
          pr.vz *= f;
          const nx = pr.bx + pr.vx * dt;
          const nz = pr.bz + pr.vz * dt;
          // quica nas paredes
          if (!isWalkable(d, nx + Math.sign(pr.vx) * 0.5, pr.bz)) pr.vx = -pr.vx * 0.85;
          else pr.bx = nx;
          if (!isWalkable(d, pr.bx, nz + Math.sign(pr.vz) * 0.5)) pr.vz = -pr.vz * 0.85;
          else pr.bz = nz;
          if (sp > 4)
            for (const e of G.enemies) {
              if (!movable(e) || e.ballCd > G.t || Math.hypot(e.x - pr.bx, e.z - pr.bz) > 0.55 + e.r) continue;
              e.ballCd = G.t + 0.5;
              damageEnemy(e, foeDmg(p, 1.2 + sp * 0.15), false, { noProc: true });
              knock(e, pr.bx, pr.bz, sp * 1.2);
              pr.vx *= -0.6;
              pr.vz *= -0.6;
              burst(e.x, 0.8, e.z, pr.c, 10, 4, 0.06, 0.4);
            }
          pr.group.position.set(pr.bx, 0, pr.bz);
          pr.mesh.rotation.x += pr.vz * dt * 2;
          pr.mesh.rotation.z -= pr.vx * dt * 2;
          pr.stripe.rotation.copy(pr.mesh.rotation);
        }
        break;
      }
    }
  }
}
