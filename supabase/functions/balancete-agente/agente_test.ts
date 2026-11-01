// Teste do agente sem servidor: SharePoint (fetch) e banco (cliente Supabase) falsos.
// Rodar: cd supabase/functions/balancete-agente && deno test --allow-env agente_test.ts
import { processarOrg } from "./agente.ts";

const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};

function csv(cnpj: string, ini: string, fim: string, codigo = "123") {
  return [
    `Empresa: ${codigo} - EMPRESA DE TESTE LTDA;;;CNPJ: ${cnpj}`,
    `Período: ${ini} a ${fim};;;Folha: 1`,
    "Código;Classificação;Descrição;Saldo Anterior;Débitos;Créditos;Saldo Atual",
    "1;1;ATIVO;1.000,00D;500,00;0,00;1.500,00D",
    "10;1.1.1.01;CAIXA GERAL;1.000,00D;500,00;0,00;1.500,00D",
    "2;2;PASSIVO;1.000,00C;0,00;0,00;1.000,00C",
    "60;2.3.1.01;CAPITAL SOCIAL;1.000,00C;0,00;0,00;1.000,00C",
    "3;3;RECEITAS;0,00;0,00;500,00;500,00C",
    "70;3.1.1.01;VENDAS DE MERCADORIAS;0,00;0,00;500,00;500,00C",
  ].join("\n");
}

type Item = {
  id: string;
  name: string;
  size: number;
  pasta: string;
  conteudo: string;
  falhaDownload?: number;
};

