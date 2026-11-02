// Botões PDF e Excel do que está na tela (regra 8.3.3). A lista é montada só no clique, com lib/arquivos/exportarLista.
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { exportarPdf, exportarXlsx } from "@/lib/arquivos/exportarLista";
import type { ListaExportavel } from "@/lib/arquivos/exportarLista";
import { Icone } from "./Icone";

export function BotoesExportar<L>({
  montar,
  vazio,
  avisar,
}: {
  montar: () => ListaExportavel<L>;
  vazio: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  async function fazer(f: typeof exportarPdf) {
    setOcupado(true);
    try {
      await f(montar());
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <button className="btn" onClick={() => fazer(exportarPdf)} disabled={vazio || ocupado} title="Baixar a lista filtrada em PDF">
        <Icone nome="documento" className="h-4 w-4" />
        PDF
      </button>
      <button className="btn" onClick={() => fazer(exportarXlsx)} disabled={vazio || ocupado} title="Baixar a lista filtrada em Excel">
        <Icone nome="planilha" className="h-4 w-4" />
        Excel
      </button>
    </>
  );
}
