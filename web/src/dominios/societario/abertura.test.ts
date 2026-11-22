// Testa a ficha de abertura: bloqueios por regime × CNAE × porte × sócios, avisos, faltas, quotas e documentos.
import { describe, expect, it } from "vitest";
import { conferirAbertura, documentosEsperados, formatarCnae, numeroDigitado, numeroParaCampo, quotas, resumoFicha, somaPercentuais } from "./abertura";
import type { FichaAbertura, RestricaoCnae, SocioAbertura } from "./abertura";
import { filtrarCnaes, ibgeDoMunicipio, lerCep, lerListaCnae, lerMunicipios } from "./consultasAbertura";

const R: RestricaoCnae[] = [
  { codigo: "6810202", regime: "simples", nivel: "impeditivo", descricao: "Aluguel de imóveis próprios", fundamento: "Res. CGSN 140/2018, Anexo VI" },
  { codigo: "8299799", regime: "simples", nivel: "ambiguo", descricao: "Outras atividades", fundamento: "Res. CGSN 140/2018, Anexo VII" },
  { codigo: "6491300", regime: "presumido", nivel: "impeditivo", descricao: "Factoring", fundamento: "Lei 9.718/1998, art. 14, VI" },
];

function ficha(p: Partial<FichaAbertura> = {}): FichaAbertura {
  return {
    processo_id: "p", org_id: "o", regime: "simples", natureza: "ltda", porte: "me", razao_social: "EMPRESA X LTDA",
    nome_fantasia: null, cnae_principal: "6201501", cnae_principal_descricao: "Software", cnaes_secundarios: [],
    objeto_social: "Desenvolvimento de software", capital_social: 10000, valor_quota: 1, integralizacao: "no_ato",
    integralizacao_prazo: null, integralizacao_forma: "moeda", cep: "12900000", logradouro: "Rua A", numero: "1",
    complemento: null, bairro: "Centro", municipio: "Bragança Paulista", municipio_ibge: "3507605", uf: "SP",
    uso_endereco: "estabelecimento", imovel_situacao: "alugado", inscricao_imobiliaria: "123", area_m2: 50,
    email: null, telefone: null, contador_nome: null, contador_crc: null, observacoes: null, ...p,
  };
}
function socio(id: string, p: Partial<SocioAbertura> = {}): SocioAbertura {
  return {
    id, processo_id: "p", ordem: 1, tipo: "pf", nome: `Sócio ${id}`, documento: "11144477735", domiciliado_exterior: false,
    nacionalidade: "Brasileira", data_nascimento: null, estado_civil: "solteiro", regime_bens: null, profissao: null, rg: null,
    rg_orgao: null, email: null, celular: null, cep: "12900000", logradouro: "Rua B", numero: "2", complemento: null,
    bairro: null, municipio: "Bragança Paulista", uf: "SP", percentual: 50, administrador: false, outras_empresas: null, ...p,
  };
}

describe("conferirAbertura", () => {
  it("ficha completa e válida: nada bloqueia nem falta", () => {
    const c = conferirAbertura(ficha(), [socio("a", { administrador: true }), socio("b", { documento: "52998224725" })], R);
    expect(c).toEqual({ bloqueios: [], avisos: [], faltas: [] });
  });
  it("CNAE do Anexo VI no secundário bloqueia o Simples, e o Real aceita", () => {
    const f = ficha({ cnaes_secundarios: [{ codigo: "6810202", descricao: "Aluguel" }] });
    expect(conferirAbertura(f, [], R).bloqueios[0]).toMatch(/6810-2\/02.*não é permitido no Simples Nacional/);
    expect(conferirAbertura({ ...f, regime: "real" }, [], R).bloqueios).toEqual([]);
  });
  it("Anexo VII só avisa", () => {
    const c = conferirAbertura(ficha({ cnaes_secundarios: [{ codigo: "8299799", descricao: "Outras" }] }), [], R);
    expect(c.bloqueios).toEqual([]);
    expect(c.avisos[0]).toMatch(/8299-7\/99/);
  });
  it("factoring bloqueia o Presumido", () => {
    expect(conferirAbertura(ficha({ regime: "presumido", cnae_principal: "6491300" }), [], R).bloqueios[0]).toMatch(/Lucro Presumido/);
  });
  it("Simples: porte demais, sócio PJ e sócio no exterior bloqueiam", () => {
    const c = conferirAbertura(
      ficha({ porte: "demais" }),
      [socio("a", { tipo: "pj", documento: "11222333000181", administrador: true }), socio("b", { domiciliado_exterior: true, documento: "52998224725" })],
      R,
    );
    expect(c.bloqueios).toHaveLength(3);
  });
  it("percentuais, administrador, CPF inválido e regime de bens", () => {
    const c = conferirAbertura(ficha(), [socio("a", { percentual: 60, documento: "11111111111", estado_civil: "casado" })], R);
    expect(c.faltas.join(" ")).toMatch(/somam 60%/);
    expect(c.faltas.join(" ")).toMatch(/sócio administrador/);
    expect(c.faltas.join(" ")).toMatch(/regime de bens/);
    expect(c.bloqueios.join(" ")).toMatch(/CPF inválido/);
  });
  it("empresário individual com dois sócios bloqueia; falta de campos aparece numa linha", () => {
    const c = conferirAbertura(ficha({ natureza: "ei", objeto_social: null, cep: null }), [socio("a"), socio("b")], R);
    expect(c.bloqueios.join(" ")).toMatch(/um titular só/);
    expect(c.faltas[0]).toBe("Falta preencher: objeto social, endereço completo.");
  });
  it("sem ficha", () => expect(conferirAbertura(null, [], R).faltas).toEqual(["Ficha ainda não preenchida"]));
});

