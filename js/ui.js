// Interface: HUD, menus, inventário, minimapa e navegação por controle.
import { G } from './state.js';
import * as THREE from 'three';
import { Input, bindTouchButton } from './input.js';
import { CLASSES, CLASS_ORDER, iconSvg, rankMult } from './classes.js';
import { SLOTS, SLOT_NAMES, RARITY, MYTHIC, LEGENDARIES, MYTHICS, DIVINES, DIV_SET, itemCardHtml, itemDiffHtml, sortInventory, itemScore, recycleValue, slotIconSvg } from './items.js';
import { xpNeeded, SP_PER_LEVEL, refreshStats, skillCost, skillCd, stimPrice, MAX_STIMS, respawn, MAX_LEVEL, spendPoint, assignSlot } from './player.js';
import { INV_SIZE, SHRINES } from './loot.js';
import { DIFFICULTY, DIFF_ORDER, setDifficulty, rewardK, rewardRamping } from './enemies.js';
import { sfx, applyVolumes, initAudio, trackNames, applyTrack } from './audio.js';
import { startGame, quitToMenu, saveGame, saveSettings, applyQuality, replayFinal, startTier } from './main.js';
import { fmt, fmtPlay } from './utils.js';
import { L, t } from './i18n.js';
import { glyph, glyphText, padText, padName } from './padglyphs.js';
import { refreshShopStock } from './biomes.js';
import { itemName, isUpgrade, unforged, AFFIXES, forgeItem, forgeCost, forgeMax, isMilestone } from './items.js';
import { sync, syncAuthRedirect, syncNow, syncSignOut, syncBoxHtml } from './sync.js';
import { achAdd, achList, achProgress, playTotal, TIERS as MEDAL_TIERS } from './ach.js';
import { runHud, implantSummary, tierOf, TIERS as MODES, MAX_TIER, armorTaken } from './run.js';
import { mythHud } from './mythic.js';
import { burst } from './fx.js';

const $ = (id) => document.getElementById(id);
let selected = null; // { where: 'inv'|'equip', uid, slot }
let focused = null;
let lastPanel = null;

// ------------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------------
export function initUI() {
  $('minimap-wrap').addEventListener('click', () => {
    if (G.mode === 'play') toggleBigMap();
  });
  $('btn-char').onclick = () => toggleChar();
  $('btn-pause').onclick = () => openPause();
  $('char-close').onclick = () => closeChar();
  document.querySelectorAll('.tab-btn').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $('btn-buy-stim').onclick = buyStim;
  $('btn-recycle-all').onclick = recycleAll;

  $('pause-resume').onclick = () => closePause();
  $('pause-char').onclick = () => {
    closePause();
    openChar();
  };
  $('pause-opts').onclick = () => openOverlay('panel-opts');
  $('pause-help').onclick = () => openOverlay('panel-help');
  $('pause-quit').onclick = () => {
    closePause();
    quitToMenu();
  };
  $('menu-opts').onclick = () => openOverlay('panel-opts');
  $('menu-help').onclick = () => openOverlay('panel-help');
  $('menu-sync').onclick = () => openSync();
  $('menu-ach').onclick = () => openAch();
  $('pause-ach').onclick = () => openAch();
  $('ach-close').onclick = () => {
    closeMedal();
    closeOverlay('panel-ach');
  };
  $('ach-grid').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ach]');
    if (!el) return;
    if (medalOpen()) closeMedal();
    else openMedal(el.dataset.ach);
  });
  $('ach-zoom').addEventListener('click', closeMedal);
  $('pause-sync').onclick = () => openSync();
  $('sync-close').onclick = () => closeOverlay('panel-sync');
  $('sync-box').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sync]');
    if (!b) return;
    const act = b.dataset.sync;
    if (act === 'in') {
      saveGame();
      syncAuthRedirect(false);
    } else if (act === 'now') syncNow();
    else if (act === 'out') syncSignOut();
  });
  $('opts-close').onclick = () => closeOverlay('panel-opts');
  $('help-close').onclick = () => closeOverlay('panel-help');
  $('dead-retry').onclick = () => {
    $('panel-dead').classList.add('hidden');
    respawn();
    G.mode = 'play';
  };
  $('dead-menu').onclick = () => {
    $('panel-dead').classList.add('hidden');
    respawn();
    quitToMenu();
  };
  $('confirm-no').onclick = () => closeOverlay('panel-confirm');
  $('end-menu').onclick = () => {
    $('panel-end').classList.add('hidden');
    quitToMenu();
  };
  $('end-replay').onclick = () => {
    $('panel-end').classList.add('hidden');
    replayFinal();
  };
  $('end-tier').onclick = () => {
    $('panel-end').classList.add('hidden');
    startTier(Math.min(MAX_TIER, (G.char.tier | 0) + 1));
  };
  $('shop-close').onclick = () => closeShop();
  $('forge-close').onclick = () => closeForge();
  $('stash-close').onclick = () => closeStash();
  $('stash-put-myth').onclick = () => stashPutMythics();
  $('stash-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stab]');
    if (b) stashSetTab(+b.dataset.stab);
  });
  for (const id of ['stash-grid', 'stash-inv']) {
    $(id).addEventListener('click', (e) => {
      const cell = e.target.closest('.cell[data-uid]');
      if (cell) stashSelect(cell);
    });
    $(id).addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.cell[data-uid]');
      if (cell) stashMove(cell.dataset.swhere, cell.dataset.uid);
    });
  }

  // opções
  const s = G.settings;
  $('opt-music').value = s.music;
  $('opt-sfx').value = s.sfx;
  $('opt-music').oninput = (e) => {
    s.music = +e.target.value;
    applyVolumes();
    saveSettings();
  };
  // trilha: aleatória ou uma música fixa (troca no próximo compasso)
  const updT = () => {
    const names = trackNames();
    $('opt-track').textContent = Number.isInteger(s.track) && names[s.track] ? '♪ ' + names[s.track] : L('Aleatória', 'Shuffle');
  };
  updT();
  $('opt-track').onclick = () => {
    const n = trackNames().length;
    s.track = !Number.isInteger(s.track) ? 0 : s.track + 1 >= n ? 'shuffle' : s.track + 1;
    updT();
    applyTrack();
    saveSettings();
  };
  $('opt-sfx').oninput = (e) => {
    s.sfx = +e.target.value;
    applyVolumes();
    saveSettings();
    sfx.click();
  };
  const qNames = { auto: L('Automático', 'Auto'), high: L('Alta', 'High'), low: L('Baixa', 'Low') };
  const updQ = () => ($('opt-quality').textContent = qNames[s.quality]);
  updQ();
  $('opt-quality').onclick = () => {
    s.quality = s.quality === 'auto' ? 'high' : s.quality === 'high' ? 'low' : 'auto';
    updQ();
    applyQuality();
    saveSettings();
  };
  const glowOrder = ['strong', 'medium', 'low', 'off'];
  const glowNames = { strong: L('Forte', 'Strong'), medium: L('Médio', 'Medium'), low: L('Fraco', 'Low'), off: L('Desligado', 'Off') };
  const updG = () => ($('opt-glow').textContent = glowNames[s.glow] || glowNames.medium);
  updG();
  $('opt-glow').onclick = () => {
    s.glow = glowOrder[(glowOrder.indexOf(s.glow) + 1) % glowOrder.length];
    updG();
    applyQuality();
    saveSettings();
  };
  updDiffUi();
  $('opt-diff').onclick = () => {
    const i = DIFF_ORDER.indexOf(s.difficulty);
    applyDiff(DIFF_ORDER[(i + 1) % DIFF_ORDER.length]);
  };
  // controle deslizante de dificuldade no HUD (muda a qualquer hora)
  const dr = $('diff-range');
  dr.max = String(DIFF_ORDER.length - 1);
  dr.addEventListener('input', () => applyDiff(DIFF_ORDER[+dr.value]));
  // solta o foco para as setas/espaço voltarem a controlar o personagem
  dr.addEventListener('change', () => dr.blur());
  dr.addEventListener('pointerup', () => dr.blur());
  const updS = () => ($('opt-shake').textContent = s.shake ? L('Ligado', 'On') : L('Desligado', 'Off'));
  updS();
  $('opt-shake').onclick = () => {
    s.shake = !s.shake;
    updS();
    saveSettings();
  };
  $('opt-full').onclick = () => {
    const on = document.fullscreenElement || document.webkitFullscreenElement;
    mobileFullOptOut = !!on;
    if (!on) (G.isTouch ? enterMobileFullscreen() : enterDesktopFullscreen(true));
    else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  };

  // botões de toque
  bindTouchButton($('tb-primary'), 'primary');
  bindTouchButton($('tb-s1'), 's1');
  bindTouchButton($('tb-s2'), 's2');
  bindTouchButton($('tb-s3'), 's3');
  bindTouchButton($('tb-s4'), 's4');
  bindTouchButton($('tb-s5'), 's5');
  bindTouchButton($('tb-s6'), 's6');
  bindTouchButton($('tb-stim'), 'stim');
  bindTouchButton($('interact'), 'interact');
  $('tb-stim').querySelector('.icon').innerHTML = iconSvg('stim');
  $('skstim').querySelector('.icon').innerHTML = iconSvg('stim');

  // cliques nos itens (delegação)
  $('panel-char').addEventListener('click', onCharClick);
  $('panel-char').addEventListener('dblclick', onCharDblClick);
  $('panel-char').addEventListener('mouseover', (e) => {
    const c = e.target.closest('.cell[data-uid]');
    if (c && G.lastInput === 'kb') selectCell(c, false);
  });

  refreshPadLabels();
  window.addEventListener('padtypechange', () => {
    refreshPadLabels();
    if (G.mode === 'char') renderChar();
  });

  // qualquer clique em botão toca um som
  document.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
      initAudio();
      sfx.click();
    }
  });
}

// ------------------------------------------------------------------
// Menu principal
// ------------------------------------------------------------------
export function showMenu() {
  $('thief-ptr').classList.add('hidden');
  toggleBigMap(false);
  G.mode = 'menu';
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderClassCards();
  clearFocus();
}

export function renderClassCards() {
  const root = $('class-cards');
  root.innerHTML = '';
  for (const id of CLASS_ORDER) {
    const C = CLASSES[id];
    const save = G.save.slots[id];
    const card = document.createElement('div');
    card.className = 'ccard';
    card.style.setProperty('--c', C.css);
    card.innerHTML = `
      <div class="cname">${C.name.toUpperCase()}</div>
      <div class="ctitle">${C.title}</div>
      <div class="cdesc">${C.desc}</div>
      <div class="cskills">${C.skills.filter((s) => !s.passive).map((s) => `<div title="${s.name}">${iconSvg(s.icon)}</div>`).join('')}</div>
      <div class="csave">${save ? L(`Nível <b>${save.level}</b> · Andar <b>${save.floor}</b> · ${save.kills || 0} abates`, `Level <b>${save.level}</b> · Floor <b>${save.floor}</b> · ${save.kills || 0} kills`) + (save ? ` · <span class="nowrap" title="${L('Tempo de jogo', 'Play time')}">⏱ ${fmtPlay(save.playTime)}</span>` : '') + (save.wins ? ` · <span title="${L('Venceu o jogo', 'Beat the game')}">🏆${save.wins > 1 ? '×' + save.wins : ''}</span>` : '') + (save.tier ? ` · <span class="nowrap" style="color:${MODES[Math.min(MAX_TIER, save.tier)].css}">${MODES[Math.min(MAX_TIER, save.tier)].icon} ${MODES[Math.min(MAX_TIER, save.tier)].name}</span>` : '') : L('Novo personagem', 'New character')}</div>
      <div class="cbtns">
        <button class="btn" data-nav data-play="${id}">${save ? L('Continuar', 'Continue') : L('Jogar', 'Play')}</button>
        ${save ? `<button class="btn ghost" data-nav data-new="${id}" title="${L('Recomeçar do zero', 'Start over')}">${L('Novo', 'New')}</button>` : ''}
      </div>`;
    root.appendChild(card);
  }
  root.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => {
    initAudio();
    enterMobileFullscreen();
    $('menu').classList.add('hidden');
    startGame(b.dataset.play, false);
  }));
  root.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.new;
    enterMobileFullscreen();
    confirmDialog(L('Recomeçar?', 'Start over?'), L(`O progresso de ${CLASSES[id].name} será apagado.`, `${CLASSES[id].name}'s progress will be erased.`), () => {
      $('menu').classList.add('hidden');
      startGame(id, true);
    });
  }));
}

export function confirmDialog(title, text, onYes) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-yes').onclick = () => {
    closeOverlay('panel-confirm');
    onYes();
  };
  openOverlay('panel-confirm');
}

