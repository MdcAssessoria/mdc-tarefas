\set ON_ERROR_STOP 1
-- Base do BD-04 (reauditoria de 03/11/2026): os testes de títulos, estoque, notas de entrada e transferências (20, 30,
-- 50 e 70) refeitos com a regra que vale em produção desde a 042 — gestão só da empresa da própria organização (MDC,
-- c41) e acesso por módulo (hub_acessos), sem a simulação teste.papel. Roda depois da 052.
--   e51 = Financeiro + Entradas + Estoque (operar); e52 = Financeiro só ver; e53 = Financeiro + Estoque (gerir).
insert into membros (org_id, user_id, nome, papel, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e51', 'Operador da gestão', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e52', 'Leitor do financeiro', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e53', 'Gestor da gestão', 'analista', true)
on conflict do nothing;
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e51', 'financeiro', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e51', 'entradas', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e51', 'estoque', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e52', 'financeiro', 'ver'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e53', 'financeiro', 'gerir'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e53', 'estoque', 'gerir')
on conflict do nothing;
-- plano de contas da MDC: uma conta sintética (não aceita categoria)
insert into fin_plano_contas (id, org_id, cliente_id, classificacao, descricao, analitica) values
  ('00000000-0000-0000-0000-000000004104', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '4.1', 'Despesas (grupo)', false)
on conflict do nothing;
update clientes set uf = coalesce(uf, 'SP'), regime = coalesce(regime, 'real') where id = '00000000-0000-0000-0000-000000000c41';
