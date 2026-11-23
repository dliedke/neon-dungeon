// Eventos de andar, terceira leva: mais 30 jogos e desafios (cadeiras, esteira, jokenpô, torre de blocos, sumô...).
// Mesmo contrato dos eventos de events.js / events2.js (setup/update/hud/save/load/intro/busy), registrados em
// events.js (MAIN_EVENTS, EVENT_INFO, KIND). Só usam andar, encostar e atacar (teclado, controle e toque).
// Atenção: este módulo importa events.js (circular): nada daqui roda no topo do módulo, só dentro das funções.
import * as THREE from 'three';
import { G } from './state.js';
import { L } from './i18n.js';
import { ri, rr, shuffle } from './utils.js';
import { isWalkable } from './dungeon.js';
import { glowMat, box } from './models.js';
import { burst, ringFx, floatText } from './fx.js';
import { sfx } from './audio.js';
import { banner } from './ui.js';
import { mats, put, groupAt, lightMat, setLight, flatMat, near, waitFoes, findSpot, complete, failed, eventHurt, hitTarget, hitsOf, dropTarget, ambush, segDist, freeAround } from './events.js';

// ------------------------------------------------------------------
// Peças compartilhadas
// ------------------------------------------------------------------
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
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const TAU = Math.PI * 2;
const tmpC = new THREE.Color();
let sphGeo = null;
const sphere = () => sphGeo || (sphGeo = new THREE.SphereGeometry(1, 14, 10));
// texto em cima do mundo que pode mudar (placar, pergunta, letra). parts: texto ou [[texto, cor], ...]
function tag(parent, parts, color, x, y, z, s = 0.9, wide = 1) {
  const c = document.createElement('canvas');
  c.width = Math.round(64 * wide);
  c.height = 64;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(s * wide, s, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 6;
  sp.userData.c = c;
  parent.add(sp);
  setTag(sp, parts, color);
  return sp;
}
function setTag(sp, parts, color = 0xffffff) {
  const list = typeof parts === 'string' ? [[parts, color]] : parts;
  const key = list.map((q) => q[0] + q[1]).join('|');
  if (sp.userData.key === key) return;
  sp.userData.key = key;
  const c = sp.userData.c;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  let fs = 44;
  g.font = `bold ${fs}px sans-serif`;
  let w = list.reduce((a, q) => a + g.measureText(q[0]).width, 0);
  if (w > c.width - 8) {
    fs = Math.max(14, Math.floor((fs * (c.width - 8)) / w));
    g.font = `bold ${fs}px sans-serif`;
    w = list.reduce((a, q) => a + g.measureText(q[0]).width, 0);
  }
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.lineWidth = 7;
  g.strokeStyle = '#000';
  let x = (c.width - w) / 2;
  for (const [t, col] of list) {
    g.strokeText(t, x, 35);
    g.fillStyle = hex(col);
    g.fillText(t, x, 35);
    x += g.measureText(t).width;
  }
  sp.material.map.needsUpdate = true;
}
// moldura retangular de luz no chão (meia largura hx, meia altura hz)
function frame(g, hx, hz, mat) {
  put(g, box(hx * 2, 0.04, 0.09), mat, 0, 0.03, -hz);
  put(g, box(hx * 2, 0.04, 0.09), mat, 0, 0.03, hz);
  put(g, box(0.09, 0.04, hz * 2), mat, -hx, 0.03, 0);
  put(g, box(0.09, 0.04, hz * 2), mat, hx, 0.03, 0);
}
const inRect = (E, hx, hz, m = 0) => {
  const p = G.player;
  return p && p.alive && Math.abs(p.x - E.x) < hx + m && Math.abs(p.z - E.z) < hz + m;
};
const lpos = (E) => [G.player.x - E.x, G.player.z - E.z];
const say = (E, text, kind = 'up', x = 0, z = 0) => floatText(E.x + x, 2.4, E.z + z, text, kind);
// placa retangular de pisar (borda acesa + recheio translúcido)
function plate(g, x, z, w, h, color, k = 0.6) {
  const ring = lightMat(color, k);
  put(g, box(w, 0.04, h), ring, x, 0.03, z);
  const fill = flatMat(color, 0.12);
  put(g, box(w - 0.16, 0.03, h - 0.16), fill, x, 0.05, z);
  return { x, z, w, h, color, ring, fill };
}
function plateIdx(E, list, pad = 0.15) {
  const p = G.player;
  if (!p || !p.alive) return -1;
  const lx = p.x - E.x;
  const lz = p.z - E.z;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (Math.abs(lx - q.x) < q.w / 2 - pad && Math.abs(lz - q.z) < q.h / 2 - pad) return i;
  }
  return -1;
}
// placa escolhida ao ficar parado nela um instante (passar por cima não conta); dispara uma vez por visita
function dwell(E, list, dt, need = 0.4) {
  const k = plateIdx(E, list);
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
  const k = plateIdx(E, list);
  if (k === E.dk) return;
  if (E.dk >= 0 && list[E.dk]) list[E.dk].fill.opacity = 0.12;
  E.dk = k;
  E.dw = 0;
  E.fired = k >= 0;
}
// robozinho de evento (frente = +z local)
function bot(g, color, x = 0, z = 0, s = 1) {
  const m = new THREE.Group();
  put(m, box(0.5, 0.5, 0.38), mats().metal, 0, 0.28, 0);
  put(m, box(0.72, 0.58, 0.5), mats().metal, 0, 0.82, 0);
  put(m, box(0.46, 0.38, 0.42), mats().dark, 0, 1.32, 0);
  const eye = lightMat(color, 2.2);
  put(m, box(0.34, 0.08, 0.05), eye, 0, 1.34, 0.22);
  const ring = lightMat(color, 1);
  put(m, mats().ring, ring, 0, 0.03, 0, 0.5, 1, 0.5);
  m.position.set(x, 0, z);
  m.scale.setScalar(s);
  g.add(m);
  return { m, eye, ring, x, z, col: color };
}
const face = (b, tx, tz) => (b.m.rotation.y = Math.atan2(tx - b.x, tz - b.z));
// golpes novos num alvo qualquer (como hitsOf, mas para vários alvos no mesmo evento)
function hitsOn(o) {
  const n = Math.round(o.e.maxHp - o.e.hp);
  const k = n - (o.hits || 0);
  o.hits = n;
  return Math.max(0, k);
}
const clampAbs = (v, m) => Math.max(-m, Math.min(m, v));
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ==================================================================
// 61. Dança das Cadeiras: quando a música para, corra para uma placa acesa antes dos robôs
// ==================================================================
const CH_COL = 0xff4df0;
const CH_N = 6;
const chairs = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(CH_COL, 0.7), 0, 0.03, 0, 3.3, 1, 3.3);
    const pads = [];
    for (let i = 0; i < CH_N; i++) {
      const a = (i / CH_N) * TAU;
      const x = Math.cos(a) * 2.4;
      const z = Math.sin(a) * 2.4;
      const ring = lightMat(0x445066, 0.6);
      put(g, mats().ring, ring, x, 0.04, z, 0.55, 1, 0.55);
      const fill = flatMat(0x39ff88, 0);
      put(g, mats().disc, fill, x, 0.035, z, 0.5, 1, 0.5);
      pads.push({ x, z, ring, fill, on: false, who: null });
    }
    const bots = [0xffb347, 0x3dc7ff, 0xc77bff].map((c, i) => Object.assign(bot(g, c, 0, 0, 0.8), { a: (i / 3) * TAU, out: false, pad: null, react: 0 }));
    return { kind: 'chairs', x: s.x, z: s.z, g, pads, bots, st: 'idle', round: 0, t: 0, beat: 0, phase: 'music', mine: null };
  },
  music(E) {
    E.phase = 'music';
    E.t = 2.5 + Math.random() * 3;
    E.mine = null;
    for (const q of E.pads) {
      q.on = false;
      q.who = null;
      setLight(q.ring, 0x445066, 0.6);
      q.fill.opacity = 0;
    }
    for (const b of E.bots) b.pad = null;
  },
  update(E, dt) {
    const live = E.bots.filter((b) => !b.out);
    if (E.st === 'idle') {
      for (const b of live) {
        b.a += dt * 0.6;
        b.x = Math.cos(b.a) * 1.3;
        b.z = Math.sin(b.a) * 1.3;
        b.m.position.set(b.x, 0, b.z);
      }
      if (!near(E, 3.1)) return;
      E.st = 'run';
      E.round = 1;
      banner(L('DANÇA DAS CADEIRAS!', 'MUSICAL CHAIRS!'), L('Quando a música parar, pise numa placa verde antes dos robôs', 'When the music stops, grab a green pad before the robots'));
      chairs.music(E);
      return;
    }
    const [lx, lz] = lpos(E);
    if (E.phase === 'music') {
      E.beat -= dt;
      if (E.beat <= 0) {
        E.beat = 0.38;
        sfx.seq(Math.floor(G.t * 2.6) % 4);
      }
      for (const b of live) {
        b.a += dt * 1.5;
        b.x = Math.cos(b.a) * 1.3;
        b.z = Math.sin(b.a) * 1.3;
        b.m.position.set(b.x, Math.abs(Math.sin(G.t * 8 + b.a)) * 0.15, b.z);
        b.m.rotation.y = -b.a;
      }
      E.t -= dt;
      if (E.t > 0) return;
      // a música parou: uma placa a menos que os competidores
      E.phase = 'stop';
      E.t = 4;
      sfx.alarm();
      say(E, L('SENTA!', 'SIT!'), 'crit');
      const lit = shuffle(E.pads.slice()).slice(0, live.length);
      for (const q of lit) {
        q.on = true;
        setLight(q.ring, 0x39ff88, 2.2);
        q.fill.opacity = 0.35;
      }
      for (const b of live) b.react = 0.35 + Math.random() * 0.35 - Math.min(0.15, G.floor * 0.002);
      return;
    }
    // corrida até as placas
    E.t -= dt;
    if (!E.mine) {
      for (const q of E.pads) {
        if (!q.on || q.who || Math.hypot(lx - q.x, lz - q.z) > 0.55) continue;
        q.who = 'p';
        E.mine = q;
        setLight(q.ring, 0x00e5ff, 2.6);
        q.fill.color.setHex(0x00e5ff);
        sfx.click();
        break;
      }
    }
    const sp = Math.min(2.8, 2 + G.floor * 0.01);
    for (const b of live) {
      if (b.pad) continue;
      b.react -= dt;
      if (b.react > 0) continue;
      let best = null;
      let bd = 1e9;
      for (const q of E.pads) {
        if (!q.on || q.who) continue;
        const dd = Math.hypot(q.x - b.x, q.z - b.z);
        if (dd < bd) {
          bd = dd;
          best = q;
        }
      }
      if (!best) continue;
      if (bd < 0.3) {
        best.who = b;
        b.pad = best;
        setLight(best.ring, b.col, 2.4);
        best.fill.color.setHex(b.col);
        continue;
      }
      b.x += ((best.x - b.x) / bd) * Math.min(bd, sp * dt);
      b.z += ((best.z - b.z) / bd) * Math.min(bd, sp * dt);
      b.m.position.set(b.x, 0, b.z);
      face(b, best.x, best.z);
    }
    const free = E.pads.some((q) => q.on && !q.who);
    if (free && E.t > 0) return;
    if (!E.mine) {
      for (const q of E.pads) q.fill.color.setHex(0x39ff88);
      failed(E, L('Ficou sem cadeira! Os robôs foram mais rápidos.', 'No chair left! The robots were faster.'));
      return;
    }
    for (const b of live) {
      if (b.pad) continue;
      b.out = true;
      b.m.visible = false;
      burst(E.x + b.x, 1, E.z + b.z, b.col, 16, 4, 0.07, 0.5, { up: 1.2 });
    }
    for (const q of E.pads) q.fill.color.setHex(0x39ff88);
    if (E.bots.every((b) => b.out)) {
      complete(E, 1.3, L('CAMPEÃO DA DANÇA!', 'DANCE CHAMPION!'), L('Sobrou só você', 'Only you were left'), E.x, E.z);
      return;
    }
    E.round++;
    say(E, L(`RODADA ${E.round}`, `ROUND ${E.round}`));
    chairs.music(E);
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'enter the circle') : `${L('rodada', 'round')} ${E.round}/3 · ${E.phase === 'stop' ? L('SENTA!', 'SIT!') : '♪ ♫'}`),
  dim(E) {
    for (const b of E.bots) b.m.visible = E.st !== 'done' && !b.out;
    for (const q of E.pads) setLight(q.ring, 0x445066, 0.4);
  },
  intro: () => L('os robôs dançam em volta enquanto a música toca. Quando ela parar, algumas placas acendem (uma a menos que os competidores): pise numa antes deles. Quem sobra sai; vença as 3 rodadas.', 'the robots dance around while the music plays. When it stops some pads light up (one fewer than the players): step on one before them. Whoever is left out leaves; win all 3 rounds.'),
});

// ==================================================================
// 62. Esteira Neon: atravesse a esteira que anda para trás desviando das caixas
// ==================================================================
const TM_COL = 0x39d0ff;
const TM_HX = 4.4;
const TM_HZ = 1.1;
const treadmill = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.9, 1.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(TM_HX * 2, 0.03, TM_HZ * 2), mats().dark, 0, 0.02, 0);
    put(g, box(TM_HX * 2, 0.06, 0.08), lightMat(TM_COL, 1.2), 0, 0.04, -TM_HZ);
    put(g, box(TM_HX * 2, 0.06, 0.08), lightMat(TM_COL, 1.2), 0, 0.04, TM_HZ);
    put(g, box(0.7, 0.04, TM_HZ * 2), lightMat(0x39ff88, 1), -TM_HX + 0.35, 0.05, 0);
    put(g, box(0.7, 0.04, TM_HZ * 2), lightMat(0xffd23d, 1.4), TM_HX - 0.35, 0.05, 0);
    const stripeMat = flatMat(TM_COL, 0.35);
    const stripes = [];
    for (let i = 0; i < 10; i++) stripes.push(put(g, box(0.1, 0.02, TM_HZ * 2 - 0.2), stripeMat, 0, 0.045, 0));
    const crateMat = lightMat(0xff8a3d, 1.1);
    const crates = [];
    for (let i = 0; i < 7; i++) {
      const m = put(g, box(0.62, 0.62, 0.62), crateMat, 0, 0.33, 0);
      m.visible = false;
      crates.push({ m, x: 0, z: 0, on: false });
    }
    return { kind: 'treadmill', x: s.x, z: s.z, g, stripes, crates, st: 'idle', off: 0, nt: 0, hits: 0 };
  },
  update(E, dt) {
    const p = G.player;
    const push = Math.max(2.2, (p.stats ? p.stats.speed : 5) * 0.5);
    E.off = (E.off + dt * push) % 0.88;
    E.stripes.forEach((m, i) => (m.position.x = TM_HX - 0.1 - ((i * 0.88 + E.off) % 8.6)));
    const [lx, lz] = lpos(E);
    const on = p.alive && Math.abs(lx) < TM_HX && Math.abs(lz) < TM_HZ + 0.05;
    if (on) p.x -= push * dt;
    // caixas descendo a esteira (andam sempre que o jogador está perto)
    if (near(E, 9)) {
      E.nt -= dt;
      if (E.nt <= 0) {
        E.nt = Math.max(0.55, 1.35 - G.floor * 0.008) + Math.random() * 0.5;
        const c = E.crates.find((q) => !q.on);
        if (c) {
          c.on = true;
          c.x = TM_HX - 0.3;
          c.z = [-0.68, 0, 0.68][Math.floor(Math.random() * 3)];
          c.m.visible = true;
        }
      }
    }
    const cs = push * 1.35;
    for (const c of E.crates) {
      if (!c.on) continue;
      c.x -= cs * dt;
      c.m.position.set(c.x, 0.33, c.z);
      c.m.rotation.z += dt * 2;
      if (c.x < -TM_HX + 0.2) {
        c.on = false;
        c.m.visible = false;
        continue;
      }
      if (on && Math.abs(lx - c.x) < 0.31 + p.r && Math.abs(lz - c.z) < 0.31 + p.r * 0.8) {
        c.on = false;
        c.m.visible = false;
        burst(E.x + c.x, 0.5, E.z + c.z, 0xff8a3d, 14, 4, 0.07, 0.5, { up: 1 });
        p.kx -= 11;
        eventHurt(0.04);
        E.hits++;
      }
    }
    if (E.st === 'idle') {
      if (on && lx < -TM_HX + 1.2) {
        E.st = 'run';
        if (!E.told2) banner(L('ESTEIRA NEON!', 'NEON TREADMILL!'), L('Chegue na ponta amarela pela esteira', 'Reach the yellow end along the belt'));
        E.told2 = true;
      }
      return;
    }
    if (!on) {
      // saiu pelo lado ou caiu do começo: volta para o início
      E.st = 'idle';
      if (Math.abs(lx) < TM_HX + 0.5) say(E, L('VOLTE AO INÍCIO', 'BACK TO THE START'), 'hurt', -TM_HX + 0.5, 0);
      return;
    }
    if (lx > TM_HX - 0.6) {
      for (const c of E.crates) c.m.visible = c.on = false;
      complete(E, 1.2, L('CHEGOU NA PONTA!', 'MADE IT ACROSS!'), L(`${E.hits} caixadas`, `${E.hits} crate hits`), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('suba pela ponta verde', 'step on at the green end') : `${Math.max(0, Math.round(((G.player.x - E.x + TM_HX) / (TM_HX * 2)) * 100))}%`),
  dim(E) {
    for (const c of E.crates) c.m.visible = false;
  },
  intro: () => L('a esteira anda para trás. Suba pela ponta verde e vá até a amarela sem sair pelos lados, desviando das caixas (cada uma empurra você de volta).', 'the belt runs backwards. Step on at the green end and walk to the yellow one without leaving by the sides, dodging the crates (each one shoves you back).'),
});

