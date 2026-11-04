// Geração procedural das masmorras, malhas, colisão, campo de fluxo e A*.
import * as THREE from 'three';
import { G, TILE } from './state.js';
import { ri, rr, pick, clamp, shuffle } from './utils.js';
import { L } from './i18n.js';

export const THEMES = [
  { name: L('Distrito Neon', 'Neon District'), a: 0x00f0ff, b: 0xff2bd6, floor: 0x2a2f4a, wall: 0x1a1d33, fog: 0x07061a, line: '#00f0ff' },
  { name: L('Esgotos Tóxicos', 'Toxic Sewers'), a: 0x39ff14, b: 0x9d4dff, floor: 0x24352c, wall: 0x16251d, fog: 0x040d08, line: '#39ff14' },
  { name: L('Fábrica Corporativa', 'Corporate Factory'), a: 0xff8a00, b: 0x2b8cff, floor: 0x3a3128, wall: 0x2a2118, fog: 0x0d0805, line: '#ff8a00' },
  { name: L('Núcleo de Dados', 'Data Core'), a: 0xff2244, b: 0x00f0ff, floor: 0x35202c, wall: 0x261420, fog: 0x0d040a, line: '#ff2244' },
];

export const BOSS_EVERY = 3;
export const isBossFloor = (f) => f % BOSS_EVERY === 0;

export function themeFor(floor) {
  return THEMES[Math.floor((floor - 1) / BOSS_EVERY) % THEMES.length];
}

// ------------------------------------------------------------------
// Geração
// ------------------------------------------------------------------
export function generateDungeon(floor) {
  const W = Math.min(46 + floor * 3, 92);
  const H = W;
  for (let attempt = 0; attempt < 20; attempt++) {
    const d = tryGenerate(floor, W, H);
    if (d) return d;
  }
  return tryGenerate(floor, W, H, true);
}

function tryGenerate(floor, W, H, force) {
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const target = Math.min(7 + Math.floor(floor / 2), 15);
  for (let t = 0; t < 600 && rooms.length < target; t++) {
    const w = ri(6, 12);
    const h = ri(6, 12);
    const x = ri(2, W - w - 3);
    const y = ri(2, H - h - 3);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y) {
        ok = false;
        break;
      }
    }
    if (ok) rooms.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
  }
  if (rooms.length < 5 && !force) return null;

  for (const r of rooms) for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) grid[j * W + i] = TILE.FLOOR;

  // Conecta as salas com uma árvore geradora mínima + alguns ciclos extras
  const connected = [rooms[0]];
  const remaining = rooms.slice(1);
  const edges = [];
  while (remaining.length) {
    let best = null;
    let bd = Infinity;
    let bi = -1;
    remaining.forEach((r, k) => {
      for (const c of connected) {
        const dd = (r.cx - c.cx) ** 2 + (r.cy - c.cy) ** 2;
        if (dd < bd) {
          bd = dd;
          best = [r, c];
          bi = k;
        }
      }
    });
    edges.push(best);
    connected.push(best[0]);
    remaining.splice(bi, 1);
  }
  for (let k = 0; k < Math.floor(rooms.length / 3); k++) {
    const a = pick(rooms);
    const b = pick(rooms);
    if (a !== b) edges.push([a, b]);
  }
  for (const [a, b] of edges) carveCorridor(grid, W, H, Math.floor(a.cx), Math.floor(a.cy), Math.floor(b.cx), Math.floor(b.cy));

  const d = { W, H, grid, rooms, floor };
  const start = rooms[0];
  d.start = { x: Math.floor(start.cx) + 0.5, z: Math.floor(start.cy) + 0.5 };

  // Sala de saída: a mais distante (em passos) do início
  const dist = bfs(d, Math.floor(d.start.x), Math.floor(d.start.z), 9999);
  let exitRoom = rooms[1];
  let bestD = -1;
  for (const r of rooms) {
    if (r === start) continue;
    const v = dist[Math.floor(r.cy) * W + Math.floor(r.cx)];
    if (v > bestD) {
      bestD = v;
      exitRoom = r;
    }
  }
  if (bestD < 10 && !force) return null;
  d.exitRoom = exitRoom;
  d.exit = { x: Math.floor(exitRoom.cx) + 0.5, z: Math.floor(exitRoom.cy) + 0.5 };

  // Pilares (obstáculos) em salas grandes
  for (const r of rooms) {
    if (r === start || r.w < 8 || r.h < 8) continue;
    const n = ri(1, 4);
    for (let k = 0; k < n * 4 && r.pillars !== n; k++) {
      const i = ri(r.x + 2, r.x + r.w - 3);
      const j = ri(r.y + 2, r.y + r.h - 3);
      if (Math.abs(i + 0.5 - d.exit.x) < 2.5 && Math.abs(j + 0.5 - d.exit.z) < 2.5) continue;
      if (Math.abs(i + 0.5 - r.cx) < 1.5 && Math.abs(j + 0.5 - r.cy) < 1.5) continue;
      let free = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[(j + dy) * W + i + dx] !== TILE.FLOOR) free = false;
      if (!free) continue;
      grid[j * W + i] = TILE.OBST;
      r.pillars = (r.pillars || 0) + 1;
    }
  }

  d.explored = new Uint8Array(W * H);
  d.flow = new Int16Array(W * H).fill(-1);
  return d;
}

