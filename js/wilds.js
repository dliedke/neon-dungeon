// Biomas selvagens: as mecânicas dos 10 biomas da segunda leva
// (Floresta de Ossos, Deserto de Vidro, Pântano de Estrelas Caídas, Cidade-Colmeia, Mar Petrificado,
// Jardim de Armas, Montanha do Deus Adormecido, Inverno de Cinzas, Floresta da Chuva Invertida e Salinas).
// biomes.js chama placeWild / buildWilds / updateWilds / wildGround; combat.js chama wildBlast / wildKill / projZone;
// enemies.js chama wildPopulate / mirrorDecoy / sentinelCall.
import * as THREE from 'three';
import { G, TILE } from './state.js';
import { rr, ri, pick, chance } from './utils.js';
import { isWalkable, randomFloorInRoom, resolveCircle } from './dungeon.js';
import { spawnHazard, healPlayer, nearestEnemy } from './combat.js';
import { burst, ringFx, particle, floatText, telegraphFx } from './fx.js';
import { sfx } from './audio.js';
import { L } from './i18n.js';
import { glowMat, merged } from './models.js';
import { FEAT, featAt } from './biomes.js';
import { spawnEnemy, killQuiet } from './enemies.js';
import { spawnPickup, dropLoot } from './loot.js';
import { toast } from './ui.js';

export const WILD_IDS = ['bones', 'glass', 'starswamp', 'hive', 'stonesea', 'armory', 'titan', 'ashwinter', 'uprain', 'salt'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2);
const hiddenM = new THREE.Matrix4().makeScale(0, 0, 0);
const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const v4 = new THREE.Vector3();
const s4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const matCache = {};
const lam = (color, emissive = 0, o = null) => {
  const key = color + '_' + emissive + (o ? JSON.stringify(o) : '');
  return matCache[key] || (matCache[key] = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(emissive), ...(o || {}) }));
};
const basic = (color, k, opacity, add = false) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });

// ------------------------------------------------------------------
// Efeito do piso (chamado pelo groundEffect de biomes.js para os pisos novos)
// ------------------------------------------------------------------
const GE = {
  marrow: { speed: 0.85, eSpeed: 0.85 },
  shard: { speed: 0.8, hurt: 0x9af0ff, mult: 1.1 },
  resin: { speed: 0.45, eSpeed: 0.45 },
  vein: { speed: 0.95 },
  veinHot: { speed: 0.95, hurt: 0xff3a5a, mult: 1.5 },
  ember: { speed: 0.95, hurt: 0xff6a1a, mult: 1.4 },
  grav: { speed: 1.3, eSpeed: 1.25 },
  tide: { speed: 0.55, eSpeed: 0.55 },
};
export function wildGround(d, f, x, z) {
  switch (f) {
    case FEAT.MARROW:
      return GE.marrow;
    case FEAT.SHARD:
      return GE.shard;
    case FEAT.RESIN:
      return GE.resin;
    case FEAT.VEIN:
      return d.beatOn ? GE.veinHot : GE.vein;
    case FEAT.EMBER:
      return GE.ember;
    case FEAT.GRAV:
      return GE.grav;
    case FEAT.TIDE:
      return (d.tideGe && d.tideGe.get(Math.floor(z) * d.W + Math.floor(x))) || GE.tide;
  }
  return null;
}

// ------------------------------------------------------------------
// Posicionamento (estágio com semente: só usar rr/ri/pick/chance)
// ------------------------------------------------------------------
function forDisc(cx, cz, rad, fn) {
  for (let j = Math.floor(cz - rad); j <= cz + rad; j++) for (let i = Math.floor(cx - rad); i <= cx + rad; i++) if (Math.hypot(i + 0.5 - cx, j + 0.5 - cz) < rad) fn(i, j);
}
// manchas de piso especial nas salas
function blobs(d, h, feat, p, nMin, nMax, rMin, rMax) {
  for (const r of h.rooms) {
    if (!chance(p)) continue;
    for (let k = ri(nMin, nMax); k > 0; k--) {
      const c = randomFloorInRoom(d, r, 1);
      forDisc(c.x, c.z, rr(rMin, rMax), (i, j) => {
        if (!d.feat[j * d.W + i]) h.set(i, j, feat);
      });
    }
  }
}
// pontos soltos nas salas (longe da entrada e da saída)
function spots(d, h, rooms, p, nMin, nMax, fn) {
  for (const r of rooms) {
    if (!chance(p)) continue;
    for (let k = ri(nMin, nMax); k > 0; k--) {
      const pt = randomFloorInRoom(d, r, 1);
      if (h.nearKey(d, pt.x, pt.z, 3.5) || !isWalkable(d, pt.x, pt.z) || d.feat[Math.floor(pt.z) * d.W + Math.floor(pt.x)]) continue;
      fn(pt);
    }
  }
}

export function placeWild(d, theme, f, h) {
  const { rooms } = h;
  switch (f) {
    case 'marrow':
      blobs(d, h, FEAT.MARROW, 0.45, 1, 1, 1.2, 2.1);
      break;
    case 'glassfloor':
      blobs(d, h, FEAT.GLASS, 0.9, 1, 3, 2, 4.5);
      break;
    case 'resin':
      blobs(d, h, FEAT.RESIN, 0.75, 1, 2, 1.5, 3);
      break;
    case 'hiddenembers':
      blobs(d, h, FEAT.EMBER, 0.6, 1, 2, 1, 2.2);
      break;
    case 'shardstorm':
      d.sandstorm = { t: rr(12, 20), on: false, glass: true };
      break;
    case 'craters':
      for (const r of rooms) {
        if (r.w < 6 || r.h < 6 || !chance(0.55)) continue;
        const c = randomFloorInRoom(d, r, 2);
        const rad = rr(2, 3.4);
        let n = 0;
        forDisc(c.x, c.z, rad, (i, j) => {
          if (d.feat[j * d.W + i]) return;
          h.set(i, j, FEAT.GRAV);
          if (d.feat[j * d.W + i] === FEAT.GRAV) n++;
        });
        if (n > 4) d.props.push({ type: 'crater', x: c.x, z: c.z, r: rad });
      }
      break;
    case 'starshards':
      spots(d, h, rooms, 0.55, 1, 2, (pt) => d.props.push({ type: 'starshard', x: pt.x, z: pt.z }));
      break;
    case 'honey':
      d.honey = true;
      break;
    case 'tides':
      for (const r of rooms) {
        if (r.w < 6 || r.h < 6 || !chance(0.6)) continue;
        const pt = randomFloorInRoom(d, r, 2);
        if (h.nearKey(d, pt.x, pt.z, 5)) continue;
        const [dx, dz] = pick(DIRS);
        d.props.push({ type: 'tide', x: pt.x, z: pt.z, r: rr(2.4, 3.6), t: rr(3, 10), state: 'idle', ge: { speed: 0.55, eSpeed: 0.55, push: { x: dx * 2.4, z: dz * 2.4 } } });
      }
      break;
    case 'fossils':
      spots(d, h, d.rooms, 0.5, 1, 2, (pt) => d.props.push({ type: 'fossil', x: pt.x, z: pt.z, rot: rr(0, 6.3), s: rr(0.8, 1.3) }));
      break;
    case 'swordplants':
      spots(d, h, rooms, 0.75, 1, 3, (pt) => d.props.push({ type: 'sword', x: pt.x, z: pt.z, rot: rr(0, 6.3), tilt: rr(-0.25, 0.25) }));
      break;
    case 'shieldflowers':
      d.shieldflowers = true;
      break;
    case 'steelgrass':
      d.grass = 0x9ab0c0;
      break;
    case 'breath':
      d.breath = { t: rr(8, 13), st: 'idle', dx: 1, dz: 0 };
      break;
    case 'heartbeat':
      d.heart = { t: 0 };
      break;
    case 'ashfall':
      d.ashfall = true;
      break;
    case 'gusts':
      d.gust = { t: rr(9, 14), reveal: 0, push: 0, dx: 1, dz: 0 };
      break;
    case 'uprain':
      d.uprain = true;
      break;
    case 'updrafts':
      spots(d, h, rooms, 0.65, 1, 1, (pt) => d.props.push({ type: 'updraft', x: Math.floor(pt.x) + 0.5, z: Math.floor(pt.z) + 0.5, cd: 0 }));
      break;
    case 'skylakes':
      d.skylakes = true;
      break;
  }
}

