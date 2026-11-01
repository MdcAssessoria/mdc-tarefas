# Parecer de auditoria — Financeiro etapa 1B (cadastros, a pagar/receber, entradas e saídas, estoque)

- **Data:** 01/11/2026
- **Escopo:** branch `financeiro-etapa1b`, `git log 4e83318..HEAD` = 1 commit, `501c703` (37 arquivos, +5.897/−24):
  migrações `028_financeiro_cadastros_titulos.sql` e `029_estoque_itens.sql`; telas `/financeiro/pagar`, `/receber`,
  `/movimento`, `/cadastros`, `/estoque`; componentes em `web/src/dominios/financeiro/`; ajuste em
  `extratos/page.tsx`, navegação, `erros.ts`, `database.types.ts`; testes SQL em `supabase/testes/`; docs 04, 05, 07,
  `modulos/financeiro.md`, `futuro/hub-gestao-desenho.md`.
- **Quem auditou:** agente independente `auditor-hub` (leitura do diff, execução das verificações, sondas num Postgres 16
  descartável e consultas **somente leitura** ao banco `bulqqdgfrrpqquqvjjfa`). Nada foi alterado no código nem no banco.
- **Fato registrado:** as migrações **028 e 029 já estavam aplicadas** no projeto `bulqqdgfrrpqquqvjjfa` antes desta
  auditoria (`list_migrations`: `20261101160625 028_financeiro_cadastros_titulos` e
  `20261101160736 029_estoque_itens`). As tabelas novas estão vazias (0 títulos, 0 pessoas, 0 itens, 0 movimentos).

## Verificações automáticas

| Comando | Resultado |
| --- | --- |
| `cd web && npm run verificar` | Ok — 23 arquivos de teste, **138 testes** passando; lint 0 erros, 40 avisos (os antigos de `setState` em efeito); build completo |
| `npm run build && npm run telas` | Ok — **34 de 34 telas** (inclui as 5 novas do Financeiro) |
| `TELA=celular npm run telas` (390 px) | Ok — 34 de 34 telas |
| `bash supabase/testes/rodar.sh` | Ok — todas as linhas "(deve falhar)" terminam em erro em português; as demais passam (parcelas 333,33/333,33/333,34 com 31/01 → 28/02 → 31/03; baixa parcial + juros; desconto; estorno; cancelamento; Portal vê só o próprio cliente; quem não tem acesso vê 0 e não lança; estoque insuficiente; transferência e estorno em par; negativo só com gerir) |
| Sondas próprias (Postgres 16 descartável, mesmas migrações) | Confirmaram A-2 e M-1 abaixo |

## Veredito

**Reprovado para o push do site** até corrigir A-1 (valor digitado "1.250" vira R$ 1,25) e A-2 (fornecedor, centro de
custo e estoque mudam de empresa). As duas correções são pequenas. O banco já aplicado não tem risco imediato (tabelas
vazias e nenhuma tela publicada); a correção de A-2 vai numa migração nova (030). Depois, liberar só ao Piloto HUB.

## Banco real (somente leitura)

- **Avisos de segurança (`get_advisors`):** nenhum aviso novo de tabela sem RLS. Continuam os avisos esperados de
  funções `public.*` `security definer` executáveis por `authenticated` (agora também `fin_lancar`, `fin_baixar`,
  `fin_estornar_baixa`, `fin_cancelar_titulo`, `est_movimentar`, `est_estornar_movimento`, `est_definir_negativo`, todas
  com a permissão conferida antes de gravar) e `crm_receber_lead` executável por `anon` (já conhecido).
- **RLS e políticas:** `fin_pessoas`, `fin_categorias`, `fin_centros_custo`, `fin_titulos`, `est_itens`, `est_locais`:
  RLS ligado; `select` com `app.fin_pode(cliente_id,'ver')`, `insert`/`update` com `app.fin_pode(cliente_id,'operar')`;
  nenhuma política de `delete`. `fin_baixas`, `est_movimentos`, `est_parametros`: só `select` (gravação só pelas
  funções). `fin_contas_bancarias` e `fin_plano_contas` ganharam `select` para o Portal (`app.portal_pode(...,'financeiro')`).
  Todas as políticas são `to authenticated`; os grants de tabela para `anon` (padrão do Supabase) não dão acesso porque
  não há política para `anon`.
