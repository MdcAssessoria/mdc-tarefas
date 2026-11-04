// Ações sobre oportunidades usadas no funil, nos leads e na ficha: mudar de etapa (perdido pede o motivo; ganho
// confirma e cadastra o cliente), arquivar com motivo (JanelaMotivo), devolver ao funil e excluir de vez (só quem gere,
// com motivo; lead que virou cliente ou tem contrato assinado o banco recusa).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import type { TomAviso } from "@/components/ui/Aviso";
import type { Etapa, Oportunidade } from "../crm";
import { arquivarOportunidades, converterEmCliente, excluirOportunidades, moverEtapa } from "../repositorio";

type Pedido =
  | { tipo: "perdido"; o: Oportunidade }
  | { tipo: "arquivar"; lista: Oportunidade[] }
  | { tipo: "excluir"; lista: Oportunidade[]; depois?: () => void };

export function useAcoesOportunidade(aoMudar: () => void, avisar: (texto: string, tom?: TomAviso) => void) {
  const [confirmacao, confirmar] = useConfirmar();
  const [pedido, setPedido] = useState<Pedido | null>(null);

  async function tentar(f: () => Promise<void>) {
    try {
      await f();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    }
    aoMudar();
  }

  async function virarCliente(o: Oportunidade) {
    const sim = await confirmar({
      titulo: `${o.empresa} fechou contrato?`,
      descricao:
        "A oportunidade vai para “Ganho” e a empresa é cadastrada como cliente da carteira (Tarefas, Portal e Demonstrativos). Depois complete o código do Domínio e os responsáveis em Configurações.",
      botao: "Sim, virar cliente",
    });
    if (sim)
      await tentar(async () => {
        await converterEmCliente(o.id);
        avisar(`${o.empresa} agora é cliente da carteira.`);
      });
  }

  async function mover(o: Oportunidade, etapa: Etapa) {
    if (o.etapa === etapa) return;
    if (etapa === "perdido") return setPedido({ tipo: "perdido", o });
    if (etapa === "ganho") return virarCliente(o);
    await tentar(() => moverEtapa(o.id, etapa));
  }

  function arquivar(lista: Oportunidade[]) {
    if (lista.length) setPedido({ tipo: "arquivar", lista });
  }

  /** depois: o que fazer quando der certo (a ficha volta para o funil, porque a oportunidade não existe mais). */
  function excluir(lista: Oportunidade[], depois?: () => void) {
    if (lista.length) setPedido({ tipo: "excluir", lista, depois });
  }

  const restaurar = async (lista: Oportunidade[]) => {
    if (!lista.length) return;
    if (lista.length > 1) {
      const sim = await confirmar({
        titulo: `Devolver ${lista.length} oportunidades ao funil?`,
        descricao: "Elas saem de “Arquivados” e voltam para a etapa em que estavam. Dá para arquivar de novo depois.",
        botao: "Devolver ao funil",
      });
      if (!sim) return;
    }
    await tentar(async () => {
      const n = await arquivarOportunidades(
        lista.map((o) => o.id),
        "Devolvida ao funil",
        false,
      );
      avisar(n === 1 ? `${lista[0].empresa} voltou ao funil.` : `${n} oportunidades voltaram ao funil.`);
    });
  };

  const fechar = () => setPedido(null);
  const janela = (
    <>
      {confirmacao}
      {pedido?.tipo === "perdido" && (
        <JanelaMotivo
          titulo={`Marcar ${pedido.o.empresa} como perdida`}
          descricao="Conte por que não avançou (preço, escolheu outro escritório, sem retorno…). O motivo fica na ficha e ajuda a melhorar as próximas propostas."
          botao="Marcar como perdida"
          aoFechar={fechar}
          aoConfirmar={async (motivo) => {
            await moverEtapa(pedido.o.id, "perdido", motivo);
            fechar();
            aoMudar();
          }}
        />
      )}
      {pedido?.tipo === "arquivar" && (
        <JanelaMotivo
          titulo={pedido.lista.length === 1 ? `Arquivar ${pedido.lista[0].empresa}` : `Arquivar ${pedido.lista.length} oportunidades`}
          descricao="Sai do funil e vai para “Arquivados”. Nada é apagado: dá para devolver ao funil quando quiser. Exemplos de motivo: sem retorno, sem interesse, duplicado."
          botao="Arquivar"
          aoFechar={fechar}
          aoConfirmar={async (motivo) => {
            const n = await arquivarOportunidades(
              pedido.lista.map((o) => o.id),
              motivo,
              true,
            );
            fechar();
            avisar(n === 1 ? "Arquivada. Está em “Arquivados” e pode voltar ao funil." : `${n} oportunidades arquivadas.`);
            aoMudar();
          }}
        />
      )}
      {pedido?.tipo === "excluir" && (
        <JanelaMotivo
          titulo={pedido.lista.length === 1 ? `Excluir ${pedido.lista[0].empresa} de vez` : `Excluir ${pedido.lista.length} oportunidades de vez`}
          descricao={
            <>
              Some do funil, dos Arquivados e das listas, junto com o histórico de conversas e os rascunhos de contrato.{" "}
              <b>Não dá para desfazer.</b> Use para lead de teste, duplicado ou que entrou por engano. Se for só um lead que não
              avançou, prefira Arquivar (dá para devolver ao funil). Quem já virou cliente ou tem contrato assinado não pode ser
              excluído.
            </>
          }
          botao="Excluir de vez"
          aoFechar={fechar}
          aoConfirmar={async (motivo) => {
            const n = await excluirOportunidades(
              pedido.lista.map((o) => o.id),
              motivo,
            );
            const depois = pedido.depois;
            fechar();
            avisar(n === 1 ? `${pedido.lista[0].empresa} foi excluída.` : `${n} oportunidades excluídas.`);
            if (depois) depois();
            else aoMudar();
          }}
        />
      )}
    </>
  );

  return { janela, mover, arquivar, excluir, restaurar, virarCliente };
}
