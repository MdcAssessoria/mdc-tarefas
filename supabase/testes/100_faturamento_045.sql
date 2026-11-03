-- Testes da 043: faturamento dos contratos a receber (dia de gerar, vencimento no mês seguinte, fatura numerada, fila de
-- envio por canal, Portal, cancelar, gerar à mão) e as correções BD-01 e BD-02 da reauditoria de 03/11/2026.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
-- O "hoje" anda por teste.hoje: 10/01/2028 → 24/01 → 25/01 → 02/04/2028.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2028-01-10';

\echo '=== F0 regra do vencimento (esperado: 2028-02-05, 2028-01-10, 2028-02-10, 2028-01-31, 2028-02-29, 2028-01-01 e geração 2028-01-25 / 2028-01-01)'
select app.fin_recorrente_vencimento('2028-01-01', 'receber', 25, 5) as gera25_vence5,
       app.fin_recorrente_vencimento('2028-01-01', 'receber', 1, 10) as gera1_vence10,
       app.fin_recorrente_vencimento('2028-01-01', 'receber', 10, 10) as gera10_vence10,
       app.fin_recorrente_vencimento('2028-01-01', 'receber', 28, 31) as gera28_vence31,
       app.fin_recorrente_vencimento('2028-02-01', 'receber', 28, 30) as fev_bissexto,
       app.fin_recorrente_vencimento('2028-01-01', 'pagar', 1, 1) as pagar_mesmo_mes,
       app.fin_recorrente_data_geracao('2028-01-01', 'receber', 25) as gera_receber,
       app.fin_recorrente_data_geracao('2028-01-01', 'pagar', 25) as gera_pagar;

\echo '=== F1 contratos a receber com cada "O que enviar" (cadastro em 10/01/2028)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
set teste.membro = 'analista';
-- fatura + boleto, gera dia 25 e vence dia 5 (mês seguinte), por e-mail e Portal (cliente c1): ainda não gera em 10/01
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Gama Comércio Ltda",
  "descricao":"Honorários Gama","valor":"1500","dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01",
  "documento":"fatura","envio":"fatura_boleto","dia_geracao":25,"canais":["email","portal"],"email_envio":" Financeiro@Gama.com.br ",
  "cliente_carteira":"00000000-0000-0000-0000-0000000000c1"}'::jsonb)->>'id') as gama \gset
-- NF + fatura + boleto, gera dia 1 e vence dia 10 (mesmo mês), por WhatsApp e Portal (cliente c3): gera janeiro na hora
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Delta Serviços ME",
  "descricao":"Honorários Delta","valor":"2200","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01",
  "documento":"nfse","envio":"nf_fatura_boleto","dia_geracao":1,"canais":["whatsapp","portal"],"whatsapp_envio":"(11) 98888-7777",
  "cliente_carteira":"00000000-0000-0000-0000-0000000000c3","servico_descricao":"Serviços de contabilidade","servico_codigo":"17.01.01",
  "iss_aliquota":"2"}'::jsonb)->>'id') as delta \gset
-- NF + fatura (boleto depois), gera dia 5 e vence dia 20, só por e-mail
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Épsilon Indústria SA",
  "descricao":"Consultoria Épsilon","valor":"3000","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":5,"canais":["email"],"email_envio":"contas@epsilon.com.br",
  "servico_descricao":"Consultoria tributária","servico_codigo":"17.01","iss_aliquota":"5"}'::jsonb)->>'id') as epsilon \gset
-- só a fatura, sem canal de envio
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Zeta Transportes",
  "descricao":"Assessoria Zeta","valor":"800","dia":15,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01",
  "documento":"fatura","envio":"fatura","dia_geracao":1}'::jsonb)->>'id') as zeta \gset
-- só a fatura, só pelo Portal (cliente c1): publicada na hora
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Gama Comércio Ltda",
  "descricao":"Mensalidade do Portal Gama","valor":"99.9","dia":12,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01",
  "documento":"fatura","envio":"fatura","dia_geracao":2,"canais":["portal"],"cliente_carteira":"00000000-0000-0000-0000-0000000000c1"}'::jsonb)->>'id') as portalgama \gset
-- a pagar continua como na 041: documento/canais mandados são ignorados, gera no dia 1 e vence no mesmo mês
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000e401",
  "descricao":"Estacionamento","valor":"200","dia":1,"categoria":"00000000-0000-0000-0000-00000000d401","vigencia_inicio":"2028-01-01",
  "documento":"nfse","canais":["email"],"dia_geracao":20}'::jsonb)->>'id') as estacionamento \gset