- **Visão `est_saldos`:** `security_invoker=true` (respeita a RLS de `est_movimentos`). Ok.
- **Funções do esquema `app` executáveis por `authenticated`:** `eh_gestor`, `equipe_do_cliente`, `fin_pode` (nova),
  `hoje`, `hub_peso`, `hub_pode`, `meu_setor`, `minhas_orgs`, `papel`, `portal_pode`, `uuid_ou_nulo`. Nenhuma por `anon`.
  `app.est_gravar`, `app.est_saida` e os gatilhos novos **não** são executáveis pela API. O esquema `app` não está entre
  os expostos pelo PostgREST; `fin_pode` só devolve verdadeiro/falso para o próprio usuário.
- **Funções novas:** todas `security definer` com `search_path=public` fixo. As públicas conferem `app.fin_pode` (ou
  `hub_pode ... 'gerir'` em `est_definir_negativo`) logo depois de localizar a empresa do registro, antes de qualquer
  gravação.
- **Gatilhos instalados:** `fin_titulo_valida`, `fin_categoria_valida`, `est_item_valida`, `cliente_mesma_org` em todas as
  tabelas novas, `fin_auditar` nas tabelas de cadastro e também em `fin_contas_bancarias`. **Não há** gatilho que impeça
  troca de empresa em `fin_pessoas`, `fin_centros_custo` e `est_locais` (ver A-2).

## Achados

### Crítico

Nenhum.

### Alto

- **A-1 — Valor com ponto de milhar e sem vírgula é lido errado, sem aviso.**
  `web/src/dominios/financeiro/regras.ts:43-48` (`numeroBr`): se o texto não tem vírgula, usa `Number(t)` direto.
  Evidência (node): `"1.250" → 1.25`, `"12.500" → 12.5`, `"1.250.000" → NaN`; `"1.250,00" → 1250` (certo). É usado no
  valor do título (`LancarTitulo.tsx:106`), na baixa com juros/multa/desconto (`BaixaTitulo.tsx:54-57`), na quantidade e
  custo do estoque (`Estoque.tsx:163, 693, 706`). Cenário: a pessoa digita "1.250" para R$ 1.250,00 num título de
  parcela única → grava R$ 1,25 (não há prévia para uma parcela); "1.000" unidades viram 1 no estoque. O teste
  (`regras.test.ts:33-36`) não cobre o caso. A mesma função, copiada, está em `financeiro/page.tsx:51` (saldo inicial
  do banco). **Correção:** tratar ponto como milhar quando seguido de exatamente 3 dígitos e não houver vírgula
  (`/^\d{1,3}(\.\d{3})+$/`); recusar formatos ambíguos com mensagem; mostrar o valor entendido ao lado do campo
  ("= R$ 1.250,00"); uma só função em `regras.ts` usada também por `page.tsx`; testes para "1.250", "12.500",
  "1.250.000", "1250.5".
- **A-2 — Fornecedor/cliente, centro de custo e estoque (local) podem mudar de empresa.**
  `028` só protege a categoria (`tg_fin_categoria`, linha 97) e o título (`tg_fin_titulo`, linha 178); `029` só o item
  (`tg_est_item`, linha 99). `fin_pessoas`, `fin_centros_custo` e `est_locais` têm apenas `cliente_mesma_org`, que confere
  a organização, não a empresa. Sonda (usuário com `operar`): título do cliente C1 com fornecedor F1;
  `update fin_pessoas set cliente_id = C2 where id = F1` → aceito; resultado: `titulo_cliente = C1`, `pessoa_cliente = C2`.
  Quem pode: qualquer pessoa da equipe com Financeiro › operar, e uma pessoa do Portal com acesso a duas empresas
  (caso típico de grupo, como o Greencore). Efeito: a regra "fornecedor, centro e banco da mesma empresa" do
  `docs/modulos/financeiro.md` §4 é contornável; o título de C1 perde o nome do fornecedor na tela de C1 e o cadastro
  passa a ser visto pelos usuários de C2; mover um `est_locais` com movimento deixa o saldo de C1 apontando para um
  estoque de C2 e bloqueia novos movimentos nele. **Correção (migração 030):** gatilho `before update` nas três tabelas
  recusando mudança de `cliente_id`/`org_id` (mesmo texto de `tg_fin_categoria`), e incluir a sonda em
  `supabase/testes/20_titulos.sql` e `30_estoque.sql`.

