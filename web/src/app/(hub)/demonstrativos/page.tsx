// Demonstrativos › Balancetes: todos os fechamentos importados, com a situação (rascunho/publicado), os números
// principais e o que falta conferir. Molde de lista (docs/08-convencoes.md 8.3.1).
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { intervaloDoPeriodo } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";
import { reprocessar } from "@/dominios/demonstrativos/repositorio";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice, plural } from "@/lib/formato/numero";
import { mesAno } from "@/lib/formato/datas";
import { nomeCliente } from "@/dominios/clientes/nome";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros, MaisFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { PERIODOS } from "@/lib/periodo";

export default function PaginaDemonstrativos() {
  return <Lista />;
}

type Situacao = "" | "rascunho" | "publicado" | "pendente";
const SITUACOES: Record<Exclude<Situacao, "">, string> = {
  rascunho: "A revisar e publicar",
  publicado: "Publicados",
  pendente: "Com conferência pendente",
};
type Alerta = "" | "alto" | "algum" | "nenhum";
const ALERTAS: Record<Exclude<Alerta, "">, string> = {
  alto: "Com alerta alto",
  algum: "Com alguma fragilidade",
  nenhum: "Sem fragilidades",
};

const pendencias = (b: BalanceteReg) => (b.conferencias ?? []).filter((x) => !x.ok).length;
const altos = (b: BalanceteReg) => (b.alertas ?? []).filter((a) => a.nivel === "alto").length;

