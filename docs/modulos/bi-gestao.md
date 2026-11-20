# BI de Gestão (Omie)

Tela `/bi-gestao` (módulo `bi_gestao`, ferramenta `bi_gestao` em `hub_apps`). Criada em 19/11/2026.

## O que mostra

A DRE gerencial (pela competência) e o fluxo de caixa (DFC, pela data do pagamento) de um **grupo de empresas**, mês a
mês e no total do período. Os dados vêm do sistema do cliente (Omie) e dos lançamentos complementares da MDC.

- **Filtros:** grupo (só aparece com mais de um), período (até 3 anos; "Tudo" vira os últimos 3 anos), empresas do grupo
  (ao menos uma) e, com mais de uma empresa, **Tirar vendas e pagamentos entre as empresas do grupo** (padrão do grupo,
  `bi_grupos.eliminar_intragrupo`).
- **Destaques:** DRE: receita líquida, lucro bruto e resultado líquido, com a margem sobre a receita líquida. DFC:
  recebido de clientes, caixa das operações e variação do caixa.
- **Aviso "Não classificado":** categorias do Omie sem conta em `bi_mapa_categorias`.
- **Arquivos:** PDF e Excel em paisagem, com uma coluna por mês e o total.
- **Celular:** só o total do período na tabela; os meses ficam na tela maior e nos arquivos.

## Banco

| Objeto | Papel |
| --- | --- |
| `bi_relatorio(p_relatorio, p_clientes, p_inicio, p_fim, p_eliminar)` | Monta o relatório (uma linha por conta e mês). Desde a 094, `security definer` com `search_path` fixo: confere `app.bi_pode_ver` em **cada** empresa pedida e recusa organizações misturadas; depois calcula sem a RLS linha a linha (8,8 s → 0,12 s no Grupo Clara) |
| `app.bi_pode_ver(cliente)` | Quem vê: ferramenta `bi_gestao` (nível ver) na organização ou Portal do Cliente com o BI liberado |
| `bi_grupos`, `bi_grupo_empresas` | Grupos de empresas e suas empresas |
| `bi_linhas` | Contas do DRE e do DFC (padrão e por organização), com subtotais em `soma` |
| `bi_mapa_categorias`, `bi_cfop_regras` | Categoria do Omie → conta; CFOP → linha da DRE |
| `omie_notas`, `omie_nota_cfops`, `omie_movimentos` | Dados copiados do Omie pela função `omie-sincronizar` |
| `bi_complementares` | Lançamentos complementares (fora do Omie) |

As regras puras da tela (matriz linha × mês, período, margens) estão em `web/src/dominios/bi/relatorio.ts`, com
testes em `relatorio.test.ts`.

## Pendências conhecidas

- **Classificação das categorias:** em 19/11/2026 o mapa (`bi_mapa_categorias`) tinha 2 regras para 118 categorias do
  Omie usadas pelo Grupo Clara; quase toda despesa cai em "Não classificado" (R$ 3,24 mi em 2026) e custos/despesas
  aparecem zerados. A classificação é decisão contábil do Edvaldo.

- As migrações do BI e do Omie foram aplicadas direto em produção e **não estão no repositório** (reauditoria de
  19/11/2026, ALT-02). Também existe um segundo modelo do Omie (`omie_contas`/`gestao_*`) sem uso (NOV-02). A tela usa
  o modelo `bi_*`, o único com dados (Grupo Clara).
- A MDC ainda não tem tela para manter grupos, mapa de categorias e lançamentos complementares; hoje isso é feito pela
  equipe técnica.
