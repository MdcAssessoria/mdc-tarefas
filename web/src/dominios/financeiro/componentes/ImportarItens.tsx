// Importar itens por planilha (Excel ou CSV): baixar o modelo, escolher o arquivo, conferir a prévia (novo, atualiza,
// com erro) e gravar tudo de uma vez. Item que já existe (mesmo código ou, sem código, mesmo nome) só tem atualizados
// os campos preenchidos na planilha.
"use client";

import { useMemo, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { exportarExcel } from "@/lib/arquivos/excel";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { Modal } from "@/components/ui/Modal";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import type { Cliente } from "@/dominios/clientes/tipos";
import { COLUNAS_MODELO, EXEMPLO_MODELO, lerPlanilhaItens } from "../planilhaItens";
import type { LeituraPlanilhaItens } from "../planilhaItens";
import { normalizar, qtdBr } from "../estoqueRegras";
import { importarItens } from "../repositorio";
import type { Item } from "../tipos";

export async function baixarModeloItens() {
  await exportarExcel(
    "Modelo-importacao-de-itens.xlsx",
    "Modelo para importar itens",
    "Preencha uma linha por item; só o Nome é obrigatório.",
    [
      {
        nome: "Itens",
        colunas: COLUNAS_MODELO.map((t, i) => ({ titulo: t, chave: `c${i}`, largura: i === 1 ? 36 : 16 })),
        linhas: EXEMPLO_MODELO.map((l) => Object.fromEntries(l.map((v, i) => [`c${i}`, v]))),
      },
    ],
  );
}

export function ImportarItens({
  cliente,
  itens,
  aoFechar,
  aoImportar,
}: {
  cliente: Cliente;
  itens: Item[];
  aoFechar: () => void;
  aoImportar: (msg: string) => void;
}) {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraPlanilhaItens | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [soValidas, setSoValidas] = useState(false);
  const [erro, setErro] = useState("");

  const porCodigo = useMemo(() => new Map(itens.filter((i) => i.codigo).map((i) => [i.codigo!, i])), [itens]);
  const porNome = useMemo(() => new Map(itens.map((i) => [normalizar(i.nome), i])), [itens]);
  const linhas = useMemo(
    () =>
      (leitura?.linhas ?? []).map((l) => {
        const existente =
          (l.dados.codigo && porCodigo.get(l.dados.codigo)) || (!l.dados.codigo && l.dados.nome && porNome.get(normalizar(l.dados.nome)));
        return { ...l, existente: existente || null };
      }),
    [leitura, porCodigo, porNome],
  );
  const comErro = linhas.filter((l) => l.erros.length).length;
  const validas = linhas.filter((l) => !l.erros.length);
  const novos = validas.filter((l) => !l.existente).length;

  async function escolher(arqs: File[]) {
    const arq = arqs[0];
    if (!arq) return;
    setErro("");
    setLeitura(null);
    setArquivo(arq.name);
    setLendo(true);
    try {
      const { abas, dados } = await lerPlanilha(arq);
      setLeitura(lerPlanilhaItens(dados[abas[0]] ?? []));
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setLendo(false);
    }
  }

  async function gravar() {
    if (!validas.length) return;
    setGravando(true);
    setErro("");
    try {
      const r = await importarItens(
        cliente.id,
        validas.map((l) => l.dados),
      );
      aoImportar(
        `Importação concluída: ${r.novos} item(ns) novo(s), ${r.atualizados} atualizado(s)${r.saldos ? `, ${r.saldos} com saldo inicial` : ""}.`,
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setGravando(false);
    }
  }

  return (
    <Modal
      titulo="Importar itens de uma planilha"
      descricao="Traga o cadastro de outro sistema ou de uma planilha sua. Nada é gravado antes de você conferir."
      aoFechar={aoFechar}
      largura="4xl"
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
        <li>
          Baixe o{" "}
          <button type="button" className="btn-link" onClick={() => baixarModeloItens().catch((e) => setErro(traduzirErro(e)))}>
            modelo em Excel
          </button>{" "}
          (ou use a sua planilha: o HUB reconhece colunas como Descrição, Preço, Custo, EAN, Saldo).
        </li>
        <li>Uma linha por item. Só o nome é obrigatório. Item com o mesmo código (ou nome) do cadastro é atualizado.</li>
        <li>Escolha o arquivo abaixo, confira a prévia e clique em Importar.</li>
      </ol>
      <CampoArquivo accept=".xlsx,.xls,.csv" aoEscolher={escolher} escolhido={arquivo} ocupado={lendo} compacto />
      {leitura && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="chip bg-emerald-50 text-emerald-800">{novos} novo(s)</span>
            <span className="chip bg-sky-50 text-sky-900">{validas.length - novos} vão ser atualizados</span>
            <span className={`chip ${comErro ? "bg-red-50 text-red-800" : "bg-neutral-100 text-neutral-600"}`}>{comErro} com erro</span>
          </div>
          <p className="text-xs text-neutral-500">Colunas entendidas: {leitura.colunas.join(", ") || "nenhuma"}.</p>
          {leitura.avisos.map((a) => (
            <p key={a} className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {a}
            </p>
          ))}
          <div className="max-h-80 overflow-auto rounded-md border border-[var(--borda)]">
            <table className="tabela text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Linha</th>
                  <th>Situação</th>
                  <th>Item</th>
                  <th className="text-right">Preço</th>
                  <th className="text-right">Saldo inicial</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 500).map((l) => (
                  <tr key={l.linha} className={l.erros.length ? "bg-red-50/50" : ""}>
                    <td className="tabular-nums">{l.linha}</td>
                    <td>
                      {l.erros.length ? (
                        <span className="chip bg-red-50 text-red-800">Com erro</span>
                      ) : l.existente ? (
                        <span className="chip bg-sky-50 text-sky-900">Atualiza</span>
                      ) : (
                        <span className="chip bg-emerald-50 text-emerald-800">Novo</span>
                      )}
                    </td>
                    <td className="min-w-56">
                      {l.dados.nome ?? l.existente?.nome ?? "—"}
                      <span className="block text-xs text-neutral-500">
                        {[
                          l.dados.codigo && `cód. ${l.dados.codigo}`,
                          l.dados.tipo === "servico" ? "Serviço" : null,
                          l.dados.unidade,
                          l.dados.grupo_nome,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {l.erros.map((e) => (
                        <span key={e} className="block text-xs text-red-800">
                          {e}
                        </span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {l.dados.preco_venda != null ? brl(l.dados.preco_venda) : "—"}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {l.dados.saldo_inicial ? (
                        l.existente ? (
                          <span title="Item já existe: o saldo não muda pela importação">ignorado</span>
                        ) : (
                          qtdBr(l.dados.saldo_inicial)
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {linhas.length > 500 && (
            <p className="text-xs text-neutral-500">Mostrando as 500 primeiras de {linhas.length} linhas; todas serão importadas.</p>
          )}
          {comErro > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={soValidas} onChange={(e) => setSoValidas(e.target.checked)} />
              Importar só as {validas.length} linhas sem erro (as {comErro} com erro ficam de fora)
            </label>
          )}
        </>
      )}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
        <button className="btn-primario" onClick={gravar} disabled={!validas.length || gravando || (comErro > 0 && !soValidas)}>
          {gravando ? "Importando…" : `Importar ${validas.length} item(ns)`}
        </button>
      </div>
    </Modal>
  );
}
