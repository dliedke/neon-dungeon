// Chefes dos biomas: 10 chefes, um por família de biomas (natureza, esgoto, cristal, gelo, pedra/deserto, tempestade,
// fogo, brinquedos, relógio/biblioteca, água). Todos usam o mesmo motor (updateBoss2) e uma biblioteca de ataques com
// aviso no chão: linhas, círculos, ondas em anel com brechas, rajadas, espirais, investida, mergulho, sopro em cone,
// ponteiros que giram, puxão, rajada de vento, poças e ajudantes do próprio bioma.
// O tipo de cada um fica em ETYPES (enemies.js, ai: 'boss2'), o andar → chefe em BOSS_BY_THEME (enemies.js)
// e o modelo em bossModel2 (chamado por makeEnemyModel).
import * as THREE from 'three';
import { G, gk } from './state.js';
import { L } from './i18n.js';
import { rr, pick } from './utils.js';
import { glowMat } from './models.js';
import { burst, ringFx, telegraphFx, lineTelegraph, beamFx, slashFx } from './fx.js';
import { sfx } from './audio.js';
import { damagePlayer, spawnProjectile, lob, enemyExplosion, spawnHazard, after } from './combat.js';
import { spawnEnemy, pickEnemyType } from './enemies.js';
import { inkPlayer } from './enemies2.js';
import { isWalkable, resolveCircle } from './dungeon.js';
import { toast } from './ui.js';

// ================= modelos =================
const geoCache = {};
const geo = (key, make) => geoCache[key] || (geoCache[key] = make());
const BOX = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const SPH = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 9));
const ICO = (r) => geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0));
const OCT = (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));
const CYL = (a, b, h) => geo(`c${a}_${b}_${h}`, () => new THREE.CylinderGeometry(a, b, h, 9));
const CONE = (r, h) => geo(`k${r}_${h}`, () => new THREE.ConeGeometry(r, h, 8));
const TOR = (r, t) => geo(`t${r}_${t}`, () => new THREE.TorusGeometry(r, t, 6, 28));
const lam = (c, o) => new THREE.MeshLambertMaterial(o ? { color: c, transparent: true, opacity: o } : { color: c });
function put(parent, g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function shell() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  return { root, body };
}

