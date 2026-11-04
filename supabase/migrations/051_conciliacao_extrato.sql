-- =====================================================================================================
--  051 · Financeiro › Conciliação do extrato (T-02 da auditoria de 03/11/2026, pedido do Edvaldo de 04/11/2026)
--
--  Cada lançamento importado do extrato (fin_extrato_linhas, 026/036) passa a ser conciliado com o que o HUB já sabe:
--
--   1  fin_conciliacoes + fin_conciliacao_itens: uma linha do extrato ↔ uma ou mais baixas (pagamentos/recebimentos) e/ou
--      transferências. Vários pagamentos num só débito (ou vários recebimentos num só crédito) valem; a soma tem que
--      bater com o valor da linha, centavo por centavo. Juros, multa e desconto entram na própria baixa.
--   2  Quatro jeitos de conciliar (todos por função, com Financeiro: operar, só a empresa da Gestão):
--        · fin_conciliar          — liga a linha a baixas que já existem e/ou dá baixa em contas em aberto;
--        · fin_conciliar_lancar   — cria a conta (a pagar ou a receber) já paga a partir da linha e liga;
--        · fin_conciliar_transferir — cria a transferência entre contas a partir da linha (ou liga a uma que já existe);
--        · fin_extrato_ignorar    — marca a linha como ignorada, com motivo (tarifa já lançada em outro lugar, etc.).
--   3  fin_conciliacao_desfazer: com motivo, a linha volta a "a conciliar". Nada se apaga: a conciliação fica marcada
--      como desfeita, e os pagamentos lançados por ela continuam (estorne em A pagar/A receber se não valem).
--   4  fin_conciliacao_dados: tudo o que a tela precisa de uma vez (linhas do período, pagamentos ainda sem extrato,
--      contas em aberto, transferências sem extrato e os saldos do extrato e do HUB). A sugestão é calculada na tela
--      (dominios/financeiro/conciliacao.ts, com testes); o banco só confere na hora de gravar.
--   5  Estornar transferência conciliada passa a ser recusado (como a baixa já era desde a 028).
--
--  Testes: supabase/testes/111_base_051.sql e 112_conciliacao_051.sql.
-- =====================================================================================================

