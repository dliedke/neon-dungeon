// As três classes jogáveis e suas habilidades.
import { G } from './state.js';
import { hitEnemy, enemiesInRadius, enemiesInCone, spawnProjectile, lob, explosion, nearestEnemy, spawnTurret, chainFrom } from './combat.js';
import { slashFx, ringFx, burst, ghostFx } from './fx.js';
import { sfx } from './audio.js';
import { isWalkable } from './dungeon.js';
import { clamp } from './utils.js';
import { L } from './i18n.js';

export const rankMult = (r) => 1 + 0.15 * (r - 1);
const pct = (v) => `${Math.round(v * 100)}%`;

export const ICONS = {
  slash: '<path d="M5 27C11 15 18 8 27 4"/><path d="M9 29c6-9 12-15 20-18" opacity=".5"/>',
  dash: '<path d="M4 16h18M15 9l7 7-7 7M4 10h7M4 22h7"/>',
  spin: '<circle cx="16" cy="16" r="7"/><path d="M16 4a12 12 0 0 1 12 12M16 28A12 12 0 0 1 4 16"/><path d="M25 13l3 3 3-3M7 19l-3-3-3 3"/>',
  overclock: '<path d="M18 3L8 18h7l-2 11 11-16h-7z"/>',
  bullet: '<path d="M4 16h12"/><path d="M17 12h7l4 4-4 4h-7z"/>',
  fan: '<path d="M5 16L27 6M5 16h23M5 16l22 10"/>',
  grenade: '<circle cx="14" cy="19" r="8"/><path d="M14 11V7h6M23 5l3-2M25 9h4"/>',
  roll: '<circle cx="16" cy="16" r="10" stroke-dasharray="4 3"/><path d="M11 16h10M17 12l4 4-4 4"/>',
  orb: '<circle cx="16" cy="16" r="5"/><circle cx="16" cy="16" r="10" opacity=".5"/><path d="M16 2v4M16 26v4M2 16h4M26 16h4"/>',
  turret: '<path d="M8 28l8-10 8 10M16 18v-3"/><rect x="10" y="8" width="12" height="7" rx="2"/><path d="M22 11h7"/>',
  nova: '<circle cx="16" cy="16" r="4"/><circle cx="16" cy="16" r="9" stroke-dasharray="3 2"/><circle cx="16" cy="16" r="13" opacity=".5"/>',
  blink: '<path d="M16 4l7 12-7 12-7-12z"/><path d="M2 16h4M26 16h4"/>',
  stim: '<rect x="12" y="4" width="8" height="24" rx="4"/><path d="M12 16h8M16 12v8"/>',
};
export const iconSvg = (name) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

