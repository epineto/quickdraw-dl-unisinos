// Internacionalização mínima: dicionários são módulos JS (sem fetch). / Minimal i18n: dictionaries are JS modules.
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const DICT = { pt, en };
const CHAVE = 'quickdraw-lang';
let lang = 'pt';
const ouvintes = [];

export const getLang = () => lang;
export const onLang = (fn) => ouvintes.push(fn);

export function detectar() {
  try { const s = localStorage.getItem(CHAVE); if (s === 'pt' || s === 'en') return s; } catch (_) { /* sem storage */ }
  return 'pt';
}

/** Tradução com substituição `{var}`. Cai no português e, por fim, na própria chave. */
export function t(chave, vars = {}) {
  const s = DICT[lang][chave] ?? DICT.pt[chave] ?? chave;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

/** Chave estável de uma categoria a partir do nome em português dos dados (ex.: "bola de basquete" -> "cat.bola_de_basquete"). */
export const chaveCat = (nomePt) => 'cat.' + nomePt.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
/** Nome de categoria no idioma atual. Os ids e valores internos continuam em português. */
export const catNome = (nomePt) => t(chaveCat(nomePt));

export function aplicar() {
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  document.title = t('doc.titulo');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('doc.descricao'));
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((e) => { e.innerHTML = t(e.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-attr]').forEach((e) => {
    e.dataset.i18nAttr.split(';').forEach((par) => { const [attr, k] = par.split(':'); e.setAttribute(attr, t(k)); });
  });
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langBtn === lang)));
}

export function definir(l) {
  if (l !== 'pt' && l !== 'en') return;
  lang = l;
  try { localStorage.setItem(CHAVE, l); } catch (_) { /* sem storage */ }
  aplicar();
  ouvintes.forEach((fn) => fn(l));
}

export function iniciar() {
  lang = detectar();
  aplicar();
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.addEventListener('click', () => definir(b.dataset.langBtn)));
}
