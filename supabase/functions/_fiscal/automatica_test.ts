// Testes da tradução do resultado da emissão automática (052).
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { resultadoAutomatico } from "./automatica.ts";

Deno.test("emitida, recusada e sem resposta certa vêm do corpo da emissão", () => {
  assertEquals(resultadoAutomatico(200, { situacao: "emitida", mensagem: null }), { resultado: "emitida", mensagem: null });
  assertEquals(resultadoAutomatico(200, { situacao: "rejeitada", mensagem: "NBS incompatível (E0312)" }), {
    resultado: "rejeitada",
    mensagem: "NBS incompatível (E0312)",
  });
  assertEquals(resultadoAutomatico(200, { situacao: "erro", mensagem: "" }).resultado, "erro");
});

Deno.test("pendência da reserva vira 'pendencia' sem o prefixo; nota já em envio fica para amanhã", () => {
  assertEquals(resultadoAutomatico(409, { erro: "Falta ajustar antes de emitir: Informe o código NBS" }), {
    resultado: "pendencia",
    mensagem: "Informe o código NBS",
  });
  assertEquals(resultadoAutomatico(409, { erro: "A nota desta fatura já está sendo enviada ao Emissor Nacional." }).resultado, "erro");
  assertEquals(resultadoAutomatico(500, { erro: "conexão caiu" }).resultado, "erro");
});
