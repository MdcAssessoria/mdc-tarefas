// Regras puras dos pacotes de licença (091; testadas em pacotes.test.ts): o resumo da montagem (quanto os módulos
// somariam avulsos, o desconto do pacote e um exemplo de mensalidade com N usuários), o texto dos usuários do pacote e
// o que a licença herda do pacote ao escolhê-lo. A mensalidade do exemplo segue a mesma conta da cobrança
// (valorAdicional em regras.ts: usuário a mais só soma quando o excedente é "cobrar").
import { descontoSobreTabela, usuariosAdicionais } from "./regras";
import type { Excedente, Plano, Produto } from "./tipos";

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface ResumoPacote {
  /** Quanto os módulos marcados custariam avulsos (preço de tabela). */
  avulsos: number;
  /** Desconto do preço do pacote sobre os avulsos, em %. */
  desconto: number;
  /** Usuários além dos incluídos no exemplo. */
  adicionais: number;
  /** Mensalidade no exemplo: preço do pacote + adicionais cobrados. */
  mensalidade: number;
  /** Excedente "bloquear" e o exemplo passa do limite: o sistema não deixaria ativar os adicionais. */
  bloqueia: boolean;
}

/** Resumo da montagem do pacote para um exemplo de `usuarios` pessoas usando o sistema. */
export function resumoPacote(
  p: { precosModulos: number[]; preco: number; usuarios_incluidos: number | null; valor_usuario_adicional: number; excedente: Excedente },
  usuarios: number,
): ResumoPacote {
  const avulsos = r2(p.precosModulos.reduce((s, v) => s + (v || 0), 0));
  const adicionais = usuariosAdicionais(usuarios, p.usuarios_incluidos);
  const cobrados = p.excedente === "cobrar" ? adicionais : 0;
  return {
    avulsos,
    desconto: descontoSobreTabela(avulsos, p.preco),
    adicionais,
    mensalidade: r2(p.preco + cobrados * (p.valor_usuario_adicional || 0)),
    bloqueia: p.excedente === "bloquear" && adicionais > 0,
  };
}

/** "Até 5 usuários" / "1 usuário" / "Sem limite de usuários". */
export function textoUsuariosPacote(incluidos: number | null): string {
  if (incluidos == null) return "Sem limite de usuários";
  return incluidos === 1 ? "Até 1 usuário" : `Até ${incluidos} usuários`;
}

/** "Usuário a mais: R$ 40,00, cobrado no mês seguinte" / "Usuário a mais: bloqueado". */
export function textoExcedente(excedente: Excedente, adicional: number, brl: (v: number) => string): string {
  if (excedente === "bloquear") return "Passou do limite: o sistema não deixa ativar";
  return adicional > 0 ? `Usuário a mais: ${brl(adicional)} por mês` : "Usuário a mais: liberado, sem valor definido";
}

/** Pacotes de um sistema (os inativos só se já estão escolhidos). */
export function pacotesDoSistema(planos: Plano[], sistema: string, escolhido?: string | null): Plano[] {
  return planos.filter((p) => p.sistema === sistema && (p.ativo || p.id === escolhido));
}

/** Módulos de um sistema que podem entrar num pacote (os inativos só se já estão no pacote). */
export function modulosParaPacote(produtos: Produto[], sistema: string, marcados: string[]): Produto[] {
  return produtos.filter((p) => p.sistema === sistema && (p.ativo || marcados.includes(p.id)));
}

/** O que a licença recebe ao escolher o pacote (sugestão; a pessoa ainda pode mudar na licença). */
export function herancaDoPacote(p: Plano): {
  temLimite: boolean;
  usuarios: string;
  adicional: number;
  excedente: Excedente;
} {
  return {
    temLimite: p.usuarios_incluidos != null,
    usuarios: p.usuarios_incluidos != null ? String(p.usuarios_incluidos) : "",
    adicional: p.valor_usuario_adicional || 0,
    excedente: p.excedente,
  };
}
