// Seção #dados: galeria por categoria e lupa de pixels.
import { $, $$, app, el } from './util.js';
import { decodificar4bits, pintar } from '../core/imagem.js';
import { t, onLang, catNome } from './i18n.js';

export function iniciarDados() {
  const cats = app.dados.galeria.categorias, raiz = $('#galeria');
  let sel = null, zoomCat = -1, hover = null; // categoria do exemplo ampliado e ponto sob o mouse (para reescrever o texto ao trocar de idioma)
  const imgs = cats.map((c) => c.imagens.map((b) => decodificar4bits(b)));

  function embaralhar(a) { const b = a.map((_, i) => i); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

  function montar(ordem) {
    raiz.replaceChildren(...cats.map((c, ci) => {
      const caixa = el('div', { class: 'gal-imgs' });
      (ordem ? ordem[ci] : imgs[ci].map((_, i) => i)).forEach((k) => {
        const cv = el('canvas', { width: 28, height: 28, 'aria-hidden': 'true' });
        pintar(cv, imgs[ci][k]);
        const b = el('button', { type: 'button', 'data-k': k, 'aria-label': t('dados.aria.ampliar', { k: k + 1, nome: catNome(c.nome) }) }, cv);
        b.addEventListener('click', () => escolher(ci, k, b));
        caixa.append(b);
      });
      return el('div', { class: 'gal-cat' }, el('h4', { text: catNome(c.nome) }), caixa);
    }));
  }
  $('#gal-embaralhar').addEventListener('click', () => { sel = null; montar(imgs.map((l) => embaralhar(l))); });

  const zc = $('#zoom-canvas'), zctx = zc.getContext('2d'), C = zc.width / 28;
  let atual = null;
  function desenharZoom() {
    zctx.clearRect(0, 0, zc.width, zc.height);
    if (!atual) { zctx.fillStyle = '#000'; zctx.fillRect(0, 0, zc.width, zc.height); return; }
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { const v = atual[y * 28 + x]; zctx.fillStyle = `rgb(${v},${v},${v})`; zctx.fillRect(x * C, y * C, C, C); }
    zctx.strokeStyle = 'rgba(255,255,255,.12)'; zctx.lineWidth = 1; zctx.beginPath();
    for (let i = 0; i <= 28; i++) { zctx.moveTo(i * C, 0); zctx.lineTo(i * C, zc.height); zctx.moveTo(0, i * C); zctx.lineTo(zc.width, i * C); }
    zctx.stroke();
  }
  function escolher(ci, k, botao) {
    $$('.gal-imgs button.sel').forEach((b) => b.classList.remove('sel'));
    botao.classList.add('sel'); sel = botao; atual = imgs[ci][k]; zoomCat = ci; hover = null;
    desenharZoom();
    leituraZoom();
  }
  function leituraZoom() {
    const el_ = $('#zoom-leitura');
    if (!atual) el_.textContent = t('dados.leitura_vazia');
    else if (!hover) el_.textContent = t('dados.leitura_cat', { nome: catNome(cats[zoomCat].nome) });
    else el_.textContent = t('como.leitura', { l: hover[1] + 1, c: hover[0] + 1, v: atual[hover[1] * 28 + hover[0]] });
  }
  zc.addEventListener('pointermove', (e) => {
    if (!atual) return;
    const r = zc.getBoundingClientRect(), x = Math.min(27, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 28))), y = Math.min(27, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 28)));
    desenharZoom(); zctx.strokeStyle = '#FFD54A'; zctx.lineWidth = 2; zctx.strokeRect(x * C, y * C, C, C);
    hover = [x, y]; leituraZoom();
  });
  void sel;
  montar(null); desenharZoom(); leituraZoom();
  onLang(() => {
    $$('.gal-cat').forEach((g, ci) => {
      g.querySelector('h4').textContent = catNome(cats[ci].nome);
      $$('button', g).forEach((b) => b.setAttribute('aria-label', t('dados.aria.ampliar', { k: Number(b.dataset.k) + 1, nome: catNome(cats[ci].nome) })));
    });
    leituraZoom();
  });
}
