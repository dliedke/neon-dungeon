// Personagem do jogador: atributos, movimento, ataques e progressão.
import * as THREE from 'three';
import { G } from './state.js';
import { Input } from './input.js';
import { CLASSES, SKILL_FN } from './classes.js';
import { starterWeapon, SLOTS } from './items.js';
import { makePlayerModel, addShadow, animWalk } from './models.js';
import { resolveCircle, findPath, lineOfSight, revealAround, isWalkable } from './dungeon.js';
import { hitEnemy, enemiesInRadius, healPlayer, nearestEnemy } from './combat.js';
import { burst, ringFx, ghostFx, floatText } from './fx.js';
import { sfx } from './audio.js';
import { toast, showDead, markMinimap, levelUpFx } from './ui.js';
import { screenToWorld, clamp } from './utils.js';

export const MAX_LEVEL = 50;
export const xpNeeded = (lvl) => Math.floor(45 * Math.pow(lvl, 1.5));
export const stimPrice = () => 30 + G.floor * 6;
export const MAX_STIMS = 9;

export function newCharacter(cls) {
  return {
    cls, level: 1, xp: 0, credits: 0, stims: 4, floor: 1, maxFloor: 1,
    skills: [1, 1, 1, 1], skillPoints: 0,
    equip: { weapon: starterWeapon(cls) }, inv: [], kills: 0, created: Date.now(),
  };
}

export function computeStats(c) {
  const C = CLASSES[c.cls];
  const b = C.base;
  const L = c.level;
  const s = {
    maxHp: b.hp + 20 * (L - 1),
    maxEn: b.en + 2 * (L - 1),
    armor: b.armor + 2 * (L - 1),
    speed: b.speed,
    wMin: b.wMin,
    wMax: b.wMax,
    dmgPct: 7 * (L - 1),
    crit: b.crit,
    critDmg: b.critDmg,
    atkRate: b.atkRate,
    atkSpd: 0,
    moveSpd: 0,
    hpRegen: b.hpRegen + 0.15 * (L - 1),
    enRegen: b.enRegen,
    lifeSteal: 0,
    cdr: 0,
    xpPct: 0,
    findPct: 0,
    legs: new Set(),
  };
  for (const slot of SLOTS) {
    const it = c.equip[slot];
    if (!it) continue;
    if (slot === 'weapon') {
      // nunca abaixo da arma base da classe (protege saves antigos)
      s.wMin = Math.max(it.wMin, b.wMin);
      s.wMax = Math.max(it.wMax, b.wMax);
    }
    if (it.armor) s.armor += it.armor;
    for (const [k, v] of Object.entries(it.affixes)) {
      if (k === 'hp') s.maxHp += v;
      else if (k === 'en') s.maxEn += v;
      else s[k] = (s[k] || 0) + v;
    }
    if (it.leg) s.legs.add(it.leg);
  }
  s.crit = Math.min(s.crit, 75);
  s.cdr = Math.min(s.cdr, 40);
  s.lifeSteal = Math.min(s.lifeSteal, 20);
  s.speed *= 1 + Math.min(s.moveSpd, 50) / 100;
  s.atkRate *= 1 + s.atkSpd / 100;
  s.maxHp = Math.round(s.maxHp);
  s.maxEn = Math.round(s.maxEn);
  return s;
}

export function createPlayer() {
  const c = G.char;
  const C = CLASSES[c.cls];
  const model = makePlayerModel(c.cls, C.accent);
  addShadow(model.root, 0.4);
  const light = new THREE.PointLight(C.accent, 22, 10, 1.3);
  light.position.set(0, 2.4, 0);
  model.root.add(light);
  const p = {
    x: 0, z: 0, r: 0.35, model, light, alive: true, facing: 0, phase: 0,
    atkT: 0, swing: 0, swingDir: 1, cds: [0, 0, 0, 0], buffs: {}, invuln: 0,
    dash: null, whirl: null, path: null, pathT: 0, target: null, combo: 0, hand: 0, sureCrit: 0,
    shield: 0, shieldCd: 0, stimCd: 0, hurtT: 0, inCombat: 0, kx: 0, kz: 0,
    aim: { dx: 0, dz: 1 }, aimPoint: { x: 0, z: 0 }, moveDir: { x: 0, z: 0 }, moving: false, revealT: 0,
    exitHold: 0,
  };
  p.stats = computeStats(c);
  p.hp = p.stats.maxHp;
  p.en = p.stats.maxEn;
  G.scene.add(model.root);
  G.player = p;
  return p;
}

