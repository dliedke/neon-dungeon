// Relatório de balanceamento: node tools/balance.mjs [classe] [--json saida.json]
// Sobe um http-server e um Edge headless próprios, carrega o jogo e roda tools/balance-page.js
// num caminho de progressão típico (Normal → Pesadelo → Inferno → Abismo I…D). Só mexe no que ele mesmo abriu.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const CLS = args.find((a) => !a.startsWith('--') && !a.endsWith('.json')) || 'blade';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const PORT = 8124, DBG = 9334;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- caminho de progressão (checkpoints). rarity: melhor raridade que o jogador costuma ter ali ----
// Estágios: Normal na dificuldade Normal, Pesadelo no Brutal, Inferno na Morte, depois o Abismo no Inferno,
// subindo 1 nível de Abismo a cada 3 andares (um chefe por nível).
const STAGES = [
  { name: 'Normal', tier: 0, diff: 'normal', abyss: 0, floors: 50, rarity: 3 },
  { name: 'Pesadelo', tier: 1, diff: 'brutal', abyss: 0, floors: 50, rarity: 4 },
  { name: 'Inferno', tier: 2, diff: 'death', abyss: 0, floors: 50, rarity: 5 },
];
const ABYSS_CK = [1, 5, 10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
const FLOORS_PER_ABYSS = 3;

const roman = (n) => String(n);
const short = (v) => {
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  const u = [[1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [d, s] of u) if (a >= d) return (v / d).toFixed(a / d >= 100 ? 0 : 1) + s;
  return a >= 100 ? Math.round(v).toString() : a >= 10 ? v.toFixed(1) : v.toFixed(2);
};
const x = (v) => '×' + (v >= 100 ? short(v) : v.toFixed(v >= 10 ? 1 : 2));

async function main() {
  const prof = mkdtempSync(join(tmpdir(), 'nd-balance-'));
  const srv = spawn(`npx http-server -p ${PORT} -s -c-1 .`, { shell: true, stdio: 'ignore' });
  const edge = spawn(EDGE, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
  const kill = () => {
    for (const p of [edge, srv]) try { execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' }); } catch {}
    try { rmSync(prof, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', kill);
  try {
    let page;
    for (let i = 0; i < 60 && !page; i++) {
      await sleep(500);
      try { page = (await (await fetch(`http://127.0.0.1:${DBG}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    }
    if (!page) throw new Error('Edge não abriu');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pend = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') console.error('!! exceção na página:', d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    // o controle de verdade do PC aparece no headless: esconde
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'navigator.getGamepads = () => [];' });
    for (let i = 0; i < 40; i++) {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?lang=pt` });
      await sleep(1500);
      try { if (await ev('!!window.__G')) break; } catch {}
    }
    await ev(`(async () => { const m = await import('/js/main.js'); m.startGame(${JSON.stringify(CLS)}, true); await new Promise(r => setTimeout(r, 1500)); window.__B = await import('/tools/balance-page.js'); return true; })()`);

    // ---- XP pelo caminho: amostra andares reais e integra ----
    const xpCache = {};
    const fxp = async (sc) => {
      const k = JSON.stringify(sc);
      if (!xpCache[k]) xpCache[k] = await ev(`window.__B.floorXp(${k})`);
      return xpCache[k];
    };
    const interp = async (base, floors, samples) => {
      const pts = [];
      for (const f of samples) pts.push([f, (await fxp({ ...base, floor: f })).xp]);
      return (f) => {
        for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + ((vb - va) * (f - a)) / (b - a); }
        return pts[pts.length - 1][1];
      };
    };
    let totalXp = 0;
    let implants = 0;
    const checkpoints = [];
    process.stderr.write('XP do caminho');
    for (const S of STAGES) {
      const xf = await interp({ cls: CLS, tier: S.tier, diff: S.diff, abyss: 0 }, S.floors, [1, 12, 25, 38, 50]);
      for (let f = 1; f <= S.floors; f++) {
        totalXp += xf(f);
        if (f % 3 === 0 || f === 50) implants = Math.min(implants + 1, (S.tier + 1) * 17);
        if (f === 25 || f === 50) checkpoints.push({ label: `${S.name} andar ${f}`, cls: CLS, tier: S.tier, diff: S.diff, abyss: 0, floor: f, rarity: S.rarity, xp: totalXp, implants, infWins: 0 });
      }
      process.stderr.write('.');
    }
    // Abismo: 3 andares por nível, andar típico 25, ciclos de 50 andares = vitórias no Inferno
    let prevN = 0, prevXp = (await fxp({ cls: CLS, tier: 2, diff: 'death', abyss: 0, floor: 25 })).xp;
    for (const N of ABYSS_CK) {
      const cur = (await fxp({ cls: CLS, tier: 2, diff: 'death', abyss: N, floor: 25 })).xp;
      // soma geométrica entre os checkpoints (a XP cresce ~exponencialmente no Abismo)
      const steps = N - prevN;
      const g = Math.pow(cur / prevXp, 1 / steps);
      let v = prevXp;
      for (let i = 0; i < steps; i++) { v *= g; totalXp += v * FLOORS_PER_ABYSS; }
      prevN = N; prevXp = cur;
      checkpoints.push({ label: `Abismo ${roman(N)}`, cls: CLS, tier: 2, diff: 'death', abyss: N, floor: 25, rarity: 6, xp: totalXp, implants, infWins: Math.floor((150 + N * FLOORS_PER_ABYSS) / 50) - 1 });
      process.stderr.write('.');
    }
    process.stderr.write('\nCenários');
    const rows = [];
    for (const ck of checkpoints) {
      ck.level = Math.floor(await ev(`window.__B.levelFromXp(${ck.xp})`));
      const r = await ev(`window.__B.run(${JSON.stringify(ck)})`);
      rows.push(r);
      process.stderr.write('.');
    }
    process.stderr.write('\n');
    if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
    report(rows);
  } finally {
    kill();
  }
}

function table(head, body) {
  const w = head.map((h, i) => Math.max(h.length, ...body.map((r) => String(r[i]).length)));
  const line = (r) => '| ' + r.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
  console.log(line(head));
  console.log('|' + w.map((n) => '-'.repeat(n + 2)).join('|') + '|');
  for (const r of body) console.log(line(r));
  console.log();
}

function report(rows) {
  console.log(`\n## Classe: ${CLS}  (equipamento completo do nível que cai ali, ferreiro no máximo, gemas do nível que cai, árvore e implantes)\n`);
  table(['Ponto', 'Nv', 'iLvl', 'Gema', 'Vida', 'Golpe', 'DPS', 'Golpes p/ matar comum', 's p/ elite', 's p/ chefe', 'Golpes p/ morrer (comum/elite/chefe)'],
    rows.map((r) => {
      const f = r.full;
      return [r.sc.label, r.sc.level, f.ilvl, f.gemT + 1, short(f.hp), short(f.hitN), short(f.dps), f.hitsN.toFixed(2), f.secE.toFixed(2), f.secB.toFixed(1), `${short(f.dieN)} / ${short(f.dieE)} / ${short(f.dieB)}`];
    }));
  console.log('Golpe/DPS = só o ataque básico (os poderes multiplicam isso pelo nível do poder, coluna "Poder" abaixo).');
  console.log('"Golpes p/ morrer" = vida ÷ dano de um golpe do inimigo depois de blindagem, redução e esquiva (sem cura, sem bloqueios).\n');

  console.log('## Peso de cada sistema no dano (quanto o DPS cai sem ele)\n');
  table(['Ponto', 'Itens (vs pelado)', 'Ferreiro máx', 'Gemas', 'Árvore', 'Implantes', 'Poder (nível médio)', 'Ferreiro: abates p/ pagar'],
    rows.map((r) => {
      const f = r.full;
      return [r.sc.label, x(f.dps / r.naked.dps * (r.noTree.dps / f.dps) * (r.noImpl.dps / f.dps)), x(f.dps / r.noForge.dps), x(f.dps / r.noGems.dps), x(f.dps / r.noTree.dps), x(f.dps / r.noImpl.dps), `${x(f.skillMult)} (${f.tree ? f.tree.avgRank.toFixed(0) : 0})`, short(f.forgeKills)];
    }));
  console.log('Itens (vs pelado) = DPS com itens+ferreiro+gemas ÷ DPS sem nada, tirando árvore e implantes da conta.\n');

  console.log('## Raridade (DPS relativo ao Comum, mesmo nível de item)\n');
  table(['Ponto', 'Comum', 'Modif.', 'Raro', 'Protót.', 'Mítico', 'Divino', 'Primord.'],
    rows.map((r) => [r.sc.label, ...r.rarity.map((v) => x(v / r.rarity[0]))]));

  console.log('## Defesa\n');
  table(['Ponto', 'Vida', 'Blindagem', 'Dano que passa', 'Esquiva', 'Golpe comum', 'Golpe elite', 'Golpe chefe'],
    rows.map((r) => {
      const f = r.full;
      return [r.sc.label, short(f.hp), short(f.armor), (f.taken * 100).toFixed(0) + '%', f.dodge.toFixed(0) + '%', short(f.nDmg * f.taken), short(f.eDmg * f.taken), short(f.bDmg * f.taken)];
    }));
}

main().catch((e) => { console.error(e); process.exit(1); });
