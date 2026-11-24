"""Exporta a CNN final e os dados auxiliares do laboratorio web (tudo em modelos/).

Saidas:
  cnn-quickdraw.json     pesos float32 arredondados (5 casas) em JSON compacto + descricao das camadas
  amostras-teste.json    entradas 28x28 e logits do PyTorch, para o teste em JavaScript
  matriz-confusao.json   matriz (contagens), pares mais confundidos e exemplos de erro por celula
  curvas.json            comparacao, curva de aprendizado, robustez, calibracao, curvas de treino
  galeria.json           poucas imagens por categoria
Imagens compactas: 28x28 com 4 bits por pixel (16 niveis), 2 pixels por byte, em base64; decodificar como
byte -> (alto = pixel par, baixo = pixel impar), valor = nivel * 17.

Ordem dos pesos (formato PyTorch, linha a linha na lista "pesos"):
  conv2d: [saida][entrada][altura][largura]; dense: [saida][entrada]. Flatten antes da densa: ordem [canal][linha][coluna].
Camadas: conv1 -> relu -> maxpool2 -> conv2 -> relu -> maxpool2 -> conv3 -> relu -> maxpool2 -> flatten -> fc1 -> relu -> fc2 (logits).
Dropout so existe no treino. Entrada: pixel/255.
Uso: python exportar-pesos.py
"""
import base64, csv, json, os, sys
import numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import quickdraw as q

MOD = os.path.join(q.RAIZ, "modelos"); RES = os.path.join(q.RAIZ, "resultados")
D = q.carregar(); NOMES = [str(n) for n in D["nomes_pt"]]; CATS = [str(c) for c in D["categorias"]]; K = len(NOMES)
m = q.CNN(); m.load_state_dict(torch.load(os.path.join(MOD, "cnn-final.pt"))); m.eval()
resumo = json.load(open(os.path.join(RES, "resumo.json"), encoding="utf-8"))


def arr(t, nd=5): return [round(float(v), nd) for v in t.detach().numpy().ravel()]


def empacotar(img_u8):
    """784 uint8 -> base64 de 392 bytes (4 bits por pixel)."""
    n = (np.asarray(img_u8, np.uint8) >> 4).reshape(-1)
    return base64.b64encode(((n[0::2] << 4) | n[1::2]).astype(np.uint8).tobytes()).decode()


