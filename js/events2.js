// Eventos novos (Fase F do plano 2): mais 30 quebra-cabeças e desafios de andar, em 3 levas de 10.
// Mesmo contrato dos eventos de events.js (setup/update/hud/save/load/intro/busy), registrados lá em
// MAIN_EVENTS, EVENT_INFO, KIND e TIMED. Só usam andar, encostar e atacar (teclado, controle e toque).
// Atenção: este módulo importa events.js (circular): nada daqui roda no topo do módulo, só dentro das funções.
import * as THREE from 'three';
import { G } from './state.js';
import { L } from './i18n.js';
import { ri, shuffle } from './utils.js';
import { glowMat, box } from './models.js';
import { burst, ringFx, floatText } from './fx.js';
import { sfx } from './audio.js';
import { toast, banner } from './ui.js';
import { mats, put, groupAt, lightMat, setLight, flatMat, near, findSpot, complete, failed, eventHurt, hitTarget, hitsOf, dropTarget, ambush } from './events.js';

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
// número em cima de um objeto (peso, dica)
function label(parent, text, color, x, y, z, s = 0.9) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = '#000';
  g.strokeText(text, 32, 35);
  g.fillStyle = hex(color);
  g.fillText(text, 32, 35);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(s, s, 1);
  sp.position.set(x, y, z);
  sp.renderOrder = 6;
  parent.add(sp);
  return sp;
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
// empurra o jogador para fora de um retângulo parado (cx, cz, meio-lado hx, hz); devolve se tocou
function pushOut(p, cx, cz, hx, hz) {
  const ox = p.x - cx;
  const oz = p.z - cz;
  const px = hx + p.r - Math.abs(ox);
  const pz = hz + p.r - Math.abs(oz);
  if (px <= 0 || pz <= 0) return false;
  if (px < pz) p.x += Math.sign(ox || 1) * px;
  else p.z += Math.sign(oz || 1) * pz;
  return true;
}

// ==================================================================
// 31. Caixas de Energia: empurre 3 cubos para as 3 placas (a placa do chão volta tudo ao começo)
// ==================================================================
const SK_COL = 0xffb347;
const SK_X = 2.7;
const SK_Z = 1.7;
const sokoban = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.5, 2.5);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, 3.3, 2.3, lightMat(SK_COL, 0.9));
    const plates = shuffle([[-2.5, -1.5], [2.5, -1.5], [0, -1.6], [-2.6, 0.3], [2.6, 0.3]]).slice(0, 3).map(([x, z]) => {
      const ring = lightMat(0x39ff88, 0.5);
      put(g, mats().ring, ring, x, 0.03, z, 0.62, 1, 0.62);
      return { x, z, ring, on: false };
    });
    const starts = [[-1.6, 0.2], [0.1, -0.5], [1.7, 0.3]];
    const cubes = starts.map(([x, z]) => {
      const m = new THREE.Group();
      put(m, box(0.86, 0.86, 0.86), mats().metal, 0, 0.43, 0);
      put(m, box(0.9, 0.08, 0.9), lightMat(SK_COL, 1.3), 0, 0.88, 0);
      put(m, box(0.9, 0.08, 0.9), mats().dark, 0, 0.02, 0);
      m.position.set(x, 0, z);
      g.add(m);
      return { x, z, sx: x, sz: z, m };
    });
    const resetMat = lightMat(0xff4466, 0.9);
    put(g, mats().ring, resetMat, 0, 0.03, 1.95, 0.55, 1, 0.55);
    put(g, mats().disc, flatMat(0xff4466, 0.12), 0, 0.025, 1.95, 0.5, 1, 0.5);
    return { kind: 'sokoban', x: s.x, z: s.z, g, plates, cubes, resetMat, st: 'idle', cool: 0 };
  },
  update(E, dt) {
    const p = G.player;
    E.cool -= dt;
    if (near(E, 9) && E.st === 'idle') E.st = 'run';
    if (!near(E, 6)) return;
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    // o botão vermelho devolve os cubos ao começo
    if (E.cool <= 0 && Math.hypot(lx, lz - 1.95) < 0.6) {
      E.cool = 1.6;
      for (const c of E.cubes) {
        c.x = c.sx;
        c.z = c.sz;
      }
      sfx.deny();
      floatText(E.x, 1.6, E.z + 1.95, L('de novo', 'reset'), 'up');
    }
    for (const c of E.cubes) {
      const dx = c.x - lx;
      const dz = c.z - lz;
      const reach = 0.43 + p.r;
      if (Math.abs(dx) < reach && Math.abs(dz) < reach) {
        const ox = c.x;
        const oz = c.z;
        if (Math.abs(dx) >= Math.abs(dz)) c.x = lx + Math.sign(dx || 1) * reach;
        else c.z = lz + Math.sign(dz || 1) * reach;
        c.x = Math.max(-SK_X, Math.min(SK_X, c.x));
        c.z = Math.max(-SK_Z, Math.min(SK_Z, c.z));
        // não passa por outro cubo: volta e segura o jogador
        if (E.cubes.some((o) => o !== c && Math.abs(o.x - c.x) < 0.88 && Math.abs(o.z - c.z) < 0.88)) {
          c.x = ox;
          c.z = oz;
        }
        pushOut(p, E.x + c.x, E.z + c.z, 0.43, 0.43);
      }
      c.m.position.set(c.x, 0, c.z);
    }
    let n = 0;
    for (const pl of E.plates) {
      const on = E.cubes.some((c) => Math.hypot(c.x - pl.x, c.z - pl.z) < 0.45);
      if (on !== pl.on) {
        pl.on = on;
        setLight(pl.ring, 0x39ff88, on ? 3 : 0.5);
        if (on) {
          sfx.click();
          burst(E.x + pl.x, 0.4, E.z + pl.z, 0x39ff88, 8, 2, 0.06, 0.4, { up: 1.2 });
        }
      }
      if (on) n++;
    }
    if (n === 3) complete(E, 1.4, L('ENERGIA LIGADA!', 'POWER ON!'), L('Os 3 cubos nas placas', 'All 3 cubes on the plates'), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('empurre os cubos', 'push the cubes') : `${E.plates.filter((p) => p.on).length}/3 ${L('placas', 'plates')}`),
  dim(E) {
    for (const pl of E.plates) setLight(pl.ring, 0x39ff88, 2);
  },
  intro: () => L('empurre os 3 cubos até as 3 placas verdes andando contra eles. Não dá para puxar: se emperrar, pise no círculo vermelho para recomeçar.', 'push the 3 cubes onto the 3 green plates by walking into them. No pulling: if stuck, step on the red circle to start over.'),
});

