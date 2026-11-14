// Efeitos sonoros e trilha synthwave gerados em tempo real com WebAudio.
import { G } from './state.js';
import { createMusic, SONGS } from './music.js';
import { L } from './i18n.js';
import { toast } from './ui.js';

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
  // item mítico caindo: impacto grave, subida brilhante, arpejo e um acorde de sino que fica no ar
  mythic() {
    if (throttle('mythic', 600)) return;
    tone({ type: 'sine', f: 90, f2: 38, dur: 0.9, vol: 0.4 });
    noise({ dur: 0.35, vol: 0.2, type: 'lowpass', f: 600, f2: 90 });
    noise({ dur: 0.7, vol: 0.07, type: 'bandpass', f: 500, f2: 7000, q: 1.2, delay: 0.1 });
    [392, 523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.45, vol: 0.075, delay: 0.22 + i * 0.05 }));
    [523, 659, 784, 1047, 1568].forEach((f) => tone({ type: 'sine', f, dur: 2.2, vol: 0.06, delay: 0.62, a: 0.03 }));
    [262, 392].forEach((f) => tone({ type: 'triangle', f, dur: 2, vol: 0.05, delay: 0.62, a: 0.08, lp: 1500 }));
    [2637, 3136, 3951, 4186, 3520].forEach((f, i) => tone({ type: 'sine', f, dur: 0.3, vol: 0.025, delay: 0.95 + i * 0.11 }));
  },
  // item primordial caindo: o mítico com um trovão grave, um coro subindo e cintilação que demora a sumir
  primordial() {
    if (throttle('primordial', 900)) return;
    this.mythic();
    tone({ type: 'sawtooth', f: 55, f2: 27, dur: 1.6, vol: 0.18, lp: 400 });
    noise({ dur: 1.2, vol: 0.12, type: 'lowpass', f: 300, f2: 60, delay: 0.05 });
    [130.8, 196, 261.6, 329.6, 392, 523.3].forEach((f, i) => tone({ type: 'sine', f, f2: f * 1.5, dur: 1.8, vol: 0.045, delay: 0.4 + i * 0.1, a: 0.25 }));
    [1568, 2093, 2637, 3136, 3951, 4699, 5274].forEach((f, i) => tone({ type: 'sine', f, dur: 0.5, vol: 0.022, delay: 1.1 + i * 0.13 }));
    [65.4, 98, 130.8].forEach((f) => tone({ type: 'triangle', f, dur: 3, vol: 0.06, delay: 1, a: 0.3, lp: 900 }));
  },
  // batidinha distante do ferreiro trabalhando
  forgeTick() {
    if (throttle('forgeTick', 300)) return;
    tone({ type: 'triangle', f: 2600, dur: 0.18, vol: 0.025 });
    noise({ dur: 0.04, vol: 0.05, type: 'highpass', f: 4000 });
  },
  // martelo na bigorna do ferreiro (big: marco de aprimoramento)
  forge(big) {
    if (throttle('forge', 120)) return;
    [0, 0.16].forEach((d, i) => {
      tone({ type: 'square', f: 1850 - i * 200, f2: 1500, dur: 0.12, vol: 0.06, delay: d, lp: 6000 });
      tone({ type: 'triangle', f: 2780 - i * 300, dur: 0.35, vol: 0.05, delay: d });
      noise({ dur: 0.09, vol: 0.25, type: 'highpass', f: 2500, delay: d });
      tone({ type: 'sine', f: 160, f2: 70, dur: 0.12, vol: 0.2, delay: d });
    });
    noise({ dur: 0.5, vol: 0.05, type: 'bandpass', f: 1200, f2: 400, delay: 0.3 }); // chiado do metal
    if (big) [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.35, vol: 0.09, delay: 0.38 + i * 0.07 }));
  },
  // fanfarra da vitória final
  victory() {
    [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone({ type: 'square', f, dur: i === 7 ? 1.2 : 0.26, vol: 0.08, delay: i * 0.16, lp: 3600 }));
    [262, 330, 392, 523].forEach((f, i) => tone({ type: 'triangle', f, dur: 1.6, vol: 0.06, delay: 1.1 + i * 0.02 }));
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
  // rugido do Behemoth: rosnado grave que sobe e desce, com um bafo de vapor
  roar() {
    if (throttle('roar', 400)) return;
    tone({ type: 'sawtooth', f: 70, f2: 150, dur: 0.35, vol: 0.26, lp: 700, a: 0.04 });
    tone({ type: 'sawtooth', f: 150, f2: 52, dur: 1.0, vol: 0.3, lp: 900, delay: 0.3 });
    tone({ type: 'square', f: 76, f2: 40, dur: 1.1, vol: 0.14, lp: 500, delay: 0.3 });
    noise({ dur: 1.1, vol: 0.3, type: 'bandpass', f: 500, f2: 180, q: 0.8, delay: 0.1 });
  },
  telegraph() {
    if (throttle('tele', 120)) return;
    tone({ type: 'square', f: 280, f2: 560, dur: 0.25, vol: 0.04 });
  },
  click() {
    tone({ type: 'square', f: 820, dur: 0.03, vol: 0.035 });
  },
  // nota de cada terminal/placa (eventos de andar)
  seq(i) {
    const f = [392, 494, 587, 698][i & 3];
    tone({ type: 'triangle', f, dur: 0.32, vol: 0.13 });
    tone({ type: 'sine', f: f * 2, dur: 0.2, vol: 0.04 });
  },
  // alarme dos terminais
  alarm() {
    if (throttle('alarm', 500)) return;
    for (let k = 0; k < 3; k++) {
      tone({ type: 'sawtooth', f: 620, f2: 900, dur: 0.16, vol: 0.07, lp: 2500, delay: k * 0.2 });
      tone({ type: 'sawtooth', f: 900, f2: 620, dur: 0.04, vol: 0.05, lp: 2500, delay: k * 0.2 + 0.16 });
    }
  },
  // Máquina de Apostas girando
  spin() {
    for (let k = 0; k < 12; k++) tone({ type: 'square', f: 500 + (k % 3) * 160, dur: 0.04, vol: 0.035, delay: k * 0.1 });
  },
  playerDeath() {
    tone({ type: 'sawtooth', f: 400, f2: 40, dur: 1.4, vol: 0.2, lp: 1500 });
  },
};

