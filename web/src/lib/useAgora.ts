// Hook com o horário atual (milissegundos) que se atualiza sozinho. Use no lugar de Date.now() durante o render,
// que o React não permite (o resultado mudaria a cada render) e não atualizaria a tela com o passar do tempo.
import { useEffect, useState } from "react";

/** Horário atual, atualizado a cada `intervaloMs` (padrão: 1 minuto). */
export function useAgora(intervaloMs = 60_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}
