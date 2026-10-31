# Gera as cópias do núcleo de cálculo usadas pela Edge Function demonstrativo-pdf (o Deno exige extensão .ts
# nos imports e não enxerga web/src). Rode por scripts/sync-funcoes.sh sempre que mudar algum arquivo de origem:
#   supabase/functions/demonstrativo-pdf/balancete.ts     ← tipos, índices e formatação (de web/src)
#   supabase/functions/demonstrativo-pdf/demonstracoes.ts ← tipos e somas das demonstrações
# Cada trecho é recortado do arquivo de origem do começo da declaração até a próxima declaração de topo.
import re

WEB = "web/src/"
BAL = WEB + "dominios/demonstrativos/balancete/"
FIM_DECLARACAO = re.compile(r"\n(?=(export |// -{5}|const |function |type |interface ))")


def bloco(arquivo, inicio):
    """Trecho do arquivo que começa em `inicio` e vai até a próxima declaração de topo (ou o fim do arquivo)."""
    s = open(arquivo).read()
    i = s.index(inicio)
    proxima = next(FIM_DECLARACAO.finditer(s, i + len(inicio)), None)
    return s[i : proxima.start() if proxima else len(s)].rstrip() + "\n"


def final(arquivo, inicio):
    """Trecho do arquivo que começa em `inicio` e vai até o fim do arquivo."""
    s = open(arquivo).read()
    return s[s.index(inicio) :].rstrip() + "\n"


# A função do PDF sempre mostra reais inteiros com brl(v). No site, brl() de lib/formato/moeda.ts tem a opção
# { centavos } e mostra centavos por padrão; aqui ela vira brlFormato() e brl() fixa centavos: false.
def sem_brl(texto):
    return re.sub(r"\bbrl\(", "brlFormato(", texto)


ADAPTADOR_BRL = (
    "/** Na função do PDF, brl() mostra sempre reais inteiros (o mesmo que brl(v, { centavos: false }) no site). */\n"
    "export const brl = (v: number | null | undefined) => brlFormato(v, { centavos: false });\n"
)

partes = [
    bloco(BAL + "tipos.ts", "export type Grupo ="),
    bloco(BAL + "tipos.ts", "export interface Linha {"),
    final(WEB + "lib/texto.ts", "export function semAcento("),
    bloco(BAL + "leitura.ts", "export const sem ="),
    bloco(BAL + "classificacao.ts", "type Bloco ="),
    bloco(BAL + "classificacao.ts", "export function blocoDe("),
    bloco(BAL + "resumo.ts", "export interface Resumo {"),
    bloco(BAL + "resumo.ts", "export interface Dre {"),
    bloco(BAL + "indices.ts", "export interface Indices {"),
    bloco(BAL + "indices.ts", "export interface BasePrazos {"),
    bloco(BAL + "indices.ts", "export const INDICES_INFO"),
    sem_brl(bloco(WEB + "lib/formato/numero.ts", "export function fmtNumero(")),
    sem_brl(bloco(WEB + "lib/formato/numero.ts", "export function fmtPercentual(")),
    bloco(WEB + "lib/formato/numero.ts", "export type FormatoIndice ="),
    sem_brl(final(WEB + "lib/formato/numero.ts", "export function fmtIndice(")),
    bloco(WEB + "lib/formato/moeda.ts", "export interface OpcoesMoeda {"),
    sem_brl(final(WEB + "lib/formato/moeda.ts", "export function brl(")),
    ADAPTADOR_BRL,
    bloco(BAL + "fragilidades.ts", "export interface Alerta {"),
]
open("supabase/functions/demonstrativo-pdf/balancete.ts", "w").write(
    "// Núcleo do balancete usado pela Edge Function (gerado de web/src/dominios/demonstrativos/balancete/ e\n"
    "// web/src/lib/{texto,formato} por scripts/sync-funcoes.sh). Não edite aqui: mude a origem e rode o script.\n\n"
    + "\n".join(partes)
)

# demonstracoes.ts enxuto: tipos + somas do acumulado + linhas da DRE
DEM = WEB + "dominios/demonstrativos/calculosDemonstracoes.ts"
d = open(DEM).read()


def bl(inicio):
    i = d.index(inicio)
    m = re.compile(r"\n(?=(export |// -{5}|const |function |type |interface |/\*\*))").finditer(d, i + len(inicio))
    j = next(m, None)
    return d[i : j.start() if j else len(d)].rstrip() + "\n"


tipos = d[d.index("export interface Periodo") : d.index("const r2 =")]
partes = [bl("const r2 ="), bl("const ROTULOS"), bl("export function somarDre("), bl("export function somarDfc("), bl("export function linhasDre(")]
open("supabase/functions/demonstrativo-pdf/demonstracoes.ts", "w").write(
    "// Tipos e somas das demonstrações usados pela Edge Function (gerado de\n"
    "// web/src/dominios/demonstrativos/calculosDemonstracoes.ts por scripts/sync-funcoes.sh).\n"
    'import type { Dre } from "./balancete.ts";\n\n' + tipos + "\n".join(partes)
)
