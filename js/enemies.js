// Tipos de inimigos, elites, IA e o chefe ARC-9.
import * as THREE from 'three';
import { G, gk } from './state.js';
import { rr, pick, chance, weightedPick, shuffle } from './utils.js';
import { makeEnemyModel, makeHpBar, addShadow, animWalk, glowMat } from './models.js';
import { resolveCircle, lineOfSight, flowDir, isWalkable, isWalkableTile, isFinalFloor } from './dungeon.js';
import { spawnProjectile, damagePlayer, after, enemyExplosion, damageEnemy } from './combat.js';
import { burst, ringFx, telegraphFx, lineTelegraph, floatText, slashFx } from './fx.js';
import { sfx } from './audio.js';
import { toast, bossBar, banner } from './ui.js';
import { L } from './i18n.js';
import { groundEffect } from './biomes.js';
import { achAdd, achMark } from './ach.js';
import { timeFactor } from './powers.js';
import { spawnChest, spawnPickup, spawnShrine, SHRINES } from './loot.js';
import { randomFloorInRoom } from './dungeon.js';
import { beamFx, particle } from './fx.js';
import { lob, spawnHazard, nearestEnemy } from './combat.js';

export const ETYPES = {
  punk: { name: L('Punk de Rua', 'Street Punk'), hp: 30, dmg: 6, speed: 3.4, r: 0.34, h: 1.4, xp: 8, minFloor: 1, weight: 10, ai: 'melee', range: 0.9, atkCd: 1.1, blood: 0xff6a00 },
  drone: { name: L('Drone Vigia', 'Watcher Drone'), fly: true, hp: 18, dmg: 5, speed: 4.0, r: 0.34, h: 1.5, xp: 7, minFloor: 1, weight: 6, ai: 'ranged', range: 7.5, keep: [4, 6.5], atkCd: 1.8, proj: { speed: 8.5, color: 0xff3355, size: 0.17 }, blood: 0xff3355 },
  soldier: { name: L('Agente Corporativo', 'Corporate Agent'), hp: 42, dmg: 5, speed: 3.0, r: 0.34, h: 1.4, xp: 12, minFloor: 2, weight: 7, ai: 'ranged', range: 9, keep: [5, 8], atkCd: 2.4, burst: 3, proj: { speed: 12, color: 0xffaa00, size: 0.12 }, blood: 0xff2244 },
  bomber: { name: L('Aranha-Bomba', 'Bomb Spider'), hp: 14, dmg: 16, speed: 5.3, r: 0.3, h: 0.7, xp: 6, minFloor: 2, weight: 5, ai: 'bomber', blood: 0xff3300 },
  sentry: { name: L('Torreta de Segurança', 'Sentry Turret'), hp: 50, dmg: 5, speed: 0, r: 0.42, h: 1.1, xp: 14, minFloor: 2, weight: 2, ai: 'sentry', range: 9, atkCd: 2.3, burst: 4, proj: { speed: 10, color: 0xff3355, size: 0.13 }, heavy: true, static: true, solo: true, blood: 0xff3355 },
  shield: { name: L('Tropa de Choque', 'Riot Trooper'), hp: 58, dmg: 10, speed: 2.7, r: 0.42, h: 1.5, xp: 16, minFloor: 3, weight: 4, ai: 'melee', shield: true, range: 1.0, atkCd: 1.5, blood: 0x4d9bff },
  brute: { name: L('Mech Brutamontes', 'Brute Mech'), hp: 160, dmg: 18, speed: 2.2, r: 0.62, h: 2.2, xp: 40, minFloor: 3, weight: 3, ai: 'brute', range: 2.6, atkCd: 2.8, heavy: true, solo: true, blood: 0xffc400 },
  sniper: { name: L('Franco-atirador', 'Sniper'), hp: 26, dmg: 18, speed: 2.8, r: 0.34, h: 1.4, xp: 14, minFloor: 4, weight: 3, ai: 'sniper', range: 14, keep: [8, 12], atkCd: 3.6, blood: 0xff2244 },
  ninja: { name: L('Assassino Holográfico', 'Holo Assassin'), hp: 34, dmg: 10, speed: 5.4, r: 0.32, h: 1.4, xp: 18, minFloor: 5, weight: 3, ai: 'melee', blink: true, range: 0.9, atkCd: 0.85, blood: 0xb36bff },
  kamikaze: { name: L('Drone Kamikaze', 'Kamikaze Drone'), fly: true, hp: 12, dmg: 18, speed: 3.8, r: 0.3, h: 1.3, xp: 6, minFloor: 3, weight: 4, ai: 'kamikaze', blood: 0xff8800 },
  illusionist: { name: L('Ilusionista', 'Illusionist'), hp: 40, dmg: 9, speed: 3.0, r: 0.34, h: 1.5, xp: 22, minFloor: 4, weight: 3, ai: 'illusionist', range: 10, keep: [6, 9], atkCd: 2.1, solo: true, blood: 0xd04dff },
  tank: { name: L('Tanque Lança-mísseis', 'Missile Tank'), hp: 150, dmg: 14, speed: 1.6, r: 0.72, h: 1.4, xp: 45, minFloor: 4, weight: 2, ai: 'tank', range: 13, keep: [6, 11], atkCd: 4.2, heavy: true, solo: true, blood: 0xffaa00 },
  medic: { name: L('Drone Médico', 'Medic Drone'), fly: true, hp: 20, dmg: 0, speed: 3.8, r: 0.34, h: 1.5, xp: 12, minFloor: 2, weight: 0, ai: 'medic', blood: 0x39ff88 },
  barrel: { name: L('Barril Explosivo', 'Explosive Barrel'), hp: 1, dmg: 14, speed: 0, r: 0.35, h: 0.9, xp: 0, minFloor: 1, weight: 0, ai: 'inert', inert: true, static: true, blood: 0xff7a1a },
  scrap: { name: L('Rei do Ferro-Velho', 'Scrap King'), boss: true, hp: 620, dmg: 13, speed: 2.0, r: 1.3, h: 3.2, xp: 550, minFloor: 99, weight: 0, ai: 'scrap', heavy: true, blood: 0xffaa00 },
  reaper: { name: L('Ceifadora Fantasma', 'Phantom Reaper'), boss: true, hp: 470, dmg: 12, speed: 4.0, r: 0.8, h: 2.8, xp: 550, minFloor: 99, weight: 0, ai: 'reaper', heavy: true, blood: 0xb36bff },
  gunship: { name: L('Nave de Ataque', 'Assault Gunship'), boss: true, fly: true, hp: 540, dmg: 10, speed: 4.5, r: 1.4, h: 3.4, xp: 600, minFloor: 99, weight: 0, ai: 'gunship', heavy: true, blood: 0x00f0ff },
  hacker: { name: L('Hacker Supremo', 'Grand Hacker'), boss: true, hp: 430, dmg: 12, speed: 3.2, r: 0.6, h: 2.2, xp: 600, minFloor: 99, weight: 0, ai: 'hackerboss', heavy: true, blood: 0x39ff14 },
  omega: { name: L('Núcleo OMEGA', 'OMEGA Core'), boss: true, hp: 650, dmg: 13, speed: 0, r: 1.5, h: 3.4, xp: 700, minFloor: 99, weight: 0, ai: 'omega', heavy: true, static: true, blood: 0xff2244 },
  // fauna dos biomas naturais/espaço (só aparecem no bioma deles)
  ghost: { name: L('Fantasma', 'Ghost'), fly: true, phase: true, hp: 28, dmg: 9, speed: 3.0, r: 0.38, h: 1.7, xp: 10, minFloor: 99, weight: 0, ai: 'ghost', atkCd: 1.0, blood: 0xbfffff },
  wisp: { name: L('Fogo-Fátuo', 'Wisp'), fly: true, hp: 12, dmg: 12, speed: 4.8, r: 0.26, h: 1.2, xp: 6, minFloor: 99, weight: 0, ai: 'wisp', blood: 0x7affc8 },
  boar: { name: L('Javali Mutante', 'Mutant Boar'), hp: 60, dmg: 14, speed: 3.2, r: 0.5, h: 1.0, xp: 14, minFloor: 99, weight: 0, ai: 'boar', atkCd: 3.2, heavy: true, blood: 0xff8a00 },
  toad: { name: L('Sapo Ácido', 'Acid Toad'), hp: 34, dmg: 8, speed: 2.8, r: 0.38, h: 0.8, xp: 11, minFloor: 99, weight: 0, ai: 'toad', keep: [4, 8], range: 9, atkCd: 2.6, blood: 0x9dff3a },
  alien: { name: L('Xenomorfo', 'Xeno Stalker'), hp: 42, dmg: 11, speed: 4.6, r: 0.4, h: 1.1, xp: 15, minFloor: 99, weight: 0, ai: 'alien', range: 0.9, atkCd: 2.4, blood: 0xb36bff },
  scorpion: { name: L('Escorpião Radioativo', 'Rad Scorpion'), hp: 52, dmg: 9, speed: 3.0, r: 0.45, h: 0.8, xp: 14, minFloor: 99, weight: 0, ai: 'melee', poison: true, range: 1.1, atkCd: 1.2, blood: 0xc8ff3a },
  // fauna da neve, da montanha e do vulcão
  yeti: { name: L('Yeti Ciborgue', 'Cyber Yeti'), hp: 120, dmg: 16, speed: 2.6, r: 0.6, h: 2.2, xp: 32, minFloor: 99, weight: 0, ai: 'yeti', range: 2.4, atkCd: 2.6, heavy: true, solo: true, blood: 0x8ad8ff },
  icewolf: { name: L('Lobo de Gelo', 'Frost Wolf'), hp: 32, dmg: 8, speed: 5.0, r: 0.36, h: 0.9, xp: 10, minFloor: 99, weight: 0, ai: 'melee', chill: true, range: 0.9, atkCd: 1.0, blood: 0xbfe6ff },
  goat: { name: L('Bode Blindado', 'Armored Ram'), hp: 55, dmg: 13, speed: 3.4, r: 0.45, h: 1.1, xp: 14, minFloor: 99, weight: 0, ai: 'boar', atkCd: 3.0, heavy: true, blood: 0xffb35a },
  eagle: { name: L('Águia Biônica', 'Bionic Eagle'), fly: true, hp: 26, dmg: 11, speed: 5.2, r: 0.4, h: 1.7, xp: 13, minFloor: 99, weight: 0, ai: 'eagle', atkCd: 2.8, blood: 0xffe0a0 },
  salamander: { name: L('Salamandra de Magma', 'Magma Salamander'), hp: 36, dmg: 9, speed: 3.2, r: 0.38, h: 0.6, xp: 12, minFloor: 99, weight: 0, ai: 'toad', spit: 0xff6a00, fireproof: true, keep: [4, 8], range: 9, atkCd: 2.4, blood: 0xff6a00 },
  magmagolem: { name: L('Golem de Magma', 'Magma Golem'), hp: 190, dmg: 20, speed: 1.9, r: 0.65, h: 2.3, xp: 45, minFloor: 99, weight: 0, ai: 'brute', trail: true, fireproof: true, range: 2.6, atkCd: 2.8, heavy: true, solo: true, blood: 0xff5a1a },
  // inimigos novos da corporação (aparecem em qualquer bioma urbano)
  hound: { name: L('Cão Cibernético', 'Cyber Hound'), hp: 30, dmg: 9, speed: 5.2, r: 0.36, h: 0.9, xp: 11, minFloor: 4, weight: 4, ai: 'alien', range: 0.9, atkCd: 2.0, blood: 0xff2244 },
  tesladrone: { name: L('Drone Tesla', 'Tesla Drone'), fly: true, hp: 28, dmg: 12, speed: 3.6, r: 0.34, h: 1.5, xp: 14, minFloor: 5, weight: 3, ai: 'tesla', range: 5, keep: [3, 4.5], atkCd: 2.8, blood: 0x00f0ff },
  flamer: { name: L('Lança-Chamas', 'Flame Trooper'), hp: 55, dmg: 4, speed: 3.0, r: 0.36, h: 1.4, xp: 18, minFloor: 6, weight: 3, ai: 'flamer', range: 3.6, atkCd: 3.2, fireproof: true, blood: 0xff6a00 },
  mortar: { name: L('Aranha-Morteiro', 'Mortar Walker'), hp: 70, dmg: 14, speed: 1.6, r: 0.5, h: 1.2, xp: 24, minFloor: 7, weight: 2, ai: 'mortar', range: 14, keep: [7, 12], atkCd: 3.8, heavy: true, solo: true, blood: 0xffaa00 },
  // evento raro: foge, solta créditos pelo caminho e some se você demorar
  thief: { name: L('Ladrão de Dados', 'Data Thief'), hp: 65, dmg: 0, speed: 4.6, r: 0.34, h: 1.4, xp: 60, minFloor: 99, weight: 0, ai: 'thief', blood: 0xffd23d },
  pylon: { name: L('Pilar de Escudo', 'Shield Pylon'), hp: 38, dmg: 0, speed: 0, r: 0.45, h: 2.4, xp: 15, minFloor: 99, weight: 0, ai: 'pylon', heavy: true, static: true, blood: 0x00f0ff },
  boss: { name: 'Executor ARC-9', boss: true, hp: 560, dmg: 11, speed: 2.5, r: 1.15, h: 3.0, xp: 450, minFloor: 99, weight: 0, ai: 'boss', heavy: true, blood: 0xff2244 },
  queen: { name: L('Matriarca Aracnídea', 'Arachnid Matriarch'), boss: true, hp: 520, dmg: 11, speed: 3.0, r: 1.3, h: 2.0, xp: 500, minFloor: 99, weight: 0, ai: 'queen', heavy: true, blood: 0x39ff14 },
};

