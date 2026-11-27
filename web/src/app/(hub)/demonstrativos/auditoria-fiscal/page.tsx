// Demonstrativos › Auditoria fiscal (SAP) (migração 122): a equipe envia o relatório fiscal de entradas e saídas
// exportado do SAP; o Ledgra Auditor confere (CFOP, CST, NCM, utilização × CFOP × impostos, XML do fornecedor) e o
// resultado volta para cá, com o link da conferência completa no Ledgra. Função Edge: ledgra-auditoria.
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO, inicioDoDiaUtc } from "@/lib/datas";
import { intervaloDoPeriodo, type Periodo } from "@/lib/periodo";
import { brl } from "@/lib/formato/moeda";
import { plural } from "@/lib/formato/numero";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { formatarDocumento, soDigitos } from "@/lib/documento";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";
import { nomeCliente } from "@/dominios/clientes/nome";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import {
  arquivoAceito,
  filtrarAchados,
  NOME_GRAVIDADE,
  REGIMES,
  regimeDoCadastro,
  TOM_GRAVIDADE,
  type AchadoAuditoria,
  type AuditoriaErp,
  type Gravidade,
  type RegimeAuditoria,
} from "@/dominios/demonstrativos/auditoriaFiscal";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { FiltroPeriodo } from "@/components/ui/FiltroPeriodo";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";

export default function PaginaAuditoriaFiscal() {
  return <AuditoriaFiscal />;
}

type Resumida = Omit<AuditoriaErp, "achados">;

