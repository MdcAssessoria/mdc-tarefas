"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { fmtData } from "@/lib/datas";
import { PAPEIS, PRIORIDADES, REGIMES } from "@/lib/types";
import type { Cliente, Modelo, Papel, Prioridade } from "@/lib/types";

type Aba = "organizacao" | "equipe" | "setores" | "clientes" | "obrigacoes" | "feriados";

export default function PaginaConfig() {
  return (
    <AppShell>
      <Config />
    </AppShell>
  );
}

function Config() {
  const { papel } = useOrg();
  const abas: { id: Aba; nome: string; admin?: boolean }[] = [
    { id: "obrigacoes", nome: "Obrigações recorrentes" },
    { id: "clientes", nome: "Clientes" },
    { id: "equipe", nome: "Equipe", admin: true },
    { id: "setores", nome: "Setores" },
    { id: "feriados", nome: "Feriados" },
    { id: "organizacao", nome: "Organização e painel", admin: true },
  ];
  const [aba, setAba] = useState<Aba>("obrigacoes");

  if (papel !== "admin" && papel !== "gestor")
    return <p className="text-sm">Apenas gestores e administradores acessam as configurações.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--marca)]">Configurações</h1>
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--borda)]">
        {abas
          .filter((a) => !a.admin || papel === "admin")
          .map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                aba === a.id
                  ? "border-[var(--destaque-escuro)] font-medium text-[var(--marca)]"
                  : "border-transparent text-[var(--texto-suave)]"
              }`}
            >
              {a.nome}
            </button>
          ))}
      </div>
      {aba === "organizacao" && <AbaOrganizacao />}
      {aba === "equipe" && <AbaEquipe />}
      {aba === "setores" && <AbaSetores />}
      {aba === "clientes" && <AbaClientes />}
      {aba === "obrigacoes" && <AbaObrigacoes />}
      {aba === "feriados" && <AbaFeriados />}
    </div>
  );
}

function useMensagem() {
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const mostrar = (texto: string, erro = false) => {
    setMsg({ erro, texto });
    setTimeout(() => setMsg(null), erro ? 8000 : 3500);
  };
  const el = msg && (
    <div
      className={`cartao p-3 text-sm ${
        msg.erro ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {msg.texto}
    </div>
  );
  return { mostrar, el };
}

