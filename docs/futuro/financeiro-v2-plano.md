# Financeiro v2: plano da reconstrução (01/11/2026)

Pedido do Edvaldo: o módulo Financeiro vai ser **vendido aos clientes com licença de uso** e precisa ter nível de
produto profissional, comparável ao Conta Azul/Omie, mas ligado à contabilidade da MDC (plano do Domínio) e ao
regime tributário de cada cliente. Este documento é a referência comum das frentes que trabalham em paralelo.

## Decisões do Edvaldo (01/11/2026)

- Licença cobrada **junto com o honorário**: o HUB controla contratos, valores, vencimentos e atrasos; o boleto/Pix
  continua sendo o que a MDC já usa; a baixa entra manual ou pelo extrato da MDC.
- Inadimplência: o HUB **lista e avisa**; o **bloqueio é manual** (a MDC decide quem bloquear). Bloqueado = o cliente
  não acessa os módulos pagos no Portal; os dados ficam guardados; a equipe MDC continua acessando.
- Notas: **comunicador fiscal próprio** (sem empresa emissora), nas Edge Functions do Supabase
  (`Deno.createHttpClient({ cert, key, http2: false })`, testado em 01/11 — ver `hub-gestao-desenho.md`).
- Auditoria independente só quando o Edvaldo pedir.
- Piloto: MDC e Greencore.

## Frentes (cada uma numa branch/worktree, migração própria)

| Frente | Migração | Escopo |
| --- | --- | --- |
| 1. Licenças e cobrança | `031_licencas.sql` | Produtos/módulos vendáveis, planos, contratos por cliente, cobranças mensais (geradas sozinhas), baixa, inadimplência por faixa de atraso, bloqueio manual, acesso do Portal conforme contrato, relatório "faturamento do mês" para ir junto com o honorário |
| 2. Notas fiscais (entrada) | `032_fiscal.sql` | Certificado A1 por cliente (Vault), captura automática de NF-e (Distribuição DF-e) e NFS-e (ADN), manifestação do destinatário (4 eventos, XML assinado), painel de notas recebidas, tipo de entrada (modelo Conta Azul), de-para de itens do fornecedor, geração de contas a pagar e entrada de estoque, análise por regime (Simples, Presumido, Real) e carga tributária das entradas |
| 3. Itens, estoque e pedidos | `033_estoque_pedidos.sql` | Cadastro de itens fácil para o usuário final (assistente, importação por planilha, duplicar), custo médio, ficha de estoque (kardex), posição valorizada, inventário, pedidos de compra (entrada no estoque + conta a pagar) e de venda (baixa automática + conta a receber) |
| 4. Painel e experiência | `034_painel_transferencias.sql` | Painel inicial do Financeiro (saldo, hoje, vencidos, fluxo dos próximos 30 dias, últimos 6 meses), módulos separados no menu lateral (Financeiro, Plano de contas, Centros de custo, Relatórios, cadastro comum de fornecedores e clientes; `hub_apps` de Entradas, Saídas e Estoque), transferência entre contas, Relatórios gerenciais, molde visual único (08-convencoes 8.3.1) |
| Depois | — | Emissão de NFS-e (padrão nacional, DPS assinada) e NF-e modelo 55 (layout 4.00, IBS/CBS), DANFE/DANFSe, cancelamento, CC-e; testes em homologação com certificado real |

Mudança de estrutura (Edvaldo, 01/11/2026, 14h34): modelo Conta Azul/Omie, **módulos separados**, cada um com rota e
item próprio no menu lateral, vendável e liberável por cliente: Financeiro (`/financeiro`), Entradas (`/entradas`),
Saídas (`/saidas`), Estoque (`/estoque`), Centros de custo (`/centros-custo`), Plano de contas (`/plano-contas`, com as
categorias) e Relatórios (`/relatorios`); fornecedores e clientes num cadastro comum (`/cadastros/pessoas`).

## Regras comuns a todas as frentes

- Seguir `CLAUDE.md` e `docs/08-convencoes.md` 8.3 (leigo, filtros fáceis, PDF/Excel, celular, aparência).
- Acesso a dados do cliente: `app.fin_pode(cliente, nível)` (equipe com a ferramenta `financeiro` ou Portal com a
  permissão `financeiro`). A frente 1 acrescenta a checagem de contrato/bloqueio para o lado do Portal.
- Nada se apaga: inativar, cancelar, estornar, com motivo e auditoria (`app.registrar`).
- Gravação com regra só por função `security definer` com `search_path` fixo e checagem de permissão.
- Migração **não é aplicada** pela frente: quem integra aplica com aprovação do Edvaldo.
- Testes SQL no padrão de `supabase/testes/` (Postgres 16 local) e testes de regra pura (vitest).
- Componentes comuns: `CampoArquivo`, `Modal`, `Abas`, `dominios/financeiro/componentes/Comuns.tsx`
  (`BotoesExportar`, `FiltroPeriodo`, `Indicador`, `JanelaMotivo`), `dominios/financeiro/exportar.ts`.

## Estrutura em módulos separados (decisão do Edvaldo, 01/11/2026 14h34)

Modelo Conta Azul/Omie: cada módulo é independente no menu, vendável e liberável por cliente, dando autonomia ao
cliente e melhor gestão ao HUB. Cadastros comuns (fornecedores/clientes, contas bancárias) são compartilhados.

| Módulo (slug) | Rota | Conteúdo |
| --- | --- | --- |
| Financeiro (`financeiro`) | `/financeiro` | Painel, a pagar, a receber, entradas e saídas de caixa, bancos, **transferências entre contas**, extratos e conciliação |
| Entradas (`entradas`) | `/entradas` | Notas recebidas (captura SEFAZ/ADN), manifestação, lançar nota por tipo de entrada, compras (pedidos de compra), carga tributária das entradas, certificado digital |
| Saídas (`saidas`) | `/saidas` | Vendas (pedidos de venda com baixa de estoque), notas emitidas; emissão de NF-e/NFS-e na etapa seguinte |
| Estoque (`estoque`) | `/estoque` | Itens, locais, posição valorizada, movimentações, ficha do item, inventário |
| Centros de custo (`centros_custo`) | `/centros-custo` | Cadastro e análise por centro |
| Plano de contas (`plano_contas`) | `/plano-contas` | Plano do Domínio e categorias de despesa/receita ligadas a ele |
| Relatórios (`relatorios`) | `/relatorios` | DRE gerencial, fluxo de caixa realizado x previsto, relatórios de cada módulo |

Integração (depois das frentes): migração que separa a permissão por módulo (`app.fin_pode(cliente, nível, módulo)`),
liberação de cada módulo por pessoa da equipe (hub_apps) e por cliente (contrato da Frente 1).
