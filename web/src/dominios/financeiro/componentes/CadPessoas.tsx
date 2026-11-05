// Cadastro comum › Fornecedores e clientes da MDC (/cadastros/pessoas, serve a todos os módulos de gestão):
// lista com busca e filtro, PDF/Excel, cadastro e edição.
// CPF/CNPJ é conferido (dígitos verificadores) e não se repete na mesma empresa. Nada se apaga: inativa.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { Modal } from "@/components/ui/Modal";
import { CampoCnpj, ResumoCnpj } from "@/components/ui/CampoCnpj";
import type { DadosCnpj } from "@/lib/consultaCnpj";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { lerPessoas } from "../leituras";
import { documentoValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { Pessoa, TipoPessoa } from "../tipos";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import type { PropsAba } from "./Comuns";
import { plural } from "@/lib/formato/numero";

export const TIPOS_PESSOA: Record<TipoPessoa, string> = { fornecedor: "Fornecedor", cliente: "Cliente", ambos: "Fornecedor e cliente" };
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");

type Form = Omit<Pessoa, "id" | "cliente_id"> & { id?: string };
const VAZIO: Form = {
  tipo: "fornecedor",
  nome: "",
  documento: "",
  email: "",
  telefone: "",
  cidade: "",
  uf: "",
  observacao: "",
  ativo: true,
};

/** Textos de cada tela do PN (Parceiros de negócio): só clientes, só fornecedores ou todos. */
const TELAS_PN = {
  cliente: { titulo: "Clientes", novo: "Novo cliente", vazio: "Nenhum cliente cadastrado", arquivo: "Clientes" },
  fornecedor: { titulo: "Fornecedores", novo: "Novo fornecedor", vazio: "Nenhum fornecedor cadastrado", arquivo: "Fornecedores" },
  todos: { titulo: "Fornecedores e clientes", novo: "Novo cadastro", vazio: "Nenhum fornecedor ou cliente cadastrado", arquivo: "Fornecedores-e-clientes" },
} as const;

/**
 * `fixo` (PN, 05/11/2026): a tela mostra só clientes ou só fornecedores (quem é "fornecedor e cliente" aparece nas
 * duas) e o "Novo" já vem com o tipo marcado. Sem `fixo`, a lista traz todos com o filtro de tipo.
 */
export function CadPessoas({ cliente, podeOperar, avisar, fixo }: PropsAba & { fixo?: "cliente" | "fornecedor" }) {
  const { org } = useOrg();
  const tela = TELAS_PN[fixo ?? "todos"];
  const novoVazio: Form = { ...VAZIO, tipo: fixo ?? VAZIO.tipo };
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string>(fixo ?? "");
  const [inativos, setInativos] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** O que veio da Receita na última busca da janela aberta (para conferir situação, endereço e atividade). */
  const [receita, setReceita] = useState<DadosCnpj | null>(null);
  function abrir(f: Form) {
    setReceita(null);
    setForm(f);
  }

  const consulta = useConsulta(useCallback(() => lerPessoas(cliente.id), [cliente.id]));
  /** Há cadastro deste tipo (a tela vazia diz "nenhum neste filtro" em vez de "nenhum cadastrado"). */
  const temNoTipo = !!consulta.dados?.some((p) => !fixo || p.tipo === fixo || p.tipo === "ambos");
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = soDigitos(busca);
    return (consulta.dados ?? []).filter(
      (p) =>
        (inativos || p.ativo) &&
        (!tipo || p.tipo === tipo || p.tipo === "ambos") &&
        (!q ||
          p.nome.toLowerCase().includes(q) ||
          (qd.length >= 3 && (p.documento ?? "").includes(qd)) ||
          (p.cidade ?? "").toLowerCase().includes(q)),
    );
  }, [consulta.dados, busca, tipo, inativos]);

  async function salvar() {
    if (!form) return;
    const doc = soDigitos(form.documento ?? "");
    if (!form.nome.trim()) return avisar("Informe o nome ou a razão social.", "erro");
    if (doc && !documentoValido(doc)) return avisar("O CPF/CNPJ não confere. Verifique os números digitados.", "erro");
    setSalvando(true);
    const dados = {
      tipo: form.tipo,
      nome: form.nome.trim(),
      documento: doc || null,
      email: form.email?.trim() || null,
      telefone: form.telefone?.trim() || null,
      cidade: form.cidade?.trim() || null,
      uf: form.uf || null,
      observacao: form.observacao?.trim() || null,
      ativo: form.ativo,
    };
    const { error } = form.id
      ? await supabase().from("fin_pessoas").update(dados).eq("id", form.id)
      : await supabase()
          .from("fin_pessoas")
          .insert({ ...dados, org_id: cliente.org_id, cliente_id: cliente.id });
    setSalvando(false);
    if (error) return avisar(traduzirErro(error), "erro");
    avisar(form.id ? "Cadastro atualizado." : "Cadastrado.");
    setForm(null);
    consulta.recarregar();
  }

  const filtrosAtivos: FiltroAtivo[] = [
    !fixo && tipo && { id: "tipo", rotulo: tipo === "fornecedor" ? "Só fornecedores" : "Só clientes", aoTirar: () => setTipo("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
    inativos && { id: "inativos", rotulo: "Com inativos", aoTirar: () => setInativos(false) },
  ].filter((f): f is FiltroAtivo => !!f);
  const limparFiltros = () => {
    setTipo(fixo ?? "");
    setBusca("");
    setInativos(false);
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={tela.titulo}
        descricao={
          fixo === "cliente"
            ? "Quem compra da MDC (contratos a receber, contas a receber). Um cadastro só para a MDC toda."
            : fixo === "fornecedor"
              ? "De quem a MDC compra (contas a pagar, contratos a pagar). Um cadastro só para a MDC toda."
              : "Um cadastro só para a MDC toda: vale no Financeiro e nos Contratos."
        }
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={avisar}
              montar={() => ({
                titulo: tela.titulo,
                subtitulo: `${nomeCliente(cliente)} · ${plural(lista.length, "cadastro")}`,
                arquivo: nomeArquivo(tela.arquivo, nomeCliente(cliente), hojeISO(org.fuso)),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Nome", valor: (p) => p.nome, peso: 3, largura: 40 },
                  { titulo: "Tipo", valor: (p) => TIPOS_PESSOA[p.tipo], peso: 1.4, largura: 20 },
                  { titulo: "CPF/CNPJ", valor: (p) => formatarDocumento(p.documento), peso: 1.6, largura: 20 },
                  { titulo: "Telefone", valor: (p) => p.telefone ?? "", peso: 1.3 },
                  { titulo: "E-mail", valor: (p) => p.email ?? "", peso: 2, largura: 30 },
                  { titulo: "Cidade/UF", valor: (p) => [p.cidade, p.uf].filter(Boolean).join("/"), peso: 1.4, largura: 20 },
                  { titulo: "Situação", valor: (p) => (p.ativo ? "Ativo" : "Inativo"), peso: 0.8, largura: 10 },
                ],
              })}
            />
            {podeOperar && (
              <button className="btn-primario" onClick={() => abrir({ ...novoVazio })}>
                <Icone nome="mais" className="h-4 w-4" />
                {tela.novo}
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        {!fixo && (
          <label className="campo">
            <span>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="fornecedor">Fornecedores</option>
              <option value="cliente">Clientes</option>
            </select>
          </label>
        )}
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF/CNPJ ou cidade" />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </CartaoFiltros>

      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={5} />
      ) : !lista.length ? (
        <EstadoVazio
          icone={consulta.dados?.length ? "filtro" : "pessoas"}
          titulo={temNoTipo ? "Nenhum cadastro neste filtro" : tela.vazio}
          acao={
            temNoTipo ? (
              <button className="btn" onClick={limparFiltros}>
                Limpar filtros
              </button>
            ) : (
              podeOperar && (
                <button className="btn-primario" onClick={() => abrir({ ...novoVazio })}>
                  <Icone nome="mais" className="h-4 w-4" />
                  Cadastrar o primeiro
                </button>
              )
            )
          }
        >
          {temNoTipo
            ? "Troque o tipo ou a busca."
            : "Cadastre aqui ou direto ao lançar uma conta: o fornecedor digitado na hora entra sozinho nesta lista."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo={tela.titulo}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>CPF/CNPJ</th>
              <th>Contato</th>
              <th>Cidade</th>
              {podeOperar && (
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className={p.ativo ? "" : "linha-apagada"}>
                <td className="celula-titulo min-w-48 font-medium">{p.nome}</td>
                <td data-rotulo="Tipo">
                  <span className="flex flex-wrap justify-end gap-1 sm:justify-start">
                    <Chip tom={p.tipo === "fornecedor" ? "ambar" : p.tipo === "cliente" ? "azul" : "violeta"}>{TIPOS_PESSOA[p.tipo]}</Chip>
                    {!p.ativo && <Chip tom="neutro">Inativo</Chip>}
                  </span>
                </td>
                <td data-rotulo="CPF/CNPJ" className="num whitespace-nowrap">
                  {formatarDocumento(p.documento) || "—"}
                </td>
                <td data-rotulo="Contato" className="text-xs">
                  <span>
                    {p.telefone}
                    {p.email && <span className="block text-[var(--texto-suave)]">{p.email}</span>}
                  </span>
                </td>
                <td data-rotulo="Cidade" className="whitespace-nowrap">
                  {[p.cidade, p.uf].filter(Boolean).join("/") || "—"}
                </td>
                {podeOperar && (
                  <td className="celula-acoes text-right">
                    <button className="btn !min-h-8 !px-3" onClick={() => abrir({ ...p })}>
                      <Icone nome="editar" className="h-4 w-4" />
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}

      {form && (
        <Modal
          titulo={form.id ? "Editar cadastro" : "Novo fornecedor ou cliente"}
          aoFechar={() => setForm(null)}
          largura="4xl"
          rodape={
            <>
              <button className="btn" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="btn-primario" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          {/* computador: identificação e contato à esquerda; endereço e observação à direita */}
          <ColunasFormulario>
            <ColunaFormulario>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="campo sm:col-span-2">
                  <span>Nome ou razão social</span>
                  <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </label>
                <label className="campo">
                  <span>É um</span>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPessoa })}>
                    {Object.entries(TIPOS_PESSOA).map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <CampoCnpj
                rotulo="CPF ou CNPJ (opcional)"
                valor={form.documento ?? ""}
                aoMudar={(v) => setForm((f) => (f ? { ...f, documento: v } : f))}
                aoCarregar={(d) => {
                  setReceita(d);
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          nome: d.razaoSocial || f.nome,
                          cidade: d.municipio ?? f.cidade,
                          uf: d.uf ?? f.uf,
                          telefone: f.telefone?.trim() ? f.telefone : (d.telefone ?? f.telefone),
                          email: f.email?.trim() ? f.email : (d.email?.toLowerCase() ?? f.email),
                        }
                      : f,
                  );
                }}
                placeholder="CPF ou CNPJ"
                ajuda="Com CNPJ, clique em Buscar dados: o HUB traz da Receita o nome, a cidade, a UF, o telefone e o e-mail."
              />
              {receita && <ResumoCnpj d={receita} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="campo">
                  <span>Telefone</span>
                  <input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} inputMode="tel" />
                </label>
                <label className="campo">
                  <span>E-mail</span>
                  <input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
              </div>
            </ColunaFormulario>
            <ColunaFormulario>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="campo sm:col-span-2">
                  <span>Cidade</span>
                  <input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                </label>
                <label className="campo">
                  <span>UF</span>
                  <select value={form.uf ?? ""} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
                    <option value="">—</option>
                    {UFS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="campo">
                <span>Observação</span>
                <textarea rows={2} value={form.observacao ?? ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </label>
              {form.id && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                  Ativo (desmarque para tirar das listas; o histórico continua guardado)
                </label>
              )}
            </ColunaFormulario>
          </ColunasFormulario>
        </Modal>
      )}
    </div>
  );
}
