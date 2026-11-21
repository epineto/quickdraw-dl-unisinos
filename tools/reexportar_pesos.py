"""Regrava data/cnn_quickdraw.json com pesos em 7 algarismos significativos (o export original usa 5 casas decimais).
Com isso a inferência em JavaScript fica a ~1e-5 dos logits do PyTorch. Uso (a partir da pasta lab/):
  python tools/reexportar_pesos.py ../modelos/cnn_final.pt data/cnn_quickdraw.json
Lê os pesos do checkpoint do PyTorch (state_dict) e preserva todos os metadados do JSON existente."""
import json, sys
import torch

pt, js = sys.argv[1], sys.argv[2]
sd = torch.load(pt, map_location="cpu")
J = json.load(open(js, encoding="utf-8"))
mapa = {"conv1": "conv1", "conv2": "conv2", "conv3": "conv3", "fc1": "fc1", "fc2": "fc2"}
fmt = lambda t: [float(f"{v:.7g}") for v in t.detach().double().numpy().ravel()]
for c in J["camadas"]:
    w, b = sd[mapa[c["nome"]] + ".weight"], sd[mapa[c["nome"]] + ".bias"]
    assert list(w.shape) == c["forma_pesos"], (c["nome"], list(w.shape))
    c["pesos"], c["vies"] = fmt(w), fmt(b)
json.dump(J, open(js, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ok", js)
