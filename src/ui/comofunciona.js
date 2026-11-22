// Seção #como-funciona: preparo do desenho, passo a passo pela rede, lupa deslizante e mapa de calor (oclusão).
import { $, $$, app, pct, fmtNum, el, debounce, pintarTracos, pintarMapa, ampliar, reduzMovimento } from './util.js';
import { prever, topK } from '../core/cnn.js';
import { decodificar4bits, pintar } from '../core/imagem.js';
import { caixa, normalizar } from '../core/rasterizar.js';
import { mapaOclusao } from '../core/oclusao.js';
import { t, onLang, catNome } from './i18n.js';

export function iniciarComoFunciona() {
  const nomes = app.modelo.nomes, galeria = app.dados.galeria.categorias; // nomes em português (ids internos); a exibição passa por N()
  const N = (i) => catNome(nomes[i]);
  const S = { hover: null, calcOk: false, ordem: [], fonte: 'exemplo', cat: Math.max(0, app.modelo.classes.indexOf('house')), ex: 0, r: null, px: null, passo: 4, tocando: 0, lupaPos: 783, lupaTocando: 0, ocl: 0 };
  const selCat = $('#sel-cat');
  selCat.append(...nomes.map((n, i) => el('option', { value: i, text: N(i) })));
  selCat.value = S.cat;
  const radioMeu = $('input[name="fonte"][value="meu"]'), radioEx = $('input[name="fonte"][value="exemplo"]');
  radioMeu.disabled = true;

  /* ---------- fonte do desenho ---------- */
  const exemplo = () => decodificar4bits(galeria[S.cat].imagens[S.ex % galeria[S.cat].imagens.length]);
  function pixelsAtuais() { return S.fonte === 'meu' && app.pixels ? app.pixels : exemplo(); }
  function aviso() {
    $('#fonte-aviso').textContent = t(S.fonte === 'meu' ? 'como.aviso.meu' : app.pixels ? 'como.aviso.ex_com' : 'como.aviso.ex_sem');
    selCat.disabled = S.fonte === 'meu'; $('#btn-outro').disabled = S.fonte === 'meu';
  }
  $$('input[name="fonte"]').forEach((r) => r.addEventListener('change', () => { S.fonte = r.value; aviso(); tudo(); }));
  selCat.addEventListener('change', () => { S.cat = Number(selCat.value); S.ex = 0; tudo(); });
  $('#btn-outro').addEventListener('click', () => { S.ex = (S.ex + 1) % galeria[S.cat].imagens.length; tudo(); });
  let primeira = true;
  const aoDesenhar = debounce(() => {
    const tem = !!app.pixels;
    radioMeu.disabled = !tem;
    if (tem && primeira) { primeira = false; S.fonte = 'meu'; radioMeu.checked = true; }
    if (!tem) { primeira = true; if (S.fonte === 'meu') { S.fonte = 'exemplo'; radioEx.checked = true; } }
    aviso(); tudo();
  }, 160);
  app.bus.addEventListener('desenho', aoDesenhar);

  /* ---------- passo zero ---------- */
  const prepQ = $('#prep-quadro'), prepC = $('#prep-centro'), prepP = $('#prep-pixels');
  function grade(ctx, lado, n) {
    ctx.strokeStyle = 'rgba(29,35,105,.12)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const p = (i * lado) / n; ctx.moveTo(p, 0); ctx.lineTo(p, lado); ctx.moveTo(0, p); ctx.lineTo(lado, p); }
    ctx.stroke();
  }
  function passoZero() {
    const a = prepQ.getContext('2d'), b = prepC.getContext('2d'), W = 240;
    a.clearRect(0, 0, W, W); b.clearRect(0, 0, W, W);
    pintar(prepP, S.px);
    if (S.fonte === 'meu' && app.tracos) {
      const k = W / 400, tr = app.tracos.map((t) => t.map(([x, y]) => [x * k, y * k]));
      pintarTracos(a, tr, { largura: 5 });
      const c = caixa(tr);
      a.setLineDash([5, 4]); a.strokeStyle = '#C0392B'; a.lineWidth = 2; a.strokeRect(c.x0 - 3, c.y0 - 3, c.x1 - c.x0 + 6, c.y1 - c.y0 + 6); a.setLineDash([]);
      grade(b, W, 28);
      b.strokeStyle = '#C0392B'; b.lineWidth = 2; b.setLineDash([5, 4]); b.strokeRect(W / 28, W / 28, (W * 26) / 28, (W * 26) / 28); b.setLineDash([]);
      pintarTracos(b, normalizar(app.tracos).map((t) => t.map(([x, y]) => [(x * W) / 28, (y * W) / 28])), { largura: (1.7 * W) / 28 });
    } else {
      const tmp = document.createElement('canvas'); pintar(tmp, S.px, { invertido: true });
      a.imageSmoothingEnabled = true; a.drawImage(tmp, 0, 0, W, W);
      let x0 = 28, y0 = 28, x1 = -1, y1 = -1;
      S.px.forEach((v, i) => { if (v > 30) { const x = i % 28, y = (i / 28) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
      a.setLineDash([5, 4]); a.strokeStyle = '#C0392B'; a.lineWidth = 2; a.strokeRect((x0 * W) / 28, (y0 * W) / 28, ((x1 - x0 + 1) * W) / 28, ((y1 - y0 + 1) * W) / 28); a.setLineDash([]);
      grade(b, W, 28); b.imageSmoothingEnabled = false;
      const t2 = document.createElement('canvas'); pintar(t2, S.px, { invertido: true });
      b.drawImage(t2, 0, 0, W, W); grade(b, W, 28);
    }
  }
  prepP.addEventListener('pointermove', (e) => {
    const r = prepP.getBoundingClientRect(), x = Math.min(27, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 28))), y = Math.min(27, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 28)));
    S.hover = [x, y]; leituraPrep();
  });
  function leituraPrep() {
    const h = S.hover;
    $('#prep-leitura').textContent = h ? t('como.leitura', { l: h[1] + 1, c: h[0] + 1, v: S.px[h[1] * 28 + h[0]] }) : t('como.leitura_vazia');
  }

  /* ---------- pipeline ---------- */
  const etapas = $$('.etapa');
  const c1 = $('#et-c1'), c2 = $('#et-c2'), c3 = $('#et-c3');
  const cria = (box, n) => { for (let i = 0; i < n; i++) box.append(el('canvas', { width: 1, height: 1, 'aria-hidden': 'true' })); };
  cria(c1, 16); cria(c2, 32); cria(c3, 64);
  const saida = $('#et-saida');
  saida.append(...nomes.map(() => el('li', {}, el('span', { class: 'sn' }), el('span', { class: 'st' }, el('span', { class: 'sb' })), el('span', { class: 'sp' }))));
  function mapas(box, dados, n, h) {
    $$('canvas', box).forEach((cv, i) => { pintarMapa(cv, dados.subarray(i * h * h, (i + 1) * h * h), h, h); cv.style.animationDelay = `${i * 20}ms`; });
  }
  function pipeline() {
    pintar($('#et-entrada'), S.px);
    mapas(c1, S.r.ativ.pool1, 16, 14); mapas(c2, S.r.ativ.pool2, 32, 7); mapas(c3, S.r.ativ.pool3, 64, 3);
    const ordem = Array.from(S.r.probs, (p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    $$('li', saida).forEach((li, k) => {
      const [p, i] = ordem[k];
      li.classList.toggle('topo', k === 0);
      li.children[0].textContent = N(i); li.children[2].textContent = pct(p, 0);
      li.dataset.p = p.toFixed(4);
    });
    S.ordem = ordem.map((o) => o[1]);
    estagio();
  }
  function estagio() {
    etapas.forEach((e, i) => {
      e.classList.toggle('feita', i < S.passo);
      const ativa = i === S.passo;
      if (ativa && !e.classList.contains('ativa')) { e.classList.remove('ativa'); void e.offsetWidth; }
      e.classList.toggle('ativa', ativa);
    });
    $$('li', saida).forEach((li) => { li.querySelector('.sb').style.transform = S.passo >= 4 ? `scaleX(${li.dataset.p})` : 'scaleX(0)'; });
    $('#pp-ant').disabled = S.passo <= 0; $('#pp-prox').disabled = S.passo >= 4;
  }
  $('#pp-ant').addEventListener('click', () => { pararToque(); S.passo = Math.max(0, S.passo - 1); estagio(); });
  $('#pp-prox').addEventListener('click', () => { pararToque(); S.passo = Math.min(4, S.passo + 1); estagio(); });
  function pararToque() { if (S.tocando) { clearInterval(S.tocando); S.tocando = 0; } $('#pp-tocar').setAttribute('aria-pressed', 'false'); rotuloTocar(); }
  function rotuloTocar() { $('#pp-tocar').textContent = t(S.tocando ? 'como.pausar' : 'como.pp.tocar'); }
  $('#pp-tocar').addEventListener('click', () => {
    if (S.tocando) { pararToque(); return; }
    S.passo = 0; estagio(); $('#pp-tocar').setAttribute('aria-pressed', 'true');
    S.tocando = setInterval(() => { if (S.passo >= 4) { pararToque(); return; } S.passo++; estagio(); }, reduzMovimento() ? 400 : 1600);
    rotuloTocar();
  });

  /* ---------- lupa ---------- */
  const lf = $('#lupa-filtro');
  lf.append(...Array.from({ length: 16 }, (_, i) => el('option', { value: i, text: t('como.filtro', { n: i + 1 }) })));
  const lin = $('#lupa-entrada'), lout = $('#lupa-saida'), tmpIn = document.createElement('canvas'), tmpOut = document.createElement('canvas');
  function pesosDoFiltro() { const L1 = app.modelo.camadas[0], f = Number(lf.value); return { w: L1.w.subarray(f * 9, f * 9 + 9), b: L1.b[f], f }; }
  function lupa() {
    const { w, b, f } = pesosDoFiltro(), pos = S.lupaPos, px = pos % 28, py = (pos / 28) | 0, K = 7;
    // entrada
    const a = lin.getContext('2d'); pintar(tmpIn, S.px); a.imageSmoothingEnabled = false; a.drawImage(tmpIn, 0, 0, 196, 196);
    a.strokeStyle = '#FFD54A'; a.lineWidth = 2; a.strokeRect((px - 1) * K, (py - 1) * K, 3 * K, 3 * K);
    a.strokeStyle = '#C0392B'; a.lineWidth = 1; a.strokeRect((px - 1) * K + 1, (py - 1) * K + 1, 3 * K - 2, 3 * K - 2);
    // saída revelada até a posição atual
    const m = S.r.ativ.conv1.subarray(f * 784, (f + 1) * 784);
    let max = 0; for (let i = 0; i < 784; i++) if (m[i] > max) max = m[i];
    tmpOut.width = 28; tmpOut.height = 28;
    const c = tmpOut.getContext('2d'), im = c.createImageData(28, 28);
    for (let i = 0; i < 784; i++) {
      const v = i <= pos ? 255 - Math.round((max > 0 ? m[i] / max : 0) * 226) : 233;
      const rgb = i <= pos ? [v, v, 255 - Math.round((max > 0 ? m[i] / max : 0) * 150)] : [233, 236, 243];
      im.data[4 * i] = rgb[0]; im.data[4 * i + 1] = rgb[1]; im.data[4 * i + 2] = rgb[2]; im.data[4 * i + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    const o = lout.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(tmpOut, 0, 0, 196, 196);
    o.strokeStyle = '#C0392B'; o.lineWidth = 2; o.strokeRect(px * K, py * K, K, K);
    // conta
    let soma = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = px + i, y = py + j; if (x >= 0 && y >= 0 && x < 28 && y < 28) soma += w[(j + 1) * 3 + i + 1] * S.px[y * 28 + x] / 255; }
    const tot = soma + b;
    $('#lupa-conta').textContent = t('como.lupa.conta', { l: py + 1, c: px + 1, soma: fmtNum(soma, 2), vies: fmtNum(b, 2), tot: fmtNum(tot, 2), relu: fmtNum(Math.max(0, tot), 2) });
    const mx = Math.max(...Array.from(w, Math.abs)) || 1;
    $('#lupa-pesos').replaceChildren(...Array.from(w, (v) => {
      const t = Math.abs(v) / mx, cor = v >= 0 ? `rgba(74,90,184,${0.15 + 0.85 * t})` : `rgba(192,57,43,${0.15 + 0.85 * t})`;
      const s = el('span', { text: fmtNum(v, 2) }); s.style.background = cor; if (t > 0.6) s.style.color = '#fff'; return s;
    }));
  }
  lf.addEventListener('change', lupa);
  function lupaPasso() {
    if (!S.lupaTocando) return;
    S.lupaPos = Math.min(783, S.lupaPos + (reduzMovimento() ? 28 : 2)); lupa();
    if (S.lupaPos >= 783) { lupaParar(); return; }
    S.lupaTocando = requestAnimationFrame(lupaPasso);
  }
  function lupaParar() { if (S.lupaTocando) cancelAnimationFrame(S.lupaTocando); S.lupaTocando = 0; $('#lupa-tocar').setAttribute('aria-pressed', 'false'); rotuloLupa(); }
  function rotuloLupa() { $('#lupa-tocar').textContent = t(S.lupaTocando ? 'como.pausar' : 'como.tocar'); }
  $('#lupa-tocar').addEventListener('click', () => {
    if (S.lupaTocando) { lupaParar(); return; }
    if (S.lupaPos >= 783) S.lupaPos = 0;
    $('#lupa-tocar').setAttribute('aria-pressed', 'true');
    S.lupaTocando = requestAnimationFrame(lupaPasso); rotuloLupa();
  });
  $('#lupa-reiniciar').addEventListener('click', () => { lupaParar(); S.lupaPos = 0; lupa(); });

  /* ---------- mapa de calor ---------- */
  const cs = $('#calor-classe');
  cs.append(el('option', { value: 'auto', text: t('como.calor.auto') }), ...nomes.map((n, i) => el('option', { value: i, text: N(i) })));
  const calorBase = $('#calor-base'), calorMapa = $('#calor-mapa');
  $('#calor-opac').addEventListener('input', (e) => { calorMapa.style.opacity = e.target.value / 100; });
  calorMapa.style.opacity = 0.8;
  async function calor() {
    const id = ++S.ocl, classe = cs.value === 'auto' ? topK(S.r.probs, 1)[0].classe : Number(cs.value);
    pintar(calorBase, S.px);
    S.calcOk = false; textoCalor();
    calorMapa.getContext('2d').clearRect(0, 0, 28, 28);
    const res = await mapaOclusao(app.modelo, S.px, classe, { cancelado: () => id !== S.ocl });
    if (!res) return;
    calorMapa.width = 28; calorMapa.height = 28;
    const c = calorMapa.getContext('2d'), im = c.createImageData(28, 28);
    for (let i = 0; i < 784; i++) { const t = res.max > 0 ? res.mapa[i] / res.max : 0; im.data[4 * i] = 255; im.data[4 * i + 1] = 40; im.data[4 * i + 2] = 40; im.data[4 * i + 3] = Math.round(255 * t * t); }
    c.putImageData(im, 0, 0);
    S.calor = { classe, max: res.max, p: S.r.probs[classe] }; S.calcOk = true; textoCalor();
  }
  function textoCalor() {
    $('#calor-leitura').textContent = S.calcOk ? t('como.calor.leitura', { nome: N(S.calor.classe), p: pct(S.calor.p, 0), max: fmtNum(S.calor.max, 1) }) : t('como.calor.calculando');
  }
  cs.addEventListener('change', calor);

  /* ---------- tudo ---------- */
  const recalcular = debounce(calor, 250);
  function tudo() {
    S.px = pixelsAtuais(); S.r = prever(app.modelo, S.px);
    passoZero(); pipeline(); lupa(); recalcular();
  }
  rotuloTocar(); rotuloLupa(); leituraPrep();
  aviso(); tudo();
  // troca de idioma: reescreve só os textos (listas, avisos, leituras); o desenho, o passo e a lupa em curso não são reiniciados
  onLang(() => {
    $$('option', selCat).forEach((o, i) => { o.textContent = N(i); });
    $$('option', cs).forEach((o) => { if (o.value === 'auto') o.textContent = t('como.calor.auto'); else o.textContent = N(Number(o.value)); });
    $$('option', lf).forEach((o, i) => { o.textContent = t('como.filtro', { n: i + 1 }); });
    aviso(); leituraPrep(); rotuloTocar(); rotuloLupa(); textoCalor();
    $$('li', saida).forEach((li, k) => { li.children[0].textContent = N(S.ordem[k]); li.children[2].textContent = pct(Number(li.dataset.p), 0); });
    lupa();
  });
  window.__como = S;
}
