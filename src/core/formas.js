// Desenhos de demonstração (traços em coordenadas 0 a 1, y para baixo). Servem para o botão "desenhar sozinho"
// e para os testes automáticos do navegador.
const arco = (cx, cy, rx, ry, a0, a1, n = 36) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const elipse = (cx, cy, rx, ry, n = 36) => arco(cx, cy, rx, ry, 0, 360, n);
const poli = (...p) => p;

export const FORMAS = {
  circle: { nome: 'círculo', tracos: [elipse(0.5, 0.5, 0.45, 0.45, 40)] },
  sun: { nome: 'sol', tracos: [elipse(0.5, 0.5, 0.22, 0.22, 30), ...Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4; return poli([0.5 + 0.32 * Math.cos(a), 0.5 + 0.32 * Math.sin(a)], [0.5 + 0.48 * Math.cos(a), 0.5 + 0.48 * Math.sin(a)]);
  })] },
  star: { nome: 'estrela', tracos: [Array.from({ length: 6 }, (_, i) => {
    const a = (-90 + ((i * 2) % 5) * 72 + (i === 5 ? 0 : 0)) * (Math.PI / 180);
    return [0.5 + 0.5 * Math.cos(a), 0.55 + 0.5 * Math.sin(a)];
  })] },
  house: { nome: 'casa', tracos: [poli([0.1, 0.5], [0.5, 0.1], [0.9, 0.5], [0.1, 0.5]), poli([0.18, 0.5], [0.18, 0.92], [0.82, 0.92], [0.82, 0.5]), poli([0.42, 0.92], [0.42, 0.65], [0.58, 0.65], [0.58, 0.92])] },
  flower: { nome: 'flor', tracos: [elipse(0.5, 0.3, 0.08, 0.08, 12), ...Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3; return elipse(0.5 + 0.2 * Math.cos(a), 0.3 + 0.2 * Math.sin(a), 0.1, 0.1, 14);
  }), poli([0.5, 0.52], [0.5, 0.97])] },
  tree: { nome: 'árvore', tracos: [[...arco(0.5, 0.33, 0.4, 0.3, 160, 380, 36), [0.9, 0.36]].concat(arco(0.5, 0.36, 0.4, 0.2, 0, 180, 24)), poli([0.43, 0.54], [0.43, 0.97]), poli([0.57, 0.54], [0.57, 0.97])] },
  apple: { nome: 'maçã', tracos: [elipse(0.5, 0.58, 0.4, 0.38, 36), poli([0.5, 0.22], [0.52, 0.06]), poli([0.55, 0.12], [0.75, 0.04], [0.7, 0.2], [0.55, 0.12])] },
  umbrella: { nome: 'guarda-chuva', tracos: [[...arco(0.5, 0.5, 0.48, 0.45, 180, 360, 24), [0.98, 0.5]], poli([0.02, 0.5], [0.2, 0.42], [0.35, 0.5], [0.5, 0.42], [0.65, 0.5], [0.8, 0.42], [0.98, 0.5]), [...poli([0.5, 0.45], [0.5, 0.9]), ...arco(0.42, 0.9, 0.08, 0.07, 0, 180, 10)]] },
  fish: { nome: 'peixe', tracos: [[...elipse(0.4, 0.5, 0.36, 0.26, 36)], poli([0.74, 0.5], [0.97, 0.28], [0.97, 0.72], [0.74, 0.5]), elipse(0.24, 0.43, 0.025, 0.025, 6)] },
  clock: { nome: 'relógio', tracos: [elipse(0.5, 0.5, 0.46, 0.46, 40), poli([0.5, 0.5], [0.5, 0.2]), poli([0.5, 0.5], [0.72, 0.58])] },
  bicycle: { nome: 'bicicleta', tracos: [elipse(0.2, 0.7, 0.18, 0.18, 24), elipse(0.8, 0.7, 0.18, 0.18, 24), poli([0.2, 0.7], [0.4, 0.35], [0.7, 0.35], [0.8, 0.7]), poli([0.4, 0.35], [0.5, 0.7], [0.2, 0.7]), poli([0.38, 0.28], [0.48, 0.28]), poli([0.7, 0.35], [0.66, 0.2], [0.76, 0.2])] },
  car: { nome: 'carro', tracos: [poli([0.03, 0.62], [0.03, 0.45], [0.22, 0.42], [0.32, 0.22], [0.68, 0.22], [0.8, 0.42], [0.97, 0.47], [0.97, 0.62], [0.03, 0.62]), elipse(0.25, 0.65, 0.1, 0.1, 16), elipse(0.75, 0.65, 0.1, 0.1, 16)] },
};
