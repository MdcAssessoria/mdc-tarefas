// Entradas › Carga tributária: impostos que vieram destacados nas notas de compra (por fornecedor, NCM, CFOP ou mês) e
// os créditos ESTIMADOS conforme o regime da empresa (regras da tabela fis_regras_credito, com fonte legal e vigência).
// Clique numa barra do gráfico para filtrar a tabela. PDF e Excel do que está na tela.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { REGIMES } from "@/dominios/clientes/tipos";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData, mesAno } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { intervaloDoPeriodo } from "@/dominios/financeiro/regras";
import { formatarDocumento } from "@/lib/documento";
import type { Periodo } from "@/dominios/financeiro/regras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { lerItensDasNotas, lerNotas, lerParametros, lerRegrasCredito } from "@/dominios/notas/leituras";
import { cargaPercentual, creditoDoItem, NOMES_TRIBUTO, regraVigente, TRIBUTOS_CREDITO } from "@/dominios/notas/creditos";
import { sugerirTipoEntrada } from "@/dominios/notas/tiposEntrada";
import { BarrasClicaveis, fornecedorDa } from "@/dominios/notas/componentes/Comuns";

type Agrupar = "fornecedor" | "ncm" | "cfop" | "mes";
const AGRUPAR: { id: Agrupar; nome: string }[] = [
  { id: "fornecedor", nome: "Fornecedor" },
  { id: "ncm", nome: "NCM (produto)" },
  { id: "cfop", nome: "CFOP (operação)" },
  { id: "mes", nome: "Mês" },
];