function Lista() {
  const { org, eu, clientePorId, pode } = useOrg();
  const router = useRouter();
  const { aviso, mostrar } = useAviso();
  const [janela, confirmar] = useConfirmar();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("");
  const [alerta, setAlerta] = useState<Alerta>("");
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [progresso, setProgresso] = useState<string | null>(null);
  const podeOperar = pode("demonstrativos", "operar");

  const consulta = useConsulta(
    useCallback(
      () =>
        lerTudo<BalanceteReg>((de, ate) =>
          supabase()
            .from("portal_balancetes")
            .select(
              "id,org_id,cliente_id,competencia,status,arquivo_nome,resumo,indices,alertas,conferencias,comentario,importado_em,publicado_em",
            )
            .eq("org_id", org.id)
            .order("competencia", { ascending: false })
            .order("id")
            .range(de, ate),
        ),
      [org.id],
    ),
  );
  const lista = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const hoje = hojeISO(org.fuso);
  const intervalo = intervaloDoPeriodo(periodo, hoje, de, ate);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((b) => {
      if (situacao === "rascunho" || situacao === "publicado") {
        if (b.status !== situacao) return false;
      } else if (situacao === "pendente" && !pendencias(b)) return false;
      if (alerta === "alto" && !altos(b)) return false;
      if (alerta === "algum" && !b.alertas?.length) return false;
      if (alerta === "nenhum" && b.alertas?.length) return false;
      if (intervalo.de && b.competencia < intervalo.de.slice(0, 7) + "-01") return false;
      if (intervalo.ate && b.competencia > intervalo.ate) return false;
      if (q) {
        const c = clientePorId(b.cliente_id);
        if (!`${c?.razao_social} ${c?.nome_fantasia} ${c?.codigo_dominio}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [lista, busca, situacao, alerta, intervalo.de, intervalo.ate, clientePorId]);

  const rascunhos = lista.filter((b) => b.status === "rascunho").length;
  const publicados = lista.filter((b) => b.status === "publicado").length;
  const comPendencia = lista.filter((b) => pendencias(b) > 0).length;

  async function reprocessarRascunhos() {
    const alvo = [...lista].filter((b) => b.status === "rascunho").sort((a, b) => a.competencia.localeCompare(b.competencia));
    if (!alvo.length) return;
    const sim = await confirmar({
      titulo: `Reprocessar ${alvo.length} balancete(s) em rascunho?`,
      descricao: "Relê as contas gravadas com as regras atuais do leitor (sinal, grupos e cálculos). Os publicados não mudam.",
      botao: "Reprocessar",
    });
    if (!sim) return;
    for (let i = 0; i < alvo.length; i++) {
      const c = clientePorId(alvo[i].cliente_id);
      setProgresso(`Reprocessando ${i + 1} de ${alvo.length}: ${nomeCliente(c)} ${mesAno(alvo[i].competencia)}`);
      try {
        await reprocessar(alvo[i].id);
      } catch (e) {
        mostrar(traduzirErro(e), "erro");
        break;
      }
    }
    setProgresso(null);
    consulta.recarregar();
  }

  const limpar = () => {
    setBusca("");
    setSituacao("");
    setAlerta("");
    setPeriodo("tudo");
    setDe("");
    setAte("");
  };
  const ativos: FiltroAtivo[] = [
    ...(busca.trim() ? [{ id: "b", rotulo: `Empresa: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
    ...(situacao ? [{ id: "s", rotulo: `Situação: ${SITUACOES[situacao]}`, aoTirar: () => setSituacao("") }] : []),
    ...(periodo !== "tudo"
      ? [{ id: "p", rotulo: `Competência: ${PERIODOS.find((p) => p.id === periodo)?.nome}`, aoTirar: () => setPeriodo("tudo") }]
      : []),
    ...(alerta ? [{ id: "a", rotulo: ALERTAS[alerta], aoTirar: () => setAlerta("") }] : []),
  ];
  const alternar = (s: Situacao) => setSituacao((x) => (x === s ? "" : s));
  const nome = (b: BalanceteReg) => nomeCliente(clientePorId(b.cliente_id), "—");
  const abrir = (b: BalanceteReg) => router.push(`/demonstrativos/${b.id}`);

  return (
    <div className="space-y-4">
      {janela}
      <CabecalhoPagina
        titulo="Balancetes e demonstrativos"
        descricao="O fechamento de cada empresa: confira, publique para o cliente ver no Portal e acompanhe os sinais de alerta."
        acoes={
          <>
            <BotoesExportar
              vazio={!filtrada.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Balancetes e demonstrativos",
                subtitulo: `${org.nome} · ${plural(filtrada.length, "balancete")}`,
                arquivo: nomeArquivo("Balancetes", hoje),
                logoUrl: org.logo_url,
                linhas: filtrada,
                colunas: [
                  { titulo: "Empresa", valor: nome, peso: 2.6, largura: 38 },
                  { titulo: "Competência", valor: (b: BalanceteReg) => mesAno(b.competencia), peso: 1, largura: 12 },
                  {
                    titulo: "Situação",
                    valor: (b: BalanceteReg) => (b.status === "publicado" ? "Publicado" : "Rascunho"),
                    peso: 1,
                    largura: 12,
                  },
                  {
                    titulo: "Receita do mês",
                    valor: (b: BalanceteReg) => b.resumo?.mes?.receita_bruta ?? null,
                    formato: "moeda",
                    peso: 1.3,
                    largura: 16,
                  },
                  {
                    titulo: "Resultado no ano",
                    valor: (b: BalanceteReg) => b.resumo?.ano?.lucro_liquido ?? null,
                    formato: "moeda",
                    peso: 1.3,
                    largura: 16,
                    alerta: (b: BalanceteReg) => (b.resumo?.ano?.lucro_liquido ?? 0) < 0,
                  },
                  {
                    titulo: "Liquidez corrente",
                    valor: (b: BalanceteReg) => fmtIndice(b.indices?.liquidez_corrente, "x"),
                    peso: 1,
                    largura: 12,
                  },
                  { titulo: "Fragilidades", valor: (b: BalanceteReg) => b.alertas?.length ?? 0, formato: "numero", peso: 0.9, largura: 12 },
                  {
                    titulo: "Conferências pendentes",
                    valor: pendencias,
                    formato: "numero",
                    peso: 1,
                    largura: 12,
                    alerta: (b: BalanceteReg) => pendencias(b) > 0,
                  },
                ],
              })}
            />
            {podeOperar && rascunhos > 0 && (
              <button
                className="btn"
                onClick={reprocessarRascunhos}
                disabled={!!progresso}
                title="Relê as contas gravadas com as regras atuais: sinal, grupos e cálculos"
              >
                <Icone nome="atualizar" className="h-4 w-4" />
                Reprocessar rascunhos
              </button>
            )}
            {eu.papel === "admin" && (
              <Link href="/demonstrativos/certificado" className="btn" title="Certificado digital usado para assinar os PDFs">
                <Icone nome="escudo" className="h-4 w-4" />
                Certificado digital
              </Link>
            )}
            {podeOperar && (
              <Link href="/demonstrativos/importar" className="btn-primario">
                <Icone nome="importar" className="h-4 w-4" />
                Importar balancete
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="A revisar e publicar"
          icone="documento"
          tom={rascunhos ? "ambar" : "neutro"}
          valor={String(rascunhos)}
          detalhe="o cliente ainda não vê"
          ativo={situacao === "rascunho"}
          aoClicar={() => alternar("rascunho")}
        />
        <Indicador
          titulo="Publicados"
          icone="check"
          tom="verde"
          valor={String(publicados)}
          detalhe="visíveis no Portal do Cliente"
          ativo={situacao === "publicado"}
          aoClicar={() => alternar("publicado")}
        />
        <Indicador
          titulo="Com conferência pendente"
          icone="alerta"
          tom={comPendencia ? "vermelho" : "neutro"}
          valor={String(comPendencia)}
          detalhe="ativo ≠ passivo, saldo invertido…"
          ativo={situacao === "pendente"}
          aoClicar={() => alternar("pendente")}
        />
      </div>

      <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
        <label className="campo campo-largo">
          <span>Empresa</span>
          <input placeholder="Nome ou código do Domínio" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <FiltroPeriodo
          rotulo="Competência"
          periodo={periodo}
          de={de}
          ate={ate}
          aoMudar={(v) => {
            if (v.periodo) setPeriodo(v.periodo);
            if (v.de !== undefined) setDe(v.de);
            if (v.ate !== undefined) setAte(v.ate);
          }}
        />
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            <option value="">Todas</option>
            {Object.entries(SITUACOES).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <MaisFiltros emUso={alerta ? 1 : 0}>
          <label className="campo">
            <span>Fragilidades</span>
            <select value={alerta} onChange={(e) => setAlerta(e.target.value as Alerta)}>
              <option value="">Todas</option>
              {Object.entries(ALERTAS).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </MaisFiltros>
      </CartaoFiltros>

      {aviso}
      {progresso && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="atualizar" className="h-4 w-4 animate-spin" />
          {progresso}
        </p>
      )}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={8} />
      ) : !lista.length ? (
        <EstadoVazio
          icone="grafico"
          titulo="Nenhum balancete ainda"
          acao={
            podeOperar && (
              <Link href="/demonstrativos/importar" className="btn-primario">
                <Icone nome="importar" className="h-4 w-4" />
                Importar o primeiro balancete
              </Link>
            )
          }
        >
          Exporte o balancete do Domínio em Excel e importe aqui. O HUB monta o balanço, a DRE, o fluxo de caixa, os índices e um rascunho
          de parecer.
        </EstadoVazio>
      ) : !filtrada.length ? (
        <EstadoVazio
          icone="filtro"
          titulo="Nenhum balancete neste filtro"
          acao={
            <button className="btn" onClick={limpar}>
              Limpar filtros
            </button>
          }
        >
          Troque a empresa, a competência ou a situação, ou limpe os filtros para ver todos.
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Balancetes" rodape={`${filtrada.length} de ${lista.length} balancete(s)`}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Competência</th>
              <th>Situação</th>
              <th className="text-right">Receita do mês</th>
              <th className="text-right">Resultado no ano</th>
              <th className="text-right" title="Quanto há em caixa e a receber para cada R$ 1 de dívida de curto prazo">
                Liquidez corrente
              </th>
              <th>Fragilidades</th>
              <th>Conferências</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrada.map((b) => {
              const falhas = pendencias(b);
              const alto = altos(b);
              return (
                <tr key={b.id} className="cursor-pointer" onClick={() => abrir(b)}>
                  <td className="celula-titulo font-medium">{nome(b)}</td>
                  <td data-rotulo="Competência" className="whitespace-nowrap">
                    {mesAno(b.competencia)}
                  </td>
                  <td data-rotulo="Situação">
                    {b.status === "publicado" ? <Chip tom="verde">Publicado</Chip> : <Chip tom="ambar">Rascunho</Chip>}
                  </td>
                  <td data-rotulo="Receita do mês" className="text-right">
                    <ValorInteiro v={b.resumo?.mes?.receita_bruta ?? 0} />
                  </td>
                  <td data-rotulo="Resultado no ano" className="text-right">
                    <ValorInteiro v={b.resumo?.ano?.lucro_liquido ?? 0} />
                  </td>
                  <td
                    data-rotulo="Liquidez corrente"
                    className={`text-right tabular-nums ${(b.indices?.liquidez_corrente ?? 1) < 1 ? "text-[var(--perigo)]" : ""}`}
                  >
                    {fmtIndice(b.indices?.liquidez_corrente, "x")}
                  </td>
                  <td data-rotulo="Fragilidades">
                    {b.alertas?.length ? (
                      <Chip tom={alto ? "vermelho" : "ambar"}>
                        {b.alertas.length}
                        {alto ? ` · ${alto} alto` : ""}
                      </Chip>
                    ) : (
                      <Chip tom="neutro">nenhuma</Chip>
                    )}
                  </td>
                  <td data-rotulo="Conferências">
                    {falhas ? <Chip tom="vermelho">{falhas} pendente(s)</Chip> : <Chip tom="verde">ok</Chip>}
                  </td>
                  <td className="celula-acoes text-right">
                    <Link href={`/demonstrativos/${b.id}`} className="btn !min-h-8 !px-3" onClick={(e) => e.stopPropagation()}>
                      <Icone nome="olho" className="h-4 w-4" />
                      Abrir
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </QuadroTabela>
      )}
    </div>
  );
}

/** Valor em reais sem centavos (os demonstrativos mostram reais inteiros); negativo em vermelho. */
function ValorInteiro({ v }: { v: number }) {
  return <span className={`num whitespace-nowrap ${v < 0 ? "text-[var(--perigo)]" : ""}`}>{brl(v, { centavos: false })}</span>;
}
