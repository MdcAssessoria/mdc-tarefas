// Contratos › Ledgra Link (064): empresas e contas bancárias cadastradas no Ledgra Link, com o passo a passo de cada
// empresa (termo → certificado → conta → credencial) e o código de cada conta para usar em Contratos › Boleto. Só quem
// gere Contratos abre (navegacao.ts) e grava (a Função Edge confere link_pode_cadastrar). PDF e Excel das contas.
"use client";

import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO } from "@/lib/datas";
import { formatarDocumento } from "@/lib/documento";
import { fmtData } from "@/lib/formato/datas";
import { plural } from "@/lib/formato/numero";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Chip } from "@/components/ui/Chip";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { useAviso } from "@/components/ui/Aviso";
import {
  nomeAmbiente,
  passosEmpresa,
  proximoPasso,
  type CertificadoLink,
  type ContaLink,
  type IdPasso,
  type TitularLink,
} from "../ledgraLinkCadastro";
import { lerCadastrosLink } from "../ledgraLinkChamadas";
import { JanelaCertificado, JanelaConta, JanelaCredencial, JanelaEmpresa, JanelaTermo } from "./JanelasLedgraLink";

type Janela = { tipo: "empresa" } | { tipo: IdPasso; titular: TitularLink } | null;

const NOME_PRODUTO: Record<string, string> = { cobranca: "Cobrança", pix: "Pix", extrato: "Extrato", pagamentos: "Pagamentos" };

function LinhaConta({ c, aoCopiar }: { c: ContaLink; aoCopiar: (id: string) => void }) {
  const produtos = c.produtos_ativos ?? [];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--borda)] py-2 text-sm first:border-t-0">
      <Icone nome="banco" className="h-4 w-4 shrink-0 text-[var(--marca)]" />
      <span className="font-medium">{c.apelido}</span>
      <span className="text-[var(--texto-suave)]">
        {c.banco} · ag. {c.agencia} · c/c {c.conta}
        {c.conta_dv ? `-${c.conta_dv}` : ""}
      </span>
      <Chip tom={c.ambiente === "producao" ? "verde" : "azul"}>{nomeAmbiente(c.ambiente)}</Chip>
      {produtos.length ? (
        produtos.map((p) => <Chip key={p} tom="violeta">{NOME_PRODUTO[p] ?? p}</Chip>)
      ) : (
        <Chip tom="ambar">Sem credencial</Chip>
      )}
      <button type="button" className="btn ml-auto" onClick={() => aoCopiar(c.id)} title="Copia o código para colar em Contratos › Boleto">
        <Icone nome="copiar" className="h-4 w-4" />
        Copiar código
      </button>
    </li>
  );
}

