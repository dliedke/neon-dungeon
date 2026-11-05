// Poderes avançados das árvores de habilidade: aliados invocados, lâminas orbitais,
// buraco negro, laser orbital, tempestades, dobra temporal, transformações e mais.
import * as THREE from 'three';
import { G, gk } from './state.js';
import { rr, pick, chance } from './utils.js';
import { isWalkable, resolveCircle, lineOfSight } from './dungeon.js';
import { hitEnemy, enemiesInRadius, nearestEnemy, spawnProjectile, explosion, after, healPlayer } from './combat.js';
import { burst, ringFx, beamFx, particle, tempMesh, telegraphFx, slashFx, ghostFx, floatText } from './fx.js';
import { sfx } from './audio.js';
import { humanoid, glowMat, box, addShadow, animWalk } from './models.js';
import { L } from './i18n.js';

export function clearPowers() {
  G.allies = [];
  G.orbiters = [];
  G.warps = [];
  G.lasers = [];
  G.holes = [];
  G.storms = [];
  const p = G.player;
  if (p) {
    if (p.shieldMesh) p.shieldMesh.visible = false;
    endForm(p);
  }
}

const P = () => G.player;
const aimAngle = (p) => Math.atan2(p.aim.dz, p.aim.dx);

// Ponto mirado limitado a um alcance
export function aimPoint(p, max) {
  let dx = p.aimPoint.x - p.x;
  let dz = p.aimPoint.z - p.z;
  const l = Math.hypot(dx, dz);
  if (l > max) {
    dx = (dx / l) * max;
    dz = (dz / l) * max;
  }
  return { x: p.x + dx, z: p.z + dz };
}

function walkableNear(x, z, fx, fz) {
  const d = G.dungeon;
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const px = x + (fx - x) * t;
    const pz = z + (fz - z) * t;
    if (isWalkable(d, px, pz)) return { x: px, z: pz };
  }
  return { x: fx, z: fz };
}

// =====================================================================
// Aliados invocados
// =====================================================================
const ALLY = {
  oni: { speed: 5.2, r: 0.45, range: 1.6, atk: 0.75, mult: 1.6, melee: true, color: 0xff2244 },
  daemon: { speed: 4.6, r: 0.4, range: 7, atk: 0.9, mult: 1.0, melee: false, color: 0x39ff14, fly: true },
  golem: { speed: 3.6, r: 0.7, range: 1.9, atk: 1.2, mult: 2.4, melee: true, color: 0xff8a00, slam: true },
  ifrit: { speed: 5.0, r: 0.45, range: 1.6, atk: 0.6, mult: 1.2, melee: true, color: 0xff6a00, burn: 0.5 },
  wolf: { speed: 7.5, r: 0.38, range: 1.3, atk: 0.55, mult: 0.9, melee: true, color: 0x8ab4ff, slow: 1.5 },
  clone: { speed: 5.4, r: 0.35, range: 9, atk: 0.3, mult: 0.6, melee: false, color: 0x00f0ff },
  tesla: { speed: 0, r: 0.4, range: 6.5, atk: 0.6, mult: 0.7, melee: false, color: 0xffd23d, static: true, chain: 4 },
  hacked: { speed: 3.8, r: 0.4, range: 1.5, atk: 0.8, mult: 1.2, melee: true, color: 0x39ff14 },
};

