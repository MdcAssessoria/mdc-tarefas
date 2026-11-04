# Reauditoria — 03/11/2026, tarde (pedido do Edvaldo: "5 profissionais diferentes")

**Escopo:** commit `e0ece2c` (no ar: migração 042, Gestão só da MDC, correções de documentos). Cinco auditores
independentes, de especialidades diferentes, cada um numa cópia própria do código e só leitura:

1. Segurança (`security-auditor`): banco montado com as 42 migrações em sequência, provas por perfil de usuário.
2. Banco e regras (`db-schema-reviewer`): bateria SQL e provas p01–p08.
3. Revisão de código (`code-reviewer`): diff `2b773e1..e0ece2c` e estado de C-01…C-20.
4. Telas, uso leigo e acessibilidade (`accessibility-specialist`): 58 telas, axe-core WCAG 2.2 AA, medições no celular.
5. Design, marca e documentos (`Artisan`): PDFs e Excel gerados e conferidos página a página.

**Conferido em produção pela sessão principal (só leitura):**
- 1 certificado A1 (o da MDC) e nenhum contrato fixo de outra empresa: os riscos BD-01/COD-01 e BD-02 não estão ativos.
- Captura de notas rodou às 12h30 UTC (depois da 042).
- 16 de 16 rodadas do pg_cron com sucesso nas últimas 2 horas.
- `gestao_cliente_id` preenchido com a MDC.

## Veredito

**A 042 e as correções fecharam o que prometiam.** Confirmados por mais de um auditor: S-01, S-03, S-04, B-01 (no escopo
da gestão), T-01 (seletor de Empresa sumiu), T-04, T-11, C-02, C-03, C-14, D-01 e D-13. D-02 e C-06 só em parte.

**Nada crítico.** Em aberto: 2 altos latentes, que dependem de dado inexistente hoje, e altos de tela já conhecidos.

| Frente | Críticos | Altos | Médios | Baixos |
| --- | --- | --- | --- | --- |
| Segurança | 0 | 0 | 1 | 8 |
| Banco | 0 | 1 (latente) | 4 | 8 |
| Código | 0 | 1 (latente, = BD-01) | 3 | 5 |
| Telas e acessibilidade | 0 | 2 | 11 | 7 |
| Design e documentos | 0 | 1 | 10 | 6 |

## Prioridade 1 — próxima migração (043) e ajustes curtos

**Situação em 03/11/2026, noite (branch `fase2-seguranca-telas`, migração 047 ainda não aplicada):** BD-01 e BD-02
resolvidos na 045 (aplicada); SEG-01, SEG-02/BD-07, SEG-03/BD-06, SEG-08/BD-05 e SEG-09 resolvidos na **047** (testes
103/104); COD-03/UX-11, UX-02 e DES-01 resolvidos nas telas; BD-04 **em aberto** (os testes 20/30/50/70 rodam antes da
042 com o cliente c1; os casos de gestão da MDC estão cobertos pelos testes 98, 100, 102 e 104). UX-01 (Prioridade 2)
resolvido com a coluna de ações presa à direita no celular.

| # | O quê | Por quê |
| --- | --- | --- |
| BD-01 / COD-01 (resolvido, 045) | `fis_captura_reservar` filtrar `app.empresa_gestao` | Um certificado de outra empresa pararia toda a captura (inclusive da MDC). Hoje não há. |
| BD-02 (resolvido, 045) | `fin_recorrentes_rotina` filtrar a empresa e tratar erro por contrato | Um contrato de outra empresa derrubaria a rotina inteira, sem registro. Hoje não há. |
| SEG-01 (resolvido, 047) | `hub_arquivos` sem DELETE (gatilho nada_se_apaga) e "retirar anexo" só pelo administrador, com motivo | Hoje dá para apagar o registro e depois o arquivo, sem auditoria. |
| SEG-02 / BD-07 (resolvido, 047) | Trocar `gestao_cliente_id` só por função auditada | Hoje o administrador troca a empresa da Gestão pela API, sem rastro. |
| SEG-03 / BD-06 (resolvido, 047) | Contratos lê só id e nome dos cadastros (função `fin_recorrente_opcoes`) | Hoje lê CPF, e-mail e dados bancários. |
| SEG-08 / BD-05 (resolvido, 047) | Trava de NaN em `portal_balancete_linhas` e `soc_taxas` | Um NaN pode chegar ao Demonstrativo assinado. |
| SEG-09 (resolvido, 047) | Anexo do Portal só em tarefa do próprio cliente | Hoje um cliente consegue pendurar arquivo na rotina de outro (precisa do UUID). |
| BD-04 | Rodar os testes 20/30/50/70 depois da 042 com a empresa MDC | Hoje baixa, estoque e notas não têm teste com a regra que vale em produção. |
| COD-03 / UX-11 (resolvido) | Mostrar "Carregando" e, para o administrador, como definir a empresa | A tela pisca "Empresa da Gestão não definida" ao abrir. |
| DES-01 (resolvido) | Marca d'água "MINUTA" em todas as páginas do contrato em rascunho | Hoje uma minuta impressa pode ser assinada como definitiva. |
| UX-02 (resolvido) | Aviso do Portal sem "serviços do HUB" e sem "Financeiro suspenso" | Confunde o cliente, que não tem mais Financeiro no HUB. |