// ==================================================================
// 32. Encanamento: golpeie os canos para girá-los até a água ligar a caixa ao ralo
// ==================================================================
const PIPE_PATH = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]];
const PDX = [0, 1, 0, -1];
const PDZ = [-1, 0, 1, 0];
const rotM = (m, r) => {
  for (let i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};
const PIPE_ON = 0x39d0ff;
const pipes = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.8, 2.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const S = 1.9;
    const dirTo = (a, b) => {
      for (let k = 0; k < 4; k++) if (PDX[k] === b[0] - a[0] && PDZ[k] === b[1] - a[1]) return k;
      return 3;
    };
    const last = PIPE_PATH.length - 1;
    let list = [];
    for (let tries = 0; tries < 20; tries++) {
      list = PIPE_PATH.map((c, i) => {
        const prev = i ? dirTo(c, PIPE_PATH[i - 1]) : 3;
        const next = i < last ? dirTo(c, PIPE_PATH[i + 1]) : 3;
        const req = (1 << prev) | (1 << next);
        return { req, mask: rotM(req, ri(0, 3)) };
      });
      if (list.filter((q) => q.mask !== q.req).length >= 3) break;
    }
    const base = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
    list.forEach((q, i) => {
      const [cx, cy] = PIPE_PATH[i];
      q.x = (cx - 1) * S;
      q.z = (cy - 0.5) * S;
      q.g = new THREE.Group();
      q.g.position.set(q.x, 0, q.z);
      g.add(q.g);
      put(q.g, box(1.5, 0.05, 1.5), base, 0, 0.03, 0);
      q.mat = lightMat(0x6a7a99, 0.6);
      put(q.g, box(0.36, 0.3, 0.36), q.mat, 0, 0.25, 0);
      q.arms = [0, 1, 2, 3].map((k) => (k % 2 ? put(q.g, box(0.7, 0.22, 0.22), q.mat, PDX[k] * 0.6, 0.25, 0) : put(q.g, box(0.22, 0.22, 0.7), q.mat, 0, 0.25, PDZ[k] * 0.6)));
      q.e = hitTarget(s.x + q.x, s.z + q.z, 0.7, 1, L('Cano', 'Pipe'));
      q.hits = 0;
    });
    // caixa d'água (entrada) e ralo (saída), os dois do lado oeste
    const tank = glowMat(PIPE_ON, 1.6);
    put(g, box(0.9, 1.1, 0.9), mats().metal, -3.35, 0.55, list[0].z);
    put(g, box(0.5, 0.12, 0.5), tank, -3.35, 1.16, list[0].z);
    put(g, box(0.9, 0.4, 0.9), mats().metal, -3.35, 0.2, list[last].z);
    put(g, box(0.5, 0.1, 0.5), tank, -3.35, 0.44, list[last].z);
    const E = { kind: 'pipes', x: s.x, z: s.z, g, list, st: 'run', win: 0 };
    pipes.paint(E);
    return E;
  },
  paint(E) {
    let ok = 0;
    for (const q of E.list) {
      const good = q.mask === q.req;
      if (good) ok++;
      setLight(q.mat, good ? PIPE_ON : 0x6a7a99, good ? 1.8 : 0.6);
      q.arms.forEach((a, k) => (a.visible = !!(q.mask & (1 << k))));
    }
    return ok;
  },
  update(E, dt) {
    if (!near(E, 14)) return;
    let any = false;
    for (const q of E.list) {
      const k = hitsOf(q);
      for (let i = 0; i < k; i++) q.mask = rotM(q.mask, 1);
      if (k) {
        any = true;
        sfx.click();
        burst(E.x + q.x, 0.5, E.z + q.z, PIPE_ON, 6, 2, 0.05, 0.3, { up: 1 });
      }
    }
    if (any) {
      const ok = pipes.paint(E);
      if (ok === E.list.length && !E.win) E.win = 0.7;
    }
    if (E.win > 0) {
      E.win -= dt;
      if (Math.random() < dt * 30) burst(E.x - 3.3, 0.4, E.list[E.list.length - 1].z + E.z, PIPE_ON, 1, 1, 0.08, 0.5, { up: 1 });
      if (E.win <= 0) {
        for (const q of E.list) dropTarget(q);
        complete(E, 1.4, L('A ÁGUA CORRE!', 'WATER FLOWS!'), L('Caixa ligada ao ralo', 'Tank joined to the drain'), E.x, E.z);
      }
    }
  },
  hud: (E) => `${E.list.filter((q) => q.mask === q.req).length}/${E.list.length} ${L('canos', 'pipes')}`,
  dim(E) {
    for (const q of E.list) {
      q.mask = q.req;
      dropTarget(q);
    }
    pipes.paint(E);
  },
  reload(E) {
    for (const q of E.list) {
      q.e.hp = q.e.maxHp;
      q.hits = 0;
    }
  },
  intro: () => L('golpeie cada cano para girá-lo. Ligue a caixa d\'água de cima ao ralo de baixo: os canos certos ficam azuis. Ataques em área giram vários de uma vez.', 'hit each pipe to turn it. Connect the top tank to the bottom drain: the right pipes turn blue. Area attacks turn several at once.'),
});

