"""Gera figuras/*.png a partir de resultados/ (identidade Unisinos: titulo a esquerda, logo no canto, virgula decimal).
Uso: python gerar-figuras.py"""
import csv, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
TEMPLATES = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools", "templates"))
sys.path.insert(0, TEMPLATES)
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import quickdraw as q
try:                                    # tema da identidade visual (existe so no repositorio completo)
    from plot_theme import aplicar, COR
except ImportError:                     # copia minima do tema: o script tambem roda fora do repositorio (Colab)
    COR = {"azul": "#1D2369", "azul2": "#4A5AB8", "vermelho": "#C0392B", "cinza": "#666666", "claro": "#E9ECF3", "verde": "#2E7D5B"}
    def aplicar(): plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": "#E3E6EE"})

aplicar()
RES = os.path.join(q.RAIZ, "resultados"); FIG = os.path.join(q.RAIZ, "figuras"); os.makedirs(FIG, exist_ok=True)
LOGO = q.carregar_logo()               # arquivo logo-unisinos.png ou, se faltar, baixa da URL publica
NOMEM = {"baseline": "Regressão logística", "mlp": "MLP", "cnn": "CNN", "cnn_aug": "CNN + aumento"}
COR_M = {"baseline": COR["cinza"], "mlp": COR["azul2"], "cnn": COR["azul"], "cnn_aug": COR["vermelho"]}
virg = lambda v, nd=1: f"{v:.{nd}f}".replace(".", ",")
PCT = FuncFormatter(lambda v, _: f"{v:.0f}%".replace(".", ","))
PCT1 = FuncFormatter(lambda v, _: f"{v*100:.0f}%")
NUM = FuncFormatter(lambda v, _: f"{v:g}".replace(".", ","))


def ler(nome): return list(csv.DictReader(open(os.path.join(RES, nome), encoding="utf-8")))


def moldura(fig, titulo, sub=None, topo=0.86):
    """Titulo a esquerda, subtitulo cinza e logo no canto superior direito."""
    fig.text(0.01, 0.965, titulo, ha="left", va="top", fontsize=13, fontweight="bold", color=COR["azul"])
    if sub: fig.text(0.01, 0.905, sub, ha="left", va="top", fontsize=9, color="#555555")
    if LOGO is not False:
        w, h = fig.get_size_inches(); lw = 1.15; lh = lw * LOGO.shape[0] / LOGO.shape[1]
        ax = fig.add_axes([1 - 0.01 - lw / w, 1 - 0.015 - lh / h, lw / w, lh / h]); ax.imshow(LOGO); ax.axis("off")
    return topo


def salvar(fig, nome, topo=0.86):
    fig.tight_layout(rect=[0, 0, 1, topo]); fig.savefig(os.path.join(FIG, nome), dpi=150); plt.close(fig); print("ok", nome)


D = q.carregar(); NOMES = [str(n) for n in D["nomes_pt"]]; K = len(NOMES)
resumo = json.load(open(os.path.join(RES, "resumo.json"), encoding="utf-8")); final = resumo["modelo_final"]

# ---- 1. exemplos por categoria
fig = plt.figure(figsize=(7.6, 4.7)); topo = moldura(fig, "Os desenhos: 18 categorias do dia a dia", "Cada categoria mostra 6 rabiscos reais de pessoas diferentes (28 × 28 pixels).", 0.86)
for c in range(K):
    ax = fig.add_subplot(3, 6, c + 1); ii = np.flatnonzero(D["y_treino"] == c)[:6]
    tiles = [D["x_treino"][k].reshape(28, 28) for k in ii]
    sep = np.zeros((28, 2), np.uint8)
    lin1 = np.hstack([np.hstack([t, sep]) for t in tiles[:3]]); lin2 = np.hstack([np.hstack([t, sep]) for t in tiles[3:]])
    ax.imshow(255 - np.vstack([lin1, np.zeros((2, lin1.shape[1]), np.uint8), lin2]), cmap="gray", vmin=0, vmax=255)
    ax.set_title(NOMES[c], fontsize=8, color=COR["azul"], pad=2); ax.axis("off")
salvar(fig, "fig1-exemplos.png", topo)

# ---- 2. comparacao baseline x MLP x CNN
comp = {r["modelo"]: r for r in ler("comparacao.csv")}
fig = plt.figure(figsize=(7.6, 3.6)); topo = moldura(fig, "Quem acerta mais? Linha de base × MLP × CNN", "Acurácia no conjunto de teste (36.000 desenhos novos); barras de erro = intervalo de confiança de 95%.")
ax = fig.add_subplot(111); ordem = ["baseline", "mlp", "cnn", "cnn_aug"]
for i, mo in enumerate(ordem):
    r = comp[mo]; a, lo, hi = float(r["acc_media"]) * 100, float(r["ic95_inf"]) * 100, float(r["ic95_sup"]) * 100
    ax.barh(i, a, color=COR_M[mo], height=0.55, xerr=[[a - lo], [hi - a]], error_kw=dict(ecolor="#222", capsize=3))
    ax.text(a + 1.0, i, f"{virg(a)}%   (top-3: {virg(float(r['top3_media'])*100)}%)", va="center", fontsize=8.5)
