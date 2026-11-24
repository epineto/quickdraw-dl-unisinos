"""Modulo do Trabalho 02 (Deep Learning): "Adivinha o Desenho" com o Quick, Draw!.

Reune, em um unico lugar e com funcoes curtas:
  - carregar os dados (bitmaps 28x28) do arquivo .npz gerado por baixar-dados.py;
  - tres modelos: Baseline (regressao logistica), MLP e CNN pequena;
  - treino (com ou sem aumento de dados) e avaliacao (acuracia, top-3, matriz de confusao);
  - transformacoes de teste (deslocamento, rotacao, escala, espessura do traco);
  - calibracao (ECE, curva de confiabilidade, ajuste de temperatura);
  - identidade visual: logo da Unisinos nos graficos (carregar_logo, com_logo): usa a logo publica por URL, tambem no Google Colab.

Convencao: imagens entram como uint8 (N, 784) e viram float32 (N, 1, 28, 28) em [0, 1] por lote.
"""
import math, os, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.set_num_threads(2)
RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


# ----------------------------------------------------------------- logo da Unisinos nos graficos
_LOGO = None


LOGO_URL = "https://porvir-5g-project.github.io/unisinos.png"      # mesma logo publica usada nos demais trabalhos


def carregar_logo():
    """Logo da Unisinos como imagem (array). Ordem: arquivo logo-unisinos.png ao lado do codigo (se existir); senao baixa de
    LOGO_URL (Google Colab) e guarda uma copia ao lado do codigo. Se tudo falhar, os graficos saem sem logo e o resto segue."""
    global _LOGO
    if _LOGO is not None: return _LOGO
    import io, urllib.request
    import matplotlib.image as mpimg
    arq = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo-unisinos.png")
    try:
        if not os.path.exists(arq):
            req = urllib.request.Request(LOGO_URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as r: dados = r.read()
            open(arq, "wb").write(dados)
        _LOGO = mpimg.imread(arq)
    except Exception as e:
        print("logo da Unisinos indisponivel (segue sem ela):", repr(e)[:80]); _LOGO = False
    return _LOGO


def com_logo(fig, largura_pol=1.15, folga_topo=0.02, ajustar=True):
    """Poe a logo no canto superior direito da figura. Com ajustar=True reserva uma faixa no topo (tight_layout) para
    a logo nao cobrir titulos. Chamar no fim, logo antes de plt.show() ou savefig."""
    logo = carregar_logo()
    if logo is False or logo is None: return fig
    w, h = fig.get_size_inches(); lh = largura_pol * logo.shape[0] / logo.shape[1]
    if ajustar: fig.tight_layout(rect=[0, 0, 1, 1 - (lh / h) - folga_topo])
    ax = fig.add_axes([1 - 0.01 - largura_pol / w, 1 - 0.015 - lh / h, largura_pol / w, lh / h], zorder=10)
    ax.imshow(logo); ax.axis("off")
    return fig


# ----------------------------------------------------------------- dados
def carregar(caminho=None):
    """Le o .npz e devolve um dicionario com x_treino, y_treino, x_val, ..., categorias, nomes_pt."""
    caminho = caminho or os.path.join(RAIZ, "dados", "quickdraw-subconjunto.npz")
    z = np.load(caminho)
    d = {k: z[k] for k in z.files}
    for k in list(d):
        if k.startswith("y_"):
            d[k] = d[k].astype(np.int64)
    return d


def para_tensor(x_u8):
    """uint8 (N, 784) -> float32 (N, 1, 28, 28) em [0, 1]."""
    return torch.from_numpy(x_u8).float().div_(255.0).view(-1, 1, 28, 28)


def subamostra(x, y, n_por_classe, semente=0):
    """Pega os primeiros n_por_classe (apos embaralhar com semente) de cada classe."""
    rng = np.random.RandomState(semente)
    idx = []
    for c in np.unique(y):
        i = np.flatnonzero(y == c)
        idx.append(rng.permutation(i)[:n_por_classe])
    idx = np.concatenate(idx)
    return x[idx], y[idx]


# ----------------------------------------------------------------- modelos
class Baseline(nn.Module):
    """Linha de base: regressao logistica (uma camada linear sobre os 784 pixels)."""
    def __init__(self, n_classes=18):
        super().__init__(); self.fc = nn.Linear(784, n_classes)
    def forward(self, x): return self.fc(x.flatten(1))


class MLP(nn.Module):
    """Rede densa: 784 -> 256 -> 128 -> classes (nao enxerga vizinhanca, so uma lista de pixels)."""
    def __init__(self, n_classes=18):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(784, 256), nn.ReLU(), nn.Dropout(0.2),
                                 nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.2), nn.Linear(128, n_classes))
    def forward(self, x): return self.net(x.flatten(1))


