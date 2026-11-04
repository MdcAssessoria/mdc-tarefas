// Lançamento de uma nota no modelo do Conta Azul: 1) a pessoa escolhe o TIPO DE ENTRADA (a regra mostra se mexe no
// estoque e se gera conta a pagar); 2) confere o fornecedor; 3) liga cada item da nota a um item do estoque (o HUB lembra
// o de-para do fornecedor; dá para cadastrar item novo); 4) confere as parcelas da fatura e a categoria. Ao lançar, o
// banco gera as contas a pagar e a entrada no estoque numa transação só (fis_processar_nota).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { brl } from "@/lib/formato/moeda";
import { fmtDataLocal } from "@/lib/formato/datas";
import { somarDias } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { Carregando } from "@/components/ui/Carregando";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { numeroBr, valorParaCampo } from "@/dominios/financeiro/regras";
import { formatarDocumento } from "@/lib/documento";
import type { Categoria, CentroCusto, ContaBancaria, Item, LocalEstoque, Pessoa } from "@/dominios/financeiro/tipos";
import { lerItensDasNotas } from "../leituras";
import { lancarNota } from "../repositorio";
import type { LancamentoNota } from "../repositorio";
import { regraDoTipo, sugerirTipoEntrada, TIPOS_ENTRADA } from "../tiposEntrada";
import type { CodigoTipoEntrada } from "../tiposEntrada";
import type { DeParaItem, Nota, TipoEntradaRegra } from "../tipos";
import { fornecedorDa, nomeModelo } from "./Comuns";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { NovaCategoriaRapida } from "@/dominios/financeiro/componentes/NovaCategoriaRapida";

export interface CadastrosLancamento {
  itens: Item[];
  locais: LocalEstoque[];
  pessoas: Pessoa[];
  categorias: Categoria[];
  centros: CentroCusto[];
  contas: ContaBancaria[];
  depara: DeParaItem[];
  regras: TipoEntradaRegra[];
}

const NOVO = "__novo__";
const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

interface LinhaItem {
  id: number;
  escolha: string; // id do item, NOVO ou ""
  nome: string;
  fator: string;
  lembrar: boolean;
}

