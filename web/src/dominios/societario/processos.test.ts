import { describe, expect, it } from "vitest";
import {
  destinosParaAvancar,
  diasParado,
  faseAtualDe,
  paradoHa,
  passaDestaque,
  passosParaAvancar,
  situacaoProcesso,
  tomStatusFase,
} from "./processos";
import type { SocFase, StatusFase } from "./processos";

const fase = (ordem: number, status: StatusFase, extra: Partial<SocFase> = {}): SocFase => ({
  id: `f${ordem}`,
  processo_id: "p1",
  ordem,
  codigo: `c${ordem}`,
  nome: `Fase ${ordem}`,
  status,
  responsavel_id: null,
  prazo_dias: null,
  inicio_em: null,
  prazo_em: null,
  fim_em: null,
  mudou_em: "2026-11-01T12:00:00Z",
  tarefa_id: null,
  ...extra,
});

describe("passosParaAvancar", () => {
  const fases = [fase(1, "concluida"), fase(2, "em_andamento"), fase(3, "a_fazer"), fase(4, "dispensada"), fase(5, "a_fazer"), fase(6, "a_fazer")];

  it("para a próxima fase só conclui a atual", () => {
    expect(passosParaAvancar(fases, fases[1], fases[2])).toEqual([{ fase: "f2", status: "concluida" }]);
  });

  it("pulando fases dispensa as pendentes do meio primeiro e conclui a atual por último", () => {
    expect(passosParaAvancar(fases, fases[1], fases[5])).toEqual([
      { fase: "f3", status: "dispensada" },
      { fase: "f5", status: "dispensada" },
      { fase: "f2", status: "concluida" },
    ]);
  });

  it("recusa destino para trás, dispensado ou já concluído", () => {
    expect(passosParaAvancar(fases, fases[1], fases[0])).toMatch(/à frente/);
    expect(passosParaAvancar(fases, fases[1], fases[3])).toMatch(/dispensada/);
    expect(passosParaAvancar(fases, fases[2], { ...fases[4], status: "concluida" })).toMatch(/já foi concluída/);
  });
});

describe("destinosParaAvancar", () => {
  it("lista só as fases à frente que ainda podem receber o processo, na ordem", () => {
    const fases = [fase(3, "a_fazer"), fase(1, "concluida"), fase(2, "em_andamento"), fase(4, "dispensada"), fase(5, "a_fazer")];
    expect(destinosParaAvancar(fases, fases[2]).map((f) => f.id)).toEqual(["f3", "f5"]);
  });
});

describe("faseAtualDe", () => {
  it("acha a fase pela ordem do processo", () => {
    expect(faseAtualDe({ id: "p1", fase_atual: 2 }, [fase(1, "concluida"), fase(2, "a_fazer")])?.id).toBe("f2");
    expect(faseAtualDe({ id: "p2", fase_atual: 2 }, [fase(2, "a_fazer")])).toBeUndefined();
  });
});

describe("destaques da lista", () => {
  const hoje = "2026-11-02";
  const aberto = { status: "aberto" as const, exigencias: 0, previsao_em: null };

  it("fase atrasada: prazo da fase antes de hoje", () => {
    expect(passaDestaque(aberto, { prazo_em: "2026-11-01" }, "atrasada", hoje)).toBe(true);
    expect(passaDestaque(aberto, { prazo_em: "2026-11-02" }, "atrasada", hoje)).toBe(false);
    expect(passaDestaque(aberto, undefined, "atrasada", hoje)).toBe(false);
  });

  it("previsão vencida e exigência", () => {
    expect(passaDestaque({ ...aberto, previsao_em: "2026-10-30" }, undefined, "previsao", hoje)).toBe(true);
    expect(passaDestaque({ ...aberto, exigencias: 2 }, undefined, "exigencia", hoje)).toBe(true);
    expect(passaDestaque(aberto, undefined, "exigencia", hoje)).toBe(false);
  });

  it("processo concluído não entra em destaque nenhum; sem destaque passa tudo", () => {
    expect(passaDestaque({ ...aberto, status: "concluido", exigencias: 3 }, undefined, "exigencia", hoje)).toBe(false);
    expect(passaDestaque({ ...aberto, status: "concluido" }, undefined, "", hoje)).toBe(true);
  });

  it("parado há N dias conta pela última mudança da fase", () => {
    const agora = Date.parse("2026-11-08T12:00:00Z");
    expect(diasParado("2026-11-01T12:00:00Z", agora)).toBe(7);
    expect(paradoHa(aberto, { mudou_em: "2026-11-01T12:00:00Z" }, 5, agora)).toBe(true);
    expect(paradoHa(aberto, { mudou_em: "2026-11-05T12:00:00Z" }, 5, agora)).toBe(false);
    expect(paradoHa({ status: "concluido" }, { mudou_em: "2026-01-01T00:00:00Z" }, 5, agora)).toBe(false);
    expect(paradoHa({ status: "concluido" }, undefined, 0, agora)).toBe(true);
  });
});

describe("nomes e tons", () => {
  it("usa os tons do HUB", () => {
    expect(tomStatusFase("aguardando_cliente")).toBe("violeta");
    expect(tomStatusFase("concluida")).toBe("verde");
    expect(situacaoProcesso({ status: "cancelado" })).toEqual({ nome: "Cancelado", tom: "neutro" });
  });
});
