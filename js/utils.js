import { LANG } from './i18n.js';
// sorteio da lógica do jogo: normalmente o Math.random, mas com semente enquanto um andar é montado
// (o visual e o Three.js continuam no Math.random, então caches e texturas não mudam a sequência)
let rng = Math.random;
export const rnd = () => rng();
export const rr = (a, b) => a + rng() * (b - a);
export const ri = (a, b) => Math.floor(a + rng() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const chance = (p) => rng() < p;
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// tempo de jogo: "2h 05min" ou "45min"
export function fmtPlay(sec) {
  if ((sec || 0) < 60) return '<1min';
  const m = Math.floor((sec || 0) / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}min` : `${m}min`;
}

export function weightedPick(list, w) {
  let total = 0;
  for (const x of list) total += w(x);
  let r = rng() * total;
  for (const x of list) {
    r -= w(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const fmt = (n) => Math.round(n).toLocaleString(LANG === 'pt' ? 'pt-BR' : 'en-US');

// número curto para os números de dano/cura: 950, 1,2K, 15K, 30M, 66B, 4T
const SHORT = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
export function short(n) {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  for (const [v, s] of SHORT) {
    if (a < v) continue;
    const x = n / v;
    // até 10 mostra uma casa (1,5K); acima, só o inteiro (15K)
    let t = Math.abs(x) < 10 ? (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(x));
    if (LANG === 'pt') t = t.replace('.', ',');
    return t + s;
  }
}

// Converte um vetor de tela (x = direita, y = cima) para o plano do mundo,
// considerando a câmera isométrica posicionada em +x/+z olhando para -x/-z.
const S = Math.SQRT1_2;
export function screenToWorld(mx, my) {
  return { x: (mx - my) * S, z: (-mx - my) * S };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------
// Sorteio com semente: o andar é montado com uma semente, então dá para refazer
// o mesmo andar ao continuar o jogo (o que mudou nele fica salvo à parte)
// ------------------------------------------------------------------
let seedState = 0;
function seededRandom() {
  // mulberry32
  let t = (seedState = (seedState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const newSeed = () => (Math.random() * 2147483647) | 0;
// liga a semente (null volta ao sorteio normal)
export function seedRandom(seed) {
  if (seed == null) {
    rng = Math.random;
    return;
  }
  seedState = seed | 0;
  rng = seededRandom;
}
// roda fn sem gastar a sequência da semente (o que vem depois sai igual, não importa quanto fn sorteou)
export function isolateRandom(fn) {
  if (rng !== seededRandom) return fn();
  const s = seedState;
  try {
    return fn();
  } finally {
    seedState = s;
  }
}
