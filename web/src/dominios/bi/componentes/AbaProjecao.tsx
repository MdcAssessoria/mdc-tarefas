// BI › Lançamentos › Projeção: estudo da DRE para até 5 anos, partindo do realizado do ano-base (Omie). Premissas
// gerais (crescimento da receita e inflação), modo e taxa por linha, valor digitado por cima, subtotais calculados.
// Guarda vários estudos por empresa (bi_projecao_salvar), baixa e sobe a planilha-modelo e "provisiona": grava os anos
// projetados no Orçamento, mês a mês pela sazonalidade do ano-base (bi_projecao_provisionar). Regras em ../projecao.ts.
"use client";

import { useCallback, useMemo, useState } from "react";
import { fmtData } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { exportarExcel } from "@/lib/arquivos/excel";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { excluirProjecao, lerLinhasDre, lerProjecoes, lerRelatorio, provisionarProjecao, salvarProjecao } from "../dados";
import type { EstudoProjecao } from "../dados";
import { lerValor } from "../lancamentos";
import {
  ABA_PREMISSAS,
  ABA_PROJECAO,
  MAX_ANOS,
  PREMISSA_CRESCIMENTO,
  PREMISSA_INFLACAO,
  paraOrcamento,
  premissasIniciais,
  projetar,
} from "../projecao";
import type { LinhaDre, Modo, Premissas, Projecao } from "../projecao";
import type { ContextoBi } from "./contexto";
import { JanelaImportarProjecao } from "./JanelaImportarProjecao";
import { LegendaProjecao, TabelaProjecao } from "./TabelaProjecao";

export function AbaProjecao({ c }: { c: ContextoBi }) {
  const linhas = useConsulta(useCallback(() => lerLinhasDre(), []));
  const [empresa, setEmpresa] = useState(c.empresas[0]?.cliente_id ?? "");
  const anoAtual = Number(c.hoje.slice(0, 4));
  const [anoBase, setAnoBase] = useState(anoAtual - 1);
  const realizado = useConsulta(
    useCallback(
      () => (empresa ? lerRelatorio("dre", [empresa], `${anoBase}-01-01`, `${anoBase}-12-31`, false) : Promise.resolve(null)),
      [empresa, anoBase],
    ),
  );
  const estudos = useConsulta(useCallback(() => (empresa ? lerProjecoes(empresa) : Promise.resolve([])), [empresa]));
  if (!c.empresas.length) return null;
  const pronto = linhas.dados && realizado.dados !== undefined && estudos.dados;
  const erro = linhas.erro ?? realizado.erro ?? estudos.erro;
  return (
    <div className="space-y-3">
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {!pronto ? (
        !erro && <Esqueleto />
      ) : (
        <Estudo
          // troca de empresa ou de ano-base recomeça o estudo na tela
          key={`${empresa}|${anoBase}`}
          c={c}
          linhas={linhas.dados!}
          empresa={empresa}
          setEmpresa={setEmpresa}
          anoBase={anoBase}
          setAnoBase={setAnoBase}
          anoAtual={anoAtual}
          realizadoMatriz={realizado.dados ?? null}
          estudos={estudos.dados!}
          recarregarEstudos={estudos.recarregar}
        />
      )}
    </div>
  );
}

type Matriz = Awaited<ReturnType<typeof lerRelatorio>>;

