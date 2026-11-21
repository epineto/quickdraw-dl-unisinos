// Seção #inicio: números de destaque e demonstração automática (um desenho se forma e a rede dá o palpite).
import { $, app, pct, fmtNum, el, parcial, escalar, pintarTracos, reduzMovimento, aoVisivel } from './util.js';
import { prever, topK } from '../core/cnn.js';
import { rasterizar } from '../core/rasterizar.js';
import { FORMAS } from '../core/formas.js';

export function iniciarInicio() {
  const final = app.dados.curvas.comparacao.find((c) => c.modelo === 'cnn_aug');
  const nums = [[String(app.modelo.classes.length), 'categorias de desenhos'], [pct(final.acc_media), 'de acerto no teste (rede final)'],
    [fmtNum(app.dados.resumo.tamanhos.teste), 'desenhos de teste, nunca vistos'], [fmtNum(final.parametros), 'parâmetros (pesos) na rede']];
  $('#hero-nums').replaceChildren(...nums.map(([n, t]) => el('div', { class: 'num' }, el('strong', { text: n }), el('span', { text: t }))));

  const cv = $('#hero-canvas'), ctx = cv.getContext('2d'), L = cv.width;
  const chaves = ['sun', 'house', 'star', 'fish', 'flower', 'umbrella', 'apple', 'clock', 'car', 'tree'];
  let i = 0, visivel = true, id = 0;
  const nomes = app.modelo.nomes;

  function quadro(tracos) {
    ctx.clearRect(0, 0, L, L);
    pintarTracos(ctx, tracos, { largura: 9 });
    if (!tracos.length) return;
    const top = topK(prever(app.modelo, rasterizar(tracos)).probs, 1)[0];
    $('#hero-palpite').textContent = nomes[top.classe];
    $('#hero-conf').textContent = `(${pct(top.p, 0)})`;
  }
  function ciclo() {
    const alvo = escalar(FORMAS[chaves[i % chaves.length]].tracos, L, 0.1);
    const estatico = reduzMovimento(), dur = 1700, t0 = performance.now();
    const passo = (agora) => {
      if (!visivel) { id = 0; return; }
      const p = estatico ? 1 : Math.min(1, (agora - t0) / dur);
      quadro(parcial(alvo, p));
      if (p < 1) id = requestAnimationFrame(passo);
      else id = setTimeout(() => { i++; id = 0; ciclo(); }, estatico ? 3500 : 1700);
    };
    id = requestAnimationFrame(passo);
  }
  aoVisivel(cv, (v) => { const era = visivel; visivel = v; if (v && !era && !id) ciclo(); });
  ciclo();
}