// ------------------------------------------------------------------
// Medalhas
// ------------------------------------------------------------------
function openAch() {
  const list = achList();
  const got = list.filter((a) => G.save.ach[a.id]).length;
  $('ach-title').textContent = `${L('MEDALHAS', 'MEDALS')} ${got}/${list.length}`;
  const perTier = MEDAL_TIERS.map((t, i) => {
    const all = list.filter((a) => a.tier === i);
    return `<span style="color:${t.css}">● ${t.name} ${all.filter((a) => G.save.ach[a.id]).length}/${all.length}</span>`;
  });
  $('ach-sum').innerHTML = `<div class="ach-bar"><div style="width:${(got / list.length) * 100}%"></div></div><div class="ach-tiers">${perTier.join('')}<span class="ach-play">⏱ ${L('Tempo total de jogo', 'Total play time')} <b>${fmtPlay(playTotal())}</b></span></div>`;
  // conquistadas primeiro (mais recentes no topo), depois as mais perto de sair
  const rows = list.map((a) => ({ a, ...achProgress(a) }));
  rows.sort((x, y) => (y.done - x.done) || (x.done ? G.save.ach[y.a.id] - G.save.ach[x.a.id] : y.cur / y.goal - x.cur / x.goal));
  $('ach-grid').innerHTML = rows.map(({ a, cur, goal, done }) => {
    const t = MEDAL_TIERS[a.tier];
    const bar = !done && goal > 1 ? `<div class="ach-prog"><div style="width:${(cur / goal) * 100}%"></div><span>${(a.show || fmt)(cur)}/${(a.show || fmt)(goal)}</span></div>` : '';
    return `<div class="ach ${done ? 'done' : ''}" data-nav data-ach="${a.id}" tabindex="-1" style="--t:${t.css}">
      <div class="ach-ico">${a.icon}</div>
      <div class="ach-txt"><b>${a.name}</b><small>${a.desc}</small>${bar}</div>
      <div class="ach-tier">${done ? '✔' : ''} ${t.name}<br>+${fmt(t.reward)}¢</div>
    </div>`;
  }).join('');
  closeMedal();
  openOverlay('panel-ach');
}

// medalha redonda grande (ícone no centro, raios e fita com o nível)
function medalHtml(a, done) {
  const t = MEDAL_TIERS[a.tier];
  return `<div class="medal ${done ? '' : 'locked'}" style="--t:${t.css}"><div class="medal-rays"></div><div class="medal-disc"><span>${a.icon}</span></div><div class="medal-ribbon">${t.name}</div></div>`;
}

// clique numa medalha do painel: mostra ela grande
function openMedal(id) {
  const a = achList().find((x) => x.id === id);
  if (!a) return;
  const { cur, goal, done } = achProgress(a);
  const t = MEDAL_TIERS[a.tier];
  const when = done && G.save.ach[a.id] > 1 ? new Date(G.save.ach[a.id]).toLocaleDateString(L('pt-BR', 'en-US'), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const prog = !done && goal > 1 ? `<div class="ach-prog"><div style="width:${(cur / goal) * 100}%"></div><span>${(a.show || fmt)(cur)}/${(a.show || fmt)(goal)}</span></div>` : '';
  const z = $('ach-zoom');
  z.innerHTML = `<div class="medal-card ${done ? '' : 'locked'}" style="--t:${t.css}">
    ${medalHtml(a, done)}
    <h3>${a.name}</h3>
    <p>${a.desc}</p>
    <div class="mc-meta">${t.name} · +${fmt(t.reward)}¢</div>
    ${done ? `<div class="mc-when">✔ ${when ? L('Conquistada em ', 'Earned on ') + when : L('Conquistada', 'Earned')}</div>` : `<div class="mc-when">🔒 ${L('Ainda não conquistada', 'Not earned yet')}</div>` + prog}
    <div class="mc-close">${G.lastInput === 'pad' ? padText(L('{B} voltar', '{B} back')) : L('Clique para fechar', 'Click to close')}</div>
  </div>`;
  z.classList.remove('hidden');
  sfx.click();
}
function closeMedal() {
  $('ach-zoom').classList.add('hidden');
}
function medalOpen() {
  return !$('ach-zoom').classList.contains('hidden');
}

// aviso grande quando ganha uma medalha (um de cada vez)
const medalQueue = [];
let medalBusy = false;
export function medalPopup(a, reward) {
  medalQueue.push({ a, reward });
  if (!medalBusy) nextMedalPopup();
}
function nextMedalPopup() {
  const it = medalQueue.shift();
  if (!it) {
    medalBusy = false;
    return;
  }
  medalBusy = true;
  const t = MEDAL_TIERS[it.a.tier];
  const el = document.createElement('div');
  el.className = 'mpop';
  el.style.setProperty('--t', t.css);
  el.innerHTML = `${medalHtml(it.a, true)}<div class="mpop-txt"><small>${L('MEDALHA DESBLOQUEADA', 'MEDAL UNLOCKED')} · ${t.name}</small><b>${it.a.name}</b><span>${it.a.desc}${it.reward ? ` · <em>+${fmt(it.reward)}¢</em>` : ''}</span></div>`;
  $('medal-pop').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => {
    el.remove();
    nextMedalPopup();
  }, 4250);
}

function openSync() {
  renderSync();
  openOverlay('panel-sync');
}

// caixa de login/estado da nuvem + rótulo do botão do menu
export function renderSync() {
  const box = $('sync-box');
  const wasFocused = focused && box.contains(focused) ? focused.dataset.sync : null;
  box.innerHTML = syncBoxHtml();
  if (wasFocused) {
    const el = box.querySelector('[data-sync]');
    if (el) setFocus(el);
  }
  const ok = sync.user && sync.status === 'ok';
  $('menu-sync').textContent = sync.user ? (ok ? L('☁ Sincronizado', '☁ Synced') : '☁ ' + L('Nuvem', 'Cloud')) : L('☁ Salvar no Google', '☁ Save to Google');
}

function openOverlay(id) {
  $(id).classList.remove('hidden');
  clearFocus();
}
function closeOverlay(id) {
  $(id).classList.add('hidden');
  clearFocus();
}

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------
export function showHUD() {
  $('hud').classList.remove('hidden');
  const C = CLASSES[G.char.cls];
  document.documentElement.style.setProperty('--accent', C.css);
  refreshSkillBar();
}

// Índices das habilidades em cada botão: [ataque básico, 1, 2, 3, 4, 5, 6]
const barSkills = () => [0, ...G.char.slots];

export function refreshSkillBar() {
  const C = CLASSES[G.char.cls];
  barSkills().forEach((i, k) => {
    const sk = i == null ? null : C.skills[i];
    const icon = sk ? iconSvg(sk.icon) : '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"><rect x="9" y="14" width="14" height="11" rx="2"/><path d="M12 14v-3a4 4 0 0 1 8 0v3"/></svg>';
    $('sk' + k).querySelector('.icon').innerHTML = icon;
    $('sk' + k).classList.toggle('empty-slot', !sk);
    const tb = k === 0 ? $('tb-primary') : $('tb-s' + k);
    tb.querySelector('.icon').innerHTML = icon;
    tb.classList.toggle('empty-slot', !sk);
    if (k > 0) $('sk' + k).querySelector('.cost').textContent = sk ? skillCost(i) || '' : '';
  });
  refreshKeyLabels();
}

// Rótulos dos botões na barra de habilidades (teclado ou ícones do controle)
export function refreshKeyLabels() {
  const pad = G.lastInput === 'pad';
  const labels = pad ? [glyph('a'), glyph('x'), glyph('y'), glyph('b'), glyph('lb'), glyph('rb'), glyph('lt')] : ['LMB', '1', '2', '3', '4', '5', '6'];
  labels.forEach((l, k) => ($('sk' + k).querySelector('.key').innerHTML = l));
  $('skstim').querySelector('.key').innerHTML = pad ? glyph('ls') : 'F';
  mmHint();
}

// Selo de lupa no minimapa: mostra o botão que abre o mapa inteiro e pulsa até o jogador abrir uma vez
function mmHint() {
  const k = $('mm-key');
  if (!k) return;
  k.innerHTML = G.lastInput === 'pad' ? glyph('rs') : G.lastInput === 'touch' || G.isTouch ? '' : 'M';
  $('mm-hint').classList.toggle('fresh', !G.settings.mapSeen);
  $('minimap-wrap').title = L('Abrir o mapa inteiro', 'Open the full map');
}

// Textos com ícones de controle (dicas do inventário e tela de controles)
export function refreshPadLabels() {
  document.querySelectorAll('[data-pad-text]').forEach((el) => (el.innerHTML = padText(t(el.dataset.padText))));
  document.querySelectorAll('.pad-name').forEach((el) => (el.textContent = G.padType ? `(${padName()})` : ''));
  if (G.char) refreshKeyLabels();
}

const cache = {};
function setText(id, v) {
  if (cache[id] !== v) {
    cache[id] = v;
    $(id).textContent = v;
  }
}
function setScale(el, k) {
  const v = Math.max(0, Math.min(1, k)).toFixed(3);
  if (el._v !== v) {
    el._v = v;
    el.style.transform = `scaleX(${v})`;
  }
}

let mmTimer = 0;
// Ladrão de Dados fora da tela: seta dourada na borda apontando para ele
const thiefV = new THREE.Vector3();
function updateThiefPointer() {
  const el = $('thief-ptr');
  const e = G.mode === 'play' && G.camera ? G.enemies.find((x) => x.alive && x.type === 'thief') : null;
  let show = false;
  if (e) {
    thiefV.set(e.x, 1, e.z).project(G.camera);
    const W = innerWidth;
    const H = innerHeight;
    let sx = ((thiefV.x + 1) / 2) * W;
    let sy = ((1 - thiefV.y) / 2) * H;
    if (thiefV.z > 1) {
      sx = W - sx;
      sy = H - sy;
    }
    const m = 30;
    if (sx < m || sx > W - m || sy < m || sy > H - m || thiefV.z > 1) {
      // prende na borda, na direção do ladrão a partir do centro
      const cx = W / 2;
      const cy = H / 2;
      const dx = sx - cx;
      const dy = sy - cy;
      const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
      el.style.left = cx + dx * k + 'px';
      el.style.top = cy + dy * k + 'px';
      el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      show = true;
    }
  }
  el.classList.toggle('hidden', !show);
}

export function updateHUD(dt) {
  const p = G.player;
  const c = G.char;
  updateThiefPointer();
  if (!p) return;
  runHud();
  const s = p.stats;
  const im = G.lastInput + G.padType;
  if (cache.inputMode !== im) {
    cache.inputMode = im;
    refreshKeyLabels();
  }
  setScale($('hp-fill'), p.hp / s.maxHp);
  setScale($('hp-lag'), p.hp / s.maxHp);
  setScale($('hp-shield'), p.shield / s.maxHp);
  setScale($('en-fill'), p.en / s.maxEn);
  setScale($('xp-fill'), c.level >= MAX_LEVEL ? 1 : c.xp / xpNeeded(c.level));
  setText('hp-text', `${Math.ceil(p.hp)} / ${s.maxHp}`);
  setText('en-text', `${Math.floor(p.en)} / ${s.maxEn}`);
  setText('lvl', String(c.level));
  if (cache.l3 !== c.level >= 100) $('portrait').classList.toggle('l3', (cache.l3 = c.level >= 100)); // nível com 3 dígitos: fonte menor
  setText('credits-val', fmt(c.credits));
  // recompensa atual da dificuldade (sobe aos poucos depois de aumentar)
  setText('diff-rew', `¢×${rewardK('cr').toFixed(1)} · ★×${rewardK('loot').toFixed(1)}${rewardRamping() ? ' ▲' : ''}`);
  setText('stim-count', String(c.stims));
  setText('tstim-count', String(c.stims));

  // vida baixa: a tela pisca em vermelho para lembrar do stim
  const hpFrac = p.hp / s.maxHp;
  const hurtEl = $('hurt');
  hurtEl.classList.toggle('low', p.alive && hpFrac <= 0.4);
  hurtEl.classList.toggle('crit', p.alive && hpFrac <= 0.2);

  // habilidades
  const bar = barSkills();
  for (let b = 0; b < bar.length; b++) {
    const i = bar[b];
    const cdMax = i ? skillCd(i) : 0;
    const k = cdMax > 0 ? p.cds[i] / cdMax : 0;
    const noen = !!i && p.en < skillCost(i);
    for (const el of [$('sk' + b), b === 0 ? $('tb-primary') : $('tb-s' + b)]) {
      const cd = el.querySelector('.cd');
      if (cd) {
        const v = k.toFixed(3);
        if (cd._v !== v) {
          cd._v = v;
          cd.style.setProperty('--p', v);
        }
      }
      el.classList.toggle('noen', noen);
    }
  }
  const sk = p.stimCd > 0 ? p.stimCd : 0;
  $('skstim').querySelector('.cd').style.setProperty('--p', sk.toFixed(2));
  $('tb-stim').querySelector('.cd').style.setProperty('--p', sk.toFixed(2));

  // buffs
  const buffs = [];
  if (p.buffs.overclock > 0) buffs.push(`Overclock ${p.buffs.overclock.toFixed(0)}s`);
  if (p.sureCrit > 0) buffs.push(`${L('Crítico', 'Crit')} x${p.sureCrit}`);
  if (p.shield > 1) buffs.push(`${L('Escudo', 'Shield')} ${Math.round(p.shield)}`);
  if (p.buffs.regen > 0) buffs.push(L('Regeneração', 'Regen'));
  if (p.buffs.titan > 0) buffs.push(`${L('Titânio', 'Titanium')} ${p.buffs.titan.toFixed(0)}s`);
  if (p.buffs.guard > 0) buffs.push(`🛡 ${L('Defesa', 'Guard')} -${Math.round((1 - (p.guardK ?? 0.5)) * 100)}% ${p.buffs.guard.toFixed(0)}s`);
  if (p.buffs.mend > 0) buffs.push(`✚ ${L('Cura', 'Mend')} ${p.buffs.mend.toFixed(0)}s`);
  if (p.buffs.evade > 0) buffs.push(`${L('Esquiva', 'Evade')} ${Math.round(p.evadeK || 0)}% ${p.buffs.evade.toFixed(0)}s`);
  if (p.buffs.leech > 0) buffs.push(`${L('Roubo de vida', 'Life steal')} ${p.buffs.leech.toFixed(0)}s`);
  for (const k in SHRINES) if (p.buffs[k] > 0) buffs.push(`<span style="color:${SHRINES[k].css};border-color:${SHRINES[k].css}">${SHRINES[k].name} ${p.buffs[k].toFixed(0)}s</span>`);
  for (const b of mythHud()) buffs.push(`<span style="color:#c56bff;border-color:#c56bff">✦ ${b}</span>`);
  if (p.spin > 0.05) buffs.push(`${L('Giro', 'Spin')} ${Math.round(100 + p.spin * 200)}%`);
  const bh = buffs.map((b) => (b.startsWith('<span') ? b.replace('<span ', '<span class="buff" ') : `<span class="buff">${b}</span>`)).join('');
  if (cache.buffs !== bh) {
    cache.buffs = bh;
    $('buffs').innerHTML = bh;
  }

  // alvo sob o mouse
  const t = (G.hoverEnemy && G.hoverEnemy.alive && G.hoverEnemy) || (p.target && p.target.alive && p.target);
  if (t && !t.boss) {
    $('target-info').classList.remove('hidden');
    setText('target-name', t.name);
    $('target-name').classList.toggle('elite', !!t.elite);
    setScale($('target-fill'), t.hp / t.maxHp);
  } else {
    $('target-info').classList.add('hidden');
  }
  G.bosses.slice(0, 2).forEach((b, k) => {
    const n = k ? '2' : '';
    setScale($('boss-fill' + n), b.hp / b.maxHp);
    setScale($('boss-lag' + n), b.hp / b.maxHp);
  });

  // badge de pontos de habilidade
  $('char-badge').classList.toggle('hidden', !(c.skillPoints > 0));

  mmTimer -= dt;
  if (mmTimer <= 0) {
    mmTimer = 0.08;
    drawMinimap();
    if (bigOpen) drawBigMap();
  }
}

