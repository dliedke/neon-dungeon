// Geração de itens, atributos, raridades e descrições.
import { ri, rr, pick, weightedPick, uid, fmt } from './utils.js';
import { CLASSES } from './classes.js';

export const SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet', 'chip'];
export const SLOT_NAMES = { weapon: 'Arma', head: 'Implante', chest: 'Torso', hands: 'Mãos', feet: 'Pés', chip: 'Chip' };
export const SLOT_ICONS = {
  weapon: '<path d="M6 26L24 8M20 6l6 6M8 20l4 4"/>',
  head: '<path d="M8 18a8 8 0 0 1 16 0v4H8z"/><path d="M10 17h12"/>',
  chest: '<path d="M10 6l-5 4v16h22V10l-5-4-6 4z"/>',
  hands: '<path d="M10 28V14l2-6 2 6V10l2-4 2 4v4l2-4 2 4v14z"/>',
  feet: '<path d="M8 6h7v14l9 3v5H8z"/>',
  chip: '<rect x="9" y="9" width="14" height="14" rx="2"/><path d="M13 5v4M19 5v4M13 23v4M19 23v4M5 13h4M5 19h4M23 13h4M23 19h4"/>',
};

export const RARITY = [
  { name: 'Comum', color: '#c8d0e0', hex: 0xc8d0e0, n: [0, 0], mult: 1 },
  { name: 'Modificado', color: '#4d9bff', hex: 0x3d8bff, n: [1, 2], mult: 1.08 },
  { name: 'Raro', color: '#ffd23d', hex: 0xffd23d, n: [3, 4], mult: 1.16 },
  { name: 'Protótipo', color: '#ff7a1a', hex: 0xff7a1a, n: [4, 4], mult: 1.26 },
];

const BASES = {
  head: ['Implante Ocular', 'Visor Tático', 'Chip Cortical', 'Capacete Neural'],
  chest: ['Jaqueta Blindada', 'Colete de Kevlar', 'Sobretudo Sintético', 'Placa Subdérmica'],
  hands: ['Luvas Hidráulicas', 'Manoplas Sinápticas', 'Braços Cromados', 'Luvas de Grafeno'],
  feet: ['Botas Magnéticas', 'Tênis Reflex', 'Pernas Servo', 'Botas de Salto'],
  chip: ['Chip Neural', 'Módulo de Memória', 'Núcleo Biocibernético', 'Coprocessador'],
};
const ARMOR_BASE = { head: 4, chest: 9, hands: 3, feet: 3, chip: 0 };
const SUFFIX = ['Mk-II', 'Mk-III', 'X-7', 'V9', 'Série Ômega', 'Militar', 'de Elite', 'Customizado', 'Pirata', 'Corporativo', 'Experimental', 'Kitsune', 'Ronin', 'Spectre'];

export const AFFIXES = {
  dmgPct: { fmt: (v) => `+${v}% de dano`, roll: (l) => ri(4, 10) + Math.floor(l * 0.9), w: 1.6 },
  hp: { fmt: (v) => `+${v} de vida máxima`, roll: (l) => ri(8, 16) + l * 5, w: 0.25 },
  en: { fmt: (v) => `+${v} de energia máxima`, roll: (l) => ri(6, 12) + l, w: 0.3 },
  crit: { fmt: (v) => `+${v}% de chance de crítico`, roll: (l) => ri(2, 5) + Math.floor(l / 6), w: 2.2 },
  critDmg: { fmt: (v) => `+${v}% de dano crítico`, roll: (l) => ri(10, 22) + l, w: 0.6 },
  atkSpd: { fmt: (v) => `+${v}% de velocidade de ataque`, roll: () => ri(4, 9), w: 2.2 },
  moveSpd: { fmt: (v) => `+${v}% de velocidade de movimento`, roll: () => ri(3, 8), w: 1.4, slots: ['feet', 'chip'] },
  armor: { fmt: (v) => `+${v} de blindagem`, roll: (l) => ri(4, 9) + l * 2, w: 0.5 },
  hpRegen: { fmt: (v) => `+${v} de vida por segundo`, roll: (l) => +(rr(0.6, 1.5) + l * 0.25).toFixed(1), w: 2 },
  enRegen: { fmt: (v) => `+${v} de energia por segundo`, roll: (l) => +(rr(0.6, 1.5) + l * 0.12).toFixed(1), w: 2 },
  lifeSteal: { fmt: (v) => `+${v}% de roubo de vida`, roll: () => +rr(1, 3).toFixed(1), w: 3, slots: ['weapon', 'hands', 'chip'] },
  cdr: { fmt: (v) => `-${v}% de recarga das habilidades`, roll: () => ri(3, 8), w: 2, slots: ['head', 'chip'] },
  xpPct: { fmt: (v) => `+${v}% de experiência`, roll: () => ri(5, 12), w: 0.5, slots: ['head', 'chip'] },
  findPct: { fmt: (v) => `+${v}% de chance de achar itens`, roll: () => ri(6, 15), w: 0.5 },
};