function allyModel(kind, color) {
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mesh = (g, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  };
  if (kind === 'oni') {
    const m = humanoid({ body: 0x8a1a2a, dark: 0x2a0a10, accent: 0xff2244, scale: 1.2, wide: 1.2 });
    for (const sx of [-1, 1]) {
      const horn = mesh(box(0.06, 0.25, 0.06), glowMat(0xffaa00, 1.8), sx * 0.12, 0.25, 0);
      horn.rotation.z = -sx * 0.4;
      m.head.add(horn);
    }
    const sword = mesh(box(0.05, 0.06, 1.1), glowMat(0xff2244, 2.2), 0, 0, 0.55);
    sword.rotation.x = Math.PI / 2 - 0.3;
    m.handR.add(sword);
    return m;
  }
  if (kind === 'golem') {
    const m = humanoid({ body: 0x6a6070, dark: 0x2a2630, accent: 0xff8a00, scale: 1.6, wide: 1.5 });
    m.handL.add(mesh(box(0.3, 0.3, 0.3), m.mats[1]));
    m.handR.add(mesh(box(0.3, 0.3, 0.3), m.mats[1]));
    return m;
  }
  if (kind === 'ifrit') {
    const m = humanoid({ body: 0xc84a10, dark: 0x601a08, accent: 0xffaa00, scale: 1.15 });
    for (const mt of m.mats) {
      mt.emissive.setRGB(0.5, 0.15, 0);
    }
    m.fireAura = true;
    return m;
  }
  if (kind === 'clone') {
    const m = humanoid({ body: 0x2a8a9a, dark: 0x0a3038, accent: 0x00f0ff });
    for (const mt of m.mats) {
      mt.transparent = true;
      mt.opacity = 0.55;
    }
    const gun = mesh(box(0.08, 0.1, 0.35), glowMat(0x00f0ff, 1.6), 0, 0, 0.15);
    gun.rotation.x = Math.PI / 2;
    m.handR.add(gun);
    return m;
  }
  if (kind === 'wolf') {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mb = lam(0xb8d8ff);
    body.add(mesh(box(0.35, 0.32, 0.8), mb, 0, 0.55, 0));
    const head = mesh(box(0.28, 0.26, 0.34), mb, 0, 0.72, 0.5);
    body.add(head);
    head.add(mesh(box(0.2, 0.05, 0.03), glowMat(0x8ab4ff, 2.4), 0, 0.04, 0.18));
    const legs = [];
    for (const [x, z] of [[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]]) {
      const lg = new THREE.Group();
      lg.position.set(x, 0.42, z);
      lg.add(mesh(box(0.09, 0.42, 0.09), mb, 0, -0.2, 0));
      body.add(lg);
      legs.push(lg);
    }
    body.add(mesh(box(0.06, 0.06, 0.4), glowMat(0x8ab4ff, 1.6), 0, 0.68, -0.55));
    return { root, body, legs, mats: [mb], quad: true };
  }
  if (kind === 'daemon') {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mb = lam(0x2a3a2a);
    body.add(mesh(new THREE.SphereGeometry(0.38, 12, 10), mb, 0, 0, 0));
    for (const sx of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.07, 0.4, 6), glowMat(0x39ff14, 2.2), sx * 0.2, 0.35, 0);
      horn.rotation.z = -sx * 0.5;
      body.add(horn);
      body.add(mesh(box(0.08, 0.05, 0.04), glowMat(0x39ff14, 3), sx * 0.12, 0.05, 0.36));
      const wing = mesh(box(0.6, 0.04, 0.35), glowMat(0x39ff14, 1.2), sx * 0.5, 0.1, -0.1);
      wing.rotation.z = sx * 0.4;
      body.add(wing);
    }
    body.position.y = 1.3;
    return { root, body, mats: [mb], floaty: true };
  }
  if (kind === 'tesla') {
    const root = new THREE.Group();
    const md = lam(0x2a2a30);
    root.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.3, 8), md, 0, 0.15, 0));
    root.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 6), md, 0, 1, 0));
    for (let k = 0; k < 3; k++) root.add(mesh(new THREE.TorusGeometry(0.28 - k * 0.06, 0.04, 6, 16).rotateX(Math.PI / 2), glowMat(0xffd23d, 2), 0, 0.8 + k * 0.35, 0));
    const top = mesh(new THREE.SphereGeometry(0.22, 10, 8), glowMat(0xffd23d, 2.6), 0, 1.85, 0);
    root.add(top);
    return { root, body: root, mats: [md], top };
  }
  return humanoid({ body: 0x444444, dark: 0x222222, accent: color });
}

export function spawnAlly(kind, x, z, o = {}) {
  const A = ALLY[kind];
  const model = o.model || allyModel(kind, A.color);
  if (!o.model) {
    addShadow(model.root, A.r);
    G.world.add(model.root);
  }
  // anel verde: indica que é aliado
  const ring = new THREE.Mesh(new THREE.RingGeometry(A.r + 0.1, A.r + 0.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff88).multiplyScalar(gk(1.4)), transparent: true, opacity: 0.7, depthWrite: false }));
  ring.position.y = 0.04;
  model.root.add(ring);
  model.root.position.set(x, 0, z);
  const a = { kind, ...A, ...o, x, z, model, ring, t: o.dur ?? 15, atkT: rr(0, 0.5), phase: 0, facing: 0 };
  G.allies.push(a);
  burst(x, 0.8, z, A.color, 24, 4, 0.08, 0.5);
  ringFx(x, z, 1.4, A.color, 0.4);
  return a;
}

function removeAlly(a, explode) {
  if (explode) explosion(a.x, a.z, 2.2, a.mult * 0.8, { color: a.color, small: true, noProc: true });
  else burst(a.x, 0.8, a.z, a.color, 20, 3, 0.07, 0.4);
  a.model.root.parent && a.model.root.parent.remove(a.model.root);
}

