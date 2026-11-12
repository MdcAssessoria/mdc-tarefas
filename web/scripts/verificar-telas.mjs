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
//   TELA=celular            abre as telas na largura de um celular (390 px) em vez de 1280 px
//   LARGURA_TELA=1440       largura do computador (padrão 1280 px)
//   ACESSIBILIDADE=1        roda o axe-core (WCAG 2.2 AA) em cada tela e, no celular, mede alvos de toque < 44 px
//                           e campos com letra < 16 px; mostra um resumo no fim (=detalhe lista cada elemento)
//
// Como funciona:
//   - As rotas saem das pastas de src/app (cada page.tsx). Rotas com [id] usam os ids de IDS_EXEMPLO em
//     scripts/telas/dados-exemplo.mjs; rota nova com parâmetro sem id de exemplo faz o script falhar.
//   - Uma sessão falsa é gravada no localStorage antes de a página abrir, e toda requisição ao Supabase
//     (*.supabase.co) é respondida com os dados de scripts/telas/dados-exemplo.mjs. Nada sai para o banco real.
//   - Algumas telas têm cliques extras (abrir janela, trocar aba) em INTERACOES, mais abaixo. A janela "Novo contrato"
//     é medida em 1366×768 e 1920×1080 (ou no celular): botão principal à vista, nada rolando de lado, colunas.
//   - Requisito: pacote `playwright` com o Chromium já instalado na máquina (aqui ele é global). Este script
//     não roda `playwright install`.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EU, IDS_EXEMPLO, RPCS, TABELAS, USUARIO, XML_EXEMPLO } from "./telas/dados-exemplo.mjs";
import { importarEmLote } from "./telas/interacoes-importacao.mjs";
import { trocarPeriodo } from "./telas/interacoes-periodo.mjs";
import { interacoesPortal } from "./telas/interacoes-portal.mjs";

const LEDGRA_LINK_CADASTROS = {
  titulares: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      documento: "48140121000165",
      razao_social: "MDC ASSESSORIA LTDA",
      autoriza_cobranca: true,
      autoriza_extrato: true,
      contas: [
        {
          id: "7d1b6f2e-2222-4a3c-9d1e-0000000000bb",
          codigo_compe: "033",
          banco: "Santander",
          agencia: "1234",
          conta: "130001234",
          conta_dv: "5",
          apelido: "Santander MDC",
          ambiente: "producao",
          status: "ativa",
          produtos_ativos: ["cobranca", "pix"],
        },
      ],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      documento: "45723174000110",
      razao_social: "GRUPO GREENCORE LTDA",
      autoriza_cobranca: true,
      autoriza_extrato: false,
      contas: [],
    },
  ],
  certificados: [
    {
      id: "c1",
      titular_id: "11111111-1111-4111-8111-111111111111",
      tipo: "icp_a1_ecnpj",
      apelido: "e-CNPJ MDC 2026",
      valido_ate: "2027-05-10T00:00:00Z",
      dias_para_vencer: 182,
      situacao: "ok",
      status: "ativo",
    },
  ],
};

