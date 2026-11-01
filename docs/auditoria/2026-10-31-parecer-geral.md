# Parecer geral de auditoria do HUB-MDC · 31/10/2026

- **Escopo:** revisão geral de **todo** o repositório no commit `048be17` (branch `main`): `web/` (152 arquivos TS/TSX),
  as 21 migrações em `supabase/migrations/` (001 a 020, incluindo a 007b), as três funções Edge (`convite`,
  `certificado`, `demonstrativo-pdf`), `infra/`, `scripts/`, `docs/`, `CLAUDE.md` e `.github/`. Inclui o commit
  `048be17`, feito depois do parecer anterior. Pedido do Edvaldo: dizer com franqueza se a base é sólida e segura para
  crescer (Financeiro, Fiscal, Contabilidade) e se dá para liberar aos clientes.
- **Quem auditou:** agente independente `auditor-hub`, que não participou da implementação. Leu o código, rodou as
  verificações e consultou o banco `bulqqdgfrrpqquqvjjfa` **só para leitura** (avisos, catálogo e `select`). Não
  aplicou migração, não alterou dado e não mudou nenhum arquivo além deste parecer e do índice.
- **Verificações automáticas** (`cd web && npm ci && rm -rf .next && npm run verificar && npm run telas`):

| Etapa | Resultado |
| --- | --- |
| `npm ci` | ok |
| `tsc --noEmit` | ok, 0 erros |
| `eslint .` | ok, 0 erros e 40 avisos (todos `react-hooks/set-state-in-effect`, estilo) |
| `vitest run` | ok, 18 arquivos e 95 testes passando |
| `next build` | ok, 25 rotas |
| `npm run telas` | ok, 25 de 25 telas carregam com o Supabase simulado |
| `npm audit --omit=dev` | 9 vulnerabilidades **moderadas**, todas de dependências do `exceljs` (`uuid`, `archiver`, `glob`, `minimatch`). Usadas só para gerar Excel no navegador; risco baixo. O SheetJS do CDN (0.18.5) não aparece aqui, ver M-N8. |
| Avisos de segurança do Supabase | 2 funções `security definer` executáveis **sem login** (`crm_receber_lead`, intencional; `hub_receber_arquivo_temp`, temporária); 38 executáveis por quem está logado (todas conferidas: checam permissão na primeira linha); proteção contra senha vazada **desligada** |
| Avisos de desempenho | 71 chaves estrangeiras sem índice, 10 políticas que recalculam `auth.uid()` por linha, 19 casos de políticas permissivas duplicadas. Irrelevante no volume atual (510 tarefas, 26 balancetes). |
| Migrações aplicadas × repositório | Banco tem 001 a 019 (inclui 007b). **A 020 não está aplicada.** Nenhuma migração aplicada que não esteja no repositório; os objetos `*_temp` existem no banco e não estão em nenhuma migração. |
| Funções Edge publicadas × repositório | `convite` v3: **idêntica**. `certificado` v1: **idêntica**. `demonstrativo-pdf` v4 (30/10 17:03 UTC): `index.ts` e `assinatura.ts` idênticos; `balancete.ts`, `demonstracoes.ts` e `pdf.ts` diferem só em formatação e na reorganização de 31/10 (conferido depois de formatar os dois lados: mesma lógica de cálculo). |
| `pg_cron` | 2 rotinas (`gerar-tarefas-recorrentes` 09:05 UTC e `avisar-vencimentos` 09:15 UTC), rodando como `postgres`, últimas execuções com sucesso em 31/10. |
| Storage | 1 bucket (`hub-arquivos`), privado, limite de 50 MB por arquivo, 2 objetos (logo). |

---

## Veredito

**Aprovado com ressalvas.** A base é sólida e bem organizada, e não achei nada crítico. Mas **não libere o Portal aos
clientes** antes de três coisas: aplicar a 020 (com os ajustes já apontados), corrigir o limite de 1.000 linhas por
leitura (A-G1) e tirar meses em rascunho do PDF assinado (A-G2).

---

## Posso confiar no que está sendo construído?

Resposta curta: **sim, a fundação é boa, e é melhor do que a média de sistemas desse porte.** O receio é legítimo,
mas o que preocupa não está na fundação. Está em alguns acabamentos que ficaram pendentes e numa rotina de publicação
do banco que ainda é manual.

**O que é sólido (pode confiar):**
- **Separação entre clientes no Portal.** Conferi tabela por tabela no banco: cada cliente só enxerga a própria
  empresa (balancete, parecer, documentos, chat, vencimentos, rotinas, processos). A regra está **no banco**, então
  vale para a tela e para quem tentar chamar o sistema "por fora". Não achei como um cliente ler dado de outro.
- **Regras de acesso da equipe** também estão no banco: as 38 funções sensíveis conferem a permissão antes de fazer
  qualquer coisa. O cadastro público está fechado: conta só nasce por convite.
- **Certificado A1:** o arquivo e a senha ficam no cofre do Supabase e nunca chegam ao navegador. Só o servidor assina,
  e só assina balancete publicado.
- **Dados guardados com precisão:** saldos em `numeric` (sem erro de arredondamento no banco), um balancete por
  empresa e mês (o banco impede duplicata), histórico das tarefas automático.
- **Código organizado e verificado:** pastas por assunto, testes nos cálculos, verificação automática no GitHub a cada
  envio, documentação de verdade (capítulos, fluxos, diagramas e decisões). Um programador novo consegue se achar.
- **As funções publicadas no servidor batem com o repositório** (conferido arquivo por arquivo).

**O que é risco real (corrigir antes de liberar):**
1. **A correção de segurança (020) está escrita, mas não foi aplicada.** Enquanto isso, um gestor (hoje 2 pessoas)
   consegue, por fora da tela, se dar acesso de "cliente" a qualquer empresa e ler os demonstrativos dela, e esse
   acesso continuaria depois de ele sair da MDC. Isso é um risco interno, não de alguém de fora.
2. **O sistema lê no máximo 1.000 linhas por consulta e não avisa.** Hoje há 498 tarefas abertas. Quando o próximo mês
   for gerado, o quadro de tarefas e a TV vão passar de 1.000 e **algumas tarefas vão sumir da tela sem aviso**. No
   balancete, uma empresa com mais de 1.000 contas teria o anexo do PDF cortado e, se alguém clicar em "Reprocessar",
   **perderia as contas excedentes**. Hoje o maior balancete tem 433 contas, então isso ainda não aconteceu.
3. **O PDF assinado pode levar números de meses ainda em rascunho** no quadro "Acumulado do ano", quando quem baixa é
   alguém da MDC. O mesmo mês, baixado pelo cliente, sai diferente.

**O que é só melhoria (não impede liberar):** exportação PDF/Excel que falta em várias telas, arquivos grandes que
merecem ser divididos, avisos de desempenho do banco, ligar a verificação em duas etapas (MFA) para administradores,
documentar os outros módulos como já foi feito com o Demonstrativos.

**Para os módulos futuros (Financeiro, Fiscal, Contabilidade):** a base aguenta, **desde que** duas decisões já
escritas virem prática antes de começar: (a) banco de homologação e Supabase CLI (decisão 0002), para nunca mais
testar mudança direto em produção; (b) cálculo que vira documento rodando no servidor e gravado numa única transação
(decisão 0003). Sem isso, o Financeiro (conciliação que gera lançamento contábil) herdaria exatamente os riscos dos
achados A-G1, A-G2 e M-N6.

---

## Situação da migração 020 (o risco real de produção hoje)

- **Aplicada?** Não (`list_migrations` mostra 001 a 019). O arquivo não mudou desde `25427a2`: os ajustes M-N1, M-N2,
  `enviado_por` (M-N3), B-N1, B-N2 e B-N3 do parecer anterior **continuam pendentes no arquivo**.
