// Simulador de balanceamento (roda dentro da página, importado por tools/balance.mjs).
// Monta personagens com itens, ferreiro, gemas, árvore e implantes usando o código real do jogo
// (makeItem, forgeItem, computeStats, spawnEnemy, hitEnemy, armorTaken) e mede dano e sobrevivência
// contra os inimigos de cada dificuldade / Abismo. Não renderiza nada nem salva o personagem.
import { G } from '../js/state.js';
import { newCharacter, computeStats, xpNeeded, SP_PER_LEVEL } from '../js/player.js';
import { CLASSES, MAX_RANK, rankMult } from '../js/classes.js';
import { makeItem, forgeItem, forgeMax, forgeCost, socketsOf, SLOTS, RARITY } from '../js/items.js';
import { ETYPES, BOSS_ORDER, spawnEnemy, tickReward, diffIlvl, lootIlvl, diffRank, abyssGear, abyssFx, rewardK } from '../js/enemies.js';
import { hitEnemy } from '../js/combat.js';
import { tierOf, effFloor, armorTaken, IMPLANTS, TIERS } from '../js/run.js';
import { GEMS, gemDropCap } from '../js/gems.js';
import { seedRandom } from '../js/utils.js';
import { SKILL_FN } from '../js/classes.js';
import { skillCost, placePlayer } from '../js/player.js';
import { Input } from '../js/input.js';
import { clearPowers } from '../js/powers.js';
import { resetMythic } from '../js/mythic.js';
import { clearEffects } from '../js/fx.js';
import { clearPickups } from '../js/loot.js';
import { isWalkable } from '../js/dungeon.js';

const REG = ['punk', 'soldier', 'ninja', 'shield', 'sniper', 'drone'];
const WEAPON_GEMS = ['ruby', 'amethyst', 'topaz', 'sapphire'];
const ARMOR_GEMS = ['ruby', 'diamond', 'amethyst', 'emerald'];

// mesma conta do dropTier em gems.js, sem o sorteio (nível típico que cai)
function gemDropTier() {
  const ab = G.settings.abyss | 0;
  const t = Math.floor((effFloor() + diffIlvl()) / 20);
  return Math.max(0, Math.min(gemDropCap(ab), t));
}

function setScene(sc) {
  G.settings.difficulty = sc.diff;
  G.settings.abyss = sc.diff === 'death' ? sc.abyss | 0 : 0;
  G.floor = sc.floor;
}

// distribui os pontos da árvore em rodízio entre todos os poderes liberados (jogador "equilibrado")
function spendTree(c) {
  const sk = CLASSES[c.cls].skills;
  let pts = c.level * SP_PER_LEVEL;
  c.skills = sk.map(() => 0);
  const open = sk.map((s, i) => i).filter((i) => (s => (s.req || 1) <= c.level)(sk[i]));
  while (pts > 0) {
    let spent = false;
    for (const i of open) {
      if (pts <= 0) break;
      if (c.skills[i] < MAX_RANK) { c.skills[i]++; pts--; spent = true; }
    }
    if (!spent) break;
  }
  const r = open.map((i) => c.skills[i]);
  return { open: open.length, total: sk.length, avgRank: r.reduce((a, b) => a + b, 0) / (r.length || 1) };
}

function giveImplants(c, n) {
  const keys = Object.keys(IMPLANTS);
  c.implants = {};
  for (let i = 0; i < n; i++) c.implants[keys[i % keys.length]] = (c.implants[keys[i % keys.length]] | 0) + 1;
}

