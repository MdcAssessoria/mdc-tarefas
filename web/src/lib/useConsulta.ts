// Hook para carregar dados ao abrir a tela: substitui o trio useState(dados) + useState(erro) + useEffect(carregar).
import { useCallback, useEffect, useState } from "react";
import { traduzirErro } from "./erros";

export interface Consulta<T> {
  /** Último resultado (continua visível enquanto recarrega). undefined antes da primeira resposta. */
  dados: T | undefined;
  /** Mensagem de erro já traduzida, ou null. */
  erro: string | null;
  /** true enquanto busca (na primeira vez e a cada recarregar). */
  carregando: boolean;
  /** Busca de novo (ex.: depois de gravar). */
  recarregar: () => void;
}

/**
 * Executa `buscar` ao montar e sempre que `buscar` mudar. Passe `buscar` dentro de useCallback com as
 * dependências da consulta (ex.: [org.id]); o lint confere essas dependências.
 * Ex.: `const { dados, erro } = useConsulta(useCallback(async () => exigir(await sb.from("x").select("*")), []))`.
 */
export function useConsulta<T>(buscar: () => Promise<T>): Consulta<T> {
  const [pedido, setPedido] = useState(0);
  const [resultado, setResultado] = useState<{ buscar: () => Promise<T>; pedido: number; dados?: T; erro: string | null } | null>(null);

  useEffect(() => {
    let ativo = true;
    buscar().then(
      (dados) => ativo && setResultado({ buscar, pedido, dados, erro: null }),
      (e: unknown) => ativo && setResultado((r) => ({ buscar, pedido, dados: r?.dados, erro: traduzirErro(e) })),
    );
    return () => {
      ativo = false;
    };
  }, [buscar, pedido]);

  const recarregar = useCallback(() => setPedido((p) => p + 1), []);
  return {
    dados: resultado?.dados,
    erro: resultado?.erro ?? null,
    carregando: !resultado || resultado.buscar !== buscar || resultado.pedido !== pedido,
    recarregar,
  };
}
