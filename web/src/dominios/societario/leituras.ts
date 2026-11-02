// Leituras e gravações do Societário usadas pelas telas (lista/quadro, painel e ficha do processo).
// As regras de quem pode o quê estão no banco (RLS e funções soc_*); aqui só se lê e se chama.
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { passosParaAvancar } from "./processos";
import type { SocFase, SocProcesso, SocTipo } from "./processos";

export interface DadosProcessos {
  processos: SocProcesso[];
  fases: SocFase[];
  tipos: SocTipo[];
}

/** Processos, fases e tipos da organização (lista, quadro e painel). `semCancelados` para o painel. */
export async function lerProcessos(orgId: string, semCancelados = false): Promise<DadosProcessos> {
  const sb = supabase();
  const [processos, fases, tipos] = await Promise.all([
    lerTudo<SocProcesso>((de, ate) => {
      let q = sb.from("soc_processos").select("*").eq("org_id", orgId);
      if (semCancelados) q = q.neq("status", "cancelado");
      return q.order("numero", { ascending: false }).order("id").range(de, ate);
    }),
    lerTudo<SocFase>((de, ate) => sb.from("soc_fases").select("*").eq("org_id", orgId).order("ordem").order("id").range(de, ate)),
    sb.from("soc_tipos").select("*").eq("org_id", orgId).order("ordem"),
  ]);
  return { processos, fases, tipos: (exigir(tipos) as SocTipo[] | null) ?? [] };
}

/**
 * Leva o processo da fase atual até o destino (quadro: arrastar ou "Avançar fase"). Grava cada passo com
 * soc_mudar_fase; se um passo falhar, para ali e lança o erro (o que já foi gravado fica, e a tela recarrega).
 */
export async function avancarProcesso(fasesDoProcesso: SocFase[], atual: SocFase, destino: SocFase) {
  const passos = passosParaAvancar(fasesDoProcesso, atual, destino);
  if (typeof passos === "string") throw new Error(passos);
  const sb = supabase();
  for (const passo of passos) exigir(await sb.rpc("soc_mudar_fase", { p_fase: passo.fase, p_status: passo.status }));
}

export interface Protocolo {
  id: string;
  orgao: string;
  numero: string;
  data: string;
  link: string | null;
}
export interface Exigencia {
  id: string;
  data: string;
  orgao: string;
  texto: string;
  resposta: string | null;
  reprotocolo_em: string | null;
}
export interface Taxa {
  id: string;
  descricao: string;
  valor: number | null;
  vencimento: string | null;
  pago_por: string | null;
  pago_em: string | null;
}
export interface Evento {
  id: number;
  user_id: string | null;
  tipo: string;
  texto: string;
  visivel_cliente: boolean;
  em: string;
}

export interface DadosFicha {
  processo: SocProcesso;
  tipo: SocTipo | null;
  fases: SocFase[];
  protocolos: Protocolo[];
  exigencias: Exigencia[];
  taxas: Taxa[];
  eventos: Evento[];
  arquivos: Arquivo[];
}

/**
 * Grava um registro do processo (protocolo, taxa…) e depois a linha do histórico, em duas etapas. Se o registro
 * falhar, lança o erro (nada foi gravado). Se só o histórico falhar, o registro fica e a função devolve o aviso para a
 * tela mostrar (a pessoa precisa saber que o histórico ficou sem essa linha).
 */
export async function registrarComHistorico(
  orgId: string,
  processoId: string,
  tabela: "soc_protocolos" | "soc_taxas",
  dados: Record<string, unknown>,
  evento: string,
  visivelCliente = false,
): Promise<string | null> {
  const sb = supabase();
  exigir(await sb.from(tabela).insert({ ...dados, org_id: orgId, processo_id: processoId }));
  const ev = await sb
    .from("soc_eventos")
    .insert({ org_id: orgId, processo_id: processoId, tipo: tabela.replace("soc_", ""), texto: evento, visivel_cliente: visivelCliente });
  return ev.error ? `Registro salvo, mas o histórico não foi atualizado: ${traduzirErro(ev.error)}` : null;
}

/** Tudo da ficha de um processo. */
export async function lerFicha(id: string): Promise<DadosFicha> {
  const sb = supabase();
  const [a, f, pr, ex, tx, ev, ar] = await Promise.all([
    sb.from("soc_processos").select("*").eq("id", id).single(),
    sb.from("soc_fases").select("*").eq("processo_id", id).order("ordem"),
    sb.from("soc_protocolos").select("*").eq("processo_id", id).order("data", { ascending: false }),
    sb.from("soc_exigencias").select("*").eq("processo_id", id).order("data", { ascending: false }),
    sb.from("soc_taxas").select("*").eq("processo_id", id).order("vencimento"),
    sb.from("soc_eventos").select("*").eq("processo_id", id).order("em", { ascending: false }).limit(200),
    sb.from("hub_arquivos").select("*").eq("ref_id", id).order("enviado_em", { ascending: false }),
  ]);
  const processo = exigir(a) as SocProcesso;
  const t = await sb.from("soc_tipos").select("*").eq("id", processo.tipo_id).maybeSingle();
  return {
    processo,
    tipo: (exigir(t) as SocTipo | null) ?? null,
    fases: (exigir(f) as SocFase[] | null) ?? [],
    protocolos: (exigir(pr) as Protocolo[] | null) ?? [],
    exigencias: (exigir(ex) as Exigencia[] | null) ?? [],
    taxas: (exigir(tx) as Taxa[] | null) ?? [],
    eventos: (exigir(ev) as Evento[] | null) ?? [],
    arquivos: (exigir(ar) as Arquivo[] | null) ?? [],
  };
}
