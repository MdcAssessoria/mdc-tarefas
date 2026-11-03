-- Testes da 048: regras decididas pelo Edvaldo (vencimento no mesmo mês, reajuste negativo mantém o valor, mês cheio) e
-- correções B-04 a B-09, B-12, BD-03 e a numeração das faturas por ano.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
-- O "hoje" anda por teste.hoje: 15/01/2029 → 20/05 → 12/06 → 02/07 → 20/12 → 05/01/2030 → 05/03 → 13/03 → 20/03 → 21/05 → 15/04/2031.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2029-01-15';

\echo '=== R3a vencimento no mesmo mês (esperado: 2029-01-05, 2029-01-05, 2029-01-31, 2029-02-28, 2029-01-01)'
select app.fin_recorrente_vencimento('2029-01-01', 'receber', 1, 5) as gera1_vence5,
       app.fin_recorrente_vencimento('2029-01-01', 'receber', 5, 5) as gera5_vence5,
       app.fin_recorrente_vencimento('2029-01-01', 'receber', 28, 31) as gera28_vence31,
       app.fin_recorrente_vencimento('2029-02-01', 'receber', 28, 30) as fev,
       app.fin_recorrente_vencimento('2029-01-01', 'pagar', 1, 1) as pagar;

set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e41';
\echo '--- R3b a receber com dia de gerar depois do dia de vencer (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Teta","descricao":"Teta",
  "valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01","dia_geracao":10}'::jsonb);
\echo '--- R1a percentual fixo negativo (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Teta","descricao":"Teta",
  "valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01","indice":"fixo",
  "percentual_fixo":"-3","mes_reajuste":3}'::jsonb);
\echo '--- B12a renovação de 0 meses (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Teta","descricao":"Teta",
  "valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01","vigencia_fim":"2029-12-31",
  "renovacao_automatica":true,"renovacao_meses":0}'::jsonb);
\echo '--- BOL fatura + boleto sem escolher o banco (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Teta","descricao":"Teta",
  "valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01","envio":"fatura_boleto"}'::jsonb);
\echo '--- BD03a quem tem só Contratos cria contrato a pagar que lança contas (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Aluguel 2029","valor":"3000","dia":10,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2029-01-01"}'::jsonb);

\echo '=== BD03b só Contratos: contrato a pagar que só guarda o documento passa; com Financeiro (e48), o que lança contas também'
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Seguro (só documento)","valor":"300","dia":10,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2029-01-01",
  "gera_contas":false}'::jsonb)->>'geradas')::int as so_documento_0;
set teste.uid = '00000000-0000-0000-0000-000000000e48';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Aluguel 2029","valor":"3000","dia":20,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2029-01-01"}'::jsonb)->>'id') as aluguel \gset
\echo '--- BD03c quem tem só Contratos edita o contrato a pagar que lança contas (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_recorrente_salvar(jsonb_build_object('id', :'aluguel', 'pessoa', '00000000-0000-0000-0000-00000000e401', 'descricao', 'Aluguel 2029',
  'valor', '99000', 'dia', 20, 'categoria', '00000000-0000-0000-0000-00000000d401', 'vigencia_inicio', '2029-01-01'));

\echo '=== C cadastro em 15/01/2029 (mês cheio, recuperação, reajustes, renovação de 29/02, boleto Itaú)'
-- mês cheio: vigência de 15/01 a 10/06/2029, gera dia 1 e vence dia 5
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Mês Cheio Ltda",
  "descricao":"Mês cheio","valor":"1000","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-15",
  "vigencia_fim":"2029-06-10","dia_geracao":1}'::jsonb)->>'id') as cheio \gset