const MODELS = {
  // Colosso de Raízes: tronco, copa, braços de galho, raízes e olhos verdes
  rootcol() {
    const { root, body } = shell();
    const bark = lam(0x5a3e28);
    const leaf = lam(0x2f6a2a);
    const eye = glowMat(0x7dff6a, 2.6);
    put(body, CYL(0.55, 0.8, 2.4), bark, 0, 1.2, 0);
    put(body, ICO(1.25), leaf, 0, 2.9, 0);
    put(body, ICO(0.7), leaf, 0.8, 2.5, 0.3);
    put(body, ICO(0.7), leaf, -0.8, 2.6, -0.2);
    put(body, BOX(0.5, 0.12, 0.08), eye, 0, 1.9, 0.6);
    const arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(s * 0.6, 1.9, 0);
      put(a, CYL(0.15, 0.22, 1.6), bark, s * 0.5, -0.5, 0, 0, 0, s * 0.6);
      put(a, ICO(0.3), leaf, s * 0.95, -1.15, 0);
      body.add(a);
      arms.push(a);
    }
    for (let k = 0; k < 6; k++) {
      const an = (k / 6) * Math.PI * 2;
      put(body, CONE(0.18, 0.9), bark, Math.cos(an) * 0.85, 0.2, Math.sin(an) * 0.85, Math.sin(an) * 1.2, 0, -Math.cos(an) * 1.2);
    }
    for (let k = 0; k < 5; k++) put(body, SPH(0.08), glowMat(0xc8ff6a, 2.2), rr(-0.9, 0.9), rr(2.4, 3.6), rr(-0.8, 0.8));
    return { root, body, arms, mats: [bark, leaf], kind: 'bigboss', anim: (e, m) => m.arms.forEach((a, i) => (a.rotation.x = Math.sin(G.t * 1.6 + i * 2) * 0.25)) };
  },
  // Leviatã do Esgoto: serpente que sai do lodo, cabeça com mandíbula e olhos tóxicos
  leviathan() {
    const { root, body } = shell();
    const skin = lam(0x3c5a34);
    const belly = lam(0x8a9a4a);
    const segs = [];
    for (let k = 0; k < 5; k++) segs.push(put(body, SPH(0.75 - k * 0.08), k % 2 ? belly : skin, 0, 0.5 + k * 0.45, -0.6 + k * 0.25));
    const head = new THREE.Group();
    head.position.set(0, 2.6, 0.7);
    put(head, BOX(1.1, 0.7, 1.2), skin);
    const jaw = put(head, BOX(1.0, 0.25, 1.0), belly, 0, -0.45, 0.1);
    put(head, BOX(0.18, 0.12, 0.08), glowMat(0x9dff3a, 3), 0.32, 0.15, 0.62);
    put(head, BOX(0.18, 0.12, 0.08), glowMat(0x9dff3a, 3), -0.32, 0.15, 0.62);
    for (const s of [-1, 1]) put(head, CONE(0.18, 0.6), belly, s * 0.5, 0.45, -0.2, -0.5, 0, s * 0.4);
    body.add(head);
    return { root, body, head, jaw, segs, mats: [skin, belly], kind: 'bigboss', anim: (e, m) => {
      m.segs.forEach((s, i) => (s.position.x = Math.sin(G.t * 2.2 + i * 0.8) * 0.18));
      m.jaw.position.y = -0.45 - Math.max(0, Math.sin(G.t * 3)) * 0.12;
    } };
  },
  // Golem de Cristal: corpo de cristais, ombros pontudos e núcleo brilhante
  cgolem() {
    const { root, body } = shell();
    const cr = lam(0x6ab8d8, 0.88);
    const dark = lam(0x2a4a60);
    const core = glowMat(0x9fe8ff, 3);
    put(body, OCT(1.0), cr, 0, 1.9, 0, 0, Math.PI / 4, 0).scale.set(1, 1.3, 0.8);
    put(body, ICO(0.35), core, 0, 1.9, 0.45);
    put(body, OCT(0.45), cr, 0, 3.2, 0);
    put(body, BOX(0.4, 0.08, 0.06), core, 0, 3.2, 0.36);
    const arms = [];
    for (const s of [-1, 1]) {
      put(body, OCT(0.6), cr, s * 1.1, 2.5, 0).scale.set(0.8, 1.5, 0.8);
      const a = new THREE.Group();
      a.position.set(s * 1.15, 2.1, 0);
      put(a, BOX(0.45, 1.3, 0.45), dark, 0, -0.6, 0);
      put(a, OCT(0.45), cr, 0, -1.4, 0);
      body.add(a);
      arms.push(a);
      put(body, BOX(0.55, 1.0, 0.55), dark, s * 0.45, 0.5, 0);
    }
    return { root, body, arms, mats: [cr, dark], kind: 'bigboss', anim: (e, m) => m.arms.forEach((a, i) => (a.rotation.x = Math.sin(G.t * 1.8 + i * Math.PI) * 0.3)) };
  },
  // Serpe Glacial: corpo comprido, pescoço, asas finas e olhos azuis
  wyrm() {
    const { root, body } = shell();
    const sc = lam(0xbfe4ff);
    const dk = lam(0x4a6a90);
    put(body, BOX(1.2, 1.0, 2.2), sc, 0, 1.1, -0.2);
    put(body, BOX(0.5, 0.5, 1.2), sc, 0, 1.9, 1.0, -0.7, 0, 0);
    const head = new THREE.Group();
    head.position.set(0, 2.5, 1.6);
    put(head, BOX(0.7, 0.5, 0.9), sc);
    put(head, BOX(0.15, 0.1, 0.06), glowMat(0x7fc8ff, 3), 0.22, 0.1, 0.45);
    put(head, BOX(0.15, 0.1, 0.06), glowMat(0x7fc8ff, 3), -0.22, 0.1, 0.45);
    for (const s of [-1, 1]) put(head, CONE(0.1, 0.6), dk, s * 0.25, 0.4, -0.3, -0.6, 0, 0);
    body.add(head);
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(s * 0.6, 1.6, -0.2);
      put(w, BOX(1.8, 0.06, 1.3), lam(0x8ab8e8, 0.8), s * 0.9, 0, 0);
      body.add(w);
      wings.push(w);
      for (const z of [-0.8, 0.5]) put(body, BOX(0.3, 0.7, 0.3), dk, s * 0.45, 0.35, z);
    }
    put(body, CONE(0.3, 1.4), sc, 0, 1.0, -1.9, -Math.PI / 2, 0, 0);
    return { root, body, wings, mats: [sc, dk], kind: 'bigboss', anim: (e, m) => m.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(G.t * 3) * 0.25))) };
  },
  // Escorpião de Pedra: corpo baixo, 6 patas, pinças e cauda com ferrão brilhante
  stoneking() {
    const { root, body } = shell();
    const st = lam(0x9a8466);
    const dk = lam(0x4a3e30);
    const sting = glowMat(0xffc46a, 3);
    put(body, BOX(1.4, 0.6, 1.8), st, 0, 0.7, 0);
    put(body, BOX(0.9, 0.45, 0.6), dk, 0, 0.8, 1.1);
    put(body, BOX(0.12, 0.08, 0.05), sting, 0.2, 0.95, 1.42);
    put(body, BOX(0.12, 0.08, 0.05), sting, -0.2, 0.95, 1.42);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) put(body, BOX(0.9, 0.12, 0.14), dk, s * 1.05, 0.45, -0.5 + k * 0.5, 0, 0, s * -0.5);
      const claw = new THREE.Group();
      claw.position.set(s * 0.7, 0.8, 1.4);
      put(claw, BOX(0.25, 0.25, 0.8), st, 0, 0, 0.3);
      put(claw, BOX(0.45, 0.3, 0.45), st, 0, 0, 0.85);
      put(claw, CONE(0.12, 0.4), dk, s * 0.12, 0, 1.2, Math.PI / 2, 0, 0);
      body.add(claw);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.9, -0.9);
    for (let k = 0; k < 5; k++) put(tail, BOX(0.35 - k * 0.03, 0.35, 0.35), st, 0, 0.3 + k * 0.38, -0.3 - Math.sin((k / 4) * Math.PI * 0.6) * 0.5);
    put(tail, CONE(0.14, 0.5), sting, 0, 2.3, 0.1, 2.4, 0, 0);
    body.add(tail);
    return { root, body, tail, mats: [st, dk], kind: 'bigboss', anim: (e, m) => (m.tail.rotation.x = Math.sin(G.t * 2.5) * 0.15) };
  },
  // Senhor da Tempestade: manto que flutua, cabeça, anéis elétricos girando
  stormlord() {
    const { root, body } = shell();
    const robe = lam(0x2a2048);
    const dk = lam(0x15102a);
    put(body, CONE(0.85, 2.4), robe, 0, 1.3, 0);
    put(body, SPH(0.4), dk, 0, 2.75, 0);
    put(body, BOX(0.4, 0.08, 0.06), glowMat(0x66f0ff, 3), 0, 2.78, 0.36);
    put(body, CONE(0.45, 0.6), robe, 0, 3.2, 0);
    const rings = [];
    for (let k = 0; k < 3; k++) {
      const r = put(body, TOR(1.1 + k * 0.25, 0.04), glowMat(k % 2 ? 0xb06bff : 0x66f0ff, 2.2), 0, 1.4 + k * 0.5, 0, Math.PI / 2 + rr(-0.4, 0.4), 0, rr(-0.4, 0.4));
      rings.push(r);
    }
    for (const s of [-1, 1]) put(body, BOX(0.2, 1.1, 0.2), robe, s * 0.75, 1.9, 0, 0, 0, s * 0.5);
    body.position.y = 0.3;
    return { root, body, rings, mats: [robe, dk], kind: 'bigboss', float: true };
  },
  // Titã de Magma: pedra escura com rachaduras de lava e boca acesa
  magma() {
    const { root, body } = shell();
    const rock = lam(0x3a2a24);
    const lava = glowMat(0xff6a1a, 2.6);
    put(body, BOX(1.7, 1.5, 1.2), rock, 0, 1.8, 0);
    put(body, BOX(0.9, 0.8, 0.8), rock, 0, 2.95, 0.1);
    put(body, BOX(0.6, 0.12, 0.05), lava, 0, 2.8, 0.52);
    put(body, BOX(0.2, 0.12, 0.05), lava, 0.22, 3.1, 0.52);
    put(body, BOX(0.2, 0.12, 0.05), lava, -0.22, 3.1, 0.52);
    for (let k = 0; k < 6; k++) put(body, BOX(0.08, rr(0.4, 0.9), 0.04), lava, rr(-0.7, 0.7), rr(1.3, 2.3), 0.62, 0, 0, rr(-0.6, 0.6));
    const arms = [];
    for (const s of [-1, 1]) {
      put(body, BOX(0.6, 1.1, 0.6), rock, s * 0.5, 0.55, 0);
      const a = new THREE.Group();
      a.position.set(s * 1.15, 2.3, 0);
      put(a, BOX(0.55, 1.4, 0.55), rock, 0, -0.6, 0);
      put(a, BOX(0.8, 0.7, 0.8), rock, 0, -1.5, 0);
      put(a, BOX(0.3, 0.3, 0.05), lava, 0, -1.5, 0.41);
      body.add(a);
      arms.push(a);
    }
    return { root, body, arms, mats: [rock], kind: 'bigboss', anim: (e, m) => m.arms.forEach((a, i) => (a.rotation.x = Math.sin(G.t * 1.4 + i * Math.PI) * 0.22)) };
  },
  // Rei dos Brinquedos: boneco de corda listrado com coroa e chave girando nas costas
  toyking() {
    const { root, body } = shell();
    const red = lam(0xd83a6a);
    const wh = lam(0xf2e6d8);
    const gold = glowMat(0xffd23d, 2.2);
    for (let k = 0; k < 4; k++) put(body, CYL(0.75, 0.75, 0.4), k % 2 ? wh : red, 0, 0.9 + k * 0.4, 0);
    put(body, SPH(0.55), wh, 0, 2.85, 0);
    put(body, SPH(0.12), glowMat(0xff4fd8, 3), 0.2, 2.9, 0.48);
    put(body, SPH(0.12), glowMat(0xff4fd8, 3), -0.2, 2.9, 0.48);
    put(body, SPH(0.14), lam(0xff3355), 0, 2.75, 0.55);
    put(body, CYL(0.4, 0.45, 0.3), gold, 0, 3.45, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      put(body, CONE(0.09, 0.3), gold, Math.cos(a) * 0.38, 3.7, Math.sin(a) * 0.38);
    }
    const key = new THREE.Group();
    key.position.set(0, 1.7, -0.8);
    put(key, BOX(0.12, 0.12, 0.5), gold, 0, 0, 0.2);
    put(key, BOX(0.9, 0.35, 0.08), gold, 0, 0, -0.1);
    body.add(key);
    for (const s of [-1, 1]) {
      put(body, CYL(0.15, 0.15, 0.7), lam(0x8a8aa0), s * 0.35, 0.35, 0);
      put(body, SPH(0.25), red, s * 0.95, 1.9, 0);
    }
    return { root, body, key, mats: [red, wh], kind: 'bigboss', anim: (e, m, dt) => (m.key.rotation.z += dt * 4) };
  },
  // Relojoeiro: figura alta com mostrador no peito (ponteiros girando), cartola e bengala
  clockmaster() {
    const { root, body } = shell();
    const coat = lam(0x3a2a4a);
    const dk = lam(0x1a1424);
    const brass = lam(0xb08a3a);
    put(body, CYL(0.5, 0.75, 2.0), coat, 0, 1.1, 0);
    put(body, SPH(0.4), lam(0xd8c8b0), 0, 2.5, 0);
    put(body, CYL(0.45, 0.45, 0.12), dk, 0, 2.9, 0);
    put(body, CYL(0.3, 0.3, 0.6), dk, 0, 3.2, 0);
    put(body, BOX(0.32, 0.07, 0.05), glowMat(0xffd23d, 3), 0, 2.55, 0.37);
    const face = new THREE.Group();
    face.position.set(0, 1.55, 0.62);
    put(face, CYL(0.55, 0.55, 0.08), brass, 0, 0, 0, Math.PI / 2, 0, 0);
    put(face, CYL(0.47, 0.47, 0.1), lam(0xf2ead8), 0, 0, 0.01, Math.PI / 2, 0, 0);
    const h1 = new THREE.Group();
    put(h1, BOX(0.05, 0.4, 0.03), glowMat(0xffd23d, 2.6), 0, 0.2, 0.07);
    const h2 = new THREE.Group();
    put(h2, BOX(0.04, 0.28, 0.03), glowMat(0xff4466, 2.6), 0, 0.14, 0.08);
    face.add(h1, h2);
    body.add(face);
    const cane = put(body, BOX(0.07, 2.2, 0.07), brass, 0.8, 1.0, 0.2, 0, 0, -0.1);
    put(body, BOX(0.22, 1.3, 0.22), coat, -0.65, 1.7, 0, 0, 0, 0.3);
    return { root, body, h1, h2, cane, mats: [coat, dk], kind: 'bigboss', anim: (e, m, dt) => {
      m.h1.rotation.z -= dt * 1.2;
      m.h2.rotation.z -= dt * 7;
    } };
  },
  // Kraken Neon: cabeça em domo e tentáculos ondulando com pontos de luz
  kraken() {
    const { root, body } = shell();
    const sk = lam(0x3a3a7a);
    const lt = glowMat(0x3dc7ff, 2.6);
    put(body, SPH(1.0), sk, 0, 2.0, 0).scale.set(1, 1.25, 1);
    put(body, SPH(0.16), glowMat(0xffd23d, 3), 0.35, 1.9, 0.85);
    put(body, SPH(0.16), glowMat(0xffd23d, 3), -0.35, 1.9, 0.85);
    for (let k = 0; k < 6; k++) put(body, SPH(0.08), lt, rr(-0.7, 0.7), rr(2.2, 3), rr(-0.7, 0.4));
    const tents = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const t = new THREE.Group();
      t.position.set(Math.cos(a) * 0.7, 1.0, Math.sin(a) * 0.7);
      t.rotation.y = -a;
      for (let j = 0; j < 4; j++) put(t, CYL(0.2 - j * 0.04, 0.24 - j * 0.04, 0.5), sk, 0.3 + j * 0.4, -0.3 - j * 0.12, 0, 0, 0, 1.2);
      put(t, SPH(0.07), lt, 1.6, -0.75, 0);
      body.add(t);
      tents.push(t);
    }
    return { root, body, tents, mats: [sk], kind: 'bigboss', anim: (e, m) => m.tents.forEach((t, i) => (t.rotation.z = Math.sin(G.t * 2.4 + i) * 0.25)) };
  },
};

