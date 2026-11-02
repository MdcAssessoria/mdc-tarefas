\set ON_ERROR_STOP 1
-- Base para a 041 (contratos fixos; roda por último): "hoje" simulado pela configuração teste.hoje (para andar de mês
-- em mês sem esperar o calendário) e a empresa da própria MDC com plano, categorias, fornecedor/cliente, banco e
-- equipe do módulo Contratos: e41 operar, e42 só ver, e43 gerir (recebe os avisos), e44 só com o Financeiro (operar). O administrador e1 já existe (89).
create or replace function app.hoje(p uuid) returns date language sql stable as $$
  select coalesce(nullif(current_setting('teste.hoje', true), '')::date, current_date) $$;

insert into clientes (id, org_id, nome) values ('00000000-0000-0000-0000-000000000c41', '00000000-0000-0000-0000-0000000000a1', 'MDC Assessoria (própria)');
insert into fin_plano_contas (id, org_id, cliente_id, classificacao, descricao, analitica) values
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '4.1.01', 'Aluguéis', true),
  ('00000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '3.1.01', 'Honorários', true),
  ('00000000-0000-0000-0000-000000004103', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '1.1.01', 'Banco', true);
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
  ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'despesa', 'Aluguel', '00000000-0000-0000-0000-000000004101'),
  ('00000000-0000-0000-0000-00000000d402', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'receita', 'Honorários contábeis', '00000000-0000-0000-0000-000000004102');
insert into fin_pessoas (id, org_id, cliente_id, tipo, nome) values
  ('00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'fornecedor', 'Imobiliária Centro'),
  ('00000000-0000-0000-0000-00000000e402', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'cliente', 'Cliente Alfa Ltda');
insert into fin_contas_bancarias (id, org_id, cliente_id, nome, conta_contabil_id) values
  ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', 'Banco MDC', '00000000-0000-0000-0000-000000004103');
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e41', 'contratos', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e42', 'contratos', 'ver'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e43', 'contratos', 'gerir'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e44', 'financeiro', 'operar')
on conflict do nothing;
insert into membros (org_id, user_id, nome, papel, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e41', 'Operador', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e42', 'Leitor', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e43', 'Gestora', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e44', 'Sem financeiro', 'analista', true)
on conflict do nothing;
alter table hub_arquivos add column if not exists ref_id uuid;