// Formação: aliados ociosos se alinham lado a lado atrás do jogador (fileiras de 4)
function formationSlots(p) {
  const mob = G.allies.filter((a) => !a.static);
  if (!mob.length) return;
  let cx = 0;
  let cz = 0;
  for (const a of mob) {
    cx += a.x;
    cz += a.z;
  }
  // direção "para frente" = do grupo para o jogador
  let fx = p.x - cx / mob.length;
  let fz = p.z - cz / mob.length;
  const fl = Math.hypot(fx, fz);
  if (fl > 0.3) {
    fx /= fl;
    fz /= fl;
    G.allyDir = { x: fx, z: fz };
  } else ({ x: fx, z: fz } = G.allyDir || { x: 0, z: 1 });
  const rowN = 4;
  mob.forEach((a, k) => {
    const row = Math.floor(k / rowN);
    const inRow = Math.min(rowN, mob.length - row * rowN);
    const side = (k % rowN - (inRow - 1) / 2) * 1.25;
    const back = 2 + row * 1.3;
    a.slotX = p.x - fx * back - fz * side;
    a.slotZ = p.z - fz * back + fx * side;
    a.slotFace = Math.atan2(fx, fz);
  });
}

// Aliados não se sobrepõem (empurrão suave entre pares)
function separateAllies() {
  const arr = G.allies;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i];
      const b = arr[j];
      if (a.static && b.static) continue;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let dist = Math.hypot(dx, dz);
      const min = a.r + b.r + 0.25;
      if (dist >= min) continue;
      if (dist < 1e-4) {
        dx = Math.cos(i + j);
        dz = Math.sin(i + j);
        dist = 1;
      }
      const push = (min - dist) * 0.5;
      const ux = dx / dist;
      const uz = dz / dist;
      // estáticos (bobina) não se mexem; o outro leva o empurrão todo
      const wa = a.static ? 0 : b.static ? 2 : 1;
      const wb = b.static ? 0 : a.static ? 2 : 1;
      a.x -= ux * push * wa;
      a.z -= uz * push * wa;
      b.x += ux * push * wb;
      b.z += uz * push * wb;
    }
  }
}

export function updateAllies(dt) {
  const p = P();
  const d = G.dungeon;
  formationSlots(p);
  separateAllies();
  for (let i = G.allies.length - 1; i >= 0; i--) {
    const a = G.allies[i];
    a.t -= dt;
    a.atkT -= dt;
    if (a.t <= 0) {
      removeAlly(a, a.kind === 'hacked');
      G.allies.splice(i, 1);
      continue;
    }
    const tgt = nearestEnemy(a.x, a.z, a.static ? a.range : 12, true);
    let mvx = 0;
    let mvz = 0;
    if (tgt) {
      const dx = tgt.x - a.x;
      const dz = tgt.z - a.z;
      const dist = Math.hypot(dx, dz);
      a.facing = Math.atan2(dx, dz);
      if (dist > a.range + tgt.r && !a.static) {
        mvx = dx / dist;
        mvz = dz / dist;
      } else if (a.atkT <= 0) {
        a.atkT = a.atk;
        allyAttack(a, tgt);
      }
    } else if (!a.static && p.alive) {
      // vai para o seu lugar na formação ao lado dos outros
      const sx = a.slotX ?? p.x;
      const sz = a.slotZ ?? p.z;
      const dx = sx - a.x;
      const dz = sz - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.3) {
        // desacelera ao chegar para não ficar tremendo em cima do lugar
        const k = Math.min(1, dist / Math.max(0.01, a.speed * dt));
        mvx = (dx / dist) * k;
        mvz = (dz / dist) * k;
        a.facing = Math.atan2(dx, dz);
      } else if (a.slotFace !== undefined) a.facing = a.slotFace;
      if (Math.hypot(p.x - a.x, p.z - a.z) > 16) {
        a.x = sx;
        a.z = sz;
      }
    }
    a.x += mvx * a.speed * dt;
    a.z += mvz * a.speed * dt;
    resolveCircle(d, a);
    const moving = mvx || mvz;
    a.phase += dt * a.speed * 2.5 * (moving ? 1 : 0);
    const m = a.model;
    m.root.position.set(a.x, 0, a.z);
    m.root.rotation.y = a.facing;
    if (m.legL) animWalk(m, a.phase, !!moving);
    if (m.legs && m.quad) m.legs.forEach((l, k) => (l.rotation.x = moving ? Math.sin(a.phase * 1.6 + (k % 2) * Math.PI) * 0.7 : 0));
    if (m.floaty) m.body.position.y = 1.3 + Math.sin(G.t * 3) * 0.12;
    if (m.top) m.top.scale.setScalar(1 + Math.sin(G.t * 12) * 0.1);
    if (m.fireAura && Math.random() < dt * 20) burst(a.x, rr(0.4, 1.6), a.z, pick([0xff6a00, 0xffaa00]), 1, 1, 0.08, 0.5, { grav: -3 });
    if (a.swing > 0 && m.armR) {
      a.swing -= dt * 5;
      m.armR.rotation.x = -2 + (1 - a.swing) * 2.6;
    }
    if (a.t < 1.5) m.root.visible = Math.floor(a.t * 10) % 2 === 0;
  }
}

