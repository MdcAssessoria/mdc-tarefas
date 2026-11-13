// Ferramentas abertas do HUB (sem login): páginas públicas no domínio do HUB que trazem clientes para o CRM.
// Cada ferramenta é um arquivo estático em web/public/ferramentas/<id>/index.html, servido em
// hub.mdcassessoria.com/hub-mdc/ferramentas/<id> (rewrite no next.config.ts). Quem preenche entra no funil pela
// função crm_receber_lead com a origem da ferramenta. Ferramenta nova = arquivo novo + uma linha em FERRAMENTAS.
import { BASE } from "@/lib/caminho";
import type { NomeIcone } from "@/components/ui/Icone";

export interface Ferramenta {
  id: string;
  nome: string;
  descricao: string;
  /** Origem gravada no CRM para os leads que chegam por ela (crm_oportunidades.origem). */
  origem: string;
  icone: NomeIcone;
  /** Texto pronto para mandar no WhatsApp junto com o link. */
  convite: string;
}

/** Endereço oficial do HUB: o link divulgado é sempre este, mesmo quando a tela é aberta por outro endereço. */
export const ENDERECO_OFICIAL = "https://hub.mdcassessoria.com";

export const FERRAMENTAS: Ferramenta[] = [
  {
    id: "simulador-regime",
    nome: "Simulador de Regime 2027",
    descricao:
      "A empresa informa faturamento, folha e compras e vê quanto paga em cada regime em 2027 (reforma tributária), com parecer em PDF. Quem preenche entra no Funil como novo lead.",
    origem: "simulador",
    icone: "grafico",
    convite:
      "Quanto sua empresa vai pagar de imposto em 2027? Faça a simulação gratuita da MDC e veja o regime mais econômico com a reforma tributária:",
  },
];

/** Canais de divulgação: viram utm_source no link e aparecem na ficha do lead ("Como chegou"). */
export const CANAIS = [
  { id: "", nome: "Sem marcação" },
  { id: "instagram", nome: "Instagram" },
  { id: "whatsapp", nome: "WhatsApp" },
  { id: "site", nome: "Site da MDC" },
  { id: "email", nome: "E-mail" },
  { id: "linkedin", nome: "LinkedIn" },
  { id: "evento", nome: "Evento ou palestra" },
] as const;

/** Link público da ferramenta, com o canal (utm_source) quando escolhido. */
export function linkFerramenta(f: Pick<Ferramenta, "id">, canal = "", origem = ENDERECO_OFICIAL): string {
  const url = `${origem.replace(/\/$/, "")}${BASE}/ferramentas/${f.id}`;
  return canal ? `${url}?utm_source=${encodeURIComponent(canal)}` : url;
}

/** Mensagem pronta para o WhatsApp (o link vai no fim para virar prévia). */
export function linkWhatsappConvite(f: Pick<Ferramenta, "convite">, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${f.convite}\n${link}`)}`;
}

/** Código para colar no site (WordPress, bloco "HTML personalizado"): a altura acompanha o conteúdo. */
export function codigoParaSite(f: Pick<Ferramenta, "id" | "nome">, link: string): string {
  const id = `mdc-${f.id}`;
  return [
    `<iframe id="${id}" src="${link}" title="${f.nome}" style="width:100%;border:0;min-height:1100px" loading="lazy"></iframe>`,
    "<script>",
    `addEventListener("message", e => { if (e.data && e.data.mdcSimAltura) document.getElementById("${id}").style.height = e.data.mdcSimAltura + "px"; });`,
    "</script>",
  ].join("\n");
}
