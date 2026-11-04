-- =====================================================================================================
--  055 · Contratos: o cliente/fornecedor do contrato nasce com CNPJ, e-mail e endereço (pedido do Edvaldo, 04/11/2026)
--
--  O campo "Cliente" do Novo contrato só procurava em Fornecedores e clientes (vazio) e, digitado, criava a pessoa só
--  com o nome — sem CNPJ, a NFS-e e o boleto ficavam sem tomador. Agora a tela busca também a carteira da MDC e a
--  Receita, e manda junto `pessoa_dados` {documento, email, telefone, cidade, uf}:
--   - ao criar a pessoa, grava esses dados;
--   - achou a pessoa (pelo CPF/CNPJ primeiro, depois pelo nome), completa só o que estiver em branco (nunca troca);
--   - CPF/CNPJ com tamanho errado é recusado.
--  O resto de app.fin_recorrente_conferir (041) fica igual.
--
--  Testes: supabase/testes/119_base_055.sql e 120_contrato_cliente_055.sql.
-- =====================================================================================================

create or replace function app.fin_recorrente_conferir(p_cliente uuid, p_org uuid, p_tipo text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pessoa uuid := app.uuid_campo(p->>'pessoa', 'fornecedor/cliente'); v_nome text := nullif(trim(p->>'pessoa_nome'), '');
  v_cat uuid := app.uuid_campo(p->>'categoria', 'categoria'); v_tipo_cat text;
  d jsonb := case when jsonb_typeof(p->'pessoa_dados') = 'object' then p->'pessoa_dados' else '{}'::jsonb end;
  v_doc text := nullif(regexp_replace(coalesce(d->>'documento', ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(d->>'email', ''))), '');
  v_tel text := nullif(left(trim(coalesce(d->>'telefone', '')), 30), '');
  v_cidade text := nullif(left(trim(coalesce(d->>'cidade', '')), 80), '');
  v_uf text := nullif(upper(trim(coalesce(d->>'uf', ''))), '');
begin
  select tipo into v_tipo_cat from fin_categorias where id = v_cat and cliente_id = p_cliente and ativo;
  if v_tipo_cat is null then raise exception 'Escolha uma categoria ativa desta empresa'; end if;
  if (p_tipo = 'pagar' and v_tipo_cat <> 'despesa') or (p_tipo = 'receber' and v_tipo_cat <> 'receita') then
    raise exception 'Contrato a pagar usa categoria de despesa; a receber, categoria de receita';
  end if;
  if app.uuid_campo(p->>'centro', 'centro de custo') is not null and not exists (
       select 1 from fin_centros_custo where id = app.uuid_campo(p->>'centro', 'centro de custo') and cliente_id = p_cliente) then
    raise exception 'Centro de custo não encontrado nesta empresa';
  end if;
  if app.uuid_campo(p->>'conta_prevista', 'banco previsto') is not null and not exists (
       select 1 from fin_contas_bancarias where id = app.uuid_campo(p->>'conta_prevista', 'banco previsto') and cliente_id = p_cliente) then
    raise exception 'Conta bancária não encontrada nesta empresa';
  end if;
  if v_doc is not null and length(v_doc) not in (11, 14) then
    raise exception 'CPF (11 números) ou CNPJ (14 números) do % com tamanho errado', case when p_tipo = 'pagar' then 'fornecedor' else 'cliente' end;
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then v_uf := null; end if;

  if v_pessoa is not null then
    if not exists (select 1 from fin_pessoas where id = v_pessoa and cliente_id = p_cliente) then
      raise exception 'Fornecedor/cliente não encontrado nesta empresa';
    end if;
  elsif v_nome is not null then
    if v_doc is not null then
      select id into v_pessoa from fin_pessoas where cliente_id = p_cliente and documento = v_doc order by ativo desc, criado_em limit 1;
    end if;
    if v_pessoa is null then
      select id into v_pessoa from fin_pessoas where cliente_id = p_cliente and lower(nome) = lower(v_nome)
         and (v_doc is null or documento is null) order by ativo desc, criado_em limit 1;
    end if;
    if v_pessoa is null then
      insert into fin_pessoas (org_id, cliente_id, tipo, nome, documento, email, telefone, cidade, uf)
      values (p_org, p_cliente, case when p_tipo = 'pagar' then 'fornecedor' else 'cliente' end, v_nome,
              v_doc, v_email, v_tel, v_cidade, v_uf)
      returning id into v_pessoa;
      return v_pessoa;
    end if;
  else
    raise exception 'Informe o % do contrato', case when p_tipo = 'pagar' then 'fornecedor' else 'cliente' end;
  end if;

  -- pessoa que já existia: completa só o que está em branco (o CPF/CNPJ só se nenhuma outra o usa)
  update fin_pessoas x
     set documento = coalesce(x.documento, case when v_doc is not null and not exists (
                       select 1 from fin_pessoas y where y.cliente_id = p_cliente and y.documento = v_doc and y.id <> x.id) then v_doc end),
         email = coalesce(x.email, v_email), telefone = coalesce(x.telefone, v_tel),
         cidade = coalesce(x.cidade, v_cidade), uf = coalesce(x.uf, v_uf)
   where x.id = v_pessoa
     and (v_doc is not null or v_email is not null or v_tel is not null or v_cidade is not null or v_uf is not null);
  return v_pessoa;
end $$;
revoke all on function app.fin_recorrente_conferir(uuid, uuid, text, jsonb) from public, anon, authenticated;