function allyAttack(a, tgt) {
  if (a.kind === 'tesla') {
    // raio em cadeia saindo da bobina
    const hit = new Set();
    let from = { x: a.x, z: a.z, y: 1.85 };
    let cur = tgt;
    for (let k = 0; k < a.chain && cur; k++) {
      beamFx(from.x, from.y, from.z, cur.x, cur.height * 0.6, cur.z, 0xffd23d, 0.2);
      hitEnemy(cur, a.mult, { noProc: true, stun: 0.2, kx: a.x, kz: a.z });
      hit.add(cur);
      from = { x: cur.x, z: cur.z, y: cur.height * 0.6 };
      cur = nearestEnemy(cur.x, cur.z, 4.5, true, hit);
    }
    sfx.zap();
    return;
  }
  if (a.melee) {
    a.swing = 1;
    if (a.slam) {
      for (const e of enemiesInRadius(a.x, a.z, 2.3)) hitEnemy(e, a.mult, { knock: 4, stun: 0.6, noProc: true, kx: a.x, kz: a.z });
      ringFx(a.x, a.z, 2.3, a.color, 0.3);
      sfx.punchHeavy();
    } else {
      hitEnemy(tgt, a.mult, { knock: 2, noProc: true, kx: a.x, kz: a.z, burn: a.burn, slow: a.slow });
      slashFx(a.x, a.z, Math.atan2(tgt.z - a.z, tgt.x - a.x), 1.6, Math.PI * 0.8, a.color, 0.8);
      sfx.slash();
    }
    return;
  }
  const dx = tgt.x - a.x;
  const dz = tgt.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  spawnProjectile({ from: 'player', x: a.x + (dx / l) * 0.5, z: a.z + (dz / l) * 0.5, y: a.kind === 'daemon' ? 1.3 : 1, dx: dx / l, dz: dz / l, speed: 18, life: 0.8, mult: a.mult, color: a.color, size: a.kind === 'daemon' ? 0.18 : 0.09, r: 0.22, homing: 3, quiet: a.kind === 'clone' });
  if (a.kind === 'daemon') sfx.orb();
}

// =====================================================================
// Lâminas orbitais
// =====================================================================
const orbGeo = new THREE.OctahedronGeometry(0.22, 0);
export function orbitBlades(n, mult, color, dur, o = {}) {
  for (const ob of G.orbiters) ob.mesh.parent && ob.mesh.parent.remove(ob.mesh);
  G.orbiters = [];
  for (let k = 0; k < n; k++) {
    const mesh = new THREE.Mesh(orbGeo, glowMat(color, 2.4));
    mesh.scale.set(0.7, 0.7, 2.2);
    G.world.add(mesh);
    G.orbiters.push({ a: (k / n) * Math.PI * 2, t: dur, mult, color, mesh, cd: new Map(), burn: o.burn, rad: o.radius || 1.9 });
  }
  sfx.deploy();
}

function updateOrbiters(dt) {
  const p = P();
  for (let i = G.orbiters.length - 1; i >= 0; i--) {
    const ob = G.orbiters[i];
    ob.t -= dt;
    ob.a += dt * 4.5;
    const x = p.x + Math.cos(ob.a) * ob.rad;
    const z = p.z + Math.sin(ob.a) * ob.rad;
    ob.mesh.position.set(x, 0.9, z);
    ob.mesh.rotation.y = -ob.a;
    if (Math.random() < 0.5) particle(x, 0.9, z, 0, 0, 0, ob.color, 0.06, 0.25);
    for (const e of enemiesInRadius(x, z, 0.55)) {
      const last = ob.cd.get(e) || 0;
      if (G.t - last < 0.35) continue;
      ob.cd.set(e, G.t);
      hitEnemy(e, ob.mult, { noProc: true, knock: 1.5, kx: p.x, kz: p.z, burn: ob.burn, quiet: true });
    }
    if (ob.t <= 0) {
      ob.mesh.parent && ob.mesh.parent.remove(ob.mesh);
      G.orbiters.splice(i, 1);
    }
  }
}

