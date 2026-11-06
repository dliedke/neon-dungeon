// Personagem do jogador: atributos, movimento, ataques e progressão.
import * as THREE from 'three';
import { G } from './state.js';
import { Input } from './input.js';
import { CLASSES, SKILL_FN, passiveMods } from './classes.js';
import { starterWeapon, SLOTS } from './items.js';
import { makePlayerModel, addShadow, animWalk } from './models.js';
import { resolveCircle, findPath, lineOfSight, revealAround, isWalkable } from './dungeon.js';
import { hitEnemy, enemiesInRadius, healPlayer, nearestEnemy, explosion, damagePlayer } from './combat.js';
import { groundEffect } from './biomes.js';
import { formMods } from './powers.js';
import { DIFFICULTY } from './enemies.js';
import { achAdd } from './ach.js';
import { burst, ringFx, ghostFx, floatText } from './fx.js';
import { sfx } from './audio.js';
import { toast, showDead, markMinimap, levelUpFx, bossBar } from './ui.js';
import { screenToWorld, clamp } from './utils.js';
import { L } from './i18n.js';

export const MAX_LEVEL = 50;
export const xpNeeded = (lvl) => Math.floor(45 * Math.pow(lvl, 1.5));
export const stimPrice = () => 30 + G.floor * 6;
export const MAX_STIMS = 9;

export function newCharacter(cls) {
  return {
    cls, level: 1, xp: 0, credits: 0, stims: 4, floor: 1, maxFloor: 1,
    skills: CLASSES[cls].skills.map((_, i) => (i < 2 ? 1 : 0)), slots: [1, null, null, null, null, null], skillPoints: 0,
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
    // efeitos especiais dos poderes passivos
    dodge: 0, dmgRed: 0, killHeal: 0, killEn: 0, eliteDmg: 0, lowHpDmg: 0, burnPct: 0, chillDmg: 0, costRed: 0,
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
  // poderes passivos da árvore
  const pm = passiveMods(c);
  for (const [k, v] of Object.entries(pm)) {
    if (k === 'hpPct' || k === 'armorPct') continue;
    s[k] = (s[k] || 0) + v;
  }
  if (pm.hpPct) s.maxHp *= 1 + pm.hpPct / 100;
  if (pm.armorPct) s.armor *= 1 + pm.armorPct / 100;
  s.armor = Math.round(s.armor);
  s.dodge = Math.min(s.dodge, 25);
  s.dmgRed = Math.min(s.dmgRed, 30);
  s.costRed = Math.min(s.costRed, 40);
  // dificuldade: no difícil o jogador tem menos vida, blindagem e regeneração; no fácil, mais
  const D = DIFFICULTY[G.settings.difficulty] || DIFFICULTY.normal;
  s.maxHp *= D.pHp;
  s.armor = Math.round(s.armor * D.pArmor);
  s.hpRegen *= D.pRegen;
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
    atkT: 0, swing: 0, swingDir: 1, cds: C.skills.map(() => 0), buffs: {}, invuln: 0,
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
  p.leap = null;
  p.kx = p.kz = 0;
  if (p.model) p.model.body.position.y = 0;
  p.model.root.position.set(x, 0, z);
  p.model.root.rotation.set(0, Math.PI * 1.25, 0);
  p.facing = Math.PI * 1.25;
}

export function skillCost(i) {
  const p = G.player;
  const base = CLASSES[G.char.cls].skills[i].cost;
  if (p.buffs && p.buffs.arcane > 0) return 0; // Santuário Arcano
  return Math.round(base * (p.stats.legs.has('overload') ? 0.7 : 1) * (1 - (p.stats.costRed || 0) / 100));
}

export function skillCd(i) {
  return CLASSES[G.char.cls].skills[i].cd * (1 - G.player.stats.cdr / 100);
}

export function gainXp(n) {
  const c = G.char;
  if (c.level >= MAX_LEVEL) return;
  const p = G.player;
  c.xp += Math.round(n * (1 + (p.stats.xpPct || 0) / 100) * (p.buffs && p.buffs.wisdom > 0 ? 2 : 1));
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
    // avisa quando um poder novo da árvore fica disponível
    const fresh = CLASSES[c.cls].skills.filter((sk) => sk.req === c.level);
    if (fresh.length) setTimeout(() => toast(`✨ ${L('Novo poder disponível', 'New power available')}: <b>${fresh.map((sk) => sk.name).join(', ')}</b> — ${L('abra a árvore (I)', 'open the tree (I)')}`, 'up'), 900);
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
    toast(L('Sem stims! Compre no inventário.', 'No stims! Buy more in the inventory.'), 'warn');
    sfx.deny();
    return;
  }
  if (p.hp >= p.stats.maxHp) {
    sfx.deny();
    return;
  }
  c.stims--;
  achAdd('stims');
  p.stimCd = 1;
  healPlayer(p.stats.maxHp * 0.6);
  p.buffs.regen = 4;
  burst(p.x, 1, p.z, 0x39ff88, 20, 3, 0.06, 0.6, { up: 1.5, grav: -1 });
  sfx.stim();
}

