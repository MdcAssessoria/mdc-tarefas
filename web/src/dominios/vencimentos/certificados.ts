// Painel "Certificados digitais" (Vencimentos › Certificados digitais): junta numa lista só os certificados dos dois
// cofres — o do HUB (assinatura dos demonstrativos e notas fiscais, migração 044 · cert_painel) e o do Ledgra Link
// (certificados bancários, pela Função Edge ledgra-link). Só dados públicos: arquivo e senha nunca saem dos cofres.
// Regras sem tela; testadas em certificados.test.ts.
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { diaNoFuso } from "@/lib/datas";
import { diasParaVencer } from "./regras";

/** Linha da função cert_painel (cofre do HUB). */
export interface CertificadoHub {
  origem: "demonstrativos" | "notas";
  cliente_id: string | null;
  titular: string;
  documento: string | null;
  emissor: string | null;
  icp_brasil: boolean;
  valido_de: string | null;
  valido_ate: string | null;
  enviado_em: string;
}

/** Linha que o Ledgra Link devolve (GET /v1/certificados/vencimentos). */
export interface CertificadoLink {
  id: string;
  titular_documento: string;
  titular_razao_social: string;
  tipo: "icp_a1_ecnpj" | "icp_a1_ecpf" | "banco_mtls" | "webhook_servidor";
  apelido: string;
  emissor_cn: string | null;
  valido_ate: string;
  status: string;
}

export type Cofre = "hub" | "ledgra_link";
export const COFRES: { id: Cofre; nome: string; ajuda: string }[] = [
  { id: "hub", nome: "Cofre do HUB", ajuda: "Assinatura dos demonstrativos e notas fiscais das empresas" },
  { id: "ledgra_link", nome: "Ledgra Link", ajuda: "Certificados usados com os bancos (boleto, Pix e extrato)" },
];
export const nomeCofre = (c: Cofre) => COFRES.find((x) => x.id === c)?.nome ?? c;

const USO_LINK: Record<CertificadoLink["tipo"], string> = {
  icp_a1_ecnpj: "Bancos (e-CNPJ)",
  icp_a1_ecpf: "Bancos (e-CPF)",
  banco_mtls: "Conexão segura com o banco",
  webhook_servidor: "Avisos do banco",
};

export interface LinhaCertificado {
  chave: string;
  cofre: Cofre;
  uso: string;
  titular: string;
  /** só dígitos (CNPJ/CPF) ou vazio */
  documento: string;
  cliente_id: string | null;
  emissor: string;
  /** dia AAAA-MM-DD no fuso da organização; vazio = certificado sem data de validade registrada */
  vence_em: string;
  dias: number | null;
}

/** Junta os dois cofres numa lista ordenada pelo vencimento (sem data por último). */
export function juntarCertificados(hub: CertificadoHub[], link: CertificadoLink[], fuso: string, hoje: string): LinhaCertificado[] {
  const dia = (iso: string | null) => (iso ? diaNoFuso(iso, fuso) : "");
  const linhas: LinhaCertificado[] = [
    ...hub.map((c, i) => {
      const vence = dia(c.valido_ate);
      return {
        chave: `hub-${c.origem}-${c.cliente_id ?? "org"}-${i}`,
        cofre: "hub" as const,
        uso: c.origem === "demonstrativos" ? "Assinatura dos demonstrativos" : "Notas fiscais (baixar e manifestar)",
        titular: c.titular,
        documento: (c.documento ?? "").replace(/\D/g, ""),
        cliente_id: c.cliente_id,
        emissor: c.emissor ?? "",
        vence_em: vence,
        dias: vence ? diasParaVencer(vence, hoje) : null,
      };
    }),
    ...link
      .filter((c) => c.status !== "revogado" && c.status !== "substituido")
      .map((c) => {
        const vence = dia(c.valido_ate);
        return {
          chave: `link-${c.id}`,
          cofre: "ledgra_link" as const,
          uso: `${USO_LINK[c.tipo] ?? "Bancos"} · ${c.apelido}`,
          titular: c.titular_razao_social,
          documento: (c.titular_documento ?? "").replace(/\D/g, ""),
          cliente_id: null,
          emissor: c.emissor_cn ?? "",
          vence_em: vence,
          dias: vence ? diasParaVencer(vence, hoje) : null,
        };
      }),
  ];
  return linhas.sort((a, b) => (a.vence_em || "9999").localeCompare(b.vence_em || "9999") || a.titular.localeCompare(b.titular));
}

export async function lerCertificadosHub(org: string): Promise<CertificadoHub[]> {
  return (exigir(await supabase().rpc("cert_painel", { p_org: org })) ?? []) as CertificadoHub[];
}

export interface RespostaLink {
  ligado: boolean;
  mensagem: string | null;
  certificados: CertificadoLink[];
}

/** Certificados bancários do Ledgra Link. Desligado ou fora do ar não é erro: o painel avisa e mostra o cofre do HUB. */
export async function lerCertificadosLink(org: string): Promise<RespostaLink> {
  const r = await chamarFuncao<Partial<RespostaLink>>("ledgra-link", { corpo: { acao: "certificados", org } });
  return {
    ligado: r?.ligado === true,
    mensagem: r?.mensagem ?? (r?.ligado ? null : "O Ledgra Link ainda não está ligado neste servidor."),
    certificados: Array.isArray(r?.certificados) ? r.certificados : [],
  };
}
