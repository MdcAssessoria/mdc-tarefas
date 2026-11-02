// Testes das regras da lista de tarefas: situação, contagens, tom do prazo e ordem.
import { describe, expect, it } from "vitest";
import { contarTarefas, diasEntre, ordenarTarefas, passaSituacao, textoDoPrazo, tomDoPrazo } from "./regras";
import type { Status } from "./tipos";

const HOJE = "2026-11-02";
const t = (status: Status, prazo: string | null) => ({ status, prazo });

describe("diasEntre", () => {
  it("conta dias corridos e aceita data com hora", () => {
    expect(diasEntre(HOJE, "2026-11-02")).toBe(0);
    expect(diasEntre(HOJE, "2026-10-31")).toBe(-2);
    expect(diasEntre(HOJE, "2026-12-01T10:00:00Z")).toBe(29);
    expect(diasEntre(HOJE, null)).toBeNull();
  });
});

describe("passaSituacao", () => {
  it("cancelada e concluída não contam como atrasadas nem abertas", () => {
    expect(passaSituacao(t("cancelada", "2026-10-01"), "atrasadas", HOJE)).toBe(false);
    expect(passaSituacao(t("concluida", "2026-10-01"), "atrasadas", HOJE)).toBe(false);
    expect(passaSituacao(t("cancelada", null), "abertas", HOJE)).toBe(false);
    expect(passaSituacao(t("aguardando", "2026-10-01"), "atrasadas", HOJE)).toBe(true);
  });
  it("vence hoje e próximos 7 dias", () => {
    expect(passaSituacao(t("a_fazer", HOJE), "hoje", HOJE)).toBe(true);
    expect(passaSituacao(t("a_fazer", "2026-11-09"), "semana", HOJE)).toBe(true);
    expect(passaSituacao(t("a_fazer", "2026-11-10"), "semana", HOJE)).toBe(false);
    expect(passaSituacao(t("a_fazer", null), "semana", HOJE)).toBe(false);
  });
  it("no quadro, 'Em aberto' também mostra as concluídas (mas não as canceladas)", () => {
    expect(passaSituacao(t("concluida", null), "abertas", HOJE, true)).toBe(true);
    expect(passaSituacao(t("cancelada", null), "abertas", HOJE, true)).toBe(false);
    expect(passaSituacao(t("concluida", null), "abertas", HOJE)).toBe(false);
  });
  it("canceladas e todas", () => {
    expect(passaSituacao(t("cancelada", null), "canceladas", HOJE)).toBe(true);
    expect(passaSituacao(t("cancelada", null), "todas", HOJE)).toBe(true);
  });
});

describe("contarTarefas", () => {
  it("só abertas entram em atrasadas/hoje/7 dias e a soma bate", () => {
    const c = contarTarefas(
      [
        t("a_fazer", "2026-10-30"), // atrasada
        t("em_andamento", HOJE), // hoje (e semana)
        t("aguardando", "2026-11-05"), // semana
        t("a_fazer", null), // aberta sem prazo
        t("concluida", "2026-10-01"),
        t("cancelada", "2026-10-01"),
      ],
      HOJE,
    );
    expect(c).toEqual({ abertas: 4, atrasadas: 1, hoje: 1, semana: 2, concluidas: 1 });
  });
});

describe("tomDoPrazo e textoDoPrazo", () => {
  it("usa os tons padrão", () => {
    expect(tomDoPrazo("2026-11-01", "a_fazer", HOJE)).toBe("vermelho");
    expect(tomDoPrazo(HOJE, "a_fazer", HOJE)).toBe("ambar");
    expect(tomDoPrazo("2026-11-20", "a_fazer", HOJE)).toBe("azul");
    expect(tomDoPrazo("2026-11-01", "concluida", HOJE)).toBe("verde");
    expect(tomDoPrazo("2026-11-01", "cancelada", HOJE)).toBe("neutro");
    expect(tomDoPrazo(null, "a_fazer", HOJE)).toBe("neutro");
  });
  it("escreve o prazo em palavras", () => {
    expect(textoDoPrazo("2026-10-31", HOJE)).toBe("Atrasada 2 dias");
    expect(textoDoPrazo(HOJE, HOJE)).toBe("Vence hoje");
    expect(textoDoPrazo(null, HOJE)).toBe("Sem prazo");
  });
});

describe("ordenarTarefas", () => {
  it("prazo mais próximo primeiro, sem prazo no fim, urgente antes no mesmo prazo, sem mudar a lista original", () => {
    const lista = [
      { id: "a", prazo: null, prioridade: "urgente" as const },
      { id: "b", prazo: "2026-11-05", prioridade: "baixa" as const },
      { id: "c", prazo: "2026-11-05", prioridade: "urgente" as const },
      { id: "d", prazo: "2026-11-01", prioridade: "media" as const },
    ];
    expect(ordenarTarefas(lista).map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
    expect(lista[0].id).toBe("a");
  });
});
