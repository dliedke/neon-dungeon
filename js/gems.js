// Gemas: caem dos inimigos, vão para a bolsa (c.gems) e são engastadas no equipamento.
// Os engastes ficam no ESPAÇO do equipamento (c.sockets[slot]), não no item: trocar de arma
// não perde nada. Quantos encaixes valem depende do item equipado (socketsOf em items.js);
// gemas a mais ficam guardadas no espaço, inativas, até equipar um item com mais encaixes.
// 3 gemas iguais viram 1 do nível seguinte (Fundir), pagando créditos.
import { G } from './state.js';
import { L } from './i18n.js';
import { chance, rr } from './utils.js';
import { SLOTS, socketsOf } from './items.js';
import { PFMT } from './classes.js';
import { effFloor } from './run.js';
import { diffIlvl, abyssLvl } from './enemies.js';
import { spawnPickup } from './loot.js';
import { achAdd, achMark } from './ach.js';

// Cada gema dá um bônus na arma (w) e outro nos demais espaços (a). v: valor por nível (20 níveis).
// A partir do nível VII (Neon) a gema também libera o PODER do tipo (GEM_POW), mais forte a cada nível até o XX.
// Do XI em diante os atributos com teto (recarga, roubo de vida, esquiva, redução de dano) crescem mais devagar.
export const GEMS = {
  ruby: { pt: 'Rubi', en: 'Ruby', f: 0, css: '#ff3a5a', hex: 0xff3a5a, w: ['dmgPct', [6, 11, 18, 28, 42, 62, 90, 125, 170, 230, 290, 360, 445, 545, 660, 790, 940, 1110, 1300, 1510]], a: ['hpPct', [1.5, 2.5, 4, 5.5, 7.5, 10, 13, 17, 22, 28, 35, 43, 53, 65, 79, 95, 115, 135, 160, 185]] },
  sapphire: { pt: 'Safira', en: 'Sapphire', f: 1, css: '#3d8bff', hex: 0x3d8bff, w: ['atkSpd', [2, 4, 6, 8.5, 12, 15, 20, 25, 31, 38, 48, 60, 74, 90, 110, 130, 155, 185, 215, 250]], a: ['cdr', [0.6, 1.2, 1.8, 2.5, 3.5, 4.5, 6, 7.5, 9, 11, 12, 13, 14.5, 16, 17.5, 19.5, 21, 23, 25, 28]] },
  emerald: { pt: 'Esmeralda', en: 'Emerald', f: 1, css: '#39ff88', hex: 0x39ff88, w: ['lifeSteal', [0.5, 0.8, 1.2, 1.8, 2.5, 3.5, 5, 6.5, 8, 10, 11, 12, 13, 14.5, 16, 17.5, 19.5, 21, 23, 25]], a: ['dodge', [0.4, 0.6, 1, 1.5, 2, 2.7, 3.5, 4.5, 5.5, 7, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 14, 15.5, 17, 18.5]] },
  topaz: { pt: 'Topázio', en: 'Topaz', f: 0, css: '#ffd23d', hex: 0xffd23d, w: ['crit', [1.2, 2, 3, 4.5, 6, 8.5, 12, 15, 19, 24, 30, 37, 46, 56, 68, 82, 98, 115, 135, 155]], a: ['findPct', [4, 6, 10, 15, 20, 27, 36, 46, 58, 72, 90, 110, 135, 165, 200, 240, 285, 335, 390, 450]] },
  amethyst: { pt: 'Ametista', en: 'Amethyst', f: 1, css: '#c56bff', hex: 0xb04dff, w: ['critDmg', [8, 13, 20, 30, 44, 62, 86, 115, 150, 195, 245, 305, 375, 460, 555, 665, 790, 930, 1090, 1265]], a: ['dmgRed', [0.4, 0.6, 1, 1.5, 2, 2.7, 3.5, 4.5, 5.5, 7, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 14, 15.5, 17, 18.5]] },
  diamond: { pt: 'Diamante', en: 'Diamond', f: 0, css: '#bff6ff', hex: 0xbff6ff, w: ['eliteDmg', [4, 6, 10, 15, 21, 30, 42, 56, 72, 92, 115, 145, 180, 220, 265, 320, 380, 450, 525, 610]], a: ['armorPct', [2, 3, 5, 7.5, 10, 13.5, 18, 23, 29, 36, 45, 56, 69, 84, 100, 120, 145, 170, 200, 230]] },
};
export const GEM_KEYS = Object.keys(GEMS);
export const GEM_TIERS = 20;
export const GEM_TOP = GEM_TIERS - 1;
export const GEM_NEON = 6; // nível VII: a gema Neon (e acima) libera o poder do tipo
// nome do nível: [masculino, feminino, inglês]
const TIER_NAMES = [
  ['Lascado', 'Lascada', 'Chipped'], ['Bruto', 'Bruta', 'Rough'], ['Lapidado', 'Lapidada', 'Cut'], ['Polido', 'Polida', 'Polished'],
  ['Perfeito', 'Perfeita', 'Perfect'], ['Radiante', 'Radiante', 'Radiant'], ['Neon', 'Neon', 'Neon'],
  ['Estelar', 'Estelar', 'Stellar'], ['Quântico', 'Quântica', 'Quantum'], ['Singular', 'Singular', 'Singular'],
  ['Celeste', 'Celeste', 'Celestial'], ['Astral', 'Astral', 'Astral'], ['Prismático', 'Prismática', 'Prismatic'], ['Etéreo', 'Etérea', 'Ethereal'],
  ['Cósmico', 'Cósmica', 'Cosmic'], ['Sagrado', 'Sagrada', 'Sacred'], ['Eterno', 'Eterna', 'Eternal'], ['Infinito', 'Infinita', 'Infinite'],
  ['Ancestral', 'Ancestral', 'Ancestral'], ['Absoluto', 'Absoluta', 'Absolute'],
];
export const TIER_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
// custo para fundir 3 gemas do nível t em 1 do nível t+1
// (baratinho: no andar 50 um abate rende ~100¢, então até a fusão XIX → XX custa menos de um andar)
const FUSE_COST = [5, 10, 20, 40, 75, 125, 200, 300, 450, 650, 900, 1250, 1700, 2300, 3000, 4000, 5500, 7500, 10000];

