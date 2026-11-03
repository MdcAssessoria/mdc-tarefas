// "Ver caminho": janela com a árvore de um documento (de onde veio e para onde foi). Abre de qualquer ponto — pedido,
// nota, conta a pagar/receber, pagamento ou contrato — e mostra da origem até os pagamentos, com o que falta.
// Cada nó tem ícone, data, valor, chip de situação (cores da 8.3.1) e o botão para abrir o documento; a janela do
// documento aparece no lugar da árvore e, ao fechar, volta para ela. PDF no timbrado MDC.
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Valor } from "@/components/ui/Valor";
import { TONS } from "@/components/ui/Tons";
import { useAviso } from "@/components/ui/Aviso";
import { EspelhoNota } from "@/dominios/notas/componentes/EspelhoNota";
import { montarArvore } from "../arvore";
import type { AcaoNo, NoArvore, PontoArvore } from "../arvore";
import { lerArvore } from "../arvoreLeituras";
import type { DadosLidosArvore } from "../arvoreLeituras";
import { baixarPdfArvore } from "../arvorePdf";
import { lerItensDoPedido, lerLocais } from "../leituras";
import { HistoricoTitulo } from "./BaixaTitulo";
import { DetalhePedido } from "./DetalhePedido";

const ROTULO_ACAO: Record<AcaoNo["tipo"], string> = {
  nota: "Ver a nota",
  pedido: "Ver pedido",
  titulo: "Ver pagamentos",
  contrato: "Abrir Contratos",
};

