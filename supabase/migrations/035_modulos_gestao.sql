-- =====================================================================================================
--  035 · Módulos de gestão separados (decisão do Edvaldo, 01/11/2026, modelo Conta Azul/Omie)
--
--  Financeiro, Entradas, Saídas, Estoque, Centros de custo, Plano de contas e Relatórios viraram módulos próprios no
--  menu (ferramentas em hub_apps, 034) e nas licenças (031). Os dados de gestão do cliente (fornecedores, categorias,
--  bancos, títulos, estoque, notas) são compartilhados entre os módulos: quem usa Saídas precisa gerar contas a receber
--  e mexer no estoque; quem usa Entradas precisa gerar contas a pagar.
--
--  Regra desta migração (a mais simples que não quebra nenhum fluxo):
--  - EQUIPE: as checagens antigas com a ferramenta "financeiro" passam a aceitar QUALQUER ferramenta de gestão no nível
--    pedido. O que cada pessoa vê no menu continua separado por ferramenta (hub_meus_apps), então liberar só "Estoque"
--    mostra só o Estoque; no banco ela pode gravar o que o Estoque precisa (inclusive títulos de um pedido).
--  - PORTAL: o cliente com a permissão "financeiro" no Portal usa os dados de gestão se tiver contrato ativo de
--    QUALQUER módulo de gestão e não estiver bloqueado (antes exigia o módulo "financeiro").
--  Separação fina por tabela (ex.: só Financeiro grava títulos avulsos) fica para depois, se o Edvaldo quiser.
-- =====================================================================================================

create or replace function app.modulos_gestao()
returns text[] language sql immutable set search_path = '' as $$
  select array['financeiro', 'entradas', 'saidas', 'estoque', 'centros_custo', 'plano_contas', 'relatorios']
$$;
comment on function app.modulos_gestao() is 'Ferramentas/módulos de gestão do cliente (vendidos separadamente; dados compartilhados).';

-- Regra única da equipe. "financeiro" passou a significar "qualquer módulo de gestão" (ver cabeçalho).
create or replace function app.hub_pode(p_org uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.papel(p_org) is null then false
    when app.papel(p_org) = 'admin' then true
    else exists (
      select 1 from public.hub_acessos a
       where a.org_id = p_org and a.user_id = auth.uid()
         and (a.app = p_app or (p_app = 'financeiro' and a.app = any (app.modulos_gestao())))
         and (a.expira_em is null or a.expira_em >= app.hoje(p_org))
         and app.hub_peso(a.papel) >= app.hub_peso(p_min))
  end
$$;
comment on function app.hub_pode(uuid, text, text) is
  'Regra única de acesso da equipe: admin = tudo; senão hub_acessos (ver < operar < gerir), respeitando expira_em. '
  'Pedido "financeiro" aceita qualquer módulo de gestão (035). Usada pelas políticas RLS.';

-- Cliente pode usar os dados de gestão no Portal: algum módulo de gestão contratado e sem bloqueio.
create or replace function app.cliente_tem_gestao(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(app.modulos_gestao()) m where app.cliente_tem_modulo(p_cliente, m))
$$;
revoke all on function app.cliente_tem_gestao(uuid) from public, anon;
grant execute on function app.cliente_tem_gestao(uuid) to authenticated;

create or replace function app.fin_pode(p_cliente uuid, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', p_min))
      or (p_min in ('ver', 'operar') and app.portal_pode(p_cliente, 'financeiro') and app.cliente_tem_gestao(p_cliente))
$$;
comment on function app.fin_pode(uuid, text) is
  'Dados de gestão do cliente: equipe com qualquer módulo de gestão no nível pedido, ou pessoa do cliente no Portal com a '
  'permissão financeiro (ver/operar) quando o cliente tem contrato ativo de algum módulo de gestão e não está bloqueado (035).';

drop policy if exists fin_contas_ver_portal on public.fin_contas_bancarias;
create policy fin_contas_ver_portal on public.fin_contas_bancarias for select to authenticated
  using (app.portal_pode(cliente_id, 'financeiro') and app.cliente_tem_gestao(cliente_id));
drop policy if exists fin_plano_ver_portal on public.fin_plano_contas;
create policy fin_plano_ver_portal on public.fin_plano_contas for select to authenticated
  using (app.portal_pode(cliente_id, 'financeiro') and app.cliente_tem_gestao(cliente_id));
