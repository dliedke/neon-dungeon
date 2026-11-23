// Eventos novos (Fase F do plano 2): mais 30 quebra-cabeças e desafios de andar, em 3 levas de 10.
// Mesmo contrato dos eventos de events.js (setup/update/hud/save/load/intro/busy), registrados lá em
// MAIN_EVENTS, EVENT_INFO, KIND e TIMED. Só usam andar, encostar e atacar (teclado, controle e toque).
// Atenção: este módulo importa events.js (circular): nada daqui roda no topo do módulo, só dentro das funções.
import * as THREE from 'three';
import { G } from './state.js';
import { L } from './i18n.js';
import { ri, shuffle } from './utils.js';
import { isWalkable } from './dungeon.js';
import { damageEnemy } from './combat.js';
import { spawnEnemy, killQuiet } from './enemies.js';
import { applyAnomalyToEnemy } from './run.js';
import { spawnPickup } from './loot.js';
import { glowMat, box } from './models.js';
import { burst, ringFx, floatText } from './fx.js';
import { sfx } from './audio.js';
import { toast, banner } from './ui.js';
import { mmss, mats, put, groupAt, lightMat, setLight, flatMat, near, waitFoes, findSpot, complete, failed, eventHurt, hitTarget, hitsOf, dropTarget, ambush, fighterType, eventCredits } from './events.js';

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
function label(parent, text, color, x, y, z, s = 0.9, wide = 1) {
  const c = document.createElement('canvas');
  c.width = 64 * wide;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = '#000';
  g.strokeText(text, c.width / 2, 35);
  g.fillStyle = hex(color);
  g.fillText(text, c.width / 2, 35);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(s * wide, s, 1);
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
      // com inimigos por perto a música espera (e recomeça do início quando a área limpa)
      if (!near(E, 4.8) || waitFoes(E)) return;
      E.st = 'show';
      E.step = 0;
      E.t = 1;
      return;
    }
    if (E.st === 'show') {
      E.last = k;
      if (waitFoes(E)) {
        E.st = 'idle';
        piano.light(E, -1);
        E.litT = 0;
        return;
      }
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
    let prevGap = -1;
    for (let c = 0; c < BR_COLS; c++) {
      const solid = c === 0 || c === BR_COLS - 1;
      let gap = !solid && ri(0, 2) === 0 ? ri(0, 1) : -1;
      // buracos em fileiras opostas em colunas seguidas só deixam passar pela quina: o buraco repete a fileira
      // (ajusta depois do sorteio para não mudar a sequência da semente do andar)
      if (gap >= 0 && prevGap >= 0 && gap !== prevGap) gap = prevGap;
      prevGap = gap;
      for (let r = 0; r < 2; r++) {
        if (r === gap) continue;
        const x = x0 + c * BR_T;
        const z = (r - 0.5) * BR_T;
        const m = put(g, box(BR_T - 0.1, 0.14, BR_T - 0.1), metal, x, 0.07, z);
        put(m, box(0.9, 0.03, 0.9), lightMat(BR_COL, 0.5), 0, 0.08, 0);
        tiles.push({ x, z, m, solid, t: -1, gone: false });
      }
    }
    return { kind: 'bridge', x: s.x, z: s.z, g, tiles, x0, st: 'idle', from: -1, back: 0 };
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
    E.back -= dt;
    if (!onBridge) {
      E.from = -1; // saiu da ponte (pelos lados ou pela ponta): contornar por fora não vale
      return;
    }
    if (E.st === 'idle') E.st = 'run';
    // cabeceiras firmes: vale atravessar nos dois sentidos. A cabeceira conta mesmo logo depois de cair
    // (antes, voltando direto, o jogador passava pelo começo durante esse 1s e a travessia não valia)
    const col = Math.floor((lx - E.x0) / BR_T + 0.5);
    const end = col <= 0 ? 0 : col >= BR_COLS - 1 ? BR_COLS - 1 : -1;
    if (end >= 0) {
      if (E.from >= 0 && E.from !== end) return complete(E, 1.4, L('TRAVESSIA FEITA!', 'CROSSED!'), L('A ponte não te pegou', 'The bridge did not get you'), E.x + lx, E.z + lz);
      E.from = end;
      return;
    }
    if (E.back > 0) return;
    // em cima de uma placa que ainda está de pé?
    let stand = null;
    for (const t of E.tiles) {
      if (t.gone || t.solid) continue;
      if (Math.abs(lx - t.x) < BR_T / 2 + 0.15 && Math.abs(lz - t.z) < BR_T / 2 + 0.15) {
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
    E.from = -1;
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
// 37. Pintar o Chão: pinte o piso inteiro com a sua cor; inimigos pintam de vermelho por cima
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
      banner(L('PINTE O CHÃO!', 'PAINT THE FLOOR!'), L('Pinte todos os quadrados; os inimigos pintam de vermelho', 'Paint every tile; enemies paint it red'));
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
    // todos os quadrados (antes 85%: acabava faltando 4 ou 5)
    if (E.blue >= PT_N * PT_N) {
      for (const e of E.foes) e.hp = 0;
      complete(E, 1.5, L('TUDO PINTADO!', 'ALL PAINTED!'), L(`${E.blue}/${PT_N * PT_N} quadrados`, `${E.blue}/${PT_N * PT_N} tiles`), E.x, E.z, { extra: true });
    }
  },
  hud: (E) => (E.st === 'idle' ? L('entre no quadro', 'step on the board') : `${E.blue}/${PT_N * PT_N} ${L('azuis', 'blue')}`),
  busy: (E) => E.st === 'run',
  dim(E) {
    for (let i = 0; i < E.cells.length; i++) paintFloor.paint(E, i, E.st === 'done' ? 1 : 0);
  },
  intro: () => L('ande sobre o quadro para pintar o piso com a sua cor. Pinte todos os quadrados: os inimigos que chegam pintam de vermelho por cima, então derrote-os ou repinte.', 'walk over the board to paint the floor your color. Paint every tile: the enemies that show up paint it red, so beat them or repaint.'),
});

// ==================================================================
// 38. Esconde-esconde: o ladrão está num de 6 barris. Cada barril vazio esquenta ou esfria a pista
// ==================================================================
const HD_COL = 0xffb36b;
const HD_IDLE = 0xd8dcff; // anel de barril ainda fechado (neutro: as cores ficam só para as pistas)
// pista do barril vazio aberto: o quão perto ele está do barril do ladrão (vizinho, diagonal ou longe)
const HD_CLUE = [
  { d: 2.8, col: 0xff3322, pt: 'QUENTE', en: 'HOT' },
  { d: 4.6, col: 0xffb347, pt: 'MORNO', en: 'WARM' },
  { d: 99, col: 0x3dc7ff, pt: 'FRIO', en: 'COLD' },
];
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
      const ring = lightMat(HD_IDLE, 0.7);
      put(g, mats().ring, ring, x, 0.03, z, 0.85, 1, 0.85);
      bar.push({ x, z, lid, ring, p: 0, open: false });
    }
    return { kind: 'hide', x: s.x, z: s.z, g, bar, thief: ri(0, 5), miss: 0, st: 'idle' };
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
      burst(E.x + b.x, 1, E.z + b.z, HD_COL, 14, 3, 0.07, 0.5, { up: 2 });
      if (i === E.thief) {
        complete(E, 1.2, L('LADRÃO PEGO!', 'THIEF CAUGHT!'), L(`${E.miss} barris errados`, `${E.miss} wrong barrels`), E.x + b.x, E.z + b.z);
        return;
      }
      E.miss++;
      sfx.deny();
      if (E.miss >= 3) {
        setLight(b.ring, 0x555566, 0.4);
        failed(E, L('O ladrão fugiu: 3 barris errados.', 'The thief got away: 3 wrong barrels.'));
        return;
      }
      // o barril vazio diz só o quão perto ELE está do ladrão (os fechados continuam neutros)
      const t = E.bar[E.thief];
      const dd = Math.hypot(b.x - t.x, b.z - t.z);
      const cl = HD_CLUE.find((q) => dd < q.d);
      setLight(b.ring, cl.col, 1.6);
      b.tag = label(E.g, L(cl.pt, cl.en), cl.col, b.x, 1.75, b.z, 0.55, 4);
      floatText(E.x + b.x, 2.2, E.z + b.z, L('vazio', 'empty'), 'hurt');
      if (E.miss === 1) toast(L('🛢️ Vazio! O barril aberto mostra a distância até o ladrão: <b style="color:#ff3322">QUENTE</b> = ele está num barril do lado, <b style="color:#ffb347">MORNO</b> = na diagonal, <b style="color:#3dc7ff">FRIO</b> = longe.', '🛢️ Empty! The opened barrel tells how far the thief is: <b style="color:#ff3322">HOT</b> = he is in a barrel right next to it, <b style="color:#ffb347">WARM</b> = diagonal, <b style="color:#3dc7ff">COLD</b> = far.'), 'leg');
    }
  },
  hud: (E) => (E.st === 'idle' ? L('ache o ladrão', 'find the thief') : `${E.bar.filter((b) => !b.open).length} ${L('barris', 'barrels')} · ${E.miss}/3 ${L('erros', 'miss')}`),
  dim(E) {
    for (const b of E.bar) {
      b.open = true;
      b.lid.visible = false;
      setLight(b.ring, 0x555566, 0.4);
      if (b.tag) b.tag.visible = false;
    }
  },
  reload(E, s) {
    if (typeof s.thief === 'number') E.thief = s.thief;
  },
  save: (E) => ({ thief: E.thief }),
  intro: () => L('um ladrão está num destes 6 barris. Fique parado num barril para abri-lo. Se estiver vazio, ele mostra a distância até o ladrão: QUENTE = barril do lado, MORNO = na diagonal, FRIO = longe. No 3º erro ele foge.', 'a thief hides in one of these 6 barrels. Stand at a barrel to open it. If it is empty it shows how far the thief is: HOT = the barrel next to it, WARM = diagonal, COLD = far. On the 3rd miss he escapes.'),
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

