// Societário › Documentos dos clientes: o acervo permanente de documentos societários de cada cliente (contrato
// social, alterações, consolidação, cartão CNPJ, documentos dos sócios…). Filtros por cliente (também pelo link
// "?cliente=" da ficha do processo), tipo, situação e busca; PDF/Excel do que está filtrado; Guardar documento,
// Editar ficha (operar) e Retirar do acervo com motivo (gerir). Gravação só pelas funções soc_documento_* (073).
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { plural } from "@/lib/formato/numero";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { abrirArquivo } from "@/lib/arquivos/armazenamento";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { traduzirErro } from "@/lib/erros";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { CartaoFiltros } from "@/components/ui/CartaoFiltros";
import type { FiltroAtivo } from "@/components/ui/CartaoFiltros";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { useAviso } from "@/components/ui/Aviso";
import { CATEGORIAS, casaBusca, nomeCategoria } from "@/dominios/societario/acervo";
import type { DocumentoAcervo } from "@/dominios/societario/acervo";
import { lerAcervo } from "@/dominios/societario/leituras";
import { JanelaEditarAcervo, JanelaGuardarAcervo } from "@/dominios/societario/componentes/JanelasAcervo";

export default function PaginaDocumentosClientes() {
  return (
    <Suspense>
      <DocumentosClientes />
    </Suspense>
  );
}

type Situacao = "vigentes" | "substituidos" | "todos";
const SITUACOES: { id: Situacao; nome: string }[] = [
  { id: "vigentes", nome: "Vigentes" },
  { id: "substituidos", nome: "Substituídos" },
  { id: "todos", nome: "Todos" },
];