// personagem do cenário; o = { gear, plus: 'max'|0, gems: nível|-1, tree, implants }
function buildChar(sc, o) {
  const c = newCharacter(sc.cls);
  c.level = sc.level;
  c.tier = sc.tier | 0;
  c.infWins = sc.infWins | 0;
  G.char = c;
  c.rwd = diffRank(); // recompensa já no topo (sem a subida aos poucos)
  tickReward(0);
  const ilvl = lootIlvl(sc.floor + tierOf().off + diffIlvl() + 1);
  const info = { ilvl, gemT: o.gems, cost: 0 };
  if (o.gear) {
    for (const slot of SLOTS) {
      const it = makeItem({ ilvl, rarity: sc.rarity, slot, cls: sc.cls });
      const p = o.plus === 'max' ? forgeMax(it) : o.plus | 0;
      for (let k = 0; k < p; k++) { info.cost += forgeCost(it); forgeItem(it); }
      c.equip[slot] = it;
    }
  }
  c.sockets = {};
  if (o.gems >= 0 && o.gear) {
    for (const slot of SLOTS) {
      const n = Math.min(4, socketsOf(c.equip[slot]));
      const kinds = slot === 'weapon' ? WEAPON_GEMS : ARMOR_GEMS;
      c.sockets[slot] = Array.from({ length: n }, (_, i) => ({ g: kinds[i], t: o.gems }));
    }
  }
  info.tree = o.tree ? spendTree(c) : (c.skills = c.skills.map(() => 0), null);
  giveImplants(c, o.implants ? sc.implants | 0 : 0);
  return { c, info };
}

const parked = [];
function spawn(type, elite) {
  const e = spawnEnemy(type, 0, 0, elite ? { elite: true } : {});
  parked.push(e);
  return e;
}
function clearSpawns() {
  for (const e of parked) {
    e.alive = false;
    if (e.model) G.world.remove(e.model.root);
    if (e.laser) G.world.remove(e.laser);
    const i = G.enemies.indexOf(e);
    if (i >= 0) G.enemies.splice(i, 1);
  }
  parked.length = 0;
}

// dano médio de um golpe básico (mult 1) no inimigo, pelo hitEnemy real (críticos, passivos, míticos, primordiais)
function avgHit(e, n = 200) {
  const keep = { hp: e.hp, maxHp: e.maxHp };
  const s = G.player.stats;
  // vida bem maior que o golpe, mas sem perder precisão no double
  const big = s.wMax * (1 + s.dmgPct / 100) * (s.dmgMul || 1) * (1 + s.critDmg / 100) * 1e6;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    e.maxHp = big * 2;
    e.hp = big; // meio da vida: sem execução nem bônus de vida cheia
    e.alive = true;
    e.invulnerable = false;
    const before = e.hp;
    hitEnemy(e, 1, { noProc: true });
    sum += before - e.hp;
  }
  Object.assign(e, keep);
  return sum / n;
}

// mede um personagem contra os inimigos do cenário
function measure1(sc, o, seed) {
  setScene(sc);
  // mesma semente em todas as variantes: os mesmos itens, só muda o sistema que foi tirado
  seedRandom(seed);
  const { c, info } = buildChar(sc, o);
  seedRandom(null);
  const s = computeStats(c);
  G.player.stats = s;
  G.player.hp = s.maxHp;
  G.player.buffs = {};
  const taken = armorTaken(s.armor) * (1 - (s.dmgRed || 0) / 100) * (s.prims.has('gaia') ? 0.8 : 1);
  const avoid = 1 / (1 - Math.min(0.9, (s.dodge || 0) / 100));
  const reg = REG.map((t) => spawn(t, false));
  const eli = REG.slice(0, 3).map((t) => spawn(t, true));
  const boss = BOSS_ORDER.map((t) => spawn(t, false));
  const beast = spawn('behemoth', false);
  const avg = (a, f) => a.reduce((x, e) => x + f(e), 0) / a.length;
  const r = {
    ilvl: info.ilvl, gemT: info.gemT, forgeCost: info.cost, tree: info.tree,
    eff: effFloor(), gear: abyssGear(),
    hp: s.maxHp, armor: s.armor, taken, dodge: s.dodge || 0, atkRate: s.atkRate, crit: s.crit, critDmg: s.critDmg,
    dmgPct: s.dmgPct, dmgMul: s.dmgMul || 1, wAvg: (s.wMin + s.wMax) / 2,
    hitN: avgHit(reg[0]), hitE: avgHit(eli[0]), hitB: avgHit(boss[0]), hitM: avgHit(beast), mHp: beast.maxHp,
    nHp: avg(reg, (e) => e.maxHp), eHp: avg(eli, (e) => e.maxHp), bHp: avg(boss, (e) => e.maxHp),
    nDmg: avg(reg, (e) => e.dmg), eDmg: avg(eli, (e) => e.dmg), bDmg: avg(boss, (e) => e.dmg),
  };
  clearSpawns();
  r.dps = r.hitN * r.atkRate;
  // golpes básicos para matar / segundos de ataque básico / golpes do inimigo para morrer
  r.hitsN = r.nHp / r.hitN;
  r.secE = r.eHp / (r.hitE * r.atkRate);
  r.secB = r.bHp / (r.hitB * r.atkRate);
  r.secM = r.mHp / (r.hitM * r.atkRate);
  r.dieN = (r.hp / Math.max(1, r.nDmg * taken)) * avoid;
  r.dieE = (r.hp / Math.max(1, r.eDmg * taken)) * avoid;
  r.dieB = (r.hp / Math.max(1, r.bDmg * taken)) * avoid;
  // poder principal com os pontos da árvore (multiplica o golpe pelo nível do poder)
  r.skillMult = info.tree ? rankMult(Math.max(1, Math.round(info.tree.avgRank))) : 1;
  // créditos por abate de inimigo comum (killBounty) e quantos abates o ferreiro custa
  const bounty = (2 + c.level * 0.25) * (1 + sc.floor * 0.05) * tierOf().credits * rewardK('cr');
  r.forgeKills = info.cost / bounty;
  return r;
}

