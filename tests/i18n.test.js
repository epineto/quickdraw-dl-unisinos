// Testes do seletor de idioma PT | EN: paridade dos dicionários, marcadores {x}, chaves usadas no HTML e na interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pt from '../src/i18n/pt.js';
import en from '../src/i18n/en.js';
import { chaveCat } from '../src/ui/i18n.js';
import { FORMAS } from '../src/core/formas.js';

const url = (p) => new URL('../' + p, import.meta.url);
const lerTexto = (p) => fs.readFileSync(url(p), 'utf8');
const lerJson = (p) => JSON.parse(lerTexto(p));
const html = lerTexto('index.html');

test('dicionários PT e EN têm exatamente as mesmas chaves e nenhum valor vazio', () => {
  const a = Object.keys(pt).sort(), b = Object.keys(en).sort();
  assert.deepEqual(a.filter((k) => !(k in en)), [], 'faltam em EN');
  assert.deepEqual(b.filter((k) => !(k in pt)), [], 'faltam em PT');
  for (const k of a) { assert.ok(String(pt[k]).trim() !== '', 'PT vazio: ' + k); assert.ok(String(en[k]).trim() !== '', 'EN vazio: ' + k); }
});

test('os marcadores {var} de cada chave são os mesmos em PT e EN', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of Object.keys(pt)) assert.equal(vars(pt[k]), vars(en[k]), `marcadores de ${k}`);
});

test('todas as chaves data-i18n do HTML existem nos dicionários', () => {
  const chaves = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) chaves.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => chaves.add(p.split(':')[1]));
  assert.ok(chaves.size > 100);
  assert.deepEqual([...chaves].filter((k) => !(k in pt)), []);
});

test('o texto padrão do HTML é igual ao dicionário PT (sem JavaScript a página mostra o mesmo texto)', () => {
  const re = /<(\w+)\b[^>]*\bdata-i18n(-html)?="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  let n = 0;
  for (const m of html.matchAll(re)) {
    const esperado = m[2] ? pt[m[3]] : pt[m[3]].replace(/&/g, '&amp;').replace(/</g, '&lt;');
    assert.equal(m[4], esperado, `HTML diverge do dicionário em ${m[3]}`);
    n++;
  }
  assert.ok(n > 100);
});

test('atributos traduzidos (aria-label, title) têm no HTML o mesmo texto do dicionário PT', () => {
  for (const m of html.matchAll(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g)) {
    for (const par of m[1].split(';')) {
      const [attr, k] = par.split(':');
      const v = m[0].match(new RegExp(`\\s${attr}="([^"]*)"`));
      assert.ok(v, `atributo ${attr} ausente em ${k}`);
      assert.equal(v[1], pt[k], `${attr} diverge em ${k}`);
    }
  }
});

test('título e descrição do documento (doc.*) batem com o <title> e a meta description do HTML', () => {
  assert.equal(html.match(/<title>([^<]*)<\/title>/)[1], pt['doc.titulo']);
  assert.equal(html.match(/<meta name="description" content="([^"]*)"/)[1], pt['doc.descricao']);
});

test('seletor de idioma: grupo com role/aria-label traduzido e botões PT e EN com lang e aria-pressed', () => {
  assert.match(html, /<div class="idioma" role="group" aria-label="Idioma" data-i18n-attr="aria-label:lang\.grupo">/);
  assert.match(html, /<button type="button" data-lang-btn="pt" lang="pt-BR" aria-pressed="true"[^>]*>PT<\/button>/);
  assert.match(html, /<button type="button" data-lang-btn="en" lang="en" aria-pressed="false"[^>]*>EN<\/button>/);
});

