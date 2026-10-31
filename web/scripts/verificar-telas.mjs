// Verificação de telas do HUB-MDC: abre cada rota do site num navegador de verdade (Chromium, via Playwright),
// com o Supabase simulado, e falha se alguma tela der erro de JavaScript, erro do React no console, ficar presa
// em "Carregando…" ou abrir vazia. Serve de rede de segurança para refatorações de tela.
//
// Como usar (de dentro de web/):
//   npm run build     # o script usa o build de produção (.next); rode o build antes
//   npm run telas     # sobe `next start` numa porta livre, visita todas as rotas e mostra o resultado
//
// Opções (variáveis de ambiente):
//   PORTA_TELAS=3100        primeira porta a tentar (usa a próxima livre)
//   ROTAS=/tarefas,/tv      verifica só essas rotas (caminho sem o /hub-mdc)
//   FOTOS=/tmp/telas        salva uma captura de cada tela nessa pasta
//
// Como funciona:
//   - As rotas saem das pastas de src/app (cada page.tsx). Rotas com [id] usam os ids de IDS_EXEMPLO em
//     scripts/telas/dados-exemplo.mjs; rota nova com parâmetro sem id de exemplo faz o script falhar.
//   - Uma sessão falsa é gravada no localStorage antes de a página abrir, e toda requisição ao Supabase
//     (*.supabase.co) é respondida com os dados de scripts/telas/dados-exemplo.mjs. Nada sai para o banco real.
//   - Algumas telas têm cliques extras (abrir janela, trocar aba) em INTERACOES, mais abaixo.
//   - Requisito: pacote `playwright` com o Chromium já instalado na máquina (aqui ele é global). Este script
//     não roda `playwright install`.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EU, IDS_EXEMPLO, RPCS, TABELAS, USUARIO } from "./telas/dados-exemplo.mjs";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const BASE = "/hub-mdc";
const PROJETO_SUPABASE = "bulqqdgfrrpqquqvjjfa";
const ESPERA_CARREGAR_MS = 10_000;

const require = createRequire(import.meta.url);
const { chromium } = carregarPlaywright();

function carregarPlaywright() {
  try {
    return require("playwright");
  } catch {
    // instalado globalmente (npm i -g playwright): procura na pasta global do npm
    const raiz = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return require(join(raiz, "playwright"));
  }
}

// ---------------------------------------------------------------- rotas

/** Lista as rotas a partir das pastas de src/app que têm page.tsx (ignora grupos "(x)" e pastas privadas "_x"). */
function descobrirRotas() {
  const app = join(WEB, "src", "app");
  const rotas = [];
  const andar = (pasta) => {
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) {
        if (!nome.startsWith("_")) andar(caminho);
      } else if (nome === "page.tsx") {
        const chave = relative(app, pasta).split(sep).join("/");
        rotas.push(chave);
      }
    }
  };
  andar(app);
  return rotas.sort().map((chave) => {
    const partes = chave.split("/").filter((p) => p && !/^\(.*\)$/.test(p));
    const temParametro = partes.some((p) => p.startsWith("["));
    if (temParametro && !IDS_EXEMPLO[chave])
      throw new Error(
        `A rota "${chave}" tem parâmetro e não tem id de exemplo. Acrescente em IDS_EXEMPLO (scripts/telas/dados-exemplo.mjs).`,
      );
    const caminho = "/" + partes.map((p) => (p.startsWith("[") ? IDS_EXEMPLO[chave] : p)).join("/");
    return { chave: chave || "(início)", caminho: caminho === "/" ? "/" : caminho };
  });
}

// ---------------------------------------------------------------- servidor

function portaLivre(inicial) {
  return new Promise((resolve) => {
    const tentar = (p) => {
      const s = createServer();
      s.once("error", () => tentar(p + 1));
      s.once("listening", () => s.close(() => resolve(p)));
      s.listen(p, "127.0.0.1");
    };
    tentar(inicial);
  });
}

async function subirServidor(porta) {
  const next = require.resolve("next/dist/bin/next", { paths: [WEB] });
  const proc = spawn(process.execPath, [next, "start", "-p", String(porta)], { cwd: WEB, stdio: ["ignore", "pipe", "pipe"] });
  let saida = "";
  proc.stdout.on("data", (d) => (saida += d));
  proc.stderr.on("data", (d) => (saida += d));
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    if (proc.exitCode !== null) throw new Error(`O "next start" terminou antes de responder. Rodou "npm run build"?\n${saida}`);
    try {
      await fetch(`http://127.0.0.1:${porta}${BASE}`, { redirect: "manual" });
      return proc;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  proc.kill();
  throw new Error(`O servidor não respondeu em 60 s.\n${saida}`);
}

// ---------------------------------------------------------------- Supabase simulado

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
  "access-control-expose-headers": "content-range",
};

const PARAMETROS_QUE_NAO_SAO_FILTRO = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"]);

