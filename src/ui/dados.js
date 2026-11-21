// Seção #dados: galeria por categoria e lupa de pixels.
import { $, $$, app, el } from './util.js';
import { decodificar4bits, pintar } from '../core/imagem.js';

export function iniciarDados() {
  const cats = app.dados.galeria.categorias, raiz = $('#galeria');
  let sel = null;
  const imgs = cats.map((c) => c.imagens.map((b) => decodificar4bits(b)));

  function embaralhar(a) { const b = a.map((_, i) => i); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

  function montar(ordem) {
    raiz.replaceChildren(...cats.map((c, ci) => {
      const caixa = el('div', { class: 'gal-imgs' });
      (ordem ? ordem[ci] : imgs[ci].map((_, i) => i)).forEach((k) => {
        const cv = el('canvas', { width: 28, height: 28, 'aria-hidden': 'true' });
        pintar(cv, imgs[ci][k]);
        const b = el('button', { type: 'button', 'aria-label': `Ampliar exemplo ${k + 1} de ${c.nome}` }, cv);
        b.addEventListener('click', () => escolher(ci, k, b));
        caixa.append(b);
      });
      return el('div', { class: 'gal-cat' }, el('h4', { text: c.nome }), caixa);
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
    botao.classList.add('sel'); sel = botao; atual = imgs[ci][k];
    desenharZoom();
    $('#zoom-leitura').textContent = `${cats[ci].nome}: passe o mouse (ou toque) sobre o quadro para ler o valor de cada ponto.`;
  }
  zc.addEventListener('pointermove', (e) => {
    if (!atual) return;
    const r = zc.getBoundingClientRect(), x = Math.min(27, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 28))), y = Math.min(27, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 28)));
    desenharZoom(); zctx.strokeStyle = '#FFD54A'; zctx.lineWidth = 2; zctx.strokeRect(x * C, y * C, C, C);
    $('#zoom-leitura').textContent = `Linha ${y + 1}, coluna ${x + 1}: valor ${atual[y * 28 + x]} (0 = preto, 255 = branco).`;
  });
  void sel;
  montar(null); desenharZoom();
}
