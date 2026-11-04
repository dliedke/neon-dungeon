// Itens no chão: créditos, stims e equipamentos.
import * as THREE from 'three';
import { G } from './state.js';
import { rr, chance } from './utils.js';
import { makeItem, rollRarity, RARITY } from './items.js';
import { glowMat, box } from './models.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';
import { toast, invFull } from './ui.js';
import { MAX_STIMS } from './player.js';

export const INV_SIZE = 30;
let labelRoot = null;

export function dropLoot(x, z, o = {}) {
  const p = G.player;
  const find = 1 + (p.stats.findPct || 0) / 100;
  const ilvl = G.floor + (o.elite ? 1 : 0) + (o.boss ? 2 : 0);
  let items = 0;
  let bonus = G.floor * 1.5;
  if (o.boss) {
    items = 4;
    bonus += 40;
  } else if (o.elite) {
    items = 2;
    bonus += 18;
  } else if (chance(0.14 * find)) {
    items = 1;
  }
  for (let i = 0; i < items; i++) {
    let rarity = rollRarity(bonus);
    if (o.boss && i === 0) rarity = Math.max(rarity, 2);
    const it = makeItem({ ilvl, rarity, cls: chance(0.8) ? G.char.cls : G.char.cls });
    spawnPickup('item', x, z, { item: it });
  }
  if (chance(o.boss ? 1 : o.elite ? 0.9 : 0.4)) {
    const n = o.boss ? 5 : o.elite ? 3 : 1;
    for (let k = 0; k < n; k++) spawnPickup('credits', x, z, { amount: Math.round(rr(3, 7) * (1 + G.floor * 0.5)) });
  }
  if (chance(o.boss ? 1 : o.elite ? 0.35 : 0.05)) spawnPickup('stim', x, z, {});
}

const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 6);
const stimGeo = new THREE.CapsuleGeometry(0.07, 0.2, 4, 8);
const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6, 1, true).translate(0, 1.3, 0);

export function spawnPickup(type, x, z, data) {
  const g = new THREE.Group();
  let mesh;
  let color;
  if (type === 'credits') {
    color = 0xffd23d;
    mesh = new THREE.Mesh(coinGeo, glowMat(color, 1.8));
    mesh.rotation.x = Math.PI / 2;
  } else if (type === 'stim') {
    color = 0x39ff88;
    mesh = new THREE.Mesh(stimGeo, glowMat(color, 2));
    mesh.rotation.z = Math.PI / 2;
  } else {
    const R = RARITY[data.item.rarity];
    color = R.hex;
    mesh = new THREE.Mesh(box(0.26, 0.26, 0.26), glowMat(color, data.item.rarity >= 2 ? 2.4 : 1.6));
    if (data.item.rarity >= 1) {
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: data.item.rarity >= 2 ? 0.55 : 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(beam);
    }
  }
  g.add(mesh);
  const a = rr(0, Math.PI * 2);
  const sp = rr(1.2, 2.6);
  const pk = { type, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, y: 0.6, vy: rr(3, 5), mesh, group: g, color, t: 0, ...data };
  g.position.set(x, pk.y, z);
  G.world.add(g);
  if (type === 'item') {
    if (!labelRoot) labelRoot = document.getElementById('labels');
    const el = document.createElement('div');
    el.className = 'ilabel r' + data.item.rarity;
    el.textContent = data.item.name;
    el.style.display = 'none';
    labelRoot.appendChild(el);
    pk.label = el;
    if (data.item.rarity === 3) {
      sfx.legendary();
      toast(`Protótipo encontrado: ${data.item.name}`, 'leg');
    } else if (data.item.rarity === 2) sfx.rare();
  }
  G.pickups.push(pk);
  return pk;
}

const pv = new THREE.Vector3();
let fullWarn = 0;

export function updatePickups(dt, camera) {
  const p = G.player;
  const c = G.char;
  fullWarn -= dt;
  for (const pk of G.pickups) {
    pk.t += dt;
    // física do "pulo" ao cair
    if (pk.vy !== 0 || pk.y > 0.35) {
      pk.vy -= 14 * dt;
      pk.y += pk.vy * dt;
      const nx = pk.x + pk.vx * dt;
      const nz = pk.z + pk.vz * dt;
      if (G.dungeon && isFree(nx, nz)) {
        pk.x = nx;
        pk.z = nz;
      }
      if (pk.y <= 0.35) {
        pk.y = 0.35;
        pk.vy = 0;
        pk.vx = pk.vz = 0;
      }
    }
    pk.mesh.rotation.y += dt * 2.5;
    pk.group.position.set(pk.x, pk.vy === 0 ? 0.35 + Math.sin(pk.t * 3) * 0.06 : pk.y, pk.z);

    if (!p.alive || pk.t < 0.4) continue;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    if (pk.type === 'credits' && d < 3) {
      const k = Math.min(1, dt * 10);
      pk.x += (p.x - pk.x) * k;
      pk.z += (p.z - pk.z) * k;
    }
    if (d < 0.9) {
      if (pk.type === 'credits') {
        c.credits += pk.amount;
        sfx.coin();
        pk.dead = true;
      } else if (pk.type === 'stim') {
        if (c.stims < MAX_STIMS) {
          c.stims++;
          sfx.pickup();
          toast('+1 Stim', 'heal');
          pk.dead = true;
        }
      } else if (pk.type === 'item') {
        if (c.inv.length < INV_SIZE) {
          c.inv.push(pk.item);
          sfx.pickup();
          burst(pk.x, 0.5, pk.z, pk.color, 10, 3, 0.06, 0.4);
          invNotify(pk.item);
          pk.dead = true;
        } else if (fullWarn <= 0) {
          fullWarn = 3;
          invFull();
        }
      }
    }
  }
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (pk.dead) {
      pk.group.parent && pk.group.parent.remove(pk.group);
      pk.label && pk.label.remove();
      G.pickups.splice(i, 1);
    }
  }
  // rótulos
  const w = innerWidth;
  const h = innerHeight;
  for (const pk of G.pickups) {
    if (!pk.label) continue;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    if (d > 10 || pk.vy !== 0) {
      pk.label.style.display = 'none';
      continue;
    }
    pv.set(pk.x, 0.85, pk.z).project(camera);
    pk.label.style.display = 'block';
    pk.label.style.transform = `translate(${((pv.x + 1) / 2) * w}px, ${((1 - pv.y) / 2) * h}px) translate(-50%, -100%)`;
  }
}

function isFree(x, z) {
  const d = G.dungeon;
  const i = Math.floor(x);
  const j = Math.floor(z);
  if (i < 0 || j < 0 || i >= d.W || j >= d.H) return false;
  return d.grid[j * d.W + i] === 1;
}

function invNotify(item) {
  const R = RARITY[item.rarity];
  toast(`<span style="color:${R.color}">${item.name}</span>`, 'item');
}

export function clearPickups() {
  for (const pk of G.pickups) pk.label && pk.label.remove();
  G.pickups.length = 0;
}
