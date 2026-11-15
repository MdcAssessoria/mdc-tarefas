// Testes do contrato de licença: preenchimento do modelo, frases de valor/reajuste/assinatura e conferências.
import { describe, expect, it } from "vitest";
import {
  MODELO_PADRAO,
  conferirModelo,
  conferirSignatario,
  preencher,
  sistemaDaLicenca,
  textoRegistroAssinatura,
  valoresDoContrato,
  variaveisDesconhecidas,
  type DadosContratoLicenca,
} from "./contratoLicenca";

const produtos = new Map([
  ["a", { nome: "Financeiro", descricao: "Contas a pagar e a receber.", sistema: "ledgra" as const }],
  ["b", { nome: "Estoque", descricao: "", sistema: "ledgra" as const }],
  ["h", { nome: "Portal", descricao: "Portal do cliente", sistema: "hub" as const }],
]);

const base: DadosContratoLicenca = {
  numero: "LIC-2026/0001",
  contrato: {
    modalidade: "pacote",
    plano_id: "p",
    produtos: ["a", "b"],
    valor_mensal: 390,
    valor_tabela: 450,
    dia_vencimento: 10,
    inicio: "2026-12-01",
    fim: null,
    proporcional: true,
    reajuste_indice: "IPCA",
    reajuste_mes: 12,
  },
  cliente: { razao_social: "Liberato Comércio Ltda", cnpj: "11222333000181", cidade: "Atibaia", uf: "SP" },
  produtos,
  plano: { nome: "Gestão completa" },
  signatario: { nome: "Maria da Silva", cpf: "52998224725", cargo: "sócia-administradora", email: "maria@ex.com" },
  modo: "eletronico",
  diasBloqueio: 30,
  hoje: "2026-11-15",
};

