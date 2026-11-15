-- Testes da 086: arquivo do contrato assinado (só com a permissão de valores) e aviso no sino quando assinam pelo link.
-- Roda depois da 156 (usa a licença 85c1). Blocos "(deve falhar)" terminam em ERROR; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
\echo '=== A1 quem gere cancela o contrato assinado e emite outro em papel (esperado: 0003)'
select lic_documento_cancelar((select id from lic_contrato_documentos where situacao = 'assinado'), 'troca para o teste da 086');
select right(lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 2, t085_sig(), 'impresso')->>'numero', 4) as seq;
reset role;
select id as doc3 from lic_contrato_documentos where numero like '%/0003' \gset

set teste.uid = '00000000-0000-0000-0000-0000000085e2';
set role authenticated;
\echo '--- A2 quem só opera registra arquivo na pasta do contrato (deve falhar)'
insert into hub_arquivos (org_id, app, ref_id, nome, caminho) values
  ('00000000-0000-0000-0000-0000000000a1', 'licencas-contrato', :'doc3', 'assinado.pdf', 'a1/licencas-contrato/x/assinado-op.pdf');
reset role;

set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
\echo '=== A3 quem gere guarda o arquivo assinado (esperado: t)'
insert into hub_arquivos (org_id, app, ref_id, nome, caminho) values
  ('00000000-0000-0000-0000-0000000000a1', 'licencas-contrato', :'doc3', 'assinado.pdf', 'a1/licencas-contrato/x/assinado.pdf'),
  ('00000000-0000-0000-0000-0000000000a1', 'licencas-contrato', '00000000-0000-0000-0000-000000000000', 'outro.pdf', 'a1/licencas-contrato/y/outro.pdf');
select count(*) = 2 as guardou from hub_arquivos where app = 'licencas-contrato';
\echo '--- A4 registrar com arquivo de outro contrato (deve falhar)'
select lic_documento_assinatura_registrar(:'doc3', current_date, null, (select id from hub_arquivos where nome = 'outro.pdf'));
\echo '=== A5 registrar a assinatura com o arquivo certo (esperado: assinado | t)'
select lic_documento_assinatura_registrar(:'doc3', current_date, 'via escaneada', (select id from hub_arquivos where nome = 'assinado.pdf'));
select situacao, arquivo_id is not null as tem_arquivo from lic_contrato_documentos where id = :'doc3';
\echo '=== A6 trocar o arquivo depois (anexar) (esperado: sem erro)'
select lic_documento_anexar(:'doc3', (select id from hub_arquivos where nome = 'assinado.pdf'));
reset role;

set teste.uid = '00000000-0000-0000-0000-0000000085e1';
set role authenticated;
\echo '=== A7 quem só vê Licenças não lê o arquivo assinado (esperado: 0)'
select count(*) as arquivos_visiveis from hub_arquivos where app = 'licencas-contrato';
\echo '--- A8 quem só vê anexa (deve falhar)'
select lic_documento_anexar(:'doc3', (select id from hub_arquivos limit 1));
reset role;

\echo '=== A9 cliente assina pelo link: avisa quem emitiu e o administrador (esperado: 3 avisos — quem emitiu e os administradores da base de teste)'
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
select lic_documento_cancelar(:'doc3', 'troca para o teste do link');
select right(lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 2, t085_sig(), 'eletronico')->>'numero', 4) as seq;
select length(lic_documento_link((select id from lic_contrato_documentos where numero like '%/0004'))) as link;
reset role;
update lic_contrato_documentos set link_hash = encode(extensions.digest(repeat('cd', 24), 'sha256'), 'hex') where numero like '%/0004';
delete from hub_notificacoes where app = 'licencas';
set role anon;
select lic_assinatura_aceitar(repeat('cd', 24), 'Maria da Silva', '52998224725', true)->>'ok' as ok;
reset role;
select count(*) as avisos, bool_or(user_id = '00000000-0000-0000-0000-0000000085e3') as quem_emitiu,
       bool_or(user_id = '00000000-0000-0000-0000-0000000000e1') as administrador, min(titulo) as titulo
  from hub_notificacoes where app = 'licencas';
