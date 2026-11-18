// Biomas selvagens, terceira leva: Tundra da Aurora, Recife Neon, Fábrica do Relógio, Lago dos Espelhos e Arcade Abandonado
// (mais os 5 da segunda metade, ver o fim do arquivo). wilds.js chama placeWild2 / buildWilds2 / updateWilds2 / wildGround2.
// Segue as mesmas regras do wilds.js: o posicionamento usa só rr/ri/pick/chance (semente), o resto pode usar Math.random.
import * as THREE from 'three';
import { G, TILE } from './state.js';
import { rr, ri, pick, chance } from './utils.js';
import { isWalkable, randomFloorInRoom } from './dungeon.js';
import { damagePlayer } from './combat.js';
import { burst, ringFx, particle, floatText } from './fx.js';
import { sfx } from './audio.js';
import { L } from './i18n.js';
import { glowMat, merged } from './models.js';
import { FEAT, featAt } from './biomes.js';
import { forDisc, blobs, spots, layer, planeGeo, discGeo, ringGeo, lam, basic } from './wilds.js';

export const WILD2_IDS = ['aurora', 'coral', 'clock', 'mirrorlake', 'arcade'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const hsl = new THREE.Color();

// ------------------------------------------------------------------
// Efeito do piso
// ------------------------------------------------------------------
const GE = {
  aurora: { speed: 1.12 },
  mirror: { speed: 1.2, ice: true },
};
export function wildGround2(d, f, x, z) {
  switch (f) {
    case FEAT.AURORA:
      return GE.aurora;
    case FEAT.MIRROR:
      return GE.mirror;
    case FEAT.CURRENT:
      return (d.curGe && d.curGe.get(Math.floor(z) * d.W + Math.floor(x))) || null;
  }
  return null;
}

// ------------------------------------------------------------------
// Posicionamento (estágio com semente)
// ------------------------------------------------------------------
// faixa larga que atravessa a sala de ponta a ponta (levemente sinuosa)
function strip(d, h, r, feat, width, onTile) {
  const horiz = r.w >= r.h;
  const off = ri(-1, 1);
  const wob = rr(0.3, 0.8);
  const ph = rr(0, 6);
  const len = horiz ? r.w : r.h;
  for (let s = 0; s < len; s++) {
    const c = Math.round(Math.sin(s * wob + ph) * 1.2) + off;
    for (let k = 0; k < width; k++) {
      const i = horiz ? r.x + s : Math.floor(r.cx) + c + k;
      const j = horiz ? Math.floor(r.cy) + c + k : r.y + s;
      if (i < 2 || j < 2 || i >= d.W - 2 || j >= d.H - 2 || d.grid[j * d.W + i] !== TILE.FLOOR || d.feat[j * d.W + i]) continue;
      h.set(i, j, feat);
      if (d.feat[j * d.W + i] === feat && onTile) onTile(j * d.W + i);
    }
  }
  return horiz;
}
// obstáculos isolados que nunca fecham a passagem (mesma regra das árvores do biomes.js)
function obstacles(d, h, kind, dens) {
  const { W, H, grid } = d;
  const plazas = d.rooms.filter((r) => r.plaza);
  const ring = d.maze ? 2 : 1;
  for (let j = 3; j < H - 3; j++)
    for (let i = 3; i < W - 3; i++) {
      if (grid[j * W + i] !== TILE.FLOOR || !chance(dens) || h.nearKey(d, i + 0.5, j + 0.5, 3.5)) continue;
      if (plazas.some((r) => i >= r.x && i < r.x + r.w && j >= r.y && j < r.y + r.h)) continue;
      let free = true;
      for (let dy = -ring; dy <= ring && free; dy++) for (let dx = -ring; dx <= ring && free; dx++) if (grid[(j + dy) * W + i + dx] !== TILE.FLOOR || d.feat[(j + dy) * W + i + dx] >= 9) free = false;
      if (!free) continue;
      grid[j * W + i] = TILE.OBST;
      d.feat[j * W + i] = kind;
      d.props.push({ type: 'obst', kind, x: i + 0.5, z: j + 0.5, s: rr(0.8, 1.25), rot: rr(0, Math.PI * 2) });
    }
}

export function placeWild2(d, theme, f, h) {
  const { rooms } = h;
  switch (f) {
    // ---- Tundra da Aurora ----
    case 'auroras':
      for (const r of rooms) if (r.w >= 6 && r.h >= 6 && chance(0.7)) strip(d, h, r, FEAT.AURORA, 2);
      break;
    case 'icespires':
      obstacles(d, h, FEAT.SPIRE, 0.035);
      break;
    // ---- Recife Neon ----
    case 'corals':
      obstacles(d, h, FEAT.CORAL, 0.03);
      break;
    case 'currents':
      d.curGe = new Map();
      for (const r of rooms) {
        if (r.w < 7 || r.h < 7 || !chance(0.6)) continue;
        const [dx, dz] = pick(DIRS);
        const ge = { speed: 1.05, push: { x: dx * 3.4, z: dz * 3.4 } };
        // a faixa corre na direção da correnteza (mesma direção da sala)
        const horiz = r.w >= r.h;
        const dir = horiz ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
        const ge2 = { speed: 1.05, push: { x: dir[0] * 3.4, z: dir[1] * 3.4 } };
        strip(d, h, r, FEAT.CURRENT, 3, (k) => d.curGe.set(k, ge2));
        void ge;
      }
      break;
    case 'bubbles':
      spots(d, h, rooms, 0.75, 1, 3, (pt) => d.props.push({ type: 'bubble', x: pt.x, z: pt.z, t: 0, ph: rr(0, 6) }));
      break;
    // ---- Fábrica do Relógio ----
    case 'cogs':
      obstacles(d, h, FEAT.COG, 0.012);
      break;
    case 'gears':
      for (const r of rooms) {
        if (r.w < 6 || r.h < 6 || !chance(0.65)) continue;
        const pt = randomFloorInRoom(d, r, 3);
        if (h.nearKey(d, pt.x, pt.z, 5) || !isWalkable(d, pt.x, pt.z)) continue;
        d.props.push({ type: 'gear', x: pt.x, z: pt.z, r: rr(2.2, 3.2), dir: chance(0.5) ? 1 : -1, a: rr(0, 6) });
      }
      break;
    case 'clockhands':
      for (const r of rooms) {
        if (r.w < 9 || r.h < 9 || !chance(0.5)) continue;
        const len = Math.min(r.w, r.h) / 2 - 0.8;
        if (h.nearKey(d, r.cx, r.cy, len + 2)) continue;
        d.props.push({ type: 'hand', x: r.cx, z: r.cy, len, a: rr(0, 6.3), dir: chance(0.5) ? 1 : -1, cd: 0 });
      }
      break;
    // ---- Lago dos Espelhos ----
    case 'mirrors':
      blobs(d, h, FEAT.MIRROR, 0.9, 1, 3, 2, 4.2);
      break;
    case 'mirrorshards':
      obstacles(d, h, FEAT.MIRSHARD, 0.03);
      break;
    // ---- Arcade Abandonado ----
    case 'cabinets':
      obstacles(d, h, FEAT.CABINET, 0.03);
      break;
    case 'bumpers':
      spots(d, h, rooms, 0.8, 1, 3, (pt) => d.props.push({ type: 'bumper', x: pt.x, z: pt.z, cd: 0, hit: 0 }));
      break;
  }
}

// ------------------------------------------------------------------
// Obstáculos (instanciados): kind -> estilo
// ------------------------------------------------------------------
// (montado na hora: FEAT ainda não existe quando o módulo carrega)
export const obstStyle2 = (kind) => ({ [FEAT.SPIRE]: 'spire', [FEAT.CORAL]: 'coral', [FEAT.COG]: 'cog', [FEAT.MIRSHARD]: 'mirshard', [FEAT.CABINET]: 'cabinet' })[kind] || null;
export const OBST_STYLES2 = {
  spire: () => [
    [merged('w2_sp0', (b, a) => {
      a(new THREE.ConeGeometry(0.34, 2.6, 5), 0, 1.3, 0);
      a(new THREE.ConeGeometry(0.22, 1.7, 5), 0.4, 0.85, 0.1, 0, 0, -0.25);
      a(new THREE.ConeGeometry(0.2, 1.4, 5), -0.32, 0.7, -0.18, 0.2, 0, 0.3);
    }), lam(0xbfe8ff, 0x1c3a50, { transparent: true, opacity: 0.82 })],
    [merged('w2_sp1', (b, a) => a(new THREE.OctahedronGeometry(0.13, 0), 0, 1.1, 0)), 'glow:0x5affc8'],
  ],
  coral: () => [
    [merged('w2_co0', (b, a) => {
      for (let k = 0; k < 5; k++) {
        const an = (k / 5) * Math.PI * 2;
        a(new THREE.CylinderGeometry(0.05, 0.11, 1.0 + (k % 2) * 0.35, 5), Math.cos(an) * 0.22, 0.55, Math.sin(an) * 0.22, Math.sin(an) * 0.4, 0, -Math.cos(an) * 0.4);
      }
      a(new THREE.CylinderGeometry(0.16, 0.28, 0.3, 7), 0, 0.15, 0);
    }), lam(0xff6a8a, 0x3a0a1a)],
    [merged('w2_co1', (b, a) => {
      for (let k = 0; k < 5; k++) {
        const an = (k / 5) * Math.PI * 2;
        a(new THREE.SphereGeometry(0.085, 6, 4), Math.cos(an) * 0.42, 1.08 + (k % 2) * 0.35, Math.sin(an) * 0.42);
      }
    }), 'glow:0x3affd8'],
  ],
  cog: () => [
    [merged('w2_cg0', (b, a) => {
      a(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 14), 0, 1.0, 0, Math.PI / 2, 0, 0);
      for (let k = 0; k < 12; k++) {
        const an = (k / 12) * Math.PI * 2;
        b(0.24, 0.24, 0.2, Math.cos(an) * 0.98, 1.0 + Math.sin(an) * 0.98, 0, 0, 0, an);
      }
      b(0.14, 1.0, 0.14, 0, 0.5, 0);
    }), lam(0xb08a3a, 0x1a1204)],
    [merged('w2_cg1', (b, a) => a(new THREE.SphereGeometry(0.17, 7, 5), 0, 1.0, 0.13)), 'glow:0xffb84a'],
  ],
  mirshard: () => [
    [merged('w2_mi0', (b) => {
      b(0.85, 1.9, 0.07, 0, 0.98, 0, 0.06, 0, 0.1);
      b(0.55, 1.3, 0.06, 0.6, 0.65, 0.14, 0.05, 0.5, -0.12);
    }), lam(0xdff0ff, 0x4a6a8a)],
    [merged('w2_mi1', (b) => {
      b(0.04, 1.9, 0.09, -0.43, 0.98, 0, 0.06, 0, 0.1);
      b(0.04, 1.9, 0.09, 0.43, 0.98, 0, 0.06, 0, 0.1);
      b(0.9, 0.04, 0.09, 0, 1.92, 0, 0.06, 0, 0.1);
    }), 'glow:0x8ad8ff'],
  ],
  cabinet: () => [
    [merged('w2_cb0', (b, a) => {
      b(0.8, 1.6, 0.7, 0, 0.8, 0);
      b(0.7, 0.12, 0.5, 0, 0.9, 0.5, -0.3, 0, 0);
      a(new THREE.SphereGeometry(0.07, 6, 4), -0.15, 1.04, 0.5);
    }), lam(0x2a2040, 0x0a0614)],
    [merged('w2_cb1', (b) => {
      b(0.56, 0.42, 0.04, 0, 1.3, 0.36, -0.12, 0, 0);
    }), 'glow:0x00f0ff'],
    [merged('w2_cb2', (b) => {
      b(0.78, 0.18, 0.08, 0, 1.68, 0.3);
    }), 'glow:0xff2bd6'],
  ],
};

