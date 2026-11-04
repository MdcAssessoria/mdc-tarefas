# Gera a cópia do PDF da fatura usada pela Função Edge fatura-enviar (o mesmo PDF que a tela baixa). O Deno exige a
# extensão .ts nos imports e não enxerga web/src: os arquivos vão "achatados" para supabase/functions/fatura-enviar/nucleo/
# e os imports são reescritos. Tipos só de tela (ícone e tom) viram texto. Rode por scripts/sync-funcoes.sh;
# `npm run nucleo` confere se a cópia está em dia.
import os
import re

WEB = "web/src/"
DESTINO = "supabase/functions/fatura-enviar/nucleo/"
# origem (a partir de web/src) → nome na pasta da função
ARQUIVOS = {
    "dominios/contratos/faturaPdf.ts": "faturaPdf.ts",
    "dominios/comercial/contratoPdf.ts": "contratoPdf.ts",
    "dominios/contratos/faturamento.ts": "faturamento.ts",
    "dominios/contratos/regras.ts": "regras.ts",
    "dominios/contratos/tipos.ts": "tipos.ts",
    "dominios/financeiro/tipos.ts": "financeiro_tipos.ts",
    "lib/datas.ts": "datas.ts",
    "lib/documento.ts": "documento.ts",
    "lib/formato/datas.ts": "formato_datas.ts",
    "lib/formato/moeda.ts": "moeda.ts",
    "lib/identidade.ts": "identidade.ts",
}
SO_TELA = {"components/ui/Icone": "type NomeIcone = string;", "components/ui/Tons": "type Tom = string;"}
IMPORTA = re.compile(r'^(import[^;]*?from\s+")([^"]+)(";)\s*$', re.M)
EXTERNOS = {"pdf-lib"}


def resolver(origem, spec):
    if spec.startswith("@/"):
        alvo = spec[2:]
    elif spec.startswith("."):
        alvo = os.path.normpath(os.path.join(os.path.dirname(origem), spec))
    else:
        return None
    return alvo


os.makedirs(DESTINO, exist_ok=True)
for nome in os.listdir(DESTINO):
    if nome not in ARQUIVOS.values():
        os.remove(DESTINO + nome)
for origem, nome in ARQUIVOS.items():
    texto = open(WEB + origem).read()

    def trocar(m):
        spec = m.group(2)
        if spec in EXTERNOS:
            return m.group(0)
        alvo = resolver(origem, spec)
        if alvo in SO_TELA:
            if not m.group(1).startswith("import type"):
                raise SystemExit(f"{origem}: {spec} só pode vir como 'import type'")
            return SO_TELA[alvo]
        if alvo is None or alvo + ".ts" not in ARQUIVOS:
            raise SystemExit(f"{origem}: import {spec} não está na lista do PDF da fatura (scripts/nucleo_fatura.py)")
        return m.group(1) + "./" + ARQUIVOS[alvo + ".ts"] + m.group(3)

    texto = IMPORTA.sub(trocar, texto)
    open(DESTINO + nome, "w").write(f"// Cópia de web/src/{origem} feita por scripts/sync-funcoes.sh. Não edite aqui.\n" + texto)
print("fatura-enviar/nucleo:", len(ARQUIVOS), "arquivos")
