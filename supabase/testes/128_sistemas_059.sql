-- Testes da 059: Estoque/Entradas/Saídas fora do menu, cadastro de sistemas e receita por sistema nos contratos.
-- e48 = Contratos operar + Financeiro operar; e49 = Contratos gerir VENCIDO; e40 = administrador; e51 = sem Contratos.
-- Blocos "(deve falhar)" terminam em ERROR; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2029-06-10';

\echo '=== S1 Estoque, Entradas e Saídas desligados; nada apagado (esperado: 3 desligados)'
select count(*) as desligados_3 from hub_apps where slug in ('estoque', 'entradas', 'saidas') and status = 'desligado';
-- (o menu lê hub_meus_apps, da 015, que já esconde status 'desligado'; a base simulada dos testes não tem essa função)
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e48';
\echo '--- S3 quem só opera Contratos cadastra sistema (deve falhar)'
select fin_sistema_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"EXato"}'::jsonb);
set teste.uid = '00000000-0000-0000-0000-000000000e49';
\echo '--- S4 gestora com acesso vencido cadastra sistema (deve falhar)'
select fin_sistema_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"EXato"}'::jsonb);
set teste.uid = '00000000-0000-0000-0000-000000000e48';
\echo '--- S5 gravar direto na tabela, sem a função (deve falhar)'
insert into fin_sistemas (org_id, cliente_id, nome) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'Pirata');

set teste.membro = 'admin';
set teste.uid = '00000000-0000-0000-0000-000000000e40';
\echo '=== S6 administrador cadastra EXato e Ledgra (esperado: t, t)'
select (fin_sistema_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"EXato","descricao":"Diaristas"}'::jsonb)->>'id') as exato \gset
select (fin_sistema_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"Ledgra"}'::jsonb)->>'id') as ledgra \gset
select :'exato' <> '' as exato_ok, :'ledgra' <> '' as ledgra_ok;
\echo '--- S7 mesmo nome com espaços e outra caixa (deve falhar: "Já existe")'
select fin_sistema_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"  exato "}'::jsonb);
\echo '--- S8 nome vazio (deve falhar)'
select fin_sistema_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"  "}'::jsonb);

set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e48';
\echo '=== S9 contrato a receber do EXato, R$ 500, primeira conta em 06/2029 (esperado: t, 1 conta)'
select (r->>'id') as k_exato, (r->>'geradas') as geradas from (select fin_recorrente_salvar(jsonb_build_object(
  'cliente', '00000000-0000-0000-0000-000000000c41', 'tipo', 'receber', 'pessoa_nome', 'Cliente do EXato Ltda',
  'descricao', 'Licença EXato', 'valor', '500', 'dia', 10, 'categoria', '00000000-0000-0000-0000-00000000d402',
  'vigencia_inicio', '2029-06-01', 'sistema', :'exato')) r) x \gset
select :'k_exato' <> '' as contrato, :'geradas' as geradas_1;
\echo '--- S10 contrato com sistema de outra empresa (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Cliente do EXato Ltda",
  "descricao":"Licença alheia","valor":"100","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-06-01",
  "gera_contas":false,"sistema":"00000000-0000-0000-0000-0000000059f1"}'::jsonb);
\echo '=== S11 contrato a pagar ignora o sistema (esperado: sem sistema)'
select (fin_recorrente_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-000000000c41', 'tipo', 'pagar',
  'pessoa_nome', 'Servidor Nuvem Ltda', 'descricao', 'Servidor', 'valor', '80', 'dia', 10, 'categoria', '00000000-0000-0000-0000-00000000d401',
  'vigencia_inicio', '2029-06-01', 'gera_contas', false, 'sistema', :'exato'))->>'id') as k_pagar \gset
select sistema_id is null as sem_sistema from fin_recorrentes where id = :'k_pagar';
\echo '=== S12 editar sem mandar o sistema mantém o EXato (esperado: t)'
select fin_recorrente_salvar(jsonb_build_object('id', :'k_exato', 'pessoa_nome', 'Cliente do EXato Ltda', 'descricao', 'Licença EXato',
  'valor', '500', 'dia', 10, 'categoria', '00000000-0000-0000-0000-00000000d402', 'vigencia_inicio', '2029-06-01')) is not null as editado;