// Povoamento extra (pilhas de ossos, cristais de sal, sentinelas). Roda dentro do populateFloor (com semente).
export function wildPopulate(d, floor) {
  const th = G.theme;
  if (!th || !WILD_IDS.includes(th.id)) return;
  const rooms = d.rooms.filter((r) => r !== d.rooms[0] && r !== d.exitRoom && !r.safe && !r.arena);
  const spot = (r) => {
    const pt = randomFloorInRoom(d, r, 1);
    if (!isWalkable(d, pt.x, pt.z) || Math.hypot(pt.x - d.exit.x, pt.z - d.exit.z) < 3 || Math.hypot(pt.x - d.start.x, pt.z - d.start.z) < 4) return null;
    return pt;
  };
  for (const r of rooms) {
    if (th.features.includes('bonepiles') && chance(0.6)) {
      for (let k = ri(1, 2); k > 0; k--) {
        const pt = spot(r);
        if (pt) spawnEnemy('bonepile', pt.x, pt.z).model.root.rotation.y = rr(0, 6.3);
      }
    }
    if (th.features.includes('saltcrystals') && chance(0.55)) {
      const pt = spot(r);
      if (pt) {
        const e = spawnEnemy('saltcrystal', pt.x, pt.z);
        // dourado = tesouro; vermelho = um esquecido preso lá dentro
        e.wild = chance(0.55) ? 'loot' : 'ancient';
        e.model.gem.material = glowMat(e.wild === 'loot' ? 0xffd23d : 0xff2244, 2.4);
      }
    }
    if (th.features.includes('sentinels') && chance(0.45)) {
      const pt = spot(r);
      if (pt) spawnEnemy('hivesentinel', pt.x, pt.z, { anomaly: true });
    }
  }
}

// ------------------------------------------------------------------
// Construção (visual)
// ------------------------------------------------------------------
// camada de pisos instanciada que pode ganhar e perder ladrilhos (vidro que racha, resina que queima)
function layer(d, feat, mat, y, extra = 0) {
  const tiles = [];
  if (feat !== null) for (let k = 0; k < d.W * d.H; k++) if (d.feat[k] === feat) tiles.push(k);
  const cap = tiles.length + extra;
  if (!cap) return null;
  const im = new THREE.InstancedMesh(planeGeo, mat, cap);
  im.frustumCulled = false;
  const Lr = { im, idx: new Map(), n: 0, y, cap, mat };
  for (const k of tiles) layerAdd(Lr, d, k);
  im.count = Lr.n;
  return Lr;
}
function layerAdd(Lr, d, k) {
  if (!Lr || Lr.idx.has(k) || Lr.n >= Lr.cap) return;
  Lr.im.setMatrixAt(Lr.n, m4.makeTranslation((k % d.W) + 0.5, Lr.y, Math.floor(k / d.W) + 0.5));
  Lr.idx.set(k, Lr.n++);
  Lr.im.count = Lr.n;
  Lr.im.instanceMatrix.needsUpdate = true;
}
function layerHide(Lr, k) {
  const n = Lr ? Lr.idx.get(k) : undefined;
  if (n === undefined) return;
  Lr.im.setMatrixAt(n, hiddenM);
  Lr.idx.delete(k);
  Lr.im.instanceMatrix.needsUpdate = true;
}

