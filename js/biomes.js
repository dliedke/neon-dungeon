// Elementos de ambiente de cada bioma: perigos, mecanismos e decoração.
import * as THREE from 'three';
import { G, TILE, gk } from './state.js';
import { rr, ri, pick, chance, shuffle } from './utils.js';
import { isWalkableTile, isWalkable, randomFloorInRoom, tileAt } from './dungeon.js';
import { damagePlayer, hitEnemy, damageEnemy, enemiesInRadius } from './combat.js';
import { burst, ringFx, beamFx, particle, floatText } from './fx.js';
import { sfx } from './audio.js';
import { L } from './i18n.js';
import { glowMat, box, humanoid } from './models.js';
import { makeItem, itemScore, isUpgrade, SLOTS } from './items.js';
import { openShop } from './ui.js';

// Tipos de piso especial (d.feat)
export const FEAT = { NONE: 0, SLUDGE: 1, ICE: 2, CONV: 3 }; // esteiras: 3..6 conforme a direção
const CONV_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function featAt(d, x, z) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  if (i < 0 || j < 0 || i >= d.W || j >= d.H) return 0;
  return d.feat[j * d.W + i];
}

// Efeito do piso em quem está em cima: multiplicador de velocidade, empurrão e gelo
export function groundEffect(d, x, z) {
  const f = featAt(d, x, z);
  if (f === FEAT.SLUDGE) return { speed: 0.55, sludge: true };
  if (f === FEAT.ICE) return { speed: 1.1, ice: true };
  if (f >= FEAT.CONV) {
    const [dx, dz] = CONV_DIRS[f - FEAT.CONV];
    return { speed: 1, push: { x: dx * 2.6, z: dz * 2.6 } };
  }
  return null;
}

const inArena = (d, x, z) => d.arena && x >= d.arena.x - 1 && x <= d.arena.x + d.arena.w + 1 && z >= d.arena.y - 1 && z <= d.arena.y + d.arena.h + 1;
const nearKey = (d, x, z, r) => Math.hypot(x - d.start.x, z - d.start.z) < r || Math.hypot(x - d.exit.x, z - d.exit.z) < r || inArena(d, x, z);

