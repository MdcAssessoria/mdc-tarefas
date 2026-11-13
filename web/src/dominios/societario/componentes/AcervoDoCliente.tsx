// Ficha do processo › "Documentos do cliente": o acervo vigente do cliente (contrato, última alteração ou
// consolidação, cartão CNPJ e documentos dos sócios) como base da alteração, com abrir, "Guardar documento" e o atalho
// para o acervo completo em Societário › Documentos dos clientes. Fica na coluna da direita da ficha, acima da linha
// do tempo, para a base da alteração estar à vista desde o início.
"use client";

import Link from "next/link";
import { abrirArquivo } from "@/lib/arquivos/armazenamento";
import { fmtData } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import { documentosBase, nomeCategoria } from "../acervo";
import type { DocumentoAcervo } from "../acervo";
import { Bloco } from "./SecoesProcesso";

export function AcervoDoCliente({
  clienteId,
  acervo,
  carregando,
  podeOperar,
  aoGuardar,
  aoErro,
}: {
  clienteId: string;
  acervo: DocumentoAcervo[];
  carregando: boolean;
  podeOperar: boolean;
  aoGuardar: () => void;
  aoErro: (e: unknown) => void;
}) {
  const base = documentosBase(acervo);
  const outros = acervo.length - base.length;
  return (
    <Bloco
      titulo="Documentos do cliente"
      icone="pasta"
      contador={acervo.length || undefined}
      vazio={
        carregando
          ? "Carregando o acervo…"
          : "O acervo deste cliente está vazio. Guarde o contrato social, a última alteração e o cartão CNPJ para servirem de base."
      }
      rodape={
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {podeOperar && (
            <button className="btn justify-center" onClick={aoGuardar}>
              <Icone nome="mais" className="h-4 w-4" />
              Guardar documento
            </button>
          )}
          <Link href={`/societario/documentos?cliente=${clienteId}`} className="btn justify-center">
            <Icone nome="expandir" className="h-4 w-4" />
            Ver acervo completo{outros > 0 ? ` (+${outros})` : ""}
          </Link>
        </div>
      }
    >
      {base.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-2 py-2">
          <button
            className="flex min-w-0 items-start gap-2 text-left hover:underline"
            onClick={() => d.arquivo && abrirArquivo(d.arquivo.caminho, d.arquivo.nome).catch(aoErro)}
            title="Abrir o documento"
          >
            <Icone nome="arquivo" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--texto-suave)]" />
            <span className="min-w-0">
              <span className="block font-medium">{nomeCategoria(d.categoria)}</span>
              <span className="block truncate text-xs text-[var(--texto-suave)]">
                {[d.descricao, d.data_documento && fmtData(d.data_documento), d.registro].filter(Boolean).join(" · ") || d.arquivo?.nome}
              </span>
            </span>
          </button>
          <span className="chip shrink-0 bg-emerald-50 text-emerald-800">Vigente</span>
        </li>
      ))}
    </Bloco>
  );
}