// ==================================================================
// 63. Jokenpô: o robô mostra a jogada um pouco antes do fim da contagem; pise na que vence
// ==================================================================
const RP_COL = 0xffd23d;
const RP_ICON = ['✊', '✋', '✌️'];
const rps = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.8, 2.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const plates = [-1.7, 0, 1.7].map((x, i) => {
      const q = plate(g, x, 1.3, 1.4, 1.4, RP_COL);
      tag(g, RP_ICON[i], 0xffffff, x, 0.7, 1.3, 0.9);
      return q;
    });
    const b = bot(g, 0xff4df0, 0, -1.8, 1.1);
    const screen = tag(g, '?', 0xffffff, 0, 2.5, -1.8, 1.2);
    const score = tag(g, '0 × 0', RP_COL, 0, 1.9, 0.2, 0.8, 2.6);
    return { kind: 'rps', x: s.x, z: s.z, g, plates, b, screen, score, st: 'idle', me: 0, rob: 0, t: 0, phase: 'count', pick: 0 };
  },
  round(E) {
    E.phase = 'count';
    E.t = 3;
    E.pick = Math.floor(Math.random() * 3);
    for (const q of E.plates) setLight(q.ring, RP_COL, 0.6);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.6) || waitFoes(E)) return;
      E.st = 'run';
      banner(L('JO-KEN-PÔ!', 'ROCK PAPER SCISSORS!'), L('O robô mostra a jogada antes do fim: pise na que vence', 'The robot shows its move just before the end: stand on the winner'));
      rps.round(E);
      return;
    }
    E.t -= dt;
    if (E.phase === 'res') {
      if (E.t <= 0) rps.round(E);
      return;
    }
    const reveal = G.floor >= 20 ? 1.1 : 1.4;
    if (E.t > reveal) setTag(E.screen, String(Math.ceil(E.t - reveal)), 0xffffff);
    else setTag(E.screen, RP_ICON[E.pick], 0xffffff);
    setLight(E.b.eye, E.t > reveal ? 0xff4df0 : 0xffd23d, 2.4);
    const k = plateIdx(E, E.plates, 0.1);
    E.plates.forEach((q, i) => (q.fill.opacity = i === k ? 0.45 : 0.12));
    if (E.t > 0) return;
    // fim da contagem: vale a placa em que o jogador está
    E.phase = 'res';
    E.t = 1.5;
    let msg;
    if (k < 0) {
      E.rob++;
      msg = [L('SEM JOGADA!', 'NO MOVE!'), 'hurt'];
    } else if (k === E.pick) msg = [L('EMPATE', 'DRAW'), 'up'];
    else if ((k - E.pick + 3) % 3 === 1) {
      E.me++;
      msg = [L('VOCÊ GANHOU!', 'YOU WIN!'), 'crit'];
      sfx.coin();
    } else {
      E.rob++;
      msg = [L('O ROBÔ GANHOU', 'ROBOT WINS'), 'hurt'];
      sfx.deny();
    }
    if (k >= 0) setLight(E.plates[k].ring, msg[1] === 'hurt' ? 0xff3355 : 0x39ff88, 2.4);
    say(E, msg[0], msg[1]);
    setTag(E.score, `${E.me} × ${E.rob}`, RP_COL);
    if (E.me >= 3) complete(E, 1.2, L('JOKENPÔ VENCIDO!', 'ROCK PAPER SCISSORS WON!'), `${E.me} × ${E.rob}`, E.x, E.z);
    else if (E.rob >= 3) failed(E, L('O robô venceu o jokenpô.', 'The robot won rock paper scissors.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue perto do robô', 'go near the robot') : `${E.me} × ${E.rob} (${L('melhor de 5', 'first to 3')})`),
  dim(E) {
    setTag(E.screen, E.st === 'done' ? '🏆' : '✖', 0xffffff);
  },
  intro: () => L('conta 3, 2, 1... e um pouco antes do fim o robô mostra a jogada dele na tela. Fique na placa que vence (pedra ganha de tesoura, tesoura de papel, papel de pedra). Ganhe 3 rodadas.', 'counts 3, 2, 1... and just before the end the robot shows its move on its screen. Stand on the plate that beats it (rock beats scissors, scissors beat paper, paper beats rock). Win 3 rounds.'),
});

// ==================================================================
// 64. Torre de Blocos: bata no botão para soltar o bloco que desliza; a sobra é cortada. Empilhe 6
// ==================================================================
const SB_COLS = [0xff4d6d, 0xffb347, 0xffe23d, 0x39ff88, 0x3dc7ff, 0xc77bff, 0xff4df0];
const SB_N = 6;
const SB_H = 0.3;
const stacker = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.8, 2.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(1.7, SB_H, 1.0), mats().metal, 0, SB_H / 2, -0.7);
    put(g, mats().ring, lightMat(SB_COLS[0], 0.8), 0, 0.03, -0.7, 2.2, 1, 2.2);
    // botão
    put(g, mats().cyl, mats().metal, 0, 0.4, 1.6, 0.45, 0.8, 0.45);
    const btn = put(g, mats().cyl, glowMat(0xff3355, 2.4), 0, 0.85, 1.6, 0.32, 0.1, 0.32);
    const mov = put(g, box(1, SB_H, 1), lightMat(SB_COLS[1], 1.4), 0, SB_H * 1.5, -0.7);
    mov.scale.x = 1.6;
    const e = hitTarget(s.x, s.z + 1.6, 0.55, 1.1, L('Botão', 'Button'));
    return { kind: 'stacker', x: s.x, z: s.z, g, btn, mov, e, hits: 0, st: 'idle', lvl: 0, w: 1.6, cx: 0, ph: 0, lives: 3, cool: 0, blocks: [] };
  },
  update(E, dt) {
    E.cool -= dt;
    const n = hitsOf(E);
    if (E.st === 'idle') {
      if (!near(E, 4.5)) return;
      E.st = 'run';
      banner(L('TORRE DE BLOCOS!', 'BLOCK TOWER!'), L(`Bata no botão para soltar o bloco: empilhe ${SB_N}`, `Hit the button to drop the block: stack ${SB_N}`));
    }
    E.ph += dt * Math.min(4.2, 1.5 + E.lvl * 0.32 + G.floor * 0.01);
    const x = Math.sin(E.ph) * 1.8;
    E.mov.position.set(x, SB_H * (E.lvl + 1.5), -0.7);
    if (!n || E.cool > 0) return;
    E.cool = 0.45;
    E.btn.scale.y = 0.04;
    setTimeout(() => (E.btn.scale.y = 0.1), 120);
    const l = Math.max(x - E.w / 2, E.cx - E.w / 2);
    const r = Math.min(x + E.w / 2, E.cx + E.w / 2);
    if (r - l < 0.06) {
      E.lives--;
      sfx.deny();
      say(E, L('ERROU!', 'MISSED!'), 'hurt', 0, -0.7);
      burst(E.x + x, SB_H * (E.lvl + 1.5), E.z - 0.7, 0xff3355, 14, 4, 0.07, 0.5);
      E.ph = Math.random() * TAU;
      if (E.lives <= 0) failed(E, L('Os blocos acabaram antes da torre.', 'You ran out of blocks before the tower was done.'));
      return;
    }
    let cx = (l + r) / 2;
    let w = r - l;
    if (Math.abs(x - E.cx) < 0.08) {
      // encaixe perfeito: não corta nada
      cx = E.cx;
      w = E.w;
      say(E, L('PERFEITO!', 'PERFECT!'), 'crit', 0, -0.7);
      sfx.coin();
    } else {
      sfx.click();
      const cut = E.w - w;
      const side = x > E.cx ? 1 : -1;
      burst(E.x + cx + side * (w / 2 + cut / 2), SB_H * (E.lvl + 1.5), E.z - 0.7, SB_COLS[(E.lvl + 1) % SB_COLS.length], 12, 3, 0.07, 0.5);
    }
    E.lvl++;
    const m = put(E.g, box(1, SB_H, 1), lightMat(SB_COLS[E.lvl % SB_COLS.length], 1.2), cx, SB_H * (E.lvl + 0.5), -0.7);
    m.scale.x = w;
    E.blocks.push(m);
    E.cx = cx;
    E.w = w;
    E.mov.scale.x = w;
    E.mov.material = lightMat(SB_COLS[(E.lvl + 1) % SB_COLS.length], 1.4);
    E.ph = Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
    if (E.lvl >= SB_N) {
      E.mov.visible = false;
      dropTarget(E);
      complete(E, 1.3, L('TORRE PRONTA!', 'TOWER BUILT!'), L(`${SB_N} blocos`, `${SB_N} blocks`), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no botão', 'reach the button') : `${E.lvl}/${SB_N} · ${'♥'.repeat(Math.max(0, E.lives))}`),
  dim(E) {
    dropTarget(E);
    E.mov.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L(`um bloco desliza de um lado para o outro em cima da torre. Bata no botão vermelho para soltá-lo: o pedaço que passar da torre é cortado. Empilhe ${SB_N}; 3 erros e acabou.`, `a block slides back and forth above the tower. Hit the red button to drop it: whatever hangs over the tower is cut off. Stack ${SB_N}; 3 misses and it is over.`),
});

// ==================================================================
// 65. Sumô: empurre o robô para fora do ringue 3 vezes (golpes e encostões empurram)
// ==================================================================
const SU_COL = 0xff9a3d;
const SU_R = 3;
const sumo = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().disc, flatMat(0xc9a36b, 0.18), 0, 0.03, 0, SU_R, 1, SU_R);
    put(g, mats().ring, lightMat(SU_COL, 1.4), 0, 0.04, 0, SU_R, 1, SU_R);
    put(g, box(0.9, 0.03, 0.08), lightMat(0xffffff, 0.8), -0.8, 0.04, 0);
    put(g, box(0.9, 0.03, 0.08), lightMat(0xffffff, 0.8), 0.8, 0.04, 0);
    const b = bot(g, 0xff3355, 0, 0, 1.3);
    const e = hitTarget(s.x, s.z, 0.65, 1.7, L('Lutador de Sumô', 'Sumo Bot'), 0.35);
    return { kind: 'sumo', x: s.x, z: s.z, g, b, e, hits: 0, st: 'idle', me: 0, rob: 0, vx: 0, vz: 0, push: 0, pause: 0 };
  },
  reset(E) {
    const [lx, lz] = lpos(E);
    const l = Math.hypot(lx, lz) || 1;
    E.b.x = (-lx / l) * 1.2;
    E.b.z = (-lz / l) * 1.2;
    E.vx = E.vz = 0;
    E.pause = 1.2;
  },
  update(E, dt) {
    const p = G.player;
    const b = E.b;
    E.e.x = E.x + b.x;
    E.e.z = E.z + b.z;
    b.m.position.set(b.x, 0, b.z);
    const n = hitsOf(E);
    const [lx, lz] = lpos(E);
    const pin = p.alive && Math.hypot(lx, lz) < SU_R;
    if (E.st === 'idle') {
      if (!pin || Math.hypot(lx, lz) > SU_R - 0.4) return;
      E.st = 'run';
      banner(L('SUMÔ!', 'SUMO!'), L('Empurre o robô para fora do ringue', 'Push the robot out of the ring'));
      sumo.reset(E);
      return;
    }
    E.pause -= dt;
    E.push -= dt;
    const dx = b.x - lx;
    const dz = b.z - lz;
    const dl = Math.hypot(dx, dz) || 1;
    if (n && E.pause <= 0) {
      E.vx += (dx / dl) * 3.2 * n;
      E.vz += (dz / dl) * 3.2 * n;
      burst(E.x + b.x, 1, E.z + b.z, SU_COL, 8, 3, 0.06, 0.3);
    }
    if (E.pause <= 0 && pin) {
      const sp = Math.min(2.6, 1.7 + G.floor * 0.012);
      E.vx += (-dx / dl) * sp * dt * 3;
      E.vz += (-dz / dl) * sp * dt * 3;
      face(b, lx, lz);
      if (dl < 1.05 && E.push <= 0) {
        E.push = 0.55;
        p.kx += (-dx / dl) * 8;
        p.kz += (-dz / dl) * 8;
        sfx.punch();
      }
    }
    const k = Math.max(0, 1 - dt * 3);
    E.vx *= k;
    E.vz *= k;
    b.x += E.vx * dt;
    b.z += E.vz * dt;
    if (E.pause > 0) return;
    if (Math.hypot(b.x, b.z) > SU_R) {
      E.me++;
      sfx.coin();
      say(E, L('FORA!', 'OUT!'), 'crit', b.x, b.z);
      ringFx(E.x + b.x, E.z + b.z, 1.2, SU_COL, 0.4);
      if (E.me >= 3) {
        dropTarget(E);
        complete(E, 1.3, L('YOKOZUNA!', 'YOKOZUNA!'), `${E.me} × ${E.rob}`, E.x, E.z);
        return;
      }
      sumo.reset(E);
    } else if (!pin) {
      E.rob++;
      sfx.deny();
      say(E, L('VOCÊ SAIU!', 'YOU WERE PUSHED OUT!'), 'hurt');
      if (E.rob >= 3) {
        dropTarget(E);
        failed(E, L('O robô venceu a luta de sumô.', 'The robot won the sumo match.'));
        return;
      }
      E.b.x = E.b.z = 0;
      E.vx = E.vz = 0;
      E.st = 'idle';
    }
  },
  hud: (E) => (E.st === 'idle' ? (E.me + E.rob ? `${E.me} × ${E.rob} · ${L('volte ao ringue', 'back into the ring')}` : L('entre no ringue', 'enter the ring')) : `${E.me} × ${E.rob}`),
  dim(E) {
    dropTarget(E);
    if (E.st === 'done') E.b.m.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('golpes e encostões empurram o robô; ele também empurra você. Jogue-o para fora do ringue 3 vezes antes de ser jogado para fora 3 vezes.', 'hits and shoves push the robot; it pushes you too. Throw it out of the ring 3 times before you are pushed out 3 times.'),
});

// ==================================================================
// 66. Passos Espelhados: sua sombra anda espelhada no quadro ao lado; leve-a às placas verdes sem tocar nas vermelhas
// ==================================================================
const MW_COL = 0xb8c4ff;
const MW_C = 2.3;
const MW_H = 1.5;
const mirrorwalk = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.2, 1.9);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    g.position.y = 0;
    const fr = new THREE.Group();
    fr.position.x = -MW_C;
    g.add(fr);
    frame(fr, MW_H, MW_H, lightMat(0x00e5ff, 1));
    const fr2 = new THREE.Group();
    fr2.position.x = MW_C;
    g.add(fr2);
    frame(fr2, MW_H, MW_H, lightMat(MW_COL, 1));
    const cells = shuffle([-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => [MW_C + i * 1.0, j * 1.0]))).filter((c) => Math.hypot(c[0] - MW_C, c[1]) > 0.1);
    const ng = 3 + (floor >= 15 ? 1 : 0);
    const pads = cells.slice(0, ng + 3).map(([x, z], i) => {
      const good = i < ng;
      const mat = lightMat(good ? 0x39ff88 : 0xff3355, 1.2);
      put(g, mats().disc, mat, x, 0.04, z, 0.36, 1, 0.36);
      return { x, z, good, mat, got: false };
    });
    const ghost = new THREE.Group();
    put(ghost, mats().oct, glowMat(MW_COL, 2.2), 0, 0.9, 0, 0.32, 0.6, 0.32);
    put(ghost, mats().ring, lightMat(MW_COL, 1.4), 0, 0.05, 0, 0.4, 1, 0.4);
    ghost.visible = false;
    g.add(ghost);
    return { kind: 'mirrorwalk', x: s.x, z: s.z, g, pads, ghost, st: 'idle', bad: 0, cool: 0 };
  },
  update(E, dt) {
    const [lx, lz] = lpos(E);
    const inL = G.player.alive && Math.abs(lx + MW_C) < MW_H && Math.abs(lz) < MW_H;
    E.ghost.visible = inL;
    E.cool -= dt;
    if (!inL) return;
    if (E.st === 'idle') {
      E.st = 'run';
      banner(L('PASSOS ESPELHADOS!', 'MIRRORED STEPS!'), L('Sua sombra anda ao contrário no quadro ao lado', 'Your shadow moves mirrored in the other square'));
    }
    // sombra: reflexo pelo centro do evento (esquerda vira direita e frente vira trás)
    const gx = -lx;
    const gz = -lz;
    E.ghost.position.set(gx, Math.sin(G.t * 4) * 0.05, gz);
    for (const q of E.pads) {
      if (Math.hypot(gx - q.x, gz - q.z) > 0.42) continue;
      if (q.good && !q.got) {
        q.got = true;
        setLight(q.mat, 0xffd23d, 2.4);
        sfx.coin();
        burst(E.x + q.x, 0.5, E.z + q.z, 0x39ff88, 12, 3, 0.06, 0.4, { up: 1 });
      } else if (!q.good && E.cool <= 0) {
        E.cool = 1.2;
        E.bad++;
        sfx.zap();
        eventHurt(0.04);
        say(E, L('PLACA VERMELHA!', 'RED PAD!'), 'hurt', q.x, q.z);
        for (const o of E.pads) if (o.good && o.got) {
          o.got = false;
          setLight(o.mat, 0x39ff88, 1.2);
        }
        if (E.bad >= 4) {
          failed(E, L('A sombra pisou no vermelho vezes demais.', 'The shadow stepped on red too many times.'));
          E.ghost.visible = false;
          return;
        }
      }
    }
    if (E.pads.every((q) => !q.good || q.got)) {
      E.ghost.visible = false;
      complete(E, 1.3, L('SOMBRA OBEDIENTE!', 'SHADOW MASTERED!'), L('Todas as placas verdes', 'Every green pad'), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('pise no azul', 'step on blue') : `${E.pads.filter((q) => q.got).length}/${E.pads.filter((q) => q.good).length} · ${E.bad}/4 ✖`),
  dim(E) {
    E.ghost.visible = false;
  },
  intro: () => L('ande no quadro azul: a sua sombra anda no quadro ao lado, espelhada (direita vira esquerda e frente vira trás). Leve a sombra a todas as placas verdes; uma vermelha apaga o progresso.', 'walk in the blue square: your shadow walks in the other square, mirrored (right becomes left and forward becomes back). Take it to every green pad; a red one wipes the progress.'),
});

// ==================================================================
// 67. Fio Elétrico: vá do início ao fim pelo corredor em zigue-zague sem encostar na borda
// ==================================================================
const BZ_COL = 0xffe23d;
const BZ_W = 0.62;
const buzz = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.7, 2.7);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const x = -4 + i * 1.6;
      const z = i === 0 || i === 5 ? rr(-0.8, 0.8) : (i % 2 ? 1 : -1) * rr(0.9, 1.9);
      pts.push([x, z]);
    }
    const w = Math.max(0.5, BZ_W - G.floor * 0.002);
    const strip = flatMat(BZ_COL, 0.16);
    const edge = lightMat(BZ_COL, 1.2);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const m = put(g, box(len, 0.02, w * 2), strip, (ax + bx) / 2, 0.035, (az + bz) / 2);
      m.rotation.y = -Math.atan2(bz - az, bx - ax);
      const c = put(g, box(len, 0.03, 0.05), edge, (ax + bx) / 2, 0.04, (az + bz) / 2);
      c.rotation.y = m.rotation.y;
    }
    for (const [x, z] of pts) put(g, mats().disc, strip, x, 0.036, z, w, 1, w);
    put(g, mats().ring, lightMat(0x39ff88, 1.6), pts[0][0], 0.05, pts[0][1], w, 1, w);
    put(g, mats().ring, lightMat(0xff4df0, 1.6), pts[5][0], 0.05, pts[5][1], w, 1, w);
    return { kind: 'buzz', x: s.x, z: s.z, g, pts, w, strip, st: 'idle', armed: false, miss: 0 };
  },
  dist(E, lx, lz) {
    let m = 1e9;
    for (let i = 0; i < E.pts.length - 1; i++) m = Math.min(m, segDist(lx, lz, E.pts[i][0], E.pts[i][1], E.pts[i + 1][0], E.pts[i + 1][1]));
    return m;
  },
  update(E, dt) {
    if (!G.player.alive) return;
    const [lx, lz] = lpos(E);
    const [sx, sz] = E.pts[0];
    const [ex, ez] = E.pts[E.pts.length - 1];
    if (E.st === 'idle') {
      if (Math.hypot(lx - sx, lz - sz) < E.w * 0.8) {
        if (!E.armed) say(E, L('VÁ!', 'GO!'), 'up', sx, sz);
        E.armed = true;
        E.strip.opacity = 0.3;
      } else if (E.armed && buzz.dist(E, lx, lz) < E.w) {
        E.st = 'run';
        if (!E.miss) banner(L('FIO ELÉTRICO!', 'BUZZ WIRE!'), L('Não encoste na borda do corredor', 'Do not touch the edge of the path'));
      } else E.armed = false;
      return;
    }
    if (buzz.dist(E, lx, lz) > E.w) {
      E.miss++;
      E.st = 'idle';
      E.armed = false;
      E.strip.color.setHex(0xff3355);
      setTimeout(() => E.strip.color.setHex(BZ_COL), 400);
      E.strip.opacity = 0.16;
      sfx.zap();
      eventHurt(0.04);
      burst(G.player.x, 1, G.player.z, BZ_COL, 18, 5, 0.06, 0.4);
      if (E.miss >= 5) failed(E, L('Choques demais no fio elétrico.', 'Too many shocks on the buzz wire.'));
      else say(E, L(`CHOQUE! (${E.miss}/5) Volte ao início`, `ZAP! (${E.miss}/5) Back to the start`), 'hurt', sx, sz);
      return;
    }
    if (Math.hypot(lx - ex, lz - ez) < E.w * 0.8) complete(E, 1.3, L('MÃO FIRME!', 'STEADY HAND!'), L(`${E.miss} choques`, `${E.miss} shocks`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? `${L('vá ao círculo verde', 'go to the green circle')}${E.miss ? ` · ${E.miss}/5 ⚡` : ''}` : `${L('no fio', 'on the wire')} · ${E.miss}/5 ⚡`),
  dim(E) {
    E.strip.opacity = 0.08;
  },
  intro: () => L('saia do círculo verde e chegue ao rosa andando pelo corredor amarelo. Se sair dele leva um choque e volta ao começo; 5 choques e acabou.', 'leave the green circle and reach the pink one walking along the yellow path. Step off it and you get zapped back to the start; 5 zaps and it is over.'),
});

