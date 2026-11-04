// Efeitos sonoros e trilha synthwave gerados em tempo real com WebAudio.
import { G } from './state.js';

let ctx = null;
let master, sfxBus, musBus, noiseBuf;
const last = {};

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    ctx = null;
    return;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.connect(comp);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musBus = ctx.createGain();
  musBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  startMusic();
}

export function applyVolumes() {
  if (!ctx) return;
  sfxBus.gain.value = G.settings.sfx * 0.7;
  musBus.gain.value = G.settings.music * 0.32;
}

function throttle(name, ms) {
  const n = performance.now();
  if (last[name] && n - last[name] < ms) return true;
  last[name] = n;
  return false;
}

function tone(o) {
  if (!ctx) return;
  const t = o.t ?? ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const a = o.a || 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(o.dur, a + 0.01));
  let node = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(o.bus || sfxBus);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

function noise(o) {
  if (!ctx) return;
  const t = o.t ?? ctx.currentTime + (o.delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.f || 2000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  f.Q.value = o.q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(o.bus || sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.05);
}

export const sfx = {
  slash() {
    if (throttle('slash', 40)) return;
    noise({ dur: 0.13, vol: 0.28, type: 'bandpass', f: 3500, f2: 700, q: 2 });
    tone({ type: 'sawtooth', f: 320, f2: 110, dur: 0.09, vol: 0.05 });
  },
  shoot() {
    if (throttle('shoot', 35)) return;
    tone({ type: 'square', f: 1100, f2: 180, dur: 0.07, vol: 0.06 });
    noise({ dur: 0.05, vol: 0.09, type: 'highpass', f: 3500 });
  },
  orb() {
    if (throttle('orb', 40)) return;
    tone({ type: 'sine', f: 420, f2: 1300, dur: 0.13, vol: 0.12 });
    tone({ type: 'triangle', f: 900, f2: 2400, dur: 0.08, vol: 0.05 });
  },
  enemyShot() {
    if (throttle('eshot', 60)) return;
    tone({ type: 'square', f: 420, f2: 140, dur: 0.11, vol: 0.045 });
  },
  hit() {
    if (throttle('hit', 30)) return;
    noise({ dur: 0.06, vol: 0.16, type: 'lowpass', f: 1800 });
    tone({ type: 'square', f: 190, f2: 70, dur: 0.05, vol: 0.05 });
  },
  crit() {
    if (throttle('crit', 60)) return;
    tone({ type: 'square', f: 1500, f2: 600, dur: 0.09, vol: 0.06 });
    noise({ dur: 0.08, vol: 0.2, type: 'bandpass', f: 2500 });
  },
  explode() {
    if (throttle('explode', 60)) return;
    noise({ dur: 0.7, vol: 0.55, type: 'lowpass', f: 1400, f2: 60 });
    tone({ type: 'sine', f: 130, f2: 28, dur: 0.55, vol: 0.45 });
  },
  hurt() {
    if (throttle('hurt', 140)) return;
    tone({ type: 'sawtooth', f: 240, f2: 80, dur: 0.2, vol: 0.12, lp: 1300 });
  },
  pickup() {
    tone({ type: 'triangle', f: 660, dur: 0.07, vol: 0.1 });
    tone({ type: 'triangle', f: 990, dur: 0.1, vol: 0.1, delay: 0.06 });
  },
  coin() {
    if (throttle('coin', 50)) return;
    tone({ type: 'square', f: 1300, dur: 0.05, vol: 0.04 });
    tone({ type: 'square', f: 1760, dur: 0.08, vol: 0.04, delay: 0.05 });
  },
  rare() {
    [660, 880, 1320].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.18, vol: 0.09, delay: i * 0.06 }));
  },
  punch() {
    if (throttle('punch', 40)) return;
    noise({ dur: 0.07, vol: 0.22, type: 'lowpass', f: 900 });
    tone({ type: 'sine', f: 140, f2: 60, dur: 0.08, vol: 0.18 });
  },
  punchHeavy() {
    noise({ dur: 0.18, vol: 0.32, type: 'lowpass', f: 700, f2: 120 });
    tone({ type: 'sine', f: 110, f2: 35, dur: 0.22, vol: 0.32 });
  },
  flame() {
    if (throttle('flame', 90)) return;
    noise({ dur: 0.14, vol: 0.09, type: 'bandpass', f: 900, f2: 500, q: 0.7 });
  },
  cryo() {
    if (throttle('cryo', 60)) return;
    tone({ type: 'triangle', f: 2400, f2: 900, dur: 0.12, vol: 0.06 });
    noise({ dur: 0.1, vol: 0.08, type: 'highpass', f: 6000 });
  },
  upgrade() {
    if (throttle('upgrade', 200)) return;
    [523, 784, 1047, 1568].forEach((f, i) => tone({ type: 'square', f, dur: 0.16, vol: 0.07, delay: i * 0.06, lp: 4000 }));
    tone({ type: 'sine', f: 2093, dur: 0.4, vol: 0.06, delay: 0.24 });
  },
  shieldBlock() {
    if (throttle('block', 60)) return;
    tone({ type: 'square', f: 2200, f2: 1600, dur: 0.06, vol: 0.05 });
    noise({ dur: 0.05, vol: 0.1, type: 'highpass', f: 5000 });
  },
  laser() {
    if (throttle('laser', 100)) return;
    tone({ type: 'sawtooth', f: 1800, f2: 120, dur: 0.25, vol: 0.09 });
    noise({ dur: 0.15, vol: 0.12, type: 'bandpass', f: 3000 });
  },
  heal() {
    if (throttle('eheal', 250)) return;
    tone({ type: 'sine', f: 600, f2: 1200, dur: 0.2, vol: 0.04 });
  },
  legendary() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.3, vol: 0.1, delay: i * 0.07 }));
  },
  levelup() {
    [440, 554, 659, 880, 1109].forEach((f, i) => tone({ type: 'square', f, dur: 0.22, vol: 0.07, delay: i * 0.08, lp: 3200 }));
  },
  dash() {
    noise({ dur: 0.2, vol: 0.22, type: 'bandpass', f: 500, f2: 3500, q: 1.5 });
  },
  zap() {
    if (throttle('zap', 50)) return;
    tone({ type: 'sawtooth', f: 1900, f2: 260, dur: 0.12, vol: 0.05 });
    noise({ dur: 0.08, vol: 0.1, type: 'highpass', f: 3000 });
  },
  nova() {
    tone({ type: 'sawtooth', f: 90, f2: 900, dur: 0.32, vol: 0.12, lp: 2600 });
    noise({ dur: 0.4, vol: 0.22, type: 'bandpass', f: 400, f2: 4500 });
  },
  deploy() {
    tone({ type: 'square', f: 300, f2: 600, dur: 0.12, vol: 0.06 });
    tone({ type: 'square', f: 600, f2: 900, dur: 0.12, vol: 0.06, delay: 0.1 });
  },
  stim() {
    tone({ type: 'sine', f: 280, f2: 950, dur: 0.32, vol: 0.15 });
    noise({ dur: 0.2, vol: 0.06, type: 'highpass', f: 5000 });
  },
  deny() {
    if (throttle('deny', 300)) return;
    tone({ type: 'square', f: 170, dur: 0.07, vol: 0.05 });
    tone({ type: 'square', f: 120, dur: 0.1, vol: 0.05, delay: 0.08 });
  },
  die() {
    if (throttle('die', 35)) return;
    noise({ dur: 0.25, vol: 0.16, type: 'bandpass', f: 1300, f2: 180 });
  },
  elevator() {
    tone({ type: 'sine', f: 180, f2: 900, dur: 1.1, vol: 0.16 });
    tone({ type: 'triangle', f: 360, f2: 1800, dur: 1.1, vol: 0.06 });
  },
  boss() {
    tone({ type: 'sawtooth', f: 55, dur: 1.4, vol: 0.25, lp: 420, a: 0.05 });
    tone({ type: 'sawtooth', f: 58.3, dur: 1.4, vol: 0.2, lp: 420, a: 0.05 });
    noise({ dur: 1.2, vol: 0.12, type: 'lowpass', f: 300 });
  },
  telegraph() {
    if (throttle('tele', 120)) return;
    tone({ type: 'square', f: 280, f2: 560, dur: 0.25, vol: 0.04 });
  },
  click() {
    tone({ type: 'square', f: 820, dur: 0.03, vol: 0.035 });
  },
  playerDeath() {
    tone({ type: 'sawtooth', f: 400, f2: 40, dur: 1.4, vol: 0.2, lp: 1500 });
  },
};

