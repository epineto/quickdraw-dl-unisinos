"""Gera todos os resultados do Trabalho 02 (CSV/JSON em resultados/, pesos em modelos/).

Experimentos: (a) baseline x MLP x CNN; (b) matriz de confusao e pares confundidos; (c) curva de aprendizado;
(d) robustez com e sem aumento de dados; (e) calibracao. As figuras sao geradas por gerar-figuras.py.
Uso: python treinar.py            (completo, ~25 min em 2 threads de CPU)
     python treinar.py --rapido   (teste de fumaca, poucos minutos; escreve em resultados/_rapido)
Modelos treinados ficam em modelos/_cache/ e sao reaproveitados se o script for repetido.
"""
import argparse, csv, json, os, sys, time
import numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import quickdraw as q

ap = argparse.ArgumentParser(); ap.add_argument("--rapido", action="store_true"); A = ap.parse_args()
RES = os.path.join(q.RAIZ, "resultados"); MOD = os.path.join(q.RAIZ, "modelos"); CACHE = os.path.join(MOD, "_cache" + ("_rapido" if A.rapido else ""))
if A.rapido: RES = os.path.join(RES, "_rapido")
for p in (RES, MOD, CACHE): os.makedirs(p, exist_ok=True)

D = q.carregar(); NOMES = [str(n) for n in D["nomes_pt"]]; K = len(NOMES)
if A.rapido:
    for s in ("treino", "val", "teste"):
        i = np.random.RandomState(0).permutation(len(D["y_" + s]))[:6000 if s == "treino" else 3000]
        D["x_" + s], D["y_" + s] = D["x_" + s][i], D["y_" + s][i]
EP = dict(baseline=15, mlp=12, cnn=5, cnn_aug=6) if not A.rapido else dict(baseline=3, mlp=3, cnn=2, cnn_aug=2)
SEMENTES = {"baseline": [0, 1, 2], "mlp": [0, 1, 2], "cnn": [0, 1, 2], "cnn_aug": [0, 1]} if not A.rapido else {k: [0] for k in EP}
xv, yv, xt, yt = D["x_val"], D["y_val"], D["x_teste"], D["y_teste"]
t_ini = time.time()


def z_ep(nome, n):
    """Epocas: valor fixo para o conjunto completo; mais epocas quando ha poucos dados (minimo de passos)."""
    ep = EP[nome]
    if n < len(D["y_treino"]) * 0.9 and not A.rapido:
        ep = int(min(60, max(ep, np.ceil(1000 / np.ceil(n / 256)))))
    return ep


def obter(nome, semente, x, y, tag=""):
    """Treina (ou le do cache) um modelo. nome em baseline/mlp/cnn/cnn_aug."""
    base, aug = ("cnn", True) if nome == "cnn_aug" else (nome, False)
    arq = os.path.join(CACHE, f"{nome}{tag}_s{semente}.pt")
    if os.path.exists(arq):
        z = torch.load(arq); m = q.MODELOS[base](); m.load_state_dict(z["w"]); return m, z["hist"], z["seg"]
    t0 = time.time(); m, h = q.treinar(base, x, y, xv, yv, z_ep(nome, len(y)), aug=aug, semente=semente, lote=256)
    seg = time.time() - t0; torch.save({"w": m.state_dict(), "hist": h, "seg": seg}, arq); return m, h, seg


def csv_(nome, linhas, campos):
    with open(os.path.join(RES, nome), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, campos); w.writeheader(); w.writerows(linhas)


# ---------------------------------------------------------------- (a) comparacao
print("== (a) comparacao", flush=True)
lin, curvas, modelos, logs = [], [], {}, {}
for nome in EP:
    for s in SEMENTES[nome]:
        m, h, seg = obter(nome, s, D["x_treino"], D["y_treino"])
        lg = q.logits(m, xt); pred = lg.argmax(1).numpy(); ac = (pred == yt).mean().item()
        lo, hi = q.wilson((pred == yt).sum(), len(yt))
        lin.append(dict(modelo=nome, semente=s, parametros=q.n_parametros(m), epocas=EP[nome], segundos_treino=round(seg, 1),
                        acc_teste=round(ac, 4), ic95_inf=round(lo, 4), ic95_sup=round(hi, 4), top3_teste=round(q.top_k(lg, yt, 3), 4),
                        acc_val=round(h[-1]["acc_val"], 4)))
        for e in h: curvas.append(dict(modelo=nome, semente=s, **e))
        modelos[(nome, s)] = m; logs[(nome, s)] = lg
        print(f"  {nome} s{s}: teste {ac:.4f} top3 {lin[-1]['top3_teste']:.4f} ({seg:.0f}s)", flush=True)