const ELITE = {
  veloz: { name: L('Veloz', 'Swift'), color: 0x00f0ff, apply: (e) => { e.speed *= 1.45; e.atkCdMult = 0.7; } },
  blindado: { name: L('Blindado', 'Armored'), color: 0xc0c8ff, apply: (e) => { e.dr = 0.4; } },
  vampirico: { name: L('Vampírico', 'Vampiric'), color: 0xff2244, apply: (e) => { e.vamp = true; } },
  instavel: { name: L('Instável', 'Unstable'), color: 0xff7a1a, apply: (e) => { e.explodeOnDeath = true; } },
};

// Dificuldade escolhida nas opções: multiplica vida, dano e quantidade de inimigos.
// Chefes têm multiplicadores próprios; bossTempo encurta a pausa entre os ataques
// (os avisos no chão continuam com a mesma duração, para continuar justo).
// Também mexe no jogador: pHp (vida máxima), pArmor (blindagem) e pRegen (regeneração de vida).
// A quantidade quase não muda: no fácil vêm muitos inimigos, mas morrem rápido.
export const DIFFICULTY = {
  easy: { name: L('Fácil', 'Easy'), hp: 0.55, dmg: 0.5, count: 1.0, bossHp: 1.0, bossDmg: 0.8, bossTempo: 1.05, pHp: 1.3, pArmor: 1.3, pRegen: 1.6 },
  normal: { name: 'Normal', hp: 1.15, dmg: 1.12, count: 1.1, bossHp: 2.0, bossDmg: 1.4, bossTempo: 1.65, pHp: 1, pArmor: 1, pRegen: 1 },
  hard: { name: L('Difícil', 'Hard'), hp: 1.8, dmg: 1.7, count: 1.2, bossHp: 2.8, bossDmg: 1.75, bossTempo: 2.15, pHp: 0.85, pArmor: 0.7, pRegen: 0.5 },
};
const diff = () => DIFFICULTY[G.settings.difficulty] || DIFFICULTY.normal;

export function floorScale(f) {
  const D = diff();
  return { hp: (1 + (f - 1) * 0.35 + Math.pow(f - 1, 2) * 0.025) * D.hp, dmg: (1 + (f - 1) * 0.18) * D.dmg };
}