/** Aplica os filtros simples do PostgREST (eq, in, is.null) que as telas usam para buscar por id. */
function filtrar(linhas, busca) {
  let out = linhas;
  for (const [coluna, expr] of busca) {
    if (PARAMETROS_QUE_NAO_SAO_FILTRO.has(coluna) || coluna.includes(".")) continue;
    if (expr.startsWith("eq.")) out = out.filter((l) => !(coluna in l) || String(l[coluna]) === expr.slice(3));
    else if (expr.startsWith("in.(")) {
      const valores = expr
        .slice(4, -1)
        .split(",")
        .map((v) => v.replace(/^"|"$/g, ""));
      out = out.filter((l) => !(coluna in l) || valores.includes(String(l[coluna])));
    } else if (expr === "is.null") out = out.filter((l) => !(coluna in l) || l[coluna] === null);
  }
  return out;
}

function criarRespostaSupabase(avisos) {
  return async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const metodo = req.method();
    const json = (status, corpo, cab = {}) =>
      route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...cab }, body: JSON.stringify(corpo) });
    if (metodo === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });

    const p = url.pathname;
    if (p.startsWith("/auth/v1/user")) return json(200, USUARIO);
    if (p.startsWith("/auth/v1/token")) return json(200, sessaoFalsa());
    if (p.startsWith("/auth/v1/")) return json(200, {});
    if (p.startsWith("/storage/v1/object/list")) return json(200, []);
    if (p.startsWith("/storage/v1/")) return json(200, { signedURL: "/vazio", signedUrl: "/vazio" });
    if (p.startsWith("/functions/v1/")) return json(200, {});

    if (p.startsWith("/rest/v1/rpc/")) {
      const nome = p.slice("/rest/v1/rpc/".length);
      const args = req.postDataJSON?.() ?? Object.fromEntries(url.searchParams);
      if (!RPCS[nome]) avisos.add(`RPC sem dado de exemplo: ${nome}`);
      return json(200, RPCS[nome] ? RPCS[nome](args) : null);
    }

    if (p.startsWith("/rest/v1/")) {
      const tabela = p.slice("/rest/v1/".length);
      if (metodo !== "GET" && metodo !== "HEAD") {
        // gravações: devolve o que foi enviado (as telas só gravam quando alguém clica, o que este script não faz)
        let corpo = null;
        try {
          corpo = req.postDataJSON();
        } catch {
          corpo = null;
        }
        return json(201, corpo ?? []);
      }
      if (!TABELAS[tabela]) avisos.add(`Tabela sem dados de exemplo: ${tabela}`);
      const linhas = filtrar(TABELAS[tabela] ?? [], url.searchParams);
      const intervalo = linhas.length ? `0-${linhas.length - 1}/${linhas.length}` : `*/0`;
      if (metodo === "HEAD") return route.fulfill({ status: 200, headers: { ...CORS, "content-range": intervalo } });
      const umObjeto = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (umObjeto) {
        if (!linhas.length)
          return json(406, {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: "The result contains 0 rows",
          });
        return json(200, linhas[0], { "content-range": "0-0/1" });
      }
      return json(200, linhas, { "content-range": intervalo });
    }
    return json(404, { message: "rota do Supabase não simulada" });
  };
}

function sessaoFalsa() {
  return {
    access_token: "token-de-teste",
    token_type: "bearer",
    expires_in: 999_999,
    expires_at: Math.floor(Date.now() / 1000) + 999_999,
    refresh_token: "atualizacao-de-teste",
    user: USUARIO,
  };
}

// ---------------------------------------------------------------- interações

/** Abre a janela pelo botão, confere que é um diálogo acessível com o foco dentro e fecha com Esc. */
async function abrirEFecharModal(pagina, botao, titulo) {
  await pagina.getByRole("button", { name: botao, exact: true }).click();
  const dialogo = pagina.getByRole("dialog", { name: titulo });
  await dialogo.waitFor({ timeout: 3000 });
  const focoDentro = await dialogo.evaluate((d) => d.contains(document.activeElement));
  if (!focoDentro) throw new Error(`o foco não foi para dentro da janela "${titulo}"`);
  await pagina.keyboard.press("Escape");
  await dialogo.waitFor({ state: "detached", timeout: 3000 });
}

/**
 * Cliques extras depois que a tela abre, para cobrir o que só aparece com interação (janelas, abas).
 * A chave é o caminho da rota; a função lança erro quando algo não se comporta como esperado.
 */
const INTERACOES = {
  "/vencimentos": (p) => abrirEFecharModal(p, "Novo vencimento", "Novo vencimento"),
  "/comercial": (p) => abrirEFecharModal(p, "Limpar funil", "Limpar funil"),
  "/config": async (p) => {
    for (const aba of await p.getByRole("tab").all()) {
      await aba.click();
      if ((await aba.getAttribute("aria-selected")) !== "true") throw new Error(`a aba "${await aba.innerText()}" não ficou selecionada`);
      await p.waitForTimeout(300);
    }
  },
};

// ---------------------------------------------------------------- verificação de uma tela

