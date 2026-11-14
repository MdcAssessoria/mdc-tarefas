// Tela Família do MDC · Pessoal (075): quem está na família e o que cada um pode fazer, convites por código
// (JanelaConvidar), troca de permissão, tirar pessoa, sair da família e trocar o nome. Toda regra está no banco
// (funções pessoal_*); a tela só mostra e chama. Regras puras em dominios/pessoal/familia.ts.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";
import { useConsulta } from "@/lib/useConsulta";
import { fmtData } from "@/lib/formato/datas";
import { useAviso } from "@/components/ui/Aviso";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import type { Tom } from "@/components/ui/Tons";
import { JanelaConvidar } from "@/dominios/pessoal/componentes/JanelaConvidar";
import { NOME_SITUACAO, PERMISSOES, nomePermissao, permissaoDoMembro, situacaoConvite } from "@/dominios/pessoal/familia";
import type { ConviteFamilia, Permissao, SituacaoConvite } from "@/dominios/pessoal/familia";

interface Pessoa {
  user_id: string;
  nome: string;
  email: string | null;
  permissao: Permissao;
}

const TOM_PERMISSAO: Record<Permissao, Tom> = { responsavel: "violeta", lancar: "verde", consultar: "azul" };
const TOM_SITUACAO: Record<SituacaoConvite, Tom> = { aguardando: "ambar", aceito: "verde", cancelado: "neutro", vencido: "neutro" };

