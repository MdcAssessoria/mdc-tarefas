// Testes das regras puras das notas de entrada (XMLs fictícios em exemplosXml.ts).
import { describe, expect, it } from "vitest";
import { decodificarEntidades, lerXml, txt } from "./xml";
import { direcaoParaEmpresa, lerDocumento, lerVariasNotas, notaDaEmpresa } from "./documentos";
import {
  compactarDocZip,
  dataHoraEvento,
  descompactarDocZip,
  idEvento,
  justificativaValida,
  lerRetornoAdn,
  lerRetornoDistDFe,
  lerRetornoEvento,
  montarDistDFe,
  montarEnvioEventos,
  montarInfEvento,
  urlAdn,
} from "./sefaz";
import {
  decidirAdn,
  decidirDistDFe,
  manifestacoesPermitidas,
  podeConsultar,
  prazosDaNota,
  proximaSequencia,
  situacaoDaNota,
} from "./regras";
import { creditoDoItem, creditosDaNota, regraVigente } from "./creditos";
import type { RegraCredito } from "./creditos";
import { regraDoTipo, sugerirTipoEntrada, TIPOS_ENTRADA } from "./tiposEntrada";
import {
  CHAVE_NFE,
  CHAVE_NFSE,
  CNPJ_EMPRESA,
  CNPJ_FORNECEDOR,
  NFSE,
  PROC_NFE,
  RES_EVENTO_CANCELAMENTO,
  RES_NFE,
  RET_DIST,
  RET_EVENTO,
} from "./exemplosXml";

describe("leitor de XML", () => {
  it("lê elementos, atributos com '>' e entidades, sem prefixo de namespace", () => {
    const r = lerXml(
      `<?xml version="1.0"?><!-- x --><a:raiz xmlns:a="urn:x" b="1 > 0"><a:f>T &amp; S &#233;</a:f><g/><![CDATA[<cru>]]></a:raiz>`,
    );
    expect(r.nome).toBe("raiz");
    expect(r.atributos.b).toBe("1 > 0");
    expect(txt(r, "f")).toBe("T & S é");
    expect(r.texto).toBe("<cru>");
    expect(r.filhos.map((f) => f.nome)).toEqual(["f", "g"]);
  });
  it("recusa XML quebrado com mensagem em português", () => {
    expect(() => lerXml("<a><b></a>")).toThrow(/fecha o elemento errado/);
    expect(() => lerXml("<a>")).toThrow(/não foi fechado/);
    expect(() => lerXml("texto")).toThrow(/não tem conteúdo XML/);
  });
});

describe("NF-e completa (procNFe)", () => {
  const d = lerDocumento(PROC_NFE);
  if (d.tipo !== "nota") throw new Error("esperava nota");
  const n = d.nota;
  it("cabeçalho, emitente, valores e impostos", () => {
    expect(n.chave).toBe(CHAVE_NFE);
    expect(n.modelo).toBe("55");
    expect(n.conteudo).toBe("completa");
    expect([n.numero, n.serie, n.situacao, n.protocolo]).toEqual(["1234", "1", "autorizada", "135260000000001"]);
    expect(n.emitente_nome).toBe("Fornecedor de Teste & Cia Ltda");
    expect(n.emitente_uf).toBe("SP");
    expect(n.destinatario_doc).toBe(CNPJ_EMPRESA);
    expect([n.valor_total, n.icms_valor, n.ipi_valor, n.pis_valor, n.cofins_valor]).toEqual([635, 91.8, 25, 8.25, 38]);
    expect([n.ibs_valor, n.cbs_valor]).toEqual([0.5, 4.5]);
    expect(n.cfop_principal).toBe("5102");
  });
  it("itens com CST, IPI, GTIN e duplicatas", () => {
    expect(n.itens).toHaveLength(2);
    expect(n.itens[0]).toMatchObject({
      codigo: "ABC-1",
      gtin: null,
      ncm: "73181500",
      quantidade: 10,
      icms_valor: 91.8,
      ipi_valor: 25,
      pis_cst: "01",
    });
    expect(n.itens[1]).toMatchObject({ gtin: "7890000000017", icms_cst: "60", pis_cst: "04", pis_valor: 0 });
    expect(n.duplicatas).toEqual([
      { numero: "001", vencimento: "2026-11-20", valor: 317.5 },
      { numero: "002", vencimento: "2026-12-20", valor: 317.5 },
    ]);
  });
  it("direção e dono da nota pelo CNPJ", () => {
    expect(direcaoParaEmpresa(n, CNPJ_EMPRESA)).toBe("entrada");
    expect(direcaoParaEmpresa(n, CNPJ_FORNECEDOR)).toBe("saida");
    expect(notaDaEmpresa(n, "12345678000276")).toBe(true); // filial: mesmo CNPJ raiz
    expect(notaDaEmpresa(n, "99999999000191")).toBe(false);
  });
});

