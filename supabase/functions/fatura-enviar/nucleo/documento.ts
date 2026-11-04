// Cópia de web/src/lib/documento.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// CPF e CNPJ: só os dígitos, validação dos dígitos verificadores e formatação para a tela. Testado em documento.test.ts.
// Fonte única do site (dominios/notas tem a própria cópia porque é levado para as Funções Edge e não importa de fora).

/** Só os dígitos de um texto (ou de qualquer valor vindo de planilha). */
export function soDigitos(t: unknown): string {
  return String(t ?? "").replace(/\D/g, "");
}

/** CNPJ com 14 dígitos e dígitos verificadores corretos (aceita com ou sem pontuação). */
export function cnpjValido(doc: string): boolean {
  const d = soDigitos(doc);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** CPF com 11 dígitos e dígitos verificadores corretos (aceita com ou sem pontuação). */
export function cpfValido(doc: string): boolean {
  const d = soDigitos(doc);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** CPF (11 dígitos) ou CNPJ (14) válido. */
export const documentoValido = (doc: string): boolean => cpfValido(doc) || cnpjValido(doc);

/** 12.345.678/0001-90 ou 123.456.789-01 (devolve como veio se não tiver 11 ou 14 dígitos). */
export function formatarDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}