export default function TelaFamilia() {
  const { org, eu, papel, pessoal } = useOrg();
  const responsavel = papel === "admin";
  const { aviso, mostrar } = useAviso();
  const [janelaConfirmar, confirmar] = useConfirmar();
  const [convidando, setConvidando] = useState(false);
  const [mudando, setMudando] = useState<Pessoa | null>(null);
  const [renomeando, setRenomeando] = useState(false);

  const consulta = useConsulta(
    useCallback(async () => {
      const sb = supabase();
      const [m, a, c] = await Promise.all([
        sb.from("membros").select("user_id, nome, email, papel").eq("org_id", org.id).eq("ativo", true).order("nome"),
        sb.from("hub_acessos").select("user_id, papel").eq("org_id", org.id).eq("app", "financeiro"),
        responsavel
          ? sb
              .from("pessoal_convites")
              .select("id, nome, permissao, criado_em, expira_em, usado_em, cancelado_em")
              .eq("org_id", org.id)
              .order("criado_em", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const acessos = new Map((exigir(a) as { user_id: string; papel: string }[]).map((x) => [x.user_id, x.papel]));
      const pessoas: Pessoa[] = (exigir(m) as { user_id: string; nome: string; email: string | null; papel: string }[]).map((x) => ({
        user_id: x.user_id,
        nome: x.nome,
        email: x.email,
        permissao: permissaoDoMembro(x.papel, acessos.get(x.user_id)),
      }));
      return { pessoas, convites: exigir(c) as ConviteFamilia[] };
    }, [org.id, responsavel]),
  );

  if (!pessoal) {
    return (
      <EstadoVazio icone="pessoas" titulo="Esta tela é do MDC · Pessoal">
        Abra a sua família pelo menu para ver as pessoas.
      </EstadoVazio>
    );
  }

  async function chamar(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase().rpc(fn, args);
    if (error) throw error;
    mostrar(ok);
    consulta.recarregar();
  }

  async function tirar(p: Pessoa) {
    const sim = await confirmar({
      titulo: `Tirar ${p.nome} da família?`,
      descricao: "A pessoa deixa de ver as finanças e as tarefas da família. O que ela já lançou continua guardado.",
      botao: "Tirar da família",
      perigo: true,
    });
    if (!sim) return;
    try {
      await chamar("pessoal_remover", { p_org: org.id, p_user: p.user_id }, `${p.nome} saiu da família`);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  async function sair() {
    const sim = await confirmar({
      titulo: `Sair da ${org.nome}?`,
      descricao: "Você deixa de ver as finanças e as tarefas desta família. Para voltar, peça um novo convite ao responsável.",
      botao: "Sair da família",
      perigo: true,
    });
    if (!sim) return;
    try {
      const { error } = await supabase().rpc("pessoal_remover", { p_org: org.id, p_user: eu.user_id });
      if (error) throw error;
      window.location.replace(caminho("/pessoal"));
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  async function cancelarConvite(c: ConviteFamilia) {
    const sim = await confirmar({
      titulo: `Cancelar o convite de ${c.nome}?`,
      descricao: "O código deixa de valer na hora. Se precisar, gere outro convite.",
      botao: "Cancelar convite",
      perigo: true,
    });
    if (!sim) return;
    try {
      await chamar("pessoal_cancelar_convite", { p_convite: c.id }, "Convite cancelado");
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  const pessoas = consulta.dados?.pessoas ?? [];
  const agora = new Date().toISOString();
  const convites = consulta.dados?.convites ?? [];

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        icone={
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--fundo)]">
            <Icone nome="pessoas" className="h-6 w-6 text-[var(--marca)]" />
          </span>
        }
        titulo={org.nome}
        descricao="Quem está na família e o que cada pessoa pode fazer nas finanças e nas tarefas."
        acoes={
          <>
            <BotoesExportar
              vazio={!pessoas.length}
              avisar={mostrar}
              montar={() => ({
                titulo: `Pessoas da ${org.nome}`,
                subtitulo: `${pessoas.length} pessoa(s)`,
                arquivo: "pessoas-da-familia",
                colunas: [
                  { titulo: "Nome", valor: (p: Pessoa) => p.nome, peso: 2 },
                  { titulo: "E-mail", valor: (p: Pessoa) => p.email, peso: 2 },
                  { titulo: "Permissão", valor: (p: Pessoa) => nomePermissao(p.permissao) },
                ],
                linhas: pessoas,
              })}
            />
            {responsavel ? (
              <>
                <button className="btn" onClick={() => setRenomeando(true)}>
                  <Icone nome="editar" className="h-4 w-4" />
                  Trocar o nome
                </button>
                <button className="btn-primario" onClick={() => setConvidando(true)}>
                  <Icone nome="mais" className="h-4 w-4" />
                  Convidar alguém
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => void sair()}>
                <Icone nome="sair" className="h-4 w-4" />
                Sair da família
              </button>
            )}
          </>
        }
      />
      {aviso}

      {consulta.erro ? (
        <EstadoVazio
          icone="alerta"
          titulo="Não deu para carregar a família"
          acao={
            <button className="btn" onClick={consulta.recarregar}>
              <Icone nome="atualizar" className="h-4 w-4" />
              Tentar de novo
            </button>
          }
        >
          {consulta.erro}
        </EstadoVazio>
      ) : !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={3} />
      ) : (
        <>
          <section className="cartao divide-y divide-[var(--borda)] p-0">
            {pessoas.map((p) => (
              <div key={p.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--marca)] font-semibold text-white">
                  {p.nome.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[var(--marca)]">
                    {p.nome}
                    {p.user_id === eu.user_id && <span className="ml-1 font-normal text-neutral-500">(você)</span>}
                  </b>
                  {p.email && <span className="block truncate text-sm text-neutral-500">{p.email}</span>}
                </div>
                <Chip tom={TOM_PERMISSAO[p.permissao]}>{nomePermissao(p.permissao)}</Chip>
                {responsavel && p.user_id !== eu.user_id && (
                  <div className="flex w-full justify-end gap-2 sm:w-auto">
                    <button className="btn" onClick={() => setMudando(p)}>
                      <Icone nome="escudo" className="h-4 w-4" />
                      Mudar permissão
                    </button>
                    <button className="btn" onClick={() => void tirar(p)}>
                      <Icone nome="lixeira" className="h-4 w-4" />
                      Tirar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>

          {responsavel && pessoas.length === 1 && !convites.length && (
            <EstadoVazio
              icone="pessoas"
              titulo="Por enquanto só você"
              acao={
                <button className="btn-azul" onClick={() => setConvidando(true)}>
                  <Icone nome="mais" className="h-4 w-4" />
                  Convidar alguém
                </button>
              }
            >
              Convide quem mora com você. A pessoa recebe um código pelo WhatsApp, cria a própria senha e já entra na família.
            </EstadoVazio>
          )}

          {responsavel && convites.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--marca)]">Convites enviados</h2>
              <div className="cartao divide-y divide-[var(--borda)] p-0">
                {convites.map((c) => {
                  const s = situacaoConvite(c, agora);
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <b className="block text-[var(--marca)]">{c.nome}</b>
                        <span className="text-sm text-neutral-500">
                          {nomePermissao(c.permissao)} · enviado em {fmtData(c.criado_em.slice(0, 10))}
                          {s === "aguardando" && ` · vale até ${fmtData(c.expira_em.slice(0, 10))}`}
                        </span>
                      </div>
                      <Chip tom={TOM_SITUACAO[s]}>{NOME_SITUACAO[s]}</Chip>
                      {s === "aguardando" && (
                        <button className="btn" onClick={() => void cancelarConvite(c)}>
                          <Icone nome="cancelar" className="h-4 w-4" />
                          Cancelar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-neutral-500">
                Perdeu o código? Cancele o convite e gere outro: por segurança o código só aparece na hora em que é criado.
              </p>
            </section>
          )}
        </>
      )}

      {convidando && (
        <JanelaConvidar
          orgId={org.id}
          familia={org.nome}
          aoFechar={(criou) => {
            setConvidando(false);
            if (criou) consulta.recarregar();
          }}
        />
      )}
      {mudando && (
        <JanelaPermissao
          pessoa={mudando}
          aoFechar={() => setMudando(null)}
          aoSalvar={async (perm) => {
            await chamar(
              "pessoal_definir_permissao",
              { p_org: org.id, p_user: mudando.user_id, p_permissao: perm },
              `Permissão de ${mudando.nome} trocada`,
            );
            setMudando(null);
          }}
        />
      )}
      {renomeando && (
        <JanelaNome
          atual={org.nome}
          aoFechar={() => setRenomeando(false)}
          aoSalvar={async (nome) => {
            const { error } = await supabase().rpc("pessoal_renomear", { p_org: org.id, p_nome: nome });
            if (error) throw error;
            window.location.reload();
          }}
        />
      )}
      {janelaConfirmar}
    </div>
  );
}

function JanelaPermissao({
  pessoa,
  aoFechar,
  aoSalvar,
}: {
  pessoa: Pessoa;
  aoFechar: () => void;
  aoSalvar: (p: Permissao) => Promise<void>;
}) {
  const [perm, setPerm] = useState<Permissao>(pessoa.permissao);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setOcupado(true);
    setErro("");
    try {
      await aoSalvar(perm);
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo={`O que ${pessoa.nome} pode fazer`}
      aoFechar={aoFechar}
      largura="lg"
      avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
      rodape={
        <>
          <button className="btn-primario" onClick={() => void salvar()} disabled={ocupado || perm === pessoa.permissao}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn" onClick={aoFechar} disabled={ocupado}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <div className="grid gap-2">
        {PERMISSOES.map((p) => (
          <button
            key={p.valor}
            type="button"
            aria-pressed={perm === p.valor}
            onClick={() => setPerm(p.valor)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left ${perm === p.valor ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-neutral-200"}`}
          >
            <Icone nome={perm === p.valor ? "check" : "escudo"} className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
            <span>
              <b className="block text-[var(--marca)]">{p.nome}</b>
              <span className="text-sm text-neutral-600">{p.explica}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function JanelaNome({ atual, aoFechar, aoSalvar }: { atual: string; aoFechar: () => void; aoSalvar: (nome: string) => Promise<void> }) {
  const [nome, setNome] = useState(atual);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    try {
      await aoSalvar(nome.trim());
    } catch (x) {
      setErro(traduzirErro(x));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo="Nome da família"
      descricao="É o nome que aparece no app e nos convites."
      aoFechar={aoFechar}
      avisoRodape={erro && <p className="text-sm text-red-700">{erro}</p>}
      rodape={
        <>
          <button type="submit" form="form-nome-familia" className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" className="btn" onClick={aoFechar} disabled={ocupado}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-nome-familia" onSubmit={(e) => void salvar(e)}>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} minLength={3} maxLength={80} required />
        </label>
      </form>
    </Modal>
  );
}
