-- Testes da 052: NFS-e no modo automático (token do agendador, faturas pendentes, uma tentativa por dia, aviso no sino,
-- recusa fica para a tela, ligar pede confirmação) e papel timbrado do escritório (só administrador, auditado).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
-- Usuários (95_base_041): e1 administrador, e41 Contratos operar, e42 só ver, e43 gerir. "Hoje" = 10/05/2028.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2028-05-10';
\set org '00000000-0000-0000-0000-0000000000a1'
\set mdc '00000000-0000-0000-0000-000000000c41'

\echo '=== A1 token do agendador: o certo confere, o errado não (esperado: t f f)'
select decrypted_secret as tok from vault.decrypted_secrets where name = 'nfse_automatica_token' \gset
set role service_role;
select nfse_token_confere(:'tok') as certo,
       nfse_token_confere(repeat('0', 64)) as errado, coalesce(nfse_token_confere(null), false) as vazio;
\echo '--- A1b o login da tela confere o token (deve falhar)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
set teste.membro = 'analista';
select nfse_token_confere('x');

\echo '=== A2 agendamento das 06h45 criado (esperado: 45 9 * * *, chama nfse-automatica com o token)'
reset role;
select schedule, command like '%functions/v1/nfse-automatica%' and command like '%nfse_automatica_token%' as chama_funcao
  from cron.job where jobname = 'nfse-automatica';

\echo '=== A3 contrato novo com NFS-e gera a fatura de 05/2028 aguardando a nota (esperado: a_emitir)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select (fin_recorrente_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","pessoa":"00000000-0000-0000-0000-00000000e461",
  "descricao":"Honorários automáticos","valor":"500","dia":20,"categoria":"00000000-0000-0000-0000-00000000d402","vigencia_inicio":"2028-05-01",
  "documento":"nfse","envio":"nf_fatura","dia_geracao":1,"servico_descricao":"Contabilidade mensal","servico_codigo":"17.19.01","iss_aliquota":"2","boleto_banco":"itau"}'::jsonb)->>'id') as kauto \gset
reset role;
select id as fauto, numero as nauto from fin_faturas where recorrente_id = :'kauto' \gset
select nfse_situacao from fin_faturas where id = :'fauto';

\echo '=== A4 modo conferir: nada para emitir sozinho (esperado: 0)'
set role service_role;
select jsonb_array_length(nfse_auto_pendentes()) as pendentes_0;

\echo '--- A5a ligar o automático sem confirmar (deve falhar)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","modo":"automatico"}'::jsonb);
\echo '--- A5b quem só opera Contratos liga o automático (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","modo":"automatico","confirmo_automatico":true}'::jsonb);
\echo '=== A5c quem gere liga com a confirmação (esperado: automatico)'
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","modo":"automatico","confirmo_automatico":true}'::jsonb)->>'modo' as modo;
\echo '=== A5d salvar de novo sem mexer no modo não pede a confirmação (esperado: automatico)'
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","nbs_padrao":"113021000"}'::jsonb)->>'modo' as modo;

\echo '=== A6 a fatura nova entra na lista de hoje, no ambiente configurado (esperado: t, producao)'
reset role;
set role service_role;
select exists (select 1 from jsonb_array_elements(nfse_auto_pendentes()) x where x->>'fatura' = :'fauto') as incluida,
       (select x->>'ambiente' from jsonb_array_elements(nfse_auto_pendentes()) x where x->>'fatura' = :'fauto') as ambiente;
\echo '--- A6b o login da tela pede a lista (deve falhar)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select nfse_auto_pendentes();
\echo '--- A6c o login da tela grava uma tentativa (deve falhar)'
select nfse_auto_registrar(:'fauto', 'emitida');

\echo '=== A7 pendência registrada: avisa no sino quem gere e o administrador, não quem só opera (esperado: pendencia, t t f)'
reset role;
set role service_role;
select nfse_auto_registrar(:'fauto', 'pendencia', 'Informe nos parâmetros o código NBS do serviço (9 números)') as resultado;
reset role;
select exists (select 1 from hub_notificacoes where user_id = '00000000-0000-0000-0000-000000000e43'
                and titulo = 'Contratos: nota fiscal automática não saiu' and texto like 'Fatura ' || :'nauto' || '%') as gerir_avisado,
       exists (select 1 from hub_notificacoes where user_id = '00000000-0000-0000-0000-0000000000e1'
                and titulo = 'Contratos: nota fiscal automática não saiu') as admin_avisado,
       exists (select 1 from hub_notificacoes where user_id = '00000000-0000-0000-0000-000000000e41'
                and titulo = 'Contratos: nota fiscal automática não saiu') as operar_avisado;