export const LEGENDARIES = {
  arc: { name: 'Arco Voltaico', desc: 'Acertos têm 15% de chance de lançar um raio que salta para até 3 inimigos (80% de dano).' },
  nano: { name: 'Nanorreparo', desc: 'Abater um inimigo restaura 4% da vida máxima.' },
  core: { name: 'Núcleo Instável', desc: 'Inimigos abatidos explodem, causando 60% do dano da arma ao redor.' },
  echo: { name: 'Eco Fantasma', desc: 'Habilidades têm 25% de chance de não entrar em recarga.' },
  shield: { name: 'Escudo Reativo', desc: 'Ao sofrer dano, ganha um escudo de 20% da vida máxima (a cada 10s).' },
  overload: { name: 'Sobrecarga', desc: 'Habilidades custam 30% menos energia.' },
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
    it.base = pick(C.weaponNames);
    const scale = (1 + 0.14 * (ilvl - 1)) * R.mult * rr(0.92, 1.08);
    it.wMin = Math.max(1, Math.round(C.base.wMin * scale));
    it.wMax = Math.max(it.wMin + 1, Math.round(C.base.wMax * scale));
  } else {
    it.base = pick(BASES[slot]);
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
  it.name = itemName(it);
  return it;
}

function itemName(it) {
  if (it.rarity === 3) return `${it.base} «${LEGENDARIES[it.leg].name}»`;
  if (it.rarity === 2) return `${it.base} ${pick(SUFFIX)}`;
  if (it.rarity === 1) return `${it.base} ${pick(['v2', 'Plus', 'Turbo', 'Pro', 'Tunado', 'Refinado'])}`;
  return it.base;
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
  if (it.slot === 'weapon') lines.push(`<div class="it-main">${fmt(it.wMin)}–${fmt(it.wMax)} <span>de dano</span></div>`);
  if (it.armor) lines.push(`<div class="it-main">${fmt(it.armor)} <span>de blindagem</span></div>`);
  for (const [k, v] of Object.entries(it.affixes)) lines.push(`<div class="it-aff">${AFFIXES[k].fmt(v)}</div>`);
  if (it.leg) lines.push(`<div class="it-leg"><b>${LEGENDARIES[it.leg].name}:</b> ${LEGENDARIES[it.leg].desc}</div>`);
  return lines.join('');
}

export function itemCardHtml(it, extra = '') {
  const R = RARITY[it.rarity];
  return `<div class="item-card r${it.rarity}">
    <div class="it-name" style="color:${R.color}">${it.name}</div>
    <div class="it-type">${R.name} · ${SLOT_NAMES[it.slot]} · Nível ${it.ilvl}</div>
    ${itemStatLines(it)}
    ${extra}
  </div>`;
}

export function slotIconSvg(slot) {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SLOT_ICONS[slot]}</svg>`;
}
