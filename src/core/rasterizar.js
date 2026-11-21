// Pré-processamento do desenho: converte os traços (listas de pontos) em uma imagem 28x28 no estilo do Quick, Draw!
//   1. calcula a caixa que envolve todos os traços;
//   2. escala o desenho (mantendo a proporção) para que o lado maior ocupe 26 pixels, contando a espessura do traço;
//   3. centraliza a caixa na imagem 28x28;
//   4. desenha cada segmento com espessura fixa (LARGURA) e suavização (supersampling 4x4);
//   5. valores 0 a 255: traço claro sobre fundo preto. A rede divide por 255.
// Os dados de treino têm exatamente esse formato (lado maior de 26 px, centrado, traço de 1 a 2 px).
export const LADO = 28, ALVO = 26, LARGURA = 1.7, SS = 4;

/** Caixa envolvente de todos os pontos: { x0, y0, x1, y1 } ou null. */
export function caixa(tracos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const t of tracos) for (const [x, y] of t) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return n ? { x0, y0, x1, y1 } : null;
}

/** Tamanho (maior lado) do desenho nas unidades de entrada. */
export function tamanho(tracos) {
  const c = caixa(tracos);
  return c ? Math.max(c.x1 - c.x0, c.y1 - c.y0) : 0;
}

/** Transforma os pontos para o sistema 28x28 (coordenadas contínuas, centro do pixel i em i+0,5). */
export function normalizar(tracos, largura = LARGURA) {
  const c = caixa(tracos);
  if (!c) return [];
  const w = c.x1 - c.x0, h = c.y1 - c.y0, maior = Math.max(w, h);
  const s = maior > 1e-9 ? (ALVO - largura) / maior : 1;
  const ox = LADO / 2 - ((c.x0 + c.x1) / 2) * s, oy = LADO / 2 - ((c.y0 + c.y1) / 2) * s;
  return tracos.map((t) => t.map(([x, y]) => [x * s + ox, y * s + oy]));
}

/** Rasteriza os traços; devolve Uint8Array(784) com valores 0 a 255. */
export function rasterizar(tracos, largura = LARGURA) {
  const M = LADO * SS, cobertura = new Uint8Array(M * M), r = (largura / 2) * SS, r2 = r * r;
  const marcar = (ax, ay, bx, by) => {
    const minx = Math.max(0, Math.floor(Math.min(ax, bx) - r)), maxx = Math.min(M - 1, Math.ceil(Math.max(ax, bx) + r));
    const miny = Math.max(0, Math.floor(Math.min(ay, by) - r)), maxy = Math.min(M - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay;
      let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ey = py - t * dy;
      if (ex * ex + ey * ey <= r2) cobertura[y * M + x] = 1;
    }
  };
  for (const t of normalizar(tracos, largura)) {
    if (t.length === 1) marcar(t[0][0] * SS, t[0][1] * SS, t[0][0] * SS, t[0][1] * SS);
    for (let i = 1; i < t.length; i++) marcar(t[i - 1][0] * SS, t[i - 1][1] * SS, t[i][0] * SS, t[i][1] * SS);
  }
  const out = new Uint8Array(LADO * LADO);
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
    let s = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += cobertura[(y * SS + j) * M + x * SS + i];
    out[y * LADO + x] = Math.round((s / (SS * SS)) * 255);
  }
  return out;
}

/** Remove pontos quase repetidos (menos de `min` unidades de distância do anterior). */
export function simplificar(pontos, min = 1.5) {
  const out = [];
  for (const p of pontos) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= min) out.push(p);
  }
  if (pontos.length && out[out.length - 1] !== pontos[pontos.length - 1] && out.length > 1) out.push(pontos[pontos.length - 1]);
  return out;
}
