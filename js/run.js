// Eventos da partida que mudam a cada andar e deixam cada descida diferente:
// anomalias (regras do andar com risco e recompensa), contratos (objetivo opcional com prêmio),
// fendas de desafio (ondas de inimigos por um cofre lendário), combo de abates e
// implantes (melhoria permanente escolhida entre 3 depois de cada chefe).
import * as THREE from 'three';
import { G } from './state.js';
import { L } from './i18n.js';
import { rr, ri, chance, pick, shuffle } from './utils.js';
import { glowMat } from './models.js';
import { burst, ringFx, floatText, telegraphFx } from './fx.js';
import { sfx } from './audio.js';
import { toast, banner } from './ui.js';
import { spawnEnemy, pickEnemyType, ETYPES } from './enemies.js';
import { dropLoot, spawnPickup } from './loot.js';
import { after, explosion, damagePlayer, healPlayer, capHeal } from './combat.js';
import { gainXp, refreshStats } from './player.js';
import { isWalkable, isBossFloor, isFinalFloor } from './dungeon.js';
import { npcNear } from './biomes.js';
import { achAdd, achMark } from './ach.js';
import { saveGame } from './main.js';
import { Input } from './input.js';
import { padText } from './padglyphs.js';
import { setupEvents, updateEvents, eventsHud, eventKill, eventsBusy, announceEvents } from './events.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------
// Anomalias do andar
// ------------------------------------------------------------------
// Cada uma tem um lado bom e um lado ruim. Chaves usadas em amod():
// count (quantidade), elite (chance de elite), hp/dmg/speed/xp dos inimigos, credits, loot (bônus de raridade),
// orbs (orbes de vida), pdmg (dano do jogador), taken (dano recebido), cd (recarga), regen, killHeal, explode, giant, dark
export const ANOMALIES = {
  horde: { icon: '👥', css: '#ff4d75', name: L('Horda', 'Horde'), desc: L('+50% de inimigos · +35% de experiência', '+50% enemies · +35% experience'), count: 1.5, xp: 1.35 },
  frenzy: { icon: '⚡', css: '#00f0ff', name: L('Frenesi', 'Frenzy'), desc: L('inimigos 25% mais rápidos e +15% de dano · +40% de experiência e créditos', 'enemies 25% faster with +15% damage · +40% experience and credits'), speed: 1.25, dmg: 1.15, xp: 1.4, credits: 1.4 },
  elites: { icon: '⭐', css: '#ffd23d', name: L('Noite das Elites', 'Elite Night'), desc: L('3x mais elites · itens melhores', '3x more elites · better items'), elite: 3, loot: 20 },
  gold: { icon: '💰', css: '#ffd23d', name: L('Corrida do Ouro', 'Gold Rush'), desc: L('o triplo de créditos · inimigos com +25% de vida', 'triple credits · enemies have +25% health'), credits: 3, hp: 1.25 },
  glass: { icon: '🔻', css: '#ff7a1a', name: L('Canhão de Vidro', 'Glass Cannon'), desc: L('você causa +50% de dano, mas também recebe +50%', 'you deal +50% damage, but also take +50%'), pdmg: 1.5, taken: 1.5 },
  blood: { icon: '🩸', css: '#ff3a64', name: L('Lua de Sangue', 'Blood Moon'), desc: L('sem regeneração de vida · cada abate cura 3% e caem 3x mais orbes de vida', 'no health regen · every kill heals 3% and 3x more health orbs drop'), regen: 0, killHeal: 3, orbs: 3 },
  chain: { icon: '💥', css: '#ff7a1a', name: L('Reação em Cadeia', 'Chain Reaction'), desc: L('todo inimigo explode ao morrer, ferindo você e os vizinhos · +30% de experiência', 'every enemy explodes on death, hurting you and its neighbors · +30% experience'), explode: true, xp: 1.3 },
  overload: { icon: '🌀', css: '#6b93ff', name: L('Sobrecarga', 'Overload'), desc: L('poderes recarregam 40% mais rápido · inimigos com +30% de vida', 'powers recharge 40% faster · enemies have +30% health'), cd: 0.6, hp: 1.3 },
  giants: { icon: '🗿', css: '#c08aff', name: L('Gigantes', 'Giants'), desc: L('menos inimigos, mas enormes: 2x vida e +25% de dano · 2,5x experiência e itens melhores', 'fewer enemies, but huge: 2x health and +25% damage · 2.5x experience and better items'), count: 0.6, hp: 2, dmg: 1.25, xp: 2.5, giant: true, loot: 10 },
  dark: { icon: '🌑', css: '#8a8aff', name: L('Apagão', 'Blackout'), desc: L('a escuridão engole o andar · itens bem melhores e +20% de experiência', 'darkness swallows the floor · much better items and +20% experience'), dark: true, loot: 30, xp: 1.2 },
};