// =====================================================================
// Raios
// =====================================================================
export function chainLightningFrom(p, jumps, mult, color, range = 7) {
  const first = nearestEnemy(p.x, p.z, range, true);
  if (!first) return false;
  const hit = new Set();
  let from = { x: p.x, y: 1.2, z: p.z };
  let cur = first;
  for (let k = 0; k < jumps && cur; k++) {
    beamFx(from.x, from.y, from.z, cur.x, cur.height * 0.6, cur.z, color, 0.25, 6);
    hitEnemy(cur, mult, { stun: 0.3, noProc: true });
    hit.add(cur);
    from = { x: cur.x, y: cur.height * 0.6, z: cur.z };
    cur = nearestEnemy(cur.x, cur.z, 5, true, hit);
  }
  sfx.zap();
  return true;
}

function skyBolt(x, z, color) {
  beamFx(x + rr(-0.5, 0.5), 9, z + rr(-0.5, 0.5), x, 0.2, z, color, 0.22, 7);
  ringFx(x, z, 1.2, color, 0.25);
  burst(x, 0.3, z, color, 10, 4, 0.06, 0.3);
}

export function lightningStorm(dur, rate, mult, color) {
  G.storms.push({ t: dur, rate, acc: 0, mult, color });
  sfx.zap();
}

function updateStorms(dt) {
  const p = P();
  for (let i = G.storms.length - 1; i >= 0; i--) {
    const s = G.storms[i];
    s.t -= dt;
    s.acc += dt * s.rate;
    while (s.acc >= 1) {
      s.acc--;
      const cands = enemiesInRadius(p.x, p.z, 9).filter((e) => !e.invulnerable && !e.inert);
      if (!cands.length) continue;
      const e = pick(cands);
      skyBolt(e.x, e.z, s.color);
      for (const o of enemiesInRadius(e.x, e.z, 1.3)) hitEnemy(o, s.mult, { stun: 0.4, noProc: true, kx: e.x, kz: e.z, quiet: o !== e });
      sfx.zap();
    }
    if (s.t <= 0) G.storms.splice(i, 1);
  }
}

// =====================================================================
// Dobra temporal: inimigos e tiros inimigos em câmera lenta
// =====================================================================
export function timeWarp(x, z, r, dur, color) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(1.2)), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  mesh.scale.set(r, r * 0.5, r);
  mesh.position.set(x, 0, z);
  G.world.add(mesh);
  G.warps.push({ x, z, r, t: dur, mesh, mat, color });
  ringFx(x, z, r, color, 0.5, { from: 0.5 });
  sfx.nova();
}

// Fator de tempo para quem está dentro de uma dobra temporal (1 = normal)
export function timeFactor(x, z) {
  for (const w of G.warps) if (Math.hypot(x - w.x, z - w.z) < w.r) return 0.25;
  return 1;
}

function updateWarps(dt) {
  for (let i = G.warps.length - 1; i >= 0; i--) {
    const w = G.warps[i];
    w.t -= dt;
    w.mat.opacity = Math.min(0.12, w.t * 0.1) + Math.sin(G.t * 3) * 0.02;
    if (Math.random() < 0.6) {
      const a = rr(0, Math.PI * 2);
      const r = rr(0, w.r);
      particle(w.x + Math.cos(a) * r, rr(0.2, 2), w.z + Math.sin(a) * r, 0, 0.1, 0, w.color, 0.05, 1, 0, 0);
    }
    if (w.t <= 0) {
      w.mesh.parent && w.mesh.parent.remove(w.mesh);
      w.mat.dispose();
      G.warps.splice(i, 1);
    }
  }
}

// =====================================================================
// Laser orbital: feixe do céu que persegue os inimigos
// =====================================================================
export function orbitalLaser(x, z, dur, mult, color) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(2.2)), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 14, 14, 1, true).translate(0, 7, 0), mat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 28).rotateX(-Math.PI / 2), mat);
  ring.position.y = 0.05;
  const g = new THREE.Group();
  g.add(beam, ring);
  g.position.set(x, 0, z);
  G.world.add(g);
  G.lasers.push({ x, z, t: dur, mult, color, g, mat, tick: 0 });
  sfx.laser();
  G.shake = Math.max(G.shake, 0.2);
}

