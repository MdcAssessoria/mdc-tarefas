// Nova tarefa para vários clientes de uma vez (pedido do Edvaldo, 18/11/2026): filtro dos clientes na escolha
// (busca, regime, grupo), responsável de cada tarefa (o escolhido ou o da carteira do cliente no setor) e as linhas
// que vão para a tabela tarefas numa única gravação (uma transação: entram todas ou nenhuma). Testes em lote.test.ts.
import type { Cliente } from "@/dominios/clientes/tipos";
import { nomeCliente } from "@/dominios/clientes/nome";

/** Máximo de clientes numa gravação (evita um clique errado criar milhares de tarefas). */
export const LIMITE_LOTE = 500;
/** Valor especial do campo Responsável no lote: o responsável de cada cliente no setor escolhido. */
export const RESPONSAVEL_DA_CARTEIRA = "__carteira__";

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type FiltroClientes = { busca: string; regime: string; grupo: string };

/** Clientes ativos que passam no filtro (nome, razão social, CNPJ ou código do Domínio; regime; grupo). */
export function filtrarClientes(clientes: Cliente[], f: FiltroClientes): Cliente[] {
  const q = sem(f.busca.trim());
  const qNum = f.busca.replace(/\D/g, "");
  return clientes.filter((c) => {
    if (!c.ativo) return false;
    if (f.regime && c.regime !== f.regime) return false;
    if (f.grupo && !(c.grupos ?? []).includes(f.grupo)) return false;
    if (!q) return true;
    const texto = sem(`${c.razao_social} ${c.nome_fantasia ?? ""} ${c.codigo_dominio ?? ""}`);
    return q.split(/\s+/).every((p) => texto.includes(p)) || (qNum.length >= 3 && (c.cnpj ?? "").replace(/\D/g, "").includes(qNum));
  });
}

/** Responsável de cada cliente: o escolhido, ou o da carteira (setor) quando escolheu "da carteira". */
export function responsavelDoCliente(
  clienteId: string,
  escolhido: string,
  setorId: string,
  carteira: { cliente_id: string; setor_id: string; user_id: string }[],
): string | null {
  if (escolhido !== RESPONSAVEL_DA_CARTEIRA) return escolhido || null;
  return carteira.find((r) => r.cliente_id === clienteId && r.setor_id === setorId)?.user_id ?? null;
}

/** Linhas da tabela tarefas: uma por cliente, com os mesmos dados e o responsável de cada um. */
export function linhasDoLote<T extends Record<string, unknown>>(
  dados: T,
  clienteIds: string[],
  responsavel: (clienteId: string) => string | null,
): (T & { cliente_id: string; responsavel_id: string | null })[] {
  return [...new Set(clienteIds)].map((id) => ({ ...dados, cliente_id: id, responsavel_id: responsavel(id) }));
}

/** Clientes que já têm uma tarefa aberta com o mesmo título e competência (para não duplicar). */
export function jaTem(
  existentes: { cliente_id: string | null; titulo: string; competencia: string | null }[],
  titulo: string,
  competencia: string | null,
): Set<string> {
  const t = sem(titulo.trim());
  return new Set(
    existentes
      .filter((e) => e.cliente_id && sem(e.titulo.trim()) === t && (e.competencia ?? null) === competencia)
      .map((e) => e.cliente_id as string),
  );
}

/** Frase do resultado: "Tarefa criada para 12 clientes (2 já tinham e ficaram de fora)." */
export function resumoLote(criadas: number, pulados: number): string {
  const base = criadas === 1 ? "Tarefa criada para 1 cliente" : `Tarefa criada para ${criadas} clientes`;
  return pulados ? `${base} (${pulados} já ${pulados === 1 ? "tinha" : "tinham"} essa tarefa e ficaram de fora).` : `${base}.`;
}

/** Nomes curtos de uma lista de clientes (para o aviso), no máximo `max` e "e mais N". */
export function nomesCurtos(clientes: Cliente[], ids: Iterable<string>, max = 5): string {
  const nomes = [...ids].map((id) => nomeCliente(clientes.find((c) => c.id === id))).filter(Boolean);
  return nomes.length <= max ? nomes.join(", ") : `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`;
}
