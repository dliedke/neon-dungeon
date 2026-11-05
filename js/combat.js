import { formMods, timeFactor, shieldCatch } from './powers.js';
// Dano, projéteis, explosões, torres e temporizadores.
import * as THREE from 'three';
import { G, gk } from './state.js';
import { rr, chance } from './utils.js';
import { isWalkable, lineOfSight, blocksSight } from './dungeon.js';
import { glowMat, makeTurretModel } from './models.js';
import { burst, floatText, ringFx, beamFx, telegraphFx } from './fx.js';
import { sfx } from './audio.js';
import { dropLoot } from './loot.js';
import { gainXp, playerDie } from './player.js';
import { onEnemyKilled } from './enemies.js';
import { hurtFlash, toast, banner } from './ui.js';
import { L } from './i18n.js';

// ---------------- temporizadores ----------------
export function after(t, fn) {
  G.timers.push({ t, fn });
}
export function updateTimers(dt) {
  const cur = G.timers;
  G.timers = [];
  for (const tm of cur) {
    tm.t -= dt;
    if (tm.t <= 0) tm.fn();
    else G.timers.push(tm);
  }
}

// ---------------- consultas ----------------
export function enemiesInRadius(x, z, r) {
  const out = [];
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < r + e.r) out.push(e);
  }
  return out;
}

export function enemiesInCone(x, z, dx, dz, r, arc) {
  const out = [];
  const half = arc / 2;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const ex = e.x - x;
    const ez = e.z - z;
    const d = Math.hypot(ex, ez);
    if (d > r + e.r) continue;
    if (d < e.r + 0.3) {
      out.push(e);
      continue;
    }
    const cos = (ex * dx + ez * dz) / d;
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const slack = Math.atan2(e.r, d);
    if (ang <= half + slack) out.push(e);
  }
  return out;
}

export function nearestEnemy(x, z, maxD, needLos = true, exclude = null) {
  let best = null;
  let bd = maxD;
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.invulnerable || e === exclude || (exclude && exclude.has && exclude.has(e))) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < bd && (!needLos || lineOfSight(G.dungeon, x, z, e.x, e.z))) {
      bd = d;
      best = e;
    }
  }
  return best;
}

// ---------------- dano no inimigo ----------------
export function playerDamageRoll(mult, forceCrit) {
  const p = G.player;
  const s = p.stats;
  const fm = formMods(p);
  let d = rr(s.wMin, s.wMax) * mult * (1 + s.dmgPct / 100) * (fm ? fm.dmg : 1) * (p.buffs.fury > 0 ? 1.5 : 1);
  let crit = false;
  if (forceCrit || Math.random() < s.crit / 100) {
    crit = true;
    d *= 1 + s.critDmg / 100;
  }
  return { d, crit };
}

export function hitEnemy(e, mult, o = {}) {
  if (!e.alive) return;
  const p = G.player;
  const r = playerDamageRoll(mult, o.forceCrit);
  const dealt = damageEnemy(e, r.d, r.crit, { ...o, kx: o.kx ?? p.x, kz: o.kz ?? p.z });
  const fm = formMods(p);
  const ls = p.stats.lifeSteal + (p.buffs.overclock > 0 ? 8 : 0) + (fm && fm.lifeSteal ? fm.lifeSteal : 0);
  if (ls > 0 && dealt > 0) healPlayer((dealt * ls) / 100, false);
  if (o.energy) p.en = Math.min(p.stats.maxEn, p.en + o.energy);
  applyStatus(e, o);
  if (!o.noProc && p.stats.legs.has('arc') && chance(0.15)) {
    after(0.05, () => chainFrom(e, 3, 0.8, 5.5, 0x88ccff, true));
  }
}