export function playerDie() {
  const p = G.player;
  if (!p.alive) return;
  achAdd('deaths');
  G.char.deaths = (G.char.deaths || 0) + 1;
  if (G.final) G.final.deaths++;
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
      e.model.body.position.y = 0;
      e.phase2 = false;
      e.bstate = 'intro';
      e.bt = 1;
      e.x = e.spawnX ?? e.x;
      e.z = e.spawnZ ?? e.z;
    }
  }
  G.boss = null;
  G.bosses = [];
  bossBar();
  for (const pr of G.projectiles) pr.alive = false;
  for (const h of G.hazards) h.t = 0;
  if (lost > 0) toast(L(`Você perdeu ${lost}¢ no resgate.`, `You lost ${lost}¢ in the rescue.`), 'warn');
  return lost;
}

// ------------------------------------------------------------------
// Atualização por quadro
// ------------------------------------------------------------------
// Mira: tiros e poderes sempre vão direto para um inimigo visível.
// O cursor (ou o analógico direito / a direção do personagem) só serve para
// desempatar qual inimigo escolher quando há vários.
export const AIM_RANGE = 12;
function computeAim(p) {
  // direção de preferência
  let pdx = Math.sin(p.facing);
  let pdz = Math.cos(p.facing);
  const st = Input.aimStick;
  if (G.lastInput === 'kb' && G.mouseWorld.ok) {
    const ax = G.mouseWorld.x - p.x;
    const az = G.mouseWorld.z - p.z;
    const l = Math.hypot(ax, az);
    if (l > 0.8) {
      pdx = ax / l;
      pdz = az / l;
    }
  } else if (G.lastInput === 'pad' && Math.hypot(st.x, st.y) > 0.3) {
    const w = screenToWorld(st.x, st.y);
    const l = Math.hypot(w.x, w.z);
    pdx = w.x / l;
    pdz = w.z / l;
  }
  // alvo: o clicado, o que está sob o cursor, ou o melhor inimigo visível
  let t = (p.target && p.target.alive && p.target) || (G.lastInput === 'kb' && G.hoverEnemy && G.hoverEnemy.alive && G.hoverEnemy) || null;
  if (!t) t = assistTarget(p, pdx, pdz, -1);
  p.aimEnemy = t;
  if (t) {
    const ax = t.x - p.x;
    const az = t.z - p.z;
    const tl = Math.hypot(ax, az) || 1;
    p.aim.dx = ax / tl;
    p.aim.dz = az / tl;
    p.aimPoint.x = t.x;
    p.aimPoint.z = t.z;
  } else {
    p.aim.dx = pdx;
    p.aim.dz = pdz;
    if (G.lastInput === 'kb' && G.mouseWorld.ok) {
      p.aimPoint.x = G.mouseWorld.x;
      p.aimPoint.z = G.mouseWorld.z;
    } else {
      p.aimPoint.x = p.x + pdx * 6;
      p.aimPoint.z = p.z + pdz * 6;
    }
  }
}

