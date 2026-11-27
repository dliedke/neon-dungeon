// Reações entre elementos nos inimigos.
// Cada inimigo pode estar com fogo (queimando), veneno (veneno do Biohacker ou piso tóxico), frio (lento, congelado
// ou em gelo/neve), choque (golpes da Valquíria e do Netrunner, raios em cadeia, Santuário da Tempestade), molhado
// (água: maré, correnteza, fontes termais, poças) ou com óleo (poças de óleo). Quando um elemento novo encontra outro
// que já está no inimigo, sai uma reação: vapor, estilhaçar, curto-circuito, congelamento, explosão tóxica ou incêndio.
// Os pisos dos biomas só marcam o inimigo (não ferem): quem usa o bioma a seu favor ganha as reações.
import { G } from './state.js';
import { L } from './i18n.js';
import { rr } from './utils.js';
import { featAt, FEAT } from './biomes.js';
import { burst, ringFx, floatText, beamFx } from './fx.js';
import { sfx } from './audio.js';
import { hitEnemy, enemiesInRadius } from './combat.js';
import { achAdd, achMark } from './ach.js';
import { toast } from './ui.js';

export const REACTIONS = {
  steam: { icon: '♨️', name: L('Vapor', 'Steam'), word: L('VAPOR!', 'STEAM!'), color: 0xe8f6ff, desc: L('fogo + frio ou água: uma nuvem de vapor fere quem está em volta', 'fire + cold or water: a steam cloud hurts everyone around') },
  shatter: { icon: '💎', name: L('Estilhaçar', 'Shatter'), word: L('ESTILHAÇOU!', 'SHATTER!'), color: 0x9fe8ff, desc: L('choque em inimigo congelado: ele estilhaça e leva um golpe enorme', 'shock on a frozen enemy: it shatters and takes a huge hit') },
  short: { icon: '⚡', name: L('Curto-circuito', 'Short Circuit'), word: L('CURTO-CIRCUITO!', 'SHORT CIRCUIT!'), color: 0x66f0ff, desc: L('choque em inimigo molhado: atordoa e o raio pula para os outros molhados', 'shock on a wet enemy: it is stunned and the bolt jumps to the other wet ones') },
  freeze: { icon: '🧊', name: L('Congelar', 'Flash Freeze'), word: L('CONGELOU!', 'FROZEN!'), color: 0x7fc8ff, desc: L('frio em inimigo molhado: congela na hora', 'cold on a wet enemy: it freezes on the spot') },
  toxic: { icon: '☣️', name: L('Explosão tóxica', 'Toxic Blast'), word: L('EXPLOSÃO TÓXICA!', 'TOXIC BLAST!'), color: 0x9dff3a, desc: L('fogo + veneno: o veneno explode em volta', 'fire + poison: the poison explodes around it') },
  blaze: { icon: '🔥', name: L('Incêndio', 'Wildfire'), word: L('INCÊNDIO!', 'WILDFIRE!'), color: 0xff7a1a, desc: L('fogo em inimigo com óleo: queima muito mais e o fogo pula para quem está perto', 'fire on an oiled enemy: it burns far harder and the fire spreads to anyone nearby') },
};
export const REACTION_KINDS = Object.keys(REACTIONS);

// classes cujos golpes eletrizam (choque)
const SHOCK_CLS = new Set(['lancer', 'netrunner']);
const shockClass = () => !!G.char && SHOCK_CLS.has(G.char.cls);

// o que o piso deixa no inimigo (sem ferir): molhado, óleo, tóxico, frio e quente
function groundTag(e, f) {
  if (f === FEAT.TIDE || f === FEAT.CURRENT || f === FEAT.SPRING) e.wetT = 2;
  else if (f === FEAT.OIL) e.oilT = 3;
  else if (f === FEAT.SLUDGE || f === FEAT.RAD) e.toxT = 2;
  else if (f === FEAT.ICE || f === FEAT.SNOW) e.chillT = 1.5;
  else if (f === FEAT.LAVA || f === FEAT.EMBER) e.hotT = 1.5;
}