- **O que está aberto em produção por causa disso** (confirmado no banco agora):
  - `portal_usuarios_write FOR ALL` ativa (A-2). Quem pode explorar hoje: 2 gestores (1 deles também com Atendimento ›
    gerir). Há 0 linhas em `portal_usuarios`, então **não houve uso** até agora.
  - Linhas de balancete publicado alteráveis por quem tem Demonstrativos › operar (M-1). Há 1 balancete publicado
    (MDC, dez/2025, com certificado cadastrado).
  - `soc_concluir_processo` antiga: sem checar processo aberto nem exigir gestor para baixa (M-2).
  - Arquivos: `hub_arquivos_equipe FOR ALL` e Storage com apagar liberado a qualquer membro (M-3). Há 0 arquivos e
    0 contas TV, então o risco hoje é baixo.
  - 21 funções comuns do esquema `app` (mais 19 de gatilho, que não se chamam diretamente) executáveis por `anon` e
    `authenticated` (M-4), entre elas `soc_iniciar_fase`,
    `soc_evento`, `venc_avisar` e `semear_societario`, que **não** checam permissão. `anon` e `authenticated` têm
    `USAGE` no esquema `app`. Fica explorável só se `app` estiver em "Exposed schemas" da API (**a confirmar** no
    painel: Settings › API; a documentação diz que não está).
  - `hub_receber_arquivo_temp` executável sem login; hoje não tem efeito (não há vaga aberta em
    `app.recebimento_temp`, que guarda 1 registro JSON de ~106 KB recebido em 30/10).
- **A 020 está pronta?** **Quase.** Conferi de novo que ela não quebra as views (usam só `app.hoje`, que continua
  liberada), os gatilhos sem `security definer` (`tg_publicacao_protegida` chama só `hub_pode`, liberada;
  `tg_tarefa_antes`, `tg_perfil_validar` e o novo `tg_arquivo_imutavel` não chamam nada do `app`), as políticas e o
  `pg_cron` (roda como `postgres`). Antes de aplicar, faça no próprio arquivo:
  1. M-N1: deixar passar `UPDATE` com `new.ativo = false` no gatilho `tg_portal_usuario_nao_equipe` (`020:30`).
  2. M-N2 e M-N3: tornar imutáveis `org_id`, `user_id`, `cliente_id` em `portal_usuarios` e `enviado_por` em
     `hub_arquivos` (`020:131`).
  3. B-N1: liberar à TV a leitura da pasta `<org>/marca/` no Storage (`020:144-146`), senão a logo some da TV.
  4. B-N2: `drop policy if exists` antes de cada `create policy` novo (`020:22`, `:118-126`, `:144-151`).
  5. Corrigir o cabeçalho (B-N3) e, ao aplicar, rodar de novo `get_advisors` e a lista de funções executáveis.
  Teste rápido depois de aplicar: TV abre `/tv` com logo; analista envia arquivo numa tarefa; gestor desmarca uma
  empresa de um acesso de portal; publicar e despublicar um balancete; concluir um processo comum.

---

## Achados novos desta revisão geral

### Crítico

Nenhum.

### Alto

**A-G1 · Leituras limitadas a 1.000 linhas, sem aviso: tarefas somem da tela e balancete pode perder contas**
- **Evidência:** a API do Supabase devolve no máximo 1.000 linhas por consulta (padrão "Max rows"; **a confirmar** o
  valor no painel: Settings › API). O `.limit(...)` maior que isso não aumenta o teto. O próprio código já sabe disso
  num lugar só: o relatório de tarefas pagina de 1.000 em 1.000 (`app/(hub)/tarefas/relatorio/page.tsx:98`). Nos
  demais, não:
  - `dominios/tarefas/useTarefas.ts:29` (`.limit(3000)`): quadro de tarefas, abertas + últimos 45 dias.
  - `dominios/demonstrativos/repositorio.ts:126` (`recalcular`) e `:193` (`reprocessar`), `.limit(20000)`.
  - `supabase/functions/demonstrativo-pdf/index.ts:59`: linhas do anexo do PDF assinado.
  - `app/(hub)/demonstrativos/[id]/page.tsx:62` e `:75`, `app/portal/page.tsx:273`.
  - `app/(hub)/societario/page.tsx:42` e `societario/painel/page.tsx:27` (fases, `.limit(10000/20000)`).
  - `app/(hub)/demonstrativos/importar/_componentes/ImportacaoLote.tsx:64-68` (M-N5, sem limite nenhum).
- **Cenário 1 (próximo mês):** o banco tem 510 tarefas da competência 09/2026, 498 abertas. Com a próxima competência
  gerada pelo `pg_cron`, as abertas passam de 1.000. O quadro, ordenado por prazo, recebe só as 1.000 primeiras: as de
  prazo mais distante **não aparecem** para ninguém, sem mensagem de erro.
- **Cenário 2 (perda de dado):** um cliente com plano de contas grande (indústria no Lucro Real) gera balancete com
  1.200 linhas. A importação grava as 1.200 (insere em blocos de 500). Ao clicar "Reprocessar", `reprocessar` lê só
  1.000, **apaga as 1.200** (`repositorio.ts:205`) e regrava 1.000: 200 contas somem, e o resumo é recalculado sem
  elas. O PDF assinado desse mês sai com o anexo cortado em 1.000 linhas. Hoje o maior balancete tem 433 linhas, então
  ainda não aconteceu.
- **Correção:** uma função única `lerTudo(consulta)` que pagina com `.range()` até vir menos de 1.000 (o relatório já
  faz isso) e usá-la em todos os pontos acima, inclusive na função Edge. Em `reprocessar`, conferir que o número de
  linhas lidas é igual a `count` antes de apagar. Melhor ainda: mover `reprocessar` para uma RPC no banco (ver M-N6).

**A-G2 · PDF assinado inclui meses em rascunho no "Acumulado do ano" quando baixado pela equipe**
- **Evidência:** `supabase/functions/demonstrativo-pdf/index.ts:60` busca os meses do ano **sem filtrar
  `status = 'publicado'`**, usando o login de quem pediu. Para a equipe, o RLS devolve também os rascunhos
  (`bal_equipe_select`); para o cliente, só os publicados (`bal_cliente_select`). As linhas `:70-77` montam o
  "Acumulado" quando há todos os meses, e `:82-86` assinam o PDF se o mês pedido está publicado.
- **Cenário:** dezembro publicado, novembro ainda em rascunho com grupos errados. O contador baixa o PDF de dezembro
  para mandar ao banco do cliente: sai **assinado com o certificado ICP-Brasil do responsável técnico** e com a DRE e a
  DFC acumuladas somando um novembro não revisado. O cliente, ao baixar o mesmo mês, recebe um PDF **sem** o acumulado.
  Dois documentos assinados diferentes para o mesmo mês.
- **Correção:** em `:60`, acrescentar `.eq("status", "publicado")` quando o PDF for assinado (ou sempre). Junto, ver
  M-G1 (o que foi assinado não fica guardado).

**A-2 (antigo, banco e segurança) · Acesso de portal como porta dos fundos** — continua **aberto em produção** até a
020 ser aplicada (ver seção anterior).

### Médio

**M-G1 · O documento publicado pode mudar depois de assinado, e nada guarda o que foi entregue**
- **Evidência:** `016_endurecimento_auditoria.sql:89` deixa quem tem Demonstrativos › gerir alterar `resumo`,
  `indices`, `alertas` e `demonstracoes` de um balancete **publicado**, sem registro em `hub_auditoria` (as ações
  registradas hoje são só `publicar`, `despublicar`, `convite`, `vincular_perfil` e `certificado_cadastrado`).
  `recalcular` (`repositorio.ts:150`) grava esses campos a partir do navegador. O PDF é **gerado de novo a cada
  download** (`demonstrativo-pdf/index.ts:110-143`) e não fica cópia nem hash do que foi assinado.
- **Cenário:** em março, o cliente baixa o PDF assinado de janeiro e entrega ao banco. Em abril, alguém ajusta um grupo
  de conta e recalcula janeiro sem despublicar. O cliente baixa de novo e recebe outro PDF assinado, com outros
  números. Ninguém consegue provar qual versão foi entregue em março.
- **Correção:** (1) bloquear no gatilho qualquer mudança de conteúdo em balancete publicado (só despublicando);
  (2) ao publicar, gravar o PDF assinado no Storage com hash e versão, e servir essa cópia ao cliente; (3) registrar
  em `hub_auditoria` toda mudança de conteúdo de balancete e parecer.

**M-G2 · Exclusão física em cascata, sem trava nem registro**
- **Evidência:** `clientes_write FOR ALL` para gestor (`001_schema.sql:298`). As FKs de `portal_balancetes`,
  `portal_pareceres`, `portal_conversas`, `venc_itens`, `portal_usuarios` e dos mapas apontam para `clientes` com
  `ON DELETE CASCADE` (catálogo `pg_constraint`). `bal_equipe_delete` (`016:53`) deixa quem gere apagar balancete
  **publicado**. A tela não oferece esses botões, mas a API sim.
