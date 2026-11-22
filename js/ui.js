// Interface: HUD, menus, inventário, minimapa e navegação por controle.
import { G } from './state.js';
import * as THREE from 'three';
import { Input, bindTouchButton } from './input.js';
import { CLASSES, CLASS_ORDER, iconSvg, rankMult, MAX_RANK } from './classes.js';
import { SLOTS, SLOT_NAMES, RARITY, MYTHIC, LEGENDARIES, MYTHICS, DIVINES, DIV_SET, PRIMORDIALS, PRIM_SET, itemCardHtml, itemDiffHtml, sortInventory, itemScore, recycleValue, slotIconSvg } from './items.js';
import { xpNeeded, SP_PER_LEVEL, refreshStats, skillCost, skillCd, stimPrice, MAX_STIMS, respawn, MAX_LEVEL, spendPoint, assignSlot, refundSkill } from './player.js';
import { SHRINES } from './loot.js';
import { DIFFICULTY, DIFF_ORDER, setDifficulty, rewardK, rewardRamping, setAbyss, abyssLvl, abyssUnlocked, abyssName, abyssColor, ABYSS_RULES, ABYSS_MAX, ABYSS_NUM } from './enemies.js';
import { sfx, applyVolumes, initAudio, trackNames, applyTrack, playAnthem } from './audio.js';
import { skipFinale } from './finale.js';
import { backupsOf, restoreBackup, backupId } from './backup.js';
import { startGame, quitToMenu, saveGame, saveSettings, applyQuality, replayFinal, startTier, debugEvent } from './main.js';
import { fmt, fmtPlay, short } from './utils.js';
import { L, t } from './i18n.js';
import { glyph, glyphText, padText, padName } from './padglyphs.js';
import { refreshShopStock } from './biomes.js';
import { itemName, isUpgrade, unforged, AFFIXES, forgeItem, forgeCost, forgeMax, isMilestone } from './items.js';
import { sync, syncAuthRedirect, syncNow, syncSignOut, syncBoxHtml } from './sync.js';
import { achAdd, achList, achProgress, playTotal, devId, TIERS as MEDAL_TIERS } from './ach.js';
import { runHud, implantSummary, tierOf, TIERS as MODES, MAX_TIER, armorTaken } from './run.js';
import { mythHud } from './mythic.js';
import { burst } from './fx.js';
import { GEMS, GEM_KEYS, GEM_TIERS, GEM_TOP, TIER_ROMAN, gemSvg, gemName, gemTierName, gemEffectText, gemCount, gemTotal, gemMods, slotGems, slotSockets, freeSockets, fusableCount, fuseCost, fuseAllCost, fuseGem, fuseAll, socketGem, unsocketGem, addGem, bestInPouch, GEM_POW, GEM_NEON, gemPowers, gemPowLvl, gemPowName } from './gems.js';
import { PFMT } from './classes.js';
import { drawEventMarks, eventArrows, EVENT_KINDS, EVENT_INFO } from './events.js';