function Estudo({
  c,
  linhas,
  empresa,
  setEmpresa,
  anoBase,
  setAnoBase,
  anoAtual,
  realizadoMatriz,
  estudos,
  recarregarEstudos,
}: {
  c: ContextoBi;
  linhas: LinhaDre[];
  empresa: string;
  setEmpresa: (v: string) => void;
  anoBase: number;
  setAnoBase: (v: number) => void;
  anoAtual: number;
  realizadoMatriz: Matriz | null;
  estudos: EstudoProjecao[];
  recarregarEstudos: () => void;
}) {
  const emp = c.empresas.find((e) => e.cliente_id === empresa);
  const doAno = estudos.filter((e) => e.ano_base === anoBase);
  const [estudoId, setEstudoId] = useState<string | null>(doAno[0]?.id ?? null);
  const carregado = estudos.find((e) => e.id === estudoId) ?? null;
  const [nome, setNome] = useState(carregado?.nome ?? `Cenário ${anoBase + 1}–${anoBase + 3}`);
  const [p, setP] = useState<Premissas>(() => carregado?.premissas ?? premissasIniciais(linhas));
  const [alterado, setAlterado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [importar, setImportar] = useState(false);
  const [aviso, setAviso] = useState("");
  const [janela, confirmar] = useConfirmar();

  // realizado do ano-base: total e mês a mês por linha (sazonalidade)
  const { total, sazonalidade, naoClassificado } = useMemo(() => {
    const t: Record<string, number> = {};
    const s: Record<string, number[]> = {};
    let nc = 0;
    for (const l of realizadoMatriz?.linhas ?? []) {
      if (l.subtotal) continue;
      t[l.codigo] = l.total;
      const meses = Array(12).fill(0);
      (realizadoMatriz?.meses ?? []).forEach((m, i) => (meses[Number(m.slice(5, 7)) - 1] = l.valores[i]));
      s[l.codigo] = meses;
      if (l.codigo === "nao_classificado") nc = l.total;
    }
    return { total: t, sazonalidade: s, naoClassificado: nc };
  }, [realizadoMatriz]);
  const proj: Projecao = useMemo(() => projetar(linhas, anoBase, total, p), [linhas, anoBase, total, p]);
  const semRealizado = !Object.values(total).some((v) => v);

  function mudar(f: (x: Premissas) => Premissas) {
    setP((x) => f(structuredClone(x)));
    setAlterado(true);
    setAviso("");
  }
  const vetor = (arr: (number | null)[] | undefined) => (arr ? [...arr] : Array(MAX_ANOS).fill(null));
  function abrirEstudo(id: string) {
    const e = estudos.find((x) => x.id === id);
    if (!e) {
      setEstudoId(null);
      setNome(`Cenário ${anoBase + 1}–${anoBase + 3}`);
      setP(premissasIniciais(linhas));
    } else {
      setEstudoId(e.id);
      setNome(e.nome);
      setP(e.premissas);
    }
    setAlterado(false);
  }

  async function salvar(): Promise<string | null> {
    if (!emp) return null;
    setOcupado(true);
    setAviso("");
    try {
      const id = await salvarProjecao(estudoId, emp.cliente_id, nome, anoBase, p);
      setEstudoId(id);
      setAlterado(false);
      c.avisar("Estudo gravado.", "sucesso");
      recarregarEstudos();
      return id;
    } catch (e) {
      setAviso(traduzirErro(e));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function provisionar() {
    if (!emp) return;
    const anos = proj.anos.slice(1);
    const ok = await confirmar({
      titulo: "Gravar a projeção no Orçamento?",
      descricao: (
        <>
          Substitui o orçamento da DRE de <strong>{emp.nome}</strong> de {anos[0]} a {anos[anos.length - 1]}, em todas as
          linhas, mês a mês pela sazonalidade de {anoBase}. O que estiver no Orçamento desses anos é trocado pelo estudo
          &quot;{nome}&quot;. Depois a comparação fica em Comparar → Orçamento.
        </>
      ),
      botao: "Gravar no Orçamento",
    });
    if (!ok) return;
    const id = alterado || !estudoId ? await salvar() : estudoId;
    if (!id) return;
    setOcupado(true);
    try {
      const r = await provisionarProjecao(id, paraOrcamento(proj, emp.cnpj, sazonalidade));
      if (!r.ok) return setAviso(`Nada foi gravado: ${(r.erros ?? []).slice(0, 5).join(" · ")}`);
      c.avisar(`Orçamento de ${anos[0]} a ${anos[anos.length - 1]} gravado (${r.gravadas ?? 0} valor(es)).`, "sucesso");
      recarregarEstudos();
    } catch (e) {
      setAviso(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    if (!carregado) return;
    const ok = await confirmar({
      titulo: `Excluir o estudo "${carregado.nome}"?`,
      descricao: "O estudo sai da lista. O que já foi gravado no Orçamento continua lá.",
      botao: "Excluir estudo",
      perigo: true,
    });
    if (!ok) return;
    try {
      await excluirProjecao(carregado.id);
      c.avisar("Estudo excluído.", "sucesso");
      abrirEstudo("");
      recarregarEstudos();
    } catch (e) {
      setAviso(traduzirErro(e));
    }
  }

  async function baixarModelo() {
    if (!emp) return;
    try {
      const anos = proj.anos;
      await exportarExcel(
        nomeArquivo("BI-projecao", emp.nome, String(anoBase)),
        `Projeção da DRE · ${emp.nome}`,
        `Ano-base ${anoBase} (realizado) · digite valores positivos; deixe em branco para o HUB calcular · subtotais são calculados`,
        [
          {
            nome: ABA_PROJECAO,
            colunas: [
              { titulo: "Linha", chave: "linha", largura: 44 },
              { titulo: "Código", chave: "codigo", largura: 24 },
              ...anos.map((a, i) => ({ titulo: i === 0 ? `${a} (base)` : String(a), chave: `a${i}`, largura: 18 })),
            ],
            linhas: proj.linhas.map((l) => ({
              linha: l.nome,
              codigo: l.subtotal ? "(subtotal)" : l.codigo,
              ...Object.fromEntries(l.valores.map((v, i) => [`a${i}`, l.subtotal ? v : Math.abs(v)])),
            })),
          },
          {
            nome: ABA_PREMISSAS,
            colunas: [
              { titulo: "Premissa", chave: "premissa", largura: 32 },
              ...anos.slice(1).map((a, i) => ({ titulo: String(a), chave: `a${i}`, largura: 14 })),
            ],
            linhas: [
              { premissa: PREMISSA_CRESCIMENTO, ...Object.fromEntries(anos.slice(1).map((_, i) => [`a${i}`, p.crescimentoReceita[i]])) },
              { premissa: PREMISSA_INFLACAO, ...Object.fromEntries(anos.slice(1).map((_, i) => [`a${i}`, p.inflacao[i]])) },
            ],
          },
        ],
      );
    } catch (e) {
      c.avisar(traduzirErro(e), "erro");
    }
  }

  const anosOpcoes = Array.from({ length: 5 }, (_, i) => anoAtual - 4 + i);
  const podeEditar = c.podeLancar;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_8rem_8rem_minmax(0,14rem)_minmax(0,1fr)]">
        <label className="campo">
          <span>Empresa</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            {c.empresas.map((e) => (
              <option key={e.cliente_id} value={e.cliente_id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Ano-base</span>
          <select value={anoBase} onChange={(e) => setAnoBase(Number(e.target.value))}>
            {anosOpcoes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Anos à frente</span>
          <select value={p.anos} disabled={!podeEditar} onChange={(e) => mudar((x) => ({ ...x, anos: Number(e.target.value) }))}>
            {Array.from({ length: MAX_ANOS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "ano" : "anos"}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Estudo</span>
          <select value={estudoId ?? ""} onChange={(e) => abrirEstudo(e.target.value)}>
            <option value="">Novo estudo</option>
            {doAno.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Nome do estudo</span>
          <input
            value={nome}
            maxLength={80}
            disabled={!podeEditar}
            onChange={(e) => {
              setNome(e.target.value);
              setAlterado(true);
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <button type="button" className="btn-primario" disabled={ocupado || !alterado} onClick={() => void salvar()}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Gravando…" : "Gravar estudo"}
          </button>
        )}
        {podeEditar && (
          <button type="button" className="btn" disabled={ocupado || semRealizado} onClick={() => void provisionar()}>
            <Icone nome="enviar" className="h-4 w-4" />
            Provisionar no Orçamento
          </button>
        )}
        {podeEditar && (
          <button type="button" className="btn" onClick={() => setImportar(true)}>
            <Icone nome="importar" className="h-4 w-4" />
            Importar Excel
          </button>
        )}
        <button type="button" className="btn" onClick={baixarModelo}>
          <Icone nome="baixar" className="h-4 w-4" />
          Baixar modelo
        </button>
        <BotoesExportar
          vazio={false}
          avisar={c.avisar}
          montar={() => ({
            titulo: `Projeção da DRE · ${emp?.nome ?? ""}`,
            subtitulo: `${nome} · ano-base ${anoBase} (realizado) · ${proj.anos.length - 1} ano(s) projetado(s)`,
            arquivo: nomeArquivo("BI-projecao", emp?.nome ?? "", nome),
            logoUrl: c.logoUrl,
            paisagem: true,
            linhas: proj.linhas,
            colunas: [
              { titulo: "Linha", valor: (l: Projecao["linhas"][number]) => l.nome, peso: 3, largura: 44 },
              ...proj.anos.map((a, i) => ({
                titulo: i === 0 ? `${a} (base)` : String(a),
                valor: (l: Projecao["linhas"][number]) => l.valores[i],
                formato: "moeda" as const,
                alerta: (l: Projecao["linhas"][number]) => l.valores[i] < 0,
              })),
            ],
          })}
        />
        {podeEditar && carregado && (
          <button type="button" className="btn text-[var(--perigo)]" onClick={() => void excluir()}>
            <Icone nome="lixeira" className="h-4 w-4" />
            Excluir estudo
          </button>
        )}
      </div>

      {carregado?.provisionado_em && (
        <p className="flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          <Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0" />
          Provisionado no Orçamento em {fmtData(carregado.provisionado_em.slice(0, 10))}
          {carregado.provisionado_anos?.length ? ` (${carregado.provisionado_anos.join(", ")})` : ""}.
          {alterado && " O estudo mudou depois: provisione de novo para atualizar o Orçamento."}
        </p>
      )}
      {semRealizado && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          Não há realizado de {anoBase} para esta empresa. Escolha outro ano-base ou digite os valores de {anoBase} na coluna
          base (ou suba a planilha-modelo).
        </p>
      )}
      {naoClassificado !== 0 && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          {Math.abs(naoClassificado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de {anoBase} estão
          sem classificação e ficaram fora do estudo. Classifique as categorias para entrarem na linha certa.
        </p>
      )}
      {aviso && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {aviso}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--borda)] p-3">
        <p className="mb-2 text-sm font-semibold">Premissas gerais</p>
        <table className="text-sm">
          <thead>
            <tr>
              <th className="pr-3 text-left font-medium text-[var(--texto-suave)]">Premissa</th>
              {proj.anos.slice(1).map((a) => (
                <th key={a} className="px-1 text-right font-medium text-[var(--texto-suave)]">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["crescimentoReceita", "Crescimento da receita (%)"],
                ["inflacao", "Inflação / reajuste das despesas (%)"],
              ] as const
            ).map(([campo, rotulo]) => (
              <tr key={campo}>
                <td className="py-1 pr-3">{rotulo}</td>
                {proj.anos.slice(1).map((a, i) => (
                  <td key={a} className="px-1 py-1">
                    <input
                      key={`${campo}${i}${p[campo][i]}`}
                      aria-label={`${rotulo} ${a}`}
                      inputMode="decimal"
                      disabled={!podeEditar}
                      defaultValue={String(p[campo][i] ?? 0).replace(".", ",")}
                      onBlur={(e) => {
                        const n = lerValor(e.target.value);
                        if (n === null || Number.isNaN(n)) return;
                        if (n !== p[campo][i])
                          mudar((x) => {
                            x[campo][i] = n;
                            return x;
                          });
                      }}
                      className="num w-20 rounded border border-[var(--borda)] bg-white px-2 py-1 text-right disabled:border-transparent disabled:bg-transparent"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TabelaProjecao
        proj={proj}
        taxasDigitadas={Object.fromEntries(Object.entries(p.linhas).map(([k, v]) => [k, v.taxas]))}
        podeEditar={podeEditar}
        aoMudarModo={(cod: string, modo: Modo) =>
          mudar((x) => {
            x.linhas[cod] = { modo, taxas: Array(MAX_ANOS).fill(null) };
            return x;
          })
        }
        aoMudarTaxa={(cod, i, taxa) =>
          mudar((x) => {
            const l = (x.linhas[cod] ??= { modo: proj.linhas.find((y) => y.codigo === cod)?.modo ?? "crescimento", taxas: [] });
            l.taxas = vetor(l.taxas);
            l.taxas[i] = taxa;
            return x;
          })
        }
        aoMudarValor={(cod, i, v) =>
          mudar((x) => {
            const arr = vetor(x.valores[cod]);
            arr[i] = v;
            x.valores[cod] = arr;
            return x;
          })
        }
        aoMudarBase={(cod, v) =>
          mudar((x) => {
            if (v === null) delete x.base[cod];
            else x.base[cod] = v;
            return x;
          })
        }
      />
      <LegendaProjecao />
      {importar && emp && (
        <JanelaImportarProjecao
          linhas={linhas}
          anoBase={anoBase}
          realizado={total}
          premissas={p}
          aoFechar={() => setImportar(false)}
          aoAplicar={(novo) => {
            setImportar(false);
            setP(novo);
            setAlterado(true);
            c.avisar("Planilha aplicada ao estudo. Confira e grave.", "sucesso");
          }}
        />
      )}
      {janela}
    </div>
  );
}