ax.set_yticks(range(4)); ax.set_yticklabels([f"{NOMEM[m]}\n{int(comp[m]['parametros']):,} parâmetros".replace(",", ".") for m in ordem], fontsize=8.5)
ax.invert_yaxis(); ax.set_xlim(0, 112); ax.xaxis.set_major_formatter(PCT); ax.set_xlabel("acurácia de teste"); ax.grid(axis="y", visible=False)
salvar(fig, "fig2-comparacao.png", topo)

# ---- 3. matriz de confusao
M = np.loadtxt(os.path.join(RES, "matriz-confusao.csv"), delimiter=",", skiprows=1)
P = M / M.sum(1, keepdims=True) * 100; Pd = P.copy(); np.fill_diagonal(Pd, np.nan)
fig = plt.figure(figsize=(7.6, 6.6)); topo = moldura(fig, "Onde a rede se confunde", "Cada linha é a categoria verdadeira; cada coluna, o palpite. A cor mostra o % de erros (diagonal = acertos, em cinza claro).", 0.90)
ax = fig.add_subplot(111); cmap = plt.get_cmap("Reds").copy(); cmap.set_bad("#F3F4F8")
im = ax.imshow(Pd, cmap=cmap, vmin=0, vmax=max(6, np.nanmax(Pd))); ax.grid(False)
ax.set_xticks(range(K)); ax.set_yticks(range(K)); ax.set_xticklabels(NOMES, rotation=60, ha="right", fontsize=7.5); ax.set_yticklabels(NOMES, fontsize=7.5)
for i in range(K):
    for j in range(K):
        if i != j and P[i, j] >= 1.5: ax.text(j, i, virg(P[i, j]), ha="center", va="center", fontsize=6, color="white" if P[i, j] > 0.6 * np.nanmax(Pd) else "#333")
cb = fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02); cb.set_label("% das imagens da categoria verdadeira"); cb.ax.yaxis.set_major_formatter(NUM)
ax.set_xlabel("palpite da rede"); ax.set_ylabel("categoria verdadeira")
salvar(fig, "fig3-confusao.png", topo)

# ---- 4. pares confundidos e exemplos
ex = json.load(open(os.path.join(RES, "exemplos-erros.json"), encoding="utf-8")); xt = D["x_teste"]
pares = ler("pares-confundidos.csv")[:4]
fig = plt.figure(figsize=(7.6, 6.2)); moldura(fig, "Os pares mais confundidos, com exemplos de erro", "Rabiscos em que a rede errou com mais convicção. Acima de cada um: verdadeiro → palpite (confiança).")
gs = fig.add_gridspec(8, 6, height_ratios=[0.22, 1] * 4, top=0.84, bottom=0.01, left=0.02, right=0.98, hspace=0.45, wspace=0.08)
for r, it in enumerate(ex[:4]):
    p = pares[r]; ida = [e for e in it["erros"] if e["real"] == it["a"]][:3]; volta = [e for e in it["erros"] if e["real"] == it["b"]][:3]
    h = fig.add_subplot(gs[2 * r, :]); h.axis("off")
    h.text(0, 0.2, f"{p['a']} × {p['b']}: {int(p['total'])} trocas ({virg(float(p['pct_do_par']))}% das imagens do par)", fontsize=9, color=COR["azul"], fontweight="bold", ha="left")
    for col, e in enumerate(ida + volta):
        ax = fig.add_subplot(gs[2 * r + 1, col]); ax.imshow(255 - xt[e["indice"]].reshape(28, 28), cmap="gray", vmin=0, vmax=255); ax.axis("off")
        ax.set_title(f"{e['real']} → {e['previsto']}\n({virg(e['confianca']*100,0)}% de confiança)", fontsize=6.5, pad=2)
fig.savefig(os.path.join(FIG, "fig4-pares-erros.png"), dpi=150); plt.close(fig); print("ok fig4")

# ---- 5. curva de aprendizado
cur = ler("curva-aprendizado.csv")
fig = plt.figure(figsize=(7.2, 3.9)); topo = moldura(fig, "Quantos desenhos são necessários?", "Acurácia de teste conforme cresce o número de desenhos de treino por categoria (escala logarítmica).")
ax = fig.add_subplot(111)
for mo in ("baseline", "mlp", "cnn"):
    R = sorted([r for r in cur if r["modelo"] == mo], key=lambda r: int(r["por_classe"])); xs = [int(r["por_classe"]) for r in R]; ys = [float(r["acc_teste"]) * 100 for r in R]
    ax.plot(xs, ys, "-o", color=COR_M[mo], label=NOMEM[mo]); ax.annotate(virg(ys[-1]) + "%", (xs[-1], ys[-1]), textcoords="offset points", xytext=(6, -3), fontsize=8, color=COR_M[mo])