// ==================================================================
// 33. Teclado Gigante: 5 teclas no chão tocam uma melodia; repita pisando nas teclas (3 erros no máximo)
// ==================================================================
const PK_COL = [0xff4d6d, 0xffb347, 0x39ff88, 0x3dc7ff, 0xc77bff];
const piano = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.6, 2.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const keys = PK_COL.map((c, i) => {
      const x = (i - 2) * 1.75;
      const ring = lightMat(c, 0.5);
      put(g, box(1.45, 0.04, 2.3), ring, x, 0.03, 0);
      const fill = flatMat(c, 0.1);
      put(g, box(1.3, 0.03, 2.1), fill, x, 0.045, 0);
      return { x, ring, fill };
    });
    const n = 4 + (floor >= 15 ? 1 : 0) + (floor >= 30 ? 1 : 0);
    const seq = [];
    for (let k = 0; k < n; k++) {
      let v = ri(0, 4);
      if (k && v === seq[k - 1]) v = (v + 1 + ri(0, 3)) % 5;
      seq.push(v);
    }
    return { kind: 'piano', x: s.x, z: s.z, g, keys, seq, st: 'idle', step: 0, t: 0, miss: 0, last: -1, lit: -1, litT: 0 };
  },
  light(E, i) {
    E.keys.forEach((k, j) => {
      setLight(k.ring, PK_COL[j], j === i ? 3.2 : 0.5);
      k.fill.opacity = j === i ? 0.6 : 0.1;
    });
  },
  play(E, i) {
    piano.light(E, i);
    E.litT = 0.45;
    if (i < 4) sfx.seq(i);
    else sfx.rare();
    burst(E.x + E.keys[i].x, 0.4, E.z, PK_COL[i], 8, 2.5, 0.06, 0.4, { up: 1 });
  },
  under(E) {
    const p = G.player;
    for (let i = 0; i < 5; i++) if (Math.abs(p.x - E.x - E.keys[i].x) < 0.7 && Math.abs(p.z - E.z) < 1.1) return i;
    return -1;
  },
  update(E, dt) {
    if (E.litT > 0) {
      E.litT -= dt;
      if (E.litT <= 0) piano.light(E, -1);
    }
    const k = piano.under(E);
    if (E.st === 'idle') {
      if (!near(E, 4.8)) return;
      E.st = 'show';
      E.step = 0;
      E.t = 1;
      return;
    }
    if (E.st === 'show') {
      E.last = k;
      E.t -= dt;
      if (E.t > 0) return;
      if (E.step < E.seq.length) {
        piano.play(E, E.seq[E.step++]);
        E.t = 0.62;
      } else {
        E.st = 'input';
        E.step = 0;
        floatText(E.x, 2.2, E.z, L('SUA VEZ!', 'YOUR TURN!'), 'up');
      }
      return;
    }
    if (k === E.last) return;
    E.last = k;
    if (k < 0) return;
    piano.play(E, k);
    if (k === E.seq[E.step]) {
      E.step++;
      if (E.step >= E.seq.length) complete(E, 1.3, L('MÚSICA PERFEITA!', 'PERFECT TUNE!'), L(`${E.seq.length} notas`, `${E.seq.length} notes`), E.x, E.z);
      return;
    }
    E.miss++;
    sfx.deny();
    if (E.miss >= 3) {
      failed(E, L('Desafinou 3 vezes: o teclado desligou.', 'Three wrong notes: the keyboard shut down.'));
      piano.light(E, -1);
      return;
    }
    toast(L(`🎹 Nota errada! Ouça de novo (${E.miss}/3 erros).`, `🎹 Wrong note! Listen again (${E.miss}/3 mistakes).`), 'warn');
    E.st = 'show';
    E.step = 0;
    E.t = 1.1;
  },
  hud: (E) => (E.st === 'idle' ? L('chegue no teclado', 'reach the keyboard') : E.st === 'show' ? L('ouça...', 'listen...') : `${E.step}/${E.seq.length} · ${E.miss}/3 ${L('erros', 'miss')}`),
  dim(E) {
    piano.light(E, -1);
  },
  intro: () => L('um teclado gigante no chão. Ele toca uma melodia acendendo as teclas: depois pise nas teclas na mesma ordem. Três erros e ele desliga.', 'a giant keyboard on the floor. It plays a tune by lighting its keys: then step on the keys in the same order. Three mistakes and it shuts down.'),
});

// ==================================================================
// 34. Balança: leve os orbes para o prato da direita até igualar o peso do prato da esquerda
// ==================================================================
const SC_COL = 0xffd23d;
const SC_W = [0xff4d6d, 0xffb347, 0x39ff88, 0x3dc7ff];
const scale = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.4, 2.5);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const ws = [];
    for (let k = 0; k < 5; k++) ws.push(ri(1, 4));
    const pick2 = shuffle(ws.slice()).slice(0, 2 + ri(0, 1));
    const target = pick2.reduce((a, b) => a + b, 0);
    const panL = { x: -3.3, z: 0 };
    const panR = { x: 3.3, z: 0 };
    for (const pn of [panL, panR]) {
      put(g, mats().cyl, mats().metal, pn.x, 0.06, pn.z, 1.25, 0.12, 1.25);
      pn.ring = lightMat(SC_COL, 1);
      put(g, mats().ring, pn.ring, pn.x, 0.14, pn.z, 1.2, 1, 1.2);
    }
    // viga que pende para o lado mais pesado
    const beam = new THREE.Group();
    beam.position.set(0, 2.4, 0);
    g.add(beam);
    put(beam, box(6.6, 0.14, 0.14), lightMat(SC_COL, 1.4), 0, 0, 0);
    put(g, box(0.16, 2.4, 0.16), mats().metal, 0, 1.2, 0);
    label(g, String(target), SC_COL, panL.x, 1.3, 0, 1.4);
    // peso fixo da esquerda
    put(g, mats().oct, glowMat(SC_COL, 2.2), panL.x, 0.65, 0, 0.5, 0.6, 0.5);
    const orbs = ws.map((w, i) => {
      const x0 = -1.6 + (i % 5) * 0.8;
      const z0 = (i % 2 ? 1 : -1) * (0.7 + (i % 3) * 0.35);
      const m = put(g, mats().oct, glowMat(SC_W[w - 1], 2.2), x0, 0.55, z0, 0.2 + w * 0.05, 0.26 + w * 0.05, 0.2 + w * 0.05);
      const lb = label(g, String(w), 0xffffff, x0, 1.25, z0, 0.6);
      return { w, x0, z0, m, lb, st: 'field' };
    });
    return { kind: 'scale', x: s.x, z: s.z, g, panL, panR, beam, orbs, target, sum: 0, carry: null, st: 'idle', tilt: 0 };
  },
  scatter(E) {
    for (const o of E.orbs) {
      if (o.st === 'pan') {
        o.st = 'field';
        o.m.position.set(o.x0, 0.55, o.z0);
        o.lb.position.set(o.x0, 1.25, o.z0);
      }
    }
    E.sum = 0;
  },
  update(E, dt) {
    const p = G.player;
    E.tilt += ((E.target - E.sum) * 0.14 - E.tilt) * Math.min(1, dt * 5);
    E.beam.rotation.z = Math.max(-0.45, Math.min(0.45, E.tilt));
    if (!near(E, 8)) return;
    if (E.st === 'idle') E.st = 'run';
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    if (E.carry) {
      const o = E.carry;
      o.m.position.set(lx, 2.1, lz);
      o.lb.position.set(lx, 2.75, lz);
      if (Math.hypot(lx - E.panR.x, lz) < 1.25) {
        E.carry = null;
        o.st = 'pan';
        E.sum += o.w;
        const n = E.orbs.filter((q) => q.st === 'pan').length - 1;
        o.m.position.set(E.panR.x + (n % 2 ? 0.4 : -0.4), 0.55 + Math.floor(n / 2) * 0.35, (n % 3) * 0.3 - 0.3);
        o.lb.position.set(o.m.position.x, o.m.position.y + 0.7, o.m.position.z);
        sfx.click();
        floatText(E.x + E.panR.x, 1.8, E.z, `${E.sum}/${E.target}`, 'up');
        if (E.sum === E.target) complete(E, 1.3, L('EM EQUILÍBRIO!', 'BALANCED!'), L(`Peso ${E.target}`, `Weight ${E.target}`), E.x, E.z);
        else if (E.sum > E.target) {
          sfx.deny();
          floatText(E.x + E.panR.x, 2.4, E.z, L('PESADO DEMAIS!', 'TOO HEAVY!'), 'hurt');
          scale.scatter(E);
        }
      }
      return;
    }
    for (const o of E.orbs) {
      if (o.st !== 'field' || Math.hypot(lx - o.x0, lz - o.z0) > 0.8) continue;
      E.carry = o;
      o.st = 'carry';
      sfx.pickup();
      break;
    }
  },
  hud: (E) => (E.st === 'idle' ? L('equilibre a balança', 'balance the scale') : `${E.sum}/${E.target}${E.carry ? ` · ${L('levando', 'carrying')} ${E.carry.w}` : ''}`),
  dim(E) {
    E.beam.rotation.z = 0;
    setLight(E.panR.ring, 0x39ff88, 1.6);
  },
  busy: () => false,
  intro: () => L('o prato da esquerda pesa o número do chão. Leve orbes (cada um tem seu peso) ao prato da direita para igualar. Se passar, tudo cai.', 'the left pan weighs the number on the floor. Carry orbs (each has a weight) to the right pan to match it. Go over and they all drop.'),
});

