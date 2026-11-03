// Janela de lançamento de conta a pagar/receber (novo, com parcelas e "já foi pago") e de edição de um título em aberto.
// O fornecedor/cliente pode ser digitado na hora: se não existir, é cadastrado junto (só com o nome).
"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import type { Cliente } from "@/dominios/clientes/tipos";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { NovaCategoriaRapida } from "./NovaCategoriaRapida";
import { lancar } from "../repositorio";
import { dividirParcelas, numeroBr, valorParaCampo } from "../regras";
import { FORMAS_PAGAMENTO } from "../tipos";
import type { Categoria, CentroCusto, ContaBancaria, Pessoa, Titulo, TipoTitulo } from "../tipos";

export const TEXTOS = {
  pagar: { titulo: "Contas a pagar", conta: "conta a pagar", pessoa: "Fornecedor", verbo: "Pagar", pago: "Já foi pago", feito: "Pago" },
  receber: {
    titulo: "Contas a receber",
    conta: "conta a receber",
    pessoa: "Cliente",
    verbo: "Receber",
    pago: "Já foi recebido",
    feito: "Recebido",
  },
} as const;

export interface Cadastros {
  pessoas: Pessoa[];
  categorias: Categoria[];
  centros: CentroCusto[];
  contas: ContaBancaria[];
}

type Form = {
  descricao: string;
  pessoa: string;
  categoria: string;
  centro: string;
  conta_prevista: string;
  documento: string;
  emissao: string;
  vencimento: string;
  valor: string;
  parcelas: string;
  observacao: string;
  jaPago: boolean;
  pagoData: string;
  pagoConta: string;
  pagoForma: string;
};

