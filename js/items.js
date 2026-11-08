// Geração de itens, atributos, raridades e descrições.
import { ri, rr, rnd, pick, weightedPick, uid, fmt } from './utils.js';
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
  { name: L('Mítico', 'Mythic'), color: '#c56bff', hex: 0xb04dff, n: [5, 5], mult: 1.42 },
  { name: L('Divino', 'Divine'), color: '#ffe680', hex: 0xffd84d, n: [6, 6], mult: 1.65 },
];
export const MYTHIC = 4;
// acima do mítico: só cai nas dificuldades mais altas (ver divChance em loot.js)
export const DIVINE = 5;

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

// Poderes dos itens míticos (bem mais fortes que os dos protótipos; a lógica fica em mythic.js)
export const MYTHICS = {
  orbital: { name: L('Laser Orbital', 'Orbital Laser'), desc: L('A cada 3s um laser do céu atinge o inimigo mais forte por perto (300% de dano em área).', 'Every 3s a laser from the sky strikes the strongest nearby enemy (300% area damage).') },
  blades: { name: L('Lâminas Fantasmas', 'Phantom Blades'), desc: L('Três lâminas de neon giram ao seu redor e cortam quem chegar perto.', 'Three neon blades spin around you, cutting anyone who gets close.') },
  reaper: { name: L('Ceifador', 'Reaper'), desc: L('Seus golpes executam inimigos e elites abaixo de 15% de vida. Chefes recebem +25% de dano.', 'Your hits execute enemies and elites below 15% health. Bosses take +25% damage.') },
  singularity: { name: L('Singularidade', 'Singularity'), desc: L('Críticos podem abrir um buraco negro que puxa os inimigos e explode (250% de dano).', 'Critical hits can open a black hole that pulls enemies in and explodes (250% damage).') },
  phoenix: { name: L('Protocolo Fênix', 'Phoenix Protocol'), desc: L('Ao receber um golpe fatal, renasce com metade da vida numa explosão de fogo (a cada 90s).', 'When struck by a fatal blow, you are reborn with half health in a burst of fire (every 90s).') },
  avatar: { name: L('Avatar Neon', 'Neon Avatar'), desc: L('A cada 15 abates vira um avatar de neon por 8s: +50% de dano, mais velocidade e golpes com raios.', 'Every 15 kills you become a neon avatar for 8s: +50% damage, more speed and hits that throw lightning.') },
};

