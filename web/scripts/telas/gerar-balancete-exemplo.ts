// Gera scripts/telas/balancete-exemplo.json (linhas, resumo, índices e demonstrações) a partir da matriz de teste,
// usando as próprias funções de src/dominios/demonstrativos. Rode de dentro de web/ quando os cálculos mudarem:
//   npx esbuild scripts/telas/gerar-balancete-exemplo.ts --bundle --platform=node --format=esm --alias:@=./src \
//     --outfile=/tmp/gerar.mjs && node /tmp/gerar.mjs > scripts/telas/balancete-exemplo.json
import { MATRIZ_BALANCETE } from "@/dominios/demonstrativos/__testes__/balanceteExemplo";
import { classificar } from "@/dominios/demonstrativos/balancete/classificacao";
import { conferir, fragilidades } from "@/dominios/demonstrativos/balancete/fragilidades";
import { calcularIndices } from "@/dominios/demonstrativos/balancete/indices";
import { lerBalancete } from "@/dominios/demonstrativos/balancete/leitura";
import { resumir } from "@/dominios/demonstrativos/balancete/resumo";
import { basePrazos, montar, periodoDe } from "@/dominios/demonstrativos/calculosDemonstracoes";

const leitura = lerBalancete(MATRIZ_BALANCETE);
const linhas = classificar(leitura.linhas);
const resumo = resumir(linhas);
const indices = calcularIndices(resumo, 30, basePrazos(linhas, 30));
const periodo = periodoDe("2026-09-01", leitura.cabecalho.inicio, leitura.cabecalho.fim);
const demonstracoes = montar(linhas, resumo, indices, periodo);
console.log(
  JSON.stringify({
    linhas,
    resumo,
    indices,
    conferencias: conferir(resumo, linhas, "2026-09-01"),
    alertas: fragilidades(resumo, indices, linhas),
    demonstracoes,
  }),
);
