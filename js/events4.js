// Eventos de andar, quarta leva: mais 30 jogos (toupeira, minigolfe, come-come, corte o fio, sombra, contagem,
// verdadeiro ou falso, torre de Hanói, quebra-cabeça deslizante, senha, palitos, dardos, garra, fogo, mesa inclinada,
// cores, onde estava, cavalo, goleiro, trânsito, cor certa, balão, bolhas, cobras e escadas, sequência, anéis,
// batalha naval, duelo, câmeras e copie o desenho).
// Mesmo contrato dos outros (setup/update/hud/save/load/intro), registrados em events.js (MAIN_EVENTS, EVENT_INFO, KIND).
// Só usam andar, ficar parado numa placa, encostar e atacar (teclado, controle e toque).
// Atenção: importa events.js e events3.js (circular): nada daqui roda no topo do módulo, só dentro das funções.
import * as THREE from 'three';
import { G } from './state.js';
import { L } from './i18n.js';
import { rr, ri, pick, shuffle } from './utils.js';
import { glowMat, box } from './models.js';
import { burst, ringFx, floatText, lineTelegraph } from './fx.js';
import { sfx } from './audio.js';
import { banner } from './ui.js';
import { mats, put, groupAt, lightMat, setLight, flatMat, near, waitFoes, findSpot, complete, failed, eventHurt, hitTarget, dropTarget } from './events.js';
import { tag, setTag, bot, face, hitsOn, sphere } from './events3.js';

// ------------------------------------------------------------------
// Peças compartilhadas
// ------------------------------------------------------------------
const TAU = Math.PI * 2;
const TRIES = 5;
// sorteios durante o jogo (o setup usa a semente do andar: rr/ri/pick/shuffle)
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rpick = (a) => a[Math.floor(Math.random() * a.length)];
function mshuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
// contrato padrão: eventos prontos/falhos ficam parados; ao carregar um andar salvo só o fim é restaurado
function mk(def) {
  return {
    ...def,
    update(E, dt) {
      if (E.st === 'done' || E.st === 'failed') return;
      def.update(E, dt);
    },
    save: def.save || (() => ({})),
    load(E, s) {
      if (s.st === 'done' || s.st === 'failed') {
        E.st = s.st;
        if (def.dim) def.dim(E);
      } else if (def.reload) def.reload(E, s);
    },
  };
}
// tabuleiros girados 45°: assim o x local é a direita da tela e o z local é para baixo (a câmera olha de +x +z)
const RC = Math.SQRT1_2;
function scrGroup(s) {
  const g = groupAt(s.x, s.z);
  g.rotation.y = Math.PI / 4;
  return g;
}
// posição do jogador no sistema do evento (girado ou não)
function loc(E) {
  const p = G.player;
  const dx = p.x - E.x;
  const dz = p.z - E.z;
  return E.rot ? [dx * RC - dz * RC, dx * RC + dz * RC] : [dx, dz];
}
function toW(E, lx, lz) {
  return E.rot ? { x: E.x + (lx + lz) * RC, z: E.z + (lz - lx) * RC } : { x: E.x + lx, z: E.z + lz };
}
const say = (E, text, kind = 'up', lx = 0, lz = 0) => {
  const w = toW(E, lx, lz);
  floatText(w.x, 2.4, w.z, text, kind);
};
// placa retangular de pisar (borda acesa + recheio translúcido)
function plate(g, x, z, w, h, color, k = 0.6) {
  const ring = lightMat(color, k);
  put(g, box(w, 0.04, h), ring, x, 0.03, z);
  const fill = flatMat(color, 0.12);
  put(g, box(w - 0.16, 0.03, h - 0.16), fill, x, 0.05, z);
  return { x, z, w, h, color, ring, fill };
}
function plateAt(E, list, pad = 0.15) {
  const p = G.player;
  if (!p || !p.alive) return -1;
  const [lx, lz] = loc(E);
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (q && Math.abs(lx - q.x) < q.w / 2 - pad && Math.abs(lz - q.z) < q.h / 2 - pad) return i;
  }
  return -1;
}
// placa escolhida ao ficar parado nela um instante (passar por cima não conta); dispara uma vez por visita
function dwell(E, list, dt, need = 0.4) {
  const k = plateAt(E, list);
  if (k !== E.dk) {
    if (E.dk >= 0 && list[E.dk]) list[E.dk].fill.opacity = 0.12;
    E.dk = k;
    E.dw = 0;
    E.fired = false;
  }
  if (k < 0 || E.fired) return -1;
  E.dw += dt;
  const q = list[k];
  q.fill.opacity = 0.12 + Math.min(1, E.dw / need) * 0.45;
  if (E.dw < need) return -1;
  E.fired = true;
  q.fill.opacity = 0.12;
  return k;
}
// fora da hora de escolher: só acompanha em que placa o jogador está (quem já está numa placa precisa sair e voltar)
function dwellHold(E, list) {
  const k = plateAt(E, list);
  if (k === E.dk) return;
  if (E.dk >= 0 && list[E.dk]) list[E.dk].fill.opacity = 0.12;
  E.dk = k;
  E.dw = 0;
  E.fired = k >= 0;
}
const inBox = (E, hx, hz, m = 0) => {
  const p = G.player;
  if (!p || !p.alive) return false;
  const [lx, lz] = loc(E);
  return Math.abs(lx) < hx + m && Math.abs(lz) < hz + m;
};
// joga o jogador de volta para um ponto local do evento (caiu, foi visto...)
function sendTo(E, lx, lz) {
  const p = G.player;
  const w = toW(E, lx, lz);
  p.x = w.x;
  p.z = w.z;
  p.kx = 0;
  p.kz = 0;
  if (p.path) p.path = null;
}
// texto com a resposta: placa de 3 opções com rótulo (devolve as placas e os rótulos)
function choicePlates(g, n, color, gap, z, w = 1.4, h = 1.4) {
  const plates = [];
  const labels = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap;
    plates.push(plate(g, x, z, w, h, color));
    labels.push(tag(g, '?', 0xffffff, x, 0.85, z, 0.9, 2));
  }
  return { plates, labels };
}
const lit = (list, color, k = 0.6) => list.forEach((q) => setLight(q.ring, color, k));
// painel de texto com quebra de linha (frases longas: instruções, perguntas)
function note(parent, text, color, x, y, z, w = 4.4, lines = 3) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64 * lines;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(w, (w * c.height) / c.width, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 6;
  sp.userData.c = c;
  parent.add(sp);
  setNote(sp, text, color);
  return sp;
}
function setNote(sp, text, color = 0xffffff) {
  if (sp.userData.key === text + color) return;
  sp.userData.key = text + color;
  const c = sp.userData.c;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const max = Math.floor(c.height / 64);
  let fs = 40;
  let rows;
  // diminui a letra até caber nas linhas
  for (;;) {
    g.font = `bold ${fs}px sans-serif`;
    rows = [];
    for (const par of String(text).split('\n')) {
      let cur = '';
      for (const w of par.split(' ')) {
        const t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width > c.width - 16 && cur) {
          rows.push(cur);
          cur = w;
        } else cur = t;
      }
      rows.push(cur);
    }
    if ((rows.length * fs * 1.15 <= c.height && rows.every((r) => g.measureText(r).width <= c.width - 8)) || fs <= 18) break;
    fs -= 3;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = '#000';
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  const h = fs * 1.15;
  const y0 = c.height / 2 - ((rows.length - 1) * h) / 2;
  rows.forEach((r, i) => {
    g.strokeText(r, c.width / 2, y0 + i * h);
    g.fillText(r, c.width / 2, y0 + i * h);
  });
  sp.material.map.needsUpdate = true;
}
const HIDE_M = new THREE.Matrix4().makeScale(0, 0, 0);
let cylGeo = null;
const cyl = () => cylGeo || (cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14));

// ==================================================================
// 91. Acerte a Toupeira: toupeiras saem dos buracos; acerte (ou encoste) antes que se escondam. Bombas não!
// ==================================================================
const WH_COL = 0xffb347;
const WH_NEED = 12;
const whack = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(WH_COL, 0.8), 0, 0.03, 0, 2.6, 1, 2.6);
    const furMat = new THREE.MeshLambertMaterial({ color: 0x9a6a44 });
    const holes = [];
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const x = i * 1.55;
        const z = j * 1.55;
        put(g, mats().disc, mats().dark, x, 0.03, z, 0.48, 1, 0.48);
        const ring = lightMat(WH_COL, 0.5);
        put(g, mats().ring, ring, x, 0.04, z, 0.52, 1, 0.52);
        const mole = new THREE.Group();
        put(mole, sphere(), furMat, 0, 0.32, 0, 0.3, 0.36, 0.3);
        const eye = lightMat(0xffffff, 1.6);
        put(mole, box(0.07, 0.07, 0.04), eye, -0.1, 0.48, 0.27);
        put(mole, box(0.07, 0.07, 0.04), eye, 0.1, 0.48, 0.27);
        const nose = lightMat(0xff6a8a, 1.8);
        put(mole, sphere(), nose, 0, 0.38, 0.3, 0.06, 0.05, 0.05);
        mole.position.set(x, -0.8, z);
        mole.visible = false;
        g.add(mole);
        holes.push({ x, z, ring, mole, eye, nose, fur: furMat, e: hitTarget(s.x + x, s.z + z, 0.42, 0.9, L('Toupeira', 'Mole')), hits: 0, up: 0, y: -0.8, bomb: false });
      }
    return { kind: 'whack', x: s.x, z: s.z, g, holes, st: 'idle', ok: 0, miss: 0, t: 0, upT: Math.max(0.95, 1.6 - floor * 0.012), bombs: floor >= 8 };
  },
  update(E, dt) {
    for (const h of E.holes) {
      const n = hitsOn(h);
      if (h.up <= 0 && h.lit) {
        h.lit = false;
        setLight(h.ring, WH_COL, 0.5);
      }
      h.y += ((h.up > 0 ? 0 : -0.8) - h.y) * Math.min(1, dt * 14);
      h.mole.position.y = h.y;
      h.mole.visible = h.y > -0.75;
      if (E.st !== 'run' || h.up <= 0) continue;
      if (n > 0) {
        h.up = 0;
        if (h.bomb) {
          E.miss++;
          eventHurt(0.05, E.x + h.x, E.z + h.z, 6);
          burst(E.x + h.x, 0.6, E.z + h.z, 0xff3355, 22, 6, 0.08, 0.5, { up: 2 });
          say(E, L(`BOMBA! (${E.miss}/${TRIES})`, `BOMB! (${E.miss}/${TRIES})`), 'hurt', h.x, h.z);
          sfx.explode();
        } else {
          E.ok++;
          sfx.punch();
          burst(E.x + h.x, 0.6, E.z + h.z, WH_COL, 14, 4, 0.07, 0.4, { up: 1.5 });
          say(E, `${E.ok}/${WH_NEED}`, 'crit', h.x, h.z);
        }
        continue;
      }
      h.up -= dt;
      if (h.up <= 0 && !h.bomb) {
        E.miss++;
        sfx.deny();
        say(E, L(`FUGIU! (${E.miss}/${TRIES})`, `GOT AWAY! (${E.miss}/${TRIES})`), 'hurt', h.x, h.z);
      }
    }
    if (E.st === 'idle') {
      if (!near(E, 3.4)) return;
      E.st = 'run';
      E.t = 1.2;
      banner(L('ACERTE A TOUPEIRA!', 'WHACK-A-MOLE!'), L('Golpeie ou encoste nas toupeiras antes que se escondam', 'Hit or touch the moles before they hide'));
      return;
    }
    if (E.ok >= WH_NEED) {
      whack.dim(E);
      complete(E, 1.3 - E.miss * 0.05, L('TOUPEIRAS NO BURACO!', 'MOLES WHACKED!'), L(`${E.ok} acertos`, `${E.ok} hits`), E.x, E.z);
      return;
    }
    if (E.miss >= TRIES) {
      whack.dim(E);
      failed(E, L('As toupeiras escaparam.', 'The moles got away.'));
      return;
    }
    E.t -= dt;
    if (E.t > 0 || E.holes.filter((h) => h.up > 0).length >= 2) return;
    const free = E.holes.filter((h) => h.up <= 0 && h.y < -0.6);
    if (!free.length) return;
    const h = rpick(free);
    h.bomb = E.bombs && Math.random() < 0.2;
    h.up = h.bomb ? E.upT * 1.3 : E.upT;
    setLight(h.eye, h.bomb ? 0xff2244 : 0xffffff, 1.8);
    h.mole.children[0].material = h.bomb ? mats().dark : h.fur;
    h.lit = true;
    setLight(h.nose, h.bomb ? 0xff2244 : 0xff6a8a, 2.2);
    setLight(h.ring, h.bomb ? 0xff2244 : 0x39ff88, 1.2);
    E.t = 0.35 + Math.random() * 0.6;
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'enter the circle') : `${E.ok}/${WH_NEED} 🐹 · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    for (const h of E.holes) {
      dropTarget(h);
      h.mole.visible = false;
      h.up = 0;
    }
  },
  reload(E) {
    for (const h of E.holes) {
      h.e.hp = h.e.maxHp;
      h.hits = 0;
    }
  },
  intro: () => L(`toupeiras saem dos buracos por um instante: golpeie ou encoste nelas antes que se escondam. ${WH_NEED} acertos; as de olho vermelho são bombas (não bata!). ${TRIES} erros e acabou.`, `moles pop out of the holes for a moment: hit or touch them before they hide. ${WH_NEED} hits; the red-eyed ones are bombs (do not hit!). ${TRIES} mistakes and it is over.`),
});

// ==================================================================
// 92. Minigolfe: o golpe tacada a bola na direção do golpe; a força é a barra que sobe e desce. Até 5 tacadas
// ==================================================================
const GF_COL = 0x39ff88;
const GF_HX = 1.7;
const GF_HZ = 4.2;
const GF_BARS = [
  { z: 1.2, x0: -GF_HX, x1: 0.5 },
  { z: -1.1, x0: -0.5, x1: GF_HX },
];
const golf = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1.9, 4.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(GF_HX * 2, 0.02, GF_HZ * 2), flatMat(0x2a8a3a, 0.45), 0, 0.025, 0);
    const rail = lightMat(GF_COL, 1.1);
    put(g, box(0.1, 0.22, GF_HZ * 2), rail, -GF_HX, 0.11, 0);
    put(g, box(0.1, 0.22, GF_HZ * 2), rail, GF_HX, 0.11, 0);
    put(g, box(GF_HX * 2, 0.22, 0.1), rail, 0, 0.11, -GF_HZ);
    put(g, box(GF_HX * 2, 0.22, 0.1), rail, 0, 0.11, GF_HZ);
    for (const b of GF_BARS) put(g, box(b.x1 - b.x0, 0.3, 0.16), lightMat(0xff4df0, 1.2), (b.x0 + b.x1) / 2, 0.15, b.z);
    put(g, mats().disc, mats().dark, 0, 0.035, -3.3, 0.3, 1, 0.3);
    const flag = new THREE.Group();
    put(flag, box(0.04, 1.2, 0.04), mats().metal, 0, 0.6, 0);
    put(flag, box(0.36, 0.22, 0.03), lightMat(0xff3355, 1.8), 0.18, 1.08, 0);
    flag.position.set(0, 0, -3.3);
    g.add(flag);
    put(g, mats().ring, lightMat(0xffffff, 1.2), 0, 0.04, 3.3, 0.35, 1, 0.35);
    const ball = put(g, sphere(), glowMat(0xffffff, 1.8), 0, 0.18, 3.3, 0.18, 0.18, 0.18);
    const pow = tag(g, '', 0x39ff88, 0, 1.2, 3.3, 0.6, 3);
    const e = hitTarget(s.x, s.z + 3.3, 0.3, 0.5, L('Bola de Golfe', 'Golf Ball'));
    return { kind: 'golf', x: s.x, z: s.z, g, ball, pow, e, hits: 0, st: 'idle', bx: 0, bz: 3.3, vx: 0, vz: 0, strokes: 0, max: 6, t: 0 };
  },
  update(E, dt) {
    const n = hitsOn(E);
    E.e.x = E.x + E.bx;
    E.e.z = E.z + E.bz;
    if (E.st === 'idle') {
      if (!near(E, 4.6)) return;
      E.st = 'run';
      banner(L('MINIGOLFE!', 'MINI GOLF!'), L('Golpeie a bola quando a barra de força estiver boa', 'Hit the ball when the power bar looks right'));
    }
    const sp = Math.hypot(E.vx, E.vz);
    E.t += dt;
    if (sp < 0.12) {
      E.vx = E.vz = 0;
      // barra de força sobe e desce enquanto a bola está parada
      const pw = 0.5 - 0.5 * Math.cos(E.t * 2.6);
      const k = Math.round(pw * 8);
      setTag(E.pow, '▮'.repeat(k) + '▯'.repeat(8 - k), pw > 0.75 ? 0xff3355 : pw > 0.4 ? 0xffd23d : 0x39ff88);
      E.pow.position.set(E.bx, 1.2, E.bz);
      E.pow.visible = true;
      if (E.strokes >= E.max) {
        dropTarget(E);
        E.pow.visible = false;
        failed(E, L(`A bola não entrou em ${E.max} tacadas.`, `The ball did not go in after ${E.max} strokes.`));
        return;
      }
      if (!n) return;
      const p = G.player;
      const dx = E.x + E.bx - p.x;
      const dz = E.z + E.bz - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const v = 2.2 + pw * 8;
      E.vx = (dx / l) * v;
      E.vz = (dz / l) * v;
      E.strokes++;
      E.pow.visible = false;
      sfx.punch();
      return;
    }
    // rola: atrito, bordas e barreiras
    const dec = Math.max(0, sp - 3.2 * dt) / sp;
    E.vx *= dec;
    E.vz *= dec;
    const pz = E.bz;
    E.bx += E.vx * dt;
    E.bz += E.vz * dt;
    const r = 0.18;
    if (Math.abs(E.bx) > GF_HX - r) {
      E.bx = Math.sign(E.bx) * (GF_HX - r);
      E.vx = -E.vx * 0.8;
      sfx.click();
    }
    if (Math.abs(E.bz) > GF_HZ - r) {
      E.bz = Math.sign(E.bz) * (GF_HZ - r);
      E.vz = -E.vz * 0.8;
      sfx.click();
    }
    for (const b of GF_BARS) {
      if (E.bx < b.x0 - r || E.bx > b.x1 + r || Math.abs(E.bz - b.z) > r + 0.08) continue;
      E.bz = b.z + (pz >= b.z ? 1 : -1) * (r + 0.09);
      E.vz = -E.vz * 0.8;
      sfx.click();
    }
    E.ball.position.set(E.bx, 0.18, E.bz);
    const dh = Math.hypot(E.bx, E.bz + 3.3);
    if (dh < 0.3) {
      if (sp > 6.5) {
        // rápida demais: passa raspando
        E.vx += (Math.random() - 0.5) * 2;
        return;
      }
      dropTarget(E);
      E.ball.visible = false;
      sfx.coin();
      const par = E.strokes <= 3;
      complete(E, par ? 1.6 : 1.2, E.strokes === 1 ? L('HOLE IN ONE!', 'HOLE IN ONE!') : L('NA CAÇAPA!', 'IN THE HOLE!'), L(`${E.strokes} tacadas`, `${E.strokes} strokes`), E.x, E.z - 3.3, { extra: E.strokes <= 2 });
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no campo', 'reach the course') : `${E.strokes}/${E.max} ${L('tacadas', 'strokes')}`),
  dim(E) {
    dropTarget(E);
    E.ball.visible = false;
    E.pow.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('golpeie (ou encoste em) a bola branca: ela vai na direção contrária a você, com a força da barra que sobe e desce em cima dela (verde fraca, vermelha forte). Acerte o buraco da bandeira em até 6 tacadas; as paredes rosa rebatem.', 'hit (or touch) the white ball: it goes away from you, with the strength of the bar that rises and falls above it (green soft, red strong). Sink it in the flag hole in up to 6 strokes; the pink walls bounce it.'),
});

// ==================================================================
// 93. Come-Come: coma todas as pastilhas da arena fugindo de 2 fantasmas. A pastilha grande deixa eles azuis
// ==================================================================
const PC_COL = 0xffd23d;
const PC_H = 3.2;
const PC_GHOST = [0xff3355, 0x3dc7ff];
const pac = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, PC_H + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const edge = lightMat(0x3d6bff, 1.4);
    put(g, box(PC_H * 2, 0.05, 0.1), edge, 0, 0.04, -PC_H);
    put(g, box(PC_H * 2, 0.05, 0.1), edge, 0, 0.04, PC_H);
    put(g, box(0.1, 0.05, PC_H * 2), edge, -PC_H, 0.04, 0);
    put(g, box(0.1, 0.05, PC_H * 2), edge, PC_H, 0.04, 0);
    const dots = [];
    for (let j = 0; j < 7; j++)
      for (let i = 0; i < 7; i++) {
        if ((i === 3 && j === 3) || ((i === 2 || i === 4) && (j === 2 || j === 4))) continue;
        const big = (i === 0 || i === 6) && (j === 0 || j === 6);
        dots.push({ x: (i - 3) * 0.95, z: (j - 3) * 0.95, big, got: false });
      }
    const im = new THREE.InstancedMesh(sphere(), glowMat(PC_COL, 2), dots.length);
    const m4 = new THREE.Matrix4();
    dots.forEach((q, k) => im.setMatrixAt(k, m4.makeScale(q.big ? 0.2 : 0.08, q.big ? 0.2 : 0.08, q.big ? 0.2 : 0.08).setPosition(q.x, 0.3, q.z)));
    g.add(im);
    const ghosts = PC_GHOST.map((c, i) => {
      const m = new THREE.Group();
      const mat = glowMat(c, 1.6);
      put(m, sphere(), mat, 0, 0.6, 0, 0.36, 0.36, 0.36);
      put(m, cyl(), mat, 0, 0.38, 0, 0.36, 0.45, 0.36);
      const eye = lightMat(0xffffff, 1.5);
      put(m, box(0.1, 0.12, 0.04), eye, -0.12, 0.66, 0.33);
      put(m, box(0.1, 0.12, 0.04), eye, 0.12, 0.66, 0.33);
      m.position.set(0, 0, 0);
      g.add(m);
      return { m, mat, c, x: i ? 0.5 : -0.5, z: 0, home: 0, t: 0 };
    });
    return { kind: 'pac', x: s.x, z: s.z, g, im, dots, ghosts, st: 'idle', lives: TRIES, scare: 0, hitCd: 0, sp: Math.min(3.1, 2.3 + floor * 0.015) };
  },
  update(E, dt) {
    const [lx, lz] = loc(E);
    const inside = inBox(E, PC_H, PC_H);
    if (E.st === 'idle') {
      if (!inside) return;
      E.st = 'run';
      banner(L('COME-COME!', 'MUNCHER!'), L('Coma todas as pastilhas e fuja dos fantasmas', 'Eat every pellet and run from the ghosts'));
      return;
    }
    E.scare = Math.max(0, E.scare - dt);
    E.hitCd = Math.max(0, E.hitCd - dt);
    // pastilhas
    if (inside) {
      for (let k = 0; k < E.dots.length; k++) {
        const q = E.dots[k];
        if (q.got || Math.hypot(lx - q.x, lz - q.z) > (q.big ? 0.55 : 0.42)) continue;
        q.got = true;
        E.im.setMatrixAt(k, HIDE_M);
        E.im.instanceMatrix.needsUpdate = true;
        if (q.big) {
          E.scare = 6;
          sfx.upgrade();
          say(E, L('FANTASMAS COM MEDO!', 'GHOSTS SCARED!'), 'crit');
        } else sfx.click();
      }
    }
    const left = E.dots.filter((q) => !q.got).length;
    if (!left) {
      pac.dim(E);
      complete(E, 1.2 + E.lives * 0.06, L('COMEU TUDO!', 'ALL EATEN!'), L(`${E.dots.length} pastilhas`, `${E.dots.length} pellets`), E.x, E.z);
      return;
    }
    // fantasmas: um vai atrás de você, o outro tenta cortar caminho pela frente
    const p = G.player;
    const ax = p.ivx || 0;
    const az = p.ivz || 0;
    E.ghosts.forEach((o, i) => {
      if (o.home > 0) {
        o.home -= dt;
        o.m.visible = Math.floor(o.home * 6) % 2 === 0;
        if (o.home <= 0) o.m.visible = true;
        return;
      }
      let tx = inside ? lx + (i ? ax * 0.6 : 0) : 0;
      let tz = inside ? lz + (i ? az * 0.6 : 0) : 0;
      if (E.scare > 0) {
        tx = o.x - (lx - o.x);
        tz = o.z - (lz - o.z);
      }
      const dx = tx - o.x;
      const dz = tz - o.z;
      const l = Math.hypot(dx, dz) || 1;
      const v = E.scare > 0 ? E.sp * 0.6 : E.sp;
      o.x = Math.max(-PC_H + 0.3, Math.min(PC_H - 0.3, o.x + (dx / l) * v * dt));
      o.z = Math.max(-PC_H + 0.3, Math.min(PC_H - 0.3, o.z + (dz / l) * v * dt));
      o.m.position.set(o.x, Math.sin(G.t * 6 + i) * 0.06, o.z);
      o.m.rotation.y = Math.atan2(dx, dz);
      setLight(o.mat, E.scare > 0 ? (E.scare < 1.5 && Math.floor(E.scare * 6) % 2 ? 0xffffff : 0x3344ff) : o.c, 1.6);
      if (!inside || Math.hypot(lx - o.x, lz - o.z) > 0.6) return;
      if (E.scare > 0) {
        o.x = i ? 0.5 : -0.5;
        o.z = 0;
        o.home = 3;
        sfx.coin();
        say(E, L('NHAC!', 'CHOMP!'), 'crit', o.x, o.z);
        return;
      }
      if (E.hitCd > 0) return;
      E.hitCd = 1.5;
      E.lives--;
      eventHurt(0.06, E.x + o.x, E.z + o.z, 9);
      say(E, L(`PEGO! ♥${E.lives}`, `CAUGHT! ♥${E.lives}`), 'hurt');
      for (const q of E.ghosts) {
        q.home = 1.5;
        q.x = (q === E.ghosts[0] ? -0.5 : 0.5);
        q.z = 0;
      }
      if (E.lives <= 0) {
        pac.dim(E);
        failed(E, L('Os fantasmas pegaram você.', 'The ghosts got you.'));
      }
    });
  },
  hud: (E) => (E.st === 'idle' ? L('entre na arena', 'enter the arena') : `${E.dots.filter((q) => q.got).length}/${E.dots.length} · ♥${E.lives}${E.scare > 0 ? ' · 👻💙' : ''}`),
  dim(E) {
    for (const o of E.ghosts) o.m.visible = false;
    E.im.visible = false;
  },
  intro: () => L(`entre na arena e coma todas as pastilhas amarelas. Dois fantasmas perseguem você; as 4 pastilhas grandes dos cantos deixam eles azuis por uns segundos (aí você pode comê-los). ${TRIES} vidas.`, `step into the arena and eat every yellow pellet. Two ghosts chase you; the 4 big pellets in the corners turn them blue for a few seconds (then you can eat them). ${TRIES} lives.`),
});

// ==================================================================
// 94. Corte o Fio: leia a instrução e fique parado na placa do fio certo. 3 bombas
// ==================================================================
const WR_COL = 0xff5a2d;
const WR_COLORS = () => [
  [0xff3355, L('vermelho', 'red')],
  [0x3d8bff, L('azul', 'blue')],
  [0x39ff88, L('verde', 'green')],
  [0xffd23d, L('amarelo', 'yellow')],
  [0xffffff, L('branco', 'white')],
];
const WR_N = 4;
const WR_TIME = 25;
const wires = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4, 3.4);
    if (!s) return null;
    const g = scrGroup(s);
    put(g, box(1.2, 0.8, 0.9), mats().metal, 0, 0.4, -1.8);
    const lamp = lightMat(0xff3355, 1.5);
    put(g, sphere(), lamp, 0, 0.95, -1.8, 0.16, 0.16, 0.16);
    const clue = note(g, '?', 0xffffff, 0, 1.75, -1.2, 4.6, 2);
    const timer = tag(g, '', 0xffd23d, 0, 1.55, -1.8, 0.6, 2);
    const plates = [];
    const wireM = [];
    for (let i = 0; i < WR_N; i++) {
      const x = (i - (WR_N - 1) / 2) * 1.35;
      const q = plate(g, x, 1.1, 1.1, 1.1, 0xffffff, 0.5);
      tag(g, String(i + 1), 0xffffff, x, 0.6, 1.1, 0.7);
      const m = lightMat(0xffffff, 1.4);
      const ax = x * 0.25;
      const dx = x - ax;
      put(g, box(0.09, 0.06, Math.hypot(dx, 1.9)), m, (ax + x) / 2, 0.06, -0.4, 1, 1, 1).rotation.y = Math.atan2(dx, 1.9);
      wireM.push(m);
      plates.push(q);
    }
    return { kind: 'wires', x: s.x, z: s.z, rot: true, g, lamp, clue, timer, plates, wireM, st: 'idle', bombs: 0, miss: 0, cols: [], right: 0, t: 0, phase: 'q' };
  },
  ask(E) {
    const C = WR_COLORS();
    const f = G.floor;
    const kinds = E.bombs === 0 ? ['color', 'pos'] : f >= 12 ? ['not', 'after', 'before', 'not', 'count'] : ['not', 'after', 'before'];
    const kind = rpick(kinds);
    let cols;
    let right;
    let text;
    const pickCols = (n, uniq) => {
      const idx = mshuffle([0, 1, 2, 3, 4]);
      const out = [];
      for (let i = 0; i < n; i++) out.push(uniq ? idx[i] : idx[Math.floor(Math.random() * 3)]);
      return out;
    };
    if (kind === 'count') {
      // dois fios da mesma cor: corte o último deles
      cols = pickCols(WR_N, true);
      const a = rint(0, 2);
      const b = rint(a + 1, 3);
      cols[b] = cols[a];
      right = b;
      text = L(`Corte o ÚLTIMO fio ${C[cols[a]][1]}`, `Cut the LAST ${C[cols[a]][1]} wire`);
    } else {
      cols = pickCols(WR_N, true);
      if (kind === 'color') {
        right = rint(0, WR_N - 1);
        text = L(`Corte o fio ${C[cols[right]][1]}`, `Cut the ${C[cols[right]][1]} wire`);
      } else if (kind === 'pos') {
        right = rint(0, WR_N - 1);
        text = L(`Corte o fio número ${right + 1}`, `Cut wire number ${right + 1}`);
      } else if (kind === 'not') {
        right = rint(0, WR_N - 1);
        const others = cols.filter((c, i) => i !== right).map((c) => C[c][1]);
        text = L(`Corte o fio que NÃO é ${others[0]}, ${others[1]} nem ${others[2]}`, `Cut the wire that is NOT ${others[0]}, ${others[1]} or ${others[2]}`);
      } else if (kind === 'after') {
        const a = rint(0, WR_N - 2);
        right = a + 1;
        text = L(`Corte o fio de número seguinte ao ${C[cols[a]][1]}`, `Cut the wire numbered right after the ${C[cols[a]][1]} one`);
      } else {
        const a = rint(1, WR_N - 1);
        right = a - 1;
        text = L(`Corte o fio de número anterior ao ${C[cols[a]][1]}`, `Cut the wire numbered right before the ${C[cols[a]][1]} one`);
      }
    }
    E.cols = cols;
    E.right = right;
    E.text = text;
    cols.forEach((c, i) => {
      setLight(E.wireM[i], C[c][0], 1.4);
      setLight(E.plates[i].ring, C[c][0], 0.7);
    });
    setNote(E.clue, text, 0xffffff);
    E.t = WR_TIME;
    E.phase = 'q';
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('CORTE O FIO!', 'CUT THE WIRE!'), L('Leia a instrução e fique parado na placa do fio certo', 'Read the clue and stand still on the right wire plate'));
      wires.ask(E);
      return;
    }
    setLight(E.lamp, Math.floor(G.t * (E.t < 8 ? 6 : 2)) % 2 ? 0xff3355 : 0x330a10, 2);
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) wires.ask(E);
      return;
    }
    E.t -= dt;
    setTag(E.timer, `${Math.max(0, Math.ceil(E.t))}s`, E.t < 8 ? 0xff3355 : 0xffd23d);
    const k = dwell(E, E.plates, dt, 0.5);
    if (k < 0 && E.t > 0) return;
    E.phase = 'res';
    const ok = k === E.right;
    if (ok) {
      E.bombs++;
      sfx.coin();
      setLight(E.wireM[k], 0x222222, 0.3);
      say(E, L(`DESARMADA! (${E.bombs}/3)`, `DEFUSED! (${E.bombs}/3)`), 'crit', 0, -1.8);
      E.t = 1.4;
    } else {
      E.miss++;
      const w = toW(E, 0, -1.8);
      eventHurt(0.05, w.x, w.z, 5);
      burst(w.x, 0.8, w.z, 0xff7a1a, 26, 6, 0.09, 0.5, { up: 2.5 });
      sfx.explode();
      say(E, k < 0 ? L(`O TEMPO ACABOU! (${E.miss}/${TRIES})`, `TIME UP! (${E.miss}/${TRIES})`) : L(`BUM! ERA O ${E.right + 1} (${E.miss}/${TRIES})`, `BOOM! IT WAS ${E.right + 1} (${E.miss}/${TRIES})`), 'hurt', 0, -1.8);
      setLight(E.plates[E.right].ring, 0x39ff88, 2.6);
      E.t = 2.2;
    }
    if (E.bombs >= 3) {
      setTag(E.timer, '', 0xffffff);
      complete(E, 1.4 - E.miss * 0.06, L('ESQUADRÃO ANTIBOMBA!', 'BOMB SQUAD!'), L('3 bombas desarmadas', '3 bombs defused'), E.x, E.z);
    } else if (E.miss >= TRIES) failed(E, L('Bombas demais explodiram.', 'Too many bombs went off.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na bomba', 'reach the bomb') : `${E.bombs}/3 💣 · ${E.miss}/${TRIES} ✖${E.phase === 'q' ? ` · ${Math.ceil(E.t)}s` : ''}`),
  dim(E) {
    setNote(E.clue, E.st === 'done' ? '✔' : '✖', 0xffffff);
    setTag(E.timer, '', 0xffffff);
  },
  intro: () => L(`uma bomba com 4 fios numerados. Leia a instrução em cima dela e fique parado um instante na placa do fio certo. Desarme 3 bombas; cada uma tem ${WR_TIME}s. ${TRIES} erros e acabou.`, `a bomb with 4 numbered wires. Read the clue above it and stand still for a moment on the right wire's plate. Defuse 3 bombs; each one has ${WR_TIME}s. ${TRIES} mistakes and it is over.`),
});

