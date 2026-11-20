// Montagem de um pacote de licença (091): à esquerda o sistema e os módulos (com o preço avulso de cada um); à direita
// quantos usuários entram (qualquer número ou sem limite), o preço do pacote, o valor do usuário a mais, o que fazer
// quando passar do limite e o resumo (desconto sobre os avulsos e um exemplo de mensalidade). Só quem tem "gerir".
// As licenças já fechadas guardam a própria cópia: mudar o pacote vale só para as licenças novas.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { numeroBr, valorParaCampo } from "@/dominios/financeiro/regras";
import { salvarPlano } from "../repositorio";
import { modulosParaPacote, resumoPacote } from "../pacotes";
import type { Excedente, Plano, Produto, Sistema } from "../tipos";

const valorOuZero = (s: string) => (s.trim() ? numeroBr(s) : 0);

export function JanelaPacote({
  pacote,
  produtos,
  sistemas,
  sistemaInicial,
  emUso,
  org,
  aoFechar,
  aoSalvar,
}: {
  pacote: Plano | null;
  produtos: Produto[];
  sistemas: Sistema[];
  sistemaInicial?: string;
  /** Licenças que já usam o pacote (o sistema não muda depois disso). */
  emUso: number;
  org: string;
  aoFechar: () => void;
  aoSalvar: (msg: string) => void;
}) {
  const vendaveis = sistemas.filter((s) => s.situacao !== "desligado" || s.slug === pacote?.sistema);
  const [f, setF] = useState({
    nome: pacote?.nome ?? "",
    descricao: pacote?.descricao ?? "",
    sistema: pacote?.sistema ?? sistemaInicial ?? vendaveis[0]?.slug ?? "",
    produtos: pacote?.produtos ?? ([] as string[]),
    temLimite: pacote ? pacote.usuarios_incluidos != null : true,
    usuarios: pacote?.usuarios_incluidos != null ? String(pacote.usuarios_incluidos) : "5",
    preco: pacote ? valorParaCampo(pacote.preco) : "",
    adicional: pacote ? valorParaCampo(pacote.valor_usuario_adicional) : "",
    excedente: (pacote?.excedente ?? "cobrar") as Excedente,
    ativo: pacote?.ativo ?? true,
    exemplo: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const modulos = modulosParaPacote(produtos, f.sistema, f.produtos);
  const marcados = modulos.filter((p) => f.produtos.includes(p.id));
  const usuarios = f.temLimite ? Number(f.usuarios) : null;
  const preco = valorOuZero(f.preco);
  const adicional = valorOuZero(f.adicional);
  const exemplo = f.exemplo.trim() ? Number(f.exemplo) : (usuarios ?? 5) + 2;
  const resumo = resumoPacote(
    {
      precosModulos: marcados.map((p) => p.preco),
      preco,
      usuarios_incluidos: usuarios,
      valor_usuario_adicional: adicional,
      excedente: f.excedente,
    },
    Number.isInteger(exemplo) && exemplo > 0 ? exemplo : 1,
  );
  const travaSistema = !!pacote && emUso > 0;

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!f.nome.trim()) return setErro("Dê um nome ao pacote.");
    if (!f.sistema) return setErro("Escolha o sistema do pacote.");
    if (!marcados.length) return setErro("Marque ao menos um módulo.");
    if (f.temLimite && !(Number.isInteger(usuarios) && (usuarios ?? 0) >= 1))
      return setErro("Usuários incluídos: um número inteiro de 1 para cima (ou marque Sem limite).");
    if (Number.isNaN(preco) || preco < 0) return setErro("Preço do pacote inválido.");
    if (Number.isNaN(adicional) || adicional < 0) return setErro("Valor do usuário a mais inválido.");
    setSalvando(true);
    setErro("");
    try {
      await salvarPlano({
        id: pacote?.id,
        org,
        nome: f.nome,
        descricao: f.descricao,
        preco,
        ativo: f.ativo,
        produtos: marcados.map((p) => p.id),
        sistema: f.sistema,
        usuarios_incluidos: usuarios,
        valor_usuario_adicional: adicional,
        excedente: f.excedente,
      });
      aoSalvar(
        pacote
          ? "Pacote atualizado. As licenças já fechadas continuam como foram combinadas."
          : "Pacote criado. Ele já aparece ao cadastrar uma licença.",
      );
    } catch (er) {
      setErro(traduzirErro(er));
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={pacote ? `Editar pacote · ${pacote.nome}` : "Montar pacote de licença"}
      aoFechar={aoFechar}
      largura="5xl"
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <>
          <button type="submit" form="form-pacote" className="btn-primario" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar pacote"}
          </button>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" /> Voltar
          </button>
        </>
      }
    >
      <form id="form-pacote" onSubmit={salvar} className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo sm:col-span-2">
              <span>Nome do pacote</span>
              <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: EXato Diárias" required />
            </label>
            <label className="campo sm:col-span-2">
              <span>Descrição (aparece para quem vende)</span>
              <input value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} placeholder="Para quem é este pacote" />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Sistema</legend>
            <div className="flex flex-wrap gap-2">
              {vendaveis.map((s) => {
                const sel = f.sistema === s.slug;
                return (
                  <button
                    key={s.slug}
                    type="button"
                    disabled={travaSistema && !sel}
                    onClick={() => mudar({ sistema: s.slug, produtos: [] })}
                    className={`btn !min-h-9 ${sel ? "!border-[var(--marca)] !bg-[var(--marca)] !text-white" : ""}`}
                    aria-pressed={sel}
                  >
                    {sel && <Icone nome="check" className="h-4 w-4" />} {s.nome}
                  </button>
                );
              })}
            </div>
            {travaSistema && (
              <p className="text-xs text-neutral-600">
                O pacote já está em {emUso} licença(s): o sistema não muda. Para outro sistema, monte outro pacote.
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="flex w-full items-center justify-between text-sm font-medium">
              <span>
                Módulos do pacote ({marcados.length} de {modulos.length})
              </span>
              {modulos.length > 0 && (
                <button
                  type="button"
                  className="btn !min-h-8 !px-2 text-xs"
                  onClick={() => mudar({ produtos: marcados.length === modulos.length ? [] : modulos.map((p) => p.id) })}
                >
                  <Icone nome={marcados.length === modulos.length ? "cancelar" : "check"} className="h-3.5 w-3.5" />
                  {marcados.length === modulos.length ? "Desmarcar todos" : "Marcar todos"}
                </button>
              )}
            </legend>
            {!modulos.length ? (
              <p className="cartao p-3 text-sm text-neutral-600">
                Este sistema ainda não tem módulos. Cadastre-os em Sistemas › Sistemas e produtos.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {modulos.map((p) => {
                  const sel = f.produtos.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`cartao flex cursor-pointer items-start gap-2 p-2.5 text-sm ${sel ? "ring-2 ring-[var(--marca)]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={sel}
                        onChange={(e) =>
                          mudar({ produtos: e.target.checked ? [...f.produtos, p.id] : f.produtos.filter((x) => x !== p.id) })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{p.nome}</span>
                        <span className="block text-xs text-neutral-500">
                          {brl(p.preco)} avulso{!p.ativo ? " · fora de venda" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>

        <div className="space-y-4">
          <fieldset className="cartao space-y-3 p-3">
            <legend className="px-1 text-sm font-medium">Usuários</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>Usuários incluídos no preço</span>
                <input
                  inputMode="numeric"
                  value={f.temLimite ? f.usuarios : ""}
                  disabled={!f.temLimite}
                  onChange={(e) => mudar({ usuarios: e.target.value.replace(/\D/g, "") })}
                  placeholder={f.temLimite ? "Ex.: 3" : "Sem limite"}
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={!f.temLimite} onChange={(e) => mudar({ temLimite: !e.target.checked })} /> Sem limite de
                usuários
              </label>
            </div>
            {f.temLimite && (
              <>
                <label className="campo">
                  <span>Valor de cada usuário a mais, por mês (R$)</span>
                  <input
                    inputMode="decimal"
                    value={f.adicional}
                    onChange={(e) => mudar({ adicional: e.target.value })}
                    placeholder="0,00"
                  />
                </label>
                <fieldset className="space-y-1">
                  <legend className="text-sm text-neutral-700">Quando passar do limite</legend>
                  {(
                    [
                      ["cobrar", "Libera e cobra no mês seguinte", "Ninguém fica travado; o usuário a mais entra na cobrança."],
                      ["bloquear", "Bloqueia", "O sistema não deixa ativar a pessoa além do limite."],
                    ] as const
                  ).map(([v, t, d]) => (
                    <label
                      key={v}
                      className={`cartao flex cursor-pointer items-start gap-2 p-2.5 text-sm ${f.excedente === v ? "ring-2 ring-[var(--marca)]" : ""}`}
                    >
                      <input
                        type="radio"
                        name="excedente"
                        className="mt-0.5"
                        checked={f.excedente === v}
                        onChange={() => mudar({ excedente: v })}
                      />
                      <span>
                        <span className="block font-medium">{t}</span>
                        <span className="block text-xs text-neutral-500">{d}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
          </fieldset>

          <fieldset className="cartao space-y-3 p-3">
            <legend className="px-1 text-sm font-medium">Preço</legend>
            <label className="campo">
              <span>Preço do pacote por mês (R$)</span>
              <input
                inputMode="decimal"
                value={f.preco}
                onChange={(e) => mudar({ preco: e.target.value })}
                placeholder={valorParaCampo(resumo.avulsos)}
              />
            </label>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Os módulos avulsos somariam</dt>
                <dd className="font-semibold tabular-nums">{brl(resumo.avulsos)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Desconto do pacote</dt>
                <dd className="font-semibold tabular-nums">{resumo.desconto > 0 ? `${resumo.desconto.toLocaleString("pt-BR")}%` : "—"}</dd>
              </div>
            </dl>
          </fieldset>

          <div className="cartao space-y-2 bg-[var(--fundo)] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Icone nome="moeda" className="h-4 w-4 text-[var(--marca)]" />
              <span className="font-medium">Exemplo: cliente com</span>
              <input
                inputMode="numeric"
                aria-label="Usuários do exemplo"
                className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-right"
                value={f.exemplo}
                onChange={(e) => mudar({ exemplo: e.target.value.replace(/\D/g, "") })}
                placeholder={String(exemplo)}
              />
              <span>usuários</span>
            </div>
            <p>
              Mensalidade: <strong className="tabular-nums">{brl(resumo.mensalidade)}</strong>
              {resumo.adicionais > 0 && f.excedente === "cobrar" && ` (pacote + ${resumo.adicionais} usuário(s) a mais)`}
            </p>
            {resumo.bloqueia && (
              <p className="text-amber-800">
                Com &ldquo;Bloqueia&rdquo;, só {usuarios} pessoa(s) conseguem acesso; as outras ficam barradas.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} /> À venda (aparece ao cadastrar
            licença)
          </label>
        </div>
      </form>
    </Modal>
  );
}