// Poderes das gemas: um por tipo, ativo com pelo menos uma gema Neon (VII) ou melhor num encaixe ativo.
// Força pelo melhor nível engastado do tipo: VII = 1, VIII = 2, IX = 3, X = 4 ... XX = 14 (índice k - 1 nas tabelas).
// A lógica fica em mythic.js (gemOnHit, gemOnKill, gemBlock) e em player.js (Seiva Viva).
const pctx = (m) => `${Math.round(m * 100)}%`;
export const GEM_POW = {
  ruby: {
    pt: 'Coração de Brasa', en: 'Ember Heart', mult: [0.6, 0.9, 1.25, 1.7, 2.2, 2.8, 3.5, 4.3, 5.2, 6.2, 7.3, 8.5, 10, 12], r: [2.2, 2.5, 2.8, 3.2, 3.4, 3.6, 3.8, 4, 4.2, 4.4, 4.6, 4.8, 5, 5.2],
    desc: (k) => L(`Inimigos abatidos explodem em fogo: ${pctx(GEM_POW.ruby.mult[k - 1])} de dano a até ${GEM_POW.ruby.r[k - 1]}m, e os atingidos queimam.`, `Slain enemies burst into fire: ${pctx(GEM_POW.ruby.mult[k - 1])} damage within ${GEM_POW.ruby.r[k - 1]}m, and those hit burn.`),
  },
  sapphire: {
    pt: 'Maré Cobalto', en: 'Cobalt Tide', cd: [0.15, 0.25, 0.35, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1],
    desc: (k) => L(`Cada abate recarrega todas as habilidades ${GEM_POW.sapphire.cd[k - 1]}s mais rápido.`, `Every kill recharges all skills ${GEM_POW.sapphire.cd[k - 1]}s faster.`),
  },
  emerald: {
    pt: 'Seiva Viva', en: 'Living Sap', regen: [0.3, 0.5, 0.75, 1, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2, 2.35, 2.5],
    desc: (k) => L(`Regenera ${GEM_POW.emerald.regen[k - 1]}% da vida máxima por segundo.`, `Regenerate ${GEM_POW.emerald.regen[k - 1]}% of max health per second.`),
  },
  topaz: {
    pt: 'Trovão Dourado', en: 'Golden Thunder', ch: [10, 13, 16, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40], jumps: [3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11], mult: [0.7, 1, 1.3, 1.7, 2.1, 2.6, 3.1, 3.7, 4.4, 5.1, 5.9, 6.8, 7.8, 9],
    desc: (k) => L(`Acertos têm ${GEM_POW.topaz.ch[k - 1]}% de chance de lançar um raio que salta para até ${GEM_POW.topaz.jumps[k - 1]} inimigos (${pctx(GEM_POW.topaz.mult[k - 1])} de dano).`, `Hits have a ${GEM_POW.topaz.ch[k - 1]}% chance to cast lightning that jumps to up to ${GEM_POW.topaz.jumps[k - 1]} enemies (${pctx(GEM_POW.topaz.mult[k - 1])} damage).`),
  },
  amethyst: {
    pt: 'Fenda Violeta', en: 'Violet Rift', mult: [1, 1.5, 2, 2.8, 3.6, 4.5, 5.5, 6.6, 7.8, 9.1, 10.5, 12, 13.6, 15.5],
    desc: (k) => L(`Críticos têm 15% de chance de abrir uma fenda no alvo que explode (${pctx(GEM_POW.amethyst.mult[k - 1])} de dano em área).`, `Critical hits have a 15% chance to open a rift on the target that explodes (${pctx(GEM_POW.amethyst.mult[k - 1])} area damage).`),
  },
  diamond: {
    pt: 'Pele de Diamante', en: 'Diamond Skin', cd: [12, 10, 8, 6, 5.5, 5, 4.6, 4.2, 3.8, 3.5, 3.2, 2.9, 2.7, 2.5],
    desc: (k) => L(`Bloqueia um golpe inteiro a cada ${GEM_POW.diamond.cd[k - 1]}s.`, `Blocks one whole hit every ${GEM_POW.diamond.cd[k - 1]}s.`),
  },
};
export const gemPowName = (g) => L(GEM_POW[g].pt, GEM_POW[g].en);
// força do poder que uma gema de nível t dá (0 = nenhum)
export const gemPowLvl = (t) => Math.max(0, t - GEM_NEON + 1);
export const fuseCost = (t) => FUSE_COST[t] ?? Infinity;
export const MAX_SOCKETS = 4;

