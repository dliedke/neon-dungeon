// Bichinhos: animais soltos pelo andar. Passe perto e eles seguem você até o fim do andar.
// São só enfeite: não lutam, não levam dano e somem quando o andar acaba.
import * as THREE from 'three';
import { G } from './state.js';
import { L } from './i18n.js';
import { box, glowMat, addShadow } from './models.js';
import { resolveCircle, randomFloorInRoom, isWalkable } from './dungeon.js';
import { burst, floatText } from './fx.js';
import { toast } from './ui.js';
import { achAdd, achMark } from './ach.js';
import { sfx } from './audio.js';
import { rr, pick, chance, dist } from './utils.js';

export const PET_KINDS = {
  rabbit: { name: L('Coelho', 'Rabbit'), icon: '🐇', speed: 1.15 },
  dog: { name: L('Cachorro', 'Dog'), icon: '🐕', speed: 1.1 },
  cat: { name: L('Gato', 'Cat'), icon: '🐈', speed: 1.05 },
  bird: { name: L('Passarinho', 'Bird'), icon: '🐦', speed: 1.25, fly: true },
  fox: { name: L('Raposa', 'Fox'), icon: '🦊', speed: 1.15 },
  penguin: { name: L('Pinguim', 'Penguin'), icon: '🐧', speed: 0.95 },
  turtle: { name: L('Tartaruga Robô', 'Robo Turtle'), icon: '🐢', speed: 1.0 },
};
// bichos de cada bioma (o resto usa a lista geral)
const BY_THEME = {
  snow: ['penguin', 'rabbit', 'fox', 'dog'],
  cryo: ['penguin', 'cat', 'turtle'],
  forest: ['rabbit', 'fox', 'bird', 'dog'],
  meadow: ['rabbit', 'dog', 'bird', 'fox'],
  desert: ['turtle', 'fox', 'bird'],
  sewer: ['cat', 'turtle', 'dog'],
  space: ['turtle', 'cat', 'bird'],
  mountain: ['bird', 'dog', 'fox', 'rabbit'],
  volcano: ['turtle', 'bird', 'cat'],
};
const ALL = ['rabbit', 'dog', 'cat', 'bird', 'fox', 'turtle'];

