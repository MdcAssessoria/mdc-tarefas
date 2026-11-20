# BI de Gestão (Omie)

Tela `/bi-gestao` (módulo `bi_gestao`, ferramenta `bi_gestao` em `hub_apps`). Criada em 19/11/2026.

## Como abre (v2, 20/11/2026, migração 097)

A tela abre em **cartões das empresas**, sem nenhum número. Cada cartão mostra a situação do acesso:

- **Acesso liberado** (botão **Abrir**): administrador da organização, responsável pela empresa no HUB, ou pedido
  aprovado e dentro da validade.
- **Pedir acesso**: a pessoa escreve o motivo; administradores e responsáveis recebem aviso com link para aprovar.
  Quem aprova escolhe os dias (1 a 90, padrão **30**). Ninguém aprova o próprio pedido. Pedido pendente pode ser
  desistido; acesso aprovado pode ser encerrado antes do prazo.
- **Abrir o grupo**: abre todas as empresas liberadas do grupo de uma vez (consolidado).
- **Quem abriu os números** (só administrador): registro de cada abertura do relatório (quem, quando, quais empresas).
- O último grupo aberto fica guardado no navegador ("Continuar em …").

## O que mostra

A DRE gerencial (pela competência) e o fluxo de caixa (DFC, pela data do pagamento) de um **grupo de empresas**, mês a
mês e no total do período. Os dados vêm do sistema do cliente (Omie) e dos lançamentos complementares da MDC.

- **Filtros:** período (até 3 anos), empresas do grupo (ao menos uma) e, com mais de uma empresa, **Tirar vendas e
  pagamentos entre as empresas do grupo** (padrão do grupo, `bi_grupos.eliminar_intragrupo`).
- **Abas:**
  - **Visão geral:** receita líquida, lucro bruto, resultado líquido (com margem), caixa das operações e variação do
    caixa; gráfico resultado × caixa e receita mês a mês.
  - **DRE** e **Fluxo de caixa:** matriz linha × mês com total, coluna **% da receita** (análise vertical) e PDF/Excel.
  - **Comparar:** período × período anterior, × mesmo período do ano passado (análise horizontal) ou **× orçamento**
    (realizado × orçado), com diferença em R$ e variação em %. Verde = melhor para o resultado.
  - **Empresas** (só com mais de uma): uma coluna por empresa, soma, eliminações entre elas e consolidado.
  - **Indicadores:** prazo médio de recebimento e de pagamento (com o período anterior), ciclo financeiro,
    inadimplência, contas a receber e a pagar por faixa de atraso (a vencer, 1–30, 31–60, 61–90, +90), 10 maiores
    clientes (notas autorizadas) e fornecedores (títulos), e liquidez.
  - **Lançamentos:** lançamentos complementares (fora do Omie: novo, importar Excel, modelo, cancelar com motivo) e
    **Orçamento** (grade linha × 12 meses por empresa e ano, gravar, desfazer, importar e baixar planilha).
- **Aviso "Não classificado":** categorias do Omie sem conta em `bi_mapa_categorias`.
- **Celular:** tabelas em cartões; gráficos encolhem com a tela.

### Premissas dos indicadores

- **Liquidez** corrente, seca e geral vêm do **balancete do Domínio publicado** em Demonstrativos
  (`portal_balancetes.indices`). Sem balancete, a tela mostra só a **cobertura de curto prazo** = a receber em aberto ÷
  a pagar em aberto (sem caixa, estoque nem empréstimos), com aviso.
- **PMR/PMP:** média ponderada pelo valor de (data do pagamento − data de emissão) dos títulos baixados no período.
- **Fornecedores** aparecem pelo CNPJ/CPF: o Omie não envia o nome na sincronização atual.
- Prazos e aberto dependem da classificação das categorias do Omie.

## Banco

