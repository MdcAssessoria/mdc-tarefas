// Seções da ficha do processo: protocolos, exigências, taxas e documentos, cada uma num cartão com título, lista e o
// formulário curto de registrar (aberto só quando a pessoa pede). Linha do tempo (histórico + comentário) no fim.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { hojeISO } from "@/lib/datas";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtDataHora } from "@/lib/formato/datas";
import { abrirArquivo, fmtTamanho } from "@/lib/arquivos/armazenamento";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { ORGAOS } from "../processos";
import type { Evento, Exigencia, Protocolo, Taxa } from "../leituras";

export function Bloco({
  titulo,
  icone,
  contador,
  vazio,
  children,
  rodape,
}: {
  titulo: string;
  icone: NomeIcone;
  contador?: React.ReactNode;
  /** Texto quando não há nada na lista. */
  vazio?: string;
  children?: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const temItens = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <section className="cartao flex flex-col p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-[var(--marca)]">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--fundo)]" aria-hidden="true">
          <Icone nome={icone} className="h-4 w-4" />
        </span>
        {titulo}
        {contador !== undefined && <span className="ml-auto text-sm font-normal text-[var(--texto-suave)]">{contador}</span>}
      </h2>
      {temItens ? (
        <ul className="divide-y divide-[var(--borda)] text-sm">{children}</ul>
      ) : (
        vazio && <p className="rounded-lg bg-[var(--fundo)] px-3 py-3 text-sm text-[var(--texto-suave)]">{vazio}</p>
      )}
      {rodape && <div className="mt-3">{rodape}</div>}
    </section>
  );
}

type Campo = { nome: string; rotulo: string; tipo?: string; opcoes?: string[]; area?: boolean; opcional?: boolean };

