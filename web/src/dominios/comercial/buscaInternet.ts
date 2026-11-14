// Comercial: atalhos "Procurar no Google / Instagram / LinkedIn" da ficha do lead (077). Só monta os endereços de busca
// com o nome da empresa e a cidade; quem olha e decide o que anotar é a pessoa do Comercial (nada é coletado sozinho).

export interface LinkBusca {
  nome: string;
  icone: "busca" | "externo";
  url: string;
}

export function linksDeBusca(empresa: string | null, cidade?: string | null, uf?: string | null): LinkBusca[] {
  const nome = (empresa ?? "").trim();
  if (!nome) return [];
  const lugar = [cidade?.trim(), uf?.trim()].filter(Boolean).join(" ");
  const termo = [nome, lugar].filter(Boolean).join(" ");
  const q = (s: string) => encodeURIComponent(s);
  return [
    { nome: "Procurar no Google", icone: "busca", url: `https://www.google.com/search?q=${q(termo)}` },
    { nome: "Procurar no Instagram", icone: "externo", url: `https://www.google.com/search?q=${q(`site:instagram.com ${termo}`)}` },
    { nome: "Procurar no LinkedIn", icone: "externo", url: `https://www.linkedin.com/search/results/companies/?keywords=${q(nome)}` },
  ];
}
