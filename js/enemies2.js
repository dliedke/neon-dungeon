// Fase E: os 15 inimigos novos. IA extra (aiNew), ganchos de dano (preDamage / postDamage),
// reflexo de tiros do Drone Espelho, tinta do Polvo Neon e animações extras (tickVisual).
// Os dados ficam em ETYPES (enemies.js) e os modelos em newEnemyModel (models.js).
// Atenção: imports circulares com enemies.js / combat.js; nada daqui roda no topo do módulo.
import { G } from './state.js';
import { rr, chance } from './utils.js';
import { isWalkable } from './dungeon.js';
import { spawnProjectile, damagePlayer, after, spawnHazard, lob } from './combat.js';
import { burst, ringFx, telegraphFx, floatText, beamFx } from './fx.js';
import { sfx } from './audio.js';
import { L } from './i18n.js';
import { toast } from './ui.js';
import { spawnEnemy, enemyShoot, meleeHit } from './enemies.js';

const hinted = {};
function hint(key, pt, en) {
  if (hinted[key]) return;
  hinted[key] = true;
  toast(L(pt, en), 'warn');
}

// ---------------- auxiliares ----------------
// mantém distância, rondando o jogador (igual ao 'ranged')
function kite(e, c, kmin, kmax) {
  e.strafeT -= c.edt;
  if (e.strafeT <= 0) {
    e.strafeT = rr(1.2, 2.8);
    e.strafe *= -1;
  }
  if (!e.los || c.dist > kmax) {
    const k = c.chase();
    if (k) { c.mvx = k.x; c.mvz = k.z; }
  } else if (c.dist < kmin) {
    c.mvx = -c.ux;
    c.mvz = -c.uz;
    c.speed *= 0.8;
  } else {
    c.mvx = -c.uz * e.strafe;
    c.mvz = c.ux * e.strafe;
    c.speed *= 0.5;
  }
}

// corpo a corpo com golpe avisado (igual ao 'melee')
function meleeStep(e, c) {
  if (e.windup > 0) {
    e.windup -= c.edt;
    c.speed = 0;
    if (e.windup <= 0) {
      e.swing = 1;
      if (c.tgt === c.p && c.dist < e.T.range + e.r + c.p.r + 0.35) meleeHit(e, e.dmg);
      e.atkT = e.T.atkCd * e.atkCdMult;
    }
  } else if (c.dist < e.T.range + e.r + c.p.r) {
    if (e.atkT <= 0) e.windup = 0.3;
  } else {
    const k = c.chase();
    if (k) { c.mvx = k.x; c.mvz = k.z; }
  }
}

// tiro de um ponto qualquer na direção de um alvo
function shootFrom(e, x, z, tx, tz) {
  const T = e.T;
  const a = Math.atan2(tz - z, tx - x);
  spawnProjectile({ from: 'enemy', x: x + Math.cos(a) * 0.4, z: z + Math.sin(a) * 0.4, y: 1.1, dx: Math.cos(a), dz: Math.sin(a), speed: T.proj.speed, life: 2.2, dmg: e.dmg, color: T.proj.color, size: T.proj.size, r: 0.16 });
  sfx.enemyShot();
}

export function inkPlayer(t) {
  const first = !(G.inkT > 0);
  G.inkT = Math.max(G.inkT || 0, t);
  if (first) floatText(G.player.x, 2.2, G.player.z, L('CEGO!', 'BLINDED!'), 'hurt');
}

