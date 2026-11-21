# Auditoria — HUB-MDC — sistema inteiro em 5 níveis

Data: 2026-11-21 · Versão/commit auditado: `d7c6a2e` (main) + banco de produção `bulqqdgfrrpqquqvjjfa` só em leitura ·
Auditor: Claude (skill auditoria-sistemas, régua dev-sistemas) · Revisado por: Edvaldo Ribeiro de Carvalho (a fazer)

Pedido do Edvaldo em 19/11/2026: "rever a codificação de forma que a programação fique limpa, sem sujeira, e passar por
auditoria de 5 níveis". Nada foi corrigido nesta execução: a correção começa depois que o plano for aprovado.

## 1. Resumo para quem não é técnico

O HUB está em bom estado: os 748 testes da tela e todos os testes de banco que rodam no computador passaram, a
compilação fecha sem erro e as regras de acesso do banco (RLS e funções com checagem) seguem firmes. As correções de
segurança da auditoria de 19/11 (SEG-04 a SEG-07, Omie sem gravação direta, migrações trazidas ao repositório) entraram.
**O maior risco de hoje é operacional:** a Função `omie-sincronizar` nova foi publicada às 10h52 (horário de Brasília)
esperando a tabela `omie_extrato` da migração 106, que **ainda não foi aplicada em produção**; a partir da próxima rodada
os saldos dos bancos do BI param de atualizar sem aviso claro. O segundo é de desempenho: o painel de indicadores do BI
levou 16 segundos numa consulta de 11 meses, e o banco corta em 8 segundos o que vem do site. Primeiro passo: aplicar a
106 (ou voltar a Função) hoje; depois, acelerar `bi_indicadores` e levar os testes do BI para fora da produção.

| Gravidade | Quantidade |
|---|---|
| Crítica | 0 |
| Alta | 2 |
| Média | 6 |
| Baixa | 8 |
| Sugestão | 2 |

## 2. Notas pelos 5 níveis pedidos (0 a 10)

| Nível | Nota | Justificativa |
|---|---|---|
| 1. Correção | 7 | Regras de dinheiro em `numeric` no banco e testadas; mas a Função foi ao ar antes da sua migração (ARQ-01) e há data em UTC num prazo fiscal (COD-13). |
| 2. Legibilidade e limpeza | 6 | Quase sem sujeira (1 TODO, nenhum `console.log` solto), mas 57 arquivos acima de 400 linhas, um novo de 722 (`AbaLancamentos.tsx`), 23 avisos de lint e ajudante de centavos repetido. |
| 3. Arquitetura | 6 | Regra no banco e em `dominios/` como manda o projeto; porém a publicação das Funções não respeita a ordem migração → código e os testes do BI rodam na produção, fora do `rodar.sh` e do CI. |
| 4. Segurança | 8 | 414 funções `security definer` todas com `search_path` fixo e checagem; nada de chave de serviço no site; resta a defesa em profundidade (grants a `anon`, `search_path = public`) e dependências com aviso. |
| 5. Desempenho | 6 | Bom na maioria das telas; `bi_indicadores` passa do tempo limite, o painel inicial chega a 4 s e há 196 chaves estrangeiras sem índice. |

Notas na régua da skill (para comparar com as auditorias anteriores): Segurança 8 · Arquitetura e organização 6 ·
Qualidade de código 6 · Testes 7 · Documentação e operabilidade 8 · Interface e usabilidade 8 (sem fotos novas,
ver seção 6) · Acessibilidade 7 (amostra).

## 3. Pontos fortes

- **Banco como guardião:** 414 funções `security definer`, nenhuma sem `search_path` fixo (aviso do Supabase zerado);
  nenhuma tabela exposta sem RLS (as 7 sem RLS ficam no esquema `app`, sem permissão para `anon`/`authenticated`);
  ninguém além do dono cria objetos no esquema `public`.
- **Correções de 19/11 confirmadas:** 099 tirou a gravação direta do Omie/BI (NOV-01, 05, 06); 101 removeu o modelo B
  do Omie (NOV-02, NOV-10); 103 fechou SEG-04 a SEG-07 (`hub_senha_trocada` exige troca, `lic_assinatura_*` com limite
  de tentativas e IP, `lic_uso_teto`, `app.org_mdc()` no lugar de `limit 1`); 15435bc desligou a IA paga da Função
  `pessoal-voz` (SEG-03); as 9 migrações que existiam só em produção estão no repositório com o md5 conferido
  (ALT-02, `docs/04-banco-de-dados.md` 4.5.1).