// ==================================================================
// 41. Golem de Peças: ache 4 peças (cada uma chama um guarda), monte o golem e deixe-o lutar com você
// ==================================================================
const GO_COL = 0x7dffb0;
const GO_PARTS = [0xff7a3d, 0x39d0ff, 0xffd23d, 0xc77bff];
const golem = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().metal, 0, 0.2, 0, 0.9, 0.4, 0.9);
    put(g, mats().ring, lightMat(GO_COL, 1.2), 0, 0.03, 0, 1.2, 1, 1.2);
    const slots = [-0.45, -0.15, 0.15, 0.45].map((x) => {
      const mat = lightMat(0x2a3344, 0.4);
      put(g, box(0.22, 0.12, 0.22), mat, x, 0.46, 0);
      return { mat };
    });
    const off = ri(0, 6) * 0.5;
    const parts = GO_PARTS.map((col, k) => {
      const a = (k / 4) * Math.PI * 2 + off;
      const x = Math.cos(a) * 3.7;
      const z = Math.sin(a) * 3.7;
      const m = put(g, mats().oct, glowMat(col, 2.4), x, 0.8, z, 0.3, 0.4, 0.3);
      put(g, mats().ring, lightMat(col, 0.9), x, 0.03, z, 0.6, 1, 0.6);
      return { x, z, col, m, got: false, a };
    });
    // o golem (aparece quando as 4 peças estão no pedestal)
    const gm = new THREE.Group();
    gm.visible = false;
    g.add(gm);
    const eye = glowMat(GO_COL, 2.6);
    put(gm, box(0.34, 0.8, 0.4), mats().metal, -0.26, 0.4, 0);
    put(gm, box(0.34, 0.8, 0.4), mats().metal, 0.26, 0.4, 0);
    put(gm, box(1.0, 0.9, 0.6), mats().metal, 0, 1.25, 0);
    put(gm, box(0.62, 0.5, 0.5), mats().metal, 0, 1.95, 0);
    put(gm, box(0.4, 0.09, 0.06), eye, 0, 1.98, 0.26);
    put(gm, box(0.3, 0.9, 0.34), mats().metal, -0.72, 1.2, 0);
    put(gm, box(0.3, 0.9, 0.34), mats().metal, 0.72, 1.2, 0);
    put(gm, box(0.3, 0.3, 0.3), eye, 0, 1.28, 0.32);
    return { kind: 'golem', x: s.x, z: s.z, g, parts, slots, gm, foes: [], st: 'idle', got: 0, gt: 0, gx: 0, gz: 0, hitT: 0 };
  },
  update(E, dt) {
    const p = G.player;
    for (const q of E.parts) {
      if (q.got) continue;
      q.m.rotation.y += dt * 2.5;
      q.m.position.y = 0.8 + Math.sin(G.t * 2 + q.a) * 0.12;
    }
    if (E.st === 'idle') {
      if (!near(E, 9)) return;
      E.st = 'parts';
    }
    if (E.st === 'parts') {
      for (const q of E.parts) {
        if (q.got || Math.hypot(p.x - E.x - q.x, p.z - E.z - q.z) > 0.9) continue;
        q.got = true;
        q.m.visible = false;
        setLight(E.slots[E.got].mat, q.col, 2);
        E.got++;
        sfx.pickup();
        floatText(E.x + q.x, 1.8, E.z + q.z, `${E.got}/4`, 'up');
        ambush(E, 1, E.x + q.x, E.z + q.z, 3, 5, q.col);
      }
      if (E.got < 4) return;
      E.st = 'golem';
      E.gt = 16;
      E.gm.visible = true;
      E.gx = 0;
      E.gz = 0;
      E.gm.position.set(0, 0, 0);
      sfx.legendary();
      ringFx(E.x, E.z, 3, GO_COL, 0.6);
      burst(E.x, 1.2, E.z, GO_COL, 40, 6, 0.08, 0.8, { up: 1.5 });
      banner(L('GOLEM MONTADO!', 'GOLEM ASSEMBLED!'), L('Ele luta ao seu lado por alguns segundos', 'It fights by your side for a few seconds'));
      ambush(E, 3 + (G.floor >= 20 ? 1 : 0), E.x, E.z, 7, 10, GO_COL);
      return;
    }
    E.foes = E.foes.filter((e) => e.alive);
    if (E.st === 'golem') {
      E.gt -= dt;
      E.hitT -= dt;
      let best = null;
      let bd = 1e9;
      for (const f of E.foes) {
        const dd = Math.hypot(f.x - E.x - E.gx, f.z - E.z - E.gz);
        if (dd < bd) {
          bd = dd;
          best = f;
        }
      }
      if (best) {
        const dx = best.x - E.x - E.gx;
        const dz = best.z - E.z - E.gz;
        E.gm.rotation.y = Math.atan2(dx, dz);
        if (bd > 1.5) {
          const nx = E.gx + (dx / bd) * 3.6 * dt;
          const nz = E.gz + (dz / bd) * 3.6 * dt;
          if (isWalkable(G.dungeon, E.x + nx, E.z + nz)) {
            E.gx = nx;
            E.gz = nz;
          }
        } else if (E.hitT <= 0) {
          E.hitT = 0.6;
          damageEnemy(best, best.maxHp * 0.18 + 12, false, {});
          burst(best.x, 1, best.z, GO_COL, 10, 4, 0.07, 0.35, { up: 1 });
          ringFx(best.x, best.z, 1.2, GO_COL, 0.25);
          sfx.explode();
        }
      }
      E.gm.position.set(E.gx, Math.abs(Math.sin(G.t * 6)) * 0.08, E.gz);
      if (E.gt <= 0) {
        E.st = 'fight';
        E.gm.visible = false;
        burst(E.x + E.gx, 1.2, E.z + E.gz, GO_COL, 30, 5, 0.08, 0.7, { up: 1 });
        toast(L('🤖 O golem se desmontou. Termine o serviço!', '🤖 The golem fell apart. Finish the job!'), 'warn');
      }
    }
    if (!E.foes.length) {
      E.gm.visible = false;
      complete(E, 1.3, L('GOLEM VITORIOSO!', 'GOLEM VICTORIOUS!'), L('Todas as peças no lugar', 'Every part in place'), E.x, E.z);
    }
  },
  busy: (E) => E.st === 'golem' || E.st === 'fight',
  hud(E) {
    if (E.st === 'idle') return L('ache as 4 peças', 'find the 4 parts');
    if (E.st === 'parts') return `${E.got}/4 ${L('peças', 'parts')}`;
    if (E.st === 'golem') return `${L('golem', 'golem')} ${Math.ceil(E.gt)}s · ${E.foes.length} ${L('inimigos', 'foes')}`;
    return `${E.foes.length} ${L('inimigos', 'foes')}`;
  },
  dim(E) {
    E.gm.visible = false;
    for (const q of E.parts) q.m.visible = false;
  },
  intro: () => L('4 peças brilhantes estão em volta do pedestal. Cada uma que você pega chama um guarda. Com as 4, o golem se monta e luta ao seu lado.', '4 glowing parts lie around the pedestal. Each one you pick up calls a guard. With all 4 the golem assembles and fights by your side.'),
});

// ==================================================================
// 42. Pesca de Dados: fique no píer e golpeie a boia só quando o peixe morder (3 escapadas e acabou)
// ==================================================================
const FI_COL = 0x39d0ff;
const FI_NEED = 5;
const fishing = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4, 2.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().disc, flatMat(0x0a4a70, 0.75), 1.9, 0.02, 0, 2.5, 1, 2.2);
    put(g, mats().ring, lightMat(FI_COL, 1), 1.9, 0.03, 0, 2.5, 1, 2.2);
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    put(g, box(4, 0.12, 1.3), wood, -1.4, 0.14, 0);
    for (const x of [-3.2, -1.4, 0.4]) for (const z of [-0.6, 0.6]) put(g, box(0.12, 0.3, 0.12), mats().dark, x, 0.15, z);
    put(g, box(0.5, 0.04, 0.5), lightMat(FI_COL, 1.2), -2.8, 0.22, 0);
    const bob = new THREE.Group();
    bob.position.set(2.2, 0, 0);
    g.add(bob);
    put(bob, mats().oct, glowMat(0xff4466, 1.6), 0, 0.2, 0, 0.16, 0.22, 0.16);
    const ring = lightMat(FI_COL, 0.7);
    const wave = put(g, mats().ring, ring, 2.2, 0.04, 0, 0.5, 1, 0.5);
    const e = hitTarget(s.x + 2.2, s.z, 0.8, 1, L('Boia', 'Float'));
    return { kind: 'fishing', x: s.x, z: s.z, g, bob, wave, ring, e, hits: 0, st: 'idle', fish: 0, miss: 0, wait: 2.5, bite: 0 };
  },
  onPier(E) {
    const p = G.player;
    return Math.abs(p.x - E.x + 1.4) < 2.4 && Math.abs(p.z - E.z) < 1.1;
  },
  update(E, dt) {
    const hit = hitsOf(E);
    const pier = fishing.onPier(E);
    if (E.st === 'idle') {
      if (!pier) return;
      E.st = 'run';
      banner(L('PESCARIA!', 'FISHING!'), L('Golpeie a boia quando ela afundar', 'Hit the float when it sinks'));
    }
    E.bob.position.y = E.bite > 0 ? -0.3 + Math.sin(G.t * 30) * 0.03 : Math.sin(G.t * 2) * 0.04;
    E.wave.scale.setScalar(E.bite > 0 ? 0.5 + ((G.t * 3) % 1) * 1.1 : 0.5);
    if (hit) {
      if (E.bite > 0) {
        E.bite = 0;
        E.fish++;
        E.wait = 1.6 + Math.random() * 2.2;
        sfx.pickup();
        floatText(E.x + 2.2, 1.7, E.z, L('PEGOU!', 'CAUGHT!'), 'crit');
        burst(E.x + 2.2, 0.8, E.z, FI_COL, 22, 5, 0.08, 0.7, { up: 3 });
        if (E.fish >= FI_NEED) {
          dropTarget(E);
          complete(E, 1.2, L('PESCARIA FARTA!', 'GREAT CATCH!'), L(`${E.fish} peixes de dados`, `${E.fish} data fish`), E.x, E.z);
        }
      } else if (G.t - (E.earlyT || -9) > 1.5) {
        // golpe antes da hora só avisa: atrasar a mordida a cada golpe (drones, auras, pets batem sozinhos) fazia a boia nunca afundar
        E.earlyT = G.t;
        floatText(E.x + 2.2, 1.5, E.z, L('espere afundar', 'wait for the sink'), 'hurt');
      }
      return;
    }
    // o relógio da mordida corre com o jogador perto (no píer ou na beira d'água batendo na boia), não só em cima do píer
    if (!near(E, 6)) return;
    if (E.bite > 0) {
      E.bite -= dt;
      if (E.bite <= 0) {
        E.miss++;
        E.wait = 1.8 + Math.random() * 2;
        sfx.deny();
        floatText(E.x + 2.2, 1.5, E.z, L('escapou!', 'it got away!'), 'hurt');
        if (E.miss >= 3) {
          dropTarget(E);
          failed(E, L('Os peixes escaparam: 3 vezes.', 'The fish got away 3 times.'));
        }
      }
      return;
    }
    E.wait -= dt;
    if (E.wait <= 0) {
      E.bite = 1.2;
      sfx.click();
      floatText(E.x + 2.2, 1.7, E.z, '!', 'crit');
      burst(E.x + 2.2, 0.2, E.z, FI_COL, 16, 3, 0.07, 0.5, { up: 2.5 });
    }
  },
  hud: (E) => (E.st === 'idle' ? L('suba no píer', 'step on the pier') : `${E.fish}/${FI_NEED} ${L('peixes', 'fish')} · ${E.miss}/3 ${L('erros', 'miss')}`),
  dim(E) {
    dropTarget(E);
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('suba no píer e espere: quando a boia afundar com um "!" e espirrar água, golpeie ela rápido. Pegue 5 peixes; 3 escapadas e acabou.', 'step on the pier and wait: when the float sinks with a "!" and a splash, hit it fast. Catch 5 fish; 3 escapes and it ends.'),
});