// ---------------- IA ----------------
// c: contexto reutilizado (sem alocação por quadro); devolve true se tratou o tipo
export function aiNew(e, c) {
  const T = e.T;
  const p = c.p;
  const tgt = c.tgt;
  const { edt, dist, ux, uz } = c;
  const d = G.dungeon;
  c.fx = ux;
  c.fz = uz;
  switch (T.ai) {
    case 'mirrord': {
      // Drone Espelho: atira e, de tempos em tempos, liga o escudo-espelho que devolve os tiros
      kite(e, c, T.keep[0], T.keep[1]);
      if (e.mirrorT > 0) {
        e.mirrorT -= edt;
        c.speed *= 0.5;
      } else if (e.mirW > 0) {
        e.mirW -= edt;
        c.speed = 0;
        if (e.mirW <= 0) {
          e.mirrorT = 2.2;
          e.mirCd = rr(5, 7);
          ringFx(e.x, e.z, 1.2, 0xbdf2ff, 0.3, { from: 0.4 });
          sfx.zap();
        }
      } else {
        e.mirCd = (e.mirCd ?? rr(1, 3)) - edt;
        if (e.mirCd <= 0 && e.los && dist < T.range + 3) {
          e.mirW = 0.6;
          ringFx(e.x, e.z, 1.5, 0xbdf2ff, 0.6, { from: 0.3 });
          floatText(e.x, e.height + 0.6, e.z, L('ESPELHO!', 'MIRROR!'), 'shield');
          sfx.telegraph();
        } else if (e.los && dist < T.range && e.atkT <= 0) {
          e.atkT = T.atkCd * e.atkCdMult * rr(0.85, 1.15);
          for (let k = 0; k < 2; k++) after(k * 0.15, () => { if (e.alive) enemyShoot(e, G.player.x - e.x, G.player.z - e.z, rr(-0.05, 0.05)); });
        }
      }
      return true;
    }
    case 'grav': {
      // Gravitador: avisa, puxa o jogador para perto e esmaga com um pulso
      if (e.gravW > 0) {
        e.gravW -= edt;
        c.speed = 0;
        if (e.gravW <= 0) e.gravT = 1.6;
      } else if (e.gravT > 0) {
        e.gravT -= edt;
        c.speed *= 0.3;
        const ex = p.x - e.x;
        const ez = p.z - e.z;
        const l = Math.hypot(ex, ez) || 1;
        if (l < T.range + 2 && l > 1.4) {
          p.kx = (p.kx || 0) - (ex / l) * 30 * edt;
          p.kz = (p.kz || 0) - (ez / l) * 30 * edt;
        }
        e.beamT = (e.beamT || 0) - edt;
        if (e.beamT <= 0 && l < T.range + 2) {
          e.beamT = 0.12;
          beamFx(e.x, 1.2, e.z, p.x, 1, p.z, 0xb36bff, 0.12, 3);
        }
        if (e.gravT <= 0) {
          ringFx(e.x, e.z, 2.4, 0xb36bff, 0.4, { from: 0.5 });
          if (l < 2.4 + p.r) damagePlayer(e.dmg);
          burst(e.x, 1.2, e.z, 0xb36bff, 18, 5, 0.08, 0.4);
          e.atkT = T.atkCd * e.atkCdMult * rr(0.9, 1.1);
          sfx.zap();
        }
      } else {
        kite(e, c, T.keep[0], T.keep[1]);
        if (e.los && dist < T.range && e.atkT <= 0) {
          e.gravW = 0.7;
          telegraphFx(e.x, e.z, 2.4, 2.3, 0xb36bff);
          floatText(e.x, e.height + 0.6, e.z, L('GRAVIDADE!', 'GRAVITY!'), 'hurt');
          sfx.telegraph();
          hint('grav', 'O Gravitador puxa você para perto: corra para fora do círculo ou use um dash!', 'The Gravitator pulls you in: run out of the circle or dash!');
        }
      }
      return true;
    }
    case 'build': {
      // Construtor: atira e ergue muros de luz que queimam quem passa
      kite(e, c, T.keep[0], T.keep[1]);
      if (e.los && dist < T.range && e.atkT <= 0) {
        e.atkT = T.atkCd * e.atkCdMult * rr(0.85, 1.15);
        enemyShoot(e, tgt.x - e.x, tgt.z - e.z, rr(-0.05, 0.05));
        e.swing = 1;
      }
      e.buildT = (e.buildT ?? rr(2, 4)) - edt;
      if (e.buildT <= 0 && e.los && dist > 3 && dist < 12) {
        e.buildT = rr(7, 9);
        buildWall(e, tgt);
      }
      return true;
    }
    case 'swarm': {
      // Enxame Mosca: voa em zigue-zague e morde
      e.wob = (e.wob || 0) + edt * 6;
      const k = c.chase() || { x: ux, z: uz };
      const w = Math.sin(e.wob + e.phase) * 0.9;
      c.mvx = k.x - k.z * w;
      c.mvz = k.z + k.x * w;
      if (dist < e.r + p.r + 0.35 && e.atkT <= 0 && tgt === p) {
        e.atkT = T.atkCd;
        meleeHit(e, e.dmg);
        e.swing = 1;
      }
      c.fx = c.mvx;
      c.fz = c.mvz;
      return true;
    }
    case 'ink': {
      // Polvo Neon: alterna jato de tinta (cega a tela) e tiro
      kite(e, c, T.keep[0], T.keep[1]);
      if (e.los && dist < T.range && e.atkT <= 0) {
        e.atkT = T.atkCd * e.atkCdMult * rr(0.9, 1.1);
        e.inkN = (e.inkN || 0) + 1;
        if (e.inkN % 2) {
          const tx = tgt.x;
          const tz = tgt.z;
          telegraphFx(tx, tz, 1.5, 0.8, 0x8a3aff);
          lob({ x: e.x, z: e.z, tx, tz, time: 0.8, color: 0x8a3aff, onLand: (x, z) => {
            spawnHazard(x, z, 1.5, 3, e.dmg * 0.4, { color: 0x4a1a8a });
            const pl = G.player;
            if (Math.hypot(pl.x - x, pl.z - z) < 1.5 + pl.r) {
              inkPlayer(3.5);
              hint('ink', 'O Polvo Neon solta tinta que cega a tela por alguns segundos: saia do círculo!', 'The Neon Octopus spits ink that blinds the screen for a few seconds: leave the circle!');
            }
          } });
        } else enemyShoot(e, tgt.x - e.x, tgt.z - e.z, rr(-0.05, 0.05));
        e.swing = 1;
      }
      return true;
    }
    case 'clock': {
      // Autômato de Corda: para para dar corda e depois corre e ataca muito mais rápido
      if (e.ckWind > 0) {
        e.ckWind -= edt;
        c.speed = 0;
        if (e.ckWind <= 0) {
          e.ckRush = 4;
          ringFx(e.x, e.z, 1.6, 0xffb84a, 0.4, { from: 0.3 });
          floatText(e.x, e.height + 0.6, e.z, L('ACELERADO!', 'WOUND UP!'), 'hurt');
          sfx.zap();
        }
      } else {
        if (e.ckRush > 0) {
          e.ckRush -= edt;
          c.speed *= 1.9;
          e.atkT -= edt * 0.7;
          if (Math.random() < edt * 12) burst(e.x, e.height * 0.8, e.z, 0xffb84a, 1, 1.2, 0.06, 0.3, { grav: -2 });
        } else {
          e.ckT = (e.ckT ?? rr(2, 4)) - edt;
          if (e.ckT <= 0 && dist < 11 && !(e.windup > 0)) {
            e.ckWind = 0.9;
            e.ckT = rr(6, 8);
            ringFx(e.x, e.z, 1.2, 0xffb84a, 0.9, { from: 0.2 });
            floatText(e.x, e.height + 0.6, e.z, L('DANDO CORDA...', 'WINDING UP...'), 'shield');
            sfx.telegraph();
          }
        }
        meleeStep(e, c);
      }
      return true;
    }
    case 'echo': {
      // Espectro de Reflexo: cada tiro sai dele e também do lado oposto do jogador
      kite(e, c, T.keep[0], T.keep[1]);
      if (e.los && dist < T.range && e.atkT <= 0) {
        e.atkT = T.atkCd * e.atkCdMult * rr(0.9, 1.1);
        const mx = 2 * tgt.x - e.x;
        const mz = 2 * tgt.z - e.z;
        const ok = isWalkable(d, mx, mz);
        ringFx(e.x, e.z, 0.9, 0xb36bff, 0.5, { from: 0.2 });
        if (ok) ringFx(mx, mz, 0.9, 0xb36bff, 0.5, { from: 0.2 });
        sfx.telegraph();
        after(0.5, () => {
          if (!e.alive) return;
          const pl = G.player;
          shootFrom(e, e.x, e.z, pl.x, pl.z);
          if (ok) {
            burst(mx, 1, mz, 0xb36bff, 8, 3, 0.06, 0.3);
            shootFrom(e, mx, mz, pl.x, pl.z);
          }
        });
        e.swing = 1;
      }
      return true;
    }
    case 'pinball': {
      // Bola de Pinball: rola reta, quica nas paredes (e em você) e puxa um pouco para o jogador
      if (e.pdx === undefined) {
        const a = Math.atan2(c.dz, c.dx) + rr(-0.6, 0.6);
        e.pdx = Math.cos(a);
        e.pdz = Math.sin(a);
      }
      const sx = e.x + e.pdx * 0.6;
      const sz = e.z + e.pdz * 0.6;
      if (!isWalkable(d, sx, sz)) {
        const okx = isWalkable(d, sx, e.z);
        const okz = isWalkable(d, e.x, sz);
        if (!okx || (okx && okz)) e.pdx = -e.pdx;
        if (!okz || (okx && okz)) e.pdz = -e.pdz;
        pinballAim(e, ux, uz, 0.35);
        burst(e.x, 0.5, e.z, 0xff2bd6, 5, 3, 0.05, 0.3);
        sfx.hit();
      }
      e.hitCd = (e.hitCd || 0) - edt;
      if (tgt === p && dist < e.r + p.r + 0.2 && e.hitCd <= 0) {
        e.hitCd = 0.9;
        meleeHit(e, e.dmg);
        p.kx = (p.kx || 0) - ux * 9;
        p.kz = (p.kz || 0) - uz * 9;
        e.pdx = -ux;
        e.pdz = -uz;
        pinballAim(e, ux, uz, 0);
        burst(e.x, 0.5, e.z, 0x00f0ff, 10, 4, 0.06, 0.3);
      }
      c.mvx = e.pdx;
      c.mvz = e.pdz;
      c.fx = e.pdx;
      c.fz = e.pdz;
      return true;
    }
    case 'storm': {
      // Elemental de Raio: marca 3 pontos no chão e derruba raios
      kite(e, c, T.keep[0], T.keep[1]);
      if (e.los && dist < T.range && e.atkT <= 0) {
        e.atkT = T.atkCd * e.atkCdMult * rr(0.9, 1.1);
        for (let k = 0; k < 3; k++) {
          const a = rr(0, Math.PI * 2);
          const r = k === 0 ? 0 : rr(1.5, 3);
          const tx = tgt.x + Math.cos(a) * r;
          const tz = tgt.z + Math.sin(a) * r;
          if (!isWalkable(d, tx, tz)) continue;
          const dl = 1.0 + k * 0.25;
          telegraphFx(tx, tz, 1.1, dl, 0xffe84a);
          after(dl, () => {
            if (!e.alive) return;
            beamFx(tx, 9, tz, tx, 0, tz, 0xffffaa, 0.25, 6);
            burst(tx, 0.4, tz, 0xffe84a, 14, 5, 0.07, 0.4);
            ringFx(tx, tz, 1.1, 0xffe84a, 0.3, { from: 0.4 });
            sfx.zap();
            const pl = G.player;
            if (Math.hypot(pl.x - tx, pl.z - tz) < 1.1 + pl.r) damagePlayer(e.dmg);
          });
        }
        sfx.telegraph();
        e.swing = 1;
      }
      return true;
    }
    case 'samurai': {
      // Samurai de Bambu: levanta a guarda; golpe em guarda levantada é defendido e vira contra-ataque
      if (e.parryW > 0) {
        e.parryW -= edt;
        c.speed = 0;
        if (e.parryW <= 0) e.parry = 1.0;
      } else if (e.parry > 0) {
        e.parry -= edt;
        c.speed = 0;
        if (e.parry <= 0) e.parryCd = 3.5;
        else if (Math.random() < edt * 8) burst(e.x, 1, e.z, 0x7affc8, 1, 1.5, 0.05, 0.3, { grav: 0 });
      } else {
        e.parryCd = (e.parryCd ?? rr(1.5, 3)) - edt;
        if (e.parryCd <= 0 && dist < 5 && e.los && !(e.windup > 0)) {
          e.parryW = 0.4;
          ringFx(e.x, e.z, 1.3, 0x7affc8, 0.4, { from: 0.2 });
          floatText(e.x, e.height + 0.6, e.z, L('GUARDA!', 'GUARD!'), 'shield');
          sfx.telegraph();
          hint('samurai', 'O Samurai levanta a guarda e contra-ataca quem bate nela: espere a guarda baixar!', 'The Samurai raises his guard and counters whoever hits it: wait for the guard to drop!');
        } else meleeStep(e, c);
      }
      return true;
    }
  }
  return false;
}