csv_("comparacao-por-semente.csv", lin, list(lin[0]))
csv_("curvas-treino.csv", curvas, ["modelo", "semente", "epoca", "perda_treino", "acc_val"])
resumo_mod = []
for nome in EP:
    L = [r for r in lin if r["modelo"] == nome]; a = np.array([r["acc_teste"] for r in L]); t3 = np.array([r["top3_teste"] for r in L])
    lo, hi = q.wilson(a.mean() * len(yt), len(yt))
    resumo_mod.append(dict(modelo=nome, parametros=L[0]["parametros"], sementes=len(L), acc_media=round(a.mean(), 4),
                           acc_desvio_sementes=round(a.std(ddof=1), 4) if len(a) > 1 else "", ic95_inf=round(lo, 4), ic95_sup=round(hi, 4),
                           top3_media=round(t3.mean(), 4), segundos_treino_medio=round(np.mean([r["segundos_treino"] for r in L]), 1)))
csv_("comparacao.csv", resumo_mod, list(resumo_mod[0]))

# modelo final: CNN com aumento se nao perder mais de 1 ponto percentual para a CNN simples
acc = {r["modelo"]: r["acc_media"] for r in resumo_mod}
final = "cnn_aug" if acc["cnn_aug"] >= acc["cnn"] - 0.01 else "cnn"
mf, lgf = modelos[(final, 0)], logs[(final, 0)]
if not A.rapido: torch.save(mf.state_dict(), os.path.join(MOD, "cnn-final.pt"))
print("  modelo final:", final, flush=True)

# ---------------------------------------------------------------- (b) confusao
print("== (b) confusao", flush=True)
predf = lgf.argmax(1).numpy(); M = q.matriz_confusao(predf, yt, K)
np.savetxt(os.path.join(RES, "matriz-confusao.csv"), M, fmt="%d", delimiter=",", header=",".join(NOMES), comments="")
pares = []
for i in range(K):
    for j in range(i + 1, K):
        pares.append(dict(a=NOMES[i], b=NOMES[j], a_para_b=int(M[i, j]), b_para_a=int(M[j, i]), total=int(M[i, j] + M[j, i]),
                          pct_do_par=round(float((M[i, j] + M[j, i]) / (M[i].sum() + M[j].sum()) * 100), 2)))
pares.sort(key=lambda r: -r["total"])
csv_("pares-confundidos.csv", pares, list(pares[0]))
csv_("acuracia-por-classe.csv", [dict(categoria=NOMES[i], acuracia=round(M[i, i] / M[i].sum(), 4)) for i in range(K)], ["categoria", "acuracia"])
conf = torch.softmax(lgf, 1).max(1).values.numpy(); exemplos = []
for r in pares[:6]:
    i, j = NOMES.index(r["a"]), NOMES.index(r["b"]); item = dict(a=r["a"], b=r["b"], erros=[])
    for (real, pr) in ((i, j), (j, i)):
        idx = np.flatnonzero((yt == real) & (predf == pr)); idx = idx[np.argsort(-conf[idx])][:4]
        item["erros"] += [dict(indice=int(k), real=NOMES[real], previsto=NOMES[pr], confianca=round(float(conf[k]), 3)) for k in idx]
    exemplos.append(item)
json.dump(exemplos, open(os.path.join(RES, "exemplos-erros.json"), "w"), ensure_ascii=False, indent=1)
print("  par mais confundido:", pares[0], flush=True)

