// Detecta o modelo do controle (Xbox, PlayStation ou Nintendo) e gera os ícones dos botões.
import { G } from './state.js';

// O navegador informa o nome e os IDs do fabricante (Sony 054c, Microsoft 045e, Nintendo 057e)
export function detectPadType(id = '') {
  const s = id.toLowerCase();
  // "Xbox Wireless Controller" (Bluetooth) também tem "wireless controller", como o DualShock 4: testa Xbox antes
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|ps4|ps5|wireless controller/.test(s)) return /0ce6|0df2|dualsense|ps5/.test(s) ? 'ps5' : 'ps4';
  if (/057e|pro controller|nintendo|joy-con|switch/.test(s)) return 'nintendo';
  return 'xbox';
}

// Rótulo e estilo de cada botão no layout padrão (A = botão de baixo, B = direita, X = esquerda, Y = cima)
const MAP = {
  xbox: { a: ['A', 'xa'], b: ['B', 'xb'], x: ['X', 'xx'], y: ['Y', 'xy'], lb: ['LB'], rb: ['RB'], lt: ['LT'], rt: ['RT'], ls: ['LS'], rs: ['RS'], start: ['☰'], select: ['⧉'] },
  ps4: { a: ['✕', 'pa'], b: ['○', 'pb'], x: ['□', 'px'], y: ['△', 'py'], lb: ['L1'], rb: ['R1'], lt: ['L2'], rt: ['R2'], ls: ['L3'], rs: ['R3'], start: ['OPTIONS'], select: ['SHARE'] },
  ps5: { a: ['✕', 'pa'], b: ['○', 'pb'], x: ['□', 'px'], y: ['△', 'py'], lb: ['L1'], rb: ['R1'], lt: ['L2'], rt: ['R2'], ls: ['L3'], rs: ['R3'], start: ['OPTIONS'], select: ['CREATE'] },
  nintendo: { a: ['B', 'nf'], b: ['A', 'nf'], x: ['Y', 'nf'], y: ['X', 'nf'], lb: ['L'], rb: ['R'], lt: ['ZL'], rt: ['ZR'], ls: ['LS'], rs: ['RS'], start: ['+'], select: ['−'] },
};

const type = () => G.padType || 'xbox';

export function glyphText(name) {
  return (MAP[type()][name] || [name.toUpperCase()])[0];
}

export function glyph(name) {
  const [label, cls] = MAP[type()][name] || [name.toUpperCase()];
  const face = ['a', 'b', 'x', 'y'].includes(name);
  return `<span class="pg ${face ? 'pg-face' : 'pg-pill'} ${cls || ''}">${label}</span>`;
}

// Troca {A} {B} {X} {Y} {LB} {RB} {LT} {RT} {LS} {RS} {START} {SELECT} pelos ícones do controle atual
export function padText(str) {
  return str.replace(/\{(A|B|X|Y|LB|RB|LT|RT|LS|RS|START|SELECT)\}/g, (_, k) => glyph(k.toLowerCase()));
}

export function padName() {
  return { xbox: 'Xbox', ps4: 'PlayStation 4', ps5: 'PlayStation 5', nintendo: 'Nintendo Switch' }[type()];
}
