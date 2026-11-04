// Tipos de inimigos, elites, IA e o chefe ARC-9.
import * as THREE from 'three';
import { G } from './state.js';
import { rr, pick, chance, weightedPick } from './utils.js';
import { makeEnemyModel, makeHpBar, addShadow, animWalk } from './models.js';
import { resolveCircle, lineOfSight, flowDir, isWalkable } from './dungeon.js';
import { spawnProjectile, damagePlayer, after, enemyExplosion } from './combat.js';
import { burst, ringFx, telegraphFx, lineTelegraph, floatText } from './fx.js';
import { sfx } from './audio.js';
import { toast, bossBar, banner } from './ui.js';

export const ETYPES = {
  punk: { name: 'Punk de Rua', hp: 42, dmg: 8, speed: 3.4, r: 0.34, h: 1.4, xp: 8, minFloor: 1, weight: 10, ai: 'melee', range: 0.9, atkCd: 1.1, blood: 0xff6a00 },
  drone: { name: 'Drone Vigia', hp: 24, dmg: 6, speed: 4.0, r: 0.34, h: 1.5, xp: 7, minFloor: 1, weight: 6, ai: 'ranged', range: 7.5, keep: [4, 6.5], atkCd: 1.8, proj: { speed: 8.5, color: 0xff3355, size: 0.17 }, blood: 0xff3355 },
  soldier: { name: 'Agente Corporativo', hp: 58, dmg: 6, speed: 3.0, r: 0.34, h: 1.4, xp: 12, minFloor: 2, weight: 7, ai: 'ranged', range: 9, keep: [5, 8], atkCd: 2.4, burst: 3, proj: { speed: 12, color: 0xffaa00, size: 0.12 }, blood: 0xff2244 },
  bomber: { name: 'Aranha-Bomba', hp: 18, dmg: 22, speed: 5.3, r: 0.3, h: 0.7, xp: 6, minFloor: 2, weight: 5, ai: 'bomber', blood: 0xff3300 },
  brute: { name: 'Mech Brutamontes', hp: 210, dmg: 24, speed: 2.2, r: 0.62, h: 2.2, xp: 40, minFloor: 3, weight: 3, ai: 'brute', range: 2.6, atkCd: 2.8, heavy: true, blood: 0xffc400 },
  boss: { name: 'Executor ARC-9', hp: 720, dmg: 14, speed: 2.5, r: 1.15, h: 3.0, xp: 450, minFloor: 99, weight: 0, ai: 'boss', heavy: true, blood: 0xff2244 },
};

const ELITE = {
  veloz: { name: 'Veloz', color: 0x00f0ff, apply: (e) => { e.speed *= 1.45; e.atkCdMult = 0.7; } },
  blindado: { name: 'Blindado', color: 0xc0c8ff, apply: (e) => { e.dr = 0.4; } },
  vampirico: { name: 'Vampírico', color: 0xff2244, apply: (e) => { e.vamp = true; } },
  instavel: { name: 'Instável', color: 0xff7a1a, apply: (e) => { e.explodeOnDeath = true; } },
};

export function floorScale(f) {
  return { hp: 1 + (f - 1) * 0.42 + Math.pow(f - 1, 2) * 0.03, dmg: 1 + (f - 1) * 0.2 };
}

export function pickEnemyType(floor) {
  const list = Object.keys(ETYPES).filter((k) => ETYPES[k].minFloor <= floor && ETYPES[k].weight > 0);
  return weightedPick(list, (k) => ETYPES[k].weight);
}