reset role;
select descricao, documento, envio, dia_geracao, canais, email_envio, whatsapp_envio, servico_codigo, iss_aliquota
  from fin_recorrentes where id in (:'gama', :'delta', :'epsilon', :'zeta', :'portalgama', :'estacionamento') order by descricao;

\echo '=== F2 em 10/01 só os de dia de gerar já chegado têm conta e fatura (esperado: Delta, Épsilon, Zeta e Portal com 1; Gama 0; Estacionamento conta 1 sem fatura, vence 01/01)'
select r.descricao, count(t.id) as contas, count(f.id) as faturas, min(t.vencimento) as vence
  from fin_recorrentes r left join fin_titulos t on t.recorrente_id = r.id left join fin_faturas f on f.titulo_id = t.id
 where r.id in (:'gama', :'delta', :'epsilon', :'zeta', :'portalgama', :'estacionamento') group by r.descricao order by r.descricao;

\echo '=== F3 cada combinação gera a fatura e os envios certos'
select r.descricao, f.numero ~ '^2028/[0-9]{5}$' as numero_ok, f.competencia, f.emissao, f.vencimento, f.valor, f.situacao,
       f.nfse_situacao, f.boleto_situacao, t.documento = 'Fatura ' || f.numero as conta_com_numero
  from fin_faturas f join fin_recorrentes r on r.id = f.recorrente_id join fin_titulos t on t.id = f.titulo_id
 where r.id in (:'delta', :'epsilon', :'zeta', :'portalgama') order by r.descricao;
select r.descricao, e.canal, e.destino, e.conteudo, e.situacao, e.enviado_em is not null as enviado
  from fin_envios e join fin_faturas f on f.id = e.fatura_id join fin_recorrentes r on r.id = f.recorrente_id
 where r.id in (:'delta', :'epsilon', :'zeta', :'portalgama') order by r.descricao, e.canal;

\echo '--- F4 validações do cadastro'
set role authenticated;
\echo '--- F4a NF + fatura num contrato sem nota (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","documento":"fatura","envio":"nf_fatura"}'::jsonb);
\echo '--- F4b dia de gerar 29 (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","dia_geracao":29}'::jsonb);
\echo '--- F4c canal desconhecido (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","canais":["sms"]}'::jsonb);
\echo '--- F4d e-mail marcado sem endereço (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","canais":["email"],"email_envio":"sem-arroba"}'::jsonb);
\echo '--- F4e WhatsApp sem DDD (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","canais":["whatsapp"],"whatsapp_envio":"98888"}'::jsonb);
\echo '--- F4f Portal sem o cliente da carteira (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","canais":["portal"]}'::jsonb);
\echo '--- F4g cliente da carteira inexistente (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","canais":["portal"],
  "cliente_carteira":"00000000-0000-0000-0000-0000000000ff"}'::jsonb);
\echo '--- F4h NFS-e sem código do serviço (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","documento":"nfse","envio":"nf_fatura",
  "servico_descricao":"Contabilidade","iss_aliquota":"2"}'::jsonb);
\echo '--- F4i código do serviço fora do formato (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","documento":"nfse","envio":"nf_fatura",
  "servico_descricao":"Contabilidade","servico_codigo":"abc","iss_aliquota":"2"}'::jsonb);
\echo '--- F4j ISS de 7% (deve falhar)'
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01","documento":"nfse","envio":"nf_fatura",
  "servico_descricao":"Contabilidade","servico_codigo":"1701","iss_aliquota":"7"}'::jsonb);
\echo '--- F4k quem só vê Contratos cadastra (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"X","descricao":"X","valor":"1",
  "dia":5,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-01-01"}'::jsonb);
set teste.uid = '00000000-0000-0000-0000-000000000e41';
\echo '=== F4l editar sem mandar os campos novos mantém o faturamento gravado (esperado: fatura_boleto, 25, {email,portal})'
select fin_recorrente_salvar(jsonb_build_object('id', :'gama', 'pessoa_nome', 'Gama Comércio Ltda', 'descricao', 'Honorários Gama',
  'valor', '1500', 'dia', 5, 'categoria', '00000000-0000-0000-0000-00000000d402', 'vigencia_inicio', '2028-01-01'))->>'geradas' as geradas_0;
