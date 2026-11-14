// Itens no chão: créditos, stims, orbes de vida, equipamentos e cofres.
import * as THREE from 'three';
import { G, gk } from './state.js';
import { rr, chance, short, pick } from './utils.js';
import { makeItem, rollRarity, RARITY, MYTHIC, MYTHICS, DIVINE, DIVINES, PRIMORDIAL, PRIMORDIALS, itemName, isUpgrade } from './items.js';
import { glowMat, box } from './models.js';
import { burst, ringFx, floatText, beamFx, ghostFx } from './fx.js';
import { sfx } from './audio.js';
import { toast, invFull, banner } from './ui.js';
import { MAX_STIMS } from './player.js';
import { healPlayer, hitEnemy, nearestEnemy, enemiesInRadius, explosion } from './combat.js';
import { spawnAlly } from './powers.js';
import { CLASSES } from './classes.js';
import { L } from './i18n.js';
import { achAdd, achMark } from './ach.js';
import { amod, tierOf, effFloor } from './run.js';
import { rewardK, rewardRank, diffIlvl } from './enemies.js';

export const INV_SIZE = 100;
const UP_COLOR = 0x39ff88;
const MYTH_COLOR = 0xb04dff;
const DIV_COLOR = 0xffd84d;
const PRIM_COLOR = 0x7dfff0;
const PRISM_FX = [0x7dfff0, 0xff6bd6, 0xffe680, 0x8a7dff, 0x6bff9a, 0xff7a5a];

// Chance de um item virar mítico: raro, mas acontece (mais em chefes, fendas, ladrões e nos modos Pesadelo/Inferno)
function mythChance(o, find) {
  if (effFloor() < 3) return 0;
  const base = o.rift ? 0.08 : o.boss ? 0.06 : o.thief || o.beast ? 0.05 : o.contract ? 0.03 : o.chest ? 0.015 : o.elite ? 0.012 : 0.004;
  return base * find * (1 + tierOf().loot / 30) * (G.player.buffs.fortune > 0 ? 1.5 : 1) * rewardK('loot');
}
// Chance de um item virar divino (acima do mítico): do Caos para cima (no Caos, metade do Apocalipse),
// ou no Pesadelo/Inferno a partir do Brutal. Bem mais raro que o mítico; chefes, fendas e feras são a melhor fonte.
// No Abismo sobe +10% da chance da Morte por nível (Abismo X: o dobro da Morte).
function divChance(o, find) {
  const t = G.char.tier | 0;
  const dr = Math.floor(rewardRank() + 1e-6);
  const k = dr >= 8 ? 3 * (1 + 0.1 * (dr - 8)) : dr >= 7 ? 2 : t < 1 ? (dr >= 6 ? 0.6 : 0) : dr >= 6 ? 1.2 : dr >= 5 ? 1 : dr >= 4 ? 0.8 : 0;
  if (!k || effFloor() < 8) return 0;
  const base = o.boss ? 0.02 : o.rift ? 0.015 : o.thief || o.beast ? 0.0125 : o.contract ? 0.0075 : o.chest ? 0.004 : o.elite ? 0.002 : 0.0003;
  return base * k * (1 + t * 0.5) * Math.sqrt(find) * (G.player.buffs.fortune > 0 ? 1.5 : 1);
}
// Chance de um item virar primordial (acima do divino): só na Morte/Abismo (ou Apocalipse+ no Pesadelo/Inferno),
// do andar efetivo 15 em diante e só de chefes, fendas, feras, ladrões e baús. Um décimo da chance do divino,
// mais 10% por nível de Abismo (por cima dos 10% que o divino já ganha).
function primChance(o, find) {
  if (!(o.boss || o.rift || o.beast || o.thief || o.chest)) return 0;
  const t = G.char.tier | 0;
  const dr = Math.floor(rewardRank() + 1e-6);
  if (!(dr >= 8 || (t >= 1 && dr >= 7)) || effFloor() < 15) return 0;
  return divChance(o, find) * 0.1 * (1 + 0.1 * Math.max(0, dr - 8));
}
let labelRoot = null;

// Recompensa por abate: créditos direto na carteira em todo inimigo morto, crescendo com o
// nível do personagem e o andar (e com o modo, a dificuldade, anomalias e a Fortuna, como as moedas)
export function killBounty(e) {
  const c = G.char;
  const k = e.boss ? 10 : e.type === 'thief' || e.T.big ? 6 : e.elite ? 3 : 1;
  const midas = G.player.buffs.midas > 0; // Toque de Midas: 5x
  const cr = Math.round((2 + (c.level | 0) * 0.25) * (1 + G.floor * 0.05) * k * tierOf().credits * rewardK('cr') * amod('credits') * (G.player.buffs.fortune > 0 ? 2 : 1) * (midas ? 5 : 1));
  if (cr < 1) return;
  c.credits += cr;
  achAdd('credits', cr);
  floatText(e.x, e.height + 0.9, e.z, `+${short(cr)}¢`, 'cr');
  if (midas) {
    burst(e.x, e.height * 0.6, e.z, 0xffd23d, 22, 6, 0.09, 0.8, { up: 2.5 });
    burst(e.x, e.height * 0.6, e.z, 0xfff6c0, 8, 4, 0.06, 0.5, { up: 1.5 });
    sfx.coin();
  }
}

