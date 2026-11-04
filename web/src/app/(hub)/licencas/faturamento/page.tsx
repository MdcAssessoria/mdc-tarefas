// Licenças › Faturamento do mês: o que acrescentar ao honorário de cada cliente (mensalidades do mês ainda em aberto
// e, se marcado, as de meses anteriores que continuam em aberto). Sai em PDF (timbrado MDC) e Excel para o financeiro
// da MDC incluir no boleto/Pix do honorário.
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { fmtData, mesExtenso } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { Cabecalho, EtiquetaBloqueado, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { faturamentoDoMes, mesesAte } from "@/dominios/licencas/regras";

export default function PaginaFaturamento() {
  const { org, clientePorId } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, nomeDoCliente, bloqueados } = dados;
  const { aviso, mostrar } = useAviso();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [atrasados, setAtrasados] = useState(true);
  const [mostrarPagos, setMostrarPagos] = useState(false);
  const meses = useMemo(() => mesesAte(hoje, 12, 1).reverse(), [hoje]);
  const d = dados.dados;

  const linhas = useMemo(
    () =>
      faturamentoDoMes(d?.cobrancas ?? [], mes, atrasados)
        .filter((l) => mostrarPagos || l.total > 0)
        .sort((a, b) => nomeDoCliente(a.cliente_id).localeCompare(nomeDoCliente(b.cliente_id))),
    [d, mes, atrasados, mostrarPagos, nomeDoCliente],
  );
  const total = linhas.reduce((s, l) => s + l.total, 0);
  const doMes = linhas.reduce((s, l) => s + l.doMes, 0);
  const atrasado = linhas.reduce((s, l) => s + l.atrasado, 0);
  const pago = linhas.reduce((s, l) => s + l.jaPago, 0);
  const cnpj = (id: string) => clientePorId(id)?.cnpj ?? "";
  const codigo = (id: string) => clientePorId(id)?.codigo_dominio ?? "";

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Faturamento do mês"
        descricao="O que acrescentar ao honorário de cada cliente: as mensalidades das licenças do mês e as atrasadas."
      >
        <BotoesExportar
          vazio={!linhas.length}
          avisar={mostrar}
          montar={() => ({
            titulo: `Faturamento de licenças · ${mesExtenso(mes)}`,
            subtitulo: `${org.nome} · acrescentar ao honorário · ${atrasados ? "com" : "sem"} atrasados de meses anteriores · gerado em ${fmtData(hoje)}`,
            arquivo: nomeArquivo("Faturamento-licencas", mes),
            logoUrl: org.logo_url,
            linhas,
            colunas: [
              { titulo: "Cód.", valor: (l) => codigo(l.cliente_id), peso: 0.6, largura: 8 },
              { titulo: "Cliente", valor: (l) => nomeDoCliente(l.cliente_id), peso: 2.6, largura: 38 },
              { titulo: "CNPJ", valor: (l) => cnpj(l.cliente_id), peso: 1.4, largura: 20 },
              { titulo: "Mensalidade do mês", valor: (l) => l.doMes, formato: "moeda", peso: 1.2 },
              { titulo: "Atrasado", valor: (l) => l.atrasado, formato: "moeda", peso: 1.1, alerta: (l) => l.atrasado > 0 },
              { titulo: "Acrescentar ao honorário", valor: (l) => l.total, formato: "moeda", peso: 1.4 },
              { titulo: "Já pago no mês", valor: (l) => l.jaPago, formato: "moeda", peso: 1.1 },
              { titulo: "Referente a", valor: (l) => l.descricoes.join("; "), peso: 3, largura: 60 },
            ],
            totais: { "Mensalidade do mês": doMes, Atrasado: atrasado, "Acrescentar ao honorário": total, "Já pago no mês": pago },
          })}
        />
      </Cabecalho>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Mês</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {mesExtenso(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={atrasados} onChange={(e) => setAtrasados(e.target.checked)} /> Incluir atrasados de meses
          anteriores
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={mostrarPagos} onChange={(e) => setMostrarPagos(e.target.checked)} /> Mostrar quem já pagou
        </label>
      </div>

      {aviso}
      {dados.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dados.erro}</p>}

      {!d ? (
        <Carregando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador icone="moeda"
              titulo="Acrescentar aos honorários"
              valor={brl(total)}
              detalhe={`${linhas.filter((l) => l.total > 0).length} cliente(s)`}
              tom="verde"
            />
            <Indicador icone="calendario" titulo={`Mensalidades de ${mesExtenso(mes)}`} valor={brl(doMes)} />
            <Indicador icone="alerta" titulo="Atrasados de meses anteriores" valor={brl(atrasado)} tom={atrasado ? "vermelho" : "neutro"} />
          </div>
          {!linhas.length ? (
            <EstadoVazio>Nada a acrescentar aos honorários de {mesExtenso(mes)}. Se faltam mensalidades, gere em Mensalidades.</EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela tabela-acoes-fixas">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="text-right">Do mês</th>
                    <th className="text-right">Atrasado</th>
                    <th className="text-right">Acrescentar</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.cliente_id}>
                      <td className="min-w-56">
                        <span className="font-medium">{nomeDoCliente(l.cliente_id)}</span>{" "}
                        {bloqueados.has(l.cliente_id) && <EtiquetaBloqueado />}
                        <span className="block text-xs text-neutral-500">
                          {l.descricoes.join("; ") || (l.jaPago ? `Já pagou ${brl(l.jaPago)} neste mês` : "")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">{brl(l.doMes)}</td>
                      <td className={`whitespace-nowrap text-right tabular-nums ${l.atrasado ? "text-red-700" : ""}`}>{brl(l.atrasado)}</td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums">{brl(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td>Total ({linhas.length})</td>
                    <td className="text-right tabular-nums">{brl(doMes)}</td>
                    <td className="text-right tabular-nums">{brl(atrasado)}</td>
                    <td className="text-right tabular-nums">{brl(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-xs text-neutral-500">
            Depois que o cliente pagar o honorário, dê baixa nas mensalidades em Mensalidades (a baixa é manual).
          </p>
        </>
      )}
    </div>
  );
}