export const gemName = (g, t) => {
  const D = GEMS[g];
  return L(`${D.pt} ${TIER_NAMES[t][D.f]}`, `${TIER_NAMES[t][2]} ${D.en}`);
};
export const gemTierName = (t) => L(TIER_NAMES[t][0], TIER_NAMES[t][2]);
// bônus da gema num espaço: [chave do atributo, valor]
export const gemEffect = (g, t, slot) => {
  const [k, v] = GEMS[g][slot === 'weapon' ? 'w' : 'a'];
  return [k, v[t]];
};
export const gemEffectText = (g, t, slot) => {
  const [k, v] = gemEffect(g, t, slot);
  return PFMT[k](v);
};

// Ícone: pedra lapidada com o brilho da cor; níveis altos ganham mais facetas e um halo
// Estelar, Quântica e Singular: 1, 2 e 4 brilhos brancos nos cantos; do Celeste (XI) em diante um anel branco por fora
// e um núcleo branco na pedra (mais fortes do Sagrado, XVI, em diante)
const STARS = [[27, 5], [5, 27], [5, 5], [27, 27]].map(([x, y]) => `<path d="M${x} ${y - 3.4}L${x + 1} ${y - 1}L${x + 3.4} ${y}L${x + 1} ${y + 1}L${x} ${y + 3.4}L${x - 1} ${y + 1}L${x - 3.4} ${y}L${x - 1} ${y - 1}z" fill="#fff" stroke="none"/>`);
export function gemSvg(g, t) {
  const c = GEMS[g].css;
  // halo: tracejado no Perfeita/Radiante/Neon, contínuo e mais grosso do Estelar em diante
  const halo = t >= 4 ? `<circle cx="16" cy="16" r="14" fill="none" stroke="${c}" stroke-opacity="${t >= 6 ? 0.9 : 0.45}"${t >= 7 ? ' stroke-width="2.4"' : ` stroke-dasharray="${t >= 6 ? '2 2' : '3 4'}"`}/>` : '';
  const facets = t >= 2 ? '<path d="M11 12l5 13 5-13" stroke-opacity="0.75"/>' : '';
  const stars = t >= 7 ? STARS.slice(0, t >= 9 ? 4 : t >= 8 ? 2 : 1).join('') : '';
  const ring = t >= 10 ? `<circle cx="16" cy="16" r="15.3" fill="none" stroke="#fff" stroke-opacity="${t >= 15 ? 0.9 : 0.5}" stroke-width="${t >= 15 ? 1.3 : 0.8}"/>` : '';
  const core = t >= 10 ? `<path d="M12.5 12h7L16 21z" fill="#fff" fill-opacity="${t >= 15 ? 0.85 : 0.55}" stroke="none"/>` : '';
  // a pedra cresce com o nível (Lascada pequena, Neon cheia; acima disso não cresce mais)
  const k = 0.72 + Math.min(t, 6) * 0.05;
  return `<svg viewBox="0 0 32 32" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round">${halo}<g transform="translate(16 16.5) scale(${k}) translate(-16 -16.5)"><path d="M9 12l4-5h6l4 5-7 14z" fill="${c}" fill-opacity="${Math.min(0.85, 0.18 + t * 0.09)}"/><path d="M9 12h14M13 7l-2 5M19 7l2 5"/>${facets}${core}</g>${ring}${stars}</svg>`;
}

