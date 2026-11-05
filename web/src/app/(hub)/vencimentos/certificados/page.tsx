// Vencimentos › Certificados digitais: os certificados dos dois cofres numa lista só, no molde 8.3.1 — o cofre do HUB
// (assinatura dos demonstrativos e notas fiscais das empresas) e o do Ledgra Link (certificados usados com os bancos).
// Busca, prazo e cofre à vista; indicadores clicáveis; lista que vira cartões no celular; PDF e Excel do que está filtrado.
// Só leitura: o certificado é enviado/trocado na tela de cada uso (Demonstrativos, Entradas, Ledgra Link).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { formatarDocumento } from "@/lib/documento";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { contarVencimentos, FILTROS_PRAZO, passaPrazo, situacaoDoVencimento } from "@/dominios/vencimentos/regras";
import type { FiltroPrazo } from "@/dominios/vencimentos/regras";
import { COFRES, juntarCertificados, lerCertificadosHub, lerCertificadosLink, nomeCofre } from "@/dominios/vencimentos/certificados";
import type { Cofre, LinhaCertificado } from "@/dominios/vencimentos/certificados";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Indicador } from "@/components/ui/Indicador";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";

export default function PaginaCertificados() {
  const { org } = useOrg();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [busca, setBusca] = useState("");
  const [prazo, setPrazo] = useState<FiltroPrazo>("todos");
  const [cofre, setCofre] = useState<Cofre | "">("");

  const hub = useConsulta(useCallback(() => lerCertificadosHub(org.id), [org.id]));
  // o Ledgra Link fora do ar não derruba a tela: o cofre do HUB aparece e o aviso explica
  const link = useConsulta(useCallback(() => lerCertificadosLink(org.id), [org.id]));

  const todos = useMemo(
    () => juntarCertificados(hub.dados ?? [], link.dados?.certificados ?? [], org.fuso, hoje),
    [hub.dados, link.dados, org.fuso, hoje],
  );

  // tudo menos o prazo: base dos indicadores (o número não muda quando se clica nele)
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = q.replace(/\D/g, "");
    return todos.filter((c) => {
      if (cofre && c.cofre !== cofre) return false;
      if (q) {
        const alvo = `${c.titular} ${c.uso} ${c.emissor}`.toLowerCase();
        if (!alvo.includes(q) && !(qDig.length >= 3 && c.documento.includes(qDig))) return false;
      }
      return true;
    });
  }, [todos, busca, cofre]);
  const contagem = useMemo(
    () =>
      contarVencimentos(
        base.filter((c) => c.vence_em),
        hoje,
      ),
    [base, hoje],
  );
  const lista = useMemo(() => base.filter((c) => (c.dias === null ? prazo === "todos" : passaPrazo(c.dias, prazo))), [base, prazo]);

  const nomePrazo = FILTROS_PRAZO.find((x) => x.id === prazo)?.nome ?? "";
  function limparFiltros() {
    setBusca("");
    setPrazo("todos");
    setCofre("");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    prazo !== "todos" && { id: "prazo", rotulo: `Prazo: ${nomePrazo}`, aoTirar: () => setPrazo("todos") },
    cofre && { id: "cofre", rotulo: `Cofre: ${nomeCofre(cofre)}`, aoTirar: () => setCofre("") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);
  const alternar = (f: FiltroPrazo) => setPrazo(prazo === f ? "todos" : f);

  const situacao = (c: LinhaCertificado) =>
    c.dias === null ? { texto: "Sem data de validade", tom: "neutro" as const } : situacaoDoVencimento(c.dias);
  const carregando = hub.carregando && !hub.dados;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Certificados digitais"
        descricao="Todos os certificados guardados pela MDC, no cofre do HUB e no Ledgra Link, com a data de validade de cada um."
        acoes={
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: "Certificados digitais",
              subtitulo: [
                nomePrazo,
                ...filtrosAtivos.filter((f) => f.id !== "prazo").map((f) => f.rotulo),
                `${lista.length} certificado(s)`,
                `situação em ${fmtData(hoje)}`,
              ].join(" · "),
              arquivo: nomeArquivo("Certificados digitais", nomePrazo, hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Vence em", valor: (c) => (c.vence_em ? fmtData(c.vence_em) : "—"), peso: 0.9, largura: 12 },
                { titulo: "Situação", valor: (c) => situacao(c).texto, peso: 1.1, largura: 20, alerta: (c) => (c.dias ?? 0) < 0 },
                { titulo: "Titular", valor: (c) => c.titular, peso: 2.2, largura: 36 },
                { titulo: "CNPJ/CPF", valor: (c) => formatarDocumento(c.documento), peso: 1.2, largura: 20 },
                { titulo: "Uso", valor: (c) => c.uso, peso: 1.8, largura: 32 },
                { titulo: "Cofre", valor: (c) => nomeCofre(c.cofre), peso: 0.9, largura: 14 },
                { titulo: "Emissor", valor: (c) => c.emissor, peso: 1.2, largura: 24 },
              ],
            })}
          />
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input type="search" placeholder="Empresa, CNPJ ou uso" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="campo">
          <span>Prazo</span>
          <select value={prazo} onChange={(e) => setPrazo(e.target.value as FiltroPrazo)}>
            {FILTROS_PRAZO.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Cofre</span>
          <select value={cofre} onChange={(e) => setCofre(e.target.value as Cofre | "")}>
            <option value="">Os dois cofres</option>
            {COFRES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </CartaoFiltros>

      {aviso}
      {hub.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {hub.erro}
        </p>
      )}
      {!link.carregando && (link.erro || (link.dados && !link.dados.ligado)) && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Certificados dos bancos (Ledgra Link) não aparecem agora. {link.erro ?? link.dados?.mensagem} Os do cofre do HUB estão na lista
            normalmente.
          </span>
        </p>
      )}

      {carregando ? (
        <Esqueleto indicadores={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Vencidos"
              icone="alerta"
              valor={String(contagem.vencidos)}
              detalhe="precisam de renovação"
              tom={contagem.vencidos ? "vermelho" : "neutro"}
              ativo={prazo === "vencidos"}
              aoClicar={() => alternar("vencidos")}
            />
            <Indicador
              titulo="Em até 7 dias"
              icone="relogio"
              valor={String(contagem.d7)}
              detalhe="renovar nesta semana"
              tom={contagem.d7 ? "ambar" : "neutro"}
              ativo={prazo === "7"}
              aoClicar={() => alternar("7")}
            />
            <Indicador
              titulo="Em até 30 dias"
              icone="calendario"
              valor={String(contagem.d30)}
              detalhe="providenciar a renovação"
              tom="azul"
              ativo={prazo === "30"}
              aoClicar={() => alternar("30")}
            />
            <Indicador
              titulo="Em até 60 dias"
              icone="calendario"
              valor={String(contagem.d60)}
              detalhe="no radar"
              tom="neutro"
              ativo={prazo === "60"}
              aoClicar={() => alternar("60")}
            />
          </div>

          {!lista.length ? (
            todos.length ? (
              <EstadoVazio
                icone="filtro"
                titulo="Nada neste filtro"
                acao={
                  <button className="btn" onClick={limparFiltros}>
                    <Icone nome="filtro" className="h-4 w-4" />
                    Limpar filtros
                  </button>
                }
              >
                Troque o prazo ou o cofre, ou limpe os filtros para ver todos os certificados.
              </EstadoVazio>
            ) : (
              <EstadoVazio icone="escudo" titulo="Nenhum certificado guardado ainda">
                O certificado da MDC para assinar os demonstrativos é enviado em Demonstrativos › Certificado; o de cada empresa para as
                notas fiscais, em Financeiro › Certificado digital. Os certificados dos bancos são cadastrados no Ledgra Link. Assim que forem
                enviados, aparecem aqui com a validade.
              </EstadoVazio>
            )
          ) : (
            <QuadroTabela rotulo="Certificados digitais">
              <thead>
                <tr>
                  <th>Titular e uso</th>
                  <th>CNPJ/CPF</th>
                  <th>Cofre</th>
                  <th>Vence em</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const s = situacao(c);
                  return (
                    <tr key={c.chave}>
                      <td className="celula-titulo min-w-56">
                        {c.titular}
                        <span className="block text-xs font-normal text-[var(--texto-suave)]">
                          {c.uso}
                          {c.emissor && ` · emitido por ${c.emissor}`}
                        </span>
                      </td>
                      <td data-rotulo="CNPJ/CPF" className="num whitespace-nowrap">
                        {formatarDocumento(c.documento) || "—"}
                      </td>
                      <td data-rotulo="Cofre">{nomeCofre(c.cofre)}</td>
                      <td data-rotulo="Vence em" className="num whitespace-nowrap">
                        {c.vence_em ? fmtData(c.vence_em) : "—"}
                      </td>
                      <td data-rotulo="Situação">
                        <Chip tom={s.tom}>{s.texto}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </QuadroTabela>
          )}
        </>
      )}

      <p className="flex items-start gap-2 text-xs text-[var(--texto-suave)]">
        <Icone nome="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          A lista mostra só dados públicos do certificado; o arquivo e a senha ficam guardados e criptografados em cada cofre. Os
          certificados do cofre do HUB também entram em Vencimentos, com aviso aos 60, 30 e 7 dias e tarefa de renovação.
        </span>
      </p>
    </div>
  );
}
