-- Testes da 087: Ledgra Jurídico em Produtos e planos, sem duplicar, e fora do alcance de quem não é do banco.
-- Roda direto no banco do HUB. Blocos "(deve falhar)" terminam em ERROR com mensagem; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;

\echo '=== P1 toda organização tem o Ledgra Jurídico (esperado: 0 organizações faltando)'
select count(*) as faltando from public.organizacoes o
 where not exists (select 1 from public.lic_produtos p where p.org_id = o.id and p.slug = 'ledgra-juridico' and p.sistema = 'ledgra');
\echo '=== P2 semear de novo não duplica (esperado: 0)'
select app.lic_semear_ledgra(id) from public.organizacoes;
select count(*) as duplicados from (select org_id, slug from public.lic_produtos group by 1, 2 having count(*) > 1) x;
\echo '=== P3 a chave devolve o módulo sem o prefixo (esperado: juridico)'
select distinct replace(slug, 'ledgra-', '') as modulo from public.lic_produtos where slug = 'ledgra-juridico';

set role authenticated;
\echo '--- P4 usuário logado chama a semeadura (deve falhar)'
select app.lic_semear_ledgra('00000000-0000-0000-0000-0000000000a1');
reset role;
