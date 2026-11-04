// Janela "Conciliar" de uma linha do extrato (Financeiro › Conciliação), larga e com quatro abas:
//   Contas do HUB ........ escolher um ou mais pagamentos já lançados, contas em aberto (baixa na data do extrato, com
//                          juros/desconto) ou transferências; a soma precisa bater com o valor do extrato
//   Criar lançamento ..... conta já paga/recebida criada a partir da linha (categoria, centro e fornecedor sugeridos)
//   Transferência ........ dinheiro entre duas contas da própria empresa
//   Ignorar .............. fica de fora da conciliação, com motivo
// Quem grava é o banco (fin_conciliar, fin_conciliar_lancar, fin_conciliar_transferir, fin_extrato_ignorar; 051).
"use client";

import { useMemo, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Abas } from "@/components/ui/Abas";
import { Modal } from "@/components/ui/Modal";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { Chip } from "@/components/ui/Chip";
import { Valor } from "@/components/ui/Valor";
import { numeroBr, valorParaCampo } from "../regras";
import {
  ajustarDiferenca,
  candidatosDaLinha,
  chaveCandidato,
  dataDoCandidato,
  descricaoDoHistorico,
  maisParecido,
  PONTOS_ALTOS,
  rotuloPontos,
  somaSelecao,
  sugerir,
  valorComSinal,
} from "../conciliacao";
import type { AjusteTitulo, Candidato, DadosConciliacao, LinhaConciliacao } from "../conciliacao";
import { conciliar, conciliarLancar, conciliarTransferir, ignorarLinha } from "../repositorio";
import type { Categoria, CentroCusto, ContaBancaria, Pessoa } from "../tipos";

export type AbaConciliar = "hub" | "lancar" | "transferencia" | "ignorar";
type Campos = Record<string, { valor: string; juros: string; desconto: string }>;