describe("contrato de licença", () => {
  it("o modelo-padrão só usa variáveis conhecidas e passa na conferência", () => {
    expect(variaveisDesconhecidas(MODELO_PADRAO)).toEqual([]);
    expect(conferirModelo(MODELO_PADRAO)).toBeNull();
  });

  it("preenche tudo, sem sobrar variável", () => {
    const t = preencher(MODELO_PADRAO, valoresDoContrato(base));
    expect(t).not.toMatch(/\{\{/);
    expect(t).toContain("LIBERATO COMÉRCIO LTDA");
    expect(t).toContain("CNPJ 11.222.333/0001-81");
    expect(t).toContain("Atibaia/SP");
    expect(t).toContain("CPF 529.982.247-25");
    expect(t).toContain("- **Financeiro**: Contas a pagar e a receber.");
    expect(t).toContain("- **Estoque**.");
    expect(t).toContain("por mês (plano Gestão completa)");
    expect(t).toContain("IPCA/IBGE");
    expect(t).toContain("em dezembro");
    expect(t).toContain("proporcionalmente");
    expect(t).toContain("15 de novembro de 2026");
    expect(t).toContain("art. 10, § 2º");
    expect(t).toContain("link enviado");
  });

  it("licença gratuita não fala de valor nem de reajuste por índice", () => {
    const v = valoresDoContrato({ ...base, contrato: { ...base.contrato, modalidade: "gratuita", valor_mensal: 0 } });
    expect(v.valor).toContain("sem custo mensal");
    expect(v.reajuste).toContain("não tem reajuste automático");
  });

  it("assinatura impressa fala de duas vias", () => {
    expect(valoresDoContrato({ ...base, modo: "impresso" }).assinatura).toContain("2 (duas) vias");
  });

  it("prazo determinado e sistema pelos módulos", () => {
    expect(valoresDoContrato({ ...base, contrato: { ...base.contrato, fim: "2027-11-30" } }).vigencia).toContain("até 30/11/2027");
    expect(sistemaDaLicenca(["a"], produtos)).toBe("Ledgra");
    expect(sistemaDaLicenca(["h"], produtos)).toBe("HUB-MDC");
    expect(sistemaDaLicenca(["a", "h"], produtos)).toBe("Ledgra e HUB-MDC");
  });

  it("acusa variável escrita errado e modelo sem o nome do cliente", () => {
    expect(conferirModelo(MODELO_PADRAO + " {{valor_mensl}}")).toContain("{{valor_mensl}}");
    expect(conferirModelo(MODELO_PADRAO.replaceAll("{{contratante_razao}}", "X"))).toContain("contratante_razao");
  });

  it("confere quem assina", () => {
    expect(conferirSignatario(base.signatario, "eletronico")).toBeNull();
    expect(conferirSignatario({ ...base.signatario, nome: "Maria" }, "impresso")).toContain("nome completo");
    expect(conferirSignatario({ ...base.signatario, cpf: "123" }, "impresso")).toContain("CPF");
    expect(conferirSignatario({ ...base.signatario, email: "maria@" }, "eletronico")).toContain("e-mail");
  });

  it("registro da assinatura eletrônica traz CPF, IP e o código de integridade", () => {
    const t = textoRegistroAssinatura({
      numero: "LIC-2026/0001",
      hash: "abc123",
      assinado_em: "2026-11-16T13:00:00Z",
      assinatura: {
        tipo: "eletronico",
        nome: "Maria da Silva",
        cpf: "52998224725",
        ip: "200.1.2.3",
        navegador: "Chrome",
        em: "2026-11-16T13:00:00Z",
      },
    });
    expect(t).toContain("CPF 529.982.247-25");
    expect(t).toContain("200.1.2.3");
    expect(t).toContain("abc123");
    expect(t).toContain("16/11/2026");
  });
});

describe("e-mail do link de assinatura", () => {
  it("monta o mailto com destinatário, assunto e o link no texto", async () => {
    const { emailAssinatura } = await import("./documentos");
    const m = emailAssinatura({
      para: " maria@ex.com ",
      nome: "Maria da Silva",
      numero: "LIC-2026/0001",
      cliente: "Liberato Comércio Ltda",
      link: "https://hub.mdcassessoria.com/hub-mdc/assinar/abc",
      validoAte: "30/11/2026",
      saudacao: "Boa noite",
    });
    expect(m.startsWith("mailto:maria%40ex.com?subject=")).toBe(true);
    const corpo = decodeURIComponent(m.split("&body=")[1]);
    expect(corpo).toContain("Boa noite, Maria!");
    expect(corpo).toContain("https://hub.mdcassessoria.com/hub-mdc/assinar/abc");
    expect(corpo).toContain("30/11/2026");
    expect(decodeURIComponent(m.split("subject=")[1].split("&")[0])).toBe(
      "Contrato de licença LIC-2026/0001 para assinatura · MDC Assessoria",
    );
  });
});

describe("filtro pela situação do contrato", () => {
  it("separa sem contrato, falta assinar e assinado", async () => {
    const { noFiltroContrato, textoContratoLista } = await import("./contratoLicenca");
    expect(noFiltroContrato(undefined, "sem")).toBe(true);
    expect(noFiltroContrato({ situacao: "emitido" }, "sem")).toBe(false);
    expect(noFiltroContrato({ situacao: "enviado" }, "falta")).toBe(true);
    expect(noFiltroContrato({ situacao: "emitido" }, "falta")).toBe(true);
    expect(noFiltroContrato({ situacao: "assinado" }, "falta")).toBe(false);
    expect(noFiltroContrato({ situacao: "assinado" }, "assinado")).toBe(true);
    expect(noFiltroContrato(undefined, "todos")).toBe(true);
    expect(textoContratoLista(undefined)).toBe("Sem contrato");
    expect(textoContratoLista({ numero: "LIC-2026/0001", situacao: "assinado" })).toBe("LIC-2026/0001 · Assinado");
  });
});
