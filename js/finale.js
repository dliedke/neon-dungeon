// Final verdadeiro: cinemática em canvas 2D depois de vencer o Inferno (último modo)
// Cenas: o último servidor (LED vermelho destruído) → subida pelos 90 andares → amanhecer com fogos → créditos.
import { G } from './state.js';
import { CLASSES, CLASS_ORDER, ICONS } from './classes.js';
import { THEMES, themeFor } from './dungeon.js';
import { ETYPES, BOSS_ORDER } from './enemies.js';
import { TIERS } from './run.js';
import { achList } from './ach.js';
import { sfx, playAnthem } from './audio.js';
import { fmt, fmtPlay } from './utils.js';
import { L } from './i18n.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (a, b, v) => { const x = cl((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const mix = (c1, c2, k) => {
  const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * k);
  const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * k);
  const b = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * k);
  return `rgb(${r},${g},${b})`;
};
// ruído determinístico (sem Math.random dentro do quadro)
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// linha do tempo (segundos)
const T_ELEV = 7.5; // começa a subida
const T_DAWN = 15; // amanhecer
const T_CRED = 29; // créditos
const SLASH = 4.3; // o golpe no LED
const CRED_DUR = 23; // tempo dos créditos subindo
const T_THANKS = T_CRED + CRED_DUR; // "obrigado por jogar"
const T_END = T_THANKS + 5.5;

const FW_MAX = 1400; // partículas dos fogos (pool fixo, sem alocar por quadro)
const RK_MAX = 24; // foguetes subindo

let cv = null, cx = null, W = 0, H = 0, S = 0, DPR = 1;
let raf = 0, t0 = 0, resolveFn = null, skipShown = false, lastT = 0, fwNext = 0, fwSeed = 0;
let hero = null, heroImg = null, palette = [], credits = [], sky = null, stars = null;
let sounds = {};
const P = { x: new Float32Array(FW_MAX), y: new Float32Array(FW_MAX), vx: new Float32Array(FW_MAX), vy: new Float32Array(FW_MAX), life: new Float32Array(FW_MAX), max: new Float32Array(FW_MAX), c: new Uint8Array(FW_MAX), n: 0 };
const R = { x: new Float32Array(RK_MAX), y: new Float32Array(RK_MAX), vy: new Float32Array(RK_MAX), ty: new Float32Array(RK_MAX), c: new Uint8Array(RK_MAX), on: new Uint8Array(RK_MAX) };
const shards = []; // estilhaços do LED (criados uma vez)

export function finaleOn() {
  return !!raf;
}

// toca a cinemática; a Promise resolve quando ela acaba (ou é pulada)
export function playFinale() {
  return new Promise((resolve) => {
    resolveFn = resolve;
    cv = $('finale-cv');
    cx = cv.getContext('2d');
    const c = G.char;
    const C = CLASSES[c.cls];
    hero = { c, C, col: C.css };
    heroImg = new Image();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="${C.css}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[C.skills[0].icon] || ''}</svg>`;
    heroImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    // cores dos fogos: guardiões + herói + dourado
    palette = [...BOSS_ORDER.map((k) => hex(ETYPES[k].blood)), C.css, C.css, '#ffd23d', '#ffffff'];
    buildCredits();
    onResize();
    window.addEventListener('resize', onResize);
    P.n = 0;
    R.on.fill(0);
    shards.length = 0;
    for (let i = 0; i < 46; i++) shards.push({ a: hash(i) * Math.PI * 2, v: 0.25 + hash(i + 50) * 0.9, s: 0.006 + hash(i + 99) * 0.014, r: hash(i + 7) * 6 });
    sounds = {};
    skipShown = false;
    fwNext = T_DAWN + 2.6;
    fwSeed = 1;
    $('finale').classList.remove('hidden');
    $('finale-skip').classList.add('hidden');
    G.mode = 'finale';
    playAnthem(true);
    t0 = performance.now();
    lastT = 0;
    raf = requestAnimationFrame(frame);
  });
}

export function closeFinale() {
  $('finale').classList.add('hidden');
}

export function skipFinale() {
  if (!raf) return;
  stop();
}

// para a animação, mas deixa o último quadro na tela até closeFinale (sem piscar o jogo por trás)
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', onResize);
  $('finale-skip').classList.add('hidden');
  const r = resolveFn;
  resolveFn = null;
  if (r) r();
}

function onResize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  S = Math.min(W, H);
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildSky();
}

// toca um som só uma vez na linha do tempo
function once(key, t, at, fn) {
  if (t >= at && !sounds[key]) {
    sounds[key] = 1;
    if (t - at < 0.5) fn();
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const t = (now - t0) / 1000;
  const dt = Math.min(0.05, Math.max(0, t - lastT));
  lastT = t;
  if (!skipShown && t > 1.5) {
    skipShown = true;
    $('finale-skip').classList.remove('hidden');
  }
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.globalAlpha = 1;
  cx.globalCompositeOperation = 'source-over';
  if (t < T_ELEV) sceneServer(t);
  else if (t < T_DAWN) sceneElevator(t);
  else sceneDawn(t, dt);
  if (t >= T_END) stop();
}

// ------------------------------------------------------------------
// Texto
// ------------------------------------------------------------------
function typed(str, t, at, cps = 34) {
  if (t < at) return '';
  return str.slice(0, Math.floor((t - at) * cps));
}

function caption(str, y, alpha = 1, size = 0.05, color = '#e8ecff') {
  if (!str || alpha <= 0) return;
  cx.globalAlpha = alpha;
  cx.font = `600 ${Math.round(S * size)}px Rajdhani, system-ui, sans-serif`;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillStyle = color;
  outline(S * size * 0.16);
  cx.strokeText(str, W / 2, y, W * 0.92);
  cx.shadowColor = 'rgba(0,0,0,0.9)';
  cx.shadowBlur = 8;
  cx.fillText(str, W / 2, y, W * 0.92);
  cx.shadowBlur = 0;
  cx.globalAlpha = 1;
}

// contorno escuro para o texto ler bem por cima dos fogos
function outline(w) {
  cx.lineWidth = Math.max(2, w);
  cx.lineJoin = 'round';
  cx.strokeStyle = 'rgba(6,2,16,0.85)';
}

function letterbox(k) {
  if (k <= 0) return;
  const h = H * 0.1 * k;
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, W, h);
  cx.fillRect(0, H - h, W, h);
}