function carveCorridor(grid, W, H, x1, y1, x2, y2) {
  const carve = (x, y) => {
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx > 1 && yy > 1 && xx < W - 2 && yy < H - 2) grid[yy * W + xx] = TILE.FLOOR;
      }
  };
  if (Math.random() < 0.5) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y1);
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x2, y);
  } else {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x1, y);
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y2);
  }
}

// ------------------------------------------------------------------
// Consultas de grade
// ------------------------------------------------------------------
export function tileAt(d, i, j) {
  if (i < 0 || j < 0 || i >= d.W || j >= d.H) return TILE.WALL;
  return d.grid[j * d.W + i];
}
export function isWalkable(d, x, z) {
  return tileAt(d, Math.floor(x), Math.floor(z)) === TILE.FLOOR;
}
export function isWalkableTile(d, i, j) {
  return tileAt(d, i, j) === TILE.FLOOR;
}

// Empurra um círculo para fora das paredes
export function resolveCircle(d, e) {
  const r = e.r;
  for (let pass = 0; pass < 2; pass++) {
    const i0 = Math.floor(e.x - r);
    const i1 = Math.floor(e.x + r);
    const j0 = Math.floor(e.z - r);
    const j1 = Math.floor(e.z + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (tileAt(d, i, j) === TILE.FLOOR) continue;
        const cx = clamp(e.x, i, i + 1);
        const cz = clamp(e.z, j, j + 1);
        const dx = e.x - cx;
        const dz = e.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const dd = Math.sqrt(d2);
            e.x += (dx / dd) * (r - dd);
            e.z += (dz / dd) * (r - dd);
          } else {
            // centro dentro do bloco: empurra pelo menor eixo
            const left = e.x - i;
            const right = i + 1 - e.x;
            const top = e.z - j;
            const bottom = j + 1 - e.z;
            const m = Math.min(left, right, top, bottom);
            if (m === left) e.x = i - r;
            else if (m === right) e.x = i + 1 + r;
            else if (m === top) e.z = j - r;
            else e.z = j + 1 + r;
          }
        }
      }
    }
  }
}

export function lineOfSight(d, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l = Math.hypot(dx, dz);
  const steps = Math.ceil(l / 0.3);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!isWalkable(d, x1 + dx * t, z1 + dz * t)) return false;
  }
  return true;
}

