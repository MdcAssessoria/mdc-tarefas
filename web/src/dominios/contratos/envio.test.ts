import { describe, expect, it } from "vitest";
import { estadoCanal, explicarEnvio, naFila, podeReenviar } from "./envio";
import type { EnvioDaFatura } from "./tipos";

const agora = new Date("2026-11-04T15:00:00-03:00");
const e = (p: Partial<EnvioDaFatura>): EnvioDaFatura => ({
  id: 1,
  fatura_id: "f",
  canal: "email",
  destino: "a@b.com",
  conteudo: ["fatura"],
  situacao: "pendente",
  tentativas: 0,
  ultimo_erro: null,
  enviado_em: null,
  proxima_tentativa_em: null,
  ...p,
});

describe("situação de cada envio em linguagem simples (053)", () => {
  it("falhou: mostra o motivo e quando o HUB tenta de novo", () => {
    const x = explicarEnvio(e({ situacao: "erro", ultimo_erro: "Caixa cheia.", proxima_tentativa_em: "2026-11-04T17:00:00-03:00" }), agora);
    expect(x.nome).toBe("Falhou");
    expect(x.tom).toBe("vermelho");
    expect(x.texto).toMatch(/^Caixa cheia\. O HUB tenta de novo a partir de /);
  });
  it("falhou de vez: pede para conferir e reenviar", () => {
    expect(explicarEnvio(e({ situacao: "erro", ultimo_erro: "E-mail não existe." }), agora).texto).toContain("clique em Reenviar");
  });
  it("aguardando configuração explica onde liga, sem erro", () => {
    const x = explicarEnvio(e({ canal: "whatsapp", situacao: "aguardando_configuracao" }), agora);
    expect([x.nome, x.tom]).toEqual(["Aguardando configuração", "ambar"]);
    expect(x.texto).toContain("Contratos › Envio");
  });
  it("na fila: espera da próxima tentativa ou próxima rodada", () => {
    expect(explicarEnvio(e({ proxima_tentativa_em: "2026-11-04T16:00:00-03:00" }), agora).texto).toMatch(/^Sai a partir de /);
    expect(explicarEnvio(e({ proxima_tentativa_em: "2026-11-04T14:00:00-03:00" }), agora).texto).toContain("a cada 10 minutos");
  });
  it("Portal publicado não é 'enviado por e-mail'", () => {
    expect(explicarEnvio(e({ canal: "portal", situacao: "enviado" }), agora).nome).toBe("Publicada");
  });
});

describe("Reenviar e estado do canal", () => {
  it("só e-mail/WhatsApp que falhou ou já foi, e fatura não cancelada", () => {
    expect(podeReenviar(e({ situacao: "erro" }), false)).toBe(true);
    expect(podeReenviar(e({ situacao: "enviado", canal: "whatsapp" }), false)).toBe(true);
    expect(podeReenviar(e({ situacao: "pendente" }), false)).toBe(false);
    expect(podeReenviar(e({ situacao: "erro", canal: "portal" }), false)).toBe(false);
    expect(podeReenviar(e({ situacao: "erro" }), true)).toBe(false);
  });
  it("canal nunca conferido = não configurado (âmbar), ligado = verde", () => {
    expect(estadoCanal(undefined).tom).toBe("ambar");
    expect(estadoCanal({ configurado: true, detalhe: "ok", remetente: "hub@", verificado_em: "" })).toEqual({ nome: "Ligado", tom: "verde", texto: "ok" });
  });
  it("conta a fila por canal e situação", () => {
    expect(naFila({ canais: {}, fila: { "email:erro": 2 }, problemas: [] }, "email", "erro")).toBe(2);
    expect(naFila(null, "whatsapp", "pendente")).toBe(0);
  });
});
