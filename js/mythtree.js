// Fase G: poderes míticos. Cada classe ganha 10 poderes no fim da árvore:
// 5 ataques (marca myth, níveis 104–136) e 5 defesas (marca ward, níveis 108–140; ativas e passivas).
// Tudo é montado a partir de "arquétipos" (raio, cone, chuva, invocação, escudo...) com parâmetros por poder:
// a descrição, o ícone e a função em SKILL_FN saem do mesmo registro. Os poderes vão no FIM de CLASSES[cls].skills
// (os índices são dados de save): este arquivo só pode ser importado depois de classes.js.
import { G } from './state.js';
import { CLASSES, SKILL_FN, ICONS, rankMult, softRank, passive, guard, mend, evade, leech, lineBeam, coneBlast, bigHeal, targetPoint, enemiesOnSegment, streakFx, C_, dur, healF, pct, s1, r1 } from './classes.js';
import { hitEnemy, explosion, spawnProjectile, lob, spawnDecoy, after } from './combat.js';
import { ringFx, burst, ghostFx, telegraphFx } from './fx.js';
import { sfx } from './audio.js';
import { isWalkable } from './dungeon.js';
import { rr } from './utils.js';
import { L } from './i18n.js';
import * as PW from './powers.js';

const ang = (dx, dz) => Math.atan2(dz, dx);
const num = (v) => (Math.round(v * 10) / 10).toString().replace('.', L(',', '.'));
// texto dos efeitos extras (atordoar, queimar, congelar, deixar lento), já bilíngue
function fxL(fx) {
  if (!fx) return '';
  const pt = [];
  const en = [];
  if (fx.stun) { pt.push(`atordoa por ${num(fx.stun)}s`); en.push(`stuns for ${num(fx.stun)}s`); }
  if (fx.freeze) { pt.push(`congela por ${num(fx.freeze)}s`); en.push(`freezes for ${num(fx.freeze)}s`); }
  if (fx.burn) { pt.push('incendeia'); en.push('ignites'); }
  if (fx.slow) { pt.push('deixa lentos'); en.push('slows'); }
  return pt.length ? `, ${L(pt.join(' e '), en.join(' and '))}` : '';
}