// BFS genérica a partir de um bloco (usada para fluxo e escolha da saída)
const DIRS8 = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4], [1, -1, 1.4], [-1, 1, 1.4], [-1, -1, 1.4],
];
function bfs(d, si, sj, maxSteps, out) {
  const { W, H } = d;
  const dist = out || new Int16Array(W * H);
  dist.fill(-1);
  if (!isWalkableTile(d, si, sj)) return dist;
  const q = new Int32Array(W * H);
  let h = 0;
  let t = 0;
  q[t++] = sj * W + si;
  dist[sj * W + si] = 0;
  while (h < t) {
    const c = q[h++];
    const ci = c % W;
    const cj = (c / W) | 0;
    const cd = dist[c];
    if (cd >= maxSteps) continue;
    for (let k = 0; k < 4; k++) {
      const ni = ci + DIRS8[k][0];
      const nj = cj + DIRS8[k][1];
      const n = nj * W + ni;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (dist[n] !== -1 || d.grid[n] !== TILE.FLOOR) continue;
      dist[n] = cd + 1;
      q[t++] = n;
    }
  }
  return dist;
}

export function computeFlow(d, x, z) {
  bfs(d, Math.floor(x), Math.floor(z), 40, d.flow);
}

// Direção para descer o campo de fluxo em direção ao jogador
export function flowDir(d, x, z) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const here = d.flow[j * d.W + i];
  if (here < 0) return null;
  let best = here;
  let bi = 0;
  let bj = 0;
  for (const [dx, dy] of DIRS8) {
    const ni = i + dx;
    const nj = j + dy;
    if (!isWalkableTile(d, ni, nj)) continue;
    if (dx && dy && (!isWalkableTile(d, i + dx, j) || !isWalkableTile(d, i, j + dy))) continue;
    const v = d.flow[nj * d.W + ni];
    if (v >= 0 && v < best) {
      best = v;
      bi = dx;
      bj = dy;
    }
  }
  if (bi === 0 && bj === 0) return null;
  const tx = i + bi + 0.5 - x;
  const tz = j + bj + 0.5 - z;
  const l = Math.hypot(tx, tz) || 1;
  return { x: tx / l, z: tz / l };
}

// A* com 8 direções, retorna pontos do mundo (com suavização por linha de visão)
export function findPath(d, sx, sz, tx, tz, maxNodes = 4000) {
  const { W } = d;
  let ti = Math.floor(tx);
  let tj = Math.floor(tz);
  if (!isWalkableTile(d, ti, tj)) {
    // procura o bloco livre mais próximo do destino
    let found = false;
    for (let r = 1; r < 4 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++)
        for (let dx = -r; dx <= r && !found; dx++)
          if (isWalkableTile(d, ti + dx, tj + dy)) {
            ti += dx;
            tj += dy;
            found = true;
          }
    }
    if (!found) return null;
    tx = ti + 0.5;
    tz = tj + 0.5;
  }
  const si = Math.floor(sx);
  const sj = Math.floor(sz);
  if (si === ti && sj === tj) return [{ x: tx, z: tz }];
  if (lineOfSight(d, sx, sz, tx, tz)) return [{ x: tx, z: tz }];

  const start = sj * W + si;
  const goal = tj * W + ti;
  const g = new Map([[start, 0]]);
  const came = new Map();
  const open = [{ n: start, f: 0 }];
  const closed = new Set();
  let nodes = 0;
  while (open.length && nodes < maxNodes) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const cur = open[bi].n;
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    nodes++;
    const ci = cur % W;
    const cj = (cur / W) | 0;
    for (const [dx, dy, c] of DIRS8) {
      const ni = ci + dx;
      const nj = cj + dy;
      if (!isWalkableTile(d, ni, nj)) continue;
      if (dx && dy && (!isWalkableTile(d, ci + dx, cj) || !isWalkableTile(d, ci, cj + dy))) continue;
      const n = nj * W + ni;
      const ng = g.get(cur) + c;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        const h = Math.hypot(ni - ti, nj - tj);
        open.push({ n, f: ng + h });
      }
    }
  }
  if (!came.has(goal)) return null;
  const raw = [];
  let c = goal;
  while (c !== start) {
    raw.push({ x: (c % W) + 0.5, z: ((c / W) | 0) + 0.5 });
    c = came.get(c);
  }
  raw.reverse();
  raw[raw.length - 1] = { x: tx, z: tz };
  // suavização
  const out = [];
  let ax = sx;
  let az = sz;
  let k = 0;
  while (k < raw.length) {
    let far = k;
    for (let m = raw.length - 1; m > k; m--) {
      if (lineOfSight(d, ax, az, raw[m].x, raw[m].z)) {
        far = m;
        break;
      }
    }
    out.push(raw[far]);
    ax = raw[far].x;
    az = raw[far].z;
    k = far + 1;
  }
  return out;
}