// ==================================================================
// 95. Qual é a Sombra?: a tela mostra uma silhueta; fique na placa do objeto certo. 5 acertos
// ==================================================================
const SH_COL = 0x9ad7ff;
const SH_SET = ['🐘', '🦒', '🐇', '🦀', '🐢', '🦋', '🐌', '🦖', '🐙', '🐝', '🦅', '🐪', '🎸', '✂️', '🔑', '🚲', '⚓', '🍄', '🌵', '🏰', '🐈', '🦜', '🍐', '☂️', '🎺', '🐳', '🦔', '🐓'];
const SH_NEED = 5;
// sprite com a silhueta preta de um emoji (contorno neon)
function shadowSprite(parent, x, y, z, s) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(s, s, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 6;
  sp.userData.c = c;
  parent.add(sp);
  return sp;
}
function drawShadow(sp, emoji) {
  const c = sp.userData.c;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(20,30,60,0.85)';
  g.fillRect(4, 4, 120, 120);
  g.strokeStyle = '#9ad7ff';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 120, 120);
  if (emoji) {
    const t = document.createElement('canvas');
    t.width = t.height = 128;
    const h = t.getContext('2d');
    h.font = '84px sans-serif';
    h.textAlign = 'center';
    h.textBaseline = 'middle';
    h.fillText(emoji, 64, 70);
    h.globalCompositeOperation = 'source-in';
    h.fillStyle = '#05060a';
    h.fillRect(0, 0, 128, 128);
    g.shadowColor = '#9ad7ff';
    g.shadowBlur = 10;
    g.drawImage(t, 0, 0);
    g.shadowBlur = 0;
  }
  sp.material.map.needsUpdate = true;
}
const shadow = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3, 2.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(1.6, 0.1, 0.3), mats().metal, 0, 0.05, -1.3);
    const screen = shadowSprite(g, 0, 2.3, -1.3, 1.9);
    drawShadow(screen, null);
    const { plates, labels } = choicePlates(g, 3, SH_COL, 2, 1, 1.5, 1.5);
    labels.forEach((t) => t.scale.set(1.1, 1.1 / 2, 1));
    return { kind: 'shadow', x: s.x, z: s.z, g, screen, plates, labels, st: 'idle', ok: 0, miss: 0, right: 0, phase: 'q', t: 0 };
  },
  ask(E) {
    const opts = mshuffle(SH_SET.slice()).slice(0, 3);
    E.right = rint(0, 2);
    E.ans = opts[E.right];
    drawShadow(E.screen, E.ans);
    opts.forEach((o, i) => setTag(E.labels[i], o, 0xffffff));
    lit(E.plates, SH_COL);
    E.phase = 'q';
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('QUAL É A SOMBRA?', 'WHOSE SHADOW?'), L('Fique parado na placa do objeto da silhueta', 'Stand still on the plate of the silhouette'));
      shadow.ask(E);
      return;
    }
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) shadow.ask(E);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.45);
    if (k < 0) return;
    E.phase = 'res';
    E.t = 1.2;
    setLight(E.plates[E.right].ring, 0x39ff88, 2.6);
    if (k === E.right) {
      E.ok++;
      sfx.coin();
      say(E, L('ACERTOU!', 'RIGHT!'), 'crit');
    } else {
      E.miss++;
      sfx.deny();
      setLight(E.plates[k].ring, 0xff3355, 2.6);
      say(E, L(`ERA ${E.ans} (${E.miss}/${TRIES})`, `IT WAS ${E.ans} (${E.miss}/${TRIES})`), 'hurt');
    }
    if (E.ok >= SH_NEED) complete(E, 1.15, L('OLHO CLÍNICO!', 'SHARP EYE!'), L(`${E.ok} sombras`, `${E.ok} shadows`), E.x, E.z);
    else if (E.miss >= TRIES) failed(E, L('Sombras demais confundidas.', 'Too many shadows mixed up.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na tela', 'reach the screen') : `${E.ok}/${SH_NEED} ✔ · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    drawShadow(E.screen, null);
    for (const t of E.labels) t.visible = false;
  },
  intro: () => L(`a tela mostra a sombra de alguma coisa. Fique parado um instante na placa do objeto que faz essa sombra. ${SH_NEED} acertos; ${TRIES} erros e acabou.`, `the screen shows the shadow of something. Stand still for a moment on the plate of the object that casts it. ${SH_NEED} right; ${TRIES} wrong and it is over.`),
});

// ==================================================================
// 96. Contagem: drones de 3 cores voam por uns segundos; conte os da cor pedida. 4 acertos
// ==================================================================
const CN_COL = 0xc77bff;
const CN_COLORS = () => [
  [0xff3355, L('VERMELHOS', 'RED')],
  [0x39ff88, L('VERDES', 'GREEN')],
  [0x3dc7ff, L('AZUIS', 'BLUE')],
];
const CN_MAX = 16;
const CN_NEED = 4;
const count = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.2, 3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(CN_COL, 0.8), 0, 0.03, -0.6, 2.4, 1, 2.4);
    const drones = [];
    for (let i = 0; i < CN_MAX; i++) {
      const mat = glowMat(0xffffff, 2);
      const m = put(g, mats().oct, mat, 0, 1.5, 0, 0.2, 0.2, 0.2);
      m.visible = false;
      drones.push({ m, mat, a: 0, b: 0, w: 0, ph: 0 });
    }
    const board = tag(g, '?', 0xffffff, 0, 2.8, -0.6, 0.9, 6);
    const { plates, labels } = choicePlates(g, 3, CN_COL, 1.9, 2.2, 1.4, 1.4);
    return { kind: 'count', x: s.x, z: s.z, g, drones, board, plates, labels, st: 'idle', ok: 0, miss: 0, phase: 'wait', t: 0, ans: 0, right: 0 };
  },
  fly(E) {
    const f = G.floor;
    const n = Math.min(CN_MAX, 8 + Math.floor(f / 6) + rint(0, 3));
    E.ci = rint(0, 2);
    const cols = [];
    for (let i = 0; i < n; i++) cols.push(rint(0, 2));
    E.ans = cols.filter((c) => c === E.ci).length;
    if (!E.ans) {
      cols[0] = E.ci;
      E.ans = 1;
    }
    const C = CN_COLORS();
    E.drones.forEach((o, i) => {
      o.m.visible = i < n;
      if (i >= n) return;
      setLight(o.mat, C[cols[i]][0], 2);
      o.a = 0.8 + Math.random() * 1.6;
      o.b = 0.8 + Math.random() * 1.6;
      o.w = 0.5 + Math.random() * 0.9;
      o.ph = Math.random() * TAU;
    });
    E.phase = 'fly';
    E.t = Math.max(4.5, 6.5 - f * 0.04);
    E.flyT = E.t;
    setTag(E.board, L('CONTE!', 'COUNT!'), 0xffffff);
    for (const t of E.labels) setTag(t, '?', 0xffffff);
    lit(E.plates, CN_COL);
  },
  ask(E) {
    const C = CN_COLORS();
    E.phase = 'q';
    for (const o of E.drones) o.m.visible = false;
    const opts = [E.ans];
    while (opts.length < 3) {
      const v = E.ans + (Math.random() < 0.5 ? -1 : 1) * rint(1, 2);
      if (v >= 0 && !opts.includes(v)) opts.push(v);
    }
    mshuffle(opts);
    E.right = opts.indexOf(E.ans);
    opts.forEach((v, i) => setTag(E.labels[i], String(v), 0xffffff));
    setTag(E.board, L(`Quantos ${C[E.ci][1]}?`, `How many ${C[E.ci][1]}?`), C[E.ci][0]);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.8)) return;
      E.st = 'run';
      banner(L('CONTAGEM!', 'HEADCOUNT!'), L('Conte os drones de cada cor', 'Count the drones of each color'));
      E.phase = 'wait';
      E.t = 0.8;
      return;
    }
    if (E.phase === 'wait') {
      dwellHold(E, E.plates);
      if (waitFoes(E)) return;
      E.t -= dt;
      if (E.t <= 0) count.fly(E);
      return;
    }
    if (E.phase === 'fly') {
      dwellHold(E, E.plates);
      if (waitFoes(E)) {
        // briga no meio: recomeça a revoada quando a área limpar
        for (const o of E.drones) o.m.visible = false;
        E.phase = 'wait';
        E.t = 0.6;
        return;
      }
      E.t -= dt;
      const tt = E.flyT - E.t;
      for (const o of E.drones) {
        if (!o.m.visible) continue;
        o.m.position.set(Math.sin(tt * o.w + o.ph) * o.a * 1.4, 1.1 + Math.sin(tt * o.w * 1.7 + o.ph) * 0.5, -0.6 + Math.cos(tt * o.w * 1.3 + o.ph * 2) * o.b);
        o.m.rotation.y += dt * 3;
      }
      if (E.t <= 0) count.ask(E);
      return;
    }
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) {
        E.phase = 'wait';
        E.t = 0.4;
      }
      return;
    }
    const k = dwell(E, E.plates, dt, 0.45);
    if (k < 0) return;
    E.phase = 'res';
    E.t = 1.3;
    setLight(E.plates[E.right].ring, 0x39ff88, 2.6);
    if (k === E.right) {
      E.ok++;
      sfx.coin();
      say(E, L('CERTO!', 'RIGHT!'), 'crit');
    } else {
      E.miss++;
      sfx.deny();
      setLight(E.plates[k].ring, 0xff3355, 2.6);
      say(E, L(`ERAM ${E.ans} (${E.miss}/${TRIES})`, `IT WAS ${E.ans} (${E.miss}/${TRIES})`), 'hurt');
    }
    if (E.ok >= CN_NEED) complete(E, 1.3, L('CONTADOR NATO!', 'BORN COUNTER!'), L(`${E.ok} contagens`, `${E.ok} counts`), E.x, E.z);
    else if (E.miss >= TRIES) failed(E, L('A conta não bateu vezes demais.', 'The count was off too many times.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no círculo', 'reach the circle') : `${E.ok}/${CN_NEED} ✔ · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    for (const o of E.drones) o.m.visible = false;
    for (const t of E.labels) t.visible = false;
    setTag(E.board, E.st === 'done' ? '✔' : '✖', 0xffffff);
  },
  intro: () => L(`drones de 3 cores voam no círculo por alguns segundos (só com a área sem inimigos). Depois a tela pergunta quantos havia de uma cor: fique parado na placa com o número. ${CN_NEED} acertos; ${TRIES} erros e acabou.`, `drones of 3 colors fly in the circle for a few seconds (only with no enemies around). Then the screen asks how many there were of one color: stand still on the plate with the number. ${CN_NEED} right; ${TRIES} wrong and it is over.`),
});