// ------------------------------------------------------------------
// Cena 1: o último servidor
// ------------------------------------------------------------------
function drawRack(x, y, w, h, seed, t, ledOn) {
  cx.fillStyle = '#0a0d1a';
  cx.fillRect(x, y, w, h);
  cx.strokeStyle = '#1f2a48';
  cx.lineWidth = 2;
  cx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  const rows = 14;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const ry = y + r * rh;
    cx.fillStyle = r % 2 ? '#0e1324' : '#111830';
    cx.fillRect(x + w * 0.06, ry + rh * 0.15, w * 0.88, rh * 0.7);
    // LEDs pequenos piscando
    for (let k = 0; k < 4; k++) {
      const hsh = hash(seed * 31 + r * 7 + k);
      const on = ledOn && Math.sin(t * (2 + hsh * 9) + hsh * 20) > 0.2;
      cx.fillStyle = on ? (hsh > 0.7 ? '#00f0ff' : '#39ff14') : '#14202a';
      cx.fillRect(x + w * (0.12 + k * 0.06), ry + rh * 0.42, Math.max(2, w * 0.025), Math.max(2, rh * 0.16));
    }
  }
}

function sceneServer(t) {
  const shake = t > SLASH + 0.12 ? Math.max(0, 1 - (t - SLASH - 0.12) / 0.9) : 0;
  cx.fillStyle = '#020108';
  cx.fillRect(0, 0, W, H);
  // halo vermelho no chão da sala
  const lx = W / 2, ly = H * 0.47;
  const before = t < SLASH + 0.15;
  const pulse = before ? 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (3 + t * 1.6)), 2) * sm(0.3, 2.2, t) : 0;
  cx.save();
  if (shake) cx.translate((hash(t * 60) - 0.5) * S * 0.05 * shake, (hash(t * 60 + 9) - 0.5) * S * 0.05 * shake);
  if (pulse > 0) {
    const g = cx.createRadialGradient(lx, ly, 0, lx, ly, S * 0.9);
    g.addColorStop(0, `rgba(255,34,68,${0.32 * pulse})`);
    g.addColorStop(1, 'rgba(255,34,68,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);
  }
  // racks laterais (em perspectiva simples: menores e mais escuros)
  const rw = S * 0.34, rh = S * 0.92;
  const top = H / 2 - rh / 2;
  cx.globalAlpha = 0.55;
  for (let i = 1; i <= 3; i++) {
    const k = 1 - i * 0.18;
    const w2 = rw * k, h2 = rh * k;
    const off = i * rw * 0.92;
    drawRack(W / 2 - off - w2 / 2, H / 2 - h2 / 2, w2, h2, i, t, t < SLASH + 0.2);
    drawRack(W / 2 + off - w2 / 2, H / 2 - h2 / 2, w2, h2, i + 10, t, t < SLASH + 0.2);
  }
  cx.globalAlpha = 1;
  // o rack central, cortado em dois depois do golpe
  const sep = t > SLASH + 0.12 ? ease(cl((t - SLASH - 0.12) / 1.2)) * S * 0.07 : 0;
  const dx = 1, dy = -0.55; // direção do corte
  const far = W + H;
  const half = (sign) => {
    cx.save();
    // a metade de cima vai para cima/esquerda, a de baixo para baixo/direita (o recorte vai junto)
    cx.translate(sign * dy * sep * 0.6, -sign * dx * sep * 0.6);
    if (sign) {
      cx.beginPath();
      cx.moveTo(lx - dx * far, ly - dy * far);
      cx.lineTo(lx + dx * far, ly + dy * far);
      cx.lineTo(lx + dx * far + sign * dy * far, ly + dy * far - sign * dx * far);
      cx.lineTo(lx - dx * far + sign * dy * far, ly - dy * far - sign * dx * far);
      cx.closePath();
      cx.clip();
    }
    drawRack(W / 2 - rw / 2, top, rw, rh, 99, t, t < SLASH + 0.2);
    // o LED vermelho
    const on = before ? pulse : 0;
    cx.fillStyle = on > 0 ? `rgb(${Math.round(90 + 165 * on)},${Math.round(20 + 14 * on)},${Math.round(30 + 38 * on)})` : '#2a1216';
    cx.beginPath();
    cx.arc(lx, ly, S * 0.022, 0, Math.PI * 2);
    cx.fill();
    if (on > 0) {
      cx.globalCompositeOperation = 'lighter';
      const g = cx.createRadialGradient(lx, ly, 0, lx, ly, S * 0.12);
      g.addColorStop(0, `rgba(255,60,90,${0.9 * on})`);
      g.addColorStop(1, 'rgba(255,34,68,0)');
      cx.fillStyle = g;
      cx.fillRect(lx - S * 0.12, ly - S * 0.12, S * 0.24, S * 0.24);
      cx.globalCompositeOperation = 'source-over';
    }
    cx.restore();
  };
  if (t < SLASH + 0.12) half(0); // ainda inteiro (sem emenda no meio do LED)
  else {
    half(1);
    half(-1);
  }
  // o golpe do herói atravessando o LED
  if (t > SLASH - 0.05 && t < SLASH + 0.7) {
    const k = cl((t - SLASH + 0.05) / 0.18);
    const fade = 1 - cl((t - SLASH - 0.15) / 0.55);
    const len = far * 0.6;
    const x1 = lx - dx * len, y1 = ly - dy * len;
    cx.globalCompositeOperation = 'lighter';
    cx.strokeStyle = hero.col;
    cx.lineCap = 'round';
    cx.shadowColor = hero.col;
    cx.shadowBlur = 30;
    cx.globalAlpha = fade;
    cx.lineWidth = S * 0.035 * fade + 2;
    cx.beginPath();
    cx.moveTo(x1, y1);
    cx.lineTo(x1 + dx * len * 2 * k, y1 + dy * len * 2 * k);
    cx.stroke();
    cx.strokeStyle = '#fff';
    cx.lineWidth = S * 0.01 * fade + 1;
    cx.stroke();
    cx.shadowBlur = 0;
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
  }
  // estilhaços vermelhos
  if (t > SLASH + 0.12) {
    const u = t - SLASH - 0.12;
    cx.globalCompositeOperation = 'lighter';
    for (const s of shards) {
      const a = 1 - u / (1.2 + s.v);
      if (a <= 0) continue;
      const px = lx + Math.cos(s.a) * s.v * S * 0.6 * u;
      const py = ly + Math.sin(s.a) * s.v * S * 0.6 * u + S * 0.35 * u * u;
      cx.globalAlpha = a;
      cx.fillStyle = s.r > 3 ? '#ff4466' : '#ffd0d8';
      const z = S * s.s;
      cx.fillRect(px - z / 2, py - z / 2, z, z);
    }
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
  }
  cx.restore();
  // fatias de glitch logo depois do golpe
  if (t > SLASH + 0.1 && t < SLASH + 0.9) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const hh = hash(Math.floor(t * 24) * 13 + i);
      cx.globalAlpha = 0.25 + hh * 0.3;
      cx.fillStyle = i % 2 ? '#ff2bd6' : '#00f0ff';
      cx.fillRect((hh - 0.5) * W * 0.2, hash(i * 3 + Math.floor(t * 24)) * H, W, S * (0.004 + hh * 0.02));
    }
    cx.globalAlpha = 1;
  }
  // clarão branco
  if (t > SLASH + 0.1) {
    const f = 1 - cl((t - SLASH - 0.1) / 0.6);
    if (f > 0) {
      cx.fillStyle = `rgba(255,255,255,${f * 0.9})`;
      cx.fillRect(0, 0, W, H);
    }
  }
  letterbox(1);
  // legendas
  const cy = H * 0.85;
  if (t < SLASH + 0.2) {
    const a = 1 - sm(SLASH - 0.4, SLASH, t);
    caption(typed(L('Muito abaixo da cidade, no último servidor…', 'Far beneath the city, in the very last server…'), t, 0.8), cy - S * 0.035, a);
    caption(typed(L('um LED vermelho tenta acender de novo.', 'a red LED tries to blink back on.'), t, 2.4), cy + S * 0.035, a, 0.05, '#ff6680');
  } else {
    caption(typed(L('…e se apaga. Para sempre.', '…and goes dark. Forever.'), t, SLASH + 0.9, 24), cy, 1 - sm(6.9, 7.4, t));
  }
  // fim da cena: escurece
  const fo = sm(6.8, 7.5, t);
  if (fo > 0) {
    cx.fillStyle = `rgba(0,0,0,${fo})`;
    cx.fillRect(0, 0, W, H);
  }
  once('slash', t, SLASH, () => sfx.slash());
  once('boom', t, SLASH + 0.12, () => sfx.explode());
}