test('toda chave literal usada na interface (src/ui) existe nos dois dicionários', () => {
  const usadas = new Set();
  const prefixos = 'doc|cab|nav|ini|jogo|como|erros|dados|res|sobre|rodape|lang|tema|erro|cat';
  for (const f of fs.readdirSync(url('src/ui/'))) {
    if (!f.endsWith('.js')) continue;
    for (const m of lerTexto('src/ui/' + f).matchAll(new RegExp(`'((?:${prefixos})\\.[a-z0-9_.]*[a-z0-9_])'`, 'g'))) usadas.add(m[1]);
  }
  assert.ok(usadas.size > 80, 'poucas chaves encontradas: ' + usadas.size);
  assert.deepEqual([...usadas].filter((k) => !(k in pt) || !(k in en)), []);
});

test('chaves construídas dinamicamente (prefixo + sufixo) existem nos dois dicionários', () => {
  const dinamicas = {
    'res.curto.': ['baseline', 'mlp', 'cnn', 'cnn_aug'],
    'res.rob.tipo.': ['desloc', 'rotacao', 'escala', 'espessura'],
  };
  for (const [p, ss] of Object.entries(dinamicas)) for (const s of ss) { assert.ok(p + s in pt, 'PT: ' + p + s); assert.ok(p + s in en, 'EN: ' + p + s); }
});

test('toda categoria vinda dos dados (modelo, matriz, galeria, formas) tem tradução estável cat.*', () => {
  const nomes = new Set([...lerJson('data/cnn_quickdraw.json').nomes_pt, ...lerJson('data/matriz_confusao.json').classes, ...lerJson('data/resumo.json').categorias,
    ...lerJson('data/galeria.json').categorias.map((c) => c.nome), ...lerJson('data/curvas.json').acuracia_por_classe.map((c) => c.categoria), ...Object.values(FORMAS).map((f) => f.nome)]);
  assert.equal(nomes.size, 18);
  for (const n of nomes) { const k = chaveCat(n); assert.ok(k in pt && k in en, 'sem tradução: ' + n + ' -> ' + k); assert.notEqual(pt[k], en[k], 'categoria igual nos dois idiomas: ' + n); }
  assert.equal(Object.keys(pt).filter((k) => k.startsWith('cat.')).length, 18);
});

test('tipos de transformação dos dados têm rótulo traduzido', () => {
  for (const r of new Set(lerJson('data/curvas.json').robustez.map((x) => x.transformacao))) {
    const k = 'res.rob.tipo.' + (r.startsWith('desloc') ? 'desloc' : r.startsWith('rota') ? 'rotacao' : r.startsWith('esc') ? 'escala' : 'espessura');
    assert.ok(k in pt, r);
  }
});

test('voz impessoal: nenhum texto em PT usa primeira pessoa (eu, nós, meu, nosso, fiz, fizemos...)', () => {
  const proibido = /\b(eu|nós|meu|minha|meus|minhas|nosso|nossa|nossos|nossas|fiz|fizemos|escolhi|escolhemos|implementei|implementamos|criei|criamos|testei|testamos|usei|usamos|vimos|veremos|vamos)\b/i;
  for (const [k, v] of Object.entries(pt)) { const texto = String(v).replace(/<[^>]+>/g, ' '); assert.ok(!proibido.test(texto), `PT ${k}: primeira pessoa em "${texto}"`); }
  const proibidoEn = /\b(we|our|ours|my|mine|myself|ourselves)\b/i;
  for (const [k, v] of Object.entries(en)) { const texto = String(v).replace(/<[^>]+>/g, ' '); assert.ok(!proibidoEn.test(texto), `EN ${k}: first person in "${texto}"`); }
});

test('textos em EN não deixam palavras típicas do português', () => {
  const pal = /\b(não|para|com|uma|rede neural|desenho|categoria|você|ção|ções)\b|[ãõçé]/i;
  const permitidos = new Set(['cab.logo', 'sobre.trab.p1', 'rodape.1']); // contêm nomes próprios (Epitácio, André, Unisinos)
  for (const [k, v] of Object.entries(en)) {
    if (permitidos.has(k)) continue;
    const texto = String(v).replace(/<[^>]+>/g, ' ');
    assert.ok(!pal.test(texto), `EN ${k} parece ter português: "${texto}"`);
  }
});