// ==================================================================
// 43. Dominós: tampe os vãos pisando neles e acerte o primeiro dominó para derrubar a fila inteira
// ==================================================================
const DM_COL = 0xff8a3d;
const DM_N = 11;
const dominos = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.9, 2.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, 4.8, 2.3, lightMat(DM_COL, 0.6));
    const pos = [];
    for (let i = 0; i < DM_N; i++) pos.push({ x: -4.2 + i * 0.84, z: Math.sin(i * 0.7) * 1.3 });
    const gaps = shuffle(Array.from({ length: DM_N - 4 }, (_, i) => i + 2)).slice(0, 3);
    const pieces = pos.map((q, i) => {
      const n = pos[Math.min(DM_N - 1, i + 1)];
      const pr = pos[Math.max(0, i - 1)];
      const th = Math.atan2(-(n.z - pr.z), n.x - pr.x);
      const m = new THREE.Group();
      m.position.set(q.x, 0, q.z);
      m.rotation.y = th;
      g.add(m);
      const inner = new THREE.Group();
      m.add(inner);
      const col = i === 0 ? 0xffd23d : new THREE.Color().setHSL(0.02 + (i / DM_N) * 0.1, 0.9, 0.55).getHex();
      put(inner, box(0.18, 0.9, 0.7), glowMat(col, i === 0 ? 1.6 : 0.9), 0, 0.45, 0);
      const gap = gaps.includes(i);
      m.visible = !gap;
      let plate = null;
      if (gap) plate = put(g, mats().ring, lightMat(DM_COL, 1.4), q.x, 0.03, q.z, 0.55, 1, 0.55);
      return { m, inner, gap, plate, fall: -1 };
    });
    const gong = put(g, mats().cyl, glowMat(0xffd23d, 1.8), pos[DM_N - 1].x + 0.9, 0.9, pos[DM_N - 1].z, 0.45, 0.05, 0.45);
    gong.rotation.z = Math.PI / 2;
    const e = hitTarget(s.x + pos[0].x, s.z + pos[0].z, 0.55, 1, L('Dominó inicial', 'First domino'));
    return { kind: 'dominos', x: s.x, z: s.z, g, pos, pieces, e, hits: 0, st: 'idle', chain: null, rt: 0 };
  },
  update(E, dt) {
    const p = G.player;
    for (const q of E.pieces) {
      if (q.fall >= 0 && q.fall < 1) {
        q.fall = Math.min(1, q.fall + dt * 3.2);
        q.inner.rotation.z = -q.fall * 1.45;
      }
    }
    const hit = hitsOf(E);
    if (E.chain) {
      const c = E.chain;
      c.t += dt;
      while (c.t > 0.13 && c.i < c.stop) {
        c.t -= 0.13;
        E.pieces[c.i].fall = 0;
        sfx.click();
        c.i++;
      }
      if (c.i >= c.stop && c.t > 0.4) {
        E.chain = null;
        if (c.stop >= DM_N) {
          dropTarget(E);
          sfx.legendary();
          complete(E, 1.2, L('EFEITO DOMINÓ!', 'DOMINO EFFECT!'), L('A fila caiu inteira', 'The whole line fell'), E.x, E.z);
        } else {
          E.rt = 1.6;
          sfx.deny();
          toast(L('🁣 A fila parou em um vão! Tampe os vãos pisando nos anéis.', '🁣 The line stopped at a gap! Fill the gaps by stepping on the rings.'), 'warn');
        }
      }
      return;
    }
    if (E.rt > 0) {
      E.rt -= dt;
      if (E.rt <= 0) {
        for (const q of E.pieces) {
          q.fall = -1;
          q.inner.rotation.z = 0;
        }
      }
      return;
    }
    if (!near(E, 8)) return;
    if (E.st === 'idle') E.st = 'run';
    E.pieces.forEach((q, i) => {
      if (!q.gap || q.m.visible) return;
      if (Math.hypot(p.x - E.x - E.pos[i].x, p.z - E.z - E.pos[i].z) > 0.75) return;
      q.m.visible = true;
      q.plate.visible = false;
      sfx.pickup();
      floatText(E.x + E.pos[i].x, 1.4, E.z + E.pos[i].z, '+', 'up');
    });
    if (!hit) return;
    let stop = DM_N;
    for (let i = 0; i < DM_N; i++) {
      if (!E.pieces[i].m.visible) {
        stop = i;
        break;
      }
    }
    E.chain = { i: 0, t: 0, stop };
  },
  hud: (E) => (E.st === 'idle' ? L('tampe os vãos', 'fill the gaps') : `${E.pieces.filter((q) => q.gap && !q.m.visible).length} ${L('vãos', 'gaps')} · ${L('bata no 1º', 'hit the 1st')}`),
  dim(E) {
    dropTarget(E);
    for (const q of E.pieces) {
      q.m.visible = true;
      q.fall = 1;
      q.inner.rotation.z = -1.45;
      if (q.plate) q.plate.visible = false;
    }
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('uma fila de dominós com 3 vãos. Pise nos anéis para colocar os que faltam e depois golpeie o primeiro (dourado): a fila inteira tem que cair.', 'a row of dominoes with 3 gaps. Step on the rings to place the missing ones, then hit the first one (gold): the whole row has to fall.'),
});

// ==================================================================
// 44. Caçada em Dupla: dois alvos ligados; os dois têm que morrer em até 6s um do outro, senão o morto volta
// ==================================================================
const BD_COL = 0xff4df0;
const bounty2 = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(BD_COL, 1.2), 0, 0.03, 0, 3.2, 1, 3.2);
    put(g, mats().disc, flatMat(BD_COL, 0.06), 0, 0.02, 0, 3.2, 1, 3.2);
    const beam = put(g, mats().beam, lightMat(BD_COL, 1.6), 0, 1.4, 0);
    beam.visible = false;
    return { kind: 'bounty2', x: s.x, z: s.z, g, beam, foes: [], pair: [], st: 'idle', win: 0, down: -1, dx: 0, dz: 0, rev: 0 };
  },
  spawnOne(E, x, z, i) {
    const e = spawnEnemy(fighterType(), x, z, { elite: true });
    applyAnomalyToEnemy(e);
    e.hp = e.maxHp = e.maxHp * 1.3;
    e.name = i ? L('Alvo Beta', 'Target Beta') : L('Alvo Alfa', 'Target Alpha');
    e.aggro = true;
    e.alerted = true;
    E.pair[i] = e;
    burst(x, 0.8, z, BD_COL, 20, 5, 0.08, 0.6, { up: 1.2 });
    ringFx(x, z, 1.4, BD_COL, 0.4);
    return e;
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 10)) return;
      E.st = 'run';
      bounty2.spawnOne(E, E.x - 2.4, E.z, 0);
      bounty2.spawnOne(E, E.x + 2.4, E.z, 1);
      banner(L('CAÇADA EM DUPLA!', 'DOUBLE HUNT!'), L('Derrote os dois em até 6 segundos um do outro', 'Defeat both within 6 seconds of each other'));
      return;
    }
    const [a, b] = E.pair;
    if (a.alive && b.alive) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz);
      E.beam.visible = l < 22;
      E.beam.position.set((a.x + b.x) / 2 - E.x, 1.4, (a.z + b.z) / 2 - E.z);
      E.beam.scale.x = l;
      E.beam.rotation.y = Math.atan2(-dz, dx);
      return;
    }
    E.beam.visible = false;
    if (!a.alive && !b.alive) {
      complete(E, 1.4, L('DUPLA ABATIDA!', 'PAIR DOWN!'), L('Os dois caíram juntos', 'Both fell together'), E.x, E.z);
      return;
    }
    const i = a.alive ? 1 : 0;
    if (E.down !== i) {
      E.down = i;
      E.win = 6;
      E.dx = E.pair[i].x;
      E.dz = E.pair[i].z;
    }
    E.win -= dt;
    if (E.win > 0) return;
    // acabou o tempo: o caído volta e o outro se cura
    const alive = E.pair[1 - i];
    alive.hp = alive.maxHp;
    E.rev++;
    E.down = -1;
    if (E.rev >= 3) {
      for (const e of E.pair) if (e.alive) killQuiet(e);
      failed(E, L('A dupla se reergueu 3 vezes e fugiu.', 'The pair rose again 3 times and fled.'));
      return;
    }
    const ok = isWalkable(G.dungeon, E.dx, E.dz);
    bounty2.spawnOne(E, ok ? E.dx : alive.x, ok ? E.dz : alive.z, i);
    floatText(alive.x, alive.height + 0.8, alive.z, L('CURADO!', 'HEALED!'), 'up');
    toast(L('🎯 Demorou! O alvo voltou e o outro se curou.', '🎯 Too slow! The target is back and the other one healed.'), 'warn');
  },
  busy: (E) => E.st === 'run',
  hud(E) {
    if (E.st === 'idle') return L('derrote a dupla', 'defeat the pair');
    return E.win > 0 && E.down >= 0 ? `⏱ ${Math.ceil(E.win)}s · ${E.rev}/3` : `2 ${L('alvos', 'targets')} · ${E.rev}/3`;
  },
  dim(E) {
    E.beam.visible = false;
  },
  intro: () => L('dois alvos elite ligados por um raio. Se um cair, o outro precisa cair em até 6 segundos: senão o morto volta e o vivo se cura. 3 falhas e eles fogem.', 'two elite targets linked by a beam. If one falls, the other must fall within 6 seconds or the dead one returns and the survivor heals. 3 failures and they flee.'),
});

// ==================================================================
// 45. Torre de Defesa: proteja o núcleo de 4 ondas (sem relógio: termina quando a última onda cai)
// ==================================================================
const TW_COL = 0x5affd2;
const TW_WAVES = [3, 4, 5, 6];
const tower = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().metal, 0, 0.3, 0, 0.8, 0.6, 0.8);
    const core = put(g, mats().oct, glowMat(TW_COL, 2.8), 0, 1.5, 0, 0.5, 0.75, 0.5);
    const ring = lightMat(TW_COL, 1.2);
    put(g, mats().ring, ring, 0, 0.03, 0, 3, 1, 3);
    put(g, mats().disc, flatMat(TW_COL, 0.07), 0, 0.02, 0, 3, 1, 3);
    return { kind: 'tower', x: s.x, z: s.z, g, core, ring, foes: [], st: 'idle', w: 0, hp: 100, gap: 0 };
  },
  update(E, dt) {
    const p = G.player;
    E.core.rotation.y += dt * 1.5;
    E.core.position.y = 1.5 + Math.sin(G.t * 2) * 0.1;
    if (E.st === 'idle') {
      if (!near(E, 9)) return;
      E.st = 'run';
      E.gap = 3;
      banner(L('DEFENDA O NÚCLEO!', 'DEFEND THE CORE!'), L('4 ondas · fique perto dele (cura você)', '4 waves · stay near it (it heals you)'));
    }
    E.foes = E.foes.filter((e) => e.alive);
    // quem chega perto do núcleo o machuca; o jogador no círculo é curado
    let hurt = 0;
    for (const f of E.foes) if (Math.hypot(f.x - E.x, f.z - E.z) < 2.6) hurt++;
    if (hurt) {
      E.hp -= hurt * 2.4 * dt;
      setLight(E.ring, 0xff3355, 1.8);
      if (E.hp <= 0) {
        for (const f of E.foes) killQuiet(f);
        E.core.visible = false;
        burst(E.x, 1.5, E.z, TW_COL, 40, 6, 0.08, 0.8, { up: 1 });
        failed(E, L('O núcleo foi destruído.', 'The core was destroyed.'));
        return;
      }
    } else setLight(E.ring, TW_COL, 1.2);
    if (near(E, 3)) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.02 * dt);
    if (E.foes.length) return;
    if (E.w >= TW_WAVES.length) {
      complete(E, 1.5, L('NÚCLEO A SALVO!', 'CORE SAFE!'), L(`${Math.round(E.hp)}% de integridade`, `${Math.round(E.hp)}% integrity`), E.x, E.z, { extra: true });
      return;
    }
    E.gap -= dt;
    if (E.gap > 0) return;
    ambush(E, TW_WAVES[E.w] + Math.floor(G.floor / 12), E.x, E.z, 8, 11, TW_COL);
    E.w++;
    E.gap = 3.5;
    banner(L(`ONDA ${E.w}/4`, `WAVE ${E.w}/4`), '');
  },
  busy: (E) => E.st === 'run',
  hud: (E) => (E.st === 'idle' ? L('defenda o núcleo', 'defend the core') : `${L('onda', 'wave')} ${Math.max(1, E.w)}/4 · ${L('núcleo', 'core')} ${Math.max(0, Math.round(E.hp))}%`),
  dim(E) {
    E.core.visible = false;
  },
  intro: () => L('proteja o núcleo de 4 ondas de inimigos. Quem chegar perto dele o danifica, e quem fica no círculo é curado. Não tem relógio: acaba quando a última onda cair.', 'protect the core from 4 waves of enemies. Anyone near it damages it, and standing in the circle heals you. No clock: it ends when the last wave falls.'),
});