// Cada bioma favorece sua fauna; nos naturais quase não aparecem robôs
export function pickEnemyType(floor, theme = G.theme) {
  const fauna = (theme && theme.fauna) || [];
  const list = Object.keys(ETYPES).filter((k) => fauna.includes(k) || (ETYPES[k].minFloor <= floor && ETYPES[k].weight > 0));
  return weightedPick(list, (k) => (fauna.includes(k) ? (theme.natural ? 12 : 30) : ETYPES[k].weight * (theme && theme.natural ? 0.2 : 1)));
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
    elite: eliteKey, boss: !!T.boss && !o.decoy, heavy: !!T.heavy, inert: !!T.inert, static: !!T.static,
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
  if (o.decoy) {
    e.decoy = true;
    e.hp = e.maxHp = 1;
    e.xp = 0;
    e.aggro = true;
  }
  if (T.inert) {
    e.hp = e.maxHp = 1;
    e.aggro = false;
  }
  if (T.ai === 'sniper') {
    e.laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(gk(2)), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.laser.visible = false;
    G.world.add(e.laser);
  }
  if (e.boss) {
    const D = diff();
    e.hp = e.maxHp = e.hp * D.bossHp;
    e.dmg *= D.bossDmg;
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
  // se a Ilusionista verdadeira morre, as cópias somem
  if (e.decoys) {
    for (const c of e.decoys) {
      if (!c.alive) continue;
      c.alive = false;
      c.selfDestruct = true;
      burst(c.x, 0.9, c.z, 0xd04dff, 14, 3, 0.07, 0.4);
      onEnemyKilled(c);
    }
  }
  if (e.decoy) burst(e.x, 0.9, e.z, 0xd04dff, 20, 4, 0.07, 0.45);
  if (e.pylons) for (const py of e.pylons) if (py.alive) killQuiet(py);
  if (e.beams) for (const b of e.beams) b.parent && b.parent.remove(b);
  if (e.zones) for (const z of e.zones) z.mesh.parent && z.mesh.parent.remove(z.mesh);
  if (e.walls) for (const w of e.walls) w.group.parent && w.group.parent.remove(w.group);
  if (e.laser) {
    e.laser.parent && e.laser.parent.remove(e.laser);
    e.laser.material.dispose();
    e.laser = null;
  }
  if (e.boss) {
    G.bosses = G.bosses.filter((b) => b !== e);
    G.boss = G.bosses[0] || null;
    bossBar();
    if (G.final) finalBossDown(e);
    else {
      banner(L('ALVO NEUTRALIZADO', 'TARGET NEUTRALIZED'), L('O elevador foi liberado', 'The elevator is unlocked'));
      sfx.levelup();
      G.dungeon.meshes.exit.locked = false;
    }
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
  if (e.T.poison && G.player.invuln <= 0) G.player.poisonT = 4;
  if (e.T.chill && G.player.invuln <= 0) G.player.chillT = Math.max(G.player.chillT || 0, 1.4);
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
    const edt = G.warps.length ? dt * timeFactor(e.x, e.z) : dt;
    // a isca holográfica atrai os inimigos próximos
    const tgt = G.decoy && Math.hypot(G.decoy.x - e.x, G.decoy.z - e.z) < 14 ? G.decoy : p;
    const dx = tgt.x - e.x;
    const dz = tgt.z - e.z;
    const dist = Math.hypot(dx, dz);
    if (Math.hypot(p.x - e.x, p.z - e.z) > 30 && !e.boss && !e.fleeT) continue;

    // queimadura / lentidão / congelamento
    if (e.burnT > 0) {
      e.burnT -= edt;
      e.burnTick = (e.burnTick || 0) - edt;
      if (Math.random() < edt * 12) burst(e.x, e.height * rr(0.3, 1), e.z, e.burnColor || 0xff6a00, 1, 1, 0.07, 0.4, { grav: -3 });
      if (e.burnTick <= 0) {
        e.burnTick = 0.5;
        damageEnemy(e, e.burnDps * 0.5, false, { dot: true });
        if (!e.alive) continue;
      }
    }
    if (e.slowT > 0) e.slowT -= edt;
    if (e.frozenT > 0) e.frozenT -= edt;

    e.losT -= edt;
    if (e.losT <= 0) {
      e.losT = 0.25;
      e.los = dist < 16 && lineOfSight(d, e.x, e.z, tgt.x, tgt.z);
      if (!e.aggro && (e.los || e.T.phase) && dist < (e.boss ? 9 : 10)) {
        e.aggro = true;
        e.alerted = true;
      }
    }
    if (e.alerted) {
      e.alerted = false;
      for (const o of G.enemies) if (o.alive && !o.aggro && !o.inert && Math.hypot(o.x - e.x, o.z - e.z) < 5) o.aggro = true;
      if (e.boss) startBoss(e);
    }
    if (e.aggro && p.alive) anyAggro = true;

    e.atkT -= edt;
    e.flash -= edt;
    // chefes descansam menos entre um ataque e outro
    if (e.boss && e.bstate === 'walk' && e.bt > 0) e.bt -= edt * (diff().bossTempo - 1 + (e.enraged ? 0.6 : 0));
    if (e.boss && !e.decoy) bossPressure(e, edt, tgt);
    if (e.hpShow > 0) e.hpShow -= edt;

    let mvx = 0;
    let mvz = 0;
    let speed = e.speed * (e.slowT > 0 ? 0.5 : 1);
    if (e.stun > 0) {
      e.stun -= edt;
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
            e.blinkT = (e.blinkT ?? rr(1, 3)) - edt;
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
            e.windup -= edt;
            speed = 0;
            if (e.windup <= 0) {
              e.swing = 1;
              if (tgt === p && dist < e.T.range + e.r + p.r + 0.35) meleeHit(e, e.dmg);
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
          e.strafeT -= edt;
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
                enemyShoot(e, tgt.x - e.x, tgt.z - e.z, rr(-0.06, 0.06));
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
            e.fuse -= edt;
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
            e.aimT -= edt;
            speed = 0;
            if (e.aimT > 0.3) {
              e.lockX = tgt.x;
              e.lockZ = tgt.z;
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
              e.lockX = tgt.x;
              e.lockZ = tgt.z;
              e.laser.visible = true;
              sfx.telegraph();
            }
          }
          e.faceX = (e.lockX ?? p.x) - e.x;
          e.faceZ = (e.lockZ ?? p.z) - e.z;
          break;
        }
        case 'ghost': {
          // flutua direto até o jogador, atravessando paredes, e drena vida
          mvx = ux;
          mvz = uz;
          if (dist < e.r + p.r + 0.35) {
            speed *= 0.3;
            if (e.atkT <= 0 && tgt === p) {
              e.atkT = e.T.atkCd;
              meleeHit(e, e.dmg);
              e.hp = Math.min(e.maxHp, e.hp + e.dmg);
              beamFx(p.x, 1, p.z, e.x, 1.2, e.z, 0xbfffff, 0.25, 4);
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'wisp': {
          // voo errático; explode perto do jogador e deixa ele lento
          e.wob = (e.wob || rr(0, 6)) + edt * 5;
          mvx = ux + Math.cos(e.wob) * 0.8;
          mvz = uz + Math.sin(e.wob) * 0.8;
          if (dist < 1.1) {
            e.selfDestruct = true;
            enemyExplosion(e.x, e.z, 1.8, e.dmg, 0x7affc8);
            if (Math.hypot(p.x - e.x, p.z - e.z) < 2) p.chillT = 2;
            e.hp = 0;
            e.alive = false;
            onEnemyKilled(e);
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'thief': {
          if (!e.fleeT) {
            e.fleeT = 14;
            e.dropT = 0.6;
            sfx.rare();
            toast(L('💰 Um <b>Ladrão de Dados</b>! Pegue-o antes que ele fuja!', '💰 A <b>Data Thief</b>! Catch it before it escapes!'), 'leg', 'thief');
          }
          e.fleeT -= edt;
          // foge do jogador, contornando paredes
          e.wob = (e.wob || rr(0, 6)) + edt * 2.2;
          let fx = -ux + Math.cos(e.wob) * 0.45;
          let fz = -uz + Math.sin(e.wob) * 0.45;
          const fl = Math.hypot(fx, fz) || 1;
          fx /= fl;
          fz /= fl;
          if (!isWalkable(d, e.x + fx * 1.1, e.z + fz * 1.1)) {
            const side = e.side || (e.side = chance(0.5) ? 1 : -1);
            const ox = -fz * side;
            const oz = fx * side;
            if (isWalkable(d, e.x + ox * 1.1, e.z + oz * 1.1)) {
              fx = ox;
              fz = oz;
            } else {
              e.side = -side; // tenta o outro lado
              fx = -ox;
              fz = -oz;
            }
          }
          mvx = fx;
          mvz = fz;
          if (dist > 13) speed *= 0.45; // longe: anda devagar, para dar chance
          e.dropT -= edt;
          if (e.dropT <= 0 && dist < 10) {
            e.dropT = 1.1;
            spawnPickup('credits', e.x, e.z, { amount: Math.round(rr(2, 5) * (1 + G.floor * 0.5)) });
          }
          if (Math.random() < edt * 14) burst(e.x, rr(0.3, 1.3), e.z, 0xffd23d, 1, 1, 0.06, 0.4, { grav: -2 });
          if (e.fleeT <= 0) {
            // escapou: teleporta para longe
            burst(e.x, 0.9, e.z, 0xffd23d, 40, 6, 0.08, 0.6, { up: 2 });
            ringFx(e.x, e.z, 1.6, 0xffd23d, 0.4);
            sfx.zap();
            toast(L('O Ladrão de Dados escapou…', 'The Data Thief got away…'), 'warn', 'thief');
            achAdd('thiefEscapes');
            e.selfDestruct = true;
            e.hp = 0;
            e.alive = false;
            onEnemyKilled(e);
          }
          e.faceX = mvx;
          e.faceZ = mvz;
          break;
        }
        case 'boar': {
          if (e.cstate === 'wind') {
            speed = 0;
            e.ct -= edt;
            if (Math.random() < 0.5) burst(e.x, 0.2, e.z, 0x8a6a44, 1, 2, 0.06, 0.3);
            if (e.ct <= 0) {
              e.cstate = 'charge';
              e.ct = 0.75;
              e.hitDone = false;
              sfx.dash();
            }
          } else if (e.cstate === 'charge') {
            mvx = e.cdx;
            mvz = e.cdz;
            speed = 13;
            e.ct -= edt;
            if (!e.hitDone && Math.hypot(p.x - e.x, p.z - e.z) < e.r + p.r + 0.2) {
              e.hitDone = true;
              meleeHit(e, e.dmg * 1.4);
              p.kx = (p.kx || 0) + e.cdx * 9;
              p.kz = (p.kz || 0) + e.cdz * 9;
            }
            if (e.ct <= 0 || !isWalkable(d, e.x + e.cdx * 0.7, e.z + e.cdz * 0.7)) {
              const hitWall = e.ct > 0;
              e.cstate = null;
              e.atkT = e.T.atkCd;
              e.stun = hitWall ? 0.9 : 0.2; // se bateu na parede fica tonto
            }
          } else {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
            if (e.los && dist < 8 && dist > 1.5 && e.atkT <= 0) {
              e.cstate = 'wind';
              e.ct = 0.6;
              e.cdx = ux;
              e.cdz = uz;
              lineTelegraph(e.x, e.z, Math.atan2(uz, ux), Math.min(12, dist + 3), 1.1, 0.6, 0xff8a00);
              sfx.telegraph();
            }
          }
          e.faceX = e.cstate ? e.cdx : ux;
          e.faceZ = e.cstate ? e.cdz : uz;
          break;
        }
        case 'toad': {
          // anda aos pulos e cospe ácido que deixa poças
          const [kmin, kmax] = e.T.keep;
          e.hopT = (e.hopT ?? rr(0, 0.8)) - edt;
          if (e.hopT < -0.9) e.hopT = rr(0.4, 0.9);
          const hopping = e.hopT < 0;
          if (hopping) {
            if (!e.los || dist > kmax) {
              const c = chase();
              if (c) { mvx = c.x; mvz = c.z; }
            } else if (dist < kmin) {
              mvx = -ux;
              mvz = -uz;
            }
            speed *= 1.6;
          }
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * rr(0.85, 1.15);
            const tx = tgt.x;
            const tz = tgt.z;
            const sc = e.T.spit || 0x9dff3a;
            telegraphFx(tx, tz, 1.3, 0.8, sc);
            lob({ x: e.x, z: e.z, tx, tz, time: 0.8, color: sc, onLand: (x, z) => spawnHazard(x, z, 1.3, 3.5, e.dmg * 0.7, { color: sc }) });
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'alien': {
          if (e.pstate === 'wind') {
            speed = 0;
            e.pt -= edt;
            if (e.pt <= 0) {
              e.pstate = 'leap';
              e.pt = 0.4;
              e.sx = e.x;
              e.sz = e.z;
            }
          } else if (e.pstate === 'leap') {
            e.pt -= edt;
            const k = 1 - Math.max(0, e.pt) / 0.4;
            e.x = e.sx + (e.lx - e.sx) * k;
            e.z = e.sz + (e.lz - e.sz) * k;
            e.model.body.position.y = Math.sin(k * Math.PI) * 1.2;
            speed = 0;
            if (e.pt <= 0) {
              e.model.body.position.y = 0;
              e.pstate = null;
              e.atkT = e.T.atkCd;
              if (Math.hypot(p.x - e.x, p.z - e.z) < 1.3 + p.r) meleeHit(e, e.dmg * 1.5);
              burst(e.x, 0.3, e.z, e.bloodColor, 12, 4, 0.06, 0.3);
            }
          } else if (dist < e.T.range + e.r + p.r) {
            if (e.windup > 0) {
              e.windup -= edt;
              speed = 0;
              if (e.windup <= 0) {
                e.swing = 1;
                if (tgt === p && dist < e.T.range + e.r + p.r + 0.3) meleeHit(e, e.dmg);
                e.biteT = 0.9;
              }
            } else if ((e.biteT = (e.biteT || 0) - edt) <= 0) e.windup = 0.25;
          } else {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
            if (e.los && dist > 2.5 && dist < 6.5 && e.atkT <= 0) {
              e.pstate = 'wind';
              e.pt = 0.35;
              e.lx = tgt.x;
              e.lz = tgt.z;
              telegraphFx(e.lx, e.lz, 1.3, 0.75, e.bloodColor);
              sfx.telegraph();
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'kamikaze': {
          if (e.kstate === 'lock') {
            speed = 0;
            e.kt -= edt;
            e.model.ring.material = glowMat(Math.floor(e.kt * 14) % 2 ? 0xffffff : 0xff3300, 3);
            if (e.kt <= 0) {
              e.kstate = 'dive';
              e.kt = 1.2;
              sfx.dash();
            }
          } else if (e.kstate === 'dive') {
            mvx = e.kdx;
            mvz = e.kdz;
            speed = 15;
            e.kt -= edt;
            if (Math.random() < 0.8) burst(e.x, 1.2, e.z, 0xff8800, 1, 1, 0.07, 0.3, { grav: 0 });
            const hitWall = !isWalkable(d, e.x + e.kdx * 0.5, e.z + e.kdz * 0.5);
            if (dist < e.r + p.r + 0.3 || hitWall || e.kt <= 0) {
              e.selfDestruct = true;
              enemyExplosion(e.x, e.z, 1.9, e.dmg, 0xff8800);
              e.hp = 0;
              e.alive = false;
              onEnemyKilled(e);
            }
          } else {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
            if (e.los && dist < 7.5 && e.atkT <= 0) {
              e.kstate = 'lock';
              e.kt = 0.65;
              e.kdx = ux;
              e.kdz = uz;
              lineTelegraph(e.x, e.z, Math.atan2(uz, ux), Math.min(16, dist + 4), 0.7, 0.65, 0xff8800);
              sfx.telegraph();
            }
          }
          e.faceX = e.kstate === 'dive' ? e.kdx : ux;
          e.faceZ = e.kstate === 'dive' ? e.kdz : uz;
          break;
        }
        case 'illusionist': {
          const [kmin, kmax] = e.T.keep;
          e.strafeT -= edt;
          if (e.strafeT <= 0) {
            e.strafeT = rr(1, 2.2);
            e.strafe *= -1;
          }
          if (!e.los || dist > kmax) {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          } else if (dist < kmin) {
            mvx = -ux;
            mvz = -uz;
          } else {
            mvx = -uz * e.strafe;
            mvz = ux * e.strafe;
            speed *= 0.6;
          }
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * rr(0.8, 1.2);
            spawnProjectile({ from: 'enemy', x: e.x + ux * 0.5, z: e.z + uz * 0.5, y: 1.2, dx: ux, dz: uz, speed: 7, life: 2.5, dmg: e.decoy ? 0 : e.dmg, fake: !!e.decoy, color: 0xd04dff, size: 0.2, r: 0.2 });
            sfx.orb();
            e.swing = 1;
          }
          // a verdadeira cria cópias e troca de lugar com uma delas
          if (!e.decoy) {
            e.summonT = (e.summonT ?? 1.5) - edt;
            e.decoys = (e.decoys || []).filter((c) => c.alive);
            if (e.summonT <= 0 && e.los && dist < 12) {
              e.summonT = rr(6, 8);
              const n = Math.min(2, 3 - e.decoys.length);
              const spots = [];
              for (let k = 0; k < 12 && spots.length < n; k++) {
                const a = rr(0, Math.PI * 2);
                const x = e.x + Math.cos(a) * rr(1.5, 3);
                const z = e.z + Math.sin(a) * rr(1.5, 3);
                if (isWalkable(d, x, z)) spots.push({ x, z });
              }
              for (const sp of spots) {
                const c = spawnEnemy('illusionist', sp.x, sp.z, { decoy: true });
                c.summonT = 99;
                c.atkT = rr(0.3, 1.5);
                e.decoys.push(c);
                burst(sp.x, 0.9, sp.z, 0xd04dff, 12, 3, 0.06, 0.4);
              }
              // troca de lugar com uma cópia para confundir
              if (e.decoys.length) {
                const c = pick(e.decoys);
                [e.x, c.x] = [c.x, e.x];
                [e.z, c.z] = [c.z, e.z];
              }
              ringFx(e.x, e.z, 2, 0xd04dff, 0.4);
              sfx.zap();
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'tank': {
          const [kmin, kmax] = e.T.keep;
          if (!e.los || dist > kmax) {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          } else if (dist < kmin) {
            mvx = -ux;
            mvz = -uz;
          }
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * e.atkCdMult;
            sfx.telegraph();
            for (let k = 0; k < 2; k++) {
              after(0.35 + k * 0.35, () => {
                if (!e.alive) return;
                const side = k ? 0.35 : -0.35;
                const a = Math.atan2(tgt.z - e.z, tgt.x - e.x) + (k ? 0.5 : -0.5);
                const px = e.x - Math.sin(a) * side;
                const pz = e.z + Math.cos(a) * side;
                spawnProjectile({ from: 'enemy', x: px, z: pz, y: 1.25, dx: Math.cos(a), dz: Math.sin(a), speed: 6.5, life: 4, dmg: e.dmg, color: 0xffaa00, size: 0.16, r: 0.24, homing: 1.7, shootable: true, explode: { r: 1.6, dmg: e.dmg } });
                burst(px, 1.3, pz, 0xffaa00, 8, 2, 0.06, 0.3);
                sfx.enemyShot();
              });
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'sentry': {
          speed = 0;
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * e.atkCdMult;
            for (let k = 0; k < e.T.burst; k++) {
              after(k * 0.15, () => {
                if (!e.alive) return;
                enemyShoot(e, tgt.x - e.x, tgt.z - e.z, rr(-0.1, 0.1));
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
        case 'scrap':
        case 'reaper':
        case 'gunship':
        case 'hackerboss':
        case 'omega':
        case 'pylon': {
          const fn = { scrap: updateScrap, reaper: updateReaper, gunship: updateGunship, hackerboss: updateHackerBoss, omega: updateOmega, pylon: updatePylon }[e.T.ai];
          const r = fn(e, edt, dist, ux, uz);
          mvx = r.x;
          mvz = r.z;
          speed = r.speed;
          break;
        }
        case 'queen': {
          const r = updateQueen(e, edt, dist, ux, uz);
          mvx = r.x;
          mvz = r.z;
          speed = r.speed;
          break;
        }
        case 'eagle': {
          // circula em volta do jogador e dá rasantes em linha reta
          if (e.kstate === 'lock') {
            speed = 0;
            e.kt -= edt;
            if (e.kt <= 0) {
              e.kstate = 'dive';
              e.kt = 0.7;
              e.hitDone = false;
              sfx.dash();
            }
          } else if (e.kstate === 'dive') {
            mvx = e.kdx;
            mvz = e.kdz;
            speed = 15;
            e.kt -= edt;
            if (!e.hitDone && Math.hypot(p.x - e.x, p.z - e.z) < e.r + p.r + 0.3) {
              e.hitDone = true;
              meleeHit(e, e.dmg * 1.3);
            }
            if (e.kt <= 0 || !isWalkable(d, e.x + e.kdx * 0.6, e.z + e.kdz * 0.6)) {
              e.kstate = 'climb';
              e.kt = 0.9;
            }
          } else if (e.kstate === 'climb') {
            mvx = -ux;
            mvz = -uz;
            speed *= 0.8;
            e.kt -= edt;
            if (e.kt <= 0) {
              e.kstate = null;
              e.atkT = e.T.atkCd * e.atkCdMult;
            }
          } else {
            if (!e.los || dist > 7) {
              const c = chase();
              if (c) { mvx = c.x; mvz = c.z; }
            } else {
              const k = dist < 4 ? -0.6 : 0.2;
              mvx = -uz * e.strafe + ux * k;
              mvz = ux * e.strafe + uz * k;
            }
            if (e.los && dist < 8 && dist > 2 && e.atkT <= 0) {
              e.kstate = 'lock';
              e.kt = 0.6;
              e.kdx = ux;
              e.kdz = uz;
              lineTelegraph(e.x, e.z, Math.atan2(uz, ux), Math.min(12, dist + 3), 0.9, 0.6, 0xffe0a0);
              sfx.telegraph();
            }
          }
          e.faceX = e.kstate === 'dive' ? e.kdx : mvx || ux;
          e.faceZ = e.kstate === 'dive' ? e.kdz : mvz || uz;
          break;
        }
        case 'flamer': {
          // chega perto, avisa e solta um jato de fogo em cone
          if (e.fstate === 'wind' || e.fstate === 'fire') {
            speed = 0;
            e.ft -= edt;
            // vira devagar na direção do jogador
            const want = Math.atan2(uz, ux);
            let da = want - e.fa;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            e.fa += Math.max(-1, Math.min(1, da)) * edt * (e.fstate === 'fire' ? 0.9 : 0);
            const cx = Math.cos(e.fa);
            const cz = Math.sin(e.fa);
            if (e.fstate === 'wind' && e.ft <= 0) {
              e.fstate = 'fire';
              e.ft = 1.4;
              e.tick = 0;
            } else if (e.fstate === 'fire') {
              for (let k = 0; k < 3; k++) {
                const a = e.fa + rr(-0.32, 0.32);
                const sp = rr(6, 9);
                particle(e.x + cx * 0.6, 0.9, e.z + cz * 0.6, Math.cos(a) * sp, rr(0, 1), Math.sin(a) * sp, pick([0xff6a00, 0xffaa00, 0xff3300]), rr(0.08, 0.15), 0.45, -2, 1);
              }
              if (Math.random() < edt * 6) sfx.flame();
              e.tick -= edt;
              if (e.tick <= 0) {
                e.tick = 0.25;
                const px = p.x - e.x;
                const pz = p.z - e.z;
                const pd = Math.hypot(px, pz);
                const ang = Math.abs(Math.atan2(cx * pz - cz * px, cx * px + cz * pz));
                if (pd < e.T.range + 0.6 && ang < 0.42) damagePlayer(e.dmg);
              }
              if (e.ft <= 0) {
                e.fstate = null;
                e.atkT = e.T.atkCd * e.atkCdMult;
              }
            }
            e.faceX = cx;
            e.faceZ = cz;
          } else {
            if (!e.los || dist > e.T.range - 0.6) {
              const c = chase();
              if (c) { mvx = c.x; mvz = c.z; }
            }
            if (e.los && dist < e.T.range && e.atkT <= 0) {
              e.fstate = 'wind';
              e.ft = 0.55;
              e.fa = Math.atan2(uz, ux);
              lineTelegraph(e.x, e.z, e.fa, e.T.range + 0.6, 2.2, 0.55, 0xff6a00);
              sfx.telegraph();
            }
            e.faceX = ux;
            e.faceZ = uz;
          }
          break;
        }
        case 'tesla': {
          // fica rondando; carrega e descarrega um raio em quem estiver no círculo
          const [kmin, kmax] = e.T.keep;
          if (e.zapT > 0) {
            e.zapT -= edt;
            speed *= 0.2;
            if (Math.random() < 0.6) burst(e.x + rr(-0.3, 0.3), 1.5, e.z + rr(-0.3, 0.3), 0x00f0ff, 1, 1, 0.05, 0.2, { grav: 0 });
            if (e.zapT <= 0) {
              e.atkT = e.T.atkCd * e.atkCdMult * rr(0.9, 1.1);
              ringFx(e.x, e.z, e.T.range, 0x00f0ff, 0.25, { from: 0.4 });
              if (p.alive && Math.hypot(p.x - e.x, p.z - e.z) < e.T.range + p.r) {
                beamFx(e.x, 1.5, e.z, p.x, 1, p.z, 0x88eeff, 0.3, 3);
                damagePlayer(e.dmg);
              }
              sfx.zap();
            }
          } else {
            e.strafeT -= edt;
            if (e.strafeT <= 0) {
              e.strafeT = rr(1.2, 2.5);
              e.strafe *= -1;
            }
            if (!e.los || dist > kmax) {
              const c = chase();
              if (c) { mvx = c.x; mvz = c.z; }
            } else if (dist < kmin) {
              mvx = -ux;
              mvz = -uz;
            } else {
              mvx = -uz * e.strafe;
              mvz = ux * e.strafe;
              speed *= 0.6;
            }
            if (e.los && dist < e.T.range && e.atkT <= 0) {
              e.zapT = 0.8;
              telegraphFx(e.x, e.z, e.T.range, 0.8, 0x00f0ff);
              sfx.telegraph();
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'mortar': {
          // fica longe e lança 3 granadas com aviso no chão
          const [kmin, kmax] = e.T.keep;
          if (!e.los || dist > kmax) {
            const c = chase();
            if (c) { mvx = c.x; mvz = c.z; }
          } else if (dist < kmin) {
            mvx = -ux;
            mvz = -uz;
          }
          if (e.los && dist < e.T.range && e.atkT <= 0) {
            e.atkT = e.T.atkCd * e.atkCdMult * rr(0.9, 1.1);
            e.swing = 1;
            for (let k = 0; k < 3; k++) {
              const tx = tgt.x + (k ? rr(-2, 2) : 0);
              const tz = tgt.z + (k ? rr(-2, 2) : 0);
              after(k * 0.25, () => {
                if (!e.alive) return;
                telegraphFx(tx, tz, 1.6, 1.2, 0xffaa00);
                lob({ x: e.x, z: e.z, tx, tz, time: 1.2, color: 0xffaa00, onLand: (x, z) => enemyExplosion(x, z, 1.6, e.dmg, 0xffaa00) });
                sfx.enemyShot();
              });
            }
          }
          e.faceX = ux;
          e.faceZ = uz;
          break;
        }
        case 'brute':
        case 'yeti': {
          // golem de magma deixa um rastro de fogo
          if (e.T.trail && e.moving) {
            e.trailT = (e.trailT ?? 0.6) - edt;
            if (e.trailT <= 0) {
              e.trailT = 0.6;
              spawnHazard(e.x, e.z, 0.9, 2.6, e.dmg * 0.25, { color: 0xff5a1a, opacity: 0.45 });
            }
          }
          // yeti arremessa bolas de neve de longe
          e.throwT = (e.throwT ?? rr(1, 3)) - edt;
          if (e.T.ai === 'yeti' && e.throwT <= 0 && !(e.slamT > 0) && e.los && dist > 4 && dist < 10) {
            e.throwT = rr(3.5, 5);
            e.swing = 1;
            const tx = tgt.x;
            const tz = tgt.z;
            telegraphFx(tx, tz, 1.5, 0.9, 0x8ad8ff);
            lob({ x: e.x, z: e.z, tx, tz, time: 0.9, color: 0xffffff, onLand: (x, z) => {
              enemyExplosion(x, z, 1.5, e.dmg * 0.8, 0xdff4ff);
              if (G.player.alive && Math.hypot(G.player.x - x, G.player.z - z) < 1.6) G.player.chillT = Math.max(G.player.chillT || 0, 2);
            } });
          }
          if (e.slamT > 0) {
            e.slamT -= edt;
            speed = 0;
            if (e.slamT <= 0) {
              e.swing = 1;
              if (Math.hypot(p.x - e.x, p.z - e.z) < e.T.range + p.r) meleeHit(e, e.dmg);
              ringFx(e.x, e.z, e.T.range, e.bloodColor, 0.35, { from: 0.5 });
              burst(e.x, 0.3, e.z, e.bloodColor, 24, 6, 0.08, 0.5, { up: 0.4 });
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
          const r = updateBoss(e, edt, dist, ux, uz);
          mvx = r.x;
          mvz = r.z;
          speed = r.speed;
          break;
        }
      }
    }

    // movimento
    const ge = !e.T.fly && !e.static ? groundEffect(d, e.x, e.z) : null;
    if (ge && ge.hurt && !e.T.fireproof) speed *= 0.75;
    const push = ge && ge.push ? ge.push : { x: 0, z: 0 };
    e.x += (mvx * speed + e.kx + push.x) * edt;
    e.z += (mvz * speed + e.kz + push.z) * edt;
    const kd = Math.max(0, 1 - edt * 8);
    e.kx *= kd;
    e.kz *= kd;
    if (!e.T.phase) resolveCircle(d, e);
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
    if (!e.alive || e.T.phase) continue;
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
      if (e.T.ai === 'ranged' || e.T.ai === 'sniper' || e.T.ai === 'flamer') m.armR.rotation.x = -1.4;
      if (e.T.ai === 'flamer') m.armL.rotation.x = -1.2;
      if (e.T.ai === 'sniper') m.armL.rotation.x = -1.3;
      if (m.orbs) m.orbs.rotation.y += dt * (e.decoy ? 2.6 : 2);
      if (m.screens) m.screens.rotation.y += dt * 0.8;
      if (m.holo) {
        // assassino holográfico: tremula e fica quase invisível às vezes
        const op = 0.35 + Math.abs(Math.sin(G.t * 3 + e.phase)) * 0.45 + (Math.random() < 0.05 ? 0.3 : 0);
        for (const mt of m.mats) mt.opacity = op;
      }
    } else if (m.kind === 'tank') {
      m.turret.rotation.y = 0;
      m.treads.forEach((t) => (t.position.z = Math.sin(e.phase * 3) * 0.02));
    } else if (m.kind === 'sentry') {
      m.head.rotation.y = e.facing ? 0 : 0;
      m.head.position.y = 0.72 + (e.atkT > e.T.atkCd - 0.7 ? Math.sin(G.t * 50) * 0.02 : 0);
    } else if (m.kind === 'bigboss') {
      if (m.rotors) m.rotors.forEach((r) => (r.rotation.y += dt * 25));
      if (m.float) m.body.position.y = 0.2 + Math.sin(G.t * 2.5) * 0.15;
      if (m.rings) m.rings.forEach((r, k) => (r.rotation.y += dt * (0.6 + k * 0.4) * (k % 2 ? -1 : 1)));
      if (m.shield) {
        m.shield.visible = !!e.invulnerable;
        m.shieldMat.opacity = 0.14 + Math.sin(G.t * 4) * 0.05;
        m.coreMat.color.set(e.invulnerable ? 0x8a2244 : 0xff2244).multiplyScalar(gk(e.invulnerable ? 1.2 : 2.4));
      }
    } else if (m.kind === 'pylon') {
      m.top.rotation.y += dt * 2;
      m.top.position.y = 2.2 + Math.sin(G.t * 3 + e.phase) * 0.1;
    } else if (m.kind === 'queen') {
      m.legs.forEach((l, i) => (l.rotation.x = Math.sin(e.phase * 1.4 + i * 1.3) * 0.35));
      m.abdomen.scale.setScalar(1 + Math.sin(G.t * 3) * 0.04);
      m.eyes.material.color.set(e.phase2 ? 0xff2244 : 0x39ff14).multiplyScalar(gk(2.6));
    } else if (m.kind === 'ghost') {
      m.body.position.y = 0.3 + Math.sin(G.t * 2 + e.phase) * 0.15;
      m.sheet.rotation.y += dt * 1.5;
      const near = Math.hypot(p.x - e.x, p.z - e.z) < 7;
      m.mats[0].opacity = (near ? 0.6 : 0.35) + Math.sin(G.t * 4 + e.phase) * 0.1;
    } else if (m.kind === 'wisp') {
      m.body.position.y = 1.1 + Math.sin(G.t * 6 + e.phase) * 0.2;
      if (Math.random() < 0.5) burst(e.x, m.body.position.y, e.z, 0x7affc8, 1, 0.5, 0.06, 0.4, { grav: -1 });
    } else if (m.kind === 'quad') {
      m.legs.forEach((l, k) => (l.rotation.x = e.moving ? Math.sin(e.phase * 2 + (k % 2) * Math.PI) * 0.6 : 0));
      if (m.tail) m.tail.rotation.x = -0.6 + Math.sin(G.t * 3 + e.phase) * 0.15;
      if (m.hop && !(e.pstate === 'leap')) m.body.position.y = e.moving ? Math.abs(Math.sin(e.phase * 1.4)) * 0.35 : 0;
    } else if (m.kind === 'bird') {
      const dive = e.kstate === 'dive';
      m.body.position.y = (dive ? 0.9 : 1.6) + Math.sin(G.t * 3 + e.phase) * 0.12;
      const fl = dive ? 0.15 : Math.sin(G.t * (e.kstate === 'lock' ? 4 : 11) + e.phase) * 0.55;
      m.wings[0].rotation.z = fl;
      m.wings[1].rotation.z = -fl;
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
    for (const mt of m.mats) {
      if (fl) mt.emissive.setScalar(0.9);
      else if (e.frozenT > 0) mt.emissive.setRGB(0.15, 0.35, 0.7);
      else if (e.slowT > 0) mt.emissive.setRGB(0.05, 0.12, 0.3);
      else if (e.burnT > 0) mt.emissive.setRGB(0.35 + Math.sin(G.t * 20) * 0.1, 0.1, 0);
      else mt.emissive.setScalar(0);
    }
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
const BOSS_SUB = {
  boss: L('Unidade de execução corporativa', 'Corporate execution unit'),
  queen: L('Mãe de todas as aranhas-bomba', 'Mother of all bomb spiders'),
  scrap: L('Cuidado com o ímã e as ondas de choque — pule ou desvie delas', 'Beware the magnet and the shockwaves — dodge through them'),
  reaper: L('Ela some e reaparece nas suas costas', 'She vanishes and reappears behind you'),
  gunship: L('Fica vulnerável quando pousa para recarregar', 'Vulnerable when it lands to reload'),
  hacker: L('Fique fora dos quadrados vermelhos', 'Stay off the red tiles'),
  omega: L('Destrua os pilares para derrubar o escudo', 'Destroy the pylons to drop its shield'),
};
export const BOSS_ORDER = ['boss', 'queen', 'scrap', 'reaper', 'gunship', 'hacker', 'omega'];

function startBoss(e) {
  if (G.bosses.includes(e)) return;
  G.bosses.push(e);
  G.boss = G.bosses[0];
  e.fightT0 = G.t;
  if (G.final && G.final.t0 == null) G.final.t0 = G.t; // o cronômetro da batalha final começa no primeiro chefe
  bossBar();
  sfx.boss();
  banner(e.name.toUpperCase(), BOSS_SUB[e.type] || '');
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
  e.bt = e.phase2 ? rr(0.45, 0.85) : rr(0.8, 1.3);
}

// Pressão extra de todo chefe: com 30% de vida fica enfurecido (mais rápido e forte),
// e entre os ataques dispara rajadas mirando o jogador (com aviso, para continuar justo)
function bossPressure(e, dt, tgt) {
  if (!e.enraged && e.hp < e.maxHp * 0.3 && e.bstate !== 'intro') {
    e.enraged = true;
    e.speed *= 1.15;
    e.dmg *= 1.15;
    toast(L(`${e.name.toUpperCase()} ESTÁ ENFURECIDO!`, `${e.name.toUpperCase()} IS ENRAGED!`), 'warn');
    ringFx(e.x, e.z, 4.5, 0xff2200, 0.6);
    burst(e.x, e.height * 0.6, e.z, 0xff2200, 50, 7, 0.09, 0.7, { up: 1 });
    sfx.boss();
    G.shake = Math.max(G.shake, 0.4);
  }
  if (e.enraged && Math.random() < dt * 10) burst(e.x + rr(-e.r, e.r), e.height * rr(0.3, 1), e.z + rr(-e.r, e.r), 0xff2200, 1, 1, 0.08, 0.4, { grav: -3 });
  if (e.bstate === 'intro' || e.invulnerable || !e.aggro) return;
  e.volT = (e.volT ?? rr(2, 3.5)) - dt;
  if (e.volT > 0 || e.bstate !== 'walk') return;
  e.volT = e.enraged ? rr(1.8, 2.6) : e.phase2 ? rr(2.6, 3.6) : rr(3.6, 5);
  if (!lineOfSight(G.dungeon, e.x, e.z, tgt.x, tgt.z)) return;
  const col = e.bloodColor || 0xff2244;
  const n = e.enraged ? 5 : 3;
  ringFx(e.x, e.z, e.r + 0.8, col, 0.45, { from: e.r });
  sfx.telegraph();
  after(0.45, () => {
    if (!e.alive || !G.player) return;
    const base = Math.atan2(G.player.z - e.z, G.player.x - e.x);
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * 0.2;
      spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * (e.r + 0.3), z: e.z + Math.sin(a) * (e.r + 0.3), y: 1.2, dx: Math.cos(a), dz: Math.sin(a), speed: 9, life: 2.4, dmg: e.dmg * 0.7, color: col, size: 0.17, r: 0.19 });
    }
    sfx.enemyShot();
  });
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
  // mapas abertos (deserto, floresta, pradaria...) são 2-4x maiores: mais inimigos para não ficarem vazios
  let walk = 0;
  for (const t of d.grid) if (t === 1) walk++;
  const areaK = Math.max(1, Math.min(2.4, walk / 1800));
  // orçamento de inimigos por andar
  const final = isFinalFloor(floor);
  // no andar final o foco são os chefes: metade dos inimigos comuns
  const budget = Math.round(Math.min(140, Math.round((15 + floor * 8) * D.count * areaK)) * (final ? 0.5 : 1));
  const quotas = new Map();
  for (const r of d.rooms) {
    if (r === d.rooms[0]) continue;
    if (boss && r === d.exitRoom) continue;
    if (r.safe) continue;
    if (chance(emptyChance)) continue;
    quotas.set(r, Math.max(1, Math.round(((r.w * r.h) / perPack) * D.count * areaK)));
  }
  // distribui os grupos em rodadas para espalhar pelo mapa
  const slots = [];
  while (quotas.size) {
    for (const [r, q] of shuffle([...quotas])) {
      slots.push(r);
      if (q <= 1) quotas.delete(r);
      else quotas.set(r, q - 1);
    }
  }
  const startCount = G.enemies.length;
  for (const r of slots) {
    if (G.enemies.length - startCount >= budget) break;
    {
      const c0 = randomFloorInRoom(d, r, 1);
      const cx = c0.x;
      const cz = c0.z;
      const type = pickEnemyType(floor);
      const base = ETYPES[type].solo ? 1 : type === 'bomber' || type === 'kamikaze' ? 2 + Math.floor(rr(0, 1 + floor / 3)) : 1 + Math.floor(rr(0, 2.2 + floor / 2.5));
      const n = Math.max(1, Math.round(base * D.count * 1.15));
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
      if (floor >= 2 && !(G.theme && G.theme.natural) && !ETYPES[type].solo && chance(Math.min(0.3, 0.1 + floor * 0.03))) {
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
    if (r === d.rooms[0] || !chance(G.theme && G.theme.natural ? 0 : 0.45)) continue;
    const n = 1 + Math.floor(rr(0, 2.5));
    for (let k = 0; k < n; k++) {
      const pt = randomFloorInRoom(d, r, 1);
      if (Math.hypot(pt.x - d.exit.x, pt.z - d.exit.z) > 2.5) spawnEnemy('barrel', pt.x, pt.z);
    }
  }
  const chestRooms = d.rooms.filter((r) => r !== d.rooms[0] && r !== d.exitRoom).sort(() => Math.random() - 0.5);
  // eventos: Ladrão de Dados e Santuário Neon em salas longe do início
  const far = d.rooms.filter((r) => r !== d.rooms[0] && !(boss && r === d.exitRoom) && Math.hypot(r.x + r.w / 2 - d.start.x, r.y + r.h / 2 - d.start.z) > 12);
  if (floor >= 2 && !final && far.length && chance(boss ? 0.15 : 0.35)) {
    const pt = randomFloorInRoom(d, pick(far), 1);
    spawnEnemy('thief', pt.x, pt.z);
  }
  if (far.length && chance(0.6)) {
    const pt = randomFloorInRoom(d, pick(far), 2);
    if (Math.hypot(pt.x - d.exit.x, pt.z - d.exit.z) > 3) spawnShrine(pt.x, pt.z, pick(Object.keys(SHRINES)));
  }
  const nChests = Math.min(chestRooms.length, floor < 3 ? 1 : 2);
  for (let k = 0; k < nChests; k++) {
    const pt = randomFloorInRoom(d, chestRooms[k], 1);
    spawnChest(pt.x, pt.z);
  }
  if (final) {
    // batalha final: os 7 chefes em ondas de 2 (quando os dois caem, entram os próximos 2; o OMEGA vem por último)
    const waves = [];
    for (let k = 0; k < BOSS_ORDER.length; k += 2) waves.push(BOSS_ORDER.slice(k, k + 2));
    G.final = { queue: waves.slice(1), wave: 1, waves: waves.length, killed: 0, total: BOSS_ORDER.length, t0: null, deaths: 0, lastKillT: -99, won: false };
    spawnFinalBoss(waves[0][0], -3.5);
    spawnFinalBoss(waves[0][1], 3.5);
    G.dungeon.meshes.exit.locked = true;
  } else if (boss) {
    const idx = Math.round(floor / 3) - 1;
    const kind = BOSS_ORDER[idx % BOSS_ORDER.length];
    const cycle = Math.floor(idx / BOSS_ORDER.length);
    const e = spawnEnemy(kind, d.exit.x, kind === 'omega' ? d.exit.z : d.exit.z - 2.5);
    // a cada volta no ciclo de chefes eles voltam mais resistentes
    if (cycle) e.hp = e.maxHp = e.maxHp * (1 + 0.3 * cycle);
    if (kind === 'boss') e.name = cycle ? `Executor ARC-${9 + cycle}` : 'Executor ARC-9';
    else if (cycle) e.name = `${e.name} ${['', 'II', 'III', 'IV', 'V'][cycle] || cycle + 1}`;
    G.dungeon.meshes.exit.locked = true;
  }
}

// ---------------- Batalha final ----------------
// Chefes da batalha final: um pouco menos de vida, porque são 2 de cada vez e 7 no total
function spawnFinalBoss(kind, ox = 0, oz = 0) {
  const d = G.dungeon;
  const c = arenaCenter();
  // o Núcleo OMEGA (o último) ocupa o centro da arena
  let x = kind === 'omega' ? c.x : c.x + ox;
  let z = kind === 'omega' ? c.z : c.z + oz - 2.5;
  if (!isWalkable(d, x, z)) {
    x = c.x;
    z = c.z;
  }
  const e = spawnEnemy(kind, x, z);
  // o OMEGA luta sozinho na última onda: vida cheia
  if (kind !== 'omega') e.hp = e.maxHp = e.maxHp * 0.85;
  e.finalBoss = true;
  return e;
}

const inArenaNow = (x, z) => {
  const a = G.dungeon.arena;
  return a && x >= a.x - 1 && x <= a.x + a.w + 1 && z >= a.y - 1 && z <= a.y + a.h + 1;
};

function finalBossDown(e) {
  const F = G.final;
  F.killed++;
  // dois chefes derrubados quase juntos
  if (G.t - F.lastKillT < 5) achMark('flags', 'finalDuo');
  F.lastKillT = G.t;
  bossBar();
  sfx.levelup();
  // a próxima onda só entra quando todos os chefes da onda atual caírem
  if (G.enemies.some((o) => o.alive && o.boss && o !== e)) {
    banner(L(`CHEFE ${F.killed}/${F.total} DERROTADO`, `BOSS ${F.killed}/${F.total} DEFEATED`), L('Falta mais um nesta onda!', 'One more left in this wave!'));
    return;
  }
  if (!F.queue.length) return finalVictory();
  const next = F.queue.shift();
  F.wave++;
  const names = next.map((k) => ETYPES[k].name).join(' + ');
  banner(L(`ONDA ${F.wave - 1}/${F.waves} CONCLUÍDA`, `WAVE ${F.wave - 1}/${F.waves} CLEARED`), L(`Próxima onda: ${names}`, `Next wave: ${names}`));
  // avisos no chão de onde os próximos vão aparecer
  const c = arenaCenter();
  const offs = next.length > 1 ? [-3.5, 3.5] : [0];
  next.forEach((k, i) => {
    const x = k === 'omega' ? c.x : c.x + offs[i];
    const z = k === 'omega' ? c.z : c.z - 2.5;
    telegraphFx(x, z, 2.4, 3, 0xff2bd6);
  });
  sfx.telegraph();
  after(3, () => {
    if (!G.final || G.final !== F) return;
    next.forEach((k, i) => {
      const b = spawnFinalBoss(k, offs[i]);
      ringFx(b.x, b.z, 4, 0xff2bd6, 0.7);
      burst(b.x, 1.5, b.z, 0xff2bd6, 60, 7, 0.09, 0.8);
      // se o jogador está na arena, o chefe já entra lutando
      if (G.player && G.player.alive && inArenaNow(G.player.x, G.player.z)) {
        b.aggro = true;
        startBoss(b);
      }
    });
    G.shake = 0.5;
  });
}

// Todos os chefes caíram: a corporação desmorona e o elevador sobe para a superfície
function finalVictory() {
  const F = G.final;
  F.won = true;
  F.time = G.t - (F.t0 ?? G.t);
  const p = G.player;
  p.invuln = 9999;
  for (const pr of G.projectiles) if (pr.from === 'enemy') pr.alive = false;
  // os inimigos que sobraram entram em curto-circuito
  for (const o of G.enemies) {
    if (!o.alive || o.inert) continue;
    o.alive = false;
    o.selfDestruct = true;
    burst(o.x, 1, o.z, o.bloodColor, 18, 5, 0.07, 0.5);
    onEnemyKilled(o);
  }
  const c = arenaCenter();
  sfx.victory();
  G.shake = 1;
  banner(L('SISTEMA DERRUBADO', 'SYSTEM TAKEN DOWN'), L('A corporação caiu. Suba no elevador!', 'The corporation has fallen. Take the elevator up!'));
  // fogos de artifício neon com as cores dos 7 chefes
  const cols = [0xff2244, 0x39ff14, 0xffaa00, 0xb36bff, 0x00f0ff, 0x39ff88, 0xff2bd6, 0xffd23d];
  for (let k = 0; k < 26; k++) {
    after(0.3 + k * 0.22, () => {
      const x = c.x + rr(-8, 8);
      const z = c.z + rr(-8, 8);
      const col = pick(cols);
      burst(x, rr(3, 5.5), z, col, 46, 7, 0.09, 1.1, { grav: 3 });
      ringFx(x, z, rr(1.5, 3), col, 0.5);
      if (k % 3 === 0) sfx.explode();
    });
  }
  G.dungeon.meshes.exit.locked = false;
  G.dungeon.meshes.exit.golden = true;
  // medalhas e registro da vitória
  const ch = G.char;
  ch.wins = (ch.wins || 0) + 1;
  achAdd('wins');
  achMark('winClasses', ch.cls);
  if (!F.deaths) achMark('flags', 'winNoDeath');
  if (G.settings.difficulty === 'hard') achMark('flags', 'winHard');
  if (F.time < 600) achMark('flags', 'winFast');
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

// =====================================================================
// Chefes novos
// =====================================================================
function killQuiet(o) {
  o.alive = false;
  o.selfDestruct = true;
  burst(o.x, 1, o.z, o.bloodColor, 16, 4, 0.07, 0.4);
  onEnemyKilled(o);
}

function arenaCenter() {
  const d = G.dungeon;
  return d.arena ? { x: d.arena.cx, z: d.arena.cz } : { x: d.exit.x, z: d.exit.z };
}

function enterPhase2(e, msg, color) {
  e.phase2 = true;
  e.speed *= 1.2;
  toast(msg, 'warn');
  sfx.boss();
  ringFx(e.x, e.z, 5, color, 0.6);
  G.shake = 0.4;
  e.bstate = 'walk';
  e.bt = 0.6;
}

function minions(type, n, x, z, cap = 8) {
  const alive = G.enemies.filter((o) => o.alive && !o.boss && !o.inert && o.type !== 'pylon').length;
  for (let k = 0; k < Math.max(0, Math.min(n, cap - alive)); k++) {
    const a = rr(0, Math.PI * 2);
    let mx = x + Math.cos(a) * 2.2;
    let mz = z + Math.sin(a) * 2.2;
    if (!isWalkable(G.dungeon, mx, mz)) {
      mx = x;
      mz = z;
    }
    const m = spawnEnemy(type, mx, mz);
    m.aggro = true;
    m.xp = Math.round(m.xp * 0.3);
    burst(mx, 0.8, mz, m.bloodColor, 10, 3, 0.06, 0.4);
  }
}

function chooseAttack(e, opts) {
  let a = pick(opts);
  if (a === e.lastAtk) a = pick(opts);
  e.lastAtk = a;
  e.wave = 0;
  return a;
}

// ---------------- Rei do Ferro-Velho ----------------
function updateScrap(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  e.faceX = ux;
  e.faceZ = uz;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) enterPhase2(e, L('O REI DO FERRO-VELHO ESTÁ FURIOSO!', 'THE SCRAP KING IS ENRAGED!'), 0xffaa00);
  e.bt -= dt;
  // ondas de choque: atingem quem estiver na borda do anel (dá para atravessar com esquiva/salto)
  if (e.waves) {
    for (const w of e.waves) {
      w.r += dt * 6.5;
      if (!w.hit && p.alive && p.invuln <= 0 && !p.leap && Math.abs(Math.hypot(p.x - w.x, p.z - w.z) - w.r) < 0.45) {
        w.hit = true;
        damagePlayer(e.dmg * 1.3);
      }
    }
    e.waves = e.waves.filter((w) => w.r < 11);
  }
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1;
      }
      break;
    case 'walk':
      if (dist > 2.5) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed;
      }
      if (e.bt <= 0) {
        const a = chooseAttack(e, e.phase2 ? ['throw', 'magnet', 'stomp', 'junk'] : ['throw', 'magnet', 'stomp']);
        if (a === 'throw') {
          e.bstate = 'throw';
          e.bt = 0.4;
        } else if (a === 'magnet') {
          e.bstate = 'magnet';
          e.bt = 1.8;
          toast(L('O ímã está puxando você!', 'The magnet is pulling you in!'), 'warn', 'mag');
          sfx.telegraph();
        } else if (a === 'stomp') {
          e.bstate = 'stomp';
          e.bt = 0.9;
          telegraphFx(e.x, e.z, 2.4, 0.9, 0xffaa00);
          sfx.telegraph();
        } else {
          e.bstate = 'junk';
          e.bt = 0.5;
        }
      }
      break;
    case 'throw':
      if (e.bt <= 0) {
        const n = e.phase2 ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const tx = p.x + (k ? rr(-2.8, 2.8) : 0);
          const tz = p.z + (k ? rr(-2.8, 2.8) : 0);
          if (!isWalkable(G.dungeon, tx, tz)) continue;
          telegraphFx(tx, tz, 1.6, 0.9, 0xffaa00);
          lob({ x: e.x, z: e.z, tx, tz, time: 0.9, color: 0xffaa00, onLand: (x, z) => enemyExplosion(x, z, 1.6, e.dmg, 0xffaa00) });
        }
        sfx.enemyShot();
        e.wave++;
        e.bt = 0.75;
        if (e.wave >= 2) toWalk(e);
      }
      break;
    case 'magnet':
      if (p.alive && dist < 14 && p.invuln <= 0 && !p.dash && !p.leap) {
        p.x -= ux * 3.6 * dt;
        p.z -= uz * 3.6 * dt;
        resolveCircle(G.dungeon, p);
      }
      if (Math.random() < 0.8) {
        const k = Math.random();
        burst(p.x + (e.x - p.x) * k, 1.2, p.z + (e.z - p.z) * k, Math.random() < 0.5 ? 0xff2244 : 0x2b8cff, 1, 0.5, 0.06, 0.3, { grav: 0 });
      }
      e.model.mag.scale.setScalar(1 + Math.sin(G.t * 30) * 0.12);
      if (e.bt <= 0) {
        e.model.mag.scale.setScalar(1);
        e.bstate = 'stomp';
        e.bt = 0.55;
        telegraphFx(e.x, e.z, 2.4, 0.55, 0xffaa00);
      }
      break;
    case 'stomp':
      if (e.bt <= 0) {
        if (dist < 2.4 + p.r) damagePlayer(e.dmg * 1.6);
        const wave = () => {
          if (!e.alive) return;
          (e.waves = e.waves || []).push({ x: e.x, z: e.z, r: 1, hit: false });
          ringFx(e.x, e.z, 11, 0xffaa00, (11 - 1) / 6.5, { from: 1, linear: true, opacity: 1 });
        };
        wave();
        if (e.phase2) after(0.6, wave);
        burst(e.x, 0.3, e.z, 0xffaa00, 40, 8, 0.09, 0.6, { up: 0.4 });
        sfx.explode();
        G.shake = 0.45;
        toWalk(e);
      }
      break;
    case 'junk':
      if (e.bt <= 0) {
        minions(pick(['punk', 'shield', 'bomber']), 3, e.x, e.z);
        toWalk(e);
      }
      break;
  }
  return out;
}

// ---------------- Ceifadora Fantasma ----------------
function updateReaper(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  e.faceX = ux;
  e.faceZ = uz;
  if (!e.decoy && !e.phase2 && e.hp < e.maxHp * 0.5) {
    enterPhase2(e, L('A CEIFADORA SE DIVIDIU!', 'THE REAPER SPLIT APART!'), 0xb36bff);
    e.decoys = [];
    for (let k = 0; k < 2; k++) {
      const a = rr(0, Math.PI * 2);
      let x = e.x + Math.cos(a) * 3;
      let z = e.z + Math.sin(a) * 3;
      if (!isWalkable(G.dungeon, x, z)) {
        x = e.x;
        z = e.z;
      }
      const c = spawnEnemy('reaper', x, z, { decoy: true });
      c.bstate = 'walk';
      c.bt = rr(0.5, 1.5);
      e.decoys.push(c);
      burst(x, 1.2, z, 0xb36bff, 20, 4, 0.07, 0.4);
    }
  }
  const hurt = (amt) => {
    if (!e.decoy) damagePlayer(amt);
  };
  e.bt -= dt;
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1;
      }
      break;
    case 'walk':
      if (dist > 3) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed * 0.7;
      }
      if (e.bt <= 0) {
        const a = chooseAttack(e, ['dash', 'vanish', 'scythes']);
        if (a === 'dash') {
          e.dashes = e.phase2 ? 3 : 2;
          startReaperDash(e);
        } else if (a === 'vanish') {
          e.bstate = 'vanish';
          e.bt = 1.5;
          burst(e.x, 1.2, e.z, 0xb36bff, 24, 4, 0.07, 0.5);
          sfx.zap();
        } else {
          e.bstate = 'scythes';
          e.bt = 0.35;
        }
      }
      break;
    case 'dashWind':
      e.faceX = e.cdx;
      e.faceZ = e.cdz;
      if (e.bt <= 0) {
        e.bstate = 'dash';
        e.bt = 0.5;
        e.dashHit = false;
        sfx.dash();
      }
      break;
    case 'dash':
      e.faceX = e.cdx;
      e.faceZ = e.cdz;
      out.x = e.cdx;
      out.z = e.cdz;
      out.speed = 18;
      if (Math.random() < 0.8) burst(e.x, 1, e.z, 0xb36bff, 2, 1.5, 0.08, 0.35, { grav: 0 });
      if (!e.dashHit && dist < e.r + p.r + 0.3) {
        e.dashHit = true;
        hurt(e.dmg * 1.4);
      }
      if (e.bt <= 0 || !isWalkable(G.dungeon, e.x + e.cdx * 1.1, e.z + e.cdz * 1.1)) {
        e.dashes--;
        if (e.dashes > 0) startReaperDash(e);
        else toWalk(e);
      }
      break;
    case 'vanish':
      e.model.root.visible = false;
      if (e.bt <= 0) {
        // reaparece nas costas do jogador
        let bx = p.x - Math.sin(p.facing) * 1.8;
        let bz = p.z - Math.cos(p.facing) * 1.8;
        if (!isWalkable(G.dungeon, bx, bz)) {
          bx = p.x + rr(-2, 2);
          bz = p.z + rr(-2, 2);
        }
        if (isWalkable(G.dungeon, bx, bz)) {
          e.x = bx;
          e.z = bz;
        }
        e.model.root.visible = true;
        burst(e.x, 1.2, e.z, 0xb36bff, 24, 4, 0.07, 0.5);
        telegraphFx(e.x, e.z, 2.4, 0.5, 0xb36bff);
        e.bstate = 'reap';
        e.bt = 0.5;
        sfx.telegraph();
      }
      break;
    case 'reap':
      if (e.bt <= 0) {
        if (Math.hypot(p.x - e.x, p.z - e.z) < 2.4 + p.r) hurt(e.dmg * 1.6);
        slashFx(e.x, e.z, 0, 2.4, Math.PI * 2, 0xb36bff, 0.9);
        sfx.slash();
        toWalk(e);
      }
      break;
    case 'scythes':
      if (e.bt <= 0) {
        const n = e.phase2 ? 8 : 5;
        const base = Math.atan2(uz, ux);
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * 0.22;
          spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * 0.9, z: e.z + Math.sin(a) * 0.9, y: 1.3, dx: Math.cos(a), dz: Math.sin(a), speed: 9, life: 2.4, dmg: e.dmg * 0.8, fake: !!e.decoy, color: 0xb36bff, size: 0.18, r: 0.2 });
        }
        sfx.enemyShot();
        toWalk(e);
      }
      break;
  }
  return out;
}

function startReaperDash(e) {
  const p = G.player;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const l = Math.hypot(dx, dz) || 1;
  e.cdx = dx / l;
  e.cdz = dz / l;
  e.bstate = 'dashWind';
  e.bt = e.phase2 ? 0.38 : 0.5;
  lineTelegraph(e.x, e.z, Math.atan2(e.cdz, e.cdx), 9, 1.4, e.bt, 0xb36bff);
}

// ---------------- Nave de Ataque ----------------
function updateGunship(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  const c = arenaCenter();
  const body = e.model.body;
  e.faceX = ux;
  e.faceZ = uz;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) enterPhase2(e, L('A NAVE ATIVOU OS PROPULSORES DE COMBATE!', 'THE GUNSHIP ENGAGED COMBAT THRUSTERS!'), 0x00f0ff);
  e.bt -= dt;
  e.vulnerable = e.bstate === 'hover';
  const targetY = e.bstate === 'hover' ? 0.9 : 2.4;
  body.position.y += (targetY - body.position.y) * Math.min(1, dt * 3);
  const orbit = () => {
    e.orb = (e.orb ?? 0) + dt * (e.phase2 ? 0.8 : 0.6);
    const tx = c.x + Math.cos(e.orb) * 6;
    const tz = c.z + Math.sin(e.orb) * 6;
    const dx = tx - e.x;
    const dz = tz - e.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.2) {
      out.x = dx / l;
      out.z = dz / l;
      out.speed = Math.min(e.speed, l * 3);
    }
  };
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1;
      }
      break;
    case 'walk':
      orbit();
      if (e.bt <= 0) {
        const a = chooseAttack(e, ['strafe', 'bombRun', 'missiles', 'bombRun']);
        e.bstate = a;
        e.bt = a === 'bombRun' ? 2.6 : 0.3;
        if (a === 'bombRun') {
          const dx = p.x - e.x;
          const dz = p.z - e.z;
          const l = Math.hypot(dx, dz) || 1;
          e.cdx = dx / l;
          e.cdz = dz / l;
          e.endX = p.x + e.cdx * 4;
          e.endZ = p.z + e.cdz * 4;
          e.dropT = 0;
          sfx.telegraph();
        }
      }
      break;
    case 'strafe':
      orbit();
      if (e.bt <= 0) {
        e.wave++;
        e.bt = 0.11;
        const a = Math.atan2(p.z - e.z, p.x - e.x) + rr(-0.12, 0.12);
        spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * 1.2, z: e.z + Math.sin(a) * 1.2, y: 1.6, dx: Math.cos(a), dz: Math.sin(a), speed: 13, life: 1.6, dmg: e.dmg * 0.55, color: 0x00f0ff, size: 0.1, r: 0.16 });
        sfx.shoot();
        if (e.wave >= (e.phase2 ? 16 : 10)) toWalk(e);
      }
      break;
    case 'bombRun': {
      const dx = e.endX - e.x;
      const dz = e.endZ - e.z;
      const l = Math.hypot(dx, dz);
      e.faceX = dx;
      e.faceZ = dz;
      if (l > 0.6) {
        out.x = dx / l;
        out.z = dz / l;
        out.speed = 10;
      }
      e.dropT -= dt;
      if (e.dropT <= 0) {
        e.dropT = e.phase2 ? 0.16 : 0.22;
        const bx = e.x;
        const bz = e.z;
        telegraphFx(bx, bz, 1.5, 0.8, 0xff3355);
        after(0.8, () => enemyExplosion(bx, bz, 1.5, e.dmg, 0xff3355));
      }
      if (l < 0.6 || e.bt <= 0) {
        e.bstate = 'hover';
        e.bt = 3.5;
        toast(L('A nave pousou! Ataque agora!', 'The gunship landed! Attack now!'), 'heal', 'land');
      }
      break;
    }
    case 'hover':
      if (Math.random() < 0.3) burst(e.x, 0.5, e.z, 0x00f0ff, 1, 2, 0.06, 0.4);
      if (e.bt <= 0) toWalk(e);
      break;
    case 'missiles':
      orbit();
      if (e.bt <= 0) {
        e.wave++;
        e.bt = 0.35;
        for (const side of [-1, 1]) {
          const a = Math.atan2(p.z - e.z, p.x - e.x) + side * 0.8;
          spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * 1.2, z: e.z + Math.sin(a) * 1.2, y: 1.8, dx: Math.cos(a), dz: Math.sin(a), speed: 6.5, life: 4, dmg: e.dmg, color: 0xffaa00, size: 0.16, r: 0.24, homing: 1.6, shootable: true, explode: { r: 1.5, dmg: e.dmg } });
        }
        sfx.enemyShot();
        if (e.wave >= (e.phase2 ? 3 : 2)) toWalk(e);
      }
      break;
  }
  return out;
}

// ---------------- Hacker Supremo ----------------
const zoneGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
function updateHackerBoss(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  const c = arenaCenter();
  e.faceX = ux;
  e.faceZ = uz;
  if (!e.phase2 && e.hp < e.maxHp * 0.5) enterPhase2(e, L('SISTEMA COMPROMETIDO: MODO ROOT ATIVADO', 'SYSTEM COMPROMISED: ROOT MODE ENGAGED'), 0x39ff14);
  e.bt -= dt;
  updateZones(e, dt);
  updateFirewalls(e, dt);
  switch (e.bstate) {
    case 'intro':
      if (e.bt <= 0) {
        e.bstate = 'walk';
        e.bt = 1;
      }
      break;
    case 'walk':
      if (dist > 8) {
        out.x = ux;
        out.z = uz;
        out.speed = e.speed;
      }
      if (e.atkT <= 0 && e.los) {
        e.atkT = 1.4;
        spawnProjectile({ from: 'enemy', x: e.x + ux * 0.6, z: e.z + uz * 0.6, y: 1.4, dx: ux, dz: uz, speed: 8, life: 2.5, dmg: e.dmg * 0.7, color: 0x39ff14, size: 0.16, r: 0.18, homing: 0.8 });
      }
      if (e.bt <= 0) {
        const a = chooseAttack(e, ['grid', 'firewall', 'grid', 'virus', 'blink']);
        if (a === 'grid') {
          spawnZone(e, pick(['checker', 'rings', 'cross', 'stripes']));
          if (e.phase2) after(0.9, () => e.alive && spawnZone(e, pick(['checker', 'cross'])));
          e.bt = 2.2;
        } else if (a === 'firewall') {
          spawnFirewall(e, c);
          if (e.phase2) after(1.4, () => e.alive && spawnFirewall(e, c));
          e.bt = 2.6;
        } else if (a === 'virus') {
          minions(pick(['kamikaze', 'drone']), 3, e.x, e.z);
          e.bt = 1.8;
        } else {
          for (let k = 0; k < 12; k++) {
            const x = c.x + rr(-6, 6);
            const z = c.z + rr(-6, 6);
            if (isWalkable(G.dungeon, x, z) && Math.hypot(x - p.x, z - p.z) > 4) {
              burst(e.x, 1.2, e.z, 0x39ff14, 20, 4, 0.06, 0.4);
              e.x = x;
              e.z = z;
              burst(x, 1.2, z, 0x39ff14, 20, 4, 0.06, 0.4);
              sfx.zap();
              break;
            }
          }
          e.bt = 1;
        }
      }
      break;
  }
  return out;
}

function spawnZone(e, pattern) {
  const d = G.dungeon;
  const p = G.player;
  const c = arenaCenter();
  const tiles = [];
  const pi = Math.floor(p.x);
  const pj = Math.floor(p.z);
  const off = Math.floor(rr(0, 2));
  for (let j = Math.floor(c.z) - 9; j <= c.z + 9; j++)
    for (let i = Math.floor(c.x) - 9; i <= c.x + 9; i++) {
      if (!isWalkableTile(d, i, j)) continue;
      let on = false;
      if (pattern === 'checker') on = (Math.floor(i / 2) + Math.floor(j / 2) + off) % 2 === 0;
      else if (pattern === 'rings') on = Math.floor(Math.hypot(i + 0.5 - c.x, j + 0.5 - c.z) / 1.6 + off) % 2 === 0;
      else if (pattern === 'cross') on = Math.abs(i - pi) <= 1 || Math.abs(j - pj) <= 1;
      else on = (Math.floor((i + j) / 2) + off) % 2 === 0;
      if (on) tiles.push([i, j]);
    }
  if (!tiles.length) return;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(gk(1.3)), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.InstancedMesh(zoneGeo, mat, tiles.length);
  const m4 = new THREE.Matrix4();
  tiles.forEach(([i, j], k) => mesh.setMatrixAt(k, m4.makeTranslation(i + 0.5, 0.035, j + 0.5)));
  G.world.add(mesh);
  const set = new Set(tiles.map(([i, j]) => j * d.W + i));
  (e.zones = e.zones || []).push({ mesh, mat, set, t: 0, warn: 1.3, hit: false });
  sfx.telegraph();
}

function updateZones(e, dt) {
  if (!e.zones) return;
  const p = G.player;
  const d = G.dungeon;
  for (const z of e.zones) {
    z.t += dt;
    if (z.t < z.warn) {
      z.mat.opacity = Math.floor(z.t * 8) % 2 ? 0.45 : 0.2;
    } else {
      z.mat.opacity = 0.85;
      if (!z.flashed) {
        z.flashed = true;
        sfx.zap();
      }
      if (!z.hit && p.alive && z.set.has(Math.floor(p.z) * d.W + Math.floor(p.x))) {
        z.hit = true;
        damagePlayer(e.dmg * 1.5);
      }
    }
  }
  e.zones = e.zones.filter((z) => {
    if (z.t > z.warn + 0.45) {
      z.mesh.parent && z.mesh.parent.remove(z.mesh);
      z.mat.dispose();
      return false;
    }
    return true;
  });
}

const fireSegGeo = new THREE.BoxGeometry(0.9, 1.1, 0.25).translate(0, 0.55, 0);
function spawnFirewall(e, c) {
  const dir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  const gap = rr(-5, 5);
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff14).multiplyScalar(gk(1.6)), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let k = -10; k <= 10; k++) {
    if (Math.abs(k - gap) < 1.6) continue;
    const seg = new THREE.Mesh(fireSegGeo, mat);
    seg.position.x = k;
    group.add(seg);
  }
  group.rotation.y = dir[0] ? Math.PI / 2 : 0;
  G.world.add(group);
  const w = { dir, gap, pos: -10, group, mat, cx: c.x, cz: c.z, hit: false };
  (e.walls = e.walls || []).push(w);
  toast(L('Firewall! Passe pela abertura.', 'Firewall! Go through the gap.'), 'warn', 'fw');
  sfx.telegraph();
}

function updateFirewalls(e, dt) {
  if (!e.walls) return;
  const p = G.player;
  for (const w of e.walls) {
    w.pos += dt * 4.2;
    const [dx, dz] = w.dir;
    w.group.position.set(w.cx + dx * w.pos, 0, w.cz + dz * w.pos);
    if (Math.random() < 0.7) burst(w.group.position.x + (dz ? rr(-10, 10) : 0), 0.5, w.group.position.z + (dx ? rr(-10, 10) : 0), 0x39ff14, 1, 1, 0.07, 0.4, { grav: -2 });
    if (!w.hit && p.alive) {
      const rx = p.x - w.cx;
      const rz = p.z - w.cz;
      const along = rx * dx + rz * dz;
      const across = dx ? rz : rx;
      const acrossLocal = dx ? -across : across; // compensa a rotação do grupo
      if (Math.abs(along - w.pos) < 0.45 && Math.abs(acrossLocal - w.gap) > 1.5 && Math.abs(across) < 10.5) {
        w.hit = true;
        damagePlayer(e.dmg * 1.6);
      }
    }
  }
  e.walls = e.walls.filter((w) => {
    if (w.pos > 10.5) {
      w.group.parent && w.group.parent.remove(w.group);
      w.mat.dispose();
      return false;
    }
    return true;
  });
}

// ---------------- Núcleo OMEGA ----------------
const beamGeo = new THREE.BoxGeometry(0.22, 0.22, 1).translate(0, 0, 0.5);
function updateOmega(e, dt, dist, ux, uz) {
  const p = G.player;
  const out = { x: 0, z: 0, speed: 0 };
  if (!e.pylons) spawnPylons(e);
  if (!e.phase2 && e.hp < e.maxHp * 0.5) {
    e.phase2 = true;
    toast(L('OMEGA: SOBRECARGA DO NÚCLEO', 'OMEGA: CORE OVERLOAD'), 'warn');
    sfx.boss();
  }
  // escudo: imune enquanto houver pilares
  const pylonsAlive = e.pylons.filter((o) => o.alive).length;
  if (e.invulnerable && pylonsAlive === 0) {
    e.invulnerable = false;
    e.vulnerable = true;
    e.vulnT = 12;
    toast(L('ESCUDO DESATIVADO! Ataque o núcleo!', 'SHIELD DOWN! Attack the core!'), 'heal');
    ringFx(e.x, e.z, 3, 0x00f0ff, 0.5);
    sfx.levelup();
  } else if (!e.invulnerable) {
    e.vulnT -= dt;
    if (e.vulnT <= 0) spawnPylons(e);
  }
  // feixes giratórios
  if (e.beamT > 0) {
    e.beamT -= dt;
    e.beamCool = (e.beamCool || 0) - dt;
    const warm = e.beamT > e.beamDur - 1.1;
    e.beamAng += dt * (warm ? 0.1 : e.phase2 ? 0.8 : 0.55) * e.beamDir;
    const n = e.beamsActive;
    for (let k = 0; k < n; k++) {
      const b = e.beams[k];
      const a = e.beamAng + (k / n) * Math.PI * 2;
      b.rotation.y = -a + Math.PI / 2;
      b.material.opacity = warm ? (Math.floor(G.t * 12) % 2 ? 0.35 : 0.1) : 0.9;
      b.scale.set(warm ? 0.4 : 1, warm ? 0.4 : 1, 12);
      if (!warm && p.alive && e.beamCool <= 0) {
        const rx = p.x - e.x;
        const rz = p.z - e.z;
        const along = rx * Math.cos(a) + rz * Math.sin(a);
        const across = Math.abs(-rx * Math.sin(a) + rz * Math.cos(a));
        if (along > 0 && along < 12 && across < 0.4 + p.r) {
          e.beamCool = 0.5;
          damagePlayer(e.dmg * 1.2);
        }
      }
    }
    if (e.beamT <= 0) for (const b of e.beams) b.visible = false;
  }
  e.bt -= dt;
  if (e.spiralT > 0) {
    e.spiralT -= dt;
    e.spT = (e.spT || 0) - dt;
    if (e.spT <= 0) {
      e.spT = 0.1;
      e.spA = (e.spA || 0) + 0.33;
      for (const s of e.phase2 ? [0, Math.PI * 0.66, Math.PI * 1.33] : [0, Math.PI]) {
        const a = e.spA + s;
        spawnProjectile({ from: 'enemy', x: e.x + Math.cos(a) * 1.6, z: e.z + Math.sin(a) * 1.6, y: 1.6, dx: Math.cos(a), dz: Math.sin(a), speed: 6, life: 3, dmg: e.dmg * 0.6, color: 0xff2244, size: 0.15, r: 0.18 });
      }
    }
  }
  if (e.bstate === 'intro') {
    if (e.bt <= 0) {
      e.bstate = 'walk';
      e.bt = 1.5;
    }
  } else if (e.bt <= 0 && !(e.beamT > 0) && !(e.spiralT > 0)) {
    const a = chooseAttack(e, ['beams', 'spiral', 'beams', 'drones']);
    if (a === 'beams') {
      if (!e.beams) {
        e.beams = [];
        for (let k = 0; k < 3; k++) {
          const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2244).multiplyScalar(gk(2)), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
          b.position.set(e.x, 1.1, e.z);
          G.world.add(b);
          e.beams.push(b);
        }
      }
      e.beamsActive = e.phase2 ? 3 : 2;
      e.beams.forEach((b, k) => (b.visible = k < e.beamsActive));
      e.beamAng = Math.atan2(p.z - e.z, p.x - e.x) + 0.9;
      e.beamDir = chance(0.5) ? 1 : -1;
      e.beamDur = e.beamT = 5.5;
      sfx.telegraph();
      e.bt = 6.5;
    } else if (a === 'spiral') {
      e.spiralT = 3;
      e.bt = 4;
    } else {
      minions('drone', 2, e.x, e.z, 6);
      e.bt = 2;
    }
  }
  e.faceX = ux;
  e.faceZ = uz;
  return out;
}

function spawnPylons(e) {
  const d = G.dungeon;
  e.pylons = (e.pylons || []).filter((o) => o.alive);
  const n = e.phase2 ? 5 : 4;
  for (let k = e.pylons.length; k < n; k++) {
    let placed = false;
    for (let rad = 6; rad >= 3 && !placed; rad -= 1) {
      const a = (k / n) * Math.PI * 2 + 0.4;
      const x = e.x + Math.cos(a) * rad;
      const z = e.z + Math.sin(a) * rad;
      if (!isWalkable(d, x, z)) continue;
      const py = spawnEnemy('pylon', x, z);
      py.aggro = true;
      py.core = e;
      e.pylons.push(py);
      burst(x, 1, z, 0x00f0ff, 16, 4, 0.06, 0.4);
      placed = true;
    }
  }
  e.invulnerable = true;
  e.vulnerable = false;
  if (e.pylons.length === 0) e.invulnerable = false;
}

function updatePylon(e, dt) {
  e.faceX = 0;
  e.faceZ = 1;
  e.beamT = (e.beamT || rr(0, 0.5)) - dt;
  if (e.core && e.core.alive && e.beamT <= 0) {
    e.beamT = 0.45;
    beamFx(e.x, 2.2, e.z, e.core.x, 2.2, e.core.z, 0x00f0ff, 0.3, 6);
  }
  return { x: 0, z: 0, speed: 0 };
}