export function bossModel2(type) {
  const fn = MODELS[type];
  return fn ? fn() : null;
}

// ================= biblioteca de ataques =================
// Cada ataque prepara o aviso e agenda o golpe (after: tempo do jogo). Devolve quanto tempo o chefe fica parado
// antes de voltar a andar. k: força (1 normal, maior na fase 2 e enfurecido)
const P = () => G.player;
const alive = (e) => e.alive && G.player && G.player.alive;
const hitIn = (x, z, r) => {
  const p = P();
  return p.alive && Math.hypot(p.x - x, p.z - z) < r + p.r;
};
// distância do jogador ao segmento que sai de (x,z) no ângulo a com comprimento len
function segDist(x, z, a, len) {
  const p = P();
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const t = Math.max(0, Math.min(len, (p.x - x) * dx + (p.z - z) * dz));
  return Math.hypot(p.x - (x + dx * t), p.z - (z + dz * t));
}
const toPlayer = (e) => Math.atan2(P().z - e.z, P().x - e.x);
function freeSpot(x, z, spread) {
  for (let k = 0; k < 6; k++) {
    const tx = x + rr(-spread, spread);
    const tz = z + rr(-spread, spread);
    if (isWalkable(G.dungeon, tx, tz)) return { x: tx, z: tz };
  }
  return isWalkable(G.dungeon, x, z) ? { x, z } : null;
}