\echo '=== A8 só uma tentativa por dia: a segunda volta "repetido" e a fatura sai da lista de hoje (esperado: repetido, f, 1)'
set role service_role;
select nfse_auto_registrar(:'fauto', 'erro', 'outra') as segunda;
select exists (select 1 from jsonb_array_elements(nfse_auto_pendentes()) x where x->>'fatura' = :'fauto') as ainda_na_lista;
reset role;
select count(*) as tentativas_1 from nfse_auto_tentativas where fatura_id = :'fauto';

\echo '=== A9 no dia seguinte volta para a lista (esperado: t)'
set teste.hoje = '2028-05-11';
set role service_role;
select exists (select 1 from jsonb_array_elements(nfse_auto_pendentes()) x where x->>'fatura' = :'fauto') as volta_amanha;

\echo '=== A10 recusada pelo Emissor: fica para a tela, não entra mais na lista automática (esperado: f)'
select r->>'emissao' as erec from (select nfse_reservar(:'fauto', null) r) x \gset
select nfse_registrar_resultado(:'erec', '{"situacao":"rejeitada","mensagem":"NBS incompatível (E0312)"}'::jsonb)->>'situacao' as rejeitada;
set teste.hoje = '2028-05-12';
select exists (select 1 from jsonb_array_elements(nfse_auto_pendentes()) x where x->>'fatura' = :'fauto') as recusada_na_lista;

\echo '=== A11 desligar o automático: a lista fica vazia (esperado: conferir, 0)'
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select nfse_parametros_salvar('{"cliente":"00000000-0000-0000-0000-000000000c41","modo":"conferir"}'::jsonb)->>'modo' as modo;
reset role;
set role service_role;
select jsonb_array_length(nfse_auto_pendentes()) as pendentes_0;

\echo '--- A12a gravar direto uma tentativa (deve falhar)'
reset role;
set role authenticated;
insert into nfse_auto_tentativas (fatura_id, dia, org_id, cliente_id, ambiente, resultado) values (:'fauto', '2028-06-01', :'org', :'mdc', 'producao', 'emitida');
\echo '--- A12b apagar o histórico das tentativas (deve falhar)'
reset role;
delete from nfse_auto_tentativas where fatura_id = :'fauto';
\echo '=== A12c quem vê Contratos lê as tentativas (esperado: 1)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select count(*) as tentativas_1 from nfse_auto_tentativas where fatura_id = :'fauto';
reset role;
reset teste.hoje;

\echo '=== P1 papel timbrado da MDC já nasce com os dados de hoje (esperado: telefone, CRC)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select telefone, crc, responsavel from org_papel_timbrado where org_id = :'org';
\echo '--- P2a quem não é administrador muda o papel timbrado (deve falhar)'
select org_papel_timbrado_salvar(:'org', '{"telefone":"(11) 0000-0000"}'::jsonb);
\echo '--- P2b gravar direto na tabela (deve falhar)'
update org_papel_timbrado set telefone = 'x' where org_id = :'org';
\echo '=== P3 o administrador muda; fica na auditoria (esperado: (11) 4033-0000, 1SP346098-O/0, t)'
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select r->>'telefone' as telefone, r->>'crc' as crc
  from (select org_papel_timbrado_salvar(:'org', '{"telefone":"(11) 4033-0000","site":"mdcassessoria.com","email":"Contato@MDCAssessoria.com",
          "instagram":"@mdcassessoria_","responsavel":"Edvaldo Ribeiro de Carvalho","crc":"1sp346098-o/0"}'::jsonb) r) x;
reset role;
select exists (select 1 from hub_auditoria where acao = 'papel_timbrado' and alvo = :'org') as auditado,
       (select email from org_papel_timbrado where org_id = :'org') as email_minusculo;
\echo '--- P3b e-mail inválido (deve falhar)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select org_papel_timbrado_salvar(:'org', '{"email":"sem-arroba"}'::jsonb);
reset role;
