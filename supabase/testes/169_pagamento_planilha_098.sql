-- Testes da 098: o produto do add-on de pagamento por planilha existe no catálogo do EXato.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== P1 produto semeado em toda organização (esperado: 0 organizações sem o produto)'
select count(*) as orgs_sem_produto from organizacoes o
 where not exists (select 1 from lic_produtos p where p.org_id = o.id and p.slug = 'exato-pagamento_planilha' and p.sistema = 'exato');
\echo '=== P2 código do módulo no EXato (esperado: pagamento_planilha)'
select distinct regexp_replace(slug, '^exato-', '') as modulo from lic_produtos where slug = 'exato-pagamento_planilha';