- **Cenário:** um gestor apaga pela API um cliente que ainda não tem tarefas (por exemplo, um recém-cadastrado com
  balancetes importados). Somem todos os balancetes, pareceres, conversas e vencimentos dele, sem registro. As tarefas
  usam `NO ACTION`, o que impede a exclusão de quem já tem tarefa, mas não protege os demais.
- **Correção:** trocar o `FOR ALL` por `SELECT/INSERT/UPDATE` (cliente sai por inativação, que já existe); proibir
  apagar balancete publicado no gatilho; registrar exclusões em `hub_auditoria`. Para os módulos fiscais isso vira
  regra: documento fiscal nunca é apagado (já está no desenho, `docs/futuro/hub-gestao-desenho.md`).

**M-G3 · Telas sem exportação PDF/Excel, contrariando a regra 8.3 (obrigatória)**
- **Evidência:** `grep` por geração de Excel/PDF: só existe em `tarefas/relatorio`, `comercial/leads`,
  `demonstrativos/[id]` (via `ExportarPeriodo`), `demonstrativos/importar` (resumo do lote), `portal` e no contrato do
  CRM. **Não** exportam: lista de Tarefas, Vencimentos, Societário (lista e painel), funil do Comercial, Atendimento,
  lista de Demonstrativos, Riscos, carteira de Clientes (Configurações).
- **Correção:** um componente único `BotoesExportar` sobre `lib/arquivos/excel.ts` e `relatorioPdf.ts`, recebendo as
  linhas já filtradas da tela, e aplicá-lo nessas telas. Os filtros "período em um clique" e "Limpar" também não
  aparecem em Vencimentos, Societário e Demonstrativos.

**M-G4 · Contas de administrador sem verificação em duas etapas, e proteção contra senha vazada desligada**
- **Evidência:** `auth.mfa_factors` com 0 fatores verificados; aviso `auth_leaked_password_protection` do Supabase.
  Os 2 administradores podem trocar o certificado A1 que assina os demonstrativos e ler a auditoria.
- **Cenário:** a senha de um administrador vaza (reuso em outro site). Quem a tiver entra no HUB e cadastra outro
  certificado, ou lê os demonstrativos de toda a carteira.
- **Correção:** ligar a proteção contra senha vazada (Auth › Passwords) e exigir MFA (aplicativo autenticador) para
  administradores e para quem gere Demonstrativos. O Supabase já suporta; a tela de login precisa do passo extra.

**M-G5 · Rotina de banco ainda manual: a correção de segurança está escrita e não aplicada**
- **Evidência:** a 020 foi escrita em 31/10 06:02 e não foi aplicada; `docs/07-como-rodar-e-publicar.md` 7.3 manda
  aplicar pelo SQL Editor; não há projeto de homologação nem testes de RLS no repositório; `docs/04-banco-de-dados.md`
  não diz que a 020 está pendente (M-N11). O CI (`.github/workflows/web.yml`) roda `verificar`, mas não `telas`, e não
  impede a Vercel de publicar um push vermelho.
- **Por que é médio e não baixo:** é a causa de A-2 continuar aberto e é o maior risco para o Financeiro. Num módulo
  que gera lançamento contábil, uma migração errada aplicada direto em produção não se desfaz com um `drop`.
- **Correção:** executar a decisão 0002 antes da fase 2 do HUB Gestão (homologação, CLI, `estado-atual.sql`, testes
  pgTAP para "cliente A não lê B", "analista sem Demonstrativos", "TV"). Acrescentar `npm run telas` ao CI.

### Baixo

- **B-G1 · `demonstrativo-pdf` publicada está um passo atrás do repositório.** A versão 4 é de 30/10; a reorganização
  de 31/10 mudou `balancete.ts`, `demonstracoes.ts` e `pdf.ts`. Conferi que a lógica é a mesma (diferença só de
  formatação e de nomes de funções de formato). Publicar a versão do repositório para não perder a referência.
- **B-G2 · CORS `*` e mensagem crua continuam em `certificado` e `demonstrativo-pdf`** (`certificado/index.ts:7` e
  `:52`; `demonstrativo-pdf/index.ts:12`). Resto do B-4 antigo. Copiar a lista `ORIGENS` do `convite`.
- **B-G3 · Ordem do lote corrigida, mas sem teste e sem recalcular meses posteriores.** `048be17` ordena por empresa e
  mês corretamente (`ImportacaoLote.tsx:82-84`, gravação sequencial). Falta um teste, e um mês já gravado **depois**
  do lote (ex.: fevereiro já existia e o lote traz janeiro) continua com alertas comparados ao mês errado. Sugestão:
  ao fim do lote, oferecer "Recalcular os meses seguintes".
- **B-G4 · Filtro montado com texto do arquivo.** `repositorio.ts:167` monta `.or(classificacao.eq.${...})` com a
  classificação lida do Excel. Uma classificação com vírgula ou parêntese quebra o filtro (erro, sem vazamento: o RLS e
  o `balancete_id` continuam valendo). Usar `.eq` + `.like` separados.
- **B-G5 · Só o Demonstrativos tem capítulo em `docs/modulos/`.** Tarefas, Societário, Atendimento/Portal,
  Vencimentos e Comercial estão descritos só nos capítulos gerais. O checklist 8.5 exige capítulo por módulo.
- **B-G6 · Desempenho:** 71 FKs sem índice e 10 políticas com `auth.uid()` por linha (avisos do Supabase). Sem efeito
  hoje; tratar numa migração de manutenção antes de abrir para a carteira inteira.
- **B-G7 · Sem cabeçalho de segurança de conteúdo (CSP).** `next.config.ts` já envia `X-Frame-Options`, `nosniff` e
  `Referrer-Policy`, e o Worker envia HSTS. O HTML do parecer e do contrato é escapado (`lib/markdown.ts`), então não
  achei XSS; uma CSP é defesa extra.
- **B-G8 · Backups:** não consegui ver pelo acesso de leitura se o projeto tem backup diário ou PITR. **A confirmar**
  no painel (Database › Backups) antes de liberar aos clientes.

---

## Situação dos achados dos pareceres anteriores

Desde o parecer de 31/10 (`b5daf18`) só entrou `048be17` (ordem do lote) e o próprio parecer. Por isso, salvo onde
indicado, a situação é a mesma do parecer anterior, agora reconferida no banco.

### Parecer de 31/10 (`2026-10-31-parecer.md`)

| Achado | Situação |
| --- | --- |
| M-N1, M-N2 (gatilho do portal) | **Em aberto**, no arquivo da 020 ainda não aplicada |
| M-N3 (`enviado_por`, leitura por módulo) | **Em aberto** |
| M-N4 (ordem do lote) | **Resolvido** em `048be17` (sem teste, ver B-G3) |
| M-N5 (lote acima de 1.000 balancetes) | **Em aberto**; agora parte de A-G1 |
| M-N6 (gravação do balancete sem transação) | **Em aberto** |
| M-N7 (erro de leitura ignorado nas regras de conta) | **Em aberto** (`repositorio.ts:15`, `:27`, `:38`, `:158`) |
| M-N8 (SheetJS 0.18.5 do CDN, sem `integrity`) | **Em aberto** (`lib/arquivos/planilha.ts:2`) |
| M-N9 (validação com o Piloto HUB) | **Em aberto**: MDC e Greencore continuam com 1 balancete cada (dez/2025); só a Nexus, fora do piloto, tem 24 meses |
| M-N10 (tipos do banco não usados) | **Em aberto** (`lib/supabase.ts:20` sem `<Database>`) |
| M-N11 (decisão 0002 manda marcar 001–020 como aplicadas) | **Em aberto** (`docs/decisoes/0002-homologacao-e-cli.md:9`) |
| B-N1 a B-N3 (020) | **Em aberto** |
| B-N4 (temporários) | **Em aberto**: `app.recebimento_temp` (1 linha) e as duas funções `_temp` existem; `hub_receber_arquivo_temp` ainda executável sem login |
| B-N5 (link vazio no portal) | **Em aberto** (`EditorCliente.tsx:81`) |
| B-N6 (erro de gravação ignorado no portal) | **Em aberto** (`app/portal/page.tsx:592` e `:676`) |
| B-N7 (ajuste em balancete publicado aparece na tela) | **Em aberto** |
| B-N8 (doc do convite) | **Em aberto** |
| B-N9 (comentário solto na cópia do cálculo) | **Em aberto** |
| B-N10 (senha vazada) | **Em aberto**; incorporado em M-G4 |
| B-N11 (arquivos grandes) | **Em aberto**: 8 arquivos entre 551 e 820 linhas |