// ==================================================================
// 35. Labirinto de Luz: as paredes só acendem perto de você. Chegue ao orbe do outro canto
// ==================================================================
const MZ_COL = 0x5affd2;
const MZ_N = 4;
const MZ_C = 1.95;
const maze = mk({
  setup(d, floor, rooms) {
    const half = (MZ_N * MZ_C) / 2;
    const s = findSpot(d, rooms, half + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    // corredores: recursão com pilha (sorteios da semente do andar)
    const seen = Array.from({ length: MZ_N * MZ_N }, () => false);
    const open = new Set();
    const stack = [[0, 0]];
    seen[0] = true;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]).map(([a, b]) => [cx + a, cy + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < MZ_N && b < MZ_N && !seen[b * MZ_N + a]);
      if (!nb.length) {
        stack.pop();
        continue;
      }
      const [nx, ny] = nb[0];
      seen[ny * MZ_N + nx] = true;
      open.add(`${Math.min(cx, nx)},${Math.min(cy, ny)},${nx !== cx ? 'v' : 'h'}`);
      stack.push([nx, ny]);
    }
    const walls = [];
    const wall = (x, z, hx, hz) => {
      const mat = flatMat(MZ_COL, 0.05);
      mat.color.multiplyScalar(2);
      const m = put(g, box(1, 1.3, 1), mat, x, 0.65, z, hx * 2, 1, hz * 2);
      walls.push({ x, z, hx, hz, mat, m });
    };
    const T = 0.1;
    for (let i = 0; i <= MZ_N; i++) {
      for (let j = 0; j < MZ_N; j++) {
        // parede vertical entre (i-1, j) e (i, j); a entrada fica na borda oeste da primeira fileira
        const edge = i === 0 || i === MZ_N;
        if (i === 0 && j === 0) continue;
        if (edge || !open.has(`${i - 1},${j},v`)) wall(-half + i * MZ_C, -half + (j + 0.5) * MZ_C, T, MZ_C / 2 + T);
      }
    }
    for (let j = 0; j <= MZ_N; j++) {
      for (let i = 0; i < MZ_N; i++) {
        const edge = j === 0 || j === MZ_N;
        if (edge || !open.has(`${i},${j - 1},h`)) wall(-half + (i + 0.5) * MZ_C, -half + j * MZ_C, MZ_C / 2 + T, T);
      }
    }
    const gx = -half + (MZ_N - 0.5) * MZ_C;
    const gz = gx;
    const core = put(g, mats().oct, glowMat(0xffd23d, 2.6), gx, 0.9, gz, 0.3, 0.45, 0.3);
    put(g, mats().ring, lightMat(0xffd23d, 1.4), gx, 0.03, gz, 0.9, 1, 0.9);
    put(g, mats().disc, flatMat(MZ_COL, 0.05), 0, 0.02, 0, half, 1, half);
    return { kind: 'maze', x: s.x, z: s.z, g, walls, core, gx, gz, half, st: 'idle' };
  },
  update(E, dt) {
    const p = G.player;
    E.core.rotation.y += dt * 2;
    if (!near(E, E.half + 8)) return;
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    if (E.st === 'idle' && Math.abs(lx) < E.half + 1 && Math.abs(lz) < E.half + 1) E.st = 'run';
    for (const w of E.walls) {
      const dd = Math.hypot(Math.max(0, Math.abs(lx - w.x) - w.hx), Math.max(0, Math.abs(lz - w.z) - w.hz));
      w.mat.opacity = 0.05 + 0.75 * Math.max(0, 1 - dd / 2.6);
      if (dd < 1) pushOut(p, E.x + w.x, E.z + w.z, w.hx, w.hz);
    }
    if (Math.hypot(lx - E.gx, lz - E.gz) < 0.9) complete(E, 1.4, L('SAÍDA ENCONTRADA!', 'EXIT FOUND!'), L('Você achou o orbe no labirinto', 'You found the orb in the maze'), E.x + E.gx, E.z + E.gz);
  },
  hud: (E) => (E.st === 'idle' ? L('entre no labirinto', 'enter the maze') : L('ache o orbe dourado', 'find the golden orb')),
  dim(E) {
    for (const w of E.walls) w.mat.opacity = 0.08;
    E.core.visible = false;
  },
  intro: () => L('um labirinto invisível: as paredes só acendem perto de você. Ache o caminho até o orbe dourado no canto oposto.', 'an invisible maze: walls only light up near you. Find the way to the golden orb in the opposite corner.'),
});

