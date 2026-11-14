// As três classes jogáveis e suas habilidades.
import { G } from './state.js';
import { hitEnemy, enemiesInRadius, enemiesInCone, spawnProjectile, lob, explosion, nearestEnemy, spawnTurret, chainFrom, spawnHazard, spawnBarrier, spawnDecoy, after, healPlayer } from './combat.js';
import { slashFx, ringFx, burst, ghostFx, particle, tempMesh, beamFx, telegraphFx } from './fx.js';
import * as THREE from 'three';
import { gk } from './state.js';
import { sfx } from './audio.js';
import { isWalkable, lineOfSight } from './dungeon.js';
import { clamp, rr, pick } from './utils.js';
import { L } from './i18n.js';
import * as PW from './powers.js';
import { merged } from './models.js';
import { shrineBlink } from './loot.js';

export const rankMult = (r) => 1 + 0.15 * (r - 1);
// nível máximo de cada poder
export const MAX_RANK = 30;
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
  // Caçadora
  bow: '<path d="M9 4c10 4 10 20 0 24"/><path d="M9 4v24" opacity=".5"/><path d="M6 16h22M24 12l4 4-4 4"/>',
  multishot: '<path d="M4 16h20M4 16l18-9M4 16l18 9"/><path d="M20 13l4 3-4 3M19 5l4 2-2 4M19 27l4-2-2-4"/>',
  trap: '<path d="M4 24h24"/><path d="M7 24l3-10 6 6 6-6 3 10"/><circle cx="16" cy="9" r="3"/>',
  arrowRain: '<path d="M8 3v14M16 3v18M24 3v14"/><path d="M5 14l3 4 3-4M13 18l3 4 3-4M21 14l3 4 3-4"/><path d="M4 28h24"/>',
  hawk: '<path d="M3 12c5 0 9 2 13 6 4-4 8-6 13-6-3 3-6 8-13 12C9 20 6 15 3 12z"/><path d="M16 18v-6l-2-3h4l-2 3"/>',
  vault: '<path d="M22 26c-8 0-12-6-10-13"/><path d="M8 16l4-4 4 4"/><path d="M14 6h14M24 3l4 3-4 3"/>',
  pierceArrow: '<path d="M2 16h26M22 10l6 6-6 6"/><circle cx="10" cy="16" r="3"/><circle cx="18" cy="16" r="3"/>',
  predator: '<path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z"/><path d="M16 10v12"/><path d="M4 6l5 4M28 6l-5 4"/>',
  arrowStorm: '<circle cx="16" cy="16" r="3"/><path d="M16 2v8M16 22v8M2 16h8M22 16h8M6 6l5 5M21 21l5 5M26 6l-5 5M11 21l-5 5"/>',
  // Valquíria
  spear: '<path d="M5 27L23 9"/><path d="M23 9l2-6 4 4-6 2z"/><path d="M8 20l4 4"/>',
  charge: '<path d="M3 16h17"/><path d="M20 12l9 4-9 4z"/><path d="M5 10h8M5 22h8" opacity=".6"/>',
  javelin: '<path d="M3 24L25 8"/><path d="M25 8l4-1-1 4z"/><path d="M14 8l3 5-4 1 3 5" opacity=".7"/>',
  thunderfall: '<path d="M18 2L11 14h6l-3 9"/><path d="M6 27c3-3 17-3 20 0"/><path d="M4 24l3 1M28 24l-3 1"/>',
  spearOrbit: '<circle cx="16" cy="16" r="11" stroke-dasharray="3 3"/><path d="M16 5l2 4h-4zM27 16l-4 2v-4zM16 27l-2-4h4zM5 16l4-2v4z"/>',
  valk: '<path d="M16 10a3 3 0 1 0 0-.1"/><path d="M16 14v9M12 28l4-5 4 5"/><path d="M15 15C10 10 6 10 3 12c3 1 6 3 9 6M17 15c5-5 9-5 12-3-3 1-6 3-9 6"/>',
  zeus: '<path d="M6 3l-2 7h3l-2 6M16 3l-2 7h3l-2 6M26 3l-2 7h3l-2 6"/><path d="M3 26h26M7 22v4M16 22v4M25 22v4"/>',
  // Biohacker
  dart: '<path d="M4 28l12-12"/><path d="M16 16l9-9 3 1-1 3-9 9z"/><path d="M6 20l2 2M10 24l-2-2"/>',
  cloud: '<path d="M9 22a5 5 0 0 1 0-10 7 7 0 0 1 13-2 5 5 0 0 1 1 12z"/><circle cx="12" cy="27" r="1.5"/><circle cx="19" cy="27" r="1.5"/>',
  nanoHeal: '<path d="M16 4l10 6v12l-10 6-10-6V10z"/><path d="M16 11v10M11 16h10"/>',
  plague: '<circle cx="16" cy="16" r="5"/><path d="M16 3v6M16 23v6M3 16h6M23 16h6M7 7l4 4M21 21l4 4M25 7l-4 4M11 21l-4 4"/><circle cx="16" cy="3" r="1.5"/><circle cx="29" cy="16" r="1.5"/>',
  mutant: '<path d="M9 9a7 7 0 0 1 14 0v5H9z"/><path d="M6 14h20l-3 12H9z"/><circle cx="13" cy="10" r="1.5"/><circle cx="19" cy="10" r="1.5"/><path d="M13 20h6"/>',
  quarantine: '<circle cx="16" cy="16" r="12" stroke-dasharray="4 3"/><path d="M16 9l7 12H9z"/><path d="M16 14v3M16 19v.5"/>',
  pandemic: '<circle cx="16" cy="16" r="4"/><circle cx="16" cy="16" r="9" opacity=".6"/><circle cx="16" cy="16" r="13" opacity=".3"/><path d="M16 1v6M16 25v6M1 16h6M25 16h6"/>',
  // ícones dos poderes passivos
  pHeart: '<path d="M16 27C8 21 4 17 4 12a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 5-4 9-12 15z"/><path d="M9 15h4l2-3 3 6 2-3h3"/>',
  pTarget: '<circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="3"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/>',
  pWind: '<path d="M3 11h16a4 4 0 1 0-4-4M3 17h22a4 4 0 1 1-4 4M3 23h10"/>',
  pDrop: '<path d="M16 3c5 7 9 12 9 17a9 9 0 0 1-18 0c0-5 4-10 9-17z"/><path d="M12 20a4 4 0 0 0 4 4"/>',
  pBattery: '<rect x="5" y="9" width="20" height="14" rx="2"/><path d="M25 13h3v6h-3M14 11l-3 6h5l-3 5"/>',
  pSkull: '<path d="M6 15a10 10 0 0 1 20 0c0 4-2 6-4 7v4H10v-4c-2-1-4-3-4-7z"/><circle cx="12" cy="15" r="2"/><circle cx="20" cy="15" r="2"/><path d="M14 26v-3M18 26v-3"/>',
  pGear: '<circle cx="16" cy="16" r="5"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5L25 25M7 25l3.5-3.5M21.5 10.5L25 7"/>',
  pPlate: '<path d="M6 5h20v9c0 7-4 11-10 14C10 25 6 21 6 14z"/><path d="M6 11h20M6 17h19M16 5v23" opacity=".6"/>',
  pCrown: '<path d="M4 24l2-14 6 6 4-9 4 9 6-6 2 14z"/><path d="M5 28h22"/>',
  pRage: '<path d="M3 17h6l3-7 4 14 4-11 2 4h7"/>',
  pChip: '<rect x="9" y="9" width="14" height="14" rx="2"/><path d="M13 4v5M19 4v5M13 23v5M19 23v5M4 13h5M4 19h5M23 13h5M23 19h5"/><circle cx="16" cy="16" r="3"/>',
  pEye: '<path d="M2 16s5-9 14-9 14 9 14 9-5 9-14 9S2 16 2 16z"/><circle cx="16" cy="16" r="4"/>',
  pSword: '<path d="M27 4L12 19M27 4l-1 6M27 4l-6 1"/><path d="M8 15l9 9M10 21l-5 5"/>',
  pFist: '<path d="M9 14V9a2 2 0 0 1 4 0v4M13 13V8a2 2 0 0 1 4 0v5M17 13V9a2 2 0 0 1 4 0v5M21 14v-3a2 2 0 0 1 4 0v7c0 6-4 10-9 10s-9-3-9-8v-4a2 2 0 0 1 4 0"/>',
  pFlame: '<path d="M16 3c5 6 9 10 9 16a9 9 0 0 1-18 0c0-4 2-7 4-9 0 3 1 5 3 6 0-5 0-9 2-13z"/><path d="M16 21c1.5 1 3 2.5 3 4a3 3 0 0 1-6 0c0-1.5 1.5-3 3-4z" opacity=".6"/>',
  pSnow: '<path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M13 5l3 3 3-3M13 27l3-3 3 3M5 13l4-1-1-4M27 19l-4 1 1 4M5 19l4 1-1 4M27 13l-4-1 1-4" opacity=".6"/>',
  pNet: '<circle cx="16" cy="6" r="3"/><circle cx="6" cy="24" r="3"/><circle cx="26" cy="24" r="3"/><circle cx="16" cy="17" r="2"/><path d="M16 9v6M8 22l6.5-4M24 22l-6.5-4M9 24h14"/>',
  pStar: '<path d="M16 3l3.8 8.2 8.7.9-6.5 5.9 1.9 8.6L16 22.2 8.1 26.6 10 18 3.5 12.1l8.7-.9z"/>',
  // poderes avançados (níveis 40–70)
  crescent: '<path d="M5 27C8 13 18 5 28 5c-7 5-11 12-12 22z"/><path d="M4 20c2-5 5-9 9-12" opacity=".5"/>',
  mirror: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M11 11l10 10M21 11L11 21" opacity=".6"/>',
  dragon: '<path d="M3 27L29 5"/><path d="M8 27l5-4M14 22l5-4M20 17l5-4" opacity=".6"/><path d="M23 4l6 1-1 6"/>',
  lotus: '<path d="M16 27S4 20 4 11a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 9-12 16-12 16z"/><path d="M16 12v8M12 16h8"/>',
  ricochet: '<path d="M3 25l8-14 8 10 8-14"/><circle cx="28" cy="6" r="2"/>',
  smoke: '<circle cx="11" cy="19" r="6"/><circle cx="20" cy="13" r="7"/><circle cx="22" cy="23" r="5"/>',
  leadStorm: '<path d="M3 8h12M3 16h17M3 24h12"/><path d="M18 6l5 2-5 2M23 14l5 2-5 2M18 22l5 2-5 2"/>',
  reboot: '<path d="M26 16a10 10 0 1 1-3-7"/><path d="M24 3v6h-6"/><path d="M16 12v8M12 16h8"/>',
  lance: '<path d="M3 16h19"/><path d="M22 11l8 5-8 5z"/><path d="M3 10h8M3 22h8" opacity=".5"/>',
  firewall: '<rect x="4" y="6" width="24" height="20" rx="1"/><path d="M4 13h24M4 19h24M12 6v7M20 13v6M12 19v7"/>',
  bomb: '<circle cx="14" cy="19" r="9"/><path d="M20 12l4-4M25 3v3M29 7h-3M27 4l-2 2"/>',
  backup: '<rect x="6" y="5" width="20" height="22" rx="2"/><path d="M11 5v7h10V5M16 16v7M12 20l4 4 4-4"/>',
  upper: '<path d="M16 27V11M10 17l6-6 6 6"/><path d="M6 28h20"/><path d="M8 7l3 3M24 7l-3 3M16 2v5"/>',
  steel: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M11 15h10M11 19h10M11 11h10"/>',
  fury: '<path d="M4 9h11M6 16h13M4 23h11"/><circle cx="24" cy="16" r="5"/>',
  wind: '<path d="M4 11h15a4 4 0 1 0-4-4M4 17h21a4 4 0 1 1-4 4M4 23h9"/>',
  breath: '<path d="M4 16L28 5v22z"/><path d="M14 12v8M20 10v12" opacity=".6"/>',
  mantle: '<path d="M16 3c4 5 9 8 9 15a9 9 0 0 1-18 0c0-7 5-10 9-15z"/><path d="M16 14c2 3 4 4 4 7a4 4 0 0 1-8 0c0-3 2-4 4-7z"/>',
  sun: '<circle cx="16" cy="16" r="6"/><path d="M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3"/>',
  cauter: '<path d="M16 3c3 5 7 7 7 13a7 7 0 0 1-14 0c0-6 4-8 7-13z"/><path d="M16 13v8M12 17h8"/>',
  iceBlock: '<path d="M16 3l11 6v14l-11 6-11-6V9z"/><path d="M5 9l11 6 11-6M16 15v14"/>',
  aura: '<circle cx="16" cy="16" r="4"/><circle cx="16" cy="16" r="9" stroke-dasharray="3 3"/><circle cx="16" cy="16" r="13.5" stroke-dasharray="2 4" opacity=".5"/>',
  cannon: '<rect x="3" y="11" width="18" height="9" rx="2"/><path d="M21 9v13M25 15.5h5"/><circle cx="9" cy="24" r="3"/>',
  bunker: '<path d="M4 27V16a12 12 0 0 1 24 0v11z"/><path d="M9 19h14"/><path d="M2 27h28"/>',
  carpet: '<circle cx="7" cy="23" r="3"/><circle cx="16" cy="19" r="3"/><circle cx="25" cy="15" r="3"/><path d="M7 4v12M16 4v8M25 4v4"/>',
  repair: '<path d="M21 4a6 6 0 0 0-5 8L5 23l4 4 11-11a6 6 0 0 0 8-5l-4 2-3-3 2-4z"/>',
  volley: '<path d="M4 28L25 7M9 28L28 12M4 23L20 4"/><path d="M19 7h6v6"/>',
  camo: '<path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z"/><circle cx="16" cy="16" r="3"/><path d="M5 27L27 5"/>',
  boomArrow: '<path d="M4 28L19 13"/><path d="M13 11h8v8"/><circle cx="24" cy="8" r="5" opacity=".6"/>',
  herb: '<path d="M6 26C6 12 14 6 27 5c-1 13-7 21-21 21z"/><path d="M6 26L18 14"/>',
  skyLance: '<path d="M16 2v20"/><path d="M12 22h8l-4 8z"/><path d="M7 5l4 5M25 5l-4 5"/>',
  bulwark: '<rect x="8" y="3" width="16" height="26" rx="3"/><path d="M16 7v18M11 12h10"/>',
  ragnarok: '<path d="M10 3L5 14h5l-3 9M22 6l-5 11h5l-3 9"/><path d="M3 29h26"/>',
  wings: '<path d="M16 13c-4-6-10-7-13-6 1 6 5 10 13 12 8-2 12-6 13-12-3-1-9 0-13 6z"/><path d="M16 19v9M12 24h8"/>',
  acid: '<path d="M10 4c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path d="M22 12c3 4 5 7 5 9a5 5 0 0 1-10 0c0-2 2-5 5-9z"/>',
  cocoon: '<ellipse cx="16" cy="16" rx="8" ry="12"/><path d="M9 11c4 2 10 2 14 0M8 17c5 2 11 2 16 0M9 22c4 2 10 2 14 0"/>',
  bioBomb: '<circle cx="16" cy="16" r="3"/><path d="M16 13l-4-8a10 10 0 0 1 8 0zM13.4 17.5l-8.5 2a10 10 0 0 0 4 7zM18.6 17.5l8.5 2a10 10 0 0 1-4 7z"/>',
  hexSkin: '<path d="M16 3l11 6.5v13L16 29 5 22.5v-13z"/><path d="M16 10l5 3v6l-5 3-5-3v-6z"/>',
  // ataques supremos (níveis 76–100)
  petals: '<path d="M16 16c-2-6 0-11 4-13 2 5 0 10-4 13zM16 16c6-2 11 0 13 4-5 2-10 0-13-4zM16 16c2 6 0 11-4 13-2-5 0-10 4-13zM16 16c-6 2-11 0-13-4 5-2 10 0 13 4z"/>',
  iai: '<path d="M3 22L29 10"/><path d="M5 27h14" opacity=".6"/><path d="M19 27l4-4" opacity=".6"/><path d="M8 6l3 3M14 4v4" opacity=".5"/>',
  shades: '<circle cx="16" cy="8" r="3.5"/><path d="M10 28l2-12h8l2 12"/><circle cx="6" cy="12" r="2.5" opacity=".5"/><path d="M2 28l2-9h4" opacity=".5"/><circle cx="26" cy="12" r="2.5" opacity=".5"/><path d="M30 28l-2-9h-4" opacity=".5"/>',
  rift: '<path d="M5 5l22 22M27 5L5 27"/><circle cx="16" cy="16" r="4" opacity=".6"/>',
  rail: '<path d="M2 16h28"/><path d="M6 11h3M12 11h3M18 11h3M24 11h3M6 21h3M12 21h3M18 21h3M24 21h3" opacity=".6"/><circle cx="4" cy="16" r="2"/>',
  cluster: '<circle cx="16" cy="16" r="5"/><circle cx="6" cy="7" r="2"/><circle cx="26" cy="7" r="2"/><circle cx="6" cy="25" r="2"/><circle cx="26" cy="25" r="2"/><path d="M12 12L8 9M20 12l4-3M12 20l-4 3M20 20l4 3" opacity=".6"/>',
  dance: '<circle cx="16" cy="16" r="3"/><path d="M16 4a12 12 0 0 1 12 12M16 28A12 12 0 0 1 4 16"/><path d="M28 16l-3-3M28 16l3-3M4 16l-3 3M4 16l3 3"/>',
  virus: '<circle cx="16" cy="16" r="6"/><path d="M16 4v6M16 22v6M4 16h6M22 16h6M7.5 7.5l4.2 4.2M20.3 20.3l4.2 4.2M24.5 7.5l-4.2 4.2M11.7 20.3l-4.2 4.2"/>',
  fwall: '<path d="M3 26h26M3 20h26M3 14h26M8 14v6M16 20v6M24 14v6M16 26v0"/><path d="M10 14c0-4 3-5 3-9 3 2 3 5 3 6 1-2 2-3 2-5 3 3 4 5 4 8" opacity=".6"/>',
  drones: '<rect x="12" y="11" width="8" height="5" rx="1"/><path d="M8 9h6M18 9h6"/><rect x="3" y="22" width="6" height="4" rx="1"/><path d="M1 20h4M7 20h4"/><rect x="23" y="22" width="6" height="4" rx="1"/><path d="M21 20h4M27 20h4"/>',
  blackout: '<path d="M10 7a11 11 0 1 0 12 0"/><path d="M16 3v11"/><path d="M4 4l24 24" opacity=".6"/>',
  tectonic: '<path d="M2 27h28"/><path d="M16 27l-2-6 3-4-2-5 2-7M16 27l-7-5-2-7M16 27l7-4 3-8"/>',
  hook: '<path d="M3 16h15"/><path d="M18 10v12M18 10c6 0 9 3 9 6s-3 6-9 6"/><path d="M3 12v8" opacity=".6"/>',
  hundred: '<circle cx="10" cy="10" r="4"/><circle cx="22" cy="12" r="4"/><circle cx="14" cy="22" r="4"/><path d="M2 5l4 2M2 15l4-1M25 25l3 3M27 19h4" opacity=".6"/>',
  heaven: '<path d="M10 2v8h12V2"/><path d="M9 10h14v7a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z"/><path d="M13 10v4M17 10v4"/><path d="M3 28h26M8 24l-3-2M24 24l3-2" opacity=".6"/>',
  flameWall: '<path d="M3 28h26"/><path d="M6 28c-2-5 1-7 1-11 2 2 3 4 3 6 1-3 0-6 2-9 3 4 4 8 3 14M17 28c-1-5 2-8 3-13 2 3 3 5 3 8 1-1 2-3 2-5 2 3 2 7 0 10"/>',
  wyrm: '<path d="M4 24c4 0 5-8 9-8s5 8 9 8 4-6 4-6"/><path d="M26 18l3-4-5 1"/><circle cx="25" cy="14" r="1"/><path d="M7 21l-2-3M13 16l-1-3M19 20l1-3" opacity=".6"/>',
  tornado: '<path d="M4 6h24M7 11h18M10 16h12M12 21h7M14 26h3"/><path d="M28 6c-2 2-3 3-3 5M22 16c0 2-2 3-3 5" opacity=".6"/>',
  solar: '<circle cx="16" cy="16" r="6"/><path d="M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3.5 3.5M22.5 22.5L26 26M26 6l-3.5 3.5M9.5 22.5L6 26"/>',
  crystals: '<path d="M8 4l3 8-3 4-3-4zM24 6l3 8-3 4-3-4zM16 14l4 8-4 6-4-6z"/><path d="M8 16v6M24 18v4" opacity=".6"/>',
  prison: '<rect x="6" y="6" width="20" height="22" rx="1"/><path d="M11 6v22M16 6v22M21 6v22"/><path d="M4 6h24" opacity=".6"/>',
  avalanche: '<path d="M2 28l9-14 5 6 4-9 10 17z"/><circle cx="8" cy="8" r="2" opacity=".6"/><circle cx="15" cy="5" r="1.5" opacity=".6"/><circle cx="22" cy="6" r="2" opacity=".6"/>',
  iceAge: '<path d="M16 2l3 8-3 6-3-6zM16 30l3-8-3-6-3 6zM2 16l8-3 6 3-6 3zM30 16l-8-3-6 3 6 3z"/><path d="M6 6l5 5M26 26l-5-5M26 6l-5 5M6 26l5-5" opacity=".6"/>',
  satellite: '<rect x="12" y="3" width="8" height="6" rx="1"/><path d="M4 6h8M20 6h8"/><path d="M16 9v4"/><path d="M13 13h6l3 15H10z" opacity=".6"/>',
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
  hunter: {
    id: 'hunter',
    name: L('Caçadora', 'Huntress'),
    title: L('Arqueira Neon', 'Neon Archer'),
    desc: L('Longa distância. Flechas de luz que atravessam inimigos, armadilhas e um falcão de caça.', 'Long range. Light arrows that pierce enemies, traps and a hunting hawk.'),
    css: '#ff6a9a',
    accent: 0xff6a9a,
    melee: false,
    range: 13,
    base: { hp: 145, en: 110, armor: 9, speed: 5.7, wMin: 17, wMax: 24, enRegen: 8, hpRegen: 1.5, crit: 12, critDmg: 70, atkRate: 1.9 },
    weaponNames: [L('Arco de Fibra', 'Fiber Bow'), L('Arco Composto Laser', 'Laser Compound Bow'), L('Arco de Fótons', 'Photon Bow'), L('Arco Estelar', 'Starbow')],
    skills: [
      { id: 'arrow', name: L('Flecha de Luz', 'Light Arrow'), icon: 'bow', cost: 0, cd: 0, desc: (r) => L(`Flecha rápida que atravessa 1 inimigo e causa ${pct(1.25 * rankMult(r))}.`, `A fast arrow that pierces 1 enemy and deals ${pct(1.25 * rankMult(r))}.`) },
      { id: 'multishot', name: L('Tiro Múltiplo', 'Multishot'), icon: 'multishot', cost: 25, cd: 5, desc: (r) => L(`Dispara 5 flechas em leque, cada uma causando ${pct(0.9 * rankMult(r))}.`, `Fires 5 arrows in a fan, each dealing ${pct(0.9 * rankMult(r))}.`) },
      { id: 'trap', req: 2, name: L('Rede Elétrica', 'Shock Net'), icon: 'trap', cost: 20, cd: 8, desc: (r) => L(`Lança uma rede que atordoa por 1,6s (${pct(1.0 * rankMult(r))}) e deixa a área lenta por 4s.`, `Throws a net that stuns for 1.6s (${pct(1.0 * rankMult(r))}) and slows the area for 4s.`) },
      { id: 'arrowRain', req: 4, name: L('Chuva de Flechas', 'Arrow Rain'), icon: 'arrowRain', cost: 40, cd: 12, desc: (r) => L(`16 flechas caem do céu na área do alvo, cada uma causando ${pct(0.9 * rankMult(r))}.`, `16 arrows fall from the sky on the target area, each dealing ${pct(0.9 * rankMult(r))}.`) },
      { id: 'hawk', req: 5, name: L('Falcão de Caça', 'Hunting Hawk'), icon: 'hawk', cost: 35, cd: 20, desc: (r) => L(`Chama um falcão biônico por 16s que dá rasantes nos inimigos (${pct(1.0 * rankMult(r))}).`, `Calls a bionic hawk for 16s that dives at enemies (${pct(1.0 * rankMult(r))}).`) },
      { id: 'vault', req: 7, name: L('Salto Mortal', 'Backflip'), icon: 'vault', cost: 20, cd: 6, desc: (r) => L(`Salta para trás, invulnerável, e dispara 3 flechas (${pct(1.2 * rankMult(r))} cada).`, `Flip backwards while invulnerable and fire 3 arrows (${pct(1.2 * rankMult(r))} each).`) },
      { id: 'phantomArrow', req: 9, name: L('Flecha Fantasma', 'Phantom Arrow'), icon: 'pierceArrow', cost: 40, cd: 9, desc: (r) => L(`Uma flecha enorme que atravessa tudo em linha reta causando ${pct(4.2 * rankMult(r))}.`, `A huge arrow that pierces everything in a straight line, dealing ${pct(4.2 * rankMult(r))}.`) },
      { id: 'predator', req: 12, name: L('Instinto Predador', 'Predator Instinct'), icon: 'predator', cost: 35, cd: 20, desc: () => L('Por 8s: +50% de velocidade de ataque, +30% de velocidade e 8% de roubo de vida.', 'For 8s: +50% attack speed, +30% movement speed and 8% life steal.') },
      { id: 'arrowStorm', req: 15, name: L('Furacão de Flechas', 'Arrow Hurricane'), icon: 'arrowStorm', cost: 60, cd: 20, desc: (r) => L(`6 ondas de 20 flechas saem em todas as direções, cada uma causando ${pct(0.8 * rankMult(r))}.`, `6 waves of 20 arrows fly in every direction, each dealing ${pct(0.8 * rankMult(r))}.`) },
    ],
  },
  lancer: {
    id: 'lancer',
    name: L('Valquíria', 'Valkyrie'),
    title: L('Lanceira Elétrica', 'Volt Lancer'),
    desc: L('Corpo a corpo de alcance longo. Lança elétrica, investidas e raios do céu.', 'Long-reach melee. An electric spear, charges and lightning from the sky.'),
    css: '#b36bff',
    accent: 0xb36bff,
    melee: true,
    range: 2.5,
    base: { hp: 195, en: 100, armor: 20, speed: 5.4, wMin: 15, wMax: 22, enRegen: 6, hpRegen: 2, crit: 7, critDmg: 55, atkRate: 2.0 },
    weaponNames: [L('Lança de Choque', 'Shock Spear'), L('Alabarda Voltaica', 'Voltaic Halberd'), L('Tridente de Plasma', 'Plasma Trident'), L('Lança do Trovão', 'Thunder Lance')],
    skills: [
      { id: 'thrust', name: L('Estocada', 'Thrust'), icon: 'spear', cost: 0, cd: 0, desc: (r) => L(`Estocada longa que causa ${pct(1.15 * rankMult(r))}. O 3º golpe solta um raio que pula em 2 inimigos.`, `A long thrust dealing ${pct(1.15 * rankMult(r))}. Every 3rd hit releases lightning that jumps to 2 enemies.`) },
      { id: 'spearCharge', name: L('Investida', 'Spear Charge'), icon: 'charge', cost: 20, cd: 5, desc: (r) => L(`Avança com a lança, atravessando os inimigos (${pct(1.7 * rankMult(r))}) e atordoando.`, `Charge forward with your spear, passing through enemies (${pct(1.7 * rankMult(r))}) and stunning them.`) },
      { id: 'javelin', req: 2, name: L('Dardo Voltaico', 'Volt Javelin'), icon: 'javelin', cost: 25, cd: 6, desc: (r) => L(`Arremessa uma lança que atravessa 3 inimigos (${pct(2.2 * rankMult(r))}) e solta raios em cadeia.`, `Throws a spear that pierces 3 enemies (${pct(2.2 * rankMult(r))}) and releases chain lightning.`) },
      { id: 'thunderfall', req: 4, name: L('Queda do Trovão', 'Thunderfall'), icon: 'thunderfall', cost: 35, cd: 9, desc: (r) => L(`Salta e cai como um raio no alvo, causando ${pct(2.8 * rankMult(r))} ao redor.`, `Leap up and strike the target like lightning, dealing ${pct(2.8 * rankMult(r))} around you.`) },
      { id: 'spearOrbit', req: 5, name: L('Lanças Giratórias', 'Spinning Spears'), icon: 'spearOrbit', cost: 30, cd: 12, desc: (r) => L(`3 lanças de energia giram ao seu redor por 8s (${pct(0.9 * rankMult(r))} por toque).`, `3 energy spears orbit you for 8s (${pct(0.9 * rankMult(r))} per touch).`) },
      { id: 'voltChain', req: 7, name: L('Cadeia Voltaica', 'Volt Chain'), icon: 'thunder', cost: 30, cd: 6, desc: (r) => L(`Um raio pula entre até 8 inimigos, causando ${pct(1.3 * rankMult(r))} em cada.`, `Lightning jumps between up to 8 enemies, dealing ${pct(1.3 * rankMult(r))} to each.`) },
      { id: 'valk', req: 9, name: L('Irmã de Armas', 'Shield Sister'), icon: 'valk', cost: 50, cd: 25, desc: (r) => L(`Invoca uma valquíria alada por 18s que luta ao seu lado (${pct(1.4 * rankMult(r))}).`, `Summons a winged valkyrie for 18s who fights at your side (${pct(1.4 * rankMult(r))}).`) },
      { id: 'skyStorm', req: 12, name: L('Fúria dos Céus', 'Wrath of the Skies'), icon: 'storm', cost: 50, cd: 16, desc: (r) => L(`Por 6s, raios caem sobre os inimigos próximos (${pct(1.3 * rankMult(r))} cada).`, `For 6s, lightning strikes nearby enemies (${pct(1.3 * rankMult(r))} each).`) },
      { id: 'zeus', req: 15, name: L('Lança de Zeus', 'Spear of Zeus'), icon: 'zeus', cost: 55, cd: 12, desc: (r) => L(`Uma fileira de 10 raios cai à sua frente (${pct(2.4 * rankMult(r))} cada) e atordoa.`, `A row of 10 lightning bolts strikes in front of you (${pct(2.4 * rankMult(r))} each) and stuns.`) },
    ],
  },
  biohacker: {
    id: 'biohacker',
    name: 'Biohacker',
    title: L('Química de Rua', 'Street Chemist'),
    desc: L('Média distância. Dardos tóxicos, nuvens venenosas, cura com nanorrobôs e um mutante de laboratório.', 'Mid range. Toxic darts, poison clouds, nanobot healing and a lab-grown mutant.'),
    css: '#c8ff3d',
    accent: 0xc8ff3d,
    melee: false,
    range: 9,
    base: { hp: 165, en: 120, armor: 12, speed: 5.4, wMin: 10, wMax: 14, enRegen: 9, hpRegen: 2.4, crit: 6, critDmg: 50, atkRate: 3 },
    weaponNames: [L('Pistola de Dardos', 'Dart Pistol'), L('Injetora Tóxica', 'Toxic Injector'), L('Lança-Toxinas', 'Toxin Launcher'), L('Bio-Canhão', 'Bio Cannon')],
    skills: [
      { id: 'dart', name: L('Dardo Tóxico', 'Toxic Dart'), icon: 'dart', cost: 0, cd: 0, desc: (r) => L(`Dardo teleguiado que causa ${pct(0.75 * rankMult(r))} e envenena (dano contínuo por 3s).`, `A homing dart that deals ${pct(0.75 * rankMult(r))} and poisons (damage over 3s).`) },
      { id: 'toxCloud', name: L('Nuvem Tóxica', 'Toxic Cloud'), icon: 'cloud', cost: 25, cd: 6, desc: (r) => L(`Arremessa um frasco que solta uma nuvem venenosa por 5s (${pct(0.3 * rankMult(r))} a cada 0,5s) e deixa lento.`, `Throws a vial that releases a poison cloud for 5s (${pct(0.3 * rankMult(r))} every 0.5s) that slows.`) },
      { id: 'nanoHeal', req: 2, name: L('Nanocura', 'Nano Heal'), icon: 'nanoHeal', cost: 30, cd: 14, desc: (r) => L(`Cura ${8 + r}% da vida na hora e mais 3% por segundo durante 6s.`, `Heals ${8 + r}% health instantly and 3% per second for 6s.`) },
      { id: 'plague', req: 4, name: L('Praga', 'Plague'), icon: 'plague', cost: 40, cd: 10, desc: (r) => L(`Uma bomba biológica explode no alvo (${pct(1.6 * rankMult(r))}), envenena forte e deixa lento.`, `A bio-bomb bursts on the target (${pct(1.6 * rankMult(r))}), badly poisoning and slowing.`) },
      { id: 'nanoSwarm', req: 5, name: L('Nanoenxame', 'Nanoswarm'), icon: 'swarm', cost: 30, cd: 9, desc: (r) => L(`Solta 10 nuvens de nanorrobôs teleguiados, cada uma causando ${pct(0.75 * rankMult(r))} e envenenando.`, `Releases 10 homing nanobot clouds, each dealing ${pct(0.75 * rankMult(r))} and poisoning.`) },
      { id: 'adrenal', req: 7, name: L('Injeção de Adrenalina', 'Adrenaline Shot'), icon: 'stim', cost: 25, cd: 18, desc: () => L('Por 8s: +30% de velocidade de ataque e +35% de velocidade de movimento.', 'For 8s: +30% attack speed and +35% movement speed.') },
      { id: 'mutant', req: 9, name: L('Mutante de Laboratório', 'Lab Mutant'), icon: 'mutant', cost: 50, cd: 25, desc: (r) => L(`Solta um mutante gigante por 18s que esmaga os inimigos em área (${pct(2.0 * rankMult(r))}).`, `Releases a giant mutant for 18s that smashes enemies in an area (${pct(2.0 * rankMult(r))}).`) },
      { id: 'quarantine', req: 12, name: L('Zona de Quarentena', 'Quarantine Zone'), icon: 'quarantine', cost: 45, cd: 16, desc: (r) => L(`Cria uma zona tóxica enorme ao seu redor por 7s (${pct(0.5 * rankMult(r))} a cada 0,5s) que deixa muito lento.`, `Creates a huge toxic zone around you for 7s (${pct(0.5 * rankMult(r))} every 0.5s) that greatly slows.`) },
      { id: 'pandemic', req: 15, name: L('Pandemia', 'Pandemic'), icon: 'pandemic', cost: 60, cd: 22, desc: (r) => L(`Infecta todos os inimigos à vista num raio de 12m (${pct(2.2 * rankMult(r))}), com veneno forte e lentidão.`, `Infects every visible enemy within 12m (${pct(2.2 * rankMult(r))}) with strong poison and slow.`) },
    ],
  },
};