### Banco e segurança (`2026-10-31-banco-e-seguranca.md`)

| Achado | Situação |
| --- | --- |
| A-1 (link do convite) | **Resolvido em produção** na prática: a função `convite` publicada (v3, idêntica ao repositório) só devolve o link se `hub_pode_ver_link_convite` responder sim; como essa função ainda não existe no banco, ninguém recebe link. O gatilho continua aplicando o convite na criação da conta (aceitável com o link restrito). |
| A-2 (portal como porta dos fundos) | **Em aberto em produção** (alto). Parcialmente resolvido na 020 pendente. |
| M-1 linhas do publicado | **Em aberto em produção**; resolvido na 020 pendente |
| M-2 `soc_concluir_processo` | **Em aberto em produção**; resolvido na 020 pendente |
| M-3 arquivos | **Em aberto em produção**; parcial na 020 |
| M-4 funções internas | **Em aberto em produção** (21 funções comuns do `app` executáveis por `anon`); resolvido na 020 |
| M-5 FK entre organizações | **Em aberto**, latente (1 organização) |
| M-6 lead anônimo sem limite | **Em aberto** |
| B-1, B-2, B-3, B-5 | **Em aberto** |
| B-4 CORS e erro cru | **Parcial**: resolvido no `convite`; aberto nas outras duas (B-G2) |
| Manutenção do banco (COMMENT ON, deriva, CLI) | **Parcial**: comentários vêm na 020; CLI e homologação ainda proposta |

### Front-end (`2026-10-31-front-end.md`)

| Achado | Situação |
| --- | --- |
| A1 camada de dados | **Parcial** (sobram M-N7, M-N10, B-N6) |
| A2, A3, A6, A7, A8, A9, A10, A12, A13, A14 | **Resolvidos** (sem mudança) |
| A4 páginas grandes | **Parcial** (B-N11) |
| A5 acesso do portal em duas telas | **Em aberto** |
| A11 lint, testes, CI | **Resolvido**: correção do parecer anterior, que dizia não haver CI. Existe `.github/workflows/web.yml` (desde `4676d8c`) rodando `verificar` a cada push; falta incluir `telas` (M-G5) |
| A15 biblioteca por CDN | **Em aberto** (M-N8) |
| A16 tokens visuais | **Parcial** (não reavaliado a fundo) |

### Arquitetura (`2026-10-31-arquitetura.md`)

| Ponto | Situação |
| --- | --- |
| Estrutura por domínio, capítulos, diagramas, decisões | **Feitos** e de boa qualidade |
| 5.1 cálculo no navegador (decisão 0003) | **Em aberto**: o resumo, os índices e as demonstrações que o PDF assina continuam vindo do navegador; `scripts/nucleo_balancete.py` ainda copia o cálculo por expressão regular |
| 5.7 homologação e CLI (decisão 0002) | **Em aberto** (M-G5) |
| 5.2 a 5.5 (motor de regras com vigência, serviço fiscal, contabilidade espelho, pacotes) | Ainda não implementados; o desenho em `docs/futuro/` incorporou as recomendações |

---

## Avaliação das decisões (`docs/decisoes/`)

- **0001 (navegador + Supabase com RLS):** faz sentido para uma equipe pequena, e a execução é boa: as regras estão
  mesmo no banco. O preço é que **toda** regra precisa estar no banco, inclusive "não apagar" e "não mudar depois de
  publicado" (M-G1, M-G2).
- **0002 (homologação e CLI):** correta e **urgente**. Deve ser a primeira tarefa antes do Financeiro. Corrigir a linha
  9 (M-N11).
- **0003 (cálculo no servidor):** correta. É o que fecha A-G2, M-G1 e M-N6 de uma vez para o Demonstrativos, e é
  pré-requisito do Financeiro e do Fiscal.
- **0004 (integração fiscal própria no Cloud Run):** viável, mas é a decisão de maior risco técnico. Emitir NF-e sem
  intermediário exige tratar contingência, numeração sem buracos, eventos e mudança de leiaute da SEFAZ e da NFS-e
  nacional. Os cuidados registrados estão certos. Recomendo começar só pelo **recebimento** (Distribuição DF-e), que
  não gera obrigação, e deixar a emissão para depois de o serviço estar estável em homologação.
- **0005 (Domínio é o livro oficial):** acertada. Reduz muito o risco: o HUB é gerencial e conferido contra o Domínio.
- **Ponto de atenção no desenho futuro:** "o administrador da MDC acessa todos os certificados A1 dos clientes"
  (`docs/futuro/hub-gestao-desenho.md`). Junto com M-G4 (sem MFA), isso concentraria muito poder numa senha. Exigir
  MFA e registrar cada uso de certificado antes desse módulo.

---

## Recomendações para a próxima etapa (em ordem)

1. **Antes de liberar o Portal aos clientes:**
   - Ajustar a 020 (5 itens da seção "Situação da migração 020"), aplicar e conferir `get_advisors`.
   - A-G1: paginação em todas as leituras listadas; conferir "Max rows" no painel. É urgente para Tarefas, porque a
     próxima competência gerada já passa do limite.
   - A-G2: filtrar só meses publicados no PDF.
   - Confirmar backups (B-G8) e ligar a proteção contra senha vazada.
   - M-N9: importar 12 meses da MDC e da Greencore pelo lote e conferir trimestre, semestre e ano contra o Domínio.
2. **Migração 021:** M-G1 (travar conteúdo publicado e auditar), M-G2 (sem exclusão física de cliente e de publicado),
   temporários (B-N4), `crm_receber_lead` com limite (M-6), escrita em `membros` só por função (B-5).
3. **Antes do Financeiro:** decisões 0002 e 0003 executadas; RPC transacional para gravar balancete (M-N6); MFA para
   administradores (M-G4); tipos do banco no `createClient` (M-N10).
4. **Contínuo:** exportação PDF/Excel nas telas que faltam (M-G3), capítulos de módulo (B-G5), `npm run telas` no CI.

---

## Reauditoria 01/11/2026 (commit 6a709b3)

**Escopo:** só o commit `6a709b3` ("leitura sem corte de 1.000 linhas e PDF assinado só com meses publicados"),
conferido no código, no banco de produção (somente leitura) e na função publicada.

### Veredito

**Pode publicar**, com uma condição: **publicar a função `demonstrativo-pdf` junto** (`supabase functions deploy`).
A versão no ar é a **v4, de 30/10/2026 14:03**, sem a correção (`get_edge_function` não encontra `lerTodasLinhas` nem o
filtro `status.eq.publicado`). Sem esse deploy, o push na `main` corrige as telas, mas o PDF assinado continua
somando rascunho (A-G2 segue aberto em produção). O commit também ainda não foi enviado (`main` à frente de
`origin/main` em 1).

### Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `cd web && npm ci && npm run verificar` | ok: tipos ok, lint 0 erros / 40 avisos (`set-state-in-effect`, já existentes), 19 arquivos de teste / 100 testes passando, build ok (25 rotas) |
| `npm run telas` | 25 de 25 telas ok |
| `deno check --config deno.json index.ts` (demonstrativo-pdf) | ok (saída 0) |
| Banco (leitura) | tarefas abertas na MDC: **953** (o limite estava a 47 linhas de ser atingido); maior balancete: 433 linhas; 26 balancetes; `portal_balancetes` tem `UNIQUE (cliente_id, competencia)` e `status` só `rascunho`/`publicado`; todas as tabelas paginadas por `id` têm a coluna `id` |

### A-G1 (leitura cortada em 1.000 linhas): resolvido nos pontos de risco, falta 1 item da lista

