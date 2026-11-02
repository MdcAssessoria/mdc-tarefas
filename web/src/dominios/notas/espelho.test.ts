// Testes do montador do espelho da nota (DANFE / DANFSe / DACTE / genérico) com os XMLs fictícios de exemplosXml.ts.
import { describe, expect, it } from "vitest";
import { dataHoraXml, formatarChave, montarEspelho, nomeArquivoEspelho, numeroDanfe } from "./espelho";
import type { BlocoEspelho, Espelho } from "./espelho";
import {
  CHAVE_CTE,
  CHAVE_NFE,
  CHAVE_NFE_COMPLETA,
  CHAVE_NFSE,
  CHAVE_NFSE_COMPLETA,
  NFSE,
  NFSE_ABRASF,
  NFSE_COMPLETA,
  PROC_CTE,
  PROC_NFE,
  PROC_NFE_COMPLETA,
  RES_EVENTO_CANCELAMENTO,
  RES_NFE,
} from "./exemplosXml";

/** Valor de um campo pelo rótulo, procurando em todos os blocos de campos (o primeiro que achar). */
function valor(e: Espelho, rotulo: string, bloco?: string): string | undefined {
  for (const b of e.blocos) {
    if (b.tipo !== "campos" || (bloco && b.titulo !== bloco)) continue;
    for (const l of b.linhas) for (const c of l) if (c.rotulo === rotulo) return c.valor;
  }
  return undefined;
}
const bloco = <T extends BlocoEspelho["tipo"]>(e: Espelho, titulo: string, tipo: T) =>
  e.blocos.find((b) => b.titulo === titulo && b.tipo === tipo) as Extract<BlocoEspelho, { tipo: T }> | undefined;
/** O toLocaleString usa espaço não separável depois do "R$". */
const r = (s: string) => s.replace(/ /g, " ");

describe("formatos do espelho", () => {
  it("chave em blocos de 4, número no padrão do DANFE e data como está no XML", () => {
    expect(formatarChave(CHAVE_NFE)).toBe("3526 1011 2223 3300 0181 5500 1000 0012 3411 2345 6780");
    expect(numeroDanfe("1234")).toBe("000.001.234");
    expect(dataHoraXml("2026-10-20T10:15:00-03:00")).toBe("20/10/2026 10:15");
    expect(dataHoraXml("2026-10-20")).toBe("20/10/2026");
  });
  it("nome do PDF sem acento nem símbolo", () => {
    expect(nomeArquivoEspelho("NFe", "1234", "Fornecedor de Teste & Cia Ltda")).toBe("NFe-1234-Fornecedor-de-Teste-Cia-Ltda.pdf");
    expect(nomeArquivoEspelho("NFSe", null, "Açaí Ltda.")).toBe("NFSe-sn-Acai-Ltda.pdf");
  });
});