// ==================================================================
// 46. Sinos Afinados: golpeie os 5 sinos do maior (grave) ao menor (agudo)
// ==================================================================
const BL_COL = 0xffd23d;
const bells = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.6, 2.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, 4.5, 2.1, lightMat(BL_COL, 0.6));
    put(g, box(9, 0.16, 0.16), mats().metal, 0, 2.7, -0.9);
    const order = shuffle([0, 1, 2, 3, 4]);
    const list = order.map((rank, k) => {
      const x = -3.4 + k * 1.7;
      const sc = 1.15 - rank * 0.17;
      const m = new THREE.Group();
      m.position.set(x, 2.7, -0.9);
      g.add(m);
      const mat = lightMat(BL_COL, 1.2);
      put(m, mats().cyl, mat, 0, -0.9 * sc, 0, 0.5 * sc, 0.85 * sc, 0.5 * sc);
      put(m, mats().oct, glowMat(0xffffff, 1.2), 0, -1.55 * sc, 0, 0.1, 0.1, 0.1);
      put(g, mats().ring, lightMat(BL_COL, 0.8), x, 0.03, 0, 0.7, 1, 0.7);
      const e = hitTarget(s.x + x, s.z - 0.9, 0.6, 1.6, L('Sino', 'Bell'));
      return { rank, x, m, mat, e, hits: 0, sw: 0, lit: false };
    });
    return { kind: 'bells', x: s.x, z: s.z, g, list, st: 'idle', next: 0 };
  },
  update(E, dt) {
    for (const b of E.list) {
      b.sw = Math.max(0, b.sw - dt);
      b.m.rotation.z = Math.sin(G.t * 14) * b.sw * 0.4;
    }
    if (E.st === 'idle' && near(E, 8)) E.st = 'run';
    if (E.st !== 'run') return;
    // golpe em área que pega o sino certo e um vizinho no mesmo quadro: vale o certo (antes desafinava).
    // Sino já aceso só balança: bater de novo nele não desafina
    const rung = E.list.filter((b) => hitsOf(b) > 0);
    for (const q of rung) q.sw = 1.2;
    const want = rung.find((b) => b.rank === E.next);
    const wrong = rung.find((b) => !b.lit);
    for (const b of want ? [want] : wrong ? [wrong] : []) {
      if (b.rank === E.next) {
        setLight(b.mat, 0x39ff88, 2.2);
        b.lit = true;
        E.next++;
        sfx.pickup();
        floatText(E.x + b.x, 2.2, E.z - 0.9, `${E.next}/5`, 'up');
        if (E.next >= 5) {
          for (const q of E.list) dropTarget({ e: q.e });
          sfx.legendary();
          complete(E, 1.2, L('AFINADO!', 'IN TUNE!'), L('Do grave ao agudo', 'Low to high'), E.x, E.z);
          return;
        }
      } else {
        E.next = 0;
        sfx.deny();
        floatText(E.x + b.x, 2.2, E.z - 0.9, L('desafinou!', 'off key!'), 'hurt');
        for (const q of E.list) {
          if (q.lit) {
            q.lit = false;
            setLight(q.mat, BL_COL, 1.2);
          }
        }
        break;
      }
    }
  },
  hud: (E) => (E.st === 'idle' ? L('do grave ao agudo', 'low to high') : `${E.next}/5 ${L('sinos', 'bells')}`),
  dim(E) {
    for (const b of E.list) {
      dropTarget({ e: b.e });
      setLight(b.mat, 0x39ff88, 1.6);
    }
  },
  reload(E) {
    for (const b of E.list) {
      b.e.hp = b.e.maxHp;
      b.hits = 0;
    }
  },
  intro: () => L('5 sinos de tamanhos diferentes. Golpeie do maior (grave) ao menor (agudo). Errou a ordem, desafina e recomeça.', '5 bells of different sizes. Hit them from the biggest (low) to the smallest (high). Wrong order and it goes off key and restarts.'),
});

// ==================================================================
// 47. Plantar Sementes: pegue água no poço e regue as 5 mudas (a praga aparece na metade)
// ==================================================================
const GA_COL = 0x5aff7a;
const garden2 = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 5);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().cyl, mats().metal, 0, 0.3, 0, 0.9, 0.6, 0.9);
    put(g, mats().disc, glowMat(0x39a8ff, 1.4), 0, 0.62, 0, 0.7, 1, 0.7);
    put(g, mats().ring, lightMat(0x39a8ff, 1.2), 0, 0.03, 0, 1.3, 1, 1.3);
    const off = ri(0, 6) * 0.4;
    const plants = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + off;
      const x = Math.cos(a) * 4.1;
      const z = Math.sin(a) * 4.1;
      put(g, mats().cyl, mats().metal, x, 0.12, z, 0.34, 0.24, 0.34);
      const m = put(g, mats().oct, glowMat(0x6a7a55, 0.6), x, 0.38, z, 0.12, 0.2, 0.12);
      put(g, mats().ring, lightMat(GA_COL, 0.7), x, 0.03, z, 0.7, 1, 0.7);
      plants.push({ x, z, m, done: false, gr: 0 });
    }
    const can = new THREE.Group();
    can.visible = false;
    g.add(can);
    put(can, mats().oct, glowMat(0x39a8ff, 2.4), 0, 0, 0, 0.2, 0.26, 0.2);
    return { kind: 'garden2', x: s.x, z: s.z, g, plants, can, foes: [], st: 'idle', water: false, got: 0, plague: false };
  },
  update(E, dt) {
    const p = G.player;
    for (const q of E.plants) {
      if (q.gr > 0 && q.gr < 1) {
        q.gr = Math.min(1, q.gr + dt * 1.2);
        q.m.scale.set(0.12 + q.gr * 0.28, 0.2 + q.gr * 0.9, 0.12 + q.gr * 0.28);
        q.m.position.y = 0.38 + q.gr * 0.9;
      }
    }
    if (E.st === 'idle') {
      if (!near(E, 9)) return;
      E.st = 'run';
    }
    E.foes = E.foes.filter((e) => e.alive);
    E.can.visible = E.water;
    if (E.water) E.can.position.set(p.x - E.x, 2.1 + Math.sin(G.t * 5) * 0.06, p.z - E.z);
    else if (Math.hypot(p.x - E.x, p.z - E.z) < 1.4) {
      E.water = true;
      sfx.pickup();
      floatText(p.x, 2.2, p.z, L('água!', 'water!'), 'up');
    }
    if (E.water) {
      for (const q of E.plants) {
        if (q.done || Math.hypot(p.x - E.x - q.x, p.z - E.z - q.z) > 0.9) continue;
        q.done = true;
        q.gr = 0.01;
        q.m.material = glowMat(GA_COL, 1.6);
        E.water = false;
        E.got++;
        sfx.pickup();
        burst(E.x + q.x, 0.6, E.z + q.z, GA_COL, 18, 4, 0.07, 0.6, { up: 2 });
        floatText(E.x + q.x, 1.8, E.z + q.z, `${E.got}/5`, 'up');
        if (E.got === 3 && !E.plague) {
          E.plague = true;
          ambush(E, 3 + Math.floor(G.floor / 15), E.x, E.z, 6, 9, 0xaaff44);
          toast(L('🐛 Pragas atacam o jardim! Derrote-as.', '🐛 Pests attack the garden! Beat them.'), 'warn');
        }
        break;
      }
    }
    if (E.got >= 5 && !E.foes.length) {
      E.can.visible = false;
      complete(E, 1.2, L('JARDIM FLORIDO!', 'GARDEN IN BLOOM!'), L('5 mudas viraram árvores', '5 saplings grew into trees'), E.x, E.z);
    }
  },
  busy: (E) => E.st === 'run' && E.foes.length > 0,
  hud: (E) => (E.st === 'idle' ? L('regue as mudas', 'water the saplings') : `${E.got}/5 ${L('mudas', 'saplings')}${E.water ? ' · 💧' : ''}${E.foes.length ? ` · ${E.foes.length} ${L('pragas', 'pests')}` : ''}`),
  dim(E) {
    E.can.visible = false;
    for (const q of E.plants) {
      q.m.scale.set(0.4, 1.1, 0.4);
      q.m.position.y = 1.28;
      q.m.material = glowMat(GA_COL, 1.6);
    }
  },
  intro: () => L('encoste no poço para pegar água (uma de cada vez) e leve até uma muda para regar. Regue as 5. Na metade aparecem pragas.', 'touch the well to pick up water (one at a time) and carry it to a sapling. Water all 5. Pests show up halfway.'),
});

// ==================================================================
// 48. Entrega: leve o pacote do ponto A ao ponto B sem tomar dano (se tomar, ele volta ao início)
// ==================================================================
const CO_COL = 0xffa63d;
const courier = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 2);
    if (!s) return null;
    const b = findSpot(d, rooms, 2, 2, [{ x: s.x, z: s.z, r: 13 }]);
    if (!b) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(CO_COL, 1.2), 0, 0.03, 0, 1.2, 1, 1.2);
    const pk = new THREE.Group();
    g.add(pk);
    put(pk, box(0.62, 0.5, 0.62), glowMat(CO_COL, 1.1), 0, 0, 0);
    put(pk, box(0.66, 0.1, 0.66), glowMat(0xffffff, 1.4), 0, 0.08, 0);
    pk.position.set(0, 0.5, 0);
    const g2 = groupAt(b.x, b.z);
    put(g2, mats().ring, lightMat(0x39ff88, 1.4), 0, 0.03, 0, 1.4, 1, 1.4);
    put(g2, mats().cyl, flatMat(0x39ff88, 0.18), 0, 5, 0, 0.18, 10, 0.18);
    put(g2, mats().disc, flatMat(0x39ff88, 0.1), 0, 0.02, 0, 1.3, 1, 1.3);
    return { kind: 'courier', x: s.x, z: s.z, g, pk, bx: b.x, bz: b.z, pts: [{ x: b.x, z: b.z }], foes: [], st: 'idle', lastHp: 0, spawned: false, cd: 0 };
  },
  update(E, dt) {
    const p = G.player;
    E.foes = E.foes.filter((e) => e.alive);
    if (E.st === 'idle') {
      E.pk.position.y = 0.5 + Math.sin(G.t * 2) * 0.1;
      E.pk.rotation.y += dt;
      E.cd -= dt;
      if (E.cd > 0 || Math.hypot(p.x - E.x, p.z - E.z) > 1.4) return;
      E.st = 'carry';
      E.lastHp = p.hp;
      sfx.pickup();
      banner(L('ENTREGA!', 'DELIVERY!'), L('Leve até o pilar verde sem tomar dano', 'Take it to the green pillar without taking damage'));
      if (!E.spawned) {
        E.spawned = true;
        ambush(E, 2 + (G.floor >= 15 ? 1 : 0), (E.x + E.bx) / 2, (E.z + E.bz) / 2, 2, 5, CO_COL);
      }
      return;
    }
    E.pk.position.set(p.x - E.x, 2.1 + Math.sin(G.t * 5) * 0.06, p.z - E.z);
    E.pk.rotation.y += dt * 2;
    if (p.hp < E.lastHp - 0.5) {
      E.st = 'idle';
      E.cd = 1.5;
      E.pk.position.set(0, 0.5, 0);
      sfx.deny();
      floatText(p.x, 2.4, p.z, L('PACOTE CAIU!', 'PACKAGE DROPPED!'), 'hurt');
      toast(L('📦 Você tomou dano e o pacote voltou ao início. Desvie ou derrote os inimigos!', '📦 You took damage and the package went back to the start. Dodge or beat the enemies!'), 'warn');
      return;
    }
    E.lastHp = p.hp;
    if (Math.hypot(p.x - E.bx, p.z - E.bz) < 1.5) {
      E.pk.visible = false;
      complete(E, 1.3, L('ENTREGUE!', 'DELIVERED!'), L('Sem um arranhão', 'Not a scratch'), E.bx, E.bz);
    }
  },
  busy: (E) => E.st === 'carry',
  hud: (E) => (E.st === 'idle' ? L('pegue o pacote', 'grab the package') : `${L('entregue', 'deliver')}: ${Math.round(Math.hypot(G.player.x - E.bx, G.player.z - E.bz))}m`),
  dim(E) {
    E.pk.visible = false;
  },
  intro: () => L('pegue o pacote neste círculo e leve até o pilar verde. Se tomar qualquer dano o pacote volta para cá (dash e teleporte ajudam). Inimigos vigiam o caminho.', 'grab the package in this circle and take it to the green pillar. Any damage sends it back here (dash and teleport help). Enemies watch the way.'),
});

