// Sincronização na nuvem: login com Google e o progresso (os personagens de cada classe)
// num arquivo escondido no Google Drive da própria pessoa (appDataFolder, escopo
// drive.appdata). Não há servidor. O localStorage continua sendo a fonte do jogo;
// a nuvem só é mesclada nele e recebe o resultado.
// Conflito entre aparelhos nunca perde progresso: por classe fica o personagem mais
// avançado, e em cada espaço de equipamento fica o melhor item entre os dois.
// Login: OAuth do Google por redirecionamento (#access_token=... na volta). O token vale
// ~1h; vencido, a próxima abertura do jogo renova sozinha com prompt=none.
// Só o Client ID vai aqui — o client secret nunca entra no site.
import { G } from './state.js';
import { SLOTS, itemScore } from './items.js';
import { L } from './i18n.js';
import { INV_SIZE } from './loot.js';
import { ensureAch, mergeStats, mergeAch } from './ach.js';

const GOOGLE_CLIENT_ID = '737867009905-hc0ilsd0gdedsen98tfmg0qakpnqn0ah.apps.googleusercontent.com';
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
const FILE = 'neon-dungeon.json';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3/files';
// precisa bater com o "URI de redirecionamento" do cliente OAuth (https://dliedke.github.io/neon-dungeon)
const REDIRECT = location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
const K_SYNC = 'neon-dungeon:sync';
const K_OAUTH = 'neon-dungeon:oauth';
const K_TRIED = 'neon-dungeon:silentTried';

export const sync = { user: null, token: null, exp: 0, timer: null, busy: null, again: false, status: 'off', last: 0 };
let hooks = { save: () => {}, applied: () => {}, render: () => {}, say: () => {} };
export function setSyncHooks(h) {
  hooks = { ...hooks, ...h };
}

// JSON com as chaves em ordem, para comparar sem falso "mudou"
function canon(v) {
  return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((c) => [c, x[c]])) : x));
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- mescla ----------
const progressOf = (c) => [c.level || 0, c.maxFloor || c.floor || 0, c.kills || 0, c.xp || 0];
function better(a, b) {
  const pa = progressOf(a);
  const pb = progressOf(b);
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? a : b;
  return b; // empate fica com a nuvem, senão dois aparelhos ficariam se desmentindo
}

function mergeChar(a, b) {
  if (!a) return b;
  if (!b) return a;
  // "Novo" (recomeçar do zero) depois que o outro personagem foi criado: o recomeço vale
  if (a.created !== b.created) {
    if (a.resetAt && a.resetAt > (b.created || 0)) return a;
    if (b.resetAt && b.resetAt > (a.created || 0)) return b;
  }
  const best = better(a, b);
  const win = clone(best);
  const other = best === a ? b : a;
  // em cada espaço, o melhor item equipado entre os dois aparelhos
  for (const slot of SLOTS) {
    const mine = win.equip && win.equip[slot];
    const theirs = other.equip && other.equip[slot];
    if (!theirs || (mine && itemScore(theirs) <= itemScore(mine))) continue;
    if (mine && mine.uid === theirs.uid) continue;
    win.equip = win.equip || {};
    win.equip[slot] = clone(theirs);
    win.inv = (win.inv || []).filter((it) => it.uid !== theirs.uid);
    if (mine && win.inv.length < INV_SIZE) win.inv.push(mine);
  }
  win.skillPoints = Math.max(win.skillPoints || 0, 0);
  win.wins = Math.max(a.wins || 0, b.wins || 0); // vitórias na batalha final nunca se perdem
  return win;
}

// local (a) + nuvem (b)
export function mergeProgress(a, b) {
  if (!b || !b.slots) return a;
  const slots = {};
  for (const cls of new Set([...Object.keys(a.slots || {}), ...Object.keys(b.slots || {})])) {
    slots[cls] = mergeChar(a.slots[cls], b.slots[cls]);
  }
  return { v: 1, slots, stats: mergeStats(a.stats, b.stats), ach: mergeAch(a.ach, b.ach) };
}

function snapshot() {
  ensureAch(G.save);
  return { v: 1, slots: G.save.slots, stats: G.save.stats, ach: G.save.ach };
}

