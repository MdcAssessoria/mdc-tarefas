// Contratos › Boleto: contas da MDC no Ledgra Link (Itaú e Santander) para o boleto das faturas (tela em
// dominios/contratos/componentes/TelaBoleto). Só quem gere o módulo Contratos abre (navegacao.ts, minimo "gerir").
"use client";

import { TelaBoleto } from "@/dominios/contratos/componentes/TelaBoleto";

export default function PaginaBoleto() {
  return <TelaBoleto />;
}
