// Leituras do módulo Contratos (sempre paginadas: o Supabase corta em 1000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import type { Titulo } from "@/dominios/financeiro/tipos";
import type { EnvioDaFatura, EventoContrato, Fatura, ReajusteRecorrente, Recorrente } from "./tipos";

export const lerContratos = (cliente: string) =>
  lerTudo<Recorrente>((de, ate) =>
    supabase().from("fin_recorrentes").select("*").eq("cliente_id", cliente).order("descricao").order("id").range(de, ate),
  );

export const lerReajustes = (cliente: string) =>
  lerTudo<ReajusteRecorrente>((de, ate) =>
    supabase()
      .from("fin_recorrente_reajustes")
      .select(
        "id,recorrente_id,origem,referencia,indice,percentual,percentual_proposto,valor_antes,valor_depois,titulos_atualizados,observacao,em",
      )
      .eq("cliente_id", cliente)
      .order("em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Contas lançadas por um contrato, do mês mais recente ao mais antigo. */
export const lerContasDoContrato = (contrato: string) =>
  lerTudo<Titulo>((de, ate) =>
    supabase()
      .from("fin_titulos")
      .select("*")
      .eq("recorrente_id", contrato)
      .order("competencia", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Histórico do contrato (mais recente primeiro). */
export const lerEventos = (contrato: string) =>
  lerTudo<EventoContrato>((de, ate) =>
    supabase()
      .from("fin_recorrente_eventos")
      .select("id,recorrente_id,tipo,texto,por,em")
      .eq("recorrente_id", contrato)
      .order("em", { ascending: false })
      .order("id", { ascending: false })
      .range(de, ate),
  );

/** Anexos do contrato (contrato assinado, aditivos). */
export const lerAnexos = (contrato: string) =>
  lerTudo<Arquivo>((de, ate) =>
    supabase()
      .from("hub_arquivos")
      .select("*")
      .eq("app", "contratos")
      .eq("ref_id", contrato)
      .order("enviado_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Faturas dos contratos a receber da empresa (mais recentes primeiro). */
export const lerFaturas = (cliente: string) =>
  lerTudo<Fatura>((de, ate) =>
    supabase()
      .from("fin_faturas")
      .select("*")
      .eq("cliente_id", cliente)
      .order("emissao", { ascending: false })
      .order("sequencia", { ascending: false })
      .range(de, ate),
  );

/** Fila de envio das faturas da empresa. */
export const lerEnvios = (cliente: string) =>
  lerTudo<EnvioDaFatura>((de, ate) =>
    supabase()
      .from("fin_envios")
      .select("id,fatura_id,canal,destino,conteudo,situacao,tentativas,ultimo_erro,enviado_em")
      .eq("cliente_id", cliente)
      .order("id")
      .range(de, ate),
  );