const $ = (id) => document.getElementById(id);
let selected = null; // { where: 'inv'|'equip', uid, slot }
let focused = null;
let lastPanel = null;
let aHoldOk = false; // segurar {A} só repete enquanto a ação continua dando certo
let aHoldEl = ''; // e só no mesmo item (não pula para o próximo ao chegar no máximo)

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
  $('btn-recycle-filter').onclick = openRecycleFilter;
  $('rf-yes').onclick = () => {
    recycleAll();
    renderRecycleFilter();
  };
  $('rf-no').onclick = closeRecycleFilter;
  $('btn-fuse-all').onclick = gemFuseAll;

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
  $('menu-backup').onclick = () => openBackups();
  $('backup-close').onclick = () => closeOverlay('panel-backup');
  $('backup-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bk-id]');
    if (b) askRestore(b.dataset.bk, b.dataset.bkId);
  });
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
  $('ach-search').addEventListener('input', filterAch);
  $('ach-search').addEventListener('keydown', (e) => {
    // Esc com texto só limpa a busca (sem texto, fecha o painel como sempre); Enter fecha o teclado do celular
    if (e.code === 'Escape' && e.target.value) {
      e.preventDefault();
      e.stopPropagation();
      e.target.value = '';
      filterAch();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') e.target.blur();
  });
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
  // modo debug (?debug na URL): botão na pausa que abre a lista de eventos
  if (new URLSearchParams(location.search).has('debug')) {
    $('pause-debug').classList.remove('hidden');
    $('pause-debug').onclick = () => {
      $('debug-list').innerHTML = EVENT_KINDS.map((k) => `<button class="btn ghost" data-nav data-dbg-ev="${k}">${EVENT_INFO[k].icon} ${EVENT_INFO[k].name}</button>`).join('');
      openOverlay('panel-debug');
    };
    $('debug-close').onclick = () => closeOverlay('panel-debug');
    $('debug-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dbg-ev]');
      if (!b) return;
      closeOverlay('panel-debug');
      closePause();
      if (!debugEvent(b.dataset.dbgEv)) toast(L('Esse evento não coube em nenhum andar próximo.', 'That event did not fit on any nearby floor.'), 'warn');
    });
  }
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
  // saindo da tela de fim, a música-tema do final verdadeiro dá lugar à trilha normal
  $('end-menu').onclick = () => {
    $('panel-end').classList.add('hidden');
    playAnthem(false);
    quitToMenu();
  };
  $('end-replay').onclick = () => {
    $('panel-end').classList.add('hidden');
    playAnthem(false);
    replayFinal();
  };
  $('end-tier').onclick = () => {
    $('panel-end').classList.add('hidden');
    playAnthem(false);
    startTier(Math.min(MAX_TIER, (G.char.tier | 0) + 1));
  };
  $('finale-skip').onclick = () => skipFinale();
  $('shop-close').onclick = () => closeShop();
  $('forge-close').onclick = () => closeForge();
  $('stash-close').onclick = () => closeStash();
  $('stash-put-myth').onclick = () => stashPutMythics();
  $('stash-bank').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bank]');
    if (b && !b.disabled) bankAction(b.dataset.bank);
  });
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
  // Abismo: − / barra / + (segurar o − ou o + repete, de 5 em 5 depois de ~2s; a barra vai direto ao nível)
  const range = $('abyss-range');
  range.max = String(ABYSS_MAX);
  range.oninput = () => applyAbyss(+range.value);
  const abBtn = (id, d) => {
    const b = $(id);
    let t1 = 0;
    let t2 = 0;
    const stop = () => {
      clearTimeout(t1);
      clearInterval(t2);
    };
    b.addEventListener('pointerdown', (ev) => {
      if (ev.button) return;
      stop();
      applyAbyss(abyssLvl() + d);
      let reps = 0;
      t1 = setTimeout(() => (t2 = setInterval(() => applyAbyss(abyssLvl() + d * (++reps > 25 ? 5 : 1)), 70)), 420);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    // teclado (Enter/Espaço): o clique vem sem ponteiro (detail 0)
    b.onclick = (ev) => {
      if (ev.detail === 0) applyAbyss(abyssLvl() + d);
      ev.currentTarget.blur();
    };
  };
  abBtn('abyss-dn', -1);
  abBtn('abyss-up', 1);
  $('opt-abyss').onclick = () => applyAbyss((abyssLvl() + 1) % (abyssUnlocked() + 1));
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
  $('opt-full').onclick = toggleFullscreen;
  // desktop: botão pequeno de tela cheia no menu principal e no HUD
  $('menu-full').onclick = $('btn-full').onclick = (e) => {
    toggleFullscreen();
    e.currentTarget.blur(); // espaço/enter voltam para o jogo
  };
  syncFullIcon();

  // botões de toque
  bindTouchButton($('tb-primary'), 'primary');
  bindTouchButton($('tb-s1'), 's1');
  bindTouchButton($('tb-s2'), 's2');
  bindTouchButton($('tb-s3'), 's3');
  bindTouchButton($('tb-s4'), 's4');
  bindTouchButton($('tb-s5'), 's5');
  bindTouchButton($('tb-s6'), 's6');
  bindTouchButton($('tb-s7'), 's7');
  bindTouchButton($('tb-stim'), 'stim');
  bindTouchButton($('interact'), 'interact');
  $('tb-stim').querySelector('.icon').innerHTML = iconSvg('stim');
  $('skstim').querySelector('.icon').innerHTML = iconSvg('stim');

  // cliques nos itens (delegação)
  $('panel-char').addEventListener('click', onCharClick);
  $('panel-char').addEventListener('dblclick', onCharDblClick);

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

// dificuldade salva no personagem (cartão da classe)
function charDiffTag(c) {
  const k = DIFFICULTY[c.diff] ? c.diff : null;
  if (!k) return '';
  const ab = k === 'death' ? c.abyss | 0 : 0;
  const col = ab ? abyssColor(ab) : DIFF_COLORS[Math.max(0, DIFF_ORDER.indexOf(k))];
  return ` · <span class="nowrap" style="color:${col}" title="${L('Dificuldade', 'Difficulty')}">${ab ? '🕳️ ' + abyssName(ab) : '⚔ ' + DIFFICULTY[k].name}</span>`;
}

export function renderClassCards() {
  const root = $('class-cards');
  root.innerHTML = '';
  for (const id of CLASS_ORDER) {
    const C = CLASSES[id];
    const save = G.save.slots[id];
    const card = document.createElement('div');
    const lastPlayed = !!save && G.settings.lastClass === id;
    card.className = lastPlayed ? 'ccard last-played' : 'ccard';
    card.style.setProperty('--c', C.css);
    card.innerHTML = `
      <div class="cname">${C.name.toUpperCase()}</div>
      <div class="ctitle">${C.title}</div>
      <div class="cdesc">${C.desc}</div>
      <div class="cskills">${C.skills.filter((s) => !s.passive).map((s) => `<div title="${s.name}">${iconSvg(s.icon)}</div>`).join('')}</div>
      <div class="csave">${save ? L(`Nível <b>${save.level}</b> · Andar <b>${save.floor}</b> · ${save.kills || 0} abates`, `Level <b>${save.level}</b> · Floor <b>${save.floor}</b> · ${save.kills || 0} kills`) + (save ? ` · <span class="nowrap" title="${L('Tempo de jogo', 'Play time')}">⏱ ${fmtPlay(save.playTime)}</span>` : '') + (save.wins ? ` · <span title="${L('Venceu o jogo', 'Beat the game')}">🏆${save.wins > 1 ? '×' + save.wins : ''}</span>` : '') + ((save.bestTier | 0) > MAX_TIER ? ` · <span class="nowrap" style="color:#ffd23d" title="${L('Venceu o Inferno: final verdadeiro', 'Beat the Inferno: true ending')}">👑 ${L('Lenda', 'Legend')}</span>` : '') + (save.tier ? ` · <span class="nowrap" style="color:${MODES[Math.min(MAX_TIER, save.tier)].css}">${MODES[Math.min(MAX_TIER, save.tier)].icon} ${MODES[Math.min(MAX_TIER, save.tier)].name}</span>` : '') + charDiffTag(save) : L('Novo personagem', 'New character')}</div>
      ${lastPlayed ? `<div class="clast">● ${L('Última jogada', 'Last played')}</div>` : ''}
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
    const old = G.save.slots[id];
    const what = old ? L(` (nível ${old.level}, andar ${old.floor})`, ` (level ${old.level}, floor ${old.floor})`) : '';
    confirmDialog(
      L('Recomeçar do zero?', 'Start over from scratch?'),
      L(`${CLASSES[id].name}${what} volta para o nível 1. Uma cópia fica em 🛟 Backups, no menu, e dá para restaurar quando quiser.`, `${CLASSES[id].name}${what} goes back to level 1. A copy is kept in 🛟 Backups, in the menu, and you can restore it anytime.`),
      () => {
        $('menu').classList.add('hidden');
        startGame(id, true);
      },
      { wait: 2, yes: L('Recomeçar', 'Start over') },
    );
  }));
}

// Cancelar é sempre o padrão (o seletor do controle começa nele) e o "Sim" ignora cliques logo
// depois de abrir (toque duplo ou {A} repetido não confirmam sem querer).
// opts.wait: segundos com o "Sim" desativado (contagem no botão); opts.yes: texto do "Sim"
let confirmAt = 0;
let confirmTimer = null;
export function confirmDialog(title, text, onYes, opts = {}) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  confirmBack = focused; // ao fechar, o seletor volta para onde estava
  const yes = $('confirm-yes');
  const label = opts.yes || L('Sim', 'Yes');
  let left = opts.wait | 0;
  const tick = () => {
    yes.disabled = left > 0;
    yes.textContent = left > 0 ? `${label} (${left})` : label;
  };
  clearInterval(confirmTimer);
  tick();
  if (left > 0) {
    confirmTimer = setInterval(() => {
      left--;
      tick();
      if (left <= 0) clearInterval(confirmTimer);
    }, 1000);
  }
  yes.onclick = () => {
    if (yes.disabled || performance.now() - confirmAt < 450) return;
    clearInterval(confirmTimer);
    closeOverlay('panel-confirm');
    onYes();
  };
  openOverlay('panel-confirm');
  confirmAt = performance.now();
  setFocus($('confirm-no'));
}

// ------------------------------------------------------------------
// Backups dos personagens (backup.js)
// ------------------------------------------------------------------
function openBackups() {
  renderBackups();
  openOverlay('panel-backup');
}

// atualiza o painel se ele estiver aberto (a nuvem trouxe backups novos)
export function refreshBackups() {
  if ($('panel-backup').classList.contains('hidden')) return;
  const sel = focused && focused.dataset.bkId ? `[data-bk-id="${focused.dataset.bkId}"]` : null;
  renderBackups();
  if (sel && G.lastInput === 'pad') restoreFocus(document.querySelector(sel) || $('backup-close'));
}

function bkWhen(at) {
  const m = Math.floor((Date.now() - at) / 60000);
  const d = new Date(at);
  const hm = d.toLocaleTimeString(L('pt-BR', 'en-US'), { hour: '2-digit', minute: '2-digit' });
  if (m < 1) return L('agora', 'just now');
  if (m < 60) return L(`há ${m} min`, `${m} min ago`);
  if (d.toDateString() === new Date().toDateString()) return L(`hoje, ${hm}`, `today, ${hm}`);
  return `${d.toLocaleDateString(L('pt-BR', 'en-US'), { day: '2-digit', month: '2-digit' })}, ${hm}`;
}

function bkLine(c) {
  const t = c.tier ? MODES[Math.min(MAX_TIER, c.tier)] : null;
  return L(`Nível <b>${c.level}</b> · Andar <b>${c.floor}</b> · ${fmt(c.kills || 0)} abates`, `Level <b>${c.level}</b> · Floor <b>${c.floor}</b> · ${fmt(c.kills || 0)} kills`) + ` · <span class="nowrap">⏱ ${fmtPlay(c.playTime)}</span>` + (t ? ` · <span class="nowrap" style="color:${t.css}">${t.icon} ${t.name}</span>` : '');
}

function bkKind(e, list) {
  if (e.kind === 'auto') {
    const autos = list.filter((x) => x.kind === 'auto');
    return autos[0] === e ? L('💾 Automático · recente', '💾 Automatic · latest') : L('💾 Automático · anterior', '💾 Automatic · previous');
  }
  if (e.kind === 'reset') return e.from === 'sync' ? L('↺ Antes do recomeço (outro aparelho)', '↺ Before starting over (other device)') : L('↺ Antes do recomeço', '↺ Before starting over');
  return L('⟲ Antes de restaurar', '⟲ Before restoring');
}

function renderBackups() {
  const last = G.settings.lastClass;
  const order = [...CLASS_ORDER].sort((a, b) => (b === last) - (a === last));
  let h = '';
  for (const cls of order) {
    const list = backupsOf(cls);
    if (!list.length) continue;
    const C = CLASSES[cls];
    const cur = G.save.slots[cls];
    h += `<div class="bk-class" style="--c:${C.css}">
      <div class="bk-head"><b>${C.name.toUpperCase()}</b><span>${cur ? L('Atual: ', 'Current: ') + bkLine(cur) : L('Sem personagem agora', 'No character right now')}</span></div>`;
    for (const e of list) {
      h += `<div class="bk-row">
        <div class="bk-info"><div class="bk-kind">${bkKind(e, list)} <small>· ${bkWhen(e.at)}</small></div><div class="bk-stats">${bkLine(e.char)}</div></div>
        <button class="btn small" data-nav data-bk="${cls}" data-bk-id="${backupId(e)}">${L('Restaurar', 'Restore')}</button>
      </div>`;
    }
    h += '</div>';
  }
  $('backup-list').innerHTML = h || `<p class="bk-none">${L('Nenhum backup ainda. Eles são criados sozinhos enquanto você joga (personagens a partir do nível 2).', 'No backups yet. They are created automatically while you play (characters from level 2 on).')}</p>`;
}

function askRestore(cls, id) {
  const e = backupsOf(cls).find((x) => backupId(x) === id);
  if (!e) return;
  const C = CLASSES[cls];
  const cur = G.save.slots[cls];
  const now = cur ? L(` O atual (nível ${cur.level}, andar ${cur.floor}) fica guardado como "Antes de restaurar".`, ` The current one (level ${cur.level}, floor ${cur.floor}) is kept as "Before restoring".`) : '';
  confirmDialog(
    L('Restaurar backup?', 'Restore backup?'),
    L(`${C.name} volta para o nível ${e.char.level}, andar ${e.char.floor} (backup de ${bkWhen(e.at)}).`, `${C.name} goes back to level ${e.char.level}, floor ${e.char.floor} (backup from ${bkWhen(e.at)}).`) + now,
    () => {
      const c = restoreBackup(cls, id);
      if (!c) return;
      saveGame();
      renderClassCards();
      renderBackups();
      toast(L(`🛟 ${C.name} restaurado: nível ${c.level}, andar ${c.floor}.`, `🛟 ${C.name} restored: level ${c.level}, floor ${c.floor}.`), 'heal');
      if (G.lastInput === 'pad') restoreFocus('#backup-close');
    },
    { yes: L('Restaurar', 'Restore') },
  );
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
    const q = achNorm(`${a.name} ${a.desc} ${t.name}`).replace(/"/g, '');
    return `<div class="ach ${done ? 'done' : ''}" data-nav data-ach="${a.id}" data-q="${q}" tabindex="-1" style="--t:${t.css}">
      <div class="ach-ico">${a.icon}</div>
      <div class="ach-txt"><b>${a.name}</b><small>${a.desc}</small>${bar}</div>
      <div class="ach-tier">${done ? '✔' : ''} ${t.name}<br>+${fmt(t.reward)}¢</div>
    </div>`;
  }).join('');
  const s = $('ach-search');
  s.value = '';
  s.placeholder = L('🔍 Buscar medalha...', '🔍 Search medals...');
  filterAch();
  closeMedal();
  openOverlay('panel-ach');
}

// busca: ignora maiúsculas, acentos e tags; todas as palavras digitadas precisam aparecer
const achNorm = (s) => String(s).replace(/<[^>]*>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function filterAch() {
  const words = achNorm($('ach-search').value).split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const el of $('ach-grid').children) {
    const ok = words.every((w) => el.dataset.q.includes(w));
    el.classList.toggle('hidden', !ok);
    if (ok) shown++;
  }
  const none = $('ach-none');
  none.classList.toggle('hidden', shown > 0);
  if (!shown) none.textContent = L('Nenhuma medalha encontrada.', 'No medals found.');
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
  if (id === 'panel-opts') updDiffUi();
  $(id).classList.remove('hidden');
  clearFocus();
}
let confirmBack = null;
function closeOverlay(id) {
  $(id).classList.add('hidden');
  clearFocus();
  if (id === 'panel-confirm') {
    if (confirmBack && confirmBack.isConnected) setFocus(confirmBack);
    confirmBack = null;
  }
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

// Índices das habilidades em cada botão: [⚔ (ataque básico ou outro poder), 1, 2, 3, 4, 5, 6, 7]
const barSkills = () => [G.char.atk || 0, ...G.char.slots];

export function refreshSkillBar() {
  const C = CLASSES[G.char.cls];
  barSkills().forEach((i, k) => {
    // ⚔ com o ataque básico devolvido (bloqueado) fica vazio
    const sk = i == null || !(G.char.skills[i] > 0) ? null : C.skills[i];
    const icon = sk ? iconSvg(sk.icon) : '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"><rect x="9" y="14" width="14" height="11" rx="2"/><path d="M12 14v-3a4 4 0 0 1 8 0v3"/></svg>';
    $('sk' + k).querySelector('.icon').innerHTML = icon;
    $('sk' + k).classList.toggle('empty-slot', !sk);
    const tb = k === 0 ? $('tb-primary') : $('tb-s' + k);
    tb.querySelector('.icon').innerHTML = icon;
    tb.classList.toggle('empty-slot', !sk);
    $('sk' + k).querySelector('.cost').textContent = sk && i ? skillCost(i) || '' : '';
  });
  refreshKeyLabels();
}

// Rótulos dos botões na barra de habilidades (teclado ou ícones do controle)
export function refreshKeyLabels() {
  const pad = G.lastInput === 'pad';
  const labels = pad ? [glyph('a'), glyph('x'), glyph('y'), glyph('b'), glyph('lb'), glyph('rb'), glyph('lt'), glyph('rt')] : ['LMB', '1', '2', '3', '4', '5', '6', '7'];
  labels.forEach((l, k) => ($('sk' + k).querySelector('.key').innerHTML = l));
  $('skstim').querySelector('.key').innerHTML = pad ? glyph('ls') : 'F';
  mmHint();
  // com a árvore aberta, os ícones dos botões trocam na hora (teclado ↔ controle)
  if (!$('panel-char').classList.contains('hidden') && currentTab === 'skills') {
    const node = focused && focused.dataset.node;
    renderTree();
    if (pad) restoreFocus(`[data-node="${node ?? treeSel}"]`);
  }
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
  // números da XP: atual / necessária e a porcentagem (no nível máximo, só avisa)
  if (c.level >= MAX_LEVEL) setText('xp-text', L('XP MÁXIMA', 'MAX XP'));
  else { const need = xpNeeded(c.level); setText('xp-text', `XP ${fmt(c.xp)} / ${fmt(need)} (${Math.floor((c.xp / need) * 100)}%)`); }
  setText('hp-text', `${Math.ceil(p.hp)} / ${s.maxHp}`);
  setText('en-text', `${Math.floor(p.en)} / ${s.maxEn}`);
  setText('lvl', String(c.level));
  if (cache.l3 !== c.level >= 100) $('portrait').classList.toggle('l3', (cache.l3 = c.level >= 100)); // nível com 3 dígitos: fonte menor
  setText('credits-val', fmt(c.credits));
  // relógio: só refaz o texto quando o minuto muda
  const min = Math.floor(Date.now() / 60000);
  if (cache.clockMin !== min) {
    cache.clockMin = min;
    $('clock').textContent = $('clock-m').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // recompensa atual da dificuldade (sobe aos poucos depois de aumentar)
  const crK = rewardK('cr');
  const lootK = rewardK('loot');
  const rew = `¢×${crK.toFixed(crK >= 10 ? 0 : 1)} · ★×${lootK.toFixed(lootK >= 100 ? 0 : 1)}${rewardRamping() ? ' ▲' : ''}`;
  if (cache.rew !== rew) {
    // no Abismo fundo (¢×1007 · ★×256 ▲) o texto não cabia ao lado do nome: letra menor
    cache.rew = rew;
    setText('diff-rew', rew);
    $('diff-rew').classList.toggle('long', rew.length >= 15);
  }
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
  for (const k in SHRINES) if (p.buffs[k] > 0) buffs.push(`<span style="color:${SHRINES[k].css};border-color:${SHRINES[k].css}">${SHRINES[k].icon} ${SHRINES[k].name} ${p.buffs[k].toFixed(0)}s</span>`);
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
// regras ativas do Abismo, uma por linha (tooltip)
// (só as 10 últimas: com 500 níveis a lista inteira não cabe)
const abyssRulesText = (n) => {
  const from = Math.max(0, n - 10);
  const head = from ? L(`(as regras do 1 ao ${ABYSS_NUM[from]} também valem)\n`, `(rules 1 to ${ABYSS_NUM[from]} also apply)\n`) : '';
  return head + ABYSS_RULES.slice(from, n).map((r, i) => `${ABYSS_NUM[from + i + 1]} ${r.icon} ${r.name}: ${r.desc}`).join('\n');
};
export function updDiffUi() {
  const k = G.settings.difficulty;
  const i = Math.max(0, DIFF_ORDER.indexOf(k));
  const name = DIFFICULTY[k]?.name || 'Normal';
  const ab = abyssLvl();
  const un = abyssUnlocked();
  $('opt-diff').textContent = name;
  $('diff-range').value = String(i);
  $('diff-name').textContent = ab ? abyssName(ab) : name;
  const ctl = $('diff-ctl');
  ctl.style.setProperty('--dc', DIFF_COLORS[i]);
  ctl.style.setProperty('--ac', abyssColor(Math.max(1, ab)));
  ctl.classList.toggle('abyss', ab > 0);
  // linha do Abismo: só no Morte; bloqueada até vencer um chefe no Morte
  const row = $('abyss-row');
  row.classList.toggle('hidden', k !== 'death');
  row.classList.toggle('locked', !un);
  $('abyss-lock').classList.toggle('hidden', !!un);
  if (!un) $('abyss-lock').textContent = L('🔒 Abismo: vença um chefe', '🔒 Abyss: defeat a boss');
  row.title = !un
    ? L(`Derrote um chefe no Morte para abrir o Abismo: ${ABYSS_MAX} níveis acima do Morte, cada um com uma regra nova, mais créditos e itens melhores.`, `Defeat a boss on Death to open the Abyss: ${ABYSS_MAX} levels above Death, each adding a new rule, more credits and better items.`)
    : ab
      ? `${abyssName(ab)}\n${abyssRulesText(ab)}`
      : L(`Abismo: escolha um dos ${un} níveis. Cada nível soma uma regra e dá mais créditos e itens melhores.`, `Abyss: pick any of the ${un} levels. Each level adds a rule and gives more credits and better items.`);
  $('abyss-range').value = String(ab);
  $('abyss-n').textContent = `${ab}/${ABYSS_MAX}`;
  $('abyss-dn').disabled = ab <= 0;
  $('abyss-up').disabled = ab >= un;
  // opções (para o controle): aparece depois de liberar
  $('opt-abyss-row').classList.toggle('hidden', !un);
  const ob = $('opt-abyss');
  ob.textContent = ab ? abyssName(ab) : L('Desligado', 'Off');
  ob.classList.toggle('on', ab > 0);
  // a borda da tela escurece conforme o nível
  document.body.classList.toggle('abyss', ab > 0);
  document.body.style.setProperty('--abv', Math.min(0.62, 0.14 + 0.04 * ab).toFixed(2));
}
function applyAbyss(n) {
  const prev = abyssLvl();
  if (!setAbyss(n)) return;
  saveSettings();
  updDiffUi();
  if (G.player && G.char) refreshStats();
  if (G.mode === 'menu') return;
  const ab = abyssLvl();
  // o aviso espera parar de clicar, para mostrar o nível final e não o primeiro
  clearTimeout(abToastT);
  abToastT = setTimeout(() => abyssToast(ab > prev), 600);
}
let abToastT = null;
function abyssToast(up) {
  const ab = abyssLvl();
  if (up && ab) {
    const r = ABYSS_RULES[ab - 1];
    sfx.roar();
    banner(`🕳️ ${abyssName(ab).toUpperCase()}`, `${r.icon} ${r.name}`);
    toast(`<b style="color:${abyssColor(ab)}">${abyssName(ab)}</b>: ${r.icon} <b>${r.name}</b>. ${r.desc}<br><small>${L('As regras dos níveis abaixo continuam valendo. A recompensa sobe aos poucos.', 'Rules from the levels below still apply. Rewards ramp up gradually.')}</small>`, '');
  } else {
    toast(ab ? L(`De volta ao <b>${abyssName(ab)}</b>.`, `Back to <b>${abyssName(ab)}</b>.`) : L('Saiu do Abismo: de volta ao <b>Morte</b>.', 'Left the Abyss: back to <b>Death</b>.'), '');
  }
}
// chefe derrotado abriu um nível novo do Abismo (chamado por ach.js)
export function abyssUnlockedFx(n) {
  updDiffUi();
  // depois do aviso de chefe derrotado
  setTimeout(() => {
    sfx.roar();
    banner(L('🕳️ O ABISMO SE ABRIU', '🕳️ THE ABYSS OPENS'), L(`Os ${n} níveis estão abertos: escolha embaixo da dificuldade`, `All ${n} levels are open: pick one under the difficulty`));
    toast(L(`<b>Abismo liberado!</b> ${n} níveis acima do Morte, todos abertos: cada um soma uma regra nova e dá mais créditos e itens melhores. Escolha qual encarar com o <b>+</b>/<b>−</b> embaixo da dificuldade (ou nas Opções).`, `<b>Abyss unlocked!</b> ${n} levels above Death, all open: each adds a new rule and gives more credits and better items. Pick the one you want with <b>+</b>/<b>−</b> under the difficulty (or in Options).`), 'myth');
  }, 2800);
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
  // texto comprido (explicações dos eventos) fica mais tempo para dar para ler
  const ms = Math.max(cls === 'myth' ? 6000 : long ? 4000 : 2200, Math.min(9000, el.textContent.length * 40));
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 500);
}

// inventário sem limite: os itens e mais espaços vazios até fechar a linha (pelo menos 1 vazio e 3 linhas de 10)
function invCells(n, row) {
  return Math.max(30, Math.ceil((n + 1) / row) * row);
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
      if (e.T.prop || !d.explored[Math.floor(e.z) * d.W + Math.floor(e.x)]) continue;
      ctx.fillStyle = e.T.mapColor || '#ff7a1a';
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
      ctx.arc(pk.x, pk.z, pk.supreme || SHRINES[pk.kind].super ? 1.2 : 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Santuário Supremo: contorno dourado
      if (pk.supreme) {
        ctx.strokeStyle = '#ffd23d';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
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
  // eventos do andar (terminais, bomba, fragmentos, Procurado...)
  drawEventMarks(ctx, d);
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
  eventArrows(arrow);
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
    info.legend
      ? L('O elevador sobe os noventa andares das três descidas. Lá em cima, os letreiros neon piscam… e o sol nasce sobre a cidade.', 'The elevator climbs all ninety floors of the three descents. Up top, the neon signs flicker… and the sun rises over the city.')
      : L('O elevador sobe trinta andares. Lá em cima, os letreiros neon piscam… e o sol nasce sobre a cidade.', 'The elevator climbs thirty floors. Up top, the neon signs flicker… and the sun rises over the city.'),
    info.legend
      ? L('Lá embaixo, o último LED vermelho continua apagado. Desta vez, para sempre.', 'Far below, the last red LED stays dark. This time, forever.')
      : L('Mas lá embaixo, em algum servidor esquecido, um LED vermelho volta a acender…', 'But far below, in some forgotten server, a red LED blinks back on…'),
  ];
  // final verdadeiro (venceu o Inferno): outro título e o painel dourado
  $('panel-end').classList.toggle('legend', !!info.legend);
  document.querySelector('#panel-end .end-kicker').textContent = info.legend ? L('FINAL VERDADEIRO', 'TRUE ENDING') : t('endKicker');
  document.querySelector('#panel-end .end-title').textContent = info.legend ? L('LENDA DO NEON', 'NEON LEGEND') : t('endTitle');
  const step = 1.4; // segundos entre cada parágrafo
  $('end-story').innerHTML = lines.map((txt, i) => `<p style="animation-delay:${0.6 + i * step}s"${i === lines.length - 1 ? ' class="tease"' : ''}>${txt}</p>`).join('');
  const tm = info.time || 0;
  // dificuldade em que venceu: no Morte com Abismo mostra o nível do Abismo (I..X), com a cor dele
  const dk = DIFFICULTY[G.settings.difficulty] ? G.settings.difficulty : 'normal';
  const ab = abyssLvl();
  const diffTxt = ab
    ? `<span style="color:${abyssColor(ab)}">🕳️ ${abyssName(ab)}</span>`
    : `<span style="color:${DIFF_COLORS[Math.max(0, DIFF_ORDER.indexOf(dk))]}">${DIFFICULTY[dk].name}</span>`;
  const stats = [
    [L('Herói', 'Hero'), `${C.name} · ${L('Nível', 'Level')} ${c.level}`],
    [L('Batalha final', 'Final battle'), `${Math.floor(tm / 60)}:${String(Math.floor(tm % 60)).padStart(2, '0')}`],
    [L('Tempo de jogo', 'Play time'), fmtPlay(c.playTime)],
    [L('Mortes', 'Deaths'), fmt(c.deaths || 0)],
    [L('Abates', 'Kills'), fmt(c.kills || 0)],
    [L('Créditos', 'Credits'), fmt(c.credits || 0)],
    [L('Dificuldade', 'Difficulty'), diffTxt],
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
  $('dead-info').innerHTML = L(`Andar ${G.floor} · Nível ${c.level}<br>Você será reconstruído no início do andar.`, `Floor ${G.floor} · Level ${c.level}<br>You will be rebuilt at the start of the floor.`);
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
  $('tab-gems').classList.toggle('hidden', tab !== 'gems');
  const hints = document.querySelector('.pad-hints');
  hints.dataset.padText = tab === 'skills' ? 'padHintsTree' : tab === 'gems' ? 'padHintsGems' : 'padHints';
  hints.innerHTML = padText(t(hints.dataset.padText));
  // no controle, a seleção já começa num poder (de preferência um que dá para desbloquear)
  if (tab === 'skills' && G.lastInput === 'pad') {
    setTimeout(() => {
      const target = document.querySelector('#skill-list .tnode.available.can') || document.querySelector('#skill-list .tnode.can') || document.querySelector(`#skill-list [data-node="${treeSel}"]`);
      if (target) setFocus(target);
    }, 0);
  }
  renderChar();
  // no controle, a seleção começa na bolsa (na gema selecionada ou na primeira que houver)
  if (tab === 'gems' && G.lastInput === 'pad') {
    setTimeout(() => {
      const target = (gemSel && document.querySelector(gemCellSel(gemSel))) || document.querySelector('#gem-bag .gcell:not(.none)') || document.querySelector('#gem-sockets .gsock');
      if (target) setFocus(target);
    }, 0);
  }
}