// Efeitos de status causados pelo jogador
export function applyStatus(e, o) {
  if (!e.alive || e.inert) return;
  const s = G.player.stats;
  const avg = ((s.wMin + s.wMax) / 2) * (1 + s.dmgPct / 100);
  if (o.burn) {
    const dps = avg * o.burn;
    e.burnT = 3;
    e.burnDps = Math.max(e.burnT > 0 ? e.burnDps || 0 : 0, dps);
  }
  if (o.slow) e.slowT = Math.max(e.slowT || 0, o.slow * (e.boss ? 0.5 : 1));
  if (o.freeze && !e.boss) {
    e.stun = Math.max(e.stun, o.freeze * (e.heavy ? 0.5 : 1));
    e.frozenT = e.stun;
  }
}

let shieldHintShown = false;
export function damageEnemy(e, amount, crit, o = {}) {
  if (!e.alive) return 0;
  if (e.invulnerable) {
    if (!o.dot && Math.random() < 0.35) floatText(e.x, e.height + 0.4, e.z, L('IMUNE', 'IMMUNE'), 'shield');
    if (!o.dot) burst(e.x, e.height * 0.7, e.z, 0x00f0ff, 3, 2, 0.05, 0.25);
    return 0;
  }
  if (e.vulnerable) amount *= 1.5;
  if (e.dr) amount *= 1 - e.dr;
  // Tropa de Choque: o escudo bloqueia quase tudo que vem pela frente
  if (e.T.shield && e.stun <= 0 && o.kx !== undefined) {
    const ax = o.kx - e.x;
    const az = o.kz - e.z;
    const l = Math.hypot(ax, az) || 1;
    if ((ax * Math.sin(e.facing) + az * Math.cos(e.facing)) / l > 0.3) {
      amount *= 0.15;
      sfx.shieldBlock();
      burst(e.x + Math.sin(e.facing) * 0.45, 1, e.z + Math.cos(e.facing) * 0.45, 0x4d9bff, 5, 3, 0.05, 0.25);
      if (Math.random() < 0.3) floatText(e.x, e.height + 0.6, e.z, L('BLOQUEADO', 'BLOCKED'), 'shield');
      if (!shieldHintShown) {
        shieldHintShown = true;
        toast(L('O escudo bloqueia ataques pela frente: ataque pelos lados ou atordoe!', 'Shields block attacks from the front: hit them from the side or stun them!'), 'warn');
      }
    }
  }
  if (e.armorUp) amount *= 0.5;
  amount = Math.max(1, Math.round(amount));
  e.hp -= amount;
  if (!o.dot) e.flash = 0.09;
  e.hpShow = 4;
  if (!e.aggro) {
    e.aggro = true;
    e.alerted = true;
  }
  if (o.quiet || o.dot) {
    // ataques contínuos: soma o dano e mostra um número a cada 0,4s
    e.qAcc = (e.qAcc || 0) + amount;
    if (G.t - (e.qT || 0) > 0.4 || crit) {
      floatText(e.x, e.height + 0.3, e.z, e.qAcc, crit ? 'crit' : o.dot ? 'dot' : 'dmg');
      e.qAcc = 0;
      e.qT = G.t;
    }
  } else floatText(e.x, e.height + 0.3, e.z, amount, crit ? 'crit' : 'dmg');
  if (crit) sfx.crit();
  else if (!o.dot && !o.quiet) sfx.hit();
  if (o.knock && !e.boss) {
    let dx = e.x - (o.kx ?? G.player.x);
    let dz = e.z - (o.kz ?? G.player.z);
    const l = Math.hypot(dx, dz) || 1;
    const k = o.knock * (e.heavy ? 0.25 : 1);
    e.kx += (dx / l) * k;
    e.kz += (dz / l) * k;
  }
  if (o.stun && !e.boss) e.stun = Math.max(e.stun, o.stun * (e.heavy ? 0.5 : 1));
  if (!o.dot) burst(e.x, e.height * 0.6, e.z, crit ? 0xffee55 : e.bloodColor, crit ? 7 : 4, 3, 0.05, 0.3);
  if (e.hp <= 0) killEnemy(e);
  return amount;
}