// estilos dos obstáculos instanciados (um InstancedMesh por peça)
const OBST_STYLES = {
  bonetree: () => [
    [merged('w_bt0', (b, a) => {
      a(new THREE.CylinderGeometry(0.14, 0.26, 2.4, 7), 0, 1.2, 0);
      for (const y of [0.6, 1.4, 2.2]) a(new THREE.SphereGeometry(0.22, 7, 5), 0, y, 0, 0, 0, 0, 1, 0.6, 1);
    }), lam(0xe0d6c0, 0x1a1610)],
    [merged('w_bt1', (b, a) => {
      for (let k = 0; k < 3; k++) a(new THREE.TorusGeometry(0.62, 0.06, 5, 12, Math.PI), 0, 2.0, 0, 0, (k * Math.PI) / 3, 0);
    }), lam(0xd0c4a8, 0x140f0a)],
    [merged('w_bt2', (b, a) => {
      for (const sx of [-1, 1]) a(new THREE.SphereGeometry(0.05, 6, 4), sx * 0.09, 2.15, 0.2);
    }), 'glow:0xff4d6a'],
  ],
  charred: () => [
    [merged('w_ch0', (b, a) => {
      a(new THREE.CylinderGeometry(0.09, 0.2, 2.2, 6), 0, 1.1, 0);
      a(new THREE.CylinderGeometry(0.04, 0.07, 0.9, 5), 0.32, 1.55, 0, 0, 0, -0.8);
      a(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 5), -0.28, 1.25, 0, 0, 0, 0.8);
      a(new THREE.CylinderGeometry(0.03, 0.06, 0.7, 5), 0, 1.85, 0.26, 0.8, 0, 0);
      a(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 5), 0, 1.45, -0.22, -0.8, 0, 0);
    }), lam(0x2a2422, 0x0a0504)],
    [merged('w_ch1', (b, a) => {
      for (const [x, y, z] of [[0.64, 1.86, 0], [-0.57, 1.54, 0], [0, 2.1, 0.52], [0, 1.66, -0.43], [0, 2.22, 0]]) a(new THREE.SphereGeometry(0.05, 6, 4), x, y, z);
    }), 'glow:0xff6a1a'],
  ],
  rib: () => [
    [merged('w_rib0', (b, a) => {
      a(new THREE.TorusGeometry(0.42, 0.1, 6, 14, Math.PI), 0, 0, 0, 0, 0, 0, 1, 3.2, 1);
      a(new THREE.TorusGeometry(0.34, 0.08, 6, 14, Math.PI), 0, 0, 0.32, 0, 0, 0, 1, 2.6, 1);
      a(new THREE.SphereGeometry(0.15, 7, 5), 0, 1.36, 0);
    }), lam(0xe8dcc4, 0x1a140c)],
  ],
  crystal: () => [
    [merged('w_cr0', (b, a) => {
      a(new THREE.ConeGeometry(0.24, 1.6, 5), 0, 0.8, 0);
      a(new THREE.ConeGeometry(0.17, 1.1, 5), 0.25, 0.5, 0.08, 0, 0, -0.45);
      a(new THREE.ConeGeometry(0.15, 0.9, 5), -0.2, 0.42, -0.12, 0.3, 0, 0.5);
      a(new THREE.ConeGeometry(0.12, 0.7, 5), 0.05, 0.32, 0.26, 0.55, 0, 0);
    }), lam(0xcff4ff, 0x24505a, { transparent: true, opacity: 0.78 })],
    [merged('w_cr1', (b, a) => a(new THREE.OctahedronGeometry(0.13, 0), 0, 0.55, 0)), 'glow:0xff6ad5'],
  ],
  wave: () => [
    [merged('w_wv0', (b, a) => {
      b(0.95, 0.3, 0.95, 0, 0.15, 0);
      a(new THREE.TorusGeometry(0.42, 0.17, 6, 14, Math.PI * 1.4), 0, 0.62, 0, 0, Math.PI / 2, -0.3);
    }), lam(0x7a8692, 0x0a0e12)],
    [merged('w_wv1', (b, a) => {
      for (let k = 0; k < 4; k++) a(new THREE.SphereGeometry(0.09, 6, 4), 0, 0.98 + Math.sin(k) * 0.05, -0.2 + k * 0.13);
    }), lam(0xd8e4ec, 0x1a2228)],
  ],
  wreck: () => [
    [merged('w_wr0', (b, a) => {
      b(0.62, 0.42, 1.45, 0, 0.22, 0, 0, 0, 0.18);
      a(new THREE.ConeGeometry(0.31, 0.5, 4), 0, 0.24, 0.95, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.7);
      a(new THREE.CylinderGeometry(0.04, 0.06, 1.7, 5), 0.06, 1.1, -0.1, 0.12, 0, 0.25);
      b(0.7, 0.04, 0.04, 0.17, 1.55, -0.12, 0, 0, 0.25);
    }), lam(0x6a6258, 0x0a0806)],
    [merged('w_wr1', (b, a) => a(new THREE.SphereGeometry(0.07, 6, 4), 0.27, 1.9, -0.06)), 'glow:0xffd23d'],
  ],
  bladetree: () => [
    [merged('w_bl0', (b, a) => a(new THREE.CylinderGeometry(0.1, 0.2, 1.7, 6), 0, 0.85, 0)), lam(0x4a5260, 0x05070a)],
    [merged('w_bl1', (b, a) => {
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * Math.PI * 2;
        a(new THREE.BoxGeometry(0.05, 1.0, 0.18), Math.cos(an) * 0.3, 2.0, Math.sin(an) * 0.3, 0, -an, -0.55);
      }
      a(new THREE.BoxGeometry(0.05, 0.9, 0.16), 0, 2.4, 0);
    }), lam(0xc8d0e0, 0x101418)],
    [merged('w_bl2', (b, a) => {
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * Math.PI * 2;
        a(new THREE.BoxGeometry(0.02, 0.95, 0.02), Math.cos(an) * 0.34, 2.02, Math.sin(an) * 0.34, 0, -an, -0.55);
      }
    }), 'glow:0xff3a5a'],
  ],
  statue: () => [
    [merged('w_st0', (b, a) => {
      b(0.7, 0.16, 0.7, 0, 0.08, 0);
      a(new THREE.CylinderGeometry(0.2, 0.32, 1.3, 7), 0, 0.81, 0);
      a(new THREE.SphereGeometry(0.17, 8, 6), 0, 1.6, 0.03);
      b(0.1, 0.55, 0.12, 0.27, 1.15, 0.12, -0.9, 0, 0.3);
      b(0.1, 0.55, 0.12, -0.27, 1.1, 0.05, -0.4, 0, -0.2);
    }), lam(0xece8e0, 0x1e1c18)],
    [merged('w_st1', (b, a) => {
      for (const sx of [-1, 1]) a(new THREE.SphereGeometry(0.03, 5, 4), sx * 0.06, 1.63, 0.18);
    }), 'glow:0xff4d6a'],
  ],
};
// estilo do obstáculo (ou null se o biomes.js desenha do jeito antigo)
export function wildObstStyle(p, theme) {
  if (p.kind === FEAT.TREE) return theme.id === 'bones' ? 'bonetree' : theme.id === 'ashwinter' ? 'charred' : null;
  return { [FEAT.BONE]: 'rib', [FEAT.CRYSTAL]: 'crystal', [FEAT.WAVE]: 'wave', [FEAT.WRECK]: 'wreck', [FEAT.BLADETREE]: 'bladetree', [FEAT.STATUE]: 'statue' }[p.kind] || null;
}
function buildObstacles(d, theme, group) {
  const by = {};
  for (const p of d.props) {
    if (p.type !== 'obst') continue;
    const st = wildObstStyle(p, theme);
    if (st) (by[st] || (by[st] = [])).push(p);
  }
  for (const st in by) {
    const list = by[st];
    for (const [geo, mat0] of OBST_STYLES[st]()) {
      const mat = typeof mat0 === 'string' ? glowMat(Number(mat0.slice(5)), 2.4) : mat0;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, n) => {
        q4.setFromAxisAngle(UP, p.rot);
        im.setMatrixAt(n, m4.compose(v4.set(p.x, 0, p.z), q4, s4.set(p.s, p.s, p.s)));
      });
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

export function buildWilds(d, theme, group, B) {
  if (!d.wild) return;
  const W = (B.wild = {});
  const add = (Lr) => {
    if (Lr) group.add(Lr.im);
    return Lr;
  };
  W.marrow = add(layer(d, FEAT.MARROW, basic(0xc02a3a, 0.95, 0.72), 0.02));
  W.glass = add(layer(d, FEAT.GLASS, basic(0x6ad0f0, 1.0, 0.24), 0.02));
  if (W.glass) W.shard = add(layer(d, null, basic(0x9af0ff, 0.95, 0.6, true), 0.025, W.glass.cap));
  W.resin = add(layer(d, FEAT.RESIN, basic(0xffa21a, 0.75, 0.85), 0.022));
  W.vein = add(layer(d, FEAT.VEIN, basic(0xff3a5a, 1.2, 0.85), 0.02));
  W.ember = add(layer(d, FEAT.EMBER, basic(0xff6a1a, 1.6, 0.05, true), 0.02));
  W.grav = add(layer(d, FEAT.GRAV, basic(0x8a4dff, 0.6, 0.28, true), 0.02));
  if (W.ember) W.emberTiles = [...W.ember.idx.keys()];
  if (theme.id === 'starswamp') d.fireflies = 0xc88aff;
  buildObstacles(d, theme, group);

  for (const p of d.props) {
    const g = p.group;
    if (!g) continue;
    switch (p.type) {
      case 'crater': {
        const ring = new THREE.Mesh(ringGeo, basic(0xb36bff, 1.8, 0.7, true));
        ring.scale.setScalar(p.r);
        ring.position.y = 0.04;
        g.add(ring);
        p.ring = ring;
        break;
      }
      case 'starshard': {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat(0xc88aff, 2.8));
        core.position.y = 0.6;
        g.add(core);
        const halo = new THREE.Mesh(discGeo, basic(0xc88aff, 1.4, 0.35, true));
        halo.scale.setScalar(0.7);
        halo.position.y = 0.03;
        g.add(halo);
        p.core = core;
        break;
      }
      case 'tide': {
        const mat = basic(0x2a8ac8, 1, 0);
        const water = new THREE.Mesh(discGeo, mat);
        water.scale.setScalar(p.r);
        water.position.y = 0.05;
        g.add(water);
        const edgeMat = basic(0x3ad8ff, 1.4, 0.18, true);
        const edge = new THREE.Mesh(ringGeo, edgeMat);
        edge.scale.setScalar(p.r);
        edge.position.y = 0.045;
        g.add(edge);
        p.mat = mat;
        p.edgeMat = edgeMat;
        break;
      }
      case 'fossil': {
        const m = new THREE.Mesh(
          merged('w_fos', (b, a) => {
            b(0.08, 0.06, 1.3, 0, 0.03, 0);
            for (let k = 0; k < 5; k++) a(new THREE.TorusGeometry(0.28 - k * 0.03, 0.03, 4, 10, Math.PI), 0, 0.02, -0.45 + k * 0.22, -Math.PI / 2, 0, 0);
            a(new THREE.SphereGeometry(0.16, 7, 5), 0, 0.08, 0.75, 0, 0, 0, 1, 0.6, 1.3);
          }),
          lam(0xd8d0c0, 0x14100c)
        );
        m.rotation.y = p.rot;
        m.scale.setScalar(p.s);
        g.add(m);
        break;
      }
      case 'sword': {
        const s = new THREE.Group();
        s.add(new THREE.Mesh(merged('w_sw0', (b) => {
          b(0.05, 1.0, 0.16, 0, 0.4, 0);
          b(0.42, 0.06, 0.08, 0, 0.92, 0);
          b(0.06, 0.28, 0.06, 0, 1.08, 0);
        }), lam(0xc8d0e0, 0x101418)));
        s.add(new THREE.Mesh(merged('w_sw1', (b) => b(0.02, 0.9, 0.02, 0, 0.42, 0.085)), glowMat(0xff3a5a, 2.4)));
        s.rotation.set(p.tilt, p.rot, p.tilt * 0.7);
        g.add(s);
        const glow = new THREE.Mesh(discGeo, basic(0xff3a5a, 1.2, 0.3, true));
        glow.scale.setScalar(0.55);
        glow.position.y = 0.03;
        g.add(glow);
        break;
      }
      case 'updraft': {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 4.5, 14, 1, true), basic(0x4dd2ff, 1.2, 0.16, true));
        col.material.side = THREE.DoubleSide;
        col.position.y = 2.25;
        g.add(col);
        const base = new THREE.Mesh(ringGeo, basic(0x4dd2ff, 2, 0.8, true));
        base.scale.setScalar(0.8);
        base.position.y = 0.04;
        g.add(base);
        p.col = col;
        break;
      }
    }
  }
  // flores-escudo (Jardim de Armas): discos de metal em hastes
  const floorTiles = [];
  for (let k = 0; k < d.W * d.H; k++) if (d.grid[k] === TILE.FLOOR && !d.feat[k]) floorTiles.push(k);
  if (d.shieldflowers && floorTiles.length) {
    const geo = merged('w_shf', (b, a) => {
      b(0.025, 0.35, 0.025, 0, 0.17, 0);
      a(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 8), 0, 0.38, 0, Math.PI / 2 - 0.3, 0, 0);
    });
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x0a0c10) }), Math.min(320, Math.floor(floorTiles.length / 4)));
    const col = new THREE.Color();
    for (let n = 0; n < im.count; n++) {
      const t = floorTiles[(Math.random() * floorTiles.length) | 0];
      q4.setFromAxisAngle(UP, Math.random() * 6.3);
      im.setMatrixAt(n, m4.compose(v4.set((t % d.W) + Math.random(), 0, Math.floor(t / d.W) + Math.random()), q4, s4.setScalar(0.7 + Math.random() * 0.6)));
      im.setColorAt(n, col.set(Math.random() < 0.25 ? 0xff6a7a : Math.random() < 0.5 ? 0xd8b060 : 0xb8c4d8));
    }
    im.computeBoundingSphere();
    group.add(im);
  }
  // lagos flutuantes (Chuva Invertida): só em cima das paredes, para não tapar a luta
  if (d.skylakes) {
    const walls = [];
    for (let j = 2; j < d.H - 2; j++)
      for (let i = 2; i < d.W - 2; i++) {
        const k = j * d.W + i;
        if (d.grid[k] === TILE.WALL && d.grid[k + 1] === TILE.WALL && d.grid[k - 1] === TILE.WALL && d.grid[k + d.W] === TILE.WALL && d.grid[k - d.W] === TILE.WALL) walls.push(k);
      }
    const n = Math.min(45, Math.floor(walls.length / 25));
    if (n > 0) {
      const lake = new THREE.InstancedMesh(discGeo, basic(0x3ab0ff, 1, 0.55), n);
      const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.01, 1.6, 4).translate(0, -0.8, 0), lam(0x2a5a3a, 0x05140a), n * 3);
      for (let k = 0; k < n; k++) {
        const t = walls[(Math.random() * walls.length) | 0];
        const x = (t % d.W) + 0.5;
        const z = Math.floor(t / d.W) + 0.5;
        const y = 4 + Math.random() * 0.8;
        const r = 0.8 + Math.random() * 0.7;
        lake.setMatrixAt(k, m4.compose(v4.set(x, y, z), q4.identity(), s4.set(r, 1, r)));
        for (let c = 0; c < 3; c++) roots.setMatrixAt(k * 3 + c, m4.makeTranslation(x + (Math.random() - 0.5) * r, y, z + (Math.random() - 0.5) * r));
      }
      lake.computeBoundingSphere();
      roots.computeBoundingSphere();
      group.add(lake, roots);
      W.lake = lake.material;
    }
  }
}