function pinballAim(e, ux, uz, k) {
  // mistura a direção atual com a direção do jogador
  let x = e.pdx * (1 - k) + ux * k;
  let z = e.pdz * (1 - k) + uz * k;
  const l = Math.hypot(x, z) || 1;
  x /= l;
  z /= l;
  e.pdx = x;
  e.pdz = z;
}

// muro de luz: 5 postes de perigo perpendiculares à linha entre o construtor e o alvo
function buildWall(e, tgt) {
  const d = G.dungeon;
  const dx = tgt.x - e.x;
  const dz = tgt.z - e.z;
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const cx = e.x + ux * Math.max(2, l * 0.55);
  const cz = e.z + uz * Math.max(2, l * 0.55);
  floatText(e.x, e.height + 0.6, e.z, L('MURO DE LUZ!', 'LIGHT WALL!'), 'shield');
  sfx.telegraph();
  for (let k = -2; k <= 2; k++) {
    const x = cx - uz * k * 1.2;
    const z = cz + ux * k * 1.2;
    if (!isWalkable(d, x, z)) continue;
    telegraphFx(x, z, 0.75, 0.8, 0x39ffd8);
    after(0.8, () => {
      if (!e.alive) return;
      spawnHazard(x, z, 0.75, 7, e.dmg * 0.6, { color: 0x39ffd8 });
    });
  }
}