describe("espelho da NF-e (DANFE)", () => {
  const e = montarEspelho(PROC_NFE_COMPLETA);

  it("cabeçalho: emitente com endereço, número, série, chave e código de barras", () => {
    expect(e.tipo).toBe("nfe");
    expect(e.sigla).toBe("DANFE");
    expect(e.emitente.nome).toBe("Fornecedor de Teste & Cia Ltda");
    expect(e.emitente.linhas).toEqual([
      "Rua das Indústrias, 1500 - Galpão 3",
      "Distrito Industrial - CEP 12940-000",
      "Atibaia - SP",
      "Fone (11) 4411-2233",
    ]);
    expect(e.identificacao.map((c) => c.valor)).toEqual(["1 - Saída", "000.005.678", "1", "22/10/2026 08:30"]);
    expect(e.chave).toBe(CHAVE_NFE_COMPLETA);
    expect(e.chaveFormatada).toBe(formatarChave(CHAVE_NFE_COMPLETA));
    expect(e.codigoBarras).toBe(true);
    expect(e.aviso).toBeNull();
    expect(e.arquivo).toBe("NFe-5678-Fornecedor-de-Teste-Cia-Ltda.pdf");
    expect(e.titulo).toBe("NF-e 5678 · Fornecedor de Teste & Cia Ltda");
  });

  it("natureza, protocolo, inscrições e destinatário", () => {
    expect(valor(e, "Natureza da operação")).toBe("Venda de mercadoria adquirida de terceiros");
    expect(valor(e, "Protocolo de autorização de uso")).toBe("135260000000777 - 22/10/2026 08:31");
    expect(valor(e, "Inscrição estadual do subst. tributário")).toBe("222222222222");
    expect(valor(e, "CNPJ / CPF do emitente")).toBe("11.222.333/0001-81");
    const dest = "Destinatário / remetente";
    expect(valor(e, "Nome / razão social", dest)).toBe("Empresa de Teste Ltda");
    expect(valor(e, "CNPJ / CPF", dest)).toBe("12.345.678/0001-95");
    expect(valor(e, "Endereço", dest)).toBe("Avenida Central, 200");
    expect(valor(e, "CEP", dest)).toBe("12900-000");
    expect(valor(e, "Município", dest)).toBe("Bragança Paulista");
    expect(valor(e, "Fone / fax", dest)).toBe("(11) 94000-1234");
    expect(valor(e, "Inscrição estadual", dest)).toBe("333333333333");
    expect(valor(e, "Data da saída / entrada", dest)).toBe("22/10/2026");
    expect(valor(e, "Hora da saída / entrada", dest)).toBe("14:05:00");
  });

  it("fatura, duplicatas e forma de pagamento", () => {
    expect(r(valor(e, "Parcela 001")!)).toBe("21/11/2026 · R$ 400,00");
    expect(r(valor(e, "Parcela 002")!)).toBe("21/12/2026 · R$ 400,00");
    expect(valor(e, "Fatura")).toBe("5678");
    expect(r(valor(e, "Forma de pagamento")!)).toBe("Boleto bancário R$ 800,00");
  });

  it("cálculo do imposto com os totais do XML", () => {
    const c = "Cálculo do imposto";
    expect(r(valor(e, "Base de cálculo do ICMS", c)!)).toBe("R$ 650,00");
    expect(r(valor(e, "Valor do ICMS", c)!)).toBe("R$ 108,00");
    expect(r(valor(e, "Valor do IPI", c)!)).toBe("R$ 25,00");
    expect(r(valor(e, "Valor do PIS", c)!)).toBe("R$ 10,73");
    expect(r(valor(e, "Valor da COFINS", c)!)).toBe("R$ 49,40");
    expect(r(valor(e, "Valor do frete", c)!)).toBe("R$ 30,00");
    expect(r(valor(e, "Desconto", c)!)).toBe("R$ 5,00");
    expect(r(valor(e, "Tributos aproximados", c)!)).toBe("R$ 120,00");
    expect(r(valor(e, "Valor total da nota", c)!)).toBe("R$ 800,00");
  });

  it("transportador e volumes somados", () => {
    const t = "Transportador / volumes transportados";
    expect(valor(e, "Nome / razão social", t)).toBe("Transportadora Exemplo Ltda");
    expect(valor(e, "Frete por conta", t)).toBe("0 - Por conta do emitente");
    expect(valor(e, "Placa do veículo", t)).toBe("ABC1D23");
    expect(valor(e, "Código ANTT", t)).toBe("12345678");
    expect(valor(e, "CNPJ / CPF", t)).toBe("99.888.777/0001-66");
    expect(valor(e, "Quantidade", t)).toBe("4");
    expect(valor(e, "Espécie", t)).toBe("CAIXA, FARDO");
    expect(valor(e, "Peso bruto", t)).toBe("53,400 kg");
    expect(valor(e, "Peso líquido", t)).toBe("50,500 kg");
  });

  it("produtos com O/CST, alíquotas e informação adicional do item", () => {
    const p = bloco(e, "Dados dos produtos / serviços", "tabela")!;
    expect(p.colunas.map((c) => c.titulo)).toContain("Alíq. IPI");
    expect(p.linhas).toHaveLength(3);
    const [um, dois, tres] = p.linhas.map((l) => l.map(r));
    expect(um).toEqual([
      "ABC-1",
      "Parafuso sextavado 10mm (cx 100)\nLote 2026-10 · validade indeterminada",
      "73181500",
      "000",
      "5102",
      "CX",
      "10,00",
      "50,00",
      "R$ 500,00",
      "R$ 500,00",
      "R$ 90,00",
      "R$ 25,00",
      "18,00",
      "5,00",
    ]);
    expect(dois.slice(3, 4)).toEqual(["060"]);
    expect(dois.slice(9)).toEqual(["", "", "", "", ""]);
    expect(tres[3]).toBe("200");
    expect(tres[12]).toBe("12,00");
  });

  it("dados adicionais: informações complementares e reservado ao fisco", () => {
    const t = bloco(e, "Dados adicionais · informações complementares", "texto")!;
    expect(t.texto).toContain("Pedido de compra 4521");
    expect(t.texto).toContain("Reservado ao fisco: Documento emitido por ME ou EPP: não.");
  });

  it("NF-e dos testes antigos (sem transporte nem endereço) também monta, com IBS/CBS na linha extra", () => {
    const a = montarEspelho(PROC_NFE);
    expect(a.chave).toBe(CHAVE_NFE);
    expect(r(valor(a, "IBS (reforma)")!)).toBe("R$ 0,50");
    expect(r(valor(a, "CBS (reforma)")!)).toBe("R$ 4,50");
    expect(bloco(a, "Dados adicionais · informações complementares", "texto")).toBeUndefined();
    expect(valor(a, "Frete por conta")).toBe("");
  });

  it("nota cancelada ganha a tarja", () => {
    const cancelada = montarEspelho(PROC_NFE_COMPLETA.replace("<cStat>100</cStat>", "<cStat>101</cStat>"));
    expect(cancelada.aviso).toBe("NF-e CANCELADA");
  });
});