const A = {
  // linhas que saem do chefe na direção do jogador (raízes, laser da cauda, fendas de lava)
  lines(e, D, n = 3) {
    const base = toPlayer(e);
    const delay = 0.9;
    const len = 12;
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.32;
      lineTelegraph(e.x, e.z, a, len, 1.3, delay, D.color);
      const x = e.x;
      const z = e.z;
      after(delay, () => {
        if (!alive(e)) return;
        for (let s = 1; s < len; s += 1.2) burst(x + Math.cos(a) * s, 0.3, z + Math.sin(a) * s, D.color, 2, 3, 0.08, 0.4, { up: 1.2 });
        if (segDist(x, z, a, len) < 0.65 + P().r) damagePlayer(e.dmg * 1.3);
      });
    }
    sfx.telegraph();
    after(delay, () => alive(e) && sfx.explode());
    return delay + 0.4;
  },
  // círculos no jogador e em volta (meteoros, raios, estalactites, tentáculos, bombas)
  circles(e, D, n = 4, r = 1.5, delay = 1.0, spread = 3.2) {
    const p = P();
    for (let k = 0; k < n; k++) {
      const s = k ? freeSpot(p.x, p.z, spread) : { x: p.x, z: p.z };
      if (!s) continue;
      const d = delay + k * 0.12;
      telegraphFx(s.x, s.z, r, d, D.color);
      after(d, () => {
        if (!alive(e)) return;
        if (D.strike) beamFx(s.x + rr(-0.4, 0.4), 9, s.z + rr(-0.4, 0.4), s.x, 0.2, s.z, D.color, 0.22, 6);
        enemyExplosion(s.x, s.z, r, e.dmg * 1.1, D.color);
        if (D.pool) spawnHazard(s.x, s.z, r * 0.9, 4, e.dmg * 0.5, { color: D.color });
      });
    }
    sfx.telegraph();
    return delay + 0.3;
  },
  // onda em anel saindo do chefe, com brechas para passar (ou pular por cima com avanço/teleporte)
  wave(e, D, gaps = 2) {
    const delay = 0.6;
    telegraphFx(e.x, e.z, 2.2, delay, D.color);
    sfx.telegraph();
    after(delay, () => {
      if (!alive(e)) return;
      const g = [];
      const base = rr(0, Math.PI * 2);
      for (let k = 0; k < gaps; k++) g.push(base + (k / gaps) * Math.PI * 2);
      const w = { x: e.x, z: e.z, r: 1, gaps: g, gw: 0.55, hit: false, mesh: waveMesh(D.color, g, 0.55) };
      w.mesh.position.set(e.x, 0.08, e.z);
      G.world.add(w.mesh);
      (e.b2fx = e.b2fx || []).push(w.mesh);
      (e.waves2 = e.waves2 || []).push(w);
      burst(e.x, 0.3, e.z, D.color, 30, 7, 0.09, 0.5, { up: 0.4 });
      sfx.explode();
      G.shake = Math.max(G.shake, 0.3);
    });
    return delay + 0.5;
  },
  // rajada em leque mirando o jogador
  volley(e, D, n = 5) {
    ringFx(e.x, e.z, e.r + 0.8, D.color, 0.4, { from: e.r });
    sfx.telegraph();
    after(0.4, () => {
      if (!alive(e)) return;
      const base = toPlayer(e);
      for (let k = 0; k < n; k++) shoot(e, D, base + (k - (n - 1) / 2) * 0.17, 9.5);
      sfx.enemyShot();
    });
    return 0.8;
  },
  // espiral de tiros em volta do chefe
  spiral(e, D, steps = 10) {
    ringFx(e.x, e.z, e.r + 1.2, D.color, 0.5, { from: e.r });
    sfx.telegraph();
    const a0 = rr(0, Math.PI * 2);
    for (let s = 0; s < steps; s++) {
      after(0.45 + s * 0.14, () => {
        if (!alive(e)) return;
        for (let k = 0; k < 3; k++) shoot(e, D, a0 + s * 0.38 + (k / 3) * Math.PI * 2, 6.5);
        if (s % 3 === 0) sfx.enemyShot();
      });
    }
    return 0.45 + steps * 0.14 + 0.2;
  },
  // investida em linha reta (com aviso)
  charge(e, D) {
    const a = toPlayer(e);
    e.cdx = Math.cos(a);
    e.cdz = Math.sin(a);
    e.bstate = 'chargeWind';
    e.bt = e.phase2 ? 0.6 : 0.8;
    lineTelegraph(e.x, e.z, a, 11, e.r * 2, e.bt, D.color);
    sfx.telegraph();
    return -1;
  },
  // mergulha no chão e sai embaixo do jogador
  burrow(e) {
    e.bstate = 'burrow';
    e.bt = 1.4;
    e.invulnerable = true;
    e.model.root.visible = false;
    burst(e.x, 0.3, e.z, 0x6a5a40, 30, 5, 0.1, 0.6, { up: 0.6 });
    sfx.dash();
    return -1;
  },
  // sopro em cone na direção do jogador
  cone(e, D) {
    const a = toPlayer(e);
    const delay = 0.8;
    const range = 7;
    const arc = 0.9;
    for (const da of [-arc / 2, 0, arc / 2]) lineTelegraph(e.x, e.z, a + da, range, 0.5, delay, D.color);
    sfx.telegraph();
    e.faceX = Math.cos(a);
    e.faceZ = Math.sin(a);
    after(delay, () => {
      if (!alive(e)) return;
      slashFx(e.x, e.z, a, range, arc, D.color, 0.6);
      for (let s = 1; s < range; s += 0.8) burst(e.x + Math.cos(a) * s, 0.8, e.z + Math.sin(a) * s, D.color, 3, s * 0.4, 0.09, 0.5, { grav: -1 });
      const p = P();
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      let da = Math.atan2(p.z - e.z, p.x - e.x) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (p.alive && d < range + p.r && Math.abs(da) < arc / 2 + 0.1) {
        damagePlayer(e.dmg * 1.3);
        if (D.chill && p.invuln <= 0) p.chillT = Math.max(p.chillT || 0, 2.5);
        if (D.poison && p.invuln <= 0) p.poisonT = 4;
      }
      sfx.explode();
    });
    return delay + 0.4;
  },
  // ponteiros que giram em volta do chefe (fique fora da linha ou passe por ela com avanço)
  sweep(e, D, n = 2) {
    const delay = 1.0;
    const len = 9;
    const a0 = toPlayer(e) + Math.PI / 2;
    for (let k = 0; k < n; k++) lineTelegraph(e.x, e.z, a0 + (k / n) * Math.PI * 2, len, 0.7, delay, D.color);
    sfx.telegraph();
    after(delay, () => {
      if (!alive(e)) return;
      for (let k = 0; k < n; k++) {
        const s = { a: a0 + (k / n) * Math.PI * 2, w: (e.phase2 ? 1.3 : 1) * (k % 2 ? -0.9 : 1.1), len, t: e.phase2 ? 4 : 3.2, tick: 0, mesh: sweepMesh(D.color, len) };
        G.world.add(s.mesh);
        (e.b2fx = e.b2fx || []).push(s.mesh);
        (e.sweeps = e.sweeps || []).push(s);
      }
      sfx.laser();
    });
    return delay + 0.6;
  },
  // puxa o jogador para perto e termina com um golpe em volta
  pull(e, D) {
    e.bstate = 'pull';
    e.bt = 1.7;
    toast(L('Está puxando você: corra para longe!', 'It is pulling you in: run away!'), 'warn', 'b2pull');
    sfx.telegraph();
    return -1;
  },
  // rajada de vento que empurra o jogador e tiros no meio
  gust(e, D) {
    e.bstate = 'gust';
    e.bt = 1.6;
    sfx.telegraph();
    return -1;
  },
  // poças que ferem (lodo, lava, gelo) em volta do jogador
  pools(e, D, n = 3) {
    const p = P();
    for (let k = 0; k < n; k++) {
      const s = freeSpot(p.x, p.z, 4);
      if (!s) continue;
      telegraphFx(s.x, s.z, 1.6, 0.8, D.color);
      lob({ x: e.x, z: e.z, tx: s.x, tz: s.z, time: 0.8, color: D.color, onLand: (x, z) => {
        if (!alive(e)) return;
        enemyExplosion(x, z, 1.4, e.dmg * 0.8, D.color);
        spawnHazard(x, z, 1.6, 6, e.dmg * 0.6, { color: D.color });
      } });
    }
    sfx.enemyShot();
    return 1.0;
  },
  // ajudantes do bioma
  summon(e, D, n = 3) {
    const alive2 = G.enemies.filter((o) => o.alive && !o.boss && !o.inert).length;
    ringFx(e.x, e.z, 2.6, D.color, 0.6);
    for (let k = 0; k < Math.max(0, Math.min(n, 8 - alive2)); k++) {
      const s = freeSpot(e.x, e.z, 2.6);
      if (!s) continue;
      const type = D.minion || pickEnemyType(Math.min(G.floor, 20));
      const m = spawnEnemy(type, s.x, s.z);
      m.aggro = true;
      m.xp = Math.round(m.xp * 0.3);
      burst(s.x, 0.8, s.z, D.color, 12, 3, 0.06, 0.4);
    }
    sfx.boss();
    return 0.8;
  },
  // some e aparece em outro lugar perto do jogador
  blink(e, D) {
    const p = P();
    burst(e.x, 1.2, e.z, D.color, 24, 4, 0.07, 0.5);
    for (let k = 0; k < 8; k++) {
      const a = rr(0, Math.PI * 2);
      const d = rr(4, 6);
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (isWalkable(G.dungeon, x, z)) {
        e.x = x;
        e.z = z;
        break;
      }
    }
    burst(e.x, 1.2, e.z, D.color, 24, 4, 0.07, 0.5);
    sfx.zap();
    return 0.4;
  },
  // tinta: cega a tela e solta bolhas
  ink(e, D) {
    const r = A.volley(e, D, 4);
    after(0.4, () => {
      if (alive(e) && Math.hypot(P().x - e.x, P().z - e.z) < 9) inkPlayer(2.5);
    });
    return r;
  },
};

