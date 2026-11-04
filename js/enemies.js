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
import { L } from './i18n.js';
import { spawnChest } from './loot.js';
import { randomFloorInRoom } from './dungeon.js';
import { beamFx } from './fx.js';
import { lob, spawnHazard, nearestEnemy } from './combat.js';

export const ETYPES = {
  punk: { name: L('Punk de Rua', 'Street Punk'), hp: 30, dmg: 6, speed: 3.4, r: 0.34, h: 1.4, xp: 8, minFloor: 1, weight: 10, ai: 'melee', range: 0.9, atkCd: 1.1, blood: 0xff6a00 },
  drone: { name: L('Drone Vigia', 'Watcher Drone'), hp: 18, dmg: 5, speed: 4.0, r: 0.34, h: 1.5, xp: 7, minFloor: 1, weight: 6, ai: 'ranged', range: 7.5, keep: [4, 6.5], atkCd: 1.8, proj: { speed: 8.5, color: 0xff3355, size: 0.17 }, blood: 0xff3355 },
  soldier: { name: L('Agente Corporativo', 'Corporate Agent'), hp: 42, dmg: 5, speed: 3.0, r: 0.34, h: 1.4, xp: 12, minFloor: 2, weight: 7, ai: 'ranged', range: 9, keep: [5, 8], atkCd: 2.4, burst: 3, proj: { speed: 12, color: 0xffaa00, size: 0.12 }, blood: 0xff2244 },
  bomber: { name: L('Aranha-Bomba', 'Bomb Spider'), hp: 14, dmg: 16, speed: 5.3, r: 0.3, h: 0.7, xp: 6, minFloor: 2, weight: 5, ai: 'bomber', blood: 0xff3300 },
  sentry: { name: L('Torreta de Segurança', 'Sentry Turret'), hp: 50, dmg: 5, speed: 0, r: 0.42, h: 1.1, xp: 14, minFloor: 2, weight: 2, ai: 'sentry', range: 9, atkCd: 2.3, burst: 4, proj: { speed: 10, color: 0xff3355, size: 0.13 }, heavy: true, static: true, solo: true, blood: 0xff3355 },
  shield: { name: L('Tropa de Choque', 'Riot Trooper'), hp: 58, dmg: 10, speed: 2.7, r: 0.42, h: 1.5, xp: 16, minFloor: 3, weight: 4, ai: 'melee', shield: true, range: 1.0, atkCd: 1.5, blood: 0x4d9bff },
  brute: { name: L('Mech Brutamontes', 'Brute Mech'), hp: 160, dmg: 18, speed: 2.2, r: 0.62, h: 2.2, xp: 40, minFloor: 3, weight: 3, ai: 'brute', range: 2.6, atkCd: 2.8, heavy: true, solo: true, blood: 0xffc400 },
  sniper: { name: L('Franco-atirador', 'Sniper'), hp: 26, dmg: 18, speed: 2.8, r: 0.34, h: 1.4, xp: 14, minFloor: 4, weight: 3, ai: 'sniper', range: 14, keep: [8, 12], atkCd: 3.6, blood: 0xff2244 },
  ninja: { name: L('Assassino Holográfico', 'Holo Assassin'), hp: 34, dmg: 10, speed: 5.4, r: 0.32, h: 1.4, xp: 18, minFloor: 5, weight: 3, ai: 'melee', blink: true, range: 0.9, atkCd: 0.85, blood: 0xb36bff },
  medic: { name: L('Drone Médico', 'Medic Drone'), hp: 20, dmg: 0, speed: 3.8, r: 0.34, h: 1.5, xp: 12, minFloor: 2, weight: 0, ai: 'medic', blood: 0x39ff88 },
  barrel: { name: L('Barril Explosivo', 'Explosive Barrel'), hp: 1, dmg: 14, speed: 0, r: 0.35, h: 0.9, xp: 0, minFloor: 1, weight: 0, ai: 'inert', inert: true, static: true, blood: 0xff7a1a },
  boss: { name: 'Executor ARC-9', hp: 560, dmg: 11, speed: 2.5, r: 1.15, h: 3.0, xp: 450, minFloor: 99, weight: 0, ai: 'boss', heavy: true, blood: 0xff2244 },
  queen: { name: L('Matriarca Aracnídea', 'Arachnid Matriarch'), hp: 520, dmg: 11, speed: 3.0, r: 1.3, h: 2.0, xp: 500, minFloor: 99, weight: 0, ai: 'queen', heavy: true, blood: 0x39ff14 },
};