export function dropLoot(x, z, o = {}) {
  const p = G.player;
  const find = 1 + (p.stats.findPct || 0) / 100;
  const T = tierOf();
  // dificuldades altas dão itens de nível maior (diffIlvl)
  const ilvl = G.floor + T.off + diffIlvl() + (o.elite ? 1 : 0) + (o.boss || o.rift ? 2 : 0) + (o.chest || o.contract || o.beast ? 1 : 0);
  let items = 0;
  // dificuldade: mais itens, raridade melhor e mais créditos (ver rewardK em enemies.js)
  const lk = rewardK('loot');
  let bonus = G.floor * 1.5 + amod('loot', 0) + T.loot + 20 * (lk - 1);
  const rich = p.buffs.fortune > 0; // Santuário da Fortuna
  if (o.rift) {
    // Fenda de Desafio: cofre lendário; cada onda além da 3ª melhora o cofre (10 ondas: 6 itens)
    const extra = Math.max(0, (o.waves || 3) - 3);
    items = 3 + Math.floor((extra + 1) / 2.5);
    bonus += 45 + extra * 4;
  } else if (o.contract) {
    items = 2;
    bonus += 30;
  } else if (o.thief || o.beast) {
    items = 3;
    bonus += o.beast ? 40 : 35;
  } else if (o.boss) {
    items = 4;
    bonus += 40;
  } else if (o.chest) {
    items = 1 + (chance(0.5) ? 1 : 0);
    bonus += 25;
  } else if (o.elite) {
    items = 2;
    bonus += 18;
  } else if (chance(0.14 * find * (rich ? 2.5 : 1) * Math.sqrt(Math.min(lk, 5.6)))) {
    // inimigos comuns: no Abismo cai a mesma quantidade da Morte (a recompensa a mais vem na qualidade)
    items = 1;
  }
  // quando os míticos já caem bastante, não cai mais item fraco: do Brutal (ou no Pesadelo/Inferno) sem
  // comuns; do Insano para cima (ou no Inferno) sem modificados também (o mínimo vira raro)
  const rk = rewardRank();
  const minR = rk >= 5 || T.off >= 60 ? 2 : rk >= 4 || T.off >= 30 ? 1 : 0;
  // Muito Difícil para cima: chefes, feras, elites e baús dão um item a mais
  if (items && !o.rift && lk >= 2 && (o.boss || o.beast || o.thief || o.elite || o.chest || o.contract)) items++;
  // Abismo V para cima: baús e chefes dão mais um
  if (items && !o.rift && rk >= 13 && (o.boss || o.chest)) items++;
  for (let i = 0; i < items; i++) {
    let rarity = Math.max(minR, rollRarity(bonus));
    if ((o.boss || o.chest || o.thief || o.beast || o.contract) && i === 0) rarity = Math.max(rarity, o.boss || o.thief || o.beast || o.contract ? 2 : 1);
    if (o.rift && i === 0) rarity = 3;
    if (o.rift && i === 1) rarity = Math.max(rarity, 2);
    // fendas de 7 ondas ou mais garantem um segundo lendário
    if (o.rift && i === 2 && (o.waves || 3) >= 7) rarity = Math.max(rarity, 3);
    if (rich && rarity < 3 && chance(0.25)) rarity++;
    if (chance(mythChance(o, find))) rarity = MYTHIC;
    if (chance(divChance(o, find))) rarity = DIVINE;
    if (chance(primChance(o, find))) rarity = PRIMORDIAL;
    const it = makeItem({ ilvl, rarity, cls: G.char.cls });
    spawnPickup('item', x, z, { item: it });
  }
  // devolve o total de créditos que caiu (o Behemoth mostra no aviso)
  let credits = 0;
  if (chance(o.boss || o.chest || o.thief || o.beast || o.rift || o.contract ? 1 : o.elite ? 0.9 : 0.4)) {
    // Behemoth: chuva de moedas, cada uma valendo 2,5x
    const n = o.beast ? 20 : o.rift ? 9 + (o.waves || 3) : o.thief ? 12 : o.boss ? 5 : o.chest || o.contract ? 4 : o.elite ? 3 : 1;
    const big = o.beast ? 3.5 : 1;
    for (let k = 0; k < n; k++) {
      const amount = Math.round(rr(3, 7) * (1 + G.floor * 0.5) * big * (rich ? 2 : 1) * amod('credits') * T.credits * rewardK('cr'));
      credits += amount;
      spawnPickup('credits', x, z, { amount });
    }
  }
  if (o.thief || o.beast || o.rift) spawnPickup('stim', x, z, {});
  if (chance(o.boss ? 1 : o.elite ? 0.35 : o.chest ? 0.3 : 0.04)) spawnPickup('stim', x, z, {});
  // orbes de vida: ajudam a se recuperar no meio da luta
  if (!o.chest && chance(o.boss || o.beast || o.rift ? 1 : o.elite ? 0.6 : Math.min(0.6, 0.13 * amod('orbs')))) spawnPickup('orb', x, z, {});
  return credits;
}

const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 6);
const stimGeo = new THREE.CapsuleGeometry(0.07, 0.2, 4, 8);
const orbGeo = new THREE.SphereGeometry(0.16, 12, 10);
const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6, 1, true).translate(0, 1.3, 0);
const upBeamGeo = new THREE.CylinderGeometry(0.09, 0.14, 4.2, 10, 1, true).translate(0, 2.1, 0);
const upRingGeo = new THREE.RingGeometry(0.42, 0.52, 28).rotateX(-Math.PI / 2);
const mythBeamGeo = new THREE.CylinderGeometry(0.12, 0.3, 9, 12, 1, true).translate(0, 4.5, 0);
const mythGemGeo = new THREE.OctahedronGeometry(0.42, 0);

function beamMat(color, opacity) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gk(1.6)), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