- **BI com acesso auditado:** toda leitura passa por `app.bi_org_dos_clientes` (no máximo 50 empresas, uma organização,
  acesso conferido em cada uma) e grava `bi_acessos_log`; classificação só pelo gestor (`app.bi_exigir_gestor`) e com
  histórico de quem fez (`bi_plano_excecoes_hist.por`).
- **Site sem segredo:** as únicas rotas de servidor (`/api/versao`, `/api/android/assetlinks`, `/api/nfse-relay`) não
  usam chave de serviço; o retransmissor confere o código no banco e só fala com a Sefin Nacional.
- **Markdown seguro:** os três `dangerouslySetInnerHTML` passam por `mdParaHtml`, que escapa `&`, `<` e `>` antes e
  não gera links.
- **Conferências do projeto passam:** `npm run verificar` (tipos, lint sem erro, 96 arquivos com 748 testes, núcleo das
  Funções igual ao da tela, build) e `bash supabase/testes/rodar.sh` (saída 0; amostra dos blocos "(deve falhar)"
  conferida: todos terminam no erro em português esperado).
- **Dinheiro em decimal:** nenhuma coluna `float`/`real`/`double` nas migrações; valores em `numeric` e totais do BI
  arredondados no banco.

## 4. Achados

Identificadores: SEG (segurança), ARQ (arquitetura), COD (código), DES (desempenho), TST (testes), DOC (documentação).

### [ARQ-01] Função do Omie publicada antes da migração 106 — **Alta** · Esforço: P
- **Onde:** `supabase/functions/omie-sincronizar/index.ts:280-282`; `supabase/migrations/106_omie_extrato.sql`;
  `.github/workflows/funcoes.yml` (execução 11, 13h52 UTC de hoje, sucesso).
- **Problema:** o commit `a092cbb` levou para a `main` a tabela nova `omie_extrato` (migração 106) e a Função que grava
  nela. A Action publicou a Função sozinha, mas a 106 não está em `supabase_migrations` de produção (a última é a 105) e
  `to_regclass('public.omie_extrato')` dá vazio. Na próxima rodada de cada empresa, o `delete` em `omie_extrato` falha,
  o `catch` da linha 383 troca o erro por "Saldos dos bancos: falha inesperada" e a rodada termina como **ok**.
- **Por que importa:** os saldos dos bancos do BI (tela de caixa × resultado) congelam sem ninguém perceber; o resumo da
  execução diz "ok". As notas e os títulos seguem gravando (o resto não é afetado).
- **Como corrigir:** hoje, uma das duas: (a) rodar a 106 no Postgres local com um teste e aplicar em produção; ou
  (b) publicar de novo a Função do commit `1d5795f` até a 106 estar aplicada. Depois, ver ARQ-05 para não repetir.
- **Como confirmar a correção:** `select to_regclass('public.omie_extrato')` não vazio e, na rodada seguinte,
  `omie_execucoes.contagem` com `saldos` e `extrato` preenchidos.

### [DES-02] Indicadores do BI passam do tempo limite do site — **Alta** (a confirmar na tela) · Esforço: M
- **Onde:** `supabase/migrations/097_bi_gestao_acesso_indicadores_orcamento.sql:250-300` (`public.bi_indicadores`).
- **Problema:** a função chama `app.bi_regra(...)` uma vez por linha de `omie_movimentos` (16,9 mil linhas) e, para cada
  título, soma as baixas com uma subconsulta sobre o `bx` inteiro (o custo cresce ao quadrado). No teste de produção da
  097, 11 meses das 3 empresas do Grupo Clara levaram **16,6 s** (`pg_stat_statements`). O papel `authenticated`
  tem `statement_timeout = 8s`.
- **Por que importa:** pelo site, o painel de indicadores cai com erro para períodos longos, e piora a cada mês de dados.
- **Como corrigir:** somar as baixas uma vez (`group by cliente_id, codigo_titulo, categoria_codigo`) e juntar por
  `join`; trazer a classe por `join` com o mapa/plano em vez de `bi_regra` por linha; índice em
  `omie_movimentos (cliente_id, codigo_titulo, categoria_codigo)`. Medir com `explain analyze` no Postgres local.