// ==================================================================
// 97. Verdadeiro ou Falso: leia a frase e fique na placa V ou F. 6 acertos
// ==================================================================
const TF_COL = 0x5affd2;
const TF_NEED = 6;
// [frase, verdadeira?]
const TF_FACTS = () => [
  [L('A luz do Sol leva cerca de 8 minutos para chegar à Terra', 'Sunlight takes about 8 minutes to reach Earth'), true],
  [L('O polvo tem três corações', 'An octopus has three hearts'), true],
  [L('Os morcegos são mamíferos', 'Bats are mammals'), true],
  [L('Vênus é o planeta mais quente do Sistema Solar', 'Venus is the hottest planet in the Solar System'), true],
  [L('O mel pode durar milhares de anos sem estragar', 'Honey can last thousands of years without spoiling'), true],
  [L('Os tubarões existem há mais tempo que as árvores', 'Sharks have existed longer than trees'), true],
  [L('Um dia em Vênus é mais longo que um ano em Vênus', 'A day on Venus is longer than a year on Venus'), true],
  [L('A água ferve a uma temperatura mais baixa no alto das montanhas', 'Water boils at a lower temperature high on mountains'), true],
  [L('O coração humano tem quatro cavidades', 'The human heart has four chambers'), true],
  [L('O diamante é feito de carbono', 'Diamond is made of carbon'), true],
  [L('As abelhas se comunicam dançando', 'Bees communicate by dancing'), true],
  [L('Um ano bissexto tem 366 dias', 'A leap year has 366 days'), true],
  [L('O som não se propaga no vácuo', 'Sound does not travel in a vacuum'), true],
  [L('A girafa tem 7 vértebras no pescoço, como nós', 'A giraffe has 7 neck vertebrae, like us'), true],
  [L('Os golfinhos dormem com metade do cérebro de cada vez', 'Dolphins sleep with half of their brain at a time'), true],
  [L('O Oceano Pacífico é o maior oceano da Terra', 'The Pacific is the largest ocean on Earth'), true],
  [L('Nos cavalos-marinhos, é o macho que carrega os filhotes', 'In seahorses, the male carries the young'), true],
  [L('Um raio é mais quente que a superfície do Sol', 'A lightning bolt is hotter than the surface of the Sun'), true],
  [L('Os flamingos ficam rosa por causa do que comem', 'Flamingos turn pink because of what they eat'), true],
  [L('Júpiter é o maior planeta do Sistema Solar', 'Jupiter is the largest planet in the Solar System'), true],
  [L('A Grande Muralha da China é visível da Lua a olho nu', 'The Great Wall of China is visible from the Moon with the naked eye'), false],
  [L('Raios nunca caem duas vezes no mesmo lugar', 'Lightning never strikes the same place twice'), false],
  [L('O Sol é um planeta', 'The Sun is a planet'), false],
  [L('Os morcegos são cegos', 'Bats are blind'), false],
  [L('Usamos só 10% do cérebro', 'We only use 10% of our brain'), false],
  [L('Marte é o maior planeta do Sistema Solar', 'Mars is the largest planet in the Solar System'), false],
  [L('As aranhas são insetos', 'Spiders are insects'), false],
  [L('Os camelos guardam água nas corcovas', 'Camels store water in their humps'), false],
  [L('A Lua tem luz própria', 'The Moon makes its own light'), false],
  [L('Avestruzes enterram a cabeça na areia quando têm medo', 'Ostriches bury their heads in the sand when scared'), false],
  [L('O vidro é feito principalmente de ferro', 'Glass is made mostly of iron'), false],
  [L('As baleias são peixes', 'Whales are fish'), false],
  [L('Um triângulo pode ter dois ângulos retos', 'A triangle can have two right angles'), false],
  [L('O sangue nas nossas veias é azul', 'The blood in our veins is blue'), false],
  [L('Os polvos têm dez braços', 'Octopuses have ten arms'), false],
  [L('O panda-gigante come principalmente carne', 'Giant pandas eat mostly meat'), false],
  [L('O tomate, para a botânica, não é um fruto', 'Botanically, a tomato is not a fruit'), false],
  [L('Os peixes-dourados só lembram das coisas por 3 segundos', 'Goldfish only remember things for 3 seconds'), false],
  [L('A Antártida é o lugar mais quente da Terra', 'Antarctica is the hottest place on Earth'), false],
  [L('Uma semana tem 8 dias', 'A week has 8 days'), false],
];
const truth = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.6, 2.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const board = note(g, '?', 0xffffff, 0, 1.6, -0.2, 4.6, 3);
    const plates = [plate(g, -1.3, 0.9, 1.7, 1.7, 0x39ff88), plate(g, 1.3, 0.9, 1.7, 1.7, 0xff3355)];
    tag(g, L('V', 'T'), 0x39ff88, -1.3, 0.9, 0.9, 1.1);
    tag(g, 'F', 0xff3355, 1.3, 0.9, 0.9, 1.1);
    tag(g, L('verdade', 'true'), 0xffffff, -1.3, 0.35, 0.9, 0.5, 3);
    tag(g, L('falso', 'false'), 0xffffff, 1.3, 0.35, 0.9, 0.5, 3);
    return { kind: 'truth', x: s.x, z: s.z, g, board, plates, st: 'idle', ok: 0, miss: 0, phase: 'q', t: 0, used: [], ans: true };
  },
  ask(E) {
    const all = TF_FACTS();
    let i = rint(0, all.length - 1);
    for (let t = 0; t < 20 && E.used.includes(i); t++) i = rint(0, all.length - 1);
    E.used.push(i);
    const [txt, v] = all[i];
    E.ans = v;
    setNote(E.board, `${txt}?`, 0xffffff);
    setLight(E.plates[0].ring, 0x39ff88, 0.6);
    setLight(E.plates[1].ring, 0xff3355, 0.6);
    E.phase = 'q';
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.4)) return;
      E.st = 'run';
      banner(L('VERDADEIRO OU FALSO?', 'TRUE OR FALSE?'), L('Leia a frase e fique parado na placa V ou F', 'Read the sentence and stand still on T or F'));
      truth.ask(E);
      return;
    }
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) truth.ask(E);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.5);
    if (k < 0) return;
    E.phase = 'res';
    E.t = 1.6;
    const right = E.ans ? 0 : 1;
    setLight(E.plates[right].ring, 0xffffff, 2.6);
    if (k === right) {
      E.ok++;
      sfx.coin();
      say(E, L('CORRETO!', 'CORRECT!'), 'crit');
    } else {
      E.miss++;
      sfx.deny();
      say(E, E.ans ? L(`É VERDADE! (${E.miss}/${TRIES})`, `IT IS TRUE! (${E.miss}/${TRIES})`) : L(`É FALSO! (${E.miss}/${TRIES})`, `IT IS FALSE! (${E.miss}/${TRIES})`), 'hurt');
    }
    if (E.ok >= TF_NEED) complete(E, 1.2, L('SABE-TUDO!', 'KNOW-IT-ALL!'), L(`${E.ok} acertos`, `${E.ok} right`), E.x, E.z);
    else if (E.miss >= TRIES) failed(E, L('Respostas erradas demais.', 'Too many wrong answers.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no painel', 'reach the panel') : `${E.ok}/${TF_NEED} ✔ · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    setNote(E.board, E.st === 'done' ? '✔' : '✖', 0xffffff);
  },
  intro: () => L(`leia a frase no painel e fique parado um instante na placa V (verdade) ou F (falso). ${TF_NEED} acertos; ${TRIES} erros e acabou.`, `read the sentence on the panel and stand still for a moment on T (true) or F (false). ${TF_NEED} right; ${TRIES} wrong and it is over.`),
});

// ==================================================================
// 98. Torre de Hanói: leve os discos para o pino da direita; disco grande nunca em cima de pequeno
// ==================================================================
const HN_COL = 0xffb347;
const HN_DISC = [0xff3355, 0xffd23d, 0x39ff88, 0x3dc7ff];
const hanoi = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6, 3.6);
    if (!s) return null;
    const g = scrGroup(s);
    const n = floor >= 18 ? 4 : 3;
    const plates = [];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 2;
      plates.push(plate(g, x, 0, 1.7, 1.7, i === 2 ? 0x39ff88 : HN_COL));
      put(g, cyl(), mats().metal, x, 0.7, -0.55, 0.06, 1.4, 0.06);
    }
    tag(g, L('DESTINO', 'GOAL'), 0x39ff88, 2, 0.35, 0.65, 0.45, 3.2);
    const discs = [];
    for (let k = 0; k < n; k++) {
      const r = 0.62 - k * 0.12;
      const m = put(g, cyl(), glowMat(HN_DISC[k], 1.4), -2, 0, -0.55, r, 0.16, r);
      discs.push({ m, size: n - k });
    }
    const pegs = [discs.slice(), [], []];
    const opt = (1 << n) - 1;
    const E = { kind: 'hanoi', x: s.x, z: s.z, rot: true, g, plates, discs, pegs, n, st: 'idle', hold: null, moves: 0, opt, max: opt + 12 };
    hanoi.draw(E);
    return E;
  },
  draw(E) {
    E.pegs.forEach((list, i) =>
      list.forEach((dc, h) => {
        dc.m.position.set((i - 1) * 2, 0.12 + h * 0.18, -0.55);
      })
    );
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('TORRE DE HANÓI!', 'TOWER OF HANOI!'), L('Leve os discos ao pino verde; grande nunca sobre pequeno', 'Move the discs to the green peg; never big on small'));
    }
    if (E.hold) {
      const [lx, lz] = loc(E);
      E.hold.m.position.set(lx, 2.3 + Math.sin(G.t * 4) * 0.08, lz);
    }
    const k = dwell(E, E.plates, dt, 0.4);
    if (k < 0) return;
    const peg = E.pegs[k];
    if (!E.hold) {
      if (!peg.length) {
        say(E, L('VAZIO', 'EMPTY'), 'info', (k - 1) * 2, 0);
        return;
      }
      E.hold = peg.pop();
      E.from = k;
      sfx.pickup();
      return;
    }
    const top = peg[peg.length - 1];
    if (top && top.size < E.hold.size) {
      sfx.deny();
      say(E, L('GRANDE SOBRE PEQUENO NÃO!', 'NOT BIG ON SMALL!'), 'hurt', (k - 1) * 2, 0);
      return;
    }
    peg.push(E.hold);
    E.hold = null;
    if (k !== E.from) E.moves++;
    sfx.click();
    hanoi.draw(E);
    if (E.pegs[2].length === E.n) {
      const best = E.moves <= E.opt;
      complete(E, best ? 1.8 : 1.3, best ? L('PERFEITO!', 'PERFECT!') : L('TORRE MUDADA!', 'TOWER MOVED!'), L(`${E.moves} movimentos (mínimo ${E.opt})`, `${E.moves} moves (minimum ${E.opt})`), E.x, E.z, { extra: best });
      return;
    }
    if (E.moves >= E.max) failed(E, L(`Passou de ${E.max} movimentos.`, `Went over ${E.max} moves.`));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nos pinos', 'reach the pegs') : `${E.moves}/${E.max} ${L('mov.', 'moves')}${E.hold ? ' · ✋' : ''}`),
  dim(E) {
    if (E.st === 'done') {
      E.pegs = [[], [], E.discs.slice()];
      hanoi.draw(E);
    }
  },
  intro: (E) => L(`fique parado num pino para pegar o disco de cima e em outro pino para soltar. Leve todos os ${E.n} discos para o pino verde da direita; um disco nunca fica em cima de um menor. Até ${E.max} movimentos (o mínimo é ${E.opt}).`, `stand still on a peg to pick up its top disc and on another peg to drop it. Move all ${E.n} discs to the green peg on the right; a disc never goes on a smaller one. Up to ${E.max} moves (the minimum is ${E.opt}).`),
});

// ==================================================================
// 99. Quebra-cabeça Deslizante: fique parado numa peça vizinha do buraco para ela deslizar. Ordene de 1 a 8
// ==================================================================
const SL_COL = 0x3dc7ff;
const SL_S = 1.3;
const slCell = (c) => [((c % 3) - 1) * SL_S, (Math.floor(c / 3) - 1) * SL_S];
const slAdj = (a, b) => Math.abs((a % 3) - (b % 3)) + Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) === 1;
const slide = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3, 3);
    if (!s) return null;
    const g = scrGroup(s);
    put(g, box(SL_S * 3 + 0.3, 0.03, SL_S * 3 + 0.3), mats().dark, 0, 0.02, 0);
    const edge = lightMat(SL_COL, 1);
    const hw = (SL_S * 3) / 2 + 0.15;
    put(g, box(hw * 2, 0.05, 0.08), edge, 0, 0.04, -hw);
    put(g, box(hw * 2, 0.05, 0.08), edge, 0, 0.04, hw);
    put(g, box(0.08, 0.05, hw * 2), edge, -hw, 0.04, 0);
    put(g, box(0.08, 0.05, hw * 2), edge, hw, 0.04, 0);
    // embaralha a partir do resolvido (sempre tem solução)
    const board = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    let gap = 8;
    let prev = -1;
    for (let t = 0; t < 46 || board.every((v, i) => v === (i + 1) % 9); t++) {
      const opts = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => slAdj(c, gap) && c !== prev);
      const c = opts[ri(0, opts.length - 1)];
      board[gap] = board[c];
      board[c] = 0;
      prev = gap;
      gap = c;
    }
    const tiles = {};
    for (let n = 1; n <= 8; n++) {
      const m = new THREE.Group();
      put(m, box(SL_S - 0.12, 0.14, SL_S - 0.12), new THREE.MeshLambertMaterial({ color: 0x1c2a44 }), 0, 0.07, 0);
      const ring = lightMat(SL_COL, 0.9);
      put(m, mats().ring, ring, 0, 0.15, 0, 0.5, 1, 0.5);
      tag(m, String(n), 0xffffff, 0, 0.55, 0, 0.8);
      g.add(m);
      tiles[n] = { m, ring, x: 0, z: 0 };
    }
    const cells = [];
    for (let c = 0; c < 9; c++) {
      const [x, z] = slCell(c);
      cells.push({ x, z, w: SL_S, h: SL_S, fill: { opacity: 0 } });
    }
    ['1 2 3', '4 5 6', '7 8 ·'].forEach((t, i) => tag(g, t, 0x9ad7ff, hw + 1.2, 1.6 - i * 0.45, 0.3, 0.5, 2.6));
    const E = { kind: 'slide', x: s.x, z: s.z, rot: true, g, tiles, cells, board, st: 'idle', moves: 0 };
    slide.place(E, true);
    return E;
  },
  place(E, snap) {
    E.board.forEach((n, c) => {
      if (!n) return;
      const t = E.tiles[n];
      const [x, z] = slCell(c);
      t.tx = x;
      t.tz = z;
      if (snap) t.m.position.set(x, 0, z);
      setLight(t.ring, n === c + 1 ? 0x39ff88 : SL_COL, n === c + 1 ? 1.4 : 0.9);
    });
  },
  update(E, dt) {
    for (const n in E.tiles) {
      const t = E.tiles[n];
      if (t.tx == null) continue;
      t.m.position.x += (t.tx - t.m.position.x) * Math.min(1, dt * 12);
      t.m.position.z += (t.tz - t.m.position.z) * Math.min(1, dt * 12);
    }
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('QUEBRA-CABEÇA DESLIZANTE!', 'SLIDING PUZZLE!'), L('Pare numa peça ao lado do buraco para ela deslizar', 'Stand on a tile next to the hole to slide it'));
    }
    const k = dwell(E, E.cells, dt, 0.35);
    if (k < 0) return;
    const gap = E.board.indexOf(0);
    if (!E.board[k]) return;
    if (!slAdj(k, gap)) {
      say(E, L('SÓ AS VIZINHAS DO BURACO', 'ONLY NEXT TO THE HOLE'), 'info');
      return;
    }
    E.board[gap] = E.board[k];
    E.board[k] = 0;
    E.moves++;
    sfx.click();
    slide.place(E);
    if (E.board.every((v, i) => v === (i + 1) % 9)) {
      complete(E, E.moves <= 40 ? 1.6 : 1.25, L('QUEBRA-CABEÇA MONTADO!', 'PUZZLE SOLVED!'), L(`${E.moves} movimentos`, `${E.moves} moves`), E.x, E.z, { extra: E.moves <= 40 });
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no quadro', 'reach the board') : `${E.board.filter((v, i) => v && v === i + 1).length}/8 ✔ · ${E.moves} ${L('mov.', 'moves')}`),
  intro: () => L('fique parado um instante numa peça ao lado do buraco: ela desliza para ele. Deixe as peças em ordem, de 1 a 8, lendo da esquerda para a direita e de cima para baixo (o quadrinho ao lado mostra o objetivo). As peças no lugar certo acendem em verde.', 'stand still for a moment on a tile next to the hole: it slides into it. Put the tiles in order from 1 to 8, reading left to right and top to bottom (the little chart beside it shows the goal). Tiles in the right spot glow green.'),
});

// ==================================================================
// 100. Senha Secreta: descubra a senha de 3 cores. ● cor certa no lugar certo, ○ cor certa no lugar errado
// ==================================================================
const CD_COLS = [0xff3355, 0x39ff88, 0x3d8bff, 0xffd23d, 0xc77bff];
const CD_ICON = ['🟥', '🟩', '🟦', '🟨', '🟪'];
const code = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6, 3.6);
    if (!s) return null;
    const g = scrGroup(s);
    const plates = CD_COLS.map((c, i) => plate(g, (i - 2) * 1.2, 1.3, 1, 1, c, 0.9));
    put(g, box(2, 1.2, 0.3), mats().metal, 0, 0.6, -1.6);
    const lamp = lightMat(0xff3355, 1.6);
    put(g, box(1.6, 0.12, 0.05), lamp, 0, 1.05, -1.44);
    const cur = tag(g, '_ _ _', 0xffffff, 0, 1.6, 0.2, 0.75, 4);
    const log = note(g, '', 0xffffff, 0, 2.9, -1.6, 3.2, 4);
    const max = floor >= 15 ? 7 : 8;
    return { kind: 'code', x: s.x, z: s.z, rot: true, g, plates, lamp, cur, log, st: 'idle', secret: [], guess: [], hist: [], max, t: 0 };
  },
  show(E) {
    setTag(E.cur, [0, 1, 2].map((i) => (E.guess[i] != null ? CD_ICON[E.guess[i]] : '_')).join(' '), 0xffffff);
    setNote(E.log, E.hist.slice(-4).join('\n') || L('● lugar certo  ○ cor certa', '● right spot  ○ right color'), 0xffffff);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      E.secret = mshuffle([0, 1, 2, 3, 4]).slice(0, 3);
      banner(L('SENHA SECRETA!', 'SECRET CODE!'), L('Descubra as 3 cores da senha, na ordem', 'Find the 3 colors of the code, in order'));
      code.show(E);
      return;
    }
    if (E.t > 0) {
      E.t -= dt;
      dwellHold(E, E.plates);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.4);
    if (k < 0) return;
    E.guess.push(k);
    sfx.seq(k % 4);
    if (E.guess.length < 3) {
      code.show(E);
      return;
    }
    let exact = 0;
    let part = 0;
    E.guess.forEach((c, i) => {
      if (E.secret[i] === c) exact++;
      else if (E.secret.includes(c)) part++;
    });
    E.hist.push(`${E.guess.map((c) => CD_ICON[c]).join('')}  ${'●'.repeat(exact)}${'○'.repeat(part)}${exact + part ? '' : '—'}`);
    E.guess = [];
    E.t = 0.6;
    code.show(E);
    if (exact === 3) {
      setLight(E.lamp, 0x39ff88, 2.4);
      complete(E, 1.2 + (E.max - E.hist.length) * 0.08, L('SENHA ACEITA!', 'CODE ACCEPTED!'), L(`${E.hist.length} tentativas`, `${E.hist.length} tries`), E.x, E.z, { extra: E.hist.length <= 4 });
      return;
    }
    sfx.deny();
    if (E.hist.length >= E.max) {
      setTag(E.cur, E.secret.map((c) => CD_ICON[c]).join(' '), 0xffffff);
      failed(E, L('A senha bloqueou.', 'The lock shut down.'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no cofre', 'reach the lock') : `${E.hist.length}/${E.max} ${L('tent.', 'tries')} · ${E.guess.length}/3`),
  dim(E) {
    setLight(E.lamp, E.st === 'done' ? 0x39ff88 : 0x333344, 1.4);
  },
  intro: (E) => L(`a senha tem 3 cores diferentes, em ordem. Fique parado nas placas para escolher 3 cores; o painel responde ● para cada cor no lugar certo e ○ para cada cor certa no lugar errado. Descubra em até ${E.max} tentativas.`, `the code is 3 different colors, in order. Stand still on the plates to pick 3 colors; the panel answers ● for each right color in the right spot and ○ for each right color in the wrong spot. Crack it in up to ${E.max} tries.`),
});

// ==================================================================
// 101. Jogo dos Palitos: tirem 1, 2 ou 3 palitos por vez; quem tirar o último perde
// ==================================================================
const NM_COL = 0xffd23d;
const NM_GAMES = 3;
const nim = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6, 3.6);
    if (!s) return null;
    const g = scrGroup(s);
    const sticks = [];
    for (let i = 0; i < 18; i++) {
      const m = put(g, box(0.1, 0.9, 0.1), glowMat(NM_COL, 1.6), (i - 8.5) * 0.3, 0.45, -1.1);
      sticks.push(m);
    }
    const plates = [0, 1, 2].map((i) => plate(g, (i - 1) * 1.7, 1.4, 1.3, 1.3, NM_COL));
    [0, 1, 2].forEach((i) => tag(g, `−${i + 1}`, 0xffffff, (i - 1) * 1.7, 0.8, 1.4, 0.8, 2));
    const b = bot(g, 0xff4df0, 0, -2.6, 1);
    const turn = tag(g, '', 0xffffff, 0, 2.2, -1.1, 0.7, 6);
    return { kind: 'nim', x: s.x, z: s.z, rot: true, g, sticks, plates, b, turn, st: 'idle', n: 0, who: 0, t: 0, lost: 0, smart: Math.min(0.85, 0.5 + floor * 0.008) };
  },
  game(E) {
    E.n = rpick([14, 15, 16, 18]);
    E.who = 0;
    E.t = 0;
    nim.paint(E);
  },
  paint(E) {
    E.sticks.forEach((m, i) => (m.visible = i < E.n));
    setTag(E.turn, E.who ? L('vez do robô...', "robot's turn...") : L(`sua vez · ${E.n} palitos`, `your turn · ${E.n} sticks`), E.who ? 0xff4df0 : 0x39ff88);
  },
  take(E, k, who) {
    k = Math.min(k, E.n);
    for (let i = E.n - k; i < E.n; i++) {
      const w = toW(E, (i - 8.5) * 0.3, -1.1);
      burst(w.x, 0.9, w.z, NM_COL, 6, 2, 0.05, 0.4, { up: 1 });
    }
    E.n -= k;
    say(E, who ? L(`ROBÔ TIROU ${k}`, `ROBOT TOOK ${k}`) : L(`VOCÊ TIROU ${k}`, `YOU TOOK ${k}`), 'info', 0, -1.1);
    sfx.click();
    if (E.n > 0) {
      E.who = 1 - who;
      E.t = 1.4;
      nim.paint(E);
      return;
    }
    // quem tirou o último perdeu
    nim.paint(E);
    if (who) {
      setLight(E.b.eye, 0x333344, 1);
      complete(E, 1.35 - E.lost * 0.1, L('VOCÊ VENCEU O ROBÔ!', 'YOU BEAT THE ROBOT!'), L('ele ficou com o último palito', 'it took the last stick'), E.x, E.z);
      return;
    }
    E.lost++;
    sfx.deny();
    say(E, L(`VOCÊ PEGOU O ÚLTIMO! (${E.lost}/${NM_GAMES})`, `YOU TOOK THE LAST ONE! (${E.lost}/${NM_GAMES})`), 'hurt');
    if (E.lost >= NM_GAMES) {
      failed(E, L('O robô venceu o jogo dos palitos.', 'The robot won the stick game.'));
      return;
    }
    E.t = 2;
    E.restart = true;
  },
  update(E, dt) {
    face(E.b, 0, 0);
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('JOGO DOS PALITOS!', 'STICK GAME!'), L('Tire 1, 2 ou 3; quem tirar o último perde', 'Take 1, 2 or 3; whoever takes the last one loses'));
      nim.game(E);
      return;
    }
    if (E.t > 0) {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t > 0) return;
      if (E.restart) {
        E.restart = false;
        nim.game(E);
        return;
      }
    }
    if (E.who === 1) {
      // robô: às vezes joga certo (deixa 1 + múltiplo de 4), às vezes chuta
      const best = (E.n - 1) % 4;
      const k = best && Math.random() < E.smart ? best : rint(1, Math.min(3, E.n));
      E.b.m.position.y = 0.2;
      nim.take(E, k, 1);
      E.b.m.position.y = 0;
      return;
    }
    const k = dwell(E, E.plates, dt, 0.45);
    if (k >= 0) nim.take(E, k + 1, 0);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nos palitos', 'reach the sticks') : `${E.n} ${L('palitos', 'sticks')} · ${E.who ? '🤖' : L('sua vez', 'your turn')} · ${E.lost}/${NM_GAMES} ✖`),
  dim(E) {
    for (const m of E.sticks) m.visible = false;
    setTag(E.turn, E.st === 'done' ? '🏆' : '✖', 0xffffff);
  },
  intro: () => L(`uma fileira de palitos e um robô. Na sua vez, fique parado na placa −1, −2 ou −3 para tirar palitos; depois o robô tira. Quem tirar o ÚLTIMO palito perde. Dica: tente deixar 1, 5, 9 ou 13 para ele. Você pode perder ${NM_GAMES - 1} partidas.`, `sticks and a robot. On your turn, stand still on the −1, −2 or −3 plate to take sticks; then the robot takes some. Whoever takes the LAST stick loses. Tip: try to leave it 1, 5, 9 or 13. You can lose ${NM_GAMES - 1} games.`),
});

// ==================================================================
// 102. Dardos: a mira passeia pelo alvo; bata no lançador para jogar o dardo onde ela está. 120 pontos em 8 dardos
// ==================================================================
const DT_COL = 0xff4df0;
const DT_RINGS = [
  [0.32, 50, 0xff3355],
  [0.85, 25, 0x39ff88],
  [1.4, 10, 0x3dc7ff],
  [2, 5, 0xffd23d],
];
const darts = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.4, 3.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    for (let i = DT_RINGS.length - 1; i >= 0; i--) {
      const [r, , c] = DT_RINGS[i];
      put(g, mats().disc, flatMat(c, 0.28), 0, 0.03 + (3 - i) * 0.004, -0.6, r, 1, r);
      put(g, mats().ring, lightMat(c, 1.2), 0, 0.05, -0.6, r, 1, r);
    }
    const aim = new THREE.Group();
    const am = lightMat(0xffffff, 2.4);
    put(aim, mats().ring, am, 0, 0.08, 0, 0.22, 1, 0.22);
    put(aim, box(0.5, 0.03, 0.04), am, 0, 0.08, 0);
    put(aim, box(0.04, 0.03, 0.5), am, 0, 0.08, 0);
    aim.position.set(0, 0, -0.6);
    g.add(aim);
    put(g, box(0.6, 0.8, 0.5), mats().metal, 0, 0.4, 2.7);
    put(g, mats().cyl, glowMat(DT_COL, 2.2), 0, 0.85, 2.7, 0.25, 0.1, 0.25);
    put(g, mats().ring, lightMat(DT_COL, 1), 0, 0.03, 2.7, 0.9, 1, 0.9);
    const e = hitTarget(s.x, s.z + 2.7, 0.45, 1, L('Lançador', 'Launcher'));
    const darts = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Group();
      put(m, box(0.05, 0.5, 0.05), mats().metal, 0, 0.25, 0);
      put(m, mats().oct, glowMat(DT_COL, 2), 0, 0.5, 0, 0.08, 0.12, 0.08);
      m.visible = false;
      g.add(m);
      darts.push(m);
    }
    const need = floor >= 15 ? 140 : 120;
    return { kind: 'darts', x: s.x, z: s.z, g, aim, e, hits: 0, darts, st: 'idle', left: 8, score: 0, need, t: 0, sp: Math.min(1.5, 1 + floor * 0.01), cd: 0 };
  },
  update(E, dt) {
    const n = hitsOn(E);
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('DARDOS NEON!', 'NEON DARTS!'), L('Bata no lançador quando a mira estiver no meio', 'Hit the launcher when the aim is in the middle'));
    }
    E.t += dt * E.sp;
    const ax = Math.sin(E.t * 1.7) * 2.1;
    const az = -0.6 + Math.sin(E.t * 2.3 + 1.3) * 2.1;
    E.aim.position.set(ax, 0, az);
    E.cd = Math.max(0, E.cd - dt);
    if (!n || E.cd > 0 || E.left <= 0) return;
    E.cd = 0.6;
    const m = E.darts[8 - E.left];
    m.position.set(ax, 0, az);
    m.visible = true;
    E.left--;
    const r = Math.hypot(ax, az + 0.6);
    const ring = DT_RINGS.find((q) => r <= q[0]);
    const pts = ring ? ring[1] : 0;
    E.score += pts;
    sfx[pts >= 25 ? 'coin' : pts ? 'click' : 'deny']();
    floatText(E.x + ax, 1.4, E.z + az, pts ? `+${pts}` : L('fora!', 'miss!'), pts >= 25 ? 'crit' : pts ? 'up' : 'hurt');
    if (E.score >= E.need) {
      dropTarget(E);
      E.aim.visible = false;
      complete(E, 1.2 + E.left * 0.08, L('NA MOSCA!', 'BULLSEYE!'), L(`${E.score} pontos`, `${E.score} points`), E.x, E.z, { extra: E.left >= 3 });
    } else if (E.left <= 0) {
      dropTarget(E);
      E.aim.visible = false;
      failed(E, L(`Só ${E.score} de ${E.need} pontos.`, `Only ${E.score} of ${E.need} points.`));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no alvo', 'reach the board') : `${E.score}/${E.need} ${L('pts', 'pts')} · ${E.left} 🏹`),
  dim(E) {
    dropTarget(E);
    E.aim.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: (E) => L(`a mira branca passeia pelo alvo. Golpeie (ou encoste em) o lançador rosa para jogar um dardo onde ela está: centro 50, verde 25, azul 10, amarelo 5. Faça ${E.need} pontos com 8 dardos.`, `the white aim wanders over the board. Hit (or touch) the pink launcher to throw a dart where it is: center 50, green 25, blue 10, yellow 5. Score ${E.need} points with 8 darts.`),
});

// ==================================================================
// 103. Máquina de Garra: um golpe para a garra no eixo X, outro no eixo Z; ela desce e tenta pegar um bicho
// ==================================================================
const CR_COL = 0xff8ad8;
const CR_H = 1.5;
const CR_PRIZE = [0xff6a8a, 0x7affc8, 0xffd23d, 0x9ad7ff, 0xc77bff, 0xffa24d];
const crane = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.4, 3.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const glass = flatMat(0x9ad7ff, 0.08);
    put(g, box(CR_H * 2, 2.6, CR_H * 2), glass, 0, 1.3, -0.4);
    const edge = lightMat(CR_COL, 1.2);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, box(0.08, 2.6, 0.08), edge, x * CR_H, 1.3, -0.4 + z * CR_H);
    put(g, box(CR_H * 2, 0.08, CR_H * 2), mats().metal, 0, 2.62, -0.4);
    // saída dos prêmios
    put(g, box(0.7, 0.5, 0.7), mats().dark, CR_H + 0.55, 0.25, 0.6);
    put(g, mats().ring, lightMat(0x39ff88, 1.2), CR_H + 0.55, 0.52, 0.6, 0.35, 1, 0.35);
    const prizes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: CR_PRIZE[i], emissive: new THREE.Color(CR_PRIZE[i]).multiplyScalar(0.25) });
      put(m, sphere(), mat, 0, 0.22, 0, 0.22, 0.22, 0.22);
      put(m, sphere(), mat, 0, 0.5, 0, 0.15, 0.15, 0.15);
      put(m, sphere(), mat, -0.1, 0.62, 0, 0.06, 0.06, 0.06);
      put(m, sphere(), mat, 0.1, 0.62, 0, 0.06, 0.06, 0.06);
      const x = rr(-1.05, 1.05);
      const z = -0.4 + rr(-1.05, 1.05);
      m.position.set(x, 0, z);
      g.add(m);
      prizes.push({ m, x, z, got: false });
    }
    const claw = new THREE.Group();
    put(claw, box(0.04, 1, 0.04), mats().metal, 0, 0.5, 0);
    const cm = glowMat(CR_COL, 1.8);
    for (let k = 0; k < 3; k++) {
      const f = put(claw, box(0.05, 0.3, 0.05), cm, Math.cos((k * TAU) / 3) * 0.14, -0.1, Math.sin((k * TAU) / 3) * 0.14);
      f.rotation.z = Math.cos((k * TAU) / 3) * 0.5;
      f.rotation.x = -Math.sin((k * TAU) / 3) * 0.5;
    }
    claw.position.set(-1.2, 2.2, -1.6);
    g.add(claw);
    put(g, box(0.6, 0.8, 0.5), mats().metal, 0, 0.4, 1.9);
    const btn = lightMat(0xff3355, 2);
    put(g, mats().cyl, btn, 0, 0.85, 1.9, 0.22, 0.1, 0.22);
    put(g, mats().ring, lightMat(CR_COL, 1), 0, 0.03, 1.9, 0.9, 1, 0.9);
    const e = hitTarget(s.x, s.z + 1.9, 0.45, 1, L('Botão da Garra', 'Claw Button'));
    return { kind: 'crane', x: s.x, z: s.z, g, prizes, claw, btn, e, hits: 0, st: 'idle', phase: 'x', cx: -1.2, cz: -1.6, cy: 2.2, t: 0, coins: 6, got: 0, hold: null, dir: 1 };
  },
  update(E, dt) {
    const n = hitsOn(E);
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('MÁQUINA DE GARRA!', 'CLAW MACHINE!'), L('Um golpe para no X, outro no Z, e a garra desce', 'One hit stops X, another stops Z, then the claw drops'));
    }
    const sp = 1.25;
    const lo = -CR_H + 0.3;
    const hi = CR_H - 0.3;
    if (E.phase === 'x' || E.phase === 'z') {
      setLight(E.btn, Math.floor(G.t * 3) % 2 ? 0xff3355 : 0x661020, 2);
      if (E.phase === 'x') {
        E.cx += E.dir * sp * dt;
        if (E.cx > hi || E.cx < lo) {
          E.cx = Math.max(lo, Math.min(hi, E.cx));
          E.dir = -E.dir;
        }
      } else {
        E.cz += E.dir * sp * dt;
        if (E.cz > -0.4 + hi || E.cz < -0.4 + lo) {
          E.cz = Math.max(-0.4 + lo, Math.min(-0.4 + hi, E.cz));
          E.dir = -E.dir;
        }
      }
      if (n) {
        sfx.click();
        if (E.phase === 'x') {
          E.phase = 'z';
          E.dir = 1;
        } else {
          E.phase = 'drop';
          E.coins--;
        }
      }
    } else if (E.phase === 'drop') {
      E.cy -= dt * 1.6;
      if (E.cy <= 0.75) {
        E.cy = 0.75;
        let best = null;
        let bd = 0.45;
        for (const q of E.prizes) {
          const dd = Math.hypot(q.x - E.cx, q.z - E.cz);
          if (!q.got && dd < bd) {
            bd = dd;
            best = q;
          }
        }
        // longe do centro do bicho a garra pode escorregar
        if (best && !(bd > 0.25 && Math.random() < 0.4)) {
          E.hold = best;
          sfx.pickup();
        } else if (best) say(E, L('ESCORREGOU!', 'SLIPPED!'), 'hurt', E.cx, E.cz);
        E.phase = 'up';
      }
    } else if (E.phase === 'up') {
      E.cy += dt * 1.6;
      if (E.cy >= 2.2) {
        E.cy = 2.2;
        E.phase = E.hold ? 'carry' : 'back';
      }
    } else if (E.phase === 'carry' || E.phase === 'back') {
      const tx = E.phase === 'carry' ? CR_H + 0.55 : -1.2;
      const tz = E.phase === 'carry' ? 0.6 : -1.6;
      const dx = tx - E.cx;
      const dz = tz - E.cz;
      const l = Math.hypot(dx, dz);
      if (l > 0.05) {
        E.cx += (dx / l) * Math.min(l, sp * 1.6 * dt);
        E.cz += (dz / l) * Math.min(l, sp * 1.6 * dt);
      } else if (E.phase === 'carry') {
        E.hold.got = true;
        E.hold.m.visible = false;
        E.hold = null;
        E.got++;
        sfx.coin();
        say(E, L(`PEGOU! (${E.got}/3)`, `GOT ONE! (${E.got}/3)`), 'crit', tx, tz);
        E.phase = 'back';
      } else {
        E.phase = 'x';
        E.dir = 1;
        if (E.got >= 3) {
          dropTarget(E);
          complete(E, 1.2 + E.coins * 0.08, L('MÃO DE OURO!', 'GOLDEN CLAW!'), L(`3 bichinhos com ${6 - E.coins} fichas`, `3 plushies with ${6 - E.coins} coins`), E.x, E.z, { extra: E.coins >= 2 });
          return;
        }
        if (E.coins <= 0) {
          dropTarget(E);
          failed(E, L('Acabaram as fichas da garra.', 'Out of claw coins.'));
          return;
        }
      }
    }
    E.claw.position.set(E.cx, E.cy, E.cz);
    if (E.hold) {
      E.hold.x = E.cx;
      E.hold.z = E.cz;
      E.hold.m.position.set(E.cx, E.cy - 0.85, E.cz);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na máquina', 'reach the machine') : `${E.got}/3 🧸 · ${E.coins} ${L('fichas', 'coins')} · ${E.phase === 'x' ? 'X' : E.phase === 'z' ? 'Z' : '…'}`),
  dim(E) {
    dropTarget(E);
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('golpeie (ou encoste em) o botão vermelho para parar a garra no X, de novo para parar no Z; aí ela desce. Mire bem no meio do bicho (na beirada ela escorrega). Pegue 3 com 6 fichas.', 'hit (or touch) the red button to stop the claw on X, again to stop it on Z; then it drops. Aim right at the middle of a plushie (on the edge it slips). Grab 3 with 6 coins.'),
});

// ==================================================================
// 104. Apague o Fogo: o fogo se espalha pelos ladrilhos; fique parado em cima de cada chama para apagar
// ==================================================================
const FI_COL = 0xff6a1a;
const FI_N = 5;
const FI_TIME = 30;
const FI_MAX = 12;
const fire = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const tiles = [];
    const inst = new THREE.InstancedMesh(box(0.92, 0.06, 0.92), new THREE.MeshLambertMaterial({ color: 0xffffff }), FI_N * FI_N);
    const m4 = new THREE.Matrix4();
    const flameMat = glowMat(FI_COL, 2.4);
    const coreMat = glowMat(0xffd23d, 2.6);
    for (let j = 0; j < FI_N; j++)
      for (let i = 0; i < FI_N; i++) {
        const x = i - (FI_N - 1) / 2;
        const z = j - (FI_N - 1) / 2;
        inst.setMatrixAt(tiles.length, m4.makeTranslation(x, 0.03, z));
        const fl = new THREE.Group();
        put(fl, mats().cone, flameMat, 0, 0.35, 0, 2.2, 2.2, 2.2).rotation.x = -Math.PI / 2;
        put(fl, mats().cone, coreMat, 0, 0.25, 0, 1.2, 1.2, 1.2).rotation.x = -Math.PI / 2;
        fl.position.set(x, 0, z);
        fl.visible = false;
        g.add(fl);
        tiles.push({ x, z, w: 1, h: 1, fill: { opacity: 0 }, fl, on: false, wet: 0, k: 0 });
      }
    g.add(inst);
    const E = { kind: 'fire', x: s.x, z: s.z, g, inst, tiles, st: 'idle', t: FI_TIME, spark: 0, spread: 0, out: 0, on: 0, stand: -1, sw: 0 };
    fire.paint(E);
    return E;
  },
  paint(E) {
    const c = new THREE.Color();
    E.tiles.forEach((q, i) => {
      c.setHex(q.on ? 0x5a1a08 : q.wet > 0 ? 0x1a4a6a : 0x2a2f3a);
      E.inst.setColorAt(i, c);
    });
    E.inst.instanceColor.needsUpdate = true;
  },
  ignite(E, q) {
    if (q.on || q.wet > 0) return false;
    q.on = true;
    q.fl.visible = true;
    E.on++;
    return true;
  },
  update(E, dt) {
    const p = G.player;
    if (E.st === 'idle') {
      if (!near(E, 3.4)) return;
      E.st = 'run';
      banner(L('APAGUE O FOGO!', 'PUT OUT THE FIRE!'), L('Fique parado em cima das chamas para apagar', 'Stand still on the flames to put them out'));
      for (let k = 0; k < 2; k++) fire.ignite(E, rpick(E.tiles));
      fire.paint(E);
      return;
    }
    let dirty = false;
    E.t -= dt;
    for (const q of E.tiles) {
      if (q.wet > 0 && (q.wet -= dt) <= 0) dirty = true;
      if (q.on) q.fl.scale.set(1, 0.8 + Math.sin(G.t * 12 + q.x * 3 + q.z) * 0.25, 1);
    }
    // faíscas novas enquanto o relógio corre e o fogo se espalha para os vizinhos
    if (E.t > 0) {
      E.spark -= dt;
      if (E.spark <= 0) {
        E.spark = Math.max(1.3, 2.4 - G.floor * 0.015);
        dirty = fire.ignite(E, rpick(E.tiles)) || dirty;
      }
    }
    E.spread -= dt;
    if (E.spread <= 0) {
      E.spread = 3;
      for (const q of E.tiles.filter((t) => t.on)) {
        if (Math.random() > 0.45) continue;
        const nb = E.tiles.filter((t) => Math.abs(t.x - q.x) + Math.abs(t.z - q.z) === 1);
        dirty = fire.ignite(E, rpick(nb)) || dirty;
      }
    }
    // apagar: um instante parado em cima da chama
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    const k = p.alive ? E.tiles.findIndex((q) => Math.abs(lx - q.x) < 0.5 && Math.abs(lz - q.z) < 0.5) : -1;
    if (k !== E.stand) {
      E.stand = k;
      E.sw = 0;
    }
    if (k >= 0 && E.tiles[k].on) {
      E.sw += dt;
      if (Math.random() < dt * 20) burst(p.x, 0.2, p.z, 0x9ad7ff, 2, 2, 0.05, 0.3, { up: 2 });
      if (E.sw >= 0.45) {
        const q = E.tiles[k];
        q.on = false;
        q.fl.visible = false;
        q.wet = 4;
        E.on--;
        E.out++;
        E.sw = 0;
        sfx.click();
        burst(E.x + q.x, 0.4, E.z + q.z, 0xcfeaff, 10, 3, 0.06, 0.5, { up: 2 });
        dirty = true;
      }
    }
    if (dirty) fire.paint(E);
    if (E.on >= FI_MAX) {
      fire.dim(E);
      failed(E, L('O fogo tomou conta do piso.', 'The fire took over the floor.'));
      return;
    }
    if (E.t <= 0 && !E.on) complete(E, 1.3, L('BOMBEIRO NEON!', 'NEON FIREFIGHTER!'), L(`${E.out} chamas apagadas`, `${E.out} flames out`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no piso', 'reach the floor') : `🔥 ${E.on}/${FI_MAX} · ${E.t > 0 ? `${Math.ceil(E.t)}s` : L('apague o resto!', 'put out the rest!')}`),
  dim(E) {
    for (const q of E.tiles) {
      q.on = false;
      q.fl.visible = false;
    }
  },
  intro: () => L(`chamas aparecem no piso por ${FI_TIME}s e se espalham para os vizinhos. Fique parado um instante em cima de cada chama para apagar (o ladrilho molhado não pega fogo por uns segundos). Se ${FI_MAX} ladrilhos queimarem ao mesmo tempo, acabou; quando o tempo acabar, apague o que sobrou.`, `flames appear on the floor for ${FI_TIME}s and spread to their neighbors. Stand still on each flame for a moment to put it out (a wet tile will not catch fire for a few seconds). If ${FI_MAX} tiles burn at once, it is over; when the time is up, put out what is left.`),
});

// ==================================================================
// 105. Mesa Inclinada: a mesa inclina para o lado em que você está; leve a bola ao buraco verde, longe dos vermelhos
// ==================================================================
const TL_COL = 0x5affd2;
const TL_H = 2.6;
const TL_NEED = 3;
const tilt = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, TL_H + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const top = new THREE.Group();
    g.add(top);
    put(top, box(TL_H * 2, 0.06, TL_H * 2), new THREE.MeshLambertMaterial({ color: 0x24304a }), 0, 0.05, 0);
    const edge = lightMat(TL_COL, 1.2);
    put(top, box(TL_H * 2, 0.2, 0.1), edge, 0, 0.15, -TL_H);
    put(top, box(TL_H * 2, 0.2, 0.1), edge, 0, 0.15, TL_H);
    put(top, box(0.1, 0.2, TL_H * 2), edge, -TL_H, 0.15, 0);
    put(top, box(0.1, 0.2, TL_H * 2), edge, TL_H, 0.15, 0);
    const goal = { x: 1.9, z: -1.9 };
    put(top, mats().disc, mats().dark, goal.x, 0.09, goal.z, 0.34, 1, 0.34);
    put(top, mats().ring, lightMat(0x39ff88, 2), goal.x, 0.1, goal.z, 0.42, 1, 0.42);
    const cand = [[0, 0], [-1, -1.2], [1.1, 0.2], [-0.2, -1.9], [0.6, 1.3], [-1.6, 0.3], [1.9, -0.4], [0.4, -0.9]];
    const traps = shuffle(cand.slice())
      .slice(0, floor >= 12 ? 4 : 3)
      .map(([x, z]) => {
        put(top, mats().disc, mats().dark, x, 0.09, z, 0.32, 1, 0.32);
        put(top, mats().ring, lightMat(0xff3355, 1.8), x, 0.1, z, 0.38, 1, 0.38);
        return { x, z };
      });
    const ball = put(top, sphere(), glowMat(0xffffff, 1.8), -1.9, 0.3, 1.9, 0.22, 0.22, 0.22);
    return { kind: 'tilt', x: s.x, z: s.z, g, top, goal, traps, ball, st: 'idle', bx: -1.9, bz: 1.9, vx: 0, vz: 0, got: 0, miss: 0, cool: 0 };
  },
  reset(E) {
    E.bx = -1.9;
    E.bz = 1.9;
    E.vx = E.vz = 0;
    E.cool = 0.8;
    E.ball.position.set(E.bx, 0.3, E.bz);
    E.ball.visible = true;
  },
  update(E, dt) {
    const [lx, lz] = loc(E);
    const on = inBox(E, TL_H, TL_H);
    if (E.st === 'idle') {
      if (!on) return;
      E.st = 'run';
      banner(L('MESA INCLINADA!', 'TILT TABLE!'), L('Ande para o lado em que a bola deve rolar', 'Walk to the side the ball should roll to'));
    }
    const ax = on ? lx * 1.35 : 0;
    const az = on ? lz * 1.35 : 0;
    E.top.rotation.z += (-ax * 0.03 - E.top.rotation.z) * Math.min(1, dt * 6);
    E.top.rotation.x += (az * 0.03 - E.top.rotation.x) * Math.min(1, dt * 6);
    if (E.cool > 0) {
      E.cool -= dt;
      return;
    }
    E.vx += ax * dt;
    E.vz += az * dt;
    const sp = Math.hypot(E.vx, E.vz);
    const fr = Math.max(0, sp - 0.8 * dt) / (sp || 1);
    const cap = sp > 3.6 ? 3.6 / sp : 1;
    E.vx *= fr * cap;
    E.vz *= fr * cap;
    E.bx += E.vx * dt;
    E.bz += E.vz * dt;
    const lim = TL_H - 0.3;
    if (Math.abs(E.bx) > lim) {
      E.bx = Math.sign(E.bx) * lim;
      E.vx = -E.vx * 0.5;
    }
    if (Math.abs(E.bz) > lim) {
      E.bz = Math.sign(E.bz) * lim;
      E.vz = -E.vz * 0.5;
    }
    E.ball.position.set(E.bx, 0.3, E.bz);
    E.ball.rotation.x += E.vz * dt * 4;
    E.ball.rotation.z -= E.vx * dt * 4;
    if (Math.hypot(E.bx - E.goal.x, E.bz - E.goal.z) < 0.32) {
      E.got++;
      sfx.coin();
      say(E, L(`NO BURACO! (${E.got}/${TL_NEED})`, `IN! (${E.got}/${TL_NEED})`), 'crit', E.goal.x, E.goal.z);
      if (E.got >= TL_NEED) {
        E.ball.visible = false;
        complete(E, 1.3 - E.miss * 0.05, L('MÃO FIRME!', 'STEADY HAND!'), L(`${E.got} bolas`, `${E.got} balls`), E.x, E.z);
        return;
      }
      tilt.reset(E);
      return;
    }
    for (const t of E.traps) {
      if (Math.hypot(E.bx - t.x, E.bz - t.z) > 0.3) continue;
      E.miss++;
      sfx.deny();
      burst(E.x + t.x, 0.3, E.z + t.z, 0xff3355, 12, 3, 0.06, 0.4, { up: 1 });
      say(E, L(`CAIU! (${E.miss}/${TRIES})`, `FELL IN! (${E.miss}/${TRIES})`), 'hurt', t.x, t.z);
      if (E.miss >= TRIES) {
        E.ball.visible = false;
        failed(E, L('A bola caiu nos buracos vermelhos vezes demais.', 'The ball fell into the red holes too often.'));
        return;
      }
      tilt.reset(E);
      return;
    }
  },
  hud: (E) => (E.st === 'idle' ? L('suba na mesa', 'step on the table') : `${E.got}/${TL_NEED} ⚪ · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    E.ball.visible = false;
  },
  intro: () => L(`a mesa inclina para o lado em que você está e a bola rola para lá (quanto mais longe do meio, mais forte). Leve a bola ao buraco verde sem cair nos vermelhos. ${TL_NEED} bolas; ${TRIES} quedas e acabou.`, `the table tilts toward the side you stand on and the ball rolls that way (farther from the middle means stronger). Get the ball into the green hole without falling into the red ones. ${TL_NEED} balls; ${TRIES} falls and it is over.`),
});

