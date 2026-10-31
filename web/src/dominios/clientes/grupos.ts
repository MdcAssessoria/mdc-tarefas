// Grupos de clientes (etiquetas livres como "Piloto HUB"): lista única e em ordem alfabética para filtros e sugestões.
import type { Cliente } from "@/lib/types";

/** Todos os grupos usados pelos clientes, sem repetição, em ordem alfabética. */
export function gruposDosClientes(clientes: Pick<Cliente, "grupos">[]): string[] {
  return [...new Set(clientes.flatMap((c) => c.grupos ?? []))].sort((a, b) => a.localeCompare(b));
}