async function verificarTela(navegador, porta, rota, pastaFotos) {
  const problemas = [];
  const avisos = new Set();
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await contexto.addInitScript(
    ([chave, sessao]) => {
      try {
        localStorage.setItem(chave, JSON.stringify(sessao));
      } catch {
        // sem localStorage (ex.: about:blank): nada a fazer
      }
    },
    [`sb-${PROJETO_SUPABASE}-auth-token`, sessaoFalsa()],
  );
  await contexto.route(`**/${PROJETO_SUPABASE}.supabase.co/**`, criarRespostaSupabase(avisos));
  // tempo real (WebSocket): aceita a conexão e não responde nada
  await contexto.routeWebSocket(/supabase\.co\/realtime/, () => {});

  const pagina = await contexto.newPage();
  pagina.on("pageerror", (e) => problemas.push(`erro de JavaScript: ${e.message.split("\n")[0]}`));
  pagina.on("console", (m) => {
    if (m.type() !== "error") return;
    const origem = m.location()?.url ?? "";
    // respostas de erro simuladas do Supabase (ex.: 406 de .single() sem linha) aparecem como "Failed to load resource"
    if (origem.includes(".supabase.co") && m.text().startsWith("Failed to load resource")) return;
    problemas.push(`erro no console: ${m.text().split("\n")[0].slice(0, 300)}`);
  });
  pagina.on("response", (r) => {
    const u = r.url();
    if (u.includes(`127.0.0.1:${porta}`) && r.status() >= 400) problemas.push(`arquivo do site com erro ${r.status()}: ${u}`);
  });

  const endereco = `http://127.0.0.1:${porta}${BASE}${rota.caminho === "/" ? "" : rota.caminho}`;
  const inicio = Date.now();
  try {
    const resp = await pagina.goto(endereco, { waitUntil: "load", timeout: 30_000 });
    if (resp && resp.status() >= 400) problemas.push(`a página respondeu ${resp.status()}`);
    const carregou = await pagina
      .waitForFunction(() => document.body && !/Carregando…|Carregando\.\.\./.test(document.body.innerText), null, {
        timeout: ESPERA_CARREGAR_MS,
      })
      .then(() => true)
      .catch(() => false);
    if (!carregou) problemas.push(`ficou em "Carregando…" por mais de ${ESPERA_CARREGAR_MS / 1000} s`);
    await pagina.waitForTimeout(600); // efeitos que rodam logo depois do primeiro desenho
    const texto = (await pagina.evaluate(() => document.body?.innerText ?? "")).trim();
    if (texto.length < 30) problemas.push(`página sem conteúdo (texto: "${texto.slice(0, 60)}")`);
    if (/Application error|This page could not be found|404: This page/.test(texto)) problemas.push("página de erro do Next.js");
    const final = new URL(pagina.url()).pathname.replace(BASE, "") || "/";
    if (final !== rota.caminho && !(rota.caminho === "/" && final === "/")) avisos.add(`redirecionou para ${final}`);
    if (pastaFotos)
      await pagina.screenshot({
        path: join(pastaFotos, (rota.caminho === "/" ? "inicio" : rota.chave.replace(/[^\w-]+/g, "_")) + ".png"),
        fullPage: true,
      });
    const interacao = INTERACOES[rota.caminho];
    if (interacao) {
      try {
        await interacao(pagina);
      } catch (e) {
        problemas.push(`interação falhou: ${String(e.message ?? e).split("\n")[0]}`);
      }
    }
  } catch (e) {
    problemas.push(`falha ao abrir: ${String(e.message ?? e).split("\n")[0]}`);
  }
  await contexto.close();
  return { rota, problemas, avisos: [...avisos], ms: Date.now() - inicio };
}

// ---------------------------------------------------------------- principal

async function principal() {
  let rotas = descobrirRotas();
  if (process.env.ROTAS) {
    const pedidas = process.env.ROTAS.split(",").map((r) => r.trim());
    rotas = rotas.filter((r) => pedidas.includes(r.caminho) || pedidas.includes("/" + r.chave));
  }
  const pastaFotos = process.env.FOTOS;
  if (pastaFotos) mkdirSync(pastaFotos, { recursive: true });

  const porta = await portaLivre(Number(process.env.PORTA_TELAS ?? 3100));
  console.log(`Subindo o site em http://127.0.0.1:${porta}${BASE} (usuário de teste ${EU})…`);
  const servidor = await subirServidor(porta);
  const navegador = await chromium.launch();
  const resultados = [];
  try {
    for (const rota of rotas) {
      const r = await verificarTela(navegador, porta, rota, pastaFotos);
      resultados.push(r);
      const marca = r.problemas.length ? "FALHA" : "ok   ";
      console.log(`${marca} ${rota.caminho.padEnd(52)} ${String(r.ms).padStart(5)} ms`);
      for (const p of r.problemas) console.log(`        - ${p}`);
      for (const a of r.avisos) console.log(`        · ${a}`);
    }
  } finally {
    await navegador.close();
    servidor.kill();
  }
  const falhas = resultados.filter((r) => r.problemas.length);
  console.log(`\n${resultados.length - falhas.length} de ${resultados.length} telas ok.`);
  if (falhas.length) {
    console.log(`Telas com problema: ${falhas.map((f) => f.rota.caminho).join(", ")}`);
    process.exitCode = 1;
  }
}

principal().catch((e) => {
  console.error(e.message ?? e);
  process.exitCode = 1;
});
