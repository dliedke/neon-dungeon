// Poderes dos itens míticos: laser orbital, lâminas fantasmas, ceifador, singularidade, fênix e avatar.
// Também os poderes divinos (Zeus, Olimpo, Égide, Titã, Hermes, Ambrosia) e os primordiais (Caos, Nyx, Gaia, Cronos, Érebo, Urano).
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
const DC = 0xffd84d; // cor divina
const hasDiv = (k) => G.player && G.player.stats.divs && G.player.stats.divs.has(k);

let orbT = 2;
let bladeT = 0;
let singCd = 0;
let avKills = 0;
export let phoenixCd = 0;
let zeusCd = 0;
let titanN = 0;
let aegisCd = 0;
let ambCd = 0;
let stormT = 3;
let chaosCd = 0;
let cronosN = 0;
let erebusCd = 0;
let uranusT = 4;
let genesisCd = 0;

// estado novo a cada personagem
export function resetMythic() {
  orbT = 2;
  singCd = 0;
  avKills = 0;
  phoenixCd = 0;
  zeusCd = 0;
  titanN = 0;
  aegisCd = 0;
  ambCd = 0;
  stormT = 3;
  chaosCd = 0;
  cronosN = 0;
  erebusCd = 0;
  uranusT = 4;
  genesisCd = 0;
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
  updateDivine(p, dt);
  if (p.stats.prims && p.stats.prims.size) updatePrimordial(p, dt);
  if (p.buffs.avatar > 0 && Math.random() < dt * 30) burst(p.x + rr(-0.4, 0.4), rr(0.2, 1.6), p.z + rr(-0.4, 0.4), MC, 1, 1, 0.07, 0.5, { grav: -3 });
}

// texto do poder mítico pronto/recarregando (barra de buffs)
export function mythHud() {
  const p = G.player;
  const out = [];
  if (p.buffs.avatar > 0) out.push(`${L('Avatar Neon', 'Neon Avatar')} ${p.buffs.avatar.toFixed(0)}s`);
  if (hasDiv('aegisDiv')) out.push(aegisCd > 0 ? `${L('Égide', 'Aegis')} ${Math.ceil(aegisCd)}s` : L('Égide pronta', 'Aegis ready'));
  if (hasDiv('ambrosia')) out.push(ambCd > 0 ? `Ambrosia ${Math.ceil(ambCd)}s` : L('Ambrosia pronta', 'Ambrosia ready'));
  if (has('phoenix')) out.push(phoenixCd > 0 ? `${L('Fênix', 'Phoenix')} ${Math.ceil(phoenixCd)}s` : `${L('Fênix pronta', 'Phoenix ready')}`);
  return out;
}

// ================= Itens divinos =================
// raio que cai do céu num ponto (Punhos de Titã e Ira dos Deuses)
function thunderbolt(x, z, r, mult) {
  beamFx(x + rr(-0.3, 0.3), 13, z + rr(-0.3, 0.3), x, 0, z, DC, 0.25, 3);
  beamFx(x, 13, z, x, 0, z, 0xffffff, 0.15, 2);
  explosion(x, z, r, mult, { color: DC, noProc: true, knock: 2 });
}

// depois de um golpe do jogador
export function divOnHit(e, o) {
  if (o.noProc || !e.alive) return;
  if (hasDiv('zeus') && zeusCd <= 0 && chance(0.2)) {
    zeusCd = 0.25;
    after(0.05, () => chainFrom(e, 6, 1.5, 6.5, DC, true));
  }
  if (hasDiv('titan') && ++titanN >= 5) {
    titanN = 0;
    const x = e.x;
    const z = e.z;
    after(0.08, () => thunderbolt(x, z, 2.2, 3));
    sfx.zap();
  }
}

// antes do dano no jogador: a Égide bloqueia o golpe inteiro? (true = bloqueou)
export function divBlock() {
  const p = G.player;
  if (!hasDiv('aegisDiv') || aegisCd > 0) return false;
  aegisCd = 8;
  floatText(p.x, 1.9, p.z, L('ÉGIDE', 'AEGIS'), 'shield');
  ringFx(p.x, p.z, 3.5, DC, 0.45);
  explosion(p.x, p.z, 3.5, 2, { color: DC, noProc: true, knock: 5 });
  sfx.zap();
  return true;
}

// depois do dano: Ambrosia cura abaixo de 30% de vida (também salva de golpe fatal)
export function divAmbrosia() {
  const p = G.player;
  if (!hasDiv('ambrosia') || ambCd > 0 || p.hp >= p.stats.maxHp * 0.3) return false;
  ambCd = 60;
  p.hp = Math.max(0, p.hp) + p.stats.maxHp * 0.5;
  p.invuln = Math.max(p.invuln, 2);
  floatText(p.x, 2.2, p.z, 'AMBROSIA', 'up');
  ringFx(p.x, p.z, 3, DC, 0.6);
  burst(p.x, 1, p.z, DC, 40, 5, 0.08, 0.8, { up: 3 });
  sfx.levelup();
  return true;
}

