# Pareceres de auditoria

Rotina descrita em [`../08-convencoes.md`](../08-convencoes.md#86-rotina-de-auditoria). O mais recente fica no topo.

| Data | Commit auditado | Veredito | Críticos/altos em aberto | Parecer |
| --- | --- | --- | --- | --- |
| 31/10/2026 | `b5daf18` (+ migração 020, ainda não aplicada) | Aprovado com ressalvas | 0 críticos · 1 alto (A-2, aberto em produção até aplicar a 020) | [Parecer](2026-10-31-parecer.md) · depois do parecer: corrigida a ordem de gravação do lote (empresa e mês), a confirmar na próxima auditoria |

## Auditoria inicial de 31/10/2026 (base para a reorganização)

- [Arquitetura](2026-10-31-arquitetura.md) — camadas, onde ficam as regras, estrutura recomendada, riscos dos módulos futuros.
- [Front-end](2026-10-31-front-end.md) — manutenibilidade das telas, bugs encontrados, plano de refatoração em fases.
- [Banco e segurança](2026-10-31-banco-e-seguranca.md) — RLS, funções, Edge Functions; corrigidos na migração 020.
