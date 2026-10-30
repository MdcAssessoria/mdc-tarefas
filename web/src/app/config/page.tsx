"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { fmtData } from "@/lib/datas";
import { PAPEIS, PRIORIDADES, REGIMES, SEGMENTOS, nomeSegmento } from "@/lib/types";
import { Etiquetas } from "@/components/Etiquetas";
import type { Cliente, Modelo, Papel, Prioridade } from "@/lib/types";
import { traduzirErro } from "@/lib/erros";
import { caminho, enderecoHub } from "@/lib/caminho";

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
  const link = typeof window !== "undefined" ? enderecoHub(`/tv?org=${org.slug}`) : "";

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
    if (error) return mostrar(traduzirErro(error), true);
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
  const { mostrar, el } = useMensagem();

  async function alterar(userId: string, campos: Record<string, unknown>) {
    const { error } = await supabase().from("membros").update(campos).eq("org_id", org.id).eq("user_id", userId);
    if (error) return mostrar(traduzirErro(error), true);
    recarregar();
  }

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <p className="text-neutral-600">
          Novas pessoas são cadastradas em <b>Pessoas e acessos</b>: você escolhe o perfil e a pessoa recebe o convite por e-mail para criar a
          senha. Aqui você ajusta nome, papel nas tarefas, setor e desativa quem saiu.
        </p>
        <Link href="/hub/acessos" className="btn-primario">
          Cadastrar pessoa
        </Link>
      </div>
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
    if (error) return mostrar(traduzirErro(error), true);
    setNome("");
    recarregar();
  }
  async function alterar(id: string, campos: Record<string, unknown>) {
    const { error } = await supabase().from("setores").update(campos).eq("id", id);
    if (error) return mostrar(traduzirErro(error), true);
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
  const [situacao, setSituacao] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [inativando, setInativando] = useState<{ id: string; data: string; motivo: string; outro: string } | null>(null);
  const { mostrar, el } = useMensagem();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<{ segmento: string; grupos: string[] }>({ segmento: "", grupos: [] });
  const [filtroSeg, setFiltroSeg] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const todosGrupos = useMemo(() => [...new Set(clientes.flatMap((c) => c.grupos ?? []))].sort((a, b) => a.localeCompare(b)), [clientes]);
  const pessoas = membros.filter((m) => m.ativo && m.papel !== "tv");
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  async function confirmarInativacao() {
    if (!inativando) return;
    if (!inativando.data) return mostrar("Informe a data em que o cliente passou a ser inativo.", true);
    const motivo = inativando.motivo === "Outro" ? inativando.outro : inativando.motivo;
    const { data, error } = await supabase().rpc("inativar_cliente", {
      p_cliente: inativando.id, p_data: inativando.data, p_motivo: motivo || null,
    });
    if (error) return mostrar(traduzirErro(error), true);
    setInativando(null);
    mostrar(`Cliente inativado desde ${fmtData(inativando.data)}. ${data?.tarefas_canceladas ?? 0} tarefa(s) de competência posterior à saída cancelada(s).`);
    recarregar();
  }

  async function reativar(id: string) {
    const { data, error } = await supabase().rpc("reativar_cliente", { p_cliente: id });
    if (error) return mostrar(traduzirErro(error), true);
    mostrar(`Cliente reativado. ${data?.tarefas_restauradas ?? 0} tarefa(s) cancelada(s) pela inativação voltaram para "a fazer".`);
    recarregar();
  }

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
    return clientes
      .filter((c) => situacao === "todos" || (situacao === "ativos" ? c.ativo : !c.ativo))
      .filter((c) => !filtroSeg || (filtroSeg === "_sem" ? !c.segmento : c.segmento === filtroSeg))
      .filter((c) => !filtroGrupo || (c.grupos ?? []).includes(filtroGrupo))
      .filter((c) => !q || `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj ?? ""} ${c.codigo_dominio ?? ""} ${c.cidade ?? ""} ${c.uf ?? ""}`.toLowerCase().includes(q));
  }, [clientes, busca, situacao, filtroSeg, filtroGrupo]);
  const nAtivos = clientes.filter((c) => c.ativo).length;

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("clientes")
      .insert({ ...novo, org_id: org.id, nome_fantasia: novo.nome_fantasia || null, cnpj: novo.cnpj || null });
    if (error) return mostrar(error.message.includes("clientes_org_cnpj_uk") ? "CNPJ já cadastrado." : traduzirErro(error), true);
    setNovo({ razao_social: "", nome_fantasia: "", cnpj: "", regime: novo.regime });
    recarregar();
  }

  async function alterar(id: string, campos: Partial<Cliente>) {
    const { error } = await supabase().from("clientes").update(campos).eq("id", id);
    if (error) return mostrar(traduzirErro(error), true);
    recarregar();
  }

  async function aplicarLote() {
    const ids = [...sel];
    if (!ids.length) return;
    if (!lote.segmento && !lote.grupos.length) return mostrar("Escolha um segmento ou um grupo para aplicar.", true);
    const sb = supabase();
    for (const id of ids) {
      const c = clientes.find((x) => x.id === id);
      const campos: Partial<Cliente> = {};
      if (lote.segmento) campos.segmento = lote.segmento === "_limpar" ? null : lote.segmento;
      if (lote.grupos.length) campos.grupos = [...new Set([...(c?.grupos ?? []), ...lote.grupos])];
      const { error } = await sb.from("clientes").update(campos).eq("id", id);
      if (error) return mostrar(traduzirErro(error), true);
    }
    mostrar(`${ids.length} cliente(s) atualizado(s).`);
    setSel(new Set());
    setLote({ segmento: "", grupos: [] });
    recarregar();
  }

  async function definirResp(clienteId: string, setorId: string, userId: string) {
    const sb = supabase();
    const { error } = userId
      ? await sb
          .from("cliente_responsaveis")
          .upsert({ org_id: org.id, cliente_id: clienteId, setor_id: setorId, user_id: userId })
      : await sb.from("cliente_responsaveis").delete().eq("cliente_id", clienteId).eq("setor_id", setorId);
    if (error) return mostrar(traduzirErro(error), true);
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
    if (error) return mostrar(traduzirErro(error), true);
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
        <div className="flex overflow-hidden rounded-md border border-[var(--borda)] text-sm">
          {([
            ["ativos", `Ativos (${nAtivos})`],
            ["inativos", `Inativos (${clientes.length - nAtivos})`],
            ["todos", `Todos (${clientes.length})`],
          ] as const).map(([id, nome]) => (
            <button key={id} onClick={() => setSituacao(id)}
              className={`px-3 py-1.5 ${situacao === id ? "bg-[var(--marca)] text-white" : "bg-white"}`}>{nome}</button>
          ))}
        </div>
        <input className="entrada flex-1" placeholder="Buscar cliente, CNPJ, código, cidade ou UF" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="entrada w-44" value={filtroSeg} onChange={(e) => setFiltroSeg(e.target.value)} aria-label="Segmento">
          <option value="">Todos os segmentos</option>
          <option value="_sem">Sem segmento</option>
          {SEGMENTOS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
        <select className="entrada w-44" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {todosGrupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <Link className="btn-primario" href="/clientes/importar">
          Importar do Domínio / planilha
        </Link>
        <button className="btn" onClick={() => setCsv(csv === null ? "" : null)}>
          Colar lista
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
      {sel.size > 0 && (
        <div className="cartao sticky top-2 z-20 flex flex-wrap items-center gap-3 border-[var(--destaque-escuro)] p-3">
          <b className="text-sm text-[var(--marca)]">{sel.size} selecionado(s)</b>
          <select className="entrada w-48" value={lote.segmento} onChange={(e) => setLote({ ...lote, segmento: e.target.value })} aria-label="Segmento em lote">
            <option value="">Segmento: manter</option>
            {SEGMENTOS.map((x) => (
              <option key={x.id} value={x.id}>
                Segmento: {x.nome}
              </option>
            ))}
            <option value="_limpar">Segmento: limpar</option>
          </select>
          <div className="min-w-64 flex-1">
            <Etiquetas valor={lote.grupos} aoMudar={(g) => setLote({ ...lote, grupos: g })} sugestoes={todosGrupos} placeholder="Incluir grupos (Enter)…" compacto />
          </div>
          <button className="btn-primario" onClick={aplicarLote}>
            Aplicar
          </button>
          <button className="btn-link" onClick={() => setSel(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--marca)]"
                  aria-label="Selecionar todos"
                  checked={lista.length > 0 && lista.every((c) => sel.has(c.id))}
                  onChange={(e) => setSel(e.target.checked ? new Set(lista.map((c) => c.id)) : new Set())}
                />
              </th>
              <th>Cliente</th>
              <th>CNPJ</th>
              <th>UF</th>
              <th>Regime</th>
              <th>Segmento e grupos</th>
              <th>Responsáveis</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const rs = resps.filter((r) => r.cliente_id === c.id);
              return (
                <Fragment key={c.id}>
                  <tr className={c.ativo ? "" : "opacity-50"}>
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--marca)]"
                        aria-label={`Selecionar ${c.razao_social}`}
                        checked={sel.has(c.id)}
                        onChange={(e) =>
                          setSel((x) => {
                            const n = new Set(x);
                            if (e.target.checked) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td>
                      <div className="font-medium">{c.razao_social}</div>
                      {(c.nome_fantasia || c.codigo_dominio) && (
                        <div className="text-xs text-[var(--texto-suave)]">
                          {[c.codigo_dominio && `Domínio ${c.codigo_dominio}`, c.nome_fantasia, [c.cidade, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[var(--texto-suave)]">{c.cnpj}</td>
                    <td className="text-[var(--texto-suave)]">{c.uf ?? "—"}</td>
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
                    <td className="min-w-56">
                      <select className="entrada mb-1 w-full" value={c.segmento ?? ""} onChange={(e) => alterar(c.id, { segmento: e.target.value || null })} aria-label="Segmento">
                        <option value="">Segmento…</option>
                        {SEGMENTOS.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                      </select>
                      <Etiquetas valor={c.grupos ?? []} aoMudar={(g) => alterar(c.id, { grupos: g })} sugestoes={todosGrupos} compacto />
                    </td>
                    <td>
                      <button className="btn-link" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
                        {rs.length ? `${rs.length} definido(s)` : "Definir"}
                      </button>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.ativo ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Ativo</span>
                          <button className="btn-link text-xs"
                            onClick={() => setInativando({ id: c.id, data: hojeISO(), motivo: "Saiu do escritório", outro: "" })}>
                            Inativar
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
                            Inativo{c.inativo_em ? ` desde ${fmtData(c.inativo_em)}` : ""}
                          </span>
                          {c.motivo_inativacao && <div className="mt-0.5 text-xs text-[var(--texto-suave)]">{c.motivo_inativacao}</div>}
                          <button className="btn-link text-xs" onClick={() => reativar(c.id)}>Reativar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {inativando?.id === c.id && (
                    <tr>
                      <td colSpan={8} className="bg-red-50/40">
                        <div className="grid gap-3 py-2 sm:grid-cols-[auto_auto_1fr_auto_auto] sm:items-end">
                          <label className="campo">
                            <span>Inativo a partir de *</span>
                            <input type="date" required value={inativando.data}
                              onChange={(e) => setInativando({ ...inativando, data: e.target.value })} />
                          </label>
                          <label className="campo">
                            <span>Motivo</span>
                            <select value={inativando.motivo} onChange={(e) => setInativando({ ...inativando, motivo: e.target.value })}>
                              {["Saiu do escritório", "Transferida para outro escritório", "Baixada / encerrada", "Inadimplência", "Outro"].map((m) => (
                                <option key={m}>{m}</option>
                              ))}
                            </select>
                          </label>
                          {inativando.motivo === "Outro" ? (
                            <label className="campo">
                              <span>Descreva</span>
                              <input value={inativando.outro} maxLength={300}
                                onChange={(e) => setInativando({ ...inativando, outro: e.target.value })} />
                            </label>
                          ) : <span />}
                          <button className="btn-primario" onClick={confirmarInativacao}>Confirmar inativação</button>
                          <button className="btn" onClick={() => setInativando(null)}>Cancelar</button>
                        </div>
                        <p className="pb-2 text-xs text-[var(--texto-suave)]">
                          As competências até o mês da data informada continuam com o escritório. Tarefas abertas de competências
                          posteriores (e avulsas que vencem depois da data) são canceladas e deixam de ser geradas. Ao reativar, voltam.
                        </p>
                      </td>
                    </tr>
                  )}
                  {aberto === c.id && (
                    <tr>
                      <td colSpan={8} className="bg-[var(--fundo)]">
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
  segmentos: null,
  grupos: null,
  meses: null,
  dia_vencimento: 20,
  meses_apos_competencia: 1,
  ajuste: "antecipa",
  ativo: true,
};

function AbaObrigacoes() {
  const { org, setores, setorPorId, clientes } = useOrg();
  const todosGrupos = useMemo(() => [...new Set(clientes.flatMap((c) => c.grupos ?? []))].sort((a, b) => a.localeCompare(b)), [clientes]);
  const [alcance, setAlcance] = useState<number | null>(null);
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
    if (error) return mostrar(traduzirErro(error), true);
    setEditando(null);
    carregar();
  }

  // prévia: quantos clientes ativos a obrigação vai pegar com os filtros
  useEffect(() => {
    if (!editando?.por_cliente) return setAlcance(null);
    let vivo = true;
    supabase()
      .rpc("prever_rotina", { p_org: org.id, p_regimes: editando.regimes ?? null, p_segmentos: editando.segmentos ?? null, p_grupos: editando.grupos ?? null })
      .then(({ data }) => vivo && setAlcance((data as number) ?? null));
    return () => {
      vivo = false;
    };
  }, [org.id, editando?.por_cliente, editando?.regimes, editando?.segmentos, editando?.grupos]);

  async function gerar() {
    const { data, error } = await supabase().rpc("gerar_competencia", { p_org: org.id, p_competencia: comp + "-01" });
    if (error) return mostrar(traduzirErro(error), true);
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
          que se encaixe no regime, segmento e grupo indicados. Para antecipar ou refazer uma competência, gere manualmente:
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
          <label className="campo">
            <span>Portal do Cliente</span>
            <select
              value={editando.visivel_cliente === false ? "0" : "1"}
              onChange={(e) => setEditando({ ...editando, visivel_cliente: e.target.value === "1" })}
            >
              <option value="1">Visível ao cliente</option>
              <option value="0">Só interna</option>
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
            <span>Segmentos (nenhum marcado = todos)</span>
            <div className="flex flex-wrap gap-3 pt-1 text-sm text-[var(--texto)]">
              {SEGMENTOS.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-[var(--marca)]"
                    checked={editando.segmentos?.includes(r.id) ?? false}
                    onChange={(e) => {
                      const atual = new Set(editando.segmentos ?? []);
                      if (e.target.checked) atual.add(r.id);
                      else atual.delete(r.id);
                      setEditando({ ...editando, segmentos: atual.size ? [...atual] : null });
                    }}
                  />
                  {r.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="campo md:col-span-2">
            <span>Grupos de clientes (vazio = todos; vale para quem tiver qualquer um)</span>
            <Etiquetas
              valor={editando.grupos ?? []}
              aoMudar={(g) => setEditando({ ...editando, grupos: g.length ? g : null })}
              sugestoes={todosGrupos}
              placeholder="Ex.: Com empregados, Grupo Clara… (Enter)"
            />
          </div>
          {editando.por_cliente && (
            <p className="rounded-lg bg-[var(--fundo)] px-3 py-2 text-sm md:col-span-4">
              Alcance: <b className="text-[var(--marca)]">{alcance ?? "…"}</b> cliente(s) ativo(s) recebem esta tarefa a cada competência com os filtros acima.
            </p>
          )}
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
              <th>Alcance</th>
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
                  {!m.regimes && !m.segmentos?.length && !m.grupos?.length
                    ? "Todos os clientes"
                    : [
                        m.regimes && m.regimes.map((r) => REGIMES.find((x) => x.id === r)?.nome ?? r).join(", "),
                        m.segmentos?.length && m.segmentos.map((x) => nomeSegmento(x)).join(", "),
                        m.grupos?.length && `grupos: ${m.grupos.join(", ")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
    if (error) return mostrar(traduzirErro(error), true);
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
