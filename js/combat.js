// Dano, projéteis, explosões, torres e temporizadores.
import * as THREE from 'three';
import { G } from './state.js';
import { rr, chance } from './utils.js';
import { isWalkable, lineOfSight } from './dungeon.js';
import { glowMat, makeTurretModel } from './models.js';
import { burst, floatText, ringFx, beamFx, telegraphFx } from './fx.js';
import { sfx } from './audio.js';
import { dropLoot } from './loot.js';
import { gainXp, playerDie } from './player.js';
import { onEnemyKilled } from './enemies.js';
import { hurtFlash } from './ui.js';

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
    if (!e.alive || e === exclude || (exclude && exclude.has && exclude.has(e))) continue;
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
  let d = rr(s.wMin, s.wMax) * mult * (1 + s.dmgPct / 100);
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
  const ls = p.stats.lifeSteal + (p.buffs.overclock > 0 ? 8 : 0);
  if (ls > 0 && dealt > 0) healPlayer((dealt * ls) / 100, false);
  if (o.energy) p.en = Math.min(p.stats.maxEn, p.en + o.energy);
  if (!o.noProc && p.stats.legs.has('arc') && chance(0.15)) {
    after(0.05, () => chainFrom(e, 3, 0.8, 5.5, 0x88ccff, true));
  }
}

export function damageEnemy(e, amount, crit, o = {}) {
  if (!e.alive) return 0;
  if (e.dr) amount *= 1 - e.dr;
  if (e.armorUp) amount *= 0.5;
  amount = Math.max(1, Math.round(amount));
  e.hp -= amount;
  e.flash = 0.09;
  e.hpShow = 4;
  if (!e.aggro) {
    e.aggro = true;
    e.alerted = true;
  }
  floatText(e.x, e.height + 0.3, e.z, amount, crit ? 'crit' : 'dmg');
  if (crit) sfx.crit();
  else sfx.hit();
  if (o.knock && !e.boss) {
    let dx = e.x - (o.kx ?? G.player.x);
    let dz = e.z - (o.kz ?? G.player.z);
    const l = Math.hypot(dx, dz) || 1;
    const k = o.knock * (e.heavy ? 0.25 : 1);
    e.kx += (dx / l) * k;
    e.kz += (dz / l) * k;
  }
  if (o.stun && !e.boss) e.stun = Math.max(e.stun, o.stun * (e.heavy ? 0.5 : 1));
  burst(e.x, e.height * 0.6, e.z, crit ? 0xffee55 : e.bloodColor, crit ? 7 : 4, 3, 0.05, 0.3);
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
  if (!e.selfDestruct) {
    gainXp(e.xp);
    dropLoot(e.x, e.z, { elite: !!e.elite, boss: !!e.boss });
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
  for (const e of enemiesInRadius(x, z, radius)) hitEnemy(e, mult, { knock: o.knock ?? 3, kx: x, kz: z, noProc: o.noProc });
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
  if (o.from === 'enemy') m.scale.multiplyScalar(1.1);
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
      const t = nearestEnemy(pr.mesh.position.x, pr.mesh.position.z, 5, false, pr.hit);
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
    pos.x += pr.dx * pr.speed * dt;
    pos.z += pr.dz * pr.speed * dt;
    pr.life -= dt;
    pr.trail += dt;
    if (pr.trail > 0.03) {
      pr.trail = 0;
      burst(pos.x, pos.y, pos.z, pr.color, 1, 0.3, (pr.size || 0.12) * 0.7, 0.18, { grav: 0 });
    }
    if (!isWalkable(d, pos.x, pos.z)) {
      pr.alive = false;
      burst(pos.x - pr.dx * 0.1, pos.y, pos.z - pr.dz * 0.1, pr.color, 5, 3, 0.05, 0.25);
      continue;
    }
    if (pr.from === 'player') {
      for (const e of G.enemies) {
        if (!e.alive || pr.hit.has(e)) continue;
        const r = pr.r + e.r;
        if ((e.x - pos.x) ** 2 + (e.z - pos.z) ** 2 < r * r) {
          pr.hit.add(e);
          hitEnemy(e, pr.mult, { forceCrit: pr.forceCrit, knock: pr.knock ?? 0.8, kx: pos.x - pr.dx, kz: pos.z - pr.dz });
          if (pr.onHit) pr.onHit(e, pr);
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
        if (p.invuln > 0) {
          burst(pos.x, pos.y, pos.z, 0xffffff, 3, 2, 0.04, 0.2);
        } else {
          damagePlayer(pr.dmg);
          burst(pos.x, pos.y, pos.z, pr.color, 6, 3, 0.05, 0.25);
        }
      }
    }
    if (pr.life <= 0) pr.alive = false;
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