class CNN(nn.Module):
    """CNN pequena: 3 blocos (conv 3x3 + ReLU + pooling 2x2) -> dropout -> densa 96 -> classes.
    Tamanhos: 28 -> 14 -> 7 -> 3. Cerca de 80 mil parametros (cabe em JavaScript no navegador)."""
    def __init__(self, n_classes=18):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.drop = nn.Dropout(0.3)
        self.fc1 = nn.Linear(64 * 3 * 3, 96)
        self.fc2 = nn.Linear(96, n_classes)
    def mapas(self, x):
        """Devolve as ativacoes de cada bloco (para visualizacao)."""
        a1 = F.max_pool2d(F.relu(self.conv1(x)), 2)
        a2 = F.max_pool2d(F.relu(self.conv2(a1)), 2)
        a3 = F.max_pool2d(F.relu(self.conv3(a2)), 2)
        return a1, a2, a3
    def forward(self, x):
        a = self.mapas(x)[2]
        return self.fc2(self.drop(F.relu(self.fc1(a.flatten(1)))))


MODELOS = {"baseline": Baseline, "mlp": MLP, "cnn": CNN}


def n_parametros(m): return sum(p.numel() for p in m.parameters())


# ----------------------------------------------------------------- transformacoes
def afim(x, angulo=0.0, escala=1.0, dx=0.0, dy=0.0):
    """Aplica rotacao (graus), escala e deslocamento (pixels) a um lote; angulo/escala/dx/dy podem ser tensores (N,)."""
    n = x.shape[0]
    ang = torch.as_tensor(angulo, dtype=torch.float32).expand(n) * math.pi / 180
    esc = torch.as_tensor(escala, dtype=torch.float32).expand(n)
    tx = torch.as_tensor(dx, dtype=torch.float32).expand(n) * 2 / 28
    ty = torch.as_tensor(dy, dtype=torch.float32).expand(n) * 2 / 28
    c, s = torch.cos(ang) / esc, torch.sin(ang) / esc
    theta = torch.stack([torch.stack([c, -s, -tx], 1), torch.stack([s, c, -ty], 1)], 1)
    grade = F.affine_grid(theta, x.shape, align_corners=False)
    return F.grid_sample(x, grade, mode="bilinear", padding_mode="zeros", align_corners=False)


def espessura(x, nivel):
    """nivel>0: engrossa o traco (dilatacao 3x3, repetida); nivel<0: afina (erosao)."""
    for _ in range(abs(nivel)):
        x = F.max_pool2d(x, 3, 1, 1) if nivel > 0 else -F.max_pool2d(-x, 3, 1, 1)
    return x


def aumentar(x, g):
    """Aumento de dados aleatorio: rotacao +-15 graus, escala 0,85 a 1,15, deslocamento +-3 px."""
    n = x.shape[0]
    u = lambda lo, hi: torch.empty(n).uniform_(lo, hi, generator=g)
    return afim(x, u(-15, 15), u(0.85, 1.15), u(-3, 3), u(-3, 3))


