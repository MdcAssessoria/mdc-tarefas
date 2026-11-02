// Assistente de contrato de licença em 5 passos: cliente → o que foi vendido (plano ou módulos avulsos) → valor e
// vencimento → reajuste → conferir e salvar. Também edita um contrato ativo (mesmos passos, cliente fixo).
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData, mesExtenso } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { numeroBr, valorParaCampo } from "@/dominios/financeiro/regras";
import { descontoSobreTabela, valorDoMes, vencimentoDaCompetencia } from "../regras";
import { salvarContrato } from "../repositorio";
import { INDICES } from "../tipos";
import type { Contrato, IndiceReajuste, Plano, Produto } from "../tipos";

const PASSOS = ["Cliente", "O que foi vendido", "Valor e vencimento", "Reajuste", "Conferir"];
export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function AssistenteContrato({
  editar,
  clienteInicial,
  produtos,
  planos,
  contratos,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  editar?: Contrato;
  clienteInicial?: string;
  produtos: Produto[];
  planos: Plano[];
  contratos: Contrato[];
  hoje: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const { clientes } = useOrg();
  const ativos = useMemo(() => clientes.filter((c) => c.ativo).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b))), [clientes]);
  const [passo, setPasso] = useState(editar ? 1 : clienteInicial ? 1 : 0);
  const [f, setF] = useState({
    cliente: editar?.cliente_id ?? clienteInicial ?? "",
    busca: "",
    modo: (editar ? (editar.plano_id ? "plano" : "avulso") : planos.some((p) => p.ativo) ? "plano" : "avulso") as "plano" | "avulso",
    plano: editar?.plano_id ?? "",
    avulsos: editar && !editar.plano_id ? editar.produtos : ([] as string[]),
    valor: editar ? valorParaCampo(editar.valor_mensal) : "",
    valorMexido: !!editar,
    dia: String(editar?.dia_vencimento ?? 10),
    inicio: editar?.inicio ?? hoje,
    temFim: !!editar?.fim,
    fim: editar?.fim ?? "",
    proporcional: editar?.proporcional ?? false,
    indice: (editar?.reajuste_indice ?? "IPCA") as IndiceReajuste,
    mesReajuste: String(editar?.reajuste_mes ?? Number((editar?.inicio ?? hoje).slice(5, 7))),
    obs: editar?.observacao ?? "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const ativosProd = produtos.filter((p) => p.ativo || (editar?.produtos.includes(p.id) ?? false));
  const planosVisiveis = planos.filter((p) => p.ativo || p.id === editar?.plano_id);
  const plano = planos.find((p) => p.id === f.plano);
  const escolhidos = f.modo === "plano" ? (plano?.produtos ?? []) : f.avulsos;
  const tabela =
    f.modo === "plano" ? (plano?.preco ?? 0) : produtos.filter((p) => f.avulsos.includes(p.id)).reduce((s, p) => s + p.preco, 0);
  const valor = f.valorMexido ? numeroBr(f.valor) : tabela;
  const dia = Number(f.dia);
  const nomeProd = (id: string) => produtos.find((p) => p.id === id)?.nome ?? "";
  // módulos que o cliente já tem em outro contrato ativo (não podem repetir)
  const jaTem = new Set(
    contratos.filter((k) => k.cliente_id === f.cliente && k.situacao === "ativo" && k.id !== editar?.id).flatMap((k) => k.produtos),
  );
  const repetidos = escolhidos.filter((id) => jaTem.has(id));
  const primeiroMes = f.inicio ? valorDoMes(valor, f.inicio, f.temFim ? f.fim || null : null, f.proporcional, f.inicio) : 0;
  const clienteSel = clientes.find((c) => c.id === f.cliente);

  function validar(p: number): string {
    if (p === 0 && !f.cliente) return "Escolha o cliente.";
    if (p === 1) {
      if (!escolhidos.length) return f.modo === "plano" ? "Escolha o plano." : "Marque ao menos um módulo.";
      if (repetidos.length)
        return `O cliente já tem contrato ativo com ${repetidos.map(nomeProd).join(", ")}. Edite aquele contrato ou encerre antes.`;
    }
    if (p === 2) {
      if (Number.isNaN(valor) || valor < 0) return "Informe o valor mensal (zero para cortesia).";
      if (!(dia >= 1 && dia <= 31)) return "Dia de vencimento: de 1 a 31.";
      if (!f.inicio) return "Informe a data de início.";
      if (f.temFim && (!f.fim || f.fim < f.inicio)) return "A data de fim precisa ser depois do início.";
    }
    return "";
  }

  const primeiro = passo === 0 || (!!editar && passo === 1);
  function voltar() {
    if (primeiro) return aoFechar();
    setErro("");
    setPasso(passo - 1);
  }

  function avancar() {
    const e = validar(passo);
    setErro(e);
    if (!e) setPasso(passo + 1);
  }

  async function salvar() {
    for (let p = 0; p < 4; p++) {
      const e = validar(p);
      if (e) {
        setPasso(p);
        return setErro(e);
      }
    }
    setSalvando(true);
    setErro("");
    try {
      await salvarContrato({
        id: editar?.id,
        cliente: f.cliente,
        plano: f.modo === "plano" ? f.plano : null,
        produtos: escolhidos,
        valor_mensal: Math.round(valor * 100) / 100,
        dia_vencimento: dia,
        inicio: f.inicio,
        fim: f.temFim ? f.fim : null,
        proporcional: f.proporcional,
        reajuste_indice: f.indice,
        reajuste_mes: f.indice === "nenhum" ? null : Number(f.mesReajuste),
        observacao: f.obs.trim() || null,
      });
      aoSalvar(editar ? "Contrato atualizado." : "Contrato cadastrado. A mensalidade deste mês já foi gerada, se o contrato já vale.");
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  const listaClientes = ativos.filter((c) => {
    const q = f.busca.trim().toLowerCase();
    return !q || `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj ?? ""} ${c.codigo_dominio ?? ""}`.toLowerCase().includes(q);
  });

  return (
    <Modal
      titulo={editar ? "Editar contrato de licença" : "Novo contrato de licença"}
      descricao={clienteSel ? nomeCliente(clienteSel) : "Siga os passos; dá para voltar e mudar antes de salvar."}
      aoFechar={aoFechar}
      largura="2xl"
    >
      <ol className="flex flex-wrap gap-1 text-xs" aria-label="Passos">
        {PASSOS.map((p, i) => (
          <li
            key={p}
            aria-current={i === passo ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 ${i === passo ? "bg-[var(--marca)] text-white" : i < passo ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}
          >
            {i + 1}. {p}
          </li>
        ))}
      </ol>

      {passo === 0 && (
        <div className="space-y-2">
          <label className="campo">
            <span>Procurar cliente</span>
            <input
              value={f.busca}
              onChange={(e) => mudar({ busca: e.target.value })}
              placeholder="Nome, CNPJ ou código do Domínio"
              autoFocus
            />
          </label>
          <label className="campo">
            <span>Cliente</span>
            <select
              value={f.cliente}
              onChange={(e) => mudar({ cliente: e.target.value })}
              size={Math.min(8, Math.max(3, listaClientes.length))}
            >
              {listaClientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeCliente(c)}
                  {c.codigo_dominio ? ` · cód. ${c.codigo_dominio}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Forma de contratação">
            {(["plano", "avulso"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={f.modo === m}
                className={`btn flex-1 ${f.modo === m ? "!border-[var(--marca)] !bg-[var(--marca)] !text-white" : ""}`}
                onClick={() => mudar({ modo: m })}
              >
                {m === "plano" ? "Um plano (pacote)" : "Módulos avulsos"}
              </button>
            ))}
          </div>
          {f.modo === "plano" ? (
            planosVisiveis.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {planosVisiveis.map((p) => (
                  <label
                    key={p.id}
                    className={`cartao flex cursor-pointer gap-2 p-3 ${f.plano === p.id ? "ring-2 ring-[var(--marca)]" : ""}`}
                  >
                    <input type="radio" name="plano" checked={f.plano === p.id} onChange={() => mudar({ plano: p.id })} />
                    <span className="text-sm">
                      <b>{p.nome}</b> · {brl(p.preco)}/mês
                      <span className="block text-xs text-neutral-600">{p.produtos.map(nomeProd).join(", ")}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                Nenhum plano ativo. Escolha módulos avulsos ou cadastre um plano.
              </p>
            )
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {ativosProd.map((p) => (
                <label key={p.id} className="flex cursor-pointer gap-2 rounded-md border border-[var(--borda)] p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={f.avulsos.includes(p.id)}
                    onChange={(e) => mudar({ avulsos: e.target.checked ? [...f.avulsos, p.id] : f.avulsos.filter((x) => x !== p.id) })}
                  />
                  <span>
                    <b>{p.nome}</b> · {brl(p.preco)}/mês
                    {jaTem.has(p.id) && <span className="block text-xs text-red-700">O cliente já tem este módulo em outro contrato</span>}
                    {p.descricao && <span className="block text-xs text-neutral-600">{p.descricao}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-sm text-neutral-700">
            Preço de tabela: <b>{brl(tabela)}</b> por mês.
          </p>
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Valor mensal combinado (R$)</span>
              <input
                inputMode="decimal"
                value={f.valorMexido ? f.valor : valorParaCampo(tabela)}
                onChange={(e) => mudar({ valor: e.target.value, valorMexido: true })}
              />
            </label>
            <label className="campo">
              <span>Dia do vencimento</span>
              <input type="number" min={1} max={31} value={f.dia} onChange={(e) => mudar({ dia: e.target.value })} />
            </label>
            <label className="campo">
              <span>Começa em</span>
              <input type="date" value={f.inicio} onChange={(e) => mudar({ inicio: e.target.value })} disabled={!!editar} />
            </label>
            <label className="campo">
              <span>Termina em</span>
              <input
                type="date"
                value={f.temFim ? f.fim : ""}
                disabled={!f.temFim}
                onChange={(e) => mudar({ fim: e.target.value })}
                aria-describedby="sem-prazo"
              />
            </label>
          </div>
          <label id="sem-prazo" className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!f.temFim} onChange={(e) => mudar({ temFim: !e.target.checked })} /> Sem prazo para terminar
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={f.proporcional} onChange={(e) => mudar({ proporcional: e.target.checked })} className="mt-1" />
            <span>
              Cobrar proporcional aos dias no primeiro (e no último) mês
              <span className="block text-xs text-neutral-600">Ex.: começou dia 16 de um mês de 30 dias = metade da mensalidade.</span>
            </span>
          </label>
          {tabela > 0 && valor < tabela && !Number.isNaN(valor) && (
            <p className="text-sm text-violet-800">
              Desconto de {descontoSobreTabela(tabela, valor).toLocaleString("pt-BR")}% sobre a tabela.
            </p>
          )}
          {f.inicio && dia >= 1 && dia <= 31 && (
            <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
              Primeira mensalidade: <b>{brl(primeiroMes)}</b> ({mesExtenso(f.inicio)}), vencendo em{" "}
              <b>{fmtData(vencimentoDaCompetencia(f.inicio, dia))}</b>. Ela vai junto com o honorário do mês.
            </p>
          )}
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Índice de reajuste</span>
              <select value={f.indice} onChange={(e) => mudar({ indice: e.target.value as IndiceReajuste })}>
                {INDICES.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
            {f.indice !== "nenhum" && (
              <label className="campo">
                <span>Mês do reajuste</span>
                <select value={f.mesReajuste} onChange={(e) => mudar({ mesReajuste: e.target.value })}>
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="text-sm text-neutral-600">{INDICES.find((i) => i.id === f.indice)?.dica}</p>
          {f.indice !== "nenhum" && (
            <p className="text-sm text-neutral-600">
              Todo ano, em {MESES[Number(f.mesReajuste) - 1].toLowerCase()}, o painel lembra de reajustar (depois de 12 meses de contrato).
            </p>
          )}
        </div>
      )}

      {passo === 4 && (
        <div className="space-y-3">
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-neutral-500">Cliente</dt>
            <dd className="font-medium">{clienteSel ? nomeCliente(clienteSel) : "—"}</dd>
            <dt className="text-neutral-500">Contratou</dt>
            <dd>
              {f.modo === "plano" && plano
                ? `Plano ${plano.nome} (${escolhidos.map(nomeProd).join(", ")})`
                : escolhidos.map(nomeProd).join(", ")}
            </dd>
            <dt className="text-neutral-500">Valor mensal</dt>
            <dd>
              {brl(valor)} {tabela > valor && <span className="text-xs text-neutral-500">(tabela {brl(tabela)})</span>}
            </dd>
            <dt className="text-neutral-500">Vencimento</dt>
            <dd>Todo dia {dia} (no último dia, se o mês for mais curto)</dd>
            <dt className="text-neutral-500">Vigência</dt>
            <dd>
              De {fmtData(f.inicio)} {f.temFim ? `até ${fmtData(f.fim)}` : "sem prazo para terminar"}
              {f.proporcional ? " · proporcional" : ""}
            </dd>
            <dt className="text-neutral-500">Reajuste</dt>
            <dd>
              {f.indice === "nenhum"
                ? "Sem reajuste"
                : `${INDICES.find((i) => i.id === f.indice)?.nome} em ${MESES[Number(f.mesReajuste) - 1].toLowerCase()}`}
            </dd>
          </dl>
          <label className="campo">
            <span>Observação (opcional)</span>
            <textarea
              rows={2}
              value={f.obs}
              onChange={(e) => mudar({ obs: e.target.value })}
              placeholder="Ex.: desconto de lançamento por 6 meses"
            />
          </label>
        </div>
      )}

      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-between gap-2 pt-2">
        <button className="btn" onClick={voltar}>
          {primeiro ? "Cancelar" : "Voltar"}
        </button>
        {passo < 4 ? (
          <button className="btn-primario" onClick={avancar}>
            Continuar
          </button>
        ) : (
          <button className="btn-primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : editar ? "Salvar alterações" : "Cadastrar contrato"}
          </button>
        )}
      </div>
    </Modal>
  );
}
