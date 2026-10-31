# HUB-MDC — Avaliação de arquitetura

Data: 31/10/2026 · Escopo: `/home/claude/mdc-tarefas` (somente leitura; nenhum arquivo alterado) · Base: 33 commits, 19 migrations (+ 007b), 3 Edge Functions, 65 arquivos em `web/src`.

---

## Sumário executivo

| # | Achado | Gravidade p/ módulos novos |
|---|---|---|
| 1 | Cálculo contábil roda no **navegador** e o resultado é gravado como `jsonb` pelo próprio cliente HTTP; o PDF assinado confia nesse `jsonb`. | Alta (inaceitável para Fiscal/Contabilidade) |
| 2 | Escritas multi-tabela **sem transação** feitas pela tela (balancete: update → delete linhas → insert em lotes de 500). | Alta |
| 3 | Fonte de verdade do banco fragmentada: a mesma função é redefinida em 2–3 migrations; aplicação manual pelo SQL Editor, sem `config.toml`, sem ambiente de homologação. | Alta |
| 4 | Acesso a dados espalhado: ~170 chamadas `.from()` em 29 arquivos de tela/componente; tipos escritos à mão. | Média |
| 5 | Três modelos de permissão coexistem (papel da org, `hub_pode`, `portal_pode`); registro de módulo em 4 lugares. | Média |
| 6 | Páginas de 600–1.300 linhas misturando UI, consulta e regra. | Média |
| 7 | Sem testes, lint, CI ou typecheck automatizado; README desatualizado. | Média |

A escolha de base (SPA + Supabase com RLS forte + RPCs `security definer`) é adequada ao tamanho da equipe e deve ser mantida. O que precisa mudar antes do Financeiro é **onde roda o cálculo que vira documento** e **como o repositório é organizado por módulo**.

---

## 1. Arquitetura real hoje

### 1.1 Camadas

```
 Navegador (equipe MDC, cliente no Portal, TV)
   │  SPA Next.js 16 — todas as páginas "use client"; nenhum Server Component,
   │  route handler ou server action. Next é usado como roteador + bundler.
   ▼
 Cloudflare Worker  infra/cloudflare/hub-mdc-worker.js
   │  mdcassessoria.com/hub-mdc/*  →  mdc-tarefas.vercel.app/hub-mdc/*
   ▼
 Vercel (só serve estáticos/JS; basePath /hub-mdc em web/next.config.ts)

 Navegador ──supabase-js──► Supabase (projeto bulqqdgfrrpqquqvjjfa, São Paulo)
                              ├─ PostgREST  (.from / .rpc)        ← 95% do tráfego
                              ├─ Realtime   (tarefas, hub_notificacoes, chat)
                              ├─ Auth       (convite; sign-up desligado)
                              ├─ Storage    bucket hub-arquivos, pasta = org_id
                              ├─ Vault      (.pfx + senha do A1)
                              ├─ pg_cron    gerar_tarefas_recorrentes 09:05 UTC
                              └─ Edge Functions (Deno)
                                   convite/            service role p/ auth.admin
                                   certificado/        grava A1 no Vault
                                   demonstrativo-pdf/  monta PDF e assina com A1
 Projeto mdc-simulador ──pg_net──► rpc crm_receber_lead  (supabase/simulador/001_…)
```

### 1.2 Como as telas falam com o banco

- **Direto do componente para o PostgREST.** Contagem aproximada: ~170 chamadas `.from("tabela")` em 29 arquivos e ~45 chamadas `.rpc()` para 26 funções. Só o Demonstrativos tem uma camada de acesso (`web/src/lib/demonstrativos.ts`, 21 `.from`). Exemplos de telas que consultam direto: `web/src/app/comercial/[id]/page.tsx` (21 `.from`), `web/src/app/config/page.tsx` (18), `web/src/app/societario/[id]/page.tsx` (16), `web/src/app/demonstrativos/[id]/page.tsx` (12).
- **RPC para operações com invariante**: `soc_abrir_processo`, `soc_mudar_fase`, `crm_converter_cliente`, `portal_publicar_balancete`, `hub_convidar`, `hub_transferir_trabalho`, `importar_clientes`, `gerar_competencia` etc.
- **Contexto global** em `web/src/lib/org.tsx` (`OrgProvider`): sessão, organização, membros, setores, clientes, apps liberados e `pode(app, nivel)`. Carrega a carteira inteira de clientes em memória.
- **Edge Function** só onde há segredo ou chave de serviço (convite, certificado, PDF assinado).

### 1.3 Onde ficam as regras de negócio