/** Formulário curto de registrar. Só fecha quando `aoEnviar` devolve true (se der erro, o que foi digitado fica). */
export function FormLinha({
  campos,
  botao,
  aoEnviar,
}: {
  campos: Campo[];
  botao: string;
  aoEnviar: (v: Record<string, string | null>) => Promise<boolean>;
}) {
  const { org } = useOrg();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inicial = () =>
    Object.fromEntries(campos.map((c) => [c.nome, c.tipo === "date" && !c.opcional ? hojeISO(org.fuso) : (c.opcoes?.[0] ?? "")]));
  const [v, setV] = useState<Record<string, string>>(inicial);
  if (!aberto)
    return (
      <button className="btn w-full justify-center sm:w-auto" onClick={() => setAberto(true)}>
        <Icone nome="mais" className="h-4 w-4" />
        {botao}
      </button>
    );
  return (
    <form
      className="space-y-3 rounded-lg border border-[var(--borda)] bg-[var(--fundo)] p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        const limpo = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === "" ? null : x]));
        const ok = await aoEnviar(limpo);
        setEnviando(false);
        if (!ok) return;
        setV(inicial());
        setAberto(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {campos.map((c) => (
          <label key={c.nome} className={`campo ${c.area ? "sm:col-span-2" : ""}`}>
            <span>{c.rotulo}</span>
            {c.opcoes ? (
              <select value={v[c.nome]} onChange={(e) => setV({ ...v, [c.nome]: e.target.value })}>
                {c.opcoes.map((o) => (
                  <option key={o} value={o}>
                    {o === "mdc" ? "MDC" : o === "cliente" ? "Cliente" : o}
                  </option>
                ))}
              </select>
            ) : c.area ? (
              <textarea required={!c.opcional} rows={3} value={v[c.nome]} onChange={(e) => setV({ ...v, [c.nome]: e.target.value })} />
            ) : (
              <input
                type={c.tipo ?? "text"}
                step={c.tipo === "number" ? "0.01" : undefined}
                inputMode={c.tipo === "number" ? "decimal" : undefined}
                required={!c.opcional}
                value={v[c.nome]}
                onChange={(e) => setV({ ...v, [c.nome]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={() => setAberto(false)} disabled={enviando}>
          Voltar
        </button>
        <button className="btn-primario" disabled={enviando}>
          <Icone nome="check" className="h-4 w-4" />
          {enviando ? "Gravando…" : "Gravar"}
        </button>
      </div>
    </form>
  );
}

export function Protocolos({
  itens,
  podeRegistrar,
  aoRegistrar,
}: {
  itens: Protocolo[];
  podeRegistrar: boolean;
  aoRegistrar: (v: Record<string, string | null>) => Promise<boolean>;
}) {
  return (
    <Bloco
      titulo="Protocolos"
      icone="documento"
      contador={itens.length || undefined}
      vazio="Nenhum protocolo ainda. Registre o número assim que protocolar na Junta, Receita ou Prefeitura."
      rodape={
        podeRegistrar && (
          <FormLinha
            campos={[
              { nome: "orgao", rotulo: "Órgão", opcoes: ORGAOS },
              { nome: "numero", rotulo: "Número do protocolo" },
              { nome: "data", rotulo: "Data", tipo: "date" },
              { nome: "link", rotulo: "Link para acompanhar (opcional)", opcional: true },
            ]}
            botao="Registrar protocolo"
            aoEnviar={aoRegistrar}
          />
        )
      }
    >
      {itens.map((x) => (
        <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>
            <b>{x.orgao}</b> · nº <span className="num">{x.numero}</span>
            <span className="block text-xs text-[var(--texto-suave)]">em {fmtData(x.data)}</span>
          </span>
          {x.link && (
            <a href={x.link} target="_blank" rel="noopener noreferrer" className="btn !min-h-8 !px-2.5">
              <Icone nome="externo" className="h-4 w-4" />
              Acompanhar
            </a>
          )}
        </li>
      ))}
    </Bloco>
  );
}

export function Exigencias({
  itens,
  total,
  podeOperar,
  podeRegistrar,
  aoRegistrar,
  aoResponder,
}: {
  itens: Exigencia[];
  total: number;
  podeOperar: boolean;
  podeRegistrar: boolean;
  aoRegistrar: (v: Record<string, string | null>) => Promise<boolean>;
  aoResponder: (x: Exigencia, resposta: string, reprotocolo: string) => Promise<void>;
}) {
  const [respondendo, setRespondendo] = useState<Exigencia | null>(null);
  const pendentes = itens.filter((x) => !x.resposta).length;
  return (
    <>
      <Bloco
        titulo="Exigências"
        icone="alerta"
        contador={total ? (pendentes ? `${pendentes} sem resposta` : `${total}`) : undefined}
        vazio="Nenhuma exigência. Quando o órgão pedir correção, registre aqui: o processo vai para a fase de exigências."
        rodape={
          podeRegistrar && (
            <FormLinha
              campos={[
                { nome: "orgao", rotulo: "Órgão", opcoes: ORGAOS },
                { nome: "texto", rotulo: "O que o órgão pediu", area: true },
              ]}
              botao="Registrar exigência"
              aoEnviar={aoRegistrar}
            />
          )
        }
      >
        {itens.map((x) => (
          <li key={x.id} className="space-y-1.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{x.orgao}</b> <span className="text-xs text-[var(--texto-suave)]">· {fmtData(x.data)}</span>
              </span>
              {x.resposta ? <Chip tom="verde">Respondida</Chip> : <Chip tom="ambar">Sem resposta</Chip>}
            </div>
            <p className="whitespace-pre-wrap text-[var(--texto)]">{x.texto}</p>
            {x.resposta ? (
              <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900">
                <b>Resposta{x.reprotocolo_em && ` (reprotocolo em ${fmtData(x.reprotocolo_em)})`}:</b> {x.resposta}
              </p>
            ) : (
              podeOperar && (
                <button className="btn !min-h-8 !px-2.5" onClick={() => setRespondendo(x)}>
                  <Icone nome="editar" className="h-4 w-4" />
                  Registrar resposta
                </button>
              )
            )}
          </li>
        ))}
      </Bloco>
      {respondendo && (
        <JanelaResposta
          exigencia={respondendo}
          aoFechar={() => setRespondendo(null)}
          aoGravar={async (r, d) => {
            await aoResponder(respondendo, r, d);
            setRespondendo(null);
          }}
        />
      )}
    </>
  );
}

function JanelaResposta({
  exigencia,
  aoFechar,
  aoGravar,
}: {
  exigencia: Exigencia;
  aoFechar: () => void;
  aoGravar: (resposta: string, reprotocolo: string) => Promise<void>;
}) {
  const { org } = useOrg();
  const [resposta, setResposta] = useState("");
  const [data, setData] = useState(hojeISO(org.fuso));
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal titulo="Responder à exigência" descricao={`${exigencia.orgao} · ${fmtData(exigencia.data)}`} aoFechar={aoFechar} largura="lg">
      <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--fundo)] p-3 text-sm">{exigencia.texto}</p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!resposta.trim()) return setErro("Escreva o que foi feito para atender a exigência.");
          setOcupado(true);
          setErro("");
          try {
            await aoGravar(resposta.trim(), data);
          } catch (x) {
            setErro(traduzirErro(x));
            setOcupado(false);
          }
        }}
      >
        <label className="campo">
          <span>O que foi feito</span>
          <textarea
            rows={3}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="Ex.: contrato corrigido e reenviado"
          />
        </label>
        <label className="campo">
          <span>Data do reprotocolo</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={aoFechar} disabled={ocupado}>
            Voltar
          </button>
          <button className="btn-primario" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Aguarde…" : "Registrar resposta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Taxas({
  itens,
  hoje,
  podeOperar,
  podeRegistrar,
  aoRegistrar,
  aoPagar,
}: {
  itens: Taxa[];
  hoje: string;
  podeOperar: boolean;
  podeRegistrar: boolean;
  aoRegistrar: (v: Record<string, string | null>) => Promise<boolean>;
  aoPagar: (x: Taxa) => void;
}) {
  const total = itens.reduce((s, t) => s + (t.valor ?? 0), 0);
  return (
    <Bloco
      titulo="Taxas"
      icone="moeda"
      contador={total ? brl(total) : undefined}
      vazio="Nenhuma taxa registrada. Lance a DARE da Junta, GRU e taxas municipais para saber o que falta pagar."
      rodape={
        podeRegistrar && (
          <FormLinha
            campos={[
              {
                nome: "descricao",
                rotulo: "Taxa",
                opcoes: ["DARE Junta Comercial", "GRU", "Taxa municipal", "Taxa Bombeiros", "Taxa Vigilância", "Outra"],
              },
              { nome: "valor", rotulo: "Valor (R$)", tipo: "number" },
              { nome: "vencimento", rotulo: "Vencimento", tipo: "date", opcional: true },
              { nome: "pago_por", rotulo: "Quem paga", opcoes: ["cliente", "mdc"] },
            ]}
            botao="Registrar taxa"
            aoEnviar={aoRegistrar}
          />
        )
      }
    >
      {itens.map((x) => {
        const vencida = !x.pago_em && !!x.vencimento && x.vencimento < hoje;
        return (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="min-w-0">
              <span className="font-medium">{x.descricao}</span> · <span className="num">{brl(x.valor)}</span>
              <span className="block text-xs text-[var(--texto-suave)]">
                {x.vencimento ? `vence ${fmtData(x.vencimento)}` : "sem vencimento"}
                {x.pago_por && ` · paga por ${x.pago_por === "mdc" ? "MDC" : "cliente"}`}
              </span>
            </span>
            {x.pago_em ? (
              <Chip tom="verde">Paga em {fmtData(x.pago_em)}</Chip>
            ) : (
              <span className="flex items-center gap-1.5">
                <Chip tom={vencida ? "vermelho" : "azul"}>{vencida ? "Vencida" : "A pagar"}</Chip>
                {podeOperar && (
                  <button className="btn !min-h-8 !px-2.5" onClick={() => aoPagar(x)}>
                    <Icone nome="check" className="h-4 w-4" />
                    Marcar paga
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </Bloco>
  );
}

export function Documentos({
  itens,
  podeOperar,
  mostrarPortal,
  aoAnexar,
  aoPortal,
  aoErro,
  noAcervo,
  aoGuardarAcervo,
}: {
  itens: Arquivo[];
  podeOperar: boolean;
  /** Só com cliente ligado faz sentido mostrar no portal. */
  mostrarPortal: boolean;
  aoAnexar: (arquivos: FileList | null) => void;
  aoPortal: (a: Arquivo) => void;
  aoErro: (e: unknown) => void;
  /** Arquivos que já estão no acervo do cliente (mostram a etiqueta em vez do botão). */
  noAcervo?: Set<string>;
  /** Leva o anexo para o acervo do cliente (só com cliente ligado). */
  aoGuardarAcervo?: (a: Arquivo) => void;
}) {
  return (
    <Bloco
      titulo="Documentos"
      icone="clipe"
      contador={itens.length || undefined}
      vazio="Nenhum documento. Anexe contrato, requerimento, DBE e o que o cliente mandar."
      rodape={
        podeOperar && (
          <label className="btn w-full cursor-pointer justify-center sm:w-auto">
            <Icone nome="enviar" className="h-4 w-4" />
            Anexar documentos
            <input type="file" multiple className="sr-only" onChange={(e) => aoAnexar(e.target.files)} />
          </label>
        )
      }
    >
      {itens.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
          <button
            className="flex min-w-0 basis-full items-center gap-2 text-left hover:underline"
            onClick={() => abrirArquivo(a.caminho, a.nome).catch(aoErro)}
            title="Abrir o documento"
          >
            <Icone nome="arquivo" className="h-4 w-4 shrink-0 text-[var(--texto-suave)]" />
            <span className="truncate">{a.nome}</span>
            <span className="shrink-0 text-xs text-[var(--texto-suave)]">{fmtTamanho(a.tamanho)}</span>
          </button>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
            {noAcervo?.has(a.id) ? (
              <span className="chip bg-emerald-50 text-emerald-800" title="Já está no acervo do cliente">
                <Icone nome="check" className="h-3.5 w-3.5" />
                No acervo
              </span>
            ) : (
              podeOperar &&
              aoGuardarAcervo && (
                <button
                  className="btn !min-h-8 !px-2.5 text-xs"
                  onClick={() => aoGuardarAcervo(a)}
                  title="Guardar este documento no acervo do cliente"
                >
                  <Icone nome="pasta" className="h-3.5 w-3.5" />
                  Guardar no acervo
                </button>
              )
            )}
            {podeOperar && mostrarPortal && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--texto-suave)]" title="O cliente vê este documento no portal">
                <input type="checkbox" checked={a.visivel_cliente} onChange={() => aoPortal(a)} /> no portal
              </label>
            )}
          </span>
        </li>
      ))}
    </Bloco>
  );
}

export function LinhaDoTempo({
  eventos,
  podeOperar,
  aoComentar,
}: {
  eventos: Evento[];
  podeOperar: boolean;
  aoComentar: (texto: string, visivelCliente: boolean) => Promise<boolean>;
}) {
  const { nomeMembro } = useOrg();
  const [texto, setTexto] = useState("");
  const [cliente, setCliente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  return (
    <aside className="cartao h-fit p-4" aria-labelledby="titulo-historico">
      <h2 id="titulo-historico" className="mb-3 flex items-center gap-2 font-semibold text-[var(--marca)]">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--fundo)]" aria-hidden="true">
          <Icone nome="relogio" className="h-4 w-4" />
        </span>
        Linha do tempo
      </h2>
      {podeOperar && (
        <form
          className="mb-4 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            setEnviando(true);
            const ok = await aoComentar(texto.trim(), cliente);
            setEnviando(false);
            if (ok) {
              setTexto("");
              setCliente(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="comentario-processo">
            Comentário
          </label>
          <textarea
            id="comentario-processo"
            className="entrada w-full"
            rows={2}
            placeholder="Escreva um comentário para a equipe…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--texto-suave)]">
              <input type="checkbox" checked={cliente} onChange={(e) => setCliente(e.target.checked)} /> mostrar ao cliente no portal
            </label>
            <button className="btn-primario !min-h-9" disabled={enviando || !texto.trim()}>
              <Icone nome="chat" className="h-4 w-4" />
              Comentar
            </button>
          </div>
        </form>
      )}
      {!eventos.length ? (
        <p className="rounded-lg bg-[var(--fundo)] px-3 py-3 text-sm text-[var(--texto-suave)]">Nada registrado ainda.</p>
      ) : (
        <ol className="space-y-3 text-sm">
          {eventos.map((e) => (
            <li key={e.id} className="relative border-l-2 border-[var(--borda)] pl-3">
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[var(--destaque)]" aria-hidden="true" />
              <p className="whitespace-pre-wrap break-words">{e.texto}</p>
              <p className="text-xs text-[var(--texto-suave)]">
                {fmtDataHora(e.em)} · {nomeMembro(e.user_id)}
                {e.visivel_cliente && " · visível ao cliente"}
              </p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