-- IPCA em março; INPC em março (nunca confirmado até 2031); IGP-M em março (índice negativo)
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Índice IPCA SA",
  "descricao":"Reajuste IPCA","valor":"2000","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01",
  "indice":"IPCA","mes_reajuste":3,"dia_geracao":1}'::jsonb)->>'id') as ipca \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Índice INPC SA",
  "descricao":"Reajuste INPC","valor":"500","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01",
  "indice":"INPC","mes_reajuste":3,"dia_geracao":1}'::jsonb)->>'id') as inpc \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Índice IGPM SA",
  "descricao":"Reajuste IGP-M","valor":"800","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01",
  "indice":"IGP-M","mes_reajuste":3,"dia_geracao":1}'::jsonb)->>'id') as igpm \gset
-- renovação automática de 12 meses com fim em 29/02/2028, sem contas
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Bissexto ME",
  "descricao":"Vigência 29/02","valor":"100","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2027-03-01",
  "vigencia_fim":"2028-02-29","renovacao_automatica":true,"gera_contas":false}'::jsonb)->>'id') as bissexto \gset
-- fatura + boleto pelo Itaú
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Boleto Itaú Ltda",
  "descricao":"Boleto Itaú","valor":"750","dia":15,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2029-01-01",
  "envio":"fatura_boleto","boleto_banco":"Itau","dia_geracao":1}'::jsonb)->>'id') as itau \gset
reset role;
select descricao, dia_geracao, dia_vencimento, boleto_banco, renovacao_meses from fin_recorrentes
 where id in (:'cheio', :'ipca', :'itau', :'bissexto') order by descricao;

\echo '=== R2/R3 janeiro do "Mês cheio" (começa em 15/01): valor inteiro, fatura 2029/00001… vence 05/01 (esperado: 1000.00, 2029-01-05)'
select f.numero, t.valor, t.vencimento, f.vencimento as fatura_vence from fin_titulos t join fin_faturas f on f.titulo_id = t.id
 where t.recorrente_id = :'cheio';
select min(numero) as primeira_de_2029 from fin_faturas where ano = 2029;

\echo '=== B12 rotina de 15/01/2029 renova a vigência de 29/02/2028 para 28/02/2029 (esperado: 2029-02-28 e base 2028-02-29)'
select app.fin_recorrentes_rotina()->>'renovados' as renovados;
select vigencia_fim, vigencia_fim_base from fin_recorrentes where id = :'bissexto';

\echo '=== B06 rotina parada de fev a mai: em 20/05 recupera os meses (esperado: Mês cheio com 5 contas de 01 a 05, todas 1000; rodar de novo não duplica)'
set teste.hoje = '2029-05-20';
select (app.fin_recorrentes_rotina()->>'falhas')::int > 0 as falha_do_f432;
select (app.fin_recorrentes_rotina()->>'geradas')::int as segunda_rodada_0;
select count(*) as contas, min(competencia) as de, max(competencia) as ate, min(valor) as menor, max(valor) as maior
  from fin_titulos where recorrente_id = :'cheio';
\echo '=== B06b mês cancelado não volta: cancela a fatura de 03/2029 e a rotina não gera de novo (esperado: 0 ativas em 03)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_fatura_cancelar((select f.id from fin_faturas f where f.recorrente_id = :'cheio' and f.competencia = '2029-03-01'), 'Cliente pediu cancelar março')->>'conta_cancelada' as cancelou_conta;
reset role;
select (app.fin_recorrentes_rotina()->>'geradas')::int as nao_regera_0;
select count(*) filter (where situacao <> 'cancelado') as ativas_marco from fin_titulos where recorrente_id = :'cheio' and competencia = '2029-03-01';

\echo '=== B08 a falha do f432 também foi para o sino: administrador e gestora sim; operador e gestora com acesso vencido não (esperado: e40 t, e43 t, e41 f, e49 f)'
select u.id as usuario, exists (select 1 from hub_notificacoes n where n.user_id = u.id and n.titulo = 'Contratos: a rotina de hoje teve problema') as avisado
  from (values ('00000000-0000-0000-0000-000000000e40'::uuid), ('00000000-0000-0000-0000-000000000e43'), ('00000000-0000-0000-0000-000000000e41'),
               ('00000000-0000-0000-0000-000000000e49')) u(id) order by 1;