describe("resumo, evento e NFS-e", () => {
  it("resNFe vira nota só-resumo com número e série pela chave", () => {
    const d = lerDocumento(RES_NFE);
    expect(d.tipo).toBe("nota");
    if (d.tipo === "nota") expect(d.nota).toMatchObject({ conteudo: "resumo", numero: "1234", serie: "1", valor_total: 635, itens: [] });
  });
  it("resEvento de cancelamento", () => {
    const d = lerDocumento(RES_EVENTO_CANCELAMENTO);
    expect(d.tipo).toBe("evento");
    if (d.tipo === "evento") expect(d.evento).toMatchObject({ chave: CHAVE_NFE, tpEvento: "110111", protocolo: "135260000000099" });
  });
  it("NFS-e nacional: serviço, ISS, retenções e tomador", () => {
    const [n] = lerVariasNotas(NFSE);
    expect(CHAVE_NFSE).toHaveLength(50);
    expect(n).toMatchObject({ modelo: "nfse", chave: CHAVE_NFSE, numero: "52", valor_total: 2000, iss_valor: 40, iss_retido: false });
    expect(n.retencoes).toBe(143); // IR 30 + CSLL 40 + PIS 13 + COFINS 60 retidos (tpRetPisCofins 1)
    expect(n.destinatario_doc).toBe(CNPJ_EMPRESA);
    expect(n.itens[0].descricao).toBe("Assessoria em gestão");
    expect(direcaoParaEmpresa(n, CNPJ_EMPRESA)).toBe("entrada");
  });
  it("arquivo que não é nota é recusado", () => {
    expect(() => lerVariasNotas("<outra><x/></outra>")).toThrow(/não traz uma nota/);
  });
});

