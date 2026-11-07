import { gk } from './state.js';
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
  if (!glowCache[key]) glowCache[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(k)) });
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
// Peças compostas: várias primitivas estáticas fundidas numa geometria só
// (mais detalhe sem multiplicar os draw calls). Ficam em cache pela chave.
// --------------------------------------------------------------
const _mx = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
export function merged(key, build) {
  return cached('m:' + key, () => {
    const pos = [];
    const nor = [];
    const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      _mx.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
      g.applyMatrix4(_mx);
      const pa = g.attributes.position.array;
      const na = g.attributes.normal.array;
      for (let i = 0; i < pa.length; i++) pos.push(pa[i]);
      for (let i = 0; i < na.length; i++) nor.push(na[i]);
      g.dispose();
    };
    build((w, h, d, x, y, z, rx, ry, rz) => add(box(w, h, d), x, y, z, rx, ry, rz), add);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.computeBoundingSphere();
    return out;
  });
}
// adiciona uma peça composta ao grupo e devolve o mesh
function part(parent, key, mat, build, x = 0, y = 0, z = 0) {
  const m = mesh(merged(key, build), mat, x, y, z);
  parent.add(m);
  return m;
}
// material extra que também pisca ao levar dano (entra em m.mats)
function extraMat(m, color, o) {
  const mt = new THREE.MeshLambertMaterial({ color, ...(o || {}) });
  m.mats.push(mt);
  return mt;
}
const cyl = (rt, rb, h, n = 8) => cached(`c${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const sph = (r, a = 10, b = 8) => cached(`s${r},${a},${b}`, () => new THREE.SphereGeometry(r, a, b));
const cone = (r, h, n = 6) => cached(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));
const tor = (r, t, a = 6, b = 16, arc = Math.PI * 2) => cached(`t${r},${t},${a},${b},${arc}`, () => new THREE.TorusGeometry(r, t, a, b, arc));
const oct = (r) => cached(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));

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
  const sw = Math.sqrt(wide);
  const k = wide.toFixed(2);
  const fz = 0.13 * sw; // frente do peito

  // pernas: coxa, canela e bota (escuro) + joelheira, cano da bota e quadril (cor do corpo)
  const mkLeg = (sx) => {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.11 * wide, 0.6, 0);
    part(leg, 'hlegD' + k, mDark, (b) => {
      b(0.15 * wide, 0.31, 0.17, 0, -0.15, 0);
      b(0.13 * wide, 0.26, 0.15, 0, -0.41, 0);
      b(0.16 * wide, 0.1, 0.25, 0, -0.55, 0.035);
    });
    part(leg, 'hlegB' + k, mBody, (b) => {
      b(0.12 * wide, 0.1, 0.05, 0, -0.3, 0.09);
      b(0.17 * wide, 0.045, 0.2, 0, -0.48, 0.012);
      b(0.165 * wide, 0.08, 0.185, 0, -0.03, 0);
    });
    body.add(leg);
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const torso = new THREE.Group();
  torso.position.y = 0.6;
  body.add(torso);
  // peito, abdômen, placa peitoral e gola
  part(torso, 'htorB' + k, mBody, (b) => {
    b(0.44 * wide, 0.3, 0.26 * sw, 0, 0.38, 0);
    b(0.36 * wide, 0.25, 0.22 * sw, 0, 0.13, 0);
    b(0.34 * wide, 0.17, 0.035, 0, 0.41, fz + 0.012);
    b(0.32 * wide, 0.05, 0.24 * sw, 0, 0.55, 0);
  });
  // cinto, bolsas, pescoço, placa das costas e gomos do abdômen
  part(torso, 'htorD' + k, mDark, (b) => {
    b(0.42 * wide, 0.075, 0.25 * sw, 0, 0.02, 0);
    for (const sx of [-1, 1]) b(0.07, 0.09, 0.09, sx * 0.2 * wide, -0.01, 0.07);
    b(0.12, 0.1, 0.12, 0, 0.57, 0);
    b(0.26 * wide, 0.32, 0.06, 0, 0.34, -fz - 0.02);
    for (const y of [0.1, 0.18]) b(0.2 * wide, 0.045, 0.02, 0, y, 0.11 * sw + 0.005);
  });
  // linhas neon: peito, fivela e espinha
  part(torso, 'htorG' + k, mGlow, (b) => {
    b(0.28 * wide, 0.03, 0.02, 0, 0.43, fz + 0.035);
    b(0.08, 0.05, 0.02, 0, 0.02, 0.125 * sw + 0.008);
    b(0.025, 0.22, 0.02, 0, 0.34, -fz - 0.055);
  });

  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  part(head, 'hheadD', mDark, (b) => {
    b(0.26, 0.27, 0.26, 0, 0.02, 0);
    b(0.2, 0.08, 0.05, 0, -0.08, 0.125); // respirador/queixo
    for (const sx of [-1, 1]) b(0.045, 0.11, 0.11, sx * 0.145, 0.02, 0); // fones
    b(0.2, 0.04, 0.2, 0, 0.165, -0.01);
  });
  part(head, 'hheadG', mGlow, (b) => {
    b(0.24, 0.06, 0.03, 0, 0.04, 0.135); // visor
    for (const sx of [-1, 1]) b(0.02, 0.05, 0.05, sx * 0.17, 0.02, 0);
  });

  // braços: braço e ombreira (corpo) + cotovelo, antebraço e mão (escuro)
  const mkArm = (sx) => {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.29 * wide, 0.48, 0);
    part(arm, 'harmB', mBody, (b) => {
      b(0.13, 0.26, 0.15, 0, -0.1, 0);
      b(0.18, 0.11, 0.2, 0, 0.02, 0);
    });
    part(arm, 'harmD', mDark, (b) => {
      b(0.15, 0.035, 0.17, 0, -0.225, 0);
      b(0.14, 0.2, 0.16, 0, -0.33, 0);
      b(0.11, 0.09, 0.13, 0, -0.46, 0.01);
    });
    torso.add(arm);
    const hand = new THREE.Group();
    hand.position.y = -0.44;
    arm.add(hand);
    return [arm, hand];
  };
  const [armL, handL] = mkArm(-1);
  const [armR, handR] = mkArm(1);

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
    // ombreira neon, ombreira escura e cachecol esvoaçante
    m.torso.add(mesh(box(0.2, 0.1, 0.24), m.glow, 0.31, 0.52, 0));
    m.torso.add(mesh(box(0.22, 0.12, 0.22), m.mats[1], -0.31, 0.52, 0));
    part(m.torso, 'bl_scarf', extraMat(m, 0x8a1f3a), (b) => {
      b(0.34, 0.08, 0.3, 0, 0.56, 0);
      b(0.09, 0.34, 0.03, -0.08, 0.36, -0.19, 0.25, 0, 0.1);
      b(0.08, 0.26, 0.03, 0.05, 0.38, -0.19, 0.35, 0, -0.15);
    });
    // bainha nas costas
    part(m.torso, 'bl_sheath', m.mats[1], (b) => {
      b(0.07, 0.9, 0.05, 0, 0.32, -0.2, 0, 0, 0.75);
      b(0.1, 0.06, 0.08, -0.27, 0.66, -0.2, 0, 0, 0.75);
    });
    // cabelo espetado e rabo
    part(m.head, 'bl_hair', m.mats[1], (b) => {
      b(0.08, 0.08, 0.3, 0, 0.12, -0.2);
      for (let i = 0; i < 4; i++) b(0.07, 0.12, 0.07, -0.09 + i * 0.06, 0.2, -0.04 + (i % 2) * 0.05, -0.4, 0, (i - 1.5) * 0.3);
    });
    // katana: cabo, guarda, lâmina e ponta
    const blade = new THREE.Group();
    part(blade, 'bl_hilt', m.mats[1], (b) => {
      b(0.05, 0.05, 0.2, 0, 0, -0.01);
      b(0.04, 0.04, 0.03, 0, 0, -0.12);
    });
    blade.add(mesh(box(0.16, 0.03, 0.08), glowMat(0xffd23d, 1.6), 0, 0, 0.1));
    part(blade, 'bl_edge', m.glow, (b, a) => {
      b(0.03, 0.065, 0.9, 0, 0, 0.56);
      a(cone(0.033, 0.14, 4), 0, 0, 1.08, Math.PI / 2, 0, 0, 1, 1, 1.9);
    });
    blade.rotation.x = Math.PI / 2 - 0.3;
    m.handR.add(blade);
    m.weapon = blade;
    return m;
  }
  if (cls === 'gunner') {
    const m = humanoid({ body: 0x7a5f70, dark: 0x2e2530, accent });
    // sobretudo com abas, gola alta, coldres e bandoleira
    part(m.torso, 'gn_coat', m.mats[0], (b) => {
      for (const sx of [-1, 1]) b(0.2, 0.52, 0.05, sx * 0.12, -0.06, -0.15, -0.12, 0, sx * -0.06);
      for (const sx of [-1, 1]) b(0.06, 0.4, 0.05, sx * 0.22, 0.03, 0.12, 0.08, 0, 0);
      b(0.42, 0.14, 0.3, 0, 0.6, -0.02);
    });
    part(m.torso, 'gn_holst', m.mats[1], (b) => {
      for (const sx of [-1, 1]) b(0.08, 0.18, 0.12, sx * 0.25, -0.08, 0.02);
      b(0.48, 0.05, 0.03, 0, 0.3, 0.16, 0, 0, 0.6);
    });
    // óculos largos e chapéu com faixa neon
    m.head.add(mesh(box(0.3, 0.05, 0.05), m.glow, 0, 0.05, 0.13));
    part(m.head, 'gn_hat', m.mats[0], (b, a) => {
      a(cyl(0.3, 0.3, 0.03, 12), 0, 0.17, 0);
      a(cyl(0.15, 0.17, 0.14, 10), 0, 0.24, 0);
    });
    m.head.add(mesh(cyl(0.172, 0.172, 0.03, 10), m.glow, 0, 0.2, 0));
    const gun = () => {
      const g = new THREE.Group();
      part(g, 'gn_gun', m.mats[1], (b) => {
        b(0.08, 0.14, 0.08, 0, -0.02, 0);
        b(0.07, 0.08, 0.32, 0, 0.06, 0.13);
        b(0.05, 0.1, 0.05, 0, -0.04, 0.08);
        b(0.03, 0.04, 0.04, 0, 0.12, 0.22);
      });
      part(g, 'gn_gunG', m.glow, (b) => {
        b(0.02, 0.02, 0.26, 0.045, 0.08, 0.13);
        b(0.04, 0.04, 0.02, 0, 0.06, 0.3);
      });
      g.rotation.x = Math.PI / 2;
      return g;
    };
    m.handR.add(gun());
    m.handL.add(gun());
    return m;
  }
  if (cls === 'brawler') {
    const m = humanoid({ body: 0x7a6a5a, dark: 0x2e2620, accent, wide: 1.25 });
    m.head.add(mesh(box(0.28, 0.06, 0.28), m.glow, 0, 0.12, 0)); // faixa na testa
    part(m.head, 'br_hair', m.mats[1], (b) => {
      b(0.08, 0.14, 0.24, 0, 0.22, -0.01); // moicano
      b(0.1, 0.1, 0.06, -0.12, 0.13, -0.16, 0.6, 0, 0);
      b(0.1, 0.1, 0.06, 0.12, 0.13, -0.16, 0.6, 0, 0);
    });
    // ombreiras grandes com rebites e alça cruzada
    part(m.torso, 'br_pads', m.mats[1], (b) => {
      for (const sx of [-1, 1]) {
        b(0.3, 0.14, 0.3, sx * 0.38, 0.5, 0);
        b(0.24, 0.08, 0.24, sx * 0.4, 0.6, 0);
      }
      b(0.06, 0.6, 0.03, 0, 0.3, 0.17, 0, 0, 0.7);
    });
    part(m.torso, 'br_padsG', m.glow, (b) => {
      for (const sx of [-1, 1]) for (const z of [-0.08, 0.08]) b(0.04, 0.04, 0.04, sx * 0.48, 0.58, z);
    });
    // pistões nos antebraços
    for (const arm of [m.armL, m.armR]) part(arm, 'br_pist', m.glow, (b) => b(0.03, 0.22, 0.03, 0, -0.3, 0.09));
    // manoplas com soco-inglês neon
    for (const hand of [m.handL, m.handR]) {
      part(hand, 'br_fist', m.mats[1], (b) => {
        b(0.26, 0.26, 0.28, 0, 0, 0.02);
        b(0.3, 0.08, 0.08, 0, -0.06, 0.16);
      });
      part(hand, 'br_fistG', m.glow, (b) => {
        b(0.28, 0.06, 0.3, 0, 0.1, 0.02);
        for (let i = 0; i < 4; i++) b(0.05, 0.05, 0.05, -0.09 + i * 0.06, -0.06, 0.2);
      });
    }
    return m;
  }
  if (cls === 'pyro') {
    const m = humanoid({ body: 0x6a4a40, dark: 0x2a1c18, accent });
    // máscara com respirador, tubos e olhos de lente
    part(m.head, 'py_mask', m.mats[1], (b, a) => {
      b(0.3, 0.3, 0.3, 0, 0.02, 0);
      a(cyl(0.07, 0.09, 0.1, 8), 0, -0.07, 0.18, Math.PI / 2, 0, 0);
      for (const sx of [-1, 1]) a(cyl(0.04, 0.04, 0.1, 6), sx * 0.13, -0.1, 0.12, Math.PI / 2, 0, sx * 0.6);
    });
    part(m.head, 'py_eyes', m.glow, (b, a) => {
      for (const sx of [-1, 1]) a(cyl(0.05, 0.05, 0.03, 8), sx * 0.07, 0.05, 0.16, Math.PI / 2, 0, 0);
    });
    // avental de couro
    part(m.torso, 'py_apron', m.mats[0], (b) => b(0.36, 0.42, 0.04, 0, 0.05, 0.14));
    // tanques nas costas com tampas e mangueira
    for (const x of [-0.11, 0.11]) m.torso.add(mesh(cached('ptank', () => new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8)), glowMat(0xff6a00, 1.2), x, 0.3, -0.22));
    part(m.torso, 'py_caps', m.mats[1], (b, a) => {
      for (const x of [-0.11, 0.11]) {
        a(cyl(0.11, 0.11, 0.05, 8), x, 0.57, -0.22);
        a(cyl(0.11, 0.11, 0.05, 8), x, 0.04, -0.22);
        a(cyl(0.03, 0.03, 0.08, 6), x, 0.62, -0.22);
      }
      a(tor(0.2, 0.025, 5, 10, Math.PI), 0.18, 0.15, -0.1, 0, Math.PI / 2, -Math.PI / 2);
    });
    const gun = new THREE.Group();
    part(gun, 'py_gun', m.mats[1], (b, a) => {
      b(0.1, 0.1, 0.6, 0, 0, 0.25);
      b(0.06, 0.14, 0.06, 0, -0.08, 0.05);
      a(cyl(0.06, 0.06, 0.12, 8), 0, 0.09, 0.2, Math.PI / 2, 0, 0);
    });
    part(gun, 'py_gunG', m.glow, (b, a) => {
      b(0.14, 0.14, 0.08, 0, 0, 0.56);
      a(tor(0.07, 0.015, 5, 10), 0, 0, 0.4);
    });
    const tip = mesh(cached('pflame', () => new THREE.ConeGeometry(0.1, 0.3, 6).rotateX(Math.PI / 2)), glowMat(0xffaa00, 2.6), 0, 0, 0.75);
    tip.visible = false;
    gun.add(tip);
    gun.rotation.x = Math.PI / 2;
    m.handR.add(gun);
    m.flameTip = tip;
    return m;
  }
  if (cls === 'frost') {
    const m = humanoid({ body: 0xc8d4e8, dark: 0x3a4660, accent });
    // casaco longo com gola de pele e cristais de gelo nos ombros
    part(m.torso, 'fr_coat', m.mats[0], (b) => {
      b(0.46, 0.58, 0.05, 0, -0.1, -0.15);
      for (const sx of [-1, 1]) b(0.12, 0.5, 0.05, sx * 0.18, -0.08, 0.13, 0.06, 0, 0);
    });
    part(m.torso, 'fr_fur', extraMat(m, 0xf4f8ff), (b) => b(0.42, 0.1, 0.32, 0, 0.57, 0));
    part(m.torso, 'fr_cry', glowMat(0xbfefff, 2), (b, a) => {
      for (const sx of [-1, 1]) {
        a(oct(0.07), sx * 0.31, 0.62, 0, 0, 0, sx * 0.3, 0.8, 1.8, 0.8);
        a(oct(0.05), sx * 0.36, 0.58, -0.07, 0, 0, sx * 0.7, 0.8, 1.6, 0.8);
      }
    });
    m.head.add(mesh(box(0.3, 0.05, 0.05), m.glow, 0, 0.05, 0.13));
    part(m.head, 'fr_ant', m.mats[0], (b) => {
      b(0.06, 0.2, 0.06, 0.14, 0.1, 0);
      b(0.32, 0.12, 0.3, 0, 0.17, -0.02);
    });
    m.head.add(mesh(oct(0.04), m.glow, 0.14, 0.23, 0));
    // rifle criogênico com mira e cilindro de nitrogênio
    const rifle = new THREE.Group();
    part(rifle, 'fr_rifle', m.mats[1], (b, a) => {
      b(0.07, 0.1, 1.1, 0, 0, 0.35);
      b(0.06, 0.14, 0.06, 0, -0.08, 0.02);
      b(0.08, 0.12, 0.2, 0, -0.02, -0.2);
      a(cyl(0.035, 0.035, 0.22, 8), 0, 0.1, 0.42, Math.PI / 2, 0, 0);
    });
    part(rifle, 'fr_rifleG', m.glow, (b, a) => {
      b(0.03, 0.03, 0.9, 0.05, 0.03, 0.4);
      b(0.08, 0.08, 0.2, 0, 0.09, 0.15);
      a(tor(0.06, 0.015, 5, 10), 0, 0, 0.9);
    });
    rifle.rotation.x = Math.PI / 2;
    m.handR.add(rifle);
    return m;
  }
  if (cls === 'heavy') {
    const m = humanoid({ body: 0x6a6a72, dark: 0x262630, accent, scale: 1.05, wide: 1.4 });
    // elmo pesado com crista e visor
    part(m.head, 'hv_helm', m.mats[0], (b) => {
      b(0.32, 0.3, 0.32, 0, 0.04, 0);
      b(0.06, 0.08, 0.3, 0, 0.21, -0.01);
      for (const sx of [-1, 1]) b(0.04, 0.16, 0.2, sx * 0.17, -0.02, 0.04);
    });
    m.head.add(mesh(box(0.28, 0.06, 0.03), m.glow, 0, 0.05, 0.165));
    // ombreiras em camadas e placa no peito
    part(m.torso, 'hv_armor', m.mats[0], (b) => {
      for (const sx of [-1, 1]) {
        b(0.32, 0.12, 0.34, sx * 0.44, 0.56, 0, 0, 0, sx * -0.25);
        b(0.3, 0.1, 0.32, sx * 0.47, 0.47, 0, 0, 0, sx * -0.45);
      }
      b(0.4, 0.26, 0.05, 0, 0.38, 0.2);
    });
    // mochila de munição com cinta de balas até a arma
    part(m.torso, 'hv_pack', m.mats[1], (b) => {
      b(0.5, 0.5, 0.25, 0, 0.3, -0.27);
      b(0.54, 0.08, 0.29, 0, 0.56, -0.27);
      for (let i = 0; i < 6; i++) b(0.06, 0.07, 0.05, 0.25 + i * 0.03, 0.1 - i * 0.06, -0.05 + i * 0.03, 0, 0, -0.6);
    });
    part(m.torso, 'hv_packG', m.glow, (b) => {
      b(0.06, 0.4, 0.04, 0, 0.3, -0.41);
      for (const sx of [-1, 1]) b(0.04, 0.04, 0.03, sx * 0.17, 0.48, -0.41);
    });
    const gun = new THREE.Group();
    part(gun, 'hv_gun', m.mats[1], (b) => {
      b(0.22, 0.22, 0.4, 0, 0, 0.1);
      b(0.08, 0.16, 0.08, 0, 0.17, 0.0);
      b(0.26, 0.06, 0.06, 0, 0.0, 0.32);
    });
    const barrels = new THREE.Group();
    barrels.position.z = 0.45;
    part(barrels, 'hv_barrels', m.mats[1], (b) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b(0.04, 0.04, 0.6, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0);
      }
      b(0.16, 0.16, 0.04, 0, 0, -0.1);
    });
    part(barrels, 'hv_rings', m.glow, (b, a) => {
      a(tor(0.1, 0.02, 6, 12), 0, 0, 0.28);
      a(tor(0.1, 0.02, 6, 12), 0, 0, 0.05);
    });
    gun.add(barrels);
    gun.rotation.x = Math.PI / 2;
    m.handR.add(gun);
    m.barrels = barrels;
    return m;
  }
  if (cls === 'hunter') {
    const m = humanoid({ body: 0x6a4a5a, dark: 0x2a1c26, accent });
    // capuz pontudo e capa em tiras
    part(m.head, 'hu_hood', m.mats[0], (b, a) => {
      b(0.3, 0.3, 0.3, 0, 0.05, -0.03);
      a(cone(0.15, 0.22, 4), 0, 0.12, -0.2, -1.1, Math.PI / 4, 0);
      b(0.34, 0.05, 0.1, 0, 0.17, 0.1);
    });
    m.head.add(mesh(box(0.22, 0.04, 0.03), m.glow, 0, 0.04, 0.14));
    part(m.torso, 'hu_cape', m.mats[1], (b) => {
      for (let i = 0; i < 3; i++) b(0.15, 0.55 - (i % 2) * 0.08, 0.04, -0.15 + i * 0.15, -0.04 + (i % 2) * 0.04, -0.16, -0.08, 0, 0);
      b(0.46, 0.08, 0.3, 0, 0.56, -0.01);
    });
    // aljava com flechas brilhando e facas no cinto
    const q = mesh(cached('hquiver', () => new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8)), m.mats[1], 0.12, 0.35, -0.2);
    q.rotation.z = 0.35;
    m.torso.add(q);
    part(m.torso, 'hu_arrows', m.glow, (b, a) => {
      for (const dx of [-0.03, 0, 0.03]) {
        b(0.02, 0.18, 0.02, 0.2 + dx, 0.62, -0.2, 0, 0, 0.35);
        a(cone(0.025, 0.05, 4), 0.17 + dx, 0.71, -0.2, 0, 0, 0.35);
      }
      for (const sx of [-1, 1]) b(0.025, 0.14, 0.02, sx * 0.17, -0.03, 0.15, 0, 0, sx * 0.3);
    });
    // arco com empunhadura e pontas curvas
    const bow = new THREE.Group();
    bow.add(mesh(box(0.05, 0.05, 0.16), m.mats[1], 0, 0, 0));
    part(bow, 'hu_bow', m.glow, (b) => {
      for (const sz of [-1, 1]) {
        b(0.04, 0.04, 0.3, 0, -0.035, sz * 0.2, sz * 0.25, 0, 0);
        b(0.035, 0.035, 0.18, 0, -0.1, sz * 0.38, sz * 0.75, 0, 0);
      }
    });
    bow.add(mesh(box(0.012, 0.012, 0.86), glowMat(0xffffff, 1.2), 0, 0.03, 0));
    m.handL.add(bow);
    return m;
  }
  if (cls === 'lancer') {
    const m = humanoid({ body: 0x8a8aa8, dark: 0x2a2a40, accent });
    // elmo com protetor de nariz, asinhas e penacho
    part(m.head, 'ln_helm', m.mats[0], (b) => {
      b(0.3, 0.14, 0.3, 0, 0.12, 0);
      b(0.05, 0.16, 0.24, 0, -0.03, 0.12);
      for (const sx of [-1, 1]) b(0.04, 0.16, 0.18, sx * 0.15, -0.02, 0.03);
    });
    m.head.add(mesh(box(0.24, 0.05, 0.03), m.glow, 0, 0.03, 0.14));
    part(m.head, 'ln_wings', m.glow, (b) => {
      for (const sx of [-1, 1]) {
        b(0.04, 0.12, 0.2, sx * 0.17, 0.18, -0.05, -0.5, 0, 0);
        b(0.03, 0.08, 0.16, sx * 0.19, 0.25, -0.12, -0.8, 0, 0);
      }
    });
    part(m.head, 'ln_plume', extraMat(m, 0xd8c8ff), (b) => {
      for (let i = 0; i < 4; i++) b(0.05, 0.08, 0.1, 0, 0.22 + Math.sin(i * 0.8) * 0.04, 0.08 - i * 0.09, -0.3 - i * 0.2, 0, 0);
    });
    // ombreiras e saia de placas
    part(m.torso, 'ln_armor', m.mats[0], (b) => {
      for (const sx of [-1, 1]) {
        b(0.2, 0.1, 0.24, sx * 0.3, 0.52, 0);
        b(0.18, 0.08, 0.22, sx * 0.34, 0.45, 0, 0, 0, sx * -0.4);
      }
      for (let i = 0; i < 5; i++) b(0.11, 0.2, 0.03, -0.22 + i * 0.11, -0.08, 0.15, 0.1, 0, 0);
      for (let i = 0; i < 5; i++) b(0.11, 0.2, 0.03, -0.22 + i * 0.11, -0.08, -0.15, -0.1, 0, 0);
    });
    // escudo redondo no antebraço
    const shield = new THREE.Group();
    shield.position.set(-0.09, -0.3, 0);
    part(shield, 'ln_shield', m.mats[0], (b, a) => a(cyl(0.2, 0.2, 0.04, 12), 0, 0, 0, 0, 0, Math.PI / 2));
    part(shield, 'ln_shieldG', m.glow, (b, a) => {
      a(tor(0.19, 0.02, 4, 16), -0.025, 0, 0, 0, Math.PI / 2, 0);
      a(oct(0.05), -0.04, 0, 0);
    });
    m.armL.add(shield);
    // lança com guarda e contrapeso
    const spear = new THREE.Group();
    part(spear, 'ln_shaft', m.mats[1], (b) => {
      b(0.04, 0.04, 1.7, 0, 0, 0.35);
      b(0.18, 0.04, 0.05, 0, 0, 1.15);
      b(0.07, 0.07, 0.08, 0, 0, -0.5);
    });
    spear.add(mesh(cached('lspear', () => new THREE.ConeGeometry(0.07, 0.35, 4).rotateX(Math.PI / 2)), m.glow, 0, 0, 1.35));
    spear.add(mesh(box(0.025, 0.025, 1.1), glowMat(0xe0c8ff, 1.6), 0.03, 0, 0.4));
    spear.rotation.x = Math.PI / 2;
    m.handR.add(spear);
    m.weapon = spear;
    return m;
  }
  if (cls === 'biohacker') {
    const m = humanoid({ body: 0x4a5a3a, dark: 0x1e261a, accent });
    // máscara de gás com filtros e capuz
    part(m.head, 'bh_mask', m.mats[1], (b) => {
      b(0.22, 0.12, 0.08, 0, -0.05, 0.14);
      b(0.3, 0.2, 0.3, 0, 0.1, -0.03);
    });
    for (const sx of [-1, 1]) m.head.add(mesh(cached('bfilter', () => new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8).rotateX(Math.PI / 2)), m.glow, sx * 0.09, -0.07, 0.2));
    m.head.add(mesh(box(0.22, 0.05, 0.03), glowMat(0xffffff, 1.4), 0, 0.05, 0.14));
    // jaleco aberto
    part(m.torso, 'bh_coat', extraMat(m, 0xc8d0bc), (b) => {
      for (const sx of [-1, 1]) b(0.14, 0.62, 0.04, sx * 0.17, 0.08, 0.135);
      b(0.46, 0.6, 0.04, 0, 0.1, -0.15);
      b(0.46, 0.06, 0.3, 0, 0.56, 0);
    });
    // tanque de cultura nas costas, frascos no cinto e mangueira
    m.torso.add(mesh(cached('btank', () => new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10)), glowMat(0x9dff3a, 1.3), 0, 0.32, -0.24));
    part(m.torso, 'bh_tankF', m.mats[1], (b, a) => {
      b(0.3, 0.06, 0.3, 0, 0.55, -0.24);
      b(0.3, 0.06, 0.3, 0, 0.09, -0.24);
      for (const sx of [-1, 1]) b(0.03, 0.46, 0.03, sx * 0.13, 0.32, -0.12);
      a(tor(0.16, 0.022, 5, 10, Math.PI), 0.2, 0.25, -0.14, 0, Math.PI / 2, -Math.PI / 2);
    });
    part(m.torso, 'bh_vials', glowMat(0x9dff3a, 2), (b, a) => {
      for (let i = 0; i < 3; i++) a(cyl(0.025, 0.025, 0.1, 6), -0.16 + i * 0.07, 0.02, 0.15);
    });
    const gun = new THREE.Group();
    part(gun, 'bh_gun', m.mats[1], (b) => {
      b(0.09, 0.12, 0.32, 0, 0, 0.1);
      b(0.06, 0.12, 0.06, 0, -0.1, 0.02);
      b(0.05, 0.05, 0.12, 0, 0, 0.3);
    });
    gun.add(mesh(cached('bvial', () => new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6)), m.glow, 0, 0.1, 0.05));
    gun.add(mesh(box(0.02, 0.02, 0.2), m.glow, 0, 0, 0.38));
    gun.rotation.x = Math.PI / 2;
    m.handR.add(gun);
    return m;
  }
  // netrunner
  const m = humanoid({ body: 0x4c6a5e, dark: 0x1e2a25, accent });
  // capuz com aba e bico
  part(m.head, 'nr_hood', m.mats[0], (b, a) => {
    b(0.32, 0.32, 0.32, 0, 0.04, -0.03);
    b(0.34, 0.06, 0.12, 0, 0.18, 0.1);
    a(cone(0.14, 0.2, 4), 0, 0.06, -0.24, -1.3, Math.PI / 4, 0);
  });
  m.head.add(mesh(box(0.24, 0.06, 0.03), m.glow, 0, 0.04, 0.145));
  part(m.head, 'nr_ant', m.glow, (b) => {
    b(0.02, 0.24, 0.02, 0.15, 0.24, -0.08, 0, 0, -0.2);
    b(0.04, 0.04, 0.04, 0.18, 0.36, -0.08);
  });
  // cabos, porta neural e casaco em tiras
  part(m.torso, 'nr_cables', m.glow, (b) => {
    b(0.03, 0.4, 0.03, -0.12, 0.25, -0.15);
    b(0.03, 0.4, 0.03, 0.12, 0.25, -0.15);
    b(0.2, 0.03, 0.03, 0, 0.45, -0.15);
    for (const sx of [-1, 1]) b(0.02, 0.16, 0.02, sx * 0.08, 0.12, 0.12);
  });
  part(m.torso, 'nr_coat', m.mats[0], (b) => {
    for (let i = 0; i < 4; i++) b(0.11, 0.48, 0.04, -0.165 + i * 0.11, -0.12, -0.15, -0.1, 0, (i - 1.5) * 0.06);
  });
  for (const arm of [m.armL, m.armR]) part(arm, 'nr_wrist', m.glow, (b) => b(0.15, 0.03, 0.17, 0, -0.38, 0));
  // deck flutuante com tela holográfica
  const deck = new THREE.Group();
  deck.add(mesh(cached('oct', () => new THREE.OctahedronGeometry(0.13, 0)), m.glow));
  deck.add(mesh(box(0.22, 0.03, 0.16), m.mats[1], 0, -0.16, 0));
  const holo = new THREE.Mesh(cached('nrholo', () => new THREE.PlaneGeometry(0.26, 0.16)), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(gk(1.2)), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  holo.position.set(0, 0.2, 0);
  deck.add(holo);
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
      const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3300).multiplyScalar(gk(2.5)) });
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
    case 'thief': {
      m = humanoid({ body: 0x5a4a22, dark: 0x1e1808, accent: 0xffd23d, scale: 0.85 });
      // mochila cheia de dados roubados
      m.torso.add(mesh(box(0.42, 0.5, 0.28), m.mats[1], 0, 0.3, -0.3));
      m.torso.add(mesh(box(0.3, 0.36, 0.06), glowMat(0xffd23d, 2.6), 0, 0.32, -0.46));
      m.head.add(mesh(box(0.34, 0.08, 0.06), glowMat(0xffd23d, 2.4), 0, 0.04, 0.16)); // visor
      // farol dourado: um feixe alto que aparece por cima das paredes e um anel no chão
      const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(gk(1.6)), transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      const beam = mesh(cached('tbeam', () => new THREE.CylinderGeometry(0.1, 0.22, 9, 10, 1, true)), beamMat, 0, 5, 0);
      beam.renderOrder = 5;
      m.root.add(beam);
      const ring = mesh(cached('tring', () => new THREE.RingGeometry(0.75, 0.95, 28).rotateX(-Math.PI / 2)), beamMat, 0, 0.05, 0);
      ring.renderOrder = 5;
      m.root.add(ring);
      m.beacon = { beam, ring, mat: beamMat };
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
    case 'kamikaze': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x6a4a3a);
      const core = mesh(cached('kcore', () => new THREE.OctahedronGeometry(0.24, 0)), mBody);
      core.scale.set(1, 0.7, 1.5);
      body.add(core);
      body.add(mesh(cached('knose', () => new THREE.ConeGeometry(0.1, 0.35, 6).rotateX(Math.PI / 2)), glowMat(0xff3300, 2.6), 0, 0, 0.42));
      for (const sx of [-1, 1]) body.add(mesh(box(0.42, 0.03, 0.18), mBody, sx * 0.3, 0, -0.1));
      const ring = mesh(cached('kring', () => new THREE.TorusGeometry(0.3, 0.035, 6, 18)), glowMat(0xff8800));
      body.add(ring);
      body.position.y = 1.1;
      m = { root, body, ring, mats: [mBody], kind: 'drone' };
      break;
    }
    case 'illusionist': {
      m = humanoid({ body: 0x5a3a7a, dark: 0x22163a, accent: 0xd04dff, scale: 0.95 });
      m.head.add(mesh(cached('icrown', () => new THREE.TorusGeometry(0.2, 0.025, 6, 16).rotateX(Math.PI / 2)), glowMat(0x00f0ff, 2.6), 0, 0.22, 0));
      m.torso.add(mesh(box(0.5, 0.65, 0.05), m.mats[0], 0, -0.05, -0.16)); // manto
      const orbs = new THREE.Group();
      orbs.position.y = 1.0;
      for (let k = 0; k < 3; k++) {
        const o = mesh(cached('iorb', () => new THREE.OctahedronGeometry(0.08, 0)), glowMat(0xd04dff, 2.8));
        const a = (k / 3) * Math.PI * 2;
        o.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
        orbs.add(o);
      }
      m.root.add(orbs);
      m.orbs = orbs;
      m.kind = 'humanoid';
      break;
    }
    case 'tank': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x6a6450);
      const mDark = lambert(0x26241c);
      body.add(mesh(box(1.1, 0.4, 1.3), mBody, 0, 0.42, 0));
      const treads = [];
      for (const sx of [-1, 1]) {
        const t = mesh(box(0.28, 0.36, 1.45), mDark, sx * 0.62, 0.2, 0);
        body.add(t);
        treads.push(t);
        body.add(mesh(box(0.04, 0.04, 1.3), glowMat(0xffaa00, 1.8), sx * 0.77, 0.3, 0));
      }
      const turret = new THREE.Group();
      turret.position.y = 0.7;
      turret.add(mesh(box(0.7, 0.32, 0.7), mBody));
      // lançadores de mísseis
      for (const sx of [-1, 1]) {
        const pod = new THREE.Group();
        pod.position.set(sx * 0.48, 0.15, 0.05);
        pod.add(mesh(box(0.26, 0.26, 0.55), mDark));
        for (const [x, y] of [[-0.06, 0.06], [0.06, 0.06], [-0.06, -0.06], [0.06, -0.06]]) pod.add(mesh(box(0.07, 0.07, 0.04), glowMat(0xffaa00, 2.4), x, y, 0.28));
        turret.add(pod);
      }
      turret.add(mesh(box(0.4, 0.06, 0.03), glowMat(0xff3355, 2.6), 0, 0.08, 0.36));
      body.add(turret);
      m = { root, body, turret, treads, mats: [mBody, mDark], kind: 'tank' };
      break;
    }
    case 'ghost': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mSheet = new THREE.MeshLambertMaterial({ color: 0xdff4ff, emissive: new THREE.Color(0x4a6a8a), transparent: true, opacity: 0.5, depthWrite: false });
      const sheet = new THREE.Group();
      const cloth = mesh(cached('gcloth', () => new THREE.ConeGeometry(0.5, 1.3, 9, 1, true)), mSheet, 0, 0.75, 0);
      cloth.material.side = THREE.DoubleSide;
      sheet.add(cloth);
      sheet.add(mesh(cached('ghead', () => new THREE.SphereGeometry(0.34, 12, 10)), mSheet, 0, 1.45, 0));
      body.add(sheet);
      for (const sx of [-1, 1]) body.add(mesh(box(0.09, 0.12, 0.04), glowMat(0x7affc8, 3), sx * 0.11, 1.48, 0.3));
      body.add(mesh(box(0.14, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 1.32, 0.31));
      m = { root, body, sheet, mats: [mSheet], kind: 'ghost' };
      break;
    }
    case 'wisp': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mCore = lambert(0x2a5a4a);
      body.add(mesh(cached('wcore', () => new THREE.SphereGeometry(0.16, 10, 8)), glowMat(0x7affc8, 3)));
      body.add(mesh(cached('whalo', () => new THREE.SphereGeometry(0.28, 10, 8)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affc8).multiplyScalar(gk(1.2)), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })));
      body.position.y = 1.1;
      m = { root, body, mats: [mCore], kind: 'wisp' };
      break;
    }
    case 'boar': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mFur = lambert(0x6a4a34);
      const mDark = lambert(0x2a1c14);
      body.add(mesh(box(0.6, 0.55, 1.0), mFur, 0, 0.6, 0));
      body.add(mesh(box(0.08, 0.2, 0.7), glowMat(0xff8a00, 1.6), 0, 0.92, -0.05)); // crista
      const head = mesh(box(0.45, 0.42, 0.45), mFur, 0, 0.6, 0.65);
      body.add(head);
      head.add(mesh(box(0.25, 0.18, 0.12), mDark, 0, -0.06, 0.26));
      for (const sx of [-1, 1]) {
        const tusk = mesh(cached('tusk', () => new THREE.ConeGeometry(0.04, 0.25, 5)), glowMat(0xfff0c8, 1.6), sx * 0.15, -0.12, 0.3);
        tusk.rotation.x = -1.2;
        head.add(tusk);
        head.add(mesh(box(0.06, 0.06, 0.03), glowMat(0xff3300, 2.6), sx * 0.12, 0.08, 0.23));
      }
      const legs = [];
      for (const [x, z] of [[0.2, 0.32], [-0.2, 0.32], [0.2, -0.32], [-0.2, -0.32]]) {
        const lg = new THREE.Group();
        lg.position.set(x, 0.4, z);
        lg.add(mesh(box(0.14, 0.4, 0.14), mDark, 0, -0.2, 0));
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, headM: head, mats: [mFur, mDark], kind: 'quad' };
      break;
    }
    case 'toad': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mSkin = lambert(0x4a8a3a);
      const b = mesh(cached('tbody', () => new THREE.SphereGeometry(0.42, 12, 9)), mSkin, 0, 0.38, 0);
      b.scale.set(1.1, 0.75, 1.15);
      body.add(b);
      body.add(mesh(cached('tsac', () => new THREE.SphereGeometry(0.2, 10, 8)), glowMat(0x9dff3a, 1.5), 0, 0.3, 0.38)); // papo ácido
      for (const sx of [-1, 1]) {
        body.add(mesh(cached('teye', () => new THREE.SphereGeometry(0.11, 8, 6)), lambert(0xe8e0a0), sx * 0.2, 0.68, 0.2));
        body.add(mesh(box(0.05, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: 0x000000 }), sx * 0.2, 0.68, 0.31));
      }
      const legs = [];
      for (const [x, z] of [[0.32, 0.2], [-0.32, 0.2], [0.34, -0.25], [-0.34, -0.25]]) {
        const lg = new THREE.Group();
        lg.position.set(x, 0.2, z);
        lg.add(mesh(box(0.14, 0.2, 0.22), mSkin, 0, -0.1, 0));
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, mats: [mSkin], kind: 'quad', hop: true };
      break;
    }
    case 'alien': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mShell = lambert(0x22182e);
      const torso = mesh(box(0.42, 0.35, 0.9), mShell, 0, 0.7, 0);
      torso.rotation.x = -0.25;
      body.add(torso);
      const head = mesh(cached('ahead', () => new THREE.CapsuleGeometry(0.16, 0.6, 4, 8)), mShell, 0, 0.95, 0.55);
      head.rotation.x = Math.PI / 2 - 0.3;
      body.add(head);
      body.add(mesh(box(0.2, 0.04, 0.04), glowMat(0xb36bff, 2.6), 0, 1.0, 0.75));
      const tail = new THREE.Group();
      tail.position.set(0, 0.75, -0.45);
      tail.add(mesh(box(0.08, 0.08, 0.9), mShell, 0, 0, -0.45));
      tail.add(mesh(cached('atip', () => new THREE.ConeGeometry(0.07, 0.25, 5).rotateX(-Math.PI / 2)), glowMat(0xb36bff, 2), 0, 0, -0.95));
      body.add(tail);
      const legs = [];
      for (const [x, z] of [[0.24, 0.3], [-0.24, 0.3], [0.24, -0.25], [-0.24, -0.25]]) {
        const lg = new THREE.Group();
        lg.position.set(x, 0.6, z);
        const leg = mesh(box(0.07, 0.65, 0.07), mShell, x * 0.6, -0.3, 0);
        leg.rotation.z = x > 0 ? -0.35 : 0.35;
        lg.add(leg);
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, tail, mats: [mShell], kind: 'quad' };
      break;
    }
    case 'scorpion': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mShell = lambert(0x7a5a2a);
      const mDark = lambert(0x3a2a14);
      const b = mesh(cached('sbody', () => new THREE.SphereGeometry(0.4, 10, 8)), mShell, 0, 0.35, 0);
      b.scale.set(1, 0.5, 1.3);
      body.add(b);
      const tail = new THREE.Group();
      tail.position.set(0, 0.45, -0.45);
      let prev = tail;
      for (let k = 0; k < 4; k++) {
        const seg = new THREE.Group();
        seg.position.set(0, 0.18, k === 0 ? 0 : -0.05);
        seg.rotation.x = -0.45;
        seg.add(mesh(box(0.16 - k * 0.02, 0.2, 0.16 - k * 0.02), mShell, 0, 0.1, 0));
        prev.add(seg);
        prev = seg;
      }
      prev.add(mesh(cached('sting', () => new THREE.ConeGeometry(0.07, 0.25, 5)), glowMat(0xc8ff3a, 2.4), 0, 0.3, 0.1));
      body.add(tail);
      const claws = [];
      for (const sx of [-1, 1]) {
        const claw = new THREE.Group();
        claws.push(claw);
        claw.position.set(sx * 0.3, 0.35, 0.45);
        claw.add(mesh(box(0.1, 0.1, 0.35), mShell, 0, 0, 0.1));
        claw.add(mesh(box(0.2, 0.12, 0.2), mDark, 0, 0, 0.35));
        body.add(claw);
      }
      const legs = [];
      for (let k = 0; k < 6; k++) {
        const sx = k < 3 ? -1 : 1;
        const lg = new THREE.Group();
        lg.position.set(sx * 0.3, 0.3, 0.25 - (k % 3) * 0.25);
        const leg = mesh(box(0.4, 0.05, 0.05), mDark, sx * 0.2, -0.1, 0);
        leg.rotation.z = sx * -0.5;
        lg.add(leg);
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, tail, claws, mats: [mShell, mDark], kind: 'quad' };
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
      const eyesMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff14).multiplyScalar(gk(2.6)) });
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
    case 'scrap': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x7a6a50);
      const mDark = lambert(0x2e2a22);
      const mRust = lambert(0x8a4a2a);
      body.add(mesh(box(1.8, 1.4, 1.3), mBody, 0, 1.6, 0));
      body.add(mesh(box(0.9, 0.7, 0.8), mRust, 0, 2.6, 0.05));
      body.add(mesh(box(0.6, 0.1, 0.05), glowMat(0xffaa00, 2.2), 0, 2.65, 0.46));
      // ímã no peito
      const mag = new THREE.Group();
      mag.position.set(0, 1.7, 0.68);
      mag.add(mesh(box(0.7, 0.5, 0.1), mDark));
      mag.add(mesh(box(0.2, 0.5, 0.12), glowMat(0xff2244, 2), -0.25, 0, 0));
      mag.add(mesh(box(0.2, 0.5, 0.12), glowMat(0x2b8cff, 2), 0.25, 0, 0));
      body.add(mag);
      for (const sx of [-1, 1]) {
        body.add(mesh(box(0.55, 1.0, 0.6), mDark, sx * 0.55, 0.5, 0)); // pernas
        const arm = new THREE.Group();
        arm.position.set(sx * 1.15, 2.0, 0);
        arm.add(mesh(box(0.5, 1.5, 0.5), mRust, 0, -0.6, 0));
        arm.add(mesh(box(0.75, 0.6, 0.75), mDark, 0, -1.45, 0));
        body.add(arm);
      }
      // sucata espalhada no corpo
      for (let k = 0; k < 7; k++) {
        const j = mesh(box(0.2 + Math.random() * 0.35, 0.15 + Math.random() * 0.3, 0.2 + Math.random() * 0.3), k % 2 ? mRust : mDark, (Math.random() - 0.5) * 1.6, 1.1 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
        j.rotation.set(Math.random(), Math.random(), Math.random());
        body.add(j);
      }
      m = { root, body, mag, mats: [mBody, mDark, mRust], kind: 'bigboss' };
      break;
    }
    case 'reaper': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mCloak = new THREE.MeshLambertMaterial({ color: 0x2a1a3a, transparent: true, opacity: 0.92 });
      const mDark = lambert(0x110a18);
      const cloak = mesh(cached('rcloak', () => new THREE.ConeGeometry(0.7, 2.2, 7)), mCloak, 0, 1.4, 0);
      body.add(cloak);
      body.add(mesh(cached('rhood', () => new THREE.SphereGeometry(0.38, 10, 8)), mCloak, 0, 2.5, 0));
      body.add(mesh(box(0.34, 0.08, 0.05), glowMat(0xb36bff, 3), 0, 2.48, 0.32));
      const scythe = new THREE.Group();
      scythe.position.set(0.7, 1.6, 0.2);
      scythe.add(mesh(box(0.06, 2.6, 0.06), mDark));
      const blade = mesh(box(1.2, 0.08, 0.06), glowMat(0xb36bff, 2.6), -0.5, 1.25, 0);
      blade.rotation.z = -0.35;
      scythe.add(blade);
      body.add(scythe);
      body.position.y = 0.2;
      m = { root, body, scythe, mats: [mCloak, mDark], kind: 'bigboss', float: true };
      break;
    }
    case 'gunship': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x4a5a70);
      const mDark = lambert(0x1a2230);
      body.add(mesh(box(1.4, 0.8, 2.6), mBody, 0, 0, 0));
      body.add(mesh(box(1.0, 0.5, 0.8), glowMat(0x00f0ff, 1.6), 0, 0.3, 1.0)); // cabine
      body.add(mesh(box(0.4, 0.4, 1.6), mDark, 0, 0.1, -1.9)); // cauda
      const rotors = [];
      for (const sx of [-1, 1]) {
        body.add(mesh(box(1.0, 0.12, 0.3), mDark, sx * 1.1, 0.1, 0));
        const rotor = new THREE.Group();
        rotor.position.set(sx * 1.7, 0.3, 0);
        rotor.add(mesh(box(1.6, 0.04, 0.16), mDark));
        rotor.add(mesh(box(0.16, 0.04, 1.6), mDark));
        rotor.add(mesh(cached('grot', () => new THREE.TorusGeometry(0.85, 0.03, 6, 24).rotateX(Math.PI / 2)), glowMat(0x00f0ff, 1.8)));
        body.add(rotor);
        rotors.push(rotor);
        body.add(mesh(box(0.15, 0.15, 0.7), mDark, sx * 0.55, -0.45, 1.0)); // canhões
      }
      body.position.y = 2.4;
      m = { root, body, rotors, mats: [mBody, mDark], kind: 'bigboss', flying: true };
      break;
    }
    case 'hacker': {
      m = humanoid({ body: 0x2a3a30, dark: 0x0e1612, accent: 0x39ff14, scale: 1.25 });
      m.torso.add(mesh(box(0.5, 0.75, 0.05), m.mats[0], 0, -0.15, -0.16));
      m.head.add(mesh(box(0.34, 0.34, 0.34), m.mats[0], 0, 0.04, -0.02));
      const screens = new THREE.Group();
      screens.position.y = 1.4;
      const scrMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff14).multiplyScalar(gk(1.4)), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
      for (let k = 0; k < 3; k++) {
        const scr = new THREE.Mesh(cached('hscr', () => new THREE.PlaneGeometry(0.7, 0.45)), scrMat);
        const a = (k / 3) * Math.PI * 2;
        scr.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
        scr.rotation.y = -a + Math.PI / 2;
        screens.add(scr);
      }
      m.root.add(screens);
      m.screens = screens;
      m.kind = 'humanoid';
      break;
    }
    case 'omega': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mDark = lambert(0x2a2030);
      body.add(mesh(cached('obase', () => new THREE.CylinderGeometry(1.3, 1.6, 0.6, 10)), mDark, 0, 0.3, 0));
      const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(gk(2.2)) });
      const core = mesh(cached('ocore', () => new THREE.IcosahedronGeometry(0.8, 1)), coreMat, 0, 2.2, 0);
      body.add(core);
      const rings = [];
      for (let k = 0; k < 3; k++) {
        const ring = mesh(cached('oring' + k, () => new THREE.TorusGeometry(1.2 + k * 0.25, 0.06, 6, 36)), k === 1 ? glowMat(0x00f0ff, 1.8) : mDark, 0, 2.2, 0);
        ring.rotation.x = k * 0.9;
        body.add(ring);
        rings.push(ring);
      }
      const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(gk(1.2)), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
      const shield = mesh(cached('oshield', () => new THREE.SphereGeometry(2.1, 20, 14)), shieldMat, 0, 2.0, 0);
      body.add(shield);
      m = { root, body, core, coreMat, rings, shield, shieldMat, mats: [mDark], kind: 'bigboss' };
      break;
    }
    case 'pylon': {
      const root = new THREE.Group();
      const mDark = lambert(0x3a3040);
      root.add(mesh(box(0.7, 0.3, 0.7), mDark, 0, 0.15, 0));
      root.add(mesh(cached('pyl', () => new THREE.CylinderGeometry(0.15, 0.32, 1.8, 6)), mDark, 0, 1.1, 0));
      const top = mesh(cached('pytop', () => new THREE.OctahedronGeometry(0.28, 0)), glowMat(0x00f0ff, 2.2), 0, 2.2, 0);
      root.add(top);
      m = { root, body: root, top, mats: [mDark], kind: 'pylon' };
      break;
    }
    case 'yeti': {
      m = humanoid({ body: 0xe8eef4, dark: 0x9aa8b8, accent: 0x8ad8ff, scale: 1.4, wide: 1.45 });
      // pelo nos ombros, chifres e braços mecânicos
      m.torso.add(mesh(box(0.8, 0.22, 0.42), m.mats[0], 0, 0.55, 0));
      for (const sx of [-1, 1]) {
        const horn = mesh(cached('yhorn', () => new THREE.ConeGeometry(0.06, 0.3, 5)), lambert(0xd8d0c0), sx * 0.13, 0.22, 0);
        horn.rotation.z = -sx * 0.5;
        m.head.add(horn);
      }
      m.handR.add(mesh(box(0.24, 0.24, 0.24), m.glow, 0, 0, 0));
      m.handL.add(mesh(box(0.24, 0.24, 0.24), m.mats[1], 0, 0, 0));
      m.kind = 'humanoid';
      break;
    }
    case 'magmagolem': {
      m = humanoid({ body: 0x3a2a26, dark: 0x1a1210, accent: 0xff5a1a, scale: 1.5, wide: 1.55, glowK: 2.8 });
      // rachaduras de magma pelo corpo
      m.torso.add(mesh(box(0.06, 0.4, 0.02), m.glow, 0.12, 0.25, 0.21));
      m.torso.add(mesh(box(0.3, 0.05, 0.02), m.glow, -0.05, 0.12, 0.21));
      m.torso.add(mesh(box(0.38, 0.28, 0.38), m.mats[1], 0.42, 0.5, 0));
      m.torso.add(mesh(box(0.38, 0.28, 0.38), m.mats[1], -0.42, 0.5, 0));
      m.handR.add(mesh(box(0.28, 0.28, 0.28), m.glow, 0, 0, 0));
      m.handL.add(mesh(box(0.28, 0.28, 0.28), m.glow, 0, 0, 0));
      m.kind = 'humanoid';
      break;
    }
    case 'flamer': {
      m = humanoid({ body: 0x6a3a2a, dark: 0x2a1810, accent: 0xff6a00 });
      // tanque de combustível nas costas e máscara
      m.torso.add(mesh(cached('ftank', () => new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8)), lambert(0xa83a1a), -0.1, 0.3, -0.22));
      m.torso.add(mesh(cached('ftank', () => new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8)), lambert(0xa83a1a), 0.1, 0.3, -0.22));
      m.head.add(mesh(box(0.2, 0.12, 0.08), m.mats[1], 0, -0.06, 0.15));
      const gun = new THREE.Group();
      gun.add(mesh(box(0.08, 0.1, 0.5), m.mats[1], 0, 0, 0.2));
      gun.add(mesh(box(0.05, 0.05, 0.08), glowMat(0xff6a00, 2.8), 0, 0, 0.48));
      gun.rotation.x = Math.PI / 2;
      m.handR.add(gun);
      m.kind = 'humanoid';
      break;
    }
    case 'icewolf':
    case 'hound': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const ice = type === 'icewolf';
      const mFur = lambert(ice ? 0xc8d8e8 : 0x3a3e4a);
      const mDark = lambert(ice ? 0x7a8aa0 : 0x1a1c24);
      const eye = glowMat(ice ? 0x8ad8ff : 0xff2244, 2.8);
      body.add(mesh(box(0.36, 0.38, 0.9), mFur, 0, 0.6, 0));
      if (!ice) body.add(mesh(box(0.06, 0.06, 0.8), eye, 0, 0.8, 0)); // espinha de led
      const head = mesh(box(0.32, 0.3, 0.36), mFur, 0, 0.72, 0.55);
      body.add(head);
      head.add(mesh(box(0.18, 0.14, 0.24), mDark, 0, -0.06, 0.24));
      for (const sx of [-1, 1]) {
        head.add(mesh(cached('wear', () => new THREE.ConeGeometry(0.06, 0.16, 4)), mDark, sx * 0.1, 0.2, -0.04));
        head.add(mesh(box(0.05, 0.04, 0.03), eye, sx * 0.09, 0.05, 0.19));
      }
      const tail = new THREE.Group();
      tail.position.set(0, 0.72, -0.45);
      tail.add(mesh(box(0.1, 0.1, 0.45), mFur, 0, 0, -0.2));
      body.add(tail);
      const legs = [];
      for (const [x, z] of [[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]]) {
        const lg = new THREE.Group();
        lg.position.set(x, 0.42, z);
        lg.add(mesh(box(0.1, 0.42, 0.1), mDark, 0, -0.42 / 2, 0));
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, tail, headM: head, mats: [mFur, mDark], kind: 'quad' };
      break;
    }
    case 'goat': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mFur = lambert(0x8a7a68);
      const mDark = lambert(0x3a3028);
      body.add(mesh(box(0.45, 0.5, 0.85), mFur, 0, 0.62, 0));
      body.add(mesh(box(0.47, 0.18, 0.6), lambert(0x5a6070), 0, 0.88, 0)); // placa blindada
      const head = mesh(box(0.3, 0.32, 0.4), mFur, 0, 0.82, 0.55);
      body.add(head);
      for (const sx of [-1, 1]) {
        const horn = mesh(cached('ghorn', () => new THREE.TorusGeometry(0.14, 0.045, 5, 10, Math.PI * 1.3)), glowMat(0xffb35a, 1.5), sx * 0.15, 0.12, -0.02);
        horn.rotation.y = Math.PI / 2;
        head.add(horn);
        head.add(mesh(box(0.05, 0.05, 0.03), glowMat(0xffb35a, 2.6), sx * 0.09, 0.04, 0.21));
      }
      head.add(mesh(box(0.08, 0.16, 0.06), mDark, 0, -0.2, 0.12)); // barbicha
      const legs = [];
      for (const [x, z] of [[0.15, 0.28], [-0.15, 0.28], [0.15, -0.28], [-0.15, -0.28]]) {
        const lg = new THREE.Group();
        lg.position.set(x, 0.42, z);
        lg.add(mesh(box(0.11, 0.42, 0.11), mDark, 0, -0.42 / 2, 0));
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, headM: head, mats: [mFur, mDark], kind: 'quad' };
      break;
    }
    case 'salamander': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mSkin = lambert(0x3a1a10);
      const b = mesh(box(0.42, 0.24, 0.95), mSkin, 0, 0.3, 0);
      body.add(b);
      for (let k = 0; k < 3; k++) body.add(mesh(box(0.44, 0.04, 0.08), glowMat(0xff6a00, 2.2), 0, 0.43, 0.3 - k * 0.3)); // listras de magma
      const head = mesh(box(0.34, 0.2, 0.34), mSkin, 0, 0.32, 0.62);
      body.add(head);
      for (const sx of [-1, 1]) head.add(mesh(box(0.06, 0.06, 0.04), glowMat(0xffd23d, 3), sx * 0.12, 0.08, 0.15));
      const tail = new THREE.Group();
      tail.position.set(0, 0.3, -0.48);
      tail.add(mesh(cached('stail', () => new THREE.ConeGeometry(0.12, 0.7, 5).rotateX(-Math.PI / 2)), mSkin, 0, 0, -0.3));
      body.add(tail);
      const legs = [];
      for (const [x, z] of [[0.26, 0.28], [-0.26, 0.28], [0.26, -0.28], [-0.26, -0.28]]) {
        const lg = new THREE.Group();
        lg.position.set(x, 0.2, z);
        lg.add(mesh(box(0.1, 0.2, 0.1), mSkin, 0, -0.2 / 2, 0));
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, tail, headM: head, mats: [mSkin], kind: 'quad' };
      break;
    }
    case 'mortar': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x5a5a48);
      const mDark = lambert(0x22221a);
      body.add(mesh(cached('mbase', () => new THREE.CylinderGeometry(0.42, 0.48, 0.32, 8)), mBody, 0, 0.75, 0));
      const tube = new THREE.Group();
      tube.position.set(0, 0.95, 0);
      tube.rotation.x = 0.7;
      tube.add(mesh(cached('mtube', () => new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8)), mDark, 0, 0.3, 0));
      tube.add(mesh(cached('mtip', () => new THREE.TorusGeometry(0.14, 0.03, 6, 14).rotateX(Math.PI / 2)), glowMat(0xffaa00, 2.4), 0, 0.66, 0));
      body.add(tube);
      body.add(mesh(box(0.3, 0.05, 0.03), glowMat(0xffaa00, 2.4), 0, 0.8, 0.46));
      const legs = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const lg = new THREE.Group();
        lg.position.set(Math.cos(a) * 0.35, 0.7, Math.sin(a) * 0.35);
        const leg = mesh(box(0.08, 0.75, 0.08), mDark, 0, -0.33, 0);
        leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
        lg.add(leg);
        body.add(lg);
        legs.push(lg);
      }
      m = { root, body, legs, tube, mats: [mBody, mDark], kind: 'quad' };
      break;
    }
    case 'tesladrone': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x3a4a5a);
      body.add(mesh(cached('tcore', () => new THREE.OctahedronGeometry(0.28, 0)), mBody));
      for (const sx of [-1, 1]) {
        body.add(mesh(cached('tcoil', () => new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8)), mBody, sx * 0.34, 0, 0));
        body.add(mesh(cached('tball', () => new THREE.SphereGeometry(0.09, 8, 6)), glowMat(0x00f0ff, 3), sx * 0.34, 0.24, 0));
      }
      const ring = mesh(cached('tring', () => new THREE.TorusGeometry(0.36, 0.03, 6, 20)), glowMat(0x00f0ff, 2.4));
      ring.rotation.x = Math.PI / 2;
      body.add(ring);
      body.position.y = 1.2;
      m = { root, body, ring, mats: [mBody], kind: 'drone' };
      break;
    }
    case 'eagle': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mFeather = lambert(0x6a4a2a);
      const mMetal = lambert(0x8a909a);
      const torso = mesh(cached('etorso', () => new THREE.SphereGeometry(0.26, 10, 8)), mFeather);
      torso.scale.set(0.9, 0.8, 1.5);
      body.add(torso);
      const head = mesh(cached('ehead', () => new THREE.SphereGeometry(0.15, 10, 8)), lambert(0xf0ece0), 0, 0.1, 0.38);
      body.add(head);
      head.add(mesh(cached('ebeak', () => new THREE.ConeGeometry(0.05, 0.16, 5).rotateX(Math.PI / 2)), glowMat(0xffd23d, 1.8), 0, -0.03, 0.15));
      head.add(mesh(box(0.2, 0.03, 0.03), glowMat(0xff2244, 2.8), 0, 0.03, 0.1)); // visor biônico
      const wings = [];
      for (const sx of [-1, 1]) {
        const w = new THREE.Group();
        w.position.set(sx * 0.2, 0.05, 0);
        w.add(mesh(box(0.75, 0.04, 0.36), mFeather, sx * 0.38, 0, 0));
        w.add(mesh(box(0.5, 0.05, 0.08), mMetal, sx * 0.3, 0.02, 0.14));
        body.add(w);
        wings.push(w);
      }
      body.add(mesh(box(0.24, 0.04, 0.3), mFeather, 0, 0, -0.42)); // cauda
      body.position.y = 1.6;
      m = { root, body, wings, mats: [mFeather, mMetal], kind: 'bird' };
      break;
    }
    case 'boss': {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const mBody = lambert(0x6a6e88);
      const mDark = lambert(0x2a2c3a);
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(gk(2.5)) });
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
  decorate(type, m);
  if (eliteColor) {
    const er = mesh(cached('elring', () => new THREE.RingGeometry(0.55, 0.68, 28).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(eliteColor).multiplyScalar(gk(2)), transparent: true, opacity: 0.85, depthWrite: false }));
    er.position.y = 0.03;
    m.root.add(er);
    m.eliteRing = er;
  }
  return m;
}

// --------------------------------------------------------------
// Detalhes extras dos inimigos e chefes (peças fundidas: poucos draw calls a mais)
// --------------------------------------------------------------
const metal = (m) => m.metal || (m.metal = extraMat(m, 0xa8adb8));
function decorate(type, m) {
  const PI = Math.PI;
  switch (type) {
    case 'punk': {
      part(m.head, 'e_punk_hair', m.glow, (b, a) => {
        for (let i = 0; i < 4; i++) a(cone(0.035, 0.16, 4), 0, 0.24, 0.1 - i * 0.07, -0.3, 0, 0);
      });
      part(m.torso, 'e_punk_pad', m.mats[1], (b) => {
        b(0.22, 0.12, 0.25, -0.32, 0.54, 0);
        for (const sx of [-1, 1]) b(0.12, 0.4, 0.05, sx * 0.17, 0.3, 0.15, 0, 0, sx * 0.08); // jaqueta aberta
      });
      part(m.torso, 'e_punk_spk', metal(m), (b, a) => {
        for (const z of [-0.08, 0, 0.08]) a(cone(0.03, 0.12, 4), -0.36, 0.65, z, 0, 0, 0.4);
        b(0.3, 0.03, 0.03, 0, 0.0, 0.15); // corrente
      });
      break;
    }
    case 'soldier': {
      part(m.head, 'e_sol_helm', m.mats[0], (b) => {
        b(0.34, 0.03, 0.36, 0, 0.1, 0.02);
        for (const sx of [-1, 1]) b(0.04, 0.14, 0.2, sx * 0.16, 0.02, 0);
      });
      part(m.torso, 'e_sol_vest', m.mats[1], (b) => {
        for (const x of [-0.12, 0, 0.12]) b(0.09, 0.1, 0.05, x, 0.2, 0.14);
        b(0.24, 0.28, 0.12, 0, 0.34, -0.22); // rádio
        b(0.015, 0.4, 0.015, 0.08, 0.66, -0.24);
      });
      const rifle = m.handR.children[0];
      part(rifle, 'e_sol_rifle', m.mats[1], (b, a) => {
        b(0.05, 0.14, 0.08, 0, -0.1, 0.24);
        b(0.06, 0.1, 0.14, 0, -0.02, -0.12);
        a(cyl(0.03, 0.03, 0.14, 6), 0, 0.08, 0.1, PI / 2, 0, 0);
      });
      m.head.add(mesh(box(0.06, 0.06, 0.04), glowMat(0xff2244, 3), 0.15, 0.1, 0.08)); // lanterna
      break;
    }
    case 'brute': {
      part(m.torso, 'e_brute_spk', m.glow, (b, a) => {
        for (const sx of [-1, 1]) for (const z of [-0.09, 0.09]) a(cone(0.05, 0.2, 4), sx * 0.46, 0.7, z, 0, 0, -sx * 0.3);
        b(0.1, 0.06, 0.03, 0, 0.02, 0.22);
      });
      part(m.head, 'e_brute_jaw', metal(m), (b) => {
        b(0.24, 0.1, 0.08, 0, -0.1, 0.14);
        for (const sx of [-1, 1]) b(0.03, 0.07, 0.03, sx * 0.08, -0.03, 0.18);
      });
      part(m.handR, 'e_brute_knk', metal(m), (b, a) => {
        for (const x of [-0.07, 0, 0.07]) a(cone(0.035, 0.1, 4), x, 0, 0.16, PI / 2, 0, 0);
      });
      break;
    }
    case 'sniper': {
      const rifle = m.handR.children[0];
      part(rifle, 'e_sn_scope', m.mats[1], (b, a) => {
        a(cyl(0.035, 0.045, 0.28, 8), 0, 0.13, 0.25, PI / 2, 0, 0);
        for (const sx of [-1, 1]) b(0.015, 0.22, 0.015, sx * 0.04, -0.12, 0.7, 0, 0, sx * 0.3);
      });
      rifle.add(mesh(box(0.05, 0.05, 0.02), glowMat(0xff2244, 3), 0, 0.13, 0.4));
      part(m.torso, 'e_sn_ghillie', m.mats[1], (b) => {
        for (let i = 0; i < 5; i++) b(0.09, 0.52 - (i % 2) * 0.1, 0.03, -0.18 + i * 0.09, 0.02 + (i % 2) * 0.05, -0.17, -0.1, 0, (i - 2) * 0.08);
      });
      break;
    }
    case 'shield': {
      part(m.torso, 'e_sh_pads', m.mats[0], (b) => {
        for (const sx of [-1, 1]) b(0.22, 0.1, 0.27, sx * 0.34, 0.54, 0);
      });
      part(m.head, 'e_sh_crest', glowMat(0x4d9bff, 2.2), (b) => b(0.04, 0.08, 0.3, 0, 0.24, 0));
      part(m.shield, 'e_sh_emblem', glowMat(0x4d9bff, 2.2), (b, a) => {
        a(tor(0.17, 0.025, 4, 16), 0, 0.1, 0.05);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) b(0.05, 0.05, 0.03, sx * 0.34, sy * 0.44, 0.04);
      });
      break;
    }
    case 'thief': {
      part(m.head, 'e_th_cap', m.mats[1], (b) => {
        b(0.3, 0.12, 0.3, 0, 0.14, -0.01);
        b(0.28, 0.03, 0.14, 0, 0.1, 0.18);
      });
      part(m.torso, 'e_th_scarf', extraMat(m, 0xa8401a), (b) => {
        b(0.34, 0.09, 0.3, 0, 0.55, 0);
        b(0.08, 0.3, 0.03, 0.1, 0.38, 0.16, -0.15, 0, 0.1);
      });
      part(m.torso, 'e_th_straps', m.mats[1], (b) => {
        for (const sx of [-1, 1]) b(0.05, 0.5, 0.03, sx * 0.12, 0.3, 0.15);
      });
      break;
    }
    case 'ninja': {
      part(m.torso, 'e_nj_katana', m.mats[1], (b) => {
        b(0.04, 0.8, 0.04, 0, 0.32, -0.2, 0, 0, 0.7);
        b(0.12, 0.03, 0.08, -0.17, 0.5, -0.2, 0, 0, 0.7);
      });
      part(m.head, 'e_nj_mask', m.mats[0], (b) => {
        b(0.28, 0.13, 0.27, 0, -0.04, 0.01);
        for (const sx of [-1, 1]) b(0.04, 0.12, 0.04, sx * 0.1, 0.19, 0.02, 0, 0, -sx * 0.3); // orelhas da máscara
      });
      break;
    }
    case 'illusionist': {
      part(m.torso, 'e_il_robe', m.mats[0], (b, a) => {
        for (const sx of [-1, 1]) b(0.06, 0.32, 0.24, sx * 0.19, 0.68, -0.02, 0, 0, sx * 0.25);
        b(0.36, 0.3, 0.06, 0, 0.68, -0.15);
        a(cyl(0.22, 0.36, 0.5, 8), 0, -0.14, 0);
      });
      part(m.head, 'e_il_gem', glowMat(0x00f0ff, 2.6), (b, a) => {
        a(oct(0.045), 0, 0.12, 0.14);
        for (let i = 0; i < 5; i++) a(cone(0.025, 0.09, 4), Math.cos((i / 5) * PI * 2) * 0.2, 0.28, Math.sin((i / 5) * PI * 2) * 0.2);
      });
      break;
    }
    case 'hacker': {
      part(m.torso, 'e_hk_mantle', m.mats[1], (b, a) => {
        b(0.6, 0.1, 0.36, 0, 0.58, 0);
        for (const sx of [-1, 1]) a(cone(0.06, 0.24, 4), sx * 0.3, 0.68, -0.05, 0, 0, -sx * 0.5);
        for (let i = 0; i < 4; i++) b(0.12, 0.6, 0.04, -0.18 + i * 0.12, -0.25, -0.16, -0.12, 0, (i - 1.5) * 0.05);
      });
      part(m.torso, 'e_hk_lines', m.glow, (b) => {
        for (const sx of [-1, 1]) {
          b(0.02, 0.5, 0.02, sx * 0.15, -0.12, -0.19);
          b(0.02, 0.3, 0.02, sx * 0.08, 0.36, -0.2);
        }
        b(0.32, 0.02, 0.02, 0, 0.12, -0.19);
      });
      part(m.screens, 'e_hk_cubes', glowMat(0x39ff14, 2.4), (b) => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * PI * 2 + 0.5;
          b(0.08, 0.08, 0.08, Math.cos(a) * 0.75, 0.55 + (i % 2) * 0.2, Math.sin(a) * 0.75, a, a, 0);
        }
      });
      break;
    }
    case 'yeti': {
      for (const arm of [m.armL, m.armR]) part(arm, 'e_ye_fur', m.mats[0], (b) => b(0.19, 0.16, 0.21, 0, -0.14, 0));
      for (const hand of [m.handL, m.handR]) {
        part(hand, 'e_ye_claw', extraMat(m, 0xe8e0d0), (b, a) => {
          for (const x of [-0.07, 0, 0.07]) a(cone(0.03, 0.14, 4), x, -0.16, 0.08, PI - 0.3, 0, 0);
        });
      }
      m.torso.add(mesh(oct(0.09), m.glow, 0, 0.3, 0.21));
      break;
    }
    case 'magmagolem': {
      part(m.torso, 'e_mg_rocks', m.mats[1], (b, a) => {
        a(oct(0.14), 0.3, 0.72, -0.08, 0.3, 0.4, 0);
        a(oct(0.12), -0.34, 0.7, 0.05, 0.6, 0.1, 0.3);
        a(oct(0.16), 0, 0.42, -0.22, 0.2, 0.7, 0.1);
        a(oct(0.1), -0.12, 0.6, -0.2, 0.9, 0.2, 0.4);
      });
      part(m.head, 'e_mg_horn', m.glow, (b, a) => {
        for (const sx of [-1, 1]) a(cone(0.05, 0.22, 5), sx * 0.12, 0.2, 0, 0, 0, -sx * 0.6);
        b(0.12, 0.03, 0.02, 0, -0.06, 0.135);
      });
      for (const arm of [m.armL, m.armR]) part(arm, 'e_mg_crack', m.glow, (b) => {
        b(0.02, 0.22, 0.02, 0.04, -0.1, 0.085);
        b(0.08, 0.02, 0.02, 0, -0.3, 0.09);
      });
      break;
    }
    case 'flamer': {
      part(m.head, 'e_fl_helm', m.mats[0], (b) => b(0.3, 0.1, 0.3, 0, 0.14, 0));
      part(m.head, 'e_fl_gog', glowMat(0xff6a00, 2.6), (b) => {
        for (const sx of [-1, 1]) b(0.08, 0.06, 0.04, sx * 0.07, 0.06, 0.14);
      });
      part(m.torso, 'e_fl_hose', m.mats[1], (b, a) => a(tor(0.2, 0.025, 5, 10, PI), 0.2, 0.15, -0.1, 0, PI / 2, -PI / 2));
      break;
    }
    case 'drone':
    case 'medic': {
      const c = type === 'drone' ? 0xff3355 : 0x39ff88;
      part(m.body, 'e_dr_arms', extraMat(m, 0x2a2e3a), (b, a) => {
        for (let k = 0; k < 4; k++) {
          const an = PI / 4 + (k * PI) / 2;
          b(0.46, 0.05, 0.07, Math.cos(an) * 0.26, 0, Math.sin(an) * 0.26, 0, -an, 0);
          a(cyl(0.06, 0.07, 0.07, 8), Math.cos(an) * 0.5, 0.02, Math.sin(an) * 0.5);
        }
        b(0.02, 0.24, 0.02, 0, 0.34, -0.12);
        a(sph(0.08, 8, 6), 0, -0.27, 0.08);
      });
      part(m.body, 'e_dr_props', glowMat(c, 1.3), (b, a) => {
        for (let k = 0; k < 4; k++) {
          const an = PI / 4 + (k * PI) / 2;
          a(cyl(0.15, 0.15, 0.012, 10), Math.cos(an) * 0.5, 0.07, Math.sin(an) * 0.5);
        }
        b(0.04, 0.04, 0.04, 0, 0.47, -0.12);
      });
      break;
    }
    case 'bomber': {
      part(m.body, 'e_bo_band', glowMat(0xffd23d, 1.8), (b, a) => {
        a(tor(0.3, 0.025, 4, 20), 0, 0.3, 0, PI / 2, 0, 0, 1, 1.2, 1);
        a(tor(0.15, 0.02, 4, 12), 0, 0.45, 0, PI / 2, 0, 0);
        b(0.04, 0.04, 0.04, 0.1, 0.66, -0.1);
      });
      part(m.body, 'e_bo_ant', m.mats[0], (b) => {
        b(0.015, 0.2, 0.015, 0.1, 0.55, -0.1);
        b(0.24, 0.06, 0.1, 0, 0.42, -0.26);
      });
      break;
    }
    case 'kamikaze': {
      part(m.body, 'e_kk_fins', m.mats[0], (b) => {
        b(0.03, 0.22, 0.18, 0, 0.12, -0.3);
        for (const sx of [-1, 1]) b(0.03, 0.14, 0.14, sx * 0.12, -0.08, -0.3, 0, 0, sx * 0.7);
      });
      part(m.body, 'e_kk_fire', glowMat(0xffaa00, 2.4), (b, a) => {
        a(cone(0.08, 0.22, 6), 0, 0, -0.44, -PI / 2, 0, 0);
        for (const sx of [-1, 1]) b(0.05, 0.05, 0.05, sx * 0.5, 0, -0.1);
      });
      break;
    }
    case 'tank': {
      part(m.body, 'e_tk_hull', m.mats[0], (b, a) => {
        for (const sx of [-1, 1]) for (const z of [-0.5, -0.17, 0.17, 0.5]) a(cyl(0.09, 0.09, 0.31, 8), sx * 0.62, 0.17, z, 0, 0, PI / 2);
        b(1.05, 0.05, 0.32, 0, 0.56, 0.72, 0.6, 0, 0);
      });
      part(m.body, 'e_tk_exh', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) a(cyl(0.05, 0.06, 0.22, 6), sx * 0.3, 0.55, -0.7, PI / 2, 0, 0);
      });
      part(m.turret, 'e_tk_top', m.mats[1], (b, a) => {
        a(cyl(0.14, 0.14, 0.06, 10), 0.12, 0.19, -0.12);
        b(0.02, 0.6, 0.02, -0.25, 0.45, -0.25);
      });
      part(m.body, 'e_tk_lights', glowMat(0xffd23d, 2.4), (b) => {
        for (const sx of [-1, 1]) b(0.12, 0.06, 0.03, sx * 0.4, 0.5, 0.66);
      });
      break;
    }
    case 'ghost': {
      part(m.sheet, 'e_gh_hem', m.mats[0], (b, a) => {
        for (let k = 0; k < 9; k++) {
          const an = (k / 9) * PI * 2;
          a(cone(0.09, 0.28, 4), Math.cos(an) * 0.42, 0.04, Math.sin(an) * 0.42, PI, 0, 0);
        }
      });
      part(m.body, 'e_gh_arms', m.mats[0], (b, a) => {
        for (const sx of [-1, 1]) a(cone(0.1, 0.55, 6), sx * 0.36, 1.05, 0.15, 1.2, 0, -sx * 0.3);
      });
      part(m.sheet, 'e_gh_chain', glowMat(0x7affc8, 1.5), (b, a) => {
        for (let k = 0; k < 12; k++) {
          const an = (k / 12) * PI * 2;
          a(tor(0.045, 0.012, 4, 8), Math.cos(an) * 0.36, 0.85 + Math.sin(an * 2) * 0.05, Math.sin(an) * 0.36, k % 2 ? PI / 2 : 0, -an, 0);
        }
      });
      break;
    }
    case 'wisp': {
      part(m.body, 'e_wi_sparks', glowMat(0x7affc8, 2.6), (b, a) => {
        for (let k = 0; k < 4; k++) {
          const an = (k / 4) * PI * 2;
          a(oct(0.035), Math.cos(an) * 0.38, (k % 2 ? 0.12 : -0.12), Math.sin(an) * 0.38);
        }
      });
      break;
    }
    case 'boar': {
      part(m.headM, 'e_bo_ears', m.mats[0], (b) => {
        for (const sx of [-1, 1]) b(0.08, 0.12, 0.04, sx * 0.17, 0.24, -0.1, 0, 0, sx * 0.4);
      });
      part(m.headM, 'e_bo_ring', metal(m), (b, a) => a(tor(0.05, 0.014, 4, 10), 0, -0.1, 0.33, 0.3, 0, 0));
      part(m.body, 'e_bo_back', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) for (const z of [0.3, 0.1, -0.1, -0.3]) a(cone(0.05, 0.18, 4), sx * 0.1, 0.92, z, -0.3, 0, -sx * 0.3);
        b(0.04, 0.04, 0.22, 0, 0.75, -0.58, 0.6, 0, 0);
      });
      part(m.body, 'e_bo_armor', metal(m), (b) => {
        for (const sx of [-1, 1]) b(0.04, 0.3, 0.6, sx * 0.31, 0.62, 0);
      });
      break;
    }
    case 'toad': {
      part(m.body, 'e_td_warts', glowMat(0x9dff3a, 1.8), (b, a) => {
        for (const [x, y, z] of [[0.18, 0.64, -0.1], [-0.18, 0.64, -0.1], [0, 0.68, -0.22], [0.26, 0.56, -0.28], [-0.26, 0.56, -0.28], [0, 0.66, 0.05]]) a(sph(0.045, 6, 4), x, y, z);
      });
      part(m.body, 'e_td_mouth', m.mats[0], (b) => b(0.42, 0.025, 0.04, 0, 0.45, 0.45));
      for (const lg of m.legs) part(lg, 'e_td_feet', m.mats[0], (b) => b(0.22, 0.03, 0.26, 0, -0.19, 0.05));
      break;
    }
    case 'alien': {
      part(m.body, 'e_al_spines', m.mats[0], (b, a) => {
        for (const z of [0.25, 0.05, -0.15, -0.35]) a(cone(0.05, 0.26, 4), 0, 0.92 + z * 0.25, z, -0.6, 0, 0);
        for (const sx of [-1, 1]) b(0.03, 0.03, 0.2, sx * 0.08, 0.88, 0.95, 0.3, sx * 0.4, 0);
      });
      part(m.tail, 'e_al_ribs', glowMat(0xb36bff, 1.6), (b, a) => {
        for (let k = 0; k < 4; k++) a(tor(0.06, 0.012, 4, 8), 0, 0, -0.15 - k * 0.2);
      });
      break;
    }
    case 'scorpion': {
      part(m.body, 'e_sc_plates', m.mats[1], (b) => {
        for (const [y, z] of [[0.52, 0.2], [0.55, 0], [0.52, -0.2], [0.47, -0.36]]) b(0.5, 0.04, 0.12, 0, y, z);
      });
      part(m.body, 'e_sc_eyes', glowMat(0xc8ff3a, 2.6), (b) => {
        for (const sx of [-1, 1]) for (const z of [0.42, 0.36]) b(0.04, 0.04, 0.04, sx * (0.04 + (0.42 - z)), 0.49, z);
      });
      m.claws.forEach((c, i) => part(c, 'e_sc_pinch', m.mats[1], (b) => {
        b(0.05, 0.07, 0.2, 0.06, 0, 0.52, 0, -0.2, 0);
        b(0.05, 0.07, 0.16, -0.06, 0, 0.5, 0, 0.25, 0);
      }));
      break;
    }
    case 'sentry': {
      part(m.head, 'e_se_top', m.mats[1], (b) => {
        b(0.12, 0.18, 0.24, -0.29, 0, -0.02);
        b(0.02, 0.3, 0.02, 0.18, 0.28, -0.15);
        b(0.4, 0.04, 0.4, 0, 0.16, 0);
      });
      part(m.head, 'e_se_muz', glowMat(0xff3355, 2.6), (b) => {
        for (const sx of [-1, 1]) b(0.06, 0.06, 0.03, sx * 0.1, 0, 0.6);
        b(0.04, 0.04, 0.04, 0.18, 0.44, -0.15);
      });
      part(m.root, 'e_se_bolts', m.mats[0], (b) => {
        for (let k = 0; k < 8; k++) {
          const an = (k / 8) * PI * 2;
          b(0.08, 0.06, 0.08, Math.cos(an) * 0.44, 0.33, Math.sin(an) * 0.44, 0, -an, 0);
        }
      });
      break;
    }
    case 'barrel': {
      part(m.root, 'e_ba_valve', extraMat(m, 0x2a2420), (b, a) => {
        a(cyl(0.05, 0.05, 0.1, 6), 0.1, 0.86, 0);
        a(tor(0.06, 0.015, 4, 8), 0.1, 0.92, 0, PI / 2, 0, 0);
        b(0.12, 0.02, 0.02, 0, 0.4, 0.315, 0, 0, PI / 4);
        b(0.12, 0.02, 0.02, 0, 0.4, 0.315, 0, 0, -PI / 4);
      });
      part(m.root, 'e_ba_sign', glowMat(0xffd23d, 1.6), (b) => b(0.2, 0.2, 0.02, 0, 0.4, 0.305, 0, 0, PI / 4));
      break;
    }
    case 'pylon': {
      part(m.root, 'e_py_fins', m.mats[0], (b) => {
        for (let k = 0; k < 3; k++) {
          const an = (k / 3) * PI * 2;
          b(0.05, 1.1, 0.24, Math.cos(an) * 0.25, 0.8, Math.sin(an) * 0.25, 0, -an, 0.1);
        }
      });
      part(m.root, 'e_py_rings', glowMat(0x00f0ff, 1.8), (b, a) => {
        for (const [y, r] of [[0.6, 0.3], [1.3, 0.25], [1.85, 0.2]]) a(tor(r, 0.025, 4, 16), 0, y, 0, PI / 2, 0, 0);
      });
      break;
    }
    case 'icewolf':
    case 'hound': {
      const ice = type === 'icewolf';
      part(m.headM, 'e_hd_jaw', m.mats[1], (b) => {
        b(0.16, 0.04, 0.2, 0, -0.15, 0.22);
        b(0.08, 0.06, 0.04, 0, -0.02, 0.37);
      });
      for (const lg of m.legs) part(lg, 'e_hd_paw', m.mats[1], (b) => b(0.13, 0.06, 0.16, 0, -0.4, 0.03));
      if (ice) {
        part(m.body, 'e_iw_mane', m.mats[0], (b) => b(0.44, 0.34, 0.2, 0, 0.7, 0.36));
        part(m.body, 'e_iw_cry', glowMat(0x8ad8ff, 2), (b, a) => {
          for (const [z, s] of [[0.2, 1], [0, 1.3], [-0.2, 1], [-0.36, 0.7]]) a(oct(0.07), 0, 0.84, z, -0.4, 0, 0, 0.7, 1.6 * s, 0.7);
        });
      } else {
        part(m.body, 'e_hd_armor', metal(m), (b) => {
          b(0.42, 0.18, 0.22, 0, 0.66, 0.28);
          b(0.4, 0.16, 0.2, 0, 0.66, -0.3);
        });
      }
      break;
    }
    case 'goat': {
      for (const lg of m.legs) part(lg, 'e_gt_hoof', m.mats[1], (b) => b(0.13, 0.07, 0.13, 0, -0.39, 0));
      part(m.headM, 'e_gt_ears', m.mats[0], (b) => {
        for (const sx of [-1, 1]) b(0.12, 0.04, 0.06, sx * 0.19, 0.06, -0.08, 0, 0, sx * 0.4);
      });
      part(m.body, 'e_gt_tail', m.mats[0], (b) => b(0.06, 0.14, 0.06, 0, 0.86, -0.45, -0.5, 0, 0));
      part(m.body, 'e_gt_rivets', glowMat(0xffb35a, 2), (b) => {
        for (const sx of [-1, 1]) for (const z of [-0.2, 0.2]) b(0.04, 0.04, 0.04, sx * 0.2, 0.98, z);
      });
      break;
    }
    case 'salamander': {
      part(m.body, 'e_sa_spikes', m.mats[0], (b, a) => {
        for (const z of [0.36, 0.18, 0, -0.18, -0.36]) a(cone(0.04, 0.14, 4), 0, 0.48, z, -0.4, 0, 0);
      });
      part(m.headM, 'e_sa_frill', glowMat(0xff6a00, 1.6), (b) => {
        for (const sx of [-1, 1]) for (const y of [0.06, -0.04]) b(0.03, 0.12, 0.12, sx * 0.19, y, -0.08, 0, 0, sx * 0.6);
      });
      break;
    }
    case 'mortar': {
      part(m.body, 'e_mo_shells', glowMat(0xffaa00, 1.6), (b, a) => {
        for (let k = 0; k < 3; k++) a(cyl(0.04, 0.04, 0.16, 6), -0.24 + k * 0.09, 0.98, -0.28);
        a(tor(0.45, 0.02, 4, 20), 0, 0.92, 0, PI / 2, 0, 0);
      });
      part(m.body, 'e_mo_sight', m.mats[1], (b) => {
        b(0.06, 0.12, 0.06, 0.24, 0.98, 0.18);
        b(0.08, 0.06, 0.12, 0.24, 1.06, 0.2);
      });
      break;
    }
    case 'tesladrone': {
      part(m.body, 'e_te_rings', glowMat(0x00f0ff, 1.6), (b, a) => {
        for (const sx of [-1, 1]) for (const y of [-0.12, 0, 0.12]) a(tor(0.09, 0.014, 4, 10), sx * 0.34, y, 0, PI / 2, 0, 0);
      });
      part(m.body, 'e_te_spike', m.mats[0], (b, a) => {
        a(cone(0.08, 0.3, 4), 0, -0.36, 0, PI, 0, 0);
        b(0.6, 0.04, 0.06, 0, 0, 0);
      });
      break;
    }
    case 'eagle': {
      m.wings.forEach((w, i) => {
        const sx = i === 0 ? -1 : 1;
        part(w, 'e_ea_feath' + sx, m.mats[0], (b) => {
          for (let k = 0; k < 4; k++) b(0.12, 0.03, 0.24, sx * (0.5 + k * 0.12), -0.01, -0.14 - k * 0.03, 0, sx * 0.15, 0);
        });
      });
      part(m.body, 'e_ea_body', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) {
          b(0.04, 0.14, 0.04, sx * 0.08, -0.22, 0.05);
          a(cone(0.025, 0.08, 4), sx * 0.08, -0.31, 0.09, PI - 0.6, 0, 0);
        }
        for (const ry of [-0.4, 0, 0.4]) b(0.1, 0.03, 0.26, Math.sin(ry) * 0.12, 0.01, -0.5, 0, ry, 0);
      });
      break;
    }
    case 'queen': {
      part(m.body, 'e_qu_head', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) {
          b(0.09, 0.09, 0.5, sx * 0.22, 0.85, 1.27, 0, -sx * 0.4, 0);
          a(cone(0.09, 0.4, 5), sx * 0.3, 1.55, 0.3, 0, 0, -sx * 0.35);
        }
        a(cone(0.1, 0.5, 5), 0, 1.62, 0.15);
      });
      part(m.body, 'e_qu_wings', extraMat(m, 0x9dffb0, { transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), (b) => {
        for (const sx of [-1, 1]) {
          b(1.7, 0.02, 0.62, sx * 1.0, 1.75, -0.45, 0, sx * 0.35, sx * 0.4);
          b(1.3, 0.02, 0.45, sx * 0.85, 1.6, -0.95, 0, sx * 0.7, sx * 0.3);
        }
      });
      part(m.abdomen, 'e_qu_eggs', glowMat(0x39ff14, 1.8), (b, a) => {
        for (const [x, y, z] of [[0.8, -0.35, -0.2], [-0.8, -0.35, -0.2], [0.55, -0.5, 0.35], [-0.55, -0.5, 0.35], [0, -0.7, -0.4]]) a(sph(0.17, 8, 6), x, y, z);
      });
      part(m.abdomen, 'e_qu_spk', m.mats[1], (b, a) => {
        for (const z of [-0.6, -0.2, 0.2]) a(cone(0.08, 0.32, 5), 0, 0.82, z, -0.3, 0, 0);
      });
      break;
    }
    case 'scrap': {
      part(m.body, 'e_scr_parts', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) {
          a(cone(0.13, 0.45, 5), sx * 1.15, 2.35, 0, 0, 0, -sx * 0.3);
          a(cyl(0.1, 0.13, 0.9, 8), sx * 0.5, 2.7, -0.6);
          b(0.7, 0.2, 0.9, sx * 0.55, 0.1, 0.1);
          for (const z of [-0.18, 0.18]) a(cone(0.07, 0.26, 4), sx * 1.15 + z, 0.3, 0.42, PI / 2 + 0.2, 0, 0);
        }
        b(0.04, 0.6, 0.04, 0.3, 3.2, -0.1);
      });
      part(m.body, 'e_scr_glow', glowMat(0xffaa00, 2.2), (b, a) => {
        for (const sx of [-1, 1]) a(cyl(0.11, 0.11, 0.05, 8), sx * 0.5, 3.17, -0.6);
        b(0.08, 0.08, 0.08, 0.3, 3.52, -0.1);
        for (let k = 0; k < 4; k++) b(0.06, 0.06, 0.03, -0.66 + k * 0.44, 2.15, 0.66);
      });
      break;
    }
    case 'reaper': {
      part(m.body, 'e_rp_hem', m.mats[0], (b, a) => {
        for (let k = 0; k < 10; k++) {
          const an = (k / 10) * PI * 2;
          a(cone(0.12, 0.42 + (k % 3) * 0.12, 4), Math.cos(an) * 0.6, 0.32, Math.sin(an) * 0.6, PI, 0, 0);
        }
      });
      part(m.body, 'e_rp_mantle', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) {
          a(cone(0.1, 0.4, 5), sx * 0.36, 2.2, -0.05, 0, 0, -sx * 0.7);
          b(0.36, 0.08, 0.3, sx * 0.2, 2.08, 0, 0, 0, -sx * 0.35);
        }
      });
      part(m.body, 'e_rp_bone', glowMat(0xd8c8ff, 1.4), (b) => {
        b(0.12, 0.14, 0.12, 0.62, 1.6, 0.22);
        b(0.11, 0.12, 0.11, -0.3, 1.3, 0.4);
        for (let i = 0; i < 3; i++) b(0.36 - i * 0.06, 0.03, 0.03, 0, 1.6 + i * 0.13, 0.36 - i * 0.04);
      });
      m.body.add(mesh(oct(0.12), glowMat(0xb36bff, 3), 0, 1.25, 0.4));
      part(m.scythe, 'e_rp_scythe', m.mats[1], (b, a) => {
        for (const y of [-0.6, 0, 0.6]) a(cyl(0.06, 0.06, 0.08, 6), 0, y, 0);
        a(cone(0.06, 0.3, 4), 0, -1.45, 0, PI, 0, 0);
      });
      part(m.scythe, 'e_rp_edge', glowMat(0xb36bff, 2.6), (b, a) => {
        a(oct(0.1), 0, 1.3, 0);
        b(0.5, 0.05, 0.05, -0.95, 1.05, 0, 0, 0, -0.9);
      });
      break;
    }
    case 'gunship': {
      part(m.body, 'e_gs_parts', m.mats[1], (b, a) => {
        b(0.06, 0.6, 0.5, 0, 0.45, -2.5);
        b(0.9, 0.05, 0.3, 0, 0.15, -2.5);
        b(1.0, 0.3, 0.3, 0, -0.2, 1.42);
        for (const sx of [-1, 1]) {
          a(cyl(0.12, 0.12, 0.7, 8), sx * 1.1, -0.15, 0.1, PI / 2, 0, 0);
          b(0.06, 0.06, 1.8, sx * 0.5, -0.72, 0);
          for (const z of [-0.6, 0.6]) b(0.05, 0.32, 0.05, sx * 0.5, -0.55, z);
        }
      });
      part(m.body, 'e_gs_glow', glowMat(0xff3355, 2.4), (b) => {
        for (const sx of [-1, 1]) {
          b(0.1, 0.1, 0.04, sx * 0.55, -0.45, 1.37);
          b(0.16, 0.16, 0.04, sx * 1.1, -0.15, 0.46);
        }
        b(0.06, 0.06, 0.06, 0, 0.78, -2.5);
      });
      m.body.add(mesh(box(0.24, 0.1, 0.05), glowMat(0xffffff, 2), 0, -0.3, 1.58));
      for (const r of m.rotors) part(r, 'e_gs_hub', m.mats[1], (b, a) => a(cyl(0.14, 0.14, 0.12, 8), 0, 0, 0));
      break;
    }
    case 'omega': {
      part(m.body, 'e_om_pillars', m.mats[0], (b, a) => {
        for (let k = 0; k < 4; k++) {
          const an = (k / 4) * PI * 2 + PI / 4;
          b(0.26, 1.6, 0.26, Math.cos(an) * 1.25, 1.2, Math.sin(an) * 1.25, 0, -an, 0);
          a(cone(0.14, 0.45, 4), Math.cos(an) * 1.1, 2.15, Math.sin(an) * 1.1, 0, -an, 0.9);
        }
      });
      part(m.body, 'e_om_cond', glowMat(0x00f0ff, 1.8), (b, a) => {
        for (let k = 0; k < 4; k++) {
          const an = (k / 4) * PI * 2 + PI / 4;
          b(0.06, 1.4, 0.06, Math.cos(an) * 1.11, 1.2, Math.sin(an) * 1.11);
        }
        a(tor(1.45, 0.05, 4, 32), 0, 0.62, 0, PI / 2, 0, 0);
      });
      break;
    }
    case 'boss': {
      part(m.torso, 'e_bs_armor', m.mats[1], (b, a) => {
        for (const sx of [-1, 1]) {
          b(0.62, 0.16, 0.62, sx * 1.05, 1.32, 0, 0, 0, -sx * 0.15);
          a(cyl(0.12, 0.14, 0.6, 8), sx * 0.4, 1.6, -0.55);
        }
        for (let i = 0; i < 4; i++) b(0.9, 0.04, 0.04, 0, 0.3 + i * 0.1, 0.57);
        b(0.04, 0.5, 0.04, 0.2, 2.0, -0.1);
      });
      part(m.torso, 'e_bs_glow', m.glow, (b) => {
        for (const sx of [-1, 1]) b(0.18, 0.04, 0.18, sx * 0.4, 1.92, -0.55);
        b(0.08, 0.08, 0.08, 0.2, 2.27, -0.1);
        for (const sx of [-1, 1]) b(0.1, 0.1, 0.04, sx * 0.14, 1.62, 0.32);
      });
      for (const arm of [m.armL, m.armR]) part(arm, 'e_bs_muz', m.glow, (b, a) => a(tor(0.16, 0.03, 4, 12), 0, -0.1, 1.02));
      part(m.body, 'e_bs_trim', m.glow, (b, a) => a(tor(0.98, 0.035, 4, 24), 0, 0.6, 0, PI / 2, 0, 0));
      break;
    }
  }
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
const barFgMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2b4a).multiplyScalar(gk(1.4)), depthTest: false });
const barEliteMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc400).multiplyScalar(gk(1.4)), depthTest: false });
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