// ---------------- ganchos de dano ----------------
// devolve o dano que passa (0 = defendido)
export function preDamage(e, amount, o) {
  if (e.parry > 0 && !o.dot) {
    const p = G.player;
    const near = Math.hypot(p.x - e.x, p.z - e.z) < 5;
    floatText(e.x, e.height + 0.6, e.z, near ? L('CONTRA-ATAQUE!', 'COUNTER!') : L('DEFENDIDO', 'PARRIED'), 'shield');
    burst(e.x, 1, e.z, 0x7affc8, 8, 4, 0.06, 0.3);
    sfx.shieldBlock();
    if (near) {
      beamFx(e.x, 1, e.z, p.x, 1, p.z, 0xe8fff4, 0.2, 3);
      meleeHit(e, e.dmg * 1.5);
      e.parry = 0;
      e.parryCd = 5;
      e.stun = 0.7; // depois do contra-ataque fica aberto
    }
    return 0;
  }
  return amount;
}

// depois de tomar dano: o Enxame Mosca se divide uma vez
export function postDamage(e) {
  if (e.T.split && !e.splitDone && e.hp > 0) {
    e.splitDone = true;
    for (let k = 0; k < 2; k++) {
      const c = spawnEnemy(e.type, e.x + rr(-0.5, 0.5), e.z + rr(-0.5, 0.5));
      c.splitDone = true;
      c.maxHp = c.hp = e.maxHp * 0.4;
      c.dmg = e.dmg * 0.7;
      c.xp = 0;
      c.aggro = true;
      c.r *= 0.8;
      c.model.root.scale.setScalar(0.75);
    }
    burst(e.x, 1.4, e.z, 0x9dff3a, 12, 4, 0.06, 0.4);
    floatText(e.x, e.height + 0.5, e.z, L('SE DIVIDIU!', 'SPLIT!'), 'hurt');
  }
}

