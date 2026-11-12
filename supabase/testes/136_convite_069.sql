-- Testes da 069: convite e link de criar senha para conta que ainda não tem senha (mesmo já confirmada pelo link).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
alter table auth.users add column if not exists encrypted_password text;
insert into auth.users (id, email, invited_at, email_confirmed_at, last_sign_in_at, encrypted_password) values
  ('00000000-0000-0000-0000-000000000f61', 'travado@exemplo.com', now(), now(), now(), ''),   -- abriu o link e não criou a senha
  ('00000000-0000-0000-0000-000000000f62', 'pendente@exemplo.com', now(), null, null, null),  -- convidado, nunca abriu
  ('00000000-0000-0000-0000-000000000f63', 'ativo@exemplo.com', now(), now(), now(), 'hash'), -- já criou a senha
  ('00000000-0000-0000-0000-000000000f64', 'sozinho@exemplo.com', null, now(), now(), '');     -- conta sem convite
insert into membros (org_id, user_id, nome, papel, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f61', 'Travado', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f62', 'Pendente', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f63', 'Ativo', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f64', 'Sozinho', 'analista', true)
on conflict do nothing;
set teste.uid = '00000000-0000-0000-0000-000000000e40';
set teste.membro = 'admin';
set role authenticated;
\echo '=== V1 confirmada pelo link e sem senha: administrador reenvia e gera link (esperado: t | t)'
select hub_pode_enviar_convite('travado@exemplo.com') as envia, hub_pode_ver_link_convite('travado@exemplo.com') as link;
\echo '=== V2 convidada que nunca abriu: continua podendo (esperado: t | t)'
select hub_pode_enviar_convite('pendente@exemplo.com') as envia, hub_pode_ver_link_convite('pendente@exemplo.com') as link;
\echo '=== V3 já criou a senha: nem convite nem link (esperado: f | f)'
select hub_pode_enviar_convite('ativo@exemplo.com') as envia, hub_pode_ver_link_convite('ativo@exemplo.com') as link;
\echo '=== V4 conta que não veio de convite: não recebe convite (esperado: f)'
select hub_pode_enviar_convite('sozinho@exemplo.com') as envia;
reset role;
set teste.membro = 'analista';
set role authenticated;
\echo '=== V5 quem não é administrador não reenvia nem gera link da equipe (esperado: f | f)'
select hub_pode_enviar_convite('travado@exemplo.com') as envia, hub_pode_ver_link_convite('travado@exemplo.com') as link;
reset role;
set teste.uid = '';
set role authenticated;
\echo '=== V6 sem login (esperado: f | f)'
select hub_pode_enviar_convite('travado@exemplo.com') as envia, hub_pode_ver_link_convite('travado@exemplo.com') as link;
reset role;