export function JanelaConciliar({
  linha,
  dados,
  conta,
  contas,
  cadastros,
  abaInicial = "hub",
  escolhaInicial = [],
  aoFechar,
  aoGravar,
}: {
  linha: LinhaConciliacao;
  dados: DadosConciliacao;
  conta: ContaBancaria;
  contas: ContaBancaria[];
  cadastros: { categorias: Categoria[]; centros: CentroCusto[]; pessoas: Pessoa[] };
  abaInicial?: AbaConciliar;
  /** Chaves dos candidatos já marcados (vindas da sugestão escolhida no painel). */
  escolhaInicial?: string[];
  aoFechar: () => void;
  aoGravar: (mensagem: string) => void;
}) {
  const entrada = Number(linha.valor) > 0;
  const [aba, setAba] = useState<AbaConciliar>(abaInicial);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // ---------------------------------------------------------------- aba "Contas do HUB"
  const candidatos = useMemo(() => candidatosDaLinha(linha, dados), [linha, dados]);
  const sugestoes = useMemo(() => sugerir(linha, dados), [linha, dados]);
  const [marcados, setMarcados] = useState<string[]>(escolhaInicial);
  const [campos, setCampos] = useState<Campos>({});
  const [busca, setBusca] = useState("");
  const [obs, setObs] = useState("");

  const escolhidos = candidatos.filter((c) => marcados.includes(chaveCandidato(c)));
  const ajustes: Record<string, AjusteTitulo> = Object.fromEntries(
    escolhidos
      .filter((c) => c.tipo === "titulo")
      .map((c) => {
        const f = campos[c.item.id as string];
        return [
          c.item.id,
          f
            ? { valor: numeroBr(f.valor), juros: numeroBr(f.juros), desconto: numeroBr(f.desconto) }
            : { valor: Number((c.item as { saldo: number }).saldo), juros: 0, desconto: 0 },
        ];
      }),
  );
  const soma = somaSelecao(escolhidos, ajustes);
  const diferenca = Math.round((Number(linha.valor) - soma) * 100) / 100;

  function alternar(c: Candidato) {
    const k = chaveCandidato(c);
    setMarcados((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));
  }
  function mudarCampo(id: string, saldo: number, mudanca: Partial<Campos[string]>) {
    setCampos((cs) => ({ ...cs, [id]: { ...(cs[id] ?? { valor: valorParaCampo(saldo), juros: "", desconto: "" }), ...mudanca } }));
  }
  function levarDiferenca() {
    const novo = ajustarDiferenca(Number(linha.valor), escolhidos, ajustes);
    if (!novo) return;
    setCampos(
      Object.fromEntries(
        Object.entries(novo).map(([id, a]) => [
          id,
          {
            valor: valorParaCampo(a.valor),
            juros: a.juros ? valorParaCampo(a.juros) : "",
            desconto: a.desconto ? valorParaCampo(a.desconto) : "",
          },
        ]),
      ),
    );
  }

  const q = busca.trim().toLowerCase();
  const visiveis = candidatos.filter((c) => {
    if (!q) return true;
    const texto = [
      c.tipo === "transferencia" ? c.item.outra_conta : c.item.pessoa,
      c.tipo === "transferencia" ? c.item.observacao : c.item.descricao,
      c.tipo === "transferencia" ? "" : c.item.documento,
      brl(Math.abs(valorComSinal(c))),
    ]
      .join(" ")
      .toLowerCase();
    return texto.includes(q);
  });
  const jaLancados = visiveis.filter((c) => c.tipo !== "titulo");
  const emAberto = visiveis.filter((c) => c.tipo === "titulo");

  // ---------------------------------------------------------------- aba "Criar lançamento"
  const tipoCat = entrada ? "receita" : "despesa";
  const pessoasDoTipo = cadastros.pessoas.filter((p) => p.ativo && (p.tipo === "ambos" || p.tipo === (entrada ? "cliente" : "fornecedor")));
  const categoriasDoTipo = cadastros.categorias.filter((c) => c.ativo && c.tipo === tipoCat);
  const centrosAtivos = cadastros.centros.filter((c) => c.ativo);
  const pessoaSugerida = maisParecido(linha.descricao, pessoasDoTipo);
  const categoriaSugerida = maisParecido(linha.descricao, categoriasDoTipo);
  const [lanc, setLanc] = useState({
    descricao: descricaoDoHistorico(linha.descricao),
    pessoa: pessoaSugerida?.nome ?? "",
    categoria: categoriaSugerida?.id ?? (categoriasDoTipo.length === 1 ? categoriasDoTipo[0].id : ""),
    centro: centrosAtivos.length === 1 ? centrosAtivos[0].id : "",
    documento: linha.documento ?? "",
    observacao: "",
  });
  const mudarLanc = (m: Partial<typeof lanc>) => setLanc((l) => ({ ...l, ...m }));

  // ---------------------------------------------------------------- abas "Transferência" e "Ignorar"
  const outras = contas.filter((c) => c.ativo && c.id !== conta.id);
  const [outra, setOutra] = useState(outras.length === 1 ? outras[0].id : "");
  const [obsTransf, setObsTransf] = useState("");
  const [motivo, setMotivo] = useState("");

  async function executar() {
    setErro("");
    try {
      if (aba === "hub") {
        if (!escolhidos.length) return setErro("Marque pelo menos um pagamento, conta em aberto ou transferência.");
        if (Math.abs(diferenca) >= 0.005)
          return setErro(
            `A soma escolhida (${brl(soma)}) não bate com o extrato (${brl(Number(linha.valor))}). Ajuste os valores ou registre juros/desconto.`,
          );
      } else if (aba === "lancar") {
        if (!lanc.descricao.trim()) return setErro("Escreva a descrição do lançamento.");
        if (!lanc.categoria) return setErro(`Escolha a categoria de ${tipoCat}.`);
      } else if (aba === "transferencia") {
        if (!outra) return setErro("Escolha a outra conta da transferência.");
      } else if (motivo.trim().replace(/\s/g, "").length < 5)
        return setErro("Escreva o motivo (pelo menos 5 letras). Ele fica guardado no histórico.");

      setOcupado(true);
      if (aba === "hub") {
        await conciliar(linha.id, {
          baixas: escolhidos.filter((c) => c.tipo === "baixa").map((c) => c.item.id as number),
          transferencias: escolhidos.filter((c) => c.tipo === "transferencia").map((c) => c.item.id as number),
          titulos: escolhidos.filter((c) => c.tipo === "titulo").map((c) => ({ id: c.item.id as string, ...ajustes[c.item.id as string] })),
          observacao: obs.trim() || null,
        });
        aoGravar("Lançamento do extrato conciliado.");
      } else if (aba === "lancar") {
        const achou = cadastros.pessoas.find((p) => p.nome.toLowerCase() === lanc.pessoa.trim().toLowerCase());
        await conciliarLancar(linha.id, {
          categoria: lanc.categoria,
          centro: lanc.centro || null,
          pessoa: achou?.id ?? null,
          pessoa_nome: lanc.pessoa.trim() || null,
          descricao: lanc.descricao.trim(),
          documento: lanc.documento.trim() || null,
          observacao: lanc.observacao.trim() || null,
        });
        aoGravar(`${entrada ? "Recebimento" : "Pagamento"} lançado e conciliado.`);
      } else if (aba === "transferencia") {
        await conciliarTransferir(linha.id, outra, obsTransf.trim() || null);
        aoGravar("Transferência lançada e conciliada.");
      } else {
        await ignorarLinha(linha.id, motivo.trim());
        aoGravar("Lançamento ignorado. Ele fica de fora da conciliação.");
      }
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }

  const BOTAO: Record<AbaConciliar, string> = {
    hub: "Conciliar",
    lancar: "Criar lançamento e conciliar",
    transferencia: "Lançar transferência e conciliar",
    ignorar: "Ignorar lançamento",
  };
  const nomeOutra = outras.find((c) => c.id === outra)?.nome ?? "a outra conta";

  return (
    <Modal
      titulo="Conciliar lançamento do extrato"
      descricao={
        <>
          {fmtData(linha.data)} · {conta.nome} · <span className="font-medium">{linha.descricao}</span> ·{" "}
          <Valor v={Number(linha.valor)} sinal />
        </>
      }
      largura="6xl"
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
          <button className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button className="btn-primario" onClick={executar} disabled={ocupado}>
            {ocupado ? "Salvando…" : BOTAO[aba]}
          </button>
        </>
      }
    >
      <Abas<AbaConciliar>
        rotulo="Como conciliar"
        valor={aba}
        aoMudar={(a) => {
          setAba(a);
          setErro("");
        }}
        itens={[
          { id: "hub", nome: "Contas do HUB" },
          { id: "lancar", nome: "Criar lançamento" },
          { id: "transferencia", nome: "Transferência" },
          { id: "ignorar", nome: "Ignorar" },
        ]}
      />

      {aba === "hub" && (
        <ColunasFormulario esquerdaLarga>
          <ColunaFormulario>
            {sugestoes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Sugestões</p>
                {sugestoes.map((s) => {
                  const chaves = s.candidatos.map(chaveCandidato);
                  const igual = chaves.length === marcados.length && chaves.every((k) => marcados.includes(k));
                  return (
                    <div
                      key={chaves.join("+")}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--borda)] p-2 text-sm sm:flex-row sm:items-center"
                    >
                      <span className="self-start sm:self-center">
                        <Chip tom={s.pontos >= PONTOS_ALTOS ? "verde" : "ambar"}>{rotuloPontos(s.pontos)}</Chip>
                      </span>
                      <span className="min-w-0 flex-1">
                        {s.candidatos.map((c) => nomeCandidato(c)).join(" + ")}
                        <span className="block text-xs text-[var(--texto-suave)]">{s.motivos.join(" · ")}</span>
                      </span>
                      <button className="btn" onClick={() => setMarcados(chaves)} disabled={igual}>
                        {igual ? "Escolhida" : "Usar esta"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <label className="campo">
              <span>Procurar no HUB</span>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, descrição, documento ou valor"
              />
            </label>
            <ListaCandidatos
              titulo={entrada ? "Recebimentos e transferências já lançados" : "Pagamentos e transferências já lançados"}
              vazio="Nenhum lançamento do HUB sem extrato perto desta data."
              itens={jaLancados}
              marcados={marcados}
              alternar={alternar}
            />
            <ListaCandidatos
              titulo={entrada ? "Contas a receber em aberto" : "Contas a pagar em aberto"}
              vazio="Nenhuma conta em aberto deste tipo perto desta data."
              itens={emAberto}
              marcados={marcados}
              alternar={alternar}
              detalhe={(c) => {
                if (c.tipo !== "titulo" || !marcados.includes(chaveCandidato(c))) return null;
                const f = campos[c.item.id] ?? { valor: valorParaCampo(c.item.saldo), juros: "", desconto: "" };
                const mudar = (m: Partial<Campos[string]>) => mudarCampo(c.item.id, c.item.saldo, m);
                return (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <label className="campo">
                      <span>Valor</span>
                      <input inputMode="decimal" value={f.valor} onChange={(e) => mudar({ valor: e.target.value })} />
                    </label>
                    <label className="campo">
                      <span>Juros</span>
                      <input inputMode="decimal" value={f.juros} onChange={(e) => mudar({ juros: e.target.value })} placeholder="0,00" />
                    </label>
                    <label className="campo">
                      <span>Desconto</span>
                      <input
                        inputMode="decimal"
                        value={f.desconto}
                        onChange={(e) => mudar({ desconto: e.target.value })}
                        placeholder="0,00"
                      />
                    </label>
                  </div>
                );
              }}
            />
          </ColunaFormulario>
          <ColunaFormulario>
            <div className="cartao space-y-2 p-3 text-sm">
              <p className="font-medium">Conferência</p>
              <Linha rotulo="Valor no extrato">
                <Valor v={Number(linha.valor)} sinal />
              </Linha>
              <Linha rotulo={`Soma escolhida (${escolhidos.length})`}>
                <Valor v={soma} sinal />
              </Linha>
              <Linha rotulo="Diferença">
                <span className={Math.abs(diferenca) >= 0.005 ? "font-semibold text-red-700" : "font-semibold text-emerald-800"}>
                  {Math.abs(diferenca) >= 0.005 ? brl(diferenca) : "Bateu"}
                </span>
              </Linha>
              {Math.abs(diferenca) >= 0.005 && escolhidos.some((c) => c.tipo === "titulo") && (
                <button className="btn w-full" onClick={levarDiferenca}>
                  Levar a diferença para {Math.abs(Number(linha.valor)) > Math.abs(soma) ? "juros" : "desconto"}
                </button>
              )}
              <p className="text-xs text-[var(--texto-suave)]">
                Conta em aberto é baixada na data do extrato ({fmtData(linha.data)}) nesta conta. Pode marcar várias quando o banco juntou
                pagamentos.
              </p>
            </div>
            <label className="campo">
              <span>Observação (opcional)</span>
              <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
            </label>
          </ColunaFormulario>
        </ColunasFormulario>
      )}

      {aba === "lancar" && (
        <>
          <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
            Vai lançar uma conta {entrada ? "a receber" : "a pagar"} de <strong>{brl(Math.abs(Number(linha.valor)))}</strong>, já{" "}
            {entrada ? "recebida" : "paga"} em {fmtData(linha.data)} na conta {conta.nome}, e conciliar com esta linha.
          </p>
          <ColunasFormulario>
            <ColunaFormulario>
              <label className="campo">
                <span>Descrição</span>
                <input required value={lanc.descricao} onChange={(e) => mudarLanc({ descricao: e.target.value })} />
              </label>
              <label className="campo">
                <span>{entrada ? "Cliente" : "Fornecedor"} (opcional)</span>
                <input list="lista-pessoas-conciliar" value={lanc.pessoa} onChange={(e) => mudarLanc({ pessoa: e.target.value })} />
                <datalist id="lista-pessoas-conciliar">
                  {pessoasDoTipo.map((p) => (
                    <option key={p.id} value={p.nome} />
                  ))}
                </datalist>
                {pessoaSugerida && lanc.pessoa === pessoaSugerida.nome && <Dica>Sugerido pelo nome no extrato.</Dica>}
                {lanc.pessoa.trim() && !cadastros.pessoas.some((p) => p.nome.toLowerCase() === lanc.pessoa.trim().toLowerCase()) && (
                  <Dica>Ainda não cadastrado: será cadastrado junto, só com o nome.</Dica>
                )}
              </label>
              <label className="campo">
                <span>Documento (opcional)</span>
                <input value={lanc.documento} onChange={(e) => mudarLanc({ documento: e.target.value })} />
              </label>
            </ColunaFormulario>
            <ColunaFormulario>
              <label className="campo">
                <span>Categoria de {tipoCat}</span>
                <select required value={lanc.categoria} onChange={(e) => mudarLanc({ categoria: e.target.value })}>
                  <option value="">Escolha…</option>
                  {categoriasDoTipo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grupo ? `${c.grupo} › ` : ""}
                      {c.nome}
                    </option>
                  ))}
                </select>
                {categoriaSugerida && lanc.categoria === categoriaSugerida.id && <Dica>Sugerida pelo histórico do extrato.</Dica>}
                {!categoriasDoTipo.length && <Dica>Cadastre uma categoria de {tipoCat} em Plano de contas › Categorias.</Dica>}
              </label>
              <label className="campo">
                <span>Centro de custo (opcional)</span>
                <select value={lanc.centro} onChange={(e) => mudarLanc({ centro: e.target.value })}>
                  <option value="">Nenhum</option>
                  {centrosAtivos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo ? `${c.codigo} · ` : ""}
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Observação (opcional)</span>
                <textarea rows={2} value={lanc.observacao} onChange={(e) => mudarLanc({ observacao: e.target.value })} />
              </label>
            </ColunaFormulario>
          </ColunasFormulario>
        </>
      )}

      {aba === "transferencia" && (
        <ColunasFormulario>
          <ColunaFormulario>
            <label className="campo">
              <span>{entrada ? "Veio da conta" : "Foi para a conta"}</span>
              <select required value={outra} onChange={(e) => setOutra(e.target.value)}>
                <option value="">Escolha…</option>
                {outras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              {!outras.length && <Dica>A empresa só tem esta conta. Cadastre a outra em Financeiro › Bancos.</Dica>}
            </label>
            <label className="campo">
              <span>Observação (opcional)</span>
              <input value={obsTransf} onChange={(e) => setObsTransf(e.target.value)} placeholder="Ex.: reserva para impostos" />
            </label>
          </ColunaFormulario>
          <ColunaFormulario>
            <p className="rounded-md bg-[var(--fundo)] p-3 text-sm">
              Lança uma transferência de <strong>{brl(Math.abs(Number(linha.valor)))}</strong> em {fmtData(linha.data)}:{" "}
              {entrada ? `saiu de ${nomeOutra} e entrou em ${conta.nome}` : `saiu de ${conta.nome} e entrou em ${nomeOutra}`}. Não é receita
              nem despesa. Quando importar o extrato da outra conta, a chegada aparece como sugestão para conciliar.
            </p>
            <p className="text-xs text-[var(--texto-suave)]">Se a transferência já foi lançada, escolha-a na aba Contas do HUB.</p>
          </ColunaFormulario>
        </ColunasFormulario>
      )}

      {aba === "ignorar" && (
        <div className="max-w-2xl space-y-3">
          <p className="text-sm">
            Use quando o lançamento não deve entrar no HUB (ex.: depósito de teste do banco, estorno que o próprio banco desfez). Ele fica
            marcado como ignorado e a diferença aparece no quadro de saldos.
          </p>
          <label className="campo">
            <span>Motivo</span>
            <textarea
              required
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: depósito de teste, devolvido no mesmo dia"
            />
          </label>
        </div>
      )}
    </Modal>
  );
}

const nomeCandidato = (c: Candidato) =>
  c.tipo === "transferencia"
    ? `Transferência ${c.item.valor > 0 ? "de" : "para"} ${c.item.outra_conta}`
    : [c.item.descricao, c.item.pessoa].filter(Boolean).join(" · ");

function ListaCandidatos({
  titulo,
  vazio,
  itens,
  marcados,
  alternar,
  detalhe,
}: {
  titulo: string;
  vazio: string;
  itens: Candidato[];
  marcados: string[];
  alternar: (c: Candidato) => void;
  detalhe?: (c: Candidato) => React.ReactNode;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="pb-1 text-sm font-medium">{titulo}</legend>
      {!itens.length && <p className="text-sm text-[var(--texto-suave)]">{vazio}</p>}
      {itens.map((c) => {
        const k = chaveCandidato(c);
        return (
          <div
            key={k}
            className={`rounded-lg border p-2 ${marcados.includes(k) ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"}`}
          >
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={marcados.includes(k)} onChange={() => alternar(c)} />
              <span className="min-w-0 flex-1">
                <span className="block break-words">{nomeCandidato(c)}</span>
                <span className="block text-xs text-[var(--texto-suave)]">
                  {c.tipo === "titulo" ? `vence ${fmtData(dataDoCandidato(c))}` : fmtData(dataDoCandidato(c))}
                  {c.tipo === "baixa" && c.item.forma ? ` · ${c.item.forma}` : ""}
                  {c.tipo !== "transferencia" && c.item.documento ? ` · doc. ${c.item.documento}` : ""}
                </span>
              </span>
              <span className="whitespace-nowrap font-medium">
                <Valor v={valorComSinal(c)} sinal />
              </span>
            </label>
            {detalhe?.(c)}
          </div>
        );
      })}
    </fieldset>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--texto-suave)]">{rotulo}</span>
      {children}
    </div>
  );
}

const Dica = ({ children }: { children: React.ReactNode }) => <span className="block text-xs text-[var(--texto-suave)]">{children}</span>;