// tiro do jogador contra o Drone Espelho com o escudo ligado: devolve o tiro
export function reflectShot(e, pr) {
  if (!(e.mirrorT > 0)) return false;
  pr.alive = false;
  const p = G.player;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const l = Math.hypot(dx, dz) || 1;
  spawnProjectile({ from: 'enemy', x: e.x + (dx / l) * 0.7, z: e.z + (dz / l) * 0.7, y: 1.1, dx: dx / l, dz: dz / l, speed: 11, life: 2, dmg: e.dmg * 1.2, color: 0xbdf2ff, size: 0.16, r: 0.18 });
  burst(e.x, 1.1, e.z, 0xbdf2ff, 8, 4, 0.06, 0.3);
  ringFx(e.x, e.z, 0.9, 0xbdf2ff, 0.25);
  sfx.shieldBlock();
  if (chance(0.4)) floatText(e.x, e.height + 0.5, e.z, L('REFLETIDO', 'REFLECTED'), 'shield');
  hint('mirror', 'O Drone Espelho devolve seus tiros enquanto brilha: ataque de perto ou espere o escudo cair!', 'The Mirror Drone throws your shots back while it glows: attack up close or wait for the shield to drop!');
  return true;
}

// roubo de buff (Ceifador de Dados): tira um bônus ativo do jogador e se cura
export function stealBuff(e) {
  const b = G.player.buffs;
  if (!b) return;
  const ks = Object.keys(b).filter((k) => b[k] > 0 && k !== 'regen');
  if (!ks.length) return;
  const k = ks[Math.floor(Math.random() * ks.length)];
  delete b[k];
  e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15);
  floatText(G.player.x, 2.3, G.player.z, L('BÔNUS ROUBADO!', 'BUFF STOLEN!'), 'hurt');
  beamFx(G.player.x, 1.2, G.player.z, e.x, 1.2, e.z, 0xff2bd6, 0.3, 4);
  hint('steal', 'O Ceifador de Dados rouba seus bônus ativos: mate-o antes de usar os melhores!', 'The Data Reaper steals your active buffs: kill it before you use the good ones!');
}