// ------------------------------------------------------------------
// Cena 2: a subida pelos 90 andares
// ------------------------------------------------------------------
const TIER_COL = [0x00f0ff, 0xff4466, 0xff7a1a];

function sceneElevator(t) {
  const u = t - T_ELEV;
  const D = T_DAWN - T_ELEV;
  const p = ease(cl((u - 0.3) / (D - 1.1)));
  const pos = p * 90; // andares já subidos
  const depth = Math.max(0, 90 - Math.floor(pos)); // 90 = fundo do Inferno
  const tierI = depth > 60 ? 2 : depth > 30 ? 1 : 0;
  const local = depth ? ((depth - 1) % 30) + 1 : 0;
  const th = depth ? themeFor(local) : null;
  const vel = speedAt(u, D);
  // fundo com a cor do modo atual, clareando perto da superfície
  const base = TIER_COL[tierI];
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix(0x020108, base, 0.08));
  g.addColorStop(1, mix(0x020108, base, 0.24));
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, H);
  // perto da superfície, a luz dourada do dia entra por cima
  const sun = sm(0.86, 1, p);
  if (sun > 0) {
    const sg = cx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, `rgba(255,200,120,${0.7 * sun})`);
    sg.addColorStop(1, 'rgba(255,120,80,0)');
    cx.fillStyle = sg;
    cx.fillRect(0, 0, W, H);
  }
  // riscos de velocidade
  cx.globalCompositeOperation = 'lighter';
  const sc = th ? hex(th.a) : '#ffd23d';
  cx.strokeStyle = sc;
  cx.lineWidth = Math.max(1, S * 0.004);
  for (let i = 0; i < 46; i++) {
    const hx = hash(i * 5.3);
    const len = S * (0.05 + vel * 0.08) * (0.4 + hash(i * 2.1));
    const yy = ((hash(i * 9.7) * (H + len) + u * (200 + vel * S * 2.4) * (0.5 + hx)) % (H + len)) - len;
    cx.globalAlpha = 0.12 + 0.35 * cl(vel / 3) * hash(i);
    cx.beginPath();
    cx.moveTo(hx * W, yy);
    cx.lineTo(hx * W, yy + len);
    cx.stroke();
  }
  cx.globalAlpha = 1;
  // as linhas dos andares passando (descem porque estamos subindo)
  const gap = H * 0.42;
  const frac = pos - Math.floor(pos);
  for (let k = -1; k <= 3; k++) {
    const fl = 90 - Math.floor(pos) - k; // profundidade dessa laje
    if (fl < 0 || fl > 90) continue;
    const y = H * 0.5 + frac * gap - k * gap;
    if (y < -20 || y > H + 20) continue;
    const ft = fl ? themeFor(((fl - 1) % 30) + 1) : null;
    const col = ft ? hex(ft.a) : '#ffd23d';
    cx.strokeStyle = col;
    cx.shadowColor = col;
    cx.shadowBlur = 16;
    cx.lineWidth = Math.max(2, S * 0.008);
    cx.globalAlpha = 0.85;
    cx.beginPath();
    cx.moveTo(0, y);
    cx.lineTo(W, y);
    cx.stroke();
    cx.shadowBlur = 0;
    cx.globalAlpha = 0.6;
    cx.fillStyle = col;
    cx.font = `700 ${Math.round(S * 0.032)}px Orbitron, sans-serif`;
    cx.textAlign = 'left';
    cx.textBaseline = 'bottom';
    cx.fillText(fl ? `-${fl}` : '0', W * 0.04, y - 6);
  }
  cx.globalAlpha = 1;
  cx.globalCompositeOperation = 'source-over';
  // poço do elevador
  const cw = S * 0.42, chh = S * 0.56;
  const shk = vel * S * 0.0025;
  const ex = W / 2 + (hash(u * 40) - 0.5) * shk, ey = H * 0.5 + (hash(u * 40 + 3) - 0.5) * shk;
  cx.strokeStyle = 'rgba(160,180,255,0.18)';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(ex - cw * 0.62, 0);
  cx.lineTo(ex - cw * 0.62, H);
  cx.moveTo(ex + cw * 0.62, 0);
  cx.lineTo(ex + cw * 0.62, H);
  cx.stroke();
  // a cabine com o emblema do herói
  cx.fillStyle = 'rgba(6,8,20,0.88)';
  cx.fillRect(ex - cw / 2, ey - chh / 2, cw, chh);
  cx.strokeStyle = hero.col;
  cx.shadowColor = hero.col;
  cx.shadowBlur = 22;
  cx.lineWidth = Math.max(2, S * 0.007);
  cx.strokeRect(ex - cw / 2, ey - chh / 2, cw, chh);
  cx.shadowBlur = 0;
  // cabos
  cx.strokeStyle = 'rgba(200,210,255,0.35)';
  cx.lineWidth = 2;
  cx.beginPath();
  cx.moveTo(ex - cw * 0.15, 0);
  cx.lineTo(ex - cw * 0.15, ey - chh / 2);
  cx.moveTo(ex + cw * 0.15, 0);
  cx.lineTo(ex + cw * 0.15, ey - chh / 2);
  cx.stroke();
  const iz = cw * 0.52;
  if (heroImg.complete && heroImg.naturalWidth) {
    cx.globalCompositeOperation = 'lighter';
    cx.shadowColor = hero.col;
    cx.shadowBlur = 18;
    cx.drawImage(heroImg, ex - iz / 2, ey - iz / 2 - chh * 0.06, iz, iz);
    cx.shadowBlur = 0;
    cx.globalCompositeOperation = 'source-over';
  }
  // contador de andar
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.font = `900 ${Math.round(S * 0.05)}px Orbitron, sans-serif`;
  cx.fillStyle = '#fff';
  cx.shadowColor = depth ? hex(TIER_COL[tierI]) : '#ffd23d';
  cx.shadowBlur = 14;
  cx.fillText(depth ? `${L('ANDAR', 'FLOOR')} -${depth}` : L('SUPERFÍCIE', 'SURFACE'), ex, ey + chh * 0.36, cw * 0.95);
  cx.shadowBlur = 0;
  // painel lateral: modo e bioma
  const px = W - S * 0.06;
  cx.textAlign = 'right';
  if (depth) {
    const T = TIERS[tierI];
    cx.font = `900 ${Math.round(S * 0.045)}px Orbitron, sans-serif`;
    cx.fillStyle = T.css;
    cx.shadowColor = T.css;
    cx.shadowBlur = 12;
    cx.fillText(`${T.icon ? T.icon + ' ' : ''}${T.name.toUpperCase()}`, px, H * 0.2);
    cx.shadowBlur = 0;
    cx.font = `600 ${Math.round(S * 0.04)}px Rajdhani, system-ui, sans-serif`;
    cx.fillStyle = hex(th.a);
    cx.fillText(th.name, px, H * 0.2 + S * 0.06);
    cx.fillStyle = 'rgba(232,236,255,0.7)';
    cx.fillText(`${L('Andar', 'Floor')} ${local}/30`, px, H * 0.2 + S * 0.11);
  }
  letterbox(1);
  caption(typed(L('Noventa andares. Três descidas. Uma lenda.', 'Ninety floors. Three descents. One legend.'), t, T_ELEV + 1.4, 26), H * 0.85, 1 - sm(T_DAWN - 0.8, T_DAWN - 0.3, t));
  // clarão dourado chegando à superfície
  const fl = sm(T_DAWN - 0.9, T_DAWN, t);
  if (fl > 0) {
    cx.fillStyle = `rgba(255,236,200,${fl})`;
    cx.fillRect(0, 0, W, H);
  }
  // entrada da cena vindo do preto
  const fi = 1 - sm(T_ELEV, T_ELEV + 0.6, t);
  if (fi > 0) {
    cx.fillStyle = `rgba(0,0,0,${fi})`;
    cx.fillRect(0, 0, W, H);
  }
  once('lift', t, T_ELEV + 0.2, () => sfx.elevator());
  once('lift2', t, T_DAWN - 1.2, () => sfx.elevator());
}

