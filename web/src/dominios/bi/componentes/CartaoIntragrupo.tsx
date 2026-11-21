// Quadro "Operações entre as empresas" da aba Resultado × caixa (só com mais de uma empresa e a eliminação ligada): quantas
// operações entre as empresas do grupo têm as duas pontas lançadas no Omie e quais ficaram com uma ponta só (com um
// possível par lançado sem a empresa). O que fica sem par é a diferença entre o fluxo do grupo e a variação dos bancos.
// Regras em ../intragrupo.ts; dados de bi_intragrupo (109).
"use client";

import { useCallback } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { plural } from "@/lib/formato/numero";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { useConsulta } from "@/lib/useConsulta";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { lerIntragrupo } from "../dados";
import { DIAS_PAR, parearIntragrupo } from "../intragrupo";
import type { SemPar } from "../intragrupo";
import { QuadroDemonstrativo, TdValor } from "./Demonstrativo";
import type { ContextoBi } from "./contexto";

const parTexto = (s: SemPar) =>
  s.candidato
    ? `${s.candidato.empresa}, ${fmtData(s.candidato.data)}: ${s.candidato.origem ?? ""} sem a empresa informada${s.candidato.categoria ? ` (${s.candidato.categoria})` : ""}`
    : "Não encontrada";

export function CartaoIntragrupo({ c }: { c: ContextoBi }) {
  const d = useConsulta(useCallback(async () => parearIntragrupo((await lerIntragrupo(c.ids, c.de, c.ate)) ?? []), [c.ids, c.de, c.ate]));
  if (d.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {d.erro}
      </p>
    );
  if (!d.dados) return <Esqueleto />;
  const r = d.dados;
  if (!r.pares && !r.semPar.length)
    return <p className="text-sm text-[var(--texto-suave)]">Nenhuma operação entre as empresas do grupo no extrato deste período.</p>;

  const colunas: ColunaLista<SemPar>[] = [
    { titulo: "Data", valor: (s) => fmtData(s.mov.data), peso: 0.8 },
    { titulo: "Empresa", valor: (s) => s.mov.empresa, peso: 1.3 },
    { titulo: "Com", valor: (s) => s.mov.contraparte, peso: 1.3 },
    { titulo: "Lançamento", valor: (s) => [s.mov.origem, s.mov.categoria].filter(Boolean).join(" · "), peso: 2.2, largura: 40 },
    { titulo: "Valor", valor: (s) => s.mov.valor, formato: "moeda", peso: 1 },
    { titulo: "Outra ponta", valor: parTexto, peso: 2.4, largura: 50 },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Com as duas pontas"
          valor={plural(r.pares, "operação", "operações")}
          detalhe={`${brl(r.valorPareado)} saíram e entraram no grupo`}
          icone="check"
          tom="verde"
        />
        <Indicador
          titulo="Com uma ponta só"
          valor={plural(r.semPar.length, "lançamento")}
          detalhe={r.semPar.length ? `${brl(r.diferenca)} fora do fluxo do grupo sem contrapartida` : "Tudo fecha entre as empresas"}
          icone="alerta"
          tom={!r.semPar.length ? "verde" : Math.abs(r.diferenca) < 5000 ? "ambar" : "vermelho"}
        />
        <Indicador
          titulo="Outra empresa como contraparte"
          valor={plural(r.contraparteTrocada, "par", "pares")}
          detalhe="A outra ponta foi lançada contra outra empresa do grupo"
          icone="transferir"
          tom={r.contraparteTrocada ? "ambar" : "neutro"}
        />
      </div>
      {r.semPar.length > 0 && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-[var(--texto-suave)]">
              Para cada lançamento, a outra empresa deveria ter o mesmo valor com sinal contrário em até {DIAS_PAR} dias. Corrija no Omie
              (lance a outra ponta ou informe a empresa no lançamento) e o fluxo do grupo passa a fechar com os bancos.
            </p>
            <BotoesExportar
              vazio={false}
              avisar={c.avisar}
              montar={() => ({
                titulo: `Operações entre as empresas com uma ponta só · ${c.quem}`,
                subtitulo: `${c.rotuloPeriodo} · ${plural(r.semPar.length, "lançamento")} · ${brl(r.diferenca)}`,
                arquivo: nomeArquivo("Operacoes-entre-empresas", c.quem, c.hoje),
                logoUrl: c.logoUrl,
                paisagem: true,
                linhas: r.semPar,
                colunas,
                totais: { Valor: r.diferenca },
              })}
            />
          </div>
          <QuadroDemonstrativo rotulo="Operações entre as empresas com uma ponta só">
            <thead>
              <tr>
                <th>Lançamento</th>
                <th>Data</th>
                <th className="demo-total">Valor</th>
                <th className="!text-left">Outra ponta</th>
              </tr>
            </thead>
            <tbody>
              {r.semPar.map((s) => (
                <tr key={s.mov.ref}>
                  <td className="demo-conta">
                    <span className="font-semibold">
                      {s.mov.empresa} → {s.mov.contraparte}
                    </span>
                    <span className="block text-[11.5px] text-[var(--texto-suave)]">
                      {[s.mov.origem, s.mov.categoria].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="demo-num">{fmtData(s.mov.data)}</td>
                  <TdValor v={s.mov.valor} className="demo-total" />
                  <td className="min-w-[16rem] whitespace-normal text-[12.5px]">
                    {s.candidato ? (
                      <span className="flex items-start gap-1.5 text-amber-900">
                        <Icone nome="alerta" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Possível: {parTexto(s)}
                      </span>
                    ) : (
                      <span className="text-[var(--texto-suave)]">Não encontrada no extrato da outra empresa</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="demo-conta">Total sem contrapartida</td>
                <td />
                <TdValor v={r.diferenca} className="demo-total" />
                <td />
              </tr>
            </tfoot>
          </QuadroDemonstrativo>
        </>
      )}
    </div>
  );
}
