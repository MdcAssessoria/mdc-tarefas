// Entradas › Certificado digital da empresa (A1 / e-CNPJ): situação, vencimento, envio do arquivo e da senha (ficam no
// cofre do banco, nunca voltam para a tela), remoção, e a busca automática de notas (SEFAZ e NFS-e Nacional) com os
// parâmetros da empresa. O certificado também servirá à emissão de notas (Saídas).
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { useAgora } from "@/lib/useAgora";
import { fmtDataLocal } from "@/lib/formato/datas";
import { traduzirErro } from "@/lib/erros";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Carregando } from "@/components/ui/Carregando";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { useAviso } from "@/components/ui/Aviso";
import { EscolhaCliente, useClienteFinanceiro } from "@/dominios/financeiro/componentes/EscolhaCliente";
import { formatarDocumento } from "@/dominios/financeiro/regras";
import { lerCertificado, lerControle, lerParametros } from "@/dominios/notas/leituras";
import { enviarCertificado, removerCertificado, salvarParametros } from "@/dominios/notas/repositorio";
import { quandoProximaBusca } from "@/dominios/notas/regras";
import type { ParametrosFiscais } from "@/dominios/notas/tipos";

const PADRAO: Omit<ParametrosFiscais, "cliente_id"> = {
  ambiente: "producao",
  captura_ativa: true,
  ciencia_automatica: true,
  contribuinte_icms: true,
  contribuinte_ipi: false,
};

