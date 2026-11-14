-- Testes da 076: resumo diário das finanças da família (texto, hora, uma vez por dia, preferências, celular).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
select id as fam, gestao_cliente_id as cli from organizacoes where nome = 'Família Silva Souza' \gset
select id as cat_d from fin_categorias where org_id = :'fam' and tipo = 'despesa' limit 1 \gset
select id as cat_r from fin_categorias where org_id = :'fam' and tipo = 'receita' limit 1 \gset
insert into fin_titulos (org_id, cliente_id, tipo, categoria_id, descricao, vencimento, valor) values
  (:'fam', :'cli', 'pagar', :'cat_d', 'Luz', '2030-03-05', 100),
  (:'fam', :'cli', 'pagar', :'cat_d', 'Escola', '2030-03-10', 1250.5),
  (:'fam', :'cli', 'pagar', :'cat_d', 'Internet', '2030-03-13', 30),
  (:'fam', :'cli', 'pagar', :'cat_d', 'Seguro do ano', '2030-04-30', 900),
  (:'fam', :'cli', 'receber', :'cat_r', 'Salário', '2030-03-12', 5000);
\echo '=== R1 texto do dia 10/03 (esperado: t | conta para pagar | vence hoje 1.250,50; atrasada 100; próximos 7 30; receber 5.000; sem o seguro)'
select (r ->> 'tem') as tem, r ->> 'titulo' as titulo, r ->> 'texto' as texto
  from (select app.pessoal_resumo_texto(:'fam', '2030-03-10') r) x;
\echo '=== R2 família sem conta nenhuma não avisa (esperado: f)'
select app.pessoal_resumo_texto(id, '2030-03-10') ->> 'tem' as tem from organizacoes where tipo = 'pessoal' and nome <> 'Família Silva Souza' limit 1;
\echo '=== R3 antes da hora (6h30 em São Paulo) ninguém é avisado (esperado: 0)'
select app.pessoal_resumo_rodar('2030-03-10 06:30-03');
\echo '=== R4 depois das 7h avisa a dona (a Dois saiu da família) no sino (esperado: 1 e 1 aviso no sino, sem fila do celular)'
select app.pessoal_resumo_rodar('2030-03-10 07:10-03');
select count(*) as sino from hub_notificacoes where org_id = :'fam' and titulo like 'Finanças de hoje%';
select count(*) as fila from app.pessoal_push_fila;
\echo '=== R5 de novo no mesmo dia não repete (esperado: 0)'
select app.pessoal_resumo_rodar('2030-03-10 15:00-03');
\echo '--- R6 horário fora de 5 a 22 (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_resumo_salvar(:'fam', true, 4, true);
\echo '--- R7 quem não é da família ajusta o resumo dela (deve falhar)'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select pessoal_resumo_salvar(:'fam', true, 9, true);
\echo '=== R8 a dona desliga: no dia seguinte não avisa (esperado: 0)'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_resumo_salvar(:'fam', false, 9, true);
reset role;
select app.pessoal_resumo_rodar('2030-03-11 10:00-03');
\echo '=== R9 liga às 9h com celular e um aparelho: às 9h05 vai para o sino e para a fila (esperado: 1 | 1 | aparelhos 1)'
set role authenticated;
select pessoal_resumo_salvar(:'fam', true, 9, true);
select pessoal_push_inscrever('https://push.exemplo.com/abc', repeat('B', 87), repeat('a', 22), 'Celular da Ana');
select pessoal_push_aparelhos() as meus_aparelhos;
reset role;
select app.pessoal_resumo_rodar('2030-03-12 08:59-03') as antes_das_9;
select app.pessoal_resumo_rodar('2030-03-12 09:05-03') as avisos;
select count(*) as fila from app.pessoal_push_fila where enviado_em is null;
select jsonb_array_length(r -> 0 -> 'aparelhos') as aparelhos from (select pessoal_push_reservar() r) x;
\echo '--- R10 a tela pede a fila do celular (deve falhar)'
set role authenticated;
select pessoal_push_reservar();
\echo '--- R11 a tela pede as chaves do Web Push (deve falhar)'
select pessoal_vapid();
\echo '--- R12 visitante sem login liga aviso (deve falhar)'
reset role;
set role anon;
select pessoal_push_inscrever('https://push.exemplo.com/x', repeat('B', 87), repeat('a', 22));
\echo '=== R13 aparelho que não existe mais é esquecido; o aviso fica enviado (esperado: 0 aparelhos | enviado t)'
reset role;
select pessoal_push_resultado((select id from app.pessoal_push_fila order by id desc limit 1), true, array['https://push.exemplo.com/abc']);
select count(*) as aparelhos from pessoal_push_inscricoes;
select enviado_em is not null as enviado from app.pessoal_push_fila order by id desc limit 1;
\echo '=== R14 chaves do Web Push: grava na primeira vez e depois só devolve (esperado: PUB1 | PUB1)'
select pessoal_vapid('PUB1', 'PRI1') ->> 'publica' as primeira, pessoal_vapid('PUB2', 'PRI2') ->> 'publica' as segunda;
\echo '=== R15 agendamento de hora em hora (esperado: 3 * * * * | t)'
select schedule, command like '%pessoal-aviso%' as chama_funcao from cron.job where jobname = 'pessoal-resumo';