export function spawnEnemy(type, x, z, o = {}) {
  const T = ETYPES[type];
  const sc = floorScale(G.floor);
  const eliteKey = o.elite ? pick(Object.keys(ELITE)) : null;
  const model = makeEnemyModel(type, eliteKey ? ELITE[eliteKey].color : null);
  const e = {
    type, T, x, z,
    r: T.r * (eliteKey ? 1.2 : 1),
    hp: T.hp * sc.hp, maxHp: T.hp * sc.hp,
    dmg: T.dmg * sc.dmg,
    speed: T.speed * rr(0.92, 1.08),
    alive: true, atkT: rr(0.6, 1.6), aggro: false, kx: 0, kz: 0, stun: 0, flash: 0,
    model, facing: rr(0, Math.PI * 2), phase: rr(0, 6), hpShow: 0,
    elite: eliteKey, boss: type === 'boss', heavy: !!T.heavy,
    height: T.h * (eliteKey ? 1.2 : 1), xp: Math.round(T.xp * (1 + 0.3 * (G.floor - 1))),
    losT: rr(0, 0.3), los: false, strafe: chance(0.5) ? 1 : -1, strafeT: rr(1, 3),
    state: 'idle', bloodColor: T.blood, atkCdMult: 1, name: T.name, spawnX: x, spawnZ: z,
  };
  if (eliteKey) {
    e.hp *= 3.2;
    e.maxHp = e.hp;
    e.dmg *= 1.4;
    e.xp *= 3;
    e.name = `${T.name} ${ELITE[eliteKey].name}`;
    ELITE[eliteKey].apply(e);
    model.root.scale.setScalar(1.2);
  }
  if (e.boss) {
    e.bstate = 'intro';
    e.bt = 1.2;
    e.phase2 = false;
    e.lastAtk = null;
  }
  addShadow(model.root, e.r / (eliteKey ? 1.2 : 1));
  const bar = makeHpBar(e.boss ? 0 : 0.8, !!eliteKey);
  bar.position.y = T.h + 0.35;
  model.root.add(bar);
  e.bar = bar;
  model.root.position.set(x, 0, z);
  model.root.rotation.y = e.facing;
  G.world.add(model.root);
  G.enemies.push(e);
  return e;
}

export function onEnemyKilled(e) {
  if (e.boss) {
    G.boss = null;
    bossBar(null);
    banner('ALVO NEUTRALIZADO', 'O elevador foi liberado');
    sfx.levelup();
    G.dungeon.meshes.exit.locked = false;
  }
  // animação de morte: afunda e some
  const root = e.model.root;
  e.bar.visible = false;
  let t = 0;
  const tick = () => {
    t += 0.016;
    root.rotation.x = Math.min(Math.PI / 2, t * 6) * (e.model.kind === 'drone' ? 0 : 1);
    root.position.y = -t * 1.2;
    root.scale.multiplyScalar(0.97);
    if (t < 0.5 && root.parent) requestAnimationFrame(tick);
    else root.parent && root.parent.remove(root);
  };
  requestAnimationFrame(tick);
}

function enemyShoot(e, dx, dz, spread = 0) {
  const T = e.T;
  const a = Math.atan2(dz, dx) + spread;
  spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * (e.r + 0.15), z: e.z + Math.sin(a) * (e.r + 0.15), y: e.type === 'drone' ? 1.15 : 0.95, dx: Math.cos(a), dz: Math.sin(a), speed: T.proj.speed, life: 2.2, dmg: e.dmg, color: T.proj.color, size: T.proj.size, r: 0.16 });
  sfx.enemyShot();
}

function meleeHit(e, dmg) {
  damagePlayer(dmg);
  if (e.vamp) {
    e.hp = Math.min(e.maxHp, e.hp + dmg * 1.5);
    floatText(e.x, e.height + 0.4, e.z, `+${Math.round(dmg * 1.5)}`, 'heal');
  }
}