function shoot(e, D, a, speed) {
  spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * (e.r + 0.3), z: e.z + Math.sin(a) * (e.r + 0.3), y: 1.2, dx: Math.cos(a), dz: Math.sin(a), speed, life: 2.6, dmg: e.dmg * 0.75, color: D.color, size: 0.18, r: 0.2 });
}

// anel com brechas: arcos de RingGeometry (geometria própria, descartada no fim)
function waveMesh(color, gaps, gw) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(1.8)), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const sorted = [...gaps].map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  for (let k = 0; k < sorted.length; k++) {
    const from = sorted[k] + gw;
    const to = (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + Math.PI * 2) - gw;
    if (to <= from) continue;
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 40, 1, from, to - from).rotateX(-Math.PI / 2), mat);
    arc.scale.z = -1; // ângulo no mesmo sentido de atan2(z, x)
    g.add(arc);
  }
  g.userData.mat = mat;
  return g;
}
function sweepMesh(color, len) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(1.8)), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.5).translate(len / 2, 0, 0), mat);
  m.position.y = 0.6;
  return m;
}
function dropMesh(e, m) {
  if (m.parent) m.parent.remove(m);
  m.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  if (m.material) m.material.dispose();
  if (m.userData.mat) m.userData.mat.dispose();
  if (e.b2fx) e.b2fx = e.b2fx.filter((x) => x !== m);
}
// chefe morto ou andar trocado: tira ondas e ponteiros da cena
export function clearBoss2(e) {
  for (const m of e.b2fx || []) dropMesh(e, m);
  e.b2fx = [];
  e.waves2 = [];
  e.sweeps = [];
}