// a cada quadro, para cada inimigo vivo (enemies.js): tempos dos elementos, piso embaixo e gotas/faíscas
export function tickElems(e, dt) {
  if (e.shockT > 0) {
    e.shockT -= dt;
    if (Math.random() < dt * 6) burst(e.x + rr(-0.3, 0.3), e.height * rr(0.4, 1), e.z + rr(-0.3, 0.3), 0x66f0ff, 1, 2, 0.05, 0.18);
  }
  if (e.wetT > 0) {
    e.wetT -= dt;
    if (Math.random() < dt * 3) burst(e.x, e.height * 0.8, e.z, 0x5ab8ff, 1, 0.5, 0.05, 0.5, { grav: 6 });
  }
  if (e.oilT > 0) {
    e.oilT -= dt;
    if (Math.random() < dt * 2) burst(e.x, e.height * 0.6, e.z, 0x2a2238, 1, 0.4, 0.06, 0.6, { grav: 5 });
  }
  if (e.toxT > 0) e.toxT -= dt;
  if (e.chillT > 0) e.chillT -= dt;
  if (e.hotT > 0) e.hotT -= dt;
  e.gT = (e.gT || 0) - dt;
  if (e.gT <= 0 && G.dungeon && !e.T.fly && !e.static) {
    e.gT = 0.3;
    groundTag(e, featAt(G.dungeon, e.x, e.z));
  }
}

const fireOn = (e) => (e.burnT > 0 && e.burnKind !== 'poison') || e.hotT > 0;
const poisonOn = (e) => (e.burnT > 0 && e.burnKind === 'poison') || e.toxT > 0;
const coldOn = (e) => e.slowT > 0 || e.frozenT > 0 || e.chillT > 0;

// Chamado por applyStatus (combat.js) antes de aplicar os efeitos do golpe. o: opções do golpe (não mexe nelas:
// muitos poderes usam o mesmo objeto para vários alvos). Devolve 0 (nada), 1 (a reação consumiu os efeitos do golpe)
// ou 2 (incêndio: a queimadura deste golpe sai 2,5x mais forte e dura 5s)
export function react(e, o) {
  if (!e.alive || e.inert || o.react || e.T.prop || e.T.breakable || e.decoy) return 0;
  const poisonCls = !!G.char && G.char.cls === 'biohacker';
  const inFire = !!o.burn && !(o.poison || poisonCls);
  const inPoison = !!o.burn && !!(o.poison || poisonCls);
  const inCold = !!(o.slow || o.freeze);
  const inShock = !!o.shock || (!o.dot && !o.auto && shockClass());
  if (inShock) e.shockT = 2.5;
  if (!(inFire || inPoison || inCold || inShock)) return 0;
  if (G.t - (e.reactT ?? -9) < 1.5) return 0;
  let k = null;
  if (inShock && e.frozenT > 0) k = 'shatter';
  else if (inShock && e.wetT > 0) k = 'short';
  else if (inFire && e.oilT > 0) k = 'blaze';
  else if ((inFire && poisonOn(e)) || (inPoison && fireOn(e))) k = 'toxic';
  else if ((inFire && (coldOn(e) || e.wetT > 0)) || (inCold && fireOn(e))) k = 'steam';
  else if (inCold && e.wetT > 0) k = 'freeze';
  if (!k) return 0;
  e.reactT = G.t;
  return REACT_FN[k](e, o);
}

const X = (e) => ({ noProc: true, auto: true, react: true, kx: e.x, kz: e.z });
let wordT = 0;
function announce(e, k) {
  const R = REACTIONS[k];
  // o nome da reação no máximo a cada 0,25s (várias juntas viram uma só)
  if (G.t - wordT > 0.25) {
    wordT = G.t;
    floatText(e.x, (e.height || 1.4) + 0.9, e.z, R.word, 'rx rx-' + k);
  }
  // primeira vez de cada reação (no aparelho ou na conta): explica a combinação
  const sets = G.save && G.save.stats && G.save.stats.sets;
  if (sets && !(sets.reactions && sets.reactions[k])) toast(`${R.icon} <b>${L('Reação', 'Reaction')}: ${R.name}</b> · ${R.desc}`, 'leg');
  achAdd('reactions', 1);
  achMark('reactions', k);
}

