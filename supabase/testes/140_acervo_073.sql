-- Testes da 073: acervo de documentos societários do cliente (guardar, substituir, editar, retirar).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-0000000073e1';
set role authenticated;
\echo '--- D1 quem só vê o Societário guarda no acervo (deve falhar)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f1', 'contrato_social');
\echo '--- D2 gravar direto na tabela (deve falhar)'
insert into soc_documentos (org_id, cliente_id, arquivo_id, categoria) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000073f1', 'contrato_social');
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000073e2';
set role authenticated;
\echo '=== D3 quem opera guarda o contrato social do cliente 1 (esperado: contrato_social | t)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f1', 'contrato_social', 'Contrato de constituição', '2020-03-10', 'NIRE 35212345678') is not null as guardou;
select categoria, vigente from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1';
\echo '--- D4 o mesmo arquivo de novo (deve falhar)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f1', 'contrato_social');
\echo '--- D5 tipo de documento inválido (deve falhar)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f2', 'qualquer', null, null, null, '00000000-0000-0000-0000-0000000073a1');
\echo '=== D6 anexo do processo 1 vira alteração e substitui o contrato (esperado: novo t, antigo f e aponta para o novo)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f2', 'alteracao_contratual', '3ª alteração', '2026-11-10', 'nº 123.456/26-0',
  '00000000-0000-0000-0000-0000000073a1', (select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1')) is not null as guardou;
select (select vigente from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f2') as novo,
       (select vigente from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1') as antigo,
       (select substituido_por = (select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f2')
          from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1') as aponta,
       (select cliente_id = '00000000-0000-0000-0000-0000000000c1' from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f2') as cliente_do_processo;
\echo '--- D7 substituir documento de outro cliente (deve falhar)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f3', 'cartao_cnpj', null, null, null, null,
  (select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f2'));
\echo '--- D8 processo ainda sem cliente (deve falhar)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f4', 'outro', null, null, null, '00000000-0000-0000-0000-0000000073a2');
\echo '--- D9 arquivo de outro cliente usado no processo 1 (deve falhar)'
select soc_documento_guardar('00000000-0000-0000-0000-0000000073f3', 'outro', null, null, null, '00000000-0000-0000-0000-0000000073a1');
\echo '=== D10 editar a ficha: data e registro (esperado: 2026-11-11 | nº 123.456/26-1)'
select soc_documento_editar((select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f2'),
  'alteracao_contratual', '3ª alteração', '2026-11-11', 'nº 123.456/26-1', true);
select data_documento, registro from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f2';
\echo '--- D11 quem opera tira do acervo (deve falhar)'
select soc_documento_retirar((select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1'), 'documento errado');
reset role;
set teste.membro = 'admin';
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
\echo '--- D12 administrador sem motivo (deve falhar)'
select soc_documento_retirar((select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1'), ' 1 ');
\echo '=== D13 administrador com motivo: sai do acervo, a ficha fica (esperado: t | f)'
select soc_documento_retirar((select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1'), 'Enviado para o cliente errado');
select retirado_em is not null as retirado, vigente from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1';
\echo '--- D14 editar documento retirado (deve falhar)'
select soc_documento_editar((select id from soc_documentos where arquivo_id = '00000000-0000-0000-0000-0000000073f1'), 'contrato_social', null, null, null, true);
reset role;
\echo '=== D15 histórico do processo e auditoria (esperado: eventos 1 | auditoria 4)'
select (select count(*) from soc_eventos where processo_id = '00000000-0000-0000-0000-0000000073a1' and texto like 'Guardado no acervo%') as eventos,
       (select count(*) from hub_auditoria where acao like 'acervo_%') as auditoria;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-0000000073e1';
set role authenticated;
\echo '=== D16 quem só vê lê o acervo (esperado: 2)'
select count(*) as fichas from soc_documentos;
reset role;
