// Testes do relatório de tarefas concluídas: período no fuso, atraso pelo dia local, filtros e totais.
import { describe, expect, it } from "vitest";
import {
  diaDaConclusao,
  diasDeAtraso,
  filtrarPessoaSetor,
  fracaoNoPrazo,
  limitesDoPeriodo,
  resumirPorPessoa,
  situacaoDaConclusao,
  textoAtraso,
  textoPct,
  totalizar,
} from "./relatorio";

const SP = "America/Sao_Paulo";
const nome = (id: string | null) => (id ? ({ ana: "Ana", bia: "Bia" }[id] ?? "Pessoa removida") : "Sem responsável");

describe("limitesDoPeriodo", () => {
  it("usa o início do dia no fuso da organização (sem T03:00 fixo)", () => {
    expect(limitesDoPeriodo({ de: "2026-11-01", ate: "2026-11-30" }, SP)).toEqual({
      desde: "2026-11-01T03:00:00.000Z",
      antes: "2026-12-01T03:00:00.000Z",
    });
    // outro fuso: Manaus é UTC-4
    expect(limitesDoPeriodo({ de: "2026-11-01", ate: "2026-11-01" }, "America/Manaus")).toEqual({
      desde: "2026-11-01T04:00:00.000Z",
      antes: "2026-11-02T04:00:00.000Z",
    });
  });
  it("período 'Tudo' fica sem limites", () => {
    expect(limitesDoPeriodo({}, SP)).toEqual({ desde: undefined, antes: undefined });
  });
});

describe("dias de atraso", () => {
  it("conta pelo dia local: concluída às 22h do dia do prazo está no prazo", () => {
    // 22h de 31/10 em São Paulo = 01h de 01/11 em UTC
    const t = { prazo: "2026-10-31", concluida_em: "2026-11-01T01:00:00Z" };
    expect(diaDaConclusao(t, SP)).toBe("2026-10-31");
    expect(diasDeAtraso(t, SP)).toBe(0);
    expect(situacaoDaConclusao(diasDeAtraso(t, SP))).toBe("No prazo");
  });
  it("atraso, antecipação e sem prazo", () => {
    expect(diasDeAtraso({ prazo: "2026-10-28", concluida_em: "2026-10-31T15:00:00Z" }, SP)).toBe(3);
    expect(diasDeAtraso({ prazo: "2026-11-05", concluida_em: "2026-10-31T15:00:00Z" }, SP)).toBe(-5);
    expect(diasDeAtraso({ prazo: null, concluida_em: "2026-10-31T15:00:00Z" }, SP)).toBeNull();
    expect(situacaoDaConclusao(1)).toBe("1 dia de atraso");
    expect(situacaoDaConclusao(3)).toBe("3 dias de atraso");
    expect(situacaoDaConclusao(null)).toBe("Sem prazo");
  });
});

describe("filtrarPessoaSetor", () => {
  const lista = [
    { id: 1, responsavel_id: "ana", setor_id: "fiscal" },
    { id: 2, responsavel_id: null, setor_id: "fiscal" },
    { id: 3, responsavel_id: "bia", setor_id: null },
  ];
  it("vazio = todos; _sem = sem responsável / sem setor", () => {
    expect(filtrarPessoaSetor(lista, [], []).length).toBe(3);
    expect(filtrarPessoaSetor(lista, ["_sem"], []).map((x) => x.id)).toEqual([2]);
    expect(filtrarPessoaSetor(lista, [], ["_sem"]).map((x) => x.id)).toEqual([3]);
    expect(filtrarPessoaSetor(lista, ["ana", "bia"], ["fiscal"]).map((x) => x.id)).toEqual([1]);
  });
});

describe("resumirPorPessoa e totalizar", () => {
  const HOJE = "2026-11-02";
  const concluidas = [
    { responsavel_id: "ana", prazo: "2026-10-10", concluida_em: "2026-10-10T12:00:00Z" }, // no prazo
    { responsavel_id: "ana", prazo: "2026-10-10", concluida_em: "2026-10-12T12:00:00Z" }, // 2 dias
    { responsavel_id: "bia", prazo: "2026-10-10", concluida_em: "2026-10-16T12:00:00Z" }, // 6 dias
    { responsavel_id: "bia", prazo: null, concluida_em: "2026-10-16T12:00:00Z" }, // sem prazo
  ];
  const abertas = [
    { responsavel_id: "ana", setor_id: null, prazo: "2026-11-01" }, // vencida
    { responsavel_id: "ana", setor_id: null, prazo: HOJE }, // vence hoje: não é vencida
    { responsavel_id: null, setor_id: null, prazo: "2026-10-01" }, // sem responsável e vencida
    { responsavel_id: "saiu", setor_id: null, prazo: null }, // pessoa que saiu continua aparecendo
  ];
  const linhas = resumirPorPessoa(concluidas, abertas, HOJE, SP, nome);

  it("monta uma linha por pessoa, incluindo sem responsável e quem saiu", () => {
    expect(linhas.map((p) => p.nome)).toEqual(["Ana", "Bia", "Pessoa removida", "Sem responsável"]);
    const ana = linhas[0];
    expect(ana).toMatchObject({ total: 2, noPrazo: 1, atrasadas: 1, semPrazo: 0, diasAtrasoMedio: 2, abertas: 2, vencidas: 1 });
    expect(linhas[1]).toMatchObject({ total: 2, noPrazo: 0, atrasadas: 1, semPrazo: 1, diasAtrasoMedio: 6, abertas: 0 });
  });

  it("os totais batem com a soma das linhas e o atraso médio é ponderado", () => {
    const t = totalizar(linhas);
    expect(t).toMatchObject({ total: 4, noPrazo: 1, atrasadas: 2, semPrazo: 1, abertas: 4, vencidas: 2 });
    expect(t.total).toBe(t.noPrazo + t.atrasadas + t.semPrazo);
    expect(t.diasAtrasoMedio).toBe(4); // (2 + 6) / 2
    expect(totalizar([]).diasAtrasoMedio).toBeNull();
  });

  it("percentual no prazo ignora as sem prazo", () => {
    expect(fracaoNoPrazo(1, 1)).toBe(0.5);
    expect(fracaoNoPrazo(0, 0)).toBeNull();
    expect(textoPct(0.833)).toBe("83%");
    expect(textoPct(null)).toBe("—");
    expect(textoAtraso(2.25)).toBe("2,3 d");
    expect(textoAtraso(null)).toBe("—");
  });
});