function CartaoEmpresa({
  t,
  certificados,
  podeGerir,
  abrir,
  aoCopiar,
}: {
  t: TitularLink;
  certificados: CertificadoLink[];
  podeGerir: boolean;
  abrir: (j: Janela) => void;
  aoCopiar: (id: string) => void;
}) {
  const passos = passosEmpresa(t, certificados);
  const proximo = proximoPasso(passos);
  const certs = certificados.filter((c) => c.titular_id === t.id && c.status === "ativo");
  return (
    <section className="cartao space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fundo)] text-[var(--marca)]">
          <Icone nome="pessoas" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{t.razao_social}</h2>
          <p className="num text-xs text-[var(--texto-suave)]">{formatarDocumento(t.documento)}</p>
        </div>
        <span className="ml-auto">
          {proximo ? <Chip tom="ambar">Falta: {proximo.nome.toLowerCase()}</Chip> : <Chip tom="verde">Pronta para usar</Chip>}
        </span>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {passos.map((p) => {
          const bloqueado = p.id === "credencial" && !t.contas.length;
          return (
            <li key={p.id} className={`rounded-lg border p-3 ${p.feito ? "border-emerald-200 bg-emerald-50/50" : "border-[var(--borda)]"}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden="true"
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${p.feito ? "bg-emerald-600" : "bg-[var(--marca)]"}`}
                >
                  {p.feito ? <Icone nome="check" className="h-3.5 w-3.5" /> : p.numero}
                </span>
                {p.nome}
                <span className="sr-only">{p.feito ? "(feito)" : "(falta)"}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--texto-suave)]">{p.ajuda}</p>
              {podeGerir && (
                <button
                  type="button"
                  className={`btn mt-2 ${proximo?.id === p.id ? "font-semibold ring-2 ring-[var(--destaque)]" : ""}`}
                  disabled={bloqueado}
                  title={bloqueado ? "Cadastre a conta bancária primeiro" : undefined}
                  onClick={() => abrir({ tipo: p.id, titular: t })}
                >
                  <Icone nome={p.feito ? "mais" : "seta-direita"} className="h-4 w-4" />
                  {p.feito ? "Adicionar outro" : "Fazer agora"}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {certs.length > 0 && (
        <p className="flex flex-wrap gap-2 text-xs text-[var(--texto-suave)]">
          {certs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <Icone nome="escudo" className="h-3.5 w-3.5" />
              {c.apelido}: vale até {fmtData(c.valido_ate)}
              {c.situacao !== "ok" && <Chip tom={c.situacao === "vencido" ? "vermelho" : "ambar"}>{plural(c.dias_para_vencer, "dia")}</Chip>}
            </span>
          ))}
        </p>
      )}

      {t.contas.length > 0 && (
        <ul className="rounded-lg border border-[var(--borda)] px-3">
          {t.contas.map((c) => (
            <LinhaConta key={c.id} c={c} aoCopiar={aoCopiar} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function TelaLedgraLink() {
  const { org, pode } = useOrg();
  const podeGerir = pode("contratos", "gerir");
  const { aviso, mostrar } = useAviso();
  const hoje = hojeISO(org.fuso);
  const [janela, setJanela] = useState<Janela>(null);

  const consulta = useConsulta(useCallback(() => lerCadastrosLink(org.id), [org.id]));
  const d = consulta.dados;
  const contas = (d?.titulares ?? []).flatMap((t) => t.contas.map((c) => ({ ...c, empresa: t.razao_social, documento: t.documento })));

  const salvo = (msg: string) => {
    setJanela(null);
    mostrar(msg);
    consulta.recarregar();
  };
  const copiar = (id: string) =>
    navigator.clipboard.writeText(id).then(
      () => mostrar("Código da conta copiado. Cole em Contratos › Boleto."),
      () => mostrar(`Não deu para copiar sozinho. Código: ${id}`, "atencao"),
    );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Ledgra Link"
        descricao="As empresas e contas bancárias ligadas ao Ledgra Link, que gera boleto e Pix e dá baixa sozinho quando o cliente paga."
        acoes={
          <>
            <BotoesExportar
              vazio={!contas.length}
              avisar={mostrar}
              montar={() => ({
                titulo: "Contas bancárias no Ledgra Link",
                subtitulo: `${plural(d?.titulares.length ?? 0, "empresa")} · ${plural(contas.length, "conta")}`,
                arquivo: nomeArquivo("Ledgra Link contas", org.nome, hoje),
                logoUrl: org.logo_url,
                linhas: contas,
                paisagem: true,
                colunas: [
                  { titulo: "Empresa", valor: (c) => c.empresa, peso: 1.6, largura: 30 },
                  { titulo: "CNPJ/CPF", valor: (c) => formatarDocumento(c.documento), peso: 1.1, largura: 20 },
                  { titulo: "Conta", valor: (c) => c.apelido, peso: 1.2, largura: 22 },
                  { titulo: "Banco", valor: (c) => c.banco, peso: 1, largura: 18 },
                  { titulo: "Agência", valor: (c) => c.agencia, peso: 0.6, largura: 9 },
                  { titulo: "Conta corrente", valor: (c) => `${c.conta}${c.conta_dv ? `-${c.conta_dv}` : ""}`, peso: 0.9, largura: 16 },
                  { titulo: "Ambiente", valor: (c) => nomeAmbiente(c.ambiente), peso: 0.8, largura: 14 },
                  { titulo: "Credenciais", valor: (c) => (c.produtos_ativos ?? []).map((p) => NOME_PRODUTO[p] ?? p).join(", ") || "Nenhuma", peso: 1, largura: 20 },
                  { titulo: "Código da conta", valor: (c) => c.id, peso: 1.8, largura: 38 },
                ],
              })}
            />
            {podeGerir && (
              <button type="button" className="btn-primario" onClick={() => setJanela({ tipo: "empresa" })}>
                <Icone nome="mais" className="h-4 w-4" />
                Nova empresa
              </button>
            )}
          </>
        }
      />
      {aviso}
      <p className="flex items-start gap-2 rounded-xl border border-[var(--borda)] bg-[var(--fundo)] p-3 text-sm">
        <Icone nome="info" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--marca)]" />
        <span>
          Para cada empresa, siga os 4 passos na ordem. Quando a empresa ficar &quot;Pronta para usar&quot;, copie o código da conta e cole em
          Contratos › Boleto. Senhas e chaves vão direto para o cofre do Ledgra Link e não ficam no HUB.
        </span>
      </p>
      {consulta.erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{consulta.erro}</p>}
      {!d ? (
        !consulta.erro && <Esqueleto linhas={6} />
      ) : !d.titulares.length ? (
        <EstadoVazio icone="banco" titulo="Nenhuma empresa no Ledgra Link ainda">
          {podeGerir
            ? "Clique em \"Nova empresa\" e cadastre a própria MDC primeiro. Depois siga os 4 passos que aparecem no cartão dela."
            : "Peça a quem gere Contratos para cadastrar a primeira empresa."}
        </EstadoVazio>
      ) : (
        <div className="space-y-4">
          {d.titulares.map((t) => (
            <CartaoEmpresa key={t.id} t={t} certificados={d.certificados} podeGerir={podeGerir} abrir={setJanela} aoCopiar={copiar} />
          ))}
        </div>
      )}

      {janela?.tipo === "empresa" && <JanelaEmpresa org={org.id} aoFechar={() => setJanela(null)} aoSalvar={salvo} />}
      {janela?.tipo === "termo" && (
        <JanelaTermo org={org.id} titular={janela.titular} hoje={hoje} logoUrl={org.logo_url} aoFechar={() => setJanela(null)} aoSalvar={salvo} />
      )}
      {janela?.tipo === "certificado" && (
        <JanelaCertificado org={org.id} titular={janela.titular} aoFechar={() => setJanela(null)} aoSalvar={salvo} />
      )}
      {janela?.tipo === "conta" && <JanelaConta org={org.id} titular={janela.titular} aoFechar={() => setJanela(null)} aoSalvar={salvo} />}
      {janela?.tipo === "credencial" && (
        <JanelaCredencial
          org={org.id}
          titular={janela.titular}
          certificados={d?.certificados ?? []}
          aoFechar={() => setJanela(null)}
          aoSalvar={salvo}
        />
      )}
    </div>
  );
}