export function renderChar() {
  const c = G.char;
  const p = G.player;
  const C = CLASSES[c.cls];
  $('sp-badge').textContent = c.skillPoints;
  $('sp-badge').classList.toggle('hidden', !(c.skillPoints > 0));
  updateGemBadge();
  if (currentTab === 'gems') renderGems();
  else if (currentTab === 'equip') {
    $('char-title').textContent = `${C.name} · ${L('Nível', 'Level')} ${c.level}`;
    // equipamento
    $('equip-slots').innerHTML = SLOTS.map((slot) => {
      const it = c.equip[slot];
      const sel = selected && selected.where === 'equip' && selected.slot === slot ? ' sel' : '';
      return `<div class="eslot">${it
        ? `<div class="cell r${it.rarity}${sel}" data-nav data-eslot="${slot}" data-uid="${it.uid}" data-where="equip" data-slot="${slot}">${slotIconSvg(slot)}${favMark(it)}<span class="lvl">${it.ilvl | 0}</span></div>`
        : `<div class="cell empty" data-nav data-eslot="${slot}">${slotIconSvg(slot)}</div>`}${SLOT_NAMES[slot]}</div>`;
    }).join('');
    // inventário (sempre ordenado: melhores itens primeiro)
    sortInventory(c.inv, c.equip);
    let html = '';
    const cells = invCells(c.inv.length, 10); // 10 colunas no PC, 5 no celular
    for (let i = 0; i < cells; i++) {
      const it = c.inv[i];
      if (!it) {
        html += '<div class="cell empty" data-nav></div>'; // navegável: o controle consegue descer até os botões
        continue;
      }
      const better = isUpgrade(it, c.equip);
      const up = better ? '<span class="up">▲</span>' : '';
      const sel = selected && selected.where === 'inv' && selected.uid === it.uid ? ' sel' : '';
      html += `<div class="cell r${it.rarity}${sel}${better ? ' better' : ''}" data-nav data-uid="${it.uid}" data-where="inv" data-slot="${it.slot}">${slotIconSvg(it.slot)}${up}${favMark(it)}<span class="lvl">${it.ilvl | 0}</span></div>`;
    }
    $('inv-grid').innerHTML = html;
    $('inv-count').textContent = `${L('Inventário', 'Inventory')} · ${c.inv.length}`;
    $('inv-credits').textContent = fmt(c.credits);
    const price = stimPrice();
    // no celular deitado o texto longo quebraria em 2 linhas
    $('btn-buy-stim').textContent = `${G.isTouch ? 'Stim' : L('Comprar Stim', 'Buy Stim')} · ${L('cura 60%', 'heals 60%')} · ${fmt(price)}¢ · ${c.stims}/${MAX_STIMS}`;
    $('btn-buy-stim').title = L(`Stim: cura 60% da vida na hora e mais um pouco nos 4s seguintes. Use com F, apertando o analógico esquerdo no controle ou no botão verde no toque. Leve até ${MAX_STIMS}.`, `Stim: instantly heals 60% of your health, plus a bit more over the next 4s. Use it with F, by clicking the left stick on a gamepad or with the green touch button. Carry up to ${MAX_STIMS}.`);
    $('btn-buy-stim').disabled = c.credits < price || c.stims >= MAX_STIMS;
    // no controle cada botão mostra o atalho ({Y}: reciclar pelo filtro, {RS}: filtro)
    const nRec = recyclable(c).length;
    $('btn-recycle-all').innerHTML = `♻ ${L('Reciclar', 'Recycle')}${nRec ? ` (${nRec})` : ''}` + padKey('y');
    $('btn-recycle-all').disabled = !nRec;
    $('btn-recycle-all').title = L('Recicla os itens das raridades marcadas no Filtro. Favoritos (★) e itens melhores que o equipado (▲) ficam.', 'Recycles the items of the rarities picked in the Filter. Favorites (★) and items better than what you have equipped (▲) are kept.');
    $('btn-recycle-filter').innerHTML = `${L('Filtro', 'Filter')} ${rarityDots()}` + padKey('rs');
    // atributos
    const s = p.stats;
    const rows = [
      [L('Vida', 'Health'), fmt(s.maxHp)],
      [L('Energia', 'Energy'), fmt(s.maxEn)],
      [L('Dano da arma', 'Weapon damage'), `${fmt(s.wMin)}–${fmt(s.wMax)}`],
      [L('Bônus de dano', 'Damage bonus'), `+${fmt(s.dmgPct)}%`],
      ...(s.treeDmg ? [[L('Árvore e implantes', 'Tree and implants'), `×${s.dmgMul.toFixed(2)}`]] : []),
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
    for (const l of s.prims) sh += `<div class="leg prim">✺ ${PRIMORDIALS[l].name}</div>`;
    if (s.prims.size >= 6) sh += `<div class="leg prim">✺ ${PRIM_SET.name}</div>`;
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
// Gemas: encaixes do equipamento, bolsa, fusão
// ------------------------------------------------------------------
// gemSel: { k: 'bag', g, t } ou { k: 'sock', slot, i }
let gemSel = null;
const gemIcon = (g, t) => `<span class="gico">${gemSvg(g, t)}</span>`;
const gemCellSel = (s) => (s.k === 'bag' ? `#gem-bag [data-g="${s.g}"][data-t="${s.t}"]` : `#gem-sockets [data-gslot="${s.slot}"][data-gi="${s.i}"]`);

// linha de gemas no cartão do item equipado
function gemsCardHtml(c, slot) {
  const list = slotGems(c, slot);
  if (!list.length) return '';
  const n = slotSockets(c, slot);
  return `<div class="it-gems">${list.map((x, i) => `<div class="${i < n ? '' : 'off'}">${gemIcon(x.g, x.t)}<span style="color:${GEMS[x.g].css}">${gemName(x.g, x.t)}</span> ${i < n ? gemEffectText(x.g, x.t, slot) : L('(inativa: faltam encaixes)', '(inactive: not enough sockets)')}</div>`).join('')}</div>`;
}

// poder da gema (Neon ou melhor): nome, força e descrição
// força 1 a 4 em estrelas; do 5 em diante (gemas XI a XX) a estrela com o número, para não estourar a linha
const powStars = (k) => (k <= 4 ? '✦'.repeat(k) : `✦×${k}`);
function gemPowHtml(g, k) {
  return `<div class="gd-pow" style="--gc:${GEMS[g].css}"><b>${powStars(k)} ${gemPowName(g)}</b> ${GEM_POW[g].desc(k)}</div>`;
}
// no detalhe da bolsa: o poder desta gema, ou qual nível libera
function gemPowNote(g, t) {
  const k = gemPowLvl(t);
  if (k) return gemPowHtml(g, k);
  return `<div class="gd-pow off" style="--gc:${GEMS[g].css}"><b>✦ ${gemPowName(g)}</b> ${L(`libera no nível ${TIER_ROMAN[GEM_NEON]} (${gemTierName(GEM_NEON)}): `, `unlocks at tier ${TIER_ROMAN[GEM_NEON]} (${gemTierName(GEM_NEON)}): `)}${GEM_POW[g].desc(1)}</div>`;
}

function updateGemBadge() {
  const c = G.char;
  // aviso: encaixe vazio com gema na bolsa, ou fusão possível
  const free = freeSockets(c) > 0 && gemTotal(c) > 0;
  const fus = fusableCount(c);
  const b = $('gem-badge');
  b.textContent = free ? '!' : fus ? fus : '';
  b.classList.toggle('hidden', !free && !fus);
}

// créditos: número inteiro até 10 milhões, depois na forma curta (1,2B)
const crFmt = (n) => (n >= 1e7 ? short(n) : fmt(n));
function renderGems() {
  const c = G.char;
  $('gem-credits').textContent = fmt(c.credits);
  // encaixes por espaço do equipamento
  let sh = '';
  for (const slot of SLOTS) {
    const it = c.equip[slot];
    const list = slotGems(c, slot);
    const n = slotSockets(c, slot);
    let socks = '';
    for (let i = 0; i < Math.max(n, list.length); i++) {
      const x = list[i];
      const sel = gemSel && gemSel.k === 'sock' && gemSel.slot === slot && gemSel.i === i ? ' sel' : '';
      socks += x
        ? `<button class="gsock full${i < n ? '' : ' off'}${sel}" data-nav data-gslot="${slot}" data-gi="${i}" style="--gc:${GEMS[x.g].css}">${gemSvg(x.g, x.t)}</button>`
        : `<button class="gsock${sel}" data-nav data-gslot="${slot}" data-gi="${i}"></button>`;
    }
    sh += `<div class="gsrow"><div class="cell${it ? ' r' + it.rarity : ' empty'}">${slotIconSvg(slot)}</div><div class="gs-name">${SLOT_NAMES[slot]}</div><div class="gs-socks">${socks || '<span class="gs-none">—</span>'}</div></div>`;
  }
  $('gem-sockets').innerHTML = sh;
  // soma dos bônus ativos
  const m = gemMods(c);
  const keys = Object.keys(m);
  const pw = gemPowers(c);
  const pk = GEM_KEYS.filter((g) => pw[g]);
  $('gem-bonus').innerHTML = (keys.length ? `<div class="gb-title">${L('Bônus das gemas', 'Gem bonuses')}</div>${keys.map((k) => `<div>${PFMT[k](m[k])}</div>`).join('')}` : '')
    + (pk.length ? `<div class="gb-title gb-pow">${L('Poderes das gemas', 'Gem powers')}</div>${pk.map((g) => gemPowHtml(g, pw[g])).join('')}` : '');
  // bolsa: uma linha por tipo, uma coluna por nível, em blocos de 10 níveis (I–X e XI–XX: 20 colunas não cabem no celular)
  let bh = '';
  for (let t0 = 0; t0 < GEM_TIERS; t0 += 10) {
    bh += `<div class="gb-head${t0 ? ' gb-next' : ''}"><span></span>${TIER_ROMAN.slice(t0, t0 + 10).map((r) => `<span>${r}</span>`).join('')}</div>`;
    for (const g of GEM_KEYS) {
      bh += `<div class="gb-row"><span class="gb-type" style="color:${GEMS[g].css}">${gemSvg(g, 2)}</span>`;
      for (let t = t0; t < Math.min(GEM_TIERS, t0 + 10); t++) {
        const n = gemCount(c, g, t);
        const sel = gemSel && gemSel.k === 'bag' && gemSel.g === g && gemSel.t === t ? ' sel' : '';
        bh += `<div class="gcell${n ? '' : ' none'}${n >= 3 && t < GEM_TOP ? ' fuse' : ''}${sel}" data-nav data-g="${g}" data-t="${t}" style="--gc:${GEMS[g].css}">${n ? gemSvg(g, t) : ''}${n ? `<b>${n}</b>` : ''}</div>`;
      }
      bh += '</div>';
    }
  }
  $('gem-bag').innerHTML = bh;
  const cost = fuseAllCost(c);
  $('btn-fuse-all').innerHTML = `⚗ ${L('Fundir tudo', 'Fuse all')}${cost ? ` · ${crFmt(cost)}¢` : ''}${padKey('y')}`;
  $('btn-fuse-all').disabled = !fusableCount(c) || c.credits < fuseCost(firstFusableTier(c));
  renderGemDetail();
}
// nível mais baixo com 3 gemas iguais (de um tipo ou de todos): o primeiro que a fusão em lote paga
function firstFusableTier(c, only) {
  for (let t = 0; t < GEM_TOP; t++) for (const g of only ? [only] : GEM_KEYS) if (gemCount(c, g, t) >= 3) return t;
  return GEM_TOP;
}

function renderGemDetail() {
  const c = G.char;
  const el = $('gem-detail');
  const s = gemSel;
  let h = '';
  if (s && s.k === 'bag') {
    const { g, t } = s;
    const n = gemCount(c, g, t);
    h += `<div class="gd-head">${gemIcon(g, t)}<div><div class="gd-name" style="color:${GEMS[g].css}">${gemName(g, t)}</div><div class="gd-sub">${L('Nível', 'Tier')} ${TIER_ROMAN[t]} · ${L('na bolsa', 'in pouch')}: <b>${n}</b></div></div></div>`;
    h += `<div class="gd-eff"><div>⚔ ${L('Na arma', 'In weapon')}: <b>${gemEffectText(g, t, 'weapon')}</b></div><div>🛡 ${L('Nas outras peças', 'In other gear')}: <b>${gemEffectText(g, t, 'armor')}</b></div></div>`;
    h += gemPowNote(g, t);
    let acts = '';
    if (t < GEM_TOP) {
      const fc = fuseCost(t);
      acts += `<button class="btn small" data-nav data-gact="fuse" ${n >= 3 && c.credits >= fc ? '' : 'disabled'}>⚗ ${L('Fundir', 'Fuse')} 3 → 1 ${gemTierName(t + 1)} · ${crFmt(fc)}¢</button>`;
      if (fusableCount(c, g) > 1) acts += `<button class="btn small ghost" data-nav data-gact="fuseType" ${c.credits >= fuseCost(firstFusableTier(c, g)) ? '' : 'disabled'}>⚗ ${L('Fundir todas', 'Fuse all')} (${GEMS[g][L('pt', 'en')]}) · ${crFmt(fuseAllCost(c, g))}¢</button>`;
    } else acts += `<div class="gd-note">★ ${L('Nível máximo', 'Highest tier')}</div>`;
    if (n > 0) {
      const opts = SLOTS.filter((sl) => slotSockets(c, sl) > 0);
      if (opts.length) {
        acts += `<div class="gd-sub2">${L('Engastar em', 'Socket into')}:</div><div class="gd-slots">${opts.map((sl) => {
          const full = slotGems(c, sl).length >= slotSockets(c, sl);
          return `<button class="btn small ghost" data-nav data-gact="sock" data-slot="${sl}">${SLOT_NAMES[sl]} <small>${gemEffectText(g, t, sl)}${full ? ' ⇄' : ''}</small></button>`;
        }).join('')}</div>`;
      } else acts += `<div class="gd-note">${L('Equipe itens para ter encaixes.', 'Equip items to get sockets.')}</div>`;
    } else acts += `<div class="gd-note">${L('Você não tem esta gema. Gemas caem de inimigos de elite, chefes, baús, contratos e fendas.', 'You don’t have this gem. Gems drop from elites, bosses, chests, contracts and rifts.')}</div>`;
    h += `<div class="gd-acts">${acts}</div>`;
  } else if (s && s.k === 'sock') {
    const list = slotGems(c, s.slot);
    const x = list[s.i];
    const n = slotSockets(c, s.slot);
    if (x) {
      h += `<div class="gd-head">${gemIcon(x.g, x.t)}<div><div class="gd-name" style="color:${GEMS[x.g].css}">${gemName(x.g, x.t)}</div><div class="gd-sub">${SLOT_NAMES[s.slot]} · ${s.i < n ? `${L('encaixe', 'socket')} ${s.i + 1}/${n}` : L('inativa', 'inactive')}</div></div></div>`;
      h += `<div class="gd-eff"><div><b>${gemEffectText(x.g, x.t, s.slot)}</b></div>${gemPowLvl(x.t) ? gemPowHtml(x.g, gemPowLvl(x.t)) : ''}${s.i < n ? '' : `<div class="gd-off">${L('Inativa: o item equipado não tem encaixe para ela. Volta a valer com um item de raridade maior (ou aprimorado até o máximo).', 'Inactive: the equipped item has no socket for it. It works again with a higher rarity item (or one fully upgraded).')}</div>`}</div>`;
      h += `<div class="gd-acts"><button class="btn small danger" data-nav data-gact="unsock">${L('Remover (volta para a bolsa)', 'Remove (back to pouch)')}${padKey('x')}</button></div>`;
    } else {
      h += `<div class="gd-head"><span class="gico empty"></span><div><div class="gd-name">${L('Encaixe vazio', 'Empty socket')}</div><div class="gd-sub">${SLOT_NAMES[s.slot]}</div></div></div>`;
    }
    const best = bestInPouch(c);
    if (best.length) {
      h += `<div class="gd-sub2">${x ? L('Trocar por', 'Swap for') : L('Engastar', 'Socket')}:</div><div class="gd-slots">${best.map(([g, t]) => `<button class="btn small ghost" data-nav data-gact="put" data-g="${g}" data-t="${t}">${gemIcon(g, t)} ${gemName(g, t)} <small>${gemEffectText(g, t, s.slot)}</small></button>`).join('')}</div>`;
    } else if (!x) h += `<div class="gd-note">${L('Sua bolsa de gemas está vazia.', 'Your gem pouch is empty.')}</div>`;
  } else {
    h = `<div class="empty-detail">${L('Selecione uma gema da bolsa ou um encaixe.<br><br>Encaixes por raridade: 1 (Comum a Raro), 2 (Protótipo e Mítico), 3 (Divino e Primordial), +1 aprimorando o item até o máximo no ferreiro.<br><br>✦ Gemas Neon (VII) ou melhores liberam o poder do tipo, mais forte a cada nível até o XX.', 'Select a gem in the pouch or a socket.<br><br>Sockets by rarity: 1 (Common to Rare), 2 (Prototype and Mythic), 3 (Divine and Primordial), +1 by fully upgrading the item at the blacksmith.<br><br>✦ Neon (VII) or better gems unlock their type’s power, stronger with every tier up to XX.')}</div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-gact]').forEach((b) => (b.onclick = () => gemAction(b)));
}

function gemSelect(el) {
  gemSel = el.matches('.gcell') ? { k: 'bag', g: el.dataset.g, t: +el.dataset.t } : { k: 'sock', slot: el.dataset.gslot, i: +el.dataset.gi };
  document.querySelectorAll('#tab-gems .sel').forEach((x) => x.classList.remove('sel'));
  el.classList.add('sel');
  renderGemDetail();
}

// depois de mudar gemas: recalcula atributos, redesenha e mantém o seletor onde estava
function gemsChanged(focusSel) {
  refreshStats();
  renderGems();
  updateGemBadge();
  if (G.lastInput === 'pad') restoreFocus(focusSel || (gemSel && gemCellSel(gemSel)));
}
// seletor de um botão, se ele ainda existir e estiver ativo
const liveBtn = (sel) => {
  const b = document.querySelector(sel);
  return b && !b.disabled ? sel : null;
};

function gemAction(b) {
  const c = G.char;
  const a = b.dataset.gact;
  const s = gemSel;
  if (!s) return;
  if (a === 'fuse' || a === 'fuseType') {
    const t0 = s.t;
    const r = a === 'fuse' ? (fuseGem(c, s.g, s.t) ? { made: 1, best: [s.g, s.t + 1] } : { made: 0 }) : fuseAll(c, s.g);
    if (!r.made) return sfx.deny();
    fuseFx(r.best);
    // acabou o trio: a seleção vai para a gema nova
    if (gemCount(c, s.g, t0) < 3) gemSel = { k: 'bag', g: s.g, t: r.best[1] };
    renderGems();
    return gemsChanged(liveBtn(`#gem-detail [data-gact="${a}"]`) || gemCellSel(gemSel));
  }
  if (a === 'sock') {
    const slot = b.dataset.slot;
    const r = socketGem(c, s.g, s.t, slot);
    if (r === 'full') {
      toast(L('Os encaixes deste espaço já têm gemas melhores.', 'This slot’s sockets already hold better gems.'), 'warn');
      return sfx.deny();
    }
    if (typeof r === 'string' && r !== 'ok') return sfx.deny();
    sfx.gemSocket();
    toast(`💎 ${gemName(s.g, s.t)} → ${SLOT_NAMES[slot]}${r.swapped ? ` <small>(${gemName(r.swapped.g, r.swapped.t)} ${L('voltou para a bolsa', 'went back to the pouch')})</small>` : ''}`, 'item');
    renderGems();
    return gemsChanged(liveBtn(`#gem-detail [data-gact="sock"][data-slot="${slot}"]`) || gemCellSel(s));
  }
  if (a === 'put') {
    const g = b.dataset.g;
    const t = +b.dataset.t;
    const list = slotGems(c, s.slot);
    if (list[s.i]) {
      // troca a gema deste encaixe (a antiga volta para a bolsa)
      const old = list[s.i];
      addGem(c, old.g, old.t, 1);
      addGem(c, g, t, -1);
      list[s.i] = { g, t };
      achAdd('gemSocket');
    } else {
      const r = socketGem(c, g, t, s.slot);
      if (typeof r === 'string' && r !== 'ok') return sfx.deny();
    }
    sfx.gemSocket();
    return gemsChanged(gemCellSel(s));
  }
  if (a === 'unsock') {
    if (unsocketGem(c, s.slot, s.i)) sfx.click();
    return gemsChanged(gemCellSel(s));
  }
}
function fuseFx(best) {
  if (!best) return;
  const [g, t] = best;
  sfx.gemFuse(t);
  toast(`⚗ ${L('Fusão', 'Fused')}: <span style="color:${GEMS[g].css}">${gemName(g, t)}</span>`, t >= 4 ? 'leg' : 'item');
}
function gemFuseAll() {
  const c = G.char;
  const r = fuseAll(c);
  if (!r.made) {
    sfx.deny();
    if (fusableCount(c)) toast(L('Créditos insuficientes para fundir.', 'Not enough credits to fuse.'), 'warn');
    return;
  }
  fuseFx(r.best);
  if (r.made > 1) toast(`⚗ ${r.made} ${L('fusões', 'fusions')} · -${fmt(r.spent)}¢`, 'item');
  // redesenha antes de escolher o foco (o botão pode ter ficado desativado); sem botão, vai para a melhor gema feita
  renderGems();
  const [bg, bt] = r.best || [];
  gemsChanged(liveBtn('#btn-fuse-all') || (bg && gemCellSel({ k: 'bag', g: bg, t: bt })) || (gemSel && gemCellSel(gemSel)));
}

// ------------------------------------------------------------------
// Árvore de habilidades
// ------------------------------------------------------------------
let treeSel = 1;
const TIERS = [
  { label: [1, 1], idx: [0, 1] },
  { label: [2, 4], idx: [2, 9, 12, 3] },
  { label: [5, 9], idx: [4, 5, 10, 6] },
  // + Passos Velozes (nível 10), que vem pela marca swift
  { label: [10, 15], idx: [7, 11, 8], mark: 'swift' },
  // passivos avançados: a posição muda por classe (o Netrunner não tem o Teleporte), então vêm pela marca late
  { label: [20, 36], mark: 'late' },
  // poderes avançados (2 de ataque e 2 de defesa), também pela marca adv
  { label: [40, 70], mark: 'adv' },
  // passivos supremos e ataques supremos (marcas sup e apex)
  { label: [72, 96], mark: 'sup' },
  { label: [76, 100], mark: 'apex' },
  // Fase G: ataques míticos (marca myth) e defesas míticas, ativas e passivas (marca ward)
  { label: [104, 136], mark: 'myth' },
  { label: [108, 140], mark: 'ward' },
];
const MARKS = ['late', 'adv', 'sup', 'apex', 'swift', 'myth', 'ward'];
const tierIdx = (C, t) => [...(t.idx || []), ...(t.mark ? C.skills.map((sk, i) => (sk[t.mark] ? i : -1)).filter((i) => i >= 0) : [])];
// k = -1 é o ⚔ (botão de ataque: A no controle, Espaço/clique no teclado)
function slotKey(k) {
  if (G.lastInput === 'pad') return glyphText(['a', 'x', 'y', 'b', 'lb', 'rb', 'lt', 'rt'][k + 1]);
  return k < 0 ? '⚔' : String(k + 1);
}
// todas as teclas/botões que disparam o botão k (-1 = ⚔), já como HTML
const PAD_BTN = ['a', 'x', 'y', 'b', 'lb', 'rb', 'lt', 'rt'];
function slotKeysHtml(k) {
  if (G.lastInput === 'pad') return glyph(PAD_BTN[k + 1]);
  if (G.lastInput === 'touch' || G.isTouch) return `<kbd>${slotKey(k)}</kbd>`;
  const kb = [[L('Clique', 'Click'), L('Espaço', 'Space')], ['1', 'Q', L('Botão dir.', 'Right-click')], ['2', 'E'], ['3', 'R']][k + 1] || [String(k + 1)];
  return kb.map((t) => `<kbd>${t}</kbd>`).join('');
}
// Quadro com os 8 botões de ação: tecla/botão → poder. Se o poder selecionado pode ir para a barra, cada linha o coloca naquele botão
function loadoutHtml(c, C, sel, canAssign) {
  const cur = slotOf(c, sel);
  const rows = [-1, ...c.slots.keys()].map((k) => {
    const i = k < 0 ? c.atk || 0 : c.slots[k];
    const sk = i == null || !(c.skills[i] > 0) ? null : C.skills[i];
    const cls = `lo-row${sk ? '' : ' empty'}${sk && i === sel ? ' cur' : ''}`;
    const inner = `<span class="lo-keys">${slotKeysHtml(k)}</span><span class="lo-icon">${sk ? iconSvg(sk.icon) : ''}</span><span class="lo-name">${sk ? sk.name : L('vazio', 'empty')}</span>`;
    return canAssign ? `<button class="${cls}" data-nav data-slot="${k}">${inner}</button>` : `<div class="${cls}">${inner}</div>`;
  }).join('');
  const sk = C.skills[sel];
  const pad = G.lastInput === 'pad';
  const hint = !canAssign ? '' : cur != null
    ?L(`Escolha outro botão para <b>${sk.name}</b> (os poderes trocam de lugar).`, `Pick another button for <b>${sk.name}</b> (powers swap places).`)
    : L(`Escolha um botão para <b>${sk.name}</b>.`, `Pick a button for <b>${sk.name}</b>.`);
  return `<div class="loadout"><div class="lo-head">${L('Botões de ação', 'Action buttons')}${pad && canAssign ? ` <span class="lo-sub">${padText(L('{X} no poder: próximo botão', '{X} on a power: next button'))}</span>` : ''}</div>
    ${hint ? `<div class="lo-hint">${hint}</div>` : ''}<div class="lo-grid ${G.lastInput === 'pad' || G.lastInput === 'touch' || G.isTouch ? '' : 'kb'}">${rows}</div></div>`;
}
// em qual botão o poder está: -1 no ⚔, 0–6 nos 7 botões, null fora da barra
function slotOf(c, i) {
  if (!(c.skills[i] > 0)) return null;
  if ((c.atk || 0) === i) return -1;
  const k = c.slots.indexOf(i);
  return k >= 0 ? k : null;
}

// Desbloqueia ou evolui o poder (botão de confirmar do controle ou clique duplo)
function treeSpend(i) {
  treeSel = i;
  const ok = spendPoint(i);
  if (ok) {
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
  return ok;
}

// Quantos pontos dá para pôr de uma vez no poder (até o nível máximo ou acabar os pontos)
function maxSpend(i) {
  const c = G.char;
  const req = CLASSES[c.cls].skills[i].req || 1;
  if (c.level < req) return 0;
  return Math.max(0, Math.min(c.skillPoints, MAX_RANK - (c.skills[i] || 0)));
}

// Evolui o poder várias vezes de uma vez: até o máximo (ou até acabarem os pontos) ou só `lim` pontos
function treeMax(i, lim = Infinity) {
  treeSel = i;
  let n = 0;
  while (n < lim && spendPoint(i)) n++;
  if (n) {
    sfx.levelup();
    const sk = CLASSES[G.char.cls].skills[i];
    toast(`${sk.name}: ${L('nível', 'level')} ${G.char.skills[i]} (+${n})`, 'up', 'tree');
    refreshSkillBar();
    saveGame();
  } else sfx.deny();
  renderChar();
  restoreFocus(`[data-node="${i}"]`);
  return n > 0;
}

// Devolve todos os pontos do poder (com confirmação) para reaplicar em outros
function treeRefund(i) {
  const c = G.char;
  const sk = CLASSES[c.cls].skills[i];
  const back = c.skills[i] || 0;
  if (back <= 0) return sfx.deny();
  treeSel = i;
  const note = L(' Ele volta a ficar bloqueado e sai do botão.', ' It becomes locked again and leaves its button.');
  confirmDialog(L('Devolver pontos?', 'Refund points?'), L(`Devolver os ${back} pontos de ${sk.name} para gastar em outros poderes?`, `Refund the ${back} points from ${sk.name} to spend on other powers?`) + note, () => {
    const n = refundSkill(i);
    if (!n) return;
    sfx.coin();
    toast(L(`${sk.name}: +${n} pontos devolvidos`, `${sk.name}: +${n} points refunded`), 'up', 'tree');
    refreshSkillBar();
    renderChar();
    saveGame();
    restoreFocus(`[data-node="${i}"]`);
  });
}

// Coloca o poder no próximo botão (1 → 2 → … → 7 → ⚔ → 1)
function treeCycleSlot(i) {
  const c = G.char;
  if (!(c.skills[i] > 0) || CLASSES[c.cls].skills[i].passive) return sfx.deny();
  const cur = slotOf(c, i) ?? -1;
  assignSlot(cur + 1 >= c.slots.length ? -1 : cur + 1, i);
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
    const idx = tierIdx(C, t);
    if (!idx.length) return;
    const lbl = t.label[0] === t.label[1] ? `${L('Nível', 'Level')} ${t.label[0]}` : `${L('Níveis', 'Levels')} ${t.label[0]}–${t.label[1]}`;
    if (ti) html += '<div class="tree-link"></div>';
    html += `<div class="tier"><div class="tier-label">${lbl}</div><div class="tier-nodes">`;
    for (const i of idx) {
      const sk = C.skills[i];
      if (!sk || MARKS.some((m) => sk[m] && t.mark !== m)) continue;
      const r = c.skills[i] || 0;
      const req = sk.req || 1;
      const locked = r === 0;
      const canLearn = locked && c.level >= req && c.skillPoints > 0;
      const canUp = !locked && r < MAX_RANK && c.skillPoints > 0;
      const slot = slotOf(c, i);
      const state = locked ? (c.level >= req ? 'available' : 'locked') : 'learned';
      html += `<button class="tnode ${state}${sk.passive ? ' passive' : ''}${treeSel === i ? ' sel' : ''}${canLearn || canUp ? ' can' : ''}" data-nav data-node="${i}" title="${sk.name}">
        <span class="ticon">${iconSvg(sk.icon)}</span>
        <span class="tbadge">${locked ? (c.level >= req ? '+' : `🔒${req}`) : `${r}/${MAX_RANK}`}</span>
        ${slot != null ? `<span class="tslot">${slotKey(slot)}</span>` : ''}${sk.passive ? `<span class="tpas">${L('PASSIVO', 'PASSIVE')}</span>` : ''}
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
  else status = `<div class="tstatus ok">${L('Nível', 'Level')} ${r}/${MAX_RANK}${r < MAX_RANK ? (sk.passive || sk.adv || sk.apex || sk.myth || sk.ward ? ` · ${L('próximo', 'next')}: ${sk.desc(r + 1)}` : L(` · próximo: ${Math.round(rankMult(r + 1) * 100)}% de potência`, ` · next: ${Math.round(rankMult(r + 1) * 100)}% power`)) : ''}</div>`;
  const canSpend = c.skillPoints > 0 && r < MAX_RANK && c.level >= req;
  // devolver os pontos deste poder para reaplicar em outros
  const back = r;
  // evoluir de uma vez até o máximo (ou até acabarem os pontos)
  const mx = maxSpend(i);
  // no controle, cada ação mostra o botão que a faz direto do poder selecionado
  const pad = G.lastInput === 'pad';
  const pg = (k) => (pad ? glyph(k) + ' ' : '');
  let actions = `<div class="td-btns"><button class="btn" data-nav data-spend="${i}" ${canSpend ? '' : 'disabled'}>${pg('a')}${locked ? L('Desbloquear (1 ponto)', 'Unlock (1 point)') : L('+ Evoluir (1 ponto)', '+ Upgrade (1 point)')}</button>${mx > 5 ? `<button class="btn" data-nav data-five="${i}">${L('+5 pontos', '+5 points')}</button>` : ''}${mx > 1 ? `<button class="btn" data-nav data-max="${i}">${pad ? pg('y') : '⇈ '}${L(`Evoluir ao máximo (+${mx})`, `Upgrade to max (+${mx})`)}</button>` : ''}${back > 0 ? `<button class="btn ghost" data-nav data-refund="${i}">${pad ? pg('rt') : '↺ '}${L(`Devolver pontos (${back})`, `Refund points (${back})`)}</button>` : ''}</div>`;
  const tip = pad ? padText(L('{A} no poder: desbloquear/evoluir · {Y}: evoluir ao máximo · {X}: trocar de botão · {RT}: devolver pontos', '{A} on a power: unlock/upgrade · {Y}: upgrade to max · {X}: change button · {RT}: refund points')) : G.isTouch ? '' : L('Dica: clique duplo no poder para desbloquear/evoluir.', 'Tip: double-click a power to unlock/upgrade.');
  html += `<div class="tree-side"><div class="tree-detail">
    <div class="td-head"><div class="sicon">${iconSvg(sk.icon)}</div><div><div class="sname">${sk.name}</div><div class="smeta">${meta}</div></div></div>
    <div class="sdesc">${sk.desc(Math.max(1, r))}</div>
    ${status}
    <div class="td-actions">${actions}</div>
    ${tip ? `<div class="td-tip">${tip}</div>` : ''}
  </div>${loadoutHtml(c, C, i, !locked && !sk.passive)}</div></div>`;
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
  const mb = $('skill-list').querySelector('[data-max]');
  if (mb) mb.onclick = () => treeMax(i);
  const fb = $('skill-list').querySelector('[data-five]');
  if (fb) fb.onclick = () => {
    treeMax(i, 5);
    if (document.querySelector('[data-five]')) restoreFocus('[data-five]');
  };
  const rf = $('skill-list').querySelector('[data-refund]');
  if (rf) rf.onclick = () => treeRefund(i);
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
  const fav = `<button class="btn small ghost fav-btn${it.fav ? ' on' : ''}" data-nav data-act="fav">${it.fav ? L('★ Desfavoritar', '★ Unfavorite') : L('☆ Favoritar', '☆ Favorite')}${padKey('rt')}</button>`;
  let actions = '';
  if (selected.where === 'inv') {
    const rec = it.fav
      ? `<button class="btn small danger" disabled>🔒 ${L('Favorito', 'Favorite')}</button>`
      : `<button class="btn small danger" data-nav data-act="recycle">${L('Reciclar', 'Recycle')} (+${fmt(recycleValue(it))}¢)${padKey('x')}</button>`;
    actions = `<div class="detail-actions"><button class="btn small" data-nav data-act="equip">${L('Equipar', 'Equip')}${padKey('a')}</button>${fav}${rec}</div>`;
  } else {
    actions = `<div class="detail-actions"><button class="btn small ghost" data-nav data-act="unequip">${L('Desequipar', 'Unequip')}${padKey('a')}</button>${fav}</div>`;
  }
  const cur = selected.where === 'inv' ? c.equip[it.slot] : null;
  if (cur) {
    // selecionado e equipado lado a lado (no celular fica tudo visível sem rolar)
    el.innerHTML = `<div class="cmp-wrap"><div class="cmp-new">${itemCardHtml(it, itemDiffHtml(it, cur), { base: true })}${actions}</div><div class="cmp-cur"><div class="it-cmp">${L('Equipado atualmente', 'Currently equipped')}</div>${itemCardHtml(cur, '', { base: true, gems: gemsCardHtml(c, cur.slot) })}</div></div>`;
  } else el.innerHTML = itemCardHtml(it, '', { gems: selected.where === 'equip' ? gemsCardHtml(c, it.slot) : '' }) + actions;
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
  const gc = e.target.closest('.gcell, .gsock');
  if (gc) gemSelect(gc);
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
  toast(L(`Reciclado: +${fmt(v)}¢`, `Recycled: +${fmt(v)}¢`));
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

// marcas da célula: ★ favorito (canto de cima) e +N do ferreiro (canto de baixo)
function favMark(it) {
  return (it.fav ? '<span class="fav">★</span>' : '') + (it.plus > 0 ? `<span class="plus">+${it.plus}</span>` : '');
}

// Reciclar em lote: só as raridades marcadas no filtro (G.settings.recycle).
// Favoritos nunca, e nunca um item melhor que o equipado no mesmo espaço (nem com espaço vazio).
const betterThanEquipped = (it, equip) => {
  const cur = equip[it.slot];
  return !cur || itemScore(unforged(it)) > itemScore(unforged(cur));
};
const recFilter = () => G.settings.recycle || [];
const recyclable = (c) => {
  const f = recFilter();
  return c.inv.filter((it) => f.includes(it.rarity) && !it.fav && !betterThanEquipped(it, c.equip));
};
// bolinhas com a cor de cada raridade marcada (cabe no botão do filtro)
function rarityDots() {
  const f = recFilter();
  if (!f.length) return `<span class="rf-none">${L('nenhuma', 'none')}</span>`;
  return `<span class="rf-dots">${RARITY.map((R, i) => (f.includes(i) ? `<i style="background:${R.color}"></i>` : '')).join('')}</span>`;
}

function recycleAll() {
  const c = G.char;
  const list = recyclable(c);
  if (!list.length) return;
  const n = list.length;
  const set = new Set(list);
  const f = recFilter();
  // o que ficou das raridades marcadas: favoritos e itens melhores que o equipado
  const kept = c.inv.filter((it) => f.includes(it.rarity) && !set.has(it)).length;
  const total = list.reduce((s, it) => s + recycleValue(it), 0);
  // sem confirmação: recicla na hora e avisa quantos foram (e o que ficou)
  c.inv = c.inv.filter((it) => !set.has(it));
  c.credits += total;
  sfx.coin();
  const keep = kept ? `<br><small>${L(`${kept} ${kept === 1 ? 'favorito (★) ou melhor que o equipado ficou' : 'favoritos (★) ou melhores que o equipado ficaram'}.`, `${kept} favorite (★) or better-than-equipped ${kept === 1 ? 'item was' : 'items were'} kept.`)}</small>` : '';
  toast(L(`♻ ${n} ${n === 1 ? 'item reciclado' : 'itens reciclados'}: +${fmt(total)}¢`, `♻ ${n} ${n === 1 ? 'item' : 'items'} recycled: +${fmt(total)}¢`) + keep);
  selected = null;
  renderChar();
  saveGame();
}

// ------------------------------------------------------------------
// Filtro da reciclagem: liga/desliga cada raridade (fica salvo nas opções do aparelho)
// ------------------------------------------------------------------
function openRecycleFilter() {
  renderRecycleFilter();
  openOverlay('panel-rfilter');
  setFocus(document.querySelector('#rf-opts .rf-opt'));
}
function closeRecycleFilter() {
  closeOverlay('panel-rfilter');
  if (G.lastInput === 'pad') restoreFocus('#btn-recycle-filter');
}
function toggleRarity(i) {
  const f = recFilter();
  G.settings.recycle = f.includes(i) ? f.filter((r) => r !== i) : [...f, i].sort((a, b) => a - b);
  saveSettings();
  sfx.click();
  renderChar();
  renderRecycleFilter();
  restoreFocus(`#rf-opts [data-r="${i}"]`);
}
function renderRecycleFilter() {
  const c = G.char;
  const f = recFilter();
  $('rf-opts').innerHTML = RARITY.map((R, i) => {
    const n = c.inv.filter((it) => it.rarity === i).length;
    const on = f.includes(i);
    return `<button class="rf-opt${on ? ' on' : ''}" data-nav data-r="${i}" style="--rc:${R.color}"><span class="rf-box">${on ? '✓' : ''}</span><span class="rf-name">${R.name}</span><span class="rf-n">${n}</span></button>`;
  }).join('');
  $('rf-opts').querySelectorAll('.rf-opt').forEach((b) => (b.onclick = () => toggleRarity(+b.dataset.r)));
  const list = recyclable(c);
  const total = list.reduce((s, it) => s + recycleValue(it), 0);
  $('rf-sum').innerHTML = list.length
    ? L(`Reciclar agora: <b>${list.length}</b> ${list.length === 1 ? 'item' : 'itens'} → <b>+${fmt(total)}¢</b>`, `Recycle now: <b>${list.length}</b> ${list.length === 1 ? 'item' : 'items'} → <b>+${fmt(total)}¢</b>`)
    : L('Nada para reciclar com este filtro.', 'Nothing to recycle with this filter.');
  $('rf-yes').innerHTML = L('♻ Reciclar', '♻ Recycle') + padKey('y');
  $('rf-yes').disabled = !list.length;
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
const PANEL_ORDER = ['finale', 'panel-implant', 'panel-end', 'panel-confirm', 'panel-rfilter', 'panel-ach', 'panel-opts', 'panel-help', 'panel-debug', 'panel-sync', 'panel-backup', 'panel-dead', 'panel-shop', 'panel-forge', 'panel-stash', 'panel-char', 'panel-pause', 'menu'];
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
  else if (el.matches('.gcell, .gsock') && G.lastInput === 'pad') gemSelect(el);
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
    // se o código já pôs o foco dentro do painel novo (ex.: voltar da confirmação), mantém o seletor onde está
    if (!(root && focused && root.contains(focused))) clearFocus();
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
    aHoldOk = false;
    if (focused.matches('[data-node]')) {
      aHoldOk = treeSpend(+focused.dataset.node);
    } else if (focused.matches('[data-forge]')) {
      aHoldOk = !focused.disabled;
      aHoldEl = focused.dataset.forge;
      focused.click();
    } else if (focused.matches('.gcell, .gsock')) {
      // gema/encaixe: seleciona e leva o seletor para a primeira ação do detalhe
      gemSelect(focused);
      const b = [...document.querySelectorAll('#gem-detail [data-gact]')].find((x) => !x.disabled);
      if (b) setFocus(b);
    } else if (focused.matches('.cell[data-swhere]')) {
      stashMove(focused.dataset.swhere, focused.dataset.uid); // baú: guarda ou pega
    } else if (focused.matches('.cell[data-uid]')) {
      if (focused.dataset.where === 'inv') equipItem(focused.dataset.uid);
      else unequip(focused.dataset.slot);
    } else focused.click();
  } else if (aHoldOk && focused && Input.navHold('a')) {
    // segurar {A}: continua aprimorando no ferreiro / pondo pontos no poder até chegar no máximo ou acabar
    if (focused.matches('[data-forge]') && focused.dataset.forge === aHoldEl && !focused.disabled) focused.click();
    else if (focused.matches('[data-node]') && G.char.skillPoints > 0) aHoldOk = treeSpend(+focused.dataset.node);
    else aHoldOk = false;
  }
  if (Input.nav('x') && focused && focused.matches('.cell[data-where="inv"]')) recycleItem(focused.dataset.uid);
  if (root.id === 'panel-forge' && Input.nav('y')) doForgeAll(); // {Y}: maximizar tudo
  if (root.id === 'panel-stash') {
    if (Input.nav('x') && focused && focused.matches('.cell[data-swhere="stash"]')) stashEquip(focused.dataset.uid); // {X}: equipar do baú
    if (Input.nav('rt') && focused && focused.matches('.cell[data-swhere]')) stashRecycle(focused.dataset.swhere, focused.dataset.uid); // {RT}: reciclar
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
  if (Input.nav('rt') && focused && focused.matches('[data-node]')) treeRefund(+focused.dataset.node); // {RT}: devolver os pontos do poder
  if (Input.nav('x') && focused && focused.matches('.gsock.full')) {
    // {X}: tirar a gema do encaixe
    gemSelect(focused);
    const b = document.querySelector('#gem-detail [data-gact="unsock"]');
    if (b) gemAction(b);
  }
  // {LB}/{RB}: aba anterior/próxima (Equipamento, Habilidades, Gemas)
  const CHAR_TABS = ['equip', 'skills', 'gems'];
  const ti = CHAR_TABS.indexOf(currentTab);
  if (Input.nav('rs') && root.id === 'panel-char' && currentTab === 'equip') openRecycleFilter(); // {RS}: filtro da reciclagem
  if (root.id === 'panel-opts' && focused && focused.id === 'opt-abyss') {
    // {LB}/{RB}: −10/+10 no nível do Abismo
    if (Input.nav('lb')) applyAbyss(Math.max(0, abyssLvl() - 10));
    if (Input.nav('rb')) applyAbyss(abyssLvl() + 10);
  }
  // {Y} no filtro: recicla agora (o seletor fica nas raridades)
  if (Input.nav('y') && root.id === 'panel-rfilter' && !$('rf-yes').disabled) {
    recycleAll();
    renderRecycleFilter();
    restoreFocus(focused && focused.dataset.r ? `#rf-opts [data-r="${focused.dataset.r}"]` : '#rf-yes');
  }
  if (Input.nav('y') && root.id === 'panel-char' && currentTab === 'equip') recycleAll(); // {Y}: reciclar tudo
  else if (Input.nav('y') && root.id === 'panel-char' && currentTab === 'gems') gemFuseAll(); // {Y}: fundir tudo
  else if (Input.nav('y') && root.id === 'panel-char' && currentTab === 'skills') treeMax(focused && focused.matches('[data-node]') ? +focused.dataset.node : treeSel); // {Y}: evoluir ao máximo
  else if ((Input.nav('y') || Input.nav('rb')) && root.id === 'panel-char') setTab(CHAR_TABS[(ti + 1) % 3]);
  else if (Input.nav('lb') && root.id === 'panel-char') setTab(CHAR_TABS[(ti + 2) % 3]);
  if (Input.nav('b')) uiBack(root);
}

export function uiBack(root = activePanel()) {
  if (!root) return;
  switch (root.id) {
    case 'finale':
      skipFinale();
      break;
    case 'panel-end':
    case 'panel-implant':
      break; // o final só fecha pelos botões
    case 'panel-rfilter':
      closeRecycleFilter();
      break;
    case 'panel-confirm':
    case 'panel-opts':
    case 'panel-help':
    case 'panel-sync':
    case 'panel-backup':
    case 'panel-debug':
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
      if (!bankEditClose()) closeStash(); // {B}/Esc fecha antes o valor customizado
      break;
    case 'panel-pause':
      closePause();
      break;
  }
}

export function anyOverlayOpen() {
  return ['panel-confirm', 'panel-rfilter', 'panel-opts', 'panel-help', 'panel-sync', 'panel-backup', 'panel-ach', 'panel-debug'].some((id) => !$(id).classList.contains('hidden'));
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
    <button class="btn small" data-nav data-buy="stim" ${c.credits < price || c.stims >= MAX_STIMS ? 'disabled' : ''}>${fmt(price)}¢</button></div>`;
  html += '<div class="shop-grid">';
  shopStock.forEach((it, k) => {
    const better = !it.sold && isUpgrade(it, c.equip);
    const tag = better ? `<div class="it-cmp" style="color:#39ff88">▲ ${L('Melhor que o equipado', 'Better than equipped')}</div>` : '';
    const btn = it.sold
      ? `<button class="btn small ghost" data-nav data-buy="${k}" disabled>${L('Vendido', 'Sold')}</button>`
      : `<button class="btn small" data-nav data-buy="${k}" ${c.credits < it.price ? 'disabled' : ''}>${L('Comprar', 'Buy')} · ${fmt(it.price)}¢</button>`;
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
  // o seletor do controle fica no mesmo lugar (o botão vendido continua focável, só desativado)
  const had = !!focused;
  renderShop();
  const el = had && $('shop-items').querySelector(`[data-buy="${what}"]`);
  if (el) setFocus(el);
  else clearFocus();
}

// ------------------------------------------------------------------
// Ferreiro: aprimora o equipamento em uso por créditos
// ------------------------------------------------------------------
export function openForge() {
  if (G.mode !== 'play') return;
  G.mode = 'forge';
  G.save.smithSeen = true;
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

// "Maximizar tudo": com o dinheiro que tem, sobe sempre o item com menos aprimoramento (empate: o mais barato).
// Assim, se não der para maximizar tudo, os itens sobem por igual (um pouco de cada).
// Um item caro demais agora continua caro demais até o fim (o dinheiro só desce), então pular ele não desequilibra os outros.
function forgeAllStep(lv, budget) {
  const c = G.char;
  let best = null;
  let bestCost = 0;
  for (const slot of SLOTS) {
    const it = c.equip[slot];
    if (!it || lv[slot] >= forgeMax(it)) continue;
    const cost = forgeCost({ ilvl: it.ilvl, rarity: it.rarity, plus: lv[slot] });
    if (cost > budget) continue;
    if (!best || lv[slot] < lv[best] || (lv[slot] === lv[best] && cost < bestCost)) {
      best = slot;
      bestCost = cost;
    }
  }
  return best ? { slot: best, cost: bestCost } : null;
}

function forgeAllPlan() {
  const c = G.char;
  const lv = {};
  let left = 0;
  for (const slot of SLOTS) {
    const it = c.equip[slot];
    if (!it) continue;
    lv[slot] = it.plus | 0;
    left += Math.max(0, forgeMax(it) - lv[slot]);
  }
  let budget = c.credits;
  let n = 0;
  let cost = 0;
  for (let s; (s = forgeAllStep(lv, budget)); ) {
    lv[s.slot]++;
    budget -= s.cost;
    cost += s.cost;
    n++;
  }
  // custo de maximizar tudo, mesmo sem dinheiro (para mostrar quanto falta)
  let full = 0;
  for (const slot of SLOTS) {
    const it = c.equip[slot];
    if (!it) continue;
    for (let p = it.plus | 0; p < forgeMax(it); p++) full += forgeCost({ ilvl: it.ilvl, rarity: it.rarity, plus: p });
  }
  return { n, cost, left, full };
}

function forgeAllBar() {
  const pl = forgeAllPlan();
  if (!pl.left) return '';
  const all = pl.n >= pl.left;
  const y = G.lastInput === 'pad' ? padText('{Y} ') : '';
  const label = y + (all
    ? `⚒ ${L('Maximizar tudo', 'Max everything')} · ${fmt(pl.cost)}¢`
    : pl.n
      ? `⚒ ${L('Aprimorar tudo por igual', 'Upgrade all evenly')} (+${pl.n}) · ${fmt(pl.cost)}¢`
      : `⚒ ${L('Maximizar tudo', 'Max everything')}`);
  const note = all
    ? L('Leva todos os itens equipados ao máximo.', 'Takes every equipped item to the max.')
    : `${L('Maximizar tudo custa', 'Maxing everything costs')} ${fmt(pl.full)}¢. ${pl.n ? L('Com o que você tem, sobe um pouco de cada item, por igual.', 'With what you have, each item goes up a bit, evenly.') : L('Créditos insuficientes.', 'Not enough credits.')}`;
  // botão à direita, na mesma coluna dos botões das linhas (o direcional desce do ✕ direto para ele)
  return `<div class="forge-all">
    <span class="fa-note">${note}</span>
    <button class="btn small" id="forge-all" data-nav ${pl.n ? '' : 'disabled'}>${label}</button>
  </div>`;
}

function doForgeAll() {
  const c = G.char;
  const lv = {};
  for (const slot of SLOTS) if (c.equip[slot]) lv[slot] = c.equip[slot].plus | 0;
  let n = 0;
  let ms = 0;
  let maxed = 0;
  for (let s; (s = forgeAllStep(lv, c.credits)); ) {
    const it = c.equip[s.slot];
    c.credits -= s.cost;
    forgeItem(it);
    lv[s.slot] = it.plus;
    n++;
    if (isMilestone(it.plus)) ms++;
    if (it.plus >= forgeMax(it)) maxed++;
  }
  if (!n) return sfx.deny();
  sfx.forge(ms > 0);
  achAdd('forges', n);
  if (maxed) achAdd('forgeMax', maxed);
  refreshStats();
  const p = G.player;
  if (p) burst(p.x, 1, p.z, 0xffb04d, 30, 4, 0.05, 0.5, { up: 1.5 });
  toast(`⚒ ${L('Ferreiro', 'Blacksmith')}: +${n} ${n > 1 ? L('aprimoramentos', 'upgrades') : L('aprimoramento', 'upgrade')}${ms ? `<br><small>★ ${ms} ${ms > 1 ? L('atributos novos/melhorados', 'new/improved stats') : L('atributo novo/melhorado', 'new/improved stat')}</small>` : ''}`, ms ? 'up' : 'item');
  saveGame();
  renderForge();
  const again = $('forge-all') || $('forge-items').querySelectorAll('[data-forge]')[0] || $('forge-close');
  if (G.lastInput === 'pad' && again) setFocus(again);
}

function renderForge() {
  const c = G.char;
  $('forge-credits').textContent = fmt(c.credits);
  let html = forgeAllBar();
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
      next = `<span class="fr-max">★ ${L('Aprimoramento máximo', 'Fully upgraded')} · 💎 +1 ${L('encaixe de gema', 'gem socket')}</span>`;
      btn = `<button class="btn small ghost" disabled>${L('Máximo', 'Maxed')}</button>`;
    } else {
      const sim = JSON.parse(JSON.stringify(it));
      forgeItem(sim);
      const cost = forgeCost(it);
      next = `${forgeMain(it)} → <b>${forgeMain(sim)}</b> · ${L('atributos', 'stats')} +2,5%`;
      if (isMilestone(lv + 1)) next += ` · <span class="fr-ms">★ ${L('marco: atributo novo', 'milestone: new stat')}</span>`;
      if (lv + 1 >= max) next += ` · <span class="fr-ms">💎 ${L('máximo: +1 encaixe de gema', 'max: +1 gem socket')}</span>`;
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
  const fa = $('forge-all');
  if (fa) fa.onclick = doForgeAll;
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
// Baú compartilhado: até 1000 itens para todos os personagens (fica no save, fora do personagem).
// É uma lista só, sempre ordenada do nível maior para o menor (sem olhar o tipo) e mostrada em 10 abas de 100.
// Cada item guardado leva `st` (quando entrou) e cada retirada fica em save.stashOut[uid],
// para a sincronização na nuvem não duplicar nem perder itens (ver mergeStash em sync.js).
// ------------------------------------------------------------------
export const STASH_TAB = 100;
export const STASH_TABS = 10;
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
  bankEdit = null;
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
  // Nível visível tanto no baú quanto no inventário.
  const lvl = `<span class="lvl">${it.ilvl | 0}</span>`;
  const tip = bf.length ? ` title="${L('Melhor que o equipado de', 'Better than what is equipped on')}: ${bf.map((k) => CLASSES[k].name).join(', ')}"` : '';
  return `<div class="cell r${it.rarity}${sel}${better ? ' better' : ''}${lock ? ' locked' : ''}" data-nav data-uid="${it.uid}" data-swhere="${where}"${tip}>${slotIconSvg(it.slot)}${up}${favMark(it)}${tag}${lvl}</div>`;
}

// Ordena o baú do nível maior para o menor, sem olhar o tipo do item; no mesmo nível vem a
// raridade e depois a pontuação (sem o aprimoramento do ferreiro, como na comparação)
function sortStash() {
  const st = stashList();
  const key = new Map(st.map((it) => [it, itemScore(unforged(it))]));
  st.sort((a, b) => (b.ilvl | 0) - (a.ilvl | 0) || b.rarity - a.rarity || key.get(b) - key.get(a));
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
  // itens além das 10 abas (save antigo/sincronização) aparecem na última
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
  const cells = invCells(c.inv.length, 30); // 10 colunas no PC, 6 no celular
  for (let i = 0; i < cells; i++) b += stashCell(c.inv[i], 'sinv');
  $('stash-inv').innerHTML = b;
  // quantos itens do baú são melhores que o equipado do personagem atual
  const ups = st.filter((it) => !otherClassWeapon(it) && isUpgrade(it, c.equip)).length;
  $('stash-count').innerHTML = (ups ? `<span class="stash-ups">▲ ${ups} ${ups === 1 ? L('melhor', 'upgrade') : L('melhores', 'upgrades')}</span> ` : '') + `${st.length}/${STASH_SIZE}`;
  $('stash-inv-count').textContent = String(c.inv.length);
  const nm = c.inv.filter((it) => it.rarity >= MYTHIC).length;
  const pm = $('stash-put-myth');
  pm.innerHTML = `✦ ${G.isTouch ? L('Guardar míticos', 'Store mythics') : L('Guardar todos os míticos', 'Store all mythics')}${nm ? ` (${nm})` : ''}${padKey('y')}`;
  pm.disabled = !nm || st.length >= STASH_SIZE;
  pm.title = L('Manda todos os itens míticos (e divinos e primordiais) do inventário para o baú', 'Sends every mythic (and divine and primordial) item in your inventory to the stash');
  renderStashDetail();
  renderBank();
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
    hint = `<div><b>📦 ${L('Guardar', 'Store')}:</b> ${full ? L(`o baú está cheio (${STASH_SIZE} itens).`, `the stash is full (${STASH_SIZE} items).`) : L('manda o item para o baú, onde todos os seus personagens podem pegar.', 'sends the item to the stash, where all your characters can take it.')}</div>`;
  } else if (lock) btn = `<button class="btn small" disabled>🔒 ${CLASSES[it.cls].name}</button>`;
  else {
    // equipar direto do baú: o item equipado agora vai para o lugar dele no baú
    const old = c.equip[it.slot];
    btn = `<button class="btn small" data-nav data-sact="equip">${old ? '⇄ ' : ''}${L('Equipar', 'Equip')}${padKey('x')}</button>`;
    btn += `<button class="btn small" data-nav data-sact="take">${L('Pegar', 'Take')}${padKey('a')}</button>`;
    hint = `<div><b>${old ? '⇄ ' : ''}${L('Equipar', 'Equip')}:</b> ${old ? L(`veste este item agora; o seu <span style="color:${RARITY[old.rarity].color}">${itemName(old)}</span> vai para o lugar dele no baú.`, `wears this item now; your <span style="color:${RARITY[old.rarity].color}">${itemName(old)}</span> goes into its place in the stash.`) : L('veste este item agora.', 'wears this item now.')}</div>`;
    hint += `<div><b>${L('Pegar', 'Take')}:</b> ${L('leva o item para o seu inventário.', 'moves the item to your inventory.')}</div>`;
  }
  // reciclar direto daqui (do baú ou do inventário); favoritos ficam protegidos
  btn += it.fav
    ? `<button class="btn small danger" disabled>🔒 ${L('Favorito', 'Favorite')}</button>`
    : `<button class="btn small danger" data-nav data-sact="recycle">${L('Reciclar', 'Recycle')} (+${fmt(recycleValue(it))}¢)${padKey('rt')}</button>`;
  hint += `<div><b>${L('Reciclar', 'Recycle')}:</b> ${it.fav ? L('itens favoritos (★) não podem ser reciclados.', 'favorite (★) items can\'t be recycled.') : L(`desmonta o item e dá ${fmt(recycleValue(it))}¢ para este personagem.`, `breaks the item down and gives ${fmt(recycleValue(it))}¢ to this character.`)}</div>`;
  if (hint) btn += `<div class="sact-hint">${hint}</div>`;
  const bf = betterFor(it);
  const note = (lock ? `<div class="it-cmp">${onlyClassMsg(it)}</div>` : '') + (bf.length ? `<div class="it-cmp better-for">▲ ${L('Melhor que o equipado de', 'Better than what is equipped on')}: ${bf.map((k) => `<b style="color:${CLASSES[k].css}">${CLASSES[k].name}</b>`).join(', ')}</div>` : '');
  const cur = lock ? null : c.equip[it.slot];
  // o botão vem antes do cartão: no celular deitado ele fica sempre à vista
  el.innerHTML = `<div class="detail-actions">${btn}</div>` + note + itemCardHtml(it, cur ? itemDiffHtml(it, cur) : '', { base: !!cur });
  el.querySelectorAll('[data-sact]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.sact;
    if (a === 'equip') stashEquip(it.uid);
    else if (a === 'recycle') stashRecycle(stashSel.where, it.uid);
    else stashMove(stashSel.where, it.uid);
  }));
}

// Recicla um item direto do baú ('stash') ou do inventário ('sinv'); os créditos vão para o personagem atual.
// Favoritos não são reciclados.
function stashRecycle(where, uid) {
  const c = G.char;
  const st = stashList();
  const from = where === 'stash' ? st : c.inv;
  const it = from.find((i) => i.uid === uid);
  if (!it) return;
  if (it.fav) {
    sfx.deny();
    toast(L('Item favorito (★) não pode ser reciclado. Desfavorite antes.', 'Favorite items (★) can\'t be recycled. Unfavorite it first.'), 'warn');
    return;
  }
  const v = recycleValue(it);
  const idx = from.indexOf(it);
  from.splice(idx, 1);
  if (where === 'stash') {
    // saída do baú registrada para a sincronização não trazer o item de volta
    if (!G.save.stashOut) G.save.stashOut = {};
    G.save.stashOut[uid] = Date.now();
  }
  c.credits += v;
  sfx.coin();
  toast(L(`Reciclado: +${fmt(v)}¢`, `Recycled: +${fmt(v)}¢`));
  stashSel = null;
  saveGame();
  renderStash();
  // controle: o seletor fica na mesma casa
  const cells = document.querySelectorAll(where === 'stash' ? '#stash-grid > .cell' : '#stash-inv > .cell');
  const ci = where === 'stash' ? idx - stashTab * STASH_TAB : idx;
  if (G.lastInput === 'pad' && cells.length) restoreFocus(cells[Math.max(0, Math.min(ci, cells.length - 1))]);
  else clearFocus();
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
// Créditos no baú: dinheiro compartilhado entre todos os personagens.
// save.bank = { aparelho: { in: total guardado, out: total retirado } }; os contadores só crescem,
// então a sincronização junta aparelhos sem perder nem duplicar (ver mergeBank em sync.js).
// ------------------------------------------------------------------
const bankData = () => (G.save.bank && typeof G.save.bank === 'object' ? G.save.bank : (G.save.bank = {}));
export function bankBalance() {
  let n = 0;
  for (const v of Object.values(bankData())) if (v) n += (Number(v.in) || 0) - (Number(v.out) || 0);
  return Math.max(0, Math.floor(n));
}
function bankMine() {
  const b = bankData();
  const d = devId();
  const v = b[d];
  if (!v || typeof v !== 'object') return (b[d] = { in: 0, out: 0 });
  v.in = Number(v.in) || 0;
  v.out = Number(v.out) || 0;
  return v;
}

// valor escolhido pela pessoa: null ou { put: guardar/pegar, amt: quanto, step: passo do − / + }
let bankEdit = null;
const BANK_STEPS = [100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
const bankMax = (put) => (put ? Math.floor(G.char.credits || 0) : bankBalance());

function renderBank() {
  const c = G.char;
  const bal = bankBalance();
  const cr = Math.floor(c.credits || 0);
  const put = cr <= 0 ? 'disabled' : '';
  const take = bal <= 0 ? 'disabled' : '';
  let h = `<div class="bank-row"><span>💰 ${L('No baú', 'In stash')}</span><b class="bank-val">${fmt(bal)}¢</b></div>
<div class="bank-row bank-mine"><span>${L('Seus créditos', 'Your credits')}</span><b>${fmt(cr)}¢</b></div>`;
  if (bankEdit) {
    // valor customizado: digita no campo (teclado/toque) ou ajusta com − / + (o botão do meio troca o passo)
    const E = bankEdit;
    const max = bankMax(E.put);
    E.amt = Math.max(0, Math.min(max, Math.floor(E.amt) || 0));
    h += `<div class="bank-row bank-lbl"><span>${E.put ? `📥 ${L('Guardar quanto?', 'Store how much?')}` : `📤 ${L('Pegar quanto?', 'Take how much?')}`}</span><span>${L('máx.', 'max')} ${fmt(max)}¢</span></div>
<input type="text" id="bank-amt" class="bank-amt" inputmode="numeric" autocomplete="off" spellcheck="false" enterkeyhint="done" data-nav value="${fmt(E.amt)}" />
<div class="bank-btns bank-steps"><button class="btn small" data-nav data-bank="dec">−</button><button class="btn small" data-nav data-bank="step" title="${L('Trocar o passo do − / +', 'Change the − / + step')}">± ${short(E.step)}</button><button class="btn small" data-nav data-bank="inc">+</button><button class="btn small" data-nav data-bank="max">${L('Máx.', 'Max')}</button></div>
<div class="bank-btns"><button class="btn small" data-nav data-bank="ok" ${E.amt > 0 ? '' : 'disabled'}>✔ ${E.put ? L('Guardar', 'Store') : L('Pegar', 'Take')}</button><button class="btn small ghost" data-nav data-bank="cancel">✕</button></div>`;
  } else {
    h += `<div class="bank-btns"><span class="bank-lbl">📥 ${L('Guardar', 'Store')}</span><button class="btn small" data-nav data-bank="put-half" ${put}>½</button><button class="btn small" data-nav data-bank="put-all" ${put}>${L('Tudo', 'All')}</button><button class="btn small" data-nav data-bank="put-custom" title="${L('Escolher o valor', 'Choose the amount')}" ${put}>✏️</button></div>
<div class="bank-btns"><span class="bank-lbl">📤 ${L('Pegar', 'Take')}</span><button class="btn small" data-nav data-bank="take-half" ${take}>½</button><button class="btn small" data-nav data-bank="take-all" ${take}>${L('Tudo', 'All')}</button><button class="btn small" data-nav data-bank="take-custom" title="${L('Escolher o valor', 'Choose the amount')}" ${take}>✏️</button></div>`;
  }
  $('stash-bank').innerHTML = h;
  const inp = $('bank-amt');
  if (inp) {
    // só dígitos; o valor passa do máximo vira o máximo
    inp.addEventListener('input', () => {
      bankEdit.amt = Math.min(bankMax(bankEdit.put), +inp.value.replace(/\D/g, '') || 0);
      const ok = $('stash-bank').querySelector('[data-bank="ok"]');
      if (ok) ok.disabled = !(bankEdit.amt > 0);
    });
    // sem redesenhar aqui: o clique em ✔ logo depois cairia num botão já trocado
    inp.addEventListener('blur', () => (inp.value = fmt(bankEdit ? bankEdit.amt : 0)));
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        bankAction('ok');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        bankAction('cancel');
      }
    });
  }
}

// redesenha mantendo o seletor do controle (ou o foco do campo) no mesmo lugar
function renderBankKeep(sel) {
  renderBank();
  if (G.lastInput === 'pad') restoreFocus(document.querySelector(`${sel}:not(:disabled)`) || document.querySelector('#stash-bank [data-bank]:not(:disabled)') || $('stash-close'));
}

// fecha o valor customizado (Esc / {B}); devolve true se estava aberto
export function bankEditClose() {
  if (!bankEdit) return false;
  const put = bankEdit.put;
  bankEdit = null;
  sfx.click();
  renderBankKeep(`[data-bank="${put ? 'put' : 'take'}-custom"]`);
  return true;
}

function bankAction(act) {
  if (act === 'put-custom' || act === 'take-custom') {
    const put = act === 'put-custom';
    const max = bankMax(put);
    if (max <= 0) return sfx.deny();
    // passo inicial: uns 10% do máximo, arredondado para uma potência de 10
    const step = BANK_STEPS.reduce((s, x) => (x <= max / 10 ? x : s), BANK_STEPS[0]);
    bankEdit = { put, amt: Math.ceil(max / 2), step };
    sfx.click();
    renderBank();
    if (G.lastInput === 'pad') restoreFocus('[data-bank="inc"]');
    else if (!G.isTouch) {
      const inp = $('bank-amt');
      if (inp) inp.focus();
    }
    return;
  }
  if (!bankEdit) return bankMove(act);
  const E = bankEdit;
  if (act === 'cancel') return bankEditClose();
  if (act === 'ok') {
    if (!(E.amt > 0)) return sfx.deny();
    const amt = E.amt;
    bankEdit = null;
    return bankMove(E.put ? 'put' : 'take', amt);
  }
  if (act === 'step') E.step = BANK_STEPS[(BANK_STEPS.indexOf(E.step) + 1) % BANK_STEPS.length] || BANK_STEPS[0];
  else if (act === 'inc') E.amt += E.step;
  else if (act === 'dec') E.amt -= E.step;
  else if (act === 'max') E.amt = bankMax(E.put);
  sfx.click();
  renderBankKeep(`[data-bank="${act}"]`);
}

// act: 'put-half' | 'put-all' | 'take-half' | 'take-all' | 'put' / 'take' com o valor em amt
function bankMove(act, amt) {
  const c = G.char;
  const put = act.startsWith('put');
  const have = bankMax(put);
  if (have <= 0) return sfx.deny();
  const n = amt ? Math.min(have, Math.floor(amt)) : act.endsWith('all') ? have : Math.ceil(have / 2);
  if (n <= 0) return sfx.deny();
  const me = bankMine();
  if (put) {
    c.credits -= n;
    me.in += n;
  } else {
    me.out += n;
    c.credits += n;
  }
  sfx.coin();
  toast(put ? `📥 ${L(`${fmt(n)}¢ guardados no baú`, `${fmt(n)}¢ stored in the stash`)}` : `📤 ${L(`${fmt(n)}¢ retirados do baú`, `${fmt(n)}¢ taken from the stash`)}`, 'item');
  saveGame();
  renderBankKeep(amt ? `[data-bank="${act}-custom"]` : `[data-bank="${act}"]`);
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
export function toggleFullscreen() {
  const on = document.fullscreenElement || document.webkitFullscreenElement;
  mobileFullOptOut = !!on;
  if (!on) (G.isTouch ? enterMobileFullscreen() : enterDesktopFullscreen(true));
  else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
}
// ícone dos botões de tela cheia (entrar / sair) segue o estado real
function syncFullIcon() {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle('is-full', on);
  const t = on ? L('Sair da tela cheia', 'Exit fullscreen') : L('Tela cheia', 'Fullscreen');
  for (const id of ['menu-full', 'btn-full']) {
    const b = document.getElementById(id);
    if (b) b.title = t;
  }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !G.isTouch) fullOptOut = true;
  syncFullIcon();
});
document.addEventListener('webkitfullscreenchange', syncFullIcon);

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