- **Como confirmar a correção:** a mesma chamada do `168_bi_acesso_097_producao.sql` abaixo de 2 s; a tela de
  indicadores aberta com o ano inteiro.

### [TST-03] Testes do BI, do Omie e da segurança rodam na produção — **Média** · Esforço: G
- **Onde:** `supabase/testes/168_bi_acesso_097_producao.sql`, `170_omie_bi_099_producao.sql`,
  `172_seguranca_103_producao.sql`, `180_bi_plano_104.sql`, `181_bi_classificacao_105.sql`; `rodar.sh:250-254`;
  `.github/workflows/web.yml` (sem testes de banco).
- **Problema:** as migrações 090 a 105 não rodam no Postgres temporário; os testes delas são executados direto no banco
  de produção dentro de `begin…rollback`. A 106 não tem teste. O CI continua sem testes SQL (ARQ-08 de 19/11).
- **Por que importa:** um teste errado (sem `rollback`, ou com `pg_sleep`/trava) mexe em dados reais; e nada impede
  que uma migração quebrada chegue à `main`, como aconteceu na ARQ-01.
- **Como corrigir:** criar `testes/18x_base_bi.sql` com as tabelas `omie_*`/`bi_*` mínimas (a partir das migrações 090,
  já no repositório), incluir 090–106 no `rodar.sh` e adicionar ao `web.yml` (ou a um `banco.yml`) um job com
  Postgres 16 que roda `rodar.sh`.
- **Como confirmar a correção:** `rodar.sh` aplicando até a 106 e o job verde no GitHub.

### [ARQ-04] Publicação automática das Funções sem a ordem migração → código — **Média** · Esforço: M
- **Onde:** `.github/workflows/funcoes.yml:9-12, 46-55`.
- **Problema:** todo push na `main` que mexe em `supabase/functions/` publica **todas** as Funções, sem conferir se as
  migrações do repositório já estão em produção, e com o CLI do Supabase em `version: latest` (sem versão fixa).
- **Por que importa:** foi o caminho da ARQ-01; e uma versão nova do CLI pode mudar o comportamento da publicação sem
  aviso.
- **Como corrigir:** antes de publicar, um passo que compara a lista de `supabase/migrations/` com
  `supabase migration list` (ou falha se houver arquivo mais novo que a última aplicada); fixar a versão do CLI;
  publicar só as Funções que mudaram.
- **Como confirmar a correção:** um PR de teste com migração não aplicada deixa a Action vermelha.

### [SEG-05] Papel `anon` com permissão de tabela em 83 tabelas — **Média** · Esforço: P
- **Onde:** banco de produção (`information_schema.role_table_grants`): `anon` com SELECT em 83 tabelas e
  INSERT/UPDATE/DELETE em dezenas (`fin_titulos`, `membros`, `organizacoes`, `lic_contratos`, `portal_*`…).
- **Problema:** hoje as políticas de RLS barram tudo (todas exigem login), então não há vazamento. Mas a única barreira
  é a política: uma política futura escrita `to public` sem checar login abriria a tabela para quem não está logado.
  Já existem 14 políticas `to public` nas tabelas `bi_*`/`omie_*` (ver SEG-14).
- **Por que importa:** defesa em profundidade num sistema com dados de clientes e financeiro.
- **Como corrigir:** migração com `revoke all on all tables in schema public from anon;` e devolver só o que as páginas
  sem login usam (assinatura do contrato e leads já usam funções, não tabelas); teste que prova `anon` sem acesso.
- **Como confirmar a correção:** consulta de grants sem `anon` e as páginas públicas (assinatura, Portal antes do
  login, cadastro do MDC · Pessoal) funcionando.

### [DES-06] Painel inicial lento e políticas calculadas linha a linha — **Média** · Esforço: M
- **Onde:** `vw_painel_responsaveis` / `vw_painel_setores` (média ~0,5 s, máximo 3,7–4,2 s em 38 chamadas); avisos do
  Supabase: 10 `auth_rls_initplan` (`comentarios`, `hub_acessos`, `hub_notificacoes`, `portal_usuarios`,
  `bi_cfop_regras`, `bi_complementar_lotes`, `bi_acessos`), 14 `multiple_permissive_policies`, 196 chaves
  estrangeiras sem índice, 54 índices sem uso.
