// As três classes jogáveis e suas habilidades.
import { G } from './state.js';
import { hitEnemy, enemiesInRadius, enemiesInCone, spawnProjectile, lob, explosion, nearestEnemy, spawnTurret, chainFrom, spawnHazard, spawnBarrier, spawnDecoy, after, healPlayer } from './combat.js';
import { slashFx, ringFx, burst, ghostFx, particle, tempMesh } from './fx.js';
import * as THREE from 'three';
import { gk } from './state.js';
import { sfx } from './audio.js';
import { isWalkable, lineOfSight } from './dungeon.js';
import { clamp, rr, pick } from './utils.js';
import { L } from './i18n.js';
import * as PW from './powers.js';

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
  fist: '<path d="M9 14V9a2 2 0 0 1 4 0v4M13 13V8a2 2 0 0 1 4 0v5M17 13V9a2 2 0 0 1 4 0v6c0 6-3 9-8 9s-6-3-6-7v-3a2 2 0 0 1 4 0"/>',
  rocketFist: '<path d="M14 11h8a3 3 0 0 1 0 10h-8z"/><path d="M14 13H8M14 16H5M14 19H8"/>',
  titan: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M11 16l4 4 6-8"/>',
  quake: '<path d="M3 22l5-6 4 5 4-9 4 7 4-4 5 7"/><path d="M5 27h22"/>',
  flame: '<path d="M16 3c2 6 8 8 8 15a8 8 0 0 1-16 0c0-4 2-6 3-8 1 3 2 4 4 4-1-4-1-8 1-11z"/>',
  napalm: '<path d="M13 4h6v5l3 4v12a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V13l3-4z"/><path d="M16 4V1"/><path d="M13 19c1-2 3-2 3-5 2 2 3 3 3 5a3 3 0 0 1-6 0z"/>',
  jet: '<path d="M16 3l5 9h-3v9h-4v-9h-3z"/><path d="M12 25l-2 4M16 25v5M20 25l2 4"/>',
  supernova: '<circle cx="16" cy="16" r="5"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6M6 6l4 4M22 22l4 4M6 26l4-4M22 10l4-4"/>',
  cryo: '<path d="M4 16h14"/><path d="M19 12l9 4-9 4z"/><path d="M8 12l-2-2M8 20l-2 2"/>',
  iceBomb: '<path d="M16 4v24M6 10l20 12M6 22l20-12"/><path d="M13 6l3 3 3-3M13 26l3-3 3 3"/>',
  decoy: '<circle cx="16" cy="9" r="4"/><path d="M9 28v-8a7 7 0 0 1 14 0v8"/><path d="M4 9h3M25 9h3" stroke-dasharray="2 2"/>',
  rail: '<path d="M2 16h28"/><path d="M6 11v10M11 11v10M16 11v10M21 11v10"/>',
  minigun: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M20 13h9M20 16h10M20 19h9"/>',
  rocket: '<path d="M6 16l6-5h12l4 5-4 5H12z"/><path d="M6 16H2M8 12l-3-3M8 20l-3 3"/>',
  barrier: '<rect x="4" y="6" width="24" height="20" rx="2"/><path d="M4 12h24M4 20h24M12 6v20M20 6v20" opacity=".6"/>',
  orbitB: '<circle cx="16" cy="16" r="4"/><circle cx="16" cy="16" r="11" stroke-dasharray="2 4"/><path d="M27 16l-4-2v4zM5 16l4 2v-4zM16 5l2 4h-4zM16 27l-2-4h4z"/>',
  demon: '<path d="M7 4l4 8M25 4l-4 8"/><path d="M8 14c0-3 4-5 8-5s8 2 8 5v6c0 4-4 8-8 8s-8-4-8-8z"/><path d="M12 18l3 1M20 18l-3 1M13 24h6"/>',
  thunder: '<path d="M19 2L8 17h7l-3 13 13-18h-7l3-10z"/>',
  hourglass: '<path d="M9 4h14M9 28h14M10 4c0 7 12 7 12 12S10 21 10 28M22 4c0 7-12 7-12 12s12 5 12 12"/>',
  omni: '<path d="M4 28L28 4M4 4l24 24M16 2v28" opacity=".9"/>',
  swarm: '<circle cx="8" cy="10" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="24" cy="11" r="2"/><circle cx="11" cy="20" r="2"/><circle cx="21" cy="21" r="2"/><circle cx="16" cy="27" r="2"/>',
  shield: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M10 15h12M16 9v12"/>',
  orbLaser: '<path d="M10 3h12l-2 5h-8z"/><path d="M14 8v16M18 8v16"/><ellipse cx="16" cy="26" rx="8" ry="3"/>',
  clone: '<circle cx="11" cy="9" r="4"/><path d="M4 28v-6a7 7 0 0 1 14 0v6"/><circle cx="22" cy="9" r="4" opacity=".5"/><path d="M18 18a7 7 0 0 1 11 4v6" opacity=".5"/>',
  ring: '<circle cx="16" cy="16" r="5"/><path d="M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3"/>',
  storm: '<path d="M8 13a6 6 0 0 1 11-5 5 5 0 0 1 6 8H8a4 4 0 0 1 0-3z"/><path d="M13 19l-3 6h4l-2 5M21 19l-2 4h3l-2 4"/>',
  hole: '<circle cx="16" cy="16" r="4" fill="currentColor"/><path d="M16 4a12 12 0 0 1 12 12M28 16a12 12 0 0 1-12 12M16 28A12 12 0 0 1 4 16M4 16A12 12 0 0 1 16 4" stroke-dasharray="6 3"/>',
  hack: '<path d="M10 8a6 6 0 0 1 12 0c3 1 4 4 3 7 2 2 1 6-2 7-1 3-5 4-7 2-2 2-6 1-7-2-3-1-4-5-2-7-1-3 0-6 3-7z"/><path d="M12 14h8M14 18h4"/>',
  clap: '<path d="M10 22l-4-10 3-1 3 6M22 22l4-10-3-1-3 6M10 22h12l-2 6h-8z"/><path d="M16 2v5M8 5l2 4M24 5l-2 4"/>',
  meteor: '<circle cx="20" cy="20" r="6"/><path d="M15 15L4 4M12 19L5 12M19 12L12 5"/>',
  golem: '<rect x="9" y="4" width="14" height="10" rx="2"/><path d="M6 14h20v8H6zM9 22v6M23 22v6M12 9h2M18 9h2"/>',
  fireRing: '<circle cx="16" cy="16" r="10"/><path d="M16 2c1 3 3 3 3 6a3 3 0 0 1-6 0c0-2 2-3 3-6zM16 22c1 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z"/>',
  pillarsI: '<path d="M6 28V16M12 28V10M18 28V14M24 28V6"/><path d="M4 28h24"/>',
  phoenix: '<path d="M16 6c-2 4-8 4-12 2 2 6 6 9 12 9s10-3 12-9c-4 2-10 2-12-2z"/><path d="M16 17v11M12 24l4 4 4-4"/>',
  snow: '<path d="M16 3v26M5 9l22 14M5 23l22-14"/><circle cx="16" cy="16" r="3"/>',
  wolf: '<path d="M5 10l5-6 3 6h6l3-6 5 6v8l-6 9h-10l-6-9z"/><path d="M12 15h1M19 15h1M14 22h4"/>',
  spike: '<path d="M5 28l4-14 3 14M12 28l4-22 4 22M20 28l3-14 4 14"/>',
  tesla: '<path d="M16 30V14"/><circle cx="16" cy="9" r="4"/><path d="M10 18h12M11 22h10M8 6l-4-2M24 6l4-2M7 12H3M25 12h4"/>',
  mech: '<rect x="8" y="10" width="16" height="12" rx="2"/><rect x="12" y="4" width="8" height="6"/><path d="M8 14H3v6M24 14h5v6M11 22v6M21 22v6M14 7h1M17 7h1"/>',
  nuke: '<circle cx="16" cy="16" r="3"/><path d="M16 13V4a12 12 0 0 1 10 6l-8 5M13 17.5L5 22a12 12 0 0 1 0-12l8 5M19 17.5l8 4.5a12 12 0 0 1-11 6v-9"/>',
  missileRain: '<path d="M8 4v10M16 2v12M24 4v10"/><path d="M5 12l3 4 3-4M13 10l3 4 3-4M21 12l3 4 3-4"/><path d="M4 27h24"/>',
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
      { id: 'whirl', req: 2, name: L('Turbilhão', 'Whirlwind'), icon: 'spin', cost: 35, cd: 7, desc: (r) => L(`Gira por 1,4s causando ${pct(0.6 * rankMult(r))} a cada 0,2s ao redor. Você pode se mover enquanto gira.`, `Spin for 1.4s dealing ${pct(0.6 * rankMult(r))} every 0.2s around you. You can move while spinning.`) },
      { id: 'overclock', req: 4, name: 'Overclock', icon: 'overclock', cost: 40, cd: 18, desc: (r) => L(`Por ${(5 + 0.5 * r).toFixed(1)}s: +50% de velocidade de ataque, +30% de movimento e 8% de roubo de vida.`, `For ${(5 + 0.5 * r).toFixed(1)}s: +50% attack speed, +30% movement and 8% life steal.`) },
      { id: 'bladeOrbit', req: 5, name: L('Lâminas Orbitais', 'Orbiting Blades'), icon: 'orbitB', cost: 30, cd: 12, desc: (r) => L(`4 lâminas giram ao seu redor por 8s, cada uma causando ${pct(0.7 * rankMult(r))} a quem tocar.`, `4 blades orbit you for 8s, each dealing ${pct(0.7 * rankMult(r))} to anything they touch.`) },
      { id: 'oni', req: 7, name: L('Invocar Oni', 'Summon Oni'), icon: 'demon', cost: 45, cd: 25, desc: (r) => L(`Invoca um demônio samurai que luta ao seu lado por 15s causando ${pct(1.6 * rankMult(r))} por golpe.`, `Summons a demon samurai that fights for you for 15s, dealing ${pct(1.6 * rankMult(r))} per strike.`) },
      { id: 'thunderCut', req: 9, name: L('Corte Trovão', 'Thunder Cut'), icon: 'thunder', cost: 25, cd: 6, desc: (r) => L(`Um raio salta por até 6 inimigos causando ${pct(1.4 * rankMult(r))} e atordoando.`, `Lightning jumps across up to 6 enemies dealing ${pct(1.4 * rankMult(r))} and stunning.`) },
      { id: 'timeWarp', req: 12, name: L('Dobra Temporal', 'Time Warp'), icon: 'hourglass', cost: 35, cd: 16, desc: () => L('Cria uma bolha de 6m onde inimigos e tiros ficam em câmera lenta por 5s.', 'Creates a 6m bubble where enemies and their shots move in slow motion for 5s.') },
      { id: 'omnislash', req: 15, name: L('Mil Cortes', 'Omnislash'), icon: 'omni', cost: 60, cd: 20, desc: (r) => L(`Teleporta entre até 8 inimigos, cortando cada um com ${pct(2.2 * rankMult(r))}. Invulnerável durante a sequência.`, `Teleport between up to 8 enemies, slashing each for ${pct(2.2 * rankMult(r))}. Invulnerable during the sequence.`) },
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
      { id: 'grenade', req: 2, name: L('Granada de Pulso', 'Pulse Grenade'), icon: 'grenade', cost: 30, cd: 6, desc: (r) => L(`Arremessa uma granada que explode causando ${pct(3.0 * rankMult(r))} em área e empurrando os inimigos.`, `Throws a grenade that explodes for ${pct(3.0 * rankMult(r))} area damage and knocks enemies back.`) },
      { id: 'roll', req: 4, name: L('Rolamento Tático', 'Tactical Roll'), icon: 'roll', cost: 10, cd: 2.5, desc: (r) => L(`Rola rapidamente, ficando invulnerável. Os próximos ${2 + Math.floor(r / 3)} disparos são críticos garantidos.`, `Quickly roll while invulnerable. Your next ${2 + Math.floor(r / 3)} shots are guaranteed critical hits.`) },
      { id: 'swarm', req: 5, name: L('Enxame de Mini-Drones', 'Mini-Drone Swarm'), icon: 'swarm', cost: 30, cd: 8, desc: (r) => L(`Solta 10 mini-drones teleguiados, cada um causando ${pct(0.8 * rankMult(r))}.`, `Releases 10 homing mini-drones, each dealing ${pct(0.8 * rankMult(r))}.`) },
      { id: 'pshield', req: 7, name: L('Escudo de Plasma', 'Plasma Shield'), icon: 'shield', cost: 30, cd: 15, desc: () => L('Por 6s, um escudo absorve 30% da vida em dano e devolve os tiros inimigos.', 'For 6s, a shield absorbs 30% of your health in damage and reflects enemy shots.') },
      { id: 'orbLaser', req: 9, name: L('Laser Orbital', 'Orbital Laser'), icon: 'orbLaser', cost: 45, cd: 14, desc: (r) => L(`Um satélite dispara um laser do céu que persegue inimigos por 5s (${pct(0.5 * rankMult(r))} a cada 0,15s).`, `A satellite fires a laser from the sky that chases enemies for 5s (${pct(0.5 * rankMult(r))} every 0.15s).`) },
      { id: 'holoClone', req: 12, name: L('Clones Holográficos', 'Holo Clones'), icon: 'clone', cost: 40, cd: 20, desc: (r) => L(`Cria 2 clones que atiram por 12s (${pct(0.6 * rankMult(r))} por tiro).`, `Creates 2 clones that shoot for 12s (${pct(0.6 * rankMult(r))} per shot).`) },
      { id: 'bulletRing', req: 15, name: L('Anel de Balas', 'Bullet Ring'), icon: 'ring', cost: 50, cd: 12, desc: (r) => L(`5 ondas de 18 balas em todas as direções, cada uma causando ${pct(0.6 * rankMult(r))}.`, `5 waves of 18 bullets in every direction, each dealing ${pct(0.6 * rankMult(r))}.`) },
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
      { id: 'nova', req: 2, name: L('Curto-Circuito', 'Short Circuit'), icon: 'nova', cost: 30, cd: 7, desc: (r) => L(`Descarga ao seu redor que causa ${pct(2.0 * rankMult(r))} e atordoa os inimigos por 1,6s.`, `Discharge around you dealing ${pct(2.0 * rankMult(r))} and stunning enemies for 1.6s.`) },
      { id: 'blink', req: 4, name: L('Salto de Rede', 'Net Jump'), icon: 'blink', cost: 20, cd: 4, desc: (r) => L(`Teletransporta para perto do inimigo e causa ${pct(1.0 * rankMult(r))} ao redor do destino.`, `Teleports next to the enemy and deals ${pct(1.0 * rankMult(r))} around the destination.`) },
      { id: 'storm', req: 5, name: L('Tempestade de Raios', 'Lightning Storm'), icon: 'storm', cost: 40, cd: 14, desc: (r) => L(`Por 6s, raios caem do céu sobre os inimigos próximos (3 por segundo, ${pct(1.2 * rankMult(r))} cada).`, `For 6s, lightning strikes nearby enemies from the sky (3 per second, ${pct(1.2 * rankMult(r))} each).`) },
      { id: 'blackHole', req: 7, name: L('Buraco Negro', 'Black Hole'), icon: 'hole', cost: 45, cd: 14, desc: (r) => L(`Abre um buraco negro que suga os inimigos por 3,5s e explode causando ${pct(3 * rankMult(r))}.`, `Opens a black hole that pulls enemies in for 3.5s, then explodes for ${pct(3 * rankMult(r))}.`) },
      { id: 'daemon', req: 9, name: L('Daemon Digital', 'Digital Daemon'), icon: 'demon', cost: 50, cd: 25, desc: (r) => L(`Invoca um demônio digital voador que dispara por 18s (${pct(1.2 * rankMult(r))} por tiro).`, `Summons a flying digital demon that shoots for 18s (${pct(1.2 * rankMult(r))} per shot).`) },
      { id: 'netWarp', req: 12, name: L('Lag Forçado', 'Forced Lag'), icon: 'hourglass', cost: 35, cd: 16, desc: () => L('Causa lag na realidade: inimigos e tiros num raio de 6,5m ficam em câmera lenta por 5s.', 'Lags reality: enemies and shots within 6.5m move in slow motion for 5s.') },
      { id: 'mindHack', req: 15, name: L('Controle Mental', 'Mind Hack'), icon: 'hack', cost: 60, cd: 25, desc: () => L('Hackeia até 3 inimigos próximos, que lutam do seu lado por 12s e depois explodem.', 'Hacks up to 3 nearby enemies to fight for you for 12s, then they explode.') },
    ],
  },
  brawler: {
    id: 'brawler',
    name: L('Punho de Aço', 'Iron Fist'),
    title: L('Boxeador Cibernético', 'Cyber Brawler'),
    desc: L('Corpo a corpo pesado. Combos que atordoam, socos-foguete e terremotos.', 'Heavy melee. Stunning combos, rocket punches and earthquakes.'),
    css: '#ff8a00',
    accent: 0xff8a00,
    melee: true,
    range: 1.75,
    base: { hp: 220, en: 100, armor: 26, speed: 5.0, wMin: 13, wMax: 19, enRegen: 5, hpRegen: 2.2, crit: 5, critDmg: 50, atkRate: 2.5 },
    weaponNames: [L('Manoplas de Titânio', 'Titanium Gauntlets'), L('Punhos Hidráulicos', 'Hydraulic Fists'), L('Soqueiras de Plasma', 'Plasma Knuckles'), L('Braços de Pistão', 'Piston Arms')],
    skills: [
      { id: 'punch', name: L('Combo Cibernético', 'Cyber Combo'), icon: 'fist', cost: 0, cd: 0, desc: (r) => L(`Socos rápidos que causam ${pct(0.9 * rankMult(r))}. Todo 4º soco é um gancho de ${pct(2.2 * rankMult(r))} que atordoa.`, `Fast punches dealing ${pct(0.9 * rankMult(r))}. Every 4th punch is a ${pct(2.2 * rankMult(r))} hook that stuns.`) },
      { id: 'rocketFist', name: L('Punho-Foguete', 'Rocket Fist'), icon: 'rocketFist', cost: 20, cd: 4, desc: (r) => L(`Dispara o punho, que atravessa todos no caminho causando ${pct(1.6 * rankMult(r))} e empurrando.`, `Launches your fist through everything in its path, dealing ${pct(1.6 * rankMult(r))} and knocking back.`) },
      { id: 'titan', req: 2, name: L('Pele de Titânio', 'Titanium Skin'), icon: 'titan', cost: 30, cd: 14, desc: (r) => L(`Por ${(4 + 0.4 * r).toFixed(1)}s você recebe 60% menos dano.`, `For ${(4 + 0.4 * r).toFixed(1)}s you take 60% less damage.`) },
      { id: 'quake', req: 4, name: L('Terremoto', 'Earthquake'), icon: 'quake', cost: 45, cd: 10, desc: (r) => L(`Golpeia o chão: ${pct(2.6 * rankMult(r))} e atordoamento ao redor, seguido de uma onda maior de ${pct(1.0 * rankMult(r))}.`, `Slam the ground: ${pct(2.6 * rankMult(r))} and a stun around you, followed by a wider ${pct(1.0 * rankMult(r))} wave.`) },
      { id: 'thunderClap', req: 5, name: L('Palmas Trovejantes', 'Thunder Clap'), icon: 'clap', cost: 30, cd: 8, desc: (r) => L(`Bate palmas: onda de choque de ${pct(1.6 * rankMult(r))} que atordoa, mais um raio que salta por 4 inimigos.`, `Clap: a ${pct(1.6 * rankMult(r))} shockwave that stuns, plus lightning that jumps across 4 enemies.`) },
      { id: 'pshieldB', req: 7, name: L('Escudo de Plasma', 'Plasma Shield'), icon: 'shield', cost: 30, cd: 15, desc: () => L('Por 6s, um escudo absorve 40% da vida em dano e devolve os tiros inimigos.', 'For 6s, a shield absorbs 40% of your health in damage and reflects enemy shots.') },
      { id: 'meteorPunch', req: 9, name: L('Soco Meteoro', 'Meteor Punch'), icon: 'meteor', cost: 35, cd: 9, desc: (r) => L(`Salta até o alvo e cai como um meteoro, causando ${pct(3.2 * rankMult(r))} em área e queimando.`, `Leap to the target and crash like a meteor, dealing ${pct(3.2 * rankMult(r))} in an area and burning.`) },
      { id: 'golem', req: 12, name: L('Invocar Golem', 'Summon Golem'), icon: 'golem', cost: 50, cd: 25, desc: (r) => L(`Invoca um golem de aço por 18s que esmaga e atordoa em área (${pct(2.4 * rankMult(r))}).`, `Summons a steel golem for 18s that smashes and stuns in an area (${pct(2.4 * rankMult(r))}).`) },
      { id: 'demonForm', req: 15, name: L('Forma Demoníaca', 'Demon Form'), icon: 'demon', cost: 60, cd: 30, desc: () => L('Vira um demônio por 12s: +60% de dano, -30% de dano recebido, roubo de vida e aura de fogo.', 'Become a demon for 12s: +60% damage, -30% damage taken, life steal and a fire aura.') },
    ],
  },
  pyro: {
    id: 'pyro',
    name: L('Incendiária', 'Pyro'),
    title: L('Piromaníaca de Rua', 'Street Pyromaniac'),
    desc: L('Curta distância. Lança-chamas contínuo que queima e deixa fogo pelo chão.', 'Short range. A continuous flamethrower that burns and sets the ground on fire.'),
    css: '#ff4422',
    accent: 0xff4422,
    melee: false,
    range: 4.4,
    base: { hp: 175, en: 110, armor: 16, speed: 5.3, wMin: 12, wMax: 17, enRegen: 8, hpRegen: 1.6, crit: 4, critDmg: 50, atkRate: 8 },
    weaponNames: [L('Lança-chamas Caseiro', 'Homemade Flamer'), L('Maçarico Industrial', 'Industrial Torch'), L('Projetor de Plasma', 'Plasma Projector'), L('Dragão Portátil', 'Pocket Dragon')],
    skills: [
      { id: 'flame', name: L('Lança-chamas', 'Flamethrower'), icon: 'flame', cost: 0, cd: 0, desc: (r) => L(`Jato de fogo em cone que causa ${pct(0.24 * rankMult(r))} várias vezes por segundo e queima os inimigos.`, `A cone of fire dealing ${pct(0.24 * rankMult(r))} many times per second and setting enemies ablaze.`) },
      { id: 'napalm', name: L('Coquetel Napalm', 'Napalm Cocktail'), icon: 'napalm', cost: 25, cd: 5, desc: (r) => L(`Arremessa um coquetel que explode (${pct(1.2 * rankMult(r))}) e deixa o chão em chamas por 5s.`, `Throws a cocktail that explodes (${pct(1.2 * rankMult(r))}) and leaves the ground burning for 5s.`) },
      { id: 'jet', req: 2, name: L('Jato Propulsor', 'Jet Leap'), icon: 'jet', cost: 20, cd: 6, desc: (r) => L(`Salta até o alvo, invulnerável, e explode ao aterrissar causando ${pct(1.5 * rankMult(r))}.`, `Leap to the target while invulnerable and explode on landing for ${pct(1.5 * rankMult(r))}.`) },
      { id: 'supernova', req: 4, name: 'Supernova', icon: 'supernova', cost: 50, cd: 14, desc: (r) => L(`Explosão gigante ao seu redor que causa ${pct(3.0 * rankMult(r))} e incendeia tudo.`, `A huge blast around you dealing ${pct(3.0 * rankMult(r))} and setting everything on fire.`) },
      { id: 'fireRing', req: 5, name: L('Anel de Fogo', 'Ring of Fire'), icon: 'fireRing', cost: 30, cd: 12, desc: (r) => L(`6 bolas de fogo giram ao seu redor por 8s, queimando quem tocar (${pct(0.6 * rankMult(r))}).`, `6 fireballs orbit you for 8s, burning whatever they touch (${pct(0.6 * rankMult(r))}).`) },
      { id: 'firePillars', req: 7, name: L('Pilares de Fogo', 'Fire Pillars'), icon: 'pillarsI', cost: 30, cd: 6, desc: (r) => L(`Uma linha de 8 pilares de fogo surge do chão à sua frente (${pct(1.3 * rankMult(r))} cada).`, `A line of 8 fire pillars erupts from the ground in front of you (${pct(1.3 * rankMult(r))} each).`) },
      { id: 'ifrit', req: 9, name: L('Invocar Ifrit', 'Summon Ifrit'), icon: 'demon', cost: 50, cd: 25, desc: (r) => L(`Invoca um demônio de fogo por 18s que incendeia tudo que golpeia (${pct(1.2 * rankMult(r))}).`, `Summons a fire demon for 18s that sets everything it hits ablaze (${pct(1.2 * rankMult(r))}).`) },
      { id: 'meteors', req: 12, name: L('Chuva de Meteoros', 'Meteor Shower'), icon: 'meteor', cost: 55, cd: 16, desc: (r) => L(`12 meteoros caem na área do alvo, cada um causando ${pct(1.6 * rankMult(r))} e queimando.`, `12 meteors fall on the target area, each dealing ${pct(1.6 * rankMult(r))} and burning.`) },
      { id: 'phoenix', req: 15, name: L('Fênix', 'Phoenix'), icon: 'phoenix', cost: 50, cd: 18, desc: (r) => L(`Avança como uma fênix de fogo, causando ${pct(2.5 * rankMult(r))}, deixando um rastro em chamas e curando 20% da vida.`, `Dash as a fire phoenix dealing ${pct(2.5 * rankMult(r))}, leaving a burning trail and healing 20% health.`) },
    ],
  },
  frost: {
    id: 'frost',
    name: L('Geada', 'Frost'),
    title: L('Atiradora Criogênica', 'Cryo Sniper'),
    desc: L('Longa distância. Tiros perfurantes que deixam lento, congelamento e iscas.', 'Long range. Piercing shots that slow, freezing blasts and decoys.'),
    css: '#8ab4ff',
    accent: 0x8ab4ff,
    melee: false,
    range: 14,
    base: { hp: 135, en: 110, armor: 8, speed: 5.3, wMin: 20, wMax: 28, enRegen: 8, hpRegen: 1.4, crit: 15, critDmg: 80, atkRate: 1.35 },
    weaponNames: [L('Rifle Criogênico', 'Cryo Rifle'), L('Fuzil de Nitrogênio', 'Nitrogen Rifle'), L('Lança-gelo', 'Ice Lancer'), L('Rifle Zero Absoluto', 'Absolute Zero Rifle')],
    skills: [
      { id: 'cryo', name: L('Tiro Criogênico', 'Cryo Shot'), icon: 'cryo', cost: 0, cd: 0, desc: (r) => L(`Tiro rápido que atravessa 2 inimigos, causa ${pct(1.5 * rankMult(r))} e deixa lento.`, `A fast shot that pierces 2 enemies, deals ${pct(1.5 * rankMult(r))} and slows.`) },
      { id: 'iceBomb', name: L('Bomba de Gelo', 'Ice Bomb'), icon: 'iceBomb', cost: 25, cd: 7, desc: (r) => L(`Explosão gélida que causa ${pct(1.4 * rankMult(r))} e congela os inimigos por 2s.`, `An icy blast dealing ${pct(1.4 * rankMult(r))} and freezing enemies for 2s.`) },
      { id: 'decoy', req: 2, name: L('Isca Holográfica', 'Holo Decoy'), icon: 'decoy', cost: 20, cd: 12, desc: (r) => L(`Deixa uma cópia sua que atrai os inimigos por 6s e depois explode em gelo (${pct(1.5 * rankMult(r))}).`, `Leaves a copy of you that draws enemies for 6s, then explodes in ice (${pct(1.5 * rankMult(r))}).`) },
      { id: 'rail', req: 4, name: L('Tiro de Trilho', 'Railgun'), icon: 'rail', cost: 40, cd: 8, desc: (r) => L(`Raio que atravessa tudo em linha reta causando ${pct(5 * rankMult(r))}.`, `A beam that pierces everything in a straight line, dealing ${pct(5 * rankMult(r))}.`) },
      { id: 'blizzard', req: 5, name: L('Nevasca', 'Blizzard'), icon: 'snow', cost: 35, cd: 12, desc: (r) => L(`Uma nevasca de 6s na área do alvo deixa lento e causa ${pct(0.35 * rankMult(r))} a cada 0,5s.`, `A 6s blizzard on the target area slows and deals ${pct(0.35 * rankMult(r))} every 0.5s.`) },
      { id: 'iceArmor', req: 7, name: L('Armadura de Gelo', 'Ice Armor'), icon: 'shield', cost: 30, cd: 15, desc: () => L('Por 6s, absorve 35% da vida em dano e devolve os tiros como estilhaços que deixam lento.', 'For 6s, absorbs 35% of your health in damage and reflects shots as slowing shards.') },
      { id: 'wolves', req: 9, name: L('Matilha de Lobos de Gelo', 'Ice Wolf Pack'), icon: 'wolf', cost: 45, cd: 22, desc: (r) => L(`Invoca 3 lobos de gelo velozes por 15s que mordem e deixam lento (${pct(0.9 * rankMult(r))}).`, `Summons 3 fast ice wolves for 15s that bite and slow (${pct(0.9 * rankMult(r))}).`) },
      { id: 'frozenTime', req: 12, name: L('Tempo Congelado', 'Frozen Time'), icon: 'hourglass', cost: 40, cd: 18, desc: () => L('Congela o tempo num raio de 7m: inimigos e tiros quase param por 5s.', 'Freezes time within 7m: enemies and shots nearly stop for 5s.') },
      { id: 'glacier', req: 15, name: L('Lança Glacial', 'Glacial Spear'), icon: 'spike', cost: 45, cd: 9, desc: (r) => L(`Uma fileira de 10 espinhos de gelo surge à sua frente (${pct(2.2 * rankMult(r))}) e congela.`, `A row of 10 ice spikes erupts in front of you (${pct(2.2 * rankMult(r))}) and freezes.`) },
    ],
  },
  heavy: {
    id: 'heavy',
    name: L('Colosso', 'Juggernaut'),
    title: L('Ciborgue Pesado', 'Heavy Cyborg'),
    desc: L('Muito resistente. Metralhadora giratória que acelera, foguetes e barreira de energia.', 'Very tough. A minigun that spins up, rockets and an energy barrier.'),
    css: '#ffd23d',
    accent: 0xffd23d,
    melee: false,
    range: 11,
    spinUp: true,
    base: { hp: 240, en: 100, armor: 30, speed: 4.6, wMin: 11, wMax: 15, enRegen: 7, hpRegen: 2, crit: 4, critDmg: 50, atkRate: 4 },
    weaponNames: [L('Metralhadora Giratória', 'Rotary Minigun'), L('Canhão de Rajada', 'Burst Cannon'), L('Serra de Balas', 'Bullet Saw'), L('Vulcan Pesada', 'Heavy Vulcan')],
    skills: [
      { id: 'minigun', name: L('Metralhadora', 'Minigun'), icon: 'minigun', cost: 0, cd: 0, desc: (r) => L(`Rajada contínua de ${pct(0.42 * rankMult(r))} por bala. Acelera até 3x enquanto você segura o ataque.`, `A continuous stream of ${pct(0.42 * rankMult(r))} per bullet. Spins up to 3x while you hold attack.`) },
      { id: 'rocket', name: L('Foguete', 'Rocket'), icon: 'rocket', cost: 20, cd: 3, desc: (r) => L(`Foguete que explode em área causando ${pct(2.4 * rankMult(r))}.`, `A rocket that explodes in an area for ${pct(2.4 * rankMult(r))}.`) },
      { id: 'barrier', req: 2, name: L('Barreira de Energia', 'Energy Barrier'), icon: 'barrier', cost: 30, cd: 12, desc: (r) => L(`Ergue uma parede de energia à sua frente que bloqueia tiros inimigos por ${(7 + 0.3 * r).toFixed(1)}s.`, `Raises an energy wall in front of you that blocks enemy shots for ${(7 + 0.3 * r).toFixed(1)}s.`) },
      { id: 'missileRain', req: 4, name: L('Chuva de Mísseis', 'Missile Rain'), icon: 'missileRain', cost: 50, cd: 15, desc: (r) => L(`10 mísseis caem na área do alvo, cada um causando ${pct(1.2 * rankMult(r))}.`, `10 missiles rain down on the target area, each dealing ${pct(1.2 * rankMult(r))}.`) },
      { id: 'tesla', req: 5, name: L('Torre Tesla', 'Tesla Coil'), icon: 'tesla', cost: 35, cd: 14, desc: (r) => L(`Instala uma bobina por 14s que lança raios em cadeia em até 4 inimigos (${pct(0.7 * rankMult(r))}).`, `Deploys a coil for 14s that chains lightning through up to 4 enemies (${pct(0.7 * rankMult(r))}).`) },
      { id: 'swarmH', req: 7, name: L('Enxame de Drones', 'Drone Swarm'), icon: 'swarm', cost: 30, cd: 9, desc: (r) => L(`Solta 12 drones teleguiados, cada um causando ${pct(0.7 * rankMult(r))}.`, `Releases 12 homing drones, each dealing ${pct(0.7 * rankMult(r))}.`) },
      { id: 'orbLaserH', req: 9, name: L('Laser Orbital', 'Orbital Laser'), icon: 'orbLaser', cost: 45, cd: 14, desc: (r) => L(`Um satélite dispara um laser do céu que persegue inimigos por 5s (${pct(0.55 * rankMult(r))} a cada 0,15s).`, `A satellite fires a laser from the sky that chases enemies for 5s (${pct(0.55 * rankMult(r))} every 0.15s).`) },
      { id: 'mech', req: 12, name: L('Armadura Mech', 'Mech Suit'), icon: 'mech', cost: 50, cd: 30, desc: () => L('Vira um robô gigante por 12s: +40% de dano, -55% de dano recebido e ataque 40% mais rápido.', 'Become a giant robot for 12s: +40% damage, -55% damage taken and 40% faster attacks.') },
      { id: 'nuke', req: 15, name: L('Ataque Nuclear', 'Nuclear Strike'), icon: 'nuke', cost: 70, cd: 35, desc: (r) => L(`Marca uma área; 2s depois, uma explosão nuclear causa ${pct(9 * rankMult(r))} num raio de 6m.`, `Marks an area; 2s later, a nuclear blast deals ${pct(9 * rankMult(r))} within 6m.`) },
    ],
  },
};