function No({ no, aoAbrir, raiz }: { no: NoArvore; aoAbrir: (a: AcaoNo) => void; raiz?: boolean }) {
  const tom = no.situacao?.tom ?? "neutro";
  return (
    <li className={raiz ? "" : "relative pl-4 sm:pl-6"}>
      {!raiz && <span aria-hidden="true" className="absolute top-6 left-0 h-px w-3 bg-[var(--borda)] sm:w-5" />}
      <div
        className={`rounded-xl border bg-white p-3 ${no.ponto ? "border-[var(--marca)] ring-2 ring-[var(--marca)]/15" : "border-[var(--borda)]"} ${
          no.riscado ? "opacity-70" : ""
        }`}
        aria-current={no.ponto ? "true" : undefined}
      >
        <div className="flex items-start gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TONS[tom].icone}`} aria-hidden="true">
            <Icone nome={no.icone} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium tracking-wide text-[var(--texto-suave)] uppercase">
              {no.rotulo}
              {no.ponto && (
                <span className="rounded-full bg-[var(--marca)] px-2 py-0.5 text-[10px] tracking-normal text-white normal-case">
                  Você abriu daqui
                </span>
              )}
            </p>
            <p className={`font-medium break-words text-[var(--marca)] ${no.riscado ? "line-through" : ""}`}>{no.titulo}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {no.data && (
                <span className="text-[var(--texto-suave)]">
                  {no.rotuloData} <span className="num text-[var(--texto)]">{fmtData(no.data)}</span>
                </span>
              )}
              {no.valor != null && (
                <span className={`font-semibold ${no.riscado ? "line-through" : ""}`}>
                  <Valor v={no.valor} />
                </span>
              )}
              {no.situacao && <Chip tom={no.situacao.tom}>{no.situacao.nome}</Chip>}
            </p>
            {no.detalhes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--texto-suave)]">
                {no.detalhes.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            {no.aviso && (
              <p className="mt-1 flex items-center gap-1 text-xs text-sky-900">
                <Icone nome="info" className="h-3.5 w-3.5 shrink-0" />
                {no.aviso}
              </p>
            )}
            {no.falta && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-900">
                <Icone nome="relogio" className="mt-0.5 h-4 w-4 shrink-0" />
                {no.falta}
              </p>
            )}
          </div>
          {no.acao &&
            (no.acao.tipo === "contrato" ? (
              <Link className="btn !min-h-8 shrink-0 !px-2.5 text-sm" href="/contratos" title="Abrir o módulo Contratos">
                <Icone nome="externo" className="h-4 w-4" />
                <span className="hidden sm:inline">{ROTULO_ACAO.contrato}</span>
                <span className="sr-only sm:hidden">{ROTULO_ACAO.contrato}</span>
              </Link>
            ) : (
              <button
                className="btn !min-h-8 shrink-0 !px-2.5 text-sm"
                onClick={() => aoAbrir(no.acao!)}
                title={`${ROTULO_ACAO[no.acao.tipo]}: ${no.titulo}`}
              >
                <Icone nome={no.acao.tipo === "nota" ? "documento" : "olho"} className="h-4 w-4" />
                <span className="hidden sm:inline">{ROTULO_ACAO[no.acao.tipo]}</span>
                <span className="sr-only sm:hidden">{ROTULO_ACAO[no.acao.tipo]}</span>
              </button>
            ))}
        </div>
      </div>
      {no.filhos.length > 0 && (
        <ul className="mt-2 space-y-2 border-l border-[var(--borda)] sm:ml-4 ml-2" aria-label={`Depois de: ${no.rotulo} ${no.titulo}`}>
          {no.filhos.map((f) => (
            <No key={f.chave} no={f} aoAbrir={aoAbrir} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** O pedido aberto de dentro da árvore (lê os itens e o nome do estoque). */
function VerPedido({ id, d, hoje, aoFechar }: { id: string; d: DadosLidosArvore; hoje: string; aoFechar: () => void }) {
  const pedido = d.pedidos.find((p) => p.id === id)!;
  const extra = useConsulta(
    useCallback(async () => {
      const [itens, locais] = await Promise.all([lerItensDoPedido(id), lerLocais(pedido.cliente_id)]);
      return { itens, local: locais.find((l) => l.id === pedido.local_id)?.nome ?? "" };
    }, [id, pedido.cliente_id, pedido.local_id]),
  );
  if (!extra.dados)
    return (
      <Modal titulo={`Pedido nº ${pedido.numero}`} aoFechar={aoFechar}>
        {extra.erro ? (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{extra.erro}</p>
        ) : (
          <Esqueleto indicadores={0} linhas={4} />
        )}
      </Modal>
    );
  return (
    <DetalhePedido
      pedido={pedido}
      itens={extra.dados.itens}
      pessoa={d.nomes.pessoas[pedido.pessoa_id ?? ""] ?? ""}
      local={extra.dados.local}
      hoje={hoje}
      aoFechar={aoFechar}
    />
  );
}

export function ArvoreDocumento({
  ponto,
  clienteId,
  empresa,
  titulo,
  aoFechar,
}: {
  ponto: PontoArvore;
  clienteId: string;
  /** Nome da empresa para o PDF (use nomeCliente). */
  empresa: string;
  /** Documento de onde abriu ("Pedido de compra nº 3"), no título da janela e do PDF. */
  titulo: string;
  aoFechar: () => void;
}) {
  const { org } = useOrg();
  const hoje = hojeISO(org.fuso);
  const { aviso, mostrar } = useAviso();
  const [aberto, setAberto] = useState<AcaoNo | null>(null);
  const [gerando, setGerando] = useState(false);
  // o ponto chega como objeto novo a cada desenho da tela; as dependências usam só o tipo e o id
  const { tipo: tipoPonto, id: idPonto } = ponto;
  const consulta = useConsulta(
    useCallback(() => lerArvore(clienteId, { tipo: tipoPonto, id: idPonto } as PontoArvore), [clienteId, tipoPonto, idPonto]),
  );
  const d = consulta.dados;
  const arvore = useMemo(
    () => (d ? montarArvore({ tipo: tipoPonto, id: idPonto } as PontoArvore, d, hoje) : null),
    [d, tipoPonto, idPonto, hoje],
  );

  async function pdf() {
    if (!arvore) return;
    setGerando(true);
    try {
      await baixarPdfArvore({ titulo, arvore, empresa, hoje, logoUrl: org.logo_url });
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  // o documento aberto aparece no lugar da árvore; ao fechar, a árvore volta
  if (d && aberto?.tipo === "nota") {
    const nota = d.notas.find((n) => n.id === aberto.id);
    if (nota) return <EspelhoNota nota={nota} avisar={mostrar} aoFechar={() => setAberto(null)} />;
  }
  if (d && aberto?.tipo === "titulo") {
    const t = d.titulos.find((x) => x.id === aberto.id);
    if (t)
      return (
        <HistoricoTitulo
          titulo={t}
          contas={d.contasBancarias}
          podeOperar={false}
          aoFechar={() => setAberto(null)}
          aoMudar={() => setAberto(null)}
        />
      );
  }
  if (d && aberto?.tipo === "pedido") return <VerPedido id={aberto.id} d={d} hoje={hoje} aoFechar={() => setAberto(null)} />;

  const r = arvore?.resumo;
  return (
    <Modal
      titulo={`Caminho · ${titulo}`}
      descricao="De onde veio e para onde foi: pedido, nota, contas, pagamentos e estoque, na ordem em que aconteceram."
      aoFechar={aoFechar}
      largura="4xl"
      celularCheio
    >
      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}
      {!arvore ? (
        !consulta.erro && <Esqueleto indicadores={4} linhas={4} />
      ) : !arvore.raizes.length ? (
        <p className="rounded-md bg-[var(--fundo)] p-4 text-sm">
          Não encontrei este documento. Ele pode ter sido apagado ou você não tem acesso a ele.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Resumo das contas do caminho">
            {[
              ["Contas no caminho", String(r!.contas), "neutro"],
              ["Total", r!.total, "neutro"],
              ["Pago/recebido", r!.pago, "verde"],
              ["Falta", r!.falta, r!.falta > 0 ? "ambar" : "verde"],
            ].map(([rotulo, v, tom]) => (
              <div key={rotulo as string} className="rounded-lg border border-[var(--borda)] bg-[var(--fundo)] px-3 py-2">
                <p className="text-xs text-[var(--texto-suave)]">{rotulo}</p>
                <p className={`text-base font-semibold ${TONS[tom as "neutro"].valor}`}>{typeof v === "number" ? <Valor v={v} /> : v}</p>
              </div>
            ))}
          </div>
          {arvore.pendencias.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <Icone nome="alerta" className="h-4 w-4" />O que falta
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {arvore.pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <Icone nome="check" className="h-4 w-4" />
              Nada pendente: este caminho está completo.
            </p>
          )}
          <ul className="space-y-2" aria-label="Caminho do documento">
            {arvore.raizes.map((n) => (
              <No key={n.chave} no={n} aoAbrir={setAberto} raiz />
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--borda)] pt-3">
        <button className="btn-primario" onClick={pdf} disabled={!arvore?.raizes.length || gerando}>
          <Icone nome="documento" className="h-4 w-4" />
          {gerando ? "Gerando…" : "Baixar PDF"}
        </button>
        <button className="btn" onClick={aoFechar}>
          <Icone nome="voltar" className="h-4 w-4" />
          Fechar
        </button>
      </div>
    </Modal>
  );
}
