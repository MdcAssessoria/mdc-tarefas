-- Testes da 091: pacotes de licença (sistema, usuários incluídos, adicional e excedente no pacote).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';

\echo '=== P1 pacotes que já existiam ganharam o sistema dos módulos (esperado: 0 sem sistema)'
select count(*) as sem_sistema from lic_planos where sistema is null;

set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '--- P2 operar (sem gerir) cria pacote (deve falhar)'
select lic_salvar_plano(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'nome', 'EXato R&S', 'sistema', 'exato',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('exato-rs', 'exato-crm'))));
\echo '--- P3 gravar direto em lic_planos (deve falhar)'
update lic_planos set usuarios_incluidos = 999;

set teste.uid = '00000000-0000-0000-0000-0000000085e3';
\echo '--- P4 pacote do EXato com módulo do Ledgra (deve falhar)'
select lic_salvar_plano(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'nome', 'Misturado', 'sistema', 'exato',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('exato-rs', 'ledgra-financeiro'))));
\echo '--- P5 zero usuários incluídos (deve falhar)'
select lic_salvar_plano(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'nome', 'Zero', 'sistema', 'exato',
  'usuarios_incluidos', 0, 'produtos', (select jsonb_agg(id) from lic_produtos where slug = 'exato-rs')));
\echo '--- P6 excedente inválido (deve falhar)'
select lic_salvar_plano(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'nome', 'Exc', 'sistema', 'exato',
  'excedente', 'ignorar', 'produtos', (select jsonb_agg(id) from lic_produtos where slug = 'exato-rs')));

\echo '=== P7 gerir monta "EXato R&S" com 3 usuários, R$ 300 e R$ 40 por usuário a mais (esperado: t)'
select lic_salvar_plano(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'nome', 'EXato R&S', 'sistema', 'exato',
  'preco', 300, 'usuarios_incluidos', 3, 'valor_usuario_adicional', 40, 'excedente', 'bloquear',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('exato-rs', 'exato-crm')))) is not null as criou;
\echo '=== P8 sem limite de usuários (esperado: t, usuarios vazio)'
select lic_salvar_plano(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'nome', 'EXato Jurídico', 'sistema', 'exato',
  'preco', 100, 'produtos', (select jsonb_agg(id) from lic_produtos where slug = 'exato-juridico'))) is not null as criou;
select nome, sistema, usuarios_incluidos, excedente from lic_planos where nome like 'EXato%' order by nome;
\echo '=== P9 quem vê licença lê sistema e usuários do pacote, não o preço nem o adicional (esperado: linha; depois erro de permissão)'
set teste.uid = '00000000-0000-0000-0000-0000000085e1';
select nome, sistema, usuarios_incluidos, excedente from lic_planos where nome = 'EXato R&S';
\echo '--- P10 quem vê licença lê o adicional do pacote (deve falhar)'
select valor_usuario_adicional from lic_planos where nome = 'EXato R&S';
\echo '=== P11 gerir vê o adicional pelos valores (esperado: 40.00)'
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
select (lic_valores('00000000-0000-0000-0000-0000000000a1')->'planos_adicional'->>(select id::text from lic_planos where nome = 'EXato R&S')) as adicional;

\echo '=== P12 licença com o pacote (esperado: t) e depois o pacote não muda de sistema'
select lic_salvar_contrato(jsonb_build_object('cliente', '00000000-0000-0000-0000-0000000000c2', 'sistema', 'exato',
  'plano', (select id from lic_planos where nome = 'EXato R&S'), 'valor_mensal', 300, 'usuarios_incluidos', 3,
  'valor_usuario_adicional', 40, 'excedente', 'bloquear', 'dia_vencimento', 10, 'inicio', current_date, 'reajuste_indice', 'nenhum')) is not null as licenca;
\echo '--- P13 pacote usado muda de sistema (deve falhar)'
select lic_salvar_plano(jsonb_build_object('id', (select id from lic_planos where nome = 'EXato R&S'), 'nome', 'EXato R&S', 'sistema', 'ledgra',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug = 'ledgra-financeiro')));
\echo '=== P14 alterar o pacote não muda a licença já fechada (esperado: pacote 5 usuários; licença 3)'
select lic_salvar_plano(jsonb_build_object('id', (select id from lic_planos where nome = 'EXato R&S'), 'nome', 'EXato R&S',
  'preco', 350, 'usuarios_incluidos', 5, 'valor_usuario_adicional', 40, 'excedente', 'cobrar',
  'produtos', (select jsonb_agg(id) from lic_produtos where slug in ('exato-rs', 'exato-crm')))) is not null as alterou;
reset role;
select (select usuarios_incluidos from lic_planos where nome = 'EXato R&S') as pacote,
       (select usuarios_incluidos from lic_contratos where plano_id = (select id from lic_planos where nome = 'EXato R&S')) as licenca;
\echo '=== P15 a gravação direta do P3 não mudou nada (esperado: 0)'
select count(*) as mudou_direto from lic_planos where usuarios_incluidos = 999;
