// Testes da DPS da NFS-e Nacional (dps.ts): Id, XML do leiaute 1.01, valores, textos, datas no fuso de Brasília e
// leitura do retorno da API. A validação contra o XSD oficial e a assinatura conferida no xmlsec1 ficam no teste Deno
// (supabase/functions/_fiscal/nfse_test.ts).
import { describe, expect, it } from "vitest";
import { lerXml, txt } from "./xml";
import { compactarDocZip } from "./sefaz";
import {
  caminhoNfseEmitida,
  conferirDps,
  corpoEnvioDps,
  dataHoraBrasilia,
  idDps,
  lerConsultaDps,
  lerNfseEmitida,
  lerRetornoEmissao,
  montarDps,
  montarInfDps,
  textoNfse,
  traduzirMensagem,
  urlConsultarDps,
  urlEmitir,
  valorNfse,
} from "./dps";
import type { DadosDps } from "./dps";

const DPS: DadosDps = {
  ambiente: "producao_restrita",
  dhEmi: "2026-11-03T09:15:00-03:00",
  serie: "1",
  nDps: 27,
  dCompet: "2026-11-01",
  cLocEmi: "3507605",
  prestador: { cnpj: "48.140.121/0001-65", im: "12345", opSimpNac: "3", regApTribSN: "1", regEspTrib: "0" },
  tomador: { documento: "12.345.678/0001-95", nome: "Ômega Comércio & Serviços <Ltda>", email: " financeiro@omega.com.br " },
  servico: {
    cLocPrestacao: "3507605",
    cTribNac: "17.19.01",
    descricao: "Serviços de contabilidade – escrituração e folha · 11/2026 · Fatura 2026/00005",
    cNBS: "1.1302.10.00",
  },
  valores: { vServ: 1850.5, pTotTribSN: 6 },
};

describe("Id da DPS", () => {
  it("tem 45 posições: DPS + município + 2 (CNPJ) + CNPJ + série(5) + nDPS(15)", () => {
    const id = idDps("3507605", "48.140.121/0001-65", "1", 27);
    expect(id).toBe("DPS3507605248140121000165" + "00001" + "000000000000027");
    expect(id).toHaveLength(45);
  });
  it("CPF usa o tipo 1 e completa com zeros à esquerda", () => {
    expect(idDps("3507605", "123.456.789-09", 900, 1)).toBe("DPS35076051" + "00012345678909" + "00900" + "000000000000001");
  });
  it("município errado não monta", () => {
    expect(() => idDps("35076", "48140121000165", 1, 1)).toThrow(/identificação da DPS/);
  });
});

