# 0003 · Cálculo que vira documento roda no servidor

**Situação:** proposta (auditoria de 31/10/2026). Obrigatória antes de Financeiro, Fiscal e Contabilidade.

**Contexto.** Hoje o balancete é calculado no navegador e gravado como JSON (`portal_balancetes.resumo/indices/...`),
em várias chamadas sem transação. O PDF assinado com o certificado usa esse JSON. Quem tem permissão "operar" pode,
em tese, gravar números que não vêm das linhas.

**Proposta.**
- O cálculo fica numa cópia única de TypeScript puro (sem React/Supabase), usada pela tela (prévia) e por uma Função
  Edge ou RPC que **recalcula e grava** numa transação, registrando a versão do cálculo.
- Fim do script `scripts/nucleo_balancete.py` que copia trechos por expressão regular.
- Valores de lançamentos, guias e notas em `numeric`/centavos inteiros, nunca `number` de ponto flutuante.

**Consequências.** Documento reproduzível e não forjável pela tela. Mais trabalho na migração do Demonstrativos.