select sistema_id = :'exato' as manteve_exato from fin_recorrentes where id = :'k_exato';

set teste.membro = 'admin';
set teste.uid = '00000000-0000-0000-0000-000000000e40';
\echo '=== S13 inativar o Ledgra (esperado: f)'
select fin_sistema_salvar(jsonb_build_object('id', :'ledgra', 'nome', 'Ledgra', 'ativo', false)) is not null as salvo;
reset role;
select ativo as ledgra_ativo from fin_sistemas where id = :'ledgra';
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e48';
\echo '--- S14 contrato novo com sistema inativo (deve falhar)'
select fin_recorrente_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-000000000c41', 'tipo', 'receber',
  'pessoa_nome', 'Cliente do EXato Ltda', 'descricao', 'Licença Ledgra', 'valor', '300', 'dia', 10,
  'categoria', '00000000-0000-0000-0000-00000000d402', 'vigencia_inicio', '2029-06-01', 'gera_contas', false, 'sistema', :'ledgra'));

\echo '=== S15 painel: EXato com 1 contrato, 1 cliente, 500 mensal, 500 faturado em 06/2029, 1 novo, 6.000 previstos nos 12 meses seguintes; Ledgra inativo sem contrato não aparece'
select l->>'nome' as nome, l->>'contratos' as contratos, l->>'clientes' as clientes, l->>'mensal' as mensal, l->>'faturado' as faturado,
       l->>'recebido' as recebido, l->>'novos' as novos, l->>'previsto' as previsto_6000, jsonb_array_length(l->'por_mes') as meses_12
  from jsonb_array_elements(fin_receita_sistemas('00000000-0000-0000-0000-000000000c41', '2029-06-01')->'linhas') l
 where l->>'nome' in ('EXato', 'Ledgra');
\echo '=== S16 o painel não mostra sistema de outra empresa (esperado: 0)'
select count(*) as alheio_0 from jsonb_array_elements(fin_receita_sistemas('00000000-0000-0000-0000-000000000c41', '2029-06-01')->'linhas') l
 where l->>'nome' = 'Sistema de outra empresa';

set teste.uid = '00000000-0000-0000-0000-000000000e51';
\echo '--- S17 quem não tem Contratos abre o painel (deve falhar)'
select fin_receita_sistemas('00000000-0000-0000-0000-000000000c41', '2029-06-01');
\echo '=== S18 quem não tem Contratos não vê os sistemas (esperado: 0)'
select count(*) as sistemas_0 from fin_sistemas;
reset role;
set role anon;
\echo '--- S19 sem login abre o painel (deve falhar)'
select fin_receita_sistemas('00000000-0000-0000-0000-000000000c41', '2029-06-01');
reset role;
\echo '--- S20 apagar um sistema (deve falhar: "inative o sistema")'
delete from fin_sistemas where id = :'ledgra';

\echo '=== S21 contrato com fim em 09/2029: prevê só jul, ago e set (esperado: 900)'
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e48';
select (fin_recorrente_salvar(jsonb_build_object('cliente', '00000000-0000-0000-0000-000000000c41', 'tipo', 'receber',
  'pessoa_nome', 'Cliente Curto Ltda', 'descricao', 'Licença curta', 'valor', '300', 'dia', 10,
  'categoria', '00000000-0000-0000-0000-00000000d402', 'vigencia_inicio', '2029-07-01', 'vigencia_fim', '2029-09-30',
  'gerar_desde', '2029-07-01', 'sistema', :'exato'))->>'id') is not null as contrato;
select (l->>'previsto')::numeric - 6000 as previsto_curto_900
  from jsonb_array_elements(fin_receita_sistemas('00000000-0000-0000-0000-000000000c41', '2029-06-01')->'linhas') l where l->>'nome' = 'EXato';
reset role;
\echo '--- S22 sistema gravado para empresa que não é a da gestão, mesmo pelo banco (deve falhar)'
insert into fin_sistemas (org_id, cliente_id, nome) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Fora da gestão');