const lam = {};
const mat = (c) => lam[c] || (lam[c] = new THREE.MeshLambertMaterial({ color: c }));
function part(g, w, h, d, c, x, y, z) {
  const m = new THREE.Mesh(box(w, h, d), typeof c === 'number' ? mat(c) : c);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// modelos low-poly olhando para +z
function makePetModel(kind, accent) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const m = { root, body, legs: [], kind };
  const eye = mat(0x111111);
  const collar = glowMat(accent, 2.2);
  const legs = (c, w, h, xs, zs) => {
    for (const x of xs) for (const z of zs) {
      const l = part(body, w, h, w, c, x, h / 2, z);
      m.legs.push(l);
    }
  };
  if (kind === 'rabbit') {
    part(body, 0.26, 0.24, 0.34, 0xe8e2da, 0, 0.2, 0);
    m.head = part(body, 0.2, 0.2, 0.2, 0xe8e2da, 0, 0.36, 0.17);
    m.earL = part(body, 0.05, 0.22, 0.04, 0xf0c8c8, -0.05, 0.54, 0.14);
    m.earR = part(body, 0.05, 0.22, 0.04, 0xf0c8c8, 0.05, 0.54, 0.14);
    part(body, 0.1, 0.1, 0.08, 0xffffff, 0, 0.24, -0.2);
    part(body, 0.03, 0.04, 0.02, eye, -0.06, 0.39, 0.27);
    part(body, 0.03, 0.04, 0.02, eye, 0.06, 0.39, 0.27);
    part(body, 0.22, 0.04, 0.04, collar, 0, 0.29, 0.1);
    legs(0xd8d0c6, 0.07, 0.1, [-0.08, 0.08], [-0.1, 0.1]);
  } else if (kind === 'dog' || kind === 'fox') {
    const c = kind === 'dog' ? 0xb07840 : 0xe8661c;
    const c2 = kind === 'dog' ? 0x6a4422 : 0xffffff;
    part(body, 0.26, 0.24, 0.46, c, 0, 0.32, 0);
    m.head = part(body, 0.24, 0.22, 0.22, c, 0, 0.48, 0.28);
    part(body, 0.12, 0.1, 0.12, c2, 0, 0.43, 0.42);
    part(body, 0.05, 0.05, 0.03, eye, 0, 0.47, 0.48);
    part(body, 0.03, 0.04, 0.02, eye, -0.07, 0.52, 0.39);
    part(body, 0.03, 0.04, 0.02, eye, 0.07, 0.52, 0.39);
    if (kind === 'dog') {
      m.earL = part(body, 0.06, 0.16, 0.08, c2, -0.13, 0.48, 0.26);
      m.earR = part(body, 0.06, 0.16, 0.08, c2, 0.13, 0.48, 0.26);
    } else {
      m.earL = part(body, 0.07, 0.12, 0.05, c, -0.08, 0.64, 0.26);
      m.earR = part(body, 0.07, 0.12, 0.05, c, 0.08, 0.64, 0.26);
    }
    m.tail = new THREE.Group();
    m.tail.position.set(0, 0.4, -0.23);
    body.add(m.tail);
    part(m.tail, 0.07, 0.07, kind === 'fox' ? 0.3 : 0.22, kind === 'fox' ? c : c, 0, 0.04, -0.12).rotation.x = 0.6;
    if (kind === 'fox') part(m.tail, 0.08, 0.08, 0.08, 0xffffff, 0, 0.12, -0.26);
    part(body, 0.27, 0.05, 0.05, collar, 0, 0.42, 0.18);
    legs(c, 0.08, 0.22, [-0.09, 0.09], [-0.16, 0.16]);
  } else if (kind === 'cat') {
    const c = pick([0x3a3a40, 0xd88a3a, 0xc8c8c8]);
    part(body, 0.2, 0.18, 0.38, c, 0, 0.26, 0);
    m.head = part(body, 0.2, 0.18, 0.18, c, 0, 0.4, 0.22);
    m.earL = part(body, 0.06, 0.08, 0.04, c, -0.06, 0.52, 0.2);
    m.earR = part(body, 0.06, 0.08, 0.04, c, 0.06, 0.52, 0.2);
    part(body, 0.04, 0.04, 0.02, glowMat(0x9aff3a, 1.6), -0.05, 0.42, 0.315);
    part(body, 0.04, 0.04, 0.02, glowMat(0x9aff3a, 1.6), 0.05, 0.42, 0.315);
    m.tail = new THREE.Group();
    m.tail.position.set(0, 0.3, -0.19);
    body.add(m.tail);
    part(m.tail, 0.05, 0.32, 0.05, c, 0, 0.15, -0.02);
    part(body, 0.21, 0.04, 0.04, collar, 0, 0.34, 0.14);
    legs(c, 0.06, 0.18, [-0.07, 0.07], [-0.13, 0.13]);
  } else if (kind === 'bird') {
    const c = pick([0x3aa8ff, 0xffd23d, 0xff5a5a, 0x7affc8]);
    part(body, 0.16, 0.16, 0.24, c, 0, 0, 0);
    m.head = part(body, 0.14, 0.14, 0.14, c, 0, 0.1, 0.13);
    part(body, 0.05, 0.04, 0.08, 0xffa020, 0, 0.09, 0.23);
    part(body, 0.03, 0.03, 0.02, eye, -0.05, 0.13, 0.2);
    part(body, 0.03, 0.03, 0.02, eye, 0.05, 0.13, 0.2);
    part(body, 0.1, 0.03, 0.12, c, 0, 0.02, -0.17);
    m.wingL = new THREE.Group();
    m.wingL.position.set(-0.08, 0.04, 0);
    body.add(m.wingL);
    part(m.wingL, 0.22, 0.03, 0.14, c, -0.11, 0, 0);
    m.wingR = new THREE.Group();
    m.wingR.position.set(0.08, 0.04, 0);
    body.add(m.wingR);
    part(m.wingR, 0.22, 0.03, 0.14, c, 0.11, 0, 0);
    part(body, 0.17, 0.03, 0.03, collar, 0, 0.05, 0.08);
  } else if (kind === 'penguin') {
    part(body, 0.24, 0.34, 0.2, 0x1a1a24, 0, 0.24, 0);
    part(body, 0.16, 0.26, 0.04, 0xf4f4f4, 0, 0.22, 0.1);
    m.head = part(body, 0.18, 0.16, 0.16, 0x1a1a24, 0, 0.48, 0.01);
    part(body, 0.06, 0.04, 0.08, 0xffa020, 0, 0.47, 0.12);
    part(body, 0.03, 0.03, 0.02, 0xffffff, -0.05, 0.51, 0.09);
    part(body, 0.03, 0.03, 0.02, 0xffffff, 0.05, 0.51, 0.09);
    m.wingL = part(body, 0.04, 0.2, 0.1, 0x1a1a24, -0.14, 0.26, 0);
    m.wingR = part(body, 0.04, 0.2, 0.1, 0x1a1a24, 0.14, 0.26, 0);
    part(body, 0.25, 0.04, 0.21, collar, 0, 0.39, 0);
    legs(0xffa020, 0.08, 0.06, [-0.06, 0.06], [0.03]);
  } else {
    // tartaruga robô
    part(body, 0.34, 0.14, 0.4, 0x4a6a5a, 0, 0.16, 0);
    part(body, 0.26, 0.08, 0.32, 0x5a8a6a, 0, 0.26, 0);
    part(body, 0.2, 0.03, 0.24, collar, 0, 0.305, 0);
    m.head = part(body, 0.14, 0.12, 0.14, 0x7aa088, 0, 0.18, 0.26);
    part(body, 0.03, 0.03, 0.02, glowMat(accent, 2), -0.04, 0.2, 0.33);
    part(body, 0.03, 0.03, 0.02, glowMat(accent, 2), 0.04, 0.2, 0.33);
    legs(0x7aa088, 0.08, 0.1, [-0.14, 0.14], [-0.13, 0.13]);
  }
  root.scale.setScalar(1.25);
  m.shadow = addShadow(root, kind === 'bird' ? 0.14 : 0.2);
  return m;
}