// velocidade relativa da subida (0..~3), derivada numérica da curva
function speedAt(u, D) {
  const a = ease(cl((u - 0.3) / (D - 1.1)));
  const b = ease(cl((u - 0.3 + 0.05) / (D - 1.1)));
  return ((b - a) / 0.05) * (D - 1.1) * 1.2;
}

// ------------------------------------------------------------------
// Cena 3 e 4: amanhecer, fogos e créditos
// ------------------------------------------------------------------
function buildSky() {
  // horizonte de prédios em 3 camadas (gerado uma vez por tamanho de tela)
  const hz = H * 0.86;
  const layers = [];
  const wcol = ['#ff2bd6', '#00f0ff', '#ffd23d', '#b36bff', '#ff8a00'];
  let seed = 1;
  const rnd = () => hash(seed++ * 1.37);
  const specs = [
    { hmin: 0.1, hmax: 0.26, wmin: 0.03, wmax: 0.07, col: '#2a1145', win: 0.05 },
    { hmin: 0.14, hmax: 0.36, wmin: 0.04, wmax: 0.09, col: '#170828', win: 0.1 },
    { hmin: 0.08, hmax: 0.3, wmin: 0.05, wmax: 0.12, col: '#08030f', win: 0.16 },
  ];
  for (const sp of specs) {
    const b = [];
    let x = -W * 0.02;
    while (x < W) {
      const w = W * (sp.wmin + rnd() * (sp.wmax - sp.wmin));
      const h = H * (sp.hmin + rnd() * (sp.hmax - sp.hmin));
      const wins = [];
      const cols = Math.max(1, Math.floor(w / (S * 0.022)));
      const rows = Math.max(1, Math.floor(h / (S * 0.03)));
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (rnd() < sp.win) wins.push(x + (k + 0.3) * (w / cols), hz - h + (r + 0.35) * (h / rows), Math.floor(rnd() * wcol.length));
      b.push({ x, w, h, wins, ant: rnd() < 0.3 });
      x += w + W * 0.004;
    }
    layers.push({ b, col: sp.col });
  }
  sky = { hz, layers, wcol };
  stars = [];
  for (let i = 0; i < 140; i++) stars.push(hash(i * 3.1) * W, hash(i * 7.7) * H * 0.75, 0.5 + hash(i * 1.9) * 1.6, hash(i * 4.4) * 6);
}

