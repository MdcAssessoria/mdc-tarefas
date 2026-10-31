// Interação da verificação de telas para a visão por período dos demonstrativos (tela do balancete e Portal):
// troca Ano, Visão e Qual período e confere que a tela responde sem erro, inclusive no ano com balancete acumulado.
// Usa o histórico de scripts/telas/dados-exemplo.mjs: 2024 acumulado (jan–dez de uma vez), 2025 e 2026 mensais.

/** Espera um texto aparecer na página; lança erro com a mensagem dada se não aparecer. */
async function esperarTexto(p, texto, msg) {
  await p
    .getByText(texto)
    .first()
    .waitFor({ timeout: 3000 })
    .catch(() => {
      throw new Error(msg);
    });
}

const botaoVisao = (p, nome) => p.getByRole("group", { name: "Visão" }).getByRole("button", { name: nome, exact: true });

export async function trocarPeriodo(p, foto = async () => {}) {
  const ano = p.getByLabel("Ano", { exact: true });
  const qual = p.getByLabel("Qual período");

  // 2025 por trimestre: 2º trimestre completo, comparando com o ano anterior (2024 só tem o acumulado: não compara)
  await ano.selectOption("2025");
  await botaoVisao(p, "Trimestre").click();
  if ((await botaoVisao(p, "Trimestre").getAttribute("aria-pressed")) !== "true") throw new Error("a visão Trimestre não ficou marcada");
  await qual.selectOption("2");
  await esperarTexto(p, "2º trimestre de 2025", "o painel não mostrou o 2º trimestre de 2025");
  await esperarTexto(p, "3 de 3 meses importados", "a completude do trimestre não apareceu");
  await foto("trimestre");

  // semestre e ano
  await botaoVisao(p, "Semestre").click();
  await esperarTexto(p, "semestre de 2025", "a visão Semestre não trocou o período");
  await botaoVisao(p, "Ano").click();
  await esperarTexto(p, "12 de 12 meses importados", "a visão Ano de 2025 não somou os 12 meses");

  // 2024: balancete do ano inteiro de uma vez → só a visão Ano
  await ano.selectOption("2024");
  await esperarTexto(p, "enviado de uma vez", "o ano acumulado não foi reconhecido");
  if (!(await botaoVisao(p, "Mês").isDisabled())) throw new Error("a visão Mês deveria ficar indisponível no ano acumulado");
  await foto("acumulado");

  // 2026 por mês, com comparação ao mesmo mês de 2025
  await ano.selectOption("2026");
  await botaoVisao(p, "Mês").click();
  await qual.selectOption("3");
  await esperarTexto(p, "Comparando com março de 2025", "a comparação com o mesmo período do ano anterior não apareceu");
}
