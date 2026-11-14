-- Testes da 078: família só com Tarefas e Finanças; conta do cadastro aberto fora da equipe e do Portal; travas.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
select id as fam from organizacoes where nome = 'Família Silva Souza' \gset
select gestao_cliente_id as cli from organizacoes where nome = 'Família Silva Souza' \gset
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '=== S1 na família a dona é admin, mas só Tarefas e Finanças valem (esperado: t | t | f | f | f | f)'
select app.hub_pode(:'fam', 'tarefas', 'gerir') tarefas, app.hub_pode(:'fam', 'financeiro', 'gerir') financeiro,
       app.hub_pode(:'fam', 'contratos', 'gerir') contratos, app.hub_pode_algum(:'fam', array['comercial','licencas'], 'ver') outros,
       app.eh_gestor(:'fam') gestor, public.fis_pode(:'cli', 'gerir') fiscal;
\echo '=== S2 hub_pode_algum com financeiro no meio continua valendo (esperado: t)'
select app.hub_pode_algum(:'fam', array['entradas','financeiro'], 'operar');
\echo '--- S3 mudar o fuso da família pela API (deve falhar)'
update organizacoes set fuso = 'Marte/Base' where id = :'fam';
\echo '--- S4 apagar o criado_por para furar o limite (deve falhar)'
update organizacoes set criado_por = null where id = :'fam';
\echo '=== S5 código errado conta tentativa e devolve vazio (esperado: vazio | 1)'
select pessoal_aceitar_convite('ZZZZ-ZZZZ') is null as vazio;
reset role;
select count(*) as tentativas from app.pessoal_tentativas where user_id = '00000000-0000-0000-0000-0000000075e1';
\echo '--- S6 a 11a tentativa errada na mesma hora (deve falhar)'
insert into app.pessoal_tentativas (user_id) select '00000000-0000-0000-0000-0000000075e1' from generate_series(1, 9);
set role authenticated;
select pessoal_aceitar_convite('ZZZZ-ZZZY');
reset role;
\echo '--- S7 reativar quem saiu da família direto pela API (deve falhar)'
set role authenticated;
update membros set ativo = true where org_id = :'fam' and user_id = '00000000-0000-0000-0000-0000000075e2';
reset role;
\echo '--- S8 conta do cadastro aberto entrando na equipe da MDC (deve falhar)'
insert into membros (org_id, user_id, nome, papel) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000078e1', 'Aberto', 'analista');
\echo '--- S9 conta do cadastro aberto entrando no Portal (deve falhar)'
insert into portal_usuarios (user_id, cliente_id, org_id) values ('00000000-0000-0000-0000-0000000078e1', null, '00000000-0000-0000-0000-0000000000a1');
\echo '=== S10 e-mail com convite pendente não pode virar conta do Pessoal; e-mail livre pode (esperado: f | t)'
insert into app.convites (org_id, email) values ('00000000-0000-0000-0000-0000000000a1', 'pendente.078@exemplo.com') on conflict do nothing;
select pessoal_email_livre('Pendente.078@exemplo.com ') as pendente, pessoal_email_livre('livre.078@exemplo.com') as livre;
\echo '=== S11 conta nova do cadastro aberto com e-mail convidado NÃO herda o convite (esperado: 0 | 1)'
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-0000000078e2', 'pendente.078@exemplo.com', '{"origem":"pessoal"}');
select count(*) as membros_herdados from membros where user_id = '00000000-0000-0000-0000-0000000078e2';
select count(*) as convite_continua from app.convites where email = 'pendente.078@exemplo.com';
\echo '=== S12 "Você tem empresa?" responde sempre "recebido" (esperado: recebido)'
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_quero_contato(:'fam', '{"cnpj":"26.255.288/0001-39","razao_social":"Quarta 078","autorizo":true,"termo_versao":1}');
\echo '--- S13 a tela lê a situação do pedido (deve falhar)'
select situacao from pessoal_contatos_empresa limit 1;
\echo '--- S14 aviso para endereço que não é serviço de aviso (deve falhar)'
select pessoal_push_inscrever('https://atacante.exemplo.com/x', repeat('B', 87), repeat('a', 22));
\echo '=== S15 serviço de aviso do Google aceito (esperado: 1)'
select pessoal_push_inscrever('https://fcm.googleapis.com/fcm/send/abc', repeat('B', 87), repeat('a', 22));
select pessoal_push_aparelhos();
\echo '--- S16 outra conta tenta tomar o aparelho (deve falhar)'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select pessoal_push_inscrever('https://fcm.googleapis.com/fcm/send/abc', repeat('C', 87), repeat('b', 22));
reset role;
\echo '=== S17 família com fuso quebrado não para as outras (esperado: sem erro, número >= 0)'
update organizacoes set fuso = 'Marte/Base' where id = :'fam';
select app.pessoal_resumo_rodar('2030-04-01 10:00-03') >= 0 as rodou;
update organizacoes set fuso = 'America/Sao_Paulo' where id = :'fam';
