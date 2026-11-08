// Ponto de entrada: renderização, câmera, laço principal, andares e salvamento.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G, gk } from './state.js';
import { Input, initInput, setTouchMode } from './input.js';
import { initAudio, applyVolumes, sfx } from './audio.js';
import { spawnPets, updatePets, clearPets, spawnPet } from './pets.js';
import { generateDungeon, buildDungeonMeshes, themeFor, isBossFloor, isFinalFloor, FINAL_FLOOR, computeFlow, updateWalls, revealAround, findPath, lineOfSight, isWalkable } from './dungeon.js';
import { initFx, updateFx, clearEffects, updateFloaters, clearFloaters, burst } from './fx.js';
import { populateFloor, updateEnemies, spawnEnemy, tickReward } from './enemies.js';
import { updateProjectiles, updateTimers, updateTurrets, updateHazards, updateBarriers, updateDecoy } from './combat.js';
import { createPlayer, updatePlayer, placePlayer, newCharacter, refreshStats } from './player.js';
import { updatePickups, clearPickups, spawnPickup, spawnChest } from './loot.js';
import { CLASSES } from './classes.js';
import { placeFeatures, buildFeatures, updateBiome, npcUnderCursor } from './biomes.js';
import { updateMythic, resetMythic } from './mythic.js';
import { updatePowers, clearPowers } from './powers.js';
import { makeItem } from './items.js';
import { L, translateDom } from './i18n.js';
import { padText } from './padglyphs.js';
import { ensureAch, achAdd, achMark, achCheck } from './ach.js';
import { setSyncHooks, syncReadRedirect, syncShouldRefresh, syncAuthRedirect, syncStart, syncDirty, syncNow, syncRefreshSoon } from './sync.js';
import {
  initUI, showMenu, showHUD, updateHUD, banner, resetMinimap, markMinimap, uiPadUpdate, openPause, closePause,
  toggleChar, closeChar, bossBar, toggleBigMap, bigMapOpen, exitPrompt, toast, uiBack, anyOverlayOpen, updateOrientation, renderClassCards, renderSync, showEnding,
} from './ui.js';
import { isTouchDevice, clamp, newSeed, seedRandom } from './utils.js';
import { rollAnomaly, announceFloor, updateRun, runFloorDone, tierOf, MAX_TIER } from './run.js';

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
  // baú compartilhado entre os personagens (saves antigos não têm)
  if (!Array.isArray(save.stash)) save.stash = [];
  if (!save.stashOut || typeof save.stashOut !== 'object') save.stashOut = {};
  ensureAch(save);
  G.save = save;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) {
      // opções salvas antes da v3: o brilho neon volta a ser "Forte" (padrão) para todos
      if (!(s.sv >= 3)) {
        s.glow = 'strong';
        s.sv = 3;
      }
      Object.assign(G.settings, s);
    }
  } catch (_) {}
}

// fromSync: gravação feita pela própria sincronização (não reenvia para a nuvem)
export function saveGame(fromSync) {
  if (G.char) {
    // onde o personagem está no andar (para continuar dali)
    const h = floorSnapshot();
    if (h !== undefined) G.char.here = h;
    G.save.slots[G.char.cls] = G.char;
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(G.save));
  } catch (_) {}
  // jogando, a nuvem recebe no máximo a cada 3 min (e na hora ao sair da aba, trocar de andar ou voltar ao menu)
  if (!fromSync) syncDirty(G.mode === 'play' ? 180000 : 4000);
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
  G.hoverNpc = null;
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
  // mercador, ferreiro ou baú sob o cursor: clicar abre (ou anda até lá)
  if (!G.hoverEnemy) G.hoverNpc = npcUnderCursor(m.x, m.y, camera);
  canvas.style.cursor = G.hoverEnemy ? 'crosshair' : G.hoverNpc ? 'pointer' : 'default';
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
  clearPets();
  G.boss = null;
  G.bosses = [];
  G.final = null;
  bossBar();
}