export function spawnPickup(type, x, z, data) {
  let pkColor = MYTH_COLOR;
  const g = new THREE.Group();
  let mesh;
  let color;
  if (type === 'credits') {
    color = 0xffd23d;
    mesh = new THREE.Mesh(coinGeo, glowMat(color, 1.8));
    mesh.rotation.x = Math.PI / 2;
  } else if (type === 'stim') {
    color = 0x39ff88;
    mesh = new THREE.Mesh(stimGeo, glowMat(color, 2));
    mesh.rotation.z = Math.PI / 2;
  } else if (type === 'orb') {
    color = 0xff2b5a;
    mesh = new THREE.Mesh(orbGeo, glowMat(color, 2.4));
  } else {
    const R = RARITY[data.item.rarity];
    color = R.hex;
    mesh = new THREE.Mesh(box(0.26, 0.26, 0.26), glowMat(color, data.item.rarity >= 2 ? 2.4 : 1.6));
    if (data.item.rarity >= MYTHIC) {
      // mítico/divino: coluna de luz alta, dois anéis girando e um losango em volta
      // o divino é dourado e maior
      // o primordial troca de cor (prisma) e é ainda maior
      const pr = data.item.rarity >= PRIMORDIAL;
      const dv = data.item.rarity === DIVINE;
      const fc = pr ? PRIM_COLOR : dv ? DIV_COLOR : MYTH_COLOR;
      mesh.scale.setScalar(pr ? 1.65 : dv ? 1.45 : 1.25);
      const beam = new THREE.Mesh(mythBeamGeo, beamMat(fc, 0.5));
      if (pr) beam.scale.set(1.9, 1.7, 1.9);
      else if (dv) beam.scale.set(1.5, 1.4, 1.5);
      const r1 = new THREE.Mesh(upRingGeo, beamMat(fc, 0.9));
      const r2 = new THREE.Mesh(upRingGeo, beamMat(0xffffff, 0.6));
      r1.position.y = -0.3;
      r2.position.y = 0.6;
      r2.scale.setScalar(0.7);
      const gem = new THREE.Mesh(mythGemGeo, beamMat(fc, 0.55));
      g.add(beam, r1, r2, gem);
      data.mythFx = { beam, r1, r2, gem };
      if (pr) {
        gem.scale.setScalar(1.3);
        data.prism = true;
      }
      pkColor = fc;
    } else if (data.item.rarity >= 1) {
      const beam = new THREE.Mesh(beamGeo, beamMat(color, data.item.rarity >= 2 ? 0.55 : 0.25));
      g.add(beam);
    }
  }
  g.add(mesh);
  const a = rr(0, Math.PI * 2);
  const sp = rr(1.2, 2.6);
  const pk = { fc: pkColor, type, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, y: 0.6, vy: rr(3, 5), mesh, group: g, color, t: 0, upT: 0, ...data };
  g.position.set(x, pk.y, z);
  G.world.add(g);
  if (type === 'item') {
    if (data.quiet) {
      // item que já estava no chão ao continuar o jogo: sem som nem medalha de novo
      if (!labelRoot) labelRoot = document.getElementById('labels');
      const el = document.createElement('div');
      el.style.display = 'none';
      labelRoot.appendChild(el);
      pk.label = el;
      pk.lid = labelId++;
      setUpgrade(pk, isUpgrade(data.item, G.char.equip));
      G.pickups.push(pk);
      return pk;
    }
    if (data.item.rarity === 3) achAdd('legendaries');
    if (data.item.rarity === MYTHIC) achAdd('mythics');
    if (data.item.rarity === DIVINE) achAdd('divines');
    if (data.item.rarity === PRIMORDIAL) achAdd('primordials');
    if (!labelRoot) labelRoot = document.getElementById('labels');
    const el = document.createElement('div');
    el.style.display = 'none';
    labelRoot.appendChild(el);
    pk.label = el;
    pk.lid = labelId++;
    setUpgrade(pk, isUpgrade(data.item, G.char.equip));
    const name = itemName(data.item);
    if (data.item.rarity === PRIMORDIAL) {
      // acima dos deuses: céu rachando em todas as cores, faixa própria e o som mais raro do jogo
      sfx.primordial();
      banner(L('✺ ITEM PRIMORDIAL ✺', '✺ PRIMORDIAL ITEM ✺'), name);
      toast(`<b class="prim-t">✺ ${L('PRIMORDIAL', 'PRIMORDIAL')}:</b> ${name}<br><small>${PRIMORDIALS[data.item.prim].desc}</small>`, 'prim');
      PRISM_FX.forEach((c, i) => {
        const a = (i / PRISM_FX.length) * Math.PI * 2;
        beamFx(x + Math.cos(a) * 1.4, 18, z + Math.sin(a) * 1.4, x, 0, z, c, 0.5, 5);
        ringFx(x, z, 3 + i * 1.3, c, 0.9 + i * 0.12, { from: 0.3 });
      });
      beamFx(x, 18, z, x, 0, z, 0xffffff, 0.45, 4);
      burst(x, 1, z, PRIM_COLOR, 70, 10, 0.1, 1.3, { up: 3 });
      burst(x, 1, z, 0xff6bd6, 50, 8, 0.1, 1.1, { up: 2.5 });
      G.shake = Math.max(G.shake, 0.6);
    } else if (data.item.rarity === DIVINE) {
      // o maior momento do jogo: trovão, faixa dourada e explosão de luz
      sfx.mythic();
      sfx.zap();
      banner(L('⚡ ITEM DIVINO ⚡', '⚡ DIVINE ITEM ⚡'), name);
      toast(`<b style="color:${RARITY[DIVINE].color}">⚡ ${L('DIVINO', 'DIVINE')}:</b> ${name}<br><small>${DIVINES[data.item.div].desc}</small>`, 'div');
      beamFx(x, 16, z, x, 0, z, DIV_COLOR, 0.4, 5);
      beamFx(x + 0.2, 16, z, x, 0, z, 0xffffff, 0.3, 3);
      ringFx(x, z, 5.5, DIV_COLOR, 1, { from: 0.4 });
      ringFx(x, z, 3, 0xffffff, 0.6, { from: 0.2 });
      burst(x, 1, z, DIV_COLOR, 90, 9, 0.1, 1.2, { up: 3 });
      G.shake = Math.max(G.shake, 0.45);
    } else if (data.item.rarity === MYTHIC) {
      // o grande momento: som próprio, faixa no meio da tela e explosão de luz. Do Brutal para cima
      // (ou no Pesadelo/Inferno) os míticos caem a toda hora: fica só o aviso pequeno, sem a faixa
      sfx.mythic();
      if (rewardRank() < 4 && !tierOf().off) banner(L('✦ ITEM MÍTICO ✦', '✦ MYTHIC ITEM ✦'), name);
      toast(`<b style="color:${RARITY[MYTHIC].color}">✦ ${L('MÍTICO', 'MYTHIC')}:</b> ${name}<br><small>${MYTHICS[data.item.myth].desc}</small>`, 'myth');
      ringFx(x, z, 4, MYTH_COLOR, 0.8, { from: 0.4 });
      ringFx(x, z, 2.4, 0xffffff, 0.5, { from: 0.2 });
      burst(x, 1, z, MYTH_COLOR, 60, 7, 0.09, 1, { up: 2 });
      G.shake = Math.max(G.shake, 0.3);
    } else if (pk.up) {
      sfx.upgrade();
      toast(`<b style="color:#39ff88">▲ ${L('MELHORIA!', 'UPGRADE!')}</b> <span style="color:${RARITY[data.item.rarity].color}">${name}</span>`, 'up');
      floatText(x, 1.6, z, L('▲ MELHORIA', '▲ UPGRADE'), 'up');
    } else if (data.item.rarity === 3) {
      sfx.legendary();
      toast(`${L('Protótipo encontrado', 'Prototype found')}: ${name}`, 'leg');
    } else if (data.item.rarity === 2) sfx.rare();
    if (data.item.rarity === 3 && pk.up) sfx.legendary();
    if (data.item.rarity >= MYTHIC && pk.up) toast(`<b style="color:#39ff88">▲ ${L('MELHORIA!', 'UPGRADE!')}</b>`, 'up');
  }
  G.pickups.push(pk);
  return pk;
}

