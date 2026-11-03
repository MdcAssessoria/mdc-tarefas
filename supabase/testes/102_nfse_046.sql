-- Testes da 046: emissão da NFS-e das faturas pelo Emissor Nacional (parâmetros, conferência, reserva do nDPS sem
-- repetir, resultado emitida/recusada/incerta, ambiente de teste que não mexe na fatura, Portal liberado só com a nota de
-- verdade, travas de cancelamento, "nada se apaga", leitura por Contratos e o bucket fiscal).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
-- Usuários (95_base_041): e41 Contratos operar, e42 só ver, e43 gerir, e44 só Financeiro. "Hoje" = 10/05/2028.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2028-05-10';
\set org '00000000-0000-0000-0000-0000000000a1'
\set mdc '00000000-0000-0000-0000-000000000c41'

\echo '=== N1 contrato com NFS-e (17.19.01) gera a fatura de 05/2028 aguardando a nota (esperado: aguardando_nf, a_emitir)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
set teste.membro = 'analista';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e461",
  "descricao":"Honorários Ômega","valor":"1850.5","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"canais":["portal"],"cliente_carteira":"00000000-0000-0000-0000-0000000000c1",
  "servico_descricao":"Serviços de contabilidade – escrituração e folha","servico_codigo":"17.19.01","iss_aliquota":"2"}'::jsonb)->>'id') as kn \gset
reset role;
select id as fn from fin_faturas where recorrente_id = :'kn' \gset
select numero ~ '^2028/[0-9]{5}$' as numero_ok, situacao, nfse_situacao from fin_faturas where id = :'fn';

\echo '=== N2 sem parâmetros: preparar mostra o que falta (esperado: pronto false e a pendência "Configure a emissão")'
set role authenticated;
select (x->>'pronto')::boolean as pronto, exists (select 1 from jsonb_array_elements_text(x->'pendencias') p where p like 'Configure a emissão%') as pede_configurar
  from (select nfse_preparar(:'fn') x) y;
\echo '--- N2b quem só tem o Financeiro abre a conferência (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select nfse_preparar(:'fn');

\echo '--- N3a quem só opera Contratos muda os parâmetros (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nbs_padrao":"113021000","p_tot_trib_sn":"6"}'::jsonb);
\echo '=== N3b quem gere salva (esperado: producao_restrita, conferir, série 1, opção 3, regime 1, 3507605, próximo 1)'
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select r->>'ambiente' as ambiente, r->>'modo' as modo, r->>'serie' as serie, r->>'op_simples' as op, r->>'reg_ap_trib_sn' as reg,
       r->>'codigo_municipio' as municipio, r->>'nbs_padrao' as nbs, r->>'p_tot_trib_sn' as ptot, r->>'proximo_ndps' as proximo
  from (select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nbs_padrao":"1.1302.10.00","p_tot_trib_sn":"6",
                                         "inscricao_municipal":"12345"}'::jsonb) r) x;
\echo '--- N3c produção sem confirmar os testes (deve falhar)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","ambiente":"producao","nbs_padrao":"113021000","p_tot_trib_sn":"6"}'::jsonb);
\echo '--- N3d série 50000, fora da faixa de sistema próprio (deve falhar)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","serie":"50000"}'::jsonb);
\echo '--- N3e empresa não optante do Simples (deve falhar)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","op_simples":"1"}'::jsonb);
\echo '--- N3f NBS com 8 números (deve falhar)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nbs_padrao":"11302100"}'::jsonb);
\echo '--- N3g ISS pelo Simples com regime especial (deve falhar)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","reg_ap_trib_sn":"1","reg_esp_trib":"6"}'::jsonb);
\echo '--- N3h gravar direto na tabela de parâmetros (deve falhar)'
update nfse_parametros set ambiente = 'producao';
\echo '--- N3i outra empresa (não é a da gestão) (deve falhar)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-0000000000c1","nbs_padrao":"113021000"}'::jsonb);