// resume: retrato salvo do andar (c.here) para refazê-lo igual, com a mesma semente
function buildFloor(floor, withEnemies = true, resume = null) {
  clearWorld();
  G.floor = floor;
  const theme = themeFor(floor);
  G.theme = theme;
  // semente do andar: cada etapa recomeça dela, então o que uma etapa sorteia a mais
  // (ex.: o estoque do mercador, que depende do equipamento) não muda as outras
  const seed = withEnemies ? (resume ? resume.seed : newSeed()) : null;
  const stage = (k) => seed != null && seedRandom((seed + Math.imul(k, 0x9e3779b1)) | 0);
  G.floorRun = null;
  let d;
  try {
    // anomalia do andar: sorteada antes de povoar (muda quantidade e força dos inimigos)
    G.contract = null;
    G.clear = null;
    stage(1);
    if (withEnemies) rollAnomaly(floor, resume ? resume.anomaly || null : undefined);
    else G.anomaly = null;
    stage(2);
    d = generateDungeon(floor);
    G.dungeon = d;
    stage(3);
    placeFeatures(d, theme);
    stage(4);
    const world = buildDungeonMeshes(d, theme);
    buildFeatures(d, theme, world);
    G.world = world;
    scene.add(world);
    stage(5);
    G.nest = null;
    if (withEnemies) populateFloor(d, floor, isBossFloor(floor));
    stage(6);
    if (withEnemies && !isFinalFloor(floor)) spawnPets(d);
  } finally {
    seedRandom(null);
  }
  // o que o andar tinha no começo: inimigos e objetos fixos (cofres, santuários, fendas), na ordem em que nasceram
  if (seed != null) G.floorRun = { seed, foes: G.enemies.slice(), statics: G.pickups.filter((pk) => pk.static), fp: floorPrint(d) };
  // iluminação e névoa de cada bioma
  const Lt = theme.light;
  scene.fog = new THREE.Fog(theme.fog, Lt.fogNear, Lt.fogFar);
  scene.background = new THREE.Color(theme.fog);
  hemi.color.set(Lt.sky);
  hemi.groundColor.set(Lt.ground);
  hemi.intensity = Lt.hemi;
  dirLight.color.set(Lt.dir);
  dirLight.intensity = Lt.dirI;
  // anomalia Apagão: névoa bem perto e pouca luz (a luz do personagem vira a lanterna)
  if (G.anomaly === 'dark') {
    scene.fog.near *= 0.35;
    scene.fog.far *= 0.5;
    hemi.intensity *= 0.45;
    dirLight.intensity *= 0.35;
  }
  resetMinimap(d);
  return d;
}

// coloca o personagem no andar (começo ou onde ele estava) e atualiza o mapa e o rótulo
function enterFloor(d, x, z) {
  placePlayer(x, z);
  G.camFocus.x = x;
  G.camFocus.z = z;
  markMinimap(revealAround(d, x, z, 8));
  computeFlow(d, x, z);
  const T = tierOf(G.char);
  document.getElementById('floor-label').textContent = `${L('ANDAR', 'FLOOR')} ${G.floor} · ${G.theme.name.toUpperCase()}${T.off ? ` · ${T.icon} ${T.name.toUpperCase()}` : ''}`;
}

export function startFloor(floor) {
  const d = buildFloor(floor);
  const c = G.char;
  c.floor = floor;
  c.maxFloor = Math.max(c.maxFloor || 1, floor);
  achMark('biomes', G.theme.id);
  if (d.props.some((p) => p.type === 'smith')) setTimeout(() => G.floor === floor && G.mode === 'play' && toast(L('⚒ Há um <b>ferreiro</b> neste andar: ele aprimora seu equipamento por créditos.', '⚒ There is a <b>blacksmith</b> on this floor: he upgrades your gear for credits.'), 'item'), 3400);
  if (!G.save.stashSeen && d.props.some((p) => p.type === 'stash')) setTimeout(() => G.floor === floor && G.mode === 'play' && !G.save.stashSeen && toast(L('📦 Perto do início de cada andar há um <b>baú compartilhado</b>: o que você guardar nele fica para todos os seus personagens.', '📦 Near the start of every floor there is a <b>shared stash</b>: whatever you store in it is available to all your characters.'), 'item'), 1500);
  enterFloor(d, d.start.x, d.start.z);
  const word = L('ANDAR', 'FLOOR');
  if (isFinalFloor(floor)) {
    banner(L('ANDAR FINAL', 'FINAL FLOOR'), L('Os 7 chefes esperam no coração da corporação', 'All 7 bosses await at the heart of the corporation'));
    setTimeout(() => G.floor === floor && toast(L('Batalha final: os chefes vêm em ondas de 2. Derrote os 7 para vencer o jogo!', 'Final battle: the bosses come in waves of 2. Defeat all 7 to win the game!'), 'warn'), 2800);
  } else banner(`${word} ${floor}`, isBossFloor(floor) ? `${G.theme.name} · ${L('Chefe à frente', 'Boss ahead')}` : G.theme.name);
  if (G.theme.hint && !isFinalFloor(floor)) setTimeout(() => G.floor === floor && toast(G.theme.hint), 2800);
  announceFloor(floor);
  saveGame();
}

