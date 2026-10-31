// Preferências guardadas neste navegador (localStorage): visão escolhida, menu recolhido, filtros, empresa do portal.
// Só para conveniências da pessoa; nada que precise ir para o banco. Toda chave usada no HUB fica listada em CHAVES.
// Se o navegador bloquear o armazenamento (aba anônima, por exemplo), o valor vale só enquanto a página estiver aberta.
import { useCallback, useSyncExternalStore } from "react";

/** Todas as chaves de localStorage do HUB. Não mude os textos: mudar apaga a preferência já salva das pessoas. */
export const CHAVES = {
  organizacao: "mdc-tarefas:org",
  menuRecolhido: "hub-mdc:menu-recolhido",
  periodoDemonstrativos: "mdc-periodo-demonstrativos",
  visaoSocietario: "mdc-societario:visao",
  visaoTarefas: "mdc-tarefas:visao",
  filtrosTarefas: (orgId: string) => `mdc-tarefas:filtros:${orgId}`,
  empresaPortal: "mdc-portal:empresa",
} as const;

const memoria = new Map<string, string>();
const EVENTO = "hub-mdc:armazenamento-local";

/** Lê uma preferência (null se não houver). Nunca lança erro. */
export function lerLocal(chave: string): string | null {
  if (memoria.has(chave)) return memoria.get(chave)!;
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/** Grava uma preferência e avisa os componentes que usam useEstadoLembrado. Nunca lança erro. */
export function gravarLocal(chave: string, valor: string): void {
  memoria.set(chave, valor);
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: fica só na memória desta página
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/**
 * Estado de texto lembrado neste navegador. Começa com `inicial` (inclusive na renderização do servidor) e passa
 * ao valor salvo assim que a página abre. `aceitar` descarta valores salvos que não valem mais.
 */
export function useEstadoLembrado<T extends string>(
  chave: string,
  inicial: T,
  aceitar: (v: string) => boolean = () => true,
): [T, (v: T) => void] {
  const salvo = useSyncExternalStore(
    assinar,
    () => lerLocal(chave),
    () => null,
  );
  const valor = salvo !== null && aceitar(salvo) ? (salvo as T) : inicial;
  const mudar = useCallback((v: T) => gravarLocal(chave, v), [chave]);
  return [valor, mudar];
}
