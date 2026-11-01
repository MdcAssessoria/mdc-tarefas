// Tipos de entrada (modelo do Conta Azul): a pessoa escolhe o que a nota é e a regra decide se mexe no estoque, se gera
// conta a pagar e qual a categoria. Os padrões abaixo são os mesmos semeados no banco (fis_tipos_entrada, migração 032);
// a MDC muda por organização e por empresa na tela de Lançar nota (o banco é quem vale).

export type CodigoTipoEntrada = "revenda" | "materia_prima" | "uso_consumo" | "imobilizado" | "servico" | "devolucao_venda" | "remessa";

export interface TipoEntrada {
  codigo: CodigoTipoEntrada;
  nome: string;
  explicacao: string;
  movimenta_estoque: boolean;
  gera_pagar: boolean;
}

export const TIPOS_ENTRADA: TipoEntrada[] = [
  {
    codigo: "revenda",
    nome: "Compra para revenda",
    explicacao: "Mercadoria comprada para vender do jeito que veio. Entra no estoque e gera conta a pagar.",
    movimenta_estoque: true,
    gera_pagar: true,
  },
  {
    codigo: "materia_prima",
    nome: "Matéria-prima / industrialização",
    explicacao: "Insumo que vai ser transformado ou usado na produção. Entra no estoque e gera conta a pagar.",
    movimenta_estoque: true,
    gera_pagar: true,
  },
  {
    codigo: "uso_consumo",
    nome: "Uso e consumo",
    explicacao: "Material de escritório, limpeza, peças de manutenção: a empresa usa, não vende. Só gera conta a pagar.",
    movimenta_estoque: false,
    gera_pagar: true,
  },
  {
    codigo: "imobilizado",
    nome: "Ativo imobilizado",
    explicacao: "Máquina, veículo, computador, móvel: bem durável da empresa. Gera conta a pagar; não entra no estoque.",
    movimenta_estoque: false,
    gera_pagar: true,
  },
  {
    codigo: "servico",
    nome: "Serviço tomado",
    explicacao: "Serviço contratado de outra empresa (nota de serviço). Gera conta a pagar.",
    movimenta_estoque: false,
    gera_pagar: true,
  },
  {
    codigo: "devolucao_venda",
    nome: "Devolução de venda",
    explicacao: "O cliente devolveu mercadoria que a empresa vendeu. Volta para o estoque; não gera conta a pagar.",
    movimenta_estoque: true,
    gera_pagar: false,
  },
  {
    codigo: "remessa",
    nome: "Remessa, retorno ou bonificação",
    explicacao: "Mercadoria que chegou sem compra: conserto, demonstração, consignação, brinde. Não gera conta a pagar.",
    movimenta_estoque: false,
    gera_pagar: false,
  },
];

export const tipoEntrada = (c: string | null | undefined) => TIPOS_ENTRADA.find((t) => t.codigo === c) ?? null;

/**
 * Sugestão do tipo pelo CFOP do fornecedor e pelo modelo. É só um palpite para facilitar: a pessoa confirma.
 * 5.101/6.101 (venda de produção) e 5.102/6.102 (revenda) ficam como "revenda" — se for insumo, a pessoa troca.
 */
export function sugerirTipoEntrada(modelo: string, cfops: (string | null)[], anterior?: CodigoTipoEntrada | null): CodigoTipoEntrada {
  if (modelo === "nfse") return "servico";
  if (anterior) return anterior;
  const c = cfops.filter(Boolean).map((x) => String(x).slice(1)) as string[];
  const tem = (...l: string[]) => c.some((x) => l.includes(x));
  if (tem("201", "202", "410", "411", "553", "556", "660", "661", "662")) return "devolucao_venda";
  if (
    tem("910", "911", "912", "913", "914", "915", "916", "917", "918", "919", "920", "921", "923", "924", "925", "949", "901", "902", "903")
  )
    return "remessa";
  if (tem("551", "552")) return "imobilizado";
  if (tem("557")) return "uso_consumo";
  if (tem("122", "124", "125")) return "materia_prima";
  return "revenda";
}

interface RegraGravada {
  org_id: string | null;
  cliente_id: string | null;
  codigo: string;
  movimenta_estoque: boolean;
  gera_pagar: boolean;
  categoria_id: string | null;
}

/** Regra que vale para a empresa (a mesma ordem do banco, app.fis_tipo_efetivo): empresa › organização › geral. */
export function regraDoTipo(regras: RegraGravada[], codigo: string, clienteId: string, orgId: string) {
  const doCodigo = regras.filter((r) => r.codigo === codigo);
  const empresa = doCodigo.find((r) => r.cliente_id === clienteId);
  const base = empresa ?? doCodigo.find((r) => !r.cliente_id && r.org_id === orgId) ?? doCodigo.find((r) => !r.org_id);
  const padrao = tipoEntrada(codigo);
  return {
    movimenta_estoque: base?.movimenta_estoque ?? padrao?.movimenta_estoque ?? false,
    gera_pagar: base?.gera_pagar ?? padrao?.gera_pagar ?? true,
    categoria_id: empresa?.categoria_id ?? null,
  };
}