ax.set_xscale("log"); ax.set_xticks([100, 500, 2000, 5000, 8000]); ax.set_xticklabels(["100", "500", "2.000", "5.000", "8.000"]); ax.minorticks_off()
ax.set_xlim(70, 12500); ax.yaxis.set_major_formatter(PCT); ax.set_xlabel("desenhos de treino por categoria"); ax.set_ylabel("acurácia de teste"); ax.legend(loc="lower right")
salvar(fig, "fig5-curva-aprendizado.png", topo)

# ---- 6. robustez
rob = ler("robustez.csv"); tipos = ["deslocamento (pixels)", "rotação (graus)", "escala (fator)", "espessura do traço"]
fig = plt.figure(figsize=(7.8, 5.2)); topo = moldura(fig, "E se o desenho sair do padrão?", "Acurácia com o desenho deslocado, girado, ampliado/reduzido ou com traço mais grosso (10.000 imagens de teste).", 0.88)
for k, t in enumerate(tipos):
    ax = fig.add_subplot(2, 2, k + 1)
    for mo in ("mlp", "cnn", "cnn_aug"):
        R = [r for r in rob if r["modelo"] == mo and r["transformacao"] == t]; ax.plot([float(r["valor"]) for r in R], [float(r["acc"]) * 100 for r in R], "-o", ms=4, color=COR_M[mo], label=NOMEM[mo])
    ax.set_title(t, loc="left"); ax.yaxis.set_major_formatter(PCT); ax.xaxis.set_major_formatter(NUM); ax.set_ylim(0, 100)
    if t.startswith("esp"):
        ax.set_xlim(-0.3, 2.35); ax.set_xticks([0, 1, 2]); ax.set_xticklabels(["original", "grosso", "muito grosso"], fontsize=7.5)
    if k == 0: ax.legend(fontsize=7.5, loc="lower left")
salvar(fig, "fig6-robustez.png", topo)

# ---- 7. calibracao
cal = json.load(open(os.path.join(RES, "calibracao.json")))
fig = plt.figure(figsize=(6.4, 4.6)); topo = moldura(fig, "A confiança da rede é confiável?", "Quando a rede diz “tenho X% de certeza”, ela acerta X% das vezes? Mais perto da diagonal = melhor.", 0.88)
ax = fig.add_subplot(111); ax.plot([0, 100], [0, 100], "--", color="#999", label="calibração perfeita")
for nome, chave, cor, rot in (("cnn", "curva", COR["azul"], "CNN"), ("cnn_aug", "curva", COR["vermelho"], "CNN + aumento"), ("cnn_aug", "curva_temperatura", COR["verde"], "CNN + aumento + temperatura")):
    c = cal[nome]; e = c["ece"] if chave == "curva" else c["ece_depois_temperatura"]
    ax.plot([p["conf"] * 100 for p in c[chave]], [p["acc"] * 100 for p in c[chave]], "-o", ms=4, color=cor, label=f"{rot} (ECE {virg(e*100)}%)")
ax.set_xlabel("confiança declarada pela rede"); ax.set_ylabel("acurácia observada"); ax.xaxis.set_major_formatter(PCT); ax.yaxis.set_major_formatter(PCT)
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.set_aspect("equal"); ax.legend(loc="lower right", bbox_to_anchor=(1.0, 0.02), fontsize=7.5)
salvar(fig, "fig7-calibracao.png", topo)

# ---- 8. curvas de treino
ct = [r for r in ler("curvas-treino.csv") if r["semente"] == "0"]
fig = plt.figure(figsize=(7.2, 3.6)); topo = moldura(fig, "A rede aprendendo, época por época", "Acurácia na validação ao longo do treino (primeira semente de cada modelo).")
ax = fig.add_subplot(111)
for mo in ("baseline", "mlp", "cnn", "cnn_aug"):
    R = [r for r in ct if r["modelo"] == mo]; ax.plot([int(r["epoca"]) for r in R], [float(r["acc_val"]) * 100 for r in R], "-o", ms=3.5, color=COR_M[mo], label=NOMEM[mo])
ax.yaxis.set_major_formatter(PCT); ax.set_xlabel("época (uma volta completa pelos dados de treino)"); ax.set_ylabel("acurácia de validação"); ax.legend(loc="center right", bbox_to_anchor=(1, 0.6))
salvar(fig, "fig8-treino.png", topo)