describe("SOAP da SEFAZ", () => {
  it("distDFeInt por NSU e por chave", () => {
    const r = montarDistDFe({ ambiente: "homologacao", uf: "SP", cnpj: "12.345.678/0001-95", ultNSU: 42 });
    expect(r.url).toContain("hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe");
    expect(r.contentType).toContain('action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"');
    expect(r.corpo).toContain(
      "<tpAmb>2</tpAmb><cUFAutor>35</cUFAutor><CNPJ>12345678000195</CNPJ><distNSU><ultNSU>000000000000042</ultNSU></distNSU>",
    );
    expect(montarDistDFe({ ambiente: "producao", uf: "MG", cnpj: CNPJ_EMPRESA, chave: CHAVE_NFE }).corpo).toContain(
      `<consChNFe><chNFe>${CHAVE_NFE}</chNFe>`,
    );
    expect(() => montarDistDFe({ ambiente: "producao", uf: "", cnpj: CNPJ_EMPRESA })).toThrow(/UF da empresa/);
  });
  it("lê o retorno e descompacta os docZip", async () => {
    const zip = await compactarDocZip(RES_NFE);
    const r = lerRetornoDistDFe(RET_DIST([{ nsu: 43, schema: "resNFe_v1.01.xsd", zip }], "138", 43, 50));
    expect([r.cStat, r.ultNSU, r.maxNSU]).toEqual(["138", 43, 50]);
    expect(r.documentos[0]).toMatchObject({ nsu: 43, schema: "resNFe_v1.01.xsd" });
    expect(await descompactarDocZip(r.documentos[0].conteudo)).toBe(RES_NFE);
  });
  it("SOAP Fault vira erro em português", () => {
    const fault = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault><s:Reason><s:Text>Certificado inválido</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
    expect(() => lerRetornoDistDFe(fault)).toThrow(/A SEFAZ recusou a consulta: Certificado inválido/);
  });
  it("evento: Id, forma canônica com namespace, justificativa e lote", () => {
    const base = {
      ambiente: "producao" as const,
      cnpj: CNPJ_EMPRESA,
      chave: CHAVE_NFE,
      sequencia: 1,
      dhEvento: "2026-11-01T10:00:00-03:00",
    };
    const inf = montarInfEvento({ ...base, tipo: "ciencia" });
    expect(inf).toContain(`Id="${idEvento("210210", CHAVE_NFE, 1)}"`);
    expect(inf).toContain("<cOrgao>91</cOrgao><tpAmb>1</tpAmb>");
    expect(inf).toContain('<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>');
    expect(montarInfEvento({ ...base, tipo: "ciencia" }, true)).toMatch(/^<infEvento xmlns="http:\/\/www.portalfiscal.inf.br\/nfe" Id=/);
    expect(() => montarInfEvento({ ...base, tipo: "nao_realizada", justificativa: "curta" })).toThrow(/15 a 255/);
    expect(montarInfEvento({ ...base, tipo: "nao_realizada", justificativa: "Mercadoria recusada na entrega & devolvida" })).toContain(
      "<xJust>Mercadoria recusada na entrega &amp; devolvida</xJust>",
    );
    expect(() => montarEnvioEventos("producao", "1", Array(21).fill("<evento/>"))).toThrow(/1 a 20/);
    expect(montarEnvioEventos("producao", "123", ["<evento/>"]).url).toBe(
      "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
    );
  });
  it("lê o retorno do evento com protocolo", () => {
    const r = lerRetornoEvento(RET_EVENTO);
    expect(r.cStat).toBe("128");
    expect(r.eventos[0]).toMatchObject({ cStat: "135", protocolo: "891260000000123", tpEvento: "210200", chave: CHAVE_NFE });
    expect(r.eventos[0].xml).toMatch(/^<retEvento/);
  });
  it("data do evento no horário de Brasília e justificativa", () => {
    expect(dataHoraEvento(new Date("2026-11-01T13:05:09Z"))).toBe("2026-11-01T10:05:09-03:00");
    expect(justificativaValida("  pouco  ")).toBe(false);
    expect(justificativaValida("x".repeat(256))).toBe(false);
    expect(justificativaValida("Mercadoria não chegou")).toBe(true);
  });
});

describe("ADN da NFS-e", () => {
  it("endereço e leitura do lote", () => {
    expect(urlAdn("homologacao", 10, "12.345.678/0001-95")).toBe(
      "https://adn.producaorestrita.nfse.gov.br/contribuintes/DFe/10?cnpjConsulta=12345678000195&lote=true",
    );
    const r = lerRetornoAdn({
      StatusProcessamento: "DOCUMENTOS_LOCALIZADOS",
      LoteDFe: [
        { NSU: 12, ChaveAcesso: "b", TipoDocumento: "NFSE", ArquivoXml: "BB" },
        { NSU: 11, ChaveAcesso: "a", TipoDocumento: "NFSE", ArquivoXml: "AA" },
      ],
    });
    expect(r.documentos.map((d) => d.nsu)).toEqual([11, 12]);
    expect(lerRetornoAdn({ Erros: [{ Codigo: "E1", Descricao: "Falhou" }] }).erros).toEqual(["E1 · Falhou"]);
  });
});