- **Problema:** as visões são `security_invoker` e `tarefas` tem políticas que chamam funções `app.*` para cada linha;
  `auth.uid()` sem `(select …)` em 10 políticas é recalculado por linha.
- **Por que importa:** a tela inicial é a mais aberta do HUB; fica mais lenta a cada tarefa nova.
- **Como corrigir:** trocar `auth.uid()` por `(select auth.uid())` nas 10 políticas; juntar políticas permissivas
  repetidas; criar índices nas chaves estrangeiras das tabelas grandes (`tarefas`, `omie_*`, `fin_titulos`,
  `portal_mensagens`); avaliar o painel como RPC agregada.
- **Como confirmar a correção:** avisos `auth_rls_initplan` zerados e o painel abaixo de 300 ms em `pg_stat_statements`.

### [COD-07] Arquivos grandes e avisos de lint — **Média** · Esforço: M (por arquivo)
- **Onde:** 57 arquivos `.ts/.tsx` acima de 400 linhas (fora `database.types.ts`); entre os mexidos desde 19/11:
  `dominios/bi/componentes/AbaLancamentos.tsx` (722, novo), `licencas/componentes/AssistenteContrato.tsx` (664, era
  657), `tarefas/componentes/TarefaEditor.tsx` (627), `app/(hub)/licencas/contratos/page.tsx` (550). `npm run lint`:
  0 erros e 23 avisos (era 22), quase todos "setState dentro de useEffect".
- **Problema:** componentes de 500–600 linhas numa só função misturam carga, regra e tela.
- **Por que importa:** cada mudança fica mais arriscada e cara de revisar; os avisos escondem um aviso novo que importe.
- **Como corrigir:** ao mexer no arquivo, separar janelas e abas em `_componentes/` e regras em `dominios/` com teste
  (começar por `AbaLancamentos.tsx` e `AssistenteContrato.tsx`); zerar os avisos e tornar `--max-warnings=0` no
  `verificar`.
- **Como confirmar a correção:** `npm run lint` com 0 avisos; arquivos tocados abaixo de 400 linhas.

### [SEG-08] Dependências com aviso de segurança — **Média** · Esforço: P
- **Onde:** `web/package.json` / `package-lock.json`.
- **Problema:** `npm audit` aponta 11 avisos (10 moderados, 1 crítico). No que vai para o site (`--omit=dev`) só 2
  moderados: `uuid` < 11.1.1 via `exceljs`. O crítico e os demais são de ferramentas de desenvolvimento (`vitest`
  ≤ 4.1.10 e `minimatch` via `typescript-eslint`), com correção por `npm audit fix` sem quebra.
- **Por que importa:** o crítico do `vitest` só vale com o modo servidor/navegador dos testes, mas corre na máquina de
  quem desenvolve e no CI.
- **Como corrigir:** `npm audit fix` (sem `--force`), rodar `npm run verificar`; para o `uuid`, acompanhar versão nova
  do `exceljs` ou `overrides` com `uuid@^11.1.1` testando a exportação para Excel.
- **Como confirmar a correção:** `npm audit` só com os 2 moderados do `exceljs` (ou zero).

### [SEG-09] `search_path = public` em vez de vazio nas funções privilegiadas — **Baixa** · Esforço: G (gradual)
- **Onde:** 369 das 414 funções `security definer` em `public`/`app` (ex.: `bi_relatorio`, `fin_baixar`,
  `lic_assinatura_aceitar`); a regra 4 de `docs/04-banco-de-dados.md` manda `set search_path = public, app`.
- **Problema:** caminho fixo, mas não vazio. Como ninguém além do dono cria objetos em `public`, o risco hoje é baixo.
- **Como corrigir:** nas funções novas e nas que forem reescritas, `set search_path = ''` com nomes qualificados
  (`public.`, `app.`), como já fazem 103 e 089; atualizar a regra no capítulo 4.
- **Como confirmar:** contagem de `search_path=public` caindo a cada migração.

### [COD-10] Prazo da ciência da NF-e calculado na data UTC — **Baixa** · Esforço: P
- **Onde:** `supabase/functions/fiscal-captura/index.ts:125`.
- **Problema:** `new Date().toISOString().slice(0, 10)` vira o dia seguinte depois das 21h de Brasília; no último dia
  do prazo, a ciência das últimas horas fica para trás. A `omie-sincronizar` já tem `hojeSP()`.