// ==================================================================
// 49. Caça-Fantasmas: os fantasmas só aparecem dentro da luz da lanterna. Lute no círculo e derrote todos
// ==================================================================
const GH_COL = 0x9ad7ff;
const GH_R = 5.6;
const ghosthunt = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 5);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, box(0.14, 2.2, 0.14), mats().metal, 0, 1.1, 0);
    put(g, mats().oct, glowMat(0xfff2a8, 3), 0, 2.4, 0, 0.3, 0.4, 0.3);
    put(g, mats().ring, lightMat(0xfff2a8, 1.3), 0, 0.03, 0, GH_R, 1, GH_R);
    put(g, mats().disc, flatMat(0xfff2a8, 0.1), 0, 0.02, 0, GH_R, 1, GH_R);
    return { kind: 'ghosthunt', x: s.x, z: s.z, g, foes: [], st: 'idle' };
  },
  update(E) {
    if (E.st === 'idle') {
      if (!near(E, 10)) return;
      E.st = 'run';
      ambush(E, 5 + (G.floor >= 20 ? 1 : 0), E.x, E.z, 8, 12, GH_COL, { hp: 0.8, name: L('Fantasma', 'Ghost') });
      banner(L('CAÇA-FANTASMAS!', 'GHOSTBUSTERS!'), L('Eles só aparecem na luz da lanterna', 'They only show in the lantern light'));
      sfx.explode();
    }
    E.foes = E.foes.filter((e) => e.alive);
    for (const f of E.foes) f.model.root.visible = Math.hypot(f.x - E.x, f.z - E.z) < GH_R;
    if (!E.foes.length) complete(E, 1.3, L('SEM FANTASMAS!', 'GHOST-FREE!'), L('A lanterna os revelou', 'The lantern revealed them'), E.x, E.z);
  },
  busy: (E) => E.st === 'run',
  hud: (E) => (E.st === 'idle' ? L('ache a lanterna', 'find the lantern') : `${E.foes.length} ${L('fantasmas', 'ghosts')}`),
  dim() {},
  intro: () => L('a lanterna revela fantasmas só dentro do círculo de luz; fora dele eles ficam invisíveis. Lute dentro do círculo e derrote todos.', 'the lantern reveals ghosts only inside its circle of light; outside it they are invisible. Fight inside the circle and beat them all.'),
});

// ==================================================================
// 50. Piñata Gigante: bata nela; a cada 3 golpes ela solta prêmios e foge. 12 golpes no total
// ==================================================================
const PI_COL = 0xff6ad5;
const PI_HITS = 12;
const pinata = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 5);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    put(g, mats().ring, lightMat(PI_COL, 0.7), 0, 0.03, 0, 5.2, 1, 5.2);
    const m = new THREE.Group();
    g.add(m);
    [0xff6ad5, 0xffd23d, 0x39d0ff].forEach((c, i) => put(m, box(1.1 - i * 0.12, 0.45, 0.8), glowMat(c, 1.5), 0, 0.5 + i * 0.45, 0));
    put(m, box(0.3, 0.3, 0.3), glowMat(0xffffff, 1.6), 0.3, 1.85, 0);
    const e = hitTarget(s.x, s.z, 0.9, 1.6, L('Piñata Gigante', 'Giant Piñata'), 0.35);
    return { kind: 'pinata', x: s.x, z: s.z, g, m, e, hits: 0, st: 'idle', n: 0, ph: 0, lx: 0, lz: 0, tx: 0, tz: 0, ft: 0, wob: 0 };
  },
  update(E, dt) {
    E.wob = Math.max(0, E.wob - dt * 3);
    E.m.scale.setScalar(1 + E.wob * 0.25);
    E.m.rotation.y += dt * (E.st === 'flee' ? 6 : 0.8);
    E.m.position.set(E.lx, E.st === 'flee' ? Math.abs(Math.sin(G.t * 12)) * 0.3 : 0, E.lz);
    E.e.x = E.x + E.lx;
    E.e.z = E.z + E.lz;
    const hit = hitsOf(E);
    if (E.st === 'flee') {
      E.ft -= dt;
      const dx = E.tx - E.lx;
      const dz = E.tz - E.lz;
      const l = Math.hypot(dx, dz);
      if (l > 0.3) {
        const nx = E.lx + (dx / l) * 5 * dt;
        const nz = E.lz + (dz / l) * 5 * dt;
        if (isWalkable(G.dungeon, E.x + nx, E.z + nz)) {
          E.lx = nx;
          E.lz = nz;
        } else E.ft = 0;
      } else E.ft = 0;
      if (E.ft <= 0) E.st = 'run';
      return;
    }
    if (!hit) {
      if (E.st === 'idle' && near(E, 9)) E.st = 'run';
      return;
    }
    E.st = 'run';
    E.n += hit;
    E.ph += hit;
    E.wob = 1;
    sfx.explode();
    burst(E.x + E.lx, 1.2, E.z + E.lz, PI_COL, 16, 5, 0.08, 0.6, { up: 2 });
    floatText(E.x + E.lx, 2.2, E.z + E.lz, `${Math.min(E.n, PI_HITS)}/${PI_HITS}`, 'crit');
    if (E.n >= PI_HITS) {
      dropTarget(E);
      for (let k = 0; k < 6; k++) spawnPickup('credits', E.x + E.lx + (k - 2.5) * 0.4, E.z + E.lz, { amount: Math.max(1, Math.round(eventCredits(0.06))) });
      complete(E, 1.3, L('CHUVA DE PRÊMIOS!', 'PRIZE SHOWER!'), L('A piñata estourou', 'The piñata burst'), E.x + E.lx, E.z + E.lz, { extra: true });
      return;
    }
    if (E.ph >= 3) {
      E.ph = 0;
      for (let k = 0; k < 4; k++) spawnPickup('credits', E.x + E.lx + (k - 1.5) * 0.4, E.z + E.lz, { amount: Math.max(1, Math.round(eventCredits(0.05))) });
      floatText(E.x + E.lx, 2.8, E.z + E.lz, L('PRÊMIOS!', 'PRIZES!'), 'up');
      for (let t = 0; t < 8; t++) {
        const a = Math.random() * Math.PI * 2;
        const tx = Math.cos(a) * 4.5;
        const tz = Math.sin(a) * 4.5;
        if (isWalkable(G.dungeon, E.x + tx, E.z + tz)) {
          E.tx = tx;
          E.tz = tz;
          E.st = 'flee';
          E.ft = 2.4;
          break;
        }
      }
    }
  },
  hud: (E) => (E.st === 'idle' ? L('bata na piñata', 'hit the piñata') : `${Math.min(E.n, PI_HITS)}/${PI_HITS} ${L('golpes', 'hits')}`),
  dim(E) {
    dropTarget(E);
    E.m.visible = false;
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('uma piñata gigante! Bata nela: a cada 3 golpes ela solta moedas e sai correndo. Estoure com 12 golpes.', 'a giant piñata! Hit it: every 3 hits it drops coins and runs off. Burst it with 12 hits.'),
});

// ==================================================================
// 52. Altar dos Elementos: leve cada orbe (fogo, gelo, raio) até a tocha da mesma cor
// ==================================================================
const EL_COL = [0xff5a2d, 0x39d0ff, 0xffe23d];
const elements = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 5, 4.4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const torches = shuffle([0, 1, 2]).map((c, i) => {
      const x = (i - 1) * 3.2;
      const z = -3.4;
      put(g, mats().cyl, mats().metal, x, 0.6, z, 0.28, 1.2, 0.28);
      put(g, mats().cyl, mats().dark, x, 1.3, z, 0.55, 0.25, 0.55);
      put(g, mats().ring, lightMat(EL_COL[c], 1.2), x, 0.03, z, 0.9, 1, 0.9);
      const flame = put(g, mats().oct, glowMat(EL_COL[c], 2.8), x, 1.9, z, 0.3, 0.5, 0.3);
      flame.visible = false;
      return { x, z, c, flame, lit: false };
    });
    const sources = shuffle([0, 1, 2]).map((c, i) => {
      const x = (i - 1) * 3.2;
      const z = 3.4;
      put(g, mats().cyl, mats().metal, x, 0.25, z, 0.55, 0.5, 0.55);
      put(g, mats().ring, lightMat(EL_COL[c], 1), x, 0.03, z, 0.9, 1, 0.9);
      const orb = put(g, mats().oct, glowMat(EL_COL[c], 2.6), x, 0.95, z, 0.28, 0.38, 0.28);
      return { x, z, c, orb, used: false };
    });
    const carry = EL_COL.map((c) => {
      const m = put(g, mats().oct, glowMat(c, 2.8), 0, 2.2, 0, 0.22, 0.3, 0.22);
      m.visible = false;
      return m;
    });
    return { kind: 'elements', x: s.x, z: s.z, g, torches, sources, carry, foes: [], st: 'idle', held: -1, lit: 0 };
  },
  update(E, dt) {
    const p = G.player;
    for (const so of E.sources) if (!so.used && so.orb.visible) so.orb.rotation.y += dt * 2;
    if (E.st === 'idle') {
      if (!near(E, 9)) return;
      E.st = 'run';
    }
    E.foes = E.foes.filter((e) => e.alive);
    E.carry.forEach((m, i) => {
      m.visible = E.held >= 0 && E.sources[E.held].c === i;
      if (m.visible) m.position.set(p.x - E.x, 2.2 + Math.sin(G.t * 5) * 0.06, p.z - E.z);
    });
    if (E.held < 0) {
      E.sources.forEach((so, i) => {
        if (E.held >= 0 || so.used || Math.hypot(p.x - E.x - so.x, p.z - E.z - so.z) > 1.2) return;
        E.held = i;
        so.orb.visible = false;
        sfx.pickup();
        if (E.foes.length < 4) ambush(E, 1, E.x + so.x, E.z + so.z, 3, 5, EL_COL[so.c]);
      });
    } else {
      const so = E.sources[E.held];
      for (const t of E.torches) {
        if (t.lit || Math.hypot(p.x - E.x - t.x, p.z - E.z - t.z) > 1.3) continue;
        if (t.c === so.c) {
          t.lit = true;
          t.flame.visible = true;
          so.used = true;
          E.held = -1;
          E.lit++;
          sfx.pickup();
          burst(E.x + t.x, 1.8, E.z + t.z, EL_COL[t.c], 20, 5, 0.08, 0.7, { up: 2 });
          ringFx(E.x + t.x, E.z + t.z, 1.4, EL_COL[t.c], 0.4);
        } else {
          so.orb.visible = true;
          E.held = -1;
          sfx.deny();
          floatText(p.x, 2.4, p.z, L('elemento errado!', 'wrong element!'), 'hurt');
          eventHurt(0.1, E.x + t.x, E.z + t.z, 5);
        }
        break;
      }
    }
    if (E.lit >= 3) {
      E.carry.forEach((m) => (m.visible = false));
      complete(E, 1.2, L('ELEMENTOS EM EQUILÍBRIO!', 'ELEMENTS IN BALANCE!'), L('As 3 tochas acesas', 'All 3 torches lit'), E.x, E.z);
    }
  },
  hud: (E) => (E.st === 'idle' ? L('leve as orbes às tochas', 'carry the orbs to the torches') : `${E.lit}/3 ${L('tochas', 'torches')}${E.held >= 0 ? ' · ✦' : ''}`),
  dim(E) {
    for (const m of E.carry) m.visible = false;
    for (const t of E.torches) t.flame.visible = true;
    for (const so of E.sources) so.orb.visible = false;
  },
  intro: () => L('3 orbes (fogo, gelo, raio) numa ponta e 3 tochas na outra. Encoste numa orbe para carregá-la e leve até a tocha da mesma cor. Errou, toma um choque.', '3 orbs (fire, ice, lightning) on one end and 3 torches on the other. Touch an orb to carry it and take it to the torch of the same color. Get it wrong and you get shocked.'),
});