// ------------------------------------------------------------------
// ciclo de vida
// ------------------------------------------------------------------
export function clearPets() {
  for (const p of G.pets || []) G.scene.remove(p.m.root);
  G.pets = [];
}

export function spawnPets(d) {
  clearPets();
  const rooms = d.rooms.filter((r) => r !== d.exitRoom && !(d.start.x >= r.x && d.start.x < r.x + r.w && d.start.z >= r.y && d.start.z < r.y + r.h));
  if (!rooms.length) return;
  const list = BY_THEME[G.theme && G.theme.id] || ALL;
  const n = chance(0.35) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const r = pick(rooms);
    const pos = randomFloorInRoom(d, r, 1);
    spawnPet(pick(list), pos.x, pos.z);
  }
}

export function spawnPet(kind, x, z) {
  const K = PET_KINDS[kind] || PET_KINDS.dog;
  const accent = G.theme ? G.theme.a : 0x00f0ff;
  const m = makePetModel(kind, accent);
  const pet = { kind, K, m, x, z, r: 0.18, y: K.fly ? 1.6 : 0, facing: rr(0, Math.PI * 2), follow: false, slot: (G.pets || []).length, wait: rr(0.5, 2), tx: x, tz: z, phase: rr(0, 6), speedNow: 0, hop: 0 };
  m.root.position.set(x, pet.y, z);
  m.root.rotation.y = pet.facing;
  G.scene.add(m.root);
  (G.pets = G.pets || []).push(pet);
  return pet;
}

function adopt(pet) {
  pet.follow = true;
  pet.slot = G.pets.filter((p) => p.follow).length - 1;
  floatText(pet.x, 1.2 + pet.y, pet.z, '♥', 'info');
  burst(pet.x, 0.6 + pet.y, pet.z, 0xff6ad5, 12, 2.5, 0.06, 0.6);
  sfx.pickup && sfx.pickup();
  toast(L(`Novo amigo: ${pet.K.icon} <b>${pet.K.name}</b>! Ele segue você até o fim do andar.`, `New friend: ${pet.K.icon} <b>${pet.K.name}</b>! It follows you until the end of the floor.`));
  achAdd('pets');
  achMark('petKinds', pet.kind);
}

