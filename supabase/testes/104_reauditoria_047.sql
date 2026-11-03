-- Testes da 047 (correções da reauditoria de 03/11/2026): anexos sem apagar e retirada só do administrador (SEG-01),
-- empresa da Gestão só pela função (SEG-02), Contratos sem os cadastros inteiros (SEG-03), NaN no Portal e no Societário
-- (SEG-08) e anexo do Portal só na rotina do próprio cliente (SEG-09).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2027-04-02';
insert into hub_arquivos (id, org_id, app, nome, caminho, cliente_id, visivel_cliente) values
  ('00000000-0000-0000-0000-0000000047f1', '00000000-0000-0000-0000-0000000000a1', 'tarefas', 'holerite.pdf',
   '00000000-0000-0000-0000-0000000000a1/tarefas/t47/holerite.pdf', '00000000-0000-0000-0000-0000000000c1', true);

\echo '--- A1 apagar o registro do anexo, mesmo como administrador (deve falhar)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
set teste.papel = 'gerir';
delete from hub_arquivos where id = '00000000-0000-0000-0000-0000000047f1';
\echo '--- A2 nem o serviço interno apaga o registro (deve falhar)'
reset role;
delete from hub_arquivos where id = '00000000-0000-0000-0000-0000000047f1';
\echo '--- A3 marcar como retirado direto pela API (deve falhar)'
set role authenticated;
update hub_arquivos set retirado_em = now(), retirado_motivo = 'sumir sem rastro' where id = '00000000-0000-0000-0000-0000000047f1';
\echo '--- A4 analista retira anexo (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e45';
set teste.membro = 'analista';
select hub_arquivo_retirar('00000000-0000-0000-0000-0000000047f1', 'enviado para o cliente errado');
\echo '--- A5 administrador sem motivo (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select hub_arquivo_retirar('00000000-0000-0000-0000-0000000047f1', ' 12 ');
\echo '=== A6 administrador com motivo: retira, some do Portal e fica na auditoria (esperado: retirado t, visivel f, auditoria 1)'
select hub_arquivo_retirar('00000000-0000-0000-0000-0000000047f1', 'Enviado para o cliente errado');
reset role;
select retirado_em is not null as retirado, visivel_cliente as visivel, retirado_motivo
  from hub_arquivos where id = '00000000-0000-0000-0000-0000000047f1';
select count(*) as auditoria from hub_auditoria where acao = 'retirar_anexo' and alvo = '00000000-0000-0000-0000-0000000047f1';
\echo '--- A7 retirar de novo (deve falhar)'
set role authenticated;
select hub_arquivo_retirar('00000000-0000-0000-0000-0000000047f1', 'Enviado para o cliente errado');
\echo '--- A8 devolver o anexo retirado ao Portal (deve falhar)'
update hub_arquivos set visivel_cliente = true where id = '00000000-0000-0000-0000-0000000047f1';
\echo '=== A9 arquivo do Storage com registro: ninguém apaga; o envio que falhou (órfão) quem enviou apaga (esperado: com_registro 0, orfao 1)'
reset role;
insert into storage.objects (bucket_id, name, owner_id) values
  ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/tarefas/t47/holerite.pdf', '00000000-0000-0000-0000-0000000000e1'),
  ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/tarefas/t47/falhou.pdf', '00000000-0000-0000-0000-0000000000e1');
set role authenticated;
with x as (delete from storage.objects where name like '%/t47/holerite.pdf' returning 1) select count(*) as com_registro from x;
with x as (delete from storage.objects where name like '%/t47/falhou.pdf' returning 1) select count(*) as orfao from x;

\echo '--- G1 trocar a empresa da Gestão direto pela API, mesmo como administrador (deve falhar)'
update organizacoes set gestao_cliente_id = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-0000000000a1';
\echo '--- G2 gestor troca pela função (deve falhar)'
set teste.membro = 'gestor';
select org_definir_empresa_gestao('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Mudança de empresa');
\echo '--- G3 administrador troca sem motivo (deve falhar)'
set teste.membro = 'admin';
select org_definir_empresa_gestao('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', null);
\echo '--- G4 empresa de outra organização (deve falhar)'
reset role;
insert into organizacoes (id, nome) values ('00000000-0000-0000-0000-0000000047a9', 'Org 47') on conflict do nothing;
insert into clientes (id, org_id, nome) values ('00000000-0000-0000-0000-0000000047c9', '00000000-0000-0000-0000-0000000047a9', 'De fora') on conflict do nothing;
set role authenticated;
select org_definir_empresa_gestao('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000047c9', 'Empresa de outra organização');
\echo '=== G5 repetir a mesma empresa não muda nada nem pede motivo (esperado: c41, auditoria 0)'
select org_definir_empresa_gestao('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', null);
reset role;
select gestao_cliente_id, (select count(*) from hub_auditoria where acao = 'empresa_gestao') as auditoria
  from organizacoes where id = '00000000-0000-0000-0000-0000000000a1';