### Médio

- **M-1 — Título editado para o valor já pago fica "em aberto" para sempre.** `028:188` recusa só `new.valor <
  old.valor_pago`; igual passa, mas a situação não muda fora das funções. A tela deixa editar título pago em parte
  (`TelaTitulos.tsx:389`, `LancarTitulo.tsx` com `editar`). Sonda: título 1.000, baixa 400, editar valor para 400 →
  `valor 400, valor_pago 400, situacao aberto`; `fin_baixar` recusa ("maior que o saldo em aberto (0.00)") e
  `fin_cancelar_titulo` recusa ("tem pagamento"). Aparece como "Vencido" com saldo R$ 0,00 até alguém estornar a baixa.
  **Correção:** no gatilho, recusar `new.valor <= old.valor_pago` quando há pagamento (mensagem: "para encerrar com
  desconto, use Pagar com desconto"), ou recalcular situação/quitado_em com `app.fin_interno`.
- **M-2 — A permissão `financeiro` do Portal já pode ser dada, sem tela e por quem gere o Atendimento.**
  `portal_convidar` (010:79) aceita qualquer `p_permissoes` e só exige gestor ou Atendimento › gerir. Com
  `financeiro`, o cliente passa a ler plano e bancos e a gravar direto pela API em cadastros (inclusive categoria →
  conta contábil, que define a contabilização) e títulos — sem tela do Portal e sem decisão de quem cuida do
  Financeiro. `docs/modulos/financeiro.md` §5 diz que a permissão "não aparece"; isso vale só para a lista da tela.
  **Correção:** até a tela do Portal existir, recusar `financeiro` em `portal_convidar`/edição de acesso, ou exigir
  `hub_pode(org,'financeiro','gerir')` para concedê-la; decidir se o cliente pode criar categoria (sugestão: só a
  equipe, porque é a ponte para o plano de contas).
- **M-3 — Juros, multa e desconto entram na categoria do título.** `movimento/page.tsx:111` soma `b.total` (valor +
  juros + multa − desconto) na categoria do título. Juros pagos de um aluguel aparecem como "Aluguel" em "Para onde
  foi o dinheiro" e, na conciliação/contabilização prevista (etapa 2), cairiam na conta do aluguel em vez de despesa
  financeira; desconto obtido não aparece como receita financeira. **Correção:** mostrar juros/multa e desconto como
  linhas próprias (categorias "Juros e multas pagos/recebidos" e "Descontos obtidos/concedidos" por empresa, ligadas a
  contas do plano) antes da etapa de conciliação.
- **M-4 — Fornecedor novo é criado fora da gravação do título.** `LancarTitulo.tsx:110-123` insere a pessoa e só
  depois chama `fin_lancar`. Se o lançamento falhar (categoria inválida, sem permissão, rede), o fornecedor fica criado;
  como `cad.pessoas` não é recarregado, a nova tentativa cria outro com o mesmo nome (não há unicidade por nome sem
  CPF/CNPJ). **Correção:** aceitar `pessoa_nome` em `fin_lancar` e criar a pessoa dentro da função (tudo ou nada), ou
  recarregar os cadastros depois do erro.
- **M-5 — Arquivos grandes e duplicação (M-7 anterior piorou).** `Estoque.tsx` 978 linhas (três abas, três formulários
  e o estorno num arquivo só), `TelaTitulos.tsx` 462, `CadCategorias.tsx` 440 (categorias e centros de custo juntos),
  `financeiro/page.tsx` continua com 405; `numeroBr` duplicado (A-1). **Correção:** um arquivo por aba de Estoque
  (`EstoqueItens`, `EstoqueLocais`, `EstoqueMovimentos`) e centros de custo em `CadCentros.tsx`.
- **M-6 — Processo: banco aplicado antes do parecer e piloto ainda não feito.** 028 e 029 foram aplicadas antes desta
  auditoria (mesma situação registrada no parecer de 01/11 do agente do SharePoint). Desta vez sem dano (tabelas vazias),
  mas a correção de A-2 terá de ir numa migração nova em vez de ajustar a 028. As tabelas estão vazias: **não houve
  validação com MDC e Greencore** (checklist 8.5). **Correção:** auditar antes de aplicar; validar com o Piloto HUB
  antes de liberar à carteira.
- **M-7 — Documentação com falhas.** `docs/modulos/financeiro.md:18-25`: há uma linha em branco no meio da tabela de
  telas, então as quatro telas novas não viram tabela (aparecem como texto com barras). `docs/06-fluxos.md` §6.4 (mapa
  de automações) não tem nenhum gatilho do Financeiro (`tg_fin_titulo`, `tg_fin_categoria`, `tg_fin_auditar`,
  `tg_est_item`, `cliente_mesma_org`), exigido pelo checklist 8.5. **Correção:** tirar a linha em branco; incluir os
  gatilhos da 026/028/029 no mapa.

### Baixo

- **B-1 — Campos de controle podem ser escritos na gravação direta.** Por RLS, `insert`/`update` em `fin_titulos`
  aceitam `por`, `criado_em`, `parcela`, `parcelas` e `grupo` informados pelo usuário (o gatilho só congela parcela/grupo
  depois de criado). A auditoria (`app.registrar`) grava o usuário real, então a trilha principal não se perde.
  **Correção:** no gatilho, forçar `por = auth.uid()` e `criado_em = now()` no insert fora das funções.
- **B-2 — Troca do estoque padrão em dois passos.** `Estoque.tsx:510-520` desmarca o atual e depois grava o novo; se a
  segunda gravação falhar, a empresa fica sem padrão. **Correção:** função `est_definir_padrao` (uma transação).
- **B-3 — Filtros fora do padrão 8.3.** Botão "Limpar" existe só em `TelaTitulos`; não há em Estoque, Cadastros e
  Entradas e saídas. Estoque tem 9 `select` no arquivo (a confirmar no navegador se mais de três ficam à vista).
- **B-4 — Estorno de movimento de estoque:** `est_estornar_movimento` (029:250) lê o movimento sem trava antes de
  conferir "já estornado"; dois estornos simultâneos não estornam duas vezes (o laço relê com `not estornado` depois de
  travar o item), mas a auditoria registra dois eventos. Também não confere se o item ainda controla estoque.
- **B-5 — Datas livres.** Baixa e movimento aceitam qualquer data (futura ou muito antiga); a conferência de saldo é
  sobre o total atual, não sobre a data: uma saída retroativa pode deixar o histórico negativo naquela data.
  **Sugestão:** avisar na tela quando a data for futura ou anterior ao último fechamento.
- **B-6 — Trava de situação depende de `app.fin_interno`.** A variável é ligada só dentro das funções
  (`set_config(..., true)`, válida na transação) e não é alcançável pela API (PostgREST não expõe `set_config`). Sem
  risco hoje; registrar em `docs/05` que quem tem SQL direto (painel, `service_role`) contorna a trava.
- **B-7 — Testes SQL conferidos a olho.** `rodar.sh` não falha sozinho: quem roda precisa ler cada "(deve falhar)".
  Sugestão: `DO $$ ... exception when others then ... $$` com `assert`, e código de saída diferente de zero em falha.
  Os testes usam `hub_pode` simulado (lê `teste.papel`), não o real.

### O que está bem feito

- Parcelas: centavos na última, vencimento no último dia do mês quando não existe (igual na prévia da tela e no banco).
- Baixa e estorno travam o título (`for update`); saída de estoque trava o item antes de somar o saldo: duas saídas ao
  mesmo tempo não furam o estoque. Inventário pelo saldo contado; transferência em par com estorno em par.
- Nada se apaga; cancelamento e estornos exigem motivo e ficam na auditoria; estorno recusado se já conciliado.
- Separação equipe × Portal correta em `fin_pode` (`gerir` nunca para o Portal) e isolamento entre organizações pelo
  `org_id` do cliente.
- `extratos/page.tsx`: corrigido um defeito antigo — "Este mês" e "Mês passado" mandavam `AAAA-MM` como data
  (`mesAtualISO` devolve `AAAA-MM`), e a consulta falhava; agora usa `intervaloDoPeriodo` com teste.
- Telas: frase de resumo, indicadores que filtram ao clicar, PDF e Excel do que está filtrado (`exportar.ts` comum),
  estados vazios, mensagens de erro traduzidas (`erros.ts` com as restrições novas), ok a 390 px.

## Situação dos achados anteriores

| Achado | Situação | Evidência |
| --- | --- | --- |
| R-M1 variantes de D/C em planilha | **Em aberto** | `extratoPlanilha.ts` não mudou neste commit |
| M-6 saldo calculado no navegador | **Em aberto** (adiado para a etapa 2) | `financeiro/page.tsx` não mudou |
| M-7 arquivos acima de 400 linhas | **Piorou** (ver M-5) | `Estoque.tsx` 978, `TelaTitulos.tsx` 462, `CadCategorias.tsx` 440, `page.tsx` 405 |
| R-B1 marca de ex-cliente sem como retirar | **Parcial, sem mudança neste commit** | `docs/04` tem o comando de retirada (commit `9f9094e`); `docs/05` ainda não menciona `app.ex_clientes` |
| R-B2 conferência de saldo só para OFX | **Em aberto** | sem mudança |
| B-2 cadastro de conta bancária fora da auditoria | **Resolvido** | `028:41-43`; gatilho `fin_auditar` em `fin_contas_bancarias` confirmado no banco |
| B-3 índice de módulos / perfis padrão / índices `org_id` | **Parcial** | `docs/README.md:20` lista o Financeiro; perfis padrão e índices `(org_id, cliente_id, ...)` sem mudança |
| B-1 (027), B-6, B-7, "a confirmar" de FITID e troca de e-mail | **Sem mudança** | — |

## Recomendações para a próxima etapa

1. Corrigir A-1 (só front, com testes) e A-2 (migração 030 + sondas nos testes SQL) e reauditar só esse trecho
   **antes** de aplicar a 030 e de fazer o push.
2. Antes de abrir a permissão `financeiro` no Portal: resolver M-2 e definir quem pode criar categoria.
3. Antes da conciliação (etapa 2): resolver M-3 (juros/multa/desconto com categoria própria) e M-6 (saldo no banco).
4. Validar com MDC e Greencore: lançar um mês real de contas a pagar e a receber, baixa parcial com juros, estorno,
   e um inventário de estoque; conferir o PDF e o Excel.
5. Dividir `Estoque.tsx` e `CadCategorias.tsx` (M-5) e transformar `rodar.sh` em teste que falha sozinho (B-7).

Críticos: 0 · Altos: 2 (A-1, A-2) · Médios: 7 · Baixos: 7.

## Resumo sem jargão

- **O que foi feito:** contas a pagar e a receber com parcelas, pagamento parcial com juros e desconto, estorno,
  cadastros de fornecedores, despesas e centros de custo, entradas e saídas e controle de estoque. A segurança do banco
  está bem montada e os testes passaram.
- **O que precisa corrigir antes de publicar:** (1) se alguém digitar "1.250" sem vírgula, o sistema entende R$ 1,25;
  (2) um fornecedor, centro de custo ou estoque pode ser "mudado" de uma empresa para outra do mesmo grupo, bagunçando
  os lançamentos. As duas correções são rápidas.
- **Atenção:** o banco foi atualizado antes da auditoria (sem dano, as tabelas estão vazias) e ainda não houve teste com
  MDC e Greencore. A permissão de Financeiro do cliente já pode ser dada por quem cuida do Atendimento, embora a tela do
  cliente ainda não exista — convém travar isso até a tela ficar pronta.