export function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  const p = G.player;
  sfx.die();
  burst(e.x, e.height * 0.5, e.z, e.bloodColor, e.boss ? 80 : e.elite ? 30 : 16, e.boss ? 9 : 5, 0.08, 0.7);
  if (e.type === 'barrel') {
    // barril: explode ferindo inimigos (e o jogador, se estiver perto)
    const x = e.x;
    const z = e.z;
    after(0.06, () => {
      explosion(x, z, 2.8, 2.5, { color: 0xff7a1a, noProc: true, knock: 6 });
      const p = G.player;
      if (Math.hypot(p.x - x, p.z - z) < 2.8 + p.r) damagePlayer(e.dmg);
    });
  } else if (!e.selfDestruct && !e.decoy) {
    gainXp(e.xp);
    dropLoot(e.x, e.z, { elite: !!e.elite, boss: !!e.boss, thief: e.type === 'thief' });
    if (e.type === 'thief') {
      banner(L('JACKPOT!', 'JACKPOT!'), L('Ladrão de Dados derrubado', 'Data Thief taken down'));
      sfx.legendary();
    }
    G.char.kills = (G.char.kills || 0) + 1;
    if (p.stats.legs.has('nano')) healPlayer(p.stats.maxHp * 0.04);
    if (p.stats.legs.has('core')) {
      const x = e.x;
      const z = e.z;
      after(0.08, () => explosion(x, z, 2.5, 0.6, { color: 0xff7a1a, noProc: true, small: true }));
    }
  }
  if (e.explodeOnDeath) {
    const x = e.x;
    const z = e.z;
    telegraphFx(x, z, 2.4, 0.7, 0xff5500);
    after(0.7, () => enemyExplosion(x, z, 2.4, e.dmg * 1.6, 0xff5500));
  }
  onEnemyKilled(e);
}

// Raio em cadeia a partir de um inimigo
export function chainFrom(from, jumps, mult, range, color, noProc = false) {
  const hit = new Set([from]);
  let cur = from;
  for (let j = 0; j < jumps; j++) {
    const n = nearestEnemy(cur.x, cur.z, range, true, hit);
    if (!n) break;
    beamFx(cur.x, cur.height * 0.6, cur.z, n.x, n.height * 0.6, n.z, color);
    hitEnemy(n, mult, { noProc: true });
    hit.add(n);
    cur = n;
  }
  if (hit.size > 1) sfx.zap();
}

export function explosion(x, z, radius, mult, o = {}) {
  for (const e of enemiesInRadius(x, z, radius)) hitEnemy(e, mult, { knock: o.knock ?? 3, kx: x, kz: z, noProc: o.noProc, burn: o.burn, slow: o.slow, freeze: o.freeze, stun: o.stun });
  ringFx(x, z, radius, o.color ?? 0xff7a1a, 0.4, { from: 0.3 });
  burst(x, 0.5, z, o.color ?? 0xff7a1a, o.small ? 18 : 40, o.small ? 5 : 9, 0.09, 0.6, { up: 0.8 });
  burst(x, 0.5, z, 0xffffff, o.small ? 4 : 10, 4, 0.06, 0.3);
  sfx.explode();
  G.shake = Math.max(G.shake, o.small ? 0.12 : 0.35);
}

export function enemyExplosion(x, z, radius, dmg, color) {
  const p = G.player;
  if (Math.hypot(p.x - x, p.z - z) < radius + p.r) damagePlayer(dmg);
  ringFx(x, z, radius, color, 0.4, { from: 0.3 });
  burst(x, 0.5, z, color, 30, 7, 0.09, 0.5);
  sfx.explode();
  G.shake = Math.max(G.shake, 0.25);
}

