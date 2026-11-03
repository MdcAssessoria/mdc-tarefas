// Leituras do "Ver caminho": a partir do ponto (pedido, nota, conta, pagamento ou contrato) sobe até a origem e desce
// até os pagamentos, usando só as ligações que o banco já grava (est_pedido_titulos, fin_titulos.nota_id/recorrente_id,
// fis_notas.titulos, est_movimentos.origem/origem_id, fin_baixas.titulo_id). A única ligação que o banco não grava,
// pedido de compra ↔ nota fiscal, é achada pelo número da nota no documento do pedido + o fornecedor (pendência de
// migração: docs/modulos/financeiro.md, "Ver caminho"). Cada resultado é conferido de novo aqui (não confia só no filtro).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { exigir } from "@/lib/exigir";
import type { Nota } from "@/dominios/notas/tipos";
import { documentoCitaNota, numerosDoDocumento } from "./arvore";
import type { ContratoArvore, DadosArvore, PontoArvore } from "./arvore";
import { lerContas } from "./leituras";
import type { Baixa, ContaBancaria, MovimentoEstoque, Pedido, Pessoa, Titulo } from "./tipos";

const BLOCO = 150;
const so = (ids: Iterable<string>) => [...new Set([...ids].filter(Boolean))];
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Lê uma tabela por uma coluna "in" (em blocos, cada bloco paginado com lerTudo). */
async function lerPor<T>(
  tabela: string,
  colunas: string,
  coluna: string,
  valores: string[],
  extra?: Record<string, string>,
  ordem = "id",
): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; i < valores.length; i += BLOCO) {
    const bloco = valores.slice(i, i + BLOCO);
    saida.push(
      ...(await lerTudo<T>((de, ate) => {
        let q = supabase().from(tabela).select(colunas).in(coluna, bloco);
        for (const [c, v] of Object.entries(extra ?? {})) q = q.eq(c, v);
        return q.order(ordem).order(coluna).range(de, ate);
      })),
    );
  }
  return saida;
}

const COLUNAS_CONTRATO = "id,tipo,descricao,numero,pessoa_id,valor,dia_vencimento,situacao,gera_contas,fim,gerar_desde";

/** Tudo o que a árvore precisa, mais as contas bancárias (para abrir o histórico de pagamentos de uma conta). */
export type DadosLidosArvore = DadosArvore & { contasBancarias: ContaBancaria[] };

