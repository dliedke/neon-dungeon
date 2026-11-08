// Elementos de ambiente de cada bioma: perigos, mecanismos e decoração.
import * as THREE from 'three';
import { G, TILE, gk } from './state.js';
import { rr, ri, rnd, pick, chance, shuffle, isolateRandom } from './utils.js';
import { isWalkableTile, isWalkable, randomFloorInRoom, tileAt, isFinalFloor } from './dungeon.js';
import { damagePlayer, hitEnemy, damageEnemy, enemiesInRadius } from './combat.js';
import { burst, ringFx, beamFx, particle, floatText } from './fx.js';
import { sfx } from './audio.js';
import { L } from './i18n.js';
import { glowMat, box, humanoid } from './models.js';
import { makeItem, itemScore, isUpgrade, unforged, SLOTS } from './items.js';
import { openShop, openForge, openStash } from './ui.js';
import { Input } from './input.js';
import { padText } from './padglyphs.js';

// Tipos de piso especial (d.feat)
// Pisos especiais (d.feat). Esteiras: 3..6 conforme a direção. 9+ = obstáculos decorativos.
export const FEAT = { NONE: 0, SLUDGE: 1, ICE: 2, CONV: 3, THORN: 7, RAD: 8, STALL: 9, TREE: 10, BOULDER: 11, CACTUS: 12, LAVA: 13, SNOW: 14 };
const isConv = (f) => f >= 3 && f <= 6;
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
  if (f === FEAT.SLUDGE) return { speed: 0.55, hurt: 0x39ff14 };
  if (f === FEAT.THORN) return { speed: 0.65, hurt: 0xb36bff };
  if (f === FEAT.RAD) return { speed: 0.85, hurt: 0xc8ff3a };
  if (f === FEAT.ICE) return { speed: 1.1, ice: true };
  if (f === FEAT.LAVA) return { speed: 0.7, hurt: 0xff5a1a, mult: 2.6 };
  if (f === FEAT.SNOW) return { speed: 0.62 };
  if (isConv(f)) {
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
      case 'sludge':
      case 'lava': {
        // rios de lodo tóxico (ou de lava) que atravessam o mapa (também abrem passagens)
        const riverFeat = f === 'lava' ? FEAT.LAVA : FEAT.SLUDGE;
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
                if (grid[k2] === TILE.FLOOR) d.feat[k2] = riverFeat;
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
          const pt = openSpot(d, r, reachMap(d)) || { x: Math.floor(r.cx) + 0.5, z: Math.floor(r.cy) + 0.5 };
          d.props.push({ type: 'merchant', x: pt.x, z: pt.z, near: false });
        }
        break;
      }
      case 'trees':
      case 'pines':
      case 'boulders':
      case 'cacti': {
        // obstáculos isolados (nunca bloqueiam a passagem)
        const kind = f === 'trees' || f === 'pines' ? FEAT.TREE : f === 'boulders' ? FEAT.BOULDER : FEAT.CACTUS;
        const dens = f === 'trees' ? 0.07 : f === 'pines' ? 0.05 : f === 'boulders' ? (theme.id === 'mountain' ? 0.045 : 0.025) : 0.03;
        for (let j = 3; j < H - 3; j++)
          for (let i = 3; i < W - 3; i++) {
            if (grid[j * W + i] !== TILE.FLOOR || rnd() > dens || nearKey(d, i + 0.5, j + 0.5, 3.5)) continue;
            let free = true;
            for (let dy = -1; dy <= 1 && free; dy++) for (let dx = -1; dx <= 1 && free; dx++) if (grid[(j + dy) * W + i + dx] !== TILE.FLOOR || d.feat[(j + dy) * W + i + dx] >= 9) free = false;
            if (!free) continue;
            grid[j * W + i] = TILE.OBST;
            d.feat[j * W + i] = kind;
            d.props.push({ type: 'obst', kind, x: i + 0.5, z: j + 0.5, s: rr(0.8, 1.25), rot: rr(0, Math.PI * 2) });
          }
        break;
      }
      case 'mushrooms':
        for (let k = 0; k < (W * H) / 90; k++) {
          const r = pick(d.rooms);
          const pt = randomFloorInRoom(d, r, 0);
          d.props.push({ type: 'mushroom', x: pt.x, z: pt.z, color: pick([0x7affc8, 0xb36bff, 0x00f0ff]), s: rr(0.6, 1.3) });
        }
        break;
      case 'fireflies':
        d.fireflies = 0x7affc8;
        break;
      case 'butterflies':
        d.butterflies = true;
        break;
      case 'thorns':
      case 'radiation':
        for (const r of rooms) {
          if (!chance(f === 'thorns' ? 0.5 : 0.6)) continue;
          for (let k = ri(1, 2); k > 0; k--) {
            const c = randomFloorInRoom(d, r, 1);
            const rad = rr(1.4, f === 'thorns' ? 2.4 : 3.2);
            for (let j = Math.floor(c.z - rad); j <= c.z + rad; j++)
              for (let i = Math.floor(c.x - rad); i <= c.x + rad; i++) if (Math.hypot(i + 0.5 - c.x, j + 0.5 - c.z) < rad) set(i, j, f === 'thorns' ? FEAT.THORN : FEAT.RAD);
          }
        }
        break;
      case 'drifts':
        // montes de neve fofa: deixam todo mundo lento
        for (const r of rooms) {
          if (!chance(0.6)) continue;
          for (let k = ri(1, 2); k > 0; k--) {
            const c = randomFloorInRoom(d, r, 1);
            const rad = rr(1.6, 3.2);
            for (let j = Math.floor(c.z - rad); j <= c.z + rad; j++)
              for (let i = Math.floor(c.x - rad); i <= c.x + rad; i++) if (Math.hypot(i + 0.5 - c.x, j + 0.5 - c.z) < rad && !d.feat[j * W + i]) set(i, j, FEAT.SNOW);
          }
        }
        break;
      case 'snowfall':
        d.snow = true;
        break;
      case 'blizzard':
        d.sandstorm = { t: rr(12, 20), on: false, snow: true };
        break;
      case 'chasms':
        d.pitStyle = 'chasm';
        carvePits(d, rooms.filter((r) => r.w >= 7 && r.h >= 7), 'blob');
        break;
      case 'rockfall':
        d.rockfall = { t: rr(4, 7) };
        break;
      case 'embers':
        d.embers = true;
        break;
      case 'geysers':
        for (const r of rooms) {
          if (!chance(0.55)) continue;
          const pt = randomFloorInRoom(d, r, 1);
          if (nearKey(d, pt.x, pt.z, 3)) continue;
          d.props.push({ type: 'geyser', x: Math.floor(pt.x) + 0.5, z: Math.floor(pt.z) + 0.5, t: rr(1, 5), state: 'idle' });
        }
        break;
      case 'lakes':
        d.pitStyle = 'water';
        carvePits(d, rooms, 'blob');
        break;
      case 'void':
        d.pitStyle = 'void';
        carvePits(d, rooms.filter((r) => r.w >= 8 && r.h >= 8), 'rect');
        break;
      case 'airlocks':
        for (const h of d.pits || []) if (chance(0.7)) d.props.push({ type: 'airlock', x: h.x, z: h.z, t: rr(2, 6), state: 'idle' });
        break;
      case 'stars':
        d.stars = true;
        break;
      case 'grass':
        d.grass = 0x6aa84a;
        break;
      case 'flowers':
        d.flowers = true;
        break;
      case 'sandstorm':
        d.sandstorm = { t: rr(10, 18), on: false };
        break;
      case 'lanterns':
        for (const r of d.rooms) for (let k = 0; k < Math.floor((r.w * r.h) / 25); k++) d.props.push({ type: 'lantern', x: r.x + rr(1, r.w - 1), z: r.y + rr(1, r.h - 1), y: rr(2.2, 3), color: pick([theme.a, theme.b, 0xff6a00]) });
        break;
    }
  }
  // o estoque depende do equipamento atual: não pode mexer na sequência da semente do andar
  if (G.char && d.props.some((p) => p.type === 'merchant')) d.shop = isolateRandom(() => makeShopStock(d.floor));
  placeSmith(d, rooms);
  placeStash(d);
}

