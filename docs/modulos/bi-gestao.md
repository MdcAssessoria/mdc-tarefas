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
    caixa; gráfico resultado × caixa com o resultado acumulado, cascata da DRE (receita → resultado) e receita mês a mês.
  - **DRE** e **Fluxo de caixa:** matriz linha × mês com total, coluna **% da receita** (análise vertical) e PDF/Excel.
    Desde a 104: cada linha abre nas contas do plano (`bi_relatorio_contas`, `dominios/bi/detalhe.ts`) e o clique num
    valor abre a janela "De onde vem este valor" (`bi_origem`: notas, impostos das notas, títulos, baixas e
    complementares; até 5.000 linhas, com busca e PDF/Excel). Na DRE, cartões de margem por faixa
    (`dominios/bi/margens.ts`, decisão do Edvaldo 20/11/2026): bruta < 20% / 20–35% / > 35%; operacional < 5% / 5–12% /
    > 12%; líquida < 0% / 0–8% / > 8% (vermelho / amarelo / verde), com a frase "de cada R$ 100…".
  - **Comparar:** período × período anterior, × mesmo período do ano passado (análise horizontal) ou **× orçamento**
    (realizado × orçado), com diferença em R$ e variação em %. Verde = melhor para o resultado.
  - **Empresas** (só com mais de uma): participação de cada empresa na receita líquida e no resultado (ou no caixa),
    uma coluna por empresa, soma, eliminações entre elas e consolidado.
  - **Indicadores:** prazo médio de recebimento e de pagamento (com o período anterior), ciclo financeiro,
    inadimplência, contas a receber e a pagar por faixa de atraso (a vencer, 1–30, 31–60, 61–90, +90), 10 maiores
    clientes (notas autorizadas) e fornecedores (títulos), e liquidez.
  - **Lançamentos:** lançamentos complementares (fora do Omie: novo, importar Excel, modelo, cancelar com motivo) e
    **Orçamento** (grade linha × 12 meses por empresa e ano, gravar, desfazer, importar e baixar planilha).
    e **Projeção (anos seguintes)** (116, `componentes/AbaProjecao.tsx`, regras em `projecao.ts` com teste): parte
    do realizado da DRE do ano-base (`bi_relatorio`, sem eliminação) e projeta 1 a 5 anos. Premissas gerais
    (crescimento da receita e inflação por ano); cada linha analítica projeta por **crescimento/reajuste %** sobre o
    ano anterior (padrão: crescimento da receita nas receitas, inflação nas despesas) ou **% da receita bruta**
    (padrão em deduções, devoluções, custos e IRPJ/CSLL; taxa sugerida = participação no ano-base); valor digitado
    vence o cálculo; subtotais pela árvore `bi_linhas.soma`; "Não classificado" fica fora (aviso com o valor).
    Estudos em `bi_projecoes` (vários por empresa, nome único); planilha-modelo com abas Projeção e Premissas
    (import marca como digitado só o que difere do calculado). **Provisionar** grava os anos projetados no Orçamento
    da DRE por `bi_projecao_provisionar` (chama `bi_orcamento_gravar` numa transação; mês a mês pela sazonalidade do
    ano-base, fechando no centavo) e marca o estudo como provisionado.
- **Aviso "Não classificado":** categorias do Omie sem conta do plano (código na descrição ou exceção) nem regra antiga.
- **Orçamento:** anos de 2 para trás até 5 para a frente (o ano escolhido sempre aparece).
- **Gráficos** (`componentes/GraficoBarras.tsx`, contas em `graficos.ts`): SVG desenhado na largura real da tela (texto
  com tamanho de verdade no celular), escala com números redondos, balão com os valores do mês.
