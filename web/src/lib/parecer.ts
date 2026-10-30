// Parecer técnico contábil: linguagem técnica com fundamento legal e normativo,
// cada seção seguida de um quadro "Em linguagem simples" (linhas iniciadas por "> ").
import { brl, fmtIndice } from "./balancete";
import type { Alerta, Indices, Resumo } from "./balancete";
import type { Demonstracoes } from "./demonstracoes";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const pct = (v: number | null | undefined) => fmtIndice(v ?? null, "%");
const x2 = (v: number | null | undefined) => fmtIndice(v ?? null, "x");

/** Fundamento técnico/legal de cada tipo de fragilidade. */
function fundamento(a: Alerta): string | null {
  const t = `${a.area} ${a.texto}`.toLowerCase();
  if (/saldo credor em/.test(t))
    return "Conta de disponibilidade com saldo credor contraria a natureza da conta. Em conta-caixa, o saldo credor autoriza a presunção de omissão de receitas (Decreto-Lei nº 1.598/1977, art. 12, § 2º); em conta bancária, o saldo devedor junto ao banco (cheque especial/conta garantida) deve ser reclassificado para o passivo circulante (Lei nº 6.404/1976, art. 180).";
  if (/caixa alto/.test(t))
    return "Saldos de caixa sem lastro documental ferem a fidedignidade exigida da escrituração (ITG 2000) e podem encobrir pagamentos não escriturados (Lei nº 9.430/1996, art. 40).";
  if (/patrimônio líquido negativo/.test(t))
    return "Passivo a descoberto exige avaliação do pressuposto de continuidade operacional e divulgação das incertezas relevantes (NBC TG 26 – Apresentação das Demonstrações Contábeis).";
  if (/sócios/.test(t))
    return "Créditos com sócios devem ter contrato e condições de mercado. Mútuo entre empresa e sócio está sujeito ao IOF-crédito (Decreto nº 6.306/2007) e condições favorecidas a pessoa ligada podem caracterizar distribuição disfarçada de lucros (Decreto-Lei nº 1.598/1977, art. 60).";
  if (/tributos e encargos|obrigações fiscais/.test(t))
    return "Tributos não recolhidos no prazo sofrem multa de mora de 0,33% ao dia, limitada a 20%, e juros pela Selic (Lei nº 9.430/1996, art. 61), além de impedir a emissão de certidão negativa (CTN, arts. 205 e 206). Contribuições descontadas de empregados e não repassadas configuram apropriação indébita previdenciária (Código Penal, art. 168-A).";
  if (/provis.*férias|férias e 13/.test(t))
    return "Pelo regime de competência (NBC TG 00 – Estrutura Conceitual; Lei nº 6.404/1976, art. 177), férias, 13º salário e encargos devem ser provisionados mês a mês (NBC TG 33 – Benefícios a Empregados).";
  if (/depreciação/.test(t))
    return "Os bens do imobilizado devem ser depreciados de forma sistemática ao longo da vida útil (NBC TG 27 – Ativo Imobilizado; Lei nº 6.404/1976, art. 183, § 2º).";
  if (/transitórias|a classificar/.test(t))
    return "A escrituração deve registrar os fatos com individualização e clareza (Código Civil, art. 1.184; ITG 2000 – Escrituração Contábil); saldos pendentes de classificação comprometem a análise.";
  if (/estoque negativo/.test(t))
    return "Estoque com saldo credor é inconsistência de registro: os estoques devem ser mensurados pelo custo ou valor realizável líquido, dos dois o menor (NBC TG 16 – Estoques).";
  if (/estoque crescendo/.test(t)) return "Estoques acima da necessidade de vendas elevam o risco de obsolescência e de ajuste ao valor realizável (NBC TG 16 – Estoques).";
  if (/liquidez|capital de giro|ciclo/.test(t)) return "Indicador gerencial de solvência de curto prazo, calculado sobre a classificação circulante/não circulante (Lei nº 6.404/1976, art. 180; NBC TG 26).";
  if (/endividamento|dívida/.test(t)) return "Análise da estrutura de capital; dívidas com vencimento em até 12 meses compõem o passivo circulante (Lei nº 6.404/1976, art. 180).";
  return null;
}