// ==================================================================
// 36. Ponte que Desaba: as placas caem logo depois que você pisa; chegue ao outro lado sem cair
// ==================================================================
const BR_COL = 0xff5a3d;
const BR_COLS = 8;
const BR_T = 1.2;
const bridge = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 5.3, 2.1);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const x0 = -((BR_COLS - 1) * BR_T) / 2;
    const tiles = [];
    const metal = new THREE.MeshLambertMaterial({ color: 0x3b4560 });
    const edge = lightMat(BR_COL, 1.4);
    // vazio sob a ponte (só as colunas do meio)
    put(g, box((BR_COLS - 2) * BR_T + 0.2, 0.04, 2 * BR_T + 0.2), new THREE.MeshBasicMaterial({ color: 0x05060c }), 0, 0.015, 0);
    put(g, box((BR_COLS - 2) * BR_T + 0.2, 0.05, 0.08), edge, 0, 0.04, -BR_T - 0.1);
    put(g, box((BR_COLS - 2) * BR_T + 0.2, 0.05, 0.08), edge, 0, 0.04, BR_T + 0.1);
    for (let c = 0; c < BR_COLS; c++) {
      const solid = c === 0 || c === BR_COLS - 1;
      const gap = !solid && ri(0, 2) === 0 ? ri(0, 1) : -1;
      for (let r = 0; r < 2; r++) {
        if (r === gap) continue;
        const x = x0 + c * BR_T;
        const z = (r - 0.5) * BR_T;
        const m = put(g, box(BR_T - 0.1, 0.14, BR_T - 0.1), metal, x, 0.07, z);
        put(m, box(0.9, 0.03, 0.9), lightMat(BR_COL, 0.5), 0, 0.08, 0);
        tiles.push({ x, z, m, solid, t: -1, gone: false });
      }
    }
    return { kind: 'bridge', x: s.x, z: s.z, g, tiles, x0, st: 'idle', ok: false, back: 0 };
  },
  reset(E) {
    for (const t of E.tiles) {
      t.t = -1;
      t.gone = false;
      t.m.visible = true;
      t.m.position.set(t.x, 0.07, t.z);
    }
  },
  update(E, dt) {
    const p = G.player;
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    // placas que caem
    for (const t of E.tiles) {
      if (t.gone) continue;
      if (t.t > 0) {
        t.t -= dt;
        t.m.position.x = t.x + Math.sin(G.t * 60) * 0.03;
        if (t.t <= 0) {
          t.gone = true;
          t.m.visible = false;
          burst(E.x + t.x, 0.3, E.z + t.z, BR_COL, 10, 2.5, 0.07, 0.5, { up: 0.5 });
        }
      }
    }
    if (!near(E, 9)) return;
    const onBridge = Math.abs(lx) < (BR_COLS * BR_T) / 2 && Math.abs(lz) < BR_T + 0.1;
    if (!onBridge || E.back > 0) {
      E.back -= dt;
      return;
    }
    if (E.st === 'idle') E.st = 'run';
    const solidSpot = (c) => c === 0 || c === BR_COLS - 1;
    const col = Math.floor((lx - E.x0) / BR_T + 0.5);
    if (solidSpot(col) && (col === 0 || col === BR_COLS - 1)) {
      if (col === 0) E.ok = true;
      else if (E.ok) {
        return complete(E, 1.4, L('TRAVESSIA FEITA!', 'CROSSED!'), L('A ponte não te pegou', 'The bridge did not get you'), E.x + lx, E.z + lz);
      }
      return;
    }
    // em cima de uma placa que ainda está de pé?
    let stand = null;
    for (const t of E.tiles) {
      if (t.gone || t.solid) continue;
      if (Math.abs(lx - t.x) < BR_T / 2 + 0.05 && Math.abs(lz - t.z) < BR_T / 2 + 0.05) {
        stand = t;
        break;
      }
    }
    if (stand) {
      if (stand.t < 0) stand.t = 0.75;
      return;
    }
    // caiu
    eventHurt(0.1, p.x, p.z, 0);
    sfx.deny();
    floatText(p.x, 2, p.z, L('CAIU!', 'FELL!'), 'hurt');
    p.x = E.x + E.x0 - 1.2;
    p.z = E.z;
    p.kx = 0;
    p.kz = 0;
    E.ok = false;
    E.back = 1;
    bridge.reset(E);
  },
  hud: (E) => (E.st === 'idle' ? L('cruze a ponte', 'cross the bridge') : L('não pare!', "don't stop!")),
  dim(E) {
    bridge.reset(E);
  },
  intro: () => L('as placas desabam logo depois que você pisa e algumas já faltam. Atravesse sem parar; se cair, perde um pouco de vida e recomeça.', 'the plates collapse right after you step and some are missing. Cross without stopping; if you fall you lose some health and start over.'),
});

