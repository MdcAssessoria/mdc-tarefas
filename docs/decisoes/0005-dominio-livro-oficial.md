# 0005 · Domínio é o livro oficial; Contabilidade do HUB é gerencial

**Situação:** aceita (31/10/2026, decisão do Edvaldo).

**Decisão.** A escrituração oficial continua no Domínio. O HUB gera lançamentos a partir de conciliações, notas e
provisões, exporta para o Domínio (leiaute de importação em Excel e TXT) e mantém uma contabilidade gerencial que
alimenta o mesmo balancete/demonstrativos de hoje.

**Consequências.** Conferência HUB × Domínio conta a conta faz parte do fechamento mensal; exportação idempotente
(lote com id e hash; o mesmo lote gera o mesmo arquivo); lançamento exportado não muda (correção = estorno).
