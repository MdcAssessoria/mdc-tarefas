-- Testes da 081: plano de contas simples da família (só Entradas e Gastos, um nível) e troca do plano antigo.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
\echo '=== K1 famílias sem lançamento trocaram para o plano simples (esperado: t | t | Entradas,Gastos)'
select count(*) > 0 as trocou_alguma,
       bool_and((select count(*) from fin_plano_contas p where p.cliente_id = o.gestao_cliente_id) = 18) as todas_simples,
       (select string_agg(distinct c.grupo, ',' order by c.grupo) from fin_categorias c
          join organizacoes x on x.gestao_cliente_id = c.cliente_id where x.tipo = 'pessoal'
           and not exists (select 1 from fin_titulos t where t.cliente_id = x.gestao_cliente_id)) as grupos
  from organizacoes o where o.tipo = 'pessoal' and o.nome <> 'Casa Simples'
   and not exists (select 1 from fin_titulos t where t.cliente_id = o.gestao_cliente_id);
\echo '=== K2 família com lançamento ficou com o plano antigo (esperado: t)'
select bool_and((select count(*) from fin_plano_contas p where p.cliente_id = o.gestao_cliente_id) = 37) as manteve
  from organizacoes o where o.tipo = 'pessoal'
   and exists (select 1 from fin_titulos t where t.cliente_id = o.gestao_cliente_id);
\echo '=== K3 nomes do dia a dia, sem nível intermediário (esperado: Mercado | despesa | Gastos | 2)'
select c.nome, c.tipo, c.grupo, p.nivel from fin_categorias c join fin_plano_contas p on p.id = c.conta_contabil_id
  join organizacoes o on o.gestao_cliente_id = c.cliente_id where o.tipo = 'pessoal' and c.nome = 'Mercado' limit 1;
\echo '=== K4 família nova já nasce com o plano simples (esperado: 18 | 16 | Salário)'
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select pessoal_criar_familia('Casa Simples') is not null as ok;
reset role;
select (select count(*) from fin_plano_contas p where p.cliente_id = o.gestao_cliente_id) as contas,
       (select count(*) from fin_categorias c where c.cliente_id = o.gestao_cliente_id) as categorias,
       (select min(c.nome) filter (where c.tipo = 'receita' and c.nome like 'Sal%') from fin_categorias c where c.cliente_id = o.gestao_cliente_id) as entrada
  from organizacoes o where o.nome = 'Casa Simples';
\echo '--- K5 usuário chama a semeadura direto (deve falhar)'
set role authenticated;
select app.pessoal_semear_plano((select id from organizacoes where nome = 'Casa Simples'), (select gestao_cliente_id from organizacoes where nome = 'Casa Simples'));
reset role;