| Tipo de regra | Onde está | Exemplos |
|---|---|---|
| Isolamento multiempresa e permissão | SQL (RLS + ~96 funções `security definer`) | `app.minhas_orgs`, `app.papel`, `app.hub_pode` (008), `app.portal_pode` (010/016), trigger `cliente_mesma_org` (016) |
| Fluxos e estados | SQL (RPC + triggers) | recorrência e dia útil (`app.gerar_tarefas_recorrentes`, `app.vencimento`), fases do societário que geram tarefas (`app.tg_tarefa_fase_societario`), etapa do CRM (`app.tg_crm_etapa`), publicação protegida (`app.tg_publicacao_protegida`), avisos de vencimento |
| Cálculo contábil | **TypeScript no navegador** | `web/src/lib/balancete.ts` (leitura do Excel do Domínio, sinal, classificação, DRE, índices, fragilidades), `lib/demonstracoes.ts` (BP, DFC, cruzamento, saúde), `lib/parecer.ts`, `lib/tendencia.ts`, `lib/periodos.ts` |
| Leitura/validação de importação | TS no navegador + RPC | `lib/importacao.ts` + `importar_clientes`; `lib/planilha.ts` carrega SheetJS 0.18.5 do cdnjs |
| Geração de PDF | TS no navegador (relatórios, contrato) e Deno (demonstrações) | `lib/relatorioPdf.ts`, `lib/contratoPdf.ts`, `functions/demonstrativo-pdf/pdf.ts` |

Regra prática que o código segue hoje, sem estar escrita: **segurança e fluxo no SQL, cálculo e leitura de arquivo no TS do navegador.** É uma divisão razoável para Tarefas/CRM; não é para dados que viram documento contábil ou fiscal (ver 2.3 e 5.1).

### 1.4 Fluxo do balancete (o mais complexo hoje)

```
Excel Domínio ─► lerBalancete (navegador) ─► classificar + mapa salvo
   ─► analisar(): resumo, índices, alertas, conferências, demonstrações  (navegador)
   ─► salvarBalancete():  update/insert portal_balancetes(jsonb...)      ┐ 3+ chamadas
                          delete portal_balancete_linhas                  │ HTTP sem
                          insert linhas em lotes de 500                   ┘ transação
   ─► portal_publicar_balancete (RPC)  ─► Portal do cliente lê
   ─► demonstrativo-pdf (Edge): lê jsonb gravado + linhas, soma acumulado,
      busca A1 no Vault (cert_obter), assina, devolve PDF
```

---

## 2. O que dificulta um programador novo

### 2.1 Documentação e onboarding

1. `README.md` descreve o projeto antigo "MDC Tarefas": cita só as migrations 001–003, manda copiar `web/.env.example` (não existe), diz que qualquer pessoa pode criar conta (hoje o cadastro é só por convite — `infra/cloudflare/README.md` passo 6) e que `criar_organizacao` é livre (revogado em `016_endurecimento_auditoria.sql`, item A1).
2. `web/AGENTS.md` é texto padrão do Next para agentes; não há guia humano de "como rodar, como criar um módulo, como aplicar migration".
3. O desenho completo do Financeiro está fora do repositório (link de artifact em `docs/financeiro-desenho.md`, linha 4). Decisão de arquitetura que vive fora do repo se perde.
4. Não há registro de decisões (ADR). Decisões importantes estão só em comentários de migration (ex.: "prefixo hub_ porque o Data API só expõe public", `008_hub_base.sql` linhas 5–7).

### 2.2 Banco: estado atual difícil de descobrir

1. **Funções redefinidas em várias migrations** — para saber o comportamento atual é preciso achar a última versão:
   - `app.gerar_tarefas_recorrentes`: 001, 007, 018
   - `public.importar_clientes`: 006, 007, 007b
   - `app.aplicar_convites`: 005, 008, 015
   - `public.hub_convidar`, `hub_definir_acesso`, `hub_aplicar_perfil`, `hub_meus_apps`: 008 e 015
   - `app.portal_pode`, `portal_publicar_balancete`, `portal_publicar_parecer`, `app.tg_mensagem`, `portal_conversa_para_tarefa`: 010 e 016
   - `app.tg_membro_acesso_padrao`: 008 e 015
2. Não existe `supabase/config.toml`, nem uso do Supabase CLI; as migrations são coladas no SQL Editor (README §1). Não há tabela de controle confiável de "o que já rodou" nem projeto de homologação. `007b_…` mostra o improviso de numeração.
3. **Nome da tabela pelo consumidor, não pelo dono**: as tabelas do Demonstrativos chamam-se `portal_balancetes`, `portal_balancete_linhas`, `portal_mapa_contas`, `portal_mapa_dfc`, `portal_pareceres` (010/012/014), embora quem cria e calcula seja o módulo Demonstrativos. Quem procura "onde está o balancete" vai ao módulo errado. `hub_certificados` (013) é usado pelo PDF do Demonstrativos.
4. Dados de catálogo (`hub_apps`) são semeados em 008 e alterados por `update` em 014 — o catálogo atual não está legível em lugar nenhum.
5. Seed (`supabase/seed_mdc.sql`) com e-mail fixo e sem separação dados de teste × produção.

### 2.3 Regras e dados