// Liga/desliga o destaque de "melhor que o equipado"
function setUpgrade(pk, up) {
  if (pk.up === up && pk.upInit) return;
  pk.upInit = true;
  pk.up = up;
  const it = pk.item;
  pk.label.className = `ilabel r${it.rarity}${up ? ' up' : ''}`;
  pk.label.innerHTML = (up ? '<b class="uparrow">▲</b> ' : '') + itemName(it);
  pk.lw = 0; // texto mudou: mede de novo
  if (up && !pk.upFx) {
    const beam = new THREE.Mesh(upBeamGeo, beamMat(UP_COLOR, 0.35));
    const ring = new THREE.Mesh(upRingGeo, beamMat(UP_COLOR, 0.9));
    ring.position.y = -0.3;
    pk.group.add(beam, ring);
    pk.upFx = { beam, ring };
    pk.mesh.material = glowMat(it.rarity === 0 ? UP_COLOR : RARITY[it.rarity].hex, 3.2);
  } else if (!up && pk.upFx) {
    pk.group.remove(pk.upFx.beam, pk.upFx.ring);
    pk.upFx.beam.material.dispose();
    pk.upFx.ring.material.dispose();
    pk.upFx = null;
    pk.mesh.material = glowMat(RARITY[it.rarity].hex, it.rarity >= 2 ? 2.4 : 1.6);
  }
}

// ---------------- Cofres ----------------
export function spawnChest(x, z) {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x3a4060 });
  const body = new THREE.Mesh(box(0.8, 0.45, 0.55), baseMat);
  body.position.y = 0.225;
  g.add(body);
  const lid = new THREE.Group();
  lid.position.set(0, 0.45, -0.275);
  const lidMesh = new THREE.Mesh(box(0.82, 0.12, 0.57), baseMat);
  lidMesh.position.set(0, 0.06, 0.285);
  lid.add(lidMesh);
  g.add(lid);
  const seam = new THREE.Mesh(box(0.84, 0.04, 0.59), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(gk(2.4)) }));
  seam.position.y = 0.45;
  g.add(seam);
  const beam = new THREE.Mesh(beamGeo, beamMat(0xffd23d, 0.4));
  g.add(beam);
  g.position.set(x, 0, z);
  g.rotation.y = rr(0, Math.PI * 2);
  G.world.add(g);
  const pk = { type: 'chest', x, z, group: g, mesh: body, lid, seam, beam, t: 1, vy: 0, y: 0, vx: 0, vz: 0, opened: false, static: true };
  G.pickups.push(pk);
  return pk;
}

// ---------- Santuários Neon: bônus temporário ao passar por eles ----------
// Só acrescentar no fim (a medalha "Peregrino" conta os tipos). super: santuário especial (banner, som e efeito visível)
export const SHRINES = {
  fury: { icon: '🔥', name: L('Fúria', 'Fury'), desc: L('+50% de dano', '+50% damage'), color: 0xff2b5a, css: '#ff4d75' },
  haste: { icon: '💨', name: L('Velocidade', 'Haste'), desc: L('+35% de velocidade e +30% de ataque', '+35% move speed and +30% attack speed'), color: 0x00f0ff, css: '#00f0ff' },
  fortune: { icon: '💰', name: L('Fortuna', 'Fortune'), desc: L('mais loot e o dobro de créditos', 'more loot and double credits'), color: 0xffd23d, css: '#ffd23d' },
  aegis: { icon: '🛡️', name: L('Égide', 'Aegis'), desc: L('metade do dano recebido', 'half damage taken'), color: 0x39ff88, css: '#39ff88' },
  crit: { icon: '🎯', name: L('Precisão', 'Precision'), desc: L('+25% de chance de crítico', '+25% critical chance'), color: 0xff8a2b, css: '#ff9a45' },
  vamp: { icon: '🩸', name: L('Vampiro', 'Vampire'), desc: L('6% do dano vira vida', '6% life steal'), color: 0xc4103a, css: '#ff3a64' },
  arcane: { icon: '🔷', name: L('Arcano', 'Arcana'), desc: L('habilidades sem custo de energia', 'skills cost no energy'), color: 0x4d7bff, css: '#6b93ff' },
  chrono: { icon: '⏳', name: L('Cronos', 'Chrono'), desc: L('recarga das habilidades 2x mais rápida', 'skills recharge twice as fast'), color: 0xe0e0ff, css: '#e0e0ff' },
  storm: { icon: '🌩️', name: L('Tempestade', 'Storm'), desc: L('raios caem nos inimigos por perto', 'lightning strikes nearby enemies'), color: 0xb06bff, css: '#c08aff' },
  frost: { icon: '❄️', name: L('Inverno', 'Winter'), desc: L('aura gélida que fere e congela quem chega perto', 'icy aura that hurts and freezes enemies close by'), color: 0x8ad8ff, css: '#8ad8ff' },
  wisdom: { icon: '📘', name: L('Sabedoria', 'Wisdom'), desc: L('o dobro de experiência', 'double experience'), color: 0x3dffd2, css: '#3dffd2' },
  blitz: { super: true, icon: '⚡', name: L('Supervelocidade', 'Super Speed'), desc: L('+80% de velocidade e +40% de ataque; você deixa um rastro de imagens e atropela quem estiver no caminho', '+80% move speed and +40% attack speed; you leave a trail of afterimages and run over anyone in your way'), color: 0xfff23d, css: '#fff23d' },
  giant: { super: true, icon: '🗿', name: L('Gigante', 'Giant'), desc: L('você fica enorme: +60% de dano, 40% menos dano recebido, golpes que empurram e passos que tremem o chão', 'you grow huge: +60% damage, 40% less damage taken, hits that knock back and footsteps that shake the ground'), color: 0xff6a2b, css: '#ff8a4d' },
  phase: { super: true, icon: '🌀', name: L('Superteleporte', 'Super Teleport'), desc: L('o Teleporte não gasta energia, recarrega na hora e explode na saída e na chegada', 'Teleport costs no energy, recharges instantly and explodes where you leave and where you land'), color: 0xff3df0, css: '#ff5ef3' },
  surge: { super: true, icon: '💥', name: L('Superpoderes', 'Super Powers'), desc: L('habilidades sem custo e recarga 4x mais rápida', 'skills cost nothing and recharge 4x faster'), color: 0x9d5bff, css: '#b583ff' },
  midas: { super: true, icon: '🪙', name: L('Toque de Midas', 'Midas Touch'), desc: L('cada inimigo derrotado explode em créditos (5x a recompensa por abate)', 'every enemy you defeat bursts into credits (5x kill bounty)'), color: 0xffc21a, css: '#ffcf3d' },
  clone: { super: true, icon: '👥', name: L('Gêmeos Neon', 'Neon Twins'), desc: L('dois clones holográficos lutam com você', 'two holographic clones fight beside you'), color: 0x3df5ff, css: '#5ef7ff' },
};
export const SUPER_SHRINES = Object.keys(SHRINES).filter((k) => SHRINES[k].super);
export const SHRINE_TIME = 40;
export const SUPREME_TIME = 60;
const shrineGem = new THREE.OctahedronGeometry(0.32, 0);
const superGem = new THREE.IcosahedronGeometry(0.36, 0);
const shrineRing = new THREE.TorusGeometry(0.55, 0.04, 6, 28).rotateX(Math.PI / 2);
const crownRing = new THREE.TorusGeometry(0.42, 0.035, 6, 24);