// ==================================================================
// 68. Boliche Neon: chute a bola (golpe ou encostão) e derrube os 10 pinos em 3 jogadas
// ==================================================================
const BW_COL = 0x5affd2;
const BW_HX = 1.3;
const BW_HZ = 4.7;
const bowling = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1.8, 4.9);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(BW_HX * 2, 0.02, BW_HZ * 2), flatMat(0xc9a36b, 0.25), 0, 0.03, 0);
    put(g, box(0.06, 0.04, BW_HZ * 2), lightMat(BW_COL, 1.2), -BW_HX, 0.04, 0);
    put(g, box(0.06, 0.04, BW_HZ * 2), lightMat(BW_COL, 1.2), BW_HX, 0.04, 0);
    put(g, box(BW_HX * 2, 0.04, 0.06), lightMat(0xff4df0, 1.2), 0, 0.04, 2.6);
    const pinMat = new THREE.MeshLambertMaterial({ color: 0xf0f2ff });
    const capMat = glowMat(0xff3355, 2);
    const pins = [];
    for (let r = 0; r < 4; r++)
      for (let j = 0; j <= r; j++) {
        const x = (j - r / 2) * 0.46;
        const z = -2.6 - r * 0.42;
        const m = new THREE.Group();
        put(m, mats().cyl, pinMat, 0, 0.3, 0, 0.11, 0.6, 0.11);
        put(m, mats().oct, capMat, 0, 0.66, 0, 0.1, 0.1, 0.1);
        m.position.set(x, 0, z);
        g.add(m);
        pins.push({ x, z, x0: x, z0: z, m, down: false, vx: 0, vz: 0, t: 0, gone: false });
      }
    const ball = put(g, sphere(), glowMat(0xff4df0, 2.2), 0, 0.32, 3.4, 0.3, 0.3, 0.3);
    const e = hitTarget(s.x, s.z + 3.4, 0.4, 0.7, L('Bola de Boliche', 'Bowling Ball'));
    return { kind: 'bowling', x: s.x, z: s.z, g, pins, ball, e, hits: 0, st: 'idle', bx: 0, bz: 3.4, vx: 0, vz: 0, roll: false, t: 0, throws: 3 };
  },
  update(E, dt) {
    const n = hitsOf(E);
    E.e.x = E.x + E.bx;
    E.e.z = E.z + E.bz;
    if (E.st === 'idle') {
      if (!near(E, 5.2)) return;
      E.st = 'run';
      banner(L('BOLICHE NEON!', 'NEON BOWLING!'), L('Chute a bola por trás: 10 pinos em 3 jogadas', 'Kick the ball from behind: 10 pins in 3 throws'));
    }
    // pinos caindo derrubam os vizinhos
    for (const q of E.pins) {
      if (!q.down || q.t <= 0) continue;
      q.t -= dt;
      q.x += q.vx * dt;
      q.z += q.vz * dt;
      q.m.position.set(q.x, 0, q.z);
      q.m.rotation.x += q.vz * dt * 2;
      q.m.rotation.z -= q.vx * dt * 2;
      for (const o of E.pins) {
        if (o.down || Math.hypot(o.x - q.x, o.z - q.z) > 0.34) continue;
        bowling.knock(o, q.vx * 0.8 + (o.x - q.x) * 3, q.vz * 0.8 + (o.z - q.z) * 3);
      }
    }
    if (!E.roll) {
      if (!n || E.throws <= 0) return;
      const p = G.player;
      let dx = E.x + E.bx - p.x;
      let dz = E.z + E.bz - p.z;
      const l = Math.hypot(dx, dz) || 1;
      E.vx = (dx / l) * 7.5;
      E.vz = (dz / l) * 7.5;
      E.roll = true;
      E.t = 0;
      E.throws--;
      sfx.punch();
      return;
    }
    E.t += dt;
    E.bx += E.vx * dt;
    E.bz += E.vz * dt;
    if (Math.abs(E.bx) > BW_HX - 0.25) {
      // canaleta: segue reto sem derrubar nada
      E.bx = Math.sign(E.bx) * (BW_HX - 0.25);
      E.vx = 0;
      E.gutter = true;
    }
    E.ball.position.set(E.bx, 0.32, E.bz);
    E.ball.rotation.x -= E.vz * dt * 3;
    if (!E.gutter)
      for (const q of E.pins) {
        if (q.down || Math.hypot(q.x - E.bx, q.z - E.bz) > 0.4) continue;
        bowling.knock(q, E.vx * 0.6 + (q.x - E.bx) * 5, E.vz * 0.6 + (q.z - E.bz) * 2);
        sfx.hit();
      }
    if (E.t < 3 && E.bz > -BW_HZ && E.bz < BW_HZ + 0.5) return;
    // fim da jogada
    E.roll = false;
    E.gutter = false;
    for (const q of E.pins) if (q.down && !q.gone) {
      q.gone = true;
      q.m.visible = false;
    }
    const left = E.pins.filter((q) => !q.down).length;
    E.bx = 0;
    E.bz = 3.4;
    E.ball.position.set(0, 0.32, 3.4);
    E.e.touched = true;
    if (!left) {
      dropTarget(E);
      E.ball.visible = false;
      const strike = E.throws === 2;
      complete(E, strike ? 1.7 : 1.3, strike ? L('STRIKE!', 'STRIKE!') : L('SPARE!', 'SPARE!'), L(`${3 - E.throws} jogadas`, `${3 - E.throws} throws`), E.x, E.z - 3);
      return;
    }
    say(E, L(`${10 - left} pinos`, `${10 - left} pins`), 'up', 0, -3);
    if (E.throws <= 0) {
      dropTarget(E);
      failed(E, L(`Sobraram ${left} pinos em pé.`, `${left} pins were left standing.`));
    }
  },
  knock(q, vx, vz) {
    q.down = true;
    q.t = 0.5;
    q.vx = clampAbs(vx, 6);
    q.vz = clampAbs(vz, 6);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na pista', 'reach the lane') : `${E.pins.filter((q) => q.down).length}/10 · ${E.throws} ${L('jogadas', 'throws')}`),
  dim(E) {
    dropTarget(E);
    E.ball.visible = false;
    if (E.st === 'done') for (const q of E.pins) q.m.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('golpeie ou encoste na bola por trás: ela rola na direção do chute. Derrube os 10 pinos em 3 jogadas; pela canaleta ela não derruba nada.', 'hit or bump the ball from behind: it rolls the way you kick it. Knock down all 10 pins in 3 throws; in the gutter it hits nothing.'),
});

// ==================================================================
// 69. Chuva Ácida: fique embaixo do guarda-chuva que anda; fora dele a chuva queima. 20s secos
// ==================================================================
const AC_COL = 0x9dff3a;
const AC_R = 4.2;
const AC_NEED = 20;
const acid = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(AC_COL, 0.9), 0, 0.03, 0, AC_R, 1, AC_R);
    const um = new THREE.Group();
    g.add(um);
    put(um, mats().cone, glowMat(0x3dc7ff, 1.8), 0, 2.4, 0, 9, 9, 1.8).rotation.x = -Math.PI / 2;
    put(um, box(0.06, 2.2, 0.06), mats().metal, 0, 1.2, 0);
    const shade = flatMat(0x3dc7ff, 0.3);
    put(um, mats().disc, shade, 0, 0.04, 0, 1.15, 1, 1.15);
    return { kind: 'acid', x: s.x, z: s.z, g, um, shade, st: 'idle', dry: 0, u: 0, tick: 0, ux: 0, uz: 0 };
  },
  update(E, dt) {
    const [lx, lz] = lpos(E);
    const pin = G.player.alive && Math.hypot(lx, lz) < AC_R;
    if (E.st === 'idle') {
      if (!pin) return;
      E.st = 'run';
      banner(L('CHUVA ÁCIDA!', 'ACID RAIN!'), L(`Fique embaixo do guarda-chuva por ${AC_NEED}s`, `Stay under the umbrella for ${AC_NEED}s`));
    }
    if (!near(E, AC_R + 6)) return;
    // chuva (só dentro do círculo)
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * AC_R;
      burst(E.x + Math.cos(a) * r, 3.2, E.z + Math.sin(a) * r, AC_COL, 1, 0.3, 0.05, 0.35, { grav: 14 });
    }
    if (!pin) return;
    const sp = 1 + (E.dry / AC_NEED) * 0.7 + Math.min(0.4, G.floor * 0.006);
    E.u += dt * sp;
    E.ux = Math.sin(E.u * 0.55) * 2.6;
    E.uz = Math.sin(E.u * 0.83 + 1.3) * 2.4;
    E.um.position.set(E.ux, 0, E.uz);
    const under = Math.hypot(lx - E.ux, lz - E.uz) < 1.15;
    E.shade.opacity = under ? 0.45 : 0.25;
    if (under) E.dry += dt;
    else {
      E.tick -= dt;
      if (E.tick <= 0) {
        E.tick = 0.6;
        eventHurt(0.03);
        burst(G.player.x, 1.2, G.player.z, AC_COL, 6, 2, 0.06, 0.4);
      }
    }
    if (E.dry >= AC_NEED) complete(E, 1.3, L('SEQUINHO!', 'BONE DRY!'), L(`${AC_NEED}s embaixo do guarda-chuva`, `${AC_NEED}s under the umbrella`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('entre na chuva', 'step into the rain') : `☂ ${Math.floor(E.dry)}/${AC_NEED}s`),
  dim(E) {
    E.um.visible = false;
  },
  intro: () => L(`dentro do círculo cai chuva ácida, que queima. O guarda-chuva passeia pelo círculo: fique embaixo dele até somar ${AC_NEED}s.`, `acid rain falls inside the circle and burns. The umbrella wanders around it: stay under it until you add up ${AC_NEED}s.`),
});

// ==================================================================
// 70. O Chão é Lava: quadrados piscam e viram lava; sobreviva a 8 ondas em cima do tabuleiro
// ==================================================================
const LV_N = 5;
const LV_C = 1.2;
const LV_WAVES = 8;
const lava = mk({
  setup(d, floor, rooms) {
    const half = (LV_N * LV_C) / 2;
    const s = findSpot(d, rooms, half + 0.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const geo = new THREE.PlaneGeometry(LV_C - 0.08, LV_C - 0.08).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), LV_N * LV_N);
    inst.position.y = 0.035;
    g.add(inst);
    const m = new THREE.Matrix4();
    for (let i = 0; i < LV_N * LV_N; i++) {
      m.setPosition(-half + ((i % LV_N) + 0.5) * LV_C, 0, -half + (Math.floor(i / LV_N) + 0.5) * LV_C);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, tmpC.setHex(0x223044));
    }
    inst.instanceColor.needsUpdate = true;
    frame(g, half, half, lightMat(0xff5a2d, 0.8));
    return { kind: 'lava', x: s.x, z: s.z, g, inst, half, hot: new Array(LV_N * LV_N).fill(false), st: 'idle', wave: 0, phase: 'calm', t: 0, hits: 0, hit: false, blink: 0 };
  },
  paint(E, mode) {
    for (let i = 0; i < E.hot.length; i++) {
      const c = !E.hot[i] ? 0x223044 : mode === 'warn' ? (E.blink ? 0xffb347 : 0x553322) : 0xff3311;
      E.inst.setColorAt(i, tmpC.setHex(c).multiplyScalar(E.hot[i] && mode === 'lava' ? 2 : 1));
    }
    E.inst.instanceColor.needsUpdate = true;
  },
  cell(E) {
    const [lx, lz] = lpos(E);
    const i = Math.floor((lx + E.half) / LV_C);
    const j = Math.floor((lz + E.half) / LV_C);
    return i < 0 || j < 0 || i >= LV_N || j >= LV_N ? -1 : j * LV_N + i;
  },
  update(E, dt) {
    const c = lava.cell(E);
    if (E.st === 'idle') {
      if (c < 0 || !G.player.alive) return;
      E.st = 'run';
      E.phase = 'calm';
      E.t = 1.2;
      banner(L('O CHÃO É LAVA!', 'THE FLOOR IS LAVA!'), L(`Fuja dos quadrados que piscam: ${LV_WAVES} ondas`, `Dodge the blinking tiles: ${LV_WAVES} waves`));
      return;
    }
    E.t -= dt;
    if (E.phase === 'calm') {
      if (E.t > 0) return;
      const n = Math.min(19, 8 + E.wave * 2);
      const order = shuffle(E.hot.map((_, i) => i));
      E.hot.fill(false);
      for (let k = 0; k < n; k++) E.hot[order[k]] = true;
      E.phase = 'warn';
      E.t = Math.max(0.85, 1.4 - E.wave * 0.06 - G.floor * 0.004);
      E.blink = 0;
      E.bt = 0;
      sfx.telegraph();
      lava.paint(E, 'warn');
      return;
    }
    if (E.phase === 'warn') {
      E.bt -= dt;
      if (E.bt <= 0) {
        E.bt = 0.14;
        E.blink ^= 1;
        lava.paint(E, 'warn');
      }
      if (E.t > 0) return;
      E.phase = 'lava';
      E.t = 0.9;
      E.hit = c < 0;
      E.off = c < 0;
      sfx.flame();
      lava.paint(E, 'lava');
      if (c < 0) say(E, L('FORA DO TABULEIRO: NÃO CONTA', 'OFF THE BOARD: DOES NOT COUNT'), 'hurt');
    }
    if (E.phase === 'lava') {
      if (!E.hit && c >= 0 && E.hot[c]) {
        E.hit = true;
        E.hits++;
        eventHurt(0.08);
        burst(G.player.x, 0.4, G.player.z, 0xff5a2d, 16, 4, 0.07, 0.5, { up: 1.5 });
        if (E.hits >= 3) {
          E.hot.fill(false);
          lava.paint(E, 'calm');
          failed(E, L('Pisou na lava 3 vezes.', 'Stepped in the lava 3 times.'));
          return;
        }
      }
      if (E.t > 0) return;
      if (!E.hit) {
        E.wave++;
        sfx.click();
      }
      E.hot.fill(false);
      lava.paint(E, 'calm');
      E.phase = 'calm';
      E.t = 0.6;
      if (E.wave >= LV_WAVES) complete(E, 1.3, L('PÉS DE AMIANTO!', 'FIREPROOF FEET!'), L(`${LV_WAVES} ondas de lava`, `${LV_WAVES} lava waves`), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('suba no tabuleiro', 'step on the board') : `${E.wave}/${LV_WAVES} · ${E.hits}/3 🔥`),
  dim(E) {
    E.hot.fill(false);
    lava.paint(E, 'calm');
  },
  intro: () => L(`no tabuleiro, alguns quadrados piscam laranja e logo viram lava. Fique num quadrado escuro em cada onda. Sobreviva a ${LV_WAVES} ondas; 3 pisadas na lava e acabou.`, `on the board some tiles blink orange and then turn into lava. Stand on a dark tile each wave. Survive ${LV_WAVES} waves; step in the lava 3 times and it is over.`),
});

// ==================================================================
// 71. Fuja do Caçador: toque nas bases acesas enquanto um drone persegue você
// ==================================================================
const HU_COL = 0xff3355;
const HU_H = 4.2;
const HU_N = 8;
const hunter = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, HU_H + 0.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, HU_H, HU_H, lightMat(HU_COL, 0.7));
    const bases = [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2], [0, -3.3], [0, 3.3]].map(([x, z]) => {
      const mat = lightMat(0x445066, 0.6);
      put(g, mats().ring, mat, x, 0.04, z, 0.6, 1, 0.6);
      return { x, z, mat };
    });
    const b = bot(g, HU_COL, 0, 0, 0.9);
    return { kind: 'hunter', x: s.x, z: s.z, g, bases, b, st: 'idle', lit: -1, pts: 0, caught: 0, stun: 0 };
  },
  next(E) {
    let k = E.lit;
    while (k === E.lit) k = Math.floor(Math.random() * E.bases.length);
    if (E.lit >= 0) setLight(E.bases[E.lit].mat, 0x445066, 0.6);
    E.lit = k;
    setLight(E.bases[k].mat, 0x39ff88, 2.6);
  },
  update(E, dt) {
    const p = G.player;
    const b = E.b;
    const [lx, lz] = lpos(E);
    const pin = p.alive && Math.abs(lx) < HU_H && Math.abs(lz) < HU_H;
    if (E.st === 'idle') {
      if (!pin) return;
      E.st = 'run';
      E.stun = 1.2;
      b.x = lx > 0 ? -HU_H + 0.8 : HU_H - 0.8;
      b.z = lz > 0 ? -HU_H + 0.8 : HU_H - 0.8;
      banner(L('FUJA DO CAÇADOR!', 'RUN FROM THE HUNTER!'), L(`Toque ${HU_N} bases verdes sem ser pego`, `Touch ${HU_N} green bases without getting caught`));
      hunter.next(E);
      return;
    }
    E.stun -= dt;
    if (!pin) {
      b.x *= 1 - dt;
      b.z *= 1 - dt;
    } else if (E.stun <= 0) {
      const sp = Math.min((p.stats ? p.stats.speed : 5) * 0.75, 2.5 + E.pts * 0.15 + G.floor * 0.01);
      const dx = lx - b.x;
      const dz = lz - b.z;
      const l = Math.hypot(dx, dz) || 1;
      b.x = clampAbs(b.x + (dx / l) * sp * dt, HU_H - 0.3);
      b.z = clampAbs(b.z + (dz / l) * sp * dt, HU_H - 0.3);
      face(b, lx, lz);
      if (l < 0.85) {
        E.caught++;
        E.stun = 1.6;
        eventHurt(0.08, E.x + b.x, E.z + b.z, 9);
        // volta para o canto mais longe (senão pega de novo assim que acorda)
        ringFx(E.x + b.x, E.z + b.z, 1, HU_COL, 0.3);
        b.x = lx > 0 ? -HU_H + 0.8 : HU_H - 0.8;
        b.z = lz > 0 ? -HU_H + 0.8 : HU_H - 0.8;
        sfx.zap();
        say(E, L(`PEGO! (${E.caught}/3)`, `CAUGHT! (${E.caught}/3)`), 'hurt', lx, lz);
        if (E.caught >= 3) {
          failed(E, L('O caçador pegou você 3 vezes.', 'The hunter caught you 3 times.'));
          return;
        }
      }
    }
    b.m.position.set(b.x, E.stun > 0 ? 0 : Math.abs(Math.sin(G.t * 10)) * 0.1, b.z);
    setLight(b.eye, E.stun > 0 ? 0x666688 : HU_COL, 2.4);
    const q = E.bases[E.lit];
    if (pin && Math.hypot(lx - q.x, lz - q.z) < 0.65) {
      E.pts++;
      sfx.coin();
      burst(E.x + q.x, 0.5, E.z + q.z, 0x39ff88, 12, 3, 0.06, 0.4, { up: 1.2 });
      if (E.pts >= HU_N) {
        setLight(q.mat, 0x445066, 0.6);
        complete(E, 1.3, L('ESCAPOU!', 'GOT AWAY!'), L(`${HU_N} bases`, `${HU_N} bases`), E.x, E.z);
        return;
      }
      hunter.next(E);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre na arena', 'enter the arena') : `${E.pts}/${HU_N} · ${E.caught}/3 ✋`),
  dim(E) {
    for (const q of E.bases) setLight(q.mat, 0x445066, 0.4);
    if (E.st === 'done') E.b.m.visible = false;
  },
  intro: () => L(`um drone caçador persegue você na arena. Toque na base verde: outra acende. Some ${HU_N} bases; se ele pegar você 3 vezes, acabou.`, `a hunter drone chases you around the arena. Touch the green base and another one lights up. Reach ${HU_N} bases; if it catches you 3 times, it is over.`),
});