// ---------------- dano no jogador ----------------
export function damagePlayer(amount) {
  const p = G.player;
  if (!p || !p.alive || p.invuln > 0 || G.mode !== 'play') return;
  amount *= 100 / (100 + p.stats.armor);
  if (p.buffs.titan > 0) amount *= 0.4;
  if (p.buffs.aegis > 0) amount *= 0.5;
  const fmd = formMods(p);
  if (fmd) amount *= fmd.taken;
  amount = Math.max(1, Math.round(amount));
  p.inCombat = 5;
  if (p.shield > 0) {
    const ab = Math.min(p.shield, amount);
    p.shield -= ab;
    amount -= ab;
    floatText(p.x, 1.8, p.z, `-${Math.round(ab)}`, 'shield');
    if (amount <= 0) return;
  }
  p.hp -= amount;
  p.hurtT = 0.12;
  floatText(p.x, 1.8, p.z, `-${amount}`, 'hurt');
  sfx.hurt();
  hurtFlash(amount / p.stats.maxHp);
  G.shake = Math.max(G.shake, Math.min(0.35, 0.08 + (amount / p.stats.maxHp) * 1.5));
  if (p.stats.legs.has('shield') && p.shieldCd <= 0) {
    p.shield = p.stats.maxHp * 0.2;
    p.shieldCd = 10;
    ringFx(p.x, p.z, 1.3, 0x66ccff, 0.4);
  }
  if (p.hp <= 0) {
    p.hp = 0;
    playerDie();
  }
}

export function healPlayer(a, show = true) {
  const p = G.player;
  if (!p.alive) return;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + a);
  const got = p.hp - before;
  if (show && got >= 1) floatText(p.x, 1.9, p.z, `+${Math.round(got)}`, 'heal');
}

// ---------------- projéteis ----------------
const projGeo = new THREE.SphereGeometry(1, 10, 8);

export function spawnProjectile(o) {
  const m = new THREE.Mesh(projGeo, glowMat(o.color, 2.6));
  m.scale.setScalar(o.size || 0.12);
  if (o.from === 'enemy') m.scale.multiplyScalar(gk(1.1));
  const y = o.y ?? 0.95;
  m.position.set(o.x, y, o.z);
  G.world.add(m);
  const pr = { ...o, y, mesh: m, life: o.life ?? 1, hit: new Set(), pierce: o.pierce || 0, alive: true, trail: 0 };
  G.projectiles.push(pr);
  return pr;
}

export function lob(o) {
  const m = new THREE.Mesh(projGeo, glowMat(o.color, 2.4));
  m.scale.setScalar(0.16);
  m.position.set(o.x, 1, o.z);
  G.world.add(m);
  const pr = { lob: true, ...o, mesh: m, t: 0, alive: true, from: 'player' };
  G.projectiles.push(pr);
  return pr;
}