// Mercador ou ferreiro a menos de `rad` do ponto (fendas, santuários e cofres não podem ficar em cima deles)
export const npcNear = (d, x, z, rad) => (d.props || []).some((p) => (p.type === 'smith' || p.type === 'merchant' || p.type === 'stash') && Math.hypot(p.x - x, p.z - z) < rad);

// Baú compartilhado: em todo andar, a uns 3 passos do início, num lugar livre e alcançável
function placeStash(d) {
  if (!G.char) return;
  const { W, H, grid, feat } = d;
  const seen = reachMap(d);
  const sx = Math.floor(d.start.x);
  const sz = Math.floor(d.start.z);
  const opts = [];
  for (let j = sz - 4; j <= sz + 4; j++)
    for (let i = sx - 4; i <= sx + 4; i++) {
      if (i < 2 || j < 2 || i >= W - 2 || j >= H - 2 || !seen[j * W + i]) continue;
      const x = i + 0.5;
      const z = j + 0.5;
      const dist = Math.hypot(x - d.start.x, z - d.start.z);
      if (dist < 2.4 || dist > 3.8 || inArena(d, x, z) || Math.hypot(x - d.exit.x, z - d.exit.z) < 5) continue;
      let free = true;
      for (let dy = -1; dy <= 1 && free; dy++)
        for (let dx = -1; dx <= 1 && free; dx++) {
          const k = (j + dy) * W + i + dx;
          if (grid[k] !== TILE.FLOOR || feat[k]) free = false;
        }
      if (!free || npcNear(d, x, z, 3) || d.props.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6)) continue;
      opts.push({ x, z });
    }
  if (!opts.length) return;
  const pt = pick(opts);
  d.props.push({ type: 'stash', x: pt.x, z: pt.z, near: false, open: 0 });
}


// Ferreiro: sempre no andar depois de cada chefe (4, 7, 10...) e às vezes nos outros
export const smithFloor = (f) => f >= 2 && !isFinalFloor(f) && (f % 3 === 1 || chance(0.3));
function placeSmith(d, rooms) {
  if (!G.char || !smithFloor(d.floor)) return;
  const ok = rooms.filter((r) => r !== d.exitRoom && !r.safe && r.w >= 6 && r.h >= 6);
  const list = shuffle((ok.length ? ok : rooms.filter((r) => r !== d.exitRoom && !r.safe)).slice());
  const seen = reachMap(d);
  for (const r of list) {
    const pt = openSpot(d, r, seen);
    if (!pt) continue;
    r.safe = true;
    d.props.push({ type: 'smith', x: pt.x, z: pt.z, near: false, t: 0 });
    return;
  }
}

// Ladrilhos alcançáveis a pé a partir do início do andar
function reachMap(d) {
  const { W, H, grid } = d;
  const seen = new Uint8Array(W * H);
  const s = Math.floor(d.start.z) * W + Math.floor(d.start.x);
  const q = [s];
  seen[s] = 1;
  while (q.length) {
    const c = q.pop();
    const ci = c % W;
    for (const nb of [c + 1, c - 1, c + W, c - W]) {
      if (nb < 0 || nb >= W * H || seen[nb] || grid[nb] !== TILE.FLOOR) continue;
      if (Math.abs((nb % W) - ci) > 1) continue;
      seen[nb] = 1;
      q.push(nb);
    }
  }
  return seen;
}

// Lugar livre para um NPC na sala: alcançável, sem perigo no chão e com chão aberto em volta
// (nos mapas de pradaria e caverna o centro da sala pode ser pedra). O mais perto do centro vence.
function openSpot(d, r, seen) {
  const { W, H, grid, feat } = d;
  let best = null;
  let bd = Infinity;
  for (const rad of [2, 1]) {
    for (let j = r.y; j < r.y + r.h; j++)
      for (let i = r.x; i < r.x + r.w; i++) {
        if (i < rad + 1 || j < rad + 1 || i >= W - rad - 1 || j >= H - rad - 1) continue;
        if (!seen[j * W + i] || nearKey(d, i + 0.5, j + 0.5, 4)) continue;
        let free = true;
        for (let dy = -rad; dy <= rad && free; dy++)
          for (let dx = -rad; dx <= rad && free; dx++) {
            const k = (j + dy) * W + i + dx;
            if (grid[k] !== TILE.FLOOR || feat[k]) free = false;
          }
        if (!free) continue;
        const dd = Math.hypot(i + 0.5 - r.cx, j + 0.5 - r.cy);
        if (dd < bd) {
          bd = dd;
          best = { x: i + 0.5, z: j + 0.5 };
        }
      }
    if (best) return best;
  }
  return null;
}

