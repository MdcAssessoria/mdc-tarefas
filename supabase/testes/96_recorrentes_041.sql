-- Testes da 041: contratos fixos (recorrentes), rotina do dia 1 e reajuste anual pelo índice.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
-- O "hoje" anda pela configuração teste.hoje (base 95): 02/11/2026 → 01/12/2026 → 02/01/2027 → 01/03/2027 → 01/04/2027.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2026-11-02';

\echo '=== C1 contrato a pagar (aluguel, IPCA em março, dia 10): já lança a conta de 11/2026'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
set teste.membro = 'analista';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Aluguel da sala","valor":"2500","dia":10,"categoria":"00000000-0000-0000-0000-00000000d401",
  "conta_prevista":"00000000-0000-0000-0000-00000000b401","inicio":"2025-03-01","indice":"IPCA","mes_reajuste":3}'::jsonb)->>'id') as aluguel \gset
reset role;
select descricao, vencimento, valor, competencia, situacao from fin_titulos where recorrente_id = :'aluguel';

\echo '=== C2 contrato a receber dia 31, cliente digitado na hora (cadastra junto), % fixo de 5% em novembro'
set role authenticated;
\echo '--- C2 valor com vírgula de milhar não é número (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X",
  "descricao":"X","valor":"1.200,00","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","inicio":"2026-11-01"}'::jsonb);
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Cliente Beta ME",
  "descricao":"Honorários mensais","valor":"1200","dia":31,"categoria":"00000000-0000-0000-0000-00000000d402",
  "inicio":"2026-11-01","indice":"fixo","percentual_fixo":5,"mes_reajuste":11}'::jsonb)->>'id') as honorarios \gset
reset role;
select t.vencimento as vence_30_11, t.valor, p.nome as cliente_cadastrado from fin_titulos t join fin_pessoas p on p.id = t.pessoa_id
 where t.recorrente_id = :'honorarios';

\echo '=== C3 dia 31: fevereiro vira 28 (29 no bissexto) e abril 30 (esperado: 2027-02-28, 2028-02-29, 2027-04-30)'
select app.fin_vencimento_no_mes('2027-02-01', 31) as fev_2027, app.fin_vencimento_no_mes('2028-02-01', 31) as fev_2028,
       app.fin_vencimento_no_mes('2027-04-01', 31) as abr_2027;

\echo '=== C4 gerar o mesmo mês duas vezes não duplica (esperado: 0, 0 e 1 conta de 11/2026 por contrato)'
select app.fin_recorrentes_gerar('00000000-0000-0000-0000-0000000000a1', '2026-11-15') as primeira,
       app.fin_recorrentes_gerar('00000000-0000-0000-0000-0000000000a1', '2026-11-01') as segunda;
select recorrente_id = :'aluguel' as aluguel, count(*) as contas from fin_titulos where recorrente_id in (:'aluguel', :'honorarios')
 and competencia = '2026-11-01' group by 1 order by 1;

\echo '=== C5 rotina do dia 1 (01/12/2026) roda duas vezes: uma conta de dezembro por contrato (esperado: geradas 2 e depois 0)'
set teste.hoje = '2026-12-01';
select app.fin_recorrentes_rotina()->'geradas' as geradas_1, app.fin_recorrentes_rotina()->'geradas' as geradas_2;
select count(*) as contas_dez_2 from fin_titulos where recorrente_id in (:'aluguel', :'honorarios') and competencia = '2026-12-01';
\echo '--- C5 o índice único também segura: segunda conta do mesmo mês (deve falhar)'
set app.fin_interno = '1';
update fin_titulos set recorrente_id = :'aluguel', competencia = '2026-12-01'
 where id = (select id from fin_titulos where recorrente_id = :'honorarios' and competencia = '2026-11-01');
reset app.fin_interno;

\echo '=== C6 contrato com fim em 12/2026, suspenso e pessoa sem permissão'
set role authenticated;
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Sistema de folha","valor":"300","dia":5,"categoria":"00000000-0000-0000-0000-00000000d401",
  "inicio":"2026-12-01","fim":"2026-12-01"}'::jsonb)->>'id') as sistema \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Limpeza","valor":"450","dia":15,"categoria":"00000000-0000-0000-0000-00000000d401","inicio":"2026-12-01"}'::jsonb)->>'id') as limpeza \gset
