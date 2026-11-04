// Contratos › Envio: se o envio automático das faturas por e-mail e WhatsApp está ligado, a fila e o que falhou (tela
// em dominios/contratos/componentes/TelaEnvio). Só quem gere o módulo Contratos abre (navegacao.ts, minimo "gerir").
"use client";

import { TelaEnvio } from "@/dominios/contratos/componentes/TelaEnvio";

export default function PaginaEnvio() {
  return <TelaEnvio />;
}
