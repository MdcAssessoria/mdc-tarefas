// Baixa o PDF de uma fatura já gerada (papel timbrado da MDC, faturaPdf.ts). Usado na lista de Faturas.
import { baixarBytes } from "@/lib/arquivos/baixar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { carregarLogo } from "@/lib/marca";
import type { Pessoa } from "@/dominios/financeiro/tipos";
import { gerarFaturaPdf } from "./faturaPdf";
import type { Fatura } from "./tipos";

export async function baixarFaturaPdf(f: Fatura, pessoa: Pessoa | undefined, contrato: string | null, logoUrl: string | null) {
  const nome = pessoa?.nome ?? "Cliente";
  const bytes = await gerarFaturaPdf({
    fatura: f,
    cliente: {
      nome,
      documento: pessoa?.documento,
      email: pessoa?.email,
      cidade: [pessoa?.cidade, pessoa?.uf].filter(Boolean).join("/") || null,
    },
    contrato,
    logo: await carregarLogo(logoUrl),
  });
  baixarBytes(bytes, `${nomeArquivo("Fatura", f.numero.replace("/", "-"), nome.split(" ").slice(0, 2).join(" "))}.pdf`);
}
