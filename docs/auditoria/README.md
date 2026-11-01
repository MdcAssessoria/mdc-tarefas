# Pareceres de auditoria

Rotina descrita em [`../08-convencoes.md`](../08-convencoes.md#86-rotina-de-auditoria). O mais recente fica no topo.

| Data | Commit auditado | Veredito | Críticos/altos em aberto | Parecer |
| --- | --- | --- | --- | --- |
| 01/11/2026 (agente do SharePoint e link pelo WhatsApp) | `ddaf4af` (+ `ac59db4`, `c223cc5`; migrações 023 e 024 **aplicadas durante a auditoria**) | **Reprovado** (corrigir C-1 com migração nova antes de publicar a `convite` nova e fazer o push) | **1 crítico** (C-1 link de convite de equipe para quem gere o Atendimento, já no banco) · 3 altos (A-1 migrações aplicadas antes do parecer; A-2 arquivo pesado trava o agente; A-3 falha passageira manda arquivo para "Com problema") | [Parecer](2026-11-01-parecer.md) · 8 médios, 9 baixos; A-P2, N-1 e N-5 resolvidos |
| 01/11/2026 (reauditoria do PDF por período) | `519bfa8` e `f77072b` (020 aplicada; regra do PDF por período; migrações 021 e 022) | **Pode publicar**, desde que a função `demonstrativo-pdf` seja publicada **antes** do push e a importação de Excel (commit `88bf784`, fora do escopo) seja conferida num navegador | 0 críticos · 1 alto (A-P2 até o deploy; C-P1, A-P1, M-P1, M-P2, M-P3, R-1, R-2 resolvidos) | [Seção no parecer geral](2026-10-31-parecer-geral.md#reauditoria-01112026--commits-519bfa8-e-f77072b) · 3 médios novos (N-1 regra trocada em publicado, N-2 empresa aberta no meio do ano, N-6 docs) |
| 01/11/2026 (PDF por período) | `9607018` (Baixar PDF do período escolhido, assinado) | **Não pode publicar** (corrigir C-P1 e A-P1; publicar a função antes do site) | 1 crítico (C-P1 período com mês faltando no meio assinado sem fechar) · 2 altos (A-P1 período incompleto assinado com o nome do período inteiro; A-P2 ordem de publicação) | [Seção no parecer geral](2026-10-31-parecer-geral.md#auditoria-01112026--pdf-por-período-commit-9607018) · 3 médios, 3 baixos; segurança da assinatura sem achado |
| 01/11/2026 (reauditoria) | `6a709b3` (correção de A-G1 e A-G2) | Pode publicar, **desde que a função `demonstrativo-pdf` seja publicada junto** | 0 críticos · altos: A-G1 resolvido nos pontos de risco (falta o lote, agora R-1 médio); A-G2 resolvido no código, aberto em produção até o deploy da função; A-2 segue até aplicar a 020 | [Seção no parecer geral](2026-10-31-parecer-geral.md#reauditoria-01112026-commit-6a709b3) · 2 médios novos (R-1 lote, R-2 mapas de contas) |
| 31/10/2026 (geral) | `048be17` (todo o repositório + banco; 020 ainda não aplicada) | Aprovado com ressalvas | 0 críticos · 3 altos (A-2 em produção até aplicar a 020; A-G1 leituras cortadas em 1.000 linhas; A-G2 rascunho no PDF assinado) | [Parecer geral](2026-10-31-parecer-geral.md) · confirmada a correção da ordem do lote (M-N4) |
| 31/10/2026 | `b5daf18` (+ migração 020, ainda não aplicada) | Aprovado com ressalvas | 0 críticos · 1 alto (A-2, aberto em produção até aplicar a 020) | [Parecer](2026-10-31-parecer.md) · depois do parecer: corrigida a ordem de gravação do lote (empresa e mês), a confirmar na próxima auditoria |

## Auditoria inicial de 31/10/2026 (base para a reorganização)

- [Arquitetura](2026-10-31-arquitetura.md) — camadas, onde ficam as regras, estrutura recomendada, riscos dos módulos futuros.
- [Front-end](2026-10-31-front-end.md) — manutenibilidade das telas, bugs encontrados, plano de refatoração em fases.
- [Banco e segurança](2026-10-31-banco-e-seguranca.md) — RLS, funções, Edge Functions; corrigidos na migração 020.