1. **Cálculo gravado pelo cliente HTTP.** `salvarBalancete`, `recalcular` e `reprocessar` (`web/src/lib/demonstrativos.ts` linhas 61–175) calculam no navegador e fazem `update portal_balancetes set resumo, indices, alertas, demonstracoes`. A RLS (016) só verifica `hub_pode(org,'demonstrativos','operar')` — qualquer pessoa com "operar" pode gravar números arbitrários via PostgREST, e `functions/demonstrativo-pdf/index.ts` (linhas 53–75, 104–117) gera e **assina com o A1** usando esse `jsonb` sem recalcular.
2. **Sem transação**: o mesmo fluxo faz update do cabeçalho, apaga todas as linhas e reinsere em lotes de 500. Queda de rede no meio = balancete com cabeçalho novo e linhas parciais. `definirGrupo` e `definirLinhaDfc` fazem delete + insert separados.
3. **Código duplicado por script de regex**: `scripts/nucleo_balancete.py` recorta trechos de `web/src/lib/balancete.ts` e `demonstracoes.ts` para `supabase/functions/demonstrativo-pdf/` procurando cabeçalhos como `export function blocoDe(`. Hoje as cópias conferem, mas: (a) depende da ordem e do formato dos `export`; (b) ninguém roda automaticamente (`scripts/sync-funcoes.sh` é manual); (c) a falha seria silenciosa — PDF com regra diferente da tela.
4. **Tipos escritos à mão**: `web/src/lib/types.ts` (21 tipos), tipos dentro de `lib/crm.ts`, `lib/societario.ts`, casts `as { ... }[]` nas telas. Coluna renomeada no banco não quebra o build.
5. Valores monetários em `number` (ponto flutuante) com `Math.round(n*100)/100` (`balancete.ts` linha 355; `demonstracoes.ts` linha 49). Aceitável para indicadores; não para guia, nota ou lançamento.

### 2.4 Front-end

1. Páginas gigantes com várias telas dentro:
   - `web/src/app/hub/acessos/page.tsx` — 1.302 linhas, 41 `useState`, 10 `.from` + 9 `.rpc`, abas de equipe, perfis, clientes do portal, transferência de trabalho.
   - `web/src/app/config/page.tsx` — 1.145 linhas, 6 abas (organização, equipe, setores, clientes, obrigações, feriados), 18 `.from`.
   - `web/src/app/portal/page.tsx` — 713 linhas (portal inteiro do cliente em uma rota).
   - `web/src/components/demonstrativos/Painel.tsx` — 651; `web/src/app/comercial/[id]/page.tsx` — 618; `web/src/components/AppShell.tsx` — 597.
2. `web/src/lib/` é uma pasta plana com 23 arquivos de domínios diferentes (CRM, balancete, chat, PDF, Excel, datas, marca) — não diz a qual módulo cada coisa pertence.
3. **Registro de módulo em quatro lugares**: catálogo `hub_apps` (008/014), menu `NAV` fixo em `web/src/components/AppShell.tsx` (linhas 16–58), regex de redirecionamento em `web/next.config.ts` (linha 10), perfis/convites padrão em SQL (008/015). Esquecer um deles gera módulo sem menu, sem redirect ou sem permissão.
4. **Dois modelos de autorização na equipe**: Tarefas/Config usam o papel da organização (`tarefas_select` em 001, `gestor: true` no `NAV`); os demais usam `hub_pode(org, app, nivel)`. O cliente usa um terceiro (`portal_pode(cliente, perm)` com `permissoes text[]`).
5. Projeto Supabase fixo no código (`web/src/lib/supabase.ts` linhas 6–7 e `supabase/simulador/001_encaminhar_leads_hub.sql`). A chave é publicável, então não é vazamento; o problema é não haver como apontar para homologação sem editar código.
6. SheetJS 0.18.5 carregado do CDN em tempo de execução (`web/src/lib/planilha.ts` linha 2). Essa versão da edição comunitária tem vulnerabilidades conhecidas ao ler arquivos maliciosos (prototype pollution corrigida na 0.19.3; ReDoS na 0.20.2). O HUB vai ler planilhas e extratos enviados por clientes — atualizar e servir a partir do próprio bundle.

### 2.5 Qualidade e operação

- Nenhum teste no repositório (nem pgTAP para RLS, nem unitário do cálculo), embora o README diga que RLS e recorrência foram testados — os testes não ficaram versionados.
- `web/package.json` não tem `lint`, `typecheck` nem `test`; não existe `.github/workflows`.
- Edge Functions fixam `@supabase/supabase-js@2.49.4` enquanto o web usa `^2.118.0`.
- Edge Functions com `Access-Control-Allow-Origin: *` (mitigado por exigir JWT, mas vale restringir às origens do HUB como `convite/index.ts` já faz para o redirect).

---

## 3. Estrutura recomendada para crescer com os 6 módulos

### 3.1 Decisões de base

1. **Continuar com um app web e um projeto Supabase.** Microsserviços não se pagam com essa equipe. Separar só o **serviço fiscal** (já decidido: Cloud Run), porque ele precisa de mTLS, bibliotecas fiscais e outro runtime.
2. **Módulo = pasta vertical** (tela + acesso a dados + regras + SQL + testes + doc) com um manifesto único.
3. **Núcleo de cálculo em TypeScript puro**, sem React e sem Supabase, importado pelo web (pré-visualização) e pelo servidor (resultado oficial). Fim do script de regex.
4. **Prefixo de tabela = módulo dono.** Manter o padrão de prefixo em `public` (já adotado e coerente com o PostgREST). Não renomear tabelas existentes agora; documentar o dono no catálogo (tabela de 3.4).

### 3.2 Árvore de diretórios