// Barras dos chefes em combate (até 2, na batalha final) e o placar da batalha final
export function bossBar() {
  const list = G.bosses.slice(0, 2);
  ['', '2'].forEach((n, k) => {
    const b = list[k];
    $('boss-bar' + n).classList.toggle('hidden', !b);
    if (b) $('boss-name' + n).textContent = b.name.toUpperCase();
  });
  $('top-center').classList.toggle('duo', list.length > 1);
  const F = G.final;
  $('final-count').classList.toggle('hidden', !F || F.won || F.t0 == null);
  if (F) $('final-count').textContent = L(`BATALHA FINAL · ONDA ${F.wave}/${F.waves} · CHEFES ${F.killed}/${F.total}`, `FINAL BATTLE · WAVE ${F.wave}/${F.waves} · BOSSES ${F.killed}/${F.total}`);
}

export function exitPrompt(state, k) {
  const el = $('exit-prompt');
  if (!state) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('locked', state === 'locked');
  const F = G.final;
  let txt;
  if (state === 'locked') txt = F ? L(`ELEVADOR BLOQUEADO — DERROTE OS ${F.total} CHEFES`, `ELEVATOR LOCKED — DEFEAT ALL ${F.total} BOSSES`) : L('ELEVADOR BLOQUEADO — DERROTE O CHEFE', 'ELEVATOR LOCKED — DEFEAT THE BOSS');
  else txt = F && F.won ? L('SUBINDO PARA A SUPERFÍCIE…', 'GOING UP TO THE SURFACE…') : L(`DESCENDO PARA O ANDAR ${G.floor + 1}…`, `GOING DOWN TO FLOOR ${G.floor + 1}…`);
  setText('exit-text', txt);
  setScale($('exit-fill'), state === 'locked' ? 0 : k);
}

let hurtT = null;
export function hurtFlash(frac) {
  const el = $('hurt');
  el.style.opacity = Math.min(0.9, 0.3 + frac * 3);
  clearTimeout(hurtT);
  hurtT = setTimeout(() => (el.style.opacity = 0), 120);
}

const toastKeys = {};
// Dificuldade: opções (botão) e HUD (controle deslizante) usam a mesma função
const DIFF_COLORS = ['#39ff88', '#00f0ff', '#ffd23d', '#ff9a3d', '#ff6a1a', '#ff3a64', '#ff2bd6', '#b04dff', '#e8e6ff'];
function updDiffUi() {
  const k = G.settings.difficulty;
  const i = Math.max(0, DIFF_ORDER.indexOf(k));
  const name = DIFFICULTY[k]?.name || 'Normal';
  $('opt-diff').textContent = name;
  $('diff-range').value = String(i);
  $('diff-name').textContent = name;
  $('diff-ctl').style.setProperty('--dc', DIFF_COLORS[i]);
}
function applyDiff(key) {
  if (!setDifficulty(key)) return;
  saveSettings();
  updDiffUi();
  // vida/blindagem do jogador e os inimigos vivos mudam na hora
  if (G.player && G.char) refreshStats();
  if (G.mode !== 'menu') {
    const D = DIFFICULTY[key];
    toast(L(`Dificuldade: <b>${D.name}</b>. Os inimigos já mudaram; ao aumentar, a recompensa sobe aos poucos.`, `Difficulty: <b>${D.name}</b>. Enemies changed now; when raising it, rewards ramp up gradually.`), '', 'diff');
  }
}

export function toast(html, cls = '', key = null) {
  if (key) {
    const n = performance.now();
    if (toastKeys[key] && n - toastKeys[key] < 1500) return;
    toastKeys[key] = n;
  }
  const root = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = html;
  root.appendChild(el);
  while (root.children.length > 4) root.firstChild.remove();
  const long = cls === 'leg' || cls === 'myth';
  setTimeout(() => el.classList.add('out'), cls === 'myth' ? 6000 : long ? 4000 : 2200);
  setTimeout(() => el.remove(), cls === 'myth' ? 6500 : long ? 4500 : 2700);
}

export function invFull() {
  toast(L('Inventário cheio! Recicle itens (I).', 'Inventory full! Recycle items (I).'), 'warn');
  sfx.deny();
}

let bannerT = null;
export function banner(title, sub = '') {
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub;
  const b = $('banner');
  b.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('show'), 2600);
}

export function levelUpFx(level) {
  toast(L(`NÍVEL ${level}! +${SP_PER_LEVEL} PONTOS DE HABILIDADE`, `LEVEL ${level}! +${SP_PER_LEVEL} SKILL POINTS`), 'lvl');
}

// ------------------------------------------------------------------
// Minimapa
// ------------------------------------------------------------------
let mmCanvas = null;
let mmCtx = null;
let mmB = null;
export function resetMinimap(d) {
  mmB = null;
  toggleBigMap(false);
  mmCanvas = document.createElement('canvas');
  mmCanvas.width = d.W;
  mmCanvas.height = d.H;
  mmCtx = mmCanvas.getContext('2d');
}

export function markMinimap(indices) {
  if (!mmCtx) return;
  const d = G.dungeon;
  for (const k of indices) {
    const t = d.grid[k];
    const i = k % d.W;
    const j = (k / d.W) | 0;
    if (t !== 0) {
      if (!mmB) mmB = { x0: i, x1: i, z0: j, z1: j };
      else {
        mmB.x0 = Math.min(mmB.x0, i);
        mmB.x1 = Math.max(mmB.x1, i);
        mmB.z0 = Math.min(mmB.z0, j);
        mmB.z1 = Math.max(mmB.z1, j);
      }
    }
    if (t === 1) mmCtx.fillStyle = 'rgba(120,140,220,0.55)';
    else if (t === 3) mmCtx.fillStyle = G.dungeon.pitStyle === 'water' ? 'rgba(40,130,230,0.7)' : 'rgba(0,0,0,0.9)';
    else if (t === 2) mmCtx.fillStyle = 'rgba(60,70,120,0.8)';
    else {
      // parede só se encostar em chão
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
        const ii = i + dx;
        const jj = j + dy;
        if (ii >= 0 && jj >= 0 && ii < d.W && jj < d.H && d.grid[jj * d.W + ii] !== 0) near = true;
      }
      if (!near) continue;
      mmCtx.fillStyle = 'rgba(0,240,255,0.55)';
    }
    mmCtx.fillRect(i, j, 1, 1);
  }
}

function drawMinimap() {
  const cv = $('minimap');
  const ctx = cv.getContext('2d');
  const p = G.player;
  const d = G.dungeon;
  if (!d || !mmCanvas) return;
  const W = cv.width;
  ctx.clearRect(0, 0, W, W);
  const sc = 4;
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.rotate(Math.PI / 4);
  ctx.scale(sc, sc);
  ctx.translate(-p.x, -p.z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mmCanvas, 0, 0);
  drawMapMarks(ctx, d, p, 22);
  ctx.restore();
  drawThiefArrows(ctx, W, sc);
  // jogador no centro (seta apontando para a direção)
  drawPlayerArrow(ctx, W / 2, W / 2, 1);
}

// seta do jogador (aponta para onde ele olha)
function drawPlayerArrow(ctx, x, y, k) {
  const p = G.player;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4 - p.facing + Math.PI);
  ctx.scale(k, k);
  ctx.fillStyle = CLASSES[G.char.cls].css;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// saída, inimigos, baús, santuários e itens (em coordenadas do mapa); near = só os inimigos perto do jogador
