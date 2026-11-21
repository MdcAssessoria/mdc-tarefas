// Aba Parecer do BI (equipe MDC): monta o rascunho do parecer gerencial com os números do período (DRE, fluxo de caixa,
// resultado × caixa, saldos dos bancos e indicadores; regras em ../parecer.ts), deixa revisar o texto e imprimir/salvar
// em PDF com o cabeçalho da MDC. O texto editado fica guardado neste navegador por empresa e período.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { VisaoParecer } from "@/dominios/demonstrativos/componentes/VisaoParecer";
import { periodoComparado } from "../comparar";
import { conciliar } from "../conciliacao";
import { lerContas, lerIndicadores, lerRelatorio, lerSaldos } from "../dados";
import { indicadoresGestao } from "../indicadoresGestao";
import { rascunhoParecerBi } from "../parecer";
import { temMovimento } from "../relatorio";
import { mesesDoPeriodo, mesesIncompletos, resumirSaldos } from "../saldos";
import type { ContextoBi } from "./contexto";

const chave = (c: ContextoBi) => `bi-parecer:${c.ids.join(",")}:${c.de}:${c.ate}:${c.elimina ? 1 : 0}`;
function lerGuardado(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function guardar(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* navegador sem armazenamento: o texto vale só enquanto a aba estiver aberta */
  }
}

export function AbaParecer({ c }: { c: ContextoBi }) {
  const antes = periodoComparado(c.de, c.ate, "anterior");
  const d = useConsulta(
    useCallback(async () => {
      const [dre, dfc, dreAnterior, contasDre, contasDfc, saldos, ind] = await Promise.all([
        lerRelatorio("dre", c.ids, c.de, c.ate, c.elimina),
        lerRelatorio("dfc", c.ids, c.de, c.ate, c.elimina),
        lerRelatorio("dre", c.ids, antes.de, antes.ate, c.elimina),
        lerContas("dre", c.ids, c.de, c.ate, c.elimina),
        lerContas("dfc", c.ids, c.de, c.ate, c.elimina),
        lerSaldos(c.ids, c.de, c.ate),
        lerIndicadores(c.ids, c.de, c.ate, c.elimina),
      ]);
      const meses = mesesDoPeriodo(c.de, c.ate < c.hoje ? c.ate : c.hoje);
      const conc = conciliar(contasDre ?? [], contasDfc ?? []);
      const banco = resumirSaldos(saldos ?? [], meses, conc.variacaoCaixa);
      if (!temMovimento(dre) && !temMovimento(dfc)) return null;
      return rascunhoParecerBi({
        quem: c.quem,
        periodo: c.rotuloPeriodo,
        elimina: c.elimina,
        dre,
        dfc,
        dreAnterior: temMovimento(dreAnterior) ? dreAnterior : null,
        contasDre: contasDre ?? [],
        conc,
        saldos: banco,
        ind,
        gestao: indicadoresGestao(dre, dfc, banco ? banco.finalUltimoMes : null, meses.length),
        mesesSemExtrato: mesesIncompletos(saldos ?? [], meses),
        contador: "",
        crc: "",
      });
    }, [c.ids, c.de, c.ate, c.elimina, c.hoje, c.quem, c.rotuloPeriodo, antes.de, antes.ate]),
  );
  if (d.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {d.erro}
      </p>
    );
  if (d.dados === undefined) return <Esqueleto />;
  if (d.dados === null)
    return (
      <EstadoVazio icone="documento" titulo="Nada lançado neste período">
        Não há notas nem contas das empresas escolhidas entre {c.rotuloPeriodo}. Troque o período para montar o parecer.
      </EstadoVazio>
    );
  return <EditorParecerBi key={chave(c)} chaveGuardada={chave(c)} gerado={d.dados} c={c} />;
}

function EditorParecerBi({ chaveGuardada, gerado, c }: { chaveGuardada: string; gerado: string; c: ContextoBi }) {
  const [texto, setTexto] = useState(() => lerGuardado(chaveGuardada) ?? gerado);
  const editado = texto !== gerado;
  const falta = /\[Revisar/.test(texto);

  function mudar(v: string) {
    setTexto(v);
    guardar(chaveGuardada, v === gerado ? null : v);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="min-w-0 space-y-3 print:hidden">
        <p className="text-sm text-[var(--texto-suave)]">
          O HUB montou o rascunho com os números de {c.rotuloPeriodo}. Revise, complete os trechos [Revisar…] e salve em PDF para enviar ao
          cliente. O texto que você mudar fica guardado neste computador para esta empresa e este período.
        </p>
        <label className="campo">
          <span>Texto do parecer</span>
          <textarea className="h-[420px] w-full font-mono text-[13px] lg:h-[560px]" value={texto} onChange={(e) => mudar(e.target.value)} />
        </label>
        <p className="text-xs text-[var(--texto-suave)]">
          Como escrever: # título · ## seção · - item · **negrito**. Os números vêm do Omie; mudou um lançamento, monte de novo.
        </p>
        {falta && (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <Icone nome="alerta" className="mt-px h-3.5 w-3.5 shrink-0" />
            Complete os trechos marcados com [Revisar…] (inclusive o nome e o CRC de quem assina) antes de enviar.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primario" onClick={() => window.print()}>
            <Icone nome="imprimir" className="h-4 w-4" />
            Imprimir / salvar PDF
          </button>
          {editado && (
            <button className="btn" onClick={() => mudar(gerado)}>
              <Icone nome="atualizar" className="h-4 w-4" />
              Montar de novo com os números
            </button>
          )}
        </div>
      </section>
      <div className="min-w-0">
        <VisaoParecer texto={texto} empresa={c.quem} cnpj={c.empresas.length === 1 ? (c.empresas[0].cnpj ?? null) : null} />
      </div>
    </div>
  );
}