// ------------------------------------------------------------------
// Posicionamento
// ------------------------------------------------------------------
export function placeFeatures(d, theme) {
  const { W, H, grid } = d;
  const rooms = d.rooms.filter((r) => r !== d.rooms[0] && !r.arena);
  const set = (i, j, v) => {
    if (i < 2 || j < 2 || i >= W - 2 || j >= H - 2) return;
    if (grid[j * W + i] !== TILE.FLOOR) return;
    if (nearKey(d, i + 0.5, j + 0.5, 3)) return;
    d.feat[j * W + i] = v;
  };
  for (const f of theme.features) {
    switch (f) {
      case 'rain':
        d.rain = true;
        break;
      case 'puddles':
        for (const r of rooms) {
          if (!chance(0.65)) continue;
          for (let k = ri(1, 2); k > 0; k--) {
            const pt = randomFloorInRoom(d, r, 1);
            if (nearKey(d, pt.x, pt.z, 3)) continue;
            d.props.push({ type: 'puddle', x: pt.x, z: pt.z, r: rr(1.1, 1.7), t: rr(0, 4), state: 'idle' });
          }
        }
        break;
      case 'sludge': {
        // rios de lodo tóxico que atravessam o mapa (também abrem passagens)
        const n = 2 + Math.floor(W / 30);
        for (let k = 0; k < n; k++) {
          const r = pick(rooms);
          let x = Math.floor(r.cx);
          let y = Math.floor(r.cy);
          let dir = pick(CONV_DIRS);
          for (let s = 0; s < ri(45, 80); s++) {
            if (chance(0.15)) dir = pick(CONV_DIRS);
            const nx = x + dir[0];
            const ny = y + dir[1];
            if (nx < 3 || ny < 3 || nx > W - 5 || ny > H - 5) {
              dir = pick(CONV_DIRS);
              continue;
            }
            x = nx;
            y = ny;
            for (let dy = 0; dy < 2; dy++)
              for (let dx = 0; dx < 2; dx++) {
                const k2 = (y + dy) * W + x + dx;
                if (nearKey(d, x + dx + 0.5, y + dy + 0.5, 3.5)) continue;
                if (grid[k2] === TILE.WALL) grid[k2] = TILE.FLOOR;
                if (grid[k2] === TILE.FLOOR) d.feat[k2] = FEAT.SLUDGE;
              }
          }
        }
        break;
      }
      case 'ice':
        for (const r of rooms) {
          if (!chance(0.6)) continue;
          const c = randomFloorInRoom(d, r, 1);
          const rad = rr(2, 3.8);
          for (let j = Math.floor(c.z - rad); j <= c.z + rad; j++)
            for (let i = Math.floor(c.x - rad); i <= c.x + rad; i++) if (Math.hypot(i + 0.5 - c.x, j + 0.5 - c.z) < rad) set(i, j, FEAT.ICE);
        }
        break;
      case 'vents':
        for (const r of rooms) {
          if (!chance(0.55)) continue;
          const pt = randomFloorInRoom(d, r, 1);
          if (nearKey(d, pt.x, pt.z, 3)) continue;
          d.props.push({ type: 'vent', x: Math.floor(pt.x) + 0.5, z: Math.floor(pt.z) + 0.5, t: rr(1, 5), state: 'idle' });
        }
        break;
      case 'conveyor':
        for (const r of rooms) {
          if (r.cave || !chance(0.5) || (r.w < 7 && r.h < 7)) continue;
          const horiz = r.w >= r.h;
          const dir = horiz ? (chance(0.5) ? 0 : 1) : chance(0.5) ? 2 : 3;
          if (horiz) {
            const j0 = ri(r.y + 1, r.y + r.h - 3);
            for (let j = j0; j < j0 + 2; j++) for (let i = r.x; i < r.x + r.w; i++) set(i, j, FEAT.CONV + dir);
          } else {
            const i0 = ri(r.x + 1, r.x + r.w - 3);
            for (let i = i0; i < i0 + 2; i++) for (let j = r.y; j < r.y + r.h; j++) set(i, j, FEAT.CONV + dir);
          }
        }
        break;
      case 'crusher':
        for (const r of rooms) {
          if (!chance(0.45)) continue;
          for (let k = ri(1, 3); k > 0; k--) {
            const pt = randomFloorInRoom(d, r, 1);
            const x = Math.floor(pt.x) + 0.5;
            const z = Math.floor(pt.z) + 0.5;
            if (nearKey(d, x, z, 3) || d.props.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
            d.props.push({ type: 'crusher', x, z, t: rr(0.5, 3), state: 'up' });
          }
        }
        break;
      case 'lasers': {
        // grades de laser nos corredores (seções com 2 tiles de largura)
        const cands = [];
        for (let j = 2; j < H - 3; j++)
          for (let i = 2; i < W - 3; i++) {
            const f = (a, b) => grid[b * W + a] === TILE.FLOOR;
            const w = (a, b) => grid[b * W + a] === TILE.WALL;
            if (f(i, j) && f(i, j + 1) && w(i, j - 1) && w(i, j + 2) && f(i - 1, j) && f(i + 1, j)) cands.push({ x1: i + 0.5, z1: j - 0.05, x2: i + 0.5, z2: j + 2.05 });
            if (f(i, j) && f(i + 1, j) && w(i - 1, j) && w(i + 2, j) && f(i, j - 1) && f(i, j + 1)) cands.push({ x1: i - 0.05, z1: j + 0.5, x2: i + 2.05, z2: j + 0.5 });
          }
        const chosen = [];
        for (const c of shuffle(cands)) {
          const mx = (c.x1 + c.x2) / 2;
          const mz = (c.z1 + c.z2) / 2;
          if (nearKey(d, mx, mz, 6)) continue;
          if (chosen.some((o) => Math.hypot((o.x1 + o.x2) / 2 - mx, (o.z1 + o.z2) / 2 - mz) < 7)) continue;
          chosen.push(c);
          if (chosen.length >= 10) break;
        }
        for (const c of chosen) d.props.push({ type: 'laser', ...c, x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2, t: rr(0, 4.5), on: false });
        break;
      }
      case 'stalls':
        for (const r of d.rooms) {
          if (r.arena) continue;
          for (let k = 0; k < Math.floor((r.w * r.h) / 30); k++) {
            const i = ri(r.x + 2, r.x + r.w - 4);
            const j = ri(r.y + 2, r.y + r.h - 3);
            const horiz = chance(0.5);
            const tiles = horiz ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
            let free = true;
            for (const [a, b] of tiles) {
              if (nearKey(d, a + 0.5, b + 0.5, 3.5) || Math.hypot(a + 0.5 - r.cx, b + 0.5 - r.cy) < 2.5) free = false;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[(b + dy) * W + a + dx] !== TILE.FLOOR) free = false;
            }
            if (!free) continue;
            for (const [a, b] of tiles) {
              grid[b * W + a] = TILE.OBST;
              d.feat[b * W + a] = 9; // barraca (não desenha pilar)
            }
            d.props.push({ type: 'stall', x: horiz ? i + 1 : i + 0.5, z: horiz ? j + 0.5 : j + 1, horiz, color: pick([theme.a, theme.b, 0x39ff88, 0x00f0ff]) });
          }
        }
        break;
      case 'merchant': {
        const r = rooms.filter((x) => x !== d.exitRoom).sort((a, b) => b.w * b.h - a.w * a.h)[0] || rooms[0];
        if (r) {
          r.safe = true;
          d.props.push({ type: 'merchant', x: Math.floor(r.cx) + 0.5, z: Math.floor(r.cy) + 0.5, near: false });
        }
        break;
      }
      case 'lanterns':
        for (const r of d.rooms) for (let k = 0; k < Math.floor((r.w * r.h) / 25); k++) d.props.push({ type: 'lantern', x: r.x + rr(1, r.w - 1), z: r.y + rr(1, r.h - 1), y: rr(2.2, 3), color: pick([theme.a, theme.b, 0xff6a00]) });
        break;
    }
  }
  if (G.char && d.props.some((p) => p.type === 'merchant')) d.shop = makeShopStock(d.floor);
}