| Ponto listado no parecer | Situação |
| --- | --- |
| `dominios/tarefas/useTarefas.ts` (quadro de tarefas) | **Resolvido** (`lerTudo`, ordem `prazo, id`) |
| `repositorio.ts` `recalcular` e `reprocessar` | **Resolvido** (`lerLinhas`, ordem `classificacao, id`) |
| `reprocessar`: conferir contagem antes de apagar | **Resolvido** (`repositorio.ts:207-211`: `count exact` comparado com o lido; diferença aborta antes do `delete`) |
| `supabase/functions/demonstrativo-pdf/index.ts` (anexo do PDF) | **Resolvido no código** (`lerTodasLinhas`, `:36-51`; erro devolve 500 em `:86`, não gera PDF incompleto). **Falta deploy** |
| `demonstrativos/[id]/page.tsx` e `portal/page.tsx` (linhas) | **Resolvido** |
| `societario/page.tsx` e `societario/painel/page.tsx` | **Resolvido** |
| `demonstrativos/importar/_componentes/ImportacaoLote.tsx:64-68` (M-N5) | **Em aberto**: não foi tocado (ver R-1) |

Além da lista, o commit também paginou: início (`(hub)/page.tsx`), relatório (abertas), vencimentos, lista e riscos de
demonstrativos e leads do CRM. A função `lerTudo` (`web/src/lib/lerTudo.ts`) termina sempre (página vazia ou teto de
200.000 linhas com mensagem), repassa o erro e tem 5 testes. Todas as consultas paginadas terminam a ordem em `id`
(ordem estável, sem linha repetida ou pulada entre páginas). A mudança no simulador (`web/scripts/verificar-telas.mjs:197-203`)
está correta e era necessária: sem respeitar `offset/limit`, o simulador devolveria a mesma página para sempre.

### A-G2 (rascunho no PDF assinado): resolvido no código, falta deploy

`index.ts:82` agora filtra `.or(status.eq.publicado,id.eq.<id>)`. Conferido:
- **Segurança:** o `id` entra no filtro só depois de passar por `/^[0-9a-f-]{36}$/i` (`:67`), então não há como injetar
  vírgula ou parêntese no filtro. A consulta continua com o login de quem pediu (RLS vale igual).
- **Resultado:** o PDF só é assinado com o mês publicado (`:105`); nesse caso o acumulado usa só meses publicados, e
  equipe e cliente recebem o **mesmo** acumulado. Se algum mês anterior estiver em rascunho, a contagem
  (`:93`, com a garantia de `UNIQUE (cliente_id, competencia)`) não fecha e o acumulado é **omitido**, nunca somado
  errado. Rascunho baixado pela equipe soma meses publicados + o próprio rascunho, sem assinatura: aceitável.

### Achados da reauditoria

**R-1 · médio · Importação em lote ainda lê os balancetes existentes sem paginação (M-N5, item de A-G1 não feito)**
- `web/src/app/(hub)/demonstrativos/importar/_componentes/ImportacaoLote.tsx:67`: `select(...).eq("org_id", ...)` sem
  `range`. Com mais de 1.000 balancetes na organização, os que ficarem de fora não aparecem como "já existe" na
  avaliação do lote, e um **rascunho** existente é substituído sem a pessoa marcar "substituir" (`salvarBalancete`
  só barra publicado, `repositorio.ts:85`). Hoje são 26; com a carteira (100 clientes × 12 meses) passa de 1.000 em
  menos de um ano. Correção: `lerTudo` com `.order("id")`.

**R-2 · médio (latente) · Mapas de contas e de DFC lidos sem paginação**
- `web/src/dominios/demonstrativos/repositorio.ts:17` (`portal_mapa_contas`) e `:29` (`portal_mapa_dfc`): sem `range`.
  Não estavam na lista do parecer. Se o mapa da organização passar de 1.000 classificações, parte das contas perde o
  grupo e as demonstrações saem erradas **sem aviso** (o erro de leitura também é ignorado, M-N7). Hoje: 2 linhas.
  Correção: `lerTudo` + tratar o erro.

**R-3 · baixo · Erro de leitura vira tela vazia em três pontos (comportamento anterior mantido, não é regressão)**
- `web/src/app/(hub)/demonstrativos/riscos/page.tsx:33`: falha → lista vazia, a tela parece "sem riscos".
- `web/src/app/portal/page.tsx:272`: falha → o cliente vê o balancete sem nenhuma conta.
- `web/src/app/(hub)/societario/painel/page.tsx:30-31`: falha na primeira carga → painel de TV vazio (nas seguintes
  mantém o anterior, o que é bom). `demonstrativos/[id]/page.tsx:82`: falha → comparação com o mês anterior em branco.
- Correção: mostrar `Aviso` com a mensagem e um botão "tentar de novo".

**R-4 · baixo · Outras leituras sem paginação que podem crescer** (sem risco hoje)
- `web/src/app/(hub)/comercial/page.tsx:41` (quadro do CRM, 7 linhas), `web/src/app/(hub)/config/_abas/AbaClientes.tsx:67`
  (`cliente_responsaveis`, cresce com clientes × setores), `web/src/dominios/atendimento/chat.ts:61` (mensagens de
  uma conversa), `web/src/dominios/organizacao/OrgProvider.tsx:126` (clientes, 100 hoje).
- O laço antigo do relatório (`tarefas/relatorio/page.tsx:90`) para em 30 páginas (30.000 concluídas) e sai quando vem
  menos de 1.000; não é defeito hoje, mas convém trocar por `lerTudo` para ter uma regra só.

**R-5 · baixo · Sem teste para a trava de `reprocessar` e para o filtro do PDF**
- Os testes cobrem só `lerTudo`. A trava de contagem e o filtro de publicados não têm teste. Lembrete: `reprocessar`
  continua apagando e regravando fora de transação (M-N6): se a regravação falhar no meio, as contas se perdem.

### Situação após a reauditoria

| Achado | Situação |
| --- | --- |
| A-G1 | **Resolvido** nos pontos de risco (tarefas, balancete, PDF, portal, societário); **em aberto** só o lote (R-1 = M-N5) |
| A-G2 | **Resolvido no código**; **em aberto em produção** até o deploy da `demonstrativo-pdf` |
| Novos | R-1 e R-2 (médios), R-3 a R-5 (baixos) |

## Auditoria 01/11/2026 — PDF por período (commit 9607018)

**Escopo:** só o commit `9607018` ("Baixar PDF segue o período escolhido"): Função Edge `demonstrativo-pdf`
(`index.ts`, `pdf.ts` e as cópias `periodos.ts`, `selecaoPeriodo.ts`, `linhasPeriodo.ts`, `demonstracoes.ts`),
`BotaoPdf.tsx`, `ExportarPeriodo.tsx`, as duas telas que usam o botão, `linhasPeriodo.ts` (+ teste), `scripts/nucleo_balancete.py`
e os capítulos `docs/06-fluxos.md` e `docs/modulos/demonstrativos.md`. Banco de produção consultado só para leitura.

### Veredito

**Não pode publicar ainda.** A parte de segurança está correta (ninguém obtém PDF assinado de outro cliente nem com
números de rascunho ou enviados pela tela), mas o servidor **assina como "trimestre/semestre/ano" um período em que
falta mês publicado**. Quando o mês que falta fica no meio do período, o documento assinado **não fecha**: o caixa
inicial mais a variação não dá o caixa final, a DRE não tem o mês que o balanço já contém e o balancete de verificação
não bate conta a conta (C-P1, reproduzido). Corrigir C-P1 e A-P1 e publicar a função **antes** do site (A-P2).

### Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `cd web && npm ci && npm run verificar` | ok (tipos, lint, testes e build; saída 0) |
| `npm run telas` | 25 de 25 telas ok |
| `deno check --config deno.json index.ts` (demonstrativo-pdf) | ok (saída 0) |
| `sh scripts/sync-funcoes.sh` + `git diff --exit-code supabase/` | as cópias da função **batem** com a origem; a única diferença era a `020`, alterada fora deste commit e depois commitada em `519bfa8` (ver M-P4) |
| PDF de teste com Deno (`balancete-exemplo.json`, 3 meses encadeados de 2026, 1º trimestre) | completo: tudo fecha (DFC 1.000 + 9.600 = 10.600; 0 de 23 contas com diferença). **Sem fevereiro:** DFC 1.000 + 6.400 = 7.400 contra caixa final 10.600; **20 de 23 contas** com saldo anterior ± movimento ≠ saldo final; capa "1º trimestre de 2026 (01/01/2026 a 31/03/2026)", só uma linha cinza "2 de 3 meses publicados · falta fev/2026". Sem março: fecha (período vai até 28/02, rótulo continua "1º trimestre"). PDF gerado: 5 páginas |
| Função publicada (`list_edge_functions` / `get_edge_function`) | no ar a **v5** (01/11 08:39), que é a do commit `6a709b3` (tem `lerTodasLinhas` e o filtro de publicados; **não** tem `pdfDoPeriodo` nem `combinarLinhas`). Este commit **ainda não foi publicado** e a `main` está 1 commit à frente de `origin/main` |
| Banco (leitura) | 26 balancetes. Nexus: 24 meses (jan/2024–dez/2025), **só dez/2025 publicado**. MDC: acumulado jan–dez/2025 publicado. Greencore: acumulado jan–dez/2025 em **rascunho** |