export function randomFloorInRoom(d, r, margin = 1) {
  for (let t = 0; t < 40; t++) {
    const i = ri(r.x + margin, r.x + r.w - 1 - margin);
    const j = ri(r.y + margin, r.y + r.h - 1 - margin);
    if (isWalkableTile(d, i, j)) return { x: i + rr(0.3, 0.7), z: j + rr(0.3, 0.7) };
  }
  return { x: r.cx, z: r.cy };
}

export function revealAround(d, x, z, radius) {
  const ci = Math.floor(x);
  const cj = Math.floor(z);
  const newly = [];
  for (let j = cj - radius; j <= cj + radius; j++) {
    for (let i = ci - radius; i <= ci + radius; i++) {
      if (i < 0 || j < 0 || i >= d.W || j >= d.H) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > radius * radius) continue;
      const k = j * d.W + i;
      if (!d.explored[k]) {
        d.explored[k] = 1;
        newly.push(k);
      }
    }
  }
  return newly;
}

// ------------------------------------------------------------------
// Malhas
// ------------------------------------------------------------------
const WALL_H = 1.7;
const LOW_H = 0.32;

function floorTexture(theme) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa0b8';
  g.fillRect(0, 0, 128, 128);
  // placas metálicas
  g.fillStyle = '#8a90a8';
  g.fillRect(4, 4, 58, 58);
  g.fillRect(66, 66, 58, 58);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 128);
  g.moveTo(0, 64);
  g.lineTo(128, 64);
  g.stroke();
  for (let k = 0; k < 140; k++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [x, y] of [[8, 8], [56, 8], [8, 56], [56, 56]]) {
    g.beginPath();
    g.arc(x, y, 2, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const SIGN_WORDS = ['NEON', 'BAR', '24H', 'HOTEL', 'RAMEN', 'ネオン', 'データ', 'CLINIC', 'ARCADE', 'SUSHI', 'CYBER', 'TECH', 'OPEN', '危険', 'ZONA 9', 'NO EXIT', 'メトロ', 'BIO', 'LAB'];

function signTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 96);
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = color;
  g.font = 'bold 54px Orbitron, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDungeonMeshes(d, theme) {
  const group = new THREE.Group();
  const { W, H, grid } = d;

  // --- piso ---
  const floorTiles = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (grid[j * W + i] !== TILE.WALL) floorTiles.push([i, j]);
  const floorGeo = new THREE.PlaneGeometry(1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTexture(theme), color: theme.floor });
  const floorMesh = new THREE.InstancedMesh(floorGeo, floorMat, floorTiles.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  floorTiles.forEach(([i, j], k) => {
    m4.makeTranslation(i + 0.5, 0, j + 0.5);
    floorMesh.setMatrixAt(k, m4);
    const v = rr(0.85, 1.1);
    col.setRGB(v, v, v);
    floorMesh.setColorAt(k, col);
  });
  group.add(floorMesh);

  // linhas de neon no chão dos corredores/salas (decoração)
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(0.55), transparent: true, opacity: 0.55, depthWrite: false });
  const lineGeo = new THREE.PlaneGeometry(1, 0.05);
  lineGeo.rotateX(-Math.PI / 2);
  const roomLines = [];
  for (const r of d.rooms) {
    const inset = 0.6;
    roomLines.push([r.x + inset, r.y + inset, r.x + r.w - inset, r.y + inset]);
    roomLines.push([r.x + inset, r.y + r.h - inset, r.x + r.w - inset, r.y + r.h - inset]);
    roomLines.push([r.x + inset, r.y + inset, r.x + inset, r.y + r.h - inset]);
    roomLines.push([r.x + r.w - inset, r.y + inset, r.x + r.w - inset, r.y + r.h - inset]);
  }
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, roomLines.length);
  roomLines.forEach(([x1, z1, x2, z2], k) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(-(z2 - z1), x2 - x1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    m4.compose(new THREE.Vector3((x1 + x2) / 2, 0.012, (z1 + z2) / 2), q, new THREE.Vector3(len, 1, 1));
    lines.setMatrixAt(k, m4);
  });
  group.add(lines);

  // --- paredes ---
  const walls = [];
  const isFloorish = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] !== TILE.WALL;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const t = grid[j * W + i];
      if (t === TILE.FLOOR) continue;
      if (t === TILE.OBST) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (isFloorish(i + dx, j + dy)) near = true;
      if (near) walls.push({ i, j, x: i + 0.5, z: j + 0.5, h: WALL_H, target: WALL_H, strips: [], signs: [] });
    }
  }
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallGeo.translate(0, 0.5, 0);
  const wallMat = new THREE.MeshLambertMaterial({ color: theme.wall });
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
  wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  walls.forEach((w, k) => {
    m4.makeScale(1, w.h, 1).setPosition(w.x, 0, w.z);
    wallMesh.setMatrixAt(k, m4);
    const v = rr(0.85, 1.15);
    col.setRGB(v, v, v);
    wallMesh.setColorAt(k, col);
  });
  group.add(wallMesh);

  // topo das paredes levemente iluminado
  const capGeo = new THREE.PlaneGeometry(1, 1);
  capGeo.rotateX(-Math.PI / 2);
  const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.wall).multiplyScalar(0.7) });
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, walls.length);
  capMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  walls.forEach((w, k) => {
    m4.makeTranslation(w.x, w.h + 0.001, w.z);
    capMesh.setMatrixAt(k, m4);
  });
  group.add(capMesh);

  // faixas de neon nas faces das paredes voltadas para o chão
  const strips = [];
  const faces = [
    [1, 0, Math.PI / 2],
    [-1, 0, Math.PI / 2],
    [0, 1, 0],
    [0, -1, 0],
  ];
  walls.forEach((w, wi) => {
    for (const [dx, dy, rot] of faces) {
      if (grid[(w.j + dy) * W + w.i + dx] === TILE.FLOOR || grid[(w.j + dy) * W + w.i + dx] === TILE.OBST) {
        if (!isFloorish(w.i + dx, w.j + dy)) continue;
        const useB = ((w.i * 7 + w.j * 13) % 11) === 0;
        strips.push({ wi, x: w.x + dx * 0.51, z: w.z + dy * 0.51, rot, color: useB ? theme.b : theme.a });
        w.strips.push(strips.length - 1);
      }
    }
  });
  const stripGeo = new THREE.BoxGeometry(1, 0.06, 0.03);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stripMesh = new THREE.InstancedMesh(stripGeo, stripMat, Math.max(1, strips.length));
  stripMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  strips.forEach((s, k) => {
    q.setFromAxisAngle(up, s.rot);
    m4.compose(new THREE.Vector3(s.x, WALL_H - 0.18, s.z), q, new THREE.Vector3(1, 1, 1));
    stripMesh.setMatrixAt(k, m4);
    col.set(s.color).multiplyScalar(2.2);
    stripMesh.setColorAt(k, col);
  });
  group.add(stripMesh);

  // letreiros de neon nas paredes do "fundo" (faces voltadas para a câmera)
  const signCount = Math.min(4 + d.rooms.length, 18);
  const candidates = shuffle(
    walls.filter((w) => isFloorish(w.i + 1, w.j) && grid[w.j * W + w.i + 1] === TILE.FLOOR && isFloorish(w.i + 1, w.j + 1) && isFloorish(w.i + 1, w.j - 1)).concat(
      walls.filter((w) => isFloorish(w.i, w.j + 1) && grid[(w.j + 1) * W + w.i] === TILE.FLOOR && isFloorish(w.i + 1, w.j + 1) && isFloorish(w.i - 1, w.j + 1))
    )
  );
  const usedSign = new Set();
  let placed = 0;
  for (const w of candidates) {
    if (placed >= signCount) break;
    const key = `${Math.floor(w.i / 4)},${Math.floor(w.j / 4)}`;
    if (usedSign.has(key)) continue;
    usedSign.add(key);
    const color = Math.random() < 0.5 ? theme.a : theme.b;
    const css = '#' + new THREE.Color(color).getHexString();
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(pick(SIGN_WORDS), css), transparent: true, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), mat);
    const faceX = isFloorish(w.i + 1, w.j) && grid[w.j * W + w.i + 1] === TILE.FLOOR;
    if (faceX) {
      sign.position.set(w.x + 0.52, 1.12, w.z);
      sign.rotation.y = Math.PI / 2;
    } else {
      sign.position.set(w.x, 1.12, w.z + 0.52);
    }
    group.add(sign);
    w.signs.push(sign);
    placed++;
  }

  // pilares
  const pillarGeo = new THREE.CylinderGeometry(0.38, 0.42, WALL_H, 8);
  pillarGeo.translate(0, WALL_H / 2, 0);
  const pillarMat = new THREE.MeshLambertMaterial({ color: theme.wall });
  const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 16);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.b).multiplyScalar(2.2) });
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      if (grid[j * W + i] === TILE.OBST) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(i + 0.5, 0, j + 0.5);
        group.add(p);
        for (const y of [0.35, 1.3]) {
          const rg = new THREE.Mesh(ringGeo, ringMat);
          rg.position.set(i + 0.5, y, j + 0.5);
          group.add(rg);
        }
      }

  // elevador de saída
  const exit = makeExitPad(theme);
  exit.group.position.set(d.exit.x, 0, d.exit.z);
  group.add(exit.group);

  // plataforma de início
  const startRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(1.5), transparent: true, opacity: 0.6, depthWrite: false }));
  startRing.rotation.x = -Math.PI / 2;
  startRing.position.set(d.start.x, 0.015, d.start.z);
  group.add(startRing);

  d.meshes = { wallMesh, capMesh, stripMesh, walls, strips, exit };
  return group;
}