describe("quotas e formatos", () => {
  it("quotas inteiras ou null", () => {
    expect(quotas(10000, 1)).toBe(10000);
    expect(quotas(10000, 1, 33.3333)).toBeNull();
    expect(quotas(10000, 1, 25)).toBe(2500);
    expect(quotas(null, 1)).toBeNull();
  });
  it("soma e CNAE formatado", () => {
    expect(somaPercentuais([{ percentual: 33.3333 }, { percentual: 66.6667 }])).toBe(100);
    expect(formatarCnae("6201501")).toBe("6201-5/01");
  });
});

describe("documentosEsperados", () => {
  it("pede documentos por sócio e pelo imóvel, marcando os já anexados", () => {
    const s = [socio("a", { estado_civil: "casado" })];
    const l = documentosEsperados(ficha({ imovel_situacao: "alugado" }), s, [{ arquivo_id: "x", tipo: "rg_cnh", socio_id: "a" }]);
    expect(l.map((d) => [d.tipo, d.ok])).toEqual([
      ["rg_cnh", true],
      ["comprovante_residencia", false],
      ["certidao_casamento", false],
      ["iptu", false],
      ["contrato_locacao", false],
    ]);
  });
});

describe("consultas públicas", () => {
  const lista = lerListaCnae([
    { id: "6201501", descricao: "DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA", atividades: ["SOFTWARE SOB ENCOMENDA"] },
    { id: "1091102", descricao: "FABRICAÇÃO DE PRODUTOS DE PADARIA", atividades: ["PÃO"] },
    { id: "x", descricao: "lixo" },
  ]);
  it("lista e busca por código ou palavra sem acento", () => {
    expect(lista).toHaveLength(2);
    expect(filtrarCnaes(lista, "6201-5")[0].codigo).toBe("6201501");
    expect(filtrarCnaes(lista, "fabricacao padaria")[0].codigo).toBe("1091102");
    expect(filtrarCnaes(lista, "software")[0].codigo).toBe("6201501");
    expect(filtrarCnaes(lista, "a")).toEqual([]);
  });
  it("CEP do ViaCEP e da BrasilAPI", () => {
    expect(lerCep({ cep: "12900-000", logradouro: "Praça", bairro: "Centro", localidade: "Bragança Paulista", uf: "SP", ibge: "3507605" }))
      .toEqual({ cep: "12900000", logradouro: "Praça", bairro: "Centro", municipio: "Bragança Paulista", uf: "SP", ibge: "3507605" });
    expect(lerCep({ cep: "12900000", city: "Bragança Paulista", state: "sp" })?.ibge).toBeNull();
    expect(lerCep({ erro: true })).toBeNull();
  });
  it("municípios e IBGE pelo nome", () => {
    const m = lerMunicipios([{ id: 3507605, nome: "Bragança Paulista" }, { id: 3550308, nome: "São Paulo" }]);
    expect(ibgeDoMunicipio(m, "braganca paulista")).toBe("3507605");
    expect(ibgeDoMunicipio(m, "Atibaia")).toBeNull();
  });
});

describe("numeroDigitado", () => {
  it("aceita vírgula e milhar, vazio vira null e texto vira NaN", () => {
    expect(numeroDigitado("10.000,50")).toBe(10000.5);
    expect(numeroDigitado("33,3333")).toBe(33.3333);
    expect(numeroDigitado("10.000")).toBe(10000);
    expect(numeroDigitado("1.500.000")).toBe(1500000);
    expect(numeroDigitado("33.5")).toBe(33.5);
    expect(numeroDigitado("")).toBeNull();
    expect(numeroDigitado("abc")).toBeNaN();
    expect(numeroParaCampo(33.5)).toBe("33,5");
  });
});

describe("resumoFicha", () => {
  it("monta as linhas com CNAE, quotas e endereço", () => {
    const l = Object.fromEntries(resumoFicha(ficha()));
    expect(l["Regime"]).toBe("Simples Nacional");
    expect(l["CNAE principal"]).toBe("6201-5/01 Software");
    expect(l["Capital social"]).toMatch(/10\.000,00 em 10\.000 quotas/);
    expect(l["Endereço"]).toBe("Rua A, 1, Centro · Bragança Paulista/SP · CEP 12900-000 · IBGE 3507605");
  });
});