// ==================================================================
// 37. Pintar o Chão: pinte 85% do piso com a sua cor; inimigos pintam de vermelho por cima
// ==================================================================
const PT_N = 6;
const PT_C = 1.15;
const PT_COL = [0x1a2236, 0x00e5ff, 0xff3355];
const paintFloor = mk({
  setup(d, floor, rooms) {
    const half = (PT_N * PT_C) / 2;
    const s = findSpot(d, rooms, half + 0.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const geo = new THREE.PlaneGeometry(PT_C - 0.08, PT_C - 0.08).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PT_N * PT_N);
    inst.position.y = 0.035;
    g.add(inst);
    const E = { kind: 'paint', x: s.x, z: s.z, g, inst, cells: new Array(PT_N * PT_N).fill(0), half, st: 'idle', foes: [], wave: 0, blue: 0 };
    const m = new THREE.Matrix4();
    for (let i = 0; i < PT_N * PT_N; i++) {
      m.setPosition(-half + ((i % PT_N) + 0.5) * PT_C, 0, -half + (Math.floor(i / PT_N) + 0.5) * PT_C);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, new THREE.Color(PT_COL[0]));
    }
    inst.instanceColor.needsUpdate = true;
    return E;
  },
  cellAt(E, x, z) {
    const i = Math.floor((x - E.x + E.half) / PT_C);
    const j = Math.floor((z - E.z + E.half) / PT_C);
    return i < 0 || j < 0 || i >= PT_N || j >= PT_N ? -1 : j * PT_N + i;
  },
  paint(E, c, v) {
    if (c < 0 || E.cells[c] === v) return;
    E.cells[c] = v;
    E.inst.setColorAt(c, new THREE.Color(PT_COL[v]).multiplyScalar(v ? 1.6 : 1));
    E.inst.instanceColor.needsUpdate = true;
    E.blue = E.cells.filter((q) => q === 1).length;
  },
  update(E, dt) {
    const p = G.player;
    if (E.st === 'idle') {
      if (!inRect(E, E.half, E.half)) return;
      E.st = 'run';
      banner(L('PINTE O CHÃO!', 'PAINT THE FLOOR!'), L('Cubra 85% do piso; os inimigos pintam de vermelho', 'Cover 85% of the floor; enemies paint it red'));
      sfx.alarm();
      ambush(E, 2, E.x, E.z, E.half + 1.5, E.half + 3.5, 0xff3355);
      return;
    }
    E.foes = E.foes.filter((e) => e.alive);
    if (p.alive) paintFloor.paint(E, paintFloor.cellAt(E, p.x, p.z), 1);
    for (const e of E.foes) paintFloor.paint(E, paintFloor.cellAt(E, e.x, e.z), 2);
    if (E.wave < 1 && E.blue >= PT_N * PT_N * 0.5) {
      E.wave = 1;
      ambush(E, 2, E.x, E.z, E.half + 1.5, E.half + 3.5, 0xff3355);
    }
    const need = Math.ceil(PT_N * PT_N * 0.85);
    if (E.blue >= need) {
      for (const e of E.foes) e.hp = 0;
      complete(E, 1.5, L('TUDO PINTADO!', 'ALL PAINTED!'), L(`${E.blue}/${PT_N * PT_N} quadrados`, `${E.blue}/${PT_N * PT_N} tiles`), E.x, E.z, { extra: true });
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre no quadro', 'step on the board') : `${E.blue}/${Math.ceil(PT_N * PT_N * 0.85)} ${L('azuis', 'blue')}`),
  busy: (E) => E.st === 'run',
  dim(E) {
    for (let i = 0; i < E.cells.length; i++) paintFloor.paint(E, i, E.st === 'done' ? 1 : 0);
  },
  intro: () => L('ande sobre o quadro para pintar o piso com a sua cor. Cubra 85% dos quadrados: os inimigos que chegam pintam de vermelho por cima, então derrote-os ou repinte.', 'walk over the board to paint the floor your color. Cover 85% of the tiles: the enemies that show up paint it red, so beat them or repaint.'),
});

// ==================================================================
// 38. Esconde-esconde: o ladrão está num de 6 barris. Cada barril vazio esquenta ou esfria a pista
// ==================================================================
const HD_COL = 0xffb36b;
const hide = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.6, 2.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    const bar = [];
    for (let k = 0; k < 6; k++) {
      const x = ((k % 3) - 1) * 2.6;
      const z = (Math.floor(k / 3) - 0.5) * 2.6;
      put(g, mats().cyl, wood, x, 0.5, z, 0.55, 1, 0.55);
      put(g, mats().cyl, mats().metal, x, 0.25, z, 0.58, 0.07, 0.58);
      put(g, mats().cyl, mats().metal, x, 0.75, z, 0.58, 0.07, 0.58);
      const lid = put(g, mats().cyl, mats().dark, x, 1.02, z, 0.5, 0.06, 0.5);
      const ring = lightMat(HD_COL, 0.7);
      put(g, mats().ring, ring, x, 0.03, z, 0.85, 1, 0.85);
      bar.push({ x, z, lid, ring, p: 0, open: false });
    }
    return { kind: 'hide', x: s.x, z: s.z, g, bar, thief: ri(0, 5), miss: 0, st: 'idle' };
  },
  heat(E) {
    const t = E.bar[E.thief];
    for (const b of E.bar) {
      if (b.open) continue;
      const dd = Math.hypot(b.x - t.x, b.z - t.z);
      setLight(b.ring, dd < 2.8 ? 0xff3322 : dd < 4.6 ? 0xffb347 : 0x3dc7ff, 1.6);
    }
  },
  update(E, dt) {
    const p = G.player;
    if (!near(E, 9)) return;
    if (E.st === 'idle') E.st = 'run';
    for (let i = 0; i < 6; i++) {
      const b = E.bar[i];
      if (b.open) continue;
      const lx = p.x - E.x - b.x;
      const lz = p.z - E.z - b.z;
      if (Math.hypot(lx, lz) < 1.05) b.p += dt;
      else b.p = Math.max(0, b.p - dt * 2);
      b.lid.position.y = 1.02 + Math.sin(G.t * 20) * 0.02 * Math.min(1, b.p * 2);
      if (b.p < 0.6) continue;
      b.open = true;
      b.lid.visible = false;
      setLight(b.ring, 0x555566, 0.4);
      burst(E.x + b.x, 1, E.z + b.z, HD_COL, 14, 3, 0.07, 0.5, { up: 2 });
      if (i === E.thief) {
        complete(E, 1.2, L('LADRÃO PEGO!', 'THIEF CAUGHT!'), L(`${E.miss} barris errados`, `${E.miss} wrong barrels`), E.x + b.x, E.z + b.z);
        return;
      }
      E.miss++;
      sfx.deny();
      floatText(E.x + b.x, 1.8, E.z + b.z, L('vazio', 'empty'), 'hurt');
      if (E.miss >= 3) {
        failed(E, L('O ladrão fugiu: 3 barris errados.', 'The thief got away: 3 wrong barrels.'));
        return;
      }
      hide.heat(E);
      toast(L('🛢️ Vazio! Os anéis ficaram <b style="color:#ff3322">vermelhos</b> (perto), <b style="color:#ffb347">laranjas</b> ou <b style="color:#3dc7ff">azuis</b> (longe) do ladrão.', '🛢️ Empty! The rings turned <b style="color:#ff3322">red</b> (close), <b style="color:#ffb347">orange</b> or <b style="color:#3dc7ff">blue</b> (far) from the thief.'), 'leg');
    }
  },
  hud: (E) => (E.st === 'idle' ? L('ache o ladrão', 'find the thief') : `${E.bar.filter((b) => !b.open).length} ${L('barris', 'barrels')} · ${E.miss}/3 ${L('erros', 'miss')}`),
  dim(E) {
    for (const b of E.bar) {
      b.open = true;
      b.lid.visible = false;
      setLight(b.ring, 0x555566, 0.4);
    }
  },
  reload(E, s) {
    if (typeof s.thief === 'number') E.thief = s.thief;
  },
  save: (E) => ({ thief: E.thief }),
  intro: () => L('um ladrão está num destes 6 barris. Chegue perto de um para abri-lo: anel vermelho = perto do ladrão, azul = longe. Errou 3 e ele foge.', 'a thief hides in one of these 6 barrels. Get close to one to open it: red ring = near the thief, blue = far. Miss 3 and he escapes.'),
});

