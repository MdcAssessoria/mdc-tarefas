-- =====================================================================================================
--  033 · Itens profissionais, ficha de estoque (kardex) e pedidos de venda e de compra   (Financeiro v2, frente 3)
--
--  Pedido do Edvaldo (01/11/2026): o módulo vai ser vendido aos clientes; cadastro de itens mais dinâmico para o
--  usuário final, baixa do estoque na venda e pedidos de compra e de venda, no nível de Conta Azul/Bling/Omie.
--
--  est_grupos            grupos (categorias) de produto da empresa: Bebidas, Ferragens…
--  est_itens (+)         grupo, marca, unidade de compra com fator, custo médio (calculado), markup, foto
--  est_movimentos (+)    saldo e custo médio do item depois de cada movimento = ficha de estoque (kardex)
--  est_pedidos           pedidos de venda e de compra (cabeçalho, total e parcelas)
--  est_pedido_itens      linhas do pedido (item, quantidade, unidade, preço, desconto, movimento de estoque gerado)
--  est_pedido_titulos    contas a receber/pagar geradas pelo pedido (ligação, para cancelar junto)
--
--  Custo médio ponderado: em cada ENTRADA com custo, custo médio = (saldo × custo médio + qtd × custo) / (saldo + qtd);
--  com saldo zero ou negativo, o custo médio passa a ser o custo da entrada. Saídas, ajustes e transferências não
--  mudam o custo médio. Movimento com data passada ou estorno recalcula a ficha a partir daquela data.
--
--  Venda:  rascunho → confirmado (baixa do estoque dos itens estocáveis + contas a receber) → faturado (nota emitida)
--  Compra: rascunho → confirmado (aguardando entrega, sem efeito) → recebido (entrada no estoque com custo + contas a pagar)
--  Qualquer um → cancelado (estorna o estoque e cancela as parcelas em aberto; recusa se já houve pagamento).
--
--  Mantém as assinaturas de app.est_gravar e app.est_saida (a frente 2, notas fiscais, usa origem 'nota_entrada').
--  Gravação com regra só pelas funções (security definer, search_path fixo, app.fin_pode); nada se apaga.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- grupos de produto
create table if not exists public.est_grupos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cliente_id, nome)
);
comment on table public.est_grupos is 'Grupos (categorias) de produto da empresa, para organizar e filtrar os itens. Inativa, não apaga.';

-- ------------------------------------------------------------------------------------- itens: cadastro profissional
alter table public.est_itens
  add column if not exists grupo_id uuid references public.est_grupos(id) on delete restrict,
  add column if not exists marca text,
  add column if not exists unidade_compra text check (unidade_compra is null or length(trim(unidade_compra)) between 1 and 6),
  add column if not exists fator_compra numeric(15, 6) not null default 1 check (fator_compra > 0),
  add column if not exists custo_medio numeric(15, 4) check (custo_medio is null or custo_medio >= 0),
  add column if not exists markup numeric(9, 2) check (markup is null or markup >= 0),
  add column if not exists foto_caminho text,
  add column if not exists atualizado_em timestamptz;
create index if not exists est_itens_grupo on public.est_itens (cliente_id, grupo_id);
create index if not exists est_itens_barras on public.est_itens (cliente_id, codigo_barras) where codigo_barras is not null;
comment on column public.est_itens.custo is 'Preço de custo: o informado no cadastro e, depois, o último custo de entrada (compra, nota ou entrada manual com custo).';
comment on column public.est_itens.custo_medio is 'Custo médio ponderado, calculado pelo HUB nas entradas (não se digita).';
comment on column public.est_itens.markup is 'Markup desejado em %: preço sugerido = custo × (1 + markup/100).';
comment on column public.est_itens.unidade_compra is 'Unidade em que o item é comprado (ex.: CX). Nula = compra na mesma unidade de venda/estoque.';
comment on column public.est_itens.fator_compra is 'Quantas unidades de estoque vêm em 1 unidade de compra (ex.: 1 CX = 12 UN → 12).';
comment on column public.est_itens.foto_caminho is 'Foto opcional no Storage hub-arquivos: <org>/estoque/<cliente>/<arquivo>.';

alter table public.est_movimentos
  add column if not exists saldo_apos numeric(15, 4),
  add column if not exists custo_medio_apos numeric(15, 4);
create index if not exists est_movimentos_ficha on public.est_movimentos (item_id, data, id) where not estornado;
create index if not exists est_movimentos_origem on public.est_movimentos (origem, origem_id) where origem_id is not null;
comment on column public.est_movimentos.saldo_apos is 'Ficha de estoque: saldo do item (todos os estoques) logo depois deste movimento.';
comment on column public.est_movimentos.custo_medio_apos is 'Ficha de estoque: custo médio do item logo depois deste movimento.';

/**
 * Trava do cadastro de item (complementa app.tg_est_item da 029): grupo da mesma empresa, custo médio só pelo HUB,
 * unidade de compra com fator coerente e foto só na pasta da empresa.
 */
create or replace function app.tg_est_item_v2()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_interno boolean := coalesce(current_setting('app.est_interno', true), '') = '1';
begin
  if not v_interno and new.custo_medio is distinct from (case when tg_op = 'UPDATE' then old.custo_medio end) then
    raise exception 'O custo médio é calculado pelo HUB nas entradas de estoque; não pode ser digitado';
  end if;
  if new.grupo_id is not null and not exists (select 1 from est_grupos where id = new.grupo_id and cliente_id = new.cliente_id) then
    raise exception 'Grupo de produto não encontrado nesta empresa';
  end if;
  new.unidade := upper(trim(new.unidade));
  new.unidade_compra := nullif(upper(trim(new.unidade_compra)), '');
  if new.unidade_compra is null or new.unidade_compra = new.unidade then
    new.unidade_compra := null;
    new.fator_compra := 1;
  end if;
  if new.foto_caminho is not null and new.foto_caminho not like new.org_id::text || '/estoque/' || new.cliente_id::text || '/%' then
    raise exception 'Foto do item fora da pasta da empresa';
  end if;
  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;
  return new;
end $$;
revoke all on function app.tg_est_item_v2() from public, anon, authenticated;
drop trigger if exists est_item_valida_v2 on public.est_itens;
create trigger est_item_valida_v2 before insert or update on public.est_itens for each row execute function app.tg_est_item_v2();

-- ------------------------------------------------------------------------------------- ficha (kardex) e custo médio
/**
 * Recalcula a ficha do item a partir de uma data (nula = desde o começo): saldo e custo médio depois de cada movimento
 * não estornado, na ordem (data, id), e o custo médio atual no cadastro. Chamada com o item já travado.
 */