// média de várias rolagens de itens (os afixos e os marcos do ferreiro são sorteados)
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];
function measure(sc, o) {
  const all = SEEDS.map((sd) => measure1(sc, o, sd));
  const r = { ...all[0] };
  for (const k in r) if (typeof r[k] === 'number') r[k] = all.reduce((a, x) => a + x[k], 0) / all.length;
  return r;
}

// XP de um andar: monta o andar de verdade (populateFloor) e soma a XP dos inimigos
export async function floorXp(sc) {
  const { startFloor } = await import('../js/main.js');
  setScene(sc);
  G.char.tier = sc.tier | 0;
  startFloor(sc.floor);
  G.mode = 'balance';
  let xp = 0, n = 0;
  for (const e of G.enemies) if (e.alive && !e.inert && !e.decoy) { xp += e.xp; n++; }
  return { xp, n, eff: effFloor() };
}

export function levelFromXp(total) {
  let lv = 1;
  while (total >= xpNeeded(lv)) { total -= xpNeeded(lv); lv++; }
  return lv + total / xpNeeded(lv);
}

// cenário completo + variantes para separar o peso de cada sistema
export function run(sc) {
  G.mode = 'balance';
  const full = { gear: true, plus: 'max', gems: sc.gemT ?? null, tree: true, implants: true };
  setScene(sc);
  G.char = newCharacter(sc.cls); G.char.tier = sc.tier | 0; G.char.rwd = diffRank(); tickReward(0);
  if (full.gems == null) full.gems = gemDropTier();
  const out = { sc, full: measure(sc, full) };
  out.noForge = measure(sc, { ...full, plus: 0 });
  out.noGems = measure(sc, { ...full, gems: -1 });
  out.noTree = measure(sc, { ...full, tree: false });
  out.noImpl = measure(sc, { ...full, implants: false });
  out.naked = measure(sc, { gear: false, gems: -1, tree: false, implants: false });
  out.rarity = RARITY.map((_, i) => measure({ ...sc, rarity: i }, full).dps);
  return out;
}

export const info = () => ({ tiers: TIERS.length, gems: Object.keys(GEMS), fx500: abyssFx(500) });

// ------------------------------------------------------------------
// Combate com poderes: roda a lógica real do jogo (__dbg.sim → updatePlayer, SKILL_FN, projéteis,
// invocações, queimaduras, míticos...) com o personagem apertando os poderes da barra. Os alvos ficam
// presos e atordoados num ponto do mapa; a vida deles é virtual (não morrem), então dá para medir o
// dano por segundo em cada um e converter em tempo para matar com a vida de verdade.
// ------------------------------------------------------------------
const BIG = 1e9; // vida falsa = vida real × BIG (sem morte e sem perder precisão)
let arena = null;

// lugar aberto no andar: um quadrado de 9×9 todo andável
function findArena() {
  const d = G.dungeon;
  for (let j = 5; j < d.H - 5; j++) {
    for (let i = 5; i < d.W - 5; i++) {
      let ok = true;
      for (let b = -4; b <= 4 && ok; b++) for (let a = -4; a <= 4 && ok; a++) if (!isWalkable(d, i + a + 0.5, j + b + 0.5)) ok = false;
      if (ok) return { x: i + 0.5, z: j + 0.5 };
    }
  }
  return null;
}