// ==================================================================
// 39. Estátuas Vivas: só andam quando você anda. Pegue os 3 orbes sem ser tocado
// ==================================================================
const ST_COL = 0xb8c4ff;
const statues = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, 4.5, 4.5, lightMat(ST_COL, 0.7));
    const stone = new THREE.MeshLambertMaterial({ color: 0x6a728c });
    const n = 4 + (floor >= 20 ? 1 : 0);
    const list = [];
    for (let k = 0; k < n; k++) {
      const m = new THREE.Group();
      put(m, box(0.6, 1.3, 0.4), stone, 0, 0.65, 0);
      put(m, box(0.8, 0.14, 0.45), stone, 0, 1.25, 0);
      put(m, mats().oct, stone, 0, 1.6, 0, 0.26, 0.34, 0.26);
      const eye = lightMat(ST_COL, 1.6);
      put(m, box(0.3, 0.07, 0.05), eye, 0, 1.6, 0.2);
      const a = (k / n) * Math.PI * 2 + 0.7;
      const x = Math.cos(a) * 3.9;
      const z = Math.sin(a) * 3.9;
      m.position.set(x, 0, z);
      g.add(m);
      list.push({ x, z, m, eye, stun: 0 });
    }
    const orbs = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * 1.9;
      const z = Math.sin(a) * 1.9;
      orbs.push({ x, z, got: false, m: put(g, mats().oct, glowMat(0xffd23d, 2.6), x, 0.8, z, 0.22, 0.32, 0.22) });
    }
    return { kind: 'statues', x: s.x, z: s.z, g, list, orbs, st: 'idle', hurt: 0 };
  },
  update(E, dt) {
    const p = G.player;
    for (const o of E.orbs) if (!o.got) o.m.rotation.y += dt * 3;
    if (!inRect(E, 4.6, 4.6, 1)) return;
    if (E.st === 'idle') E.st = 'run';
    E.hurt -= dt;
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    const move = p.moving;
    for (const t of E.list) {
      t.stun -= dt;
      const live = move && t.stun <= 0;
      setLight(t.eye, live ? 0xff3355 : ST_COL, live ? 2.4 : 1.2);
      if (live) {
        const dx = lx - t.x;
        const dz = lz - t.z;
        const l = Math.hypot(dx, dz) || 1;
        t.x = Math.max(-4.3, Math.min(4.3, t.x + (dx / l) * 2.7 * dt));
        t.z = Math.max(-4.3, Math.min(4.3, t.z + (dz / l) * 2.7 * dt));
        t.m.position.set(t.x, 0, t.z);
        t.m.rotation.y = Math.atan2(dx, dz);
      }
      if (E.hurt <= 0 && Math.hypot(lx - t.x, lz - t.z) < 0.95) {
        E.hurt = 1.2;
        t.stun = 2;
        eventHurt(0.1, E.x + t.x, E.z + t.z, 9);
        burst(E.x + t.x, 1, E.z + t.z, 0xff3355, 12, 3, 0.07, 0.4, { up: 1 });
      }
    }
    for (const o of E.orbs) {
      if (o.got || Math.hypot(lx - o.x, lz - o.z) > 0.85) continue;
      o.got = true;
      o.m.visible = false;
      sfx.pickup();
      burst(E.x + o.x, 0.8, E.z + o.z, 0xffd23d, 12, 3, 0.06, 0.4, { up: 1.5 });
    }
    if (E.orbs.every((o) => o.got)) complete(E, 1.4, L('SEM ESTÁTUAS!', 'STATUE-PROOF!'), L('3 orbes sem ser pego', '3 orbs without being caught'), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('entre no pátio', 'enter the courtyard') : `${E.orbs.filter((o) => o.got).length}/3 ${L('orbes', 'orbs')}`),
  dim(E) {
    for (const t of E.list) setLight(t.eye, 0x555566, 0.4);
    for (const o of E.orbs) o.m.visible = false;
  },
  intro: () => L('as estátuas só andam enquanto VOCÊ anda (olhos vermelhos) e travam quando você para (azuis). Pegue os 3 orbes dourados aos poucos; o toque dói.', 'statues only move while YOU move (red eyes) and freeze when you stop (blue). Grab the 3 golden orbs in short bursts; their touch hurts.'),
});