// ---------------------------------------------------------------------------------------------
// Arquétipos de ataque. run(p, r, P, col) devolve false se não pôde ser usado; d(P, r) é a descrição.
// m = multiplicador de dano base (vezes o rankMult do nível do poder).
// ---------------------------------------------------------------------------------------------
const ATK = {
  beam: {
    run(p, r, P, col) {
      lineBeam(p, P.len, P.w || 0.9, P.m * rankMult(r), col, { knock: 4, ...P.fx });
      sfx.laser();
      return true;
    },
    d: (P, r) => L(`Um raio de ${P.len}m que atravessa tudo e causa ${pct(P.m * rankMult(r))}${fxL(P.fx)}.`, `A ${P.len}m beam that pierces everything and deals ${pct(P.m * rankMult(r))}${fxL(P.fx)}.`),
  },
  cone: {
    run(p, r, P, col) {
      coneBlast(p, P.range, (P.arc * Math.PI) / 180, P.m * rankMult(r), col, { knock: 5, ...P.fx });
      sfx.explode();
      return true;
    },
    d: (P, r) => L(`Uma rajada em cone de ${P.range}m e ${P.arc}° que causa ${pct(P.m * rankMult(r))}${fxL(P.fx)}.`, `A ${P.range}m, ${P.arc}° cone blast that deals ${pct(P.m * rankMult(r))}${fxL(P.fx)}.`),
  },
  nova: {
    run(p, r, P, col) {
      const m = P.m * rankMult(r);
      explosion(p.x, p.z, P.rad, m, { color: col, knock: 5, ...P.fx });
      if (P.m2) {
        after(0.5, () => {
          const pl = G.player;
          if (pl && pl.alive) explosion(pl.x, pl.z, P.rad * 1.4, P.m2 * rankMult(r), { color: 0xffffff, small: true, noProc: true });
        });
      }
      sfx.nova();
      return true;
    },
    d: (P, r) => L(`Uma explosão ao seu redor (${P.rad}m) que causa ${pct(P.m * rankMult(r))}${fxL(P.fx)}${P.m2 ? ` e uma segunda onda maior de ${pct(P.m2 * rankMult(r))}` : ''}.`, `A blast around you (${P.rad}m) that deals ${pct(P.m * rankMult(r))}${fxL(P.fx)}${P.m2 ? ` and a larger second wave of ${pct(P.m2 * rankMult(r))}` : ''}.`),
  },
  rain: {
    run(p, r, P, col) {
      const t = targetPoint(p, 12);
      PW.meteorShower(t.x, t.z, P.n, P.m * rankMult(r), col, { burn: P.fx?.burn, freeze: P.fx?.freeze, gap: 0.1 });
      p.swing = 1;
      return true;
    },
    d: (P, r) => L(`${P.n} projéteis caem do céu onde você mira, cada um causando ${pct(P.m * rankMult(r))} em área${fxL(P.fx)}.`, `${P.n} projectiles fall from the sky where you aim, each dealing ${pct(P.m * rankMult(r))} in an area${fxL(P.fx)}.`),
  },
  volley: {
    run(p, r, P, col) {
      for (let k = 0; k < P.n; k++) {
        after(k * (P.t / P.n), () => {
          const pl = G.player;
          if (!pl || !pl.alive) return;
          const a = ang(pl.aim.dx, pl.aim.dz) + rr(-0.3, 0.3);
          pl.hand = 1 - pl.hand;
          spawnProjectile({ from: 'player', x: pl.x + Math.cos(a) * 0.5, z: pl.z + Math.sin(a) * 0.5, dx: Math.cos(a), dz: Math.sin(a), speed: 26, life: 0.7, mult: P.m * rankMult(r), color: col, size: 0.12, r: 0.24, homing: 6, quiet: true, ...(P.fx || {}) });
          pl.swing = 1;
          if (k % 3 === 0) sfx.shoot();
        });
      }
      return true;
    },
    d: (P, r) => L(`Dispara ${P.n} projéteis teleguiados em ${num(P.t)}s, cada um causando ${pct(P.m * rankMult(r))}.`, `Fires ${P.n} homing projectiles over ${num(P.t)}s, each dealing ${pct(P.m * rankMult(r))}.`),
  },
  summon: {
    run(p, r, P, col) {
      for (const a of G.allies) if (a.kind === P.kind) a.t = Math.min(a.t, 0.01);
      for (let k = 0; k < P.n; k++) {
        const a = (k / P.n) * Math.PI * 2 + rr(0, 0.5);
        let x = p.x + Math.cos(a) * 1.6;
        let z = p.z + Math.sin(a) * 1.6;
        if (!isWalkable(G.dungeon, x, z)) { x = p.x; z = p.z; }
        PW.spawnAlly(P.kind, x, z, { dur: P.dur, mult: P.m * rankMult(r) });
      }
      ringFx(p.x, p.z, 3, col, 0.5, { from: 0.5 });
      sfx.deploy();
      return true;
    },
    d: (P, r) => L(`Invoca ${P.n} ${P.pt} que lutam ao seu lado por ${P.dur}s (${pct(P.m * rankMult(r))} por golpe).`, `Summons ${P.n} ${P.en} that fight by your side for ${P.dur}s (${pct(P.m * rankMult(r))} per strike).`),
  },
  orbit: {
    run(p, r, P, col) {
      PW.orbitBlades(P.n, P.m * rankMult(r), col, P.dur);
      ringFx(p.x, p.z, 2.5, col, 0.5);
      sfx.deploy();
      return true;
    },
    d: (P, r) => L(`${P.n} lâminas de luz giram ao seu redor por ${P.dur}s, cada uma causando ${pct(P.m * rankMult(r))} por contato.`, `${P.n} blades of light orbit you for ${P.dur}s, each dealing ${pct(P.m * rankMult(r))} per contact.`),
  },
  chain: {
    run(p, r, P, col) {
      return PW.chainLightningFrom(p, P.jumps, P.m * rankMult(r), col, P.range) !== false;
    },
    d: (P, r) => L(`Um raio salta por até ${P.jumps} inimigos, causando ${pct(P.m * rankMult(r))} em cada um.`, `A bolt jumps through up to ${P.jumps} enemies, dealing ${pct(P.m * rankMult(r))} to each.`),
  },
  charge: {
    run(p, r, P, col) {
      const sx = p.x;
      const sz = p.z;
      const dx = p.aim.dx;
      const dz = p.aim.dz;
      let len = 0;
      while (len < P.dist && isWalkable(G.dungeon, sx + dx * (len + 0.25), sz + dz * (len + 0.25))) len += 0.25;
      const ex = sx + dx * len;
      const ez = sz + dz * len;
      for (const e of enemiesOnSegment(sx, sz, ex, ez, 1.3)) hitEnemy(e, P.m * rankMult(r), { knock: 3, kx: sx, kz: sz });
      ghostFx(p.model, col);
      p.x = ex;
      p.z = ez;
      p.path = null;
      p.target = null;
      p.dash = null;
      p.invuln = Math.max(p.invuln, 0.7);
      streakFx(sx, sz, ex, ez, 0xffffff, 0.12, 0.5);
      streakFx(sx, sz, ex, ez, col, 0.5, 0.4);
      sfx.dash();
      explosion(ex, ez, P.rad, P.m2 * rankMult(r), { color: col, knock: 4, small: true, ...P.fx });
      G.shake = Math.max(G.shake, 0.4);
      return true;
    },
    d: (P, r) => L(`Avança até ${P.dist}m na direção da mira, invulnerável, causando ${pct(P.m * rankMult(r))} em todos no caminho e uma explosão de ${pct(P.m2 * rankMult(r))} no fim${fxL(P.fx)}.`, `Charges up to ${P.dist}m toward your aim, invulnerable, dealing ${pct(P.m * rankMult(r))} to everything in the path and a ${pct(P.m2 * rankMult(r))} blast at the end${fxL(P.fx)}.`),
  },
  pillars: {
    run(p, r, P, col) {
      PW.pillars(p, P.n, P.m * rankMult(r), col, P.fx || {});
      p.swing = 1;
      return true;
    },
    d: (P, r) => L(`${P.n} colunas de energia surgem em linha à sua frente, cada uma causando ${pct(P.m * rankMult(r))}${fxL(P.fx)}.`, `${P.n} columns of energy erupt in a line ahead of you, each dealing ${pct(P.m * rankMult(r))}${fxL(P.fx)}.`),
  },
  bomb: {
    run(p, r, P, col) {
      const t = targetPoint(p, 11);
      lob({ x: p.x, z: p.z, tx: t.x, tz: t.z, time: 0.55, color: col, onLand: (x, z) => {
        explosion(x, z, P.rad, P.m * rankMult(r), { color: col, knock: 4, ...P.fx });
        after(0.6, () => explosion(x, z, P.rad * 0.7, P.m2 * rankMult(r), { color: 0xffffff, small: true, noProc: true }));
      } });
      p.swing = 1;
      return true;
    },
    d: (P, r) => L(`Arremessa uma bomba que explode em ${P.rad}m causando ${pct(P.m * rankMult(r))}${fxL(P.fx)} e detona de novo depois (${pct(P.m2 * rankMult(r))}).`, `Throws a bomb that explodes within ${P.rad}m for ${pct(P.m * rankMult(r))}${fxL(P.fx)} and detonates again (${pct(P.m2 * rankMult(r))}).`),
  },
  vortex: {
    run(p, r, P, col) {
      const t = targetPoint(p, 10);
      PW.blackHole(t.x, t.z, P.dur, P.m * rankMult(r), col);
      p.swing = 1;
      return true;
    },
    d: (P, r) => L(`Abre um vórtice onde você mira por ${P.dur}s: puxa os inimigos e causa ${pct(P.m * rankMult(r))} a cada pulso.`, `Opens a vortex where you aim for ${P.dur}s: it pulls enemies in and deals ${pct(P.m * rankMult(r))} per pulse.`),
  },
  storm: {
    run(p, r, P, col) {
      PW.lightningStorm(P.dur, P.rate, P.m * rankMult(r), col);
      ringFx(p.x, p.z, 4, col, 0.6, { from: 1 });
      return true;
    },
    d: (P, r) => L(`Uma tempestade de raios cai por ${P.dur}s (cerca de ${P.rate} por segundo, ${pct(P.m * rankMult(r))} cada).`, `A lightning storm rages for ${P.dur}s (about ${P.rate} per second, ${pct(P.m * rankMult(r))} each).`),
  },
  omni: {
    run(p, r, P, col) {
      return PW.omnislash(p, P.n, P.m * rankMult(r), col) !== false;
    },
    d: (P, r) => L(`Teleporta entre até ${P.n} inimigos próximos num turbilhão de cortes (${pct(P.m * rankMult(r))} cada), invulnerável, com crítico garantido no último.`, `Teleports between up to ${P.n} nearby enemies in a flurry of cuts (${pct(P.m * rankMult(r))} each), invulnerable, with a guaranteed crit on the last.`),
  },
  ring: {
    run(p, r, P, col) {
      PW.bulletRing(p, P.waves, P.n, P.m * rankMult(r), col);
      return true;
    },
    d: (P, r) => L(`${P.waves} ondas de ${P.n} projéteis em círculo ao seu redor, cada um causando ${pct(P.m * rankMult(r))}.`, `${P.waves} waves of ${P.n} projectiles in a circle around you, each dealing ${pct(P.m * rankMult(r))}.`),
  },
  mark: {
    run(p, r, P, col) {
      const t = targetPoint(p, 12);
      telegraphFx(t.x, t.z, P.rad, P.delay + 0.8, col);
      ringFx(t.x, t.z, P.rad * 1.4, col, 0.7, { from: 2 });
      sfx.shoot();
      p.swing = 1;
      after(P.delay, () => {
        if (!G.player || !G.player.alive) return;
        explosion(t.x, t.z, P.rad, P.m * rankMult(r), { color: col, knock: 6, ...P.fx });
        ringFx(t.x, t.z, P.rad, 0xffffff, 0.5, { from: 1 });
        G.shake = Math.max(G.shake, 0.6);
      });
      return true;
    },
    d: (P, r) => L(`Marca o chão onde você mira; ${num(P.delay)}s depois um golpe colossal causa ${pct(P.m * rankMult(r))} em ${P.rad}m${fxL(P.fx)}.`, `Marks the ground where you aim; ${num(P.delay)}s later a colossal strike deals ${pct(P.m * rankMult(r))} within ${P.rad}m${fxL(P.fx)}.`),
  },
};