\echo '--- C6 suspender sem motivo (deve falhar)'
select fin_recorrente_suspender(:'limpeza', '  ');
select fin_recorrente_suspender(:'limpeza', 'Prestador de férias')::text = '' as suspendeu;
\echo '--- C6 quem só vê Contratos cria contrato (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Invasão","valor":"10","dia":1,"categoria":"00000000-0000-0000-0000-00000000d401","inicio":"2026-12-01"}'::jsonb);
\echo '--- C6 quem só vê Contratos suspende (deve falhar)'
select fin_recorrente_suspender(:'aluguel', 'teste');
\echo '--- C6 com Financeiro mas sem o módulo Contratos cria contrato (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Invasão","valor":"10","dia":1,"categoria":"00000000-0000-0000-0000-00000000d401","inicio":"2026-12-01"}'::jsonb);
\echo '--- C6 sem o módulo Contratos não lê os contratos (esperado: 0)'
select count(*) as ve_0 from fin_recorrentes;
\echo '--- C6 gravação direta na tabela (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
update fin_recorrentes set valor = 1 where id = :'aluguel';
\echo '--- C6 categoria de receita em contrato a pagar (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Errado","valor":"10","dia":1,"categoria":"00000000-0000-0000-0000-00000000d402","inicio":"2026-12-01"}'::jsonb);
\echo '--- C6 primeira conta em mês passado (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Retroativo","valor":"10","dia":1,"categoria":"00000000-0000-0000-0000-00000000d401","inicio":"2026-01-01","gerar_desde":"2026-10-01"}'::jsonb);
reset role;

\echo '=== C7 02/01/2027 (a rotina não rodou no dia 1): recupera janeiro sem duplicar; o de fim 12/2026 e o suspenso não geram'
set teste.hoje = '2027-01-02';
select app.fin_recorrentes_rotina() - 'indices' as rotina;
select app.fin_recorrentes_rotina()->'geradas' as de_novo_0;
select r.descricao, r.situacao, r.situacao_motivo, count(t.id) filter (where t.competencia = '2027-01-01') as contas_jan
  from fin_recorrentes r left join fin_titulos t on t.recorrente_id = r.id
 where r.id in (:'aluguel', :'honorarios', :'sistema', :'limpeza') group by r.id order by r.descricao;

\echo '=== C8 reativar o suspenso: volta a lançar a partir deste mês (dezembro, quando estava suspenso, não sai)'
set role authenticated;
\echo '--- C8 reativar sem motivo (deve falhar)'
select fin_recorrente_reativar(:'limpeza', '');
select fin_recorrente_reativar(:'limpeza', 'Prestador voltou') as reativou;
reset role;
select string_agg(to_char(competencia, 'MM/YYYY'), ', ' order by competencia) as meses_limpeza from fin_titulos where recorrente_id = :'limpeza';

\echo '=== C9 conta gerada é conta normal: quem opera o Financeiro edita o valor de janeiro, mas não o vínculo com o contrato'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e44';
update fin_titulos set valor = 2600 where recorrente_id = :'aluguel' and competencia = '2027-01-01';
select valor as jan_editado_2600 from fin_titulos where recorrente_id = :'aluguel' and competencia = '2027-01-01';
\echo '--- C9 trocar o mês da conta (deve falhar)'
update fin_titulos set competencia = '2027-05-01' where recorrente_id = :'aluguel' and competencia = '2027-01-01';
\echo '--- C9 conta nova pela tela fingindo ser do contrato (deve falhar)'
insert into fin_titulos (org_id, cliente_id, tipo, categoria_id, descricao, vencimento, valor, recorrente_id, competencia)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'pagar', '00000000-0000-0000-0000-00000000d401',
        'Falsa', '2027-06-10', 10, :'aluguel', '2027-06-01');