describe("espelho da NFS-e Nacional (DANFSe)", () => {
  const e = montarEspelho(NFSE_COMPLETA);

  it("cabeçalho com prestador, número, competência e chave de 50 dígitos (sem código de barras)", () => {
    expect(e.tipo).toBe("nfse");
    expect(e.sigla).toBe("DANFSe");
    expect(e.emitente.nome).toBe("Consultoria de Teste Ltda");
    expect(e.emitente.linhas).toEqual([
      "Rua do Comércio, 45 - Centro",
      "Atibaia - SP - CEP 12940-100",
      "CNPJ/CPF 11.222.333/0001-81 · IM 12345",
      "Fone (11) 4455-6677 · contato@consultoria.teste",
    ]);
    expect(e.identificacao.map((c) => c.valor)).toEqual(["87", "24/10/2026", "25/10/2026 09:12"]);
    expect(e.chave).toBe(CHAVE_NFSE_COMPLETA);
    expect(e.codigoBarras).toBe(false);
    expect(e.arquivo).toBe("NFSe-87-Consultoria-de-Teste-Ltda.pdf");
  });

  it("tomador com endereço nacional, serviço, locais e descrição completa", () => {
    const t = "Tomador do serviço";
    expect(valor(e, "Nome / razão social", t)).toBe("Empresa de Teste Ltda");
    expect(valor(e, "CNPJ / CPF", t)).toBe("12.345.678/0001-95");
    expect(valor(e, "Endereço", t)).toBe("Avenida Central, 200 - Centro");
    expect(valor(e, "CEP", t)).toBe("12900-000");
    expect(valor(e, "E-mail", t)).toBe("financeiro@empresa.teste");
    expect(valor(e, "Código de tributação nacional")).toBe("170101 - Assessoria ou consultoria de qualquer natureza");
    expect(valor(e, "Código NBS")).toBe("113011000");
    expect(valor(e, "Local da prestação")).toBe("Bragança Paulista - 3507605");
    expect(valor(e, "Município de incidência do ISSQN")).toBe("Bragança Paulista");
    const d = bloco(e, "Descrição do serviço", "texto")!;
    expect(d.texto).toContain("- reunião mensal com a diretoria (4 horas);\n- relatório de indicadores.");
  });

  it("ISSQN retido, retenções federais e valor líquido", () => {
    expect(valor(e, "Retenção do ISSQN")).toBe("Retido pelo tomador");
    expect(valor(e, "Tributação do ISSQN")).toBe("Operação tributável");
    expect(r(valor(e, "Base de cálculo")!)).toBe("R$ 5.000,00");
    expect(valor(e, "Alíquota")).toBe("2,00%");
    expect(r(valor(e, "ISSQN apurado")!)).toBe("R$ 100,00");
    expect(r(valor(e, "ISSQN retido")!)).toBe("R$ 100,00");
    expect(r(valor(e, "PIS (retido)")!)).toBe("R$ 32,50");
    expect(r(valor(e, "COFINS (retida)")!)).toBe("R$ 150,00");
    expect(r(valor(e, "IRRF retido")!)).toBe("R$ 75,00");
    expect(r(valor(e, "CSLL retida")!)).toBe("R$ 50,00");
    expect(r(valor(e, "Retenções federais")!)).toBe("R$ 307,50");
    expect(r(valor(e, "Valor líquido da NFS-e")!)).toBe("R$ 4.592,50");
    expect(bloco(e, "Informações complementares", "texto")!.texto).toContain("Contrato 2026/015");
  });

  it("NFS-e dos testes antigos (sem endereço) monta sem quebrar", () => {
    const a = montarEspelho(NFSE);
    expect(a.chave).toBe(CHAVE_NFSE);
    expect(valor(a, "Retenção do ISSQN")).toBe("Não retido");
    expect(r(valor(a, "Valor líquido da NFS-e")!)).toBe("R$ 1.930,00");
  });

  it("lote com várias NFS-e: escolhe a da chave pedida", () => {
    const lote = `<Lote>${NFSE.replace(/<\?xml[^>]*>/, "")}${NFSE_COMPLETA.replace(/<\?xml[^>]*>/, "")}</Lote>`;
    expect(montarEspelho(lote, { chave: CHAVE_NFSE_COMPLETA }).identificacao[0].valor).toBe("87");
    expect(montarEspelho(lote, { chave: CHAVE_NFSE }).identificacao[0].valor).toBe("52");
  });
});