reset role;
select envio, dia_geracao, canais from fin_recorrentes where id = :'gama';

\echo '=== F5 24/01: a rotina ainda não gera o Gama (e conta a falha do contrato com erro: true); 25/01 gera (vence 05/02) e rodar de novo não duplica'
set teste.hoje = '2028-01-24';
select (app.fin_recorrentes_rotina()->>'falhas')::int > 0 as falha_registrada;
select count(*) as gama_antes_0 from fin_titulos where recorrente_id = :'gama';
set teste.hoje = '2028-01-25';
select app.fin_recorrentes_rotina() is not null as rodou_1, app.fin_recorrentes_rotina() is not null as rodou_2;
select count(t.id) as contas_1, count(f.id) as faturas_1, min(f.vencimento) as vence_2028_02_05, min(f.emissao) as emissao_25_01, min(f.situacao) as pronta
  from fin_titulos t left join fin_faturas f on f.titulo_id = t.id where t.recorrente_id = :'gama';
select e.canal, e.conteudo, e.situacao from fin_envios e join fin_faturas f on f.id = e.fatura_id where f.recorrente_id = :'gama' order by e.canal;
\echo '=== F5b números sem repetir e em sequência (esperado: repetidos 0)'
select count(*) - count(distinct numero) as repetidos, count(*) as faturas, max(sequencia) - min(sequencia) + 1 = count(*) as sem_buraco
  from fin_faturas where ano = 2028;
\echo '--- F5c segunda fatura ativa no mesmo mês, direto na tabela (deve falhar)'
insert into fin_faturas (org_id, cliente_id, recorrente_id, titulo_id, pessoa_id, ano, sequencia, numero, competencia, emissao, vencimento,
                         valor, descricao, documento, envio, situacao, nfse_situacao, boleto_situacao)
select org_id, cliente_id, recorrente_id, (select id from fin_titulos where recorrente_id = :'estacionamento' limit 1), pessoa_id, 2028, 999, '2028/00999',
       competencia, emissao, vencimento, valor, descricao, documento, envio, 'gerada', nfse_situacao, boleto_situacao
  from fin_faturas where recorrente_id = :'gama';

\echo '=== F6 BD-02: a rotina ignora o contrato de outra empresa e o contrato com erro vai para a auditoria'
select count(*) as outra_empresa_contas_0 from fin_titulos where recorrente_id = '00000000-0000-0000-0000-00000000f431';
select count(*) as contas_erro_0 from fin_titulos where recorrente_id = '00000000-0000-0000-0000-00000000f432';
select count(*) > 0 as falha_na_auditoria from hub_auditoria where acao = 'recorrente_falha' and alvo = '00000000-0000-0000-0000-00000000f432';
select count(*) as falha_outra_empresa_0 from hub_auditoria where alvo = '00000000-0000-0000-0000-00000000f431';

\echo '=== F7 Portal: o cliente c1 vê só as faturas dele publicadas (esperado: Honorários Gama e Mensalidade do Portal Gama)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = '';
select descricao, situacao from portal_minhas_faturas('00000000-0000-0000-0000-0000000000c1') order by descricao;
select count(*) as tabela_direta_0 from fin_faturas;
\echo '--- F7b cliente c1 pede as faturas do c3 (deve falhar)'
select * from portal_minhas_faturas('00000000-0000-0000-0000-0000000000c3');
\echo '=== F7c cliente c3: a do Delta ainda espera a nota fiscal, nada publicado (esperado: 0)'
set teste.uid = '00000000-0000-0000-0000-000000000e47';
select count(*) as publicadas_0 from portal_minhas_faturas('00000000-0000-0000-0000-0000000000c3');
\echo '--- F7d login do Portal sem a permissão documentos (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select * from portal_minhas_faturas('00000000-0000-0000-0000-0000000000c1');
\echo '=== F7e etapa 2 (simulada): NFS-e emitida → o Portal publica a do Delta (esperado: 1 e situação pronta, WhatsApp aguardando)'
reset role;
update fin_faturas set nfse_situacao = 'emitida', nfse_numero = '123' where recorrente_id = :'delta';
select app.fin_fatura_processar(id) as situacao from fin_faturas where recorrente_id = :'delta';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e47';
select count(*) as publicadas_1 from portal_minhas_faturas('00000000-0000-0000-0000-0000000000c3');

