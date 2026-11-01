// Interação da verificação de telas para a importação em lote de balancetes (/demonstrativos/importar):
// envia cinco arquivos de uma vez (pronto, já publicado, empresa desconhecida, ilegível e rascunho existente),
// corrige a empresa de um, marca "substituir" noutro, clica "Importar todos" e espera o resumo por empresa.
// Usa o leitor de planilhas real (SheetJS do próprio site, public/vendor), o mesmo da produção.

/** Balancete no formato do Domínio, em CSV com ";". */
function balanceteCsv(cnpj, inicio, fim) {
  return [
    `Empresa: 123 - EMPRESA DE TESTE LTDA;;;CNPJ: ${cnpj}`,
    `Período: ${inicio} a ${fim};;;Folha: 1`,
    "Código;Classificação;Descrição;Saldo Anterior;Débitos;Créditos;Saldo Atual",
    "1;1;ATIVO;1.000,00D;500,00;0,00;1.500,00D",
    "10;1.1.1.01;CAIXA GERAL;1.000,00D;500,00;0,00;1.500,00D",
    "2;2;PASSIVO;1.000,00C;0,00;0,00;1.000,00C",
    "60;2.3.1.01;CAPITAL SOCIAL;1.000,00C;0,00;0,00;1.000,00C",
    "3;3;RECEITAS;0,00;0,00;500,00;500,00C",
    "70;3.1.1.01;VENDAS DE MERCADORIAS;0,00;0,00;500,00;500,00C",
  ].join("\n");
}

const arquivo = (name, texto) => ({ name, mimeType: "text/csv", buffer: Buffer.from(texto, "utf8") });

async function esperarTexto(p, texto, msg) {
  await p
    .getByText(texto)
    .first()
    .waitFor({ timeout: 4000 })
    .catch(() => {
      throw new Error(msg);
    });
}

export async function importarEmLote(p, foto = async () => {}) {
  await p
    .locator('input[type="file"]')
    .setInputFiles([
      arquivo("greencore-10-2026.csv", balanceteCsv("12.345.678/0001-95", "01/10/2026", "31/10/2026")),
      arquivo("greencore-09-2026.csv", balanceteCsv("12.345.678/0001-95", "01/09/2026", "30/09/2026")),
      arquivo("desconhecida-10-2026.csv", balanceteCsv("99.999.999/0001-99", "01/10/2026", "31/10/2026")),
      arquivo("ilegivel.csv", "isto não é um balancete;;;\nnada aqui"),
      arquivo("greencore-08-2026.csv", balanceteCsv("12.345.678/0001-95", "01/08/2026", "31/08/2026")),
    ]);
  await esperarTexto(p, "5 arquivos", "a lista do lote não apareceu");
  await esperarTexto(p, "Já publicado", "o arquivo de mês publicado não foi marcado como já publicado");
  await esperarTexto(p, "Empresa não encontrada", "o arquivo de empresa desconhecida não foi marcado");
  await esperarTexto(p, "Arquivo ilegível", "o arquivo ilegível não foi marcado");
  await esperarTexto(p, "Já existe (rascunho)", "o arquivo de mês com rascunho não foi marcado");

  // corrige a empresa e marca para substituir o rascunho
  await p.getByLabel("Empresa do arquivo desconhecida-10-2026.csv").selectOption({ label: "101 · Nexus" });
  await p.getByLabel("Substituir o rascunho já gravado").check();
  await foto("lote");
  const importar = p.getByRole("button", { name: "Importar todos (3)" });
  await importar.waitFor({ timeout: 3000 }).catch(() => {
    throw new Error('o botão deveria ficar "Importar todos (3)" depois das correções');
  });
  await importar.click();
  await esperarTexto(p, "Importação concluída", "o resumo da importação não apareceu");
  await esperarTexto(p, "3 de 5 arquivo(s) entraram", "o resumo não contou 3 arquivos gravados");
  await foto("resumo");
}