export function refreshStats() {
  const p = G.player;
  const old = p.stats;
  p.stats = computeStats(G.char);
  if (old) {
    p.hp = Math.min(p.stats.maxHp, p.hp * (p.stats.maxHp / old.maxHp));
    p.en = Math.min(p.stats.maxEn, p.en);
  }
}

export function placePlayer(x, z) {
  const p = G.player;
  p.x = x;
  p.z = z;
  p.path = null;
  p.target = null;
  p.dash = null;
  p.whirl = null;
  p.kx = p.kz = 0;
  p.model.root.position.set(x, 0, z);
  p.model.root.rotation.set(0, Math.PI * 1.25, 0);
  p.facing = Math.PI * 1.25;
}

export function skillCost(i) {
  const p = G.player;
  const base = CLASSES[G.char.cls].skills[i].cost;
  return Math.round(base * (p.stats.legs.has('overload') ? 0.7 : 1));
}

export function skillCd(i) {
  return CLASSES[G.char.cls].skills[i].cd * (1 - G.player.stats.cdr / 100);
}

export function gainXp(n) {
  const c = G.char;
  if (c.level >= MAX_LEVEL) return;
  const p = G.player;
  c.xp += Math.round(n * (1 + (p.stats.xpPct || 0) / 100));
  let leveled = false;
  while (c.level < MAX_LEVEL && c.xp >= xpNeeded(c.level)) {
    c.xp -= xpNeeded(c.level);
    c.level++;
    c.skillPoints++;
    leveled = true;
  }
  if (leveled) {
    refreshStats();
    p.hp = p.stats.maxHp;
    p.en = p.stats.maxEn;
    levelUpFx(c.level);
    ringFx(p.x, p.z, 3, 0xffd23d, 0.6);
    burst(p.x, 1, p.z, 0xffd23d, 40, 6, 0.08, 0.8, { up: 1.2 });
    sfx.levelup();
  }
}

export function useStim() {
  const p = G.player;
  const c = G.char;
  if (!p.alive || p.stimCd > 0) return;
  if (c.stims <= 0) {
    toast('Sem stims! Compre no inventário.', 'warn');
    sfx.deny();
    return;
  }
  if (p.hp >= p.stats.maxHp) {
    sfx.deny();
    return;
  }
  c.stims--;
  p.stimCd = 1;
  healPlayer(p.stats.maxHp * 0.6);
  p.buffs.regen = 4;
  burst(p.x, 1, p.z, 0x39ff88, 20, 3, 0.06, 0.6, { up: 1.5, grav: -1 });
  sfx.stim();
}

export function playerDie() {
  const p = G.player;
  if (!p.alive) return;
  p.alive = false;
  p.dash = null;
  p.whirl = null;
  sfx.playerDeath();
  burst(p.x, 1, p.z, CLASSES[G.char.cls].accent, 50, 6, 0.08, 1);
  G.mode = 'dying';
  setTimeout(() => {
    G.mode = 'dead';
    showDead();
  }, 1400);
}

