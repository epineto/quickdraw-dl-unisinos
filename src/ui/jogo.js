// Seção #jogo: quadro de desenho, palpite em tempo real, miniatura 28x28 e modo desafio.
import { $, $$, app, pct, fmtNum, el, parcial, escalar, pintarTracos, reduzMovimento, guardar, ler } from './util.js';
import { prever, topK } from '../core/cnn.js';
import { rasterizar, tamanho } from '../core/rasterizar.js';
import { pintar } from '../core/imagem.js';
import { FORMAS } from '../core/formas.js';
import { t, onLang, catNome } from './i18n.js';

const L = 400, TAM_MIN = 14, RODADAS = 5, SEGUNDOS = 20;

export function iniciarJogo() {
  const nomes = app.modelo.nomes; // nomes em português (ids internos); a exibição passa por N()
  const N = (i) => catNome(nomes[i]);
  const cv = $('#quadro'), ctx = cv.getContext('2d');
  let tracos = [], atual = null, rafId = 0, anim = 0;
  // modo desafio
  const D = { ativo: false, fase: 'espera', rodada: 0, seq: [], alvo: -1, t0: 0, timer: 0, pontos: 0, hist: [], melhor: ler('qd-melhor', 0), recomecar: false, alvoVisivel: false, rUlt: null, res: null, novoRecorde: false, abertoEm: 0 };

  $('#chips').append(...nomes.map((n, i) => el('li', { class: 'chip', 'data-i': i, text: N(i) })));
  $('#sel-forma').append(...Object.entries(FORMAS).map(([k, f]) => el('option', { value: k, text: catNome(f.nome) })));

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
  function zerarBarras() { ultimoTop = null; linhas.forEach((li) => { li.children[0].innerHTML = '&nbsp;'; li.children[2].textContent = '0%'; li.querySelector('.t5-barra').style.transform = 'scaleX(0)'; }); }
  // O texto da frase de palpite é guardado como função, para ser reescrito ao trocar de idioma (sem mexer no desenho).
  let frase = () => t('jogo.frase.aguardando'), ultimoTop = null;
  function escreverFrase() {
    const r = frase(); $('#palpite-frase').replaceChildren(...(Array.isArray(r) ? r : [r]));
  }
  function setFrase(fn) { frase = fn; escreverFrase(); }
  function mostrar(r, top) {
    ultimoTop = top;
    top.forEach((o, i) => {
      const li = linhas[i];
      li.children[0].textContent = N(o.classe);
      li.children[2].textContent = pct(o.p, 0);
      li.querySelector('.t5-barra').style.transform = `scaleX(${o.p.toFixed(4)})`;
    });
    const p = top[0], k = p.p >= 0.7 ? 'jogo.frase.e' : p.p >= 0.4 ? 'jogo.frase.parece' : 'jogo.frase.talvez';
    setFrase(() => { // a categoria vai em negrito: o marcador {nome} é trocado por um caractere de controle e o texto é dividido ali
      const [a, b] = t(k, { nome: '\u0001', p: pct(p.p, 0) }).split('\u0001');
      return [a, el('strong', { text: N(p.classe) }), b];
    });
  }

  function atualizar() {
    if (!tracos.length) {
      app.pixels = null; app.tracos = null;
      zerarBarras(); setFrase(() => t(D.ativo && D.fase !== 'jogando' ? 'jogo.frase.aguardando_rodada' : 'jogo.frase.aguardando'));
      pintar($('#miniatura'), new Uint8Array(784));
      app.bus.dispatchEvent(new Event('desenho'));
      return;
    }
    if (tamanho(tracos) < TAM_MIN) { setFrase(() => t('jogo.frase.mais')); zerarBarras(); return; }
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
    $('#desafio-rodada').textContent = t('jogo.rodada', { n: Math.min(D.rodada + 1, RODADAS), total: RODADAS });
    $('#desafio-pontos').textContent = t(D.pontos === 1 ? 'jogo.ponto' : 'jogo.pontos', { n: fmtNum(D.pontos) });
  }
  const rotuloComecar = () => { $('#btn-comecar').textContent = t(D.recomecar ? 'jogo.recomecar' : 'jogo.comecar_desafio'); };
  function mostrarAlvo() { const a = $('#desafio-alvo'); a.textContent = D.alvoVisivel ? N(D.alvo) : '...'; }

  /* A tela sobre o quadro (início, resultado da rodada, final) é redesenhada a partir do estado em D; assim a troca de idioma
     não reinicia nada. `foco` só vale na primeira exibição (para não tirar o foco do botão de idioma). */
  function renderTela(foco) {
    if (D.fase === 'espera') {
      tela.hidden = false; tela.replaceChildren(
        el('h3', { text: t('jogo.tela.t') }),
        el('p', { text: t('jogo.tela.regras', { rodadas: RODADAS, seg: SEGUNDOS, max: 100 + SEGUNDOS * 5 }) }),
        D.melhor ? el('p', { class: 'mini', text: t('jogo.melhor', { n: fmtNum(D.melhor) }) }) : '',
        el('button', { type: 'button', class: 'botao', id: 'ov-comecar', text: t('jogo.comecar') }));
      $('#ov-comecar').addEventListener('click', comecar);
    } else if (D.fase === 'resultado') {
      const R = D.res;
      tela.hidden = false;
      tela.replaceChildren(
        el('h3', { text: t(R.k, { nome: R.c >= 0 ? N(R.c) : '' }) }), el('p', { text: R.pts ? t('jogo.res.mais', { n: R.pts }) : t('jogo.res.zero') }),
        el('button', { type: 'button', class: 'botao', id: 'ov-prox', text: t(R.ultima ? 'jogo.res.ver_final' : 'jogo.res.proxima') }));
      const btn = $('#ov-prox');
      btn.addEventListener('click', (ev) => { if (ev.detail > 0 && performance.now() - D.abertoEm < 700) return; if (D.fase !== 'resultado') return; D.rodada = R.idx + 1; if (R.ultima) telaFinal(); else novaRodada(); });
      if (foco) btn.focus();
    } else if (D.fase === 'fim') {
      const tab = el('table', {}, el('tr', {}, ...['jogo.fim.cat', 'jogo.fim.res', 'jogo.fim.pts'].map((k) => el('th', { text: t(k) }))),
        ...D.hist.map((h) => el('tr', {}, el('td', { text: N(h.alvo) }), el('td', { text: h.motivo === 'acerto' ? t('jogo.fim.acertou', { n: fmtNum(h.seg, 1) }) : h.motivo === 'pular' ? t('jogo.fim.pulada') : h.pts ? t('jogo.fim.quase') : t('jogo.fim.errou') }), el('td', { text: String(h.pts) }))));
      tela.replaceChildren(el('h3', { text: t('jogo.fim.total', { n: fmtNum(D.pontos), max: RODADAS * (100 + SEGUNDOS * 5) }) }),
        el('p', { class: 'mini', text: D.novoRecorde ? t('jogo.fim.novo') : t('jogo.melhor', { n: fmtNum(D.melhor) }) }), tab,
        el('button', { type: 'button', class: 'botao', id: 'ov-de-novo', text: t('jogo.fim.denovo') }));
      $('#ov-de-novo').addEventListener('click', comecar);
      if (foco) $('#ov-de-novo').focus();
    }
  }
  function telaInicio() { D.recomecar = false; renderTela(false); rotuloComecar(); }
  function comecar() {
    D.seq = sorteio(); D.rodada = 0; D.pontos = 0; D.hist = []; D.recomecar = true; rotuloComecar();
    novaRodada();
  }
  $('#btn-comecar').addEventListener('click', comecar);
  function novaRodada() {
    clearInterval(D.timer); tracos = []; atual = null; D.fase = 'jogando'; redesenhar(); atualizar();
    D.alvo = D.seq[D.rodada]; D.alvoVisivel = true; D.t0 = performance.now(); tela.hidden = true; $('#btn-pular').disabled = false; $('#quadro-dica').hidden = false;
    mostrarAlvo();
    $$('.chip').forEach((c) => c.classList.toggle('alvo', Number(c.dataset.i) === D.alvo));
    infoBarra(); tique();
    D.timer = setInterval(tique, 100);
    cv.focus({ preventScroll: true });
  }
  function restante() { return Math.max(0, SEGUNDOS - (performance.now() - D.t0) / 1000); }
  const textoTempo = () => { $('#desafio-tempo-txt').textContent = t('jogo.seg', { n: fmtNum(D.rUlt, 1) }); };
  function tique() {
    const r = restante(), barra = $('#tempo-barra');
    barra.style.transform = `scaleX(${(r / SEGUNDOS).toFixed(3)})`; barra.style.background = r < 5 ? 'var(--verm)' : 'var(--verde)';
    D.rUlt = r; textoTempo();
    if (r <= 0 && D.fase === 'jogando') encerrarRodada('tempo');
  }
  function verificarRodada(top) {
    if (top[0].classe === D.alvo && tamanho(tracos) >= 40) encerrarRodada('acerto', top);
  }
  function encerrarRodada(motivo, topAcerto) {
    if (D.fase !== 'jogando') return;
    clearInterval(D.timer); D.fase = 'resultado'; $('#btn-pular').disabled = true;
    const px = app.pixels, top = topAcerto || (px ? topK(prever(app.modelo, px).probs, 3) : []), usado = SEGUNDOS - restante();
    let pts = 0, k = '', c = -1;
    if (motivo === 'acerto') { pts = 100 + Math.round(restante() * 5); k = 'jogo.res.acerto'; c = D.alvo; }
    else if (motivo === 'pular') { k = 'jogo.res.pulada'; }
    else if (top.slice(0, 3).some((o) => o.classe === D.alvo)) { pts = 30; k = 'jogo.res.quase'; c = D.alvo; }
    else if (top.length) { k = 'jogo.res.tempo'; c = top[0].classe; }
    else { k = 'jogo.res.vazio'; }
    D.pontos += pts; D.hist.push({ alvo: D.alvo, motivo, pts, seg: usado, palpite: top[0] ? top[0].classe : -1 });
    infoBarra();
    const idx = D.rodada;
    D.res = { k, c, pts, idx, ultima: idx + 1 >= RODADAS };
    D.abertoEm = performance.now(); // evita que um clique do traço ainda em andamento pule o resultado sem ser lido
    renderTela(true);
  }
  $('#btn-pular').addEventListener('click', () => encerrarRodada('pular'));

  function telaFinal() {
    D.fase = 'fim';
    D.novoRecorde = D.pontos > D.melhor; if (D.novoRecorde) { D.melhor = D.pontos; guardar('qd-melhor', D.melhor); }
    renderTela(true);
    $$('.chip').forEach((c) => c.classList.remove('alvo'));
    D.alvoVisivel = false; mostrarAlvo(); D.recomecar = false; rotuloComecar();
  }

  // troca de idioma: reescreve só os textos; o desenho, o placar, o cronômetro e a rodada em curso continuam como estão
  onLang(() => {
    $$('.chip').forEach((c) => { c.textContent = N(Number(c.dataset.i)); });
    $$('#sel-forma option').forEach((o) => { o.textContent = catNome(FORMAS[o.value].nome); });
    escreverFrase();
    if (ultimoTop) ultimoTop.forEach((o, i) => { linhas[i].children[0].textContent = N(o.classe); });
    infoBarra(); rotuloComecar(); mostrarAlvo();
    if (D.rUlt != null) textoTempo();
    if (D.ativo) renderTela(false);
  });

  infoBarra(); rotuloComecar();
  redesenhar(); atualizar();
  // expõe um gancho para testes automatizados e para depuração
  window.__jogo = { estado: D, tracos: () => tracos };
}
