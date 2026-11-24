// Janela "Importar planilha da projeção": lê o modelo (abas Projeção e Premissas), mostra o que vai mudar e os erros,
// e aplica ao estudo aberto na tela (a gravação continua em "Gravar estudo").
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { lerPlanilha } from "@/lib/arquivos/planilha";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { aplicarPlanilha, lerPlanilhaProjecao } from "../projecao";
import type { LinhaDre, PlanilhaProjecao, Premissas } from "../projecao";

export function JanelaImportarProjecao({
  linhas,
  anoBase,
  realizado,
  premissas,
  aoFechar,
  aoAplicar,
}: {
  linhas: LinhaDre[];
  anoBase: number;
  realizado: Record<string, number>;
  premissas: Premissas;
  aoFechar: () => void;
  aoAplicar: (p: Premissas) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lido, setLido] = useState<PlanilhaProjecao | null>(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);

  async function escolher(arqs: File[]) {
    const a = arqs[0];
    if (!a) return;
    setArquivo(a);
    setErro("");
    setLido(null);
    setLendo(true);
    try {
      const p = await lerPlanilha(a, true);
      setLido(lerPlanilhaProjecao(p.dados, linhas, anoBase, realizado));
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setLendo(false);
    }
  }

  const linhasComValor = lido ? Object.values(lido.valores).filter((v) => v.some((x) => x != null)).length : 0;
  const pronto = !!lido && lido.erros.length === 0 && (linhasComValor > 0 || lido.anos > 0);
  return (
    <Modal
      titulo="Importar planilha da projeção"
      descricao={`Use a planilha do botão Baixar modelo (ano-base ${anoBase}). Cada coluna de ano é valor positivo; em branco, o HUB calcula. A aba Premissas traz crescimento da receita e inflação.`}
      aoFechar={aoFechar}
      largura="2xl"
      avisoRodape={
        erro ? (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        ) : null
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button
            type="button"
            className="btn-primario"
            disabled={!pronto}
            onClick={() => lido && aoAplicar(aplicarPlanilha(premissas, lido, linhas, anoBase, realizado))}
          >
            <Icone nome="check" className="h-4 w-4" />
            Aplicar ao estudo
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CampoArquivo
          accept=".xlsx,.xls,.csv"
          aoEscolher={escolher}
          titulo="Escolha a planilha da projeção"
          dica="Excel (.xlsx) baixado em Baixar modelo"
          escolhido={arquivo?.name}
          ocupado={lendo}
        />
        {lido && lido.erros.length > 0 && (
          <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">{lido.erros.length} problema(s); nada foi aplicado:</p>
            <ul className="mt-1 list-disc pl-5">
              {lido.erros.slice(0, 10).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {pronto && (
          <p className="flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
            <Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0" />
            {lido!.anos} ano(s) projetado(s), {linhasComValor} linha(s) com valores
            {Object.keys(lido!.base).length ? `, ${Object.keys(lido!.base).length} ajuste(s) no ano-base` : ""}
            {lido!.crescimentoReceita.some((x) => x != null) || lido!.inflacao.some((x) => x != null) ? " e premissas gerais" : ""}.
            Valor igual ao que o HUB já calcula continua calculado; só o que difere fica como digitado.
          </p>
        )}
      </div>
    </Modal>
  );
}