// ==================================================================
// 53. Cobra de Luz: seu rastro de luz cresce a cada orbe; pegue 8 sem encostar nele (3 vidas)
// ==================================================================
const SN_COL = 0x7dff3d;
const SN_HX = 5;
const SN_HZ = 3.8;
const SN_N = 8;
const snake = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, SN_HX + 0.3, SN_HZ + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, SN_HX, SN_HZ, lightMat(SN_COL, 0.8));
    put(g, box(SN_HX * 2, 0.02, SN_HZ * 2), flatMat(SN_COL, 0.05), 0, 0.02, 0);
    const mat = lightMat(SN_COL, 1.2);
    const pool = [];
    for (let i = 0; i < 30; i++) {
      const m = put(g, mats().disc, mat, 0, 0.06, 0, 0.3, 1, 0.3);
      m.visible = false;
      pool.push(m);
    }
    const orb = put(g, mats().oct, glowMat(0xffd23d, 2.4), 0, 0.7, 0, 0.25, 0.35, 0.25);
    orb.visible = false;
    return { kind: 'snake', x: s.x, z: s.z, g, pool, orb, pts: [], got: 0, lives: 3, ox: 0, oz: 0, st: 'idle' };
  },
  newOrb(E) {
    for (let t = 0; t < 14; t++) {
      const x = (Math.random() * 2 - 1) * (SN_HX - 0.9);
      const z = (Math.random() * 2 - 1) * (SN_HZ - 0.9);
      if (E.pts.every((q) => Math.hypot(q.x - x, q.z - z) > 1.4)) {
        E.ox = x;
        E.oz = z;
        break;
      }
    }
    E.orb.position.set(E.ox, 0.7, E.oz);
  },
  update(E, dt) {
    const p = G.player;
    E.orb.rotation.y += dt * 3;
    if (E.st === 'idle') {
      if (!inRect(E, SN_HX, SN_HZ)) return;
      E.st = 'run';
      E.orb.visible = true;
      snake.newOrb(E);
      banner(L('COBRA DE LUZ!', 'LIGHT SNAKE!'), L('Pegue as orbes sem tocar no seu rastro', 'Grab the orbs without touching your trail'));
    }
    const inside = inRect(E, SN_HX, SN_HZ);
    if (inside) {
      const lx = p.x - E.x;
      const lz = p.z - E.z;
      const last = E.pts[E.pts.length - 1];
      if (!last || Math.hypot(last.x - lx, last.z - lz) > 0.7) E.pts.push({ x: lx, z: lz });
      const len = Math.min(28, 6 + E.got * 3);
      while (E.pts.length > len) E.pts.shift();
      for (let i = 0; i < E.pts.length - 6; i++) {
        if (Math.hypot(E.pts[i].x - lx, E.pts[i].z - lz) > 0.5) continue;
        E.lives--;
        E.pts.length = 0;
        sfx.deny();
        burst(p.x, 0.8, p.z, 0xff3355, 18, 5, 0.08, 0.5, { up: 1 });
        floatText(p.x, 2, p.z, L('encostou!', 'touched!'), 'hurt');
        if (E.lives <= 0) {
          E.orb.visible = false;
          failed(E, L('Você se enroscou no próprio rastro 3 vezes.', 'You tangled in your own trail 3 times.'));
          return;
        }
        break;
      }
      if (Math.hypot(lx - E.ox, lz - E.oz) < 0.9) {
        E.got++;
        sfx.pickup();
        floatText(p.x, 2, p.z, `${E.got}/${SN_N}`, 'up');
        burst(E.x + E.ox, 0.8, E.z + E.oz, 0xffd23d, 16, 4, 0.07, 0.6, { up: 2 });
        if (E.got >= SN_N) {
          E.orb.visible = false;
          complete(E, 1.2, L('COBRA GIGANTE!', 'GIANT SNAKE!'), L('Sem se enroscar', 'Without tangling'), E.x, E.z);
          return;
        }
        snake.newOrb(E);
      }
    }
    const n = E.pts.length;
    E.pool.forEach((m, i) => {
      m.visible = i < n;
      if (i < n) {
        m.position.set(E.pts[i].x, 0.06, E.pts[i].z);
        m.scale.setScalar(0.15 + 0.3 * ((i + 1) / n));
      }
    });
  },
  hud: (E) => (E.st === 'idle' ? L('entre na arena', 'enter the arena') : `${E.got}/${SN_N} · ♥${E.lives}`),
  dim(E) {
    E.orb.visible = false;
    for (const m of E.pool) m.visible = false;
  },
  intro: () => L('dentro da arena você deixa um rastro de luz que cresce a cada orbe. Pegue 8 orbes sem encostar no próprio rastro. 3 toques e acabou.', 'inside the arena you leave a light trail that grows with every orb. Grab 8 orbs without touching your own trail. 3 touches and it ends.'),
});

// ==================================================================
// 54. Campo Minado: pise nos ladrilhos para revelar o número de minas vizinhas e chegue à faixa verde
// ==================================================================
const MN_T = 1.4;
const MN_C = 5;
const MN_R = 6;
const mines = mk({
  setup(d, floor, rooms) {
    const hx = (MN_C * MN_T) / 2;
    const hz = (MN_R * MN_T) / 2;
    const s = findSpot(d, rooms, hx + 0.3, hz + 0.3);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    // no máximo 2 minas por fileira (do meio), então sempre existe caminho
    const mine = Array.from({ length: MN_R }, () => Array(MN_C).fill(false));
    let total = 0;
    for (let r = 1; r < MN_R - 1; r++) {
      const n = r === 1 || r === MN_R - 2 ? 1 : 2;
      for (const c of shuffle([0, 1, 2, 3, 4]).slice(0, n)) {
        mine[r][c] = true;
        total++;
      }
    }
    const tiles = [];
    for (let r = 0; r < MN_R; r++) {
      for (let c = 0; c < MN_C; c++) {
        const x = (c - (MN_C - 1) / 2) * MN_T;
        const z = ((MN_R - 1) / 2 - r) * MN_T;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (mine[r + dr] && mine[r + dr][c + dc]) n++;
        const mat = lightMat(r === MN_R - 1 ? 0x39ff88 : r === 0 ? 0x39d0ff : 0x3a4258, r === 0 || r === MN_R - 1 ? 0.5 : 0.7);
        put(g, box(MN_T - 0.12, 0.05, MN_T - 0.12), mat, x, 0.04, z);
        tiles.push({ x, z, r, c, mine: mine[r][c], n, rev: false, mat });
      }
    }
    return { kind: 'mines', x: s.x, z: s.z, g, tiles, hx, hz, total, st: 'idle', boom: 0 };
  },
  update(E) {
    const p = G.player;
    if (E.st === 'idle') {
      if (!near(E, Math.max(E.hx, E.hz) + 5)) return;
      E.st = 'run';
    }
    for (const t of E.tiles) {
      if (t.rev || Math.abs(p.x - E.x - t.x) > MN_T / 2 || Math.abs(p.z - E.z - t.z) > MN_T / 2) continue;
      t.rev = true;
      if (t.mine) {
        E.boom++;
        setLight(t.mat, 0xff3355, 1.8);
        burst(E.x + t.x, 0.6, E.z + t.z, 0xff5a3d, 24, 6, 0.09, 0.6, { up: 3 });
        ringFx(E.x + t.x, E.z + t.z, 1.8, 0xff3355, 0.4);
        sfx.explode();
        floatText(E.x + t.x, 1.6, E.z + t.z, '💥', 'hurt');
        eventHurt(0.2, E.x + t.x, E.z + t.z, 7);
        continue;
      }
      setLight(t.mat, t.n ? 0x39a8ff : 0x39ff88, 1);
      if (t.n) label(E.g, String(t.n), t.n > 2 ? 0xff5a3d : t.n > 1 ? 0xffd23d : 0xffffff, t.x, 0.9, t.z, 0.9);
      sfx.click();
      if (t.r === MN_R - 1) {
        complete(E, 1.2, L('CAMPO LIMPO!', 'FIELD CLEARED!'), L('Atravessou sem pisar demais', 'Crossed the minefield'), E.x + t.x, E.z + t.z);
        return;
      }
    }
  },
  hud: (E) => (E.st === 'idle' ? L('atravesse o campo', 'cross the field') : `${E.total} ${L('minas', 'mines')} · ${E.boom} 💥`),
  dim(E) {
    for (const t of E.tiles) {
      t.rev = true;
      setLight(t.mat, t.mine ? 0xff3355 : 0x39ff88, 0.8);
    }
  },
  intro: () => L('ladrilhos escondem 6 minas. Pisar em um ladrilho revela quantas minas há ao redor. Atravesse do azul até a faixa verde. Mina machuca e empurra.', 'tiles hide 6 mines. Stepping on a tile reveals how many mines are around it. Cross from the blue strip to the green one. Mines hurt and knock you back.'),
});

// ==================================================================
// 55. Cabo de Guerra: golpeie o robô para puxar a corda para o seu lado antes que ele ganhe força
// ==================================================================
const TG_COL = 0xff9a3d;
const tug = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.6, 2.2);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, 4.5, 2.1, lightMat(TG_COL, 0.6));
    put(g, mats().beam, lightMat(0xc9a36b, 1), 0, 0.9, 0, 6.4, 3, 3);
    put(g, mats().cyl, mats().metal, -3.4, 0.9, 0, 0.2, 1.8, 0.2);
    put(g, mats().ring, lightMat(0x39ff88, 1.3), -3.4, 0.03, 0, 1.1, 1, 1.1);
    put(g, mats().ring, lightMat(0xff3355, 1.3), 3.4, 0.03, 0, 1.1, 1, 1.1);
    const flag = put(g, box(0.08, 0.5, 0.5), glowMat(TG_COL, 2.2), 0, 1.5, 0);
    const bot = new THREE.Group();
    g.add(bot);
    put(bot, box(0.5, 0.6, 0.4), mats().metal, -0.2, 0.3, 0);
    put(bot, box(0.5, 0.6, 0.4), mats().metal, 0.2, 0.3, 0);
    put(bot, box(1.0, 0.9, 0.7), mats().metal, 0, 1.05, 0);
    put(bot, box(0.55, 0.45, 0.5), mats().metal, 0, 1.7, 0);
    put(bot, box(0.4, 0.1, 0.06), glowMat(0xff3355, 2.6), 0, 1.72, -0.27);
    bot.position.set(3.4, 0, 0);
    bot.rotation.y = -Math.PI / 2;
    const e = hitTarget(s.x + 3.4, s.z, 0.9, 1.7, L('Robô', 'Robot'), 0.27);
    return { kind: 'tug', x: s.x, z: s.z, g, flag, bot, e, hits: 0, pos: 0, t: 0, wob: 0, nt: 9, foes: [], st: 'idle' };
  },
  update(E, dt) {
    E.wob = Math.max(0, E.wob - dt * 4);
    E.flag.position.x = -E.pos * 2.8;
    const bx = 3.4 - E.pos * 1.2;
    E.bot.position.set(bx + Math.sin(G.t * 40) * E.wob * 0.08, 0, 0);
    E.e.x = E.x + bx;
    const n = hitsOf(E);
    if (E.st === 'idle') {
      if (!near(E, 7)) return;
      E.st = 'run';
      banner(L('CABO DE GUERRA!', 'TUG OF WAR!'), L('Golpeie o robô sem parar', 'Keep hitting the robot'));
      return;
    }
    E.foes = E.foes.filter((e) => e.alive);
    E.t += dt;
    if (n) {
      E.pos += n * 0.085;
      E.wob = 1;
      sfx.click();
    }
    E.pos -= Math.min(0.22, 0.1 + E.t * 0.0025) * dt;
    E.nt -= dt;
    if (E.nt <= 0 && E.foes.length < 3) {
      E.nt = 13;
      ambush(E, 1, E.x, E.z, 4, 7, TG_COL);
    }
    if (E.pos >= 1) {
      dropTarget(E);
      sfx.legendary();
      complete(E, 1.2, L('PUXOU!', 'PULLED!'), L('O robô veio junto', 'The robot came along'), E.x, E.z);
    } else if (E.pos <= -1) {
      dropTarget(E);
      failed(E, L('O robô puxou a corda para o lado dele.', 'The robot pulled the rope to its side.'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('golpeie o robô', 'hit the robot') : `${L('corda', 'rope')} ${Math.round(((E.pos + 1) / 2) * 100)}%`),
  dim(E) {
    dropTarget(E);
  },
  reload(E) {
    E.e.hp = E.e.maxHp;
    E.hits = 0;
  },
  intro: () => L('um robô puxa a corda. Cada golpe nele puxa a corda para o seu lado, mas ele ganha força com o tempo. Leve a bandeira até a ponta verde.', 'a robot pulls the rope. Every hit on it pulls the rope to your side, but it gets stronger over time. Take the flag to the green end.'),
});

// ==================================================================
// 56. Faróis (com relógio): acenda os 4 faróis golpeando; cada um se apaga depois de um tempo
// ==================================================================
const BE_COL = 0xffa63d;
const BE_T = 50;
const BE_BURN = 10;
const beacon = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4.7);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const list = [[-3.7, -3.7], [3.7, -3.7], [3.7, 3.7], [-3.7, 3.7]].map(([x, z]) => {
      put(g, mats().cyl, mats().metal, x, 0.9, z, 0.22, 1.8, 0.22);
      put(g, mats().ring, lightMat(BE_COL, 0.8), x, 0.03, z, 0.9, 1, 0.9);
      const mat = lightMat(0x3a2a18, 0.6);
      put(g, mats().oct, mat, x, 2.1, z, 0.34, 0.46, 0.34);
      return { x, z, mat, l: 0, e: hitTarget(s.x + x, s.z + z, 0.7, 1.9, L('Farol', 'Beacon')), hits: 0 };
    });
    return { kind: 'beacon', x: s.x, z: s.z, g, list, foes: [], st: 'idle', t: BE_T, nt: 12 };
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 9)) return;
      E.st = 'run';
      banner(L('ACENDA OS FARÓIS!', 'LIGHT THE BEACONS!'), L(`Os 4 acesos ao mesmo tempo em ${BE_T}s`, `All 4 lit at the same time in ${BE_T}s`));
    }
    E.foes = E.foes.filter((e) => e.alive);
    E.t -= dt;
    let lit = 0;
    for (const b of E.list) {
      if (hitsOf(b)) {
        b.l = BE_BURN;
        sfx.pickup();
        burst(E.x + b.x, 2.1, E.z + b.z, BE_COL, 14, 4, 0.07, 0.5, { up: 2 });
      }
      b.l = Math.max(0, b.l - dt);
      if (b.l > 0) {
        lit++;
        setLight(b.mat, b.l < 3 && Math.floor(G.t * 6) % 2 ? 0xff5a3d : BE_COL, 2.4);
      } else setLight(b.mat, 0x3a2a18, 0.6);
    }
    E.nt -= dt;
    if (E.nt <= 0 && E.foes.length < 3) {
      E.nt = 14;
      ambush(E, 1 + (G.floor >= 25 ? 1 : 0), E.x, E.z, 5, 8, BE_COL);
    }
    if (lit >= 4) {
      for (const b of E.list) dropTarget(b);
      sfx.legendary();
      complete(E, 1.5, L('TUDO ILUMINADO!', 'ALL LIT UP!'), L('Os 4 faróis juntos', 'All 4 beacons together'), E.x, E.z, { extra: true });
    } else if (E.t <= 0) {
      for (const b of E.list) dropTarget(b);
      failed(E, L('A escuridão apagou os faróis.', 'The darkness put the beacons out.'));
    }
  },
  busy: (E) => E.st === 'run',
  hud: (E) => (E.st === 'idle' ? L('acenda os 4 faróis', 'light the 4 beacons') : `⏱ ${mmss(E.t)} · ${E.list.filter((b) => b.l > 0).length}/4`),
  dim(E) {
    for (const b of E.list) {
      dropTarget(b);
      setLight(b.mat, BE_COL, 1.6);
    }
  },
  reload(E) {
    for (const b of E.list) {
      b.e.hp = b.e.maxHp;
      b.hits = 0;
    }
  },
  intro: () => L('4 faróis nos cantos. Golpeie cada um para acender, mas cada luz se apaga depois de 10s. Mantenha os 4 acesos ao mesmo tempo antes que o tempo acabe.', '4 beacons in the corners. Hit each one to light it, but every light dies after 10s. Keep all 4 lit at the same time before time runs out.'),
});

