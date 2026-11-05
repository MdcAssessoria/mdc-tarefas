// Estoque › Inventário guiado: 1) escolha o estoque (e o grupo), 2) imprima a folha de contagem, 3) digite o que
// contou, 4) confira as diferenças e grave. O HUB lança só a diferença de cada item, tudo de uma vez (est_inventario).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { traduzirErro } from "@/lib/erros";
import { hojeISO } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { numeroBr } from "../regras";
import { combinaBusca, custoBase, qtdBr } from "../estoqueRegras";
import { gravarInventario } from "../repositorio";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import type { PropsAba } from "./Comuns";
import { useBaseEstoque } from "./estoqueBase";
import { Icone } from "@/components/ui/Icone";

export function EstoqueInventario({ cliente, podeOperar, avisar }: PropsAba) {
  const { org } = useOrg();
  const hoje = hojeISO(org.fuso);
  const base = useBaseEstoque(cliente.id);
  const d = base.dados;
  const locaisAtivos = (d?.locais ?? []).filter((l) => l.ativo);
  const [localEscolhido, setLocal] = useState("");
  const local = localEscolhido || (locaisAtivos.find((l) => l.padrao) ?? locaisAtivos[0])?.id || "";
  const [grupo, setGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState("");
  const [contado, setContado] = useState<Record<string, string>>({});
  const [conferir, setConferir] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");

  const nomeGrupo = new Map((d?.grupos ?? []).map((g) => [g.id, g.nome]));
  const linhas = (d?.itens ?? [])
    .filter((i) => i.controla_estoque && i.ativo)
    .map((i) => {
      const sistema = Number(d!.saldos.find((s) => s.item_id === i.id && s.local_id === local)?.saldo ?? 0);
      const txt = contado[i.id] ?? "";
      const c = txt.trim() ? numeroBr(txt) : null;
      const dif = c == null || Number.isNaN(c) ? null : Math.round((c - sistema) * 10000) / 10000;
      return { i, sistema, txt, contado: c, dif, custo: custoBase(i) ?? 0, grupo: i.grupo_id ? (nomeGrupo.get(i.grupo_id) ?? "") : "" };
    });
  const lista = linhas.filter(
    (x) => (!grupo || x.i.grupo_id === grupo) && combinaBusca([x.i.nome, x.i.codigo, x.i.codigo_barras, x.grupo], busca),
  );
  const preenchidos = linhas.filter((x) => x.contado != null);
  const invalidos = preenchidos.filter((x) => Number.isNaN(x.contado) || (x.contado ?? 0) < 0);
  const comDiferenca = preenchidos.filter((x) => x.dif);
  const valorDif = comDiferenca.reduce((a, x) => a + (x.dif ?? 0) * x.custo, 0);
  const nomeLocal = locaisAtivos.find((l) => l.id === local)?.nome ?? "";

  async function gravar() {
    setGravando(true);
    setErro("");
    try {
      const r = await gravarInventario({
        local,
        data,
        observacao: obs.trim() || null,
        itens: preenchidos.map((x) => ({ item: x.i.id, contado: x.contado! })),
      });
      avisar(`Inventário gravado: ${r.ajustados} item(ns) ajustado(s), ${r.iguais} já estavam certos.`);
      setContado({});
      setConferir(false);
      base.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setGravando(false);
    }
  }

  if (base.carregando && !d) return <Carregando />;
  if (base.erro) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{base.erro}</p>;
  if (!locaisAtivos.length) return <EstadoVazio>Cadastre um estoque (Estoque › Estoques) antes de fazer o inventário.</EstadoVazio>;

  return (
    <div className="space-y-3">
      <ol className="grid gap-2 text-sm sm:grid-cols-4">
        {["Escolha o estoque", "Imprima a folha de contagem", "Digite o que contou", "Confira e grave"].map((t, k) => (
          <li key={t} className="cartao flex items-center gap-2 p-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--marca)] text-xs font-semibold text-white">
              {k + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo">
          <span>Estoque contado</span>
          <select
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              setContado({});
            }}
          >
            {locaisAtivos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Grupo</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {(d?.grupos ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo min-w-48 flex-1">
          <span>Achar item</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou código de barras" />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <BotoesExportar
            vazio={!lista.length}
            avisar={avisar}
            montar={() => ({
              titulo: "Folha de contagem",
              subtitulo: `${nomeCliente(cliente)} · ${nomeLocal} · ${fmtData(data)} · escreva na coluna "Contado" a quantidade encontrada`,
              arquivo: nomeArquivo("Folha-contagem", nomeLocal, data),
              logoUrl: org.logo_url,
              paisagem: false,
              linhas: lista,
              colunas: [
                { titulo: "Código", valor: (x) => x.i.codigo ?? "", peso: 0.9, largura: 12 },
                { titulo: "Item", valor: (x) => x.i.nome, peso: 3, largura: 40 },
                { titulo: "Un.", valor: (x) => x.i.unidade, peso: 0.5, largura: 6 },
                { titulo: "Sistema", valor: (x) => x.sistema, formato: "numero", peso: 0.9 },
                { titulo: "Contado", valor: (x) => x.contado, formato: "numero", peso: 1.2 },
              ],
            })}
          />
        </div>
      </div>
      {podeOperar && (
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            className="btn"
            onClick={() =>
              setContado((c) => ({
                ...c,
                ...Object.fromEntries(lista.filter((x) => !x.txt.trim()).map((x) => [x.i.id, String(x.sistema).replace(".", ",")])),
              }))
            }
            title="Para os itens que você conferiu e estão certos"
          >
            Preencher os em branco com o saldo do sistema
          </button>
          {preenchidos.length > 0 && (
            <button className="btn" onClick={() => setContado({})}>
              Limpar contagem
            </button>
          )}
        </div>
      )}
      {!lista.length ? (
        <EstadoVazio>Nenhum item que controla estoque neste filtro.</EstadoVazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">No sistema</th>
                <th className="text-right">Contado</th>
                <th className="text-right">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.i.id} className={x.dif ? "bg-amber-50/50" : ""}>
                  <td className="min-w-48">
                    <span className="font-medium">{x.i.nome}</span>
                    <span className="block text-xs text-neutral-500">
                      {[x.i.codigo && `cód. ${x.i.codigo}`, x.grupo].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {qtdBr(x.sistema)} {x.i.unidade}
                  </td>
                  <td className="text-right">
                    <input
                      aria-label={`Quantidade contada de ${x.i.nome}`}
                      className="w-24 rounded-md border border-[var(--borda)] px-2 py-1 text-right tabular-nums"
                      inputMode="decimal"
                      value={x.txt}
                      disabled={!podeOperar}
                      onChange={(e) => setContado((c) => ({ ...c, [x.i.id]: e.target.value }))}
                    />
                  </td>
                  <td
                    className={`whitespace-nowrap text-right tabular-nums ${x.dif ? (x.dif > 0 ? "text-emerald-800" : "text-red-700") : "text-neutral-400"}`}
                  >
                    {x.dif == null ? "—" : x.dif === 0 ? "ok" : `${x.dif > 0 ? "+" : ""}${qtdBr(x.dif)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeOperar && (
        <div className="cartao sticky bottom-2 flex flex-wrap items-center gap-3 p-3 text-sm">
          <span>
            <strong>{preenchidos.length}</strong> contado(s) · <strong>{comDiferenca.length}</strong> com diferença ·{" "}
            <span className={valorDif < 0 ? "text-red-700" : "text-emerald-800"}>{brl(valorDif)}</span>
          </span>
          <button className="btn-primario ml-auto" disabled={!preenchidos.length} onClick={() => setConferir(true)}>
            Conferir e gravar
          </button>
        </div>
      )}
      {conferir && (
        <Modal
          titulo="Conferir o inventário"
          descricao={`${nomeLocal} · os itens não contados ficam como estão.`}
          aoFechar={() => setConferir(false)}
          largura="xl"
        >
          {invalidos.length > 0 ? (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
              Confira a quantidade de: {invalidos.map((x) => x.i.nome).join(", ")} (número, sem sinal de menos).
            </p>
          ) : (
            <>
              <p className="text-sm">
                {comDiferenca.length
                  ? `${comDiferenca.length} item(ns) vão ser ajustados (diferença de ${brl(valorDif)} pelo custo médio):`
                  : "Nenhuma diferença: tudo bate com o sistema. Gravar registra só a conferência."}
              </p>
              {comDiferenca.length > 0 && (
                <ul className="max-h-60 space-y-1 overflow-auto text-sm">
                  {comDiferenca.map((x) => (
                    <li key={x.i.id} className="flex justify-between gap-2 border-b border-[var(--borda)] py-1">
                      <span>{x.i.nome}</span>
                      <span className="tabular-nums">
                        {qtdBr(x.sistema)}
                        <Icone nome="seta-direita" className="mx-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--texto-suave)]" />
                        <strong>{qtdBr(x.contado)}</strong> ({x.dif! > 0 ? "+" : ""}
                        {qtdBr(x.dif)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="campo">
                  <span>Data da contagem</span>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </label>
                <label className="campo">
                  <span>Observação</span>
                  <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: Inventário de fim de ano" />
                </label>
              </div>
            </>
          )}
          {erro && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={() => setConferir(false)}>
              Voltar
            </button>
            <button className="btn-primario" onClick={gravar} disabled={gravando || invalidos.length > 0}>
              {gravando ? "Gravando…" : "Gravar inventário"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