export function updateProjectiles(dt) {
  const d = G.dungeon;
  const p = G.player;
  for (const pr of G.projectiles) {
    if (!pr.alive) continue;
    if (pr.lob) {
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.time);
      const x = pr.x + (pr.tx - pr.x) * k;
      const z = pr.z + (pr.tz - pr.z) * k;
      const y = 1 + Math.sin(k * Math.PI) * 2.2 - k * 0.9;
      pr.mesh.position.set(x, y, z);
      if (Math.random() < 0.6) burst(x, y, z, pr.color, 1, 0.5, 0.05, 0.25, { grav: 0 });
      if (k >= 1) {
        pr.alive = false;
        pr.onLand(x, z);
      }
      continue;
    }
    if (pr.homing) {
      const t = pr.from === 'player' ? nearestEnemy(pr.mesh.position.x, pr.mesh.position.z, 5, false, pr.hit) : p.alive ? p : null;
      if (t) {
        const ang = Math.atan2(pr.dz, pr.dx);
        const want = Math.atan2(t.z - pr.mesh.position.z, t.x - pr.mesh.position.x);
        let diff = want - ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const na = ang + Math.max(-pr.homing * dt, Math.min(pr.homing * dt, diff));
        pr.dx = Math.cos(na);
        pr.dz = Math.sin(na);
      }
    }
    const pos = pr.mesh.position;
    // tiros inimigos ficam lentos dentro de uma dobra temporal
    const tf = pr.from === 'enemy' && G.warps.length ? timeFactor(pos.x, pos.z) : 1;
    pos.x += pr.dx * pr.speed * dt * tf;
    pos.z += pr.dz * pr.speed * dt * tf;
    if (pr.from === 'enemy' && shieldCatch(pr)) {
      pr.alive = false;
      continue;
    }
    pr.life -= dt;
    pr.trail += dt;
    if (pr.trail > 0.03) {
      pr.trail = 0;
      burst(pos.x, pos.y, pos.z, pr.color, 1, 0.3, (pr.size || 0.12) * 0.7, 0.18, { grav: 0 });
    }
    if (blocksSight(d, pos.x, pos.z)) {
      pr.alive = false;
      burst(pos.x - pr.dx * 0.1, pos.y, pos.z - pr.dz * 0.1, pr.color, 5, 3, 0.05, 0.25);
      if (pr.explode) enemyExplosion(pos.x - pr.dx * 0.3, pos.z - pr.dz * 0.3, pr.explode.r, pr.explode.dmg, pr.color);
      if (pr.blast) explosion(pos.x - pr.dx * 0.3, pos.z - pr.dz * 0.3, pr.blast.r, pr.blast.mult, { color: pr.color, burn: pr.blast.burn });
      continue;
    }
    if (pr.from === 'enemy' && G.barriers.length && hitsBarrier(pos.x, pos.z)) {
      pr.alive = false;
      burst(pos.x, pos.y, pos.z, 0xffd23d, 8, 3, 0.05, 0.3);
      continue;
    }
    if (pr.from === 'player') {
      // tiros do jogador podem derrubar mísseis inimigos
      for (const q of G.projectiles) {
        if (!q.alive || !q.shootable) continue;
        const r = pr.r + 0.3;
        if ((q.mesh.position.x - pos.x) ** 2 + (q.mesh.position.z - pos.z) ** 2 < r * r) {
          q.alive = false;
          pr.alive = false;
          burst(q.mesh.position.x, q.mesh.position.y, q.mesh.position.z, q.color, 16, 4, 0.07, 0.35);
          ringFx(q.mesh.position.x, q.mesh.position.z, 0.9, q.color, 0.25);
          sfx.hit();
          break;
        }
      }
      if (!pr.alive) continue;
      for (const e of G.enemies) {
        if (!e.alive || pr.hit.has(e) || e.invulnerable) continue;
        const r = pr.r + e.r;
        if ((e.x - pos.x) ** 2 + (e.z - pos.z) ** 2 < r * r) {
          pr.hit.add(e);
          hitEnemy(e, pr.mult, { forceCrit: pr.forceCrit, knock: pr.knock ?? 0.8, kx: pos.x - pr.dx, kz: pos.z - pr.dz, slow: pr.slow, burn: pr.burn, freeze: pr.freeze, quiet: pr.quiet });
          if (pr.onHit) pr.onHit(e, pr);
          if (pr.blast) {
            pr.alive = false;
            explosion(pos.x, pos.z, pr.blast.r, pr.blast.mult, { color: pr.color, burn: pr.blast.burn });
            break;
          }
          if (pr.pierce-- <= 0) {
            pr.alive = false;
            break;
          }
        }
      }
    } else if (p.alive) {
      const r = pr.r + p.r;
      if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < r * r) {
        pr.alive = false;
        if (pr.explode) {
          enemyExplosion(pos.x, pos.z, pr.explode.r, pr.explode.dmg, pr.color);
        } else if (pr.fake) {
          // projétil de uma cópia ilusória: só um brilho, sem dano
          burst(pos.x, pos.y, pos.z, pr.color, 8, 2, 0.05, 0.3);
          floatText(p.x, 1.8, p.z, L('ilusão', 'illusion'), 'info');
        } else if (p.invuln > 0) {
          burst(pos.x, pos.y, pos.z, 0xffffff, 3, 2, 0.04, 0.2);
        } else {
          damagePlayer(pr.dmg);
          burst(pos.x, pos.y, pos.z, pr.color, 6, 3, 0.05, 0.25);
        }
      }
    }
    if (pr.life <= 0 && pr.alive) {
      pr.alive = false;
      if (pr.explode) enemyExplosion(pos.x, pos.z, pr.explode.r, pr.explode.dmg, pr.color);
      if (pr.blast) explosion(pos.x, pos.z, pr.blast.r, pr.blast.mult, { color: pr.color, burn: pr.blast.burn });
    }
  }
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    if (!pr.alive) {
      pr.mesh.parent && pr.mesh.parent.remove(pr.mesh);
      G.projectiles.splice(i, 1);
    }
  }
}