// ---------------- Bolsa e engastes no personagem ----------------
const pouch = (c) => c.gems || (c.gems = {});
export const gemCount = (c, g, t) => (pouch(c)[g] && pouch(c)[g][t]) | 0;
export function addGem(c, g, t, n = 1) {
  const P = pouch(c);
  if (!P[g]) P[g] = Array(GEM_TIERS).fill(0);
  P[g][t] = Math.max(0, (P[g][t] | 0) + n);
}
export const gemTotal = (c) => GEM_KEYS.reduce((s, g) => s + (c.gems?.[g] || []).reduce((a, b) => a + (b | 0), 0), 0);
export const slotGems = (c, slot) => (c.sockets && c.sockets[slot]) || [];
// encaixes que valem no espaço (depende do item equipado)
export const slotSockets = (c, slot) => Math.min(MAX_SOCKETS, socketsOf(c.equip[slot]));
export const socketedTotal = (c) => SLOTS.reduce((s, sl) => s + slotGems(c, sl).length, 0);

// saves antigos (e da nuvem) sem gemas, ou com dados estranhos
export function sanitizeGems(c) {
  const P = c.gems && typeof c.gems === 'object' ? c.gems : {};
  c.gems = {};
  for (const g of GEM_KEYS) {
    const a = Array.isArray(P[g]) ? P[g] : [];
    c.gems[g] = Array.from({ length: GEM_TIERS }, (_, t) => Math.max(0, Math.floor(+a[t] || 0)));
  }
  const S = c.sockets && typeof c.sockets === 'object' ? c.sockets : {};
  c.sockets = {};
  for (const slot of SLOTS) {
    const list = (Array.isArray(S[slot]) ? S[slot] : []).filter((x) => x && GEMS[x.g] && x.t >= 0 && x.t < GEM_TIERS).map((x) => ({ g: x.g, t: x.t | 0 }));
    if (list.length) c.sockets[slot] = list.slice(0, MAX_SOCKETS);
  }
}

