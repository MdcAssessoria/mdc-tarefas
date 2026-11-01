-- =====================================================================================================
--  034 · Financeiro v2 (Frente 4): transferência entre contas bancárias e módulos separados no menu
--
--  Pedido do Edvaldo (01/11/2026), modelo Conta Azul/Omie: o HUB de gestão passa a ter módulos separados, cada um
--  com item próprio no menu lateral e liberável por cliente (Financeiro, Entradas, Saídas, Estoque, Centros de custo,
--  Plano de contas, Relatórios). A separação das permissões (RLS) por módulo é feita na integração; aqui as tabelas
--  continuam usando app.fin_pode (ferramenta "financeiro").
--
--  fin_transferencias  dinheiro que passou de uma conta bancária para outra da MESMA empresa (não é receita nem
--                      despesa). Grava só pelas funções fin_transferir e fin_estornar_transferencia (security
--                      definer, conferem app.fin_pode operar, contas ativas e da mesma empresa, auditoria).
--                      Nada se apaga: o estorno marca, com motivo.
--
--  NÃO APLICAR pela frente: quem integra aplica com aprovação do Edvaldo.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- módulos do menu
insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem) values
  ('entradas', 'Entradas', 'Notas recebidas e compras', 'importar', '/entradas', 'ativo', false, 36),
  ('saidas', 'Saídas', 'Vendas e notas emitidas', 'enviar', '/saidas', 'ativo', false, 37),
  ('estoque', 'Estoque', 'Itens, saldos e movimentações de estoque', 'caixa', '/estoque', 'ativo', false, 38),
  ('centros_custo', 'Centros de custo', 'Centros de custo de cada empresa', 'etiqueta', '/centros-custo', 'ativo', false, 39),
  ('plano_contas', 'Plano de contas', 'Plano do Domínio e categorias de despesa e receita', 'lista', '/plano-contas', 'ativo', false, 40),
  ('relatorios', 'Relatórios', 'Relatórios gerenciais: resultado de caixa, fluxo, pagos e recebidos, centros de custo', 'grafico', '/relatorios', 'ativo', false, 41)
on conflict (slug) do nothing;

update public.hub_apps
   set descricao = 'Painel, contas a pagar e a receber, entradas e saídas de caixa, bancos, transferências e extratos'
 where slug = 'financeiro';

-- ------------------------------------------------------------------------------------- transferências
create table if not exists public.fin_transferencias (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  origem_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  destino_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  data date not null,
  valor numeric(14, 2) not null check (valor > 0),
  observacao text,
  estornada boolean not null default false,
  estornada_em timestamptz,
  estorno_motivo text,
  por uuid,
  em timestamptz not null default now(),
  constraint fin_transferencias_contas_diferentes check (origem_id <> destino_id),
  constraint fin_transferencias_estorno_com_motivo check (not estornada or length(trim(coalesce(estorno_motivo, ''))) > 0)
);
create index if not exists fin_transferencias_cliente on public.fin_transferencias (org_id, cliente_id, data);
create index if not exists fin_transferencias_origem on public.fin_transferencias (origem_id);
create index if not exists fin_transferencias_destino on public.fin_transferencias (destino_id);

drop trigger if exists cliente_mesma_org on public.fin_transferencias;
create trigger cliente_mesma_org before insert or update on public.fin_transferencias
  for each row execute function app.tg_cliente_mesma_org();

alter table public.fin_transferencias enable row level security;
drop policy if exists fin_ver on public.fin_transferencias;
create policy fin_ver on public.fin_transferencias for select to authenticated using (app.fin_pode(cliente_id, 'ver'));
-- sem política de insert/update/delete: grava só pelas funções abaixo

comment on table public.fin_transferencias is
  'Transferência entre duas contas bancárias da mesma empresa (sai de uma, entra na outra). Não é receita nem despesa. Grava só por fin_transferir / fin_estornar_transferencia; nada se apaga.';
comment on column public.fin_transferencias.origem_id is 'Conta de onde o dinheiro saiu.';
comment on column public.fin_transferencias.destino_id is 'Conta para onde o dinheiro foi.';
comment on column public.fin_transferencias.estornada is 'Estornada (lançada por engano): deixa de contar, mas fica guardada com o motivo.';

create or replace function public.fin_transferir(p_origem uuid, p_destino uuid, p_data date, p_valor numeric, p_obs text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare o fin_contas_bancarias; d fin_contas_bancarias; v_valor numeric := round(p_valor, 2); v_id bigint;
begin
  select * into o from fin_contas_bancarias where id = p_origem;
  select * into d from fin_contas_bancarias where id = p_destino;
  if o.id is null or d.id is null then raise exception 'Conta bancária não encontrada'; end if;
  if not app.fin_pode(o.cliente_id, 'operar') then raise exception 'Sem permissão para transferir no Financeiro desta empresa'; end if;
  if o.id = d.id then raise exception 'Escolha contas diferentes para a origem e o destino'; end if;
  if o.cliente_id <> d.cliente_id then raise exception 'As duas contas precisam ser da mesma empresa'; end if;
  if not o.ativo or not d.ativo then raise exception 'Conta bancária inativa: ative a conta antes de transferir'; end if;
  if p_data is null then raise exception 'Informe a data da transferência'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor da transferência'; end if;

  insert into fin_transferencias (org_id, cliente_id, origem_id, destino_id, data, valor, observacao, por)
  values (o.org_id, o.cliente_id, o.id, d.id, p_data, v_valor, nullif(trim(p_obs), ''), auth.uid())
  returning id into v_id;
  perform app.registrar(o.org_id, 'financeiro', 'transferir', v_id::text, null,
    jsonb_build_object('origem', o.id, 'destino', d.id, 'data', p_data, 'valor', v_valor));
  return v_id;
end $$;
revoke all on function public.fin_transferir(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.fin_transferir(uuid, uuid, date, numeric, text) to authenticated;
comment on function public.fin_transferir(uuid, uuid, date, numeric, text) is
  'Registra uma transferência entre duas contas ativas e diferentes da mesma empresa (equipe ou Portal com operar).';

create or replace function public.fin_estornar_transferencia(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t fin_transferencias;
begin
  select * into t from fin_transferencias where id = p_id for update;
  if t.id is null then raise exception 'Transferência não encontrada'; end if;
  if not app.fin_pode(t.cliente_id, 'operar') then raise exception 'Sem permissão para estornar'; end if;
  if t.estornada then raise exception 'Esta transferência já foi estornada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  update fin_transferencias set estornada = true, estornada_em = now(), estorno_motivo = trim(p_motivo) where id = t.id;
  perform app.registrar(t.org_id, 'financeiro', 'estornar_transferencia', t.id::text, to_jsonb(t), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.fin_estornar_transferencia(bigint, text) from public, anon;
grant execute on function public.fin_estornar_transferencia(bigint, text) to authenticated;
comment on function public.fin_estornar_transferencia(bigint, text) is
  'Estorna uma transferência (marca, não apaga), com motivo; fica na auditoria.';