// ==================================================================
// 106. Separe as Cores: empurre (andando ou golpeando) cada orbe para o cercado da mesma cor
// ==================================================================
const SO_HX = 3.3;
const SO_HZ = 2.5;
const SO_PEN = [
  [0xff3355, -2.6, 0],
  [0x3d8bff, 2.6, 0],
  [0x39ff88, 0, -1.8],
];
const sort = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, SO_HX + 0.3, SO_HZ + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const edge = lightMat(0xffffff, 0.8);
    put(g, box(SO_HX * 2, 0.05, 0.08), edge, 0, 0.04, -SO_HZ);
    put(g, box(SO_HX * 2, 0.05, 0.08), edge, 0, 0.04, SO_HZ);
    put(g, box(0.08, 0.05, SO_HZ * 2), edge, -SO_HX, 0.04, 0);
    put(g, box(0.08, 0.05, SO_HZ * 2), edge, SO_HX, 0.04, 0);
    const nc = floor >= 10 ? 3 : 2;
    const pens = SO_PEN.slice(0, nc).map(([c, x, z]) => {
      put(g, mats().disc, flatMat(c, 0.2), x, 0.03, z, 0.72, 1, 0.72);
      const ring = lightMat(c, 1.4);
      put(g, mats().ring, ring, x, 0.04, z, 0.78, 1, 0.78);
      return { c, x, z, ring };
    });
    const orbs = [];
    for (let ci = 0; ci < nc; ci++)
      for (let k = 0; k < 2; k++) {
        const x = rr(-1.4, 1.4);
        const z = rr(-0.2, 1.6);
        const m = put(g, sphere(), glowMat(pens[ci].c, 1.8), x, 0.35, z, 0.35, 0.35, 0.35);
        orbs.push({ m, ci, x, z, x0: x, z0: z, vx: 0, vz: 0, in: false, e: hitTarget(s.x + x, s.z + z, 0.38, 0.7, L('Orbe', 'Orb')), hits: 0 });
      }
    return { kind: 'sort', x: s.x, z: s.z, g, pens, orbs, st: 'idle' };
  },
  update(E, dt) {
    const p = G.player;
    const [lx, lz] = loc(E);
    if (E.st === 'idle') {
      if (!near(E, 4.2)) return;
      E.st = 'run';
      banner(L('SEPARE AS CORES!', 'SORT THE COLORS!'), L('Empurre cada orbe para o cercado da mesma cor', 'Push each orb into the pen of its color'));
    }
    for (const o of E.orbs) {
      const n = hitsOn(o);
      if (o.in) continue;
      const dx = o.x - lx;
      const dz = o.z - lz;
      const dd = Math.hypot(dx, dz) || 1;
      if (n) {
        o.vx = (dx / dd) * 6;
        o.vz = (dz / dd) * 6;
        sfx.punch();
      } else if (p.alive && dd < 0.35 + p.r + 0.05) {
        // encostão: empurra para longe do jogador
        const v = Math.max(3.2, Math.hypot(o.vx, o.vz));
        o.vx = (dx / dd) * v;
        o.vz = (dz / dd) * v;
      }
      const sp = Math.hypot(o.vx, o.vz);
      if (sp > 0) {
        const f = Math.max(0, sp - 3 * dt) / sp;
        o.vx *= f;
        o.vz *= f;
      }
      o.x += o.vx * dt;
      o.z += o.vz * dt;
      if (Math.abs(o.x) > SO_HX - 0.35) {
        o.x = Math.sign(o.x) * (SO_HX - 0.35);
        o.vx = -o.vx * 0.7;
      }
      if (Math.abs(o.z) > SO_HZ - 0.35) {
        o.z = Math.sign(o.z) * (SO_HZ - 0.35);
        o.vz = -o.vz * 0.7;
      }
      for (const q of E.orbs) {
        if (q === o) continue;
        const ex = o.x - q.x;
        const ez = o.z - q.z;
        const el = Math.hypot(ex, ez);
        if (el > 0.7 || el < 1e-4) continue;
        const push = (0.7 - el) / 2;
        o.x += (ex / el) * push;
        o.z += (ez / el) * push;
        if (!q.in) {
          q.x -= (ex / el) * push;
          q.z -= (ez / el) * push;
        }
      }
      for (let i = 0; i < E.pens.length; i++) {
        const pn = E.pens[i];
        const pd = Math.hypot(o.x - pn.x, o.z - pn.z);
        if (pd > 0.55) continue;
        if (i === o.ci) {
          o.in = true;
          o.vx = o.vz = 0;
          dropTarget(o);
          sfx.coin();
          ringFx(E.x + pn.x, E.z + pn.z, 1.1, pn.c, 0.4);
          say(E, `${E.orbs.filter((q) => q.in).length}/${E.orbs.length}`, 'crit', pn.x, pn.z);
        } else {
          o.vx = ((o.x - pn.x) / (pd || 1)) * 4;
          o.vz = ((o.z - pn.z) / (pd || 1)) * 4;
          if (!o.buzz || G.t - o.buzz > 1) {
            o.buzz = G.t;
            sfx.deny();
            say(E, L('COR ERRADA', 'WRONG COLOR'), 'hurt', pn.x, pn.z);
          }
        }
      }
      o.m.position.set(o.x, 0.35, o.z);
      if (o.e && o.e.alive) {
        o.e.x = E.x + o.x;
        o.e.z = E.z + o.z;
      }
    }
    if (E.orbs.every((o) => o.in)) complete(E, 1.25, L('TUDO NO LUGAR!', 'ALL SORTED!'), L(`${E.orbs.length} orbes`, `${E.orbs.length} orbs`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nas orbes', 'reach the orbs') : `${E.orbs.filter((o) => o.in).length}/${E.orbs.length} ${L('orbes', 'orbs')}`),
  dim(E) {
    for (const o of E.orbs) dropTarget(o);
    if (E.st === 'done') E.orbs.forEach((o) => o.m.position.set(E.pens[o.ci].x + (o === E.orbs.find((q) => q.ci === o.ci) ? -0.2 : 0.2), 0.35, E.pens[o.ci].z));
  },
  reload(E) {
    for (const o of E.orbs) {
      o.e.hp = o.e.maxHp;
      o.hits = 0;
    }
  },
  intro: () => L('ande contra uma orbe para empurrá-la ou golpeie para chutar. Leve cada orbe ao cercado da mesma cor (o cercado errado expulsa a orbe).', 'walk into an orb to push it or hit it to kick it. Take each orb to the pen of its color (the wrong pen kicks it back out).'),
});

// ==================================================================
// 107. Onde Estava?: 6 objetos aparecem nas placas e se escondem; fique na placa do objeto pedido
// ==================================================================
const WE_COL = 0xffd23d;
const WE_SET = ['🍎', '⚽', '🎩', '🔔', '🌙', '🐟', '🎁', '🔑', '🍩', '🎈', '🪐', '🦆', '🍉', '⭐'];
const WE_NEED = 4;
const where = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3, 2.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const plates = [];
    const labels = [];
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 1.9;
        const z = j * 1.7 - 0.2;
        plates.push(plate(g, x, z, 1.4, 1.4, WE_COL));
        labels.push(tag(g, '❔', 0xffffff, x, 0.85, z, 0.8));
      }
    const board = tag(g, '?', 0xffffff, 0, 2.2, -1.5, 0.85, 6);
    return { kind: 'where', x: s.x, z: s.z, g, plates, labels, board, st: 'idle', ok: 0, miss: 0, phase: 'wait', t: 0, items: [], right: 0 };
  },
  show(E) {
    E.items = mshuffle(WE_SET.slice()).slice(0, 6);
    E.items.forEach((it, i) => setTag(E.labels[i], it, 0xffffff));
    E.phase = 'show';
    E.t = Math.max(3, 4.6 - G.floor * 0.03);
    setTag(E.board, L('DECORE!', 'MEMORIZE!'), 0xffd23d);
    lit(E.plates, WE_COL);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('ONDE ESTAVA?', 'WHERE WAS IT?'), L('Decore onde fica cada objeto', 'Memorize where each object is'));
      E.phase = 'wait';
      E.t = 0.6;
      return;
    }
    if (E.phase === 'wait') {
      dwellHold(E, E.plates);
      if (waitFoes(E)) return;
      E.t -= dt;
      if (E.t <= 0) where.show(E);
      return;
    }
    if (E.phase === 'show') {
      dwellHold(E, E.plates);
      if (waitFoes(E)) {
        for (const t of E.labels) setTag(t, '❔', 0xffffff);
        E.phase = 'wait';
        E.t = 0.6;
        return;
      }
      E.t -= dt;
      if (E.t > 0) return;
      for (const t of E.labels) setTag(t, '❔', 0xffffff);
      E.right = rint(0, 5);
      setTag(E.board, L(`Onde estava ${E.items[E.right]}?`, `Where was ${E.items[E.right]}?`), 0xffffff);
      E.phase = 'q';
      return;
    }
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) {
        E.phase = 'wait';
        E.t = 0.3;
      }
      return;
    }
    const k = dwell(E, E.plates, dt, 0.45);
    if (k < 0) return;
    E.phase = 'res';
    E.t = 1.6;
    E.items.forEach((it, i) => setTag(E.labels[i], it, 0xffffff));
    setLight(E.plates[E.right].ring, 0x39ff88, 2.6);
    if (k === E.right) {
      E.ok++;
      sfx.coin();
      say(E, L('ACHOU!', 'FOUND IT!'), 'crit');
    } else {
      E.miss++;
      sfx.deny();
      setLight(E.plates[k].ring, 0xff3355, 2.6);
      say(E, L(`ERA ALI (${E.miss}/${TRIES})`, `IT WAS THERE (${E.miss}/${TRIES})`), 'hurt');
    }
    if (E.ok >= WE_NEED) complete(E, 1.25, L('MEMÓRIA DE ELEFANTE!', 'ELEPHANT MEMORY!'), L(`${E.ok} acertos`, `${E.ok} right`), E.x, E.z);
    else if (E.miss >= TRIES) failed(E, L('Esquecimentos demais.', 'Too many slips of memory.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nas placas', 'reach the plates') : `${E.ok}/${WE_NEED} ✔ · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    for (const t of E.labels) t.visible = false;
    setTag(E.board, E.st === 'done' ? '✔' : '✖', 0xffffff);
  },
  intro: () => L(`6 objetos aparecem nas placas por alguns segundos (só com a área sem inimigos) e se escondem. Depois a tela pergunta onde estava um deles: fique parado na placa certa. ${WE_NEED} acertos; ${TRIES} erros e acabou.`, `6 objects show on the plates for a few seconds (only with no enemies around) and then hide. The screen then asks where one of them was: stand still on the right plate. ${WE_NEED} right; ${TRIES} wrong and it is over.`),
});

// ==================================================================
// 108. Pulo do Cavalo: o cavalo só anda em L. Pare nas casas verdes para pular e pegue as 3 estrelas
// ==================================================================
const KN_COL = 0x9ad7ff;
const KN_N = 5;
const KN_S = 1.1;
const KN_MOVES = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
function knDist(a) {
  const dist = new Array(KN_N * KN_N).fill(-1);
  dist[a] = 0;
  const q = [a];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dz] of KN_MOVES) {
      const x = (c % KN_N) + dx;
      const z = Math.floor(c / KN_N) + dz;
      if (x < 0 || z < 0 || x >= KN_N || z >= KN_N) continue;
      const n = z * KN_N + x;
      if (dist[n] < 0) {
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
  }
  return dist;
}
const knJump = (a, b) => KN_MOVES.some(([dx, dz]) => (a % KN_N) + dx === b % KN_N && Math.floor(a / KN_N) + dz === Math.floor(b / KN_N));
const knPos = (c) => [((c % KN_N) - (KN_N - 1) / 2) * KN_S, (Math.floor(c / KN_N) - (KN_N - 1) / 2) * KN_S];
const knight = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.1);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const inst = new THREE.InstancedMesh(box(KN_S - 0.08, 0.05, KN_S - 0.08), new THREE.MeshLambertMaterial({ color: 0xffffff }), KN_N * KN_N);
    const m4 = new THREE.Matrix4();
    const cells = [];
    for (let c = 0; c < KN_N * KN_N; c++) {
      const [x, z] = knPos(c);
      inst.setMatrixAt(c, m4.makeTranslation(x, 0.03, z));
      cells.push({ x, z, w: KN_S, h: KN_S, fill: { opacity: 0 } });
    }
    g.add(inst);
    const start = KN_N * (KN_N - 1);
    const free = [];
    for (let c = 0; c < KN_N * KN_N; c++) if (c !== start) free.push(c);
    const stars = shuffle(free).slice(0, 3);
    const starM = stars.map((c) => {
      const [x, z] = knPos(c);
      return put(g, mats().oct, glowMat(0xffd23d, 2.4), x, 0.6, z, 0.22, 0.3, 0.22);
    });
    // menor número de pulos para pegar as 3 (qualquer ordem)
    const D = [start, ...stars].map((c) => knDist(c));
    let opt = 99;
    for (const ord of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      let t = D[0][stars[ord[0]]];
      for (let i = 1; i < 3; i++) t += D[1 + ord[i - 1]][stars[ord[i]]];
      opt = Math.min(opt, t);
    }
    const horse = new THREE.Group();
    const hm = glowMat(KN_COL, 1.6);
    put(horse, cyl(), hm, 0, 0.3, 0, 0.3, 0.6, 0.3);
    put(horse, box(0.22, 0.6, 0.3), hm, 0, 0.85, 0);
    put(horse, box(0.22, 0.22, 0.45), hm, 0, 1.05, 0.15);
    g.add(horse);
    const E = { kind: 'knight', x: s.x, z: s.z, g, inst, cells, stars, starM, horse, cur: start, st: 'idle', moves: 0, opt, max: opt + 5, got: 0 };
    knight.paint(E);
    return E;
  },
  paint(E) {
    const c = new THREE.Color();
    for (let i = 0; i < E.cells.length; i++) {
      const dark = ((i % KN_N) + Math.floor(i / KN_N)) % 2;
      c.setHex(i === E.cur ? 0x3a6aaa : E.st === 'run' && knJump(E.cur, i) ? 0x2a8a4a : dark ? 0x1a1e2a : 0x3a4054);
      E.inst.setColorAt(i, c);
    }
    E.inst.instanceColor.needsUpdate = true;
    const [x, z] = knPos(E.cur);
    E.horse.position.set(x, 0, z);
  },
  update(E, dt) {
    for (const m of E.starM) m.rotation.y += dt * 2;
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('PULO DO CAVALO!', "KNIGHT'S JUMP!"), L('Pare nas casas verdes para o cavalo pular em L', 'Stand on the green squares to jump in an L'));
      knight.paint(E);
      return;
    }
    const k = dwell(E, E.cells, dt, 0.35);
    if (k < 0 || k === E.cur) return;
    if (!knJump(E.cur, k)) {
      say(E, L('O CAVALO SÓ PULA EM L', 'THE KNIGHT ONLY JUMPS IN AN L'), 'info');
      sfx.deny();
      return;
    }
    E.cur = k;
    E.moves++;
    sfx.click();
    const si = E.stars.indexOf(k);
    if (si >= 0 && E.starM[si].visible) {
      E.starM[si].visible = false;
      E.got++;
      sfx.coin();
      say(E, `⭐ ${E.got}/3`, 'crit');
    }
    knight.paint(E);
    if (E.got >= 3) {
      const best = E.moves <= E.opt;
      complete(E, best ? 1.7 : 1.3, best ? L('XEQUE-MATE!', 'CHECKMATE!') : L('ESTRELAS NO BOLSO!', 'STARS COLLECTED!'), L(`${E.moves} pulos (mínimo ${E.opt})`, `${E.moves} jumps (minimum ${E.opt})`), E.x, E.z, { extra: best });
    } else if (E.moves >= E.max) failed(E, L(`Acabaram os ${E.max} pulos.`, `Out of ${E.max} jumps.`));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no tabuleiro', 'reach the board') : `⭐ ${E.got}/3 · ${E.moves}/${E.max} ${L('pulos', 'jumps')}`),
  dim(E) {
    for (const m of E.starM) m.visible = false;
  },
  intro: (E) => L(`o cavalo de xadrez só pula em L (2 casas para um lado e 1 para o outro). As casas verdes mostram para onde ele pode ir: fique parado numa delas para pular. Pegue as 3 estrelas em até ${E.max} pulos.`, `the chess knight only jumps in an L (2 squares one way and 1 the other). The green squares show where it can go: stand still on one to jump. Grab the 3 stars in up to ${E.max} jumps.`),
});

// ==================================================================
// 109. Goleiro: o robô chuta bolas no gol; entre na frente delas. 10 defesas
// ==================================================================
const KP_COL = 0x39ff88;
const KP_HX = 2.6;
const KP_HZ = 3;
const KP_NEED = 10;
const keeper = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, KP_HX + 0.4, KP_HZ + 0.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(KP_HX * 2, 0.02, KP_HZ * 2), flatMat(0x2a8a3a, 0.3), 0, 0.025, 0);
    const net = lightMat(0xffffff, 1.4);
    put(g, box(KP_HX * 2, 0.06, 0.08), net, 0, 0.05, KP_HZ - 0.3);
    put(g, box(0.1, 1.6, 0.1), net, -KP_HX, 0.8, KP_HZ - 0.3);
    put(g, box(0.1, 1.6, 0.1), net, KP_HX, 0.8, KP_HZ - 0.3);
    put(g, box(KP_HX * 2, 0.1, 0.1), net, 0, 1.6, KP_HZ - 0.3);
    put(g, box(KP_HX * 2, 1.5, 0.02), flatMat(0xffffff, 0.08), 0, 0.8, KP_HZ - 0.1);
    const b = bot(g, 0xff9a3d, 0, -KP_HZ + 0.4, 1);
    const ball = put(g, sphere(), glowMat(0xffffff, 1.8), 0, 0.3, 0, 0.28, 0.28, 0.28);
    ball.visible = false;
    return { kind: 'keeper', x: s.x, z: s.z, g, b, ball, st: 'idle', phase: 'aim', t: 0, saves: 0, goals: 0, shots: 0, bx: 0, bz: 0, vx: 0, vz: 0, tx: 0 };
  },
  update(E, dt) {
    const [lx, lz] = loc(E);
    if (E.st === 'idle') {
      if (!inBox(E, KP_HX, KP_HZ) || lz < 0) return;
      E.st = 'run';
      E.t = 1.2;
      banner(L('GOLEIRO!', 'GOALKEEPER!'), L('Entre na frente das bolas antes do gol', 'Get in front of the shots before the goal'));
      return;
    }
    E.b.x = E.b.m.position.x;
    if (E.phase === 'aim') {
      E.t -= dt;
      E.b.m.position.x += (E.tx * 0.4 - E.b.m.position.x) * Math.min(1, dt * 3);
      if (E.t > 0) return;
      // telegrafa o chute: linha do robô até o ponto do gol
      E.tx = (Math.random() * 2 - 1) * (KP_HX - 0.5);
      E.bx = E.b.m.position.x;
      E.bz = -KP_HZ + 1;
      const a = Math.atan2(KP_HZ - 0.3 - E.bz, E.tx - E.bx);
      lineTelegraph(E.x + E.bx, E.z + E.bz, a, Math.hypot(E.tx - E.bx, KP_HZ - 0.3 - E.bz), 0.6, 0.8, 0xffd23d);
      sfx.telegraph();
      E.phase = 'wind';
      E.t = 0.8;
      return;
    }
    if (E.phase === 'wind') {
      E.t -= dt;
      if (E.t > 0) return;
      const v = Math.min(8.5, 5.6 + G.floor * 0.04 + E.shots * 0.12);
      const dx = E.tx - E.bx;
      const dz = KP_HZ - 0.3 - E.bz;
      const l = Math.hypot(dx, dz);
      E.vx = (dx / l) * v;
      E.vz = (dz / l) * v;
      E.ball.visible = true;
      E.phase = 'fly';
      E.shots++;
      sfx.punch();
      return;
    }
    if (E.phase === 'fly') {
      E.bx += E.vx * dt;
      E.bz += E.vz * dt;
      E.ball.position.set(E.bx, 0.3, E.bz);
      const p = G.player;
      if (p.alive && Math.hypot(lx - E.bx, lz - E.bz) < p.r + 0.35) {
        E.saves++;
        E.ball.visible = false;
        sfx.coin();
        burst(E.x + E.bx, 0.5, E.z + E.bz, KP_COL, 14, 4, 0.07, 0.4, { up: 1.5 });
        say(E, L(`DEFENDEU! (${E.saves}/${KP_NEED})`, `SAVED! (${E.saves}/${KP_NEED})`), 'crit', E.bx, E.bz);
        E.phase = 'aim';
        E.t = 0.9;
      } else if (E.bz >= KP_HZ - 0.3) {
        E.goals++;
        E.ball.visible = false;
        sfx.deny();
        say(E, L(`GOL! (${E.goals}/${TRIES})`, `GOAL! (${E.goals}/${TRIES})`), 'hurt', E.bx, E.bz);
        E.phase = 'aim';
        E.t = 1.1;
      }
      if (E.saves >= KP_NEED) complete(E, 1.3 - E.goals * 0.05, L('PAREDÃO!', 'THE WALL!'), L(`${E.saves} defesas`, `${E.saves} saves`), E.x, E.z);
      else if (E.goals >= TRIES) failed(E, L('Gols demais.', 'Too many goals.'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre no gol', 'stand in the goal') : `${E.saves}/${KP_NEED} 🧤 · ${E.goals}/${TRIES} ⚽`),
  dim(E) {
    E.ball.visible = false;
  },
  intro: () => L(`entre na área perto do gol. O robô mira (linha amarela no chão) e chuta: entre na frente da bola antes que ela entre. ${KP_NEED} defesas; ${TRIES} gols e acabou.`, `step into the box near the goal. The robot aims (yellow line on the ground) and shoots: get in front of the ball before it goes in. ${KP_NEED} saves; ${TRIES} goals and it is over.`),
});

// ==================================================================
// 110. Guarda de Trânsito: fique parado na placa do semáforo para trocar o sinal. Sem batidas e sem fila enorme
// ==================================================================
const TR_COL = 0xffd23d;
const TR_R = 3.7;
const TR_NEED = 16;
const TR_CAR = [0xff3355, 0x3dc7ff, 0xffffff, 0xc77bff, 0x39ff88, 0xffa24d];
const traffic = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, TR_R + 0.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const road = new THREE.MeshLambertMaterial({ color: 0x1a1c24 });
    put(g, box(TR_R * 2, 0.03, 1.8), road, 0, 0.02, 0);
    put(g, box(1.8, 0.03, TR_R * 2), road, 0, 0.025, 0);
    const line = lightMat(0xffffff, 0.8);
    put(g, box(0.08, 0.04, 1.8), line, -1.05, 0.04, 0);
    put(g, box(1.8, 0.04, 0.08), line, 0, 0.04, -1.05);
    // semáforos: um para cada rua
    const ewL = lightMat(0x39ff88, 2.4);
    const nsL = lightMat(0xff3355, 2.4);
    put(g, box(0.1, 1.4, 0.1), mats().metal, -1.25, 0.7, 1.15);
    put(g, sphere(), ewL, -1.25, 1.5, 1.15, 0.16, 0.16, 0.16);
    put(g, box(0.1, 1.4, 0.1), mats().metal, 1.15, 0.7, -1.25);
    put(g, sphere(), nsL, 1.15, 1.5, -1.25, 0.16, 0.16, 0.16);
    const pad = plate(g, 2.4, 2.4, 1.3, 1.3, TR_COL, 0.9);
    tag(g, '🚦', 0xffffff, 2.4, 0.8, 2.4, 0.7);
    const cars = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Group();
      put(m, box(0.9, 0.35, 0.55), new THREE.MeshLambertMaterial({ color: TR_CAR[i % TR_CAR.length] }), 0, 0.3, 0);
      put(m, box(0.5, 0.25, 0.45), mats().dark, -0.05, 0.58, 0);
      put(m, box(0.04, 0.1, 0.4), lightMat(0xffffdd, 2), 0.46, 0.3, 0);
      m.visible = false;
      g.add(m);
      cars.push({ m, on: false, ax: 0, pos: 0, wait: 0, honk: false });
    }
    return { kind: 'traffic', x: s.x, z: s.z, g, ewL, nsL, pad, plates: [pad], cars, st: 'idle', green: 0, passed: 0, miss: 0, spawn: [1, 2.2] };
  },
  light(E) {
    setLight(E.ewL, E.green === 0 ? 0x39ff88 : 0xff3355, 2.4);
    setLight(E.nsL, E.green === 1 ? 0x39ff88 : 0xff3355, 2.4);
  },
  // posição de cada carro: rua leste-oeste (ax 0) anda em +x na faixa z = 0.45; norte-sul (ax 1) anda em +z na faixa x = -0.45
  where: (c) => (c.ax ? [-0.45, c.pos] : [c.pos, 0.45]),
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4.2)) return;
      E.st = 'run';
      banner(L('GUARDA DE TRÂNSITO!', 'TRAFFIC COP!'), L('Troque o sinal na placa 🚦 sem deixar carros baterem', 'Switch the light on the 🚦 plate without crashes'));
      traffic.light(E);
      return;
    }
    if (dwell(E, E.plates, dt, 0.3) === 0) {
      E.green = 1 - E.green;
      traffic.light(E);
      sfx.click();
    }
    for (let ax = 0; ax < 2; ax++) {
      E.spawn[ax] -= dt;
      if (E.spawn[ax] > 0) continue;
      E.spawn[ax] = Math.max(1.3, 3 - G.floor * 0.02) + Math.random() * 1.6;
      const lane = E.cars.filter((c) => c.on && c.ax === ax);
      if (lane.some((c) => c.pos < -TR_R + 1.3)) continue;
      const c = E.cars.find((q) => !q.on);
      if (!c) continue;
      Object.assign(c, { on: true, ax, pos: -TR_R, wait: 0, honk: false });
      c.m.visible = true;
      c.m.rotation.y = ax ? -Math.PI / 2 : 0;
    }
    const sp = 2.8;
    const on = E.cars.filter((c) => c.on);
    for (const c of on) {
      // carro da frente na mesma faixa
      let lim = Infinity;
      for (const o of on) if (o !== c && o.ax === c.ax && o.pos > c.pos) lim = Math.min(lim, o.pos - 1.2);
      // sinal vermelho: para antes da faixa
      if (E.green !== c.ax && c.pos < -1.2) lim = Math.min(lim, -1.3);
      const np = Math.min(c.pos + sp * dt, lim);
      if (np < c.pos + sp * dt * 0.5) c.wait += dt;
      else c.wait = 0;
      c.pos = Math.max(c.pos, np);
      const [x, z] = traffic.where(c);
      c.m.position.set(x, 0, z);
      if (c.wait > 7 && !c.honk) {
        c.honk = true;
        E.miss++;
        sfx.alarm();
        say(E, L(`BIIII! FILA PARADA (${E.miss}/${TRIES})`, `HONK! STUCK QUEUE (${E.miss}/${TRIES})`), 'hurt', x, z);
      }
      if (c.pos > TR_R) {
        c.on = false;
        c.m.visible = false;
        E.passed++;
      }
    }
    // batida: um carro de cada rua dentro do cruzamento ao mesmo tempo
    const box0 = (c) => Math.abs(traffic.where(c)[0]) < 1 && Math.abs(traffic.where(c)[1]) < 1;
    const a = on.find((c) => c.on && c.ax === 0 && box0(c));
    const b = on.find((c) => c.on && c.ax === 1 && box0(c));
    if (a && b) {
      const [ax0, az0] = traffic.where(a);
      const [bx0, bz0] = traffic.where(b);
      if (Math.hypot(ax0 - bx0, az0 - bz0) < 0.95) {
        for (const c of [a, b]) {
          c.on = false;
          c.m.visible = false;
        }
        E.miss++;
        sfx.explode();
        burst(E.x - 0.45, 0.6, E.z + 0.45, 0xff7a1a, 30, 6, 0.09, 0.6, { up: 2.5 });
        say(E, L(`BATIDA! (${E.miss}/${TRIES})`, `CRASH! (${E.miss}/${TRIES})`), 'hurt');
      }
    }
    if (E.passed >= TR_NEED) {
      traffic.dim(E);
      complete(E, 1.3 - E.miss * 0.05, L('TRÂNSITO FLUINDO!', 'TRAFFIC FLOWING!'), L(`${E.passed} carros`, `${E.passed} cars`), E.x, E.z);
    } else if (E.miss >= TRIES) {
      traffic.dim(E);
      failed(E, L('Engarrafamento total.', 'Total gridlock.'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no cruzamento', 'reach the crossing') : `${E.passed}/${TR_NEED} 🚗 · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    for (const c of E.cars) {
      c.on = false;
      c.m.visible = false;
    }
  },
  intro: () => L(`carros chegam pelas duas ruas. Fique parado na placa 🚦 para trocar qual sinal está verde (saia e volte para trocar de novo). Se um carro de cada rua entrar no cruzamento junto, eles batem; um carro parado por 7s buzina. Deixe ${TR_NEED} carros passarem; ${TRIES} problemas e acabou.`, `cars come down both streets. Stand still on the 🚦 plate to switch which light is green (step off and back to switch again). If one car from each street enters the crossing together, they crash; a car stuck for 7s honks. Let ${TR_NEED} cars through; ${TRIES} problems and it is over.`),
});

