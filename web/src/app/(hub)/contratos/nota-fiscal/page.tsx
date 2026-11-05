// Contratos › Regras fiscais (antes "Nota fiscal (NFS-e)"): emitente, regras por tipo de serviço e notas enviadas (tela em
// dominios/contratos/componentes/TelaNotaFiscal). Só quem gere o módulo Contratos abre (navegacao.ts, minimo "gerir").
"use client";

import { TelaNotaFiscal } from "@/dominios/contratos/componentes/TelaNotaFiscal";

export default function PaginaNotaFiscal() {
  return <TelaNotaFiscal />;
}