function launch() {
  // procura um foguete livre
  for (let i = 0; i < RK_MAX; i++) {
    if (R.on[i]) continue;
    const h = hash(fwSeed++ * 2.31);
    R.on[i] = 1;
    R.x[i] = W * (0.1 + h * 0.8);
    R.y[i] = H;
    R.vy[i] = -H * (0.9 + hash(fwSeed * 1.7) * 0.5);
    R.ty[i] = H * (0.12 + hash(fwSeed * 3.3) * 0.35);
    R.c[i] = Math.floor(hash(fwSeed * 5.9) * palette.length);
    return;
  }
}

function burstAt(x, y, c) {
  const n = 70;
  const big = S * (0.32 + hash(fwSeed * 8.1) * 0.25);
  const ring = hash(fwSeed * 4.2) < 0.35; // às vezes um anel perfeito
  for (let k = 0; k < n; k++) {
    if (P.n >= FW_MAX) return;
    const i = P.n++;
    const a = (k / n) * Math.PI * 2 + hash(k + fwSeed) * 0.2;
    const sp = big * (ring ? 1 : 0.25 + hash(k * 3.3 + fwSeed) * 0.8);
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = Math.cos(a) * sp;
    P.vy[i] = Math.sin(a) * sp;
    P.max[i] = P.life[i] = 1.3 + hash(k * 1.1 + fwSeed) * 0.9;
    P.c[i] = hash(k * 7 + fwSeed) < 0.15 ? palette.length - 1 : c; // umas faíscas brancas
  }
}

