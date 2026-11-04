// Contratos › Nota fiscal (NFS-e) (046): como o HUB emite a nota das faturas pelo Emissor Nacional. Só para quem gere o
// módulo Contratos (aba com minimo "gerir"). Ambiente (teste sem valor fiscal × produção, com confirmação para ir à
// produção), modo (conferir antes de emitir ou automático às 06h45, com confirmação para ligar — 052), numeração da DPS, regime do Simples da MDC,
// inscrição municipal, município, NBS e % aproximado dos tributos. Embaixo, as notas enviadas pelo HUB (PDF e Excel).
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { useAviso } from "@/components/ui/Aviso";
import { lerEmissoesNfse, lerFaturas, lerNumeracaoNfse, lerParametrosNfse } from "../leituras";
import { salvarParametrosNfse } from "../repositorio";
import { EXPLICA_AMBIENTE, MODOS_NFSE, NOMES_AMBIENTE, REGIMES_APURACAO, REGIMES_ESPECIAIS } from "../nfse";
import type { AmbienteNfse, EmissaoNfse, ModoNfse, ParametrosNfse } from "../tipos";
import { FaixaAmbiente } from "./JanelaEmitirNfse";
import { plural } from "@/lib/formato/numero";

const SITUACOES = {
  enviando: { nome: "Enviando", tom: "azul" },
  emitida: { nome: "Emitida", tom: "verde" },
  rejeitada: { nome: "Recusada", tom: "vermelho" },
  erro: { nome: "Sem resposta certa", tom: "ambar" },
} as const;

interface Form {
  ambiente: AmbienteNfse;
  modo: ModoNfse;
  serie: string;
  proximo: string;
  reg_ap_trib_sn: string;
  reg_esp_trib: string;
  inscricao_municipal: string;
  codigo_municipio: string;
  nbs_padrao: string;
  p_tot_trib_sn: string;
}

const doBanco = (p: ParametrosNfse | null): Form => ({
  ambiente: p?.ambiente ?? "producao_restrita",
  modo: p?.modo ?? "conferir",
  serie: p?.serie ?? "1",
  proximo: "",
  reg_ap_trib_sn: p?.reg_ap_trib_sn ?? "1",
  reg_esp_trib: p?.reg_esp_trib ?? "0",
  inscricao_municipal: p?.inscricao_municipal ?? "",
  codigo_municipio: p?.codigo_municipio ?? "3507605",
  nbs_padrao: p?.nbs_padrao ?? "",
  p_tot_trib_sn: p?.p_tot_trib_sn != null ? Number(p.p_tot_trib_sn).toFixed(2).replace(".", ",") : "",
});

