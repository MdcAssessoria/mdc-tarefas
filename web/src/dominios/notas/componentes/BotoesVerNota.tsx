// Botões só com ícone na linha da nota (pedido do Edvaldo, 03/11/2026): "Ver a nota" abre o espelho DANFE/DANFSe e
// "Baixar PDF" gera e baixa o PDF do espelho direto, sem abrir a janela. Área de toque de 40 px; nome acessível e
// dica (title) em cada um. Sem XML guardado os dois ficam desligados, explicando o motivo na dica.
"use client";

import { useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { traduzirErro } from "@/lib/erros";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { lerEspelhoDaNota } from "../leituras";
import type { Nota } from "../tipos";

const BOTAO = "btn !min-h-10 !w-10 shrink-0 !p-0";
const SEM_XML = "O XML desta nota ainda não está no HUB";

export function BotoesVerNota({
  nota,
  avisar,
  aoVer,
}: {
  nota: Nota;
  avisar: (t: string, tom?: "erro") => void;
  aoVer: () => void;
}) {
  const [gerando, setGerando] = useState(false);
  const temXml = !!nota.xml_caminho;

  async function baixarPdf() {
    setGerando(true);
    try {
      const [espelho, { gerarEspelhoPdf }] = await Promise.all([lerEspelhoDaNota(nota), import("../espelhoPdf")]);
      baixarBytes(await gerarEspelhoPdf(espelho), espelho.arquivo);
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={BOTAO}
        aria-label="Ver a nota"
        title={temXml ? "Ver a nota (layout do DANFE / DANFSe)" : SEM_XML}
        disabled={!temXml}
        onClick={aoVer}
      >
        <Icone nome="olho" className="h-5 w-5" />
      </button>
      <button
        type="button"
        className={BOTAO}
        aria-label="Baixar PDF"
        title={!temXml ? SEM_XML : gerando ? "Gerando o PDF…" : "Baixar a nota em PDF"}
        aria-busy={gerando}
        disabled={!temXml || gerando}
        onClick={baixarPdf}
      >
        <Icone nome={gerando ? "relogio" : "baixar"} className="h-5 w-5" />
      </button>
    </>
  );
}
