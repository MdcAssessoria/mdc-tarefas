-- 064: Contratos › Ledgra Link — cadastro das empresas e contas bancárias no Ledgra Link pelo HUB.
-- A Função Edge ledgra-link confere esta permissão com o login de quem pediu antes de cadastrar empresa (titular),
-- termo de autorização, conta, certificado digital ou credencial de API do banco. Os dados ficam no Ledgra Link; no HUB
-- fica só o PDF do termo (hub-arquivos, <org>/ledgra-link/termos/…), gravado pela função.
create or replace function public.link_pode_cadastrar(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.hub_pode(p_org, 'contratos', 'gerir');
$$;
comment on function public.link_pode_cadastrar(uuid) is
  'A Função Edge ledgra-link confere com o login de quem pediu (Contratos › gerir) antes de cadastrar no Ledgra Link.';

revoke all on function public.link_pode_cadastrar(uuid) from public, anon;
grant execute on function public.link_pode_cadastrar(uuid) to authenticated;