// A loja sempre oferece itens MELHORES que os equipados (em espaços diferentes),
// com preço proporcional ao tamanho da melhoria.
// Lagos (pradaria) e buracos para o espaço (estação). Só mantém se o mapa continuar conectado.
function carvePits(d, rooms, shape) {
  const { W, grid } = d;
  d.pits = [];
  const n = Math.min(rooms.length, shape === 'blob' ? 6 : 5);
  for (const r of shuffle(rooms.slice()).slice(0, n)) {
    const c = randomFloorInRoom(d, r, 2);
    const changed = [];
    if (shape === 'blob') {
      const rx = rr(1.8, 4);
      const rz = rr(1.8, 4);
      for (let j = Math.floor(c.z - rz); j <= c.z + rz; j++)
        for (let i = Math.floor(c.x - rx); i <= c.x + rx; i++) {
          const k = j * W + i;
          if (((i + 0.5 - c.x) / rx) ** 2 + ((j + 0.5 - c.z) / rz) ** 2 > 1 + rnd() * 0.2) continue;
          if (grid[k] !== TILE.FLOOR || nearKey(d, i + 0.5, j + 0.5, 3.5)) continue;
          changed.push(k);
        }
    } else {
      const w = ri(2, 3);
      const h = ri(2, 4);
      const i0 = Math.floor(c.x - w / 2);
      const j0 = Math.floor(c.z - h / 2);
      for (let j = j0; j < j0 + h; j++)
        for (let i = i0; i < i0 + w; i++) {
          const k = j * W + i;
          if (grid[k] !== TILE.FLOOR || nearKey(d, i + 0.5, j + 0.5, 3.5)) continue;
          changed.push(k);
        }
    }
    if (changed.length < 3) continue;
    for (const k of changed) grid[k] = TILE.PIT;
    if (!stillConnected(d)) {
      for (const k of changed) grid[k] = TILE.FLOOR;
      continue;
    }
    let sx = 0;
    let sz = 0;
    for (const k of changed) {
      sx += (k % W) + 0.5;
      sz += Math.floor(k / W) + 0.5;
    }
    d.pits.push({ x: sx / changed.length, z: sz / changed.length, tiles: changed });
  }
}

// O fim do andar continua alcançável a partir do início?
function stillConnected(d) {
  const { W, H, grid } = d;
  const seen = new Uint8Array(W * H);
  const s = Math.floor(d.start.z) * W + Math.floor(d.start.x);
  const q = [s];
  seen[s] = 1;
  let n = 0;
  while (q.length) {
    const c = q.pop();
    n++;
    const ci = c % W;
    for (const nb of [c + 1, c - 1, c + W, c - W]) {
      if (nb < 0 || nb >= W * H || seen[nb] || grid[nb] !== TILE.FLOOR) continue;
      if (Math.abs((nb % W) - ci) > 1) continue;
      seen[nb] = 1;
      q.push(nb);
    }
  }
  const e = Math.floor(d.exit.z) * W + Math.floor(d.exit.x);
  if (!seen[e]) return false;
  // nenhuma sala pode ficar isolada
  return d.rooms.every((r) => seen[Math.floor(r.cy) * W + Math.floor(r.cx)] || grid[Math.floor(r.cy) * W + Math.floor(r.cx)] !== TILE.FLOOR);
}

function makeShopStock(floor) {
  const slots = ['weapon', ...shuffle(SLOTS.filter((s) => s !== 'weapon'))].slice(0, 5);
  return slots.map((slot, k) => upgradeFor(slot, floor, k === 4 && chance(0.4) ? 3 : k < 2 ? 2 : 1));
}