// ------------------------------------------------------------------
// Explosões, mortes e projéteis
// ------------------------------------------------------------------
// explosões racham o vidro, queimam a resina e acordam o deus adormecido
export function wildBlast(x, z, r, byPlayer) {
  const d = G.dungeon;
  if (!d || !d.wild || !d.biome || !d.biome.wild) return;
  const W = d.biome.wild;
  if (W.glass || W.resin) {
    let burned = false;
    forDisc(x, z, r * 0.85, (i, j) => {
      if (i < 0 || j < 0 || i >= d.W || j >= d.H) return;
      const k = j * d.W + i;
      if (d.feat[k] === FEAT.GLASS) shatter(d, W, k);
      else if (d.feat[k] === FEAT.RESIN) burned = burnResin(d, W, k) || burned;
    });
    if (burned) smokeAlarm(d, x, z);
  }
  if (byPlayer && d.awake) awaken(d, 6);
}
function shatter(d, W, k) {
  d.feat[k] = FEAT.SHARD;
  layerHide(W.glass, k);
  layerAdd(W.shard, d, k);
  if (Math.random() < 0.35) burst((k % d.W) + 0.5, 0.15, Math.floor(k / d.W) + 0.5, 0xbff8ff, 3, 3, 0.05, 0.4, { up: 1 });
  if (!d.shardSfx || G.t - d.shardSfx > 0.3) {
    d.shardSfx = G.t;
    sfx.cryo();
  }
}
function burnResin(d, W, k) {
  if (d.feat[k] !== FEAT.RESIN) return false;
  d.feat[k] = 0;
  layerHide(W.resin, k);
  const x = (k % d.W) + 0.5;
  const z = Math.floor(k / d.W) + 0.5;
  burst(x, 0.2, z, 0xff8a1a, 4, 2, 0.07, 0.5, { up: 1.5 });
  for (let n = 0; n < 2; n++) particle(x + rr(-0.3, 0.3), 0.3, z + rr(-0.3, 0.3), rr(-0.2, 0.2), rr(1, 1.8), rr(-0.2, 0.2), 0x6a6460, rr(0.12, 0.2), rr(1.5, 2.5), -0.2, 0.5);
  return true;
}
// a fumaça da resina queimada alerta o enxame em volta
function smokeAlarm(d, x, z) {
  for (const e of G.enemies) if (e.alive && !e.inert && !e.aggro && Math.hypot(e.x - x, e.z - z) < 9) e.aggro = true;
  if (!d.smokeT || G.t - d.smokeT > 4) {
    d.smokeT = G.t;
    floatText(x, 1.6, z, L('FUMAÇA! O ENXAME ACORDOU', 'SMOKE! THE SWARM IS AWAKE'), 'hurt');
  }
}

