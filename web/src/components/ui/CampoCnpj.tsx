// Campo de CNPJ com o botão "Buscar dados": consulta a Receita (BrasilAPI) e entrega os dados para a tela preencher
// razão social, UF, endereço etc. A pessoa continua podendo editar tudo à mão depois.
"use client";

import { useId, useState } from "react";
import { Icone } from "./Icone";
import { consultarCnpj } from "@/lib/consultaCnpj";
import type { DadosCnpj } from "@/lib/consultaCnpj";
import { cnpjValido, formatarDocumento } from "@/lib/documento";

export function CampoCnpj({
  rotulo = "CNPJ",
  valor,
  aoMudar,
  aoCarregar,
  obrigatorio = false,
}: {
  rotulo?: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** Recebe os dados da Receita; a tela decide o que preencher. */
  aoCarregar: (d: DadosCnpj) => void;
  obrigatorio?: boolean;
}) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valido = cnpjValido(valor);
  const id = useId();

  async function buscar() {
    setErro(null);
    setBuscando(true);
    try {
      const d = await consultarCnpj(valor);
      aoMudar(d.cnpj || formatarDocumento(valor));
      aoCarregar(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível consultar o CNPJ agora.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <div className="flex gap-2">
        <input
          id={id}
          className="min-w-0 flex-1"
          value={valor}
          required={obrigatorio}
          onChange={(e) => {
            aoMudar(e.target.value);
            setErro(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valido) {
              e.preventDefault();
              void buscar();
            }
          }}
          onBlur={() => valido && aoMudar(formatarDocumento(valor))}
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
          aria-describedby={`${id}-ajuda`}
        />
        <button
          type="button"
          className="btn shrink-0"
          onClick={buscar}
          disabled={!valido || buscando}
          title={valido ? "Buscar razão social, endereço e sócios na Receita Federal" : "Digite os 14 números do CNPJ"}
        >
          <Icone nome={buscando ? "atualizar" : "busca"} className={`h-4 w-4 ${buscando ? "animate-spin" : ""}`} />
          {buscando ? "Buscando…" : "Buscar dados"}
        </button>
      </div>
      <small
        id={`${id}-ajuda`}
        className={`text-xs ${erro ? "text-red-700" : "text-[var(--texto-suave)]"}`}
        role={erro ? "alert" : undefined}
      >
        {erro ?? "Digite o CNPJ e clique em Buscar dados para trazer razão social, endereço e sócios da Receita."}
      </small>
    </div>
  );
}

/** Quadro com o que veio da Receita (situação, endereço, CNAE, sócios), para conferir antes de salvar. */
export function ResumoCnpj({ d, acao }: { d: DadosCnpj; acao?: React.ReactNode }) {
  const inativa = d.situacao && d.situacao.toUpperCase() !== "ATIVA";
  return (
    <div className="rounded-lg border border-[var(--borda)] bg-[var(--fundo)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[var(--marca)]">{d.razaoSocial}</b>
        {d.situacao && (
          <span className={`chip ${inativa ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>Situação: {d.situacao}</span>
        )}
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {d.nomeFantasia && <Linha t="Nome fantasia" v={d.nomeFantasia} />}
        {d.endereco && (
          <Linha t="Endereço" v={`${d.endereco}${d.municipio ? ` – ${d.municipio}/${d.uf ?? ""}` : ""}${d.cep ? ` – CEP ${d.cep}` : ""}`} />
        )}
        {d.cnae && <Linha t="Atividade principal" v={d.cnae} />}
        {d.capitalSocial !== null && (
          <Linha t="Capital social" v={d.capitalSocial.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        )}
        {d.socios.length > 0 && (
          <Linha t="Sócios" v={d.socios.map((s) => (s.qualificacao ? `${s.nome} (${s.qualificacao})` : s.nome)).join("; ")} />
        )}
      </dl>
      {inativa && <p className="mt-2 text-xs text-red-800">Atenção: a empresa não está ativa na Receita.</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

function Linha({ t, v }: { t: string; v: string }) {
  return (
    <>
      <dt className="text-[var(--texto-suave)]">{t}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}