describe("datas e valores", () => {
  it("data e hora no fuso de Brasília, inclusive na virada do dia", () => {
    expect(dataHoraBrasilia(new Date("2026-11-03T12:15:00Z"))).toBe("2026-11-03T09:15:00-03:00");
    expect(dataHoraBrasilia(new Date("2026-11-03T02:30:05Z"))).toBe("2026-11-02T23:30:05-03:00");
    expect(dataHoraBrasilia(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31T22:00:00-03:00");
  });
  it("valores com duas casas e ponto", () => {
    expect(valorNfse(1850.5)).toBe("1850.50");
    expect(valorNfse(0.1 + 0.2)).toBe("0.30");
    expect(valorNfse(0)).toBe("0.00");
    expect(() => valorNfse(Number.NaN)).toThrow();
  });
  it("texto aceito pelo leiaute: troca traço e aspas tipográficas, tira emoji, junta espaços", () => {
    expect(textoNfse("  Honorários – “novembro”  🙂  ", 100)).toBe('Honorários - "novembro"');
    expect(textoNfse("linha 1\r\n\r\n\r\nlinha 2", 100, true)).toBe("linha 1\n\nlinha 2");
    expect(textoNfse("linha 1\nlinha 2", 100)).toBe("linha 1 linha 2");
    expect(textoNfse("abcdef ", 4)).toBe("abcd");
  });
});

describe("XML da DPS (leiaute 1.01)", () => {
  const inf = montarInfDps(DPS);
  const xml = montarDps(inf, "");
  const raiz = lerXml(xml);
  const infDps = raiz.filhos[0];

  it("raiz DPS versão 1.01 no namespace da NFS-e, com o Id certo", () => {
    expect(raiz.nome).toBe("DPS");
    expect(raiz.atributos.versao).toBe("1.01");
    expect(raiz.atributos.xmlns).toBe("http://www.sped.fazenda.gov.br/nfse");
    expect(infDps.atributos.Id).toBe("DPS3507605248140121000165" + "00001" + "000000000000027");
  });
  it("tags na ordem do esquema, série e nDPS sem zeros, tpAmb 2 no teste", () => {
    expect(infDps.filhos.map((f) => f.nome)).toEqual([
      "tpAmb",
      "dhEmi",
      "verAplic",
      "serie",
      "nDPS",
      "dCompet",
      "tpEmit",
      "finNFSe",
      "cLocEmi",
      "prest",
      "toma",
      "serv",
      "valores",
    ]);
    expect(txt(infDps, "tpAmb")).toBe("2");
    expect(txt(infDps, "serie")).toBe("1");
    expect(txt(infDps, "nDPS")).toBe("27");
    expect(txt(infDps, "tpEmit")).toBe("1");
    expect(txt(infDps, "verAplic")).toBe("HUB-MDC 1.0");
  });
  it("prestador: CNPJ, IM e regime do Simples ME/EPP (sem nome e endereço: o Emissor busca no cadastro)", () => {
    expect(txt(infDps, "prest/CNPJ")).toBe("48140121000165");
    expect(txt(infDps, "prest/IM")).toBe("12345");
    expect(txt(infDps, "prest/xNome")).toBeNull();
    expect(txt(infDps, "prest/regTrib/opSimpNac")).toBe("3");
    expect(txt(infDps, "prest/regTrib/regApTribSN")).toBe("1");
    expect(txt(infDps, "prest/regTrib/regEspTrib")).toBe("0");
  });
  it("tomador com CNPJ, nome escapado e e-mail aparado", () => {
    expect(txt(infDps, "toma/CNPJ")).toBe("12345678000195");
    expect(txt(infDps, "toma/xNome")).toBe("Ômega Comércio & Serviços <Ltda>");
    expect(inf).toContain("<xNome>Ômega Comércio &amp; Serviços &lt;Ltda&gt;</xNome>");
    expect(txt(infDps, "toma/email")).toBe("financeiro@omega.com.br");
  });
  it("serviço: município, código de 6 números, descrição sem traço tipográfico e NBS de 9 números", () => {
    expect(txt(infDps, "serv/locPrest/cLocPrestacao")).toBe("3507605");
    expect(txt(infDps, "serv/cServ/cTribNac")).toBe("171901");
    expect(txt(infDps, "serv/cServ/xDescServ")).toBe("Serviços de contabilidade - escrituração e folha · 11/2026 · Fatura 2026/00005");
    expect(txt(infDps, "serv/cServ/cNBS")).toBe("113021000");
  });
  it("leiaute da NT 009: finNFSe 0 e NBS antes da descrição (produção restrita já; produção a partir de 01/12/2026)", () => {
    expect(txt(infDps, "finNFSe")).toBe("0");
    expect(infDps.filhos.find((f) => f.nome === "serv")!.filhos[1].filhos.map((f) => f.nome)).toEqual(["cTribNac", "cNBS", "xDescServ"]);
    const antigo = lerXml(montarInfDps({ ...DPS, ambiente: "producao", dhEmi: "2026-11-30T23:59:00-03:00" }));
    expect(antigo.filhos.map((f) => f.nome)).not.toContain("finNFSe");
    expect(antigo.filhos.find((f) => f.nome === "serv")!.filhos[1].filhos.map((f) => f.nome)).toEqual(["cTribNac", "xDescServ", "cNBS"]);
    const novo = lerXml(montarInfDps({ ...DPS, ambiente: "producao", dhEmi: "2026-12-01T00:00:00-03:00" }));
    expect(txt(novo, "finNFSe")).toBe("0");
  });
  it("valores: vServ, ISS tributável não retido SEM alíquota (vai no DAS) e % do Simples", () => {
    expect(txt(infDps, "valores/vServPrest/vServ")).toBe("1850.50");
    expect(txt(infDps, "valores/trib/tribMun/tribISSQN")).toBe("1");
    expect(txt(infDps, "valores/trib/tribMun/tpRetISSQN")).toBe("1");
    expect(inf).not.toContain("pAliq");
    expect(inf).not.toContain("indTotTrib");
    expect(txt(infDps, "valores/trib/totTrib/pTotTribSN")).toBe("6.00");
    expect(inf).not.toContain("IBSCBS");
  });
  it("forma canônica: só a declaração xmlns a mais, antes do Id", () => {
    const canonico = montarInfDps(DPS, true);
    expect(canonico.startsWith('<infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" Id="DPS')).toBe(true);
    expect(canonico.replace(' xmlns="http://www.sped.fazenda.gov.br/nfse"', "")).toBe(inf);
  });
  it("produção usa tpAmb 1; CPF do tomador vira <CPF>; sem IM e sem e-mail as tags não vão", () => {
    const outro = montarInfDps({
      ...DPS,
      ambiente: "producao",
      prestador: { ...DPS.prestador, im: null },
      tomador: { documento: "123.456.789-09", nome: "Fulano", email: "sem-arroba" },
    });
    expect(outro).toContain("<tpAmb>1</tpAmb>");
    expect(outro).toContain("<CPF>12345678909</CPF>");
    expect(outro).not.toContain("<IM>");
    expect(outro).not.toContain("<email>");
  });
  it("falta de dado vira mensagem em português", () => {
    const ruim = { ...DPS, servico: { ...DPS.servico, cTribNac: "17.19", cNBS: "" }, valores: { vServ: 0, pTotTribSN: null } };
    const p = conferirDps(ruim);
    expect(p).toContain("Código de tributação nacional: 6 números (ex.: 17.19.01).");
    expect(p).toContain("Código NBS: 9 números.");
    expect(p).toContain("Valor do serviço precisa ser maior que zero.");
    expect(() => montarInfDps(ruim)).toThrow(/6 números/);
    expect(conferirDps({ ...DPS, serie: "50000" })).toContain("Série da DPS: de 1 a 49999.");
    expect(conferirDps({ ...DPS, prestador: { ...DPS.prestador, opSimpNac: "1" } })[0]).toMatch(/ME\/EPP/);
    expect(conferirDps(DPS)).toEqual([]);
  });
  it("corpo do envio: gzip + base64 da DPS assinada", async () => {
    const c = await corpoEnvioDps(xml);
    expect(Object.keys(c)).toEqual(["dpsXmlGZipB64"]);
    expect(c.dpsXmlGZipB64).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe("retorno da API da Sefin Nacional", () => {
  const CHAVE = "35076052248140121000165" + "0000000000027" + "2611" + "123456789" + "1";
  it("endereços de produção restrita e produção", () => {
    expect(urlEmitir("producao_restrita")).toBe("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse");
    expect(urlEmitir("producao")).toBe("https://sefin.nfse.gov.br/SefinNacional/nfse");
    expect(urlConsultarDps("producao", "DPS1")).toBe("https://sefin.nfse.gov.br/SefinNacional/dps/DPS1");
  });
  it("201 com chave e XML = emitida", () => {
    const r = lerRetornoEmissao(201, { chaveAcesso: CHAVE, nfseXmlGZipB64: "H4sI", idDps: "DPS1", alertas: [{ codigo: "A1", descricao: "aviso" }] });
    expect(r.tipo).toBe("emitida");
    if (r.tipo === "emitida") {
      expect(r.chave).toBe(CHAVE);
      expect(r.alertas[0].codigo).toBe("A1");
    }
  });
  it("400 com erros (minúsculas ou maiúsculas) = recusa traduzida, com a descrição oficial guardada", () => {
    const r = lerRetornoEmissao(400, { erros: [{ Codigo: "E0625", Descricao: "Não é permitido informar alíquota…", Complemento: "pAliq" }] });
    expect(r.tipo).toBe("rejeitada");
    if (r.tipo === "rejeitada") {
      expect(r.mensagens[0]).toEqual({
        codigo: "E0625",
        descricao: "Não é permitido informar alíquota…",
        complemento: "pAliq",
        texto: "Para ME/EPP do Simples sem retenção, a alíquota do ISS não vai na nota (o ISS está no DAS).",
      });
      expect(r.mensagem).toMatch(/\(E0625\)$/);
    }
    const r2 = lerRetornoEmissao(400, { Erro: { codigo: "E1234", descricao: "Campo X inválido" } });
    expect(r2.tipo === "rejeitada" && r2.mensagens[0].texto).toBe("O Emissor Nacional recusou: Campo X inválido");
  });
  it("403 sem corpo = certificado recusado; 500 e corpo sem nota = sem resposta certa", () => {
    const r = lerRetornoEmissao(403, null);
    expect(r.tipo === "rejeitada" && r.mensagem).toMatch(/certificado digital/);
    expect(lerRetornoEmissao(500, { erro: "x" }).tipo).toBe("erro");
    expect(lerRetornoEmissao(200, {}).tipo).toBe("erro");
  });
  it("consulta da DPS: existe (chave), não existe (404) ou incerto", () => {
    expect(lerConsultaDps(200, { chaveAcesso: CHAVE })).toEqual({ tipo: "existe", chave: CHAVE });
    expect(lerConsultaDps(404, { erros: [{ codigo: "E2404" }] })).toEqual({ tipo: "nao_existe" });
    expect(lerConsultaDps(502, null).tipo).toBe("incerto");
  });
  it("tradução de código desconhecido usa a descrição oficial", () => {
    expect(traduzirMensagem("e0714", "")).toMatch(/assinatura digital/);
    expect(traduzirMensagem("E7777", "")).toBe("O Emissor Nacional recusou a nota sem dizer o motivo.");
  });
  it("lê número e chave da NFS-e devolvida", async () => {
    const nfse = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${CHAVE}"><nNFSe>27</nNFSe></infNFSe></NFSe>`;
    const r = await lerNfseEmitida(await compactarDocZip(nfse));
    expect(r).toEqual({ xml: nfse, numero: "27", chave: CHAVE });
    await expect(lerNfseEmitida(await compactarDocZip("<outro/>"))).rejects.toThrow(/não é NFS-e/);
  });
  it("caminho no bucket fiscal das notas emitidas", () => {
    expect(caminhoNfseEmitida("o", "c", "2026-11-03", `${CHAVE}.xml`)).toBe(`o/c/nfse-emitidas/2026/11/${CHAVE}.xml`);
  });
});