// ------------------------------------------------------------------
// Construção (visual)
// ------------------------------------------------------------------
const gearTeeth = (n, r) => merged('w2_gear' + n, (b, a) => {
  a(new THREE.CylinderGeometry(r, r, 0.12, 20), 0, 0.12, 0);
  for (let k = 0; k < n; k++) {
    const an = (k / n) * Math.PI * 2;
    b(0.34, 0.12, 0.3, Math.cos(an) * (r + 0.1), 0.12, Math.sin(an) * (r + 0.1), 0, -an, 0);
  }
  a(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8), 0, 0.2, 0);
});
const bubbleGeo = new THREE.SphereGeometry(0.4, 12, 9);

export function buildWilds2(d, theme, group, B, W) {
  const add = (Lr) => {
    if (Lr) group.add(Lr.im);
    return Lr;
  };
  W.aurora = add(layer(d, FEAT.AURORA, basic(0x5affc8, 1.3, 0.34, true), 0.024));
  W.mirror = add(layer(d, FEAT.MIRROR, basic(0xcfeaff, 1.1, 0.3, true), 0.024));
  W.current = add(layer(d, FEAT.CURRENT, basic(0x3ad8ff, 1.3, 0.34, true), 0.022));

  for (const p of d.props) {
    const g = p.group;
    if (!g) continue;
    switch (p.type) {
      case 'bubble': {
        const m = new THREE.Mesh(bubbleGeo, basic(0x8af0ff, 1.2, 0.3, true));
        m.position.y = 0.7;
        const shine = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), glowMat(0xffffff, 1.6));
        shine.position.set(0.16, 0.9, 0.18);
        const base = new THREE.Mesh(ringGeo, basic(0x8af0ff, 1.6, 0.6, true));
        base.scale.setScalar(0.6);
        base.position.y = 0.03;
        g.add(m, shine, base);
        p.mesh = m;
        p.shine = shine;
        break;
      }
      case 'gear': {
        const teeth = Math.round(p.r * 4.2);
        const gm = new THREE.Mesh(gearTeeth(teeth, p.r - 0.2), lam(0xb08a3a, 0x241a06, { transparent: true, opacity: 0.95 }));
        const spokes = new THREE.Mesh(merged('w2_spoke', (b) => { for (let k = 0; k < 3; k++) b(2, 0.05, 0.14, 0, 0.19, 0, 0, (k * Math.PI) / 3, 0); }), glowMat(0xffb84a, 1.6));
        spokes.scale.set(p.r * 0.46, 1, p.r * 0.46);
        const spin = new THREE.Group();
        spin.add(gm, spokes);
        spin.position.y = 0.02;
        g.add(spin);
        p.spin = spin;
        break;
      }
      case 'hand': {
        const spin = new THREE.Group();
        const bar = new THREE.Mesh(merged('w2_hand', (b, a) => {
          b(1, 0.14, 0.34, 0.5, 0.55, 0);
          a(new THREE.ConeGeometry(0.28, 0.55, 3), 1.02, 0.55, 0, 0, 0, -Math.PI / 2);
          a(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10), 0, 0.55, 0);
        }), lam(0x6a5a3a, 0x120e04));
        bar.scale.x = p.len - 0.5;
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glowMat(0xff5a2a, 2.2));
        tip.position.set(p.len, 0.56, 0);
        spin.add(bar, tip);
        g.add(spin);
        const hub = new THREE.Mesh(discGeo, basic(0xffb84a, 1.2, 0.25, true));
        hub.scale.setScalar(p.len);
        hub.position.y = 0.03;
        g.add(hub);
        p.spin = spin;
        break;
      }
      case 'bumper': {
        const body = new THREE.Mesh(merged('w2_bump', (b, a) => {
          a(new THREE.CylinderGeometry(0.62, 0.7, 0.5, 14), 0, 0.25, 0);
        }), lam(0x2a1a4a, 0x120a28));
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 14), glowMat(pick([0xff2bd6, 0x00f0ff, 0xffd23d]), 2));
        cap.position.y = 0.55;
        const ring = new THREE.Mesh(ringGeo, basic(0xff2bd6, 1.8, 0.7, true));
        ring.scale.setScalar(0.95);
        ring.position.y = 0.04;
        g.add(body, cap, ring);
        p.cap = cap;
        p.ring = ring;
        break;
      }
    }
  }
}