// ==================================================================
// 72. Vaga-lumes: pegue 8 vaga-lumes só quando estão acesos
// ==================================================================
const FF_COL = 0xd4ff3d;
const FF_R = 4.3;
const FF_N = 8;
const fireflies = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(0x5aff7a, 0.6), 0, 0.03, 0, FF_R, 1, FF_R);
    const flies = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * TAU;
      const x = Math.cos(a) * 2.6;
      const z = Math.sin(a) * 2.6;
      const mat = lightMat(FF_COL, 3);
      const m = put(g, mats().oct, mat, x, 1, z, 0.13, 0.13, 0.13);
      flies.push({ x, z, tx: x, tz: z, m, mat, on: k % 2 === 0, t: rr(0.2, 1.8), got: false, fast: 0 });
    }
    return { kind: 'fireflies', x: s.x, z: s.z, g, flies, st: 'idle', got: 0 };
  },
  update(E, dt) {
    const [lx, lz] = lpos(E);
    if (!near(E, FF_R + 7)) return;
    if (E.st === 'idle' && Math.hypot(lx, lz) < FF_R) {
      E.st = 'run';
      banner(L('VAGA-LUMES!', 'FIREFLIES!'), L(`Pegue ${FF_N} só quando estiverem acesos`, `Catch ${FF_N}, only while they glow`));
    }
    const pin = G.player.alive && Math.hypot(lx, lz) < FF_R + 0.5;
    for (const f of E.flies) {
      if (f.got) continue;
      f.t -= dt;
      if (f.t <= 0) {
        f.on = !f.on;
        f.t = f.on ? Math.max(0.7, 1.2 - G.floor * 0.004) : rr(1.3, 2.6);
        setLight(f.mat, f.on ? FF_COL : 0x223322, f.on ? 3 : 0.4);
      }
      f.fast -= dt;
      const dx = f.tx - f.x;
      const dz = f.tz - f.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.2) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * (FF_R - 0.6);
        f.tx = Math.cos(a) * r;
        f.tz = Math.sin(a) * r;
      } else {
        const sp = f.fast > 0 ? 4 : f.on ? 0.8 : 1.8;
        f.x += (dx / l) * Math.min(l, sp * dt);
        f.z += (dz / l) * Math.min(l, sp * dt);
      }
      f.m.position.set(f.x, 0.9 + Math.sin(G.t * 3 + f.tx) * 0.25, f.z);
      if (E.st !== 'run' || !pin || Math.hypot(lx - f.x, lz - f.z) > 0.75) continue;
      if (f.on) {
        f.got = true;
        f.m.visible = false;
        E.got++;
        sfx.coin();
        burst(E.x + f.x, 1, E.z + f.z, FF_COL, 14, 3, 0.06, 0.5, { up: 1 });
      } else if (f.fast <= 0) {
        // apagado: foge para o outro lado
        f.fast = 0.8;
        f.tx = clampAbs(-f.x, FF_R - 0.8);
        f.tz = clampAbs(-f.z, FF_R - 0.8);
      }
    }
    if (E.st === 'run' && E.got >= FF_N) {
      for (const f of E.flies) f.m.visible = false;
      complete(E, 1.2, L('POTE CHEIO!', 'FULL JAR!'), L(`${FF_N} vaga-lumes`, `${FF_N} fireflies`), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'enter the circle') : `${E.got}/${FF_N} ✨`),
  dim(E) {
    for (const f of E.flies) f.m.visible = E.st !== 'done' && !f.got;
  },
  intro: () => L(`os vaga-lumes acendem e apagam. Encoste neles só enquanto brilham; apagados eles fogem. Pegue ${FF_N}.`, `the fireflies blink on and off. Touch them only while they glow; dark ones dart away. Catch ${FF_N}.`),
});

// ==================================================================
// 73. Gangorra: seu peso inclina a prancha; mantenha a bola no meio por 12s
// ==================================================================
const SS_COL = 0xff8a3d;
const SS_HX = 3.8;
const SS_NEED = 12;
const seesaw = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.1, 1.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(0.6, 0.5, 0.8), mats().metal, 0, 0.25, 0);
    const plank = new THREE.Group();
    plank.position.y = 0.55;
    g.add(plank);
    put(plank, box(SS_HX * 2, 0.1, 0.5), mats().metal, 0, 0, 0);
    put(plank, box(2, 0.12, 0.52), lightMat(0x39ff88, 1.2), 0, 0.01, 0);
    put(plank, box(0.1, 0.14, 0.54), lightMat(0xff3355, 1.4), -SS_HX + 0.05, 0.01, 0);
    put(plank, box(0.1, 0.14, 0.54), lightMat(0xff3355, 1.4), SS_HX - 0.05, 0.01, 0);
    const ball = put(plank, sphere(), glowMat(0xffd23d, 2.4), 0, 0.27, 0, 0.22, 0.22, 0.22);
    put(g, box(SS_HX * 2, 0.02, 2), flatMat(SS_COL, 0.08), 0, 0.02, 0);
    frame(g, SS_HX, 1, lightMat(SS_COL, 0.7));
    return { kind: 'seesaw', x: s.x, z: s.z, g, plank, ball, st: 'idle', b: 0, v: 0, ang: 0, ok: 0, drops: 0, gust: 3 };
  },
  update(E, dt) {
    const [lx, lz] = lpos(E);
    const on = G.player.alive && Math.abs(lx) < SS_HX && Math.abs(lz) < 1;
    if (E.st === 'idle') {
      if (!on) return;
      E.st = 'run';
      banner(L('GANGORRA!', 'SEESAW!'), L('Seu peso inclina a prancha: mantenha a bola no verde', 'Your weight tilts the plank: keep the ball on the green'));
    }
    if (!near(E, 9)) return;
    const want = on ? clampAbs(-lx * 0.065, 0.24) : 0;
    E.ang += (want - E.ang) * Math.min(1, dt * 3);
    E.plank.rotation.z = E.ang;
    E.v += -Math.sin(E.ang) * 6 * dt;
    E.gust -= dt;
    if (E.gust <= 0 && on) {
      E.gust = rr(2, 3.5);
      E.v += (Math.random() < 0.5 ? -1 : 1) * rr(0.6, 1.2 + G.floor * 0.01);
    }
    E.v *= Math.max(0, 1 - dt * 0.5);
    E.b += E.v * dt;
    E.ball.position.x = E.b;
    E.ball.rotation.z -= E.v * dt * 4;
    if (Math.abs(E.b) > SS_HX - 0.1) {
      E.drops++;
      sfx.deny();
      burst(E.x + E.b, 0.7, E.z, 0xffd23d, 16, 4, 0.07, 0.5);
      E.b = 0;
      E.v = 0;
      if (E.drops >= 3) {
        failed(E, L('A bola caiu da gangorra 3 vezes.', 'The ball fell off the seesaw 3 times.'));
        return;
      }
      say(E, L(`CAIU! (${E.drops}/3)`, `DROPPED! (${E.drops}/3)`), 'hurt');
    }
    if (on && Math.abs(E.b) < 1) E.ok += dt;
    if (E.ok >= SS_NEED) complete(E, 1.3, L('EQUILIBRISTA!', 'BALANCING ACT!'), L(`${SS_NEED}s no meio`, `${SS_NEED}s in the middle`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('suba na gangorra', 'step on the seesaw') : `${Math.floor(E.ok)}/${SS_NEED}s · ${E.drops}/3 ●`),
  dim(E) {
    E.plank.rotation.z = 0;
    E.ball.visible = E.st !== 'failed';
  },
  intro: () => L(`a prancha desce para o lado em que você fica e a bola rola para lá. Ande na prancha para manter a bola na faixa verde do meio por ${SS_NEED}s (o vento atrapalha). 3 quedas e acabou.`, `the plank dips toward the side you stand on and the ball rolls that way. Walk on the plank to keep the ball on the green middle band for ${SS_NEED}s (gusts get in the way). 3 drops and it is over.`),
});

// ==================================================================
// 74. Matemática Rápida: fique parado na placa com a resposta certa. 5 acertos
// ==================================================================
const MA_COL = 0x3dc7ff;
const MA_NEED = 5;
const math = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3, 2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const plates = [-2, 0, 2].map((x) => plate(g, x, 0.8, 1.5, 1.5, MA_COL));
    const labels = plates.map((q) => tag(g, '?', 0xffffff, q.x, 0.8, q.z, 0.9, 1.8));
    const board = tag(g, L('? + ? = ?', '? + ? = ?'), 0xffd23d, 0, 1.6, -1.1, 1.1, 4);
    return { kind: 'math', x: s.x, z: s.z, g, plates, labels, board, st: 'idle', ok: 0, miss: 0, ans: 0, right: 0, t: 0, phase: 'q' };
  },
  ask(E) {
    const f = G.floor;
    const hi = Math.min(99, 9 + f * 2);
    let a;
    let b;
    let op;
    const r = Math.random();
    if (f >= 15 && r < 0.3) {
      a = 2 + Math.floor(Math.random() * Math.min(11, 6 + f / 10));
      b = 2 + Math.floor(Math.random() * 8);
      op = '×';
      E.ans = a * b;
    } else if (f >= 5 && r < 0.6) {
      a = 5 + Math.floor(Math.random() * hi);
      b = 1 + Math.floor(Math.random() * a);
      op = '−';
      E.ans = a - b;
    } else {
      a = 2 + Math.floor(Math.random() * hi);
      b = 2 + Math.floor(Math.random() * hi);
      op = '+';
      E.ans = a + b;
    }
    const opts = [E.ans];
    while (opts.length < 3) {
      const v = E.ans + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * (op === '×' ? Math.max(2, b) : 10)));
      if (v >= 0 && !opts.includes(v)) opts.push(v);
    }
    shuffle(opts);
    E.right = opts.indexOf(E.ans);
    opts.forEach((v, i) => setTag(E.labels[i], String(v), 0xffffff));
    setTag(E.board, `${a} ${op} ${b} = ?`, 0xffd23d);
    E.phase = 'q';
    for (const q of E.plates) setLight(q.ring, MA_COL, 0.6);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.6) || waitFoes(E)) return;
      E.st = 'run';
      banner(L('MATEMÁTICA RÁPIDA!', 'QUICK MATH!'), L('Fique parado na placa com a resposta certa', 'Stand still on the plate with the right answer'));
      math.ask(E);
      return;
    }
    if (E.phase === 'res') {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) math.ask(E);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.45);
    if (k < 0) return;
    E.phase = 'res';
    E.t = 1.1;
    setLight(E.plates[E.right].ring, 0x39ff88, 2.6);
    if (k === E.right) {
      E.ok++;
      sfx.coin();
      say(E, L('CERTO!', 'RIGHT!'), 'crit');
    } else {
      E.miss++;
      sfx.deny();
      setLight(E.plates[k].ring, 0xff3355, 2.6);
      say(E, L(`ERRADO: ${E.ans}`, `WRONG: ${E.ans}`), 'hurt');
    }
    if (E.ok >= MA_NEED) complete(E, 1.2, L('GÊNIO DA MATEMÁTICA!', 'MATH WHIZ!'), L(`${E.ok} acertos`, `${E.ok} right`), E.x, E.z);
    else if (E.miss >= 3) failed(E, L('Três respostas erradas.', 'Three wrong answers.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no quadro', 'reach the board') : `${E.ok}/${MA_NEED} ✔ · ${E.miss}/3 ✖`),
  dim(E) {
    setTag(E.board, E.st === 'done' ? '✔' : '✖', 0xffd23d);
    for (const t of E.labels) t.visible = false;
  },
  intro: () => L(`resolva a conta do quadro e fique parado um instante na placa com a resposta (passar por cima não conta). ${MA_NEED} acertos; 3 erros e acabou.`, `solve the sum on the board and stand still for a moment on the plate with the answer (walking over does not count). ${MA_NEED} right answers; 3 wrong and it is over.`),
});

// ==================================================================
// 75. Tráfego Neon: atravesse as faixas de carros e volte (2 travessias)
// ==================================================================
const FR_COL = 0x39ff88;
const FR_HX = 2.6;
const FR_HZ = 4.3;
const FR_LANES = [2.1, 0.7, -0.7, -2.1];
const frogger = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, FR_HX + 0.3, FR_HZ + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(FR_HX * 2, 0.03, 1.2), lightMat(FR_COL, 0.4), 0, 0.03, FR_HZ - 0.6);
    put(g, box(FR_HX * 2, 0.03, 1.2), lightMat(FR_COL, 0.4), 0, 0.03, -FR_HZ + 0.6);
    put(g, box(FR_HX * 2, 0.02, 5.6), mats().dark, 0, 0.02, 0);
    for (const z of [1.4, 0, -1.4]) put(g, box(FR_HX * 2, 0.03, 0.05), flatMat(0xffffff, 0.4), 0, 0.035, z);
    const cols = [0xff4df0, 0xffb347, 0x3dc7ff, 0xff3355];
    const cars = [];
    const per = 2 + (floor >= 20 ? 1 : 0);
    FR_LANES.forEach((z, i) => {
      const dir = i % 2 ? -1 : 1;
      const sp = dir * Math.min(5, 1.8 + i * 0.45 + floor * 0.02);
      for (let k = 0; k < per; k++) {
        const m = new THREE.Group();
        put(m, box(1.2, 0.4, 0.7), lightMat(cols[i], 1.3), 0, 0.3, 0);
        put(m, box(0.6, 0.3, 0.6), mats().dark, -0.1 * dir, 0.62, 0);
        g.add(m);
        cars.push({ m, z, x: -3 + (k / per) * 6 + i * 0.7, sp });
      }
    });
    return { kind: 'frogger', x: s.x, z: s.z, g, cars, st: 'idle', side: 1, cross: 0, hits: 0, armed: false, cool: 0 };
  },
  update(E, dt) {
    if (!near(E, 12)) return;
    const p = G.player;
    const [lx, lz] = lpos(E);
    E.cool -= dt;
    for (const c of E.cars) {
      c.x += c.sp * dt;
      if (c.x > 3.1) c.x -= 6.2;
      if (c.x < -3.1) c.x += 6.2;
      c.m.position.set(c.x, 0, c.z);
      c.m.visible = Math.abs(c.x) < FR_HX - 0.2;
      if (!E.armed || !c.m.visible || E.cool > 0) continue;
      if (Math.abs(lx - c.x) < 0.6 + p.r && Math.abs(lz - c.z) < 0.35 + p.r) {
        E.cool = 1;
        E.hits++;
        eventHurt(0.05, null, null);
        p.kx += Math.sign(c.sp) * 6;
        p.z = E.z + E.side * (FR_HZ - 0.6);
        sfx.hurt();
        burst(p.x, 0.8, p.z, 0xff3355, 12, 3, 0.07, 0.4);
        say(E, L(`ATROPELADO! (${E.hits}/5)`, `RUN OVER! (${E.hits}/5)`), 'hurt');
        if (E.hits >= 5) {
          failed(E, L('Atropelado 5 vezes.', 'Run over 5 times.'));
          return;
        }
      }
    }
    const inX = Math.abs(lx) < FR_HX + 0.2;
    // começa na calçada do lado atual
    if (!E.armed) {
      // antes de começar vale qualquer uma das duas calçadas
      if (E.st === 'idle' && inX && Math.abs(lz) > FR_HZ - 1.2 && Math.abs(lz) < FR_HZ + 0.3) E.side = Math.sign(lz);
      if (inX && lz * E.side > FR_HZ - 1.2 && lz * E.side < FR_HZ + 0.3) {
        E.armed = true;
        if (E.st === 'idle') {
          E.st = 'run';
          banner(L('TRÁFEGO NEON!', 'NEON TRAFFIC!'), L('Atravesse as faixas e volte', 'Cross the lanes and come back'));
        }
      }
      return;
    }
    if (!inX || lz * E.side > FR_HZ + 0.5) {
      E.armed = false;
      return;
    }
    if (lz * E.side < -FR_HZ + 1.2) {
      E.cross++;
      E.side = -E.side;
      sfx.coin();
      if (E.cross >= 2) {
        complete(E, 1.3, L('TRAVESSIA SEGURA!', 'SAFE CROSSING!'), L(`${E.hits} batidas`, `${E.hits} bumps`), E.x, E.z);
        return;
      }
      say(E, L('AGORA VOLTE!', 'NOW GO BACK!'), 'up', 0, lz);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('vá até a calçada verde', 'go to the green sidewalk') : `${E.cross}/2 · ${E.hits}/5 💥`),
  dim(E) {
    for (const c of E.cars) c.m.visible = E.st === 'failed';
  },
  intro: () => L('carros de neon passam em 4 faixas. Saia de uma calçada verde, chegue na outra e volte. Cada batida empurra você de volta; 5 batidas e acabou.', 'neon cars zoom along 4 lanes. Leave one green sidewalk, reach the other and come back. Each hit sends you back; 5 hits and it is over.'),
});