### Segurança da assinatura (pergunta 1): sem achado

- O corpo só é aceito com `balancete_id` no formato UUID (`index.ts:98`) e `periodo` validado campo a campo
  (`lerEscolha`, `:60-70`: visão da lista, ano 2000–2100, número dentro da visão). Números enviados pela tela não
  entram em lugar nenhum.
- O balancete de referência é lido **com o login de quem pediu** (`:106`); sem permissão → 404. O mês escolhido
  (`:112`) e os meses do período (`:167-174`) são buscados pelo `cliente_id` desse balancete, também com o login do
  usuário, e o período filtra `status = 'publicado'` (`:171`). Para o cliente do Portal a RLS já esconde rascunho
  (`010_portal_cliente.sql:467` e `:474`); para a equipe vale `hub_pode(...,'demonstrativos','ver')`.
- O cliente de serviço só lê razão social/CNPJ do cliente já autorizado (`:190`), o certificado da organização do
  balancete (`:220`) e a logo da própria organização (`:228-236`). Não há como trocar de cliente ou de organização.
- PDF do mês escolhido (`:110-117`): se o mês for rascunho (equipe), segue o caminho do mês, sem assinatura e com a
  tarja "RASCUNHO", como antes.
- Ressalva fora do commit (M-P3): o servidor **não refaz o cálculo a partir das contas**; ele soma os resultados
  gravados (`resumo`, `demonstracoes`) que foram calculados no navegador na importação.

### Achados

**C-P1 · crítico · Período com mês faltando no meio é assinado e sai com números que não fecham**
- `index.ts:178-191` monta o período só com os publicados e chama `finalizar(..., true, ...)` (`:191`), que assina
  sempre. Não há checagem de `sel.completo` nem de buraco entre o primeiro e o último mês.
- `selecaoPeriodo.ts` (origem `web/src/dominios/demonstrativos/selecaoPeriodo.ts:245-257`): o período usa os meses
  existentes; a abertura vem do primeiro e o balanço do último. `somarDfc` (`calculosDemonstracoes.ts:358-359`) pega o
  caixa inicial do primeiro e o final do último, mas soma só as variações dos meses presentes.
  `linhasPeriodo.ts:19-22` faz o mesmo no balancete.
- Cenário real: jan e mar publicados, fev em rascunho (ou despublicado para correção). Sai um PDF **assinado com o
  certificado da MDC** "1º trimestre (01/01 a 31/03)" em que a DRE não tem fevereiro, a DFC não fecha (7.400 × 10.600
  no teste) e o balancete não bate em 20 de 23 contas. É documento contábil assinado e internamente inconsistente.
- Correção: no servidor, recusar (409, com mensagem simples) o período quando houver mês sem balancete publicado
  **entre** o primeiro e o último mês usados; e não assinar quando `!sel.completo` (ver A-P1). Teste para os dois casos.

**A-P1 · alto · Período incompleto é assinado com o nome do período inteiro**
- Mesmo ponto (`index.ts:191`, `:208-209`). Com meses faltando no começo ou no fim, os números fecham, mas o PDF
  assinado se chama "ano de 2025" e a única indicação é uma linha cinza de 8,5 pt (`pdf.ts`, bloco `d.completude`).
- Caso real hoje: **Nexus** tem só dez/2025 publicado. "Ano de 2025" (inclusive pelo próprio cliente no Portal) gera
  um PDF assinado "ano de 2025 (01/12/2025 a 31/12/2025)" com DRE, margens e termômetro de **um mês**, e "1 de 12 meses
  publicados · faltam 11 meses".
- Correção: assinar só período completo; período em andamento (faltam só os meses finais) sai sem assinatura ou com
  rótulo explícito ("1º trimestre de 2026 — até fevereiro, parcial") em destaque na capa e no nome do arquivo.

**A-P2 · alto · Publicar o site antes da função entrega PDF errado sem avisar**
- A função no ar (v5) ignora `periodo`. Se o push na `main` for antes do deploy, o botão diz
  "Baixar PDF · 1º trimestre de 2026" (`BotaoPdf.tsx`) e devolve o PDF do **mês aberto**; e o antigo "PDF do período"
  foi retirado (`ExportarPeriodo.tsx`). Correção: `supabase functions deploy demonstrativo-pdf` **antes** do push
  (depois de corrigir C-P1/A-P1) e registrar a ordem em `docs/07-como-rodar-e-publicar.md`.

**M-P1 · médio · Comparação com o ano anterior pode ser de um período incompleto, sem aviso**
- `index.ts:188` e `:204`: `mesmoPeriodoAnoAnterior` usa o que houver publicado no ano anterior; a coluna se chama
  "1º trimestre de 2025" mesmo que tenha 1 mês, e a completude dele não vai para o PDF. Com buraco no meio, a DFC da
  coluna também não fecha. Correção: só comparar com período anterior completo, ou mostrar a completude na coluna.

**M-P2 · médio · Avisos da tela não dizem o que o usuário precisa saber**
- `demonstrativos/[id]/page.tsx:103-108`: o aviso cita só meses **em rascunho** da tela; não fala que o PDF sairá
  **assinado** mesmo incompleto. No PDF a completude diz "falta fev/2026" quando fevereiro existe e está em rascunho
  (`index.ts:209` só troca "importados" por "publicados"). No Portal (`portal/page.tsx:299`) não há aviso nenhum.
  Seção 8.3 item 4: dizer em português simples "o PDF do trimestre só é assinado com os 3 meses publicados".

**M-P3 · médio (anterior ao commit) · "Cálculo refeito no servidor" soma valores gravados pelo navegador**
- O servidor agrega `resumo`/`demonstracoes`/`indices` gravados; esses valores foram calculados no navegador
  (ADR 0003 ainda pendente). As **linhas** do publicado estão travadas (`020`, `tg_linhas_balancete_protegidas`), mas
  `tg_publicacao_protegida` (`016_endurecimento_auditoria.sql:89-91`) deixa quem **gere** Demonstrativos alterar
  esses campos de um balancete publicado sem despublicar. O PDF assinado pode divergir das contas travadas.
  Correção: travar também `resumo`, `indices`, `alertas` e `demonstracoes` quando publicado, ou recalcular das linhas.

**M-P4 · sem achado (fora do commit) · Migração 020 alterada sem commit — resolvido durante a auditoria**
- No início da auditoria a `020_seguranca_auditoria_2026_10.sql` estava modificada e não commitada. Durante a
  auditoria entrou o commit `519bfa8` ("migração 020 ajustada pela auditoria geral e aplicada em produção"), com
  essas mesmas mudanças. Como a 020 ainda não tinha sido aplicada, ajustar o arquivo antes de aplicar não fere a regra 5.
  O `519bfa8` e o que está em andamento (`repositorio.ts`, `021_gravacao_atomica_balancete.sql`) **não** foram
  auditados aqui.

**B-P1 · baixo · Equipe perdeu a prévia do PDF do período com rascunho**
- Com o "PDF do período" do navegador retirado, a equipe só vê o PDF do trimestre depois de publicar todos os meses
  (antes de publicar só há o Excel). Considerar gerar no servidor sem assinatura e com tarja "RASCUNHO".

**B-P2 · baixo · Sem teste do caminho novo do servidor**
- `linhasPeriodo.test.ts` cobre a junção das contas, mas nenhum teste cobre `lerEscolha`, o filtro de publicados,
  o mês escolhido diferente do aberto nem os casos de C-P1/A-P1. O teste de "conta que surge no meio" não cobre mês
  faltando.

**B-P3 · baixo (anterior) · CORS `*` continua na `demonstrativo-pdf`** (`index.ts:17-22`; B-G2 segue aberto).

### Correção contábil (pergunta 2): o que está certo