- **Celular:** tabelas em cartões; na cascata o nome vai acima da barra.

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
| `bi_plano` (104) | Plano de contas gerencial: padrão MDC (org nula) = plano unificado do Edvaldo (95 contas, 3.1.01 a 8.1.02) + contas fora da DRE (9.x, transferências 0.0.01). Cada conta diz a linha da DRE e do fluxo; `dre_por_titulo = false` nas contas que a DRE pega das notas (venda, impostos sobre a venda, devoluções) |
| `bi_plano_excecoes` (104) | Categoria sem código no nome (ou com outra conta) → conta do plano, por empresa ou organização; `a_conferir` para as 21 recuperadas do de-para antigo (090d) |
| `app.bi_conta`, `app.bi_fatos` (104) | Classificação (exceção → transferência 0.01.* → código "x.y.zz - " na descrição → regra antiga → não classificado) e cada fato do relatório com a origem (nota, imposto, título, baixa, complementar) |
| `bi_relatorio_contas(...)`, `bi_origem(..., linha, conta, mês)` (104) | Relatório até a conta do plano e as notas/títulos que formam um valor (até 5.000, com registro de acesso) |
| `bi_plano.linha_dfc_entrada` (105) | Linha do fluxo para o que ENTRA na conta quando difere da do que sai: 9.1.01 (adiantamentos, cartão, duplicidades) recebida vai para "Outros recebimentos"; paga continua em despesas |
| `bi_classificacao_listar`, `bi_excecao_salvar/conferir/excluir`, `bi_plano_excecoes_hist` (105) | Aba **Classificação** (só a equipe MDC: `hub_pode(org, 'bi_gestao', 'gerir')`, decisão do Edvaldo 20/11/2026): categorias usadas com a conta, de onde veio (código, equipe, transferência, sem) e o valor no período; classificar (opção de aplicar às outras empresas escolhidas com a mesma categoria e nome), conferir e desfazer (motivo ≥ 5 letras). Tudo vai para o histórico |
| `omie_saldos`, `bi_saldos(...)` (105) | Saldo de cada conta corrente no começo e no fim do mês, trazido pela `omie-sincronizar` (`ListarContasCorrentes` + `ListarExtrato`: os 2 últimos meses a cada rodada e até 4 meses que faltam desde `sincronizar_desde`; falha nesta parte não derruba a rodada e fica no resumo). Leitura com a mesma permissão dos relatórios |
| `omie_extrato` (106) | Movimentos do extrato de cada conta corrente (`ListarExtrato`), gravados junto com os saldos e regravados por mês. Motivo: `ListarMovimentos` só traz baixas de títulos; transferências, tarifas, antecipações e pagamentos lançados direto na conta não chegavam ao fluxo (Grupo Clara out–nov/2026: bancos −R$ 215 mil × fluxo +R$ 654 mil). A entrada no fluxo de caixa do que não veio de título vem na migração seguinte, depois de conferir os campos reais |
| `app.bi_fatos` (107) | **DFC pelo extrato**: nos meses da conta corrente com extrato gravado (`omie_saldos.dados.extrato`), o fluxo sai de `omie_extrato` (Conta Paga/Recebida, Débito/Crédito em Conta Corrente, pela categoria do Omie; sem "Débito/Crédito de Transferência" e sem previstos; eliminação pelo `cDocCliente`); nos meses sem extrato, baixas de títulos (108: o extrato só entra em mês marcado, nunca soma com as baixas). Conferido em 21/11/2026: 105 de 105 pares conta × mês fecham com o saldo; Grupo Clara out–nov/2026 = −R$ 214.760 nos dois. Origem `extrato` = "Movimento do banco" na janela |
| `omie_notas`, `omie_nota_cfops`, `omie_movimentos` | Dados copiados do Omie pela função `omie-sincronizar` (código em `supabase/functions/omie-sincronizar`, no repositório desde 20/11/2026; agendador a cada 5 min com `x-agente-token`) |
| `bi_complementares` | Lançamentos complementares (fora do Omie) |
| `bi_acessos`, `app.bi_acessos_log` (097) | Pedidos de acesso (pedido, aprovado, negado, encerrado; validade) e registro de quem abriu os números |
| `bi_empresas()`, `bi_acesso_pedir/decidir/encerrar`, `bi_acessos_listar()`, `bi_registro_acessos(dias)` (097) | Cartões, pedidos e aprovação, lista e registro (este só administrador) |
| `app.bi_liberado`, `app.bi_responsavel`, `app.bi_pode_aprovar`, `app.bi_org_dos_clientes` (097) | Regras: liberado = admin, responsável ou pedido aprovado válido; todas as empresas pedidas conferidas, no máximo 50, mesma organização |
| `bi_indicadores(clientes, inicio, fim, eliminar)` (097) | PMR, PMP, aberto por faixa, maiores clientes e fornecedores, liquidez do balancete |
| `bi_orcamento`, `bi_orcamento_gravar(jsonb, arquivo)`, `bi_orcado(...)` (097) | Orçamento por empresa, linha e mês (valor positivo; branco apaga; tudo ou nada); `bi_orcado` devolve no formato do relatório com o sinal pela natureza da linha |
| `bi_projecoes`, `bi_projecao_salvar`, `bi_projecao_excluir`, `bi_projecao_provisionar(id, linhas)` (116) | Estudos de projeção por empresa (premissas em JSON, até 5 anos); leitura por `app.bi_pode_ver`, gravação só pelas funções com `app.bi_pode_lancar`; provisionar aceita só linhas da DRE da empresa do estudo nos anos ano-base+1 a +5 |

