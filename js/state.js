// Estado global compartilhado entre os módulos do jogo.
export const G = {
  mode: 'boot', // boot | menu | play | dying | dead | pause | char | shop | forge | implant | loading | ending
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
  allies: [],
  orbiters: [],
  warps: [],
  lasers: [],
  holes: [],
  storms: [],
  decoy: null,
  boss: null,
  bosses: [], // chefes em combate (na batalha final são 2 ao mesmo tempo)
  anomaly: null, // anomalia do andar atual (run.js)
  contract: null, // contrato do andar atual (run.js)
  final: null, // estado da batalha final do último andar
  floor: 1,
  save: null,
  char: null,
  settings: { music: 0.45, sfx: 0.75, track: 'shuffle', quality: 'auto', shake: true, difficulty: 'normal', abyss: 0, glow: 'strong', sv: 4 },
  shake: 0,
  isTouch: false,
  lastInput: 'kb', // kb | pad | touch
  padType: null, // xbox | ps4 | ps5 | nintendo (null = nenhum controle detectado)
  mouseWorld: { x: 0, z: 0, ok: false },
  hoverEnemy: null,
  hoverNpc: null, // mercador/ferreiro/baú sob o cursor
  npcNear: null, // mercador/ferreiro/baú perto o bastante para abrir
  camFocus: { x: 0, z: 0 },
};

// PIT: lagos/vácuo — não dá para andar, mas a visão e os tiros passam por cima
export const TILE = { WALL: 0, FLOOR: 1, OBST: 2, PIT: 3 };

// Intensidade dos materiais "neon": valores acima de 1 geram bloom.
// O fator suaviza todos os brilhos do jogo de uma vez.
export const GLOW = 0.55;
export const gk = (k) => (k > 1 ? 1 + (k - 1) * GLOW : k);
