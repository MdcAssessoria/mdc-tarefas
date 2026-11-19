-- Testes da 102: Hub-Team à venda (módulos hub-team-* semeados, sistema vendendo, licença e chave HTM).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';

\echo '=== H1 módulos do Hub-Team semeados (esperado: 8, sem diárias/operação/transporte/auditoria) e sistema vendendo'
select count(*) as modulos_hub_team,
       count(*) filter (where slug in ('hub-team-diaristas', 'hub-team-operacao', 'hub-team-transporte', 'hub-team-auditoria')) as fora
  from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' and sistema = 'hub-team';
select situacao from lic_sistemas where org_id = '00000000-0000-0000-0000-0000000000a1' and slug = 'hub-team';
\echo '=== H2 rodar a semeadura de novo não duplica (esperado: 8)'
select app.lic_semear_hub_team('00000000-0000-0000-0000-0000000000a1');
select count(*) from lic_produtos where org_id = '00000000-0000-0000-0000-0000000000a1' and sistema = 'hub-team';

set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000085e1';
\echo '--- H3 quem só vê gera chave do Hub-Team (deve falhar)'
select lic_chave_gerar('00000000-0000-0000-0000-0000000000c3', 'hub-team');
\echo '--- H4 chamar a semeadura pelo navegador (deve falhar)'
select app.lic_semear_hub_team('00000000-0000-0000-0000-0000000000a1');

set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '--- H5 licença do Hub-Team com módulo do EXato (deve falhar)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'sistema', 'hub-team',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('hub-team-crm', 'exato-rs')),
  'valor_mensal', 0, 'dia_vencimento', 10, 'inicio', current_date, 'reajuste_indice', 'nenhum'));
\echo '=== H6 operar cadastra a licença do Hub-Team com módulos avulsos (agora à venda; esperado: t)'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c3', 'sistema', 'hub-team',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('hub-team-crm', 'hub-team-contratos', 'hub-team-rs')),
  'usuarios_incluidos', 10, 'excedente', 'cobrar',
  'valor_mensal', 0, 'dia_vencimento', 10, 'inicio', current_date, 'reajuste_indice', 'nenhum')) is not null as cadastrou;

set teste.uid = '00000000-0000-0000-0000-0000000085e3';
\echo '=== H7 gerir gera a chave do Hub-Team (esperado: HTM-)'
select left(lic_chave_gerar('00000000-0000-0000-0000-0000000000c3', 'hub-team'), 4) as prefixo;
reset role;
