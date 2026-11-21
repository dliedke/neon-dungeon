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
import { GEMS } from '../js/gems.js';
import { seedRandom } from '../js/utils.js';

const REG = ['punk', 'soldier', 'ninja', 'shield', 'sniper', 'drone'];
const WEAPON_GEMS = ['ruby', 'amethyst', 'topaz', 'sapphire'];
const ARMOR_GEMS = ['ruby', 'diamond', 'amethyst', 'emerald'];

// mesma conta do dropTier em gems.js, sem o sorteio (nível típico que cai)
function gemDropTier() {
  const ab = G.settings.abyss | 0;
  const t = Math.floor((effFloor() + diffIlvl()) / 20);
  const cap = ab >= 400 ? 18 : ab >= 325 ? 17 : ab >= 250 ? 16 : ab >= 200 ? 15 : ab >= 180 ? 14 : ab >= 160 ? 13 : ab >= 140 ? 12 : ab >= 120 ? 11 : ab >= 100 ? 10 : ab >= 80 ? 9 : ab >= 60 ? 8 : ab >= 40 ? 7 : ab >= 20 ? 6 : ab >= 10 ? 5 : 4;
  return Math.max(0, Math.min(cap, t));
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
  const avg = (a, f) => a.reduce((x, e) => x + f(e), 0) / a.length;
  const r = {
    ilvl: info.ilvl, gemT: info.gemT, forgeCost: info.cost, tree: info.tree,
    eff: effFloor(), gear: abyssGear(),
    hp: s.maxHp, armor: s.armor, taken, dodge: s.dodge || 0, atkRate: s.atkRate, crit: s.crit, critDmg: s.critDmg,
    dmgPct: s.dmgPct, dmgMul: s.dmgMul || 1, wAvg: (s.wMin + s.wMax) / 2,
    hitN: avgHit(reg[0]), hitE: avgHit(eli[0]), hitB: avgHit(boss[0]),
    nHp: avg(reg, (e) => e.maxHp), eHp: avg(eli, (e) => e.maxHp), bHp: avg(boss, (e) => e.maxHp),
    nDmg: avg(reg, (e) => e.dmg), eDmg: avg(eli, (e) => e.dmg), bDmg: avg(boss, (e) => e.dmg),
  };
  clearSpawns();
  r.dps = r.hitN * r.atkRate;
  // golpes básicos para matar / segundos de ataque básico / golpes do inimigo para morrer
  r.hitsN = r.nHp / r.hitN;
  r.secE = r.eHp / (r.hitE * r.atkRate);
  r.secB = r.bHp / (r.hitB * r.atkRate);
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