\echo '=== N4 conferência pronta (quem só vê): tomador, 171901, NBS, valor, % do Simples, ISS no DAS (esperado: pronto t, pode_emitir f)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select (x->>'pronto')::boolean as pronto, x->>'pode_emitir' as pode_emitir, x->>'ambiente' as ambiente,
       x->'dps'->'tomador'->>'documento' as tomador, x->'dps'->'tomador'->>'email' as email,
       x->'dps'->'servico'->>'cTribNac' as ctribnac, x->'dps'->'servico'->>'cNBS' as nbs, x->'dps'->>'dCompet' as dcompet,
       x->'dps'->'valores'->>'vServ' as vserv, x->'dps'->'valores'->>'pTotTribSN' as ptot, x->'iss'->>'valor_estimado' as iss_37_01,
       x->'dps'->'prestador'->>'cnpj' as prestador, x->'dps'->'servico'->>'descricao' like '%· Fatura 2028/%· Vencimento 20/05/2028' as descricao_ok
  from (select nfse_preparar(:'fn') x) y;
\echo '=== N4b código do serviço com 4 números e tomador sem CNPJ viram pendências (esperado: 2)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e464",
  "descricao":"Honorários sem documento","valor":"100","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"servico_descricao":"Contabilidade","servico_codigo":"17.19","iss_aliquota":"2"}'::jsonb)->>'id') as ksd \gset
select jsonb_array_length(nfse_preparar((select id from fin_faturas where recorrente_id = :'ksd'))->'pendencias') as pendencias_2;

\echo '--- N5a o login da tela chama a reserva do nDPS (deve falhar)'
select nfse_reservar(:'fn', null);
\echo '--- N5b o login da tela grava um resultado (deve falhar)'
select nfse_registrar_resultado(gen_random_uuid(), '{"situacao":"emitida"}'::jsonb);
\echo '--- N5c fatura com pendência não reserva nDPS, nem pela Função Edge (deve falhar)'
reset role;
set role service_role;
select nfse_reservar((select id from fin_faturas where recorrente_id = :'ksd'), null);

\echo '=== N6 a Função Edge reserva no ambiente de teste: nDPS 1 e Id de 45 posições (esperado: id_ok t, 45)'
select r->>'emissao' as em1, r->>'id_dps' as id1, r->>'ndps' as n1, r->>'reenvio' as reenvio1
  from (select nfse_reservar(:'fn', '00000000-0000-0000-0000-000000000e41') r) x \gset
select :'id1' = 'DPS' || '3507605' || '2' || '48140121000165' || '00001' || '000000000000001' as id_ok, length(:'id1') as tamanho,
       :'n1' as ndps_1, :'reenvio1' as reenvio_false;
\echo '--- N6b segunda reserva enquanto a primeira está sendo enviada (deve falhar)'
select nfse_reservar(:'fn', null);

\echo '=== N7 recusa no ambiente de teste: guarda as mensagens e a fatura não muda (esperado: rejeitada, 1, aguardando_nf, a_emitir)'
select nfse_registrar_resultado(:'em1', '{"situacao":"rejeitada","mensagem":"O código NBS não combina com o serviço (E0312)",
  "mensagens":[{"codigo":"E0312","descricao":"NBS incompatível","complemento":null,"texto":"O código NBS não combina com o serviço"}]}'::jsonb)->>'situacao' as resultado;
select e.situacao, jsonb_array_length(e.mensagens) as mensagens, f.situacao as fatura, f.nfse_situacao
  from nfse_emissoes e join fin_faturas f on f.id = e.fatura_id where e.id = :'em1';
\echo '--- N7b gravar de novo o resultado da mesma emissão (deve falhar)'
select nfse_registrar_resultado(:'em1', '{"situacao":"emitida","chave":"1","xml_caminho":"x"}'::jsonb);
\echo '--- N7c resultado emitida sem a chave de 50 números (deve falhar)'
select r->>'emissao' as em2 from (select nfse_reservar(:'fn', null) r) x \gset
select nfse_registrar_resultado(:'em2', '{"situacao":"emitida","chave":"123","xml_caminho":"a/b/nfse-emitidas/x.xml"}'::jsonb);