// ==================================================================
// 76. Roda da Fortuna: gire (golpe na alavanca) e junte pontos; a caveira zera. Pise no cofre para sacar
// ==================================================================
const WH_SEG = [1, 2, 1, 3, 0, 2, 1, 0];
const WH_COLS = { 0: 0x222233, 1: 0x3dc7ff, 2: 0x39ff88, 3: 0xffd23d };
let whGeo = null;
const wheel = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.3, 2.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    if (!whGeo) whGeo = WH_SEG.map((_, i) => new THREE.CircleGeometry(1.8, 6, (i / 8) * TAU + 0.02, TAU / 8 - 0.04).rotateX(-Math.PI / 2));
    const disc = new THREE.Group();
    disc.position.set(0, 0.05, -0.6);
    g.add(disc);
    WH_SEG.forEach((v, i) => {
      put(disc, whGeo[i], lightMat(WH_COLS[v], v ? 1.1 : 1));
      const a = ((i + 0.5) / 8) * TAU;
      tag(disc, v ? `+${v}` : '💀', 0xffffff, Math.cos(a) * 1.2, 0.35, -Math.sin(a) * 1.2, 0.6, 1.3);
    });
    put(g, mats().ring, lightMat(0xff4df0, 1.4), 0, 0.04, -0.6, 1.85, 1, 1.85);
    put(g, mats().cone, glowMat(0xff4df0, 2.6), 0, 0.3, -2.65, 2.5, 2.5, 2.5);
    // alavanca (alvo) e cofre (sacar)
    put(g, mats().cyl, mats().metal, -2.6, 0.5, 1.6, 0.3, 1, 0.3);
    put(g, mats().oct, glowMat(0xff3355, 2.4), -2.6, 1.15, 1.6, 0.25, 0.25, 0.25);
    const cash = plate(g, 2.4, 1.6, 1.3, 1.3, 0xffd23d, 1.2);
    tag(g, '💰', 0xffffff, 2.4, 0.9, 1.6, 0.8);
    const pot = tag(g, '0', 0xffd23d, 0, 1.6, -0.6, 1, 2);
    const e = hitTarget(s.x - 2.6, s.z + 1.6, 0.5, 1.2, L('Alavanca', 'Lever'));
    return { kind: 'wheel', x: s.x, z: s.z, g, disc, cash, pot, e, hits: 0, st: 'idle', w: 0, spin: false, ang: 0, pts: 0, spins: 5, seg: -1 };
  },
  segAt(E) {
    const a = (((Math.PI / 2 - E.ang) % TAU) + TAU) % TAU;
    return Math.floor(a / (TAU / 8)) % 8;
  },
  cashOut(E) {
    const mult = Math.min(2.6, 0.6 + E.pts * 0.2);
    dropTarget(E);
    complete(E, mult, L('PRÊMIO SACADO!', 'CASHED OUT!'), L(`${E.pts} pontos`, `${E.pts} points`), E.x, E.z);
  },
  update(E, dt) {
    const n = hitsOf(E);
    if (E.st === 'idle') {
      if (!near(E, 4.5)) return;
      E.st = 'run';
      banner(L('RODA DA FORTUNA!', 'WHEEL OF FORTUNE!'), L('Bata na alavanca para girar; pise no 💰 para sacar', 'Hit the lever to spin; step on 💰 to cash out'));
    }
    if (E.spin) {
      E.ang += E.w * dt;
      E.w = Math.max(0, E.w - 3.2 * dt);
      E.disc.rotation.y = E.ang;
      const sg = wheel.segAt(E);
      if (sg !== E.seg) {
        E.seg = sg;
        sfx.click();
      }
      if (E.w > 0) return;
      E.spin = false;
      const v = WH_SEG[sg];
      E.spins--;
      if (!v) {
        E.pts = 0;
        sfx.deny();
        say(E, L('CAVEIRA! PERDEU TUDO', 'SKULL! LOST IT ALL'), 'hurt', 0, -0.6);
      } else {
        E.pts += v;
        sfx.coin();
        say(E, `+${v}`, 'crit', 0, -0.6);
      }
      setTag(E.pot, String(E.pts), 0xffd23d);
      if (E.spins <= 0) {
        if (E.pts > 0) wheel.cashOut(E);
        else {
          dropTarget(E);
          failed(E, L('Os giros acabaram sem prêmio.', 'Out of spins with nothing to show.'));
        }
      }
      return;
    }
    if (n && E.spins > 0) {
      E.spin = true;
      E.w = rr(7, 11.5);
      E.seg = -1;
      sfx.spin();
      return;
    }
    if (E.pts > 0 && plateIdx(E, [E.cash], 0.1) === 0) wheel.cashOut(E);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na roda', 'reach the wheel') : `${E.pts} ${L('pts', 'pts')} · ${E.spins} ${L('giros', 'spins')}`),
  dim(E) {
    dropTarget(E);
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('bata na alavanca para girar a roda: cada número soma pontos, a caveira zera tudo. Pise no cofre 💰 para sacar quando quiser (mais pontos, prêmio maior). 5 giros.', 'hit the lever to spin the wheel: numbers add points, the skull wipes them out. Step on the 💰 safe to cash out whenever you like (more points, bigger prize). 5 spins.'),
});

// ==================================================================
// 77. Mistura de Cores: ligue e desligue as luzes vermelha, verde e azul até a mistura igualar o alvo
// ==================================================================
const CO_MIX = ['R', 'G', 'B'];
const CO_HEX = [0xff2a2a, 0x2aff2a, 0x2a6aff];
const coMix = (r, g, b) => (r ? 0xff0000 : 0) | (g ? 0x00ff00 : 0) | (b ? 0x0000ff : 0);
const colors = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.7, 2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const plates = CO_HEX.map((c, i) => plate(g, (i - 1) * 1.8, 1.0, 1.4, 1.4, c));
    put(g, mats().cyl, mats().metal, -1.1, 0.4, -1.3, 0.3, 0.8, 0.3);
    put(g, mats().cyl, mats().metal, 1.1, 0.4, -1.3, 0.3, 0.8, 0.3);
    const mixMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const tgtMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const mix = put(g, sphere(), mixMat, -1.1, 1.2, -1.3, 0.42, 0.42, 0.42);
    put(g, sphere(), tgtMat, 1.1, 1.2, -1.3, 0.42, 0.42, 0.42);
    tag(g, L('você', 'you'), 0xffffff, -1.1, 1.95, -1.3, 0.55, 2);
    tag(g, L('alvo', 'target'), 0xffffff, 1.1, 1.95, -1.3, 0.55, 2);
    return { kind: 'colors', x: s.x, z: s.z, g, plates, mix, mixMat, tgtMat, on: [0, 0, 0], tgt: 0, st: 'idle', round: 0, moves: 0, miss: 0, t: 0 };
  },
  target(E) {
    // alvo diferente da mistura atual
    let t;
    do t = coMix(Math.random() < 0.5, Math.random() < 0.5, Math.random() < 0.5);
    while (!t || t === coMix(...E.on));
    E.tgt = t;
    E.tgtMat.color.setHex(E.tgt).multiplyScalar(gkSafe(1.6));
    const need = [0xff0000, 0x00ff00, 0x0000ff].filter((m, i) => !!(E.tgt & m) !== !!E.on[i]).length;
    E.moves = need + 1;
  },
  paint(E) {
    const c = coMix(...E.on);
    E.mixMat.color.setHex(c || 0x222222).multiplyScalar(c ? gkSafe(1.6) : 1);
    E.plates.forEach((q, i) => setLight(q.ring, CO_HEX[i], E.on[i] ? 2.6 : 0.5));
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.4)) return;
      E.st = 'run';
      banner(L('MISTURA DE CORES!', 'COLOR MIXER!'), L('Ligue as luzes certas para formar a cor do alvo', 'Switch on the right lights to make the target color'));
      colors.target(E);
      colors.paint(E);
      return;
    }
    if (E.t > 0) {
      E.t -= dt;
      dwellHold(E, E.plates);
      if (E.t <= 0) colors.target(E);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.3);
    if (k < 0) return;
    E.on[k] = E.on[k] ? 0 : 1;
    E.moves--;
    sfx.click();
    colors.paint(E);
    if (coMix(...E.on) === E.tgt) {
      E.round++;
      sfx.coin();
      say(E, L('COR CERTA!', 'MATCH!'), 'crit', 0, -1.3);
      burst(E.x, 1.2, E.z - 1.3, E.tgt, 18, 4, 0.07, 0.5, { up: 1 });
      if (E.round >= 4) complete(E, 1.2, L('PINTOR DE LUZ!', 'LIGHT PAINTER!'), L('4 cores', '4 colors'), E.x, E.z);
      else E.t = 0.8;
      return;
    }
    if (E.moves <= 0) {
      E.miss++;
      sfx.deny();
      say(E, L(`ERROU A MISTURA (${E.miss}/3)`, `WRONG MIX (${E.miss}/3)`), 'hurt', 0, -1.3);
      if (E.miss >= 3) failed(E, L('Três misturas erradas.', 'Three wrong mixes.'));
      else colors.target(E);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nas luzes', 'reach the lights') : `${E.round}/4 · ${E.moves} ${L('toques', 'taps')} · ${E.miss}/3 ✖`),
  dim(E) {
    E.on = [0, 0, 0];
    colors.paint(E);
  },
  intro: () => L('cada placa liga ou desliga uma luz (vermelha, verde, azul); a esfera da esquerda mostra a mistura. Forme a cor da esfera da direita com poucos toques (vermelho+verde = amarelo, verde+azul = ciano, vermelho+azul = magenta, as três = branco). 4 cores.', 'each plate switches a light on or off (red, green, blue); the left orb shows the mix. Make the color of the right orb in few taps (red+green = yellow, green+blue = cyan, red+blue = magenta, all three = white). 4 colors.'),
});
// brilho das esferas (o GLOW global pode ser 0 no modo econômico)
const gkSafe = (k) => Math.max(1, k);

// ==================================================================
// 78. Maior ou Menor: o próximo número é maior ou menor? 5 acertos
// ==================================================================
const HL_COL = 0xc77bff;
const HL_NEED = 5;
const hilo = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.5, 1.9);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const plates = [plate(g, -1.4, 0.7, 1.5, 1.5, 0x39ff88), plate(g, 1.4, 0.7, 1.5, 1.5, 0xff4d6d)];
    tag(g, L('▲ MAIOR', '▲ HIGHER'), 0x39ff88, -1.4, 0.8, 0.7, 0.6, 3.2);
    tag(g, L('▼ MENOR', '▼ LOWER'), 0xff4d6d, 1.4, 0.8, 0.7, 0.6, 3.2);
    const screen = tag(g, '?', 0xffffff, 0, 1.55, -0.9, 1.3, 2.4);
    return { kind: 'hilo', x: s.x, z: s.z, g, plates, screen, st: 'idle', cur: 0, max: 0, ok: 0, miss: 0, t: 0 };
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 3.4)) return;
      E.st = 'run';
      E.max = Math.min(999, 20 + G.floor * 3);
      E.cur = 1 + Math.floor(Math.random() * E.max);
      setTag(E.screen, String(E.cur), 0xffffff);
      banner(L('MAIOR OU MENOR?', 'HIGHER OR LOWER?'), L(`Números de 1 a ${E.max}: adivinhe o próximo`, `Numbers from 1 to ${E.max}: guess the next one`));
      return;
    }
    if (E.t > 0) {
      E.t -= dt;
      if (E.t <= 0) {
        setTag(E.screen, String(E.cur), 0xffffff);
        // quem ficou na placa palpita de novo (o próximo número já estava na tela)
        E.dk = -1;
      }
      return;
    }
    const k = dwell(E, E.plates, dt, 0.4);
    if (k < 0) return;
    let nx = E.cur;
    while (nx === E.cur) nx = 1 + Math.floor(Math.random() * E.max);
    const up = nx > E.cur;
    const right = (k === 0) === up;
    setTag(E.screen, [[`${E.cur} → `, 0xaaaaaa], [String(nx), right ? 0x39ff88 : 0xff3355]], 0xffffff);
    E.cur = nx;
    E.t = 1.3;
    if (right) {
      E.ok++;
      sfx.coin();
    } else {
      E.miss++;
      sfx.deny();
    }
    say(E, right ? L('ACERTOU!', 'RIGHT!') : L('ERROU!', 'WRONG!'), right ? 'crit' : 'hurt');
    if (E.ok >= HL_NEED) complete(E, 1.2, L('INTUIÇÃO AFIADA!', 'SHARP HUNCH!'), L(`${E.ok} acertos`, `${E.ok} right`), E.x, E.z);
    else if (E.miss >= 3) failed(E, L('Três palpites errados.', 'Three wrong guesses.'));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na tela', 'reach the screen') : `${E.ok}/${HL_NEED} ✔ · ${E.miss}/3 ✖`),
  dim() {},
  intro: () => L(`a tela mostra um número. Fique parado na placa verde se acha que o próximo será maior, ou na vermelha se será menor. ${HL_NEED} acertos; 3 erros e acabou.`, `the screen shows a number. Stand still on the green plate if you think the next one is higher, or on the red one if lower. ${HL_NEED} right; 3 wrong and it is over.`),
});

// ==================================================================
// 79. O Mestre Mandou: obedeça só às ordens que começam com "O mestre mandou"
// ==================================================================
const SI_COLS = [0xff3355, 0x3d8bff, 0x39ff88, 0xffd23d];
const SI_NAMES = () => [L('VERMELHO', 'RED'), L('AZUL', 'BLUE'), L('VERDE', 'GREEN'), L('AMARELO', 'YELLOW')];
const SI_NEED = 6;
const simon = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.7);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const pads = [[0, -2], [2, 0], [0, 2], [-2, 0]].map(([x, z], i) => {
      const mat = lightMat(SI_COLS[i], 0.9);
      put(g, mats().disc, mat, x, 0.04, z, 0.65, 1, 0.65);
      return { x, z, mat };
    });
    const mid = lightMat(0xffffff, 0.6);
    put(g, mats().ring, mid, 0, 0.04, 0, 0.65, 1, 0.65);
    const cmd = tag(g, '', 0xffffff, 0, 2.4, 0, 0.8, 8);
    return { kind: 'simon', x: s.x, z: s.z, g, pads, mid, cmd, st: 'idle', phase: 'center', t: 0, want: 0, says: true, ok: 0, miss: 0 };
  },
  padAt(E) {
    const [lx, lz] = lpos(E);
    for (let i = 0; i < 4; i++) if (Math.hypot(lx - E.pads[i].x, lz - E.pads[i].z) < 0.62) return i;
    return Math.hypot(lx, lz) < 0.62 ? 4 : -1;
  },
  result(E, good, msg) {
    E.phase = 'center';
    E.t = 0;
    if (good) {
      E.ok++;
      sfx.coin();
    } else {
      E.miss++;
      sfx.deny();
    }
    say(E, msg, good ? 'crit' : 'hurt');
    setTag(E.cmd, L('volte ao centro', 'back to the center'), 0xaaaaaa);
    setLight(E.mid, 0xffffff, 1.4);
    if (E.ok >= SI_NEED) complete(E, 1.2, L('OBEDIENTE... QUANDO PRECISA!', 'OBEDIENT... WHEN IT COUNTS!'), L(`${E.ok} ordens`, `${E.ok} commands`), E.x, E.z);
    else if (E.miss >= 3) failed(E, L('Três ordens erradas.', 'Three wrong moves.'));
  },
  update(E, dt) {
    const k = simon.padAt(E);
    if (E.st === 'idle') {
      if (!near(E, 3.2) || waitFoes(E)) return;
      E.st = 'run';
      banner(L('O MESTRE MANDOU!', 'SIMON SAYS!'), L('Só obedeça quando a ordem começar com "o mestre mandou"', 'Only obey when the order starts with "Simon says"'));
      setTag(E.cmd, L('vá para o centro', 'go to the center'), 0xaaaaaa);
      setLight(E.mid, 0xffffff, 1.4);
      return;
    }
    if (E.phase === 'center') {
      E.t = k === 4 ? E.t + dt : 0;
      if (E.t < 0.6) return;
      E.phase = 'cmd';
      E.t = G.floor >= 20 ? 2.1 : 2.5;
      E.want = Math.floor(Math.random() * 4);
      E.says = Math.random() < 0.62;
      const nm = SI_NAMES()[E.want];
      setTag(E.cmd, E.says ? [[L('O mestre mandou: ', 'Simon says: '), 0xffffff], [nm, SI_COLS[E.want]]] : [[nm, SI_COLS[E.want]], ['!', 0xffffff]], 0xffffff);
      setLight(E.mid, 0xffffff, 0.6);
      sfx.seq(E.want);
      return;
    }
    E.t -= dt;
    if (E.says) {
      if (k === E.want) return simon.result(E, true, L('ISSO!', 'YES!'));
      if (k >= 0 && k < 4) return simon.result(E, false, L('COR ERRADA!', 'WRONG COLOR!'));
      if (E.t <= 0) simon.result(E, false, L('DEMOROU!', 'TOO SLOW!'));
    } else {
      if (k >= 0 && k < 4) return simon.result(E, false, L('O MESTRE NÃO MANDOU!', 'SIMON DIDN\'T SAY!'));
      if (E.t <= 0) simon.result(E, true, L('BOA, FICOU PARADO!', 'NICE, YOU STAYED!'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no círculo', 'reach the circle') : `${E.ok}/${SI_NEED} ✔ · ${E.miss}/3 ✖`),
  dim(E) {
    setTag(E.cmd, '', 0xffffff);
  },
  intro: () => L(`fique no centro e leia a ordem. Se começar com "O mestre mandou", corra para a cor; se não, não saia do lugar. ${SI_NEED} acertos; 3 erros e acabou.`, `stand in the center and read the order. If it starts with "Simon says", run to that color; otherwise stay put. ${SI_NEED} right; 3 wrong and it is over.`),
});

// ==================================================================
// 80. Jogo da Velha: fique parado numa casa para marcar o X; vença o robô
// ==================================================================
const TT_C = 1.3;
const TT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const tictac = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const line = lightMat(0x9ad7ff, 1.2);
    for (const o of [-0.5, 0.5]) {
      put(g, box(TT_C * 3, 0.04, 0.07), line, 0, 0.04, o * TT_C);
      put(g, box(0.07, 0.04, TT_C * 3), line, o * TT_C, 0.04, 0);
    }
    const cells = [];
    for (let i = 0; i < 9; i++) cells.push({ x: ((i % 3) - 1) * TT_C, z: (Math.floor(i / 3) - 1) * TT_C, w: TT_C, h: TT_C, fill: flatMat(0x00e5ff, 0.12), ring: null });
    for (const c of cells) {
      c.ring = lightMat(0x1a2236, 1);
      put(g, box(TT_C - 0.12, 0.02, TT_C - 0.12), c.fill, c.x, 0.03, c.z);
    }
    const marks = new THREE.Group();
    g.add(marks);
    return { kind: 'tictac', x: s.x, z: s.z, g, cells, marks, b: new Array(9).fill(0), st: 'idle', turn: 'p', t: 0, games: 1 };
  },
  mark(E, i, who) {
    E.b[i] = who;
    const c = E.cells[i];
    if (who === 1) {
      const mat = lightMat(0x00e5ff, 2.2);
      put(E.marks, box(0.9, 0.08, 0.14), mat, c.x, 0.08, c.z).rotation.y = Math.PI / 4;
      put(E.marks, box(0.9, 0.08, 0.14), mat, c.x, 0.08, c.z).rotation.y = -Math.PI / 4;
    } else put(E.marks, mats().ring, lightMat(0xff4df0, 2.2), c.x, 0.08, c.z, 0.42, 1, 0.42);
    burst(E.x + c.x, 0.4, E.z + c.z, who === 1 ? 0x00e5ff : 0xff4df0, 10, 3, 0.06, 0.4, { up: 1 });
  },
  winner(b) {
    for (const [a, c, d] of TT_LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    return b.every((v) => v) ? 3 : 0;
  },
  robot(E) {
    const b = E.b;
    const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const finish = (who) => {
      for (const i of free) {
        b[i] = who;
        const w = tictac.winner(b) === who;
        b[i] = 0;
        if (w) return i;
      }
      return -1;
    };
    let i = finish(2);
    if (i < 0 && Math.random() < Math.min(0.85, 0.62 + G.floor * 0.006)) i = finish(1);
    if (i < 0 && !b[4] && Math.random() < 0.5) i = 4;
    if (i < 0) i = free[Math.floor(Math.random() * free.length)];
    tictac.mark(E, i, 2);
    sfx.click();
  },
  reset(E) {
    E.b.fill(0);
    while (E.marks.children.length) E.marks.remove(E.marks.children[0]);
    E.turn = 'p';
    E.games++;
    E.fired = true;
  },
  end(E) {
    const w = tictac.winner(E.b);
    if (!w) return false;
    if (w === 1) complete(E, 1.3, L('VELHA VENCIDA!', 'TIC-TAC-TOE WON!'), L(`partida ${E.games}`, `game ${E.games}`), E.x, E.z);
    else if (w === 2) failed(E, L('O robô fez três em linha.', 'The robot got three in a row.'));
    else if (E.games >= 4) failed(E, L('Empates demais: o robô cansou.', 'Too many draws: the robot gave up.'));
    else {
      say(E, L('DEU VELHA! DE NOVO', 'DRAW! AGAIN'), 'up');
      E.turn = 'wait';
      E.t = 1.2;
    }
    return true;
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!inRect(E, 1.95, 1.95)) return;
      E.st = 'run';
      banner(L('JOGO DA VELHA!', 'TIC-TAC-TOE!'), L('Você é o X: fique parado numa casa para marcar', 'You are X: stand still on a square to mark it'));
      return;
    }
    if (E.turn === 'wait') {
      E.t -= dt;
      if (E.t <= 0) tictac.reset(E);
      return;
    }
    if (E.turn === 'r') {
      E.t -= dt;
      if (E.t > 0) return;
      tictac.robot(E);
      E.turn = 'p';
      tictac.end(E);
      return;
    }
    const k = dwell(E, E.cells, dt, 0.4);
    if (k < 0 || E.b[k]) return;
    tictac.mark(E, k, 1);
    sfx.coin();
    if (tictac.end(E)) return;
    E.turn = 'r';
    E.t = 0.7;
  },
  hud: (E) => (E.st === 'idle' ? L('entre no tabuleiro', 'step on the board') : `${L('partida', 'game')} ${E.games}/4 · ${E.turn === 'p' ? L('sua vez (X)', 'your turn (X)') : L('vez do robô', 'robot\'s turn')}`),
  dim() {},
  intro: () => L('você é o X e o robô é o O. Fique parado um instante numa casa vazia para marcar. Faça três em linha antes dele; empate começa de novo (até 4 partidas).', 'you are X and the robot is O. Stand still for a moment on an empty square to mark it. Get three in a row before it does; a draw starts over (up to 4 games).'),
});