// A loja sempre oferece itens MELHORES que os equipados (em espaços diferentes),
// com preço proporcional ao tamanho da melhoria.
function makeShopStock(floor) {
  const slots = ['weapon', ...shuffle(SLOTS.filter((s) => s !== 'weapon'))].slice(0, 5);
  return slots.map((slot, k) => upgradeFor(slot, floor, k === 4 && chance(0.4) ? 3 : k < 2 ? 2 : 1));
}

function upgradeFor(slot, floor, minRarity) {
  const c = G.char;
  const cur = c.equip[slot];
  const curScore = itemScore(cur);
  let best = null;
  for (let t = 0; t < 80; t++) {
    // a cada tentativa sem sucesso, o nível do item sobe um pouco
    const ilvl = Math.max(floor + 1, (cur ? cur.ilvl : 1)) + Math.floor(t / 8);
    const rarity = Math.max(minRarity, Math.min(3, (cur ? cur.rarity : 0) + (t > 30 ? 1 : 0)), t > 50 ? 3 : 0);
    const it = makeItem({ ilvl, rarity, slot, cls: c.cls });
    if (!best || itemScore(it) > itemScore(best)) best = it;
    if (itemScore(it) >= curScore * 1.1 && isUpgrade(it, c.equip)) {
      best = it;
      break;
    }
  }
  const gain = curScore > 0 ? Math.max(0, itemScore(best) / curScore - 1) : 1;
  best.price = Math.round((40 + floor * 25) * [1, 1.6, 3, 6][best.rarity] * (1 + Math.min(gain, 2)));
  return best;
}

// Antes de abrir a loja: troca o que deixou de ser melhoria (ex.: você equipou algo melhor)
export function refreshShopStock(stock, floor) {
  if (!stock) return;
  for (let k = 0; k < stock.length; k++) {
    const it = stock[k];
    if (!it.sold && !isUpgrade(it, G.char.equip)) stock[k] = upgradeFor(it.slot, floor, Math.max(1, it.rarity));
  }
}

// ------------------------------------------------------------------
// Malhas
// ------------------------------------------------------------------
const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.92, 1, 32).rotateX(-Math.PI / 2);
let conveyorTex = null;

function arrowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a2e';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ff8a00';
  g.beginPath();
  g.moveTo(16, 44);
  g.lineTo(32, 20);
  g.lineTo(48, 44);
  g.lineTo(40, 44);
  g.lineTo(32, 32);
  g.lineTo(24, 44);
  g.closePath();
  g.fill();
  g.fillStyle = '#111';
  g.fillRect(0, 0, 4, 64);
  g.fillRect(60, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tileMesh(d, value, mat, test = (v) => v === value) {
  const tiles = [];
  for (let k = 0; k < d.W * d.H; k++) if (test(d.feat[k])) tiles.push(k);
  if (!tiles.length) return null;
  const im = new THREE.InstancedMesh(planeGeo, mat, tiles.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  tiles.forEach((k, n) => {
    const i = k % d.W;
    const j = (k / d.W) | 0;
    const f = d.feat[k];
    let rot = 0;
    if (f >= FEAT.CONV) rot = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][f - FEAT.CONV];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m4.compose(new THREE.Vector3(i + 0.5, 0.018, j + 0.5), q, new THREE.Vector3(1, 1, 1));
    im.setMatrixAt(n, m4);
  });
  return im;
}

export function buildFeatures(d, theme, group) {
  const B = (d.biome = { mats: {} });
  // pisos especiais
  const sludgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff14).multiplyScalar(0.55), transparent: true, opacity: 0.75, depthWrite: false });
  const sm = tileMesh(d, FEAT.SLUDGE, sludgeMat);
  if (sm) group.add(sm);
  B.mats.sludge = sludgeMat;
  const iceMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.32, depthWrite: false });
  const im = tileMesh(d, FEAT.ICE, iceMat);
  if (im) group.add(im);
  if (!conveyorTex) conveyorTex = arrowTexture();
  const convMat = new THREE.MeshLambertMaterial({ map: conveyorTex });
  const cm = tileMesh(d, 0, convMat, (v) => v >= FEAT.CONV);
  if (cm) group.add(cm);

  for (const p of d.props) {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    switch (p.type) {
      case 'puddle': {
        const water = new THREE.Mesh(discGeo, new THREE.MeshLambertMaterial({ color: 0x0c1830, transparent: true, opacity: 0.85 }));
        water.scale.setScalar(p.r);
        water.position.y = 0.02;
        const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(gk(1.4)), transparent: true, opacity: 0.5, depthWrite: false });
        const edge = new THREE.Mesh(ringGeo, edgeMat);
        edge.scale.setScalar(p.r);
        edge.position.y = 0.025;
        g.add(water, edge);
        p.edgeMat = edgeMat;
        // cabo partido soltando faíscas
        const cable = new THREE.Mesh(box(0.06, 0.06, 0.9), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        cable.position.set(p.r * 0.6, 0.05, 0);
        cable.rotation.y = rr(0, 3);
        g.add(cable);
        break;
      }
      case 'vent': {
        g.add(new THREE.Mesh(box(1, 0.08, 1), new THREE.MeshLambertMaterial({ color: 0x3a4a5a })));
        for (let k = -2; k <= 2; k++) {
          const bar = new THREE.Mesh(box(0.08, 0.1, 0.9), new THREE.MeshLambertMaterial({ color: 0x1a2430 }));
          bar.position.x = k * 0.18;
          g.add(bar);
        }
        const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ad8ff).multiplyScalar(gk(1.6)) });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 20).rotateX(Math.PI / 2), ringMat);
        ring.position.y = 0.06;
        g.add(ring);
        p.ringMat = ringMat;
        break;
      }
      case 'crusher': {
        const plate = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.25, depthWrite: false }));
        plate.scale.setScalar(1.1);
        plate.position.y = 0.022;
        g.add(plate);
        const piston = new THREE.Group();
        const head = new THREE.Mesh(box(1.05, 0.5, 1.05), new THREE.MeshLambertMaterial({ color: 0x6a6050 }));
        head.position.y = 0.25;
        const stripe = new THREE.Mesh(box(1.07, 0.08, 1.07), glowMat(0xffaa00, 1.8));
        stripe.position.y = 0.05;
        const rod = new THREE.Mesh(box(0.3, 4, 0.3), new THREE.MeshLambertMaterial({ color: 0x3a3630 }));
        rod.position.y = 2.5;
        piston.add(head, stripe, rod);
        piston.position.y = 2.6;
        g.add(piston);
        p.piston = piston;
        p.plate = plate;
        break;
      }
      case 'laser': {
        const dx = p.x2 - p.x1;
        const dz = p.z2 - p.z1;
        const len = Math.hypot(dx, dz);
        const postMat = new THREE.MeshLambertMaterial({ color: 0x3a2a34 });
        for (const [px, pz] of [[p.x1, p.z1], [p.x2, p.z2]]) {
          const post = new THREE.Mesh(box(0.22, 1.3, 0.22), postMat);
          post.position.set(px - p.x, 0.65, pz - p.z);
          g.add(post);
        }
        const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(gk(2)), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
        const beams = new THREE.Group();
        for (const y of [0.35, 0.75, 1.15]) {
          const b = new THREE.Mesh(box(len, 0.05, 0.05), beamMat);
          b.position.y = y;
          beams.add(b);
        }
        beams.rotation.y = -Math.atan2(dz, dx);
        g.add(beams);
        p.beams = beams;
        p.beamMat = beamMat;
        break;
      }
      case 'stall': {
        const tableMat = new THREE.MeshLambertMaterial({ color: 0x4a3a30 });
        const w = p.horiz ? 2 : 1;
        const dpt = p.horiz ? 1 : 2;
        const table = new THREE.Mesh(box(w * 0.9, 0.7, dpt * 0.9), tableMat);
        table.position.y = 0.35;
        const awning = new THREE.Mesh(box(w * 1.05, 0.06, dpt * 1.05), new THREE.MeshLambertMaterial({ color: p.color, emissive: new THREE.Color(p.color).multiplyScalar(0.25) }));
        awning.position.y = 1.55;
        awning.rotation[p.horiz ? 'x' : 'z'] = 0.25;
        g.add(table, awning);
        for (const s of [-1, 1]) {
          const pole = new THREE.Mesh(box(0.05, 1.5, 0.05), tableMat);
          pole.position.set(p.horiz ? s * w * 0.45 : 0, 0.8, p.horiz ? 0 : s * dpt * 0.45);
          g.add(pole);
        }
        const goods = new THREE.Mesh(box(w * 0.6, 0.12, dpt * 0.6), glowMat(p.color, 1.4));
        goods.position.y = 0.76;
        g.add(goods);
        break;
      }
      case 'lantern': {
        const lan = new THREE.Mesh(box(0.22, 0.3, 0.22), glowMat(p.color, 1.8));
        lan.position.y = p.y;
        g.add(lan);
        p.mesh = lan;
        break;
      }
      case 'merchant': {
        const m = humanoid({ body: 0x5a4a6a, dark: 0x22182a, accent: 0xffd23d });
        m.head.add(new THREE.Mesh(box(0.42, 0.06, 0.42), new THREE.MeshLambertMaterial({ color: 0x3a2a20 }))); // chapéu
        m.head.children[m.head.children.length - 1].position.y = 0.2;
        g.add(m.root);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: shopSign(), transparent: true, depthWrite: false, color: new THREE.Color(gk(1.6), gk(1.6), gk(1.6)) }));
        sign.position.y = 2.3;
        g.add(sign);
        const pad = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(gk(1.5)), transparent: true, opacity: 0.6, depthWrite: false }));
        pad.scale.setScalar(1.3);
        pad.position.y = 0.03;
        g.add(pad);
        p.model = m;
        p.sign = sign;
        break;
      }
    }
    group.add(g);
    p.group = g;
  }
}

