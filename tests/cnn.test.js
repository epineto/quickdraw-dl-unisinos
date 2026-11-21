// Compara a inferência em JavaScript com as saídas do PyTorch (amostras_teste.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarModelo, prever, softmax, topK, maxPool2, conv3x3Relu } from '../src/core/cnn.js';
import { decodificar4bits } from '../src/core/imagem.js';

const ler = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const modelo = criarModelo(ler('../data/cnn_quickdraw.json'));
const amostras = ler('./amostras_teste.json');

const TOL_LOGITS = 1e-4; // pesos exportados com 7 algarismos significativos (tools/reexportar_pesos.py)

test('modelo: 18 classes e 80.434 parâmetros', () => {
  assert.equal(modelo.classes.length, 18);
  const n = modelo.camadas.reduce((s, c) => s + c.w.length + c.b.length, 0);
  assert.equal(n, 80434);
});

test(`logits iguais ao PyTorch (tolerância ${TOL_LOGITS}) nas ${amostras.amostras.length} amostras`, () => {
  let pior = 0;
  for (const a of amostras.amostras) {
    const { logits } = prever(modelo, a.pixels);
    for (let i = 0; i < 18; i++) pior = Math.max(pior, Math.abs(logits[i] - a.logits[i]));
  }
  assert.ok(pior <= TOL_LOGITS, `erro máximo ${pior}`);
  console.log(`  erro máximo nos logits: ${pior.toExponential(2)}`);
});

test('probabilidades (softmax) a 1e-3 do PyTorch e mesmo palpite', () => {
  for (const a of amostras.amostras) {
    const { probs } = prever(modelo, a.pixels);
    const ref = softmax(a.logits);
    for (let i = 0; i < 18; i++) assert.ok(Math.abs(probs[i] - ref[i]) < 1e-3);
    assert.equal(topK(probs, 1)[0].classe, a.previsto);
  }
});

test('softmax soma 1 e é estável com logits grandes', () => {
  const p = softmax([1000, 999, -1000]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.ok(p[0] > p[1] && p[2] < 1e-300 + 1e-12);
});

test('pooling 2x2 e convolução em casos pequenos conhecidos', () => {
  const x = Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(Array.from(maxPool2(x, 1, 4, 4)), [6, 8, 14, 16]);
  const W = new Float32Array(9); W[4] = 1; // filtro identidade
  assert.deepEqual(Array.from(conv3x3Relu(x, 1, 4, 4, W, Float32Array.of(0), 1)), Array.from(x));
  W.fill(0); W[4] = -1; // ReLU zera negativos
  assert.ok(conv3x3Relu(x, 1, 4, 4, W, Float32Array.of(0), 1).every((v) => v === 0));
});

test('decodificação 4 bits: 392 bytes -> 784 pixels', () => {
  const b = Buffer.alloc(392); b[0] = 0xf1; b[391] = 0x0a;
  const img = decodificar4bits(b.toString('base64'));
  assert.equal(img.length, 784);
  assert.deepEqual([img[0], img[1], img[782], img[783]], [255, 17, 0, 170]);
});
