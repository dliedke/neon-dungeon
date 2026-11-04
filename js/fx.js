// Partículas, cortes, anéis, raios e números flutuantes.
import * as THREE from 'three';
import { G } from './state.js';
import { rr } from './utils.js';

const MAX = 900;
let inst = null;
const parts = [];
let cursor = 0;
const effects = [];
const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const sv = new THREE.Vector3();
const q0 = new THREE.Quaternion();
const col = new THREE.Color();

export function initFx(scene) {
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  inst = new THREE.InstancedMesh(geo, mat, MAX);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  m4.makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) {
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, col.setRGB(1, 1, 1));
    parts.push({ alive: false });
  }
  scene.add(inst);
}

export function particle(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0) {
  const idx = cursor;
  const p = parts[idx];
  cursor = (cursor + 1) % MAX;
  p.alive = true;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.size = size;
  p.life = p.max = life;
  p.grav = grav;
  p.drag = drag;
  p.idx = idx;
  col.set(color).multiplyScalar(2.2);
  inst.setColorAt(p.idx, col);
  inst.instanceColor.needsUpdate = true;
}

export function burst(x, y, z, color, n = 10, speed = 4, size = 0.07, life = 0.45, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * rr(0.3, 1);
    const up = o.up ?? 0.6;
    particle(x, y, z, Math.cos(a) * s, rr(-0.2, 1) * s * up, Math.sin(a) * s, color, size * rr(0.6, 1.3), life * rr(0.6, 1.2), o.grav ?? 6, o.drag ?? 2);
  }
}

export function updateFx(dt) {
  let any = false;
  for (let i = 0; i < MAX; i++) {
    const p = parts[i];
    if (!p.alive) continue;
    any = true;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      m4.makeScale(0, 0, 0);
      inst.setMatrixAt(i, m4);
      continue;
    }
    const dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr;
    p.vz *= dr;
    p.vy = p.vy * dr - p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.03) {
      p.y = 0.03;
      p.vy *= -0.3;
    }
    const s = p.size * (p.life / p.max);
    m4.compose(v3.set(p.x, p.y, p.z), q0, sv.set(s, s, s));
    inst.setMatrixAt(i, m4);
  }
  if (any) inst.instanceMatrix.needsUpdate = true;

  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const k = e.t / e.dur;
    if (k >= 1) {
      disposeEffect(e);
      effects.splice(i, 1);
      continue;
    }
    e.update && e.update(e, k, dt);
  }
}

export function clearEffects() {
  for (const e of effects) disposeEffect(e);
  effects.length = 0;
  for (let i = 0; i < MAX; i++) {
    parts[i].alive = false;
    m4.makeScale(0, 0, 0);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
}

function disposeEffect(e) {
  e.mesh.parent && e.mesh.parent.remove(e.mesh);
  const mats = new Set();
  e.mesh.traverse((o) => {
    if (o.material && !o.material.userData.shared) mats.add(o.material);
  });
  if (e.disposeMat) mats.forEach((m) => m.dispose());
  if (e.disposeGeo && e.mesh.geometry) e.mesh.geometry.dispose();
}

function addEffect(mesh, dur, update, o = {}) {
  (o.parent || G.world).add(mesh);
  const e = { mesh, dur, t: 0, update, disposeMat: o.disposeMat !== false, disposeGeo: !!o.disposeGeo, data: o.data };
  effects.push(e);
  return e;
}

const arcGeoCache = {};
function arcGeo(r, arc) {
  const key = r.toFixed(2) + '_' + arc.toFixed(2);
  if (!arcGeoCache[key]) {
    const g = new THREE.RingGeometry(r * 0.35, r, 28, 1, -arc / 2, arc);
    g.rotateX(-Math.PI / 2);
    arcGeoCache[key] = g;
  }
  return arcGeoCache[key];
}

// Corte em arco (ângulo = direção para onde o golpe aponta)
export function slashFx(x, z, angle, r, arc, color, y = 0.7) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(arcGeo(r, arc), mat);
  m.position.set(x, y, z);
  // RingGeometry rotacionada: theta=0 aponta para +x. Queremos apontar para (dx,dz).
  m.rotation.y = -angle;
  addEffect(m, 0.18, (e, k) => {
    mat.opacity = 0.9 * (1 - k);
    const s = 1 + k * 0.15;
    m.scale.set(s, 1, s);
  });
}

const ringGeo = new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);

export function ringFx(x, z, radius, color, dur = 0.35, o = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(o.k ?? 2.2), transparent: true, opacity: o.opacity ?? 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const m = new THREE.Mesh(ringGeo, mat);
  m.position.set(x, o.y ?? 0.06, z);
  const from = o.from ?? radius * 0.2;
  m.scale.setScalar(from);
  addEffect(m, dur, (e, k) => {
    const ease = 1 - Math.pow(1 - k, 3);
    m.scale.setScalar(from + (radius - from) * ease);
    mat.opacity = (o.opacity ?? 0.9) * (1 - k);
  });
}