export function LancarNota({
  nota,
  cad,
  orgId,
  tipoAnterior,
  aoVoltar,
  aoLancar,
  aoRecarregarCadastros,
}: {
  nota: Nota;
  cad: CadastrosLancamento;
  orgId: string;
  tipoAnterior: CodigoTipoEntrada | null;
  aoVoltar: () => void;
  aoLancar: (msg: string) => void;
  /** Relê categorias, centros e contas (depois de cadastrar uma categoria nova sem sair da tela). */
  aoRecarregarCadastros?: () => void;
}) {
  const { pode } = useOrg();
  const podeCriarCategoria = pode("plano_contas", "operar") || pode("financeiro", "operar");
  const [novaCategoria, setNovaCategoria] = useState(false);
  const itensNota = useConsulta(useCallback(() => lerItensDasNotas([nota.id]), [nota.id]));
  const [tipo, setTipo] = useState<CodigoTipoEntrada | null>(null);
  const tipoEfetivo: CodigoTipoEntrada =
    tipo ?? sugerirTipoEntrada(nota.modelo, [nota.cfop_principal, ...(itensNota.dados ?? []).map((i) => i.cfop)], tipoAnterior);
  const regra = regraDoTipo(cad.regras, tipoEfetivo, nota.cliente_id, orgId);

  const pessoaPadrao = cad.pessoas.find((p) => p.documento && so(p.documento) === so(nota.emitente_doc));
  const [pessoa, setPessoa] = useState(pessoaPadrao?.id ?? "");
  const [categoria, setCategoria] = useState("");
  const [centro, setCentro] = useState("");
  const [conta, setConta] = useState("");
  const [local, setLocal] = useState(cad.locais.find((l) => l.padrao && l.ativo)?.id ?? "");
  const [dataEntrada, setDataEntrada] = useState((nota.emissao ?? "").slice(0, 10));
  const [obs, setObs] = useState("");
  const [linhasEditadas, setLinhasEditadas] = useState<Record<number, LinhaItem>>({});
  const aPagar =
    Math.round((Number(nota.valor_total) - Number(nota.retencoes) - (nota.iss_retido ? Number(nota.iss_valor) : 0)) * 100) / 100;
  const [parcelas, setParcelas] = useState(() =>
    nota.duplicatas?.length
      ? nota.duplicatas.map((d) => ({ vencimento: d.vencimento, valor: valorParaCampo(d.valor) }))
      : [{ vencimento: somarDias((nota.emissao ?? new Date().toISOString()).slice(0, 10), 30), valor: valorParaCampo(aPagar) }],
  );
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [janelaConfirmar, confirmar] = useConfirmar();
  // o que a pessoa já mexeu: ao voltar, pergunta antes de descartar (reauditoria UX-12)
  const [inicio] = useState(() => ({ pessoa, local, dataEntrada, parcelas: JSON.stringify(parcelas) }));
  const alterado =
    tipo !== null ||
    pessoa !== inicio.pessoa ||
    categoria !== "" ||
    centro !== "" ||
    conta !== "" ||
    local !== inicio.local ||
    dataEntrada !== inicio.dataEntrada ||
    obs.trim() !== "" ||
    Object.keys(linhasEditadas).length > 0 ||
    JSON.stringify(parcelas) !== inicio.parcelas;
  async function voltar() {
    if (alterado) {
      const sim = await confirmar({
        titulo: "Sair sem lançar a nota?",
        descricao: "O que você escolheu nesta nota (tipo de entrada, fornecedor, itens, parcelas) não fica guardado.",
        botao: "Sair sem lançar",
        voltar: "Continuar lançando",
        perigo: true,
      });
      if (!sim) return;
    }
    aoVoltar();
  }

  const categoriaEfetiva = categoria || regra.categoria_id || "";
  const ativos = useMemo(() => cad.itens.filter((i) => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome)), [cad.itens]);
  const linhas: LinhaItem[] = useMemo(
    () =>
      (itensNota.dados ?? []).map((i) => {
        if (linhasEditadas[i.id]) return linhasEditadas[i.id];
        const dp = cad.depara.find((d) => d.fornecedor_doc === so(nota.emitente_doc) && d.codigo_fornecedor === i.codigo);
        const item = i.item_id ?? dp?.item_id ?? "";
        return { id: i.id, escolha: item, nome: i.descricao, fator: valorParaCampo(Number(dp?.fator ?? i.fator ?? 1), 0), lembrar: true };
      }),
    [itensNota.dados, linhasEditadas, cad.depara, nota.emitente_doc],
  );
  const mudarLinha = (l: LinhaItem, m: Partial<LinhaItem>) => setLinhasEditadas((x) => ({ ...x, [l.id]: { ...l, ...m } }));
  const somaParcelas = parcelas.reduce((a, p) => a + (numeroBr(p.valor) || 0), 0);
  const despesas = cad.categorias.filter((c) => c.tipo === "despesa" && c.ativo);

  async function lancar() {
    setErro("");
    if (regra.movimenta_estoque && linhas.some((l) => !l.escolha))
      return setErro("Ligue todos os itens a um item do estoque (ou cadastre um novo).");
    if (regra.movimenta_estoque && !local) return setErro("Escolha o estoque onde a mercadoria entra.");
    if (regra.gera_pagar) {
      if (!categoriaEfetiva) return setErro("Escolha a categoria (despesa) desta compra.");
      if (!parcelas.length || parcelas.some((p) => !p.vencimento || !(numeroBr(p.valor) > 0)))
        return setErro("Confira as parcelas: cada uma precisa de vencimento e valor.");
      if (somaParcelas > Number(nota.valor_total) + 0.01) return setErro("A soma das parcelas passa do valor da nota.");
    }
    const corpo: LancamentoNota = {
      nota: nota.id,
      tipo_entrada: tipoEfetivo,
      pessoa: pessoa || null,
      categoria: regra.gera_pagar ? categoriaEfetiva : null,
      centro: centro || null,
      conta_prevista: conta || null,
      local: regra.movimenta_estoque ? local : null,
      data_entrada: dataEntrada || null,
      observacao: obs || null,
      itens: linhas.map((l) => {
        const ni = itensNota.dados!.find((i) => i.id === l.id)!;
        return {
          id: l.id,
          item: l.escolha && l.escolha !== NOVO ? l.escolha : null,
          novo:
            l.escolha === NOVO
              ? {
                  nome: l.nome.trim() || ni.descricao,
                  unidade: ni.unidade ?? "UN",
                  ncm: ni.ncm,
                  codigo: null,
                  controla_estoque: regra.movimenta_estoque,
                }
              : null,
          fator: numeroBr(l.fator) || 1,
          lembrar: l.lembrar,
        };
      }),
      parcelas: regra.gera_pagar ? parcelas.map((p) => ({ vencimento: p.vencimento, valor: numeroBr(p.valor) })) : [],
    };
    setOcupado(true);
    try {
      const r = await lancarNota(corpo);
      aoLancar(`Nota ${nota.numero ?? ""} lançada: ${r.titulos.length} conta(s) a pagar e ${r.movimentos.length} entrada(s) no estoque.`);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  const passo = (n: number, titulo: string, filho: React.ReactNode) => (
    <section className="cartao space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--marca)] text-sm text-white">{n}</span>
        {titulo}
      </h2>
      {filho}
    </section>
  );

  return (
    <div className="space-y-4">
      {janelaConfirmar}
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <button className="btn-link text-sm" onClick={() => void voltar()}>
            ← Voltar à lista
          </button>
          <h2 className="text-lg font-semibold text-[var(--marca)]">
            {nomeModelo(nota.modelo)} {nota.numero} · {fornecedorDa(nota)}
          </h2>
          <p className="text-sm text-neutral-600">
            Emitida em {fmtDataLocal(nota.emissao)} · valor {brl(Number(nota.valor_total))}
            {Number(nota.retencoes) > 0 && ` · retenções ${brl(Number(nota.retencoes))}`}
          </p>
        </div>
      </div>

      {passo(
        1,
        "O que é esta nota?",
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TIPOS_ENTRADA.map((t) => {
            const r = regraDoTipo(cad.regras, t.codigo, nota.cliente_id, orgId);
            return (
              <label
                key={t.codigo}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${tipoEfetivo === t.codigo ? "border-[var(--destaque-escuro)] bg-amber-50/50" : "border-[var(--borda)]"}`}
              >
                <input type="radio" name="tipo" checked={tipoEfetivo === t.codigo} onChange={() => setTipo(t.codigo)} className="mt-1" />
                <span>
                  <span className="block font-medium">{t.nome}</span>
                  <span className="block text-xs text-neutral-600">{t.explicacao}</span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    Estoque: {r.movimenta_estoque ? "entra" : "não mexe"} · Conta a pagar: {r.gera_pagar ? "gera" : "não gera"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>,
      )}

      {passo(
        2,
        "Fornecedor",
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <p className="min-w-60 flex-1">
            <span className="block font-medium">{fornecedorDa(nota)}</span>
            <span className="text-neutral-600">{nota.emitente_doc ? formatarDocumento(nota.emitente_doc) : "sem CNPJ"}</span>
            <span className="block text-xs text-neutral-500">
              {pessoaPadrao ? "Já está no cadastro de fornecedores." : "Não está no cadastro: será cadastrado automaticamente ao lançar."}
            </span>
          </p>
          <label className="campo min-w-60">
            <span>Lançar em nome de</span>
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">{pessoaPadrao ? pessoaPadrao.nome : "Cadastrar este fornecedor"}</option>
              {cad.pessoas
                .filter((p) => p.ativo && p.id !== pessoaPadrao?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          </label>
        </div>,
      )}

      {passo(
        3,
        regra.movimenta_estoque ? "Itens que entram no estoque" : "Itens da nota",
        itensNota.carregando && !itensNota.dados ? (
          <Carregando />
        ) : (
          <>
            {regra.movimenta_estoque ? (
              <div className="flex flex-wrap gap-3">
                <label className="campo">
                  <span>Estoque de entrada</span>
                  <select value={local} onChange={(e) => setLocal(e.target.value)}>
                    <option value="">Escolha…</option>
                    {cad.locais
                      .filter((l) => l.ativo)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="self-end pb-2 text-xs text-neutral-600">
                  “Unidades por item da nota”: se a nota vem em caixa com 12 e o estoque é por unidade, use 12. O HUB lembra na próxima nota
                  deste fornecedor.
                </p>
              </div>
            ) : (
              <p className="text-xs text-neutral-600">
                Este tipo de entrada não mexe no estoque. Ligar os itens é opcional (ajuda nos relatórios).
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="tabela text-sm">
                <thead>
                  <tr>
                    <th>Item da nota</th>
                    <th className="text-right">Qtd.</th>
                    <th className="text-right">Valor</th>
                    <th>Item do estoque</th>
                    <th>Unidades por item</th>
                    <th>Lembrar</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const ni = itensNota.dados!.find((i) => i.id === l.id)!;
                    return (
                      <tr key={l.id}>
                        <td className="min-w-48">
                          {ni.descricao}
                          <span className="block text-xs text-neutral-500">
                            {ni.codigo ? `cód. ${ni.codigo}` : ""} {ni.ncm ? `· NCM ${ni.ncm}` : ""}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {Number(ni.quantidade).toLocaleString("pt-BR")} {ni.unidade}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{brl(Number(ni.valor_total))}</td>
                        <td className="min-w-56">
                          <select
                            aria-label={`Item do estoque para ${ni.descricao}`}
                            value={l.escolha}
                            onChange={(e) => mudarLinha(l, { escolha: e.target.value })}
                          >
                            <option value="">{regra.movimenta_estoque ? "Escolha…" : "Não ligar"}</option>
                            <option value={NOVO}>+ Cadastrar item novo</option>
                            {ativos.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nome}
                                {i.codigo ? ` (${i.codigo})` : ""}
                                {i.controla_estoque ? "" : " · não controla estoque"}
                              </option>
                            ))}
                          </select>
                          {l.escolha === NOVO && (
                            <input
                              className="mt-1"
                              aria-label="Nome do item novo"
                              value={l.nome}
                              onChange={(e) => mudarLinha(l, { nome: e.target.value })}
                            />
                          )}
                        </td>
                        <td>
                          <input
                            className="w-20"
                            inputMode="decimal"
                            aria-label="Unidades por item"
                            value={l.fator}
                            onChange={(e) => mudarLinha(l, { fator: e.target.value })}
                          />
                        </td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            aria-label="Lembrar para este fornecedor"
                            checked={l.lembrar}
                            onChange={(e) => mudarLinha(l, { lembrar: e.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ),
      )}

      {novaCategoria && (
        <NovaCategoriaRapida
          cliente={{ id: nota.cliente_id, org_id: orgId }}
          tipo="despesa"
          aoFechar={() => setNovaCategoria(false)}
          aoCriar={(id) => {
            setNovaCategoria(false);
            setCategoria(id);
            aoRecarregarCadastros?.();
          }}
        />
      )}
      {regra.gera_pagar ? (
        passo(
          4,
          "Contas a pagar",
          <>
            <div className="flex flex-wrap gap-3">
              <div className="campo min-w-56">
                <span>Categoria (despesa)</span>
                <select value={categoriaEfetiva} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria (despesa)">
                  <option value="">{despesas.length ? "Escolha…" : "Nenhuma categoria cadastrada"}</option>
                  {despesas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                {podeCriarCategoria ? (
                  <button type="button" className="btn-link self-start text-xs" onClick={() => setNovaCategoria(true)}>
                    + Nova categoria
                  </button>
                ) : (
                  despesas.length === 0 && (
                    <small className="text-xs">Peça a quem cuida do Plano de contas para cadastrar as categorias.</small>
                  )
                )}
              </div>
              <label className="campo">
                <span>Centro de custo</span>
                <select value={centro} onChange={(e) => setCentro(e.target.value)}>
                  <option value="">Nenhum</option>
                  {cad.centros
                    .filter((c) => c.ativo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </label>
              <label className="campo">
                <span>Pagar pela conta</span>
                <select value={conta} onChange={(e) => setConta(e.target.value)}>
                  <option value="">Decidir depois</option>
                  {cad.contas
                    .filter((c) => c.ativo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-neutral-600">
              {nota.duplicatas?.length ? "Parcelas lidas da fatura da nota." : "A nota não traz parcelas: confira o vencimento."} Valor a
              pagar sugerido: {brl(aPagar)}
              {aPagar !== Number(nota.valor_total) && " (valor da nota menos retenções)"}.
            </p>
            <div className="space-y-2">
              {parcelas.map((p, k) => (
                <div key={k} className="flex flex-wrap items-end gap-2">
                  <span className="pb-2 text-sm text-neutral-600">{k + 1}ª</span>
                  <label className="campo">
                    <span>Vencimento</span>
                    <input
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => setParcelas((x) => x.map((y, j) => (j === k ? { ...y, vencimento: e.target.value } : y)))}
                    />
                  </label>
                  <label className="campo">
                    <span>Valor</span>
                    <input
                      inputMode="decimal"
                      value={p.valor}
                      onChange={(e) => setParcelas((x) => x.map((y, j) => (j === k ? { ...y, valor: e.target.value } : y)))}
                    />
                  </label>
                  {parcelas.length > 1 && (
                    <button className="btn-link pb-2 text-sm" onClick={() => setParcelas((x) => x.filter((_, j) => j !== k))}>
                      Tirar
                    </button>
                  )}
                </div>
              ))}
              <button
                className="btn"
                onClick={() =>
                  setParcelas((x) => [...x, { vencimento: somarDias(x[x.length - 1]?.vencimento || dataEntrada, 30), valor: "" }])
                }
              >
                + Parcela
              </button>
              <p className={`text-sm ${Math.abs(somaParcelas - aPagar) > 0.01 ? "text-amber-800" : "text-neutral-600"}`}>
                Soma das parcelas: {brl(somaParcelas)}
                {Math.abs(somaParcelas - aPagar) > 0.01 && ` (diferente do valor a pagar sugerido, ${brl(aPagar)})`}
              </p>
            </div>
          </>,
        )
      ) : (
        <p className="cartao p-4 text-sm text-neutral-700">Este tipo de entrada não gera conta a pagar.</p>
      )}

      <section className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Data da entrada</span>
          <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
        </label>
        <label className="campo min-w-60 flex-1">
          <span>Observação (opcional)</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
      </section>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={() => void voltar()}>
          Voltar
        </button>
        <button className="btn-primario" onClick={lancar} disabled={ocupado || !itensNota.dados}>
          {ocupado ? "Lançando…" : "Lançar nota"}
        </button>
      </div>
    </div>
  );
}
