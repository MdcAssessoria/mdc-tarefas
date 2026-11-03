// Entradas › Lançar nota: notas prontas para lançar (entrada completa, autorizada; NF-e confirmada na SEFAZ), o
// lançamento no modelo do Conta Azul (tipo de entrada → fornecedor → itens → parcelas), as notas já lançadas (com
// "desfazer") e as regras dos tipos de entrada da empresa. Com ?nota=<id> abre direto o lançamento daquela nota.
"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtDataLocal } from "@/lib/formato/datas";
import { Abas } from "@/components/ui/Abas";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { SemEmpresaGestao, useClienteGestao } from "@/dominios/organizacao/componentes/EmpresaEmGestao";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { lerCategorias, lerCentros, lerContas, lerItens, lerLocais, lerPessoas } from "@/dominios/financeiro/leituras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { lerDepara, lerNotas, lerTiposEntrada } from "@/dominios/notas/leituras";
import { desfazerLancamento } from "@/dominios/notas/repositorio";
import { prontaParaLancar } from "@/dominios/notas/regras";
import { tipoEntrada } from "@/dominios/notas/tiposEntrada";
import type { Nota } from "@/dominios/notas/tipos";
import { fornecedorDa, nomeModelo } from "@/dominios/notas/componentes/Comuns";
import { LancarNota } from "@/dominios/notas/componentes/LancarNota";
import { RegrasTipos } from "@/dominios/notas/componentes/RegrasTipos";

type Aba = "prontas" | "lancadas" | "regras";

export default function PaginaLancarNota() {
  return (
    <Suspense>
      <LancarNotaTela />
    </Suspense>
  );
}