- Balancete do período (`linhasPeriodo.ts`): abertura do 1º mês, movimento somado e fechamento do último, com
  arredondamento a centavos; conta que surge no meio abre zerada e a que some fecha zerada. Correto **quando não há
  mês faltando** (teste com 3 meses: 0 de 23 contas com diferença).
- DRE e DFC somadas, balanço do último mês contra a abertura do primeiro, índices refeitos: iguais às da tela
  (cópias idênticas).
- Mês único: gera o mês escolhido, não o aberto (`index.ts:110-117`), buscando pelo mesmo cliente.
- Balancete acumulado (jan–dez num arquivo, caso MDC/Greencore): o período "Ano" usa o próprio acumulado
  (`selecaoPeriodo.ts`, `usarAcumulado`), uma só leitura de linhas, sem soma. Mês/trimestre/semestre cobertos só por ele
  ficam indisponíveis na tela.

### Clientes-piloto

Não houve validação com mensais publicados: na MDC só há o acumulado de 2025 publicado e na Greencore o acumulado está
em rascunho. Os casos de C-P1/A-P1 não aparecem nos pilotos; aparecem na Nexus (24 meses, 1 publicado).

### Situação após esta auditoria

| Achado | Situação |
| --- | --- |
| C-P1 | **Aberto** (bloqueia publicar) |
| A-P1, A-P2 | **Abertos** (A-P2: publicar a função antes do site) |
| M-P1 a M-P3 | Abertos (M-P3 vem de antes do commit) · M-P4 resolvido (`519bfa8`) |
| B-P1 a B-P3 | Abertos |
| A-G2 | Resolvido em produção (v5 da função tem o filtro de publicados) |

## Reauditoria 01/11/2026 — commits 519bfa8 e f77072b

**Escopo:** `519bfa8` (migração 020 ajustada e aplicada) e `f77072b` (regra do PDF por período em `pdfPeriodo.ts`,
migrações 021 e 022, leitura paginada dos mapas e do lote). Conferido no código, rodando a Função Edge de verdade em
Deno contra um banco simulado, e no banco de produção **só leitura** (`pg_proc`, `pg_trigger`, `pg_policies`,
`list_migrations`, `get_advisors`, `get_edge_function`). Nada foi alterado.

### Veredito

**Pode publicar, com duas condições.** C-P1, A-P1, M-P1, M-P2 e M-P3 estão resolvidos: o servidor não gera PDF de
período com mês faltando antes do último publicado, só assina período completo e só compara com ano anterior completo.
Condições: (1) **publicar a função `demonstrativo-pdf` antes do push** e conferir que a versão no ar passou da v5 (ver
A-P2); (2) o push na `main` leva também o commit `88bf784` (SheetJS pelo CDN com verificação de integridade), que
**não** foi auditado e fez `/demonstrativos/importar` falhar no `npm run telas` aqui (ver N-5): abrir a tela de
importação num navegador normal e carregar um Excel antes de considerar publicado.

### Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `cd web && npm ci && npm run verificar` | ok (saída 0): tipos ok, lint 0 erros / 40 avisos (os mesmos de antes), **21 arquivos / 109 testes** passando (inclui `pdfPeriodo.test.ts`, 5 testes), build ok |
| `npm run telas` | 1ª rodada 22/25 (`/atendimento` e `/atendimento/portal` com erro 500 do servidor de teste; `/demonstrativos/importar`). 2ª rodada **24/25**: as de atendimento passaram (falha passageira); `/demonstrativos/importar` falha de novo: o navegador recusou `cdn.sheetjs.com/xlsx-0.20.3/.../xlsx.full.min.js` por hash diferente do `integrity`. Este ambiente bloqueia o CDN (`curl` → 403 no proxy), então é **provável** que seja só do ambiente — a confirmar (N-5) |
| `deno check --config deno.json index.ts` | ok (saída 0) |
| `sh scripts/sync-funcoes.sh && git diff --exit-code supabase/` | ok (saída 0): as cópias da função, incluindo a nova `pdfPeriodo.ts`, batem com a origem |
| Banco (leitura) | 020, 021 e 022 aplicadas (`list_migrations`: `20261101115705`, `…115905`, `…121447`). Corpo de `portal_gravar_balancete`, `portal_regravar_contas`, `app.inserir_contas_balancete`, `app.tg_balancete_publicado_imutavel`, `app.tg_portal_usuario_nao_equipe`, `app.tg_arquivo_imutavel` **idêntico** ao do repositório; todas com `search_path=public`; `anon` sem execução; `app.*` sem execução para `authenticated`. Gatilho `balancete_publicado_imutavel` ativo em `portal_balancetes`. Políticas da 020 (`portal_usuarios_update`, `hub_arquivos_equipe_*`, `hub_storage_equipe_select` com a pasta `marca`) iguais ao arquivo |
| `get_advisors security` | só os avisos esperados (funções `public.*` chamadas pelas telas, agora com as 2 novas; `crm_receber_lead` sem login; proteção de senha vazada desligada) |
| Função publicada | **v5** (`updated_at` 01/11 08:39), sem `situacaoPdf`, `pdfDoPeriodo`, `lerEscolha` nem `combinarLinhas` (procurado no código baixado) |
| Git | `origin/main` em `da665dd`; `9607018`, `519bfa8`, `f77072b` e `88bf784` **ainda não enviados** |

### Teste da regra com a função real (Deno, banco simulado)

A função `index.ts` foi executada sem mudança, apontando para um PostgREST falso com 24 meses encadeados (2024–2025)
gerados pelas funções de cálculo da própria tela, e um acumulado jan–dez/2025. "Tentou assinar" = a função pediu o
certificado (`cert_obter`), o que só acontece quando ela vai assinar.

| Cenário | Resposta | Tentou assinar |
| --- | --- | --- |
| 1º trimestre/2025 completo | 200, `…-1-trimestre-de-2025.pdf` | sim |
| Falta fev no meio (fev em rascunho) | **409** "publique antes: fev/2025" | não |
| Faltando no começo (caso Nexus: só dez/2025 publicado), ano | **409** "publique antes: 11 meses" | não |
| Faltando só o fim (jan–fev, mar não existe) | 200, `…-1-trimestre-de-2025-parcial.pdf` | **não** |
| Faltando só o fim (jan–nov, dez em rascunho), ano | 200, `…-ano-de-2025-parcial.pdf` | **não** |
| Balancete acumulado jan–dez/2025, ano | 200, `…-ano-de-2025.pdf` | sim |
| Ano 2025 completo, 2024 com 6 meses | 200 (27.886 bytes: **sem** coluna do ano anterior) | sim |
| Ano 2025 completo, 2024 completo | 200 (28.969 bytes: **com** a coluna) | sim |
| Empresa aberta em mar/2025 (mar–dez publicados), ano | **409** "publique antes: jan e fev/2025" | não (ver N-2) |

Conferência dos números com as cópias da função (`selecionar` + `combinarLinhas`): no completo e nos dois parciais,
**0 de 23 contas** com saldo anterior ± movimento ≠ saldo final; o balanço fecha na data do último mês publicado
(28/02 e 30/11). A tela usa a mesma composição (`BotaoPdf.tsx:14-31`: só publicados → `selecionar` → `situacaoPdf`),
então botão e servidor dão a mesma resposta.

### Situação dos achados da auditoria do PDF por período

| Achado | Situação | Evidência |
| --- | --- | --- |
| C-P1 (mês faltando no meio assinado) | **Resolvido no código** | `index.ts:182-184` devolve 409 antes de ler contas; cenários 2 e 3 acima |
| A-P1 (incompleto assinado com nome do período) | **Resolvido no código** | `index.ts:200` assina só `!parcial`; rótulo e arquivo com "(parcial)" (`:217`, `:281`); selo vermelho "PERÍODO PARCIAL · SEM ASSINATURA" e frase no fim (`pdf.ts:264-268`, `:499-500`) |
| A-P2 (ordem de publicação) | **Aberto até o deploy** | função no ar = v5. Ver abaixo |
| M-P1 (comparação com ano anterior incompleto) | **Resolvido** | `index.ts:195-196`; cenários 7 e 8 |
| M-P2 (avisos da tela) | **Resolvido**, com ressalva de texto (N-3) | `BotaoPdf.tsx:20-29`: bloqueia o botão e diz o que publicar; avisa "parcial e sem assinatura"; agora também no Portal (`portal/page.tsx:303`) |
| M-P3 (números de publicado alteráveis) | **Resolvido em produção** pela 022 | gatilho em `resumo`, `indices`, `alertas`, `conferencias`, `demonstracoes`, período, competência, cliente, org, arquivo; sem exceção para `app.publicando` nem para chave de serviço |
| R-1 (lote sem paginação) | **Resolvido** | `ImportacaoLote.tsx:68-70` com `lerTudo` e `.order("id")` |
| R-2 (mapas sem paginação, erro ignorado) | **Resolvido** | `repositorio.ts:21-48`: `lerTudo` + `order("id")`; erro agora interrompe (lança) |
| M-N6 (gravação sem transação) | **Resolvido** para importar e reprocessar | `repositorio.ts:104-113` e `:244-250` usam as RPCs da 021 |
| B-P1, B-P2, B-P3 | Abertos | sem teste do caminho do servidor; CORS `*` em `index.ts:18-23` |