function drawMapMarks(ctx, d, p, near) {
  // saída
  const ex = d.exit;
  if (d.explored[Math.floor(ex.z) * d.W + Math.floor(ex.x)]) {
    ctx.fillStyle = G.dungeon.meshes.exit.locked ? '#ff2244' : '#ffffff';
    ctx.beginPath();
    ctx.arc(ex.x, ex.z, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ninho: anel vermelho pulsando (sempre visível até ser destruído)
  const N = G.nest;
  if (N && !N.done) {
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(N.x, N.z, 3 + Math.sin(G.t * 4) * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // inimigos próximos (quando faltam poucos para limpar o andar, aparecem todos, mesmo longe ou no escuro)
  const hunt = G.clear && !G.clear.done && G.clear.left <= 5;
  for (const e of G.enemies) {
    if (!e.alive || e.type === 'thief') continue;
    // Behemoth: sempre visível no mapa, pulsando
    if (e.type === 'behemoth') {
      const k = 1.3 + Math.sin(G.t * 5) * 0.35;
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(e.x - k, e.z - k, k * 2, k * 2);
      continue;
    }
    if (hunt && !e.inert && !e.decoy && e.type !== 'pylon') {
      const k = 1 + Math.sin(G.t * 7) * 0.3;
      ctx.fillStyle = e.boss ? '#ff2244' : '#ff4466';
      ctx.fillRect(e.x - 0.7 * k, e.z - 0.7 * k, 1.4 * k, 1.4 * k);
      continue;
    }
    if (near && (Math.abs(e.x - p.x) > near || Math.abs(e.z - p.z) > near)) continue;
    if (e.inert) {
      if (!d.explored[Math.floor(e.z) * d.W + Math.floor(e.x)]) continue;
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(e.x - 0.3, e.z - 0.3, 0.6, 0.6);
      continue;
    }
    if (!d.explored[Math.floor(e.z) * d.W + Math.floor(e.x)]) continue;
    ctx.fillStyle = e.boss ? '#ff2244' : e.T.big ? '#ff7a1a' : e.elite || e.type === 'thief' ? '#ffd23d' : '#ff4466';
    const r = e.boss ? 1.3 : e.T.big ? 1.0 : e.elite || e.type === 'thief' ? 0.7 : 0.45;
    ctx.fillRect(e.x - r, e.z - r, r * 2, r * 2);
  }
  // ferreiro, mercador e baú (depois de explorados)
  for (const pr of d.props) {
    if (pr.type !== 'smith' && pr.type !== 'merchant' && pr.type !== 'stash') continue;
    if (!d.explored[Math.floor(pr.z) * d.W + Math.floor(pr.x)]) continue;
    if (pr.type === 'stash') {
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(pr.x - 0.9, pr.z - 0.6, 1.8, 1.2);
      continue;
    }
    ctx.fillStyle = pr.type === 'smith' ? '#ff7a1a' : '#ffd23d';
    ctx.fillRect(pr.x - 1.2, pr.z - 0.5, 2.4, 0.8);
    ctx.fillRect(pr.x - 0.4, pr.z + 0.3, 0.8, 0.9);
  }
  // itens
  for (const pk of G.pickups) {
    if (pk.type === 'chest' && !pk.opened) {
      if (!d.explored[Math.floor(pk.z) * d.W + Math.floor(pk.x)]) continue;
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(pk.x - 0.6, pk.z - 0.6, 1.2, 1.2);
      continue;
    }
    if (pk.type === 'shrine') {
      if (pk.used || !d.explored[Math.floor(pk.z) * d.W + Math.floor(pk.x)]) continue;
      ctx.fillStyle = SHRINES[pk.kind].css;
      ctx.beginPath();
      ctx.arc(pk.x, pk.z, 0.9, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (pk.type === 'rift') {
      // Fenda de Desafio: losango rosa, sempre visível até ser fechada
      if (pk.state === 'done') continue;
      ctx.fillStyle = '#ff2bd6';
      ctx.beginPath();
      ctx.moveTo(pk.x, pk.z - 1.3);
      ctx.lineTo(pk.x + 1.3, pk.z);
      ctx.lineTo(pk.x, pk.z + 1.3);
      ctx.lineTo(pk.x - 1.3, pk.z);
      ctx.fill();
      continue;
    }
    if (pk.type !== 'item' || (pk.item.rarity < 1 && !pk.up)) continue;
    ctx.fillStyle = pk.up ? '#39ff88' : RARITY[pk.item.rarity].color;
    const r = pk.item.myth ? 1.1 + Math.sin(G.t * 6) * 0.25 : pk.up ? 0.75 : 0.4;
    ctx.fillRect(pk.x - r, pk.z - r, r * 2, r * 2);
  }
  // Ladrão de Dados: sempre aparece (mesmo longe ou em área não explorada), grande e piscando
  for (const e of G.enemies) {
    if (!e.alive || e.type !== 'thief') continue;
    const k = 1 + Math.sin(G.t * 8) * 0.25;
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(e.x, e.z, 2.6 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath();
    ctx.arc(e.x, e.z, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// seta na borda do minimapa apontando para o Ladrão de Dados quando ele está fora do alcance
function drawThiefArrows(ctx, W, sc) {
  const p = G.player;
  const c = Math.SQRT1_2;
  const R = W / 2 - 9;
  const arrow = (x, z, col, k) => {
    const dx = x - p.x;
    const dz = z - p.z;
    const sx = (dx * c - dz * c) * sc;
    const sy = (dx * c + dz * c) * sc;
    if (Math.hypot(sx, sy) < R) return;
    const a = Math.atan2(sy, sx);
    ctx.save();
    ctx.translate(W / 2 + Math.cos(a) * R, W / 2 + Math.sin(a) * R);
    ctx.rotate(a);
    ctx.globalAlpha = 0.75 + Math.sin(G.t * 8) * 0.25;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    if (k !== 1) ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -6.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  // setas na borda do minimapa: Ladrão (amarela), Behemoth (laranja), Ninho (vermelha) e,
  // quando faltam poucos inimigos para limpar o andar, setas vermelhas menores apontam para eles
  const hunt = G.clear && !G.clear.done && G.clear.left <= 5;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.type === 'thief') arrow(e.x, e.z, '#ffd23d', 1);
    else if (e.type === 'behemoth') arrow(e.x, e.z, '#ff7a1a', 1);
    else if (hunt && !e.inert && !e.decoy && e.type !== 'pylon') arrow(e.x, e.z, '#ff4466', 0.75);
  }
  const N = G.nest;
  if (N && !N.done && !hunt) arrow(N.x, N.z, '#ff4466', 1);
}

// ------------------------------------------------------------------
// Mapa inteiro: tudo o que já foi explorado no andar
// ------------------------------------------------------------------
let bigOpen = false;
export function bigMapOpen() {
  return bigOpen;
}
export function toggleBigMap(force) {
  const open = force ?? !bigOpen;
  if (open && (!G.dungeon || !mmCanvas || G.mode === 'menu')) return;
  bigOpen = open;
  $('bigmap').classList.toggle('hidden', !open);
  if (!open) return;
  if (!G.settings.mapSeen) {
    G.settings.mapSeen = true;
    saveSettings();
    mmHint();
  }
  sfx.click();
  const cv = $('bigmap-cv');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const px = Math.round(cv.clientWidth * dpr) || 600;
  cv.width = cv.height = px;
  $('bigmap-title').textContent = $('floor-label').textContent;
  $('bigmap-hint').innerHTML = G.lastInput === 'pad' ? padText(L('{RS} fechar', '{RS} close')) : G.isTouch ? L('Toque no minimapa para fechar', 'Tap the minimap to close') : L('M ou clique no minimapa para fechar', 'M or click the minimap to close');
  drawBigMap();
}

function drawBigMap() {
  const cv = $('bigmap-cv');
  const ctx = cv.getContext('2d');
  const p = G.player;
  const d = G.dungeon;
  if (!d || !mmCanvas || !p) return;
  const W = cv.width;
  ctx.clearRect(0, 0, W, W);
  const b = { ...(mmB || { x0: p.x - 8, x1: p.x + 8, z0: p.z - 8, z1: p.z + 8 }) };
  // o ninho e o Behemoth aparecem mesmo fora da área explorada
  const marks = G.enemies.filter((e) => e.alive && e.type === 'behemoth');
  if (G.nest && !G.nest.done) marks.push(G.nest);
  for (const m of marks) {
    b.x0 = Math.min(b.x0, m.x - 4);
    b.x1 = Math.max(b.x1, m.x + 4);
    b.z0 = Math.min(b.z0, m.z - 4);
    b.z1 = Math.max(b.z1, m.z + 4);
  }
  const w = b.x1 - b.x0 + 3;
  const h = b.z1 - b.z0 + 3;
  const cx = (b.x0 + b.x1 + 1) / 2;
  const cz = (b.z0 + b.z1 + 1) / 2;
  // girado 45° como a câmera: a largura ocupada é (w + h) / √2
  const sc = Math.min((W * 0.94) / ((w + h) / Math.SQRT2), W / 22);
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.rotate(Math.PI / 4);
  ctx.scale(sc, sc);
  ctx.translate(-cx, -cz);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mmCanvas, 0, 0);
  drawMapMarks(ctx, d, p, 0);
  ctx.restore();
  // posição do jogador na tela do mapa
  const dx = p.x - cx;
  const dz = p.z - cz;
  const c = Math.SQRT1_2;
  const sx = W / 2 + (dx * c - dz * c) * sc;
  const sy = W / 2 + (dx * c + dz * c) * sc;
  const k = W / 300;
  ctx.strokeStyle = CLASSES[G.char.cls].css;
  ctx.globalAlpha = 0.5 + Math.sin(G.t * 5) * 0.3;
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.arc(sx, sy, (9 + Math.sin(G.t * 5) * 2) * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawPlayerArrow(ctx, sx, sy, k);
}

// ------------------------------------------------------------------
// Pausa / morte
// ------------------------------------------------------------------
export function openPause() {
  if (G.mode !== 'play') return;
  G.mode = 'pause';
  $('panel-pause').classList.remove('hidden');
  clearFocus();
}
export function closePause() {
  $('panel-pause').classList.add('hidden');
  if (G.mode === 'pause') G.mode = 'play';
  Input.reset();
}

// ------------------------------------------------------------------
// Final do jogo
// ------------------------------------------------------------------
// uma frase de despedida para cada classe
const EPILOGUE = {
  blade: ['A Lâmina embainha a espada de plasma. A dívida de honra com a cidade está paga.', 'The Blade sheathes the plasma sword. The debt of honor to the city is paid.'],
  gunner: ['A Atiradora gira as pistolas uma última vez e as guarda. Esse trabalho ela faria de graça.', 'The Gunslinger spins her pistols one last time and holsters them. This job she would have done for free.'],
  netrunner: ['A Netrunner apaga o último registro da corporação e deixa uma mensagem no lugar: "a rede é de todos".', 'The Netrunner wipes the corporation’s last record and leaves a message in its place: "the net belongs to everyone".'],
  brawler: ['O Punho de Aço estala os dedos de titânio. Nenhum ringue jamais vai ser tão difícil.', 'Iron Fist cracks his titanium knuckles. No ring will ever be this tough again.'],
  pyro: ['A Incendiária acende um último fogo, só para iluminar o caminho de volta.', 'The Pyro lights one last fire, just to light the way home.'],
  frost: ['A Geada deixa a mira de lado. Pela primeira vez, o único frio que sente é o vento da manhã.', 'Frost lowers her scope. For once, the only cold she feels is the morning wind.'],
  hunter: ['A Caçadora solta a última flecha para o céu. Pela primeira vez em anos, ela não tem nenhum alvo.', 'The Huntress looses one last arrow into the sky. For the first time in years, she has no target.'],
  lancer: ['A Valquíria crava a lança no topo da torre. Agora os raios protegem a cidade, não a corporação.', 'The Valkyrie plants her spear atop the tower. Now the lightning guards the city, not the corporation.'],
  biohacker: ['A Biohacker sintetiza um antídoto com o que sobrou do laboratório da corporação e distribui de graça nas ruas.', 'The Biohacker synthesizes an antidote from what is left of the corporate lab and hands it out for free on the streets.'],
  heavy: ['O Colosso desliga a minigun. Depois de tanto barulho, o silêncio parece música.', 'The Juggernaut powers down the minigun. After all that noise, the silence sounds like music.'],
};

export function showEnding(info = {}) {
  const c = G.char;
  const C = CLASSES[c.cls];
  G.mode = 'ending';
  $('hud').classList.add('hidden');
  exitPrompt(null);
  const lines = [
    L('O Núcleo OMEGA pisca uma última vez e se apaga. Pela primeira vez em décadas, as torres da corporação ficam em silêncio.', 'The OMEGA Core flickers one last time and goes dark. For the first time in decades, the corporate towers fall silent.'),
    L('Executor, Matriarca, Rei do Ferro-Velho, Ceifadora, Nave de Ataque, Hacker Supremo e OMEGA: os sete guardiões do subsolo agora são sucata.', 'Executor, Matriarch, Scrap King, Reaper, Gunship, Grand Hacker and OMEGA: the seven guardians of the underworld are now scrap.'),
    L(...(EPILOGUE[c.cls] || EPILOGUE.blade)),
    L('O elevador sobe trinta andares. Lá em cima, os letreiros neon piscam… e o sol nasce sobre a cidade.', 'The elevator climbs thirty floors. Up top, the neon signs flicker… and the sun rises over the city.'),
    L('Mas lá embaixo, em algum servidor esquecido, um LED vermelho volta a acender…', 'But far below, in some forgotten server, a red LED blinks back on…'),
  ];
  const step = 1.4; // segundos entre cada parágrafo
  $('end-story').innerHTML = lines.map((txt, i) => `<p style="animation-delay:${0.6 + i * step}s"${i === lines.length - 1 ? ' class="tease"' : ''}>${txt}</p>`).join('');
  const tm = info.time || 0;
  const D = DIFFICULTY[G.settings.difficulty] || DIFFICULTY.normal;
  const stats = [
    [L('Herói', 'Hero'), `${C.name} · ${L('Nível', 'Level')} ${c.level}`],
    [L('Batalha final', 'Final battle'), `${Math.floor(tm / 60)}:${String(Math.floor(tm % 60)).padStart(2, '0')}`],
    [L('Tempo de jogo', 'Play time'), fmtPlay(c.playTime)],
    [L('Mortes', 'Deaths'), fmt(c.deaths || 0)],
    [L('Abates', 'Kills'), fmt(c.kills || 0)],
    [L('Créditos', 'Credits'), fmt(c.credits || 0)],
    [L('Dificuldade', 'Difficulty'), D.name],
    ...(c.tier ? [[L('Modo', 'Mode'), `${tierOf(c).icon} ${tierOf(c).name}`]] : []),
    [L('Vitórias', 'Wins'), c.wins || 1],
  ];
  $('end-stats').innerHTML = stats.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('end-stats').style.animationDelay = `${0.6 + lines.length * step}s`;
  // Novo Jogo+: descer de novo no próximo modo (ou repetir o Inferno)
  const nx = MODES[Math.min(MAX_TIER, (c.tier | 0) + 1)];
  $('end-tier').textContent = (c.tier | 0) >= MAX_TIER ? L(`${nx.icon} Inferno de novo`, `${nx.icon} Inferno again`) : L(`${nx.icon} Descer no ${nx.name}`, `${nx.icon} Descend into ${nx.name}`);
  $('end-tier-info').innerHTML = L(`Recomece do andar 1 com este personagem (nível, itens e implantes) no modo <b style="color:${nx.css}">${nx.name}</b>: inimigos muito mais fortes, elites com mais afixos e itens melhores.`, `Start again from floor 1 with this character (level, items and implants) in <b style="color:${nx.css}">${nx.name}</b> mode: much stronger enemies, elites with more affixes and better items.`);
  $('panel-end').classList.remove('hidden');
  $('panel-end').scrollTop = 0;
  clearFocus();
}

export function showDead() {
  const c = G.char;
  $('dead-info').innerHTML = L(`Andar ${G.floor} · Nível ${c.level}<br>Você será reconstruído no início do andar e perderá 10% dos créditos.`, `Floor ${G.floor} · Level ${c.level}<br>You will be rebuilt at the start of the floor and lose 10% of your credits.`);
  $('panel-dead').classList.remove('hidden');
  clearFocus();
}

// ------------------------------------------------------------------
// Painel do personagem
// ------------------------------------------------------------------
let currentTab = 'equip';
export function toggleChar() {
  if (G.mode === 'char') closeChar();
  else if (G.mode === 'play') openChar();
}
export function openChar(tab) {
  if (G.mode !== 'play' && G.mode !== 'pause') return;
  G.mode = 'char';
  $('panel-char').classList.remove('hidden');
  setTab(tab || (G.char.skillPoints > 0 && currentTab === 'skills' ? 'skills' : currentTab));
  clearFocus();
}
export function closeChar() {
  $('panel-char').classList.add('hidden');
  if (G.mode === 'char') G.mode = 'play';
  selected = null;
  saveGame();
  Input.reset();
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('tab-equip').classList.toggle('hidden', tab !== 'equip');
  $('tab-skills').classList.toggle('hidden', tab !== 'skills');
  const hints = document.querySelector('.pad-hints');
  hints.dataset.padText = tab === 'skills' ? 'padHintsTree' : 'padHints';
  hints.innerHTML = padText(t(hints.dataset.padText));
  // no controle, a seleção já começa num poder (de preferência um que dá para desbloquear)
  if (tab === 'skills' && G.lastInput === 'pad') {
    setTimeout(() => {
      const target = document.querySelector('#skill-list .tnode.available.can') || document.querySelector('#skill-list .tnode.can') || document.querySelector(`#skill-list [data-node="${treeSel}"]`);
      if (target) setFocus(target);
    }, 0);
  }
  renderChar();
}

export function renderChar() {
  const c = G.char;
  const p = G.player;
  const C = CLASSES[c.cls];
  $('sp-badge').textContent = c.skillPoints;
  $('sp-badge').classList.toggle('hidden', !(c.skillPoints > 0));
  if (currentTab === 'equip') {
    $('char-title').textContent = `${C.name} · ${L('Nível', 'Level')} ${c.level}`;
    // equipamento
    $('equip-slots').innerHTML = SLOTS.map((slot) => {
      const it = c.equip[slot];
      const sel = selected && selected.where === 'equip' && selected.slot === slot ? ' sel' : '';
      return `<div class="eslot">${it
        ? `<div class="cell r${it.rarity}${sel}" data-nav data-eslot="${slot}" data-uid="${it.uid}" data-where="equip" data-slot="${slot}">${slotIconSvg(slot)}${favMark(it)}</div>`
        : `<div class="cell empty" data-nav data-eslot="${slot}">${slotIconSvg(slot)}</div>`}${SLOT_NAMES[slot]}</div>`;
    }).join('');
    // inventário (sempre ordenado: melhores itens primeiro)
    sortInventory(c.inv, c.equip);
    let html = '';
    for (let i = 0; i < INV_SIZE; i++) {
      const it = c.inv[i];
      if (!it) {
        html += '<div class="cell empty" data-nav></div>'; // navegável: o controle consegue descer até os botões
        continue;
      }
      const better = isUpgrade(it, c.equip);
      const up = better ? '<span class="up">▲</span>' : '';
      const sel = selected && selected.where === 'inv' && selected.uid === it.uid ? ' sel' : '';
      html += `<div class="cell r${it.rarity}${sel}${better ? ' better' : ''}" data-nav data-uid="${it.uid}" data-where="inv" data-slot="${it.slot}">${slotIconSvg(it.slot)}${up}${favMark(it)}</div>`;
    }
    $('inv-grid').innerHTML = html;
    $('inv-count').textContent = `${L('Inventário', 'Inventory')} ${c.inv.length}/${INV_SIZE}`;
    $('inv-credits').textContent = fmt(c.credits);
    const price = stimPrice();
    // no celular deitado o texto longo quebraria em 2 linhas
    $('btn-buy-stim').textContent = `${G.isTouch ? 'Stim' : L('Comprar Stim', 'Buy Stim')} · ${L('cura 60%', 'heals 60%')} · ${price}¢ · ${c.stims}/${MAX_STIMS}`;
    $('btn-buy-stim').title = L(`Stim: cura 60% da vida na hora e mais um pouco nos 4s seguintes. Use com F, apertando o analógico esquerdo no controle ou no botão verde no toque. Leve até ${MAX_STIMS}.`, `Stim: instantly heals 60% of your health, plus a bit more over the next 4s. Use it with F, by clicking the left stick on a gamepad or with the green touch button. Carry up to ${MAX_STIMS}.`);
    $('btn-buy-stim').disabled = c.credits < price || c.stims >= MAX_STIMS;
    $('btn-recycle-all').disabled = !c.inv.some(canBulkRecycle);
    // atributos
    const s = p.stats;
    const rows = [
      [L('Vida', 'Health'), fmt(s.maxHp)],
      [L('Energia', 'Energy'), fmt(s.maxEn)],
      [L('Dano da arma', 'Weapon damage'), `${fmt(s.wMin)}–${fmt(s.wMax)}`],
      [L('Bônus de dano', 'Damage bonus'), `+${fmt(s.dmgPct)}%`],
      [L('Crítico', 'Critical'), `${s.crit.toFixed(0)}% · +${fmt(s.critDmg)}%`],
      [L('Vel. de ataque', 'Attack speed'), `${s.atkRate.toFixed(2)}/s`],
      [L('Blindagem', 'Armor'), `${fmt(s.armor)} (-${Math.round((1 - armorTaken(s.armor)) * 100)}%)`],
      [L('Movimento', 'Movement'), `${s.speed.toFixed(1)}`],
      [L('Regeneração', 'Regeneration'), `${s.hpRegen.toFixed(1)}/s · ${s.enRegen.toFixed(1)} en/s`],
    ];
    if (s.lifeSteal) rows.push([L('Roubo de vida', 'Life steal'), `${s.lifeSteal.toFixed(1)}%`]);
    if (s.cdr) rows.push([L('Recarga', 'Cooldown'), `-${s.cdr}%`]);
    if (s.xpPct) rows.push([L('Experiência', 'Experience'), `+${s.xpPct}%`]);
    if (s.findPct) rows.push([L('Achar itens', 'Item find'), `+${Math.round(s.findPct)}%`]);
    let sh = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    for (const l of s.divs) sh += `<div class="leg div">⚡ ${DIVINES[l].name}</div>`;
    if (s.divs.size >= 6) sh += `<div class="leg div">⚡ ${DIV_SET.name}</div>`;
    for (const l of s.myths) sh += `<div class="leg myth">✦ ${MYTHICS[l].name}</div>`;
    for (const l of s.legs) sh += `<div class="leg">◆ ${LEGENDARIES[l].name}</div>`;
    const imp = implantSummary(G.char);
    if (imp) sh += `<div class="imp-row">${L('Implantes', 'Implants')}: ${imp}</div>`;
    $('stat-list').innerHTML = sh;
    renderDetail();
  } else {
    renderTree();
  }
}

// ------------------------------------------------------------------
// Árvore de habilidades
// ------------------------------------------------------------------
let treeSel = 1;
const TIERS = [
  { label: [1, 1], idx: [0, 1] },
  { label: [2, 4], idx: [2, 9, 12, 3] },
  { label: [5, 9], idx: [4, 5, 10, 6] },
  { label: [12, 15], idx: [7, 11, 8] },
  // passivos avançados: a posição muda por classe (o Netrunner não tem o Teleporte), então vêm pela marca late
  { label: [20, 36], late: true },
  // poderes avançados (2 de ataque e 2 de defesa), também pela marca adv
  { label: [40, 70], adv: true },
];
const tierIdx = (C, t) => (t.late || t.adv ? C.skills.map((sk, i) => ((t.late ? sk.late : sk.adv) ? i : -1)).filter((i) => i >= 0) : t.idx);
function slotKey(k) {
  if (G.lastInput === 'pad') return glyphText(['x', 'y', 'b', 'lb', 'rb', 'lt'][k]);
  return String(k + 1);
}

// Desbloqueia ou evolui o poder (botão de confirmar do controle ou clique duplo)
function treeSpend(i) {
  treeSel = i;
  if (spendPoint(i)) {
    sfx.levelup();
    const sk = CLASSES[G.char.cls].skills[i];
    toast(`${sk.name}: ${L('nível', 'level')} ${G.char.skills[i]}`, 'up', 'tree');
    refreshSkillBar();
  } else {
    sfx.deny();
    const c = G.char;
    const req = CLASSES[c.cls].skills[i].req || 1;
    if (c.level < req) toast(L(`Liberado no nível ${req}`, `Unlocks at level ${req}`), 'warn', 'tree');
    else if (c.skillPoints <= 0) toast(L('Sem pontos de habilidade: suba de nível para ganhar mais.', 'No skill points: level up to earn more.'), 'warn', 'tree');
  }
  renderChar();
  restoreFocus(`[data-node="${i}"]`);
}

// Coloca o poder no próximo botão (1 → 2 → … → 6)
function treeCycleSlot(i) {
  const c = G.char;
  if (i === 0 || !(c.skills[i] > 0) || CLASSES[c.cls].skills[i].passive) return sfx.deny();
  const cur = c.slots.indexOf(i);
  assignSlot((cur + 1) % c.slots.length, i);
  sfx.click();
  refreshSkillBar();
  renderTree();
  restoreFocus(`[data-node="${i}"]`);
}

function renderTree() {
  const c = G.char;
  const C = CLASSES[c.cls];
  if (!C.skills[treeSel]) treeSel = 1;
  let html = `<div class="tree-wrap"><div class="tree">
    <div class="sp-info">${L('Pontos disponíveis', 'Points available')}: <b>${c.skillPoints}</b></div>`;
  TIERS.forEach((t, ti) => {
    const lbl = t.label[0] === t.label[1] ? `${L('Nível', 'Level')} ${t.label[0]}` : `${L('Níveis', 'Levels')} ${t.label[0]}–${t.label[1]}`;
    if (ti) html += '<div class="tree-link"></div>';
    html += `<div class="tier"><div class="tier-label">${lbl}</div><div class="tier-nodes">`;
    for (const i of tierIdx(C, t)) {
      const sk = C.skills[i];
      if (!sk || (sk.late && !t.late) || (sk.adv && !t.adv)) continue;
      const r = c.skills[i] || 0;
      const req = sk.req || 1;
      const locked = r === 0;
      const canLearn = locked && c.level >= req && c.skillPoints > 0;
      const canUp = !locked && r < 10 && c.skillPoints > 0;
      const slot = c.slots.indexOf(i);
      const state = locked ? (c.level >= req ? 'available' : 'locked') : 'learned';
      html += `<button class="tnode ${state}${sk.passive ? ' passive' : ''}${treeSel === i ? ' sel' : ''}${canLearn || canUp ? ' can' : ''}" data-nav data-node="${i}" title="${sk.name}">
        <span class="ticon">${iconSvg(sk.icon)}</span>
        <span class="tbadge">${locked ? (c.level >= req ? '+' : `🔒${req}`) : `${r}/10`}</span>
        ${slot >= 0 ? `<span class="tslot">${slotKey(slot)}</span>` : i === 0 ? `<span class="tslot">⚔</span>` : ''}${sk.passive ? `<span class="tpas">${L('PASSIVO', 'PASSIVE')}</span>` : ''}
      </button>`;
    }
    html += '</div></div>';
  });
  html += '</div>';
  // detalhes do nó selecionado
  const i = treeSel;
  const sk = C.skills[i];
  const r = c.skills[i] || 0;
  const req = sk.req || 1;
  const locked = r === 0;
  const meta = sk.passive ? L('Poder passivo · sempre ativo, não usa botão', 'Passive power · always on, no button needed') : i === 0 ? L('Ataque básico', 'Basic attack') : L(`Custo ${skillCost(i)} de energia · Recarga ${skillCd(i).toFixed(1)}s`, `Cost ${skillCost(i)} energy · Cooldown ${skillCd(i).toFixed(1)}s`);
  let status = '';
  if (locked && c.level < req) status = `<div class="tstatus lock">🔒 ${L(`Liberado no nível ${req}`, `Unlocks at level ${req}`)}</div>`;
  else if (locked) status = `<div class="tstatus">${L('Disponível para desbloquear', 'Available to unlock')}</div>`;
  else status = `<div class="tstatus ok">${L('Nível', 'Level')} ${r}/10${r < 10 ? (sk.passive || sk.adv ? ` · ${L('próximo', 'next')}: ${sk.desc(r + 1)}` : L(` · próximo: ${Math.round(rankMult(r + 1) * 100)}% de potência`, ` · next: ${Math.round(rankMult(r + 1) * 100)}% power`)) : ''}</div>`;
  const canSpend = c.skillPoints > 0 && r < 10 && c.level >= req;
  let actions = `<button class="btn" data-nav data-spend="${i}" ${canSpend ? '' : 'disabled'}>${locked ? L('Desbloquear (1 ponto)', 'Unlock (1 point)') : L('+ Evoluir (1 ponto)', '+ Upgrade (1 point)')}</button>`;
  if (i > 0 && !locked && !sk.passive) {
    actions += `<div class="slot-pick"><span>${L('Colocar no botão:', 'Assign to button:')}</span>${c.slots.map((_, k) => `<button class="btn small ${c.slots[k] === i ? '' : 'ghost'}" data-nav data-slot="${k}">${slotKey(k)}</button>`).join('')}</div>`;
  }
  const tip = G.lastInput === 'pad' ? padText(L('{A} no poder: desbloquear/evoluir · {X}: trocar de botão', '{A} on a power: unlock/upgrade · {X}: change button')) : G.isTouch ? '' : L('Dica: clique duplo no poder para desbloquear/evoluir.', 'Tip: double-click a power to unlock/upgrade.');
  html += `<div class="tree-detail">
    <div class="td-head"><div class="sicon">${iconSvg(sk.icon)}</div><div><div class="sname">${sk.name}</div><div class="smeta">${meta}</div></div></div>
    <div class="sdesc">${sk.desc(Math.max(1, r))}</div>
    ${status}
    <div class="td-actions">${actions}</div>
    ${tip ? `<div class="td-tip">${tip}</div>` : ''}
  </div></div>`;
  $('skill-list').innerHTML = html;
  $('skill-list').querySelectorAll('[data-node]').forEach((b) => {
    b.onclick = () => {
      treeSel = +b.dataset.node;
      renderTree();
      restoreFocus(`[data-node="${treeSel}"]`);
    };
    b.ondblclick = () => treeSpend(+b.dataset.node);
  });
  const sp = $('skill-list').querySelector('[data-spend]');
  if (sp) sp.onclick = () => {
    if (spendPoint(i)) {
      sfx.levelup();
      refreshSkillBar();
      renderChar();
      restoreFocus('[data-spend]');
    } else sfx.deny();
  };
  $('skill-list').querySelectorAll('[data-slot]').forEach((b) => (b.onclick = () => {
    assignSlot(+b.dataset.slot, i);
    sfx.click();
    refreshSkillBar();
    renderTree();
    restoreFocus(`[data-slot="${b.dataset.slot}"]`);
  }));
}

function restoreFocus(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el && !el.disabled) setFocus(el);
  else clearFocus();
}

function findItem(sel) {
  const c = G.char;
  if (!sel) return null;
  if (sel.where === 'equip') return c.equip[sel.slot] || null;
  return c.inv.find((i) => i.uid === sel.uid) || null;
}

function renderDetail() {
  const el = $('item-detail');
  const it = findItem(selected);
  if (!it) {
    el.innerHTML = `<div class="empty-detail">${L('Selecione um item para ver os detalhes.<br><br>Clique duas vezes (ou {A} no controle) para equipar.', 'Select an item to see its details.<br><br>Double-click (or {A} on a gamepad) to equip.').replace(/\{A\}/g, glyph('a'))}</div>`;
    return;
  }
  const c = G.char;
  // favorito: protegido contra reciclagem (um a um e em lote)
  const fav = `<button class="btn small ghost fav-btn${it.fav ? ' on' : ''}" data-nav data-act="fav">${it.fav ? L('★ Desfavoritar', '★ Unfavorite') : L('☆ Favoritar', '☆ Favorite')}</button>`;
  let actions = '';
  if (selected.where === 'inv') {
    const rec = it.fav
      ? `<button class="btn small danger" disabled>🔒 ${L('Favorito', 'Favorite')}</button>`
      : `<button class="btn small danger" data-nav data-act="recycle">${L('Reciclar', 'Recycle')} (+${recycleValue(it)}¢)</button>`;
    actions = `<div class="detail-actions"><button class="btn small" data-nav data-act="equip">${L('Equipar', 'Equip')}</button>${fav}${rec}</div>`;
  } else {
    actions = `<div class="detail-actions"><button class="btn small ghost" data-nav data-act="unequip">${L('Desequipar', 'Unequip')}</button>${fav}</div>`;
  }
  const cur = selected.where === 'inv' ? c.equip[it.slot] : null;
  if (cur) {
    // selecionado e equipado lado a lado (no celular fica tudo visível sem rolar)
    el.innerHTML = `<div class="cmp-wrap"><div class="cmp-new">${itemCardHtml(it, itemDiffHtml(it, cur), { base: true })}${actions}</div><div class="cmp-cur"><div class="it-cmp">${L('Equipado atualmente', 'Currently equipped')}</div>${itemCardHtml(cur, '', { base: true })}</div></div>`;
  } else el.innerHTML = itemCardHtml(it) + actions;
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'equip') equipItem(it.uid);
    else if (a === 'recycle') recycleItem(it.uid);
    else if (a === 'fav') {
      toggleFav(it);
      restoreFocus('[data-act="fav"]');
    } else unequip(selected.slot);
  }));
}

function selectCell(cell, render = true) {
  selected = { where: cell.dataset.where, uid: cell.dataset.uid, slot: cell.dataset.slot };
  document.querySelectorAll('#panel-char .cell.sel').forEach((x) => x.classList.remove('sel'));
  cell.classList.add('sel');
  if (render) renderDetail();
  else renderDetail();
}

function onCharClick(e) {
  const cell = e.target.closest('.cell[data-uid]');
  if (cell) selectCell(cell);
}
function onCharDblClick(e) {
  const cell = e.target.closest('.cell[data-uid]');
  if (!cell) return;
  if (cell.dataset.where === 'inv') equipItem(cell.dataset.uid);
  else unequip(cell.dataset.slot);
}

export function equipItem(uid) {
  const c = G.char;
  const idx = c.inv.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  const it = c.inv[idx];
  const old = c.equip[it.slot];
  c.inv.splice(idx, 1);
  c.equip[it.slot] = it;
  if (old) c.inv.splice(idx, 0, old);
  refreshStats();
  sfx.pickup();
  selected = { where: 'equip', uid: it.uid, slot: it.slot };
  renderChar();
  focusInvCell(idx); // o seletor fica na mesma casa do inventário
}

// Foca a casa N do inventário (as vazias também são navegáveis), para o seletor não pular de lugar
function focusInvCell(idx) {
  const cells = document.querySelectorAll('#inv-grid > .cell');
  if (cells.length) restoreFocus(cells[Math.min(idx, cells.length - 1)]);
}

function unequip(slot) {
  const c = G.char;
  if (slot === 'weapon') {
    toast(L('Você precisa de uma arma equipada.', 'You need a weapon equipped.'), 'warn');
    sfx.deny();
    return;
  }
  if (c.inv.length >= INV_SIZE) {
    invFull();
    return;
  }
  const it = c.equip[slot];
  if (!it) return;
  delete c.equip[slot];
  c.inv.push(it);
  refreshStats();
  selected = { where: 'inv', uid: it.uid, slot };
  renderChar();
  restoreFocus(`#equip-slots [data-eslot="${slot}"]`);
}

function recycleItem(uid) {
  const c = G.char;
  const idx = c.inv.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  const it = c.inv[idx];
  if (it.fav) {
    sfx.deny();
    toast(L('Item favorito (★) não pode ser reciclado. Desfavorite antes.', 'Favorite items (★) can\'t be recycled. Unfavorite it first.'), 'warn');
    return;
  }
  const v = recycleValue(it);
  c.inv.splice(idx, 1);
  c.credits += v;
  sfx.coin();
  toast(L(`Reciclado: +${v}¢`, `Recycled: +${v}¢`));
  selected = null;
  renderChar();
  focusInvCell(idx);
}

// Marca/desmarca o item como favorito (vale para o inventário e para o equipado)
function toggleFav(it) {
  if (!it) return;
  if (it.fav) delete it.fav;
  else it.fav = true;
  sfx.click();
  toast(it.fav ? L('★ Favoritado: não pode ser reciclado.', '★ Favorited: it can\'t be recycled.') : L('Item desfavoritado.', 'Item unfavorited.'));
  renderChar();
  saveGame();
}

function favMark(it) {
  return it.fav ? '<span class="fav">★</span>' : '';
}

// itens míticos e favoritos nunca são reciclados em lote
const canBulkRecycle = (it) => !it.myth && !it.fav;

// Recicla todo o inventário (o que está equipado não é tocado)
function recycleAll() {
  const c = G.char;
  const list = c.inv.filter(canBulkRecycle);
  if (!list.length) return;
  const n = list.length;
  const kept = c.inv.length - n;
  const total = list.reduce((s, it) => s + recycleValue(it), 0);
  const ups = list.filter((it) => isUpgrade(it, c.equip)).length;
  const warn = ups ? L(` Atenção: ${ups} ${ups > 1 ? 'são melhores' : 'é melhor'} que o equipado (▲).`, ` Warning: ${ups} ${ups > 1 ? 'are' : 'is'} better than what you have equipped (▲).`) : '';
  const keep = kept ? L(` Os míticos e favoritos (★) ficam.`, ` Mythic and favorite (★) items are kept.`) : '';
  confirmDialog(L('Reciclar tudo?', 'Recycle all?'), L(`Reciclar os ${n} itens do inventário por ${fmt(total)}¢? Os equipados ficam.`, `Recycle all ${n} inventory items for ${fmt(total)}¢? Equipped items are kept.`) + keep + warn, () => {
    c.inv = c.inv.filter((it) => !canBulkRecycle(it));
    c.credits += total;
    sfx.coin();
    toast(L(`Inventário reciclado: +${fmt(total)}¢`, `Inventory recycled: +${fmt(total)}¢`));
    selected = null;
    renderChar();
    saveGame();
  });
}

function buyStim() {
  const c = G.char;
  const price = stimPrice();
  if (c.credits < price || c.stims >= MAX_STIMS) {
    sfx.deny();
    return;
  }
  c.credits -= price;
  c.stims++;
  sfx.stim();
  renderChar();
  restoreFocus('#btn-buy-stim');
}

// ------------------------------------------------------------------
// Navegação por controle (D-pad / analógico) em menus
// ------------------------------------------------------------------
const PANEL_ORDER = ['panel-implant', 'panel-end', 'panel-confirm', 'panel-ach', 'panel-opts', 'panel-help', 'panel-sync', 'panel-dead', 'panel-shop', 'panel-forge', 'panel-stash', 'panel-char', 'panel-pause', 'menu'];
function activePanel() {
  for (const id of PANEL_ORDER) {
    const el = $(id);
    if (!el.classList.contains('hidden')) return el;
  }
  return null;
}

function clearFocus() {
  if (focused) focused.classList.remove('gp-focus');
  focused = null;
}

function setFocus(el) {
  if (focused) focused.classList.remove('gp-focus');
  focused = el;
  if (!el) return;
  el.classList.add('gp-focus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (el.matches('.cell[data-swhere]') && G.lastInput === 'pad') stashSelect(el);
  else if (el.matches('.cell[data-uid]') && G.lastInput === 'pad') selectCell(el);
  if (el.matches('[data-node]') && G.lastInput === 'pad' && +el.dataset.node !== treeSel) {
    treeSel = +el.dataset.node;
    renderTree();
    restoreFocus(`[data-node="${treeSel}"]`);
  }
}

function navigables(root) {
  // botões desativados também recebem foco (só não fazem nada), para a navegação não "pular"
  return [...root.querySelectorAll('[data-nav]')].filter((el) => el.offsetParent !== null);
}

function moveFocus(dir, list) {
  if (!focused) return setFocus(list[0]);
  const a = focused.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bs = Infinity;
  const horiz = dir === 'left' || dir === 'right';
  for (const el of list) {
    if (el === focused) continue;
    const b = el.getBoundingClientRect();
    // prefere elementos na mesma linha (esquerda/direita) ou coluna (cima/baixo)
    const aligned = horiz ? b.bottom > a.top + 4 && b.top < a.bottom - 4 : b.right > a.left + 4 && b.left < a.right - 4;
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    let main;
    let cross;
    if (dir === 'right') { main = dx; cross = dy; }
    else if (dir === 'left') { main = -dx; cross = dy; }
    else if (dir === 'down') { main = dy; cross = dx; }
    else { main = -dy; cross = dx; }
    if (main <= 4) continue;
    const score = main + Math.abs(cross) * 2.2 + (aligned ? 0 : 5000);
    if (score < bs) {
      bs = score;
      best = el;
    }
  }
  if (best) {
    setFocus(best);
    sfx.click();
  }
}

export function uiPadUpdate() {
  const root = activePanel();
  if (root !== lastPanel) {
    lastPanel = root;
    if (focused) focused.classList.remove('gp-focus');
    clearFocus();
  }
  if (!root || G.lastInput !== 'pad') return;
  const list = navigables(root);
  if (!list.length) return;
  if (!focused || !list.includes(focused)) setFocus(list[0]);
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (!Input.nav(dir)) continue;
    if (focused && focused.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = +focused.step || 0.05;
      focused.value = Math.max(+focused.min, Math.min(+focused.max, +focused.value + (dir === 'right' ? step : -step)));
      focused.dispatchEvent(new Event('input'));
      continue;
    }
    moveFocus(dir, list);
  }
  if (Input.nav('a') && focused) {
    if (focused.matches('[data-node]')) {
      treeSpend(+focused.dataset.node);
    } else if (focused.matches('.cell[data-swhere]')) {
      stashMove(focused.dataset.swhere, focused.dataset.uid); // baú: guarda ou pega
    } else if (focused.matches('.cell[data-uid]')) {
      if (focused.dataset.where === 'inv') equipItem(focused.dataset.uid);
      else unequip(focused.dataset.slot);
    } else focused.click();
  }
  if (Input.nav('x') && focused && focused.matches('.cell[data-where="inv"]')) recycleItem(focused.dataset.uid);
  if (root.id === 'panel-stash') {
    if (Input.nav('x') && focused && focused.matches('.cell[data-swhere="stash"]')) stashEquip(focused.dataset.uid); // {X}: equipar do baú
    if (Input.nav('y')) stashPutMythics(); // {Y}: guardar todos os míticos
    if (Input.nav('lb')) stashSetTab(stashTab - 1); // {LB}/{RB}: aba anterior/próxima
    if (Input.nav('rb')) stashSetTab(stashTab + 1);
  }
  if (Input.nav('rt') && focused && focused.matches('.cell[data-where]')) {
    // {RT}: favoritar/desfavoritar o item sob o seletor
    const sel = focused.dataset.where === 'equip' ? `#equip-slots [data-eslot="${focused.dataset.slot}"]` : null;
    const idx = [...document.querySelectorAll('#inv-grid > .cell')].indexOf(focused);
    selectCell(focused);
    toggleFav(findItem(selected));
    if (sel) restoreFocus(sel);
    else focusInvCell(idx);
  }
  if (Input.nav('x') && focused && focused.matches('[data-node]')) treeCycleSlot(+focused.dataset.node);
  if (Input.nav('y') && root.id === 'panel-char' && currentTab === 'equip') recycleAll(); // {Y}: reciclar tudo
  else if ((Input.nav('y') || Input.nav('lb') || Input.nav('rb')) && root.id === 'panel-char') setTab(currentTab === 'equip' ? 'skills' : 'equip');
  if (Input.nav('b')) uiBack(root);
}

export function uiBack(root = activePanel()) {
  if (!root) return;
  switch (root.id) {
    case 'panel-end':
    case 'panel-implant':
      break; // o final só fecha pelos botões
    case 'panel-confirm':
    case 'panel-opts':
    case 'panel-help':
    case 'panel-sync':
      closeOverlay(root.id);
      break;
    case 'panel-ach':
      if (medalOpen()) closeMedal(); // o primeiro {B} fecha só a medalha grande
      else closeOverlay(root.id);
      break;
    case 'panel-char':
      closeChar();
      break;
    case 'panel-shop':
      closeShop();
      break;
    case 'panel-forge':
      closeForge();
      break;
    case 'panel-stash':
      closeStash();
      break;
    case 'panel-pause':
      closePause();
      break;
  }
}

export function anyOverlayOpen() {
  return ['panel-confirm', 'panel-opts', 'panel-help', 'panel-sync', 'panel-ach'].some((id) => !$(id).classList.contains('hidden'));
}

// ------------------------------------------------------------------
// Loja do mercador (Mercado Noturno)
// ------------------------------------------------------------------
let shopStock = null;
export function openShop(stock) {
  if (G.mode !== 'play' || !stock) return;
  refreshShopStock(stock, G.floor);
  shopStock = stock;
  G.mode = 'shop';
  $('panel-shop').classList.remove('hidden');
  clearFocus();
  sfx.rare();
  renderShop();
}

export function closeShop() {
  $('panel-shop').classList.add('hidden');
  if (G.mode === 'shop') G.mode = 'play';
  saveGame();
  Input.reset();
}

function renderShop() {
  const c = G.char;
  $('shop-credits').textContent = fmt(c.credits);
  const price = stimPrice();
  let html = `<div class="shop-row stim-row"><div><b>Stim</b> · ${L('cura 60% da vida', 'heals 60% health')} · ${c.stims}/${MAX_STIMS}</div>
    <button class="btn small" data-nav data-buy="stim" ${c.credits < price || c.stims >= MAX_STIMS ? 'disabled' : ''}>${price}¢</button></div>`;
  html += '<div class="shop-grid">';
  shopStock.forEach((it, k) => {
    const better = !it.sold && isUpgrade(it, c.equip);
    const tag = better ? `<div class="it-cmp" style="color:#39ff88">▲ ${L('Melhor que o equipado', 'Better than equipped')}</div>` : '';
    const btn = it.sold
      ? `<button class="btn small ghost" disabled>${L('Vendido', 'Sold')}</button>`
      : `<button class="btn small" data-nav data-buy="${k}" ${c.credits < it.price || c.inv.length >= INV_SIZE ? 'disabled' : ''}>${L('Comprar', 'Buy')} · ${fmt(it.price)}¢</button>`;
    html += `<div class="shop-item${better ? ' better-card' : ''}${it.sold ? ' sold' : ''}">${itemCardHtml(it, tag)}${btn}</div>`;
  });
  html += '</div>';
  $('shop-items').innerHTML = html;
  $('shop-items').querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => buy(b.dataset.buy)));
}

function buy(what) {
  const c = G.char;
  if (what === 'stim') {
    const price = stimPrice();
    if (c.credits < price || c.stims >= MAX_STIMS) return sfx.deny();
    c.credits -= price;
    c.stims++;
    sfx.stim();
  } else {
    const it = shopStock[+what];
    if (!it || it.sold || c.credits < it.price) return sfx.deny();
    if (c.inv.length >= INV_SIZE) return invFull();
    c.credits -= it.price;
    it.sold = true;
    const copy = { ...it };
    delete copy.price;
    delete copy.sold;
    c.inv.push(copy);
    achAdd('buys');
    sfx.coin();
    toast(`${L('Comprado', 'Bought')}: ${itemName(copy)}`);
  }
  renderShop();
  clearFocus();
}

// ------------------------------------------------------------------
// Ferreiro: aprimora o equipamento em uso por créditos
// ------------------------------------------------------------------
export function openForge() {
  if (G.mode !== 'play') return;
  G.mode = 'forge';
  $('panel-forge').classList.remove('hidden');
  clearFocus();
  sfx.forge(false);
  renderForge();
}

export function closeForge() {
  $('panel-forge').classList.add('hidden');
  if (G.mode === 'forge') G.mode = 'play';
  saveGame();
  Input.reset();
}

// atributo principal do item (dano da arma, blindagem ou o primeiro atributo)
function forgeMain(it) {
  if (it.slot === 'weapon') return `${fmt(it.wMin)}–${fmt(it.wMax)} ${L('de dano', 'damage')}`;
  if (it.armor) return `${fmt(it.armor)} ${L('de blindagem', 'armor')}`;
  const k = Object.keys(it.affixes)[0];
  return k ? AFFIXES[k].fmt(it.affixes[k]) : '';
}

function renderForge() {
  const c = G.char;
  $('forge-credits').textContent = fmt(c.credits);
  let html = '';
  for (const slot of SLOTS) {
    const it = c.equip[slot];
    if (!it) continue;
    const R = RARITY[it.rarity];
    const lv = it.plus | 0;
    const max = forgeMax(it);
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}${isMilestone(i + 1) ? ' ms' : ''}"></i>`).join('');
    let next;
    let btn;
    if (lv >= max) {
      next = `<span class="fr-max">★ ${L('Aprimoramento máximo', 'Fully upgraded')}</span>`;
      btn = `<button class="btn small ghost" disabled>${L('Máximo', 'Maxed')}</button>`;
    } else {
      const sim = JSON.parse(JSON.stringify(it));
      forgeItem(sim);
      const cost = forgeCost(it);
      next = `${forgeMain(it)} → <b>${forgeMain(sim)}</b> · ${L('atributos', 'stats')} +2,5%`;
      if (isMilestone(lv + 1)) next += ` · <span class="fr-ms">★ ${L('marco: atributo novo', 'milestone: new stat')}</span>`;
      btn = `<button class="btn small" data-nav data-forge="${slot}" ${c.credits < cost ? 'disabled' : ''}>⚒ ${fmt(cost)}¢</button>`;
    }
    html += `<div class="forge-row">
      <div class="cell r${it.rarity}">${slotIconSvg(slot)}</div>
      <div class="fr-info">
        <div class="fr-name" style="color:${R.color}">${itemName(it)}</div>
        <div class="fr-pips">${pips}<span>+${lv}/${max}</span></div>
        <div class="fr-next">${next}</div>
      </div>
      ${btn}
    </div>`;
  }
  $('forge-items').innerHTML = html;
  $('forge-items').querySelectorAll('[data-forge]').forEach((b) => (b.onclick = () => doForge(b.dataset.forge)));
}

function doForge(slot) {
  const c = G.char;
  const it = c.equip[slot];
  if (!it || (it.plus | 0) >= forgeMax(it)) return sfx.deny();
  const cost = forgeCost(it);
  if (c.credits < cost) return sfx.deny();
  c.credits -= cost;
  const gained = forgeItem(it);
  const ms = isMilestone(it.plus);
  sfx.forge(ms);
  achAdd('forges');
  if (it.plus >= forgeMax(it)) achAdd('forgeMax');
  refreshStats();
  const p = G.player;
  if (p) burst(p.x, 1, p.z, 0xffb04d, ms ? 30 : 14, 4, 0.05, 0.5, { up: 1.5 });
  toast(`⚒ <span style="color:${RARITY[it.rarity].color}">${itemName(it)}</span>${gained ? `<br><small>★ ${AFFIXES[gained].fmt(it.affixes[gained])}</small>` : ''}`, ms ? 'up' : 'item');
  saveGame();
  renderForge();
  // mantém o foco do controle no mesmo botão
  const again = $('forge-items').querySelector(`[data-forge="${slot}"]`) || $('forge-items').querySelectorAll('[data-forge]')[0] || $('forge-close');
  if (G.lastInput === 'pad' && again) setFocus(again);
}

// ------------------------------------------------------------------
// Baú compartilhado: até 500 itens para todos os personagens (fica no save, fora do personagem).
// É uma lista só, sempre ordenada do melhor para o pior e mostrada em 5 abas de 100.
// Cada item guardado leva `st` (quando entrou) e cada retirada fica em save.stashOut[uid],
// para a sincronização na nuvem não duplicar nem perder itens (ver mergeStash em sync.js).
// ------------------------------------------------------------------
export const STASH_TAB = 100;
export const STASH_TABS = 5;
export const STASH_SIZE = STASH_TAB * STASH_TABS;
let stashSel = null; // { where: 'stash'|'sinv', uid }
let stashTab = 0;
const stashList = () => G.save.stash || (G.save.stash = []);
// arma de outra classe: pode ser guardada, mas só a classe dela pode pegar
const otherClassWeapon = (it) => it.slot === 'weapon' && it.cls && it.cls !== G.char.cls;
const onlyClassMsg = (it) => L(`Só quem é ${CLASSES[it.cls].name} pode pegar esta arma.`, `Only a ${CLASSES[it.cls].name} can take this weapon.`);

export function openStash() {
  if (G.mode !== 'play') return;
  G.mode = 'stash';
  G.save.stashSeen = true;
  stashSel = null;
  stashTab = 0;
  $('panel-stash').classList.remove('hidden');
  clearFocus();
  sfx.pickup();
  renderStash();
}

export function closeStash() {
  $('panel-stash').classList.add('hidden');
  if (G.mode === 'stash') G.mode = 'play';
  stashSel = null;
  saveGame();
  Input.reset();
}

// Para quais personagens o item é melhor que o equipado (o baú é de todos): o atual primeiro.
// Armas só contam para a classe delas.
function betterFor(it) {
  const out = [];
  const cur = G.char.cls;
  for (const cls of [cur, ...CLASS_ORDER.filter((k) => k !== cur)]) {
    const ch = cls === cur ? G.char : G.save.slots[cls];
    if (!ch || !ch.equip) continue;
    if (it.slot === 'weapon' && it.cls && it.cls !== cls) continue;
    // outros personagens só contam se já têm algo naquele espaço: espaço vazio (personagem novo) marcaria quase tudo
    if (cls !== cur && !ch.equip[it.slot]) continue;
    if (isUpgrade(it, ch.equip)) out.push(cls);
  }
  return out;
}

function stashCell(it, where) {
  if (!it) return '<div class="cell empty" data-nav></div>';
  const lock = otherClassWeapon(it);
  const bf = betterFor(it);
  const better = bf[0] === G.char.cls;
  const sel = stashSel && stashSel.uid === it.uid ? ' sel' : '';
  const tag = lock ? `<span class="cls-dot" style="background:${CLASSES[it.cls].css}"></span>` : '';
  // ▲ só para o personagem atual: personagens mais fracos marcavam quase tudo e confundia.
  // Quem mais ganha com o item aparece nos detalhes (e no title).
  const up = better ? '<span class="up">▲</span>' : '';
  const tip = bf.length ? ` title="${L('Melhor que o equipado de', 'Better than what is equipped on')}: ${bf.map((k) => CLASSES[k].name).join(', ')}"` : '';
  return `<div class="cell r${it.rarity}${sel}${better ? ' better' : ''}${lock ? ' locked' : ''}" data-nav data-uid="${it.uid}" data-swhere="${where}"${tip}>${slotIconSvg(it.slot)}${up}${favMark(it)}${tag}</div>`;
}

// Ordena o baú do melhor para o pior para o personagem atual: melhorias primeiro, depois raridade
// e pontuação (sem o aprimoramento do ferreiro, como na comparação)
function sortStash() {
  const c = G.char;
  const st = stashList();
  const key = new Map(st.map((it) => [it, { up: !otherClassWeapon(it) && isUpgrade(it, c.equip) ? 1 : 0, s: itemScore(unforged(it)) }]));
  st.sort((a, b) => key.get(b).up - key.get(a).up || b.rarity - a.rarity || key.get(b).s - key.get(a).s);
}

// aba onde está o item (para mostrar o que acabou de entrar no baú)
const stashTabOf = (uid) => {
  const i = stashList().findIndex((x) => x.uid === uid);
  return i < 0 ? stashTab : Math.floor(i / STASH_TAB);
};

function stashSetTab(t) {
  t = (t + STASH_TABS) % STASH_TABS;
  if (t === stashTab) return;
  stashTab = t;
  sfx.click();
  renderStash();
  if (G.lastInput === 'pad') restoreFocus(`[data-stab="${t}"]`);
}

function renderStash() {
  const c = G.char;
  const st = stashList();
  sortInventory(c.inv, c.equip);
  sortStash();
  // itens além das 5 abas (save antigo/sincronização) aparecem na última
  const from = stashTab * STASH_TAB;
  const to = stashTab === STASH_TABS - 1 ? Math.max(from + STASH_TAB, st.length) : from + STASH_TAB;
  let a = '';
  for (let i = from; i < to; i++) a += stashCell(st[i], 'stash');
  $('stash-grid').innerHTML = a;
  let tabs = '';
  for (let t = 0; t < STASH_TABS; t++) {
    const n = Math.max(0, Math.min(STASH_TAB, st.length - t * STASH_TAB));
    tabs += `<button class="btn small stash-tab${t === stashTab ? ' on' : ''}" data-nav data-stab="${t}" title="${L('Aba', 'Tab')} ${t + 1}: ${n}/${STASH_TAB}">${t + 1}<small>${n}</small></button>`;
  }
  $('stash-tabs').innerHTML = tabs;
  let b = '';
  for (let i = 0; i < INV_SIZE; i++) b += stashCell(c.inv[i], 'sinv');
  $('stash-inv').innerHTML = b;
  // quantos itens do baú são melhores que o equipado do personagem atual
  const ups = st.filter((it) => !otherClassWeapon(it) && isUpgrade(it, c.equip)).length;
  $('stash-count').innerHTML = (ups ? `<span class="stash-ups">▲ ${ups} ${ups === 1 ? L('melhor', 'upgrade') : L('melhores', 'upgrades')}</span> ` : '') + `${st.length}/${STASH_SIZE}`;
  $('stash-inv-count').textContent = `${c.inv.length}/${INV_SIZE}`;
  const nm = c.inv.filter((it) => it.rarity >= MYTHIC).length;
  const pm = $('stash-put-myth');
  pm.innerHTML = `✦ ${G.isTouch ? L('Guardar míticos', 'Store mythics') : L('Guardar todos os míticos', 'Store all mythics')}${nm ? ` (${nm})` : ''}${padKey('y')}`;
  pm.disabled = !nm || st.length >= STASH_SIZE;
  pm.title = L('Manda todos os itens míticos (e divinos) do inventário para o baú', 'Sends every mythic (and divine) item in your inventory to the stash');
  renderStashDetail();
}

// Ícone do botão do controle dentro de um botão da tela (só aparece com controle conectado: body.pad / body.padc)
const padKey = (k) => `<span class="kg">${glyph(k)}</span>`;

// Guarda todos os míticos do inventário no baú (até encher)
function stashPutMythics() {
  const c = G.char;
  const st = stashList();
  const mys = c.inv.filter((it) => it.rarity >= MYTHIC);
  if (!mys.length) return sfx.deny();
  const room = STASH_SIZE - st.length;
  if (room <= 0) {
    sfx.deny();
    toast(L(`O baú está cheio (${STASH_SIZE} itens).`, `The stash is full (${STASH_SIZE} items).`), 'warn');
    return;
  }
  const moving = mys.slice(0, room);
  const now = Date.now();
  for (const it of moving) {
    c.inv.splice(c.inv.indexOf(it), 1);
    it.st = now;
    st.push(it);
  }
  sfx.pickup();
  const left = mys.length - moving.length;
  toast(`📦 ${L(`${moving.length} ${moving.length === 1 ? 'mítico guardado' : 'míticos guardados'} no baú`, `${moving.length} ${moving.length === 1 ? 'mythic' : 'mythics'} stored in the stash`)}` + (left ? `<br><small>${L(`O baú encheu: ${left} ficaram no inventário.`, `The stash is full: ${left} stayed in your inventory.`)}</small>` : ''), 'item');
  if (stashSel && stashSel.where === 'sinv' && moving.some((it) => it.uid === stashSel.uid)) stashSel = null;
  saveGame();
  renderStash();
}

function stashFind(sel) {
  if (!sel) return null;
  return (sel.where === 'stash' ? stashList() : G.char.inv).find((i) => i.uid === sel.uid) || null;
}

function stashSelect(cell) {
  stashSel = { where: cell.dataset.swhere, uid: cell.dataset.uid };
  document.querySelectorAll('#panel-stash .cell.sel').forEach((x) => x.classList.remove('sel'));
  cell.classList.add('sel');
  renderStashDetail();
}

function renderStashDetail() {
  const el = $('stash-detail');
  const it = stashFind(stashSel);
  if (!it) {
    el.innerHTML = `<div class="empty-detail">${L('Os itens guardados aqui ficam para <b>todos os seus personagens</b>.<br><br>Clique duas vezes (ou {A} no controle) para guardar ou pegar.<br><br><b>Equipar</b> veste o item direto do baú, e o que você usava vai para o lugar dele.', 'Items stored here are shared by <b>all your characters</b>.<br><br>Double-click (or {A} on a gamepad) to store or take.<br><br><b>Equip</b> wears the item straight from the stash, and what you had on takes its place.').replace(/\{A\}/g, glyph('a'))}</div>`;
    return;
  }
  const c = G.char;
  const lock = otherClassWeapon(it);
  let btn;
  let hint = ''; // legenda do que cada botão faz
  if (stashSel.where === 'sinv') {
    const full = stashList().length >= STASH_SIZE;
    btn = `<button class="btn small" data-nav data-sact="put" ${full ? 'disabled' : ''}>📦 ${L('Guardar no baú', 'Store in stash')}${padKey('a')}</button>`;
    hint = `<b>📦 ${L('Guardar', 'Store')}:</b> ${full ? L(`o baú está cheio (${STASH_SIZE} itens).`, `the stash is full (${STASH_SIZE} items).`) : L('manda o item para o baú, onde todos os seus personagens podem pegar.', 'sends the item to the stash, where all your characters can take it.')}`;
  } else if (lock) btn = `<button class="btn small" disabled>🔒 ${CLASSES[it.cls].name}</button>`;
  else {
    // equipar direto do baú: o item equipado agora vai para o lugar dele no baú (funciona com o inventário cheio)
    const old = c.equip[it.slot];
    const full = c.inv.length >= INV_SIZE;
    btn = `<button class="btn small" data-nav data-sact="equip">${old ? '⇄ ' : ''}${L('Equipar', 'Equip')}${padKey('x')}</button>`;
    btn += `<button class="btn small" data-nav data-sact="take" ${full ? 'disabled' : ''}>${L('Pegar', 'Take')}${padKey('a')}</button>`;
    hint = `<div><b>${old ? '⇄ ' : ''}${L('Equipar', 'Equip')}:</b> ${old ? L(`veste este item agora; o seu <span style="color:${RARITY[old.rarity].color}">${itemName(old)}</span> vai para o lugar dele no baú.`, `wears this item now; your <span style="color:${RARITY[old.rarity].color}">${itemName(old)}</span> goes into its place in the stash.`) : L('veste este item agora.', 'wears this item now.')}</div>`;
    hint += `<div><b>${L('Pegar', 'Take')}:</b> ${full ? L(`seu inventário está cheio (${INV_SIZE}/${INV_SIZE}); use Equipar ou libere espaço.`, `your inventory is full (${INV_SIZE}/${INV_SIZE}); use Equip or free up space.`) : L('leva o item para o seu inventário.', 'moves the item to your inventory.')}</div>`;
  }
  if (hint) btn += `<div class="sact-hint">${hint}</div>`;
  const bf = betterFor(it);
  const note = (lock ? `<div class="it-cmp">${onlyClassMsg(it)}</div>` : '') + (bf.length ? `<div class="it-cmp better-for">▲ ${L('Melhor que o equipado de', 'Better than what is equipped on')}: ${bf.map((k) => `<b style="color:${CLASSES[k].css}">${CLASSES[k].name}</b>`).join(', ')}</div>` : '');
  const cur = lock ? null : c.equip[it.slot];
  // o botão vem antes do cartão: no celular deitado ele fica sempre à vista
  el.innerHTML = `<div class="detail-actions">${btn}</div>` + note + itemCardHtml(it, cur ? itemDiffHtml(it, cur) : '', { base: !!cur });
  el.querySelectorAll('[data-sact]').forEach((b) => (b.onclick = () => (b.dataset.sact === 'equip' ? stashEquip(it.uid) : stashMove(stashSel.where, it.uid))));
}

// Equipa um item do baú; o que estava equipado ocupa a mesma casa no baú
function stashEquip(uid) {
  const c = G.char;
  const st = stashList();
  const idx = st.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  const it = st[idx];
  if (otherClassWeapon(it)) {
    sfx.deny();
    toast(onlyClassMsg(it), 'warn');
    return;
  }
  const old = c.equip[it.slot];
  delete it.st;
  if (!G.save.stashOut) G.save.stashOut = {};
  G.save.stashOut[uid] = Date.now();
  c.equip[it.slot] = it;
  if (old) {
    old.st = Date.now();
    st.splice(idx, 1, old);
  } else st.splice(idx, 1);
  refreshStats();
  sfx.pickup();
  const name = (x) => `<span style="color:${RARITY[x.rarity].color}">${itemName(x)}</span>`;
  toast(`${L('Equipado', 'Equipped')}: ${name(it)}` + (old ? `<br><small>📦 ${name(old)} ${L('foi para o baú', 'went to the stash')}</small>` : ''), 'item');
  // seleciona o item trocado, para dar para desfazer na hora
  stashSel = old ? { where: 'stash', uid: old.uid } : null;
  saveGame();
  if (old) {
    sortStash();
    stashTab = stashTabOf(old.uid);
  }
  renderStash();
  const cell = old ? document.querySelector(`#stash-grid > .cell[data-uid="${old.uid}"]`) : document.querySelectorAll('#stash-grid > .cell')[idx % STASH_TAB];
  if (G.lastInput === 'pad' && cell) restoreFocus(cell);
  else clearFocus();
}

// where: de onde o item sai ('stash' = do baú para o inventário, 'sinv' = do inventário para o baú)
function stashMove(where, uid) {
  const c = G.char;
  const st = stashList();
  const from = where === 'stash' ? st : c.inv;
  const idx = from.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  const it = from[idx];
  if (where === 'stash') {
    if (otherClassWeapon(it)) {
      sfx.deny();
      toast(onlyClassMsg(it), 'warn');
      return;
    }
    if (c.inv.length >= INV_SIZE) return invFull();
    st.splice(idx, 1);
    delete it.st;
    if (!G.save.stashOut) G.save.stashOut = {};
    G.save.stashOut[uid] = Date.now();
    c.inv.push(it);
  } else {
    if (st.length >= STASH_SIZE) {
      sfx.deny();
      toast(L(`O baú está cheio (${STASH_SIZE} itens).`, `The stash is full (${STASH_SIZE} items).`), 'warn');
      return;
    }
    c.inv.splice(idx, 1);
    it.st = Date.now();
    st.push(it);
  }
  sfx.pickup();
  stashSel = null;
  saveGame();
  renderStash();
  // controle: o seletor fica na mesma casa
  const cells = document.querySelectorAll(where === 'stash' ? '#stash-grid > .cell' : '#stash-inv > .cell');
  const ci = where === 'stash' ? idx - stashTab * STASH_TAB : idx;
  if (G.lastInput === 'pad' && cells.length) restoreFocus(cells[Math.max(0, Math.min(ci, cells.length - 1))]);
  else clearFocus();
}

// ------------------------------------------------------------------
// Celular: tela cheia e orientação horizontal
// ------------------------------------------------------------------
// Desktop: tela cheia ao entrar no jogo. Prende o Esc (Chrome/Edge) para ele continuar
// pausando; para sair segura Esc. Se o jogador sair da tela cheia, não força de novo.
let fullOptOut = false;
function lockEsc() {
  try {
    const p = navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock(['Escape']);
    if (p && p.catch) p.catch(() => {});
  } catch (_) {}
}
export function enterDesktopFullscreen(force) {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen || (fullOptOut && !force)) return;
  el.requestFullscreen({ navigationUI: 'hide' }).then(lockEsc).catch(() => {});
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !G.isTouch) fullOptOut = true;
});