// ================= os chefes =================
// atk: ataques da fase 1; atk2: entram na fase 2 (metade da vida); move: como anda ('walk' ou 'keep' a distância)
const DEFS = {
  rootcol: { color: 0x7dff6a, move: 'walk', atk: ['lines', 'circles', 'summon'], atk2: ['wave', 'pools'], p2: L('O COLOSSO DE RAÍZES ACORDOU A FLORESTA!', 'THE ROOT COLOSSUS AWAKENED THE FOREST!'), poison: true },
  leviathan: { color: 0x9dff3a, move: 'walk', atk: ['burrow', 'cone', 'pools'], atk2: ['volley', 'burrow'], p2: L('O LEVIATÃ ESTÁ FURIOSO NO LODO!', 'THE LEVIATHAN RAGES IN THE SLUDGE!'), poison: true },
  cgolem: { color: 0x9fe8ff, move: 'walk', atk: ['volley', 'circles', 'wave'], atk2: ['spiral', 'sweep'], p2: L('O GOLEM DE CRISTAL RESSOA!', 'THE CRYSTAL GOLEM RESONATES!') },
  wyrm: { color: 0x7fc8ff, move: 'keep', keep: [4, 7], atk: ['cone', 'circles', 'charge'], atk2: ['wave', 'volley'], p2: L('A SERPE GLACIAL SOLTA A NEVASCA!', 'THE GLACIAL WYRM UNLEASHES THE BLIZZARD!'), chill: true },
  stoneking: { color: 0xffc46a, move: 'walk', atk: ['burrow', 'lines', 'charge'], atk2: ['volley', 'summon'], p2: L('O ESCORPIÃO DE PEDRA ESTÁ FURIOSO!', 'THE STONE SCORPION IS ENRAGED!'), poison: true },
  stormlord: { color: 0x66f0ff, move: 'keep', keep: [5, 8], atk: ['circles', 'gust', 'volley'], atk2: ['spiral', 'lines', 'blink'], p2: L('A TEMPESTADE ESTÁ NO AUGE!', 'THE STORM IS AT ITS PEAK!'), strike: true },
  magma: { color: 0xff6a1a, move: 'walk', atk: ['circles', 'wave', 'pools'], atk2: ['lines', 'cone'], p2: L('O TITÃ DE MAGMA ENTROU EM ERUPÇÃO!', 'THE MAGMA TITAN ERUPTS!'), pool: true },
  toyking: { color: 0xff4fd8, move: 'walk', atk: ['summon', 'circles', 'charge'], atk2: ['spiral', 'volley'], p2: L('O REI DOS BRINQUEDOS DEU CORDA DE NOVO!', 'THE TOY KING WOUND HIMSELF UP AGAIN!') },
  clockmaster: { color: 0xffd23d, move: 'keep', keep: [3.5, 6], atk: ['sweep', 'circles', 'blink'], atk2: ['volley', 'wave'], p2: L('O RELOJOEIRO ACELEROU O TEMPO!', 'THE CLOCKMASTER SPED UP TIME!') },
  kraken: { color: 0x3dc7ff, move: 'walk', atk: ['circles', 'pull', 'ink'], atk2: ['lines', 'summon', 'wave'], p2: L('O KRAKEN AGITA O MAR!', 'THE KRAKEN STIRS THE SEA!') },
};
// parâmetros de cada ataque por chefe (os que não estão aqui usam o padrão)
const ARGS = {
  rootcol: { lines: (e) => [e.phase2 ? 5 : 3], circles: () => [4, 1.4, 1.0, 3.2], summon: () => [3], wave: () => [2] },
  cgolem: { circles: () => [5, 1.2, 1.0, 3.5], wave: (e) => [e.phase2 ? 2 : 3], volley: () => [7] },
  wyrm: { circles: () => [5, 1.2, 0.9, 3.8], wave: () => [3] },
  stormlord: { circles: (e) => [e.phase2 ? 7 : 5, 1.1, 0.8, 4.5], lines: () => [4] },
  magma: { circles: () => [5, 1.5, 1.1, 3.5], wave: () => [1], lines: () => [3], pools: () => [3] },
  toyking: { summon: () => [4], circles: () => [5, 1.3, 1.3, 3.5], spiral: () => [12] },
  clockmaster: { sweep: (e) => [e.phase2 ? 3 : 2], circles: () => [4, 1.6, 1.6, 3.5], wave: () => [2] },
  kraken: { circles: () => [6, 1.3, 1.0, 3.2], lines: () => [4], summon: () => [3] },
  leviathan: { pools: () => [4], volley: () => [6] },
  stoneking: { lines: () => [2], volley: () => [5], summon: () => [3] },
};