function dropEnemies() {
  for (const e of G.enemies) {
    e.alive = false;
    if (e.model) G.world.remove(e.model.root);
    if (e.laser) G.world.remove(e.laser);
  }
  G.enemies = [];
}

// monta o andar 1 (sem bioma esquisito) uma vez; os inimigos dele saem
export async function setupArena(sc) {
  const { startFloor } = await import('../js/main.js');
  setScene(sc);
  startFloor(1);
  G.mode = 'balance';
  dropEnemies();
  G.anomaly = null; // sem anomalia do andar (mudaria recarga, dano...)
  arena = findArena();
  worldBase = new Set(G.world.children); // o que sobra além disso depois de uma luta é resto (modelos, projéteis...)
  return !!arena;
}

let worldBase = null;

function resetCombat() {
  dropEnemies();
  G.projectiles = [];
  G.turrets = [];
  G.timers = [];
  G.hazards = [];
  G.barriers = [];
  G.decoy = null;
  clearPowers();
  resetMythic();
  clearEffects();
  clearPickups(); // o que caiu dos abates (execuções) se acumularia e deixaria cada luta mais lenta
  G.boss = null;
  G.bosses = [];
  if (worldBase) for (let i = G.world.children.length - 1; i >= 0; i--) { const o = G.world.children[i]; if (!worldBase.has(o)) G.world.remove(o); }
}

// alvos: 1 chefe na frente e 5 comuns em volta dele
function placeTargets() {
  const ax = arena.x, az = arena.z + 2.6;
  const list = [];
  const add = (type, x, z, boss) => {
    const e = spawnEnemy(type, x, z, {});
    e.realHp = e.maxHp;
    e.maxHp = e.realHp * BIG;
    e.frac = 1; // fração virtual da vida (volta a 1 quando "morre")
    e.hp = e.maxHp;
    e.px = x; e.pz = z;
    e.isBoss = boss;
    e.dealt = 0;
    list.push(e);
  };
  add(BOSS_ORDER[0], ax, az, true);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    add(REG[k], ax + Math.cos(a) * 2.2, az + Math.sin(a) * 2.2, false);
  }
  return list;
}

// antes de cada passo: alvos no lugar, atordoados
function pinTargets(list) {
  for (const e of list) {
    e.stun = 1;
    e.aggro = true;
    e.x = e.px; e.z = e.pz;
    e.kx = e.kz = 0;
  }
}

// depois de cada passo: quanto cada alvo perdeu, avança a vida virtual e devolve a vida falsa
function collect(list) {
  for (const e of list) {
    let lost = Math.max(0, e.frac * e.maxHp - e.hp); // dano de verdade (o golpe não depende da vida do alvo)
    // morreu: só um efeito de execução (Ceifador...) mata com a vida falsa; conta o que restava da vida real
    // e volta o alvo para a lista (o jogo tira os mortos de G.enemies)
    if (!e.alive || e.hp <= 0) {
      lost = e.frac * e.realHp;
      if (!G.enemies.includes(e)) G.enemies.push(e);
    }
    if (!(lost < Infinity)) { e.bad = (e.bad || 0) + 1; lost = 0; } // dano infinito/NaN: só conta quantas vezes
    e.maxStep = Math.max(e.maxStep || 0, lost / e.realHp);
    e.dealt += lost;
    e.frac -= lost / e.realHp;
    if (!(e.frac > 0)) e.frac = 1 + (e.frac % 1 || 0);
    e.alive = true;
    e.hp = e.frac * e.maxHp;
  }
}