Aba **Resultado × caixa** (105, `conciliacao.ts`): a DRE (competência) e o fluxo (pagamento) somados por grupo de contas do
plano (vendas, outras receitas, impostos, pessoal com a mão de obra da produção, custos, despesas, financeiras, sem conta),
com a diferença e o alerta — atenção a partir de 10%, alerta a partir de 25% da diferença sobre o maior lado, só acima de
R$ 5 mil (decisão do Edvaldo, 20/11/2026) — e a ponte resultado + diferenças + "só caixa" (empréstimos, parcelamentos,
adiantamentos, investimentos, sócios) = variação do caixa (CPC 03 (R2), item 20A). Abaixo, os saldos dos bancos
(`saldos.ts`): início, fim e a diferença para a variação do fluxo (o que passou pelo banco sem conta a pagar/receber). Os
saldos aparecem também na aba Fluxo de caixa.

**Padrão de demonstrativo da MDC (21/11/2026, pedido do Edvaldo):** toda tabela de valores do BI (DRE, fluxo, comparar,
empresas, resultado × caixa, saldos) usa o estilo `.demo` de `globals.css` e as peças de `componentes/Demonstrativo.tsx`
(`QuadroDemonstrativo`, `TdValor`, `classeDaLinha`): cabeçalho verde MDC preso, 1ª coluna presa, números sem "R$" e sem
centavos (opção "Centavos"), negativos em vermelho, subtotais em cinza-verde e resultados com filete dourado. Na DRE e no
fluxo, três níveis: linha → conta do plano → documentos (os 30 maiores, via `bi_origem`; "ver todos" abre a janela).
Formato e documentos por mês em `formatoMatriz.ts`; régua das margens em `margens.ts` (`regua`).

**Saúde do negócio** (aba Indicadores, 21/11/2026, `indicadoresGestao.ts`): margem EBITDA (= resultado operacional, o
plano gerencial não tem depreciação; faixas 5%/12%), cobertura de juros (resultado operacional ÷ despesas financeiras;
1,5×/3×), folga sobre o ponto de equilíbrio (equilíbrio = pessoal + administrativas ÷ margem de contribuição; 0%/20%),
fôlego de caixa (saldo dos bancos no fim ÷ média mensal de pagamentos da operação; 1/3 meses) e conversão em caixa
(caixa das operações ÷ resultado operacional; 50%/90%). Cartões com régua (`CartaoFaixa`), premissas em letra pequena e
a conta de origem na dica e no PDF. Faixas propostas pelo Claude, a validar pelo Edvaldo.

**Parecer gerencial** (aba Parecer, só `bi_gestao` › gerir, 21/11/2026, `parecer.ts` + `AbaParecer.tsx`): mesmo formato do
parecer do balancete (`dominios/demonstrativos/parecer.ts`): seções técnicas com fundamento (NBC TG 00, Lei 6.404/1976
art. 177, NBC TG 03 para a conciliação do método direto, Resolução CVM 156/2022 para o EBITDA como medida não contábil;
alcance: não é auditoria NBC TA nem revisão NBC TR 2400) e um quadro "Em linguagem simples" por seção. Usa só o que o BI
já calcula: DRE e DFC (`bi_relatorio`), DRE do período anterior, contas da DRE (maiores gastos), `conciliar`, saldos
(`resumirSaldos`, `mesesIncompletos` = meses sem o saldo de todas as contas), indicadores dos títulos e
`indicadoresGestao`. Pontos de atenção automáticos: cobertura de juros e fôlego baixos, receita abaixo do equilíbrio,
inadimplência > 10%, "Não classificado" e alertas do resultado × caixa. Trechos `[Revisar…]` pedem o julgamento do
contador (contexto, meses sem extrato, assinatura). Sem gravação no banco: o texto editado fica no `localStorage` do
navegador por empresas + período + eliminação; impressão com `VisaoParecer` (cabeçalho/rodapé MDC), o resto da tela
com `print:hidden`. Publicar no Portal do Cliente fica para uma próxima etapa (precisa de tabela e assinatura).

Regras puras da tela em `web/src/dominios/bi/`: `relatorio.ts` (matriz, período, margens), `classificacao.ts`,
`conciliacao.ts`, `saldos.ts`, `detalhe.ts`, `margens.ts`, `parecer.ts`, `comparar.ts` (períodos de
comparação, horizontal, vertical, por empresa), `indicadores.ts` e `lancamentos.ts` (leitura das planilhas), com testes.
Componentes em `web/src/dominios/bi/componentes/`.