// ==================================================================
// 81. Ventania: fique no círculo do meio por 15s enquanto o vento muda de direção
// ==================================================================
const WI_COL = 0x9ad7ff;
const WI_R = 3.4;
const WI_NEED = 15;
const wind = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(WI_COL, 0.8), 0, 0.03, 0, WI_R, 1, WI_R);
    const core = lightMat(0x39ff88, 1.2);
    put(g, mats().ring, core, 0, 0.04, 0, 1.1, 1, 1.1);
    const arrow = new THREE.Group();
    arrow.position.y = 0.1;
    g.add(arrow);
    const am = lightMat(WI_COL, 2);
    put(arrow, box(1.6, 0.04, 0.16), am, 0.2, 0, 0);
    put(arrow, mats().cone, am, 1.1, 0, 0, 3, 3, 2).rotation.y = Math.PI / 2;
    for (const a of [0, 1, 2]) put(arrow, box(0.5, 0.03, 0.06), am, -1.6 - a * 0.1, 0, (a - 1) * 0.4);
    return { kind: 'wind', x: s.x, z: s.z, g, core, arrow, am, st: 'idle', dir: 0, next: 0, t: 2.5, tel: 0, ok: 0 };
  },
  update(E, dt) {
    const p = G.player;
    const [lx, lz] = lpos(E);
    const pin = p.alive && Math.hypot(lx, lz) < WI_R + 0.3;
    if (E.st === 'idle') {
      if (!pin) return;
      E.st = 'run';
      E.dir = Math.random() * TAU;
      E.next = E.dir;
      banner(L('VENTANIA!', 'GALE!'), L(`Segure-se no círculo verde por ${WI_NEED}s`, `Hold on in the green circle for ${WI_NEED}s`));
    }
    if (!pin) return;
    E.t -= dt;
    if (E.t <= 0.7 && E.tel <= 0) {
      // aviso: a seta pisca na direção nova
      E.tel = 1;
      E.next = E.dir + (Math.random() < 0.5 ? 1 : -1) * rr(1.6, Math.PI);
    }
    if (E.tel > 0) setLight(E.am, Math.floor(G.t * 8) % 2 ? 0xffffff : WI_COL, 2.4);
    if (E.t <= 0) {
      E.dir = E.next;
      E.t = rr(2, 3.2);
      E.tel = 0;
      setLight(E.am, WI_COL, 2);
      sfx.dash();
    }
    E.arrow.rotation.y = -(E.tel > 0 ? E.next : E.dir);
    const str = (p.stats ? p.stats.speed : 5) * Math.min(0.78, 0.52 + G.floor * 0.004 + (E.ok / WI_NEED) * 0.12);
    p.x += Math.cos(E.dir) * str * dt;
    p.z += Math.sin(E.dir) * str * dt;
    if (Math.random() < dt * 12) burst(p.x - Math.cos(E.dir) * 1.5, 1, p.z - Math.sin(E.dir) * 1.5, WI_COL, 1, 0.5, 0.05, 0.4, { grav: 0 });
    const inC = Math.hypot(lx, lz) < 1.1;
    setLight(E.core, inC ? 0x39ff88 : 0xff3355, inC ? 2.2 : 1);
    if (inC) E.ok += dt;
    if (E.ok >= WI_NEED) complete(E, 1.3, L('PÉ NO CHÃO!', 'STOOD YOUR GROUND!'), L(`${WI_NEED}s na ventania`, `${WI_NEED}s in the gale`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('entre no círculo', 'enter the circle') : `🌬 ${Math.floor(E.ok)}/${WI_NEED}s`),
  dim(E) {
    E.arrow.visible = false;
  },
  intro: () => L(`dentro do círculo o vento empurra você para a direção da seta; ela pisca antes de mudar. Some ${WI_NEED}s dentro do anel verde do meio.`, `inside the circle the wind pushes you where the arrow points; it blinks before changing. Add up ${WI_NEED}s inside the green middle ring.`),
});

// ==================================================================
// 82. Soletrando: pise nas letras da palavra, na ordem
// ==================================================================
const SP_WORDS_PT = ['NEON', 'CYBER', 'PIXEL', 'ROBO', 'LASER', 'CHAVE', 'PORTAL', 'DRONE', 'PLASMA', 'CODIGO', 'MATRIZ', 'CIRCUITO'];
const SP_WORDS_EN = ['NEON', 'CYBER', 'PIXEL', 'ROBOT', 'LASER', 'PORTAL', 'DRONE', 'PLASMA', 'MATRIX', 'CIRCUIT', 'GLITCH', 'SIGNAL'];
const SP_COL = 0x5affd2;
const spell = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.2, 2.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const list = L(SP_WORDS_PT, SP_WORDS_EN);
    const max = floor < 10 ? 5 : floor < 25 ? 6 : 8;
    const words = list.filter((w) => w.length <= max);
    const word = words[ri(0, words.length - 1)];
    const abc = 'ABCDEFGHIJLMNOPRSTUVXZ'.split('').filter((c) => !word.includes(c));
    const letters = shuffle(word.split('').concat(shuffle(abc).slice(0, 10 - word.length)));
    const plates = letters.map((ch, i) => {
      const x = ((i % 5) - 2) * 1.6;
      const z = i < 5 ? -0.2 : 1.45;
      const q = plate(g, x, z, 1.35, 1.35, SP_COL);
      q.ch = ch;
      q.used = false;
      q.t = tag(g, ch, 0xffffff, x, 0.75, z, 0.9);
      return q;
    });
    const board = tag(g, word, 0xffffff, 0, 1.6, -1.3, 1, 6);
    return { kind: 'spell', x: s.x, z: s.z, g, plates, board, word, i: 0, st: 'idle', miss: 0 };
  },
  show(E) {
    setTag(E.board, [[E.word.slice(0, E.i), 0x39ff88], [E.word.slice(E.i), 0xffffff]], 0xffffff);
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 4)) return;
      E.st = 'run';
      banner(L('SOLETRANDO!', 'SPELLING BEE!'), L(`Pise nas letras de ${E.word}, na ordem`, `Step on the letters of ${E.word}, in order`));
      spell.show(E);
      return;
    }
    const k = dwell(E, E.plates, dt, 0.4);
    if (k < 0) return;
    const q = E.plates[k];
    if (q.used) return;
    if (q.ch === E.word[E.i]) {
      q.used = true;
      setLight(q.ring, 0x39ff88, 2.4);
      setTag(q.t, q.ch, 0x39ff88);
      E.i++;
      sfx.seq(E.i % 4);
      spell.show(E);
      if (E.i >= E.word.length) complete(E, 1.2, L('SOLETROU!', 'SPELLED IT!'), E.word, E.x, E.z);
      return;
    }
    E.miss++;
    sfx.deny();
    setLight(q.ring, 0xff3355, 2.4);
    setTimeout(() => !q.used && setLight(q.ring, SP_COL, 0.6), 600);
    say(E, L(`LETRA ERRADA (${E.miss}/3)`, `WRONG LETTER (${E.miss}/3)`), 'hurt', q.x, q.z);
    if (E.miss >= 3) failed(E, L(`Três letras erradas em ${E.word}.`, `Three wrong letters in ${E.word}.`));
  },
  hud: (E) => (E.st === 'idle' ? L('chegue nas letras', 'reach the letters') : `${E.word.slice(0, E.i)}${'_'.repeat(E.word.length - E.i)} · ${E.miss}/3 ✖`),
  dim(E) {
    E.i = E.st === 'done' ? E.word.length : 0;
    spell.show(E);
  },
  intro: () => L('a palavra aparece no painel. Fique parado um instante em cada letra, na ordem certa (passar por cima não conta). Há letras de enfeite; 3 erros e acabou.', 'the word shows on the panel. Stand still for a moment on each letter in the right order (walking over does not count). Some letters are decoys; 3 mistakes and it is over.'),
});

// ==================================================================
// 83. Filhotes Perdidos: encoste nos filhotes (eles seguem você) e leve 5 ao cercado; levar dano espalha a fila
// ==================================================================
const PU_COL = 0xffb36b;
const PU_N = 5;
const pups = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 1.8);
    if (!s) return null;
    const spots = [];
    for (let t = 0; t < 200 && spots.length < PU_N; t++) {
      const a = rr(0, TAU);
      const r = rr(4.5, 9);
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      if (!isWalkable(d, x, z) || !isWalkable(d, x + 0.5, z) || !isWalkable(d, x - 0.5, z) || !isWalkable(d, x, z + 0.5) || !isWalkable(d, x, z - 0.5)) continue;
      if (spots.some((q) => Math.hypot(q[0] - x, q[1] - z) < 2)) continue;
      spots.push([x, z]);
    }
    if (spots.length < PU_N) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(PU_COL, 1.4), 0, 0.04, 0, 1.4, 1, 1.4);
    put(g, mats().disc, flatMat(PU_COL, 0.12), 0, 0.03, 0, 1.4, 1, 1.4);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      if (k === 2) continue;
      put(g, box(0.1, 0.5, 0.1), mats().metal, Math.cos(a) * 1.4, 0.25, Math.sin(a) * 1.4);
    }
    const fur = [0xffd2a0, 0xc9a36b, 0xf0f0f0, 0x9a7a5a, 0xffb36b];
    const list = spots.map(([x, z], i) => {
      const m = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: fur[i] });
      put(m, box(0.32, 0.24, 0.5), mat, 0, 0.26, 0);
      put(m, box(0.28, 0.26, 0.26), mat, 0, 0.44, 0.3);
      const ear = glowMat(0xff6ad5, 2);
      put(m, box(0.06, 0.14, 0.06), ear, -0.1, 0.62, 0.3);
      put(m, box(0.06, 0.14, 0.06), ear, 0.1, 0.62, 0.3);
      put(m, box(0.06, 0.06, 0.2), mat, 0, 0.34, -0.32);
      m.position.set(x, 0, z);
      G.world.add(m);
      return { m, x, z, hx: x, hz: z, st: 'wait', tx: x, tz: z, ph: i };
    });
    return { kind: 'pups', x: s.x, z: s.z, g, list, st: 'idle', foes: [], home: 0, lastHp: 0, nt: 0, introR: 11 };
  },
  move(o, tx, tz, sp, dt) {
    const dx = tx - o.x;
    const dz = tz - o.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.02) return l;
    const st = Math.min(l, sp * dt);
    const nx = o.x + (dx / l) * st;
    const nz = o.z + (dz / l) * st;
    const d = G.dungeon;
    if (isWalkable(d, nx, o.z)) o.x = nx;
    if (isWalkable(d, o.x, nz)) o.z = nz;
    o.m.position.set(o.x, Math.abs(Math.sin(G.t * 12 + o.ph)) * 0.12, o.z);
    o.m.rotation.y = Math.atan2(dx, dz);
    return l;
  },
  update(E, dt) {
    const p = G.player;
    E.foes = E.foes.filter((e) => e.alive);
    const chain = E.list.filter((o) => o.st === 'follow');
    // levou dano: a fila se espalha
    if (E.lastHp && p.hp < E.lastHp - 0.5 && chain.length) {
      for (const o of chain) {
        const pt = freeAround(G.dungeon, o.x, o.z, 2.5, 4.5);
        o.st = 'scatter';
        o.tx = pt ? pt.x : o.x;
        o.tz = pt ? pt.z : o.z;
      }
      say(E, L('OS FILHOTES FUGIRAM!', 'THE PUPS RAN OFF!'), 'hurt', p.x - E.x, p.z - E.z);
      sfx.deny();
    }
    E.lastHp = p.hp;
    let lead = p;
    let n = 0;
    for (const o of E.list) {
      if (o.st === 'home') {
        o.m.position.y = Math.abs(Math.sin(G.t * 6 + o.ph)) * 0.2;
        continue;
      }
      if (o.st === 'follow') {
        const l = Math.hypot(lead.x - o.x, lead.z - o.z);
        if (l > 0.75) pups.move(o, lead.x, lead.z, Math.min(9, (l - 0.75) * 7), dt);
        lead = o;
        n++;
        continue;
      }
      if (o.st === 'scatter') {
        if (pups.move(o, o.tx, o.tz, 5, dt) < 0.1) {
          o.st = 'wait';
          o.hx = o.x;
          o.hz = o.z;
        }
        continue;
      }
      // esperando: passeia perto de onde está
      if (Math.hypot(o.tx - o.x, o.tz - o.z) < 0.1) {
        o.tx = o.hx + rr(-0.8, 0.8);
        o.tz = o.hz + rr(-0.8, 0.8);
      }
      pups.move(o, o.tx, o.tz, 0.7, dt);
      if (p.alive && Math.hypot(p.x - o.x, p.z - o.z) < 0.9) {
        o.st = 'follow';
        sfx.pickup();
        burst(o.x, 0.6, o.z, PU_COL, 10, 3, 0.06, 0.4, { up: 1 });
        if (E.st === 'idle') {
          E.st = 'run';
          banner(L('FILHOTES PERDIDOS!', 'LOST PUPS!'), L(`Leve ${PU_N} filhotes ao cercado sem levar dano`, `Bring ${PU_N} pups to the pen without getting hurt`));
          ambush(E, 2, p.x, p.z, 5, 8, PU_COL);
          E.nt = 20;
        }
      }
    }
    if (E.st !== 'run') return;
    E.nt -= dt;
    if (E.nt <= 0 && n && E.foes.length < 3) {
      E.nt = 18;
      ambush(E, 1, p.x, p.z, 5, 8, PU_COL);
    }
    if (n && Math.hypot(p.x - E.x, p.z - E.z) < 1.5) {
      let k = E.home;
      for (const o of E.list) {
        if (o.st !== 'follow') continue;
        o.st = 'home';
        const a = (k++ / PU_N) * TAU;
        o.x = E.x + Math.cos(a) * 0.7;
        o.z = E.z + Math.sin(a) * 0.7;
        o.m.position.set(o.x, 0, o.z);
        o.m.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      }
      E.home = k;
      sfx.coin();
      ringFx(E.x, E.z, 1.4, PU_COL, 0.4);
      if (E.home >= PU_N) complete(E, 1.5, L('TODOS EM CASA!', 'ALL HOME!'), L(`${PU_N} filhotes salvos`, `${PU_N} pups saved`), E.x, E.z, { extra: true });
    }
  },
  busy: (E) => E.st === 'run',
  hud: (E) => (E.st === 'idle' ? L('ache os filhotes', 'find the pups') : `${E.home}/${PU_N} ${L('em casa', 'home')} · ${E.list.filter((o) => o.st === 'follow').length} ${L('na fila', 'following')}`),
  dim(E) {
    for (const o of E.list) {
      if (E.st === 'done') {
        o.st = 'home';
        o.m.position.set(E.x + Math.cos(o.ph) * 0.7, 0, E.z + Math.sin(o.ph) * 0.7);
      } else o.m.visible = false;
    }
  },
  intro: () => L(`${PU_N} filhotes se perderam pela sala. Encoste neles e eles seguem você em fila; leve-os ao cercado. Se você levar dano, a fila se espalha.`, `${PU_N} pups got lost around the room. Touch them and they follow you in a line; take them to the pen. If you get hurt, the line scatters.`),
});

// ==================================================================
// 84. Dínamo: dê 5 voltas na pista em volta do gerador, no sentido das setas
// ==================================================================
const DY_COL = 0xffe23d;
const DY_LAPS = 5;
const dynamo = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.7);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().metal, 0, 0.9, 0, 0.7, 1.8, 0.7);
    const core = lightMat(DY_COL, 0.5);
    const top = put(g, mats().oct, core, 0, 2.1, 0, 0.45, 0.6, 0.45);
    put(g, mats().ring, lightMat(DY_COL, 0.9), 0, 0.03, 0, 1.4, 1, 1.4);
    put(g, mats().ring, lightMat(DY_COL, 0.9), 0, 0.03, 0, 3.5, 1, 3.5);
    const am = lightMat(DY_COL, 1.4);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      // seta tangente (sentido de a crescente)
      const c = put(g, mats().cone, am, Math.cos(a) * 2.45, 0.06, Math.sin(a) * 2.45, 2, 2, 2);
      c.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
    }
    return { kind: 'dynamo', x: s.x, z: s.z, g, core, top, st: 'idle', prog: 0, wrong: 0, prev: null, foes: [], waves: 0 };
  },
  update(E, dt) {
    E.foes = E.foes.filter((e) => e.alive);
    const [lx, lz] = lpos(E);
    const r = Math.hypot(lx, lz);
    const on = G.player.alive && r > 1.2 && r < 3.8;
    if (!on) {
      E.prev = null;
      return;
    }
    if (E.st === 'idle') {
      E.st = 'run';
      banner(L('DÍNAMO!', 'DYNAMO!'), L(`Dê ${DY_LAPS} voltas no sentido das setas`, `Run ${DY_LAPS} laps the way the arrows point`));
    }
    const a = Math.atan2(lz, lx);
    if (E.prev != null) {
      const da = wrapAng(a - E.prev);
      if (da > 0) {
        const before = Math.floor(E.prog / TAU);
        E.prog += da;
        E.wrong = Math.max(0, E.wrong - da);
        const lap = Math.floor(E.prog / TAU);
        if (lap > before) {
          sfx.upgrade();
          say(E, L(`VOLTA ${lap}/${DY_LAPS}`, `LAP ${lap}/${DY_LAPS}`), 'crit');
          if ((lap === 2 || lap === 4) && E.foes.length < 3) ambush(E, 2, E.x, E.z, 4.5, 7, DY_COL);
        }
      } else {
        E.wrong -= da;
        if (E.wrong > 0.9) {
          E.wrong = 0;
          E.prog = Math.max(0, E.prog - Math.PI);
          eventHurt(0.05, E.x, E.z, 8);
          sfx.zap();
          burst(G.player.x, 1, G.player.z, DY_COL, 16, 4, 0.06, 0.4);
          say(E, L('SENTIDO ERRADO!', 'WRONG WAY!'), 'hurt');
        }
      }
    }
    E.prev = a;
    setLight(E.core, DY_COL, 0.5 + (E.prog / TAU) * 0.6);
    E.top.rotation.y += dt * (1 + E.prog);
    if (E.prog >= DY_LAPS * TAU) complete(E, 1.4, L('GERADOR CARREGADO!', 'GENERATOR CHARGED!'), L(`${DY_LAPS} voltas`, `${DY_LAPS} laps`), E.x, E.z, { extra: true });
  },
  busy: (E) => E.st === 'run' && E.foes.length > 0,
  hud: (E) => (E.st === 'idle' ? L('entre na pista', 'step on the track') : `${Math.floor(E.prog / TAU)}/${DY_LAPS} ${L('voltas', 'laps')} · ${Math.round(((E.prog % TAU) / TAU) * 100)}%`),
  dim(E) {
    setLight(E.core, DY_COL, E.st === 'done' ? 3.5 : 0.3);
  },
  intro: () => L(`corra em volta do gerador, na pista entre os dois anéis, no sentido das setas. ${DY_LAPS} voltas carregam o gerador; correr ao contrário dá choque e tira meia volta.`, `run around the generator, on the track between the two rings, the way the arrows point. ${DY_LAPS} laps charge it; running the wrong way zaps you and takes half a lap.`),
});

