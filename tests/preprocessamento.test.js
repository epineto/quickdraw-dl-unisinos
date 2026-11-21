import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rasterizar, normalizar, caixa, simplificar, LADO } from '../src/core/rasterizar.js';
import { afim, engrossar } from '../src/core/imagem.js';
import { criarModelo, prever, topK } from '../src/core/cnn.js';
import { mapaOclusao } from '../src/core/oclusao.js';
import { FORMAS } from '../src/core/formas.js';

const modelo = criarModelo(JSON.parse(fs.readFileSync(new URL('../data/cnn_quickdraw.json', import.meta.url))));
const escala = (tr, k, ox = 0, oy = 0) => tr.map((t) => t.map(([x, y]) => [x * k + ox, y * k + oy]));
const lim = (img) => { let x0 = 99, x1 = -1, y0 = 99, y1 = -1; img.forEach((v, i) => { if (v > 30) { const x = i % 28, y = (i / 28) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }); return { x0, x1, y0, y1 }; };

test('imagem 28x28, valores 0 a 255, lado maior ocupa cerca de 26 px e fica centrado', () => {
  const img = rasterizar(escala(FORMAS.house.tracos, 400, 50, 70));
  assert.equal(img.length, LADO * LADO);
  const b = lim(img), w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  assert.ok(Math.max(w, h) >= 25 && Math.max(w, h) <= 27, `lado ${Math.max(w, h)}`);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 13.5) <= 1 && Math.abs((b.y0 + b.y1) / 2 - 13.5) <= 1);
  assert.ok(Math.max(...img) === 255);
});

test('invariância a posição e tamanho do desenho no canvas', () => {
  const a = rasterizar(escala(FORMAS.star.tracos, 100, 10, 10));
  const b = rasterizar(escala(FORMAS.star.tracos, 380, 500, 40));
  let dif = 0; for (let i = 0; i < 784; i++) dif += Math.abs(a[i] - b[i]);
  assert.ok(dif / 784 < 1, `diferença média ${dif / 784}`);
});

test('proporção preservada: linha horizontal fica fina e centrada', () => {
  const img = rasterizar([[[0, 50], [200, 50]]]);
  const b = lim(img);
  assert.ok(b.y1 - b.y0 <= 2 && b.x1 - b.x0 >= 24);
});

test('ponto isolado e entrada vazia não quebram', () => {
  assert.equal(rasterizar([]).every((v) => v === 0), true);
  assert.ok(rasterizar([[[5, 5]]]).some((v) => v > 0));
  assert.equal(caixa([]), null);
  assert.deepEqual(normalizar([]), []);
});

test('simplificar remove pontos repetidos', () => {
  assert.equal(simplificar([[0, 0], [0.1, 0], [0.2, 0], [5, 0], [5.1, 0]]).length, 3);
});

test('desenhos de demonstração são reconhecidos (traço vetorial -> 28x28 -> CNN)', () => {
  const esperado = { circle: 'círculo', sun: 'sol', star: 'estrela', house: 'casa', flower: 'flor', tree: 'árvore', apple: 'maçã', umbrella: 'guarda-chuva', fish: 'peixe', clock: 'relógio', bicycle: 'bicicleta', car: 'carro' };
  for (const [k, nome] of Object.entries(esperado)) {
    const { probs } = prever(modelo, rasterizar(escala(FORMAS[k].tracos, 300)));
    assert.equal(modelo.nomes[topK(probs, 1)[0].classe], nome, k);
  }
});

test('afim: identidade preserva a imagem e deslocamento move', () => {
  const img = rasterizar(escala(FORMAS.circle.tracos, 300));
  assert.deepEqual(Array.from(afim(img)), Array.from(img));
  const pequena = afim(img, { escala: 0.5 }), d = afim(pequena, { dx: 3 }), a = lim(pequena), b = lim(d);
  assert.ok(b.x0 - a.x0 === 3 && b.x1 - a.x1 === 3);
});

test('engrossar aumenta a tinta', () => {
  const img = rasterizar(escala(FORMAS.circle.tracos, 300));
  const soma = (v) => v.reduce((s, x) => s + x, 0);
  assert.ok(soma(engrossar(img, 1)) > 1.5 * soma(img));
});

test('oclusão: o mapa é não negativo e a queda máxima fica sobre o traço', async () => {
  const img = rasterizar(escala(FORMAS.house.tracos, 300));
  const classe = topK(prever(modelo, img).probs, 1)[0].classe;
  const { mapa, max } = await mapaOclusao(modelo, img, classe);
  assert.ok(mapa.every((v) => v >= 0) && max > 0.5);
  let sobre = 0, fora = 0, ns = 0, nf = 0;
  mapa.forEach((v, i) => { if (img[i] > 0) { sobre += v; ns++; } else { fora += v; nf++; } });
  console.log('  oclusão sobre o traço', (sobre / ns).toFixed(2), 'fora', (fora / nf).toFixed(2));
  assert.ok(sobre / ns > 1.5 * (fora / nf));
});
