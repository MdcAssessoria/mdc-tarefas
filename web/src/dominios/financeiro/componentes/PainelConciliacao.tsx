// Painel da direita na Conciliação: para a linha do extrato escolhida, mostra as sugestões do HUB ("Conciliar com
// esta" grava na hora quando a soma bate) e os atalhos para as outras saídas (criar lançamento, transferência, ignorar).
// Linha já conciliada ou ignorada: mostra a ligação e o "Desfazer conciliação" (com motivo).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { fmtData } from "@/lib/formato/datas";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { Valor } from "@/components/ui/Valor";
import { chaveCandidato, PONTOS_ALTOS, rotuloPontos, somaSelecao, sugerir } from "../conciliacao";
import type { Candidato, DadosConciliacao, LinhaConciliacao, Sugestao } from "../conciliacao";
import { conciliar } from "../repositorio";
import type { AbaConciliar } from "./JanelaConciliar";

const nome = (c: Candidato) =>
  c.tipo === "transferencia"
    ? `Transferência ${c.item.valor > 0 ? "de" : "para"} ${c.item.outra_conta}`
    : [c.item.descricao, c.item.pessoa].filter(Boolean).join(" · ");

export function PainelConciliacao({
  linha,
  dados,
  podeOperar,
  aoAbrir,
  aoDesfazer,
  aoGravar,
}: {
  linha: LinhaConciliacao | null;
  dados: DadosConciliacao;
  podeOperar: boolean;
  aoAbrir: (aba: AbaConciliar, escolha?: string[]) => void;
  aoDesfazer: () => void;
  aoGravar: (mensagem: string, tom?: "erro" | "sucesso") => void;
}) {
  const [ocupado, setOcupado] = useState("");

  if (!linha)
    return (
      <div className="cartao p-4 text-sm text-[var(--texto-suave)]">
        Escolha um lançamento do extrato na lista para ver com o que ele combina no HUB.
      </div>
    );

  const k = linha.conciliacao;
  const sugestoes = linha.situacao === "pendente" ? sugerir(linha, dados) : [];

  async function usar(s: Sugestao) {
    const chaves = s.candidatos.map(chaveCandidato);
    // valor perto (juros/desconto) precisa de conferência: abre a janela já com a escolha marcada
    if (Math.abs(somaSelecao(s.candidatos, {}) - Number(linha!.valor)) >= 0.005) return aoAbrir("hub", chaves);
    setOcupado(chaves.join("+"));
    try {
      await conciliar(linha!.id, {
        baixas: s.candidatos.filter((c) => c.tipo === "baixa").map((c) => c.item.id as number),
        transferencias: s.candidatos.filter((c) => c.tipo === "transferencia").map((c) => c.item.id as number),
        titulos: s.candidatos
          .filter((c) => c.tipo === "titulo")
          .map((c) => ({ id: c.item.id as string, valor: Number((c.item as { saldo: number }).saldo), juros: 0, desconto: 0 })),
      });
      aoGravar("Lançamento do extrato conciliado.");
    } catch (e) {
      aoGravar(traduzirErro(e), "erro");
    } finally {
      setOcupado("");
    }
  }

  return (
    <section className="cartao space-y-3 p-4" aria-label="Sugestões para o lançamento escolhido">
      <div>
        <p className="text-xs text-[var(--texto-suave)]">{fmtData(linha.data)}</p>
        <p className="break-words font-medium">{linha.descricao}</p>
        <p className="text-lg font-semibold">
          <Valor v={Number(linha.valor)} sinal />
        </p>
      </div>

      {k ? (
        <div className="space-y-2 text-sm">
          <Chip tom={k.tipo === "ignorado" ? "neutro" : "verde"}>{k.tipo === "ignorado" ? "Ignorado" : "Conciliado"}</Chip>
          {k.tipo === "ignorado" ? (
            <p>Motivo: {k.observacao}</p>
          ) : (
            <ul className="space-y-1">
              {k.itens.map((i, n) => (
                <li key={n} className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {[i.descricao, i.pessoa].filter(Boolean).join(" · ")}
                    {i.criado_aqui && <span className="block text-xs text-[var(--texto-suave)]">lançado na conciliação</span>}
                  </span>
                  <Valor v={Number(i.valor)} sinal />
                </li>
              ))}
            </ul>
          )}
          {k.tipo !== "ignorado" && k.observacao && <p className="text-[var(--texto-suave)]">Obs.: {k.observacao}</p>}
          {podeOperar && (
            <button className="btn text-[var(--perigo)]" onClick={aoDesfazer}>
              <Icone nome="voltar" className="h-4 w-4" />
              Desfazer conciliação
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Sugestões do HUB</p>
            {!sugestoes.length && (
              <p className="text-sm text-[var(--texto-suave)]">
                Nada no HUB combina com este valor e data. Procure na janela Conciliar, crie o lançamento ou marque como transferência.
              </p>
            )}
            {sugestoes.map((s, n) => {
              const chave = s.candidatos.map(chaveCandidato).join("+");
              return (
                <div key={chave} className="space-y-2 rounded-lg border border-[var(--borda)] p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words">{s.candidatos.map(nome).join(" + ")}</span>
                    <Chip tom={s.pontos >= PONTOS_ALTOS ? "verde" : "ambar"}>{rotuloPontos(s.pontos)}</Chip>
                  </div>
                  <p className="text-xs text-[var(--texto-suave)]">{s.motivos.join(" · ")}</p>
                  {podeOperar && (
                    <button className={n === 0 ? "btn-primario" : "btn"} onClick={() => usar(s)} disabled={!!ocupado}>
                      <Icone nome="check" className="h-4 w-4" />
                      {ocupado === chave ? "Salvando…" : "Conciliar com esta"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {podeOperar && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn" onClick={() => aoAbrir("hub")}>
                <Icone nome="busca" className="h-4 w-4" />
                Escolher no HUB
              </button>
              <button className="btn" onClick={() => aoAbrir("lancar")}>
                <Icone nome="mais" className="h-4 w-4" />
                Criar lançamento
              </button>
              <button className="btn" onClick={() => aoAbrir("transferencia")}>
                <Icone nome="transferir" className="h-4 w-4" />
                Transferência
              </button>
              <button className="btn" onClick={() => aoAbrir("ignorar")}>
                <Icone nome="cancelar" className="h-4 w-4" />
                Ignorar
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
