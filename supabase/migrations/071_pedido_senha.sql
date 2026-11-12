-- 071: "esqueci a senha" pelo e-mail do HUB (Microsoft Graph), com limite de pedidos (12/11/2026).
-- A Função "senha" (pública) pergunta aqui se pode mandar o link: no máximo 3 pedidos por e-mail por hora e 60 no total
-- por hora (contra quem tenta encher a caixa de alguém ou descobrir quem tem conta). A resposta para a tela é sempre a
-- mesma; só a Função sabe se a conta existe. Só a Função (service_role) chama; nada aqui é aberto ao navegador.
create table if not exists app.senha_pedidos (
  id bigint generated always as identity primary key,
  email text not null,
  em timestamptz not null default now()
);
create index if not exists senha_pedidos_email_em on app.senha_pedidos (email, em);
alter table app.senha_pedidos enable row level security;
revoke all on app.senha_pedidos from public, anon, authenticated;

create or replace function public.hub_pedir_senha(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return false; end if;
  if (select count(*) from app.senha_pedidos where em > now() - interval '1 hour') >= 60 then return false; end if;
  if (select count(*) from app.senha_pedidos where email = v_email and em > now() - interval '1 hour') >= 3 then return false; end if;
  insert into app.senha_pedidos (email) values (v_email);
  delete from app.senha_pedidos where em < now() - interval '7 days';
  return exists (select 1 from auth.users u where lower(u.email) = v_email);
end $$;
revoke all on function public.hub_pedir_senha(text) from public, anon, authenticated;
grant execute on function public.hub_pedir_senha(text) to service_role;