// ==================================================================
// 85. Espião na Multidão: um dos robôs dá umas piscadas estranhas. Golpeie (ou encoste) só nele. 3 rodadas
// ==================================================================
const SY_COL = 0x9ad7ff;
const SY_R = 3.8;
const spy = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(SY_COL, 0.7), 0, 0.03, 0, SY_R + 0.2, 1, SY_R + 0.2);
    const n = 6 + (floor >= 15 ? 1 : 0) + (floor >= 30 ? 1 : 0);
    const bots = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const b = bot(g, SY_COL, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.85);
      b.tx = b.x;
      b.tz = b.z;
      b.e = hitTarget(s.x + b.x, s.z + b.z, 0.45, 1.3, L('Robô', 'Robot'));
      b.hits = 0;
      bots.push(b);
    }
    return { kind: 'spy', x: s.x, z: s.z, g, bots, st: 'idle', spy: 0, round: 0, miss: 0, gl: 2, glT: 0, foes: [], cool: 0 };
  },
  shuffleBots(E) {
    E.spy = Math.floor(Math.random() * E.bots.length);
    // nunca nasce em cima do jogador: encostar conta como golpe e daria "robô errado" de graça
    const [lx, lz] = lpos(E);
    for (const b of E.bots) {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * (SY_R - 0.7);
        b.x = b.tx = Math.cos(a) * r;
        b.z = b.tz = Math.sin(a) * r;
        if (Math.hypot(b.x - lx, b.z - lz) > 1.8) break;
      }
      burst(E.x + b.x, 0.8, E.z + b.z, SY_COL, 6, 2, 0.06, 0.3);
    }
    E.gl = rr(1, 2);
  },
  update(E, dt) {
    E.foes = E.foes.filter((e) => e.alive);
    const [lx, lz] = lpos(E);
    if (E.st === 'idle') {
      for (const b of E.bots) b.e.x = E.x + b.x;
      if (!near(E, SY_R)) {
        for (const b of E.bots) hitsOn(b);
        return;
      }
      E.st = 'run';
      banner(L('ESPIÃO NA MULTIDÃO!', 'SPY IN THE CROWD!'), L('Um robô pisca diferente: golpeie só ele', 'One robot glitches now and then: hit only that one'));
      spy.shuffleBots(E);
      for (const b of E.bots) hitsOn(b);
      return;
    }
    E.cool -= dt;
    E.gl -= dt;
    if (E.gl <= 0) {
      E.glT = 0.32;
      E.gl = rr(1.4, 2.8);
    }
    E.glT -= dt;
    E.bots.forEach((b, i) => {
      // passeia e foge um pouco de quem chega perto
      const pd = Math.hypot(lx - b.x, lz - b.z);
      let sp = 0.9;
      if (pd < 1.1) {
        b.tx = clampAbs(b.x + (b.x - lx), SY_R - 0.5);
        b.tz = clampAbs(b.z + (b.z - lz), SY_R - 0.5);
        sp = 1.4;
      } else if (Math.hypot(b.tx - b.x, b.tz - b.z) < 0.15) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * (SY_R - 0.7);
        b.tx = Math.cos(a) * r;
        b.tz = Math.sin(a) * r;
      }
      const dx = b.tx - b.x;
      const dz = b.tz - b.z;
      const l = Math.hypot(dx, dz) || 1;
      b.x += (dx / l) * Math.min(l, sp * dt);
      b.z += (dz / l) * Math.min(l, sp * dt);
      const glitch = i === E.spy && E.glT > 0;
      b.m.position.set(b.x + (glitch ? rr(-0.06, 0.06) : 0), 0, b.z);
      face(b, b.tx, b.tz);
      setLight(b.eye, glitch ? (Math.floor(G.t * 30) % 2 ? 0xff3355 : 0xffffff) : SY_COL, 2.2);
      b.e.x = E.x + b.x;
      b.e.z = E.z + b.z;
    });
    let good = false;
    let bad = false;
    E.bots.forEach((b, i) => {
      if (!hitsOn(b)) return;
      if (i === E.spy) good = true;
      else bad = true;
    });
    if (E.cool > 0 || (!good && !bad)) return;
    E.cool = 0.6;
    const b = E.bots[E.spy];
    if (good) {
      E.round++;
      sfx.coin();
      say(E, L('ESPIÃO PEGO!', 'SPY CAUGHT!'), 'crit', b.x, b.z);
      burst(E.x + b.x, 1, E.z + b.z, 0xff3355, 20, 5, 0.08, 0.6, { up: 1.5 });
      if (E.round >= 3) {
        for (const o of E.bots) dropTarget(o);
        complete(E, 1.4, L('CONTRAESPIONAGEM!', 'COUNTERINTELLIGENCE!'), L('3 espiões', '3 spies'), E.x, E.z);
        return;
      }
      spy.shuffleBots(E);
      return;
    }
    E.miss++;
    sfx.deny();
    say(E, L(`ROBÔ ERRADO! (${E.miss}/3)`, `WRONG ROBOT! (${E.miss}/3)`), 'hurt');
    ambush(E, 2, E.x, E.z, SY_R + 1, SY_R + 4, 0xff3355);
    if (E.miss >= 3) {
      for (const o of E.bots) dropTarget(o);
      failed(E, L('O espião escapou na multidão.', 'The spy slipped away in the crowd.'));
      return;
    }
    spy.shuffleBots(E);
  },
  busy: (E) => E.st === 'run' && E.foes.length > 0,
  hud: (E) => (E.st === 'idle' ? L('entre na roda', 'enter the crowd') : `${E.round}/3 🕵 · ${E.miss}/3 ✖`),
  dim(E) {
    for (const o of E.bots) {
      dropTarget(o);
      if (E.st === 'done') o.m.visible = false;
    }
  },
  reload(E) {
    for (const o of E.bots) {
      o.e.hp = o.e.maxHp;
      o.hits = 0;
    }
  },
  intro: () => L('todos os robôs parecem iguais, mas o espião dá umas piscadas estranhas (olho vermelho e tremida) de vez em quando. Golpeie ou encoste só nele; o errado chama reforços. 3 espiões.', 'all the robots look alike, but the spy glitches now and then (red eye and a jitter). Hit or touch only that one; the wrong robot calls backup. 3 spies.'),
});

// ==================================================================
// 86. Tênis de Luz: seu corpo é a raquete. Faça 3 pontos passando pelo robô
// ==================================================================
const TN_COL = 0x39ff88;
const TN_HX = 2.2;
const TN_HZ = 4.3;
const tennis = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, TN_HX + 0.3, TN_HZ + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, TN_HX, TN_HZ, lightMat(TN_COL, 1));
    put(g, box(TN_HX * 2, 0.5, 0.05), flatMat(0xffffff, 0.3), 0, 0.25, 0);
    put(g, box(TN_HX * 2, 0.04, 0.06), lightMat(0xffffff, 1.2), 0, 0.5, 0);
    const b = bot(g, 0xff4df0, 0, -TN_HZ + 0.4, 0.9);
    b.m.rotation.y = 0;
    put(b.m, box(1.2, 0.1, 0.12), lightMat(0xff4df0, 2), 0, 0.9, 0.4);
    const ball = put(g, sphere(), glowMat(0xffe23d, 2.6), 0, 0.6, 0, 0.18, 0.18, 0.18);
    const score = tag(g, '0 × 0', 0xffffff, TN_HX + 0.2, 1.6, 0, 0.8, 2.6);
    return { kind: 'tennis', x: s.x, z: s.z, g, b, ball, score, st: 'idle', bx: 0, bz: 0, vx: 0, vz: 0, me: 0, rob: 0, pause: 0, err: 0, rally: 0 };
  },
  serve(E) {
    E.bx = 0;
    E.bz = -0.5;
    E.vx = rr(-1.2, 1.2);
    E.vz = 3.2;
    E.pause = 1;
    E.rally = 0;
    E.err = rr(-0.5, 0.5);
  },
  point(E, me) {
    if (me) E.me++;
    else E.rob++;
    setTag(E.score, `${E.me} × ${E.rob}`, 0xffffff);
    say(E, me ? L('PONTO SEU!', 'YOUR POINT!') : L('PONTO DO ROBÔ', 'ROBOT POINT'), me ? 'crit' : 'hurt');
    (me ? sfx.coin : sfx.deny)();
    if (E.me >= 3) complete(E, 1.3, L('MATCH POINT!', 'MATCH POINT!'), `${E.me} × ${E.rob}`, E.x, E.z);
    else if (E.rob >= 3) failed(E, L('O robô venceu a partida de tênis.', 'The robot won the tennis match.'));
    else tennis.serve(E);
  },
  update(E, dt) {
    const p = G.player;
    const [lx, lz] = lpos(E);
    const inCourt = p.alive && Math.abs(lx) < TN_HX && lz > 0 && lz < TN_HZ;
    if (E.st === 'idle') {
      if (!inCourt) return;
      E.st = 'run';
      banner(L('TÊNIS DE LUZ!', 'LIGHT TENNIS!'), L('Seu corpo é a raquete: devolva a bola', 'Your body is the racket: hit the ball back'));
      tennis.serve(E);
      return;
    }
    const b = E.b;
    // robô segue a bola (devagar)
    const rs = Math.min(3.6, 2.1 + G.floor * 0.015 + E.rally * 0.04);
    const want = E.vz < 0 ? clampAbs(E.bx + E.err, TN_HX - 0.4) : 0;
    b.x += clampAbs(want - b.x, rs * dt);
    b.m.position.x = b.x;
    if (E.pause > 0) {
      E.pause -= dt;
      E.ball.position.set(E.bx, 0.6 + Math.abs(Math.sin(G.t * 6)) * 0.3, E.bz);
      return;
    }
    E.bx += E.vx * dt;
    E.bz += E.vz * dt;
    if (Math.abs(E.bx) > TN_HX - 0.15) {
      E.bx = Math.sign(E.bx) * (TN_HX - 0.15);
      E.vx = -E.vx;
    }
    E.ball.position.set(E.bx, 0.6, E.bz);
    if (p.alive && lz < -0.2 && Math.abs(lx) < TN_HX) return tennis.point(E, false);
    if (E.vz > 0 && p.alive && Math.hypot(E.bx - lx, E.bz - lz) < 0.8) {
      E.vz = -Math.min(9, Math.abs(E.vz) * 1.07 + 0.25);
      E.vx = clampAbs(E.vx * 0.4 + (E.bx - lx) * 3.4 + (p.ivx || 0) * 0.3, 5);
      E.rally++;
      E.err = rr(-0.6, 0.6) * (1 + E.rally * 0.1);
      sfx.hit();
      burst(p.x, 0.8, p.z, TN_COL, 8, 3, 0.06, 0.3);
    }
    if (E.vz < 0 && E.bz < -TN_HZ + 0.7 && E.bz > -TN_HZ + 0.2 && Math.abs(E.bx - b.x) < 0.75) {
      E.vz = Math.min(8, Math.abs(E.vz) * 1.03);
      E.vx = clampAbs((E.bx - b.x) * 2.5 + rr(-1.4, 1.4), 4.5);
      sfx.hit();
    }
    if (E.bz < -TN_HZ - 0.2) tennis.point(E, true);
    else if (E.bz > TN_HZ + 0.2) tennis.point(E, false);
  },
  hud: (E) => (E.st === 'idle' ? L('entre na quadra', 'enter the court') : `${E.me} × ${E.rob}`),
  dim(E) {
    E.ball.visible = false;
  },
  intro: () => L('fique na sua metade da quadra: a bola volta quando bate em você e sai torta se bater de lado. Passe 3 bolas pelo robô antes que ele passe 3 por você (atravessar a rede dá ponto para ele).', 'stay on your half of the court: the ball bounces off you, angled if it hits your side. Get 3 balls past the robot before it gets 3 past you (crossing the net gives it the point).'),
});

// ==================================================================
// 87. Cronômetro Cego: um golpe liga, outro para. Pare em 5,00s sem ver o relógio
// ==================================================================
const SW_COL = 0xff4df0;
const stopwatch = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(1.4, 1.1, 0.5), mats().metal, 0, 0.55, -0.4);
    put(g, mats().cyl, mats().metal, 0, 0.35, 0.6, 0.45, 0.7, 0.45);
    put(g, mats().cyl, glowMat(SW_COL, 2.4), 0, 0.75, 0.6, 0.34, 0.1, 0.34);
    put(g, mats().ring, lightMat(SW_COL, 1), 0, 0.03, 0.6, 1.1, 1, 1.1);
    const screen = tag(g, '5.00', 0xffd23d, 0, 1.75, -0.4, 1, 3);
    const e = hitTarget(s.x, s.z + 0.6, 0.55, 1, L('Cronômetro', 'Stopwatch'));
    const tol = floor >= 20 ? 0.25 : 0.35;
    return { kind: 'stopwatch', x: s.x, z: s.z, g, screen, e, hits: 0, st: 'idle', phase: 'ready', t: 0, tries: 3, tol, best: 9 };
  },
  update(E, dt) {
    const n = hitsOf(E);
    if (E.st === 'idle') {
      if (!near(E, 3.5)) return;
      E.st = 'run';
      banner(L('CRONÔMETRO CEGO!', 'BLIND STOPWATCH!'), L('Bata para ligar e bata de novo em 5,00s', 'Hit to start and hit again at 5.00s'));
      return;
    }
    if (E.phase === 'wait') {
      E.t -= dt;
      if (E.t <= 0) {
        E.phase = 'ready';
        setTag(E.screen, '5.00', 0xffd23d);
      }
      return;
    }
    if (E.phase === 'ready') {
      if (!n) return;
      E.phase = 'count';
      E.t = 0;
      sfx.click();
      return;
    }
    E.t += dt;
    setTag(E.screen, E.t < 1.2 ? E.t.toFixed(1) : '?.??', E.t < 1.2 ? 0xffffff : 0x888899);
    if ((!n || E.t < 0.6) && E.t < 9) return;
    const err = Math.abs(E.t - 5);
    E.best = Math.min(E.best, err);
    const ok = err <= E.tol;
    setTag(E.screen, E.t.toFixed(2), ok ? 0x39ff88 : 0xff3355);
    if (ok) {
      sfx.legendary();
      dropTarget(E);
      complete(E, 1 + (1 - err / E.tol) * 0.7, L('TEMPO PERFEITO!', 'PERFECT TIMING!'), `${E.t.toFixed(2)}s`, E.x, E.z);
      return;
    }
    E.tries--;
    sfx.deny();
    say(E, `${E.t > 5 ? '+' : '−'}${err.toFixed(2)}s`, 'hurt');
    if (E.tries <= 0) {
      dropTarget(E);
      failed(E, L(`Passou longe dos 5,00s (melhor: ±${E.best.toFixed(2)}s).`, `Missed 5.00s (best: ±${E.best.toFixed(2)}s).`));
      return;
    }
    E.phase = 'wait';
    E.t = 1.6;
  },
  hud: (E) => (E.st === 'idle' ? L('vá ao relógio', 'reach the clock') : `±${L(E.tol.toFixed(2).replace('.', ','), E.tol.toFixed(2))}s · ${E.tries} ${L('tent.', 'tries')}`),
  dim(E) {
    dropTarget(E);
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('golpeie (ou encoste em) o botão para ligar o cronômetro. O visor some depois de 1 segundo: conte de cabeça e golpeie de novo em 5,00s. 3 tentativas.', 'hit (or touch) the button to start the stopwatch. The display goes dark after 1 second: count in your head and hit it again at 5.00s. 3 tries.'),
});

// ==================================================================
// 88. Cozinha Neon: decore a receita, leve os ingredientes certos das caixas para a panela
// ==================================================================
const CK_ING = ['🍄', '🌶️', '🧅', '🥕', '🐟', '🧀'];
const CK_COL = 0xff8a3d;
const cook = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().dark, 0, 0.4, 0, 0.75, 0.8, 0.75);
    const soup = lightMat(CK_COL, 1.4);
    put(g, mats().disc, soup, 0, 0.81, 0, 0.62, 1, 0.62);
    const crates = CK_ING.map((ic, i) => {
      const a = (i / 6) * TAU + Math.PI / 6;
      const x = Math.cos(a) * 2.6;
      const z = Math.sin(a) * 2.6;
      put(g, box(0.7, 0.55, 0.7), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }), x, 0.28, z);
      put(g, mats().ring, lightMat(CK_COL, 0.8), x, 0.03, z, 0.6, 1, 0.6);
      tag(g, ic, 0xffffff, x, 1, z, 0.8);
      return { x, z, ic };
    });
    const board = tag(g, '🍲', 0xffffff, 0, 2.1, 0, 0.9, 5);
    const hold = tag(g, '', 0xffffff, 0, 2.2, 0, 0.7);
    hold.visible = false;
    const sizes = floor >= 15 ? [3, 4, 4] : [3, 3, 4];
    return { kind: 'cook', x: s.x, z: s.z, g, soup, crates, board, hold, sizes, st: 'idle', round: 0, rec: [], got: [], carry: -1, phase: 'show', t: 0, miss: 0 };
  },
  recipe(E) {
    E.rec = shuffle([0, 1, 2, 3, 4, 5]).slice(0, E.sizes[E.round]);
    E.got = [];
    cook.show(E, 3 + E.rec.length * 0.4);
  },
  show(E, t) {
    E.phase = 'show';
    E.t = t;
    setTag(E.board, E.rec.map((i) => CK_ING[i]).join(' '), 0xffffff);
  },
  hide(E) {
    E.phase = 'cook';
    setTag(E.board, [[E.got.map((i) => CK_ING[i]).join(' ') + ' ', 0xffffff], [Array(E.rec.length - E.got.length).fill('?').join(' '), 0xffd23d]], 0xffffff);
  },
  update(E, dt) {
    const [lx, lz] = lpos(E);
    if (E.st === 'idle') {
      if (!near(E, 3.4) || waitFoes(E)) return;
      E.st = 'run';
      banner(L('COZINHA NEON!', 'NEON KITCHEN!'), L('Decore a receita e leve os ingredientes à panela', 'Memorize the recipe and bring the ingredients to the pot'));
      cook.recipe(E);
      return;
    }
    if (E.phase === 'show') {
      E.t -= dt;
      if (E.t <= 0) cook.hide(E);
      return;
    }
    E.hold.visible = E.carry >= 0;
    if (E.carry >= 0) E.hold.position.set(lx, 2.3, lz);
    for (let i = 0; i < 6; i++) {
      const c = E.crates[i];
      if (E.carry === i || Math.hypot(lx - c.x, lz - c.z) > 0.85) continue;
      E.carry = i;
      setTag(E.hold, c.ic, 0xffffff);
      sfx.pickup();
    }
    if (E.carry < 0 || Math.hypot(lx, lz) > 1.15) return;
    const i = E.carry;
    E.carry = -1;
    if (E.rec.includes(i) && !E.got.includes(i)) {
      E.got.push(i);
      sfx.coin();
      burst(E.x, 1, E.z, CK_COL, 12, 3, 0.06, 0.4, { up: 1.5 });
      if (E.got.length >= E.rec.length) {
        E.round++;
        say(E, L('DELÍCIA!', 'DELICIOUS!'), 'crit');
        if (E.round >= E.sizes.length) {
          E.hold.visible = false;
          complete(E, 1.3, L('CHEF NEON!', 'NEON CHEF!'), L(`${E.sizes.length} receitas`, `${E.sizes.length} recipes`), E.x, E.z);
          return;
        }
        cook.recipe(E);
        return;
      }
      cook.hide(E);
      return;
    }
    E.miss++;
    sfx.deny();
    burst(E.x, 1, E.z, 0x555555, 16, 3, 0.08, 0.6, { up: 2 });
    say(E, L(`ECA! INGREDIENTE ERRADO (${E.miss}/3)`, `YUCK! WRONG INGREDIENT (${E.miss}/3)`), 'hurt');
    if (E.miss >= 3) {
      E.hold.visible = false;
      failed(E, L('A sopa desandou.', 'The soup is ruined.'));
      return;
    }
    cook.show(E, 2);
  },
  hud: (E) => (E.st === 'idle' ? L('chegue na panela', 'reach the pot') : `${L('receita', 'recipe')} ${Math.min(E.round + 1, E.sizes.length)}/${E.sizes.length} · ${E.got.length}/${E.rec.length} · ${E.miss}/3 ✖`),
  dim(E) {
    E.hold.visible = false;
    setTag(E.board, E.st === 'done' ? '🍲' : '💨', 0xffffff);
  },
  intro: () => L('a receita aparece em cima da panela por alguns segundos e some. Encoste numa caixa para pegar o ingrediente e leve à panela. Ingrediente errado mostra a receita de novo; 3 erros e acabou.', 'the recipe shows above the pot for a few seconds, then hides. Touch a crate to pick up that ingredient and carry it to the pot. A wrong one shows the recipe again; 3 mistakes and it is over.'),
});