# ----------------------------------------------------------------- treino e avaliacao
def treinar(nome, x_tr, y_tr, x_val, y_val, epocas, aug=False, semente=0, lr=2e-3, lote=256, verbose=True):
    """Treina um modelo com Adam + agenda cosseno. Devolve (modelo, historico)."""
    torch.manual_seed(semente); g = torch.Generator().manual_seed(semente)
    m = MODELOS[nome](); opt = torch.optim.Adam(m.parameters(), lr=lr, weight_decay=1e-5)
    xt, yt = torch.from_numpy(x_tr), torch.from_numpy(y_tr)
    passos = epocas * math.ceil(len(yt) / lote); sched = torch.optim.lr_scheduler.OneCycleLR(opt, lr, total_steps=passos)
    hist = []; t0 = time.time()
    for ep in range(epocas):
        m.train(); perm = torch.randperm(len(yt), generator=g); soma = 0.0
        for i in range(0, len(yt), lote):
            b = perm[i:i + lote]; xb = para_tensor(xt[b].numpy()); yb = yt[b]
            if aug: xb = aumentar(xb, g)
            perda = F.cross_entropy(m(xb), yb)
            opt.zero_grad(); perda.backward(); opt.step(); sched.step(); soma += perda.item() * len(b)
        acc = acuracia(m, x_val, y_val)
        hist.append({"epoca": ep + 1, "perda_treino": soma / len(yt), "acc_val": acc})
        if verbose: print(f"  [{nome}{'+aug' if aug else ''} s{semente}] ep {ep+1}/{epocas} perda {soma/len(yt):.3f} val {acc:.3f} ({time.time()-t0:.0f}s)", flush=True)
    return m, hist


@torch.no_grad()
def logits(m, x_u8, transf=None, lote=2048):
    """Logits do modelo para um array uint8; transf (opcional) e uma funcao tensor->tensor."""
    m.eval(); out = []
    for i in range(0, len(x_u8), lote):
        xb = para_tensor(x_u8[i:i + lote])
        if transf: xb = transf(xb)
        out.append(m(xb))
    return torch.cat(out)


def acuracia(m, x, y, transf=None):
    return (logits(m, x, transf).argmax(1).numpy() == y).mean().item()


def top_k(lg, y, k=3):
    return (lg.topk(k, 1).indices.numpy() == y[:, None]).any(1).mean().item()


def wilson(acertos, n, z=1.96):
    """Intervalo de confianca de 95% (Wilson) para uma proporcao."""
    p = acertos / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


def matriz_confusao(pred, y, k):
    M = np.zeros((k, k), int)
    np.add.at(M, (y, pred), 1)
    return M


# ----------------------------------------------------------------- calibracao
def ece(prob, y, bins=15):
    """Erro de calibracao esperado (ECE) e pontos da curva (confianca media, acuracia, n por faixa)."""
    conf, pred = prob.max(1)
    conf, ok = conf.numpy(), (pred.numpy() == y).astype(float)
    lim = np.linspace(0, 1, bins + 1); e = 0.0; pts = []
    for a, b in zip(lim[:-1], lim[1:]):
        s = (conf > a) & (conf <= b)
        if s.sum() == 0: continue
        e += s.mean() * abs(ok[s].mean() - conf[s].mean())
        pts.append((float(conf[s].mean()), float(ok[s].mean()), int(s.sum())))
    return float(e), pts


def ajustar_temperatura(lg_val, y_val):
    """Acha T que minimiza a perda no conjunto de validacao (ajuste de temperatura)."""
    logT = torch.zeros(1, requires_grad=True); y = torch.from_numpy(y_val)
    opt = torch.optim.LBFGS([logT], lr=0.1, max_iter=100)
    def f():
        opt.zero_grad(); l = F.cross_entropy(lg_val / logT.exp(), y); l.backward(); return l
    opt.step(f); return logT.exp().item()