// Superteleporte só aparece para quem tem o Teleporte (ou o Salto de Rede) aprendido e num atalho
export function shrineOk(kind) {
  if (kind !== 'phase') return true;
  const c = G.char;
  const sk = CLASSES[c.cls].skills;
  return sk.some((s, i) => (s.id === 'warp' || s.id === 'blink') && c.skills[i] > 0 && c.slots.includes(i));
}

// supreme: Santuário Supremo, dá dois efeitos (kind e kind2) por mais tempo
export function spawnShrine(x, z, kind, supreme = false) {
  const S = SHRINES[kind];
  const big = supreme || S.super;
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: supreme ? 0x3a3424 : 0x2a2e44 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.75, 0.3, 8), stone);
  base.position.y = 0.15;
  g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 6), stone);
  col.position.y = 0.75;
  g.add(col);
  const gemMat = glowMat(S.color, big ? 3 : 2.6);
  const gem = new THREE.Mesh(big ? superGem : shrineGem, gemMat);
  gem.position.y = 1.65;
  if (supreme) gem.scale.setScalar(1.35);
  g.add(gem);
  const ring = new THREE.Mesh(shrineRing, glowMat(supreme ? 0xffd23d : S.color, 2));
  ring.position.y = 0.32;
  g.add(ring);
  // anéis girando em volta da gema dos santuários especiais
  let crown = null;
  if (big) {
    crown = new THREE.Group();
    const cm = glowMat(supreme ? 0xffd23d : S.color, 2.2);
    for (let k = 0; k < (supreme ? 2 : 1); k++) {
      const r = new THREE.Mesh(crownRing, cm);
      r.rotation.x = k ? Math.PI / 2 : 0;
      crown.add(r);
    }
    crown.position.y = 1.65;
    if (supreme) crown.scale.setScalar(1.35);
    g.add(crown);
  }
  const beam = new THREE.Mesh(beamGeo, beamMat(supreme ? 0xffd23d : S.color, big ? 0.5 : 0.35));
  if (big) beam.scale.set(1.4, 1, 1.4);
  g.add(beam);
  g.position.set(x, 0, z);
  G.world.add(g);
  let kind2 = null;
  if (supreme) {
    const pool = (S.super ? Object.keys(SHRINES) : SUPER_SHRINES).filter((k) => k !== kind && shrineOk(k));
    kind2 = pool.length ? pick(pool) : null;
  }
  const pk = { type: 'shrine', kind, kind2, supreme, x, z, group: g, mesh: gem, ring, crown, beam, gemMat, t: rr(0, 6), vy: 0, y: 0, vx: 0, vz: 0, used: false, static: true };
  G.pickups.push(pk);
  return pk;
}

function useShrine(pk) {
  const S = SHRINES[pk.kind];
  const p = G.player;
  pk.used = true;
  const kinds = pk.kind2 ? [pk.kind, pk.kind2] : [pk.kind];
  const time = pk.supreme ? SUPREME_TIME : SHRINE_TIME;
  // santuários diferentes se acumulam; o mesmo tipo renova o tempo
  for (const k of kinds) {
    p.buffs[k] = Math.max(p.buffs[k] || 0, time);
    achMark('shrineKinds', k);
    shrineStart(k);
  }
  achAdd('shrines');
  if (pk.supreme) achAdd('shrineSup');
  const big = pk.supreme || S.super;
  if (big) sfx.superShrine();
  else sfx.levelup();
  for (const k of kinds) {
    const c = SHRINES[k].color;
    ringFx(pk.x, pk.z, big ? 4 : 2.4, c, 0.6);
    burst(pk.x, 1.6, pk.z, c, big ? 60 : 40, big ? 8 : 6, 0.08, 0.7, { up: 1.5 });
    burst(p.x, 1, p.z, c, 24, 3, 0.07, 0.5, { up: 2 });
  }
  if (big) {
    beamFx(pk.x, 9, pk.z, pk.x, 0, pk.z, pk.supreme ? 0xffd23d : S.color, 0.5);
    G.shake = Math.max(G.shake, 0.3);
  }
  const line = (k) => `<b style="color:${SHRINES[k].css}">${SHRINES[k].icon} ${SHRINES[k].name}</b>: ${SHRINES[k].desc}`;
  if (pk.supreme) {
    banner(L('👑 SANTUÁRIO SUPREMO', '👑 SUPREME SHRINE'), kinds.map((k) => `${SHRINES[k].icon} ${SHRINES[k].name}`).join(' + '));
    toast(`<b style="color:#ffd23d">${L('Santuário Supremo', 'Supreme Shrine')}</b> (${time}s)<br>${kinds.map(line).join('<br>')}`, 'up');
  } else {
    if (S.super) banner(`${S.icon} ${S.name.toUpperCase()}`, L(`Santuário especial · ${time}s`, `Special shrine · ${time}s`));
    toast(`${L('Santuário', 'Shrine')} · ${line(pk.kind)} (${time}s)`, 'up');
  }
  floatText(p.x, 2, p.z, S.name.toUpperCase(), 'up');
  pk.group.remove(pk.beam);
  pk.gemMat.color.set(0x444455);
  if (pk.crown) pk.crown.visible = false;
}