\echo '=== R2 junho (termina em 10/06): valor inteiro; julho: encerrado (esperado: 06 com 1000 e situação encerrado)'
set teste.hoje = '2029-06-12';
select app.fin_recorrentes_rotina() is not null as rodou;
select competencia, valor, vencimento from fin_titulos where recorrente_id = :'cheio' and competencia = '2029-06-01';
set teste.hoje = '2029-07-02';
select app.fin_recorrentes_rotina() is not null as rodou;
select situacao, (select count(*) from fin_titulos where recorrente_id = :'cheio' and competencia = '2029-07-01') as julho_0
  from fin_recorrentes where id = :'cheio';

\echo '=== NUM fatura recomeça no ano novo (esperado: última de 2029 maior que 2029/00001; primeira de 2030 = 2030/00001; sem repetir)'
set teste.hoje = '2029-12-20';
select app.fin_recorrentes_rotina() is not null as rodou;
set teste.hoje = '2030-01-05';
select app.fin_recorrentes_rotina() is not null as rodou;
select max(numero) filter (where ano = 2029) > '2029/00001' as continuou_2029, min(numero) filter (where ano = 2030) as primeira_2030,
       count(*) = count(distinct numero) as sem_repetir from fin_faturas;

\echo '=== B07a 05/03/2030: IPCA completo → avisa; IGP-M sem o índice de 02/2030 → ainda não; só quem opera ou gere com acesso válido'
set teste.hoje = '2030-03-05';
select app.fin_reajuste_pendente(:'ipca') as ipca_pendente, app.fin_reajuste_pendente(:'igpm') as igpm_pendente;
select app.fin_recorrentes_rotina() is not null as rodou;
select descricao, reajuste_avisado, reajuste_avisado_em from fin_recorrentes where id in (:'ipca', :'igpm', :'inpc') order by descricao;
select u.id as usuario, exists (select 1 from hub_notificacoes n where n.user_id = u.id and n.titulo = 'Contratos: reajuste pendente') as avisado
  from (values ('00000000-0000-0000-0000-000000000e40'::uuid), ('00000000-0000-0000-0000-000000000e41'), ('00000000-0000-0000-0000-000000000e42'),
               ('00000000-0000-0000-0000-000000000e43'), ('00000000-0000-0000-0000-000000000e49')) u(id) order by 1;
\echo '=== B07b 13/03: lembrete do IPCA (7 dias depois); 20/03: IGP-M avisado mesmo sem índice, dizendo que falta (esperado: lembrete t, igpm 2030-03-01, texto t)'
set teste.hoje = '2030-03-13';
select app.fin_recorrentes_rotina() is not null as rodou;
select exists (select 1 from fin_recorrente_eventos where recorrente_id = :'ipca' and texto like 'Aviso no sino (lembrete)%') as lembrete;
set teste.hoje = '2030-03-20';
select app.fin_recorrentes_rotina() is not null as rodou;
select reajuste_avisado as igpm_avisado from fin_recorrentes where id = :'igpm';
select exists (select 1 from hub_notificacoes where titulo = 'Contratos: reajuste pendente' and texto like '%ainda sem o índice%') as texto_sem_indice;

\echo '=== R1 IGP-M negativo: proposta 0%, valor mantido (esperado: 0.0000, t, 800.00)'
insert into fin_indices (indice, mes, percentual) values ('IGP-M', '2030-02-01', -0.5) on conflict (indice, mes) do update set percentual = excluded.percentual;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (p->>'percentual')::numeric as proposto, (p->>'negativo_vira_zero')::boolean as negativo, (p->>'valor_novo')::numeric as valor_novo,
       (p->>'percentual_indice')::numeric < 0 as indice_negativo
  from (select fin_recorrente_proposta(:'igpm') as p) x;