```
hub-mdc/
├── README.md                         ← 1 página: o que é, como rodar, links para docs/
├── docs/
│   ├── arquitetura/
│   │   ├── visao-geral.md            ← C4 contexto + contêineres (Mermaid)
│   │   ├── permissoes.md             ← modelo org × ferramenta × portal, tabela RLS
│   │   ├── dados.md                  ← catálogo de tabelas por módulo (dono, prefixo)
│   │   └── implantacao.md            ← Vercel, Cloudflare, Supabase, segredos, SMTP
│   ├── adr/                          ← decisões numeradas (0001-spa-supabase.md, …)
│   ├── modulos/                      ← 1 arquivo por módulo (objetivo, telas, tabelas,
│   │   ├── tarefas.md                   RPCs, gatilhos, diagramas de estado)
│   │   ├── demonstrativos.md
│   │   └── financeiro.md             ← evolução de financeiro-desenho.md, trazendo o
│   └── guias/                           conteúdo do artifact para dentro do repo
│       ├── novo-modulo.md            ← checklist (3.5)
│       └── migrations.md
│
├── nucleo/                           ← TS puro, sem dependência de React/Supabase/DOM
│   ├── contabil/                     ← balancete, demonstracoes, indices, parecer,
│   │   ├── balancete.ts                 periodos, tendencia (vindos de web/src/lib)
│   │   ├── demonstracoes.ts
│   │   └── *.test.ts
│   ├── fiscal/                       ← motor de apuração (regras com vigência) — fase 8
│   ├── financeiro/                   ← conciliação, geração de lançamentos D/C
│   ├── layouts/                      ← adaptadores de arquivo: dominio-balancete,
│   │                                    dominio-plano, dominio-lancamentos, ofx, …
│   └── dinheiro.ts                   ← tipo decimal/centavos + regras de arredondamento
│
├── supabase/
│   ├── config.toml                   ← Supabase CLI; projetos: homologacao e producao
│   ├── migrations/                   ← AAAAMMDDHHMMSS_<modulo>_<assunto>.sql (CLI)
│   │   └── (001…019 atuais marcados como aplicados com `migration repair`)
│   ├── schemas/                      ← estado atual legível, 1 pasta por módulo
│   │   ├── 00_nucleo/                   (organizacoes, membros, clientes, app.*)
│   │   ├── hub/  tarefas/  societario/  demonstrativos/  portal/  crm/  vencimentos/
│   │   └── fin/  fis/  ctb/  pacotes/
│   ├── functions/
│   │   ├── _shared/                  ← cors.ts, clientes.ts (usuario/servico), erros.ts
│   │   ├── convite/  certificado/  demonstrativo-pdf/
│   │   └── fin-importar-extrato/  ctb-gerar-balancete/  …
│   ├── tests/                        ← pgTAP: RLS e invariantes por módulo
│   │   ├── rls_demonstrativos.test.sql
│   │   └── fin_partidas_dobradas.test.sql
│   ├── seed/                         ← seed de desenvolvimento (fictício) separado
│   └── templates/                    ← e-mails
│
├── servicos/
│   └── fiscal/                       ← Cloud Run (NF-e/NFS-e/DF-e): Dockerfile,
│       ├── openapi.yaml                 contrato HUB ↔ serviço, testes em homologação
│       └── src/
│
├── web/
│   └── src/
│       ├── app/                      ← SOMENTE rotas finas (page.tsx ≤ ~80 linhas)
│       │   ├── (equipe)/tarefas/…  (equipe)/demonstrativos/…  (equipe)/financeiro/…
│       │   ├── (portal)/portal/…     ← portal do cliente com rotas próprias por aba
│       │   ├── login/  tv/
│       │   └── layout.tsx
│       ├── modulos/
│       │   ├── tarefas/
│       │   │   ├── modulo.ts         ← manifesto (3.3)
│       │   │   ├── dados.ts          ← única porta do módulo para o Supabase
│       │   │   ├── tipos.ts          ← derivados de db.types.ts
│       │   │   ├── componentes/      ← TarefaEditor, PainelTV, RitmoSemanal…
│       │   │   └── telas/            ← Lista, Relatorio (o que hoje está em page.tsx)
│       │   ├── configuracoes/telas/{Organizacao,Equipe,Setores,Clientes,Obrigacoes,Feriados}.tsx
│       │   ├── acessos/telas/{Equipe,Perfis,ClientesPortal,Transferir}.tsx
│       │   ├── demonstrativos/  societario/  portal/  atendimento/  vencimentos/  comercial/
│       │   └── financeiro/  entradas/  saidas/  fiscal/  contabilidade/  pacotes/
│       ├── plataforma/               ← o que todo módulo usa e nenhum módulo possui
│       │   ├── supabase.ts  db.types.ts (gerado)  org.tsx  permissoes.ts
│       │   ├── erros.ts  caminho.ts  datas.ts  marca.ts  arquivos.ts
│       │   └── registro.ts           ← junta os manifestos → menu, rotas, busca Ctrl+K
│       └── ui/                       ← componentes sem domínio
│           ├── relatorio/            ← o "molde único" de relatório do desenho:
│           │   ├── Relatorio.tsx        período 1 clique, ≤3 filtros, resumo, KPIs,
│           │   ├── exportarExcel.ts     gráfico que filtra, tabela, PDF/Excel do que
│           │   └── exportarPdf.ts       está na tela (de lib/excel.ts e relatorioPdf.ts)
│           ├── Badges.tsx  Etiquetas.tsx  Icone.tsx  MultiSelecao.tsx  ChatMensagens.tsx
│           └── AppShell.tsx
│
└── infra/
    └── cloudflare/
```

