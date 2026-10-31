"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/lib/org";
import { hojeISO } from "@/lib/datas";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { REGIMES } from "@/lib/types";
import { ETAPAS, ORIGENS, SERVICOS_PADRAO, TIPOS_ATIVIDADE, montarContrato, numeroContrato, valoresIniciais } from "@/lib/crm";
import type { Atividade, Contrato, Etapa, Modelo, Oportunidade, Valores } from "@/lib/crm";
import { baixarBytes, gerarContratoPdf } from "@/lib/contratoPdf";
import { carregarLogo } from "@/lib/marca";
import { mdParaHtml } from "@/lib/markdown";
import { brl } from "@/lib/formato/moeda";

export default function PaginaOportunidade() {
  return <Detalhe />;
}

const ROT_SIM: Record<string, string> = {
  melhor_regime: "Melhor regime (simulador)",
  economia_estimada: "Economia estimada/ano",
  carga_pct_melhor: "Carga no melhor regime",
  folha: "Folha anual",
  compras: "Compras anuais",
  margem: "Margem",
  pct_b2b: "Vendas para empresas",
  cnae: "CNAE",
  cnae_descricao: "Atividade (CNAE)",
  porte: "Porte",
  situacao_cadastral: "Situação cadastral",
};

function Detalhe() {
  const { id } = useParams<{ id: string }>();
  const { org, eu, membros, pode } = useOrg();
  const [o, setO] = useState<Oportunidade | null>(null);
  const [ativ, setAtiv] = useState<Atividade[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const podeOperar = pode("comercial", "operar");
  const podeGerir = pode("comercial", "gerir");
  const router = useRouter();

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, b, c, m] = await Promise.all([
      sb.from("crm_oportunidades").select("*").eq("id", id).single(),
      sb.from("crm_atividades").select("*").eq("oportunidade_id", id).order("criado_em", { ascending: false }),
      sb.from("crm_contratos").select("*").eq("oportunidade_id", id).order("criado_em", { ascending: false }),
      sb.from("crm_modelos").select("*").eq("ativo", true).order("atualizado_em", { ascending: false }).limit(1),
    ]);
    if (a.error) return setErro(traduzirErro(a.error));
    setO(a.data as Oportunidade);
    setAtiv((b.data as Atividade[]) ?? []);
    setContratos((c.data as Contrato[]) ?? []);
    setModelo(((m.data as Modelo[]) ?? [])[0] ?? null);
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !o) return <p className="text-sm text-red-700">{erro}</p>;
  if (!o) return <p className="text-sm text-neutral-500">Carregando…</p>;

  async function atualizar(campos: Partial<Oportunidade>) {
    setErro(null);
    const { error } = await supabase().from("crm_oportunidades").update(campos).eq("id", o!.id);
    if (error) return setErro(traduzirErro(error));
    void carregar();
  }

  async function mudarEtapa(etapa: Etapa) {
    if (etapa === o!.etapa) return;
    if (etapa === "ganho") return converter();
    let motivo: string | null = null;
    if (etapa === "perdido") {
      motivo = prompt("Motivo da perda:");
      if (motivo === null) return;
    }
    void atualizar({ etapa, motivo_perda: motivo });
  }

  async function converter() {
    if (!confirm(`Marcar ${o!.empresa} como ganho e cadastrar como cliente da carteira (Tarefas, Portal e Demonstrativos)?`)) return;
    const { error } = await supabase().rpc("crm_converter_cliente", { p_op: o!.id });
    if (error) return setErro(traduzirErro(error));
    setAviso("Cliente cadastrado na carteira. Complete o código do Domínio e os responsáveis em Configurações.");
    void carregar();
  }

  async function arquivar(sim: boolean) {
    const motivo = sim ? prompt(`Arquivar ${o!.empresa}? Motivo (opcional):`, "Sem retorno") : null;
    if (sim && motivo === null) return;
    const { error } = await supabase().rpc("crm_arquivar", { p_ids: [o!.id], p_motivo: motivo, p_arquivar: sim });
    if (error) return setErro(traduzirErro(error));
    setAviso(sim ? "Arquivada: saiu do funil e fica em Arquivados." : "De volta ao funil.");
    void carregar();
  }

  async function excluir() {
    if (!confirm(`Excluir ${o!.empresa} de vez? Atividades e contratos em rascunho também são apagados.`)) return;
    const { error } = await supabase().from("crm_oportunidades").delete().eq("id", o!.id);
    if (error) return setErro(traduzirErro(error));
    router.push("/comercial");
  }

  const zap = o.whatsapp ? `https://wa.me/${o.whatsapp.replace(/\D/g, "").replace(/^(?!55)/, "55")}` : null;
  const etapaIdx = ETAPAS.findIndex((e) => e.id === o.etapa);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <Link href="/comercial" className="text-sm text-neutral-500 hover:underline">
            ← Funil
          </Link>
          <h1 className="text-xl font-semibold text-[var(--marca)]">{o.empresa}</h1>
          <p className="text-sm text-neutral-600">
            {ORIGENS.find((x) => x.id === o.origem)?.nome} · entrou em {new Date(o.criado_em).toLocaleDateString("pt-BR")}
            {o.cliente_id && " · já é cliente da carteira"}
            {o.arquivado_em &&
              ` · arquivada em ${new Date(o.arquivado_em).toLocaleDateString("pt-BR")}${o.motivo_arquivo ? ` (${o.motivo_arquivo})` : ""}`}
          </p>
        </div>
        {zap && (
          <a className="btn" href={zap} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        {o.email && (
          <a className="btn" href={`mailto:${o.email}`}>
            E-mail
          </a>
        )}
        {podeOperar && (
          <button className="btn" onClick={() => arquivar(!o.arquivado_em)}>
            {o.arquivado_em ? "Restaurar ao funil" : "Arquivar"}
          </button>
        )}
        {podeGerir && !o.cliente_id && (
          <button className="btn !border-red-200 !text-[var(--perigo)]" onClick={excluir}>
            Excluir
          </button>
        )}
        {podeOperar && !o.cliente_id && (
          <button className="btn-primario" onClick={converter}>
            Fechou: virar cliente
          </button>
        )}
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}

      <ol className="flex flex-wrap gap-1">
        {ETAPAS.map((e, k) => (
          <li key={e.id}>
            <button
              disabled={!podeOperar}
              onClick={() => mudarEtapa(e.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                e.id === o.etapa
                  ? e.id === "perdido"
                    ? "border-red-300 bg-red-50 font-medium text-red-800"
                    : "border-[var(--marca)] bg-[var(--marca)] text-white"
                  : k < etapaIdx && o.etapa !== "perdido"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-[var(--borda)] bg-white text-neutral-600"
              }`}
            >
              {e.nome}
            </button>
          </li>
        ))}
      </ol>
      {o.etapa === "perdido" && o.motivo_perda && <p className="-mt-3 text-sm text-red-800">Motivo: {o.motivo_perda}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Dados o={o} podeOperar={podeOperar} aoSalvar={atualizar} membros={membros} />
        <Atividades
          o={o}
          ativ={ativ}
          podeOperar={podeOperar}
          autorNome={(u) => membros.find((m) => m.user_id === u)?.nome ?? ""}
          aoMudar={carregar}
          eu={eu.user_id}
        />
      </div>

      <ContratoSecao o={o} modelo={modelo} contratos={contratos} podeOperar={podeOperar} aoMudar={carregar} logoUrl={org.logo_url} />
    </div>
  );
}

function Dados({
  o,
  podeOperar,
  aoSalvar,
  membros,
}: {
  o: Oportunidade;
  podeOperar: boolean;
  aoSalvar: (c: Partial<Oportunidade>) => void;
  membros: { user_id: string; nome: string; ativo: boolean }[];
}) {
  const [f, setF] = useState(o);
  useEffect(() => setF(o), [o]);
  const campo = (k: keyof Oportunidade, rot: string, tipo = "text") => (
    <label className="campo">
      <span>{rot}</span>
      <input
        type={tipo}
        disabled={!podeOperar}
        value={(f[k] as string | number | null) ?? ""}
        onChange={(e) =>
          setF({ ...f, [k]: tipo === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null })
        }
      />
    </label>
  );
  const sim = o.dados_origem ? Object.entries(o.dados_origem).filter(([k]) => k in ROT_SIM) : [];
  const fmtSim = (k: string, v: unknown) =>
    typeof v === "number"
      ? ["margem", "pct_b2b", "carga_pct_melhor"].includes(k)
        ? `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
        : ["folha", "compras", "economia_estimada"].includes(k)
          ? brl(v)
          : String(v)
      : k === "melhor_regime"
        ? (REGIMES.find((r) => r.id === v)?.nome ?? String(v))
        : String(v);

  return (
    <section className="cartao space-y-3 p-4">
      <h2 className="font-semibold">Dados da oportunidade</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {campo("empresa", "Empresa")}
        {campo("razao_social", "Razão social")}
        {campo("cnpj", "CNPJ")}
        {campo("contato_nome", "Contato")}
        {campo("whatsapp", "WhatsApp")}
        {campo("email", "E-mail", "email")}
        {campo("cidade", "Cidade")}
        {campo("uf", "UF")}
        <label className="campo">
          <span>Regime atual</span>
          <select
            disabled={!podeOperar}
            value={f.regime_atual ?? ""}
            onChange={(e) => setF({ ...f, regime_atual: e.target.value || null })}
          >
            <option value="">—</option>
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
            <option value="nao_sei">Não sabe</option>
          </select>
        </label>
        {campo("faturamento", "Faturamento anual (R$)", "number")}
        {campo("valor_mensal", "Honorário proposto (R$/mês)", "number")}
        {campo("proximo_contato", "Próximo retorno", "date")}
        <label className="campo">
          <span>Responsável</span>
          <select
            disabled={!podeOperar}
            value={f.responsavel_id ?? ""}
            onChange={(e) => setF({ ...f, responsavel_id: e.target.value || null })}
          >
            <option value="">—</option>
            {membros
              .filter((m) => m.ativo)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.nome}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="campo">
        <span>Observações</span>
        <textarea
          rows={3}
          disabled={!podeOperar}
          value={f.observacoes ?? ""}
          onChange={(e) => setF({ ...f, observacoes: e.target.value || null })}
        />
      </label>
      {podeOperar && (
        <div className="flex justify-end">
          <button
            className="btn-primario"
            onClick={() => {
              const {
                id: _i,
                org_id: _o,
                criado_em: _c,
                atualizado_em: _a,
                etapa_desde: _e,
                etapa: _et,
                cliente_id: _cl,
                dados_origem: _d,
                origem_ref: _r,
                ...resto
              } = f;
              aoSalvar({ ...resto, uf: resto.uf ? resto.uf.toUpperCase() : null });
            }}
          >
            Salvar dados
          </button>
        </div>
      )}
      {sim.length > 0 && (
        <div className="rounded-lg bg-[var(--fundo)] p-3">
          <h3 className="mb-1 text-sm font-semibold">Respostas do Simulador de Regime</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {sim.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-neutral-500">{ROT_SIM[k]}</dt>
                <dd className="text-right font-medium">{fmtSim(k, v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function Atividades({
  o,
  ativ,
  podeOperar,
  autorNome,
  aoMudar,
  eu,
}: {
  o: Oportunidade;
  ativ: Atividade[];
  podeOperar: boolean;
  autorNome: (u: string | null) => string;
  aoMudar: () => void;
  eu: string;
}) {
  const [tipo, setTipo] = useState("nota");
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    const sb = supabase();
    const { error } = await sb.from("crm_atividades").insert({
      org_id: o.org_id,
      oportunidade_id: o.id,
      tipo,
      texto: texto.trim(),
      quando: quando ? new Date(quando + "T09:00:00").toISOString() : null,
      concluida: tipo !== "tarefa",
      autor_id: eu,
    });
    if (error) return setErro(traduzirErro(error));
    const campos: Record<string, unknown> =
      tipo === "tarefa" && quando ? { proximo_contato: quando } : { atualizado_em: new Date().toISOString() };
    if (o.etapa === "novo" && ["ligacao", "whatsapp", "email", "reuniao"].includes(tipo))
      campos.etapa = tipo === "reuniao" ? "reuniao" : "contato";
    const op = await sb.from("crm_oportunidades").update(campos).eq("id", o.id);
    if (op.error) setErro(`Registro salvo, mas a oportunidade não foi atualizada: ${traduzirErro(op.error)}`);
    setTexto("");
    setQuando("");
    aoMudar();
  }

  async function concluir(a: Atividade) {
    const { error } = await supabase().from("crm_atividades").update({ concluida: !a.concluida }).eq("id", a.id);
    if (error) return setErro(traduzirErro(error));
    aoMudar();
  }

  return (
    <section className="cartao flex flex-col p-4">
      <h2 className="mb-2 font-semibold">Histórico e próximos passos</h2>
      {podeOperar && (
        <form onSubmit={adicionar} className="space-y-2">
          <div className="flex gap-2">
            <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_ATIVIDADE.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
            {tipo === "tarefa" && <input type="date" className="entrada" value={quando} onChange={(e) => setQuando(e.target.value)} />}
          </div>
          <textarea
            className="entrada w-full"
            rows={2}
            placeholder="O que foi conversado ou o que fazer…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-end">
            <button className="btn">Registrar</button>
          </div>
          {erro && <p className="text-xs text-red-700">{erro}</p>}
        </form>
      )}
      <ul className="mt-3 max-h-[480px] space-y-2 overflow-y-auto">
        {ativ.map((a) => (
          <li
            key={a.id}
            className={`rounded-lg border p-2 text-sm ${a.tipo === "tarefa" && !a.concluida ? "border-amber-200 bg-amber-50" : "border-[var(--borda)]"}`}
          >
            <div className="flex items-center gap-2 text-[11px] text-neutral-500">
              <span className="font-medium text-neutral-700">
                {TIPOS_ATIVIDADE.find((t) => t.id === a.tipo)?.nome ?? (a.tipo === "etapa" ? "Etapa" : "Contrato")}
              </span>
              <span>{new Date(a.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              <span>{autorNome(a.autor_id)}</span>
              {a.tipo === "tarefa" && (
                <label className="ml-auto flex items-center gap-1">
                  <input type="checkbox" checked={a.concluida} onChange={() => concluir(a)} disabled={!podeOperar} /> feito
                </label>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{a.texto}</p>
            {a.quando && <p className="text-[11px] text-neutral-500">para {new Date(a.quando).toLocaleDateString("pt-BR")}</p>}
          </li>
        ))}
        {!ativ.length && <li className="text-sm text-neutral-500">Nenhum registro ainda.</li>}
      </ul>
    </section>
  );
}

function ContratoSecao({
  o,
  modelo,
  contratos,
  podeOperar,
  aoMudar,
  logoUrl,
}: {
  o: Oportunidade;
  modelo: Modelo | null;
  contratos: Contrato[];
  podeOperar: boolean;
  aoMudar: () => void;
  logoUrl: string | null;
}) {
  const { org } = useOrg();
  const ultimo = contratos[0];
  const [v, setV] = useState<Valores>(ultimo?.valores ?? valoresIniciais(o, hojeISO(org.fuso)));
  const [extra, setExtra] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  useEffect(() => {
    if (ultimo) setV(ultimo.valores);
  }, [ultimo]);
  const numeroPrevisto = ultimo && ultimo.status !== "cancelado" ? (ultimo.numero ?? "") : "(gerado ao salvar)";
  const texto = useMemo(() => (modelo ? montarContrato(modelo.texto, v, numeroPrevisto) : ""), [modelo, v, numeroPrevisto]);
  const pendencias = (texto.match(/\[preencher[^\]]*\]/g) ?? []).length;
  const num = (k: keyof Valores) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value === "" ? 0 : Number(e.target.value) });
  const txt = (k: keyof Valores) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const editavel = podeOperar && (!ultimo || ultimo.status === "rascunho" || ultimo.status === "cancelado");

  async function salvar(): Promise<Contrato | null> {
    if (!modelo) return null;
    setErro(null);
    const sb = supabase();
    if (ultimo && ultimo.status === "rascunho") {
      const t = montarContrato(modelo.texto, v, ultimo.numero ?? "");
      const { data, error } = await sb
        .from("crm_contratos")
        .update({ valores: v, texto: t, modelo_id: modelo.id, modelo_versao: modelo.versao })
        .eq("id", ultimo.id)
        .select("*")
        .single();
      if (error) {
        setErro(traduzirErro(error));
        return null;
      }
      const op = await sb
        .from("crm_oportunidades")
        .update({ valor_mensal: v.honorario_mensal || null })
        .eq("id", o.id);
      if (op.error) setErro(`Contrato salvo, mas o valor do funil não foi atualizado: ${traduzirErro(op.error)}`);
      aoMudar();
      return data as Contrato;
    }
    const hoje = hojeISO(org.fuso);
    const ano = hoje.slice(0, 4);
    const { count } = await sb
      .from("crm_contratos")
      .select("id", { count: "exact", head: true })
      .eq("org_id", o.org_id)
      .gte("criado_em", `${ano}-01-01`);
    const numero = numeroContrato((count ?? 0) + 1, new Date(hoje + "T12:00:00Z"));
    const { data, error } = await sb
      .from("crm_contratos")
      .insert({
        org_id: o.org_id,
        oportunidade_id: o.id,
        modelo_id: modelo.id,
        modelo_versao: modelo.versao,
        numero,
        valores: v,
        texto: montarContrato(modelo.texto, v, numero),
      })
      .select("*")
      .single();
    if (error) {
      setErro(traduzirErro(error));
      return null;
    }
    const [op, at] = await Promise.all([
      sb
        .from("crm_oportunidades")
        .update({ valor_mensal: v.honorario_mensal || null })
        .eq("id", o.id),
      sb.from("crm_atividades").insert({
        org_id: o.org_id,
        oportunidade_id: o.id,
        tipo: "contrato",
        texto: `Contrato ${numero} criado (${brl(v.honorario_mensal)}/mês)`,
        concluida: true,
      }),
    ]);
    const falha = op.error ?? at.error;
    if (falha) setErro(`Contrato criado, mas o funil ou o histórico não foram atualizados: ${traduzirErro(falha)}`);
    aoMudar();
    return data as Contrato;
  }

  async function pdf(c?: Contrato | null) {
    setGerando(true);
    try {
      const alvo = c ?? (editavel ? await salvar() : ultimo);
      if (!alvo) return;
      const bytes = await gerarContratoPdf({
        texto: alvo.texto,
        numero: alvo.numero ?? "",
        contratante: { nome: alvo.valores.razao_social, representante: alvo.valores.representante },
        logo: await carregarLogo(logoUrl),
        rascunho: alvo.status === "rascunho",
      });
      baixarBytes(
        bytes,
        `Contrato-${(alvo.numero ?? "").replace("/", "-")}-${alvo.valores.razao_social.split(" ").slice(0, 2).join("-")}.pdf`,
      );
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function marcar(status: "enviado" | "assinado" | "cancelado") {
    if (!ultimo) return;
    const campos: Record<string, unknown> = { status };
    if (status === "enviado") campos.enviado_em = new Date().toISOString();
    if (status === "assinado") campos.assinado_em = new Date().toISOString();
    const sb = supabase();
    const { error } = await sb.from("crm_contratos").update(campos).eq("id", ultimo.id);
    if (error) return setErro(traduzirErro(error));
    const falhas: string[] = [];
    const at = await sb
      .from("crm_atividades")
      .insert({ org_id: o.org_id, oportunidade_id: o.id, tipo: "contrato", texto: `Contrato ${ultimo.numero} ${status}`, concluida: true });
    if (at.error) falhas.push(`histórico: ${traduzirErro(at.error)}`);
    if (status === "enviado" && ["novo", "contato", "reuniao"].includes(o.etapa)) {
      const op = await sb.from("crm_oportunidades").update({ etapa: "proposta" }).eq("id", o.id);
      if (op.error) falhas.push(`etapa do funil: ${traduzirErro(op.error)}`);
    }
    if (status === "assinado" && !o.cliente_id && confirm("Contrato assinado. Cadastrar a empresa como cliente da carteira agora?")) {
      const cv = await sb.rpc("crm_converter_cliente", { p_op: o.id });
      if (cv.error) falhas.push(`cadastro do cliente: ${traduzirErro(cv.error)}`);
    }
    if (falhas.length) setErro(`Contrato marcado como ${status}, mas houve falha em: ${falhas.join("; ")}`);
    aoMudar();
  }

  async function novaVersao() {
    if (!ultimo || !modelo) return;
    const { error } = await supabase().from("crm_contratos").update({ status: "cancelado" }).eq("id", ultimo.id);
    if (error) return setErro(traduzirErro(error));
    aoMudar();
  }

  if (!modelo)
    return (
      <section className="cartao p-4 text-sm text-neutral-600">
        Nenhum modelo de contrato ativo.{" "}
        <Link className="underline" href="/comercial/modelo">
          Cadastre o modelo-base
        </Link>
        .
      </section>
    );

  return (
    <section className="cartao space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Proposta e contrato</h2>
        {ultimo && (
          <span
            className={`chip ${ultimo.status === "assinado" ? "bg-emerald-50 text-emerald-800" : ultimo.status === "enviado" ? "bg-sky-50 text-sky-800" : ultimo.status === "cancelado" ? "bg-neutral-100 text-neutral-600" : "bg-amber-50 text-amber-800"}`}
          >
            Contrato {ultimo.numero} · {ultimo.status}
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Modelo: {modelo.nome} (versão {modelo.versao}). Aqui entram só os valores negociados; o texto vem do modelo-base.
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <fieldset disabled={!editavel} className="space-y-3">
          <legend className="mb-1 text-sm font-semibold">Contratante</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="campo">
              <span>Razão social</span>
              <input value={v.razao_social} onChange={txt("razao_social")} />
            </label>
            <label className="campo">
              <span>CNPJ</span>
              <input value={v.cnpj} onChange={txt("cnpj")} />
            </label>
            <label className="campo sm:col-span-2">
              <span>Endereço completo</span>
              <input value={v.endereco} onChange={txt("endereco")} placeholder="Rua, número, bairro, CEP" />
            </label>
            <label className="campo">
              <span>Cidade/UF</span>
              <input value={v.cidade_uf} onChange={txt("cidade_uf")} />
            </label>
            <label className="campo">
              <span>Representante</span>
              <input value={v.representante} onChange={txt("representante")} />
            </label>
            <label className="campo sm:col-span-2">
              <span>Qualificação do representante</span>
              <input
                value={v.representante_qualificacao}
                onChange={txt("representante_qualificacao")}
                placeholder="sócio administrador, CPF nº …"
              />
            </label>
          </div>

          <legend className="mb-1 pt-2 text-sm font-semibold">Valores negociados</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="campo">
              <span>Honorário mensal (R$)</span>
              <input type="number" step="0.01" value={v.honorario_mensal || ""} onChange={num("honorario_mensal")} />
            </label>
            <label className="campo">
              <span>Vencimento (dia)</span>
              <input type="number" min={1} max={28} value={v.vencimento_dia} onChange={num("vencimento_dia")} />
            </label>
            <label className="campo">
              <span>Início</span>
              <input type="date" value={v.inicio} onChange={txt("inicio")} />
            </label>
            <label className="campo">
              <span>Funcionários incluídos</span>
              <input type="number" min={0} value={v.funcionarios_incluidos} onChange={num("funcionarios_incluidos")} />
            </label>
            <label className="campo">
              <span>Por funcionário adicional (R$)</span>
              <input type="number" step="0.01" value={v.valor_funcionario_adicional || ""} onChange={num("valor_funcionario_adicional")} />
            </label>
            <label className="campo">
              <span>Taxa de implantação (R$)</span>
              <input type="number" step="0.01" value={v.taxa_implantacao || ""} onChange={num("taxa_implantacao")} />
            </label>
            <label className="campo">
              <span>Parcelas da implantação</span>
              <input type="number" min={1} value={v.parcelas_implantacao} onChange={num("parcelas_implantacao")} />
            </label>
            <label className="campo">
              <span>Reajuste</span>
              <select value={v.reajuste_indice} onChange={txt("reajuste_indice")}>
                {["IPCA (IBGE)", "INPC (IBGE)", "IGP-M (FGV)", "salário mínimo nacional"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Vigência</span>
              <select value={v.vigencia} onChange={txt("vigencia")}>
                {["indeterminado", "de 12 meses, renovável automaticamente", "de 24 meses, renovável automaticamente"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Aviso prévio (dias)</span>
              <input type="number" min={0} value={v.aviso_previo} onChange={num("aviso_previo")} />
            </label>
            <label className="campo">
              <span>Documentos até o dia</span>
              <input type="number" min={1} max={28} value={v.prazo_documentos} onChange={num("prazo_documentos")} />
            </label>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <input type="checkbox" checked={v.decimo_terceiro} onChange={(e) => setV({ ...v, decimo_terceiro: e.target.checked })} /> 13º
              honorário
            </label>
          </div>

          <legend className="mb-1 pt-2 text-sm font-semibold">Serviços contratados</legend>
          <div className="space-y-1">
            {[...new Set([...SERVICOS_PADRAO, ...v.servicos])].map((s) => (
              <label key={s} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={v.servicos.includes(s)}
                  onChange={(e) => setV({ ...v, servicos: e.target.checked ? [...v.servicos, s] : v.servicos.filter((x) => x !== s) })}
                />
                {s}
              </label>
            ))}
            <div className="flex gap-2 pt-1">
              <input className="entrada flex-1" placeholder="Outro serviço…" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (extra.trim()) {
                    setV({ ...v, servicos: [...v.servicos, extra.trim()] });
                    setExtra("");
                  }
                }}
              >
                Incluir
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="campo">
              <span>Cidade da assinatura</span>
              <input value={v.cidade_assinatura} onChange={txt("cidade_assinatura")} />
            </label>
            <label className="campo">
              <span>Data da assinatura</span>
              <input type="date" value={v.data_assinatura} onChange={txt("data_assinatura")} />
            </label>
          </div>
        </fieldset>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Prévia do contrato</h3>
            {pendencias > 0 && <span className="text-xs text-amber-800">{pendencias} campo(s) a preencher</span>}
          </div>
          <article
            className="prosa max-h-[640px] overflow-y-auto rounded-lg border border-[var(--borda)] bg-white p-5"
            dangerouslySetInnerHTML={{ __html: mdParaHtml(texto) }}
          />
        </div>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        {editavel && (
          <button className="btn" onClick={salvar}>
            Salvar valores
          </button>
        )}
        <button className="btn-primario" disabled={gerando} onClick={() => pdf()}>
          {gerando ? "Gerando…" : "Baixar contrato em PDF"}
        </button>
        {podeOperar && ultimo?.status === "rascunho" && (
          <button className="btn" onClick={() => marcar("enviado")}>
            Marcar como enviado
          </button>
        )}
        {podeOperar && ultimo && ["rascunho", "enviado"].includes(ultimo.status) && (
          <button className="btn" onClick={() => marcar("assinado")}>
            Marcar como assinado
          </button>
        )}
        {podeOperar && ultimo && ultimo.status !== "rascunho" && ultimo.status !== "cancelado" && (
          <button className="btn" onClick={novaVersao} title="Cancela este e permite renegociar">
            Renegociar (nova versão)
          </button>
        )}
      </div>
      {contratos.length > 1 && (
        <div className="text-xs text-neutral-600">
          Versões anteriores:{" "}
          {contratos.slice(1).map((c) => (
            <button key={c.id} className="btn-link mr-2" onClick={() => pdf(c)}>
              {c.numero} ({c.status})
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