// ==================================================================
// 57. Malabares (com relógio): 3 bolas no ar; golpeie cada uma quando ela estiver descendo (3 quedas e acabou)
// ==================================================================
const JG_COL = [0xffd23d, 0x39d0ff, 0xff4df0];
const JG_T = 32;
const JG_CYC = 2.8;
const JG_H = 2.6;
const juggle = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.8);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const balls = JG_COL.map((c, i) => {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * 2.5;
      const z = Math.sin(a) * 2.5;
      const ring = lightMat(c, 0.8);
      put(g, mats().ring, ring, x, 0.03, z, 0.8, 1, 0.8);
      const m = put(g, mats().oct, glowMat(c, 2.4), x, 0.4, z, 0.3, 0.3, 0.3);
      return { x, z, m, ring, c, p: i * 0.33, e: hitTarget(s.x + x, s.z + z, 0.8, 1.5, L('Bola', 'Ball')), hits: 0 };
    });
    return { kind: 'juggle', x: s.x, z: s.z, g, balls, st: 'idle', t: JG_T, lives: 3, catches: 0 };
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 6)) return;
      E.st = 'run';
      banner(L('MALABARES!', 'JUGGLING!'), L(`Mantenha as 3 bolas no ar por ${JG_T}s`, `Keep the 3 balls in the air for ${JG_T}s`));
    }
    E.t -= dt;
    for (const b of E.balls) {
      b.p += dt / JG_CYC;
      const win = b.p >= 0.62;
      b.m.position.y = 0.4 + 4 * JG_H * b.p * (1 - b.p);
      b.m.rotation.y += dt * 4;
      setLight(b.ring, win ? 0x39ff88 : b.c, win ? 1.8 : 0.8);
      if (hitsOf(b)) {
        if (win) {
          b.p = 0;
          E.catches++;
          sfx.pickup();
          floatText(E.x + b.x, 2.4, E.z + b.z, '↑', 'up');
        } else floatText(E.x + b.x, 2.4, E.z + b.z, L('cedo!', 'early!'), 'hurt');
      }
      if (b.p >= 1) {
        b.p = 0;
        E.lives--;
        sfx.deny();
        burst(E.x + b.x, 0.5, E.z + b.z, 0xff3355, 14, 4, 0.07, 0.5, { up: 1 });
        floatText(E.x + b.x, 1.5, E.z + b.z, L('caiu!', 'dropped!'), 'hurt');
      }
    }
    if (E.lives <= 0) {
      for (const b of E.balls) dropTarget(b);
      failed(E, L('As bolas caíram 3 vezes.', 'The balls dropped 3 times.'));
    } else if (E.t <= 0) {
      for (const b of E.balls) dropTarget(b);
      complete(E, 1.3, L('MALABARISTA!', 'JUGGLER!'), L(`${E.catches} defesas`, `${E.catches} catches`), E.x, E.z);
    }
  },
  busy: (E) => E.st === 'run',
  hud: (E) => (E.st === 'idle' ? L('chegue perto das bolas', 'get near the balls') : `⏱ ${mmss(E.t)} · ♥${E.lives}`),
  dim(E) {
    for (const b of E.balls) {
      dropTarget(b);
      b.m.position.y = 0.4;
    }
  },
  reload(E) {
    for (const b of E.balls) {
      b.e.hp = b.e.maxHp;
      b.hits = 0;
    }
  },
  intro: () => L('3 bolas sobem e descem. Quando o anel do chão ficar verde (a bola está descendo), golpeie a bola para lançar de novo. 3 quedas e acabou. Aguente 32s.', '3 balls go up and down. When the ring on the floor turns green (the ball is coming down), hit the ball to launch it again. 3 drops and it ends. Last 32s.'),
});

// ==================================================================
// 58. Escultura: memorize os 5 blocos dourados e quebre só eles (3 erros e acabou)
// ==================================================================
const SCU_COL = 0xffd23d;
const sculpt = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 3.4, 2.7);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    frame(g, 3.3, 2.6, lightMat(SCU_COL, 0.6));
    const marked = new Set(shuffle(Array.from({ length: 12 }, (_, i) => i)).slice(0, 5));
    const blocks = [];
    for (let i = 0; i < 12; i++) {
      const x = ((i % 4) - 1.5) * 1.6;
      const z = (Math.floor(i / 4) - 1) * 1.6;
      const m = new THREE.Group();
      m.position.set(x, 0, z);
      g.add(m);
      put(m, box(1.2, 1.1, 1.2), mats().metal, 0, 0.55, 0);
      const mat = lightMat(0x5a6a8a, 0.8);
      put(m, box(1.0, 0.06, 1.0), mat, 0, 1.12, 0);
      blocks.push({ x, z, m, mat, mark: marked.has(i), gone: false, e: hitTarget(s.x + x, s.z + z, 0.7, 1.2, L('Bloco', 'Block')), hits: 0 });
    }
    return { kind: 'sculpt', x: s.x, z: s.z, g, blocks, foes: [], st: 'idle', show: 0, strikes: 0, broke: 0 };
  },
  paint(E) {
    const on = E.show > 0 && !E.wait;
    for (const b of E.blocks) if (!b.gone) setLight(b.mat, b.mark && on ? SCU_COL : 0x5a6a8a, b.mark && on ? 2.4 : 0.8);
  },
  // blocos travados: golpes (de área, da briga) não contam
  lock(E) {
    for (const b of E.blocks) {
      if (b.gone) continue;
      b.e.hp = b.e.maxHp;
      b.hits = 0;
    }
  },
  update(E, dt) {
    if (E.st === 'idle') {
      if (!near(E, 8)) return;
      // com inimigos por perto os dourados só acendem depois da briga
      if (waitFoes(E)) {
        sculpt.lock(E);
        return;
      }
      E.st = 'run';
      E.show = 5;
      sculpt.paint(E);
      banner(L('MEMORIZE!', 'MEMORIZE!'), L('Os 5 blocos dourados são os certos', 'The 5 golden blocks are the right ones'));
    }
    E.foes = E.foes.filter((e) => e.alive);
    // inimigo por perto: blocos travados e dourados apagados. Quando a área limpa eles acendem de novo:
    // 5s inteiros se a briga cortou a amostra, 2s de lembrete se já tinham apagado
    const wait = waitFoes(E);
    if (wait !== !!E.wait) {
      E.wait = wait;
      if (wait) E.pend = E.show > 0 ? 5 : 2;
      else E.show = Math.max(E.show, E.pend || 0);
      sculpt.paint(E);
    }
    if (wait) {
      sculpt.lock(E);
      return;
    }
    if (E.show > 0) {
      E.show -= dt;
      if (E.show <= 0) sculpt.paint(E);
    }
    for (const b of E.blocks) {
      if (b.gone || !hitsOf(b)) continue;
      b.gone = true;
      b.m.visible = false;
      dropTarget(b);
      burst(E.x + b.x, 0.8, E.z + b.z, b.mark ? SCU_COL : 0xff3355, 22, 5, 0.08, 0.6, { up: 2 });
      if (b.mark) {
        E.broke++;
        sfx.pickup();
        floatText(E.x + b.x, 1.8, E.z + b.z, `${E.broke}/5`, 'up');
      } else {
        E.strikes++;
        sfx.deny();
        floatText(E.x + b.x, 1.8, E.z + b.z, L('errado!', 'wrong!'), 'hurt');
        E.show = 1.6;
        sculpt.paint(E);
        if (E.foes.length < 4) ambush(E, 1, E.x, E.z, 4, 6, 0xff3355);
      }
    }
    if (E.broke >= 5) {
      complete(E, 1.2, L('OBRA-PRIMA!', 'MASTERPIECE!'), L('Só os blocos certos', 'Only the right blocks'), E.x, E.z);
    } else if (E.strikes >= 3) {
      for (const b of E.blocks) dropTarget(b);
      failed(E, L('Você quebrou 3 blocos errados.', 'You broke 3 wrong blocks.'));
    }
  },
  hud: (E) => (E.st === 'idle' ? L('quebre só os dourados', 'break only the golden ones') : `${E.broke}/5 · ${E.strikes}/3 ${L('erros', 'miss')}${E.show > 0 ? ' · 👁' : ''}`),
  dim(E) {
    for (const b of E.blocks) {
      dropTarget(b);
      if (!b.mark) b.m.visible = true;
      else b.m.visible = false;
    }
  },
  reload(E) {
    for (const b of E.blocks) {
      b.e.hp = b.e.maxHp;
      b.hits = 0;
    }
  },
  intro: () => L('12 blocos; 5 deles brilham em dourado por 5 segundos. Depois todos ficam iguais: golpeie só os 5 certos. Errar mostra os dourados de novo. 3 erros e acabou.', '12 blocks; 5 of them glow gold for 5 seconds. Then they all look the same: hit only the 5 right ones. A mistake shows the golden ones again. 3 mistakes and it ends.'),
});

