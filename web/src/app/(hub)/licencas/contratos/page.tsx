// Licenças › Contratos: quem contratou quais módulos, por quanto, com que vencimento e reajuste. Cadastro pelo
// assistente; editar, reajustar, encerrar e histórico. Filtros simples, PDF e Excel do que está na tela.
// Abre já filtrado num cliente com ?cliente=<id> (link do painel e da tela de clientes).
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { Cabecalho, EtiquetaBloqueado, useDadosLicencas } from "@/dominios/licencas/componentes/Base";
import { AssistenteContrato, MESES } from "@/dominios/licencas/componentes/AssistenteContrato";
import { EncerrarContrato, HistoricoContrato, ReajustarContrato } from "@/dominios/licencas/componentes/JanelasContrato";
import { contratoVigente, reajustePendente } from "@/dominios/licencas/regras";
import { INDICES } from "@/dominios/licencas/tipos";
import type { Contrato } from "@/dominios/licencas/tipos";
import { plural } from "@/lib/formato/numero";
import { Icone } from "@/components/ui/Icone";
import { MenuAcoes } from "@/components/ui/MenuAcoes";

type FiltroSituacao = "ativos" | "encerrados" | "todos";
type Janela =
  | { tipo: "novo" }
  | { tipo: "editar"; k: Contrato }
  | { tipo: "reajustar"; k: Contrato }
  | { tipo: "encerrar"; k: Contrato }
  | { tipo: "historico"; k: Contrato };

export default function PaginaContratos() {
  return (
    <Suspense>
      <Contratos />
    </Suspense>
  );
}

