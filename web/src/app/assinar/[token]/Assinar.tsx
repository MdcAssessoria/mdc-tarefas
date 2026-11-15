// Tela pública de assinatura pelo link: carrega o contrato pelo código do link, mostra o texto e o formulário de
// assinatura; depois de assinado, oferece o PDF com o registro da assinatura. Mensagens simples para cada situação.
"use client";

import { useCallback, useState } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";
import { fmtDataHora } from "@/lib/formato/datas";
import { LINHA_EMPRESA, IDENTIDADE_MDC } from "@/lib/identidade";
import { Icone } from "@/components/ui/Icone";
import { Carregando } from "@/components/ui/Carregando";
import { TextoContrato } from "@/dominios/licencas/componentes/TextoContrato";
import { abrirParaAssinar, assinarPeloLink, baixarContratoLicenca, type ContratoParaAssinar } from "@/dominios/licencas/documentos";

const mascaraCpf = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const AVISOS: Record<string, { titulo: string; texto: string }> = {
  invalido: { titulo: "Link não encontrado", texto: "Este link não existe ou foi trocado por um mais novo. Peça o link atualizado à MDC." },
  expirado: { titulo: "O link venceu", texto: "O prazo de 15 dias deste link acabou. Peça um link novo à MDC." },
  travado: { titulo: "Link travado", texto: "Houve muitas tentativas com CPF diferente do indicado. Peça um link novo à MDC." },
  cancelado: { titulo: "Contrato cancelado", texto: "Este contrato foi cancelado pela MDC e não precisa mais ser assinado." },
  emitido: { titulo: "Link não encontrado", texto: "Peça o link atualizado à MDC." },
};

export function Assinar({ token }: { token: string }) {
  const consulta = useConsulta(useCallback(() => abrirParaAssinar(token), [token]));
  const c = consulta.dados;
  return (
    <div className="min-h-screen bg-[#F6F4EE]">
      <header className="bg-[var(--marca)] px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <img src={caminho("/logo-mdc-dourado.png")} alt="MDC" className="h-9 w-auto" />
          <span className="border-l border-[var(--destaque)]/40 pl-3 font-display text-xl text-white">Assinatura de contrato</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        {consulta.erro ? (
          <Caixa titulo="Não consegui abrir o contrato" texto={`${consulta.erro} Tente de novo em alguns minutos.`} icone="alerta" />
        ) : !c ? (
          <Carregando />
        ) : AVISOS[c.situacao] ? (
          <Caixa titulo={AVISOS[c.situacao].titulo} texto={AVISOS[c.situacao].texto} icone="alerta" />
        ) : (
          <Contrato token={token} c={c} aoAssinar={consulta.recarregar} />
        )}
        <p className="text-center text-xs text-neutral-500">
          {LINHA_EMPRESA} · {IDENTIDADE_MDC.telefone}
        </p>
      </main>
    </div>
  );
}

function Caixa({ titulo, texto, icone }: { titulo: string; texto: string; icone: "alerta" | "check" }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--borda)] bg-white p-5">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${icone === "check" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
      >
        <Icone nome={icone} />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-[var(--marca)]">{titulo}</h1>
        <p className="text-neutral-700">{texto}</p>
      </div>
    </div>
  );
}

function Contrato({ token, c, aoAssinar }: { token: string; c: ContratoParaAssinar; aoAssinar: () => void }) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [concordo, setConcordo] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const assinado = c.situacao === "assinado";

  async function assinar(e: React.FormEvent) {
    e.preventDefault();
    if (!concordo) return setErro('Marque "Li e concordo" para assinar.');
    setErro("");
    setOcupado(true);
    try {
      const r = await assinarPeloLink(token, nome, cpf, true);
      if (!r.ok) setErro(`${r.erro ?? "Não foi possível assinar."}${r.restam != null ? ` Tentativas restantes: ${r.restam}.` : ""}`);
      else aoAssinar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado(false);
  }

  async function pdf() {
    try {
      await baixarContratoLicenca({
        texto: c.texto ?? "",
        numero: c.numero ?? "",
        cliente: { razao_social: c.cliente ?? "", cnpj: null },
        signatario: { nome: c.signatario ?? "", cpf: "", cargo: "", email: "" },
        logo: caminho("/logo-mdc-dourado.png"),
        documento: {
          numero: c.numero ?? "",
          hash: c.hash ?? "",
          assinatura: c.assinatura ?? null,
          assinado_em: c.assinado_em ?? null,
          situacao: c.situacao as "assinado",
        },
      });
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  return (
    <>
      {assinado ? (
        <Caixa
          titulo="Contrato assinado"
          texto={`O contrato ${c.numero} foi assinado${c.assinado_em ? ` em ${fmtDataHora(c.assinado_em)}` : ""}. Guarde uma cópia em PDF.`}
          icone="check"
        />
      ) : (
        <div className="rounded-2xl border border-[var(--borda)] bg-white p-5">
          <p className="text-sm text-neutral-600">Contrato nº {c.numero}</p>
          <h1 className="font-display text-2xl text-[var(--marca)]">{c.cliente}</h1>
          <p className="mt-1 text-neutral-700">
            Leia o contrato abaixo. No fim da página, {c.signatario ? <b>{c.signatario}</b> : "quem foi indicado"} confirma com o nome
            completo e o CPF (terminado em {c.cpf_final}) para assinar.
          </p>
        </div>
      )}

      <article className="rounded-2xl border border-[var(--borda)] bg-white p-5 sm:p-8">
        <TextoContrato texto={c.texto ?? ""} />
      </article>

      {assinado ? (
        <div className="flex justify-center">
          <button className="btn-primario" onClick={pdf}>
            <Icone nome="baixar" className="h-4 w-4" />
            Baixar contrato assinado (PDF)
          </button>
        </div>
      ) : (
        <form onSubmit={assinar} className="space-y-3 rounded-2xl border border-[var(--borda)] bg-white p-5 sm:p-8">
          <h2 className="text-lg font-semibold text-[var(--marca)]">Assinar</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="campo">
              <span>Nome completo</span>
              <input required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
            </label>
            <label className="campo">
              <span>CPF</span>
              <input
                required
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                placeholder="000.000.000-00"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} />
            <span>
              Li e concordo com este contrato e aceito assiná-lo em meio eletrônico. Sei que ficam registrados o meu nome, CPF, a data e a
              hora, o endereço IP e o navegador, junto com o código de integridade do texto.
            </span>
          </label>
          {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
          <button type="submit" className="btn-primario w-full sm:w-auto" disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" />
            {ocupado ? "Assinando…" : "Assinar contrato"}
          </button>
          <p className="break-all text-xs text-neutral-500">Código de integridade do texto (SHA-256): {c.hash}</p>
        </form>
      )}
    </>
  );
}