// ------------------------------------------------------------------
// Modos depois de vencer (Novo Jogo+ por personagem): Pesadelo e Inferno.
// O personagem desce de novo do andar 1 com tudo o que tem, e os inimigos agem
// como se estivessem `off` andares mais fundo (mais vida, dano e elites com mais afixos).
// Cada modo continua de onde o anterior parou (Pesadelo 1 = andar 31, Inferno 1 = andar 61)
// e ainda multiplica a vida (`hp`) e o dano (`dmg`) dos inimigos, porque depois de vencer
// o personagem já está no nível máximo, com os implantes e os itens do fim do jogo.
// Em troca: itens de nível maior, raridade melhor e mais créditos (o ferreiro cobra pelo nível do item).
// ------------------------------------------------------------------
export const TIERS = [
  { off: 0, hp: 1, dmg: 1, loot: 0, credits: 1, elite: 0, icon: '', css: '#00f0ff', name: L('Normal', 'Normal') },
  { off: 30, hp: 1.25, dmg: 1.5, loot: 15, credits: 2, elite: 0.08, icon: '☠️', css: '#ff4466', name: L('Pesadelo', 'Nightmare') },
  { off: 60, hp: 1.5, dmg: 1.75, loot: 30, credits: 3, elite: 0.15, icon: '🔥', css: '#ff7a1a', name: L('Inferno', 'Inferno') },
];
export const MAX_TIER = TIERS.length - 1;
export const tierOf = (c = G.char) => TIERS[Math.min(MAX_TIER, (c && c.tier) | 0)];
// andar "efetivo" dos inimigos e dos itens
export const effFloor = (f = G.floor) => f + tierOf().off;
// blindagem: fração do dano que passa. Depois do andar efetivo 30 (Pesadelo/Inferno) os inimigos
// perfuram blindagem: a constante cresce no mesmo ritmo da blindagem dos itens, senão ela chega a ~90%
export const armorK = (f = G.floor) => 100 + 22 * Math.max(0, (effFloor(f) || 0) - 30);
export const armorTaken = (armor, f) => armorK(f) / (armorK(f) + armor);

// valor de uma regra da anomalia atual (ou o padrão, sem anomalia)
export function amod(k, d = 1) {
  const A = G.anomaly && ANOMALIES[G.anomaly];
  return A && A[k] != null ? A[k] : d;
}

let lastAnomaly = null;
export function rollAnomaly(floor, forced) {
  G.anomaly = null;
  // continuar o jogo: o andar volta com a mesma anomalia de antes
  if (forced !== undefined) {
    G.anomaly = forced && ANOMALIES[forced] ? forced : null;
    if (G.anomaly) lastAnomaly = G.anomaly;
    return G.anomaly;
  }
  if (floor < 2 || isBossFloor(floor) || isFinalFloor(floor)) return null;
  if (!chance(floor < 5 ? 0.45 : 0.65)) return null;
  const keys = Object.keys(ANOMALIES).filter((k) => k !== lastAnomaly);
  G.anomaly = lastAnomaly = pick(keys);
  return G.anomaly;
}

// regras da anomalia nos inimigos comuns que acabaram de nascer
export function applyAnomalyToEnemy(e) {
  if (!G.anomaly || e.boss || e.inert || e.decoy || e.type === 'thief' || e.type === 'pylon') return;
  // elites já têm muita vida: anomalias que aumentam a vida (Gigantes) pesam só metade neles
  const kh = amod('hp');
  e.hp = e.maxHp = e.maxHp * (e.elite && kh > 1 ? 1 + (kh - 1) * 0.5 : kh);
  e.dmg *= amod('dmg');
  e.speed *= amod('speed');
  e.xp = Math.round(e.xp * amod('xp'));
  if (amod('giant', false)) {
    e.r *= 1.3;
    e.height *= 1.35;
    e.model.root.scale.multiplyScalar(1.35);
  }
}

