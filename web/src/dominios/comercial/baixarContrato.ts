// Baixa o PDF de um contrato já salvo (layout MDC de contratoPdf.ts). Usado na ficha da oportunidade e na lista
// de contratos. Rascunho sai com a marca d'água de rascunho.
import { baixarBytes } from "@/lib/arquivos/baixar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { carregarLogo } from "@/lib/marca";
import { gerarContratoPdf } from "./contratoPdf";
import type { Contrato } from "./crm";

export async function baixarContratoPdf(c: Pick<Contrato, "texto" | "numero" | "valores" | "status">, logoUrl: string | null) {
  const bytes = await gerarContratoPdf({
    texto: c.texto,
    numero: c.numero ?? "",
    contratante: { nome: c.valores.razao_social, representante: c.valores.representante },
    logo: await carregarLogo(logoUrl),
    rascunho: c.status === "rascunho",
  });
  baixarBytes(
    bytes,
    `${nomeArquivo("Contrato", (c.numero ?? "").replace("/", "-"), c.valores.razao_social.split(" ").slice(0, 2).join(" "))}.pdf`,
  );
}