// ---------------- global por quadro ----------------
let inkEl = null;
let inkLast = -1;
export function tickExtras(dt) {
  if (G.inkT > 0) G.inkT = Math.max(0, G.inkT - dt);
  const v = Math.min(1, (G.inkT || 0) / 0.8) * 0.82;
  if (Math.abs(v - inkLast) < 0.015 && !(v === 0 && inkLast !== 0)) return;
  if (!inkEl) inkEl = document.getElementById('ink');
  if (inkEl) inkEl.style.opacity = v.toFixed(2);
  inkLast = v;
}

// ---------------- visuais extras ----------------
export function tickVisual(e, m, dt) {
  switch (e.type) {
    case 'mirrordrone':
      m.mirror.visible = e.mirrorT > 0;
      if (e.mirW > 0) m.ring.rotation.z += dt * 10;
      break;
    case 'gravitator':
      m.ring2.rotation.z += dt * (e.gravT > 0 ? 9 : 2);
      break;
    case 'clockautomaton':
      m.key.rotation.z += dt * (e.ckWind > 0 ? 14 : e.ckRush > 0 ? 6 : 1);
      break;
    case 'echo':
      m.shards.rotation.y += dt * 2;
      break;
    case 'pinball':
      m.body.rotation.x += dt * 9 * (e.pdz || 0);
      m.body.rotation.z -= dt * 9 * (e.pdx || 0);
      break;
    case 'neonoctopus':
      m.body.position.y = Math.sin(G.t * 3 + e.phase) * 0.06;
      break;
    case 'bamboosamurai':
      if (e.parry > 0 || e.parryW > 0) {
        m.armR.rotation.x = -1.7;
        m.armL.rotation.x = -1.2;
      }
      break;
    case 'stormelemental':
      if (Math.random() < dt * 2) burst(e.x, 1.1, e.z, 0xffe84a, 3, 2, 0.04, 0.2, { grav: -4 });
      break;
  }
}
