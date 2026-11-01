# Pareceres de auditoria

Rotina descrita em [`../08-convencoes.md`](../08-convencoes.md#86-rotina-de-auditoria). O mais recente fica no topo.

| Data | Commit auditado | Veredito | Críticos/altos em aberto | Parecer |
| --- | --- | --- | --- | --- |
| 01/11/2026 (reauditoria) | `6a709b3` (correção de A-G1 e A-G2) | Pode publicar, **desde que a função `demonstrativo-pdf` seja publicada junto** | 0 críticos · altos: A-G1 resolvido nos pontos de risco (falta o lote, agora R-1 médio); A-G2 resolvido no código, aberto em produção até o deploy da função; A-2 segue até aplicar a 020 | [Seção no parecer geral](2026-10-31-parecer-geral.md#reauditoria-01112026-commit-6a709b3) · 2 médios novos (R-1 lote, R-2 mapas de contas) |
| 31/10/2026 (geral) | `048be17` (todo o repositório + banco; 020 ainda não aplicada) | Aprovado com ressalvas | 0 críticos · 3 altos (A-2 em produção até aplicar a 020; A-G1 leituras cortadas em 1.000 linhas; A-G2 rascunho no PDF assinado) | [Parecer geral](2026-10-31-parecer-geral.md) · confirmada a correção da ordem do lote (M-N4) |
| 31/10/2026 | `b5daf18` (+ migração 020, ainda não aplicada) | Aprovado com ressalvas | 0 críticos · 1 alto (A-2, aberto em produção até aplicar a 020) | [Parecer](2026-10-31-parecer.md) · depois do parecer: corrigida a ordem de gravação do lote (empresa e mês), a confirmar na próxima auditoria |

## Auditoria inicial de 31/10/2026 (base para a reorganização)

- [Arquitetura](2026-10-31-arquitetura.md) — camadas, onde ficam as regras, estrutura recomendada, riscos dos módulos futuros.
- [Front-end](2026-10-31-front-end.md) — manutenibilidade das telas, bugs encontrados, plano de refatoração em fases.
- [Banco e segurança](2026-10-31-banco-e-seguranca.md) — RLS, funções, Edge Functions; corrigidos na migração 020.