// ------------------------------------------------------------------
// Contratos: objetivo opcional do andar, com prêmio
// ------------------------------------------------------------------
const CONTRACTS = {
  elites: (f, n) => (n.elites >= 2 ? { goal: Math.min(n.elites, 3), text: (g) => L(`Derrote ${g} inimigos de elite`, `Defeat ${g} elite enemies`) } : null),
  blitz: (f, n) => ({ goal: Math.min(22, 10 + Math.floor(f / 2)), window: n.blitz, text: (g) => L(`Derrote ${g} inimigos em ${n.blitz} segundos`, `Defeat ${g} enemies within ${n.blitz} seconds`) }),
  combo: (f) => ({ goal: Math.min(30, 10 + Math.floor(f / 2)), text: (g) => L(`Faça um combo de ${g} abates`, `Reach a ${g}-kill combo`) }),
  sweep: (f, n) => (n.regular >= 12 ? { goal: Math.round(n.regular * 0.8), text: (g) => L(`Limpe o andar: derrote ${g} inimigos`, `Clear the floor: defeat ${g} enemies`) } : null),
  flawless: (f) => ({ goal: Math.min(16, 7 + Math.floor(f / 3)), text: (g) => L(`Derrote ${g} inimigos seguidos sem levar dano`, `Defeat ${g} enemies in a row without taking damage`) }),
  speed: (f, n) => (n.regular >= 20 ? { goal: Math.min(40, 16 + f), limit: n.speed, text: (g) => L(`Derrote ${g} inimigos em ${clock(n.speed)}`, `Defeat ${g} enemies within ${clock(n.speed)}`) } : null),
  thief: (f, n) => (n.thief ? { goal: 1, text: () => L('Derrube o Ladrão de Dados antes que ele fuja', 'Take down the Data Thief before it escapes') } : null),
  rift: (f, n) => (n.rift ? { goal: 1, text: () => L('Feche a Fenda de Desafio', 'Close the Challenge Rift') } : null),
};

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function rollContract(floor) {
  G.contract = null;
  if (floor < 2 || isFinalFloor(floor)) return;
  // na masmorra os inimigos ficam espalhados pelos corredores: os contratos com relógio dão mais tempo
  const mz = G.dungeon && G.dungeon.maze;
  const n = { elites: 0, regular: 0, thief: false, rift: G.pickups.some((pk) => pk.type === 'rift'), speed: mz === 'L' ? 240 : mz ? 210 : 150, blitz: mz ? 55 : 40 };
  for (const e of G.enemies) {
    if (!e.alive || e.inert || e.boss || e.type === 'pylon') continue;
    if (e.type === 'thief') n.thief = true;
    else n.regular++;
    if (e.elite) n.elites++;
  }
  // eventos raros do andar ganham prioridade de vez em quando
  let kinds = shuffle(Object.keys(CONTRACTS));
  if (n.rift && chance(0.5)) kinds = ['rift', ...kinds];
  if (n.thief && chance(0.25)) kinds = ['thief', ...kinds];
  for (const k of kinds) {
    const c = CONTRACTS[k](floor, n);
    if (!c) continue;
    G.contract = { kind: k, goal: c.goal, cur: 0, text: c.text(c.goal), window: c.window, limit: c.limit, t: 0, times: [], done: false, failed: false };
    return;
  }
}

function contractProgress(v, set = false) {
  const C = G.contract;
  if (!C || C.done || C.failed) return;
  C.cur = set ? Math.max(C.cur, v) : C.cur + v;
  if (C.cur >= C.goal) completeContract();
}

export function contractFail(kind) {
  const C = G.contract;
  if (!C || C.done || C.failed || C.kind !== kind) return;
  C.failed = true;
  toast(`📜 ${L('Contrato perdido', 'Contract lost')}: ${C.text}`, 'warn');
  sfx.deny();
}

function completeContract() {
  const C = G.contract;
  const p = G.player;
  C.done = true;
  C.cur = C.goal;
  const cr = Math.round(60 + G.floor * 18);
  G.char.credits += cr;
  achAdd('contracts');
  achAdd('credits', cr);
  banner(L('CONTRATO CUMPRIDO', 'CONTRACT COMPLETE'), L(`+${cr}¢ e um prêmio no chão`, `+${cr}¢ and a reward on the ground`));
  sfx.legendary();
  ringFx(p.x, p.z, 3, 0xffd23d, 0.6);
  burst(p.x, 1.2, p.z, 0xffd23d, 40, 6, 0.08, 0.8, { up: 1.5 });
  floatText(p.x, 2.2, p.z, `+${cr}¢`, 'up');
  dropLoot(p.x, p.z, { contract: true });
}

// ------------------------------------------------------------------
// Fenda de Desafio: de 3 a 10 ondas de inimigos em volta dela; no fim, um cofre lendário
// (quanto mais ondas, melhor o cofre)
// ------------------------------------------------------------------
const riftRing = new THREE.TorusGeometry(0.75, 0.06, 6, 32);
const riftCore = new THREE.OctahedronGeometry(0.45, 0);
const riftBase = new THREE.RingGeometry(0.9, 1.3, 32).rotateX(-Math.PI / 2);
const riftFill = new THREE.CircleGeometry(1.3, 32).rotateX(-Math.PI / 2);

export function spawnRift(x, z) {
  const g = new THREE.Group();
  const ringA = new THREE.Mesh(riftRing, glowMat(0xff2bd6, 2.6));
  ringA.position.y = 1.5;
  g.add(ringA);
  const ringB = new THREE.Mesh(riftRing, glowMat(0x8a3dff, 2.4));
  ringB.position.y = 1.5;
  ringB.scale.setScalar(0.7);
  g.add(ringB);
  const core = new THREE.Mesh(riftCore, glowMat(0xff2bd6, 3));
  core.position.y = 1.5;
  g.add(core);
  const base = new THREE.Mesh(riftBase, new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  base.position.y = 0.03;
  g.add(base);
  // disco que enche enquanto o jogador fica em cima
  const fill = new THREE.Mesh(riftFill, new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.35, depthWrite: false }));
  fill.position.y = 0.04;
  fill.scale.setScalar(0.001);
  g.add(fill);
  g.position.set(x, 0, z);
  G.world.add(g);
  // número de ondas sorteado com a semente do andar (continuar o andar mantém o mesmo)
  const waves = ri(3, 10);
  const pk = { type: 'rift', x, z, waves, group: g, ringA, ringB, core, base, fill, t: 0, hold: 0, state: 'idle', wave: 0, foes: [], nextT: 0, vy: 0, y: 0, vx: 0, vz: 0, static: true };
  G.pickups.push(pk);
  return pk;
}