function toWalk2(e) {
  e.bstate = 'walk';
  e.bt = e.phase2 ? rr(0.5, 0.9) : rr(0.9, 1.4);
}
function choose(e, D) {
  const opts = e.phase2 ? [...D.atk, ...D.atk2] : D.atk;
  let a = pick(opts);
  if (a === e.lastAtk) a = pick(opts);
  e.lastAtk = a;
  return a;
}

export const isBoss2 = (type) => !!DEFS[type];

// IA de todos os chefes dos biomas (chamada pelo switch de IA em enemies.js)
export function updateBoss2(e, dt, dist, ux, uz) {
  const D = DEFS[e.type];
  const p = P();
  const out = { x: 0, z: 0, speed: 0 };
  if (e.bstate !== 'chargeWind' && e.bstate !== 'charge') {
    e.faceX = ux;
    e.faceZ = uz;
  }
  if (!e.phase2 && e.hp < e.maxHp * 0.5 && e.bstate === 'walk') {
    e.phase2 = true;
    e.speed *= 1.15;
    toast(D.p2, 'warn');
    sfx.boss();
    ringFx(e.x, e.z, 5, D.color, 0.6);
    G.shake = Math.max(G.shake, 0.4);
  }
  e.bt -= dt;
  tickWaves(e, dt);
  tickSweeps(e, dt);
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1;
      }
      break;
    case 'walk': {
      // anda até o jogador ('walk') ou mantém distância ('keep')
      if (D.move === 'keep') {
        const [lo, hi] = D.keep;
        const s = dist > hi ? 1 : dist < lo ? -0.8 : 0;
        out.x = ux * s;
        out.z = uz * s;
        out.speed = s ? e.speed : 0;
      } else if (dist > e.r + 1.6) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed;
      }
      if (e.bt <= 0) {
        const a = choose(e, D);
        const args = (ARGS[e.type] && ARGS[e.type][a] && ARGS[e.type][a](e)) || [];
        const t = A[a](e, D, ...args);
        if (t >= 0) {
          e.bstate = 'atk';
          e.bt = t;
        }
      }
      break;
    }
    case 'atk':
      if (e.bt <= 0) toWalk2(e);
      break;
    case 'chargeWind':
      e.faceX = e.cdx;
      e.faceZ = e.cdz;
      if (e.bt <= 0) {
        e.bstate = 'charge';
        e.bt = 0.65;
        e.dashHit = false;
        sfx.dash();
      }
      break;
    case 'charge':
      e.faceX = e.cdx;
      e.faceZ = e.cdz;
      out.x = e.cdx;
      out.z = e.cdz;
      out.speed = 15;
      if (Math.random() < 0.7) burst(e.x, 0.6, e.z, D.color, 2, 1.5, 0.08, 0.35, { grav: 0 });
      if (!e.dashHit && dist < e.r + p.r + 0.3) {
        e.dashHit = true;
        damagePlayer(e.dmg * 1.4);
      }
      if (e.bt <= 0 || !isWalkable(G.dungeon, e.x + e.cdx * (e.r + 0.4), e.z + e.cdz * (e.r + 0.4))) {
        G.shake = Math.max(G.shake, 0.25);
        toWalk2(e);
      }
      break;
    case 'burrow':
      // por baixo da terra segue o jogador; o aviso aparece embaixo dele e trava 0,6s antes de sair
      if (e.bt > 0.6) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed * 2.2;
        if (Math.random() < 0.6) burst(e.x + rr(-0.5, 0.5), 0.15, e.z + rr(-0.5, 0.5), 0x6a5a40, 1, 1.5, 0.08, 0.4, { up: 0.6 });
      } else if (!e.emergeAt) {
        e.emergeAt = { x: p.x, z: p.z };
        telegraphFx(p.x, p.z, 2.3, 0.6, D.color);
        sfx.telegraph();
      }
      if (e.bt <= 0) {
        const s = e.emergeAt || { x: p.x, z: p.z };
        if (isWalkable(G.dungeon, s.x, s.z)) {
          e.x = s.x;
          e.z = s.z;
        }
        e.emergeAt = null;
        e.invulnerable = false;
        e.model.root.visible = true;
        if (hitIn(e.x, e.z, 2.3)) damagePlayer(e.dmg * 1.5);
        burst(e.x, 0.4, e.z, D.color, 36, 7, 0.1, 0.6, { up: 1 });
        burst(e.x, 0.4, e.z, 0x6a5a40, 20, 5, 0.1, 0.6, { up: 1 });
        sfx.explode();
        G.shake = Math.max(G.shake, 0.4);
        if (e.phase2 && e.type === 'leviathan') A.volley(e, D, 8);
        e.bstate = 'atk';
        e.bt = 0.6;
      }
      break;
    case 'pull':
      if (p.alive && dist < 14 && p.invuln <= 0 && !p.dash && !p.leap) {
        p.x -= ux * 3.4 * dt;
        p.z -= uz * 3.4 * dt;
        resolveCircle(G.dungeon, p);
      }
      if (Math.random() < 0.8) {
        const k = Math.random();
        burst(p.x + (e.x - p.x) * k, 0.4, p.z + (e.z - p.z) * k, D.color, 1, 0.5, 0.06, 0.3, { grav: 0 });
      }
      if (e.bt <= 0) {
        telegraphFx(e.x, e.z, 3.2, 0.5, D.color);
        sfx.telegraph();
        after(0.5, () => {
          if (!alive(e)) return;
          if (hitIn(e.x, e.z, 3.2)) damagePlayer(e.dmg * 1.6);
          burst(e.x, 0.4, e.z, D.color, 40, 8, 0.09, 0.6, { up: 0.5 });
          sfx.explode();
          G.shake = Math.max(G.shake, 0.35);
        });
        e.bstate = 'atk';
        e.bt = 0.9;
      }
      break;
    case 'gust':
      // vento para longe do chefe (dá para andar contra ele, devagar) e tiros no meio
      if (p.alive && dist < 13 && p.invuln <= 0) {
        p.x += ux * 3.2 * dt;
        p.z += uz * 3.2 * dt;
        resolveCircle(G.dungeon, p);
      }
      if (Math.random() < 0.9) burst(e.x + ux * rr(1, 8), rr(0.3, 1.6), e.z + uz * rr(1, 8), 0xdff6ff, 1, 4, 0.05, 0.4, { grav: 0 });
      e.gT = (e.gT || 0) - dt;
      if (e.gT <= 0) {
        e.gT = 0.45;
        shoot(e, D, toPlayer(e) + rr(-0.3, 0.3), 8);
        sfx.enemyShot();
      }
      if (e.bt <= 0) toWalk2(e);
      break;
  }
  return out;
}