// Atributos das gemas ativas (as primeiras N de cada espaço, N = encaixes do item equipado)
export function gemMods(c) {
  const m = {};
  if (!c.sockets) return m;
  for (const slot of SLOTS) {
    const list = c.sockets[slot];
    if (!list || !list.length) continue;
    const n = slotSockets(c, slot);
    for (let i = 0; i < list.length && i < n; i++) {
      const [k, v] = gemEffect(list[i].g, list[i].t, slot);
      m[k] = (m[k] || 0) + v;
    }
  }
  for (const k in m) m[k] = Math.round(m[k] * 10) / 10;
  return m;
}
// Poderes ativos: { tipo: força 1..14 } pelo melhor nível engastado do tipo (só encaixes ativos)
export function gemPowers(c) {
  const out = {};
  if (!c.sockets) return out;
  for (const slot of SLOTS) {
    const list = c.sockets[slot];
    if (!list) continue;
    const n = slotSockets(c, slot);
    for (let i = 0; i < list.length && i < n; i++) {
      const k = gemPowLvl(list[i].t);
      if (k > (out[list[i].g] || 0)) out[list[i].g] = k;
    }
  }
  return out;
}

// Funde 3 gemas iguais numa do nível seguinte. Devolve false se não deu.
export function fuseGem(c, g, t) {
  if (t >= GEM_TOP || gemCount(c, g, t) < 3 || c.credits < fuseCost(t)) return false;
  c.credits -= fuseCost(t);
  addGem(c, g, t, -3);
  addGem(c, g, t + 1, 1);
  achAdd('gemFuse');
  if (t + 1 >= 4) achMark('flags', 'gemPerfect');
  if (t + 1 >= GEM_NEON) achMark('flags', 'gemNeon');
  if (t + 1 >= 9) achMark('flags', 'gemSingular');
  if (t + 1 >= GEM_TOP) achMark('flags', 'gemApex');
  return true;
}
// Funde tudo o que der (de baixo para cima, então sobe em cascata), de um tipo ou de todos.
// Para quando acabam os créditos. Devolve { made, spent, best: [g, t] }.
export function fuseAll(c, only) {
  let made = 0;
  let spent = 0;
  let best = null;
  for (let t = 0; t < GEM_TOP; t++) {
    for (const g of only ? [only] : GEM_KEYS) {
      while (gemCount(c, g, t) >= 3 && c.credits >= fuseCost(t)) {
        spent += fuseCost(t);
        fuseGem(c, g, t);
        made++;
        if (!best || t + 1 >= best[1]) best = [g, t + 1];
      }
    }
  }
  return { made, spent, best };
}
// quantas fusões dá para fazer agora (sem olhar os créditos)
export function fusableCount(c, only) {
  let n = 0;
  for (const g of only ? [only] : GEM_KEYS) for (let t = 0; t < GEM_TOP; t++) n += Math.floor(gemCount(c, g, t) / 3);
  return n;
}
// custo de fundir tudo (simulado numa cópia, com cascata)
export function fuseAllCost(c, only) {
  const sim = { credits: Infinity, gems: JSON.parse(JSON.stringify(c.gems || {})) };
  let spent = 0;
  for (let t = 0; t < GEM_TOP; t++) {
    for (const g of only ? [only] : GEM_KEYS) {
      const k = Math.floor(gemCount(sim, g, t) / 3);
      if (!k) continue;
      spent += k * fuseCost(t);
      addGem(sim, g, t, -3 * k);
      addGem(sim, g, t + 1, k);
    }
  }
  return spent;
}