set teste.uid = '00000000-0000-0000-0000-000000000e41';
reset role;

\echo '=== C10 índices no formato do Banco Central (IPCA 03/2026–02/2027; 02/2027 revisado depois) e INPC faltando um mês'
select app.fin_indices_gravar('IPCA', '[{"data":"01/03/2026","valor":"0.56"},{"data":"01/04/2026","valor":"0.43"},
  {"data":"01/05/2026","valor":"0.26"},{"data":"01/06/2026","valor":"0.24"},{"data":"01/07/2026","valor":"0.38"},
  {"data":"01/08/2026","valor":"-0.02"},{"data":"01/09/2026","valor":"0.44"},{"data":"01/10/2026","valor":"0.56"},
  {"data":"01/11/2026","valor":"0.39"},{"data":"01/12/2026","valor":"0.52"},{"data":"01/01/2027","valor":"0.16"},
  {"data":"01/02/2027","valor":"1.00"}]'::jsonb) as gravou_12;
select app.fin_indices_gravar('IPCA', '[{"data":"01/02/2027","valor":"1.31"},{"data":"01/01/2027","valor":"0.16"}]'::jsonb) as revisou_1;
select app.fin_indices_gravar('INPC', '[{"data":"01/03/2026","valor":"0.50"},{"data":"01/04/2026","valor":"0.40"}]'::jsonb) as inpc_2;
\echo '--- C10 resposta fora do formato (deve falhar)'
select app.fin_indices_gravar('IPCA', '{"erro":"limite"}'::jsonb);
\echo '--- C10 acumulado do IPCA para reajuste em 03/2027 (esperado: igual à conta feita à parte, 12 meses)'
select (app.fin_indice_acumulado('IPCA', '2027-03-01')->>'percentual')::numeric as acumulado,
       round((exp(sum(ln(1 + percentual / 100))) - 1) * 100, 4) as conferencia,
       app.fin_indice_acumulado('IPCA', '2027-03-01')->>'meses' as meses
  from fin_indices where indice = 'IPCA' and mes between '2026-03-01' and '2027-02-01';
select app.fin_indice_acumulado('INPC', '2027-03-01')->'percentual' as inpc_sem_valor,
       jsonb_array_length(app.fin_indice_acumulado('INPC', '2027-03-01')->'faltam') as faltam_10;

\echo '=== C11 01/03/2027: a rotina lança março (valor antigo) e avisa o reajuste uma vez (gestora e administrador)'
set teste.hoje = '2027-03-01';
select app.fin_recorrentes_rotina() - 'indices' as rotina;
select app.fin_recorrentes_rotina()->'avisos' as avisos_de_novo_0;
select user_id, titulo, link from hub_notificacoes where app = 'contratos' and titulo like 'Contratos: reajuste%' order by user_id;
select valor as marco_antigo_2500 from fin_titulos where recorrente_id = :'aluguel' and competencia = '2027-03-01';

\echo '=== C12 proposta de reajuste (IPCA acumulado aplicado aos R$ 2.500,00)'
set role authenticated;
select p->>'referencia' as referencia, p->>'pendente' as pendente, p->>'percentual' as percentual, p->>'valor_atual' as atual,
       p->>'valor_novo' as novo, jsonb_array_length(p->'contas_em_aberto') as contas_do_ciclo
  from (select fin_recorrente_proposta(:'aluguel') as p) x;
\echo '--- C12 proposta de contrato sem reajuste (deve falhar)'
select fin_recorrente_proposta(:'limpeza');
\echo '--- C12 quem só vê aplica o reajuste (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fin_recorrente_reajustar(:'aluguel', 6.0, null);

\echo '=== C13 aplicar o reajuste: o contrato muda, março já lançado continua R$ 2.500,00 e abril sai com o valor novo'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_recorrente_reajustar(:'aluguel', (fin_recorrente_proposta(:'aluguel')->>'percentual')::numeric, 'IPCA 12 meses') as reajuste;
\echo '--- C13 reajustar de novo o mesmo ciclo (deve falhar)'
select fin_recorrente_reajustar(:'aluguel', 1, null);
reset role;
select origem, referencia, indice, percentual, percentual_proposto, valor_antes, valor_depois, titulos_atualizados
  from fin_recorrente_reajustes where recorrente_id = :'aluguel';