// --------------------------------------------------------------
// Poderes passivos: 3 por classe (índices 9, 10 e 11 da árvore).
// Não vão para os botões; dão bônus permanentes que crescem com o nível (1–10).
// --------------------------------------------------------------
const nfmt = (v) => (+v).toLocaleString(L('pt-BR', 'en-US'), { maximumFractionDigits: 1 });
const PFMT = {
  crit: (v) => L(`+${nfmt(v)}% de chance de crítico`, `+${nfmt(v)}% critical chance`),
  critDmg: (v) => L(`+${nfmt(v)}% de dano crítico`, `+${nfmt(v)}% critical damage`),
  dmgPct: (v) => L(`+${nfmt(v)}% de dano`, `+${nfmt(v)}% damage`),
  atkSpd: (v) => L(`+${nfmt(v)}% de velocidade de ataque`, `+${nfmt(v)}% attack speed`),
  moveSpd: (v) => L(`+${nfmt(v)}% de velocidade de movimento`, `+${nfmt(v)}% movement speed`),
  hpPct: (v) => L(`+${nfmt(v)}% de vida máxima`, `+${nfmt(v)}% max health`),
  armorPct: (v) => L(`+${nfmt(v)}% de blindagem`, `+${nfmt(v)}% armor`),
  maxEn: (v) => L(`+${nfmt(v)} de energia máxima`, `+${nfmt(v)} max energy`),
  hpRegen: (v) => L(`+${nfmt(v)} de vida por segundo`, `+${nfmt(v)} health per second`),
  enRegen: (v) => L(`+${nfmt(v)} de energia por segundo`, `+${nfmt(v)} energy per second`),
  lifeSteal: (v) => L(`+${nfmt(v)}% de roubo de vida`, `+${nfmt(v)}% life steal`),
  cdr: (v) => L(`-${nfmt(v)}% de recarga dos poderes`, `-${nfmt(v)}% power cooldown`),
  costRed: (v) => L(`-${nfmt(v)}% de custo de energia`, `-${nfmt(v)}% energy cost`),
  findPct: (v) => L(`+${nfmt(v)}% de chance de achar itens`, `+${nfmt(v)}% item find`),
  dodge: (v) => L(`${nfmt(v)}% de chance de esquivar de um golpe`, `${nfmt(v)}% chance to dodge a hit`),
  dmgRed: (v) => L(`-${nfmt(v)}% de dano recebido`, `-${nfmt(v)}% damage taken`),
  killHeal: (v) => L(`Abates curam ${nfmt(v)}% da vida máxima`, `Kills heal ${nfmt(v)}% of max health`),
  killEn: (v) => L(`Abates dão ${nfmt(v)} de energia`, `Kills grant ${nfmt(v)} energy`),
  eliteDmg: (v) => L(`+${nfmt(v)}% de dano em elites e chefes`, `+${nfmt(v)}% damage to elites and bosses`),
  lowHpDmg: (v) => L(`+${nfmt(v)}% de dano com menos de 50% de vida`, `+${nfmt(v)}% damage below 50% health`),
  burnPct: (v) => L(`+${nfmt(v)}% de dano de queimadura`, `+${nfmt(v)}% burn damage`),
  chillDmg: (v) => L(`+${nfmt(v)}% de dano em inimigos lentos ou congelados`, `+${nfmt(v)}% damage to slowed or frozen enemies`),
  bossDmg: (v) => L(`+${nfmt(v)}% de dano em chefes`, `+${nfmt(v)}% damage to bosses`),
  execDmg: (v) => L(`+${nfmt(v)}% de dano em inimigos com menos de 30% de vida`, `+${nfmt(v)}% damage to enemies below 30% health`),
  fullHpDmg: (v) => L(`+${nfmt(v)}% de dano em inimigos com mais de 90% de vida`, `+${nfmt(v)}% damage to enemies above 90% health`),
  xpPct: (v) => L(`+${nfmt(v)}% de experiência`, `+${nfmt(v)}% experience`),
};
const r1 = (v) => Math.round(v * 10) / 10;
const passive = (id, req, name, icon, mods) => ({
  id, req, name, icon, passive: true, cost: 0, cd: 0, mods,
  desc: (r) => Object.entries(mods(r)).map(([k, v]) => PFMT[k](v)).join(' · ') + '.',
});
const PASSIVES = {
  blade: [
    passive('pEdge', 3, L('Fio Perfeito', 'Perfect Edge'), 'pTarget', (r) => ({ crit: r1(1.2 * r), critDmg: 5 * r })),
    passive('pReflex', 8, L('Reflexos de Samurai', 'Samurai Reflexes'), 'pWind', (r) => ({ dodge: r1(1.5 * r), moveSpd: 2 * r })),
    passive('pBushido', 14, L('Bushido Digital', 'Digital Bushido'), 'pCrown', (r) => ({ eliteDmg: 4 * r, killHeal: r1(0.5 * r) })),
  ],
  gunner: [
    passive('pSight', 3, L('Mira Laser', 'Laser Sight'), 'pEye', (r) => ({ crit: r1(1.2 * r), critDmg: 6 * r })),
    passive('pTrigger', 8, L('Gatilho Leve', 'Hair Trigger'), 'pWind', (r) => ({ atkSpd: 3 * r, moveSpd: r1(1.5 * r) })),
    passive('pBounty', 14, L('Caçador de Recompensas', 'Bounty Hunter'), 'pCrown', (r) => ({ eliteDmg: 5 * r, findPct: 4 * r })),
  ],
  netrunner: [
    passive('pBattery', 3, L('Bateria Quântica', 'Quantum Battery'), 'pBattery', (r) => ({ maxEn: 6 * r, enRegen: r1(0.4 * r) })),
    passive('pNeural', 8, L('Overclock Neural', 'Neural Overclock'), 'pChip', (r) => ({ cdr: r1(1.5 * r), costRed: 2 * r })),
    passive('pFirewall', 14, 'Firewall', 'pPlate', (r) => ({ dmgRed: r1(1.5 * r), killEn: r })),
  ],
  brawler: [
    passive('pPlated', 3, L('Corpo Blindado', 'Plated Body'), 'pPlate', (r) => ({ armorPct: 5 * r, hpPct: 2 * r })),
    passive('pAdrenaline', 8, L('Adrenalina', 'Adrenaline'), 'pRage', (r) => ({ lowHpDmg: 5 * r, hpRegen: r1(0.6 * r) })),
    passive('pBloodlust', 14, L('Sede de Sangue', 'Bloodlust'), 'pDrop', (r) => ({ lifeSteal: r1(0.8 * r), killHeal: r1(0.4 * r) })),
  ],
  pyro: [
    passive('pFuel', 3, L('Combustível Extra', 'Extra Fuel'), 'pBattery', (r) => ({ dmgPct: 3 * r, maxEn: 3 * r })),
    passive('pFireproof', 8, L('Pele Antichamas', 'Fireproof Skin'), 'pPlate', (r) => ({ dmgRed: r1(1.5 * r), hpRegen: r1(0.5 * r) })),
    passive('pInferno', 14, L('Inferno Interior', 'Inner Inferno'), 'pRage', (r) => ({ burnPct: 8 * r, dmgPct: r1(1.5 * r) })),
  ],
  frost: [
    passive('pFrozenHeart', 3, L('Coração Gélido', 'Frozen Heart'), 'pHeart', (r) => ({ hpPct: 2 * r, armorPct: 4 * r })),
    passive('pGlacial', 8, L('Precisão Glacial', 'Glacial Precision'), 'pTarget', (r) => ({ crit: r1(1.2 * r), critDmg: 5 * r })),
    passive('pWinter', 14, L('Inverno Eterno', 'Endless Winter'), 'pGear', (r) => ({ chillDmg: 4 * r, cdr: r1(1.2 * r) })),
  ],
  heavy: [
    passive('pHeavyPlate', 3, L('Blindagem Pesada', 'Heavy Plating'), 'pPlate', (r) => ({ hpPct: 3 * r, armorPct: 4 * r })),
    passive('pAP', 8, L('Munição Perfurante', 'AP Rounds'), 'pSkull', (r) => ({ dmgPct: r1(2.5 * r), critDmg: 4 * r })),
    passive('pReactor', 14, L('Reator Portátil', 'Portable Reactor'), 'pChip', (r) => ({ hpRegen: r1(0.8 * r), enRegen: r1(0.5 * r), costRed: r1(1.5 * r) })),
  ],
  hunter: [
    passive('pHawkEye', 3, L('Olho de Falcão', 'Hawk Eye'), 'pEye', (r) => ({ crit: r1(1.3 * r), critDmg: 6 * r })),
    passive('pStride', 8, L('Passo Leve', 'Light Step'), 'pWind', (r) => ({ moveSpd: 2 * r, dodge: r1(1.2 * r) })),
    passive('pApex', 14, L('Predadora Alfa', 'Apex Predator'), 'pCrown', (r) => ({ eliteDmg: 5 * r, atkSpd: 2 * r })),
  ],
  lancer: [
    passive('pConductor', 3, L('Condutora', 'Conductor'), 'pBattery', (r) => ({ enRegen: r1(0.5 * r), cdr: r1(1.2 * r) })),
    passive('pAegis', 8, L('Égide', 'Aegis'), 'pPlate', (r) => ({ armorPct: 4 * r, hpPct: 2 * r })),
    passive('pThunderGod', 14, L('Filha do Trovão', 'Daughter of Thunder'), 'pRage', (r) => ({ dmgPct: r1(2.5 * r), lifeSteal: r1(0.6 * r) })),
  ],
  biohacker: [
    passive('pImmune', 3, L('Imunidade', 'Immunity'), 'pHeart', (r) => ({ hpPct: r1(2.5 * r), hpRegen: r1(0.7 * r) })),
    passive('pCatalyst', 8, L('Catalisador', 'Catalyst'), 'pDrop', (r) => ({ burnPct: 8 * r, dmgPct: r1(1.5 * r) })),
    passive('pLab', 14, L('Laboratório Móvel', 'Mobile Lab'), 'pChip', (r) => ({ costRed: 2 * r, killHeal: r1(0.4 * r) })),
  ],
};
for (const [id, list] of Object.entries(PASSIVES)) CLASSES[id].skills.push(...list);

