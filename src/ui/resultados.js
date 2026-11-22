// Seção #resultados: gráficos em SVG (sem bibliotecas) e controles.
import { $, $$, app, pct, fmtNum, el } from './util.js';
import { prever, topK } from '../core/cnn.js';
import { afim, engrossar, decodificar4bits, pintar } from '../core/imagem.js';

const NS = 'http://www.w3.org/2000/svg';
const COR = { baseline: 'var(--c-base)', mlp: '#4A5AB8', cnn: 'var(--c-cnn)', cnn_aug: '#C0392B' };
const NOME = { baseline: 'Linha de base (regressão logística)', mlp: 'MLP (rede comum)', cnn: 'CNN', cnn_aug: 'CNN com aumento de dados (final)' };
const CURTO = { baseline: 'Linha de base', mlp: 'MLP', cnn: 'CNN', cnn_aug: 'CNN + aumento' };

function svg(w, h, filhos) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('role', 'img');
  s.append(...filhos); return s;
}
function t(tag, attrs = {}, texto) {
  const e = document.createElementNS(NS, tag);
  const vars = [];
  for (const [k, v] of Object.entries(attrs)) { if ((k === 'fill' || k === 'stroke') && String(v).startsWith('var(')) vars.push([k, v]); else e.setAttribute(k, v); }
  vars.forEach(([k, v]) => e.style.setProperty(k, v)); // depois do atributo style, que o sobrescreveria
  if (texto != null) e.textContent = texto;
  return e;
}
function legenda(chaves) {
  return el('div', { class: 'legenda' }, ...chaves.map((k) => { const i = el('i'); i.style.background = COR[k]; return el('span', {}, i, NOME[k]); }));
}
/** Eixo y de 0 a 100% (ou de `min`), com linhas de grade. */
function eixoY(g, x0, x1, y0, y1, min, passo) {
  for (let v = min; v <= 1.0001; v += passo) {
    const y = y1 - ((v - min) / (1 - min)) * (y1 - y0);
    g.push(t('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'grade' }), t('text', { x: x0 - 6, y: y + 4, 'text-anchor': 'end', class: 'rotulo' }, `${Math.round(v * 100)}%`));
  }
}
function animarBarras(raiz) {
  const bs = $$('.barra-g', raiz); bs.forEach((b) => { b.style.transform = 'scaleY(0)'; });
  requestAnimationFrame(() => requestAnimationFrame(() => bs.forEach((b) => { b.style.transform = 'scaleY(1)'; })));
}
const barraEstilo = 'transform-box:fill-box;transform-origin:50% 100%;transition:transform .7s cubic-bezier(.2,.8,.3,1)';

/** Gráfico de barras verticais. itens: [{rotulo, sub, valor, cor, ic:[a,b]}] */
function barras(itens, { w = 460, h = 300, min = 0 } = {}) {
  const x0 = 44, x1 = w - 10, y0 = 18, y1 = h - 62, g = [];
  eixoY(g, x0, x1, y0, y1, min, min === 0 ? 0.2 : 0.1);
  const larg = (x1 - x0) / itens.length, bw = Math.min(70, larg * 0.6);
  itens.forEach((it, i) => {
    const cx = x0 + larg * (i + 0.5), alt = ((it.valor - min) / (1 - min)) * (y1 - y0), y = y1 - alt;
    const r = t('rect', { x: cx - bw / 2, y, width: bw, height: Math.max(0, alt), rx: 4, fill: it.cor, class: 'barra-g', style: barraEstilo });
    r.append(t('title', {}, `${it.rotulo}: ${pct(it.valor)}`));
    g.push(r);
    if (it.ic) {
      const ya = y1 - ((it.ic[0] - min) / (1 - min)) * (y1 - y0), yb = y1 - ((it.ic[1] - min) / (1 - min)) * (y1 - y0);
      g.push(t('line', { x1: cx, x2: cx, y1: ya, y2: yb, stroke: 'var(--barra-erro)', 'stroke-width': 2 }), t('line', { x1: cx - 6, x2: cx + 6, y1: ya, y2: ya, stroke: 'var(--barra-erro)', 'stroke-width': 2 }), t('line', { x1: cx - 6, x2: cx + 6, y1: yb, y2: yb, stroke: 'var(--barra-erro)', 'stroke-width': 2 }));
    }
    g.push(t('text', { x: cx, y: y - (it.ic ? 12 : 6), 'text-anchor': 'middle', class: 'valor' }, pct(it.valor)));
    g.push(t('text', { x: cx, y: y1 + 16, 'text-anchor': 'middle', class: 'rotulo', style: 'font-weight:700;fill:var(--rotulo-forte)' }, it.rotulo));
    if (it.sub) g.push(t('text', { x: cx, y: y1 + 30, 'text-anchor': 'middle', class: 'rotulo' }, it.sub));
  });
  g.push(t('line', { x1: x0, x2: x1, y1: y1, y2: y1, class: 'eixo' }));
  return svg(w, h, g);
}

export function iniciarResultados() {
  const C = app.dados.curvas, comp = Object.fromEntries(C.comparacao.map((c) => [c.modelo, c]));
  const ordem = ['baseline', 'mlp', 'cnn', 'cnn_aug'];

  /* 1. comparação */
  function comparacao() {
    const m = document.querySelector('input[name="cmp-metrica"]:checked').value, box = $('#g-comparacao');
    const itens = ordem.map((k) => ({ rotulo: CURTO[k], sub: `${fmtNum(comp[k].parametros)} parâm.`, valor: comp[k][m], cor: COR[k], ic: m === 'acc_media' ? [comp[k].ic95_inf, comp[k].ic95_sup] : null }));
    box.replaceChildren(barras(itens));
    animarBarras(box);
    const c = comp.cnn, b = comp.baseline, mlp = comp.mlp;
    $('#cmp-texto').textContent = m === 'acc_media'
      ? `A CNN acerta ${pct(c.acc_media)} (intervalo de 95%: ${pct(c.ic95_inf)} a ${pct(c.ic95_sup)}), contra ${pct(mlp.acc_media)} do MLP e ${pct(b.acc_media)} da linha de base. A CNN usa ${fmtNum(c.parametros)} parâmetros, menos da metade dos ${fmtNum(mlp.parametros)} do MLP. A versão com aumento de dados (a do laboratório) perde ${fmtNum(Math.round(c.acc_media * 1000) / 10 - Math.round(comp.cnn_aug.acc_media * 1000) / 10, 1)} ponto no teste padrão, mas aguenta melhor desenhos fora do padrão.`
      : `A resposta certa está entre os 3 primeiros palpites em ${pct(c.top3_media)} dos desenhos com a CNN, ${pct(mlp.top3_media)} com o MLP e ${pct(b.top3_media)} com a linha de base.`;
  }
  $$('input[name="cmp-metrica"]').forEach((r) => r.addEventListener('change', comparacao));
  comparacao();

  /* 2. curva de aprendizado */
  const CA = C.curva_aprendizado, ns = [...new Set(CA.map((r) => r.por_classe))].sort((a, b) => a - b), ativos = new Set(['baseline', 'mlp', 'cnn']);
  const sl = $('#curva-n'); sl.max = ns.length - 1; sl.value = 1;
  const vm = $('#curva-modelos');
  ['baseline', 'mlp', 'cnn'].forEach((k) => {
    const b = el('button', { type: 'button', class: 'botao pequeno', 'aria-pressed': 'true', text: CURTO[k] });
    b.style.setProperty('--c', COR[k]);
    b.addEventListener('click', () => { if (ativos.has(k) && ativos.size > 1) ativos.delete(k); else ativos.add(k); b.setAttribute('aria-pressed', String(ativos.has(k))); curva(); });
    vm.append(b);
  });
  const val = (k, n) => (CA.find((r) => r.modelo === k && r.por_classe === n) || {}).acc_teste;
  function curva() {
    const w = 460, h = 300, x0 = 44, x1 = w - 16, y0 = 18, y1 = h - 44, min = 0.5, g = [], idx = Number(sl.value), n = ns[idx];
    eixoY(g, x0, x1, y0, y1, min, 0.1);
    const X = (i) => x0 + 20 + (i / (ns.length - 1)) * (x1 - x0 - 40), Y = (v) => y1 - ((v - min) / (1 - min)) * (y1 - y0);
    ns.forEach((nn, i) => g.push(t('text', { x: X(i), y: y1 + 16, 'text-anchor': 'middle', class: 'rotulo' }, fmtNum(nn))));
    g.push(t('text', { x: (x0 + x1) / 2, y: h - 6, 'text-anchor': 'middle', class: 'rotulo' }, 'desenhos de treino por categoria (eixo vertical a partir de 50%)'));
    g.push(t('line', { x1: X(idx), x2: X(idx), y1: y0, y2: y1, stroke: '#FFB400', 'stroke-width': 3, 'stroke-dasharray': '4 3' }));
    ['baseline', 'mlp', 'cnn'].filter((k) => ativos.has(k)).forEach((k) => {
      const pts = ns.map((nn, i) => [X(i), Y(val(k, nn))]);
      g.push(t('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: COR[k], 'stroke-width': 3, 'stroke-linejoin': 'round' }));
      pts.forEach((p, i) => { const c = t('circle', { cx: p[0], cy: p[1], r: i === idx ? 7 : 4.5, fill: COR[k], stroke: '#fff', 'stroke-width': 2 }); c.append(t('title', {}, `${CURTO[k]}, ${fmtNum(ns[i])} por categoria: ${pct(val(k, ns[i]))}`)); g.push(c); });
      g.push(t('text', { x: pts[idx][0], y: pts[idx][1] - 12, 'text-anchor': 'middle', class: 'valor', fill: COR[k] }, pct(val(k, n))));
    });
    g.push(t('line', { x1: x0, x2: x1, y1: y1, y2: y1, class: 'eixo' }));
    $('#g-curva').replaceChildren(svg(w, h, g));
    $('#curva-saida').textContent = `${fmtNum(n)} por categoria (${fmtNum(n * 18)} desenhos)`;
    const fim = ns[ns.length - 1], cn = val('cnn', n), cf = val('cnn', fim);
    $('#curva-texto').textContent = `Com ${fmtNum(n)} desenhos por categoria, a CNN acerta ${pct(cn)}${n === fim ? '' : `, ${fmtNum((cn / cf) * 100, 0)}% do resultado com ${fmtNum(fim)}`}. O MLP chega a ${pct(val('mlp', n))} e a linha de base a ${pct(val('baseline', n))}.`;
  }
  sl.addEventListener('input', curva);
  $('#g-curva').after(el('p', { class: 'mini', id: 'curva-texto', 'aria-live': 'polite' }));
  curva();

  /* 3. robustez */
  const R = C.robustez, tipos = [...new Set(R.map((r) => r.transformacao))];
  const selT = $('#rob-tipo'), slv = $('#rob-valor');
  selT.append(...tipos.map((n) => el('option', { value: n, text: n.charAt(0).toUpperCase() + n.slice(1) })));
  const valoresDe = (tp) => [...new Set(R.filter((r) => r.transformacao === tp).map((r) => r.valor))].sort((a, b) => a - b);
  const rotuloValor = (tp, v) => tp.startsWith('desloc') ? (v === 0 ? 'sem deslocamento' : `${v} px para a direita`) : tp.startsWith('rota') ? (v === 0 ? 'sem rotação' : `${v} graus`)
    : tp.startsWith('esc') ? (v === 1 ? 'tamanho original' : `escala ${fmtNum(v, 1)}`) : (v === 0 ? 'traço normal' : `traço engrossado ${v} ${v === 1 ? 'vez' : 'vezes'}`);
  const acc = (m, tp, v) => (R.find((r) => r.modelo === m && r.transformacao === tp && r.valor === v) || {}).acc;
  let baseDemo = null;
  function imagemBase() {
    if (app.pixels) return app.pixels;
    const c = app.dados.galeria.categorias, k = Math.max(0, app.modelo.classes.indexOf('sun'));
    return decodificar4bits(c[k].imagens[0]);
  }
  function transformar(img, tp, v) {
    if (tp.startsWith('desloc')) return afim(img, { dx: v });
    if (tp.startsWith('rota')) return afim(img, { angulo: v });
    if (tp.startsWith('esc')) return afim(img, { escala: v });
    return engrossar(img, v);
  }
  function robustez(reinicia) {
    const tp = selT.value, vs = valoresDe(tp);
    if (reinicia) { slv.max = vs.length - 1; slv.value = Math.min(vs.length - 1, Math.floor(vs.length / 2) + (vs.length > 3 ? 1 : 0)); }
    const v = vs[Number(slv.value)];
    $('#rob-saida').textContent = rotuloValor(tp, v);
    const ms = ['mlp', 'cnn', 'cnn_aug'], box = $('#g-robustez');
    box.replaceChildren(barras(ms.map((k) => ({ rotulo: CURTO[k], valor: acc(k, tp, v), cor: COR[k] })), { w: 420, h: 280 }));
    animarBarras(box);
    const zero = tp.startsWith('esc') ? 1 : 0;
    $('#rob-texto').textContent = `${rotuloValor(tp, v)}: MLP ${pct(acc('mlp', tp, v))}, CNN ${pct(acc('cnn', tp, v))}, CNN com aumento ${pct(acc('cnn_aug', tp, v))}. Sem mudança: ${pct(acc('mlp', tp, zero))}, ${pct(acc('cnn', tp, zero))} e ${pct(acc('cnn_aug', tp, zero))}.${tp.startsWith('esp') ? ' O aumento de dados não incluía espessura, por isso não ajuda aqui.' : ''}`;
    // teste ao vivo
    baseDemo = imagemBase();
    const nova = transformar(baseDemo, tp, v), a = topK(prever(app.modelo, baseDemo).probs, 1)[0], b = topK(prever(app.modelo, nova).probs, 1)[0], nm = app.modelo.nomes;
    pintar($('#rob-orig'), baseDemo); pintar($('#rob-transf'), nova);
    $('#rob-ao-vivo-txt').textContent = `Original: ${nm[a.classe]} (${pct(a.p, 0)}). Transformado (${rotuloValor(tp, v)}): ${nm[b.classe]} (${pct(b.p, 0)}).`;
  }
  selT.addEventListener('change', () => robustez(true));
  slv.addEventListener('input', () => robustez(false));
  app.bus.addEventListener('desenho', () => robustez(false));
  robustez(true);

  /* 4. calibração */
  const cal = C.calibracao.cnn_aug, ex = app.dados.resumo.calibracao_extra;
  function calibracao() {
    const usaT = $('#cal-temp').checked, curvaC = usaT ? cal.curva_temperatura : cal.curva;
    const w = 420, h = 340, x0 = 44, x1 = w - 14, y0 = 14, y1 = h - 44, g = [];
    const X = (v) => x0 + v * (x1 - x0), Y = (v) => y1 - v * (y1 - y0);
    for (let v = 0; v <= 1.0001; v += 0.2) {
      g.push(t('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), class: 'grade' }), t('text', { x: x0 - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'rotulo' }, `${Math.round(v * 100)}%`),
        t('text', { x: X(v), y: y1 + 16, 'text-anchor': 'middle', class: 'rotulo' }, `${Math.round(v * 100)}%`));
    }
    g.push(t('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: '#8A8FA8', 'stroke-width': 2, 'stroke-dasharray': '6 4' }), t('text', { x: X(0.62), y: Y(0.72), class: 'rotulo', transform: `rotate(-${Math.round(Math.atan((y1 - y0) / (x1 - x0)) * 57.3)} ${X(0.62)} ${Y(0.72)})` }, 'calibração perfeita'));
    const pts = curvaC.filter((p) => p.n >= 20);
    g.push(t('polyline', { points: pts.map((p) => `${X(p.conf)},${Y(p.acc)}`).join(' '), fill: 'none', stroke: COR.cnn_aug, 'stroke-width': 3 }));
    pts.forEach((p) => { const c = t('circle', { cx: X(p.conf), cy: Y(p.acc), r: 3 + Math.min(9, Math.sqrt(p.n) / 14), fill: COR.cnn_aug, 'fill-opacity': .75, stroke: '#fff', 'stroke-width': 1.5, class: 'ponto' }); c.append(t('title', {}, `Confiança ${pct(p.conf, 0)}: acerto real ${pct(p.acc, 0)} (${fmtNum(p.n)} desenhos)`)); g.push(c); });
    g.push(t('text', { x: (x0 + x1) / 2, y: h - 6, 'text-anchor': 'middle', class: 'rotulo' }, 'confiança da rede (eixo horizontal) × acerto real (vertical)'));
    g.push(t('line', { x1: x0, x2: x1, y1: y1, y2: y1, class: 'eixo' }));
    $('#g-calibracao').replaceChildren(svg(w, h, g));
    $('#cal-texto').textContent = `Erro de calibração (ECE): ${pct(usaT ? cal.ece_depois_temperatura : cal.ece)}${usaT ? ` com T = ${fmtNum(cal.temperatura, 2)}` : ''}. Quanto mais perto da linha tracejada, mais honesta a confiança. Em média, a rede tem ${pct(ex.confianca_media_acertos)} de confiança quando acerta e ${pct(ex.confianca_media_erros)} quando erra: confiança baixa é um bom sinal de alerta. Círculos maiores = mais desenhos.`;
  }
  $('#cal-temp').addEventListener('change', calibracao);
  calibracao();

  /* 5. por categoria */
  const cls = [...C.acuracia_por_classe].sort((a, b) => b.acuracia - a.acuracia), w = 420, rh = 22, h = cls.length * rh + 12, g = [];
  const max = cls[0].acuracia, min = cls[cls.length - 1].acuracia;
  cls.forEach((c, i) => {
    const y = 6 + i * rh, bw = (c.acuracia) * (w - 190), cor = c.acuracia === max ? '#2E7D5B' : c.acuracia === min ? '#C0392B' : '#4A5AB8';
    g.push(t('text', { x: 118, y: y + 14, 'text-anchor': 'end', class: 'rotulo', style: 'fill:var(--texto)' }, c.categoria), t('rect', { x: 124, y: y + 2, width: bw, height: rh - 7, rx: 3, fill: cor }), t('text', { x: 124 + bw + 6, y: y + 14, class: 'valor' }, pct(c.acuracia)));
  });
  $('#g-classes').replaceChildren(svg(w, h, g));
  $('#g-classes').append(el('p', { class: 'mini', text: `Mais fáceis: ${cls[0].categoria} e ${cls[1].categoria}. Mais difícil: ${cls[cls.length - 1].categoria}, que se parece com cachorro e avião dependendo do ângulo.` }));
  void legenda;
}
