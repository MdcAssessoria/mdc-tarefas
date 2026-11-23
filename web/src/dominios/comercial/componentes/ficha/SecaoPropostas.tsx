// Ficha da oportunidade › Propostas em PDF (migração 115, 23/11/2026): a proposta montada fora do HUB é anexada aqui
// e, ao baixar, sai assinada digitalmente com o certificado A1 da MDC (Função Edge proposta-pdf), como o PDF do
// demonstrativo. O arquivo guardado não muda; cada download assinado fica no histórico da oportunidade.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { chamarFuncaoBruta } from "@/lib/funcoesEdge";
import { enviarArquivo, fmtTamanho } from "@/lib/arquivos/armazenamento";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import type { TomAviso } from "@/components/ui/Aviso";
import type { Oportunidade } from "../../crm";

/** Baixa a proposta já assinada pela Função Edge e entrega o arquivo ao navegador. */
export async function baixarPropostaAssinada(arquivoId: string): Promise<void> {
  const r = await chamarFuncaoBruta("proposta-pdf", { corpo: { arquivo_id: arquivoId } });
  const blob = await r.blob();
  const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "proposta-MDC-assinada.pdf";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function SecaoPropostas({
  o,
  propostas,
  podeOperar,
  aoMudar,
  avisar,
}: {
  o: Oportunidade;
  propostas: Arquivo[];
  podeOperar: boolean;
  aoMudar: () => void;
  avisar: (msg: string, tom?: TomAviso) => void;
}) {
  const { org, papel } = useOrg();
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [retirando, setRetirando] = useState<Arquivo | null>(null);
  const ehAdmin = papel === "admin";

  async function anexar(arquivos: File[]) {
    const f = arquivos[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return avisar("Anexe a proposta em PDF.", "erro");
    setEnviando(true);
    try {
      await enviarArquivo(f, { org: org.id, app: "comercial", ref: o.id });
      avisar(`Proposta “${f.name}” anexada. Ao baixar, ela sai assinada pela MDC.`);
      aoMudar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setEnviando(false);
    }
  }

  async function baixar(p: Arquivo) {
    setBaixando(p.id);
    try {
      await baixarPropostaAssinada(p.id);
      avisar("Proposta baixada assinada digitalmente pela MDC.");
      aoMudar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <section className="cartao space-y-4 p-4" aria-labelledby="propostas-titulo">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="propostas-titulo" className="mr-auto flex items-center gap-2 font-semibold text-[var(--marca)]">
          <Icone nome="escudo" className="h-5 w-5" />
          Propostas em PDF (saem assinadas)
        </h2>
      </div>
      <p className="text-sm text-[var(--texto-suave)]">
        Anexe a proposta montada em PDF. Ao baixar, ela sai com a assinatura digital do certificado da MDC (ICP-Brasil), que pode ser
        conferida em validar.iti.gov.br. Cada download fica registrado no histórico.
      </p>

      {propostas.length === 0 ? (
        <EstadoVazio icone="documento" titulo="Nenhuma proposta anexada">
          {podeOperar ? "Anexe abaixo o PDF da proposta enviada a esta empresa." : "Quem opera o Comercial anexa as propostas."}
        </EstadoVazio>
      ) : (
        <ul className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)]">
          {propostas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <Icone nome="documento" className="h-5 w-5 shrink-0 text-[var(--marca)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={p.nome}>
                  {p.nome}
                </p>
                <p className="text-xs text-[var(--texto-suave)]">
                  Anexada em {fmtDataHora(p.enviado_em)}
                  {p.tamanho ? ` · ${fmtTamanho(p.tamanho)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primario" onClick={() => baixar(p)} disabled={baixando === p.id}>
                  <Icone nome="baixar" className="h-4 w-4" />
                  {baixando === p.id ? "Assinando…" : "Baixar assinada"}
                </button>
                {ehAdmin && (
                  <button className="btn" onClick={() => setRetirando(p)} title="Tira a proposta da ficha (fica registrada)">
                    <Icone nome="lixeira" className="h-4 w-4" />
                    Retirar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {podeOperar && (
        <CampoArquivo
          accept=".pdf"
          aoEscolher={anexar}
          ocupado={enviando}
          titulo={enviando ? "Anexando a proposta…" : "Arraste o PDF da proposta aqui ou clique para escolher"}
          dica="Só PDF. O arquivo anexado não muda; a assinatura é aplicada a cada download."
        />
      )}

      {retirando && (
        <JanelaMotivo
          titulo="Retirar proposta da ficha"
          descricao={<>A proposta “{retirando.nome}” sai da ficha, mas continua registrada na auditoria. Informe o motivo.</>}
          botao="Retirar"
          aoConfirmar={async (motivo) => {
            const { error } = await supabase().rpc("hub_arquivo_retirar", { p_arquivo: retirando.id, p_motivo: motivo });
            if (error) throw error;
            avisar("Proposta retirada da ficha.");
            setRetirando(null);
            aoMudar();
          }}
          aoFechar={() => setRetirando(null)}
        />
      )}
    </section>
  );
}