\echo '=== G6 administrador troca com motivo e volta: registra as duas (esperado: c41, auditoria 2)'
set role authenticated;
select org_definir_empresa_gestao('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Teste de troca');
select org_definir_empresa_gestao('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'Volta para a MDC');
reset role;
select gestao_cliente_id, (select count(*) from hub_auditoria where acao = 'empresa_gestao') as auditoria
  from organizacoes where id = '00000000-0000-0000-0000-0000000000a1';

\echo '=== C1 só Contratos (ver): não lê mais os cadastros pela tabela (esperado: 0, 0, 0, 0)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e42';
set teste.membro = 'analista';
select (select count(*) from fin_pessoas) as pessoas, (select count(*) from fin_categorias) as categorias,
       (select count(*) from fin_centros_custo) as centros, (select count(*) from fin_contas_bancarias) as contas;
\echo '=== C2 pela função: nomes para escolher, sem documento nem e-mail (esperado: pessoas > 0, categorias > 0, sem_documento t)'
select jsonb_array_length(o->'pessoas') > 0 as pessoas, jsonb_array_length(o->'categorias') > 0 as categorias,
       not exists (select 1 from jsonb_array_elements(o->'pessoas') p where p ? 'documento' or p ? 'email') as sem_documento,
       not exists (select 1 from jsonb_array_elements(o->'contas') c where c ? 'agencia' or c ? 'numero') as sem_conta
  from (select fin_recorrente_opcoes('00000000-0000-0000-0000-000000000c41') as o) x;
\echo '=== C3 dados do cliente só de quem tem fatura (esperado: tomadores = clientes com fatura)'
select jsonb_array_length(o->'tomadores') as tomadores,
       (select count(distinct pessoa_id) from fin_faturas where cliente_id = '00000000-0000-0000-0000-000000000c41') as com_fatura
  from (select fin_recorrente_opcoes('00000000-0000-0000-0000-000000000c41') as o) x;
\echo '--- C4 sem o módulo Contratos (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e45';
select fin_recorrente_opcoes('00000000-0000-0000-0000-000000000c41');
\echo '=== C5 quem tem o Financeiro continua lendo os cadastros (esperado: pessoas > 0)'
set teste.uid = '00000000-0000-0000-0000-000000000e44';
set teste.papel = 'operar';
select count(*) > 0 as pessoas from fin_pessoas where cliente_id = '00000000-0000-0000-0000-000000000c41';
set teste.papel = '';

\echo '--- N1 linha de balancete do Portal com NaN (deve falhar)'
reset role;
insert into portal_balancete_linhas (saldo_atual) values ('NaN');
\echo '--- N2 taxa do Societário com NaN (deve falhar)'
insert into soc_taxas (descricao, valor) values ('Junta', 'NaN');
\echo '=== N3 valores normais entram (esperado: 2 linhas)'
insert into portal_balancete_linhas (saldo_atual) values (1234.56) returning saldo_atual;
insert into soc_taxas (descricao, valor) values ('Junta', 180.00) returning valor;

\echo '--- P1 cliente c1 anexa arquivo na rotina do cliente c3 (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000047c1';
insert into hub_arquivos (org_id, app, nome, caminho, cliente_id, visivel_cliente, ref_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'portal', 'guia.pdf', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/p1.pdf',
   '00000000-0000-0000-0000-0000000000c1', true, '00000000-0000-0000-0000-0000000047a3');
\echo '--- P2 cliente c1 com referência inventada (deve falhar)'
insert into hub_arquivos (org_id, app, nome, caminho, cliente_id, visivel_cliente, ref_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'portal', 'guia.pdf', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/p2.pdf',
   '00000000-0000-0000-0000-0000000000c1', true, gen_random_uuid());
\echo '=== P3 na própria rotina, na própria conversa e sem referência pode (esperado: 3 linhas)'
insert into hub_arquivos (org_id, app, nome, caminho, cliente_id, visivel_cliente, ref_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'portal', 'guia.pdf', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/p3.pdf',
   '00000000-0000-0000-0000-0000000000c1', true, '00000000-0000-0000-0000-0000000047a1'),
  ('00000000-0000-0000-0000-0000000000a1', 'portal', 'foto.png', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/p4.png',
   '00000000-0000-0000-0000-0000000000c1', true, '00000000-0000-0000-0000-0000000047b1'),
  ('00000000-0000-0000-0000-0000000000a1', 'portal', 'contrato.pdf', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/p5.pdf',
   '00000000-0000-0000-0000-0000000000c1', true, null)
returning nome;