// ==================================================================
// 59. Portais Pareados: cada orbe está presa num círculo; entre no portal de fora que tem a mesma cor do portal de dentro
// ==================================================================
const PO_COL = [0xff4466, 0x39ff88, 0x39a8ff];
const PO_CR = 1.5;
const portal = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 5.6);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const perm = shuffle([0, 1, 2]);
    // gaiolas nos 3 cantos, com o portal de volta e a orbe
    const cages = [0, 1, 2].map((k) => {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
      const cx = Math.cos(a) * 3.9;
      const cz = Math.sin(a) * 3.9;
      const ux = -Math.cos(a);
      const uz = -Math.sin(a);
      put(g, mats().ring, lightMat(0xffffff, 0.9), cx, 0.03, cz, PO_CR, 1, PO_CR);
      put(g, mats().disc, flatMat(PO_COL[k], 0.1), cx, 0.02, cz, PO_CR, 1, PO_CR);
      const px = cx + ux * 0.85;
      const pz = cz + uz * 0.85;
      put(g, mats().ring, lightMat(PO_COL[k], 1.5), px, 0.03, pz, 0.5, 1, 0.5);
      put(g, mats().disc, flatMat(PO_COL[k], 0.35), px, 0.03, pz, 0.45, 1, 0.45);
      const ox = cx - ux * 0.3;
      const oz = cz - uz * 0.3;
      const orb = put(g, mats().oct, glowMat(0xffd23d, 2.6), ox, 0.8, oz, 0.25, 0.35, 0.25);
      // chegada: ao lado da orbe, fora do portal de volta
      return { cx, cz, px, pz, ox, oz, ax: cx - uz * 0.9, az: cz + ux * 0.9, orb, got: false };
    });
    // portais de fora: perm[j] diz para qual gaiola o portal j leva
    const outs = perm.map((k, j) => {
      const a = Math.PI / 6 + (j * Math.PI * 2) / 3 + 0.0;
      const x = Math.cos(a) * 1.6;
      const z = Math.sin(a) * 1.6;
      put(g, mats().ring, lightMat(PO_COL[k], 1.5), x, 0.03, z, 0.5, 1, 0.5);
      put(g, mats().disc, flatMat(PO_COL[k], 0.35), x, 0.03, z, 0.45, 1, 0.45);
      return { x, z, k };
    });
    return { kind: 'portal', x: s.x, z: s.z, g, cages, outs, foes: [], st: 'idle', inside: -1, cd: 0, got: 0 };
  },
  update(E, dt) {
    const p = G.player;
    for (const c of E.cages) if (!c.got) c.orb.rotation.y += dt * 2;
    if (E.st === 'idle') {
      if (!near(E, 9)) return;
      E.st = 'run';
    }
    E.foes = E.foes.filter((e) => e.alive);
    E.cd -= dt;
    const lx = p.x - E.x;
    const lz = p.z - E.z;
    // barreira dos círculos: só entra quem usou o portal
    E.cages.forEach((c, k) => {
      const dx = lx - c.cx;
      const dz = lz - c.cz;
      const dd = Math.hypot(dx, dz);
      if (E.inside === k) {
        if (dd > PO_CR + 0.5) E.inside = -1;
      } else if (dd < PO_CR) {
        p.x = E.x + c.cx + (dx / (dd || 1)) * PO_CR;
        p.z = E.z + c.cz + (dz / (dd || 1)) * PO_CR;
      }
    });
    const tele = (x, z, col, k) => {
      burst(p.x, 0.8, p.z, col, 18, 5, 0.08, 0.5, { up: 2 });
      p.x = E.x + x;
      p.z = E.z + z;
      E.inside = k;
      E.cd = 1;
      sfx.teleport ? sfx.teleport() : sfx.pickup();
      ringFx(p.x, p.z, 1.4, col, 0.4);
    };
    if (E.cd <= 0) {
      for (const o of E.outs) {
        if (E.inside >= 0 || Math.hypot(lx - o.x, lz - o.z) > 0.7) continue;
        const c = E.cages[o.k];
        tele(c.ax, c.az, PO_COL[o.k], o.k);
        return;
      }
      if (E.inside >= 0) {
        const c = E.cages[E.inside];
        if (Math.hypot(lx - c.px, lz - c.pz) < 0.6) {
          const o = E.outs.find((q) => q.k === E.inside);
          tele(o.x + 0.9, o.z, PO_COL[E.inside], -1);
          return;
        }
      }
    }
    if (E.inside >= 0) {
      const c = E.cages[E.inside];
      if (!c.got && Math.hypot(lx - c.ox, lz - c.oz) < 1.1) {
        c.got = true;
        c.orb.visible = false;
        E.got++;
        sfx.pickup();
        floatText(p.x, 2.2, p.z, `${E.got}/3`, 'up');
        if (E.got < 3) ambush(E, 1, E.x + c.cx, E.z + c.cz, 3, 5, PO_COL[E.inside]);
      }
    }
    if (E.got >= 3) complete(E, 1.2, L('PAR PERFEITO!', 'PERFECT PAIRS!'), L('As 3 orbes resgatadas', 'All 3 orbs rescued'), E.x, E.z);
  },
  hud: (E) => (E.st === 'idle' ? L('ache os pares de portais', 'find the portal pairs') : `${E.got}/3 ${L('orbes', 'orbs')}`),
  dim(E) {
    for (const c of E.cages) c.orb.visible = false;
  },
  intro: () => L('3 orbes presas em círculos que ninguém atravessa. O portal colorido dentro do círculo tem um par do lado de fora: entre no par certo, pegue a orbe e volte pelo portal de dentro.', '3 orbs trapped in circles nobody can cross. The colored portal inside each circle has a twin outside: step on the right twin, grab the orb and come back through the inside portal.'),
});

// ==================================================================
// 60. Rei da Colina (com relógio): fique na colina somando pontos; se houver inimigo nela, os pontos param
// ==================================================================
const KG_R = 3;
const KG_T = 70;
const KG_N = 22;
const king = mk({
  setup(d, floor, rooms) {
    const s = findSpot(d, rooms, 4);
    if (!s) return null;
    const g = groupAt(s.x, s.z);
    const ring = lightMat(0xffffff, 1.3);
    put(g, mats().ring, ring, 0, 0.04, 0, KG_R, 1, KG_R);
    const fill = flatMat(0xffffff, 0.1);
    put(g, mats().disc, fill, 0, 0.03, 0, KG_R, 1, KG_R);
    put(g, box(0.2, 1.6, 0.2), mats().metal, 0, 0.8, 0);
    put(g, mats().oct, glowMat(0xffd23d, 2.6), 0, 1.9, 0, 0.3, 0.4, 0.3);
    return { kind: 'king', x: s.x, z: s.z, g, ring, fill, foes: [], st: 'idle', t: KG_T, pts: 0, nt: 0, hold: 0 };
  },
  update(E, dt) {
    const p = G.player;
    if (E.st === 'idle') {
      if (!near(E, 10)) return;
      E.st = 'run';
      banner(L('REI DA COLINA!', 'KING OF THE HILL!'), L(`${KG_N}s na colina em ${KG_T}s`, `${KG_N}s on the hill within ${KG_T}s`));
    }
    E.foes = E.foes.filter((e) => e.alive);
    E.t -= dt;
    E.nt -= dt;
    if (E.nt <= 0 && E.foes.length < 6) {
      E.nt = 9;
      ambush(E, 2 + (G.floor >= 25 ? 1 : 0), E.x, E.z, 6, 9, 0xffd23d);
    }
    const inHill = Math.hypot(p.x - E.x, p.z - E.z) < KG_R;
    const foeIn = E.foes.some((f) => Math.hypot(f.x - E.x, f.z - E.z) < KG_R + 0.3);
    E.hold = foeIn ? -1 : inHill ? 1 : 0;
    if (E.hold > 0) E.pts += dt;
    const col = E.hold > 0 ? 0x39ff88 : E.hold < 0 ? 0xff3355 : 0xffffff;
    setLight(E.ring, col, 1.3);
    E.fill.color.setHex(col);
    if (E.pts >= KG_N) {
      for (const f of E.foes) killQuiet(f);
      sfx.legendary();
      complete(E, 1.4, L('REI DA COLINA!', 'KING OF THE HILL!'), L('Ninguém tirou você de lá', 'Nobody moved you off'), E.x, E.z, { extra: true });
    } else if (E.t <= 0) {
      for (const f of E.foes) killQuiet(f);
      failed(E, L('O tempo acabou antes de você reinar.', 'Time ran out before you could rule.'));
    }
  },
  busy: (E) => E.st === 'run',
  hud: (E) => (E.st === 'idle' ? L('suba na colina', 'climb the hill') : `⏱ ${mmss(E.t)} · ${Math.floor(E.pts)}/${KG_N}${E.hold < 0 ? ' ⚠' : ''}`),
  dim() {},
  intro: () => L('fique dentro da colina para somar pontos (verde). Se um inimigo entrar nela os pontos param (vermelho): expulse-o. Junte 22s antes que o tempo acabe.', 'stay inside the hill to score (green). If an enemy enters it the points stop (red): drive it out. Collect 22s before time runs out.'),
});

// ------------------------------------------------------------------
// Registro (events.js lê estas tabelas)
// ------------------------------------------------------------------
// eventos com relógio entre os novos (só um deles por andar, junto com os de events.js)
export const NEW_TIMED = ['bounty2', 'beacon', 'juggle', 'king'];
export const NEW_KIND = { sokoban, pipes, piano, scale, maze, bridge, paint: paintFloor, hide, statues, cannon, golem, fishing, dominos, bounty2, tower, bells, garden2, courier, ghosthunt, pinata, elements, snake, mines, tug, beacon, juggle, sculpt, portal, king };
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
  golem: { icon: '🤖', css: '#7dffb0', name: L('Golem de Peças', 'Parts Golem'), short: L('Golem', 'Golem') },
  fishing: { icon: '🎣', css: '#39d0ff', name: L('Pesca de Dados', 'Data Fishing'), short: L('Pesca', 'Fishing') },
  dominos: { icon: '🁣', css: '#ff8a3d', name: L('Dominós', 'Dominoes'), short: L('Dominós', 'Dominoes') },
  bounty2: { icon: '🎯', css: '#ff4df0', name: L('Caçada em Dupla', 'Double Hunt'), short: L('Dupla', 'Pair') },
  tower: { icon: '🗼', css: '#5affd2', name: L('Torre de Defesa', 'Tower Defense'), short: L('Torre', 'Tower') },
  bells: { icon: '🔔', css: '#ffd23d', name: L('Sinos Afinados', 'Tuned Bells'), short: L('Sinos', 'Bells') },
  garden2: { icon: '🌱', css: '#5aff7a', name: L('Plantar Sementes', 'Plant Seeds'), short: L('Mudas', 'Saplings') },
  courier: { icon: '📦', css: '#ffa63d', name: L('Entrega', 'Delivery'), short: L('Entrega', 'Delivery') },
  ghosthunt: { icon: '👻', css: '#9ad7ff', name: L('Caça-Fantasmas', 'Ghost Hunt'), short: L('Fantasmas', 'Ghosts') },
  pinata: { icon: '🪅', css: '#ff6ad5', name: L('Piñata Gigante', 'Giant Piñata'), short: L('Piñata', 'Piñata') },
  elements: { icon: '🔥', css: '#ff5a2d', name: L('Altar dos Elementos', 'Elements Altar'), short: L('Elementos', 'Elements') },
  snake: { icon: '🐍', css: '#7dff3d', name: L('Cobra de Luz', 'Light Snake'), short: L('Cobra', 'Snake') },
  mines: { icon: '💣', css: '#ff5a3d', name: L('Campo Minado', 'Minefield'), short: L('Minas', 'Mines') },
  tug: { icon: '🪢', css: '#ff9a3d', name: L('Cabo de Guerra', 'Tug of War'), short: L('Cabo', 'Tug') },
  beacon: { icon: '🏮', css: '#ffa63d', name: L('Faróis', 'Beacons'), short: L('Faróis', 'Beacons') },
  juggle: { icon: '🤹', css: '#ff4df0', name: L('Malabares', 'Juggling'), short: L('Malabares', 'Juggling') },
  sculpt: { icon: '🗿', css: '#ffd23d', name: L('Escultura', 'Sculpture'), short: L('Escultura', 'Sculpture') },
  portal: { icon: '🌀', css: '#39a8ff', name: L('Portais Pareados', 'Paired Portals'), short: L('Portais', 'Portals') },
  king: { icon: '👑', css: '#ffd23d', name: L('Rei da Colina', 'King of the Hill'), short: L('Colina', 'Hill') },
};
