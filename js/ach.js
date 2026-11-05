// Medalhas (conquistas): valem para a conta toda, não para um personagem.
// Contadores ficam por aparelho (stats.dev[id]) e o total é a soma: assim a sincronização
// com o Google junta dois aparelhos sem contar nada em dobro (cada aparelho só cresce).
// Conjuntos (biomas vistos, tipos abatidos, chefes...) ficam em stats.sets e se unem.
import { G } from './state.js';
import { L } from './i18n.js';
import { ETYPES, BOSS_ORDER } from './enemies.js';
import { CLASSES, CLASS_ORDER } from './classes.js';
import { THEMES } from './dungeon.js';
import { SLOTS } from './items.js';
import { SHRINES } from './loot.js';
import { toast } from './ui.js';
import { sfx } from './audio.js';
import { sync } from './sync.js';

const K_DEV = 'neon-dungeon:device';
let DEV = null;
function devId() {
  if (DEV) return DEV;
  try {
    DEV = localStorage.getItem(K_DEV);
    if (!DEV) {
      DEV = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 12);
      localStorage.setItem(K_DEV, DEV);
    }
  } catch (e) {
    DEV = DEV || 'local';
  }
  return DEV;
}

export function ensureAch(save) {
  save.stats = save.stats || {};
  save.stats.dev = save.stats.dev || {};
  save.stats.sets = save.stats.sets || {};
  save.ach = save.ach || {};
}

// ---------- registro de eventos ----------
export function achAdd(key, n = 1) {
  const s = G.save.stats;
  const d = (s.dev[devId()] = s.dev[devId()] || {});
  d[key] = (d[key] || 0) + n;
}
export function achMark(set, key) {
  const s = G.save.stats.sets;
  (s[set] = s[set] || {})[key] = 1;
}
const total = (key) => Object.values(G.save.stats.dev).reduce((a, d) => a + (d[key] || 0), 0);
const count = (set) => Object.keys(G.save.stats.sets[set] || {}).length;
const has = (set, key) => !!(G.save.stats.sets[set] || {})[key];

// inimigo derrotado pelo jogador
export function achKill(e) {
  if (e.type === 'barrel') return achAdd('barrels');
  achAdd('kills');
  achMark('types', e.type);
  if (e.elite) achAdd('elites');
  if (e.type === 'thief') achAdd('thieves');
  if (e.boss) {
    achAdd('bosses');
    achMark('bossTypes', e.type);
    if (e.fightT0 != null && G.t - e.fightT0 < 60) achMark('flags', 'fastBoss');
    if (G.settings.difficulty === 'hard') achMark('flags', 'hardBoss');
  }
}

// ---------- definições ----------
const chars = () => Object.values(G.save.slots || {});
const maxOf = (f) => chars().reduce((m, c) => Math.max(m, f(c) || 0), 0);
const BESTIARY = () => Object.keys(ETYPES).filter((k) => !ETYPES[k].boss && !['barrel', 'pylon', 'thief'].includes(k));

// tier: 0 bronze, 1 prata, 2 ouro, 3 platina
const TIERS = [
  { name: L('Bronze', 'Bronze'), css: '#d08a4a', reward: 100 },
  { name: L('Prata', 'Silver'), css: '#c8d2e6', reward: 300 },
  { name: L('Ouro', 'Gold'), css: '#ffd23d', reward: 1000 },
  { name: L('Platina', 'Platinum'), css: '#7af0ff', reward: 3000 },
];
export { TIERS };