// Teleporte para todas as classes (o Netrunner já tem o Salto de Rede). Fica no fim da lista
// para não mudar a posição dos poderes nos saves antigos.
for (const id of Object.keys(CLASSES)) {
  if (id === 'netrunner') continue;
  CLASSES[id].skills.push({ id: 'warp', req: 3, name: L('Teleporte', 'Teleport'), icon: 'blink', cost: 15, cd: 5, desc: (r) => L(`Teletransporta até 8m para onde você mira, fica invulnerável por um instante e solta um pulso de ${pct(0.8 * rankMult(r))} ao redor do destino.`, `Teleports up to 8m toward your aim, briefly invulnerable, and releases a ${pct(0.8 * rankMult(r))} pulse around the destination.`) });
}

// Passivos avançados (níveis 20, 28 e 36): o último andar da árvore. Vão no fim da lista,
// depois do Teleporte, para não mudar a posição dos poderes nos saves antigos (late: andar próprio na árvore).
const late = (...a) => ({ ...passive(...a), late: true });
const LATE_PASSIVES = {
  blade: [
    late('pKensei', 20, 'Kensei', 'pCrown', (r) => ({ dmgPct: 3 * r, atkSpd: 2 * r })),
    late('pIronWill', 28, L('Vontade de Ferro', 'Iron Will'), 'pPlate', (r) => ({ dmgRed: r1(1.2 * r), hpPct: 3 * r })),
    late('pZen', 36, L('Zen Cromado', 'Chrome Zen'), 'pGear', (r) => ({ cdr: r1(1.5 * r), critDmg: 8 * r })),
  ],
  gunner: [
    late('pDeadeye', 20, L('Olho Morto', 'Deadeye'), 'pTarget', (r) => ({ critDmg: 8 * r, dmgPct: 2 * r })),
    late('pAkimbo', 28, 'Akimbo', 'pWind', (r) => ({ atkSpd: 3 * r, lifeSteal: r1(0.5 * r) })),
    late('pGunLegend', 36, L('Lenda do Gatilho', 'Trigger Legend'), 'pCrown', (r) => ({ dmgPct: 3 * r, eliteDmg: 4 * r })),
  ],
  netrunner: [
    late('pOverflow', 20, L('Estouro de Buffer', 'Buffer Overflow'), 'pChip', (r) => ({ dmgPct: 3 * r, maxEn: 5 * r })),
    late('pProxy', 28, L('Proxy Blindado', 'Armored Proxy'), 'pPlate', (r) => ({ hpPct: 3 * r, dodge: r1(1.2 * r) })),
    late('pRoot', 36, L('Acesso Root', 'Root Access'), 'pCrown', (r) => ({ cdr: r1(1.5 * r), eliteDmg: 5 * r })),
  ],
  brawler: [
    late('pPistons', 20, L('Pistões Turbo', 'Turbo Pistons'), 'pGear', (r) => ({ dmgPct: 3 * r, atkSpd: 2 * r })),
    late('pTitan', 28, L('Titã', 'Titan'), 'pPlate', (r) => ({ hpPct: 4 * r, dmgRed: r1(1.2 * r) })),
    late('pChampion', 36, L('Campeão Invicto', 'Undefeated Champion'), 'pCrown', (r) => ({ critDmg: 8 * r, killHeal: r1(0.4 * r) })),
  ],
  pyro: [
    late('pNapalm', 20, 'Napalm', 'pDrop', (r) => ({ burnPct: 10 * r, dmgPct: 2 * r })),
    late('pPhoenixHeart', 28, L('Coração de Fênix', 'Phoenix Heart'), 'pHeart', (r) => ({ hpPct: 3 * r, lifeSteal: r1(0.6 * r) })),
    late('pSupernova', 36, 'Supernova', 'pRage', (r) => ({ dmgPct: 3 * r, cdr: r1(1.2 * r) })),
  ],
  frost: [
    late('pPermafrost', 20, 'Permafrost', 'pGear', (r) => ({ chillDmg: 5 * r, dmgPct: 2 * r })),
    late('pIceArmor', 28, L('Armadura de Gelo', 'Ice Armor'), 'pPlate', (r) => ({ armorPct: 5 * r, dmgRed: r1(1.2 * r) })),
    late('pAbsZero', 36, L('Zero Absoluto', 'Absolute Zero'), 'pTarget', (r) => ({ critDmg: 8 * r, eliteDmg: 4 * r })),
  ],
  heavy: [
    late('pOverdrive', 20, L('Sobrecarga', 'Overdrive'), 'pBattery', (r) => ({ atkSpd: r1(2.5 * r), dmgPct: 2 * r })),
    late('pFortress', 28, L('Fortaleza Móvel', 'Walking Fortress'), 'pPlate', (r) => ({ dmgRed: r1(1.5 * r), hpPct: 3 * r })),
    late('pWarMachine', 36, L('Máquina de Guerra', 'War Machine'), 'pSkull', (r) => ({ dmgPct: 3 * r, eliteDmg: 4 * r })),
  ],
  hunter: [
    late('pVenomTip', 20, L('Ponta Venenosa', 'Venom Tip'), 'pDrop', (r) => ({ burnPct: 8 * r, critDmg: 5 * r })),
    late('pJungleGhost', 28, L('Fantasma da Selva', 'Jungle Ghost'), 'pWind', (r) => ({ dodge: r1(1.2 * r), lifeSteal: r1(0.5 * r) })),
    late('pTrophy', 36, L('Caçadora de Troféus', 'Trophy Hunter'), 'pCrown', (r) => ({ dmgPct: 3 * r, findPct: 4 * r })),
  ],
  lancer: [
    late('pStormRider', 20, L('Cavaleira da Tempestade', 'Storm Rider'), 'pWind', (r) => ({ atkSpd: r1(2.5 * r), moveSpd: r1(1.5 * r) })),
    late('pValhalla', 28, L('Valhala', 'Valhalla'), 'pHeart', (r) => ({ hpPct: 3 * r, killHeal: r1(0.4 * r) })),
    late('pOdin', 36, L('Lança de Odin', "Odin's Spear"), 'pTarget', (r) => ({ critDmg: 8 * r, eliteDmg: 4 * r })),
  ],
  biohacker: [
    late('pMutagen', 20, L('Mutagênico', 'Mutagen'), 'pDrop', (r) => ({ dmgPct: 3 * r, hpRegen: r1(0.8 * r) })),
    late('pSymbiote', 28, L('Simbionte', 'Symbiote'), 'pHeart', (r) => ({ lifeSteal: r1(0.6 * r), hpPct: 3 * r })),
    late('pOutbreak', 36, L('Surto', 'Outbreak'), 'pSkull', (r) => ({ burnPct: 10 * r, cdr: r1(1.2 * r) })),
  ],
};
for (const [id, list] of Object.entries(LATE_PASSIVES)) CLASSES[id].skills.push(...list);