const ELITE = {
  veloz: { name: L('Veloz', 'Swift'), color: 0x00f0ff, apply: (e) => { e.speed *= 1.45; e.atkCdMult = 0.7; } },
  blindado: { name: L('Blindado', 'Armored'), color: 0xc0c8ff, apply: (e) => { e.dr = 0.4; } },
  vampirico: { name: L('Vampírico', 'Vampiric'), color: 0xff2244, apply: (e) => { e.vamp = true; } },
  instavel: { name: L('Instável', 'Unstable'), color: 0xff7a1a, apply: (e) => { e.explodeOnDeath = true; } },
};

// Dificuldade escolhida nas opções: multiplica vida, dano e quantidade de inimigos
export const DIFFICULTY = {
  easy: { name: L('Fácil', 'Easy'), hp: 0.7, dmg: 0.6, count: 0.85 },
  normal: { name: 'Normal', hp: 1, dmg: 1, count: 1 },
  hard: { name: L('Difícil', 'Hard'), hp: 1.35, dmg: 1.35, count: 1.25 },
};
const diff = () => DIFFICULTY[G.settings.difficulty] || DIFFICULTY.normal;

export function floorScale(f) {
  const D = diff();
  return { hp: (1 + (f - 1) * 0.35 + Math.pow(f - 1, 2) * 0.025) * D.hp, dmg: (1 + (f - 1) * 0.18) * D.dmg };
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
    elite: eliteKey, boss: type === 'boss' || type === 'queen', heavy: !!T.heavy, inert: !!T.inert, static: !!T.static,
    height: T.h * (eliteKey ? 1.2 : 1), xp: Math.round(T.xp * (1 + 0.3 * (G.floor - 1))),
    losT: rr(0, 0.3), los: false, strafe: chance(0.5) ? 1 : -1, strafeT: rr(1, 3),
    state: 'idle', bloodColor: T.blood, atkCdMult: 1, name: T.name, spawnX: x, spawnZ: z,
  };
  if (eliteKey) {
    e.hp *= 3.2;
    e.maxHp = e.hp;
    e.dmg *= 1.4;
    e.xp *= 3;
    e.name = L(`${T.name} ${ELITE[eliteKey].name}`, `${ELITE[eliteKey].name} ${T.name}`);
    ELITE[eliteKey].apply(e);
    model.root.scale.setScalar(1.2);
  }
  if (T.inert) {
    e.hp = e.maxHp = 1;
    e.aggro = false;
  }
  if (T.ai === 'sniper') {
    e.laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.laser.visible = false;
    G.world.add(e.laser);
  }
  if (e.boss) {
    e.bstate = 'intro';
    e.bt = 1.2;
    e.phase2 = false;
    e.lastAtk = null;
  }
  addShadow(model.root, e.r / (eliteKey ? 1.2 : 1));
  const bar = makeHpBar(e.boss || T.inert ? 0 : 0.8, !!eliteKey);
  bar.position.y = T.h + 0.35;
  model.root.add(bar);
  e.bar = bar;
  model.root.position.set(x, 0, z);
  model.root.rotation.y = e.facing;
  G.world.add(model.root);
  G.enemies.push(e);
  return e;
}

const laserGeo = new THREE.BoxGeometry(0.05, 0.05, 1).translate(0, 0, 0.5);