// ------------------------------------------------------------------
// Atualização
// ------------------------------------------------------------------
let acc = 0;
let acc2 = 0;
const nearCam = (x, z, r) => Math.abs(x - G.camFocus.x) < r && Math.abs(z - G.camFocus.z) < r;
const dmgBase = (p) => p.stats.maxHp * 0.08 + G.floor * 1.5;

export function updateWilds2(d, dt, p, W) {
  const alive = p && p.alive;
  const id = G.theme && G.theme.id;
  const cx = G.camFocus.x;
  const cz = G.camFocus.z;
  acc += dt;
  acc2 += dt;
  const fp = alive ? featAt(d, p.x, p.z) : 0;

  // partículas do ambiente
  if (acc > 0.06) {
    acc = 0;
    if (id === 'aurora') {
      for (let k = 0; k < 2; k++) particle(cx + rr(-13, 13), rr(0.3, 1.2), cz + rr(-12, 12), rr(-0.2, 0.2), rr(0.5, 1.2), rr(-0.2, 0.2), hsl.setHSL(((G.t * 0.08 + Math.random() * 0.25) % 1) * 0.35 + 0.35, 1, 0.65).getHex(), 0.05, 2.2, 0, 0);
    } else if (id === 'coral') {
      for (let k = 0; k < 2; k++) particle(cx + rr(-13, 13), rr(0.1, 0.6), cz + rr(-12, 12), 0, rr(0.8, 1.6), 0, 0xbff4ff, rr(0.03, 0.07), rr(1.6, 2.6), 0, 0);
    } else if (id === 'clock') {
      if (Math.random() < 0.5) particle(cx + rr(-13, 13), rr(0.2, 2), cz + rr(-12, 12), rr(-0.2, 0.2), rr(0.1, 0.5), rr(-0.2, 0.2), 0xffb84a, 0.04, 1.4, 0, 0);
    } else if (id === 'mirrorlake') {
      if (W.mirror && Math.random() < 0.7) {
        const k = [...W.mirror.idx.keys()][(Math.random() * W.mirror.idx.size) | 0];
        if (k !== undefined) {
          const x = (k % d.W) + Math.random();
          const z = Math.floor(k / d.W) + Math.random();
          if (nearCam(x, z, 12)) particle(x, 0.06, z, 0, rr(0.3, 0.8), 0, 0xffffff, 0.05, 0.7, 0, 0);
        }
      }
    } else if (id === 'arcade') {
      for (let k = 0; k < 2; k++) particle(cx + rr(-13, 13), rr(2, 4), cz + rr(-12, 12), 0, rr(-1.2, -0.6), 0, pick([0xff2bd6, 0x00f0ff, 0xffd23d, 0x7affc8]), 0.07, 2, 0, 0);
    }
  }
  // brilho e cor das camadas
  if (W.aurora) {
    W.aurora.mat.color.setHSL(0.38 + Math.sin(G.t * 0.5) * 0.14, 1, 0.5).multiplyScalar(1.3);
    W.aurora.mat.opacity = 0.3 + Math.sin(G.t * 1.7) * 0.08;
  }
  if (W.mirror) W.mirror.mat.opacity = 0.26 + Math.sin(G.t * 1.1) * 0.08;
  if (W.current) W.current.mat.opacity = 0.3 + Math.sin(G.t * 3) * 0.08;

  // Aurora: a faixa de luz protege (25% menos dano) enquanto você estiver nela
  if (fp === FEAT.AURORA) {
    p.guardK = p.buffs.guard > 0 ? Math.min(p.guardK ?? 1, 0.75) : 0.75;
    p.buffs.guard = Math.max(p.buffs.guard || 0, 0.6);
    if (Math.random() < dt * 6) burst(p.x, 0.3, p.z, 0x5affc8, 1, 1, 0.05, 0.5, { grav: -1 });
  }
  // Recife: a correnteza arrasta quem estiver dentro (partículas mostram o sentido)
  if (d.curGe && acc2 > 0.08) {
    for (const [k, ge] of d.curGe) {
      if (Math.random() > 0.012) continue;
      const x = (k % d.W) + Math.random();
      const z = Math.floor(k / d.W) + Math.random();
      if (nearCam(x, z, 12)) particle(x, 0.15, z, ge.push.x * 0.9, 0.2, ge.push.z * 0.9, 0xbff4ff, 0.05, 0.9, 0, 0);
    }
  }
  // Lago dos Espelhos: de vez em quando o reflexo repete o seu golpe e solta uma onda de vidro
  if (id === 'mirrorlake' && alive && fp === FEAT.MIRROR && p.swing > 0.5 && (p.mirrorCd || 0) <= 0) {
    p.mirrorCd = 2.5;
    ringFx(p.x, p.z, 3, 0xcfeaff, 0.4, { from: 0.4 });
    burst(p.x, 0.5, p.z, 0xffffff, 16, 5, 0.06, 0.5, { up: 1 });
    floatText(p.x, 2.1, p.z, L('REFLEXO!', 'REFLECTION!'), 'info');
    for (const e of G.enemies) {
      if (!e.alive || e.inert || e.decoy || Math.hypot(e.x - p.x, e.z - p.z) > 3) continue;
      const l = Math.hypot(e.x - p.x, e.z - p.z) || 1;
      e.kx += ((e.x - p.x) / l) * 7;
      e.kz += ((e.z - p.z) / l) * 7;
      e.hp -= p.stats.wMax * 0.8;
      if (e.hp <= 0) e.hp = 1;
    }
  }
  if (p && p.mirrorCd > 0) p.mirrorCd -= dt;

  for (const pr of d.props) {
    switch (pr.type) {
      case 'bubble': {
        if (!pr.group) break;
        if (pr.t > 0) {
          pr.t -= dt;
          pr.group.visible = pr.t <= 0;
          if (pr.t <= 0) burst(pr.x, 0.6, pr.z, 0x8af0ff, 8, 2, 0.05, 0.5, { up: 1 });
          break;
        }
        pr.mesh.position.y = 0.7 + Math.sin(G.t * 2 + pr.ph) * 0.12;
        pr.shine.position.y = pr.mesh.position.y + 0.2;
        if (alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 1.0) {
          // estoura: impulso de velocidade e um pouco de vida
          pr.t = 14;
          pr.group.visible = false;
          p.buffs.haste = Math.max(p.buffs.haste || 0, 5);
          burst(pr.x, 0.7, pr.z, 0x8af0ff, 22, 5, 0.07, 0.6, { up: 2 });
          ringFx(pr.x, pr.z, 1.8, 0x8af0ff, 0.4);
          floatText(p.x, 2.2, p.z, L('BOLHA! VELOCIDADE', 'BUBBLE! SPEED'), 'info');
          sfx.upgrade();
        }
        break;
      }
      case 'gear': {
        if (!pr.spin) break;
        pr.a += dt * 0.9 * pr.dir;
        pr.spin.rotation.y = -pr.a;
        if (!nearCam(pr.x, pr.z, 16)) break;
        // empurra em círculo quem estiver em cima da engrenagem
        const ent = (o, k) => {
          const dx = o.x - pr.x;
          const dz = o.z - pr.z;
          const l = Math.hypot(dx, dz);
          if (l > pr.r || l < 0.3) return;
          o.kx += (-dz / l) * pr.dir * k * dt;
          o.kz += (dx / l) * pr.dir * k * dt;
        };
        if (alive) ent(p, 30);
        for (const e of G.enemies) if (e.alive && !e.inert && !e.static && !e.T.fly) ent(e, 26);
        break;
      }
      case 'hand': {
        if (!pr.spin) break;
        pr.a += dt * 0.6 * pr.dir;
        pr.spin.rotation.y = -pr.a;
        pr.cd = Math.max(0, pr.cd - dt);
        if (!nearCam(pr.x, pr.z, 16)) break;
        const ca = Math.cos(pr.a);
        const sa = Math.sin(pr.a);
        const hit = (o) => {
          const dx = o.x - pr.x;
          const dz = o.z - pr.z;
          const along = dx * ca + dz * sa;
          const perp = -dx * sa + dz * ca;
          return along > 0.4 && along < pr.len + 0.3 && Math.abs(perp) < 0.55 + o.r * 0.6;
        };
        // o ponteiro varre no sentido dir: a tangente é (-sa, ca) * dir
        if (alive && pr.cd <= 0 && hit(p)) {
          pr.cd = 1.2;
          damagePlayer(dmgBase(p));
          p.kx += -sa * pr.dir * 13;
          p.kz += ca * pr.dir * 13;
          floatText(p.x, 2, p.z, L('TIC-TAC!', 'TICK-TOCK!'), 'hurt');
          sfx.slash();
        }
        for (const e of G.enemies) {
          if (!e.alive || e.inert || e.static || e.T.fly || e.boss || !hit(e)) continue;
          e.kx += -sa * pr.dir * 11;
          e.kz += ca * pr.dir * 11;
        }
        break;
      }
      case 'bumper': {
        if (!pr.group) break;
        pr.cd = Math.max(0, pr.cd - dt);
        pr.hit = Math.max(0, pr.hit - dt * 4);
        pr.cap.scale.setScalar(1 + pr.hit * 0.3);
        pr.ring.material.opacity = 0.5 + pr.hit * 0.5;
        if (pr.cd > 0 || !nearCam(pr.x, pr.z, 16)) break;
        const bump = (o, k) => {
          const dx = o.x - pr.x;
          const dz = o.z - pr.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.75 + o.r) return false;
          const n = l || 1;
          o.kx += (dx / n) * k;
          o.kz += (dz / n) * k;
          return true;
        };
        let any = false;
        if (alive) any = bump(p, 15) || any;
        for (const e of G.enemies) if (e.alive && !e.inert && !e.static && !e.T.fly && !e.boss) any = bump(e, 14) || any;
        if (any) {
          pr.cd = 0.35;
          pr.hit = 1;
          burst(pr.x, 0.6, pr.z, 0xff2bd6, 10, 4, 0.06, 0.4);
          sfx.slash();
        }
        break;
      }
    }
  }
  if (acc2 > 0.08) acc2 = 0;
}
