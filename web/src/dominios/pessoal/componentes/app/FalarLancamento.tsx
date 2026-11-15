// MDC · Pessoal: lançar falando. A pessoa fala (ou escreve) "paguei a luz 230 ontem e recebi o salário de 5 mil"; o app
// entende sozinho (dominios/pessoal/voz.ts) e aprende com o que a família corrige (guardado neste aparelho). Os
// lançamentos aparecem no cartão "Entendi assim" para conferir e corrigir; só "Salvar" grava (fin_lancar, como o
// lançamento pelo teclado). Na primeira vez explica o que acontece com a fala (LGPD).
// A ajuda da IA (Função Edge pessoal-voz, paga por uso) fica DESLIGADA: o app é gratuito (decisão do Edvaldo,
// 14/11/2026). Para ligar: NEXT_PUBLIC_PESSOAL_VOZ_IA=1 na Vercel e ANTHROPIC_API_KEY nos segredos do Supabase.
"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { lancar } from "@/dominios/financeiro/repositorio";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { aprender, faltaNoFalado, interpretarFala, lerValor } from "../../voz";
import type { Aprendido, LancamentoFalado } from "../../voz";
import type { Categoria, ContaBanco } from "./dados";
import { avisarMudanca } from "./dados";
import { avisoRapido } from "./avisoRapido";

const CHAVE_AVISO = "pessoal:voz-aviso-v1";
const IA_LIGADA = process.env.NEXT_PUBLIC_PESSOAL_VOZ_IA === "1";
const chaveAprendido = (org: string) => `pessoal:voz-aprendeu:${org}`;

function lerAprendido(org: string): Aprendido {
  try {
    const v = JSON.parse(localStorage.getItem(chaveAprendido(org)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Aprendido) : {};
  } catch {
    return {};
  }
}

function guardarAprendido(org: string, mapa: Aprendido) {
  try {
    localStorage.setItem(chaveAprendido(org), JSON.stringify(mapa));
  } catch {
    /* sem armazenamento: só não aprende neste aparelho */
  }
}

interface Reconhecimento {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function criarReconhecimento(): Reconhecimento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecimento; webkitSpeechRecognition?: new () => Reconhecimento };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
}

/** Cartão em edição: o valor fica como texto enquanto a pessoa digita. */
type Cartao = LancamentoFalado & { chave: number; valorTexto: string };

