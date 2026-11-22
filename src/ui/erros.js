// Seção #erros: matriz de confusão interativa com exemplos de erros.
import { $, $$, app, pct, fmtNum, el } from './util.js';
import { decodificar4bits, pintar } from '../core/imagem.js';

export function iniciarErros() {
  const M = app.dados.matriz, nomes = M.classes, K = nomes.length, mat = M.matriz, ex = M.exemplos, gal = app.dados.galeria.categorias;
  const linhaTot = mat.map((l) => l.reduce((a, b) => a + b, 0));
  let maxOff = 0; mat.forEach((l, i) => l.forEach((v, j) => { if (i !== j && v > maxOff) maxOff = v; }));
  const S = { i: 0, j: 1, modo: 'n' };
  const raiz = $('#matriz');
  const cabCol = [], cabLin = [], cels = [];

  raiz.append(el('div'));
  nomes.forEach((n, j) => { const d = el('div', { class: 'm-cab-col', text: n }); cabCol.push(d); raiz.append(d); });
  nomes.forEach((n, i) => {
    const d = el('div', { class: 'm-cab-lin', text: n }); cabLin.push(d); raiz.append(d);
    cels[i] = [];
    nomes.forEach((m, j) => {
      const b = el('button', { type: 'button', class: 'm-cel', 'data-i': i, 'data-j': j, 'aria-label': `${i === j ? 'Acertos de' : 'Real'} ${n}${i === j ? '' : ', palpite ' + m}: ${mat[i][j]}` }, el('span'));
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
  sr.append(...nomes.map((n, i) => el('option', { value: i, text: n })));
  sp.append(...nomes.map((n, i) => el('option', { value: i, text: n })));
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
    const n = mat[i][j], tot = linhaTot[i], t = $('#err-texto'), box = $('#err-exemplos');
    box.replaceChildren();
    if (i === j) {
      t.textContent = `${fmtNum(n)} de ${fmtNum(tot)} desenhos de "${nomes[i]}" foram reconhecidos (${pct(n / tot)}).`;
      const imgs = gal[i].imagens.slice(0, 4);
      box.append(...imgs.map((b) => miniatura(b, 'exemplo')));
      box.append(el('p', { class: 'mini', text: 'Exemplos do conjunto de dados (os exemplos de erro ficam nas células vermelhas).' }));
    } else {
      const volta = mat[j][i];
      t.textContent = `${fmtNum(n)} de ${fmtNum(tot)} desenhos de "${nomes[i]}" (${pct(n / tot)}) foram chamados de "${nomes[j]}". No sentido contrário: ${fmtNum(volta)} de ${fmtNum(linhaTot[j])}.`;
      const lista = ex[`${i},${j}`];
      if (lista && lista.length) box.append(...lista.map((o) => miniatura(o.img, `${pct(o.conf, 0)} de certeza`)));
      else box.append(el('p', { class: 'mini', text: n === 0 ? 'Nenhuma troca nesta combinação.' : 'Poucas trocas: não há exemplos guardados para esta célula.' }));
    }
    $$('#err-pares button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.i) === i && Number(b.dataset.j) === j));
  }

  const pares = $('#err-pares');
  M.pares_top.forEach((p) => {
    const i = nomes.indexOf(p.a), j = nomes.indexOf(p.b), ij = mat[i][j] >= mat[j][i] ? [i, j] : [j, i];
    const b = el('button', { type: 'button', 'data-i': ij[0], 'data-j': ij[1], text: `${p.a} e ${p.b}: ${fmtNum(p.total)} trocas (${fmtNum(p.pct_do_par, 1)}% das imagens do par)` });
    b.addEventListener('click', () => escolher(ij[0], ij[1]));
    pares.append(el('li', {}, b));
  });

  pintaCelulas();
  escolher(nomes.indexOf('gato'), nomes.indexOf('cachorro'));
}