set teste.hoje = '2027-04-01';
select app.fin_recorrentes_rotina()->'geradas' as geradas_abril;
select to_char(competencia, 'MM/YYYY') as mes, valor from fin_titulos where recorrente_id = :'aluguel' order by competencia;

\echo '=== C14 % fixo com "atualizar as contas em aberto do ciclo": honorários de 11/2027 passam a 1.260,00'
set teste.hoje = '2027-11-03';
select app.fin_recorrentes_rotina()->'geradas' as geradas_nov;
set role authenticated;
select fin_recorrente_proposta(:'honorarios')->>'percentual' as fixo_5;
select fin_recorrente_reajustar(:'honorarios', 5, null, true)->>'contas_atualizadas' as contas_1;
reset role;
select to_char(competencia, 'MM/YYYY') as mes, valor from fin_titulos where recorrente_id = :'honorarios' and competencia >= '2027-10-01' order by competencia;

\echo '=== C15 editar o valor vale só dali para frente e fica no histórico (origem edicao)'
set role authenticated;
select fin_recorrente_salvar(jsonb_build_object('id', :'limpeza', 'pessoa', '00000000-0000-0000-0000-00000000e401', 'descricao', 'Limpeza',
  'valor', '500', 'dia', 15, 'categoria', '00000000-0000-0000-0000-00000000d401', 'inicio', '2026-12-01'))->>'geradas' as geradas_0;
\echo '--- C15 mudar o tipo do contrato (deve falhar)'
select fin_recorrente_salvar(jsonb_build_object('id', :'limpeza', 'tipo', 'receber', 'pessoa', '00000000-0000-0000-0000-00000000e401',
  'descricao', 'Limpeza', 'valor', '500', 'dia', 15, 'categoria', '00000000-0000-0000-0000-00000000d401', 'inicio', '2026-12-01'));
reset role;
select origem, valor_antes, valor_depois from fin_recorrente_reajustes where recorrente_id = :'limpeza';
select distinct valor as valor_antigo_nas_ja_lancadas from fin_titulos where recorrente_id = :'limpeza';

\echo '=== C16 encerrar com motivo: não lança mais; a conta do mês fica'
set role authenticated;
\echo '--- C16 encerrar sem motivo (deve falhar)'
select fin_recorrente_encerrar(:'limpeza', null);
select fin_recorrente_encerrar(:'limpeza', 'Contrato rescindido')::text = '' as encerrou;
\echo '--- C16 editar contrato encerrado (deve falhar)'
select fin_recorrente_salvar(jsonb_build_object('id', :'limpeza', 'pessoa', '00000000-0000-0000-0000-00000000e401', 'descricao', 'Limpeza',
  'valor', '500', 'dia', 15, 'categoria', '00000000-0000-0000-0000-00000000d401', 'inicio', '2026-12-01'));
reset role;
set teste.hoje = '2027-12-01';
select app.fin_recorrentes_rotina()->'geradas' as geradas_dez_2;
select count(*) filter (where competencia = '2027-12-01') as limpeza_dez_0, max(competencia) as ultima from fin_titulos where recorrente_id = :'limpeza';

\echo '=== C19 vigência com renovação automática e aviso 30 dias antes; contrato só de documento não lança contas'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Software contábil","numero":"CT-2027/15","objeto":"Licença do sistema contábil","valor":"890","dia":20,
  "categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2027-12-01","vigencia_fim":"2027-12-20",
  "renovacao_automatica":true,"aviso_dias":30,"indice":"IGP-M","mes_reajuste":12}'::jsonb)->>'id') as software \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Seguro do escritório","valor":"150","dia":5,"categoria":"00000000-0000-0000-0000-00000000d401",
  "vigencia_inicio":"2027-07-01","vigencia_fim":"2028-06-30","gera_contas":false}'::jsonb)->>'id') as seguro \gset
