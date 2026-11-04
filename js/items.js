// Geração de itens, atributos, raridades e descrições.
import { ri, rr, pick, weightedPick, uid, fmt } from './utils.js';
import { CLASSES } from './classes.js';
import { L } from './i18n.js';

export const SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet', 'chip'];
export const SLOT_NAMES = { weapon: L('Arma', 'Weapon'), head: L('Implante', 'Implant'), chest: L('Torso', 'Torso'), hands: L('Mãos', 'Hands'), feet: L('Pés', 'Feet'), chip: 'Chip' };
export const SLOT_ICONS = {
  weapon: '<path d="M6 26L24 8M20 6l6 6M8 20l4 4"/>',
  head: '<path d="M8 18a8 8 0 0 1 16 0v4H8z"/><path d="M10 17h12"/>',
  chest: '<path d="M10 6l-5 4v16h22V10l-5-4-6 4z"/>',
  hands: '<path d="M10 28V14l2-6 2 6V10l2-4 2 4v4l2-4 2 4v14z"/>',
  feet: '<path d="M8 6h7v14l9 3v5H8z"/>',
  chip: '<rect x="9" y="9" width="14" height="14" rx="2"/><path d="M13 5v4M19 5v4M13 23v4M19 23v4M5 13h4M5 19h4M23 13h4M23 19h4"/>',
};

export const RARITY = [
  { name: L('Comum', 'Common'), color: '#c8d0e0', hex: 0xc8d0e0, n: [0, 0], mult: 1 },
  { name: L('Modificado', 'Modded'), color: '#4d9bff', hex: 0x3d8bff, n: [1, 2], mult: 1.08 },
  { name: L('Raro', 'Rare'), color: '#ffd23d', hex: 0xffd23d, n: [3, 4], mult: 1.16 },
  { name: L('Protótipo', 'Prototype'), color: '#ff7a1a', hex: 0xff7a1a, n: [4, 4], mult: 1.26 },
];

const BASES = {
  head: [L('Implante Ocular', 'Ocular Implant'), L('Visor Tático', 'Tactical Visor'), L('Chip Cortical', 'Cortical Chip'), L('Capacete Neural', 'Neural Helmet')],
  chest: [L('Jaqueta Blindada', 'Armored Jacket'), L('Colete de Kevlar', 'Kevlar Vest'), L('Sobretudo Sintético', 'Synthetic Coat'), L('Placa Subdérmica', 'Subdermal Plate')],
  hands: [L('Luvas Hidráulicas', 'Hydraulic Gloves'), L('Manoplas Sinápticas', 'Synaptic Gauntlets'), L('Braços Cromados', 'Chrome Arms'), L('Luvas de Grafeno', 'Graphene Gloves')],
  feet: [L('Botas Magnéticas', 'Mag Boots'), L('Tênis Reflex', 'Reflex Sneakers'), L('Pernas Servo', 'Servo Legs'), L('Botas de Salto', 'Jump Boots')],
  chip: [L('Chip Neural', 'Neural Chip'), L('Módulo de Memória', 'Memory Module'), L('Núcleo Biocibernético', 'Biocyber Core'), L('Coprocessador', 'Coprocessor')],
};
const ARMOR_BASE = { head: 4, chest: 9, hands: 3, feet: 3, chip: 0 };
const SUFFIX = ['Mk-II', 'Mk-III', 'X-7', 'V9', L('Série Ômega', 'Omega Series'), L('Militar', 'Military'), L('de Elite', 'Elite'), L('Customizado', 'Custom'), L('Pirata', 'Bootleg'), L('Corporativo', 'Corporate'), L('Experimental', 'Experimental'), 'Kitsune', 'Ronin', 'Spectre'];
const MOD_SUFFIX = ['v2', 'Plus', 'Turbo', 'Pro', L('Tunado', 'Tuned'), L('Refinado', 'Refined')];

