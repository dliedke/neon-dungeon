// Modelos low-poly construídos com primitivas (sem arquivos externos).
import * as THREE from 'three';

const geoCache = {};
const glowCache = {};

export function box(w, h, d) {
  const k = `b${w},${h},${d}`;
  return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
}
function cached(key, make) {
  return geoCache[key] || (geoCache[key] = make());
}
export function glowMat(color, k = 2.3) {
  const key = color + '_' + k;
  if (!glowCache[key]) glowCache[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
  return glowCache[key];
}
const lambert = (color) => new THREE.MeshLambertMaterial({ color });
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

const shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
export function addShadow(g, r) {
  const s = new THREE.Mesh(shadowGeo, shadowMat);
  s.scale.setScalar(r * 1.25);
  s.position.y = 0.02;
  s.renderOrder = 1;
  g.add(s);
  return s;
}

// --------------------------------------------------------------
// Humanoide base
// --------------------------------------------------------------
export function humanoid(o) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(o.scale || 0.92);
  root.add(body);
  const mBody = lambert(o.body);
  const mDark = lambert(o.dark || 0x15151c);
  const mGlow = glowMat(o.accent, o.glowK || 2.4);
  const wide = o.wide || 1;

  const legL = new THREE.Group();
  legL.position.set(-0.11 * wide, 0.6, 0);
  legL.add(mesh(box(0.15 * wide, 0.6, 0.17), mDark, 0, -0.3, 0));
  body.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.11 * wide, 0.6, 0);
  legR.add(mesh(box(0.15 * wide, 0.6, 0.17), mDark, 0, -0.3, 0));
  body.add(legR);

  const torso = new THREE.Group();
  torso.position.y = 0.6;
  body.add(torso);
  torso.add(mesh(box(0.44 * wide, 0.52, 0.26 * Math.sqrt(wide)), mBody, 0, 0.27, 0));
  torso.add(mesh(box(0.3 * wide, 0.04, 0.02), mGlow, 0, 0.38, 0.14 * Math.sqrt(wide)));
  torso.add(mesh(box(0.46 * wide, 0.06, 0.28), mDark, 0, 0.02, 0)); // cinto

  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  head.add(mesh(box(0.26, 0.27, 0.26), mDark, 0, 0.02, 0));
  head.add(mesh(box(0.24, 0.06, 0.03), mGlow, 0, 0.04, 0.135));

  const armL = new THREE.Group();
  armL.position.set(-0.29 * wide, 0.48, 0);
  armL.add(mesh(box(0.13, 0.46, 0.15), mBody, 0, -0.21, 0));
  torso.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.29 * wide, 0.48, 0);
  armR.add(mesh(box(0.13, 0.46, 0.15), mBody, 0, -0.21, 0));
  torso.add(armR);
  const handL = new THREE.Group();
  handL.position.y = -0.44;
  armL.add(handL);
  const handR = new THREE.Group();
  handR.position.y = -0.44;
  armR.add(handR);

  return { root, body, legL, legR, torso, head, armL, armR, handL, handR, mats: [mBody, mDark], glow: mGlow };
}

export function animWalk(m, phase, moving, amount = 0.75) {
  const sw = moving ? Math.sin(phase) * amount : 0;
  m.legL.rotation.x += (sw - m.legL.rotation.x) * 0.4;
  m.legR.rotation.x += (-sw - m.legR.rotation.x) * 0.4;
  m.armL.rotation.x += (-sw * 0.6 - m.armL.rotation.x) * 0.4;
  m.armR.rotation.x += (sw * 0.6 - m.armR.rotation.x) * 0.4;
  m.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : 0;
}