// ondas em anel: atingem quem está na borda e fora das brechas (pular por cima com avanço/teleporte também livra)
function tickWaves(e, dt) {
  if (!e.waves2 || !e.waves2.length) return;
  const p = P();
  for (const w of e.waves2) {
    w.r += dt * 6;
    w.mesh.scale.set(w.r, 1, w.r);
    w.mesh.userData.mat.opacity = Math.max(0, 0.9 * (1 - w.r / 13));
    if (w.hit || !p.alive) continue;
    const d = Math.hypot(p.x - w.x, p.z - w.z);
    if (Math.abs(d - w.r * 0.975) > 0.45 || p.leap) continue;
    const a = Math.atan2(p.z - w.z, p.x - w.x);
    const inGap = w.gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < w.gw - 0.05);
    if (inGap) continue;
    w.hit = true;
    damagePlayer(e.dmg * 1.2);
  }
  for (const w of e.waves2) if (w.r >= 13) dropMesh(e, w.mesh);
  e.waves2 = e.waves2.filter((w) => w.r < 13);
}

// ponteiros: giram em volta do chefe; quem fica na linha leva dano a cada 0,4s
function tickSweeps(e, dt) {
  if (!e.sweeps || !e.sweeps.length) return;
  const p = P();
  for (const s of e.sweeps) {
    s.t -= dt;
    s.a += s.w * dt;
    s.mesh.position.set(e.x, 0.6, e.z);
    s.mesh.rotation.y = -s.a;
    s.tick -= dt;
    if (s.tick <= 0 && p.alive && segDist(e.x, e.z, s.a, s.len) < 0.4 + p.r) {
      s.tick = 0.4;
      damagePlayer(e.dmg * 0.8);
    }
  }
  for (const s of e.sweeps) if (s.t <= 0) dropMesh(e, s.mesh);
  e.sweeps = e.sweeps.filter((s) => s.t > 0);
}
