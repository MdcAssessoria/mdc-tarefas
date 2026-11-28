// Acesso direto aos módulos do Ledgra (127): dentro da janela da chave, cria a conta própria do cliente no Ledgra
// (sem o Ledgra ERP) e mostra UMA vez a senha provisória do responsável. Regras em ../acessoLedgra.ts.
"use client";

import { useState } from "react";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { lerRespostaAcesso, problemaResponsavel, textoLicencaLedgra, type RespostaAcesso } from "../acessoLedgra";

export function AcessoDiretoLedgra({ contrato, aoCriar }: { contrato: string; aoCriar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<RespostaAcesso | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function criar() {
    const p = problemaResponsavel(nome, email);
    if (p) return setErro(p);
    setOcupado(true);
    setErro("");
    try {
      const r = await chamarFuncao<unknown>("ledgra-conta", {
        corpo: { contrato, nome: nome.trim(), email: email.trim().toLowerCase() },
      });
      setFeito(lerRespostaAcesso(r));
      aoCriar?.();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado(false);
  }

  async function copiar(f: RespostaAcesso) {
    const texto = [`Endereço: ${f.entrada}`, `E-mail: ${f.email}`, f.senha ? `Senha provisória: ${f.senha}` : ""]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setErro("Não deu para copiar sozinho. Selecione os dados e copie.");
    }
  }

  if (feito)
    return (
      <div className="rounded-lg border-2 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-950">
        <p className="font-semibold">Acesso criado no Ledgra.</p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-emerald-800">Endereço de entrada</dt>
            <dd className="select-all break-all font-mono">{feito.entrada}</dd>
          </div>
          <div>
            <dt className="text-emerald-800">E-mail</dt>
            <dd className="select-all break-all font-mono">{feito.email}</dd>
          </div>
          {feito.senha && (
            <div className="sm:col-span-2">
              <dt className="text-emerald-800">Senha provisória (copie agora: ela não aparece de novo)</dt>
              <dd className="select-all rounded-md bg-white p-2 font-mono text-base font-bold tracking-wide">{feito.senha}</dd>
            </div>
          )}
        </dl>
        {!feito.senha && (
          <p className="mt-2">Este e-mail já tinha conta no Ledgra: ele entra com a senha que já usa e vê os módulos novos.</p>
        )}
        {feito.senha && <p className="mt-2">No primeiro acesso o Ledgra pede para o responsável criar a senha dele.</p>}
        <p className="mt-1">{textoLicencaLedgra(feito.licenca)}</p>
        <button className="btn mt-2" onClick={() => copiar(feito)}>
          <Icone nome={copiado ? "check" : "copiar"} />
          {copiado ? "Copiado" : "Copiar dados de acesso"}
        </button>
      </div>
    );

  if (!aberto)
    return (
      <div className="rounded-lg border border-neutral-200 p-3 text-sm">
        <p className="font-semibold">Acesso direto aos módulos</p>
        <p className="mt-1 text-neutral-700">
          Para cliente que comprou só módulos avulsos (XML, Cofre, Auditor, Legislação, Raio-X, Entrega, Integrações, Varredura): cria a
          conta dele no Ledgra, sem o Ledgra ERP, e já liga a chave.
        </p>
        <button className="btn mt-2" onClick={() => setAberto(true)}>
          <Icone nome="pessoas" />
          Criar acesso no Ledgra
        </button>
      </div>
    );

  return (
    <div className="rounded-lg border border-neutral-200 p-3 text-sm">
      <p className="font-semibold">Responsável pelo acesso no cliente</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required maxLength={120} />
        </label>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
        </label>
      </div>
      <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-900">
        Uma chave nova do Ledgra é gerada agora e a anterior deste cliente deixa de valer.
      </p>
      {erro && <p className="mt-2 rounded-md bg-red-50 p-2 text-red-800">{erro}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primario" onClick={criar} disabled={ocupado}>
          <Icone nome="check" />
          {ocupado ? "Criando…" : "Criar acesso"}
        </button>
        <button className="btn" onClick={() => setAberto(false)} disabled={ocupado}>
          <Icone nome="voltar" />
          Voltar
        </button>
      </div>
    </div>
  );
}
