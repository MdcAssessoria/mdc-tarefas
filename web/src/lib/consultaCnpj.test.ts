import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroApp, traduzirErro } from "./erros";
import { consultarCnpj, lerRespostaCnpj, mesmoCnpj, resumoCnpj } from "./consultaCnpj";

const resposta = {
  cnpj: "11222333000181",
  razao_social: "EMPRESA EXEMPLO LTDA",
  nome_fantasia: "",
  descricao_situacao_cadastral: "ATIVA",
  data_inicio_atividade: "2015-06-01",
  cnae_fiscal: 6920601,
  cnae_fiscal_descricao: "Atividades de contabilidade",
  descricao_tipo_logradouro: "RUA",
  logradouro: "DAS FLORES",
  numero: "100",
  complemento: "",
  bairro: "CENTRO",
  municipio: "BRAGANCA PAULISTA",
  uf: "sp",
  cep: "12900000",
  ddd_telefone_1: "1144445555",
  email: "CONTATO@EXEMPLO.COM.BR",
  capital_social: 50000,
  opcao_pelo_simples: true,
  qsa: [
    { nome_socio: "FULANO DE TAL", qualificacao_socio: "Sócio-Administrador", data_entrada_sociedade: "2015-06-01" },
    { nome_socio: "" },
  ],
};

describe("lerRespostaCnpj", () => {
  it("monta os dados no formato do HUB", () => {
    const d = lerRespostaCnpj(resposta);
    expect(d.cnpj).toBe("11.222.333/0001-81");
    expect(d.razaoSocial).toBe("EMPRESA EXEMPLO LTDA");
    expect(d.nomeFantasia).toBeNull();
    expect(d.uf).toBe("SP");
    expect(d.endereco).toBe("RUA DAS FLORES, 100, CENTRO");
    expect(d.cep).toBe("12900-000");
    expect(d.telefone).toBe("(11) 4444-5555");
    expect(d.email).toBe("contato@exemplo.com.br");
    expect(d.cnae).toBe("6920601 · Atividades de contabilidade");
    expect(d.capitalSocial).toBe(50000);
    expect(d.socios).toEqual([{ nome: "FULANO DE TAL", qualificacao: "Sócio-Administrador", entrada: "2015-06-01" }]);
  });

  it("aguenta campos faltando", () => {
    const d = lerRespostaCnpj({ razao_social: "X" });
    expect(d.endereco).toBeNull();
    expect(d.socios).toEqual([]);
    expect(d.capitalSocial).toBeNull();
  });
});

describe("resumoCnpj", () => {
  it("resume endereço, CNAE, capital e sócios", () => {
    const t = resumoCnpj(lerRespostaCnpj(resposta), "02/11/2026");
    expect(t).toContain("consulta em 02/11/2026");
    expect(t).toContain("BRAGANCA PAULISTA/SP");
    expect(t).toContain("Sócios: FULANO DE TAL (Sócio-Administrador)");
  });
});

describe("consultarCnpj", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const CNPJ = "11.222.333/0001-81";
  const responder = (r: Response | Promise<Response>) => vi.stubGlobal("fetch", vi.fn(() => r));
  /** A mensagem que a pessoa vê (passa pelo traduzirErro, como na tela). */
  const mensagem = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ErroApp);
      return traduzirErro(e);
    }
    throw new Error("a consulta deveria falhar");
  };

  it("recusa CNPJ inválido sem consultar", async () => {
    await expect(consultarCnpj("123")).rejects.toThrow("CNPJ inválido");
  });

  it("devolve os dados quando a Receita responde", async () => {
    responder(new Response(JSON.stringify(resposta), { status: 200 }));
    expect((await consultarCnpj(CNPJ)).razaoSocial).toBe("EMPRESA EXEMPLO LTDA");
  });

  it.each([
    [404, "CNPJ não encontrado na Receita. Confira o número."],
    [429, "Muitas consultas seguidas. Espere um minuto e tente de novo."],
    [500, "O serviço de consulta de CNPJ não respondeu agora. Preencha à mão ou tente de novo em instantes."],
  ])("resposta %i vira mensagem em português", async (status, texto) => {
    responder(new Response("erro", { status }));
    expect(await mensagem(consultarCnpj(CNPJ))).toBe(texto);
  });

  it("JSON inválido vira mensagem em português (e não SyntaxError em inglês)", async () => {
    responder(new Response("<html>gateway</html>", { status: 200 }));
    expect(await mensagem(consultarCnpj(CNPJ))).toBe(
      "A Receita respondeu de um jeito inesperado. Preencha à mão ou tente de novo em instantes.",
    );
  });

  it("sem conexão vira mensagem em português", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await mensagem(consultarCnpj(CNPJ))).toMatch(/^Não foi possível consultar a Receita agora/);
  });

  it("desiste depois de 10 segundos", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_ok, falha) =>
            init?.signal?.addEventListener("abort", () => falha(new DOMException("The operation was aborted.", "AbortError"))),
          ),
      ),
    );
    const p = mensagem(consultarCnpj(CNPJ));
    await vi.advanceTimersByTimeAsync(9_999);
    let terminou = false;
    void p.then(() => (terminou = true));
    await Promise.resolve();
    expect(terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe("A consulta do CNPJ demorou demais. Tente de novo.");
  });

  it("o tempo também vale para a leitura da resposta", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              new Promise((_ok, falha) =>
                init?.signal?.addEventListener("abort", () => falha(new DOMException("The operation was aborted.", "AbortError"))),
              ),
          } as unknown as Response),
      ),
    );
    const p = mensagem(consultarCnpj(CNPJ));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe("A consulta do CNPJ demorou demais. Tente de novo.");
  });
});

describe("mesmoCnpj", () => {
  it("compara só os números (para ignorar a resposta de um CNPJ que já foi trocado no campo)", () => {
    expect(mesmoCnpj("11.222.333/0001-81", "11222333000181")).toBe(true);
    expect(mesmoCnpj("11.222.333/0001-81", "11.222.333/0001-8")).toBe(false);
    expect(mesmoCnpj("", "")).toBe(false);
  });
});