function upgradeFor(slot, floor, minRarity) {
  const c = G.char;
  const cur = c.equip[slot];
  const curScore = itemScore(unforged(cur));
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
    if (isConv(f)) rot = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][f - FEAT.CONV];
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
  const cm = tileMesh(d, 0, convMat, isConv);
  // espinhos e radiação
  const thornMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a2a8a).multiplyScalar(0.9), transparent: true, opacity: 0.8, depthWrite: false });
  const tm = tileMesh(d, FEAT.THORN, thornMat);
  if (tm) group.add(tm);
  const radMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ff3a).multiplyScalar(0.8), transparent: true, opacity: 0.6, depthWrite: false });
  const rm = tileMesh(d, FEAT.RAD, radMat);
  if (rm) group.add(rm);
  B.mats.rad = radMat;
  const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1a).multiplyScalar(gk(1.5)), transparent: true, opacity: 0.92, depthWrite: false });
  const lm = tileMesh(d, FEAT.LAVA, lavaMat);
  if (lm) group.add(lm);
  B.mats.lava = lavaMat;
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xd8e2ee, emissive: new THREE.Color(0x0c1018) });
  const snm = tileMesh(d, FEAT.SNOW, snowMat);
  if (snm) {
    snm.position.y += 0.05;
    group.add(snm);
  }
  buildNature(d, theme, group, B);
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
      case 'geyser': {
        g.add(meshAt(new THREE.CylinderGeometry(0.6, 0.8, 0.22, 9), new THREE.MeshLambertMaterial({ color: 0x2a1a16 }), 0, 0.1, 0));
        const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1a).multiplyScalar(gk(1.4)) });
        g.add(meshAt(new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2), coreMat, 0, 0.23, 0));
        p.ringMat = coreMat;
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
      case 'airlock': {
        const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffaa00).multiplyScalar(gk(1.6)), transparent: true, opacity: 0.8, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.55, 32).rotateX(-Math.PI / 2), ringMat);
        ring.position.y = 0.04;
        g.add(ring);
        for (let k = 0; k < 4; k++) {
          const lamp = new THREE.Mesh(box(0.15, 0.4, 0.15), glowMat(0xff2244, 1.8));
          const a = (k / 4) * Math.PI * 2;
          lamp.position.set(Math.cos(a) * 1.6, 0.2, Math.sin(a) * 1.6);
          g.add(lamp);
        }
        p.ringMat = ringMat;
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
      case 'smith': {
        // ferreiro de avental com martelo, bigorna e uma fornalha acesa
        const m = humanoid({ body: 0x6a4a34, dark: 0x1e1410, accent: 0xff7a1a });
        const apron = new THREE.Mesh(box(0.4, 0.5, 0.06), new THREE.MeshLambertMaterial({ color: 0x2a1a12 }));
        apron.position.set(0, -0.05, 0.17);
        m.torso.add(apron);
        const hammer = new THREE.Group();
        const handle = new THREE.Mesh(box(0.05, 0.42, 0.05), new THREE.MeshLambertMaterial({ color: 0x5a3a20 }));
        handle.position.y = -0.2;
        const headM = new THREE.Mesh(box(0.2, 0.12, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a8f9a }));
        headM.position.y = -0.42;
        hammer.add(handle, headM);
        m.handR.add(hammer);
        g.add(m.root);
        const anvil = new THREE.Group();
        const aMat = new THREE.MeshLambertMaterial({ color: 0x3a3e4a });
        const aBase = new THREE.Mesh(box(0.3, 0.35, 0.3), aMat);
        aBase.position.y = 0.175;
        const aTop = new THREE.Mesh(box(0.62, 0.16, 0.3), aMat);
        aTop.position.y = 0.43;
        const hot = new THREE.Mesh(box(0.3, 0.05, 0.08), glowMat(0xff7a1a, 2.6));
        hot.position.y = 0.53;
        anvil.add(aBase, aTop, hot);
        anvil.position.set(0, 0, 0.62);
        g.add(anvil);
        const furnace = new THREE.Mesh(box(0.7, 0.9, 0.6), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
        furnace.position.set(-0.95, 0.45, -0.1);
        const mouth = new THREE.Mesh(box(0.42, 0.3, 0.05), glowMat(0xff5a1a, 3).clone());
        mouth.position.set(0, -0.1, 0.31);
        furnace.add(mouth);
        g.add(furnace);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), new THREE.MeshBasicMaterial({ map: shopSign(L('FERREIRO', 'FORGE'), '#ff7a1a', 40), transparent: true, depthWrite: false, color: new THREE.Color(gk(1.6), gk(1.6), gk(1.6)) }));
        sign.position.y = 2.3;
        g.add(sign);
        const pad = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a1a).multiplyScalar(gk(1.5)), transparent: true, opacity: 0.6, depthWrite: false }));
        pad.scale.setScalar(1.5);
        pad.position.y = 0.03;
        g.add(pad);
        p.model = m;
        p.sign = sign;
        p.anvil = anvil;
        p.mouth = mouth;
        break;
      }
      case 'stash': {
        // baú de metal com frisos neon, tampa que abre e um cubo holográfico girando em cima
        const chest = new THREE.Group(); // só o baú gira (a placa fica sempre de frente para a câmera)
        const metal = new THREE.MeshLambertMaterial({ color: 0x2a3444 });
        const base = new THREE.Mesh(box(0.95, 0.5, 0.6), metal);
        base.position.y = 0.25;
        chest.add(base);
        const trim = glowMat(0x00f0ff, 2.2);
        for (const sx of [-0.44, 0.44]) {
          const t = new THREE.Mesh(box(0.06, 0.52, 0.62), trim);
          t.position.set(sx, 0.26, 0);
          chest.add(t);
        }
        const band = new THREE.Mesh(box(0.97, 0.05, 0.62), trim);
        band.position.y = 0.32;
        chest.add(band);
        const lock = new THREE.Mesh(box(0.14, 0.14, 0.04), glowMat(0xffd23d, 2.4));
        lock.position.set(0, 0.42, 0.31);
        chest.add(lock);
        // a tampa gira na dobradiça de trás
        const lid = new THREE.Group();
        lid.position.set(0, 0.5, -0.3);
        const lidM = new THREE.Mesh(box(0.97, 0.14, 0.62), metal);
        lidM.position.set(0, 0.07, 0.3);
        const lidT = new THREE.Mesh(box(0.99, 0.04, 0.12), trim);
        lidT.position.set(0, 0.07, 0.56);
        lid.add(lidM, lidT);
        chest.add(lid);
        const holo = new THREE.Mesh(box(0.26, 0.26, 0.26), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(gk(1.8)), transparent: true, opacity: 0.55, depthWrite: false }));
        holo.position.y = 1.05;
        chest.add(holo);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.45), new THREE.MeshBasicMaterial({ map: shopSign(L('BAÚ', 'STASH'), '#00f0ff', 48), transparent: true, depthWrite: false, color: new THREE.Color(gk(1.6), gk(1.6), gk(1.6)) }));
        sign.position.y = 1.75;
        g.add(sign);
        const pad = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(gk(1.5)), transparent: true, opacity: 0.6, depthWrite: false }));
        pad.scale.setScalar(1.1);
        pad.position.y = 0.03;
        g.add(pad);
        chest.rotation.y = Math.atan2(d.start.x - p.x, d.start.z - p.z); // de frente para quem chega
        g.add(chest);
        p.lid = lid;
        p.holo = holo;
        p.sign = sign;
        break;
      }
    }
    group.add(g);
    p.group = g;
  }
}

