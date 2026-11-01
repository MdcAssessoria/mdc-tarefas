# Parecer de auditoria — ordem do Balanço Patrimonial (01/11/2026)

- **Commit auditado:** `8a07d22` (main, ainda não enviado). Auditoria curta, só desta mudança.
- **Pedido:** no balanço, a data final vinha antes da inicial e o saldo final antes do inicial. O correto é
  "de 01/01/2025 a 31/12/2025, saldo inicial 10 e saldo final 15".
- **Arquivos:** `web/src/dominios/demonstrativos/componentes/Demonstracoes.tsx`, `.../ExportarPeriodo.tsx`,
  `supabase/functions/demonstrativo-pdf/pdf.ts`.

## Veredito

**Aprovado.** Pode fazer o push. A função `demonstrativo-pdf` precisa ser publicada para o PDF mudar (o site não
depende dela; a ordem entre as duas não importa, mas sem publicar a função o PDF continua na ordem antiga).
Nenhum crítico, nenhum alto, nenhum médio. Três baixos, todos anteriores a este commit.

## O que foi conferido e como

| Ponto | Resultado | Evidência |
| --- | --- | --- |
| Tela: título acompanha o valor | Ok | `Demonstracoes.tsx:89-114`: cabeçalho "Saldo inicial" → `l.anterior`, "Saldo final" → `l.atual`; total na mesma ordem; variação `atual - anterior` (positiva quando cresce). Na tela renderizada (Playwright, dados de exemplo): cabeçalho `Ativo · Saldo inicial 01/03/2026* · Saldo final 28/03/2026 · Variação`, linha `ATIVO 9.500,00 12.200,00 2.700,00`, total `9.500,00 12.200,00 2.700,00`. |
| Excel: título acompanha o valor | Ok | `ExportarPeriodo.tsx:42` monta `abertura: l.anterior`, `atual: l.atual`; linhas 99-100 ligam "Saldo inicial" à chave `abertura` e "Saldo final" à chave `atual`. |
| PDF: título acompanha o valor | Ok | PDF gerado localmente com `web/scripts/telas/balancete-exemplo.json` (Deno, `gerarPdf`). Página 2: "Período de 01/09/2026 a 30/09/2026", colunas "Saldo inicial 01/09/2026 / Saldo final 30/09/2026", ATIVO `9.500,00 / 12.200,00`, TOTAL DO ATIVO `9.500,00 / 12.200,00`, TOTAL DO PASSIVO E PL `9.500,00 / 12.200,00`. Cabeçalho cabe nas colunas de 120 pt. |
| Portal do cliente | Ok | Usa os mesmos `AbaDemonstracoes` e `ExportarPeriodo` (`web/src/app/portal/page.tsx:20-22`); conferido na tela `/portal`. |
| Outros lugares com saldos ou datas invertidos | Nenhum | `ArvoreBalancete.tsx:53-56` já é "Saldo anterior → Saldo atual"; balancete do PDF (`pdf.ts:460-470`) "Saldo anterior → Débitos → Créditos → Saldo atual"; intervalos em `pdf.ts:245`, `pdf.ts:460`, `parecer.ts:68`, `Demonstracoes.tsx:50` e `index.ts:197` estão todos início → fim. `PainelResumo` e `Graficos` não mostram o balanço em colunas de data. Busca por `fim … a … inicio` em `web/src` e `supabase/functions` sem resultado. |
| Celular (390 px) | Ok, com ressalva B-1 | Cabeçalho de duas linhas legível ("Saldo inicial" em cima, data menor embaixo); a página não rola de lado (390/390). |
| Verificações | Ok | Cópia limpa do commit: `npm ci` e `npm run build` ok; telas `/demonstrativos/[id]` e `/portal` ok no celular e no computador. O `npm run verificar` completo e as 26 telas foram rodados pelo autor em cópia limpa (não repetidos aqui). |
| Documentação | Ok | `docs/modulos/demonstrativos.md:32` continua correto ("último mês contra a abertura do primeiro"); nenhum capítulo descreve a ordem das colunas. |

## Achados (todos baixos e anteriores ao commit)

- **B-1 — Coluna "Variação" do passivo fica parcialmente escondida no celular.** Na tabela "Passivo e patrimônio
  líquido" a largura é 402 px dentro de um cartão de 356 px; a variação só aparece rolando a tabela para o lado,
  sem indicação visual. O título longo da primeira coluna é o que alarga. Sugestão: deixar esse título quebrar linha
  ou encurtar para "Passivo e PL" no celular.
- **B-2 — Excel e PDF do balanço não têm a coluna "Variação", e o Excel não tem as linhas de total.** A tela tem as
  duas coisas. Não é inversão, mas a regra 8.3 pede que a exportação traga o que está na tela.
- **B-3 — Data final de reserva no dia 28.** `selecaoPeriodo.ts:276` usa `AAAA-MM-28` quando o balancete não traz
  `demonstracoes.periodo.fim`. Hoje o balanço só aparece quando há demonstrações (que sempre trazem o período), então
  é risco latente; se acontecer, o título "Saldo final 28/12/2025" sairia com a data errada. A confirmar: contar no
  banco balancetes com `demonstracoes` preenchido e `demonstracoes->'periodo'->>'fim'` vazio.

Observação para o Edvaldo decidir (não é defeito): na DRE e na DFC a coluna do período escolhido vem antes da do
mesmo período do ano anterior (2025 e depois 2024), que é o padrão das demonstrações comparativas. Se quiser a
mesma lógica "antigo → novo" também ali, é outro pedido.

## Resumo sem jargão

A troca foi bem feita: na tela, no Excel e no PDF o balanço agora mostra "de 01/01 a 31/12", primeiro o saldo
inicial e depois o saldo final, e cada número está debaixo do título certo, inclusive nos totais e na variação.
Conferi também o Portal do Cliente e as outras telas e relatórios: não há outro lugar com data ou saldo invertido.
No celular o cabeçalho fica legível; só a coluna "Variação" do passivo precisa arrastar a tabela para o lado para
aparecer inteira. Pode publicar o site; para o PDF mudar, a função do PDF também precisa ser publicada.
