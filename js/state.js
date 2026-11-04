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
  boss: null,
  floor: 1,
  save: null,
  char: null,
  settings: { music: 0.45, sfx: 0.75, quality: 'auto', shake: true },
  shake: 0,
  isTouch: false,
  lastInput: 'kb', // kb | pad | touch
  mouseWorld: { x: 0, z: 0, ok: false },
  hoverEnemy: null,
  camFocus: { x: 0, z: 0 },
};

export const TILE = { WALL: 0, FLOOR: 1, OBST: 2 };
