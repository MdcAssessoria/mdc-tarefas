-- Testes da 038: contrato do CRM salvo, numerado e marcado pelo banco, e histórico numa transação.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
insert into crm_modelos (id, org_id, nome, texto) values
  ('00000000-0000-0000-0000-00000000bd01', '00000000-0000-0000-0000-0000000000a1', 'Modelo', 'Contrato nº {{numero}}'),
  ('00000000-0000-0000-0000-00000000bd02', '00000000-0000-0000-0000-0000000000a2', 'Modelo de outra org', 'x');
insert into crm_oportunidades (id, org_id, empresa) values
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000a1', 'Empresa A'),
  ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-0000000000a1', 'Empresa B'),
  ('00000000-0000-0000-0000-00000000bb03', '00000000-0000-0000-0000-0000000000a1', 'Empresa C'),
  ('00000000-0000-0000-0000-00000000bb04', '00000000-0000-0000-0000-0000000000a1', 'Empresa D');
select to_char(current_date, 'YYYY') as ano \gset

\echo '=== C1 sem acesso ao Comercial (só Relatórios) não salva contrato (deve falhar)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select crm_salvar_contrato('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 900}', 'Contrato nº {{numero}}');

set teste.uid = '00000000-0000-0000-0000-0000000000e5';
set teste.membro = 'gestor';
\echo '=== C2 modelo de outra organização (deve falhar)'
select crm_salvar_contrato('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bd02', '{"honorario_mensal": 900}', 'x {{numero}}');
\echo '=== C3 texto vazio (deve falhar)'
select crm_salvar_contrato('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 900}', '  ');

\echo '=== C4 numera em sequência, põe o número no texto, valor no funil e histórico (esperado: 001, 002)'
select (crm_salvar_contrato('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 1234.5}', 'Contrato nº {{numero}}') ->> 'texto') as texto_a;
select (crm_salvar_contrato('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 800}', 'Contrato nº {{numero}}') ->> 'numero') as numero_b;
select valor_mensal as valor_funil_1234_5 from crm_oportunidades where id = '00000000-0000-0000-0000-00000000bb01';
select texto as historico from crm_atividades where oportunidade_id = '00000000-0000-0000-0000-00000000bb01' and tipo = 'contrato';

\echo '=== C5 rascunho salvo de novo: atualiza o mesmo contrato e mantém o número (esperado: 1 contrato, 001, 1500)'
select (crm_salvar_contrato('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 1500}', 'Nº {{numero}} revisado') ->> 'texto') as texto_revisado;
select count(*) as contratos_a, max(numero) as numero_a from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb01';

\echo '=== C6 marcar enviado leva a oportunidade para Proposta, com histórico'
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb01'), 'enviado') is not null as marcou;
select etapa as etapa_proposta, (select count(*) from crm_atividades where oportunidade_id = o.id and texto like '%: enviado') as hist_enviado
  from crm_oportunidades o where id = '00000000-0000-0000-0000-00000000bb01';
\echo '--- C6 marcar enviado de novo (deve falhar)'
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb01'), 'enviado');
\echo '--- C6 situação desconhecida (deve falhar)'
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb01'), 'rasgado');
\echo '--- C6 cadastrar cliente sem ser assinatura (deve falhar)'
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb02'), 'enviado', true);

\echo '=== C7 contrato já enviado: salvar cria um novo número (esperado: 003, 2 contratos)'
select (crm_salvar_contrato('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 1600}', '{{numero}}') ->> 'numero') as numero_novo;
select count(*) as contratos_a from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb01';

\echo '=== C8 assinar e cadastrar o cliente, tudo junto (esperado: assinado, ganho)'
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb02'), 'assinado', true) is not null as marcou;
select c.status, o.etapa from crm_contratos c join crm_oportunidades o on o.id = c.oportunidade_id where o.id = '00000000-0000-0000-0000-00000000bb02';
\echo '--- C8 cancelar e depois mexer no cancelado (deve falhar)'
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb02'), 'cancelado') is not null as cancelou;
select crm_marcar_contrato((select id from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-00000000bb02'), 'assinado');

\echo '=== C9 número repetido gravado direto (deve falhar)'
insert into crm_contratos (org_id, oportunidade_id, numero, texto) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb03', :'ano' || '/001', 'x');

\echo '=== C10 histórico: primeiro contato tira do Novo lead; próximo passo grava a data (esperado: contato, data)'
select crm_registrar_atividade('00000000-0000-0000-0000-00000000bb03', 'ligacao', 'Liguei, pediu proposta') is not null as registrou;
select crm_registrar_atividade('00000000-0000-0000-0000-00000000bb03', 'tarefa', 'Mandar proposta', current_date + 3) is not null as registrou_tarefa;
select etapa as etapa_contato, proximo_contato = current_date + 3 as data_ok from crm_oportunidades where id = '00000000-0000-0000-0000-00000000bb03';
select count(*) filter (where not concluida) as tarefas_abertas_1, count(*) as registros_2 from crm_atividades where oportunidade_id = '00000000-0000-0000-0000-00000000bb03';
\echo '--- C10 próximo passo sem data (deve falhar)'
select crm_registrar_atividade('00000000-0000-0000-0000-00000000bb03', 'tarefa', 'Ligar', null);
\echo '--- C10 tipo reservado ao sistema (deve falhar)'
select crm_registrar_atividade('00000000-0000-0000-0000-00000000bb03', 'contrato', 'forjado');
\echo '--- C10 sem acesso ao Comercial (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select crm_registrar_atividade('00000000-0000-0000-0000-00000000bb03', 'nota', 'x');

\echo '=== C11 corrida: dois contratos novos ao mesmo tempo recebem números diferentes (esperado: 2 números distintos)'
reset role;
select dblink_connect('ca', :'conexao') as a, dblink_connect('cb', :'conexao') as b;
select dblink_exec('ca', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-0000000000e5''; set teste.membro = ''gestor''') as a,
       dblink_exec('cb', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-0000000000e5''; set teste.membro = ''gestor''') as b;
select dblink_exec('ca', 'begin') as a, dblink_exec('cb', 'begin') as b;
select x as numero_a from dblink('ca', $q$select crm_salvar_contrato('00000000-0000-0000-0000-00000000bb03', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 1}', '{{numero}}') ->> 'numero'$q$) t(x text);
select dblink_send_query('cb', $q$select crm_salvar_contrato('00000000-0000-0000-0000-00000000bb04', '00000000-0000-0000-0000-00000000bd01', '{"honorario_mensal": 2}', '{{numero}}') ->> 'numero'$q$) as enviado;
select dblink_exec('ca', 'commit') as a_commit;
select x as numero_b from dblink_get_result('cb') as t(x text);
select count(*) as fim from dblink_get_result('cb') as t(x text);
select dblink_exec('cb', 'commit') as b_commit;
select dblink_disconnect('ca'), dblink_disconnect('cb');
select count(distinct numero) as numeros_distintos_2 from crm_contratos where oportunidade_id in ('00000000-0000-0000-0000-00000000bb03', '00000000-0000-0000-0000-00000000bb04');