function updateFireworks(dt, rate) {
  // lança novos
  if (rate > 0 && lastT >= fwNext) {
    launch();
    if (hash(fwSeed * 6.6) < 0.35) launch();
    fwNext = lastT + (0.25 + hash(fwSeed * 9.1) * 0.5) / rate;
  }
  cx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < RK_MAX; i++) {
    if (!R.on[i]) continue;
    R.y[i] += R.vy[i] * dt;
    cx.globalAlpha = 0.9;
    cx.fillStyle = palette[R.c[i]];
    cx.fillRect(R.x[i] - 1.5, R.y[i], 3, S * 0.05);
    if (R.y[i] <= R.ty[i]) {
      R.on[i] = 0;
      burstAt(R.x[i], R.y[i], R.c[i]);
    }
  }
  const drag = Math.pow(0.35, dt);
  const grav = S * 0.25 * dt;
  let j = 0;
  for (let i = 0; i < P.n; i++) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) continue;
    P.vx[i] *= drag;
    P.vy[i] = P.vy[i] * drag + grav;
    P.x[i] += P.vx[i] * dt;
    P.y[i] += P.vy[i] * dt;
    const a = P.life[i] / P.max[i];
    cx.globalAlpha = a > 0.3 ? 1 : a / 0.3;
    cx.fillStyle = palette[P.c[i]];
    const z = Math.max(1.5, S * 0.006 * (0.5 + a));
    cx.fillRect(P.x[i] - z / 2, P.y[i] - z / 2, z, z);
    // compacta o pool sem alocar
    if (j !== i) {
      P.x[j] = P.x[i]; P.y[j] = P.y[i]; P.vx[j] = P.vx[i]; P.vy[j] = P.vy[i];
      P.life[j] = P.life[i]; P.max[j] = P.max[i]; P.c[j] = P.c[i];
    }
    j++;
  }
  P.n = j;
  cx.globalAlpha = 1;
  cx.globalCompositeOperation = 'source-over';
}

function sceneDawn(t, dt) {
  const u = t - T_DAWN;
  const k = sm(0, 9, u); // quanto o sol já nasceu
  const hz = sky.hz;
  // céu
  const g = cx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, mix(0x04020e, 0x1d0b40, k));
  g.addColorStop(0.55, mix(0x0c0424, 0x7a1f6e, k));
  g.addColorStop(1, mix(0x1a0626, 0xffa040, k));
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, hz);
  // estrelas sumindo
  const sa = 1 - sm(1, 8, u);
  if (sa > 0) {
    cx.fillStyle = '#fff';
    for (let i = 0; i < stars.length; i += 4) {
      cx.globalAlpha = sa * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + stars[i + 3])));
      cx.fillRect(stars[i], stars[i + 1], stars[i + 2], stars[i + 2]);
    }
    cx.globalAlpha = 1;
  }
  // sol synthwave nascendo
  const sr = S * 0.3;
  const sy = hz + sr * 0.2 - k * sr * 0.95;
  cx.globalCompositeOperation = 'lighter';
  const gl = cx.createRadialGradient(W / 2, sy, sr * 0.5, W / 2, sy, sr * 2.6);
  gl.addColorStop(0, `rgba(255,120,80,${0.45 * (0.3 + k)})`);
  gl.addColorStop(1, 'rgba(255,60,120,0)');
  cx.fillStyle = gl;
  cx.fillRect(0, 0, W, hz);
  cx.globalCompositeOperation = 'source-over';
  const sg = cx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sg.addColorStop(0, '#fff3a0');
  sg.addColorStop(0.5, '#ffb347');
  sg.addColorStop(1, '#ff2bd6');
  cx.fillStyle = sg;
  cx.beginPath();
  cx.arc(W / 2, sy, sr, 0, Math.PI * 2);
  cx.fill();
  // faixas do sol (pintadas com o próprio degradê do céu)
  cx.fillStyle = g;
  for (let i = 0; i < 7; i++) {
    const yy = sy + sr * (0.05 + i * 0.14) - ((u * sr * 0.05) % (sr * 0.14));
    const hh = sr * (0.02 + i * 0.012);
    if (yy > hz) break;
    cx.fillRect(W / 2 - sr - 2, yy, sr * 2 + 4, Math.min(hh, hz - yy));
  }
  // fogos atrás dos prédios (bem mais durante o título; mais calmos nos créditos)
  const rate = t < T_CRED ? 1.6 : t < T_THANKS ? 0.8 : 1.8;
  updateFireworks(dt, t > T_END - 1.2 ? 0 : rate);
  // prédios
  const winA = 0.45 + 0.55 * (1 - k * 0.6);
  for (let li = 0; li < sky.layers.length; li++) {
    const ly = sky.layers[li];
    cx.fillStyle = ly.col;
    for (const b of ly.b) {
      cx.fillRect(b.x, hz - b.h, b.w, b.h + 1);
      if (b.ant) cx.fillRect(b.x + b.w * 0.45, hz - b.h - S * 0.05, Math.max(1, b.w * 0.06), S * 0.05);
    }
    const ws = Math.max(1.5, S * 0.008 * (0.6 + li * 0.25));
    cx.globalAlpha = winA * (0.5 + li * 0.25);
    for (const b of ly.b) {
      const w = b.wins;
      for (let i = 0; i < w.length; i += 3) {
        cx.fillStyle = sky.wcol[w[i + 2]];
        cx.fillRect(w[i], w[i + 1], ws, ws * 1.3);
      }
    }
    cx.globalAlpha = 1;
  }
  // a torre do herói no centro, com o feixe de luz
  const tw = S * 0.11, th = H * 0.5;
  const tx = W / 2 - tw / 2, ty = hz - th;
  const beam = sm(2, 4.5, u);
  if (beam > 0) {
    cx.globalCompositeOperation = 'lighter';
    const bw = tw * (0.25 + 0.15 * Math.sin(t * 3));
    const bg = cx.createLinearGradient(0, 0, 0, ty);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(1, hero.col);
    cx.globalAlpha = 0.55 * beam;
    cx.fillStyle = bg;
    cx.fillRect(W / 2 - bw / 2, 0, bw, ty);
    cx.globalAlpha = 0.9 * beam;
    cx.fillStyle = '#fff';
    cx.fillRect(W / 2 - 1, 0, 2, ty);
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
  }
  cx.fillStyle = '#05020b';
  cx.beginPath();
  cx.moveTo(tx, hz);
  cx.lineTo(tx, ty + tw * 0.5);
  cx.lineTo(W / 2, ty);
  cx.lineTo(tx + tw, ty + tw * 0.5);
  cx.lineTo(tx + tw, hz);
  cx.fill();
  cx.strokeStyle = hero.col;
  cx.shadowColor = hero.col;
  cx.shadowBlur = 14;
  cx.lineWidth = 2;
  cx.stroke();
  cx.shadowBlur = 0;
  // emblema do herói na torre
  const ez = tw * 0.8;
  if (heroImg.complete && heroImg.naturalWidth) {
    cx.globalAlpha = 0.4 + 0.6 * beam;
    cx.drawImage(heroImg, W / 2 - ez / 2, ty + tw * 0.7, ez, ez);
    cx.globalAlpha = 1;
  }
  // chão com a grade synthwave
  const gg = cx.createLinearGradient(0, hz, 0, H);
  gg.addColorStop(0, '#12051f');
  gg.addColorStop(1, '#030108');
  cx.fillStyle = gg;
  cx.fillRect(0, hz, W, H - hz);
  cx.strokeStyle = '#ff2bd6';
  cx.globalAlpha = 0.5;
  cx.lineWidth = 1;
  cx.beginPath();
  for (let i = -10; i <= 10; i++) {
    cx.moveTo(W / 2 + i * W * 0.02, hz);
    cx.lineTo(W / 2 + i * W * 0.16, H);
  }
  const gh = H - hz;
  for (let i = 0; i < 6; i++) {
    const f = ((i + ((u * 0.6) % 1)) / 6);
    const yy = hz + gh * f * f;
    cx.moveTo(0, yy);
    cx.lineTo(W, yy);
  }
  cx.stroke();
  cx.globalAlpha = 1;
  // título
  if (t < T_CRED + 1) drawTitle(u, 1 - sm(T_CRED - 0.5, T_CRED + 0.5, t));
  // créditos
  if (t > T_CRED - 0.5) {
    const dk = sm(T_CRED - 0.5, T_CRED + 1.5, t);
    cx.fillStyle = `rgba(3,1,10,${0.62 * dk})`;
    cx.fillRect(0, 0, W, H);
    drawCredits(t);
  }
  // barras de cinema recolhendo
  letterbox(1 - sm(0, 1.6, u));
  // clarão da chegada
  const fl = 1 - sm(0, 1.4, u);
  if (fl > 0) {
    cx.fillStyle = `rgba(255,236,200,${fl})`;
    cx.fillRect(0, 0, W, H);
  }
  // escurece no fim
  const fo = sm(T_END - 1.2, T_END, t);
  if (fo > 0) {
    cx.fillStyle = `rgba(0,0,0,${fo})`;
    cx.fillRect(0, 0, W, H);
  }
  once('title', t, T_DAWN + 4.4, () => sfx.nova());
  once('thanks', t, T_THANKS, () => sfx.levelup());
}