export async function lerArvore(cliente: string, ponto: PontoArvore): Promise<DadosLidosArvore> {
  const pedidos = new Map<string, Pedido>();
  const notas = new Map<string, Nota>();
  const titulos = new Map<string, Titulo>();
  const contratos = new Map<string, ContratoArvore>();
  const pedidoTitulos: DadosArvore["pedidoTitulos"] = [];
  const pedidoNotas: DadosArvore["pedidoNotas"] = [];
  const guardar = <T extends { id: string }>(m: Map<string, T>, lista: T[]) => lista.forEach((x) => m.set(x.id, x));

  // 1) subir até a origem
  let baixaPonto: Baixa | null = null;
  if (ponto.tipo === "baixa") {
    baixaPonto = exigir(await supabase().from("fin_baixas").select("*").eq("id", ponto.id).maybeSingle()) as Baixa | null;
    if (!baixaPonto) throw new Error("Este pagamento não foi encontrado. Atualize a tela e tente de novo.");
  }
  const tituloPonto = ponto.tipo === "titulo" ? ponto.id : baixaPonto?.titulo_id;
  if (tituloPonto) {
    const t = (await lerPor<Titulo>("fin_titulos", "*", "id", [tituloPonto])).find((x) => x.id === tituloPonto);
    if (!t) throw new Error("Esta conta não foi encontrada. Atualize a tela e tente de novo.");
    titulos.set(t.id, t);
    if (t.recorrente_id)
      guardar(
        contratos,
        (await lerPor<ContratoArvore>("fin_recorrentes", COLUNAS_CONTRATO, "id", [t.recorrente_id])).filter(
          (k) => k.id === t.recorrente_id,
        ),
      );
    if (t.nota_id)
      guardar(
        notas,
        (await lerPor<Nota>("fis_notas", "*", "id", [t.nota_id])).filter((n) => n.id === t.nota_id),
      );
    if (!t.nota_id && !t.recorrente_id) {
      const pt = (
        await lerPor<{ pedido_id: string; titulo_id: string }>(
          "est_pedido_titulos",
          "pedido_id,titulo_id",
          "titulo_id",
          [t.id],
          undefined,
          "pedido_id",
        )
      ).filter((x) => x.titulo_id === t.id);
      if (pt.length)
        guardar(
          pedidos,
          (await lerPor<Pedido>("est_pedidos", "*", "id", [pt[0].pedido_id])).filter((p) => p.id === pt[0].pedido_id),
        );
      // contas lançadas juntas (outras parcelas do mesmo lançamento avulso)
      if (!pt.length && t.grupo)
        guardar(
          titulos,
          (await lerPor<Titulo>("fin_titulos", "*", "grupo", [t.grupo], { cliente_id: cliente })).filter((x) => x.grupo === t.grupo),
        );
    }
  }
  if (ponto.tipo === "nota") {
    const n = (await lerPor<Nota>("fis_notas", "*", "id", [ponto.id])).find((x) => x.id === ponto.id);
    if (!n) throw new Error("Esta nota não foi encontrada. Atualize a tela e tente de novo.");
    notas.set(n.id, n);
  }
  if (ponto.tipo === "pedido") {
    const p = (await lerPor<Pedido>("est_pedidos", "*", "id", [ponto.id])).find((x) => x.id === ponto.id);
    if (!p) throw new Error("Este pedido não foi encontrado. Atualize a tela e tente de novo.");
    pedidos.set(p.id, p);
  }
  if (ponto.tipo === "contrato") {
    const k = (await lerPor<ContratoArvore>("fin_recorrentes", COLUNAS_CONTRATO, "id", [ponto.id])).find((x) => x.id === ponto.id);
    if (!k) throw new Error("Este contrato não foi encontrado. Atualize a tela e tente de novo.");
    contratos.set(k.id, k);
  }

  // 2) pedido de compra ↔ nota pelo número da nota no documento do pedido e pelo fornecedor (sem ligação no banco)
  const pessoasIds = () => so([...pedidos.values(), ...notas.values()].map((x) => x.pessoa_id ?? ""));
  let pessoas = await lerPor<Pessoa>("fin_pessoas", "*", "id", pessoasIds());
  const docDaPessoa = (id: string | null) => digitos(pessoas.find((p) => p.id === id)?.documento);
  const mesmoFornecedor = (p: Pedido, n: Nota) =>
    (!!p.pessoa_id && n.pessoa_id === p.pessoa_id) || (!!docDaPessoa(p.pessoa_id) && docDaPessoa(p.pessoa_id) === digitos(n.emitente_doc));
  for (const n of [...notas.values()].filter((x) => x.direcao === "entrada" && x.numero)) {
    // nota ainda não lançada não tem fornecedor ligado: procura o cadastro pelo CNPJ/CPF do emitente
    let fornecedores = n.pessoa_id ? [n.pessoa_id] : [];
    if (!fornecedores.length && digitos(n.emitente_doc)) {
      const achados = (await lerPor<Pessoa>("fin_pessoas", "*", "documento", [digitos(n.emitente_doc)], { cliente_id: cliente })).filter(
        (p) => digitos(p.documento) === digitos(n.emitente_doc),
      );
      pessoas = [...pessoas, ...achados.filter((p) => !pessoas.some((x) => x.id === p.id))];
      fornecedores = achados.map((p) => p.id);
    }
    const candidatos = fornecedores.length
      ? await lerPor<Pedido>("est_pedidos", "*", "pessoa_id", fornecedores, { cliente_id: cliente, tipo: "compra" })
      : [];
    for (const p of candidatos.filter(
      (p) => p.tipo === "compra" && p.situacao !== "cancelado" && documentoCitaNota(p.documento, n.numero) && mesmoFornecedor(p, n),
    )) {
      pedidos.set(p.id, p);
      pedidoNotas.push({ pedido_id: p.id, nota_id: n.id });
    }
  }
  for (const p of [...pedidos.values()].filter((x) => x.tipo === "compra" && x.documento)) {
    const numeros = numerosDoDocumento(p.documento).slice(0, 1);
    if (!numeros.length) continue;
    const achadas = await lerPor<Nota>("fis_notas", "*", "numero", numeros, { cliente_id: cliente, direcao: "entrada" });
    for (const n of achadas.filter((n) => n.direcao === "entrada" && documentoCitaNota(p.documento, n.numero) && mesmoFornecedor(p, n))) {
      notas.set(n.id, n);
      if (!pedidoNotas.some((x) => x.pedido_id === p.id && x.nota_id === n.id)) pedidoNotas.push({ pedido_id: p.id, nota_id: n.id });
    }
  }

  // 3) descer: contas de cada documento, pagamentos e estoque
  const idsPedidos = [...pedidos.keys()];
  const idsNotas = [...notas.keys()];
  if (idsPedidos.length)
    pedidoTitulos.push(
      ...(
        await lerPor<{ pedido_id: string; titulo_id: string }>(
          "est_pedido_titulos",
          "pedido_id,titulo_id",
          "pedido_id",
          idsPedidos,
          undefined,
          "titulo_id",
        )
      ).filter((x) => pedidos.has(x.pedido_id)),
    );
  const faltam = so([...pedidoTitulos.map((x) => x.titulo_id), ...[...notas.values()].flatMap((n) => n.titulos ?? [])]).filter(
    (id) => !titulos.has(id),
  );
  guardar(
    titulos,
    (await lerPor<Titulo>("fin_titulos", "*", "id", faltam)).filter((t) => faltam.includes(t.id)),
  );
  if (idsNotas.length)
    guardar(
      titulos,
      (await lerPor<Titulo>("fin_titulos", "*", "nota_id", idsNotas)).filter((t) => !!t.nota_id && notas.has(t.nota_id)),
    );
  if (contratos.size)
    guardar(
      titulos,
      (await lerPor<Titulo>("fin_titulos", "*", "recorrente_id", [...contratos.keys()])).filter(
        (t) => !!t.recorrente_id && contratos.has(t.recorrente_id),
      ),
    );
  const idsTitulos = [...titulos.keys()];
  const baixas = (await lerPor<Baixa>("fin_baixas", "*", "titulo_id", idsTitulos)).filter((b) => titulos.has(b.titulo_id));
  const origens = new Map<string, string[]>([
    ["pedido_compra", idsPedidos.filter((id) => pedidos.get(id)?.tipo === "compra")],
    ["pedido_venda", idsPedidos.filter((id) => pedidos.get(id)?.tipo === "venda")],
    ["nota_entrada", idsNotas],
  ]);
  const movimentos: MovimentoEstoque[] = [];
  for (const [origem, ids] of origens)
    if (ids.length)
      movimentos.push(
        ...(await lerPor<MovimentoEstoque>("est_movimentos", "*", "origem_id", ids, { origem })).filter(
          (m) => m.origem === origem && ids.includes(m.origem_id ?? ""),
        ),
      );

  // 4) nomes
  const faltaPessoa = so(
    [...titulos.values(), ...contratos.values(), ...pedidos.values(), ...notas.values()].map((x) => x.pessoa_id ?? ""),
  ).filter((id) => !pessoas.some((p) => p.id === id));
  pessoas = [...pessoas, ...(await lerPor<Pessoa>("fin_pessoas", "*", "id", faltaPessoa))];
  const itens = await lerPor<{ id: string; nome: string; unidade: string }>(
    "est_itens",
    "id,nome,unidade",
    "id",
    so(movimentos.map((m) => m.item_id)),
  );
  const contas = await lerContas(cliente);

  return {
    pedidos: [...pedidos.values()],
    pedidoTitulos,
    pedidoNotas,
    notas: [...notas.values()],
    titulos: [...titulos.values()],
    baixas: baixaPonto && !baixas.some((b) => b.id === baixaPonto.id) ? [...baixas, baixaPonto] : baixas,
    movimentos,
    contratos: [...contratos.values()],
    contasBancarias: contas,
    nomes: {
      pessoas: Object.fromEntries(pessoas.map((p) => [p.id, p.nome])),
      contas: Object.fromEntries(contas.map((c) => [c.id, c.nome])),
      itens: Object.fromEntries(itens.map((i) => [i.id, { nome: i.nome, unidade: i.unidade }])),
    },
  };
}