function DocumentosClientes() {
  const { org, clientes, clientePorId, pode } = useOrg();
  const params = useSearchParams();
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const podeOperar = pode("societario", "operar");
  const podeGerir = pode("societario", "gerir");
  const [cliente, setCliente] = useState(params.get("cliente") ?? "");
  const [categoria, setCategoria] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("vigentes");
  const [busca, setBusca] = useState("");
  const [guardar, setGuardar] = useState(false);
  const [editar, setEditar] = useState<DocumentoAcervo | null>(null);
  const [retirar, setRetirar] = useState<DocumentoAcervo | null>(null);

  const consulta = useConsulta(useCallback(() => lerAcervo(org.id), [org.id]));
  const todos = consulta.dados;
  const nomeDe = useCallback((id: string) => nomeCliente(clientePorId(id), "—"), [clientePorId]);

  const lista = useMemo(
    () =>
      (todos ?? []).filter(
        (d) =>
          (!cliente || d.cliente_id === cliente) &&
          (!categoria || d.categoria === categoria) &&
          (situacao === "todos" || (situacao === "vigentes" ? d.vigente : !d.vigente)) &&
          (!busca.trim() || casaBusca(d, busca, nomeDe(d.cliente_id))),
      ),
    [todos, cliente, categoria, situacao, busca, nomeDe],
  );

  const comAcervo = new Set((todos ?? []).map((d) => d.cliente_id));
  const clientesDoFiltro = clientes.filter((c) => comAcervo.has(c.id) || c.id === cliente);
  const nomeSituacao = SITUACOES.find((s) => s.id === situacao)?.nome ?? "";

  function limparFiltros() {
    setCliente("");
    setCategoria("");
    setSituacao("vigentes");
    setBusca("");
  }
  const filtrosAtivos: FiltroAtivo[] = [
    cliente && { id: "cliente", rotulo: `Cliente: ${nomeDe(cliente)}`, aoTirar: () => setCliente("") },
    categoria && { id: "tipo", rotulo: `Tipo: ${nomeCategoria(categoria)}`, aoTirar: () => setCategoria("") },
    situacao !== "vigentes" && { id: "situacao", rotulo: `Situação: ${nomeSituacao}`, aoTirar: () => setSituacao("vigentes") },
    busca.trim() && { id: "busca", rotulo: `Busca: "${busca.trim()}"`, aoTirar: () => setBusca("") },
  ].filter((f): f is FiltroAtivo => !!f);

  async function confirmarRetirada(motivo: string) {
    if (!retirar) return;
    exigir(await supabase().rpc("soc_documento_retirar", { p_doc: retirar.id, p_motivo: motivo }));
    setRetirar(null);
    mostrar("Documento retirado do acervo. A ficha e o arquivo continuam no histórico.", "sucesso");
    consulta.recarregar();
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Documentos dos clientes"
        descricao="O acervo societário de cada cliente: contrato social, alterações, cartão CNPJ e documentos dos sócios, sempre à mão para o próximo processo."
        acoes={
          <>
            <BotoesExportar
              vazio={!lista.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Documentos dos clientes",
                subtitulo: [
                  nomeSituacao,
                  ...filtrosAtivos.filter((f) => f.id !== "situacao").map((f) => f.rotulo),
                  plural(lista.length, "documento"),
                ].join(" · "),
                arquivo: nomeArquivo("Documentos-dos-clientes", hoje),
                logoUrl: org.logo_url,
                linhas: lista,
                colunas: [
                  { titulo: "Cliente", valor: (d) => nomeDe(d.cliente_id), peso: 2.2, largura: 34 },
                  { titulo: "Tipo", valor: (d) => nomeCategoria(d.categoria), peso: 1.4, largura: 24 },
                  { titulo: "Descrição", valor: (d) => d.descricao ?? "", peso: 2, largura: 34 },
                  { titulo: "Data", valor: (d) => fmtData(d.data_documento), peso: 0.8, largura: 12 },
                  { titulo: "Registro na Junta", valor: (d) => d.registro ?? "", peso: 1.2, largura: 20 },
                  { titulo: "Processo", valor: (d) => d.processo?.numero ?? "", formato: "numero", peso: 0.6, largura: 10 },
                  { titulo: "Situação", valor: (d) => (d.vigente ? "Vigente" : "Substituído"), peso: 0.9, largura: 13 },
                  { titulo: "Arquivo", valor: (d) => d.arquivo?.nome ?? "", peso: 1.8, largura: 34 },
                ],
              })}
            />
            {podeOperar && (
              <button className="btn-primario" onClick={() => setGuardar(true)}>
                <Icone nome="mais" className="h-4 w-4" />
                Guardar documento
              </button>
            )}
          </>
        }
      />

      <CartaoFiltros ativos={filtrosAtivos} aoLimpar={limparFiltros}>
        <label className="campo campo-largo">
          <span>Buscar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente, tipo, descrição ou nome do arquivo"
          />
        </label>
        <label className="campo">
          <span>Cliente</span>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos os clientes</option>
            {clientesDoFiltro.map((c) => (
              <option key={c.id} value={c.id}>
                {nomeCliente(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Tipo</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todos os tipos</option>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            {SITUACOES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
      </CartaoFiltros>

      {aviso}
      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {consulta.carregando && !todos ? (
        <Esqueleto />
      ) : !todos ? null : !todos.length ? (
        <EstadoVazio
          icone="pasta"
          titulo="O acervo ainda está vazio"
          acao={
            podeOperar && (
              <button className="btn-primario" onClick={() => setGuardar(true)}>
                <Icone nome="mais" className="h-4 w-4" />
                Guardar o primeiro documento
              </button>
            )
          }
        >
          Guarde aqui o contrato social, as alterações registradas, o cartão CNPJ e os documentos dos sócios de cada cliente. Na próxima
          alteração contratual eles aparecem na ficha do processo como base. Também dá para levar para cá um anexo de processo pelo botão
          &quot;Guardar no acervo&quot;.
        </EstadoVazio>
      ) : !lista.length ? (
        <EstadoVazio
          icone="filtro"
          titulo="Nada neste filtro"
          acao={
            <button className="btn" onClick={limparFiltros}>
              <Icone nome="fechar" className="h-4 w-4" />
              Limpar filtros
            </button>
          }
        >
          Nenhum documento combina com os filtros. Troque a situação para &quot;Todos&quot; ou limpe os filtros.
        </EstadoVazio>
      ) : (
        <>
          <p className="text-sm text-[var(--texto-suave)]">{plural(lista.length, "documento")} neste filtro.</p>
          <div className="overflow-x-auto rounded-xl border border-[var(--borda)] bg-white">
            <table className="tabela w-full min-w-[820px] text-sm">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Situação</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium whitespace-nowrap">{nomeDe(d.cliente_id)}</td>
                    <td className="whitespace-nowrap">
                      {nomeCategoria(d.categoria)}
                      {d.processo_id && d.processo && (
                        <Link href={`/societario/${d.processo_id}`} className="btn-link flex items-center gap-1 text-xs">
                          <Icone nome="expandir" className="h-3 w-3" />
                          do processo nº {d.processo.numero}
                        </Link>
                      )}
                    </td>
                    <td className="max-w-[240px]">
                      <span className="block truncate" title={d.descricao ?? d.arquivo?.nome}>
                        {d.descricao || d.arquivo?.nome || "—"}
                      </span>
                      {d.registro && <span className="block truncate text-xs text-[var(--texto-suave)]">Junta: {d.registro}</span>}
                    </td>
                    <td className="num whitespace-nowrap">{fmtData(d.data_documento) || "—"}</td>
                    <td>{d.vigente ? <Chip tom="verde">Vigente</Chip> : <Chip tom="neutro">Substituído</Chip>}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="btn !min-h-8 !px-2 text-xs"
                          disabled={!d.arquivo}
                          onClick={() =>
                            d.arquivo && abrirArquivo(d.arquivo.caminho, d.arquivo.nome).catch((e) => mostrar(traduzirErro(e), "erro"))
                          }
                        >
                          <Icone nome="documento" className="h-3.5 w-3.5" />
                          Abrir
                        </button>
                        {podeOperar && (
                          <button className="btn !min-h-8 !px-2 text-xs" onClick={() => setEditar(d)}>
                            <Icone nome="editar" className="h-3.5 w-3.5" />
                            Editar
                          </button>
                        )}
                        {podeGerir && (
                          <button className="btn !min-h-8 !px-2 text-xs text-[var(--perigo)]" onClick={() => setRetirar(d)}>
                            <Icone nome="lixeira" className="h-3.5 w-3.5" />
                            Retirar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {guardar && (
        <JanelaGuardarAcervo
          clienteId={cliente || null}
          aoFechar={() => setGuardar(false)}
          aoSalvo={(m) => {
            setGuardar(false);
            mostrar(m, "sucesso");
            consulta.recarregar();
          }}
        />
      )}
      {editar && (
        <JanelaEditarAcervo
          doc={editar}
          aoFechar={() => setEditar(null)}
          aoSalvo={(m) => {
            setEditar(null);
            mostrar(m, "sucesso");
            consulta.recarregar();
          }}
        />
      )}
      {retirar && (
        <JanelaMotivo
          titulo="Retirar do acervo"
          descricao={`${nomeCategoria(retirar.categoria)} de ${nomeDe(retirar.cliente_id)} sai do acervo, mas a ficha e o arquivo continuam guardados no histórico. Escreva o motivo (pelo menos 5 letras).`}
          botao="Retirar do acervo"
          aoConfirmar={confirmarRetirada}
          aoFechar={() => setRetirar(null)}
        />
      )}
    </div>
  );
}