export function respawn() {
  const p = G.player;
  const c = G.char;
  const lost = Math.floor(c.credits * 0.1);
  c.credits -= lost;
  p.alive = true;
  p.hp = p.stats.maxHp;
  p.en = p.stats.maxEn;
  p.invuln = 2;
  p.buffs = {};
  p.model.root.rotation.x = 0;
  p.model.root.position.y = 0;
  placePlayer(G.dungeon.start.x, G.dungeon.start.z);
  for (const e of G.enemies) {
    e.aggro = false;
    if (e.boss) {
      e.hp = e.maxHp;
      e.bstate = 'intro';
      e.bt = 1;
      e.x = e.spawnX ?? e.x;
      e.z = e.spawnZ ?? e.z;
    }
  }
  G.boss = null;
  for (const pr of G.projectiles) pr.alive = false;
  if (lost > 0) toast(`Você perdeu ${lost}¢ no resgate.`, 'warn');
  return lost;
}

// ------------------------------------------------------------------
// Atualização por quadro
// ------------------------------------------------------------------
function computeAim(p) {
  const dz = 0.0001;
  const cursorOnPlayer = G.mouseWorld.ok && Math.hypot(G.mouseWorld.x - p.x, G.mouseWorld.z - p.z) < 1.0 && !(p.target && p.target.alive);
  if (G.lastInput === 'kb' && G.mouseWorld.ok && !cursorOnPlayer) {
    let ax = G.mouseWorld.x - p.x;
    let az = G.mouseWorld.z - p.z;
    if (p.target && p.target.alive) {
      ax = p.target.x - p.x;
      az = p.target.z - p.z;
      p.aimPoint.x = p.target.x;
      p.aimPoint.z = p.target.z;
    } else {
      p.aimPoint.x = G.mouseWorld.x;
      p.aimPoint.z = G.mouseWorld.z;
    }
    const l = Math.hypot(ax, az);
    if (l > dz) {
      p.aim.dx = ax / l;
      p.aim.dz = az / l;
    }
    return;
  }
  // controle: analógico direito tem prioridade
  const st = Input.aimStick;
  if (G.lastInput === 'pad' && Math.hypot(st.x, st.y) > 0.3) {
    const w = screenToWorld(st.x, st.y);
    const l = Math.hypot(w.x, w.z);
    p.aim.dx = w.x / l;
    p.aim.dz = w.z / l;
    // mira assistida suave na direção do analógico
    const t = assistTarget(p, p.aim.dx, p.aim.dz, 0.45);
    if (t) {
      const ax = t.x - p.x;
      const az = t.z - p.z;
      const tl = Math.hypot(ax, az);
      p.aim.dx = ax / tl;
      p.aim.dz = az / tl;
      p.aimPoint.x = t.x;
      p.aimPoint.z = t.z;
    } else {
      p.aimPoint.x = p.x + p.aim.dx * 6;
      p.aimPoint.z = p.z + p.aim.dz * 6;
    }
    return;
  }
  // mira automática: inimigo mais próximo, com preferência para a frente
  const fx = Math.sin(p.facing);
  const fz = Math.cos(p.facing);
  const t = assistTarget(p, fx, fz, -0.2) || nearestEnemy(p.x, p.z, 11, true);
  if (t) {
    const ax = t.x - p.x;
    const az = t.z - p.z;
    const tl = Math.hypot(ax, az) || 1;
    p.aim.dx = ax / tl;
    p.aim.dz = az / tl;
    p.aimPoint.x = t.x;
    p.aimPoint.z = t.z;
  } else {
    p.aim.dx = fx;
    p.aim.dz = fz;
    p.aimPoint.x = p.x + fx * 5;
    p.aimPoint.z = p.z + fz * 5;
  }
}

function assistTarget(p, dx, dz, minDot) {
  let best = null;
  let bs = -Infinity;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const ex = e.x - p.x;
    const ez = e.z - p.z;
    const d = Math.hypot(ex, ez);
    if (d > 11 || d < 0.01) continue;
    const dot = (ex * dx + ez * dz) / d;
    if (dot < minDot) continue;
    const score = dot * 2 - d / 6;
    if (score > bs && lineOfSight(G.dungeon, p.x, p.z, e.x, e.z)) {
      bs = score;
      best = e;
    }
  }
  return best;
}