// ---------------------------------------------------------------------------------------------
// Arquétipos de defesa ativa
// ---------------------------------------------------------------------------------------------
const WRD = {
  bulwark: {
    run(p, r, P, col) {
      const t = dur(P.t, r);
      guard(p, t, P.taken, col);
      if (P.mend) mend(p, t, P.mend);
      after(t, () => {
        const pl = G.player;
        if (!pl || !pl.alive) return;
        explosion(pl.x, pl.z, P.rad, P.m * rankMult(r), { color: col, knock: 6, small: true });
        ringFx(pl.x, pl.z, P.rad, 0xffffff, 0.4, { from: 1 });
      });
      return true;
    },
    d: (P, r) => L(`Por ${s1(dur(P.t, r))}s você recebe só ${pct(P.taken)} do dano${P.mend ? ` e recupera ${pct(P.mend)} da vida por segundo` : ''}. Ao terminar, uma onda de choque causa ${pct(P.m * rankMult(r))} em ${P.rad}m.`, `For ${s1(dur(P.t, r))}s you take only ${pct(P.taken)} damage${P.mend ? ` and recover ${pct(P.mend)} health per second` : ''}. When it ends, a shockwave deals ${pct(P.m * rankMult(r))} within ${P.rad}m.`),
  },
  shield: {
    run(p, r, P, col) {
      PW.plasmaShield(p, dur(P.t, r), P.absorb, col, { freeze: !!P.freeze });
      return true;
    },
    d: (P, r) => L(`Um escudo de plasma por ${s1(dur(P.t, r))}s absorve até ${pct(P.absorb)} da sua vida e devolve os tiros inimigos${P.freeze ? ', congelando quem eles acertam' : ''}.`, `A plasma shield for ${s1(dur(P.t, r))}s absorbs up to ${pct(P.absorb)} of your health and sends enemy shots back${P.freeze ? ', freezing whoever they hit' : ''}.`),
  },
  mendfield: {
    run(p, r, P, col) {
      bigHeal(p, healF(P.heal, r), col);
      if (P.rate) mend(p, P.mendT, P.rate);
      if (P.en) p.en = Math.min(p.stats.maxEn, p.en + P.en);
      if (P.shield) p.shield = Math.max(p.shield, p.stats.maxHp * P.shield);
      return true;
    },
    d: (P, r) => L(`Cura ${pct(healF(P.heal, r))} da vida na hora${P.rate ? `, mais ${pct(P.rate)} por segundo durante ${P.mendT}s` : ''}${P.en ? `, recupera ${P.en} de energia` : ''}${P.shield ? ` e dá um escudo de ${pct(P.shield)} da vida` : ''}.`, `Heals ${pct(healF(P.heal, r))} of your health instantly${P.rate ? `, plus ${pct(P.rate)} per second for ${P.mendT}s` : ''}${P.en ? `, restores ${P.en} energy` : ''}${P.shield ? ` and grants a shield worth ${pct(P.shield)} of your health` : ''}.`),
  },
  phase: {
    run(p, r, P, col) {
      p.invuln = Math.max(p.invuln, P.inv);
      evade(p, dur(P.t, r), P.evade);
      ghostFx(p.model, col);
      explosion(p.x, p.z, P.rad, P.m * rankMult(r), { color: col, knock: 5, stun: 0.8 });
      return true;
    },
    d: (P, r) => L(`Fica invulnerável por ${num(P.inv)}s e esquiva de ${P.evade}% dos golpes por ${s1(dur(P.t, r))}s, soltando uma explosão de ${pct(P.m * rankMult(r))} em ${P.rad}m que atordoa.`, `You become invulnerable for ${num(P.inv)}s and dodge ${P.evade}% of hits for ${s1(dur(P.t, r))}s, releasing a ${pct(P.m * rankMult(r))} blast within ${P.rad}m that stuns.`),
  },
  decoy: {
    run(p, r, P, col) {
      const x = p.x + p.aim.dx * 2.5;
      const z = p.z + p.aim.dz * 2.5;
      const ok = isWalkable(G.dungeon, x, z);
      const dx = ok ? x : p.x;
      const dz = ok ? z : p.z;
      spawnDecoy(dx, dz, dur(P.t, r), () => explosion(dx, dz, P.rad, P.m * rankMult(r), { color: col, knock: 6, stun: 1 }));
      p.invuln = Math.max(p.invuln, 0.5);
      burst(p.x, 1, p.z, col, 20, 4, 0.07, 0.5);
      sfx.deploy();
      return true;
    },
    d: (P, r) => L(`Cria uma isca que atrai os inimigos por ${s1(dur(P.t, r))}s e explode ao sumir, causando ${pct(P.m * rankMult(r))} em ${P.rad}m e atordoando.`, `Creates a decoy that draws enemies for ${s1(dur(P.t, r))}s and explodes when it ends, dealing ${pct(P.m * rankMult(r))} within ${P.rad}m and stunning.`),
  },
  vamp: {
    run(p, r, P, col) {
      const t = dur(P.t, r);
      leech(p, t);
      evade(p, t, P.evade);
      guard(p, t, P.taken, col);
      return true;
    },
    d: (P, r) => L(`Por ${s1(dur(P.t, r))}s: +10% de roubo de vida, esquiva de ${P.evade}% dos golpes e só ${pct(P.taken)} do dano recebido.`, `For ${s1(dur(P.t, r))}s: +10% life steal, ${P.evade}% dodge chance and only ${pct(P.taken)} damage taken.`),
  },
};

