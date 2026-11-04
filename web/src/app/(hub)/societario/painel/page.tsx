// Societário › Painel: números do momento (em andamento, atrasados, aguardando cliente/órgão, concluídos no mês),
// gráfico por fase, os parados há mais tempo e o tempo médio por tipo. Atualiza sozinho a cada 2 minutos (serve de
// painel de TV; se uma leitura falhar, mantém o que já estava na tela). PDF/Excel dos processos em andamento.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { diasAte, hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";
import { lerProcessos } from "@/dominios/societario/leituras";
import { COLUNAS, DIAS_PARADO, diasParado, faseAtualDe, nomeStatusFase } from "@/dominios/societario/processos";
import { GraficoFases } from "@/dominios/societario/componentes/GraficoFases";
import { plural } from "@/lib/formato/numero";

export default function PaginaPainelSocietario() {
  return <Painel />;
}

const ATUALIZAR_MS = 120_000;

function Painel() {
  const { org, clientePorId, nomeMembro } = useOrg();
  const { aviso, mostrar } = useAviso();
  const consulta = useConsulta(useCallback(() => lerProcessos(org.id, true), [org.id]));
  const { recarregar } = consulta;
  useEffect(() => {
    const i = setInterval(recarregar, ATUALIZAR_MS);
    return () => clearInterval(i);
  }, [recarregar]);

  const hoje = hojeISO(org.fuso);
  const d = useMemo(() => {
    const processos = consulta.dados?.processos ?? [];
    const fases = consulta.dados?.fases ?? [];
    const tipos = consulta.dados?.tipos ?? [];
    const mes = hoje.slice(0, 7);
    const nomeTipo = new Map(tipos.map((t) => [t.id, t.nome]));
    const abertos = processos
      .filter((p) => p.status === "aberto")
      .map((p) => {
        const f = faseAtualDe(p, fases);
        const prazo = diasAte(f?.prazo_em ?? null, org.fuso);
        return {
          p,
          f,
          cliente: nomeCliente(clientePorId(p.cliente_id), p.futuro_cliente ?? "—"),
          tipo: nomeTipo.get(p.tipo_id) ?? "",
          atrasado: prazo !== null && prazo < 0,
          naFase: f ? diasParado(f.mudou_em) : 0,
        };
      });
    const barras = COLUNAS.map((c) => {
      const daFase = abertos.filter((a) => a.f?.codigo === c.codigo);
      const atrasados = daFase.filter((a) => a.atrasado).length;
      return { nome: c.nome, atrasados, emDia: daFase.length - atrasados };
    });
    const tempoMedio = tipos
      .map((t) => {
        const c = processos.filter((p) => p.tipo_id === t.id && p.status === "concluido" && p.concluido_em);
        if (!c.length) return null;
        const media = c.reduce((s, p) => s + (Date.parse(p.concluido_em!) - Date.parse(p.pedido_em)) / 864e5, 0) / c.length;
        return { nome: t.nome, dias: Math.round(media), n: c.length };
      })
      .filter((x): x is { nome: string; dias: number; n: number } => !!x);
    const parados = abertos
      .filter((a) => a.f && a.naFase >= DIAS_PARADO)
      .sort((a, b) => b.naFase - a.naFase)
      .slice(0, 8);
    return {
      abertos,
      barras,
      atrasados: abertos.filter((a) => a.atrasado).length,
      aguardandoCliente: abertos.filter((a) => a.f?.status === "aguardando_cliente").length,
      aguardandoOrgao: abertos.filter((a) => a.f?.status === "aguardando_orgao").length,
      concluidosMes: processos.filter((p) => p.status === "concluido" && p.concluido_em?.startsWith(mes)).length,
      tempoMedio,
      parados,
      vazio: !processos.length,
    };
  }, [consulta.dados, clientePorId, org.fuso, hoje]);

  const maxMedio = Math.max(1, ...d.tempoMedio.map((t) => t.dias));

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Painel do Societário"
        descricao="Como estão os processos agora: onde se acumulam, o que atrasou e quanto tempo cada tipo leva."
        acoes={
          <>
            <BotoesExportar
              vazio={!d.abertos.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Processos societários em andamento",
                subtitulo: `Posição de ${fmtData(hoje)} · ${plural(d.abertos.length, "processo")} · ${d.atrasados} com fase atrasada`,
                arquivo: nomeArquivo("Painel-societario", hoje),
                logoUrl: org.logo_url,
                linhas: d.abertos,
                colunas: [
                  { titulo: "Nº", valor: (a) => a.p.numero, formato: "numero", peso: 0.5, largura: 7 },
                  { titulo: "Cliente", valor: (a) => a.cliente, peso: 2.4, largura: 36 },
                  { titulo: "Tipo", valor: (a) => a.tipo, peso: 1.5, largura: 24 },
                  { titulo: "Fase atual", valor: (a) => a.f?.nome ?? "", peso: 1.4, largura: 22 },
                  { titulo: "Andamento", valor: (a) => (a.f ? nomeStatusFase(a.f.status) : ""), peso: 1.2, largura: 18 },
                  { titulo: "Prazo da fase", valor: (a) => fmtData(a.f?.prazo_em), peso: 1, largura: 13, alerta: (a) => a.atrasado },
                  { titulo: "Dias na fase", valor: (a) => a.naFase, formato: "numero", peso: 0.8, largura: 11 },
                  { titulo: "Responsável", valor: (a) => nomeMembro(a.f?.responsavel_id ?? a.p.responsavel_id), peso: 1.3, largura: 22 },
                  { titulo: "Previsão", valor: (a) => fmtData(a.p.previsao_em), peso: 0.9, largura: 12 },
                ],
              })}
            />
            <Link href="/societario" className="btn-primario">
              <Icone nome="lista" className="h-4 w-4" />
              Ver processos
            </Link>
          </>
        }
      />

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
          {consulta.dados && " Mostrando a última leitura; o painel tenta de novo sozinho."}
        </p>
      )}

      {!consulta.dados ? (
        consulta.erro ? null : <Esqueleto indicadores={5} linhas={6} />
      ) : d.vazio ? (
        <EstadoVazio
          icone="grafico"
          titulo="Ainda não há processos"
          acao={
            <Link href="/societario" className="btn-primario">
              <Icone nome="mais" className="h-4 w-4" />
              Ir para os processos
            </Link>
          }
        >
          O painel se monta sozinho quando houver processos societários. Abra o primeiro na tela de processos.
        </EstadoVazio>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 grid lg:col-span-1">
              <Indicador titulo="Em andamento" icone="pasta" valor={String(d.abertos.length)} tom="azul" />
            </div>
            <Indicador
              titulo="Fase atrasada"
              icone="alerta"
              valor={String(d.atrasados)}
              tom={d.atrasados ? "vermelho" : "neutro"}
            />
            <Indicador titulo="Aguardando cliente" icone="pessoas" valor={String(d.aguardandoCliente)} tom="violeta" />
            <Indicador titulo="Aguardando órgão" icone="banco" valor={String(d.aguardandoOrgao)} tom="ambar" />
            <Indicador titulo="Concluídos no mês" icone="check" valor={String(d.concluidosMes)} tom="verde" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="cartao p-4">
              <h2 className="mb-3 font-semibold text-[var(--marca)]">Processos em andamento por fase</h2>
              <GraficoFases barras={d.barras} />
            </section>

            <div className="space-y-5">
              <section className="cartao p-4">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-[var(--marca)]">
                  <Icone nome="relogio" className="h-4 w-4" />
                  Parados há mais tempo
                </h2>
                {!d.parados.length ? (
                  <p className="rounded-lg bg-[var(--fundo)] px-3 py-3 text-sm text-[var(--texto-suave)]">
                    Nenhum processo parado há {DIAS_PARADO} dias ou mais. Tudo andando.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--borda)] text-sm">
                    {d.parados.map((a) => (
                      <li key={a.p.id} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/societario/${a.p.id}`} className="alvo-toque-bloco min-w-0 hover:underline">
                          <span className="block truncate font-medium">
                            <span className="text-[var(--texto-suave)]">#{a.p.numero}</span> {a.cliente}
                          </span>
                          <span className="block truncate text-xs text-[var(--texto-suave)]">{a.f?.nome}</span>
                        </Link>
                        <Chip tom={a.naFase >= 10 ? "vermelho" : "ambar"}>{a.naFase} dias</Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="cartao p-4">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-[var(--marca)]">
                  <Icone nome="calendario" className="h-4 w-4" />
                  Tempo médio por tipo
                  <span className="ml-auto text-xs font-normal text-[var(--texto-suave)]">do pedido à conclusão</span>
                </h2>
                {!d.tempoMedio.length ? (
                  <p className="rounded-lg bg-[var(--fundo)] px-3 py-3 text-sm text-[var(--texto-suave)]">
                    Aparece aqui quando houver processos concluídos.
                  </p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {d.tempoMedio.map((t) => (
                      <li key={t.nome}>
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{t.nome}</span>
                          <span className="num shrink-0 text-[var(--texto-suave)]">
                            <b className="text-[var(--texto)]">{t.dias} dias</b> · {t.n} proc.
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-[var(--fundo)]" aria-hidden="true">
                          <div className="h-full rounded-full bg-[var(--destaque)]" style={{ width: `${(t.dias / maxMedio) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
