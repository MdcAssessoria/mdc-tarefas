-- Base para a 054 (excluir lead de vez): coluna cliente_id real do CRM, um usuário que só opera o Comercial e as
-- oportunidades de teste (lead simples com histórico, cliente da carteira e lead com contrato assinado).
alter table public.crm_oportunidades add column if not exists cliente_id uuid;
insert into membros (org_id, user_id, nome, papel, ativo)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e54', 'Opera Comercial', 'analista', true);
insert into hub_acessos (org_id, user_id, app, papel)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e54', 'comercial', 'operar');
insert into crm_oportunidades (id, org_id, empresa) values
  ('00000000-0000-0000-0000-0000000054a1', '00000000-0000-0000-0000-0000000000a1', 'Lead de teste'),
  ('00000000-0000-0000-0000-0000000054a2', '00000000-0000-0000-0000-0000000000a1', 'Lead duplicado'),
  ('00000000-0000-0000-0000-0000000054a3', '00000000-0000-0000-0000-0000000000a1', 'Já é cliente'),
  ('00000000-0000-0000-0000-0000000054a4', '00000000-0000-0000-0000-0000000000a1', 'Contrato assinado');
update crm_oportunidades set cliente_id = '00000000-0000-0000-0000-0000000000c3' where id = '00000000-0000-0000-0000-0000000054a3';
insert into crm_atividades (org_id, oportunidade_id, texto) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000054a1', 'Ligou pedindo proposta');
insert into crm_contratos (org_id, oportunidade_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000054a1', 'rascunho'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000054a4', 'assinado');