**022 e o que continua funcionando** (lido no código, sem escrever no banco): `portal_publicar_balancete`
(`016:102-127`) só muda `status`, `publicado_por` e `publicado_em`, nenhum deles vigiado pela 022 — publicar,
republicar e despublicar continuam. O comentário do contador (`demonstrativos/[id]/page.tsx:118-121`) grava só
`comentario`, que não está na lista — continua editável (com `gerir`, pela 016).

**021:** `portal_gravar_balancete` confere `hub_pode(...,'operar')` na primeira linha, exige cliente da mesma
organização e competência no dia 1, trava o mês (`pg_advisory_xact_lock` + `for update`), recusa mês publicado e grava
cabeçalho, cálculo e contas numa transação. `portal_regravar_contas` recusa publicado e faz a troca numa transação.
`app.inserir_contas_balancete` não é executável pela API.

**A-P2 — o plano "publicar a função antes do site" basta?** Sim, desde que nessa ordem e conferido:
- Função nova + site antigo (o de hoje, `da665dd`): o site antigo manda só `balancete_id`; `lerEscolha(undefined)` →
  `null` → caminho do mês, igual ao da v5. **Não quebra nada.**
- Site novo + função antiga (v5) — o que precisa ser evitado: a v5 ignora `periodo` e devolve o PDF do **mês aberto**,
  assinado se publicado, com o botão dizendo "Baixar PDF · ano de 2025". A tela nova bloqueia os casos de lacuna, mas
  nos casos "completo" e "parcial" o cliente recebe o mês achando que é o período.
- Passos: `sh scripts/sync-funcoes.sh` → `npx supabase functions deploy demonstrativo-pdf --project-ref
  bulqqdgfrrpqquqvjjfa --import-map supabase/functions/demonstrativo-pdf/deno.json` → conferir que a versão passou a 6
  (painel ou `get_edge_function` contendo `situacaoPdf`) → só então `git push`. Registrar isso em
  `docs/07-como-rodar-e-publicar.md` (ainda não está, ver N-6).

### Achados novos

**N-1 · médio · Trocar grupo ou linha da DFC num balancete publicado muda a regra e depois falha**
- `demonstrativos/[id]/page.tsx:322-362`: as listas de grupo e de linha da DFC aparecem para quem opera, também em
  balancete publicado. `definirGrupo` (`repositorio.ts:181-196`) apaga a regra (erro do `delete` ignorado em `:184`),
  grava a nova, e só então tenta mudar as contas (barrado pela 020); `definirLinhaDfc` (`:254-272`) grava a regra e
  `recalcular` é barrado pela 022. Resultado: a regra (às vezes **de todas as empresas**, se a pessoa clicou OK) fica
  trocada, o balancete não, e a tela mostra erro. Antes da 022 o caso da DFC passava em silêncio.
- Correção: desligar as duas listas (e "Refazer verificações", `:420-429`) quando `b.status === "publicado"`, com a
  frase "despublique para ajustar"; tratar o erro do `delete`; idealmente regra + contas + cálculo numa RPC.

**N-2 · médio · Empresa que começou no meio do período nunca tem PDF do ano (nem do trimestre de abertura)**
- `pdfPeriodo.ts:22-23`: falta antes do último publicado = lacuna, sem exceção. Empresa aberta em mar/2025 recebe
  "publique antes: jan e fev/2025", meses que não existem (cenário 9). Balancete acumulado mar–dez cai no mesmo caso.
- Não gera documento errado (falha segura), mas trava o primeiro exercício de toda empresa nova da carteira.
- Correção: aceitar como início do período a data de abertura da empresa (ou o 1º balancete do cliente) e rotular
  "de 01/03/2025 a 31/12/2025"; teste para o caso.

**N-3 · baixo · Textos do PDF parcial e do bloqueio**
- `index.ts:222` e `BotaoPdf.tsx:27` dizem "Período em andamento" também quando o período já acabou e só falta
  publicar o último mês (cenário 5: ano de 2025 visto em nov/2026). Melhor: "Período parcial".
- `BotaoPdf.tsx:24` no **Portal** diz ao cliente "publique antes: …", algo que só a MDC faz. No Portal: "A MDC ainda
  não publicou …; o PDF do período sai quando todos os meses estiverem publicados."
- Período com um mês coberto por acumulado de semestre e outro mensal pede para "publicar" meses que já estão
  publicados dentro do acumulado (consequência da regra de `selecionar`, sem número errado).

**N-4 · baixo · `portal_regravar_contas` lê e trava a linha antes de checar permissão**
- `021:81-83`: `select … for update` vem antes de `hub_pode`; a mensagem difere entre "não encontrado" e "sem
  permissão" (revela se um id existe, sem dado). Regra do repositório: checagem na primeira linha. Trocar a ordem
  (ler sem `for update`, checar, depois travar).

**N-5 · a confirmar · Commit `88bf784` (fora do escopo) vai junto no push e não passou no `npm run telas` aqui**
- `web/src/lib/arquivos/planilha.ts:6` e `:65`: a SheetJS passou a vir de `cdn.sheetjs.com` com `integrity`. Aqui o
  navegador recebeu outro conteúdo (o proxy deste ambiente bloqueia o CDN) e recusou o arquivo, então a importação
  de Excel não abre. Como confirmar: em qualquer máquina, `curl -sL <url> | openssl dgst -sha384 -binary | base64`
  deve dar `EnyY0/GSHQ…yzdT`; e abrir Demonstrativos › Importar e carregar um `.xlsx`. Também vale avaliar: a
  importação passa a depender de um site de terceiro estar no ar, e a CSP do site precisa permitir esse endereço.

**N-6 · médio · Documentação não acompanhou (regra 6)**
- `docs/modulos/demonstrativos.md:40-46` e `docs/06-fluxos.md:31-33` ainda descrevem "assinado quando tudo publicado
  … a tela avisa", sem as três situações (completo assina, parcial sem assinatura, lacuna não gera).
- `docs/05-seguranca-e-acessos.md:95-104` não lista a trava da 022 nem as RPCs da 021; `docs/07` não tem a ordem
  função → site.

**N-7 · baixo · Testes**
- `pdfPeriodo.test.ts` cobre só `situacaoPdf`. Falta teste de `estadoPdf` (filtrar publicados, acumulado) e do
  caminho do servidor; o roteiro usado nesta reauditoria (PostgREST falso + `index.ts` real) pode virar teste
  automático.

### Clientes-piloto

Sem mudança: MDC tem só o acumulado de 2025 publicado (cenário "acumulado", assina) e Greencore o acumulado em
rascunho (botão bloqueado "Nenhum mês … publicado"). Os casos novos aparecem na Nexus (só dez/2025 publicado → ano
bloqueado). Recomenda-se validar na MDC publicando dois meses de 2026 para ver o PDF parcial antes de abrir à carteira.

### Situação após esta reauditoria

| Achado | Situação |
| --- | --- |
| C-P1, A-P1, M-P1, M-P2, M-P3 | **Resolvidos** (no código; em produção só depois do deploy da função) |
| A-P2 | **Aberto** até publicar a função (v6) antes do push |
| R-1, R-2, M-N6 | **Resolvidos** |
| B-P1, B-P2, B-P3 | Abertos |
| Novos | N-1, N-2, N-6 (médios) · N-3, N-4, N-7 (baixos) · N-5 a confirmar (commit fora do escopo) |