// ------------------------------------------------------------------
// Natureza, água, espaço
// ------------------------------------------------------------------
function starTexture(n = 400) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000005';
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < n; k++) {
    const b = Math.random();
    g.fillStyle = `rgba(${200 + b * 55},${200 + b * 55},255,${0.3 + b * 0.7})`;
    const sz = b > 0.95 ? 2 : 1;
    g.fillRect(Math.random() * 512, Math.random() * 512, sz, sz);
  }
  // nebulosa
  const grad = g.createRadialGradient(300, 200, 10, 300, 200, 220);
  grad.addColorStop(0, 'rgba(120,60,200,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildNature(d, theme, group, B) {
  const { W, H, grid } = d;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pitTiles = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === TILE.PIT) pitTiles.push(k);
  // água dos lagos
  if (d.pitStyle === 'water' && pitTiles.length) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a7ac8, transparent: true, opacity: 0.85, emissive: new THREE.Color(0x0a3a6a) });
    const im = new THREE.InstancedMesh(planeGeo, mat, pitTiles.length);
    pitTiles.forEach((k, n) => im.setMatrixAt(n, m4.makeTranslation((k % W) + 0.5, -0.06, Math.floor(k / W) + 0.5)));
    group.add(im);
    B.water = mat;
    // brilho na água
    const glint = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    const gm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.06).rotateX(-Math.PI / 2), glint, Math.min(200, pitTiles.length));
    for (let n = 0; n < gm.count; n++) {
      const k = pick(pitTiles);
      q.setFromAxisAngle(up, rr(0, Math.PI));
      m4.compose(new THREE.Vector3((k % W) + rr(0.2, 0.8), -0.04, Math.floor(k / W) + rr(0.2, 0.8)), q, new THREE.Vector3(1, 1, 1));
      gm.setMatrixAt(n, m4);
    }
    group.add(gm);
    B.glint = glint;
  }
  // montanha: abismo escuro com névoa no fundo
  if (d.pitStyle === 'chasm' && pitTiles.length) {
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, H + 60).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14161c }));
    deep.position.set(W / 2, -7, H / 2);
    group.add(deep);
    const mist = new THREE.MeshBasicMaterial({ color: 0xc8d4e8, transparent: true, opacity: 0.12, depthWrite: false });
    const mm = new THREE.InstancedMesh(planeGeo, mist, pitTiles.length);
    pitTiles.forEach((k, n) => mm.setMatrixAt(n, m4.makeTranslation((k % W) + 0.5, -1.5, Math.floor(k / W) + 0.5)));
    group.add(mm);
  }
  // espaço: céu estrelado por baixo do mapa
  if (d.stars) {
    const tex = starTexture();
    tex.repeat.set(W / 12, H / 12);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    sky.position.set(W / 2, -6, H / 2);
    group.add(sky);
    B.sky = tex;
    // borda brilhante nos buracos
    if (pitTiles.length) {
      const rim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3355).multiplyScalar(gk(1.6)) });
      const rims = [];
      for (const k of pitTiles) {
        const i = k % W;
        const j = Math.floor(k / W);
        for (const [dx, dz, rot] of [[1, 0, Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, 0], [0, -1, 0]]) if (grid[(j + dz) * W + i + dx] === TILE.FLOOR) rims.push([i + 0.5 + dx * 0.5, j + 0.5 + dz * 0.5, rot]);
      }
      const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.06), rim, Math.max(1, rims.length));
      rims.forEach(([x, z, rot], n) => {
        q.setFromAxisAngle(up, rot);
        m4.compose(new THREE.Vector3(x, 0.03, z), q, new THREE.Vector3(1, 1, 1));
        rm.setMatrixAt(n, m4);
      });
      group.add(rm);
    }
  }
  // grama e flores
  const floorTiles = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === TILE.FLOOR && !d.feat[k]) floorTiles.push(k);
  if (d.grass && floorTiles.length) {
    const blade = new THREE.ConeGeometry(0.05, 0.35, 3).translate(0, 0.17, 0);
    const mat = new THREE.MeshLambertMaterial({ color: d.grass });
    const n = Math.min(2500, floorTiles.length * 2);
    const im = new THREE.InstancedMesh(blade, mat, n);
    const col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const t = pick(floorTiles);
      q.setFromAxisAngle(new THREE.Vector3(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)).normalize(), rr(0, 6));
      const s2 = rr(0.6, 1.4);
      m4.compose(new THREE.Vector3((t % W) + rr(0, 1), 0, Math.floor(t / W) + rr(0, 1)), q, new THREE.Vector3(s2, s2, s2));
      im.setMatrixAt(k, m4);
      im.setColorAt(k, col.setRGB(rr(0.7, 1.2), rr(0.8, 1.2), rr(0.6, 1)));
    }
    group.add(im);
  }
  if (d.flowers && floorTiles.length) {
    const geo = new THREE.SphereGeometry(0.07, 6, 4).translate(0, 0.25, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const n = Math.min(500, floorTiles.length / 3);
    const im = new THREE.InstancedMesh(geo, mat, Math.floor(n));
    const col = new THREE.Color();
    for (let k = 0; k < im.count; k++) {
      const t = pick(floorTiles);
      m4.makeTranslation((t % W) + rr(0, 1), 0, Math.floor(t / W) + rr(0, 1));
      im.setMatrixAt(k, m4);
      im.setColorAt(k, col.set(pick([0xff6ad5, 0xffe14d, 0xffffff, 0x8ab4ff, 0xff8a00])).multiplyScalar(gk(1.3)));
    }
    group.add(im);
  }
  // obstáculos: árvores, pedras e cactos
  for (const p of d.props) {
    if (p.type !== 'obst') continue;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rot;
    g.scale.setScalar(p.s);
    if (p.kind === FEAT.TREE) {
      g.add(meshAt(new THREE.CylinderGeometry(0.14, 0.22, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0x3a2a1e }), 0, 0.7, 0));
      const leaf = new THREE.MeshLambertMaterial({ color: pick([0x1a3a24, 0x16301e, 0x22402a]), emissive: new THREE.Color(0x05100a) });
      g.add(meshAt(new THREE.ConeGeometry(0.85, 1.4, 7), leaf, 0, 1.6, 0));
      g.add(meshAt(new THREE.ConeGeometry(0.6, 1.1, 7), leaf, 0, 2.3, 0));
      if (theme.id === 'snow') {
        // pinheiro com neve no topo dos galhos
        const snowM = new THREE.MeshLambertMaterial({ color: 0xd8e2ee, emissive: new THREE.Color(0x0c1018) });
        g.add(meshAt(new THREE.ConeGeometry(0.62, 0.55, 7), snowM, 0, 2.05, 0));
        g.add(meshAt(new THREE.ConeGeometry(0.4, 0.5, 7), snowM, 0, 2.65, 0));
      }
    } else if (p.kind === FEAT.BOULDER) {
      const rock = meshAt(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial({ color: { desert: 0x9a7a54, mountain: 0x6a6660, volcano: 0x2a2224, snow: 0xa8b4c0 }[theme.id] || 0x7a7a72 }), 0, 0.35, 0);
      rock.scale.set(1, 0.75, 1.1);
      g.add(rock);
    } else {
      const cm = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
      g.add(meshAt(new THREE.CylinderGeometry(0.2, 0.24, 1.6, 8), cm, 0, 0.8, 0));
      const arm = meshAt(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), cm, 0.32, 1.0, 0);
      arm.rotation.z = -0.9;
      g.add(arm);
      g.add(meshAt(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 6), cm, 0.52, 1.35, 0));
      g.add(meshAt(new THREE.SphereGeometry(0.08, 6, 4), glowMat(0xff6ad5, 1.6), 0, 1.65, 0));
    }
    group.add(g);
  }
  // cogumelos brilhantes
  for (const p of d.props) {
    if (p.type !== 'mushroom') continue;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.scale.setScalar(p.s);
    g.add(meshAt(new THREE.CylinderGeometry(0.04, 0.05, 0.25, 5), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }), 0, 0.12, 0));
    g.add(meshAt(new THREE.SphereGeometry(0.14, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(p.color, 1.7), 0, 0.24, 0));
    group.add(g);
  }
}