\echo '--- C19 renovação automática sem data de fim (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"X","valor":"1","dia":5,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2027-07-01","renovacao_automatica":true}'::jsonb);
\echo '--- C19 fim da vigência antes do início (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"X","valor":"1","dia":5,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2027-07-01","vigencia_fim":"2027-01-01"}'::jsonb);
reset role;
select (select count(*) from fin_titulos where recorrente_id = :'software') as software_1,
       (select count(*) from fin_titulos where recorrente_id = :'seguro') as seguro_0;
\echo '--- C19 rotina de 01/12/2027 de novo: avisa o fim da vigência do software (gestora e administrador), uma vez só'
select app.fin_recorrentes_rotina()->'avisos' as avisos_2, app.fin_recorrentes_rotina()->'avisos' as de_novo_0;
select count(*) as sino_fim_2 from hub_notificacoes where app = 'contratos' and titulo like 'Contratos: fim de vigência%';
\echo '--- C19 21/12/2027: vigência vencida com renovação automática ganha mais 12 meses (esperado: 2028-12-20, ativo)'
set teste.hoje = '2027-12-21';
select app.fin_recorrentes_rotina()->'renovados' as renovados_1;
select vigencia_fim, situacao, fim from fin_recorrentes where id = :'software';

\echo '=== C20 anexo do contrato assinado vai para o histórico'
insert into hub_arquivos (id, org_id, app, nome, ref_id) values
  ('00000000-0000-0000-0000-00000000aa41', '00000000-0000-0000-0000-0000000000a1', 'contratos', 'contrato-assinado.pdf', :'software'),
  ('00000000-0000-0000-0000-00000000aa42', '00000000-0000-0000-0000-0000000000a1', 'financeiro', 'outro.pdf', null);
set role authenticated;
select fin_recorrente_anexo(:'software', '00000000-0000-0000-0000-00000000aa41')::text = '' as anexou;
\echo '--- C20 anexo de outro módulo (deve falhar)'
select fin_recorrente_anexo(:'software', '00000000-0000-0000-0000-00000000aa42');
\echo '--- C20 quem só vê anexa (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fin_recorrente_anexo(:'software', '00000000-0000-0000-0000-00000000aa41');
\echo '--- C20 histórico do contrato (quem só vê lê): criado, conta, aviso, renovado, anexo'
select tipo, texto from fin_recorrente_eventos where recorrente_id = :'software' order by id;
select tipo, count(*) from fin_recorrente_eventos where recorrente_id = :'aluguel' group by tipo order by tipo;
reset role;

\echo '=== C17 nada se apaga'
\echo '--- C17 apagar contrato pela API (deve falhar)'
set role authenticated;
delete from fin_recorrentes where id = :'aluguel';
reset role;
\echo '--- C17 apagar contrato direto no banco (deve falhar)'
delete from fin_recorrentes where id = :'aluguel';
\echo '--- C17 apagar histórico de reajuste (deve falhar)'
delete from fin_recorrente_reajustes where recorrente_id = :'aluguel';
\echo '--- C17 apagar histórico do contrato (deve falhar)'
delete from fin_recorrente_eventos where recorrente_id = :'aluguel';
\echo '--- C17 apagar índice (deve falhar)'
delete from fin_indices where indice = 'IPCA';
\echo '--- C17 apagar conta gerada por contrato pela API não apaga nada (sem permissão de apagar: continuam as 9 contas)'
set role authenticated;
delete from fin_titulos where recorrente_id = :'aluguel';
reset role;
select (select count(*) from fin_recorrentes where id in (:'aluguel', :'honorarios', :'sistema', :'limpeza')) as contratos_4,
       (select count(*) from fin_recorrente_reajustes) as historico_3,
       (select count(*) from fin_indices) as indices_14,
       (select count(*) from fin_titulos where recorrente_id = :'aluguel') as contas_aluguel_9;
\echo '=== C18 rotina sem pg_net não quebra a busca (esperado: 0)'
select app.fin_indices_pedir() as pedidos_0;
reset teste.hoje;