export function LancarTitulo({
  tipo,
  cliente,
  cad,
  hoje,
  editar,
  jaPago = false,
  aoFechar,
  aoSalvar,
  aoRecarregarCadastros,
}: {
  tipo: TipoTitulo;
  cliente: Cliente;
  cad: Cadastros;
  hoje: string;
  /** Título em aberto a editar (sem parcelas nem "já pago"). */
  editar?: Titulo;
  /** Abre com "já foi pago" marcado (Entradas e saídas). */
  jaPago?: boolean;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
  /** Relê os cadastros depois de criar uma categoria sem sair da janela. */
  aoRecarregarCadastros?: () => void;
}) {
  const t = TEXTOS[tipo];
  const { pode } = useOrg();
  const podeCriarCategoria = pode("plano_contas", "operar") || pode("financeiro", "operar");
  const [novaCategoria, setNovaCategoria] = useState(false);
  const tipoCat = tipo === "pagar" ? "despesa" : "receita";
  const pessoasDoTipo = useMemo(
    () => cad.pessoas.filter((p) => p.ativo && (p.tipo === "ambos" || p.tipo === (tipo === "pagar" ? "fornecedor" : "cliente"))),
    [cad.pessoas, tipo],
  );
  const categorias = cad.categorias.filter((c) => c.tipo === tipoCat && (c.ativo || c.id === editar?.categoria_id));
  const contasAtivas = cad.contas.filter((c) => c.ativo);
  const nomePessoa = (id: string | null) => cad.pessoas.find((p) => p.id === id)?.nome ?? "";

  const [f, setF] = useState<Form>(() => ({
    descricao: editar?.descricao ?? "",
    pessoa: editar ? nomePessoa(editar.pessoa_id) : "",
    categoria: editar?.categoria_id ?? "",
    centro: editar?.centro_id ?? "",
    conta_prevista: editar?.conta_prevista_id ?? "",
    documento: editar?.documento ?? "",
    emissao: editar?.emissao ?? "",
    vencimento: editar?.vencimento ?? hoje,
    valor: editar ? valorParaCampo(editar.valor) : "",
    parcelas: "1",
    observacao: editar?.observacao ?? "",
    jaPago,
    pagoData: hoje,
    pagoConta: contasAtivas.length === 1 ? contasAtivas[0].id : "",
    pagoForma: "",
  }));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const valor = numeroBr(f.valor);
  const n = Math.max(1, Math.min(120, Math.floor(Number(f.parcelas) || 1)));
  const previa = !editar && n > 1 && valor > 0 && f.vencimento ? dividirParcelas(valor, n, f.vencimento) : [];

  /** Na edição: acha o fornecedor/cliente pelo nome digitado; se não existir, cadastra. */
  async function idDaPessoa(): Promise<string | null> {
    const nome = f.pessoa.trim();
    if (!nome) return null;
    const achou = cad.pessoas.find((p) => p.nome.toLowerCase() === nome.toLowerCase());
    if (achou) return achou.id;
    const { data, error } = await supabase()
      .from("fin_pessoas")
      .insert({ org_id: cliente.org_id, cliente_id: cliente.id, nome, tipo: tipo === "pagar" ? "fornecedor" : "cliente" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function salvar() {
    setErro("");
    if (!f.descricao.trim()) return setErro("Escreva a descrição (ex.: Aluguel de novembro).");
    if (!f.categoria) return setErro(`Escolha a categoria (${tipoCat}).`);
    if (!(valor > 0)) return setErro("Informe o valor. Exemplo: 1.250,00");
    if (!f.vencimento) return setErro("Informe o vencimento.");
    if (f.jaPago && (!f.pagoData || !f.pagoConta)) return setErro("Para lançar como já pago, informe a data e a conta bancária.");
    setSalvando(true);
    try {
      if (editar) {
        const pessoa = await idDaPessoa();
        const { error } = await supabase()
          .from("fin_titulos")
          .update({
            descricao: f.descricao.trim(),
            pessoa_id: pessoa,
            categoria_id: f.categoria,
            centro_id: f.centro || null,
            conta_prevista_id: f.conta_prevista || null,
            documento: f.documento.trim() || null,
            emissao: f.emissao || null,
            vencimento: f.vencimento,
            valor,
            observacao: f.observacao.trim() || null,
          })
          .eq("id", editar.id);
        if (error) throw error;
        aoSalvar("Lançamento atualizado.");
      } else {
        await lancar({
          cliente: cliente.id,
          tipo,
          // o banco acha o fornecedor pelo nome ou cadastra, na mesma transação (se o lançamento falhar, não sobra cadastro)
          pessoa: cad.pessoas.find((p) => p.nome.toLowerCase() === f.pessoa.trim().toLowerCase())?.id ?? null,
          pessoa_nome: f.pessoa.trim() || null,
          categoria: f.categoria,
          centro: f.centro || null,
          conta_prevista: f.conta_prevista || null,
          descricao: f.descricao.trim(),
          documento: f.documento.trim() || null,
          emissao: f.emissao || null,
          vencimento: f.vencimento,
          valor,
          parcelas: n,
          observacao: f.observacao.trim() || null,
          pago: f.jaPago ? { data: f.pagoData, conta: f.pagoConta, forma: f.pagoForma || null } : null,
        });
        aoSalvar(n > 1 ? `Lançado em ${n} parcelas.` : f.jaPago ? `Lançado e marcado como ${t.feito.toLowerCase()}.` : "Lançado.");
      }
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={editar ? `Editar ${t.conta}` : `Nova ${t.conta}`}
      aoFechar={aoFechar}
      largura="5xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {/* computador: a conta à esquerda; mais informações e "já pago" à direita */}
      <ColunasFormulario>
        <ColunaFormulario>
          <label className="campo">
            <span>Descrição</span>
            <input
              value={f.descricao}
              onChange={(e) => mudar({ descricao: e.target.value })}
              placeholder={tipo === "pagar" ? "Ex.: Aluguel da loja" : "Ex.: Venda para Fulano"}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>{t.pessoa} (opcional)</span>
              <input
                list="lista-pessoas-titulo"
                value={f.pessoa}
                onChange={(e) => mudar({ pessoa: e.target.value })}
                placeholder="Digite o nome…"
              />
              <datalist id="lista-pessoas-titulo">
                {pessoasDoTipo.map((p) => (
                  <option key={p.id} value={p.nome} />
                ))}
              </datalist>
              {f.pessoa.trim() && !cad.pessoas.some((p) => p.nome.toLowerCase() === f.pessoa.trim().toLowerCase()) && (
                <small className="text-xs text-neutral-500">Novo: será cadastrado ao salvar.</small>
              )}
            </label>
            <div className="campo">
              <span>Categoria ({tipoCat})</span>
              <select value={f.categoria} onChange={(e) => mudar({ categoria: e.target.value })} aria-label={`Categoria (${tipoCat})`}>
                <option value="">{categorias.length ? "Escolha…" : `Nenhuma categoria de ${tipoCat} cadastrada`}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grupo ? `${c.grupo} › ` : ""}
                    {c.nome}
                  </option>
                ))}
              </select>
              {podeCriarCategoria && (
                <button type="button" className="btn-link self-start text-xs" onClick={() => setNovaCategoria(true)}>
                  + Nova categoria
                </button>
              )}
              {novaCategoria && (
                <NovaCategoriaRapida
                  cliente={cliente}
                  tipo={tipoCat}
                  aoFechar={() => setNovaCategoria(false)}
                  aoCriar={(id) => {
                    setNovaCategoria(false);
                    mudar({ categoria: id });
                    aoRecarregarCadastros?.();
                  }}
                />
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="campo">
              <span>{editar ? "Valor (R$)" : "Valor total (R$)"}</span>
              <input value={f.valor} onChange={(e) => mudar({ valor: e.target.value })} inputMode="decimal" placeholder="0,00" />
            </label>
            <label className="campo">
              <span>{n > 1 ? "1º vencimento" : "Vencimento"}</span>
              <input type="date" value={f.vencimento} onChange={(e) => mudar({ vencimento: e.target.value })} />
            </label>
            {!editar && (
              <label className="campo">
                <span>Parcelas</span>
                <input type="number" min={1} max={120} value={f.parcelas} onChange={(e) => mudar({ parcelas: e.target.value })} />
              </label>
            )}
          </div>
          {previa.length > 0 && (
            <div className="rounded-md bg-neutral-50 p-3 text-xs">
              <p className="mb-1 font-medium">Parcelas mensais:</p>
              <p className="tabular-nums text-neutral-700">
                {previa
                  .slice(0, 12)
                  .map((p) => `${p.parcela}ª ${fmtData(p.vencimento)} ${brl(p.valor)}`)
                  .join(" · ")}
                {previa.length > 12 && ` · … mais ${previa.length - 12}`}
              </p>
            </div>
          )}
        </ColunaFormulario>
        <ColunaFormulario>
          <details
            className="rounded-md border border-[var(--borda)] p-3"
            open={!!editar && !!(editar.documento || editar.centro_id || editar.observacao)}
          >
            <summary className="cursor-pointer text-sm text-neutral-700">
              Mais informações (documento, centro de custo, banco, observação)
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="campo">
                  <span>Nº do documento / nota</span>
                  <input value={f.documento} onChange={(e) => mudar({ documento: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Data de emissão</span>
                  <input type="date" value={f.emissao} onChange={(e) => mudar({ emissao: e.target.value })} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="campo">
                  <span>Centro de custo</span>
                  <select value={f.centro} onChange={(e) => mudar({ centro: e.target.value })}>
                    <option value="">Nenhum</option>
                    {cad.centros
                      .filter((c) => c.ativo || c.id === f.centro)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Banco previsto</span>
                  <select value={f.conta_prevista} onChange={(e) => mudar({ conta_prevista: e.target.value })}>
                    <option value="">Não definido</option>
                    {contasAtivas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="campo">
                <span>Observação</span>
                <textarea rows={2} value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />
              </label>
            </div>
          </details>
          {!editar && (
            <div className="rounded-md border border-[var(--borda)] p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={f.jaPago} onChange={(e) => mudar({ jaPago: e.target.checked })} />
                {t.pago} {n > 1 && "(todas as parcelas)"}
              </label>
              {f.jaPago && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="campo">
                    <span>Data</span>
                    <input type="date" value={f.pagoData} onChange={(e) => mudar({ pagoData: e.target.value })} />
                  </label>
                  <label className="campo">
                    <span>Conta bancária</span>
                    <select value={f.pagoConta} onChange={(e) => mudar({ pagoConta: e.target.value })}>
                      <option value="">{contasAtivas.length ? "Escolha…" : "Cadastre uma conta bancária"}</option>
                      {contasAtivas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Forma</span>
                    <select value={f.pagoForma} onChange={(e) => mudar({ pagoForma: e.target.value })}>
                      <option value="">—</option>
                      {FORMAS_PAGAMENTO.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
        </ColunaFormulario>
      </ColunasFormulario>
    </Modal>
  );
}