\echo '=== N8 nova tentativa usa o nDPS 2; nota de TESTE emitida não marca a fatura nem publica no Portal (esperado: 2, true, a_emitir, pendente)'
select ndps as ndps_2 from nfse_emissoes where id = :'em2';
select nfse_registrar_resultado(:'em2', jsonb_build_object('situacao', 'emitida', 'numero', '15',
  'chave', '35076052248140121000165' || lpad('15', 13, '0') || '2805' || '123456789' || '1',
  'xml_caminho', :'org' || '/' || :'mdc' || '/nfse-emitidas/2028/05/teste.xml'))->>'teste' as teste;
select f.nfse_situacao, f.nfse_numero is null as sem_numero, (select situacao from fin_envios where fatura_id = f.id and canal = 'portal') as portal
  from fin_faturas f where f.id = :'fn';

\echo '=== N9 produção: gerir confirma e começa no 100; resultado incerto põe a fatura em "erro" (esperado: producao, 100, erro, aguardando_nf)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select r->>'ambiente' as ambiente, r->>'proximo_ndps' as proximo_100
  from (select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","ambiente":"producao","confirmo_producao":true,
          "nbs_padrao":"113021000","p_tot_trib_sn":"6","inscricao_municipal":"12345","proximo_ndps":100}'::jsonb) r) x;
reset role;
set role service_role;
select r->>'emissao' as em3, r->>'id_dps' as id3 from (select nfse_reservar(:'fn', '00000000-0000-0000-0000-000000000e41') r) x \gset
select right(:'id3', 15) = '000000000000100' as ndps_100;
select nfse_registrar_resultado(:'em3', '{"situacao":"erro","mensagem":"O Emissor Nacional não respondeu a tempo"}'::jsonb)->>'fatura_situacao' as fatura;
select nfse_situacao from fin_faturas where id = :'fn';
\echo '--- N9b cancelar a fatura com o resultado incerto em produção (deve falhar)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_fatura_cancelar(:'fn', 'Cliente pediu para cancelar');
\echo '=== N9c nova tentativa reaproveita a mesma DPS (esperado: mesma emissão, 100, tentativa 2, reenvio true)'
reset role;
set role service_role;
select r->>'emissao' = :'em3' as mesma, r->>'ndps' as ndps, r->>'tentativa' as tentativa, r->>'reenvio' as reenvio
  from (select nfse_reservar(:'fn', null) r) x;

\echo '=== N10 emitida em produção: fatura com o número, Portal publicado e histórico (esperado: emitida, 16, enviada — só Portal —, enviado)'
select nfse_registrar_resultado(:'em3', jsonb_build_object('situacao', 'emitida', 'numero', '16',
  'chave', '35076052248140121000165' || lpad('16', 13, '0') || '2805' || '123456789' || '2',
  'xml_caminho', :'org' || '/' || :'mdc' || '/nfse-emitidas/2028/05/nota16.xml'))->>'fatura_situacao' as fatura_situacao;
select f.nfse_situacao, f.nfse_numero, f.situacao, (select situacao from fin_envios where fatura_id = f.id and canal = 'portal') as portal
  from fin_faturas f where f.id = :'fn';