function sharepoint(itens: Item[]) {
  const log: string[] = [];
  globalThis.fetch = (async (
    entrada: string | URL | Request,
    init?: RequestInit,
  ) => {
    const u = String(entrada);
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (u.includes("login.microsoftonline.com"))
      return ok({ access_token: "t" });
    const c = u.replace("https://graph.microsoft.com/v1.0", "");
    if (c.startsWith("/sites/") && !c.includes("/drives"))
      return ok({ id: "site" });
    if (c.endsWith("/drives"))
      return ok({ value: [{ id: "d", name: "Documentos" }] });
    if (/root:\/HUB\/Entrada$/.test(c)) return ok({ id: "entrada" });
    if (/root:\/HUB\/Entrada\/Processados$/.test(c))
      return ok({ id: "processados" });
    if (/root:\/HUB\/Entrada\/Com%20problema$/.test(c))
      return ok({ id: "problema" });
    if (c.includes("/items/entrada/children"))
      return ok({
        value: itens
          .filter((i) => i.pasta === "entrada")
          .map((i) => ({ id: i.id, name: i.name, size: i.size, file: {} })),
      });
    const m = c.match(/\/items\/([^/?]+)(\/content)?/);
    const it = itens.find((i) => i.id === m?.[1]);
    if (!it) return new Response("", { status: 404 });
    if (m?.[2]) {
      if (it.falhaDownload && it.falhaDownload-- > 0)
        return new Response("", {
          status: 503,
          headers: { "Retry-After": "0" },
        });
      log.push(`baixou ${it.name}`);
      return new Response(new TextEncoder().encode(it.conteudo));
    }
    if (init?.method === "PATCH") {
      const b = JSON.parse(String(init.body));
      it.pasta = b.parentReference.id;
      log.push(`moveu ${it.name} → ${it.pasta}`);
      return ok({ id: it.id });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return log;
}

function banco(opts: { travado?: boolean; existentes?: string[] } = {}) {
  const hist: Record<string, unknown>[] = [];
  const gravados: string[] = [];
  let seq = 0;
  // deno-lint-ignore no-explicit-any
  const consulta = (tabela: string): any => {
    const st: {
      op: string;
      dados?: unknown;
      filtros: Record<string, unknown>;
    } = { op: "select", filtros: {} };
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      in: () => q,
      or: () => q,
      lt: () => q,
      eq: (k: string, v: unknown) => ((st.filtros[k] = v), q),
      range: (de: number) =>
        Promise.resolve({
          data:
            de > 0
              ? []
              : tabela === "clientes"
                ? [
                    {
                      id: "c1",
                      cnpj: "11222333000181",
                      codigo_dominio: "123",
                      razao_social: "EMPRESA DE TESTE LTDA",
                    },
                  ]
                : [],
          error: null,
        }),
      insert: (d: unknown) => ((st.op = "insert"), (st.dados = d), q),
      update: (d: unknown) => ((st.op = "update"), (st.dados = d), q),
      delete: () => ((st.op = "delete"), q),
      maybeSingle: () => q.then((r: unknown) => r),
      // deno-lint-ignore no-explicit-any
      then: (res: any) => {
        let r: { data: unknown; error: null } = { data: null, error: null };
        if (tabela === "hub_integracoes" && st.op === "update")
          r = {
            data:
              (st.dados as { ultimo_resultado?: string }).ultimo_resultado &&
              opts.travado
                ? []
                : [{ org_id: "o" }],
            error: null,
          };
        else if (tabela === "hub_importacoes" && st.op === "insert") {
          const linha = { id: ++seq, ...(st.dados as object) };
          hist.push(linha);
          r = { data: { id: seq }, error: null };
        } else if (tabela === "hub_importacoes" && st.op === "update") {
          Object.assign(
            hist.find((h) => h.id === st.filtros.id)!,
            st.dados as object,
          );
          r = { data: { id: st.filtros.id }, error: null };
        } else if (tabela === "hub_importacoes" && st.op === "delete")
          hist.splice(
            hist.findIndex((h) => h.id === st.filtros.id),
            1,
          );
        else if (tabela === "portal_balancetes" && st.filtros.competencia)
          r = {
            data: (opts.existentes ?? []).includes(
              String(st.filtros.competencia),
            )
              ? { status: "rascunho" }
              : null,
            error: null,
          };
        else if (tabela === "portal_balancetes") r = { data: [], error: null };
        return Promise.resolve(r).then(res);
      },
    };
    return q;
  };
  const sb = {
    from: consulta,
    rpc: (_n: string, a: { p_competencia: string; p_arquivo: string }) => {
      gravados.push(`${a.p_competencia} ${a.p_arquivo}`);
      return Promise.resolve({ data: "id", error: null });
    },
  };
  return { sb, hist, gravados };
}

Deno.env.set("MS_TENANT_ID", "x");
Deno.env.set("MS_CLIENT_ID", "x");
Deno.env.set("MS_CLIENT_SECRET", "x");
const CONFIG = {
  site: "https://mdc.sharepoint.com/sites/HUB",
  biblioteca: "Documentos",
  pasta: "HUB/Entrada",
};

Deno.test(
  "importa em ordem de mês, separa problemas e não relê nada",
  async () => {
    const itens: Item[] = [
      {
        id: "a",
        name: "a-marco.csv",
        size: 500,
        pasta: "entrada",
        conteudo: csv("11.222.333/0001-81", "01/03/2026", "31/03/2026"),
      },
      {
        id: "b",
        name: "b-fevereiro.csv",
        size: 500,
        pasta: "entrada",
        conteudo: csv("11.222.333/0001-81", "01/02/2026", "28/02/2026"),
      },
      {
        id: "c",
        name: "c-lixo.csv",
        size: 500,
        pasta: "entrada",
        conteudo: "nada a ver",
      },
      {
        id: "d",
        name: "d-enorme.xlsx",
        size: 50 * 1024 * 1024,
        pasta: "entrada",
        conteudo: "",
      },
      {
        id: "e",
        name: "e-outra.csv",
        size: 500,
        pasta: "entrada",
        conteudo: csv("99.999.999/0001-99", "01/03/2026", "31/03/2026", "999"),
      },
      {
        id: "f",
        name: "f-existente.csv",
        size: 500,
        pasta: "entrada",
        conteudo: csv("11.222.333/0001-81", "01/01/2026", "31/01/2026"),
      },
    ];
    const log = sharepoint(itens);
    const { sb, hist, gravados } = banco({ existentes: ["2026-01-01"] });
    // deno-lint-ignore no-explicit-any
    const r = await processarOrg(sb as any, "o", CONFIG);
    assert(
      gravados.join("|") ===
        "2026-02-01 b-fevereiro.csv|2026-03-01 a-marco.csv",
      "ordem de gravação: " + gravados.join("|"),
    );
    const pasta = Object.fromEntries(itens.map((i) => [i.name, i.pasta]));
    assert(
      pasta["a-marco.csv"] === "processados" &&
        pasta["b-fevereiro.csv"] === "processados",
      "importados em Processados",
    );
    for (const n of [
      "c-lixo.csv",
      "d-enorme.xlsx",
      "e-outra.csv",
      "f-existente.csv",
    ])
      assert(pasta[n] === "problema", n + " em Com problema");
    assert(
      !log.includes("baixou d-enorme.xlsx"),
      "arquivo enorme não é baixado",
    );
    assert(
      hist.length === 4,
      "histórico só dos 4 não importados: " + JSON.stringify(hist),
    );
    assert(
      hist.every((h) => !String(h.motivo).includes("interrompida")),
      "nenhuma marca provisória sobrando",
    );
    assert(
      String(hist.find((h) => h.arquivo === "c-lixo.csv")?.motivo).length > 10,
      "motivo do lixo",
    );
    assert(
      r.resumo.startsWith("2 importado(s), 2 para revisar, 2 com erro"),
      r.resumo,
    );
  },
);

Deno.test(
  "SharePoint ocupado: o arquivo fica na pasta para a próxima rodada",
  async () => {
    const itens: Item[] = [
      {
        id: "a",
        name: "a.csv",
        size: 500,
        pasta: "entrada",
        conteudo: csv("11.222.333/0001-81", "01/03/2026", "31/03/2026"),
        falhaDownload: 5,
      },
    ];
    sharepoint(itens);
    const { sb, hist } = banco();
    // deno-lint-ignore no-explicit-any
    const r = await processarOrg(sb as any, "o", CONFIG);
    assert(itens[0].pasta === "entrada", "continua na entrada");
    assert(hist.length === 0, "nada no histórico");
    assert(r.resumo.includes("próxima rodada"), r.resumo);
  },
);

Deno.test(
  "falha passageira de uma vez só é tentada de novo na hora",
  async () => {
    const itens: Item[] = [
      {
        id: "a",
        name: "a.csv",
        size: 500,
        pasta: "entrada",
        conteudo: csv("11.222.333/0001-81", "01/03/2026", "31/03/2026"),
        falhaDownload: 1,
      },
    ];
    sharepoint(itens);
    const { sb, gravados } = banco();
    // deno-lint-ignore no-explicit-any
    await processarOrg(sb as any, "o", CONFIG);
    assert(
      gravados.length === 1 && itens[0].pasta === "processados",
      "importou na segunda tentativa",
    );
  },
);

Deno.test("pasta já sendo lida: recusa sem mexer em nada", async () => {
  const itens: Item[] = [
    { id: "a", name: "a.csv", size: 500, pasta: "entrada", conteudo: "x" },
  ];
  sharepoint(itens);
  const { sb } = banco({ travado: true });
  let erro = "";
  // deno-lint-ignore no-explicit-any
  await processarOrg(sb as any, "o", CONFIG).catch((e) => (erro = e.message));
  assert(
    erro.includes("já está sendo lida") && itens[0].pasta === "entrada",
    erro,
  );
});