function shopSign() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffd23d';
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#ffd23d';
  g.font = 'bold 50px Orbitron, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(L('LOJA', 'SHOP'), 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------
// Atualização
// ------------------------------------------------------------------
let rainAcc = 0;
export function updateBiome(dt, camera) {
  const d = G.dungeon;
  if (!d || !d.biome) return;
  const p = G.player;
  const B = d.biome;
  if (conveyorTex) conveyorTex.offset.y -= dt * 1.3;
  if (B.mats.sludge) B.mats.sludge.opacity = 0.6 + Math.sin(G.t * 2) * 0.12;

  // chuva: só visual, em volta da câmera
  if (d.rain && p) {
    rainAcc += dt * 70;
    while (rainAcc > 1) {
      rainAcc--;
      const x = G.camFocus.x + rr(-12, 12);
      const z = G.camFocus.z + rr(-12, 12);
      particle(x, rr(5, 8), z, -0.6, -16, -0.6, 0x6aa0ff, 0.035, 0.45, 0, 0);
    }
  }

  for (const pr of d.props) {
    switch (pr.type) {
      case 'puddle':
        updatePuddle(pr, dt, p);
        break;
      case 'vent':
        updateVent(pr, dt, p);
        break;
      case 'crusher':
        updateCrusher(pr, dt, p);
        break;
      case 'laser':
        updateLaser(pr, dt, p);
        break;
      case 'lantern':
        pr.mesh.position.y = pr.y + Math.sin(G.t * 1.5 + pr.x) * 0.12;
        pr.mesh.rotation.y += dt * 0.5;
        break;
      case 'merchant':
        if (camera) pr.sign.quaternion.copy(camera.quaternion);
        if (p && p.alive) {
          const dist = Math.hypot(p.x - pr.x, p.z - pr.z);
          pr.model.root.rotation.y = Math.atan2(p.x - pr.x, p.z - pr.z);
          if (dist < 1.5 && !pr.near && G.mode === 'play') {
            pr.near = true;
            openShop(d.shop);
          } else if (dist > 2.8) pr.near = false;
        }
        break;
    }
  }
}

