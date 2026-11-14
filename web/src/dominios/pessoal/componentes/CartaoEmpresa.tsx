// Cartão "Você tem empresa?" do MDC · Pessoal (077): o responsável pela família informa o CNPJ (a razão social vem
// da Receita), confere e-mail e telefone e, se quiser, autoriza a MDC a entrar em contato. A caixa vem desmarcada e o
// texto da autorização é o do banco (versão gravada junto). "Agora não" esconde o cartão por 90 dias.
// Também é usado na tela Família (modo "aberto") para indicar outra empresa.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { Icone } from "@/components/ui/Icone";
import { CampoCnpj } from "@/components/ui/CampoCnpj";
import type { DadosCnpj } from "@/lib/consultaCnpj";
import { mascaraTelefone, receitaParaContato, telefoneValido, TEXTO_DEPOIS } from "../contatoEmpresa";
import type { SituacaoContato } from "../contatoEmpresa";

export interface SituacaoEmpresa {
  responsavel: boolean;
  mostrar_cartao: boolean;
  pode_mais: boolean;
  termo: { versao: number; texto: string };
  empresas: { id: string; cnpj: string; razao_social: string; autorizado_em: string }[];
}

/** Lê o que o cartão precisa (termo em vigor, empresas já indicadas). */
export function useSituacaoEmpresa() {
  const { org, pessoal } = useOrg();
  return useConsulta(
    useCallback(async () => {
      if (!pessoal) return null;
      const { data, error } = await supabase().rpc("pessoal_empresa_situacao", { p_org: org.id });
      if (error) throw error;
      return data as unknown as SituacaoEmpresa;
    }, [org.id, pessoal]),
  );
}

/** No Início: aparece só para o responsável, sem empresa indicada e sem "Agora não" recente. */
export function CartaoEmpresaInicio() {
  const s = useSituacaoEmpresa();
  if (!s.dados?.mostrar_cartao) return null;
  return <CartaoEmpresa situacao={s.dados} aoTerminar={s.recarregar} />;
}

export function CartaoEmpresa({
  situacao,
  aoTerminar,
  aoVoltar,
  principal = true,
}: {
  situacao: SituacaoEmpresa;
  /** false quando a tela já tem a sua ação principal (o botão vira azul). */
  principal?: boolean;
  aoTerminar: () => void;
  /** Na tela Família o "Voltar" só fecha; no Início é o "Agora não" (90 dias). */
  aoVoltar?: () => void;
}) {
  const { org, eu } = useOrg();
  const [cnpj, setCnpj] = useState("");
  const [dados, setDados] = useState<DadosCnpj | null>(null);
  const [email, setEmail] = useState(eu.email ?? "");
  const [telefone, setTelefone] = useState("");
  const [autorizo, setAutorizo] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<SituacaoContato | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!dados) return setErro("Digite o CNPJ e toque em Buscar dados para trazer a razão social");
    if (!telefoneValido(telefone)) return setErro("Confira o telefone (com DDD)");
    if (!autorizo) return setErro("Para a MDC entrar em contato, marque a autorização");
    setOcupado(true);
    try {
      const { data, error } = await supabase().rpc("pessoal_quero_contato", {
        p_org: org.id,
        p: {
          cnpj,
          razao_social: dados.razaoSocial,
          email: email.trim(),
          telefone,
          autorizo: true,
          termo_versao: situacao.termo.versao,
          receita: receitaParaContato(dados),
        },
      });
      if (error) throw error;
      setFeito(data as SituacaoContato);
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setOcupado(false);
    }
  }

  async function agoraNao() {
    if (aoVoltar) return aoVoltar();
    await supabase().rpc("pessoal_empresa_adiar", { p_org: org.id });
    aoTerminar();
  }

  if (feito) {
    return (
      <section className="cartao flex flex-wrap items-center gap-3 p-4" role="status">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icone nome="check" className="h-5 w-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-neutral-700">{TEXTO_DEPOIS[feito]}</p>
        <button className="btn" onClick={aoTerminar}>
          <Icone nome="check" className="h-4 w-4" />
          Entendi
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="cartao space-y-4 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--fundo)] text-[var(--marca)]">
          <Icone nome="pasta" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[var(--marca)]">Você tem empresa?</b>
          <span className="text-sm text-neutral-600">
            A MDC cuida da contabilidade de empresas da região. Se quiser, deixe o CNPJ e a gente entra em contato. É opcional e não muda
            nada no seu app.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <CampoCnpj
            valor={cnpj}
            aoMudar={(v) => {
              setCnpj(v);
              setDados(null);
            }}
            aoCarregar={setDados}
            obrigatorio
            ajuda="Digite o CNPJ e toque em Buscar dados: a razão social vem da Receita."
          />
          {dados && (
            <p className="mt-1 text-sm text-[var(--marca)]">
              <b>{dados.razaoSocial}</b>
              {dados.municipio ? ` · ${dados.municipio}/${dados.uf ?? ""}` : ""}
            </p>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="campo">
            <span>E-mail para contato</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={160} />
          </label>
          <label className="campo">
            <span>Telefone (se quiser)</span>
            <input
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              placeholder="(11) 98888-7777"
            />
          </label>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed border-[var(--borda)] p-3 text-sm text-neutral-700">
        <input type="checkbox" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
        <span>{situacao.termo.texto}</span>
      </label>

      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="submit" className={principal ? "btn-primario" : "btn"} disabled={ocupado}>
          <Icone nome="enviar" className="h-4 w-4" />
          {ocupado ? "Enviando…" : "Quero contato"}
        </button>
        <button type="button" className="btn" onClick={() => void agoraNao()} disabled={ocupado}>
          <Icone nome="voltar" className="h-4 w-4" />
          {aoVoltar ? "Voltar" : "Agora não"}
        </button>
      </div>
    </form>
  );
}