export default function PaginaCertificadoEmpresa() {
  const { pode } = useOrg();
  const agora = useAgora();
  const financeiro = useClienteFinanceiro();
  const cliente = financeiro.cliente;
  const podeGerir = pode("financeiro", "gerir");
  const podeOperar = pode("entradas", "operar") || pode("financeiro", "operar");
  const { aviso, mostrar } = useAviso();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [editados, setEditados] = useState<Partial<ParametrosFiscais>>({});

  const consulta = useConsulta(
    useCallback(async () => {
      if (!cliente) return null;
      const [certificado, controle, parametros] = await Promise.all([
        lerCertificado(cliente.id),
        lerControle(cliente.id),
        lerParametros(cliente.id),
      ]);
      return { certificado, controle, parametros };
    }, [cliente]),
  );
  const d = consulta.dados;
  const cert = d?.certificado;
  const dias = cert ? Math.round((Date.parse(cert.valido_ate) - agora) / 864e5) : null;
  const par = { ...PADRAO, ...(d?.parametros ?? {}), ...editados };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !arquivo) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await enviarCertificado(cliente.id, arquivo, senha);
      setSenha("");
      setArquivo(null);
      mostrar(
        r.aviso ?? "Certificado guardado. A busca automática de notas começa na próxima rodada (a cada 15 minutos).",
        r.aviso ? "atencao" : "sucesso",
      );
      consulta.recarregar();
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    if (!cliente || !confirm("Remover o certificado desta empresa? A busca automática de notas para.")) return;
    try {
      await removerCertificado(cliente.id);
      mostrar("Certificado removido.");
      consulta.recarregar();
    } catch (x) {
      mostrar(traduzirErro(x), "erro");
    }
  }

  async function salvar() {
    if (!cliente) return;
    try {
      await salvarParametros(cliente.id, editados);
      setEditados({});
      mostrar("Parâmetros salvos.");
      consulta.recarregar();
    } catch (x) {
      mostrar(traduzirErro(x), "erro");
    }
  }

  const caixa = (campo: keyof Omit<ParametrosFiscais, "cliente_id" | "ambiente">, rotulo: string, dica: string) => (
    <label className="flex gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={!!par[campo]}
        disabled={!podeOperar}
        onChange={(e) => setEditados((x) => ({ ...x, [campo]: e.target.checked }))}
      />
      <span>
        <span className="block font-medium">{rotulo}</span>
        <span className="block text-xs text-neutral-600">{dica}</span>
      </span>
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Certificado digital da empresa</h1>
        <p className="text-sm text-neutral-600">
          Com o certificado A1 (e-CNPJ) da empresa, o HUB busca sozinho as notas de compra na SEFAZ e as notas de serviço na NFS-e Nacional,
          e responde à SEFAZ (manifestação). Depois ele também vai assinar as notas emitidas.
        </p>
      </div>
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <EscolhaCliente financeiro={financeiro} />
      </div>
      {aviso}
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}

      {!cliente ? (
        <EstadoVazio>Escolha a empresa acima.</EstadoVazio>
      ) : consulta.carregando && !d ? (
        <Carregando />
      ) : (
        <>
          <section className="cartao p-4">
            <h2 className="font-semibold">Situação</h2>
            {!cert ? (
              <p className="mt-1 text-sm text-neutral-600">Nenhum certificado cadastrado. As notas só entram por XML enviado.</p>
            ) : (
              <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1 text-sm">
                <dt className="text-neutral-500">Titular</dt>
                <dd className="font-medium">{cert.titular}</dd>
                <dt className="text-neutral-500">CNPJ</dt>
                <dd>{formatarDocumento(cert.cnpj)}</dd>
                <dt className="text-neutral-500">Emissor</dt>
                <dd>
                  {cert.emissor}{" "}
                  {cert.icp_brasil ? (
                    <span className="chip bg-emerald-50 text-emerald-800">ICP-Brasil</span>
                  ) : (
                    <span className="chip bg-amber-50 text-amber-800" title="A SEFAZ e o ADN só aceitam certificado ICP-Brasil">
                      fora da ICP-Brasil
                    </span>
                  )}
                </dd>
                <dt className="text-neutral-500">Vencimento</dt>
                <dd className={dias !== null && dias < 30 ? "font-medium text-[var(--perigo)]" : ""}>
                  {fmtDataLocal(cert.valido_ate)}
                  {dias !== null && (dias < 0 ? " · vencido" : ` · faltam ${dias} dias`)}
                </dd>
                <dt className="text-neutral-500">Enviado em</dt>
                <dd>{fmtDataLocal(cert.enviado_em)}</dd>
              </dl>
            )}
            {cert && podeGerir && (
              <button className="btn mt-3" onClick={remover}>
                Remover certificado
              </button>
            )}
          </section>

          {podeGerir ? (
            <form onSubmit={enviar} className="cartao space-y-3 p-4">
              <h2 className="font-semibold">{cert ? "Trocar o certificado" : "Enviar o certificado A1"}</h2>
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
                <li>
                  Só certificado A1 (arquivo) e do mesmo CNPJ da empresa (matriz ou filial). O A3 (token/cartão) não funciona em servidor.
                </li>
                <li>O arquivo e a senha ficam criptografados no cofre do banco e nunca voltam para a tela.</li>
                <li>O vencimento entra em Vencimentos, com aviso antes de vencer.</li>
              </ul>
              {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
              <button className="btn-primario" disabled={!arquivo || !senha || enviando}>
                {enviando ? "Conferindo…" : "Conferir e guardar"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-neutral-600">Só a equipe MDC (ou o próprio cliente pelo Portal) envia o certificado.</p>
          )}

          <section className="cartao space-y-3 p-4">
            <h2 className="font-semibold">Busca automática de notas</h2>
            {cert && (
              <ul className="space-y-1 text-sm">
                {(d?.controle ?? []).map((c) => (
                  <li key={c.fonte}>
                    <span className="font-medium">{c.fonte === "nfe" ? "NF-e (SEFAZ)" : "NFS-e Nacional"}:</span> {c.documentos_recebidos}{" "}
                    documento(s) recebido(s)
                    {c.ultima_consulta_em ? ` · última consulta ${fmtDataLocal(c.ultima_consulta_em)}` : " · ainda não consultou"} · próxima{" "}
                    {quandoProximaBusca(c.bloqueado_ate ?? c.proxima_consulta_em, new Date(agora))}
                    {c.ultimo_erro && <span className="block text-xs text-red-700">Último aviso: {c.ultimo_erro}</span>}
                  </li>
                ))}
              </ul>
            )}
            {caixa(
              "captura_ativa",
              "Buscar as notas sozinho",
              "A cada 15 minutos, respeitando a regra da SEFAZ (sem notas novas, só consulta de novo depois de 1 hora).",
            )}
            {caixa(
              "ciencia_automatica",
              "Dar ciência automática nas NF-e novas",
              "A SEFAZ só entrega o XML completo (com itens) depois da ciência. A ciência não confirma a compra.",
            )}
            {caixa("contribuinte_icms", "A empresa é contribuinte do ICMS", "Usado na estimativa de créditos (Carga tributária).")}
            {caixa("contribuinte_ipi", "A empresa é contribuinte do IPI (indústria)", "Usado na estimativa de créditos de IPI.")}
            <label className="campo max-w-xs">
              <span>Ambiente</span>
              <select
                value={par.ambiente}
                disabled={!podeOperar}
                onChange={(e) => setEditados((x) => ({ ...x, ambiente: e.target.value as ParametrosFiscais["ambiente"] }))}
              >
                <option value="producao">Produção (notas de verdade)</option>
                <option value="homologacao">Homologação (testes)</option>
              </select>
            </label>
            {podeOperar && (
              <button className="btn-primario" onClick={salvar} disabled={!Object.keys(editados).length}>
                Salvar parâmetros
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