function drawTitle(u, alpha) {
  if (alpha <= 0) return;
  const cy = H * 0.3;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  // kicker
  const ka = sm(3.6, 4.4, u) * alpha;
  if (ka > 0) {
    cx.globalAlpha = ka;
    cx.font = `700 ${Math.round(S * 0.035)}px Orbitron, sans-serif`;
    cx.fillStyle = '#ffd23d';
    cx.shadowColor = '#ffd23d';
    cx.shadowBlur = 12;
    cx.fillText(spaced(L('FINAL VERDADEIRO', 'TRUE ENDING')), W / 2, cy - S * 0.12, W * 0.9);
    cx.shadowBlur = 0;
  }
  // título com aberração cromática que assenta
  const ta = sm(4.4, 5.2, u) * alpha;
  if (ta > 0) {
    const sc = 1 + 0.25 * (1 - ease(cl((u - 4.4) / 0.9)));
    const ab = S * 0.012 * (1 - sm(4.4, 6, u)) + S * 0.0025;
    const fs = Math.round(S * 0.12);
    cx.save();
    cx.translate(W / 2, cy);
    cx.scale(sc, sc);
    cx.font = `900 ${fs}px Orbitron, sans-serif`;
    const txt = L('LENDA DO NEON', 'NEON LEGEND');
    const mw = W * 0.92 / sc;
    cx.globalAlpha = ta * 0.8;
    cx.globalCompositeOperation = 'lighter';
    cx.fillStyle = '#ff2bd6';
    cx.fillText(txt, -ab, 0, mw);
    cx.fillStyle = '#00f0ff';
    cx.fillText(txt, ab, 0, mw);
    cx.globalCompositeOperation = 'source-over';
    cx.globalAlpha = ta;
    cx.fillStyle = '#fff';
    cx.shadowColor = hero.col;
    cx.shadowBlur = 24;
    cx.fillText(txt, 0, 0, mw);
    cx.shadowBlur = 0;
    cx.restore();
  }
  // subtítulo
  const sa = sm(6, 6.8, u) * alpha;
  if (sa > 0) {
    cx.globalAlpha = sa;
    cx.font = `700 ${Math.round(S * 0.05)}px Rajdhani, system-ui, sans-serif`;
    const sub = L(`${hero.C.name} venceu o Inferno`, `${hero.C.name} conquered the Inferno`);
    outline(S * 0.009);
    cx.strokeText(sub, W / 2, cy + S * 0.12, W * 0.9);
    cx.fillStyle = hero.col;
    cx.shadowColor = '#000';
    cx.shadowBlur = 8;
    cx.fillText(sub, W / 2, cy + S * 0.12, W * 0.9);
    cx.shadowBlur = 0;
  }
  cx.globalAlpha = 1;
  caption(typed(L('O sol nasce sobre uma cidade livre.', 'The sun rises over a free city.'), u, 7.6, 28), cy + S * 0.2, alpha, 0.042, '#ffe7c8');
}

