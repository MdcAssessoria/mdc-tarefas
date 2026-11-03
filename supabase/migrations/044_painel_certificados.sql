-- 044 — Painel "Certificados digitais" (Vencimentos › Certificados digitais): os dois cofres numa lista só.
--
-- Pedido do Edvaldo (03/11/2026, "manter os dois"): o HUB continua guardando os certificados que ele mesmo usa
-- (assinatura dos demonstrativos — 013 — e notas fiscais por empresa — 032, ambos no Supabase Vault) e o Ledgra Link
-- guarda os certificados bancários no cofre dele. O painel mostra os dois juntos, com a origem de cada um.
--
--   cert_painel(p_org)                 certificados do HUB, SÓ os dados públicos (nunca o arquivo nem a senha)
--   link_pode_ver_certificados(p_org)  a Função Edge ledgra-link confere, com o login de quem pediu, antes de buscar no
--                                      Ledgra Link os certificados bancários (o HUB não lê o banco do Ledgra Link direto:
--                                      o add-on é independente e só fala pela API)
-- Quem vê: quem tem Vencimentos › ver (a mesma regra da página de vencimentos).

create or replace function public.cert_painel(p_org uuid)
returns table (
  origem text,          -- 'demonstrativos' | 'notas'
  cliente_id uuid,      -- null = certificado da própria organização (MDC)
  titular text,
  documento text,
  emissor text,
  icp_brasil boolean,
  valido_de timestamptz,
  valido_ate timestamptz,
  enviado_em timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.hub_pode(p_org, 'vencimentos', 'ver') then
    raise exception 'Sem permissão para ver os certificados digitais';
  end if;
  return query
    select 'demonstrativos'::text, null::uuid, h.titular, h.documento_final, h.emissor, h.icp_brasil, h.valido_de,
           h.valido_ate, h.enviado_em
      from public.hub_certificados h
     where h.org_id = p_org
    union all
    select 'notas'::text, f.cliente_id, f.titular, f.cnpj, f.emissor, f.icp_brasil, f.valido_de, f.valido_ate, f.enviado_em
      from public.fis_certificados f
     where f.org_id = p_org
    order by 8 nulls last;
end $$;
comment on function public.cert_painel(uuid) is
  'Painel de certificados: os do cofre do HUB (demonstrativos e notas fiscais), só dados públicos. Vencimentos › ver.';

create or replace function public.link_pode_ver_certificados(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.hub_pode(p_org, 'vencimentos', 'ver');
$$;
comment on function public.link_pode_ver_certificados(uuid) is
  'A Função Edge ledgra-link confere com o login de quem pediu antes de buscar os certificados bancários no Ledgra Link.';

revoke all on function public.cert_painel(uuid), public.link_pode_ver_certificados(uuid) from public, anon;
grant execute on function public.cert_painel(uuid), public.link_pode_ver_certificados(uuid) to authenticated;