function meshAt(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function shopSign(text = L('LOJA', 'SHOP'), color = '#ffd23d', size = 50) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = color;
  g.font = `bold ${size}px Orbitron, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52, 232);
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

  if (B.water) B.water.opacity = 0.8 + Math.sin(G.t * 1.5) * 0.06;
  if (B.glint) B.glint.opacity = 0.15 + Math.abs(Math.sin(G.t * 2)) * 0.25;
  if (B.mats.rad) B.mats.rad.opacity = 0.5 + Math.sin(G.t * 3) * 0.15;
  if (B.mats.lava) B.mats.lava.color.setRGB(1, 0.35 + Math.sin(G.t * 2.2) * 0.08, 0.1).multiplyScalar(gk(1.4 + Math.sin(G.t * 1.3) * 0.15));
  // neve caindo: só visual, em volta da câmera
  if (d.snow && p) {
    rainAcc += dt * 70;
    while (rainAcc > 1) {
      rainAcc--;
      particle(G.camFocus.x + rr(-14, 12), rr(5, 9), G.camFocus.z + rr(-13, 13), rr(0.2, 0.9), rr(-2.4, -1.4), rr(-0.4, 0.4), pick([0xffffff, 0xeaf2ff, 0xd8e8ff]), rr(0.05, 0.1), 4.5, 0, 0);
    }
  }
  if (d.rockfall && p && p.alive) updateRockfall(d, dt, p);
  tickRocks(d, dt);
  if (B.sky) B.sky.offset.x += dt * 0.004;
  if (p) ambientParticles(d, dt);

  for (const pr of d.props) {
    switch (pr.type) {
      case 'airlock':
        updateAirlock(pr, dt, p);
        break;
      case 'puddle':
        updatePuddle(pr, dt, p);
        break;
      case 'vent':
        updateVent(pr, dt, p);
        break;
      case 'geyser':
        updateGeyser(pr, dt, p);
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
          if (dist < 9) pr.model.root.rotation.y = Math.atan2(p.x - pr.x, p.z - pr.z);
        }
        break;
      case 'smith': {
        if (camera) pr.sign.quaternion.copy(camera.quaternion);
        // martela a bigorna no ritmo; faíscas a cada batida
        pr.t += dt;
        const ph = (pr.t * 1.4) % 1;
        pr.model.armR.rotation.x = ph < 0.7 ? -2.2 * (ph / 0.7) : -2.2 + 2.2 * ((ph - 0.7) / 0.3);
        if (ph < pr.lastPh) {
          burst(pr.x, 0.6, pr.z + 0.62, 0xffb04d, 8, 3, 0.04, 0.35, { up: 1.5 });
          if (p && Math.hypot(p.x - pr.x, p.z - pr.z) < 7) sfx.forgeTick();
        }
        pr.lastPh = ph;
        pr.mouth.material.color.set(0xff5a1a).multiplyScalar(gk(2.4 + Math.sin(pr.t * 7) * 0.6));
        break;
      }
      case 'stash': {
        if (camera) pr.sign.quaternion.copy(camera.quaternion);
        pr.holo.rotation.y += dt * 1.6;
        pr.holo.position.y = 1.05 + Math.sin(G.t * 2.4) * 0.06;
        // a tampa abre quando o jogador chega perto
        const dist = p && p.alive ? Math.hypot(p.x - pr.x, p.z - pr.z) : 99;
        pr.open += ((dist < 3 || G.mode === 'stash' ? 1 : 0) - pr.open) * Math.min(1, dt * 6);
        pr.lid.rotation.x = -pr.open * 1.1;
        break;
      }
    }
  }
  updateNpcInteract(d, p, camera);
}

// ---------------- mercador, ferreiro e baú: abrem só quando o jogador pede ----------------
// Mouse: clicar neles (de longe o personagem anda até lá). Controle: {A} perto. Toque: o botão que aparece em cima.
// Teclado: Enter perto. O botão flutuante também funciona com clique.
const NPC_RANGE = { merchant: 2.3, smith: 2.5, stash: 2.1 };
const npcV = new THREE.Vector3();
let promptEl = null;
let promptHtml = '';

export function openNpc(pr) {
  const p = G.player;
  if (p) {
    p.npcGo = null;
    p.path = null;
  }
  if (pr.type === 'merchant') openShop(G.dungeon.shop);
  else if (pr.type === 'smith') openForge();
  else if (pr.type === 'stash') openStash();
}

// mercador/ferreiro/baú sob o cursor (em pixels na tela), para o clique do mouse
export function npcUnderCursor(mx, my, camera) {
  const d = G.dungeon;
  if (!d || !d.props) return null;
  let best = null;
  let bd = 46;
  for (const pr of d.props) {
    if (!NPC_RANGE[pr.type]) continue;
    npcV.set(pr.x, pr.type === 'stash' ? 0.5 : 0.9, pr.z).project(camera);
    const dd = Math.hypot(((npcV.x + 1) / 2) * innerWidth - mx, ((1 - npcV.y) / 2) * innerHeight - my);
    if (dd < bd) {
      bd = dd;
      best = pr;
    }
  }
  return best;
}

function npcLabel(pr) {
  if (pr.type === 'merchant') return L('Abrir loja', 'Open shop');
  if (pr.type === 'smith') return L('Falar com o ferreiro', 'Talk to the blacksmith');
  return L('Abrir baú', 'Open stash');
}

function updateNpcInteract(d, p, camera) {
  if (!promptEl) {
    promptEl = document.getElementById('interact');
    if (!promptEl) return;
  }
  let near = null;
  let nd = 1e9;
  if (p && p.alive && G.mode === 'play') {
    for (const pr of d.props) {
      const R = NPC_RANGE[pr.type];
      if (!R) continue;
      const dist = Math.hypot(p.x - pr.x, p.z - pr.z);
      // clicado de longe: abre assim que chegar
      if (p.npcGo === pr && dist < R) {
        openNpc(pr);
        promptEl.classList.add('hidden');
        return;
      }
      if (dist < R && dist < nd) {
        nd = dist;
        near = pr;
      }
    }
  }
  G.npcNear = near;
  if (!near) {
    promptEl.classList.add('hidden');
    return;
  }
  // no controle o {A} também ataca: com inimigo perto, não abre nada sem querer
  const e = p.aimEnemy;
  const busy = G.lastInput === 'pad' && e && e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 7;
  if (Input.pressed('interact') && !busy) {
    openNpc(near);
    promptEl.classList.add('hidden');
    return;
  }
  const how = G.lastInput === 'pad' ? padText('{A}') : G.lastInput === 'touch' ? '👆' : '🖱️ ' + L('Clique / Enter', 'Click / Enter');
  const html = `${how} <b>${npcLabel(near)}</b>`;
  if (html !== promptHtml) {
    promptHtml = html;
    promptEl.innerHTML = html;
  }
  npcV.set(near.x, near.type === 'stash' ? 1.5 : 2.6, near.z).project(camera);
  promptEl.style.transform = `translate(${((npcV.x + 1) / 2) * innerWidth}px, ${((1 - npcV.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
  promptEl.classList.remove('hidden');
}

// Vaga-lumes, borboletas e tempestade de areia
let ambAcc = 0;
function ambientParticles(d, dt) {
  const cx = G.camFocus.x;
  const cz = G.camFocus.z;
  ambAcc += dt;
  if (d.fireflies && ambAcc > 0.08) {
    particle(cx + rr(-11, 11), rr(0.4, 2.2), cz + rr(-11, 11), rr(-0.4, 0.4), rr(-0.2, 0.3), rr(-0.4, 0.4), Math.random() < 0.7 ? d.fireflies : 0xffe14d, 0.05, rr(1.5, 3), 0, 0);
  }
  if (d.butterflies && ambAcc > 0.08 && Math.random() < 0.4) {
    particle(cx + rr(-10, 10), rr(0.5, 1.6), cz + rr(-10, 10), rr(-1, 1), rr(-0.2, 0.5), rr(-1, 1), pick([0xff6ad5, 0xffe14d, 0x8ab4ff, 0xffffff]), 0.07, rr(1.5, 2.5), 0, 0);
  }
  if (d.embers && ambAcc > 0.08) {
    for (let k = 0; k < 2; k++) particle(cx + rr(-11, 11), rr(0, 0.6), cz + rr(-11, 11), rr(-0.3, 0.3), rr(0.8, 1.8), rr(-0.3, 0.3), pick([0xff5a1a, 0xffaa00, 0xff3300]), rr(0.03, 0.06), rr(1.5, 2.8), -0.3, 0);
  }
  if (ambAcc > 0.08) ambAcc = 0;
  if (d.sandstorm) {
    const st = d.sandstorm;
    st.t -= dt;
    if (st.t <= 0) {
      st.on = !st.on;
      st.t = st.on ? rr(6, 9) : rr(14, 22);
      if (st.on) toastStorm();
    }
    const fog = G.scene.fog;
    const L2 = G.theme.light;
    // anomalia Apagão: a névoa continua perto depois da tempestade
    const dark = G.anomaly === 'dark';
    const near = st.on ? 6 : L2.fogNear * (dark ? 0.35 : 1);
    const far = st.on ? 18 : L2.fogFar * (dark ? 0.5 : 1);
    fog.near += (near - fog.near) * Math.min(1, dt);
    fog.far += (far - fog.far) * Math.min(1, dt);
    if (st.on) for (let k = 0; k < 6; k++) particle(cx + rr(-12, 4), rr(0.2, 2.5), cz + rr(-12, 12), rr(9, 14), rr(-0.5, 0.5), rr(3, 6), st.snow ? pick([0xffffff, 0xdde8f4]) : pick([0xd8b088, 0xc8a070]), rr(0.04, 0.08), 0.9, 0, 0);
    // na nevasca o frio deixa o jogador mais lento
    if (st.on && st.snow && G.player && G.player.alive) G.player.chillT = Math.max(G.player.chillT || 0, 0.15);
  }
}
function toastStorm() {
  const snow = G.dungeon && G.dungeon.sandstorm && G.dungeon.sandstorm.snow;
  floatText(G.player.x, 2.2, G.player.z, snow ? L('NEVASCA!', 'BLIZZARD!') : L('TEMPESTADE DE AREIA!', 'SANDSTORM!'), 'info');
}

// Montanha: pedras rolam dos penhascos perto do jogador (com aviso no chão)
const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshLambertMaterial({ color: 0x6a6660 });
function updateRockfall(d, dt, p) {
  const rf = d.rockfall;
  rf.t -= dt;
  if (rf.t > 0) return;
  rf.t = rr(3.5, 6.5);
  const n = chance(0.35) ? 3 : 1;
  const R = 1.4;
  for (let k = 0; k < n; k++) {
    const x = p.x + rr(-4.5, 4.5) + (p.ivx || 0) * 0.6;
    const z = p.z + rr(-4.5, 4.5) + (p.ivz || 0) * 0.6;
    if (!isWalkable(d, x, z)) continue;
    ringFx(x, z, R, 0xffb35a, 1.1, { from: R - 0.05, opacity: 0.7 });
    const rock = meshAt(rockGeo, rockMat, x, 12, z);
    G.world.add(rock);
    rf.list = rf.list || [];
    rf.list.push({ rock, x, z, t: 0 });
  }
  sfx.telegraph();
}
// queda das pedras (no ritmo do jogo)
function tickRocks(d, dt) {
  const rf = d.rockfall;
  if (!rf || !rf.list) return;
  const R = 1.4;
  for (const r of rf.list) {
    r.t += dt;
    r.rock.position.y = 12 - r.t * r.t * 10; // cai em ~1,1s
    r.rock.rotation.x += dt * 9;
    if (r.rock.position.y > 0.4) continue;
    r.done = true;
    r.rock.parent && r.rock.parent.remove(r.rock);
    burst(r.x, 0.3, r.z, 0x8a8478, 22, 5, 0.09, 0.5, { up: 0.5 });
    sfx.punchHeavy();
    const p = G.player;
    if (Math.hypot(p.x - r.x, p.z - r.z) < 10) G.shake = Math.max(G.shake, 0.2);
    if (p.alive && Math.hypot(p.x - r.x, p.z - r.z) < R + p.r) damagePlayer(6 + G.floor * 2.2);
    for (const e of enemiesInRadius(r.x, r.z, R)) if (!e.boss && !e.T.fly) damageEnemy(e, e.maxHp * 0.35 + 10, false, {});
  }
  rf.list = rf.list.filter((r) => !r.done);
}

// Vulcão: gêiseres de lava que avisam e depois jorram, queimando quem estiver perto
function updateGeyser(pr, dt, p) {
  pr.t -= dt;
  if (pr.state === 'idle') {
    pr.ringMat.color.set(0xff5a1a).multiplyScalar(gk(1.2));
    if (Math.random() < dt * 3) particle(pr.x, 0.3, pr.z, rr(-0.3, 0.3), rr(0.5, 1.2), rr(-0.3, 0.3), 0x554a48, rr(0.1, 0.18), 1.2, -0.3, 1.4);
    if (pr.t <= 0) {
      pr.state = 'warn';
      pr.t = 0.9;
      ringFx(pr.x, pr.z, 2.2, 0xff5a1a, 0.9, { from: 2.1, opacity: 0.7 });
    }
  } else if (pr.state === 'warn') {
    pr.ringMat.color.set(Math.floor(pr.t * 10) % 2 ? 0xffee88 : 0xff5a1a).multiplyScalar(gk(2));
    if (pr.t <= 0) {
      pr.state = 'blast';
      pr.t = 1.2;
      pr.hit = new Set();
      sfx.explode();
    }
  } else {
    for (let k = 0; k < 5; k++) {
      const a = rr(0, Math.PI * 2);
      const sp = rr(0.5, 2.2);
      particle(pr.x, 0.3, pr.z, Math.cos(a) * sp, rr(5, 9), Math.sin(a) * sp, pick([0xff5a1a, 0xffaa00, 0xff3300]), rr(0.1, 0.2), 0.8, 9, 1.4);
    }
    if (p && p.alive && !pr.hit.has(p) && Math.hypot(p.x - pr.x, p.z - pr.z) < 2.2) {
      pr.hit.add(p);
      damagePlayer(6 + G.floor * 2);
      floatText(p.x, 1.8, p.z, L('QUEIMANDO', 'BURNING'), 'info');
    }
    for (const e of enemiesInRadius(pr.x, pr.z, 2.2)) {
      if (pr.hit.has(e) || e.boss || e.T.fireproof) continue;
      pr.hit.add(e);
      damageEnemy(e, e.maxHp * 0.3 + 8, false, {});
    }
    if (pr.t <= 0) {
      pr.state = 'idle';
      pr.t = rr(4, 7);
    }
  }
}

// Comportas de vácuo: alarme e depois puxam tudo em direção ao buraco
function updateAirlock(pr, dt, p) {
  pr.t -= dt;
  if (pr.state === 'idle') {
    pr.ringMat.opacity = 0.35;
    if (pr.t <= 0) {
      pr.state = 'warn';
      pr.t = 1.2;
      sfx.telegraph();
    }
  } else if (pr.state === 'warn') {
    pr.ringMat.opacity = Math.floor(pr.t * 8) % 2 ? 1 : 0.2;
    if (pr.t <= 0) {
      pr.state = 'open';
      pr.t = 2.2;
      sfx.dash();
    }
  } else {
    pr.ringMat.opacity = 0.9;
    const R = 6.5;
    const pull = (o, k) => {
      const dx = pr.x - o.x;
      const dz = pr.z - o.z;
      const l = Math.hypot(dx, dz);
      if (l > R || l < 0.01) return l;
      const f = (1 - l / R) * k * dt;
      o.x += (dx / l) * f;
      o.z += (dz / l) * f;
      return l;
    };
    for (let k = 0; k < 4; k++) {
      const a = rr(0, Math.PI * 2);
      const r = rr(2, R);
      particle(pr.x + Math.cos(a) * r, rr(0.2, 1.4), pr.z + Math.sin(a) * r, -Math.cos(a) * r * 1.2, 0, -Math.sin(a) * r * 1.2, 0xffffff, 0.05, 0.5, 0, 0);
    }
    if (p && p.alive && !p.dash && !p.leap) {
      const l = pull(p, 9);
      p.vacT = (p.vacT || 0) - dt;
      if (l < 2.2 && p.vacT <= 0) {
        p.vacT = 0.5;
        damagePlayer(p.stats.maxHp * 0.06 + G.floor);
      }
    }
    for (const e of G.enemies) {
      if (!e.alive || e.static || e.boss) continue;
      const l = pull(e, 9);
      if (l < 2.2) {
        e.vacT = (e.vacT || 0) - dt;
        if (e.vacT <= 0) {
          e.vacT = 0.5;
          damageEnemy(e, e.maxHp * 0.15, false, {});
        }
      }
    }
    if (pr.t <= 0) {
      pr.state = 'idle';
      pr.t = rr(5, 8);
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