// Precisa ser chamado dentro de um toque/clique (exigência dos navegadores)
export function enterMobileFullscreen() {
  if (!G.isTouch) return enterDesktopFullscreen();
  mobileFullOptOut = false;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const lock = () => {
    try {
      const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  };
  if (!document.fullscreenElement && !document.webkitFullscreenElement && req) {
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(lock).catch(() => {});
      else lock();
    } catch (_) {}
  } else lock();
}

// Mobile: o navegador sai da tela cheia quando o celular fica em pé ou o jogador troca de app.
// Como a tela cheia só pode ser pedida num toque, volta a ela no próximo toque durante o jogo
// (a não ser que o jogador tenha desligado pela opção Tela cheia).
let mobileFullOptOut = false;
function refullOnTouch(e) {
  if (e.target && e.target.closest && e.target.closest('#opt-full')) return; // o próprio botão decide
  if (!G.isTouch || mobileFullOptOut || G.mode === 'menu' || G.mode === 'boot') return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return; // iPhone não tem
  if (innerHeight > innerWidth * 1.05) return; // em pé: espera virar
  enterMobileFullscreen();
}
addEventListener('touchend', refullOnTouch, { capture: true, passive: true });

// Mostra o aviso de "gire o celular" e pausa o jogo quando estiver em pé
let wasPortrait = false;
export function updateOrientation() {
  const portrait = G.isTouch && innerHeight > innerWidth * 1.05;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('ingame', G.mode !== 'menu' && G.mode !== 'boot');
  document.body.classList.toggle('ios', /iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
  if (portrait && G.mode === 'play') openPause();
  wasPortrait = portrait;
}