// simula `sec` segundos; use = índices de poderes na ordem de prioridade (o ataque básico fica no ⚔)
function fight(c, use, sec, trace = null) {
  resetCombat();
  G.char = c;
  // abates (execuções) dão XP e créditos: o personagem volta como estava depois da luta
  const keepChar = { level: c.level, xp: c.xp, credits: c.credits, kills: c.kills, skillPoints: c.skillPoints };
  c.atk = 0;
  c.slots = use.slice(0, 7);
  while (c.slots.length < 7) c.slots.push(null);
  const p = G.player;
  p.cds = CLASSES[c.cls].skills.map(() => 0);
  p.buffs = {};
  p.dash = p.leap = p.whirl = p.aura = null;
  p.shield = 0;
  p.alive = true;
  p.invuln = 0;
  placePlayer(arena.x, arena.z);
  p.facing = 0;
  p.stats = computeStats(c);
  p.hp = p.stats.maxHp;
  p.en = p.stats.maxEn;
  const list = placeTargets();
  G.lastInput = 'pad';
  Input.move.x = Input.move.y = 0;
  Input.aimStick.x = Input.aimStick.y = 0;
  for (const k in Input.held) Input.held[k] = false;
  for (const k in Input.prev) Input.prev[k] = false;
  const keepMode = G.mode;
  G.mode = 'play';
  const casts = {};
  try {
    const wall = performance.now();
    window.__dbg.sim(sec, (t) => {
      // trava de segurança: um poder que gera coisas sem fim não segura o relatório inteiro
      if (performance.now() - wall > 20000) throw new Error(`luta passou de 20s reais em ${t.toFixed(1)}s de jogo`);
      if (t > 0) collect(list);
      if (trace && Math.round(t / (1 / 30)) % 15 === 0) trace.push({ t: +t.toFixed(2), p: [+p.x.toFixed(2), +p.z.toFixed(2)], en: Math.round(p.en), atkT: +p.atkT.toFixed(2), aim: p.aimEnemy && p.aimEnemy.type, mode: G.mode, st: [!!p.dash, !!p.leap, !!p.npcHold, !!G.npcNear, !!G.npcPad, Input.held.primary, p.omni ? 1 : 0, Object.keys(p.buffs).join("/")].join(" "), alive: p.alive, foes: list.map((e) => [e.type, +e.x.toFixed(1), +e.z.toFixed(1), e.alive, +(e.dealt / e.realHp).toFixed(4)]), n: G.enemies.length });
      pinTargets(list);
      p.hp = p.stats.maxHp;
      p.npcHold = false; // perto do baú/ferreiro o {A} abriria o NPC em vez de atacar
      G.npcNear = null;
      G.npcPad = false;
      Input.held.primary = true;
      // aperta (um passo sim, outro não) cada poder pronto e com energia, na ordem de prioridade
      for (let k = 0; k < 7; k++) {
        const i = c.slots[k];
        const a = 's' + (k + 1);
        if (Input.held[a]) { Input.held[a] = false; continue; }
        if (i == null || i === 0) continue;
        if (p.cds[i] <= 0 && p.en >= skillCost(i)) { Input.held[a] = true; casts[i] = (casts[i] | 0) + 1; }
      }
    });
    collect(list);
  } finally {
    G.mode = keepMode;
    Object.assign(c, keepChar);
    for (const k in Input.held) Input.held[k] = false;
  }
  const boss = list.find((e) => e.isBoss);
  const regs = list.filter((e) => !e.isBoss);
  const r = {
    bossDps: boss.dealt / sec, // dano por segundo no chefe
    regDps: regs.reduce((a, e) => a + e.dealt, 0) / regs.length / sec, // dano por segundo em cada comum (média)
    bossHp: boss.realHp,
    regHp: regs.reduce((a, e) => a + e.realHp, 0) / regs.length,
    casts,
    bad: list.reduce((a, e) => a + (e.bad | 0), 0),
    maxStep: Math.max(...list.map((e) => e.maxStep || 0)),
  };
  r.secB = r.bossHp / Math.max(1e-300, r.bossDps);
  r.secN = r.regHp / Math.max(1e-300, r.regDps);
  resetCombat();
  return r;
}

// depuração: __B.debugFight(cenário, ['lunge', ...], segundos)
// mod(c): muda o personagem antes da luta (ex.: tirar os poderes dos itens para ver quanto eles pesam)
export function debugFight(sc, ids = [], sec = 2, mod = null) {
  setScene(sc);
  G.char = newCharacter(sc.cls); G.char.tier = sc.tier | 0; G.char.rwd = diffRank(); tickReward(0);
  seedRandom(sc.seed ?? 11);
  const { c } = buildChar(sc, { gear: true, plus: 'max', gems: 0, tree: true, implants: true });
  seedRandom(null);
  if (mod) mod(c);
  const sk = CLASSES[sc.cls].skills;
  const trace = [];
  const r = fight(c, ids.map((id) => sk.findIndex((x) => x.id === id)), sec, trace);
  return { r, trace, arena };
}