// morte de inimigos: pilhas de ossos, cristais de sal e o medidor do deus adormecido
export function wildKill(e) {
  const d = G.dungeon;
  if (!d || !d.wild) return;
  const p = G.player;
  if (e.type === 'bonepile') {
    // a medula cura, mas o barulho atrai predadores
    spawnPickup('orb', e.x, e.z, {});
    if (chance(0.5)) spawnPickup('credits', e.x, e.z, { amount: Math.round(rr(3, 7) * (1 + G.floor * 0.5)) });
    floatText(e.x, 1.4, e.z, L('CRAC!', 'CRACK!'), 'hurt');
    ringFx(e.x, e.z, 12, 0xe8dcc4, 0.7, { from: 1, opacity: 0.35 });
    for (const o of G.enemies) if (o.alive && !o.inert && Math.hypot(o.x - e.x, o.z - e.z) < 12) o.aggro = true;
    if (chance(0.45)) {
      for (let t = 0; t < 10; t++) {
        const a = rr(0, Math.PI * 2);
        const x = e.x + Math.cos(a) * rr(7, 10);
        const z = e.z + Math.sin(a) * rr(7, 10);
        if (!isWalkable(d, x, z)) continue;
        const s = spawnEnemy('bonestalker', x, z, { anomaly: true });
        s.aggro = true;
        burst(x, 0.6, z, 0xe8dcc4, 12, 3, 0.06, 0.4);
        break;
      }
    }
    return;
  }
  if (e.type === 'saltcrystal') {
    sfx.cryo();
    burst(e.x, 0.8, e.z, 0xffffff, 24, 5, 0.07, 0.5);
    if (e.wild === 'loot') {
      floatText(e.x, 1.6, e.z, L('TESOURO DE SAL!', 'SALT TREASURE!'), 'info');
      dropLoot(e.x, e.z, { chest: true });
      sfx.rare();
    } else {
      // um esquecido elite acorda do sal
      floatText(e.x, 1.6, e.z, L('UM ESQUECIDO DESPERTOU!', 'A FORGOTTEN ONE AWAKENS!'), 'hurt');
      const s = spawnEnemy('saltwraith', e.x, e.z, { elite: true, anomaly: true });
      s.aggro = true;
      s.stun = 0.8;
      sfx.roar();
    }
    return;
  }
  if (e.decoy) return;
  if (d.awake) awaken(d, 4);
  // fragmento estelar volta para o chão quando a criatura energizada morre
  if (e.starred && p) floatText(e.x, e.height + 0.4, e.z, L('ENERGIA LIBERADA', 'ENERGY RELEASED'), 'info');
}

// projéteis: lentos nas crateras e barrados pelas correntes de chuva (-1 = some)
export function projZone(pr, x, z) {
  const d = G.dungeon;
  const f = featAt(d, x, z);
  if (f === FEAT.GRAV) return 0.45;
  if (pr.from === 'enemy' && d.updrafts) {
    for (const u of d.updrafts) if ((u.x - x) ** 2 + (u.z - z) ** 2 < 0.64) return -1;
  }
  return 1;
}

// reflexo do golem de vidro: uma cópia falsa fica onde ele estava
export function mirrorDecoy(e, x, z) {
  const d = G.dungeon;
  if (!d || e.decoy || featAt(d, x, z) !== FEAT.GLASS) return;
  if (G.enemies.filter((o) => o.alive && o.decoy && o.wildLife > 0).length >= 3) return;
  const c = spawnEnemy(e.type, x, z, { decoy: true });
  c.dmg = 0;
  c.wildLife = 4;
  c.blinkT = 99;
  c.model.root.traverse((o) => {
    if (o.material && o.material.isMeshLambertMaterial) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
    }
  });
}

// sentinela da colmeia terminou o sinal: chegam vespas
export function sentinelCall(e) {
  const d = G.dungeon;
  floatText(e.x, e.height + 0.8, e.z, L('REFORÇOS DO ENXAME!', 'SWARM REINFORCEMENTS!'), 'hurt');
  toast(L('Uma sentinela chamou o enxame. Mate as próximas antes que terminem o sinal!', 'A sentinel called the swarm. Kill the next ones before they finish signaling!'), 'warn', 'sentinel');
  sfx.alarm();
  ringFx(e.x, e.z, 6, 0xffc21a, 0.6, { from: 0.5 });
  for (let n = 0, t = 0; n < 4 && t < 30; t++) {
    const a = rr(0, Math.PI * 2);
    const x = e.x + Math.cos(a) * rr(2.5, 5);
    const z = e.z + Math.sin(a) * rr(2.5, 5);
    if (!isWalkable(d, x, z)) continue;
    const w = spawnEnemy('wasp', x, z, { anomaly: true });
    w.aggro = true;
    burst(x, 1.4, z, 0xffc21a, 10, 3, 0.06, 0.4);
    n++;
  }
}

