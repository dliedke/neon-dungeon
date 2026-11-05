// Ponto de entrada: renderização, câmera, laço principal, andares e salvamento.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, gk } from './state.js';
import { Input, initInput, setTouchMode } from './input.js';
import { initAudio, applyVolumes, sfx } from './audio.js';
import { generateDungeon, buildDungeonMeshes, themeFor, isBossFloor, computeFlow, updateWalls, revealAround, findPath, lineOfSight } from './dungeon.js';
import { initFx, updateFx, clearEffects, updateFloaters, clearFloaters, burst } from './fx.js';
import { populateFloor, updateEnemies, spawnEnemy } from './enemies.js';
import { updateProjectiles, updateTimers, updateTurrets, updateHazards, updateBarriers, updateDecoy } from './combat.js';
import { createPlayer, updatePlayer, placePlayer, newCharacter, refreshStats } from './player.js';
import { updatePickups, clearPickups, spawnPickup, spawnChest } from './loot.js';
import { CLASSES } from './classes.js';
import { placeFeatures, buildFeatures, updateBiome } from './biomes.js';
import { updatePowers, clearPowers } from './powers.js';
import { makeItem } from './items.js';
import { L, translateDom } from './i18n.js';
import { padText } from './padglyphs.js';
import { ensureAch, achAdd, achMark, achCheck } from './ach.js';
import { setSyncHooks, syncReadRedirect, syncShouldRefresh, syncAuthRedirect, syncStart, syncDirty, syncNow } from './sync.js';
import {
  initUI, showMenu, showHUD, updateHUD, banner, resetMinimap, markMinimap, uiPadUpdate, openPause, closePause,
  toggleChar, closeChar, bossBar, exitPrompt, toast, uiBack, anyOverlayOpen, updateOrientation, renderClassCards, renderSync,
} from './ui.js';
import { isTouchDevice, clamp } from './utils.js';

const SAVE_KEY = 'neon-dungeon-save-v1';
const SETTINGS_KEY = 'neon-dungeon-settings-v1';

const canvas = document.getElementById('game');
let renderer;
let composer;
let bloomPass;
let camera;
let scene;
let hemi;
let dirLight;
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpV = new THREE.Vector3();
const camPos = new THREE.Vector3();
let useBloom = true;
let flowT = 0;
let autosaveT = 0;
let achT = 1;
let transitioning = false;

// ------------------------------------------------------------------
// Salvamento
// ------------------------------------------------------------------
function loadSave() {
  let save = null;
  try {
    save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch (_) {}
  if (!save || !save.slots) save = { v: 1, slots: {} };
  ensureAch(save);
  G.save = save;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) Object.assign(G.settings, s);
  } catch (_) {}
}

// fromSync: gravação feita pela própria sincronização (não reenvia para a nuvem)
export function saveGame(fromSync) {
  if (G.char) G.save.slots[G.char.cls] = G.char;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(G.save));
  } catch (_) {}
  if (!fromSync) syncDirty();
}

export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings));
  } catch (_) {}
}

// ------------------------------------------------------------------
// Renderização
// ------------------------------------------------------------------
function initRenderer() {
  G.isTouch = isTouchDevice();
  if (G.isTouch) setTouchMode();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.isTouch, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 120);
  hemi = new THREE.HemisphereLight(0x8a90ff, 0x1a0f2a, 1.25);
  scene.add(hemi);
  dirLight = new THREE.DirectionalLight(0xd8ccff, 1.5);
  dirLight.position.set(7, 12, 9);
  scene.add(dirLight);
  G.scene = scene;
  G.camera = camera;
  G.renderer = renderer;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.35, 0.92);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  G.composer = composer;
  applyQuality();
  addEventListener('resize', onResize);
  onResize();
}

export function applyQuality() {
  if (!renderer) return;
  const q = G.settings.quality;
  const low = q === 'low' || (q === 'auto' && G.isTouch && Math.min(screen.width, screen.height) < 500);
  const glow = { strong: 0.75, medium: 0.5, low: 0.28, off: 0 }[G.settings.glow] ?? 0.5;
  bloomPass.strength = glow;
  useBloom = !low && glow > 0;
  const pr = q === 'high' ? Math.min(devicePixelRatio, 2) : low ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  onResize();
}

function onResize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  bloomPass.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// Distância da câmera conforme a proporção da tela
function camDistance() {
  const a = camera.aspect;
  if (a < 0.8) return 21;
  if (a < 1.2) return 17.5;
  return 14.5;
}