// Poderes avançados (níveis 40, 50, 60 e 70): 2 de ataque e 2 de defesa por classe. Vão no fim da lista,
// depois dos passivos avançados, para não mudar a posição dos poderes nos saves antigos (adv: andar próprio na árvore).
const dur = (b, r) => b + 0.3 * r; // duração das defesas
const healF = (b, r) => b + 0.01 * r; // fração da vida curada
const s1 = (v) => v.toFixed(1);
const hp = (f) => `${Math.round(f * 100)}%`;
const adv = (id, req, name, icon, cost, cd, desc) => ({ id, req, name, icon, cost, cd, desc, adv: true });
const ADV_POWERS = {
  blade: [
    adv('crescent', 40, L('Onda Crescente', 'Crescent Wave'), 'crescent', 40, 8, (r) => L(`Lança 3 ondas cortantes em leque que atravessam todos os inimigos, causando ${pct(2.2 * rankMult(r))} cada.`, `Launches 3 slicing waves in a fan that pass through every enemy, dealing ${pct(2.2 * rankMult(r))} each.`)),
    adv('mirrorStance', 50, L('Postura do Espelho', 'Mirror Stance'), 'mirror', 35, 20, (r) => L(`Por ${s1(dur(3, r))}s você recebe só 25% do dano. Ao terminar, contra-ataca com um corte giratório de ${pct(2.5 * rankMult(r))} em 3,5m.`, `For ${s1(dur(3, r))}s you take only 25% damage. When it ends, you counter with a spinning slash dealing ${pct(2.5 * rankMult(r))} within 3.5m.`)),
    adv('dragonSlash', 60, L('Corte do Dragão', 'Dragon Slash'), 'dragon', 60, 14, (r) => L(`Um corte de energia em linha reta de 14m que causa ${pct(4.5 * rankMult(r))} e incendeia tudo no caminho.`, `A 14m straight energy slash that deals ${pct(4.5 * rankMult(r))} and sets everything in its path on fire.`)),
    adv('zenBreath', 70, L('Respiração Zen', 'Zen Breath'), 'lotus', 45, 30, (r) => L(`Cura ${hp(healF(0.25, r))} da vida na hora, mais 4% por segundo durante 5s, e recupera 30 de energia.`, `Heals ${hp(healF(0.25, r))} of your health instantly, plus 4% per second for 5s, and restores 30 energy.`)),
  ],
  gunner: [
    adv('ricochet', 40, L('Bala Ricochete', 'Ricochet Round'), 'ricochet', 30, 6, (r) => L(`Uma bala que causa ${pct(2.0 * rankMult(r))} e ricocheteia por mais 5 inimigos (${pct(1.2 * rankMult(r))} cada).`, `A bullet that deals ${pct(2.0 * rankMult(r))} and ricochets to 5 more enemies (${pct(1.2 * rankMult(r))} each).`)),
    adv('smokeBomb', 50, L('Bomba de Fumaça', 'Smoke Bomb'), 'smoke', 30, 18, (r) => L(`Solta uma nuvem de fumaça: por ${s1(dur(4, r))}s você esquiva de 60% dos golpes, e os inimigos dentro da nuvem ficam lentos.`, `Drops a smoke cloud: for ${s1(dur(4, r))}s you dodge 60% of hits, and enemies inside the cloud are slowed.`)),
    adv('leadStorm', 60, L('Chuva de Chumbo', 'Lead Storm'), 'leadStorm', 55, 14, (r) => L(`Dispara 24 balas teleguiadas em 1,2s, cada uma causando ${pct(0.9 * rankMult(r))}.`, `Fires 24 homing bullets over 1.2s, each dealing ${pct(0.9 * rankMult(r))}.`)),
    adv('reboot', 70, L('Reinício de Emergência', 'Emergency Reboot'), 'reboot', 45, 30, (r) => L(`Cura ${hp(healF(0.3, r))} da vida na hora e ganha um escudo de 25% da vida.`, `Heals ${hp(healF(0.3, r))} of your health instantly and grants a shield worth 25% of your health.`)),
  ],
  netrunner: [
    adv('dataLance', 40, L('Lança de Dados', 'Data Lance'), 'lance', 35, 7, (r) => L(`Um raio de dados em linha reta de 16m que causa ${pct(4.0 * rankMult(r))} e atordoa por 1,2s.`, `A 16m straight data beam that deals ${pct(4.0 * rankMult(r))} and stuns for 1.2s.`)),
    adv('firewall', 50, 'Firewall', 'firewall', 40, 20, (r) => L(`Por ${s1(dur(6, r))}s você recebe metade do dano, e uma barreira de dados ao seu redor causa ${pct(0.4 * rankMult(r))} a cada 0,5s e deixa os inimigos lentos.`, `For ${s1(dur(6, r))}s you take half damage, and a data barrier around you deals ${pct(0.4 * rankMult(r))} every 0.5s and slows enemies.`)),
    adv('logicBomb', 60, L('Bomba Lógica', 'Logic Bomb'), 'bomb', 55, 14, (r) => L(`Arremessa uma bomba que explode causando ${pct(4.5 * rankMult(r))} e atordoando, e reinicia com uma segunda explosão de ${pct(2.0 * rankMult(r))}.`, `Throws a bomb that explodes for ${pct(4.5 * rankMult(r))} and stuns, then reboots for a second blast of ${pct(2.0 * rankMult(r))}.`)),
    adv('sysBackup', 70, L('Backup de Sistema', 'System Backup'), 'backup', 30, 35, (r) => L(`Restaura ${hp(healF(0.35, r))} da vida e metade da energia, e fica invulnerável por 1,5s.`, `Restores ${hp(healF(0.35, r))} of your health and half your energy, and makes you invulnerable for 1.5s.`)),
  ],
  brawler: [
    adv('uppercut', 40, L('Gancho Sísmico', 'Seismic Uppercut'), 'upper', 35, 7, (r) => L(`Um gancho que causa ${pct(4.0 * rankMult(r))} à frente, arremessa os inimigos longe e os atordoa por 1,2s.`, `An uppercut that deals ${pct(4.0 * rankMult(r))} in front of you, sends enemies flying and stuns them for 1.2s.`)),
    adv('steelSkin', 50, L('Pele de Aço', 'Steel Skin'), 'steel', 35, 20, (r) => L(`Por ${s1(dur(6, r))}s você recebe só 40% do dano e 10% do dano causado vira vida.`, `For ${s1(dur(6, r))}s you take only 40% damage and 10% of the damage you deal heals you.`)),
    adv('fistFury', 60, L('Fúria de Punhos', 'Fist Fury'), 'fury', 50, 12, (r) => L(`10 socos em 1s à sua frente (${pct(1.0 * rankMult(r))} cada) e um soco final de ${pct(3.0 * rankMult(r))}.`, `10 punches in 1s in front of you (${pct(1.0 * rankMult(r))} each) and a final punch dealing ${pct(3.0 * rankMult(r))}.`)),
    adv('secondWind', 70, L('Segundo Fôlego', 'Second Wind'), 'wind', 40, 30, (r) => L(`Cura ${hp(healF(0.25, r))} da vida na hora, mais 5% por segundo durante 4s, e empurra os inimigos próximos.`, `Heals ${hp(healF(0.25, r))} of your health instantly, plus 5% per second for 4s, and knocks nearby enemies back.`)),
  ],
  pyro: [
    adv('dragonBreath', 40, L('Sopro do Dragão', 'Dragon Breath'), 'breath', 40, 7, (r) => L(`Uma onda de fogo em cone de 6m que causa ${pct(3.0 * rankMult(r))} e queima forte.`, `A 6m cone of fire that deals ${pct(3.0 * rankMult(r))} and burns hard.`)),
    adv('flameMantle', 50, L('Manto de Chamas', 'Flame Mantle'), 'mantle', 40, 20, (r) => L(`Por ${s1(dur(8, r))}s você recebe 40% menos dano e as chamas ao seu redor causam ${pct(0.5 * rankMult(r))} a cada 0,5s.`, `For ${s1(dur(8, r))}s you take 40% less damage and the flames around you deal ${pct(0.5 * rankMult(r))} every 0.5s.`)),
    adv('sunfall', 60, L('Queda do Sol', 'Sunfall'), 'sun', 60, 16, (r) => L(`Um sol em miniatura cai onde você mira, causando ${pct(6.0 * rankMult(r))} em 5m e deixando o chão em chamas.`, `A miniature sun falls where you aim, dealing ${pct(6.0 * rankMult(r))} within 5m and leaving the ground on fire.`)),
    adv('cauterize', 70, L('Cauterizar', 'Cauterize'), 'cauter', 40, 30, (r) => L(`Cura ${hp(healF(0.3, r))} da vida, fica invulnerável por 1s e solta uma explosão de fogo ao redor.`, `Heals ${hp(healF(0.3, r))} of your health, makes you invulnerable for 1s and releases a fire blast around you.`)),
  ],
  frost: [
    adv('iceLance', 40, L('Lança de Gelo', 'Ice Lance'), 'lance', 35, 7, (r) => L(`Um raio de gelo em linha reta de 16m que causa ${pct(4.0 * rankMult(r))} e congela.`, `A 16m straight ice beam that deals ${pct(4.0 * rankMult(r))} and freezes.`)),
    adv('iceBlock', 50, L('Bloco de Gelo', 'Ice Block'), 'iceBlock', 35, 25, (r) => L(`Fica envolto em gelo e invulnerável por ${s1(2 + 0.1 * r)}s, recuperando 8% da vida por segundo, e congela os inimigos próximos.`, `Encases you in ice, invulnerable for ${s1(2 + 0.1 * r)}s while recovering 8% health per second, and freezes nearby enemies.`)),
    adv('glacialNova', 60, L('Nova Glacial', 'Glacial Nova'), 'snow', 55, 14, (r) => L(`Explosão de gelo que causa ${pct(3.5 * rankMult(r))} em 6m e congela, seguida de uma onda de ${pct(1.5 * rankMult(r))} em 8m.`, `An ice explosion dealing ${pct(3.5 * rankMult(r))} within 6m that freezes, followed by a ${pct(1.5 * rankMult(r))} wave within 8m.`)),
    adv('winterAura', 70, L('Aura do Inverno', 'Winter Aura'), 'aura', 40, 25, (r) => L(`Por ${s1(dur(8, r))}s você recebe metade do dano, recupera 2% da vida por segundo e o frio ao redor causa ${pct(0.35 * rankMult(r))} a cada 0,5s e deixa os inimigos lentos.`, `For ${s1(dur(8, r))}s you take half damage, recover 2% health per second, and the cold around you deals ${pct(0.35 * rankMult(r))} every 0.5s and slows enemies.`)),
  ],
  heavy: [
    adv('plasmaCannon', 40, L('Canhão de Plasma', 'Plasma Cannon'), 'cannon', 40, 8, (r) => L(`Dispara uma bola de plasma que explode causando ${pct(5.0 * rankMult(r))} em 4m.`, `Fires a plasma ball that explodes for ${pct(5.0 * rankMult(r))} within 4m.`)),
    adv('bunker', 50, 'Bunker', 'bunker', 35, 20, (r) => L(`Por ${s1(dur(5, r))}s você recebe só 30% do dano e ergue uma barreira à frente.`, `For ${s1(dur(5, r))}s you take only 30% damage and raise a barrier in front of you.`)),
    adv('carpetBomb', 60, L('Bombardeio', 'Carpet Bombing'), 'carpet', 60, 15, (r) => L(`10 explosões em linha na direção da mira, cada uma causando ${pct(2.6 * rankMult(r))}.`, `10 explosions in a line toward your aim, each dealing ${pct(2.6 * rankMult(r))}.`)),
    adv('repairDrones', 70, L('Drones de Reparo', 'Repair Drones'), 'repair', 45, 30, (r) => L(`Cura ${hp(healF(0.2, r))} da vida na hora, mais 4% por segundo durante 6s, e ganha um escudo de 20% da vida.`, `Heals ${hp(healF(0.2, r))} of your health instantly, plus 4% per second for 6s, and grants a shield worth 20% of your health.`)),
  ],
  hunter: [
    adv('volley', 40, L('Saraivada', 'Volley'), 'volley', 35, 7, (r) => L(`3 ondas de 9 flechas em leque, cada uma causando ${pct(0.9 * rankMult(r))} e atravessando 2 inimigos.`, `3 waves of 9 arrows in a fan, each dealing ${pct(0.9 * rankMult(r))} and piercing 2 enemies.`)),
    adv('camo', 50, L('Camuflagem', 'Camouflage'), 'camo', 30, 20, (r) => L(`Por ${s1(dur(4, r))}s você esquiva de 70% dos golpes e deixa uma isca no lugar, que explode causando ${pct(2.0 * rankMult(r))}.`, `For ${s1(dur(4, r))}s you dodge 70% of hits and leave a decoy behind that explodes for ${pct(2.0 * rankMult(r))}.`)),
    adv('blastArrow', 60, L('Flecha Explosiva', 'Explosive Arrow'), 'boomArrow', 50, 12, (r) => L(`Uma flecha que explode ao acertar, causando ${pct(4.5 * rankMult(r))} em 3,5m e queimando.`, `An arrow that explodes on impact, dealing ${pct(4.5 * rankMult(r))} within 3.5m and burning.`)),
    adv('herbs', 70, L('Ervas Medicinais', 'Healing Herbs'), 'herb', 40, 30, (r) => L(`Cura ${hp(healF(0.3, r))} da vida na hora, mais 3% por segundo durante 8s, e 10% do dano causado vira vida nesse tempo.`, `Heals ${hp(healF(0.3, r))} of your health instantly, plus 3% per second for 8s, and 10% of the damage you deal heals you meanwhile.`)),
  ],
  lancer: [
    adv('skyLance', 40, L('Lança Celeste', 'Sky Lance'), 'skyLance', 40, 8, (r) => L(`Arremessa uma lança de luz em linha reta de 15m que causa ${pct(4.0 * rankMult(r))} e solta um raio que salta por 3 inimigos.`, `Hurls a 15m straight lance of light that deals ${pct(4.0 * rankMult(r))} and releases lightning that jumps across 3 enemies.`)),
    adv('odinWall', 50, L('Muralha de Odin', "Odin's Bulwark"), 'bulwark', 35, 20, (r) => L(`Por ${s1(dur(5, r))}s você recebe só 35% do dano e um escudo devolve os tiros inimigos.`, `For ${s1(dur(5, r))}s you take only 35% damage and a shield reflects enemy shots.`)),
    adv('ragnarok', 60, 'Ragnarök', 'ragnarok', 60, 16, (r) => L(`16 raios caem sobre a área mirada, cada um causando ${pct(2.2 * rankMult(r))}.`, `16 lightning bolts strike the targeted area, each dealing ${pct(2.2 * rankMult(r))}.`)),
    adv('valkBless', 70, L('Bênção da Valquíria', "Valkyrie's Blessing"), 'wings', 45, 30, (r) => L(`Cura ${hp(healF(0.3, r))} da vida e, por 6s, recupera 3% da vida por segundo e recebe 40% menos dano.`, `Heals ${hp(healF(0.3, r))} of your health and, for 6s, recovers 3% health per second and takes 40% less damage.`)),
  ],
  biohacker: [
    adv('acidSpray', 40, L('Jato Ácido', 'Acid Spray'), 'acid', 35, 7, (r) => L(`Um jato de ácido em cone de 5,5m que causa ${pct(2.6 * rankMult(r))}, corrói e deixa os inimigos lentos.`, `A 5.5m cone of acid that deals ${pct(2.6 * rankMult(r))}, corrodes and slows enemies.`)),
    adv('cocoon', 50, L('Casulo Regenerativo', 'Regen Cocoon'), 'cocoon', 40, 22, (r) => L(`Por ${s1(dur(5, r))}s você recebe metade do dano e recupera 5% da vida por segundo.`, `For ${s1(dur(5, r))}s you take half damage and recover 5% health per second.`)),
    adv('bioBomb', 60, L('Bomba Biológica', 'Bio Bomb'), 'bioBomb', 55, 14, (r) => L(`Arremessa uma bomba que causa ${pct(4.0 * rankMult(r))} em 4,5m e deixa uma nuvem tóxica por 6s.`, `Throws a bomb that deals ${pct(4.0 * rankMult(r))} within 4.5m and leaves a toxic cloud for 6s.`)),
    adv('adaptSkin', 70, L('Pele Adaptativa', 'Adaptive Skin'), 'hexSkin', 40, 28, (r) => L(`Por ${s1(dur(8, r))}s você recebe metade do dano, esquiva de 30% dos golpes e 10% do dano causado vira vida.`, `For ${s1(dur(8, r))}s you take half damage, dodge 30% of hits, and 10% of the damage you deal heals you.`)),
  ],
};
for (const [id, list] of Object.entries(ADV_POWERS)) CLASSES[id].skills.push(...list);

// Passivos supremos (níveis 72, 80, 88 e 96) e ataques supremos (76, 84, 92 e 100): as duas fileiras do topo
// da árvore. Vão no fim da lista, depois dos poderes avançados (sup e apex: andares próprios na árvore).
const sup = (...a) => ({ ...passive(...a), sup: true });
const apex = (id, req, name, icon, cost, cd, desc) => ({ id, req, name, icon, cost, cd, desc, apex: true });
const SUP_PASSIVES = {
  blade: [
    sup('pAncestral', 72, L('Lâmina Ancestral', 'Ancestral Blade'), 'pSword', (r) => ({ dmgPct: 3 * r, critDmg: 6 * r })),
    sup('pKata', 80, L('Kata Infinito', 'Endless Kata'), 'pWind', (r) => ({ atkSpd: 2 * r, enRegen: r1(0.4 * r) })),
    sup('pRonin', 88, L('Espírito do Ronin', 'Ronin Spirit'), 'pSkull', (r) => ({ execDmg: 4 * r, killHeal: r1(0.3 * r) })),
    sup('pShogun', 96, 'Shogun', 'pCrown', (r) => ({ bossDmg: 5 * r, hpPct: 3 * r })),
  ],
  gunner: [
    sup('pHotBarrel', 72, L('Cano Quente', 'Hot Barrel'), 'pRage', (r) => ({ atkSpd: 2 * r, dmgPct: 2 * r })),
    sup('pGhostSight', 80, L('Mira Fantasma', 'Ghost Sight'), 'pEye', (r) => ({ critDmg: 8 * r, fullHpDmg: 4 * r })),
    sup('pColdBlood', 88, L('Sangue Frio', 'Cold Blood'), 'pTarget', (r) => ({ execDmg: 4 * r, killEn: r1(0.6 * r) })),
    sup('pWestMyth', 96, L('Mito do Velho Oeste', 'Wild West Legend'), 'pStar', (r) => ({ bossDmg: 5 * r, findPct: 3 * r, xpPct: 2 * r })),
  ],
  netrunner: [
    sup('pQuantum', 72, L('Criptografia Quântica', 'Quantum Encryption'), 'pChip', (r) => ({ maxEn: 6 * r, dmgPct: 2 * r })),
    sup('pBotnet', 80, 'Botnet', 'pNet', (r) => ({ fullHpDmg: 4 * r, enRegen: r1(0.4 * r) })),
    sup('pKernel', 88, L('Kernel Zero', 'Kernel Zero'), 'pSkull', (r) => ({ execDmg: 4 * r, killEn: r1(0.6 * r) })),
    sup('pNetGod', 96, L('Deus da Rede', 'God of the Net'), 'pCrown', (r) => ({ bossDmg: 5 * r, critDmg: 6 * r, xpPct: 2 * r })),
  ],
  brawler: [
    sup('pPureSteel', 72, L('Punhos de Aço Puro', 'Pure Steel Fists'), 'pFist', (r) => ({ dmgPct: 3 * r, critDmg: 6 * r })),
    sup('pHydraulic', 80, L('Couraça Hidráulica', 'Hydraulic Plating'), 'pPlate', (r) => ({ armorPct: 6 * r, hpRegen: r1(1.0 * r) })),
    sup('pUnbreakable', 88, L('Fúria Inquebrável', 'Unbreakable Fury'), 'pRage', (r) => ({ execDmg: 4 * r, killHeal: r1(0.3 * r) })),
    sup('pRingLegend', 96, L('Lenda do Ringue', 'Ring Legend'), 'pCrown', (r) => ({ bossDmg: 5 * r, atkSpd: 2 * r, xpPct: 2 * r })),
  ],
  pyro: [
    sup('pSlowBurn', 72, L('Combustão Lenta', 'Slow Burn'), 'pFlame', (r) => ({ burnPct: 12 * r, dmgPct: 2 * r })),
    sup('pMagmaSkin', 80, L('Pele de Magma', 'Magma Skin'), 'pPlate', (r) => ({ armorPct: 6 * r, hpRegen: r1(1.0 * r) })),
    sup('pBlueFlame', 88, L('Chama Azul', 'Blue Flame'), 'pRage', (r) => ({ execDmg: 4 * r, critDmg: 6 * r })),
    sup('pInnerSun', 96, L('Sol Interior', 'Inner Sun'), 'pCrown', (r) => ({ bossDmg: 5 * r, burnPct: 8 * r, xpPct: 2 * r })),
  ],
  frost: [
    sup('pLivingCrystal', 72, L('Cristal Vivo', 'Living Crystal'), 'pSnow', (r) => ({ critDmg: 6 * r, dmgPct: 2 * r })),
    sup('pGlacierHeart', 80, L('Coração de Geleira', 'Glacier Heart'), 'pHeart', (r) => ({ hpPct: 3 * r, dmgRed: r1(1.0 * r) })),
    sup('pEternalBlizzard', 88, L('Nevasca Eterna', 'Eternal Blizzard'), 'pGear', (r) => ({ chillDmg: 4 * r, fullHpDmg: 4 * r })),
    sup('pIceQueen', 96, L('Rainha do Gelo', 'Ice Queen'), 'pCrown', (r) => ({ bossDmg: 5 * r, execDmg: 3 * r, xpPct: 2 * r })),
  ],
};
const APEX_POWERS = {
  blade: [
    apex('petalStorm', 76, L('Tempestade de Pétalas', 'Petal Storm'), 'petals', 55, 16, (r) => L(`Por 6s, um redemoinho de pétalas afiadas gira ao seu redor (4,5m), causando ${pct(1.2 * rankMult(r))} a cada 0,5s e deixando os inimigos lentos.`, `For 6s, a whirlwind of razor petals spins around you (4.5m), dealing ${pct(1.2 * rankMult(r))} every 0.5s and slowing enemies.`)),
    apex('iaijutsu', 84, L('Iaijutsu Absoluto', 'Absolute Iaijutsu'), 'iai', 50, 10, (r) => L(`Atravessa até 10m na direção da mira num piscar, invulnerável. Um instante depois, todo inimigo no caminho sofre um crítico garantido de ${pct(5.0 * rankMult(r))}.`, `Flashes up to 10m toward your aim, invulnerable. A moment later, every enemy in your path takes a guaranteed critical hit of ${pct(5.0 * rankMult(r))}.`)),
    apex('shadowClones', 92, L('Clones de Sombra', 'Shadow Clones'), 'shades', 60, 25, (r) => L(`Invoca 3 clones de sombra que lutam por 12s (${pct(1.4 * rankMult(r))} por golpe) e explodem ao sumir.`, `Summons 3 shadow clones that fight for 12s (${pct(1.4 * rankMult(r))} per strike) and explode when they fade.`)),
    apex('dimensionCut', 100, L('Corte Dimensional', 'Dimension Cut'), 'rift', 80, 22, (r) => L(`Rasga o espaço onde você mira com dois cortes em X de 12m (${pct(6.0 * rankMult(r))} cada). A fenda suga os inimigos por 3s e se fecha numa explosão de ${pct(4.0 * rankMult(r))}.`, `Tears space where you aim with two 12m X-shaped cuts (${pct(6.0 * rankMult(r))} each). The rift pulls enemies in for 3s and closes in a ${pct(4.0 * rankMult(r))} blast.`)),
  ],
  gunner: [
    apex('railShot', 76, L('Tiro de Trilha', 'Rail Shot'), 'rail', 45, 9, (r) => L(`Um disparo que atravessa paredes e todos os inimigos numa linha de 30m, causando ${pct(6.5 * rankMult(r))}.`, `A shot that goes through walls and every enemy in a 30m line, dealing ${pct(6.5 * rankMult(r))}.`)),
    apex('clusterGrenade', 84, L('Granada Cluster', 'Cluster Grenade'), 'cluster', 50, 12, (r) => L(`Arremessa uma granada que explode causando ${pct(4.0 * rankMult(r))} em 3,5m e espalha 8 minibombas de ${pct(2.0 * rankMult(r))} cada.`, `Throws a grenade that explodes for ${pct(4.0 * rankMult(r))} within 3.5m and scatters 8 bomblets dealing ${pct(2.0 * rankMult(r))} each.`)),
    apex('bulletDance', 92, L('Dança das Balas', 'Bullet Dance'), 'dance', 60, 18, (r) => L(`Por 3s você gira atirando em espiral: 90 balas de ${pct(0.8 * rankMult(r))} cada, e esquiva de 50% dos golpes.`, `For 3s you spin firing in a spiral: 90 bullets dealing ${pct(0.8 * rankMult(r))} each, and dodge 50% of hits.`)),
    apex('orbitalCannon', 100, L('Canhão Orbital', 'Orbital Cannon'), 'satellite', 85, 24, (r) => L(`Marca o chão onde você mira; 1,2s depois um canhão orbital dispara um feixe gigante que causa ${pct(10 * rankMult(r))} em 5m e deixa o chão em chamas.`, `Marks the ground where you aim; 1.2s later an orbital cannon fires a giant beam dealing ${pct(10 * rankMult(r))} within 5m and setting the ground ablaze.`)),
  ],
  netrunner: [
    apex('chainVirus', 76, L('Vírus em Cadeia', 'Chain Virus'), 'virus', 45, 9, (r) => L(`Dispara um vírus teleguiado que causa ${pct(2.5 * rankMult(r))} e salta por até 10 inimigos (${pct(1.8 * rankMult(r))} cada), corroendo e deixando todos lentos.`, `Fires a homing virus that deals ${pct(2.5 * rankMult(r))} and jumps across up to 10 enemies (${pct(1.8 * rankMult(r))} each), corroding and slowing them all.`)),
    apex('offFirewall', 84, L('Firewall Ofensivo', 'Offensive Firewall'), 'fwall', 50, 16, (r) => L(`Ergue uma muralha de dados de 8m onde você mira por 6s: bloqueia tiros inimigos e quem encostar sofre ${pct(1.3 * rankMult(r))} a cada 0,5s, é atordoado e empurrado.`, `Raises an 8m data wall where you aim for 6s: it blocks enemy shots, and anything touching it takes ${pct(1.3 * rankMult(r))} every 0.5s, is stunned and pushed back.`)),
    apex('droneArmy', 92, L('Exército de Drones', 'Drone Army'), 'drones', 60, 24, (r) => L(`Lança 6 drones de combate que voam com você e atiram por 15s (${pct(0.8 * rankMult(r))} por tiro).`, `Launches 6 combat drones that fly with you and shoot for 15s (${pct(0.8 * rankMult(r))} per shot).`)),
    apex('blackout', 100, L('Apagão Total', 'Total Blackout'), 'blackout', 85, 26, (r) => L(`Derruba a rede inteira em 14m: apaga todos os tiros inimigos, causa ${pct(5.0 * rankMult(r))} e atordoa os inimigos por 3s (menos em chefes).`, `Crashes the whole network within 14m: erases every enemy shot, deals ${pct(5.0 * rankMult(r))} and stuns enemies for 3s (less on bosses).`)),
  ],
  brawler: [
    apex('tectonicRift', 76, L('Fenda Tectônica', 'Tectonic Rift'), 'tectonic', 45, 9, (r) => L(`Soca o chão e abre 3 fendas de 10m em leque: cada inimigo atingido sofre ${pct(3.5 * rankMult(r))} e fica atordoado.`, `Punches the ground and opens 3 cracks 10m long in a fan: every enemy hit takes ${pct(3.5 * rankMult(r))} and is stunned.`)),
    apex('rocketHook', 84, L('Gancho Foguete', 'Rocket Hook'), 'hook', 45, 10, (r) => L(`Dispara um gancho de 12m que puxa todos os inimigos da linha até você (${pct(1.5 * rankMult(r))}) e emenda um soco em cone de ${pct(4.0 * rankMult(r))}.`, `Fires a 12m hook that drags every enemy in the line to you (${pct(1.5 * rankMult(r))}) and follows up with a cone punch dealing ${pct(4.0 * rankMult(r))}.`)),
    apex('hundredFists', 92, L('Cem Socos', 'Hundred Fists'), 'hundred', 60, 16, (r) => L(`100 socos em 2,5s à sua frente (${pct(0.45 * rankMult(r))} cada) e um soco final de ${pct(5.0 * rankMult(r))}. Enquanto isso você recebe metade do dano.`, `100 punches in 2.5s in front of you (${pct(0.45 * rankMult(r))} each) and a final punch dealing ${pct(5.0 * rankMult(r))}. Meanwhile you take half damage.`)),
    apex('heavenFist', 100, L('Punho do Céu', 'Fist of Heaven'), 'heaven', 85, 22, (r) => L(`Marca o chão onde você mira; 1s depois um punho gigante cai do céu causando ${pct(9.0 * rankMult(r))} em 5,5m e atordoando, e a onda de choque causa ${pct(2.0 * rankMult(r))} em 9m.`, `Marks the ground where you aim; 1s later a giant fist falls from the sky dealing ${pct(9.0 * rankMult(r))} within 5.5m and stunning, and the shockwave deals ${pct(2.0 * rankMult(r))} within 9m.`)),
  ],
  pyro: [
    apex('fireWall', 76, L('Muralha de Fogo', 'Wall of Fire'), 'flameWall', 45, 10, (r) => L(`Ergue uma muralha de fogo de 10m onde você mira: a erupção causa ${pct(3.0 * rankMult(r))} e a muralha queima quem passar por 6s (${pct(0.7 * rankMult(r))} a cada 0,5s).`, `Raises a 10m wall of fire where you aim: the eruption deals ${pct(3.0 * rankMult(r))} and the wall burns anyone crossing it for 6s (${pct(0.7 * rankMult(r))} every 0.5s).`)),
    apex('flameDragon', 84, L('Dragão de Chamas', 'Flame Dragon'), 'wyrm', 50, 12, (r) => L(`Solta um dragão de fogo que serpenteia 18m à frente, causando ${pct(3.5 * rankMult(r))} e queimando forte quem tocar, e explode no fim (${pct(3.0 * rankMult(r))}).`, `Unleashes a fire dragon that snakes 18m ahead, dealing ${pct(3.5 * rankMult(r))} and burning hard whoever it touches, then explodes at the end (${pct(3.0 * rankMult(r))}).`)),
    apex('fireTornado', 92, L('Tornado de Fogo', 'Fire Tornado'), 'tornado', 60, 18, (r) => L(`Um tornado de fogo de 8s caça os inimigos, puxa quem estiver a 5m e causa ${pct(0.9 * rankMult(r))} a cada 0,25s em quem estiver dentro.`, `An 8s fire tornado hunts enemies, pulls anyone within 5m and deals ${pct(0.9 * rankMult(r))} every 0.25s to those inside.`)),
    apex('solarNova', 100, L('Nova Solar', 'Solar Nova'), 'solar', 85, 26, (r) => L(`Por 8s você vira um sol vivo: queima tudo em 5m (${pct(1.0 * rankMult(r))} a cada 0,5s), recebe 30% menos dano e solta labaredas a cada 2s (${pct(3.0 * rankMult(r))} em 6m). No fim, explode numa nova de ${pct(8.0 * rankMult(r))} em 8m.`, `For 8s you become a living sun: burns everything within 5m (${pct(1.0 * rankMult(r))} every 0.5s), take 30% less damage and release flares every 2s (${pct(3.0 * rankMult(r))} in 6m). At the end you explode in a nova of ${pct(8.0 * rankMult(r))} in 8m.`)),
  ],
  frost: [
    apex('crystalSwarm', 76, L('Enxame de Cristais', 'Crystal Swarm'), 'crystals', 45, 9, (r) => L(`Dispara 10 cristais de gelo teleguiados, cada um causando ${pct(2.2 * rankMult(r))} e congelando por um instante.`, `Fires 10 homing ice crystals, each dealing ${pct(2.2 * rankMult(r))} and briefly freezing.`)),
    apex('glacialPrison', 84, L('Prisão Glacial', 'Glacial Prison'), 'prison', 50, 14, (r) => L(`Prende num bloco de gelo todos os inimigos a 5m de onde você mira (${pct(1.5 * rankMult(r))}, congela por 3s). Depois o gelo estilhaça e causa ${pct(4.5 * rankMult(r))}.`, `Traps every enemy within 5m of where you aim in a block of ice (${pct(1.5 * rankMult(r))}, frozen for 3s). Then the ice shatters for ${pct(4.5 * rankMult(r))}.`)),
    apex('avalanche', 92, 'Avalanche', 'avalanche', 60, 16, (r) => L(`Uma muralha de neve de 8m rola 18m à sua frente, causando ${pct(5.0 * rankMult(r))}, deixando lento e arrastando os inimigos.`, `An 8m wall of snow rolls 18m ahead of you, dealing ${pct(5.0 * rankMult(r))}, slowing and sweeping enemies away.`)),
    apex('iceAge', 100, L('Era do Gelo', 'Ice Age'), 'iceAge', 85, 26, (r) => L(`Congela o mundo em 14m: causa ${pct(6.0 * rankMult(r))} e congela os inimigos por 4s entre cristais gigantes, que então estilhaçam (${pct(3.0 * rankMult(r))}).`, `Freezes the world within 14m: deals ${pct(6.0 * rankMult(r))} and freezes enemies for 4s among giant crystals, which then shatter (${pct(3.0 * rankMult(r))}).`)),
  ],
};
for (const [id, list] of Object.entries(SUP_PASSIVES)) CLASSES[id].skills.push(...list);
for (const [id, list] of Object.entries(APEX_POWERS)) CLASSES[id].skills.push(...list);