// --------------------------------------------------------------
// Personagens jogáveis
// --------------------------------------------------------------
export function makePlayerModel(cls, accent) {
  if (cls === 'blade') {
    const m = humanoid({ body: 0x6a6f8c, dark: 0x2a2b3a, accent });
    // ombreira e faixa
    m.torso.add(mesh(box(0.2, 0.1, 0.24), m.glow, 0.31, 0.5, 0));
    m.torso.add(mesh(box(0.22, 0.12, 0.22), m.mats[1], -0.31, 0.5, 0));
    // cabelo/rabo
    m.head.add(mesh(box(0.08, 0.08, 0.3), m.mats[1], 0, 0.12, -0.2));
    // katana
    const blade = new THREE.Group();
    blade.add(mesh(box(0.05, 0.05, 0.14), m.mats[1], 0, 0, 0.02));
    blade.add(mesh(box(0.035, 0.06, 0.95), m.glow, 0, 0, 0.55));
    blade.rotation.x = Math.PI / 2 - 0.3;
    m.handR.add(blade);
    m.weapon = blade;
    return m;
  }
  if (cls === 'gunner') {
    const m = humanoid({ body: 0x7a5f70, dark: 0x2e2530, accent });
    // sobretudo
    m.torso.add(mesh(box(0.44, 0.5, 0.05), m.mats[0], 0, -0.05, -0.15));
    // óculos largos
    m.head.add(mesh(box(0.3, 0.05, 0.05), m.glow, 0, 0.05, 0.12));
    m.head.add(mesh(box(0.28, 0.08, 0.28), m.mats[0], 0, 0.15, -0.02));
    const gun = () => {
      const g = new THREE.Group();
      g.add(mesh(box(0.08, 0.12, 0.08), m.mats[1], 0, 0, 0));
      g.add(mesh(box(0.07, 0.07, 0.28), m.mats[1], 0, 0.06, 0.12));
      g.add(mesh(box(0.02, 0.02, 0.24), m.glow, 0.04, 0.08, 0.12));
      g.rotation.x = Math.PI / 2;
      return g;
    };
    m.handR.add(gun());
    m.handL.add(gun());
    return m;
  }
  // netrunner
  const m = humanoid({ body: 0x4c6a5e, dark: 0x1e2a25, accent });
  // capuz
  m.head.add(mesh(box(0.32, 0.32, 0.32), m.mats[0], 0, 0.04, -0.03));
  m.head.add(mesh(box(0.24, 0.06, 0.03), m.glow, 0, 0.04, 0.145));
  // cabos
  m.torso.add(mesh(box(0.03, 0.4, 0.03), m.glow, -0.12, 0.25, -0.15));
  m.torso.add(mesh(box(0.03, 0.4, 0.03), m.glow, 0.12, 0.25, -0.15));
  // deck flutuante
  const deck = new THREE.Group();
  deck.add(mesh(cached('oct', () => new THREE.OctahedronGeometry(0.13, 0)), m.glow));
  deck.add(mesh(box(0.22, 0.03, 0.16), m.mats[1], 0, -0.16, 0));
  m.root.add(deck);
  m.deck = deck;
  return m;
}