// Poças elétricas: carregam, avisam e dão choque em quem estiver dentro (inimigos também)
function updatePuddle(pr, dt, p) {
  pr.t -= dt;
  if (pr.state === 'idle') {
    pr.edgeMat.opacity = 0.35;
    if (pr.t <= 0) {
      pr.state = 'warn';
      pr.t = 0.9;
    }
  } else if (pr.state === 'warn') {
    pr.edgeMat.opacity = Math.floor(pr.t * 12) % 2 ? 0.95 : 0.3;
    if (Math.random() < dt * 20) burst(pr.x + rr(-pr.r, pr.r) * 0.7, 0.1, pr.z + rr(-pr.r, pr.r) * 0.7, 0x00f0ff, 1, 2, 0.05, 0.25);
    if (pr.t <= 0) {
      pr.state = 'shock';
      pr.t = 0.35;
      sfx.zap();
      for (let k = 0; k < 4; k++) beamFx(pr.x + rr(-pr.r, pr.r) * 0.7, 0.05, pr.z + rr(-pr.r, pr.r) * 0.7, pr.x + rr(-pr.r, pr.r) * 0.7, 0.4, pr.z + rr(-pr.r, pr.r) * 0.7, 0x00f0ff, 0.25, 3);
      if (p && p.alive && Math.hypot(p.x - pr.x, p.z - pr.z) < pr.r) damagePlayer(p.stats.maxHp * 0.1 + G.floor * 2);
      for (const e of enemiesInRadius(pr.x, pr.z, pr.r)) if (!e.boss && !e.T.fly) {
        damageEnemy(e, e.maxHp * 0.25, false, { stun: 0.8 });
        e.stun = Math.max(e.stun, 0.8);
      }
    }
  } else if (pr.state === 'shock') {
    pr.edgeMat.opacity = 1;
    if (pr.t <= 0) {
      pr.state = 'idle';
      pr.t = rr(3, 5.5);
    }
  }
}

// Ventoinhas criogênicas: soltam uma nuvem gelada (congela inimigos, deixa o jogador lento)
function updateVent(pr, dt, p) {
  pr.t -= dt;
  if (pr.state === 'idle') {
    pr.ringMat.color.set(0x8ad8ff).multiplyScalar(gk(1.2));
    if (pr.t <= 0) {
      pr.state = 'warn';
      pr.t = 0.8;
      ringFx(pr.x, pr.z, 2.4, 0x8ad8ff, 0.8, { from: 2.3, opacity: 0.6 });
    }
  } else if (pr.state === 'warn') {
    pr.ringMat.color.set(Math.floor(pr.t * 10) % 2 ? 0xffffff : 0x8ad8ff).multiplyScalar(gk(1.8));
    if (pr.t <= 0) {
      pr.state = 'blast';
      pr.t = 1.4;
      pr.hit = new Set();
      sfx.cryo();
    }
  } else {
    for (let k = 0; k < 4; k++) {
      const a = rr(0, Math.PI * 2);
      const sp = rr(1, 3);
      particle(pr.x, 0.3, pr.z, Math.cos(a) * sp, rr(1, 3), Math.sin(a) * sp, pick([0xffffff, 0x8ad8ff]), rr(0.08, 0.16), 0.7, -0.5, 1.5);
    }
    if (p && p.alive && !pr.hit.has(p) && Math.hypot(p.x - pr.x, p.z - pr.z) < 2.4) {
      pr.hit.add(p);
      p.chillT = 2.5;
      damagePlayer(4 + G.floor * 1.5);
      floatText(p.x, 1.8, p.z, L('CONGELANDO', 'CHILLED'), 'shield');
    }
    for (const e of enemiesInRadius(pr.x, pr.z, 2.4)) {
      if (pr.hit.has(e) || e.boss) continue;
      pr.hit.add(e);
      e.stun = Math.max(e.stun, 2);
      e.frozenT = 2;
    }
    if (pr.t <= 0) {
      pr.state = 'idle';
      pr.t = rr(4, 6.5);
    }
  }
}

