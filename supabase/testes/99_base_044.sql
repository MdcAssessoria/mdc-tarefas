-- Base para a 044 (painel de certificados): a tabela da 013 (certificado da organização para os demonstrativos) não faz
-- parte da base simulada; aqui ela é criada igual à de produção, com um certificado de exemplo. O da 032 (notas fiscais
-- por empresa) já vem do teste 50_fiscal.
create table if not exists public.hub_certificados (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  titular text not null, documento_final text, emissor text, icp_brasil boolean not null default false,
  valido_de timestamptz, valido_ate timestamptz, pfx_secret uuid not null, senha_secret uuid not null,
  enviado_por uuid, enviado_em timestamptz not null default now()
);
alter table public.hub_certificados enable row level security;
insert into hub_certificados (org_id, titular, documento_final, emissor, icp_brasil, valido_ate, pfx_secret, senha_secret)
values ('00000000-0000-0000-0000-0000000000a1', 'MDC ASSESSORIA LTDA', '48140121000165', 'AC TESTE', true,
        now() + interval '20 days', gen_random_uuid(), gen_random_uuid()) on conflict do nothing;