// a lista é montada na primeira vez que é usada (os módulos se importam em círculo)
let A = null;
export function achList() {
  if (A) return A;
  A = [];
  const add = (id, icon, tier, name, desc, cur, goal = 1) => A.push({ id, icon, tier, name, desc, cur, goal });

  // abates
  for (const [n, t, ic, pt, en] of [
    [10, 0, '🔪', 'Primeiro Sangue Digital', 'First Digital Blood'],
    [100, 0, '🗡️', 'Limpeza de Rua', 'Street Sweeper'],
    [500, 1, '⚔️', 'Exterminador', 'Exterminator'],
    [1000, 1, '💀', 'Mil Circuitos Queimados', 'A Thousand Fried Circuits'],
    [5000, 2, '☠️', 'Lenda Urbana', 'Urban Legend'],
    [10000, 3, '🌋', 'Apocalipse Neon', 'Neon Apocalypse'],
  ]) add(`kills${n}`, ic, t, L(pt, en), L(`Derrote ${n.toLocaleString('pt-BR')} inimigos`, `Defeat ${n.toLocaleString('en')} enemies`), () => total('kills'), n);
  add('elite1', '⭐', 0, L('Caçador de Elite', 'Elite Hunter'), L('Derrote um inimigo de elite', 'Defeat an elite enemy'), () => total('elites'));
  add('elite25', '🌟', 1, L('Elite da Elite', 'Elite of the Elite'), L('Derrote 25 inimigos de elite', 'Defeat 25 elite enemies'), () => total('elites'), 25);
  add('elite100', '✨', 2, L('Pesadelo das Elites', 'Bane of Elites'), L('Derrote 100 inimigos de elite', 'Defeat 100 elite enemies'), () => total('elites'), 100);

  // chefes
  const BOSS_ICON = { boss: '🤖', queen: '🕷️', scrap: '🧲', reaper: '👻', gunship: '🚁', hacker: '💻', omega: '🔴' };
  for (const b of BOSS_ORDER) {
    add(`boss_${b}`, BOSS_ICON[b] || '👑', b === 'omega' ? 2 : 1, L(`Derrubou: ${ETYPES[b].name}`, `Took down: ${ETYPES[b].name}`), L(`Derrote ${ETYPES[b].name}`, `Defeat ${ETYPES[b].name}`), () => (has('bossTypes', b) ? 1 : 0));
  }
  add('bosses10', '👑', 2, L('Matador de Chefes', 'Boss Slayer'), L('Derrote 10 chefes', 'Defeat 10 bosses'), () => total('bosses'), 10);
  add('bosses25', '🏆', 3, L('Rei do Submundo', 'King of the Underworld'), L('Derrote 25 chefes', 'Defeat 25 bosses'), () => total('bosses'), 25);
  add('fastBoss', '⏱️', 2, L('Speedrun', 'Speedrun'), L('Derrote um chefe em menos de 60 segundos', 'Defeat a boss in under 60 seconds'), () => (has('flags', 'fastBoss') ? 1 : 0));
  add('hardBoss', '🔥', 2, L('Sem Piedade', 'No Mercy'), L('Derrote um chefe no Difícil', 'Defeat a boss on Hard'), () => (has('flags', 'hardBoss') ? 1 : 0));

  // profundidade e nível
  for (const [n, t, ic] of [[5, 0, '🛗'], [10, 1, '⬇️'], [15, 1, '🕳️'], [20, 2, '🌑'], [30, 2, '🧭'], [50, 3, '🪐']]) {
    add(`floor${n}`, ic, t, L(`Andar ${n}`, `Floor ${n}`), L(`Chegue ao andar ${n} com qualquer classe`, `Reach floor ${n} with any class`), () => maxOf((c) => c.maxFloor || c.floor), n);
  }
  for (const [n, t, ic, pt, en] of [[5, 0, '📈', 'Pegando o Jeito', 'Getting the Hang of It'], [10, 1, '💪', 'Veterano', 'Veteran'], [25, 2, '🦾', 'Cromado até os Ossos', 'Chrome to the Bone'], [50, 3, '🧬', 'Evolução Máxima', 'Maximum Evolution']]) {
    add(`level${n}`, ic, t, L(pt, en), L(`Chegue ao nível ${n}`, `Reach level ${n}`), () => maxOf((c) => c.level), n);
  }

  // classes
  add('allClasses', '🎭', 1, L('Identidade Múltipla', 'Multiple Identities'), L('Jogue com as 7 classes', 'Play all 7 classes'), () => CLASS_ORDER.filter((k) => G.save.slots[k]).length, CLASS_ORDER.length);
  for (const k of CLASS_ORDER) {
    add(`class10_${k}`, '🎖️', 0, L(`Mestre: ${CLASSES[k].name}`, `Master: ${CLASSES[k].name}`), L(`Chegue ao nível 10 com ${CLASSES[k].name}`, `Reach level 10 as ${CLASSES[k].name}`), () => (G.save.slots[k] ? G.save.slots[k].level : 0), 10);
  }
  add('allClasses10', '🌈', 3, L('Esquadrão Completo', 'Full Squad'), L('Chegue ao nível 10 com todas as classes', 'Reach level 10 with every class'), () => CLASS_ORDER.filter((k) => G.save.slots[k] && G.save.slots[k].level >= 10).length, CLASS_ORDER.length);

  // poderes e equipamento
  add('fullTree', '🌳', 2, L('Árvore Completa', 'Full Tree'), L('Libere os 9 poderes de uma classe', 'Unlock all 9 powers of a class'), () => maxOf((c) => (c.skills || []).slice(0, 9).filter((r) => r > 0).length), 9);
  add('rank10', '🔟', 1, L('Especialista', 'Specialist'), L('Leve um poder ao nível 10', 'Take a power to rank 10'), () => maxOf((c) => Math.max(0, ...(c.skills || [0]))), 10);
  add('geared', '🛡️', 1, L('Bem Equipado', 'Well Equipped'), L('Use itens raros ou melhores em todos os espaços', 'Wear rare or better items in every slot'), () => maxOf((c) => SLOTS.filter((s) => c.equip && c.equip[s] && c.equip[s].rarity >= 2).length), SLOTS.length);
  add('legend1', '🟠', 1, L('Protótipo', 'Prototype'), L('Encontre um item lendário (protótipo)', 'Find a legendary (prototype) item'), () => total('legendaries'));
  add('legend10', '🧡', 2, L('Colecionador de Protótipos', 'Prototype Collector'), L('Encontre 10 itens lendários', 'Find 10 legendary items'), () => total('legendaries'), 10);

  // mundo
  add('biomes5', '🗺️', 0, L('Explorador', 'Explorer'), L('Visite 5 biomas diferentes', 'Visit 5 different biomes'), () => count('biomes'), 5);
  add('biomesAll', '🌍', 2, L('Turista do Apocalipse', 'Apocalypse Tourist'), L(`Visite os ${THEMES.length} biomas`, `Visit all ${THEMES.length} biomes`), () => count('biomes'), THEMES.length);
  add('bestiary10', '📖', 1, L('Bestiário', 'Bestiary'), L('Derrote 10 tipos diferentes de inimigo', 'Defeat 10 different enemy types'), () => BESTIARY().filter((k) => has('types', k)).length, 10);
  add('bestiaryAll', '📚', 2, L('Enciclopédia do Submundo', 'Underworld Encyclopedia'), L('Derrote todos os tipos de inimigo comuns', 'Defeat every regular enemy type'), () => BESTIARY().filter((k) => has('types', k)).length, BESTIARY().length);

  // eventos
  add('thief1', '💰', 1, L('Pega Ladrão!', 'Stop, Thief!'), L('Derrote um Ladrão de Dados', 'Take down a Data Thief'), () => total('thieves'));
  add('thief10', '🤑', 2, L('Caçador de Recompensas', 'Bounty Hunter'), L('Derrote 10 Ladrões de Dados', 'Take down 10 Data Thieves'), () => total('thieves'), 10);
  add('thiefEsc', '💨', 0, L('Quase…', 'So Close…'), L('Deixe um Ladrão de Dados escapar', 'Let a Data Thief get away'), () => total('thiefEscapes'));
  add('shrine1', '🔮', 0, L('Abençoado', 'Blessed'), L('Use um Santuário Neon', 'Use a Neon Shrine'), () => total('shrines'));
  add('shrineAll', '💎', 1, L('Peregrino', 'Pilgrim'), L('Use os 4 tipos de santuário', 'Use all 4 kinds of shrine'), () => Object.keys(SHRINES).filter((k) => has('shrineKinds', k)).length, Object.keys(SHRINES).length);
  add('shrine50', '🛐', 2, L('Devoto do Neon', 'Neon Devotee'), L('Use 50 santuários', 'Use 50 shrines'), () => total('shrines'), 50);
  add('chest10', '📦', 0, L('Arrombador', 'Safecracker'), L('Abra 10 cofres', 'Open 10 loot caches'), () => total('chests'), 10);
  add('chest100', '🗃️', 2, L('Saqueador Profissional', 'Professional Looter'), L('Abra 100 cofres', 'Open 100 loot caches'), () => total('chests'), 100);

  // economia e outros
  add('credits10k', '💵', 1, L('Pé-de-meia', 'Nest Egg'), L('Ganhe 10.000 créditos no total', 'Earn 10,000 credits in total'), () => total('credits'), 10000);
  add('credits100k', '💎', 2, L('Magnata Cyberpunk', 'Cyberpunk Tycoon'), L('Ganhe 100.000 créditos no total', 'Earn 100,000 credits in total'), () => total('credits'), 100000);
  add('buy1', '🛒', 0, L('Cliente VIP', 'VIP Customer'), L('Compre um item do mercador', 'Buy an item from the merchant'), () => total('buys'));
  add('stims50', '💉', 1, L('Viciado em Stim', 'Stim Junkie'), L('Use 50 stims', 'Use 50 stims'), () => total('stims'), 50);
  add('barrels25', '🛢️', 0, L('Piromaníaco Acidental', 'Accidental Pyromaniac'), L('Exploda 25 barris', 'Blow up 25 barrels'), () => total('barrels'), 25);
  add('death1', '🔁', 0, L('Reinicialização', 'Reboot'), L('Morra pela primeira vez (acontece…)', 'Die for the first time (it happens…)'), () => total('deaths'));
  add('death25', '🧟', 1, L('Imortal? Nem Tanto', 'Immortal? Not Quite'), L('Seja reconstruído 25 vezes', 'Get rebuilt 25 times'), () => total('deaths'), 25);
  add('floors100', '🏢', 1, L('Elevadorista', 'Elevator Regular'), L('Desça 100 andares no total', 'Go down 100 floors in total'), () => total('floors'), 100);
  add('cloud', '☁️', 0, L('Nas Nuvens', 'Head in the Clouds'), L('Entre com o Google para salvar na nuvem', 'Sign in with Google to save in the cloud'), () => (sync.user || has('flags', 'cloud') ? 1 : 0));
  add('medals30', '🏅', 2, L('Colecionador de Medalhas', 'Medal Collector'), L('Ganhe 30 medalhas', 'Earn 30 medals'), () => Object.keys(G.save.ach).length, 30);
  add('medalsAll', '🎆', 3, L('Platinado', 'Completionist'), L('Ganhe todas as outras medalhas', 'Earn every other medal'), () => A.filter((a) => a.id !== 'medalsAll' && G.save.ach[a.id]).length, A.length); // A ainda não inclui esta
  return A;
}