// ---------------------------------------------------------------------------------------------
// Ícones: um desenho base por arquétipo + uma marca pequena no canto (a "assinatura" do poder)
// ---------------------------------------------------------------------------------------------
const BASE = {
  beam: '<path d="M3 16h22"/><path d="M3 10h16M3 22h16" opacity=".5"/><path d="M21 11l6 5-6 5"/>',
  cone: '<path d="M4 16L28 5M4 16l24 11M4 16h24"/><path d="M28 5v22"/>',
  nova: '<circle cx="16" cy="16" r="5"/><circle cx="16" cy="16" r="11" opacity=".6"/><path d="M16 2v4M16 26v4M2 16h4M26 16h4"/>',
  rain: '<path d="M8 3l-3 9M16 2l-3 9M24 3l-3 9"/><path d="M5 20c3-2 5 2 8 0s5 2 8 0 4 2 6 0"/><path d="M5 27h22" opacity=".6"/>',
  volley: '<path d="M3 8h13M3 16h18M3 24h13"/><path d="M19 6l5 2-5 2M24 14l5 2-5 2M19 22l5 2-5 2"/>',
  summon: '<circle cx="16" cy="8" r="3.5"/><path d="M16 12v9M10 15l6-2 6 2"/><path d="M8 29l8-8 8 8"/>',
  orbit: '<ellipse cx="16" cy="16" rx="12" ry="5"/><ellipse cx="16" cy="16" rx="5" ry="12"/><circle cx="16" cy="16" r="2"/>',
  chain: '<path d="M18 3L8 17h7l-3 12 12-16h-8z"/>',
  charge: '<path d="M4 20h13M4 14h8M4 26h8" opacity=".6"/><path d="M17 8l4-4 8 12-8 4-2-5z"/>',
  pillars: '<path d="M7 28V14M14 28V7M21 28V11M27 28V18"/><path d="M4 28h26"/>',
  bomb: '<circle cx="14" cy="19" r="8"/><path d="M19 12l5-5M24 7l3-1M25 4l1 3"/>',
  vortex: '<circle cx="16" cy="16" r="2"/><path d="M16 5a11 11 0 1 1-11 11"/><path d="M16 10a6 6 0 1 1-6 6"/>',
  storm: '<path d="M8 17a6 6 0 0 1 1-11 7 7 0 0 1 13 2 5 5 0 0 1 1 9z"/><path d="M15 17l-3 5h5l-3 6"/>',
  omni: '<path d="M5 27L27 5M5 5l22 22"/><path d="M16 3v6M16 23v6" opacity=".6"/>',
  ring: '<circle cx="16" cy="16" r="3"/><path d="M16 4v5M16 23v5M4 16h5M23 16h5M8 8l3 3M21 21l3 3M24 8l-3 3M11 21l-3 3"/>',
  mark: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/>',
  bulwark: '<path d="M16 3l11 4v9c0 7-5 11-11 13C10 27 5 23 5 16V7z"/><path d="M16 9v12M10 15h12"/>',
  shield: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6" opacity=".6"/><path d="M16 5v4M16 23v4M5 16h4M23 16h4"/>',
  mendfield: '<path d="M16 28S4 20 4 12a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 8-12 16-12 16z"/><path d="M16 13v7M12.5 16.5h7"/>',
  phase: '<path d="M10 4h12l-6 12 6 12H10l6-12z"/>',
  decoy: '<circle cx="11" cy="9" r="3"/><path d="M11 12v8M6 15h10M7 28l4-8 4 8"/><circle cx="23" cy="11" r="3" opacity=".5"/><path d="M23 14v7M18 17h10" opacity=".5"/>',
  vamp: '<path d="M16 4c-5 7-8 10-8 15a8 8 0 0 0 16 0c0-5-3-8-8-15z"/><path d="M12 20c1 2 3 3 5 3"/>',
};
const MARK = {
  flame: '<path d="M16 3c1 6 8 9 8 17a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 2 4 3 3 1-3 0-7 1-12z"/>',
  ice: '<path d="M16 2v28M4 9l24 14M28 9L4 23"/>',
  bolt: '<path d="M18 2L6 18h9l-3 12 14-18h-9z"/>',
  star: '<path d="M16 3l4 9 10 1-8 7 3 10-9-6-9 6 3-10-8-7 10-1z"/>',
  drop: '<path d="M16 3c-6 8-9 12-9 17a9 9 0 0 0 18 0c0-5-3-9-9-17z"/>',
  ring: '<circle cx="16" cy="16" r="11"/>',
  cross: '<path d="M16 4v24M4 16h24"/>',
  eye: '<path d="M2 16c5-9 23-9 28 0-5 9-23 9-28 0z"/><circle cx="16" cy="16" r="4"/>',
  moon: '<path d="M24 5a12 12 0 1 0 3 19 10 10 0 0 1-3-19z"/>',
  blade: '<path d="M6 26L26 6M20 6h6v6"/>',
};
const iconOf = (arch, mark) => `<g transform="translate(1 4) scale(.86)">${BASE[arch]}</g><g transform="translate(19.5 0.5) scale(.4)" stroke-width="4.5">${MARK[mark]}</g>`;

