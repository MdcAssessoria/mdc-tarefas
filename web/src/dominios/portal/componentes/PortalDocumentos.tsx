// Portal do Cliente › Documentos: arquivos trocados com a MDC (os da MDC e os enviados pelo cliente) e os próximos
// vencimentos da empresa (certificado digital, procurações, alvarás e licenças).
"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { abrirArquivo, enviarArquivo, fmtTamanho } from "@/lib/arquivos/armazenamento";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { fmtData } from "@/lib/formato/datas";
import { useAviso } from "@/components/ui/Aviso";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import type { Tom } from "@/components/ui/Tons";
import { nomeCliente } from "@/dominios/clientes/nome";
import type { EmpresaPortal } from "../tipos";

interface Vencimento {
  id: string;
  tipo: string;
  descricao: string | null;
  vence_em: string;
}

const NOMES_TIPO: Record<string, string> = {
  certificado_a1: "Certificado digital A1",
  certificado_a3: "Certificado digital A3",
  procuracao_ecac: "Procuração e-CAC",
  procuracao_outra: "Procuração",
  alvara: "Alvará",
  avcb: "AVCB (bombeiros)",
  cetesb: "Licença CETESB",
  vigilancia: "Vigilância Sanitária",
  licenca_outra: "Licença",
  contrato: "Contrato",
  outro: "Vencimento",
};

const ORIGENS = { mdc: "Da MDC", voce: "Enviados por você" } as const;
const origem = (a: Arquivo): keyof typeof ORIGENS => (a.app === "portal" ? "voce" : "mdc");

