// Janela "Nova regra" / "Editar regra" da Auditoria fiscal › Regras de validação: quando TODAS as condições valem numa
// linha do relatório do SAP, o Ledgra aponta, com gravidade, ajuste sugerido e fundamento. Grava no Ledgra (ledgra-regras).
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { traduzirErro } from "@/lib/erros";
import {
  conferirRegra,
  GRAVIDADES,
  type Catalogo,
  type Condicao,
  type Gravidade,
  type RegraPropria,
} from "@/dominios/auditoriaFiscal/regras";

export function JanelaRegra({
  inicial,
  catalogo,
  podeTodas,
  aoSalvar,
  aoFechar,
}: {
  inicial: RegraPropria | null;
  catalogo: Catalogo;
  podeTodas: boolean;
  aoSalvar: (dados: Record<string, unknown>) => Promise<void>;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [gravidade, setGravidade] = useState<Gravidade>(inicial?.gravidade ?? "ALTA");
  const [ajuste, setAjuste] = useState(inicial?.ajuste ?? "");
  const [fundamento, setFundamento] = useState(inicial?.fundamento ?? "");
  const [todas, setTodas] = useState(inicial ? inicial.empresa_id === null : false);
  const [condicoes, setCondicoes] = useState<Condicao[]>(
    inicial?.condicoes.length ? inicial.condicoes : [{ coluna: "", operador: "igual", valor: "" }],
  );
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const mudar = (i: number, c: Partial<Condicao>) => setCondicoes((cs) => cs.map((x, j) => (j === i ? { ...x, ...c } : x)));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const limpas = condicoes.map((c) => ({
      ...c,
      valor: catalogo.operadores.find((o) => o.operador === c.operador)?.sem_valor ? "" : c.valor.trim(),
    }));
    const problema = conferirRegra({ nome, ajuste, condicoes: limpas }, catalogo);
    if (problema) return setErro(problema);
    setErro("");
    setOcupado(true);
    try {
      await aoSalvar({
        id: inicial?.id ?? null,
        nome: nome.trim(),
        gravidade,
        ajuste: ajuste.trim(),
        fundamento: fundamento.trim() || null,
        condicoes: limpas,
        todas,
      });
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={inicial ? `Editar regra ${inicial.codigo}` : "Nova regra de validação"}
      descricao="Quando todas as condições valem numa linha do relatório do SAP, o Ledgra Auditor aponta. A regra fica no Ledgra e vale lá e aqui."
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
          <button type="submit" form="form-regra" className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Salvando…" : "Salvar regra"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
        </>
      }
    >
      <form id="form-regra" onSubmit={salvar} className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          <label className="campo">
            <span>Nome da regra</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Uso e consumo com crédito de ICMS" />
          </label>
          <label className="campo">
            <span>Gravidade</span>
            <select value={gravidade} onChange={(e) => setGravidade(e.target.value as Gravidade)}>
              {GRAVIDADES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Ajuste sugerido</span>
            <textarea
              required
              rows={3}
              value={ajuste}
              onChange={(e) => setAjuste(e.target.value)}
              placeholder="Ex.: Estornar o crédito de ICMS no SAP"
            />
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
        <fieldset className="space-y-2 lg:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-[var(--marca)]">Quando (todas as condições ao mesmo tempo)</legend>
          {condicoes.map((c, i) => {
            const op = catalogo.operadores.find((o) => o.operador === c.operador);
            return (
              <div key={i} className="grid gap-2 rounded-md border border-[var(--borda)] p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <select
                  aria-label={`Coluna da condição ${i + 1}`}
                  className="entrada min-w-0"
                  value={c.coluna}
                  onChange={(e) => mudar(i, { coluna: e.target.value })}
                >
                  <option value="">Coluna…</option>
                  {catalogo.colunas.map((x) => (
                    <option key={x.coluna} value={x.coluna}>
                      {x.nome}
                    </option>
                  ))}
                </select>
                <select
                  className="entrada min-w-0"
                  aria-label={`Comparação da condição ${i + 1}`}
                  value={c.operador}
                  onChange={(e) => mudar(i, { operador: e.target.value })}
                >
                  {catalogo.operadores.map((o) => (
                    <option key={o.operador} value={o.operador}>
                      {o.nome}
                    </option>
                  ))}
                </select>
                <input
                  className="entrada min-w-0"
                  aria-label={`Valor da condição ${i + 1}`}
                  value={op?.sem_valor ? "" : c.valor}
                  disabled={op?.sem_valor}
                  onChange={(e) => mudar(i, { valor: e.target.value })}
                  placeholder={op?.dica ?? "Valor"}
                />
                <button
                  type="button"
                  className="btn"
                  aria-label={`Tirar a condição ${i + 1}`}
                  disabled={condicoes.length === 1}
                  onClick={() => setCondicoes((cs) => cs.filter((_, j) => j !== i))}
                >
                  <Icone nome="lixeira" className="h-4 w-4" />
                  Tirar
                </button>
              </div>
            );
          })}
          {condicoes.length < 6 && (
            <button
              type="button"
              className="btn"
              onClick={() => setCondicoes((cs) => [...cs, { coluna: "", operador: "igual", valor: "" }])}
            >
              <Icone nome="mais" className="h-4 w-4" />
              Mais uma condição
            </button>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
