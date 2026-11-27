// Auditoria fiscal › Regras de validação (125, pedido do Edvaldo, 27/11/2026): regras próprias e utilizações do ERP que o
// Ledgra Auditor usa ao conferir o relatório do SAP. A biblioteca é UMA só e fica no Ledgra: o que muda aqui aparece lá
// e vice-versa. Lê e grava pela Função ledgra-regras (ver = Auditoria fiscal › ver; gravar = operar e equipe MDC no Ledgra).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { hojeISO } from "@/lib/datas";
import { plural } from "@/lib/formato/numero";
import { formatarDocumento } from "@/lib/documento";
import { nomeCliente } from "@/dominios/clientes/nome";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import {
  filtrarRegras,
  filtrarUtilizacoes,
  juntarCodigos,
  nomeGravidade,
  nomeNatureza,
  nomeSentido,
  textoCondicao,
  tomGravidade,
  type FiltroRegras,
  type RegraPropria,
  type RespostaRegras,
  type Utilizacao,
} from "@/dominios/auditoriaFiscal/regras";
import { Abas } from "@/components/ui/Abas";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { JanelaRegra } from "./_componentes/JanelaRegra";
import { JanelaUtilizacao } from "./_componentes/JanelaUtilizacao";

type Aba = "regras" | "utilizacoes";
type Janela =
  | { tipo: "regra"; item: RegraPropria | null }
  | { tipo: "utilizacao"; item: Utilizacao | null }
  | { tipo: "inativar"; qual: "regra" | "utilizacao"; id: string; nome: string }
  | null;