function riftWave(pk) {
  pk.wave++;
  const f = G.floor;
  // bastante inimigo por onda (bom para combos), crescendo com o andar e com a onda
  const n = Math.min(22, 6 + Math.floor(f / 2) + pk.wave);
  const last = pk.wave >= pk.waves;
  // última onda: uma elite (duas nas fendas de 7 ondas ou mais)
  const elites = last ? (pk.waves >= 7 ? 2 : 1) : 0;
  pk.foes = [];
  const d = G.dungeon;
  for (let i = 0; i < n; i++) {
    let x = pk.x;
    let z = pk.z;
    for (let tries = 0; tries < 14; tries++) {
      const a = rr(0, Math.PI * 2);
      const r = rr(2.5, 7);
      if (isWalkable(d, pk.x + Math.cos(a) * r, pk.z + Math.sin(a) * r)) {
        x = pk.x + Math.cos(a) * r;
        z = pk.z + Math.sin(a) * r;
        break;
      }
    }
    let type = pickEnemyType(f);
    if (ETYPES[type].solo && i > 0) type = pickEnemyType(f);
    const e = spawnEnemy(type, x, z, { elite: i < elites });
    applyAnomalyToEnemy(e);
    e.aggro = true;
    e.alerted = true;
    e.rift = true;
    pk.foes.push(e);
    burst(x, 0.8, z, 0xff2bd6, 14, 4, 0.07, 0.5, { up: 1 });
    ringFx(x, z, 1, 0xff2bd6, 0.3);
  }
  sfx.boss();
  const sub = !last ? L('Derrote todos', 'Defeat them all') : elites > 1 ? L('Última onda: vêm duas elites!', 'Final wave: two elites are coming!') : L('Última onda: tem uma elite!', 'Final wave: an elite is coming!');
  banner(L(`FENDA · ONDA ${pk.wave}/${pk.waves}`, `RIFT · WAVE ${pk.wave}/${pk.waves}`), sub);
}

function closeRift(pk) {
  pk.state = 'done';
  pk.group.remove(pk.ringA, pk.ringB, pk.fill);
  pk.core.material = glowMat(0x444455, 1);
  pk.base.material.opacity = 0.12;
  achAdd('rifts');
  if (pk.waves >= 10) achMark('flags', 'riftMax');
  banner(L('FENDA FECHADA', 'RIFT CLOSED'), pk.waves >= 7 ? L(`${pk.waves} ondas! Um cofre lendário reforçado apareceu`, `${pk.waves} waves! A reinforced legendary cache appeared`) : L('Um cofre lendário apareceu', 'A legendary cache appeared'));
  sfx.legendary();
  ringFx(pk.x, pk.z, 4, 0xff2bd6, 0.7);
  burst(pk.x, 1.5, pk.z, 0xff2bd6, 60, 8, 0.09, 0.9, { up: 1.5 });
  dropLoot(pk.x, pk.z, { rift: true, waves: pk.waves });
  if (G.contract && G.contract.kind === 'rift') contractProgress(1);
}

function updateRifts(dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (pk.type !== 'rift') continue;
    pk.t += dt;
    pk.core.rotation.y += dt * (pk.state === 'done' ? 0.3 : 2.4);
    if (pk.state === 'done') continue;
    pk.ringA.rotation.x += dt * 1.6;
    pk.ringA.rotation.y += dt * 0.9;
    pk.ringB.rotation.y -= dt * 2.2;
    pk.ringB.rotation.z += dt * 1.1;
    pk.core.position.y = 1.5 + Math.sin(pk.t * 2.5) * 0.12;
    if (Math.random() < dt * 10) burst(pk.x + rr(-0.8, 0.8), 0.2, pk.z + rr(-0.8, 0.8), chance(0.5) ? 0xff2bd6 : 0x8a3dff, 1, 1, 0.05, 0.7, { grav: -3 });
    if (pk.state === 'idle') {
      // fica 1,2s em cima para abrir (não abre sem querer só de passar)
      const near = p.alive && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.4;
      // cada fenda avisa uma vez quantas ondas tem
      if (near && !pk.hinted) {
        pk.hinted = true;
        toast(L(`🌀 Fique sobre a Fenda para abri-la: ${pk.waves} ondas de inimigos por um cofre lendário`, `🌀 Stand on the Rift to open it: ${pk.waves} waves of enemies for a legendary cache`), 'leg');
      }
      pk.hold = near ? pk.hold + dt : Math.max(0, pk.hold - dt * 2);
      pk.fill.scale.setScalar(Math.max(0.001, Math.min(1, pk.hold / 1.2)));
      if (pk.hold >= 1.2) {
        pk.state = 'active';
        pk.fill.scale.setScalar(0.001);
        ringFx(pk.x, pk.z, 6, 0xff2bd6, 0.6);
        G.shake = Math.max(G.shake, 0.4);
        riftWave(pk);
      }
    } else if (pk.state === 'active') {
      if (pk.foes.some((e) => e.alive)) {
        pk.nextT = 1.6;
        continue;
      }
      pk.nextT -= dt;
      if (pk.nextT > 0) continue;
      if (pk.wave >= pk.waves) closeRift(pk);
      else riftWave(pk);
    }
  }
}