// Telegrafia de ataque: disco que enche até explodir
export function telegraphFx(x, z, radius, dur, color = 0xff3322, follow = null) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), transparent: true, opacity: 0.16, depthWrite: false });
  const disc = new THREE.Mesh(discGeo, mat);
  disc.position.set(x, 0.04, z);
  disc.scale.setScalar(radius);
  const imat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), transparent: true, opacity: 0.32, depthWrite: false });
  const inner = new THREE.Mesh(discGeo, imat);
  inner.position.y = 0.01;
  disc.add(inner);
  const rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), transparent: true, opacity: 0.85, depthWrite: false });
  const edge = new THREE.Mesh(ringGeo, rmat);
  disc.add(edge);
  return addEffect(disc, dur, (e, k) => {
    inner.scale.setScalar(Math.max(0.001, k));
    if (follow) disc.position.set(follow.x, 0.04, follow.z);
    if (e.cancelled) e.t = e.dur;
  }, { data: { imat, rmat } });
}

// Linha de telegrafia retangular (investida do chefe)
export function lineTelegraph(x, z, angle, length, width, dur, color = 0xff3322) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), transparent: true, opacity: 0.25, depthWrite: false });
  const g = new THREE.PlaneGeometry(length, width).rotateX(-Math.PI / 2).translate(length / 2, 0, 0);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, 0.05, z);
  m.rotation.y = -angle;
  addEffect(m, dur, (e, k) => {
    mat.opacity = 0.12 + 0.3 * k;
  }, { disposeGeo: true });
}

// Raio elétrico em zigue-zague
export function beamFx(x1, y1, z1, x2, y2, z2, color, dur = 0.16, segs = 5) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const j = i === 0 || i === segs ? 0 : 0.25;
    pts.push(new THREE.Vector3(x1 + (x2 - x1) * t + rr(-j, j), y1 + (y2 - y1) * t + rr(-j, j), z1 + (z2 - z1) * t + rr(-j, j)));
  }
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a.distanceTo(b);
    const seg = new THREE.Mesh(boxGeoUnit, mat);
    seg.scale.set(0.05, 0.05, len);
    seg.position.copy(a).lerp(b, 0.5);
    seg.lookAt(b);
    group.add(seg);
  }
  addEffect(group, dur, (e, k) => {
    mat.opacity = 1 - k;
  });
}
const boxGeoUnit = new THREE.BoxGeometry(1, 1, 1);

// Rastro de avanço (fantasmas)
export function ghostFx(model, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  model.root.updateMatrixWorld(true);
  model.root.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'BoxGeometry') {
      const c = new THREE.Mesh(o.geometry, mat);
      o.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      g.add(c);
    }
  });
  addEffect(g, 0.25, (e, k) => {
    mat.opacity = 0.45 * (1 - k);
  });
}

// Mesh temporário genérico
export function tempMesh(mesh, dur, update) {
  return addEffect(mesh, dur, update);
}

// -------------------- Textos flutuantes (DOM) --------------------
const floaters = [];
let floatRoot = null;
const proj = new THREE.Vector3();

export function floatText(x, y, z, text, cls = 'dmg') {
  if (!floatRoot) floatRoot = document.getElementById('floaters');
  let f = floaters.find((f) => !f.alive);
  if (!f) {
    if (floaters.length > 70) return;
    const el = document.createElement('div');
    floatRoot.appendChild(el);
    f = { el };
    floaters.push(f);
  }
  f.alive = true;
  f.x = x + rr(-0.25, 0.25);
  f.y = y;
  f.z = z + rr(-0.25, 0.25);
  f.t = 0;
  f.dur = cls === 'crit' ? 1.0 : cls === 'info' ? 1.4 : 0.8;
  f.el.className = 'floater ' + cls;
  f.el.textContent = text;
  f.el.style.display = 'block';
}

export function updateFloaters(dt, camera) {
  const w = innerWidth;
  const h = innerHeight;
  for (const f of floaters) {
    if (!f.alive) continue;
    f.t += dt;
    if (f.t >= f.dur) {
      f.alive = false;
      f.el.style.display = 'none';
      continue;
    }
    proj.set(f.x, f.y + f.t * 1.2, f.z).project(camera);
    const sx = ((proj.x + 1) / 2) * w;
    const sy = ((1 - proj.y) / 2) * h;
    const k = f.t / f.dur;
    const sc = k < 0.15 ? 0.6 + k * 4 : 1.2 - (k - 0.15) * 0.3;
    f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${sc})`;
    f.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
  }
}

export function clearFloaters() {
  for (const f of floaters) {
    f.alive = false;
    f.el.style.display = 'none';
  }
}
