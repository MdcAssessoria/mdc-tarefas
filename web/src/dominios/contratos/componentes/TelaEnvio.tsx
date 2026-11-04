// Contratos › Envio (053): se o envio automático das faturas está ligado em cada canal — e-mail pelo Microsoft 365
// (caixa do HUB) e WhatsApp pela API oficial da Meta —, o que falta configurar (em palavras simples; o passo a passo
// técnico está em docs/07, seção 7.7), a fila de cada canal, os envios que falharam (PDF e Excel) e "Enviar teste".
// Só quem gere o módulo Contratos abre (navegacao.ts, minimo "gerir"); o teste é conferido de novo no banco.
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import { plural } from "@/lib/formato/numero";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { fmtWhatsapp } from "../faturamento";
import { type CanalAutomatico, estadoCanal, naFila, NOME_CANAL, type SituacaoEnvio } from "../envio";
import { conferirEnvio, lerSituacaoEnvio, testarEnvio } from "../repositorio";

function CartaoCanal({
  canal,
  s,
  podeGerir,
  org,
  avisar,
}: {
  canal: CanalAutomatico;
  s: SituacaoEnvio;
  podeGerir: boolean;
  org: string;
  avisar: (msg: string, tipo?: "erro") => void;
}) {
  const c = s.canais[canal];
  const e = estadoCanal(c);
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const contagem: [string, number][] = [
    ["Na fila", naFila(s, canal, "pendente")],
    ["Falharam", naFila(s, canal, "erro")],
    ["Aguardando configuração", naFila(s, canal, "aguardando_configuracao")],
    ["Enviados", naFila(s, canal, "enviado")],
  ];

  async function testar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro("");
    if (!destino.trim()) return setErro(canal === "email" ? "Informe o e-mail que vai receber o teste." : "Informe o WhatsApp (com DDD) que vai receber o teste.");
    setOcupado(true);
    try {
      const r = await testarEnvio(org, canal, destino.trim());
      if (r.ok) avisar(r.mensagem ?? "Teste enviado.");
      else setErro(r.erro ?? "O teste não saiu.");
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="cartao space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fundo)] text-[var(--marca)]">
          <Icone nome={canal === "email" ? "enviar" : "chat"} className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold">{NOME_CANAL[canal]}</h2>
        <span className="ml-auto">
          <Chip tom={e.tom}>{e.nome}</Chip>
        </span>
      </div>
      <p className="text-sm">{e.texto}</p>
      {c?.configurado && c.remetente && (
        <p className="text-sm">
          Sai por: <strong>{canal === "whatsapp" ? c.remetente : c.remetente.toLowerCase()}</strong>
        </p>
      )}
      {c && <p className="text-xs text-[var(--texto-suave)]">Conferido em {fmtDataHora(c.verificado_em)}.</p>}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {contagem.map(([rotulo, n]) => (
          <div key={rotulo} className="rounded-lg bg-[var(--fundo)] p-2">
            <dt className="text-xs text-[var(--texto-suave)]">{rotulo}</dt>
            <dd className={`text-lg font-semibold ${rotulo === "Falharam" && n > 0 ? "text-[var(--perigo)]" : ""}`}>{n}</dd>
          </div>
        ))}
      </dl>
      {podeGerir && (
        <form onSubmit={testar} className="space-y-2 border-t border-[var(--borda)] pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="campo min-w-0 flex-1">
              <span>{canal === "email" ? "Mandar um teste para o e-mail" : "Mandar um teste para o WhatsApp"}</span>
              <input
                required
                type={canal === "email" ? "email" : "tel"}
                inputMode={canal === "email" ? "email" : "tel"}
                value={destino}
                onChange={(x) => setDestino(x.target.value)}
                placeholder={canal === "email" ? "seu.email@mdcassessoria.com" : "(11) 98888-7777"}
              />
            </label>
            <button type="submit" className="btn" disabled={ocupado || !c?.configurado}>
              <Icone nome="enviar" className="h-4 w-4" />
              {ocupado ? "Enviando…" : "Enviar teste"}
            </button>
          </div>
          {!c?.configurado && <p className="text-xs text-[var(--texto-suave)]">O teste fica disponível quando o canal estiver ligado.</p>}
          {canal === "whatsapp" && c?.configurado && (
            <p className="text-xs text-[var(--texto-suave)]">O teste usa o modelo aprovado com um PDF de exemplo marcado como cancelado.</p>
          )}
          {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
        </form>
      )}
    </section>
  );
}

export function TelaEnvio() {
  const { org, pode } = useOrg();
  const { cliente } = useClienteGestao();
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [conferindo, setConferindo] = useState(false);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      return await lerSituacaoEnvio(org.id);
    }, [cliente, org.id]),
  );
  const s = consulta.dados;

  async function conferir() {
    setConferindo(true);
    try {
      const r = await conferirEnvio(org.id);
      const ligados = (["email", "whatsapp"] as CanalAutomatico[]).filter((c) => r.canais[c]?.configurado).length;
      mostrar(ligados === 2 ? "Os dois canais estão ligados." : ligados ? "Um canal ligado; veja o que falta no outro." : "Nenhum canal ligado ainda: veja o que falta.");
      consulta.recarregar();
    } catch (x) {
      mostrar(traduzirErro(x), "erro");
    } finally {
      setConferindo(false);
    }
  }

  if (!cliente) return <SemEmpresaGestao icone="enviar" />;
  const problemas = s?.problemas ?? [];
  const destino = (p: SituacaoEnvio["problemas"][number]) => (p.canal === "whatsapp" ? fmtWhatsapp(p.destino) : p.destino);

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Envio das faturas"
        descricao="O HUB manda cada fatura sozinho, por e-mail e WhatsApp, assim que a nota fiscal e o boleto ficam prontos. Aqui você vê se os canais estão ligados e o que não saiu."
        acoes={
          <>
            <BotoesExportar
              vazio={!problemas.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Envios das faturas que falharam",
                subtitulo: `${nomeCliente(cliente)} · ${plural(problemas.length, "envio")}`,
                arquivo: nomeArquivo("Envios com falha", nomeCliente(cliente), hoje),
                logoUrl: org.logo_url,
                linhas: problemas,
                colunas: [
                  { titulo: "Fatura", valor: (p) => p.fatura, peso: 0.9, largura: 12 },
                  { titulo: "Canal", valor: (p) => (p.canal === "email" ? "E-mail" : "WhatsApp"), peso: 0.7, largura: 10 },
                  { titulo: "Para", valor: destino, peso: 1.4, largura: 28 },
                  { titulo: "Motivo", valor: (p) => p.erro ?? "", peso: 2.6, largura: 60 },
                  { titulo: "Próxima tentativa", valor: (p) => (p.proxima ? fmtDataHora(p.proxima) : "Parou: reenviar"), peso: 1, largura: 18 },
                ],
              })}
            />
            <button className="btn-primario" onClick={() => void conferir()} disabled={conferindo}>
              <Icone nome="atualizar" className="h-4 w-4" />
              {conferindo ? "Conferindo…" : "Conferir agora"}
            </button>
          </>
        }
      />
      {aviso}
      <p className="flex items-start gap-2 rounded-xl border border-[var(--borda)] bg-[var(--fundo)] p-3 text-sm">
        <Icone nome="info" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
        <span>
          Cada contrato escolhe por onde a fatura vai (e-mail, WhatsApp, Portal). Enquanto um canal não está ligado, as faturas ficam
          guardadas e saem sozinhas quando ligar. Se um envio falhar, o HUB tenta de novo (10 min, 30 min, 2 h, 6 h, 24 h) e, na terceira
          falha, avisa no sino. A ligação dos canais é feita pela TI no Microsoft 365, na Meta e no painel do Supabase (passo a passo na
          documentação do HUB).
        </span>
      </p>
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}
      {!s ? (
        !consulta.erro && <Esqueleto linhas={6} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["email", "whatsapp"] as CanalAutomatico[]).map((c) => (
              <CartaoCanal key={c} canal={c} s={s} podeGerir={podeGerir} org={org.id} avisar={mostrar} />
            ))}
          </div>
          <h2 className="pt-2 text-base font-semibold">Envios que falharam</h2>
          {!problemas.length ? (
            <EstadoVazio icone="check" titulo="Nenhum envio com falha">
              Quando um e-mail ou WhatsApp não sair, ele aparece aqui com o motivo. Para reenviar, abra a fatura em{" "}
              <Link className="underline" href="/contratos/faturas">
                Contratos › Faturas
              </Link>
              .
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Envios que falharam">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Canal</th>
                  <th>Para</th>
                  <th>Motivo</th>
                  <th>Próxima tentativa</th>
                </tr>
              </thead>
              <tbody>
                {problemas.map((p) => (
                  <tr key={p.envio}>
                    <td className="celula-titulo font-medium">
                      <Link className="hover:underline" href="/contratos/faturas">
                        Fatura {p.fatura}
                      </Link>
                    </td>
                    <td data-rotulo="Canal">{p.canal === "email" ? "E-mail" : "WhatsApp"}</td>
                    <td data-rotulo="Para" className="break-all">
                      {destino(p)}
                    </td>
                    <td data-rotulo="Motivo" className="min-w-48 text-sm">
                      {p.erro}
                      {p.falhas > 1 && <span className="block text-xs text-[var(--texto-suave)]">{p.falhas} falhas seguidas</span>}
                    </td>
                    <td data-rotulo="Próxima tentativa" className="whitespace-nowrap">
                      {p.proxima ? fmtDataHora(p.proxima) : <Chip tom="vermelho">Parou: reenviar</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}
    </div>
  );
}
