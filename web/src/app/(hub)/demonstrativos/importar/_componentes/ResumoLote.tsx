// Resumo depois de "Importar todos": por empresa, o que entrou e o que ficou de fora (com o motivo), com link para
// cada rascunho gravado e exportação em PDF (papel timbrado da MDC) e Excel exatamente do que está na tela.
"use client";

import Link from "next/link";
import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { resumoPorEmpresa } from "@/dominios/demonstrativos/importacaoLote";
import type { ResultadoLote } from "@/dominios/demonstrativos/importacaoLote";
import { Aviso } from "@/components/ui/Aviso";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { carregarLogo } from "@/lib/marca";
import { Icone } from "@/components/ui/Icone";

export function ResumoLote({ resultados, aoRecomecar }: { resultados: ResultadoLote[]; aoRecomecar: () => void }) {
  const { org } = useOrg();
  const [erro, setErro] = useState<string | null>(null);
  const grupos = resumoPorEmpresa(resultados);
  const entraram = resultados.filter((r) => r.entrou).length;
  const hoje = hojeISO(org.fuso);
  const titulo = "Importação de balancetes em lote";
  const subtitulo = `${fmtData(hoje)} · ${resultados.length} arquivo(s): ${entraram} entraram, ${resultados.length - entraram} ficaram de fora`;

  async function pdf() {
    setErro(null);
    try {
      const bytes = await gerarRelatorioPdf({
        titulo,
        subtitulo,
        logo: await carregarLogo(org.logo_url),
        secoes: grupos.map((g) => ({
          titulo: `${g.empresa} · ${g.entraram} entrou(aram) · ${g.ficaramFora} de fora`,
          colunas: [
            { titulo: "Competência", peso: 1.2 },
            { titulo: "Arquivo", peso: 3 },
            { titulo: "Resultado", peso: 1.3 },
            { titulo: "Motivo", peso: 4 },
          ],
          linhas: g.itens.map((i) => ({
            celulas: [fmtCompetencia(i.competencia) || "—", i.arquivo, i.entrou ? "Entrou (rascunho)" : "Ficou de fora", i.motivo || "—"],
            alerta: [false, false, !i.entrou, false],
          })),
        })),
      });
      baixarBytes(bytes, `Importacao-balancetes-${hoje}.pdf`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  async function excel() {
    setErro(null);
    try {
      await exportarExcel(`Importacao-balancetes-${hoje}.xlsx`, titulo, subtitulo, [
        {
          nome: "Por empresa",
          colunas: [
            { titulo: "Empresa", chave: "empresa", largura: 40 },
            { titulo: "Entraram", chave: "entraram", largura: 12, formato: "numero" },
            { titulo: "Ficaram de fora", chave: "ficaramFora", largura: 16, formato: "numero" },
          ],
          linhas: grupos.map((g) => ({ empresa: g.empresa, entraram: g.entraram, ficaramFora: g.ficaramFora })),
          totais: { empresa: "Total", entraram, ficaramFora: resultados.length - entraram },
        },
        {
          nome: "Arquivos",
          colunas: [
            { titulo: "Empresa", chave: "empresa", largura: 36 },
            { titulo: "Competência", chave: "competencia", largura: 12 },
            { titulo: "Arquivo", chave: "arquivo", largura: 36 },
            { titulo: "Resultado", chave: "resultado", largura: 18 },
            { titulo: "Motivo", chave: "motivo", largura: 60 },
          ],
          linhas: grupos.flatMap((g) =>
            g.itens.map((i) => ({
              empresa: g.empresa,
              competencia: fmtCompetencia(i.competencia),
              arquivo: i.arquivo,
              resultado: i.entrou ? "Entrou (rascunho)" : "Ficou de fora",
              motivo: i.motivo,
            })),
          ),
        },
      ]);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-semibold text-[var(--marca)]">Importação concluída</h2>
          <p className="text-sm text-neutral-600">
            {entraram} de {resultados.length} arquivo(s) entraram como rascunho. Revise cada um e publique para o cliente.
          </p>
        </div>
        <button className="btn" onClick={pdf}>
          PDF
        </button>
        <button className="btn" onClick={excel}>
          Excel
        </button>
        <button className="btn-primario" onClick={aoRecomecar}>
          Importar outros arquivos
        </button>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="grid gap-3 md:grid-cols-2">
        {grupos.map((g) => (
          <article key={g.empresa} className="cartao p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{g.empresa}</h3>
              <span className="text-xs">
                <span className="text-emerald-700">{g.entraram} entrou(aram)</span>
                {g.ficaramFora > 0 && <span className="text-[var(--perigo)]"> · {g.ficaramFora} de fora</span>}
              </span>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {g.itens.map((i, k) => (
                <li key={k} className="flex items-start gap-2">
                  <span className={i.entrou ? "text-emerald-700" : "text-[var(--perigo)]"} aria-hidden>
                    <Icone nome={i.entrou ? "check" : "fechar"} className="inline h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <b>{fmtCompetencia(i.competencia) || "sem mês"}</b> · <span className="break-all text-neutral-600">{i.arquivo}</span>
                    {i.balanceteId && (
                      <>
                        {" · "}
                        <Link href={`/demonstrativos/${i.balanceteId}`} className="underline">
                          revisar
                        </Link>
                      </>
                    )}
                    {i.motivo && <span className="block text-xs text-neutral-600">{i.motivo}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
