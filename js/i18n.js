// Tradução: português ou inglês conforme a língua do navegador.
// Para forçar um idioma, use ?lang=pt ou ?lang=en na URL.
const forced = new URLSearchParams(location.search).get('lang');
export const LANG = (forced || navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';

// L('texto em português', 'english text')
export const L = (pt, en) => (LANG === 'pt' ? pt : en);

// Textos fixos do index.html (atributos data-i18n / data-i18n-html / data-i18n-title)
const DICT = {
  loading: ['Carregando…', 'Loading…'],
  'logo.sub': ['action rpg cyberpunk', 'cyberpunk action rpg'],
  options: ['Opções', 'Options'],
  controls: ['Controles', 'Controls'],
  equipment: ['Equipamento', 'Equipment'],
  skills: ['Habilidades', 'Skills'],
  buyStim: ['Comprar Stim', 'Buy Stim'],
  recycleCommons: ['Reciclar comuns', 'Recycle commons'],
  selectItem: ['Selecione um item para ver os detalhes.', 'Select an item to see its details.'],
  padHints: ['Ⓐ Selecionar/Equipar · Ⓧ Reciclar · Ⓨ Trocar aba · Ⓑ Fechar', 'Ⓐ Select/Equip · Ⓧ Recycle · Ⓨ Switch tab · Ⓑ Close'],
  pause: ['PAUSA', 'PAUSED'],
  resume: ['Continuar', 'Resume'],
  character: ['Personagem', 'Character'],
  saveQuit: ['Salvar e sair', 'Save & quit'],
  optionsTitle: ['OPÇÕES', 'OPTIONS'],
  music: ['Música', 'Music'],
  sfx: ['Efeitos', 'Sound effects'],
  difficulty: ['Dificuldade', 'Difficulty'],
  graphics: ['Gráficos', 'Graphics'],
  glow: ['Brilho neon', 'Neon glow'],
  rotateTitle: ['GIRE O CELULAR', 'ROTATE YOUR PHONE'],
  rotateSub: ['O jogo funciona melhor na horizontal. Ele fica pausado enquanto isso.', 'The game plays best in landscape. It stays paused meanwhile.'],
  rotateIos: ['Dica: no iPhone, use Compartilhar → Adicionar à Tela de Início para jogar em tela cheia.', 'Tip: on iPhone, use Share → Add to Home Screen to play in fullscreen.'],
  shopTitle: ['MERCADOR', 'MERCHANT'],
  shopSub: ['"Peças fresquinhas, direto do caminhão da corporação. Não pergunte de onde vieram."', '"Fresh parts, straight off a corporate truck. Don\'t ask where they came from."'],
  shake: ['Tremor de tela', 'Screen shake'],
  fullscreen: ['Tela cheia', 'Fullscreen'],
  toggle: ['Alternar', 'Toggle'],
  back: ['Voltar', 'Back'],
  controlsTitle: ['CONTROLES', 'CONTROLS'],
  kbm: ['Teclado + Mouse', 'Keyboard + Mouse'],
  gamepad: ['Controle', 'Gamepad'],
  touch: ['Toque', 'Touch'],
  'help.kb': [
    '<p><b>Clique esquerdo</b> no chão: mover · no inimigo: atacar</p><p><b>WASD</b>: mover · <b>Espaço</b> ou <b>Shift + clique</b>: atacar</p><p><b>Q / E / R</b> (ou 1/2/3): habilidades · <b>Botão direito</b>: habilidade 1</p><p><b>F</b>: stim · <b>I</b> / <b>Tab</b>: personagem · <b>Esc</b>: pausa</p>',
    '<p><b>Left click</b> on the ground: move · on an enemy: attack</p><p><b>WASD</b>: move · <b>Space</b> or <b>Shift + click</b>: attack</p><p><b>Q / E / R</b> (or 1/2/3): skills · <b>Right click</b>: skill 1</p><p><b>F</b>: stim · <b>I</b> / <b>Tab</b>: character · <b>Esc</b>: pause</p>',
  ],
  'help.pad': [
    '<p><b>Analógico esquerdo</b>: mover · <b>direito</b>: escolher alvo (opcional)</p><p><b>A / RB / RT</b>: atacar · <b>X / Y / B</b>: habilidades</p><p><b>LB / LT</b>: stim · <b>Select</b>: personagem · <b>Start</b>: pausa</p>',
    '<p><b>Left stick</b>: move · <b>right stick</b>: pick target (optional)</p><p><b>A / RB / RT</b>: attack · <b>X / Y / B</b>: skills</p><p><b>LB / LT</b>: stim · <b>Select</b>: character · <b>Start</b>: pause</p>',
  ],
  'help.touch': [
    '<p>Toque e arraste do <b>lado esquerdo</b> da tela para mover.</p><p>Botões à direita: ataque (segure), habilidades e stim.</p>',
    '<p>Touch and drag on the <b>left side</b> of the screen to move.</p><p>Buttons on the right: attack (hold), skills and stim.</p>',
  ],
  'help.tip': [
    'Ataques e habilidades miram sozinhos no inimigo mais próximo. Encontre o <b>elevador</b> brilhante para descer; a cada 3 andares um chefe guarda a saída. Itens com <b style="color:#39ff88">▲</b> são melhores que os seus.',
    'Attacks and skills automatically aim at the nearest enemy. Find the glowing <b>elevator</b> to go down; every 3 floors a boss guards the exit. Items marked <b style="color:#39ff88">▲</b> are better than yours.',
  ],
  systemDown: ['SISTEMA DESLIGADO', 'SYSTEM OFFLINE'],
  retryFloor: ['Reiniciar no andar', 'Retry floor'],
  mainMenu: ['Menu principal', 'Main menu'],
  yes: ['Sim', 'Yes'],
  cancel: ['Cancelar', 'Cancel'],
  charTitle: ['Personagem (I)', 'Character (I)'],
  pauseTitle: ['Pausa (Esc)', 'Pause (Esc)'],
};

export function t(key, vars) {
  const e = DICT[key];
  let s = e ? e[LANG === 'pt' ? 0 : 1] : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
}

export function translateDom(root = document) {
  document.documentElement.lang = LANG === 'pt' ? 'pt-BR' : 'en';
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
}
