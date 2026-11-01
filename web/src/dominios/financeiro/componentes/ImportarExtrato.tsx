// Painel "Importar extrato": escolhe a conta e o arquivo (OFX ou planilha), mostra a conferência antes de gravar e,
// depois de gravar, compara o saldo calculado pelo HUB com o saldo final que o banco informou no arquivo.
"use client";

import Link from "next/link";
import { useState } from "react";
import { lerContas, lerLinhas, textoDoArquivo } from "@/dominios/financeiro/leituras";
import { lerOfx } from "@/dominios/financeiro/ofx";
import type { ExtratoLido } from "@/dominios/financeiro/ofx";
import { lerExtratoPlanilha } from "@/dominios/financeiro/extratoPlanilha";
import { importarExtrato } from "@/dominios/financeiro/repositorio";
import { saldoDaConta } from "@/dominios/financeiro/tipos";
import type { ContaBancaria } from "@/dominios/financeiro/tipos";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import type { TomAviso } from "@/components/ui/Aviso";
import { CampoArquivo } from "@/components/ui/CampoArquivo";

type Previa = { arquivo: string; formato: "ofx" | "planilha"; extrato: ExtratoLido };

const soma = (e: ExtratoLido, sinal: 1 | -1) => e.lancamentos.filter((l) => l.valor * sinal > 0).reduce((a, l) => a + l.valor, 0);

/** Saldo calculado pelo HUB no fim do extrato × saldo informado pelo banco. Devolve a mensagem para mostrar. */
async function conferirSaldo(clienteId: string, contaId: string, e: ExtratoLido): Promise<{ texto: string; tom: TomAviso } | null> {
  if (e.saldoFinal === null || !e.fim) return null;
  const conta = (await lerContas(clienteId)).find((c) => c.id === contaId);
  if (!conta) return null;
  if (conta.saldo_inicial_em && conta.saldo_inicial_em > e.fim) return null;
  const linhas = await lerLinhas(clienteId, { conta: contaId, ate: e.fim });
  const calculado = saldoDaConta(conta, linhas);
  const dif = Math.round((calculado - e.saldoFinal) * 100) / 100;
  if (Math.abs(dif) < 0.01)
    return { texto: `Saldo conferido: o HUB e o banco batem em ${brl(e.saldoFinal)} no dia ${fmtData(e.fim)}.`, tom: "sucesso" };
  return {
    texto:
      `Atenção: em ${fmtData(e.fim)} o banco informa ${brl(e.saldoFinal)} e o HUB calcula ${brl(calculado)} (diferença de ${brl(dif)}). ` +
      "Confira o saldo inicial da conta e se falta importar algum período.",
    tom: "atencao",
  };
}