describe("espelho da NFS-e municipal (ABRASF)", () => {
  const e = montarEspelho(NFSE_ABRASF);
  it("número, código de verificação, prestador, tomador e valores", () => {
    expect(e.tipo).toBe("nfse");
    expect(e.chave).toBeNull();
    expect(e.identificacao.map((c) => c.valor)).toEqual(["321", "AB12-CD34", "18/10/2026 11:00"]);
    expect(e.emitente.nome).toBe("Manutenção Municipal de Teste Ltda");
    expect(valor(e, "CNPJ / CPF", "Prestador do serviço")).toBe("11.222.333/0001-81");
    expect(valor(e, "Inscrição municipal", "Prestador do serviço")).toBe("9988");
    expect(valor(e, "Nome / razão social", "Tomador do serviço")).toBe("Empresa de Teste Ltda");
    expect(valor(e, "RPS (número / série)")).toBe("77 / A");
    expect(valor(e, "Item da lista de serviços (LC 116)")).toBe("14.01");
    expect(valor(e, "Alíquota")).toBe("5,00%");
    expect(r(valor(e, "ISS retido")!)).toBe("Sim · R$ 75,00");
    expect(r(valor(e, "Valor líquido da NFS-e")!)).toBe("R$ 1.425,00");
    expect(bloco(e, "Descrição do serviço", "texto")!.texto).toBe("Manutenção preventiva de compressor de ar");
  });
});

describe("espelho do CT-e, do resumo e genérico", () => {
  it("CT-e vira DACTE com chave, código de barras, participantes e valores", () => {
    const e = montarEspelho(PROC_CTE);
    expect(e.tipo).toBe("cte");
    expect(e.sigla).toBe("DACTE");
    expect(e.chave).toBe(CHAVE_CTE);
    expect(e.codigoBarras).toBe(true);
    expect(valor(e, "Remetente")).toBe("Fornecedor de Teste & Cia Ltda");
    expect(valor(e, "Tomador do serviço")).toBe("Destinatário");
    expect(r(valor(e, "Valor total da prestação")!)).toBe("R$ 30,00");
    expect(r(valor(e, "Valor do ICMS")!)).toBe("R$ 3,60");
    expect(bloco(e, "Documentos transportados (chaves)", "tabela")!.linhas[0][0]).toBe(formatarChave(CHAVE_NFE_COMPLETA));
  });

  it("resumo da NF-e explica que o XML completo chega depois", () => {
    const e = montarEspelho(RES_NFE);
    expect(e.tipo).toBe("resumo");
    expect(e.chave).toBe(CHAVE_NFE);
    expect(r(valor(e, "Valor total da nota")!)).toBe("R$ 635,00");
    expect(bloco(e, "Por que só o resumo?", "texto")).toBeDefined();
  });

  it("XML sem layout próprio lista os campos", () => {
    const e = montarEspelho(RES_EVENTO_CANCELAMENTO);
    expect(e.tipo).toBe("outro");
    expect(e.chave).toBe(CHAVE_NFE);
    const campos = bloco(e, "Campos do XML", "tabela")!;
    expect(campos.linhas).toContainEqual(["resEvento › xEvento", "Cancelamento"]);
  });

  it("layout próprio que falha cai no genérico com o motivo", () => {
    const e = montarEspelho(PROC_NFE.replace(/Id="NFe\d+"/, 'Id="NFe123"').replace(/<chNFe>\d+<\/chNFe>/, ""));
    expect(e.tipo).toBe("outro");
    expect(bloco(e, "Aviso", "texto")!.texto).toContain("Chave de acesso da NF-e não encontrada");
  });

  it("arquivo que não é XML: erro em português", () => {
    expect(() => montarEspelho("isto não é xml")).toThrow(/XML/);
  });
});
