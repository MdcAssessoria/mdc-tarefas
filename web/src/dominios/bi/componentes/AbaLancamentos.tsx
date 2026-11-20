// Lançamentos do BI: o que não está no Omie (lançamentos complementares, que entram na DRE e/ou no DFC) e o orçamento
// (meta por linha e mês, para o orçado × realizado). Um a um na tela ou em lote pela planilha-modelo. Quem não tem o
// nível operar no BI só vê.
"use client";

import { useCallback, useMemo, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { exportarExcel } from "@/lib/arquivos/excel";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { Abas } from "@/components/ui/Abas";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Modal } from "@/components/ui/Modal";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { cancelarComplementar, gravarComplementares, gravarOrcamento, lerComplementares, lerLinhas, lerOrcamento } from "../dados";
import type { ComplementarLido, ResultadoGravacao } from "../dados";
import {
  COLUNAS_COMPLEMENTAR,
  COLUNAS_ORCAMENTO,
  lerPlanilhaComplementares,
  lerPlanilhaOrcamento,
  lerValor,
  mesesDoAno,
} from "../lancamentos";
import type { ComplementarBanco, LinhaRelatorio, OrcamentoBanco } from "../lancamentos";
import type { TipoRelatorio } from "../relatorio";
import { SeletorRelatorio } from "./SeletorRelatorio";
import type { ContextoBi } from "./contexto";

type Sub = "complementares" | "orcamento";

function mensagemGravacao(r: ResultadoGravacao): string {
  if (r.ok) return "";
  const lista = (r.erros ?? []).slice(0, 8).join(" · ");
  return `${r.total_erros ?? r.erros?.length ?? 0} linha(s) com problema, nada foi gravado: ${lista}`;
}