Observação técnica sobre `nucleo/`: o web importa via alias do `tsconfig` (`"@nucleo/*": ["../nucleo/*"]`, com `allowImportingTsExtensions` porque o Deno exige `.ts` nos imports). Antes de mover, validar que `supabase functions deploy` empacota import relativo fora de `supabase/functions/`; se não empacotar, a alternativa equivalente é `supabase/functions/_shared/nucleo/` como fonte única e o alias do web apontando para lá. Em qualquer caso: **uma cópia só**, verificada no CI.

### 3.3 Padrão de módulo (manifesto)

```ts
// web/src/modulos/financeiro/modulo.ts
export const financeiro = {
  slug: "financeiro",                 // = hub_apps.slug = prefixo lógico das permissões
  prefixoTabelas: "fin_",
  publico: ["equipe", "portal"],      // aparece no Portal se o cliente contratou
  nav: [
    { href: "/financeiro", nome: "Visão geral" },
    { href: "/financeiro/extratos", nome: "Extratos", minimo: "operar" },
    { href: "/financeiro/conciliacao", nome: "Conciliação", minimo: "operar" },
    { href: "/financeiro/relatorios", nome: "Relatórios" },
  ],
  permissoesPortal: ["financeiro.ver", "financeiro.conciliar"],
} as const;
```

`plataforma/registro.ts` importa todos os manifestos e gera o menu (`AppShell`), a lista de redirects do `next.config.ts` e a busca rápida. O `hub_apps` continua sendo a fonte de **liberação** (status, ordem), e um teste no CI confere que todo `slug` do manifesto existe em `hub_apps` e vice-versa.

### 3.4 Regras de onde fica cada coisa

| Se a regra… | Fica em | Motivo |
|---|---|---|
| protege dado (quem vê/edita), isola org/cliente, ou é invariante que nenhuma tela pode violar (partidas dobradas, soma dos itens = linha, mês fechado imutável, conta analítica ativa) | SQL: constraint, trigger, RLS | Vale para qualquer caminho de escrita, inclusive PostgREST direto |
| escreve em mais de uma tabela ou muda estado | **RPC** (`public.<prefixo>_<verbo>`) — uma transação | Atomicidade; auditoria em um ponto |
| calcula valor que vira documento (PDF assinado, guia, lançamento, apuração, exportação Domínio) | `nucleo/` executado **no servidor** (Edge Function ou serviço), que grava resultado + versão do motor | Reprodutível e não forjável pelo navegador |
| calcula para mostrar (prévia, gráfico, simulação) | `nucleo/` no navegador | Rapidez; mesma função do servidor |
| lê arquivo de terceiro (Excel Domínio, OFX, XML) | `nucleo/layouts/` (puro, testado com arquivos reais anonimizados) | Layout muda; adaptador isolado e versionado |
| usa segredo, chave de serviço ou rede externa (SEFAZ, Serpro, SMTP, A1) | Edge Function ou `servicos/fiscal` | Nunca no navegador |
| leitura/lista/CRUD simples de uma tabela | `modulos/<m>/dados.ts` → PostgREST | Único lugar com `.from()` do módulo |
| agregação sobre muitas linhas (relatórios, painéis) | view ou RPC `stable` no SQL, chamada por `dados.ts` | Não trafegar 20.000 linhas para somar no navegador |

Convenções de nome:

- Tabelas: `<prefixo>_<entidade_plural>` — `fin_`, `fis_`, `ctb_`, `hub_` (pacotes/contratos), núcleo sem prefixo (`organizacoes`, `membros`, `clientes`). Toda tabela de cliente tem `org_id` e `cliente_id` e o trigger `cliente_mesma_org`.
- RPC pública: `<prefixo>_<verbo>` (`fin_conciliar`, `ctb_fechar_mes`). Função interna: `app.<prefixo>_<algo>`, sem `execute` para `authenticated`.
- Migration: `AAAAMMDDHHMMSS_<modulo>_<assunto>.sql`; uma migration por mudança; quando redefinir função, o arquivo em `supabase/schemas/<modulo>/` é atualizado no mesmo commit (é ele que o humano lê).
- Arquivos TS em português, como já é o padrão do projeto; componentes em PascalCase.

### 3.5 Checklist "novo módulo" (para `docs/guias/novo-modulo.md`)

1. ADR curta se houver decisão nova (ex.: integração externa).
2. `docs/modulos/<m>.md` com ER, estados e RPCs.
3. Migration: tabelas com prefixo, RLS usando a função de permissão padrão, trigger `cliente_mesma_org`, índices `(org_id, cliente_id, competencia)`, auditoria.
4. Linha em `hub_apps` + perfis padrão.
5. `supabase/tests/rls_<m>.test.sql` cobrindo: outra org, analista sem acesso, cliente de outro CNPJ, cliente sem o módulo contratado.
6. `web/src/modulos/<m>/` com `modulo.ts`, `dados.ts`, `tipos.ts` (derivados do gerado), telas.
7. Relatórios só pelo `ui/relatorio/` (molde único: público leigo, filtros simples, PDF e Excel do que está na tela).
8. CI verde: typecheck, lint, testes do `nucleo/`, pgTAP, conferência manifesto × `hub_apps`.