export function TelaNotaFiscal() {
  const { org, pode } = useOrg();
  const gestao = useClienteGestao();
  const cliente = gestao.cliente;
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [parametros, numeracao, emissoes, faturas] = await Promise.all([
        lerParametrosNfse(cliente.id),
        lerNumeracaoNfse(cliente.id),
        lerEmissoesNfse(cliente.id),
        lerFaturas(cliente.id),
      ]);
      return { parametros, numeracao, emissoes, faturas };
    }, [cliente]),
  );
  const d = consulta.dados;
  const [editado, setEditado] = useState<Partial<Form>>({});
  const [confirmo, setConfirmo] = useState(false);
  const [confirmoAuto, setConfirmoAuto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const form: Form = { ...doBanco(d?.parametros ?? null), ...editado };
  const mudar = (campo: keyof Form, valor: string) => setEditado((x) => ({ ...x, [campo]: valor }));
  const indoParaProducao = form.ambiente === "producao" && d?.parametros?.ambiente !== "producao";
  const ligandoAutomatico = form.modo === "automatico" && d?.parametros?.modo !== "automatico";
  const proximoAtual =
    d?.numeracao.find((n) => n.ambiente === form.ambiente && n.serie === String(Number(form.serie) || ""))?.proximo ?? 1;
  const numeroFatura = useMemo(() => new Map((d?.faturas ?? []).map((f) => [f.id, f.numero])), [d]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return;
    setErro("");
    if (indoParaProducao && !confirmo) return setErro("Para ir para a produção, marque a confirmação de que os testes deram certo.");
    if (ligandoAutomatico && !confirmoAuto) return setErro("Para ligar o automático, marque a confirmação de que a nota pode sair sem conferir.");
    const ptot = form.p_tot_trib_sn.trim() ? Number(form.p_tot_trib_sn.replace(/\./g, "").replace(",", ".")) : null;
    if (ptot !== null && !Number.isFinite(ptot)) return setErro("Percentual dos tributos: use só números (ex.: 6,00).");
    setSalvando(true);
    try {
      await salvarParametrosNfse({
        cliente: cliente.id,
        ambiente: form.ambiente,
        modo: form.modo,
        serie: form.serie.trim(),
        reg_ap_trib_sn: form.reg_ap_trib_sn,
        reg_esp_trib: form.reg_esp_trib,
        inscricao_municipal: form.inscricao_municipal.trim() || null,
        codigo_municipio: form.codigo_municipio,
        nbs_padrao: form.nbs_padrao.trim() || null,
        p_tot_trib_sn: ptot,
        proximo_ndps: form.proximo.trim() ? Number(form.proximo.replace(/\D/g, "")) : null,
        confirmo_producao: indoParaProducao ? confirmo : undefined,
        confirmo_automatico: ligandoAutomatico ? confirmoAuto : undefined,
      });
      setEditado({});
      setConfirmo(false);
      setConfirmoAuto(false);
      mostrar("Parâmetros da nota fiscal salvos.");
      consulta.recarregar();
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setSalvando(false);
    }
  }

  const emissoes = d?.emissoes ?? [];
  const opcao = (nome: string, valor: string, titulo: string, detalhe: string, marcado: boolean, aoMarcar: () => void) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${marcado ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"}`}
    >
      <input type="radio" name={nome} value={valor} checked={marcado} disabled={!podeGerir} onChange={aoMarcar} className="mt-1" />
      <span>
        <span className="block font-medium">{titulo}</span>
        <span className="block text-xs text-[var(--texto-suave)]">{detalhe}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Nota fiscal (NFS-e)"
        descricao="Como o HUB emite a nota fiscal de serviço das faturas pelo Emissor Nacional: ambiente, conferência, numeração e os dados da MDC na nota."
        acoes={
          <BotoesExportar
            vazio={!emissoes.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Notas fiscais enviadas pelo HUB",
              subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${plural(emissoes.length, "envio")}`,
              arquivo: nomeArquivo("Notas-fiscais-enviadas", cliente ? nomeCliente(cliente) : "", hoje),
              logoUrl: org.logo_url,
              paisagem: true,
              linhas: emissoes,
              colunas: [
                { titulo: "Enviada em", valor: (e: EmissaoNfse) => fmtDataHora(e.enviado_em), peso: 1, largura: 18 },
                { titulo: "Fatura", valor: (e: EmissaoNfse) => numeroFatura.get(e.fatura_id) ?? "—", peso: 0.8, largura: 12 },
                { titulo: "DPS", valor: (e: EmissaoNfse) => `${e.serie}/${e.ndps}`, peso: 0.6, largura: 10 },
                { titulo: "Ambiente", valor: (e: EmissaoNfse) => (e.ambiente === "producao" ? "Produção" : "Teste"), peso: 0.7, largura: 11 },
                { titulo: "Situação", valor: (e: EmissaoNfse) => SITUACOES[e.situacao].nome, peso: 0.9, largura: 16 },
                { titulo: "Nota nº", valor: (e: EmissaoNfse) => e.numero_nfse ?? "", peso: 0.6, largura: 10 },
                { titulo: "Motivo / observação", valor: (e: EmissaoNfse) => e.mensagem ?? "", peso: 2.4, largura: 50 },
              ],
            })}
          />
        }
      />
      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <SemEmpresaGestao icone="documento" />
      ) : consulta.carregando && !d ? (
        <Esqueleto />
      ) : (
        <>
          <FaixaAmbiente ambiente={d?.parametros?.ambiente ?? "producao_restrita"} />
          {!d?.parametros && (
            <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
              A emissão ainda não foi configurada. Confira os campos abaixo e clique em <strong>Salvar parâmetros</strong>: o HUB começa no
              ambiente de teste, sem valor fiscal.
            </p>
          )}

          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="cartao space-y-3 p-4">
              <h2 className="font-semibold">Ambiente</h2>
              <div role="radiogroup" aria-label="Ambiente da emissão" className="space-y-2">
                {(["producao_restrita", "producao"] as AmbienteNfse[]).map((a) =>
                  opcao("ambiente", a, NOMES_AMBIENTE[a], EXPLICA_AMBIENTE[a], form.ambiente === a, () => mudar("ambiente", a)),
                )}
              </div>
              {indoParaProducao && (
                <label className="flex gap-3 rounded-xl border-2 border-[var(--perigo)] p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
                  <span>
                    <span className="block font-medium">Confirmo que as notas de teste deram certo</span>
                    <span className="block text-xs text-[var(--texto-suave)]">
                      A partir de agora as notas emitidas valem como documento fiscal e vão para os clientes.
                    </span>
                  </span>
                </label>
              )}
              <h2 className="pt-2 font-semibold">Como emitir</h2>
              <div role="radiogroup" aria-label="Como emitir" className="space-y-2">
                {MODOS_NFSE.map((m) => opcao("modo", m.id, m.titulo, m.detalhe, form.modo === m.id, () => mudar("modo", m.id)))}
              </div>
              {ligandoAutomatico && (
                <label className="flex gap-3 rounded-xl border-2 border-[var(--perigo)] p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={confirmoAuto} onChange={(e) => setConfirmoAuto(e.target.checked)} />
                  <span>
                    <span className="block font-medium">Confirmo que a nota pode sair sem ninguém conferir antes</span>
                    <span className="block text-xs text-[var(--texto-suave)]">
                      {form.ambiente === "producao"
                        ? "A nota sai com valor fiscal e vai para o cliente junto com a fatura. Confira antes o código do serviço e o CNPJ de cada cliente nos contratos."
                        : "No ambiente de teste a nota sai sem valor fiscal e não vai para o cliente: bom para conferir o automático antes da produção."}
                    </span>
                  </span>
                </label>
              )}
            </section>

            <section className="cartao space-y-3 p-4">
              <h2 className="font-semibold">Dados da MDC na nota</h2>
              <p className="text-sm">
                <span className="text-[var(--texto-suave)]">Opção pelo Simples Nacional:</span> <strong>ME/EPP</strong>
              </p>
              <label className="campo">
                <span>Como o Simples apura os tributos</span>
                <select value={form.reg_ap_trib_sn} disabled={!podeGerir} onChange={(e) => mudar("reg_ap_trib_sn", e.target.value)}>
                  {REGIMES_APURACAO.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Regime especial de tributação</span>
                <select value={form.reg_esp_trib} disabled={!podeGerir} onChange={(e) => mudar("reg_esp_trib", e.target.value)}>
                  {REGIMES_ESPECIAIS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="campo">
                  <span>Inscrição municipal</span>
                  <input
                    value={form.inscricao_municipal}
                    disabled={!podeGerir}
                    onChange={(e) => mudar("inscricao_municipal", e.target.value)}
                    placeholder="Como está no cadastro da prefeitura"
                  />
                </label>
                <label className="campo">
                  <span>Código do município (IBGE)</span>
                  <input
                    inputMode="numeric"
                    value={form.codigo_municipio}
                    disabled={!podeGerir}
                    onChange={(e) => mudar("codigo_municipio", e.target.value)}
                  />
                  <small className="text-xs text-[var(--texto-suave)]">Bragança Paulista = 3507605</small>
                </label>
                <label className="campo">
                  <span>
                    <abbr title="Nomenclatura Brasileira de Serviços: código de 9 números que a nota exige">Código NBS do serviço</abbr>
                  </span>
                  <input
                    inputMode="numeric"
                    value={form.nbs_padrao}
                    disabled={!podeGerir}
                    onChange={(e) => mudar("nbs_padrao", e.target.value)}
                    placeholder="Ex.: 1.1302.10.00"
                  />
                </label>
                <label className="campo">
                  <span>Tributos aproximados do Simples (%)</span>
                  <input
                    inputMode="decimal"
                    value={form.p_tot_trib_sn}
                    disabled={!podeGerir}
                    onChange={(e) => mudar("p_tot_trib_sn", e.target.value)}
                    placeholder="Ex.: 6,00"
                  />
                  <small className="text-xs text-[var(--texto-suave)]">Vai na nota (Lei 12.741/2012): a alíquota do DAS da MDC</small>
                </label>
              </div>
              <p className="text-xs text-[var(--texto-suave)]">
                O código do serviço (tributação nacional, 6 números) e a descrição vêm de cada contrato. A nota é assinada com o certificado A1
                da MDC de{" "}
                <Link className="underline" href="/entradas/certificado">
                  Entradas › Certificado digital
                </Link>
                .
              </p>
            </section>

            <section className="cartao space-y-3 p-4 lg:col-span-2">
              <h2 className="font-semibold">Numeração da DPS</h2>
              <p className="text-sm text-[var(--texto-suave)]">
                A DPS é a declaração que o HUB manda ao Emissor Nacional; cada uma tem série e número que nunca se repetem. O Emissor devolve a
                NFS-e com número e chave de acesso próprios.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="campo">
                  <span>Série</span>
                  <input inputMode="numeric" value={form.serie} disabled={!podeGerir} onChange={(e) => mudar("serie", e.target.value)} />
                  <small className="text-xs text-[var(--texto-suave)]">De 1 a 49999 (faixa de sistema próprio)</small>
                </label>
                <label className="campo">
                  <span>Próximo número</span>
                  <input
                    inputMode="numeric"
                    value={form.proximo}
                    disabled={!podeGerir}
                    onChange={(e) => mudar("proximo", e.target.value)}
                    placeholder={String(proximoAtual)}
                  />
                  <small className="text-xs text-[var(--texto-suave)]">
                    Deixe em branco para seguir ({proximoAtual}). Só muda para cima de um número já usado.
                  </small>
                </label>
              </div>
              {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
              {podeGerir ? (
                <div className="flex justify-end">
                  <button className="btn-primario" disabled={salvando}>
                    <Icone nome="check" className="h-4 w-4" />
                    {salvando ? "Salvando…" : "Salvar parâmetros"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--texto-suave)]">Só quem gere o módulo Contratos muda estes parâmetros.</p>
              )}
            </section>
          </form>

          <section className="space-y-2">
            <h2 className="font-semibold">Notas enviadas pelo HUB</h2>
            {!emissoes.length ? (
              <EstadoVazio icone="documento" titulo="Nenhuma nota enviada ainda">
                Em Contratos › Faturas, clique em &quot;Emitir nota&quot; numa fatura com nota fiscal. Comece pelo ambiente de teste.
              </EstadoVazio>
            ) : (
              <QuadroTabela rotulo="Notas enviadas pelo HUB">
                <thead>
                  <tr>
                    <th>Fatura</th>
                    <th>Enviada em</th>
                    <th>Ambiente</th>
                    <th>Situação</th>
                    <th>Motivo / observação</th>
                  </tr>
                </thead>
                <tbody>
                  {emissoes.map((e) => {
                    const s = SITUACOES[e.situacao];
                    return (
                      <tr key={e.id}>
                        <td className="celula-titulo">
                          Fatura {numeroFatura.get(e.fatura_id) ?? "—"}
                          <span className="block text-xs font-normal text-[var(--texto-suave)]">
                            DPS {e.serie}/{e.ndps}
                            {e.numero_nfse ? ` · nota nº ${e.numero_nfse}` : ""}
                          </span>
                        </td>
                        <td data-rotulo="Enviada em" className="whitespace-nowrap">
                          {fmtDataHora(e.enviado_em)}
                          {e.tentativas > 1 && <span className="block text-xs text-[var(--texto-suave)]">{e.tentativas} tentativas</span>}
                        </td>
                        <td data-rotulo="Ambiente">{e.ambiente === "producao" ? "Produção" : "Teste (sem valor fiscal)"}</td>
                        <td data-rotulo="Situação">
                          <Chip tom={s.tom}>{s.nome}</Chip>
                        </td>
                        <td data-rotulo="Motivo" className="min-w-48 text-sm">
                          {e.mensagem ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </QuadroTabela>
            )}
          </section>
        </>
      )}
    </div>
  );
}
