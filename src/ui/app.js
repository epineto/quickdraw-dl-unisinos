// Ponto de entrada: carrega modelo e dados, inicia cada seção e controla a navegação.
import { $, $$, app } from './util.js';
import { criarModelo } from '../core/cnn.js';
import { iniciarInicio } from './inicio.js';
import { iniciarJogo } from './jogo.js';
import { iniciarComoFunciona } from './comofunciona.js';
import { iniciarErros } from './erros.js';
import { iniciarDados } from './dados.js';
import { iniciarResultados } from './resultados.js';
import { iniciarTema } from './tema.js';
import { iniciar as iniciarIdioma, onLang, t } from './i18n.js';

/** Os CSV convertidos em JSON trazem números como texto; converte recursivamente o que parece número. */
function numerizar(x) {
  if (Array.isArray(x)) return x.map(numerizar);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, numerizar(v)]));
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return x;
}

async function json(caminho) {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
}

function navegacao() {
  const links = $$('.nav a'), secs = links.map((a) => $(a.getAttribute('href')));
  if (!('IntersectionObserver' in window)) return;
  const visiveis = new Map();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => visiveis.set(e.target.id, e.intersectionRatio));
    let melhor = null, max = 0;
    visiveis.forEach((r, id) => { if (r > max) { max = r; melhor = id; } });
    if (melhor) links.forEach((a) => { if (a.getAttribute('href') === '#' + melhor) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.01, 0.5, 1] });
  secs.forEach((s) => s && io.observe(s));
}

async function main() {
  iniciarIdioma();
  iniciarTema();
  try {
    const [modelo, matriz, curvas, galeria, resumo] = await Promise.all([
      json('data/cnn_quickdraw.json'), json('data/matriz_confusao.json'), json('data/curvas.json'), json('data/galeria.json'), json('data/resumo.json')]);
    app.modelo = criarModelo(modelo);
    app.dados = { matriz: { ...matriz, pares_top: numerizar(matriz.pares_top), acc: Number(matriz.acc) }, curvas: numerizar(curvas), galeria, resumo };
  } catch (e) {
    const a = $('#erro-carga'), msg = () => t('erro.carga', { detalhe: e.message });
    a.hidden = false;
    a.textContent = msg();
    onLang(() => { a.textContent = msg(); });
    return;
  }
  navegacao();
  iniciarInicio(); iniciarJogo(); iniciarComoFunciona(); iniciarErros(); iniciarDados(); iniciarResultados();
  document.documentElement.dataset.pronto = '1';
}
main();