function updateLasers(dt) {
  for (let i = G.lasers.length - 1; i >= 0; i--) {
    const L2 = G.lasers[i];
    L2.t -= dt;
    L2.tick -= dt;
    const tgt = nearestEnemy(L2.x, L2.z, 10, false);
    if (tgt) {
      const dx = tgt.x - L2.x;
      const dz = tgt.z - L2.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.1) {
        L2.x += (dx / l) * Math.min(l, 5.5 * dt);
        L2.z += (dz / l) * Math.min(l, 5.5 * dt);
      }
    }
    L2.g.position.set(L2.x, 0, L2.z);
    L2.g.rotation.y += dt * 4;
    L2.mat.opacity = 0.6 + Math.sin(G.t * 30) * 0.2;
    if (Math.random() < 0.8) burst(L2.x, 0.2, L2.z, L2.color, 2, 4, 0.07, 0.3);
    if (L2.tick <= 0) {
      L2.tick = 0.15;
      for (const e of enemiesInRadius(L2.x, L2.z, 1.4)) hitEnemy(e, L2.mult, { noProc: true, quiet: true, burn: 0.2, kx: L2.x, kz: L2.z });
    }
    if (L2.t <= 0) {
      L2.g.parent && L2.g.parent.remove(L2.g);
      L2.mat.dispose();
      G.lasers.splice(i, 1);
    }
  }
}

// =====================================================================
// Buraco negro: puxa os inimigos e explode
// =====================================================================
export function blackHole(x, z, dur, mult, color) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  core.position.y = 1;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(2)), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.5, 32).rotateX(-Math.PI / 2.4), mat);
  disk.position.y = 1;
  g.add(core, disk);
  g.position.set(x, 0, z);
  G.world.add(g);
  G.holes.push({ x, z, t: dur, dur, mult, color, g, disk, mat, tick: 0 });
  sfx.nova();
}

function updateHoles(dt) {
  for (let i = G.holes.length - 1; i >= 0; i--) {
    const h = G.holes[i];
    h.t -= dt;
    h.tick -= dt;
    h.disk.rotation.z += dt * 6;
    h.g.scale.setScalar(Math.min(1, (h.dur - h.t) * 3) * (1 + Math.sin(G.t * 10) * 0.05));
    for (let k = 0; k < 3; k++) {
      const a = rr(0, Math.PI * 2);
      const r = rr(3, 6);
      particle(h.x + Math.cos(a) * r, rr(0.3, 1.5), h.z + Math.sin(a) * r, -Math.cos(a) * r * 1.5, 0, -Math.sin(a) * r * 1.5, h.color, 0.06, 0.6, 0, 0);
    }
    for (const e of enemiesInRadius(h.x, h.z, 6.5)) {
      if (e.static || e.inert) continue;
      const dx = h.x - e.x;
      const dz = h.z - e.z;
      const l = Math.hypot(dx, dz) || 1;
      const pull = (e.boss ? 1.2 : 5.5) * dt;
      e.x += (dx / l) * Math.min(l, pull);
      e.z += (dz / l) * Math.min(l, pull);
    }
    if (h.tick <= 0) {
      h.tick = 0.3;
      for (const e of enemiesInRadius(h.x, h.z, 2.2)) hitEnemy(e, h.mult * 0.3, { noProc: true, quiet: true, kx: h.x, kz: h.z });
    }
    if (h.t <= 0) {
      explosion(h.x, h.z, 4, h.mult, { color: h.color, knock: 8 });
      h.g.parent && h.g.parent.remove(h.g);
      h.mat.dispose();
      G.holes.splice(i, 1);
    }
  }
}

// =====================================================================
// Efeitos em série
// =====================================================================
export function meteorShower(cx, cz, n, mult, color, o = {}) {
  for (let k = 0; k < n; k++) {
    after(k * (o.gap ?? 0.16), () => {
      const x = cx + rr(-3.2, 3.2);
      const z = cz + rr(-3.2, 3.2);
      telegraphFx(x, z, 1.6, 0.7, color);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), glowMat(color, 2.2));
      rock.position.set(x + 3, 10, z + 3);
      tempMesh(rock, 0.7, (e, kk) => {
        rock.position.set(x + 3 * (1 - kk), 10 * (1 - kk) + 0.3, z + 3 * (1 - kk));
        rock.rotation.x += 0.3;
        particle(rock.position.x, rock.position.y, rock.position.z, 0, 0, 0, color, 0.18, 0.4);
      }).disposeMat = false;
      after(0.7, () => explosion(x, z, 1.8, mult, { color, burn: o.burn, freeze: o.freeze, small: true, noProc: true }));
    });
  }
}

export function pillars(p, count, mult, color, o = {}) {
  const dx = p.aim.dx;
  const dz = p.aim.dz;
  const sx = p.x;
  const sz = p.z;
  for (let k = 1; k <= count; k++) {
    after(k * 0.07, () => {
      const x = sx + dx * k * 1.15;
      const z = sz + dz * k * 1.15;
      if (!isWalkable(G.dungeon, x, z)) return;
      for (const e of enemiesInRadius(x, z, 1.3)) hitEnemy(e, mult, { noProc: true, burn: o.burn, freeze: o.freeze, slow: o.slow, knock: 1, kx: sx, kz: sz });
      for (let j = 0; j < 8; j++) particle(x + rr(-0.3, 0.3), 0.2, z + rr(-0.3, 0.3), rr(-0.5, 0.5), rr(5, 9), rr(-0.5, 0.5), color, rr(0.1, 0.2), 0.5, 6, 1);
      ringFx(x, z, 1.2, color, 0.25);
      if (k % 2) sfx.punch();
    });
  }
}