// ==================================================================
// 111. Cor Certa: a cor é anunciada; corra para um ladrilho dela antes que os outros sumam. 8 rodadas
// ==================================================================
const BP_COLS = () => [
  [0xff3355, L('VERMELHO', 'RED')],
  [0x39ff88, L('VERDE', 'GREEN')],
  [0x3d8bff, L('AZUL', 'BLUE')],
  [0xffd23d, L('AMARELO', 'YELLOW')],
];
const BP_N = 5;
const BP_S = 1.1;
const BP_ROUNDS = 8;
const block = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const inst = new THREE.InstancedMesh(box(BP_S - 0.08, 0.08, BP_S - 0.08), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x111111 }), BP_N * BP_N);
    g.add(inst);
    const board = tag(g, '', 0xffffff, 0, 2.3, -BP_S * 3, 0.9, 6);
    const E = { kind: 'block', x: s.x, z: s.z, g, inst, board, cols: new Array(BP_N * BP_N).fill(0), st: 'idle', round: 0, miss: 0, phase: 'wait', t: 0, ci: 0, gone: false };
    block.paint(E);
    return E;
  },
  paint(E) {
    const C = BP_COLS();
    const c = new THREE.Color();
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < E.cols.length; i++) {
      const x = ((i % BP_N) - (BP_N - 1) / 2) * BP_S;
      const z = (Math.floor(i / BP_N) - (BP_N - 1) / 2) * BP_S;
      const off = E.gone && E.cols[i] !== E.ci;
      E.inst.setMatrixAt(i, off ? HIDE_M : m4.makeTranslation(x, 0.04, z));
      c.setHex(E.st === 'idle' ? 0x3a4054 : C[E.cols[i]][0]);
      E.inst.setColorAt(i, c);
    }
    E.inst.instanceMatrix.needsUpdate = true;
    E.inst.instanceColor.needsUpdate = true;
  },
  shuffle(E) {
    const list = [];
    for (let i = 0; i < E.cols.length; i++) list.push(i % 4);
    mshuffle(list);
    E.cols = list;
  },
  update(E, dt) {
    const C = BP_COLS();
    if (E.st === 'idle') {
      if (!inBox(E, (BP_N * BP_S) / 2, (BP_N * BP_S) / 2)) return;
      E.st = 'run';
      banner(L('COR CERTA!', 'COLOR RUSH!'), L('Fique num ladrilho da cor anunciada', 'Stand on a tile of the called color'));
      block.shuffle(E);
      E.phase = 'call';
      E.ci = rint(0, 3);
      E.t = 3.2;
      setTag(E.board, C[E.ci][1], C[E.ci][0]);
      block.paint(E);
      return;
    }
    E.t -= dt;
    if (E.phase === 'call') {
      setTag(E.board, `${C[E.ci][1]} ${Math.ceil(E.t)}`, C[E.ci][0]);
      if (E.t > 0) return;
      E.phase = 'drop';
      E.t = 1.3;
      E.gone = true;
      block.paint(E);
      sfx.explode();
      const half = (BP_N * BP_S) / 2;
      const p = G.player;
      const lx = p.x - E.x;
      const lz = p.z - E.z;
      const i = Math.floor((lx + half) / BP_S);
      const j = Math.floor((lz + half) / BP_S);
      const okTile = i >= 0 && j >= 0 && i < BP_N && j < BP_N && E.cols[j * BP_N + i] === E.ci;
      if (!okTile) {
        E.miss++;
        eventHurt(0.05, E.x, E.z, 0);
        say(E, L(`CAIU! (${E.miss}/${TRIES})`, `FELL! (${E.miss}/${TRIES})`), 'hurt');
      } else {
        sfx.coin();
        say(E, `${E.round + 1}/${BP_ROUNDS}`, 'crit');
      }
      return;
    }
    if (E.phase === 'drop') {
      if (E.t > 0) return;
      E.round++;
      E.gone = false;
      if (E.round >= BP_ROUNDS) {
        setTag(E.board, '✔', 0xffffff);
        complete(E, 1.25 - E.miss * 0.05, L('PÉ LIGEIRO!', 'QUICK FEET!'), L(`${BP_ROUNDS} rodadas`, `${BP_ROUNDS} rounds`), E.x, E.z);
        return;
      }
      if (E.miss >= TRIES) {
        setTag(E.board, '✖', 0xffffff);
        failed(E, L('Caiu vezes demais.', 'Fell too many times.'));
        return;
      }
      block.shuffle(E);
      let ci = rint(0, 3);
      if (ci === E.ci) ci = (ci + 1 + rint(0, 2)) % 4;
      E.ci = ci;
      E.phase = 'call';
      E.t = Math.max(1.8, 3.2 - E.round * 0.18 - G.floor * 0.01);
      block.paint(E);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('suba no tabuleiro', 'step on the board') : `${E.round}/${BP_ROUNDS} · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    E.gone = false;
    block.paint(E);
  },
  intro: () => L(`suba no tabuleiro colorido. Uma cor é anunciada com contagem: esteja num ladrilho dela quando chegar a zero, porque os outros somem (fora do tabuleiro também conta como queda). ${BP_ROUNDS} rodadas; ${TRIES} quedas e acabou.`, `step on the colorful board. A color is called with a countdown: be on a tile of that color when it hits zero, because the others vanish (being off the board counts as a fall too). ${BP_ROUNDS} rounds; ${TRIES} falls and it is over.`),
});

// ==================================================================
// 112. Encha o Balão: golpeie a bomba de ar até o ponteiro ficar na faixa verde e fique na placa para amarrar
// ==================================================================
const BL_COL = 0xff6a8a;
const BL_BANDS = [
  [0.6, 0.85],
  [0.66, 0.84],
  [0.72, 0.84],
];
const balloon = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.6, 2.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(0.5, 0.9, 0.5), mats().metal, -1.5, 0.45, 0.8);
    put(g, box(0.08, 0.6, 0.08), mats().metal, -1.5, 1.2, 0.8);
    put(g, box(0.5, 0.08, 0.12), glowMat(BL_COL, 2), -1.5, 1.5, 0.8);
    put(g, mats().ring, lightMat(BL_COL, 1), -1.5, 0.03, 0.8, 0.9, 1, 0.9);
    const e = hitTarget(s.x - 1.5, s.z + 0.8, 0.45, 1.2, L('Bomba de Ar', 'Air Pump'));
    const bmat = glowMat(BL_COL, 1.2);
    const ball = new THREE.Group();
    put(ball, sphere(), bmat, 0, 0, 0, 1, 1.15, 1);
    ball.position.set(0.6, 1.4, -0.6);
    g.add(ball);
    put(g, box(0.03, 1.2, 0.03), mats().metal, 0.6, 0.6, -0.6);
    const gauge = tag(g, '', 0xffffff, 0.6, 2.9, -0.6, 0.6, 5);
    const tie = plate(g, 1.6, 1.3, 1.2, 1.2, 0x39ff88);
    tag(g, '🎀', 0xffffff, 1.6, 0.8, 1.3, 0.7);
    return { kind: 'balloon', x: s.x, z: s.z, g, e, hits: 0, ball, bmat, gauge, tie, plates: [tie], st: 'idle', v: 0.15, round: 0, pops: 0, fly: 0 };
  },
  update(E, dt) {
    const n = hitsOn(E);
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('ENCHA O BALÃO!', 'BLOW UP THE BALLOON!'), L('Encha até a faixa verde e amarre na placa 🎀', 'Fill it to the green band and tie it on the 🎀 plate'));
    }
    if (E.fly > 0) {
      // balão amarrado sobe e um novo aparece
      E.fly -= dt;
      E.ball.position.y += dt * 3;
      if (E.fly <= 0) {
        E.ball.position.y = 1.4;
        E.v = 0.15;
      }
      dwellHold(E, E.plates);
      return;
    }
    const [lo, hi] = BL_BANDS[Math.min(E.round, BL_BANDS.length - 1)];
    if (n) {
      E.v += n * (0.09 + Math.random() * 0.07);
      sfx.punch();
    }
    E.v = Math.max(0.12, E.v - dt * 0.035);
    if (E.v > 1) {
      E.pops++;
      E.v = 0.15;
      sfx.explode();
      burst(E.x + 0.6, 1.6, E.z - 0.6, BL_COL, 30, 7, 0.08, 0.5);
      say(E, L(`ESTOUROU! (${E.pops}/${TRIES})`, `POP! (${E.pops}/${TRIES})`), 'hurt', 0.6, -0.6);
      if (E.pops >= TRIES) {
        dropTarget(E);
        E.ball.visible = false;
        failed(E, L('Balões estourados demais.', 'Too many popped balloons.'));
        return;
      }
    }
    const sc = 0.25 + E.v * 0.75;
    E.ball.scale.setScalar(sc);
    const inBand = E.v >= lo && E.v <= hi;
    const k = Math.round(E.v * 10);
    setTag(E.gauge, [['▮'.repeat(Math.min(10, k)), inBand ? 0x39ff88 : E.v > hi ? 0xff3355 : 0xffd23d], ['▯'.repeat(Math.max(0, 10 - k)), 0x666677]], 0xffffff);
    setLight(E.bmat, inBand ? 0x39ff88 : BL_COL, 1.2 + E.v);
    if (dwell(E, E.plates, dt, 0.4) !== 0) return;
    if (!inBand) {
      sfx.deny();
      say(E, E.v < lo ? L('AINDA MURCHO', 'NOT FULL YET') : L('CHEIO DEMAIS', 'TOO FULL'), 'info', 1.6, 1.3);
      return;
    }
    E.round++;
    sfx.coin();
    say(E, L(`AMARRADO! (${E.round}/3)`, `TIED! (${E.round}/3)`), 'crit', 0.6, -0.6);
    if (E.round >= 3) {
      dropTarget(E);
      E.fly = 99;
      complete(E, 1.25 - E.pops * 0.05, L('FESTA COMPLETA!', 'PARTY READY!'), L('3 balões cheios', '3 balloons filled'), E.x, E.z);
      return;
    }
    E.fly = 1.2;
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na bomba', 'reach the pump') : `${E.round}/3 🎈 · ${E.pops}/${TRIES} 💥`),
  dim(E) {
    dropTarget(E);
    E.ball.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L(`golpeie (ou encoste em) a bomba de ar para encher o balão; ele murcha devagar. Quando a barra ficar verde, fique parado na placa 🎀 para amarrar. Passou de 100% estoura. 3 balões; ${TRIES} estouros e acabou.`, `hit (or touch) the air pump to fill the balloon; it slowly deflates. When the bar turns green, stand still on the 🎀 plate to tie it. Past 100% it pops. 3 balloons; ${TRIES} pops and it is over.`),
});

// ==================================================================
// 113. Bolhas em Ordem: encoste nas bolhas do menor número para o maior
// ==================================================================
const OB_COL = 0x8af0ff;
const OB_N = 7;
const OB_R = 3;
const order = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, OB_R + 0.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(OB_COL, 0.9), 0, 0.03, 0, OB_R + 0.3, 1, OB_R + 0.3);
    const bubbles = [];
    for (let i = 0; i < OB_N; i++) {
      const m = new THREE.Group();
      put(m, sphere(), flatMat(OB_COL, 0.35), 0, 0, 0, 0.45, 0.45, 0.45);
      put(m, sphere(), lightMat(0xffffff, 1.8), 0.15, 0.18, 0.2, 0.07, 0.07, 0.07);
      const t = tag(m, '?', 0xffffff, 0, 0, 0, 0.6);
      m.position.set(0, 1, 0);
      m.visible = false;
      g.add(m);
      bubbles.push({ m, t, v: 0, x: 0, z: 0, vx: 0, vz: 0, on: false, cd: 0 });
    }
    return { kind: 'order', x: s.x, z: s.z, g, bubbles, st: 'idle', miss: 0, got: 0 };
  },
  start(E) {
    const hi = G.floor >= 10 ? 60 : 30;
    const vals = [];
    while (vals.length < OB_N) {
      const v = rint(1, hi);
      if (!vals.includes(v)) vals.push(v);
    }
    E.bubbles.forEach((b, i) => {
      const a = (i / OB_N) * TAU;
      b.v = vals[i];
      b.x = Math.cos(a) * 1.8;
      b.z = Math.sin(a) * 1.8;
      const sa = Math.random() * TAU;
      b.vx = Math.cos(sa) * 0.8;
      b.vz = Math.sin(sa) * 0.8;
      b.on = true;
      b.m.visible = true;
      setTag(b.t, String(b.v), 0xffffff);
    });
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, OB_R)) return;
      E.st = 'run';
      banner(L('BOLHAS EM ORDEM!', 'BUBBLES IN ORDER!'), L('Encoste do menor número para o maior', 'Touch them from the lowest number to the highest'));
      order.start(E);
      return;
    }
    const p = G.player;
    const [lx, lz] = loc(E);
    const live = E.bubbles.filter((b) => b.on);
    const min = Math.min(...live.map((b) => b.v));
    for (const b of live) {
      b.cd = Math.max(0, b.cd - dt);
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      const r = Math.hypot(b.x, b.z);
      if (r > OB_R - 0.4) {
        const nx = b.x / r;
        const nz = b.z / r;
        const dot = b.vx * nx + b.vz * nz;
        if (dot > 0) {
          b.vx -= 2 * dot * nx;
          b.vz -= 2 * dot * nz;
        }
        b.x = nx * (OB_R - 0.4);
        b.z = nz * (OB_R - 0.4);
      }
      b.m.position.set(b.x, 1 + Math.sin(G.t * 2 + b.v) * 0.15, b.z);
      if (!p.alive || b.cd > 0 || Math.hypot(lx - b.x, lz - b.z) > 0.5 + p.r) continue;
      if (b.v === min) {
        b.on = false;
        b.m.visible = false;
        E.got++;
        sfx.seq(E.got % 4);
        burst(E.x + b.x, 1, E.z + b.z, OB_COL, 16, 4, 0.06, 0.4, { up: 1 });
        if (E.got >= OB_N) {
          complete(E, 1.25 - E.miss * 0.05, L('PLOC PLOC PLOC!', 'POP POP POP!'), L(`${OB_N} bolhas em ordem`, `${OB_N} bubbles in order`), E.x, E.z);
          return;
        }
        break;
      }
      b.cd = 1.2;
      const dx = b.x - lx;
      const dz = b.z - lz;
      const l = Math.hypot(dx, dz) || 1;
      b.vx = (dx / l) * 2.2;
      b.vz = (dz / l) * 2.2;
      E.miss++;
      sfx.deny();
      say(E, L(`AINDA NÃO! O MENOR É ${min} (${E.miss}/${TRIES})`, `NOT YET! LOWEST IS ${min} (${E.miss}/${TRIES})`), 'hurt', b.x, b.z);
      if (E.miss >= TRIES) {
        order.dim(E);
        failed(E, L('Bolhas fora de ordem demais.', 'Too many bubbles out of order.'));
        return;
      }
    }
    // perdem a pressa aos poucos, mas nunca param
    for (const b of live) {
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0.9) {
        b.vx *= 1 - dt * 0.8;
        b.vz *= 1 - dt * 0.8;
      }
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'enter the circle') : `${E.got}/${OB_N} 🫧 · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    for (const b of E.bubbles) {
      b.on = false;
      b.m.visible = false;
    }
  },
  intro: () => L(`bolhas com números flutuam no círculo. Encoste nelas do MENOR número para o maior (os números pulam, não são seguidos). Encostar fora de ordem conta erro; ${TRIES} erros e acabou.`, `numbered bubbles float in the circle. Touch them from the LOWEST number to the highest (the numbers skip, they are not consecutive). Touching out of order is a mistake; ${TRIES} mistakes and it is over.`),
});