// ------------------------------------------------------------------
// Combo de abates
// ------------------------------------------------------------------
// janela do combo: 3,5s, crescendo com o combo (até 6s no combo 50) para dar tempo de ir até o próximo grupo
const COMBO_WINDOW = 3.5;
const comboWindow = () => COMBO_WINDOW + Math.min(2.5, combo.n * 0.05);
const combo = { n: 0, t: 0, best: 0, w: COMBO_WINDOW };
export const comboBonus = () => Math.min(0.6, combo.n * 0.02);

// ------------------------------------------------------------------
// Ganchos chamados pelo resto do jogo
// ------------------------------------------------------------------
// Andar novo: sorteia a fenda e o contrato (a anomalia é sorteada antes de povoar o andar)
export function setupFloorEvents(d, floor, boss, rooms) {
  combo.n = 0;
  combo.t = 0;
  G.contract = null;
  // andar limpo: conta os inimigos do começo (a batalha final não vale)
  const n0 = enemiesLeft();
  G.clear = isFinalFloor(floor) || !n0 ? null : { start: n0, left: n0, done: false, t: 0 };
  if (floor < 2 || isFinalFloor(floor)) return;
  // Fendas de Desafio em salas longe do início (não aparecem em andar de chefe): quase sempre uma,
  // às vezes duas (e até três nos andares fundos); nunca na sala do mercador/ferreiro (sala segura) nem perto deles
  const free = rooms.filter((r) => !r.safe && !r.plaza);
  const nRifts = boss || !free.length ? 0 : (chance(floor < 4 ? 0.6 : 0.85) ? 1 : 0) + (floor >= 4 && chance(0.4) ? 1 : 0) + (floor >= 12 && chance(0.25) ? 1 : 0);
  for (let j = 0; j < nRifts; j++) {
    for (let k = 0; k < 12; k++) {
      const r = pick(free);
      const x = r.x + r.w / 2;
      const z = r.y + r.h / 2;
      // fendas longe uma da outra (as ondas de uma não acordam a outra)
      if (isWalkable(d, x, z) && Math.hypot(x - d.exit.x, z - d.exit.z) > 4 && !G.pickups.some((o) => Math.hypot(o.x - x, o.z - z) < (o.type === 'rift' ? 10 : 2.5)) && !npcNear(d, x, z, 4)) {
        spawnRift(x, z);
        break;
      }
    }
  }
  rollContract(floor);
  // eventos e quebra-cabeças do andar (podem trazer guardas e um Procurado: entram na conta do andar limpo)
  setupEvents(d, floor, boss, rooms);
  if (G.clear) G.clear.start = G.clear.left = enemiesLeft();
}

// avisos do começo do andar (anomalia e contrato)
export function announceFloor(floor) {
  const A = G.anomaly && ANOMALIES[G.anomaly];
  if (A) {
    achMark('anomalies', G.anomaly);
    setTimeout(() => G.floor === floor && toast(`<b style="color:${A.css}">${A.icon} ${L('ANOMALIA', 'ANOMALY')}: ${A.name}</b><br><small>${A.desc}</small>`, 'leg'), 1300);
  }
  const C = G.contract;
  let t = A ? 5600 : 1300;
  if (C) {
    setTimeout(() => G.floor === floor && G.contract === C && toast(`📜 <b>${L('Contrato', 'Contract')}</b>: ${C.text}`, 'leg'), t);
    t += 4300;
  }
  // eventos do andar
  t = announceEvents(floor, t);
  // Ninho e Behemoth: avisa logo na chegada (os dois aparecem no minimapa)
  const N = G.nest;
  if (N) {
    setTimeout(() => G.floor === floor && G.nest === N && !N.woke && toast(L(`🪺 Há um <b>Ninho</b> neste andar: ${N.n} inimigos juntos que acordam de uma vez (marcado no mapa). Destrua tudo para ganhar um cofre. Ótimo para combos!`, `🪺 There is a <b>Nest</b> on this floor: ${N.n} enemies that wake up all at once (marked on the map). Wipe it out for a loot cache. Great for combos!`), 'leg', 'nest'), t);
    t += 4300;
  }
  const B = G.enemies.find((e) => e.alive && e.type === 'behemoth');
  if (B) setTimeout(() => G.floor === floor && B.alive && !B.roared && toast(L('🦏 Um <b>Behemoth Furioso</b> ronda este andar (marcado no mapa). Muito forte, mas paga muitos créditos e itens.', '🦏 A <b>Raging Behemoth</b> roams this floor (marked on the map). Very tough, but it pays lots of credits and items.'), 'leg', 'beast'), t);
}