describe("prazos e situação da manifestação", () => {
  const base = { modelo: "55", direcao: "entrada", situacao: "autorizada", manifestacao: null, emissao: null };
  it("prazo conclusivo de 180 dias até 31/05/2026 e de 90 dias depois (Ajuste SINIEF 14/26)", () => {
    expect(prazosDaNota("2026-05-10T10:00:00-03:00")?.conclusiva).toBe("2026-11-06");
    expect(prazosDaNota("2026-10-20T10:00:00-03:00")).toMatchObject({ ciencia: "2026-10-30", conclusiva: "2027-01-18" });
  });
  it("situação em linguagem simples", () => {
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20" }, "2026-11-01").id).toBe("aguardando");
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20" }, "2027-01-10")).toMatchObject({ id: "prazo_vencendo", diasRestantes: 8 });
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20" }, "2027-02-01").id).toBe("prazo_encerrado");
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20", manifestacao: "ciencia" }, "2026-11-01").id).toBe("aguardando");
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20", manifestacao: "confirmada" }, "2026-11-01").id).toBe("confirmada");
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20", manifestacao: "nao_realizada" }, "2026-11-01").id).toBe("recusada");
    expect(situacaoDaNota({ ...base, autorizacao: "2026-10-20", situacao: "cancelada" }, "2026-11-01").id).toBe("cancelada");
    expect(situacaoDaNota({ ...base, modelo: "nfse", autorizacao: "2026-10-20" }, "2026-11-01").id).toBe("recebida");
  });
  it("manifestações permitidas e sequência", () => {
    const n = { ...base, autorizacao: "2026-10-20" };
    expect(manifestacoesPermitidas(n, "2026-10-25").map((x) => x.tipo)).toEqual(["ciencia", "confirmada", "desconhecida", "nao_realizada"]);
    expect(manifestacoesPermitidas(n, "2026-11-05").map((x) => x.tipo)).toEqual(["confirmada", "desconhecida", "nao_realizada"]);
    const confirmada = {
      ...n,
      manifestacao: "confirmada" as const,
      eventos: [{ tipo: "confirmada" as const }, { tipo: "desconhecida" as const }, { tipo: "desconhecida" as const }],
    };
    expect(manifestacoesPermitidas(confirmada, "2026-11-05").map((x) => x.tipo)).toEqual(["nao_realizada"]);
    expect(manifestacoesPermitidas(n, "2027-03-01")).toEqual([]);
    expect(proximaSequencia([{ tipo: "confirmada" }], "confirmada")).toBe(2);
  });
});

describe("controle da captura (NT 2014.002)", () => {
  const agora = new Date("2026-11-01T12:00:00Z");
  it("138 com mais documentos continua; 137 e fim do lote esperam 1 hora; 656 bloqueia", () => {
    expect(decidirDistDFe({ cStat: "138", ultNSU: 50, maxNSU: 120 }, agora).continuar).toBe(true);
    expect(decidirDistDFe({ cStat: "138", ultNSU: 120, maxNSU: 120 }, agora)).toMatchObject({
      continuar: false,
      proximaConsulta: "2026-11-01T13:00:00.000Z",
    });
    expect(decidirDistDFe({ cStat: "137", ultNSU: 120, maxNSU: 120 }, agora).proximaConsulta).toBe("2026-11-01T13:00:00.000Z");
    const b = decidirDistDFe({ cStat: "656", xMotivo: "Consumo Indevido", ultNSU: 0, maxNSU: 0 }, agora);
    expect(b).toMatchObject({ continuar: false, bloqueadoAte: "2026-11-01T13:00:00.000Z" });
    expect(b.erro).toMatch(/bloqueou/);
    expect(decidirDistDFe({ cStat: "593", ultNSU: 0, maxNSU: 0 }, agora).erro).toContain("593");
  });
  it("ADN: lote cheio continua", () => {
    expect(decidirAdn({ quantidade: 50, status: "DOCUMENTOS_LOCALIZADOS" }, agora).continuar).toBe(true);
    expect(decidirAdn({ quantidade: 3, status: "DOCUMENTOS_LOCALIZADOS" }, agora).continuar).toBe(false);
  });
  it("só consulta depois da hora marcada e fora do bloqueio", () => {
    expect(podeConsultar({ proxima_consulta_em: null, bloqueado_ate: null }, agora)).toBe(true);
    expect(podeConsultar({ proxima_consulta_em: "2026-11-01T12:30:00Z", bloqueado_ate: null }, agora)).toBe(false);
    expect(podeConsultar({ proxima_consulta_em: "2026-11-01T11:00:00Z", bloqueado_ate: "2026-11-01T12:10:00Z" }, agora)).toBe(false);
  });
});