\echo '--- R1b confirmar reajuste negativo (deve falhar)'
select fin_recorrente_reajustar(:'igpm', -5.8);
\echo '=== R1c confirmar com 0% mantém o valor (esperado: 800.00)'
select (fin_recorrente_reajustar(:'igpm', 0, 'IGP-M negativo')->>'valor')::numeric as valor;
reset role;

\echo '=== B09 21/05/2030: ciclo do IPCA com março pago, abril ajustado à mão e maio normal; confirmar 4% atualizando as abertas (proposta pelo IPCA de 12,68%: diferença 253,65; confirmado a 4%: 80,00)'
set teste.hoje = '2030-05-21';
select app.fin_recorrentes_rotina() is not null as rodou;
-- março recebido com o valor antigo; abril mudado à mão no Financeiro (desconto combinado)
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e48';
select fin_baixar((select id from fin_titulos where recorrente_id = :'ipca' and competencia = '2030-03-01'), '2030-03-10', 2000,
                  '00000000-0000-0000-0000-00000000b401')->>'quitado' as marco_pago;
reset role;
set app.fin_interno = '1';
update fin_titulos set valor = 1900 where recorrente_id = :'ipca' and competencia = '2030-04-01';
update fin_faturas set valor = 1900 where titulo_id = (select id from fin_titulos where recorrente_id = :'ipca' and competencia = '2030-04-01');
reset app.fin_interno;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select jsonb_array_length(p->'contas'->'atualizaveis') as atualizaveis_1, jsonb_array_length(p->'contas'->'ajuste_manual') as manual_1,
       (p->'contas'->>'diferenca_pagas')::numeric as diferenca_pelo_indice_253_65
  from (select fin_recorrente_proposta(:'ipca') as p) x;
select r->>'valor' as valor_novo, r->>'contas_atualizadas' as atualizadas_1, r->>'ajuste_manual' as manual_1, r->>'diferenca_pagas' as diferenca
  from (select fin_recorrente_reajustar(:'ipca', 4, 'IPCA 12 meses', true) as r) x;
reset role;
select t.competencia, t.valor, f.valor as fatura from fin_titulos t left join fin_faturas f on f.titulo_id = t.id
 where t.recorrente_id = :'ipca' and t.competencia >= '2030-03-01' order by 1;
select texto like '%diferença de R$ 80,00%' and texto like '%1 conta(s) não mudaram%' as historico_ok
  from fin_recorrente_eventos where recorrente_id = :'ipca' and tipo = 'reajuste' order by id desc limit 1;

\echo '=== B04 trocar o mês do reajuste depois de confirmar não reajusta de novo no mesmo ano (esperado: pendente vazio, próximo 2031-05-01)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_recorrente_salvar(jsonb_build_object('id', :'ipca', 'pessoa_nome', 'Índice IPCA SA', 'descricao', 'Reajuste IPCA', 'valor', '2080',
  'dia', 10, 'categoria', '00000000-0000-0000-0000-00000000d402', 'vigencia_inicio', '2029-01-01', 'indice', 'IPCA', 'mes_reajuste', 5))->>'id' is not null as editou;
reset role;
select app.fin_reajuste_pendente(:'ipca') as pendente, app.fin_reajuste_proximo(:'ipca') as proximo;
\echo '--- B04b tentar reajustar de novo em 05/2030 (deve falhar)'
set role authenticated;
select fin_recorrente_reajustar(:'ipca', 3);
reset role;

\echo '=== B05 15/04/2031: o ciclo 03/2030 do INPC nunca confirmado continua pendente; confirmado, vem o 03/2031 (esperado: 2030-03-01 e 2031-03-01)'
set teste.hoje = '2031-04-15';
select app.fin_recorrentes_rotina() is not null as rodou;
select app.fin_reajuste_pendente(:'inpc') as pendente_antigo;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_recorrente_reajustar(:'inpc', 3)->>'proximo' as proximo_pendente;
reset role;

\echo '=== B12b em 15/04/2031 a vigência renovada volta a 29/02 no bissexto (esperado: 2032-02-29)'
select vigencia_fim from fin_recorrentes where id = :'bissexto';