// inimigo derrotado pelo jogador (não conta barril nem autodestruição)
export function runKill(e) {
  const p = G.player;
  if (e.type === 'barrel') return;
  eventKill(e);
  // combo
  combo.n = combo.t > 0 ? combo.n + 1 : 1;
  combo.w = comboWindow();
  combo.t = combo.w;
  combo.best = Math.max(combo.best, combo.n);
  const bonus = comboBonus();
  if (bonus > 0 && e.xp) gainXp(e.xp * bonus);
  if (combo.n >= 10 && combo.n % 10 === 0) {
    floatText(p.x, 2.4, p.z, `COMBO x${combo.n}!`, 'up');
    sfx.upgrade();
    const n = Math.min(8, combo.n / 10 + 2);
    for (let k = 0; k < n; k++) spawnPickup('credits', e.x, e.z, { amount: Math.round(rr(3, 7) * (1 + G.floor * 0.5)) });
  }
  for (const m of [25, 50, 100]) if (combo.n >= m) achMark('flags', 'combo' + m);
  // anomalias
  const kh = amod('killHeal', 0);
  if (kh) healPlayer(capHeal('moon', (p.stats.maxHp * kh) / 100, (p.stats.maxHp * kh * 1.5) / 100), false);
  if (amod('explode', false) && !e.boss && !e.explodeOnDeath && !e.rift) {
    const x = e.x;
    const z = e.z;
    const dmg = e.dmg * 0.8;
    telegraphFx(x, z, 2.3, 0.55, 0xff7a1a);
    after(0.55, () => {
      explosion(x, z, 2.3, 0.7, { color: 0xff7a1a, noProc: true, small: true, knock: 4 });
      if (Math.hypot(G.player.x - x, G.player.z - z) < 2.3 + G.player.r) damagePlayer(dmg);
    });
  }
  // contrato
  const C = G.contract;
  if (!C || C.done || C.failed) return;
  switch (C.kind) {
    case 'elites':
      if (e.elite) contractProgress(1);
      break;
    case 'sweep':
    case 'flawless':
      if (e.type !== 'thief') contractProgress(1);
      break;
    case 'speed':
      if (e.type !== 'thief' && C.t <= C.limit) contractProgress(1);
      break;
    case 'blitz':
      C.times.push(G.t);
      C.times = C.times.filter((t) => G.t - t <= C.window);
      contractProgress(C.times.length, true);
      if (!C.done) C.cur = C.times.length;
      break;
    case 'combo':
      contractProgress(combo.n, true);
      break;
    case 'thief':
      if (e.type === 'thief') contractProgress(1);
      break;
  }
}

// o jogador perdeu vida de verdade (depois de escudo e esquiva)
export function runHurt() {
  const C = G.contract;
  if (C && C.kind === 'flawless' && !C.done && !C.failed && C.cur > 0) {
    C.cur = 0;
    floatText(G.player.x, 2.3, G.player.z, L('SEQUÊNCIA PERDIDA', 'STREAK LOST'), 'hurt');
  }
}

// chefe derrotado: um implante novo para escolher (uma vez por andar de chefe)
export function bossReward() {
  const c = G.char;
  if (!c || G.final) return;
  c.implantFloors = c.implantFloors || [];
  // cada modo (Normal, Pesadelo, Inferno) tem os seus 9 implantes
  const key = G.floor + 100 * (c.tier | 0);
  if (c.implantFloors.includes(key)) return;
  c.implantFloors.push(key);
  c.implantPending = (c.implantPending || 0) + 1;
  implantDelay = 2.2;
  saveGame();
}

export function runFloorDone() {
  if (G.anomaly) achMark('anomaliesDone', G.anomaly);
}

// ------------------------------------------------------------------
// Andar limpo: derrotar todos os inimigos do andar dá créditos e conta para medalhas
// (não contam barris, chamarizes, pilares do OMEGA nem o Ladrão de Dados, que pode fugir)
// ------------------------------------------------------------------
function enemiesLeft() {
  let n = 0;
  for (const e of G.enemies) if (e.alive && !e.inert && !e.decoy && e.type !== 'thief' && e.type !== 'pylon') n++;
  return n;
}
export function clearBonus(floor = G.floor) {
  return Math.round((150 + floor * 40) * (1 + (G.char ? G.char.tier | 0 : 0) * 0.5));
}
function updateClear(dt) {
  const K = G.clear;
  if (!K || K.done || G.final || !G.player || !G.player.alive) return;
  K.t -= dt;
  if (K.t > 0) return;
  K.t = 0.25;
  K.left = enemiesLeft();
  // fenda aberta ainda manda ondas: só conta quando ela fechar
  if (K.left > 0 || G.pickups.some((pk) => pk.type === 'rift' && pk.state === 'active') || eventsBusy()) return;
  K.done = true;
  // em andar de chefe espera o aviso do chefe passar
  after(isBossFloor(G.floor) ? 2.6 : 0.4, () => {
    if (G.clear !== K || !G.player || !G.char) return;
    const p = G.player;
    const cr = clearBonus();
    G.char.credits += cr;
    achAdd('clears');
    achAdd('credits', cr);
    if (K.start >= 30) achMark('flags', 'clearBig');
    banner(L('ANDAR LIMPO!', 'FLOOR CLEARED!'), L(`Nenhum inimigo restante · +${cr}¢`, `No enemies left · +${cr}¢`));
    sfx.legendary();
    ringFx(p.x, p.z, 4, 0x39ff88, 0.7);
    burst(p.x, 1.2, p.z, 0x39ff88, 46, 7, 0.08, 0.9, { up: 1.6 });
    floatText(p.x, 2.4, p.z, `+${cr}¢`, 'up');
    saveGame();
  });
}

