-- Testes da 085: contrato de licença (modelo, emissão numerada, link de assinatura, assinatura em papel, cancelar).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';

set teste.uid = '00000000-0000-0000-0000-0000000085e1';
set role authenticated;
\echo '--- C1 quem só vê emite contrato (deve falhar)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 1, t085_sig(), 'eletronico');
\echo '--- C2 gravar direto na tabela (deve falhar)'
insert into lic_contrato_documentos (org_id, contrato_id, numero, texto, hash, signatario, modo)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000085c1', 'X', 'x', 'x', '{}', 'impresso');
\echo '--- C3 quem só vê muda o modelo (deve falhar)'
select lic_contrato_modelo_salvar('00000000-0000-0000-0000-0000000000a1', repeat('texto {{contratante_razao}} ', 20));
reset role;

set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
\echo '=== C4 quem gere grava o modelo duas vezes (esperado: 1 e 2)'
select lic_contrato_modelo_salvar('00000000-0000-0000-0000-0000000000a1', repeat('texto {{contratante_razao}} ', 20)) as v1;
select lic_contrato_modelo_salvar('00000000-0000-0000-0000-0000000000a1', repeat('texto novo {{contratante_razao}} ', 20)) as v2;
select count(*) as versoes_guardadas from lic_contrato_modelo_versoes;
\echo '--- C5 modelo sem o nome do cliente (deve falhar)'
select lic_contrato_modelo_salvar('00000000-0000-0000-0000-0000000000a1', repeat('texto sem cliente ', 20));
reset role;

set teste.uid = '00000000-0000-0000-0000-0000000085e2';
set role authenticated;
\echo '--- C5b quem só opera (sem a permissão de valores) emite (deve falhar)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 1, t085_sig(), 'eletronico');
\echo '--- C5c quem só opera lê os contratos emitidos (esperado: 0)'
select count(*) as visiveis from lic_contrato_documentos;
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
\echo '--- C6 CPF inválido (deve falhar)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 1, '{"nome":"Maria da Silva","cpf":"111.111.111-11"}'::jsonb, 'eletronico');
\echo '--- C7 licença encerrada (deve falhar)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c2', t085_texto(), 1, t085_sig(), 'eletronico');
\echo '--- C8 texto com variável sobrando (deve falhar)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto() || ' {{valor}}', 1, t085_sig(), 'eletronico');
\echo '=== C9 quem gere emite (esperado: LIC-<ano>/0001, número no texto, hash de 64, e-mail minúsculo)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 2, t085_sig(), 'eletronico')->>'numero' as numero;
select numero = 'LIC-' || extract(year from current_date) || '/0001' as numero_ok, texto like '%LIC-%' and texto not like '%{{%' as texto_ok,
       length(hash) as hash, signatario->>'email' as email, signatario->>'cpf' as cpf, situacao from lic_contrato_documentos;
\echo '--- C10 segundo contrato para a mesma licença (deve falhar)'
select lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 2, t085_sig(), 'impresso');
\echo '--- C11 a equipe não lê o hash do link (deve falhar)'
select link_hash from lic_contrato_documentos;
\echo '=== C12 gera o link (esperado: 48 letras, situação enviado)'
select length(lic_documento_link((select id from lic_contrato_documentos))) as tamanho;
select situacao, link_expira_em > now() + interval '14 days' as vale_15_dias from lic_contrato_documentos;
reset role;

-- guarda um token conhecido para a parte pública (o mesmo que a função faria)
update lic_contrato_documentos set link_hash = encode(extensions.digest(repeat('ab', 24), 'sha256'), 'hex');
set role anon;
\echo '=== C13 o cliente abre o link sem login (esperado: enviado | LIC | 25 | texto)'
select r->>'situacao' as situacao, left(r->>'numero', 3) as numero, r->>'cpf_final' as cpf_final, length(r->>'texto') > 100 as tem_texto
  from (select lic_assinatura_abrir(repeat('ab', 24)) as r) x;
\echo '=== C14 token errado não revela nada (esperado: invalido, sem texto)'
select lic_assinatura_abrir(repeat('cd', 24))->>'situacao' as situacao, lic_assinatura_abrir(repeat('cd', 24)) ? 'texto' as tem_texto;
\echo '--- C15 sem marcar "Li e concordo" (deve falhar)'
select lic_assinatura_aceitar(repeat('ab', 24), 'Maria da Silva', '52998224725', false);
\echo '=== C16 CPF de outra pessoa conta tentativa (esperado: f | 9)'
select r->>'ok' as ok, r->>'restam' as restam from (select lic_assinatura_aceitar(repeat('ab', 24), 'Maria da Silva', '39053344705', true) as r) x;
\echo '--- C17 anônimo lê a tabela (deve falhar)'
select count(*) from lic_contrato_documentos;
\echo '--- C18 anônimo emite (deve falhar)'
select lic_documento_link((select '00000000-0000-0000-0000-000000000000'::uuid));
\echo '=== C19 assina com o CPF certo (esperado: t)'
select lic_assinatura_aceitar(repeat('ab', 24), 'Maria da Silva', '529.982.247-25', true)->>'ok' as ok;
\echo '--- C20 assinar de novo (deve falhar)'
select lic_assinatura_aceitar(repeat('ab', 24), 'Maria da Silva', '52998224725', true);
reset role;
select situacao, assinatura->>'tipo' as tipo, assinatura->>'cpf' as cpf, link_tentativas from lic_contrato_documentos;

select id as doc085 from lic_contrato_documentos \gset
set teste.uid = '00000000-0000-0000-0000-0000000085e2';
set role authenticated;
\echo '--- C21 quem só opera cancela o contrato (deve falhar)'
select lic_documento_cancelar(:'doc085', 'cliente pediu mudança');
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000085e3';
set role authenticated;
\echo '--- C22 cancelar sem motivo (deve falhar)'
select lic_documento_cancelar((select id from lic_contrato_documentos), 'ok');
\echo '=== C23 quem gere cancela com motivo e emite de novo em papel (esperado: LIC-…/0002 | emitido)'
select lic_documento_cancelar((select id from lic_contrato_documentos), 'cliente pediu mudança no plano');
select right(lic_documento_emitir('00000000-0000-0000-0000-0000000085c1', t085_texto(), 2, t085_sig(), 'impresso')->>'numero', 4) as seq;
\echo '--- C24 link para contrato em papel (deve falhar)'
select lic_documento_link((select id from lic_contrato_documentos where situacao = 'emitido'));
\echo '--- C25 assinatura com data no futuro (deve falhar)'
select lic_documento_assinatura_registrar((select id from lic_contrato_documentos where situacao = 'emitido'), current_date + 1);
\echo '=== C26 registra a assinatura em papel (esperado: assinado | impresso)'
select lic_documento_assinatura_registrar((select id from lic_contrato_documentos where situacao = 'emitido'), current_date, 'via física no arquivo');
select situacao, assinatura->>'tipo' as tipo from lic_contrato_documentos where numero like '%/0002';
reset role;