/* ---------------------------------------------------------------- Organização */
function AbaOrganizacao() {
  const { org, recarregar } = useOrg();
  const [f, setF] = useState(org);
  const { mostrar, el } = useMensagem();
  const link = typeof window !== "undefined" ? `${window.location.origin}/tv?org=${org.slug}` : "";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("organizacoes")
      .update({
        nome: f.nome,
        cnpj: f.cnpj,
        logo_url: f.logo_url || null,
        cor_primaria: f.cor_primaria,
        cor_destaque: f.cor_destaque,
        fuso: f.fuso,
      })
      .eq("id", org.id);
    if (error) return mostrar(error.message, true);
    mostrar("Dados salvos.");
    recarregar();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={salvar} className="cartao space-y-4 p-5">
        <h2 className="font-semibold text-[var(--marca)]">Identidade</h2>
        <label className="campo">
          <span>Nome</span>
          <input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </label>
        <label className="campo">
          <span>CNPJ</span>
          <input value={f.cnpj ?? ""} onChange={(e) => setF({ ...f, cnpj: e.target.value })} />
        </label>
        <label className="campo">
          <span>URL do logo (versão clara, para fundo escuro)</span>
          <input value={f.logo_url ?? ""} onChange={(e) => setF({ ...f, logo_url: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="campo">
            <span>Cor principal</span>
            <input type="color" value={f.cor_primaria} onChange={(e) => setF({ ...f, cor_primaria: e.target.value })} />
          </label>
          <label className="campo">
            <span>Cor de destaque</span>
            <input type="color" value={f.cor_destaque} onChange={(e) => setF({ ...f, cor_destaque: e.target.value })} />
          </label>
        </div>
        <label className="campo">
          <span>Fuso horário</span>
          <select value={f.fuso} onChange={(e) => setF({ ...f, fuso: e.target.value })}>
            {["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Belem", "America/Fortaleza", "America/Recife", "America/Rio_Branco", "America/Noronha"].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <button className="btn-primario">Salvar</button>
        {el}
      </form>
      <div className="cartao space-y-3 p-5 text-sm">
        <h2 className="font-semibold text-[var(--marca)]">Painel da TV</h2>
        <p>Abra este endereço no navegador da TV e entre com o usuário de papel “Painel TV”:</p>
        <code className="block break-all rounded-md bg-[var(--fundo)] p-3">{link}</code>
        <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => mostrar("Link copiado."))}>
          Copiar link
        </button>
        <ol className="list-decimal space-y-1 pl-5 text-[var(--texto-suave)]">
          <li>Na aba Equipe, crie um membro com papel “Painel TV” (ex.: tv@suaempresa.com).</li>
          <li>Na TV (Fully Kiosk Browser), defina o link acima como página inicial.</li>
          <li>Faça login uma vez; a sessão se renova sozinha e o painel atualiza em tempo real.</li>
        </ol>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Equipe */
function AbaEquipe() {
  const { org, membros, setores, recarregar, eu } = useOrg();
  const [novo, setNovo] = useState({ email: "", nome: "", papel: "analista" as Papel, setor: "" });
  const { mostrar, el } = useMensagem();

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().rpc("adicionar_membro", {
      p_org: org.id,
      p_email: novo.email,
      p_nome: novo.nome,
      p_papel: novo.papel,
      p_setor: novo.setor || null,
    });
    if (error) return mostrar(error.message, true);
    setNovo({ email: "", nome: "", papel: "analista", setor: "" });
    mostrar("Membro adicionado.");
    recarregar();
  }

  async function alterar(userId: string, campos: Record<string, unknown>) {
    const { error } = await supabase().from("membros").update(campos).eq("org_id", org.id).eq("user_id", userId);
    if (error) return mostrar(error.message, true);
    recarregar();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={adicionar} className="cartao grid gap-3 p-4 md:grid-cols-[2fr_2fr_1.3fr_1.3fr_auto] md:items-end">
        <label className="campo">
          <span>E-mail (a pessoa cria a conta antes, na tela de login)</span>
          <input type="email" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
        </label>
        <label className="campo">
          <span>Nome</span>
          <input required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        </label>
        <label className="campo">
          <span>Papel</span>
          <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as Papel })}>
            {PAPEIS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Setor</span>
          <select value={novo.setor} onChange={(e) => setNovo({ ...novo, setor: e.target.value })}>
            <option value="">—</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>
      {el}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Setor</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.user_id} className={m.ativo ? "" : "opacity-50"}>
                <td>
                  <input
                    className="entrada w-full min-w-40"
                    defaultValue={m.nome}
                    onBlur={(e) => e.target.value !== m.nome && alterar(m.user_id, { nome: e.target.value })}
                  />
                </td>
                <td className="text-[var(--texto-suave)]">{m.email}</td>
                <td>
                  <select
                    className="entrada"
                    value={m.papel}
                    onChange={(e) => alterar(m.user_id, { papel: e.target.value })}
                    disabled={m.user_id === eu.user_id}
                  >
                    {PAPEIS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="entrada"
                    value={m.setor_id ?? ""}
                    onChange={(e) => alterar(m.user_id, { setor_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--marca)]"
                    checked={m.ativo}
                    disabled={m.user_id === eu.user_id}
                    onChange={(e) => alterar(m.user_id, { ativo: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Setores */
function AbaSetores() {
  const { org, setores, recarregar } = useOrg();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#7FB3A0");
  const { mostrar, el } = useMensagem();

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("setores")
      .insert({ org_id: org.id, nome, cor, ordem: setores.length + 1 });
    if (error) return mostrar(error.message, true);
    setNome("");
    recarregar();
  }
  async function alterar(id: string, campos: Record<string, unknown>) {
    const { error } = await supabase().from("setores").update(campos).eq("id", id);
    if (error) return mostrar(error.message, true);
    recarregar();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={adicionar} className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo flex-1">
          <span>Novo setor</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="campo">
          <span>Cor</span>
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>
      {el}
      <div className="cartao">
        <table className="tabela">
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Nome</th>
              <th>Cor</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {setores.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    type="number"
                    className="entrada w-20"
                    defaultValue={s.ordem}
                    onBlur={(e) => Number(e.target.value) !== s.ordem && alterar(s.id, { ordem: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="entrada w-full"
                    defaultValue={s.nome}
                    onBlur={(e) => e.target.value !== s.nome && alterar(s.id, { nome: e.target.value })}
                  />
                </td>
                <td>
                  <input type="color" defaultValue={s.cor} onBlur={(e) => e.target.value !== s.cor && alterar(s.id, { cor: e.target.value })} />
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--marca)]"
                    checked={s.ativo}
                    onChange={(e) => alterar(s.id, { ativo: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Clientes */
interface Resp {
  cliente_id: string;
  setor_id: string;
  user_id: string;
}

function AbaClientes() {
  const { org, clientes, setores, membros, recarregar } = useOrg();
  const [busca, setBusca] = useState("");
  const [resps, setResps] = useState<Resp[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState({ razao_social: "", nome_fantasia: "", cnpj: "", regime: "simples" });
  const [csv, setCsv] = useState<string | null>(null);
  const { mostrar, el } = useMensagem();
  const pessoas = membros.filter((m) => m.ativo && m.papel !== "tv");

  const carregarResps = async () => {
    const { data } = await supabase().from("cliente_responsaveis").select("cliente_id,setor_id,user_id").eq("org_id", org.id);
    setResps((data as Resp[]) ?? []);
  };
  useEffect(() => {
    carregarResps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => !q || `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj ?? ""}`.toLowerCase().includes(q));
  }, [clientes, busca]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("clientes")
      .insert({ ...novo, org_id: org.id, nome_fantasia: novo.nome_fantasia || null, cnpj: novo.cnpj || null });
    if (error) return mostrar(error.message.includes("clientes_org_cnpj_uk") ? "CNPJ já cadastrado." : error.message, true);
    setNovo({ razao_social: "", nome_fantasia: "", cnpj: "", regime: novo.regime });
    recarregar();
  }

  async function alterar(id: string, campos: Partial<Cliente>) {
    const { error } = await supabase().from("clientes").update(campos).eq("id", id);
    if (error) return mostrar(error.message, true);
    recarregar();
  }

  async function definirResp(clienteId: string, setorId: string, userId: string) {
    const sb = supabase();
    const { error } = userId
      ? await sb
          .from("cliente_responsaveis")
          .upsert({ org_id: org.id, cliente_id: clienteId, setor_id: setorId, user_id: userId })
      : await sb.from("cliente_responsaveis").delete().eq("cliente_id", clienteId).eq("setor_id", setorId);
    if (error) return mostrar(error.message, true);
    carregarResps();
  }

  async function importar() {
    if (!csv) return;
    const regimes = new Map(REGIMES.flatMap((r) => [[r.id, r.id], [r.nome.toLowerCase(), r.id]]));
    const linhas = csv
      .split(/\r?\n/)
      .map((l) => l.split(/[;\t]/).map((x) => x.trim()))
      .filter((p) => p[0] && !/raz[aã]o/i.test(p[0]));
    const registros = linhas.map(([razao, cnpj, regime, fantasia]) => ({
      org_id: org.id,
      razao_social: razao,
      cnpj: cnpj || null,
      regime: regimes.get((regime ?? "").toLowerCase()) ?? null,
      nome_fantasia: fantasia || null,
    }));
    if (!registros.length) return mostrar("Nenhuma linha válida encontrada.", true);
    const { error } = await supabase().from("clientes").insert(registros);
    if (error) return mostrar(error.message, true);
    mostrar(`${registros.length} clientes importados.`);
    setCsv(null);
    recarregar();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={adicionar} className="cartao grid gap-3 p-4 md:grid-cols-[2fr_1.5fr_1.2fr_1.2fr_auto] md:items-end">
        <label className="campo">
          <span>Razão social</span>
          <input required value={novo.razao_social} onChange={(e) => setNovo({ ...novo, razao_social: e.target.value })} />
        </label>
        <label className="campo">
          <span>Nome curto (aparece na TV)</span>
          <input value={novo.nome_fantasia} onChange={(e) => setNovo({ ...novo, nome_fantasia: e.target.value })} />
        </label>
        <label className="campo">
          <span>CNPJ/CPF</span>
          <input value={novo.cnpj} onChange={(e) => setNovo({ ...novo, cnpj: e.target.value })} />
        </label>
        <label className="campo">
          <span>Regime</span>
          <select value={novo.regime} onChange={(e) => setNovo({ ...novo, regime: e.target.value })}>
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <input className="entrada flex-1" placeholder="Buscar cliente ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn" onClick={() => setCsv(csv === null ? "" : null)}>
          Importar lista
        </button>
      </div>
      {csv !== null && (
        <div className="cartao space-y-2 p-4">
          <p className="text-sm text-[var(--texto-suave)]">
            Cole uma linha por cliente, separada por ponto e vírgula ou tabulação (dá para copiar direto do Excel):{" "}
            <code>Razão social; CNPJ; regime; nome curto</code>. Regime: simples, presumido, real, mei…
          </p>
          <textarea className="entrada h-40 w-full font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
          <button className="btn-primario" onClick={importar}>
            Importar
          </button>
        </div>
      )}
      {el}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>CNPJ</th>
              <th>Regime</th>
              <th>Responsáveis</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const rs = resps.filter((r) => r.cliente_id === c.id);
              return (
                <Fragment key={c.id}>
                  <tr className={c.ativo ? "" : "opacity-50"}>
                    <td>
                      <div className="font-medium">{c.razao_social}</div>
                      {c.nome_fantasia && <div className="text-xs text-[var(--texto-suave)]">{c.nome_fantasia}</div>}
                    </td>
                    <td className="whitespace-nowrap text-[var(--texto-suave)]">{c.cnpj}</td>
                    <td>
                      <select className="entrada" value={c.regime ?? ""} onChange={(e) => alterar(c.id, { regime: e.target.value || null })}>
                        <option value="">—</option>
                        {REGIMES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="btn-link" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
                        {rs.length ? `${rs.length} definido(s)` : "Definir"}
                      </button>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--marca)]"
                        checked={c.ativo}
                        onChange={(e) => alterar(c.id, { ativo: e.target.checked })}
                      />
                    </td>
                  </tr>
                  {aberto === c.id && (
                    <tr>
                      <td colSpan={5} className="bg-[var(--fundo)]">
                        <div className="grid gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
                          {setores
                            .filter((s) => s.ativo)
                            .map((s) => (
                              <label key={s.id} className="campo">
                                <span>{s.nome}</span>
                                <select
                                  value={rs.find((r) => r.setor_id === s.id)?.user_id ?? ""}
                                  onChange={(e) => definirResp(c.id, s.id, e.target.value)}
                                >
                                  <option value="">—</option>
                                  {pessoas.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                      {m.nome}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                        </div>
                        <p className="pb-2 text-xs text-[var(--texto-suave)]">
                          As tarefas recorrentes deste cliente nascem atribuídas a essas pessoas.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-6 text-center text-sm text-[var(--texto-suave)]">Nenhum cliente.</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Obrigações */
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const MODELO_VAZIO: Omit<Modelo, "id" | "org_id"> = {
  titulo: "",
  descricao: null,
  setor_id: null,
  prioridade: "media",
  por_cliente: true,
  regimes: null,
  meses: null,
  dia_vencimento: 20,
  meses_apos_competencia: 1,
  ajuste: "antecipa",
  ativo: true,
};

function AbaObrigacoes() {
  const { org, setores, setorPorId } = useOrg();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [editando, setEditando] = useState<(Partial<Modelo> & typeof MODELO_VAZIO) | null>(null);
  const [comp, setComp] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const { mostrar, el } = useMensagem();

  const carregar = async () => {
    const { data } = await supabase().from("modelos_recorrentes").select("*").eq("org_id", org.id).order("titulo");
    setModelos((data as Modelo[]) ?? []);
  };
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const { id, ...dados } = editando;
    const sb = supabase();
    const { error } = id
      ? await sb.from("modelos_recorrentes").update(dados).eq("id", id)
      : await sb.from("modelos_recorrentes").insert({ ...dados, org_id: org.id });
    if (error) return mostrar(error.message, true);
    setEditando(null);
    carregar();
  }

  async function gerar() {
    const { data, error } = await supabase().rpc("gerar_competencia", { p_org: org.id, p_competencia: comp + "-01" });
    if (error) return mostrar(error.message, true);
    mostrar(data ? `${data} tarefas criadas para ${comp.split("-").reverse().join("/")}.` : "Nenhuma tarefa nova: a competência já estava gerada.");
  }

  const descreverMeses = (m: number[] | null) =>
    !m ? "Mensal" : m.length === 4 && [3, 6, 9, 12].every((x) => m.includes(x)) ? "Trimestral"
          : m.length === 1
            ? `Anual (comp. ${MESES[m[0] - 1].toLowerCase()})`
            : m.map((x) => MESES[x - 1]).join(", ");

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="mr-auto max-w-xl text-sm text-[var(--texto-suave)]">
          As tarefas são criadas automaticamente todo dia às 06:05 para a competência anterior, uma por cliente ativo
          do regime indicado. Para antecipar ou refazer uma competência, gere manualmente:
        </div>
        <label className="campo">
          <span>Competência</span>
          <input type="month" value={comp} onChange={(e) => setComp(e.target.value)} className="entrada" />
        </label>
        <button className="btn-primario" onClick={gerar}>
          Gerar tarefas
        </button>
        <button className="btn" onClick={() => setEditando({ ...MODELO_VAZIO })}>
          + Nova obrigação
        </button>
      </div>
      {el}

      {editando && (
        <form onSubmit={salvar} className="cartao grid gap-4 p-5 md:grid-cols-4">
          <label className="campo md:col-span-2">
            <span>Título</span>
            <input required value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
          </label>
          <label className="campo">
            <span>Setor</span>
            <select value={editando.setor_id ?? ""} onChange={(e) => setEditando({ ...editando, setor_id: e.target.value || null })}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Prioridade</span>
            <select value={editando.prioridade} onChange={(e) => setEditando({ ...editando, prioridade: e.target.value as Prioridade })}>
              {PRIORIDADES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Dia do prazo</span>
            <input
              type="number"
              min={1}
              max={31}
              required
              value={editando.dia_vencimento}
              onChange={(e) => setEditando({ ...editando, dia_vencimento: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            <span>Meses após a competência</span>
            <input
              type="number"
              min={0}
              max={12}
              required
              value={editando.meses_apos_competencia}
              onChange={(e) => setEditando({ ...editando, meses_apos_competencia: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            <span>Fim de semana/feriado</span>
            <select value={editando.ajuste} onChange={(e) => setEditando({ ...editando, ajuste: e.target.value as Modelo["ajuste"] })}>
              <option value="antecipa">Antecipa</option>
              <option value="posterga">Posterga</option>
              <option value="nenhum">Mantém</option>
            </select>
          </label>
          <label className="campo">
            <span>Gera</span>
            <select
              value={editando.por_cliente ? "1" : "0"}
              onChange={(e) => setEditando({ ...editando, por_cliente: e.target.value === "1" })}
            >
              <option value="1">Uma por cliente</option>
              <option value="0">Uma só (interna)</option>
            </select>
          </label>
          <fieldset className="campo md:col-span-2">
            <span>Regimes (nenhum marcado = todos)</span>
            <div className="flex flex-wrap gap-3 pt-1 text-sm text-[var(--texto)]">
              {REGIMES.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-[var(--marca)]"
                    checked={editando.regimes?.includes(r.id) ?? false}
                    onChange={(e) => {
                      const atual = new Set(editando.regimes ?? []);
                      if (e.target.checked) atual.add(r.id);
                      else atual.delete(r.id);
                      setEditando({ ...editando, regimes: atual.size ? [...atual] : null });
                    }}
                  />
                  {r.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="campo md:col-span-2">
            <span>Meses de competência (nenhum marcado = todo mês)</span>
            <div className="flex flex-wrap gap-2 pt-1 text-sm text-[var(--texto)]">
              {MESES.map((m, i) => (
                <label key={m} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="accent-[var(--marca)]"
                    checked={editando.meses?.includes(i + 1) ?? false}
                    onChange={(e) => {
                      const atual = new Set(editando.meses ?? []);
                      if (e.target.checked) atual.add(i + 1);
                      else atual.delete(i + 1);
                      setEditando({ ...editando, meses: atual.size ? [...atual].sort((a, b) => a - b) : null });
                    }}
                  />
                  {m}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="campo md:col-span-4">
            <span>Descrição / checklist</span>
            <textarea rows={2} value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value || null })} />
          </label>
          <div className="flex gap-2 md:col-span-4">
            <button className="btn-primario">Salvar</button>
            <button type="button" className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Obrigação</th>
              <th>Setor</th>
              <th>Periodicidade</th>
              <th>Prazo</th>
              <th>Regimes</th>
              <th>Ativa</th>
            </tr>
          </thead>
          <tbody>
            {modelos.map((m) => (
              <tr key={m.id} className={`cursor-pointer hover:bg-[var(--fundo)] ${m.ativo ? "" : "opacity-50"}`} onClick={() => setEditando(m)}>
                <td className="font-medium">{m.titulo}</td>
                <td>{setorPorId(m.setor_id)?.nome ?? "—"}</td>
                <td>{descreverMeses(m.meses)}</td>
                <td className="whitespace-nowrap">
                  Dia {m.dia_vencimento}
                  {m.meses_apos_competencia === 0 ? " do mês" : m.meses_apos_competencia === 1 ? " do mês seguinte" : ` (+${m.meses_apos_competencia} meses)`}
                </td>
                <td className="text-[var(--texto-suave)]">
                  {m.regimes ? m.regimes.map((r) => REGIMES.find((x) => x.id === r)?.nome ?? r).join(", ") : "Todos"}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--marca)]"
                    checked={m.ativo}
                    onChange={async (e) => {
                      await supabase().from("modelos_recorrentes").update({ ativo: e.target.checked }).eq("id", m.id);
                      carregar();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {modelos.length === 0 && <p className="p-6 text-center text-sm text-[var(--texto-suave)]">Nenhuma obrigação cadastrada.</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Feriados */
interface Feriado {
  id: string;
  org_id: string | null;
  data: string;
  descricao: string;
}

function AbaFeriados() {
  const { org } = useOrg();
  const [lista, setLista] = useState<Feriado[]>([]);
  const [novo, setNovo] = useState({ data: "", descricao: "" });
  const { mostrar, el } = useMensagem();

  const carregar = async () => {
    const { data } = await supabase()
      .from("feriados")
      .select("*")
      .gte("data", new Date().getFullYear() + "-01-01")
      .order("data");
    setLista(((data as Feriado[]) ?? []).filter((f) => !f.org_id || f.org_id === org.id));
  };
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("feriados").insert({ ...novo, org_id: org.id });
    if (error) return mostrar(error.message, true);
    setNovo({ data: "", descricao: "" });
    carregar();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={adicionar} className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Data</span>
          <input type="date" required value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
        </label>
        <label className="campo flex-1">
          <span>Feriado municipal/estadual</span>
          <input required value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>
      {el}
      <div className="cartao">
        <table className="tabela">
          <tbody>
            {lista.map((f) => (
              <tr key={f.id}>
                <td className="w-28">{fmtData(f.data)}</td>
                <td>{f.descricao}</td>
                <td className="text-right text-xs text-[var(--texto-suave)]">
                  {f.org_id ? (
                    <button
                      className="btn-link"
                      onClick={async () => {
                        await supabase().from("feriados").delete().eq("id", f.id);
                        carregar();
                      }}
                    >
                      remover
                    </button>
                  ) : (
                    "nacional"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
