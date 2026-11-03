// Textos do painel de Notas recebidas em linguagem simples: resumo com plural certo e o aviso da busca automática.
// O aviso traduz o erro técnico que a Função Edge grava em fis_dfe_controle.ultimo_erro (IP, URL, "os error 104"…)
// numa frase para o leigo; o texto original fica em `detalhes`, para a tela mostrar recolhido em "Ver detalhes".
import type { ControleCaptura } from "./tipos";

/** "1 nota" / "3 notas": número + palavra no singular ou no plural. */
export const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Frase de resumo acima dos indicadores (ex.: "2 notas aguardam sua resposta (R$ 10,00). 50 prontas para lançar."). */
export function resumoNotasRecebidas(p: {
  aguardando: number;
  valorAguardando: string;
  vencendo: number;
  aLancar: number;
  valorALancar: string;
}): string {
  const prontas = `${contar(p.aLancar, "pronta", "prontas")} para lançar`;
  if (p.aguardando) {
    const verbo = p.aguardando === 1 ? "aguarda" : "aguardam";
    const prazo = p.vencendo ? `, ${p.vencendo} com prazo vencendo` : "";
    return `${contar(p.aguardando, "nota", "notas")} ${verbo} sua resposta (${p.valorAguardando})${prazo}. ${p.aLancar ? prontas : "Nenhuma pronta para lançar"}.`;
  }
  if (p.aLancar) return `Nenhuma nota esperando resposta. ${prontas} (${p.valorALancar}).`;
  return "Tudo em dia neste período.";
}

export type CausaErroBusca = "certificado" | "sem_resposta" | "demora" | "fora_do_ar" | "pausa" | "leitura" | "outro";

const ORGAO: Record<ControleCaptura["fonte"], string> = { nfe: "A SEFAZ Nacional", nfse: "A NFS-e Nacional" };
const DOCS: Record<ControleCaptura["fonte"], string> = { nfe: "NF-e de produto", nfse: "NFS-e de serviço" };

/** Classifica o erro técnico gravado pela busca automática. */
export function causaDoErro(erro: string): CausaErroBusca {
  const t = erro.toLowerCase();
  // o texto de conexão sempre termina com "Confira se o certificado é ICP-Brasil"; só o miolo diz se foi o certificado
  const miolo = t.replace(/confira se o certificado.*$/, "");
  if (/n[ãa]o [ée] icp-brasil|certificate|handshake|bad cert|unknown ca|\btls\b|\bssl\b|certificado (vencido|inv[áa]lido)|cnpj dentro do certificado/.test(miolo))
    return "certificado";
  if (/timed? ?out|timeout|aborted|demorou/.test(miolo)) return "demora";
  if (/pediu para esperar|muitas consultas|consumo indevido|\b429\b/.test(miolo)) return "pausa";
  if (/respondeu (5\d\d)|\b50[234]\b|service unavailable|bad gateway/.test(miolo)) return "fora_do_ar";
  if (/n[ãa]o foi poss[íi]vel falar|connection|conex[ãa]o|reset by peer|refused|dns|network|os error|sendrequest|error sending request/.test(miolo))
    return "sem_resposta";
  if (/^nsu \d+:/.test(miolo)) return "leitura";
  return "outro";
}

/** O que aconteceu, numa frase curta, para uma fonte (sem IP, URL ou código). */
export function explicarErroBusca(erro: string, fonte: ControleCaptura["fonte"]): string {
  const orgao = ORGAO[fonte];
  switch (causaDoErro(erro)) {
    case "certificado":
      return `${orgao} não aceitou o certificado digital da MDC na última tentativa.`;
    case "sem_resposta":
      return `${orgao} não respondeu na última tentativa.`;
    case "demora":
      return `${orgao} demorou demais para responder na última tentativa.`;
    case "fora_do_ar":
      return `${orgao} estava fora do ar na última tentativa.`;
    case "pausa":
      return `${orgao} pediu um intervalo entre as consultas.`;
    case "leitura":
      return `Uma nota que veio d${fonte === "nfe" ? "a SEFAZ Nacional" : "a NFS-e Nacional"} não pôde ser lida.`;
    default:
      return `A última busca de ${DOCS[fonte]} não deu certo.`;
  }
}

export interface AvisoBusca {
  /** Frase para o leigo: o que houve, o que continua funcionando e o que fazer. */
  texto: string;
  /** Mensagem técnica original de cada fonte (para "Ver detalhes"). */
  detalhes: string[];
  /** true quando a pessoa precisa agir (certificado); false quando o HUB resolve sozinho. */
  agir: boolean;
}

/** Aviso da busca automática a partir do controle das duas fontes; null quando a última busca de todas deu certo. */
export function avisoDaBusca(controles: Pick<ControleCaptura, "fonte" | "ultimo_erro">[]): AvisoBusca | null {
  const comErro = controles.filter((c) => c.ultimo_erro?.trim());
  if (!comErro.length) return null;
  const causas = comErro.map((c) => causaDoErro(c.ultimo_erro!));
  const agir = causas.includes("certificado");
  const frases = comErro.map((c) => explicarErroBusca(c.ultimo_erro!, c.fonte));

  const okFontes = controles.filter((c) => !c.ultimo_erro?.trim()).map((c) => c.fonte);
  const paradas = comErro.map((c) => DOCS[c.fonte]);
  const continuam = okFontes.length ? `As ${okFontes.map((f) => DOCS[f].split(" ")[0]).join(" e as ")} continuam chegando normalmente; ` : "";
  const indisp = `${continuam}${continuam ? "as" : "As"} ${paradas.join(" e as ")} estão temporariamente indisponíveis`;

  const acao = agir
    ? ". Confira em Certificado digital se o certificado é ICP-Brasil e está dentro da validade."
    : causas.every((c) => c === "outro" || c === "leitura")
      ? " — o HUB tenta de novo sozinho; se continuar, avise a equipe MDC."
      : " — o HUB tenta de novo sozinho.";

  return {
    texto: `${frases.join(" ")} ${indisp}${acao}`,
    detalhes: comErro.map((c) => `${c.fonte === "nfe" ? "NF-e (SEFAZ Nacional)" : "NFS-e (NFS-e Nacional)"}: ${c.ultimo_erro!.trim()}`),
    agir,
  };
}
