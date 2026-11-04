// Entrada unificada: teclado + mouse, controle (Gamepad API) e toque.
import { G } from './state.js';
import { initAudio } from './audio.js';
import { detectPadType } from './padglyphs.js';

const KB = {
  KeyQ: 's1', KeyE: 's2', KeyR: 's3',
  Digit1: 's1', Digit2: 's2', Digit3: 's3',
  Space: 'primary', KeyF: 'stim', Digit4: 'stim',
  KeyI: 'inv', Tab: 'inv', KeyC: 'inv', KeyK: 'skills',
  Escape: 'pause', KeyP: 'pause',
};
const ACTIONS = ['primary', 's1', 's2', 's3', 'stim', 'inv', 'skills', 'pause'];
const NAV = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb'];

const src = { kb: {}, mouse: {}, touch: {}, pad: {} };
const latch = {}; // garante que toques rápidos (apertar e soltar no mesmo quadro) sejam vistos
const held = {};
const prev = {};
const navHeld = {};
const navPrev = {};
const navRepeat = {};
const keys = new Set();

export const Input = {
  move: { x: 0, y: 0 },
  aimStick: { x: 0, y: 0 },
  mouse: { x: innerWidth / 2, y: innerHeight / 2, lmb: false, lmbPressed: false, shift: false, onCanvas: false },
  joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  held,
  prev,
  padConnected: false,
  pressed(a) {
    return !!held[a] && !prev[a];
  },
  nav(n) {
    return !!navHeld[n] && (!navPrev[n] || navRepeat[n]);
  },
  update,
  endFrame() {
    this.mouse.lmbPressed = false;
  },
  reset() {
    for (const s of Object.values(src)) for (const k in s) s[k] = false;
    this.mouse.lmb = false;
    keys.clear();
  },
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
      if (e.target === document.body || e.target === canvas) e.preventDefault();
    }
    Input.mouse.shift = e.shiftKey;
    if (e.repeat) return;
    keys.add(e.code);
    G.lastInput = 'kb';
    const a = KB[e.code];
    if (a) {
      src.kb[a] = true;
      latch[a] = true;
    }
    initAudio();
  });
  window.addEventListener('keyup', (e) => {
    Input.mouse.shift = e.shiftKey;
    keys.delete(e.code);
    const a = KB[e.code];
    if (a) src.kb[a] = false;
  });
  window.addEventListener('blur', () => Input.reset());

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    if (e.pointerType === 'mouse') {
      G.lastInput = 'kb';
      Input.mouse.x = e.clientX;
      Input.mouse.y = e.clientY;
      if (e.button === 0) {
        Input.mouse.lmb = true;
        Input.mouse.lmbPressed = true;
      } else if (e.button === 2) {
        src.mouse.s1 = true;
        latch.s1 = true;
      }
    } else {
      setTouchMode();
      if (!Input.joy.active && e.clientX < innerWidth * 0.55) {
        const j = Input.joy;
        j.active = true;
        j.id = e.pointerId;
        j.ox = e.clientX;
        j.oy = e.clientY;
        j.x = 0;
        j.y = 0;
        canvas.setPointerCapture(e.pointerId);
        showJoy();
      }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      Input.mouse.x = e.clientX;
      Input.mouse.y = e.clientY;
      Input.mouse.onCanvas = true;
    } else if (Input.joy.active && e.pointerId === Input.joy.id) {
      const j = Input.joy;
      let dx = e.clientX - j.ox;
      let dy = e.clientY - j.oy;
      const R = 55;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        // arrasta a base junto para ficar confortável
        j.ox += (dx / l) * (l - R);
        j.oy += (dy / l) * (l - R);
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      j.x = dx / R;
      j.y = -dy / R;
      showJoy();
    }
  });
  const endPointer = (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) Input.mouse.lmb = false;
      if (e.button === 2) src.mouse.s1 = false;
    } else if (Input.joy.active && e.pointerId === Input.joy.id) {
      Input.joy.active = false;
      Input.joy.x = Input.joy.y = 0;
      showJoy();
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') Input.mouse.onCanvas = false;
  });

  window.addEventListener('gamepadconnected', () => {
    Input.padConnected = true;
    setPadMode();
  });
  window.addEventListener('gamepaddisconnected', () => {
    Input.padConnected = false;
  });
}

// Modo controle: liga o destaque de seleção nos menus
export function setPadMode() {
  G.lastInput = 'pad';
  document.body.classList.add('pad');
}

export function setTouchMode() {
  G.lastInput = 'touch';
  G.isTouch = true;
  document.body.classList.add('touch');
}

export function bindTouchButton(el, action) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    initAudio();
    if (e.pointerType !== 'mouse') setTouchMode();
    src.touch[action] = true;
    latch[action] = true;
    el.classList.add('down');
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  const up = () => {
    src.touch[action] = false;
    el.classList.remove('down');
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}