// ------------------------------------------------------------------
// Continuar de onde parou: o andar é refeito com a mesma semente e o que mudou nele
// (inimigos mortos, cofres abertos, itens no chão, mapa explorado...) fica no save em c.here
// ------------------------------------------------------------------
// impressão digital do andar recém-criado: se o andar refeito não sair igual, começa um andar novo
function floorPrint(d) {
  let h = 2166136261;
  const mix = (v) => (h = Math.imul(h ^ (v | 0), 16777619));
  const str = (t) => {
    for (let k = 0; k < t.length; k++) mix(t.charCodeAt(k));
  };
  for (let k = 0; k < d.grid.length; k++) mix(d.grid[k]);
  mix(d.start.x * 100);
  mix(d.start.z * 100);
  mix(d.exit.x * 100);
  mix(d.exit.z * 100);
  for (const p of d.props) {
    str(p.type);
    mix(p.x * 100);
    mix(p.z * 100);
  }
  for (const e of G.enemies) {
    str(e.type);
    str(e.elite || '');
    mix(e.x * 100);
    mix(e.z * 100);
    mix(e.maxHp);
  }
  for (const pk of G.pickups) {
    str(pk.type);
    str(pk.kind || '');
    mix(pk.x * 100);
    mix(pk.z * 100);
  }
  return (h >>> 0).toString(36);
}

// retrato do andar atual para o save (undefined = não mexe no retrato que já existe)
function floorSnapshot() {
  const R = G.floorRun;
  const c = G.char;
  const p = G.player;
  const d = G.dungeon;
  if (!R || !c || !p || !d || G.floor !== c.floor) return undefined;
  if (isFinalFloor(G.floor) || G.final) return null; // a batalha final sempre recomeça do início
  if (!p.alive) return undefined; // caído: fica o último retrato com ele vivo
  const r2 = (v) => Math.round(v * 100) / 100;
  // mapa explorado em trechos: quantos 0, quantos 1, quantos 0...
  const ex = [];
  let cur = 0;
  let run = 0;
  for (let k = 0; k < d.explored.length; k++) {
    const v = d.explored[k] ? 1 : 0;
    if (v === cur) run++;
    else {
      ex.push(run);
      cur = v;
      run = 1;
    }
  }
  ex.push(run);
  const ground = [];
  for (const pk of G.pickups) {
    if (pk.type === 'item') ground.push({ t: 'item', x: r2(pk.x), z: r2(pk.z), item: pk.item });
    else if (pk.type === 'credits') ground.push({ t: 'credits', x: r2(pk.x), z: r2(pk.z), amount: pk.amount });
    else if (pk.type === 'stim') ground.push({ t: 'stim', x: r2(pk.x), z: r2(pk.z) });
  }
  const buffs = {};
  for (const k in p.buffs) if (typeof p.buffs[k] === 'number' && p.buffs[k] > 0) buffs[k] = r2(p.buffs[k]);
  const used = [];
  R.statics.forEach((pk, i) => {
    if (pk.opened || pk.used || pk.state === 'done' || !G.pickups.includes(pk)) used.push(i);
  });
  return {
    v: 1, floor: G.floor, seed: R.seed, fp: R.fp, anomaly: G.anomaly || null,
    x: r2(p.x), z: r2(p.z), hp: Math.max(1, Math.round(p.hp)), en: Math.round(p.en || 0), buffs,
    foes: R.foes.map((e) => (e.alive ? Math.max(1, Math.round(e.hp)) : 0)),
    used, ex, ground,
    contract: G.contract ? { ...G.contract, times: [] } : null,
    clear: G.clear ? { ...G.clear } : null,
    nest: G.nest ? { left: G.nest.left, woke: G.nest.woke, done: G.nest.done } : null,
    shop: d.shop || null,
  };
}