function updateCamera(dt, fx, fz) {
  const D = camDistance();
  const off = tmpV.set(D * 0.5, D * 0.78, D * 0.5);
  const k = 1 - Math.exp(-dt * 7);
  G.camFocus.x += (fx - G.camFocus.x) * k;
  G.camFocus.z += (fz - G.camFocus.z) * k;
  camPos.set(G.camFocus.x + off.x, off.y, G.camFocus.z + off.z);
  if (G.shake > 0 && G.settings.shake) {
    const s = G.shake * 0.6;
    camPos.x += (Math.random() - 0.5) * s;
    camPos.y += (Math.random() - 0.5) * s;
    camPos.z += (Math.random() - 0.5) * s;
  }
  G.shake = Math.max(0, G.shake - dt * 1.6);
  camera.position.copy(camPos);
  camera.lookAt(G.camFocus.x, 0.6, G.camFocus.z);
}

function updateMouseWorld() {
  const m = Input.mouse;
  const nx = (m.x / innerWidth) * 2 - 1;
  const ny = -(m.y / innerHeight) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, tmpV);
  if (hit) {
    G.mouseWorld.x = hit.x;
    G.mouseWorld.z = hit.z;
    G.mouseWorld.ok = true;
  }
  // inimigo sob o cursor: projeta e compara em pixels
  G.hoverEnemy = null;
  if (G.lastInput !== 'kb' || G.mode !== 'play') return;
  let best = 42;
  const v = new THREE.Vector3();
  for (const e of G.enemies) {
    if (!e.alive) continue;
    v.set(e.x, e.height * 0.5, e.z).project(camera);
    const sx = ((v.x + 1) / 2) * innerWidth;
    const sy = ((1 - v.y) / 2) * innerHeight;
    const d = Math.hypot(sx - m.x, sy - m.y) - e.r * 30;
    if (d < best) {
      best = d;
      G.hoverEnemy = e;
    }
  }
  canvas.style.cursor = G.hoverEnemy ? 'crosshair' : 'default';
}

// ------------------------------------------------------------------
// Andares
// ------------------------------------------------------------------
function clearWorld() {
  if (G.world) {
    scene.remove(G.world);
    G.world.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
  }
  clearEffects();
  clearFloaters();
  clearPickups();
  G.enemies = [];
  G.projectiles = [];
  G.turrets = [];
  G.timers = [];
  G.hazards = [];
  G.barriers = [];
  G.decoy = null;
  clearPowers();
  G.boss = null;
  bossBar(null);
}

function buildFloor(floor, withEnemies = true) {
  clearWorld();
  G.floor = floor;
  const theme = themeFor(floor);
  G.theme = theme;
  const d = generateDungeon(floor);
  G.dungeon = d;
  placeFeatures(d, theme);
  const world = buildDungeonMeshes(d, theme);
  buildFeatures(d, theme, world);
  G.world = world;
  scene.add(world);
  // iluminação e névoa de cada bioma
  const Lt = theme.light;
  scene.fog = new THREE.Fog(theme.fog, Lt.fogNear, Lt.fogFar);
  scene.background = new THREE.Color(theme.fog);
  hemi.color.set(Lt.sky);
  hemi.groundColor.set(Lt.ground);
  hemi.intensity = Lt.hemi;
  dirLight.color.set(Lt.dir);
  dirLight.intensity = Lt.dirI;
  resetMinimap(d);
  if (withEnemies) populateFloor(d, floor, isBossFloor(floor));
  return d;
}

export function startFloor(floor) {
  const d = buildFloor(floor);
  const c = G.char;
  c.floor = floor;
  c.maxFloor = Math.max(c.maxFloor || 1, floor);
  achMark('biomes', G.theme.id);
  placePlayer(d.start.x, d.start.z);
  G.camFocus.x = d.start.x;
  G.camFocus.z = d.start.z;
  const newly = revealAround(d, d.start.x, d.start.z, 8);
  markMinimap(newly);
  computeFlow(d, d.start.x, d.start.z);
  const word = L('ANDAR', 'FLOOR');
  document.getElementById('floor-label').textContent = `${word} ${floor} · ${G.theme.name.toUpperCase()}`;
  banner(`${word} ${floor}`, isBossFloor(floor) ? `${G.theme.name} · ${L('Chefe à frente', 'Boss ahead')}` : G.theme.name);
  if (G.theme.hint) setTimeout(() => G.floor === floor && toast(G.theme.hint), 2800);
  saveGame();
}