\echo '=== F8 cancelar fatura'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
set teste.membro = 'analista';
\echo '--- F8a quem só vê Contratos cancela (deve falhar)'
select fin_fatura_cancelar((select id from fin_faturas where recorrente_id = :'zeta'), 'teste');
set teste.uid = '00000000-0000-0000-0000-000000000e41';
\echo '--- F8b cancelar sem motivo (deve falhar)'
select fin_fatura_cancelar((select id from fin_faturas where recorrente_id = :'zeta'), ' ');
\echo '=== F8c cancelar com motivo: a conta em aberto cancela junto (esperado: conta_cancelada true)'
select fin_fatura_cancelar((select id from fin_faturas where recorrente_id = :'zeta'), 'Valor combinado errado') as cancelou;
reset role;
select f.situacao, f.cancelamento_motivo, t.situacao as conta, t.cancelado_motivo from fin_faturas f join fin_titulos t on t.id = f.titulo_id
 where f.recorrente_id = :'zeta';
set role authenticated;
\echo '--- F8d cancelar de novo (deve falhar)'
select fin_fatura_cancelar((select id from fin_faturas where recorrente_id = :'zeta'), 'de novo');
\echo '--- F8e fatura com NFS-e emitida (deve falhar)'
select fin_fatura_cancelar((select id from fin_faturas where recorrente_id = :'delta'), 'teste');
\echo '--- F8f fatura já recebida no Financeiro (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select fin_baixar((select titulo_id from fin_faturas where recorrente_id = :'epsilon'), '2028-01-20', 3000,
                  '00000000-0000-0000-0000-00000000b401') is not null as recebeu;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
set teste.membro = 'analista';
select fin_fatura_cancelar((select id from fin_faturas where recorrente_id = :'epsilon'), 'teste');
\echo '--- F8g gravar direto na fatura (deve falhar)'
update fin_faturas set valor = 1 where recorrente_id = :'gama';
\echo '--- F8h apagar fatura, mesmo pelo banco (deve falhar)'
reset role;
delete from fin_faturas where recorrente_id = :'zeta';

\echo '=== F9 a rotina não gera de novo o mês cancelado (esperado: ativas 0, canceladas 1)'
select app.fin_recorrentes_rotina() is not null as rodou;
select count(*) filter (where situacao <> 'cancelado') as ativas_0, count(*) filter (where situacao = 'cancelado') as canceladas_1
  from fin_titulos where recorrente_id = :'zeta' and competencia = '2028-01-01';

\echo '=== F10 gerar agora (à mão, com motivo)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e42';
\echo '--- F10a quem só vê Contratos gera (deve falhar)'
select fin_fatura_gerar_agora(:'zeta', '2028-01-01', 'teste');
set teste.uid = '00000000-0000-0000-0000-000000000e41';
\echo '--- F10b sem motivo (deve falhar)'
select fin_fatura_gerar_agora(:'zeta', '2028-01-01', null);
\echo '--- F10c mês futuro (deve falhar)'
select fin_fatura_gerar_agora(:'zeta', '2028-03-01', 'adiantar');
\echo '--- F10d mês antes do início do contrato (deve falhar)'
select fin_fatura_gerar_agora(:'zeta', '2027-12-01', 'retroativo');
\echo '=== F10e depois de cancelada, gera de novo o mesmo mês com número novo (esperado: numero novo, origem manual)'
select fin_fatura_gerar_agora(:'zeta', '2028-01-01', 'Valor corrigido para 800,00') ? 'fatura' as gerou;
reset role;
select numero, situacao, origem, motivo_manual from fin_faturas where recorrente_id = :'zeta' order by sequencia;
set role authenticated;
\echo '--- F10f o mesmo mês outra vez (deve falhar)'
select fin_fatura_gerar_agora(:'zeta', '2028-01-01', 'duplicar');
\echo '=== F11 B-06: a rotina parou em fevereiro e março; em 02/04 recupera abril e março, e fevereiro sai à mão'
reset role;
set teste.hoje = '2028-04-02';
select app.fin_recorrentes_rotina() is not null as rodou;
select to_char(competencia, 'MM/YYYY') as mes, count(*) from fin_titulos where recorrente_id = :'zeta' and situacao <> 'cancelado'
 group by competencia order by competencia;