function Contratos() {
  const { org } = useOrg();
  const dados = useDadosLicencas();
  const { hoje, nomeDoCliente, rotulo, podeGerir, bloqueados } = dados;
  const { aviso, mostrar } = useAviso();
  const params = useSearchParams();
  // filtro de cliente: o que a pessoa escolheu na tela; antes disso, o que veio no endereço (?cliente=)
  const [clienteEscolhido, setCliente] = useState<string | null>(null);
  const cliente = clienteEscolhido ?? params.get("cliente") ?? "";
  const [situacao, setSituacao] = useState<FiltroSituacao>("ativos");
  const [modulo, setModulo] = useState("");
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);

  const d = dados.dados;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (d?.contratos ?? [])
      .filter(
        (k) =>
          (!cliente || k.cliente_id === cliente) &&
          (situacao === "todos" || (situacao === "ativos" ? k.situacao === "ativo" : k.situacao === "encerrado")) &&
          (!modulo || (modulo.startsWith("plano:") ? k.plano_id === modulo.slice(6) : k.produtos.includes(modulo))) &&
          (!q || `${nomeDoCliente(k.cliente_id)} ${rotulo(k)}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => nomeDoCliente(a.cliente_id).localeCompare(nomeDoCliente(b.cliente_id)));
  }, [d, cliente, situacao, modulo, busca, nomeDoCliente, rotulo]);

  const vigentes = lista.filter((k) => contratoVigente(k, hoje));
  const mrr = vigentes.reduce((s, k) => s + k.valor_mensal, 0);
  const tabela = vigentes.reduce((s, k) => s + k.valor_tabela, 0);
  const reajustes = lista.filter((k) => reajustePendente(k, hoje)).length;
  const nomeModulos = (k: Contrato) =>
    k.produtos
      .map((id) => dados.produtos.get(id)?.nome)
      .filter(Boolean)
      .join(", ");
  const reajusteTexto = (k: Contrato) =>
    k.reajuste_indice === "nenhum"
      ? "Sem reajuste"
      : `${INDICES.find((i) => i.id === k.reajuste_indice)?.nome} em ${MESES[(k.reajuste_mes ?? 1) - 1].toLowerCase()}`;
  const situacaoTexto = (k: Contrato) =>
    k.situacao === "encerrado" ? "Encerrado" : k.inicio > hoje ? "Começa depois" : k.fim && k.fim < hoje ? "Prazo acabou" : "Ativo";

  function menu(e: React.MouseEvent<HTMLElement>, j: Janela) {
    e.currentTarget.closest("details")?.removeAttribute("open");
    setJanela(j);
  }
  function fechar(msg?: string) {
    setJanela(null);
    if (msg) {
      mostrar(msg);
      dados.recarregar();
    }
  }

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Assinaturas do Ledgra"
        descricao="Quem assina o Ledgra, com qual plano ou produto, por quanto e com que vencimento."
      >
        <BotoesExportar
          vazio={!lista.length}
          avisar={mostrar}
          montar={() => ({
            titulo: "Contratos de licença",
            subtitulo: `${org.nome} · ${situacao === "ativos" ? "ativos" : situacao === "encerrados" ? "encerrados" : "todos"} · ${plural(lista.length, "contrato")} · ${fmtData(hoje)}`,
            arquivo: nomeArquivo("Contratos-licenca", hoje),
            logoUrl: org.logo_url,
            linhas: lista,
            colunas: [
              { titulo: "Cliente", valor: (k) => nomeDoCliente(k.cliente_id), peso: 2.4, largura: 36 },
              { titulo: "Contratou", valor: (k) => rotulo(k), peso: 2, largura: 28 },
              { titulo: "Plano / produtos", valor: (k) => nomeModulos(k), peso: 2, largura: 32 },
              { titulo: "Valor mensal", valor: (k) => k.valor_mensal, formato: "moeda", peso: 1.2 },
              { titulo: "Tabela", valor: (k) => k.valor_tabela, formato: "moeda", peso: 1.1 },
              { titulo: "Vence dia", valor: (k) => k.dia_vencimento, formato: "numero", peso: 0.7, largura: 10 },
              { titulo: "Início", valor: (k) => fmtData(k.inicio), peso: 1, largura: 12 },
              { titulo: "Fim", valor: (k) => (k.fim ? fmtData(k.fim) : ""), peso: 1, largura: 12 },
              { titulo: "Reajuste", valor: (k) => reajusteTexto(k), peso: 1.4, largura: 20 },
              {
                titulo: "Situação",
                valor: (k) => situacaoTexto(k) + (bloqueados.has(k.cliente_id) ? " · bloqueado" : ""),
                peso: 1.2,
                largura: 20,
              },
            ],
            totais: { "Valor mensal": lista.reduce((s, k) => s + (k.situacao === "ativo" ? k.valor_mensal : 0), 0) },
          })}
        />
        {podeGerir && (
          <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })} disabled={!d}>
            Novo contrato
          </button>
        )}
      </Cabecalho>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}>
            <option value="ativos">Ativos</option>
            <option value="encerrados">Encerrados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="campo">
          <span>Plano ou produto</span>
          <select value={modulo} onChange={(e) => setModulo(e.target.value)}>
            <option value="">Todos</option>
            {(d?.planos ?? []).map((p) => (
              <option key={p.id} value={`plano:${p.id}`}>
                Plano {p.nome}
              </option>
            ))}
            {(d?.produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                Módulo {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, plano ou módulo" />
        </label>
        {cliente && (
          <span className="chip bg-[var(--fundo)] text-neutral-800">
            Só {nomeDoCliente(cliente)}
            <button className="ml-1 inline-flex items-center" onClick={() => setCliente("")} aria-label="Mostrar todos os clientes">
              <Icone nome="fechar" className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {(cliente || busca || modulo || situacao !== "ativos") && (
          <button
            className="btn-link min-h-10 text-sm"
            onClick={() => {
              setCliente("");
              setBusca("");
              setModulo("");
              setSituacao("ativos");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {aviso}
      {dados.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{dados.erro}</p>}

      {!d ? (
        <Carregando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Indicador
              icone="documento"
              titulo="Valendo hoje (neste filtro)"
              valor={brl(mrr)}
              detalhe={`${vigentes.length} contrato(s) por mês`}
              tom="verde"
            />
            <Indicador
              icone="etiqueta"
              titulo="Preço de tabela desses contratos"
              valor={brl(tabela)}
              detalhe={tabela > mrr ? `${brl(tabela - mrr)} em descontos` : "sem descontos"}
            />
            <Indicador
              icone="tendencia"
              titulo="Reajustes a fazer"
              valor={String(reajustes)}
              detalhe="mês do reajuste já chegou"
              tom={reajustes ? "ambar" : "neutro"}
            />
          </div>

          {!lista.length ? (
            <EstadoVazio
              acao={
                podeGerir &&
                !d.contratos.length && (
                  <button className="btn-primario" onClick={() => setJanela({ tipo: "novo" })}>
                    Cadastrar o primeiro contrato
                  </button>
                )
              }
            >
              {d.contratos.length ? "Nenhum contrato neste filtro." : "Nenhum contrato de licença cadastrado ainda."}
            </EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela tabela-acoes-fixas">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contratou</th>
                    <th className="text-right">Valor mensal</th>
                    <th>Vence</th>
                    <th>Vigência</th>
                    <th>Reajuste</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((k) => (
                    <tr key={k.id} className={k.situacao === "encerrado" ? "linha-apagada" : ""}>
                      <td className="min-w-44">
                        <span className="font-medium">{nomeDoCliente(k.cliente_id)}</span>{" "}
                        {bloqueados.has(k.cliente_id) && <EtiquetaBloqueado />}
                        <span className="block text-xs text-neutral-500">{situacaoTexto(k)}</span>
                      </td>
                      <td className="min-w-44">
                        {rotulo(k)}
                        {k.plano_id && <span className="block text-xs text-neutral-500">{nomeModulos(k)}</span>}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {brl(k.valor_mensal)}
                        {k.valor_tabela > k.valor_mensal && (
                          <span className="block text-xs text-neutral-500 line-through">{brl(k.valor_tabela)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">dia {k.dia_vencimento}</td>
                      <td className="whitespace-nowrap text-sm">
                        {fmtData(k.inicio)}
                        <span className="block text-xs text-neutral-500">
                          {k.situacao === "encerrado"
                            ? `encerrado ${fmtData(k.encerrado_em)}`
                            : k.fim
                              ? `até ${fmtData(k.fim)}`
                              : "sem prazo"}
                        </span>
                      </td>
                      <td className="text-sm">
                        {reajusteTexto(k)}
                        {reajustePendente(k, hoje) && <span className="chip ml-1 bg-amber-50 text-amber-900">a fazer</span>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <MenuAcoes rotulo="Ações do contrato" largura={176}>
                          <button
                            className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                            onClick={(e) => menu(e, { tipo: "historico", k })}
                          >
                            Histórico
                          </button>
                          {podeGerir && k.situacao === "ativo" && (
                            <>
                              <button
                                className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                                onClick={(e) => menu(e, { tipo: "editar", k })}
                              >
                                Editar
                              </button>
                              <button
                                className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                                onClick={(e) => menu(e, { tipo: "reajustar", k })}
                              >
                                Reajustar valor
                              </button>
                              <button
                                className="block w-full px-3 py-1.5 text-left text-[var(--perigo)] hover:bg-red-50"
                                onClick={(e) => menu(e, { tipo: "encerrar", k })}
                              >
                                Encerrar contrato
                              </button>
                            </>
                          )}
                        </MenuAcoes>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {d && (janela?.tipo === "novo" || janela?.tipo === "editar") && (
        <AssistenteContrato
          editar={janela.tipo === "editar" ? janela.k : undefined}
          clienteInicial={cliente || undefined}
          produtos={d.produtos}
          planos={d.planos}
          contratos={d.contratos}
          hoje={hoje}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
      {janela?.tipo === "reajustar" && (
        <ReajustarContrato contrato={janela.k} cliente={nomeDoCliente(janela.k.cliente_id)} aoFechar={() => fechar()} aoSalvar={fechar} />
      )}
      {janela?.tipo === "encerrar" && (
        <EncerrarContrato
          contrato={janela.k}
          cliente={nomeDoCliente(janela.k.cliente_id)}
          hoje={hoje}
          aoFechar={() => fechar()}
          aoSalvar={fechar}
        />
      )}
      {janela?.tipo === "historico" && d && (
        <HistoricoContrato
          contrato={janela.k}
          cliente={nomeDoCliente(janela.k.cliente_id)}
          cobrancas={d.cobrancas}
          hoje={hoje}
          aoFechar={() => fechar()}
        />
      )}
    </div>
  );
}