def salvar(nome, obj):
    caminho = os.path.join(MOD, nome)
    json.dump(obj, open(caminho, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{nome}: {os.path.getsize(caminho)/1024:.0f} KB")


# ---- pesos
def conv(nome, c, pool): return dict(nome=nome, tipo="conv2d", entrada=c.in_channels, saida=c.out_channels, kernel=3, padding=1, ativacao="relu",
                                     pool=pool, forma_pesos=list(c.weight.shape), pesos=arr(c.weight), vies=arr(c.bias))
def dens(nome, d, ativ): return dict(nome=nome, tipo="dense", entrada=d.in_features, saida=d.out_features, ativacao=ativ,
                                     forma_pesos=list(d.weight.shape), pesos=arr(d.weight), vies=arr(d.bias))
salvar("cnn-quickdraw.json", dict(
    formato="quickdraw-cnn-v1", parametros=q.n_parametros(m), classes=CATS, nomes_pt=NOMES,
    entrada=dict(forma=[1, 28, 28], escala="pixel/255, traço = 1 (claro sobre fundo preto, como no Quick, Draw!)"),
    ordem="conv1,conv2,conv3 (relu+maxpool2), flatten [canal][linha][coluna], fc1 (relu), fc2 (logits); softmax fora do modelo",
    camadas=[conv("conv1", m.conv1, 2), conv("conv2", m.conv2, 2), conv("conv3", m.conv3, 2), dens("fc1", m.fc1, "relu"), dens("fc2", m.fc2, "nenhuma")]))

# ---- verificacao: reimplementa a inferencia com os pesos arredondados lidos do JSON (NumPy) e compara com PyTorch
J = json.load(open(os.path.join(MOD, "cnn-quickdraw.json"), encoding="utf-8"))
def inferir_np(x):
    a = x.reshape(1, 28, 28)
    for L in J["camadas"][:3]:
        W = np.array(L["pesos"], np.float32).reshape(L["forma_pesos"]); b = np.array(L["vies"], np.float32)
        p = np.pad(a, ((0, 0), (1, 1), (1, 1))); H = a.shape[1]; out = np.zeros((L["saida"], H, H), np.float32)
        for dy in range(3):
            for dx in range(3):
                out += np.einsum("oi,ihw->ohw", W[:, :, dy, dx], p[:, dy:dy + H, dx:dx + H])
        out = np.maximum(out + b[:, None, None], 0); h = H // 2
        a = out[:, :h * 2, :h * 2].reshape(L["saida"], h, 2, h, 2).max((2, 4))
    v = a.reshape(-1)
    for L in J["camadas"][3:]:
        W = np.array(L["pesos"], np.float32).reshape(L["forma_pesos"]); v = W @ v + np.array(L["vies"], np.float32)
        if L["ativacao"] == "relu": v = np.maximum(v, 0)
    return v

# ---- amostras de teste (2 por classe + 6 erros) com logits do PyTorch
xt, yt = D["x_teste"], D["y_teste"]
lg = q.logits(m, xt); pred = lg.argmax(1).numpy(); conf = torch.softmax(lg, 1).max(1).values.numpy()
rng = np.random.RandomState(7); idx = []
for c in range(K): idx += list(rng.choice(np.flatnonzero(yt == c), 2, replace=False))
idx += list(rng.choice(np.flatnonzero(pred != yt), 6, replace=False))
dif = 0.0; amostras = []
for i in idx:
    x = xt[i].astype(np.float32) / 255
    dif = max(dif, float(np.abs(inferir_np(x) - lg[i].numpy()).max()))
    amostras.append(dict(indice_teste=int(i), real=int(yt[i]), previsto=int(pred[i]), pixels=[int(v) for v in xt[i]], logits=arr(lg[i], 5)))
print("maior diferenca NumPy(JSON) x PyTorch nos logits:", dif)
assert dif < 1e-3
salvar("amostras-teste.json", dict(descricao="entradas uint8 (784 = 28x28, linha a linha) e logits do PyTorch (CNN final)", tolerancia=1e-3, amostras=amostras))

# ---- matriz de confusao + exemplos por celula
M = q.matriz_confusao(pred, yt, K); exemplos = {}
for i in range(K):
    for j in range(K):
        if i != j and M[i, j] >= 3:
            ii = np.flatnonzero((yt == i) & (pred == j)); ii = ii[np.argsort(-conf[ii])][:4]
            exemplos[f"{i},{j}"] = [dict(img=empacotar(xt[k]), conf=round(float(conf[k]), 3)) for k in ii]
pares = list(csv.DictReader(open(os.path.join(RES, "pares-confundidos.csv"), encoding="utf-8")))
salvar("matriz-confusao.json", dict(classes=NOMES, matriz=M.tolist(), acc=round(float((pred == yt).mean()), 4),
       pares_top=pares[:10], exemplos=exemplos))

# ---- curvas para o laboratorio
def ler(nome): return list(csv.DictReader(open(os.path.join(RES, nome), encoding="utf-8")))
treino = ler("curvas-treino.csv")
salvar("curvas.json", dict(comparacao=ler("comparacao.csv"), por_semente=ler("comparacao-por-semente.csv"), curva_aprendizado=ler("curva-aprendizado.csv"),
       robustez=ler("robustez.csv"), calibracao=json.load(open(os.path.join(RES, "calibracao.json"))), acuracia_por_classe=ler("acuracia-por-classe.csv"),
       curvas_treino=[r for r in treino if r["semente"] == "0"], modelo_final=resumo["modelo_final"]))

# ---- galeria (8 por categoria, do conjunto de treino)
gal = []
for c in range(K):
    ii = np.flatnonzero(D["y_treino"] == c)[:8]
    gal.append(dict(categoria=CATS[c], nome=NOMES[c], imagens=[empacotar(D["x_treino"][k]) for k in ii]))
salvar("galeria.json", dict(descricao="8 imagens por categoria (4 bits por pixel, base64)", categorias=gal))
