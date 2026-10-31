"use client";

import Link from "next/link";
import { useAgora } from "@/lib/useAgora";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";
import { fmtDataLocal } from "@/lib/formato/datas";

export default function PaginaCertificado() {
  return (
    <AppShell modulo="demonstrativos">
      <Certificado />
    </AppShell>
  );
}

interface Cert {
  titular: string;
  documento_final: string | null;
  emissor: string | null;
  icp_brasil: boolean;
  valido_de: string | null;
  valido_ate: string | null;
  enviado_em: string;
}

function Certificado() {
  const { org, eu } = useOrg();
  const agora = useAgora();
  const [cert, setCert] = useState<Cert | null | undefined>(undefined);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase()
      .from("hub_certificados")
      .select("titular,documento_final,emissor,icp_brasil,valido_de,valido_ate,enviado_em")
      .eq("org_id", org.id)
      .maybeSingle();
    setCert((data as Cert) ?? null);
  }, [org.id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function chamar(metodo: "POST" | "DELETE", corpo?: FormData) {
    const { data } = await supabase().auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/certificado${metodo === "DELETE" ? `?org=${org.id}` : ""}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, apikey: SUPABASE_KEY },
      body: corpo,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro ?? "Falha ao falar com o servidor.");
    return j;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.append("org", org.id);
      fd.append("arquivo", arquivo);
      fd.append("senha", senha);
      await chamar("POST", fd);
      setSenha("");
      setArquivo(null);
      setAviso("Certificado cadastrado. Os PDFs dos meses publicados passam a sair assinados.");
      void carregar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    if (!confirm("Remover o certificado? Os PDFs voltam a sair sem assinatura digital.")) return;
    try {
      await chamar("DELETE");
      setAviso("Certificado removido.");
      void carregar();
    } catch (x) {
      setErro((x as Error).message);
    }
  }

  if (eu.papel !== "admin") return <p className="text-sm text-neutral-600">Só administradores gerenciam o certificado digital.</p>;
  const vence = cert?.valido_ate ? Math.round((Date.parse(cert.valido_ate) - agora) / 864e5) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/demonstrativos" className="text-sm text-neutral-500 hover:underline">
          ← Balancetes
        </Link>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Certificado digital para assinar os demonstrativos</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Com o certificado cadastrado, o PDF de cada mês publicado sai assinado digitalmente pelo contador responsável (ICP-Brasil, MP nº
          2.200-2/2001). O cliente baixa o arquivo já assinado no portal.
        </p>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}

      <section className="cartao p-4">
        <h2 className="font-semibold">Certificado atual</h2>
        {cert === undefined ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !cert ? (
          <p className="mt-1 text-sm text-neutral-600">Nenhum certificado cadastrado. Os PDFs saem sem assinatura digital.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1 text-sm">
            <dt className="text-neutral-500">Titular</dt>
            <dd className="font-medium">
              {cert.titular}
              {cert.documento_final && <span className="text-neutral-500"> · documento final {cert.documento_final}</span>}
            </dd>
            <dt className="text-neutral-500">Emissor</dt>
            <dd>
              {cert.emissor}{" "}
              {cert.icp_brasil ? (
                <span className="chip bg-emerald-50 text-emerald-800">ICP-Brasil</span>
              ) : (
                <span className="chip bg-amber-50 text-amber-800">fora da ICP-Brasil</span>
              )}
            </dd>
            <dt className="text-neutral-500">Validade</dt>
            <dd className={vence !== null && vence < 30 ? "font-medium text-[var(--perigo)]" : ""}>
              {fmtDataLocal(cert.valido_de)} a {fmtDataLocal(cert.valido_ate)}
              {vence !== null && (vence < 0 ? " · vencido" : ` · ${vence} dias restantes`)}
            </dd>
            <dt className="text-neutral-500">Cadastrado em</dt>
            <dd>{fmtDataLocal(cert.enviado_em)}</dd>
          </dl>
        )}
        {cert && (
          <button className="btn mt-3" onClick={remover}>
            Remover certificado
          </button>
        )}
      </section>

      <form onSubmit={enviar} className="cartao space-y-3 p-4">
        <h2 className="font-semibold">{cert ? "Substituir certificado" : "Cadastrar certificado A1"}</h2>
        <label className="campo">
          <span>Arquivo do certificado (.pfx ou .p12)</span>
          <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </label>
        <label className="campo">
          <span>Senha do certificado</span>
          <input type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-600">
          <li>Funciona só com certificado A1 (arquivo). O A3 (token ou cartão) não pode ser usado em servidor.</li>
          <li>
            O arquivo e a senha ficam criptografados no cofre do banco (Supabase Vault) e só o serviço que gera o PDF consegue lê-los.
          </li>
          <li>Só PDFs de meses publicados são assinados; rascunhos saem com a marca “Rascunho”.</li>
          <li>O Hub avisa quando faltar menos de 30 dias para o certificado vencer.</li>
        </ul>
        <button className="btn-primario" disabled={!arquivo || !senha || enviando}>
          {enviando ? "Validando…" : "Validar e guardar"}
        </button>
      </form>
    </div>
  );
}