export default function PaginaRegrasValidacao() {
  const { org, clientes, pode } = useOrg();
  const { aviso, mostrar } = useAviso();
  const podeOperar = pode("auditoria_fiscal", "operar");
  const empresas = useMemo(() => clientes.filter((c) => c.cnpj && c.ativo), [clientes]);
  const [clienteId, setClienteId] = useState("");
  const cliente = empresas.find((c) => c.id === clienteId) ?? null;
  const cnpj = cliente?.cnpj ?? "";
  const [aba, setAba] = useState<Aba>("regras");
  const [filtro, setFiltro] = useState<FiltroRegras>({ busca: "", situacao: "ativas" });
  const [janela, setJanela] = useState<Janela>(null);

  const consulta = useConsulta(
    useCallback(
      async () => (cnpj ? chamarFuncao<RespostaRegras>("ledgra-regras", { corpo: { org: org.id, cnpj, acao: "listar" } }) : null),
      [org.id, cnpj],
    ),
  );
  const d = consulta.dados;
  const regras = useMemo(() => (d ? filtrarRegras(d.regras, filtro, d) : []), [d, filtro]);
  const utilizacoes = useMemo(() => (d ? filtrarUtilizacoes(d.utilizacoes, filtro) : []), [d, filtro]);
  const podeGravar = podeOperar && !!d?.pode.gravar;

  const pedir = async (acao: string, dados: Record<string, unknown>) => {
    await chamarFuncao("ledgra-regras", { corpo: { org: org.id, cnpj, acao, dados } });
    consulta.recarregar();
  };
  const reativar = async (qual: "regra" | "utilizacao", id: string) => {
    try {
      await pedir(`situacao_${qual}`, { id, ativo: true, motivo: null });
      mostrar(qual === "regra" ? "Regra reativada." : "Utilização reativada.");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : String(e), "erro");
    }
  };

  const escopo = (empresaId: string | null) => (empresaId ? "Esta empresa" : "Todas as empresas");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Regras de validação"
        descricao="Regras próprias e utilizações do SAP que o Ledgra Auditor usa ao conferir o relatório. A lista é a mesma do Ledgra: o que você muda aqui vale lá também."
        acoes={
          d &&
          (aba === "regras" ? (
            <BotoesExportar
              vazio={!regras.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Regras próprias da auditoria do SAP",
                subtitulo: `${d.empresa} · ${plural(regras.length, "regra")}`,
                arquivo: nomeArquivo("Regras-proprias-SAP", hojeISO(org.fuso)),
                logoUrl: org.logo_url,
                linhas: regras,
                colunas: [
                  { titulo: "Código", valor: (r: RegraPropria) => r.codigo, peso: 0.7, largura: 8 },
                  { titulo: "Regra", valor: (r: RegraPropria) => r.nome, peso: 2, largura: 32 },
                  {
                    titulo: "Quando",
                    valor: (r: RegraPropria) => r.condicoes.map((c) => textoCondicao(c, d)).join(" e "),
                    peso: 3,
                    largura: 50,
                  },
                  { titulo: "Gravidade", valor: (r: RegraPropria) => nomeGravidade(r.gravidade), peso: 1, largura: 14 },
                  { titulo: "Ajuste sugerido", valor: (r: RegraPropria) => r.ajuste, peso: 2.4, largura: 40 },
                  { titulo: "Fundamento", valor: (r: RegraPropria) => r.fundamento ?? "", peso: 1.4, largura: 24 },
                  { titulo: "Vale para", valor: (r: RegraPropria) => escopo(r.empresa_id), peso: 1, largura: 16 },
                  {
                    titulo: "Situação",
                    valor: (r: RegraPropria) => (r.ativo ? "Ativa" : `Inativa${r.motivo ? `: ${r.motivo}` : ""}`),
                    peso: 1.2,
                    largura: 20,
                  },
                ],
              })}
            />
          ) : (
            <BotoesExportar
              vazio={!utilizacoes.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Utilizações do SAP",
                subtitulo: `${d.empresa} · ${plural(utilizacoes.length, "utilização", "utilizações")}`,
                arquivo: nomeArquivo("Utilizacoes-SAP", hojeISO(org.fuso)),
                logoUrl: org.logo_url,
                linhas: utilizacoes,
                colunas: [
                  { titulo: "Utilização", valor: (u: Utilizacao) => u.utilizacao, peso: 2, largura: 30 },
                  { titulo: "Sentido", valor: (u: Utilizacao) => nomeSentido(u.sentido), peso: 0.8, largura: 10 },
                  { titulo: "Natureza", valor: (u: Utilizacao) => nomeNatureza(u.natureza), peso: 0.9, largura: 12 },
                  { titulo: "CFOPs", valor: (u: Utilizacao) => juntarCodigos(u.cfops), peso: 1.6, largura: 24 },
                  { titulo: "CST ICMS", valor: (u: Utilizacao) => juntarCodigos(u.cst_icms), peso: 1, largura: 14 },
                  { titulo: "Crédito ICMS", valor: (u: Utilizacao) => (u.credito_icms ? "Sim" : "Não"), peso: 0.8, largura: 10 },
                  { titulo: "CST IPI", valor: (u: Utilizacao) => juntarCodigos(u.cst_ipi), peso: 1, largura: 14 },
                  { titulo: "CST PIS/COFINS Real", valor: (u: Utilizacao) => juntarCodigos(u.cst_pis_real), peso: 1, largura: 14 },
                  {
                    titulo: "CST PIS/COFINS Presumido",
                    valor: (u: Utilizacao) => juntarCodigos(u.cst_pis_presumido),
                    peso: 1,
                    largura: 14,
                  },
                  { titulo: "Vale para", valor: (u: Utilizacao) => escopo(u.empresa_id), peso: 1, largura: 16 },
                  { titulo: "Situação", valor: (u: Utilizacao) => (u.ativo ? "Ativa" : "Inativa"), peso: 0.8, largura: 10 },
                ],
              })}
            />
          ))
        }
      />
      {aviso}

      <section className="cartao grid gap-3 p-4 md:grid-cols-[2fr_2fr_1fr]" aria-label="Empresa e filtros">
        <label className="campo">
          <span>Empresa</span>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Escolha a empresa…</option>
            {empresas.map((c) => (
              <option key={c.id} value={c.id}>
                {nomeCliente(c)} · {formatarDocumento(c.cnpj ?? "")}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Buscar</span>
          <input
            value={filtro.busca}
            onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
            placeholder={aba === "regras" ? "Nome, CFOP, ajuste…" : "Utilização, CFOP…"}
            disabled={!d}
          />
        </label>
        <label className="campo">
          <span>Situação</span>
          <select
            value={filtro.situacao}
            onChange={(e) => setFiltro((f) => ({ ...f, situacao: e.target.value as FiltroRegras["situacao"] }))}
            disabled={!d}
          >
            <option value="ativas">Ativas</option>
            <option value="inativas">Inativas</option>
            <option value="todas">Todas</option>
          </select>
        </label>
      </section>

      {!cnpj ? (
        <EstadoVazio icone="filtro" titulo="Escolha a empresa">
          As regras são do Ledgra Auditor e valem para a empresa escolhida (e as marcadas para todas as empresas).
        </EstadoVazio>
      ) : consulta.carregando && !d ? (
        <Esqueleto linhas={5} />
      ) : consulta.erro ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      ) : d ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Abas<Aba>
              rotulo="Tipo de regra"
              valor={aba}
              aoMudar={setAba}
              itens={[
                { id: "regras", nome: `Regras próprias (${d.regras.length})` },
                { id: "utilizacoes", nome: `Utilizações do SAP (${d.utilizacoes.length})` },
              ]}
            />
            {podeGravar && (
              <button
                className="btn-primario"
                onClick={() => setJanela(aba === "regras" ? { tipo: "regra", item: null } : { tipo: "utilizacao", item: null })}
              >
                <Icone nome="mais" className="h-4 w-4" />
                {aba === "regras" ? "Nova regra" : "Nova utilização"}
              </button>
            )}
          </div>
          {!podeGravar && (
            <p className="text-sm text-slate-600">
              Você só consulta. Para criar ou alterar regras é preciso Auditoria fiscal › operar aqui no HUB e ser da equipe MDC no Ledgra.
            </p>
          )}

          {aba === "regras" ? (
            regras.length ? (
              <QuadroTabela rotulo="Regras próprias" acoesFixas>
                <thead>
                  <tr>
                    <th>Regra</th>
                    <th>Quando</th>
                    <th>Gravidade</th>
                    <th>Ajuste sugerido</th>
                    <th>Vale para</th>
                    <th>Situação</th>
                    {podeGravar && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {regras.map((r) => (
                    <tr key={r.id}>
                      <td className="celula-titulo" data-rotulo="Regra">
                        <span className="font-mono text-xs text-slate-500">{r.codigo}</span> {r.nome}
                      </td>
                      <td data-rotulo="Quando">{r.condicoes.map((c) => textoCondicao(c, d)).join(" e ")}</td>
                      <td data-rotulo="Gravidade">
                        <Chip tom={tomGravidade(r.gravidade)}>{nomeGravidade(r.gravidade)}</Chip>
                      </td>
                      <td data-rotulo="Ajuste sugerido">
                        {r.ajuste}
                        {r.fundamento && <span className="block text-xs text-slate-500">{r.fundamento}</span>}
                      </td>
                      <td data-rotulo="Vale para">{escopo(r.empresa_id)}</td>
                      <td data-rotulo="Situação">
                        {r.ativo ? <Chip tom="verde">Ativa</Chip> : <Chip tom="neutro">Inativa</Chip>}
                        {!r.ativo && r.motivo && <span className="block text-xs text-slate-500">{r.motivo}</span>}
                      </td>
                      {podeGravar && (
                        <td className="celula-acoes" data-rotulo="Ações">
                          {r.pode_gravar !== false && (
                            <div className="flex flex-wrap gap-1">
                              <button className="btn" onClick={() => setJanela({ tipo: "regra", item: r })}>
                                <Icone nome="editar" className="h-4 w-4" />
                                Editar
                              </button>
                              {r.ativo ? (
                                <button
                                  className="btn text-red-700"
                                  onClick={() => setJanela({ tipo: "inativar", qual: "regra", id: r.id, nome: `${r.codigo} · ${r.nome}` })}
                                >
                                  <Icone nome="cancelar" className="h-4 w-4" />
                                  Inativar
                                </button>
                              ) : (
                                <button className="btn" onClick={() => reativar("regra", r.id)}>
                                  <Icone nome="atualizar" className="h-4 w-4" />
                                  Reativar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </QuadroTabela>
            ) : (
              <EstadoVazio icone="escudo" titulo="Nenhuma regra própria">
                {podeGravar
                  ? "Clique em “Nova regra” para criar a primeira. Ela passa a valer na próxima auditoria."
                  : "Ainda não há regras próprias para esta empresa."}
              </EstadoVazio>
            )
          ) : utilizacoes.length ? (
            <QuadroTabela rotulo="Utilizações do SAP" acoesFixas>
              <thead>
                <tr>
                  <th>Utilização</th>
                  <th>Natureza</th>
                  <th>CFOPs</th>
                  <th>CST ICMS / crédito</th>
                  <th>CST PIS/COFINS (Real · Presumido)</th>
                  <th>Vale para</th>
                  <th>Situação</th>
                  {podeGravar && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {utilizacoes.map((u) => (
                  <tr key={u.id}>
                    <td className="celula-titulo" data-rotulo="Utilização">
                      {u.utilizacao}
                      <span className="block text-xs text-slate-500">{nomeSentido(u.sentido)}</span>
                    </td>
                    <td data-rotulo="Natureza">{nomeNatureza(u.natureza)}</td>
                    <td data-rotulo="CFOPs">{juntarCodigos(u.cfops) || "—"}</td>
                    <td data-rotulo="CST ICMS / crédito">
                      {juntarCodigos(u.cst_icms) || "—"} · {u.credito_icms ? "com crédito" : "sem crédito"}
                    </td>
                    <td data-rotulo="CST PIS/COFINS">
                      {juntarCodigos(u.cst_pis_real) || "—"} · {juntarCodigos(u.cst_pis_presumido) || "—"}
                    </td>
                    <td data-rotulo="Vale para">{escopo(u.empresa_id)}</td>
                    <td data-rotulo="Situação">{u.ativo ? <Chip tom="verde">Ativa</Chip> : <Chip tom="neutro">Inativa</Chip>}</td>
                    {podeGravar && (
                      <td className="celula-acoes" data-rotulo="Ações">
                        {u.pode_gravar !== false && (
                          <div className="flex flex-wrap gap-1">
                            <button className="btn" onClick={() => setJanela({ tipo: "utilizacao", item: u })}>
                              <Icone nome="editar" className="h-4 w-4" />
                              Editar
                            </button>
                            {u.ativo ? (
                              <button
                                className="btn text-red-700"
                                onClick={() =>
                                  setJanela({
                                    tipo: "inativar",
                                    qual: "utilizacao",
                                    id: u.id,
                                    nome: `${u.utilizacao} (${nomeSentido(u.sentido)})`,
                                  })
                                }
                              >
                                <Icone nome="cancelar" className="h-4 w-4" />
                                Inativar
                              </button>
                            ) : (
                              <button className="btn" onClick={() => reativar("utilizacao", u.id)}>
                                <Icone nome="atualizar" className="h-4 w-4" />
                                Reativar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </QuadroTabela>
          ) : (
            <EstadoVazio icone="lista" titulo="Nenhuma utilização cadastrada">
              {podeGravar
                ? "Clique em “Nova utilização” para dizer quais CFOPs e CSTs cada utilização do SAP aceita. A planilha aprovada inteira se importa pelo Ledgra (Utilizações do ERP)."
                : "Ainda não há utilizações cadastradas para esta empresa."}
            </EstadoVazio>
          )}
        </>
      ) : null}

      {janela?.tipo === "regra" && d && (
        <JanelaRegra
          inicial={janela.item}
          catalogo={d}
          podeTodas={d.pode.todas}
          aoFechar={() => setJanela(null)}
          aoSalvar={async (dados) => {
            await pedir("salvar_regra", dados);
            setJanela(null);
            mostrar(janela.item ? "Regra alterada. Vale no Ledgra e aqui." : "Regra criada. Vale na próxima auditoria.");
          }}
        />
      )}
      {janela?.tipo === "utilizacao" && d && (
        <JanelaUtilizacao
          inicial={janela.item}
          podeTodas={d.pode.todas}
          aoFechar={() => setJanela(null)}
          aoSalvar={async (dados) => {
            await pedir("salvar_utilizacao", dados);
            setJanela(null);
            mostrar(janela.item ? "Utilização alterada." : "Utilização criada. Vale na próxima auditoria.");
          }}
        />
      )}
      {janela?.tipo === "inativar" && (
        <JanelaMotivo
          titulo={janela.qual === "regra" ? "Inativar regra" : "Inativar utilização"}
          descricao={<>{janela.nome} deixa de valer nas próximas auditorias. Escreva o motivo (mínimo 5 letras).</>}
          botao="Inativar"
          aoFechar={() => setJanela(null)}
          aoConfirmar={async (motivo) => {
            if (motivo.length < 5) throw new Error("Explique o motivo (mínimo 5 letras).");
            await pedir(`situacao_${janela.qual}`, { id: janela.id, ativo: false, motivo });
            setJanela(null);
            mostrar(janela.qual === "regra" ? "Regra inativada." : "Utilização inativada.");
          }}
        />
      )}
    </div>
  );
}
