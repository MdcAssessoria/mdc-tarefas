-- =====================================================================================================
--  030 · Financeiro: correções da auditoria da etapa 1B (parecer 2026-11-01-parecer-financeiro-etapa1b.md)
--
--  A-2  fornecedor/cliente, centro de custo e estoque (local) não mudam de empresa (como já valia para categoria,
--       título, item e conta bancária).
--  M-1  editar o valor de um título pago em parte para o valor já pago deixava o título aberto com saldo zero.
--  M-2  despesas/receitas (ligadas ao plano de contas) e centros de custo: só a equipe MDC cadastra e altera; o cliente
--       no Portal só lê. Fornecedores, títulos e itens o cliente continua podendo lançar.
--  M-4  fin_lancar aceita `pessoa_nome`: o fornecedor/cliente digitado na hora é achado ou cadastrado na mesma transação
--       do lançamento (antes ficava cadastrado mesmo se o lançamento falhasse, e duplicava na nova tentativa).
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- A-2
create or replace function app.tg_fin_sem_troca_empresa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id then
    raise exception 'Este cadastro não muda de empresa; cadastre de novo na outra empresa';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_sem_troca_empresa() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['fin_pessoas', 'fin_centros_custo', 'est_locais', 'fin_baixas', 'est_movimentos', 'est_parametros'] loop
    execute format('drop trigger if exists sem_troca_empresa on public.%I', t);
    execute format('create trigger sem_troca_empresa before update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_fin_sem_troca_empresa()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------- M-1
create or replace function app.tg_fin_titulo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo_cat text; v_interno boolean := coalesce(current_setting('app.fin_interno', true), '') = '1';
begin
  if tg_op = 'UPDATE' then
    if new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id or new.tipo is distinct from old.tipo
       or new.grupo is distinct from old.grupo or new.parcela is distinct from old.parcela or new.parcelas is distinct from old.parcelas then
      raise exception 'Empresa, tipo e parcela do título não mudam';
    end if;
    if not v_interno then
      if new.situacao is distinct from old.situacao or new.valor_pago is distinct from old.valor_pago
         or new.quitado_em is distinct from old.quitado_em or new.cancelado_motivo is distinct from old.cancelado_motivo then
        raise exception 'A situação do título muda só ao pagar, receber, estornar ou cancelar';
      end if;
      if old.situacao <> 'aberto' then raise exception 'Título quitado ou cancelado não pode ser editado; estorne a baixa antes'; end if;
      -- valor igual ao já pago deixaria o título aberto com saldo zero (sem como quitar nem cancelar)
      if old.valor_pago > 0 and new.valor <= old.valor_pago then
        raise exception 'O valor precisa ser maior do que já foi pago (%); para encerrar, dê baixa do restante', old.valor_pago;
      end if;
    end if;
  elsif not v_interno then
    if new.valor_pago <> 0 or new.situacao <> 'aberto' or new.quitado_em is not null then
      raise exception 'Título novo entra em aberto; use Pagar/Receber para dar baixa';
    end if;
  end if;
  select tipo into v_tipo_cat from fin_categorias where id = new.categoria_id and cliente_id = new.cliente_id;
  if v_tipo_cat is null then raise exception 'Categoria não encontrada nesta empresa'; end if;
  if (new.tipo = 'pagar' and v_tipo_cat <> 'despesa') or (new.tipo = 'receber' and v_tipo_cat <> 'receita') then
    raise exception 'Conta a pagar usa categoria de despesa; conta a receber usa categoria de receita';
  end if;
  if new.pessoa_id is not null and not exists (select 1 from fin_pessoas where id = new.pessoa_id and cliente_id = new.cliente_id) then
    raise exception 'Fornecedor/cliente não encontrado nesta empresa';
  end if;
  if new.centro_id is not null and not exists (select 1 from fin_centros_custo where id = new.centro_id and cliente_id = new.cliente_id) then
    raise exception 'Centro de custo não encontrado nesta empresa';
  end if;
  if new.conta_prevista_id is not null and not exists (select 1 from fin_contas_bancarias where id = new.conta_prevista_id and cliente_id = new.cliente_id) then
    raise exception 'Conta bancária não encontrada nesta empresa';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------------------------- M-2
do $$
declare t text;
begin
  foreach t in array array['fin_categorias', 'fin_centros_custo'] loop
    execute format('drop policy if exists fin_incluir on public.%I', t);
    execute format('create policy fin_incluir on public.%I for insert to authenticated
                    with check (app.hub_pode(org_id, ''financeiro'', ''operar''))', t);
    execute format('drop policy if exists fin_alterar on public.%I', t);
    execute format('create policy fin_alterar on public.%I for update to authenticated
                    using (app.hub_pode(org_id, ''financeiro'', ''operar'')) with check (app.hub_pode(org_id, ''financeiro'', ''operar''))', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------- M-4
create or replace function public.fin_lancar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := (p->>'cliente')::uuid; v_org uuid; v_n int := coalesce((p->>'parcelas')::int, 1);
  v_total numeric := round((p->>'valor')::numeric, 2); v_parcela numeric; v_grupo uuid; v_id uuid; v_ids uuid[] := '{}';
  v_venc date := (p->>'vencimento')::date; v_pago jsonb := p->'pago'; v_conta uuid; k int;
  v_pessoa uuid := nullif(p->>'pessoa', '')::uuid; v_nome text := nullif(trim(p->>'pessoa_nome'), '');
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para lançar no Financeiro desta empresa'; end if;
  if v_total is null or v_total <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if v_venc is null then raise exception 'Informe o vencimento'; end if;
  if v_n < 1 or v_n > 120 then raise exception 'Parcelas: de 1 a 120'; end if;
  if v_total / v_n < 0.01 then raise exception 'Valor pequeno demais para tantas parcelas'; end if;
  if v_pago is not null and jsonb_typeof(v_pago) = 'object' then
    v_conta := (v_pago->>'conta')::uuid;
    if v_conta is null or (v_pago->>'data') is null then raise exception 'Para lançar já pago, informe a data e a conta bancária'; end if;
    if not exists (select 1 from fin_contas_bancarias where id = v_conta and cliente_id = v_cliente and ativo) then
      raise exception 'Conta bancária não encontrada ou inativa';
    end if;
  else
    v_pago := null;
  end if;

  -- fornecedor/cliente digitado na hora: acha pelo nome ou cadastra, na mesma transação do lançamento (M-4)
  if v_pessoa is null and v_nome is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = v_cliente and lower(nome) = lower(v_nome) order by ativo desc, criado_em limit 1;
    if v_pessoa is null then
      insert into fin_pessoas (org_id, cliente_id, tipo, nome)
      values (v_org, v_cliente, case when p->>'tipo' = 'pagar' then 'fornecedor' else 'cliente' end, v_nome)
      returning id into v_pessoa;
    end if;
  end if;

  v_grupo := case when v_n > 1 then gen_random_uuid() end;
  v_parcela := trunc(v_total / v_n, 2);
  perform set_config('app.fin_interno', '1', true);
  for k in 1..v_n loop
    insert into fin_titulos (org_id, cliente_id, tipo, pessoa_id, categoria_id, centro_id, conta_prevista_id, descricao, documento,
                             emissao, vencimento, valor, parcela, parcelas, grupo, observacao, por)
    values (v_org, v_cliente, p->>'tipo', v_pessoa, (p->>'categoria')::uuid, nullif(p->>'centro', '')::uuid,
            coalesce(nullif(p->>'conta_prevista', '')::uuid, v_conta),
            trim(p->>'descricao') || case when v_n > 1 then format(' (%s/%s)', k, v_n) else '' end,
            nullif(trim(p->>'documento'), ''), nullif(p->>'emissao', '')::date, (v_venc + make_interval(months => k - 1))::date,
            case when k = v_n then v_total - v_parcela * (v_n - 1) else v_parcela end, k, v_n, v_grupo,
            nullif(trim(p->>'observacao'), ''), auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
    if v_pago is not null then
      insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, forma, por)
      select org_id, cliente_id, id, v_conta, (v_pago->>'data')::date, valor, nullif(v_pago->>'forma', ''), auth.uid()
        from fin_titulos where id = v_id;
      update fin_titulos set valor_pago = valor, situacao = 'quitado', quitado_em = (v_pago->>'data')::date where id = v_id;
    end if;
  end loop;
  perform set_config('app.fin_interno', '', true);

  perform app.registrar(v_org, 'financeiro', 'lancar_' || (p->>'tipo'), coalesce(v_grupo, v_id)::text, null,
    p || jsonb_build_object('titulos', to_jsonb(v_ids)));
  return jsonb_build_object('titulos', to_jsonb(v_ids), 'grupo', v_grupo);
end $$;