function AuditoriaFiscal() {
  const { org, clientes, clientePorId, pode } = useOrg();
  const { aviso, mostrar } = useAviso();
  const podeAuditar = pode("demonstrativos", "operar");

  // histórico
  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const intervalo = intervaloDoPeriodo(periodo, hojeISO(org.fuso), de, ate);
  const consulta = useConsulta(
    useCallback(
      () =>
        lerTudo<Resumida>((i, f) => {
          let q = supabase()
            .from("auditorias_erp")
            .select("id,org_id,cliente_id,cnpj,empresa,arquivo_nome,regime,ledgra_id,link,linhas,fora,resumo,por_regra,criado_em")
            .eq("org_id", org.id);
          if (intervalo.de) q = q.gte("criado_em", inicioDoDiaUtc(intervalo.de, org.fuso));
          if (intervalo.ate) q = q.lt("criado_em", inicioDoDiaUtc(somaDia(intervalo.ate), org.fuso));
          return q.order("criado_em", { ascending: false }).order("id").range(i, f);
        }),
      [org.id, org.fuso, intervalo.de, intervalo.ate],
    ),
  );
  const nomeDa = useCallback(
    (a: Resumida) => a.empresa || nomeCliente(clientePorId(a.cliente_id), formatarDocumento(a.cnpj)),
    [clientePorId],
  );
  const historico = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (consulta.dados ?? []).filter(
      (a) => !q || `${nomeDa(a)} ${a.cnpj} ${a.arquivo_nome}`.toLowerCase().includes(q.replace(/\D/g, "") || q),
    );
  }, [consulta.dados, busca, nomeDa]);

  const limpar = () => {
    setPeriodo("90");
    setDe("");
    setAte("");
    setBusca("");
  };
  const ativos: FiltroAtivo[] = [
    ...(busca.trim() ? [{ id: "b", rotulo: `Busca: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Auditoria fiscal (SAP)"
        descricao="Envie o relatório de entradas e saídas do SAP: o Ledgra Auditor confere CFOP, CST, NCM, impostos e o XML do fornecedor e mostra o que ajustar."
        acoes={
          <BotoesExportar
            vazio={!historico.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Auditorias fiscais do SAP",
              subtitulo: `${org.nome} · ${plural(historico.length, "auditoria")}`,
              arquivo: nomeArquivo("Auditorias-fiscais-SAP", hojeISO(org.fuso)),
              logoUrl: org.logo_url,
              linhas: historico,
              colunas: [
                { titulo: "Data", valor: (a: Resumida) => fmtDataHora(a.criado_em), peso: 1.2, largura: 18 },
                { titulo: "Empresa", valor: nomeDa, peso: 2.4, largura: 36 },
                { titulo: "CNPJ", valor: (a: Resumida) => formatarDocumento(a.cnpj), peso: 1.4, largura: 20 },
                { titulo: "Arquivo", valor: (a: Resumida) => a.arquivo_nome, peso: 2, largura: 32 },
                { titulo: "Linhas", valor: (a: Resumida) => a.linhas, formato: "numero", peso: 0.8, largura: 10 },
                { titulo: "Erros", valor: (a: Resumida) => a.resumo.erros ?? 0, formato: "numero", peso: 0.8, largura: 10 },
                { titulo: "Atenção", valor: (a: Resumida) => a.resumo.avisos ?? 0, formato: "numero", peso: 0.8, largura: 10 },
                { titulo: "A recolher", valor: (a: Resumida) => a.resumo.aRecolher ?? 0, formato: "moeda", peso: 1.1, largura: 14 },
                { titulo: "Link no Ledgra", valor: (a: Resumida) => a.link, peso: 2.4, largura: 50 },
              ],
            })}
          />
        }
      />
      {aviso}

      {podeAuditar && (
        <NovaAuditoria
          clientes={clientes}
          orgId={org.id}
          aoTerminar={(id) => {
            consulta.recarregar();
            setAberta(id);
          }}
          avisar={mostrar}
        />
      )}

      {aberta && <Resultado id={aberta} aoFechar={() => setAberta(null)} />}

      <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
        <FiltroPeriodo
          periodo={periodo}
          de={de}
          ate={ate}
          aoMudar={(v) => {
            if (v.periodo) setPeriodo(v.periodo);
            if (v.de !== undefined) setDe(v.de);
            if (v.ate !== undefined) setAte(v.ate);
          }}
        />
        <label className="campo campo-largo">
          <span>Empresa, CNPJ ou arquivo</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: ENGEX" />
        </label>
      </CartaoFiltros>

      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={5} />
      ) : !historico.length ? (
        <EstadoVazio icone="escudo" titulo={consulta.dados?.length ? "Nenhuma auditoria nesta busca" : "Nenhuma auditoria neste período"}>
          {podeAuditar
            ? "Escolha a empresa, o arquivo exportado do SAP e clique em “Auditar no Ledgra”. O resultado aparece aqui."
            : "Quando a equipe enviar um relatório do SAP, o resultado aparece aqui."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Auditorias fiscais do SAP">
          <thead>
            <tr>
              <th>Data</th>
              <th>Empresa</th>
              <th>Arquivo</th>
              <th className="text-right">Linhas</th>
              <th className="text-right">Erros</th>
              <th className="text-right">Atenção</th>
              <th className="text-right">A recolher</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((a) => (
              <tr key={a.id} className={aberta === a.id ? "bg-[var(--fundo-suave)]" : undefined}>
                <td data-rotulo="Data" className="whitespace-nowrap">
                  {fmtDataHora(a.criado_em)}
                </td>
                <td className="celula-titulo font-medium">
                  {nomeDa(a)}
                  <span className="block text-xs text-slate-500">{formatarDocumento(a.cnpj)}</span>
                </td>
                <td data-rotulo="Arquivo" className="break-all text-sm">
                  {a.arquivo_nome}
                </td>
                <td data-rotulo="Linhas" className="text-right tabular-nums">
                  {a.linhas.toLocaleString("pt-BR")}
                </td>
                <td data-rotulo="Erros" className="text-right tabular-nums">
                  {a.resumo.erros ? <Chip tom="vermelho">{a.resumo.erros}</Chip> : "0"}
                </td>
                <td data-rotulo="Atenção" className="text-right tabular-nums">
                  {a.resumo.avisos ?? 0}
                </td>
                <td data-rotulo="A recolher" className="whitespace-nowrap text-right tabular-nums">
                  {brl(a.resumo.aRecolher ?? 0)}
                </td>
                <td className="celula-acoes">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => setAberta(a.id)}>
                      <Icone nome="olho" className="h-4 w-4" />
                      Ver resultado
                    </button>
                    <a className="btn" href={a.link} target="_blank" rel="noreferrer">
                      <Icone nome="externo" className="h-4 w-4" />
                      Abrir no Ledgra
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}
    </div>
  );
}

const somaDia = (iso: string) => new Date(Date.parse(iso + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);

/** Cartão de envio: empresa, CNPJ da filial, regime e arquivo do SAP. */
function NovaAuditoria({
  clientes,
  orgId,
  aoTerminar,
  avisar,
}: {
  clientes: ReturnType<typeof useOrg>["clientes"];
  orgId: string;
  aoTerminar: (id: string) => void;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
}) {
  const [cliente, setCliente] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [regime, setRegime] = useState<RegimeAuditoria>("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ativos = useMemo(() => clientes.filter((c) => c.cnpj && c.ativo), [clientes]);

  function escolher(id: string) {
    setCliente(id);
    const c = ativos.find((x) => x.id === id);
    setCnpj(c?.cnpj ? formatarDocumento(c.cnpj) : "");
    setRegime(regimeDoCadastro(c?.regime));
  }

  async function enviar() {
    setErro(null);
    if (soDigitos(cnpj).length !== 14) return setErro("Informe o CNPJ da filial que está no relatório (14 dígitos).");
    if (!arquivo) return setErro("Escolha o arquivo exportado do SAP.");
    if (!arquivoAceito(arquivo.name)) return setErro("Envie o arquivo em .txt (como o SAP grava), .xlsx, .xls ou .csv.");
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("org", orgId);
      if (cliente) form.set("cliente", cliente);
      form.set("cnpj", soDigitos(cnpj));
      form.set("regime", regime);
      form.set("arquivo", arquivo);
      const r = await chamarFuncao<{ id: string; chavesNumericas: number }>("ledgra-auditoria", { form });
      avisar("Auditoria pronta. O resultado está logo abaixo.");
      if (r.chavesNumericas)
        avisar(
          `${plural(r.chavesNumericas, "chave de acesso veio", "chaves de acesso vieram")} como número e perdeu dígitos. Exporte a coluna CHAVE_ACESSO como texto.`,
          "atencao",
        );
      setArquivo(null);
      aoTerminar(r.id);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao space-y-3 p-4" aria-label="Nova auditoria">
      <h2 className="flex items-center gap-2 font-semibold text-[var(--marca)]">
        <Icone nome="escudo" className="h-5 w-5" />
        Nova auditoria
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="campo">
          <span>Empresa</span>
          <select value={cliente} onChange={(e) => escolher(e.target.value)} disabled={enviando}>
            <option value="">Escolha a empresa…</option>
            {ativos.map((c) => (
              <option key={c.id} value={c.id}>
                {nomeCliente(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span title="O relatório pode ter várias filiais: só as linhas deste CNPJ são auditadas.">CNPJ da filial</span>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" disabled={enviando} />
        </label>
        <label className="campo">
          <span title="Usado para conferir o CST de PIS/COFINS de cada utilização.">Regime de PIS/COFINS</span>
          <select value={regime} onChange={(e) => setRegime(e.target.value as RegimeAuditoria)} disabled={enviando}>
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="campo">
          <span>Arquivo do SAP</span>
          <label className="btn cursor-pointer justify-start overflow-hidden">
            <Icone nome="importar" className="h-4 w-4 shrink-0" />
            <span className="truncate">{arquivo ? arquivo.name : "Escolher arquivo (.txt, .xlsx ou .csv)"}</span>
            <input
              type="file"
              accept=".txt,.tsv,.csv,.xlsx,.xls"
              className="sr-only"
              disabled={enviando}
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        No SAP: Ferramentas › Consultas › 01 - FISCAL › “MDC - Relatorio Fiscal Entradas e Saidas (SPED)”, informe o período e
        exporte para Excel. Quem envia precisa ter o Ledgra Auditor liberado para a empresa, com o mesmo e-mail do HUB.
      </p>
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end">
        <button className="btn-primario" onClick={enviar} disabled={enviando}>
          <Icone nome={enviando ? "atualizar" : "enviar"} className={`h-4 w-4 ${enviando ? "animate-spin" : ""}`} />
          {enviando ? "Auditando no Ledgra…" : "Auditar no Ledgra"}
        </button>
      </div>
    </section>
  );
}

/** Resultado de uma auditoria: números, contagem por regra (clique filtra) e os achados, com PDF e Excel. */
function Resultado({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { org } = useOrg();
  const { aviso, mostrar } = useAviso();
  const [regra, setRegra] = useState("");
  const [gravidade, setGravidade] = useState<Gravidade | "">("");
  const [busca, setBusca] = useState("");
  const consulta = useConsulta(
    useCallback(async () => {
      const { data, error } = await supabase().from("auditorias_erp").select("*").eq("id", id).single();
      if (error) throw error;
      return data as AuditoriaErp;
    }, [id]),
  );
  const a = consulta.dados;
  const lista = useMemo(
    () => (a ? filtrarAchados(a.achados, { regra, gravidade, busca }) : []),
    [a, regra, gravidade, busca],
  );
  const limpar = () => {
    setRegra("");
    setGravidade("");
    setBusca("");
  };
  const ativos: FiltroAtivo[] = [
    ...(regra ? [{ id: "r", rotulo: `Regra: ${regra}`, aoTirar: () => setRegra("") }] : []),
    ...(gravidade ? [{ id: "g", rotulo: NOME_GRAVIDADE[gravidade], aoTirar: () => setGravidade("") }] : []),
    ...(busca.trim() ? [{ id: "b", rotulo: `Busca: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
  ];

  if (consulta.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {consulta.erro}
      </p>
    );
  if (!a) return <Esqueleto indicadores={4} linhas={4} />;
  const total = a.resumo.achados ?? a.achados.length;

  return (
    <section className="cartao space-y-4 p-4" aria-label="Resultado da auditoria">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">{a.empresa || formatarDocumento(a.cnpj)}</h2>
          <p className="text-sm text-slate-600">
            {formatarDocumento(a.cnpj)} · {a.arquivo_nome} · {fmtDataHora(a.criado_em)}
            {a.fora ? ` · ${plural(a.fora, "linha de outra filial ficou", "linhas de outras filiais ficaram")} de fora` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Auditoria fiscal do SAP — achados",
              subtitulo: `${a.empresa ?? ""} · CNPJ ${formatarDocumento(a.cnpj)} · ${a.arquivo_nome} · ${plural(lista.length, "achado")}`,
              arquivo: nomeArquivo(`Auditoria-SAP-${soDigitos(a.cnpj)}`, hojeISO(org.fuso)),
              logoUrl: org.logo_url,
              paisagem: true,
              linhas: lista,
              colunas: [
                { titulo: "Regra", valor: (x: AchadoAuditoria) => `${x.regra} · ${x.titulo}`, peso: 2.2, largura: 40 },
                { titulo: "Situação", valor: (x: AchadoAuditoria) => NOME_GRAVIDADE[x.gravidade], peso: 0.9, largura: 12 },
                { titulo: "Documento", valor: (x: AchadoAuditoria) => x.documento, peso: 1.6, largura: 28 },
                { titulo: "Data", valor: (x: AchadoAuditoria) => fmtData(x.data), peso: 0.9, largura: 12 },
                { titulo: "Item", valor: (x: AchadoAuditoria) => x.descricao, peso: 1.8, largura: 34 },
                { titulo: "CFOP", valor: (x: AchadoAuditoria) => x.cfop, peso: 0.6, largura: 8 },
                { titulo: "O que está errado", valor: (x: AchadoAuditoria) => x.mensagem, peso: 3, largura: 60 },
                { titulo: "Esperado", valor: (x: AchadoAuditoria) => x.esperado, peso: 1.4, largura: 24 },
                { titulo: "Informado", valor: (x: AchadoAuditoria) => x.informado, peso: 1.4, largura: 24 },
                { titulo: "Diferença", valor: (x: AchadoAuditoria) => x.diferenca, formato: "moeda", peso: 1, largura: 14 },
              ],
            })}
          />
          <a className="btn" href={a.link} target="_blank" rel="noreferrer">
            <Icone nome="externo" className="h-4 w-4" />
            Abrir no Ledgra
          </a>
          <button className="btn" onClick={aoFechar}>
            <Icone nome="fechar" className="h-4 w-4" />
            Fechar
          </button>
        </div>
      </div>
      {aviso}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Linhas auditadas" icone="lista" valor={a.linhas.toLocaleString("pt-BR")} />
        <Indicador
          titulo="Erros"
          icone="alerta"
          tom={a.resumo.erros ? "vermelho" : "verde"}
          valor={String(a.resumo.erros ?? 0)}
          ativo={gravidade === "erro"}
          aoClicar={() => setGravidade((g) => (g === "erro" ? "" : "erro"))}
        />
        <Indicador
          titulo="Pontos de atenção"
          icone="exclamacao"
          tom={a.resumo.avisos ? "ambar" : "neutro"}
          valor={String(a.resumo.avisos ?? 0)}
          ativo={gravidade === "aviso"}
          aoClicar={() => setGravidade((g) => (g === "aviso" ? "" : "aviso"))}
        />
        <Indicador
          titulo="Imposto a recolher"
          icone="moeda"
          tom={(a.resumo.aRecolher ?? 0) > 0 ? "vermelho" : "neutro"}
          valor={brl(a.resumo.aRecolher ?? 0)}
          detalhe={a.resumo.economia ? `economia possível ${brl(a.resumo.economia)}` : undefined}
        />
      </div>

      {a.por_regra.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">O que o Ledgra encontrou (clique para filtrar)</h3>
          <div className="flex flex-wrap gap-2">
            {a.por_regra.map((r) => (
              <button
                key={r.regra}
                className={`btn ${regra === r.regra ? "ring-2 ring-[var(--marca)]" : ""}`}
                onClick={() => setRegra((x) => (x === r.regra ? "" : r.regra))}
                title={r.titulo}
              >
                <Chip tom={TOM_GRAVIDADE[r.gravidade] ?? "neutro"}>{r.regra}</Chip>
                <span className="max-w-[16rem] truncate">{r.titulo}</span>
                <strong className="tabular-nums">{r.quantidade}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
        <label className="campo">
          <span>Situação</span>
          <select value={gravidade} onChange={(e) => setGravidade(e.target.value as Gravidade | "")}>
            <option value="">Todas</option>
            {(Object.keys(NOME_GRAVIDADE) as Gravidade[]).map((g) => (
              <option key={g} value={g}>
                {NOME_GRAVIDADE[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo-largo">
          <span>Documento, item, NCM ou CFOP</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: 1949 ou energia" />
        </label>
      </CartaoFiltros>

      {total > a.achados.length && (
        <p className="text-sm text-slate-600">
          Aqui aparecem os {a.achados.length.toLocaleString("pt-BR")} achados mais graves de {total.toLocaleString("pt-BR")}. A lista
          completa está no Ledgra.
        </p>
      )}
      {!lista.length ? (
        <EstadoVazio icone={a.achados.length ? "filtro" : "check"} titulo={a.achados.length ? "Nenhum achado neste filtro" : "Nada a ajustar"}>
          {a.achados.length ? "Troque a regra, a situação ou a busca, ou limpe os filtros." : "O Ledgra não encontrou divergências neste relatório."}
        </EstadoVazio>
      ) : (
        <QuadroTabela rotulo="Achados da auditoria">
          <thead>
            <tr>
              <th>Regra</th>
              <th>Documento</th>
              <th>Item</th>
              <th>O que está errado</th>
              <th className="text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, 500).map((x, k) => (
              <tr key={k} className="align-top">
                <td className="celula-titulo">
                  <Chip tom={TOM_GRAVIDADE[x.gravidade] ?? "neutro"}>{x.regra}</Chip>
                  <span className="block text-sm">{x.titulo}</span>
                </td>
                <td data-rotulo="Documento" className="text-sm">
                  {x.documento}
                  <span className="block text-xs text-slate-500">{fmtData(x.data)}</span>
                </td>
                <td data-rotulo="Item" className="text-sm">
                  {x.descricao}
                  <span className="block text-xs text-slate-500">
                    CFOP {x.cfop}
                    {x.ncm ? ` · NCM ${x.ncm}` : ""}
                  </span>
                </td>
                <td data-rotulo="O que está errado" className="text-sm">
                  {x.mensagem}
                  {(x.esperado || x.informado) && (
                    <span className="block text-xs text-slate-500">
                      Esperado: {x.esperado || "—"} · Informado: {x.informado || "—"}
                    </span>
                  )}
                </td>
                <td data-rotulo="Diferença" className="whitespace-nowrap text-right tabular-nums">
                  {x.diferenca ? brl(x.diferenca) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </QuadroTabela>
      )}
      {lista.length > 500 && (
        <p className="text-sm text-slate-600">
          Mostrando 500 de {lista.length.toLocaleString("pt-BR")} achados na tela. O PDF e o Excel levam todos os do filtro.
        </p>
      )}
    </section>
  );
}
