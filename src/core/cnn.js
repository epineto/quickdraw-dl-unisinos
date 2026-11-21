// Inferência da CNN do Quick, Draw! em JavaScript puro (sem dependências).
// Ordem: conv1 -> ReLU -> pool2 -> conv2 -> ReLU -> pool2 -> conv3 -> ReLU -> pool2 -> flatten
//        -> fc1 -> ReLU -> fc2 (logits) -> softmax. Pesos no formato PyTorch (ver data/cnn_quickdraw.json).

/** Converte o JSON de pesos em Float32Array por camada. */
export function criarModelo(json) {
  if (json.formato !== 'quickdraw-cnn-v1') throw new Error('Formato de modelo desconhecido: ' + json.formato);
  return {
    classes: json.classes,
    nomes: json.nomes_pt,
    camadas: json.camadas.map((c) => ({ ...c, w: Float32Array.from(c.pesos), b: Float32Array.from(c.vies) })),
  };
}

/**
 * Convolução 3x3 com padding 1, seguida de ReLU. entrada: [cin][h][w] achatado. Devolve [cout][h][w].
 * Truque de velocidade: a entrada é copiada para um plano com borda de zeros (largura w+2) e cada um dos 9 deslocamentos
 * vira uma soma deslizante contígua; as colunas extras do resultado são descartadas no final.
 */
export function conv3x3Relu(x, cin, h, w, W, B, cout) {
  const hp = h + 2, wp = w + 2, plano = hp * wp + 2, n = h * wp;
  const pad = new Float64Array(cin * plano);
  for (let c = 0; c < cin; c++) for (let y = 0; y < h; y++) pad.set(x.subarray(c * h * w + y * w, c * h * w + (y + 1) * w), c * plano + (y + 1) * wp + 1);
  const out = new Float32Array(cout * h * w), acc = new Float64Array(n);
  for (let o = 0; o < cout; o++) {
    acc.fill(B[o]);
    for (let c = 0; c < cin; c++) {
      const wb = (o * cin + c) * 9, pb = c * plano;
      for (let ky = 0; ky < 3; ky++) {
        const k0 = W[wb + ky * 3], k1 = W[wb + ky * 3 + 1], k2 = W[wb + ky * 3 + 2], off = pb + ky * wp;
        for (let i = 0; i < n; i++) acc[i] += k0 * pad[off + i] + k1 * pad[off + i + 1] + k2 * pad[off + i + 2];
      }
    }
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const v = acc[y * wp + xx]; out[(o * h + y) * w + xx] = v > 0 ? v : 0; }
  }
  return out;
}

/** Max pooling 2x2 (passo 2, divisão inteira como no PyTorch). Devolve [c][h/2][w/2]. */
export function maxPool2(x, c, h, w) {
  const ho = h >> 1, wo = w >> 1, out = new Float32Array(c * ho * wo);
  for (let k = 0; k < c; k++) {
    for (let y = 0; y < ho; y++) {
      for (let xx = 0; xx < wo; xx++) {
        const i = k * h * w + 2 * y * w + 2 * xx;
        out[(k * ho + y) * wo + xx] = Math.max(x[i], x[i + 1], x[i + w], x[i + w + 1]);
      }
    }
  }
  return out;
}

/** Camada densa: pesos [saida][entrada]. */
export function densa(x, W, B, nin, nout, relu) {
  const out = new Float32Array(nout);
  for (let o = 0; o < nout; o++) {
    let s = B[o];
    const base = o * nin;
    for (let i = 0; i < nin; i++) s += W[base + i] * x[i];
    out[o] = relu && s < 0 ? 0 : s;
  }
  return out;
}

export function softmax(logits, temperatura = 1) {
  let m = -Infinity;
  for (const v of logits) if (v > m) m = v;
  const e = Array.from(logits, (v) => Math.exp((v - m) / temperatura));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / z);
}

/**
 * Roda a rede. pixels: 784 valores (0 a 255 ou 0 a 1 se escala1=true), linha a linha.
 * Devolve { logits, probs, ativ } onde ativ guarda as camadas intermediárias (para visualizar).
 */
export function prever(modelo, pixels, { escala1 = false } = {}) {
  const [c1, c2, c3, f1, f2] = modelo.camadas;
  const x = new Float32Array(784);
  for (let i = 0; i < 784; i++) x[i] = escala1 ? pixels[i] : pixels[i] / 255;
  const a1 = conv3x3Relu(x, 1, 28, 28, c1.w, c1.b, c1.saida);
  const p1 = maxPool2(a1, c1.saida, 28, 28);
  const a2 = conv3x3Relu(p1, c1.saida, 14, 14, c2.w, c2.b, c2.saida);
  const p2 = maxPool2(a2, c2.saida, 14, 14);
  const a3 = conv3x3Relu(p2, c2.saida, 7, 7, c3.w, c3.b, c3.saida);
  const p3 = maxPool2(a3, c3.saida, 7, 7);
  const h = densa(p3, f1.w, f1.b, f1.entrada, f1.saida, true);
  const logits = densa(h, f2.w, f2.b, f2.entrada, f2.saida, false);
  return { logits, probs: softmax(logits), ativ: { entrada: x, conv1: a1, pool1: p1, conv2: a2, pool2: p2, conv3: a3, pool3: p3, oculta: h } };
}

/** Índices das k maiores probabilidades, em ordem decrescente. */
export function topK(probs, k = 5) {
  return Array.from(probs, (p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map(([p, i]) => ({ classe: i, p }));
}