- **Como corrigir:** usar o mesmo ajudante de data de Brasília (levar `hojeSP` para `_compartilhado`).
- **Como confirmar:** teste com relógio às 22h do último dia.

### [COD-11] Ajudante de centavos repetido no BI — **Baixa** · Esforço: P
- **Onde:** `web/src/dominios/bi/saldos.ts:35`, `relatorio.ts:35`, `conciliacao.ts:113`, `detalhe.ts:43`,
  `classificacao.ts:52`.
- **Problema:** cinco cópias de `Math.round(v * 100) / 100`; somas em `number` antes de arredondar.
- **Como corrigir:** um `centavos()` em `lib/formato/` com teste de casos como 0,1 + 0,2 e 1,005; usar nos cinco.

### [SEG-12] `hub-integracao`: sistema aceito por propriedade herdada e recusa sem limite — **Baixa** · Esforço: P
- **Onde:** `supabase/functions/hub-integracao/index.ts:43` (NOV-09 de 19/11, ainda em aberto).
- **Problema:** `sistema in ACOES` aceita nomes como `constructor`; toda chamada recusada grava uma linha em
  `app.integracao_chamadas`, sem limite por origem.
- **Como corrigir:** `Object.hasOwn(ACOES, sistema)` e limite simples (por exemplo, não registrar mais de N recusas por
  minuto por IP).

### [DOC-13] Régua dev-sistemas: proteção de segredos e histórico — **Baixa** · Esforço: P
- **Onde:** `.gitignore` e `web/.gitignore` sem `.env*` e `*.pfx`; sem `CHANGELOG.md` e `.env.example` na raiz.
- **Problema:** nenhum segredo está versionado hoje (conferido), mas nada impede um `.env.local` ou certificado A1 de
  entrar num commit por engano. O histórico das versões vive no Manual ("Controle de versões"), não num CHANGELOG.
- **Como corrigir:** acrescentar `.env*`, `!.env.example`, `*.pfx`, `*.p12` aos `.gitignore`; um `.env.example` só com
  os nomes das variáveis (sem valores).

### [SEG-14] Políticas `to public` nas tabelas do BI e do Omie — **Baixa** · Esforço: P
- **Onde:** 14 políticas de leitura (`omie_notas_ver`, `omie_mov_ver`, `bi_grupos_ver`, `bi_cfop_ver`…).
- **Problema:** valem também para `anon`; hoje as funções que elas chamam exigem login, mas `bi_cfop_ver` é só
  `auth.uid() is not null`.
- **Como corrigir:** recriar com `to authenticated` e `(select auth.uid())` (resolve junto parte da DES-06).

### [TST-15] Testes com identificadores reais de pessoa e de clientes — **Baixa** · Esforço: P
- **Onde:** `supabase/testes/168_…`, `170_…`, `172_…`, `180_…`, `181_…` (id do usuário do Edvaldo e das 3 empresas do
  Grupo Clara).
- **Problema:** o repositório passa a carregar identificadores reais; some quando a TST-03 levar os testes para dados
  simulados.

### [COD-16] Sobras pequenas — **Baixa** · Esforço: P
- **Onde:** `web/src/components/shell/MenuLateral.tsx:168` (único TODO); 3 tabelas sem chave primária
  (`app.convite_envios`, `app.pessoal_tentativas`, `app.pessoal_cadastros`); 12 tabelas com RLS e sem política
  (propositais, só funções gravam — vale um `comment on table` dizendo isso em cada uma).
- **Como corrigir:** resolver ou registrar o TODO; `id bigint generated always as identity primary key` nas três.

### [SUG-17] Conferência da classificação pelo próprio autor — **Sugestão**
- **Onde:** `105_bi_classificacao_saldos.sql:284-296` (`bi_excecao_conferir`).
- **Ideia:** se "conferir" tiver papel de segundo olho, recusar quando `alterado_por = auth.uid()`, como já se faz em
  `bi_acesso_decidir`.

### [SUG-18] Rótulos e placeholders — **Sugestão**
- **Onde:** script `verificar_frontend.py`: 722 alertas de campo sem rótulo são falsos positivos (o `<label>` envolve o
  campo); 28 campos usam só o placeholder como rótulo (ex.: `components/ui/MultiSelecao.tsx:72`,
  `components/ui/Etiquetas.tsx:45`, `tarefas/page.tsx:292`).