// Poderes divinos: um por espaço de equipamento (a lógica fica em mythic.js). O item divino também tem um poder mítico.
export const DIVINES = {
  zeus: { slot: 'weapon', name: L('Raio de Zeus', 'Bolt of Zeus'), desc: L('Acertos têm 20% de chance de lançar um raio que salta para até 6 inimigos (150% de dano).', 'Hits have a 20% chance to cast lightning that jumps to up to 6 enemies (150% damage).') },
  olympus: { slot: 'head', name: L('Visão do Olimpo', 'Olympian Sight'), desc: L('+12% de chance de crítico e +60% de dano crítico.', '+12% critical chance and +60% critical damage.') },
  aegisDiv: { slot: 'chest', name: L('Égide Divina', 'Divine Aegis'), desc: L('A cada 8s um escudo de trovão bloqueia um golpe inteiro e solta uma onda de choque (200% de dano).', 'Every 8s a thunder shield blocks one whole hit and releases a shockwave (200% damage).') },
  titan: { slot: 'hands', name: L('Punhos de Titã', 'Titan Fists'), desc: L('A cada 5 golpes um trovão cai sobre o alvo (300% de dano em área).', 'Every 5 hits a thunderbolt strikes the target (300% area damage).') },
  hermes: { slot: 'feet', name: L('Sandálias de Hermes', 'Sandals of Hermes'), desc: L('+20% de velocidade de movimento e +8% de esquiva.', '+20% movement speed and +8% dodge.') },
  ambrosia: { slot: 'chip', name: L('Ambrosia', 'Ambrosia'), desc: L('Ao cair abaixo de 30% de vida (ou levar um golpe fatal), cura 50% da vida e fica invulnerável por 2s (a cada 60s).', 'When you drop below 30% health (or take a fatal blow), heal 50% of your health and become invulnerable for 2s (every 60s).') },
};
export const DIV_SET = { name: L('Ira dos Deuses', 'Wrath of the Gods'), desc: L('Com os 6 itens divinos: a cada 6s, 5 raios caem sobre inimigos próximos (250% de dano cada).', 'With all 6 divine items: every 6s, 5 lightning bolts strike nearby enemies (250% damage each).') };
const DIV_OF_SLOT = Object.fromEntries(Object.entries(DIVINES).map(([k, d]) => [d.slot, k]));

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
    it.bi = Math.floor(rnd() * C.weaponNames.length);
    const scale = (1 + 0.14 * (ilvl - 1)) * R.mult * rr(0.92, 1.08);
    it.wMin = Math.max(1, Math.round(C.base.wMin * scale));
    it.wMax = Math.max(it.wMin + 1, Math.round(C.base.wMax * scale));
  } else {
    it.bi = Math.floor(rnd() * BASES[slot].length);
    if (ARMOR_BASE[slot]) it.armor = Math.round(ARMOR_BASE[slot] * (1 + 0.22 * (ilvl - 1)) * R.mult * rr(0.9, 1.1));
  }
  let n = ri(R.n[0], R.n[1]);
  if (slot === 'chip' && n < 1) n = 1;
  const pool = Object.keys(AFFIXES).filter((k) => !AFFIXES[k].slots || AFFIXES[k].slots.includes(slot));
  for (let i = 0; i < n && pool.length; i++) {
    const k = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    it.affixes[k] = AFFIXES[k].roll(ilvl);
  }
  if (rarity === 3) it.leg = pick(Object.keys(LEGENDARIES));
  if (rarity === MYTHIC) {
    // mítico: atributos no topo da faixa e um poder único
    it.myth = pick(Object.keys(MYTHICS));
    for (const k of Object.keys(it.affixes)) it.affixes[k] = fround(it.affixes[k] * 1.3);
  }
  if (rarity === DIVINE) {
    // divino: 6 atributos ainda mais altos, um poder mítico e o poder divino do espaço
    it.myth = pick(Object.keys(MYTHICS));
    it.div = DIV_OF_SLOT[slot];
    for (const k of Object.keys(it.affixes)) it.affixes[k] = fround(it.affixes[k] * 1.45);
  }
  it.si = Math.floor(rnd() * 64);
  return it;
}

// Nome do item no idioma atual (saves antigos guardavam o nome pronto)
export function itemName(it) {
  if (it.bi === undefined) return it.name || '?';
  const plus = it.plus ? ` +${it.plus}` : '';
  const base = (it.slot === 'weapon' ? CLASSES[it.cls].weaponNames[it.bi] : BASES[it.slot][it.bi]) + plus;
  if (it.div) return `⚡ ${base} «${DIVINES[it.div].name}»`;
  if (it.myth) return `✦ ${base} «${MYTHICS[it.myth].name}»`;
  if (it.rarity === 3) return `${base} «${LEGENDARIES[it.leg].name}»`;
  if (it.rarity === 2) return `${base} ${SUFFIX[it.si % SUFFIX.length]}`;
  if (it.rarity === 1) return `${base} ${MOD_SUFFIX[it.si % MOD_SUFFIX.length]}`;
  return base;
}