select count(*) > 0 as no_historico from fin_recorrente_eventos where recorrente_id = :'kn' and texto like 'Nota fiscal nº 16 emitida%';
select count(*) as auditoria_4 from hub_auditoria where acao in ('nfse_emitida', 'nfse_rejeitada', 'nfse_erro');
\echo '--- N10b reservar de novo a fatura já emitida (deve falhar)'
select nfse_reservar(:'fn', null);
\echo '--- N10c cancelar a fatura com nota emitida (deve falhar)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select fin_fatura_cancelar(:'fn', 'Cliente pediu para cancelar');
\echo '--- N10d apagar a emissão, mesmo pelo banco (deve falhar)'
reset role;
delete from nfse_emissoes where id = :'em3';
\echo '--- N10e mudar o nDPS de uma emissão (deve falhar)'
update nfse_emissoes set ndps = 999 where id = :'em1';
\echo '--- N10f emissão emitida voltar para enviando (deve falhar)'
update nfse_emissoes set situacao = 'enviando' where id = :'em3';
\echo '--- N10g próximo nDPS abaixo do último usado (deve falhar)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","ambiente":"producao","nbs_padrao":"113021000",
  "p_tot_trib_sn":"6","proximo_ndps":50}'::jsonb);
\echo '--- N10h gravar direto numa emissão pela tela (deve falhar)'
update nfse_emissoes set mensagem = 'x' where id = :'em1';

\echo '=== N11 leitura: quem vê Contratos lê as emissões; quem só tem o Financeiro não (esperado: 3 e 0)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select count(*) as contratos_ve_3 from nfse_emissoes;
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select count(*) as financeiro_0 from nfse_emissoes;

\echo '=== N12 bucket fiscal: Contratos (ver) lê nfse-emitidas e não as notas de entrada; o Financeiro lê as duas (esperado: t f t t)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select app.fis_caminho_pode(:'org' || '/' || :'mdc' || '/nfse-emitidas/2028/05/nota16.xml', 'ver') as contratos_emitidas,
       app.fis_caminho_pode(:'org' || '/' || :'mdc' || '/nfe/2028/05/entrada.xml', 'ver') as contratos_entradas;
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select app.fis_caminho_pode(:'org' || '/' || :'mdc' || '/nfse-emitidas/2028/05/nota16.xml', 'ver') as financeiro_emitidas,
       app.fis_caminho_pode(:'org' || '/' || :'mdc' || '/nfe/2028/05/entrada.xml', 'ver') as financeiro_entradas;

\echo '=== N13 duas faturas ao mesmo tempo recebem nDPS diferentes (esperado: numeros_distintos_2)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e462",
  "descricao":"Corrida NFS-e A","valor":"10","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"servico_descricao":"Contabilidade","servico_codigo":"171901","iss_aliquota":"2"}'::jsonb)->>'id') as ka \gset
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e463",
  "descricao":"Corrida NFS-e B","valor":"10","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"servico_descricao":"Contabilidade","servico_codigo":"171901","iss_aliquota":"2"}'::jsonb)->>'id') as kb \gset
reset role;
select id as fa from fin_faturas where recorrente_id = :'ka' \gset
select id as fb from fin_faturas where recorrente_id = :'kb' \gset
select dblink_connect('na', :'conexao') as a, dblink_connect('nb', :'conexao') as b;
select dblink_exec('na', 'set role service_role; set teste.hoje = ''2028-05-10''') as a, dblink_exec('nb', 'set role service_role; set teste.hoje = ''2028-05-10''') as b;
select dblink_exec('na', 'begin') as a, dblink_exec('nb', 'begin') as b;
select x as ndps_a from dblink('na', format('select nfse_reservar(%L) ->> ''ndps''', :'fa')) t(x text);
select dblink_send_query('nb', format('select nfse_reservar(%L) ->> ''ndps''', :'fb')) as enviado;
select dblink_exec('na', 'commit') as a_commit;
select x as ndps_b from dblink_get_result('nb') as t(x text);
select count(*) as fim from dblink_get_result('nb') as t(x text);
select dblink_exec('nb', 'commit') as b_commit;
select dblink_disconnect('na'), dblink_disconnect('nb');
select count(distinct ndps) as numeros_distintos_2, min(ndps) > 100 as depois_do_100 from nfse_emissoes where fatura_id in (:'fa', :'fb');
reset teste.hoje;