// Bônus somados de todos os passivos aprendidos (usado em computeStats)
export function passiveMods(c) {
  const out = {};
  CLASSES[c.cls].skills.forEach((sk, i) => {
    const r = c.skills[i] || 0;
    if (!sk.passive || r <= 0) return;
    for (const [k, v] of Object.entries(sk.mods(r))) out[k] = (out[k] || 0) + v;
  });
  return out;
}
export const isPassive = (cls, i) => !!CLASSES[cls].skills[i]?.passive;

export const CLASS_ORDER = ['blade', 'gunner', 'netrunner', 'brawler', 'pyro', 'frost', 'heavy', 'hunter', 'lancer', 'biohacker'];

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
    let t = targetPoint(p, 7);
    if (p.aimEnemy) {
      const e = p.aimEnemy;
      const l = Math.hypot(e.x - p.x, e.z - p.z);
      const stop = Math.max(0, Math.min(7, l - 1.6));
      t = { x: p.x + p.aim.dx * stop, z: p.z + p.aim.dz * stop };
    }
    return teleport(p, t, CLASSES.netrunner.accent, 1.0 * rankMult(r), 1.9);
  },
  // Teleporte genérico (todas as classes): vai até o ponto mirado, sem parar antes do inimigo
  warp(p, r) {
    // vai para o cursor (até 8m); no controle/toque, 8m na direção do analógico ou do movimento.
    // Não usa a mira automática: assim o teleporte também serve para fugir.
    const f = p.pref || { dx: p.aim.dx, dz: p.aim.dz };
    let t = { x: p.x + f.dx * 8, z: p.z + f.dz * 8 };
    if (f.x != null) {
      const l = Math.hypot(f.x - p.x, f.z - p.z);
      if (l >= 2.5) t = { x: p.x + ((f.x - p.x) / l) * Math.min(8, l), z: p.z + ((f.z - p.z) / l) * Math.min(8, l) };
    }
    p.aim.dx = f.dx;
    p.aim.dz = f.dz;
    const c = CLASSES[G.char.cls].accent;
    return teleport(p, t, c, 0.8 * rankMult(r), 2.2, true);
  },
};

// Teletransporta o jogador até o ponto livre mais distante na linha até t (com efeitos e dano no destino)
function teleport(p, t, color, mult, radius, big) {
  const d = G.dungeon;
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
  if (!ok || (big && Math.hypot(tx - p.x, tz - p.z) < 0.6)) return false;
  burst(p.x, 0.8, p.z, color, big ? 30 : 20, 4, 0.07, 0.4);
  ghostFx(p.model, color);
  const x0 = p.x;
  const z0 = p.z;
  if (big) ringFx(p.x, p.z, 1.3, color, 0.3, { from: 0.9 });
  p.x = tx;
  p.z = tz;
  p.path = null;
  p.invuln = Math.max(p.invuln, big ? 0.4 : 0.25);
  const hits = enemiesInRadius(tx, tz, radius);
  for (const e of hits) hitEnemy(e, mult, { knock: 3 });
  ringFx(tx, tz, radius, color, 0.3);
  burst(tx, 0.8, tz, color, big ? 30 : 20, 5, 0.07, 0.4, big ? { up: 1 } : undefined);
  sfx.zap();
  if (p.buffs.phase > 0) shrineBlink(x0, z0, tx, tz); // Santuário do Superteleporte
  return true;
}

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

  // Caçadora
  arrow(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 32, life: 0.5, mult: 1.25 * rankMult(r), color: C_('hunter'), size: 0.11, r: 0.24, pierce: 1, homing: 2 });
    burst(p.x + p.aim.dx * 0.6, 1, p.z + p.aim.dz * 0.6, C_('hunter'), 3, 2, 0.05, 0.15, { grav: 0 });
    sfx.shoot();
    p.swing = 1;
    return true;
  },
  multishot(p, r) {
    const base = angleOf(p.aim.dx, p.aim.dz);
    for (let k = -2; k <= 2; k++) {
      const a = base + k * 0.13;
      spawnProjectile({ from: 'player', x: p.x + Math.cos(a) * 0.4, z: p.z + Math.sin(a) * 0.4, dx: Math.cos(a), dz: Math.sin(a), speed: 30, life: 0.5, mult: 0.9 * rankMult(r), color: C_('hunter'), size: 0.1, r: 0.22, pierce: 1, homing: 1.5 });
    }
    sfx.shoot();
    setTimeout(() => sfx.shoot(), 50);
    p.swing = 1;
    return true;
  },
  trap(p, r) {
    const t = targetPoint(p, 9);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.45, color: C_('hunter'), onLand: (x, z) => {
      explosion(x, z, 2.6, 1.0 * rankMult(r), { color: C_('hunter'), stun: 1.6, knock: 0.5, small: true });
      spawnHazard(x, z, 2.6, 4, 0, { faction: 'player', mult: 0.12 * rankMult(r), slow: 1.5, color: C_('hunter'), opacity: 0.3 });
      sfx.zap();
    } });
    p.swing = 1;
    return true;
  },
  arrowRain: (p, r) => {
    const t = PW.aimPoint(p, 11);
    PW.meteorShower(t.x, t.z, 16, 0.9 * rankMult(r), C_('hunter'), { gap: 0.09 });
    p.swing = 1;
    return true;
  },
  hawk: (p, r) => (PW.spawnAlly('hawk', p.x + p.aim.dx, p.z + p.aim.dz, { dur: 16, mult: 1.0 * rankMult(r) }), sfx.dash(), true),
  vault(p, r) {
    p.dash = { dx: -p.aim.dx, dz: -p.aim.dz, speed: 22, t: 0.28, hit: null, mult: 0, radius: 0, color: C_('hunter') };
    p.invuln = Math.max(p.invuln, 0.4);
    const ax = p.aim.dx;
    const az = p.aim.dz;
    for (let k = 0; k < 3; k++) {
      after(0.1 + k * 0.09, () => {
        const pl = G.player;
        if (!pl.alive) return;
        spawnProjectile({ from: 'player', x: pl.x + ax * 0.5, z: pl.z + az * 0.5, dx: ax, dz: az, speed: 32, life: 0.55, mult: 1.2 * rankMult(r), color: C_('hunter'), size: 0.12, r: 0.24, pierce: 1, homing: 3 });
        sfx.shoot();
      });
    }
    sfx.dash();
    return true;
  },
  phantomArrow(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 38, life: 0.6, mult: 4.2 * rankMult(r), color: 0xffd0e0, size: 0.28, r: 0.55, pierce: 40, knock: 5 });
    ringFx(p.x, p.z, 1.4, C_('hunter'), 0.3);
    G.shake = Math.max(G.shake, 0.2);
    sfx.laser();
    p.swing = 1;
    return true;
  },
  predator(p) {
    p.buffs.overclock = 8;
    ringFx(p.x, p.z, 2.5, C_('hunter'), 0.5);
    burst(p.x, 1, p.z, C_('hunter'), 25, 5, 0.08, 0.6);
    sfx.levelup();
    return true;
  },
  arrowStorm: (p, r) => (PW.bulletRing(p, 6, 20, 0.8 * rankMult(r), C_('hunter')), true),

  // Valquíria
  thrust(p, r) {
    p.combo = (p.combo + 1) % 3;
    const big = p.combo === 2;
    const range = big ? 3.0 : 2.7;
    const hits = enemiesInCone(p.x, p.z, p.aim.dx, p.aim.dz, range, 0.6);
    for (const e of hits) hitEnemy(e, (big ? 1.4 : 1.0) * 1.15 * rankMult(r), { knock: big ? 3 : 1, energy: 4 });
    if (big && hits.length) chainFrom(hits[0], 2, 0.6 * rankMult(r), 5, C_('lancer'), true);
    for (let k = 0.6; k < range; k += 0.35) particle(p.x + p.aim.dx * k, 1, p.z + p.aim.dz * k, p.aim.dx * 2, 0, p.aim.dz * 2, C_('lancer'), big ? 0.12 : 0.08, 0.22, 0, 2);
    slashFx(p.x, p.z, angleOf(p.aim.dx, p.aim.dz), range, 0.5, C_('lancer'), 0.95);
    if (big) sfx.zap();
    sfx.slash();
    p.swing = 1;
    return true;
  },
  spearCharge(p, r) {
    const reach = p.aimEnemy ? Math.min(7, Math.hypot(p.aimEnemy.x - p.x, p.aimEnemy.z - p.z) + 1.5) : 7;
    p.dash = { dx: p.aim.dx, dz: p.aim.dz, speed: 30, t: reach / 30, hit: new Set(), mult: 1.7 * rankMult(r), radius: 1.1, color: C_('lancer'), stun: 0.8 };
    p.invuln = Math.max(p.invuln, 0.3);
    sfx.dash();
    return true;
  },
  javelin(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, y: 1.2, dx: p.aim.dx, dz: p.aim.dz, speed: 30, life: 0.6, mult: 2.2 * rankMult(r), color: C_('lancer'), size: 0.17, r: 0.3, pierce: 3, knock: 3, onHit: (e) => chainFrom(e, 2, 0.6 * rankMult(r), 5, C_('lancer'), true) });
    sfx.zap();
    p.swing = 1;
    return true;
  },
  thunderfall(p, r) {
    const d = G.dungeon;
    const t = PW.aimPoint(p, 8);
    let tx = t.x;
    let tz = t.z;
    for (let k = 0; k <= 20 && !isWalkable(d, tx, tz); k++) {
      tx = p.x + (t.x - p.x) * (1 - k / 20);
      tz = p.z + (t.z - p.z) * (1 - k / 20);
    }
    p.leap = { sx: p.x, sz: p.z, tx, tz, t: 0, dur: 0.5, mult: 2.8 * rankMult(r), color: C_('lancer'), radius: 3 };
    p.invuln = Math.max(p.invuln, 0.6);
    after(0.5, () => beamFx(tx, 12, tz, tx, 0.2, tz, 0xe0c8ff, 0.3, 6));
    sfx.dash();
    return true;
  },
  spearOrbit: (p, r) => (PW.orbitBlades(3, 0.9 * rankMult(r), C_('lancer'), 8, { radius: 2.2 }), true),
  voltChain: (p, r) => PW.chainLightningFrom(p, 8, 1.3 * rankMult(r), 0xd0a0ff),
  valk: (p, r) => (PW.spawnAlly('valk', p.x + p.aim.dx * 1.2, p.z + p.aim.dz * 1.2, { dur: 18, mult: 1.4 * rankMult(r) }), sfx.zap(), true),
  skyStorm: (p, r) => (PW.lightningStorm(6, 4, 1.3 * rankMult(r), 0xd0a0ff), true),
  zeus: (p, r) => {
    PW.pillars(p, 10, 2.4 * rankMult(r), 0xd0a0ff, { slow: 1 });
    const sx = p.x;
    const sz = p.z;
    const dx = p.aim.dx;
    const dz = p.aim.dz;
    for (let k = 1; k <= 10; k++) {
      after(k * 0.07, () => {
        const x = sx + dx * k * 1.15;
        const z = sz + dz * k * 1.15;
        if (!isWalkable(G.dungeon, x, z)) return;
        beamFx(x + rr(-0.5, 0.5), 10, z + rr(-0.5, 0.5), x, 0.2, z, 0xe0c8ff, 0.18, 5);
        for (const e of enemiesInRadius(x, z, 1.3)) if (!e.boss) e.stun = Math.max(e.stun, e.heavy ? 0.4 : 0.8);
      });
    }
    sfx.zap();
    G.shake = Math.max(G.shake, 0.3);
    return true;
  },

  // Biohacker
  dart(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 26, life: 0.45, mult: 0.75 * rankMult(r), color: C_('biohacker'), size: 0.08, r: 0.22, homing: 3.5, burn: 0.3 });
    sfx.shoot();
    p.swing = 1;
    return true;
  },
  toxCloud(p, r) {
    const t = targetPoint(p, 8);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.5, color: C_('biohacker'), onLand: (x, z) => {
      spawnHazard(x, z, 2.6, 5, 0, { faction: 'player', mult: 0.3 * rankMult(r), burn: 0.35, slow: 1, color: C_('biohacker'), opacity: 0.4 });
      burst(x, 0.6, z, C_('biohacker'), 30, 3, 0.12, 0.9, { up: 0.5, grav: -1 });
      sfx.explode();
    } });
    p.swing = 1;
    return true;
  },
  nanoHeal(p, r) {
    healPlayer(p.stats.maxHp * (0.08 + 0.01 * r));
    p.buffs.regen = 6;
    ringFx(p.x, p.z, 1.8, 0x39ff88, 0.5);
    burst(p.x, 1, p.z, 0x39ff88, 24, 3, 0.06, 0.7, { up: 1.5, grav: -1 });
    sfx.heal();
    return true;
  },
  plague(p, r) {
    const t = targetPoint(p, 9);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.5, color: C_('biohacker'), onLand: (x, z) => {
      explosion(x, z, 3.5, 1.6 * rankMult(r), { color: C_('biohacker'), burn: 0.8, slow: 2, knock: 1 });
      burst(x, 0.6, z, 0x6aff2a, 30, 4, 0.14, 1, { up: 0.6, grav: -1 });
    } });
    p.swing = 1;
    return true;
  },
  nanoSwarm(p, r) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      after(k * 0.04, () => {
        const pl = G.player;
        spawnProjectile({ from: 'player', x: pl.x + Math.cos(a) * 0.8, z: pl.z + Math.sin(a) * 0.8, y: 1.3, dx: Math.cos(a), dz: Math.sin(a), speed: 10, life: 2.4, mult: 0.75 * rankMult(r), color: C_('biohacker'), size: 0.11, r: 0.25, homing: 6, burn: 0.3 });
      });
    }
    sfx.deploy();
    return true;
  },
  adrenal(p) {
    p.buffs.haste = 8;
    ringFx(p.x, p.z, 2, C_('biohacker'), 0.45);
    burst(p.x, 1, p.z, C_('biohacker'), 20, 4, 0.07, 0.5, { up: 1.2 });
    sfx.stim();
    return true;
  },
  mutant: (p, r) => (PW.spawnAlly('mutant', p.x + p.aim.dx * 1.5, p.z + p.aim.dz * 1.5, { dur: 18, mult: 2.0 * rankMult(r) }), sfx.punchHeavy(), true),
  quarantine(p, r) {
    spawnHazard(p.x, p.z, 4.5, 7, 0, { faction: 'player', mult: 0.5 * rankMult(r), burn: 0.5, slow: 2, color: C_('biohacker'), opacity: 0.35 });
    ringFx(p.x, p.z, 4.5, C_('biohacker'), 0.6, { from: 0.5 });
    sfx.nova();
    return true;
  },
  pandemic(p, r) {
    const list = enemiesInRadius(p.x, p.z, 12).filter((e) => lineOfSight(G.dungeon, p.x, p.z, e.x, e.z));
    list.forEach((e, k) => after(k * 0.03, () => {
      if (!e.alive) return;
      beamFx(p.x, 1.2, p.z, e.x, e.height * 0.6, e.z, C_('biohacker'), 0.25, 4);
      hitEnemy(e, 2.2 * rankMult(r), { burn: 1.2, slow: 3, knock: 1.5 });
      burst(e.x, 1, e.z, 0x6aff2a, 8, 3, 0.1, 0.6, { grav: -1 });
    }));
    ringFx(p.x, p.z, 12, C_('biohacker'), 0.7, { from: 0.1 });
    G.shake = Math.max(G.shake, 0.3);
    sfx.nova();
    return true;
  },
});

