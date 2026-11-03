\set ON_ERROR_STOP 1
-- Base para a 043 (faturamento dos contratos a receber; roda por último). Entram:
--  · logins do Portal com a permissão 'documentos': e46 do cliente c1 e e47 do cliente c3 (o e2 do c1 só tem 'financeiro');
--  · dados "antigos" de outra empresa, gravados sem os gatilhos (como se fossem de antes da 042), para provar BD-01 e
--    BD-02: certificado A1 do c2 e do c1 (válidos) e um contrato a receber do c2;
--  · um contrato da MDC que sempre falha ao lançar (categoria de despesa num contrato a receber, gravada sem os
--    gatilhos), para provar que um contrato com erro não derruba a rotina;
--  · o certificado e os parâmetros da própria MDC (c41).
insert into clientes (id, org_id, nome) values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'Cliente 3')
on conflict (id) do nothing;
insert into portal_usuarios (user_id, cliente_id, org_id, ativo, permissoes) values
  ('00000000-0000-0000-0000-000000000e46', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', true, array['documentos']),
  ('00000000-0000-0000-0000-000000000e47', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', true, array['documentos']);

set session_replication_role = replica;   -- sem gatilhos: simula dados gravados antes da 042
insert into fis_certificados (cliente_id, org_id, titular, cnpj, valido_ate, pfx_secret, senha_secret) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'CLIENTE 2 LTDA', '99888777000130',
   now() + interval '1 year', gen_random_uuid(), gen_random_uuid());
update fis_certificados set valido_ate = now() + interval '1 year' where cliente_id = '00000000-0000-0000-0000-0000000000c1';
insert into fis_parametros (cliente_id, org_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1')
on conflict do nothing;
update fis_parametros set captura_ativa = true where cliente_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
update fis_dfe_controle set bloqueado_ate = null, proxima_consulta_em = null, em_execucao_ate = null
 where cliente_id = '00000000-0000-0000-0000-0000000000c1';
-- contrato a receber de outra empresa (c2) e contrato da MDC com categoria errada (sempre falha ao lançar)
insert into fin_recorrentes (id, org_id, cliente_id, tipo, pessoa_id, descricao, valor, dia_vencimento, categoria_id, inicio, gerar_desde,
                             mes_cadastro, vigencia_inicio) values
  ('00000000-0000-0000-0000-00000000f431', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 'receber',
   '00000000-0000-0000-0000-00000000e402', 'Contrato de outra empresa', 100, 10, '00000000-0000-0000-0000-00000000d402',
   '2027-12-01', '2027-12-01', '2027-12-01', '2027-12-01'),
  ('00000000-0000-0000-0000-00000000f432', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'receber',
   '00000000-0000-0000-0000-00000000e402', 'Contrato com categoria errada', 100, 10, '00000000-0000-0000-0000-00000000d401',
   '2027-12-01', '2027-12-01', '2027-12-01', '2027-12-01');
set session_replication_role = origin;

insert into fis_certificados (cliente_id, org_id, titular, cnpj, valido_ate, pfx_secret, senha_secret) values
  ('00000000-0000-0000-0000-000000000c41', '00000000-0000-0000-0000-0000000000a1', 'MDC ASSESSORIA LTDA', '48140121000165',
   now() + interval '1 year', gen_random_uuid(), gen_random_uuid());
insert into fis_parametros (cliente_id, org_id) values ('00000000-0000-0000-0000-000000000c41', '00000000-0000-0000-0000-0000000000a1')
on conflict do nothing;
create extension if not exists dblink;
