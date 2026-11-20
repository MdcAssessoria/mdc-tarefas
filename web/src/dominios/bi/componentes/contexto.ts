// O que todas as abas do BI recebem: empresas escolhidas, período e a opção de tirar as operações entre elas.
import type { EmpresaBi } from "../dados";

export interface ContextoBi {
  grupo: string;
  /** Empresas escolhidas (todas com os números liberados). */
  empresas: EmpresaBi[];
  ids: string[];
  de: string;
  ate: string;
  rotuloPeriodo: string;
  /** Tira as vendas e pagamentos entre as empresas escolhidas (só faz efeito com mais de uma). */
  elimina: boolean;
  /** Nome curto do que está na tela: o grupo inteiro ou as empresas. */
  quem: string;
  hoje: string;
  logoUrl: string | null;
  /** Nível operar na ferramenta BI (lançamentos e orçamento). */
  podeLancar: boolean;
  avisar: (texto: string, tom?: "erro" | "sucesso" | "atencao") => void;
}

export const textoEliminacao = (c: ContextoBi) =>
  c.ids.length > 1 ? (c.elimina ? " · sem as operações entre as empresas do grupo" : " · com as operações entre as empresas") : "";