// --------------------------------------------------------------
// Inimigos
// --------------------------------------------------------------
export function makeEnemyModel(type, eliteColor) {
  let m;
  switch (type) {
    case 'punk': {
      m = humanoid({ body: 0x7a5048, dark: 0x352626, accent: 0xff6a00 });
      m.head.add(mesh(box(0.05, 0.12, 0.3), m.glow, 0, 0.2, 0));
      const pipe = mesh(box(0.05, 0.05, 0.6), m.mats[1], 0, 0, 0.25);
      pipe.rotation.x = Math.PI / 2 - 0.3;
      m.handR.add(pipe);
      m.kind = 'humanoid';
      break;
    }
    case 'soldier': {
      m = humanoid({ body: 0x5a6a88, dark: 0x262e3e, accent: 0xff2244 });
      m.head.add(mesh(box(0.3, 0.1, 0.3), m.mats[0], 0, 0.15, 0));
      const rifle = new THREE.Group();
      rifle.add(mesh(box(0.07, 0.1, 0.55), m.mats[1], 0, 0, 0.2));
      rifle.add(mesh(box(0.02, 0.02, 0.4), m.glow, 0.04, 0.03, 0.2));
      rifle.rotation.x = Math.PI / 2;
      m.handR.add(rifle);
      m.kind = 'humanoid';
      break;
    }
    case 'brute': {
      m = humanoid({ body: 0x8a7a48, dark: 0x3a3320, accent: 0xffc400, scale: 1.45, wide: 1.5 });
      m.torso.add(mesh(box(0.34, 0.24, 0.34), m.mats[1], 0.42, 0.5, 0));
      m.torso.add(mesh(box(0.34, 0.24, 0.34), m.mats[1], -0.42, 0.5, 0));
      m.handR.add(mesh(box(0.24, 0.24, 0.24), m.glow, 0, 0, 0));
      m.handL.add(mesh(box(0.24, 0.24, 0.24), m.mats[1], 0, 0, 0));
      m.kind = 'humanoid';
      break;
    }
    case 'drone': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x6a7090);
      body.add(mesh(cached('ico', () => new THREE.IcosahedronGeometry(0.3, 0)), mBody));
      const ring = mesh(cached('dring', () => new THREE.TorusGeometry(0.42, 0.04, 6, 20)), glowMat(0xff3355));
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
      body.add(mesh(cached('eye', () => new THREE.SphereGeometry(0.1, 8, 6)), glowMat(0xff3355, 3), 0, 0, 0.26));
      body.position.y = 1.15;
      m = { root, body, ring, mats: [mBody], kind: 'drone' };
      break;
    }
    case 'bomber': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x55505a);
      const shell = mesh(cached('sph', () => new THREE.SphereGeometry(0.3, 10, 8)), mBody, 0, 0.3, 0);
      shell.scale.set(1, 0.6, 1.2);
      body.add(shell);
      const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3300).multiplyScalar(2.5) });
      const core = mesh(cached('core', () => new THREE.SphereGeometry(0.13, 8, 6)), coreMat, 0, 0.42, 0);
      body.add(core);
      const legs = [];
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const lg = new THREE.Group();
        lg.position.set(x * 0.18, 0.25, z * 0.18);
        const leg = mesh(box(0.05, 0.05, 0.4), mBody, 0, -0.08, 0.15);
        leg.rotation.x = 0.6;
        lg.add(leg);
        lg.rotation.y = Math.atan2(x, z);
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, core, coreMat, legs, mats: [mBody], kind: 'bomber' };
      break;
    }
    case 'sniper': {
      m = humanoid({ body: 0x4a3c5c, dark: 0x1e1828, accent: 0xff2244, scale: 0.95 });
      m.head.add(mesh(box(0.32, 0.3, 0.32), m.mats[0], 0, 0.06, -0.03)); // capuz
      m.head.add(mesh(box(0.08, 0.06, 0.04), glowMat(0xff2244, 3), 0.06, 0.04, 0.16)); // mira ocular
      const rifle = new THREE.Group();
      rifle.add(mesh(box(0.06, 0.08, 1.0), m.mats[1], 0, 0, 0.35));
      rifle.add(mesh(box(0.1, 0.1, 0.22), m.mats[1], 0, 0.08, 0.1));
      rifle.add(mesh(box(0.02, 0.02, 0.8), m.glow, 0.04, 0.02, 0.4));
      rifle.rotation.x = Math.PI / 2;
      m.handR.add(rifle);
      m.kind = 'humanoid';
      break;
    }
    case 'shield': {
      m = humanoid({ body: 0x3a4a6a, dark: 0x161c2a, accent: 0x4d9bff, wide: 1.25 });
      m.head.add(mesh(box(0.3, 0.3, 0.3), m.mats[0], 0, 0.05, 0));
      m.head.add(mesh(box(0.26, 0.05, 0.03), glowMat(0x4d9bff, 2.6), 0, 0.06, 0.155));
      const sh = new THREE.Group();
      sh.position.set(0, 0.95, 0.42);
      sh.add(mesh(box(0.8, 1.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.85 })));
      sh.add(mesh(box(0.84, 0.05, 0.08), glowMat(0x4d9bff, 2.6), 0, 0.53, 0));
      sh.add(mesh(box(0.84, 0.05, 0.08), glowMat(0x4d9bff, 2.6), 0, -0.53, 0));
      sh.add(mesh(box(0.6, 0.12, 0.08), glowMat(0x4d9bff, 1.6), 0, 0.1, 0.01));
      m.root.add(sh);
      m.shield = sh;
      const baton = mesh(box(0.05, 0.05, 0.5), glowMat(0x4d9bff, 2), 0, 0, 0.2);
      baton.rotation.x = Math.PI / 2 - 0.3;
      m.handR.add(baton);
      m.kind = 'humanoid';
      break;
    }
    case 'ninja': {
      m = humanoid({ body: 0x3a2a5a, dark: 0x140e22, accent: 0xb36bff, scale: 0.9 });
      for (const mt of m.mats) {
        mt.transparent = true;
        mt.opacity = 0.6;
        mt.depthWrite = false;
      }
      m.head.add(mesh(box(0.06, 0.06, 0.4), glowMat(0xb36bff, 2.4), 0, 0.05, -0.25)); // faixa
      for (const hand of [m.handL, m.handR]) {
        const bl = mesh(box(0.03, 0.04, 0.5), glowMat(0xb36bff, 2.8), 0, 0, 0.22);
        bl.rotation.x = Math.PI / 2 - 0.3;
        hand.add(bl);
      }
      m.holo = true;
      m.kind = 'humanoid';
      break;
    }
    case 'medic': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0xc8d8d0);
      body.add(mesh(cached('ico', () => new THREE.IcosahedronGeometry(0.3, 0)), mBody));
      const ring = mesh(cached('dring', () => new THREE.TorusGeometry(0.42, 0.04, 6, 20)), glowMat(0x39ff88));
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
      // cruz verde
      body.add(mesh(box(0.08, 0.3, 0.08), glowMat(0x39ff88, 3), 0, 0.36, 0));
      body.add(mesh(box(0.3, 0.08, 0.08), glowMat(0x39ff88, 3), 0, 0.36, 0));
      body.position.y = 1.15;
      m = { root, body, ring, mats: [mBody], kind: 'drone' };
      break;
    }
    case 'sentry': {
      const root = new THREE.Group();
      const mBody = lambert(0x5a5f78);
      const mDark = lambert(0x22242f);
      root.add(mesh(cached('sbase', () => new THREE.CylinderGeometry(0.42, 0.5, 0.35, 8)), mDark, 0, 0.17, 0));
      root.add(mesh(box(0.14, 0.4, 0.14), mBody, 0, 0.5, 0));
      const head = new THREE.Group();
      head.position.y = 0.72;
      head.add(mesh(box(0.46, 0.28, 0.46), mBody));
      head.add(mesh(box(0.08, 0.08, 0.5), mDark, -0.1, 0, 0.35));
      head.add(mesh(box(0.08, 0.08, 0.5), mDark, 0.1, 0, 0.35));
      head.add(mesh(box(0.3, 0.06, 0.03), glowMat(0xff3355, 3), 0, 0.06, 0.235));
      root.add(head);
      root.add(mesh(cached('sring', () => new THREE.TorusGeometry(0.47, 0.03, 6, 20).rotateX(Math.PI / 2)), glowMat(0xff3355), 0, 0.36, 0));
      m = { root, body: root, head, mats: [mBody, mDark], kind: 'sentry' };
      break;
    }
    case 'barrel': {
      const root = new THREE.Group();
      const mBody = lambert(0xb04a10);
      root.add(mesh(cached('barrel', () => new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12)), mBody, 0, 0.4, 0));
      for (const y of [0.18, 0.62]) root.add(mesh(cached('bband', () => new THREE.CylinderGeometry(0.31, 0.31, 0.06, 12)), glowMat(0xffaa00, 2.6), 0, y, 0));
      root.add(mesh(cached('bcap', () => new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10)), glowMat(0xff3300, 2.2), 0, 0.81, 0));
      m = { root, body: root, mats: [mBody], kind: 'static' };
      break;
    }
    case 'queen': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x3a4a3a);
      const mDark = lambert(0x161f16);
      const thorax = mesh(cached('qthorax', () => new THREE.SphereGeometry(0.75, 14, 10)), mBody, 0, 1.0, 0.35);
      thorax.scale.set(1, 0.7, 1.1);
      body.add(thorax);
      const abdomen = new THREE.Group();
      abdomen.position.set(0, 1.15, -0.9);
      const ab = mesh(cached('qab', () => new THREE.SphereGeometry(1.0, 14, 10)), mDark);
      ab.scale.set(1, 0.85, 1.25);
      abdomen.add(ab);
      for (let k = 0; k < 3; k++) abdomen.add(mesh(cached('qstripe', () => new THREE.TorusGeometry(0.88, 0.04, 6, 24)), glowMat(0x39ff14, 2.2), 0, 0, -0.5 + k * 0.4));
      abdomen.children.slice(1).forEach((c, k) => {
        c.scale.setScalar(1 - Math.abs(k - 1) * 0.15);
      });
      body.add(abdomen);
      const eyesMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff14).multiplyScalar(2.6) });
      const eyes = new THREE.Group();
      for (const [x, y] of [[-0.18, 0.1], [0.18, 0.1], [-0.32, 0], [0.32, 0], [-0.1, -0.05], [0.1, -0.05]]) eyes.add(new THREE.Mesh(cached('qeye', () => new THREE.SphereGeometry(0.07, 8, 6)), eyesMat));
      eyes.children.forEach((c, k) => c.position.set([-0.18, 0.18, -0.32, 0.32, -0.1, 0.1][k], 1.15 + [0.1, 0.1, 0, 0, -0.05, -0.05][k], 1.08));
      body.add(eyes);
      eyes.material = eyesMat;
      const legs = [];
      for (let k = 0; k < 8; k++) {
        const side = k < 4 ? -1 : 1;
        const idx = k % 4;
        const lg = new THREE.Group();
        lg.position.set(side * 0.55, 1.0, 0.6 - idx * 0.45);
        const upper = mesh(box(1.3, 0.1, 0.1), mBody, side * 0.6, 0.35, 0);
        upper.rotation.z = side * 0.55;
        const lower = mesh(box(0.1, 1.5, 0.1), mDark, side * 1.2, -0.25, 0);
        lower.rotation.z = -side * 0.25;
        lg.add(upper, lower);
        lg.rotation.y = side * (idx - 1.5) * -0.3;
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, abdomen, eyes, legs, mats: [mBody, mDark], kind: 'queen' };
      break;
    }
    case 'boss': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x6a6e88);
      const mDark = lambert(0x2a2c3a);
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(2.5) });
      body.add(mesh(cached('bbase', () => new THREE.CylinderGeometry(0.9, 1.1, 0.6, 8)), mDark, 0, 0.3, 0));
      const torso = new THREE.Group();
      torso.position.y = 0.6;
      body.add(torso);
      torso.add(mesh(box(1.6, 1.2, 1.1), mBody, 0, 0.75, 0));
      torso.add(mesh(box(1.0, 0.12, 0.05), glow, 0, 0.95, 0.56));
      torso.add(mesh(box(0.6, 0.45, 0.6), mDark, 0, 1.55, 0));
      torso.add(mesh(box(0.5, 0.1, 0.05), glow, 0, 1.58, 0.31));
      const armL = new THREE.Group();
      armL.position.set(-1.05, 1.0, 0);
      armL.add(mesh(box(0.45, 0.45, 0.45), mDark));
      armL.add(mesh(box(0.25, 0.25, 1.2), mBody, 0, -0.1, 0.5));
      armL.add(mesh(box(0.14, 0.14, 0.05), glow, 0, -0.1, 1.11));
      torso.add(armL);
      const armR = armL.clone();
      armR.position.x = 1.05;
      torso.add(armR);
      const ring = mesh(cached('bring', () => new THREE.TorusGeometry(1.5, 0.05, 6, 40)), glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.0;
      body.add(ring);
      m = { root, body, torso, armL, armR, ring, glow, mats: [mBody, mDark], kind: 'boss' };
      break;
    }
  }
  if (eliteColor) {
    const er = mesh(cached('elring', () => new THREE.RingGeometry(0.55, 0.68, 28).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(eliteColor).multiplyScalar(2), transparent: true, opacity: 0.85, depthWrite: false }));
    er.position.y = 0.03;
    m.root.add(er);
    m.eliteRing = er;
  }
  return m;
}