**109 (21/11/2026) — eliminação, operações entre empresas e nomes.** (0) Erro corrigido: o filtro da eliminação era
`not (v_elim and app.so_digitos(coalesce(doc,'')) = any (v_cnpjs))` e `app.so_digitos('')` é NULL; com a eliminação
ligada, todo fato sem CNPJ/CPF saía (Grupo Clara out–nov/2026: R$ 123,5 mil a menos no fluxo do grupo). Troca feita
em `app.bi_fatos` e `public.bi_indicadores` sobre a definição em vigor. (1) `public.bi_intragrupo(clientes, início, fim)`
devolve os movimentos do extrato entre empresas do grupo (`intra`) e candidatos lançados sem a empresa (`sem_doc`,
mesmo valor com sinal contrário em até 7 dias); o pareamento 1:1 é em `dominios/bi/intragrupo.ts` (primeiro com a
contraparte certa, depois com qualquer empresa do grupo) e o quadro em `CartaoIntragrupo` (aba Resultado × caixa, só
com a eliminação). (2) `public.omie_pessoas` (desde a 110, por cliente e documento — um cliente nunca dá nome aos títulos de outro, achado de segurança da revisão da Vercel no PR #36; extrato prevalece sobre notas), alimentada por
gatilhos de comando em `omie_extrato`/`omie_notas`; `omie_mov_nome` completa o nome do título na gravação e
`omie_pessoas_titulos` preenche os antigos; `bi_intragrupo` tem ordem estável (data, empresa, ref) e a tela lê em páginas de 1.000 (110) (96% dos títulos com nome em 21/11/2026, por cliente). Testes em
`supabase/testes/183_bi_intragrupo_109.sql`.

**Conferência com os bancos (21/11/2026):** 27 de 30 meses do Grupo Clara já com extrato fecham no centavo, por
empresa. Claratec jul–ago/2025: R$ 218 mil recebidos na conta 3258502695, que não vinha na lista de contas (inativa) —
a `omie-sincronizar` passa a trazer o extrato também das contas inativas. Clara Company fev/2025: transferência de
R$ 949 da Sicoob sem a entrada em outra conta da empresa (provavelmente a mesma causa).

**Padrão MDC:** a Visão geral ganhou o quadro "Mês a mês" (receita líquida, lucro bruto, resultado operacional e
líquido, caixa das operações e variação do caixa) e o Orçamento usa o mesmo quadro (`QuadroDemonstrativo`).

**111 (21/11/2026) — Indicadores rápidos (A-01 do parecer de 21/11).** `public.bi_indicadores` levava 13,3 s no Grupo
Clara (ano corrente) e o papel `authenticated` corta em 8 s: Indicadores e Parecer não abriam. A classe sai uma vez por
(empresa, categoria) e as baixas são somadas por título de uma vez; mesmo resultado (comparado em produção), 0,2 s.
Texto completo da função na 111 (para esta função, resolve também o M-07). Teste com limite de tempo em
`supabase/testes/184_bi_indicadores_111.sql`.

## Pendências conhecidas

- **Classificação das categorias:** em 19/11/2026 o mapa (`bi_mapa_categorias`) tinha 2 regras para 118 categorias do
  Omie usadas pelo Grupo Clara; quase toda despesa cai em "Não classificado" (R$ 3,24 mi em 2026) e custos/despesas
  aparecem zerados. A classificação é decisão contábil do Edvaldo.

- As migrações do BI e do Omie, aplicadas direto em produção, estão no repositório desde 20/11/2026 (`090_bi_gestao_omie`
  a `090e_omie_restaura_agendamento`; ALT-02, ver `docs/04` §4.5.1). O segundo modelo do Omie
  (`omie_contas`/`gestao_*`, na `090d`), que nunca teve uso, sai na `101_omie_remove_modelo_b` (NOV-02, decisão do
  Edvaldo em 20/11/2026: fica o modelo `bi_*`).
- **Desde a 104 (20/11/2026) o plano do Edvaldo é o padrão** e a classificação sai do código na descrição da categoria; as regras abaixo só valem para categoria sem código e sem exceção.
- **Mapa de categorias do Grupo Clara é PROVISÓRIO (20/11/2026):** 254 regras por empresa carregadas a partir da
  sugestão da planilha `Classificacao_categorias_Omie_Grupo_Clara.xlsx` (código do plano gerencial do Omie), autorizadas
  pelo Edvaldo como ponto de partida. Ficaram de fora, em "Não classificado", 5 categorias para ele decidir: "Contas a
  classificar" (Clara Company 1.04.91 e 2.13.99) e "Cartão de crédito a pagar" (2.04.84 nas três). A classificação final
  é julgamento do Edvaldo; ao receber a planilha revisada, substituir as regras (por `cliente_id` + `prefixo`).
- Desde a 105 a classificação das categorias tem tela (aba Classificação). Ainda sem tela: manter os grupos de empresas
  (feito pela equipe técnica). Desde a 099 não há gravação direta nessas tabelas pelo site (NOV-01).
- Os nomes dos métodos de saldo do Omie (`ListarContasCorrentes`, `ListarExtrato`, `nSaldoAnterior`/`nSaldoAtual`) foram
  conferidos na primeira rodada em produção; se o Omie mudar, o resumo da rodada mostra "Saldos dos bancos: …".
  Lançamentos complementares e orçamento têm tela desde a v2.
- Nome do fornecedor: incluir na sincronização do Omie.