| Objeto | Papel |
| --- | --- |
| `bi_relatorio(p_relatorio, p_clientes, p_inicio, p_fim, p_eliminar)` | Monta o relatório (uma linha por conta e mês). Desde a 094, `security definer` com `search_path` fixo: confere `app.bi_pode_ver` em **cada** empresa pedida e recusa organizações misturadas; depois calcula sem a RLS linha a linha (8,8 s → 0,12 s no Grupo Clara) |
| `app.bi_pode_ver(cliente)` | Quem vê: ferramenta `bi_gestao` (nível ver) **e** acesso liberado à empresa (097), ou Portal do Cliente com o BI liberado. `app.bi_pode_lancar` exige nível operar e acesso liberado |
| `bi_grupos`, `bi_grupo_empresas` | Grupos de empresas e suas empresas |
| `bi_linhas` | Contas do DRE e do DFC (padrão e por organização), com subtotais em `soma` |
| `bi_mapa_categorias`, `bi_cfop_regras` | Categoria do Omie → conta; CFOP → linha da DRE |
| `omie_notas`, `omie_nota_cfops`, `omie_movimentos` | Dados copiados do Omie pela função `omie-sincronizar` |
| `bi_complementares` | Lançamentos complementares (fora do Omie) |
| `bi_acessos`, `app.bi_acessos_log` (097) | Pedidos de acesso (pedido, aprovado, negado, encerrado; validade) e registro de quem abriu os números |
| `bi_empresas()`, `bi_acesso_pedir/decidir/encerrar`, `bi_acessos_listar()`, `bi_registro_acessos(dias)` (097) | Cartões, pedidos e aprovação, lista e registro (este só administrador) |
| `app.bi_liberado`, `app.bi_responsavel`, `app.bi_pode_aprovar`, `app.bi_org_dos_clientes` (097) | Regras: liberado = admin, responsável ou pedido aprovado válido; todas as empresas pedidas conferidas, no máximo 50, mesma organização |
| `bi_indicadores(clientes, inicio, fim, eliminar)` (097) | PMR, PMP, aberto por faixa, maiores clientes e fornecedores, liquidez do balancete |
| `bi_orcamento`, `bi_orcamento_gravar(jsonb, arquivo)`, `bi_orcado(...)` (097) | Orçamento por empresa, linha e mês (valor positivo; branco apaga; tudo ou nada); `bi_orcado` devolve no formato do relatório com o sinal pela natureza da linha |

Regras puras da tela em `web/src/dominios/bi/`: `relatorio.ts` (matriz, período, margens), `comparar.ts` (períodos de
comparação, horizontal, vertical, por empresa), `indicadores.ts` e `lancamentos.ts` (leitura das planilhas), com testes.
Componentes em `web/src/dominios/bi/componentes/`.

## Pendências conhecidas

- **Classificação das categorias:** em 19/11/2026 o mapa (`bi_mapa_categorias`) tinha 2 regras para 118 categorias do
  Omie usadas pelo Grupo Clara; quase toda despesa cai em "Não classificado" (R$ 3,24 mi em 2026) e custos/despesas
  aparecem zerados. A classificação é decisão contábil do Edvaldo.

- As migrações do BI e do Omie, aplicadas direto em produção, estão no repositório desde 20/11/2026 (`090_bi_gestao_omie`
  a `090e_omie_restaura_agendamento`; ALT-02, ver `docs/04` §4.5.1). Continua existindo um segundo modelo do Omie
  (`omie_contas`/`gestao_*`, na `090d`) sem uso (NOV-02). A tela usa o modelo `bi_*`, o único com dados (Grupo Clara).
- A MDC ainda não tem tela para manter grupos e o mapa de categorias; hoje isso é feito pela equipe técnica.
  Desde a 099 não há gravação direta nessas tabelas pelo site (NOV-01): a tela futura deve gravar por função
  `security definer` com `hub_pode(org, 'bi_gestao', 'gerir')` e recusar organização pessoal.
  Lançamentos complementares e orçamento têm tela desde a v2.
- Nome do fornecedor: incluir na sincronização do Omie.