export const AFFIXES = {
  dmgPct: { fmt: (v) => L(`+${v}% de dano`, `+${v}% damage`), roll: (l) => ri(4, 10) + Math.floor(l * 0.9), w: 1.6 },
  hp: { fmt: (v) => L(`+${v} de vida máxima`, `+${v} max health`), roll: (l) => ri(8, 16) + l * 5, w: 0.25 },
  en: { fmt: (v) => L(`+${v} de energia máxima`, `+${v} max energy`), roll: (l) => ri(6, 12) + l, w: 0.3 },
  crit: { fmt: (v) => L(`+${v}% de chance de crítico`, `+${v}% critical chance`), roll: (l) => ri(2, 5) + Math.floor(l / 6), w: 2.2 },
  critDmg: { fmt: (v) => L(`+${v}% de dano crítico`, `+${v}% critical damage`), roll: (l) => ri(10, 22) + l, w: 0.6 },
  atkSpd: { fmt: (v) => L(`+${v}% de velocidade de ataque`, `+${v}% attack speed`), roll: () => ri(4, 9), w: 2.2 },
  moveSpd: { fmt: (v) => L(`+${v}% de velocidade de movimento`, `+${v}% movement speed`), roll: () => ri(3, 8), w: 1.4, slots: ['feet', 'chip'] },
  armor: { fmt: (v) => L(`+${v} de blindagem`, `+${v} armor`), roll: (l) => ri(4, 9) + l * 2, w: 0.5 },
  hpRegen: { fmt: (v) => L(`+${v} de vida por segundo`, `+${v} health per second`), roll: (l) => +(rr(0.6, 1.5) + l * 0.25).toFixed(1), w: 2 },
  enRegen: { fmt: (v) => L(`+${v} de energia por segundo`, `+${v} energy per second`), roll: (l) => +(rr(0.6, 1.5) + l * 0.12).toFixed(1), w: 2 },
  lifeSteal: { fmt: (v) => L(`+${v}% de roubo de vida`, `+${v}% life steal`), roll: () => +rr(1, 3).toFixed(1), w: 3, slots: ['weapon', 'hands', 'chip'] },
  cdr: { fmt: (v) => L(`-${v}% de recarga das habilidades`, `-${v}% skill cooldown`), roll: () => ri(3, 8), w: 2, slots: ['head', 'chip'] },
  xpPct: { fmt: (v) => L(`+${v}% de experiência`, `+${v}% experience`), roll: () => ri(5, 12), w: 0.5, slots: ['head', 'chip'] },
  findPct: { fmt: (v) => L(`+${v}% de chance de achar itens`, `+${v}% item find`), roll: () => ri(6, 15), w: 0.5 },
};

export const LEGENDARIES = {
  arc: { name: L('Arco Voltaico', 'Voltaic Arc'), desc: L('Acertos têm 15% de chance de lançar um raio que salta para até 3 inimigos (80% de dano).', 'Hits have a 15% chance to cast lightning that jumps to up to 3 enemies (80% damage).') },
  nano: { name: L('Nanorreparo', 'Nanorepair'), desc: L('Abater um inimigo restaura 4% da vida máxima.', 'Killing an enemy restores 4% of max health.') },
  core: { name: L('Núcleo Instável', 'Unstable Core'), desc: L('Inimigos abatidos explodem, causando 60% do dano da arma ao redor.', 'Slain enemies explode, dealing 60% weapon damage around them.') },
  echo: { name: L('Eco Fantasma', 'Ghost Echo'), desc: L('Habilidades têm 25% de chance de não entrar em recarga.', 'Skills have a 25% chance to not go on cooldown.') },
  shield: { name: L('Escudo Reativo', 'Reactive Shield'), desc: L('Ao sofrer dano, ganha um escudo de 20% da vida máxima (a cada 10s).', 'When hit, gain a shield of 20% max health (every 10s).') },
  overload: { name: L('Sobrecarga', 'Overload'), desc: L('Habilidades custam 30% menos energia.', 'Skills cost 30% less energy.') },
};

export function rollRarity(bonus = 0) {
  const w = [62, 28 + bonus * 0.5, 8 + bonus * 0.35, 1.6 + bonus * 0.15];
  return weightedPick([0, 1, 2, 3], (i) => w[i]);
}

