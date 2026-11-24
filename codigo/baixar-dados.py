"""Baixa um subconjunto pequeno do Quick, Draw! (bitmaps 28x28).

Em vez de baixar ~96 MB por categoria, usa requisicoes HTTP Range para ler apenas o
cabecalho do .npy e as primeiras N_POR_CLASSE linhas (cada linha = 784 bytes).
Saidas: dados/quickdraw-subconjunto.npz e dados/LEIAME-DADOS.txt.
Uso: python baixar-dados.py
"""
import ast, datetime, hashlib, io, os, struct, urllib.request
import numpy as np

URL = "https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/{}.npy"
N_POR_CLASSE = 12000
SEMENTE = 2026
N_TREINO, N_VAL, N_TESTE = 8000, 2000, 2000

# categoria -> (nome em portugues, justificativa)
CATEGORIAS = {
    "cat": ("gato", "par parecido com cachorro (orelhas pontudas)"),
    "dog": ("cachorro", "par parecido com gato"),
    "circle": ("círculo", "formato simples; confunde com sol e bola"),
    "sun": ("sol", "círculo com raios"),
    "basketball": ("bola de basquete", "círculo com linhas internas"),
    "house": ("casa", "par parecido com castelo"),
    "castle": ("castelo", "casa com torres"),
    "apple": ("maçã", "objeto redondo com cabinho"),
    "tree": ("árvore", "forma vertical comum"),
    "flower": ("flor", "pode lembrar sol ou maçã"),
    "car": ("carro", "par com bicicleta (rodas)"),
    "bicycle": ("bicicleta", "rodas e quadro"),
    "fish": ("peixe", "silhueta alongada distinta"),
    "bird": ("pássaro", "silhueta com asas"),
    "clock": ("relógio", "círculo com ponteiros"),
    "star": ("estrela", "traço pontudo, bem distinta"),
    "umbrella": ("guarda-chuva", "forma distinta"),
    "airplane": ("avião", "silhueta com asas, parecida com pássaro"),
}

def ler_prefixo(cat, n):
    url = URL.format(cat)
    def rng(a, b):
        req = urllib.request.Request(url, headers={"Range": f"bytes={a}-{b}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    cab = rng(0, 255)
    assert cab[:6] == b"\x93NUMPY"
    major = cab[6]
    if major == 1:
        hl = struct.unpack("<H", cab[8:10])[0]; ini = 10
    else:
        hl = struct.unpack("<I", cab[8:12])[0]; ini = 12
    d = ast.literal_eval(cab[ini:ini + hl].decode("latin1"))
    assert d["descr"] in ("|u1", "<u1") and d["shape"][1] == 784 and not d["fortran_order"]
    off = ini + hl
    dados = rng(off, off + n * 784 - 1)
    assert len(dados) == n * 784, (cat, len(dados))
    return np.frombuffer(dados, np.uint8).reshape(n, 784).copy(), d["shape"][0]

def main():
    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dados")
    os.makedirs(raiz, exist_ok=True)
    cats = list(CATEGORIAS)
    rng = np.random.RandomState(SEMENTE)
    X = {"treino": [], "val": [], "teste": []}; Y = {"treino": [], "val": [], "teste": []}
    totais = {}
    for i, c in enumerate(cats):
        x, tot = ler_prefixo(c, N_POR_CLASSE); totais[c] = tot
        p = rng.permutation(N_POR_CLASSE)
        cortes = {"treino": p[:N_TREINO], "val": p[N_TREINO:N_TREINO + N_VAL], "teste": p[N_TREINO + N_VAL:N_TREINO + N_VAL + N_TESTE]}
        for k, idx in cortes.items():
            X[k].append(x[idx]); Y[k].append(np.full(len(idx), i, np.uint8))
        print(c, tot, flush=True)
    out = {}
    for k in X:
        xs, ys = np.concatenate(X[k]), np.concatenate(Y[k])
        q = np.random.RandomState(SEMENTE + 1).permutation(len(ys))
        out["x_" + k], out["y_" + k] = xs[q], ys[q]
    out["categorias"] = np.array(cats); out["nomes_pt"] = np.array([CATEGORIAS[c][0] for c in cats])
    caminho = os.path.join(raiz, "quickdraw-subconjunto.npz")
    np.savez_compressed(caminho, **out)
    sha = hashlib.sha256(open(caminho, "rb").read()).hexdigest()
    linhas = ["DADOS: Google Quick, Draw! (bitmaps 28x28, formato numpy)",
      "Fonte: https://github.com/googlecreativelab/quickdraw-dataset (Google Creative Lab)",
      "Licenca: Creative Commons Attribution 4.0 (CC BY 4.0). Credito: Google Creative Lab.",
      "Referencia: Ha, D. e Eck, D. (2017). A Neural Representation of Sketches. arXiv:1704.03477.",
      f"Data do download: {datetime.date.today().isoformat()}",
      "", "Como foi obtido: HTTP Range nas URLs abaixo, lendo so o cabecalho do .npy e as primeiras "
      f"{N_POR_CLASSE} linhas de cada categoria (evita baixar ~96 MB por categoria). Reproduzir: python codigo/baixar-dados.py",
      f"Divisao fixa por classe (semente {SEMENTE}): {N_TREINO} treino / {N_VAL} validacao / {N_TESTE} teste "
      f"(total {len(cats)*(N_TREINO+N_VAL+N_TESTE)} imagens, {len(cats)} classes).",
      "Observacao: as primeiras linhas do arquivo foram usadas como amostra; a ordem original e a do dataset publicado.",
      "", "Categorias (arquivo | nome | motivo | linhas no arquivo original):"]
    for c in cats:
        linhas.append(f"- {c} | {CATEGORIAS[c][0]} | {CATEGORIAS[c][1]} | {totais[c]} | {URL.format(c)}")
    linhas += ["", f"Arquivo gerado: dados/quickdraw-subconjunto.npz  ({os.path.getsize(caminho)/1e6:.1f} MB)", f"SHA-256: {sha}"]
    open(os.path.join(raiz, "LEIAME-DADOS.txt"), "w", encoding="utf-8").write("\n".join(linhas) + "\n")
    print("ok", sha)

if __name__ == "__main__":
    main()