// Engasta a gema no espaço. Se os encaixes estão cheios, troca pela mais fraca (que volta para a bolsa).
// Devolve: 'ok', { swapped: gem } ou um motivo ('none', 'noslot', 'full').
export function socketGem(c, g, t, slot) {
  if (gemCount(c, g, t) < 1) return 'none';
  const n = slotSockets(c, slot);
  if (!n) return 'noslot';
  if (!c.sockets) c.sockets = {};
  const list = c.sockets[slot] || (c.sockets[slot] = []);
  const active = Math.min(n, list.length);
  addGem(c, g, t, -1);
  if (active < n) {
    // as inativas (a mais) ficam depois das ativas
    list.splice(active, 0, { g, t });
    achAdd('gemSocket');
    return 'ok';
  }
  // cheio: troca a mais fraca das ativas (só se a nova for melhor)
  let wi = 0;
  for (let i = 1; i < active; i++) if (list[i].t < list[wi].t) wi = i;
  if (list[wi].t > t || (list[wi].t === t && list[wi].g === g)) {
    addGem(c, g, t, 1);
    return 'full';
  }
  const old = list[wi];
  list[wi] = { g, t };
  addGem(c, old.g, old.t, 1);
  achAdd('gemSocket');
  return { swapped: old };
}
export function unsocketGem(c, slot, i) {
  const list = slotGems(c, slot);
  const x = list[i];
  if (!x) return null;
  list.splice(i, 1);
  if (!list.length) delete c.sockets[slot];
  addGem(c, x.g, x.t, 1);
  return x;
}
// melhor gema (nível mais alto) de cada tipo que está na bolsa
export function bestInPouch(c) {
  const out = [];
  for (const g of GEM_KEYS) {
    for (let t = GEM_TOP; t >= 0; t--) {
      if (gemCount(c, g, t) > 0) {
        out.push([g, t]);
        break;
      }
    }
  }
  return out.sort((a, b) => b[1] - a[1]);
}
// encaixes vazios que já valem (para o aviso no botão da aba)
export function freeSockets(c) {
  let n = 0;
  for (const slot of SLOTS) n += Math.max(0, slotSockets(c, slot) - slotGems(c, slot).length);
  return n;
}

// ---------------- Drop ----------------
// Nível da gema: sobe com o andar efetivo (modos, Abismo) e a dificuldade; chefes, fendas e feras dão uma acima.
// Do chão cai no máximo Perfeita (Radiante no Abismo X+, Neon no Abismo XX+, Estelar no Abismo XL+, Quântica no LX+, Singular no LXXX+,
// Celeste no C+, Astral no CXX+, Prismática no CXL+, Etérea no CLX+, Cósmica no CLXXX+, Sagrada no CC+, XVII no CCL+, XVIII no CCCXXV+
// e XIX no CD+). A XX (Absoluta) cai do Abismo 750 em diante; antes, só fundindo.
function dropTier(o) {
  let t = Math.floor((effFloor() + diffIlvl()) / 20);
  const r = Math.random();
  if (r < 0.3) t--;
  else if (r > 0.9) t++;
  if (o.boss || o.rift || o.beast) t++;
  const ab = abyssLvl();
  return Math.max(0, Math.min(ab >= 750 ? 19 : ab >= 400 ? 18 : ab >= 325 ? 17 : ab >= 250 ? 16 : ab >= 200 ? 15 : ab >= 180 ? 14 : ab >= 160 ? 13 : ab >= 140 ? 12 : ab >= 120 ? 11 : ab >= 100 ? 10 : ab >= 80 ? 9 : ab >= 60 ? 8 : ab >= 40 ? 7 : ab >= 20 ? 6 : ab >= 10 ? 5 : 4, t));
}
export function dropGems(x, z, o = {}) {
  const p = G.player;
  const find = Math.sqrt(1 + ((p && p.stats.findPct) || 0) / 100);
  let n = 0;
  if (o.rift) n = 2 + Math.floor(Math.max(0, (o.waves || 3) - 3) / 3);
  else if (o.boss || o.thief || o.beast) n = 2;
  else if (o.contract) n = 1;
  else if (o.chest) n = chance(0.45) ? 1 : 0;
  else if (o.elite) n = chance(0.3 * find) ? 1 : 0;
  else n = chance(0.025 * find) ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const g = GEM_KEYS[Math.floor(Math.random() * GEM_KEYS.length)];
    spawnPickup('gem', x + rr(-0.2, 0.2), z + rr(-0.2, 0.2), { g, gt: dropTier(o) });
  }
}