// Ira dos Deuses (6 itens divinos): raios a cada 6s sobre inimigos próximos
function updateDivine(p, dt) {
  zeusCd = Math.max(0, zeusCd - dt);
  aegisCd = Math.max(0, aegisCd - dt);
  ambCd = Math.max(0, ambCd - dt);
  if (p.stats.divs.size < 6 || (stormT -= dt) > 0) return;
  const list = enemiesInRadius(p.x, p.z, 9).filter((e) => !e.inert && !e.decoy && e.aggro);
  if (!list.length) {
    stormT = 0.5;
    return;
  }
  stormT = 6;
  for (let i = 0; i < 5; i++) {
    const e = list[i % list.length];
    const x = e.x + (i >= list.length ? rr(-1.2, 1.2) : 0);
    const z = e.z + (i >= list.length ? rr(-1.2, 1.2) : 0);
    telegraphFx(x, z, 1.6, 0.35 + i * 0.12, DC, i < list.length ? e : null);
    after(0.35 + i * 0.12, () => {
      const tx = i < list.length && e.alive ? e.x : x;
      const tz = i < list.length && e.alive ? e.z : z;
      thunderbolt(tx, tz, 1.6, 2.5);
      sfx.zap();
    });
  }
}

// ================= Itens primordiais =================
// cores do prisma (o primordial troca de cor o tempo todo)
const PRISM = [0x7dfff0, 0xff6bd6, 0xffe680, 0x8a7dff, 0x6bff9a];
export const prismC = (k = 0) => PRISM[(Math.floor(G.t * 5) + k) % PRISM.length];
const hasPrim = (k) => G.player && G.player.stats.prims && G.player.stats.prims.has(k);

// antes do dano: Olhar de Nyx (alvo marcado) e Gênese (6 peças)
export function primDmgMult(e) {
  let k = 1;
  if (e.nyxT > G.t) k *= 1.4;
  if (G.player.stats.prims.size >= 6) k *= 1.5;
  return k;
}

// depois de um golpe do jogador
export function primOnHit(e, crit, o) {
  const p = G.player;
  // Olhar de Nyx: crítico marca o alvo por 4s
  if (crit && hasPrim('nyx') && e.alive) {
    if (!(e.nyxT > G.t)) burst(e.x, e.height + 0.4, e.z, 0x8a7dff, 8, 2, 0.06, 0.4, { up: 1 });
    e.nyxT = G.t + 4;
  }
  if (o.noProc) return;
  // Lâmina do Caos: uma fenda repete o golpe em volta
  if (hasPrim('chaos') && chaosCd <= 0 && chance(0.15)) {
    chaosCd = 0.3;
    const x = e.x;
    const z = e.z;
    after(0.06, () => {
      const col = prismC();
      ringFx(x, z, 6, col, 0.35, { from: 0.2 });
      burst(x, 1, z, col, 22, 6, 0.08, 0.45);
      for (const t of enemiesInRadius(x, z, 6)) {
        if (t.inert || t.decoy) continue;
        beamFx(x, 1, z, t.x, 1, t.z, col, 0.15, 2);
        hitEnemy(t, 1.2, { noProc: true, kx: x, kz: z });
      }
      sfx.zap();
    });
  }
  // Mãos de Cronos: a cada 8 golpes todas as habilidades recarregam 1s
  if (hasPrim('cronos') && ++cronosN >= 8) {
    cronosN = 0;
    for (let i = 0; i < p.cds.length; i++) p.cds[i] = Math.max(0, p.cds[i] - 1);
    ringFx(p.x, p.z, 1.4, 0x7dfff0, 0.3, { from: 0.4 });
  }
}

// esquivou de um golpe: Passos de Érebo deixam uma sombra que explode
export function primDodge() {
  const p = G.player;
  if (!hasPrim('erebus') || erebusCd > 0) return;
  erebusCd = 1;
  const x = p.x;
  const z = p.z;
  burst(x, 0.8, z, 0x8a7dff, 16, 2, 0.08, 0.5, { up: 1 });
  telegraphFx(x, z, 2.6, 0.4, 0x8a7dff);
  after(0.4, () => explosion(x, z, 2.6, 3, { color: 0x8a7dff, noProc: true, knock: 4 }));
}

// Gênese: cada habilidade usada solta uma onda prismática (no máximo uma a cada 0,6s)
export function primSkillWave() {
  if (genesisCd > 0) return;
  genesisCd = 0.6;
  const p = G.player;
  const col = prismC();
  explosion(p.x, p.z, 4.5, 3, { color: col, noProc: true, knock: 4 });
  ringFx(p.x, p.z, 5.5, prismC(2), 0.5, { from: 0.4 });
}

// Coroa de Urano: chuva de meteoros a cada 12s
function meteor(x, z) {
  const col = prismC();
  beamFx(x + 4, 15, z - 4, x, 0, z, col, 0.3, 4);
  beamFx(x + 4, 15, z - 4, x, 0, z, 0xffffff, 0.18, 2);
  explosion(x, z, 1.8, 2.2, { color: col, noProc: true, knock: 2, small: true });
}
function updatePrimordial(p, dt) {
  chaosCd = Math.max(0, chaosCd - dt);
  erebusCd = Math.max(0, erebusCd - dt);
  genesisCd = Math.max(0, genesisCd - dt);
  if (!hasPrim('uranus') || (uranusT -= dt) > 0) return;
  const list = enemiesInRadius(p.x, p.z, 10).filter((e) => !e.inert && !e.decoy && e.aggro);
  if (!list.length) {
    uranusT = 0.5;
    return;
  }
  uranusT = 12;
  sfx.roar();
  for (let i = 0; i < 8; i++) {
    const e = list[i % list.length];
    const x = e.x + (i >= list.length ? rr(-1.5, 1.5) : 0);
    const z = e.z + (i >= list.length ? rr(-1.5, 1.5) : 0);
    const d = 0.4 + i * 0.22;
    telegraphFx(x, z, 1.8, d, 0x7dfff0, i < list.length ? e : null);
    after(d, () => {
      const follow = i < list.length && e.alive;
      meteor(follow ? e.x : x, follow ? e.z : z);
      if (i % 2 === 0) sfx.explode();
    });
  }
}