### 3.6 Sequência de arrumação sugerida (antes da fase 1 "Pacotes")

1. Supabase CLI + `config.toml` + projeto de homologação; marcar 001–019 como aplicadas; gerar `db.types.ts`.
2. Despejar o estado atual em `supabase/schemas/` (uma vez, por módulo) para leitura humana.
3. Mover cálculo do balancete para `nucleo/contabil/`, apagar `scripts/nucleo_balancete.py`; trocar `salvarBalancete/recalcular/reprocessar` por uma Edge Function ou RPC transacional que calcula no servidor.
4. Quebrar `config/page.tsx`, `hub/acessos/page.tsx` e `portal/page.tsx` em telas dentro de `modulos/`.
5. Unificar autorização da equipe em `hub_pode` (Tarefas como app; papel da org só define admin).
6. Reescrever o README e criar os diagramas da seção 4.

---

## 4. Diagramas que a documentação precisa ter

Todos em Mermaid dentro do próprio `.md` (o GitHub renderiza, fica versionado com o código).

| # | Diagrama | O que mostra | Onde |
|---|---|---|---|
| 1 | **Contexto (C4 nível 1)** | Pessoas (equipe MDC, administrador, cliente no Portal, TV) e sistemas externos (Domínio via Excel/TXT, Microsoft 365 SMTP, Simulador de Regime, Vercel, Cloudflare, Supabase; futuros: SEFAZ/DF-e, ADN NFS-e, Serpro Integra Contador, Cloud Run fiscal) | `arquitetura/visao-geral.md` |
| 2 | **Contêineres (C4 nível 2)** | SPA, Worker, Vercel, PostgREST, Auth, Realtime, Storage, Vault, pg_cron, cada Edge Function, serviço fiscal; protocolo e credencial de cada seta (JWT do usuário, service role, chave publicável, mTLS) | idem |
| 3 | **Mapa de módulos e dependências** | Cada módulo, as tabelas que **possui** e as de outros módulos que lê/escreve (ex.: Societário cria `tarefas`; CRM cria `clientes`; Portal lê `portal_balancetes`; Fiscal gera `fin_titulos`). Matriz módulo × tabela (P=possui, L=lê, E=escreve) | `arquitetura/dados.md` |
| 4 | **ER por módulo** | Entidades, chaves, cardinalidade; núcleo (organizacoes, membros, setores, clientes) em diagrama próprio; cada módulo referencia o núcleo | `modulos/<m>.md` |
| 5 | **Modelo de permissões** | Três camadas (papel na org; `hub_acessos` ferramenta × ver/operar/gerir; `portal_usuarios` cliente × permissões) e, no futuro, contrato do módulo; fluxograma de decisão de `hub_pode`/`portal_pode`; tabela "tabela × política × função usada" | `arquitetura/permissoes.md` |
| 6 | **Máquinas de estado** | Tarefa (`a_fazer`→`concluida`/`cancelada`); processo societário por fase; oportunidade CRM (novo→ganho/perdido→arquivada); balancete (rascunho→publicado); futuros: nota fiscal (rascunho→autorizada→cancelada/CC-e), linha de extrato (importada→conciliada→exportada), mês contábil (aberto→fechado→reaberto pela MDC) | `modulos/<m>.md` |
| 7 | **Sequência: importação e publicação do balancete** | Hoje e proposto (cálculo no servidor, transação única), com o ponto em que o cliente passa a ver | `modulos/demonstrativos.md` |
| 8 | **Sequência: PDF assinado** | Usuário → Edge Function → RLS como usuário → Vault como serviço → assinatura → download; o que é lido com cada credencial | idem |
| 9 | **Sequência: convite (equipe e Portal)** | RPC `hub_convidar`/`portal_convidar` → Edge `convite` → Auth → trigger `aplicar_convites*` → acessos aplicados; caminho alternativo de link manual | `modulos/acessos.md` |
| 10 | **Mapa de automações** | Todo efeito colateral que não aparece na tela: pg_cron, triggers que criam/alteram dados em outro módulo (fase societária→tarefa, cliente inativo→vencimentos, etapa CRM, avisos 60/30/7, encaminhamento de lead do Simulador) | `arquitetura/visao-geral.md` |
| 11 | **Implantação e ambientes** | DNS Cloudflare, rotas do Worker, basePath, redirects, projetos Supabase (homologação/produção), onde fica cada segredo (Vault, Secret Manager, variáveis Vercel), SMTP | `arquitetura/implantacao.md` |
| 12 | **Fluxo de dados do HUB Gestão** | Plano Domínio → categorias/centros → extrato → conciliação → lançamento D/C → exportação Domínio; Entradas/Saídas → títulos → conciliação; Fiscal → provisão e guia → título; tudo convergindo na Contabilidade espelho e na conferência HUB × Domínio | `modulos/financeiro.md` |
| 13 | **Fronteira de confiança do serviço fiscal** | O que o HUB envia, o que o serviço guarda (nada, por decisão), por onde passa o A1, autenticação HUB↔Cloud Run, fila e retentativas, retorno assíncrono | `modulos/fiscal.md` + ADR |

