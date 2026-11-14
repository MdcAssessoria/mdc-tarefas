-- 081 Plano de contas simples do MDC · Pessoal (pedido do Edvaldo, 14/11/2026).
--   O plano da família deixa de imitar o plano do Domínio. Fica uma lista única, só de ENTRADAS e GASTOS, com nomes do
--   dia a dia ("Mercado", "Contas da casa"). Os códigos 1.xx e 2.xx continuam só por dentro e não aparecem na tela.
--   A família criada daqui em diante já nasce com o plano novo (app.pessoal_semear_plano).
--   As organizações que ainda estão com o plano antigo e sem nenhum lançamento são trocadas para o plano novo. Quem já
--   tem lançamento fica como está: o plano não muda por baixo de quem já lançou.
-- O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

-- =========================================================================================== 1 o plano novo
create or replace function app.pessoal_plano_padrao()
returns table (classificacao text, descricao text, analitica boolean) language sql immutable set search_path = '' as $$
  values
    ('1', 'ENTRADAS', false),
    ('1.01', 'Salário', true), ('1.02', 'Renda extra', true), ('1.03', 'Aluguel recebido', true),
    ('1.04', 'Outras entradas', true),
    ('2', 'GASTOS', false),
    ('2.01', 'Moradia', true), ('2.02', 'Contas da casa', true), ('2.03', 'Mercado', true),
    ('2.04', 'Restaurante e delivery', true), ('2.05', 'Transporte', true), ('2.06', 'Saúde', true),
    ('2.07', 'Educação', true), ('2.08', 'Lazer', true), ('2.09', 'Compras pessoais', true),
    ('2.10', 'Cartão e empréstimos', true), ('2.11', 'Impostos e taxas', true), ('2.12', 'Outros gastos', true)
$$;
revoke all on function app.pessoal_plano_padrao() from public, anon, authenticated;
comment on function app.pessoal_plano_padrao() is
  'Plano simples da família: só Entradas (1.xx) e Gastos (2.xx), um nível, nomes do dia a dia (081).';

/** Grava o plano simples e uma categoria por conta (grupo "Entradas" ou "Gastos") para o cliente da família. */
create or replace function app.pessoal_semear_plano(p_org uuid, p_cli uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fin_plano_contas (org_id, cliente_id, codigo, classificacao, descricao, analitica, nivel)
  select p_org, p_cli, row_number() over (order by string_to_array(p.classificacao, '.')::int[])::text,
         p.classificacao, p.descricao, p.analitica, array_length(string_to_array(p.classificacao, '.'), 1)
    from app.pessoal_plano_padrao() p;
  insert into public.fin_categorias (org_id, cliente_id, tipo, grupo, nome, conta_contabil_id)
  select p_org, p_cli,
         case when c.classificacao like '1%' then 'receita' else 'despesa' end,
         case when c.classificacao like '1%' then 'Entradas' else 'Gastos' end,
         c.descricao, c.id
    from public.fin_plano_contas c
   where c.cliente_id = p_cli and c.analitica;
end $$;
revoke all on function app.pessoal_semear_plano(uuid, uuid) from public, anon, authenticated;

-- ======================================================================= 2 a família nova já nasce com ele
create or replace function public.pessoal_criar_familia(p_nome text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_email text; v_pessoa text; v_org uuid; v_cli uuid; v_slug text;
begin
  if v_user is null then raise exception 'Entre na sua conta para criar a família'; end if;
  if v_nome is null or length(v_nome) < 3 then raise exception 'Dê um nome para a família (pelo menos 3 letras)'; end if;
  if length(v_nome) > 80 then raise exception 'O nome da família pode ter no máximo 80 letras'; end if;
  perform pg_advisory_xact_lock(hashtext('pessoal_criar_familia:' || v_user::text));
  if (select count(*) from app.pessoal_entradas where user_id = v_user and como = 'criou') >= 3 then
    raise exception 'Cada conta pode criar no máximo 3 famílias';
  end if;

  select lower(u.email), coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1))
    into v_email, v_pessoa from auth.users u where u.id = v_user;

  v_slug := 'fam-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into organizacoes (nome, slug, tipo, plano, criado_por)
  values (v_nome, v_slug, 'pessoal', 'pessoal', v_user) returning id into v_org;

  insert into clientes (org_id, razao_social, regime) values (v_org, v_nome, 'pf') returning id into v_cli;
  update organizacoes set gestao_cliente_id = v_cli where id = v_org;

  insert into app.pessoal_entradas (org_id, user_id, como) values (v_org, v_user, 'criou');
  insert into membros (org_id, user_id, nome, email, papel) values (v_org, v_user, v_pessoa, v_email, 'admin');
  insert into hub_acessos (org_id, user_id, app, papel)
  select v_org, v_user, a.slug, 'gerir' from hub_apps a where a.slug in ('tarefas', 'financeiro')
  on conflict (org_id, user_id, app) do update set papel = excluded.papel;

  perform app.pessoal_semear_plano(v_org, v_cli);
  -- onde o dinheiro fica: a família já pode pagar e receber em dinheiro; os bancos ela cadastra depois
  insert into fin_contas_bancarias (org_id, cliente_id, nome) values (v_org, v_cli, 'Dinheiro (carteira)');

  perform app.registrar(v_org, 'pessoal', 'familia_criar', v_org::text, null, jsonb_build_object('nome', v_nome));
  return v_slug;
end $$;

-- ================================================== 3 troca o plano antigo de quem ainda não lançou nada
--   Só entra a organização cujo plano é exatamente o plano pessoal antigo (37 contas, com "Tarifas bancárias e
--   juros" em 2.09.01) e que não tem nenhum título. Se algum outro cadastro já usa uma categoria ou conta, a troca
--   dessa organização é desfeita sozinha (o resto segue) e fica um aviso no registro do banco.
do $$
declare r record;
begin
  for r in
    select o.id as org_id, o.gestao_cliente_id as cli
      from public.organizacoes o
     where o.gestao_cliente_id is not null
       and (select count(*) from public.fin_plano_contas p where p.cliente_id = o.gestao_cliente_id) = 37
       and exists (select 1 from public.fin_plano_contas p where p.cliente_id = o.gestao_cliente_id
                    and p.classificacao = '2.09.01' and p.descricao = 'Tarifas bancárias e juros')
       and not exists (select 1 from public.fin_titulos t where t.cliente_id = o.gestao_cliente_id)
  loop
    begin
      delete from public.fin_categorias where cliente_id = r.cli;
      delete from public.fin_plano_contas where cliente_id = r.cli;
      perform app.pessoal_semear_plano(r.org_id, r.cli);
    exception when others then
      raise warning '081: plano da organização % ficou como estava: %', r.org_id, sqlerrm;
    end;
  end loop;
end $$;
