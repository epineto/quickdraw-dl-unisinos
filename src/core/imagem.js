// Utilitários de imagens 28x28: decodificação do formato compacto (4 bits por pixel) e transformações.
export const N = 28;

/** base64 de 392 bytes (2 pixels por byte; nível 0 a 15; valor = nível*17) -> Uint8Array(784). */
export function decodificar4bits(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('latin1');
  const out = new Uint8Array(784);
  for (let i = 0; i < 392; i++) {
    const b = bin.charCodeAt(i);
    out[2 * i] = (b >> 4) * 17;
    out[2 * i + 1] = (b & 15) * 17;
  }
  return out;
}

/** Rotação (graus), escala, deslocamento (px) com interpolação bilinear; mesma convenção do treino (centro 13,5). */
export function afim(img, { angulo = 0, escala = 1, dx = 0, dy = 0 } = {}) {
  const out = new Uint8Array(784), a = (angulo * Math.PI) / 180, c = Math.cos(a) / escala, s = Math.sin(a) / escala, cx = 13.5;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x - cx - dx, v = y - cx - dy;
      const sx = c * u - s * v + cx, sy = s * u + c * v + cx;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const g = (xx, yy) => (xx < 0 || yy < 0 || xx >= N || yy >= N ? 0 : img[yy * N + xx]);
      out[y * N + x] = Math.round(g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy);
    }
  }
  return out;
}

/** Engrossa o traço (dilatação 3x3 repetida `nivel` vezes). */
export function engrossar(img, nivel) {
  let cur = img;
  for (let r = 0; r < nivel; r++) {
    const out = new Uint8Array(784);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let m = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const yy = y + j, xx = x + i;
        if (yy >= 0 && xx >= 0 && yy < N && xx < N && cur[yy * N + xx] > m) m = cur[yy * N + xx];
      }
      out[y * N + x] = m;
    }
    cur = out;
  }
  return cur;
}

/** Desenha 784 valores (0 a 255) num canvas 28x28, em tons de cinza (traço claro sobre fundo escuro) ou invertido. */
export function pintar(canvas, pixels, { invertido = false } = {}) {
  canvas.width = N; canvas.height = N;
  const ctx = canvas.getContext('2d'), im = ctx.createImageData(N, N);
  for (let i = 0; i < 784; i++) {
    const v = invertido ? 255 - pixels[i] : pixels[i];
    im.data[4 * i] = v; im.data[4 * i + 1] = v; im.data[4 * i + 2] = v; im.data[4 * i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}