function assistTarget(p, dx, dz, minDot) {
  let best = null;
  let bs = -Infinity;
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.invulnerable) continue;
    const ex = e.x - p.x;
    const ez = e.z - p.z;
    const d = Math.hypot(ex, ez);
    if (d > AIM_RANGE || d < 0.01) continue;
    const dot = (ex * dx + ez * dz) / d;
    if (dot < minDot) continue;
    const score = dot * 0.8 - d / 3;
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
  if (!sk || sk.passive || !(G.char.skills[i] > 0)) return;
  if (p.cds[i] > 0) {
    sfx.deny();
    return;
  }
  const cost = skillCost(i);
  if (p.en < cost) {
    sfx.deny();
    toast(L('Energia insuficiente', 'Not enough energy'), 'warn', 'en');
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
  const cdt = p.buffs.chrono > 0 ? dt * 2 : dt; // Santuário de Cronos
  for (let i = 0; i < p.cds.length; i++) p.cds[i] = Math.max(0, p.cds[i] - cdt);
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
  // Lâmina: se o inimigo mirado estiver fora do alcance da espada, avança até ele
  if (wantAttack && (C.melee || C.range < 6) && p.aimEnemy && !vx && !vz && !p.dash && !p.leap) {
    const e = p.aimEnemy;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > C.range + e.r * 0.8 && d < 12) {
      vx = (e.x - p.x) / d;
      vz = (e.z - p.z) / d;
      p.moveDir.x = vx;
      p.moveDir.z = vz;
      wantAttack = false;
    }
  }
  // Colosso: a metralhadora acelera enquanto você segura o ataque
  if (C.spinUp) {
    if (wantAttack && !p.dash && !p.leap) p.spin = Math.min(1, (p.spin || 0) + dt / 1.5);
    else p.spin = Math.max(0, (p.spin || 0) - dt * 1.5);
  }
  if (wantAttack && p.atkT <= 0 && !p.dash && !p.leap) {
    const fm = formMods(p);
    p.atkT = 1 / (s.atkRate * (oc ? 1.5 : 1) * (C.spinUp ? 1 + 2 * p.spin : 1) * (fm && fm.rate ? fm.rate : 1) * (p.buffs.haste > 0 ? 1.3 : 1));
    SKILL_FN[C.skills[0].id](p, c.skills[0]);
    p.facing = Math.atan2(p.aim.dx, p.aim.dz);
    p.lockFace = 0.22;
    p.attackHold = 0.3;
  }
  p.attackHold = Math.max(0, (p.attackHold || 0) - dt);

  // ---------- habilidades ----------
  // 1–6 (X/Y/B/LB/RB/LT no controle) usam os poderes colocados nos 6 espaços
  ['s1', 's2', 's3', 's4', 's5', 's6'].forEach((a, k) => {
    if (!Input.pressed(a)) return;
    const i = c.slots[k];
    if (i == null) {
      sfx.deny();
      toast(L('Espaço vazio: escolha um poder na árvore de habilidades (I).', 'Empty slot: pick a power in the skill tree (I).'), 'warn', 'slot');
      return;
    }
    tryUseSkill(p, i);
  });
  if (Input.pressed('stim')) useStim();

  const fmv = formMods(p);
  let speed = s.speed * (oc ? 1.3 : 1) * (fmv ? fmv.speed : 1) * (p.buffs.haste > 0 ? 1.35 : 1);
  if (p.attackHold > 0) speed *= C.melee ? 0.45 : C.spinUp ? 0.55 : 0.8;
  if (p.whirl) speed *= 0.75;

  // ---------- salto (Jato Propulsor) ----------
  if (p.leap) {
    const lp = p.leap;
    lp.t += dt;
    const k = Math.min(1, lp.t / lp.dur);
    p.x = lp.sx + (lp.tx - lp.sx) * k;
    p.z = lp.sz + (lp.tz - lp.sz) * k;
    p.model.body.position.y = Math.sin(k * Math.PI) * 2.2;
    burst(p.x, 0.6 + Math.sin(k * Math.PI) * 2, p.z, lp.color, 2, 1.5, 0.08, 0.3, { grav: 2 });
    vx = vz = 0;
    p.path = null;
    if (k >= 1) {
      p.leap = null;
      p.model.body.position.y = 0;
      explosion(p.x, p.z, lp.radius || 2.3, lp.mult, { color: lp.color, burn: 0.5, knock: 5 });
      if (lp.radius) G.shake = Math.max(G.shake, 0.45);
    }
  }

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
        hitEnemy(e, ds.mult, { knock: 4, burn: ds.burn, stun: ds.stun });
      }
    }
    if (Math.random() < 0.6) ghostFx(p.model, ds.color);
    burst(p.x, 0.5, p.z, ds.color, 2, 1, 0.06, 0.3, { grav: 0 });
    ds.t -= dt;
    p.facing = Math.atan2(ds.dx, ds.dz);
    if (ds.t <= 0 || moved < step * 0.3) p.dash = null;
    vx = vz = 0;
    p.path = null;
  } else if (!p.leap) {
    // efeitos do piso do bioma
    const ge = groundEffect(G.dungeon, p.x, p.z);
    if (ge) speed *= ge.speed;
    if (p.chillT > 0) {
      p.chillT -= dt;
      speed *= 0.55;
      if (Math.random() < dt * 10) burst(p.x, 1, p.z, 0x8ad8ff, 1, 1, 0.05, 0.4, { grav: -1 });
    }
    if (ge && ge.hurt) {
      p.sludgeT = (p.sludgeT || 0) - dt;
      if (p.sludgeT <= 0) {
        p.sludgeT = 0.5;
        damagePlayer((2 + G.floor * 0.8) * (ge.mult || 1));
      }
      if (Math.random() < dt * 8) burst(p.x, 0.2, p.z, ge.hurt, 1, 1, 0.05, 0.4, { grav: -1 });
    }
    // veneno (escorpiões)
    if (p.poisonT > 0) {
      p.poisonT -= dt;
      p.poisonTick = (p.poisonTick || 0) - dt;
      if (p.poisonTick <= 0) {
        p.poisonTick = 0.5;
        damagePlayer(1.5 + G.floor * 0.6);
      }
      if (Math.random() < dt * 10) burst(p.x, 1.2, p.z, 0x9dff3a, 1, 1, 0.05, 0.4, { grav: -2 });
    }
    // no gelo o movimento escorrega (inércia)
    const k = ge && ge.ice ? Math.min(1, dt * 2.2) : 1;
    p.ivx = (p.ivx || 0) + (vx * speed - (p.ivx || 0)) * k;
    p.ivz = (p.ivz || 0) + (vz * speed - (p.ivz || 0)) * k;
    const push = ge && ge.push ? ge.push : null;
    p.x += (p.ivx + p.kx + (push ? push.x : 0)) * dt;
    p.z += (p.ivz + p.kz + (push ? push.z : 0)) * dt;
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
  } else if (c.cls === 'brawler') {
    if (p.swing > 0) {
      const arm = p.hand ? m.armR : m.armL;
      arm.rotation.x = -1.6 * p.swing;
      m.torso.rotation.y = (p.hand ? -0.4 : 0.4) * p.swing;
    } else m.torso.rotation.y *= 0.8;
  } else if (c.cls === 'lancer') {
    // estocada: braço vai pra frente e volta
    if (p.swing > 0) {
      m.armR.rotation.x = -1.55;
      m.armL.rotation.x = -0.9;
      m.weapon.position.y = -0.25 * Math.sin(p.swing * Math.PI);
      m.torso.rotation.y = -0.3 * p.swing;
    } else {
      m.armR.rotation.x += (-0.5 - m.armR.rotation.x) * 0.3;
      m.weapon.position.y = 0;
      m.torso.rotation.y *= 0.8;
    }
  } else if (c.cls === 'hunter') {
    if (p.attackHold > 0 || p.swing > 0) {
      m.armL.rotation.x = -1.5;
      m.armR.rotation.x = -1.35 + p.swing * 0.35;
    }
    if (p.dash && !p.dash.hit) m.body.rotation.x -= dt * 22;
    else m.body.rotation.x = 0;
  } else if (c.cls === 'pyro' || c.cls === 'frost' || c.cls === 'heavy' || c.cls === 'biohacker') {
    if (p.attackHold > 0 || p.swing > 0) {
      m.armR.rotation.x = -1.45;
      m.armL.rotation.x = -1.3;
    }
    if (m.barrels) m.barrels.rotation.z += dt * (4 + (p.spin || 0) * 40);
    if (m.flameTip) m.flameTip.visible = p.attackHold > 0;
  } else {
    m.deck.position.set(Math.cos(G.t * 2) * 0.55, 1.45 + Math.sin(G.t * 3) * 0.08, Math.sin(G.t * 2) * 0.55);
    m.deck.rotation.y += dt * 2;
    if (p.attackHold > 0) m.armR.rotation.x = -1.6;
  }
  // piscar quando invulnerável/ferido
  const flash = p.hurtT > 0 ? 0.8 : 0;
  for (const mt of m.mats) {
    if (flash) mt.emissive.setScalar(flash);
    else if (p.buffs.titan > 0) mt.emissive.setRGB(0.25, 0.27, 0.32);
    else mt.emissive.setScalar(0);
  }
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

// ------------------------------------------------------------------
// Árvore de habilidades
// ------------------------------------------------------------------
export function skillReq(i) {
  return CLASSES[G.char.cls].skills[i].req || 1;
}

// Gasta 1 ponto: desbloqueia (nível 1) ou evolui a habilidade
export function spendPoint(i) {
  const c = G.char;
  if (c.skillPoints <= 0 || c.skills[i] >= 10 || c.level < skillReq(i)) return false;
  const wasLocked = !(c.skills[i] > 0);
  c.skills[i] = (c.skills[i] || 0) + 1;
  c.skillPoints--;
  // ao desbloquear, coloca no primeiro espaço livre
  if (wasLocked && i > 0 && !CLASSES[c.cls].skills[i].passive) {
    const free = c.slots.indexOf(null);
    if (free >= 0) c.slots[free] = i;
  }
  return true;
}

export function assignSlot(slot, i) {
  const c = G.char;
  if (i > 0 && !(c.skills[i] > 0)) return;
  if (CLASSES[c.cls].skills[i]?.passive) return;
  const prev = c.slots.indexOf(i);
  if (prev >= 0) c.slots[prev] = c.slots[slot];
  c.slots[slot] = i;
}
