// MDC - Pessoal (075): regras puras da entrada (cadastro aberto, nome sugerido da família) e o que o app pessoal
// mostra. A família é uma organização tipo "pessoal" do HUB; o banco cria por pessoal_criar_familia.
import { problemaSenhaProvisoria } from "@/lib/senhaProvisoria";

export const NOME_APP_PESSOAL = "MDC · Pessoal";

/** Módulos do HUB que existem no app pessoal (o resto fica fora, mesmo para o administrador da família). */
export const MODULOS_PESSOAL = ["hub", "tarefas", "financeiro", "familia"] as const;

/** Telas do Financeiro que não fazem sentido para a família (nota fiscal e certificado digital ficam no HUB). */
export const ROTAS_FORA_DO_PESSOAL = ["/financeiro/certificado"];

export function moduloNoPessoal(modulo: string): boolean {
  return (MODULOS_PESSOAL as readonly string[]).includes(modulo);
}

export function rotaNoPessoal(rota: string): boolean {
  return !ROTAS_FORA_DO_PESSOAL.some((r) => rota === r || rota.startsWith(r + "/"));
}

/** "Maria da Silva Souza" → "Família Souza"; nome de uma palavra → "Família Maria". */
export function sugerirNomeFamilia(nomePessoa: string): string {
  const partes = nomePessoa.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const ultimo = partes[partes.length - 1];
  const bonito = ultimo.charAt(0).toUpperCase() + ultimo.slice(1).toLowerCase();
  return `Família ${bonito}`;
}

export interface DadosCadastro {
  nome: string;
  email: string;
  senha: string;
  confirma: string;
}

/** Primeiro problema do cadastro, em português, ou null (a função do servidor confere de novo). */
export function problemaCadastro(d: DadosCadastro): string | null {
  if (d.nome.trim().length < 2) return "Digite o seu nome.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) return "Confira o e-mail digitado.";
  if (!d.senha) return "Crie uma senha.";
  const s = problemaSenhaProvisoria(d.senha);
  if (s) return s;
  if (d.senha !== d.confirma) return "As duas senhas não conferem.";
  return null;
}

export function problemaNomeFamilia(nome: string): string | null {
  const n = nome.trim();
  if (n.length < 3) return "Dê um nome para a família (pelo menos 3 letras).";
  if (n.length > 80) return "O nome da família pode ter no máximo 80 letras.";
  return null;
}
