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
  cloud: ['Nuvem (Google)', 'Cloud (Google)'],
  medals: ['🏅 Medalhas', '🏅 Medals'],
  backups: ['🛟 Backups', '🛟 Backups'],
  backupsTitle: ['🛟 BACKUPS', '🛟 BACKUPS'],
  backupsIntro: ['Cópias de segurança de cada personagem, feitas sozinhas a cada 10 min de jogo e antes de recomeçar. Ficam neste aparelho e na nuvem (se estiver conectado). Restaurar não apaga nada: quem estava no lugar vira um backup também.', 'Safety copies of each character, made automatically every 10 min of play and before starting over. They are kept on this device and in the cloud (when signed in). Restoring never deletes anything: whoever was in that slot becomes a backup too.'],
  debugEvents: ['🐞 Debug: eventos', '🐞 Debug: events'],
  debugTitle: ['DEBUG · EVENTOS', 'DEBUG · EVENTS'],
  debugTip: ['Escolha um evento: o andar é refeito só com ele e você aparece ao lado.', 'Pick an event: the floor is rebuilt with only that event and you appear next to it.'],
  cloudTitle: ['NUVEM', 'CLOUD SAVE'],
  equipment: ['Equipamento', 'Equipment'],
  skills: ['Habilidades', 'Skills'],
  buyStim: ['Comprar Stim', 'Buy Stim'],
  recycleFilter: ['Filtro', 'Filter'],
  recycle: ['Reciclar', 'Recycle'],
  close: ['Fechar', 'Close'],
  rfTitle: ['♻ FILTRO', '♻ FILTER'],
  rfText: ['Marque as raridades que o botão Reciclar desmonta. Favoritos (★) e itens melhores que o equipado (▲) nunca são reciclados.', 'Pick the rarities the Recycle button breaks down. Favorites (★) and items better than what you have equipped (▲) are never recycled.'],
  selectItem: ['Selecione um item para ver os detalhes.', 'Select an item to see its details.'],
  padHints: ['{A} Selecionar/Equipar · {X} Reciclar · {Y} Reciclar (filtro) · {RS} Filtro · {RT} Favoritar · {LB} {RB} Trocar aba · {B} Fechar', '{A} Select/Equip · {X} Recycle · {Y} Recycle (filter) · {RS} Filter · {RT} Favorite · {LB} {RB} Switch tab · {B} Close'],
  padHintsStash: ['{A} Guardar/Pegar · {X} Equipar · {RT} Reciclar · {Y} Guardar todos os míticos · {LB} {RB} Trocar aba · {B} Fechar', '{A} Store/Take · {X} Equip · {RT} Recycle · {Y} Store all mythics · {LB} {RB} Switch tab · {B} Close'],
  padHintsGems: ['{A} Selecionar/Engastar · {X} Remover gema · {Y} Fundir tudo · {LB} {RB} Trocar aba · {B} Fechar', '{A} Select/Socket · {X} Remove gem · {Y} Fuse all · {LB} {RB} Switch tab · {B} Close'],
  gems: ['Gemas', 'Gems'],
  gemSockets: ['Encaixes', 'Sockets'],
  gemBag: ['Bolsa de gemas', 'Gem pouch'],
  fuseAll: ['Fundir tudo', 'Fuse all'],
  gemHelp: ['3 gemas iguais viram 1 do nível seguinte. Engaste gemas nos encaixes do equipamento: na arma elas dão um bônus, nas outras peças outro.', '3 matching gems fuse into 1 of the next tier. Socket gems into your gear: in the weapon they give one bonus, in other pieces another.'],
  padHintsTree: ['{A} Desbloquear/Evoluir · {X} Trocar de botão · {LB} {RB} Trocar aba · {B} Fechar', '{A} Unlock/Upgrade · {X} Change button · {LB} {RB} Switch tab · {B} Close'],
  pause: ['PAUSA', 'PAUSED'],
  implantTitle: ['ESCOLHA UM IMPLANTE', 'CHOOSE AN IMPLANT'],
  resume: ['Continuar', 'Resume'],
  character: ['Personagem', 'Character'],
  saveQuit: ['Salvar e sair', 'Save & quit'],
  optionsTitle: ['OPÇÕES', 'OPTIONS'],
  music: ['Música', 'Music'],
  track: ['Trilha', 'Soundtrack'],
  sfx: ['Efeitos', 'Sound effects'],
  difficulty: ['Dificuldade', 'Difficulty'],
  abyss: ['Abismo', 'Abyss'],
  abyssPadHint: ['No Abismo: {LB} −10 · {RB} +10', 'On Abyss: {LB} −10 · {RB} +10'],
  diffTitle: ['Dificuldade: quanto mais difícil, mais créditos e itens melhores (¢ créditos, ★ itens). Muda na hora.', 'Difficulty: the harder, the more credits and better items (¢ credits, ★ items). Changes instantly.'],
  graphics: ['Gráficos', 'Graphics'],
  glow: ['Brilho neon', 'Neon glow'],
  rotateTitle: ['GIRE O CELULAR', 'ROTATE YOUR PHONE'],
  rotateSub: ['O jogo funciona melhor na horizontal. Ele fica pausado enquanto isso.', 'The game plays best in landscape. It stays paused meanwhile.'],
  rotateIos: ['Dica: no iPhone, use Compartilhar → Adicionar à Tela de Início para jogar em tela cheia.', 'Tip: on iPhone, use Share → Add to Home Screen to play in fullscreen.'],
  shopTitle: ['MERCADOR', 'MERCHANT'],
  forgeTitle: ['FERREIRO', 'BLACKSMITH'],
  forgeSub: ['“Traga o que você está usando que eu deixo melhor. A cada 4 níveis o item ganha um atributo novo.”', '“Bring me what you’re wearing and I’ll make it better. Every 4 levels the item gains a new stat.”'],
  stashTitle: ['BAÚ COMPARTILHADO', 'SHARED STASH'],
  stashSub: ['Guarde aqui até 1000 itens (10 abas de 100) e seus créditos: tudo fica para todos os seus personagens. Armas só podem ser pegas pela classe delas.', 'Store up to 1000 items here (10 tabs of 100) and your credits: everything is shared by all your characters. Weapons can only be taken by their own class.'],
  stashSort: ['▼ Ordenado do nível maior para o menor', '▼ Sorted from highest to lowest level'],
  stashBox: ['Baú', 'Stash'],
  stashInv: ['Inventário', 'Inventory'],
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
    '<p><b>Clique esquerdo</b> no chão: mover · no inimigo: atacar</p><p><b>WASD</b>: mover · <b>Espaço</b> ou <b>Shift + clique</b>: atacar</p><p><b>1 a 7</b>: poderes (Q / E / R também usam os 3 primeiros) · <b>Botão direito</b>: poder 1</p><p><b>F</b>: stim (cura 60% da vida) · <b>I</b> / <b>Tab</b>: personagem · <b>M</b> ou clique no minimapa: mapa · <b>Esc</b>: pausa</p>',
    '<p><b>Left click</b> on the ground: move · on an enemy: attack</p><p><b>WASD</b>: move · <b>Space</b> or <b>Shift + click</b>: attack</p><p><b>1 to 7</b>: powers (Q / E / R also fire the first 3) · <b>Right click</b>: power 1</p><p><b>F</b>: stim (heals 60% health) · <b>I</b> / <b>Tab</b>: character · <b>M</b> or click the minimap: map · <b>Esc</b>: pause</p>',
  ],
  'help.pad': [
    '<p><b>Analógico esquerdo</b>: mover · <b>direito</b>: escolher alvo (opcional)</p><p>{A}: atacar · {X} {Y} {B} {LB} {RB} {LT} {RT}: poderes 1 a 7</p><p>{LS} (apertar o analógico esquerdo): stim, cura 60% da vida · {RS} (apertar o direito): mapa (no inventário: filtro da reciclagem) · {SELECT}: personagem · {START}: pausa</p>',
    '<p><b>Left stick</b>: move · <b>right stick</b>: pick target (optional)</p><p>{A}: attack · {X} {Y} {B} {LB} {RB} {LT} {RT}: powers 1 to 7</p><p>{LS} (click the left stick): stim, heals 60% health · {RS} (click the right stick): map (in the inventory: recycle filter) · {SELECT}: character · {START}: pause</p>',
  ],
  'help.touch': [
    '<p>Toque e arraste do <b>lado esquerdo</b> da tela para mover.</p><p>Botões à direita: ataque (segure), até 7 poderes e stim (o botão verde: cura 60% da vida).</p><p>Toque no minimapa para ver o mapa inteiro.</p>',
    '<p>Touch and drag on the <b>left side</b> of the screen to move.</p><p>Buttons on the right: attack (hold), up to 7 powers and stim (the green button: heals 60% health).</p><p>Tap the minimap to see the whole map.</p>',
  ],
  'help.tip': [
    'Ataques e habilidades miram sozinhos no inimigo mais próximo. Encontre o <b>elevador</b> brilhante para descer; a cada 3 andares um chefe guarda a saída. No andar 50, derrote os 7 chefes, que vêm em ondas de 2, para vencer o jogo. Itens com <b style="color:#39ff88">▲</b> são melhores que os seus.',
    'Attacks and skills automatically aim at the nearest enemy. Find the glowing <b>elevator</b> to go down; every 3 floors a boss guards the exit. On floor 50, defeat all 7 bosses, who come in waves of 2, to win the game. Items marked <b style="color:#39ff88">▲</b> are better than yours.',
  ],
  systemDown: ['SISTEMA DESLIGADO', 'SYSTEM OFFLINE'],
  retryFloor: ['Reiniciar no andar', 'Retry floor'],
  mainMenu: ['Menu principal', 'Main menu'],
  endKicker: ['FIM DE JOGO', 'THE END'],
  endTitle: ['A CIDADE ACORDA', 'THE CITY WAKES UP'],
  finaleSkip: ['Pular ▸', 'Skip ▸'],
  endReplay: ['Revanche (andar 50)', 'Rematch (floor 50)'],
  yes: ['Sim', 'Yes'],
  cancel: ['Cancelar', 'Cancel'],
  charTitle: ['Personagem (I)', 'Character (I)'],
  pauseTitle: ['Pausa (Esc)', 'Pause (Esc)'],
  stimTitle: ['Stim (F): cura 60% da vida na hora', 'Stim (F): instantly heals 60% of your health'],
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
