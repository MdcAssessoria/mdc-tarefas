# Gera a cópia do núcleo puro das notas fiscais usado pelas Funções Edge fiscais (fiscal-captura, fiscal-manifestar).
# Origem: web/src/dominios/notas/{xml,sefaz,documentos,regras}.ts → supabase/functions/_fiscal/nucleo/ (o Deno exige
# a extensão .ts nos imports). Rode por scripts/sync-funcoes.sh; `npm run nucleo` confere se as cópias estão em dia.
import os
import re

ORIGEM = "web/src/dominios/notas/"
DESTINO = "supabase/functions/_fiscal/nucleo/"
ARQUIVOS = ["xml.ts", "sefaz.ts", "documentos.ts", "regras.ts"]
IMPORTA = re.compile(r'(from\s+")(\./[\w]+)(")')

os.makedirs(DESTINO, exist_ok=True)
for nome in os.listdir(DESTINO):
    if nome not in ARQUIVOS:
        os.remove(DESTINO + nome)
for arq in ARQUIVOS:
    texto = open(ORIGEM + arq).read()
    if re.search(r'from\s+"(?!\./)', texto):
        raise SystemExit(f"{arq}: import fora da pasta notas não pode ir para a função")
    texto = IMPORTA.sub(lambda m: m.group(1) + m.group(2) + ".ts" + m.group(3), texto)
    open(DESTINO + arq, "w").write(f"// Cópia de web/src/dominios/notas/{arq} feita por scripts/sync-funcoes.sh. Não edite aqui.\n" + texto)
print("_fiscal/nucleo:", len(ARQUIVOS), "arquivos")
