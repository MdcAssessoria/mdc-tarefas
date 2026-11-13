-- Testes da 072: Ledgra Legislação e Ledgra XML em Produtos e planos, sem duplicar, e fora do alcance de quem não é do banco.
-- Roda direto no banco do HUB (a 067 ainda não está na base simulada do rodar.sh).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;

\echo '=== L1 toda organização tem os 8 módulos do Ledgra (esperado: 0 organizações faltando)'
select count(*) as faltando from public.organizacoes o
 where (select count(*) from public.lic_produtos p where p.org_id = o.id and p.sistema = 'ledgra') <> 8;
\echo '=== L2 semear de novo não duplica (esperado: 0)'
select app.lic_semear_ledgra(id) from public.organizacoes;
select count(*) as duplicados from (select org_id, slug from public.lic_produtos group by 1, 2 having count(*) > 1) x;
\echo '=== L3 a chave devolve o módulo sem o prefixo (esperado: legislacao, xml)'
select replace(slug, 'ledgra-', '') as modulo from public.lic_produtos where slug in ('ledgra-legislacao', 'ledgra-xml') group by 1 order by 1;

set role authenticated;
\echo '--- L4 usuário logado chama a semeadura (deve falhar)'
select app.lic_semear_ledgra('00000000-0000-0000-0000-0000000000a1');
reset role;
