// Janela de cadastro e edição de contrato (a receber: honorários; a pagar: aluguel, sistemas, serviços).
// Mesmo jeito do LancarTitulo: fornecedor/cliente digitado na hora (o banco cadastra junto), categoria com
// "+ Nova categoria" e "Mais informações" para centro de custo, banco e observação. Guarda também número, objeto e
// vigência (com renovação automática e aviso antes do fim). Mostra em uma frase o que o HUB vai fazer todo mês.
// Editar vale para as próximas contas; as já lançadas não mudam.
"use client";

import { useMemo, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { somarMeses } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import type { Cliente } from "@/dominios/clientes/tipos";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import type { Cadastros } from "@/dominios/financeiro/componentes/LancarTitulo";
import { NovaCategoriaRapida } from "@/dominios/financeiro/componentes/NovaCategoriaRapida";
import { numeroBr, valorParaCampo } from "@/dominios/financeiro/regras";
import type { TipoTitulo } from "@/dominios/financeiro/tipos";
import { salvarContrato } from "../repositorio";
import { INDICES_RECORRENTE, MESES_ANO, primeiroDia, vencimentoNoMes } from "../regras";
import type { IndiceRecorrente, Recorrente } from "../tipos";

const TIPOS: { id: TipoTitulo; nome: string; exemplo: string }[] = [
  { id: "receber", nome: "A receber", exemplo: "Honorários mensais, mensalidades de clientes" },
  { id: "pagar", nome: "A pagar", exemplo: "Aluguel, sistemas, internet, serviços" },
];

type Form = {
  tipo: TipoTitulo;
  descricao: string;
  numero: string;
  objeto: string;
  pessoa: string;
  categoria: string;
  valor: string;
  dia: string;
  vigIni: string;
  vigFim: string;
  indeterminado: boolean;
  renova: boolean;
  aviso: string;
  geraContas: boolean;
  gerarDesde: string;
  indice: IndiceRecorrente;
  fixo: string;
  mesReajuste: string;
  centro: string;
  conta: string;
  observacao: string;
};

/** Mês e ano em duas listas (funciona em qualquer navegador, inclusive no celular). Valor "AAAA-MM". */
function CampoMes({
  rotulo,
  valor,
  aoMudar,
  anos,
  dica,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  anos: number[];
  dica?: string;
}) {
  const [a, m] = valor.split("-");
  return (
    <fieldset className="campo">
      <legend className="mb-1 text-sm">{rotulo}</legend>
      <div className="flex gap-2">
        <select aria-label={`${rotulo}: mês`} value={m} onChange={(e) => aoMudar(`${a}-${e.target.value}`)}>
          {MESES_ANO.map((nome, i) => (
            <option key={nome} value={String(i + 1).padStart(2, "0")}>
              {nome}
            </option>
          ))}
        </select>
        <select aria-label={`${rotulo}: ano`} value={a} onChange={(e) => aoMudar(`${e.target.value}-${m}`)}>
          {anos.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {dica && <small className="text-xs text-[var(--texto-suave)]">{dica}</small>}
    </fieldset>
  );
}

export function ContratoFixo({
  cliente,
  cad,
  hoje,
  editar,
  tipoInicial = "receber",
  aoFechar,
  aoSalvar,
  aoRecarregarCadastros,
}: {
  cliente: Cliente;
  cad: Cadastros;
  hoje: string;
  editar?: Recorrente;
  tipoInicial?: TipoTitulo;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
  aoRecarregarCadastros?: () => void;
}) {
  const { pode } = useOrg();
  const podeCriarCategoria = pode("plano_contas", "operar") || pode("financeiro", "operar");
  const mesAtual = hoje.slice(0, 7);
  const anoAtual = Number(hoje.slice(0, 4));
  const anosFuturos = Array.from({ length: 6 }, (_, i) => anoAtual + i);
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const nomePessoa = (id: string | null) => cad.pessoas.find((p) => p.id === id)?.nome ?? "";
  const [f, setF] = useState<Form>(() => ({
    tipo: editar?.tipo ?? tipoInicial,
    descricao: editar?.descricao ?? "",
    numero: editar?.numero ?? "",
    objeto: editar?.objeto ?? "",
    pessoa: editar ? nomePessoa(editar.pessoa_id) : "",
    categoria: editar?.categoria_id ?? "",
    valor: editar ? valorParaCampo(editar.valor) : "",
    dia: String(editar?.dia_vencimento ?? 10),
    vigIni: editar?.vigencia_inicio ?? hoje,
    vigFim: editar?.vigencia_fim ?? "",
    indeterminado: editar ? !editar.vigencia_fim : true,
    renova: editar?.renovacao_automatica ?? false,
    aviso: String(editar?.aviso_dias ?? 30),
    geraContas: editar?.gera_contas ?? true,
    gerarDesde: editar?.gerar_desde.slice(0, 7) ?? mesAtual,
    indice: editar?.indice ?? "IPCA",
    fixo: editar?.percentual_fixo != null ? String(editar.percentual_fixo).replace(".", ",") : "",
    mesReajuste: String(editar?.mes_reajuste ?? Number((editar?.vigencia_inicio ?? hoje).slice(5, 7))),
    centro: editar?.centro_id ?? "",
    conta: editar?.conta_prevista_id ?? "",
    observacao: editar?.observacao ?? "",
  }));
  const mudar = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const tipoCat = f.tipo === "pagar" ? "despesa" : "receita";
  const rotuloPessoa = f.tipo === "pagar" ? "Fornecedor" : "Cliente";
  const pessoasDoTipo = useMemo(
    () => cad.pessoas.filter((p) => p.ativo && (p.tipo === "ambos" || p.tipo === (f.tipo === "pagar" ? "fornecedor" : "cliente"))),
    [cad.pessoas, f.tipo],
  );
  const categorias = cad.categorias.filter((c) => c.tipo === tipoCat && (c.ativo || c.id === editar?.categoria_id));
  const contasAtivas = cad.contas.filter((c) => c.ativo || c.id === f.conta);
  const valor = numeroBr(f.valor);
  const dia = Math.max(1, Math.min(31, Math.floor(Number(f.dia) || 1)));
  // primeira conta só muda enquanto nada foi lançado
  const podeMudarPrimeira = !editar || !editar.ultima_competencia;
  const inicioMes = f.vigIni.slice(0, 7);
  const primeiraEscolhida = f.gerarDesde < inicioMes ? inicioMes : f.gerarDesde;
  const primeira = podeMudarPrimeira ? (primeiraEscolhida < mesAtual ? mesAtual : primeiraEscolhida) : editar!.gerar_desde.slice(0, 7);
  const fim = f.indeterminado ? "" : f.vigFim;
  const novaPessoa = f.pessoa.trim() && !cad.pessoas.some((p) => p.nome.toLowerCase() === f.pessoa.trim().toLowerCase());

  async function salvar() {
    setErro("");
    if (!f.descricao.trim())
      return setErro(`Dê um nome ao contrato (ex.: ${f.tipo === "pagar" ? "Aluguel da sala" : "Honorários mensais"}).`);
    if (!f.pessoa.trim()) return setErro(`Informe o ${rotuloPessoa.toLowerCase()}.`);
    if (!f.categoria) return setErro(`Escolha a categoria (${tipoCat}).`);
    if (!(valor > 0)) return setErro("Informe o valor mensal. Exemplo: 1.250,00");
    if (!f.vigIni) return setErro("Informe o início da vigência.");
    if (!f.indeterminado && !f.vigFim) return setErro("Informe o fim da vigência ou marque “Prazo indeterminado”.");
    if (fim && fim < f.vigIni) return setErro("O fim da vigência precisa ser depois do início.");
    if (f.indice === "fixo" && !(f.fixo.trim() && numeroBr(f.fixo) > -50 && numeroBr(f.fixo) <= 100))
      return setErro("Informe o percentual fixo do reajuste (ex.: 5).");
    setSalvando(true);
    try {
      const r = await salvarContrato({
        id: editar?.id,
        cliente: cliente.id,
        tipo: f.tipo,
        pessoa: cad.pessoas.find((p) => p.nome.toLowerCase() === f.pessoa.trim().toLowerCase())?.id ?? null,
        pessoa_nome: f.pessoa.trim(),
        descricao: f.descricao.trim(),
        numero: f.numero.trim() || null,
        objeto: f.objeto.trim() || null,
        valor,
        dia,
        categoria: f.categoria,
        centro: f.centro || null,
        conta_prevista: f.conta || null,
        vigencia_inicio: f.vigIni,
        vigencia_fim: fim || null,
        renovacao_automatica: !!fim && f.renova,
        aviso_dias: Math.max(0, Math.min(365, Math.floor(Number(f.aviso) || 0))),
        gera_contas: f.geraContas,
        gerar_desde: podeMudarPrimeira ? primeiroDia(primeira) : null,
        indice: f.indice,
        percentual_fixo: f.indice === "fixo" ? numeroBr(f.fixo) : null,
        mes_reajuste: f.indice === "nenhum" ? null : Number(f.mesReajuste),
        observacao: f.observacao.trim() || null,
      });
      aoSalvar(
        editar
          ? "Contrato atualizado. Vale para as próximas contas; as já lançadas continuam como estão."
          : !f.geraContas
            ? "Contrato cadastrado (sem lançar contas no Financeiro)."
            : r.geradas
              ? `Contrato cadastrado e a conta de ${fmtCompetencia(mesAtual)} já foi lançada no Financeiro.`
              : `Contrato cadastrado. A primeira conta sai em ${fmtCompetencia(primeira)}.`,
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={editar ? "Editar contrato" : "Novo contrato"}
      descricao="Algo que se repete todo mês. O HUB lança a conta no Financeiro no dia 1 e lembra do reajuste e do fim da vigência."
      aoFechar={aoFechar}
      largura="2xl"
    >
      {!editar && (
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo do contrato">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={f.tipo === t.id}
              onClick={() => mudar({ tipo: t.id, categoria: "" })}
              className={`rounded-lg border p-3 text-left transition ${
                f.tipo === t.id
                  ? "border-[var(--destaque-escuro)] bg-amber-50/60 ring-1 ring-[var(--destaque-escuro)]"
                  : "border-[var(--borda)] hover:bg-[var(--fundo)]"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <span
                  aria-hidden="true"
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    f.tipo === t.id ? "border-[var(--marca)] bg-[var(--marca)]" : "border-neutral-400 bg-white"
                  }`}
                >
                  {f.tipo === t.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {t.nome}
              </span>
              <span className="block pl-6 text-xs text-[var(--texto-suave)]">{t.exemplo}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="campo sm:col-span-2">
          <span>Nome do contrato</span>
          <input
            value={f.descricao}
            onChange={(e) => mudar({ descricao: e.target.value })}
            placeholder={f.tipo === "pagar" ? "Ex.: Aluguel da sala" : "Ex.: Honorários mensais"}
          />
        </label>
        <label className="campo">
          <span>Número (opcional)</span>
          <input value={f.numero} onChange={(e) => mudar({ numero: e.target.value })} placeholder="Ex.: 2026/015" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>{rotuloPessoa}</span>
          <input
            list="lista-pessoas-contrato"
            value={f.pessoa}
            onChange={(e) => mudar({ pessoa: e.target.value })}
            placeholder="Digite o nome…"
          />
          <datalist id="lista-pessoas-contrato">
            {pessoasDoTipo.map((p) => (
              <option key={p.id} value={p.nome} />
            ))}
          </datalist>
          {novaPessoa && <small className="text-xs text-neutral-500">Novo: será cadastrado ao salvar.</small>}
        </label>
        <div className="campo">
          <span>Categoria ({tipoCat})</span>
          <select value={f.categoria} onChange={(e) => mudar({ categoria: e.target.value })} aria-label={`Categoria (${tipoCat})`}>
            <option value="">{categorias.length ? "Escolha…" : `Nenhuma categoria de ${tipoCat} cadastrada`}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.grupo ? `${c.grupo} › ` : ""}
                {c.nome}
              </option>
            ))}
          </select>
          {podeCriarCategoria && (
            <button type="button" className="btn-link self-start text-xs" onClick={() => setNovaCategoria(true)}>
              + Nova categoria
            </button>
          )}
          {novaCategoria && (
            <NovaCategoriaRapida
              cliente={cliente}
              tipo={tipoCat}
              aoFechar={() => setNovaCategoria(false)}
              aoCriar={(id) => {
                setNovaCategoria(false);
                mudar({ categoria: id });
                aoRecarregarCadastros?.();
              }}
            />
          )}
        </div>
      </div>
      <label className="campo">
        <span>Objeto do contrato (opcional)</span>
        <textarea
          rows={2}
          value={f.objeto}
          onChange={(e) => mudar({ objeto: e.target.value })}
          placeholder="O que foi contratado. Ex.: locação da sala 12 do Edifício Central"
        />
      </label>

      <fieldset className="rounded-md border border-[var(--borda)] p-3">
        <legend className="px-1 text-sm font-medium">Vigência</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="campo">
            <span>Começa em</span>
            <input
              type="date"
              value={f.vigIni}
              onChange={(e) =>
                mudar({
                  vigIni: e.target.value,
                  ...(f.indice !== "nenhum" && !editar && e.target.value
                    ? { mesReajuste: String(Number(e.target.value.slice(5, 7))) }
                    : {}),
                })
              }
            />
          </label>
          {!f.indeterminado && (
            <>
              <label className="campo">
                <span>Termina em</span>
                <input type="date" value={f.vigFim} onChange={(e) => mudar({ vigFim: e.target.value })} />
              </label>
              <label className="campo">
                <span>Avisar antes do fim (dias)</span>
                <input type="number" min={0} max={365} value={f.aviso} onChange={(e) => mudar({ aviso: e.target.value })} />
              </label>
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.indeterminado} onChange={(e) => mudar({ indeterminado: e.target.checked, renova: false })} />
            Prazo indeterminado
          </label>
          {!f.indeterminado && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.renova} onChange={(e) => mudar({ renova: e.target.checked })} />
              Renova sozinho por mais 12 meses
            </label>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--texto-suave)]">
          {f.indeterminado
            ? "Vale até alguém encerrar. O início marca o aniversário do reajuste."
            : f.renova
              ? "No fim, o HUB renova por mais 12 meses e avisa no sino antes."
              : "O HUB avisa no sino antes do fim e para de lançar contas depois do mês do fim."}
        </p>
      </fieldset>

      <fieldset className="rounded-md border border-[var(--borda)] p-3">
        <legend className="px-1 text-sm font-medium">Valor e contas do mês</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="campo">
            <span>Valor mensal (R$)</span>
            <input value={f.valor} onChange={(e) => mudar({ valor: e.target.value })} inputMode="decimal" placeholder="0,00" />
            {editar && (
              <small className="text-xs text-[var(--texto-suave)]">Mudar aqui vale para as próximas contas e fica no histórico.</small>
            )}
          </label>
          <label className="campo">
            <span>Vence todo dia</span>
            <input type="number" min={1} max={31} value={f.dia} onChange={(e) => mudar({ dia: e.target.value })} />
            <small className="text-xs text-[var(--texto-suave)]">Se o mês não tiver esse dia (ex.: 31), vence no último dia.</small>
          </label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.geraContas} onChange={(e) => mudar({ geraContas: e.target.checked })} />
          Lançar a conta no Financeiro todo mês ({f.tipo === "pagar" ? "Contas a pagar" : "Contas a receber"})
        </label>
        {f.geraContas && podeMudarPrimeira && (
          <div className="mt-2">
            <CampoMes
              rotulo="Primeira conta lançada pelo HUB"
              valor={primeira}
              anos={anosFuturos}
              aoMudar={(v) => mudar({ gerarDesde: v < mesAtual ? mesAtual : v })}
              dica="Os meses anteriores não são lançados. Se a deste mês já foi paga por fora, escolha o mês que vem."
            />
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-md border border-[var(--borda)] p-3">
        <legend className="px-1 text-sm font-medium">Reajuste anual</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="campo">
            <span>Índice</span>
            <select value={f.indice} onChange={(e) => mudar({ indice: e.target.value as IndiceRecorrente })}>
              {INDICES_RECORRENTE.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
            <small className="text-xs text-[var(--texto-suave)]">{INDICES_RECORRENTE.find((i) => i.id === f.indice)?.explicacao}</small>
          </label>
          {f.indice !== "nenhum" && (
            <div className="grid grid-cols-2 gap-3">
              {f.indice === "fixo" && (
                <label className="campo">
                  <span>Percentual (%)</span>
                  <input value={f.fixo} onChange={(e) => mudar({ fixo: e.target.value })} inputMode="decimal" placeholder="5" />
                </label>
              )}
              <label className={`campo ${f.indice === "fixo" ? "" : "col-span-2"}`}>
                <span>Mês do reajuste</span>
                <select value={f.mesReajuste} onChange={(e) => mudar({ mesReajuste: e.target.value })}>
                  {MESES_ANO.map((nome, i) => (
                    <option key={nome} value={String(i + 1)}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        {f.indice !== "nenhum" && f.indice !== "fixo" && (
          <p className="mt-2 text-xs text-[var(--texto-suave)]">
            Todo ano, em {MESES_ANO[Number(f.mesReajuste) - 1].toLowerCase()}, o HUB busca no Banco Central o {f.indice} acumulado dos 12
            meses anteriores, mostra o novo valor e espera você confirmar.
          </p>
        )}
      </fieldset>

      <details
        className="rounded-md border border-[var(--borda)] p-3"
        open={!!editar && !!(editar.centro_id || editar.conta_prevista_id || editar.observacao)}
      >
        <summary className="cursor-pointer text-sm text-neutral-700">Mais informações (centro de custo, banco, observação)</summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Centro de custo</span>
              <select value={f.centro} onChange={(e) => mudar({ centro: e.target.value })}>
                <option value="">Nenhum</option>
                {cad.centros
                  .filter((c) => c.ativo || c.id === f.centro)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label className="campo">
              <span>Banco previsto</span>
              <select value={f.conta} onChange={(e) => mudar({ conta: e.target.value })}>
                <option value="">Não definido</option>
                {contasAtivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="campo">
            <span>Observação</span>
            <textarea rows={2} value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />
          </label>
        </div>
      </details>

      {f.geraContas && valor > 0 && f.descricao.trim() && (
        <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
          Todo dia 1º o HUB lança{" "}
          <strong>
            {f.descricao.trim()} · {fmtCompetencia(primeira)}
          </strong>{" "}
          de <strong>{brl(valor)}</strong>, com vencimento em {fmtData(vencimentoNoMes(primeira, dia))}
          {fim && !f.renova ? `, até ${fmtCompetencia(fim)}` : ""}. A próxima será a de {fmtCompetencia(somarMeses(primeira, 1))}.
        </p>
      )}
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : editar ? "Salvar" : "Cadastrar contrato"}
        </button>
      </div>
    </Modal>
  );
}