// ==================================================================
// 89. Batata Quente: passe a bomba encostando nos robôs antes do pavio acabar. 8 passes
// ==================================================================
const PO_COL = 0xff5a2d;
const PO_R = 3.6;
const PO_NEED = 8;
const potato = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(PO_COL, 0.8), 0, 0.03, 0, PO_R, 1, PO_R);
    const bots = [0, 1, 2, 3].map((k) => {
      const a = (k / 4) * TAU + Math.PI / 4;
      const b = bot(g, 0x39ff88, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.85);
      b.tx = b.x;
      b.tz = b.z;
      return b;
    });
    const bomb = new THREE.Group();
    put(bomb, sphere(), new THREE.MeshLambertMaterial({ color: 0x222228 }), 0, 0, 0, 0.26, 0.26, 0.26);
    const spark = lightMat(0xffd23d, 3);
    put(bomb, mats().oct, spark, 0, 0.34, 0, 0.08, 0.08, 0.08);
    bomb.visible = false;
    g.add(bomb);
    return { kind: 'potato', x: s.x, z: s.z, g, bots, bomb, spark, st: 'idle', who: -1, fuse: 0, hold: 0, last: -1, passes: 0, booms: 0, fly: null };
  },
  update(E, dt) {
    const [lx, lz] = lpos(E);
    if (E.st === 'idle') {
      if (!near(E, PO_R)) return;
      E.st = 'run';
      E.who = -1;
      E.fuse = 5.5;
      E.bomb.visible = true;
      banner(L('BATATA QUENTE!', 'HOT POTATO!'), L('Encoste num robô verde para passar a bomba', 'Touch a green robot to pass the bomb'));
      return;
    }
    E.bots.forEach((b, i) => {
      // os robôs se afastam de você quando estão sem a bomba
      const pd = Math.hypot(lx - b.x, lz - b.z);
      if (E.who !== i && pd < 2.2) {
        b.tx = clampAbs(b.x + (b.x - lx) * 0.6, PO_R - 0.6);
        b.tz = clampAbs(b.z + (b.z - lz) * 0.6, PO_R - 0.6);
      }
      const dx = b.tx - b.x;
      const dz = b.tz - b.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.05) {
        const sp = Math.min(1.6, 0.9 + G.floor * 0.01);
        b.x += (dx / l) * Math.min(l, sp * dt);
        b.z += (dz / l) * Math.min(l, sp * dt);
      }
      b.m.position.set(b.x, 0, b.z);
      face(b, lx, lz);
      const ready = i !== E.last;
      setLight(b.eye, ready ? 0x39ff88 : 0x555566, ready ? 2.2 : 0.6);
      setLight(b.ring, ready ? 0x39ff88 : 0x555566, ready ? 1 : 0.4);
    });
    if (E.fly) {
      const f = E.fly;
      f.t += dt / 0.55;
      const k = Math.min(1, f.t);
      E.bomb.position.set(f.x + (lx - f.x) * k, 1.6 + Math.sin(k * Math.PI) * 1.4, f.z + (lz - f.z) * k);
      if (k >= 1) {
        E.fly = null;
        E.who = -1;
        E.fuse = Math.max(2.4, 5.5 - E.passes * 0.35 - G.floor * 0.01);
      }
      return;
    }
    if (E.who >= 0) {
      const b = E.bots[E.who];
      E.bomb.position.set(b.x, 1.9, b.z);
      E.hold -= dt;
      if (E.hold <= 0) E.fly = { x: b.x, z: b.z, t: 0 };
      return;
    }
    // com você
    E.fuse -= dt;
    E.bomb.position.set(lx, 2.1, lz);
    E.spark.color.setHex(E.fuse < 1.5 && Math.floor(G.t * 10) % 2 ? 0xff3355 : 0xffd23d);
    for (let i = 0; i < E.bots.length; i++) {
      const b = E.bots[i];
      if (i === E.last || Math.hypot(lx - b.x, lz - b.z) > 1) continue;
      E.who = i;
      E.last = i;
      E.hold = rr(0.9, 1.6);
      E.passes++;
      sfx.click();
      say(E, `${E.passes}/${PO_NEED}`, 'up', b.x, b.z);
      b.tx = clampAbs(-b.x, PO_R - 0.8);
      b.tz = clampAbs(-b.z, PO_R - 0.8);
      if (E.passes >= PO_NEED) {
        E.bomb.visible = false;
        complete(E, 1.3, L('NINGUÉM EXPLODIU!', 'NOBODY BLEW UP!'), L(`${PO_NEED} passes`, `${PO_NEED} passes`), E.x, E.z);
      }
      return;
    }
    if (E.fuse > 0) return;
    E.booms++;
    sfx.explode();
    ringFx(G.player.x, G.player.z, 2, PO_COL, 0.4);
    burst(G.player.x, 1.5, G.player.z, PO_COL, 30, 6, 0.09, 0.6, { up: 1.5 });
    eventHurt(0.12);
    if (E.booms >= 2) {
      E.bomb.visible = false;
      failed(E, L('A bomba estourou na sua mão duas vezes.', 'The bomb went off in your hands twice.'));
      return;
    }
    say(E, L('BUM! (1/2)', 'BOOM! (1/2)'), 'hurt');
    E.fuse = 5.5;
  },
  hud: (E) => (E.st === 'idle' ? L('entre na roda', 'join the circle') : `${E.passes}/${PO_NEED}${E.who < 0 && !E.fly ? ` · 💣 ${Math.max(0, E.fuse).toFixed(1)}s` : ''}`),
  dim(E) {
    E.bomb.visible = false;
  },
  intro: () => L(`você começa com a bomba. Encoste num robô verde para passá-la (o último que recebeu fica cinza e não pega); ele devolve logo depois. Faça ${PO_NEED} passes antes do pavio acabar na sua mão.`, `you start with the bomb. Touch a green robot to pass it (the last one to get it turns grey and will not take it); it throws it back soon after. Make ${PO_NEED} passes before the fuse runs out in your hands.`),
});

// ==================================================================
// 90. Gelo Fino: o gelo quebra depois que você sai dele. Pise em todos os ladrilhos e termine na saída
// ==================================================================
const TI_W = 6;
const TI_H = 5;
const TI_C = 1.1;
const thinice = mk({
  setup(d, floor, rooms) {
    const hx = (TI_W * TI_C) / 2;
    const hz = (TI_H * TI_C) / 2;
    const s = findSpot(d, rooms, hx + 0.2, hz + 0.2);
    if (!s) return null;
    // caminho: passeio aleatório sem repetir casas (com volta atrás), do tamanho pedido
    const want = Math.min(24, 14 + Math.floor(floor / 5));
    let best = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let budget = 5000;
    const walk = (path, seen) => {
      if (path.length > best.length) best = path.slice();
      if (best.length >= want || --budget <= 0) return;
      const [x, z] = path[path.length - 1];
      for (const [dx, dz] of shuffle(dirs.slice())) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= TI_W || nz >= TI_H || seen.has(nz * TI_W + nx)) continue;
        seen.add(nz * TI_W + nx);
        path.push([nx, nz]);
        walk(path, seen);
        path.pop();
        seen.delete(nz * TI_W + nx);
        if (best.length >= want || budget <= 0) return;
      }
    };
    const sx = ri(0, TI_W - 1);
    const sz = ri(0, TI_H - 1);
    walk([[sx, sz]], new Set([sz * TI_W + sx]));
    const path = best.map(([x, z]) => z * TI_W + x);
    const g = groupAt(s.x, s.z);
    const geo = new THREE.PlaneGeometry(TI_C - 0.07, TI_C - 0.07).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), TI_W * TI_H);
    inst.position.y = 0.035;
    g.add(inst);
    const m = new THREE.Matrix4();
    for (let i = 0; i < TI_W * TI_H; i++) {
      m.setPosition(-hx + ((i % TI_W) + 0.5) * TI_C, 0, -hz + (Math.floor(i / TI_W) + 0.5) * TI_C);
      inst.setMatrixAt(i, m);
    }
    frame(g, hx, hz, lightMat(0x9ad7ff, 0.6));
    const cells = new Array(TI_W * TI_H).fill(0);
    for (const i of path) cells[i] = 1;
    const E = { kind: 'thinice', x: s.x, z: s.z, g, inst, hx, hz, path, cells, start: path[0], exit: path[path.length - 1], st: 'idle', cur: -1, falls: 0 };
    thinice.reset(E);
    return E;
  },
  color(E, i) {
    const v = E.cells[i];
    let c = 0x07090f;
    if (v === 1) c = i === E.start ? 0x39ff88 : i === E.exit ? 0xffd23d : 0x9ad7ff;
    else if (v === 2) c = 0xffffff;
    else if (v === 3) c = 0x14202e;
    E.inst.setColorAt(i, tmpC.setHex(c).multiplyScalar(v === 2 ? 1.5 : 1));
  },
  reset(E) {
    for (const i of E.path) E.cells[i] = 1;
    for (let i = 0; i < E.cells.length; i++) thinice.color(E, i);
    E.inst.instanceColor.needsUpdate = true;
    E.cur = -1;
  },
  cellAt(E) {
    const [lx, lz] = lpos(E);
    const i = Math.floor((lx + E.hx) / TI_C);
    const j = Math.floor((lz + E.hz) / TI_C);
    return i < 0 || j < 0 || i >= TI_W || j >= TI_H ? -1 : j * TI_W + i;
  },
  fall(E, msg) {
    E.falls++;
    sfx.deny();
    eventHurt(0.04);
    burst(G.player.x, 0.3, G.player.z, 0x9ad7ff, 18, 4, 0.07, 0.5, { up: 1 });
    say(E, msg, 'hurt');
    thinice.reset(E);
    if (E.falls >= 6) failed(E, L('Caiu no gelo vezes demais.', 'Fell through the ice too many times.'));
  },
  update(E, dt) {
    if (!G.player.alive) return;
    const c = thinice.cellAt(E);
    if (E.cur < 0) {
      if (c !== E.start) return;
      E.cur = c;
      E.cells[c] = 2;
      thinice.color(E, c);
      E.inst.instanceColor.needsUpdate = true;
      if (E.st === 'idle') {
        E.st = 'run';
        banner(L('GELO FINO!', 'THIN ICE!'), L('Passe por todos os ladrilhos e termine no dourado', 'Cross every tile and finish on the gold one'));
      }
      return;
    }
    if (c === E.cur) return;
    if (c < 0) return thinice.fall(E, L('SAIU DO GELO: DE NOVO', 'LEFT THE ICE: AGAIN'));
    if (E.cells[c] !== 1) return thinice.fall(E, L('CRACK! CAIU NA ÁGUA', 'CRACK! INTO THE WATER'));
    // o ladrilho de trás quebra
    E.cells[E.cur] = 3;
    thinice.color(E, E.cur);
    sfx.click();
    if (c === E.exit) {
      const left = E.path.filter((i) => E.cells[i] === 1).length - 1;
      if (left > 0) {
        E.inst.instanceColor.needsUpdate = true;
        return thinice.fall(E, L(`FALTARAM ${left} LADRILHOS`, `${left} TILES LEFT`));
      }
      E.cells[c] = 2;
      thinice.color(E, c);
      E.inst.instanceColor.needsUpdate = true;
      complete(E, 1.4, L('PATINADOR PERFEITO!', 'PERFECT SKATER!'), L(`${E.path.length} ladrilhos`, `${E.path.length} tiles`), E.x, E.z);
      return;
    }
    E.cur = c;
    E.cells[c] = 2;
    thinice.color(E, c);
    E.inst.instanceColor.needsUpdate = true;
  },
  hud: (E) => (E.st === 'idle' ? L('pise no ladrilho verde', 'step on the green tile') : `${E.path.filter((i) => E.cells[i] === 3).length}/${E.path.length - 1} · ${E.falls}/6 💧`),
  dim(E) {
    for (const i of E.path) E.cells[i] = E.st === 'done' ? 2 : 3;
    for (let i = 0; i < E.cells.length; i++) thinice.color(E, i);
    E.inst.instanceColor.needsUpdate = true;
  },
  intro: () => L('comece no ladrilho verde. Cada ladrilho de gelo quebra quando você sai dele: passe por todos e termine no dourado. Os escuros são água; sair do tabuleiro também recomeça.', 'start on the green tile. Each ice tile breaks once you step off it: cross them all and finish on the gold one. The dark ones are water; leaving the board starts over too.'),
});

// ------------------------------------------------------------------
// Registro (events.js lê estas tabelas)
// ------------------------------------------------------------------
export const NEW3_KIND = { chairs, treadmill, rps, stacker, sumo, mirrorwalk, buzz, bowling, acid, lava, hunter, fireflies, seesaw, math, frogger, wheel, colors, hilo, simon, tictac, wind, spell, pups, dynamo, spy, tennis, stopwatch, cook, potato, thinice };
export const NEW3_IDS = Object.keys(NEW3_KIND);
export const NEW3_INFO = {
  chairs: { icon: '🪑', css: '#ff4df0', name: L('Dança das Cadeiras', 'Musical Chairs'), short: L('Cadeiras', 'Chairs') },
  treadmill: { icon: '🏃', css: '#39d0ff', name: L('Esteira Neon', 'Neon Treadmill'), short: L('Esteira', 'Treadmill') },
  rps: { icon: '✊', css: '#ffd23d', name: L('Jokenpô', 'Rock Paper Scissors'), short: L('Jokenpô', 'RPS') },
  stacker: { icon: '🧱', css: '#ffb347', name: L('Torre de Blocos', 'Block Tower'), short: L('Torre', 'Stack') },
  sumo: { icon: '🤼', css: '#ff9a3d', name: L('Sumô', 'Sumo'), short: L('Sumô', 'Sumo') },
  mirrorwalk: { icon: '🪞', css: '#b8c4ff', name: L('Passos Espelhados', 'Mirrored Steps'), short: L('Espelho', 'Mirror') },
  buzz: { icon: '⚡', css: '#ffe23d', name: L('Fio Elétrico', 'Buzz Wire'), short: L('Fio', 'Wire') },
  bowling: { icon: '🎳', css: '#5affd2', name: L('Boliche Neon', 'Neon Bowling'), short: L('Boliche', 'Bowling') },
  acid: { icon: '☂️', css: '#9dff3a', name: L('Chuva Ácida', 'Acid Rain'), short: L('Chuva', 'Rain') },
  lava: { icon: '🌋', css: '#ff5a2d', name: L('O Chão é Lava', 'The Floor is Lava'), short: L('Lava', 'Lava') },
  hunter: { icon: '🛸', css: '#ff3355', name: L('Fuja do Caçador', 'Run from the Hunter'), short: L('Caçador', 'Hunter') },
  fireflies: { icon: '✨', css: '#d4ff3d', name: L('Vaga-lumes', 'Fireflies'), short: L('Vaga-lumes', 'Fireflies') },
  seesaw: { icon: '⚖️', css: '#ff8a3d', name: L('Gangorra', 'Seesaw'), short: L('Gangorra', 'Seesaw') },
  math: { icon: '➕', css: '#3dc7ff', name: L('Matemática Rápida', 'Quick Math'), short: L('Contas', 'Math') },
  frogger: { icon: '🚗', css: '#39ff88', name: L('Tráfego Neon', 'Neon Traffic'), short: L('Tráfego', 'Traffic') },
  wheel: { icon: '🎡', css: '#ff4df0', name: L('Roda da Fortuna', 'Wheel of Fortune'), short: L('Roda', 'Wheel') },
  colors: { icon: '🎨', css: '#ff2a2a', name: L('Mistura de Cores', 'Color Mixer'), short: L('Cores', 'Colors') },
  hilo: { icon: '🔢', css: '#c77bff', name: L('Maior ou Menor', 'Higher or Lower'), short: L('Maior/Menor', 'Hi/Lo') },
  simon: { icon: '🗣️', css: '#ffffff', name: L('O Mestre Mandou', 'Simon Says'), short: L('Mestre', 'Simon') },
  tictac: { icon: '⭕', css: '#9ad7ff', name: L('Jogo da Velha', 'Tic-Tac-Toe'), short: L('Velha', 'Tic-Tac') },
  wind: { icon: '🌬️', css: '#9ad7ff', name: L('Ventania', 'Gale'), short: L('Vento', 'Wind') },
  spell: { icon: '🔤', css: '#5affd2', name: L('Soletrando', 'Spelling Bee'), short: L('Letras', 'Spell') },
  pups: { icon: '🐶', css: '#ffb36b', name: L('Filhotes Perdidos', 'Lost Pups'), short: L('Filhotes', 'Pups') },
  dynamo: { icon: '🔋', css: '#ffe23d', name: L('Dínamo', 'Dynamo'), short: L('Dínamo', 'Dynamo') },
  spy: { icon: '🕵️', css: '#9ad7ff', name: L('Espião na Multidão', 'Spy in the Crowd'), short: L('Espião', 'Spy') },
  tennis: { icon: '🎾', css: '#39ff88', name: L('Tênis de Luz', 'Light Tennis'), short: L('Tênis', 'Tennis') },
  stopwatch: { icon: '⏱️', css: '#ff4df0', name: L('Cronômetro Cego', 'Blind Stopwatch'), short: L('Cronômetro', 'Stopwatch') },
  cook: { icon: '🍲', css: '#ff8a3d', name: L('Cozinha Neon', 'Neon Kitchen'), short: L('Cozinha', 'Kitchen') },
  potato: { icon: '💣', css: '#ff5a2d', name: L('Batata Quente', 'Hot Potato'), short: L('Batata', 'Potato') },
  thinice: { icon: '🧊', css: '#9ad7ff', name: L('Gelo Fino', 'Thin Ice'), short: L('Gelo', 'Ice') },
};
