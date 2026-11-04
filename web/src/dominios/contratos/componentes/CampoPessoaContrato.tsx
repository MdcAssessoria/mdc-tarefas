// Campo "Cliente" (ou "Fornecedor") do Novo contrato: busca enquanto digita na carteira da MDC (contrato a receber) e
// em Fornecedores e clientes, mostra a lista ao clicar no campo e oferece "+ Cadastrar novo", com o CNPJ buscado na
// Receita (CampoCnpj). Escolhido, vira um cartão com nome e CNPJ e o botão Trocar. Quem vem da carteira ou da Receita
// leva junto CNPJ, e-mail, telefone, cidade e UF: o banco cadastra a pessoa com esses dados ao salvar (migração 055).
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CampoCnpj, ResumoCnpj } from "@/components/ui/CampoCnpj";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import type { Cliente } from "@/dominios/clientes/tipos";
import { nomeCliente } from "@/dominios/clientes/nome";
import { combinaBusca } from "@/dominios/financeiro/estoqueRegras";
import type { DadosCnpj } from "@/lib/consultaCnpj";
import { documentoValido, formatarDocumento, soDigitos } from "@/lib/documento";

const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");

/** Dados que o banco grava (ou completa) na pessoa do contrato. */
export interface DadosPessoa {
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

export interface PessoaEscolhida {
  nome: string;
  dados?: DadosPessoa;
  /** Cliente da carteira escolhido (para o Portal e o tomador da nota). */
  carteira?: string;
  origem: "financeiro" | "carteira" | "novo";
}

type Opcao =
  | { tipo: "pessoa"; id: string; nome: string; detalhe: string }
  | { tipo: "carteira"; id: string; nome: string; detalhe: string; c: Cliente };

export function CampoPessoaContrato({
  rotulo,
  receber,
  escolhida,
  pessoas,
  carteira,
  aoEscolher,
}: {
  rotulo: string;
  receber: boolean;
  escolhida: PessoaEscolhida | null;
  pessoas: { id: string; nome: string; tipo: string; ativo: boolean }[];
  carteira: Cliente[];
  aoEscolher: (p: PessoaEscolhida | null) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [novo, setNovo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  // fecha a lista ao tocar/clicar fora (no celular o "blur" do campo chega antes do toque na opção)
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  const opcoes = useMemo<Opcao[]>(() => {
    const nomesPessoa = new Set(pessoas.map((p) => p.nome.toLowerCase()));
    const daCarteira: Opcao[] = receber
      ? carteira
          .filter((c) => !nomesPessoa.has(c.razao_social.toLowerCase()))
          .map((c) => ({
            tipo: "carteira",
            id: c.id,
            nome: nomeCliente(c),
            detalhe: ["Carteira MDC", c.cnpj && formatarDocumento(c.cnpj), c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ""}`]
              .filter(Boolean)
              .join(" · "),
            c,
          }))
      : [];
    const doFinanceiro: Opcao[] = pessoas.map((p) => ({ tipo: "pessoa", id: p.id, nome: p.nome, detalhe: "Fornecedores e clientes" }));
    const todas = [...doFinanceiro, ...daCarteira];
    const filtradas = q.trim()
      ? todas.filter((o) =>
          combinaBusca([o.nome, o.tipo === "carteira" ? `${o.c.razao_social} ${soDigitos(o.c.cnpj)}` : ""], q.replace(/[./-]/g, "")),
        )
      : todas;
    return filtradas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 30);
  }, [pessoas, carteira, receber, q]);

  function escolher(o: Opcao) {
    if (o.tipo === "pessoa") aoEscolher({ nome: o.nome, origem: "financeiro" });
    else
      aoEscolher({
        nome: o.c.razao_social,
        carteira: o.c.id,
        origem: "carteira",
        dados: { documento: soDigitos(o.c.cnpj) || null, cidade: o.c.cidade ?? null, uf: o.c.uf ?? null },
      });
    setQ("");
    setAberto(false);
  }

  if (escolhida) {
    const doc = escolhida.dados?.documento;
    return (
      <div className="campo">
        <span>{rotulo}</span>
        <div className="flex items-center gap-3 rounded-md border border-[var(--borda)] bg-[var(--fundo)] px-3 py-2">
          <Icone nome="pessoas" className="h-4 w-4 shrink-0 text-[var(--texto-suave)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{escolhida.nome}</span>
            <span className="block text-xs text-[var(--texto-suave)]">
              {[
                doc && formatarDocumento(doc),
                escolhida.origem === "carteira"
                  ? "Carteira MDC"
                  : escolhida.origem === "novo"
                    ? "Novo: cadastrado ao salvar"
                    : "Já cadastrado",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <button type="button" className="btn !min-h-8 !px-3" onClick={() => aoEscolher(null)}>
            Trocar
          </button>
        </div>
      </div>
    );
  }

  const total = opcoes.length + 1; // + "Cadastrar novo"
  return (
    <div className="relative" ref={caixa}>
      <label className="campo">
        <span>{rotulo}</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={id}
          aria-autocomplete="list"
          value={q}
          placeholder={receber ? "Clique e escolha, ou digite nome ou CNPJ" : "Clique e escolha, ou digite o nome"}
          onFocus={() => setAberto(true)}
          onClick={() => setAberto(true)}
          onBlur={(e) => {
            if (!caixa.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setAberto(true);
            setAtivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setAtivo((a) => Math.min(a + 1, total - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (ativo < opcoes.length) escolher(opcoes[ativo]);
              else {
                setAberto(false);
                setNovo(true);
              }
            } else if (e.key === "Escape" && aberto) {
              e.stopPropagation();
              setAberto(false);
            }
          }}
        />
      </label>
      {aberto && (
        <ul id={id} role="listbox" className="cartao absolute z-30 mt-1 max-h-72 w-full overflow-auto p-1 shadow-lg">
          {opcoes.map((o, k) => (
            <li key={`${o.tipo}-${o.id}`} role="option" aria-selected={k === ativo}>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(k)}
                onClick={() => escolher(o)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${k === ativo ? "bg-amber-50" : ""}`}
              >
                <span className="block truncate font-medium">{o.nome}</span>
                <span className="block text-xs text-[var(--texto-suave)]">{o.detalhe}</span>
              </button>
            </li>
          ))}
          {!opcoes.length && (
            <li className="px-3 py-2 text-sm text-[var(--texto-suave)]">
              {q.trim() ? "Ninguém com esse nome ou CNPJ." : "Nenhum cadastro ainda."}
            </li>
          )}
          <li role="option" aria-selected={ativo === opcoes.length}>
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(opcoes.length)}
              onClick={() => {
                setAberto(false);
                setNovo(true);
              }}
              className={`flex w-full items-center gap-2 rounded-md border-t border-[var(--borda)] px-3 py-2 text-left text-sm font-medium text-[var(--marca)] ${
                ativo === opcoes.length ? "bg-amber-50" : ""
              }`}
            >
              <Icone nome="mais" className="h-4 w-4" />
              Cadastrar novo {receber ? "cliente" : "fornecedor"} (busca o CNPJ na Receita)
            </button>
          </li>
        </ul>
      )}
      {novo && (
        <NovaPessoaContrato
          receber={receber}
          nomeInicial={/\d{5}/.test(q) ? "" : q.trim()}
          documentoInicial={/\d{5}/.test(q) ? q.trim() : ""}
          aoFechar={() => setNovo(false)}
          aoConfirmar={(p) => {
            setNovo(false);
            setQ("");
            aoEscolher(p);
          }}
        />
      )}
    </div>
  );
}