// pontos da árvore como um jogador que escolheu a barra: poderes da barra, ataque básico e passivos
// primeiro (em rodízio), o que sobrar vai para o resto
function spendFocused(c, focus) {
  const sk = CLASSES[c.cls].skills;
  let pts = c.level * SP_PER_LEVEL;
  c.skills = sk.map(() => 0);
  const open = sk.map((s, i) => i).filter((i) => (sk[i].req || 1) <= c.level);
  const first = open.filter((i) => focus.includes(i) || sk[i].passive);
  for (const group of [first, open]) {
    while (pts > 0) {
      let spent = false;
      for (const i of group) {
        if (pts <= 0) break;
        if (c.skills[i] < MAX_RANK) { c.skills[i]++; pts--; spent = true; }
      }
      if (!spent) break;
    }
  }
}

// escolhe a barra (testa cada poder sozinho junto com o ataque básico), refaz a árvore focada
// e mede a rotação final; devolve também o mesmo personagem só no ataque básico
export function skillRun(sc, o = {}) {
  const sec = o.sec || 30;
  const rankSec = o.rankSec || 10;
  const full = { gear: true, plus: 'max', gems: sc.gemT ?? null, tree: true, implants: true };
  setScene(sc);
  G.char = newCharacter(sc.cls); G.char.tier = sc.tier | 0; G.char.rwd = diffRank(); tickReward(0);
  if (full.gems == null) full.gems = gemDropTier();
  const build = (opt) => { setScene(sc); seedRandom(11); const b = buildChar(sc, opt); seedRandom(null); return b.c; };
  const sk = CLASSES[sc.cls].skills;
  // 1) ranking: cada poder sozinho na barra (com o ataque básico) no nível que ele teria numa árvore focada
  // em 8 poderes; nota = metade ganho no chefe + metade ganho no grupo, contra só o ataque básico
  const c0 = build(full);
  const actives = sk.map((x, i) => i).filter((i) => i > 0 && !sk[i].passive && (sk[i].req || 1) <= c0.level && SKILL_FN[sk[i].id]);
  spendFocused(c0, [0, ...actives.slice(0, 7)]);
  const R = c0.skills[0];
  for (const i of actives) c0.skills[i] = R;
  const b1 = fight(c0, [], rankSec), b2 = fight(c0, [], rankSec);
  const base = { bossDps: (b1.bossDps + b2.bossDps) / 2, regDps: (b1.regDps + b2.regDps) / 2 };
  const cand = [];
  for (const i of actives) {
    const t0 = performance.now();
    let r;
    try { r = fight(c0, [i], rankSec); } catch (err) { console.info(`[bal] ${sk[i].id}: ${err.message}`); resetCombat(); continue; }
    console.info(`[bal] ${sk[i].id}:${((performance.now() - t0) / 1000).toFixed(1)}s`);
    cand.push({ i, id: sk[i].id, gain: 0.5 * (r.bossDps / base.bossDps) + 0.5 * (r.regDps / base.regDps) });
  }
  cand.sort((a, b) => b.gain - a.gain);
  const bar = cand.filter((x) => x.gain > 1.02).slice(0, 7).map((x) => x.i);
  // 2) árvore focada na barra e rotação final
  const runWith = (opt, basic) => {
    const c = build(opt);
    if (opt.tree) spendFocused(c, [0, ...bar]);
    else for (const i of [0, ...bar]) c.skills[i] = 1; // sem árvore: só o nível 1 dos poderes usados
    const res = { rot: fight(c, bar, sec), ranks: bar.map((i) => c.skills[i]) };
    if (basic) res.basic = fight(c, [], sec);
    return res;
  };
  const out = { sc, rankR: R, bar: bar.map((i) => sk[i].id), names: bar.map((i) => sk[i].name), top: cand.slice(0, 10).map((x) => ({ id: x.id, gain: x.gain })) };
  const f = runWith(full, true);
  out.full = f.rot; out.basic = f.basic; out.ranks = f.ranks;
  if (o.variants) {
    out.noForge = runWith({ ...full, plus: 0 }).rot;
    out.noGems = runWith({ ...full, gems: -1 }).rot;
    out.noTree = runWith({ ...full, tree: false }).rot;
    out.noImpl = runWith({ ...full, implants: false }).rot;
  }
  return out;
}