// efeito imediato ao pegar um santuário especial
function shrineStart(k) {
  const p = G.player;
  if (k === 'clone') spawnTwins(p, p.buffs.clone);
  else if (k === 'phase' && !shrineOk('phase')) toast(L('Coloque o <b>Teleporte</b> num atalho para usar o Superteleporte.', 'Put <b>Teleport</b> on a hotkey to use Super Teleport.'), 'warn');
}

function spawnTwins(p, dur) {
  for (const a of G.allies) if (a.shrine) a.t = 0;
  for (const s of [-1, 1]) {
    const a = spawnAlly('clone', p.x - p.aim.dz * s * 1.3, p.z + p.aim.dx * s * 1.3, { dur, mult: 1.1, atk: 0.25 });
    a.shrine = true;
  }
}

// Superteleporte: explode onde chegou e, um instante depois, onde saiu
const ghostBombs = [];
export function shrineBlink(x0, z0, x1, z1) {
  const c = SHRINES.phase.color;
  explosion(x1, z1, 3.2, 2.4, { color: c, knock: 5 });
  ghostBombs.push({ x: x0, z: z0, t: 0.45, w: G.world });
  burst(x0, 0.8, z0, c, 20, 3, 0.07, 0.5);
}

function openChest(pk) {
  pk.opened = true;
  pk.openT = 0;
  sfx.rare();
  ringFx(pk.x, pk.z, 1.6, 0xffd23d, 0.5);
  burst(pk.x, 0.6, pk.z, 0xffd23d, 30, 5, 0.07, 0.6, { up: 1.4 });
  pk.group.remove(pk.beam);
  dropLoot(pk.x, pk.z, { chest: true });
  achAdd('chests');
}

const pv = new THREE.Vector3();
let fullWarn = 0;

// auras dos santuários (Tempestade, Inverno e os especiais)
let stormT = 0;
let frostT = 0;
let blitzT = 0;
let ghostT = 0;
let stepT = 0;
let auraI = 0;
let lastX = 0;
let lastZ = 0;
const GIANT = 1.45;
function shrineAuras(dt, p) {
  for (let i = ghostBombs.length - 1; i >= 0; i--) {
    const gb = ghostBombs[i];
    if ((gb.t -= dt) > 0) continue;
    if (gb.w === G.world) explosion(gb.x, gb.z, 2.6, 1.8, { color: SHRINES.phase.color, knock: 4, small: true });
    ghostBombs.splice(i, 1);
  }
  if (!p || !p.alive || !p.buffs) return;
  const moved = Math.hypot(p.x - lastX, p.z - lastZ);
  const moving = moved > 0.01 && moved < 2;
  lastX = p.x;
  lastZ = p.z;
  // brilho da cor de cada santuário ativo em volta do jogador (um de cada vez, em rodízio)
  if (Math.random() < dt * 16) {
    const ks = SHRINE_KEYS;
    for (let n = 0; n < ks.length; n++) {
      const k = ks[(auraI + n) % ks.length];
      if (!(p.buffs[k] > 0)) continue;
      auraI = (auraI + n + 1) % ks.length;
      const ang = rr(0, Math.PI * 2);
      burst(p.x + Math.cos(ang) * 0.7, 0.15, p.z + Math.sin(ang) * 0.7, SHRINES[k].color, 1, 0.6, 0.06, 0.7, { grav: -3 });
      break;
    }
  }
  // Supervelocidade: imagens que ficam para trás e atropelamento
  if (p.buffs.blitz > 0 && moving) {
    if ((ghostT -= dt) <= 0) {
      ghostT = 0.09;
      ghostFx(p.model, SHRINES.blitz.color);
    }
    if (Math.random() < dt * 30) burst(p.x + rr(-0.3, 0.3), 0.1, p.z + rr(-0.3, 0.3), pick2(0xfff23d, 0x00f0ff), 1, 0.5, 0.05, 0.35);
    if ((blitzT -= dt) <= 0) {
      blitzT = 0.2;
      const near = enemiesInRadius(p.x, p.z, 1.6);
      for (const e of near) hitEnemy(e, 0.7, { noProc: true, knock: 4, kx: p.x, kz: p.z, quiet: true });
      if (near.length) {
        burst(p.x, 0.8, p.z, 0xfff23d, 12, 4, 0.06, 0.3);
        sfx.zap();
      }
    }
  }
  // Gigante: cresce aos poucos e cada passo treme o chão
  if (p.buffs.giant > 0 || p.giantK) {
    const on = p.buffs.giant > 0;
    p.giantK = on ? Math.min(GIANT, (p.giantK || 1) + dt * 1.5) : Math.max(1, (p.giantK || 1) - dt * 1.5);
    const form = p.form ? (p.form === 'mech' ? 1.4 : 1.3) : 1;
    p.model.root.scale.setScalar(Math.max(form, p.giantK));
    if (!on && p.giantK <= 1) p.giantK = 0;
    if (on && moving && (stepT -= dt) <= 0) {
      stepT = 0.5;
      const near = enemiesInRadius(p.x, p.z, 2.6);
      for (const e of near) hitEnemy(e, 0.5, { noProc: true, knock: 3, stun: 0.25, kx: p.x, kz: p.z, quiet: true });
      ringFx(p.x, p.z, 2.6, SHRINES.giant.color, 0.3, { from: 0.4 });
      burst(p.x, 0.1, p.z, 0x8a7a6a, 8, 3, 0.08, 0.4, { up: 0.6 });
      G.shake = Math.max(G.shake, 0.12);
      sfx.punchHeavy();
    }
  }
  // Superpoderes: faíscas roxas
  if (p.buffs.surge > 0 && Math.random() < dt * 18) burst(p.x + rr(-0.5, 0.5), rr(0.3, 1.8), p.z + rr(-0.5, 0.5), 0x9d5bff, 1, 1.5, 0.05, 0.3);
  // Gêmeos Neon: recria os clones se o andar mudou ou o jogo foi carregado
  if (p.buffs.clone > 1 && !G.allies.some((a) => a.shrine)) spawnTwins(p, p.buffs.clone);
  if (p.buffs.storm > 0 && (stormT -= dt) <= 0) {
    stormT = 0.7;
    const e = nearestEnemy(p.x, p.z, 8, true);
    if (e) {
      beamFx(e.x + rr(-0.3, 0.3), 7, e.z + rr(-0.3, 0.3), e.x, e.height * 0.6, e.z, 0xb06bff);
      burst(e.x, 0.3, e.z, 0xc08aff, 10, 4, 0.05, 0.35, { up: 1 });
      hitEnemy(e, 1.1, { noProc: true, kx: e.x, kz: e.z });
      sfx.zap();
    }
  }
  if (p.buffs.frost > 0) {
    if (Math.random() < dt * 14) {
      const a = rr(0, Math.PI * 2);
      burst(p.x + Math.cos(a) * 3, 0.3, p.z + Math.sin(a) * 3, 0xbfeaff, 1, 1, 0.05, 0.6, { up: 0.6 });
    }
    if ((frostT -= dt) <= 0) {
      frostT = 0.5;
      const near = enemiesInRadius(p.x, p.z, 3.2);
      if (near.length) ringFx(p.x, p.z, 3.2, 0x8ad8ff, 0.35);
      for (const e of near) hitEnemy(e, 0.35, { noProc: true, slow: 1.2, freeze: chance(0.15) ? 1 : 0 });
    }
  }
}