const REACT_FN = {
  // fogo + frio/água: nuvem de vapor que fere em volta; apaga o fogo e o frio do alvo
  steam(e) {
    announce(e, 'steam');
    e.burnT = 0;
    e.slowT = 0;
    e.chillT = 0;
    e.wetT = 0;
    burst(e.x, 0.6, e.z, 0xe8f6ff, 26, 3, 0.16, 1.1, { grav: -2.5, up: 1.2 });
    ringFx(e.x, e.z, 2.4, 0xe8f6ff, 0.45, { from: 0.4 });
    sfx.steam();
    for (const t of enemiesInRadius(e.x, e.z, 2.4)) hitEnemy(t, 1.1, X(e));
    return 1;
  },
  // choque em congelado: golpe enorme e o gelo quebra
  shatter(e) {
    announce(e, 'shatter');
    e.frozenT = 0;
    e.stun = Math.min(e.stun, 0.1);
    burst(e.x, e.height * 0.6, e.z, 0x9fe8ff, 30, 6, 0.09, 0.6, { up: 1 });
    burst(e.x, e.height * 0.6, e.z, 0xffffff, 8, 4, 0.05, 0.3);
    sfx.shatter();
    G.shake = Math.max(G.shake, 0.18);
    hitEnemy(e, 2.6, X(e));
    return 1;
  },
  // choque em molhado: atordoa e o raio pula para até 4 outros molhados a até 6m
  short(e) {
    announce(e, 'short');
    if (!e.boss) e.stun = Math.max(e.stun, 0.8);
    burst(e.x, e.height * 0.5, e.z, 0x66f0ff, 16, 5, 0.06, 0.35);
    sfx.zap();
    hitEnemy(e, 0.7, X(e));
    let n = 0;
    for (const t of enemiesInRadius(e.x, e.z, 6)) {
      if (t === e || !(t.wetT > 0) || n >= 4) continue;
      n++;
      beamFx(e.x, e.height * 0.5, e.z, t.x, t.height * 0.5, t.z, 0x66f0ff);
      if (!t.boss) t.stun = Math.max(t.stun, 0.6);
      t.shockT = 2.5;
      hitEnemy(t, 0.7, X(t));
    }
    return 0;
  },
  // frio em molhado: congela na hora (o chefe só fica bem lento)
  freeze(e) {
    announce(e, 'freeze');
    e.wetT = 0;
    if (e.boss) e.slowT = Math.max(e.slowT || 0, 3);
    else {
      e.stun = Math.max(e.stun, 1.5 * (e.T.big ? 0.35 : e.heavy ? 0.6 : 1));
      e.frozenT = e.stun;
    }
    ringFx(e.x, e.z, 1.3, 0x7fc8ff, 0.4, { from: 0.3 });
    burst(e.x, e.height * 0.5, e.z, 0xcfefff, 16, 3, 0.07, 0.5);
    sfx.shatter();
    return 1;
  },
  // fogo + veneno: o veneno explode em volta
  toxic(e) {
    announce(e, 'toxic');
    e.toxT = 0;
    if (e.burnKind === 'poison') e.burnT = 0;
    ringFx(e.x, e.z, 2.8, 0x9dff3a, 0.45, { from: 0.3 });
    burst(e.x, 0.6, e.z, 0x9dff3a, 26, 7, 0.09, 0.55, { up: 0.8 });
    burst(e.x, 0.6, e.z, 0xff7a1a, 12, 6, 0.08, 0.45, { up: 0.8 });
    sfx.explode();
    G.shake = Math.max(G.shake, 0.2);
    for (const t of enemiesInRadius(e.x, e.z, 2.8)) hitEnemy(t, 1.5, X(e));
    return 0;
  },
  // fogo em óleo: queima muito mais forte e o fogo pula para quem está a até 3m
  blaze(e, o) {
    announce(e, 'blaze');
    e.oilT = 0;
    burst(e.x, e.height * 0.5, e.z, 0xff7a1a, 22, 4, 0.1, 0.7, { grav: -3, up: 1 });
    ringFx(e.x, e.z, 3, 0xff7a1a, 0.4, { from: 0.4 });
    sfx.explode();
    for (const t of enemiesInRadius(e.x, e.z, 3)) if (t !== e) hitEnemy(t, 0.4, { ...X(t), burn: o.burn * (t.oilT > 0 ? 2.5 : 1) });
    return 2;
  },
};
