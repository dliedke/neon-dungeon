// Backups dos personagens: cópias de segurança de cada classe, guardadas no aparelho
// (localStorage, chave própria, separada do save) e na nuvem (arquivo próprio no Drive, ver sync.js).
// Por classe ficam até:
//  - 2 automáticas ('auto'): uma nova a cada 10 min jogando; ficam a recente e a anterior;
//  - 2 "antes do recomeço" ('reset'): o personagem apagado pelo "Novo" ou trocado por um
//    recomeço feito em outro aparelho (from: 'sync'); ficam a mais nova e a mais avançada;
//  - 1 "antes de restaurar" ('undo'): quem estava no lugar quando um backup foi restaurado.
// Restaurar nunca apaga nada: o personagem atual vira um backup 'undo'.
import { G } from './state.js';
import { syncDirty } from './sync.js';

const KEY = 'neon-dungeon-backup-v1';
export const AUTO_EVERY = 10 * 60000;

// estado: { v, chars: { cls: [ { kind, at, from?, char } ] } }; `rev` muda a cada alteração (a nuvem usa)
export const BK = { data: { v: 1, chars: {} }, rev: 0 };

const clone = (x) => JSON.parse(JSON.stringify(x));

// o modo (Pesadelo/Inferno) vem primeiro: quem já desceu de novo está mais adiantado, mesmo num andar menor
export const progressOf = (c) => [c.tier || 0, c.level || 0, c.maxFloor || c.floor || 0, c.kills || 0, c.xp || 0];
function cmpProgress(a, b) {
  const pa = progressOf(a);
  const pb = progressOf(b);
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
// personagem recém-criado não vale backup
export const worthKeeping = (c) => !!c && ((c.level | 0) > 1 || (c.maxFloor | 0) > 1 || (c.floor | 0) > 1 || (c.tier | 0) > 0);
const entryId = (e) => `${e.kind}:${e.at}:${(e.char && e.char.created) || 0}`;
const valid = (e) => e && typeof e === 'object' && ['auto', 'reset', 'undo'].includes(e.kind) && e.char && typeof e.char === 'object' && e.char.cls && Number.isFinite(e.at);

// aplica os limites de cada tipo (lista já sem repetidos)
function prune(list) {
  const seen = new Set();
  list = list.filter((e) => valid(e) && !seen.has(entryId(e)) && seen.add(entryId(e)));
  const newest = (k) => list.filter((e) => e.kind === k).sort((a, b) => b.at - a.at);
  const auto = newest('auto').slice(0, 2);
  const undo = newest('undo').slice(0, 1);
  const resets = newest('reset');
  const reset = resets.slice(0, 1);
  if (resets.length > 1) {
    // além da mais nova, fica a mais avançada (recomeçar duas vezes seguidas não perde o personagem bom)
    const best = resets.slice(1).reduce((m, e) => (cmpProgress(e.char, m.char) > 0 ? e : m));
    if (cmpProgress(best.char, reset[0].char) > 0) reset.push(best);
    else reset.push(resets[1]);
  }
  return [...auto, ...reset, ...undo].sort((a, b) => b.at - a.at);
}

export function loadBackups() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (_) {}
  if (!d || typeof d !== 'object' || !d.chars || typeof d.chars !== 'object') d = { v: 1, chars: {} };
  for (const cls of Object.keys(d.chars)) {
    d.chars[cls] = Array.isArray(d.chars[cls]) ? prune(d.chars[cls]) : [];
    if (!d.chars[cls].length) delete d.chars[cls];
  }
  BK.data = d;
  // primeira vez (ou personagem sem cópia nenhuma): já guarda uma de cada personagem que tem progresso
  let added = false;
  for (const [cls, c] of Object.entries((G.save && G.save.slots) || {})) {
    if (worthKeeping(c) && !(d.chars[cls] || []).some((e) => e.kind === 'auto')) {
      push(cls, { kind: 'auto', at: Date.now(), char: clone(c) });
      added = true;
    }
  }
  if (added) changed();
}

