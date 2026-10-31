"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Conversa {
  id: string;
  org_id: string;
  cliente_id: string;
  assunto: string;
  titulo: string;
  status: "novo" | "em_atendimento" | "aguardando_cliente" | "resolvido";
  setor_id: string | null;
  responsavel_id: string | null;
  aberto_por: string | null;
  prazo_resposta: string | null;
  respondida_em: string | null;
  resolvida_em: string | null;
  avaliacao: number | null;
  tarefa_id: string | null;
  processo_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  autor_id: string | null;
  autor_nome: string | null;
  autor_tipo: "cliente" | "equipe" | "sistema";
  texto: string;
  anexo_id: string | null;
  interna: boolean;
  criado_em: string;
}

export const ASSUNTOS: { id: string; nome: string }[] = [
  { id: "duvida", nome: "Dúvida" },
  { id: "admissao_demissao", nome: "Admissão / demissão" },
  { id: "nota_fiscal", nome: "Nota fiscal" },
  { id: "alteracao_contratual", nome: "Alteração contratual" },
  { id: "documento", nome: "Envio de documento" },
  { id: "outro", nome: "Outro" },
];

export const STATUS_CONVERSA: { id: Conversa["status"]; nome: string; cor: string }[] = [
  { id: "novo", nome: "Novo", cor: "bg-red-50 text-red-700" },
  { id: "em_atendimento", nome: "Em atendimento", cor: "bg-sky-50 text-sky-800" },
  { id: "aguardando_cliente", nome: "Aguardando cliente", cor: "bg-violet-50 text-violet-800" },
  { id: "resolvido", nome: "Resolvido", cor: "bg-emerald-50 text-emerald-800" },
];

export const nomeAssunto = (a: string) => ASSUNTOS.find((x) => x.id === a)?.nome ?? a;

/** Mensagens de uma conversa, vivas via Supabase Realtime. */
export function useMensagens(conversaId: string | null) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const carregar = useCallback(async () => {
    if (!conversaId) return setMensagens([]);
    const { data } = await supabase().from("portal_mensagens").select("*").eq("conversa_id", conversaId).order("criado_em");
    setMensagens((data as Mensagem[]) ?? []);
  }, [conversaId]);

  useEffect(() => {
    carregar();
    if (!conversaId) return;
    const sb = supabase();
    const canal = sb
      .channel(`chat-${conversaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "portal_mensagens", filter: `conversa_id=eq.${conversaId}` },
        (p) => setMensagens((l) => (l.some((m) => m.id === (p.new as Mensagem).id) ? l : [...l, p.new as Mensagem])),
      )
      .subscribe();
    return () => {
      sb.removeChannel(canal);
    };
  }, [conversaId, carregar]);

  return { mensagens, recarregar: carregar };
}