// ==================================================================
// 114. Cobras e Escadas: role dois dados, escolha um parando na placa e chegue ao 25 antes do robô
// ==================================================================
const LD_COL = 0x7affc8;
const LD_S = 0.9;
const LD_JUMP = { 3: 11, 8: 17, 14: 22, 13: 4, 19: 7, 24: 16 };
const LD_GAMES = 3;
const ldPos = (n) => {
  if (n <= 0) return [-2.5 * LD_S - 0.6, 2 * LD_S];
  const r = Math.floor((n - 1) / 5);
  const c = r % 2 ? 4 - ((n - 1) % 5) : (n - 1) % 5;
  return [(c - 2) * LD_S, (2 - r) * LD_S];
};
function ladderTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const k = 512 / 5;
  for (let n = 1; n <= 25; n++) {
    const [x, z] = ldPos(n);
    const px = (x / LD_S + 2) * k;
    const py = (z / LD_S + 2) * k;
    g.fillStyle = n === 25 ? '#4a3a10' : (Math.floor((n - 1) / 5) + ((n - 1) % 5)) % 2 ? '#1c2438' : '#28324c';
    g.fillRect(px, py, k, k);
    g.strokeStyle = '#3a4a6a';
    g.strokeRect(px, py, k, k);
    g.fillStyle = n === 25 ? '#ffd23d' : '#cfe0ff';
    g.font = 'bold 30px sans-serif';
    g.fillText(n === 25 ? '25 ★' : String(n), px + 8, py + 34);
  }
  const ctr = (n) => {
    const [x, z] = ldPos(n);
    return [(x / LD_S + 2.5) * k, (z / LD_S + 2.5) * k];
  };
  for (const a in LD_JUMP) {
    const b = LD_JUMP[a];
    const [x0, y0] = ctr(+a);
    const [x1, y1] = ctr(b);
    if (b > +a) {
      // escada: dois trilhos e degraus
      const l = Math.hypot(x1 - x0, y1 - y0);
      const nx = (-(y1 - y0) / l) * 12;
      const ny = ((x1 - x0) / l) * 12;
      g.strokeStyle = '#7affc8';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x0 + nx, y0 + ny);
      g.lineTo(x1 + nx, y1 + ny);
      g.moveTo(x0 - nx, y0 - ny);
      g.lineTo(x1 - nx, y1 - ny);
      for (let t = 0.1; t < 1; t += 0.16) {
        g.moveTo(x0 + (x1 - x0) * t + nx, y0 + (y1 - y0) * t + ny);
        g.lineTo(x0 + (x1 - x0) * t - nx, y0 + (y1 - y0) * t - ny);
      }
      g.stroke();
    } else {
      // cobra: curva ondulada com cabeça
      g.strokeStyle = '#ff3355';
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      const mx = (x0 + x1) / 2 + (y1 - y0) * 0.3;
      const my = (y0 + y1) / 2 - (x1 - x0) * 0.3;
      g.quadraticCurveTo(mx, my, x1, y1);
      g.stroke();
      g.fillStyle = '#ff3355';
      g.beginPath();
      g.arc(x0, y0, 15, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(x0 - 7, y0 - 5, 4, 4);
      g.fillRect(x0 + 3, y0 - 5, 4, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ladders = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6, 3.6);
    if (!s) return null;
    const g = scrGroup(s);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(LD_S * 5, LD_S * 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ladderTex() }));
    board.position.y = 0.03;
    g.add(board);
    const plates = [0, 1].map((i) => plate(g, 3.15, (i - 0.5) * 1.5, 1.1, 1.1, LD_COL, 0.9));
    const dice = plates.map((q) => tag(g, '', 0xffffff, q.x, 0.85, q.z, 0.8));
    const me = put(g, cyl(), glowMat(0x3dc7ff, 2), 0, 0.3, 0, 0.18, 0.5, 0.18);
    const rob = put(g, cyl(), glowMat(0xff4df0, 2), 0, 0.3, 0, 0.18, 0.5, 0.18);
    const turn = tag(g, '', 0xffffff, 0, 1.8, -2.8, 0.7, 6);
    const E = { kind: 'ladders', x: s.x, z: s.z, rot: true, g, plates, dice, me, rob, turn, st: 'idle', pos: [0, 0], who: 0, roll: [0, 0], path: [], walk: null, t: 0, lost: 0 };
    ladders.place(E);
    return E;
  },
  place(E) {
    const [x0, z0] = ldPos(E.pos[0]);
    const [x1, z1] = ldPos(E.pos[1]);
    E.me.position.set(x0 - 0.12, 0.3, z0);
    E.rob.position.set(x1 + 0.12, 0.3, z1);
  },
  turn(E) {
    if (E.who === 0) {
      E.roll = [rint(1, 6), rint(1, 6)];
      E.dice.forEach((t, i) => setTag(t, `🎲${E.roll[i]}`, 0xffffff));
      setTag(E.turn, L('sua vez: escolha um dado', 'your turn: pick a die'), 0x3dc7ff);
    } else {
      E.dice.forEach((t) => setTag(t, '', 0xffffff));
      setTag(E.turn, L('vez do robô...', "robot's turn..."), 0xff4df0);
      E.t = 1;
    }
  },
  move(E, who, n) {
    const from = E.pos[who];
    const to = Math.min(25, from + n);
    E.walk = { who, steps: [], t: 0 };
    for (let k = from + 1; k <= to; k++) E.walk.steps.push(k);
    if (LD_JUMP[to]) E.walk.steps.push(LD_JUMP[to]);
    say(E, who ? L(`ROBÔ: ${n}`, `ROBOT: ${n}`) : `${n}!`, 'info', 0, -2.8);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4.2)) return;
      E.st = 'run';
      banner(L('COBRAS E ESCADAS!', 'SNAKES AND LADDERS!'), L('Escolha um dos dois dados e chegue ao 25 antes do robô', 'Pick one of two dice and reach 25 before the robot'));
      ladders.turn(E);
      return;
    }
    if (E.walk) {
      dwellHold(E, E.plates);
      E.walk.t -= dt;
      if (E.walk.t > 0) return;
      const nx = E.walk.steps.shift();
      if (nx == null) {
        const who = E.walk.who;
        E.walk = null;
        if (E.pos[who] >= 25) {
          if (!who) {
            complete(E, 1.4 - E.lost * 0.1, L('CHEGOU NO 25!', 'REACHED 25!'), L('você venceu o robô', 'you beat the robot'), E.x, E.z);
            return;
          }
          E.lost++;
          sfx.deny();
          say(E, L(`O ROBÔ CHEGOU PRIMEIRO (${E.lost}/${LD_GAMES})`, `THE ROBOT GOT THERE FIRST (${E.lost}/${LD_GAMES})`), 'hurt');
          if (E.lost >= LD_GAMES) {
            failed(E, L('O robô venceu nas cobras e escadas.', 'The robot won at snakes and ladders.'));
            return;
          }
          E.pos = [0, 0];
          ladders.place(E);
          E.who = 0;
          ladders.turn(E);
          return;
        }
        E.who = 1 - who;
        ladders.turn(E);
        return;
      }
      const jump = Math.abs(nx - E.pos[E.walk.who]) > 1;
      if (jump) {
        if (nx > E.pos[E.walk.who]) sfx.upgrade();
        else sfx.deny();
        say(E, nx > E.pos[E.walk.who] ? L('ESCADA!', 'LADDER!') : L('COBRA!', 'SNAKE!'), nx > E.pos[E.walk.who] ? 'crit' : 'hurt', ...ldPos(nx));
      } else sfx.click();
      E.pos[E.walk.who] = nx;
      ladders.place(E);
      E.walk.t = jump ? 0.6 : 0.22;
      return;
    }
    if (E.who === 1) {
      E.t -= dt;
      if (E.t <= 0) ladders.move(E, 1, rint(1, 6));
      return;
    }
    const k = dwell(E, E.plates, dt, 0.4);
    if (k >= 0) ladders.move(E, 0, E.roll[k]);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no tabuleiro', 'reach the board') : `${L('você', 'you')} ${E.pos[0]} · 🤖 ${E.pos[1]} · ${E.lost}/${LD_GAMES} ✖`),
  dim(E) {
    E.dice.forEach((t) => setTag(t, '', 0xffffff));
    setTag(E.turn, E.st === 'done' ? '🏆' : '✖', 0xffffff);
  },
  intro: () => L(`você é o pino azul, o robô é o rosa. Na sua vez, dois dados aparecem nas placas ao lado: fique parado em uma para andar aquele número. Escadas (verdes) sobem, cobras (vermelhas) descem. Chegue ao 25 antes do robô; você pode perder ${LD_GAMES - 1} partidas.`, `you are the blue pawn, the robot is pink. On your turn two dice appear on the plates beside the board: stand still on one to move that many squares. Ladders (green) go up, snakes (red) go down. Reach 25 before the robot; you can lose ${LD_GAMES - 1} games.`),
});