// ---------------- Poderes avançados (níveis 40–70) ----------------
// Raio em linha reta até a parede (como o Canhão Ferroviário)
function lineBeam(p, maxLen, width, mult, color, o = {}) {
  const d = G.dungeon;
  let len = 0;
  while (len < maxLen && (o.through || isWalkable(d, p.x + p.aim.dx * len, p.z + p.aim.dz * len))) len += 0.25;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const rx = e.x - p.x;
    const rz = e.z - p.z;
    const along = rx * p.aim.dx + rz * p.aim.dz;
    const across = Math.abs(-rx * p.aim.dz + rz * p.aim.dx);
    if (along > 0 && along < len + e.r && across < width + e.r) hitEnemy(e, mult, { knock: o.knock ?? 3, stun: o.stun, burn: o.burn, freeze: o.freeze, slow: o.slow });
  }
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(2.4)), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, width * 0.6, len).translate(0, 0, len / 2), mat);
  beam.position.set(p.x, 1, p.z);
  beam.lookAt(p.x + p.aim.dx, 1, p.z + p.aim.dz);
  tempMesh(beam, 0.4, (e, k) => {
    mat.opacity = 1 - k;
    beam.scale.set(1 - k * 0.8, 1 - k * 0.8, 1);
  }).disposeGeo = true;
  for (let k = 0; k < len; k += 0.8) burst(p.x + p.aim.dx * k, 1, p.z + p.aim.dz * k, color, 2, 2, 0.07, 0.45);
  G.shake = Math.max(G.shake, 0.25);
  p.swing = 1;
  return len;
}

// Rajada em cone à frente (sopro, jato, gancho)
function coneBlast(p, range, arc, mult, color, o = {}) {
  for (const e of enemiesInCone(p.x, p.z, p.aim.dx, p.aim.dz, range, arc)) {
    if (lineOfSight(G.dungeon, p.x, p.z, e.x, e.z)) hitEnemy(e, mult, o);
  }
  const a0 = angleOf(p.aim.dx, p.aim.dz);
  slashFx(p.x, p.z, a0, range, arc, color, 0.6);
  for (let k = 0; k < 28; k++) {
    const a = a0 + rr(-arc / 2, arc / 2);
    const sp = rr(range * 1.4, range * 2.4);
    particle(p.x + p.aim.dx * 0.6, 0.9, p.z + p.aim.dz * 0.6, Math.cos(a) * sp, rr(0, 1), Math.sin(a) * sp, color, rr(0.1, 0.2), rr(0.3, 0.45), -1, 1.5);
  }
  p.swing = 1;
}

// Defesas: menos dano recebido, cura por segundo, esquiva e roubo de vida (contados em player.js/combat.js)
function guard(p, t, taken, color) {
  p.guardK = p.buffs.guard > 0 ? Math.min(p.guardK ?? 1, taken) : taken;
  p.buffs.guard = Math.max(p.buffs.guard || 0, t);
  ringFx(p.x, p.z, 1.7, color, 0.45);
  burst(p.x, 1, p.z, color, 24, 4, 0.07, 0.5);
  sfx.shieldBlock();
}
function mend(p, t, rate) {
  p.mendRate = p.buffs.mend > 0 ? Math.max(p.mendRate || 0, rate) : rate;
  p.buffs.mend = Math.max(p.buffs.mend || 0, t);
}
function evade(p, t, chance) {
  p.evadeK = p.buffs.evade > 0 ? Math.max(p.evadeK || 0, chance) : chance;
  p.buffs.evade = Math.max(p.buffs.evade || 0, t);
}
const leech = (p, t) => (p.buffs.leech = Math.max(p.buffs.leech || 0, t));
// aura que causa dano ao redor a cada 0,5s
function aura(p, t, radius, mult, color, o = {}) {
  p.aura = { t, tick: 0, r: radius, mult, color, burn: o.burn, slow: o.slow, petals: o.petals };
}
export function updateAura(p, dt) {
  const a = p.aura;
  if (!a) return;
  a.t -= dt;
  a.tick -= dt;
  if (a.tick <= 0) {
    a.tick = 0.5;
    for (const e of enemiesInRadius(p.x, p.z, a.r)) hitEnemy(e, a.mult, { burn: a.burn, slow: a.slow, noProc: true, quiet: true, knock: 0.3 });
    ringFx(p.x, p.z, a.r, a.color, 0.4, { from: a.r * 0.5 });
  }
  if (Math.random() < dt * 20) burst(p.x + rr(-a.r, a.r) * 0.7, 0.2, p.z + rr(-a.r, a.r) * 0.7, a.color, 1, 1, 0.07, 0.5, { grav: -2 });
  // Tempestade de Pétalas: pétalas girando em volta
  if (a.petals) {
    for (let k = 0; k < 3; k++) {
      const ang = G.t * 4 + k * 2.09 + rr(-0.4, 0.4);
      const rad = rr(1, a.r);
      particle(p.x + Math.cos(ang) * rad, rr(0.3, 1.8), p.z + Math.sin(ang) * rad, -Math.sin(ang) * 7, rr(-0.5, 0.5), Math.cos(ang) * 7, k ? a.color : 0xffffff, rr(0.07, 0.12), 0.35, 0, 0);
    }
  }
  if (a.t <= 0) p.aura = null;
}
function bigHeal(p, frac, color) {
  healPlayer(p.stats.maxHp * frac);
  ringFx(p.x, p.z, 2, color, 0.5, { from: 0.4 });
  burst(p.x, 1, p.z, color, 30, 4, 0.08, 0.7, { up: 1 });
  sfx.levelup();
}

Object.assign(SKILL_FN, {
  // Lâmina
  crescent(p, r) {
    const base = angleOf(p.aim.dx, p.aim.dz);
    for (let k = -1; k <= 1; k++) {
      const a = base + k * 0.22;
      spawnProjectile({ from: 'player', x: p.x + Math.cos(a) * 0.5, z: p.z + Math.sin(a) * 0.5, dx: Math.cos(a), dz: Math.sin(a), speed: 20, life: 0.6, mult: 2.2 * rankMult(r), color: C_('blade'), size: 0.3, r: 0.6, pierce: 99, knock: 4 });
    }
    slashFx(p.x, p.z, base, 2.2, Math.PI * 0.9, C_('blade'), 0.7);
    sfx.slash();
    p.swing = 1;
    return true;
  },
  mirrorStance(p, r) {
    const t = dur(3, r);
    guard(p, t, 0.25, 0xffffff);
    after(t, () => {
      const pl = G.player;
      if (!pl || !pl.alive) return;
      for (const e of enemiesInRadius(pl.x, pl.z, 3.5)) hitEnemy(e, 2.5 * rankMult(r), { knock: 5, kx: pl.x, kz: pl.z });
      slashFx(pl.x, pl.z, 0, 3.5, Math.PI * 2, C_('blade'), 0.7);
      ringFx(pl.x, pl.z, 3.5, C_('blade'), 0.4, { from: 1 });
      sfx.slash();
    });
    return true;
  },
  dragonSlash(p, r) {
    lineBeam(p, 14, 0.9, 4.5 * rankMult(r), C_('blade'), { knock: 5, burn: 0.5 });
    slashFx(p.x, p.z, angleOf(p.aim.dx, p.aim.dz), 2.4, Math.PI, C_('blade'), 0.7);
    sfx.slash();
    sfx.laser();
    return true;
  },
  zenBreath(p, r) {
    bigHeal(p, healF(0.25, r), C_('blade'));
    mend(p, 5, 0.04);
    p.en = Math.min(p.stats.maxEn, p.en + 30);
    return true;
  },

  // Atiradora
  ricochet(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 30, life: 0.6, mult: 2.0 * rankMult(r), color: 0xffee55, size: 0.15, r: 0.26, homing: 6, onHit: (e) => chainFrom(e, 5, 1.2 * rankMult(r), 7, C_('gunner')) });
    sfx.shoot();
    p.swing = 1;
    return true;
  },
  smokeBomb(p, r) {
    const t = dur(4, r);
    evade(p, t, 60);
    p.invuln = Math.max(p.invuln, 0.6);
    spawnHazard(p.x, p.z, 3.5, t, 0, { faction: 'player', mult: 0.1, slow: 1.5, color: 0x8899aa, opacity: 0.4 });
    burst(p.x, 0.8, p.z, 0xaabbcc, 40, 4, 0.2, 0.9, { up: 0.6 });
    sfx.dash();
    return true;
  },
  leadStorm(p, r) {
    for (let k = 0; k < 24; k++) {
      after(k * 0.05, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        const a = angleOf(pl.aim.dx, pl.aim.dz) + rr(-0.35, 0.35);
        pl.hand = 1 - pl.hand;
        spawnProjectile({ from: 'player', x: pl.x + Math.cos(a) * 0.5, z: pl.z + Math.sin(a) * 0.5, dx: Math.cos(a), dz: Math.sin(a), speed: 26, life: 0.6, mult: 0.9 * rankMult(r), color: C_('gunner'), size: 0.1, r: 0.22, homing: 5, quiet: true });
        pl.swing = 1;
        if (k % 2) sfx.shoot();
      });
    }
    return true;
  },
  reboot(p, r) {
    bigHeal(p, healF(0.3, r), C_('gunner'));
    p.shield = Math.max(p.shield, p.stats.maxHp * 0.25);
    return true;
  },

  // Netrunner
  dataLance(p, r) {
    lineBeam(p, 16, 0.7, 4.0 * rankMult(r), C_('netrunner'), { stun: 1.2 });
    sfx.laser();
    return true;
  },
  firewall(p, r) {
    const t = dur(6, r);
    guard(p, t, 0.5, C_('netrunner'));
    aura(p, t, 3, 0.4 * rankMult(r), C_('netrunner'), { slow: 1 });
    return true;
  },
  logicBomb(p, r) {
    const t = targetPoint(p, 10);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.55, color: C_('netrunner'), onLand: (x, z) => {
      explosion(x, z, 4, 4.5 * rankMult(r), { color: C_('netrunner'), stun: 1.5, knock: 4 });
      after(0.6, () => explosion(x, z, 2.5, 2.0 * rankMult(r), { color: 0x9d4dff, small: true, noProc: true }));
    } });
    p.swing = 1;
    return true;
  },
  sysBackup(p, r) {
    bigHeal(p, healF(0.35, r), C_('netrunner'));
    p.en = Math.min(p.stats.maxEn, p.en + p.stats.maxEn * 0.5);
    p.invuln = Math.max(p.invuln, 1.5);
    return true;
  },

  // Punho de Aço
  uppercut(p, r) {
    coneBlast(p, 3.6, Math.PI * 0.55, 4.0 * rankMult(r), C_('brawler'), { knock: 9, stun: 1.2 });
    ringFx(p.x + p.aim.dx * 1.5, p.z + p.aim.dz * 1.5, 1.8, C_('brawler'), 0.35);
    G.shake = Math.max(G.shake, 0.35);
    sfx.punchHeavy();
    return true;
  },
  steelSkin(p, r) {
    const t = dur(6, r);
    guard(p, t, 0.4, 0xc8d0e0);
    leech(p, t);
    return true;
  },
  fistFury(p, r) {
    for (let k = 0; k <= 10; k++) {
      after(k * 0.1, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        const last = k === 10;
        const range = last ? 2.6 : 2.2;
        for (const e of enemiesInCone(pl.x, pl.z, pl.aim.dx, pl.aim.dz, range, Math.PI * 0.5)) hitEnemy(e, (last ? 3.0 : 1.0) * rankMult(r), { knock: last ? 8 : 0.6, stun: last ? 0.6 : 0, noProc: !last && k % 3 !== 0, quiet: !last });
        burst(pl.x + pl.aim.dx * 1.2 + rr(-0.4, 0.4), 0.9 + rr(-0.3, 0.3), pl.z + pl.aim.dz * 1.2 + rr(-0.4, 0.4), C_('brawler'), last ? 16 : 5, 3, 0.06, 0.25);
        pl.swing = 1;
        pl.hand = 1 - pl.hand;
        if (last) {
          ringFx(pl.x + pl.aim.dx * 1.3, pl.z + pl.aim.dz * 1.3, 1.6, C_('brawler'), 0.3);
          G.shake = Math.max(G.shake, 0.3);
          sfx.punchHeavy();
        } else sfx.punch();
      });
    }
    return true;
  },
  secondWind(p, r) {
    bigHeal(p, healF(0.25, r), C_('brawler'));
    mend(p, 4, 0.05);
    for (const e of enemiesInRadius(p.x, p.z, 4)) hitEnemy(e, 1.0 * rankMult(r), { knock: 9, noProc: true });
    ringFx(p.x, p.z, 4, C_('brawler'), 0.4, { from: 0.5 });
    return true;
  },

  // Incendiária
  dragonBreath(p, r) {
    coneBlast(p, 6, Math.PI * 0.42, 3.0 * rankMult(r), C_('pyro'), { burn: 0.8, knock: 2 });
    sfx.flame();
    sfx.explode();
    return true;
  },
  flameMantle(p, r) {
    const t = dur(8, r);
    guard(p, t, 0.6, 0xff6a00);
    aura(p, t, 2.8, 0.5 * rankMult(r), 0xff6a00, { burn: 0.5 });
    return true;
  },
  sunfall(p, r) {
    const t = targetPoint(p, 10);
    ringFx(t.x, t.z, 5, 0xffaa00, 0.9);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.9, color: 0xffaa00, onLand: (x, z) => {
      explosion(x, z, 5, 6.0 * rankMult(r), { color: 0xff6a00, burn: 1.0, knock: 8 });
      ringFx(x, z, 6, 0xffee88, 0.6, { from: 1 });
      spawnHazard(x, z, 4, 6, 0, { faction: 'player', mult: 0.4 * rankMult(r), burn: 0.5, color: 0xff5500, opacity: 0.4 });
      G.shake = Math.max(G.shake, 0.55);
    } });
    p.swing = 1;
    return true;
  },
  cauterize(p, r) {
    bigHeal(p, healF(0.3, r), 0xff6a00);
    p.invuln = Math.max(p.invuln, 1);
    explosion(p.x, p.z, 3.5, 1.5 * rankMult(r), { color: 0xff4422, burn: 0.6, knock: 6, noProc: true });
    return true;
  },

  // Geada
  iceLance(p, r) {
    lineBeam(p, 16, 0.7, 4.0 * rankMult(r), C_('frost'), { freeze: 1.5, slow: 2 });
    sfx.cryo();
    return true;
  },
  iceBlock(p, r) {
    const t = 2 + 0.1 * r;
    p.invuln = Math.max(p.invuln, t);
    mend(p, t, 0.08);
    for (const e of enemiesInRadius(p.x, p.z, 3.5)) hitEnemy(e, 0.5 * rankMult(r), { freeze: 2, noProc: true });
    ringFx(p.x, p.z, 3.5, 0xddeeff, 0.5, { from: 0.5 });
    burst(p.x, 1, p.z, 0xddeeff, 40, 4, 0.1, 0.8);
    sfx.cryo();
    return true;
  },
  glacialNova(p, r) {
    explosion(p.x, p.z, 6, 3.5 * rankMult(r), { color: C_('frost'), freeze: 2, knock: 4 });
    const x = p.x;
    const z = p.z;
    after(0.4, () => {
      for (const e of enemiesInRadius(x, z, 8)) hitEnemy(e, 1.5 * rankMult(r), { slow: 3, noProc: true, kx: x, kz: z });
      ringFx(x, z, 8, 0xddeeff, 0.5, { from: 3 });
    });
    sfx.cryo();
    G.shake = Math.max(G.shake, 0.4);
    return true;
  },
  winterAura(p, r) {
    const t = dur(8, r);
    guard(p, t, 0.5, C_('frost'));
    mend(p, t, 0.02);
    aura(p, t, 3.5, 0.35 * rankMult(r), 0xddeeff, { slow: 1.5 });
    sfx.cryo();
    return true;
  },

  // Colosso
  plasmaCannon(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.7, z: p.z + p.aim.dz * 0.7, y: 1.2, dx: p.aim.dx, dz: p.aim.dz, speed: 14, life: 0.9, mult: 1.0 * rankMult(r), color: 0x66eaff, size: 0.4, r: 0.6, homing: 1, blast: { r: 4, mult: 5.0 * rankMult(r) } });
    sfx.laser();
    G.shake = Math.max(G.shake, 0.2);
    p.swing = 1;
    return true;
  },
  bunker(p, r) {
    const t = dur(5, r);
    guard(p, t, 0.3, C_('heavy'));
    spawnBarrier(p.x + p.aim.dx * 1.6, p.z + p.aim.dz * 1.6, -p.aim.dz, p.aim.dx, 2, t);
    sfx.deploy();
    return true;
  },
  carpetBomb(p, r) {
    const dx = p.aim.dx;
    const dz = p.aim.dz;
    const sx = p.x;
    const sz = p.z;
    for (let k = 1; k <= 10; k++) {
      const x = sx + dx * k * 1.5;
      const z = sz + dz * k * 1.5;
      if (!isWalkable(G.dungeon, x, z)) break;
      after(0.25 + k * 0.08, () => explosion(x, z, 2, 2.6 * rankMult(r), { color: 0xff8800, small: true, noProc: k % 2 === 0 }));
    }
    sfx.enemyShot();
    return true;
  },
  repairDrones(p, r) {
    bigHeal(p, healF(0.2, r), C_('heavy'));
    mend(p, 6, 0.04);
    p.shield = Math.max(p.shield, p.stats.maxHp * 0.2);
    return true;
  },

  // Caçadora
  volley(p, r) {
    for (let w = 0; w < 3; w++) {
      after(w * 0.15, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        const base = angleOf(pl.aim.dx, pl.aim.dz);
        for (let k = -4; k <= 4; k++) {
          const a = base + k * 0.12;
          spawnProjectile({ from: 'player', x: pl.x + Math.cos(a) * 0.5, z: pl.z + Math.sin(a) * 0.5, dx: Math.cos(a), dz: Math.sin(a), speed: 30, life: 0.5, mult: 0.9 * rankMult(r), color: C_('hunter'), size: 0.1, r: 0.22, pierce: 2, quiet: true });
        }
        pl.swing = 1;
        sfx.shoot();
      });
    }
    return true;
  },
  camo(p, r) {
    evade(p, dur(4, r), 70);
    p.invuln = Math.max(p.invuln, 0.5);
    spawnDecoy(p.x, p.z, dur(4, r), (x, z) => explosion(x, z, 3, 2.0 * rankMult(r), { color: C_('hunter') }));
    ghostFx(p.model, C_('hunter'));
    sfx.dash();
    return true;
  },
  blastArrow(p, r) {
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, dx: p.aim.dx, dz: p.aim.dz, speed: 30, life: 0.6, mult: 1.0 * rankMult(r), color: 0xff6a00, size: 0.16, r: 0.3, homing: 3, blast: { r: 3.5, mult: 4.5 * rankMult(r), burn: 0.6 } });
    sfx.shoot();
    p.swing = 1;
    return true;
  },
  herbs(p, r) {
    bigHeal(p, healF(0.3, r), 0x6aff8a);
    mend(p, 8, 0.03);
    leech(p, 8);
    return true;
  },

  // Lanceira
  skyLance(p, r) {
    lineBeam(p, 15, 0.8, 4.0 * rankMult(r), C_('lancer'), { knock: 4 });
    PW.chainLightningFrom(p, 3, 1.0 * rankMult(r), 0x88ccff);
    sfx.zap();
    return true;
  },
  odinWall(p, r) {
    const t = dur(5, r);
    guard(p, t, 0.35, C_('lancer'));
    PW.plasmaShield(p, t, 0.15, C_('lancer'));
    return true;
  },
  ragnarok(p, r) {
    const t = PW.aimPoint(p, 10);
    PW.meteorShower(t.x, t.z, 16, 2.2 * rankMult(r), 0xb36bff, { gap: 0.1 });
    sfx.zap();
    return true;
  },
  valkBless(p, r) {
    bigHeal(p, healF(0.3, r), 0xffe08a);
    mend(p, 6, 0.03);
    guard(p, 6, 0.6, 0xffe08a);
    return true;
  },

  // Biohacker
  acidSpray(p, r) {
    coneBlast(p, 5.5, Math.PI * 0.38, 2.6 * rankMult(r), C_('biohacker'), { burn: 0.9, slow: 2, knock: 1 });
    sfx.flame();
    return true;
  },
  cocoon(p, r) {
    const t = dur(5, r);
    guard(p, t, 0.5, C_('biohacker'));
    mend(p, t, 0.05);
    return true;
  },
  bioBomb(p, r) {
    const t = targetPoint(p, 10);
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.55, color: C_('biohacker'), onLand: (x, z) => {
      explosion(x, z, 4.5, 4.0 * rankMult(r), { color: C_('biohacker'), burn: 0.8, knock: 4 });
      spawnHazard(x, z, 4, 6, 0, { faction: 'player', mult: 0.45 * rankMult(r), burn: 0.5, slow: 1.5, color: C_('biohacker'), opacity: 0.35 });
    } });
    p.swing = 1;
    return true;
  },
  adaptSkin(p, r) {
    const t = dur(8, r);
    guard(p, t, 0.5, C_('biohacker'));
    evade(p, t, 30);
    leech(p, t);
    return true;
  },
});