export function startGame(cls, fresh) {
  initAudio();
  if (fresh || !G.save.slots[cls]) {
    const old = G.save.slots[cls];
    G.char = newCharacter(cls);
    if (old) G.char.resetAt = G.char.created; // recomeço vale mais que o progresso antigo na nuvem
  }
  else G.char = G.save.slots[cls];
  sanitizeChar(G.char);
  if (G.player) {
    scene.remove(G.player.model.root);
    G.player = null;
  }
  createPlayer();
  showHUD();
  G.mode = 'play';
  startFloor(G.char.floor || 1);
  if (G.char.level === 1 && G.char.kills === 0) {
    setTimeout(() => toast(G.isTouch ? L('Arraste à esquerda para mover · botões à direita para atacar', 'Drag on the left to move · buttons on the right to attack') : G.lastInput === 'pad' ? padText(L('Analógico para mover · {A} para atacar · {X} {Y} {B} habilidades', 'Left stick to move · {A} to attack · {X} {Y} {B} skills')) : L('Clique para mover/atacar · Q/E/R habilidades · I inventário', 'Click to move/attack · Q/E/R skills · I inventory')), 2800);
  }
}

function sanitizeChar(c) {
  // saves antigos: tinham 4 habilidades, todas liberadas
  const n = CLASSES[c.cls].skills.length;
  c.skills = c.skills || [1, 1, 1, 1];
  while (c.skills.length < n) c.skills.push(0);
  if (!c.slots) c.slots = [1, 2, 3].map((i) => (c.skills[i] > 0 ? i : null));
  c.inv = c.inv || [];
  c.equip = c.equip || {};
  c.stims = c.stims ?? 3;
  c.credits = c.credits || 0;
  c.skillPoints = c.skillPoints || 0;
  c.kills = c.kills || 0;
  if (!c.equip.weapon) c.equip.weapon = newCharacter(c.cls).equip.weapon;
}

export function quitToMenu() {
  saveGame();
  if (G.player) {
    scene.remove(G.player.model.root);
    G.player = null;
  }
  G.char = null;
  syncNow();
  buildFloor(1, false);
  G.camFocus.x = G.dungeon.start.x;
  G.camFocus.z = G.dungeon.start.z;
  showMenu();
}

async function nextFloor() {
  if (transitioning) return;
  transitioning = true;
  sfx.elevator();
  const fade = document.getElementById('fade');
  fade.classList.add('on');
  G.mode = 'loading';
  await new Promise((r) => setTimeout(r, 450));
  achAdd('floors');
  startFloor(G.floor + 1);
  G.player.hp = Math.min(G.player.stats.maxHp, G.player.hp + G.player.stats.maxHp * 0.25);
  if (G.char.stims < 3) {
    G.char.stims++;
    setTimeout(() => toast(L('+1 Stim de cortesia do elevador', '+1 complimentary Stim from the elevator'), 'heal'), 1200);
  }
  G.mode = 'play';
  fade.classList.remove('on');
  transitioning = false;
}

// ------------------------------------------------------------------
// Laço principal
// ------------------------------------------------------------------
function updateExit(dt) {
  const p = G.player;
  const d = G.dungeon;
  const ex = d.meshes.exit;
  ex.holo.rotation.y += dt * 1.5;
  ex.holo.position.y = 1.4 + Math.sin(G.t * 2) * 0.1;
  const locked = !!ex.locked;
  const col = locked ? 0xff2244 : ex.theme.a;
  ex.ringMat.color.set(col).multiplyScalar(gk(2.4));
  ex.beamMat.color.set(col).multiplyScalar(gk(1.2));
  ex.beamMat.opacity = 0.12 + Math.sin(G.t * 3) * 0.05;
  if (!p || !p.alive || G.mode !== 'play') return;
  const dist = Math.hypot(p.x - d.exit.x, p.z - d.exit.z);
  if (dist < 1.3) {
    if (locked) {
      exitPrompt('locked');
    } else {
      p.exitHold = (p.exitHold || 0) + dt;
      exitPrompt('go', p.exitHold / 0.9);
      if (Math.random() < 0.5) burst(p.x, 0.2, p.z, ex.theme.a, 1, 1, 0.06, 0.6, { grav: -4 });
      if (p.exitHold >= 0.9) {
        p.exitHold = 0;
        exitPrompt(null);
        nextFloor();
      }
    }
  } else {
    p.exitHold = 0;
    exitPrompt(null);
  }
}

function handleGlobalInput() {
  if (Input.pressed('pause')) {
    if (G.mode === 'play') openPause();
    else if (G.mode === 'pause' && !anyOverlayOpen()) closePause();
    else if (G.mode === 'char') closeChar();
    else uiBack();
  }
  if (Input.pressed('inv') || Input.pressed('skills')) {
    if (G.mode === 'play' || G.mode === 'char') toggleChar();
  }
}