const SHRINE_KEYS = Object.keys(SHRINES);
const pick2 = (a, b) => (Math.random() < 0.5 ? a : b);

export function updatePickups(dt, camera) {
  const p = G.player;
  const c = G.char;
  fullWarn -= dt;
  shrineAuras(dt, p);
  for (const pk of G.pickups) {
    if (pk.type === 'rift') continue; // a Fenda de Desafio é atualizada em run.js
    pk.t += dt;
    if (pk.type === 'shrine') {
      pk.mesh.rotation.y += dt * (pk.used ? 0.3 : 1.6);
      pk.mesh.position.y = 1.65 + Math.sin(pk.t * 2) * (pk.used ? 0.02 : 0.12);
      if (pk.crown && !pk.used) {
        pk.crown.rotation.y += dt * 2.2;
        pk.crown.rotation.z = Math.sin(pk.t * 1.3) * 0.5;
        pk.crown.position.y = pk.mesh.position.y;
      }
      if (!pk.used) {
        pk.ring.scale.setScalar(1 + Math.sin(pk.t * 3) * 0.08);
        if (pk.supreme && Math.random() < dt * 8) burst(pk.x + rr(-0.6, 0.6), 0.4, pk.z + rr(-0.6, 0.6), pk.kind2 && Math.random() < 0.5 ? SHRINES[pk.kind2].color : 0xffd23d, 1, 1, 0.06, 0.8, { grav: -2.5 });
        if (Math.random() < dt * 6) burst(pk.x + rr(-0.5, 0.5), 0.4, pk.z + rr(-0.5, 0.5), SHRINES[pk.kind].color, 1, 1, 0.05, 0.6, { grav: -2 });
        if (p.alive && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.3) useShrine(pk);
      }
      continue;
    }
    if (pk.type === 'chest') {
      if (pk.opened) {
        pk.openT = Math.min(1, pk.openT + dt * 3);
        pk.lid.rotation.x = -pk.openT * 1.9;
      } else {
        pk.seam.material.color.set(0xffd23d).multiplyScalar(1.8 + Math.sin(pk.t * 4) * 0.8);
        if (p.alive && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.4) openChest(pk);
      }
      continue;
    }
    // física do "pulo" ao cair
    if (pk.vy !== 0 || pk.y > 0.35) {
      pk.vy -= 14 * dt;
      pk.y += pk.vy * dt;
      const nx = pk.x + pk.vx * dt;
      const nz = pk.z + pk.vz * dt;
      if (G.dungeon && isFree(nx, nz)) {
        pk.x = nx;
        pk.z = nz;
      }
      if (pk.y <= 0.35) {
        pk.y = 0.35;
        pk.vy = 0;
        pk.vx = pk.vz = 0;
      }
    }
    pk.mesh.rotation.y += dt * (pk.up ? 4 : 2.5);
    if (pk.mythFx) {
      const f = pk.mythFx;
      const k = 0.5 + Math.sin(pk.t * 3) * 0.5;
      f.beam.material.opacity = 0.3 + k * 0.35;
      f.r1.scale.setScalar(1 + ((pk.t * 0.8) % 1) * 1.6);
      f.r1.material.opacity = 0.9 * (1 - ((pk.t * 0.8) % 1));
      f.r2.rotation.y += dt * 3;
      f.gem.rotation.y -= dt * 1.5;
      f.gem.position.y = 0.1 + Math.sin(pk.t * 2) * 0.08;
      if (pk.prism) {
        // primordial: o feixe, os anéis e o losango passam pelas cores do arco-íris
        const h = (pk.t * 0.22) % 1;
        f.beam.material.color.setHSL(h, 1, 0.62).multiplyScalar(gk(1.6));
        f.r1.material.color.setHSL((h + 0.33) % 1, 1, 0.62).multiplyScalar(gk(1.6));
        f.gem.material.color.setHSL((h + 0.66) % 1, 1, 0.62).multiplyScalar(gk(1.6));
        pk.fc = f.beam.material.color.getHex();
      }
      if (Math.random() < dt * 14) burst(pk.x + rr(-0.4, 0.4), 0.3, pk.z + rr(-0.4, 0.4), Math.random() < 0.7 ? pk.fc : 0xffffff, 1, 0.8, 0.06, 1.1, { grav: -3 });
    }
    const bob = pk.up ? 0.5 + Math.sin(pk.t * 4) * 0.12 : 0.35 + Math.sin(pk.t * 3) * 0.06;
    pk.group.position.set(pk.x, pk.vy === 0 ? bob : pk.y, pk.z);
    if (pk.upFx) {
      const k = 0.5 + Math.sin(pk.t * 5) * 0.5;
      pk.upFx.beam.material.opacity = 0.2 + k * 0.35;
      pk.upFx.ring.scale.setScalar(1 + k * 0.5);
      pk.upFx.ring.material.opacity = 0.9 - k * 0.6;
      if (Math.random() < dt * 6) burst(pk.x, 0.4, pk.z, UP_COLOR, 1, 0.6, 0.05, 0.8, { grav: -2 });
    }
    // reavalia se ainda é melhoria (o equipamento pode ter mudado)
    if (pk.type === 'item') {
      pk.upT -= dt;
      if (pk.upT <= 0) {
        pk.upT = 0.5;
        setUpgrade(pk, isUpgrade(pk.item, c.equip));
      }
    }

    if (!p.alive || pk.t < 0.4) continue;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    if ((pk.type === 'credits' || pk.type === 'orb') && d < 3) {
      const k = Math.min(1, dt * 10);
      pk.x += (p.x - pk.x) * k;
      pk.z += (p.z - pk.z) * k;
    }
    if (d < 0.9) {
      if (pk.type === 'credits') {
        c.credits += pk.amount;
        achAdd('credits', pk.amount);
        sfx.coin();
        pk.dead = true;
      } else if (pk.type === 'orb') {
        healPlayer(p.stats.maxHp * 0.15);
        p.en = Math.min(p.stats.maxEn, p.en + p.stats.maxEn * 0.1);
        burst(p.x, 1, p.z, 0xff2b5a, 10, 2, 0.06, 0.4, { grav: -2 });
        sfx.stim();
        pk.dead = true;
      } else if (pk.type === 'stim') {
        if (c.stims < MAX_STIMS) {
          c.stims++;
          sfx.pickup();
          toast('+1 Stim', 'heal');
          pk.dead = true;
        }
      } else if (pk.type === 'item') {
        if (c.inv.length < INV_SIZE) {
          c.inv.push(pk.item);
          sfx.pickup();
          burst(pk.x, 0.5, pk.z, pk.up ? UP_COLOR : pk.color, pk.up ? 20 : 10, 3, 0.06, 0.4);
          const R = RARITY[pk.item.rarity];
          if (pk.mythFx) {
            sfx.legendary();
            ringFx(p.x, p.z, 2.5, pk.fc, 0.5);
          }
          const tag = pk.up ? `<b style="color:#39ff88">▲</b> ` : '';
          toast(`${tag}<span style="color:${R.color}">${itemName(pk.item)}</span>${pk.up ? ` <small>${G.isTouch ? L('— toque na mochila para equipar', '— tap the bag to equip') : L('— abra o inventário (I) para equipar', '— open the inventory (I) to equip')}</small>` : ''}`, pk.up ? 'up' : 'item');
          pk.dead = true;
        } else if (fullWarn <= 0) {
          fullWarn = 3;
          invFull();
        }
      }
    }
  }
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (pk.dead) {
      pk.group.parent && pk.group.parent.remove(pk.group);
      if (pk.upFx) {
        pk.upFx.beam.material.dispose();
        pk.upFx.ring.material.dispose();
      }
      if (pk.mythFx) for (const m of Object.values(pk.mythFx)) m.material.dispose();
      pk.label && pk.label.remove();
      G.pickups.splice(i, 1);
    }
  }
  // rótulos: os que se sobrepõem sobem em pilha e os que cobrem o personagem ficam quase transparentes
  const w = innerWidth;
  const h = innerHeight;
  pv.set(p.x, 0, p.z).project(camera);
  const pfx = ((pv.x + 1) / 2) * w;
  const pfy = ((1 - pv.y) / 2) * h;
  pv.set(p.x, 2, p.z).project(camera);
  const phy = ((1 - pv.y) / 2) * h;
  const phw = Math.max(14, (pfy - phy) * 0.4);
  shown.length = 0;
  for (const pk of G.pickups) {
    if (!pk.label) continue;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    if (d > (pk.mythFx ? 26 : pk.up ? 14 : 10) || pk.vy !== 0) {
      if (pk.lShow) {
        pk.lShow = false;
        pk.label.style.display = 'none';
      }
      continue;
    }
    if (!pk.lShow) {
      pk.lShow = true;
      pk.label.style.display = 'block';
    }
    // mede uma vez (e de novo quando o texto ou o modo de toque mudam)
    if (!pk.lw || pk.lTouch !== G.isTouch) {
      pk.lw = pk.label.offsetWidth;
      pk.lh = pk.label.offsetHeight;
      pk.lTouch = G.isTouch;
    }
    pv.set(pk.x, pk.up ? 1.05 : 0.85, pk.z).project(camera);
    pk.lx = ((pv.x + 1) / 2) * w;
    pk.ly = ((1 - pv.y) / 2) * h;
    shown.push(pk);
  }
  // ordem fixa (mais perto da câmera primeiro): a pilha não fica trocando de lugar quando a câmera anda
  shown.sort(byDepth);
  for (let i = 0; i < shown.length; i++) {
    const a = shown[i];
    const x0 = a.lx - a.lw / 2;
    const x1 = a.lx + a.lw / 2;
    let y = a.ly;
    for (let n = 0, moved = true; moved && n < i; n++) {
      moved = false;
      for (let j = 0; j < i; j++) {
        const b = shown[j];
        if (x0 < b.lx + b.lw / 2 && x1 > b.lx - b.lw / 2 && y > b.ly - b.lh && y - a.lh < b.ly) {
          y = b.ly - b.lh - 2;
          moved = true;
        }
      }
    }
    a.ly = y;
    const over = x0 < pfx + phw && x1 > pfx - phw && y > phy && y - a.lh < pfy;
    if (over !== !!a.lFade) {
      a.lFade = over;
      a.label.style.opacity = over ? 0.15 : '';
    }
    a.label.style.transform = `translate(${Math.round(a.lx - a.lw / 2)}px, ${Math.round(y - a.lh)}px)`;
  }
}
const shown = [];
const byDepth = (a, b) => b.x + b.z - (a.x + a.z) || a.lid - b.lid;
let labelId = 0;

function isFree(x, z) {
  const d = G.dungeon;
  const i = Math.floor(x);
  const j = Math.floor(z);
  if (i < 0 || j < 0 || i >= d.W || j >= d.H) return false;
  return d.grid[j * d.W + i] === 1;
}

export function clearPickups() {
  for (const pk of G.pickups) pk.label && pk.label.remove();
  G.pickups.length = 0;
}