// ---------- verificação ----------
let booted = false;
export function achCheck() {
  if (!G.save) return;
  ensureAch(G.save);
  if (sync.user) achMark('flags', 'cloud');
  const fresh = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const a of achList()) {
      if (G.save.ach[a.id]) continue;
      if (a.cur() >= a.goal) {
        G.save.ach[a.id] = Date.now();
        fresh.push(a);
      }
    }
  }
  if (!fresh.length) return;
  const reward = fresh.reduce((s, a) => s + TIERS[a.tier].reward, 0);
  if (G.char) G.char.credits += reward;
  const cr = G.char ? ` · +${reward.toLocaleString()}¢` : '';
  // ao abrir o jogo pela primeira vez com progresso antigo, junta tudo num aviso só
  if (fresh.length > 3 || !booted) {
    toast(`🏅 <b>${fresh.length} ${L('medalhas desbloqueadas', 'medals unlocked')}</b>${cr}`, 'leg', 'ach');
  } else {
    for (const a of fresh) toast(`${a.icon} <b style="color:${TIERS[a.tier].css}">${L('Medalha', 'Medal')}: ${a.name}</b> · ${a.desc}${G.char ? ` · +${TIERS[a.tier].reward}¢` : ''}`, 'leg');
  }
  if (booted) sfx.legendary();
  booted = true;
}
export function achBooted() {
  booted = true;
}

export function achProgress(a) {
  const cur = Math.min(a.goal, a.cur());
  return { cur, goal: a.goal, done: !!G.save.ach[a.id] };
}

// mescla para a nuvem: contadores por aparelho pelo maior valor, conjuntos e medalhas pela união
export function mergeStats(a = {}, b = {}) {
  const out = { dev: {}, sets: {} };
  for (const src of [a, b]) {
    for (const [dev, d] of Object.entries(src.dev || {})) {
      const o = (out.dev[dev] = out.dev[dev] || {});
      for (const [k, v] of Object.entries(d)) o[k] = Math.max(o[k] || 0, v || 0);
    }
    for (const [set, m] of Object.entries(src.sets || {})) Object.assign((out.sets[set] = out.sets[set] || {}), m);
  }
  return out;
}
export function mergeAch(a = {}, b = {}) {
  const out = { ...b };
  for (const [k, t] of Object.entries(a)) out[k] = out[k] ? Math.min(out[k], t) : t;
  return out;
}
