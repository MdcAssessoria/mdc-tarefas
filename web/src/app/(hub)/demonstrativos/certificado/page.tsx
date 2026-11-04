// Certificado digital A1 da MDC: assina os PDFs dos demonstrativos publicados. Só administrador (a Guarda confere).
"use client";

import Link from "next/link";
import { useAgora } from "@/lib/useAgora";
import { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { fmtDataLocal } from "@/lib/formato/datas";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Aviso } from "@/components/ui/Aviso";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { Chip } from "@/components/ui/Chip";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";

export default function PaginaCertificado() {
  return <Certificado />;
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
  const { org } = useOrg();
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

  const [janelaConfirmar, confirmar] = useConfirmar();
  const chamar = (metodo: "POST" | "DELETE", form?: FormData) =>
    chamarFuncao("certificado", { metodo, form, busca: metodo === "DELETE" ? { org: org.id } : undefined });

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
      setErro(traduzirErro(x));
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    const sim = await confirmar({
      titulo: "Remover o certificado?",
      descricao: "Os PDFs voltam a sair sem assinatura digital.",
      botao: "Remover",
      perigo: true,
    });
    if (!sim) return;
    try {
      await chamar("DELETE");
      setAviso("Certificado removido.");
      void carregar();
    } catch (x) {
      setErro(traduzirErro(x));
    }
  }

  const vence = cert?.valido_ate ? Math.round((Date.parse(cert.valido_ate) - agora) / 864e5) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {janelaConfirmar}
      <div className="space-y-2">
        <Link href="/demonstrativos" className="alvo-toque inline-flex items-center gap-1 text-sm text-neutral-600 hover:underline">
          <Icone nome="voltar" className="h-4 w-4" />
          Balancetes
        </Link>
        <CabecalhoPagina
          titulo="Certificado digital"
          descricao="Com o certificado A1 cadastrado, o PDF de cada mês publicado sai assinado digitalmente pelo contador (ICP-Brasil, MP nº 2.200-2/2001). O cliente baixa o arquivo já assinado no Portal."
        />
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}

      <section className="cartao p-4">
        <h2 className="flex items-center gap-2 font-semibold text-[var(--marca)]">
          <Icone nome="escudo" className="h-4 w-4" />
          Certificado atual
        </h2>
        {cert === undefined ? (
          <div className="mt-3">
            <Esqueleto indicadores={0} linhas={3} />
          </div>
        ) : !cert ? (
          <p className="mt-1 text-sm text-neutral-600">
            Nenhum certificado cadastrado. Os PDFs saem sem assinatura digital. Cadastre abaixo.
          </p>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-neutral-500">Titular</dt>
            <dd className="font-medium">
              {cert.titular}
              {cert.documento_final && <span className="text-neutral-500"> · documento final {cert.documento_final}</span>}
            </dd>
            <dt className="text-neutral-500">Emissor</dt>
            <dd>
              {cert.emissor} {cert.icp_brasil ? <Chip tom="verde">ICP-Brasil</Chip> : <Chip tom="ambar">fora da ICP-Brasil</Chip>}
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
            <Icone nome="lixeira" className="h-4 w-4" />
            Remover certificado
          </button>
        )}
      </section>

      <form onSubmit={enviar} className="cartao space-y-3 p-4">
        <h2 className="font-semibold text-[var(--marca)]">{cert ? "Substituir certificado" : "Cadastrar certificado A1"}</h2>
        <div className="campo">
          <span>Arquivo do certificado (.pfx ou .p12)</span>
          <CampoArquivo
            compacto
            accept=".pfx,.p12,application/x-pkcs12"
            titulo="Arraste o certificado A1 aqui ou clique para escolher"
            escolhido={arquivo?.name}
            aoEscolher={(a) => setArquivo(a[0] ?? null)}
          />
        </div>
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
          <Icone nome="check" className="h-4 w-4" />
          {enviando ? "Validando…" : "Validar e guardar"}
        </button>
      </form>
    </div>
  );
}