export function ImportarExtrato({
  clienteId,
  contas,
  nomeConta,
  avisar,
  aoGravar,
}: {
  clienteId: string;
  contas: ContaBancaria[];
  nomeConta: (id: string) => string;
  avisar: (texto: string, tom?: TomAviso) => void;
  aoGravar: () => void;
}) {
  const ativas = contas.filter((c) => c.ativo);
  const [contaImportar, setContaImportar] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [conferencia, setConferencia] = useState<{ texto: string; tom: TomAviso } | null>(null);

  async function escolherArquivo(arq: File | undefined) {
    if (!arq) return;
    setLendo(true);
    setPrevia(null);
    setConferencia(null);
    try {
      const ofx = /\.(ofx|qfx)$/i.test(arq.name);
      let extrato: ExtratoLido;
      if (ofx) extrato = lerOfx(await textoDoArquivo(arq));
      else {
        const { abas, dados } = await lerPlanilha(arq);
        extrato = lerExtratoPlanilha(dados[abas[0]]);
      }
      if (!extrato.lancamentos.length) throw new Error("Não encontrei lançamentos neste arquivo.");
      const alvo = contas.find((c) => c.id === contaImportar);
      const numero = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
      if (
        alvo?.numero &&
        extrato.conta &&
        !numero(extrato.conta).includes(numero(alvo.numero)) &&
        !numero(alvo.numero).includes(numero(extrato.conta))
      )
        extrato.avisos.unshift(
          `Atenção: o arquivo é da conta ${extrato.conta}, e a conta escolhida está cadastrada como ${alvo.numero}. Confira antes de gravar.`,
        );
      setPrevia({ arquivo: arq.name, formato: ofx ? "ofx" : "planilha", extrato });
    } catch (e) {
      avisar(e instanceof Error ? e.message : traduzirErro(e), "erro");
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!previa || !contaImportar) return;
    setGravando(true);
    try {
      const r = await importarExtrato(contaImportar, previa.arquivo, previa.formato, previa.extrato);
      avisar(
        r.novas
          ? `Extrato importado em ${nomeConta(contaImportar)}: ${r.novas} lançamento(s) novo(s)` +
              (r.repetidas ? `, ${r.repetidas} já estavam no HUB e foram ignorados.` : ".")
          : `Nada novo: os ${r.recebidas} lançamento(s) deste arquivo já estavam no HUB.`,
        r.novas ? "sucesso" : "atencao",
      );
      setConferencia(await conferirSaldo(clienteId, contaImportar, previa.extrato).catch(() => null));
      setPrevia(null);
      aoGravar();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="cartao space-y-3 p-4">
      <div>
        <h2 className="font-semibold text-[var(--marca)]">Importar extrato</h2>
        <p className="text-sm text-neutral-600">
          Baixe o extrato no internet banking em <b>OFX</b> (também chamado de &quot;Money&quot; ou &quot;arquivo para conciliação&quot;) ou
          em Excel, escolha a conta e o arquivo. Você confere antes de gravar; lançamento que já foi importado não entra de novo.
        </p>
      </div>
      {!ativas.length ? (
        <p className="text-sm text-amber-900">
          Cadastre antes a conta bancária em{" "}
          <Link href="/financeiro" className="underline">
            Contas bancárias
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="campo">
            <span>Conta que recebe o extrato</span>
            <select
              value={contaImportar}
              onChange={(e) => {
                setContaImportar(e.target.value);
                setPrevia(null);
              }}
            >
              <option value="">Escolha a conta…</option>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-64 flex-1">
            <CampoArquivo
              compacto
              accept=".ofx,.qfx,.xls,.xlsx,.csv,.txt"
              ocupado={lendo}
              desabilitado={!contaImportar || gravando}
              titulo="Arraste aqui o extrato do banco ou clique para escolher"
              dica={contaImportar ? "OFX (recomendado) ou planilha Excel/CSV" : "Escolha primeiro a conta bancária ao lado"}
              aoEscolher={(a) => void escolherArquivo(a[0])}
            />
          </div>
        </div>
      )}
      {conferencia && (
        <p
          className={`rounded-md p-3 text-sm ${conferencia.tom === "sucesso" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
        >
          {conferencia.texto}
        </p>
      )}
      {previa && (
        <div className="space-y-2 rounded-md bg-neutral-50 p-3 text-sm">
          <p>
            <b>{previa.arquivo}</b> → {nomeConta(contaImportar)}: {previa.extrato.lancamentos.length} lançamento(s)
            {previa.extrato.inicio ? ` de ${fmtData(previa.extrato.inicio)} a ${fmtData(previa.extrato.fim ?? "")}` : ""}.
          </p>
          <p>
            Entradas <b className="text-emerald-800">{brl(soma(previa.extrato, 1))}</b> · Saídas{" "}
            <b className="text-red-700">{brl(-soma(previa.extrato, -1))}</b>
            {previa.extrato.saldoFinal !== null && (
              <>
                {" "}
                · Saldo final informado pelo banco <b>{brl(previa.extrato.saldoFinal)}</b>
              </>
            )}
          </p>
          {previa.extrato.avisos.map((a) => (
            <p key={a} className="text-amber-900">
              {a}
            </p>
          ))}
          <div className="flex gap-2">
            <button className="btn-primario" onClick={confirmar} disabled={gravando}>
              {gravando ? "Gravando…" : "Gravar extrato"}
            </button>
            <button className="btn" onClick={() => setPrevia(null)} disabled={gravando}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