// Usado pelas torres e para escolher alvos automáticos
// ---------------- Ataques supremos (níveis 76–100) ----------------
// inimigos vivos perto do segmento (x1, z1)–(x2, z2)
function enemiesOnSegment(x1, z1, x2, z2, w) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz || 1;
  return G.enemies.filter((e) => {
    if (!e.alive) return false;
    const t = clamp(((e.x - x1) * dx + (e.z - z1) * dz) / l2, 0, 1);
    return Math.hypot(e.x - x1 - dx * t, e.z - z1 - dz * t) < w + e.r;
  });
}
// risco reto de luz entre dois pontos
function streakFx(x1, z1, x2, z2, color, w = 0.25, life = 0.35, y = 1) {
  const len = Math.hypot(x2 - x1, z2 - z1) || 0.1;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(2.4)), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.4, len), mat);
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.lookAt(x2, y, z2);
  tempMesh(m, life, (e, k) => {
    mat.opacity = 1 - k;
    m.scale.x = 1 + k * 2;
  }).disposeGeo = true;
}

Object.assign(SKILL_FN, {
  // Lâmina
  petalStorm(p, r) {
    aura(p, 6, 4.5, 1.2 * rankMult(r), 0xff7ad9, { slow: 1, petals: true });
    ringFx(p.x, p.z, 4.5, 0xff7ad9, 0.5, { from: 1 });
    burst(p.x, 1, p.z, 0xffc2ee, 30, 6, 0.08, 0.6);
    sfx.spin();
    return true;
  },
  iaijutsu(p, r) {
    const sx = p.x;
    const sz = p.z;
    const dx = p.aim.dx;
    const dz = p.aim.dz;
    let len = 0;
    while (len < 10 && isWalkable(G.dungeon, sx + dx * (len + 0.25), sz + dz * (len + 0.25))) len += 0.25;
    const ex = sx + dx * len;
    const ez = sz + dz * len;
    const hits = enemiesOnSegment(sx, sz, ex, ez, 1.2);
    ghostFx(p.model, C_('blade'));
    p.x = ex;
    p.z = ez;
    p.path = null;
    p.target = null;
    p.dash = null;
    p.invuln = Math.max(p.invuln, 0.6);
    streakFx(sx, sz, ex, ez, 0xffffff, 0.1, 0.55);
    streakFx(sx, sz, ex, ez, C_('blade'), 0.45, 0.4);
    sfx.dash();
    // o corte chega um instante depois (a lâmina volta à bainha)
    after(0.35, () => {
      let n = 0;
      for (const e of hits) {
        if (!e.alive) continue;
        n++;
        hitEnemy(e, 5.0 * rankMult(r), { forceCrit: true, knock: 3, kx: sx, kz: sz });
        slashFx(e.x, e.z, angleOf(dx, dz) + rr(-0.6, 0.6), 1.8, Math.PI * 0.5, C_('blade'), 0.5);
        burst(e.x, 1, e.z, 0xffffff, 8, 5, 0.06, 0.3);
      }
      if (n) {
        G.shake = Math.max(G.shake, 0.4);
        sfx.crit();
      }
      sfx.slash();
    });
    return true;
  },
  shadowClones(p, r) {
    const base = angleOf(p.aim.dx, p.aim.dz);
    for (let k = 0; k < 3; k++) {
      const a = base + (k - 1) * 1.3;
      let x = p.x + Math.cos(a) * 1.4;
      let z = p.z + Math.sin(a) * 1.4;
      if (!isWalkable(G.dungeon, x, z)) {
        x = p.x;
        z = p.z;
      }
      PW.spawnAlly('shade', x, z, { dur: 12, mult: 1.4 * rankMult(r) });
    }
    ghostFx(p.model, 0x9b4dff);
    sfx.nova();
    return true;
  },
  dimensionCut(p, r) {
    const t = targetPoint(p, 10);
    const a0 = angleOf(p.aim.dx, p.aim.dz);
    const col = 0xb36bff;
    telegraphFx(t.x, t.z, 6, 0.45, col);
    sfx.telegraph();
    p.swing = 1;
    after(0.45, () => {
      if (!G.player || !G.player.alive) return;
      for (const s of [1, -1]) {
        const a = a0 + (s * Math.PI) / 4;
        const cx = Math.cos(a) * 6;
        const cz = Math.sin(a) * 6;
        streakFx(t.x - cx, t.z - cz, t.x + cx, t.z + cz, 0xffffff, 0.14, 0.6);
        streakFx(t.x - cx, t.z - cz, t.x + cx, t.z + cz, col, 0.6, 0.45);
        for (const e of enemiesOnSegment(t.x - cx, t.z - cz, t.x + cx, t.z + cz, 1.1)) hitEnemy(e, 6.0 * rankMult(r), { knock: 2, kx: t.x, kz: t.z });
      }
      PW.blackHole(t.x, t.z, 3, 4.0 * rankMult(r), col);
      G.shake = Math.max(G.shake, 0.45);
      sfx.slash();
      sfx.laser();
    });
    return true;
  },

  // Atiradora
  railShot(p, r) {
    lineBeam(p, 30, 0.8, 6.5 * rankMult(r), 0xfff27a, { knock: 4, through: true });
    burst(p.x + p.aim.dx * 0.6, 1, p.z + p.aim.dz * 0.6, 0xffffff, 14, 6, 0.07, 0.3);
    G.shake = Math.max(G.shake, 0.35);
    sfx.laser();
    sfx.shoot();
    return true;
  },
  clusterGrenade(p, r) {
    const t = targetPoint(p, 10);
    const col = 0xff8a00;
    lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.6, color: col, onLand: (x, z) => {
      explosion(x, z, 3.5, 4.0 * rankMult(r), { color: col, knock: 6 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + rr(-0.3, 0.3);
        const d = rr(2.2, 4.2);
        let tx = x + Math.cos(a) * d;
        let tz = z + Math.sin(a) * d;
        if (!isWalkable(G.dungeon, tx, tz)) {
          tx = x + Math.cos(a) * d * 0.4;
          tz = z + Math.sin(a) * d * 0.4;
        }
        lob({ x, z, tx, tz, time: rr(0.35, 0.6), color: 0xffd23d, onLand: (bx, bz) => explosion(bx, bz, 2, 2.0 * rankMult(r), { color: 0xffd23d, small: true, noProc: true, knock: 3 }) });
      }
    } });
    p.swing = 1;
    return true;
  },
  bulletDance(p, r) {
    evade(p, 3, 50);
    for (let k = 0; k < 45; k++) {
      after(k * 0.066, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        const a = k * 0.55;
        for (const s of [0, Math.PI]) {
          const b = a + s;
          spawnProjectile({ from: 'player', x: pl.x + Math.cos(b) * 0.5, z: pl.z + Math.sin(b) * 0.5, dx: Math.cos(b), dz: Math.sin(b), speed: 22, life: 0.55, mult: 0.8 * rankMult(r), color: C_('gunner'), size: 0.1, r: 0.22, homing: 2, quiet: true });
        }
        pl.hand = 1 - pl.hand;
        pl.swing = 1;
        if (k % 3 === 0) sfx.shoot();
      });
    }
    ringFx(p.x, p.z, 2, C_('gunner'), 0.4);
    sfx.spin();
    return true;
  },
  orbitalCannon(p, r) {
    const t = targetPoint(p, 12);
    const col = 0x00f0ff;
    telegraphFx(t.x, t.z, 5, 1.2, col);
    sfx.telegraph();
    sfx.deploy();
    p.swing = 1;
    after(1.2, () => {
      if (!G.player || !G.player.alive) return;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbff8ff).multiplyScalar(gk(2.6)), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true), mat);
      beam.position.set(t.x, 15, t.z);
      tempMesh(beam, 0.8, (e, k) => {
        mat.opacity = 1 - k;
        beam.scale.set(1 - k * 0.7, 1, 1 - k * 0.7);
      }).disposeGeo = true;
      explosion(t.x, t.z, 5, 10 * rankMult(r), { color: col, knock: 9 });
      ringFx(t.x, t.z, 7, 0xffffff, 0.6, { from: 1 });
      spawnHazard(t.x, t.z, 4, 4, 0, { faction: 'player', mult: 0.5 * rankMult(r), burn: 0.5, color: col, opacity: 0.4 });
      G.shake = Math.max(G.shake, 0.7);
      sfx.laser();
    });
    return true;
  },
});

// punho gigante do Punho do Céu (geometria fundida em cache)
const heavenFistGeo = () => merged('heavenFist', (b) => {
  b(1.6, 1.3, 1.3, 0, 0, 0);
  for (let k = 0; k < 4; k++) b(0.36, 0.5, 0.5, -0.57 + k * 0.38, -0.8, 0.25);
  b(0.4, 0.8, 0.4, 0.95, -0.2, 0.3);
  b(1.1, 1.6, 1.0, 0, 1.4, 0);
});

Object.assign(SKILL_FN, {
  // Netrunner
  chainVirus(p, r) {
    const rm = rankMult(r);
    const col = 0x39ff14;
    // o vírus salta de inimigo em inimigo, um de cada vez
    const spread = (from, hit, left) => {
      if (left <= 0) return;
      const n = nearestEnemy(from.x, from.z, 8, true, hit);
      if (!n) return;
      hit.add(n);
      beamFx(from.x, (from.height || 1.6) * 0.6, from.z, n.x, n.height * 0.6, n.z, col, 0.3, 4);
      hitEnemy(n, 1.8 * rm, { burn: 1.0, slow: 1.5, noProc: true });
      burst(n.x, 1, n.z, col, 8, 3, 0.07, 0.4);
      after(0.08, () => spread(n, hit, left - 1));
    };
    spawnProjectile({ from: 'player', x: p.x + p.aim.dx * 0.5, z: p.z + p.aim.dz * 0.5, y: 1.2, dx: p.aim.dx, dz: p.aim.dz, speed: 24, life: 0.8, mult: 2.5 * rm, color: col, size: 0.22, r: 0.32, homing: 6, burn: 1.0, slow: 1.5, onHit: (e) => {
      spread(e, new Set([e]), 10);
      sfx.zap();
    } });
    sfx.orb();
    p.swing = 1;
    return true;
  },
  offFirewall(p, r) {
    const rm = rankMult(r);
    const col = C_('netrunner');
    const t = targetPoint(p, 7);
    const nx = -p.aim.dz;
    const nz = p.aim.dx;
    const half = 4;
    spawnBarrier(t.x, t.z, nx, nz, half, 6, col);
    const x1 = t.x - nx * half;
    const z1 = t.z - nz * half;
    const x2 = t.x + nx * half;
    const z2 = t.z + nz * half;
    const kx = p.x;
    const kz = p.z;
    for (let k = 0; k < 12; k++) {
      after(k * 0.5, () => {
        for (const e of enemiesOnSegment(x1, z1, x2, z2, 1.0)) hitEnemy(e, 1.3 * rm, { stun: 0.4, knock: 2.5, kx, kz, noProc: k % 2 === 1 });
        streakFx(x1, z1, x2, z2, col, 0.25, 0.35, 0.3);
        burst(t.x + nx * rr(-half, half), rr(0.3, 2), t.z + nz * rr(-half, half), col, 4, 2, 0.06, 0.4, { up: 1 });
      });
    }
    sfx.deploy();
    sfx.zap();
    p.swing = 1;
    return true;
  },
  droneArmy(p, r) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      let x = p.x + Math.cos(a) * 1.3;
      let z = p.z + Math.sin(a) * 1.3;
      if (!isWalkable(G.dungeon, x, z)) {
        x = p.x;
        z = p.z;
      }
      after(k * 0.08, () => PW.spawnAlly('drone', x, z, { dur: 15, mult: 0.8 * rankMult(r) }));
    }
    sfx.deploy();
    return true;
  },
  blackout(p, r) {
    const rm = rankMult(r);
    const col = C_('netrunner');
    // apaga os tiros inimigos
    for (const pr of G.projectiles) {
      if (pr.from !== 'enemy' || !pr.alive) continue;
      pr.alive = false;
      burst(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, col, 3, 2, 0.05, 0.3);
    }
    ringFx(p.x, p.z, 14, col, 0.8, { from: 0.5 });
    ringFx(p.x, p.z, 14, 0xffffff, 0.5, { from: 0.5 });
    burst(p.x, 1, p.z, col, 40, 10, 0.08, 0.7);
    const x = p.x;
    const z = p.z;
    after(0.25, () => {
      for (const e of enemiesInRadius(x, z, 14)) {
        hitEnemy(e, 5.0 * rm, { stun: 3, knock: 1, kx: x, kz: z });
        beamFx(e.x, 6, e.z, e.x, 0.2, e.z, col, 0.25, 4);
        burst(e.x, e.height * 0.7, e.z, 0x000000, 6, 2, 0.12, 0.6);
        burst(e.x, e.height * 0.7, e.z, col, 6, 3, 0.06, 0.4);
      }
      G.shake = Math.max(G.shake, 0.5);
      sfx.zap();
    });
    sfx.nova();
    return true;
  },

  // Punho de Aço
  tectonicRift(p, r) {
    const rm = rankMult(r);
    const col = C_('brawler');
    const base = angleOf(p.aim.dx, p.aim.dz);
    const sx = p.x;
    const sz = p.z;
    const hit = new Set();
    for (const off of [-0.4, 0, 0.4]) {
      const dx = Math.cos(base + off);
      const dz = Math.sin(base + off);
      for (let k = 1; k <= 7; k++) {
        const x = sx + dx * k * 1.45;
        const z = sz + dz * k * 1.45;
        if (!isWalkable(G.dungeon, x, z)) break;
        after(k * 0.07, () => {
          for (const e of enemiesInRadius(x, z, 1.5)) {
            if (hit.has(e)) continue;
            hit.add(e);
            hitEnemy(e, 3.5 * rm, { stun: 1.2, knock: 2, kx: sx, kz: sz });
          }
          burst(x, 0.3, z, 0xb8915a, 8, 4, 0.13, 0.6, { up: 2 });
          burst(x, 0.2, z, col, 5, 3, 0.07, 0.4, { up: 1 });
          ringFx(x, z, 1.2, col, 0.3);
        });
      }
    }
    ringFx(sx, sz, 2, col, 0.4);
    G.shake = Math.max(G.shake, 0.5);
    sfx.punchHeavy();
    sfx.explode();
    p.swing = 1;
    return true;
  },
  rocketHook(p, r) {
    const rm = rankMult(r);
    const col = C_('brawler');
    const dx = p.aim.dx;
    const dz = p.aim.dz;
    let len = 0;
    while (len < 12 && isWalkable(G.dungeon, p.x + dx * (len + 0.25), p.z + dz * (len + 0.25))) len += 0.25;
    const ex = p.x + dx * len;
    const ez = p.z + dz * len;
    streakFx(p.x, p.z, ex, ez, 0xffffff, 0.08, 0.5);
    streakFx(p.x, p.z, ex, ez, col, 0.3, 0.4);
    burst(ex, 1, ez, col, 14, 4, 0.08, 0.4);
    for (const e of enemiesOnSegment(p.x, p.z, ex, ez, 1.3)) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      // puxa: o empurrão vem de um ponto atrás do inimigo
      hitEnemy(e, 1.5 * rm, { knock: Math.min(12, Math.max(0, d - 1.4) * 1.6), kx: e.x + dx * 2, kz: e.z + dz * 2, stun: 0.8, noProc: true });
    }
    sfx.dash();
    sfx.zap();
    p.swing = 1;
    after(0.4, () => {
      const pl = G.player;
      if (!pl || !pl.alive) return;
      coneBlast(pl, 3.8, Math.PI * 0.6, 4.0 * rm, col, { knock: 7, stun: 1 });
      ringFx(pl.x + pl.aim.dx * 1.5, pl.z + pl.aim.dz * 1.5, 1.8, col, 0.35);
      G.shake = Math.max(G.shake, 0.4);
      sfx.punchHeavy();
    });
    return true;
  },
  hundredFists(p, r) {
    const rm = rankMult(r);
    const col = C_('brawler');
    guard(p, 2.6, 0.5, col);
    for (let k = 0; k <= 100; k++) {
      after(k * 0.025, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        const last = k === 100;
        const range = last ? 3 : 2.5;
        for (const e of enemiesInCone(pl.x, pl.z, pl.aim.dx, pl.aim.dz, range, Math.PI * 0.55)) hitEnemy(e, (last ? 5.0 : 0.45) * rm, { knock: last ? 9 : 0.15, stun: last ? 1 : 0, noProc: !last && k % 5 !== 0, quiet: !last });
        if (k % 2 === 0) burst(pl.x + pl.aim.dx * 1.2 + rr(-0.6, 0.6), 0.9 + rr(-0.4, 0.4), pl.z + pl.aim.dz * 1.2 + rr(-0.6, 0.6), k % 4 ? col : 0xffffff, last ? 20 : 3, 3, 0.06, 0.2);
        pl.swing = 1;
        pl.hand = 1 - pl.hand;
        if (last) {
          ringFx(pl.x + pl.aim.dx * 1.4, pl.z + pl.aim.dz * 1.4, 2, col, 0.35);
          G.shake = Math.max(G.shake, 0.45);
          sfx.punchHeavy();
        } else if (k % 3 === 0) sfx.punch();
      });
    }
    return true;
  },
  heavenFist(p, r) {
    const rm = rankMult(r);
    const col = C_('brawler');
    const t = targetPoint(p, 10);
    telegraphFx(t.x, t.z, 5.5, 1.0, col);
    sfx.telegraph();
    p.swing = 1;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffb060, emissive: new THREE.Color(col).multiplyScalar(gk(0.7)), transparent: true, opacity: 0.9 });
    const fist = new THREE.Mesh(heavenFistGeo(), mat);
    fist.position.set(t.x, 13, t.z);
    fist.scale.setScalar(1.2);
    fist.rotation.y = -angleOf(p.aim.dx, p.aim.dz) + Math.PI / 2;
    tempMesh(fist, 1.6, (e, k) => {
      const tt = k * 1.6;
      if (tt < 1) {
        fist.position.y = 13 - 11.5 * tt * tt;
        if (Math.random() < 0.6) burst(t.x + rr(-1, 1), fist.position.y + 2, t.z + rr(-1, 1), col, 2, 1, 0.1, 0.4, { grav: 0 });
      }
      else {
        fist.position.y = 1.5;
        mat.opacity = 0.9 * Math.max(0, 1 - (tt - 1) / 0.6);
      }
    });
    after(1.0, () => {
      if (!G.player || !G.player.alive) return;
      explosion(t.x, t.z, 5.5, 9.0 * rm, { color: col, stun: 2, knock: 10 });
      ringFx(t.x, t.z, 6, 0xffffff, 0.5, { from: 1 });
      burst(t.x, 0.4, t.z, 0xb8915a, 40, 8, 0.15, 0.9, { up: 3 });
      G.shake = Math.max(G.shake, 0.8);
      sfx.punchHeavy();
      after(0.25, () => {
        for (const e of enemiesInRadius(t.x, t.z, 9)) hitEnemy(e, 2.0 * rm, { knock: 6, kx: t.x, kz: t.z, noProc: true, quiet: true });
        ringFx(t.x, t.z, 9, col, 0.6, { from: 4 });
      });
    });
    return true;
  },
});