// ==================================================================
// 115. Qual Vem Depois?: complete a sequência (números, cores, luas, relógios). 5 acertos
// ==================================================================
const PT_COL = 0xff9a3d;
const PT_NEED = 5;
function ptMake(f) {
  const r = rint(0, f >= 10 ? 8 : 6);
  if (r === 0) {
    const a = rint(1, 9);
    const b = rint(2, 9);
    return { seq: [a, a + b, a + 2 * b, a + 3 * b].join(', '), ans: String(a + 4 * b), alt: [a + 4 * b + rint(1, 3), a + 4 * b - rint(1, 3), a + 5 * b].map(String) };
  }
  if (r === 1) {
    const a = rint(30, 60);
    const b = rint(2, 7);
    return { seq: [a, a - b, a - 2 * b, a - 3 * b].join(', '), ans: String(a - 4 * b), alt: [a - 4 * b + 1, a - 5 * b, a - 4 * b - 2].map(String) };
  }
  if (r === 2) {
    const a = rint(1, 4);
    const m = rint(2, 3);
    return { seq: [a, a * m, a * m * m, a * m ** 3].join(', '), ans: String(a * m ** 4), alt: [a * m ** 3 + a * m, a * m ** 4 + m, a * m ** 3 * (m + 1)].map(String) };
  }
  if (r === 3) {
    const set = mshuffle(['🔴', '🔵', '🟢', '🟡', '🟣']);
    const [A, B, C] = set;
    if (Math.random() < 0.5) return { seq: [A, B, A, B, A].join(' '), ans: B, alt: [A, C, set[3]] };
    return { seq: [A, A, B, A, A].join(' '), ans: B, alt: [A, C, set[3]] };
  }
  if (r === 4) {
    const moon = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const s = rint(0, 7);
    const st = Math.random() < 0.5 ? 1 : 2;
    const at = (k) => moon[(s + k * st) % 8];
    return { seq: [at(0), at(1), at(2), at(3)].join(' '), ans: at(4), alt: [at(5), at(3), moon[(s + 4 * st + 3) % 8]] };
  }
  if (r === 5) {
    const clk = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
    const s = rint(0, 11);
    const st = rint(1, 3);
    const at = (k) => clk[(s + k * st) % 12];
    return { seq: [at(0), at(1), at(2), at(3)].join(' '), ans: at(4), alt: [at(5), clk[(s + 4 * st + 1) % 12], clk[(s + 4 * st + 11) % 12]] };
  }
  if (r === 6) {
    const a = rint(1, 6);
    return { seq: [a * a, (a + 1) ** 2, (a + 2) ** 2, (a + 3) ** 2].join(', '), ans: String((a + 4) ** 2), alt: [(a + 4) ** 2 + 2, (a + 3) ** 2 + 2 * a + 1, (a + 4) ** 2 - 3].map(String) };
  }
  if (r === 7) {
    let x = rint(1, 3);
    let y = rint(x, 5);
    const out = [x, y];
    for (let k = 0; k < 3; k++) {
      const z = x + y;
      out.push(z);
      x = y;
      y = z;
    }
    return { seq: out.join(', '), ans: String(x + y), alt: [x + y + 1, y * 2, x + y - 2].map(String) };
  }
  const a = rint(1, 5);
  return { seq: [a, a + 1, a + 3, a + 6].join(', '), ans: String(a + 10), alt: [a + 9, a + 12, a + 8].map(String) };
}
const pattern = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3, 2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const { plates, labels } = choicePlates(g, 3, PT_COL, 2, 0.8, 1.5, 1.5);
    const board = tag(g, '?', 0xffffff, 0, 1.8, -1.1, 1, 7);
    return { kind: 'pattern', x: s.x, z: s.z, g, plates, labels, board, st: 'idle', ok: 0, miss: 0, right: 0, phase: 'q', t: 0, ans: '' };
  },
  ask(E) {
    const q = ptMake(G.floor);
    const alts = q.alt.filter((v) => v !== q.ans && v !== '' && !String(v).startsWith('-'));
    const opts = [q.ans, ...[...new Set(alts)].slice(0, 2)];
    while (opts.length < 3) opts.push(String(rint(1, 99)));
    mshuffle(opts);
    E.right = opts.indexOf(q.ans);
    E.ans = q.ans;
    opts.forEach((v, i) => setTag(E.labels[i], v, 0xffffff));
    setTag(E.board, `${q.seq}, ?`, 0xffd23d);
    lit(E.plates, PT_COL);
    E.phase = 'q';
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('QUAL VEM DEPOIS?', 'WHAT COMES NEXT?'), L('Fique na placa que continua a sequência', 'Stand on the plate that continues the sequence'));
      pattern.ask(E);
      return;
    }
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) pattern.ask(E);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.45);
    if (k < 0) return;
    E.phase = 'res';
    E.t = 1.4;
    setLight(E.plates[E.right].ring, 0x39ff88, 2.6);
    if (k === E.right) {
      E.ok++;
      sfx.coin();
      say(E, L('ISSO!', 'YES!'), 'crit');
    } else {
      E.miss++;
      sfx.deny();
      setLight(E.plates[k].ring, 0xff3355, 2.6);
      say(E, L(`ERA ${E.ans} (${E.miss}/${TRIES})`, `IT WAS ${E.ans} (${E.miss}/${TRIES})`), 'hurt');
    }
    if (E.ok >= PT_NEED) complete(E, 1.25, L('MENTE BRILHANTE!', 'BRILLIANT MIND!'), L(`${E.ok} sequências`, `${E.ok} sequences`), E.x, E.z);
    else if (E.miss >= TRIES) failed(E, L('Sequências erradas demais.', 'Too many wrong sequences.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no painel', 'reach the panel') : `${E.ok}/${PT_NEED} ✔ · ${E.miss}/${TRIES} ✖`),
  dim(E) {
    setTag(E.board, E.st === 'done' ? '✔' : '✖', 0xffffff);
    for (const t of E.labels) t.visible = false;
  },
  intro: () => L(`o painel mostra uma sequência (números, cores, luas ou relógios). Fique parado na placa com o que vem depois. ${PT_NEED} acertos; ${TRIES} erros e acabou.`, `the panel shows a sequence (numbers, colors, moons or clocks). Stand still on the plate with what comes next. ${PT_NEED} right; ${TRIES} wrong and it is over.`),
});

// ==================================================================
// 116. Anéis Alinhados: cada alavanca gira dois anéis; alinhe as 3 brechas com a seta
// ==================================================================
const RG_COL = 0xc77bff;
const RG_R = [0.9, 1.45, 2];
const RG_LEV = [
  [0, 1],
  [1, 2],
  [0, 2],
];
const RG_GAP = 0.75;
const rings = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.2, 3.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const cols = [0xff3355, 0x39ff88, 0x3dc7ff];
    const meshes = RG_R.map((r, i) => {
      const geo = new THREE.RingGeometry(r - 0.16, r, 48, 1, RG_GAP / 2, TAU - RG_GAP).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, lightMat(cols[i], 1.4));
      m.position.y = 0.05 + i * 0.01;
      g.add(m);
      return m;
    });
    // seta do alvo (para -z)
    put(g, mats().cone, glowMat(0xffffff, 2.4), 0, 0.15, -2.45, 2.4, 2.4, 2.4).rotation.y = Math.PI;
    put(g, box(0.12, 0.04, 2.1), flatMat(0xffffff, 0.18), 0, 0.03, -1.05);
    // posição inicial: alavancadas a partir do resolvido (sempre tem solução)
    const pos = [0, 0, 0];
    for (let t = 0; t < 8 || pos.every((v) => !v); t++) for (const i of RG_LEV[ri(0, 2)]) pos[i] = (pos[i] + 1) % 4;
    const levers = RG_LEV.map((pair, i) => {
      const lx = [-2.6, 0, 2.6][i];
      const lz = [2.4, 2.9, 2.4][i];
      put(g, box(0.5, 0.7, 0.4), mats().metal, lx, 0.35, lz);
      put(g, mats().cyl, glowMat(RG_COL, 2), lx, 0.75, lz, 0.2, 0.1, 0.2);
      tag(g, [[`${pair[0] + 1}`, cols[pair[0]]], ['+', 0xffffff], [`${pair[1] + 1}`, cols[pair[1]]]], 0xffffff, lx, 1.35, lz, 0.6, 2.2);
      return { pair, x: lx, z: lz, e: hitTarget(s.x + lx, s.z + lz, 0.42, 1, L('Alavanca', 'Lever')), hits: 0 };
    });
    const E = { kind: 'rings', x: s.x, z: s.z, g, meshes, levers, pos, ang: pos.map((v) => v * (Math.PI / 2)), st: 'idle', moves: 0 };
    return E;
  },
  update(E, dt) {
    E.meshes.forEach((m, i) => {
      const tgt = Math.PI / 2 + E.pos[i] * (Math.PI / 2);
      E.ang[i] += (tgt - E.ang[i]) * Math.min(1, dt * 8);
      m.rotation.y = E.ang[i];
    });
    for (const lv of E.levers) {
      const n = hitsOn(lv);
      if (!n || E.st !== 'run') continue;
      for (const i of lv.pair) E.pos[i] = (E.pos[i] + 1) % 4;
      E.moves++;
      sfx.spin();
      if (E.pos.every((v) => !v)) {
        for (const q of E.levers) dropTarget(q);
        complete(E, E.moves <= 6 ? 1.6 : 1.25, L('ALINHADO!', 'ALIGNED!'), L(`${E.moves} alavancadas`, `${E.moves} pulls`), E.x, E.z, { extra: E.moves <= 6 });
        return;
      }
    }
    if (E.st === 'idle' && near(E, 4.2)) {
      E.st = 'run';
      banner(L('ANÉIS ALINHADOS!', 'ALIGNED RINGS!'), L('Golpeie as alavancas para girar os anéis', 'Hit the levers to turn the rings'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nos anéis', 'reach the rings') : `${E.pos.filter((v) => !v).length}/3 ✔ · ${E.moves} ${L('giros', 'turns')}`),
  dim(E) {
    for (const q of E.levers) dropTarget(q);
    if (E.st === 'done') E.pos = [0, 0, 0];
  },
  reload(E) {
    for (const q of E.levers) {
      q.e.hp = q.e.maxHp;
      q.hits = 0;
    }
  },
  intro: () => L('3 anéis com uma brecha cada. Cada alavanca gira dois anéis um quarto de volta (os números em cima dizem quais). Golpeie (ou encoste em) as alavancas até as 3 brechas apontarem para a seta branca.', '3 rings with a gap each. Each lever turns two rings a quarter turn (the numbers above say which). Hit (or touch) the levers until all 3 gaps point at the white arrow.'),
});

// ==================================================================
// 117. Batalha Naval: fique parado numa casa para atirar; afunde os 3 navios escondidos
// ==================================================================
const NV_COL = 0x3d8bff;
const NV_N = 5;
const NV_S = 1.05;
const NV_SHOTS = 17;
const navy = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.9);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const inst = new THREE.InstancedMesh(box(NV_S - 0.08, 0.05, NV_S - 0.08), new THREE.MeshLambertMaterial({ color: 0xffffff }), NV_N * NV_N);
    const m4 = new THREE.Matrix4();
    const cells = [];
    for (let c = 0; c < NV_N * NV_N; c++) {
      const x = ((c % NV_N) - (NV_N - 1) / 2) * NV_S;
      const z = (Math.floor(c / NV_N) - (NV_N - 1) / 2) * NV_S;
      inst.setMatrixAt(c, m4.makeTranslation(x, 0.03, z));
      cells.push({ x, z, w: NV_S, h: NV_S, fill: { opacity: 0 }, ship: -1, shot: false });
    }
    g.add(inst);
    // navios (3, 2 e 2 casas), sem encostar um no outro
    const ships = [];
    for (const len of [3, 2, 2]) {
      for (let t = 0; t < 200; t++) {
        const hz = ri(0, 1);
        const x0 = ri(0, NV_N - (hz ? len : 1));
        const z0 = ri(0, NV_N - (hz ? 1 : len));
        const list = [];
        for (let k = 0; k < len; k++) list.push((z0 + (hz ? 0 : k)) * NV_N + x0 + (hz ? k : 0));
        const bad = list.some((c) => cells.some((q, j) => q.ship >= 0 && Math.abs((j % NV_N) - (c % NV_N)) <= 1 && Math.abs(Math.floor(j / NV_N) - Math.floor(c / NV_N)) <= 1));
        if (bad) continue;
        list.forEach((c) => (cells[c].ship = ships.length));
        ships.push({ list, hit: 0 });
        break;
      }
    }
    const flames = [];
    for (let k = 0; k < 7; k++) {
      const f = put(g, mats().cone, glowMat(0xff6a1a, 2.4), 0, 0.3, 0, 2, 2, 2);
      f.rotation.x = -Math.PI / 2;
      f.visible = false;
      flames.push(f);
    }
    const E = { kind: 'navy', x: s.x, z: s.z, g, inst, cells, ships, flames, st: 'idle', shots: NV_SHOTS, hits: 0, sunk: 0 };
    navy.paint(E);
    return E;
  },
  paint(E) {
    const c = new THREE.Color();
    E.cells.forEach((q, i) => {
      c.setHex(!q.shot ? (E.st === 'idle' ? 0x1a2a4a : 0x2a4a8a) : q.ship >= 0 ? 0x6a1a10 : 0x0a1424);
      E.inst.setColorAt(i, c);
    });
    E.inst.instanceColor.needsUpdate = true;
  },
  update(E, dt) {
    for (const f of E.flames) if (f.visible) f.scale.set(2, 1.6 + Math.sin(G.t * 12 + f.position.x * 5) * 0.5, 2);
    if (E.st === 'idle') {
      if (!near(E, 3.6)) return;
      E.st = 'run';
      banner(L('BATALHA NAVAL!', 'BATTLESHIP!'), L('Fique parado numa casa para atirar', 'Stand still on a square to fire'));
      navy.paint(E);
      return;
    }
    const k = dwell(E, E.cells, dt, 0.35);
    if (k < 0) return;
    const q = E.cells[k];
    if (q.shot) {
      say(E, L('JÁ ATIROU AÍ', 'ALREADY FIRED THERE'), 'info', q.x, q.z);
      return;
    }
    q.shot = true;
    E.shots--;
    if (q.ship >= 0) {
      const sh = E.ships[q.ship];
      sh.hit++;
      const f = E.flames[E.hits];
      f.position.set(q.x, 0.3, q.z);
      f.visible = true;
      E.hits++;
      sfx.explode();
      burst(E.x + q.x, 0.5, E.z + q.z, 0xff7a1a, 18, 5, 0.08, 0.5, { up: 2 });
      if (sh.hit >= sh.list.length) {
        E.sunk++;
        say(E, L(`AFUNDOU! (${E.sunk}/${E.ships.length})`, `SUNK! (${E.sunk}/${E.ships.length})`), 'crit', q.x, q.z);
      } else say(E, L('FOGO!', 'HIT!'), 'crit', q.x, q.z);
    } else {
      sfx.click();
      burst(E.x + q.x, 0.3, E.z + q.z, 0x9ad7ff, 12, 3, 0.06, 0.4, { up: 2.5 });
      say(E, L('ÁGUA', 'SPLASH'), 'info', q.x, q.z);
    }
    navy.paint(E);
    if (E.sunk >= E.ships.length) complete(E, 1.2 + E.shots * 0.04, L('FROTA AFUNDADA!', 'FLEET SUNK!'), L(`sobraram ${E.shots} tiros`, `${E.shots} shots left`), E.x, E.z, { extra: E.shots >= 4 });
    else if (E.shots <= 0) failed(E, L('Acabaram os tiros e a frota escapou.', 'Out of shots: the fleet got away.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no mar', 'reach the sea') : `🚢 ${E.sunk}/${E.ships.length} · ${E.shots} ${L('tiros', 'shots')}`),
  dim(E) {
    for (const q of E.cells) q.shot = true;
    navy.paint(E);
  },
  intro: () => L(`3 navios (de 3, 2 e 2 casas, sem encostar um no outro) estão escondidos no mar. Fique parado numa casa para atirar: fogo é acerto, água é erro. Afunde todos com ${NV_SHOTS} tiros.`, `3 ships (3, 2 and 2 squares long, never touching each other) hide in the sea. Stand still on a square to fire: fire means hit, a splash means miss. Sink them all with ${NV_SHOTS} shots.`),
});

