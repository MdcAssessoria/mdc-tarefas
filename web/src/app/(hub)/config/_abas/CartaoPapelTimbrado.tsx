// Cartão "Papel timbrado" (Configurações › Organização e painel, só administrador, migração 052): telefone, site,
// e-mail, Instagram e responsável técnico (nome e CRC) que saem no rodapé e na responsabilidade técnica dos documentos
// (PDF do Demonstrativo). Lê org_papel_timbrado e grava por org_papel_timbrado_salvar (auditado).
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { traduzirErro } from "@/lib/erros";
import { useMensagem } from "./useMensagem";

interface PapelTimbrado {
  telefone: string;
  site: string;
  email: string;
  instagram: string;
  responsavel: string;
  crc: string;
}
const VAZIO: PapelTimbrado = { telefone: "", site: "", email: "", instagram: "", responsavel: "", crc: "" };

export function CartaoPapelTimbrado() {
  const { org } = useOrg();
  const consulta = useConsulta(
    useCallback(async () => {
      const r = exigir(
        await supabase().from("org_papel_timbrado").select("telefone,site,email,instagram,responsavel,crc").eq("org_id", org.id).maybeSingle(),
      ) as Partial<Record<keyof PapelTimbrado, string | null>> | null;
      const f = { ...VAZIO };
      for (const k of Object.keys(VAZIO) as (keyof PapelTimbrado)[]) f[k] = r?.[k] ?? "";
      return f;
    }, [org.id]),
  );
  if (consulta.erro) return <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 lg:col-span-2">{consulta.erro}</p>;
  if (!consulta.dados) return <div className="cartao p-5 text-sm text-[var(--texto-suave)] lg:col-span-2">Carregando o papel timbrado…</div>;
  return <FormPapel key={JSON.stringify(consulta.dados)} inicial={consulta.dados} aoSalvar={consulta.recarregar} />;
}

function FormPapel({ inicial, aoSalvar }: { inicial: PapelTimbrado; aoSalvar: () => void }) {
  const { org } = useOrg();
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const { mostrar, el } = useMensagem();
  const campo = (k: keyof PapelTimbrado, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="campo">
      <span>{rotulo}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </label>
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      exigir(await supabase().rpc("org_papel_timbrado_salvar", { p_org: org.id, p: { ...f } }));
      mostrar("Papel timbrado salvo. Os próximos PDFs já saem com estes dados.");
      aoSalvar();
    } catch (x) {
      mostrar(traduzirErro(x), true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="cartao space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="font-semibold text-[var(--marca)]">Papel timbrado dos documentos</h2>
        <p className="text-sm text-[var(--texto-suave)]">
          Saem no rodapé e na responsabilidade técnica do PDF do Demonstrativo. Razão social, CNPJ e cidade vêm do cadastro da
          empresa da Gestão. Campo vazio usa o padrão da MDC.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campo("telefone", "Telefone", { inputMode: "tel", placeholder: "(11) 98888-7777" })}
        {campo("email", "E-mail", { type: "email", placeholder: "contato@suaempresa.com.br" })}
        {campo("site", "Site", { placeholder: "suaempresa.com.br" })}
        {campo("instagram", "Instagram", { placeholder: "@suaempresa" })}
        {campo("responsavel", "Responsável técnico (contador)")}
        {campo("crc", "CRC do responsável", { placeholder: "1SP000000-O/0" })}
      </div>
      <button className="btn-primario" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar papel timbrado"}
      </button>
      {el}
    </form>
  );
}