export function FalarLancamento({
  cliente,
  categorias,
  bancos,
  hoje,
  aoFechar,
}: {
  cliente: string;
  categorias: Categoria[];
  bancos: ContaBanco[];
  hoje: string;
  aoFechar: () => void;
}) {
  const { org } = useOrg();
  const [aviso, setAviso] = useState(() => {
    try {
      return !localStorage.getItem(CHAVE_AVISO);
    } catch {
      return true;
    }
  });
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [entendendo, setEntendendo] = useState(false);
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [banco, setBanco] = useState(bancos[0]?.id ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dica, setDica] = useState<string | null>(null);
  const reconhecimento = useRef<Reconhecimento | null>(null);
  const [temVoz] = useState(() => !!criarReconhecimento());

  useEffect(() => () => reconhecimento.current?.stop(), []);

  function aceitarAviso() {
    try {
      localStorage.setItem(CHAVE_AVISO, "1");
    } catch {
      /* navegador sem armazenamento: mostra o aviso de novo na próxima vez */
    }
    setAviso(false);
  }

  function ouvir() {
    if (ouvindo) {
      reconhecimento.current?.stop();
      return;
    }
    const r = criarReconhecimento();
    if (!r) return;
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    let final = "";
    r.onresult = (e) => {
      let parcial = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += `${t} `;
        else parcial += t;
      }
      setTexto(`${final}${parcial}`.trim());
    };
    r.onerror = (e) => {
      setOuvindo(false);
      setErro(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "O navegador não deixou usar o microfone. Libere o microfone para este site ou use o microfone do teclado."
          : e.error === "no-speech"
            ? "Não ouvi nada. Toque no microfone e fale perto do celular."
            : "Não deu para ouvir agora. Tente de novo ou escreva.",
      );
    };
    r.onend = () => {
      setOuvindo(false);
      if (final.trim()) void entender(final.trim());
    };
    reconhecimento.current = r;
    setErro(null);
    setDica(null);
    setOuvindo(true);
    r.start();
  }

  async function entender(fala = texto) {
    const frase = fala.trim();
    if (frase.length < 3) return setErro("Fale ou escreva o que você gastou ou recebeu.");
    setErro(null);
    setDica(null);
    let itens = interpretarFala(frase, categorias, hoje, lerAprendido(org.id));
    // o app não entendeu tudo sozinho: pede ajuda à IA (só se estiver ligada; hoje fica desligada, o app é gratuito)
    if (IA_LIGADA && (!itens.length || itens.some((l) => faltaNoFalado(l)))) {
      setEntendendo(true);
      try {
        const r = await chamarFuncao<{
          indisponivel?: boolean;
          lancamentos?: (Omit<LancamentoFalado, "categoria"> & { categoria: string | null })[];
        }>("pessoal-voz", {
          corpo: { org: org.id, texto: frase, hoje, categorias: categorias.map((c) => ({ nome: c.nome, tipo: c.tipo })) },
        });
        if (r.lancamentos?.length) {
          itens = r.lancamentos.map((l) => ({
            ...l,
            categoria:
              categorias.find((c) => c.nome === l.categoria && c.tipo === (l.tipo === "pagar" ? "despesa" : "receita"))?.id ?? null,
          }));
        }
      } catch (e) {
        setDica(traduzirErro(e));
      } finally {
        setEntendendo(false);
      }
    }
    if (!itens.length) return setErro('Não achei um valor na frase. Ex.: "gastei 80 no mercado".');
    setCartoes(itens.map((l, i) => ({ ...l, chave: Date.now() + i, valorTexto: l.valor ? String(l.valor).replace(".", ",") : "" })));
  }

  function mudar(chave: number, m: Partial<Cartao>) {
    setCartoes((cs) =>
      (cs ?? []).map((c) => {
        if (c.chave !== chave) return c;
        const novo = { ...c, ...m };
        if (m.valorTexto !== undefined) novo.valor = lerValor(m.valorTexto);
        if (m.tipo && m.tipo !== c.tipo) novo.categoria = null;
        return novo;
      }),
    );
  }

  const lista = cartoes ?? [];
  const pendencia = lista.map(faltaNoFalado).find(Boolean) ?? (lista.some((c) => c.pago) && !banco ? "Escolha a conta" : null);
  const total = lista.reduce((a, c) => a + (c.tipo === "pagar" ? -c.valor : c.valor), 0);

  async function salvar() {
    if (salvando || pendencia || !lista.length) return;
    setSalvando(true);
    setErro(null);
    let feitos = 0;
    try {
      for (const c of lista) {
        await lancar({
          cliente,
          tipo: c.tipo,
          categoria: c.categoria!,
          descricao: c.descricao.trim() || categorias.find((x) => x.id === c.categoria)?.nome || "Lançamento",
          vencimento: c.data,
          valor: c.valor,
          parcelas: 1,
          pago: c.pago ? { data: c.data, conta: banco } : null,
        });
        feitos++;
      }
      // aprende com o que a pessoa conferiu (e corrigiu): na próxima fala o app já acerta
      guardarAprendido(
        org.id,
        lista.reduce((m, c) => aprender(m, c), lerAprendido(org.id)),
      );
      avisarMudanca();
      avisoRapido(feitos === 1 ? "Lançamento salvo" : `${feitos} lançamentos salvos`);
      aoFechar();
    } catch (e) {
      // os que já foram não voltam para a lista, para não gravar duas vezes
      setCartoes(lista.slice(feitos));
      if (feitos) avisarMudanca();
      setErro(`${feitos ? `${feitos} salvo(s). ` : ""}${traduzirErro(e)}`);
      setSalvando(false);
    }
  }

  if (aviso)
    return (
      <Modal
        titulo="Lançar falando"
        largura="lg"
        celularCheio
        aoFechar={aoFechar}
        rodape={
          <>
            <button type="button" className="btn-primario min-h-12 flex-1 text-base sm:flex-none" onClick={aceitarAviso}>
              <Icone nome="microfone" className="h-5 w-5" />
              Entendi, quero falar
            </button>
            <button type="button" className="btn min-h-12" onClick={aoFechar}>
              <Icone nome="voltar" className="h-4 w-4" />
              Voltar
            </button>
          </>
        }
      >
        <div className="space-y-3 text-[15px] text-neutral-700">
          <p>
            Fale como numa conversa: <b>&quot;paguei a luz 230 ontem&quot;</b> ou <b>&quot;recebi o salário de 5 mil&quot;</b>. O app monta
            o lançamento e você confere antes de salvar. Nada é gravado sozinho.
          </p>
          <ul className="space-y-2 rounded-xl bg-[#F1EEE5] p-3 text-[14px]">
            <li className="flex gap-2">
              <Icone nome="microfone" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />A fala vira texto pelo próprio celular ou
              navegador (no Chrome, pelo serviço de voz do Google; no iPhone, pela Apple).
            </li>
            {IA_LIGADA ? (
              <li className="flex gap-2">
                <Icone nome="escudo" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
                Quando o app não entende sozinho, só o texto vai para a IA da MDC (Claude, da Anthropic) montar o lançamento.
              </li>
            ) : (
              <li className="flex gap-2">
                <Icone nome="escudo" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />O app entende a frase aqui mesmo, sem mandar
                para nenhuma IA, e aprende com o que você corrige.
              </li>
            )}
            <li className="flex gap-2">
              <Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />O áudio e a frase não ficam guardados. Fica o
              lançamento que você salvar e, neste aparelho, o que o app aprendeu.
            </li>
          </ul>
        </div>
      </Modal>
    );

  return (
    <Modal
      titulo={cartoes ? "Entendi assim" : "Lançar falando"}
      descricao={cartoes ? "Confira e corrija o que precisar antes de salvar." : undefined}
      largura="lg"
      celularCheio
      aoFechar={aoFechar}
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        cartoes ? (
          <>
            <button
              type="button"
              className="btn-primario min-h-12 flex-1 text-base sm:flex-none"
              disabled={!!pendencia || salvando || !lista.length}
              onClick={() => void salvar()}
            >
              <Icone nome="check" className="h-5 w-5" />
              {salvando ? "Gravando…" : (pendencia ?? (lista.length === 1 ? "Salvar" : `Salvar os ${lista.length}`))}
            </button>
            <button type="button" className="btn min-h-12" onClick={() => setCartoes(null)}>
              <Icone nome="microfone" className="h-4 w-4" />
              Falar de novo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-primario min-h-12 flex-1 text-base sm:flex-none"
              disabled={entendendo || ouvindo || texto.trim().length < 3}
              onClick={() => void entender()}
            >
              <Icone nome="check" className="h-5 w-5" />
              {entendendo ? "Entendendo…" : "Montar lançamento"}
            </button>
            <button type="button" className="btn min-h-12" onClick={aoFechar}>
              <Icone nome="voltar" className="h-4 w-4" />
              Voltar
            </button>
          </>
        )
      }
    >
      {!cartoes ? (
        <div className="space-y-4">
          {temVoz && (
            <div className="flex flex-col items-center gap-2 py-2">
              <button
                type="button"
                onClick={ouvir}
                aria-pressed={ouvindo}
                aria-label={ouvindo ? "Parar de ouvir" : "Falar"}
                className={`grid h-24 w-24 place-items-center rounded-full text-white shadow-lg transition active:scale-95 ${ouvindo ? "animate-pulse bg-red-600" : "bg-[var(--marca)]"}`}
              >
                <Icone nome="microfone" className="h-11 w-11" />
              </button>
              <p className="text-sm font-semibold text-[var(--marca)]">{ouvindo ? "Estou ouvindo… toque para parar" : "Toque e fale"}</p>
            </div>
          )}
          <label className="campo">
            <span>{temVoz ? "O que eu ouvi (pode corrigir)" : "Diga ou escreva"}</span>
            <textarea
              rows={3}
              maxLength={600}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: paguei a luz 230 ontem e recebi o salário de 5 mil"
            />
          </label>
          {!temVoz && (
            <p className="flex gap-2 rounded-xl bg-[#F1EEE5] p-3 text-[13px] text-neutral-700">
              <Icone nome="microfone" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
              Este navegador não ouve direto. Toque no campo e use o microfone do teclado do celular para falar.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {dica && <p className="rounded-md bg-amber-50 p-2 text-[13px] text-amber-900">{dica}</p>}
          {lista.map((c) => {
            const gasto = c.tipo === "pagar";
            const opcoes = categorias.filter((x) => x.tipo === (gasto ? "despesa" : "receita"));
            const falta = faltaNoFalado(c);
            return (
              <section
                key={c.chave}
                className={`space-y-3 rounded-2xl border bg-white p-3.5 ${falta ? "border-amber-400" : "border-[var(--borda)]"}`}
              >
                <div className="flex items-center gap-2">
                  <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-[#E9E5D9] p-1" role="group" aria-label="Gasto ou entrada">
                    {(["pagar", "receber"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={c.tipo === t}
                        onClick={() => mudar(c.chave, { tipo: t })}
                        className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${
                          c.tipo === t
                            ? t === "pagar"
                              ? "bg-white text-red-700 shadow-sm"
                              : "bg-white text-emerald-800 shadow-sm"
                            : "text-neutral-600"
                        }`}
                      >
                        <Icone nome={t === "pagar" ? "seta-saida" : "seta-entrada"} className="h-4 w-4" />
                        {t === "pagar" ? "Gasto" : "Entrada"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500"
                    aria-label="Tirar este lançamento"
                    onClick={() => setCartoes(lista.filter((x) => x.chave !== c.chave))}
                  >
                    <Icone nome="lixeira" className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="campo">
                    <span>Valor (R$)</span>
                    <input
                      inputMode="decimal"
                      value={c.valorTexto}
                      onChange={(e) => mudar(c.chave, { valorTexto: e.target.value })}
                      placeholder="0,00"
                    />
                  </label>
                  <label className="campo">
                    <span>Data</span>
                    <input type="date" value={c.data} onChange={(e) => e.target.value && mudar(c.chave, { data: e.target.value })} />
                  </label>
                  <label className="campo col-span-2 sm:col-span-1">
                    <span>{gasto ? "Tipo de gasto" : "Tipo de entrada"}</span>
                    <select value={c.categoria ?? ""} onChange={(e) => mudar(c.chave, { categoria: e.target.value || null })}>
                      <option value="">Escolha…</option>
                      {opcoes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo col-span-2 sm:col-span-1">
                    <span>Descrição</span>
                    <input value={c.descricao} maxLength={120} onChange={(e) => mudar(c.chave, { descricao: e.target.value })} />
                  </label>
                </div>
                <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-neutral-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={c.pago}
                    onChange={(e) => mudar(c.chave, { pago: e.target.checked })}
                  />
                  {gasto ? "Já paguei" : "Já recebi"}
                  {!c.pago && (
                    <span className="text-[13px] font-normal text-neutral-500">(fica em Contas, para {gasto ? "pagar" : "receber"})</span>
                  )}
                </label>
                {falta && (
                  <p className="text-[13px] font-medium text-amber-800">
                    {falta}
                    {!c.categoria && c.valor > 0 && <span className="font-normal"> · escolha uma vez e o app aprende</span>}
                  </p>
                )}
              </section>
            );
          })}
          {!lista.length && <p className="py-6 text-center text-sm text-neutral-600">Nada para salvar. Toque em Falar de novo.</p>}
          {lista.some((c) => c.pago) && bancos.length > 1 && (
            <label className="campo">
              <span>Saiu ou entrou em qual conta?</span>
              <select value={banco} onChange={(e) => setBanco(e.target.value)}>
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {lista.length > 1 && (
            <p className="text-right text-sm text-neutral-600">
              No total: <b className={total < 0 ? "text-red-700" : "text-emerald-800"}>{brl(total)}</b>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