---

## 5. Riscos arquiteturais para os módulos futuros

### 5.1 Cálculo no navegador (afeta Financeiro, Fiscal, Contabilidade)

Hoje o resultado do Demonstrativos é calculado e gravado pela tela. Se o mesmo padrão for usado para lançamentos, apuração ou guias, qualquer usuário com "operar" pode gravar valores que não decorrem dos dados de origem, e não há como reproduzir um número depois.

Mitigação: toda gravação de resultado passa por RPC/Edge Function que recalcula a partir das origens; o registro guarda `versao_motor`, `entrada_hash` e `calculado_em`. O navegador só mostra prévia.

### 5.2 Motor de regras com vigência (Fiscal)

Riscos e desenho recomendado para `fis_regras_tributos`:

1. **Sobreposição de vigência**: duas regras ativas no mesmo dia para o mesmo tributo/regime/condição. Usar `daterange` + `exclude using gist (tributo with =, regime with =, chave_condicao with =, vigencia with &&)`.
2. **Duas datas diferentes**: quando a lei vale (vigência) × quando a regra foi cadastrada/corrigida (registro). Sem a segunda, uma correção de cadastro reescreve o passado silenciosamente. Guardar `vigencia daterange` e `registrada_em`, nunca dar `update` — corrigir = nova linha que substitui (`substitui_id`).
3. **Apuração tem que congelar a regra usada**: `fis_apuracoes` guarda `regra_id` de cada parcela + memória de cálculo. Reprocessar cria nova versão da apuração, não sobrescreve a anterior.
4. **Tributo como dado, não coluna**: IBS, CBS e IS (2026 informativo, 2027+ efetivo, 2029–2032 transição, 2033 final) precisam entrar como novas linhas, sem `alter table`. O mesmo vale para os campos novos da NF-e (grupos IBS/CBS por item): colunas normalizadas para o que se apura + `jsonb` com o bloco bruto por versão de leiaute.
5. **Escopo da regra**: regra legal é global (vale para todas as organizações), enquanto enquadramento e exceções são por cliente (`cliente_enquadramentos` com vigência anual/semestral). Não misturar na mesma tabela; a RLS das regras globais é só leitura para todos e escrita pela MDC.
6. **Arredondamento e precisão**: cálculo em `numeric` no banco ou em centavos inteiros/decimal no TS; regra de arredondamento por item × por total explícita (a NF-e e o DAS divergem). `number` do JavaScript não serve.
7. **Testes por caso legal**: cada regra com casos de teste versionados (receita, anexo, fator R → alíquota efetiva esperada). Sem isso, mudança de regra quebra mês antigo sem ninguém notar.

### 5.3 Serviço fiscal separado (Cloud Run)

1. **Chave privada atravessando a rede.** A decisão "o serviço só assina e transmite, não armazena" implica mandar o `.pfx` + senha do cliente a cada chamada, hoje guardados no Vault do Supabase (`013_certificado_digital.sql`). Opções: (a) serviço lê o A1 diretamente do Vault com credencial própria e escopo mínimo; (b) mover A1 para o Secret Manager do GCP. Decidir em ADR; registrar todo acesso ao A1 em auditoria. A decisão "administrador da MDC acessa todos os certificados" amplia o estrago de uma conta comprometida — exigir MFA para administradores.
2. **Hoje `hub_certificados` é por organização** (um A1, o da MDC). Entradas/Saídas exigem A1 **por cliente**: a tabela precisa de `cliente_id`, e a Edge Function `demonstrativo-pdf` continua usando o da organização.
3. **Chamada síncrona é frágil**: SEFAZ e ADN ficam lentos/indisponíveis; Edge Function tem tempo limite. Usar *outbox*: `fis_eventos` (pedido de emissão/cancelamento/distribuição) gravado na mesma transação da nota → worker do serviço consome, com retentativa e idempotência por chave de acesso/número/série. A tela acompanha o estado via Realtime.
4. **Numeração sem buracos**: número da NF-e por série precisa de reserva atômica no banco (`select … for update` em `fis_series`) e fluxo de inutilização quando houver rejeição.
5. **Autenticação HUB → serviço**: serviço não pode ser público; ID token/OIDC ou assinatura HMAC + propagação do usuário original para auditoria. Contrato em `servicos/fiscal/openapi.yaml`.
6. **Guarda decadencial**: XML e protocolos "sem exclusão" exigem bucket separado (ex.: `fis-documentos`) **sem política de delete**, caminho `org/cliente/ano/chave.xml`, hash gravado na `fis_notas`. Atenção ao custo de Storage em 5+ anos.
7. **Dois runtimes de regra fiscal**: se o serviço usar biblioteca PHP/Python (sped-nfe, PyNFe) e o HUB calcular imposto em TS, haverá duas implementações de cálculo. Definir que o **HUB calcula** e o serviço **só monta/assina/transmite** o XML com os valores recebidos.

