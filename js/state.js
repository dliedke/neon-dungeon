// Estado global compartilhado entre os módulos do jogo.
export const G = {
  mode: 'boot', // boot | menu | play | pause | char | dead | loading
  t: 0,
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  bloom: null,
  world: null, // grupo com tudo que pertence ao andar atual
  dungeon: null,
  theme: null,
  player: null,
  enemies: [],
  projectiles: [],
  pickups: [],
  turrets: [],
  timers: [],
  hazards: [],
  barriers: [],
  decoy: null,
  boss: null,
  floor: 1,
  save: null,
  char: null,
  settings: { music: 0.45, sfx: 0.75, quality: 'auto', shake: true, difficulty: 'normal', glow: 'medium' },
  shake: 0,
  isTouch: false,
  lastInput: 'kb', // kb | pad | touch
  mouseWorld: { x: 0, z: 0, ok: false },
  hoverEnemy: null,
  camFocus: { x: 0, z: 0 },
};

export const TILE = { WALL: 0, FLOOR: 1, OBST: 2 };

// Intensidade dos materiais "neon": valores acima de 1 geram bloom.
// O fator suaviza todos os brilhos do jogo de uma vez.
export const GLOW = 0.55;
export const gk = (k) => (k > 1 ? 1 + (k - 1) * GLOW : k);
