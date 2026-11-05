// Testes da leitura do Anexo VIII (062): link e versão no portal, células mescladas e colunas pelo cabeçalho.
import { deepStrictEqual as assertEquals, throws } from "node:assert/strict";
import { compararVersoes, linhasAnexoViii, linksAnexoViii, versaoDoArquivo } from "./anexoViii.ts";

Deno.test("versão vem do nome do arquivo", () => {
  assertEquals(versaoDoArquivo("anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-02-00.xlsx"), "1.02.00");
  assertEquals(versaoDoArquivo("Anexo VIII - v1.3.0.xlsx"), "1.03.00");
  assertEquals(versaoDoArquivo("planilha.xlsx"), null);
  assertEquals(compararVersoes("1.10.00", "1.02.00") > 0, true);
  assertEquals(compararVersoes("1.02.00", "1.02.00"), 0);
});

Deno.test("acha os links do Anexo VIII no portal, o mais novo primeiro, sem o /view", () => {
  const html = `
    <a href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacao_v1-00-00.xlsx/view">v1</a>
    <a href="/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacao_v1-02-00.xlsx">v2</a>
    <a href="/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexovii-indop_v1-03-00.xlsx">anexo VII</a>
    <a href="/nfse/outro.pdf">pdf</a>`;
  const r = linksAnexoViii(html, "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc");
  assertEquals(r.map((x) => x.versao), ["1.02.00", "1.00.00"]);
  assertEquals(r[0].url, "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacao_v1-02-00.xlsx");
  assertEquals(r[1].url.endsWith("/view"), false);
});

Deno.test("células mescladas: item, atividade e INDOP valem para as linhas de baixo", () => {
  const linhas = [
    ["Item LC 116", "Descrição Item", "NBS", "DESCRIÇÃO NBS", "COD_ATIV_SN", "DESCRIÇÃO ATIV_SN", "INDOP"],
    ["17.19", "Contabilidade", "1.1302.21.00", "Serviços de contabilidade", "7", "Anexo III", "100301"],
    [null, null, "1.1302.22.00", "Escrituração", null, null, null],
    [null, null, null, null, null, null, null],
    ["99.03.01", "Locação", "1.1001.10.00", "Locação de imóvel", "11", "Sem ISS", "100302"],
    [null, null, "1.1302.22.00", "repetido em outro item", null, null, null],
    [null, null, "123", "NBS curto (ignora)", null, null, null],
  ];
  const r = linhasAnexoViii(linhas);
  assertEquals(r.length, 4);
  assertEquals(r[1], {
    item: "17.19",
    item_descricao: "Contabilidade",
    nbs: "113022200",
    nbs_descricao: "Escrituração",
    ativ_sn: "7",
    ativ_sn_descricao: "Anexo III",
    indop: "100301",
  });
  assertEquals(r[3].item, "99.03.01");
  assertEquals(r[3].ativ_sn, "11");
});

Deno.test("planilha sem o cabeçalho esperado: erro claro (não troca a tabela)", () => {
  throws(() => linhasAnexoViii([["coluna", "outra"], ["1", "2"]]), /Cabeçalho do Anexo VIII/);
});
