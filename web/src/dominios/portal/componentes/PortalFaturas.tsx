// Portal do Cliente › Faturas: as faturas da MDC publicadas para o cliente (portal_faturas_detalhe, 050), com o PDF da
// fatura no papel timbrado, a nota fiscal (NFS-e) quando emitida e o boleto (linha digitável e Pix copia e cola).
"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { caminho } from "@/lib/caminho";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import type { Tom } from "@/components/ui/Tons";
import { nomeCliente } from "@/dominios/clientes/nome";
import { gerarFaturaPdf } from "@/dominios/contratos/faturaPdf";
import { BANCOS_BOLETO } from "@/dominios/contratos/faturamento";
import { Copiavel } from "@/dominios/contratos/componentes/JanelaBoleto";
import { EspelhoNota } from "@/dominios/notas/componentes/EspelhoNota";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { carregarLogo } from "@/lib/marca";
import type { EmpresaPortal } from "../tipos";
import { situacaoFaturaPortal, type FaturaPortal, type SituacaoPortal } from "../faturas";

const SITUACOES: Record<SituacaoPortal, { nome: string; tom: Tom }> = {
  paga: { nome: "Paga", tom: "verde" },
  aberta: { nome: "A vencer", tom: "azul" },
  vence_hoje: { nome: "Vence hoje", tom: "ambar" },
  vencida: { nome: "Vencida", tom: "vermelho" },
};

const nomeBanco = (b: string | undefined) => BANCOS_BOLETO.find((x) => x.id === b)?.nome ?? "banco";