/** Janela curta de cadastro: CNPJ com "Buscar dados" (Receita), nome, e-mail, telefone, cidade e UF. */
function NovaPessoaContrato({
  receber,
  nomeInicial,
  documentoInicial,
  aoFechar,
  aoConfirmar,
}: {
  receber: boolean;
  nomeInicial: string;
  documentoInicial: string;
  aoFechar: () => void;
  aoConfirmar: (p: PessoaEscolhida) => void;
}) {
  const [doc, setDoc] = useState(documentoInicial);
  const [nome, setNome] = useState(nomeInicial);
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [receita, setReceita] = useState<DadosCnpj | null>(null);
  const [erro, setErro] = useState("");
  const quem = receber ? "cliente" : "fornecedor";

  function confirmar() {
    const d = soDigitos(doc);
    if (!nome.trim()) return setErro(`Informe o nome ou a razão social do ${quem}.`);
    if (d && !documentoValido(d)) return setErro("O CPF/CNPJ não confere. Verifique os números digitados.");
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setErro("O e-mail não parece certo (ex.: nome@empresa.com.br).");
    aoConfirmar({
      nome: nome.trim(),
      origem: "novo",
      dados: {
        documento: d || null,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf || null,
      },
    });
  }

  return (
    <Modal
      titulo={`Novo ${quem}`}
      descricao={`Digite o CNPJ e clique em Buscar dados: o HUB traz da Receita. O ${quem} é cadastrado em Fornecedores e clientes quando você salvar o contrato.`}
      aoFechar={aoFechar}
      largura="2xl"
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
          <button className="btn-primario" onClick={confirmar}>
            Usar este {quem}
          </button>
        </>
      }
    >
      <CampoCnpj
        rotulo="CPF ou CNPJ"
        valor={doc}
        aoMudar={setDoc}
        placeholder="CPF ou CNPJ"
        ajuda={
          receber
            ? "Com CNPJ, clique em Buscar dados. Para emitir nota fiscal, o CNPJ (ou CPF), a cidade e o e-mail ajudam."
            : "Com CNPJ, clique em Buscar dados para trazer nome e cidade da Receita."
        }
        aoCarregar={(r) => {
          setReceita(r);
          setNome(r.razaoSocial || nome);
          if (r.municipio) setCidade(r.municipio);
          if (r.uf) setUf(r.uf);
          if (!telefone.trim() && r.telefone) setTelefone(r.telefone);
          if (!email.trim() && r.email) setEmail(r.email.toLowerCase());
        }}
      />
      {receita && <ResumoCnpj d={receita} />}
      <label className="campo">
        <span>Nome ou razão social</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>E-mail {receber ? "(recebe a fatura)" : ""}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Telefone</span>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="campo sm:col-span-2">
          <span>Cidade</span>
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </label>
        <label className="campo">
          <span>UF</span>
          <select value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