let joyEl = null;
let knobEl = null;
function showJoy() {
  if (!joyEl) {
    joyEl = document.getElementById('joy');
    knobEl = document.getElementById('joy-knob');
  }
  const j = Input.joy;
  if (j.active) {
    joyEl.classList.add('active');
    joyEl.style.left = j.ox + 'px';
    joyEl.style.top = j.oy + 'px';
    knobEl.style.transform = `translate(${j.x * 55}px, ${-j.y * 55}px)`;
  } else {
    joyEl.classList.remove('active');
    joyEl.style.left = '';
    joyEl.style.top = '';
    knobEl.style.transform = '';
  }
}

function update(dt) {
  // ---- controle ----
  let padMove = { x: 0, y: 0 };
  const aim = { x: 0, y: 0 };
  const padNav = {};
  src.pad = {};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  // usa o controle mexido por último (alguns sistemas listam controles virtuais/fantasmas antes do real)
  let gp = null;
  for (const p of pads) if (p && p.connected && (!gp || (p.timestamp || 0) > (gp.timestamp || 0))) gp = p;
  if (gp) {
    Input.padConnected = true;
    const pt = detectPadType(gp.id);
    if (pt !== G.padType) {
      G.padType = pt;
      document.body.dataset.pad = pt;
      window.dispatchEvent(new Event('padtypechange'));
    }
    const dz = (v) => (Math.abs(v) < 0.22 ? 0 : v);
    padMove.x = dz(gp.axes[0] || 0);
    padMove.y = -dz(gp.axes[1] || 0);
    // controles "não padrão" (comum no Firefox): os eixos 2/3 podem ser gatilhos
    // em repouso (-1) e o direcional costuma vir nos eixos 6/7
    const std = gp.mapping === 'standard';
    if (std) {
      aim.x = dz(gp.axes[2] || 0);
      aim.y = -dz(gp.axes[3] || 0);
    } else if (gp.axes.length >= 8) {
      const hx = gp.axes[6] || 0;
      const hy = gp.axes[7] || 0;
      if (Math.abs(hx) > 0.5) padMove.x = Math.sign(hx);
      if (Math.abs(hy) > 0.5) padMove.y = -Math.sign(hy);
    }
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (b(12)) padMove.y = 1;
    if (b(13)) padMove.y = -1;
    if (b(14)) padMove.x = -1;
    if (b(15)) padMove.x = 1;
    src.pad.primary = b(0) || b(7) || b(5);
    src.pad.s1 = b(2);
    src.pad.s2 = b(3);
    src.pad.s3 = b(1);
    src.pad.stim = b(4) || b(6);
    src.pad.pause = b(9);
    src.pad.inv = b(8);
    padNav.up = b(12) || padMove.y > 0.6;
    padNav.down = b(13) || padMove.y < -0.6;
    padNav.left = b(14) || padMove.x < -0.6;
    padNav.right = b(15) || padMove.x > 0.6;
    padNav.a = b(0);
    padNav.b = b(1);
    padNav.x = b(2);
    padNav.y = b(3);
    padNav.lb = b(4);
    padNav.rb = b(5);
    const any = gp.buttons.some((x) => x.pressed) || Math.hypot(padMove.x, padMove.y) > 0 || Math.hypot(aim.x, aim.y) > 0;
    if (any) setPadMode();
  }
  if (G.lastInput !== 'pad') document.body.classList.remove('pad');

  // ---- ações ----
  for (const a of ACTIONS) {
    prev[a] = held[a];
    held[a] = !!(src.kb[a] || src.mouse[a] || src.touch[a] || src.pad[a] || latch[a]);
    latch[a] = false;
  }

  // ---- navegação de menus (controle) ----
  for (const n of NAV) {
    navPrev[n] = navHeld[n];
    navHeld[n] = !!padNav[n];
    if (navHeld[n] && navPrev[n] && ['up', 'down', 'left', 'right'].includes(n)) {
      navRepeat[n] = (navRepeat[n + 'T'] = (navRepeat[n + 'T'] || 0) + dt) > 0.35 && ((navRepeat[n + 'C'] = (navRepeat[n + 'C'] || 0) + dt) > 0.09);
      if (navRepeat[n]) navRepeat[n + 'C'] = 0;
    } else {
      navRepeat[n] = false;
      navRepeat[n + 'T'] = 0;
      navRepeat[n + 'C'] = 0;
    }
  }

  // ---- movimento ----
  let kx = 0;
  let ky = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  if (kx || ky) {
    const l = Math.hypot(kx, ky);
    Input.move.x = kx / l;
    Input.move.y = ky / l;
  } else if (padMove.x || padMove.y) {
    const l = Math.min(1, Math.hypot(padMove.x, padMove.y));
    const n = Math.hypot(padMove.x, padMove.y) || 1;
    Input.move.x = (padMove.x / n) * l;
    Input.move.y = (padMove.y / n) * l;
  } else if (Input.joy.active) {
    Input.move.x = Input.joy.x;
    Input.move.y = Input.joy.y;
  } else {
    Input.move.x = 0;
    Input.move.y = 0;
  }
  Input.aimStick.x = aim.x;
  Input.aimStick.y = aim.y;
}
