// Aba "Integrações" das Configurações (só administrador): a pasta do SharePoint de onde o HUB puxa os balancetes
// sozinho, a cada 15 minutos, e o Ledgra Link (boleto/Pix da Cobrança Ledgra, CartaoLedgraLink). O endereço fica gravado em hub_integracoes (não no código); o acesso do HUB à
// Microsoft (aplicativo do Entra ID) é configurado uma vez pelo TI — passo a passo em infra/microsoft-365.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { caminho } from "@/lib/caminho";
import { useMensagem } from "./useMensagem";
import { CartaoLedgraLink } from "./CartaoLedgraLink";

type Config = { site: string; biblioteca: string; pasta: string };
type Integracao = { config: Config; ativo: boolean; ultima_execucao: string | null; ultimo_resultado: string | null };

const PADRAO: Config = { site: "", biblioteca: "Documentos", pasta: "HUB-MDC/Balancetes/Entrada" };

export function AbaIntegracoes() {
  const { org } = useOrg();
  const { mostrar, el } = useMensagem();
  const consulta = useConsulta(
    useCallback(
      async () =>
        exigir(
          await supabase()
            .from("hub_integracoes")
            .select("config,ativo,ultima_execucao,ultimo_resultado")
            .eq("org_id", org.id)
            .eq("tipo", "sharepoint_balancetes")
            .maybeSingle(),
        ) as Integracao | null,
      [org.id],
    ),
  );
  const atual = consulta.dados;
  const [editado, setEditado] = useState<Config | null>(null);
  const f = editado ?? { ...PADRAO, ...(atual?.config ?? {}) };
  const [ocupado, setOcupado] = useState<"salvar" | "testar" | "rodar" | null>(null);

  async function salvar(ativo: boolean) {
    setOcupado("salvar");
    const { error } = await supabase()
      .from("hub_integracoes")
      .upsert({
        org_id: org.id,
        tipo: "sharepoint_balancetes",
        config: { ...f, site: f.site.trim(), pasta: f.pasta.trim().replace(/^\/+|\/+$/g, "") },
        ativo,
      });
    setOcupado(null);
    if (error) return mostrar(traduzirErro(error), true);
    setEditado(null);
    mostrar(
      ativo ? "Pasta salva e ligada: o HUB passa a ler a pasta a cada 15 minutos." : "Pasta salva. A leitura automática está desligada.",
    );
    consulta.recarregar();
  }

  async function chamar(acao: "testar" | "rodar_agora") {
    setOcupado(acao === "testar" ? "testar" : "rodar");
    const { data, error } = await supabase().functions.invoke("balancete-agente", { body: { acao, org_id: org.id } });
    setOcupado(null);
    consulta.recarregar();
    if (error) return mostrar("Não foi possível falar com o servidor agora. Tente de novo em instantes.", true);
    const r = data as { ok?: boolean; mensagem?: string; erro?: string };
    mostrar(r.mensagem ?? r.erro ?? "Pronto.", !r.ok);
  }

  const mudou = editado !== null;
  const preenchido = f.site.trim() && f.biblioteca.trim() && f.pasta.trim();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="cartao space-y-4 p-5">
          <div>
            <h2 className="font-semibold text-[var(--marca)]">Pasta de balancetes no SharePoint</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Coloque nesta pasta os balancetes exportados do Domínio (Excel ou CSV). A cada 15 minutos o HUB lê a pasta, reconhece a
              empresa e o mês, cria o rascunho e move o arquivo para <b>Processados</b> (ou <b>Com problema</b>, com o motivo no histórico).
              Nada é publicado sozinho: você revisa e publica na tela de Demonstrativos.
            </p>
          </div>
          <label className="campo">
            <span>Endereço do site do SharePoint</span>
            <input
              placeholder="https://mdcassessoria.sharepoint.com/sites/HUB"
              value={f.site}
              onChange={(e) => setEditado({ ...f, site: e.target.value })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="campo">
              <span>Biblioteca</span>
              <input value={f.biblioteca} onChange={(e) => setEditado({ ...f, biblioteca: e.target.value })} />
            </label>
            <label className="campo">
              <span>Pasta dentro da biblioteca</span>
              <input value={f.pasta} onChange={(e) => setEditado({ ...f, pasta: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primario" disabled={!preenchido || !!ocupado} onClick={() => salvar(true)}>
              {ocupado === "salvar" ? "Salvando…" : "Salvar e ligar"}
            </button>
            <button className="btn" disabled={!preenchido || !!ocupado} onClick={() => salvar(false)}>
              Salvar desligado
            </button>
            <button
              className="btn"
              disabled={!atual || mudou || !!ocupado}
              onClick={() => chamar("testar")}
              title="Confere se o HUB consegue abrir a pasta"
            >
              {ocupado === "testar" ? "Testando…" : "Testar conexão"}
            </button>
            <button
              className="btn"
              disabled={!atual || mudou || !!ocupado}
              onClick={() => chamar("rodar_agora")}
              title="Lê a pasta agora, sem esperar os 15 minutos"
            >
              {ocupado === "rodar" ? "Lendo a pasta…" : "Ler a pasta agora"}
            </button>
          </div>
          {mudou && <p className="text-xs text-amber-800">Salve antes de testar.</p>}
          {el}
        </div>

        <div className="cartao space-y-3 p-5 text-sm">
          <h2 className="font-semibold text-[var(--marca)]">Situação</h2>
          {consulta.carregando ? (
            <p className="text-neutral-500">Carregando…</p>
          ) : !atual ? (
            <p className="text-neutral-600">Nenhuma pasta configurada ainda.</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              <dt className="text-neutral-500">Leitura automática</dt>
              <dd>
                <span className={`chip ${atual.ativo ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-700"}`}>
                  {atual.ativo ? "Ligada (a cada 15 minutos)" : "Desligada"}
                </span>
              </dd>
              <dt className="text-neutral-500">Última leitura</dt>
              <dd>{atual.ultima_execucao ? new Date(atual.ultima_execucao).toLocaleString("pt-BR") : "ainda não leu"}</dd>
              <dt className="text-neutral-500">Resultado</dt>
              <dd>{atual.ultimo_resultado ?? "—"}</dd>
            </dl>
          )}
          <p>
            <a className="underline" href={caminho("/demonstrativos/importacoes")}>
              Ver o histórico de importações
            </a>
          </p>
          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            <b>Uma vez só, pelo TI:</b> criar o aplicativo do HUB no Microsoft 365 com acesso apenas a este site e cadastrar o código nos
            segredos do servidor. O passo a passo está em <code>infra/microsoft-365/README.md</code>. Enquanto isso não for feito, o “Testar
            conexão” avisa que o acesso ainda não foi configurado.
          </div>
        </div>
      </div>
      <CartaoLedgraLink />
    </div>
  );
}