export const CLASSES = {
  blade: {
    id: 'blade',
    name: L('Lâmina', 'Blade'),
    title: L('Samurai Cromado', 'Chrome Samurai'),
    desc: L('Corpo a corpo. Muito resistente e ganha energia a cada golpe que acerta.', 'Melee fighter. Very tough and gains energy with every hit.'),
    css: '#ff2bd6',
    accent: 0xff2bd6,
    melee: true,
    range: 1.9,
    base: { hp: 190, en: 100, armor: 20, speed: 5.2, wMin: 14, wMax: 21, enRegen: 5, hpRegen: 2, crit: 5, critDmg: 50, atkRate: 2.1 },
    weaponNames: [L('Katana de Plasma', 'Plasma Katana'), L('Lâmina Monomolecular', 'Monomolecular Blade'), L('Wakizashi Térmica', 'Thermal Wakizashi'), L('Nodachi Vibratória', 'Vibro Nodachi')],
    skills: [
      { id: 'slash', name: L('Corte de Plasma', 'Plasma Slash'), icon: 'slash', cost: 0, cd: 0, desc: (r) => L(`Golpe em arco que causa ${pct(1.0 * rankMult(r))} do dano da arma. Todo 3º golpe é ampliado. Gera 4 de energia por acerto.`, `Arc strike dealing ${pct(1.0 * rankMult(r))} weapon damage. Every 3rd hit is empowered. Generates 4 energy per hit.`) },
      { id: 'lunge', name: L('Investida', 'Lunge'), icon: 'dash', cost: 15, cd: 3.5, desc: (r) => L(`Avança até o inimigo causando ${pct(1.8 * rankMult(r))} a todos no caminho. Invulnerável durante o avanço.`, `Dash to the enemy dealing ${pct(1.8 * rankMult(r))} to everything in the way. Invulnerable while dashing.`) },
      { id: 'whirl', name: L('Turbilhão', 'Whirlwind'), icon: 'spin', cost: 35, cd: 7, desc: (r) => L(`Gira por 1,4s causando ${pct(0.6 * rankMult(r))} a cada 0,2s ao redor. Você pode se mover enquanto gira.`, `Spin for 1.4s dealing ${pct(0.6 * rankMult(r))} every 0.2s around you. You can move while spinning.`) },
      { id: 'overclock', name: 'Overclock', icon: 'overclock', cost: 40, cd: 18, desc: (r) => L(`Por ${(5 + 0.5 * r).toFixed(1)}s: +50% de velocidade de ataque, +30% de movimento e 8% de roubo de vida.`, `For ${(5 + 0.5 * r).toFixed(1)}s: +50% attack speed, +30% movement and 8% life steal.`) },
    ],
  },
  gunner: {
    id: 'gunner',
    name: L('Atiradora', 'Gunslinger'),
    title: L('Pistoleira de Aluguel', 'Hired Gun'),
    desc: L('Ataques à distância muito rápidos. Ágil, com explosivos e esquiva.', 'Very fast ranged attacks. Agile, with explosives and a dodge roll.'),
    css: '#00f0ff',
    accent: 0x00f0ff,
    melee: false,
    range: 12,
    base: { hp: 150, en: 100, armor: 10, speed: 5.6, wMin: 10, wMax: 15, enRegen: 8, hpRegen: 1.5, crit: 8, critDmg: 60, atkRate: 3.4 },
    weaponNames: [L('Pistola Gêmea', 'Twin Pistol'), L('Revólver Magnético', 'Magnetic Revolver'), L('Pistola Smart', 'Smart Pistol'), L('Blaster Compacto', 'Compact Blaster')],
    skills: [
      { id: 'shot', name: L('Disparo Duplo', 'Double Tap'), icon: 'bullet', cost: 0, cd: 0, desc: (r) => L(`Dispara alternando as pistolas, causando ${pct(0.85 * rankMult(r))} do dano da arma.`, `Fires alternating pistols, dealing ${pct(0.85 * rankMult(r))} weapon damage.`) },
      { id: 'fan', name: L('Leque de Balas', 'Bullet Fan'), icon: 'fan', cost: 18, cd: 3, desc: (r) => L(`Dispara 7 balas em leque, cada uma causando ${pct(0.75 * rankMult(r))} e atravessando 1 inimigo.`, `Fires 7 bullets in a fan, each dealing ${pct(0.75 * rankMult(r))} and piercing 1 enemy.`) },
      { id: 'grenade', name: L('Granada de Pulso', 'Pulse Grenade'), icon: 'grenade', cost: 30, cd: 6, desc: (r) => L(`Arremessa uma granada que explode causando ${pct(3.0 * rankMult(r))} em área e empurrando os inimigos.`, `Throws a grenade that explodes for ${pct(3.0 * rankMult(r))} area damage and knocks enemies back.`) },
      { id: 'roll', name: L('Rolamento Tático', 'Tactical Roll'), icon: 'roll', cost: 10, cd: 2.5, desc: (r) => L(`Rola rapidamente, ficando invulnerável. Os próximos ${2 + Math.floor(r / 3)} disparos são críticos garantidos.`, `Quickly roll while invulnerable. Your next ${2 + Math.floor(r / 3)} shots are guaranteed critical hits.`) },
    ],
  },
  netrunner: {
    id: 'netrunner',
    name: 'Netrunner',
    title: L('Hacker de Combate', 'Combat Hacker'),
    desc: L('Controla o campo de batalha com drones, raios em cadeia e teletransporte.', 'Controls the battlefield with drones, chain lightning and teleportation.'),
    css: '#39ff14',
    accent: 0x39ff14,
    melee: false,
    range: 11,
    base: { hp: 140, en: 140, armor: 8, speed: 5.2, wMin: 14, wMax: 20, enRegen: 11, hpRegen: 1.5, crit: 5, critDmg: 50, atkRate: 2.0 },
    weaponNames: ['Cyberdeck', L('Deck Quântico', 'Quantum Deck'), L('Matriz Neural', 'Neural Matrix'), L('Console Fantasma', 'Ghost Console')],
    skills: [
      { id: 'orb', name: L('Pulso de Dados', 'Data Pulse'), icon: 'orb', cost: 0, cd: 0, desc: (r) => L(`Lança um orbe teleguiado que causa ${pct(1.05 * rankMult(r))} e salta para mais 1 inimigo (50%).`, `Launches a homing orb dealing ${pct(1.05 * rankMult(r))} that jumps to 1 more enemy (50%).`) },
      { id: 'turret', name: L('Torre-Drone', 'Drone Turret'), icon: 'turret', cost: 35, cd: 9, desc: (r) => L(`Instala uma torre por 12s que dispara no inimigo mais próximo causando ${pct(0.5 * rankMult(r))}. Máximo de 2.`, `Deploys a turret for 12s that shoots the nearest enemy for ${pct(0.5 * rankMult(r))}. Up to 2.`) },
      { id: 'nova', name: L('Curto-Circuito', 'Short Circuit'), icon: 'nova', cost: 30, cd: 7, desc: (r) => L(`Descarga ao seu redor que causa ${pct(2.0 * rankMult(r))} e atordoa os inimigos por 1,6s.`, `Discharge around you dealing ${pct(2.0 * rankMult(r))} and stunning enemies for 1.6s.`) },
      { id: 'blink', name: L('Salto de Rede', 'Net Jump'), icon: 'blink', cost: 20, cd: 4, desc: (r) => L(`Teletransporta para perto do inimigo e causa ${pct(1.0 * rankMult(r))} ao redor do destino.`, `Teleports next to the enemy and deals ${pct(1.0 * rankMult(r))} around the destination.`) },
    ],
  },
};

