// Contratos › Receita por sistema (059): quanto cada sistema ou módulo licenciado pela MDC (Ledgra, EXato…) traz.
// Cada licença vendida é um contrato a receber que aponta o sistema. Mostra, no mês escolhido: licenças ativas,
// clientes, receita mensal contratada, faturado, recebido, em atraso, a receita PREVISTA dos 12 meses seguintes
// (previsibilidade) e o faturado dos 12 meses anteriores. Quem gere Contratos cadastra, renomeia e inativa sistemas.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia } from "@/lib/formato/datas";
import { plural } from "@/lib/formato/numero";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { Valor } from "@/components/ui/Valor";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { lerReceitaSistemas, lerSistemas } from "../leituras";
import { salvarSistema } from "../repositorio";
import { mesCurto, participacao, totaisSistemas } from "../sistemas";
import type { LinhaReceitaSistema, Sistema } from "../tipos";
import { CampoMes } from "./ContratoFixo";
import { JanelaSistema } from "./JanelaSistema";

/** Sugestões de um clique quando ainda não há sistema cadastrado (dá para mudar o nome depois). */
const SUGESTOES = ["Ledgra", "EXato", "MDC Tarefas"];

export function TelaSistemas() {
  const { org, pode } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const [janelaConfirmar, confirmar] = useConfirmar();
  const hoje = hojeISO(org.fuso);
  const anoAtual = Number(hoje.slice(0, 4));
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [janela, setJanela] = useState<{ editar?: Sistema; nome?: string } | null>(null);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [painel, sistemas] = await Promise.all([lerReceitaSistemas(cliente.id, `${mes}-01`), lerSistemas(cliente.id)]);
      return { painel, sistemas };
    }, [cliente, mes]),
  );
  const linhas = consulta.dados?.painel.linhas ?? [];
  const meses = consulta.dados?.painel.meses ?? [];
  const sistemas = consulta.dados?.sistemas ?? [];
  const t = totaisSistemas(linhas);
  const sistemaDe = (l: LinhaReceitaSistema) => sistemas.find((s) => s.id === l.sistema);
  const inativos = sistemas.filter((s) => !s.ativo && !linhas.some((l) => l.sistema === s.id));

  async function trocarAtivo(s: Sistema) {
    const inativar = s.ativo;
    const ok = await confirmar({
      titulo: inativar ? `Inativar "${s.nome}"?` : `Reativar "${s.nome}"?`,
      descricao: inativar
        ? "Os contratos que já usam este sistema continuam iguais. Ele só deixa de aparecer para contratos novos."
        : "Ele volta a aparecer para escolher nos contratos a receber.",
      botao: inativar ? "Inativar" : "Reativar",
      perigo: inativar,
    });
    if (!ok) return;
    try {
      await salvarSistema({ id: s.id, nome: s.nome, ativo: !inativar });
      mostrar(inativar ? "Sistema inativado." : "Sistema reativado.");
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    }
  }

  const colunasMes = meses.map((m, i) => ({ titulo: mesCurto(m), valor: (l: LinhaReceitaSistema) => l.por_mes[i] ?? 0, formato: "moeda" as const }));

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Receita por sistema"
        descricao="Licenças vendidas de cada sistema ou módulo: quanto entra todo mês, o que já foi faturado e recebido e o que está previsto para os próximos 12 meses."
        acoes={
          <>
            <BotoesExportar
              vazio={!linhas.length}
              avisar={mostrar}
              montar={() => ({
                titulo: `Receita por sistema · ${fmtCompetencia(mes)}`,
                subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${plural(linhas.length, "sistema")}`,
                arquivo: nomeArquivo("Receita por sistema", fmtCompetencia(mes), hoje),
                logoUrl: org.logo_url,
                paisagem: true,
                linhas,
                colunas: [
                  { titulo: "Sistema", valor: (l) => l.nome, peso: 2, largura: 28 },
                  { titulo: "Licenças ativas", valor: (l) => l.contratos, formato: "numero" },
                  { titulo: "Clientes", valor: (l) => l.clientes, formato: "numero" },
                  { titulo: "Receita mensal", valor: (l) => l.mensal, formato: "moeda" },
                  { titulo: "% da receita", valor: (l) => participacao(l.mensal, t.mensal), formato: "numero" },
                  { titulo: "Faturado no mês", valor: (l) => l.faturado, formato: "moeda" },
                  { titulo: "Recebido no mês", valor: (l) => l.recebido, formato: "moeda" },
                  { titulo: "Em atraso", valor: (l) => l.atraso, formato: "moeda", alerta: (l) => l.atraso > 0 },
                  { titulo: "Previsto 12 meses", valor: (l) => l.previsto, formato: "moeda" },
                  { titulo: "Novas em 12 meses", valor: (l) => l.novos, formato: "numero" },
                  { titulo: "Encerradas em 12 meses", valor: (l) => l.encerrados, formato: "numero" },
                  ...colunasMes,
                ],
                totais: {
                  "Licenças ativas": t.contratos,
                  Clientes: t.clientes,
                  "Receita mensal": t.mensal,
                  "Faturado no mês": t.faturado,
                  "Recebido no mês": t.recebido,
                  "Em atraso": t.atraso,
                  "Previsto 12 meses": t.previsto,
                  ...Object.fromEntries(colunasMes.map((c, i) => [c.titulo, t.porMes[i] ?? 0])),
                },
              })}
            />
            {podeGerir && cliente && (
              <button className="btn-primario" onClick={() => setJanela({})}>
                <Icone nome="mais" className="h-4 w-4" />
                Novo sistema
              </button>
            )}
          </>
        }
      />
      <div className="cartao flex flex-wrap items-end gap-3 p-3">
        <CampoMes
          rotulo="Mês"
          valor={mes}
          aoMudar={setMes}
          anos={Array.from({ length: 5 }, (_, i) => anoAtual - 3 + i)}
          dica="Faturado e recebido contam pelo mês de competência das contas dos contratos."
        />
      </div>
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {!cliente ? (
        <SemEmpresaGestao icone="grade" />
      ) : consulta.carregando && !consulta.dados ? (
        <Esqueleto />
      ) : !linhas.length ? (
        <EstadoVazio
          icone="grade"
          titulo="Nenhum sistema cadastrado"
          acao={
            podeGerir ? (
              <div className="flex flex-wrap justify-center gap-2">
                {SUGESTOES.map((n) => (
                  <button key={n} className="btn" onClick={() => setJanela({ nome: n })}>
                    <Icone nome="mais" className="h-4 w-4" />
                    {n}
                  </button>
                ))}
                <button className="btn-primario" onClick={() => setJanela({})}>
                  <Icone nome="mais" className="h-4 w-4" />
                  Outro sistema
                </button>
              </div>
            ) : undefined
          }
        >
          Cadastre cada sistema ou módulo que a MDC licencia. Depois, em cada contrato a receber, escolha o sistema vendido: a
          receita de cada um aparece aqui.
        </EstadoVazio>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador titulo="Receita mensal contratada" icone="moeda" valor={brl(t.mensal)} detalhe={plural(t.contratos, "licença ativa", "licenças ativas")} tom="azul" />
            <Indicador titulo={`Recebido em ${fmtCompetencia(mes)}`} icone="check" valor={brl(t.recebido)} detalhe={`de ${brl(t.faturado)} faturado`} tom="verde" />
            <Indicador titulo="Em atraso" icone="alerta" valor={brl(t.atraso)} detalhe="Contas vencidas e não pagas" tom={t.atraso > 0 ? "vermelho" : "neutro"} />
            <Indicador titulo="Previsto nos próximos 12 meses" icone="tendencia" valor={brl(t.previsto)} detalhe="Pelos contratos ativos, sem reajustes" tom="violeta" />
          </div>

          <QuadroTabela rotulo="Receita por sistema">
            <thead>
              <tr>
                <th>Sistema</th>
                <th className="text-right" title="Contratos ativos; embaixo, novas e encerradas nos últimos 12 meses">
                  Licenças
                </th>
                <th className="text-right">Receita mensal</th>
                <th className="text-right">Recebido no mês</th>
                <th className="text-right">Em atraso</th>
                <th className="text-right">Previsto 12 meses</th>
                <th>Últimos 12 meses</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const s = sistemaDe(l);
                return (
                  <tr key={l.sistema ?? "sem"}>
                    <td className="celula-titulo min-w-48 max-w-72">
                      {l.nome} {!l.ativo && <Chip tom="neutro">Inativo</Chip>}
                      <span className="block text-xs font-normal text-[var(--texto-suave)]">
                        {[
                          l.descricao,
                          plural(l.clientes, "cliente"),
                          `${participacao(l.mensal, t.mensal).toLocaleString("pt-BR")}% da receita`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td data-rotulo="Licenças" className="num text-right">
                      {l.contratos}
                      {(l.novos > 0 || l.encerrados > 0) && (
                        <span
                          className="block whitespace-nowrap text-xs text-[var(--texto-suave)]"
                          title={`Nos últimos 12 meses: ${plural(l.novos, "nova", "novas")} e ${plural(l.encerrados, "encerrada", "encerradas")}`}
                        >
                          +{l.novos} / −{l.encerrados}
                        </span>
                      )}
                    </td>
                    <td data-rotulo="Receita mensal" className="text-right font-medium">
                      <Valor v={l.mensal} />
                    </td>
                    <td data-rotulo="Recebido no mês" className="text-right">
                      <Valor v={l.recebido} />
                      <span className="block text-xs text-[var(--texto-suave)]">de {brl(l.faturado)}</span>
                    </td>
                    <td data-rotulo="Em atraso" className={`text-right ${l.atraso > 0 ? "text-[var(--perigo)]" : ""}`}>
                      <Valor v={l.atraso} />
                    </td>
                    <td data-rotulo="Previsto 12 meses" className="text-right">
                      <Valor v={l.previsto} />
                    </td>
                    <td data-rotulo="Últimos 12 meses">
                      <Barrinhas valores={l.por_mes} meses={meses} />
                    </td>
                    <td className="celula-acoes whitespace-nowrap text-right">
                      {podeGerir && s && (
                        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                          <button className="btn !min-h-8 !px-3" onClick={() => setJanela({ editar: s })}>
                            <Icone nome="editar" className="h-4 w-4" />
                            Editar
                          </button>
                          <button className="btn !min-h-8 !px-3" onClick={() => trocarAtivo(s)}>
                            <Icone nome={s.ativo ? "cancelar" : "atualizar"} className="h-4 w-4" />
                            {s.ativo ? "Inativar" : "Reativar"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </QuadroTabela>
          {podeGerir && inativos.length > 0 && (
            <p className="text-sm text-[var(--texto-suave)]">
              Inativos sem contrato:{" "}
              {inativos.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ", "}
                  <button className="btn-link" onClick={() => trocarAtivo(s)}>
                    {s.nome} (reativar)
                  </button>
                </span>
              ))}
            </p>
          )}
          <p className="text-xs text-[var(--texto-suave)]">
            Para ligar uma licença a um sistema, abra o contrato a receber em Contratos e escolha o “Sistema vendido”. Contratos sem
            sistema (honorários e outros serviços) aparecem em “Sem sistema”.
          </p>
        </>
      )}
      {janela && cliente && (
        <JanelaSistema
          cliente={cliente.id}
          editar={janela.editar}
          nomeInicial={janela.nome}
          aoFechar={() => setJanela(null)}
          aoSalvar={(_id, m) => {
            setJanela(null);
            mostrar(m);
            consulta.recarregar();
          }}
        />
      )}
      {janelaConfirmar}
    </div>
  );
}

/** Faturado dos 12 meses em barrinhas (o mês mais recente à direita); o valor de cada mês aparece ao passar o mouse. */
function Barrinhas({ valores, meses }: { valores: number[]; meses: string[] }) {
  const max = Math.max(0, ...valores);
  if (!(max > 0)) return <span className="text-xs text-[var(--texto-suave)]">Sem faturamento</span>;
  return (
    <div className="flex h-8 items-end gap-0.5" role="img" aria-label={`Faturado nos últimos 12 meses: ${valores.map((v, i) => `${mesCurto(meses[i] ?? "")} ${brl(v)}`).join(", ")}`}>
      {valores.map((v, i) => (
        <span
          key={meses[i] ?? i}
          title={`${mesCurto(meses[i] ?? "")}: ${brl(v)}`}
          className="w-2 rounded-sm bg-[var(--marca)]"
          style={{ height: `${Math.max(2, Math.round((v / max) * 32))}px`, opacity: i === valores.length - 1 ? 1 : 0.55 }}
        />
      ))}
    </div>
  );
}
