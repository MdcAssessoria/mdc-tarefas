# Gera supabase/functions/demonstrativo-pdf/balancete.ts só com o que a Edge Function usa.
import re, sys
s = open("web/src/lib/balancete.ts").read()
def bloco(inicio):
    i = s.index(inicio)
    m = re.compile(r"\n(?=(export |// -{5}|const |function |type |interface ))").finditer(s, i + len(inicio))
    return s[i:next(m).start()].rstrip() + "\n"
partes = ["export type Grupo =", "export interface Linha {", "export const sem =", "type Bloco =", "export function blocoDe(",
          "export interface Resumo {", "export interface Dre {", "export interface Indices {", "export interface BasePrazos {",
          "export const INDICES_INFO", "export function fmtIndice(", "export const brl =", "export interface Alerta "]
open("supabase/functions/demonstrativo-pdf/balancete.ts", "w").write(
    "// Núcleo do balancete usado pela Edge Function (gerado de web/src/lib/balancete.ts por scripts/sync-funcoes.sh).\n\n" + "\n".join(bloco(p) for p in partes))

# demonstracoes.ts enxuto: tipos + somas do acumulado + linhas da DRE
d = open("web/src/lib/demonstracoes.ts").read()
def bl(inicio):
    i = d.index(inicio)
    m = re.compile(r"\n(?=(export |// -{5}|const |function |type |interface |/\*\*))").finditer(d, i + len(inicio))
    j = next(m, None)
    return d[i:j.start() if j else len(d)].rstrip() + "\n"
tipos = d[d.index("export interface Periodo"):d.index("const r2 =")]
partes = [bl("const r2 ="), bl("const ROTULOS"), bl("export function somarDre("), bl("export function somarDfc("), bl("export function linhasDre(")]
open("supabase/functions/demonstrativo-pdf/demonstracoes.ts", "w").write(
    "// Tipos e somas das demonstrações usados pela Edge Function (gerado de web/src/lib/demonstracoes.ts).\n"
    'import type { Dre } from "./balancete.ts";\n\n' + tipos + "\n".join(partes))
