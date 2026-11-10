// Endereços da Sefin Nacional (emissor da NFS-e) que o retransmissor do site aceita (066): só https, só os hosts de
// produção e produção restrita e só os caminhos da emissão (POST /nfse) e das consultas (GET /dps/{Id}, /nfse/{chave}).
const HOSTS = new Set(["sefin.producaorestrita.nfse.gov.br", "sefin.nfse.gov.br"]);
const CAMINHO = /^\/SefinNacional\/(nfse|nfse\/\d{50}|dps\/DPS\d{42})$/;

/** Endereço aceito, ou null. */
export function enderecoSefin(url: unknown): URL | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS.has(u.hostname) && !u.search && !u.port && !u.username && CAMINHO.test(u.pathname) ? u : null;
  } catch {
    return null;
  }
}