// ---------------- Ferreiro: aprimora itens (+1, +2...) por créditos ----------------
// Cada nível: +4% de dano/blindagem base e +2,5% nos atributos. A cada 4 níveis, um marco:
// ganha um atributo novo (ou reforça um dos que já tem).
export const FORGE_MAX = [4, 6, 8, 10, 12, 15];
export const forgeMax = (it) => FORGE_MAX[it.rarity] ?? 4;
export const isMilestone = (lv) => lv > 0 && lv % 4 === 0;
// valores pequenos ficam com uma casa decimal para o aprimoramento sempre aparecer
const fround = (v) => (Math.abs(v) < 20 ? Math.round(v * 10) / 10 : Math.round(v));
export function forgeCost(it) {
  return Math.round((25 + it.ilvl * 10) * [1, 1.4, 2, 2.8, 4, 6][it.rarity] * Math.pow(1.32, it.plus | 0));
}
export function forgeItem(it) {
  // a0: atributos originais (os marcos mudam base.affixes); itens antigos não têm e usam base.affixes
  if (!it.base) it.base = { wMin: it.wMin, wMax: it.wMax, armor: it.armor, affixes: { ...it.affixes }, a0: { ...it.affixes } };
  it.plus = (it.plus | 0) + 1;
  let gained = null;
  if (isMilestone(it.plus)) {
    const b = it.base.affixes;
    const pool = Object.keys(AFFIXES).filter((k) => (!AFFIXES[k].slots || AFFIXES[k].slots.includes(it.slot)) && !(k in b));
    if (pool.length && Object.keys(b).length < 6) {
      gained = pick(pool);
      b[gained] = AFFIXES[gained].roll(it.ilvl);
    } else if (Object.keys(b).length) {
      gained = pick(Object.keys(b));
      b[gained] = fround(b[gained] * 1.25);
    }
  }
  applyForge(it);
  return gained;
}
function applyForge(it) {
  const b = it.base;
  const k = 1 + 0.04 * it.plus;
  const ka = 1 + 0.025 * it.plus;
  if (b.wMin) {
    it.wMin = Math.round(b.wMin * k);
    it.wMax = Math.max(it.wMin + 1, Math.round(b.wMax * k));
  }
  if (b.armor) it.armor = Math.round(b.armor * k);
  it.affixes = {};
  for (const [a, v] of Object.entries(b.affixes)) it.affixes[a] = fround(v * ka);
}

// O item como era antes do ferreiro (sem o +N). Comparações usam isso: um item novo melhor
// deve aparecer como melhoria mesmo que o equipado já esteja aprimorado.
export function unforged(it) {
  if (!it || !it.plus || !it.base) return it;
  const b = it.base;
  return { ...it, plus: 0, wMin: b.wMin, wMax: b.wMax, armor: b.armor, affixes: b.a0 || b.affixes };
}

// O item é melhor do que o equipado no mesmo espaço? (os dois sem aprimoramento)
export function isUpgrade(it, equip) {
  const cur = equip[it.slot];
  if (!cur) return true;
  return itemScore(unforged(it)) > itemScore(unforged(cur)) * 1.03;
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
  if (it.myth) s += 45;
  if (it.div) s += 80;
  return s;
}

export function recycleValue(it) {
  return Math.round((6 + it.ilvl * 2) * [1, 2.5, 6, 15, 40, 100][it.rarity] * (1 + 0.15 * (it.plus | 0)));
}

export function itemStatLines(it) {
  const lines = [];
  if (it.slot === 'weapon') lines.push(`<div class="it-main">${fmt(it.wMin)}–${fmt(it.wMax)} <span>${L('de dano', 'damage')}</span></div>`);
  if (it.armor) lines.push(`<div class="it-main">${fmt(it.armor)} <span>${L('de blindagem', 'armor')}</span></div>`);
  for (const [k, v] of Object.entries(it.affixes)) lines.push(`<div class="it-aff">${AFFIXES[k].fmt(v)}</div>`);
  if (it.leg) lines.push(`<div class="it-leg"><b>${LEGENDARIES[it.leg].name}:</b> ${LEGENDARIES[it.leg].desc}</div>`);
  if (it.div) lines.push(`<div class="it-div"><b>⚡ ${DIVINES[it.div].name}:</b> ${DIVINES[it.div].desc}</div>`);
  if (it.myth) lines.push(`<div class="it-myth"><b>✦ ${MYTHICS[it.myth].name}:</b> ${MYTHICS[it.myth].desc}</div>`);
  return lines.join('');
}

export function itemCardHtml(it, extra = '') {
  const R = RARITY[it.rarity];
  return `<div class="item-card r${it.rarity}">
    <div class="it-name" style="color:${R.color}">${itemName(it)}</div>
    <div class="it-type">${R.name} · ${SLOT_NAMES[it.slot]} · ${L('Nível', 'Level')} ${it.ilvl}${it.plus ? ` · <span class="it-plus">⚒ +${it.plus}/${forgeMax(it)}</span>` : ''}${it.fav ? ` · <span class="it-fav">★ ${L('Favorito', 'Favorite')}</span>` : ''}</div>
    ${itemStatLines(it)}
    ${extra}
  </div>`;
}