// ---------------- Música ----------------
// 5 músicas em js/music.js; tocam em ordem aleatória (ou a escolhida nas opções)
let music = null;

function trackChoice() {
  const t = G.settings.track;
  return Number.isInteger(t) && t >= 0 && t < SONGS.length ? t : null;
}

function startMusic() {
  music = createMusic(ctx, musBus, {
    intensity: () => (G.mode !== 'play' ? 0 : G.boss ? 2 : G.player && G.player.inCombat > 0 ? 1 : 0),
    onSong: (i, song, t) => {
      setTimeout(() => {
        if (G.mode === 'play' && G.settings.music > 0.001) toast('♪ ' + L(song.name[0], song.name[1]), 'music', 'music');
      }, Math.max(0, (t - ctx.currentTime) * 1000));
    },
  });
  music.choose(trackChoice());
  music.reset(ctx.currentTime + 0.15);
  setInterval(schedule, 25);
}

function schedule() {
  if (!ctx || !music) return;
  if (G.settings.music <= 0.001 || ctx.state !== 'running') {
    music.reset(ctx.currentTime + 0.1);
    return;
  }
  music.tick(ctx.currentTime + 0.15);
}

// nomes das músicas para o menu de opções
export function trackNames() {
  return SONGS.map((s) => L(s.name[0], s.name[1]));
}
// hino do final verdadeiro (cinemática do Inferno); false volta para a trilha normal
export function playAnthem(on) {
  if (music && ctx) music.anthem(on, ctx.currentTime + 0.12);
}
// chamada pelas opções depois de mudar G.settings.track
export function applyTrack() {
  if (music) music.choose(trackChoice());
}
