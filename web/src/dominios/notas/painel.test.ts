import { describe, expect, it } from "vitest";
import { avisoDaBusca, causaDoErro, contar, explicarErroBusca, resumoNotasRecebidas } from "./painel";

// erro real visto em produção (03/11/2026), gravado pela Função Edge fiscal-captura
const ERRO_REAL =
  "Não foi possível falar com a SEFAZ (error sending request from 10.32.144.135:60946 for https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx (www1.nfe.fazenda.gov.br): client error (SendRequest): connection error: Connection reset by peer (os error 104)). Confira se o certificado é ICP-Brasil e válido.";

describe("contar", () => {
  it("usa singular só para 1", () => {
    expect(contar(1, "pronta", "prontas")).toBe("1 pronta");
    expect(contar(0, "pronta", "prontas")).toBe("0 prontas");
    expect(contar(50, "pronta", "prontas")).toBe("50 prontas");
  });
});

describe("resumoNotasRecebidas", () => {
  const base = { valorAguardando: "R$ 10,00", valorALancar: "R$ 20,00", vencendo: 0 };
  it("plural certo, sem '(s)'", () => {
    const t = resumoNotasRecebidas({ ...base, aguardando: 3, vencendo: 1, aLancar: 50 });
    expect(t).toBe("3 notas aguardam sua resposta (R$ 10,00), 1 com prazo vencendo. 50 prontas para lançar.");
    expect(t).not.toContain("(s)");
  });
  it("singular", () => {
    expect(resumoNotasRecebidas({ ...base, aguardando: 1, aLancar: 1 })).toBe(
      "1 nota aguarda sua resposta (R$ 10,00). 1 pronta para lançar.",
    );
  });
  it("nenhuma pronta e nada aguardando", () => {
    expect(resumoNotasRecebidas({ ...base, aguardando: 2, aLancar: 0 })).toContain("Nenhuma pronta para lançar.");
    expect(resumoNotasRecebidas({ ...base, aguardando: 0, aLancar: 2 })).toBe(
      "Nenhuma nota esperando resposta. 2 prontas para lançar (R$ 20,00).",
    );
    expect(resumoNotasRecebidas({ ...base, aguardando: 0, aLancar: 0 })).toBe("Tudo em dia neste período.");
  });
});

describe("causaDoErro", () => {
  it("conexão cortada é 'sem resposta', não certificado (apesar do 'Confira se o certificado…')", () => {
    expect(causaDoErro(ERRO_REAL)).toBe("sem_resposta");
  });
  it("reconhece as outras causas", () => {
    expect(causaDoErro("Não foi possível falar com a SEFAZ (invalid peer certificate: UnknownIssuer). Confira se o certificado é ICP-Brasil e válido.")).toBe(
      "certificado",
    );
    expect(causaDoErro("Este certificado não é ICP-Brasil: a SEFAZ e o ADN vão recusar a conexão.")).toBe("certificado");
    expect(causaDoErro("Não foi possível falar com a SEFAZ (The signal has been aborted). Confira se o certificado é ICP-Brasil e válido.")).toBe(
      "demora",
    );
    expect(causaDoErro("A SEFAZ respondeu 503: <html>Service Unavailable</html>")).toBe("fora_do_ar");
    expect(causaDoErro("O ADN pediu para esperar (muitas consultas).")).toBe("pausa");
    expect(causaDoErro("NSU 1533: XML sem a chave")).toBe("leitura");
    expect(causaDoErro("algo inesperado")).toBe("outro");
  });
});

describe("explicarErroBusca", () => {
  it("nunca mostra IP, URL ou código do sistema", () => {
    const t = explicarErroBusca(ERRO_REAL, "nfe");
    expect(t).toBe("A SEFAZ Nacional não respondeu na última tentativa.");
    expect(t).not.toMatch(/\d+\.\d+\.\d+\.\d+|https?:|os error/);
  });
});

describe("avisoDaBusca", () => {
  it("sem erro, sem aviso", () => {
    expect(avisoDaBusca([])).toBeNull();
    expect(avisoDaBusca([{ fonte: "nfe", ultimo_erro: null }, { fonte: "nfse", ultimo_erro: " " }])).toBeNull();
  });
  it("SEFAZ fora e NFS-e funcionando: diz o que continua chegando e guarda o técnico nos detalhes", () => {
    const a = avisoDaBusca([
      { fonte: "nfe", ultimo_erro: ERRO_REAL },
      { fonte: "nfse", ultimo_erro: null },
    ]);
    expect(a?.texto).toBe(
      "A SEFAZ Nacional não respondeu na última tentativa. As NFS-e continuam chegando normalmente; as NF-e de produto estão temporariamente indisponíveis — o HUB tenta de novo sozinho.",
    );
    expect(a?.texto).not.toMatch(/10\.32|fazenda\.gov|os error/);
    expect(a?.agir).toBe(false);
    expect(a?.detalhes).toEqual([`NF-e (SEFAZ Nacional): ${ERRO_REAL}`]);
  });
  it("certificado recusado pede ação", () => {
    const a = avisoDaBusca([{ fonte: "nfe", ultimo_erro: "Este certificado não é ICP-Brasil: a SEFAZ e o ADN vão recusar a conexão." }]);
    expect(a?.agir).toBe(true);
    expect(a?.texto).toContain("Confira em Certificado digital");
  });
  it("as duas fontes com problema", () => {
    const a = avisoDaBusca([
      { fonte: "nfe", ultimo_erro: ERRO_REAL },
      { fonte: "nfse", ultimo_erro: "O ADN pediu para esperar (muitas consultas)." },
    ]);
    expect(a?.texto).toBe(
      "A SEFAZ Nacional não respondeu na última tentativa. A NFS-e Nacional pediu um intervalo entre as consultas. As NF-e de produto e as NFS-e de serviço estão temporariamente indisponíveis — o HUB tenta de novo sozinho.",
    );
    expect(a?.detalhes).toHaveLength(2);
  });
  it("erro desconhecido pede para avisar a equipe se continuar", () => {
    expect(avisoDaBusca([{ fonte: "nfse", ultimo_erro: "algo inesperado" }])?.texto).toBe(
      "A última busca de NFS-e de serviço não deu certo. As NFS-e de serviço estão temporariamente indisponíveis — o HUB tenta de novo sozinho; se continuar, avise a equipe MDC.",
    );
  });
});