// ------------------------------------------------------------------
// Atualização
// ------------------------------------------------------------------
let acc = 0;
let tick = 0;
export function updateWilds(dt, p) {
  const d = G.dungeon;
  if (!d || !d.wild || !d.biome || !d.biome.wild) return;
  const W = d.biome.wild;
  const alive = p && p.alive;
  const cx = G.camFocus.x;
  const cz = G.camFocus.z;
  acc += dt;
  tick -= dt;
  const slow = tick <= 0;
  if (slow) tick = 0.25;

  // partículas do ambiente (só perto da câmera)
  if (acc > 0.05) {
    acc = 0;
    if (d.ashfall) for (let k = 0; k < 3; k++) particle(cx + rr(-13, 11), rr(5, 8), cz + rr(-12, 12), rr(0.2, 0.7), rr(-1.6, -0.9), rr(-0.3, 0.3), Math.random() < 0.85 ? pick([0xb8b4b0, 0x8a8684, 0xd8d4d0]) : 0xff6a1a, rr(0.04, 0.08), 5, 0, 0);
    if (d.uprain) for (let k = 0; k < 3; k++) particle(cx + rr(-12, 12), 0.05, cz + rr(-12, 12), 0, rr(7, 11), 0, 0x6ab8ff, 0.035, 0.7, 0, 0);
    if (d.honey && Math.random() < 0.6) particle(cx + rr(-10, 10), rr(3, 4), cz + rr(-10, 10), 0, -0.5, 0, 0xffb21a, 0.06, 1.4, 4, 0);
  }
  if (W.shard) W.shard.mat.opacity = 0.45 + Math.sin(G.t * 4) * 0.15;
  if (W.glass) W.glass.mat.opacity = 0.18 + Math.abs(Math.sin(G.t * 0.7)) * 0.12;
  if (W.grav) W.grav.mat.opacity = 0.22 + Math.sin(G.t * 1.5) * 0.08;
  if (W.marrow) W.marrow.mat.opacity = 0.62 + Math.sin(G.t * 2.2) * 0.1;
  if (W.lake) W.lake.opacity = 0.5 + Math.sin(G.t * 1.2) * 0.08;

  // reflexos falsos somem sozinhos
  for (const e of G.enemies) {
    if (!e.alive || !(e.wildLife > 0)) continue;
    e.wildLife -= dt;
    if (e.wildLife <= 0) killQuiet(e);
  }

  // a cada 0,25s: medula cura, inimigos em chamas queimam a resina
  if (slow) {
    for (const e of G.enemies) {
      if (!e.alive || e.inert || e.decoy) continue;
      const f = featAt(d, e.x, e.z);
      if (f === FEAT.MARROW && e.hp < e.maxHp) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012);
        burst(e.x, 0.4, e.z, 0xff4d6a, 2, 1.2, 0.05, 0.4, { grav: -2 });
      } else if (f === FEAT.RESIN && e.burnT > 0) {
        let burned = false;
        forDisc(e.x, e.z, 1.3, (i, j) => (burned = burnResin(d, W, j * d.W + i) || burned));
        if (burned) smokeAlarm(d, e.x, e.z);
      }
    }
    if (alive && featAt(d, p.x, p.z) === FEAT.MARROW && p.hp < p.stats.maxHp) {
      healPlayer(p.stats.maxHp * 0.005, false);
      burst(p.x, 0.4, p.z, 0xff4d6a, 2, 1.2, 0.05, 0.4, { grav: -2 });
    }
    // faíscas fracas denunciam as brasas escondidas perto do jogador
    if (W.emberTiles && alive) {
      for (let n = 0; n < 4; n++) {
        const k = W.emberTiles[(Math.random() * W.emberTiles.length) | 0];
        const x = (k % d.W) + 0.5;
        const z = Math.floor(k / d.W) + 0.5;
        if (Math.abs(x - p.x) < 9 && Math.abs(z - p.z) < 9) particle(x + rr(-0.4, 0.4), 0.05, z + rr(-0.4, 0.4), 0, rr(0.5, 1), 0, 0xff6a1a, 0.04, 0.6, 0, 0);
      }
    }
  }

  if (d.heart) updateHeart(d, W, dt, p);
  if (d.breath) updateBreath(d, dt, p);
  if (d.awake) {
    d.awake.v = Math.max(0, d.awake.v - dt * 1.5);
    d.awake.cd = Math.max(0, d.awake.cd - dt);
  }
  if (d.gust) updateGust(d, W, dt, p);

  d.updrafts = null;
  for (const pr of d.props) {
    switch (pr.type) {
      case 'crater':
        pr.ring.rotation.y += dt * 0.4;
        pr.ring.material.opacity = 0.45 + Math.sin(G.t * 2 + pr.x) * 0.2;
        break;
      case 'starshard':
        updateStarShard(d, pr, dt, p);
        break;
      case 'tide':
        updateTide(d, pr, dt, p);
        break;
      case 'sword':
        updateSword(pr, dt, p);
        break;
      case 'updraft':
        (d.updrafts || (d.updrafts = [])).push(pr);
        updateUpdraft(d, pr, dt, p);
        break;
    }
  }
}

// ---------------- Pântano: fragmentos estelares ----------------
function updateStarShard(d, pr, dt, p) {
  if (pr.taken) return;
  pr.core.rotation.y += dt * 2;
  pr.core.position.y = 0.6 + Math.sin(G.t * 2.5 + pr.x) * 0.12;
  if (Math.random() < dt * 6) particle(pr.x + rr(-0.3, 0.3), 0.3, pr.z + rr(-0.3, 0.3), 0, rr(0.6, 1.2), 0, 0xc88aff, 0.05, 0.8, 0, 0);
  const take = () => {
    pr.taken = true;
    pr.group.visible = false;
    burst(pr.x, 0.6, pr.z, 0xc88aff, 24, 5, 0.07, 0.5);
  };
  if (p && p.alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.1) {
    take();
    p.buffs.fury = Math.max(p.buffs.fury || 0, 10);
    floatText(p.x, 2.2, p.z, L('FRAGMENTO ESTELAR! FÚRIA', 'STAR FRAGMENT! FURY'), 'info');
    sfx.upgrade();
    return;
  }
  // as criaturas disputam o fragmento: as que chegam primeiro se energizam
  let fed = 0;
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.decoy || e.boss || e.static || e.starred) continue;
    const dist = Math.hypot(e.x - pr.x, e.z - pr.z);
    if (dist < 1.0) {
      e.starred = true;
      e.dmg *= 1.3;
      e.speed *= 1.2;
      e.hp = e.maxHp = e.maxHp * 1.2;
      burst(e.x, 1, e.z, 0xc88aff, 18, 4, 0.07, 0.5);
      floatText(e.x, e.height + 0.5, e.z, L('ENERGIZADO!', 'EMPOWERED!'), 'hurt');
      sfx.zap();
      if (++fed >= 3) break;
    } else if (e.aggro && dist < 6) {
      e.kx += ((pr.x - e.x) / dist) * 7 * dt;
      e.kz += ((pr.z - e.z) / dist) * 7 * dt;
    }
  }
  if (fed) take();
}