export const CLASS_ORDER = ['blade', 'gunner', 'netrunner', 'brawler', 'pyro', 'frost', 'heavy'];

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

// ---------------- Classes novas ----------------
Object.assign(SKILL_FN, {
  // Punho de Aço
  punch(p, r) {
    const C = CLASSES.brawler;
    p.combo = (p.combo + 1) % 4;
    const big = p.combo === 3;
    const range = big ? 2.2 : 1.75;
    const arc = big ? Math.PI * 0.9 : Math.PI * 0.6;
    for (const e of enemiesInCone(p.x, p.z, p.aim.dx, p.aim.dz, range, arc)) hitEnemy(e, (big ? 2.2 : 0.9) * rankMult(r), { knock: big ? 7 : 1.2, stun: big ? 0.5 : 0, energy: 3 });
    burst(p.x + p.aim.dx * 1.1, 0.9, p.z + p.aim.dz * 1.1, C.accent, big ? 14 : 5, big ? 5 : 3, 0.06, 0.25);
    if (big) {
      ringFx(p.x + p.aim.dx * 1.2, p.z + p.aim.dz * 1.2, 1.3, C.accent, 0.25);
      G.shake = Math.max(G.shake, 0.15);
      sfx.punchHeavy();
    } else sfx.punch();
    p.swing = 1;
    p.hand = 1 - p.hand;
    return true;
  },
  rocketFist(p, r) {
    const C = CLASSES.brawler;
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 18, life: 0.55, mult: 1.6 * rankMult(r), color: C.accent, size: 0.24, r: 0.45, pierce: 99, knock: 7 });
    sfx.dash();
    p.swing = 1;
    return true;
  },
  titan(p, r) {
    p.buffs.titan = 4 + 0.4 * r;
    ringFx(p.x, p.z, 1.6, 0xc8d0e0, 0.4);
    burst(p.x, 1, p.z, 0xc8d0e0, 20, 4, 0.07, 0.5);
    sfx.shieldBlock();
    return true;
  },
  quake(p, r) {
    const C = CLASSES.brawler;
    for (const e of enemiesInRadius(p.x, p.z, 4)) hitEnemy(e, 2.6 * rankMult(r), { stun: 1.2, knock: 5 });
    ringFx(p.x, p.z, 4, C.accent, 0.4, { from: 0.5 });
    burst(p.x, 0.3, p.z, C.accent, 40, 8, 0.09, 0.6, { up: 0.5 });
    const x = p.x;
    const z = p.z;
    after(0.35, () => {
      for (const e of enemiesInRadius(x, z, 6.5)) hitEnemy(e, 1.0 * rankMult(r), { knock: 3, noProc: true, kx: x, kz: z });
      ringFx(x, z, 6.5, 0xffd23d, 0.45, { from: 3 });
    });
    G.shake = Math.max(G.shake, 0.5);
    sfx.explode();
    return true;
  },

  // Incendiária
  flame(p, r) {
    for (const e of enemiesInCone(p.x, p.z, p.aim.dx, p.aim.dz, 4.6, Math.PI * 0.42)) {
      if (lineOfSight(G.dungeon, p.x, p.z, e.x, e.z)) hitEnemy(e, 0.24 * rankMult(r), { burn: 0.35, knock: 0.15, quiet: true, noProc: Math.random() > 0.25 });
    }
    const a0 = Math.atan2(p.aim.dz, p.aim.dx);
    for (let k = 0; k < 4; k++) {
      const a = a0 + rr(-0.3, 0.3);
      const sp = rr(7, 11);
      particle(p.x + p.aim.dx * 0.6, 0.9, p.z + p.aim.dz * 0.6, Math.cos(a) * sp, rr(-0.3, 0.8), Math.sin(a) * sp, pick([0xff6a00, 0xffaa00, 0xff3300]), rr(0.08, 0.16), rr(0.32, 0.46), -2, 1.2);
    }
    sfx.flame();
    p.swing = 1;
    return true;
  },
  napalm(p, r) {
    const t = targetPoint(p, 8);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.55, color: 0xff6a00, onLand: (x, z) => {
      explosion(x, z, 2.4, 1.2 * rankMult(r), { color: 0xff6a00, burn: 0.4, small: true });
      spawnHazard(x, z, 2.2, 5, 0, { faction: 'player', mult: 0.3 * rankMult(r), burn: 0.4, color: 0xff5500, opacity: 0.4 });
    } });
    p.swing = 1;
    return true;
  },
  jet(p, r) {
    const d = G.dungeon;
    const t = targetPoint(p, 7);
    let tx = t.x;
    let tz = t.z;
    for (let k = 0; k <= 20 && !isWalkable(d, tx, tz); k++) {
      tx = p.x + (t.x - p.x) * (1 - k / 20);
      tz = p.z + (t.z - p.z) * (1 - k / 20);
    }
    p.leap = { sx: p.x, sz: p.z, tx, tz, t: 0, dur: 0.45, mult: 1.5 * rankMult(r), color: 0xff4422 };
    p.invuln = Math.max(p.invuln, 0.55);
    burst(p.x, 0.3, p.z, 0xff6a00, 20, 4, 0.08, 0.4);
    sfx.dash();
    return true;
  },
  supernova(p, r) {
    explosion(p.x, p.z, 5, 3.0 * rankMult(r), { color: 0xff4422, burn: 0.6, knock: 6 });
    ringFx(p.x, p.z, 6, 0xffaa00, 0.6, { from: 1 });
    G.shake = Math.max(G.shake, 0.5);
    return true;
  },

  // Geada
  cryo(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 34, life: 0.5, mult: 1.5 * rankMult(r), color: 0x8ab4ff, size: 0.12, r: 0.24, pierce: 2, slow: 1.6, homing: 3 });
    burst(p.x + p.aim.dx * 0.6, 1, p.z + p.aim.dz * 0.6, 0xddeeff, 4, 2, 0.05, 0.2, { grav: 0 });
    sfx.cryo();
    p.swing = 1;
    return true;
  },
  iceBomb(p, r) {
    const t = targetPoint(p, 9);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.5, color: 0x8ab4ff, onLand: (x, z) => {
      explosion(x, z, 3, 1.4 * rankMult(r), { color: 0x8ab4ff, freeze: 2 });
      burst(x, 0.5, z, 0xffffff, 20, 5, 0.06, 0.6);
      sfx.cryo();
    } });
    p.swing = 1;
    return true;
  },
  decoy(p, r) {
    spawnDecoy(p.x, p.z, 6, (x, z) => explosion(x, z, 3, 1.5 * rankMult(r), { color: 0x8ab4ff, freeze: 1.5 }));
    sfx.zap();
    return true;
  },
  rail(p, r) {
    const d = G.dungeon;
    let len = 0;
    while (len < 18 && isWalkable(d, p.x + p.aim.dx * len, p.z + p.aim.dz * len)) len += 0.25;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const rx = e.x - p.x;
      const rz = e.z - p.z;
      const along = rx * p.aim.dx + rz * p.aim.dz;
      const across = Math.abs(-rx * p.aim.dz + rz * p.aim.dx);
      if (along > 0 && along < len + e.r && across < 0.6 + e.r) hitEnemy(e, 5 * rankMult(r), { knock: 4, slow: 2 });
    }
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfd8ff).multiplyScalar(gk(2.4)), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, len).translate(0, 0, len / 2), mat);
    beam.position.set(p.x, 1, p.z);
    beam.lookAt(p.x + p.aim.dx, 1, p.z + p.aim.dz);
    tempMesh(beam, 0.35, (e, k) => {
      mat.opacity = 1 - k;
      beam.scale.set(1 - k * 0.8, 1 - k * 0.8, 1);
    }).disposeGeo = true;
    for (let k = 0; k < len; k += 0.8) burst(p.x + p.aim.dx * k, 1, p.z + p.aim.dz * k, 0x8ab4ff, 1, 1.5, 0.06, 0.4);
    G.shake = Math.max(G.shake, 0.25);
    sfx.laser();
    p.swing = 1;
    return true;
  },

  // Colosso
  minigun(p, r) {
    const spread = 0.04 + p.spin * 0.08;
    const a = Math.atan2(p.aim.dz, p.aim.dx) + rr(-spread, spread);
    const side = (p.hand = 1 - p.hand) ? 0.15 : -0.15;
    const sx = p.x + Math.cos(a) * 0.6 - Math.sin(a) * side;
    const sz = p.z + Math.sin(a) * 0.6 + Math.cos(a) * side;
    spawnProjectile({ from: 'player', x: sx, z: sz, dx: Math.cos(a), dz: Math.sin(a), speed: 25, life: 0.45, mult: 0.42 * rankMult(r), color: 0xffd23d, size: 0.07, r: 0.2, quiet: true });
    sfx.shoot();
    p.swing = 1;
    return true;
  },
  rocket(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.6, z: p.z + p.aim.dz * 0.6, y: 1.2, dx: p.aim.dx, dz: p.aim.dz, speed: 16, life: 0.9, mult: 0.5 * rankMult(r), color: 0xff8800, size: 0.18, r: 0.3, homing: 1.5, blast: { r: 2.5, mult: 2.4 * rankMult(r) } });
    sfx.enemyShot();
    p.swing = 1;
    return true;
  },
  barrier(p, r) {
    const cx = p.x + p.aim.dx * 1.6;
    const cz = p.z + p.aim.dz * 1.6;
    spawnBarrier(cx, cz, -p.aim.dz, p.aim.dx, 1.7 + 0.08 * r, 7 + 0.3 * r);
    sfx.deploy();
    return true;
  },
  missileRain(p, r) {
    const t = targetPoint(p, 10);
    ringFx(t.x, t.z, 3.5, 0xff8800, 0.8);
    for (let k = 0; k < 10; k++) {
      after(k * 0.1, () => {
        const pl = G.player;
        lob({ x: pl.x, z: pl.z, tx: t.x + rr(-3, 3), tz: t.z + rr(-3, 3), time: 0.7, color: 0xff8800, onLand: (x, z) => explosion(x, z, 1.7, 1.2 * rankMult(r), { color: 0xff8800, small: true, noProc: true }) });
        sfx.enemyShot();
      });
    }
    return true;
  },
});