function setMoveTarget(p, x, z) {
  p.path = findPath(G.dungeon, p.x, p.z, x, z);
  p.target = null;
}

function tryUseSkill(p, i) {
  const C = CLASSES[G.char.cls];
  const sk = C.skills[i];
  if (p.cds[i] > 0) {
    sfx.deny();
    return;
  }
  const cost = skillCost(i);
  if (p.en < cost) {
    sfx.deny();
    toast('Energia insuficiente', 'warn', 'en');
    return;
  }
  computeAim(p);
  const ok = SKILL_FN[sk.id](p, G.char.skills[i]);
  if (ok === false) {
    sfx.deny();
    return;
  }
  p.en -= cost;
  p.cds[i] = p.stats.legs.has('echo') && Math.random() < 0.25 ? 0.3 : skillCd(i);
  p.facing = Math.atan2(p.aim.dx, p.aim.dz);
  p.lockFace = 0.25;
  p.inCombat = 4;
}

// Rede de segurança: se o jogador terminar dentro de uma parede, volta ao chão mais próximo
function unstick(p) {
  const d = G.dungeon;
  if (isWalkable(d, p.x, p.z)) {
    p.safeX = p.x;
    p.safeZ = p.z;
    return;
  }
  if (p.safeX !== undefined && isWalkable(d, p.safeX, p.safeZ)) {
    p.x = p.safeX;
    p.z = p.safeZ;
    return;
  }
  const ci = Math.floor(p.x);
  const cj = Math.floor(p.z);
  for (let r = 1; r < 6; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++)
        if (isWalkable(d, ci + di + 0.5, cj + dj + 0.5)) {
          p.x = ci + di + 0.5;
          p.z = cj + dj + 0.5;
          return;
        }
  p.x = d.start.x;
  p.z = d.start.z;
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p.alive) {
    // queda
    const r = p.model.root;
    r.rotation.x = Math.min(Math.PI / 2, r.rotation.x + dt * 4);
    r.position.y = Math.max(-0.2, r.position.y - dt * 0.2);
    return;
  }
  const c = G.char;
  const C = CLASSES[c.cls];
  const s = p.stats;

  // temporizadores
  for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.stimCd = Math.max(0, p.stimCd - dt);
  p.shieldCd = Math.max(0, p.shieldCd - dt);
  p.atkT -= dt;
  p.hurtT -= dt;
  p.inCombat = Math.max(0, (p.inCombat || 0) - dt);
  p.lockFace = Math.max(0, (p.lockFace || 0) - dt);
  for (const k in p.buffs) {
    p.buffs[k] -= dt;
    if (p.buffs[k] <= 0) delete p.buffs[k];
  }
  if (p.shield > 0) p.shield = Math.max(0, p.shield - dt * s.maxHp * 0.02);
  const oc = p.buffs.overclock > 0;

  // regeneração
  const regen = s.hpRegen + (p.buffs.regen > 0 ? s.maxHp * 0.03 : 0) + (p.inCombat > 0 ? 0 : s.maxHp * 0.015);
  p.hp = Math.min(s.maxHp, p.hp + regen * dt);
  p.en = Math.min(s.maxEn, p.en + s.enRegen * dt);

  // ---------- mouse: clique para mover / atacar ----------
  const mouse = Input.mouse;
  let wantAttack = Input.held.primary;
  if (G.lastInput === 'kb' && G.mouseWorld.ok) {
    if (mouse.lmbPressed) {
      if (G.hoverEnemy && G.hoverEnemy.alive) {
        p.target = G.hoverEnemy;
        p.path = null;
      } else if (!mouse.shift) {
        setMoveTarget(p, G.mouseWorld.x, G.mouseWorld.z);
        p.pathT = 0.15;
        ringFx(G.mouseWorld.x, G.mouseWorld.z, 0.45, C.accent, 0.3, { from: 0.15 });
      }
    } else if (mouse.lmb && !p.target && !mouse.shift) {
      p.pathT -= dt;
      if (p.pathT <= 0) {
        p.pathT = 0.15;
        setMoveTarget(p, G.mouseWorld.x, G.mouseWorld.z);
      }
    }
    if (mouse.lmb && mouse.shift) {
      wantAttack = true;
      p.path = null;
      p.target = null;
    }
  }

  computeAim(p);

  // ---------- movimento ----------
  let vx = 0;
  let vz = 0;
  const mv = Input.move;
  const mag = Math.hypot(mv.x, mv.y);
  if (mag > 0.12) {
    p.path = null;
    p.target = null;
    const w = screenToWorld(mv.x, mv.y);
    const l = Math.hypot(w.x, w.z);
    vx = (w.x / l) * Math.min(1, mag);
    vz = (w.z / l) * Math.min(1, mag);
  } else if (p.target) {
    const t = p.target;
    if (!t.alive) {
      p.target = null;
    } else {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const range = C.melee ? C.range + t.r * 0.8 : C.range;
      const los = C.melee || lineOfSight(G.dungeon, p.x, p.z, t.x, t.z);
      if (d <= range && los) {
        wantAttack = true;
        p.path = null;
      } else {
        p.pathT -= dt;
        if (!p.path || p.pathT <= 0) {
          p.pathT = 0.3;
          p.path = findPath(G.dungeon, p.x, p.z, t.x, t.z);
          if (p.path && p.path.length) p.path[p.path.length - 1] = { x: t.x, z: t.z };
        }
      }
      if (!mouse.lmb && G.lastInput !== 'kb') p.target = null;
    }
  }
  if (!vx && !vz && p.path && p.path.length) {
    const wp = p.path[0];
    const dx = wp.x - p.x;
    const dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) {
      p.path.shift();
      if (!p.path.length) p.path = null;
    } else {
      vx = dx / d;
      vz = dz / d;
    }
  }
  p.moveDir.x = vx;
  p.moveDir.z = vz;

  // ---------- ataque básico ----------
  if (wantAttack && p.atkT <= 0 && !p.dash) {
    p.atkT = 1 / (s.atkRate * (oc ? 1.5 : 1));
    SKILL_FN[C.skills[0].id](p, c.skills[0]);
    p.facing = Math.atan2(p.aim.dx, p.aim.dz);
    p.lockFace = 0.22;
    p.attackHold = 0.3;
  }
  p.attackHold = Math.max(0, (p.attackHold || 0) - dt);

  // ---------- habilidades ----------
  if (Input.pressed('s1')) tryUseSkill(p, 1);
  if (Input.pressed('s2')) tryUseSkill(p, 2);
  if (Input.pressed('s3')) tryUseSkill(p, 3);
  if (Input.pressed('stim')) useStim();

  let speed = s.speed * (oc ? 1.3 : 1);
  if (p.attackHold > 0) speed *= C.melee ? 0.45 : 0.8;
  if (p.whirl) speed *= 0.75;

  // ---------- avanço / rolamento ----------
  if (p.dash) {
    const ds = p.dash;
    const step = ds.speed * dt;
    const ox = p.x;
    const oz = p.z;
    p.x += ds.dx * step;
    p.z += ds.dz * step;
    resolveCircle(G.dungeon, p);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    if (ds.hit) {
      for (const e of enemiesInRadius(p.x, p.z, ds.radius)) {
        if (ds.hit.has(e)) continue;
        ds.hit.add(e);
        hitEnemy(e, ds.mult, { knock: 4 });
      }
    }
    if (Math.random() < 0.6) ghostFx(p.model, ds.color);
    burst(p.x, 0.5, p.z, ds.color, 2, 1, 0.06, 0.3, { grav: 0 });
    ds.t -= dt;
    p.facing = Math.atan2(ds.dx, ds.dz);
    if (ds.t <= 0 || moved < step * 0.3) p.dash = null;
    vx = vz = 0;
    p.path = null;
  } else {
    p.x += (vx * speed + p.kx) * dt;
    p.z += (vz * speed + p.kz) * dt;
  }
  const kd = Math.max(0, 1 - dt * 8);
  p.kx *= kd;
  p.kz *= kd;
  resolveCircle(G.dungeon, p);
  unstick(p);
  p.moving = Math.hypot(vx, vz) > 0.1;

  // ---------- turbilhão ----------
  if (p.whirl) {
    const w = p.whirl;
    w.t -= dt;
    w.tick -= dt;
    if (w.tick <= 0) {
      w.tick = 0.2;
      for (const e of enemiesInRadius(p.x, p.z, 2.6)) hitEnemy(e, w.mult, { knock: 1.5, energy: 1 });
      ringFx(p.x, p.z, 2.6, C.accent, 0.22, { from: 1.8, opacity: 0.6 });
      sfx.slash();
    }
    burst(p.x + Math.cos(G.t * 25) * 1.6, 0.75, p.z + Math.sin(G.t * 25) * 1.6, C.accent, 1, 0.5, 0.07, 0.25, { grav: 0 });
    if (w.t <= 0) p.whirl = null;
  }

  // ---------- orientação ----------
  let want = p.facing;
  if (p.whirl) {
    p.facing += dt * 22;
  } else if (!p.dash) {
    if (p.lockFace > 0 || p.attackHold > 0) want = Math.atan2(p.aim.dx, p.aim.dz);
    else if (p.moving) want = Math.atan2(vx, vz);
    else if (G.lastInput === 'kb' && G.mouseWorld.ok && !C.melee) want = Math.atan2(p.aim.dx, p.aim.dz);
    let diff = want - p.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.facing += diff * Math.min(1, dt * 18);
  }

  // ---------- visual ----------
  const m = p.model;
  m.root.position.set(p.x, 0, p.z);
  m.root.rotation.y = p.facing;
  p.phase += dt * speed * 2.4 * (p.moving ? 1 : 0);
  animWalk(m, p.phase, p.moving);
  if (p.swing > 0) p.swing = Math.max(0, p.swing - dt * 6);
  if (c.cls === 'blade') {
    if (p.swing > 0) {
      const k = 1 - p.swing;
      m.armR.rotation.x = -2.4 + k * 3.2;
      m.armR.rotation.z = p.swingDir * (0.8 - k * 1.6);
      m.torso.rotation.y = p.swingDir * (0.5 - k);
    } else {
      m.armR.rotation.z *= 0.8;
      m.torso.rotation.y *= 0.8;
    }
  } else if (c.cls === 'gunner') {
    if (p.attackHold > 0 || p.swing > 0) {
      m.armR.rotation.x = -1.5 + (p.hand ? p.swing * 0.4 : 0);
      m.armL.rotation.x = -1.5 + (!p.hand ? p.swing * 0.4 : 0);
    }
    if (p.dash && p.dash.roll) m.body.rotation.x += dt * 25;
    else m.body.rotation.x = 0;
  } else {
    m.deck.position.set(Math.cos(G.t * 2) * 0.55, 1.45 + Math.sin(G.t * 3) * 0.08, Math.sin(G.t * 2) * 0.55);
    m.deck.rotation.y += dt * 2;
    if (p.attackHold > 0) m.armR.rotation.x = -1.6;
  }
  // piscar quando invulnerável/ferido
  const flash = p.hurtT > 0 ? 0.8 : 0;
  for (const mt of m.mats) mt.emissive.setScalar(flash);
  m.root.visible = !(p.invuln > 0.5 && Math.floor(G.t * 20) % 2 === 0) || !!p.dash;
  p.light.intensity = 22 + (oc ? 12 : 0);

  // ---------- exploração ----------
  p.revealT -= dt;
  if (p.revealT <= 0) {
    p.revealT = 0.2;
    const newly = revealAround(G.dungeon, p.x, p.z, 8);
    if (newly.length) markMinimap(newly);
  }
}

export { clamp };