// ---------------- Mar Petrificado: a maré volta por alguns segundos ----------------
function updateTide(d, pr, dt, p) {
  const near = p && Math.hypot(p.x - pr.x, p.z - pr.z) < 22;
  pr.t -= dt;
  if (pr.state === 'idle') {
    pr.edgeMat.opacity = 0.14 + Math.sin(G.t * 1.5 + pr.x) * 0.05;
    if (pr.t <= 0 && near) {
      pr.state = 'warn';
      pr.t = 1.4;
      telegraphFx(pr.x, pr.z, pr.r, 1.4, 0x3ad8ff);
      if (p && Math.hypot(p.x - pr.x, p.z - pr.z) < 10) floatText(pr.x, 1.2, pr.z, L('A MARÉ VOLTA!', 'THE TIDE RETURNS!'), 'info');
    } else if (pr.t <= 0) pr.t = rr(2, 4);
  } else if (pr.state === 'warn') {
    pr.edgeMat.opacity = 0.5 + Math.sin(G.t * 12) * 0.3;
    if (pr.t <= 0) {
      pr.state = 'flood';
      pr.t = 5;
      pr.tiles = [];
      if (!d.tideGe) d.tideGe = new Map();
      forDisc(pr.x, pr.z, pr.r, (i, j) => {
        const k = j * d.W + i;
        if (d.grid[k] !== TILE.FLOOR || d.feat[k]) return;
        d.feat[k] = FEAT.TIDE;
        d.tideGe.set(k, pr.ge);
        pr.tiles.push(k);
      });
      burst(pr.x, 0.3, pr.z, 0x3ad8ff, 30, 5, 0.08, 0.6, { up: 1 });
      sfx.cryo();
    }
  } else if (pr.state === 'flood') {
    pr.mat.opacity += (0.7 - pr.mat.opacity) * Math.min(1, dt * 5);
    pr.edgeMat.opacity = 0.5;
    if (Math.random() < dt * 20) {
      const a = rr(0, Math.PI * 2);
      const r = rr(0, pr.r);
      particle(pr.x + Math.cos(a) * r, 0.1, pr.z + Math.sin(a) * r, pr.ge.push.x * 0.6, rr(0.3, 0.8), pr.ge.push.z * 0.6, 0xbfe8ff, 0.05, 0.6, 1, 0);
    }
    if (pr.t <= 0) {
      for (const k of pr.tiles) if (d.feat[k] === FEAT.TIDE) d.feat[k] = 0;
      for (const k of pr.tiles) d.tideGe.delete(k);
      pr.tiles = [];
      pr.state = 'drain';
      pr.t = rr(8, 15);
    }
  } else {
    pr.mat.opacity = Math.max(0, pr.mat.opacity - dt * 0.8);
    if (pr.mat.opacity <= 0) pr.state = 'idle';
  }
}

// ---------------- Jardim de Armas: espadas no chão ----------------
const bladeGeo = new THREE.BoxGeometry(0.05, 0.85, 0.14).translate(0, 0.5, 0);
function updateSword(pr, dt, p) {
  if (pr.taken) return;
  if (p && p.alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.1) {
    pr.taken = true;
    pr.group.visible = false;
    p.buffs.fury = Math.max(p.buffs.fury || 0, 8);
    floatText(p.x, 2.2, p.z, L('ESPADA ROUBADA! FÚRIA', 'SWORD STOLEN! FURY'), 'info');
    burst(pr.x, 0.8, pr.z, 0xff3a5a, 18, 4, 0.06, 0.4);
    sfx.upgrade();
    return;
  }
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.decoy || e.boss || e.static || e.T.fly || e.armed) continue;
    const dist = Math.hypot(e.x - pr.x, e.z - pr.z);
    if (dist < 1.3) {
      // o inimigo arranca a espada do chão
      pr.taken = true;
      pr.group.visible = false;
      e.armed = true;
      e.dmg *= 1.4;
      const blade = new THREE.Mesh(bladeGeo, glowMat(0xff3a5a, 2));
      blade.position.set(0.32, 0.5, 0.15);
      blade.rotation.x = 0.5;
      e.model.root.add(blade);
      burst(e.x, 1, e.z, 0xff3a5a, 16, 4, 0.06, 0.4);
      floatText(e.x, e.height + 0.5, e.z, L('ARMADO!', 'ARMED!'), 'hurt');
      sfx.slash();
      return;
    }
    if (e.aggro && dist < 5) {
      e.kx += ((pr.x - e.x) / dist) * 6 * dt;
      e.kz += ((pr.z - e.z) / dist) * 6 * dt;
    }
  }
}

// ---------------- Chuva Invertida: correntes que lançam para o alto ----------------
function updateUpdraft(d, pr, dt, p) {
  pr.cd = Math.max(0, pr.cd - dt);
  pr.col.rotation.y += dt * 1.5;
  pr.col.material.opacity = 0.12 + Math.sin(G.t * 3 + pr.x) * 0.05 + (pr.cd > 0 ? 0 : 0.06);
  if (Math.random() < dt * 14) particle(pr.x + rr(-0.6, 0.6), 0.1, pr.z + rr(-0.6, 0.6), 0, rr(5, 9), 0, 0x9ae4ff, 0.05, 0.6, 0, 0);
  if (pr.cd > 0) return;
  if (p && p.alive && !p.leap && !p.dash && Math.hypot(p.x - pr.x, p.z - pr.z) < 0.75) {
    // lança o jogador e ele cai com um golpe no inimigo mais próximo
    const t = nearestEnemy(pr.x, pr.z, 9, true);
    let tx = pr.x + Math.sin(p.facing) * 4;
    let tz = pr.z + Math.cos(p.facing) * 4;
    if (t) {
      const dist = Math.hypot(t.x - pr.x, t.z - pr.z) || 1;
      tx = t.x - ((t.x - pr.x) / dist) * 0.6;
      tz = t.z - ((t.z - pr.z) / dist) * 0.6;
      if (!isWalkable(d, tx, tz)) {
        tx = t.x;
        tz = t.z;
      }
    }
    if (!isWalkable(d, tx, tz)) {
      tx = pr.x;
      tz = pr.z;
    }
    p.leap = { sx: p.x, sz: p.z, tx, tz, t: 0, dur: 0.8, mult: 2.0, color: 0x4dd2ff, radius: 2.6 };
    p.invuln = Math.max(p.invuln, 0.8);
    pr.cd = 2.5;
    burst(pr.x, 0.5, pr.z, 0x9ae4ff, 24, 5, 0.07, 0.5, { up: 3 });
    sfx.dash();
    return;
  }
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.boss || e.static || e.T.fly || e.heavy) continue;
    if (Math.hypot(e.x - pr.x, e.z - pr.z) < 0.8) {
      // inimigo arremessado e tonto
      e.stun = Math.max(e.stun, 1.2);
      const a = rr(0, Math.PI * 2);
      e.kx = Math.cos(a) * 7;
      e.kz = Math.sin(a) * 7;
      burst(e.x, 1, e.z, 0x9ae4ff, 14, 4, 0.06, 0.4, { up: 3 });
      pr.cd = 1;
      break;
    }
  }
}

