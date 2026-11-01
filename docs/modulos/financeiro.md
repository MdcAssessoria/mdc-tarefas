# Módulo Financeiro

> **Resumo:** a MDC acompanha os bancos de cada cliente dentro do HUB. Etapa 1 (esta): plano de contas do Domínio,
> contas bancárias e importação de extratos (OFX ou Excel). Próximas etapas: conciliação com centros de custo (2),
> exportação para o Domínio em Excel/TXT (3) e relatórios (4). Cada etapa é auditada e testada com a MDC (Piloto HUB)
> antes da carteira.

## 1. Telas

| Endereço | Quem usa | O que faz |
| --- | --- | --- |
| `/financeiro` | Equipe (ver; cadastro com operar) | Contas bancárias da empresa escolhida: saldo pelos extratos, último lançamento, lançamentos a conciliar, conta contábil ligada; cadastrar e editar; PDF e Excel |
| `/financeiro/extratos` | Equipe (ver; importar com operar) | Importa OFX ou planilha numa conta (confere antes de gravar); lista com filtros de conta, período, entradas/saídas, situação e busca; totais; PDF e Excel |
| `/financeiro/plano` | Equipe (ver; importar com operar) | Importa o plano de contas do Domínio (Excel/CSV); lista com busca e filtros; PDF e Excel |

A empresa escolhida fica lembrada no navegador (`hub-mdc:financeiro:cliente`) e vale para as três telas.

Código: regras puras em `web/src/dominios/financeiro/` (`ofx.ts`, `extratoPlanilha.ts`, `planoDominio.ts`, testes em
`leitores.test.ts`), leituras paginadas em `leituras.ts`, gravações em `repositorio.ts`, telas em
`web/src/app/(hub)/financeiro/`.

## 2. Regras

| Regra | Onde |
| --- | --- |
| Plano de contas: precisa das colunas Classificação e Descrição (ou Nome); Código e Tipo (S/A) são opcionais. Sem coluna Tipo, conta com filha é sintética | `planoDominio.ts` |
| Importar o plano de novo atualiza: conta nova entra, existente é atualizada, conta que saiu do Domínio fica **inativa** (nunca apagada) | `fin_importar_plano` (migração 026) |
| Conta bancária só se liga a conta **analítica ativa** do plano do mesmo cliente; não muda de cliente | gatilho `tg_fin_conta_bancaria` |
| Extrato OFX (SGML ou XML) e planilha (data, histórico, valor ou débito/crédito); OFX com acento antigo é lido como Windows-1252 | `ofx.ts`, `extratoPlanilha.ts`, `leituras.textoDoArquivo` |
| Lançamento repetido não entra duas vezes: chave = identificador do banco (FITID) ou data+valor+histórico (+ ordem dentro do arquivo) | `chavesDoArquivo` + `unique (conta_id, chave)` |
| Aviso quando o número da conta do arquivo não bate com o cadastrado | tela de extratos |
| Saldo da conta = saldo inicial + lançamentos a partir da data do saldo inicial | `saldoDaConta` |

## 3. Banco (migração 026)

`fin_plano_contas`, `fin_plano_importacoes`, `fin_contas_bancarias`, `fin_extrato_lotes`, `fin_extrato_linhas`.
Leitura com `app.hub_pode(org, 'financeiro', 'ver')`; contas bancárias gravadas direto com `operar`; plano e extrato só
pelas funções `fin_importar_plano` e `fin_importar_extrato` (security definer, conferem `operar`, tudo ou nada).
