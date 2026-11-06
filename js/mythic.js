// Poderes dos itens míticos: laser orbital, lâminas fantasmas, ceifador, singularidade, fênix e avatar.
import * as THREE from 'three';
import { G } from './state.js';
import { rr, chance } from './utils.js';
import { hitEnemy, explosion, enemiesInRadius, killEnemy, chainFrom, after } from './combat.js';
import { beamFx, burst, ringFx, floatText, telegraphFx, tempMesh } from './fx.js';
import { glowMat } from './models.js';
import { sfx } from './audio.js';
import { banner } from './ui.js';
import { L } from './i18n.js';

const MC = 0xb04dff; // cor mítica
const has = (k) => G.player && G.player.stats.myths && G.player.stats.myths.has(k);

let orbT = 2;
let bladeT = 0;
let singCd = 0;
let avKills = 0;
export let phoenixCd = 0;

// estado novo a cada personagem
export function resetMythic() {
  orbT = 2;
  singCd = 0;
  avKills = 0;
  phoenixCd = 0;
}

// ---------- Lâminas Fantasmas: 3 lâminas presas ao modelo do jogador ----------
const bladeGeo = new THREE.BoxGeometry(0.08, 0.1, 0.62);
function ensureBlades(p) {
  if (p.mythBlades) return p.mythBlades;
  const g = new THREE.Group();
  const mat = glowMat(MC, 3);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(bladeGeo, mat);
    g.add(b);
  }
  g.position.y = 0.75;
  p.model.root.add(g);
  p.mythBlades = g;
  return g;
}

const BLADE_R = 1.9;
function updateBlades(p, dt) {
  const on = has('blades') && p.alive;
  if (!on) {
    if (p.mythBlades) p.mythBlades.visible = false;
    return;
  }
  const g = ensureBlades(p);
  g.visible = true;
  const spin = G.t * 4.2;
  const root = p.model.root;
  // as lâminas giram no mundo, independente de para onde o personagem olha
  g.rotation.y = -root.rotation.y;
  const pts = [];
  g.children.forEach((b, i) => {
    const a = spin + (i * Math.PI * 2) / 3;
    b.position.set(Math.cos(a) * BLADE_R, Math.sin(G.t * 3 + i) * 0.08, Math.sin(a) * BLADE_R);
    b.rotation.y = -a;
    pts.push([p.x + Math.cos(a) * BLADE_R, p.z + Math.sin(a) * BLADE_R]);
  });
  if (Math.random() < dt * 20) {
    const [x, z] = pts[(Math.random() * 3) | 0];
    burst(x, 0.75, z, MC, 1, 0.5, 0.05, 0.35);
  }
  if ((bladeT -= dt) > 0) return;
  bladeT = 0.2;
  for (const e of enemiesInRadius(p.x, p.z, BLADE_R + 1.2)) {
    if (pts.some(([x, z]) => Math.hypot(e.x - x, e.z - z) < 0.75 + (e.r || 0.4))) hitEnemy(e, 0.4, { noProc: true, quiet: true, kx: p.x, kz: p.z });
  }
}

// ---------- Laser Orbital ----------
function updateOrbital(p, dt) {
  if (!has('orbital')) return;
  if ((orbT -= dt) > 0) return;
  const list = enemiesInRadius(p.x, p.z, 9).filter((e) => !e.inert && !e.decoy && e.aggro);
  if (!list.length) {
    orbT = 0.4;
    return;
  }
  orbT = 3;
  // o mais forte (chefes e elites primeiro)
  const e = list.sort((a, b) => b.hp * (b.boss ? 4 : b.elite ? 2 : 1) - a.hp * (a.boss ? 4 : a.elite ? 2 : 1))[0];
  const x = e.x;
  const z = e.z;
  telegraphFx(x, z, 2, 0.45, MC, e);
  after(0.45, () => {
    const tx = e.alive ? e.x : x;
    const tz = e.alive ? e.z : z;
    beamFx(tx, 14, tz, tx, 0, tz, MC, 0.3, 4);
    beamFx(tx + 0.15, 14, tz, tx, 0, tz, 0xffffff, 0.2, 4);
    explosion(tx, tz, 2, 3, { color: MC, noProc: true, knock: 2 });
    sfx.laser();
  });
}