// ---------------- atualização ----------------
let flowTimer = 0;
export function updateEnemies(dt, cam) {
  const p = G.player;
  const d = G.dungeon;
  let anyAggro = false;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 30 && !e.boss) continue;

    e.losT -= dt;
    if (e.losT <= 0) {
      e.losT = 0.25;
      e.los = dist < 16 && lineOfSight(d, e.x, e.z, p.x, p.z);
      if (!e.aggro && e.los && dist < (e.boss ? 9 : 10)) {
        e.aggro = true;
        e.alerted = true;
      }
    }
    if (e.alerted) {
      e.alerted = false;
      for (const o of G.enemies) if (o.alive && !o.aggro && Math.hypot(o.x - e.x, o.z - e.z) < 7) o.aggro = true;
      if (e.boss && !G.boss) startBoss(e);
    }
    if (e.aggro && p.alive) anyAggro = true;

    e.atkT -= dt;
    e.flash -= dt;
    if (e.hpShow > 0) e.hpShow -= dt;

    let mvx = 0;
    let mvz = 0;
    let speed = e.speed;
    if (e.stun > 0) {
      e.stun -= dt;
      if (Math.random() < 0.3) burst(e.x, e.height, e.z, 0x39ff14, 1, 1.5, 0.04, 0.3, { grav: 0 });
    } else if (e.aggro && p.alive) {
      const ux = dx / (dist || 1);
      const uz = dz / (dist || 1);
      const chase = () => {
        if (e.los && dist < 7) return { x: ux, z: uz };
        return flowDir(d, e.x, e.z) || (e.los ? { x: ux, z: uz } : null);
      };
      switch (e.T.ai) {
        case 'melee': {
          if (e.windup > 0) {
            e.windup -= dt;
            speed = 0;
            if (e.windup <= 0) {
              e.swing = 1;
              if (dist < e.T.range + e.r + p.r + 0.35) meleeHit(e, e.dmg);
              e.atkT = e.T.atkCd * e.atkCdMult;
            }
          } else if (dist < e.T.range + e.r + p.r) {
            if (e.atkT <= 0) e.windup = 0.3;
          } else {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'ranged': {
          const [kmin, kmax] = e.T.keep;
          e.strafeT -= dt;
          if (e.strafeT <= 0) {
            e.strafeT = rr(1.2, 2.8);
            e.strafe *= -1;
          }
          if (!e.los || dist > kmax) {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          } else if (dist < kmin) {
            mvx = -ux;
            mvz = -uz;
            speed *= 0.8;
          } else {
            mvx = -uz * e.strafe;
            mvz = ux * e.strafe;
            speed *= 0.5;
          }
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * e.atkCdMult * rr(0.85, 1.15);
            const n = e.T.burst || 1;
            for (let k = 0; k < n; k++) {
              after(k * 0.13, () => {
                if (!e.alive) return;
                const ddx = G.player.x - e.x;
                const ddz = G.player.z - e.z;
                enemyShoot(e, ddx, ddz, rr(-0.06, 0.06));
              });
            }
            e.swing = 1;
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'bomber': {
          if (e.fuse !== undefined) {
            e.fuse -= dt;
            speed = 0;
            e.model.coreMat.color.setScalar(Math.floor(e.fuse * 16) % 2 ? 3 : 0.5);
            if (e.fuse <= 0) {
              e.selfDestruct = true;
              enemyExplosion(e.x, e.z, 2.2, e.dmg, 0xff3300);
              e.hp = 0;
              e.alive = false;
              burst(e.x, 0.4, e.z, 0xff3300, 20, 5, 0.08, 0.5);
              onEnemyKilled(e);
            }
          } else if (dist < 1.4) {
            e.fuse = 0.5;
            sfx.telegraph();
          } else {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'brute': {
          if (e.slamT > 0) {
            e.slamT -= dt;
            speed = 0;
            if (e.slamT <= 0) {
              e.swing = 1;
              if (Math.hypot(p.x - e.x, p.z - e.z) < e.T.range + p.r) meleeHit(e, e.dmg);
              ringFx(e.x, e.z, e.T.range, 0xffc400, 0.35, { from: 0.5 });
              burst(e.x, 0.3, e.z, 0xffc400, 24, 6, 0.08, 0.5, { up: 0.4 });
              sfx.explode();
              G.shake = Math.max(G.shake, 0.3);
              e.atkT = e.T.atkCd * e.atkCdMult;
            }
          } else if (dist < e.T.range + p.r - 0.2 && e.atkT <= 0) {
            e.slamT = 0.95;
            telegraphFx(e.x, e.z, e.T.range, 0.95, 0xffaa00);
            sfx.telegraph();
          } else {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'boss': {
          const r = updateBoss(e, dt, dist, ux, uz);
          mvx = r.x;
          mvz = r.z;
          speed = r.speed;
          break;
        }
      }
    }

    // movimento
    e.x += (mvx * speed + e.kx) * dt;
    e.z += (mvz * speed + e.kz) * dt;
    const kd = Math.max(0, 1 - dt * 8);
    e.kx *= kd;
    e.kz *= kd;
    resolveCircle(d, e);
    e.moving = Math.abs(mvx * speed) + Math.abs(mvz * speed) > 0.3;
  }

  // separação entre inimigos e com o jogador
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const r = a.r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const dd = Math.sqrt(d2);
        const push = Math.min(0.15, (r - dd) * 0.5);
        const wa = a.heavy ? 0.2 : 1;
        const wb = b.heavy ? 0.2 : 1;
        a.x -= (dx / dd) * push * wa;
        a.z -= (dz / dd) * push * wa;
        b.x += (dx / dd) * push * wb;
        b.z += (dz / dd) * push * wb;
      }
    }
    if (p.alive && !p.dash) {
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const r = a.r + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const dd = Math.sqrt(d2);
        const push = Math.min(0.12, r - dd);
        const wa = a.heavy ? 0.15 : 0.5;
        a.x -= (dx / dd) * push * wa;
        a.z -= (dz / dd) * push * wa;
        p.x += (dx / dd) * push * (1 - wa);
        p.z += (dz / dd) * push * (1 - wa);
      }
    }
  }
  // a separação pode empurrar corpos contra paredes: corrige
  for (const e of list) {
    if (!e.alive) continue;
    resolveCircle(d, e);
    if (isWalkable(d, e.x, e.z)) {
      e.safeX = e.x;
      e.safeZ = e.z;
    } else {
      e.x = e.safeX ?? e.spawnX;
      e.z = e.safeZ ?? e.spawnZ;
    }
  }
  if (p.alive) resolveCircle(d, p);

  // visual
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const m = e.model;
    m.root.position.x = e.x;
    m.root.position.z = e.z;
    if (e.faceX !== undefined && e.stun <= 0) {
      const want = Math.atan2(e.faceX, e.faceZ);
      let diff = want - e.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.facing += diff * Math.min(1, dt * (e.boss ? 4 : 10));
    }
    m.root.rotation.y = e.facing;
    e.phase += dt * e.speed * 2.6 * (e.moving ? 1 : 0);
    if (m.kind === 'humanoid') {
      animWalk(m, e.phase, e.moving);
      if (e.windup > 0) m.armR.rotation.x = -2.2;
      if (e.slamT > 0) {
        m.armR.rotation.x = -2.8;
        m.armL.rotation.x = -2.8;
      }
      if (e.swing > 0) {
        e.swing -= dt * 5;
        m.armR.rotation.x = 0.8 * e.swing;
      }
      if (e.T.ai === 'ranged') m.armR.rotation.x = -1.4;
    } else if (m.kind === 'drone') {
      m.body.position.y = 1.15 + Math.sin(G.t * 3 + e.phase) * 0.12;
      m.ring.rotation.z += dt * 4;
    } else if (m.kind === 'bomber') {
      m.legs.forEach((l, i) => (l.rotation.z = Math.sin(e.phase * 2 + i * 1.6) * 0.4));
      if (e.fuse === undefined) m.coreMat.color.setRGB(2.5, 0.5, 0).multiplyScalar(0.8 + Math.sin(G.t * 8) * 0.3);
    } else if (m.kind === 'boss') {
      m.ring.rotation.z += dt * (e.phase2 ? 3 : 1.2);
      m.body.position.y = Math.sin(G.t * 2) * 0.05;
    }
    // flash ao tomar dano
    const fl = e.flash > 0 ? 1 : 0;
    for (const mt of m.mats) mt.emissive.setScalar(fl * 0.9);
    // barra de vida
    if (e.bar) {
      const show = !e.boss && e.hpShow > 0 && e.hp < e.maxHp;
      e.bar.visible = show || (!!e.elite && e.aggro);
      if (e.bar.visible) {
        e.bar.quaternion.copy(cam.quaternion);
        e.bar.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -e.facing));
        const fg = e.bar.userData.fg;
        fg.scale.x = Math.max(0.001, (e.hp / e.maxHp) * e.bar.userData.width);
      }
    }
  }

  // limpa mortos
  for (let i = G.enemies.length - 1; i >= 0; i--) if (!G.enemies[i].alive) G.enemies.splice(i, 1);
  if (anyAggro) p.inCombat = Math.max(p.inCombat || 0, 2);
}

