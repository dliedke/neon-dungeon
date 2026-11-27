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
  settings: { music: 0.45, sfx: 0.75, track: 'shuffle', quality: 'auto', shake: true, impact: true, difficulty: 'normal', abyss: 0, glow: 'strong', sv: 4, recycle: [0, 1, 2, 3] },
  shake: 0,
  hitStop: 0, // pausa no impacto: segundos (tempo real) com o jogo quase parado
  slow: 0, // câmera lenta: segundos (tempo real) com o jogo a slowK da velocidade
  slowK: 1,
  fxLoad: 0, // partículas vivas (média suave, fx.js): escurece partículas e bloom quando a tela enche
  isTouch: false,
  lastInput: 'kb', // kb | pad | touch
  padType: null, // xbox | ps4 | ps5 | nintendo (null = nenhum controle detectado)
  mouseWorld: { x: 0, z: 0, ok: false },
  hoverEnemy: null,
  hoverNpc: null, // mercador/ferreiro/baú sob o cursor
  npcNear: null, // mercador/ferreiro/baú perto o bastante para abrir
  npcPad: false, // o {A} do controle abre o npcNear (sem inimigo perto) em vez de atacar
  camFocus: { x: 0, z: 0 },
};

// PIT: lagos/vácuo — não dá para andar, mas a visão e os tiros passam por cima
export const TILE = { WALL: 0, FLOOR: 1, OBST: 2, PIT: 3 };

// Intensidade dos materiais "neon": valores acima de 1 geram bloom.
// O fator suaviza todos os brilhos do jogo de uma vez.
export const GLOW = 0.55;
export const gk = (k) => (k > 1 ? 1 + (k - 1) * GLOW : k);

// Pausa no impacto (hit-stop) e câmera lenta: o tempo do jogo para ou anda devagar por um instante (contado em tempo
// real, ver frame() no main.js). Desliga nas opções ("Impacto"). Pausas pequenas seguidas não se acumulam: no máximo
// uma a cada 0,25s, para muitos abates juntos não travarem a tela
let stopAt = 0;
export function hitStop(s) {
  if (G.settings.impact === false || G.mode !== 'play') return;
  const now = performance.now();
  if (now - stopAt < 250 && s < 0.1) return;
  stopAt = now;
  G.hitStop = Math.max(G.hitStop, Math.min(0.15, s));
}
export function slowMo(s, k) {
  if (G.settings.impact === false || G.mode !== 'play') return;
  G.slow = Math.max(G.slow, s);
  G.slowK = G.slow > 0 && G.slowK < 1 ? Math.min(G.slowK, k) : k;
}
