// Regras fiscais por tipo de serviço (057): frases simples para a tela, o contrato e o item, e a conversão da lista de
// municípios que retêm o ISS (texto "Cidade/UF; Cidade/UF" ↔ lista). Funções puras, testadas.
import { formatarCodigoNacional } from "@/lib/fiscal/servicos";
import { formatarNbs } from "@/lib/fiscal/servicos";
import type { RegraServico } from "./tipos";

export const RETENCOES: { id: RegraServico["iss_retencao"]; nome: string; detalhe: string }[] = [
  { id: "nao", nome: "Não retém", detalhe: "O ISS vai no DAS do Simples. É o caso da MDC na maioria das notas." },
  { id: "municipios", nome: "Retém em alguns municípios", detalhe: "Quando o cliente fica num município cuja lei manda reter o ISS." },
  { id: "sempre", nome: "Sempre retém", detalhe: "O cliente sempre retém o ISS deste serviço." },
];

/** "atibaia/SP" → "Atibaia/SP"; "braganca paulista/SP" → "Braganca Paulista/SP". */
export function nomeMunicipio(chave: string): string {
  const [cidade, uf] = chave.split("/");
  const bonita = (cidade ?? "")
    .split(" ")
    .map((p) => (["de", "da", "do", "das", "dos", "e"].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
  return uf ? `${bonita}/${uf.toUpperCase()}` : bonita;
}

/** "Atibaia/SP; Bragança Paulista/SP" (ou uma por linha) → ["Atibaia/SP", "Bragança Paulista/SP"]. */
export function municipiosDoTexto(texto: string): string[] {
  return texto
    .split(/[;\n]+/)
    .map((t) => t.trim().replace(/\s*\/\s*/, "/").replace(/\s*-\s*([A-Za-z]{2})$/, "/$1"))
    .filter(Boolean);
}

/** Uma frase para a lista e para o resumo no contrato/item. */
export function resumoRegra(r: Pick<RegraServico, "nbs" | "iss_aliquota" | "iss_retencao" | "iss_retencao_municipios">): string {
  const partes = [
    r.nbs ? `NBS ${formatarNbs(r.nbs)}` : "NBS padrão",
    r.iss_aliquota != null ? `ISS ${String(Number(r.iss_aliquota)).replace(".", ",")}%` : "ISS não informado",
    r.iss_retencao === "nao"
      ? "não retém ISS"
      : r.iss_retencao === "sempre"
        ? "ISS sempre retido"
        : `ISS retido em ${r.iss_retencao_municipios.map(nomeMunicipio).join(", ")}`,
  ];
  return partes.join(" · ");
}

/** A regra ativa do código (171901 ou 17.19.01), se houver. */
export function regraDoCodigo(regras: RegraServico[], codigo: string | null | undefined): RegraServico | null {
  const c = formatarCodigoNacional(codigo);
  if (!c) return null;
  return regras.find((r) => r.ativo && formatarCodigoNacional(r.servico_codigo) === c) ?? null;
}