// ---------------- Deus Adormecido: batidas, respiração e despertar ----------------
function updateHeart(d, W, dt, p) {
  const h = d.heart;
  h.t += dt;
  const ph = h.t % 2.4;
  const on = ph < 0.6;
  if (on && !d.beatOn) {
    if (p && p.alive) G.shake = Math.max(G.shake, 0.07);
    if (p && p.alive && featAt(d, p.x, p.z) === FEAT.VEIN) floatText(p.x, 2, p.z, L('TUM-TUM', 'THUMP'), 'hurt');
  }
  d.beatOn = on;
  if (W.vein) {
    const k = on ? 1.6 + Math.sin((ph / 0.6) * Math.PI) * 1.2 : 0.55;
    W.vein.mat.color.setRGB(1, 0.23, 0.35).multiplyScalar(k);
    W.vein.mat.opacity = on ? 0.95 : 0.7;
  }
  if (!d.awake) d.awake = { v: 0, cd: 0, warned: false };
}
function updateBreath(d, dt, p) {
  const b = d.breath;
  b.t -= dt;
  if (b.st === 'idle') {
    if (b.t <= 0) {
      b.st = 'warn';
      b.t = 1.6;
      const a = rr(0, Math.PI * 2);
      b.dx = Math.cos(a);
      b.dz = Math.sin(a);
      if (p && p.alive) floatText(p.x, 2.4, p.z, L('O DEUS INSPIRA...', 'THE GOD INHALES...'), 'info');
      sfx.telegraph();
    }
  } else if (b.st === 'warn') {
    // poeira sendo sugada no sentido contrário (dá a dica da direção)
    if (p && Math.random() < 0.8) particle(p.x + rr(-8, 8), rr(0.3, 1.5), p.z + rr(-8, 8), -b.dx * 4, 0, -b.dz * 4, 0xffc0a8, 0.05, 0.6, 0, 0);
    if (b.t <= 0) {
      b.st = 'blow';
      b.t = 3;
      sfx.roar();
    }
  } else if (b.st === 'blow') {
    const S = 2.8 * dt;
    if (p && p.alive && !p.leap) {
      p.x += b.dx * S;
      p.z += b.dz * S;
      resolveCircle(d, p);
    }
    for (const e of G.enemies) {
      if (!e.alive || e.inert || e.static || e.boss || e.heavy) continue;
      e.x += b.dx * S;
      e.z += b.dz * S;
      resolveCircle(d, e);
    }
    if (p) for (let k = 0; k < 4; k++) particle(p.x - b.dx * 10 + rr(-9, 9), rr(0.2, 2.2), p.z - b.dz * 10 + rr(-9, 9), b.dx * rr(10, 15), 0, b.dz * rr(10, 15), pick([0xffd8c8, 0xffa090]), rr(0.03, 0.06), 1.2, 0, 0);
    if (b.t <= 0) {
      b.st = 'idle';
      b.t = rr(9, 15);
    }
  }
}
function awaken(d, v) {
  const a = d.awake;
  if (a.cd > 0) return;
  a.v += v;
  const p = G.player;
  if (a.v >= 60 && !a.warned && p) {
    a.warned = true;
    floatText(p.x, 2.4, p.z, L('A MONTANHA SE MEXE...', 'THE MOUNTAIN STIRS...'), 'hurt');
  }
  if (a.v < 100 || !p || !p.alive) return;
  // o corpo desperta: anticorpos surgem em volta do jogador
  a.v = 0;
  a.cd = 25;
  a.warned = false;
  toast(L('O deus adormecido sentiu a destruição: anticorpos a caminho!', 'The sleeping god felt the destruction: antibodies incoming!'), 'warn');
  sfx.roar();
  G.shake = Math.max(G.shake, 0.5);
  const n = 3 + Math.min(3, Math.floor(G.floor / 8));
  for (let k = 0, t = 0; k < n && t < 40; t++) {
    const ang = rr(0, Math.PI * 2);
    const x = p.x + Math.cos(ang) * rr(4, 7);
    const z = p.z + Math.sin(ang) * rr(4, 7);
    if (!isWalkable(d, x, z)) continue;
    const e = spawnEnemy('antibody', x, z, { anomaly: true });
    e.aggro = true;
    e.stun = 0.6;
    burst(x, 0.6, z, 0xff8aa0, 14, 3, 0.07, 0.4, { up: 2 });
    k++;
  }
}

// ---------------- Inverno de Cinzas: rajadas revelam e reacendem as brasas ----------------
function updateGust(d, W, dt, p) {
  const g = d.gust;
  g.t -= dt;
  g.reveal = Math.max(0, g.reveal - dt);
  g.push = Math.max(0, g.push - dt);
  if (W.ember) W.ember.mat.opacity = 0.05 + Math.min(1, g.reveal) * 0.6 * (0.8 + Math.sin(G.t * 8) * 0.2);
  if (g.t <= 0 && p && p.alive) {
    g.t = rr(14, 20);
    g.reveal = 5;
    g.push = 1.2;
    const a = rr(0, Math.PI * 2);
    g.dx = Math.cos(a);
    g.dz = Math.sin(a);
    floatText(p.x, 2.4, p.z, L('RAJADA DE VENTO!', 'WIND GUST!'), 'info');
    sfx.dash();
    // reacende algumas brasas perto do jogador
    if (W.emberTiles && W.emberTiles.length) {
      const near = W.emberTiles.filter((k) => Math.hypot((k % d.W) + 0.5 - p.x, Math.floor(k / d.W) + 0.5 - p.z) < 10);
      for (let n = ri(3, 5); n > 0 && near.length; n--) {
        const k = near.splice((Math.random() * near.length) | 0, 1)[0];
        spawnHazard((k % d.W) + 0.5, Math.floor(k / d.W) + 0.5, 0.9, 4, 4 + G.floor * 1.2, { color: 0xff6a1a });
      }
    }
  }
  if (g.push > 0) {
    const S = 2.2 * dt;
    if (p && p.alive && !p.leap) {
      p.x += g.dx * S;
      p.z += g.dz * S;
      resolveCircle(d, p);
    }
    if (p) for (let k = 0; k < 4; k++) particle(p.x - g.dx * 10 + rr(-9, 9), rr(0.2, 2), p.z - g.dz * 10 + rr(-9, 9), g.dx * rr(10, 14), 0, g.dz * rr(10, 14), pick([0xd8d4d0, 0xb8b4b0, 0xff6a1a]), rr(0.03, 0.06), 1.2, 0, 0);
  }
}