export function PortalFaturas({ emp }: { emp: EmpresaPortal }) {
  const { aviso, mostrar } = useAviso();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"" | SituacaoPortal>("");
  const [pagar, setPagar] = useState<FaturaPortal | null>(null);
  const [nota, setNota] = useState<FaturaPortal | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const hoje = hojeISO();

  const consulta = useConsulta(
    useCallback(async () => {
      const { data, error } = await supabase().rpc("portal_faturas_detalhe", { p_cliente: emp.cliente_id });
      if (error) throw error;
      return (data as unknown as FaturaPortal[]) ?? [];
    }, [emp.cliente_id]),
  );
  const faturas = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return faturas.filter(
      (f) =>
        (!filtro || situacaoFaturaPortal(f, hoje) === filtro) &&
        (!q || f.numero.includes(q) || f.descricao.toLowerCase().includes(q) || (f.contrato ?? "").toLowerCase().includes(q)),
    );
  }, [faturas, busca, filtro, hoje]);
  const emAberto = faturas.filter((f) => situacaoFaturaPortal(f, hoje) !== "paga");
  const totalAberto = emAberto.reduce((s, f) => s + Number(f.valor), 0);

  async function baixarPdf(f: FaturaPortal) {
    setBaixando(f.id);
    try {
      const t = f.tomador ?? {};
      const bytes = await gerarFaturaPdf({
        fatura: { ...f, valor: Number(f.valor), iss_aliquota: f.iss_aliquota == null ? null : Number(f.iss_aliquota) },
        cliente: {
          nome: t.nome ?? nomeCliente(emp),
          documento: t.documento,
          email: t.email,
          cidade: [t.cidade, t.uf].filter(Boolean).join("/") || null,
        },
        contrato: f.contrato,
        logo: await carregarLogo(emp.logo_url ?? caminho("/logo-mdc-dourado.png")),
      });
      baixarBytes(bytes, `${nomeArquivo("Fatura", f.numero.replace("/", "-"), nomeCliente(emp))}.pdf`);
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setBaixando(null);
    }
  }

  const ativos: FiltroAtivo[] = [
    ...(busca.trim() ? [{ id: "b", rotulo: `Busca: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
    ...(filtro ? [{ id: "s", rotulo: SITUACOES[filtro].nome, aoTirar: () => setFiltro("") }] : []),
  ];
  const limpar = () => {
    setBusca("");
    setFiltro("");
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Faturas"
        descricao="As faturas dos serviços da MDC. Baixe a fatura em PDF, veja a nota fiscal e copie o boleto ou o Pix para pagar."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Faturas da MDC",
              subtitulo: `${nomeCliente(emp)} · ${lista.length} fatura(s)`,
              arquivo: nomeArquivo("Faturas MDC", nomeCliente(emp), hoje),
              logoUrl: emp.logo_url,
              paisagem: false,
              linhas: lista,
              colunas: [
                { titulo: "Fatura", valor: (f: FaturaPortal) => f.numero, peso: 1, largura: 12 },
                { titulo: "Mês", valor: (f: FaturaPortal) => fmtCompetencia(f.competencia), peso: 1, largura: 10 },
                { titulo: "Serviço", valor: (f: FaturaPortal) => f.descricao, peso: 3, largura: 40 },
                { titulo: "Vencimento", valor: (f: FaturaPortal) => fmtData(f.vencimento), peso: 1, largura: 12 },
                { titulo: "Valor", valor: (f: FaturaPortal) => Number(f.valor), formato: "moeda", peso: 1, largura: 14 },
                { titulo: "Situação", valor: (f: FaturaPortal) => SITUACOES[situacaoFaturaPortal(f, hoje)].nome, peso: 1, largura: 12 },
                { titulo: "Nota fiscal", valor: (f: FaturaPortal) => (f.nfse ? `nº ${f.nfse.numero ?? "—"}` : ""), peso: 1, largura: 12 },
              ],
            })}
          />
        }
      />
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={2} linhas={4} />
      ) : !faturas.length ? (
        <EstadoVazio icone="moeda" titulo="Nenhuma fatura por aqui ainda">
          Quando a MDC emitir a fatura dos serviços do mês, ela aparece aqui com o PDF, a nota fiscal e o boleto para pagar. Dúvidas? Fale
          com a MDC.
        </EstadoVazio>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="cartao p-4">
              <div className="text-xs text-neutral-500">Em aberto</div>
              <div className={`text-xl font-semibold tabular-nums ${emAberto.length ? "text-[var(--marca)]" : "text-emerald-800"}`}>
                {brl(totalAberto)}
              </div>
              <div className="text-xs text-neutral-500">{emAberto.length ? `${emAberto.length} fatura(s) para pagar` : "Tudo pago. Obrigado!"}</div>
            </div>
            <div className="cartao p-4">
              <div className="text-xs text-neutral-500">Próximo vencimento</div>
              <div className="text-xl font-semibold tabular-nums text-[var(--marca)]">
                {emAberto.length ? fmtData([...emAberto].sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0].vencimento) : "—"}
              </div>
              <div className="text-xs text-neutral-500">Use “Pagar” para copiar o boleto ou o Pix.</div>
            </div>
          </div>
          <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
            <label className="campo campo-largo">
              <span>Buscar</span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número da fatura ou serviço" />
            </label>
            <label className="campo">
              <span>Situação</span>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
                <option value="">Todas</option>
                {Object.entries(SITUACOES).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          </CartaoFiltros>
          {!lista.length ? (
            <EstadoVazio
              icone="filtro"
              titulo="Nenhuma fatura neste filtro"
              acao={
                <button className="btn" onClick={limpar}>
                  Limpar filtros
                </button>
              }
            >
              Troque a busca ou limpe os filtros para ver todas as faturas.
            </EstadoVazio>
          ) : (
            <QuadroTabela rotulo="Faturas">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Serviço</th>
                  <th>Vencimento</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => {
                  const s = SITUACOES[situacaoFaturaPortal(f, hoje)];
                  return (
                    <tr key={f.id}>
                      <td className="celula-titulo whitespace-nowrap">
                        {f.numero}
                        <span className="block text-xs font-normal text-neutral-500">{fmtCompetencia(f.competencia)}</span>
                      </td>
                      <td data-rotulo="Serviço" className="min-w-0">
                        {f.descricao}
                        {f.nfse && <span className="block text-xs text-neutral-500">Nota fiscal nº {f.nfse.numero ?? "—"}</span>}
                      </td>
                      <td data-rotulo="Vencimento" className="whitespace-nowrap">
                        {fmtData(f.vencimento)}
                      </td>
                      <td data-rotulo="Valor" className="text-right tabular-nums">
                        {brl(Number(f.valor))}
                      </td>
                      <td data-rotulo="Situação">
                        <Chip tom={s.tom}>{s.nome}</Chip>
                      </td>
                      <td data-rotulo="Ações" className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {!f.paga && f.boleto && (
                            <button className="btn-primario" onClick={() => setPagar(f)}>
                              <Icone nome="banco" className="h-4 w-4" />
                              Pagar
                            </button>
                          )}
                          <button className="btn" onClick={() => baixarPdf(f)} disabled={baixando === f.id} aria-label={`Baixar a fatura ${f.numero} em PDF`}>
                            <Icone nome="baixar" className="h-4 w-4" />
                            {baixando === f.id ? "Gerando…" : "Fatura"}
                          </button>
                          {f.nfse && (
                            <button className="btn" onClick={() => setNota(f)} aria-label={`Ver a nota fiscal da fatura ${f.numero}`}>
                              <Icone nome="olho" className="h-4 w-4" />
                              Nota fiscal
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}

      {pagar?.boleto && (
        <Modal
          titulo={`Pagar a fatura ${pagar.numero}`}
          aoFechar={() => setPagar(null)}
          largura="lg"
          rodape={
            <button className="btn" onClick={() => setPagar(null)}>
              Voltar
            </button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Boleto do {nomeBanco(pagar.boleto.banco)} de <b>{brl(Number(pagar.boleto.valor))}</b>, vencimento em{" "}
              <b>{fmtData(pagar.boleto.vencimento)}</b>. Copie a linha digitável no aplicativo do seu banco ou pague pelo Pix.
            </p>
            {pagar.boleto.linha_digitavel && <Copiavel rotulo="Linha digitável do boleto" texto={pagar.boleto.linha_digitavel} />}
            {pagar.boleto.pix_copia_cola && <Copiavel rotulo="Pix copia e cola" texto={pagar.boleto.pix_copia_cola} />}
            <p className="text-xs text-neutral-500">Quando o banco confirmar o pagamento, a fatura aparece aqui como paga.</p>
          </div>
        </Modal>
      )}
      {nota?.nfse && (
        <EspelhoNota
          nota={{
            xml_caminho: nota.nfse.xml_caminho,
            chave: nota.nfse.chave,
            numero: nota.nfse.numero,
            emitente_doc: null,
            emitente_nome: emp.org_nome,
            modelo: "nfse",
          }}
          avisar={mostrar}
          aoFechar={() => setNota(null)}
        />
      )}
    </div>
  );
}
