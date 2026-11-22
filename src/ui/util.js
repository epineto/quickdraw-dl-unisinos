// Utilidades compartilhadas pela interface.
import { getLang } from './i18n.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/** Estado global simples: modelo, dados e o último desenho do jogo. `bus` avisa quem quiser ouvir. */
export const app = { modelo: null, dados: {}, pixels: null, tracos: null, bus: new EventTarget() };

export const fmtNum = (x, d = 0) => Number(x).toLocaleString(getLang() === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (x, d = 1) => fmtNum(x * 100, d) + '%';
export const reduzMovimento = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function guardar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento: segue sem salvar */ } }
export function ler(chave, padrao) { try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } }

export function debounce(fn, ms) { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/** Executa fn(visivel) quando o elemento entra ou sai da tela (para pausar animações). */
export function aoVisivel(el, fn) {
  if (!('IntersectionObserver' in window)) { fn(true); return; }
  new IntersectionObserver((es) => fn(es[es.length - 1].isIntersecting), { threshold: 0.15 }).observe(el);
}

/** Cria elemento com atributos e filhos. */
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v); }
  for (const f of filhos) e.append(f);
  return e;
}

/** Parte dos traços correspondente a `p` (0 a 1) do comprimento em segmentos. Usado nas animações de desenho. */
export function parcial(tracos, p) {
  const total = tracos.reduce((s, t) => s + Math.max(1, t.length - 1), 0);
  let resta = Math.round(p * total);
  const out = [];
  for (const t of tracos) {
    if (resta <= 0) break;
    const n = Math.max(1, t.length - 1), usa = Math.min(n, resta);
    out.push(t.length === 1 ? t : t.slice(0, usa + 1));
    resta -= usa;
  }
  return out;
}

/** Escala traços de 0..1 para um quadro de lado `lado`, com margem. */
export function escalar(tracos, lado, margem = 0.1) {
  const k = lado * (1 - 2 * margem), o = lado * margem;
  return tracos.map((t) => t.map(([x, y]) => [x * k + o, y * k + o]));
}

/** Pinta traços num contexto 2D. */
export function pintarTracos(ctx, tracos, { cor = '#1D2369', largura = 10 } = {}) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = largura;
  for (const t of tracos) {
    if (t.length === 1) { ctx.beginPath(); ctx.arc(t[0][0], t[0][1], largura / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath(); ctx.moveTo(t[0][0], t[0][1]);
    for (let i = 1; i < t.length; i++) ctx.lineTo(t[i][0], t[i][1]);
    ctx.stroke();
  }
}

/** Ampliação nítida (sem suavizar) de uma imagem 28x28 já pintada em `origem` para `destino`. */
export function ampliar(destino, origem) {
  const ctx = destino.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, destino.width, destino.height);
  ctx.drawImage(origem, 0, 0, destino.width, destino.height);
}

/** Rampa de cores branco -> azul-marinho para mapas de ativação (t em 0..1). */
export function rampa(t) {
  t = Math.max(0, Math.min(1, t));
  return [Math.round(255 - t * (255 - 29)), Math.round(255 - t * (255 - 35)), Math.round(255 - t * (255 - 105))];
}

/** Pinta um mapa h x w (valores >= 0) normalizado pelo próprio máximo. */
export function pintarMapa(canvas, valores, h, w) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), im = ctx.createImageData(w, h);
  let max = 0;
  for (let i = 0; i < h * w; i++) if (valores[i] > max) max = valores[i];
  for (let i = 0; i < h * w; i++) {
    const [r, g, b] = rampa(max > 1e-9 ? valores[i] / max : 0);
    im.data[4 * i] = r; im.data[4 * i + 1] = g; im.data[4 * i + 2] = b; im.data[4 * i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}