// ---------------- torres do Netrunner ----------------
export function spawnTurret(x, z, dur, mult) {
  while (G.turrets.length >= 2) {
    const old = G.turrets.shift();
    old.model.root.parent && old.model.root.parent.remove(old.model.root);
  }
  const model = makeTurretModel(0x39ff14);
  model.root.position.set(x, 0, z);
  G.world.add(model.root);
  ringFx(x, z, 1.2, 0x39ff14, 0.35);
  burst(x, 0.6, z, 0x39ff14, 14, 4, 0.06, 0.4);
  G.turrets.push({ x, z, t: dur, fire: 0.3, mult, model });
}

export function updateTurrets(dt) {
  for (let i = G.turrets.length - 1; i >= 0; i--) {
    const t = G.turrets[i];
    t.t -= dt;
    t.fire -= dt;
    if (t.t <= 0) {
      burst(t.x, 0.6, t.z, 0x39ff14, 12, 3, 0.06, 0.4);
      t.model.root.parent && t.model.root.parent.remove(t.model.root);
      G.turrets.splice(i, 1);
      continue;
    }
    const e = nearestEnemy(t.x, t.z, 9, true);
    if (e) {
      const a = Math.atan2(e.x - t.x, e.z - t.z);
      t.model.head.rotation.y = a;
      if (t.fire <= 0) {
        t.fire = 0.45;
        const dx = e.x - t.x;
        const dz = e.z - t.z;
        const l = Math.hypot(dx, dz) || 1;
        spawnProjectile({ from: 'player', x: t.x + (dx / l) * 0.4, z: t.z + (dz / l) * 0.4, y: 0.62, dx: dx / l, dz: dz / l, speed: 20, life: 0.6, mult: t.mult, color: 0x39ff14, size: 0.08, r: 0.2 });
        sfx.shoot();
      }
    } else {
      t.model.head.rotation.y += dt * 1.5;
    }
    if (t.t < 2) t.model.root.visible = Math.floor(t.t * 8) % 2 === 0;
  }
}

// ---------------- Zonas de perigo (ácido da Matriarca) ----------------
const hazardGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
export function spawnHazard(x, z, r, dur, dps, o = {}) {
  const color = o.color ?? 0x39ff14;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.9), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(hazardGeo, mat);
  m.position.set(x, 0.03, z);
  m.scale.setScalar(r);
  G.world.add(m);
  burst(x, 0.3, z, color, 14, 4, 0.07, 0.4);
  G.hazards.push({ x, z, r, t: dur, dur, dps, tick: 0, mesh: m, mat, color, faction: o.faction || 'enemy', mult: o.mult || 0, burn: o.burn, slow: o.slow, maxOp: o.opacity ?? 0.45 });
}