const WEB = fileURLToPath(new URL("..", import.meta.url));
const BASE = "/hub-mdc";
const PROJETO_SUPABASE = "bulqqdgfrrpqquqvjjfa";
const ESPERA_CARREGAR_MS = 10_000;
/** Resumo da acessibilidade (ACESSIBILIDADE=1): regra → { telas, elementos, exemplos }. */
const ACHADOS_A11Y = new Map();
function anotarA11y(regra, rota, alvos) {
  if (!alvos.length) return;
  const a = ACHADOS_A11Y.get(regra) ?? { telas: new Set(), elementos: 0, exemplos: [] };
  a.telas.add(rota);
  a.elementos += alvos.length;
  for (const x of alvos) if (a.exemplos.length < 400) a.exemplos.push(`${rota}: ${x}`);
  ACHADOS_A11Y.set(regra, a);
}
async function medirAcessibilidade(pagina, rota, celular) {
  const caminhoAxe = require.resolve("axe-core/axe.min.js");
  await pagina.addScriptTag({ path: caminhoAxe });
  const r = await pagina.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
    return res.violations.map((v) => ({
      id: v.id,
      alvos: v.nodes.map((n) => n.target.join(" ") + (n.any?.[0]?.message ? ` — ${n.any[0].message}` : "")),
    }));
  });
  for (const v of r) anotarA11y(v.id, rota, v.alvos);
  // botão cortado: o texto não cabe (rola por dentro) ou passa da borda direita da tela
  const cortados = await pagina.evaluate(() =>
    [...document.querySelectorAll(".btn, .btn-primario, .btn-azul, .btn-perigo, button")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return false;
        const fora = b.right > document.documentElement.clientWidth + 1;
        const apertado = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible";
        const cortadoPeloPai = (() => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const st = getComputedStyle(p);
            if (st.overflowX === "hidden" || st.overflow === "hidden") {
              const pb = p.getBoundingClientRect();
              return b.right > pb.right + 1 || b.left < pb.left - 1;
            }
          }
          return false;
        })();
        return fora || apertado || cortadoPeloPai;
      })
      .map((el) => `"${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}"`),
  );
  anotarA11y("botao-cortado", rota, cortados);
  if (celular) {
    const m = await pagina.evaluate(() => {
      const visivel = (el) => {
        const b = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && st.visibility !== "hidden" && st.display !== "none";
      };
      const nome = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 40);
      const pequenos = [
        ...document.querySelectorAll("a[href], button, [role=button], input[type=checkbox], input[type=radio], select, summary"),
      ]
        .filter(visivel)
        .filter((el) => !el.closest("[aria-hidden=true]"))
        .filter((el) => {
          const b = el.getBoundingClientRect();
          // link dentro de texto corrido não precisa de 44 px (exceção da WCAG 2.5.8)
          if (el.tagName === "A" && getComputedStyle(el).display === "inline") return false;
          return b.width < 44 || b.height < 44;
        })
        .map((el) => {
          const b = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()} "${nome(el)}" ${Math.round(b.width)}×${Math.round(b.height)}`;
        });
      const letras = [
        ...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]), select, textarea"),
      ]
        .filter(visivel)
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.tagName.toLowerCase()} "${nome(el)}" ${getComputedStyle(el).fontSize}`);
      return { pequenos, letras };
    });
    anotarA11y("alvo-de-toque-menor-que-44px", rota, m.pequenos);
    anotarA11y("campo-com-letra-menor-que-16px", rota, m.letras);
  }
}

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
        // a chave é o caminho sem os grupos "(x)", que não entram no endereço (ex.: "(hub)/societario/[id]" → "societario/[id]")
        const chave = relative(app, pasta)
          .split(sep)
          .filter((p) => p && !/^\(.*\)$/.test(p))
          .join("/");
        rotas.push(chave);
      }
    }
  };
  andar(app);
  return rotas.sort().map((chave) => {
    const partes = chave.split("/").filter(Boolean);
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
    if (p.startsWith("/functions/v1/")) {
      // Contratos › Ledgra Link (064): cadastros de exemplo (empresa pronta e empresa no meio do caminho)
      const corpo = p.endsWith("/ledgra-link") ? (req.postDataJSON?.() ?? {}) : {};
      if (corpo?.acao === "cadastros") return json(200, LEDGRA_LINK_CADASTROS);
      return json(200, {});
    }

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
      // paginação (.range / .limit): respeita offset e limit, como o Supabase de verdade
      const inicio = Number(url.searchParams.get("offset") ?? 0);
      const qtd = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : linhas.length;
      const pagina = linhas.slice(inicio, inicio + qtd);
      return json(200, pagina, {
        "content-range": pagina.length ? `${inicio}-${inicio + pagina.length - 1}/${linhas.length}` : `*/${linhas.length}`,
      });
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
 * "Ver caminho": clica no botão dentro de `onde` (linha, cartão ou janela), espera a árvore com o texto `esperado`,
 * confere que a página não rola na horizontal, fotografa e (com `pdf`) baixa o PDF. Deixa a janela aberta.
 */
async function abrirCaminho(pagina, onde, titulo, esperado, foto, nome, pdf = false) {
  await onde.getByRole("button", { name: "Ver caminho" }).first().click();
  const janela = pagina.getByRole("dialog", { name: new RegExp(`^Caminho · ${titulo}`) });
  await janela.waitFor({ timeout: 3000 });
  for (const t of esperado) await janela.getByText(t, { exact: false }).first().waitFor({ timeout: 5000 });
  const focoDentro = await janela.evaluate((d) => d.contains(document.activeElement));
  if (!focoDentro) throw new Error(`o foco não foi para dentro da janela "Ver caminho" (${titulo})`);
  const larga = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (larga) throw new Error(`a janela "Ver caminho" (${titulo}) fez a página rolar na horizontal`);
  await pagina.waitForTimeout(200);
  await foto(`ver-caminho-${nome}`);
  if (pdf) {
    const [baixado] = await Promise.all([
      pagina.waitForEvent("download", { timeout: 10_000 }),
      janela.getByRole("button", { name: "Baixar PDF" }).click(),
    ]);
    if (!/^Caminho-.*\.pdf$/.test(baixado.suggestedFilename()))
      throw new Error(`o PDF do caminho saiu com nome estranho: ${baixado.suggestedFilename()}`);
    if (process.env.FOTOS)
      await baixado.saveAs(join(process.env.FOTOS, `ver-caminho-${nome}${process.env.TELA === "celular" ? "-celular" : ""}.pdf`));
  }
  return janela;
}

/** Medidas das janelas largas, mostradas no fim da verificação (quanto o corpo ainda rola por dentro). */
const MEDIDAS_JANELAS = [];

/**
 * Janela de formulário longa (docs/08-convencoes.md, 8.3.1): abre "Novo contrato" (a receber, com o resumo do mês),
 * fotografa só a tela visível e confere que o botão principal aparece sem rolar a página, que nada rola de lado, que a
 * janela cabe na altura da tela e que, no computador, as duas colunas ficam lado a lado (no celular, uma embaixo da
 * outra, com letra legível). `nome` vai na foto e nas medidas (ex.: "1366x768").
 */
async function medirNovoContrato(pagina, foto, nome) {
  await pagina.getByRole("button", { name: "Novo contrato", exact: true }).click();
  const janela = pagina.getByRole("dialog", { name: "Novo contrato" });
  await janela.waitFor({ timeout: 3000 });
  await janela.getByLabel("Nome do contrato").fill("Honorários mensais");
  await janela.getByLabel("Valor mensal (R$)").fill("1.500,00");
  await janela.getByText("o HUB gera", { exact: false }).waitFor({ timeout: 3000 });
  await pagina.waitForTimeout(200);
  await foto(`janela-${nome}`, { soTela: true });
  const m = await janela.evaluate((d) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const caixa = d.getBoundingClientRect();
    const botao = [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cadastrar contrato");
    const rb = botao?.getBoundingClientRect();
    const meio = rb && document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
    const corpo = d.querySelector("[data-corpo-janela]") ?? d;
    // títulos das etapas com número desenhado (TituloEtapa): procura pelo fim do texto
    const legenda = (t) => [...d.querySelectorAll("legend")].find((l) => l.textContent.trim().endsWith(t))?.closest("fieldset");
    const vig = legenda("O contrato: quem e o quê")?.getBoundingClientRect();
    const val = legenda("Valor e contas do mês")?.getBoundingClientRect();
    const entrada = d.querySelector("input:not([type=checkbox]):not([type=radio])");
    return {
      vw,
      vh,
      larguraJanela: Math.round(caixa.width),
      alturaJanela: Math.round(caixa.height),
      cabeNaAltura: caixa.top >= 0 && caixa.bottom <= vh + 1,
      botaoAVista: !!rb && rb.top >= 0 && rb.bottom <= vh && rb.left >= 0 && rb.right <= vw && !!meio && botao.contains(meio),
      paginaRolaDeLado: document.documentElement.scrollWidth - vw,
      janelaRolaDeLado: corpo.scrollWidth - corpo.clientWidth,
      corpoRola: corpo.scrollHeight - corpo.clientHeight,
      ladoALado: !!vig && !!val && val.left > vig.right - 1 && val.top < vig.bottom,
      umaColuna: !!vig && !!val && Math.abs(val.left - vig.left) < 2,
      letra: entrada ? parseFloat(getComputedStyle(entrada).fontSize) : 0,
    };
  });
  MEDIDAS_JANELAS.push(
    `Novo contrato ${nome}: janela ${m.larguraJanela}×${m.alturaJanela} px numa tela ${m.vw}×${m.vh}; ` +
      (m.corpoRola > 0 ? `o corpo ainda rola ${m.corpoRola} px por dentro` : "cabe inteira, sem rolar"),
  );
  if (!m.botaoAVista) throw new Error(`"Cadastrar contrato" não fica à vista sem rolar (${nome})`);
  if (!m.cabeNaAltura) throw new Error(`a janela "Novo contrato" passa da altura da tela (${nome})`);
  if (m.paginaRolaDeLado > 1) throw new Error(`a janela "Novo contrato" fez a página rolar ${m.paginaRolaDeLado} px de lado (${nome})`);
  if (m.janelaRolaDeLado > 1) throw new Error(`o corpo da janela "Novo contrato" rola ${m.janelaRolaDeLado} px de lado (${nome})`);
  if (nome === "celular") {
    if (!m.umaColuna) throw new Error('no celular a janela "Novo contrato" deveria ter uma coluna só');
    if (m.larguraJanela > m.vw) throw new Error('no celular a janela "Novo contrato" é mais larga que a tela');
    if (m.letra < 14) throw new Error(`no celular a letra dos campos ficou com ${m.letra} px (mínimo 14)`);
  } else if (!m.ladoALado) throw new Error(`no computador a janela "Novo contrato" deveria ter duas colunas lado a lado (${nome})`);
  // Cliente: ao clicar, a lista traz a carteira da MDC e o "+ Cadastrar novo" (com busca na Receita)
  const campoCliente = janela.getByRole("combobox", { name: "Cliente" });
  await campoCliente.click();
  const lista = janela.getByRole("listbox");
  await lista.getByText("Carteira MDC", { exact: false }).first().waitFor({ timeout: 3000 });
  await foto(`janela-${nome}-cliente`, { soTela: true });
  await lista.getByRole("button", { name: /Cadastrar novo cliente/ }).click();
  const nova = pagina.getByRole("dialog", { name: "Novo cliente" });
  await nova.getByRole("button", { name: "Buscar dados" }).waitFor({ timeout: 3000 });
  await foto(`janela-${nome}-novo-cliente`, { soTela: true });
  await nova
    .getByRole("button", { name: "Voltar" })
    .click({ timeout: 4000 })
    .catch((e) => {
      throw new Error(`Novo cliente: Voltar não respondeu (${e.message.split("\n")[0]})`);
    });
  await nova.waitFor({ state: "detached", timeout: 3000 });
  await campoCliente.click({ timeout: 4000 }).catch((e) => {
    throw new Error(`campo Cliente não respondeu ao voltar (${e.message.split("\n")[0]})`);
  });
  await lista
    .getByRole("option")
    .first()
    .getByRole("button")
    .click({ timeout: 4000 })
    .catch((e) => {
      throw new Error(`escolher da lista não respondeu (${e.message.split("\n")[0]})`);
    });
  await janela.getByRole("button", { name: "Trocar" }).waitFor({ timeout: 3000 });
  await pagina.keyboard.press("Escape");
  await janela.waitFor({ state: "detached", timeout: 3000 });
}

/**
 * Cliques extras depois que a tela abre, para cobrir o que só aparece com interação (janelas, abas).
 * A chave é o caminho da rota; a função recebe (página, foto) e lança erro quando algo não se comporta como esperado.
 * foto("sufixo") salva uma captura do momento quando a verificação roda com FOTOS.
 */
const INTERACOES = {
  // Início: concluir uma tarefa da fila mostra "Desfazer" (UX-05)
  "/": async (p, foto) => {
    await p
      .getByRole("button", { name: /^Concluir / })
      .first()
      .click();
    await p.getByRole("button", { name: "Desfazer" }).waitFor({ timeout: 3000 });
    await foto("concluida-desfazer", { soTela: true });
    // menu lateral ajustável (computador): arrastar a borda alarga e guarda; duplo clique volta ao padrão
    const alca = p.getByRole("separator", { name: "Largura do menu" });
    if (await alca.isVisible()) {
      const menu = p.locator("aside").first();
      const antes = (await menu.boundingBox()).width;
      const b = await alca.boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + 200);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width / 2 + 100, b.y + 200, { steps: 5 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const depois = (await menu.boundingBox()).width;
      if (Math.abs(depois - antes - 100) > 4) throw new Error(`menu lateral: arrastar 100 px mudou ${depois - antes} px`);
      const salvo = await p.evaluate(() => localStorage.getItem("hub-mdc:menu-largura"));
      if (salvo !== String(Math.round(depois))) throw new Error(`menu lateral: largura não foi guardada (${salvo})`);
      await foto("menu-largo", { soTela: true });
      await alca.dblclick();
      await p.waitForTimeout(300);
      if (Math.abs((await menu.boundingBox()).width - 248) > 2) throw new Error("menu lateral: duplo clique não voltou ao padrão");
    }
  },
  // Ledgra Link: a mensalidade com boleto/Pix emitido abre a janela com o Pix e a linha digitável
  "/licencas/cobrancas": (p) => abrirEFecharModal(p, "Ver boleto/Pix", "Boleto/Pix da mensalidade"),
  "/vencimentos": (p) => abrirEFecharModal(p, "Novo vencimento", "Novo vencimento"),
  "/financeiro/bancos": (p) => abrirEFecharModal(p, "Nova conta", "Nova conta bancária"),
  // conta a pagar com "+ Nova categoria": a janela da categoria abre por cima e fecha voltando para a conta
  "/financeiro/pagar": async (p, foto) => {
    await p.getByRole("button", { name: "Nova conta a pagar", exact: true }).click();
    const conta = p.getByRole("dialog", { name: "Nova conta a pagar" });
    await conta.waitFor({ timeout: 3000 });
    await foto("nova-conta", { soTela: true });
    await conta.getByRole("button", { name: "Nova categoria" }).click();
    const cat = p.getByRole("dialog", { name: "Nova categoria de despesa" });
    await cat.waitFor({ timeout: 3000 });
    await cat.getByLabel("Conta contábil").waitFor({ timeout: 3000 });
    await foto("nova-categoria");
    await cat.getByRole("button", { name: "Voltar" }).click();
    await cat.waitFor({ state: "detached", timeout: 3000 });
    await conta.waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await conta.waitFor({ state: "detached", timeout: 3000 });
    // "Ver caminho" da 2ª parcela do pedido de compra: sobe até o pedido e mostra a nota, o estorno e o que falta
    const linha = p.getByRole("row").filter({ hasText: "Pedido de compra nº 1 · Imobiliária Centro Ltda (2/2)" });
    const arvore = await abrirCaminho(
      p,
      linha,
      "Conta a pagar",
      ["Pedido de compra", "Nota fiscal de entrada", "Pagamento estornado", "O que falta"],
      foto,
      "conta-a-pagar",
    );
    // abrir o histórico de uma conta de dentro da árvore e voltar
    await arvore
      .getByRole("button", { name: /^Ver pagamentos/ })
      .first()
      .click();
    const hist = p.getByRole("dialog", { name: /Histórico|Pagamentos/ });
    await hist.waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await p.getByRole("dialog", { name: /^Caminho · Conta a pagar/ }).waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await arvore.waitFor({ state: "detached", timeout: 3000 });
  },
  "/financeiro/receber": (p) => abrirEFecharModal(p, "Nova conta a receber", "Nova conta a receber"),
  "/financeiro/movimento": (p) => abrirEFecharModal(p, "Saída", "Nova conta a pagar"),
  "/financeiro/transferencias": (p) => abrirEFecharModal(p, "Nova transferência", "Transferir entre contas"),
  // Conciliação: as sugestões aparecem ao lado da lista; a janela larga abre em "Contas do HUB" e em "Criar lançamento"
  "/financeiro/conciliacao": async (p, foto) => {
    await p.getByText("Combina muito").first().waitFor({ timeout: 3000 });
    await p.getByRole("button", { name: "PAGAMENTO BOLETOS IMOBILIARIA CENTRO" }).click();
    await p
      .getByRole("region", { name: "Sugestões para o lançamento escolhido" })
      .getByText("a soma de 2 contas dá o valor exato")
      .waitFor({ timeout: 3000 });
    await foto("agrupado");
    await p.getByRole("button", { name: "Escolher no HUB" }).click();
    const janela = p.getByRole("dialog", { name: "Conciliar lançamento do extrato" });
    await janela.waitFor({ timeout: 3000 });
    await janela.getByRole("button", { name: "Usar esta" }).first().click();
    await janela.getByText("Bateu").waitFor({ timeout: 3000 });
    await foto("janela-hub", { soTela: true });
    await janela.getByRole("tab", { name: "Criar lançamento" }).click();
    await janela.getByLabel(/Categoria de despesa/).waitFor({ timeout: 3000 });
    await foto("janela-lancar", { soTela: true });
    const largo = await janela.evaluate((d) => d.scrollWidth - d.clientWidth);
    if (largo > 1) throw new Error(`a janela "Conciliar" rola ${largo} px de lado`);
    await janela.getByRole("button", { name: "Voltar" }).click();
    await janela.waitFor({ state: "detached", timeout: 3000 });
  },
  // cadastro: a janela abre com o campo CPF/CNPJ e o botão "Buscar dados" (Receita)
  "/cadastros/pessoas": async (p, foto) => {
    await p.getByRole("button", { name: "Novo cadastro", exact: true }).click();
    const janela = p.getByRole("dialog", { name: "Novo fornecedor ou cliente" });
    await janela.getByRole("button", { name: "Buscar dados" }).waitFor({ timeout: 3000 });
    await foto("janela-pessoas", { soTela: true });
    await p.keyboard.press("Escape");
    await janela.waitFor({ state: "detached", timeout: 3000 });
  },
  "/plano-contas/categorias": (p) => abrirEFecharModal(p, "Nova categoria", "Nova categoria"),
  "/centros-custo": (p) => abrirEFecharModal(p, "Novo centro de custo", "Novo centro de custo"),
  // painel do Financeiro: os atalhos e os primeiros passos estão lá, e o menu "Bancos" da barra abre e mostra as telas
  "/financeiro": async (p, foto) => {
    if (process.env.TELA !== "celular") {
      await p.getByRole("button", { name: /^Bancos/ }).click();
      await p.locator("header").getByRole("link", { name: "Transferências" }).waitFor({ timeout: 3000 });
      await p.waitForTimeout(250);
      await foto("menu-bancos");
      await p.keyboard.press("Escape");
    } else {
      await p.getByRole("button", { name: /Telas/ }).click();
      await p.locator("header").getByRole("link", { name: "Transferências" }).waitFor({ timeout: 3000 });
      await p.waitForTimeout(250);
      await foto("menu-telas");
    }
  },
  // relatórios: cada um dos quatro abre sem erro
  "/relatorios": async (p, foto) => {
    for (const nome of ["Realizado x previsto", "Pagas e recebidas", "Centros de custo", "Resultado de caixa"]) {
      await p.getByRole("button", { name: new RegExp(nome) }).click();
      await p.waitForTimeout(300);
      await foto(nome.toLowerCase().replace(/\W+/g, "-"));
    }
  },

  // Estoque (033): assistente em passos, cadastro rápido, importação, visão em lista e ficha do item
  "/estoque": async (p, foto) => {
    await p.getByRole("button", { name: "Novo item", exact: true }).click();
    const assistente = p.getByRole("dialog", { name: "Novo item" });
    await assistente.waitFor({ timeout: 3000 });
    await assistente.getByLabel("Nome do item").fill("Item de teste");
    for (let k = 0; k < 3; k++) await assistente.getByRole("button", { name: "Continuar", exact: true }).click();
    await assistente.getByText("Lucro por unidade").or(assistente.getByLabel("Preço de venda (R$)")).first().waitFor({ timeout: 3000 });
    await foto("assistente");
    await p.keyboard.press("Escape");
    await assistente.waitFor({ state: "detached", timeout: 3000 });
    // serviço (056): no passo 2 escolhe o tipo de serviço da LC 116 e o HUB monta o código da NFS-e
    await p.getByRole("button", { name: "Novo item", exact: true }).click();
    await assistente.waitFor({ timeout: 3000 });
    await assistente.getByRole("radio", { name: /Serviço/ }).click();
    await assistente.getByLabel("Nome do item").fill("Honorários contábeis");
    await assistente.getByRole("button", { name: "Continuar", exact: true }).click();
    const lc = assistente.getByRole("combobox", { name: /Lei Complementar 116/ });
    await lc.fill("contabil");
    await assistente.getByRole("option").filter({ hasText: "17.19" }).getByRole("button").click();
    await assistente.getByText("17.19.01").waitFor({ timeout: 3000 });
    await foto("assistente-servico");
    await p.keyboard.press("Escape");
    await assistente.waitFor({ state: "detached", timeout: 3000 });
    await abrirEFecharModal(p, "Cadastro rápido", "Cadastro rápido de item");
    await abrirEFecharModal(p, "Importar planilha", "Importar itens de uma planilha");
    await abrirEFecharModal(p, "Grupos", "Grupos de produto");
    await p.getByRole("button", { name: "Lista", exact: true }).click();
    await p.getByRole("button", { name: "Ficha", exact: true }).first().click();
    const ficha = p.getByRole("dialog", { name: /Ficha de estoque/ });
    await ficha.waitFor({ timeout: 3000 });
    await ficha.getByText("Saldo anterior").waitFor({ timeout: 5000 });
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Cartões", exact: true }).click();
  },
  "/estoque/movimentos": (p) => abrirEFecharModal(p, "Lançar movimento", "Lançar movimento de estoque"),
  "/estoque/inventario": async (p) => {
    await p.getByLabel("Quantidade contada de Parafuso sextavado 10mm").fill("318");
    await abrirEFecharModal(p, "Conferir e gravar", "Conferir o inventário");
  },
  "/estoque/posicao": async (p) => {
    await p.getByRole("button", { name: "Tinta acrílica 18L", exact: true }).click();
    await p.getByRole("dialog", { name: "Ficha de estoque · Tinta acrílica 18L" }).waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
  },
  // Pedidos (033): novo pedido com item pela busca, ver o lançado, confirmar/receber
  "/saidas": async (p, foto) => {
    await p.getByRole("button", { name: "Novo pedido", exact: true }).click();
    const editor = p.getByRole("dialog", { name: "Novo pedido de venda" });
    await editor.waitFor({ timeout: 3000 });
    await editor.getByPlaceholder(/passe o leitor de código de barras/).fill("tinta");
    await editor.getByRole("listbox").getByRole("button").first().click();
    await editor.getByText("Total R$").waitFor({ timeout: 3000 });
    await foto("novo-pedido", { soTela: true });
    await p.keyboard.press("Escape");
    await editor.waitFor({ state: "detached", timeout: 3000 });
    await p.getByRole("button", { name: "Ver", exact: true }).first().click();
    const ver = p.getByRole("dialog", { name: "Pedido de venda nº 1" });
    await ver.waitFor({ timeout: 3000 });
    // "Ver caminho" de dentro do pedido: ao fechar a árvore, volta para o pedido
    await abrirCaminho(p, ver, "Pedido de venda nº 1", ["Conta a receber", "Recebimento"], foto, "pedido-venda");
    await p.keyboard.press("Escape");
    await ver.waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await ver.waitFor({ state: "detached", timeout: 3000 });
    await abrirEFecharModal(p, "Confirmar", "Confirmar a venda nº 2");
  },
  "/entradas/compras": async (p, foto) => {
    await abrirEFecharModal(p, "Novo pedido", "Novo pedido de compra");
    await abrirEFecharModal(p, "Receber", "Receber a compra nº 2");
    // pedido de compra nº 1 → NF-e 1188 (pelo número) → 2 parcelas (1 paga, 1 estorno) → pagamentos; entrada no estoque
    const cartao = p.locator("article").filter({ hasText: "Nº 1 ·" });
    const arvore = await abrirCaminho(
      p,
      cartao,
      "Pedido de compra nº 1",
      ["Nota fiscal de entrada", "Ligada pelo número da nota", "Parcela 2/2", "Pagamento estornado", "Entrada no estoque"],
      foto,
      "pedido-compra",
      true,
    );
    await p.keyboard.press("Escape");
    await arvore.waitFor({ state: "detached", timeout: 3000 });
  },
  "/entradas": async (p, foto) => {
    await abrirEFecharModal(p, "Enviar XML", "Enviar XML de nota");
    await p.getByRole("button", { name: "Responder", exact: true }).first().click();
    const dialogo = p.getByRole("dialog", { name: "Responder à SEFAZ" });
    await dialogo.waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await dialogo.waitFor({ state: "detached", timeout: 3000 });
    // "Ver a nota": o XML guardado (Storage "fiscal") vem de XML_EXEMPLO; a janela mostra o espelho e baixa o PDF
    await p.route(/\/storage\/v1\/object\/(authenticated\/)?fiscal\//, (r) => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
      const caminho = decodeURIComponent(new URL(r.request().url()).pathname);
      const xml = Object.entries(XML_EXEMPLO).find(([k]) => caminho.endsWith(k))?.[1];
      return r.fulfill({ status: xml ? 200 : 404, headers: { ...CORS, "content-type": "application/xml" }, body: xml ?? "{}" });
    });
    // aviso da busca automática em linguagem simples; o texto técnico (IP, URL) só aparece em "Ver detalhes"
    await p.getByText("A SEFAZ Nacional não respondeu na última tentativa.", { exact: false }).waitFor({ timeout: 3000 });
    if (await p.evaluate(() => /10\.32\.144|os error|fazenda\.gov\.br/.test(document.body.innerText)))
      throw new Error("o aviso da busca mostra texto técnico (IP/URL) sem a pessoa pedir");
    if (await p.evaluate(() => /\(s\)/.test(document.querySelector("main")?.innerText ?? document.body.innerText)))
      throw new Error('a tela de notas ainda mostra plural com "(s)"');
    await p.getByText("Ver detalhes", { exact: true }).click();
    await p.getByText("os error 104", { exact: false }).waitFor({ timeout: 3000 });
    await foto("aviso-detalhes");
    await p.getByText("Ver detalhes", { exact: true }).click();
    // ações de cada nota à vista: "Ver a nota" e "Baixar PDF" só com ícone, área de toque de 40 px, sem sair do quadro
    const medidas = await p.evaluate(() => {
      const quadro = document.querySelector(".quadro-tabela");
      const q = quadro.getBoundingClientRect();
      return {
        rolaDeLado: quadro.scrollWidth - quadro.clientWidth,
        botoes: [
          ...quadro.querySelectorAll('button[aria-label="Ver a nota"], button[aria-label="Baixar PDF"], summary[aria-label="Mais ações"]'),
        ].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            nome: b.getAttribute("aria-label"),
            titulo: b.getAttribute("title"),
            l: r.width,
            a: r.height,
            fora: Math.max(r.right - q.right, q.left - r.left),
          };
        }),
      };
    });
    if (!medidas.botoes.some((b) => b.nome === "Ver a nota") || !medidas.botoes.some((b) => b.nome === "Baixar PDF"))
      throw new Error('faltam os botões "Ver a nota" / "Baixar PDF" na lista');
    for (const b of medidas.botoes) {
      if (b.l < 40 || b.a < 40) throw new Error(`o botão "${b.nome}" tem ${Math.round(b.l)}×${Math.round(b.a)} px (mínimo 40×40)`);
      if (!b.titulo) throw new Error(`o botão "${b.nome}" está sem dica (title)`);
      if (b.fora > 1) throw new Error(`o botão "${b.nome}" sai ${Math.round(b.fora)} px da borda da lista`);
    }
    if (medidas.rolaDeLado > 1) throw new Error(`a lista de notas rola ${medidas.rolaDeLado} px na horizontal (coluna de ações cortada)`);
    // "Baixar PDF" da linha baixa direto, sem abrir janela
    {
      const linha = p.getByRole("row").filter({ hasText: "NF-e 1188" });
      const [baixado] = await Promise.all([
        p.waitForEvent("download", { timeout: 10_000 }),
        linha.getByRole("button", { name: "Baixar PDF" }).click(),
      ]);
      if (!/\.pdf$/.test(baixado.suggestedFilename()))
        throw new Error(`o PDF da linha saiu com nome estranho: ${baixado.suggestedFilename()}`);
      if (await p.getByRole("dialog").count()) throw new Error('"Baixar PDF" da linha abriu uma janela');
    }
    for (const [nota, sigla, nome, pelo] of [
      ["NF-e 1188", "DANFE", "nfe", "icone"],
      ["NFS-e 52", "DANFSe", "nfse", "menu"],
    ]) {
      const linha = p.getByRole("row").filter({ hasText: nota });
      if (pelo === "menu") {
        await linha.getByLabel("Mais ações").click();
        await p.locator(".menu-acoes").getByRole("button", { name: "Ver a nota", exact: true }).click();
      } else await linha.getByRole("button", { name: "Ver a nota", exact: true }).click();
      const janela = p.getByRole("dialog", { name: new RegExp(`^${nota}`) });
      await janela.waitFor({ timeout: 3000 });
      await janela.getByText(sigla, { exact: true }).waitFor({ timeout: 5000 });
      await janela.getByText("não substitui o documento oficial", { exact: false }).first().waitFor({ timeout: 3000 });
      const larga = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (larga) throw new Error(`a janela "Ver a nota" (${nota}) fez a página rolar na horizontal`);
      await foto(`ver-nota-${nome}`);
      const [baixado] = await Promise.all([
        p.waitForEvent("download", { timeout: 10_000 }),
        janela.getByRole("button", { name: "Baixar PDF" }).click(),
      ]);
      if (!/\.pdf$/.test(baixado.suggestedFilename()))
        throw new Error(`o PDF da nota saiu com nome estranho: ${baixado.suggestedFilename()}`);
      if (process.env.FOTOS)
        await baixado.saveAs(join(process.env.FOTOS, `entradas-ver-nota-${nome}${process.env.TELA === "celular" ? "-celular" : ""}.pdf`));
      await p.keyboard.press("Escape");
      await janela.waitFor({ state: "detached", timeout: 3000 });
    }
    // "Ver caminho" da NF-e 1188: sobe até o pedido de compra que cita a nota; "Ver a nota" abre o espelho e volta
    const linha = p.getByRole("row").filter({ hasText: "NF-e 1188" });
    await linha.getByRole("button", { name: "Mais ações" }).or(linha.locator("summary")).first().click();
    const arvore = await abrirCaminho(p, p.locator(".menu-acoes"), "NF-e nº 1188", ["Pedido de compra", "Você abriu daqui"], foto, "nota");
    await arvore
      .getByRole("button", { name: /^Ver a nota/ })
      .first()
      .click();
    const espelho = p.getByRole("dialog", { name: /^NF-e 1188/ });
    await espelho.getByText("DANFE", { exact: true }).waitFor({ timeout: 5000 });
    await p.keyboard.press("Escape");
    await p.getByRole("dialog", { name: /^Caminho · NF-e nº 1188/ }).waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await arvore.waitFor({ state: "detached", timeout: 3000 });
  },
  "/entradas/lancar": async (p, foto) => {
    await p.getByRole("button", { name: "Lançar", exact: true }).first().click();
    await p.getByRole("heading", { name: "O que é esta nota?" }).waitFor({ timeout: 3000 });
    // 058: com pedido de compra do fornecedor em aberto, a tela pergunta se a nota é dele (e mostra "não tem pedido")
    await p.getByRole("heading", { name: "Esta nota é de um pedido de compra?" }).waitFor({ timeout: 3000 });
    await p.getByRole("radio", { name: /Pedido nº 7/ }).check();
    await p.getByText("As contas a pagar são as do pedido de compra nº 7").waitFor({ timeout: 3000 });
    await foto("lancar-nota-pedido");
    await p.getByRole("button", { name: "Voltar à lista" }).click();
    for (const aba of await p.getByRole("tab").all()) {
      await aba.click();
      if ((await aba.getAttribute("aria-selected")) !== "true") throw new Error(`a aba "${await aba.innerText()}" não ficou selecionada`);
      await p.waitForTimeout(300);
    }
  },
  // Contratos (041): novo contrato com "+ Nova categoria", reajuste pendente (índice → novo valor) e a ficha com as abas
  "/contratos": async (p, foto) => {
    // "Mais ações" da 1ª linha (09-10/11/2026): o menu abre solto na tela, inteiro à vista, sem ser cortado nem coberto
    {
      const ultima = p.locator('summary[aria-label="Mais ações"]').first();
      await ultima.click();
      const painel = p.locator(".menu-acoes").last();
      const item = painel.getByRole("button").last();
      await item.waitFor({ timeout: 3000 });
      const caixa = await item.boundingBox();
      const vp = p.viewportSize();
      if (!caixa || caixa.y < 0 || caixa.y + caixa.height > vp.height)
        throw new Error("o menu Mais ações da última linha ficou cortado ou fora da tela");
      // nada por cima do menu (a coluna de ações fixa das outras linhas cobria o menu, 10/11/2026)
      const porCima = await p.evaluate(
        ([x, y]) => !document.elementFromPoint(x, y)?.closest(".menu-acoes"),
        [caixa.x + caixa.width / 2, caixa.y + caixa.height / 2],
      );
      if (porCima) throw new Error("algo da tabela ficou por cima do menu Mais ações");
      // e o primeiro item (perto das linhas de baixo) também à vista
      const primeiro = await painel.getByRole("button").first().boundingBox();
      const cobreTopo = await p.evaluate(
        ([x, y]) => !document.elementFromPoint(x, y)?.closest(".menu-acoes"),
        [primeiro.x + primeiro.width / 2, primeiro.y + primeiro.height / 2],
      );
      if (cobreTopo) throw new Error("a linha de baixo cobre o primeiro item do menu Mais ações");
      await foto("menu-acoes");
      await p.keyboard.press("Escape");
      await item.waitFor({ state: "hidden", timeout: 3000 });
    }
    // janela larga: no notebook (1366×768) e no monitor (1920×1080) o botão fica à vista; no celular, uma coluna
    if (process.env.TELA === "celular") await medirNovoContrato(p, foto, "celular");
    else {
      const antes = p.viewportSize();
      for (const [l, a] of [
        [1366, 768],
        [1920, 1080],
      ]) {
        await p.setViewportSize({ width: l, height: a });
        await medirNovoContrato(p, foto, `${l}x${a}`);
      }
      await p.setViewportSize(antes);
    }
    await p.getByRole("button", { name: "Novo contrato", exact: true }).click();
    const novo = p.getByRole("dialog", { name: "Novo contrato" });
    await novo.waitFor({ timeout: 3000 });
    await novo.getByRole("radio", { name: /A pagar/ }).click();
    await novo.getByLabel("Nome do contrato").fill("Aluguel da sala");
    await novo.getByLabel("Valor mensal (R$)").fill("2.500,00");
    await novo.getByText("Todo dia 1º o HUB lança").waitFor({ timeout: 3000 });
    await foto("novo-contrato");
    await novo.getByRole("button", { name: "Nova categoria" }).click();
    const cat = p.getByRole("dialog", { name: "Nova categoria de despesa" });
    await cat.waitFor({ timeout: 3000 });
    await cat.getByRole("button", { name: "Voltar" }).click();
    await cat.waitFor({ state: "detached", timeout: 3000 });
    await p.keyboard.press("Escape");
    await novo.waitFor({ state: "detached", timeout: 3000 });
    // contrato a receber (043): dia de gerar, "O que enviar" com 4 opções e por onde enviar
    await p.getByRole("button", { name: "Novo contrato", exact: true }).click();
    const rec = p.getByRole("dialog", { name: "Novo contrato" });
    await rec.waitFor({ timeout: 3000 });
    await rec.getByRole("radio", { name: /A receber/ }).click();
    await rec.getByLabel("Nome do contrato").fill("Honorários mensais");
    await rec.getByLabel("Valor mensal (R$)").fill("1.500,00");
    await rec.getByLabel("Gerar todo dia").fill("25");
    await rec.getByLabel("Vence todo dia").fill("5");
    const opcoes = rec.getByRole("radiogroup", { name: "O que enviar ao cliente" }).getByRole("radio");
    if ((await opcoes.count()) !== 4) throw new Error(`"O que enviar" deveria ter 4 opções, tem ${await opcoes.count()}`);
    await rec.getByRole("radio", { name: /^Nota fiscal \+ fatura \+ boleto/ }).click();
    // tipo de serviço pela lista da LC 116 (056): 17.19 Contabilidade → código 17.19.01 e a descrição preenchida
    await rec.getByRole("combobox", { name: /Tipo de serviço/ }).fill("17.19");
    await rec.getByRole("option").filter({ hasText: "Contabilidade" }).getByRole("button").click();
    await rec.getByText("17.19.01").waitFor({ timeout: 3000 });
    // 059: licença de um sistema — o "Sistema vendido" lista os ativos (Ledgra e EXato; o inativo não)
    await rec.getByLabel("Sistema vendido").selectOption({ label: "EXato" });
    if ((await rec.getByLabel("Sistema vendido").locator("option").count()) !== 3)
      throw new Error("Sistema vendido deveria ter Nenhum + 2 ativos");
    await rec.getByRole("checkbox", { name: /E-mail/ }).check();
    await rec.getByRole("checkbox", { name: /Portal do Cliente/ }).check();
    await rec.getByText("Envio por e-mail e WhatsApp: aguardando configuração").waitFor({ timeout: 3000 });
    // 048: vence no mesmo mês; gerar depois do vencimento avisa na hora; com boleto, escolhe o banco (Itaú ou Santander)
    await rec.getByText("A fatura vence no mesmo mês em que é gerada: gere até o dia 5.").waitFor({ timeout: 3000 });
    await rec.getByLabel("Gerar todo dia").fill("1");
    await rec.getByText("Vence no mesmo mês da fatura").waitFor({ timeout: 3000 });
    await rec.getByRole("radiogroup", { name: "Banco do boleto" }).getByRole("radio", { name: /Itaú/ }).click();
    await rec.getByText("Todo dia 1 o HUB gera").waitFor({ timeout: 3000 });
    await foto("novo-contrato-fatura");
    await p.keyboard.press("Escape");
    await rec.waitFor({ state: "detached", timeout: 3000 });
    await p.getByRole("button", { name: "Reajustar", exact: true }).first().click();
    const reaj = p.getByRole("dialog", { name: /^Reajuste · / });
    await reaj.waitFor({ timeout: 3000 });
    await reaj.getByText("Novo valor").waitFor({ timeout: 5000 });
    await foto("reajuste");
    await p.keyboard.press("Escape");
    await reaj.waitFor({ state: "detached", timeout: 3000 });
    await p.getByRole("button", { name: "Aluguel da sala", exact: true }).click();
    const ficha = p.getByRole("dialog", { name: "Aluguel da sala" });
    await ficha.waitFor({ timeout: 3000 });
    for (const aba of ["Contas lançadas", "Anexos", "Histórico"]) {
      await ficha.getByRole("tab", { name: aba }).click();
      await p.waitForTimeout(300);
    }
    await ficha.getByText("Arquivo anexado").waitFor({ timeout: 3000 });
    await foto("ficha");
    // "Ver caminho" da ficha: contrato → conta do mês; ao fechar, volta para a ficha
    await abrirCaminho(p, ficha, "Contrato fixo: Aluguel da sala", ["Contrato fixo a pagar", "Conta de"], foto, "contrato");
    await p.keyboard.press("Escape");
    await p.getByRole("dialog", { name: "Aluguel da sala" }).waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
  },
  // Faturas (043): aviso de "aguardando configuração", detalhe da fatura com a fila de envio, cancelar e gerar agora
  "/contratos/faturas": async (p, foto) => {
    await p.getByText("por e-mail/WhatsApp aguardando configuração.", { exact: false }).waitFor({ timeout: 3000 });
    await p.getByText("1 envio não saiu.").waitFor({ timeout: 3000 });
    // boleto (049): a fatura com boleto do Itaú mostra a linha digitável para copiar
    await p
      .getByRole("button", { name: /^Ver o boleto da fatura / })
      .first()
      .click();
    const boleto = p.getByRole("dialog", { name: /^Boleto · Fatura / });
    await boleto.waitFor({ timeout: 3000 });
    await boleto.getByText("Linha digitável").waitFor({ timeout: 3000 });
    await foto("boleto");
    await p.keyboard.press("Escape");
    await boleto.waitFor({ state: "detached", timeout: 3000 });
    await p
      .getByRole("button", { name: /^Ver a fatura / })
      .first()
      .click();
    const ver = p.getByRole("dialog", { name: /^Fatura \d{4}\/\d{5}$/ });
    await ver.waitFor({ timeout: 3000 });
    await ver.getByText("Envio ao cliente").waitFor({ timeout: 3000 });
    await foto("fatura");
    // envio (053): o WhatsApp que falhou mostra o motivo e "Reenviar" pede o motivo do reenvio
    if (await ver.getByRole("button", { name: "Reenviar" }).count()) {
      await ver.getByText("O HUB parou de tentar", { exact: false }).first().waitFor({ timeout: 3000 });
      await ver.getByRole("button", { name: "Reenviar" }).first().click();
      const reenviar = p.getByRole("dialog", { name: /^Reenviar a fatura / });
      await reenviar.waitFor({ timeout: 3000 });
      await reenviar.getByText("Motivo do reenvio").waitFor({ timeout: 3000 });
      await foto("reenviar");
      await reenviar.getByRole("button", { name: "Voltar" }).click();
      await ver.waitFor({ timeout: 3000 });
    }
    await p.keyboard.press("Escape");
    await ver.waitFor({ state: "detached", timeout: 3000 });
    await p
      .getByRole("button", { name: /^Cancelar a fatura / })
      .first()
      .click();
    const canc = p.getByRole("dialog", { name: /^Cancelar a fatura / });
    await canc.waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await canc.waitFor({ state: "detached", timeout: 3000 });
    await abrirEFecharModal(p, "Gerar fatura agora", "Gerar fatura agora");
    // "Novo cliente" (09/11/2026): da janela Gerar fatura agora abre o Novo contrato; Voltar retorna à janela de origem
    await p.getByRole("button", { name: "Gerar fatura agora", exact: true }).click();
    const gerarJ = p.getByRole("dialog", { name: "Gerar fatura agora" });
    await gerarJ.waitFor({ timeout: 3000 });
    await gerarJ.getByRole("button", { name: "Novo cliente" }).click();
    const novoK = p.getByRole("dialog", { name: "Novo contrato" });
    await novoK.waitFor({ timeout: 3000 });
    await foto("fatura-novo-cliente");
    await novoK.getByRole("button", { name: "Voltar" }).click();
    await gerarJ.waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await gerarJ.waitFor({ state: "detached", timeout: 3000 });
    // NFS-e (046): aviso do ambiente de teste, situação da nota com o motivo da recusa, conferência e "Ver a nota"
    await p.getByText("Notas fiscais no ambiente de teste (sem valor fiscal).").waitFor({ timeout: 3000 });
    await p.getByText("Nota de teste recusada").first().waitFor({ timeout: 3000 });
    // 065: "Emitir nota" leva à nota de saída (Notas fiscais › Saída), onde ajusta e emite
    const linkEmitir = p.getByRole("link", { name: /^Emitir nota fiscal da fatura / }).first();
    if (!/\/entradas\/saida\?fatura=/.test((await linkEmitir.getAttribute("href")) ?? ""))
      throw new Error('"Emitir nota" deveria levar a Notas fiscais › Saída');
    await p.route(/\/storage\/v1\/object\/(authenticated\/)?fiscal\//, (r) => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
      const caminho = decodeURIComponent(new URL(r.request().url()).pathname);
      const xml = Object.entries(XML_EXEMPLO).find(([k]) => caminho.endsWith(k))?.[1];
      return r.fulfill({ status: xml ? 200 : 404, headers: { ...CORS, "content-type": "application/xml" }, body: xml ?? "{}" });
    });
    await p
      .getByRole("button", { name: /^Ver a nota fiscal da fatura / })
      .first()
      .click();
    const espelho = p.getByRole("dialog", { name: /NFS-e|1287/ });
    await espelho.waitFor({ timeout: 3000 });
    await espelho.getByText("1287", { exact: false }).first().waitFor({ timeout: 5000 });
    await foto("nfse-emitida");
    await p.keyboard.press("Escape");
    await espelho.waitFor({ state: "detached", timeout: 3000 });
  },
  // Notas fiscais › Saída (065): lista das notas, abrir a nota, ajustar (aparece "Salvar ajustes") e emitir
  "/entradas/saida": async (p, foto) => {
    await p.getByRole("heading", { name: "Notas fiscais de saída" }).waitFor({ timeout: 3000 });
    await p
      .getByRole("button", { name: /^Abrir e emitir a nota da fatura / })
      .first()
      .click();
    const emitir = p.getByRole("dialog", { name: /^Nota fiscal de saída · Fatura / });
    await emitir.waitFor({ timeout: 3000 });
    await emitir.getByText("Ambiente de teste (sem valor fiscal)", { exact: true }).waitFor({ timeout: 3000 });
    for (const t of ["Ajustes desta nota", "Cliente (tomador)", "17.19.01", "Recolhido no DAS", "Tentativas anteriores"])
      await emitir.getByText(t, { exact: false }).first().waitFor({ timeout: 3000 });
    await emitir.getByLabel("Texto da nota (discriminação do serviço)").fill("Honorários contábeis de novembro");
    await emitir.getByRole("button", { name: "Salvar ajustes" }).waitFor({ timeout: 3000 });
    await emitir.getByRole("button", { name: "Voltar ao texto do contrato" }).waitFor({ timeout: 3000 });
    await emitir.getByRole("button", { name: "Emitir nota de teste" }).waitFor({ timeout: 3000 });
    const larga = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (larga) throw new Error('a janela "Nota fiscal de saída" fez a página rolar na horizontal');
    await foto("nota-saida");
    await p.keyboard.press("Escape");
    await emitir.waitFor({ state: "detached", timeout: 3000 });
  },
  // Nota fiscal (NFS-e) (046): parâmetros da emissão; ir para a produção pede confirmação
  "/contratos/nota-fiscal": async (p, foto) => {
    await p.getByRole("radiogroup", { name: "Ambiente da emissão" }).waitFor({ timeout: 3000 });
    for (const t of ["NBS padrão da nota", "Tributos aproximados do Simples (%)", "Inscrição municipal", "Tipos de serviço"])
      await p.getByText(t, { exact: false }).first().waitFor({ timeout: 3000 });
    // 062: NBS só da tabela oficial (17.19 = 3 códigos) e o cálculo dos tributos aproximados pela LC 123
    const nbs = p.getByLabel("NBS padrão da nota");
    await nbs.selectOption("113022100");
    if ((await nbs.locator("option").count()) !== 4) throw new Error("NBS de 17.19 deveria listar só os 3 da tabela oficial");
    await p.getByLabel("Receita bruta dos 12 meses (RBT12)").fill("300.000,00");
    await p.getByText("sem o ISS").waitFor({ timeout: 3000 });
    await p.getByRole("button", { name: "Usar 5,49%" }).click();
    if ((await p.getByLabel("Tributos aproximados do Simples (%)").inputValue()) !== "5,49")
      throw new Error("Usar o percentual não preencheu o campo");
    await foto("nota-fiscal-nbs-simples");
    await p.getByRole("radio", { name: /^Produção \(nota com valor fiscal\)/ }).check();
    await p.getByText("Confirmo que as notas de teste deram certo").waitFor({ timeout: 3000 });
    await foto("nota-fiscal-parametros");
    // Regras fiscais (057): aba dos tipos de serviço com a lista e a janela de nova regra (LC 116, retenção, IBS/CBS)
    await p.getByRole("tab", { name: /Tipos de serviço/ }).click();
    await p.getByText("Honorários contábeis").first().waitFor({ timeout: 3000 });
    await p.getByText("Retém em municípios").first().waitFor({ timeout: 3000 });
    await foto("regras-servico");
    await p.getByRole("button", { name: "Nova regra" }).click();
    const nova = p.getByRole("dialog", { name: "Nova regra fiscal" });
    await nova.getByRole("combobox", { name: /Lei Complementar 116/ }).fill("auditoria");
    await nova.getByRole("option").filter({ hasText: "17.16" }).getByRole("button").click();
    await nova.getByText("17.16.01").waitFor({ timeout: 3000 });
    await nova.getByRole("radio", { name: /Retém em alguns municípios/ }).check();
    await nova.getByLabel(/Municípios que retêm/).fill("Jundiaí/SP");
    await foto("regras-servico-nova", { soTela: true });
    await nova.getByRole("button", { name: "Voltar" }).click();
    await nova.waitFor({ state: "detached", timeout: 3000 });
    await p.getByRole("tab", { name: /Notas enviadas/ }).click();
    await p.getByText("Notas enviadas pelo HUB").waitFor({ timeout: 3000 });
  },
  // Boleto (049): contas do Itaú (configurado) e do Santander (não configurado) no Ledgra Link
  "/contratos/boleto": async (p, foto) => {
    for (const t of ["Código da conta no Ledgra Link", "Conta do Financeiro onde o dinheiro cai", "Boletos emitidos", "Não configurado"])
      await p.getByText(t, { exact: false }).first().waitFor({ timeout: 3000 });
    await foto("boleto-config");
  },
  // Ledgra Link (064): MDC pronta (conta com cobrança) e Greencore só com o termo; janela de nova conta
  "/contratos/ledgra-link": async (p, foto) => {
    for (const t of ["MDC ASSESSORIA LTDA", "Pronta para usar", "Falta: certificado digital", "Copiar código"])
      await p.getByText(t, { exact: false }).first().waitFor({ timeout: 3000 });
    await foto("ledgra-link-empresas");
    await p.getByRole("button", { name: "Fazer agora" }).first().click();
    const j = p.getByRole("dialog");
    await j.waitFor({ timeout: 3000 });
    await foto("ledgra-link-certificado", { soTela: true });
    await j.getByRole("button", { name: "Voltar" }).click();
    await j.waitFor({ state: "detached", timeout: 3000 });
    await p.getByRole("button", { name: "Adicionar outro" }).first().click();
    const termo = p.getByRole("dialog");
    await termo.getByRole("button", { name: "Baixar termo preenchido (PDF)" }).waitFor({ timeout: 3000 });
    await foto("ledgra-link-termo", { soTela: true });
    await termo.getByRole("button", { name: "Voltar" }).click();
    await termo.waitFor({ state: "detached", timeout: 3000 });
  },
  // Envio (053): e-mail ligado, WhatsApp com os segredos faltando, a fila de cada canal e o envio que falhou
  "/contratos/envio": async (p, foto) => {
    for (const t of [
      "E-mail (Microsoft 365)",
      "WhatsApp (API oficial da Meta)",
      "Sai por:",
      "Faltam os segredos",
      "Envios que falharam",
      "Parou: reenviar",
    ])
      await p.getByText(t, { exact: false }).first().waitFor({ timeout: 3000 });
    await p.getByRole("button", { name: "Enviar teste" }).first().waitFor({ timeout: 3000 });
    await foto("envio-canais");
  },
  "/contratos/sistemas": async (p, foto) => {
    await p
      .getByRole("cell", { name: /Ledgra/ })
      .first()
      .waitFor({ timeout: 3000 });
    await p.getByText("Previsto nos próximos 12 meses").waitFor({ timeout: 3000 });
    await p.getByRole("button", { name: "Novo sistema", exact: true }).click();
    const j = p.getByRole("dialog", { name: "Novo sistema" });
    await j.waitFor({ timeout: 3000 });
    await j.getByLabel("Nome do sistema").fill("Ledgra IA");
    await foto("novo-sistema");
    await j.getByRole("button", { name: "Voltar" }).click();
    await j.waitFor({ state: "detached", timeout: 3000 });
  },
  "/contratos/reajustes": async (p) => {
    await p.getByRole("button", { name: "Conferir e confirmar", exact: true }).first().click();
    const dialogo = p.getByRole("dialog", { name: /^Reajuste · / });
    await dialogo.waitFor({ timeout: 3000 });
    await dialogo.getByRole("button", { name: "Confirmar reajuste" }).waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    await dialogo.waitFor({ state: "detached", timeout: 3000 });
  },
  "/comercial": (p) => abrirEFecharModal(p, "Limpar funil", "Limpar funil"),
  "/licencas/contratos": (p) => abrirEFecharModal(p, "Novo contrato", "Novo contrato de licença"),
  "/licencas/produtos": async (p) => {
    for (const aba of await p.getByRole("tab").all()) {
      await aba.click();
      if ((await aba.getAttribute("aria-selected")) !== "true") throw new Error(`a aba "${await aba.innerText()}" não ficou selecionada`);
      await p.waitForTimeout(300);
    }
    await abrirEFecharModal(p, "Novo plano", "Novo plano");
  },
  [`/demonstrativos/${IDS_EXEMPLO["demonstrativos/[id]"]}`]: trocarPeriodo,
  "/portal": interacoesPortal,
  "/demonstrativos/importar": importarEmLote,
  // Novo processo de empresa fora do cadastro: "Buscar dados" do CNPJ (Receita simulada) preenche razão social e UF
  "/societario": async (p, foto) => {
    await p.route("**/brasilapi.com.br/**", (r) =>
      r.fulfill({
        json: {
          cnpj: "11222333000181",
          razao_social: "EMPRESA DE TESTE LTDA",
          descricao_situacao_cadastral: "ATIVA",
          logradouro: "RUA A",
          numero: "1",
          municipio: "EXTREMA",
          uf: "MG",
          cnae_fiscal: 6920601,
          cnae_fiscal_descricao: "Atividades de contabilidade",
          qsa: [{ nome_socio: "FULANO DE TAL", qualificacao_socio: "Sócio-Administrador" }],
        },
      }),
    );
    await p.getByRole("button", { name: "Novo processo", exact: true }).first().click();
    const janela = p.getByRole("dialog", { name: "Novo processo societário" });
    await janela.waitFor({ timeout: 3000 });
    await janela.getByLabel("Tipo").selectOption({ label: "Alteração contratual" });
    await janela.getByLabel("Cliente").selectOption({ label: "➕ Empresa ainda não cadastrada no HUB" });
    await janela.getByLabel("CNPJ").fill("11222333000181");
    await janela.getByRole("button", { name: "Buscar dados" }).click();
    await janela.getByText("Sócio-Administrador", { exact: false }).waitFor({ timeout: 3000 });
    const razao = await janela.getByLabel("Razão social da empresa").inputValue();
    const uf = await janela.getByLabel("UF").inputValue();
    if (razao !== "EMPRESA DE TESTE LTDA" || uf !== "MG") throw new Error(`a busca do CNPJ não preencheu os campos (${razao} / ${uf})`);
    await janela.getByRole("button", { name: "Anotar estes dados nas observações" }).click();
    if (!(await janela.getByLabel("O que muda / observações").inputValue()).includes("FULANO DE TAL"))
      throw new Error("os dados da Receita não foram anotados nas observações");
    await foto("novo-processo-cnpj", { soTela: true });
    await p.keyboard.press("Escape");
  },
  // Cadastrar pessoa: o administrador escolhe os módulos um a um (ou um perfil pronto)
  "/hub/acessos": async (p, foto) => {
    await p.getByRole("button", { name: /Cadastrar pessoa/ }).click();
    const janela = p.getByRole("dialog", { name: "Cadastrar pessoa da equipe" });
    await janela.waitFor({ timeout: 3000 });
    await janela.getByRole("radiogroup", { name: "Acesso a Tarefas" }).waitFor({ timeout: 3000 });
    await janela.getByRole("radiogroup", { name: "Acesso a Societário" }).getByRole("radio", { name: "Gerir" }).click();
    if (
      (await janela
        .getByRole("radiogroup", { name: "Acesso a Societário" })
        .getByRole("radio", { name: "Gerir" })
        .getAttribute("aria-checked")) !== "true"
    )
      throw new Error("a escolha do nível do módulo não ficou marcada");
    await foto("cadastrar-pessoa", { soTela: true });
    await janela.getByRole("radio", { name: /Usar um perfil pronto/ }).click();
    await janela.getByLabel("Perfil de acesso").waitFor({ timeout: 3000 });
    await p.keyboard.press("Escape");
    // convite cadastrado sem conta (e-mail não saiu) aparece em "Convites aguardando", com o link para WhatsApp
    const aguardando = p.getByRole("region", { name: /Convites aguardando/ });
    await aguardando.getByText("jean@exemplo.com").waitFor({ timeout: 3000 });
    await aguardando.getByRole("button", { name: "Link para WhatsApp" }).waitFor({ timeout: 3000 });
    await foto("convites-aguardando", { soTela: true });
  },
  "/config": async (p, foto) => {
    for (const aba of await p.getByRole("tab").all()) {
      await aba.click();
      if ((await aba.getAttribute("aria-selected")) !== "true") throw new Error(`a aba "${await aba.innerText()}" não ficou selecionada`);
      await p.waitForTimeout(300);
      // Organização e painel: o cartão do papel timbrado (052) carrega os dados do escritório
      if (/Organização/.test(await aba.innerText())) {
        await p.getByRole("heading", { name: "Papel timbrado dos documentos" }).waitFor({ timeout: 5000 });
        if ((await p.getByLabel("CRC do responsável").inputValue()) !== "1SP346098-O/0")
          throw new Error("o papel timbrado não carregou o CRC");
        await foto("organizacao");
      }
    }
  },
};

