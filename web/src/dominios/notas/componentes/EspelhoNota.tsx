// "Ver a nota": janela com o espelho da nota montado do XML guardado (estilo DANFE para NF-e/NFC-e, DANFSe para
// NFS-e, DACTE para CT-e; lista de campos para os demais), com "Baixar PDF" (mesmo desenho, A4) e "Imprimir".
// No celular os quadros empilham em duas colunas e a tabela de itens rola na horizontal dentro do quadro.
"use client";

import { useCallback, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { Icone } from "@/components/ui/Icone";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { barras128C } from "@/lib/codigoBarras128";
import { lerXmlGuardado } from "../leituras";
import { FAIXA_ESPELHO, montarEspelho } from "../espelho";
import type { BlocoEspelho, CampoEspelho, Espelho } from "../espelho";
import type { Nota } from "../tipos";
import { BotaoXml, fornecedorDa, nomeModelo } from "./Comuns";

export function EspelhoNota({ nota, avisar, aoFechar }: { nota: Nota; avisar: (t: string, tom?: "erro") => void; aoFechar: () => void }) {
  const caminho = nota.xml_caminho;
  const consulta = useConsulta(
    useCallback(async () => {
      if (!caminho) throw new Error("Esta nota não tem o XML guardado no HUB.");
      return montarEspelho(await lerXmlGuardado(caminho), { chave: nota.chave, numero: nota.numero });
    }, [caminho, nota.chave, nota.numero]),
  );
  const e = consulta.dados;
  const [ocupado, setOcupado] = useState<"pdf" | "imprimir" | null>(null);

  async function pdf(acao: "pdf" | "imprimir") {
    if (!e) return;
    setOcupado(acao);
    try {
      const { gerarEspelhoPdf } = await import("../espelhoPdf");
      const bytes = await gerarEspelhoPdf(e);
      if (acao === "pdf") baixarBytes(bytes, e.arquivo);
      else imprimirPdf(bytes);
    } catch (erro) {
      avisar(traduzirErro(erro), "erro");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Modal
      titulo={e?.titulo ?? `${nomeModelo(nota.modelo)} ${nota.numero ?? ""} · ${fornecedorDa(nota)}`}
      descricao="Espelho da nota montado a partir do XML guardado no HUB. Baixe em PDF ou imprima."
      aoFechar={aoFechar}
      largura="4xl"
    >
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-primario" disabled={!e || !!ocupado} onClick={() => pdf("pdf")}>
          <Icone nome="documento" className="h-4 w-4" />
          {ocupado === "pdf" ? "Gerando…" : "Baixar PDF"}
        </button>
        <button className="btn" disabled={!e || !!ocupado} onClick={() => pdf("imprimir")}>
          <Icone nome="imprimir" className="h-4 w-4" />
          {ocupado === "imprimir" ? "Preparando…" : "Imprimir"}
        </button>
        <BotaoXml caminho={caminho} avisar={avisar} />
      </div>

      {consulta.erro ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>
      ) : !e ? (
        <Carregando />
      ) : (
        <Documento e={e} />
      )}

      <div className="flex justify-end pt-1">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}

/** Imprime o PDF num quadro escondido; se o navegador não deixar, abre o PDF numa aba para imprimir de lá. */
function imprimirPdf(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const quadro = document.createElement("iframe");
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  quadro.src = url;
  quadro.onload = () => {
    try {
      quadro.contentWindow?.focus();
      quadro.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  document.body.appendChild(quadro);
  setTimeout(() => {
    quadro.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}

// ------------------------------------------------------------------------------------------------ desenho na tela

function Documento({ e }: { e: Espelho }) {
  return (
    <article className="space-y-3 rounded-md border border-neutral-300 bg-white p-2 text-neutral-900 sm:p-3" aria-label="Espelho da nota">
      <p className="rounded border border-[#C0892A] bg-[#FAF3E1] px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--destaque-escuro)]">
        {FAIXA_ESPELHO}
      </p>
      <Cabecalho e={e} />
      {e.aviso && (
        <p className="rounded border-2 border-red-700 bg-red-50 px-2 py-1 text-center text-sm font-bold text-red-800">{e.aviso}</p>
      )}
      {e.blocos.map((b, i) => (
        <Bloco key={i} b={b} />
      ))}
    </article>
  );
}

function Cabecalho({ e }: { e: Espelho }) {
  return (
    <div className="grid gap-px border border-neutral-500 bg-neutral-500 sm:grid-cols-[1.15fr_0.6fr_1.1fr]">
      <div className="bg-white p-2">
        <p className="text-[9px] uppercase tracking-wide text-neutral-500">{e.emitente.rotulo ?? "Identificação do emitente"}</p>
        <p className="text-base font-semibold leading-tight">{e.emitente.nome}</p>
        {e.emitente.linhas.map((l, i) => (
          <p key={i} className="break-words text-xs text-neutral-700">
            {l}
          </p>
        ))}
      </div>
      <div className="bg-white p-2">
        <p className="text-center text-xl font-bold tracking-wide">{e.sigla}</p>
        <p className="mb-1 text-center text-[10px] leading-tight text-neutral-600">{e.descricao}</p>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-left sm:grid-cols-1">
          {e.identificacao.map((c) => (
            <div key={c.rotulo} className="min-w-0">
              <dt className="text-[9px] uppercase leading-tight tracking-wide text-neutral-500">{c.rotulo}</dt>
              <dd className="break-words text-xs font-semibold">{c.valor || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="min-w-0 bg-white p-2">
        {e.codigoBarras && e.chave && <CodigoBarras chave={e.chave} />}
        {e.chaveFormatada && (
          <>
            <p className="mt-1 text-[9px] uppercase tracking-wide text-neutral-500">Chave de acesso</p>
            <p className="break-words text-center font-mono text-[13px] font-semibold tracking-tight">{e.chaveFormatada}</p>
          </>
        )}
        {e.consulta && <p className="mt-1 break-words text-center text-[10px] text-neutral-600">{e.consulta}</p>}
      </div>
    </div>
  );
}

/** Código de barras CODE-128C da chave, em SVG (cada barra é um retângulo; a largura acompanha o quadro). */
function CodigoBarras({ chave }: { chave: string }) {
  const { barras, modulos } = useMemo(() => barras128C(chave), [chave]);
  const margem = 10;
  return (
    <svg
      role="img"
      aria-label={`Código de barras da chave ${chave}`}
      viewBox={`0 0 ${modulos + 2 * margem} 40`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="h-12 w-full"
    >
      {barras.map((b, i) => (
        <rect key={i} x={b.x + margem} y={0} width={b.largura} height={40} fill="#000" />
      ))}
    </svg>
  );
}

function Bloco({ b }: { b: BlocoEspelho }) {
  return (
    <section>
      <h3 className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-800">{b.titulo}</h3>
      {b.tipo === "campos" ? (
        <div className="space-y-px border border-neutral-500 bg-neutral-500">
          {b.linhas
            .filter((l) => l.length)
            .map((l, i) => (
              <LinhaCampos key={i} campos={l} />
            ))}
        </div>
      ) : b.tipo === "texto" ? (
        <p className="whitespace-pre-wrap break-words border border-neutral-500 p-2 text-sm">{b.texto}</p>
      ) : (
        <div className="overflow-x-auto border border-neutral-500">
          <table className="w-full border-collapse text-[11px]" style={{ minWidth: b.colunas.length > 6 ? 820 : undefined }}>
            <thead className="bg-neutral-100">
              <tr>
                {b.colunas.map((c) => (
                  <th
                    key={c.titulo}
                    className={`border-b border-neutral-400 px-1.5 py-1 align-bottom text-[10px] font-semibold uppercase text-neutral-600 ${c.direita ? "text-right" : "text-left"}`}
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.linhas.map((l, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0 even:bg-neutral-50">
                  {l.map((v, k) => (
                    <td
                      key={k}
                      className={`whitespace-pre-line px-1.5 py-1 align-top ${b.colunas[k]?.direita ? "whitespace-nowrap text-right tabular-nums" : ""} ${k === 1 && b.colunas.length > 6 ? "min-w-56" : ""}`}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Uma linha de quadros. No computador as larguras seguem o peso de cada campo; no celular ficam duas colunas e o
 * campo largo (peso 2 ou mais, ou texto comprido) ocupa a linha inteira, sem deixar buraco no fim.
 */
function LinhaCampos({ campos }: { campos: CampoEspelho[] }) {
  const largo = campos.map((c) => (c.peso ?? 1) >= 2 || c.valor.length > 26);
  let coluna = 0;
  campos.forEach((_, i) => {
    if (largo[i]) {
      if (coluna === 1) largo[i - 1] = true;
      coluna = 0;
    } else coluna = coluna === 0 ? 1 : 0;
  });
  if (coluna === 1) largo[campos.length - 1] = true;
  const colunas = campos.map((c) => `${c.peso ?? 1}fr`).join(" ");
  return (
    <div
      className="grid grid-cols-2 gap-px sm:[grid-template-columns:var(--colunas)]"
      style={{ "--colunas": colunas } as React.CSSProperties}
    >
      {campos.map((c, i) => (
        <div key={i} className={`min-w-0 bg-white px-1.5 py-1 ${largo[i] ? "col-span-2 sm:col-span-1" : ""}`}>
          <p className="text-[9px] uppercase leading-tight tracking-wide text-neutral-500">{c.rotulo}</p>
          <p
            className={`min-h-4 break-words text-[13px] leading-snug ${c.direita ? "text-right tabular-nums" : ""} ${c.destaque ? "font-bold" : ""}`}
          >
            {c.valor}
          </p>
        </div>
      ))}
    </div>
  );
}