interface Linha {
  chave: string;
  rotulo: string;
  notas: Set<string>;
  valor: number;
  icms: number;
  st: number;
  ipi: number;
  pis: number;
  cofins: number;
  iss: number;
  ibscbs: number;
  impostos: number;
  credito: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export default function PaginaCargaTributaria() {
  const { org } = useOrg();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [agrupar, setAgrupar] = useState<Agrupar>("fornecedor");
  const [grupo, setGrupo] = useState<string | null>(null);
  const [soLancadas, setSoLancadas] = useState(false);
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje, de, ate), [periodo, hoje, de, ate]);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [notas, regras, parametros] = await Promise.all([
        lerNotas(cliente.id, { ...intervalo, direcao: "entrada", fuso: org.fuso }),
        lerRegrasCredito(),
        lerParametros(cliente.id),
      ]);
      const validas = notas.filter((n) => n.situacao === "autorizada" && n.conteudo === "completa");
      const itens = await lerItensDasNotas(validas.map((n) => n.id));
      return { notas: validas, itens, regras, parametros };
    }, [cliente, intervalo, org.fuso]),
  );
  const d = consulta.dados;
  const regime = cliente?.regime ?? null;
  const nomeRegime = REGIMES.find((r) => r.id === regime)?.nome ?? "regime não informado";

  const linhas = useMemo(() => {
    if (!d) return [] as Linha[];
    const notas = new Map(d.notas.filter((n) => !soLancadas || n.processada).map((n) => [n.id, n]));
    const mapa = new Map<string, Linha>();
    for (const i of d.itens) {
      const n = notas.get(i.nota_id);
      if (!n) continue;
      const tipo = n.tipo_entrada ?? sugerirTipoEntrada(n.modelo, [i.cfop]);
      const ctx = {
        regime,
        tipoEntrada: tipo,
        data: (n.data_entrada ?? n.emissao ?? hoje).slice(0, 10),
        contribuinteIcms: d.parametros?.contribuinte_icms ?? true,
        contribuinteIpi: d.parametros?.contribuinte_ipi ?? false,
        orgId: org.id,
      };
      const item = {
        ...i,
        valor_total: Number(i.valor_total),
        desconto: Number(i.desconto),
        frete: Number(i.frete),
        seguro: Number(i.seguro),
        outros: Number(i.outros),
        icms_valor: Number(i.icms_valor),
        icms_st_valor: Number(i.icms_st_valor),
        ipi_valor: Number(i.ipi_valor),
      };
      const credito = TRIBUTOS_CREDITO.reduce((a, t) => a + creditoDoItem(item, t, ctx, d.regras).valor, 0);
      const [chave, rotulo] =
        agrupar === "fornecedor"
          ? [n.emitente_doc ?? n.emitente_nome ?? "?", fornecedorDa(n)]
          : agrupar === "ncm"
            ? [i.ncm ?? "sem", i.ncm ? `NCM ${i.ncm}` : n.modelo === "nfse" ? "Serviços (NFS-e)" : "Sem NCM"]
            : agrupar === "cfop"
              ? [i.cfop ?? "sem", i.cfop ? `CFOP ${i.cfop}` : n.modelo === "nfse" ? "Serviços (NFS-e)" : "Sem CFOP"]
              : [(n.emissao ?? "").slice(0, 7), mesAno(`${(n.emissao ?? "").slice(0, 7)}-01`)];
      const l = mapa.get(chave) ?? {
        chave,
        rotulo,
        notas: new Set<string>(),
        valor: 0,
        icms: 0,
        st: 0,
        ipi: 0,
        pis: 0,
        cofins: 0,
        iss: 0,
        ibscbs: 0,
        impostos: 0,
        credito: 0,
      };
      const iss = n.modelo === "nfse" ? Number(n.iss_valor) / Math.max(1, d.itens.filter((x) => x.nota_id === n.id).length) : 0;
      l.notas.add(n.id);
      l.valor += Number(i.valor_total) + Number(i.frete) + Number(i.seguro) + Number(i.outros) - Number(i.desconto);
      l.icms += Number(i.icms_valor);
      l.st += Number(i.icms_st_valor);
      l.ipi += Number(i.ipi_valor);
      l.pis += Number(i.pis_valor);
      l.cofins += Number(i.cofins_valor);
      l.iss += iss;
      l.ibscbs += Number(i.ibs_valor) + Number(i.cbs_valor);
      l.credito += credito;
      mapa.set(chave, l);
    }
    return [...mapa.values()]
      .map((l) => ({
        ...l,
        impostos: r2(l.icms + l.st + l.ipi + l.pis + l.cofins + l.iss + l.ibscbs),
        credito: r2(l.credito),
        valor: r2(l.valor),
      }))
      .sort((a, b) => (agrupar === "mes" ? a.chave.localeCompare(b.chave) : b.impostos - a.impostos));
  }, [d, agrupar, soLancadas, regime, hoje, org.id]);

  const tabela = grupo ? linhas.filter((l) => l.chave === grupo) : linhas;
  const tot = (f: (l: Linha) => number) => r2(tabela.reduce((a, l) => a + f(l), 0));
  const valor = tot((l) => l.valor);
  const impostos = tot((l) => l.impostos);
  const credito = tot((l) => l.credito);
  const qtdNotas = new Set(tabela.flatMap((l) => [...l.notas])).size;
  const rotuloPeriodo = intervalo.de ? `${fmtData(intervalo.de)} a ${fmtData(intervalo.ate ?? "")}` : "todo o período";
  const resumo = !tabela.length
    ? ""
    : `Em ${qtdNotas} nota(s) de ${rotuloPeriodo}, ${brl(impostos)} de impostos vieram no preço das compras (${cargaPercentual(impostos, valor).toLocaleString("pt-BR")}% do valor). ` +
      (regime
        ? `Pelo ${nomeRegime}, a estimativa de créditos a aproveitar é ${brl(credito)}.`
        : "Informe o regime tributário no cadastro da empresa para estimar os créditos.");

  const regrasDoRegime = useMemo(
    () =>
      regime && d
        ? (["icms", "ipi", "pis", "cofins", "ibs"] as const)
            .map((t) => ({ t, r: regraVigente(d.regras, regime, t, hoje, org.id) }))
            .filter((x) => x.r)
        : [],
    [d, regime, hoje, org.id],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Carga tributária das entradas</h1>
          <p className="text-sm text-neutral-600">
            Quanto de imposto veio no preço das compras e quanto a MDC pode recuperar (estimativa pelo regime).
          </p>
        </div>
        <BotoesExportar
          vazio={!tabela.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Carga tributária das entradas",
            subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${nomeRegime} · ${rotuloPeriodo} · por ${AGRUPAR.find((a) => a.id === agrupar)?.nome}${soLancadas ? " · só lançadas" : ""} · créditos são estimativa`,
            arquivo: nomeArquivo("Carga-tributaria-entradas", cliente ? nomeCliente(cliente) : "", hoje),
            logoUrl: org.logo_url,
            linhas: tabela,
            colunas: [
              {
                titulo: AGRUPAR.find((a) => a.id === agrupar)!.nome,
                valor: (l) =>
                  agrupar === "fornecedor" && /^\d+$/.test(l.chave) ? `${l.rotulo} (${formatarDocumento(l.chave)})` : l.rotulo,
                peso: 3,
                largura: 40,
              },
              { titulo: "Notas", valor: (l) => l.notas.size, formato: "numero", peso: 0.6, largura: 8 },
              { titulo: "Valor", valor: (l) => l.valor, formato: "moeda" },
              { titulo: "ICMS", valor: (l) => r2(l.icms), formato: "moeda" },
              { titulo: "ICMS-ST", valor: (l) => r2(l.st), formato: "moeda" },
              { titulo: "IPI", valor: (l) => r2(l.ipi), formato: "moeda" },
              { titulo: "PIS", valor: (l) => r2(l.pis), formato: "moeda" },
              { titulo: "COFINS", valor: (l) => r2(l.cofins), formato: "moeda" },
              { titulo: "ISS", valor: (l) => r2(l.iss), formato: "moeda" },
              { titulo: "IBS/CBS", valor: (l) => r2(l.ibscbs), formato: "moeda" },
              { titulo: "Impostos", valor: (l) => l.impostos, formato: "moeda" },
              { titulo: "Carga %", valor: (l) => cargaPercentual(l.impostos, l.valor), formato: "numero", largura: 10 },
              { titulo: "Crédito estimado", valor: (l) => l.credito, formato: "moeda" },
            ],
            totais: { Valor: valor, Impostos: impostos, "Crédito estimado": credito },
          })}
        />
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <FiltroPeriodo
          rotulo="Emissão"
          periodo={periodo}
          de={de}
          ate={ate}
          aoMudar={(v) => {
            if (v.periodo) setPeriodo(v.periodo);
            if (v.de !== undefined) setDe(v.de);
            if (v.ate !== undefined) setAte(v.ate);
            setGrupo(null);
          }}
        />
        <label className="campo">
          <span>Ver por</span>
          <select
            value={agrupar}
            onChange={(e) => {
              setAgrupar(e.target.value as Agrupar);
              setGrupo(null);
            }}
          >
            {AGRUPAR.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <details className="w-full sm:w-auto">
          <summary className="cursor-pointer py-2 text-sm text-neutral-700">Mais filtros</summary>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soLancadas} onChange={(e) => setSoLancadas(e.target.checked)} />
            Só notas já lançadas (com o tipo de entrada escolhido)
          </label>
        </details>
        {(grupo || soLancadas || periodo !== "mes" || agrupar !== "fornecedor") && (
          <button
            className="btn-link min-h-10 text-sm"
            onClick={() => {
              setGrupo(null);
              setSoLancadas(false);
              setPeriodo("mes");
              setAgrupar("fornecedor");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <SemEmpresaGestao />
      ) : consulta.carregando && !d ? (
        <Carregando />
      ) : !linhas.length ? (
        <EstadoVazio>Nenhuma nota de entrada com XML completo neste período. Troque o período ou confira as Notas recebidas.</EstadoVazio>
      ) : (
        <>
          <p className="text-sm text-neutral-700">{resumo}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador icone="moeda" titulo="Valor das compras" valor={brl(valor)} detalhe={`${qtdNotas} nota(s)`} />
            <Indicador icone="alerta"
              titulo="Impostos no preço"
              valor={brl(impostos)}
              detalhe={`${cargaPercentual(impostos, valor).toLocaleString("pt-BR")}% do valor`}
              tom="ambar"
            />
            <Indicador icone="seta-entrada"
              titulo="Créditos estimados"
              valor={brl(credito)}
              detalhe={regime ? `pelo ${nomeRegime} · estimativa` : "informe o regime da empresa"}
              tom="verde"
            />
          </div>

          <section className="cartao space-y-2 p-4">
            <h2 className="text-sm font-semibold">
              Impostos por {AGRUPAR.find((a) => a.id === agrupar)?.nome.toLowerCase()} (clique para filtrar)
            </h2>
            <BarrasClicaveis
              itens={linhas
                .slice(0, 12)
                .map((l) => ({ chave: l.chave, rotulo: l.rotulo, valor: l.impostos, detalhe: `crédito estimado ${brl(l.credito)}` }))}
              ativo={grupo}
              aoClicar={setGrupo}
            />
          </section>

          <div className="cartao overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela da carga tributária">
            <table className="tabela">
              <thead>
                <tr>
                  <th>{AGRUPAR.find((a) => a.id === agrupar)?.nome}</th>
                  <th className="text-right">Valor</th>
                  <th className="text-right" title="ICMS + ICMS-ST">
                    ICMS
                  </th>
                  <th className="text-right">IPI</th>
                  <th className="text-right">PIS/COFINS</th>
                  <th className="text-right">ISS</th>
                  <th className="text-right" title="Reforma tributária: em 2026 só informativo">
                    IBS/CBS
                  </th>
                  <th className="text-right">Carga</th>
                  <th className="text-right" title="Estimativa pelo regime; a apuração oficial é a da MDC">
                    Crédito estimado
                  </th>
                </tr>
              </thead>
              <tbody>
                {tabela.map((l) => (
                  <tr key={l.chave}>
                    <td className="min-w-48">
                      {l.rotulo}
                      <span className="block text-xs text-neutral-500">{l.notas.size} nota(s)</span>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{brl(l.valor)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{brl(r2(l.icms + l.st))}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{brl(r2(l.ipi))}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{brl(r2(l.pis + l.cofins))}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{brl(r2(l.iss))}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{brl(r2(l.ibscbs))}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {cargaPercentual(l.impostos, l.valor).toLocaleString("pt-BR")}%
                    </td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums text-emerald-800">{brl(l.credito)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td>Total</td>
                  <td className="text-right tabular-nums">{brl(valor)}</td>
                  <td className="text-right tabular-nums">{brl(tot((l) => l.icms + l.st))}</td>
                  <td className="text-right tabular-nums">{brl(tot((l) => l.ipi))}</td>
                  <td className="text-right tabular-nums">{brl(tot((l) => l.pis + l.cofins))}</td>
                  <td className="text-right tabular-nums">{brl(tot((l) => l.iss))}</td>
                  <td className="text-right tabular-nums">{brl(tot((l) => l.ibscbs))}</td>
                  <td className="text-right tabular-nums">{cargaPercentual(impostos, valor).toLocaleString("pt-BR")}%</td>
                  <td className="text-right tabular-nums">{brl(credito)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <details className="cartao p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Como o crédito é estimado ({nomeRegime})</summary>
            <p className="mt-2 text-neutral-600">
              É uma estimativa para acompanhar as compras: a apuração oficial dos impostos é feita pela MDC. Cada regra tem a lei de onde
              vem e a data em que passou a valer; quando a lei muda, a MDC cadastra a regra nova e os meses antigos continuam com a regra da
              época.
            </p>
            {!regrasDoRegime.length ? (
              <p className="mt-2 text-amber-800">Sem regras para este regime. Confira o regime no cadastro da empresa.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {regrasDoRegime.map(({ t, r }) => (
                  <li key={t}>
                    <span className="font-medium">{NOMES_TRIBUTO[t]}:</span> {r!.explicacao}{" "}
                    <span className="text-xs text-neutral-500">
                      ({r!.fonte_legal}; desde {fmtData(r!.vigencia_inicio)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d?.parametros && (
              <p className="mt-2 text-xs text-neutral-500">
                Empresa {d.parametros.contribuinte_icms ? "contribuinte" : "não contribuinte"} do ICMS e{" "}
                {d.parametros.contribuinte_ipi ? "contribuinte" : "não contribuinte"} do IPI (ajuste em Certificado digital › Busca
                automática).
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