// Diferenças de atributos entre um item e o equipado (▲ verde ganha, ▼ vermelho perde)
const DIFF_NAMES = {
  dmgPct: ['% de dano', '% damage'], hp: [' de vida', ' health'], en: [' de energia', ' energy'], crit: ['% de crítico', '% crit'],
  critDmg: ['% de dano crítico', '% crit damage'], atkSpd: ['% vel. de ataque', '% attack speed'], moveSpd: ['% movimento', '% movement'],
  armor: [' de blindagem', ' armor'], hpRegen: [' vida/s', ' health/s'], enRegen: [' energia/s', ' energy/s'], lifeSteal: ['% roubo de vida', '% life steal'],
  cdr: ['% recarga', '% cooldown'], xpPct: ['% experiência', '% experience'], findPct: ['% achar itens', '% item find'],
};
export function itemDiffHtml(it, cur) {
  if (!cur) return '';
  // compara os itens sem o aprimoramento do ferreiro
  const forged = Math.max(it.plus | 0, cur.plus | 0);
  it = unforged(it);
  cur = unforged(cur);
  const rows = [];
  const add = (d, label, lowerBetter) => {
    d = Math.round(d * 10) / 10;
    if (!d) return;
    const good = lowerBetter ? d < 0 : d > 0;
    rows.push(`<div class="${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${d > 0 ? '+' : ''}${d.toLocaleString(L('pt-BR', 'en-US'), { maximumFractionDigits: 1 })}${label}</div>`);
  };
  if (it.slot === 'weapon') add((it.wMin + it.wMax) / 2 - (cur.wMin + cur.wMax) / 2, L(' de dano médio', ' avg damage'));
  // blindagem base + afixo de blindagem somados
  add((it.armor || 0) + (it.affixes.armor || 0) - (cur.armor || 0) - (cur.affixes.armor || 0), L(DIFF_NAMES.armor[0], DIFF_NAMES.armor[1]));
  for (const k of Object.keys(AFFIXES)) {
    if (k === 'armor') continue;
    const n = DIFF_NAMES[k];
    // recarga aparece como "-X%": mais é melhor, mostra como redução
    if (k === 'cdr') add(-((it.affixes.cdr || 0) - (cur.affixes.cdr || 0)), L(n[0], n[1]), true);
    else add((it.affixes[k] || 0) - (cur.affixes[k] || 0), L(n[0], n[1]));
  }
  if (it.div !== cur.div) {
    if (cur.div) rows.push(`<div class="down">▼ ⚡ ${DIVINES[cur.div].name}</div>`);
    if (it.div) rows.push(`<div class="up">▲ ⚡ ${DIVINES[it.div].name}</div>`);
  }
  if (it.myth !== cur.myth) {
    if (cur.myth) rows.push(`<div class="down">▼ ✦ ${MYTHICS[cur.myth].name}</div>`);
    if (it.myth) rows.push(`<div class="up">▲ ✦ ${MYTHICS[it.myth].name}</div>`);
  }
  if (it.leg !== cur.leg) {
    if (cur.leg) rows.push(`<div class="down">▼ ${LEGENDARIES[cur.leg].name}</div>`);
    if (it.leg) rows.push(`<div class="up">▲ ${LEGENDARIES[it.leg].name}</div>`);
  }
  if (!rows.length) rows.push(`<div>= ${L('Igual ao equipado', 'Same as equipped')}</div>`);
  const note = forged ? ` <span class="it-diff-n">${L('(sem aprimoramento ⚒)', '(without upgrades ⚒)')}</span>` : '';
  return `<div class="it-diff"><div class="it-diff-h">${L('Comparado ao equipado', 'Compared to equipped')}${note}</div>${rows.join('')}</div>`;
}

// Ordem do inventário: melhorias primeiro, depois raridade, tipo e pontuação
export function sortInventory(inv, equip) {
  const key = inv.map((it) => ({ it, up: isUpgrade(it, equip) ? 1 : 0, s: itemScore(it) }));
  key.sort((a, b) => b.up - a.up || b.it.rarity - a.it.rarity || SLOTS.indexOf(a.it.slot) - SLOTS.indexOf(b.it.slot) || b.s - a.s);
  key.forEach((k, i) => (inv[i] = k.it));
}

export function slotIconSvg(slot) {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SLOT_ICONS[slot]}</svg>`;
}