function store() {
  const write = () => localStorage.setItem(KEY, JSON.stringify(BK.data));
  try {
    write();
  } catch (_) {
    // sem espaço: larga primeiro os "antes de restaurar" e depois a automática mais antiga de cada um
    try {
      for (const cls in BK.data.chars) BK.data.chars[cls] = BK.data.chars[cls].filter((e) => e.kind !== 'undo');
      write();
    } catch (__) {
      try {
        for (const cls in BK.data.chars) {
          const autos = BK.data.chars[cls].filter((e) => e.kind === 'auto').sort((a, b) => b.at - a.at);
          if (autos.length > 1) BK.data.chars[cls] = BK.data.chars[cls].filter((e) => e !== autos[autos.length - 1]);
        }
        write();
      } catch (___) {}
    }
  }
}

function push(cls, e) {
  const list = BK.data.chars[cls] || [];
  list.push(e);
  BK.data.chars[cls] = prune(list);
}

function changed() {
  BK.rev++;
  store();
  syncDirty(G.mode === 'play' ? 180000 : 4000);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// guarda uma cópia agora (kind: 'reset' | 'undo' | 'auto'); from: 'sync' quando veio de outro aparelho
export function addBackup(kind, c, from) {
  if (!worthKeeping(c)) return false;
  const list = BK.data.chars[c.cls] || [];
  // a mesma cópia já guardada (ex.: recomeçar logo depois de restaurar) não repete
  if (list.some((e) => e.kind === kind && same(e.char, c))) return false;
  const e = { kind, at: Date.now(), char: clone(c) };
  if (from) e.from = from;
  push(c.cls, e);
  changed();
  return true;
}

// chamado a cada gravação: a cada 10 min (se o personagem mudou) entra uma automática nova
export function backupTick(c) {
  if (!worthKeeping(c)) return;
  const autos = (BK.data.chars[c.cls] || []).filter((e) => e.kind === 'auto');
  const last = autos.reduce((m, e) => (!m || e.at > m.at ? e : m), null);
  if (last && Date.now() - last.at < AUTO_EVERY) return;
  if (last && same(last.char, c)) return;
  addBackup('auto', c);
}

export function backupsOf(cls) {
  return (BK.data.chars[cls] || []).slice().sort((a, b) => b.at - a.at);
}
export function hasBackups() {
  return Object.values(BK.data.chars).some((l) => l && l.length);
}

// troca o personagem da classe pelo backup; quem estava no lugar vira um backup 'undo'
export function restoreBackup(cls, id) {
  const e = (BK.data.chars[cls] || []).find((x) => entryId(x) === id);
  if (!e) return null;
  const cur = G.save.slots[cls];
  if (cur && !same(cur, e.char)) addBackup('undo', cur);
  const c = clone(e.char);
  // identidade nova + resetAt: na mescla da nuvem ele vence a versão que estava lá (como um "Novo")
  c.created = Date.now();
  c.resetAt = c.created;
  G.save.slots[cls] = c;
  if (G.char && G.char.cls === cls) G.char = c;
  return c;
}
export const backupId = entryId;

// ---------- nuvem ----------
export function mergeBackups(a, b) {
  const out = { v: 1, chars: {} };
  for (const src of [a, b]) {
    if (!src || !src.chars) continue;
    for (const [cls, list] of Object.entries(src.chars)) if (Array.isArray(list)) out.chars[cls] = (out.chars[cls] || []).concat(list);
  }
  for (const cls of Object.keys(out.chars)) {
    out.chars[cls] = prune(out.chars[cls]);
    if (!out.chars[cls].length) delete out.chars[cls];
  }
  return out;
}

// resultado da mescla com a nuvem: troca o local se mudou (não reenvia)
export function applyMergedBackups(m) {
  if (same(m, BK.data)) return false;
  BK.data = m;
  BK.rev++;
  store();
  return true;
}