describe("créditos estimados por regime (regras da tabela, com vigência)", () => {
  const regra = (p: Partial<RegraCredito>): RegraCredito => ({
    id: Math.random(),
    org_id: null,
    regime: "real",
    tributo: "pis",
    forma: "nenhum",
    aliquota: null,
    base: null,
    tipos_entrada: null,
    condicao: null,
    cst_sem_credito: null,
    explicacao: "x",
    fonte_legal: "x",
    vigencia_inicio: "2015-01-01",
    vigencia_fim: null,
    ...p,
  });
  const cst = ["04", "05", "06", "07", "08", "09"];
  const REGRAS: RegraCredito[] = [
    regra({ regime: "simples", tributo: "icms" }),
    regra({ regime: "simples", tributo: "pis" }),
    regra({ regime: "presumido", tributo: "pis" }),
    regra({
      regime: "presumido",
      tributo: "icms",
      forma: "destacado",
      condicao: "contribuinte_icms",
      tipos_entrada: ["revenda", "materia_prima"],
    }),
    regra({
      regime: "real",
      tributo: "icms",
      forma: "destacado",
      condicao: "contribuinte_icms",
      tipos_entrada: ["revenda", "materia_prima"],
    }),
    regra({ regime: "real", tributo: "ipi", forma: "destacado", condicao: "contribuinte_ipi", tipos_entrada: ["materia_prima"] }),
    regra({
      tributo: "pis",
      forma: "aliquota",
      aliquota: 1.65,
      base: "item",
      tipos_entrada: ["revenda"],
      cst_sem_credito: cst,
      vigencia_fim: "2023-05-29",
    }),
    regra({
      tributo: "pis",
      forma: "aliquota",
      aliquota: 1.65,
      base: "item_sem_icms",
      tipos_entrada: ["revenda"],
      cst_sem_credito: cst,
      vigencia_inicio: "2023-05-30",
    }),
    regra({
      tributo: "cofins",
      forma: "aliquota",
      aliquota: 7.6,
      base: "item_sem_icms",
      tipos_entrada: ["revenda"],
      cst_sem_credito: cst,
      vigencia_inicio: "2023-05-30",
    }),
  ];
  const d = lerDocumento(PROC_NFE);
  const itens = d.tipo === "nota" ? d.nota.itens : [];
  const ctx = { regime: "real", tipoEntrada: "revenda", data: "2026-10-20", contribuinteIcms: true, contribuinteIpi: false };

  it("Lucro Real: PIS 1,65% e COFINS 7,6% sem o ICMS na base; ICMS destacado; item monofásico sem crédito", () => {
    // base item 1 = 500 + 20 frete − 10 desconto + 25 IPI − 91,80 ICMS = 443,20
    expect(creditoDoItem(itens[0], "pis", ctx, REGRAS).valor).toBe(7.31);
    expect(creditoDoItem(itens[0], "cofins", ctx, REGRAS).valor).toBe(33.68);
    expect(creditoDoItem(itens[1], "pis", ctx, REGRAS)).toMatchObject({ valor: 0, motivo: expect.stringMatching(/CST 04/) });
    const r = creditosDaNota(itens, ctx, REGRAS);
    expect(r.porTributo).toMatchObject({ icms: 91.8, ipi: 0, pis: 7.31, cofins: 33.68 });
    expect(r.total).toBe(132.79);
  });
  it("vigência: antes de 30/05/2023 o ICMS ficava na base", () => {
    expect(creditoDoItem(itens[0], "pis", { ...ctx, data: "2023-01-10" }, REGRAS).valor).toBe(8.83); // 535 × 1,65%
  });
  it("Simples e Presumido sem crédito de PIS/COFINS; ICMS só para contribuinte", () => {
    expect(creditosDaNota(itens, { ...ctx, regime: "simples" }, REGRAS).total).toBe(0);
    expect(creditosDaNota(itens, { ...ctx, regime: "presumido" }, REGRAS).porTributo).toMatchObject({ icms: 91.8, pis: 0 });
    expect(creditosDaNota(itens, { ...ctx, regime: "presumido", contribuinteIcms: false }, REGRAS).total).toBe(0);
    expect(creditoDoItem(itens[0], "pis", { ...ctx, regime: null }, REGRAS).motivo).toMatch(/Regime/);
    expect(creditoDoItem(itens[0], "icms", { ...ctx, tipoEntrada: "uso_consumo" }, REGRAS).valor).toBe(0);
  });
  it("regra da organização tem preferência sobre a geral", () => {
    const org = regra({ org_id: "o1", tributo: "pis", forma: "nenhum", vigencia_inicio: "2024-01-01" });
    expect(regraVigente([...REGRAS, org], "real", "pis", "2026-10-20", "o1")).toBe(org);
    expect(regraVigente([...REGRAS, org], "real", "pis", "2026-10-20", "o2")?.forma).toBe("aliquota");
  });
});