export function AbaLancamentos({ c }: { c: ContextoBi }) {
  const [sub, setSub] = useState<Sub>("complementares");
  const linhas = useConsulta(useCallback(async () => (await lerLinhas()).filter((l) => l.codigo !== "nao_classificado"), []));
  return (
    <div className="space-y-4">
      <Abas
        rotulo="Tipo de lançamento"
        valor={sub}
        aoMudar={setSub}
        itens={[
          { id: "complementares", nome: "Lançamentos complementares" },
          { id: "orcamento", nome: "Orçamento" },
        ]}
      />
      {!c.podeLancar && (
        <p className="flex items-start gap-2 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
          <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
          Você pode ver; para lançar, peça ao administrador o nível &quot;operar&quot; no BI de Gestão.
        </p>
      )}
      {linhas.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {linhas.erro}
        </p>
      )}
      {!linhas.dados ? (
        !linhas.erro && <Esqueleto />
      ) : sub === "complementares" ? (
        <Complementares c={c} linhas={linhas.dados} />
      ) : (
        <Orcamento c={c} linhas={linhas.dados} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- complementares
function Complementares({ c, linhas }: { c: ContextoBi; linhas: LinhaRelatorio[] }) {
  const lista = useConsulta(useCallback(() => lerComplementares(c.ids, c.de, c.ate), [c.ids, c.de, c.ate]));
  const [novo, setNovo] = useState(false);
  const [importar, setImportar] = useState(false);
  const [cancelar, setCancelar] = useState<ComplementarLido | null>(null);
  const nomeLinha = (rel: TipoRelatorio, cod: string | null) =>
    cod ? (linhas.find((l) => l.relatorio === rel && l.codigo === cod)?.nome ?? cod) : "—";
  const nomeEmpresa = (id: string) => c.empresas.find((e) => e.cliente_id === id)?.nome ?? "Empresa";

  async function baixarModelo() {
    try {
      const e = c.empresas[0];
      await exportarExcel(
        `Modelo-lancamentos-BI-${c.hoje}`,
        "Modelo de lançamentos complementares do BI",
        "Preencha uma linha por lançamento",
        [
          {
            nome: "Lançamentos",
            colunas: COLUNAS_COMPLEMENTAR.map((t) => ({ titulo: t, chave: t, largura: t === "Histórico" ? 40 : 22 })),
            linhas: [
              {
                CNPJ: e?.cnpj ?? "",
                Competência: `${c.hoje.slice(5, 7)}/${c.hoje.slice(0, 4)}`,
                "Data do caixa": fmtData(c.hoje),
                "Linha DRE": "Despesas administrativas",
                "Linha DFC": "Pagamentos de despesas operacionais",
                Histórico: "Exemplo: aluguel pago fora do Omie (apague esta linha)",
                Valor: 1500,
              },
            ],
          },
          {
            nome: "Linhas válidas",
            colunas: [
              { titulo: "Relatório", chave: "rel", largura: 12 },
              { titulo: "Linha (use o nome ou o código)", chave: "nome", largura: 48 },
              { titulo: "Código", chave: "codigo", largura: 26 },
            ],
            linhas: linhas.map((l) => ({ rel: l.relatorio.toUpperCase(), nome: l.nome, codigo: l.codigo })),
          },
        ],
      );
    } catch (e) {
      c.avisar(traduzirErro(e), "erro");
    }
  }

  const itens = lista.dados ?? [];
  const ativos = itens.filter((x) => !x.cancelado_em);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-[var(--texto-suave)]">
          O que não passa pelo Omie (depreciação, provisões, folha de outra fonte, ajustes). Entra na DRE pela competência e no DFC pela
          data do caixa. {ativos.length} lançamento(s) em {c.rotuloPeriodo}, {brl(ativos.reduce((a, x) => a + Number(x.valor), 0))}.
        </p>
        {c.podeLancar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primario" onClick={() => setNovo(true)}>
              <Icone nome="mais" className="h-4 w-4" />
              Novo lançamento
            </button>
            <button type="button" className="btn" onClick={() => setImportar(true)}>
              <Icone nome="importar" className="h-4 w-4" />
              Importar Excel
            </button>
            <button type="button" className="btn" onClick={baixarModelo}>
              <Icone nome="baixar" className="h-4 w-4" />
              Baixar modelo
            </button>
          </div>
        )}
      </div>
      {lista.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {lista.erro}
        </p>
      )}
      {!lista.dados ? (
        !lista.erro && <Esqueleto />
      ) : itens.length === 0 ? (
        <EstadoVazio icone="documento" titulo="Nenhum lançamento complementar neste período">
          Os números vêm só do Omie. Use Novo lançamento ou Importar Excel para o que estiver fora dele.
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Lançamentos complementares">
          <thead>
            <tr>
              <th>Histórico</th>
              <th>Empresa</th>
              <th>Competência</th>
              <th>Caixa</th>
              <th>Linha DRE</th>
              <th>Linha DFC</th>
              <th className="text-right">Valor</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((x) => (
              <tr key={x.id} className={x.cancelado_em ? "opacity-60" : ""}>
                <td data-rotulo="Histórico" className="celula-titulo">
                  {x.historico}
                  {x.cancelado_em && <span className="block text-xs text-[var(--perigo)]">Cancelado: {x.motivo_cancelamento}</span>}
                </td>
                <td data-rotulo="Empresa">{nomeEmpresa(x.cliente_id)}</td>
                <td data-rotulo="Competência">{fmtCompetencia(x.competencia)}</td>
                <td data-rotulo="Caixa">{x.data_caixa ? fmtData(x.data_caixa) : "—"}</td>
                <td data-rotulo="Linha DRE">{nomeLinha("dre", x.linha_dre)}</td>
                <td data-rotulo="Linha DFC">{nomeLinha("dfc", x.linha_dfc)}</td>
                <td data-rotulo="Valor" className="text-right">
                  <Valor v={Number(x.valor)} />
                </td>
                <td>
                  {c.podeLancar && !x.cancelado_em && (
                    <button type="button" className="btn" onClick={() => setCancelar(x)}>
                      <Icone nome="cancelar" className="h-4 w-4" />
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}

      {novo && (
        <NovoComplementar
          c={c}
          linhas={linhas}
          aoFechar={() => setNovo(false)}
          aoGravar={() => {
            setNovo(false);
            c.avisar("Lançamento gravado. Ele já entra na DRE e no DFC.", "sucesso");
            lista.recarregar();
          }}
        />
      )}
      {importar && (
        <ImportarPlanilha
          titulo="Importar lançamentos complementares"
          descricao="Use a planilha-modelo (botão Baixar modelo). Uma linha por lançamento; se alguma linha tiver problema, nada é gravado."
          ler={(m) => lerPlanilhaComplementares(m, linhas)}
          gravar={(ls, arq) => gravarComplementares(ls as ComplementarBanco[], arq, "excel")}
          aoFechar={() => setImportar(false)}
          aoGravar={(n) => {
            setImportar(false);
            c.avisar(`${n} lançamento(s) importado(s).`, "sucesso");
            lista.recarregar();
          }}
        />
      )}
      {cancelar && (
        <JanelaMotivo
          titulo="Cancelar lançamento"
          descricao={`${cancelar.historico} · ${brl(Number(cancelar.valor))}. O lançamento sai dos relatórios e fica no histórico com o motivo.`}
          botao="Cancelar lançamento"
          aoFechar={() => setCancelar(null)}
          aoConfirmar={async (motivo) => {
            await cancelarComplementar(cancelar.id, motivo);
            setCancelar(null);
            c.avisar("Lançamento cancelado.", "sucesso");
            lista.recarregar();
          }}
        />
      )}
    </div>
  );
}

function NovoComplementar({
  c,
  linhas,
  aoFechar,
  aoGravar,
}: {
  c: ContextoBi;
  linhas: LinhaRelatorio[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [empresa, setEmpresa] = useState(c.empresas[0]?.cliente_id ?? "");
  const [competencia, setCompetencia] = useState(c.hoje.slice(0, 7));
  const [dre, setDre] = useState("");
  const [dfc, setDfc] = useState("");
  const [caixa, setCaixa] = useState(c.hoje);
  const [historico, setHistorico] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const natureza =
    linhas.find((l) => l.relatorio === "dre" && l.codigo === dre)?.natureza ??
    linhas.find((l) => l.relatorio === "dfc" && l.codigo === dfc)?.natureza;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const v = lerValor(valor);
    if (!dre && !dfc) return setErro("Escolha a linha da DRE, do DFC ou as duas.");
    if (dfc && !caixa) return setErro("Lançamento no DFC precisa da data do caixa.");
    if (v === null || Number.isNaN(v) || v === 0) return setErro("Informe o valor.");
    if (!historico.trim()) return setErro("Escreva o histórico.");
    const cnpj = c.empresas.find((x) => x.cliente_id === empresa)?.cnpj ?? "";
    setOcupado(true);
    try {
      const r = await gravarComplementares(
        [
          {
            cnpj,
            competencia: `${competencia}-01`,
            data_caixa: dfc ? caixa : null,
            linha_dre: dre || null,
            linha_dfc: dfc || null,
            historico: historico.trim(),
            valor: v,
          },
        ],
        "Lançamento na tela",
        "manual",
      );
      if (!r.ok) return setErro(mensagemGravacao(r));
      aoGravar();
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Novo lançamento complementar"
      descricao="Para o que não está no Omie. Despesa e pagamento com valor positivo: o relatório põe o sinal pela linha."
      aoFechar={aoFechar}
      largura="4xl"
      avisoRodape={
        erro ? (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null
      }
      rodape={
        <>
          <button type="submit" form="bi-novo-lanc" className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Gravando…" : "Gravar lançamento"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="fechar" className="h-4 w-4" />
            Cancelar
          </button>
        </>
      }
    >
      <form id="bi-novo-lanc" onSubmit={salvar}>
        <ColunasFormulario>
          <label className="campo">
            <span>Empresa</span>
            <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} required>
              {c.empresas.map((e) => (
                <option key={e.cliente_id} value={e.cliente_id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Competência (mês do fato)</span>
            <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} required />
          </label>
          <label className="campo">
            <span>Linha da DRE</span>
            <select value={dre} onChange={(e) => setDre(e.target.value)}>
              <option value="">Não entra na DRE</option>
              {linhas
                .filter((l) => l.relatorio === "dre")
                .map((l) => (
                  <option key={l.codigo} value={l.codigo}>
                    {l.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo">
            <span>Linha do DFC</span>
            <select value={dfc} onChange={(e) => setDfc(e.target.value)}>
              <option value="">Não entra no DFC</option>
              {linhas
                .filter((l) => l.relatorio === "dfc")
                .map((l) => (
                  <option key={l.codigo} value={l.codigo}>
                    {l.nome}
                  </option>
                ))}
            </select>
          </label>
          {dfc && (
            <label className="campo">
              <span>Data do caixa</span>
              <input type="date" value={caixa} onChange={(e) => setCaixa(e.target.value)} required />
            </label>
          )}
          <label className="campo">
            <span>Valor (R$)</span>
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.500,00" required />
            {natureza === null && (
              <small className="text-[var(--texto-suave)]">Nesta linha o sinal vale como digitado (use − para saída).</small>
            )}
          </label>
          <label className="campo md:col-span-2">
            <span>Histórico</span>
            <input
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              maxLength={500}
              required
              placeholder="O que é e de onde veio"
            />
          </label>
        </ColunasFormulario>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- importação genérica
function ImportarPlanilha({
  titulo,
  descricao,
  ler,
  gravar,
  aoFechar,
  aoGravar,
}: {
  titulo: string;
  descricao: string;
  ler: (m: unknown[][]) => { linhas: unknown[]; erros: string[] };
  gravar: (linhas: unknown[], arquivo: string) => Promise<ResultadoGravacao>;
  aoFechar: () => void;
  aoGravar: (n: number) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lido, setLido] = useState<{ linhas: unknown[]; erros: string[] } | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function escolher(arqs: File[]) {
    const a = arqs[0];
    if (!a) return;
    setArquivo(a);
    setErro("");
    setLido(null);
    try {
      const p = await lerPlanilha(a, true);
      setLido(ler(p.dados[p.abas[0]] ?? []));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }
  async function confirmar() {
    if (!arquivo || !lido?.linhas.length) return;
    setOcupado(true);
    setErro("");
    try {
      const r = await gravar(lido.linhas, arquivo.name);
      if (!r.ok) return setErro(mensagemGravacao(r));
      aoGravar(r.linhas ?? r.gravadas ?? lido.linhas.length);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }
  const pronto = !!lido && lido.erros.length === 0 && lido.linhas.length > 0;
  return (
    <Modal
      titulo={titulo}
      descricao={descricao}
      aoFechar={aoFechar}
      largura="2xl"
      avisoRodape={
        erro ? (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null
      }
      rodape={
        <>
          <button type="button" className="btn-primario" disabled={!pronto || ocupado} onClick={confirmar}>
            <Icone nome="importar" className="h-4 w-4" />
            {ocupado ? "Gravando…" : pronto ? `Gravar ${lido.linhas.length} linha(s)` : "Gravar"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="fechar" className="h-4 w-4" />
            Cancelar
          </button>
        </>
      }
    >
      <CampoArquivo aoEscolher={escolher} accept=".xlsx,.xls,.csv" escolhido={arquivo?.name ?? null} />
      {lido && lido.erros.length > 0 && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Corrija na planilha e escolha de novo ({lido.erros.length} problema(s)):</p>
          <ul className="mt-1 list-disc pl-5">
            {lido.erros.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {pronto && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          {lido.linhas.length} linha(s) conferida(s) e prontas para gravar.
        </p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- orçamento
function Orcamento({ c, linhas }: { c: ContextoBi; linhas: LinhaRelatorio[] }) {
  const [empresa, setEmpresa] = useState(c.empresas[0]?.cliente_id ?? "");
  const [rel, setRel] = useState<TipoRelatorio>("dre");
  const [ano, setAno] = useState(Number(c.ate.slice(0, 4)));
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [importar, setImportar] = useState(false);
  const meses = mesesDoAno(ano);
  const doRel = linhas.filter((l) => l.relatorio === rel);
  const emp = c.empresas.find((e) => e.cliente_id === empresa);

  const atual = useConsulta(useCallback(() => (empresa ? lerOrcamento(empresa, rel, ano) : Promise.resolve([])), [empresa, rel, ano]));
  const gravado = useMemo(() => new Map((atual.dados ?? []).map((o) => [`${o.linha}|${o.competencia}`, Number(o.valor)])), [atual.dados]);
  const chave = (linha: string, mes: string) => `${linha}|${mes}`;
  const valorCelula = (k: string) => (k in edicao ? edicao[k] : gravado.has(k) ? String(gravado.get(k)).replace(".", ",") : "");
  const numero = (k: string) => {
    const v = lerValor(valorCelula(k));
    return v === null || Number.isNaN(v) ? 0 : Math.abs(v);
  };
  const alteradas = Object.keys(edicao).filter((k) => {
    const v = lerValor(edicao[k]);
    const antes = gravado.get(k);
    return v === null ? antes !== undefined : Number.isNaN(v) || Math.abs(v) !== antes;
  });

  function trocar(f: () => void) {
    if (alteradas.length) {
      setErro("Grave ou desfaça as alterações antes de trocar a empresa, o relatório ou o ano.");
      return;
    }
    setEdicao({});
    setErro("");
    f();
  }
  async function salvar() {
    if (!emp) return;
    const invalidas = alteradas.filter((k) => Number.isNaN(lerValor(edicao[k])));
    if (invalidas.length) return setErro("Há valores que não são número. Use o formato 1.500,00.");
    const payload: OrcamentoBanco[] = alteradas.map((k) => {
      const [linha, competencia] = k.split("|");
      const v = lerValor(edicao[k]);
      return { cnpj: emp.cnpj, relatorio: rel, linha, competencia, valor: v === null ? null : Math.abs(v) };
    });
    setOcupado(true);
    setErro("");
    try {
      const r = await gravarOrcamento(payload, null);
      if (!r.ok) return setErro(mensagemGravacao(r));
      setEdicao({});
      c.avisar(`Orçamento gravado (${r.gravadas ?? 0} valor(es), ${r.apagadas ?? 0} apagado(s)).`, "sucesso");
      atual.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }
  async function baixarModelo() {
    if (!emp) return;
    try {
      await exportarExcel(
        `Orcamento-${rel.toUpperCase()}-${emp.nome}-${ano}`,
        `Orçamento ${rel.toUpperCase()} · ${emp.nome}`,
        `Ano ${ano} · valores positivos`,
        [
          {
            nome: "Orçamento",
            colunas: COLUNAS_ORCAMENTO.map((t) => ({ titulo: t, chave: t, largura: t === "Linha" ? 44 : 16 })),
            linhas: doRel.flatMap((l) =>
              meses.map((m) => ({
                CNPJ: emp.cnpj,
                Relatório: rel.toUpperCase(),
                Linha: l.nome,
                Mês: fmtCompetencia(m),
                Valor: gravado.get(chave(l.codigo, m)) ?? "",
              })),
            ),
          },
        ],
      );
    } catch (e) {
      c.avisar(traduzirErro(e), "erro");
    }
  }

  // dois anos para trás (conferência) e cinco para a frente (planejamento); o ano já escolhido sempre aparece
  const base = Number(c.hoje.slice(0, 4));
  const anos = [...new Set([...Array.from({ length: 8 }, (_, i) => base - 2 + i), ano])].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <label className="campo md:w-64">
          <span>Empresa</span>
          <select value={empresa} onChange={(e) => trocar(() => setEmpresa(e.target.value))}>
            {c.empresas.map((e) => (
              <option key={e.cliente_id} value={e.cliente_id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo md:w-32">
          <span>Ano</span>
          <select value={ano} onChange={(e) => trocar(() => setAno(Number(e.target.value)))}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <SeletorRelatorio valor={rel} aoMudar={(r) => trocar(() => setRel(r))} />
        <div className="flex basis-full flex-wrap gap-2">
          {c.podeLancar && (
            <button type="button" className="btn-primario" disabled={!alteradas.length || ocupado} onClick={salvar}>
              <Icone nome="check" className="h-4 w-4" />
              {ocupado ? "Gravando…" : `Gravar${alteradas.length ? ` (${alteradas.length})` : ""}`}
            </button>
          )}
          {c.podeLancar && alteradas.length > 0 && (
            <button type="button" className="btn" onClick={() => setEdicao({})}>
              <Icone nome="voltar" className="h-4 w-4" />
              Desfazer
            </button>
          )}
          {c.podeLancar && (
            <button type="button" className="btn" onClick={() => setImportar(true)}>
              <Icone nome="importar" className="h-4 w-4" />
              Importar Excel
            </button>
          )}
          <button type="button" className="btn" onClick={baixarModelo}>
            <Icone nome="baixar" className="h-4 w-4" />
            {c.podeLancar ? "Baixar planilha" : "Excel"}
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--texto-suave)]">
        Meta mensal por linha, em valor positivo (despesa e pagamento saem negativos no relatório). Célula em branco = sem meta. A
        comparação fica em Comparar → Orçamento.
      </p>
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {atual.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {atual.erro}
        </p>
      )}
      {!atual.dados ? (
        !atual.erro && <Esqueleto />
      ) : (
        <QuadroTabela rotulo={`Orçamento ${rel.toUpperCase()} ${ano}`} cartoes={false}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[14rem] bg-[var(--fundo)]">Linha</th>
              {meses.map((m) => (
                <th key={m} className="min-w-[7.5rem] text-right">
                  {rotuloMes(m.slice(0, 7))}
                </th>
              ))}
              <th className="text-right">Ano</th>
            </tr>
          </thead>
          <tbody>
            {doRel.map((l) => {
              const total = meses.reduce((a, m) => a + numero(chave(l.codigo, m)), 0);
              return (
                <tr key={l.codigo}>
                  <td className="celula-titulo sticky left-0 z-[1] bg-white !font-normal">{l.nome}</td>
                  {meses.map((m) => {
                    const k = chave(l.codigo, m);
                    return (
                      <td key={m} className="p-1">
                        <input
                          aria-label={`${l.nome}, ${rotuloMes(m.slice(0, 7))}`}
                          inputMode="decimal"
                          disabled={!c.podeLancar}
                          value={valorCelula(k)}
                          onChange={(e) => setEdicao((x) => ({ ...x, [k]: e.target.value }))}
                          className={`num w-full rounded border px-2 py-1 text-right text-sm disabled:bg-neutral-50 ${k in edicao ? "border-[var(--destaque-escuro)] bg-amber-50" : "border-[var(--borda)] bg-white"}`}
                        />
                      </td>
                    );
                  })}
                  <td className="num text-right font-semibold">{brl(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </QuadroTabela>
      )}
      {importar && (
        <ImportarPlanilha
          titulo="Importar orçamento"
          descricao="Use a planilha deste botão Baixar planilha (CNPJ, Relatório, Linha, Mês, Valor). Valor em branco apaga a meta daquele mês."
          ler={(m) => lerPlanilhaOrcamento(m, linhas)}
          gravar={(ls, arq) => gravarOrcamento(ls as OrcamentoBanco[], arq)}
          aoFechar={() => setImportar(false)}
          aoGravar={(n) => {
            setImportar(false);
            setEdicao({});
            c.avisar(`${n} valor(es) de orçamento gravado(s).`, "sucesso");
            atual.recarregar();
          }}
        />
      )}
    </div>
  );
}