# ---------------------------------------------------------------- (c) curva de aprendizado
print("== (c) curva de aprendizado", flush=True)
cura = []
TAM = [100, 500, 2000, 5000] if not A.rapido else [50, 200]
n_full = len(D["y_treino"]) // K
for nome in ("baseline", "mlp", "cnn"):
    for n in TAM:
        x, y = q.subamostra(D["x_treino"], D["y_treino"], n, 0)
        m, h, seg = obter(nome, 0, x, y, tag=f"_n{n}")
        cura.append(dict(modelo=nome, por_classe=n, treino_total=len(y), acc_teste=round(q.acuracia(m, xt, yt), 4), epocas=len(h)))
        print(" ", cura[-1], flush=True)
    r = [r for r in lin if r["modelo"] == nome and r["semente"] == 0][0]
    cura.append(dict(modelo=nome, por_classe=n_full, treino_total=len(D["y_treino"]), acc_teste=r["acc_teste"], epocas=r["epocas"]))
csv_("curva-aprendizado.csv", cura, list(cura[0]))

# ---------------------------------------------------------------- (d) robustez
print("== (d) robustez", flush=True)
sub = np.random.RandomState(1).permutation(len(yt))[:10000]; xr, yr = xt[sub], yt[sub]
GRADE = ([("deslocamento (pixels)", s, lambda x, s=s: q.afim(x, dx=float(s))) for s in (0, 1, 2, 3, 4, 6)] +
         [("rotação (graus)", a, lambda x, a=a: q.afim(x, angulo=float(a))) for a in (0, 10, 20, 30, 45)] +
         [("escala (fator)", e, lambda x, e=e: q.afim(x, escala=float(e))) for e in (0.6, 0.8, 1.0, 1.2, 1.4)] +
         [("espessura do traço", n, lambda x, n=n: q.espessura(x, n)) for n in (0, 1, 2)])
rob = []
for nome in ("mlp", "cnn", "cnn_aug"):
    m = modelos[(nome, 0)]
    for tipo, val, f in GRADE:
        rob.append(dict(modelo=nome, transformacao=tipo, valor=val, acc=round(q.acuracia(m, xr, yr, f), 4)))
csv_("robustez.csv", rob, ["modelo", "transformacao", "valor", "acc"])
print("  ok", flush=True)

# ---------------------------------------------------------------- (e) calibracao
print("== (e) calibracao", flush=True)
cal = {}
for nome in ("cnn", "cnn_aug"):
    m = modelos[(nome, 0)]; lt = logs[(nome, 0)]; lvv = q.logits(m, xv)
    T = q.ajustar_temperatura(lvv, yv)
    e0, p0 = q.ece(torch.softmax(lt, 1), yt); e1, p1 = q.ece(torch.softmax(lt / T, 1), yt)
    cal[nome] = dict(ece=round(e0, 4), ece_depois_temperatura=round(e1, 4), temperatura=round(T, 3),
                     confianca_media=round(float(torch.softmax(lt, 1).max(1).values.mean()), 4), acc=round(float((lt.argmax(1).numpy() == yt).mean()), 4),
                     curva=[dict(conf=round(a, 4), acc=round(b, 4), n=n) for a, b, n in p0],
                     curva_temperatura=[dict(conf=round(a, 4), acc=round(b, 4), n=n) for a, b, n in p1])
    print(" ", nome, {k: v for k, v in cal[nome].items() if "curva" not in k}, flush=True)
json.dump(cal, open(os.path.join(RES, "calibracao.json"), "w"), indent=1)
ok = predf == yt
cal_extra = dict(confianca_media_acertos=round(float(conf[ok].mean()), 4), confianca_media_erros=round(float(conf[~ok].mean()), 4))

# ---------------------------------------------------------------- resumo.json
curva = {nome: {r["por_classe"]: r["acc_teste"] for r in cura if r["modelo"] == nome} for nome in ("baseline", "mlp", "cnn")}
resumo = dict(categorias=NOMES, tamanhos=dict(treino=len(D["y_treino"]), val=len(yv), teste=len(yt)), modelo_final=final,
              comparacao=resumo_mod, par_mais_confundido=pares[0], top5_pares=pares[:5], curva_aprendizado=curva,
              calibracao={k: {a: b for a, b in v.items() if "curva" not in a} for k, v in cal.items()}, calibracao_extra=cal_extra,
              robustez_subconjunto_teste=len(yr), minutos_total=round((time.time() - t_ini) / 60, 1), rapido=A.rapido)
json.dump(resumo, open(os.path.join(RES, "resumo.json"), "w"), ensure_ascii=False, indent=1)
print("== concluido em", resumo["minutos_total"], "min", flush=True)
