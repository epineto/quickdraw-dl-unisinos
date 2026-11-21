// "O que a rede olhou?": apaga pequenos quadrados do desenho, um de cada vez, e mede o quanto a pontuação
// (logit) da categoria escolhida cai. Usa-se o logit, e não a probabilidade, porque a probabilidade satura em 100%.
// Cada pixel recebe a média das quedas dos quadrados que o cobrem.
import { prever } from './cnn.js';

const cede = () => new Promise((r) => setTimeout(r, 0));

/**
 * Devolve { mapa: Float32Array(784), max, base }. Assíncrona: cede o controle ao navegador a cada linha de quadrados,
 * para a página não travar. `cancelado()` (opcional) interrompe o cálculo e devolve null.
 */
export async function mapaOclusao(modelo, pixels, classe, { tam = 4, passo = 3, cancelado = () => false } = {}) {
  const base = prever(modelo, pixels).logits[classe];
  const soma = new Float32Array(784), cont = new Float32Array(784), tmp = Float32Array.from(pixels);
  const pos = [];
  for (let p = 0; p + tam < 28; p += passo) pos.push(p);
  pos.push(28 - tam);
  for (const y of pos) {
    for (const x of pos) {
      let tinha = false;
      for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) { const k = (y + j) * 28 + x + i; if (tmp[k] > 0) tinha = true; tmp[k] = 0; }
      const queda = tinha ? Math.max(0, base - prever(modelo, tmp).logits[classe]) : 0;
      for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) { const k = (y + j) * 28 + x + i; tmp[k] = pixels[k]; soma[k] += queda; cont[k] += 1; }
    }
    await cede();
    if (cancelado()) return null;
  }
  const mapa = new Float32Array(784);
  let max = 0;
  for (let k = 0; k < 784; k++) { mapa[k] = cont[k] ? soma[k] / cont[k] : 0; if (mapa[k] > max) max = mapa[k]; }
  return { mapa, max, base };
}