function makeExitPad(theme) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.12, 32), new THREE.MeshLambertMaterial({ color: 0x20243a }));
  base.position.y = 0.06;
  group.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(2.4) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.13;
  group.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(1.2), transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 4, 24, 1, true), beamMat);
  beam.position.y = 2;
  group.add(beam);
  const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.a).multiplyScalar(2.4), wireframe: true }));
  holo.position.y = 1.4;
  group.add(holo);
  return { group, ring, ringMat, beam, beamMat, holo, theme };
}

// Abaixa as paredes que ficam entre a câmera e o jogador
export function updateWalls(d, px, pz, dt) {
  const M = d.meshes;
  if (!M) return;
  const m4 = new THREE.Matrix4();
  let changed = false;
  const k = Math.min(1, dt * 10);
  for (let wi = 0; wi < M.walls.length; wi++) {
    const w = M.walls[wi];
    const dx = w.x - px;
    const dz = w.z - pz;
    const along = (dx + dz) * Math.SQRT1_2;
    const side = Math.abs(dx - dz) * Math.SQRT1_2;
    const target = along > -0.2 && along < 6.5 && side < 3.2 + along * 0.25 ? LOW_H : WALL_H;
    if (Math.abs(w.h - target) < 0.005) {
      if (w.h !== target) w.h = target;
      else continue;
    } else {
      w.h += (target - w.h) * k;
    }
    changed = true;
    m4.makeScale(1, w.h, 1).setPosition(w.x, 0, w.z);
    M.wallMesh.setMatrixAt(wi, m4);
    m4.makeTranslation(w.x, w.h + 0.001, w.z);
    M.capMesh.setMatrixAt(wi, m4);
    for (const si of w.strips) {
      M.stripMesh.getMatrixAt(si, m4);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      m4.decompose(pos, q, s);
      pos.y = Math.min(WALL_H - 0.18, w.h - 0.06);
      m4.compose(pos, q, s);
      M.stripMesh.setMatrixAt(si, m4);
    }
    for (const sg of w.signs) sg.visible = w.h > 1.3;
  }
  if (changed) {
    M.wallMesh.instanceMatrix.needsUpdate = true;
    M.capMesh.instanceMatrix.needsUpdate = true;
    M.stripMesh.instanceMatrix.needsUpdate = true;
  }
}
