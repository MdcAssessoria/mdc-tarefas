// Testes do PDF do Demonstrativo (Deno): totais do balancete, dados do escritório e marca d'água do rascunho.
// Rode: cd supabase/functions/demonstrativo-pdf && deno test --allow-read --config deno.json pdf_test.ts
import { ESCRITORIO_MDC, escritorioDe, totaisBalancete } from "./pdf.ts";

function igual(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}
const l = (analitica: boolean, debitos: number, creditos: number) =>
  ({ codigo: null, classificacao: "1", descricao: "x", nivel: 1, analitica, saldo_anterior: 0, debitos, creditos, saldo_atual: 0, grupo: null }) as never;

Deno.test("totais do balancete somam só as contas analíticas (DES-05)", () => {
  igual(totaisBalancete([l(false, 300, 300), l(true, 100.1, 50.05), l(true, 199.9, 249.95)]), { debitos: 300, creditos: 300 });
});

Deno.test("escritório: o cadastro vale e o vazio fica com o padrão da MDC (D-11)", () => {
  const e = escritorioDe({ razao: "Outra Ltda", cnpj: "  ", cidadeUf: undefined });
  igual([e.razao, e.cnpj, e.cidadeUf, e.crc], ["Outra Ltda", ESCRITORIO_MDC.cnpj, ESCRITORIO_MDC.cidadeUf, ESCRITORIO_MDC.crc]);
  igual(escritorioDe(null), ESCRITORIO_MDC);
});