### 5.4 Contabilidade espelho

1. **Dois livros divergindo**: Domínio é oficial, HUB é gerencial. Sem conferência automática conta a conta por competência, o cliente vê números diferentes do balancete oficial. A conferência HUB × Domínio precisa ser parte do fechamento, com tolerância e motivo registrado.
2. **Plano de contas muda no Domínio**: contas novas, reclassificadas, código reduzido reaproveitado. `fin_plano_contas` precisa de importação versionada (`fin_plano_importacoes` já previsto) e chave estável (código reduzido + classificação + data), e lançamento referenciando a versão da conta vigente.
3. **Invariantes no banco, não na tela**: débito = crédito por lançamento (constraint trigger `deferrable initially deferred`), só conta analítica ativa, conciliado/exportado imutável, mês fechado só reabre por RPC da MDC com auditoria. O desenho já lista essas travas — garantir que sejam triggers/constraints, porque hoje há telas que escrevem direto via PostgREST.
4. **Origem rastreável**: cada lançamento com `origem_tipo` + `origem_id` (conciliação, nota, provisão, manual, folha). Desconciliar/cancelar nota = estorno, nunca delete.
5. **Reuso do balancete**: o plano de gerar o balancete no mesmo formato de `Linha` (de `lib/balancete.ts`) é bom, desde que o cálculo já esteja em `nucleo/contabil/` e rodando no servidor (5.1). Caso contrário a Contabilidade herda os riscos 1 e 2 do resumo.
6. **Exportação Domínio idempotente**: lote de exportação com id, lista de lançamentos travados e hash do arquivo; reexportar o mesmo lote gera o mesmo arquivo.

### 5.5 Pacotes e contratação (fase 1)

- "Portal mostra só o contratado" não pode ser só menu. A RLS das tabelas `fin_`/`fis_`/`ctb_` para o usuário do Portal precisa verificar contrato vigente: `app.portal_pode(cliente, perm) and app.cliente_tem_modulo(cliente, 'financeiro')`. Contrato encerrado bloqueia leitura e escrita do cliente, mantendo os dados.
- Contrato com vigência (`inicio`, `fim`) segue o mesmo cuidado de 5.2 (sem sobreposição para o mesmo módulo).

### 5.6 Volume e desempenho

- O padrão atual "buscar tudo e somar no navegador" (`limit(20000)` em `lib/demonstrativos.ts` e na Edge Function) não escala para extrato, itens de nota e lançamentos de vários clientes × anos. Relatórios devem vir de views/RPCs agregadas e paginadas.
- RLS com função por linha (`app.hub_pode(org_id, …)`) em tabelas grandes fica caro. Preferir `org_id in (select app.orgs_com_acesso('financeiro','ver'))` (avaliado uma vez por consulta) e índices iniciando por `org_id, cliente_id`.
- `OrgProvider` carrega todos os clientes da carteira em memória; com o Portal para clientes, isso precisa virar busca sob demanda.

### 5.7 Operação e mudança de esquema

- Aplicar migration de Financeiro/Contabilidade pelo SQL Editor, direto em produção e sem homologação, é o maior risco operacional: dado contábil não se "volta" com `drop`. Supabase CLI + projeto de homologação + pgTAP são pré-requisitos da fase 2.
- Auditoria: `hub_auditoria` só é preenchida dentro de algumas RPCs (`app.registrar` aparece em 7 migrations). Escrita direta via PostgREST não é auditada. Para `fin_`/`fis_`/`ctb_`, usar trigger genérico de auditoria (antes/depois) em todas as tabelas.
- Integração com layouts externos (Excel do Domínio, OFX, PDF de banco, leiaute de lançamentos do Domínio, XML NF-e/NFS-e) deve ficar em adaptadores versionados em `nucleo/layouts/` com arquivos de exemplo anonimizados como teste. Mudança de leiaute do Domínio hoje quebraria `lerBalancete` sem aviso.

---

## Anexo — inventário rápido

| Item | Valor |
|---|---|
| Rotas (`page.tsx`) | 25, todas client-side |
| Maiores arquivos | `hub/acessos/page.tsx` 1.302 · `config/page.tsx` 1.145 · `portal/page.tsx` 713 · `demonstrativos/Painel.tsx` 651 · `comercial/[id]/page.tsx` 618 · `lib/balancete.ts` 614 |
| Migrations | 20 arquivos, ~3.700 linhas SQL; ~96 funções `security definer` |
| Edge Functions | `convite`, `certificado`, `demonstrativo-pdf` (+ `balancete.ts`/`demonstracoes.ts` gerados por script) |
| Tabelas por prefixo | núcleo (organizacoes, setores, membros, clientes, cliente_responsaveis, feriados, modelos_recorrentes, tarefas, comentarios, historico) · `hub_` (apps, acessos, perfis, auditoria, notificacoes, arquivos, certificados) · `soc_` (7) · `portal_` (usuarios, convites, conversas, mensagens, balancetes, balancete_linhas, mapa_contas, mapa_dfc, pareceres) · `venc_itens` · `crm_` (oportunidades, atividades, modelos, contratos) · `app.convites`, `app.convite_envios` |
| Testes / lint / CI | nenhum |