// ---------------- Chefe ----------------
function startBoss(e) {
  G.boss = e;
  bossBar(e);
  sfx.boss();
  banner(e.name.toUpperCase(), 'Unidade de execução corporativa');
  G.shake = 0.4;
}

function updateBoss(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  e.faceX = ux;
  e.faceZ = uz;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) {
    e.phase2 = true;
    e.speed *= 1.25;
    toast('ARC-9: PROTOCOLO DE EXTERMÍNIO ATIVADO', 'warn');
    sfx.boss();
    ringFx(e.x, e.z, 5, 0xff2244, 0.6);
    G.shake = 0.4;
    e.bstate = 'walk';
    e.bt = 0.6;
  }
  e.bt -= dt;
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1.0;
      }
      break;
    case 'walk':
      if (dist > 3) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed;
      }
      if (e.bt <= 0) chooseBossAttack(e, dist);
      break;
    case 'ring': {
      if (e.bt <= 0) {
        const n = e.phase2 ? 22 : 16;
        const off = e.wave * 0.35;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + off;
          spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * 1.2, z: e.z + Math.sin(a) * 1.2, y: 1.2, dx: Math.cos(a), dz: Math.sin(a), speed: 6.5, life: 3.5, dmg: e.dmg, color: 0xff2244, size: 0.2, r: 0.2 });
        }
        sfx.enemyShot();
        e.wave++;
        e.bt = 0.5;
        if (e.wave >= (e.phase2 ? 4 : 3)) toWalk(e);
      }
      break;
    }
    case 'spray': {
      if (e.bt <= 0) {
        const base = Math.atan2(p.z - e.z, p.x - e.x);
        for (let k = -2; k <= 2; k++) {
          const a = base + k * 0.16;
          spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * 1.3, z: e.z + Math.sin(a) * 1.3, y: 1.6, dx: Math.cos(a), dz: Math.sin(a), speed: 11, life: 2.2, dmg: e.dmg * 0.8, color: 0xffaa00, size: 0.14, r: 0.18 });
        }
        sfx.enemyShot();
        e.wave++;
        e.bt = 0.22;
        if (e.wave >= (e.phase2 ? 6 : 4)) toWalk(e);
      }
      break;
    }
    case 'chargeWind':
      e.faceX = e.cdx;
      e.faceZ = e.cdz;
      if (e.bt <= 0) {
        e.bstate = 'charge';
        e.bt = 0.75;
        e.chargeHit = false;
        sfx.dash();
      }
      break;
    case 'charge': {
      e.faceX = e.cdx;
      e.faceZ = e.cdz;
      out.x = e.cdx;
      out.z = e.cdz;
      out.speed = 15;
      if (Math.random() < 0.7) burst(e.x, 0.4, e.z, 0xff2244, 2, 2, 0.08, 0.4);
      if (!e.chargeHit && dist < e.r + p.r + 0.3) {
        e.chargeHit = true;
        damagePlayer(e.dmg * 1.7);
        p.kx = (p.kx || 0) + e.cdx * 10;
        p.kz = (p.kz || 0) + e.cdz * 10;
      }
      const nx = e.x + e.cdx * 1.4;
      const nz = e.z + e.cdz * 1.4;
      if (e.bt <= 0 || !isWalkable(G.dungeon, nx, nz)) {
        e.bstate = 'recover';
        e.bt = e.phase2 ? 0.6 : 1.0;
        G.shake = 0.3;
        burst(e.x, 0.5, e.z, 0xffffff, 16, 5, 0.07, 0.4);
        sfx.explode();
      }
      break;
    }
    case 'recover':
      if (e.bt <= 0) toWalk(e);
      break;
    case 'slam':
      if (e.bt <= 0) {
        if (Math.hypot(p.x - e.x, p.z - e.z) < 3.8 + p.r) damagePlayer(e.dmg * 1.5);
        ringFx(e.x, e.z, 3.8, 0xff2244, 0.4, { from: 0.5 });
        burst(e.x, 0.3, e.z, 0xff2244, 40, 8, 0.09, 0.6, { up: 0.4 });
        sfx.explode();
        G.shake = 0.45;
        toWalk(e);
      }
      break;
    case 'summon':
      if (e.bt <= 0) {
        const alive = G.enemies.filter((o) => o.alive && !o.boss).length;
        const n = Math.max(0, Math.min(3, 8 - alive));
        for (let k = 0; k < n; k++) {
          const a = (k / 3) * Math.PI * 2 + rr(0, 1);
          let x = e.x + Math.cos(a) * 2.2;
          let z = e.z + Math.sin(a) * 2.2;
          if (!isWalkable(G.dungeon, x, z)) {
            x = e.x;
            z = e.z;
          }
          const m = spawnEnemy(chance(0.5) ? 'drone' : 'bomber', x, z);
          m.aggro = true;
          burst(x, 1, z, 0xff3355, 12, 4, 0.06, 0.4);
        }
        toWalk(e);
      }
      break;
  }
  return out;
}