create or replace function app.est_recalcular(p_item uuid, p_desde date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric := 0; v_cm numeric; r record;
  v_fin text := current_setting('app.fin_interno', true); v_est text := current_setting('app.est_interno', true);
begin
  if p_desde is not null then
    select m.saldo_apos, m.custo_medio_apos into v_saldo, v_cm from est_movimentos m
     where m.item_id = p_item and not m.estornado and m.data < p_desde
     order by m.data desc, m.id desc limit 1;
    v_saldo := coalesce(v_saldo, 0);
  end if;
  for r in select m.id, m.tipo, m.quantidade, m.custo_unitario, m.saldo_apos, m.custo_medio_apos from est_movimentos m
            where m.item_id = p_item and not m.estornado and (p_desde is null or m.data >= p_desde)
            order by m.data, m.id loop
    if r.tipo = 'entrada' and r.quantidade > 0 and r.custo_unitario is not null then
      v_cm := case when v_saldo <= 0 or v_cm is null then r.custo_unitario
                   else round((v_saldo * v_cm + r.quantidade * r.custo_unitario) / (v_saldo + r.quantidade), 4) end;
    end if;
    v_saldo := v_saldo + r.quantidade;
    if r.saldo_apos is distinct from v_saldo or r.custo_medio_apos is distinct from v_cm then
      update est_movimentos set saldo_apos = v_saldo, custo_medio_apos = v_cm where id = r.id;
    end if;
  end loop;
  select m.custo_medio_apos into v_cm from est_movimentos m where m.item_id = p_item and not m.estornado
   order by m.data desc, m.id desc limit 1;
  -- gravação interna: sem auditoria linha a linha (o movimento já é auditado) e liberada pela trava do custo médio
  perform set_config('app.fin_interno', '1', true);
  perform set_config('app.est_interno', '1', true);
  update est_itens set custo_medio = v_cm where id = p_item and custo_medio is distinct from v_cm;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  perform set_config('app.est_interno', coalesce(v_est, ''), true);
end $$;
revoke all on function app.est_recalcular(uuid, date) from public, anon, authenticated;

/**
 * Grava um movimento já conferido (mesma assinatura da 029; usada por pedidos e notas). Trava o item, confere que
 * controla estoque e, nas saídas, o saldo do local (salvo estoque negativo liberado). Novo na 033: entrada com custo
 * atualiza o "último custo" do item e toda gravação recalcula a ficha (saldo e custo médio) a partir da data.
 */
create or replace function app.est_gravar(
  p_item uuid, p_local uuid, p_data date, p_tipo text, p_qtd numeric, p_custo numeric,
  p_origem text, p_origem_id text, p_grupo uuid, p_obs text)
returns bigint language plpgsql security definer set search_path = public as $$
declare i est_itens; v_saldo numeric; v_id bigint; v_data date; v_fin text := current_setting('app.fin_interno', true);
begin
  select * into i from est_itens where id = p_item for update;
  if i.id is null then raise exception 'Item não encontrado'; end if;
  if not i.controla_estoque then raise exception 'O item "%" não controla estoque', i.nome; end if;
  if not exists (select 1 from est_locais where id = p_local and cliente_id = i.cliente_id and ativo) then
    raise exception 'Estoque (local) não encontrado ou inativo';
  end if;
  if p_qtd is null or p_qtd = 0 then raise exception 'Informe a quantidade'; end if;
  if p_custo is not null and p_custo < 0 then raise exception 'O custo não pode ser negativo'; end if;
  if p_qtd < 0 and not coalesce((select permite_negativo from est_parametros where cliente_id = i.cliente_id), false) then
    select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos
     where item_id = p_item and local_id = p_local and not estornado;
    if v_saldo + p_qtd < 0 then
      raise exception 'Estoque insuficiente de "%": saldo % %, saída de %', i.nome, trim(to_char(v_saldo, 'FM999999990.####')), i.unidade,
        trim(to_char(-p_qtd, 'FM999999990.####'));
    end if;
  end if;
  v_data := coalesce(p_data, app.hoje(i.org_id));
  insert into est_movimentos (org_id, cliente_id, item_id, local_id, data, tipo, quantidade, custo_unitario, origem, origem_id, grupo, observacao, por)
  values (i.org_id, i.cliente_id, i.id, p_local, v_data, p_tipo, round(p_qtd, 4), round(p_custo, 4), p_origem, p_origem_id,
          p_grupo, nullif(trim(p_obs), ''), auth.uid())
  returning id into v_id;
  if p_tipo = 'entrada' and p_qtd > 0 and p_custo is not null and p_custo > 0 then
    perform set_config('app.fin_interno', '1', true);
    update est_itens set custo = round(p_custo, 4) where id = i.id and custo is distinct from round(p_custo, 4);
    perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  end if;
  perform app.est_recalcular(i.id, v_data);
  return v_id;
end $$;
revoke all on function app.est_gravar(uuid, uuid, date, text, numeric, numeric, text, text, uuid, text) from public, anon, authenticated;

/** Estorna um movimento manual (e o par, na transferência). Igual à 029 + recálculo da ficha. */
create or replace function public.est_estornar_movimento(p_mov bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare m est_movimentos; r record; v_saldo numeric; v_neg boolean;
begin
  select * into m from est_movimentos where id = p_mov;
  if m.id is null then raise exception 'Movimento não encontrado'; end if;
  if not app.fin_pode(m.cliente_id, 'operar') then raise exception 'Sem permissão para estornar'; end if;
  if m.estornado then raise exception 'Este movimento já foi estornado'; end if;
  if m.origem <> 'manual' then raise exception 'Movimento gerado por pedido ou nota: estorne pelo documento de origem'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  perform 1 from est_itens where id = m.item_id for update;
  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = m.cliente_id), false);
  for r in select * from est_movimentos where (id = m.id or (m.grupo is not null and grupo = m.grupo)) and not estornado loop
    if r.quantidade > 0 and not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = r.item_id and local_id = r.local_id and not estornado;
      if v_saldo - r.quantidade < 0 then raise exception 'Estornar esta entrada deixaria o estoque negativo (saldo atual %)', trim(to_char(v_saldo, 'FM999999990.####')); end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = trim(p_motivo) where id = r.id;
  end loop;
  perform app.est_recalcular(m.item_id, m.data);
  perform app.registrar(m.org_id, 'financeiro', 'estoque_estorno', m.item_id::text, to_jsonb(m), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.est_estornar_movimento(bigint, text) from public, anon;
grant execute on function public.est_estornar_movimento(bigint, text) to authenticated;

-- ficha dos movimentos que já existiam (029): calcula saldo e custo médio de todos os itens
do $$
declare r record;
begin
  for r in select distinct item_id from public.est_movimentos loop
    perform app.est_recalcular(r.item_id, null);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------- gravar item (assistente e planilha)
/** Local padrão da empresa; se não houver nenhum estoque, cria o "Depósito principal". */
create or replace function app.est_local_padrao(p_cliente uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_org uuid;
begin
  select id into v_id from est_locais where cliente_id = p_cliente and padrao and ativo;
  if v_id is null then select id into v_id from est_locais where cliente_id = p_cliente and ativo order by criado_em limit 1; end if;
  if v_id is null then
    select org_id into v_org from clientes where id = p_cliente;
    insert into est_locais (org_id, cliente_id, nome, padrao) values (v_org, p_cliente, 'Depósito principal', true) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function app.est_local_padrao(uuid) from public, anon, authenticated;

/**
 * Grava um item a partir de um jsonb (uso interno). p_parcial = importação: campo ausente/vazio mantém o valor atual.
 * Grupo pode vir pelo id (grupo) ou pelo nome (grupo_nome: acha ou cria). Saldo inicial (só item novo e estocável):
 * entrada no estoque informado ou no padrão, com o custo do item.
 */
create or replace function app.est_item_gravar(p_cliente uuid, p jsonb, p_id uuid, p_parcial boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_id uuid := p_id; v_grupo uuid; a est_itens; v_tipo text; v_ctl boolean; v_codigo text;
  v_ini numeric := nullif(p->>'saldo_inicial', '')::numeric;
  v_txt text;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_id is not null then select * into a from est_itens where id = v_id and cliente_id = p_cliente for update; end if;

  v_txt := nullif(trim(p->>'grupo_nome'), '');
  v_grupo := nullif(p->>'grupo', '')::uuid;
  if v_grupo is null and v_txt is not null then
    select id into v_grupo from est_grupos where cliente_id = p_cliente and lower(nome) = lower(v_txt);
    if v_grupo is null then
      insert into est_grupos (org_id, cliente_id, nome) values (v_org, p_cliente, v_txt) returning id into v_grupo;
    end if;
  end if;

  v_codigo := nullif(trim(p->>'codigo'), '');
  if v_codigo is not null and exists (select 1 from est_itens where cliente_id = p_cliente and codigo = v_codigo and id is distinct from v_id) then
    raise exception 'Já existe outro item com o código "%"', v_codigo;
  end if;
  v_tipo := coalesce(nullif(p->>'tipo', ''), a.tipo, 'produto');
  v_ctl := case when v_tipo = 'servico' then false
                else coalesce(nullif(p->>'controla_estoque', '')::boolean, a.controla_estoque, true) end;

  if a.id is null then
    insert into est_itens (org_id, cliente_id, codigo, nome, tipo, unidade, controla_estoque, estoque_minimo, preco_venda, custo,
                           markup, ncm, codigo_barras, grupo_id, marca, unidade_compra, fator_compra, categoria_receita_id,
                           categoria_despesa_id, observacao, foto_caminho, ativo)
    values (v_org, p_cliente, v_codigo, trim(p->>'nome'), v_tipo, coalesce(nullif(trim(p->>'unidade'), ''), case when v_tipo = 'servico' then 'H' else 'UN' end),
            v_ctl, coalesce(nullif(p->>'estoque_minimo', '')::numeric, 0), nullif(p->>'preco_venda', '')::numeric,
            nullif(p->>'custo', '')::numeric, nullif(p->>'markup', '')::numeric, nullif(regexp_replace(coalesce(p->>'ncm', ''), '\D', '', 'g'), ''),
            nullif(trim(p->>'codigo_barras'), ''), v_grupo, nullif(trim(p->>'marca'), ''), nullif(trim(p->>'unidade_compra'), ''),
            coalesce(nullif(p->>'fator_compra', '')::numeric, 1), nullif(p->>'categoria_receita', '')::uuid,
            nullif(p->>'categoria_despesa', '')::uuid, nullif(trim(p->>'observacao'), ''), nullif(p->>'foto_caminho', ''),
            coalesce(nullif(p->>'ativo', '')::boolean, true))
    returning id into v_id;
    if v_ini is not null and v_ini <> 0 then
      if not v_ctl then raise exception 'O item "%" não controla estoque: deixe o saldo inicial em branco', trim(p->>'nome'); end if;
      if v_ini < 0 then raise exception 'Saldo inicial de "%" não pode ser negativo', trim(p->>'nome'); end if;
      perform app.est_gravar(v_id, coalesce(nullif(p->>'local', '')::uuid, app.est_local_padrao(p_cliente)), nullif(p->>'data', '')::date,
        'entrada', v_ini, nullif(p->>'custo', '')::numeric, 'manual', null, null, 'Saldo inicial');
    end if;
  elsif p_parcial then
    update est_itens set
      codigo = coalesce(v_codigo, codigo),
      nome = coalesce(nullif(trim(p->>'nome'), ''), nome),
      tipo = v_tipo, controla_estoque = v_ctl,
      unidade = coalesce(nullif(trim(p->>'unidade'), ''), unidade),
      estoque_minimo = coalesce(nullif(p->>'estoque_minimo', '')::numeric, estoque_minimo),
      preco_venda = coalesce(nullif(p->>'preco_venda', '')::numeric, preco_venda),
      custo = coalesce(nullif(p->>'custo', '')::numeric, custo),
      markup = coalesce(nullif(p->>'markup', '')::numeric, markup),
      ncm = coalesce(nullif(regexp_replace(coalesce(p->>'ncm', ''), '\D', '', 'g'), ''), ncm),
      codigo_barras = coalesce(nullif(trim(p->>'codigo_barras'), ''), codigo_barras),
      grupo_id = coalesce(v_grupo, grupo_id),
      marca = coalesce(nullif(trim(p->>'marca'), ''), marca),
      unidade_compra = coalesce(nullif(trim(p->>'unidade_compra'), ''), unidade_compra),
      fator_compra = coalesce(nullif(p->>'fator_compra', '')::numeric, fator_compra),
      observacao = coalesce(nullif(trim(p->>'observacao'), ''), observacao)
    where id = v_id;
  else
    update est_itens set
      codigo = v_codigo, nome = trim(p->>'nome'), tipo = v_tipo, controla_estoque = v_ctl,
      unidade = coalesce(nullif(trim(p->>'unidade'), ''), unidade),
      estoque_minimo = coalesce(nullif(p->>'estoque_minimo', '')::numeric, 0),
      preco_venda = nullif(p->>'preco_venda', '')::numeric, custo = nullif(p->>'custo', '')::numeric,
      markup = nullif(p->>'markup', '')::numeric, ncm = nullif(regexp_replace(coalesce(p->>'ncm', ''), '\D', '', 'g'), ''),
      codigo_barras = nullif(trim(p->>'codigo_barras'), ''), grupo_id = v_grupo, marca = nullif(trim(p->>'marca'), ''),
      unidade_compra = nullif(trim(p->>'unidade_compra'), ''), fator_compra = coalesce(nullif(p->>'fator_compra', '')::numeric, 1),
      categoria_receita_id = nullif(p->>'categoria_receita', '')::uuid, categoria_despesa_id = nullif(p->>'categoria_despesa', '')::uuid,
      observacao = nullif(trim(p->>'observacao'), ''), foto_caminho = nullif(p->>'foto_caminho', ''),
      ativo = coalesce(nullif(p->>'ativo', '')::boolean, ativo)
    where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function app.est_item_gravar(uuid, jsonb, uuid, boolean) from public, anon, authenticated;

/**
 * Salva um item pelo assistente ou pelo cadastro rápido (tudo ou nada: grupo novo, item e saldo inicial).
 * p: id (edição), cliente, nome, codigo, tipo, unidade, controla_estoque, estoque_minimo, preco_venda, custo, markup,
 * ncm, codigo_barras, grupo | grupo_nome, marca, unidade_compra, fator_compra, categoria_receita, categoria_despesa,
 * observacao, foto_caminho, ativo, saldo_inicial, local, data.
 */
create or replace function public.est_salvar_item(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cliente uuid := (p->>'cliente')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_org uuid; v_antes jsonb;
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para cadastrar itens desta empresa'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Dê um nome ao item'; end if;
  if v_id is not null then
    select to_jsonb(i) into v_antes from est_itens i where id = v_id and cliente_id = v_cliente;
    if v_antes is null then raise exception 'Item não encontrado nesta empresa'; end if;
  end if;
  perform set_config('app.fin_interno', '1', true);
  v_id := app.est_item_gravar(v_cliente, p, v_id, false);
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(v_org, 'financeiro', case when v_antes is null then 'item_incluir' else 'item_alterar' end, v_id::text,
    v_antes, (select to_jsonb(i) from est_itens i where id = v_id));
  return v_id;
end $$;
revoke all on function public.est_salvar_item(jsonb) from public, anon;
grant execute on function public.est_salvar_item(jsonb) to authenticated;
comment on function public.est_salvar_item(jsonb) is 'Cadastra ou altera um item (assistente/cadastro rápido), com grupo novo e saldo inicial na mesma transação.';

/**
 * Importa itens de uma planilha já conferida na tela (tudo ou nada). Cada linha acha o item pelo código ou, sem
 * código, pelo nome; achou = atualiza só os campos preenchidos; não achou = cadastra (com saldo inicial, se houver).
 */
create or replace function public.est_importar_itens(p_cliente uuid, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; e jsonb; v_id uuid; v_novos int := 0; v_atual int := 0; v_saldos int := 0; k int := 0;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(p_cliente, 'operar') then raise exception 'Sem permissão para cadastrar itens desta empresa'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'A planilha não tem itens'; end if;
  if jsonb_array_length(p_itens) > 5000 then raise exception 'Importe no máximo 5.000 itens por vez'; end if;
  perform set_config('app.fin_interno', '1', true);
  for e in select * from jsonb_array_elements(p_itens) loop
    k := k + 1;
    if coalesce(trim(e->>'nome'), '') = '' and coalesce(trim(e->>'codigo'), '') = '' then
      raise exception 'Linha %: sem nome e sem código', k;
    end if;
    v_id := null;
    if nullif(trim(e->>'codigo'), '') is not null then
      select id into v_id from est_itens where cliente_id = p_cliente and codigo = trim(e->>'codigo');
    end if;
    if v_id is null and nullif(trim(e->>'nome'), '') is not null then
      select id into v_id from est_itens where cliente_id = p_cliente and lower(nome) = lower(trim(e->>'nome')) order by ativo desc, criado_em limit 1;
    end if;
    if v_id is null then
      if coalesce(trim(e->>'nome'), '') = '' then raise exception 'Linha %: item novo precisa de nome', k; end if;
      perform app.est_item_gravar(p_cliente, e, null, false);
      v_novos := v_novos + 1;
      if coalesce(nullif(e->>'saldo_inicial', '')::numeric, 0) <> 0 then v_saldos := v_saldos + 1; end if;
    else
      perform app.est_item_gravar(p_cliente, e - 'saldo_inicial', v_id, true);
      v_atual := v_atual + 1;
    end if;
  end loop;
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(v_org, 'financeiro', 'itens_importar', p_cliente::text, null,
    jsonb_build_object('linhas', k, 'novos', v_novos, 'atualizados', v_atual, 'saldos_iniciais', v_saldos));
  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'saldos', v_saldos);
end $$;
revoke all on function public.est_importar_itens(uuid, jsonb) from public, anon;
grant execute on function public.est_importar_itens(uuid, jsonb) to authenticated;
comment on function public.est_importar_itens(uuid, jsonb) is 'Importa itens de planilha (acha pelo código ou nome; atualiza ou cadastra). Tudo ou nada; fica na auditoria.';

-- ------------------------------------------------------------------------------------- inventário guiado
/**
 * Inventário de vários itens de uma vez num estoque: p = {local, data, observacao, itens: [{item, contado}]}.
 * Para cada item, lança a diferença entre o contado e o saldo do sistema (itens iguais são pulados). Tudo ou nada.
 */
create or replace function public.est_inventario(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_local est_locais; e jsonb; i est_itens; v_qtd numeric; v_saldo numeric; v_grupo uuid := gen_random_uuid();
  v_ids bigint[] := '{}'; v_iguais int := 0;
begin
  select * into v_local from est_locais where id = (p->>'local')::uuid;
  if v_local.id is null or not v_local.ativo then raise exception 'Estoque (local) não encontrado ou inativo'; end if;
  if not app.fin_pode(v_local.cliente_id, 'operar') then raise exception 'Sem permissão para lançar inventário nesta empresa'; end if;
  if jsonb_typeof(p->'itens') <> 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'Informe a contagem de pelo menos um item'; end if;
  -- itens em ordem de id: duas contagens ao mesmo tempo travam na mesma ordem
  for e in select x from jsonb_array_elements(p->'itens') x order by x->>'item' loop
    v_qtd := round((e->>'contado')::numeric, 4);
    if v_qtd is null or v_qtd < 0 then raise exception 'A quantidade contada não pode ficar em branco nem ser negativa'; end if;
    select * into i from est_itens where id = (e->>'item')::uuid and cliente_id = v_local.cliente_id for update;
    if i.id is null then raise exception 'Item não encontrado nesta empresa'; end if;
    select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = i.id and local_id = v_local.id and not estornado;
    if v_qtd = v_saldo then v_iguais := v_iguais + 1; continue; end if;
    v_ids := v_ids || app.est_gravar(i.id, v_local.id, nullif(p->>'data', '')::date, 'ajuste', v_qtd - v_saldo, null, 'manual', null, v_grupo,
      coalesce(nullif(trim(p->>'observacao'), ''), 'Inventário') || format(' (contado %s, sistema %s)', v_qtd, v_saldo));
  end loop;
  perform app.registrar(v_local.org_id, 'financeiro', 'estoque_inventario', v_local.id::text, null,
    p || jsonb_build_object('movimentos', to_jsonb(v_ids), 'iguais', v_iguais));
  return jsonb_build_object('ajustados', coalesce(array_length(v_ids, 1), 0), 'iguais', v_iguais, 'movimentos', to_jsonb(v_ids));
end $$;
revoke all on function public.est_inventario(jsonb) from public, anon;
grant execute on function public.est_inventario(jsonb) to authenticated;
comment on function public.est_inventario(jsonb) is 'Inventário de vários itens num estoque: lança a diferença entre o contado e o sistema (tudo ou nada).';

-- ------------------------------------------------------------------------------------- pedidos
/** Valor em reais para as mensagens de erro: 1234.5 → "R$ 1.234,50" (independe do idioma do servidor). */
create or replace function app.brl(v numeric)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;
revoke all on function app.brl(numeric) from public, anon, authenticated;

create table if not exists public.est_pedidos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tipo text not null check (tipo in ('venda', 'compra')),
  numero integer not null check (numero > 0),
  pessoa_id uuid references public.fin_pessoas(id) on delete restrict,
  data date not null,
  previsao date,
  local_id uuid references public.est_locais(id) on delete restrict,
  categoria_id uuid references public.fin_categorias(id) on delete restrict,
  centro_id uuid references public.fin_centros_custo(id) on delete restrict,
  total_itens numeric(15, 2) not null default 0 check (total_itens >= 0),
  desconto numeric(15, 2) not null default 0 check (desconto >= 0),
  frete numeric(15, 2) not null default 0 check (frete >= 0),
  total numeric(15, 2) not null default 0 check (total >= 0),
  condicao text,
  forma_pagamento text,
  parcelas jsonb not null default '[]'::jsonb,
  documento text,
  observacao text,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'confirmado', 'faturado', 'recebido', 'cancelado')),
  lancado_em timestamptz,
  lancado_por uuid,
  cancelado_em timestamptz,
  cancelado_motivo text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  unique (cliente_id, tipo, numero),
  constraint est_pedidos_situacao_tipo check ((tipo = 'venda' and situacao <> 'recebido') or (tipo = 'compra' and situacao <> 'faturado'))
);
create index if not exists est_pedidos_cliente_data on public.est_pedidos (cliente_id, tipo, data);
comment on table public.est_pedidos is
  'Pedidos de venda e de compra. Venda: rascunho → confirmado (baixa estoque + contas a receber) → faturado. Compra: rascunho → confirmado (aguardando) → recebido (entrada no estoque + contas a pagar). Cancelar estorna. Grava só pelas funções est_pedido_*.';
comment on column public.est_pedidos.parcelas is 'Condição de pagamento: [{numero, vencimento, valor}], soma = total. Vira contas a receber/pagar ao lançar.';
comment on column public.est_pedidos.lancado_em is 'Quando o estoque e o financeiro do pedido foram lançados (venda confirmada ou compra recebida).';

create table if not exists public.est_pedido_itens (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  pedido_id uuid not null references public.est_pedidos(id) on delete restrict,
  ordem integer not null,
  item_id uuid not null references public.est_itens(id) on delete restrict,
  descricao text not null,
  unidade text not null,
  fator numeric(15, 6) not null default 1 check (fator > 0),
  quantidade numeric(15, 4) not null check (quantidade > 0),
  preco_unitario numeric(15, 4) not null check (preco_unitario >= 0),
  desconto numeric(15, 2) not null default 0 check (desconto >= 0),
  total numeric(15, 2) not null check (total >= 0),
  custo_unitario numeric(15, 4),
  movimento_id bigint references public.est_movimentos(id) on delete restrict,
  removido boolean not null default false
);
create index if not exists est_pedido_itens_pedido on public.est_pedido_itens (pedido_id, ordem) where not removido;
create index if not exists est_pedido_itens_item on public.est_pedido_itens (item_id) where not removido;
comment on table public.est_pedido_itens is
  'Linhas do pedido. fator = unidades de estoque por unidade da linha (compra em CX). custo_unitario: venda = custo médio na baixa; compra = custo por unidade de estoque lançado (com rateio de frete e desconto). Linha trocada no rascunho fica removido = true (não se apaga).';

create table if not exists public.est_pedido_titulos (
  titulo_id uuid primary key references public.fin_titulos(id) on delete restrict,
  pedido_id uuid not null references public.est_pedidos(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict
);
create index if not exists est_pedido_titulos_pedido on public.est_pedido_titulos (pedido_id);
comment on table public.est_pedido_titulos is 'Contas a receber/pagar geradas por cada pedido (para mostrar a origem e cancelar junto).';

do $$
declare t text;
begin
  foreach t in array array['est_grupos', 'est_pedidos', 'est_pedido_itens', 'est_pedido_titulos'] loop
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_cliente_mesma_org()', t);
    execute format('drop trigger if exists sem_troca_empresa on public.%I', t);
    execute format('create trigger sem_troca_empresa before update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_fin_sem_troca_empresa()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists est_ver on public.%I', t);
    execute format('create policy est_ver on public.%I for select to authenticated using (app.fin_pode(cliente_id, ''ver''))', t);
  end loop;
end $$;
-- grupos: gravação direta pela tela (operar), com auditoria; pedidos e linhas só pelas funções abaixo
drop trigger if exists fin_auditar on public.est_grupos;
create trigger fin_auditar after insert or update on public.est_grupos for each row execute function app.tg_fin_auditar();
drop policy if exists est_incluir on public.est_grupos;
create policy est_incluir on public.est_grupos for insert to authenticated with check (app.fin_pode(cliente_id, 'operar'));
drop policy if exists est_alterar on public.est_grupos;
create policy est_alterar on public.est_grupos for update to authenticated
  using (app.fin_pode(cliente_id, 'operar')) with check (app.fin_pode(cliente_id, 'operar'));

/** "Pedido de venda nº 12" */
create or replace function app.est_pedido_nome(p est_pedidos)
returns text language sql immutable set search_path = public as $$
  select case p.tipo when 'venda' then 'Pedido de venda' else 'Pedido de compra' end || ' nº ' || p.numero
$$;
revoke all on function app.est_pedido_nome(est_pedidos) from public, anon, authenticated;

/**
 * Cria ou altera um pedido em rascunho (compra também enquanto aguarda entrega). Tudo ou nada.
 * p: id, cliente, tipo, pessoa | pessoa_nome, data, previsao, local, categoria, centro, desconto, frete, condicao,
 * forma_pagamento, documento, observacao, itens [{item, quantidade, preco_unitario, desconto, em_unidade_compra}],
 * parcelas [{vencimento, valor}] (vazio = à vista na data do pedido).
 */
create or replace function public.est_pedido_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := (p->>'cliente')::uuid; v_org uuid; v_tipo text := p->>'tipo'; v_id uuid := nullif(p->>'id', '')::uuid;
  ped est_pedidos; v_antes jsonb; v_pessoa uuid := nullif(p->>'pessoa', '')::uuid; v_nome text := nullif(trim(p->>'pessoa_nome'), '');
  v_local uuid := nullif(p->>'local', '')::uuid; v_cat uuid := nullif(p->>'categoria', '')::uuid; v_centro uuid := nullif(p->>'centro', '')::uuid;
  v_data date := coalesce(nullif(p->>'data', '')::date, null); e jsonb; i est_itens; k int := 0; v_q numeric; v_preco numeric; v_desc numeric;
  v_fator numeric; v_un text; v_tot_linha numeric; v_itens numeric := 0; v_total numeric; v_desc_ped numeric; v_frete numeric;
  v_parc jsonb := '[]'::jsonb; v_soma numeric := 0; v_num int; v_ptipo text;
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para lançar pedidos desta empresa'; end if;
  if v_tipo not in ('venda', 'compra') then raise exception 'Tipo de pedido inválido'; end if;
  if v_data is null then v_data := app.hoje(v_org); end if;

  if v_id is not null then
    select * into ped from est_pedidos where id = v_id for update;
    if ped.id is null or ped.cliente_id <> v_cliente or ped.tipo <> v_tipo then raise exception 'Pedido não encontrado'; end if;
    if not (ped.situacao = 'rascunho' or (ped.tipo = 'compra' and ped.situacao = 'confirmado')) then
      raise exception 'Este pedido já foi lançado e não pode ser alterado; cancele e faça outro (ou use Duplicar)';
    end if;
    v_antes := to_jsonb(ped) || jsonb_build_object('itens', (select jsonb_agg(to_jsonb(l) order by l.ordem) from est_pedido_itens l where l.pedido_id = v_id and not l.removido));
  end if;

  -- cliente/fornecedor: pelo id ou pelo nome digitado (acha ou cadastra, na mesma transação)
  v_ptipo := case v_tipo when 'venda' then 'cliente' else 'fornecedor' end;
  if v_pessoa is not null and not exists (select 1 from fin_pessoas where id = v_pessoa and cliente_id = v_cliente) then
    raise exception 'Cliente/fornecedor não encontrado nesta empresa';
  end if;
  if v_pessoa is null and v_nome is not null then
    select id into v_pessoa from fin_pessoas where cliente_id = v_cliente and lower(nome) = lower(v_nome) order by ativo desc, criado_em limit 1;
    if v_pessoa is null then
      insert into fin_pessoas (org_id, cliente_id, tipo, nome) values (v_org, v_cliente, v_ptipo, v_nome) returning id into v_pessoa;
    end if;
  end if;
  if v_local is not null and not exists (select 1 from est_locais where id = v_local and cliente_id = v_cliente and ativo) then
    raise exception 'Estoque (local) não encontrado ou inativo';
  end if;
  if v_cat is not null and not exists (select 1 from fin_categorias where id = v_cat and cliente_id = v_cliente
                                         and tipo = case v_tipo when 'venda' then 'receita' else 'despesa' end) then
    raise exception 'A categoria do pedido de % precisa ser uma % desta empresa', v_tipo, case v_tipo when 'venda' then 'receita' else 'despesa' end;
  end if;
  if v_centro is not null and not exists (select 1 from fin_centros_custo where id = v_centro and cliente_id = v_cliente) then
    raise exception 'Centro de custo não encontrado nesta empresa';
  end if;
  v_desc_ped := round(coalesce(nullif(p->>'desconto', '')::numeric, 0), 2);
  v_frete := round(coalesce(nullif(p->>'frete', '')::numeric, 0), 2);
  if v_desc_ped < 0 or v_frete < 0 then raise exception 'Desconto e frete não podem ser negativos'; end if;
  if jsonb_typeof(p->'itens') is distinct from 'array' or jsonb_array_length(p->'itens') = 0 then
    raise exception 'Inclua pelo menos um item no pedido';
  end if;

  if v_id is null then
    -- número sequencial por empresa e tipo (trava para dois pedidos ao mesmo tempo não pegarem o mesmo número)
    perform pg_advisory_xact_lock(hashtext('est_pedido:' || v_cliente::text || ':' || v_tipo));
    select coalesce(max(numero), 0) + 1 into v_num from est_pedidos where cliente_id = v_cliente and tipo = v_tipo;
    insert into est_pedidos (org_id, cliente_id, tipo, numero, data, criado_por) values (v_org, v_cliente, v_tipo, v_num, v_data, auth.uid())
    returning * into ped;
    v_id := ped.id;
  else
    update est_pedido_itens set removido = true where pedido_id = v_id and not removido;
  end if;

  for e in select * from jsonb_array_elements(p->'itens') loop
    k := k + 1;
    select * into i from est_itens where id = (e->>'item')::uuid and cliente_id = v_cliente;
    if i.id is null then raise exception 'Item % do pedido não encontrado nesta empresa', k; end if;
    if not i.ativo then raise exception 'O item "%" está inativo; reative no cadastro ou tire do pedido', i.nome; end if;
    v_q := round((e->>'quantidade')::numeric, 4);
    v_preco := round(coalesce(nullif(e->>'preco_unitario', '')::numeric, 0), 4);
    v_desc := round(coalesce(nullif(e->>'desconto', '')::numeric, 0), 2);
    if v_q is null or v_q <= 0 then raise exception 'Informe a quantidade de "%"', i.nome; end if;
    if v_preco < 0 or v_desc < 0 then raise exception 'Preço e desconto de "%" não podem ser negativos', i.nome; end if;
    if coalesce((e->>'em_unidade_compra')::boolean, false) and i.unidade_compra is not null then
      v_un := i.unidade_compra; v_fator := i.fator_compra;
    else
      v_un := i.unidade; v_fator := 1;
    end if;
    v_tot_linha := round(v_q * v_preco, 2) - v_desc;
    if v_tot_linha < 0 then raise exception 'O desconto de "%" é maior que o valor da linha', i.nome; end if;
    insert into est_pedido_itens (org_id, cliente_id, pedido_id, ordem, item_id, descricao, unidade, fator, quantidade, preco_unitario, desconto, total)
    values (v_org, v_cliente, v_id, k, i.id, i.nome, v_un, v_fator, v_q, v_preco, v_desc, v_tot_linha);
    v_itens := v_itens + v_tot_linha;
  end loop;
  v_total := v_itens - v_desc_ped + v_frete;
  if v_total < 0 then raise exception 'O desconto do pedido é maior que o valor dos itens'; end if;

  -- parcelas: vazio = uma só, na data do pedido; a soma precisa bater com o total
  if v_total > 0 then
    if jsonb_typeof(p->'parcelas') = 'array' and jsonb_array_length(p->'parcelas') > 0 then
      k := 0;
      for e in select * from jsonb_array_elements(p->'parcelas') loop
        k := k + 1;
        if nullif(e->>'vencimento', '') is null then raise exception 'Informe o vencimento da parcela %', k; end if;
        if coalesce(round((e->>'valor')::numeric, 2), 0) <= 0 then raise exception 'A parcela % precisa ter valor maior que zero', k; end if;
        v_soma := v_soma + round((e->>'valor')::numeric, 2);
        v_parc := v_parc || jsonb_build_object('numero', k, 'vencimento', (e->>'vencimento')::date, 'valor', round((e->>'valor')::numeric, 2));
      end loop;
      if k > 120 then raise exception 'No máximo 120 parcelas'; end if;
      if v_soma <> v_total then
        raise exception 'As parcelas somam %, mas o pedido dá %; ajuste os valores', app.brl(v_soma), app.brl(v_total);
      end if;
    else
      v_parc := jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', v_data, 'valor', v_total));
    end if;
  end if;

  update est_pedidos set
    pessoa_id = v_pessoa, data = v_data, previsao = nullif(p->>'previsao', '')::date,
    local_id = coalesce(v_local, (select id from est_locais where cliente_id = v_cliente and padrao and ativo)),
    categoria_id = v_cat, centro_id = v_centro, total_itens = v_itens, desconto = v_desc_ped, frete = v_frete, total = v_total,
    condicao = nullif(trim(p->>'condicao'), ''), forma_pagamento = nullif(trim(p->>'forma_pagamento'), ''), parcelas = v_parc,
    documento = nullif(trim(p->>'documento'), ''), observacao = nullif(trim(p->>'observacao'), ''),
    atualizado_em = case when v_antes is null then null else now() end
  where id = v_id
  returning * into ped;

  perform app.registrar(v_org, 'financeiro', case when v_antes is null then 'pedido_incluir' else 'pedido_alterar' end, v_id::text, v_antes,
    to_jsonb(ped) || jsonb_build_object('itens', (select jsonb_agg(to_jsonb(l) order by l.ordem) from est_pedido_itens l where l.pedido_id = v_id and not l.removido)));
  return jsonb_build_object('id', v_id, 'numero', ped.numero, 'total', ped.total);
end $$;
revoke all on function public.est_pedido_salvar(jsonb) from public, anon;
grant execute on function public.est_pedido_salvar(jsonb) to authenticated;
comment on function public.est_pedido_salvar(jsonb) is 'Cria/altera pedido em rascunho (itens, totais, parcelas); cliente/fornecedor novo cadastrado junto. Tudo ou nada.';

/**
 * Lança o estoque e o financeiro de um pedido travado (uso interno): venda = saída (app.est_saida) dos itens
 * estocáveis + contas a receber; compra = entrada com custo (app.est_gravar, rateando frete e desconto) + contas a
 * pagar. Serviço e item que não controla estoque não mexem no estoque. Parcelas viram títulos por public.fin_lancar.
 */
create or replace function app.est_pedido_lancar(p_pedido uuid, p_data date, p_pago jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  ped est_pedidos; l record; v_mov bigint; v_custo numeric; v_ajuste numeric; v_nome text; v_pessoa text; e jsonb; n int; r jsonb;
  v_tit text; v_data date;
begin
  select * into ped from est_pedidos where id = p_pedido;
  v_nome := app.est_pedido_nome(ped);
  v_data := coalesce(p_data, ped.data);
  if exists (select 1 from est_pedido_itens pl join est_itens it on it.id = pl.item_id
              where pl.pedido_id = ped.id and not pl.removido and it.controla_estoque) and ped.local_id is null then
    raise exception 'Escolha o estoque (local) de onde os produtos % ', case ped.tipo when 'venda' then 'saem' else 'entram' end;
  end if;
  v_ajuste := ped.frete - ped.desconto;   -- compra: frete soma e desconto do pedido abate no custo, proporcional a cada linha

  -- linhas em ordem de item: duas confirmações ao mesmo tempo travam os itens na mesma ordem (sem impasse)
  for l in select pl.*, i.controla_estoque, i.custo_medio, i.custo as custo_item
             from est_pedido_itens pl join est_itens i on i.id = pl.item_id
            where pl.pedido_id = ped.id and not pl.removido order by pl.item_id, pl.ordem loop
    v_mov := null;
    if ped.tipo = 'venda' then
      v_mov := app.est_saida(l.item_id, ped.local_id, v_data, l.quantidade * l.fator, 'pedido_venda', ped.id::text);
      v_custo := coalesce((select custo_medio from est_itens where id = l.item_id), l.custo_item);
    else
      v_custo := round((l.total + case when ped.total_itens > 0 then v_ajuste * l.total / ped.total_itens else 0 end) / (l.quantidade * l.fator), 4);
      if v_custo < 0 then v_custo := 0; end if;
      if l.controla_estoque then
        v_mov := app.est_gravar(l.item_id, ped.local_id, v_data, 'entrada', l.quantidade * l.fator, v_custo, 'pedido_compra', ped.id::text, null, v_nome);
      end if;
    end if;
    if v_mov is not null and ped.tipo = 'venda' then
      update est_movimentos set observacao = v_nome where id = v_mov;
    end if;
    update est_pedido_itens set movimento_id = v_mov, custo_unitario = v_custo where id = l.id;
  end loop;

  -- financeiro: uma conta a receber/pagar por parcela, pela função comum do Financeiro
  if ped.total > 0 then
    if ped.categoria_id is null then
      raise exception 'Escolha a categoria do pedido (%) para gerar as contas a %',
        case ped.tipo when 'venda' then 'receita, ex.: Venda de mercadorias' else 'despesa, ex.: Compra de mercadorias' end,
        case ped.tipo when 'venda' then 'receber' else 'pagar' end;
    end if;
    select nome into v_pessoa from fin_pessoas where id = ped.pessoa_id;
    n := jsonb_array_length(ped.parcelas);
    for e in select * from jsonb_array_elements(ped.parcelas) loop
      r := public.fin_lancar(jsonb_build_object(
        'cliente', ped.cliente_id, 'tipo', case ped.tipo when 'venda' then 'receber' else 'pagar' end,
        'pessoa', ped.pessoa_id, 'categoria', ped.categoria_id, 'centro', ped.centro_id,
        'descricao', v_nome || coalesce(' · ' || v_pessoa, '') || case when n > 1 then format(' (%s/%s)', e->>'numero', n) else '' end,
        'documento', coalesce(ped.documento, case ped.tipo when 'venda' then 'PV ' else 'PC ' end || ped.numero),
        'emissao', ped.data, 'vencimento', e->>'vencimento', 'valor', (e->>'valor')::numeric, 'parcelas', 1,
        'observacao', ped.observacao, 'pago', p_pago));
      for v_tit in select jsonb_array_elements_text(r->'titulos') loop
        insert into est_pedido_titulos (titulo_id, pedido_id, org_id, cliente_id) values (v_tit::uuid, ped.id, ped.org_id, ped.cliente_id);
      end loop;
    end loop;
  end if;
  update est_pedidos set lancado_em = now(), lancado_por = auth.uid() where id = ped.id;
end $$;
revoke all on function app.est_pedido_lancar(uuid, date, jsonb) from public, anon, authenticated;

/** Trava o pedido e confere acesso (uso interno das ações). */
create or replace function app.est_pedido_travar(p_pedido uuid)
returns est_pedidos language plpgsql security definer set search_path = public as $$
declare ped est_pedidos;
begin
  select * into ped from est_pedidos where id = p_pedido for update;
  if ped.id is null then raise exception 'Pedido não encontrado'; end if;
  if not app.fin_pode(ped.cliente_id, 'operar') then raise exception 'Sem permissão para mexer nos pedidos desta empresa'; end if;
  return ped;
end $$;
revoke all on function app.est_pedido_travar(uuid) from public, anon, authenticated;

/**
 * Confirma o pedido. Venda: dá baixa no estoque dos itens estocáveis e gera as contas a receber (p.pago = {data,
 * conta, forma} marca como já recebido). Compra: só registra que foi enviado ao fornecedor (aguardando entrega).
 */
create or replace function public.est_pedido_confirmar(p_pedido uuid, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ped est_pedidos;
begin
  ped := app.est_pedido_travar(p_pedido);
  if ped.situacao <> 'rascunho' then raise exception 'Só pedido em rascunho pode ser confirmado'; end if;
  if ped.tipo = 'venda' then
    perform app.est_pedido_lancar(ped.id, nullif(p->>'data', '')::date, case when jsonb_typeof(p->'pago') = 'object' then p->'pago' end);
  end if;
  update est_pedidos set situacao = 'confirmado' where id = ped.id returning * into ped;
  perform app.registrar(ped.org_id, 'financeiro', 'pedido_confirmar', ped.id::text, null, coalesce(p, '{}'::jsonb) || jsonb_build_object('numero', ped.numero, 'tipo', ped.tipo));
  return jsonb_build_object('id', ped.id, 'situacao', ped.situacao,
    'titulos', (select coalesce(jsonb_agg(titulo_id), '[]'::jsonb) from est_pedido_titulos where pedido_id = ped.id));
end $$;
revoke all on function public.est_pedido_confirmar(uuid, jsonb) from public, anon;
grant execute on function public.est_pedido_confirmar(uuid, jsonb) to authenticated;
comment on function public.est_pedido_confirmar(uuid, jsonb) is 'Confirma o pedido: venda baixa o estoque e gera contas a receber; compra fica aguardando entrega. Tudo ou nada.';

/** Recebe a mercadoria do pedido de compra: entrada no estoque com custo (custo médio atualizado) + contas a pagar. */
create or replace function public.est_pedido_receber(p_pedido uuid, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ped est_pedidos;
begin
  ped := app.est_pedido_travar(p_pedido);
  if ped.tipo <> 'compra' then raise exception 'Só pedido de compra é recebido'; end if;
  if ped.situacao not in ('rascunho', 'confirmado') then raise exception 'Este pedido já foi recebido ou cancelado'; end if;
  if nullif(p->>'documento', '') is not null then update est_pedidos set documento = trim(p->>'documento') where id = ped.id; end if;
  perform app.est_pedido_lancar(ped.id, nullif(p->>'data', '')::date, case when jsonb_typeof(p->'pago') = 'object' then p->'pago' end);
  update est_pedidos set situacao = 'recebido' where id = ped.id returning * into ped;
  perform app.registrar(ped.org_id, 'financeiro', 'pedido_receber', ped.id::text, null, coalesce(p, '{}'::jsonb) || jsonb_build_object('numero', ped.numero));
  return jsonb_build_object('id', ped.id, 'situacao', ped.situacao,
    'titulos', (select coalesce(jsonb_agg(titulo_id), '[]'::jsonb) from est_pedido_titulos where pedido_id = ped.id));
end $$;
revoke all on function public.est_pedido_receber(uuid, jsonb) from public, anon;
grant execute on function public.est_pedido_receber(uuid, jsonb) to authenticated;
comment on function public.est_pedido_receber(uuid, jsonb) is 'Recebe a compra: entrada no estoque com custo (custo médio) e contas a pagar. Tudo ou nada.';

/** Marca a venda confirmada como faturada (nota emitida), guardando o número da nota. */
create or replace function public.est_pedido_faturar(p_pedido uuid, p_documento text)
returns void language plpgsql security definer set search_path = public as $$
declare ped est_pedidos;
begin
  ped := app.est_pedido_travar(p_pedido);
  if ped.tipo <> 'venda' then raise exception 'Só pedido de venda é faturado'; end if;
  if ped.situacao <> 'confirmado' then raise exception 'Confirme o pedido antes de faturar'; end if;
  update est_pedidos set situacao = 'faturado', documento = coalesce(nullif(trim(p_documento), ''), documento) where id = ped.id;
  perform app.registrar(ped.org_id, 'financeiro', 'pedido_faturar', ped.id::text, null, jsonb_build_object('documento', p_documento, 'numero', ped.numero));
end $$;
revoke all on function public.est_pedido_faturar(uuid, text) from public, anon;
grant execute on function public.est_pedido_faturar(uuid, text) to authenticated;
comment on function public.est_pedido_faturar(uuid, text) is 'Marca a venda confirmada como faturada (número da nota).';

/**
 * Cancela o pedido com motivo: estorna os movimentos de estoque dele (marca, não apaga) e cancela as contas em aberto.
 * Recusa se alguma parcela já tem pagamento/recebimento, ou se estornar a entrada da compra deixaria o estoque
 * negativo (os produtos já saíram). Tudo ou nada.
 */
create or replace function public.est_pedido_cancelar(p_pedido uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ped est_pedidos; t record; m record; v_neg boolean; v_saldo numeric; v_nome text; v_motivo text := trim(p_motivo);
  v_fin text := current_setting('app.fin_interno', true);
begin
  ped := app.est_pedido_travar(p_pedido);
  if ped.situacao = 'cancelado' then raise exception 'Este pedido já está cancelado'; end if;
  if coalesce(v_motivo, '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  v_nome := app.est_pedido_nome(ped);

  for t in select ft.* from fin_titulos ft join est_pedido_titulos pt on pt.titulo_id = ft.id
            where pt.pedido_id = ped.id order by ft.vencimento for update of ft loop
    if t.valor_pago > 0 then
      raise exception 'Não dá para cancelar: a parcela de % (vencimento %) já tem % registrado. Estorne o % em Contas a % e tente de novo',
        app.brl(t.valor), to_char(t.vencimento, 'DD/MM/YYYY'),
        case t.tipo when 'receber' then 'recebimento' else 'pagamento' end,
        case t.tipo when 'receber' then 'recebimento' else 'pagamento' end,
        case t.tipo when 'receber' then 'receber' else 'pagar' end;
    end if;
  end loop;

  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = ped.cliente_id), false);
  for m in select mv.*, i.nome as item_nome, i.unidade from est_movimentos mv join est_itens i on i.id = mv.item_id
            where mv.origem = 'pedido_' || ped.tipo and mv.origem_id = ped.id::text and not mv.estornado
            order by mv.item_id, mv.id loop
    perform 1 from est_itens where id = m.item_id for update;
    if m.quantidade > 0 and not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = m.item_id and local_id = m.local_id and not estornado;
      if v_saldo - m.quantidade < 0 then
        raise exception 'Não dá para cancelar: parte de "%" desta compra já saiu do estoque (saldo %, a compra trouxe %). Lance a devolução ou um ajuste antes',
          m.item_nome, trim(to_char(v_saldo, 'FM999999990.####')), trim(to_char(m.quantidade, 'FM999999990.####'));
      end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = 'Cancelamento do ' || v_nome || ': ' || v_motivo
     where id = m.id;
    perform app.est_recalcular(m.item_id, m.data);
  end loop;

  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set situacao = 'cancelado', cancelado_motivo = 'Cancelamento do ' || v_nome || ': ' || v_motivo
   where id in (select titulo_id from est_pedido_titulos where pedido_id = ped.id) and situacao = 'aberto';
  update est_pedidos set situacao = 'cancelado', cancelado_em = now(), cancelado_motivo = v_motivo where id = ped.id;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  perform app.registrar(ped.org_id, 'financeiro', 'pedido_cancelar', ped.id::text, to_jsonb(ped), jsonb_build_object('motivo', v_motivo));
end $$;
revoke all on function public.est_pedido_cancelar(uuid, text) from public, anon;
grant execute on function public.est_pedido_cancelar(uuid, text) to authenticated;
comment on function public.est_pedido_cancelar(uuid, text) is 'Cancela o pedido: estorna o estoque e cancela as contas em aberto; recusa se já houve pagamento. Tudo ou nada.';

-- ------------------------------------------------------------------------------------- fotos dos itens (Storage)
-- Pasta <org>/estoque/<cliente>/: o cliente no Portal com a permissão financeiro também vê e envia fotos dos itens dele.
-- A equipe já tem acesso à pasta da organização pelas políticas da 020. Sem storage (teste local), não faz nada.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists est_fotos_ver on storage.objects';
    execute $p$create policy est_fotos_ver on storage.objects for select to authenticated
      using (bucket_id = 'hub-arquivos' and (storage.foldername(name))[2] = 'estoque'
             and app.fin_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'ver'))$p$;
    execute 'drop policy if exists est_fotos_enviar on storage.objects';
    execute $p$create policy est_fotos_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'hub-arquivos' and (storage.foldername(name))[2] = 'estoque'
                  and app.fin_pode(app.uuid_ou_nulo((storage.foldername(name))[3]), 'operar')
                  and lower(name) ~ '\.(jpg|jpeg|png|webp)$')$p$;
  end if;
end $$;
