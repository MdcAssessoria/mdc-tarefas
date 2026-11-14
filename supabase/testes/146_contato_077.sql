-- Testes da 077: "Você tem empresa?" — autorização de contato da MDC pelo MDC · Pessoal (LGPD) e o lead no Funil.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
select id as fam from organizacoes where nome = 'Família Silva Souza' \gset
select id as mdc from organizacoes where id = '00000000-0000-0000-0000-0000000000a1' \gset
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '=== C1 cartão aparece para a responsável, com o termo versão 1 (esperado: t | t | 1)'
select (s ->> 'responsavel') resp, (s ->> 'mostrar_cartao') cartao, s -> 'termo' ->> 'versao' versao from (select pessoal_empresa_situacao(:'fam') s) x;
\echo '--- C2 sem marcar a autorização (deve falhar)'
select pessoal_quero_contato(:'fam', '{"cnpj":"11.122.233/0001-83","razao_social":"Padaria Souza","termo_versao":1}');
\echo '--- C3 termo antigo (deve falhar)'
select pessoal_quero_contato(:'fam', '{"cnpj":"11.122.233/0001-83","razao_social":"Padaria Souza","autorizo":true,"termo_versao":0}');
\echo '--- C4 CNPJ inválido (deve falhar)'
select pessoal_quero_contato(:'fam', '{"cnpj":"11.122.233/0001-00","razao_social":"Padaria Souza","autorizo":true,"termo_versao":1}');
\echo '=== C5 CNPJ novo vira lead no Funil da MDC com origem pessoal, nota da autorização e aviso ao Comercial (esperado: lead_novo | pessoal | t | 1)'
select pessoal_quero_contato(:'fam', '{"cnpj":"11.122.233/0001-83","razao_social":"Padaria Souza Ltda","telefone":"(11) 98888-7777","autorizo":true,"termo_versao":1,"receita":{"nome_fantasia":"Padaria Souza","municipio":"Bragança Paulista","uf":"sp","mei":true}}');
reset role;
select o.origem, o.empresa = 'Padaria Souza' and o.uf = 'SP' and o.regime_atual = 'mei' and o.whatsapp = '11988887777' as dados_ok,
       (select count(*) from crm_atividades a where a.oportunidade_id = o.id and a.texto like '%autorizou o contato%') notas
  from crm_oportunidades o where o.cnpj = '11.122.233/0001-83';
select count(*) > 0 as comercial_avisado from hub_notificacoes where org_id = :'mdc' and titulo like 'Novo lead do MDC · Pessoal%';
\echo '=== C6 a prova fica gravada com o texto do termo (esperado: t | 1)'
select termo_texto like 'Autorizo a MDC%' texto_ok, termo_versao from pessoal_contatos_empresa where cnpj = '11122233000183';
\echo '--- C7 o mesmo CNPJ de novo (deve falhar)'
set role authenticated;
select pessoal_quero_contato(:'fam', '{"cnpj":"11122233000183","razao_social":"Padaria Souza Ltda","autorizo":true,"termo_versao":1}');
\echo '=== C8 CNPJ que já é cliente da MDC não vira lead (esperado: ja_cliente e nenhuma oportunidade nova)'
select pessoal_quero_contato(:'fam', '{"cnpj":"44555666000181","razao_social":"Cliente 077","autorizo":true,"termo_versao":1}');
reset role;
select count(*) as oportunidades from crm_oportunidades where regexp_replace(coalesce(cnpj,''), '[^0-9]', '', 'g') = '44555666000181';
\echo '=== C9 CNPJ que já está no Funil ganha só a anotação (esperado: lead_existente | 1 oportunidade | 1 nota)'
set role authenticated;
select pessoal_quero_contato(:'fam', '{"cnpj":"77788899000183","razao_social":"Lead aberto 077","autorizo":true,"termo_versao":1}');
reset role;
select count(*) as oportunidades, (select count(*) from crm_atividades a join crm_oportunidades o on o.id = a.oportunidade_id
  where o.cnpj = '77.788.899/0001-83' and a.texto like '%MDC · Pessoal%') as notas
  from crm_oportunidades where cnpj = '77.788.899/0001-83';
\echo '--- C10 quarta empresa da família (deve falhar)'
set role authenticated;
select pessoal_quero_contato(:'fam', '{"cnpj":"26255288000139","razao_social":"Quarta","autorizo":true,"termo_versao":1}');
\echo '--- C11 a família lê o Funil da MDC (esperado: 0 linhas)'
select count(*) as leads_vistos from crm_oportunidades;
\echo '--- C12 gravar a autorização direto na tabela (deve falhar)'
insert into pessoal_contatos_empresa (org_id, user_id, cnpj, razao_social, nome, email, termo_versao, termo_texto, situacao)
values (:'fam', '00000000-0000-0000-0000-0000000075e1', '26255288000139', 'X', 'X', 'x@x.com', 1, 'x', 'lead_novo');
\echo '=== C13 retirar a autorização arquiva o lead que veio dela e anota (esperado: t | t)'
select pessoal_retirar_contato((select id from pessoal_contatos_empresa where cnpj = '11122233000183'));
reset role;
select arquivado_em is not null as arquivado, (select count(*) > 0 from crm_atividades a where a.oportunidade_id = o.id and a.texto like '%retirou a autorização%') anotado
  from crm_oportunidades o where o.cnpj = '11.122.233/0001-83';
\echo '=== C14 o lead que já existia não é arquivado por quem só autorizou depois (esperado: f)'
set role authenticated;
select pessoal_retirar_contato((select id from pessoal_contatos_empresa where cnpj = '77788899000183'));
reset role;
select arquivado_em is not null as arquivado from crm_oportunidades where cnpj = '77.788.899/0001-83';
\echo '--- C15 outra conta retira a autorização da família (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select pessoal_retirar_contato((select id from pessoal_contatos_empresa limit 1));
\echo '--- C16 quem não é da família pede contato por ela (deve falhar)'
select pessoal_quero_contato(:'fam', '{"cnpj":"26255288000139","razao_social":"X","autorizo":true,"termo_versao":1}');
\echo '=== C17 Agora não esconde o cartão (esperado: f)'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_empresa_adiar(:'fam');
select pessoal_empresa_situacao(:'fam') ->> 'mostrar_cartao' as cartao;
reset role;
