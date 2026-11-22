// Seção #erros: matriz de confusão interativa com exemplos de erros.
import { $, $$, app, pct, fmtNum, el } from './util.js';
import { decodificar4bits, pintar } from '../core/imagem.js';
import { t, onLang, catNome } from './i18n.js';

export function iniciarErros() {
  const M = app.dados.matriz, nomes = M.classes, K = nomes.length, N = (i) => catNome(nomes[i]), // nomes em português (ids internos); exibição via N()
     mat = M.matriz, ex = M.exemplos, gal = app.dados.galeria.categorias;
  const linhaTot = mat.map((l) => l.reduce((a, b) => a + b, 0));
  let maxOff = 0; mat.forEach((l, i) => l.forEach((v, j) => { if (i !== j && v > maxOff) maxOff = v; }));
  const S = { i: 0, j: 1, modo: 'n' };
  const rotuloCel = (i, j) => (i === j ? t('erros.aria.acertos', { real: N(i), n: mat[i][j] }) : t('erros.aria.troca', { real: N(i), prev: N(j), n: mat[i][j] }));
  const raiz = $('#matriz');
  const cabCol = [], cabLin = [], cels = [];

  raiz.append(el('div'));
  nomes.forEach((n, j) => { const d = el('div', { class: 'm-cab-col', text: N(j) }); cabCol.push(d); raiz.append(d); });
  nomes.forEach((n, i) => {
    const d = el('div', { class: 'm-cab-lin', text: N(i) }); cabLin.push(d); raiz.append(d);
    cels[i] = [];
    nomes.forEach((m, j) => {
      const b = el('button', { type: 'button', class: 'm-cel', 'data-i': i, 'data-j': j, 'aria-label': rotuloCel(i, j) }, el('span'));
      b.addEventListener('click', () => escolher(i, j));
      cels[i][j] = b; raiz.append(b);
    });
  });

  function pintaCelulas() {
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
      const n = mat[i][j], taxa = n / linhaTot[i], b = cels[i][j], sp = b.firstChild;
      let a;
      if (i === j) { a = 0.3 + 0.7 * taxa; b.style.background = `rgba(46,125,91,${a})`; }
      else if (n === 0) { a = 0; b.style.background = 'var(--zero)'; }
      else { a = 0.1 + 0.9 * Math.sqrt(n / maxOff); b.style.background = `rgba(192,57,43,${a})`; }
      b.classList.toggle('fraca', a < 0.55);
      const mostra = i === j || (S.modo === 'n' ? n >= 15 : taxa >= 0.02);
      sp.textContent = mostra ? (S.modo === 'n' ? fmtNum(n) : Math.round(taxa * 100)) : '';
    }
  }
  $$('input[name="mat-modo"]').forEach((r) => r.addEventListener('change', () => { S.modo = r.value; pintaCelulas(); }));

  const sr = $('#err-real'), sp = $('#err-prev');
  sr.append(...nomes.map((n, i) => el('option', { value: i, text: N(i) })));
  sp.append(...nomes.map((n, i) => el('option', { value: i, text: N(i) })));
  sr.addEventListener('change', () => escolher(Number(sr.value), S.j));
  sp.addEventListener('change', () => escolher(S.i, Number(sp.value)));

  function miniatura(b64, rotulo) {
    const c = el('canvas', { width: 28, height: 28, role: 'img', 'aria-label': rotulo });
    pintar(c, decodificar4bits(b64));
    return el('div', { class: 'ex' }, c, el('span', { text: rotulo }));
  }

  function escolher(i, j) {
    cels[S.i][S.j].classList.remove('sel'); cabLin[S.i].classList.remove('sel'); cabCol[S.j].classList.remove('sel');
    S.i = i; S.j = j; sr.value = i; sp.value = j;
    cels[i][j].classList.add('sel'); cabLin[i].classList.add('sel'); cabCol[j].classList.add('sel');
    const n = mat[i][j], tot = linhaTot[i], tx = $('#err-texto'), box = $('#err-exemplos');
    box.replaceChildren();
    if (i === j) {
      tx.textContent = t('erros.txt.acerto', { n: fmtNum(n), tot: fmtNum(tot), nome: N(i), p: pct(n / tot) });
      const imgs = gal[i].imagens.slice(0, 4);
      box.append(...imgs.map((b) => miniatura(b, t('erros.ex.exemplo'))));
      box.append(el('p', { class: 'mini', text: t('erros.txt.exemplos') }));
    } else {
      const volta = mat[j][i];
      tx.textContent = t('erros.txt.troca', { n: fmtNum(n), tot: fmtNum(tot), real: N(i), p: pct(n / tot), prev: N(j), volta: fmtNum(volta), tot2: fmtNum(linhaTot[j]) });
      const lista = ex[`${i},${j}`];
      if (lista && lista.length) box.append(...lista.map((o) => miniatura(o.img, t('erros.ex.certeza', { p: pct(o.conf, 0) }))));
      else box.append(el('p', { class: 'mini', text: t(n === 0 ? 'erros.ex.nenhuma' : 'erros.ex.poucas') }));
    }
    $$('#err-pares button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.i) === i && Number(b.dataset.j) === j));
  }

  const pares = $('#err-pares');
  const rotuloPar = (p) => t('erros.par', { a: catNome(p.a), b: catNome(p.b), n: fmtNum(p.total), p: fmtNum(p.pct_do_par, 1) });
  M.pares_top.forEach((p) => {
    const i = nomes.indexOf(p.a), j = nomes.indexOf(p.b), ij = mat[i][j] >= mat[j][i] ? [i, j] : [j, i];
    const b = el('button', { type: 'button', 'data-i': ij[0], 'data-j': ij[1], text: rotuloPar(p) });
    b.addEventListener('click', () => escolher(ij[0], ij[1]));
    pares.append(el('li', {}, b));
  });

  pintaCelulas();
  escolher(nomes.indexOf('gato'), nomes.indexOf('cachorro'));
  // troca de idioma: reescreve rótulos, listas e textos; a célula escolhida e o modo (contagem/porcentagem) continuam
  onLang(() => {
    cabCol.forEach((d, j) => { d.textContent = N(j); });
    cabLin.forEach((d, i) => { d.textContent = N(i); });
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) cels[i][j].setAttribute('aria-label', rotuloCel(i, j));
    $$('option', sr).forEach((o, i) => { o.textContent = N(i); });
    $$('option', sp).forEach((o, i) => { o.textContent = N(i); });
    $$('button', pares).forEach((b, k) => { b.textContent = rotuloPar(M.pares_top[k]); });
    pintaCelulas();
    escolher(S.i, S.j);
  });
}