-- ===================================================================================================== 1 tabelas
create table if not exists public.fin_conciliacoes (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  conta_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  linha_id bigint not null references public.fin_extrato_linhas(id) on delete restrict,
  tipo text not null check (tipo in ('lancamentos', 'transferencia', 'ignorado')),
  valor numeric(15, 2) not null check (valor <> 0 and valor not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  observacao text,
  por uuid,
  em timestamptz not null default now(),
  desfeita boolean not null default false,
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  check (not desfeita or length(trim(coalesce(desfeita_motivo, ''))) > 0),
  check (tipo <> 'ignorado' or length(trim(coalesce(observacao, ''))) > 0)
);
create unique index if not exists fin_conciliacoes_uma_por_linha on public.fin_conciliacoes (linha_id) where not desfeita;
create index if not exists fin_conciliacoes_conta on public.fin_conciliacoes (conta_id, em);
comment on table public.fin_conciliacoes is
  'Conciliação de cada lançamento do extrato (051): lançamentos (baixas), transferência ou ignorado. Uma valendo por linha; desfazer marca, não apaga.';

create table if not exists public.fin_conciliacao_itens (
  id bigint generated always as identity primary key,
  conciliacao_id bigint not null references public.fin_conciliacoes(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  conta_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  baixa_id bigint references public.fin_baixas(id) on delete restrict,
  transferencia_id bigint references public.fin_transferencias(id) on delete restrict,
  valor numeric(15, 2) not null check (valor <> 0 and valor not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  criado_aqui boolean not null default false,
  valendo boolean not null default true,
  check ((baixa_id is null) <> (transferencia_id is null))
);
create unique index if not exists fin_conciliacao_itens_baixa on public.fin_conciliacao_itens (baixa_id) where valendo and baixa_id is not null;
create unique index if not exists fin_conciliacao_itens_transf on public.fin_conciliacao_itens (transferencia_id, conta_id)
  where valendo and transferencia_id is not null;
create index if not exists fin_conciliacao_itens_conc on public.fin_conciliacao_itens (conciliacao_id);
comment on table public.fin_conciliacao_itens is
  'O que cada conciliação ligou (051): baixas (valor com sinal: recebimento +, pagamento −) ou transferências (entrada +, saída −). '
  'criado_aqui = lançado pela própria conciliação. Uma baixa (ou um lado da transferência) só vale numa conciliação.';

alter table public.fin_conciliacoes enable row level security;
alter table public.fin_conciliacao_itens enable row level security;
drop policy if exists fin_ver on public.fin_conciliacoes;
create policy fin_ver on public.fin_conciliacoes for select to authenticated using ((select app.fin_pode(cliente_id, 'ver')));
drop policy if exists fin_ver on public.fin_conciliacao_itens;
create policy fin_ver on public.fin_conciliacao_itens for select to authenticated using ((select app.fin_pode(cliente_id, 'ver')));
revoke all on public.fin_conciliacoes, public.fin_conciliacao_itens from anon;
revoke insert, update, delete, truncate on public.fin_conciliacoes, public.fin_conciliacao_itens from authenticated;
grant select on public.fin_conciliacoes, public.fin_conciliacao_itens to authenticated;
do $$
declare t text;
begin
  foreach t in array array['fin_conciliacoes', 'fin_conciliacao_itens'] loop
    execute format('drop trigger if exists gestao_so_empresa on public.%I', t);
    execute format('create trigger gestao_so_empresa before insert or update of cliente_id on public.%I
                      for each row execute function app.tg_gestao_so_empresa()', t);
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                      for each row execute function app.tg_cliente_mesma_org()', t);
    execute format('drop trigger if exists nada_se_apaga on public.%I', t);
    execute format('create trigger nada_se_apaga before delete on public.%I
                      for each row execute function app.tg_nada_se_apaga(%L)', t, 'desfaça a conciliação (com motivo)');
  end loop;
end $$;

-- ===================================================================================================== 2 ligar (interno)
/** Confere e grava a conciliação de uma linha (sem checar permissão; quem chama já conferiu). */
create or replace function app.fin_conciliar_ligar(p_linha bigint, p_tipo text, p_baixas bigint[], p_transf bigint[],
                                                   p_obs text, p_criadas bigint[] default '{}', p_transf_criada bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l fin_extrato_linhas; v_conc bigint; v_soma numeric := 0; v_n int := 0; r record; v_ids bigint[];
begin
  select * into l from fin_extrato_linhas where id = p_linha for update;
  if l.id is null then raise exception 'Lançamento do extrato não encontrado'; end if;
  if l.situacao <> 'pendente' then raise exception 'Este lançamento do extrato já foi conciliado ou ignorado'; end if;

  -- baixas: da mesma conta, não estornadas, ainda sem extrato
  for r in select b.*, t.tipo as titulo_tipo from fin_baixas b join fin_titulos t on t.id = b.titulo_id
            where b.id = any (coalesce(p_baixas, '{}')) order by b.id for update of b loop
    if r.cliente_id <> l.cliente_id or r.conta_id <> l.conta_id then
      raise exception 'O pagamento escolhido é de outra conta bancária: escolha um desta conta';
    end if;
    if r.estornada then raise exception 'O pagamento escolhido foi estornado'; end if;
    if r.extrato_linha_id is not null then raise exception 'O pagamento escolhido já está conciliado com outro lançamento do extrato'; end if;
    v_soma := v_soma + case when r.titulo_tipo = 'receber' then r.total else -r.total end;
    v_n := v_n + 1;
  end loop;
  if v_n <> coalesce(cardinality(p_baixas), 0) then raise exception 'Um dos pagamentos escolhidos não foi encontrado'; end if;

  -- transferências: esta conta é a origem (saída) ou o destino (entrada); cada lado só concilia uma vez
  v_n := 0;
  for r in select * from fin_transferencias where id = any (coalesce(p_transf, '{}')) order by id for update loop
    if r.cliente_id <> l.cliente_id or l.conta_id not in (r.origem_id, r.destino_id) then
      raise exception 'A transferência escolhida não passa por esta conta bancária';
    end if;
    if r.estornada then raise exception 'A transferência escolhida foi estornada'; end if;
    if exists (select 1 from fin_conciliacao_itens i where i.transferencia_id = r.id and i.conta_id = l.conta_id and i.valendo) then
      raise exception 'A transferência escolhida já está conciliada nesta conta';
    end if;
    v_soma := v_soma + case when r.destino_id = l.conta_id then r.valor else -r.valor end;
    v_n := v_n + 1;
  end loop;
  if v_n <> coalesce(cardinality(p_transf), 0) then raise exception 'Uma das transferências escolhidas não foi encontrada'; end if;

  if coalesce(cardinality(p_baixas), 0) + coalesce(cardinality(p_transf), 0) = 0 then
    raise exception 'Escolha ao menos um pagamento, conta ou transferência para conciliar';
  end if;
  if round(v_soma, 2) <> l.valor then
    raise exception 'A soma escolhida (%) não bate com o valor do extrato (%): ajuste os valores ou registre juros/desconto',
      app.fin_brl(v_soma), app.fin_brl(l.valor);
  end if;

  insert into fin_conciliacoes (org_id, cliente_id, conta_id, linha_id, tipo, valor, observacao, por)
  values (l.org_id, l.cliente_id, l.conta_id, l.id, p_tipo, l.valor, nullif(trim(p_obs), ''), auth.uid())
  returning id into v_conc;
  insert into fin_conciliacao_itens (conciliacao_id, org_id, cliente_id, conta_id, baixa_id, valor, criado_aqui)
  select v_conc, b.org_id, b.cliente_id, l.conta_id, b.id, case when t.tipo = 'receber' then b.total else -b.total end,
         b.id = any (coalesce(p_criadas, '{}'))
    from fin_baixas b join fin_titulos t on t.id = b.titulo_id
   where b.id = any (coalesce(p_baixas, '{}'));
  insert into fin_conciliacao_itens (conciliacao_id, org_id, cliente_id, conta_id, transferencia_id, valor, criado_aqui)
  select v_conc, x.org_id, x.cliente_id, l.conta_id, x.id, case when x.destino_id = l.conta_id then x.valor else -x.valor end,
         x.id is not distinct from p_transf_criada
    from fin_transferencias x where x.id = any (coalesce(p_transf, '{}'));
  update fin_baixas set extrato_linha_id = l.id where id = any (coalesce(p_baixas, '{}'));
  update fin_extrato_linhas set situacao = 'conciliado' where id = l.id;

  select array_agg(id) into v_ids from fin_conciliacao_itens where conciliacao_id = v_conc;
  perform app.registrar(l.org_id, 'financeiro', 'conciliar', l.id::text, null,
    jsonb_build_object('conciliacao', v_conc, 'tipo', p_tipo, 'conta', l.conta_id, 'data', l.data, 'valor', l.valor,
                       'baixas', to_jsonb(coalesce(p_baixas, '{}')), 'transferencias', to_jsonb(coalesce(p_transf, '{}')),
                       'criadas', to_jsonb(coalesce(p_criadas, '{}')), 'obs', nullif(trim(p_obs), '')));
  return jsonb_build_object('conciliacao', v_conc, 'linha', l.id, 'itens', to_jsonb(coalesce(v_ids, '{}')));
end $$;
revoke all on function app.fin_conciliar_ligar(bigint, text, bigint[], bigint[], text, bigint[], bigint) from public, anon, authenticated;

/** Linha do extrato com a permissão conferida (Financeiro: operar, só a empresa da Gestão). */
create or replace function app.fin_linha_para_conciliar(p_linha bigint)
returns public.fin_extrato_linhas language plpgsql security definer set search_path = public as $$
declare l fin_extrato_linhas;
begin
  select * into l from fin_extrato_linhas where id = p_linha;
  if l.id is null then raise exception 'Lançamento do extrato não encontrado'; end if;
  if not app.gestao_pode(l.cliente_id, 'operar', array['financeiro']) then
    raise exception 'Sem permissão para conciliar o extrato (Financeiro, nível operar)';
  end if;
  if l.situacao = 'desfeita' then raise exception 'Este lançamento saiu do extrato (importação desfeita)'; end if;
  if l.situacao <> 'pendente' then raise exception 'Este lançamento do extrato já foi conciliado ou ignorado'; end if;
  return l;
end $$;
revoke all on function app.fin_linha_para_conciliar(bigint) from public, anon, authenticated;

-- ===================================================================================================== 3 conciliar
/**
 * Concilia a linha com pagamentos que já existem (p.baixas: ids) e/ou dá baixa agora em contas em aberto
 * (p.titulos: [{id, valor, juros, multa, desconto}], data e conta = as da linha) e/ou transferências (p.transferencias).
 */
create or replace function public.fin_conciliar(p_linha bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l fin_extrato_linhas; v_baixas bigint[] := '{}'; v_criadas bigint[] := '{}'; v_transf bigint[] := '{}'; x jsonb; t fin_titulos;
  r jsonb; v_b bigint; v_tipo_linha text;
begin
  l := app.fin_linha_para_conciliar(p_linha);
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Escolha o que conciliar'; end if;
  v_tipo_linha := case when l.valor > 0 then 'receber' else 'pagar' end;
  if p ? 'baixas' then
    if jsonb_typeof(p->'baixas') <> 'array' then raise exception 'Pagamentos em formato inválido'; end if;
    select coalesce(array_agg(distinct (e)::bigint), '{}') into v_baixas from jsonb_array_elements_text(p->'baixas') e;
  end if;
  if p ? 'transferencias' then
    if jsonb_typeof(p->'transferencias') <> 'array' then raise exception 'Transferências em formato inválido'; end if;
    select coalesce(array_agg(distinct (e)::bigint), '{}') into v_transf from jsonb_array_elements_text(p->'transferencias') e;
  end if;
  if p ? 'titulos' then
    if jsonb_typeof(p->'titulos') <> 'array' then raise exception 'Contas em formato inválido'; end if;
    for x in select * from jsonb_array_elements(p->'titulos') loop
      select * into t from fin_titulos where id = app.uuid_campo(x->>'id', 'conta');
      if t.id is null or t.cliente_id <> l.cliente_id then raise exception 'Conta a pagar/receber não encontrada nesta empresa'; end if;
      if t.tipo <> v_tipo_linha then
        raise exception 'Entrada no extrato só concilia com conta a receber, e saída só com conta a pagar (%)', t.descricao;
      end if;
      r := public.fin_baixar(t.id, l.data, coalesce(app.numero_campo(x->>'valor', 'valor'), t.valor - t.valor_pago), l.conta_id,
                             coalesce(app.numero_campo(x->>'juros', 'juros'), 0), coalesce(app.numero_campo(x->>'multa', 'multa'), 0),
                             coalesce(app.numero_campo(x->>'desconto', 'desconto'), 0), 'Conciliação do extrato', nullif(trim(p->>'observacao'), ''));
      v_b := (r->>'baixa')::bigint;
      v_baixas := v_baixas || v_b;
      v_criadas := v_criadas || v_b;
    end loop;
  end if;
  return app.fin_conciliar_ligar(l.id, case when cardinality(v_transf) > 0 and cardinality(v_baixas) = 0 then 'transferencia' else 'lancamentos' end,
                                 v_baixas, v_transf, p->>'observacao', v_criadas);
end $$;
comment on function public.fin_conciliar(bigint, jsonb) is
  'Concilia um lançamento do extrato com pagamentos existentes, contas em aberto (dá a baixa na data e conta do extrato) e/ou transferências; a soma tem que bater (Financeiro: operar) (051).';

/** Cria a conta (pagar se saiu, receber se entrou) já paga na data e conta do extrato e concilia. */
create or replace function public.fin_conciliar_lancar(p_linha bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l fin_extrato_linhas; v jsonb; v_titulo uuid; v_baixa bigint;
begin
  l := app.fin_linha_para_conciliar(p_linha);
  if coalesce(trim(p->>'descricao'), '') = '' then raise exception 'Escreva a descrição do lançamento'; end if;
  v := app.fin_lancar_titulos(jsonb_build_object(
         'cliente', l.cliente_id, 'tipo', case when l.valor > 0 then 'receber' else 'pagar' end,
         'categoria', p->>'categoria', 'centro', p->>'centro', 'pessoa', p->>'pessoa', 'pessoa_nome', p->>'pessoa_nome',
         'descricao', trim(p->>'descricao'), 'documento', coalesce(nullif(trim(p->>'documento'), ''), l.documento),
         'emissao', l.data, 'vencimento', l.data, 'valor', abs(l.valor), 'parcelas', 1,
         'observacao', nullif(trim(p->>'observacao'), ''),
         'pago', jsonb_build_object('data', l.data, 'conta', l.conta_id, 'forma', 'Conciliação do extrato')));
  v_titulo := (v->'titulos'->>0)::uuid;
  select id into v_baixa from fin_baixas where titulo_id = v_titulo and not estornada order by id desc limit 1;
  return app.fin_conciliar_ligar(l.id, 'lancamentos', array[v_baixa], '{}', p->>'observacao', array[v_baixa])
         || jsonb_build_object('titulo', v_titulo);
end $$;
comment on function public.fin_conciliar_lancar(bigint, jsonb) is
  'Cria, a partir do lançamento do extrato, a conta a pagar/receber já paga (categoria, centro e pessoa escolhidos) e concilia (Financeiro: operar) (051).';

/** Transferência entre contas a partir da linha: cria a transferência (saiu daqui → vai para a outra; entrou → veio da outra). */
create or replace function public.fin_conciliar_transferir(p_linha bigint, p_outra_conta uuid, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l fin_extrato_linhas; v_id bigint;
begin
  l := app.fin_linha_para_conciliar(p_linha);
  if p_outra_conta is null then raise exception 'Escolha a outra conta da transferência'; end if;
  if l.valor < 0 then
    v_id := public.fin_transferir(l.conta_id, p_outra_conta, l.data, -l.valor, coalesce(nullif(trim(p_obs), ''), l.descricao));
  else
    v_id := public.fin_transferir(p_outra_conta, l.conta_id, l.data, l.valor, coalesce(nullif(trim(p_obs), ''), l.descricao));
  end if;
  return app.fin_conciliar_ligar(l.id, 'transferencia', '{}', array[v_id], p_obs, '{}', v_id) || jsonb_build_object('transferencia', v_id);
end $$;
comment on function public.fin_conciliar_transferir(bigint, uuid, text) is
  'Cria a transferência entre contas a partir do lançamento do extrato e concilia; a outra conta concilia o mesmo valor depois (Financeiro: operar) (051).';

create or replace function public.fin_extrato_ignorar(p_linha bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l fin_extrato_linhas; v_motivo text := trim(coalesce(p_motivo, '')); v_conc bigint;
begin
  l := app.fin_linha_para_conciliar(p_linha);
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo para ignorar (pelo menos 5 letras)';
  end if;
  perform 1 from fin_extrato_linhas where id = l.id for update;
  insert into fin_conciliacoes (org_id, cliente_id, conta_id, linha_id, tipo, valor, observacao, por)
  values (l.org_id, l.cliente_id, l.conta_id, l.id, 'ignorado', l.valor, v_motivo, auth.uid())
  returning id into v_conc;
  update fin_extrato_linhas set situacao = 'ignorado' where id = l.id;
  perform app.registrar(l.org_id, 'financeiro', 'ignorar_extrato', l.id::text, null,
    jsonb_build_object('conciliacao', v_conc, 'data', l.data, 'valor', l.valor, 'motivo', v_motivo));
  return jsonb_build_object('conciliacao', v_conc, 'linha', l.id);
end $$;
comment on function public.fin_extrato_ignorar(bigint, text) is
  'Marca o lançamento do extrato como ignorado (motivo com 5 letras ou mais; Financeiro: operar) (051).';

-- ===================================================================================================== 4 desfazer
create or replace function public.fin_conciliacao_desfazer(p_linha bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l fin_extrato_linhas; c fin_conciliacoes; v_motivo text := trim(coalesce(p_motivo, '')); v_criadas int;
begin
  select * into l from fin_extrato_linhas where id = p_linha for update;
  if l.id is null then raise exception 'Lançamento do extrato não encontrado'; end if;
  if not app.gestao_pode(l.cliente_id, 'operar', array['financeiro']) then
    raise exception 'Sem permissão para desfazer a conciliação (Financeiro, nível operar)';
  end if;
  select * into c from fin_conciliacoes where linha_id = l.id and not desfeita for update;
  if c.id is null or l.situacao not in ('conciliado', 'ignorado') then raise exception 'Este lançamento não está conciliado'; end if;
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo para desfazer (pelo menos 5 letras)';
  end if;
  update fin_conciliacoes set desfeita = true, desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = v_motivo where id = c.id;
  select count(*) filter (where criado_aqui) into v_criadas from fin_conciliacao_itens where conciliacao_id = c.id;
  update fin_conciliacao_itens set valendo = false where conciliacao_id = c.id;
  update fin_baixas set extrato_linha_id = null where extrato_linha_id = l.id;
  update fin_extrato_linhas set situacao = 'pendente' where id = l.id;
  perform app.registrar(l.org_id, 'financeiro', 'desfazer_conciliacao', l.id::text, to_jsonb(c), jsonb_build_object('motivo', v_motivo));
  return jsonb_build_object('linha', l.id, 'lancados_aqui', v_criadas);
end $$;
comment on function public.fin_conciliacao_desfazer(bigint, text) is
  'Desfaz a conciliação (motivo com 5 letras ou mais): a linha volta a "a conciliar"; os pagamentos lançados por ela continuam (Financeiro: operar) (051).';

-- transferência conciliada não se estorna sem desfazer antes (como a baixa)
create or replace function public.fin_estornar_transferencia(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t fin_transferencias;
begin
  select * into t from fin_transferencias where id = p_id for update;
  if t.id is null then raise exception 'Transferência não encontrada'; end if;
  if not app.gestao_pode(t.cliente_id, 'operar', array['financeiro']) then raise exception 'Sem permissão para estornar'; end if;
  if t.estornada then raise exception 'Esta transferência já foi estornada'; end if;
  if exists (select 1 from fin_conciliacao_itens i where i.transferencia_id = t.id and i.valendo) then
    raise exception 'Esta transferência já foi conciliada com o extrato; desfaça a conciliação antes';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  update fin_transferencias set estornada = true, estornada_em = now(), estorno_motivo = trim(p_motivo) where id = t.id;
  perform app.registrar(t.org_id, 'financeiro', 'estornar_transferencia', t.id::text, to_jsonb(t), jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- ===================================================================================================== 5 dados da tela
create or replace function public.fin_conciliacao_dados(p_conta uuid, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c fin_contas_bancarias; v_de date := coalesce(p_de, date '1900-01-01'); v_ate date := coalesce(p_ate, date '2999-12-31');
  v_ext numeric; v_hub numeric;
begin
  select * into c from fin_contas_bancarias where id = p_conta;
  if c.id is null then raise exception 'Conta bancária não encontrada'; end if;
  if not app.gestao_pode(c.cliente_id, 'ver', array['financeiro']) then raise exception 'Sem permissão para ver o Financeiro desta empresa'; end if;
  if v_ate < v_de then raise exception 'O fim do período é antes do início'; end if;

  select coalesce(sum(valor), 0) into v_ext from fin_extrato_linhas
   where conta_id = c.id and situacao <> 'desfeita' and data between v_de and v_ate;
  select coalesce(sum(v), 0) into v_hub from (
    select case when t.tipo = 'receber' then b.total else -b.total end as v
      from fin_baixas b join fin_titulos t on t.id = b.titulo_id
     where b.conta_id = c.id and not b.estornada and b.data between v_de and v_ate
    union all
    select case when x.destino_id = c.id then x.valor else -x.valor end
      from fin_transferencias x where c.id in (x.origem_id, x.destino_id) and not x.estornada and x.data between v_de and v_ate) m;

  return jsonb_build_object(
    'conta', c.id, 'de', p_de, 'ate', p_ate,
    'pode_operar', app.gestao_pode(c.cliente_id, 'operar', array['financeiro']),
    'saldos', jsonb_build_object('extrato', v_ext, 'hub', v_hub, 'diferenca', v_ext - v_hub),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'data', l.data, 'valor', l.valor, 'descricao', l.descricao, 'documento', l.documento, 'situacao', l.situacao,
               'conciliacao', (select jsonb_build_object('id', k.id, 'tipo', k.tipo, 'observacao', k.observacao, 'em', k.em,
                                 'itens', coalesce((select jsonb_agg(jsonb_build_object(
                                     'valor', i.valor, 'criado_aqui', i.criado_aqui,
                                     'descricao', coalesce(t.descricao, 'Transferência ' || case when x.destino_id = c.id then 'de ' || co.nome else 'para ' || cd.nome end),
                                     'pessoa', pe.nome, 'baixa', i.baixa_id, 'transferencia', i.transferencia_id) order by i.id)
                                   from fin_conciliacao_itens i
                                   left join fin_baixas b on b.id = i.baixa_id
                                   left join fin_titulos t on t.id = b.titulo_id
                                   left join fin_pessoas pe on pe.id = t.pessoa_id
                                   left join fin_transferencias x on x.id = i.transferencia_id
                                   left join fin_contas_bancarias co on co.id = x.origem_id
                                   left join fin_contas_bancarias cd on cd.id = x.destino_id
                                  where i.conciliacao_id = k.id), '[]'))
                                from fin_conciliacoes k where k.linha_id = l.id and not k.desfeita))
             order by l.data, l.id)
        from fin_extrato_linhas l
       where l.conta_id = c.id and l.situacao <> 'desfeita' and l.data between v_de and v_ate), '[]'),
    'baixas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'data', b.data, 'valor', case when t.tipo = 'receber' then b.total else -b.total end,
               'tipo', t.tipo, 'descricao', t.descricao, 'documento', t.documento, 'pessoa', pe.nome, 'forma', b.forma) order by b.data, b.id)
        from fin_baixas b join fin_titulos t on t.id = b.titulo_id left join fin_pessoas pe on pe.id = t.pessoa_id
       where b.conta_id = c.id and not b.estornada and b.extrato_linha_id is null
         and b.data between v_de - 45 and v_ate + 45), '[]'),
    'titulos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'tipo', t.tipo, 'vencimento', t.vencimento, 'saldo', t.valor - t.valor_pago, 'descricao', t.descricao,
               'documento', t.documento, 'pessoa', pe.nome) order by t.vencimento, t.id)
        from fin_titulos t left join fin_pessoas pe on pe.id = t.pessoa_id
       where t.cliente_id = c.cliente_id and t.situacao = 'aberto' and t.valor > t.valor_pago
         and t.vencimento between v_de - 90 and v_ate + 90), '[]'),
    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'data', x.data, 'valor', case when x.destino_id = c.id then x.valor else -x.valor end,
               'outra_conta', case when x.destino_id = c.id then co.nome else cd.nome end, 'observacao', x.observacao) order by x.data, x.id)
        from fin_transferencias x
        join fin_contas_bancarias co on co.id = x.origem_id
        join fin_contas_bancarias cd on cd.id = x.destino_id
       where c.id in (x.origem_id, x.destino_id) and not x.estornada and x.data between v_de - 45 and v_ate + 45
         and not exists (select 1 from fin_conciliacao_itens i where i.transferencia_id = x.id and i.conta_id = c.id and i.valendo)), '[]'));
end $$;
comment on function public.fin_conciliacao_dados(uuid, date, date) is
  'Tela de conciliação (Financeiro: ver): linhas do extrato do período com a conciliação, pagamentos sem extrato, contas em aberto, transferências sem extrato e os saldos (051).';

do $$
declare f text;
begin
  foreach f in array array['public.fin_conciliar(bigint, jsonb)', 'public.fin_conciliar_lancar(bigint, jsonb)',
                           'public.fin_conciliar_transferir(bigint, uuid, text)', 'public.fin_extrato_ignorar(bigint, text)',
                           'public.fin_conciliacao_desfazer(bigint, text)', 'public.fin_conciliacao_dados(uuid, date, date)',
                           'public.fin_estornar_transferencia(bigint, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