let implantDelay = 0;
export function updateRun(dt) {
  updateRifts(dt);
  updateEvents(dt);
  updateClear(dt);
  if (combo.t > 0) {
    combo.t -= dt;
    if (combo.t <= 0) combo.n = 0;
  }
  const C = G.contract;
  if (C && !C.done && !C.failed) {
    C.t += dt;
    if (C.limit && C.t > C.limit) {
      C.failed = true;
      toast(`📜 ${L('O tempo do contrato acabou', 'The contract ran out of time')}`, 'warn');
    }
    if (C.kind === 'blitz' && C.times.length) {
      C.times = C.times.filter((t) => G.t - t <= C.window);
      C.cur = C.times.length;
    }
  }
  // implante pendente: abre a escolha quando não houver chefe lutando
  const c = G.char;
  if (c && c.implantPending > 0 && G.mode === 'play' && G.player.alive && !G.bosses.length) {
    implantDelay -= dt;
    if (implantDelay <= 0) openImplants();
  }
}

// HUD: anomalia, contrato e combo
const hudCache = {};
export function runHud() {
  const A = G.anomaly && ANOMALIES[G.anomaly];
  const C = G.contract;
  let h = '';
  if (A) h += `<div class="ri-anom" style="--c:${A.css}">${A.icon} ${A.name}</div>`;
  if (C) {
    const left = C.limit && !C.done && !C.failed ? Math.max(0, C.limit - C.t) : null;
    const time = left != null ? ` · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : '';
    const st = C.done ? 'done' : C.failed ? 'fail' : '';
    h += `<div class="ri-con ${st}">📜 ${C.text}<b>${C.done ? ' ✔' : C.failed ? ' ✖' : ` ${Math.min(C.cur, C.goal)}/${C.goal}${time}`}</b></div>`;
  }
  h += eventsHud();
  const K = G.clear;
  if (K && K.done) h += `<div class="ri-con ri-clear done">🧹 ${L('Andar limpo', 'Floor cleared')}<b> ✔</b></div>`;
  else if (K && K.left > 0 && K.left <= 10 && K.left < K.start) h += `<div class="ri-con ri-clear">👾 ${L(`Restam ${K.left} inimigos`, `${K.left} enemies left`)}<b> +${clearBonus()}¢</b></div>`;
  if (hudCache.info !== h) {
    hudCache.info = h;
    $('run-info').innerHTML = h;
  }
  const el = $('combo');
  const show = combo.n >= 3 && combo.t > 0;
  if (show) {
    const v = String(combo.n);
    if (hudCache.combo !== v) {
      hudCache.combo = v;
      el.querySelector('b').textContent = 'x' + v;
      el.querySelector('small').textContent = `COMBO · +${Math.round(comboBonus() * 100)}% XP`;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    el.querySelector('i').style.transform = `scaleX(${(combo.t / combo.w).toFixed(3)})`;
  } else hudCache.combo = null;
  el.classList.toggle('hidden', !show);
}

// ------------------------------------------------------------------
// Implantes: melhoria permanente do personagem, escolhida depois de cada chefe
// ------------------------------------------------------------------
export const IMPLANTS = {
  cortex: { icon: '🧠', name: L('Córtex de Combate', 'Combat Cortex'), mods: { dmgPct: 12 } },
  heart: { icon: '❤️', name: L('Coração Sintético', 'Synthetic Heart'), mods: { hpPct: 12 } },
  optic: { icon: '🎯', name: L('Ótica Preditiva', 'Predictive Optics'), mods: { crit: 5, critDmg: 20 } },
  servo: { icon: '🦿', name: L('Servos Leves', 'Featherweight Servos'), mods: { moveSpd: 8, atkSpd: 10 } },
  synapse: { icon: '⏱️', name: L('Sinapse Acelerada', 'Accelerated Synapse'), mods: { cdr: 7 } },
  derm: { icon: '🛡️', name: L('Derme Blindada', 'Armored Dermis'), mods: { armorPct: 15 } },
  fangs: { icon: '🦷', name: L('Presas Nanotecnológicas', 'Nanotech Fangs'), mods: { lifeSteal: 2.5 } },
  battery: { icon: '🔋', name: L('Bateria Extra', 'Spare Battery'), mods: { maxEn: 20, enRegen: 1.5 } },
  luck: { icon: '🍀', name: L('Chip da Sorte', 'Lucky Chip'), mods: { findPct: 20, xpPct: 15 } },
  recycler: { icon: '♻️', name: L('Reciclador Orgânico', 'Organic Recycler'), mods: { killHeal: 1.5, killEn: 3 } },
  ghost: { icon: '👻', name: L('Reflexo Fantasma', 'Phantom Reflex'), mods: { dodge: 5 } },
  hunter: { icon: '🗡️', name: L('Módulo Caçador', 'Hunter Module'), mods: { eliteDmg: 20 } },
};
const MOD_TXT = {
  dmgPct: ['+{v}% de dano', '+{v}% damage'],
  hpPct: ['+{v}% de vida máxima', '+{v}% max health'],
  crit: ['+{v}% de chance de crítico', '+{v}% crit chance'],
  critDmg: ['+{v}% de dano crítico', '+{v}% crit damage'],
  moveSpd: ['+{v}% de velocidade', '+{v}% move speed'],
  atkSpd: ['+{v}% de velocidade de ataque', '+{v}% attack speed'],
  cdr: ['+{v}% de redução de recarga', '+{v}% cooldown reduction'],
  armorPct: ['+{v}% de blindagem', '+{v}% armor'],
  lifeSteal: ['+{v}% de roubo de vida', '+{v}% life steal'],
  maxEn: ['+{v} de energia máxima', '+{v} max energy'],
  enRegen: ['+{v} de energia por segundo', '+{v} energy per second'],
  findPct: ['+{v}% de chance de itens', '+{v}% item find'],
  xpPct: ['+{v}% de experiência', '+{v}% experience'],
  killHeal: ['abates curam {v}% da vida', 'kills heal {v}% health'],
  killEn: ['abates dão +{v} de energia', 'kills give +{v} energy'],
  dodge: ['+{v}% de esquiva', '+{v}% dodge'],
  eliteDmg: ['+{v}% de dano em elites e chefes', '+{v}% damage to elites and bosses'],
};
const modText = (mods, k = 1) => Object.entries(mods).map(([m, v]) => L(...MOD_TXT[m]).replace('{v}', String(+(v * k).toFixed(1)))).join(' · ');

// soma dos implantes do personagem (usado em computeStats)
export function implantMods(c) {
  const out = {};
  for (const [k, n] of Object.entries((c && c.implants) || {})) {
    const I = IMPLANTS[k];
    if (!I || !n) continue;
    for (const [m, v] of Object.entries(I.mods)) out[m] = (out[m] || 0) + v * n;
  }
  return out;
}

export function implantSummary(c) {
  const list = Object.entries((c && c.implants) || {}).filter(([k, n]) => IMPLANTS[k] && n > 0);
  if (!list.length) return '';
  return list.map(([k, n]) => `<span class="imp-chip" title="${IMPLANTS[k].name}: ${modText(IMPLANTS[k].mods, n)}">${IMPLANTS[k].icon}${n > 1 ? `×${n}` : ''}</span>`).join('');
}

let offer = null;
function openImplants() {
  const c = G.char;
  if (!offer) {
    // 3 implantes diferentes; às vezes um vem dourado (vale em dobro)
    offer = shuffle(Object.keys(IMPLANTS)).slice(0, 3).map((k) => ({ k, gold: chance(0.15) }));
  }
  G.mode = 'implant';
  Input.reset();
  const left = c.implantPending > 1 ? ` (${c.implantPending})` : '';
  $('implant-sub').textContent = L(`O chefe deixou um implante${left}. Escolha um: ele fica com este personagem para sempre.`, `The boss dropped an implant${left}. Pick one: it stays with this character forever.`);
  $('implant-cards').innerHTML = offer.map((o, i) => {
    const I = IMPLANTS[o.k];
    const have = (c.implants && c.implants[o.k]) || 0;
    return `<button class="imp-card${o.gold ? ' gold' : ''}" data-nav data-imp="${i}">
      ${o.gold ? `<span class="imp-tag">${L('DOURADO · VALE 2x', 'GOLDEN · WORTH 2x')}</span>` : ''}
      <span class="imp-ico">${I.icon}</span>
      <b>${I.name}</b>
      <span class="imp-desc">${modText(I.mods, o.gold ? 2 : 1)}</span>
      ${have ? `<small>${L('Você já tem', 'You have')} ×${have}</small>` : ''}
    </button>`;
  }).join('');
  $('implant-cards').querySelectorAll('[data-imp]').forEach((b) => (b.onclick = () => chooseImplant(+b.dataset.imp)));
  $('implant-pad').innerHTML = G.lastInput === 'pad' ? padText(L('{A} Escolher', '{A} Choose')) : '';
  $('panel-implant').classList.remove('hidden');
  sfx.rare();
}

function chooseImplant(i) {
  const o = offer && offer[i];
  if (!o) return;
  const c = G.char;
  const I = IMPLANTS[o.k];
  c.implants = c.implants || {};
  c.implants[o.k] = (c.implants[o.k] || 0) + (o.gold ? 2 : 1);
  c.implantPending = Math.max(0, (c.implantPending || 0) - 1);
  if (o.gold) achMark('flags', 'goldImplant');
  offer = null;
  $('panel-implant').classList.add('hidden');
  refreshStats();
  const p = G.player;
  p.hp = p.stats.maxHp;
  sfx.upgrade();
  ringFx(p.x, p.z, 2.5, 0x00f0ff, 0.6);
  burst(p.x, 1.2, p.z, 0x00f0ff, 40, 5, 0.08, 0.8, { up: 1.5 });
  toast(`${I.icon} <b>${I.name}</b> ${L('instalado', 'installed')}: ${modText(I.mods, o.gold ? 2 : 1)}`, 'up');
  G.mode = 'play';
  Input.reset();
  implantDelay = 0.6;
  saveGame();
}