- **Ideia:** dar `aria-label` ou rótulo visível nesses 28 e no link `target="_blank"` de
  `manual/_componentes/BlocosManual.tsx:86` (conferir `rel="noopener"`).

### Itens anteriores ainda em aberto (não reauditados a fundo nesta execução)
DES-11 (ordem dos botões nos assistentes), DES-12 (botões sem ícone), SEG-15 a SEG-17 e ARQ-18 do parecer de
19/11. SEG-01 consta como concluído em `6853e0f` (chaves antigas desligadas); não foi possível conferir o painel da
Vercel/Supabase daqui.

## 5. Plano de correção

| Ordem | Achados | O que fazer | Esforço | Responsável |
|---|---|---|---|---|
| 1 (hoje) | ARQ-01 | Testar e aplicar a 106, ou voltar a Função `omie-sincronizar` ao commit `1d5795f` | P | Edvaldo autoriza · Claude executa |
| 2 | DES-02 | Reescrever `bi_indicadores` (baixas somadas uma vez, classe por join, índice) com medição | M | Claude |
| 3 | ARQ-04, TST-03, TST-15 | Base simulada do BI/Omie no `rodar.sh`, job de banco no CI e trava "migração aplicada antes de publicar Função" | G | Claude |
| 4 | SEG-05, SEG-14, DES-06 | Uma migração de endurecimento: tirar grants de `anon`, políticas `to authenticated` com `(select auth.uid())`, índices nas chaves estrangeiras grandes | M | Claude |
| 5 | SEG-08, DOC-13, SEG-12, COD-10 | `npm audit fix`, `.gitignore`/`.env.example`, `Object.hasOwn` e data de Brasília | P | Claude |
| 6 (contínuo) | COD-07, COD-11, COD-16, SEG-09, SUG-17, SUG-18 | Limpeza ao mexer em cada arquivo: dividir os grandes, zerar o lint, `centavos()` único, `search_path = ''` nas funções reescritas | M | Claude |

Cada etapa num ramo próprio, com teste que prova a correção, `npm run verificar` + `rodar.sh` verdes e o capítulo de
`docs/` atualizado junto.

## 6. O que foi e o que não foi verificado

- **Executado:** `inventario.py` e `verificar_frontend.py` (auditoria-sistemas) e `auditar_projeto.py` (dev-sistemas),
  com os achados conferidos no código (os "senhas fixas" apontados são valores de teste; os 722 alertas de rótulo são
  falsos positivos); `npm ci`; `npm run verificar` (ok: tipos, lint 0 erros/23 avisos, 96 arquivos com 748 testes,
  núcleo, build); `npm audit` e `npm audit --omit=dev`; `bash supabase/testes/rodar.sh` em Postgres 16 local (saída 0,
  amostra dos erros esperados conferida); avisos de segurança e de desempenho do Supabase; consultas só de leitura
  ao banco (migrações aplicadas, funções `security definer`, `search_path`, grants, políticas, visões, tempo das
  consultas em `pg_stat_statements`, `statement_timeout`, últimas execuções do Omie); histórico da Action
  "Publicar Funções".
- **Não verificado (e por quê):** `npm run telas` (precisa do site no ar com login; regra 9 — ninguém digita senha
  aqui); testes `*_producao.sql` (rodam em produção e esta execução era só leitura); tempo real de `bi_indicadores` pelo
  site (chamá-la grava `bi_acessos_log`); painéis da Vercel e do Supabase (segredos e chaves); acessibilidade com leitor
  de tela.
- **Comandos para o responsável rodar:** `cd web && npm run telas` com o site no ar; abrir BI de Gestão › Indicadores
  com 01/01/2026 a hoje e as 3 empresas do Grupo Clara (confirma a DES-02).

## 7. Ações fora do código

- **Hoje:** decidir entre aplicar a 106 ou voltar a Função (ARQ-01); conferir depois a tela de saldos do BI.
- Combinar com as outras sessões que nada que dependa de migração vai à `main` antes de a migração estar aplicada
  (ou da trava da ARQ-04 existir).
- Cadastrar no GitHub, se ainda não houver, um ambiente "produção" com aprovação manual para a Action de Funções.
