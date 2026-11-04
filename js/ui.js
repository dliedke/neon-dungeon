// Interface: HUD, menus, inventário, minimapa e navegação por controle.
import { G } from './state.js';
import { Input, bindTouchButton } from './input.js';
import { CLASSES, CLASS_ORDER, iconSvg, rankMult } from './classes.js';
import { SLOTS, SLOT_NAMES, RARITY, LEGENDARIES, itemCardHtml, itemScore, recycleValue, slotIconSvg } from './items.js';
import { xpNeeded, refreshStats, skillCost, skillCd, stimPrice, MAX_STIMS, respawn, MAX_LEVEL, spendPoint, assignSlot } from './player.js';
import { INV_SIZE } from './loot.js';
import { DIFFICULTY } from './enemies.js';
import { sfx, applyVolumes, initAudio } from './audio.js';
import { startGame, quitToMenu, saveGame, saveSettings, applyQuality } from './main.js';
import { fmt } from './utils.js';
import { L, t } from './i18n.js';
import { glyph, glyphText, padText, padName } from './padglyphs.js';
import { itemName, isUpgrade } from './items.js';

const $ = (id) => document.getElementById(id);
let selected = null; // { where: 'inv'|'equip', uid, slot }
let focused = null;
let lastPanel = null;

// ------------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------------
export function initUI() {
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
  $('shop-close').onclick = () => closeShop();

  // opções
  const s = G.settings;
  $('opt-music').value = s.music;
  $('opt-sfx').value = s.sfx;
  $('opt-music').oninput = (e) => {
    s.music = +e.target.value;
    applyVolumes();
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
  const diffOrder = ['easy', 'normal', 'hard'];
  const updD = () => ($('opt-diff').textContent = DIFFICULTY[s.difficulty]?.name || 'Normal');
  updD();
  $('opt-diff').onclick = () => {
    s.difficulty = diffOrder[(diffOrder.indexOf(s.difficulty) + 1) % diffOrder.length];
    updD();
    saveSettings();
    if (G.mode !== 'menu') toast(L('A nova dificuldade vale a partir do próximo andar.', 'The new difficulty applies from the next floor.'));
  };
  const updS = () => ($('opt-shake').textContent = s.shake ? L('Ligado', 'On') : L('Desligado', 'Off'));
  updS();
  $('opt-shake').onclick = () => {
    s.shake = !s.shake;
    updS();
    saveSettings();
  };
  $('opt-full').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  // botões de toque
  bindTouchButton($('tb-primary'), 'primary');
  bindTouchButton($('tb-s1'), 's1');
  bindTouchButton($('tb-s2'), 's2');
  bindTouchButton($('tb-s3'), 's3');
  bindTouchButton($('tb-stim'), 'stim');
  $('tb-stim').querySelector('.icon').innerHTML = iconSvg('stim');
  $('sk4').querySelector('.icon').innerHTML = iconSvg('stim');

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
  G.mode = 'menu';
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderClassCards();
  clearFocus();
}

function renderClassCards() {
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
      <div class="cskills">${C.skills.map((s) => `<div title="${s.name}">${iconSvg(s.icon)}</div>`).join('')}</div>
      <div class="csave">${save ? L(`Nível <b>${save.level}</b> · Andar <b>${save.floor}</b> · ${save.kills || 0} abates`, `Level <b>${save.level}</b> · Floor <b>${save.floor}</b> · ${save.kills || 0} kills`) : L('Novo personagem', 'New character')}</div>
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

// Índices das habilidades em cada botão: [ataque básico, Q, E, R]
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
  const labels = pad ? [glyph('a'), glyph('x'), glyph('y'), glyph('b'), glyph('lb')] : ['LMB', 'Q', 'E', 'R', 'F'];
  labels.forEach((l, k) => ($('sk' + k).querySelector('.key').innerHTML = l));
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
export function updateHUD(dt) {
  const p = G.player;
  const c = G.char;
  if (!p) return;
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
  setText('credits-val', fmt(c.credits));
  setText('stim-count', String(c.stims));
  setText('tstim-count', String(c.stims));

  const lowHp = p.alive && p.hp / s.maxHp < 0.28;
  $('hurt').classList.toggle('low', lowHp);

  // habilidades
  const bar = barSkills();
  for (let b = 0; b < 4; b++) {
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
  $('sk4').querySelector('.cd').style.setProperty('--p', sk.toFixed(2));
  $('tb-stim').querySelector('.cd').style.setProperty('--p', sk.toFixed(2));

  // buffs
  const buffs = [];
  if (p.buffs.overclock > 0) buffs.push(`Overclock ${p.buffs.overclock.toFixed(0)}s`);
  if (p.sureCrit > 0) buffs.push(`${L('Crítico', 'Crit')} x${p.sureCrit}`);
  if (p.shield > 1) buffs.push(`${L('Escudo', 'Shield')} ${Math.round(p.shield)}`);
  if (p.buffs.regen > 0) buffs.push(L('Regeneração', 'Regen'));
  if (p.buffs.titan > 0) buffs.push(`${L('Titânio', 'Titanium')} ${p.buffs.titan.toFixed(0)}s`);
  if (p.spin > 0.05) buffs.push(`${L('Giro', 'Spin')} ${Math.round(100 + p.spin * 200)}%`);
  const bh = buffs.map((b) => `<span class="buff">${b}</span>`).join('');
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
  if (G.boss) {
    setScale($('boss-fill'), G.boss.hp / G.boss.maxHp);
    setScale($('boss-lag'), G.boss.hp / G.boss.maxHp);
  }

  // badge de pontos de habilidade
  $('char-badge').classList.toggle('hidden', !(c.skillPoints > 0));

  mmTimer -= dt;
  if (mmTimer <= 0) {
    mmTimer = 0.08;
    drawMinimap();
  }
}

export function bossBar(e) {
  if (!e) {
    $('boss-bar').classList.add('hidden');
    return;
  }
  $('boss-bar').classList.remove('hidden');
  $('boss-name').textContent = e.name.toUpperCase();
}

export function exitPrompt(state, k) {
  const el = $('exit-prompt');
  if (!state) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('locked', state === 'locked');
  setText('exit-text', state === 'locked' ? L('ELEVADOR BLOQUEADO — DERROTE O CHEFE', 'ELEVATOR LOCKED — DEFEAT THE BOSS') : L(`DESCENDO PARA O ANDAR ${G.floor + 1}…`, `GOING DOWN TO FLOOR ${G.floor + 1}…`));
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
  setTimeout(() => el.classList.add('out'), cls === 'leg' ? 4000 : 2200);
  setTimeout(() => el.remove(), cls === 'leg' ? 4500 : 2700);
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
  toast(L(`NÍVEL ${level}! +1 PONTO DE HABILIDADE`, `LEVEL ${level}! +1 SKILL POINT`), 'lvl');
}

// ------------------------------------------------------------------
// Minimapa
// ------------------------------------------------------------------
let mmCanvas = null;
let mmCtx = null;
export function resetMinimap(d) {
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
    if (t === 1) mmCtx.fillStyle = 'rgba(120,140,220,0.55)';
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
  // saída
  const ex = d.exit;
  if (d.explored[Math.floor(ex.z) * d.W + Math.floor(ex.x)]) {
    ctx.fillStyle = G.dungeon.meshes.exit.locked ? '#ff2244' : '#ffffff';
    ctx.beginPath();
    ctx.arc(ex.x, ex.z, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // inimigos próximos
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - p.x) > 22 || Math.abs(e.z - p.z) > 22) continue;
    if (e.inert) {
      if (!d.explored[Math.floor(e.z) * d.W + Math.floor(e.x)]) continue;
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(e.x - 0.3, e.z - 0.3, 0.6, 0.6);
      continue;
    }
    if (!d.explored[Math.floor(e.z) * d.W + Math.floor(e.x)]) continue;
    ctx.fillStyle = e.boss ? '#ff2244' : e.elite ? '#ffd23d' : '#ff4466';
    const r = e.boss ? 1.3 : e.elite ? 0.7 : 0.45;
    ctx.fillRect(e.x - r, e.z - r, r * 2, r * 2);
  }
  // itens
  for (const pk of G.pickups) {
    if (pk.type === 'chest' && !pk.opened) {
      if (!d.explored[Math.floor(pk.z) * d.W + Math.floor(pk.x)]) continue;
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(pk.x - 0.6, pk.z - 0.6, 1.2, 1.2);
      continue;
    }
    if (pk.type !== 'item' || (pk.item.rarity < 1 && !pk.up)) continue;
    ctx.fillStyle = pk.up ? '#39ff88' : RARITY[pk.item.rarity].color;
    const r = pk.up ? 0.75 : 0.4;
    ctx.fillRect(pk.x - r, pk.z - r, r * 2, r * 2);
  }
  ctx.restore();
  // jogador no centro (seta apontando para a direção)
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.rotate(Math.PI / 4 - p.facing + Math.PI);
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
        ? `<div class="cell r${it.rarity}${sel}" data-nav data-uid="${it.uid}" data-where="equip" data-slot="${slot}">${slotIconSvg(slot)}</div>`
        : `<div class="cell empty">${slotIconSvg(slot)}</div>`}${SLOT_NAMES[slot]}</div>`;
    }).join('');
    // inventário
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
      html += `<div class="cell r${it.rarity}${sel}${better ? ' better' : ''}" data-nav data-uid="${it.uid}" data-where="inv" data-slot="${it.slot}">${slotIconSvg(it.slot)}${up}</div>`;
    }
    $('inv-grid').innerHTML = html;
    $('inv-count').textContent = `${L('Inventário', 'Inventory')} ${c.inv.length}/${INV_SIZE}`;
    $('inv-credits').textContent = fmt(c.credits);
    const price = stimPrice();
    $('btn-buy-stim').textContent = `${L('Comprar Stim', 'Buy Stim')} (${price}¢) · ${c.stims}/${MAX_STIMS}`;
    $('btn-buy-stim').disabled = c.credits < price || c.stims >= MAX_STIMS;
    $('btn-recycle-all').disabled = !c.inv.length;
    // atributos
    const s = p.stats;
    const rows = [
      [L('Vida', 'Health'), fmt(s.maxHp)],
      [L('Energia', 'Energy'), fmt(s.maxEn)],
      [L('Dano da arma', 'Weapon damage'), `${fmt(s.wMin)}–${fmt(s.wMax)}`],
      [L('Bônus de dano', 'Damage bonus'), `+${fmt(s.dmgPct)}%`],
      [L('Crítico', 'Critical'), `${s.crit.toFixed(0)}% · +${fmt(s.critDmg)}%`],
      [L('Vel. de ataque', 'Attack speed'), `${s.atkRate.toFixed(2)}/s`],
      [L('Blindagem', 'Armor'), `${fmt(s.armor)} (-${Math.round((s.armor / (100 + s.armor)) * 100)}%)`],
      [L('Movimento', 'Movement'), `${s.speed.toFixed(1)}`],
      [L('Regeneração', 'Regeneration'), `${s.hpRegen.toFixed(1)}/s · ${s.enRegen.toFixed(1)} en/s`],
    ];
    if (s.lifeSteal) rows.push([L('Roubo de vida', 'Life steal'), `${s.lifeSteal.toFixed(1)}%`]);
    if (s.cdr) rows.push([L('Recarga', 'Cooldown'), `-${s.cdr}%`]);
    if (s.xpPct) rows.push([L('Experiência', 'Experience'), `+${s.xpPct}%`]);
    if (s.findPct) rows.push([L('Achar itens', 'Item find'), `+${s.findPct}%`]);
    let sh = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    for (const l of s.legs) sh += `<div class="leg">◆ ${LEGENDARIES[l].name}</div>`;
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
  { label: [2, 4], idx: [2, 3] },
  { label: [5, 9], idx: [4, 5, 6] },
  { label: [12, 15], idx: [7, 8] },
];
function slotKey(k) {
  if (G.lastInput === 'pad') return glyphText(['x', 'y', 'b'][k]);
  if (G.isTouch) return String(k + 1);
  return ['Q', 'E', 'R'][k];
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

// Coloca o poder no próximo botão (Q → E → R)
function treeCycleSlot(i) {
  const c = G.char;
  if (i === 0 || !(c.skills[i] > 0)) return sfx.deny();
  const cur = c.slots.indexOf(i);
  assignSlot((cur + 1) % 3, i);
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
    for (const i of t.idx) {
      const sk = C.skills[i];
      if (!sk) continue;
      const r = c.skills[i] || 0;
      const req = sk.req || 1;
      const locked = r === 0;
      const canLearn = locked && c.level >= req && c.skillPoints > 0;
      const canUp = !locked && r < 10 && c.skillPoints > 0;
      const slot = c.slots.indexOf(i);
      const state = locked ? (c.level >= req ? 'available' : 'locked') : 'learned';
      html += `<button class="tnode ${state}${treeSel === i ? ' sel' : ''}${canLearn || canUp ? ' can' : ''}" data-nav data-node="${i}" title="${sk.name}">
        <span class="ticon">${iconSvg(sk.icon)}</span>
        <span class="tbadge">${locked ? (c.level >= req ? '+' : `🔒${req}`) : `${r}/10`}</span>
        ${slot >= 0 ? `<span class="tslot">${slotKey(slot)}</span>` : i === 0 ? `<span class="tslot">⚔</span>` : ''}
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
  const meta = i === 0 ? L('Ataque básico', 'Basic attack') : L(`Custo ${skillCost(i)} de energia · Recarga ${skillCd(i).toFixed(1)}s`, `Cost ${skillCost(i)} energy · Cooldown ${skillCd(i).toFixed(1)}s`);
  let status = '';
  if (locked && c.level < req) status = `<div class="tstatus lock">🔒 ${L(`Liberado no nível ${req}`, `Unlocks at level ${req}`)}</div>`;
  else if (locked) status = `<div class="tstatus">${L('Disponível para desbloquear', 'Available to unlock')}</div>`;
  else status = `<div class="tstatus ok">${L('Nível', 'Level')} ${r}/10${r < 10 ? L(` · próximo: ${Math.round(rankMult(r + 1) * 100)}% de potência`, ` · next: ${Math.round(rankMult(r + 1) * 100)}% power`) : ''}</div>`;
  const canSpend = c.skillPoints > 0 && r < 10 && c.level >= req;
  let actions = `<button class="btn" data-nav data-spend="${i}" ${canSpend ? '' : 'disabled'}>${locked ? L('Desbloquear (1 ponto)', 'Unlock (1 point)') : L('+ Evoluir (1 ponto)', '+ Upgrade (1 point)')}</button>`;
  if (i > 0 && !locked) {
    actions += `<div class="slot-pick"><span>${L('Colocar no botão:', 'Assign to button:')}</span>${[0, 1, 2].map((k) => `<button class="btn small ${c.slots[k] === i ? '' : 'ghost'}" data-nav data-slot="${k}">${slotKey(k)}</button>`).join('')}</div>`;
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
  const el = document.querySelector(sel);
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
  let actions = '';
  if (selected.where === 'inv') {
    actions = `<div class="detail-actions"><button class="btn small" data-nav data-act="equip">${L('Equipar', 'Equip')}</button><button class="btn small danger" data-nav data-act="recycle">${L('Reciclar', 'Recycle')} (+${recycleValue(it)}¢)</button></div>`;
  } else {
    actions = `<div class="detail-actions"><button class="btn small ghost" data-nav data-act="unequip">${L('Desequipar', 'Unequip')}</button></div>`;
  }
  let cmp = '';
  if (selected.where === 'inv' && c.equip[it.slot]) cmp = `<div class="it-cmp">${L('Equipado atualmente', 'Currently equipped')}</div>${itemCardHtml(c.equip[it.slot])}`;
  el.innerHTML = itemCardHtml(it) + actions + cmp;
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'equip') equipItem(it.uid);
    else if (a === 'recycle') recycleItem(it.uid);
    else unequip(selected.slot);
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
  restoreFocus(`.cell[data-uid="${old ? old.uid : it.uid}"]`);
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
}

function recycleItem(uid) {
  const c = G.char;
  const idx = c.inv.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  const it = c.inv[idx];
  const v = recycleValue(it);
  c.inv.splice(idx, 1);
  c.credits += v;
  sfx.coin();
  toast(L(`Reciclado: +${v}¢`, `Recycled: +${v}¢`));
  selected = null;
  renderChar();
  const next = c.inv[Math.min(idx, c.inv.length - 1)];
  if (next) restoreFocus(`.cell[data-uid="${next.uid}"]`);
}

// Recicla todo o inventário (o que está equipado não é tocado)
function recycleAll() {
  const c = G.char;
  if (!c.inv.length) return;
  const n = c.inv.length;
  const total = c.inv.reduce((s, it) => s + recycleValue(it), 0);
  const ups = c.inv.filter((it) => isUpgrade(it, c.equip)).length;
  const warn = ups ? L(` Atenção: ${ups} ${ups > 1 ? 'são melhores' : 'é melhor'} que o equipado (▲).`, ` Warning: ${ups} ${ups > 1 ? 'are' : 'is'} better than what you have equipped (▲).`) : '';
  confirmDialog(L('Reciclar tudo?', 'Recycle all?'), L(`Reciclar os ${n} itens do inventário por ${fmt(total)}¢? Os equipados ficam.`, `Recycle all ${n} inventory items for ${fmt(total)}¢? Equipped items are kept.`) + warn, () => {
    c.inv = [];
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
const PANEL_ORDER = ['panel-confirm', 'panel-opts', 'panel-help', 'panel-dead', 'panel-shop', 'panel-char', 'panel-pause', 'menu'];
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
  if (el.matches('.cell[data-uid]') && G.lastInput === 'pad') selectCell(el);
  if (el.matches('[data-node]') && G.lastInput === 'pad' && +el.dataset.node !== treeSel) {
    treeSel = +el.dataset.node;
    renderTree();
    restoreFocus(`[data-node="${treeSel}"]`);
  }
}

function navigables(root) {
  return [...root.querySelectorAll('[data-nav]')].filter((el) => el.offsetParent !== null && !el.disabled);
}

function moveFocus(dir, list) {
  if (!focused) return setFocus(list[0]);
  const a = focused.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bs = Infinity;
  for (const el of list) {
    if (el === focused) continue;
    const b = el.getBoundingClientRect();
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
    const score = main + Math.abs(cross) * 2.2;
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
    } else if (focused.matches('.cell[data-uid]')) {
      if (focused.dataset.where === 'inv') equipItem(focused.dataset.uid);
      else unequip(focused.dataset.slot);
    } else focused.click();
  }
  if (Input.nav('x') && focused && focused.matches('.cell[data-where="inv"]')) recycleItem(focused.dataset.uid);
  if (Input.nav('x') && focused && focused.matches('[data-node]')) treeCycleSlot(+focused.dataset.node);
  if (Input.nav('y') && root.id === 'panel-char') setTab(currentTab === 'equip' ? 'skills' : 'equip');
  if (Input.nav('b')) uiBack(root);
}

export function uiBack(root = activePanel()) {
  if (!root) return;
  switch (root.id) {
    case 'panel-confirm':
    case 'panel-opts':
    case 'panel-help':
      closeOverlay(root.id);
      break;
    case 'panel-char':
      closeChar();
      break;
    case 'panel-shop':
      closeShop();
      break;
    case 'panel-pause':
      closePause();
      break;
  }
}

export function anyOverlayOpen() {
  return ['panel-confirm', 'panel-opts', 'panel-help'].some((id) => !$(id).classList.contains('hidden'));
}

// ------------------------------------------------------------------
// Loja do mercador (Mercado Noturno)
// ------------------------------------------------------------------
let shopStock = null;
export function openShop(stock) {
  if (G.mode !== 'play' || !stock) return;
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
    sfx.coin();
    toast(`${L('Comprado', 'Bought')}: ${itemName(copy)}`);
  }
  renderShop();
  clearFocus();
}

// ------------------------------------------------------------------
// Celular: tela cheia e orientação horizontal
// ------------------------------------------------------------------
// Precisa ser chamado dentro de um toque/clique (exigência dos navegadores)
export function enterMobileFullscreen() {
  if (!G.isTouch) return;
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