function logic(dt) {
  updatePlayer(dt);
  flowT -= dt;
  if (flowT <= 0) {
    flowT = 0.25;
    computeFlow(G.dungeon, G.player.x, G.player.z);
  }
  updateEnemies(dt, camera);
  updateProjectiles(dt);
  updateTurrets(dt);
  updateTimers(dt);
  updateHazards(dt);
  updateBarriers(dt);
  updateBiome(dt, camera);
  updatePowers(dt);
  updateDecoy(dt);
  updatePickups(dt, camera);
  updateExit(dt);
  achT -= dt;
  if (achT <= 0) {
    achT = 1;
    achCheck();
  }
  autosaveT += dt;
  if (autosaveT > 20) {
    autosaveT = 0;
    saveGame();
  }
}

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  G.t += dt;
  Input.update(dt);
  handleGlobalInput();
  uiPadUpdate();
  updateOrientation();
  updateMouseWorld();

  const playing = G.mode === 'play' || G.mode === 'dying';
  if (playing && G.player) logic(dt);
  if (G.player && G.mode !== 'menu') {
    updateHUD(dt);
    // a câmera olha levemente à frente da mira
    const p = G.player;
    const lead = G.lastInput === 'kb' && G.mouseWorld.ok ? 0.12 : 0;
    const fx = p.x + (G.mouseWorld.x - p.x) * lead;
    const fz = p.z + (G.mouseWorld.z - p.z) * lead;
    updateCamera(dt, clamp(fx, p.x - 3, p.x + 3), clamp(fz, p.z - 3, p.z + 3));
    updateWalls(G.dungeon, p.x, p.z, dt);
  } else if (G.dungeon) {
    // câmera do menu passeando pela masmorra
    const d = G.dungeon;
    const r = d.rooms[0];
    const t = G.t * 0.12;
    updateCamera(dt, r.cx + Math.sin(t) * 6, r.cy + Math.cos(t * 0.7) * 6);
    updateWalls(d, G.camFocus.x, G.camFocus.z, dt);
  }
  if (G.dungeon && G.dungeon.meshes && !playing) updateExit(dt);
  if (G.mode !== 'pause' && G.mode !== 'char') updateFx(dt);
  updateFloaters(G.mode === 'pause' || G.mode === 'char' ? 0 : dt, camera);
  if (G.player) G.player.light.visible = true;

  if (useBloom) composer.render();
  else renderer.render(scene, camera);
  Input.endFrame();
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
function boot() {
  // volta do login do Google, ou login salvo vencido: renova sem tela antes de montar o jogo
  const back = syncReadRedirect();
  if (syncShouldRefresh(back)) {
    syncAuthRedirect(true);
    return;
  }
  translateDom();
  loadSave();
  initRenderer();
  initFx(scene);
  initInput(canvas);
  initUI();
  applyVolumes();
  buildFloor(1, false);
  G.camFocus.x = G.dungeon.start.x;
  G.camFocus.z = G.dungeon.start.z;
  showMenu();
  document.getElementById('loading').classList.add('done');
  frame();
  // salva ao sair da aba
  addEventListener('visibilitychange', () => {
    if (document.hidden && G.char) {
      saveGame();
      if (G.mode === 'play') openPause();
    }
    if (document.hidden) syncNow();
  });
  setSyncHooks({
    save: () => saveGame(true),
    applied: () => {
      achCheck();
      if (G.mode === 'menu') renderClassCards();
    },
    render: renderSync,
    say: (m) => toast(m),
  });
  renderSync();
  achCheck(); // medalhas já conquistadas por saves antigos
  syncStart(back);
  addEventListener('beforeunload', () => G.char && saveGame());
  window.__G = G; // útil para depuração no console
  window.__classes = CLASSES;
  window.__dbg = {
    spawnEnemy, nextFloor, startFloor, Input, findPath, lineOfSight, refresh: refreshStats, makeItem, spawnPickup, spawnChest,
    // roda a lógica sem renderizar (usado em testes automatizados)
    sim(seconds, onStep) {
      const step = 1 / 30;
      for (let t = 0; t < seconds; t += step) {
        if (onStep) onStep(t);
        if ((G.mode === 'play' || G.mode === 'dying') && G.player) {
          G.t += step;
          logic(step);
          updateFx(step);
        }
        Input.endFrame();
      }
    },
  };
}

boot();
