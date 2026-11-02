// Societário › Ficha do processo: dados do processo, fases (situação, responsável, prazo), protocolos, exigências,
// taxas, documentos e a linha do tempo. Concluir pede confirmação; cancelar pede o motivo (vai para o histórico).
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { useConsulta } from "@/lib/useConsulta";
import { fmtData } from "@/lib/formato/datas";
import { enviarArquivo } from "@/lib/arquivos/armazenamento";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { lerFicha, registrarComHistorico } from "@/dominios/societario/leituras";
import { situacaoProcesso } from "@/dominios/societario/processos";
import type { SocFase, StatusFase } from "@/dominios/societario/processos";
import { LigarCliente } from "@/dominios/societario/componentes/LigarCliente";
import { FasesProcesso } from "@/dominios/societario/componentes/FasesProcesso";
import { Documentos, Exigencias, LinhaDoTempo, Protocolos, Taxas } from "@/dominios/societario/componentes/SecoesProcesso";

export default function PaginaProcesso() {
  return <Ficha />;
}

function Ficha() {
  const { id } = useParams<{ id: string }>();
  const { org, clientePorId, nomeMembro, pode } = useOrg();
  const consulta = useConsulta(useCallback(() => lerFicha(id), [id]));
  const { aviso, mostrar } = useAviso();
  const [janelaConfirmar, confirmar] = useConfirmar();
  const [cancelando, setCancelando] = useState(false);
  /** Erro que fica na tela até a próxima ação (ex.: registro salvo sem a linha do histórico). */
  const [erro, setErro] = useState<string | null>(null);
  const podeOperar = pode("societario", "operar");
  const podeGerir = pode("societario", "gerir");
  const hoje = hojeISO(org.fuso);
  const recarregar = consulta.recarregar;

  if (!consulta.dados)
    return consulta.erro ? (
      <EstadoVazio
        icone="pasta"
        titulo="Não foi possível abrir o processo"
        acao={
          <Link href="/societario" className="btn">
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar aos processos
          </Link>
        }
      >
        {consulta.erro}
      </EstadoVazio>
    ) : (
      <Esqueleto indicadores={0} linhas={8} />
    );

  const d = consulta.dados;
  const p = d.processo;
  const nome = nomeCliente(clientePorId(p.cliente_id), p.futuro_cliente ?? "");
  const aberto = p.status === "aberto";
  const sit = situacaoProcesso(p);
  const previsaoVencida = aberto && !!p.previsao_em && p.previsao_em < hoje;

  /** Chama uma função do banco; erro fica na tela. Devolve se deu certo. */
  async function rpc(fn: string, args: Record<string, unknown>, sucesso?: string) {
    setErro(null);
    const { error } = await supabase().rpc(fn, args);
    if (error) setErro(traduzirErro(error));
    else if (sucesso) mostrar(sucesso);
    recarregar();
    return !error;
  }

  async function atualizarFase(f: SocFase, campos: Partial<SocFase>) {
    setErro(null);
    const { error } = await supabase().from("soc_fases").update(campos).eq("id", f.id);
    if (error) setErro(traduzirErro(error));
    recarregar();
  }

  /** Registro + linha do histórico (duas etapas). Se só o histórico falhar, avisa e o registro fica. */
  async function inserir(tabela: "soc_protocolos" | "soc_taxas", dados: Record<string, unknown>, evento: string, visivel = false) {
    setErro(null);
    try {
      const alerta = await registrarComHistorico(org.id, id, tabela, dados, evento, visivel);
      if (alerta) setErro(alerta);
      else mostrar("Registrado.");
      recarregar();
      return true;
    } catch (e) {
      setErro(traduzirErro(e));
      return false;
    }
  }

  async function comentar(texto: string, visivelCliente: boolean) {
    setErro(null);
    const { error } = await supabase()
      .from("soc_eventos")
      .insert({ org_id: org.id, processo_id: id, tipo: "comentario", texto, visivel_cliente: visivelCliente });
    if (error) {
      setErro(traduzirErro(error));
      return false;
    }
    recarregar();
    return true;
  }

  async function anexar(arqs: FileList | null, faseNome?: string) {
    if (!arqs?.length) return;
    setErro(null);
    let enviados = 0;
    try {
      for (const a of Array.from(arqs)) {
        await enviarArquivo(a, { org: org.id, app: "societario", ref: id, cliente: p.cliente_id, visivelCliente: false });
        enviados++;
        exigir(
          await supabase()
            .from("soc_eventos")
            .insert({
              org_id: org.id,
              processo_id: id,
              tipo: "documento",
              texto: `Documento anexado${faseNome ? ` (${faseNome})` : ""}: ${a.name}`,
            }),
        );
      }
      mostrar(enviados === 1 ? "Documento anexado." : `${enviados} documentos anexados.`);
    } catch (e) {
      setErro(enviados ? `${enviados} documento(s) anexado(s), mas houve um problema: ${traduzirErro(e)}` : traduzirErro(e));
    }
    recarregar();
  }

  async function mudarPortalArquivo(a: Arquivo) {
    setErro(null);
    const { error } = await supabase().from("hub_arquivos").update({ visivel_cliente: !a.visivel_cliente }).eq("id", a.id);
    if (error) return setErro(traduzirErro(error));
    recarregar();
  }

  async function mudarPortalProcesso(visivel: boolean) {
    setErro(null);
    const { error } = await supabase().from("soc_processos").update({ visivel_cliente: visivel }).eq("id", p.id);
    if (error) return setErro(traduzirErro(error));
    mostrar(visivel ? "O cliente passa a ver o andamento no portal." : "O processo saiu do portal do cliente.");
    recarregar();
  }

  async function concluir() {
    const ok = await confirmar({
      titulo: "Concluir o processo?",
      descricao: (
        <>
          As fases que ainda estão pendentes serão dispensadas e o processo sai do quadro.
          {d.tipo?.codigo === "abertura" && " Por ser abertura, a empresa é cadastrada em Clientes."}
          {d.tipo?.codigo === "baixa" && " Por ser baixa, o cliente fica inativo e os vencimentos dele são encerrados."}
        </>
      ),
      botao: "Concluir processo",
    });
    if (ok) await rpc("soc_concluir_processo", { p_proc: p.id }, "Processo concluído.");
  }

  const dados = [
    { r: "Tipo", v: d.tipo?.nome ?? "—" },
    { r: "Pedido em", v: fmtData(p.pedido_em) },
    {
      r: "Previsão",
      v: p.status === "concluido" ? `concluído ${fmtData(p.concluido_em)}` : fmtData(p.previsao_em) || "—",
      alerta: previsaoVencida,
    },
    { r: "Responsável", v: nomeMembro(p.responsavel_id) },
    { r: "UF", v: p.uf ?? "—" },
    { r: "CNPJ", v: p.cnpj ?? "—" },
  ];

  return (
    <div className="space-y-5">
      <Link href="/societario" className="inline-flex items-center gap-1.5 text-sm text-[var(--texto-suave)] hover:underline">
        <Icone nome="voltar" className="h-4 w-4" />
        Processos
      </Link>

      <CabecalhoPagina
        titulo={
          <>
            <span className="text-[var(--texto-suave)]">#{p.numero}</span> · {nome || "—"}
          </>
        }
        descricao={d.tipo?.nome}
        acoes={
          <>
            <Chip tom={sit.tom}>{sit.nome}</Chip>
            {aberto && podeOperar && (
              <button className="btn-primario" onClick={concluir}>
                <Icone nome="check" className="h-4 w-4" />
                Concluir processo
              </button>
            )}
            {aberto && podeGerir && (
              <button className="btn text-[var(--perigo)]" onClick={() => setCancelando(true)}>
                <Icone nome="cancelar" className="h-4 w-4" />
                Cancelar processo
              </button>
            )}
          </>
        }
      />

      <section className="cartao p-4" aria-label="Dados do processo">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {dados.map((x) => (
            <div key={x.r} className="min-w-0">
              <dt className="text-xs text-[var(--texto-suave)]">{x.r}</dt>
              <dd className={`num truncate text-sm font-medium ${x.alerta ? "text-red-700" : ""}`} title={x.v}>
                {x.v}
                {x.alerta && <span className="ml-1 text-xs font-normal">(vencida)</span>}
              </dd>
            </div>
          ))}
        </dl>
        {p.descricao && (
          <div className="mt-3 border-t border-[var(--borda)] pt-3">
            <p className="text-xs text-[var(--texto-suave)]">O que muda</p>
            <p className="whitespace-pre-wrap text-sm">{p.descricao}</p>
          </div>
        )}
        {podeOperar && (
          <label className="mt-3 flex items-center gap-2 border-t border-[var(--borda)] pt-3 text-sm">
            <input type="checkbox" checked={p.visivel_cliente} onChange={(e) => mudarPortalProcesso(e.target.checked)} />
            <span>
              Cliente acompanha no portal
              <span className="block text-xs text-[var(--texto-suave)]">
                Ele vê a fase atual, os protocolos e o que estiver marcado como visível.
              </span>
            </span>
          </label>
        )}
      </section>

      {!p.cliente_id && p.status !== "cancelado" && (
        <LigarCliente
          abertura={d.tipo?.codigo === "abertura"}
          podeOperar={podeOperar}
          aoLigar={(cli) => rpc("soc_vincular_cliente", { p_proc: p.id, p_cliente: cli }, "Processo ligado ao cliente.")}
        />
      )}

      {aviso}
      {erro && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{erro}</span>
          <button className="shrink-0 rounded p-0.5 hover:bg-red-100" onClick={() => setErro(null)} aria-label="Fechar a mensagem">
            <Icone nome="fechar" className="h-4 w-4" />
          </button>
        </p>
      )}

      <FasesProcesso
        processo={p}
        fases={d.fases}
        podeOperar={podeOperar}
        aoMudarStatus={(f, status: StatusFase) => rpc("soc_mudar_fase", { p_fase: f.id, p_status: status })}
        aoAtualizar={atualizarFase}
        aoAnexar={anexar}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Protocolos
              itens={d.protocolos}
              podeRegistrar={podeOperar && aberto}
              aoRegistrar={(v) =>
                inserir("soc_protocolos", v, `Protocolado na ${v.orgao} nº ${v.numero} em ${fmtData(v.data)}`, true)
              }
            />
            <Exigencias
              itens={d.exigencias}
              total={p.exigencias}
              podeOperar={podeOperar}
              podeRegistrar={podeOperar && aberto}
              aoRegistrar={(v) => rpc("soc_registrar_exigencia", { p_proc: p.id, p_orgao: v.orgao, p_texto: v.texto }, "Exigência registrada.")}
              aoResponder={async (x, resposta, reprotocolo) => {
                exigir(await supabase().from("soc_exigencias").update({ resposta, reprotocolo_em: reprotocolo || null }).eq("id", x.id));
                mostrar("Resposta registrada.");
                recarregar();
              }}
            />
            <Taxas
              itens={d.taxas}
              hoje={hoje}
              podeOperar={podeOperar}
              podeRegistrar={podeOperar && aberto}
              aoRegistrar={(v) =>
                inserir(
                  "soc_taxas",
                  { ...v, valor: v.valor ? Number(String(v.valor).replace(",", ".")) : null },
                  `Taxa registrada: ${v.descricao}`,
                )
              }
              aoPagar={async (x) => {
                setErro(null);
                const { error } = await supabase().from("soc_taxas").update({ pago_em: hoje }).eq("id", x.id);
                if (error) return setErro(traduzirErro(error));
                mostrar("Taxa marcada como paga.");
                recarregar();
              }}
            />
            <Documentos
              itens={d.arquivos}
              podeOperar={podeOperar}
              mostrarPortal={!!p.cliente_id}
              aoAnexar={(a) => anexar(a)}
              aoPortal={mudarPortalArquivo}
              aoErro={(e) => setErro(traduzirErro(e))}
            />
          </div>
        </div>

        <LinhaDoTempo eventos={d.eventos} podeOperar={podeOperar} aoComentar={comentar} />
      </div>

      {janelaConfirmar}
      {cancelando && (
        <JanelaMotivo
          titulo="Cancelar o processo"
          descricao={`#${p.numero} · ${nome}. O processo sai do quadro e as tarefas das fases são canceladas. O motivo fica no histórico.`}
          botao="Cancelar processo"
          aoFechar={() => setCancelando(false)}
          aoConfirmar={async (motivo) => {
            exigir(await supabase().rpc("soc_cancelar_processo", { p_proc: p.id, p_motivo: motivo }));
            setCancelando(false);
            mostrar("Processo cancelado.");
            recarregar();
          }}
        />
      )}
    </div>
  );
}