// ==================================================================
// 40. Canhão de Neon: bata no canhão para atirar; a mira varre de um lado a outro. Derrube os 3 alvos
// ==================================================================
const CN_COL = 0xff4df0;
const CN_SHOTS = 9;
const cannon = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().metal, 0, 0.25, 0, 0.9, 0.5, 0.9);
    put(g, mats().ring, lightMat(CN_COL, 1.2), 0, 0.03, 0, 1.2, 1, 1.2);
    const barrel = new THREE.Group();
    barrel.position.y = 0.75;
    g.add(barrel);
    put(barrel, box(0.5, 0.5, 1.5), mats().metal, 0, 0, 0.55);
    put(barrel, box(0.34, 0.34, 0.1), glowMat(CN_COL, 2.4), 0, 0, 1.33);
    const aim = put(g, box(0.05, 0.03, 4.6), flatMat(CN_COL, 0.35), 0, 0.05, 0);
    const targets = [-0.78, 0, 0.78].map((a) => {
      const x = Math.sin(a) * 4.1;
      const z = Math.cos(a) * 4.1;
      const m = new THREE.Group();
      m.position.set(x, 0, z);
      g.add(m);
      put(m, mats().cyl, mats().metal, 0, 0.3, 0, 0.55, 0.6, 0.55);
      put(m, mats().cyl, glowMat(0xffd23d, 2), 0, 0.95, 0, 0.45, 0.08, 0.45).rotation.x = Math.PI / 2;
      put(m, mats().ring, lightMat(0xffd23d, 1.2), 0, 0.03, 0, 0.8, 1, 0.8);
      return { a, x, z, m, down: false };
    });
    const e = hitTarget(s.x, s.z, 0.85, 1.4, L('Canhão de Neon', 'Neon Cannon'));
    return { kind: 'cannon', x: s.x, z: s.z, g, barrel, aim, targets, e, hits: 0, st: 'idle', shots: CN_SHOTS, ang: 0, cool: 0, shells: [] };
  },
  update(E, dt) {
    E.ang = Math.sin(G.t * 1.1) * 1.05;
    E.barrel.rotation.y = E.ang;
    E.aim.rotation.y = E.ang;
    E.aim.position.set(Math.sin(E.ang) * 2.3, 0.05, Math.cos(E.ang) * 2.3);
    E.cool -= dt;
    // obuses no ar
    for (const sh of E.shells) {
      sh.t -= dt;
      sh.m.position.set(Math.sin(sh.a) * (4.1 - sh.t * 11), 0.9, Math.cos(sh.a) * (4.1 - sh.t * 11));
      if (sh.t > 0) continue;
      E.g.remove(sh.m);
      const x = E.x + Math.sin(sh.a) * 4.1;
      const z = E.z + Math.cos(sh.a) * 4.1;
      burst(x, 0.8, z, CN_COL, 18, 5, 0.08, 0.6, { up: 1.5 });
      ringFx(x, z, 1.4, CN_COL, 0.4);
      sfx.explode();
      for (const t of E.targets) {
        if (t.down || Math.abs(t.a - sh.a) > 0.24) continue;
        t.down = true;
        t.m.visible = false;
        floatText(E.x + t.x, 1.8, E.z + t.z, L('ACERTOU!', 'HIT!'), 'crit');
        burst(E.x + t.x, 0.8, E.z + t.z, 0xffd23d, 20, 5, 0.08, 0.7, { up: 2 });
      }
    }
    E.shells = E.shells.filter((s) => s.t > 0);
    const k = hitsOf(E);
    if (!k) {
      if (!E.shells.length && E.targets.every((t) => t.down)) cannon.win(E);
      else if (E.st === 'run' && E.shots <= 0 && !E.shells.length) {
        dropTarget(E);
        failed(E, L('Acabaram os tiros do canhão.', 'The cannon ran out of shots.'));
      }
      return;
    }
    if (E.st === 'idle') {
      E.st = 'run';
      banner(L('CANHÃO LIGADO!', 'CANNON ON!'), L(`Bata no canhão na hora certa: ${CN_SHOTS} tiros para 3 alvos`, `Hit the cannon at the right moment: ${CN_SHOTS} shots for 3 targets`));
    }
    if (E.cool > 0 || E.shots <= 0) return;
    E.cool = 0.4;
    E.shots--;
    sfx.shoot();
    const m = put(E.g, mats().oct, glowMat(CN_COL, 2.6), 0, 0.9, 0, 0.18, 0.18, 0.18);
    E.shells.push({ a: E.ang, t: 0.37, m });
    burst(E.x + Math.sin(E.ang) * 1.3, 0.9, E.z + Math.cos(E.ang) * 1.3, CN_COL, 8, 3, 0.06, 0.3);
  },
  win(E) {
    dropTarget(E);
    complete(E, 1.3, L('NA MOSCA!', 'BULLSEYE!'), L(`${CN_SHOTS - E.shots} tiros`, `${CN_SHOTS - E.shots} shots`), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('bata no canhão', 'hit the cannon') : `${E.targets.filter((t) => t.down).length}/3 · ${E.shots} ${L('tiros', 'shots')}`),
  dim(E) {
    dropTarget(E);
    E.aim.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('cada golpe no canhão dispara um obus na direção da mira rosa, que varre de um lado a outro. Acerte os 3 alvos amarelos em 9 tiros.', 'every hit on the cannon fires a shell where the pink aim line is pointing. The aim sweeps side to side: hit the 3 yellow targets in 9 shots.'),
});

// ------------------------------------------------------------------
// Registro (events.js lê estas tabelas)
// ------------------------------------------------------------------
// eventos com relógio entre os novos (só um deles por andar, junto com os de events.js)
export const NEW_TIMED = [];
export const NEW_KIND = { sokoban, pipes, piano, scale, maze, bridge, paint: paintFloor, hide, statues, cannon };
export const NEW_IDS = Object.keys(NEW_KIND);
export const NEW_INFO = {
  sokoban: { icon: '📦', css: '#ffb347', name: L('Caixas de Energia', 'Power Crates'), short: L('Caixas', 'Crates') },
  pipes: { icon: '🚰', css: '#39d0ff', name: L('Encanamento', 'Plumbing'), short: L('Canos', 'Pipes') },
  piano: { icon: '🎹', css: '#c77bff', name: L('Teclado Gigante', 'Giant Keyboard'), short: L('Teclado', 'Keyboard') },
  scale: { icon: '⚖️', css: '#ffd23d', name: L('Balança', 'Balance Scale'), short: L('Balança', 'Scale') },
  maze: { icon: '🔦', css: '#5affd2', name: L('Labirinto de Luz', 'Light Maze'), short: L('Labirinto', 'Maze') },
  bridge: { icon: '🌉', css: '#ff5a3d', name: L('Ponte que Desaba', 'Collapsing Bridge'), short: L('Ponte', 'Bridge') },
  paint: { icon: '🎨', css: '#00e5ff', name: L('Pintar o Chão', 'Paint the Floor'), short: L('Pintura', 'Paint') },
  hide: { icon: '🛢️', css: '#ffb36b', name: L('Esconde-esconde', 'Hide and Seek'), short: L('Esconde', 'Hide') },
  statues: { icon: '🗽', css: '#b8c4ff', name: L('Estátuas Vivas', 'Living Statues'), short: L('Estátuas', 'Statues') },
  cannon: { icon: '💥', css: '#ff4df0', name: L('Canhão de Neon', 'Neon Cannon'), short: L('Canhão', 'Cannon') },
};