// ---------------- Poderes da árvore de habilidades ----------------
const C_ = (id) => CLASSES[id].accent;
Object.assign(SKILL_FN, {
  // Lâmina
  bladeOrbit: (p, r) => (PW.orbitBlades(4, 0.7 * rankMult(r), C_('blade'), 8), true),
  oni: (p, r) => (PW.spawnAlly('oni', p.x + p.aim.dx, p.z + p.aim.dz, { dur: 15, mult: 1.6 * rankMult(r) }), sfx.boss(), true),
  thunderCut: (p, r) => PW.chainLightningFrom(p, 6, 1.4 * rankMult(r), 0x88ccff),
  timeWarp: (p) => (PW.timeWarp(p.x, p.z, 6, 5, 0xff2bd6), true),
  omnislash: (p, r) => PW.omnislash(p, 8, 2.2 * rankMult(r), C_('blade')),
  // Atiradora
  swarm: (p, r) => (PW.swarm(p, 10, 0.8 * rankMult(r), C_('gunner')), true),
  pshield: (p) => (PW.plasmaShield(p, 6, 0.3, C_('gunner')), true),
  orbLaser: (p, r) => {
    const t = PW.aimPoint(p, 10);
    PW.orbitalLaser(t.x, t.z, 5, 0.5 * rankMult(r), C_('gunner'));
    return true;
  },
  holoClone: (p, r) => {
    for (const s of [-1, 1]) PW.spawnAlly('clone', p.x - p.aim.dz * s * 1.2, p.z + p.aim.dx * s * 1.2, { dur: 12, mult: 0.6 * rankMult(r) });
    sfx.zap();
    return true;
  },
  bulletRing: (p, r) => (PW.bulletRing(p, 5, 18, 0.6 * rankMult(r), C_('gunner')), true),
  // Netrunner
  storm: (p, r) => (PW.lightningStorm(6, 3, 1.2 * rankMult(r), 0x88ccff), true),
  blackHole: (p, r) => {
    const t = PW.aimPoint(p, 9);
    PW.blackHole(t.x, t.z, 3.5, 3 * rankMult(r), 0x9d4dff);
    return true;
  },
  daemon: (p, r) => (PW.spawnAlly('daemon', p.x + p.aim.dx, p.z + p.aim.dz, { dur: 18, mult: 1.2 * rankMult(r) }), sfx.boss(), true),
  netWarp: (p) => (PW.timeWarp(p.x, p.z, 6.5, 5, 0x39ff14), true),
  mindHack: (p) => PW.mindHack(p, 3, 12),
  // Punho de Aço
  thunderClap: (p, r) => {
    for (const e of enemiesInRadius(p.x, p.z, 3.5)) hitEnemy(e, 1.6 * rankMult(r), { stun: 1, knock: 4 });
    ringFx(p.x, p.z, 3.5, 0x88ccff, 0.35, { from: 0.4 });
    PW.chainLightningFrom(p, 4, 0.8 * rankMult(r), 0x88ccff, 8);
    G.shake = Math.max(G.shake, 0.3);
    sfx.punchHeavy();
    return true;
  },
  pshieldB: (p) => (PW.plasmaShield(p, 6, 0.4, C_('brawler')), true),
  meteorPunch: (p, r) => {
    const d = G.dungeon;
    const t = PW.aimPoint(p, 8);
    let tx = t.x;
    let tz = t.z;
    for (let k = 0; k <= 20 && !isWalkable(d, tx, tz); k++) {
      tx = p.x + (t.x - p.x) * (1 - k / 20);
      tz = p.z + (t.z - p.z) * (1 - k / 20);
    }
    p.leap = { sx: p.x, sz: p.z, tx, tz, t: 0, dur: 0.55, mult: 3.2 * rankMult(r), color: 0xff6a00, radius: 3.2 };
    p.invuln = Math.max(p.invuln, 0.65);
    sfx.dash();
    return true;
  },
  golem: (p, r) => (PW.spawnAlly('golem', p.x + p.aim.dx * 1.5, p.z + p.aim.dz * 1.5, { dur: 18, mult: 2.4 * rankMult(r) }), sfx.punchHeavy(), true),
  demonForm: (p) => (PW.transform(p, 'demon', 12), true),
  // Incendiária
  fireRing: (p, r) => (PW.orbitBlades(6, 0.6 * rankMult(r), 0xff6a00, 8, { burn: 0.4, radius: 2.4 }), true),
  firePillars: (p, r) => (PW.pillars(p, 8, 1.3 * rankMult(r), 0xff6a00, { burn: 0.4 }), true),
  ifrit: (p, r) => (PW.spawnAlly('ifrit', p.x + p.aim.dx, p.z + p.aim.dz, { dur: 18, mult: 1.2 * rankMult(r) }), sfx.boss(), true),
  meteors: (p, r) => {
    const t = PW.aimPoint(p, 10);
    PW.meteorShower(t.x, t.z, 12, 1.6 * rankMult(r), 0xff6a00, { burn: 0.5 });
    return true;
  },
  phoenix: (p, r) => {
    p.dash = { dx: p.aim.dx, dz: p.aim.dz, speed: 26, t: 0.4, hit: new Set(), mult: 2.5 * rankMult(r), radius: 1.4, color: 0xff6a00, burn: 0.6 };
    p.invuln = Math.max(p.invuln, 0.5);
    healPlayer(p.stats.maxHp * 0.2);
    const sx = p.x;
    const sz = p.z;
    for (let k = 1; k <= 8; k++) {
      const x = sx + p.aim.dx * k * 1.3;
      const z = sz + p.aim.dz * k * 1.3;
      if (!isWalkable(G.dungeon, x, z)) break;
      after(k * 0.05, () => spawnHazard(x, z, 1.1, 4, 0, { faction: 'player', mult: 0.3 * rankMult(r), burn: 0.4, color: 0xff5500, opacity: 0.4 }));
    }
    sfx.boss();
    return true;
  },
  // Geada
  blizzard: (p, r) => {
    const t = PW.aimPoint(p, 10);
    spawnHazard(t.x, t.z, 3.5, 6, 0, { faction: 'player', mult: 0.35 * rankMult(r), slow: 1.5, color: 0x8ab4ff, opacity: 0.35 });
    PW.meteorShower(t.x, t.z, 14, 0.25 * rankMult(r), 0xddeeff, { gap: 0.35, freeze: 0.4 });
    sfx.cryo();
    return true;
  },
  iceArmor: (p) => (PW.plasmaShield(p, 6, 0.35, C_('frost'), { freeze: true }), true),
  wolves: (p, r) => {
    for (let k = 0; k < 3; k++) PW.spawnAlly('wolf', p.x + Math.cos(k * 2.1) * 1.2, p.z + Math.sin(k * 2.1) * 1.2, { dur: 15, mult: 0.9 * rankMult(r) });
    sfx.cryo();
    return true;
  },
  frozenTime: (p) => (PW.timeWarp(p.x, p.z, 7, 5, 0x8ab4ff), true),
  glacier: (p, r) => (PW.pillars(p, 10, 2.2 * rankMult(r), 0x8ab4ff, { freeze: 1.2 }), true),
  // Colosso
  tesla: (p, r) => {
    let t = PW.aimPoint(p, 7);
    if (!isWalkable(G.dungeon, t.x, t.z)) t = { x: p.x + p.aim.dx, z: p.z + p.aim.dz };
    PW.spawnAlly('tesla', t.x, t.z, { dur: 14, mult: 0.7 * rankMult(r) });
    sfx.deploy();
    return true;
  },
  swarmH: (p, r) => (PW.swarm(p, 12, 0.7 * rankMult(r), C_('heavy')), true),
  orbLaserH: (p, r) => {
    const t = PW.aimPoint(p, 10);
    PW.orbitalLaser(t.x, t.z, 5, 0.55 * rankMult(r), C_('heavy'));
    return true;
  },
  mech: (p) => (PW.transform(p, 'mech', 12), true),
  nuke: (p, r) => {
    const t = PW.aimPoint(p, 10);
    PW.nuke(t.x, t.z, 9 * rankMult(r));
    return true;
  },
});

// Usado pelas torres e para escolher alvos automáticos
export function autoTarget(p, range = 11) {
  return nearestEnemy(p.x, p.z, range, true);
}

export { clamp };