export function omnislash(p, n, mult, color) {
  const targets = enemiesInRadius(p.x, p.z, 9).filter((e) => !e.inert && !e.invulnerable).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, n);
  if (!targets.length) return false;
  p.invuln = Math.max(p.invuln, 0.13 * targets.length + 0.3);
  targets.forEach((e, k) => {
    after(k * 0.13, () => {
      if (!e.alive || !G.player.alive) return;
      ghostFx(p.model, color);
      const a = rr(0, Math.PI * 2);
      const pos = walkableNear(e.x, e.z, e.x + Math.cos(a) * 0.9, e.z + Math.sin(a) * 0.9);
      p.x = pos.x;
      p.z = pos.z;
      p.facing = Math.atan2(e.x - p.x, e.z - p.z);
      hitEnemy(e, mult, { knock: 2, forceCrit: k === targets.length - 1 });
      slashFx(e.x, e.z, rr(0, Math.PI * 2), 1.6, Math.PI * 1.2, color, 0.9);
      burst(e.x, 1, e.z, color, 10, 5, 0.06, 0.3);
      sfx.slash();
    });
  });
  return true;
}

export function swarm(p, n, mult, color) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    after(k * 0.04, () => {
      spawnProjectile({ from: 'player', x: p.x + Math.cos(a) * 0.8, z: p.z + Math.sin(a) * 0.8, y: 1.3, dx: Math.cos(a), dz: Math.sin(a), speed: 10, life: 2.4, mult, color, size: 0.11, r: 0.25, homing: 6 });
    });
  }
  sfx.deploy();
}

export function bulletRing(p, waves, n, mult, color) {
  for (let w = 0; w < waves; w++) {
    after(w * 0.18, () => {
      const pl = G.player;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + w * 0.2;
        spawnProjectile({ from: 'player', x: pl.x + Math.cos(a) * 0.5, z: pl.z + Math.sin(a) * 0.5, dx: Math.cos(a), dz: Math.sin(a), speed: 20, life: 0.6, mult, color, size: 0.09, r: 0.2, quiet: true });
      }
      sfx.shoot();
    });
  }
}

export function nuke(x, z, mult) {
  const R = 6;
  telegraphFx(x, z, R, 2, 0xffd23d);
  toastNuke();
  for (let k = 0; k < 6; k++) after(k * 0.33, () => sfx.telegraph());
  after(2, () => {
    explosion(x, z, R, mult, { color: 0xffd23d, burn: 0.6, knock: 10 });
    ringFx(x, z, R * 1.6, 0xffffff, 0.8, { from: 1 });
    for (let k = 0; k < 4; k++) burst(x, 1 + k, z, pick([0xffd23d, 0xff6a00, 0xffffff]), 30, 10, 0.12, 1, { up: 1.5 });
    G.shake = 0.8;
    const fl = document.getElementById('hurt');
    if (fl) {
      fl.style.background = 'rgba(255,240,200,0.8)';
      fl.style.opacity = 1;
      setTimeout(() => {
        fl.style.opacity = 0;
        setTimeout(() => (fl.style.background = ''), 400);
      }, 120);
    }
  });
}
function toastNuke() {
  floatText(P().x, 2.2, P().z, L('ATAQUE NUCLEAR!', 'NUKE INCOMING!'), 'crit');
}

// Controle mental: inimigos próximos lutam do seu lado por um tempo
export function mindHack(p, n, dur) {
  const targets = enemiesInRadius(p.x, p.z, 8).filter((e) => !e.boss && !e.inert && !e.decoy && e.type !== 'pylon').slice(0, n);
  if (!targets.length) return false;
  for (const e of targets) {
    e.alive = false;
    e.hacked = true;
    if (e.laser) e.laser.visible = false;
    if (e.bar) e.bar.visible = false;
    for (const mt of e.model.mats) mt.emissive.setRGB(0, 0.25, 0.05);
    beamFx(p.x, 1.4, p.z, e.x, e.height * 0.7, e.z, 0x39ff14, 0.3);
    spawnAlly('hacked', e.x, e.z, { model: e.model, dur, mult: e.T.ai === 'brute' ? 2 : 1.1, melee: true, range: e.r + 0.9 });
  }
  sfx.zap();
  return true;
}