function toWalk(e) {
  e.bstate = 'walk';
  e.bt = e.phase2 ? rr(0.6, 1.1) : rr(1.1, 1.8);
}

function chooseBossAttack(e, dist) {
  const opts = ['ring', 'spray', 'charge'];
  if (dist < 4.5) opts.push('slam', 'slam');
  if (e.phase2) opts.push('summon');
  let a = pick(opts);
  if (a === e.lastAtk) a = pick(opts);
  e.lastAtk = a;
  e.wave = 0;
  const p = G.player;
  switch (a) {
    case 'ring':
      e.bstate = 'ring';
      e.bt = 0.4;
      break;
    case 'spray':
      e.bstate = 'spray';
      e.bt = 0.3;
      break;
    case 'charge': {
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const l = Math.hypot(dx, dz) || 1;
      e.cdx = dx / l;
      e.cdz = dz / l;
      e.bstate = 'chargeWind';
      e.bt = e.phase2 ? 0.6 : 0.85;
      lineTelegraph(e.x, e.z, Math.atan2(e.cdz, e.cdx), 11, 2.2, e.bt, 0xff2244);
      sfx.telegraph();
      break;
    }
    case 'slam':
      e.bstate = 'slam';
      e.bt = 1.0;
      telegraphFx(e.x, e.z, 3.8, 1.0, 0xff2244);
      sfx.telegraph();
      break;
    case 'summon':
      e.bstate = 'summon';
      e.bt = 0.6;
      ringFx(e.x, e.z, 2.5, 0xff3355, 0.6);
      break;
  }
}