export function updateHazards(dt) {
  const p = G.player;
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.t -= dt;
    h.tick -= dt;
    h.mat.opacity = Math.min(h.maxOp, h.t * 0.6) * (0.8 + Math.sin(G.t * 6 + i) * 0.2);
    if (Math.random() < dt * 8) burst(h.x + (Math.random() - 0.5) * h.r * 1.4, 0.1, h.z + (Math.random() - 0.5) * h.r * 1.4, h.color, 1, 0.5, 0.05, 0.6, { grav: -1.5 });
    if (h.tick <= 0) {
      if (h.faction === 'player') {
        h.tick = 0.5;
        for (const e of enemiesInRadius(h.x, h.z, h.r)) hitEnemy(e, h.mult, { noProc: true, burn: h.burn, slow: h.slow, kx: h.x, kz: h.z });
      } else if (p.alive && Math.hypot(p.x - h.x, p.z - h.z) < h.r + p.r * 0.5) {
        h.tick = 0.5;
        damagePlayer(h.dps * 0.5);
      }
    }
    if (h.t <= 0) {
      h.mesh.parent && h.mesh.parent.remove(h.mesh);
      h.mat.dispose();
      G.hazards.splice(i, 1);
    }
  }
}

// ---------------- Barreiras de energia (Colosso) ----------------
const barrierGeo = new THREE.PlaneGeometry(1, 1.6).translate(0, 0.8, 0);
export function spawnBarrier(x, z, dx, dz, half, dur) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(gk(1.4)), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(barrierGeo, mat);
  m.scale.x = half * 2;
  m.position.set(x, 0, z);
  m.rotation.y = -Math.atan2(dz, dx);
  G.world.add(m);
  ringFx(x, z, half, 0xffd23d, 0.35);
  G.barriers.push({ x, z, dx, dz, half, t: dur, mesh: m, mat });
}

export function updateBarriers(dt) {
  for (let i = G.barriers.length - 1; i >= 0; i--) {
    const b = G.barriers[i];
    b.t -= dt;
    b.mat.opacity = (b.t < 1.5 ? (Math.floor(b.t * 8) % 2 ? 0.15 : 0.35) : 0.3) + Math.sin(G.t * 8) * 0.05;
    if (b.t <= 0) {
      b.mesh.parent && b.mesh.parent.remove(b.mesh);
      b.mat.dispose();
      G.barriers.splice(i, 1);
    }
  }
}

function hitsBarrier(x, z) {
  for (const b of G.barriers) {
    const rx = x - b.x;
    const rz = z - b.z;
    const along = rx * b.dx + rz * b.dz;
    const across = Math.abs(-rx * b.dz + rz * b.dx);
    if (Math.abs(along) <= b.half && across < 0.3) return b;
  }
  return null;
}

// ---------------- Isca holográfica (Geada) ----------------
export function spawnDecoy(x, z, dur, onEnd) {
  if (G.decoy) G.decoy.t = 0;
  const model = makeDecoyModel();
  model.position.set(x, 0, z);
  G.world.add(model);
  ringFx(x, z, 1.5, 0x8ab4ff, 0.4);
  G.decoy = { x, z, t: dur, model, onEnd, r: 0.4 };
}

export function updateDecoy(dt) {
  const dc = G.decoy;
  if (!dc) return;
  dc.t -= dt;
  dc.model.rotation.y += dt * 2;
  dc.model.children.forEach((c) => c.material && (c.material.opacity = 0.35 + Math.sin(G.t * 10) * 0.15));
  if (dc.t <= 0) {
    dc.model.parent && dc.model.parent.remove(dc.model);
    G.decoy = null;
    if (dc.onEnd) dc.onEnd(dc.x, dc.z);
  }
}

function makeDecoyModel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ab4ff).multiplyScalar(gk(1.5)), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 8), mat);
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat);
  head.position.y = 1.35;
  g.add(body, head);
  return g;
}