// ---------------------------------------------------------------------------------------------
// Montagem dos poderes
// ---------------------------------------------------------------------------------------------
// ataque mítico: cls, arquétipo, id, nível, nome, marca do ícone, custo, recarga, parâmetros
function myth(cls, arch, id, req, name, mark, cost, cd, P) {
  ICONS[id] = iconOf(arch, mark);
  SKILL_FN[id] = (p, r) => ATK[arch].run(p, r, P, C_(cls));
  CLASSES[cls].skills.push({ id, req, name, icon: id, cost, cd, desc: (r) => ATK[arch].d(P, r), myth: true });
}
// defesa ativa
function ward(cls, arch, id, req, name, mark, cost, cd, P) {
  ICONS[id] = iconOf(arch, mark);
  SKILL_FN[id] = (p, r) => WRD[arch].run(p, r, P, C_(cls));
  CLASSES[cls].skills.push({ id, req, name, icon: id, cost, cd, desc: (r) => WRD[arch].d(P, r), ward: true });
}
// defesa passiva
const wardP = (cls, id, req, name, icon, mods) => CLASSES[cls].skills.push({ ...passive(id, req, name, icon, mods), ward: true });

// ---------------- Lâmina ----------------
myth('blade', 'beam', 'bMoonSever', 104, L('Lua Partida', 'Moon Sever'), 'moon', 70, 12, { len: 18, w: 1.3, m: 9, fx: { burn: 1 } });
myth('blade', 'omni', 'bBladeDance', 112, L('Dança das Mil Lâminas', 'Dance of a Thousand Blades'), 'blade', 75, 16, { n: 12, m: 2.8 });
myth('blade', 'rain', 'bSteelRain', 120, L('Chuva de Aço', 'Steel Rain'), 'star', 80, 18, { n: 18, m: 2.6 });
myth('blade', 'summon', 'bGhostLegion', 128, L('Legião Fantasma', 'Ghost Legion'), 'eye', 90, 28, { kind: 'shade', n: 5, dur: 16, m: 2.2, pt: 'clones de sombra', en: 'shadow clones' });
myth('blade', 'mark', 'bWorldEnder', 136, L('Fim dos Mundos', 'World Ender'), 'cross', 110, 26, { rad: 8, delay: 1.4, m: 16, fx: { stun: 2 } });
ward('blade', 'bulwark', 'bwSteelVeil', 108, L('Véu de Aço', 'Steel Veil'), 'blade', 50, 24, { t: 5, taken: 0.3, mend: 0.02, rad: 4.5, m: 4 });
wardP('blade', 'bwKiAura', 116, L('Aura de Ki', 'Ki Aura'), 'pWind', (r) => ({ dmgRed: r1(0.4 * r), hpRegen: r1(1.0 * r) }));
ward('blade', 'phase', 'bwGhostStep', 124, L('Passo Fantasma', 'Ghost Step'), 'moon', 45, 22, { inv: 2.5, t: 5, evade: 60, rad: 4.5, m: 5 });
wardP('blade', 'bwIronSoul', 132, L('Alma de Ferro', 'Iron Soul'), 'pPlate', (r) => ({ armorPct: 6 * r, hpPct: 3 * r }));
ward('blade', 'mendfield', 'bwSamuraiHeart', 140, L('Coração Samurai', 'Samurai Heart'), 'cross', 60, 36, { heal: 0.5, rate: 0.05, mendT: 6, en: 50 });