// a nuvem recebe sempre a mescla completa; aqui só não se troca o personagem em jogo
// (ele é aplicado quando a pessoa volta ao menu)
function syncMerge(cloud) {
  const local = snapshot();
  const keep = G.char && G.mode !== 'menu' ? G.char.cls : null;
  const merged = mergeProgress(clone(local), cloud);
  let changed = false;
  for (const cls in merged.slots) {
    if (cls === keep || canon(merged.slots[cls]) === canon(local.slots[cls])) continue;
    G.save.slots[cls] = merged.slots[cls];
    changed = true;
  }
  // medalhas e contadores
  if (canon(merged.stats) !== canon(local.stats) || canon(merged.ach) !== canon(local.ach)) {
    G.save.stats = merged.stats;
    G.save.ach = merged.ach;
    changed = true;
  }
  if (changed) {
    hooks.save(true);
    hooks.applied();
  }
  return { merged, behind: !cloud || canon(merged) !== canon(cloud) };
}

// ---------- login ----------
export function syncAuthRedirect(silent) {
  const nonce = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  try {
    sessionStorage.setItem(K_OAUTH, JSON.stringify({ nonce, silent }));
  } catch (e) {}
  const p = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT, response_type: 'token', scope: SCOPE, state: nonce, include_granted_scopes: 'true' });
  if (sync.user && sync.user.email) p.set('login_hint', sync.user.email);
  if (silent) p.set('prompt', 'none');
  else if (!sync.user) p.set('prompt', 'select_account');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}

// volta do Google: lê e limpa o #access_token=... (ou #error=...) da URL
export function syncReadRedirect() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has('state')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let req = null;
  try {
    req = JSON.parse(sessionStorage.getItem(K_OAUTH));
    sessionStorage.removeItem(K_OAUTH);
  } catch (e) {}
  if (!req || p.get('state') !== req.nonce) return null; // não fomos nós que pedimos
  if (!p.get('access_token')) return { error: p.get('error') || 'erro', silent: req.silent };
  return { token: p.get('access_token'), exp: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000 - 60000 };
}

function saved() {
  try {
    return JSON.parse(localStorage.getItem(K_SYNC));
  } catch (e) {
    return null;
  }
}
function saveLocal() {
  try {
    localStorage.setItem(K_SYNC, JSON.stringify({ user: sync.user, token: sync.token, exp: sync.exp }));
  } catch (e) {}
}

// login salvo mas vencido: renova sem tela antes de montar o jogo (uma tentativa por aba)
export function syncShouldRefresh(back) {
  const s = saved();
  if (back || !s || !s.user || Date.now() < (s.exp || 0) || !navigator.onLine) return false;
  try {
    if (sessionStorage.getItem(K_TRIED)) return false;
    sessionStorage.setItem(K_TRIED, '1');
  } catch (e) {
    return false;
  }
  sync.user = s.user;
  return true;
}

export async function syncStart(back) {
  const s = saved();
  if (s && s.user) {
    sync.user = s.user;
    sync.token = s.token;
    sync.exp = s.exp || 0;
  }
  if (back && back.token) {
    sync.token = back.token;
    sync.exp = back.exp;
    try {
      sessionStorage.removeItem(K_TRIED);
    } catch (e) {}
    try {
      const u = await (await gfetch('https://openidconnect.googleapis.com/v1/userinfo')).json();
      sync.user = { name: u.name, email: u.email, picture: u.picture };
    } catch (e) {
      sync.user = sync.user || { name: 'Google' };
    }
    saveLocal();
    if (!s || !s.user) hooks.say(L('☁️ Conectado! Seu progresso agora vai junto para todo aparelho.', '☁️ Connected! Your progress now follows you to every device.'));
  } else if (back && back.error && !back.silent) {
    hooks.say(L('Login cancelado — o progresso continua salvo neste aparelho.', 'Sign-in cancelled — progress is still saved on this device.'));
  }
  if (!sync.user) return setStatus('off');
  syncNow();
}

const tokenOk = () => !!sync.token && Date.now() < sync.exp;

