-- Testes da 083: "Excluir minha conta" do MDC · Pessoal (passo do banco).
-- O apagar da família inteira (pessoa sozinha) depende das ligações on delete cascade de produção, que a base simulada
-- não tem: foi conferido em produção numa simulação desfeita no fim (14/11/2026). Aqui: confirmação, conta da empresa
-- barrada e a saída de uma família com mais gente (a outra pessoa vira responsável).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
alter table membros add column if not exists criado_em timestamptz not null default now();
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000075e6', 'dupla.um@exemplo.com', '{"nome":"Bia"}'),
  ('00000000-0000-0000-0000-0000000075e7', 'dupla.dois@exemplo.com', '{"nome":"Caio"}')
on conflict (id) do nothing;
set teste.membro = '';
set teste.uid = '00000000-0000-0000-0000-0000000075e6';
set role authenticated;
select pessoal_criar_familia('Casa Dupla') is not null as criou;
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e6';
set role authenticated;
select pessoal_convidar((select id from organizacoes where nome = 'Casa Dupla'), 'Caio', 'lancar') as c \gset
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e7';
set role authenticated;
select pessoal_aceitar_convite(:'c') is not null as entrou;
reset role;
update membros set criado_em = now() + interval '1 minute' where user_id = '00000000-0000-0000-0000-0000000075e7';

\echo '--- X1 sem escrever EXCLUIR (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000075e6';
set role authenticated;
select pessoal_excluir_conta_preparar('sim');
\echo '--- X2 conta que também é do HUB da empresa (deve falhar)'
reset role;
select m.user_id as staff from membros m join organizacoes o on o.id = m.org_id
 where o.tipo is distinct from 'pessoal' and m.ativo limit 1 \gset
set teste.uid = :'staff';
set role authenticated;
select pessoal_excluir_conta_preparar('EXCLUIR');
\echo '--- X3 visitante sem login (deve falhar)'
reset role;
set role anon;
select pessoal_excluir_conta_preparar('EXCLUIR');
\echo '=== X4 a responsável sai da família com mais gente (esperado: {"familias_apagadas": 0, "familias_que_saiu": 1})'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e6';
set role authenticated;
select pessoal_excluir_conta_preparar(' excluir ');
reset role;
\echo '=== X5 a família continua e o Caio virou responsável; a Bia saiu (esperado: t | admin | 0 | 1)'
select exists (select 1 from organizacoes where nome = 'Casa Dupla') as familia,
       (select papel::text from membros m join organizacoes o on o.id = m.org_id where o.nome = 'Casa Dupla' and m.user_id = '00000000-0000-0000-0000-0000000075e7') as caio,
       (select count(*) from membros where user_id = '00000000-0000-0000-0000-0000000075e6') as bia,
       (select count(*) from app.pessoal_exclusoes) as registro;
