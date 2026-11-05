// Portal do Cliente › Fale com a MDC: as solicitações da empresa (lista) e a conversa aberta. No celular mostra uma de
// cada vez, com "Voltar" (PainelConversas). Abrir solicitação passa pela função do banco portal_abrir_conversa.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { fmtDataHora } from "@/lib/formato/datas";
import { useAviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { STATUS_CONVERSA, nomeAssunto } from "@/dominios/atendimento/chat";
import type { Conversa } from "@/dominios/atendimento/chat";
import { ChatMensagens } from "@/dominios/atendimento/componentes/ChatMensagens";
import { NovaConversa } from "@/dominios/atendimento/componentes/NovaConversa";
import { ChipConversa, PainelConversas, VoltarConversas } from "@/dominios/atendimento/componentes/PainelConversas";
import type { EmpresaPortal } from "../tipos";

/** Nome da situação do ponto de vista do cliente ("Responder" quando a MDC espera por ele). */
const situacaoCliente = (s: Conversa["status"]) =>
  s === "aguardando_cliente" ? "Responder" : (STATUS_CONVERSA.find((x) => x.id === s)?.nome ?? s);

export function PortalChat({ emp }: { emp: EmpresaPortal }) {
  const [sel, setSel] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const { aviso, mostrar } = useAviso();

  const consulta = useConsulta(
    useCallback(
      async () =>
        exigir(
          await supabase()
            .from("portal_conversas")
            .select("*")
            .eq("cliente_id", emp.cliente_id)
            .order("atualizado_em", { ascending: false }),
        ) as Conversa[],
      [emp.cliente_id],
    ),
  );
  const { recarregar } = consulta;
  const lista = useMemo(() => consulta.dados ?? [], [consulta.dados]);

  useEffect(() => {
    const sb = supabase();
    const canal = sb
      .channel(`portal-conv-${emp.cliente_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portal_conversas", filter: `cliente_id=eq.${emp.cliente_id}` },
        recarregar,
      )
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [emp.cliente_id, recarregar]);

  const atual = lista.find((c) => c.id === sel);

  async function gravar(campos: Partial<Conversa>, texto: string) {
    if (!atual) return;
    try {
      exigir(await supabase().from("portal_conversas").update(campos).eq("id", atual.id));
      mostrar(texto);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
    recarregar();
  }

  const botaoNova = (
    <button className="btn-primario" onClick={() => setNova(true)}>
      <Icone nome="mais" className="h-4 w-4" />
      Nova solicitação
    </button>
  );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Fale com a MDC"
        descricao="Peça, pergunte ou envie documentos. A mensagem chega direto ao responsável pelo assunto."
        acoes={lista.length > 0 && botaoNova}
      />
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={4} />
      ) : !lista.length ? (
        <EstadoVazio icone="chat" titulo="Você ainda não abriu nenhuma solicitação" acao={botaoNova}>
          Dúvidas, admissões e demissões, notas fiscais, alterações no contrato da empresa: escreva aqui e acompanhe a resposta da MDC.
        </EstadoVazio>
      ) : (
        <PainelConversas
          aberta={!!atual}
          alturaComputador="lg:h-[max(480px,calc(100dvh-260px))]"
          lista={
            <ul className="flex-1 overflow-y-auto">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSel(c.id)}
                    aria-current={sel === c.id}
                    className={`block w-full border-b border-[var(--borda)] px-3 py-2.5 text-left text-sm hover:bg-[var(--fundo)] ${sel === c.id ? "bg-[var(--fundo)] shadow-[inset_3px_0_0_var(--destaque-escuro)]" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{c.titulo}</span>
                      <ChipConversa status={c.status} nome={situacaoCliente(c.status)} />
                    </div>
                    <div className="text-xs text-neutral-500">
                      {nomeAssunto(c.assunto)} · {fmtDataHora(c.atualizado_em)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          }
          conversa={
            atual ? (
              <>
                <div className="flex flex-wrap items-start gap-2 border-b border-[var(--borda)] p-3">
                  <VoltarConversas aoVoltar={() => setSel(null)} />
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-semibold">{atual.titulo}</div>
                    <div className="text-xs text-neutral-500">
                      {nomeAssunto(atual.assunto)} · aberta em {fmtDataHora(atual.criado_em)}
                    </div>
                  </div>
                  {atual.status !== "resolvido" ? (
                    <button
                      className="btn !min-h-9 !py-1"
                      onClick={() => gravar({ status: "resolvido" }, "Solicitação marcada como resolvida.")}
                    >
                      <Icone nome="check" className="h-4 w-4" />
                      Resolvida
                    </button>
                  ) : (
                    <div className="flex items-center gap-0.5" role="group" aria-label="Avalie o atendimento">
                      <span className="mr-1 text-xs text-neutral-500">Avalie:</span>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => gravar({ avaliacao: n }, "Obrigado pela avaliação!")}
                          className={`grid h-8 w-7 place-items-center text-xl ${(atual.avaliacao ?? 0) >= n ? "text-[var(--destaque-escuro)]" : "text-neutral-300"}`}
                          aria-label={`Nota ${n} de 5`}
                          aria-pressed={(atual.avaliacao ?? 0) >= n}
                        >
                          <Icone nome="estrela" className={`h-5 w-5 ${(atual.avaliacao ?? 0) >= n ? "fill-current" : ""}`} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  <ChatMensagens
                    conversaId={atual.id}
                    orgId={emp.org_id}
                    clienteId={emp.cliente_id}
                    lado="cliente"
                    fechada={atual.status === "resolvido"}
                  />
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center text-sm text-neutral-500">
                <div>
                  <Icone nome="chat" className="mx-auto mb-2 h-8 w-8 text-[var(--marca)] opacity-40" />
                  Escolha uma solicitação na lista ou abra uma nova.
                </div>
              </div>
            )
          }
        />
      )}
      {nova && (
        <NovaConversa
          cliente={emp.cliente_id}
          titulo="Nova solicitação para a MDC"
          descricao="A mensagem chega direto ao responsável da MDC pelo assunto. Arquivos podem ser anexados na conversa."
          aoFechar={() => setNova(false)}
          aoCriar={(id) => {
            setNova(false);
            recarregar();
            setSel(id);
            mostrar("Solicitação enviada. A MDC responde por aqui.");
          }}
        />
      )}
    </div>
  );
}