export function makeItem({ ilvl, rarity, slot, cls }) {
  slot = slot || pick(['weapon', 'weapon', 'head', 'chest', 'hands', 'feet', 'chip']);
  const R = RARITY[rarity];
  const it = { uid: uid(), slot, rarity, ilvl, affixes: {} };
  if (slot === 'weapon') {
    const C = CLASSES[cls];
    it.cls = cls;
    it.bi = Math.floor(Math.random() * C.weaponNames.length);
    const scale = (1 + 0.14 * (ilvl - 1)) * R.mult * rr(0.92, 1.08);
    it.wMin = Math.max(1, Math.round(C.base.wMin * scale));
    it.wMax = Math.max(it.wMin + 1, Math.round(C.base.wMax * scale));
  } else {
    it.bi = Math.floor(Math.random() * BASES[slot].length);
    if (ARMOR_BASE[slot]) it.armor = Math.round(ARMOR_BASE[slot] * (1 + 0.22 * (ilvl - 1)) * R.mult * rr(0.9, 1.1));
  }
  let n = ri(R.n[0], R.n[1]);
  if (slot === 'chip' && n < 1) n = 1;
  const pool = Object.keys(AFFIXES).filter((k) => !AFFIXES[k].slots || AFFIXES[k].slots.includes(slot));
  for (let i = 0; i < n && pool.length; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    it.affixes[k] = AFFIXES[k].roll(ilvl);
  }
  if (rarity === 3) it.leg = pick(Object.keys(LEGENDARIES));
  it.si = Math.floor(Math.random() * 64);
  return it;
}

// Nome do item no idioma atual (saves antigos guardavam o nome pronto)
export function itemName(it) {
  if (it.bi === undefined) return it.name || '?';
  const base = it.slot === 'weapon' ? CLASSES[it.cls].weaponNames[it.bi] : BASES[it.slot][it.bi];
  if (it.rarity === 3) return `${base} «${LEGENDARIES[it.leg].name}»`;
  if (it.rarity === 2) return `${base} ${SUFFIX[it.si % SUFFIX.length]}`;
  if (it.rarity === 1) return `${base} ${MOD_SUFFIX[it.si % MOD_SUFFIX.length]}`;
  return base;
}

// O item é melhor do que o equipado no mesmo espaço?
export function isUpgrade(it, equip) {
  const cur = equip[it.slot];
  if (!cur) return true;
  return itemScore(it) > itemScore(cur) * 1.03;
}

export function starterWeapon(cls) {
  const it = makeItem({ ilvl: 1, rarity: 0, slot: 'weapon', cls });
  it.wMin = CLASSES[cls].base.wMin;
  it.wMax = CLASSES[cls].base.wMax;
  return it;
}

// Pontuação aproximada para comparar itens
export function itemScore(it) {
  if (!it) return 0;
  let s = 0;
  if (it.slot === 'weapon') s += ((it.wMin + it.wMax) / 2) * 3;
  if (it.armor) s += it.armor * 0.5;
  for (const [k, v] of Object.entries(it.affixes)) s += (AFFIXES[k]?.w || 0) * v;
  if (it.leg) s += 20;
  return s;
}

export function recycleValue(it) {
  return Math.round((6 + it.ilvl * 2) * [1, 2.5, 6, 15][it.rarity]);
}

export function itemStatLines(it) {
  const lines = [];
  if (it.slot === 'weapon') lines.push(`<div class="it-main">${fmt(it.wMin)}–${fmt(it.wMax)} <span>${L('de dano', 'damage')}</span></div>`);
  if (it.armor) lines.push(`<div class="it-main">${fmt(it.armor)} <span>${L('de blindagem', 'armor')}</span></div>`);
  for (const [k, v] of Object.entries(it.affixes)) lines.push(`<div class="it-aff">${AFFIXES[k].fmt(v)}</div>`);
  if (it.leg) lines.push(`<div class="it-leg"><b>${LEGENDARIES[it.leg].name}:</b> ${LEGENDARIES[it.leg].desc}</div>`);
  return lines.join('');
}

export function itemCardHtml(it, extra = '') {
  const R = RARITY[it.rarity];
  return `<div class="item-card r${it.rarity}">
    <div class="it-name" style="color:${R.color}">${itemName(it)}</div>
    <div class="it-type">${R.name} · ${SLOT_NAMES[it.slot]} · ${L('Nível', 'Level')} ${it.ilvl}</div>
    ${itemStatLines(it)}
    ${extra}
  </div>`;
}

export function slotIconSvg(slot) {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SLOT_ICONS[slot]}</svg>`;
}
