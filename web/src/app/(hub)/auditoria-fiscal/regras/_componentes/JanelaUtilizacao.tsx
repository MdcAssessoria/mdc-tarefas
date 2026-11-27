// Janela "Nova utilização" / "Editar utilização" da Auditoria fiscal › Regras de validação: o de-para de cada
// utilização do SAP (entrada ou saída) com os CFOPs aceitos e a regra de cada imposto. Grava no Ledgra (ledgra-regras).
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { traduzirErro } from "@/lib/erros";
import { conferirUtilizacao, lerCodigos, NATUREZAS, type Natureza, type Utilizacao } from "@/dominios/auditoriaFiscal/regras";

const CAMPOS_CODIGOS = [
  { chave: "cfops", rotulo: "CFOPs aceitos", dica: "Ex.: 1556, 2556" },
  { chave: "cst_icms", rotulo: "CST do ICMS aceitos", dica: "Ex.: 90" },
  { chave: "cst_ipi", rotulo: "CST do IPI aceitos", dica: "Ex.: 49" },
  { chave: "cst_pis_real", rotulo: "CST do PIS/COFINS — Lucro Real", dica: "Ex.: 98" },
  { chave: "cst_pis_presumido", rotulo: "CST do PIS/COFINS — Presumido", dica: "Ex.: 70" },
] as const;
type ChaveCodigos = (typeof CAMPOS_CODIGOS)[number]["chave"];

export function JanelaUtilizacao({
  inicial,
  podeTodas,
  aoSalvar,
  aoFechar,
}: {
  inicial: Utilizacao | null;
  podeTodas: boolean;
  aoSalvar: (dados: Record<string, unknown>) => Promise<void>;
  aoFechar: () => void;
}) {
  const [utilizacao, setUtilizacao] = useState(inicial?.utilizacao ?? "");
  const [sentido, setSentido] = useState<"E" | "S">(inicial?.sentido ?? "E");
  const [natureza, setNatureza] = useState<Natureza>(inicial?.natureza ?? "fiscal");
  const [credito, setCredito] = useState(inicial?.credito_icms ?? false);
  const [codigos, setCodigos] = useState<Record<ChaveCodigos, string>>({
    cfops: inicial?.cfops.join(", ") ?? "",
    cst_icms: inicial?.cst_icms.join(", ") ?? "",
    cst_ipi: inicial?.cst_ipi.join(", ") ?? "",
    cst_pis_real: inicial?.cst_pis_real.join(", ") ?? "",
    cst_pis_presumido: inicial?.cst_pis_presumido.join(", ") ?? "",
  });
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [fundamento, setFundamento] = useState(inicial?.fundamento ?? "");
  const [todas, setTodas] = useState(inicial ? inicial.empresa_id === null : false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const listas = {
      cfops: lerCodigos(codigos.cfops),
      cst_icms: lerCodigos(codigos.cst_icms),
      cst_ipi: lerCodigos(codigos.cst_ipi),
      cst_pis_real: lerCodigos(codigos.cst_pis_real),
      cst_pis_presumido: lerCodigos(codigos.cst_pis_presumido),
    };
    const problema = conferirUtilizacao({ utilizacao, ...listas });
    if (problema) return setErro(problema);
    setErro("");
    setOcupado(true);
    try {
      await aoSalvar({
        id: inicial?.id ?? null,
        utilizacao: utilizacao.trim(),
        sentido,
        natureza,
        credito_icms: credito,
        ...listas,
        observacao: observacao.trim() || null,
        fundamento: fundamento.trim() || null,
        todas,
      });
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={inicial ? "Editar utilização" : "Nova utilização do SAP"}
      descricao="Diga quais CFOPs e CSTs são aceitos para esta utilização. O Ledgra aponta o que vier diferente (regras R23 e R25 a R28)."
      largura="4xl"
      aoFechar={aoFechar}
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="submit" form="form-utilizacao" className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar utilização"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-utilizacao" onSubmit={salvar} className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="campo">
            <span>Utilização (como está no SAP)</span>
            <input required value={utilizacao} onChange={(e) => setUtilizacao(e.target.value)} placeholder="Ex.: Uso e consumo" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Sentido</span>
              <select value={sentido} onChange={(e) => setSentido(e.target.value as "E" | "S")}>
                <option value="E">Entrada</option>
                <option value="S">Saída</option>
              </select>
            </label>
            <label className="campo">
              <span>Natureza</span>
              <select value={natureza} onChange={(e) => setNatureza(e.target.value as Natureza)}>
                {NATUREZAS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={credito} onChange={(e) => setCredito(e.target.checked)} />
            Dá direito a crédito de ICMS
          </label>
          <label className="campo">
            <span>Observação (opcional)</span>
            <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <label className="campo">
            <span>Fundamento (opcional)</span>
            <input value={fundamento} onChange={(e) => setFundamento(e.target.value)} placeholder="Ex.: LC 87/96, art. 33, I" />
          </label>
          {podeTodas && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
              Vale para todas as empresas (senão, só para esta)
            </label>
          )}
        </div>
        <div className="space-y-3">
          {CAMPOS_CODIGOS.map((c) => (
            <label key={c.chave} className="campo">
              <span>{c.rotulo}</span>
              <input
                value={codigos[c.chave]}
                onChange={(e) => setCodigos((x) => ({ ...x, [c.chave]: e.target.value }))}
                placeholder={`${c.dica} (vazio = não confere)`}
                inputMode="numeric"
              />
            </label>
          ))}
        </div>
      </form>
    </Modal>
  );
}