export function makeTurretModel(color) {
  const root = new THREE.Group();
  const mDark = lambert(0x1b2220);
  for (let k = 0; k < 3; k++) {
    const leg = mesh(box(0.05, 0.6, 0.05), mDark, 0, 0.25, 0);
    const a = (k / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.18, 0.25, Math.sin(a) * 0.18);
    leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    root.add(leg);
  }
  const head = new THREE.Group();
  head.position.y = 0.62;
  head.add(mesh(box(0.3, 0.2, 0.3), mDark));
  head.add(mesh(box(0.06, 0.06, 0.4), glowMat(color), 0, 0, 0.25));
  head.add(mesh(box(0.2, 0.04, 0.02), glowMat(color), 0, 0.05, 0.16));
  root.add(head);
  return { root, head };
}

// Barra de vida flutuante para inimigos
const barGeo = new THREE.PlaneGeometry(1, 0.09);
const barFgGeo = new THREE.PlaneGeometry(1, 0.09).translate(0.5, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthTest: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2b4a).multiplyScalar(1.4), depthTest: false });
const barEliteMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc400).multiplyScalar(1.4), depthTest: false });
export function makeHpBar(width, elite) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBgMat);
  bg.scale.x = width + 0.06;
  bg.scale.y = 1.6;
  bg.renderOrder = 10;
  const fg = new THREE.Mesh(barFgGeo, elite ? barEliteMat : barFgMat);
  fg.position.x = -width / 2;
  fg.scale.x = width;
  fg.renderOrder = 11;
  g.add(bg, fg);
  g.userData = { fg, width };
  g.visible = false;
  return g;
}