// refaz o andar salvo; false = não deu (save antigo, andar diferente...) e o jogo começa um andar novo
function resumeFloor(c) {
  const h = c.here;
  if (!h || h.v !== 1 || h.floor !== c.floor || h.seed == null || isFinalFloor(h.floor) || !Array.isArray(h.foes)) return false;
  let d;
  try {
    d = buildFloor(h.floor, true, h);
  } catch (err) {
    console.warn('resume', err);
    return false;
  }
  const R = G.floorRun;
  if (!R || R.fp !== h.fp || R.foes.length !== h.foes.length) return false;
  // inimigos: os mortos somem sem efeito nenhum; os vivos voltam com a vida que tinham
  R.foes.forEach((e, i) => {
    const hp = h.foes[i];
    if (hp > 0) {
      e.hp = Math.min(e.maxHp, hp);
      return;
    }
    e.alive = false;
    G.world.remove(e.model.root);
    if (e.laser) G.world.remove(e.laser);
    if (e.boss) d.meshes.exit.locked = false; // o chefe já tinha caído: elevador liberado
  });
  // cofres abertos, santuários usados e fendas concluídas não voltam
  for (const i of h.used || []) {
    const pk = R.statics[i];
    if (!pk) continue;
    G.world.remove(pk.group);
    if (pk.label) pk.label.remove();
    const k = G.pickups.indexOf(pk);
    if (k >= 0) G.pickups.splice(k, 1);
  }
  // o que estava no chão
  for (const g of h.ground || []) {
    if (!isWalkable(d, g.x, g.z)) continue;
    const pk = g.t === 'item' && g.item ? spawnPickup('item', g.x, g.z, { item: g.item, quiet: true }) : g.t === 'credits' ? spawnPickup('credits', g.x, g.z, { amount: g.amount | 0 }) : g.t === 'stim' ? spawnPickup('stim', g.x, g.z, {}) : null;
    if (pk) {
      pk.vx = pk.vz = 0;
      pk.vy = 0;
      pk.t = 1;
    }
  }
  // mapa explorado
  if (Array.isArray(h.ex)) {
    let k = 0;
    let v = 0;
    for (const n of h.ex) {
      if (v) for (let j = 0; j < n && k + j < d.explored.length; j++) d.explored[k + j] = 1;
      k += n;
      v ^= 1;
    }
    const all = [];
    for (let j = 0; j < d.explored.length; j++) if (d.explored[j]) all.push(j);
    markMinimap(all);
  }
  if (h.contract) G.contract = h.contract;
  else G.contract = null;
  if (h.clear && G.clear) Object.assign(G.clear, h.clear);
  if (h.nest && G.nest) Object.assign(G.nest, h.nest);
  if (h.shop) d.shop = h.shop;
  const p = G.player;
  const ok = isWalkable(d, h.x, h.z);
  enterFloor(d, ok ? h.x : d.start.x, ok ? h.z : d.start.z);
  p.hp = clamp(h.hp || p.stats.maxHp, 1, p.stats.maxHp);
  p.en = clamp(h.en ?? p.stats.maxEn, 0, p.stats.maxEn);
  Object.assign(p.buffs, h.buffs || {});
  banner(`${L('ANDAR', 'FLOOR')} ${h.floor}`, L('De volta de onde você parou', 'Back where you left off'));
  announceFloor(h.floor);
  return true;
}

export function startGame(cls, fresh) {
  initAudio();
  resetMythic();
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
  if (fresh || !resumeFloor(G.char)) startFloor(G.char.floor || 1);
  if (G.char.level === 1 && G.char.kills === 0) {
    setTimeout(() => toast(G.isTouch ? L('Arraste à esquerda para mover · botões à direita para atacar', 'Drag on the left to move · buttons on the right to attack') : G.lastInput === 'pad' ? padText(L('Analógico para mover · {A} para atacar · {X} {Y} {B} {LB} {RB} {LT} poderes', 'Left stick to move · {A} to attack · {X} {Y} {B} {LB} {RB} {LT} powers')) : L('Clique para mover/atacar · 1–6 poderes · F stim · I inventário', 'Click to move/attack · 1–6 powers · F stim · I inventory')), 2800);
  }
}

