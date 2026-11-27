-- 125 · Auditoria fiscal vira módulo próprio do HUB (pedido do Edvaldo, 27/11/2026: "melhor estar fora do acesso do
-- Balancete"). Antes (122) a tela ficava em Demonstrativos e usava a permissão de Demonstrativos; agora tem a
-- ferramenta `auditoria_fiscal` em Pessoas e acessos (ver = histórico e resultados; operar = enviar o relatório do SAP).
-- Ninguém herda o acesso de Demonstrativos: o administrador libera a ferramenta para quem faz a auditoria
-- (administrador já vê tudo). A tela muda de /demonstrativos/auditoria-fiscal para /auditoria-fiscal.

insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem)
values ('auditoria_fiscal', 'Auditoria fiscal',
        'Relatório fiscal do SAP conferido pelo Ledgra Auditor: CFOP, CST, NCM, impostos e XML do fornecedor',
        'escudo', '/auditoria-fiscal', 'ativo', false, 32)
on conflict (slug) do update set nome = excluded.nome, descricao = excluded.descricao, icone = excluded.icone,
  rota = excluded.rota, status = excluded.status, externo = excluded.externo, ordem = excluded.ordem;

drop policy if exists "ler auditorias_erp" on public.auditorias_erp;
create policy "ler auditorias_erp" on public.auditorias_erp for select to authenticated
  using ((select app.hub_pode(org_id, 'auditoria_fiscal', 'ver')));

create or replace function public.auditoria_erp_pode(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and app.hub_pode(p_org, 'auditoria_fiscal', 'operar')
$$;
comment on function public.auditoria_erp_pode(uuid) is
  'A Função ledgra-auditoria confere se quem chamou pode enviar o relatório do SAP (Auditoria fiscal › operar, 125).';

-- Regras de validação (27/11/2026): a tela Auditoria fiscal › Regras de validação lê e grava as regras próprias e as
-- utilizações do ERP que ficam no Ledgra (uma biblioteca só), pela Função ledgra-regras. Ver = Auditoria fiscal › ver;
-- gravar = Auditoria fiscal › operar (no Ledgra vale também a permissão de lá: equipe MDC).
create or replace function public.auditoria_regras_pode(p_org uuid, p_gravar boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and app.hub_pode(p_org, 'auditoria_fiscal', case when p_gravar then 'operar' else 'ver' end)
$$;
revoke all on function public.auditoria_regras_pode(uuid, boolean) from public, anon;
grant execute on function public.auditoria_regras_pode(uuid, boolean) to authenticated;
comment on function public.auditoria_regras_pode(uuid, boolean) is
  'A Função ledgra-regras confere se quem chamou pode ver (ver) ou gravar (operar) as regras de validação (125).';
