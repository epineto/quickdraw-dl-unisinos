// Seção #jogo: quadro de desenho, palpite em tempo real, miniatura 28x28 e modo desafio.
import { $, $$, app, pct, fmtNum, el, parcial, escalar, pintarTracos, reduzMovimento, guardar, ler } from './util.js';
import { prever, topK } from '../core/cnn.js';
import { rasterizar, tamanho } from '../core/rasterizar.js';
import { pintar } from '../core/imagem.js';
import { FORMAS } from '../core/formas.js';

const L = 400, TAM_MIN = 14, RODADAS = 5, SEGUNDOS = 20;

export function iniciarJogo() {
  const nomes = app.modelo.nomes;
  const cv = $('#quadro'), ctx = cv.getContext('2d');
  let tracos = [], atual = null, rafId = 0, anim = 0;
  // modo desafio
  const D = { ativo: false, fase: 'espera', rodada: 0, seq: [], alvo: -1, t0: 0, timer: 0, pontos: 0, hist: [], melhor: ler('qd-melhor', 0) };

  $('#chips').append(...nomes.map((n, i) => el('li', { class: 'chip', 'data-i': i, text: n })));
  $('#sel-forma').append(...Object.entries(FORMAS).map(([k, f]) => el('option', { value: k, text: f.nome })));

  /* ---------- desenho ---------- */
  function redesenhar() {
    ctx.clearRect(0, 0, L, L);
    pintarTracos(ctx, tracos, { largura: 10 });
    $('#quadro-dica').hidden = tracos.length > 0 || D.fase === 'espera' && D.ativo;
  }
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) * L) / r.width, ((e.clientY - r.top) * L) / r.height]; };
  const podeDesenhar = () => !D.ativo || D.fase === 'jogando';

  cv.addEventListener('pointerdown', (e) => {
    if (!podeDesenhar() || (e.button !== undefined && e.button > 0)) return;
    e.preventDefault(); parar();
    try { cv.setPointerCapture(e.pointerId); } catch { /* sem captura: segue */ }
    atual = [pos(e)]; tracos.push(atual); redesenhar(); agendar();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!atual) return;
    const p = pos(e), q = atual[atual.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5) return;
    atual.push(p);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1D2369'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    agendar();
  });
  const fim = () => { if (!atual) return; atual = null; atualizar(); };
  cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim); cv.addEventListener('lostpointercapture', fim);
  cv.addEventListener('keydown', (e) => {
    if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'Backspace') { e.preventDefault(); desfazer(); }
    else if (e.key === 'Delete' || e.key === 'Escape') { e.preventDefault(); limpar(); }
  });

  function agendar() { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; atualizar(); }); }
  function parar() { if (anim) { cancelAnimationFrame(anim); anim = 0; $('#btn-sozinho').disabled = false; } }
  function desfazer() { parar(); tracos.pop(); redesenhar(); atualizar(); }
  function limpar() { parar(); tracos = []; atual = null; redesenhar(); atualizar(); }
  $('#btn-desfazer').addEventListener('click', desfazer);
  $('#btn-limpar').addEventListener('click', limpar);

  /* ---------- palpite ---------- */
  const linhas = $$('#top5 li');
  function zerarBarras() { linhas.forEach((li) => { li.children[0].innerHTML = '&nbsp;'; li.children[2].textContent = '0%'; li.querySelector('.t5-barra').style.transform = 'scaleX(0)'; }); }
  function mostrar(r, top) {
    top.forEach((o, i) => {
      const li = linhas[i];
      li.children[0].textContent = nomes[o.classe];
      li.children[2].textContent = pct(o.p, 0);
      li.querySelector('.t5-barra').style.transform = `scaleX(${o.p.toFixed(4)})`;
    });
    const t = top[0], f = $('#palpite-frase');
    f.replaceChildren();
    if (t.p >= 0.7) f.append('É ', el('strong', { text: nomes[t.classe] }), ` (${pct(t.p, 0)})`);
    else if (t.p >= 0.4) f.append('Parece ', el('strong', { text: nomes[t.classe] }), ` (${pct(t.p, 0)})`);
    else f.append('Sem certeza: talvez ', el('strong', { text: nomes[t.classe] }), ` (${pct(t.p, 0)})`);
  }

  function atualizar() {
    if (!tracos.length) {
      app.pixels = null; app.tracos = null;
      zerarBarras(); $('#palpite-frase').textContent = D.ativo && D.fase !== 'jogando' ? 'Aguardando o início da rodada.' : 'Aguardando um rabisco.';
      pintar($('#miniatura'), new Uint8Array(784));
      app.bus.dispatchEvent(new Event('desenho'));
      return;
    }
    if (tamanho(tracos) < TAM_MIN) { $('#palpite-frase').textContent = 'Desenhe um pouco mais...'; zerarBarras(); return; }
    const px = rasterizar(tracos), r = prever(app.modelo, px), top = topK(r.probs, 5);
    app.pixels = px; app.tracos = tracos.map((t) => t.slice());
    pintar($('#miniatura'), px);
    mostrar(r, top);
    app.bus.dispatchEvent(new Event('desenho'));
    if (D.ativo && D.fase === 'jogando') verificarRodada(top);
  }

  /* ---------- desenhar sozinho ---------- */
  function sozinho() {
    parar(); limpar();
    const forma = FORMAS[$('#sel-forma').value], alvo = escalar(forma.tracos, L, 0.08);
    $('#btn-sozinho').disabled = true;
    const dur = reduzMovimento() ? 1 : 1600, t0 = performance.now();
    const passo = (agora) => {
      const p = Math.min(1, (agora - t0) / dur);
      tracos = parcial(alvo, p); redesenhar(); atualizar();
      if (p < 1) anim = requestAnimationFrame(passo); else { anim = 0; $('#btn-sozinho').disabled = false; }
    };
    anim = requestAnimationFrame(passo);
  }
  $('#btn-sozinho').addEventListener('click', sozinho);

  /* ---------- modo desafio ---------- */
  const tela = $('#desafio-tela');
  function sorteio() {
    const a = nomes.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, RODADAS);
  }
  function modo(desafio) {
    D.ativo = desafio; clearInterval(D.timer);
    $('#modo-livre').setAttribute('aria-pressed', String(!desafio)); $('#modo-desafio').setAttribute('aria-pressed', String(desafio));
    $('#desafio-barra').hidden = !desafio;
    $('.botoes-livre').hidden = desafio; $('.botoes-desafio').hidden = !desafio;
    $$('.chip').forEach((c) => c.classList.remove('alvo'));
    limpar();
    if (desafio) { D.fase = 'espera'; D.pontos = 0; D.rodada = 0; $('#btn-pular').disabled = true; telaInicio(); infoBarra(); }
    else { D.fase = 'espera'; tela.hidden = true; $('#quadro-dica').hidden = false; }
  }
  $('#modo-livre').addEventListener('click', () => modo(false));
  $('#modo-desafio').addEventListener('click', () => modo(true));

  function infoBarra() {
    $('#desafio-rodada').textContent = `Rodada ${Math.min(D.rodada + (D.fase === 'espera' ? 1 : 1), RODADAS)} de ${RODADAS}`;
    $('#desafio-pontos').textContent = `${fmtNum(D.pontos)} ponto${D.pontos === 1 ? '' : 's'}`;
  }
  function telaInicio() {
    tela.hidden = false; tela.replaceChildren(
      el('h3', { text: 'Desafio rápido' }),
      el('p', { text: `${RODADAS} rodadas de ${SEGUNDOS} segundos. A rede pede uma categoria e o desenho precisa convencê-la antes de o tempo acabar. Quanto mais rápido, mais pontos (até ${100 + SEGUNDOS * 5} por rodada).` }),
      D.melhor ? el('p', { class: 'mini', text: `Melhor pontuação neste navegador: ${fmtNum(D.melhor)}.` }) : '',
      el('button', { type: 'button', class: 'botao', id: 'ov-comecar', text: 'Começar' }));
    $('#ov-comecar').addEventListener('click', comecar);
    $('#btn-comecar').textContent = 'Começar desafio';
  }
  function comecar() {
    D.seq = sorteio(); D.rodada = 0; D.pontos = 0; D.hist = []; $('#btn-comecar').textContent = 'Recomeçar';
    novaRodada();
  }
  $('#btn-comecar').addEventListener('click', comecar);
  function novaRodada() {
    clearInterval(D.timer); tracos = []; atual = null; D.fase = 'jogando'; redesenhar(); atualizar();
    D.alvo = D.seq[D.rodada]; D.t0 = performance.now(); tela.hidden = true; $('#btn-pular').disabled = false; $('#quadro-dica').hidden = false;
    $('#desafio-alvo').textContent = nomes[D.alvo];
    $$('.chip').forEach((c) => c.classList.toggle('alvo', Number(c.dataset.i) === D.alvo));
    infoBarra(); tique();
    D.timer = setInterval(tique, 100);
    cv.focus({ preventScroll: true });
  }
  function restante() { return Math.max(0, SEGUNDOS - (performance.now() - D.t0) / 1000); }
  function tique() {
    const r = restante(), barra = $('#tempo-barra');
    barra.style.transform = `scaleX(${(r / SEGUNDOS).toFixed(3)})`; barra.style.background = r < 5 ? 'var(--verm)' : 'var(--verde)';
    $('#desafio-tempo-txt').textContent = `${fmtNum(r, 1)} s`;
    if (r <= 0 && D.fase === 'jogando') encerrarRodada('tempo');
  }
  function verificarRodada(top) {
    if (top[0].classe === D.alvo && tamanho(tracos) >= 40) encerrarRodada('acerto', top);
  }
  function encerrarRodada(motivo, topAcerto) {
    if (D.fase !== 'jogando') return;
    clearInterval(D.timer); D.fase = 'resultado'; $('#btn-pular').disabled = true;
    const px = app.pixels, top = topAcerto || (px ? topK(prever(app.modelo, px).probs, 3) : []), usado = SEGUNDOS - restante();
    let pts = 0, msg = '';
    if (motivo === 'acerto') { pts = 100 + Math.round(restante() * 5); msg = `A rede adivinhou: ${nomes[D.alvo]}!`; }
    else if (motivo === 'pular') { msg = 'Rodada pulada.'; }
    else if (top.slice(0, 3).some((o) => o.classe === D.alvo)) { pts = 30; msg = `Tempo esgotado, mas ${nomes[D.alvo]} apareceu entre os 3 palpites.`; }
    else { msg = top.length ? `Tempo esgotado. A rede achou que era ${nomes[top[0].classe]}.` : 'Tempo esgotado sem desenho.'; }
    D.pontos += pts; D.hist.push({ alvo: D.alvo, motivo, pts, seg: usado, palpite: top[0] ? top[0].classe : -1 });
    infoBarra();
    const idx = D.rodada, ultima = idx + 1 >= RODADAS;
    tela.hidden = false;
    tela.replaceChildren(
      el('h3', { text: msg }), el('p', { text: pts ? `+${pts} pontos` : 'Sem pontos nesta rodada.' }),
      el('button', { type: 'button', class: 'botao', id: 'ov-prox', text: ultima ? 'Ver resultado final' : 'Próxima rodada' }));
    const aberto = performance.now(); // evita que um clique do traço ainda em andamento pule o resultado sem ser lido
    const btn = $('#ov-prox');
    btn.addEventListener('click', (ev) => { if (ev.detail > 0 && performance.now() - aberto < 700) return; if (D.fase !== 'resultado') return; D.rodada = idx + 1; if (ultima) telaFinal(); else novaRodada(); });
    $('#ov-prox').focus();
  }
  $('#btn-pular').addEventListener('click', () => encerrarRodada('pular'));

  function telaFinal() {
    D.fase = 'fim';
    const novo = D.pontos > D.melhor; if (novo) { D.melhor = D.pontos; guardar('qd-melhor', D.melhor); }
    const tab = el('table', {}, el('tr', {}, ...['Categoria', 'Resultado', 'Pontos'].map((t) => el('th', { text: t }))),
      ...D.hist.map((h) => el('tr', {}, el('td', { text: nomes[h.alvo] }), el('td', { text: h.motivo === 'acerto' ? `acertou em ${fmtNum(h.seg, 1)} s` : h.motivo === 'pular' ? 'pulada' : h.pts ? 'quase (top 3)' : 'não acertou' }), el('td', { text: String(h.pts) }))));
    tela.replaceChildren(el('h3', { text: `Total: ${fmtNum(D.pontos)} de ${RODADAS * (100 + SEGUNDOS * 5)} pontos` }),
      el('p', { class: 'mini', text: novo ? 'Nova melhor pontuação neste navegador!' : `Melhor pontuação neste navegador: ${fmtNum(D.melhor)}.` }), tab,
      el('button', { type: 'button', class: 'botao', id: 'ov-de-novo', text: 'Jogar de novo' }));
    $('#ov-de-novo').addEventListener('click', comecar); $('#ov-de-novo').focus();
    $$('.chip').forEach((c) => c.classList.remove('alvo'));
    $('#desafio-alvo').textContent = '...'; $('#btn-comecar').textContent = 'Começar desafio';
  }

  redesenhar(); atualizar();
  // expõe um gancho para testes automatizados e para depuração
  window.__jogo = { estado: D, tracos: () => tracos };
}