// geometrias em cache dos ataques supremos da Incendiária e da Geada
const sphereGeoA = new THREE.SphereGeometry(1, 12, 9);
const tornadoGeo = new THREE.CylinderGeometry(1.7, 0.3, 4.5, 14, 1, true).translate(0, 2.25, 0);
const iceCubeGeo = new THREE.BoxGeometry(1, 1, 1);
const iceSpikeGeo = new THREE.ConeGeometry(0.55, 2.8, 5).translate(0, 1.4, 0);
const snowWallGeo = new THREE.BoxGeometry(8, 1.8, 1.4).translate(0, 0.9, 0);
const addGlow = (color, k, op = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(k)), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
const iceMat = (op) => new THREE.MeshLambertMaterial({ color: 0xcfeeff, emissive: new THREE.Color(0x6aa8ff).multiplyScalar(gk(0.45)), transparent: true, opacity: op, depthWrite: false });

Object.assign(SKILL_FN, {
  // Incendiária
  fireWall(p, r) {
    const rm = rankMult(r);
    const col = C_('pyro');
    const t = targetPoint(p, 7);
    const nx = -p.aim.dz;
    const nz = p.aim.dx;
    const half = 5;
    for (const e of enemiesOnSegment(t.x - nx * half, t.z - nz * half, t.x + nx * half, t.z + nz * half, 1.2)) hitEnemy(e, 3.0 * rm, { burn: 1.2, knock: 3, kx: p.x, kz: p.z });
    for (let k = -2; k <= 2; k++) {
      const x = t.x + nx * k * 2.2;
      const z = t.z + nz * k * 2.2;
      if (!isWalkable(G.dungeon, x, z)) continue;
      spawnHazard(x, z, 1.3, 6, 0, { faction: 'player', mult: 0.7 * rm, burn: 1.0, color: col, opacity: 0.5 });
      burst(x, 0.4, z, 0xffb040, 12, 5, 0.1, 0.6, { up: 4 });
    }
    // labaredas subindo da muralha
    for (let k = 0; k < 24; k++) {
      after(k * 0.25, () => {
        for (let j = 0; j < 3; j++) {
          const u = rr(-half, half);
          burst(t.x + nx * u, 0.3, t.z + nz * u, pick([col, 0xffb040, 0xffe080]), 2, 1.5, rr(0.1, 0.18), 0.6, { grav: -6 });
        }
      });
    }
    streakFx(t.x - nx * half, t.z - nz * half, t.x + nx * half, t.z + nz * half, col, 0.8, 0.5, 0.4);
    G.shake = Math.max(G.shake, 0.3);
    sfx.flame();
    sfx.explode();
    p.swing = 1;
    return true;
  },
  flameDragon(p, r) {
    const rm = rankMult(r);
    const col = C_('pyro');
    const x0 = p.x;
    const z0 = p.z;
    const dx = p.aim.dx;
    const dz = p.aim.dz;
    const hit = new Set();
    const steps = 30;
    // o dragão serpenteia: cada passo deixa um gomo de fogo que some aos poucos
    for (let k = 0; k <= steps; k++) {
      after(k * 0.035, () => {
        if (!G.player || !G.player.alive) return;
        const along = 1 + (k / steps) * 17;
        const side = Math.sin(along * 0.55) * 2;
        const x = x0 + dx * along - dz * side;
        const z = z0 + dz * along + dx * side;
        const head = k === steps;
        const mat = addGlow(k % 2 ? col : 0xffa030, 2.2, 0.9);
        const m = new THREE.Mesh(sphereGeoA, mat);
        m.position.set(x, 1.2 + Math.sin(along) * 0.3, z);
        m.scale.setScalar(head ? 0.75 : 0.45);
        tempMesh(m, 0.6, (e, q) => {
          mat.opacity = 0.9 * (1 - q);
          m.scale.setScalar((head ? 0.75 : 0.45) * (1 - q * 0.6));
        });
        burst(x, 1.2, z, pick([col, 0xffd060]), 3, 2, 0.1, 0.4);
        for (const e of enemiesInRadius(x, z, 1.7)) {
          if (hit.has(e)) continue;
          hit.add(e);
          hitEnemy(e, 3.5 * rm, { burn: 2.0, knock: 2, kx: x - dx, kz: z - dz });
        }
        if (k % 6 === 0) sfx.flame();
        if (head) {
          explosion(x, z, 4, 3.0 * rm, { color: col, burn: 1.5, knock: 5 });
          sfx.roar();
        }
      });
    }
    p.swing = 1;
    return true;
  },
  fireTornado(p, r) {
    const rm = rankMult(r);
    const col = C_('pyro');
    const t = targetPoint(p, 8);
    const tor = { x: t.x, z: t.z, tick: 0, last: G.t };
    const g = new THREE.Group();
    const mats = [addGlow(col, 1.8, 0.55), addGlow(0xffc040, 2.2, 0.4)];
    const outer = new THREE.Mesh(tornadoGeo, mats[0]);
    const inner = new THREE.Mesh(tornadoGeo, mats[1]);
    inner.scale.set(0.6, 1.05, 0.6);
    g.add(outer, inner);
    g.position.set(t.x, 0, t.z);
    const dur = 8;
    tempMesh(g, dur, (fx, k) => {
      const dt = Math.min(0.1, Math.max(0, G.t - tor.last));
      tor.last = G.t;
      // anda na direção do inimigo mais próximo
      const n = nearestEnemy(tor.x, tor.z, 12, false);
      if (n) {
        const ddx = n.x - tor.x;
        const ddz = n.z - tor.z;
        const d = Math.hypot(ddx, ddz) || 1;
        const nx = tor.x + (ddx / d) * 3.2 * dt;
        const nz = tor.z + (ddz / d) * 3.2 * dt;
        if (isWalkable(G.dungeon, nx, nz)) {
          tor.x = nx;
          tor.z = nz;
        }
      }
      // puxa os inimigos próximos
      for (const e of enemiesInRadius(tor.x, tor.z, 5)) {
        if (e.boss || e.T.big) continue;
        const ex = tor.x - e.x;
        const ez = tor.z - e.z;
        const d = Math.hypot(ex, ez);
        if (d < 0.6) continue;
        const px = e.x + (ex / d) * 2.5 * dt;
        const pz = e.z + (ez / d) * 2.5 * dt;
        if (isWalkable(G.dungeon, px, pz)) {
          e.x = px;
          e.z = pz;
        }
      }
      tor.tick -= dt;
      if (tor.tick <= 0) {
        tor.tick = 0.25;
        for (const e of enemiesInRadius(tor.x, tor.z, 2.2)) hitEnemy(e, 0.9 * rm, { burn: 1.0, noProc: true, quiet: true, knock: 0 });
      }
      g.position.set(tor.x, 0, tor.z);
      outer.rotation.y += dt * 9;
      inner.rotation.y -= dt * 13;
      const fade = k < 0.06 ? k / 0.06 : k > 0.92 ? (1 - k) / 0.08 : 1;
      mats[0].opacity = 0.55 * fade;
      mats[1].opacity = 0.4 * fade;
      g.scale.set(1 + Math.sin(G.t * 7) * 0.08, fade, 1 + Math.cos(G.t * 7) * 0.08);
      if (Math.random() < 0.7) {
        const a = rr(0, Math.PI * 2);
        const h = rr(0.2, 4);
        const rad = 0.3 + h * 0.32;
        particle(tor.x + Math.cos(a) * rad, h, tor.z + Math.sin(a) * rad, -Math.sin(a) * 6, 2, Math.cos(a) * 6, pick([col, 0xffb040]), rr(0.08, 0.15), 0.4, -2, 0);
      }
    });
    ringFx(t.x, t.z, 3, col, 0.4, { from: 0.5 });
    sfx.flame();
    sfx.spin();
    p.swing = 1;
    return true;
  },
  solarNova(p, r) {
    const rm = rankMult(r);
    const col = 0xffb020;
    aura(p, 8, 5, 1.0 * rm, C_('pyro'), { burn: 1.2 });
    guard(p, 8, 0.7, col);
    // sol em miniatura sobre a cabeça
    const mat = addGlow(0xffd060, 2.4, 0.95);
    const sun = new THREE.Mesh(sphereGeoA, mat);
    tempMesh(sun, 8, (e, k) => {
      const pl = G.player;
      if (!pl) return;
      sun.position.set(pl.x, 3 + Math.sin(G.t * 3) * 0.2, pl.z);
      sun.scale.setScalar(0.55 + k * 0.5 + Math.sin(G.t * 10) * 0.05);
      if (Math.random() < 0.5) burst(pl.x + rr(-0.6, 0.6), 3, pl.z + rr(-0.6, 0.6), pick([col, 0xff4422]), 1, 2, 0.1, 0.4);
    });
    for (let k = 1; k <= 3; k++) {
      after(k * 2, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        explosion(pl.x, pl.z, 6, 3.0 * rm, { color: col, burn: 1.0, knock: 4, noProc: true });
        ringFx(pl.x, pl.z, 6, 0xffe080, 0.5, { from: 1 });
        sfx.flame();
      });
    }
    after(8, () => {
      const pl = G.player;
      if (!pl || !pl.alive) return;
      explosion(pl.x, pl.z, 8, 8.0 * rm, { color: col, burn: 2.0, knock: 9 });
      ringFx(pl.x, pl.z, 9, 0xffffff, 0.7, { from: 1 });
      burst(pl.x, 1.5, pl.z, 0xffe080, 50, 10, 0.14, 0.9);
      G.shake = Math.max(G.shake, 0.8);
      sfx.nova();
    });
    explosion(p.x, p.z, 4, 1.5 * rm, { color: col, knock: 6, noProc: true });
    G.shake = Math.max(G.shake, 0.4);
    sfx.nova();
    return true;
  },

  // Geada
  crystalSwarm(p, r) {
    const rm = rankMult(r);
    const col = 0xbfe6ff;
    const a0 = angleOf(p.aim.dx, p.aim.dz);
    for (let k = 0; k < 10; k++) {
      after(k * 0.04, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        const a = a0 + (k - 4.5) * 0.16;
        spawnProjectile({ from: 'player', x: pl.x + Math.cos(a) * 0.5, z: pl.z + Math.sin(a) * 0.5, y: 1.2, dx: Math.cos(a), dz: Math.sin(a), speed: 18, life: 1.3, mult: 2.2 * rm, color: col, size: 0.17, r: 0.3, homing: 8, freeze: 0.6, slow: 2, quiet: k % 2 === 1 });
        if (k % 2 === 0) sfx.cryo();
      });
    }
    burst(p.x + p.aim.dx * 0.6, 1.2, p.z + p.aim.dz * 0.6, col, 16, 5, 0.08, 0.4);
    p.swing = 1;
    return true;
  },
  glacialPrison(p, r) {
    const rm = rankMult(r);
    const col = C_('frost');
    const t = targetPoint(p, 10);
    telegraphFx(t.x, t.z, 5, 0.3, col);
    sfx.cryo();
    p.swing = 1;
    after(0.3, () => {
      if (!G.player || !G.player.alive) return;
      const caught = enemiesInRadius(t.x, t.z, 5);
      for (const e of caught) {
        hitEnemy(e, 1.5 * rm, { freeze: 3, slow: 3, knock: 0 });
        const mat = iceMat(0.6);
        const cube = new THREE.Mesh(iceCubeGeo, mat);
        const w = e.r * 2.4 + 0.4;
        const h = (e.height || 1.6) * 1.1;
        cube.scale.set(w, h, w);
        cube.rotation.y = rr(0, 1.5);
        tempMesh(cube, 3, (fx, k) => {
          cube.position.set(e.x, h / 2, e.z);
          mat.opacity = 0.6 * Math.min(1, k * 12, (1 - k) * 12);
        });
      }
      ringFx(t.x, t.z, 5, col, 0.5, { from: 1 });
      burst(t.x, 0.5, t.z, 0xffffff, 30, 6, 0.08, 0.6);
      sfx.shieldBlock();
      after(3, () => {
        if (!G.player || !G.player.alive) return;
        for (const e of caught) {
          if (!e.alive) continue;
          hitEnemy(e, 4.5 * rm, { slow: 2, knock: 2, kx: e.x + rr(-0.1, 0.1), kz: e.z + rr(-0.1, 0.1) });
          burst(e.x, 1, e.z, pick([0xffffff, col]), 16, 6, 0.09, 0.5);
        }
        if (caught.length) {
          G.shake = Math.max(G.shake, 0.35);
          sfx.explode();
        }
      });
    });
    return true;
  },
  avalanche(p, r) {
    const rm = rankMult(r);
    const col = C_('frost');
    const dx = p.aim.dx;
    const dz = p.aim.dz;
    const nx = -dz;
    const nz = dx;
    const x0 = p.x + dx;
    const z0 = p.z + dz;
    let len = 0;
    while (len < 18 && isWalkable(G.dungeon, x0 + dx * len, z0 + dz * len)) len += 0.5;
    const T = 1.2;
    const hit = new Set();
    const mat = iceMat(0.9);
    const wall = new THREE.Mesh(snowWallGeo, mat);
    wall.position.set(x0, 0, z0);
    wall.lookAt(x0 + dx, 0, z0 + dz);
    tempMesh(wall, T + 0.4, (fx, k) => {
      const tt = k * (T + 0.4);
      const d = Math.min(1, tt / T) * len;
      const cx = x0 + dx * d;
      const cz = z0 + dz * d;
      wall.position.set(cx, 0, cz);
      wall.scale.y = 0.6 + Math.min(1, tt / T) * 0.6;
      if (tt > T) mat.opacity = 0.9 * Math.max(0, 1 - (tt - T) / 0.4);
      else {
        for (const e of enemiesOnSegment(cx - nx * 4, cz - nz * 4, cx + nx * 4, cz + nz * 4, 1.0)) {
          if (hit.has(e)) continue;
          hit.add(e);
          hitEnemy(e, 5.0 * rm, { slow: 3, knock: 6, kx: e.x - dx, kz: e.z - dz });
        }
        for (let j = 0; j < 3; j++) {
          const u = rr(-4, 4);
          particle(cx + nx * u + dx * 0.7, rr(0.2, 2), cz + nz * u + dz * 0.7, dx * rr(4, 9), rr(1, 4), dz * rr(4, 9), pick([0xffffff, 0xdff4ff, col]), rr(0.1, 0.2), 0.5, 6, 1);
        }
      }
    });
    G.shake = Math.max(G.shake, 0.5);
    sfx.cryo();
    sfx.explode();
    p.swing = 1;
    return true;
  },
  iceAge(p, r) {
    const rm = rankMult(r);
    const col = C_('frost');
    const x0 = p.x;
    const z0 = p.z;
    ringFx(x0, z0, 14, col, 0.6, { from: 2 });
    burst(x0, 1, z0, 0xffffff, 20, 4, 0.08, 0.5, { up: 2 });
    sfx.telegraph();
    after(0.6, () => {
      const pl = G.player;
      if (!pl || !pl.alive) return;
      const cx = pl.x;
      const cz = pl.z;
      const caught = enemiesInRadius(cx, cz, 14);
      for (const e of caught) hitEnemy(e, 6.0 * rm, { freeze: 4, slow: 5, knock: 0 });
      // cristais gigantes brotam do chão
      const spikes = [];
      for (const e of caught.slice(0, 14)) spikes.push([e.x + rr(-0.6, 0.6), e.z + rr(-0.6, 0.6)]);
      for (let k = spikes.length; k < 22; k++) {
        const a = rr(0, Math.PI * 2);
        const d = rr(2, 13);
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (isWalkable(G.dungeon, x, z)) spikes.push([x, z]);
      }
      for (const [x, z] of spikes) {
        const mat = iceMat(0.8);
        const sp = new THREE.Mesh(iceSpikeGeo, mat);
        sp.position.set(x, 0, z);
        sp.rotation.set(rr(-0.25, 0.25), rr(0, 3), rr(-0.25, 0.25));
        const sc = rr(0.8, 1.5);
        tempMesh(sp, 4.2, (fx, k) => {
          const tt = k * 4.2;
          sp.scale.set(sc, sc * Math.min(1, tt / 0.2), sc);
          mat.opacity = tt > 4 ? 0.8 * (4.2 - tt) / 0.2 : 0.8;
        });
      }
      ringFx(cx, cz, 14, 0xffffff, 0.8, { from: 1 });
      ringFx(cx, cz, 10, col, 0.6, { from: 0.5 });
      burst(cx, 1, cz, 0xffffff, 60, 12, 0.1, 0.8);
      G.shake = Math.max(G.shake, 0.7);
      sfx.nova();
      sfx.cryo();
      after(4, () => {
        if (!G.player || !G.player.alive) return;
        for (const e of enemiesInRadius(cx, cz, 14)) hitEnemy(e, 3.0 * rm, { slow: 3, knock: 3, kx: cx, kz: cz, noProc: true });
        for (const [x, z] of spikes) burst(x, 1.2, z, pick([0xffffff, col]), 10, 6, 0.1, 0.5);
        G.shake = Math.max(G.shake, 0.5);
        sfx.explode();
      });
    });
    return true;
  },
});

export function autoTarget(p, range = 11) {
  return nearestEnemy(p.x, p.z, range, true);
}

export { clamp };