const spaced = (s) => s.split('').join(' ');

// ------------------------------------------------------------------
// Créditos
// ------------------------------------------------------------------
function buildCredits() {
  const c = hero.c;
  const list = achList();
  const medals = list.filter((a) => G.save && G.save.ach && G.save.ach[a.id]).length;
  const out = [];
  const head = (s) => out.push({ k: 'h', s });
  const line = (s, col = '#e8ecff') => out.push({ k: 't', s, col });
  const big = (s, col) => out.push({ k: 'b', s, col });
  const gap = () => out.push({ k: 'g' });
  head(L('O HERÓI', 'THE HERO'));
  big(hero.C.name, hero.col);
  line(`${L('Nível', 'Level')} ${c.level} · ${L('Tempo de jogo', 'Play time')} ${fmtPlay(c.playTime || 0)}`);
  line(`${fmt(c.kills || 0)} ${L('abates', 'kills')} · ${fmt(c.deaths || 0)} ${L('mortes', 'deaths')} · ${fmt(c.wins || 1)} ${L('vitórias', 'wins')}`);
  line(`${medals}/${list.length} ${L('medalhas', 'medals')}`, '#ffd23d');
  gap();
  head(L('OS GUARDIÕES', 'THE GUARDIANS'));
  for (const k of BOSS_ORDER) line(ETYPES[k].name, hex(ETYPES[k].blood));
  gap();
  head(L('AS DESCIDAS', 'THE DESCENTS'));
  for (const T of TIERS) line(`${T.icon ? T.icon + ' ' : ''}${T.name}`, T.css);
  gap();
  head(L('OS BIOMAS', 'THE BIOMES'));
  for (const th of THEMES) line(th.name, hex(th.a));
  gap();
  head(L('OS HERÓIS', 'THE HEROES'));
  for (const id of CLASS_ORDER) line(CLASSES[id].name, CLASSES[id].css);
  gap();
  head(L('FEITO COM', 'MADE WITH'));
  line('Three.js · WebAudio · ' + L('muito neon', 'lots of neon'));
  line(L('Cada modelo, som e música gerado por código', 'Every model, sound and song generated by code'), 'rgba(232,236,255,0.7)');
  credits = out;
}

function credStep(e) {
  return e.k === 'h' ? 0.085 : e.k === 'b' ? 0.09 : e.k === 'g' ? 0.08 : 0.055;
}

function drawCredits(t) {
  let total = 0;
  for (const e of credits) total += credStep(e) * S;
  // sobe da parte de baixo até sumir em cima durante CRED_DUR
  const p = cl((t - T_CRED) / CRED_DUR);
  let y = H + S * 0.05 - p * (total + H + S * 0.1);
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  for (const e of credits) {
    const st = credStep(e) * S;
    y += st;
    if (y < -S * 0.1 || y > H + S * 0.1 || e.k === 'g') continue;
    // some nas bordas
    const a = sm(0, H * 0.14, y) * (1 - sm(H * 0.86, H, y));
    cx.globalAlpha = a;
    if (e.k === 'h') {
      cx.font = `700 ${Math.round(S * 0.032)}px Orbitron, sans-serif`;
      cx.fillStyle = '#9aa4c8';
      cx.fillText(spaced(e.s), W / 2, y, W * 0.9);
    } else if (e.k === 'b') {
      cx.font = `900 ${Math.round(S * 0.07)}px Orbitron, sans-serif`;
      cx.fillStyle = e.col;
      cx.shadowColor = e.col;
      cx.shadowBlur = 16;
      cx.fillText(e.s.toUpperCase(), W / 2, y, W * 0.9);
      cx.shadowBlur = 0;
    } else {
      cx.font = `600 ${Math.round(S * 0.045)}px Rajdhani, system-ui, sans-serif`;
      cx.fillStyle = e.col;
      cx.fillText(e.s, W / 2, y, W * 0.9);
    }
  }
  cx.globalAlpha = 1;
  // "obrigado por jogar"
  const ta = sm(T_THANKS - 0.3, T_THANKS + 1, t);
  if (ta > 0) {
    const sc = 1 + 0.08 * (1 - ease(cl((t - T_THANKS) / 1.5)));
    cx.save();
    cx.translate(W / 2, H * 0.46);
    cx.scale(sc, sc);
    cx.globalAlpha = ta;
    cx.font = `900 ${Math.round(S * 0.085)}px Orbitron, sans-serif`;
    cx.fillStyle = '#fff';
    cx.shadowColor = '#ff2bd6';
    cx.shadowBlur = 26;
    cx.fillText(L('OBRIGADO POR JOGAR', 'THANKS FOR PLAYING'), 0, 0, W * 0.9);
    cx.shadowBlur = 0;
    cx.font = `600 ${Math.round(S * 0.045)}px Rajdhani, system-ui, sans-serif`;
    cx.fillStyle = hero.col;
    cx.fillText(L('A lenda do neon está completa.', 'The neon legend is complete.'), 0, S * 0.1, W * 0.9);
    cx.restore();
  }
  cx.globalAlpha = 1;
}
