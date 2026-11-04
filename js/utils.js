import { LANG } from './i18n.js';
export const rr = (a, b) => a + Math.random() * (b - a);
export const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const chance = (p) => Math.random() < p;
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function weightedPick(list, w) {
  let total = 0;
  for (const x of list) total += w(x);
  let r = Math.random() * total;
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
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const fmt = (n) => Math.round(n).toLocaleString(LANG === 'pt' ? 'pt-BR' : 'en-US');

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