export function PortalDocumentos({ emp }: { emp: EmpresaPortal }) {
  const { aviso, mostrar } = useAviso();
  const [busca, setBusca] = useState("");
  const [de, setDe] = useState<"" | keyof typeof ORIGENS>("");
  const [enviando, setEnviando] = useState(false);
  const hoje = hojeISO();

  const consulta = useConsulta(
    useCallback(async () => {
      const sb = supabase();
      const [a, v] = await Promise.all([
        sb
          .from("hub_arquivos")
          .select("*")
          .eq("cliente_id", emp.cliente_id)
          .eq("visivel_cliente", true)
          .order("enviado_em", { ascending: false })
          .limit(300),
        sb.from("venc_itens").select("id,tipo,descricao,vence_em").eq("cliente_id", emp.cliente_id).eq("status", "ativo").order("vence_em"),
      ]);
      return { arquivos: (exigir(a) as Arquivo[]) ?? [], venc: (exigir(v) as Vencimento[]) ?? [] };
    }, [emp.cliente_id]),
  );
  const arquivos = useMemo(() => consulta.dados?.arquivos ?? [], [consulta.dados]);
  const venc = consulta.dados?.venc ?? [];
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return arquivos.filter((a) => (!de || origem(a) === de) && (!q || a.nome.toLowerCase().includes(q)));
  }, [arquivos, busca, de]);

  async function enviar(arqs: File[]) {
    if (!arqs.length) return;
    setEnviando(true);
    try {
      for (const f of arqs) await enviarArquivo(f, { org: emp.org_id, app: "portal", cliente: emp.cliente_id, visivelCliente: true });
      mostrar(arqs.length === 1 ? `“${arqs[0].name}” enviado para a MDC.` : `${arqs.length} arquivos enviados para a MDC.`);
      consulta.recarregar();
    } catch (e) {
      mostrar(traduzirErro(e), "erro");
    } finally {
      setEnviando(false);
    }
  }

  const botaoEnviar = (
    <label className={`btn-primario cursor-pointer ${enviando ? "pointer-events-none opacity-60" : ""}`}>
      <Icone nome="importar" className="h-4 w-4" />
      {enviando ? "Enviando…" : "Enviar para a MDC"}
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void enviar(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </label>
  );
  const ativos: FiltroAtivo[] = [
    ...(busca.trim() ? [{ id: "b", rotulo: `Busca: “${busca.trim()}”`, aoTirar: () => setBusca("") }] : []),
    ...(de ? [{ id: "o", rotulo: ORIGENS[de], aoTirar: () => setDe("") }] : []),
  ];
  const limpar = () => {
    setBusca("");
    setDe("");
  };
  const dias = (v: Vencimento) => Math.round((Date.parse(v.vence_em) - Date.parse(hoje)) / 864e5);
  const tomVenc = (d: number): Tom => (d < 0 ? "vermelho" : d <= 30 ? "ambar" : "azul");

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Documentos"
        descricao="Arquivos que a MDC deixou para você e os que você enviou. Toque no nome para baixar."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Documentos",
                subtitulo: `${nomeCliente(emp)} · ${lista.length} arquivo(s)`,
                arquivo: nomeArquivo("Documentos", nomeCliente(emp), hoje),
                logoUrl: emp.logo_url,
                paisagem: false,
                linhas: lista,
                colunas: [
                  { titulo: "Arquivo", valor: (a: Arquivo) => a.nome, peso: 3, largura: 50 },
                  { titulo: "De quem", valor: (a: Arquivo) => ORIGENS[origem(a)], peso: 1.3, largura: 18 },
                  { titulo: "Data", valor: (a: Arquivo) => fmtData(a.enviado_em.slice(0, 10)), peso: 1, largura: 12 },
                  { titulo: "Tamanho", valor: (a: Arquivo) => fmtTamanho(a.tamanho), peso: 0.8, largura: 12 },
                ],
              })}
            />
            {botaoEnviar}
          </>
        }
      />
      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}
      {consulta.carregando && !consulta.dados ? (
        <Esqueleto indicadores={0} linhas={5} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            {arquivos.length > 0 && (
              <CartaoFiltros ativos={ativos} aoLimpar={limpar}>
                <label className="campo campo-largo">
                  <span>Buscar pelo nome</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: guia, contrato" />
                </label>
                <label className="campo">
                  <span>De quem</span>
                  <select value={de} onChange={(e) => setDe(e.target.value as typeof de)}>
                    <option value="">Todos</option>
                    {Object.entries(ORIGENS).map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </label>
              </CartaoFiltros>
            )}
            {!arquivos.length ? (
              <EstadoVazio icone="clipe" titulo="Nenhum documento ainda" acao={botaoEnviar}>
                Aqui ficam as guias, contratos e relatórios que a MDC compartilhar com você. Para mandar um documento à MDC, use “Enviar
                para a MDC”.
              </EstadoVazio>
            ) : !lista.length ? (
              <EstadoVazio
                icone="filtro"
                titulo="Nenhum documento neste filtro"
                acao={
                  <button className="btn" onClick={limpar}>
                    Limpar filtros
                  </button>
                }
              >
                Troque a busca ou limpe os filtros para ver todos os documentos.
              </EstadoVazio>
            ) : (
              <QuadroTabela rotulo="Documentos">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>De quem</th>
                    <th>Data</th>
                    <th className="text-right">Tamanho</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((a) => (
                    <tr key={a.id}>
                      <td className="celula-titulo">
                        <button
                          className="inline-flex max-w-full items-center gap-1.5 text-left hover:underline"
                          onClick={() => abrirArquivo(a.caminho, a.nome).catch((e) => mostrar(traduzirErro(e), "erro"))}
                          title="Baixar"
                        >
                          <Icone nome="baixar" className="h-4 w-4 shrink-0 text-[var(--destaque-escuro)]" />
                          <span className="min-w-0 break-all">{a.nome}</span>
                        </button>
                      </td>
                      <td data-rotulo="De quem">
                        <Chip tom={origem(a) === "voce" ? "violeta" : "neutro"}>{ORIGENS[origem(a)]}</Chip>
                      </td>
                      <td data-rotulo="Data" className="whitespace-nowrap">
                        {fmtData(a.enviado_em.slice(0, 10))}
                      </td>
                      <td data-rotulo="Tamanho" className="text-right tabular-nums">
                        {fmtTamanho(a.tamanho)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </QuadroTabela>
            )}
          </div>

          <section className="cartao h-fit p-4" aria-label="Próximos vencimentos">
            <h2 className="flex items-center gap-2 font-semibold text-[var(--marca)]">
              <Icone nome="relogio" className="h-4 w-4" />
              Próximos vencimentos
            </h2>
            <p className="mb-3 text-xs text-neutral-500">Documentos da empresa que precisam ser renovados. A MDC avisa antes.</p>
            {venc.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum vencimento cadastrado para a empresa.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {venc.map((v) => {
                  const d = dias(v);
                  return (
                    <li key={v.id} className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        {NOMES_TIPO[v.tipo] ?? v.tipo}
                        {v.descricao && <span className="block text-xs text-neutral-500">{v.descricao}</span>}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <Chip tom={tomVenc(d)}>{fmtData(v.vence_em)}</Chip>
                        <span className="text-xs text-neutral-500">{d < 0 ? "vencido" : d === 0 ? "vence hoje" : `em ${d} dia(s)`}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