// ------------------------------------------------------------------
// atualização
// ------------------------------------------------------------------
export function updatePets(dt) {
  const list = G.pets;
  if (!list || !list.length) return;
  const pl = G.player;
  const d = G.dungeon;
  if (!pl || !d) return;
  for (const pet of list) {
    const K = pet.K;
    const dp = dist(pet.x, pet.z, pl.x, pl.z);
    if (!pet.follow && dp < 2.4 && !pl.dead) adopt(pet);
    let tx, tz, spd;
    if (pet.follow) {
      // lugar atrás do jogador, um ao lado do outro
      const back = 1.1 + Math.floor(pet.slot / 2) * 0.7;
      const side = (pet.slot % 2 ? 1 : -1) * 0.55;
      const fx = Math.sin(pl.facing);
      const fz = Math.cos(pl.facing);
      tx = pl.x - fx * back + fz * side;
      tz = pl.z - fz * back - fx * side;
      // ficou muito para trás (ou preso): aparece perto do jogador
      if (dp > 13) {
        burst(pet.x, 0.4 + pet.y, pet.z, 0xffffff, 8, 2, 0.05, 0.4);
        const okT = K.fly || isWalkable(d, tx, tz);
        pet.x = okT ? tx : pl.x;
        pet.z = okT ? tz : pl.z;
        burst(pet.x, 0.4 + pet.y, pet.z, 0xffffff, 8, 2, 0.05, 0.4);
      }
      const dt2 = dist(pet.x, pet.z, tx, tz);
      spd = dt2 < 0.25 ? 0 : Math.min(9, (2.2 + dt2 * 2.2) * K.speed);
    } else {
      // passeia pela sala
      pet.wait -= dt;
      if (pet.wait <= 0) {
        pet.wait = rr(1.5, 4);
        const a = rr(0, Math.PI * 2);
        const nx = pet.x + Math.cos(a) * rr(0.8, 2);
        const nz = pet.z + Math.sin(a) * rr(0.8, 2);
        if (K.fly || isWalkable(d, nx, nz)) {
          pet.tx = nx;
          pet.tz = nz;
        }
      }
      tx = pet.tx;
      tz = pet.tz;
      spd = dist(pet.x, pet.z, tx, tz) < 0.15 ? 0 : 1.2 * K.speed;
    }
    pet.speedNow += (spd - pet.speedNow) * Math.min(1, dt * 8);
    if (pet.speedNow > 0.05) {
      const a = Math.atan2(tx - pet.x, tz - pet.z);
      const step = Math.min(pet.speedNow * dt, dist(pet.x, pet.z, tx, tz));
      pet.x += Math.sin(a) * step;
      pet.z += Math.cos(a) * step;
      if (!K.fly) resolveCircle(d, pet);
      let da = a - pet.facing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      pet.facing += da * Math.min(1, dt * 10);
    } else if (pet.follow) {
      // parado: olha para onde o jogador olha
      let da = pl.facing - pet.facing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      pet.facing += da * Math.min(1, dt * 3);
    }
    animate(pet, dt);
  }
}

function animate(pet, dt) {
  const m = pet.m;
  const moving = pet.speedNow > 0.3;
  pet.phase += dt * (moving ? 6 + pet.speedNow * 2.2 : 2);
  const ph = pet.phase;
  let y = 0;
  let tilt = 0;
  const kind = pet.kind;
  if (kind === 'bird') {
    y = 1.15 + Math.sin(ph * 0.5) * 0.15 + (pet.follow ? 0.15 : 0);
    const flap = Math.sin(ph * (moving ? 3 : 2.2)) * 0.9;
    m.wingL.rotation.z = flap;
    m.wingR.rotation.z = -flap;
    tilt = moving ? 0.2 : 0;
  } else if (kind === 'rabbit') {
    // pulinhos
    y = moving ? Math.abs(Math.sin(ph * 0.9)) * 0.22 : 0;
    tilt = moving ? -Math.cos(ph * 0.9) * 0.25 : 0;
    m.earL.rotation.x = m.earR.rotation.x = moving ? -0.5 : Math.sin(ph) * 0.1;
  } else if (kind === 'penguin') {
    // anda balançando
    m.body.rotation.z = moving ? Math.sin(ph) * 0.18 : 0;
    m.wingL.rotation.z = moving ? 0.3 + Math.sin(ph) * 0.2 : 0.1;
    m.wingR.rotation.z = moving ? -0.3 - Math.sin(ph) * 0.2 : -0.1;
    y = moving ? Math.abs(Math.sin(ph)) * 0.03 : 0;
  } else {
    y = moving ? Math.abs(Math.sin(ph)) * 0.04 : 0;
  }
  if (m.legs.length && kind !== 'rabbit') {
    m.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(ph + (i % 2 === (i >> 1) % 2 ? 0 : Math.PI)) * 0.6 : 0));
  }
  if (m.tail) {
    // cachorro abana o rabo quando segue você
    const wag = kind === 'dog' && pet.follow ? 12 : kind === 'cat' ? 1.5 : 3;
    m.tail.rotation.y = Math.sin(G.t * wag) * (kind === 'dog' && pet.follow ? 0.7 : 0.3);
  }
  if (m.head && !moving && kind !== 'bird') m.head.rotation.y = Math.sin(G.t * 0.8 + pet.phase) * 0.3;
  m.body.position.y = y;
  m.body.rotation.x = tilt;
  m.root.position.set(pet.x, 0, pet.z);
  m.root.rotation.y = pet.facing;
}