set role authenticated;
select fin_fatura_gerar_agora(:'zeta', '2028-02-01', 'Rotina parada em fevereiro', '2028-04-15')->>'vencimento' as vence_15_04;
reset role;
select to_char(competencia, 'MM/YYYY') as mes, origem, vencimento from fin_faturas where recorrente_id = :'zeta' and situacao <> 'cancelada'
 order by competencia;
set role authenticated;
\echo '--- F11b vencimento sem sentido para o mês (deve falhar)'
select fin_fatura_gerar_agora(:'epsilon', '2028-02-01', 'teste', '2027-01-01');

\echo '=== F12 concorrência: duas faturas à mão ao mesmo tempo recebem números diferentes'
reset role;
set teste.hoje = '2028-04-02';
set role authenticated;
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Corrida A","descricao":"Corrida A",
  "valor":"10","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-04-01","dia_geracao":20}'::jsonb)->>'id') as ca \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Corrida B","descricao":"Corrida B",
  "valor":"10","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-04-01","dia_geracao":20}'::jsonb)->>'id') as cb \gset
reset role;
select dblink_connect('fa', :'conexao') as a, dblink_connect('fb', :'conexao') as b;
select dblink_exec('fa', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-000000000e41''; set teste.membro = ''analista''; set teste.hoje = ''2028-04-02''') as a,
       dblink_exec('fb', 'set role authenticated; set teste.uid = ''00000000-0000-0000-0000-000000000e41''; set teste.membro = ''analista''; set teste.hoje = ''2028-04-02''') as b;
select dblink_exec('fa', 'begin') as a, dblink_exec('fb', 'begin') as b;
select x as numero_a from dblink('fa', format('select fin_fatura_gerar_agora(%L, ''2028-04-01'', ''corrida'') ->> ''numero''', :'ca')) t(x text);
select dblink_send_query('fb', format('select fin_fatura_gerar_agora(%L, ''2028-04-01'', ''corrida'') ->> ''numero''', :'cb')) as enviado;
select dblink_exec('fa', 'commit') as a_commit;
select x is not null as numero_b from dblink_get_result('fb') as t(x text);
select count(*) as fim from dblink_get_result('fb') as t(x text);
select dblink_exec('fb', 'commit') as b_commit;
select count(distinct numero) as numeros_distintos_2 from fin_faturas where recorrente_id in (:'ca', :'cb');
\echo '--- F12b o mesmo mês do mesmo contrato ao mesmo tempo: o segundo espera a trava e recusa (deve falhar)'
set role authenticated;
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa_nome":"Corrida C","descricao":"Corrida C",
  "valor":"10","dia":10,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-04-01","dia_geracao":20}'::jsonb)->>'id') as cc \gset
reset role;
select dblink_exec('fa', 'begin') as a, dblink_exec('fb', 'begin') as b;
select x is not null as primeiro from dblink('fa', format('select fin_fatura_gerar_agora(%L, ''2028-04-01'', ''corrida'') ->> ''numero''', :'cc')) t(x text);
select dblink_send_query('fb', format('select fin_fatura_gerar_agora(%L, ''2028-04-01'', ''corrida'') ->> ''numero''', :'cc')) as enviado;
select dblink_exec('fa', 'commit') as a_commit;
select x from dblink_get_result('fb') as t(x text);
select count(*) as fim from dblink_get_result('fb', false) as t(x text);
\echo '=== F12c depois da corrida: uma só fatura de abril para o contrato C (esperado: 1)'
select dblink_exec('fb', 'rollback') as b_rollback;
select dblink_disconnect('fa'), dblink_disconnect('fb');
select count(*) as abril_c_1 from fin_faturas where recorrente_id = :'cc' and competencia = '2028-04-01' and situacao <> 'cancelada';

\echo '=== F13 BD-01: a captura de notas só reserva a empresa da MDC (esperado: só c41, nfe e nfse; nenhum controle novo do c2)'
reset role;
select cliente_id, fonte from fis_captura_reservar(10) order by fonte;
select count(*) as controle_c2_0 from fis_dfe_controle where cliente_id = '00000000-0000-0000-0000-0000000000c2';

\echo '=== F14 histórico do contrato mostra as faturas (esperado: linhas do tipo fatura)'
select count(*) > 0 as tem_fatura_no_historico from fin_recorrente_eventos where recorrente_id = :'zeta' and tipo = 'fatura';
reset teste.hoje;