// ---------------- Povoamento do andar ----------------
export function populateFloor(d, floor, boss) {
  const eliteChance = Math.min(0.35, 0.12 + floor * 0.02);
  for (const r of d.rooms) {
    if (r === d.rooms[0]) continue;
    const area = r.w * r.h;
    let packs = Math.max(1, Math.round(area / 40));
    if (boss && r === d.exitRoom) continue;
    for (let k = 0; k < packs; k++) {
      const cx = r.x + rr(1.5, r.w - 1.5);
      const cz = r.y + rr(1.5, r.h - 1.5);
      const type = pickEnemyType(floor);
      const n = type === 'brute' ? 1 : type === 'bomber' ? 3 + Math.floor(rr(0, 3)) : 2 + Math.floor(rr(0, 2 + floor / 3));
      const elite = chance(eliteChance);
      for (let i = 0; i < n; i++) {
        let x = cx + rr(-1.5, 1.5);
        let z = cz + rr(-1.5, 1.5);
        if (!isWalkable(d, x, z)) {
          x = cx;
          z = cz;
        }
        if (!isWalkable(d, x, z)) continue;
        spawnEnemy(type, x, z, { elite: elite && i === 0 });
      }
      // mistura alguns inimigos de outro tipo
      if (floor >= 2 && chance(0.5)) {
        const t2 = pickEnemyType(floor);
        if (t2 !== 'brute') {
          const x = cx + rr(-1, 1);
          const z = cz + rr(-1, 1);
          if (isWalkable(d, x, z)) spawnEnemy(t2, x, z);
        }
      }
    }
  }
  if (boss) {
    const e = spawnEnemy('boss', d.exit.x, d.exit.z - 2.5 < d.exitRoom.y + 1 ? d.exit.z : d.exit.z - 2.5);
    e.name = floor >= 6 ? `Executor ARC-${9 + Math.floor(floor / 3) - 1}` : 'Executor ARC-9';
    G.dungeon.meshes.exit.locked = true;
  }
}