// ---------------- Atiradora ----------------
myth('gunner', 'beam', 'gTracer', 104, L('Bala Traçante', 'Tracer Round'), 'bolt', 70, 12, { len: 20, w: 0.8, m: 8.5, fx: { stun: 1 } });
myth('gunner', 'ring', 'gBulletHell', 112, L('Inferno de Balas', 'Bullet Hell'), 'star', 75, 16, { waves: 6, n: 16, m: 1.5 });
myth('gunner', 'chain', 'gRicochetPrime', 120, L('Ricochete Infinito', 'Infinite Ricochet'), 'ring', 80, 14, { jumps: 12, m: 3.6, range: 10 });
myth('gunner', 'summon', 'gDroneSquad', 128, L('Esquadrão de Drones', 'Drone Squad'), 'eye', 90, 28, { kind: 'drone', n: 4, dur: 18, m: 2.0, pt: 'drones de combate', en: 'combat drones' });
myth('gunner', 'vortex', 'gSingularRound', 136, L('Bala Singular', 'Singularity Round'), 'moon', 110, 26, { dur: 6, m: 2.2 });
ward('gunner', 'shield', 'gwTacShield', 108, L('Escudo Tático', 'Tactical Shield'), 'bolt', 45, 24, { t: 6, absorb: 0.5, freeze: true });
wardP('gunner', 'gwKevlar', 116, L('Colete Pesado', 'Heavy Vest'), 'pPlate', (r) => ({ hpPct: 4 * r, armorPct: 5 * r }));
ward('gunner', 'decoy', 'gwHologram', 124, L('Holograma-Isca', 'Decoy Hologram'), 'eye', 45, 22, { t: 6, rad: 5, m: 6 });
wardP('gunner', 'gwReflexes', 132, L('Reflexos de Atirador', 'Gunslinger Reflexes'), 'pWind', (r) => ({ dodge: r1(0.4 * r), hpRegen: r1(0.8 * r) }));
ward('gunner', 'mendfield', 'gwSecondChance', 140, L('Segunda Chance', 'Second Chance'), 'star', 60, 36, { heal: 0.45, shield: 0.3 });
