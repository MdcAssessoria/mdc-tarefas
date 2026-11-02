-- Testes da 039: acesso por módulo escolhido pelo administrador no cadastro e Tarefas/anexos presos ao módulo.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
create trigger aplicar_convites after insert on auth.users for each row execute function app.aplicar_convites();
select set_config('teste.org', '00000000-0000-0000-0000-0000000000a1', false) is not null as ok;

\echo '=== A1 gestor não cadastra pessoas (deve falhar)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e5';
set teste.membro = 'gestor';
select hub_convidar('00000000-0000-0000-0000-0000000000a1', 'x@mdc.com', 'X', 'analista', null, null, '{"tarefas":"ver"}');

set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
\echo '=== A2 analista sem perfil e sem módulo (deve falhar)'
select hub_convidar('00000000-0000-0000-0000-0000000000a1', 'x@mdc.com', 'X', 'analista', null, null, '{}');
\echo '=== A3 módulo desligado (deve falhar)'
select hub_convidar('00000000-0000-0000-0000-0000000000a1', 'x@mdc.com', 'X', 'analista', null, null, '{"desligada":"ver"}');
\echo '=== A4 nível inválido (deve falhar)'
select hub_convidar('00000000-0000-0000-0000-0000000000a1', 'x@mdc.com', 'X', 'analista', null, null, '{"tarefas":"dono"}');

\echo '=== A5 convite só com Societário: ao criar a conta recebe só Societário (sem o Tarefas padrão)'
select hub_convidar('00000000-0000-0000-0000-0000000000a1', 'novo@mdc.com', 'Novo', 'analista', null, null,
  '{"societario":"operar","tarefas":""}') as resultado;
reset role;
select apps as modulos_do_convite from app.convites where email = 'novo@mdc.com';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f001', 'novo@mdc.com');
select string_agg(app || ':' || papel, ', ' order by app) as acessos_societario_operar from hub_acessos
 where user_id = '00000000-0000-0000-0000-00000000f001';

\echo '=== A6 trocar os módulos de uma vez (esperado: atendimento:gerir, tarefas:ver)'
set role authenticated;
select hub_definir_acessos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001',
  '{"tarefas":"ver","atendimento":"gerir"}') as qtd_2;
reset role;
select string_agg(app || ':' || papel, ', ' order by app) as acessos from hub_acessos where user_id = '00000000-0000-0000-0000-00000000f001';
\echo '--- A6 sem nenhum módulo (deve falhar)'
set role authenticated;
select hub_definir_acessos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', '{}');
\echo '--- A6 gestor mudando acessos (deve falhar)'
set teste.membro = 'gestor';
select hub_definir_acessos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', '{"tarefas":"ver"}');

\echo '=== A7 Tarefas exige o módulo: com Tarefas (ver) lê a própria tarefa; sem o módulo, não vê nada (esperado: 1, 0)'
reset role;
insert into tarefas (org_id, titulo, responsavel_id) values ('00000000-0000-0000-0000-0000000000a1', 'Minha tarefa', '00000000-0000-0000-0000-00000000f001');
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-00000000f001';
set teste.membro = 'analista';
select count(*) as ve_1 from tarefas where titulo = 'Minha tarefa';
\echo '--- A7 com Tarefas só ver não cria tarefa (deve falhar)'
insert into tarefas (org_id, titulo, criado_por) values ('00000000-0000-0000-0000-0000000000a1', 'Nova', '00000000-0000-0000-0000-00000000f001');
reset role;
delete from hub_acessos where user_id = '00000000-0000-0000-0000-00000000f001' and app = 'tarefas';
set role authenticated;
select count(*) as ve_0 from tarefas where titulo = 'Minha tarefa';

\echo '=== A8 anexos: com Atendimento e sem Societário/Tarefas não vê os anexos desses módulos (esperado: 0); administrador vê os 2'
select count(*) as anexos_0 from hub_arquivos;
set teste.membro = 'admin';
select count(*) as anexos_2 from hub_arquivos;
set teste.membro = 'tv';
select count(*) as tv_0 from hub_arquivos;
reset role;

\echo '=== A9 editar a pessoa com módulos escolhidos, numa transação (esperado: societario:gerir, perfil vazio)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select hub_editar_membro('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'Novo Nome', 'analista',
  null, null, true, '{"societario":"gerir"}') is not null as editou;
reset role;
select string_agg(app || ':' || papel, ', ') as acessos, (select perfil_id is null from membros where user_id = '00000000-0000-0000-0000-00000000f001') as sem_perfil
  from hub_acessos where user_id = '00000000-0000-0000-0000-00000000f001';
\echo '--- A9 analista sem perfil e sem módulos (deve falhar)'
set role authenticated;
select hub_editar_membro('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001', 'Novo Nome', 'analista',
  null, null, true, null);
reset role;
