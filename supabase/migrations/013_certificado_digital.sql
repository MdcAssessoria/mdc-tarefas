-- 013 · Certificado digital A1 da organização para assinar os PDFs das demonstrações.
-- O .pfx (base64) e a senha ficam no Supabase Vault (criptografados); a tabela guarda só os dados públicos.
create table if not exists public.hub_certificados (
  org_id          uuid primary key references public.organizacoes(id) on delete cascade,
  titular         text not null,
  documento_final text,
  emissor         text,
  icp_brasil      boolean not null default false,
  valido_de       timestamptz,
  valido_ate      timestamptz,
  pfx_secret      uuid not null,
  senha_secret    uuid not null,
  enviado_por     uuid references auth.users(id) on delete set null,
  enviado_em      timestamptz not null default now()
);
alter table public.hub_certificados enable row level security;
drop policy if exists cert_select on public.hub_certificados;
create policy cert_select on public.hub_certificados for select to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
revoke all on public.hub_certificados from anon;
revoke insert, update, delete on public.hub_certificados from authenticated;

create or replace function public.cert_salvar(p_org uuid, p_user uuid, p_pfx text, p_senha text, p_info jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.hub_certificados;
begin
  select * into v from public.hub_certificados where org_id = p_org;
  if found then
    perform vault.update_secret(v.pfx_secret, p_pfx);
    perform vault.update_secret(v.senha_secret, p_senha);
    update public.hub_certificados set
      titular = p_info->>'titular', documento_final = p_info->>'documento_final', emissor = p_info->>'emissor',
      icp_brasil = coalesce((p_info->>'icp_brasil')::boolean, false),
      valido_de = (p_info->>'valido_de')::timestamptz, valido_ate = (p_info->>'valido_ate')::timestamptz,
      enviado_por = p_user, enviado_em = now()
    where org_id = p_org;
  else
    delete from vault.secrets where name in ('cert_pfx_' || p_org, 'cert_senha_' || p_org);
    insert into public.hub_certificados (org_id, titular, documento_final, emissor, icp_brasil, valido_de, valido_ate, pfx_secret, senha_secret, enviado_por)
    values (p_org, p_info->>'titular', p_info->>'documento_final', p_info->>'emissor', coalesce((p_info->>'icp_brasil')::boolean, false),
            (p_info->>'valido_de')::timestamptz, (p_info->>'valido_ate')::timestamptz,
            vault.create_secret(p_pfx, 'cert_pfx_' || p_org, 'Certificado A1 (base64) para assinar demonstrativos'),
            vault.create_secret(p_senha, 'cert_senha_' || p_org, 'Senha do certificado A1'),
            p_user);
  end if;
  -- vencimento do certificado entra no módulo Vencimentos (avisos aos 60, 30, 7 dias e tarefa de renovação)
  update public.venc_itens set status = 'encerrado'
   where org_id = p_org and cliente_id is null and tipo = 'certificado_a1' and descricao like 'Assinatura dos demonstrativos%' and status = 'ativo';
  insert into public.venc_itens (org_id, tipo, descricao, vence_em, responsavel_id, visivel_cliente, criado_por)
  values (p_org, 'certificado_a1', 'Assinatura dos demonstrativos — ' || (p_info->>'titular'),
          ((p_info->>'valido_ate')::timestamptz at time zone 'America/Sao_Paulo')::date, p_user, false, p_user);
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, depois)
  values (p_org, p_user, 'demonstrativos', 'certificado_cadastrado', p_info->>'titular',
          jsonb_build_object('titular', p_info->>'titular', 'emissor', p_info->>'emissor', 'valido_ate', p_info->>'valido_ate'));
end $$;

create or replace function public.cert_obter(p_org uuid)
returns table (pfx text, senha text, titular text, emissor text, valido_ate timestamptz)
language sql security definer set search_path = '' as $$
  select p.decrypted_secret, s.decrypted_secret, c.titular, c.emissor, c.valido_ate
    from public.hub_certificados c
    join vault.decrypted_secrets p on p.id = c.pfx_secret
    join vault.decrypted_secrets s on s.id = c.senha_secret
   where c.org_id = p_org
$$;

create or replace function public.cert_remover(p_org uuid, p_user uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id in (select pfx_secret from public.hub_certificados where org_id = p_org
                                         union select senha_secret from public.hub_certificados where org_id = p_org);
  delete from public.hub_certificados where org_id = p_org;
  update public.venc_itens set status = 'encerrado'
   where org_id = p_org and cliente_id is null and tipo = 'certificado_a1' and descricao like 'Assinatura dos demonstrativos%' and status = 'ativo';
  insert into public.hub_auditoria (org_id, user_id, app, acao) values (p_org, p_user, 'demonstrativos', 'certificado_removido');
end $$;

-- só o serviço (Edge Functions) executa
revoke execute on function public.cert_salvar(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cert_obter(uuid) from public, anon, authenticated;
revoke execute on function public.cert_remover(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cert_salvar(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.cert_obter(uuid) to service_role;
grant execute on function public.cert_remover(uuid, uuid) to service_role;