## Prioridade 2 — telas (antes de levar aos pilotos)

- **UX-01 (resolvido: coluna de ações fixa no celular):** 15 tabelas de lado no celular, com as ações fora da tela (Entradas, Estoque, Cobrança Ledgra, Pessoas e acessos, Configurações, Acessos do portal).
- **UX-04:** ações em massa sem confirmação.
- **UX-05:** concluir tarefa no Início com toque de 24 px e sem desfazer.
- **UX-06, UX-07:** Pessoas e acessos e Configurações sem PDF/Excel, com campos sem rótulo e avisos não anunciados.
- **UX-08:** sub-abas escondidas no celular.
- **UX-09:** alvos de toque menores que 44 px; letra de 14 px nos campos faz o iPhone dar zoom.
- **UX-10:** 137 elementos com contraste insuficiente.
- **UX-12:** em Lançar nota, "Voltar" descarta tudo sem perguntar.
- **UX-13:** botões cortados a 1280 px.
- **T-02:** a conciliação de extrato não existe.

## Prioridade 3 — Contratos (regras), aguardando decisões do Edvaldo

- **B-04 a B-09 e B-12 continuam abertos e foram reproduzidos:**
  - reajuste duplo;
  - ciclo de reajuste que some;
  - meses perdidos;
  - avisos para as pessoas erradas e antes do IPCA;
  - falhas que ninguém vê;
  - "atualizar abertas" apaga ajuste manual;
  - renovação de contrato com vencimento em 29/02.
- **BD-03 (= S-02):** quem tem só Contratos lança conta a pagar. Exigir o Financeiro quando o contrato gera contas?
- **B-16, decisões pendentes:**
  - vencimento entre os dias 1 e 5;
  - cobrança do mês cheio no início e no fim do contrato;
  - IGP-M negativo reduz o valor ou não.
- **COD-08:** regra do "e" no valor por extenso (1.200.300).

## Prioridade 4 — documentos e acabamento

- **D-03:** "Rascunho" em todas as páginas do Demonstrativo.
- **DES-02:** a última cláusula deve ir junto com o fecho do contrato.
- **DES-03 / T-13:** plurais com "(s)", inclusive "1 empregado(s)" no contrato.
- **DES-04 / D-10:** textos cortados com "…" no PDF do Demonstrativo.
- **DES-05:** total no balancete de verificação.
- **DES-06 / DES-07 / D-08:** PDF e Excel de lista (título repetido, "(continuação)", data como texto, decimais).
- **DES-08 / D-07:** cores com sentido único.
- **DES-09:** posição dos botões fora do molde.
- **DES-10:** gráfico "Seu ritmo" ilegível no celular.
- **D-11:** dados da MDC escritos à mão no PDF do Demonstrativo.
- **DES-12 a DES-17:** pequenos ajustes visuais.

## Código (manutenção)

- **Abertos:** C-01 (tipos gerados não usados no cliente Supabase), C-04 (listas sem `lerTudo`), C-05, C-07, C-08, C-09, C-10 (ordem dos botões só pelo CSS), C-11 / SEG-06 (CORS), C-13, C-15, C-17, C-18 e C-19.
- **COD-02:** o arquivo XML órfão continua, porque o bucket `fiscal` não deixa apagar. Inverter a ordem: registrar primeiro, enviar depois.
- **COD-05 a COD-07 e COD-09:** detalhes menores.

## O que está bem

- A cadeia 001→042 aplica limpa num banco vazio. A 042 pode ser reaplicada sem erro.
- Nenhuma função `security definer` está sem `search_path` fixo. RLS está ligada em todas as tabelas.
- O Portal não lê mais nada da Gestão. Contratos não lê mais o Financeiro inteiro.
- Os testes do site passaram de 347 para 394. A tabela do valor por extenso tem 20 casos.
- O espelho da NF-e é o melhor documento do sistema e serve de modelo para os outros PDFs.
- O papel timbrado e a assinatura técnica são consistentes. Os acentos saem corretos em todos os documentos.
- Financeiro, Contratos, Plano de contas, Centros de custo e Tarefas funcionam bem no celular.
- O foco do teclado é visível. Não há `confirm`/`alert`. Toda exclusão pede motivo.

Os relatórios completos de cada auditor e as provas ficaram nas cópias de trabalho da sessão (scratchpad `aud2-*`).