export function onEnemyKilled(e) {
  if (e.laser) {
    e.laser.parent && e.laser.parent.remove(e.laser);
    e.laser.material.dispose();
    e.laser = null;
  }
  if (e.boss) {
    G.boss = null;
    bossBar(null);
    banner(L('ALVO NEUTRALIZADO', 'TARGET NEUTRALIZED'), L('O elevador foi liberado', 'The elevator is unlocked'));
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
    if (!e.alive || e.inert) continue;
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
      for (const o of G.enemies) if (o.alive && !o.aggro && !o.inert && Math.hypot(o.x - e.x, o.z - e.z) < 5) o.aggro = true;
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
          if (e.T.blink) {
            e.blinkT = (e.blinkT ?? rr(1, 3)) - dt;
            if (e.blinkT <= 0 && dist > 2.6 && dist < 11 && e.los && !(e.windup > 0)) {
              e.blinkT = rr(3.5, 5);
              const bx = p.x - Math.sin(p.facing) * 1.3;
              const bz = p.z - Math.cos(p.facing) * 1.3;
              if (isWalkable(d, bx, bz)) {
                burst(e.x, 0.8, e.z, 0xb36bff, 16, 4, 0.07, 0.4);
                e.x = bx;
                e.z = bz;
                burst(bx, 0.8, bz, 0xb36bff, 16, 4, 0.07, 0.4);
                sfx.zap();
                e.atkT = Math.min(e.atkT, 0.25);
              }
            }
          }
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
        case 'sniper': {
          const [kmin, kmax] = e.T.keep;
          if (e.aimT > 0) {
            e.aimT -= dt;
            speed = 0;
            if (e.aimT > 0.3) {
              e.lockX = p.x;
              e.lockZ = p.z;
            }
            updateLaser(e, e.lockX, e.lockZ, 1 - e.aimT / 1.3);
            if (e.aimT <= 0) {
              e.laser.visible = false;
              const ddx = e.lockX - e.x;
              const ddz = e.lockZ - e.z;
              const l = Math.hypot(ddx, ddz) || 1;
              spawnProjectile({ from: 'enemy', x: e.x + (ddx / l) * 0.5, z: e.z + (ddz / l) * 0.5, dx: ddx / l, dz: ddz / l, speed: 30, life: 1, dmg: e.dmg, color: 0xff2244, size: 0.11, r: 0.18 });
              sfx.laser();
              e.atkT = e.T.atkCd * e.atkCdMult;
              e.swing = 1;
            }
          } else {
            if (!e.los || dist > kmax) {
              const c = chase();
              if (c) { mvx = c.x; mvz = c.z; }
            } else if (dist < kmin) {
              mvx = -ux;
              mvz = -uz;
            }
            if (e.los && dist < e.T.range && e.atkT <= 0) {
              e.aimT = 1.3;
              e.lockX = p.x;
              e.lockZ = p.z;
              e.laser.visible = true;
              sfx.telegraph();
            }
          }
          e.faceX = (e.lockX ?? p.x) - e.x;
          e.faceZ = (e.lockZ ?? p.z) - e.z;
          break;
        }
        case 'sentry': {
          speed = 0;
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * e.atkCdMult;
            for (let k = 0; k < e.T.burst; k++) {
              after(k * 0.15, () => {
                if (!e.alive) return;
                enemyShoot(e, G.player.x - e.x, G.player.z - e.z, rr(-0.1, 0.1));
              });
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'medic': {
          // fica longe do jogador e perto do aliado mais ferido
          let hurt = null;
          let worst = 0.98;
          for (const o of G.enemies) {
            if (!o.alive || o === e || o.inert || o.T.ai === 'medic') continue;
            const od = Math.hypot(o.x - e.x, o.z - e.z);
            if (od > 10) continue;
            const k = o.hp / o.maxHp;
            if (k < worst) {
              worst = k;
              hurt = o;
            }
          }
          if (dist < 5) {
            mvx = -ux;
            mvz = -uz;
          } else if (hurt && Math.hypot(hurt.x - e.x, hurt.z - e.z) > 3) {
            const hx = hurt.x - e.x;
            const hz = hurt.z - e.z;
            const hl = Math.hypot(hx, hz);
            mvx = hx / hl;
            mvz = hz / hl;
          }
          if (e.atkT <= 0) {
            e.atkT = 2.2;
            let healed = false;
            for (const o of G.enemies) {
              if (!o.alive || o === e || o.inert || o.hp >= o.maxHp) continue;
              if (Math.hypot(o.x - e.x, o.z - e.z) > 5.5) continue;
              const amt = o.maxHp * (o.boss ? 0.03 : 0.15);
              o.hp = Math.min(o.maxHp, o.hp + amt);
              beamFx(e.x, 1.15, e.z, o.x, o.height * 0.6, o.z, 0x39ff88, 0.3);
              floatText(o.x, o.height + 0.3, o.z, `+${Math.round(amt)}`, 'heal');
              healed = true;
            }
            if (healed) sfx.heal();
          }
          e.faceX = hurt ? hurt.x - e.x : ux;
          e.faceZ = hurt ? hurt.z - e.z : uz;
          break;
        }
        case 'queen': {
          const r = updateQueen(e, dt, dist, ux, uz);
          mvx = r.x;
          mvz = r.z;
          speed = r.speed;
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
        const wa = a.static ? 0 : a.heavy ? 0.2 : 1;
        const wb = b.static ? 0 : b.heavy ? 0.2 : 1;
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
        const wa = a.static ? 0 : a.heavy ? 0.15 : 0.5;
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
      e.facing += diff * Math.min(1, dt * (e.boss ? 4 : e.T.shield ? 2.2 : 10));
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
      if (e.T.ai === 'ranged' || e.T.ai === 'sniper') m.armR.rotation.x = -1.4;
      if (e.T.ai === 'sniper') m.armL.rotation.x = -1.3;
      if (m.holo) {
        // assassino holográfico: tremula e fica quase invisível às vezes
        const op = 0.35 + Math.abs(Math.sin(G.t * 3 + e.phase)) * 0.45 + (Math.random() < 0.05 ? 0.3 : 0);
        for (const mt of m.mats) mt.opacity = op;
      }
    } else if (m.kind === 'sentry') {
      m.head.rotation.y = e.facing ? 0 : 0;
      m.head.position.y = 0.72 + (e.atkT > e.T.atkCd - 0.7 ? Math.sin(G.t * 50) * 0.02 : 0);
    } else if (m.kind === 'queen') {
      m.legs.forEach((l, i) => (l.rotation.x = Math.sin(e.phase * 1.4 + i * 1.3) * 0.35));
      m.abdomen.scale.setScalar(1 + Math.sin(G.t * 3) * 0.04);
      m.eyes.material.color.set(e.phase2 ? 0xff2244 : 0x39ff14).multiplyScalar(2.6);
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
  banner(e.name.toUpperCase(), e.type === 'queen' ? L('Mãe de todas as aranhas-bomba', 'Mother of all bomb spiders') : L('Unidade de execução corporativa', 'Corporate execution unit'));
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
    toast(L('ARC-9: PROTOCOLO DE EXTERMÍNIO ATIVADO', 'ARC-9: EXTERMINATION PROTOCOL ENGAGED'), 'warn');
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
        const alive = G.enemies.filter((o) => o.alive && !o.boss && !o.inert).length;
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
  const D = diff();
  const eliteChance = floor <= 1 ? 0 : Math.min(0.3, 0.04 + floor * 0.025);
  const emptyChance = Math.max(0, 0.15 - floor * 0.05); // algumas salas vazias nos primeiros andares
  const perPack = Math.max(32, 52 - floor * 5); // área por grupo (menor = mais grupos)
  for (const r of d.rooms) {
    if (r === d.rooms[0]) continue;
    if (boss && r === d.exitRoom) continue;
    if (chance(emptyChance)) continue;
    const area = r.w * r.h;
    const packs = Math.max(1, Math.round((area / perPack) * D.count));
    for (let k = 0; k < packs; k++) {
      const cx = r.x + rr(1.5, r.w - 1.5);
      const cz = r.y + rr(1.5, r.h - 1.5);
      const type = pickEnemyType(floor);
      const base = ETYPES[type].solo ? 1 : type === 'bomber' ? 2 + Math.floor(rr(0, 1 + floor / 3)) : 1 + Math.floor(rr(0, 2.2 + floor / 2.5));
      const n = Math.max(1, Math.round(base * D.count));
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
      // médico de campo acompanhando o grupo
      if (floor >= 2 && !ETYPES[type].solo && chance(Math.min(0.3, 0.1 + floor * 0.03))) {
        const x = cx + rr(-1, 1);
        const z = cz + rr(-1, 1);
        if (isWalkable(d, x, z)) spawnEnemy('medic', x, z);
      }
      // mistura alguns inimigos de outro tipo
      if (floor >= 3 && chance(0.4)) {
        const t2 = pickEnemyType(floor);
        if (!ETYPES[t2].solo) {
          const x = cx + rr(-1, 1);
          const z = cz + rr(-1, 1);
          if (isWalkable(d, x, z)) spawnEnemy(t2, x, z);
        }
      }
    }
  }
  // barris explosivos e cofres
  for (const r of d.rooms) {
    if (r === d.rooms[0] || !chance(0.45)) continue;
    const n = 1 + Math.floor(rr(0, 2.5));
    for (let k = 0; k < n; k++) {
      const pt = randomFloorInRoom(d, r, 1);
      if (Math.hypot(pt.x - d.exit.x, pt.z - d.exit.z) > 2.5) spawnEnemy('barrel', pt.x, pt.z);
    }
  }
  const chestRooms = d.rooms.filter((r) => r !== d.rooms[0] && r !== d.exitRoom).sort(() => Math.random() - 0.5);
  const nChests = Math.min(chestRooms.length, floor < 3 ? 1 : 2);
  for (let k = 0; k < nChests; k++) {
    const pt = randomFloorInRoom(d, chestRooms[k], 1);
    spawnChest(pt.x, pt.z);
  }
  if (boss) {
    const kind = Math.round(floor / 3) % 2 === 1 ? 'boss' : 'queen';
    const e = spawnEnemy(kind, d.exit.x, d.exit.z - 2.5 < d.exitRoom.y + 1 ? d.exit.z : d.exit.z - 2.5);
    if (kind === 'boss') e.name = floor >= 9 ? `Executor ARC-${9 + Math.floor(floor / 6)}` : 'Executor ARC-9';
    G.dungeon.meshes.exit.locked = true;
  }
}

// ---------------- Laser do franco-atirador ----------------
function updateLaser(e, tx, tz, k) {
  const L = e.laser;
  if (!L) return;
  L.visible = true;
  L.position.set(e.x, 1.0, e.z);
  L.lookAt(tx, 1.0, tz);
  L.scale.set(1 + k * 1.5, 1 + k * 1.5, Math.hypot(tx - e.x, tz - e.z) + 2);
  L.material.opacity = 0.25 + k * 0.6 + (k > 0.75 ? Math.sin(G.t * 60) * 0.2 : 0);
}

// ---------------- Chefe 2: Matriarca Aracnídea ----------------
function updateQueen(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  e.faceX = ux;
  e.faceZ = uz;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) {
    e.phase2 = true;
    e.speed *= 1.2;
    toast(L('A MATRIARCA ESTÁ FURIOSA!', 'THE MATRIARCH IS ENRAGED!'), 'warn');
    sfx.boss();
    ringFx(e.x, e.z, 5, 0x39ff14, 0.6);
    G.shake = 0.4;
    e.bstate = 'walk';
    e.bt = 0.5;
  }
  e.bt -= dt;
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1;
      }
      break;
    case 'walk':
      if (dist > 2.8) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed;
      }
      if (e.bt <= 0) {
        const opts = ['spit', 'leap', 'brood'];
        if (dist < 4) opts.push('sweep', 'sweep');
        let a = pick(opts);
        if (a === e.lastAtk) a = pick(opts);
        if (a === 'brood' && G.enemies.filter((o) => o.alive && o.type === 'bomber').length > 5) a = 'spit';
        e.lastAtk = a;
        e.wave = 0;
        if (a === 'spit') {
          e.bstate = 'spit';
          e.bt = 0.3;
        } else if (a === 'leap') {
          e.bstate = 'leapWind';
          e.bt = 0.55;
          e.lx = p.x;
          e.lz = p.z;
          e.sx = e.x;
          e.sz = e.z;
          telegraphFx(e.lx, e.lz, 2.7, 0.55 + 0.75, 0x39ff14);
          sfx.telegraph();
        } else if (a === 'brood') {
          e.bstate = 'brood';
          e.bt = 0.7;
          ringFx(e.x, e.z, 2.5, 0x39ff14, 0.7);
        } else {
          e.bstate = 'sweep';
          e.bt = 0.85;
          telegraphFx(e.x, e.z, 3.4, 0.85, 0x39ff14);
          sfx.telegraph();
        }
      }
      break;
    case 'spit':
      if (e.bt <= 0) {
        const n = e.phase2 ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const tx = p.x + (k === 0 ? 0 : rr(-3, 3));
          const tz = p.z + (k === 0 ? 0 : rr(-3, 3));
          if (!isWalkable(G.dungeon, tx, tz)) continue;
          telegraphFx(tx, tz, 1.6, 0.8, 0x39ff14);
          lob({ x: e.x, z: e.z, tx, tz, time: 0.8, color: 0x39ff14, onLand: (x, z) => spawnHazard(x, z, 1.6, 5, e.dmg * 0.6) });
        }
        sfx.enemyShot();
        e.wave++;
        e.bt = 0.9;
        if (e.wave >= (e.phase2 ? 2 : 1)) toWalk(e);
      }
      break;
    case 'leapWind':
      e.faceX = e.lx - e.x;
      e.faceZ = e.lz - e.z;
      if (e.bt <= 0) {
        e.bstate = 'leap';
        e.bt = 0.75;
        sfx.dash();
      }
      break;
    case 'leap': {
      const k = 1 - Math.max(0, e.bt) / 0.75;
      e.x = e.sx + (e.lx - e.sx) * k;
      e.z = e.sz + (e.lz - e.sz) * k;
      e.model.body.position.y = Math.sin(k * Math.PI) * 3;
      if (e.bt <= 0) {
        e.model.body.position.y = 0;
        if (Math.hypot(p.x - e.x, p.z - e.z) < 2.7 + p.r) damagePlayer(e.dmg * 1.6);
        ringFx(e.x, e.z, 2.7, 0x39ff14, 0.4, { from: 0.4 });
        burst(e.x, 0.3, e.z, 0x39ff14, 40, 8, 0.09, 0.6, { up: 0.4 });
        sfx.explode();
        G.shake = 0.45;
        if (e.phase2 && !e.leapedTwice) {
          e.leapedTwice = true;
          e.bstate = 'leapWind';
          e.bt = 0.45;
          e.lx = p.x;
          e.lz = p.z;
          e.sx = e.x;
          e.sz = e.z;
          telegraphFx(e.lx, e.lz, 2.7, 1.2, 0x39ff14);
        } else {
          e.leapedTwice = false;
          toWalk(e);
        }
      }
      break;
    }
    case 'brood':
      if (e.bt <= 0) {
        const n = e.phase2 ? 4 : 3;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rr(0, 1);
          let x = e.x + Math.cos(a) * 1.8;
          let z = e.z + Math.sin(a) * 1.8;
          if (!isWalkable(G.dungeon, x, z)) {
            x = e.x;
            z = e.z;
          }
          const m = spawnEnemy('bomber', x, z);
          m.aggro = true;
          m.xp = 2;
          burst(x, 0.5, z, 0x39ff14, 10, 3, 0.06, 0.4);
        }
        toWalk(e);
      }
      break;
    case 'sweep':
      if (e.bt <= 0) {
        if (Math.hypot(p.x - e.x, p.z - e.z) < 3.4 + p.r) damagePlayer(e.dmg * 1.4);
        ringFx(e.x, e.z, 3.4, 0x39ff14, 0.35, { from: 0.6 });
        burst(e.x, 0.4, e.z, 0x39ff14, 30, 7, 0.08, 0.5, { up: 0.3 });
        sfx.slash();
        G.shake = 0.3;
        toWalk(e);
      }
      break;
  }
  return out;
}