// ==================================================================
// 118. Duelo ao Meio-Dia: espere o "FOGO!" e golpeie o gongo antes do robô (antes da hora é falta)
// ==================================================================
const DU_COL = 0xffb347;
const DU_NEED = 3;
const duel = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2, 3.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const b = bot(g, 0xffb347, 0, -2.8, 1.1);
    put(b.m, box(0.7, 0.08, 0.7), mats().dark, 0, 1.6, 0);
    put(b.m, box(0.4, 0.25, 0.4), mats().dark, 0, 1.75, 0);
    const start = plate(g, 0, 2.4, 1.3, 1.3, DU_COL);
    put(g, box(0.1, 1.2, 0.1), mats().metal, -0.45, 0.6, 0.9);
    put(g, box(0.1, 1.2, 0.1), mats().metal, 0.45, 0.6, 0.9);
    const gongM = glowMat(DU_COL, 1.4);
    const gong = put(g, cyl(), gongM, 0, 0.8, 0.9, 0.38, 0.06, 0.38);
    gong.rotation.x = Math.PI / 2;
    const sign = tag(g, '', 0xffffff, 0, 2.6, -0.6, 1.1, 5);
    const e = hitTarget(s.x, s.z + 0.9, 0.45, 1.2, L('Gongo', 'Gong'));
    return { kind: 'duel', x: s.x, z: s.z, g, b, start, plates: [start], gong, gongM, sign, e, hits: 0, st: 'idle', phase: 'wait', t: 0, me: 0, rob: 0, react: 0, fake: -1 };
  },
  round(E) {
    E.phase = 'ready';
    E.t = 1.8 + Math.random() * 3;
    E.fake = G.floor >= 8 && Math.random() < 0.45 ? E.t * (0.3 + Math.random() * 0.4) : -1;
    E.react = Math.max(0.34, 0.62 - G.floor * 0.004) + Math.random() * 0.12;
    setTag(E.sign, L('PREPARAR...', 'READY...'), 0xffffff);
    setLight(E.b.eye, 0xffb347, 2.2);
  },
  update(E, dt) {
    const n = hitsOn(E);
    face(E.b, 0, 1);
    if (E.st === 'idle') {
      if (dwell(E, E.plates, dt, 0.4) !== 0) return;
      E.st = 'run';
      banner(L('DUELO AO MEIO-DIA!', 'HIGH NOON DUEL!'), L('Golpeie o gongo só depois do FOGO!', 'Hit the gong only after FIRE!'));
      duel.round(E);
      return;
    }
    E.t -= dt;
    if (E.phase === 'res') {
      if (E.t <= 0) duel.round(E);
      return;
    }
    if (E.phase === 'ready') {
      if (E.fake > 0 && E.t <= E.fake) {
        E.fake = -1;
        setTag(E.sign, L('FOGUETE!', 'FIREWORK!'), 0xff9aff);
        sfx.click();
      }
      if (n) {
        E.rob++;
        sfx.deny();
        say(E, L(`QUEIMOU A LARGADA! (${E.rob}/${TRIES})`, `TOO EARLY! (${E.rob}/${TRIES})`), 'hurt', 0, 0.9);
        duel.end(E);
        return;
      }
      if (E.t > 0) return;
      E.phase = 'fire';
      E.t = E.react;
      setTag(E.sign, L('FOGO!', 'FIRE!'), 0xff3355);
      sfx.alarm();
      return;
    }
    // FOGO!: quem golpear primeiro vence
    if (n) {
      E.me++;
      sfx.coin();
      setLight(E.gongM, 0xffffff, 2.6);
      setLight(E.b.eye, 0x333344, 1);
      say(E, L(`MAIS RÁPIDO! (${E.me}/${DU_NEED})`, `FASTER! (${E.me}/${DU_NEED})`), 'crit', 0, -2.8);
      duel.end(E);
      return;
    }
    if (E.t > 0) return;
    E.rob++;
    eventHurt(0.04, E.x, E.z - 2.8, 4);
    burst(E.x, 1.2, E.z - 2.4, 0xffd23d, 12, 6, 0.06, 0.3);
    sfx.shoot();
    say(E, L(`O ROBÔ FOI MAIS RÁPIDO (${E.rob}/${TRIES})`, `THE ROBOT WAS FASTER (${E.rob}/${TRIES})`), 'hurt');
    duel.end(E);
  },
  end(E) {
    E.phase = 'res';
    E.t = 2;
    setTag(E.sign, `${E.me} × ${E.rob}`, 0xffffff);
    if (E.me >= DU_NEED) {
      dropTarget(E);
      complete(E, 1.3, L('O MAIS RÁPIDO DO OESTE!', 'FASTEST IN THE WEST!'), `${E.me} × ${E.rob}`, E.x, E.z);
    } else if (E.rob >= TRIES) {
      dropTarget(E);
      failed(E, L('O robô venceu o duelo.', 'The robot won the duel.'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('pare na placa', 'stand on the plate') : `${E.me}/${DU_NEED} 🤠 · ${E.rob}/${TRIES} ✖`),
  dim(E) {
    dropTarget(E);
    setTag(E.sign, E.st === 'done' ? '🏆' : '✖', 0xffffff);
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L(`fique parado na placa para começar. Quando aparecer "FOGO!" no alto, golpeie (ou encoste em) o gongo antes do robô atirar. Golpear antes da hora é falta (cuidado com o "FOGUETE!"). ${DU_NEED} vitórias; ${TRIES} derrotas e acabou.`, `stand still on the plate to start. When "FIRE!" shows up above, hit (or touch) the gong before the robot shoots. Hitting early is a foul (watch out for "FIREWORK!"). ${DU_NEED} wins; ${TRIES} losses and it is over.`),
});

// ==================================================================
// 119. Câmeras de Segurança: atravesse a sala até o cofre sem entrar no cone de visão das câmeras
// ==================================================================
const ST_COL = 0x39ff88;
const ST_HX = 3.4;
const ST_HZ = 3;
const ST_RANGE = 3.9;
const ST_HALF = 0.36;
const stealth = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, ST_HX + 0.3, ST_HZ + 0.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const edge = lightMat(0x5a6a8a, 0.8);
    put(g, box(ST_HX * 2, 0.04, 0.08), edge, 0, 0.03, -ST_HZ);
    put(g, box(ST_HX * 2, 0.04, 0.08), edge, 0, 0.03, ST_HZ);
    put(g, box(0.08, 0.04, ST_HZ * 2), edge, -ST_HX, 0.03, 0);
    put(g, box(0.08, 0.04, ST_HZ * 2), edge, ST_HX, 0.03, 0);
    const start = plate(g, 0, ST_HZ - 0.5, 1.2, 0.9, ST_COL);
    const vault = put(g, box(0.9, 0.9, 0.7), glowMat(0xffd23d, 1.2), 0, 0.45, -ST_HZ + 0.4);
    const geo = new THREE.CircleGeometry(ST_RANGE, 18, -ST_HALF, ST_HALF * 2).rotateX(-Math.PI / 2);
    const spots = [
      [-ST_HX, -1.1, 0, 1],
      [ST_HX, 0.4, Math.PI, -1],
      [-ST_HX, 1.7, 0, -1],
    ].slice(0, floor >= 10 ? 3 : 2);
    if (floor < 10) spots[1] = [ST_HX, 0.6, Math.PI, -1];
    const cams = spots.map(([x, z, base, dir], i) => {
      put(g, box(0.15, 1.6, 0.15), mats().metal, x, 0.8, z);
      const head = put(g, box(0.4, 0.25, 0.25), mats().dark, x, 1.65, z);
      const mat = flatMat(0xff3355, 0.22);
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(x, 0.04 + i * 0.003, z);
      g.add(cone);
      return { x, z, base, dir, head, cone, mat, a: base, ph: i * 1.7, w: 0.75 + i * 0.12 };
    });
    return { kind: 'stealth', x: s.x, z: s.z, g, start, plates: [start], vault, cams, st: 'idle', caught: 0, grace: 0, t: 0 };
  },
  update(E, dt) {
    E.t += dt;
    const [lx, lz] = loc(E);
    for (const c of E.cams) {
      c.a = c.base + c.dir * Math.sin(E.t * c.w + c.ph) * 0.95;
      c.cone.rotation.y = c.a;
      c.head.rotation.y = c.a;
    }
    if (E.st === 'idle') {
      if (dwell(E, E.plates, dt, 0.3) !== 0) return;
      E.st = 'run';
      banner(L('CÂMERAS DE SEGURANÇA!', 'SECURITY CAMERAS!'), L('Chegue ao cofre sem ser visto', 'Reach the vault unseen'));
      return;
    }
    E.grace = Math.max(0, E.grace - dt);
    const p = G.player;
    if (!p.alive) return;
    if (Math.hypot(lx, lz + ST_HZ - 0.4) < 0.9) {
      complete(E, 1.3 - E.caught * 0.06, L('INVISÍVEL!', 'UNSEEN!'), L(`pego ${E.caught} vezes`, `caught ${E.caught} times`), E.x, E.z - ST_HZ + 0.4, { extra: !E.caught });
      return;
    }
    let seen = false;
    for (const c of E.cams) {
      const dx = lx - c.x;
      const dz = lz - c.z;
      const r = Math.hypot(dx, dz);
      // ângulo da câmera: rotation.y = a aponta para (cos a, -sin a)
      const diff = Math.atan2(Math.sin(Math.atan2(-dz, dx) - c.a), Math.cos(Math.atan2(-dz, dx) - c.a));
      const inCone = r < ST_RANGE && Math.abs(diff) < ST_HALF;
      c.mat.color.setHex(inCone ? 0xffffff : 0xff3355);
      if (inCone) seen = true;
    }
    if (!seen || E.grace > 0 || !inBox(E, ST_HX, ST_HZ)) return;
    E.caught++;
    E.grace = 1.5;
    sfx.alarm();
    eventHurt(0.04, p.x, p.z, 0);
    say(E, L(`VISTO! (${E.caught}/${TRIES})`, `SPOTTED! (${E.caught}/${TRIES})`), 'hurt', lx, lz);
    if (E.caught >= TRIES) {
      failed(E, L('As câmeras pegaram você vezes demais.', 'The cameras caught you too many times.'));
      return;
    }
    sendTo(E, 0, ST_HZ - 0.5);
  },
  hud: (E) => (E.st === 'idle' ? L('pare na placa verde', 'stand on the green plate') : `${L('visto', 'seen')} ${E.caught}/${TRIES}`),
  dim(E) {
    for (const c of E.cams) c.cone.visible = false;
  },
  intro: () => L(`fique parado na placa verde para começar e atravesse a sala até o cofre dourado. As câmeras giram de um lado para o outro: se você entrar num cone vermelho, o alarme toca e você volta ao começo. ${TRIES} alarmes e acabou.`, `stand still on the green plate to start, then cross the room to the golden vault. The cameras sweep back and forth: step into a red cone and the alarm sends you back to the start. ${TRIES} alarms and it is over.`),
});

// ==================================================================
// 120. Copie o Desenho: decore o desenho do quadro, pinte o mesmo no chão e pare na placa ✔
// ==================================================================
const CP_COL = 0xff4df0;
const CP_N = 4;
const CP_S = 1;
function cpSprite(parent, x, y, z) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(1.6, 1.6, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 6;
  sp.userData.c = c;
  parent.add(sp);
  return sp;
}
function cpDraw(sp, cells) {
  const c = sp.userData.c;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,24,0.9)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ff4df0';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  const k = 120 / CP_N;
  for (let i = 0; i < CP_N * CP_N; i++) {
    g.fillStyle = cells && cells[i] ? '#ff4df0' : '#252a3a';
    g.fillRect(4 + (i % CP_N) * k + 2, 4 + Math.floor(i / CP_N) * k + 2, k - 4, k - 4);
  }
  if (!cells) {
    g.fillStyle = '#ffffff';
    g.font = 'bold 64px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', 64, 68);
  }
  sp.material.map.needsUpdate = true;
}
const copy = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4, 3.4);
    if (!s) return null;
    const g = scrGroup(s);
    const ox = 0.7;
    const inst = new THREE.InstancedMesh(box(CP_S - 0.08, 0.05, CP_S - 0.08), new THREE.MeshLambertMaterial({ color: 0xffffff }), CP_N * CP_N);
    const m4 = new THREE.Matrix4();
    const cells = [];
    for (let c = 0; c < CP_N * CP_N; c++) {
      const x = ox + ((c % CP_N) - (CP_N - 1) / 2) * CP_S;
      const z = (Math.floor(c / CP_N) - (CP_N - 1) / 2) * CP_S;
      inst.setMatrixAt(c, m4.makeTranslation(x, 0.03, z));
      cells.push({ x, z, w: CP_S, h: CP_S, fill: { opacity: 0 } });
    }
    g.add(inst);
    const check = plate(g, -2.3, 1.2, 1, 1, 0x39ff88, 0.9);
    tag(g, '✔', 0x39ff88, -2.3, 0.7, 1.2, 0.7);
    put(g, box(0.1, 1.4, 0.1), mats().metal, -2.3, 0.7, -0.9);
    const model = cpSprite(g, -2.3, 2.1, -0.9);
    cpDraw(model, null);
    const plates = [...cells, check];
    const sizes = floor >= 15 ? [5, 6, 8] : [5, 7];
    const E = { kind: 'copy', x: s.x, z: s.z, rot: true, g, inst, cells, check, plates, model, sizes, st: 'idle', round: 0, miss: 0, want: [], have: new Array(CP_N * CP_N).fill(false), phase: 'wait', t: 0 };
    copy.paint(E);
    return E;
  },
  paint(E) {
    const c = new THREE.Color();
    for (let i = 0; i < E.cells.length; i++) {
      c.setHex(E.have[i] ? CP_COL : 0x2a3044);
      E.inst.setColorAt(i, c);
    }
    E.inst.instanceColor.needsUpdate = true;
  },
  newDrawing(E) {
    const n = E.sizes[E.round];
    const pick = mshuffle([...Array(CP_N * CP_N).keys()]).slice(0, n);
    E.want = new Array(CP_N * CP_N).fill(false);
    for (const i of pick) E.want[i] = true;
    E.have.fill(false);
    copy.paint(E);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('COPIE O DESENHO!', 'COPY THE DRAWING!'), L('Decore o quadro e pinte igual no chão', 'Memorize the board and paint the same on the floor'));
      copy.newDrawing(E);
      E.phase = 'wait';
      E.t = 0.5;
      E.showT = 5;
      return;
    }
    if (E.phase === 'wait' || E.phase === 'show') {
      dwellHold(E, E.plates);
      if (waitFoes(E)) {
        cpDraw(E.model, null);
        E.phase = 'wait';
        E.t = 0.5;
        return;
      }
      E.t -= dt;
      if (E.t > 0) return;
      if (E.phase === 'wait') {
        E.phase = 'show';
        E.t = E.showT;
        cpDraw(E.model, E.want);
        return;
      }
      cpDraw(E.model, null);
      E.phase = 'paint';
      return;
    }
    const k = dwell(E, E.plates, dt, 0.35);
    if (k < 0) return;
    if (k < E.cells.length) {
      E.have[k] = !E.have[k];
      sfx.click();
      copy.paint(E);
      return;
    }
    // placa ✔: confere
    const ok = E.want.every((v, i) => v === E.have[i]);
    if (ok) {
      E.round++;
      sfx.coin();
      say(E, L('IGUALZINHO!', 'SPOT ON!'), 'crit');
      if (E.round >= E.sizes.length) {
        cpDraw(E.model, E.want);
        complete(E, 1.3 - E.miss * 0.05, L('ARTISTA NEON!', 'NEON ARTIST!'), L(`${E.round} desenhos`, `${E.round} drawings`), E.x, E.z);
        return;
      }
      copy.newDrawing(E);
      E.phase = 'wait';
      E.t = 0.8;
      E.showT = 5;
      return;
    }
    E.miss++;
    sfx.deny();
    const wrong = E.want.reduce((a, v, i) => a + (v !== E.have[i] ? 1 : 0), 0);
    say(E, L(`${wrong} QUADRADOS ERRADOS (${E.miss}/${TRIES})`, `${wrong} SQUARES WRONG (${E.miss}/${TRIES})`), 'hurt');
    if (E.miss >= TRIES) {
      cpDraw(E.model, E.want);
      failed(E, L('O desenho não saiu igual.', 'The drawing did not match.'));
      return;
    }
    // mostra o modelo de novo (o que você pintou fica)
    E.phase = 'wait';
    E.t = 0.3;
    E.showT = 3;
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no quadro', 'reach the board') : E.phase === 'paint' ? `${E.round}/${E.sizes.length} · ${E.miss}/${TRIES} ✖` : L('decore!', 'memorize!')),
  dim(E) {
    cpDraw(E.model, null);
  },
  intro: () => L(`o quadro ao lado mostra um desenho por alguns segundos (só com a área sem inimigos). Fique parado nos quadrados do chão para pintar ou apagar e copie o desenho; depois pare na placa ✔ para conferir (errou, o quadro mostra de novo). ${TRIES} erros e acabou.`, `the board beside it shows a drawing for a few seconds (only with no enemies around). Stand still on the floor squares to paint or erase them and copy the drawing; then stand on the ✔ plate to check (a mistake shows the board again). ${TRIES} mistakes and it is over.`),
});

// ------------------------------------------------------------------
// Registro (events.js lê estas tabelas)
// ------------------------------------------------------------------
export const NEW4_KIND = { whack, golf, pac, wires, shadow, count, truth, hanoi, slide, code, nim, darts, crane, fire, tilt, sort, where, knight, keeper, traffic, block, balloon, order, ladders, pattern, rings, navy, duel, stealth, copy };
export const NEW4_IDS = Object.keys(NEW4_KIND);
export const NEW4_INFO = {
  whack: { icon: '🐹', css: '#ffb347', name: L('Acerte a Toupeira', 'Whack-a-Mole'), short: L('Toupeira', 'Moles') },
  golf: { icon: '⛳', css: '#39ff88', name: L('Minigolfe', 'Mini Golf'), short: L('Golfe', 'Golf') },
  pac: { icon: '👾', css: '#ffd23d', name: L('Come-Come', 'Muncher'), short: L('Come-Come', 'Muncher') },
  wires: { icon: '✂️', css: '#ff5a2d', name: L('Corte o Fio', 'Cut the Wire'), short: L('Fios', 'Wires') },
  shadow: { icon: '👤', css: '#9ad7ff', name: L('Qual é a Sombra?', 'Whose Shadow?'), short: L('Sombra', 'Shadow') },
  count: { icon: '🧮', css: '#c77bff', name: L('Contagem', 'Headcount'), short: L('Contagem', 'Count') },
  truth: { icon: '❓', css: '#5affd2', name: L('Verdadeiro ou Falso', 'True or False'), short: L('V ou F', 'T or F') },
  hanoi: { icon: '🗼', css: '#ffb347', name: L('Torre de Hanói', 'Tower of Hanoi'), short: L('Hanói', 'Hanoi') },
  slide: { icon: '🧩', css: '#3dc7ff', name: L('Quebra-cabeça Deslizante', 'Sliding Puzzle'), short: L('Deslizante', 'Slider') },
  code: { icon: '🔐', css: '#c77bff', name: L('Senha Secreta', 'Secret Code'), short: L('Senha', 'Code') },
  nim: { icon: '🥢', css: '#ffd23d', name: L('Jogo dos Palitos', 'Stick Game'), short: L('Palitos', 'Sticks') },
  darts: { icon: '🏹', css: '#ff4df0', name: L('Dardos Neon', 'Neon Darts'), short: L('Dardos', 'Darts') },
  crane: { icon: '🧸', css: '#ff8ad8', name: L('Máquina de Garra', 'Claw Machine'), short: L('Garra', 'Claw') },
  fire: { icon: '🧯', css: '#ff6a1a', name: L('Apague o Fogo', 'Put Out the Fire'), short: L('Fogo', 'Fire') },
  tilt: { icon: '🎱', css: '#5affd2', name: L('Mesa Inclinada', 'Tilt Table'), short: L('Mesa', 'Tilt') },
  sort: { icon: '🔴', css: '#ff3355', name: L('Separe as Cores', 'Sort the Colors'), short: L('Cores', 'Sort') },
  where: { icon: '🔍', css: '#ffd23d', name: L('Onde Estava?', 'Where Was It?'), short: L('Onde?', 'Where?') },
  knight: { icon: '♞', css: '#9ad7ff', name: L('Pulo do Cavalo', "Knight's Jump"), short: L('Cavalo', 'Knight') },
  keeper: { icon: '🧤', css: '#39ff88', name: L('Goleiro', 'Goalkeeper'), short: L('Goleiro', 'Keeper') },
  traffic: { icon: '🚦', css: '#ffd23d', name: L('Guarda de Trânsito', 'Traffic Cop'), short: L('Trânsito', 'Traffic') },
  block: { icon: '🌈', css: '#3d8bff', name: L('Cor Certa', 'Color Rush'), short: L('Cor Certa', 'Color Rush') },
  balloon: { icon: '🎈', css: '#ff6a8a', name: L('Encha o Balão', 'Blow Up the Balloon'), short: L('Balão', 'Balloon') },
  order: { icon: '🫧', css: '#8af0ff', name: L('Bolhas em Ordem', 'Bubbles in Order'), short: L('Bolhas', 'Bubbles') },
  ladders: { icon: '🎲', css: '#7affc8', name: L('Cobras e Escadas', 'Snakes and Ladders'), short: L('Cobras', 'Snakes') },
  pattern: { icon: '🔷', css: '#ff9a3d', name: L('Qual Vem Depois?', 'What Comes Next?'), short: L('Sequência', 'Next?') },
  rings: { icon: '💿', css: '#c77bff', name: L('Anéis Alinhados', 'Aligned Rings'), short: L('Anéis', 'Rings') },
  navy: { icon: '⚓', css: '#3d8bff', name: L('Batalha Naval', 'Battleship'), short: L('Naval', 'Navy') },
  duel: { icon: '🤠', css: '#ffb347', name: L('Duelo ao Meio-Dia', 'High Noon Duel'), short: L('Duelo', 'Duel') },
  stealth: { icon: '📹', css: '#39ff88', name: L('Câmeras de Segurança', 'Security Cameras'), short: L('Câmeras', 'Cameras') },
  copy: { icon: '🖼️', css: '#ff4df0', name: L('Copie o Desenho', 'Copy the Drawing'), short: L('Desenho', 'Drawing') },
};
