// Trilha sonora: 5 músicas synthwave sintetizadas em tempo real com WebAudio.
// Cada música tem progressões, padrões de bateria/baixo/arpejo, melodias e um arranjo em seções.
// Este módulo não importa nada: recebe o AudioContext e o nó de saída (também roda num OfflineAudioContext).

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// 'a4', 'c#5', 'bb3' -> nota MIDI
function nm(s) {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('nota inválida: ' + s);
  return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14] };
// 'F#m7' -> { notes: acorde na região E3..D#4, b: fundamental do baixo, iv }
function chord(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  const pc = (PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const iv = QUAL[m[3]];
  if (!iv) throw new Error('acorde inválido: ' + sym);
  const r = 52 + ((pc - 4 + 12) % 12);
  return { notes: iv.map((i) => r + i), b: r - 24, iv };
}
// melodia em colcheias: nota, '-' (segura) ou '.' (pausa); '|' só separa compassos
function mel(s) {
  const tk = s.replace(/\|/g, ' ').trim().split(/\s+/);
  if (tk.length % 8) throw new Error('melodia precisa de compassos completos: ' + s);
  return tk.map((x) => (x === '-' || x === '.' ? x : nm(x)));
}

// ---------------- As músicas ----------------
// Camadas por seção: p pad, a arpejo, k bumbo, s caixa, h chimbal, b baixo, l melodia, c prato no início, r subida no fim
// Baixo: r fundamental, o oitava, f quinta, t terça, '-' segura, '.' pausa. Arpejo: índice nas notas do acorde (+oitava).
export const SONGS = [
  {
    name: ['Pulso Neon', 'Neon Pulse'],
    bpm: 104,
    prog: { A: 'Am F C G', B: 'F C G Am' },
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bass: 'r-r-r-o-r-r-r-o-',
    arp: '0123012301230123',
    arpOct: 12,
    lead: 'saw',
    mel: {
      A: 'e5 - - - d5 - c5 - | a4 - - - - - c5 - | g4 - - - c5 - e5 - | d5 - - - - - . .',
      B: 'a4 - c5 - f5 - e5 c5 | e5 - - - g5 - e5 - | d5 - - b4 d5 - g5 - | e5 - - - - - . . |' +
         'a4 - c5 - f5 - a5 - | g5 - e5 - c5 - e5 - | d5 - b4 - d5 - e5 d5 | c5 - - - a4 - - -',
    },
    secs: [['A', 4, 'pa'], ['A', 4, 'pakbr'], ['A', 8, 'pakshb'], ['B', 8, 'pakshblc'], ['A', 4, 'plr'], ['A', 8, 'pakshbl'], ['B', 8, 'pakshblc'], ['B', 8, 'pakshbl'], ['A', 4, 'pa']],
  },
  {
    name: ['Chuva Cromada', 'Chrome Rain'],
    bpm: 116,
    prog: { A: 'Dm Dm Bb C', B: 'Dm Bb Gm A' },
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    clap: true,
    hat: '..x...x...x...o.',
    bass: '.rrr.rrr.rrr.ror',
    bassGate: 0.7,
    bassCut: 750,
    arp: '0.2.1.3.0.2.1.4.',
    arpOct: 0,
    lead: 'saw',
    leadCut: 3400,
    pump: 0.6,
    mel: {
      A: 'd4 - - - - - - - | f4 - e4 - d4 - - - | bb3 - - - d4 - f4 - | e4 - - - g4 - - -',
      B: 'd5 - - a4 d5 - f5 - | f5 - - e5 d5 - bb4 - | g4 - bb4 - d5 - g5 - | e5 - - - c#5 - - - |' +
         'd5 - - a4 d5 - f5 - | g5 - f5 - d5 - f5 - | g5 - - f5 g5 - bb5 - | a5 - - - e5 - c#5 -',
    },
    secs: [['A', 4, 'pr'], ['A', 8, 'kshb'], ['A', 8, 'kshbal'], ['B', 8, 'pkshbalc'], ['A', 4, 'par'], ['B', 8, 'pkshbalc'], ['B', 8, 'pkshbal'], ['A', 4, 'pk']],
  },
  {
    name: ['Grade da Meia-Noite', 'Midnight Grid'],
    gain: 1.35,
    bpm: 86,
    swing: 0.12,
    prog: { A: 'Em7 Cmaj7 G D', B: 'Am7 Em7 Cmaj7 D' },
    kick: 'x.........x.....',
    snare: '........x.......',
    hat: 'x.x.x.x.x.x.x.x.',
    hatVol: 0.6,
    bass: 'r-------o---r---',
    bassCut: 450,
    arp: '0.1.2.3.4.3.2.1.',
    arpOct: 12,
    lead: 'bell',
    pump: 0.3,
    padCut: 1700,
    mel: {
      A: 'b4 - - - g4 - e4 - | e5 - - - b4 - - - | d5 - b4 - g4 - - - | f#4 - a4 - d5 - - -',
      B: 'c5 - e5 - g5 - e5 - | b4 - - - d5 - b4 - | c5 - b4 - g4 - e4 - | f#4 - - - a4 - - - |' +
         'c5 - e5 - a5 - g5 - | f#5 - e5 - b4 - - - | e5 - d5 - c5 - b4 - | a4 - - - f#4 - - -',
    },
    secs: [['A', 4, 'pa'], ['A', 8, 'pakhb'], ['B', 8, 'pakshbl'], ['A', 8, 'pakshbl'], ['A', 4, 'pl'], ['B', 8, 'pakshblc'], ['A', 4, 'pa']],
  },
  {
    name: ['Fantasmas de Dados', 'Data Ghosts'],
    gain: 1.25,
    bpm: 96,
    prog: { A: 'F#m D Bm C#', B: 'D E C#m F#m' },
    kick: 'x.....x...x.....',
    snare: '....x.......x...',
    hat: '..x...x...x...xo',
    bass: 'r..r..r.r..r..o.',
    bassGate: 0.8,
    arp: '0..1..2..3..2..1',
    arpOct: 12,
    arpDly: 0.45,
    lead: 'square',
    glide: true,
    mel: {
      A: 'f#4 - a4 - c#5 - - - | d5 - c#5 - a4 - - - | d5 - - - b4 - f#4 - | e#4 - - - g#4 - - -',
      B: 'a4 - d5 - f#5 - e5 - | e5 - - - g#4 - b4 - | c#5 - - - e5 - g#5 - | f#5 - - - - - - - |' +
         'a5 - f#5 - d5 - f#5 - | g#5 - e5 - b4 - e5 - | g#5 - - f#5 e5 - c#5 - | f#5 - - - c#5 - - -',
    },
    secs: [['A', 4, 'a'], ['A', 4, 'ap'], ['A', 8, 'apkhb'], ['B', 8, 'apkshbl'], ['A', 8, 'apkshbl'], ['B', 8, 'apkshblc'], ['A', 4, 'ap']],
  },
  {
    name: ['Sobrecarga', 'Overdrive'],
    bpm: 128,
    prog: { A: 'Cm Ab Eb Bb', B: 'Ab Bb Gm Cm' },
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    clap: true,
    hat: '..o...o...o...o.',
    bass: '..r-..r-..r-..o-',
    bassCut: 900,
    arp: '0123432101234321',
    arpOct: 12,
    lead: 'saw',
    leadCut: 3800,
    pump: 0.65,
    mel: {
      A: 'g4 - - - c5 - eb5 - | c5 - - - ab4 - - - | bb4 - - - g4 - eb5 - | d5 - - - bb4 - - -',
      B: 'c5 - eb5 - ab5 - g5 eb5 | f5 - - - d5 - bb4 - | d5 - g5 - f5 - d5 - | eb5 - - - c5 - - - |' +
         'eb5 - ab5 - c6 - bb5 ab5 | bb5 - - - f5 - d5 - | g5 - bb5 - d6 - c6 bb5 | c6 - - - - - . .',
    },
    secs: [['A', 4, 'pa'], ['A', 4, 'pakr'], ['A', 8, 'pakshb'], ['B', 8, 'pakshblc'], ['A', 8, 'pakshbl'], ['A', 4, 'pr'], ['B', 8, 'pakshblc'], ['B', 8, 'pakshbl'], ['A', 4, 'pa']],
  },
];

let parsed = false;
function parseSongs() {
  if (parsed) return;
  parsed = true;
  for (const s of SONGS) {
    s.ch = {};
    for (const k in s.prog) s.ch[k] = s.prog[k].split(/\s+/).map(chord);
    for (const k in s.mel) s.mel[k] = mel(s.mel[k]);
    s.secs = s.secs.map(([p, bars, l]) => ({ p, bars, l }));
    s.bars = s.secs.reduce((a, x) => a + x.bars, 0);
  }
}

// impulso de reverb sintético (ruído estéreo com decaimento exponencial)
function impulse(ctx, sec, decay) {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

// opts: intensity() -> 0 calmo, 1 combate, 2 chefe; onSong(i, song) quando uma música começa
export function createMusic(ctx, dest, opts = {}) {
  parseSongs();
  const out = ctx.createGain();
  const OUT = 0.55;
  out.connect(dest);
  const hasPan = !!ctx.createStereoPanner;

  // efeitos: reverb e delay ping-pong
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.8, 3);
  reverb.connect(out);
  const dIn = ctx.createGain();
  const dL = ctx.createDelay(2);
  const dR = ctx.createDelay(2);
  const dLp = ctx.createBiquadFilter();
  dLp.type = 'lowpass';
  dLp.frequency.value = 2600;
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  fbL.gain.value = fbR.gain.value = 0.42;
  const merge = ctx.createChannelMerger(2);
  dIn.connect(dL);
  dL.connect(dLp);
  dLp.connect(fbL);
  fbL.connect(dR);
  dR.connect(fbR);
  fbR.connect(dL);
  dLp.connect(merge, 0, 0);
  dR.connect(merge, 0, 1);
  const dOut = ctx.createGain();
  dOut.gain.value = 0.8;
  merge.connect(dOut);
  dOut.connect(out);

  // sidechain: baixo, pad e arpejo "respiram" com o bumbo
  const duck = ctx.createGain();
  duck.connect(out);
  const B = {};
  const SENDS = { drums: [0.1, 0], bass: [0, 0], pad: [0.45, 0], arp: [0.25, 0.32], lead: [0.3, 0.22], fx: [0.5, 0] };
  for (const k in SENDS) {
    const g = ctx.createGain();
    g.connect(k === 'bass' || k === 'pad' || k === 'arp' ? duck : out);
    const rs = ctx.createGain();
    rs.gain.value = SENDS[k][0];
    g.connect(rs);
    rs.connect(reverb);
    const ds = ctx.createGain();
    ds.gain.value = SENDS[k][1];
    g.connect(ds);
    ds.connect(dIn);
    B[k] = g;
    B[k + 'Dly'] = ds;
  }

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // ---------- instrumentos ----------
  function noise(t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'highpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    if (o.rise) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol, t + o.dur);
      g.gain.linearRampToValueAtTime(0, t + o.dur + 0.03);
    } else {
      g.gain.setValueAtTime(o.vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    }
    src.connect(f);
    f.connect(g);
    g.connect(o.bus || B.drums);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  function kick(t, v) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    g.gain.setValueAtTime(v, t);
    g.gain.setValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g);
    g.connect(B.drums);
    o.start(t);
    o.stop(t + 0.45);
    noise(t, { dur: 0.012, vol: v * 0.25, f: 2500 });
  }
  function pump(t, amt) {
    if (!amt) return;
    duck.gain.setValueAtTime(1 - amt, t);
    duck.gain.linearRampToValueAtTime(1, t + 0.22);
  }
  function snare(t, v, clap) {
    if (clap) {
      for (let i = 0; i < 3; i++) noise(t + i * 0.011, { type: 'bandpass', f: 1300, q: 1.1, dur: 0.02, vol: v });
      noise(t + 0.033, { type: 'bandpass', f: 1200, q: 0.9, dur: 0.24, vol: v * 0.9 });
    } else {
      noise(t, { type: 'bandpass', f: 1900, q: 0.6, dur: 0.2, vol: v });
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(230, t);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      g.gain.setValueAtTime(v * 0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g);
      g.connect(B.drums);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  // voz genérica subtrativa: osciladores -> filtro com envelope -> ADSR -> pan -> bus
  function voice(t, o) {
    const a = o.a ?? 0.005;
    const d = o.d ?? 0.15;
    const s = o.s ?? 0.7;
    const r = o.r ?? 0.08;
    const hold = Math.max(o.dur, a + 0.01);
    const tr = t + hold;
    const peak = o.vol;
    const sus = peak * s;
    const tau = d / 3;
    const vRel = tr - (t + a) > 0 ? sus + (peak - sus) * Math.exp(-(tr - t - a) / tau) : peak;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(sus, t + a, tau);
    g.gain.setValueAtTime(vRel, tr);
    g.gain.setTargetAtTime(0, tr, r / 5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.q ?? 1;
    if (o.fe) {
      f.frequency.setValueAtTime(o.cut * o.fe, t);
      f.frequency.setTargetAtTime(o.cut, t, (o.fd ?? 0.15) / 3);
    } else f.frequency.value = o.cut;
    f.connect(g);
    let node = g;
    if (o.pan && hasPan) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      node = p;
    }
    node.connect(o.bus);
    let lfo = null;
    if (o.vib) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(0.5, hold));
      lfo.connect(lg);
      lfo.lg = lg;
      lfo.start(t);
      lfo.stop(tr + r + 0.02);
    }
    for (const n of o.notes) {
      for (const x of o.osc) {
        const osc = ctx.createOscillator();
        osc.type = x.type;
        const fr = mtof(n + (x.oct || 0));
        if (o.from != null) {
          osc.frequency.setValueAtTime(mtof(o.from + (x.oct || 0)), t);
          osc.frequency.exponentialRampToValueAtTime(fr, t + 0.06);
        } else osc.frequency.value = fr;
        osc.detune.value = x.det || 0;
        if (lfo) lfo.lg.connect(osc.detune);
        if (x.g != null && x.g !== 1) {
          const og = ctx.createGain();
          og.gain.value = x.g;
          osc.connect(og);
          og.connect(f);
        } else osc.connect(f);
        osc.start(t);
        osc.stop(tr + r + 0.02);
      }
    }
  }

  // sino FM (para a música mais calma)
  function bell(t, n, dur, v) {
    const fr = mtof(n);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = fr;
    mod.frequency.value = fr * 3.5;
    mg.gain.setValueAtTime(fr * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(fr * 0.08, t + 1.2);
    mod.connect(mg);
    mg.connect(car.frequency);
    const end = t + dur + 1.4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    car.connect(g);
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.value = fr * 2;
    g2.gain.setValueAtTime(v * 0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o2.connect(g2);
    g2.connect(B.lead);
    g.connect(B.lead);
    for (const o of [car, mod, o2]) {
      o.start(t);
      o.stop(end + 0.02);
    }
  }

  const LEADS = {
    saw: { osc: [{ type: 'sawtooth', det: -9 }, { type: 'sawtooth', det: 9 }, { type: 'square', oct: -12, g: 0.35 }], vol: 0.032, q: 2, a: 0.012, d: 0.3, s: 0.75, r: 0.18, vib: 14 },
    square: { osc: [{ type: 'square', det: -5 }, { type: 'square', det: 6 }], vol: 0.026, q: 1, a: 0.01, d: 0.4, s: 0.7, r: 0.2, vib: 18, cut: 1900 },
  };

  // ---------- sequenciador ----------
  let song = null;
  let songIdx = -1;
  let si = 0; // seção
  let sbar = 0; // compasso dentro da seção
  let st = 0; // semicolcheia dentro do compasso
  let nextTime = 0;
  let inten = 0;
  let S16 = 0.15;
  let lastLead = null;
  let bag = [];
  let fixed = null; // índice escolhido nas opções (null = aleatório)
  let pending = null;

  function pickNext() {
    if (fixed != null) return fixed;
    if (!bag.length) {
      bag = SONGS.map((_, i) => i).filter((i) => i !== songIdx);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }
  function startSong(i, t) {
    songIdx = i;
    song = SONGS[i];
    si = sbar = st = 0;
    lastLead = null;
    S16 = 60 / song.bpm / 4;
    out.gain.setValueAtTime(OUT * (song.gain || 1), t);
    const dt = S16 * 3; // colcheia pontuada
    dL.delayTime.setValueAtTime(dt, t);
    dR.delayTime.setValueAtTime(dt, t);
    B.arpDly.gain.setValueAtTime(song.arpDly ?? SENDS.arp[1], t);
    opts.onSong?.(i, song, t);
  }

  function playStep(t) {
    const sec = song.secs[si];
    const L = sec.l;
    const chs = song.ch[sec.p];
    const ch = chs[sbar % chs.length];
    if (st % 4 === 0) inten = opts.intensity ? opts.intensity() : 0;
    const has = (c) => L.includes(c) || (inten > 0 && (c === 'k' || c === 'b' || c === 'h')) || (inten > 1 && c === 's');
    const swing = st % 2 ? (song.swing || 0) * S16 : 0;
    const ts = t + swing;
    const lastBar = sbar === sec.bars - 1;
    const nextSec = song.secs[si + 1];

    if (st === 0 && sbar === 0 && L.includes('c')) noise(t, { f: 5000, dur: 1.8, vol: 0.075, bus: B.fx });
    if (L.includes('r') && lastBar && st === 0) noise(t, { type: 'bandpass', f: 400, f2: 7000, q: 2, dur: S16 * 16, vol: 0.09, rise: true, bus: B.fx });

    // bateria
    if (has('k') && song.kick[st] === 'x') {
      kick(t, 0.62);
      pump(t, song.pump ?? 0.5);
    }
    if (has('s')) {
      const fill = lastBar && st >= 12 && nextSec && nextSec.l.includes('c');
      if (fill) snare(t, 0.08 + (st - 12) * 0.04, false);
      else if (song.snare[st] === 'x') snare(t, song.clap ? 0.2 : 0.19, song.clap);
    }
    if (has('h')) {
      const hv = song.hatVol ?? 1;
      const hc = song.hat[st];
      if (hc === 'x') noise(ts, { f: 8500, dur: 0.035, vol: 0.06 * hv });
      else if (hc === 'o') noise(ts, { f: 7500, dur: 0.2, vol: 0.045 * hv });
      else if (inten > 0) noise(ts, { f: 9500, dur: 0.02, vol: 0.028 });
    }

    // baixo
    const bc = song.bass[st];
    if (has('b') && bc !== '.' && bc !== '-') {
      let len = 1;
      while (st + len < 16 && song.bass[st + len] === '-') len++;
      const n = ch.b + ({ r: 0, o: 12, f: 7, t: ch.iv[1] }[bc] ?? 0);
      const cut = (song.bassCut ?? 600) * (inten > 0 ? 1.5 : 1);
      voice(ts, { notes: [n], osc: [{ type: 'sawtooth', det: -7 }, { type: 'sawtooth', det: 7 }], dur: S16 * len * (song.bassGate ?? 0.92), vol: 0.1, cut, fe: 3.2, fd: 0.18, q: 3, a: 0.004, d: 0.2, s: 0.8, r: 0.05, bus: B.bass });
    }

    // arpejo
    const ac = song.arp[st];
    if (has('a') && ac !== '.') {
      const tones = ch.notes.concat(ch.notes.map((x) => x + 12));
      const n = tones[+ac % tones.length] + song.arpOct;
      voice(ts, { notes: [n], osc: [{ type: 'square' }], dur: S16 * 0.6, vol: inten > 0 ? 0.042 : 0.034, cut: 1200, fe: 4, fd: 0.12, q: 2, a: 0.002, d: 0.12, s: 0.25, r: 0.1, pan: st % 2 ? 0.3 : -0.3, bus: B.arp });
    }

    // pad
    if (has('p') && st === 0) {
      voice(t, { notes: ch.notes, osc: [{ type: 'sawtooth', det: -11 }, { type: 'sawtooth', det: 11 }, { type: 'triangle', oct: -12, g: 0.7 }], dur: S16 * 16, vol: 0.017, cut: song.padCut ?? 1300, q: 0.5, a: 0.45, d: 1, s: 0.85, r: 0.9, bus: B.pad });
    }

    // melodia (colcheias)
    if (st % 2 === 0) {
      const m = song.mel[sec.p];
      const idx = (sbar * 8 + st / 2) % m.length;
      const tk = m[idx];
      if (has('l') && typeof tk === 'number') {
        let len = 1;
        while (idx + len < m.length && m[idx + len] === '-') len++;
        const dur = S16 * 2 * len * 0.92;
        if (song.lead === 'bell') bell(t, tk, dur, 0.06);
        else {
          const P = LEADS[song.lead];
          voice(t, { ...P, notes: [tk], dur, cut: song.leadCut ?? P.cut ?? 2800, fe: 1.8, fd: 0.25, from: song.glide && lastLead != null ? lastLead : null, bus: B.lead });
        }
        lastLead = tk;
      } else if (tk === '.') lastLead = null;
    }
  }

  function advance() {
    st++;
    if (st < 16) return;
    st = 0;
    sbar++;
    if (pending != null) {
      const p = pending;
      pending = null;
      startSong(p, nextTime);
      return;
    }
    if (sbar < song.secs[si].bars) return;
    sbar = 0;
    si++;
    if (si >= song.secs.length) startSong(pickNext(), nextTime);
  }

  return {
    // agenda tudo até o instante 'until'
    tick(until) {
      if (!song) startSong(pickNext(), nextTime);
      while (nextTime < until) {
        const t = nextTime;
        playStep(t);
        nextTime += S16;
        advance();
      }
    },
    reset(t) {
      nextTime = t;
    },
    // null = aleatório; número = repete aquela música (troca no próximo compasso)
    choose(i) {
      fixed = i;
      bag = [];
      if (i != null && i !== songIdx && song) pending = i;
    },
    start(i, t) {
      nextTime = t;
      startSong(i, t);
    },
    get current() {
      return songIdx;
    },
  };
}