// ---------------------------------------------------------------- verificação de uma tela

async function verificarTela(navegador, porta, rota, pastaFotos) {
  const problemas = [];
  const avisos = new Set();
  const celular = process.env.TELA === "celular";
  const contexto = await navegador.newContext({
    viewport: celular ? { width: 390, height: 844 } : { width: Number(process.env.LARGURA_TELA ?? 1280), height: 900 },
    isMobile: celular,
    hasTouch: celular,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
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
    if (process.env.ACESSIBILIDADE) {
      try {
        await medirAcessibilidade(pagina, rota.caminho, celular);
      } catch (e) {
        avisos.add(`acessibilidade não medida: ${String(e.message ?? e).split("\n")[0]}`);
      }
    }
    if (pastaFotos)
      await pagina.screenshot({
        path: join(pastaFotos, (rota.caminho === "/" ? "inicio" : rota.chave.replace(/[^\w-]+/g, "_")) + ".png"),
        fullPage: true,
      });
    const interacao = INTERACOES[rota.caminho];
    if (interacao) {
      try {
        // foto("x") salva uma captura intermediária (<tela>-x.png) quando FOTOS está ligado; { soTela: true } fotografa
        // só o que cabe na tela (como a pessoa vê uma janela), sem esticar a página inteira
        const foto = (sufixo, { soTela = false } = {}) =>
          pastaFotos
            ? pagina.screenshot({ path: join(pastaFotos, `${rota.chave.replace(/[^\w-]+/g, "_")}-${sufixo}.png`), fullPage: !soTela })
            : Promise.resolve();
        await interacao(pagina, foto);
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
  if (MEDIDAS_JANELAS.length) console.log(`\nJanelas largas:\n${MEDIDAS_JANELAS.map((m) => `  - ${m}`).join("\n")}`);
  if (process.env.ACESSIBILIDADE) {
    console.log(`\nAcessibilidade (${ACHADOS_A11Y.size ? "o que achou" : "nada achado"}):`);
    for (const [regra, a] of [...ACHADOS_A11Y].sort((x, y) => y[1].elementos - x[1].elementos)) {
      console.log(`  - ${regra}: ${a.elementos} elemento(s) em ${a.telas.size} tela(s)`);
      if (process.env.ACESSIBILIDADE === "detalhe") for (const e of a.exemplos) console.log(`      ${e}`);
    }
  }
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