// ---------- Google Drive (pasta escondida do app) ----------
async function gfetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${sync.token}`, ...(opts.headers || {}) } });
  if (r.status === 401) {
    sync.exp = 0;
    saveLocal();
    throw new Error('expirou');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

// puxa da nuvem, mescla no local e grava o resultado se a nuvem estiver atrás
export function syncNow() {
  clearTimeout(sync.timer);
  sync.timer = null;
  if (!sync.user) return;
  if (!tokenOk()) return setStatus('expired');
  if (sync.busy) {
    sync.again = true;
    return;
  }
  sync.busy = (async () => {
    setStatus('syncing');
    try {
      const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
      const { files = [] } = await (await gfetch(`${DRIVE}?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id)`)).json();
      let cloud = null;
      for (const f of files) {
        const data = await (await gfetch(`${DRIVE}/${f.id}?alt=media`)).json().catch(() => null);
        if (data && typeof data === 'object') cloud = cloud ? mergeProgress(data, cloud) : data;
      }
      const { merged, behind } = syncMerge(cloud);
      const body = JSON.stringify(merged);
      if (!files.length) {
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: FILE, parents: ['appDataFolder'] })], { type: 'application/json' }));
        form.append('file', new Blob([body], { type: 'application/json' }));
        await gfetch(`${DRIVE_UP}?uploadType=multipart&fields=id`, { method: 'POST', body: form });
      } else {
        if (behind || files.length > 1) await gfetch(`${DRIVE_UP}/${files[0].id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
        for (const f of files.slice(1)) await gfetch(`${DRIVE}/${f.id}`, { method: 'DELETE' });
      }
      sync.last = Date.now();
      setStatus('ok');
    } catch (e) {
      setStatus(tokenOk() ? 'error' : 'expired');
    }
    sync.busy = null;
    if (sync.again) {
      sync.again = false;
      syncNow();
    }
  })();
}

// o jogo salvou: envia logo depois (junta várias gravações seguidas)
export function syncDirty(delay = 4000) {
  if (!sync.user) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(syncNow, delay);
}

function setStatus(st) {
  sync.status = st;
  hooks.render();
}

export function syncSignOut() {
  if (sync.timer && tokenOk()) syncNow();
  const token = sync.token;
  Promise.resolve(sync.busy).finally(() => {
    if (token) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  });
  Object.assign(sync, { user: null, token: null, exp: 0 });
  clearTimeout(sync.timer);
  sync.timer = null;
  try {
    localStorage.removeItem(K_SYNC);
  } catch (e) {}
  setStatus('off');
  hooks.say(L('Você saiu. O progresso continua salvo neste aparelho.', 'Signed out. Progress is still saved on this device.'));
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export function syncBoxHtml() {
  const u = sync.user;
  const status = {
    syncing: L('🔄 Sincronizando…', '🔄 Syncing…'),
    ok: L('✅ Progresso sincronizado', '✅ Progress synced'),
    error: L('⚠️ Sem conexão — sincroniza quando voltar', '⚠️ Offline — will sync when back'),
    expired: L('⏳ O login expirou — toque em Reconectar', '⏳ Sign-in expired — tap Reconnect'),
  }[sync.status] || '';
  if (!u) {
    return `<p>${L('☁️ Entre com o Google para levar seus personagens (maior nível e melhor equipamento) para qualquer aparelho. Fica numa pasta escondida do seu Google Drive.', '☁️ Sign in with Google to take your characters (highest level and best gear) to any device. Stored in a hidden folder in your Google Drive.')}</p>
      <button class="btn" data-nav data-sync="in">${L('Entrar com Google', 'Sign in with Google')}</button>`;
  }
  return `<div class="who">
      ${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : '<span class="ico">👤</span>'}
      <span><b>${esc(u.name || u.email || 'Google')}</b><small>${status}</small></span>
    </div>
    <div class="sync-btns">
      ${sync.status === 'expired' ? `<button class="btn small" data-nav data-sync="in">${L('Reconectar', 'Reconnect')}</button>` : `<button class="btn small" data-nav data-sync="now">${L('Sincronizar agora', 'Sync now')}</button>`}
      <button class="btn small ghost" data-nav data-sync="out">${L('Sair', 'Sign out')}</button>
    </div>`;
}