// Prensas hidráulicas: descem depois de um aviso e esmagam quem estiver embaixo
function updateCrusher(pr, dt, p) {
  pr.t -= dt;
  if (pr.state === 'up') {
    pr.piston.position.y += (2.6 - pr.piston.position.y) * Math.min(1, dt * 3);
    pr.plate.material.opacity = 0.18;
    if (pr.t <= 0) {
      pr.state = 'warn';
      pr.t = 0.75;
    }
  } else if (pr.state === 'warn') {
    pr.piston.position.y = 2.6 - (1 - pr.t / 0.75) * 0.6 + Math.sin(G.t * 60) * 0.02;
    pr.plate.material.opacity = Math.floor(pr.t * 12) % 2 ? 0.65 : 0.25;
    pr.plate.material.color.set(0xff2244);
    if (pr.t <= 0) {
      pr.state = 'slam';
      pr.t = 0.6;
      pr.piston.position.y = 0;
      sfx.punchHeavy();
      burst(pr.x, 0.2, pr.z, 0xffaa00, 12, 4, 0.07, 0.4, { up: 0.3 });
      if (p && p.alive && Math.abs(p.x - pr.x) < 0.75 && Math.abs(p.z - pr.z) < 0.75) {
        damagePlayer(p.stats.maxHp * 0.3);
        p.kx = (p.kx || 0) + (p.x - pr.x) * 12;
        p.kz = (p.kz || 0) + (p.z - pr.z) * 12;
      }
      for (const e of G.enemies) {
        if (!e.alive || e.boss || e.T.fly || Math.abs(e.x - pr.x) > 0.75 || Math.abs(e.z - pr.z) > 0.75) continue;
        damageEnemy(e, e.maxHp * 0.8 + 20, true, {});
      }
      if (Math.hypot(G.player.x - pr.x, G.player.z - pr.z) < 8) G.shake = Math.max(G.shake, 0.15);
    }
  } else {
    pr.plate.material.color.set(0xffaa00);
    if (pr.t <= 0) {
      pr.state = 'up';
      pr.t = rr(2, 3.5);
    }
  }
}

// Grades de laser: ligam e desligam em ciclo
function updateLaser(pr, dt, p) {
  pr.t -= dt;
  const cycle = 4.6;
  if (pr.t <= 0) pr.t += cycle;
  const phase = pr.t; // 4.6..2.6 ligado, 2.6..0.6 desligado, 0.6..0 aviso
  const on = phase > 2.6;
  const warn = phase <= 0.6;
  pr.beams.visible = on || (warn && Math.floor(phase * 14) % 2 === 0);
  pr.beamMat.opacity = on ? 0.9 : 0.35;
  if (on && !pr.on) sfx.laser();
  pr.on = on;
  if (!on) return;
  const dx = pr.x2 - pr.x1;
  const dz = pr.z2 - pr.z1;
  const len = Math.hypot(dx, dz);
  const dist = (x, z) => {
    const t = Math.max(0, Math.min(1, ((x - pr.x1) * dx + (z - pr.z1) * dz) / (len * len)));
    return Math.hypot(x - (pr.x1 + dx * t), z - (pr.z1 + dz * t));
  };
  pr.cool = (pr.cool || 0) - dt;
  if (p && p.alive && pr.cool <= 0 && dist(p.x, p.z) < p.r + 0.08) {
    pr.cool = 0.6;
    damagePlayer(p.stats.maxHp * 0.12 + G.floor * 2);
    burst(p.x, 1, p.z, 0xff2244, 10, 3, 0.05, 0.3);
  }
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.boss) continue;
    if (dist(e.x, e.z) < e.r + 0.08) {
      e.laserCool = (e.laserCool || 0) - dt;
      if (e.laserCool <= 0) {
        e.laserCool = 0.6;
        damageEnemy(e, e.maxHp * 0.2, false, {});
      }
    }
  }
}