// ---------------- Música ----------------
const BPM = 102;
const S16 = 60 / BPM / 4;
const PROG = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let nextTime = 0;
let step = 0;

function startMusic() {
  nextTime = ctx.currentTime + 0.15;
  setInterval(schedule, 25);
}

function schedule() {
  if (!ctx) return;
  if (G.settings.music <= 0.001 || ctx.state !== 'running') {
    nextTime = ctx.currentTime + 0.1;
    return;
  }
  while (nextTime < ctx.currentTime + 0.12) {
    playStep(step, nextTime);
    nextTime += S16;
    step++;
  }
}

function playStep(s, t) {
  const bar = Math.floor(s / 16) % 4;
  const st = s % 16;
  const ch = PROG[bar];
  const fight = G.mode === 'play' && (G.boss || (G.player && G.player.inCombat > 0));
  const bus = musBus;
  if (st % 4 === 0) tone({ type: 'sine', f: 120, f2: 38, dur: 0.2, vol: 0.55, t, bus });
  if (st % 4 === 2) noise({ t, dur: 0.03, vol: 0.07, type: 'highpass', f: 7000, bus });
  if (fight && st % 2 === 1) noise({ t, dur: 0.02, vol: 0.035, type: 'highpass', f: 9000, bus });
  if (st === 4 || st === 12) noise({ t, dur: 0.14, vol: 0.16, type: 'bandpass', f: 1800, bus });
  if (st % 2 === 0) {
    const n = ch[0] - 24 + (st % 4 === 2 ? 12 : 0);
    tone({ type: 'sawtooth', f: mtof(n), dur: S16 * 1.7, vol: 0.15, lp: fight ? 900 : 520, t, bus });
  }
  const arpN = ch[st % 3] + 12 + (Math.floor(st / 3) % 2 ? 12 : 0);
  tone({ type: 'square', f: mtof(arpN), dur: S16 * 0.85, vol: fight ? 0.04 : 0.028, lp: 2400, t, bus });
  if (st === 0) ch.forEach((n) => tone({ type: 'triangle', f: mtof(n), dur: S16 * 15, vol: 0.028, a: 0.5, t, bus }));
}