export const CLASS_ORDER = ['blade', 'gunner', 'netrunner'];

// --------------------------------------------------------------
// Implementação das habilidades. Retornam false se não puderam ser usadas.
// --------------------------------------------------------------
const angleOf = (dx, dz) => Math.atan2(dz, dx);

function targetPoint(p, maxRange) {
  const t = p.aimPoint;
  let dx = t.x - p.x;
  let dz = t.z - p.z;
  const l = Math.hypot(dx, dz);
  if (l > maxRange) {
    dx = (dx / l) * maxRange;
    dz = (dz / l) * maxRange;
  }
  return { x: p.x + dx, z: p.z + dz };
}

export const SKILL_FN = {
  // ---------------- Lâmina ----------------
  slash(p, r) {
    p.combo = (p.combo + 1) % 3;
    const big = p.combo === 2;
    const range = big ? 2.5 : 1.95;
    const arc = big ? Math.PI * 1.05 : Math.PI * 0.8;
    const hits = enemiesInCone(p.x, p.z, p.aim.dx, p.aim.dz, range, arc);
    for (const e of hits) hitEnemy(e, (big ? 1.5 : 1.0) * rankMult(r), { knock: big ? 5 : 1.5, energy: 4 });
    slashFx(p.x, p.z, angleOf(p.aim.dx, p.aim.dz), range, arc, CLASSES.blade.accent, big ? 0.6 : 0.75);
    if (big) burst(p.x + p.aim.dx * 1.3, 0.7, p.z + p.aim.dz * 1.3, CLASSES.blade.accent, 8, 4, 0.06, 0.3);
    sfx.slash();
    p.swing = 1;
    p.swingDir = big ? -1 : p.combo === 1 ? -1 : 1;
    return true;
  },
  lunge(p, r) {
    const reach = p.aimEnemy ? Math.min(6, Math.hypot(p.aimEnemy.x - p.x, p.aimEnemy.z - p.z) + 1.2) : 6;
    p.dash = { dx: p.aim.dx, dz: p.aim.dz, speed: 30, t: reach / 30, hit: new Set(), mult: 1.8 * rankMult(r), radius: 1.0, color: CLASSES.blade.accent };
    p.invuln = Math.max(p.invuln, 0.25);
    sfx.dash();
    return true;
  },
  whirl(p, r) {
    p.whirl = { t: 1.4, tick: 0, mult: 0.6 * rankMult(r) };
    return true;
  },
  overclock(p, r) {
    p.buffs.overclock = 5 + 0.5 * r;
    ringFx(p.x, p.z, 2.5, CLASSES.blade.accent, 0.5);
    burst(p.x, 1, p.z, CLASSES.blade.accent, 25, 5, 0.08, 0.6);
    sfx.levelup();
    return true;
  },

  // ---------------- Atiradora ----------------
  shot(p, r) {
    p.hand = 1 - p.hand;
    const side = p.hand ? 0.22 : -0.22;
    const px = p.x + -p.aim.dz * side + p.aim.dx * 0.4;
    const pz = p.z + p.aim.dx * side + p.aim.dz * 0.4;
    const forceCrit = p.sureCrit > 0;
    if (forceCrit) p.sureCrit--;
    spawnProjectile({ from: 'player', x: px, z: pz, dx: p.aim.dx, dz: p.aim.dz, speed: 26, life: 0.55, homing: 6, mult: 0.85 * rankMult(r), color: forceCrit ? 0xffee55 : CLASSES.gunner.accent, size: forceCrit ? 0.14 : 0.1, r: 0.22, forceCrit });
    burst(px, 0.9, pz, CLASSES.gunner.accent, 2, 2, 0.05, 0.12, { grav: 0 });
    sfx.shoot();
    p.swing = 1;
    return true;
  },
  fan(p, r) {
    const base = angleOf(p.aim.dx, p.aim.dz);
    for (let k = -3; k <= 3; k++) {
      const a = base + k * 0.14;
      spawnProjectile({ from: 'player', x: p.x + Math.cos(a) * 0.4, z: p.z + Math.sin(a) * 0.4, dx: Math.cos(a), dz: Math.sin(a), speed: 22, life: 0.5, mult: 0.75 * rankMult(r), color: CLASSES.gunner.accent, size: 0.1, r: 0.22, pierce: 1, homing: 2.5 });
    }
    sfx.shoot();
    setTimeout(() => sfx.shoot(), 40);
    p.swing = 1;
    return true;
  },
  grenade(p, r) {
    const t = targetPoint(p, 9);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.55, color: 0x00f0ff, onLand: (x, z) => explosion(x, z, 3, 3.0 * rankMult(r), { color: 0x00f0ff, knock: 7 }) });
    p.swing = 1;
    return true;
  },
  roll(p, r) {
    let dx = p.moveDir.x;
    let dz = p.moveDir.z;
    if (Math.hypot(dx, dz) < 0.1) {
      dx = p.aim.dx;
      dz = p.aim.dz;
    }
    const l = Math.hypot(dx, dz) || 1;
    p.dash = { dx: dx / l, dz: dz / l, speed: 20, t: 0.26, hit: null, roll: true, color: CLASSES.gunner.accent };
    p.invuln = Math.max(p.invuln, 0.35);
    p.sureCrit = 2 + Math.floor(r / 3);
    sfx.dash();
    return true;
  },

  // ---------------- Netrunner ----------------
  orb(p, r) {
    spawnProjectile({
      from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, y: 1.1, dx: p.aim.dx, dz: p.aim.dz, speed: 14, life: 0.95, mult: 1.05 * rankMult(r), color: CLASSES.netrunner.accent, size: 0.17, r: 0.28, homing: 8,
      onHit: (e) => chainFrom(e, 1, 0.5 * rankMult(r), 4.5, CLASSES.netrunner.accent),
    });
    sfx.orb();
    p.swing = 1;
    return true;
  },
  turret(p, r) {
    let t = targetPoint(p, 8);
    if (!isWalkable(G.dungeon, t.x, t.z)) t = { x: p.x + p.aim.dx * 0.8, z: p.z + p.aim.dz * 0.8 };
    if (!isWalkable(G.dungeon, t.x, t.z)) t = { x: p.x, z: p.z };
    spawnTurret(t.x, t.z, 12, 0.5 * rankMult(r));
    sfx.deploy();
    return true;
  },
  nova(p, r) {
    const hits = enemiesInRadius(p.x, p.z, 4.2);
    for (const e of hits) hitEnemy(e, 2.0 * rankMult(r), { stun: 1.6, knock: 3 });
    ringFx(p.x, p.z, 4.2, CLASSES.netrunner.accent, 0.4, { from: 0.5 });
    ringFx(p.x, p.z, 3.2, 0x9d4dff, 0.5, { from: 0.3 });
    burst(p.x, 0.6, p.z, CLASSES.netrunner.accent, 40, 9, 0.07, 0.5, { up: 0.2 });
    sfx.nova();
    G.shake = Math.max(G.shake, 0.25);
    return true;
  },
  blink(p, r) {
    const d = G.dungeon;
    let t = targetPoint(p, 7);
    if (p.aimEnemy) {
      const e = p.aimEnemy;
      const l = Math.hypot(e.x - p.x, e.z - p.z);
      const stop = Math.max(0, Math.min(7, l - 1.6));
      t = { x: p.x + p.aim.dx * stop, z: p.z + p.aim.dz * stop };
    }
    let tx = t.x;
    let tz = t.z;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const steps = 30;
    let ok = false;
    for (let s = 0; s <= steps; s++) {
      const k = 1 - s / steps;
      const x = p.x + dx * k;
      const z = p.z + dz * k;
      if (isWalkable(d, x, z) && isWalkable(d, x + 0.3, z) && isWalkable(d, x - 0.3, z) && isWalkable(d, x, z + 0.3) && isWalkable(d, x, z - 0.3)) {
        tx = x;
        tz = z;
        ok = true;
        break;
      }
    }
    if (!ok) return false;
    burst(p.x, 0.8, p.z, CLASSES.netrunner.accent, 20, 4, 0.07, 0.4);
    ghostFx(p.model, CLASSES.netrunner.accent);
    p.x = tx;
    p.z = tz;
    p.path = null;
    p.invuln = Math.max(p.invuln, 0.25);
    const hits = enemiesInRadius(tx, tz, 1.9);
    for (const e of hits) hitEnemy(e, 1.0 * rankMult(r), { knock: 3 });
    ringFx(tx, tz, 1.9, CLASSES.netrunner.accent, 0.3);
    burst(tx, 0.8, tz, CLASSES.netrunner.accent, 20, 5, 0.07, 0.4);
    sfx.zap();
    return true;
  },
};

// Usado pelas torres e para escolher alvos automáticos
export function autoTarget(p, range = 11) {
  return nearestEnemy(p.x, p.z, range, true);
}

export { clamp };