// ---------- Singularidade ----------
const singCore = new THREE.SphereGeometry(0.45, 14, 10);
const singRing = new THREE.TorusGeometry(0.75, 0.07, 6, 30);
function openSingularity(x, z) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(singCore, new THREE.MeshBasicMaterial({ color: 0x050008 }));
  const ring = new THREE.Mesh(singRing, glowMat(MC, 3));
  ring.rotation.x = Math.PI / 2;
  g.add(core, ring);
  g.position.set(x, 1, z);
  sfx.zap();
  floatText(x, 2, z, L('SINGULARIDADE', 'SINGULARITY'), 'crit');
  tempMesh(g, 1.2, (fx, k) => {
    ring.rotation.z = k * 18;
    g.scale.setScalar(0.4 + k * 1.1);
    // puxa os inimigos para o centro
    for (const e of enemiesInRadius(x, z, 5.5)) {
      if (e.boss || e.static || e.inert) continue;
      const dx = x - e.x;
      const dz = z - e.z;
      const l = Math.hypot(dx, dz) || 1;
      e.kx += (dx / l) * 1.6;
      e.kz += (dz / l) * 1.6;
    }
    if (Math.random() < 0.6) {
      const a = rr(0, Math.PI * 2);
      burst(x + Math.cos(a) * 3, 0.8, z + Math.sin(a) * 3, MC, 1, 0.3, 0.06, 0.4);
    }
  });
  after(1.2, () => explosion(x, z, 3.2, 2.5, { color: MC, noProc: true, knock: 5 }));
}

// ---------- ganchos chamados pelo combate ----------
// antes do dano: bônus contra chefes (Ceifador)
export function mythDmgMult(e) {
  return has('reaper') && e.boss ? 1.25 : 1;
}

// depois de um golpe do jogador
export function mythOnHit(e, crit, o) {
  const p = G.player;
  if (has('reaper') && e.alive && !e.boss && !e.inert && !e.decoy && e.hp > 0 && e.hp < e.maxHp * 0.15) {
    floatText(e.x, e.height + 0.8, e.z, L('EXECUTADO', 'EXECUTED'), 'crit');
    burst(e.x, e.height * 0.6, e.z, MC, 16, 4, 0.07, 0.5);
    killEnemy(e);
  }
  if (o.noProc) return;
  if (crit && has('singularity') && singCd <= 0 && chance(0.25)) {
    singCd = 2.5;
    openSingularity(e.x, e.z);
  }
  if (p.buffs.avatar > 0 && chance(0.2)) after(0.05, () => chainFrom(e, 2, 0.6, 5, MC, true));
}

// inimigo abatido pelo jogador
export function mythOnKill() {
  const p = G.player;
  if (!has('avatar') || p.buffs.avatar > 0) return;
  if (++avKills < 15) return;
  avKills = 0;
  p.buffs.avatar = 8;
  sfx.levelup();
  ringFx(p.x, p.z, 3.5, MC, 0.6);
  burst(p.x, 1, p.z, MC, 40, 6, 0.08, 0.7, { up: 2 });
  floatText(p.x, 2.2, p.z, L('AVATAR NEON', 'NEON AVATAR'), 'up');
}

// golpe fatal: o Protocolo Fênix salva? (true = não morre)
export function mythSave() {
  const p = G.player;
  if (!has('phoenix') || phoenixCd > 0) return false;
  phoenixCd = 90;
  p.hp = p.stats.maxHp * 0.5;
  p.invuln = 2;
  banner(L('PROTOCOLO FÊNIX', 'PHOENIX PROTOCOL'), L('Você renasceu!', 'You were reborn!'));
  sfx.levelup();
  explosion(p.x, p.z, 4.5, 2, { color: 0xff7a1a, noProc: true, burn: 0.6, knock: 7 });
  ringFx(p.x, p.z, 5, 0xffd23d, 0.7);
  burst(p.x, 1, p.z, 0xff7a1a, 60, 7, 0.09, 0.9, { up: 3 });
  return true;
}

// todo quadro
export function updateMythic(dt) {
  const p = G.player;
  if (!p) return;
  phoenixCd = Math.max(0, phoenixCd - dt);
  singCd = Math.max(0, singCd - dt);
  updateBlades(p, dt);
  if (!p.alive) return;
  updateOrbital(p, dt);
  if (p.buffs.avatar > 0 && Math.random() < dt * 30) burst(p.x + rr(-0.4, 0.4), rr(0.2, 1.6), p.z + rr(-0.4, 0.4), MC, 1, 1, 0.07, 0.5, { grav: -3 });
}

// texto do poder mítico pronto/recarregando (barra de buffs)
export function mythHud() {
  const p = G.player;
  const out = [];
  if (p.buffs.avatar > 0) out.push(`${L('Avatar Neon', 'Neon Avatar')} ${p.buffs.avatar.toFixed(0)}s`);
  if (has('phoenix')) out.push(phoenixCd > 0 ? `${L('Fênix', 'Phoenix')} ${Math.ceil(phoenixCd)}s` : `${L('Fênix pronta', 'Phoenix ready')}`);
  return out;
}