export function rascunhoParecer(o: {
  empresa: string;
  cnpj?: string | null;
  competencia: string; // YYYY-MM-01
  regime: string | null;
  r: Resumo;
  i: Indices;
  alertas: Alerta[];
  demo?: Demonstracoes | null;
  anterior?: Resumo | null;
  contador: string;
  crc: string;
}): string {
  const { r, i, alertas, anterior, demo } = o;
  const d = r.mes;
  const mes = new Date(o.competencia.slice(0, 7) + "-15T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const periodo = demo ? `${dataBr(demo.periodo.inicio)} a ${dataBr(demo.periodo.fim)}` : mes;
  const anual = !!demo && demo.periodo.dias > 40;
  const f = demo?.dfc;
  const cz = demo?.cruzamento;
  const s = demo?.saude;
  const lucroTxt = (v: number) => (v >= 0 ? `lucro líquido de ${brl(v)}` : `prejuízo líquido de ${brl(-v)}`);
  const varPct = (a: number, b?: number) =>
    b ? ` (${a >= b ? "+" : "−"}${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(1).replace(".", ",")}% sobre o período anterior)` : "";
  const ml = d.receita_liquida ? d.lucro_liquido / d.receita_liquida : null;
  const mb = d.receita_liquida ? d.lucro_bruto / d.receita_liquida : null;
  const mo = d.receita_liquida ? d.resultado_operacional / d.receita_liquida : null;
  const L: string[] = [];
  const simples = (t: string) => L.push(`> **Em linguagem simples:** ${t}`, "");

  L.push(`# Parecer técnico contábil — ${anual ? `período de ${periodo}` : mes}`);
  L.push(`**${o.empresa}**${o.cnpj ? ` · CNPJ ${o.cnpj}` : ""}${o.regime ? ` · ${o.regime}` : ""}`);
  L.push("");

  L.push("## 1. Objeto, base normativa e alcance");
  L.push(
    `Este parecer analisa a posição patrimonial e financeira e o desempenho da empresa no período de ${periodo}, a partir do balancete de verificação extraído da escrituração contábil, ` +
      "com a elaboração do Balanço Patrimonial, da Demonstração do Resultado (DRE) e da Demonstração dos Fluxos de Caixa (DFC) pelo método indireto.",
  );
  L.push(
    "Fundamentação: Código Civil, arts. 1.179 a 1.195 (obrigatoriedade da escrituração e do levantamento do balanço e do resultado); Lei nº 6.404/1976, arts. 176 a 188, " +
      "com as alterações da Lei nº 11.638/2007 (estrutura e critérios das demonstrações); NBC TG 26 (apresentação das demonstrações), NBC TG 03 (fluxos de caixa), " +
      "NBC TG 1000 (pequenas e médias empresas) e ITG 2000 (escrituração contábil), editadas pelo Conselho Federal de Contabilidade.",
  );
  L.push(
    "Alcance: trata-se de análise técnica gerencial do contador responsável pela escrituração. Não constitui auditoria independente (NBC TA) nem revisão (NBC TR 2400). " +
      "As informações e documentos que suportam os registros são de responsabilidade da administração da empresa.",
  );
  simples("este documento explica, com base na contabilidade do período, se a empresa deu lucro, se tem dinheiro para pagar as contas e onde estão os riscos. É uma leitura técnica da MDC, não uma auditoria.");

  L.push("## 2. Síntese");
  L.push(
    `No período, a receita bruta foi de ${brl(d.receita_bruta)}${anual ? "" : varPct(d.receita_bruta, anterior?.mes.receita_bruta)}, com ${lucroTxt(d.lucro_liquido)}` +
      (ml !== null ? ` e margem líquida de ${pct(ml)}` : "") +
      `. A liquidez corrente é de ${x2(i.liquidez_corrente)}, o capital circulante líquido é de ${brl(i.capital_giro)} e o endividamento geral é de ${pct(i.endividamento_geral)}.` +
      (f ? ` O caixa ${f.variacao >= 0 ? "aumentou" : "diminuiu"} ${brl(Math.abs(f.variacao))} no período.` : ""),
  );
  if (s) {
    L.push("");
    L.push(`**Termômetro de saúde financeira MDC: ${s.nota}/100 — ${s.faixa}.**`);
    for (const p of s.pilares) L.push(`- **${p.nome} (${p.status === "bom" ? "bom" : p.status === "atencao" ? "atenção" : "crítico"}):** ${p.frase}`);
    L.push("");
  }
  simples(
    `${d.lucro_liquido >= 0 ? "a empresa deu lucro" : "a empresa teve prejuízo"} no período` +
      (i.liquidez_corrente !== null ? ` e ${i.liquidez_corrente >= 1 ? "tem mais a receber e em caixa do que dívidas a vencer no próximo ano" : "tem menos em caixa e a receber do que as dívidas que vencem no próximo ano"}` : "") +
      ".",
  );

  L.push("## 3. Desempenho do período (DRE)");
  L.push(
    `As receitas e despesas foram reconhecidas pelo regime de competência (Lei nº 6.404/1976, art. 177; NBC TG 00 – Estrutura Conceitual). ` +
      `Da receita bruta de ${brl(d.receita_bruta)}, ${brl(d.deducoes)} correspondem a tributos e deduções sobre a receita, resultando em receita líquida de ${brl(d.receita_liquida)}. ` +
      `Os custos somaram ${brl(d.custos)} (margem bruta de ${pct(mb)}) e as despesas operacionais ${brl(d.despesas_operacionais)} (margem operacional de ${pct(mo)}). ` +
      `O resultado financeiro líquido foi de ${brl(d.receitas_financeiras - d.despesas_financeiras)} e o IRPJ/CSLL do período, de ${brl(d.ir_csll)}.` +
      (cz ? ` O EBITDA (resultado operacional antes da depreciação e amortização) foi de ${brl(cz.ebitda)}.` : ""),
  );
  if (d.despesas_por_conta.length)
    L.push("", `Principais custos e despesas: ${d.despesas_por_conta.slice(0, 4).map((x) => `${x.conta} (${brl(x.valor)})`).join("; ")}.`);
  L.push("");
  simples(
    d.receita_bruta > 0
      ? `de cada R$ 100 vendidos, ${[
          ["impostos sobre a venda e sobre o lucro", d.deducoes + d.ir_csll],
          ["custos", d.custos],
          ["despesas da operação", d.despesas_operacionais],
          ["juros e outras despesas", d.despesas_financeiras - d.receitas_financeiras - d.outras],
        ]
          .filter(([, v]) => (v as number) / d.receita_bruta >= 0.005)
          .map(([n, v]) => `R$ ${Math.round(((v as number) / d.receita_bruta) * 100)} foram para ${n}`)
          .join(", ")} e ${d.lucro_liquido >= 0 ? `sobraram R$ ${Math.round((d.lucro_liquido / d.receita_bruta) * 100)} de lucro` : `faltaram R$ ${Math.round((-d.lucro_liquido / d.receita_bruta) * 100)} — os gastos foram maiores que a receita`}.`
      : "não houve receita no período.",
  );

  L.push("## 4. Situação patrimonial (Balanço Patrimonial)");
  L.push(
    `O ativo total é de ${brl(r.ativo_total)}, sendo ${brl(r.ac)} no circulante (disponível de ${brl(r.disponivel)}, clientes de ${brl(r.clientes)} e estoques de ${brl(r.estoques)}). ` +
      `O passivo circulante soma ${brl(r.pc)} e o não circulante ${brl(r.pnc)}, classificados pelo critério de vencimento em até 12 meses (Lei nº 6.404/1976, art. 180). ` +
      `O patrimônio líquido, incluído o resultado do exercício em curso, é de ${brl(r.pl + r.resultado_exercicio)}.`,
  );
  L.push(
    "",
    `Indicadores: liquidez corrente ${x2(i.liquidez_corrente)}, seca ${x2(i.liquidez_seca)}, imediata ${x2(i.liquidez_imediata)} e geral ${x2(i.liquidez_geral)}; ` +
      `endividamento geral ${pct(i.endividamento_geral)}, com ${pct(i.composicao_endividamento)} das dívidas no curto prazo.`,
  );
  L.push("");
  simples(
    `${r.pl + r.resultado_exercicio >= 0 ? "o que a empresa tem é maior do que o que ela deve" : "a empresa deve mais do que tem — o patrimônio está negativo"}. ` +
      (i.endividamento_geral !== null ? `De cada R$ 100 em bens e direitos, R$ ${Math.round(i.endividamento_geral * 100)} foram financiados por bancos, fornecedores, governo e outros credores.` : ""),
  );

  if (f && cz) {
    L.push("## 5. Fluxo de caixa e confronto com o resultado (DFC × DRE)");
    L.push(
      `Pela DFC (método indireto, NBC TG 03), as atividades operacionais ${f.fco >= 0 ? "geraram" : "consumiram"} ${brl(Math.abs(f.fco))}, ` +
        `as de investimento ${f.fci >= 0 ? "geraram" : "consumiram"} ${brl(Math.abs(f.fci))} e as de financiamento ${f.fcf >= 0 ? "geraram" : "consumiram"} ${brl(Math.abs(f.fcf))}, ` +
        `levando o caixa e equivalentes de ${brl(f.caixa_inicial)} para ${brl(f.caixa_final)}.` +
        (cz.conversao !== null ? ` A conversão do lucro em caixa operacional foi de ${pct(cz.conversao)}.` : ""),
    );
    L.push("");
    for (const c of cz.comentarios) L.push(`- **${c.titulo}.** ${c.texto}`);
    L.push("");
    simples("a DRE mostra se a empresa ganhou ou perdeu dinheiro; a DFC mostra se esse dinheiro entrou de fato na conta. Lucro sem caixa costuma significar vendas a prazo, estoque ou contas adiantadas.");
  }

  L.push(`## ${f ? 6 : 5}. Prazos médios e ciclo financeiro`);
  L.push(
    `Prazo médio de recebimento (PMR) de ${i.pmr ?? "—"} dias, de pagamento (PMP) de ${i.pmp ?? "—"} dias` +
      (i.pme != null ? `, de estocagem (PME) de ${i.pme} dias e de venda (PMV) de ${i.pmv ?? "—"} dias` : "") +
      `. Ciclo operacional de ${i.ciclo_operacional ?? "—"} dias e ciclo financeiro de ${i.ciclo_financeiro ?? "—"} dias.`,
  );
  L.push("");
  simples(
    i.ciclo_financeiro == null
      ? "não foi possível calcular os prazos neste período."
      : i.ciclo_financeiro <= 0
        ? "a empresa recebe dos clientes antes de pagar os fornecedores, o que ajuda o caixa."
        : `entre pagar fornecedores e receber dos clientes passam cerca de ${i.ciclo_financeiro} dias; nesse intervalo a empresa usa dinheiro próprio ou de banco para girar.`,
  );

  const n = f ? 7 : 6;
  L.push(`## ${n}. Fragilidades e riscos identificados`);
  if (!alertas.length) L.push("As verificações aplicadas não identificaram fragilidades relevantes no período.");
  alertas.forEach((a, k) => {
    L.push(`**${n}.${k + 1} ${a.texto}** — risco ${a.nivel}`);
    L.push(`- Evidência: ${a.evidencia}.`);
    const fb = fundamento(a);
    if (fb) L.push(`- Fundamento: ${fb}`);
    L.push(`- Recomendação: ${a.recomendacao}`);
    L.push("");
  });

  L.push(`## ${n + 1}. Aspectos tributários`);
  L.push(`- Carga tributária efetiva sobre a receita bruta (tributos sobre vendas e IRPJ/CSLL): ${pct(i.carga_tributaria)}.`);
  L.push("- [Revisar: adequação do regime de tributação, parcelamentos em curso e pendências nas certidões federais, estaduais e municipais.]");
  L.push(
    "- Reforma tributária (Emenda Constitucional nº 132/2023 e Lei Complementar nº 214/2025): a partir de 2027 a CBS substitui o PIS e a COFINS, e entre 2029 e 2033 o IBS substitui gradualmente o ICMS e o ISS. A MDC avaliará os efeitos sobre preços, créditos e regime da empresa.",
  );
  L.push("");

  L.push(`## ${n + 2}. Conclusão`);
  const altos = alertas.filter((a) => a.nivel === "alto");
  L.push(
    `Com base nos registros contábeis do período e nos procedimentos descritos, a empresa apresenta ${lucroTxt(d.lucro_liquido)}` +
      `, ${i.liquidez_corrente !== null && i.liquidez_corrente >= 1 ? "capacidade de honrar as obrigações de curto prazo" : "insuficiência de recursos de curto prazo frente às obrigações do mesmo prazo"}` +
      (s ? ` e termômetro de saúde financeira de ${s.nota}/100 (${s.faixa.toLowerCase()})` : "") +
      (altos.length ? `. Há ${altos.length} ponto(s) de risco alto que pedem providência imediata, detalhados na seção ${n}.` : ". Não há pontos de risco alto pendentes.") +
      " Recomenda-se acompanhar os indicadores no próximo fechamento.",
  );
  const recs = [...new Set(alertas.map((a) => a.recomendacao))].slice(0, 5);
  if (recs.length) {
    L.push("");
    L.push("Próximos passos recomendados:");
    for (const rr of recs) L.push(`- ${rr}`);
  }
  L.push("");
  L.push(`## ${n + 3}. Responsabilidade técnica`);
  L.push(`${o.contador} — Contador, CRC ${o.crc}`);
  L.push("MDC Assessoria Ltda · CNPJ 48.140.121/0001-65 · Bragança Paulista/SP");
  L.push("");
  L.push("_Parecer emitido com base nos registros contábeis do período e nas informações fornecidas pela administração, observado o Código de Ética Profissional do Contador (NBC PG 01)._");
  return L.join("\n");
}