function LancarNotaTela() {
  const { org, pode } = useOrg();
  const params = useSearchParams();
  const financeiro = useClienteGestao();
  const cliente = financeiro.cliente;
  const podeOperar = pode("entradas", "operar") || pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [aba, setAba] = useState<Aba>("prontas");
  const [escolhida, setEscolhida] = useState<string | null>(params.get("nota"));
  const [desfazer, setDesfazer] = useState<Nota | null>(null);

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [notas, itens, locais, pessoas, categorias, centros, contas, depara, regras] = await Promise.all([
        lerNotas(cliente.id, { direcao: "entrada" }),
        lerItens(cliente.id),
        lerLocais(cliente.id),
        lerPessoas(cliente.id),
        lerCategorias(cliente.id),
        lerCentros(cliente.id),
        lerContas(cliente.id),
        lerDepara(cliente.id),
        lerTiposEntrada(),
      ]);
      return { notas, cad: { itens, locais, pessoas, categorias, centros, contas, depara, regras } };
    }, [cliente]),
  );
  const d = consulta.dados;
  const prontas = useMemo(() => (d?.notas ?? []).filter(prontaParaLancar), [d?.notas]);
  const lancadas = useMemo(() => (d?.notas ?? []).filter((n) => n.processada), [d?.notas]);
  const aguardando = useMemo(
    () =>
      (d?.notas ?? []).filter((n) => !n.processada && n.modelo === "55" && n.situacao === "autorizada" && n.manifestacao !== "confirmada")
        .length,
    [d?.notas],
  );
  const nota = d?.notas.find((n) => n.id === escolhida) ?? null;
  /** Último tipo usado para o mesmo fornecedor (sugestão). */
  const tipoAnterior = nota
    ? (lancadas
        .filter((n) => n.emitente_doc === nota.emitente_doc && n.tipo_entrada)
        .sort((a, b) => (b.processada_em ?? "").localeCompare(a.processada_em ?? ""))[0]?.tipo_entrada ?? null)
    : null;
  const lista = aba === "lancadas" ? lancadas : prontas;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Lançar nota</h1>
          <p className="text-sm text-neutral-600">Escolha o tipo de entrada e o HUB gera as contas a pagar e a entrada no estoque.</p>
        </div>
        {!nota && aba !== "regras" && (
          <BotoesExportar
            vazio={!lista.length}
            avisar={mostrar}
            montar={() => ({
              titulo: aba === "lancadas" ? "Notas lançadas" : "Notas prontas para lançar",
              subtitulo: `${cliente ? nomeCliente(cliente) : ""} · ${lista.length} nota(s)`,
              arquivo: nomeArquivo(aba === "lancadas" ? "Notas-lancadas" : "Notas-para-lancar", cliente ? nomeCliente(cliente) : "", hoje),
              logoUrl: org.logo_url,
              linhas: lista,
              colunas: [
                { titulo: "Emissão", valor: (n) => fmtDataLocal(n.emissao), largura: 12 },
                { titulo: "Nota", valor: (n) => `${nomeModelo(n.modelo)} ${n.numero ?? ""}`, largura: 14 },
                { titulo: "Fornecedor", valor: (n) => fornecedorDa(n), peso: 3, largura: 40 },
                { titulo: "Tipo de entrada", valor: (n) => tipoEntrada(n.tipo_entrada)?.nome ?? "", peso: 2, largura: 28 },
                { titulo: "Lançada em", valor: (n) => fmtDataLocal(n.processada_em), largura: 12 },
                { titulo: "Valor", valor: (n) => Number(n.valor_total), formato: "moeda", peso: 1.2 },
              ],
              totais: { Valor: lista.reduce((a, n) => a + Number(n.valor_total), 0) },
            })}
          />
        )}
      </div>

      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <SemEmpresaGestao />
      ) : consulta.carregando && !d ? (
        <Carregando />
      ) : nota && d ? (
        nota.processada ? (
          <EstadoVazio
            acao={
              <button className="btn" onClick={() => setEscolhida(null)}>
                Ver a lista
              </button>
            }
          >
            Esta nota já foi lançada.
          </EstadoVazio>
        ) : !prontaParaLancar(nota) ? (
          <EstadoVazio
            acao={
              <Link className="btn" href="/entradas">
                Ir para Notas recebidas
              </Link>
            }
          >
            Esta nota ainda não pode ser lançada:{" "}
            {nota.conteudo === "resumo"
              ? "falta o XML completo (dê ciência e aguarde a próxima busca)"
              : "confirme a operação na SEFAZ primeiro"}
            .
          </EstadoVazio>
        ) : !podeOperar ? (
          <EstadoVazio>Você pode ver as notas, mas lançar exige o nível “operar” em Entradas. Peça ao administrador do Hub.</EstadoVazio>
        ) : (
          <LancarNota
            key={nota.id}
            nota={nota}
            cad={d.cad}
            orgId={org.id}
            tipoAnterior={tipoAnterior}
            aoVoltar={() => setEscolhida(null)}
            aoRecarregarCadastros={consulta.recarregar}
            aoLancar={(msg) => {
              setEscolhida(null);
              mostrar(msg);
              consulta.recarregar();
            }}
          />
        )
      ) : (
        <>
          <Abas<Aba>
            rotulo="Lançar nota"
            valor={aba}
            aoMudar={setAba}
            itens={[
              { id: "prontas", nome: `Prontas para lançar (${prontas.length})` },
              { id: "lancadas", nome: "Lançadas" },
              { id: "regras", nome: "Regras dos tipos de entrada" },
            ]}
          />
          {aba === "regras" ? (
            <RegrasTipos
              cliente={cliente.id}
              orgId={org.id}
              regras={d?.cad.regras ?? []}
              categorias={d?.cad.categorias ?? []}
              podeGerir={pode("entradas", "gerir")}
              avisar={mostrar}
              aoMudar={consulta.recarregar}
            />
          ) : !lista.length ? (
            <EstadoVazio
              acao={
                <Link className="btn" href="/entradas">
                  Ver notas recebidas
                </Link>
              }
            >
              {aba === "lancadas"
                ? "Nenhuma nota lançada ainda."
                : aguardando
                  ? `Nenhuma nota pronta. ${aguardando} NF-e aguardam a confirmação da operação em Notas recebidas.`
                  : "Nenhuma nota pronta para lançar."}
            </EstadoVazio>
          ) : (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Emissão</th>
                    <th>Nota</th>
                    <th>Fornecedor</th>
                    {aba === "lancadas" && <th>Tipo de entrada</th>}
                    <th className="text-right">Valor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((n) => (
                    <tr key={n.id}>
                      <td className="whitespace-nowrap tabular-nums">{fmtDataLocal(n.emissao)}</td>
                      <td className="whitespace-nowrap">
                        {nomeModelo(n.modelo)} {n.numero}
                      </td>
                      <td className="min-w-48">{fornecedorDa(n)}</td>
                      {aba === "lancadas" && <td>{tipoEntrada(n.tipo_entrada)?.nome}</td>}
                      <td className="whitespace-nowrap text-right tabular-nums">{brl(Number(n.valor_total))}</td>
                      <td className="whitespace-nowrap text-right">
                        {podeOperar &&
                          (aba === "lancadas" ? (
                            <button className="btn !min-h-8" onClick={() => setDesfazer(n)}>
                              Desfazer lançamento
                            </button>
                          ) : (
                            <button className="btn-primario !min-h-8" onClick={() => setEscolhida(n.id)}>
                              Lançar
                            </button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {desfazer && (
        <JanelaMotivo
          titulo="Desfazer lançamento"
          descricao={`NF ${desfazer.numero ?? ""} · ${fornecedorDa(desfazer)}. As contas a pagar desta nota são canceladas e as entradas no estoque estornadas (só se nada foi pago). A nota volta para “prontas para lançar”.`}
          botao="Desfazer"
          aoFechar={() => setDesfazer(null)}
          aoConfirmar={async (motivo) => {
            await desfazerLancamento(desfazer.id, motivo);
            setDesfazer(null);
            mostrar("Lançamento desfeito.");
            consulta.recarregar();
          }}
        />
      )}
    </div>
  );
}
