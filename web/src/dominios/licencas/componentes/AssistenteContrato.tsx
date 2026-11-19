// Assistente de licença em 5 passos: cliente → sistema e o que foi vendido (plano, módulos avulsos ou o sistema full) →
// valor, usuários e vencimento → reajuste → conferir e salvar. Também edita uma licença ativa (cliente e sistema fixos).
// Usuários (088): incluídos no valor, valor por usuário a mais e o que fazer quando passar (cobrar ou bloquear); com a
// permissão de valores, a licença pode ser faturada por um contrato a receber da Gestão (Contratos).
"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData, mesExtenso } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { numeroBr, valorParaCampo } from "@/dominios/financeiro/regras";
import { descontoSobreTabela, valorDoMes, vencimentoDaCompetencia } from "../regras";
import { salvarContrato } from "../repositorio";
import { herancaDoPacote, pacotesDoSistema, textoUsuariosPacote } from "../pacotes";
import { INDICES } from "../tipos";
import type { Contrato, Excedente, IndiceReajuste, Plano, Produto, Sistema } from "../tipos";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";

const PASSOS = ["Cliente", "Sistema e módulos", "Valor e usuários", "Reajuste", "Conferir"];
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
  sistemas,
  hoje,
  valores = true,
  aoFechar,
  aoSalvar,
}: {
  /** false = sem a permissão de valores (074): esconde preço e valor; o banco usa a tabela (nova) ou mantém o valor (alteração) */
  valores?: boolean;
  editar?: Contrato;
  clienteInicial?: string;
  produtos: Produto[];
  planos: Plano[];
  contratos: Contrato[];
  /** sistemas licenciados (088); licença nova só nos que estão "vendendo" */
  sistemas: Sistema[];
  hoje: string;
  aoFechar: () => void;
  /** `novo` = id da licença recém-cadastrada (para oferecer a emissão do contrato). */
  aoSalvar: (msg: string, novo?: string) => void;
}) {
  const { clientes, org } = useOrg();
  const vendendo = sistemas.filter((x) => x.situacao === "vendendo");
  const ativos = useMemo(() => clientes.filter((c) => c.ativo).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b))), [clientes]);
  const [passo, setPasso] = useState(editar ? 1 : clienteInicial ? 1 : 0);
  const [f, setF] = useState({
    cliente: editar?.cliente_id ?? clienteInicial ?? "",
    sistema: editar?.sistema ?? (vendendo.find((x) => x.slug === "ledgra") ?? vendendo[0])?.slug ?? "ledgra",
    temLimite: editar ? editar.usuarios_incluidos != null : true,
    usuarios: String(editar?.usuarios_incluidos ?? 5),
    adicional: editar ? valorParaCampo(editar.valor_usuario_adicional) : "",
    excedente: (editar?.excedente ?? "cobrar") as Excedente,
    recorrente: editar?.recorrente_id ?? "",
    busca: "",
    modo: (editar
      ? editar.modalidade === "full"
        ? "full"
        : editar.plano_id
          ? "plano"
          : "avulso"
      : planos.some((p) => p.ativo)
        ? "plano"
        : "avulso") as "plano" | "avulso" | "full",
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
  // escolher o pacote traz os usuários, o excedente e (com a permissão de valores) o valor do usuário a mais; tudo
  // continua editável no passo dos usuários
  const escolherPacote = (pl: Plano) => {
    const h = herancaDoPacote(pl);
    mudar({
      plano: pl.id,
      temLimite: h.temLimite,
      usuarios: h.usuarios || f.usuarios,
      excedente: h.excedente,
      ...(valores ? { adicional: valorParaCampo(h.adicional) } : {}),
    });
  };

  const sistemaSel = sistemas.find((x) => x.slug === f.sistema);
  const nomeSistema = sistemaSel?.nome ?? f.sistema;
  const doSistema = (p: Produto) => p.sistema === f.sistema;
  const ativosProd = produtos.filter((p) => doSistema(p) && (p.ativo || (editar?.produtos.includes(p.id) ?? false)));
  // pacotes do sistema (091: o pacote sabe o próprio sistema)
  const planosVisiveis = pacotesDoSistema(planos, f.sistema, editar?.plano_id);
  const plano = planos.find((p) => p.id === f.plano);
  // full: todos os módulos ativos do sistema (o banco confere a lista na hora de salvar)
  const todosDoSistema = produtos.filter((p) => doSistema(p) && p.ativo);
  const escolhidos = f.modo === "plano" ? (plano?.produtos ?? []) : f.modo === "full" ? todosDoSistema.map((p) => p.id) : f.avulsos;
  const usuarios = Number(f.usuarios);
  const adicional = f.adicional.trim() ? numeroBr(f.adicional) : 0;
  // contratos a receber da Gestão (só com a permissão de valores; o banco confere de novo)
  const recorrentes = useConsulta(
    useCallback(async () => {
      if (!valores) return [] as { id: string; descricao: string; valor: number }[];
      const { data } = await supabase()
        .from("fin_recorrentes")
        .select("id,descricao,valor")
        .eq("org_id", org.id)
        .eq("tipo", "receber")
        .eq("situacao", "ativo")
        .order("descricao");
      return ((data ?? []) as { id: string; descricao: string; valor: number }[]).filter(
        (r) => r.id === editar?.recorrente_id || !contratos.some((k) => k.recorrente_id === r.id && k.situacao === "ativo"),
      );
    }, [valores, org.id, editar?.recorrente_id, contratos]),
  );
  const tabela =
    f.modo === "plano" ? (plano?.preco ?? 0) : produtos.filter((p) => escolhidos.includes(p.id)).reduce((s, p) => s + p.preco, 0);
  const valor = f.valorMexido ? numeroBr(f.valor) : tabela;
  const dia = Number(f.dia);
  const nomeProd = (id: string) => produtos.find((p) => p.id === id)?.nome ?? "";
  // módulos que o cliente já tem em outro contrato ativo (não podem repetir)
  const jaTem = new Set(
    contratos.filter((k) => k.cliente_id === f.cliente && k.situacao === "ativo" && k.id !== editar?.id).flatMap((k) => k.produtos),
  );
  // o cliente já tem licença ativa deste sistema (uma por cliente e sistema)
  const jaTemSistema = !editar && contratos.some((k) => k.cliente_id === f.cliente && k.situacao === "ativo" && k.sistema === f.sistema);
  const repetidos = escolhidos.filter((id) => jaTem.has(id));
  const primeiroMes = f.inicio ? valorDoMes(valor, f.inicio, f.temFim ? f.fim || null : null, f.proporcional, f.inicio) : 0;
  const clienteSel = clientes.find((c) => c.id === f.cliente);

  function validar(p: number): string {
    if (p === 0 && !f.cliente) return "Escolha o cliente.";
    if (p === 1) {
      if (!sistemaSel) return "Escolha o sistema.";
      if (jaTemSistema) return `O cliente já tem licença ativa do ${nomeSistema}. Edite aquela licença ou encerre antes.`;
      if (!escolhidos.length)
        return f.modo === "plano"
          ? "Escolha o pacote."
          : f.modo === "full"
            ? `Não há módulo ativo do ${nomeSistema}.`
            : "Marque ao menos um módulo.";
      if (repetidos.length)
        return `O cliente já tem contrato ativo com ${repetidos.map(nomeProd).join(", ")}. Edite aquele contrato ou encerre antes.`;
    }
    if (p === 2) {
      if (valores && (Number.isNaN(valor) || valor < 0)) return "Informe o valor mensal (zero para cortesia).";
      if (!(dia >= 1 && dia <= 31)) return "Dia de vencimento: de 1 a 31.";
      if (!f.inicio) return "Informe a data de início.";
      if (f.temFim && (!f.fim || f.fim < f.inicio)) return "A data de fim precisa ser depois do início.";
      if (f.temLimite && !(Number.isInteger(usuarios) && usuarios >= 1)) return "Usuários incluídos: 1 ou mais.";
      if (valores && f.temLimite && (Number.isNaN(adicional) || adicional < 0)) return "Valor por usuário a mais: zero ou mais.";
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
      const id = await salvarContrato({
        id: editar?.id,
        cliente: f.cliente,
        plano: f.modo === "plano" ? f.plano : null,
        modalidade: f.modo === "full" ? "full" : undefined,
        sistema: f.sistema,
        usuarios_incluidos: f.temLimite ? usuarios : null,
        valor_usuario_adicional: valores && f.temLimite ? Math.round(adicional * 100) / 100 : 0,
        excedente: f.excedente,
        ...(valores ? { recorrente: f.recorrente || null } : {}),
        produtos: escolhidos,
        valor_mensal: valores ? Math.round(valor * 100) / 100 : 0,
        dia_vencimento: dia,
        inicio: f.inicio,
        fim: f.temFim ? f.fim : null,
        proporcional: f.proporcional,
        reajuste_indice: f.indice,
        reajuste_mes: f.indice === "nenhum" ? null : Number(f.mesReajuste),
        observacao: f.obs.trim() || null,
      });
      aoSalvar(
        editar
          ? "Licença atualizada."
          : f.recorrente
            ? "Licença cadastrada. A cobrança sai na fatura do contrato a receber escolhido."
            : "Licença cadastrada. A mensalidade deste mês já foi gerada, se a licença já vale.",
        editar ? undefined : id,
      );
    } catch (e) {
      setErro(traduzirErro(e));
      setSalvando(false);
    }
  }

  const filtrarClientes = (busca: string) =>
    ativos.filter((c) => {
      const q = busca.trim().toLowerCase();
      return !q || `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj ?? ""} ${c.codigo_dominio ?? ""}`.toLowerCase().includes(q);
    });
  const listaClientes = filtrarClientes(f.busca);
  // A busca que deixa um cliente só já o escolhe (antes ele aparecia marcado, mas o valor ficava vazio: "Escolha o cliente").
  const buscar = (busca: string) => {
    const achados = filtrarClientes(busca);
    const continua = achados.some((c) => c.id === f.cliente);
    mudar({ busca, cliente: achados.length === 1 ? achados[0]!.id : continua ? f.cliente : "" });
  };

  return (
    <Modal
      titulo={editar ? `Editar licença do ${nomeSistema}` : "Nova licença"}
      descricao={clienteSel ? nomeCliente(clienteSel) : "Siga os passos; dá para voltar e mudar antes de salvar."}
      aoFechar={aoFechar}
      largura="2xl"
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <div className="flex w-full justify-between gap-2">
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
      }
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
            <input value={f.busca} onChange={(e) => buscar(e.target.value)} placeholder="Nome, CNPJ ou código do Domínio" autoFocus />
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
          {clienteSel ? (
            <p className="text-sm text-[var(--marca)]">
              Escolhido: <b>{nomeCliente(clienteSel)}</b>
            </p>
          ) : (
            <p className="text-sm text-neutral-600">Toque no nome do cliente na lista para escolher.</p>
          )}
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">Sistema</p>
            {editar ? (
              <p className="text-sm">
                <b>{nomeSistema}</b> <span className="text-neutral-500">(a licença não muda de sistema)</span>
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Sistema">
                {vendendo.map((x) => (
                  <button
                    key={x.slug}
                    type="button"
                    role="radio"
                    aria-checked={f.sistema === x.slug}
                    className={`cartao flex items-start gap-2 p-3 text-left text-sm ${f.sistema === x.slug ? "ring-2 ring-[var(--marca)]" : ""}`}
                    onClick={() => mudar({ sistema: x.slug, plano: "", avulsos: [] })}
                  >
                    <Icone nome={f.sistema === x.slug ? "check" : "caixa"} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
                    <span>
                      <b>{x.nome}</b>
                      <span className="block text-xs text-neutral-600">{x.descricao}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {jaTemSistema && (
              <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
                O cliente já tem licença ativa do {nomeSistema}. Edite aquela licença ou encerre antes.
              </p>
            )}
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Forma de contratação">
            {(["plano", "avulso", "full"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={f.modo === m}
                className={`btn flex-1 ${f.modo === m ? "!border-[var(--marca)] !bg-[var(--marca)] !text-white" : ""}`}
                onClick={() => mudar({ modo: m })}
              >
                {m === "plano" ? "Um pacote" : m === "avulso" ? "Módulos avulsos" : `${nomeSistema} full`}
              </button>
            ))}
          </div>
          {f.modo === "full" ? (
            <div className="rounded-md border border-[var(--borda)] p-3 text-sm">
              <p>
                <b>Todos os módulos do {nomeSistema}</b>, inclusive os que forem criados depois.
              </p>
              <p className="mt-1 text-neutral-700">{todosDoSistema.map((p) => p.nome).join(", ") || `Nenhum módulo do ${nomeSistema} ativo.`}</p>
              <p className="mt-2 text-xs text-neutral-600">
                Depois de salvar, gere a chave em Ações › Chave e cole no {nomeSistema}.
              </p>
            </div>
          ) : f.modo === "plano" ? (
            planosVisiveis.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {planosVisiveis.map((p) => (
                  <label
                    key={p.id}
                    className={`cartao flex cursor-pointer gap-2 p-3 ${f.plano === p.id ? "ring-2 ring-[var(--marca)]" : ""}`}
                  >
                    <input type="radio" name="plano" checked={f.plano === p.id} onChange={() => escolherPacote(p)} />
                    <span className="text-sm">
                      <b>{p.nome}</b>
                      {valores && <> · {brl(p.preco)}/mês</>}
                      <span className="block text-xs text-neutral-600">{p.produtos.map(nomeProd).join(", ")}</span>
                      <span className="block text-xs text-neutral-600">{textoUsuariosPacote(p.usuarios_incluidos)}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                Nenhum pacote à venda deste sistema. Escolha módulos avulsos ou monte um pacote em Sistemas › Pacotes de licença.
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
                    <b>{p.nome}</b>
                    {valores && <> · {brl(p.preco)}/mês</>}
                    {jaTem.has(p.id) && <span className="block text-xs text-red-700">O cliente já tem este módulo em outro contrato</span>}
                    {p.descricao && <span className="block text-xs text-neutral-600">{p.descricao}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {valores && (
            <p className="text-sm text-neutral-700">
              Preço de tabela: <b>{brl(tabela)}</b> por mês.
            </p>
          )}
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {valores && (
              <label className="campo">
                <span>Valor mensal combinado (R$)</span>
                <input
                  inputMode="decimal"
                  value={f.valorMexido ? f.valor : valorParaCampo(tabela)}
                  onChange={(e) => mudar({ valor: e.target.value, valorMexido: true })}
                />
              </label>
            )}
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
          {valores && tabela > 0 && valor < tabela && !Number.isNaN(valor) && (
            <p className="text-sm text-violet-800">
              Desconto de {descontoSobreTabela(tabela, valor).toLocaleString("pt-BR")}% sobre a tabela.
            </p>
          )}
          <fieldset className="space-y-2 rounded-md border border-[var(--borda)] p-3">
            <legend className="px-1 text-sm font-medium">Usuários</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!f.temLimite} onChange={(e) => mudar({ temLimite: !e.target.checked })} /> Sem limite de
              usuários
            </label>
            {f.temLimite && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="campo">
                  <span>Usuários incluídos no valor</span>
                  <input inputMode="numeric" value={f.usuarios} onChange={(e) => mudar({ usuarios: e.target.value.replace(/\D/g, "") })} />
                </label>
                {valores && (
                  <label className="campo">
                    <span>Valor por usuário a mais (R$/mês)</span>
                    <input inputMode="decimal" value={f.adicional} onChange={(e) => mudar({ adicional: e.target.value })} placeholder="0,00" />
                  </label>
                )}
                <div className="sm:col-span-2">
                  <p className="text-sm">Quando passar do limite</p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Quando passar do limite">
                    {(
                      [
                        ["cobrar", "Liberar e cobrar", "O usuário a mais entra na cobrança do mês seguinte."],
                        ["bloquear", "Não deixar passar", `O ${nomeSistema} não cadastra pessoa além do limite.`],
                      ] as const
                    ).map(([id, titulo, dica]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={f.excedente === id}
                        className={`cartao flex items-start gap-2 p-2 text-left text-sm ${f.excedente === id ? "ring-2 ring-[var(--marca)]" : ""}`}
                        onClick={() => mudar({ excedente: id })}
                      >
                        <Icone nome={f.excedente === id ? "check" : "pessoas"} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
                        <span>
                          <b>{titulo}</b>
                          <span className="block text-xs text-neutral-600">{dica}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </fieldset>
          {valores && (
            <label className="campo">
              <span>Como cobrar</span>
              <select value={f.recorrente} onChange={(e) => mudar({ recorrente: e.target.value })}>
                <option value="">Mensalidade da licença (junto com o honorário)</option>
                {(recorrentes.dados ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    Fatura do contrato a receber: {r.descricao} ({brl(Number(r.valor))})
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-600">
                Com um contrato a receber da Gestão, a fatura dele leva a licença e o usuário a mais; a mensalidade da licença não é gerada.
              </span>
            </label>
          )}
          {!valores && (
            <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
              O valor da licença é definido por quem tem a permissão de valores. Nova licença entra pelo preço de tabela.
            </p>
          )}
          {valores && !f.recorrente && f.inicio && dia >= 1 && dia <= 31 && (
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
            <dt className="text-neutral-500">Sistema</dt>
            <dd>{nomeSistema}</dd>
            <dt className="text-neutral-500">Usuários</dt>
            <dd>
              {f.temLimite
                ? `${usuarios} incluído(s); ${f.excedente === "cobrar" ? `a mais é cobrado${valores ? ` (${brl(adicional)} cada)` : ""}` : "não deixa passar do limite"}`
                : "Sem limite"}
            </dd>
            {valores && (
              <>
                <dt className="text-neutral-500">Cobrança</dt>
                <dd>
                  {f.recorrente
                    ? `Fatura do contrato a receber: ${recorrentes.dados?.find((r) => r.id === f.recorrente)?.descricao ?? ""}`
                    : "Mensalidade da licença"}
                </dd>
              </>
            )}
            <dt className="text-neutral-500">Contratou</dt>
            <dd>
              {f.modo === "full"
                ? `${nomeSistema} full (${escolhidos.map(nomeProd).join(", ")})`
                : f.modo === "plano" && plano
                  ? `Pacote ${plano.nome} (${escolhidos.map(nomeProd).join(", ")})`
                  : escolhidos.map(nomeProd).join(", ")}
              {valores && valor === 0 && <span className="block text-xs text-emerald-700">Licença gratuita (sem mensalidade)</span>}
            </dd>
            {valores && (
              <>
                <dt className="text-neutral-500">Valor mensal</dt>
                <dd>
                  {brl(valor)} {tabela > valor && <span className="text-xs text-neutral-500">(tabela {brl(tabela)})</span>}
                </dd>
              </>
            )}
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
    </Modal>
  );
}