// =====================================================================
// Escudo de plasma (absorve dano e destrói/reflete tiros inimigos)
// =====================================================================
export function plasmaShield(p, dur, absorb, color, o = {}) {
  p.buffs.pshield = dur;
  p.pshieldColor = color;
  p.pshieldReflect = o.reflect !== false;
  p.pshieldFreeze = !!o.freeze;
  p.shield = Math.max(p.shield, p.stats.maxHp * absorb);
  if (!p.shieldMesh) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    p.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12), mat);
    p.shieldMesh.position.y = 0.9;
    p.model.root.add(p.shieldMesh);
  }
  p.shieldMesh.material.color.set(color).multiplyScalar(gk(1.5));
  p.shieldMesh.visible = true;
  ringFx(p.x, p.z, 1.6, color, 0.4);
  sfx.shieldBlock();
}

// Chamado pelos projéteis inimigos: o escudo os destrói e devolve
export function shieldCatch(pr) {
  const p = P();
  if (!(p.buffs.pshield > 0)) return false;
  const pos = pr.mesh.position;
  if (Math.hypot(pos.x - p.x, pos.z - p.z) > 1.35) return false;
  burst(pos.x, pos.y, pos.z, p.pshieldColor, 6, 3, 0.05, 0.25);
  if (p.pshieldReflect && !pr.fake) {
    spawnProjectile({ from: 'player', x: pos.x, z: pos.z, y: pos.y, dx: -pr.dx, dz: -pr.dz, speed: Math.max(14, pr.speed), life: 1, mult: 0.9, color: p.pshieldColor, size: 0.12, r: 0.22, homing: 4, slow: p.pshieldFreeze ? 1.5 : 0 });
  }
  sfx.shieldBlock();
  return true;
}

// =====================================================================
// Transformações (Forma Demoníaca / Armadura Mech)
// =====================================================================
export function transform(p, kind, dur) {
  p.form = kind;
  p.buffs.form = dur;
  p.model.root.scale.setScalar(kind === 'mech' ? 1.4 : 1.3);
  if (kind === 'demon' && !p.horns) {
    p.horns = new THREE.Group();
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), glowMat(0xff2244, 2.4));
      h.position.set(sx * 0.12, 0.28, 0);
      h.rotation.z = -sx * 0.5;
      p.horns.add(h);
    }
    p.model.head.add(p.horns);
  }
  if (p.horns) p.horns.visible = kind === 'demon';
  explosion(p.x, p.z, 3, 1.5, { color: kind === 'demon' ? 0xff2244 : 0xffd23d, knock: 6, noProc: true });
  sfx.boss();
  G.shake = Math.max(G.shake, 0.4);
}

export function endForm(p) {
  if (!p.form) return;
  p.form = null;
  p.model.root.scale.setScalar(1);
  if (p.horns) p.horns.visible = false;
}

// Multiplicadores enquanto transformado
export function formMods(p) {
  if (!p.form || !(p.buffs.form > 0)) return null;
  if (p.form === 'demon') return { dmg: 1.6, taken: 0.7, lifeSteal: 8, speed: 1.15 };
  return { dmg: 1.4, taken: 0.45, rate: 1.4, speed: 0.9 };
}

function updateForm(dt) {
  const p = P();
  if (!p.form) return;
  if (!(p.buffs.form > 0)) {
    endForm(p);
    return;
  }
  if (p.form === 'demon') {
    if (Math.random() < dt * 30) burst(p.x + rr(-0.4, 0.4), rr(0.3, 2), p.z + rr(-0.4, 0.4), pick([0xff2244, 0xff6a00]), 1, 1, 0.08, 0.5, { grav: -3 });
    p.auraT = (p.auraT || 0) - dt;
    if (p.auraT <= 0) {
      p.auraT = 0.5;
      for (const e of enemiesInRadius(p.x, p.z, 2.5)) hitEnemy(e, 0.3, { burn: 0.4, noProc: true, quiet: true });
    }
    for (const mt of p.model.mats) mt.emissive.setRGB(0.45, 0.05, 0.05);
  } else {
    for (const mt of p.model.mats) mt.emissive.setRGB(0.25, 0.22, 0.05);
  }
}

// =====================================================================
export function updatePowers(dt) {
  if (!G.player) return;
  updateAllies(dt);
  updateOrbiters(dt);
  updateStorms(dt);
  updateWarps(dt);
  updateLasers(dt);
  updateHoles(dt);
  updateForm(dt);
  const p = G.player;
  if (p.shieldMesh) {
    p.shieldMesh.visible = p.buffs.pshield > 0;
    if (p.shieldMesh.visible) {
      p.shieldMesh.rotation.y += dt * 2;
      p.shieldMesh.material.opacity = 0.18 + Math.sin(G.t * 6) * 0.06;
    }
  }
}