describe("tipo de entrada", () => {
  it("sugere pelo CFOP do fornecedor e pelo modelo", () => {
    expect(sugerirTipoEntrada("nfse", [])).toBe("servico");
    expect(sugerirTipoEntrada("55", ["6202"])).toBe("devolucao_venda");
    expect(sugerirTipoEntrada("55", ["5910"])).toBe("remessa");
    expect(sugerirTipoEntrada("55", ["5102"])).toBe("revenda");
    expect(sugerirTipoEntrada("55", ["5102"], "materia_prima")).toBe("materia_prima");
    expect(TIPOS_ENTRADA).toHaveLength(7);
  });
  it("regra da empresa › organização › geral", () => {
    const geral = { org_id: null, cliente_id: null, codigo: "remessa", movimenta_estoque: false, gera_pagar: false, categoria_id: null };
    const org = { ...geral, org_id: "o1", movimenta_estoque: true };
    const emp = { ...geral, org_id: "o1", cliente_id: "c1", gera_pagar: true, categoria_id: "cat" };
    expect(regraDoTipo([geral], "remessa", "c1", "o1")).toEqual({ movimenta_estoque: false, gera_pagar: false, categoria_id: null });
    expect(regraDoTipo([geral, org], "remessa", "c1", "o1").movimenta_estoque).toBe(true);
    expect(regraDoTipo([geral, org, emp], "remessa", "c1", "o1")).toEqual({
      movimenta_estoque: false,
      gera_pagar: true,
      categoria_id: "cat",
    });
    expect(regraDoTipo([], "revenda", "c1", "o1").movimenta_estoque).toBe(true);
  });
});

describe("entidades do XML", () => {
  it("converte entidades válidas e mantém as fora do Unicode sem derrubar a leitura", () => {
    expect(decodificarEntidades("A &amp; B &#65;&#x42; &#x10FFFF;")).toBe("A & B AB \u{10FFFF}");
    expect(decodificarEntidades("x &#x110000; y")).toBe("x &#x110000; y");
    expect(decodificarEntidades("&#99999999999;")).toBe("&#99999999999;");
    expect(txt(lerXml("<a><b>ok &#x110000;</b></a>"), "b")).toBe("ok &#x110000;");
  });
});