function sanitizeChar(c) {
  // saves antigos: tinham 4 habilidades, todas liberadas
  const n = CLASSES[c.cls].skills.length;
  c.skills = c.skills || [1, 1, 1, 1];
  while (c.skills.length < n) c.skills.push(0);
  if (!c.slots) c.slots = [1, 2, 3].map((i) => (c.skills[i] > 0 ? i : null));
  // 6 espaços de poderes (antes eram 3); passivos nunca ficam em botões
  c.slots = c.slots.slice(0, 6).map((i) => (i != null && c.skills[i] > 0 && !CLASSES[c.cls].skills[i]?.passive ? i : null));
  while (c.slots.length < 6) c.slots.push(null);
  // preenche os espaços vazios com poderes já aprendidos que estavam fora da barra
  CLASSES[c.cls].skills.forEach((sk, i) => {
    if (i === 0 || sk.passive || !(c.skills[i] > 0) || c.slots.includes(i)) return;
    const free = c.slots.indexOf(null);
    if (free >= 0) c.slots[free] = i;
  });
  c.inv = c.inv || [];
  c.equip = c.equip || {};
  c.stims = c.stims ?? 3;
  c.credits = c.credits || 0;
  c.skillPoints = c.skillPoints || 0;
  c.kills = c.kills || 0;
  c.wins = c.wins || 0;
  c.playTime = c.playTime || 0;
  // onde estava no andar (saves antigos não têm: começam o andar do início)
  if (!c.here || typeof c.here !== 'object') c.here = null;
  c.deaths = c.deaths || 0;
  // implantes (escolhidos depois de cada chefe)
  c.implants = c.implants || {};
  c.implantFloors = c.implantFloors || [];
  c.implantPending = c.implantPending || 0;
  // modo depois de vencer (0 Normal, 1 Pesadelo, 2 Inferno) e o maior modo liberado
  c.tier = Math.min(MAX_TIER, c.tier | 0);
  c.bestTier = Math.max(c.bestTier | 0, c.tier);
  // o jogo agora termina no andar 30 (saves antigos podiam estar mais fundo)
  if (c.floor > FINAL_FLOOR) c.floor = FINAL_FLOOR;
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
  // login do Google perto de vencer: renova agora, no menu, sem atrapalhar a partida
  setTimeout(() => syncRefreshSoon(15 * 60000), 1500);
}

async function nextFloor() {
  if (transitioning) return;
  if (G.final && G.final.won) return endGame();
  transitioning = true;
  sfx.elevator();
  const fade = document.getElementById('fade');
  fade.classList.add('on');
  G.mode = 'loading';
  await new Promise((r) => setTimeout(r, 450));
  achAdd('floors');
  runFloorDone();
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

// Fim de jogo: o elevador sobe para a superfície e aparece o final
async function endGame() {
  transitioning = true;
  const F = G.final;
  sfx.elevator();
  G.mode = 'loading';
  const fade = document.getElementById('fade');
  fade.classList.add('on');
  await new Promise((r) => setTimeout(r, 700));
  achCheck();
  saveGame();
  syncNow();
  showEnding({ time: F.time, deaths: F.deaths });
  fade.classList.remove('on');
  transitioning = false;
}

// Novo Jogo+: o personagem desce de novo do andar 1 no modo escolhido, com nível, itens e implantes
export function startTier(tier) {
  const c = G.char;
  c.tier = Math.max(0, Math.min(MAX_TIER, tier, c.bestTier | 0));
  c.floor = 1;
  G.mode = 'play';
  G.player.alive = true;
  G.player.hp = G.player.stats.maxHp;
  G.player.en = G.player.stats.maxEn;
  showHUD();
  startFloor(1);
  G.player.invuln = 1;
  const T = tierOf(c);
  setTimeout(() => G.floor === 1 && toast(L(`${T.icon} Modo ${T.name}: inimigos muito mais fortes, elites com mais afixos, itens e créditos melhores.`, `${T.icon} ${T.name} mode: much stronger enemies, elites with more affixes, better items and credits.`), 'warn'), 2600);
}

// Revanche: joga a batalha final de novo com o mesmo personagem
export function replayFinal() {
  G.mode = 'play';
  G.player.alive = true;
  G.player.hp = G.player.stats.maxHp;
  G.player.en = G.player.stats.maxEn;
  showHUD();
  startFloor(FINAL_FLOOR);
  G.player.invuln = 1;
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
  const col = locked ? 0xff2244 : ex.golden ? 0xffd23d : ex.theme.a;
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
  if (Input.pressed('map') && G.mode === 'play') toggleBigMap();
  if (Input.pressed('pause')) {
    if (G.mode === 'play' && bigMapOpen()) toggleBigMap(false); // Esc fecha o mapa antes de pausar
    else if (G.mode === 'play') openPause();
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
  updatePets(dt);
  updateMythic(dt);
  updateRun(dt);
  tickReward(dt);
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
  if (playing && G.player) {
    logic(dt);
    if (G.mode === 'play' && G.char) {
      G.char.playTime = (G.char.playTime || 0) + dt; // tempo total de jogo do personagem
      achAdd('play', dt); // e da conta toda (medalhas de tempo de jogo)
    }
  }
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
    else setTimeout(() => syncRefreshSoon(), 800);
  });
  // no menu, renova o login do Google sozinho quando ele vence
  setInterval(() => syncRefreshSoon(), 60000);
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
    spawnEnemy, spawnPet, nextFloor, startFloor, Input, findPath, lineOfSight, refresh: refreshStats, makeItem, spawnPickup, spawnChest,
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
